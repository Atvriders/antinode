/**
 * Antinode — matching networks.
 *
 * The important idea in this file is not the algebra. It is WHERE the network
 * sits.
 *
 * A tuner is a two-port. It presents 50 ohms on its input side by transforming
 * whatever is connected to its output side. It cannot see past itself and it
 * cannot reach past itself. So there are two completely different stories:
 *
 *   Tuner at the radio       radio -> [tuner] -> coax -> antenna
 *     The radio sees 50 ohms and stops folding back. The coax still carries the
 *     whole standing wave set up by the antenna, and still pays the extra loss
 *     that goes with it. Nothing about the feedline has changed. The SWR meter
 *     built into the radio now reads 1:1 and is telling the truth about the
 *     wrong plane.
 *
 *   Tuner at the antenna     radio -> coax -> [tuner] -> antenna
 *     The tuner presents 50 ohms to the coax, so the coax runs flat. The
 *     standing wave and its excess loss are gone. This is the version that
 *     actually recovers power.
 *
 * This module deliberately does not know which of those it is doing. solveTuner
 * is handed the impedance on its output side and reports the match; chain.ts
 * decides which impedance that is, and therefore which story is being told.
 *
 * Units: Hz, ohms, henries, farads, dB. No MHz outside a display string.
 */

import type { Complex, TunerDef, TunerMode, TunerSolution, TunerTopology } from './types'
import { C } from './complex'
import { swrFromZ } from './match'

const TAU = Math.PI * 2

/** System impedance everything in this app is referred to, ohms. */
const SYSTEM_Z0 = 50

/**
 * Design loaded Q for the T network. A T has three elements and only two
 * constraints, so one degree of freedom is left over; the operator picks it
 * with the knobs and the usual advice is "tune for maximum capacitance", which
 * is the same thing as picking the lowest loaded Q that will reach the match.
 * 2.5 is a well-adjusted T. Representative: no amateur tuner publishes a curve.
 */
const T_DESIGN_Q = 2.5

/** Above this the loss model has left the region where a linear fit means anything. */
const Q_MODEL_CEILING = 150

// ─── Display helpers ─────────────────────────────────────────────────────────
// Numbers stored anywhere in this module are in Hz and ohms. These exist only
// to build failureReason, which is a display string. The contract asks for the
// failure text to name real numbers, so the conversion happens here at that
// boundary and nowhere else.

const round1 = (v: number): string => (Number.isFinite(v) ? (Math.round(v * 10) / 10).toFixed(1) : '--')
const round0 = (v: number): string => (Number.isFinite(v) ? Math.round(v).toFixed(0) : '--')
const asMhz = (hz: number): string => round1(hz / 1e6)

// ─── Tuner catalogue ─────────────────────────────────────────────────────────

export const TUNERS: Readonly<Record<TunerMode, TunerDef>> = {
  bypass: {
    id: 'bypass',
    name: 'Tuner bypassed',
    // A straight-through relay path. The range fields exist so the table has a
    // uniform shape; solveTuner never consults them for this mode.
    rMinOhm: SYSTEM_Z0,
    rMaxOhm: SYSTEM_Z0,
    maxSwr: 1,
    baseLossDb: 0,
    lossPerQDb: 0,
    minFreqHz: 0,
    maxFreqHz: Number.POSITIVE_INFINITY,
    note: 'The relay routes the PA straight to the antenna socket. The radio sees whatever the feedline presents.',
  },
  internal: {
    id: 'internal',
    name: 'Internal tuner',
    // Confirmed, Icom IC-7300 specification: the internal automatic antenna
    // tuner matches within 16.7 to 150 ohms, SWR less than 3:1. Those two
    // resistances are exactly 50/3 and 50*3, so the published range IS the 3:1
    // circle on the resistive axis. It is a relay-switched L network: a bank of
    // binary-weighted inductors, a bank of capacitors, and one relay that swaps
    // which side the capacitor sits on.
    rMinOhm: 16.7,
    rMaxOhm: 150,
    maxSwr: 3,
    // Representative: Icom does not publish an insertion loss. 0.2 dB is what a
    // relay-switched L network with small powdered-iron toroids costs when the
    // match is easy.
    baseLossDb: 0.2,
    // Representative. A component unloaded Q of about 200 makes the fractional
    // loss q/200, which is 0.022 dB per unit of loaded Q at small losses.
    lossPerQDb: 0.022,
    minFreqHz: 1.8e6,
    maxFreqHz: 54e6,
    note: 'Published range 16.7 to 150 ohms, up to 3:1 SWR. It is an L network, so it is efficient but narrow.',
  },
  'external-radio': {
    id: 'external-radio',
    name: 'External tuner at the radio',
    // Representative: a wide-range T-network transmatch of the kind sold for
    // amateur use. Deliberately not tied to a part number.
    rMinOhm: 5,
    rMaxOhm: 2000,
    maxSwr: 20,
    baseLossDb: 0.15,
    // Representative. Bigger coils and air-spaced capacitors have a higher
    // component Q than the internal tuner's toroids, but a T network runs three
    // reactances instead of two, so the loss per unit of loaded Q is worse.
    lossPerQDb: 0.03,
    minFreqHz: 1.8e6,
    maxFreqHz: 54e6,
    note: 'Wide range, but it sits at the radio. The feedline still carries the standing wave and its extra loss.',
  },
  'external-antenna': {
    id: 'external-antenna',
    name: 'Remote tuner at the antenna',
    rMinOhm: 5,
    rMaxOhm: 2000,
    maxSwr: 20,
    baseLossDb: 0.15,
    lossPerQDb: 0.03,
    minFreqHz: 1.8e6,
    maxFreqHz: 54e6,
    note: 'Same network, mounted at the feedpoint. The coax runs flat, so the excess loss from standing waves disappears.',
  },
}

const adviceFor = (mode: TunerMode): string => {
  switch (mode) {
    case 'internal':
      return 'Use an external tuner, change the feedline length, or move nearer the antenna resonance.'
    case 'external-radio':
      return 'Move the tuner to the feedpoint, or change the antenna.'
    case 'external-antenna':
      return 'The antenna is too far from 50 ohms on this band. Change its length or change band.'
    case 'bypass':
      return ''
  }
}

// ─── The two-element (L) match ───────────────────────────────────────────────

/**
 * Solve the classic two-element match from an arbitrary load to z0.
 *
 * There are exactly two low-pass arrangements and which one works depends on
 * where the load sits relative to z0:
 *
 *   'lowpass-l-shunt-in'   load -> series L -> [shunt C to ground] -> z0 port
 *     Used when the load resistance is BELOW z0. The series inductor walks the
 *     load along a constant-resistance circle until it lands on the
 *     G = 1/z0 conductance circle; the shunt capacitor then cancels what is
 *     left. Setting Re(1/(R + jX1)) = 1/z0 gives X1^2 = R (z0 - R), and since
 *     Q = X1/R that is the familiar Q = sqrt(z0/R - 1).
 *
 *   'lowpass-l-shunt-out'  load -> [shunt C at the load] -> series L -> z0 port
 *     Used when the load's PARALLEL equivalent resistance is above z0. The
 *     shunt capacitor walks the load along a constant-conductance circle onto
 *     the R = z0 resistance circle; the series inductor cancels the remainder.
 *     Here Q = sqrt(Rp/z0 - 1) with Rp = |Z|^2 / R.
 *
 * The load reactance is absorbed rather than ignored: the inductor supplies the
 * difference between the reactance the network needs and the reactance the load
 * already has. That is why a very capacitive load ends up with a physically
 * large inductor, and why the reported Q climbs with it.
 *
 * For any load with R > 0 at least one of the two always works: if R >= z0 then
 * Rp >= R >= z0, and if R < z0 and the shunt-in form fails it is because
 * X > sqrt(R(z0 - R)), which forces Rp > z0. So a null return here means the
 * inputs were degenerate, not that the load is hard.
 *
 * The reported q is the larger of the two element Qs, because loss in a series
 * element is (its reactance / the resistance in that branch) divided by the
 * component's unloaded Q, and the same ratio holds for a shunt element against
 * the parallel resistance at its node. For a purely resistive load both are
 * exactly sqrt(Rhigh/Rlow - 1).
 */
export const solveLNetwork = (
  zL: Complex,
  freqHz: number,
  z0: number = SYSTEM_Z0,
): { topology: TunerTopology; seriesL: number; shuntC: number; q: number } | null => {
  const w = TAU * freqHz
  if (!Number.isFinite(w) || w <= 0) return null
  if (!Number.isFinite(z0) || z0 <= 0) return null

  const r = zL.re
  const x = zL.im
  if (!Number.isFinite(r) || !Number.isFinite(x) || r <= 0) return null

  let best: { topology: TunerTopology; seriesL: number; shuntC: number; q: number } | null = null

  // Form 1: series L toward the load, shunt C across the z0 port.
  if (r <= z0 * (1 + 1e-12)) {
    // Series reactance that puts the load on the constant-conductance circle.
    const x1 = Math.sqrt(Math.max(0, r * (z0 - r)))
    const wl = x1 - x // what the inductor must supply after the load's own reactance
    if (wl >= 0) {
      const wc = x1 / (r * z0)
      const qSeries = wl / r
      const qShunt = wc * z0
      const q = Math.max(qSeries, qShunt)
      if (Number.isFinite(q)) {
        best = { topology: 'lowpass-l-shunt-in', seriesL: wl / w, shuntC: wc / w, q }
      }
    }
  }

  // Form 2: shunt C at the load, series L toward the z0 port.
  const mag2 = r * r + x * x
  if (mag2 > 0) {
    const g = r / mag2
    const b = -x / mag2
    if (g <= (1 / z0) * (1 + 1e-12)) {
      // Susceptance that puts the load on the constant-resistance circle.
      const b1 = Math.sqrt(Math.max(0, g * (1 / z0 - g)))
      const wc = b1 - b // what the capacitor must supply after the load's own susceptance
      if (wc >= 0 && g > 0) {
        const wl = (b1 * z0) / g
        const qShunt = wc / g
        const qSeries = wl / z0
        const q = Math.max(qSeries, qShunt)
        if (Number.isFinite(wl) && Number.isFinite(q)) {
          const candidate = { topology: 'lowpass-l-shunt-out' as TunerTopology, seriesL: wl / w, shuntC: wc / w, q }
          // Both forms can be legal at once (a load like 20 - j40). The lower
          // loaded Q is the lower loss, which is what a real tuner search finds.
          if (best === null || candidate.q < best.q) best = candidate
        }
      }
    }
  }

  return best
}

// ─── The three-element (T) match ─────────────────────────────────────────────

/**
 * High-pass T: series C1 from the source, shunt L to ground at the middle node,
 * series C2 to the load. This is the transmatch every amateur tuner with two
 * knobs and a roller inductor actually is.
 *
 * Three elements against two constraints leaves one free parameter, taken here
 * as the virtual resistance Rv at the middle node. Rv is chosen high enough to
 * satisfy the design Q on both halves AND high enough to swallow the load's own
 * parallel equivalent resistance, which is what guarantees the output element
 * comes out as a real capacitor even for a badly capacitive load such as a
 * short mobile whip.
 *
 * Note the field names in TunerSolution: it carries one inductance and two
 * capacitances, so seriesL holds the shunt inductor and shuntC / shuntC2 hold
 * the two series capacitors. The names come from the L network; the values are
 * the T network's.
 */
const solveTNetwork = (
  zL: Complex,
  freqHz: number,
  z0: number,
  designQ: number,
): { seriesL: number; shuntC: number; shuntC2: number; q: number } | null => {
  const w = TAU * freqHz
  const r = zL.re
  const x = zL.im
  if (!Number.isFinite(w) || w <= 0) return null
  if (!Number.isFinite(r) || !Number.isFinite(x) || r <= 0) return null

  const rParallel = (r * r + x * x) / r
  const rv = Math.max((1 + designQ * designQ) * Math.max(r, z0), 1.15 * rParallel)
  if (!Number.isFinite(rv) || rv <= z0) return null

  // Load half: net series reactance that transforms the load up to Rv.
  const x2s = -Math.sqrt(Math.max(0, r * (rv - r)))
  const xc2 = x2s - x // the capacitor alone, after absorbing the load reactance
  if (!(xc2 < 0)) return null
  const xp2 = (r * r + x2s * x2s) / x2s // parallel equivalent reactance at the node

  // Node: total susceptance that makes Re(Z) = z0 looking back through C1.
  const g = 1 / rv
  const bNode = -Math.sqrt(Math.max(0, g * (1 / z0 - g)))
  const bp2 = -1 / xp2
  const bShunt = bNode - bp2
  if (!(bShunt < 0)) return null // must come out inductive
  const xShuntL = -1 / bShunt

  // Source half: the series capacitor that cancels what the node leaves behind.
  const xc1 = (bNode * z0) / g
  if (!(xc1 < 0)) return null

  const seriesL = xShuntL / w
  const shuntC = -1 / (w * xc1)
  const shuntC2 = -1 / (w * xc2)
  if (!Number.isFinite(seriesL) || !Number.isFinite(shuntC) || !Number.isFinite(shuntC2)) return null

  // Each element's Q against the resistance it works into. The largest one
  // dominates the loss, and it is always bigger than the equivalent L network's
  // Q — which is exactly why a T is the convenient choice and the lossy one.
  const q = Math.max(Math.abs(xc1) / z0, rv / xShuntL, Math.abs(xc2) / r)
  if (!Number.isFinite(q)) return null

  return { seriesL, shuntC, shuntC2, q }
}

// ─── Loss ────────────────────────────────────────────────────────────────────

/**
 * Loss of a matched network, dB.
 *
 * The physics: a reactive element of reactance X working into a resistance R
 * carries circulating volt-amps of Q = X/R times the power being delivered, and
 * loses a fraction Q/Qu of it in its own resistance, where Qu is the component's
 * unloaded Q. So loss rises with the loaded Q of the match, and a wide-range
 * match of a very reactive load is genuinely lossy no matter how good the parts
 * are. lossPerQDb is 4.343/Qu, the small-loss linearisation of that.
 */
export const tunerLossDb = (def: TunerDef, q: number): number => {
  if (!Number.isFinite(q) || q <= 0) return def.baseLossDb
  return def.baseLossDb + def.lossPerQDb * Math.min(q, Q_MODEL_CEILING)
}

// ─── Solve ───────────────────────────────────────────────────────────────────

/**
 * Report the match a tuner can make into zL.
 *
 * zL is the impedance on the tuner's OUTPUT side, whatever chain.ts decides
 * that is. When the network matches, presentedZ is 50 + j0 by definition: that
 * is what "matched" means. When it cannot, presentedZ is the load, unchanged,
 * and the radio sees the mismatch it was always seeing.
 */
export const solveTuner = (args: {
  mode: TunerMode
  zL: Complex
  freqHz: number
  engaged: boolean
}): TunerSolution => {
  const { mode, zL, freqHz, engaged } = args
  const def = TUNERS[mode]

  const idle = (isEngaged: boolean, reason: string): TunerSolution => ({
    engaged: isEngaged,
    matched: false,
    topology: 'none',
    seriesL: 0,
    shuntC: 0,
    shuntC2: 0,
    q: 0,
    lossDb: 0,
    presentedZ: zL,
    failureReason: reason,
  })

  if (mode === 'bypass' || !engaged) return idle(false, '')

  if (!Number.isFinite(zL.re) || !Number.isFinite(zL.im) || zL.re <= 0) {
    return idle(true, 'The load is not a passive impedance, so no network can match it. Check the antenna settings.')
  }

  if (freqHz < def.minFreqHz || freqHz > def.maxFreqHz) {
    return idle(
      true,
      `${def.name} does not cover ${asMhz(freqHz)} MHz. It works from ${asMhz(def.minFreqHz)} to ${asMhz(def.maxFreqHz)} MHz.`,
    )
  }

  const advice = adviceFor(mode)
  const r = zL.re
  if (r < def.rMinOhm || r > def.rMaxOhm) {
    return idle(
      true,
      `${def.name} cannot match ${round0(r)} ohms. Its range is ${round1(def.rMinOhm)} to ${round0(def.rMaxOhm)} ohms. ${advice}`,
    )
  }

  const swr = swrFromZ(zL, SYSTEM_Z0)
  if (swr > def.maxSwr) {
    return idle(
      true,
      `${def.name} cannot match ${round1(swr)}:1. It matches up to ${round1(def.maxSwr)}:1. ${advice}`,
    )
  }

  if (mode === 'internal') {
    const l = solveLNetwork(zL, freqHz, SYSTEM_Z0)
    if (l === null) {
      return idle(true, `${def.name} found no setting for this load. ${advice}`)
    }
    return {
      engaged: true,
      matched: true,
      topology: l.topology,
      seriesL: l.seriesL,
      shuntC: l.shuntC,
      shuntC2: 0,
      q: l.q,
      lossDb: tunerLossDb(def, l.q),
      presentedZ: C(SYSTEM_Z0, 0),
      failureReason: '',
    }
  }

  const t = solveTNetwork(zL, freqHz, SYSTEM_Z0, T_DESIGN_Q)
  if (t === null) {
    return idle(true, `${def.name} found no setting for this load. ${advice}`)
  }
  return {
    engaged: true,
    matched: true,
    topology: 't-network',
    seriesL: t.seriesL,
    shuntC: t.shuntC,
    shuntC2: t.shuntC2,
    q: t.q,
    lossDb: tunerLossDb(def, t.q),
    presentedZ: C(SYSTEM_Z0, 0),
    failureReason: '',
  }
}
