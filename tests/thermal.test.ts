import { describe, expect, it } from 'vitest'
import type { ThermalNodeDef, ThermalState } from '../src/rf/types'
import { THERMAL_NODES, damageRate, fanDutyFor, initialThermalState, stepThermal } from '../src/rf/thermal'

const AMBIENT = 25

const nodeById = (id: string): ThermalNodeDef => {
  const node = THERMAL_NODES.find((n) => n.id === id)
  if (node === undefined) throw new Error(`no thermal node ${id}`)
  return node
}
const tempOf = (state: ThermalState, id: string): number => state.temps[id] ?? Number.NaN
const damageOf = (state: ThermalState, id: string): number => state.damage[id] ?? Number.NaN

/** Run the network forward with a constant heat input. */
const run = (
  from: ThermalState,
  powerIn: Record<string, number>,
  seconds: number,
  dt: number,
  allowDamage = false,
): ThermalState => {
  let s = from
  const steps = Math.round(seconds / dt)
  for (let i = 0; i < steps; i += 1) s = stepThermal(s, powerIn, dt, allowDamage)
  return s
}

describe('the network', () => {
  it('has the nodes the rest of the app expects', () => {
    for (const id of ['pa-junction', 'pa-flange', 'pa-heatsink', 'lpf-relay', 'atu-inductor', 'coax-connector', 'balun']) {
      expect(THERMAL_NODES.some((n) => n.id === id)).toBe(true)
    }
  })

  it('runs the heat from the die out through the flange to the heatsink and then to air', () => {
    expect(nodeById('pa-junction').parent).toBe('pa-flange')
    expect(nodeById('pa-flange').parent).toBe('pa-heatsink')
    expect(nodeById('pa-heatsink').parent).toBeNull()
  })

  it('uses the published junction-to-case resistance for the pair', () => {
    // Confirmed: the IC-7300's finals are RD70HVF1, not the RD100HHF1 the
    // internet repeats — Icom's service manual parts list gives RD70HVF1C-121
    // for Q131 and Q132. Rth(ch-c) is 1.0 degC/W per device, two in parallel.
    expect(nodeById('pa-junction').resistanceKPerW).toBeCloseTo(1.0 / 2, 10)
  })

  it('sets the junction damage threshold between the recommended and absolute limits', () => {
    // Confirmed: the RD70HVF1's absolute maximum channel temperature is
    // 175 degC. The warning and damage points sit below it with margin.
    const j = nodeById('pa-junction')
    expect(j.criticalC).toBe(150)
    expect(j.damageC).toBeGreaterThan(140)
    expect(j.damageC).toBeLessThan(175)
    expect(j.warnC).toBeLessThan(j.criticalC)
  })

  it('gives the junction a sub-second time constant and the heatsink a multi-minute one', () => {
    const j = nodeById('pa-junction')
    const h = nodeById('pa-heatsink')
    expect(j.capacityJPerK * j.resistanceKPerW).toBeLessThan(0.5)
    expect(h.capacityJPerK * h.resistanceKPerW).toBeGreaterThan(120)
  })

  it('starts every node at ambient with no damage', () => {
    const s = initialThermalState(AMBIENT)
    expect(s.ambientC).toBe(AMBIENT)
    for (const node of THERMAL_NODES) {
      expect(tempOf(s, node.id)).toBe(AMBIENT)
      expect(damageOf(s, node.id)).toBe(0)
    }
  })
})

describe('steady state', () => {
  it('matches the analytic value: rise = power x sum of the resistances to ambient', () => {
    // 4 W is below the threshold at which the model concludes the radio is
    // transmitting, so the fan stays off and the resistances are exactly the
    // ones in the table. Anything higher brings the transmit fan floor in and
    // the heatsink's resistance to air is no longer the tabulated one.
    const P = 4
    const s = run(initialThermalState(AMBIENT), { 'pa-junction': P }, 20_000, 10)
    const j = nodeById('pa-junction')
    const f = nodeById('pa-flange')
    const h = nodeById('pa-heatsink')
    const expected = AMBIENT + P * (j.resistanceKPerW + f.resistanceKPerW + h.resistanceKPerW)

    expect(s.fan).toBe(0)
    expect(tempOf(s, 'pa-heatsink')).toBeCloseTo(AMBIENT + P * h.resistanceKPerW, 3)
    expect(tempOf(s, 'pa-flange')).toBeCloseTo(AMBIENT + P * (f.resistanceKPerW + h.resistanceKPerW), 3)
    expect(tempOf(s, 'pa-junction')).toBeCloseTo(expected, 3)
  })

  it('leaves untouched nodes at ambient', () => {
    const s = run(initialThermalState(AMBIENT), { 'pa-junction': 10 }, 600, 10)
    expect(tempOf(s, 'balun')).toBeCloseTo(AMBIENT, 9)
    expect(tempOf(s, 'lpf-relay')).toBeCloseTo(AMBIENT, 9)
  })

  it('gets uncomfortably hot on a key-down carrier, which is the point', () => {
    // 100 W is what the finals dissipate making 100 W out, which reconciles with
    // the 16.6 A measured at 14.1 MHz. The die settles well above the metal and
    // well below its 175 degC maximum: hard-working, not in danger. That is the
    // point — the devices are two 70 W parts making 100 W between them.
    const s = run(initialThermalState(AMBIENT), { 'pa-junction': 100 }, 6000, 10)
    expect(tempOf(s, 'pa-junction')).toBeGreaterThan(85)
    expect(tempOf(s, 'pa-junction')).toBeLessThan(120)
    expect(tempOf(s, 'pa-junction')).toBeLessThan(nodeById('pa-junction').damageC)
    expect(s.fan).toBeGreaterThan(0.5)
  })
})

describe('time constants are what a person experiences', () => {
  it('brings a node hung directly off ambient to 63 % in exactly one time constant', () => {
    // The balun's parent is the air, so its response is a pure exponential and
    // the number is exact rather than approximate.
    const b = nodeById('balun')
    const tau = b.capacityJPerK * b.resistanceKPerW
    const s = stepThermal(initialThermalState(AMBIENT), { balun: 10 }, tau, false)
    const rise = tempOf(s, 'balun') - AMBIENT
    expect(rise).toBeCloseTo(10 * b.resistanceKPerW * (1 - Math.exp(-1)), 3)
  })

  it('brings the junction to about 63 % of its step above the flange in one time constant', () => {
    const j = nodeById('pa-junction')
    const tau = j.capacityJPerK * j.resistanceKPerW
    const s = stepThermal(initialThermalState(AMBIENT), { 'pa-junction': 20 }, tau, false)
    // Measured against the flange: the flange creeps a little in 0.1 s, which is
    // why this is a band and not an equality.
    const fraction = (tempOf(s, 'pa-junction') - tempOf(s, 'pa-flange')) / (20 * j.resistanceKPerW)
    expect(fraction).toBeGreaterThan(0.58)
    expect(fraction).toBeLessThan(0.7)
  })

  it('barely moves the heatsink in ten seconds', () => {
    const s = run(initialThermalState(AMBIENT), { 'pa-junction': 40 }, 10, 0.25)
    expect(tempOf(s, 'pa-heatsink') - AMBIENT).toBeLessThan(2)
    // ...while the junction is already almost all the way there.
    expect(tempOf(s, 'pa-junction') - AMBIENT).toBeGreaterThan(20)
  })
})

describe('fanDutyFor', () => {
  it('is off when the heatsink is cold and flat out when it is hot', () => {
    expect(fanDutyFor(20)).toBe(0)
    expect(fanDutyFor(30)).toBe(0)
    expect(fanDutyFor(90)).toBe(1)
  })

  it('has at least three audible speeds', () => {
    const speeds = new Set<number>()
    for (let t = 0; t <= 100; t += 1) speeds.add(fanDutyFor(t))
    expect(speeds.size).toBeGreaterThanOrEqual(4) // three speeds plus off
  })

  it('never slows down as the heatsink heats up', () => {
    let previous = 0
    for (let t = 0; t <= 120; t += 1) {
      const duty = fanDutyFor(t)
      expect(duty).toBeGreaterThanOrEqual(previous)
      expect(duty).toBeLessThanOrEqual(1)
      previous = duty
    }
  })

  it('is well defined for a nonsense reading', () => {
    expect(fanDutyFor(Number.NaN)).toBe(0)
  })

  it('runs on transmit, before anything has had time to get hot', () => {
    // The IC-7300 runs its fan while it transmits rather than waiting for a
    // thermostat. Modelling it as purely thermostatic left the first half minute
    // of every transmission with no forced cooling — which is precisely the half
    // minute someone watching a digital mode is looking at, and it made the
    // finals pass their warning point ten seconds in.
    const justKeyed = run(initialThermalState(AMBIENT), { 'pa-junction': 100 }, 2, 0.05)
    expect(tempOf(justKeyed, 'pa-heatsink')).toBeLessThan(AMBIENT + 2)
    expect(justKeyed.fan).toBeGreaterThan(0.3)

    // With the key up it stops.
    const idle = run(initialThermalState(AMBIENT), {}, 2, 0.05)
    expect(idle.fan).toBe(0)
  })

  it('steps up beyond the transmit floor only when something is genuinely hot', () => {
    // Tested directly rather than through a soak: on this radio the transmit
    // floor covers everything the PA can do to itself at rated output, so the
    // thermostatic steps above it only appear in abuse cases like a blocked
    // grille. That is the correct behaviour, and it is why a soak cannot reach
    // them.
    expect(fanDutyFor(30, true)).toBeCloseTo(0.85, 6)
    expect(fanDutyFor(45, true)).toBeCloseTo(0.85, 6)
    expect(fanDutyFor(75, true)).toBe(1)
    expect(fanDutyFor(75, false)).toBe(1)
    expect(fanDutyFor(30, false)).toBe(0)
  })

  it('never runs slower on transmit than it would on temperature alone', () => {
    for (const t of [20, 35, 45, 55, 65, 75, 90]) {
      expect(fanDutyFor(t, true)).toBeGreaterThanOrEqual(fanDutyFor(t, false))
    }
  })
})

describe('damageRate', () => {
  const j = nodeById('pa-junction')

  it('is exactly zero below the threshold and at it', () => {
    expect(damageRate(j.damageC - 40, j)).toBe(0)
    expect(damageRate(j.damageC - 0.1, j)).toBe(0)
    expect(damageRate(j.damageC, j)).toBe(0)
  })

  it('is strictly increasing above the threshold', () => {
    let previous = 0
    for (let over = 0.5; over <= 60; over += 0.5) {
      const rate = damageRate(j.damageC + over, j)
      expect(rate).toBeGreaterThan(previous)
      previous = rate
    }
  })

  it('roughly doubles every 10 degrees once it is properly over the line', () => {
    const a = damageRate(j.damageC + 30, j)
    const b = damageRate(j.damageC + 40, j)
    const c = damageRate(j.damageC + 50, j)
    expect(b / a).toBeGreaterThan(1.9)
    expect(b / a).toBeLessThan(2.4)
    expect(c / b).toBeGreaterThan(1.95)
    expect(c / b).toBeLessThan(2.2)
  })

  it('applies each node\'s own threshold', () => {
    const balun = nodeById('balun')
    expect(damageRate(balun.damageC + 20, balun)).toBeGreaterThan(0)
    expect(damageRate(balun.damageC + 20, j)).toBe(0)
  })
})

describe('damage accumulation', () => {
  /** Hard on the devices, but not so hard that the damage figure pins instantly. */
  // With the chassis mass lumped into the heatsink and the fan running on
  // transmit, the finals survive continuous rated output. These are abuse
  // figures, well past anything the radio can actually ask of them, chosen so
  // the junction genuinely clears its damage threshold.
  const hard = { 'pa-junction': 260 }
  /** Straightforwardly fatal. */
  const fatal = { 'pa-junction': 600 }

  it('does not accumulate when damage is switched off', () => {
    const s = run(initialThermalState(AMBIENT), hard, 120, 0.25, false)
    expect(tempOf(s, 'pa-junction')).toBeGreaterThan(nodeById('pa-junction').damageC)
    expect(damageOf(s, 'pa-junction')).toBe(0)
  })

  it('accumulates while the node is over its threshold', () => {
    const hot = run(initialThermalState(AMBIENT), hard, 15, 0.25, true)
    expect(damageOf(hot, 'pa-junction')).toBeGreaterThan(0)
    expect(damageOf(hot, 'pa-junction')).toBeLessThan(1)
    const hotter = run(hot, hard, 15, 0.25, true)
    expect(damageOf(hotter, 'pa-junction')).toBeGreaterThan(damageOf(hot, 'pa-junction'))
  })

  it('is permanent: cooling the radio down does not undo it', () => {
    // Hard on the devices but not instantly fatal, so the damage figure lands
    // somewhere useful between nothing and destroyed.
    const hurt = run(initialThermalState(AMBIENT), hard, 30, 0.25, true)
    expect(damageOf(hurt, 'pa-junction')).toBeGreaterThan(0)
    expect(damageOf(hurt, 'pa-junction')).toBeLessThan(1)

    const cooled = run(hurt, {}, 900, 1, true)
    expect(tempOf(cooled, 'pa-junction')).toBeLessThan(nodeById('pa-junction').damageC)

    // Once it is cool again nothing further accumulates, and nothing is given back.
    const later = run(cooled, {}, 900, 1, true)
    expect(damageOf(later, 'pa-junction')).toBe(damageOf(cooled, 'pa-junction'))
    expect(damageOf(later, 'pa-junction')).toBeGreaterThanOrEqual(damageOf(hurt, 'pa-junction'))
  })

  it('never exceeds one', () => {
    const dead = run(initialThermalState(AMBIENT), fatal, 3000, 0.25, true)
    expect(damageOf(dead, 'pa-junction')).toBe(1)
  })
})

describe('integration is stable', () => {
  it('stays finite and monotone at the contract\'s largest step', () => {
    let s = initialThermalState(AMBIENT)
    let previous = AMBIENT
    for (let i = 0; i < 400; i += 1) {
      s = stepThermal(s, { 'pa-junction': 80 }, 0.25, false)
      const t = tempOf(s, 'pa-junction')
      expect(Number.isFinite(t)).toBe(true)
      expect(t).toBeGreaterThanOrEqual(previous - 1e-9)
      previous = t
    }
  })

  it('does not ring or overshoot with an absurdly long step', () => {
    // Below the transmit threshold, so the fan is out of the comparison and the
    // analytic ceiling is exactly the tabulated one.
    const oneBigStep = stepThermal(initialThermalState(AMBIENT), { 'pa-junction': 4 }, 20_000, false)
    const manySmall = run(initialThermalState(AMBIENT), { 'pa-junction': 4 }, 20_000, 10)
    const j = nodeById('pa-junction')
    const f = nodeById('pa-flange')
    const h = nodeById('pa-heatsink')
    const ceiling = AMBIENT + 4 * (j.resistanceKPerW + f.resistanceKPerW + h.resistanceKPerW)
    expect(tempOf(oneBigStep, 'pa-junction')).toBeLessThanOrEqual(ceiling + 1e-6)
    expect(tempOf(manySmall, 'pa-junction')).toBeCloseTo(ceiling, 3)
  })

  it('ignores heat aimed at nodes that do not exist, and zero or negative steps', () => {
    const s = stepThermal(initialThermalState(AMBIENT), { 'not-a-node': 500 }, 1, false)
    expect(tempOf(s, 'pa-junction')).toBeCloseTo(AMBIENT, 9)
    const unchanged = stepThermal(s, { 'pa-junction': 50 }, 0, false)
    expect(tempOf(unchanged, 'pa-junction')).toBeCloseTo(AMBIENT, 9)
    const negative = stepThermal(s, { 'pa-junction': 50 }, -1, false)
    expect(tempOf(negative, 'pa-junction')).toBeCloseTo(AMBIENT, 9)
  })

  it('never drives a node below ambient with heat going in', () => {
    const s = run(initialThermalState(AMBIENT), { 'atu-inductor': 5, balun: 3 }, 300, 0.25)
    for (const node of THERMAL_NODES) {
      expect(tempOf(s, node.id)).toBeGreaterThanOrEqual(AMBIENT - 1e-9)
    }
  })
})
