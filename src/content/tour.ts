/**
 * Antinode — the guided tour.
 *
 * Twenty steps from a spoken word to a radiated wave, then four that break the
 * radio. Each step puts the application into the state that makes its point,
 * focuses one stage or one part, and ends on a single number.
 *
 * Sourcing rule for this file: a number is either published, required by rule,
 * or computed from the models in src/rf. Where the model is ours rather than
 * Icom's, the step says so in its own body copy instead of hiding it in a
 * comment. Sources, once, for the whole file:
 *
 *   [ICOM-SPEC]  IC-7300 Full Manual (English, rev 12b), section 16
 *                "Specifications". Transmit 1.8-54 MHz; SSB/CW/RTTY/FM
 *                2-100 W, AM 1-25 W; antenna impedance 50 ohm unbalanced;
 *                supply 13.8 V DC +/-15 %; transmit consumption 21.0 A at
 *                maximum power; SSB modulation system "P.S.N. modulation";
 *                carrier suppression more than 50 dB; unwanted sideband
 *                suppression more than 50 dB; harmonics less than -50 dB
 *                (1.8-28 MHz), less than -63 dB (50 MHz band); microphone
 *                impedance 600 ohm; receive intermediate frequency 36 kHz.
 *   [ICOM-MIC]   Same manual, section 18 "Connector information": microphone
 *                connector pin 1 microphone input, impedance 600 ohm; pin 2
 *                +8 V DC output, maximum 10 mA.
 *   [ICOM-ALC]   Same manual, section 3, "Adjusting the microphone gain": in
 *                SSB, adjust until the ALC meter swings between 30 and 50 % of
 *                the ALC scale; the ALC limits RF power when the input exceeds
 *                the allowed level.
 *   [ICOM-COMP]  Same manual, section 4, "Setting the Speech Compressor":
 *                adjust the level so the COMP meter reads within the COMP zone,
 *                a 10 to 20 dB range; beyond it the transmitted voice may
 *                distort.
 *   [ICOM-TBW]   Same manual, section 4 and section 12: default SSB transmit
 *                filter widths, WIDE 100-2900 Hz, MID 300-2700 Hz,
 *                NAR 500-2500 Hz.
 *   [ICOM-ATU]   Same manual, sections 11 and 16: tunable range 16.7-150 ohm
 *                unbalanced, less than 3:1 VSWR; tuning accuracy less than
 *                1.5:1 VSWR; tuning time 2-3 s typical, 15 s maximum; latching
 *                relays memorise up to 100 combinations.
 *   [ICOM-PROT]  Same manual, section 13 "Protection function": two-step
 *                protection of the final power amplifiers on high antenna SWR,
 *                driven by power-amplifier temperature. Step one reduces output
 *                power and displays "LMT"; step two inhibits the transmitter.
 *                The TEMP meter carries a marked TX inhibit zone.
 *   [ICOM-BPF]   Icom America IC-7300 product page: "15 discrete RF bandpass
 *                filters" using high-Q coils.
 *   [CFR]        47 CFR 97.307(d), (e): spurious emissions at least 43 dB below
 *                the fundamental below 30 MHz for equipment installed after
 *                1 January 2003, and at least 60 dB below between 30 and
 *                225 MHz.
 *   [CABLES]     Loss and velocity-factor figures computed from the fitted
 *                models in src/rf/cables.ts.
 *
 * One thing Icom does not publish, and which this tour therefore never claims:
 * the sample rate and word length of the transmit codec.
 *
 * The PA device types ARE published — the service manual parts list gives
 * RD70HVF1C-121 for Q131 and Q132, RD15HVF1 for the driver and RD01MUS2 for the
 * pre-driver — and the tour names them.
 */

import type { TourStep } from './types'

export const TOUR: readonly TourStep[] = [
  // ── 1-3 acoustic and audio front end ──────────────────────────────────────
  {
    id: 'speech',
    title: 'What the microphone is given',
    body:
      'Speech arrives at the capsule as a pressure wave with energy from below '
      + '`100 Hz` to well past `8 kHz`. The radio keeps a slice of it and throws '
      + 'the rest away: the default SSB transmit filter is `100 Hz` to `2900 Hz` '
      + 'wide, and `300 Hz` to `2700 Hz` in mid. **Everything up to the capsule is '
      + 'acoustics, not radio.** The sound pressure used by this model is '
      + 'representative; Icom publishes the working distance, not the level.',
    view: 'exterior',
    focusStage: 'voice',
    focusPart: 'mic-capsule',
    set: {
      freqHz: 14_200_000,
      antennaId: 'dipole-20',
      tunerMode: 'bypass',
      cableLengthM: 20,
      powerSetW: 100,
      keyed: false,
    },
    // [ICOM-SPEC] hand microphone HM-219 supplied; working distance from the
    // microphone-gain procedure in section 3.
    takeaway: 'Icom specifies 5 to 10 cm from the mouth, at a normal voice level.',
  },
  {
    id: 'mic-element',
    title: 'The capsule and its eight volts',
    body:
      'The capsule turns pressure into a voltage of a few millivolts. Two numbers '
      + 'about that interface are published: the microphone input is **`600 Ω`**, '
      + 'and pin 2 of the 8-pin connector supplies `+8 V DC` at up to `10 mA` to '
      + 'run the element. The millivolt figure in this model is representative; '
      + 'the impedance and the bias supply are from the connector table.',
    view: 'exterior',
    focusStage: 'mic-element',
    focusPart: 'mic-capsule',
    set: { keyed: false },
    // [ICOM-MIC]
    takeaway: 'Microphone input 600 Ω, with +8 V at up to 10 mA on pin 2 to feed the element.',
  },
  {
    id: 'mic-amp-alc',
    title: 'Mic gain, and where the ALC starts',
    body:
      'The microphone amplifier decides how hard the speech drives the modulator; '
      + 'the ALC is the loop that stops it driving too hard. The instruction in '
      + 'the manual is specific: in SSB, set MIC GAIN so the ALC meter **swings '
      + 'between `30 %` and `50 %` of the ALC scale**. Past that the ALC is pulling '
      + 'peaks down on every syllable, which flattens the envelope, widens the '
      + 'occupied bandwidth, and is heard two channels away as splatter.',
    view: 'exterior',
    focusStage: 'mic-preamp',
    focusPart: 'mic-preamp-ic',
    set: { keyed: true },
    // [ICOM-ALC]
    takeaway: '30 to 50 % of the ALC scale is the published target, not a rule of thumb.',
  },

  // ── 4-6 the digital heart ─────────────────────────────────────────────────
  {
    id: 'sampling',
    title: 'Everything after this point is arithmetic',
    body:
      'The audio is digitised on the main board, and from there to the antenna '
      + 'socket the signal is numbers. A `2900 Hz` top end needs a sample rate '
      + 'above `5.8 kHz` to survive, and an anti-alias filter ahead of the '
      + 'converter to make that true. **Icom does not publish the sample rate or '
      + 'word length of the transmit codec**, so the rate shown here is '
      + 'representative; the `36 kHz` in the specification is the receive '
      + 'intermediate frequency, not a sampling rate.',
    view: 'cutaway',
    focusStage: 'af-adc',
    focusPart: 'af-codec',
    set: { keyed: true },
    // [ICOM-TBW] wide default 100-2900 Hz; [ICOM-SPEC] IF 36 kHz.
    takeaway: 'The default wide transmit passband is 100 to 2900 Hz, so 5.8 kHz is the honest floor.',
  },
  {
    id: 'fpga-ssb',
    title: 'How the sideband is actually made',
    body:
      'The specification names the SSB modulation system as **P.S.N.** — a '
      + 'phasing modulator, not a crystal filter. Two copies of the audio are '
      + 'made `90°` apart, multiplied by two carriers also `90°` apart, and added '
      + 'so that one sideband cancels and the other survives. How well it cancels '
      + 'is published: carrier suppression more than `50 dB`, unwanted sideband '
      + 'more than `50 dB`. Which parts of that modulator sit in the FPGA and '
      + 'which in the codec is not published; the split drawn here is ours.',
    view: 'cutaway',
    focusStage: 'dsp-tx',
    focusPart: 'fpga',
    set: { keyed: true },
    // [ICOM-SPEC] "SSB: P.S.N. modulation"; suppression figures from the same table.
    takeaway: 'Carrier and unwanted sideband are both more than 50 dB down, by arithmetic.',
  },
  {
    id: 'compression',
    title: 'What compression does to the envelope',
    body:
      'Speech has a high peak-to-average ratio, and the peak is already fixed by '
      + 'the ALC, so the only way to put more average power on the air is to '
      + 'reduce that ratio. The compressor pulls the loud parts down and lifts the '
      + 'quiet parts, which is exactly why it costs audio quality. The limit is on '
      + 'screen: keep the COMP meter **inside the COMP zone, `10 dB` to `20 dB`**, '
      + 'or the transmitted voice may distort.',
    view: 'signal-path',
    focusStage: 'dsp-tx',
    focusPart: 'fpga',
    set: { keyed: true },
    // [ICOM-COMP]
    takeaway: 'The COMP zone is 10 to 20 dB. Beyond it the manual predicts distortion.',
  },

  // ── 7-9 getting to power ──────────────────────────────────────────────────
  {
    id: 'driver-chain',
    title: 'From milliwatts to a few watts',
    body:
      'The converter hands over a small, clean signal at the operating frequency. '
      + 'The pre-driver and driver raise it to the few watts the finals need, '
      + 'without adding distortion the low-pass filters cannot remove afterwards. '
      + 'Between them sits the band-pass filter bank: Icom claims **15 discrete '
      + 'band-pass filters** wound with high-Q coils. Stage-by-stage gains are not '
      + 'published, so the levels shown along this part of the chain are '
      + 'representative.',
    view: 'exploded',
    focusStage: 'driver',
    focusPart: 'driver',
    set: { keyed: true, powerSetW: 100 },
    // [ICOM-BPF]
    takeaway: '15 discrete band-pass filters are published; the stage gains here are not.',
  },
  {
    id: 'finals-and-current',
    title: 'The finals and the twenty-one amps',
    body:
      'At maximum output the radio draws a published `21.0 A` from a `13.8 V` '
      + 'supply. That is **`290 W` of DC to make `100 W` of RF**: about `35 %` '
      + 'efficient, with the other `190 W` leaving as heat, most of it at the '
      + 'final devices. Key-down is the worst case, and SSB averages far below it, which '
      + 'is the only reason the heatsink can be this size. The devices are a pair '
      + 'of Mitsubishi **RD70HVF1** — not the RD100HHF1 the internet repeats; '
      + "Icom's own parts list gives RD70HVF1C-121 for both.",
    view: 'cutaway',
    focusStage: 'final-pa',
    focusPart: 'final-q1',
    set: { keyed: true, powerSetW: 100 },
    // [ICOM-SPEC] 13.8 V, 21.0 A at maximum power. 13.8 * 21.0 = 289.8 W.
    takeaway: '13.8 V × 21.0 A = 290 W of DC for 100 W of RF, so about 190 W is heat.',
  },
  {
    id: 'lpf-bank',
    title: 'The low-pass filters are for everybody else',
    body:
      'A class-AB amplifier makes harmonics; nothing in the design prevents that, '
      + 'so a switched bank of low-pass filters removes them band by band. The '
      + 'rule sets the target: `43 dB` below the fundamental under 30 MHz, `60 dB` '
      + 'from 30 to 225 MHz. The published specification beats both, at less than '
      + '`-50 dB` on HF and less than `-63 dB` on 6 m. **At `100 W` on 20 m, the '
      + 'second harmonic has to leave the socket as less than `1 mW`.**',
    view: 'exploded',
    focusStage: 'lpf-bank',
    focusPart: 'lpf-board',
    set: { keyed: true },
    // [CFR] 97.307(d) 43 dB, (e) 60 dB; [ICOM-SPEC] -50 dB HF, -63 dB 6 m.
    // 100 W at -50 dB = 1.0 mW; at -63 dB = 50 uW.
    takeaway: '100 W on 14.2 MHz means less than 1 mW on 28.4 MHz.',
  },

  // ── 10-11 the bridge and the tuner ────────────────────────────────────────
  {
    id: 'swr-bridge',
    title: 'The bridge measures the connector',
    body:
      'The directional coupler sits between the low-pass filters and the antenna '
      + 'socket, and compares the forward and reflected travelling waves **at that '
      + 'point**. The manual calls the meter the SWR of the antenna, but the '
      + 'coupler cannot see past the coax: what it reports is the load presented '
      + 'at the SO-239. Two SWR readouts are on screen for that reason, and the '
      + 'radio protects itself from only one of them.',
    view: 'cutaway',
    focusStage: 'swr-bridge',
    focusPart: 'swr-coupler',
    set: { keyed: true },
    takeaway: 'There are two SWRs. The radio measures the one at its own connector.',
  },
  {
    id: 'tuner',
    title: 'The tuner moves the problem',
    body:
      'The internal tuner is a switched network of inductors and capacitors that '
      + 'transforms whatever the coax presents into something the PA can drive. '
      + 'The published range is **`16.7 Ω` to `150 Ω`, under `3:1`**, tuned to '
      + 'better than `1.5:1` in `2` to `3` seconds, with up to 100 solutions held '
      + 'in latching relays so the same band is instant next time. It fixes what '
      + 'the PA sees and changes nothing beyond the socket: the feedpoint SWR does '
      + 'not move.',
    view: 'exploded',
    focusStage: 'atu',
    focusPart: 'atu-board',
    set: {
      antennaId: 'random-wire-9to1',
      freqHz: 14_200_000,
      tunerMode: 'internal',
      keyed: true,
    },
    // [ICOM-ATU]
    takeaway: '16.7 to 150 Ω, under 3:1, tuned to under 1.5:1 — the published limits.',
  },

  // ── 12-14 the feedline ────────────────────────────────────────────────────
  {
    id: 'standing-wave',
    title: 'Two waves on one line',
    body:
      'A mismatched load sends part of the wave back, and the forward and '
      + 'reflected waves add along the cable. With `100 W` forward on `50 Ω` line '
      + 'the forward wave alone is `100 V` peak; at `5:1` the sum reaches `167 V` '
      + 'peak and, a quarter wave away, `3.33 A` peak, and **`44 W` of every '
      + '`100 W` is travelling back '
      + 'toward the radio**. The pattern is standing only in the sense that its '
      + 'envelope does not move.',
    view: 'station',
    focusStage: 'feedline',
    focusPart: 'coax',
    set: {
      antennaId: 'dipole-40',
      freqHz: 14_200_000,
      tunerMode: 'bypass',
      cableLengthM: 20,
      powerSetW: 100,
      keyed: true,
    },
    // Vf = sqrt(2 * 50 * 100) = 100 V peak; |gamma| = 0.667 at 5:1, so
    // Vmax = 167 V peak, Imax = 3.33 A peak, reflected = 44.4 W.
    takeaway: 'At 5:1 SWR, 44 W of every 100 W forward is heading back down the coax.',
  },
  {
    id: 'antinodes',
    title: 'Where the maxima sit',
    body:
      "Voltage maxima repeat every half wavelength, measured in the cable's own "
      + 'wavelength rather than free space. At `14.2 MHz` free space is `21.11 m`, '
      + 'but RG-213 has a velocity factor of `0.66`, so half a wave of cable is '
      + '`6.97 m` and the maxima are that far apart. Move the connector a quarter '
      + 'of that, `3.48 m`, and a voltage maximum becomes a current maximum: '
      + '**same line, same antenna, different impedance at the radio**.',
    view: 'station',
    focusStage: 'feedline',
    focusPart: 'coax-connector',
    set: { cableLengthM: 20, keyed: true },
    // [CABLES] c/f = 21.11 m at 14.2 MHz; x 0.66 = 13.93 m in RG-213.
    takeaway: 'In RG-213 at 14.2 MHz the voltage maxima are 6.97 m apart, not 10.56 m.',
  },
  {
    id: 'long-lossy-coax',
    title: 'Sixty metres of RG-58',
    body:
      'Load the `long-thin-coax` preset for the cable itself; a tour step can set '
      + 'the length but not the type. RG-58 at `14.2 MHz` loses `1.70 dB` per '
      + '100 ft, so `60 m` costs `3.35 dB`: **`100 W` in and `46 W` out with a '
      + 'perfect antenna on the end**. Add a `5:1` mismatch at the far end and the '
      + 'total is `5.47 dB`, or `28 W` at the feedpoint. The same run of LMR-400 costs `0.91 dB` '
      + 'and delivers `81 W`.',
    view: 'station',
    focusStage: 'feedline',
    focusPart: 'coax',
    set: {
      antennaId: 'dipole-20',
      freqHz: 14_200_000,
      tunerMode: 'bypass',
      cableLengthM: 60,
      powerSetW: 100,
      keyed: true,
    },
    // [CABLES] RG-58 1.700 dB/100 ft at 14.2 MHz -> 3.346 dB in 60 m -> 46.3 W.
    // Total loss at 5:1 from the standard lossy-line expression: 5.47 dB -> 28.4 W.
    takeaway: '3.35 dB in 60 m of RG-58 at 14.2 MHz: 100 W in, 46 W out when nothing is wrong.',
  },

  // ── 15-17 the antenna ─────────────────────────────────────────────────────
  {
    id: 'resonance-vs-match',
    title: 'Resonance is not match',
    body:
      'The dummy load is `50 + j0 Ω` at every frequency: a flawless `1.00:1` that '
      + 'radiates nothing. Resonance is a statement about reactance, `X = 0`; '
      + 'match is a statement about the whole impedance the source sees. A '
      + 'textbook half-wave dipole in free space is `73 + j42 Ω`, and trimming it '
      + 'to resonance leaves about `70 Ω` — **a resonant antenna that is still a '
      + '`1.4:1` load**, and none the worse for it.',
    view: 'station',
    focusStage: 'antenna',
    focusPart: 'antenna-element',
    set: { antennaId: 'dummy-load', tunerMode: 'bypass', keyed: true },
    // 73 + j42.5 ohm is the standard thin half-wave dipole result; shortening to
    // resonance gives roughly 70 ohm, which is 1.4:1 against 50 ohm.
    takeaway: 'A dummy load is 1.00:1 and radiates nothing. SWR is not a measure of radiation.',
  },
  {
    id: 'radiation-resistance',
    title: 'The resistance you cannot see',
    body:
      'A quarter-wave vertical over perfect ground has a radiation resistance '
      + 'near `36 Ω`. The return current comes back through the soil unless '
      + 'radials carry it, and that loss appears in series at the feedpoint. Add '
      + '`14 Ω` of ground loss and the feedpoint is exactly `50 Ω`: **a perfect '
      + '`1.00:1` that puts `28 %` of the transmitter into the ground**, a loss of '
      + '`1.4 dB`. The `36 Ω` is standard theory; the ground loss is our model and '
      + 'depends on soil and radial count.',
    view: 'station',
    focusStage: 'antenna',
    focusPart: 'antenna-element',
    set: {
      antennaId: 'vertical-quarter-40',
      freqHz: 7_150_000,
      tunerMode: 'bypass',
      keyed: true,
    },
    // 36 / (36 + 14) = 72 % efficiency = -1.4 dB, at an exact 50 ohm feedpoint.
    takeaway: '36 Ω of radiation plus 14 Ω of ground loss reads 1.00:1 and wastes 28 % of the power.',
  },
  {
    id: 'swap-antennas',
    title: 'Same wire, three bands',
    body:
      'A 40 m dipole is about `20 m` tip to tip: a half wave at `7.15 MHz` and '
      + 'roughly `70 Ω` at a normal height. At `14.2 MHz` that same wire is within '
      + '5 % of a full wavelength, the '
      + 'feed sits at a current minimum, and the feedpoint runs to **thousands of '
      + 'ohms**. At `21.3 MHz` it is close to three half waves and back to roughly '
      + '`100 Ω`. '
      + 'Step across the bands and watch the curve move while the antenna stays '
      + 'exactly where it is.',
    view: 'station',
    focusStage: 'antenna',
    focusPart: 'antenna-element',
    set: {
      antennaId: 'dipole-40',
      freqHz: 7_150_000,
      tunerMode: 'bypass',
      keyed: false,
    },
    takeaway: 'One wire: about 70 Ω on 40 m, thousands of ohms on 20 m, about 100 Ω on 15 m.',
  },

  // ── 18-20 what goes wrong ─────────────────────────────────────────────────
  {
    id: 'raise-the-swr',
    title: 'Make it worse on purpose',
    body:
      'A whip cut for 20 m, used on 160 m, is a small capacitor: a fraction of an ohm of '
      + 'radiation resistance behind thousands of ohms of reactance, which is as '
      + 'close to an open connector as this model gets. Almost all the forward '
      + 'power comes straight back. Icom documents a **two-step protection**: the '
      + 'radio reduces output and shows LMT, then inhibits transmit altogether. '
      + 'The thresholds are not published, so the foldback curve here is ours.',
    view: 'signal-path',
    focusStage: 'final-pa',
    focusPart: 'final-q1',
    set: {
      antennaId: 'mobile-whip-20',
      freqHz: 1_900_000,
      tunerMode: 'bypass',
      cableLengthM: 1,
      powerSetW: 100,
      keyed: true,
    },
    // [ICOM-PROT]
    takeaway: 'Protection is two steps: reduce output power, then disable the transmitter.',
  },
  {
    id: 'heat',
    title: 'Where the heat goes',
    body:
      'A key-down transmitter is already a heater: at 100 W out the finals are '
      + 'dissipating roughly the same again, and the only exits are the heatsink '
      + 'and the fan on the rear panel. What a mismatch adds is **not** the '
      + 'reflected power arriving back and being absorbed — the output network is '
      + 'a transformer, not a terminator, so the returning wave is re-reflected. '
      + 'What changes is the load line: off its design impedance the stage '
      + 'converts less DC into RF, and the difference stays in the silicon. '
      + 'Thermal masses and resistances here are representative; Icom publishes '
      + 'no thermal data for this radio.',
    view: 'thermal',
    focusStage: 'final-pa',
    focusPart: 'pa-heatsink',
    set: { keyed: true, powerSetW: 100 },
    // [ICOM-PROT] TEMP meter with a marked TX inhibit zone; 190 W from step 8.
    takeaway: 'The extra heat from a mismatch comes from lost efficiency, not from reflected power being absorbed.',
  },
  {
    id: 'damage',
    title: 'What actually breaks',
    body:
      'With the reflection near total, what the devices see depends on where the '
      + 'fault is along the line: a quarter wave turns a near-short into a '
      + 'near-open. One case raises peak drain voltage, the other raises peak '
      + 'current, and they are **different failure modes** — avalanche in '
      + 'microseconds, or thermal fatigue over minutes. The relays take stress '
      + 'too, because switching a mismatched line under power arcs the low-pass '
      + 'and antenna contacts. The failure modes are real; the damage thresholds '
      + 'are our model, not measured data.',
    view: 'thermal',
    focusStage: 'final-pa',
    focusPart: 'final-q2',
    set: { keyed: true },
    takeaway: 'The phase of the reflection decides whether the finals fail on voltage or on current.',
  },
]
