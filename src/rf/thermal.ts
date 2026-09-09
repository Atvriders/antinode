/**
 * Antinode — the thermal model.
 *
 * A lumped RC network. Heat is current, temperature is voltage, thermal
 * capacitance is capacitance and thermal resistance is resistance, and the
 * equations are the same ones. The point of modelling it this way is the time
 * constants: they are what a person actually experiences.
 *
 *   pa-junction     0.11 s   the silicon. Faster than you can react to it, which
 *                            is why a mismatch kills a device before the meter
 *                            has finished moving.
 *   pa-flange       1.8 s    the copper tab and the insulating pad.
 *   pa-heatsink     6.6 min  still air, 2.6 min with the fan at full. This is
 *                            the one that decides how long you can rag-chew.
 *   lpf-relay       10 s     a contact has almost no thermal mass.
 *   atu-inductor    24 s
 *   coax-connector  54 s
 *   balun           100 s    a ferrite core with somewhere to put the heat.
 *
 * Numbers are representative. Icom publishes no thermal model; the junction
 * resistance is the one confirmed figure (Mitsubishi RD70HVF1, Rth(ch-c)
 * 1.0 degC/W per device, so 0.5 degC/W for the push-pull pair), and the
 * masses and areas behind the rest are sized to give the time constants above.
 *
 * Units: J/degC, degC/W, W, s, degC.
 */

import type { ThermalNodeDef, ThermalState } from './types'

/** The node the fan blows on, and the one the fan curve reads. */
const HEATSINK_ID = 'pa-heatsink'

/** The node the finals dissipate into; used to detect that the radio is transmitting. */
const PA_NODE_ID = 'pa-junction'

/**
 * Damage accumulates at this rate per second when the node is 10 degC over its
 * damage threshold. Chosen so a badly abused part fails in minutes rather than
 * in the hours a real part would take: the demo has to be watchable.
 * Representative.
 */
const DAMAGE_BASE_PER_S = 1 / 600

/** Fraction by which a fan at full duty cuts the heatsink-to-air resistance. Representative. */
const FAN_R_REDUCTION = 0.6

/** Longest sub-step, s. A quarter of the junction time constant keeps the fast node honest. */
const MAX_SUB_DT = 0.02

/** Bound on work per call, so a big time-scale multiplier cannot stall a frame. */
const MAX_SUBSTEPS = 64

export const THERMAL_NODES: readonly ThermalNodeDef[] = [
  {
    id: 'pa-junction',
    label: 'Final device channels',
    // A pair of RF power dies plus the copper immediately under them. Tiny.
    capacityJPerK: 0.25,
    // Confirmed: RD70HVF1 Rth(ch-c) is 1.0 degC/W per device, and the two
    // devices sit on the same heatsink, so thermally they are in parallel.
    resistanceKPerW: 0.5,
    parent: 'pa-flange',
    // Confirmed: the RD70HVF1's absolute maximum channel temperature is
    // 175 degC. Warning and damage points are placed below it with margin,
    // because a device run at its absolute maximum is being destroyed slowly
    // even when it has not failed yet.
    warnC: 120,
    criticalC: 150,
    damageC: 160,
  },
  {
    id: 'pa-flange',
    label: 'Final device flanges',
    capacityJPerK: 5,
    /*
     * Flange to heatsink through the thermal sheet, for the pair. The service
     * manual lists MP52, a 26 x 37 mm TC-200CAS sheet under the devices — a good
     * interface over a large area, so this path is small next to the 1.0 degC/W
     * of junction-to-case inside each device, which is what actually sets how
     * far the die runs above the metal.
     */
    resistanceKPerW: 0.05,
    parent: HEATSINK_ID,
    warnC: 100,
    criticalC: 120,
    damageC: 140,
  },
  {
    id: HEATSINK_ID,
    label: 'Chassis casting',
    /*
     * The die-cast chassis. Not a heatsink — this radio does not have one for
     * its finals.
     *
     * The service manual's parts list gives the driver and both finals as plain
     * FET entries with no board coordinates, because they are not board-plane
     * parts: they bolt straight into threaded bosses in the casting with thermal
     * compound. A repair account of the same job describes wiping the old
     * compound off the chassis bosses before refitting them, and notes how hard
     * the devices are to unsolder "because of the heat-sinking property of the
     * chassis".
     *
     * That is why the radio heats slowly. An earlier version of this model gave
     * the finals 400 g of imaginary fins, which saturate in a couple of minutes
     * and had a digital transmission past the warning point ten seconds in. The
     * real mass is a large fraction of a 4.2 kg casting, cabinet-coupled.
     */
    capacityJPerK: 1250,
    /*
     * Still air; stepThermal scales this down as the fan comes up.
     *
     * Calibrated against the only published instrumented measurement: VA7OJ
     * recorded a 33 degC average case temperature rising to 35 degC at the
     * hottest point after several minutes of key-down at 100 W, with the
     * radio's own temperature gauge still in its normal range. With the fan at
     * its transmit duty that is a rise of roughly 15 K on about 115 W.
     */
    resistanceKPerW: 0.32,
    parent: null,
    warnC: 60,
    criticalC: 80,
    damageC: 95,
  },
  {
    id: 'lpf-relay',
    label: 'Low-pass filter relay',
    capacityJPerK: 0.8,
    resistanceKPerW: 12,
    parent: null,
    // Contacts do not melt at these temperatures; they oxidise, and the
    // resistance climbs, and then they get hotter. It runs away.
    warnC: 90,
    criticalC: 130,
    damageC: 150,
  },
  {
    id: 'atu-inductor',
    label: 'Tuner inductor',
    capacityJPerK: 3,
    resistanceKPerW: 8,
    parent: null,
    // A powdered-iron core loses permeability as it heats, which detunes the
    // match, which raises the circulating current. Also runs away.
    warnC: 90,
    criticalC: 130,
    damageC: 155,
  },
  {
    id: 'coax-connector',
    label: 'Antenna connector',
    capacityJPerK: 6,
    resistanceKPerW: 9,
    parent: null,
    // The PTFE in the connector is good to well over 200 degC. The polyethylene
    // in the cable right behind it is not, so the assembly is limited by the
    // cable, not the connector.
    warnC: 70,
    criticalC: 100,
    damageC: 120,
  },
  {
    id: 'balun',
    label: 'Antenna matching transformer',
    capacityJPerK: 25,
    resistanceKPerW: 4,
    parent: null,
    // Ferrite loss rises with temperature, so a core that is already hot gets
    // hotter for the same power. The classic summer-afternoon failure.
    warnC: 70,
    criticalC: 100,
    damageC: 110,
  },
]

const CHILDREN_OF: ReadonlyMap<string, readonly ThermalNodeDef[]> = (() => {
  const map = new Map<string, ThermalNodeDef[]>()
  for (const node of THERMAL_NODES) {
    if (node.parent === null) continue
    const list = map.get(node.parent)
    if (list === undefined) map.set(node.parent, [node])
    else list.push(node)
  }
  return map
})()

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * Fan duty for a heatsink temperature.
 *
 * Stepped, not continuous, because that is what a person hears: the fan in a
 * radio audibly changes gear. Four speeds and off. Representative; Icom does
 * not publish the thresholds.
 *
 * There is deliberately no hysteresis, because this is a pure function of
 * temperature with no memory. The real radio also spins the fan whenever it is
 * transmitting regardless of temperature, which is the caller's business.
 */
/**
 * Fan duty, 0..1.
 *
 * Temperature is not the only input. The IC-7300 runs its fan while it is
 * transmitting, not only once something has got hot, and modelling it as purely
 * thermostatic left the first half-minute of every transmission with no forced
 * cooling at all — which is exactly the half-minute someone watching a digital
 * mode is looking at. Transmitting sets a floor; heat takes it the rest of the
 * way.
 */
export const fanDutyFor = (heatsinkC: number, transmitting = false): number => {
  // Confirmed by owners and by the reviewer who measured this radio: the fan
  // comes on with PTT, at any power level, and it is loud — it is the single
  // most common complaint about the IC-7300, and Icom's own marketing for the
  // successor boasts that "the fan control has been improved". It is not a
  // thermostat that spools up once something is hot.
  const floor = transmitting ? 0.85 : 0
  if (!Number.isFinite(heatsinkC)) return floor
  const thermostatic =
    heatsinkC >= 70 ? 1
    : heatsinkC >= 60 ? 0.85
    : heatsinkC >= 50 ? 0.6
    : heatsinkC >= 40 ? 0.35
    : 0
  return Math.max(floor, thermostatic)
}

/**
 * Permanent damage accumulated per second at this temperature, 0 below the
 * node's threshold.
 *
 * Chemistry and electromigration both roughly double their rate every 10 degC,
 * which is the usual engineering shorthand for an Arrhenius law over a narrow
 * range. The (2^n - 1) form makes the rate exactly zero at the threshold instead
 * of stepping discontinuously to a finite value, and its ratio tends to 2 per
 * 10 degC once you are properly over the line.
 */
export const damageRate = (tempC: number, node: ThermalNodeDef): number => {
  if (!Number.isFinite(tempC)) return 0
  const excess = tempC - node.damageC
  if (excess <= 0) return 0
  return DAMAGE_BASE_PER_S * (Math.pow(2, excess / 10) - 1)
}

export const initialThermalState = (ambientC: number): ThermalState => {
  const ambient = Number.isFinite(ambientC) ? ambientC : 25
  const temps: Record<string, number> = {}
  const damage: Record<string, number> = {}
  for (const node of THERMAL_NODES) {
    temps[node.id] = ambient
    damage[node.id] = 0
  }
  return { temps, damage, ambientC: ambient, fan: fanDutyFor(ambient) }
}

/** Only the heatsink is helped by the fan; everything else sits in still air. */
const resistanceOf = (node: ThermalNodeDef, fan: number): number => {
  if (node.id !== HEATSINK_ID) return node.resistanceKPerW
  return node.resistanceKPerW * (1 - FAN_R_REDUCTION * clamp01(fan))
}

/**
 * Advance the network by dt seconds.
 *
 * Integration is exponential Euler with the neighbours frozen inside each
 * sub-step: each node relaxes toward the equilibrium its own neighbours imply,
 * by a factor 1 - exp(-h/tau). That is exact for a node whose parent is ambient,
 * it is unconditionally stable for any h (the update can never overshoot the
 * equilibrium, so it cannot ring), and its fixed point is the exact steady state
 * of the network. Plain forward Euler would need h < 2 tau and the junction's
 * tau is 0.1 s, so a 0.25 s frame would blow up.
 *
 * powerIn is keyed by node id; ids that are not nodes are ignored, and nodes
 * with no entry get zero.
 */
export const stepThermal = (
  state: ThermalState,
  powerIn: Record<string, number>,
  dt: number,
  allowDamage: boolean,
): ThermalState => {
  const ambient = Number.isFinite(state.ambientC) ? state.ambientC : 25

  /*
   * Whether the radio is transmitting, inferred from the heat arriving at the
   * finals rather than passed in separately: the fan runs on transmit, and heat
   * in the PA is what transmitting means here. The threshold is well above the
   * numerical noise of an idle stage and well below anything the finals produce
   * with drive on them.
   */
  const paHeat = powerIn[PA_NODE_ID]
  const transmitting = typeof paHeat === 'number' && Number.isFinite(paHeat) && paHeat > 5

  const temps: Record<string, number> = {}
  const damage: Record<string, number> = {}
  for (const node of THERMAL_NODES) {
    const t = state.temps[node.id]
    temps[node.id] = typeof t === 'number' && Number.isFinite(t) ? t : ambient
    const d = state.damage[node.id]
    damage[node.id] = typeof d === 'number' && Number.isFinite(d) ? clamp01(d) : 0
  }

  if (!Number.isFinite(dt) || dt <= 0) {
    return { temps, damage, ambientC: ambient, fan: fanDutyFor(temps[HEATSINK_ID] ?? ambient, transmitting) }
  }

  const steps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(dt / MAX_SUB_DT)))
  const h = dt / steps
  let fan = fanDutyFor(temps[HEATSINK_ID] ?? ambient, transmitting)

  const next: Record<string, number> = {}
  for (let s = 0; s < steps; s += 1) {
    for (const node of THERMAL_NODES) {
      const ti = temps[node.id] ?? ambient
      const rOut = resistanceOf(node, fan)

      // Heat in, plus conduction from the parent, plus conduction from children.
      const pRaw = powerIn[node.id]
      const p = typeof pRaw === 'number' && Number.isFinite(pRaw) ? Math.max(0, pRaw) : 0
      const tParent = node.parent === null ? ambient : (temps[node.parent] ?? ambient)

      let q = p + (tParent - ti) / rOut
      let g = 1 / rOut
      for (const child of CHILDREN_OF.get(node.id) ?? []) {
        const rc = resistanceOf(child, fan)
        q += ((temps[child.id] ?? ambient) - ti) / rc
        g += 1 / rc
      }

      const tau = node.capacityJPerK / g
      const relax = 1 - Math.exp(-h / tau)
      next[node.id] = ti + (q / g) * relax
    }

    for (const node of THERMAL_NODES) {
      const t = next[node.id]
      if (typeof t === 'number' && Number.isFinite(t)) temps[node.id] = t
    }

    fan = fanDutyFor(temps[HEATSINK_ID] ?? ambient, transmitting)

    if (allowDamage) {
      for (const node of THERMAL_NODES) {
        const rate = damageRate(temps[node.id] ?? ambient, node)
        if (rate > 0) damage[node.id] = clamp01((damage[node.id] ?? 0) + rate * h)
      }
    }
  }

  return { temps, damage, ambientC: ambient, fan }
}
