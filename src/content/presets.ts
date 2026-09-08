/**
 * Antinode — scenario presets.
 *
 * Each preset puts the whole station into one state that makes exactly one
 * point, and `expect` says what to put a finger on when it lands. They are the
 * spine of a talk: load a preset, say the sentence, point at the number.
 *
 * Every number quoted in a blurb or an expect line is either published by Icom,
 * required by rule, or computed here from the loss model in src/rf/cables.ts.
 * Where a figure comes from a textbook model rather than a measurement, the
 * copy says so. Sources, once, for the whole file:
 *
 *   [ICOM-SPEC]  IC-7300 Full Manual (English, rev 12b), section 16
 *                "Specifications", and the same table on Icom America's
 *                product page. Transmit 1.8-54 MHz, SSB/CW/RTTY/FM 2-100 W,
 *                AM 1-25 W, antenna impedance 50 ohm unbalanced, supply
 *                13.8 V DC +/-15 %, transmit consumption 21.0 A at maximum
 *                power, harmonics less than -50 dB (1.8-28 MHz) and less than
 *                -63 dB (50 MHz).
 *   [ICOM-ATU]   Same manual, section 16 and section 11 "Antenna tuner
 *                operation": tunable range 16.7-150 ohm unbalanced, less than
 *                3:1 VSWR; tuning accuracy less than 1.5:1 VSWR; tuning time
 *                2-3 s typical, 15 s maximum; latching relays memorise up to
 *                100 combinations; Emergency mode allows tuning above 3:1 but
 *                limits output to 50 W.
 *   [ICOM-PROT]  Same manual, section 13 "Protection function": a two-step
 *                protection for the final power amplifiers when the antenna
 *                SWR becomes high, driven by power-amplifier temperature.
 *                Step 1 reduces output power and shows "LMT"; step 2 inhibits
 *                the transmitter.
 *   [CFR]        47 CFR 97.307(d) and (e): spurious emissions at least 43 dB
 *                below the fundamental below 30 MHz (equipment installed after
 *                1 January 2003), at least 60 dB below between 30 and 225 MHz.
 *   [CABLES]     Loss figures computed from the published two-term fits in
 *                src/rf/cables.ts, which are themselves fitted to the
 *                manufacturers' attenuation tables. Quoted to the nearest
 *                0.01 dB; real cable varies by 10-20 %.
 *
 * A note on antennaParams. The parameter keys belong to src/rf/antennas.ts.
 * Only one preset sets one, and its `expect` line is written so that it still
 * reads correctly if the presenter has to move the control by hand.
 */

import type { ScenarioPreset } from './types'

export const PRESETS: readonly ScenarioPreset[] = [
  {
    id: 'resonant-dipole',
    name: 'Resonant dipole, 40 m',
    blurb:
      'A half-wave dipole on the band it was cut for, 20 m of RG-213, no tuner. '
      + 'The reference case everything else is measured against.',
    band: '40m',
    set: {
      freqHz: 7_150_000,
      antennaId: 'dipole-40',
      cableId: 'rg213',
      cableLengthM: 20,
      tunerMode: 'bypass',
      powerSetW: 100,
      mode: 'LSB',
    },
    // [CABLES] RG-213 at 7.15 MHz: 0.465 dB per 100 ft, so 0.31 dB in 20 m.
    expect:
      'The SWR at the radio and the SWR at the feedpoint agree to within a few '
      + 'hundredths, because 20 m of RG-213 at 7.15 MHz costs only 0.31 dB. About '
      + '93 W of the 100 W crosses the feedpoint. Point at the two SWR readouts '
      + 'agreeing, and note that they agree only while line loss stays small.',
  },
  {
    id: 'off-band-dipole',
    name: 'Same dipole, one band up',
    blurb:
      'The 40 m dipole left on the mast and used on 20 m. Nothing has been '
      + 'rebuilt; the wire is now a full wavelength long.',
    band: '20m',
    set: {
      freqHz: 14_200_000,
      antennaId: 'dipole-40',
      cableId: 'rg213',
      cableLengthM: 20,
      tunerMode: 'bypass',
      powerSetW: 100,
      mode: 'USB',
    },
    expect:
      'At 14.2 MHz the 20 m of wire is within 5 % of a full wavelength, the '
      + 'feedpoint sits at a '
      + 'current minimum, and the feedpoint resistance runs into the thousands of '
      + 'ohms. Point at the SWR readout, then at forward power falling as the '
      + 'protection circuit reduces drive.',
  },
  {
    id: 'open-feedline',
    name: 'Open circuit at full power',
    blurb:
      'The worst case in the model. There is no "disconnected" antenna to pick, '
      + 'so this uses the closest physical equivalent: a whip cut for 20 m, used '
      + 'on 160 m, '
      + 'which is a small capacitor — a fraction of an ohm of radiation '
      + 'resistance behind a few thousand ohms of reactance. One metre of RG-58 '
      + 'keeps cable loss out of the picture, so the finals see the reflection '
      + 'almost undiminished.',
    band: '160m',
    set: {
      freqHz: 1_900_000,
      antennaId: 'mobile-whip-20',
      cableId: 'rg58',
      cableLengthM: 1,
      tunerMode: 'bypass',
      powerSetW: 100,
      mode: 'LSB',
    },
    // [ICOM-PROT] two-step protection; [CABLES] RG-58 at 1.9 MHz, 1 m = 0.02 dB.
    // e2e/physics.spec.ts drives this preset and requires that, after keying,
    // forward power falls below 60 W and the PA temperature rises. That holds
    // only while src/rf/antennas.ts models a 20 m whip at 1.9 MHz as a near
    // total reflection: milliohms of radiation resistance and kilohms of
    // capacitive reactance. Do not floor the feedpoint resistance at 50 ohm.
    expect:
      'SWR pinned at the top of the scale and reflected power almost equal to '
      + 'forward power. Point at the protection state, then set the timescale '
      + 'control to fast and point at PA temperature climbing. Icom documents the '
      + 'two steps — reduce power, then inhibit transmit — but not the thresholds, '
      + 'so the foldback curve here is our model, not a published one.',
  },
  {
    id: 'dummy-load',
    name: 'Dummy load',
    blurb:
      'Fifty ohms, no reactance, at every frequency. A perfect match that '
      + 'radiates nothing.',
    band: '20m',
    set: {
      freqHz: 14_200_000,
      antennaId: 'dummy-load',
      cableId: 'rg213',
      cableLengthM: 3,
      tunerMode: 'bypass',
      powerSetW: 100,
      mode: 'USB',
    },
    expect:
      '1.00:1 and 0 W reflected, with every watt becoming heat in a resistor. '
      + 'Point at the radiated-power readout while the SWR readout says 1.00, and '
      + 'let the room settle the argument about what SWR reports.',
  },
  {
    id: 'long-thin-coax',
    name: '60 m of RG-58 on 20 m',
    blurb:
      'A good resonant antenna at the far end of a long, thin, cheap feedline. '
      + 'The antenna is not the problem here.',
    band: '20m',
    set: {
      freqHz: 14_200_000,
      antennaId: 'dipole-20',
      cableId: 'rg58',
      cableLengthM: 60,
      tunerMode: 'bypass',
      powerSetW: 100,
      mode: 'USB',
    },
    // [CABLES] RG-58 at 14.2 MHz: 1.70 dB/100 ft -> 3.35 dB in 60 m -> 46 W.
    //          LMR-400 same length: 0.91 dB -> 81 W. RG-213: 1.31 dB -> 74 W.
    expect:
      'Matched loss is 3.35 dB, so 100 W into the cable is 46 W at the feedpoint '
      + 'with a perfect antenna. Switch to LMR-400 at the same 60 m: 0.91 dB and '
      + '81 W. Point at radiated power for both, then at the SWR readout, which '
      + 'gets better as the cable gets worse.',
  },
  {
    id: 'tuner-rescue',
    name: 'Internal tuner on a random wire',
    blurb:
      'An end-fed random wire through a 9:1 transformer on 20 m, then the '
      + 'internal tuner. What the tuner fixes, and what it leaves alone.',
    band: '20m',
    set: {
      freqHz: 14_200_000,
      antennaId: 'random-wire-9to1',
      cableId: 'rg213',
      cableLengthM: 20,
      tunerMode: 'internal',
      powerSetW: 100,
      mode: 'USB',
    },
    // [ICOM-ATU] 16.7-150 ohm, less than 3:1; tunes to less than 1.5:1 in 2-3 s.
    expect:
      'Run the tuner. The SWR at the radio drops below 1.5:1, which is the '
      + 'published tuning accuracy, in the published 2-3 seconds. The SWR at the '
      + 'feedpoint does not move at all. Point at both readouts at the same time.',
  },
  {
    id: 'mag-loop-sharp',
    name: 'Magnetic loop, 40 m',
    blurb:
      'A metre-class transmitting loop: a very high-Q resonator with a tuning '
      + 'capacitor. Power is set to 25 W because of what the capacitor sees.',
    band: '40m',
    set: {
      freqHz: 7_150_000,
      antennaId: 'mag-loop',
      cableId: 'rg213',
      cableLengthM: 10,
      tunerMode: 'bypass',
      powerSetW: 25,
      mode: 'LSB',
    },
    // Loaded Q of 1000 gives a 2:1 SWR bandwidth of 0.707 * f0 / Q = 5.1 kHz at
    // 7.15 MHz. Standard small-loop theory (radiation resistance
    // Rr = 31171 (A/lambda^2)^2 ohm per turn) gives roughly 6 milliohms of
    // radiation resistance against ~28 milliohms of conductor loss for a 1 m
    // loop of 25 mm tube: about 18 % efficient. Model, not measurement.
    expect:
      'Move 5 kHz and the match is gone: at a loaded Q near 1000 the 2:1 SWR '
      + 'bandwidth at 7.15 MHz is about 5 kHz. Point at that, then at the '
      + 'circulating current, which is tens of amps for a load whose radiation '
      + 'resistance is measured in milliohms. Both figures come from small-loop '
      + 'theory, not from a measured loop.',
  },
  {
    id: 'mobile-whip',
    name: 'Mobile whip on 20 m',
    blurb:
      'A short loaded whip on a car body. It works, and it is worth knowing '
      + 'exactly what it costs.',
    band: '20m',
    set: {
      freqHz: 14_200_000,
      antennaId: 'mobile-whip-20',
      cableId: 'rg58',
      cableLengthM: 4,
      tunerMode: 'bypass',
      powerSetW: 100,
      mode: 'USB',
    },
    // 2.4 m at 14.2 MHz is 0.114 lambda. The short-monopole estimate
    // Rr = 395 (h/lambda)^2 gives about 5 ohm. The remainder of the feedpoint
    // resistance is loading-coil and ground-return loss: model, not measurement.
    expect:
      'A whip a couple of metres tall is about a tenth of a wavelength on 20 m, '
      + 'so its radiation resistance is of order 5 ohms. Everything else in the feedpoint resistance is loss in the '
      + 'loading coil and the return path through the car. Point at a respectable '
      + 'SWR sitting next to a poor radiated-power figure.',
  },
  {
    id: 'vertical-radials',
    name: 'Quarter-wave vertical, few radials',
    blurb:
      'A 40 m ground-mounted vertical with a thin radial field. The classic '
      + 'trap: the SWR improves as the antenna gets worse.',
    band: '40m',
    set: {
      freqHz: 7_150_000,
      antennaId: 'vertical-quarter-40',
      cableId: 'rg213',
      cableLengthM: 25,
      tunerMode: 'bypass',
      powerSetW: 100,
      // Key belongs to src/rf/antennas.ts. If it does not match, the preset
      // still loads the vertical and the presenter sets the control by hand.
      antennaParams: { radials: 4 },
    },
    // A quarter-wave monopole over perfect ground is about 36 ohm radiation
    // resistance (standard result). Add 14 ohm of ground-return loss and the
    // feedpoint is exactly 50 ohm: 1.00:1 SWR, 72 % efficiency, -1.4 dB. The
    // 14 ohm is a plausible figure for a handful of radials, not a measurement.
    expect:
      'With the radial count at its lowest setting the SWR sits near 1.0:1, '
      + 'because ground loss has topped 36 ohms of radiation resistance up to 50. '
      + 'Raise the radial count: the SWR gets worse and the radiated power goes '
      + 'up. Point at those two readouts moving in opposite directions.',
  },
  {
    id: 'six-metres',
    name: 'Six metres through HF cable',
    blurb:
      'The same station taken to 50.125 MHz. Cable that was acceptable on 20 m '
      + 'is now the largest loss in the system.',
    band: '6m',
    set: {
      freqHz: 50_125_000,
      antennaId: 'vertical-multiband',
      cableId: 'rg8x',
      cableLengthM: 25,
      tunerMode: 'internal',
      powerSetW: 50,
      mode: 'USB',
    },
    // [CABLES] RG-8X, 25 m: 0.99 dB at 14.2 MHz, 1.97 dB at 50.125 MHz.
    // [ICOM-SPEC] harmonics less than -50 dB on HF, less than -63 dB on 50 MHz.
    // [CFR] 97.307(d) 43 dB below 30 MHz; 97.307(e) 60 dB from 30 to 225 MHz.
    expect:
      'The same 25 m of RG-8X costs 0.99 dB at 14.2 MHz and 1.97 dB at '
      + '50.125 MHz. Point at radiated power, then note two rule-driven facts: '
      + 'the internal tuner is published for the 1.9 to 50 MHz bands, so this is '
      + 'the top of it, and the harmonic '
      + 'spec tightens from -50 dB to -63 dB here because the FCC limit above '
      + '30 MHz is 60 dB rather than 43 dB.',
  },
  {
    id: 'screwdriver-retune',
    name: 'Screwdriver antenna, retuning',
    blurb:
      'A motorised loading coil at the bottom of a mobile whip. It is retuned '
      + 'across the band rather than tolerated across it.',
    band: '40m',
    set: {
      freqHz: 7_050_000,
      antennaId: 'screwdriver-mobile',
      cableId: 'rg58',
      cableLengthM: 4,
      tunerMode: 'bypass',
      powerSetW: 100,
      mode: 'LSB',
    },
    expect:
      'Drive the coil control and watch the SWR minimum follow it along the '
      + 'band. Then move the dial 100 kHz without touching the coil: the match '
      + 'is gone. Point out that this is the same high-Q behaviour as the loop, '
      + 'with a motor instead of a capacitor.',
  },
  {
    id: 'beam-reference',
    name: 'Beam on its design frequency',
    blurb:
      'Three elements on 20 m at 14.150 MHz through 30 m of LMR-400. This is '
      + 'what right looks like, kept on hand for comparison.',
    band: '20m',
    set: {
      freqHz: 14_150_000,
      antennaId: 'yagi-3el-20',
      cableId: 'lmr400',
      cableLengthM: 30,
      tunerMode: 'bypass',
      powerSetW: 100,
      mode: 'USB',
    },
    // [CABLES] LMR-400 at 14.15 MHz: 0.464 dB/100 ft -> 0.46 dB in 30 m -> 90 W.
    expect:
      'SWR near the design minimum of the array, 0.46 dB in 30 m of LMR-400, '
      + 'about 90 W crossing the feedpoint, no foldback and a flat PA '
      + 'temperature. Point at the standing-wave display being almost featureless '
      + 'and use it as the baseline for every other preset.',
  },
  {
    id: 'ladder-line',
    name: '450 ohm line on 80 m',
    blurb:
      'A G5RV fed all the way with window line into a tuner at the radio, which '
      + 'is the doublet arrangement rather than the coax-fed original. High SWR on a '
      + 'low-loss line is a different proposition from high SWR on coax.',
    band: '80m',
    set: {
      freqHz: 3_800_000,
      antennaId: 'g5rv',
      cableId: 'ladder450',
      cableLengthM: 20,
      tunerMode: 'external-radio',
      powerSetW: 100,
      mode: 'LSB',
    },
    // [CABLES] 450 ohm window line, 20 m at 3.8 MHz: 0.09 dB matched. At 10:1
    // SWR the total line loss is 0.43 dB. Only the 1.83 MHz anchor point of
    // this cable's loss model is sourced; the rest of its curve is our fit.
    expect:
      'Matched loss is 0.09 dB and at 10:1 SWR the total is still only 0.43 dB, '
      + 'so about 90 W reaches the antenna through a line the meter calls a '
      + 'disaster. Point at the standing wave, then at the radiated power, and '
      + 'note that the internal tuner would refuse this load: its published range '
      + 'is 16.7 to 150 ohms.',
  },
]
