/**
 * Antinode — physical parts of the IC-7300, for the exploded view, the part
 * list and the damage map.
 *
 * SOURCES USED IN THIS FILE
 *
 *  [SM]   Icom IC-7300 SERVICE MANUAL, S-15218XZ-C1, March 2016.
 *         Section 1 specifications, section 2 inside views, section 3 circuit
 *         description, section 5 parts list, section 6 mechanical parts,
 *         section 8 general wiring, section 9 block diagram.
 *         https://www.rigpix.com/icom/ic7300_service.pdf
 *  [SPEC] Icom published IC-7300 specifications (Icom America product page):
 *         2-100 W, 4.3 inch colour TFT touch LCD, 15 discrete RF band-pass
 *         filters, SO-239 (50 ohm), 13.8 V DC, 21 A at 100 W,
 *         240 x 94 x 238 mm, 4.2 kg, tuner 16.7-150 ohm.
 *  [TI]   Texas Instruments PCM1802 product page: 24-bit stereo A/D, to 96 kHz.
 *  [REN]  Renesas ISL5857 product page: 12-bit, 3.3 V, 260 MSPS D/A converter.
 *  [MIT]  Mitsubishi RD70HVF1 device rating, 70 W at 175 MHz from 12.5 V
 *         (manufacturer rating as quoted by distributor datasheet listings;
 *         confirmed as the IC-7300 final by [SM] section 5 and by repair
 *         reports, e.g. RF Parts and the ad2cs.com repair bench write-up).
 *  [FAN]  Y.S. Tech FD128025HB-N: 80 x 80 x 25 mm, 12 V DC axial fan
 *         (distributor listings for the part number given in [SM] section 6).
 *
 * A note on the finals. The IC-7300 is widely reported to use RD100HHF1
 * devices. It does not. [SM] section 5, PA UNIT, lists Q131 and Q132 as
 * RD70HVF1C-121, and section 9 labels the pair "RD70HVF1 x2".
 *
 * Exploded layout. Offsets are metres in radio-local coordinates, added to a
 * part's assembled position. The radio is 0.24 (X) x 0.094 (Y) x 0.238 (Z) at
 * the origin, front face toward +Z. The scheme: the shell lifts straight up,
 * the front panel comes forward (+Z), the rear panel goes back (-Z), the PA
 * and filter assemblies fan out to the left (-X), the tuner to the right (+X),
 * and the main board stays as the datum with its devices rising above it.
 * Parts outside the radio do not explode and carry a zero offset.
 */

import type { PartDef } from './types'

export const PARTS: readonly PartDef[] = [
  // ── Station side of the microphone connector ───────────────────────────────
  {
    id: 'mic-capsule',
    name: 'Microphone element',
    assembly: 'station',
    part: 'HM-219',
    purpose: 'Turns the pressure wave in front of it into a few millivolts of audio.',
    detail:
      'The supplied hand microphone is an HM-219 and the radio presents 600 ohms to it. Icom does not publish the element type or its output level, so the level this model uses is a working figure rather than a measured one. Everything downstream is set by what arrives here: if the element is quiet, mic gain and compression are being asked to make up for it, and both cost you signal-to-noise. A failed element or an open cord reads as a normal transmit indication with no ALC movement at all.',
    stages: ['voice', 'mic-element'],
    stressKinds: [],
    failureMode: 'The element or its cord goes open and the radio transmits an empty carrier.',
    // 600 ohm mic input and the HM-219 are from [SM] section 1 and section 6;
    // the element itself is not published, so this card is representative.
    fidelity: 'representative',
    explodeOffset: [0, 0, 0],
  },

  // ── Main unit ──────────────────────────────────────────────────────────────
  {
    id: 'mic-preamp-ic',
    name: 'Microphone amplifier',
    assembly: 'main-board',
    part: 'IC1002 (TS462CPT)',
    purpose: 'Raises the microphone signal to a level the audio converter can digitise.',
    detail:
      'A small op-amp on the main unit, sitting between the front-panel MIC connector and the audio A/D converter. The same device also provides the low-pass filter for audio arriving from the rear ACC socket, which is why an over-driven ACC input and an over-driven microphone produce the same distortion. This is the last stage in the transmitter that is analogue audio; from the converter onward the signal is numbers. If it fails, the radio keys and draws current but nothing modulates.',
    stages: ['mic-preamp'],
    stressKinds: [],
    failureMode: 'The stage goes open or saturates and the transmitter produces a carrier with no speech on it.',
    // [SM] section 3-3 "MIC AMP and A/D converter"; section 5 MAIN UNIT: IC1002 TS462CPT.
    fidelity: 'confirmed',
    explodeOffset: [-0.09, 0.2, 0.05],
  },
  {
    id: 'af-codec',
    name: 'Audio A/D converter',
    assembly: 'main-board',
    part: 'IC1001 (PCM1802)',
    purpose: 'Samples the microphone audio into a digital stream for the DSP.',
    detail:
      'A 24-bit stereo delta-sigma converter clocked from the 12.288 MHz audio crystal; Icom does not publish the rate it runs at. Icom does not use a single codec here: this part digitises, a separate PCM1754 (IC991) converts received audio back to analogue, and USB audio goes through a third device, a PCM2901E (IC661). Audio from the ACC socket reaches the same converter through a mute switch (IC1003) and the filter in IC1002, so the microphone and the data port share one input path. Once past this chip the transmit signal is numbers until the transmit DAC, which is why compression, filtering and the transmit equaliser are settings rather than components.',
    stages: ['af-adc'],
    stressKinds: [],
    failureMode: 'The converter stops clocking and the transmitter modulates nothing, on every input.',
    // [SM] section 3-3 and section 5 MAIN UNIT: IC1001 PCM1802DBR, IC991/IC971
    // PCM1754DBQR, IC661 PCM2901E/2K, IC1003 TC7W53FK. [TI] for the PCM1802 rating.
    fidelity: 'confirmed',
    explodeOffset: [-0.09, 0.2, -0.05],
  },
  {
    id: 'fpga',
    name: 'FPGA and DSP',
    assembly: 'main-board',
    part: 'IC1351 (Altera EP4CE55F23I7N), IC901 (TI TMS320C6745)',
    purpose: 'Builds the transmit waveform and mixes it up to the operating frequency in arithmetic rather than in circuitry.',
    detail:
      'The DSP modulates the audio into a 36 kHz transmit IF. The FPGA takes that IF, generates the transmit local oscillator numerically and performs an image-rejection mix, so the up-conversion that would need a mixer, a filter and a synthesiser in an older radio happens as multiplications. The FPGA holds no program of its own: its configuration is loaded from external flash every time the radio is switched on, which is why a firmware update can change the shape of the transmitted signal. If configuration fails the radio powers up but neither receives nor transmits.',
    stages: ['dsp-tx', 'tx-mixer'],
    stressKinds: [],
    failureMode: 'Configuration fails at power-on and the radio lights up but produces nothing on any band.',
    // [SM] section 3-3 "FPGA" and the FPGA block diagrams; section 5 MAIN UNIT:
    // IC1351 EP4CE55F23I7N, IC901 TMS320C6745DPTPA3.
    fidelity: 'confirmed',
    explodeOffset: [0, 0.2, 0],
  },
  {
    id: 'tx-dac',
    name: 'Transmit D/A converter',
    assembly: 'main-board',
    part: 'IC1331 (Intersil ISL5857)',
    purpose: 'Turns the FPGA output into an analogue RF signal already on the operating frequency.',
    detail:
      'A 12-bit, 260 MSPS communications DAC, clocked here at 124.032 MHz. Because it runs at the operating frequency there is no transmit mixer and no VFO after it — the sample clock and the numbers are the only things that set where the signal lands. Its output goes through a reconstruction low-pass filter (L1281, L1282, C1281, C1283, C1285) that removes the sampling images before the RF unit sees the signal. A DAC clock problem shows up as spurious products at multiples of the clock rather than as low power.',
    stages: ['tx-dac'],
    stressKinds: [],
    failureMode: 'The converter or its clock stops and the transmitter produces no RF at all.',
    // [SM] section 3-3 "RF signal processing" and the MAIN UNIT transmit block
    // diagram (124.032 MHz DACLK); section 5: IC1331 ISL5857IAZ. [REN] for the rating.
    fidelity: 'confirmed',
    explodeOffset: [0.09, 0.2, -0.05],
  },
  {
    id: 'pll',
    name: 'Reference oscillator',
    assembly: 'main-board',
    part: 'X1201 (41.344 MHz)',
    purpose: 'Sets the frequency of everything the radio transmits and receives.',
    detail:
      'There is no phase-locked loop in this signal path. One crystal feeds a buffer and a clock chain that runs the converters at 124.032 MHz, three times the crystal, and the local oscillator is generated numerically inside the FPGA, so tuning is arithmetic rather than a voltage on a varactor. Icom specifies frequency stability better than plus or minus 0.5 ppm from -10 to +60 degC, which is about 7 Hz at 14 MHz. Reference error moves receive and transmit together, so it shows up as everyone telling you that you are off frequency, not as a mismatch between your dial and your signal.',
    stages: ['tx-mixer'],
    stressKinds: [],
    failureMode: 'The oscillator drifts or stops, taking receive and transmit frequency with it.',
    // [SM] section 5 MAIN UNIT: X1201 CR-932 XTCHH 41.344 MHz; MAIN UNIT block
    // diagrams show the 124.032 MHz converter clock and the FPGA DDS local
    // oscillator; section 1 gives the +/-0.5 ppm stability spec.
    fidelity: 'confirmed',
    explodeOffset: [0.09, 0.2, 0.05],
  },
  {
    id: 'bpf-bank',
    name: 'Band-pass filter bank',
    assembly: 'main-board',
    part: 'RF unit filter circuit, 15 filters',
    purpose: 'Keeps the transmit signal, and the receiver input, inside one band-sized slice of spectrum.',
    detail:
      'Fifteen in all: a low-pass below 1.59 MHz, a high-pass and a low-pass that bracket 1.60 to 30 MHz, and twelve band-pass sections from 1.60 to 74.80 MHz. Transmit and receive share them, so the same hardware that keeps a broadcast station out of the ADC keeps the transmitter tidy on the way out. They live on a separate shielded RF unit, not on the main board — this model groups them with the main board because the RF unit is not one of the assemblies drawn here. On transmit the filtered signal then passes the gain controller (D1051, D1052) and the YGR amplifier (IC1031) before it reaches the PA unit.',
    stages: ['bpf'],
    stressKinds: [],
    failureMode: 'A stuck filter switch leaves one band deaf and low on power while every other band works.',
    // [SM] section 3-2: "The filter circuit is composed of 15 filters", with the
    // RF UNIT receive and transmit block diagrams listing every range.
    // [SPEC] "15 discrete RF bandpass filters".
    fidelity: 'confirmed',
    explodeOffset: [0, 0.11, -0.1],
  },
  {
    id: 'main-board',
    name: 'Main unit',
    assembly: 'main-board',
    part: 'MAIN unit',
    purpose: 'Carries everything digital: the converters, the FPGA, the DSP, the CPU and every internal supply rail.',
    detail:
      'The largest board in the radio. Besides the transmit chain it holds the CPU (IC301, Renesas R7S721000), two serial flash devices, the USB hub and USB codec, the class-D audio amplifier and the step-down converters that make every internal rail. The receive ADC sits here too, as IC1301, fed through the LTC6401-20 driver at IC1261. Icom’s parts list gives IC1301 no part number and no order number; the LTC2208-14 identification comes from Farson’s teardown, not from Icom. The transmit signal leaves this board well under a watt, and everything a mismatch does happens downstream of it.',
    stages: ['af-adc', 'dsp-tx', 'tx-dac', 'tx-mixer'],
    stressKinds: [],
    failureMode: '',
    // [SM] section 2 MAIN UNIT inside view and section 5 MAIN UNIT parts list,
    // where IC1301 is listed as "RF ADC" with a dash in the part-number column and
    // IC1261 is its LTC6401-20 driver. Converter type from [Farson] teardown, not
    // from Icom; see RESEARCH.md Appendix A.
    fidelity: 'confirmed',
    explodeOffset: [0, 0, 0],
  },

  // ── PA unit ────────────────────────────────────────────────────────────────
  {
    id: 'predriver',
    name: 'Pre-drive amplifier',
    assembly: 'pa-board',
    part: 'Q111 (RD01MUS2)',
    purpose: 'Provides the first stage of gain on the PA unit.',
    detail:
      'One of three source-grounded stages that take the RF unit output up to drive level: an RF amplifier (Q101, 2SK2854), this pre-drive amplifier, and the drive amplifier. It handles well under a watt. Antenna mismatch does not reach here — the finals present their own input network to the driver, and the ALC loop reduces drive long before anything downstream changes. What does reach here is a fault in the ALC line, which shows as power that will not come down.',
    stages: ['predriver'],
    stressKinds: [],
    failureMode: 'The device fails open and the radio makes a few watts or none, with normal current draw.',
    // [SM] section 3-1 "DRIVE AMPLIFIER"; section 5 PA UNIT: Q111 RD01MUS2-T113,
    // Q101 2SK2854; section 9 block diagram labels the chain RF AMP, PRE DRIVE, DRIVE.
    fidelity: 'confirmed',
    explodeOffset: [-0.26, 0.26, 0.21],
  },
  {
    id: 'driver',
    name: 'Drive amplifier',
    assembly: 'pa-board',
    part: 'Q121 (RD15HVF1)',
    purpose: 'Raises the signal to the level the finals need at their gates.',
    detail:
      'A 15 W device driving a 100 W pair, so it runs well inside itself at rated output. Its idling current is set per radio at the factory, and the service manual has a DRIVER ID adjustment for it, because device gain varies enough between samples to matter. Its load is the finals input network, which does not change when the antenna does, so raising SWR does not directly stress this stage. Sustained key-down at full power does heat it, and it shares the heatsink path with the finals.',
    stages: ['driver'],
    stressKinds: [],
    failureMode: 'The device degrades and output falls on the higher bands first, where it has least gain in hand.',
    // [SM] section 3-1: "The idling current of drive amplifier (Q121) is
    // appropriately adjusted"; section 4-3 DRIVER ID adjustment; section 5 PA
    // UNIT: Q121 RD15HVF1-101.
    fidelity: 'confirmed',
    explodeOffset: [-0.26, 0.26, 0.13],
  },
  {
    id: 'final-q1',
    name: 'Final, first half',
    assembly: 'pa-board',
    part: 'Q131 (RD70HVF1C)',
    purpose: 'Amplifies one half of the push-pull waveform to transmitter power.',
    detail:
      'A Mitsubishi RD70HVF1, a 12.5 V silicon MOSFET rated 70 W at 175 MHz, used well below its frequency limit at HF. Two of them in push-pull produce 2 to 100 W on HF and 6 m from a 13.8 V supply. Note the part number: the IC-7300 is widely said to use RD100HHF1 devices, and it does not — the service manual parts list gives RD70HVF1C-121 for both finals. What a mismatch does here depends on where the reflected wave arrives in phase: one phase raises drain voltage, the opposite raises drain current, and they are different failures.',
    stages: ['final-pa'],
    stressKinds: ['junction-temperature', 'peak-voltage', 'peak-current'],
    failureMode: 'The channel shorts drain to source, the supply current pins, and the radio makes no power.',
    // [SM] section 3-1 "POWER AMPLIFIER"; section 5 PA UNIT: Q131 and Q132
    // RD70HVF1C-121; section 9 block diagram "Q131/Q132 RD70HVF1 x2". [MIT] rating.
    fidelity: 'confirmed',
    explodeOffset: [-0.26, 0.26, 0.05],
  },
  {
    id: 'final-q2',
    name: 'Final, second half',
    assembly: 'pa-board',
    part: 'Q132 (RD70HVF1C)',
    purpose: 'Amplifies the other half of the push-pull waveform to transmitter power.',
    detail:
      'The mate to Q131, conducting on the opposite half cycle. Push-pull cancels the even harmonics, which is why a 100 W transmitter can meet a harmonic spec of better than -50 dB from 1.8 to 28 MHz with only seven low-pass filters after it. The two devices are matched as a pair and their idling currents are set individually in the service adjustment. Icom specifies 21 A at 100 W from 13.8 V — about 290 W in for 100 W out, and the difference leaves as heat through the tab of these two parts.',
    stages: ['final-pa'],
    stressKinds: ['junction-temperature', 'peak-voltage', 'peak-current'],
    failureMode: 'The channel shorts drain to source and takes the supply fuse or the DC switch with it.',
    // [SM] section 3-1, section 4-3 FINAL1/FINAL2 IDV adjustments, section 5 PA
    // UNIT parts list, section 1 spurious emission and current drain specs.
    fidelity: 'confirmed',
    explodeOffset: [-0.26, 0.26, -0.03],
  },
  {
    id: 'swr-coupler',
    name: 'Directional coupler',
    assembly: 'pa-board',
    part: 'CM coupler L961 with detectors D961 and D962',
    purpose: 'Separates the forward and reflected waves so the radio can measure both.',
    detail:
      'A current-and-voltage sampling coupler on the PA unit, after the harmonic filters and before the tuner. Its two rectified outputs are buffered by IC981 and read by the CPU, which drives the meter and the protection. Where it sits is the whole lesson: what the radio calls SWR is the SWR at its own socket, after the tuner has done its work, not the SWR at the feedpoint. The tuner unit carries its own detectors — power (D1201), phase (D1311, D1312), SWR (D1505) and impedance (D1701) — and uses them only while it searches for a match.',
    stages: ['swr-bridge'],
    stressKinds: [],
    failureMode: 'Directivity degrades and the radio reports an SWR that an external meter does not agree with.',
    // [SM] section 3-1 "FORWARD AND REFLECT WAVES DETECTION CIRCUIT": CM coupler
    // with D961 and D962, buffered by IC981. Section 2 TUNER UNIT inside view
    // and section 9 for the tuner detectors. Section 5 PA UNIT: L961 LR-532A.
    fidelity: 'confirmed',
    explodeOffset: [-0.26, 0.26, -0.11],
  },
  {
    id: 'ant-relay',
    name: 'Transmit/receive relay',
    assembly: 'pa-board',
    part: 'RL801 (Fujitsu FTR-B4CA009Z)',
    purpose: 'Connects the receiver to the antenna line between transmissions and takes it off during them.',
    detail:
      'The changeover sits on the PA unit, not at the antenna socket: the receive path runs from the tuner unit through this relay and a 76 MHz low-pass filter before it reaches the RF unit. A separate mute switch (Q811, D811, D812) grounds the transmit line while receiving, to stop the amplifier chain oscillating on its own feedback. Icom rates the antenna socket at 100 mW maximum applied signal for the receiver front end. Full output is +50 dBm and that limit is +20 dBm, so this relay has to hold at least 30 dB of isolation every time the radio keys. It switches between transmissions rather than under RF, so contact arcing is not its normal wear mechanism.',
    stages: ['ant-relay'],
    stressKinds: [],
    failureMode: 'A contact that fails to open on transmit puts PA power into the receive path and destroys the front end.',
    // [SM] section 3-1 "(1) RECEIVE SIGNAL PROCESSING": TX/RX SW (RL801), the
    // 76 MHz LPF and the TX mute switch; section 5 PA UNIT: RL801 FTR-B4CA009Z;
    // service caution: "DO NOT apply an RF signal of more than 20 dBm (100 mW)".
    fidelity: 'confirmed',
    explodeOffset: [-0.26, 0.26, -0.19],
  },

  // ── Harmonic filter bank (built on the PA unit) ────────────────────────────
  {
    id: 'lpf-board',
    name: 'Harmonic filter bank',
    assembly: 'lpf-board',
    part: 'PA unit LPF section, 7 filters',
    purpose: 'Removes the harmonics the push-pull finals make before they reach the antenna.',
    detail:
      'Seven Chebyshev low-pass filters, covering 0.03-2.0, 2.0-4.0, 4.0-7.3, 7.3-14.35, 14.35-21.45, 21.45-33.0 and 33.0-76 MHz, one selected from the transmit frequency. There is no separate LPF board in this radio: Icom builds the bank on the PA unit next to the finals, and this model draws it separately only so the stage can be pointed at. The filters are what make the harmonic specification — better than -50 dB from 1.8 to 28 MHz and -63 dB on 6 m — achievable from a class AB pair. Everything reflected from the antenna passes back through the selected filter on its way to the finals.',
    stages: ['lpf-bank'],
    stressKinds: [],
    failureMode: '',
    // [SM] section 3-1 "LPF": Chebyshev filters selected by relays on both sides
    // of each LPF; section 9 block diagram gives the seven ranges; section 1
    // gives the harmonic spurious specification.
    fidelity: 'confirmed',
    explodeOffset: [-0.24, 0.08, 0.24],
  },
  {
    id: 'lpf-relay',
    name: 'Filter selection relays',
    assembly: 'lpf-board',
    part: 'RL820/821 to RL940/941 (Fujitsu FTR-B4CA009Z)',
    purpose: 'Switches one of the seven low-pass filters into the transmit line.',
    detail:
      'Fourteen relays, a pair per filter, one at each end, so an unselected filter is isolated at both ends instead of hanging on the line as a stub. The 9 V coils are driven from an 8-bit shift register (IC751) through transistor pairs Q771-Q777 and Q781-Q787, which is why a band change is one serial write rather than seven control lines. They change between transmissions, not under RF, so arcing is not what wears them out. What raises contact temperature is line current, and line current rises at a current antinode when the load is not 50 ohms.',
    stages: ['lpf-bank'],
    stressKinds: ['peak-current'],
    failureMode: 'A pitted contact adds resistance, drops power on one band and heats until it welds closed.',
    // [SM] section 3-1 "The LPFs are selected by the relays on both sides of each
    // LPF"; section 5 PA UNIT lists RL820/821, RL840/841, RL860/861, RL880/881,
    // RL900/901, RL920/921, RL940/941 as FTR-B4CA009Z; section 9 shows IC751
    // SN74AHC595PW driving Q771-Q777 and Q781-Q787.
    fidelity: 'confirmed',
    explodeOffset: [-0.24, 0.15, 0.3],
  },
  {
    id: 'lpf-cap',
    name: 'Filter capacitors',
    assembly: 'lpf-board',
    part: 'PA unit LPF capacitors (Murata GRM31A5C2J series)',
    purpose: 'Sets each filter cut-off with its toroid inductors, and shunts harmonic current to ground.',
    detail:
      'Class 1 surface-mount ceramics in 1206 cases, from 10 pF to 330 pF, working against toroid inductors wound on T50-2 and T50-10 iron-powder cores. They sit directly in the transmit line at the points of highest RF voltage. At 100 W into 50 ohms the RF here is about 100 V peak; a 3:1 mismatch raises that by the square root of the SWR, to about 173 V, which these parts tolerate. That is worth saying plainly: the filter capacitors are not where a mismatch does its damage.',
    stages: ['lpf-bank'],
    stressKinds: ['peak-voltage'],
    failureMode: 'A capacitor cracks or drifts, moving the filter cut-off and putting harmonics out of specification.',
    // [SM] section 5 PA UNIT: C824-C869 etc. are GRM31A5C2J###JW01D types, and
    // the LPF coils are LR-### (T50-2) and (T50-10) toroids plus LA-### solenoids.
    fidelity: 'confirmed',
    explodeOffset: [-0.24, 0.15, 0.22],
  },

  // ── Heatsink and airflow (Icom lists both as chassis parts) ────────────────
  {
    id: 'pa-heatsink',
    name: 'Main heatsink',
    assembly: 'chassis',
    part: 'MP51 (3765 MAIN HEATSINK-1)',
    purpose: 'Carries the heat out of the finals and hands it to the airflow.',
    detail:
      'The finals bolt down to it through thermal sheets; Icom lists it as a chassis part rather than a PA part, because it is structural as well as thermal. The PA unit carries an NTC thermistor (R351) and feeds a heat-sense line to the main unit, which the radio uses to run the fan and to protect the finals. Nothing in an aluminium block wears out. What fails is the interface: a loose bolt or a dried thermal sheet shows as PA temperature climbing much faster than it used to for the same key-down.',
    stages: ['final-pa'],
    stressKinds: [],
    failureMode: '',
    // [SM] section 6 CHASSIS PARTS: MP51 3765 MAIN HEATSINK-1, MP60/MP61 thermal
    // sheets; section 5 PA UNIT: R351 NTCG20 4AG 473JT thermistor; section 8
    // general wiring shows HSENI from the PA unit to the main unit.
    fidelity: 'confirmed',
    explodeOffset: [-0.4, 0.06, -0.02],
  },
  {
    id: 'cooling-fan',
    name: 'Cooling fan',
    assembly: 'chassis',
    part: 'MF1 (Y.S. Tech FD128025HB-N)',
    purpose: 'Moves air across the heatsink fins so the radio can keep transmitting.',
    detail:
      'An 80 by 80 by 25 mm 12 V axial fan on the chassis at the rear, next to the antenna socket. It is speed-controlled from the PA temperature rather than run flat out, which is why it is quiet in receive and audible partway into a long transmission. The radio is specified from -10 to +60 degC ambient, and the fan is what makes the top of that range survivable at full power. A blocked or seized fan does not blow anything up: temperature climbs, the radio folds power back, and it eventually stops transmitting.',
    stages: ['final-pa'],
    stressKinds: [],
    failureMode: 'The fan seizes or clogs, heatsink temperature runs away, and the radio folds power back and then stops transmitting.',
    // [SM] section 6 CHASSIS PARTS: MF1 FD128025HB-N, shown on the chassis
    // assembly drawing beside J1; section 9 shows the FAN drive from the main
    // unit; section 1 operating temperature range. [FAN] for the fan dimensions.
    fidelity: 'confirmed',
    explodeOffset: [-0.4, 0.06, -0.2],
  },

  // ── Tuner unit ─────────────────────────────────────────────────────────────
  {
    id: 'atu-board',
    name: 'Antenna tuner unit',
    assembly: 'tuner-board',
    part: 'TUNER unit',
    purpose: 'Transforms what the feedline presents into something the finals will work into.',
    detail:
      'A relay-switched L network between the directional coupler and the antenna socket. Icom specifies it for 16.7 to 150 ohms unbalanced, which is loads under about 3:1, brought to better than 1.5:1 in two to three seconds typically and fifteen at worst, with the settings memorised against frequency. It measures power, phase, SWR and impedance while it searches, and holds the result until the frequency moves. It matches at the radio and does nothing whatever to the standing wave on the feedline beyond it.',
    stages: ['atu'],
    stressKinds: [],
    failureMode: '',
    // [SM] section 1 antenna tuner specifications; section 2 TUNER UNIT inside
    // view; section 9 block diagram showing the tuner between the PA unit and
    // the antenna. [SPEC] "16.7-150 ohm unbalanced (VSWR better than 1:3)".
    fidelity: 'confirmed',
    explodeOffset: [0.26, 0.08, -0.06],
  },
  {
    id: 'atu-relay',
    name: 'Tuner relays',
    assembly: 'tuner-board',
    part: 'RL2011-RL2091, RL2111-RL2191 and six more (Panasonic EC2-9TNU)',
    purpose: 'Switches inductors and capacitors in and out to build a matching network.',
    detail:
      'Twenty-five relays on the tuner unit, driven by four BU2092FV shift registers (IC2811 to IC2841). Nine of them switch the inductors L2011 to L2091; the rest switch the capacitor bank and set which side of the L the shunt element sits on. These are the relays you hear during a tune cycle, which runs while the radio is putting out a carrier. Whether Icom sequences the drive down around each contact change is not published, so how much RF the contacts actually interrupt is unknown — the noise is the search, not necessarily arcing.',
    stages: ['atu'],
    stressKinds: ['relay-arcing', 'peak-current'],
    failureMode: 'Contacts pit and eventually weld, and the tuner starts finding matches it cannot hold.',
    // [SM] section 5 TUNER UNIT lists RL1011, RL1021, RL2011-RL2091,
    // RL2111-RL2191, RL2211, RL2221, RL2251, RL2261, RL2281 as EC2-9TNU (25
    // relays) and IC2811-IC2841 as BU2092FV-E2. The inductor/capacitor split
    // follows the designator pairing in the parts list.
    fidelity: 'confirmed',
    explodeOffset: [0.26, 0.17, -0.14],
  },
  {
    id: 'atu-inductor',
    name: 'Tuner inductors',
    assembly: 'tuner-board',
    part: 'L2011 to L2091',
    purpose: 'Provides the series reactance that moves a load toward 50 ohms.',
    detail:
      'Nine switched values. The two largest, L2081 and L2091, are wound on T68-2 iron-powder toroids; the smaller ones are air-wound solenoids, which is the usual trade — cores for inductance in a small volume, air where loss matters more than size. A matching network circulates reactive power equal to Q times the power it passes, so the current in the coil of a network working hard is well above the line current, and that current is what heats copper and core. This is where the loss in "the tuner fixed it" actually goes.',
    stages: ['atu'],
    stressKinds: ['circulating-current', 'core-saturation'],
    failureMode: 'The coil and core heat, inductance shifts with temperature, and the match drifts out during a long transmission.',
    // [SM] section 5 TUNER UNIT: L2011-L2071 are LA-### air-wound types,
    // L2081 is LR-542 (T68-2) and L2091 is LR-539 (T68-2).
    fidelity: 'confirmed',
    explodeOffset: [0.26, 0.17, -0.02],
  },
  {
    id: 'atu-cap',
    name: 'Tuner capacitors',
    assembly: 'tuner-board',
    part: 'C2111 to C2192, C2281, C2282, and C2183 (1200 pF mica)',
    purpose: 'Provides the shunt reactance the network needs on the other side of the L.',
    detail:
      'Values from 18 pF to 1200 pF, as a mixture of surface-mount and leaded high-voltage ceramics with one silvered mica part (C2183). They are physically larger and more highly rated than the harmonic-filter capacitors on the PA unit, because the voltage across a matching element rises with the network Q instead of staying at the line voltage. A network transforming a stubborn load holds far more volts across this bank than the 100 V peak the transmit line carries into 50 ohms. Mica appears where the dissipation and stability requirements are tightest.',
    stages: ['atu'],
    stressKinds: ['peak-voltage', 'dielectric-heating'],
    failureMode: 'A capacitor punctures or its dielectric heats and drifts, and the tuner will not repeat the same match twice.',
    // [SM] section 5 TUNER UNIT: GRM31A7U3D and GRM42A7U3F ceramic types,
    // DEC1X3J/DEA1X3D/DEHR33F leaded ceramics, and C2183 UC552H 1201J mica.
    fidelity: 'confirmed',
    explodeOffset: [0.26, 0.17, 0.1],
  },

  // ── Rear panel ─────────────────────────────────────────────────────────────
  {
    id: 'so239',
    name: 'Antenna socket',
    assembly: 'rear-panel',
    part: 'SO-239',
    purpose: 'The point where the radio ends and the station begins.',
    detail:
      'Chassis-mounted at the rear beside the fan and wired to the tuner unit. Icom specifies it as SO-239, 50 ohms unbalanced, and every number the radio reports about your antenna is measured on the inside of this connector. The UHF connector is not a constant-impedance design, but at 30 MHz the mismatched section inside it is a few thousandths of a wavelength long and cannot be measured on an SWR meter. Contact resistance can: a loose or corroded joint carries the whole line current and turns it into heat.',
    stages: ['so239'],
    stressKinds: ['connector-heating'],
    failureMode: 'A loose or corroded joint heats, its resistance climbs, and reported SWR rises with nothing wrong outside.',
    // [SM] section 1: "Antenna connector: SO-239 (antenna impedance: 50 ohm
    // unbalanced)"; section 6 CHASSIS PARTS J1 MR-DS-01-2; section 8 general
    // wiring shows [ANT] wired to the TUNER UNIT.
    fidelity: 'confirmed',
    explodeOffset: [-0.05, 0.02, -0.26],
  },
  {
    id: 'dc-jack',
    name: 'DC input',
    assembly: 'rear-panel',
    part: '',
    purpose: 'Brings 13.8 V into the radio and hands it straight to the PA unit.',
    detail:
      'Icom does not publish a reference designator for the rear DC connector, so none is given here. The supply lands on the PA unit first, through a reverse-connect protection diode (D202), a current-shunt monitor (IC211) that lets the CPU watch supply current, and a MOSFET switch (Q221). Icom specifies 13.8 V DC plus or minus 15 percent and 21 A at 100 W output, and the supplied cable carries two 25 A fuses on North American versions and two 30 A fuses on European ones. A supply that sags under key-down shows as output falling away through a transmission while SWR sits still.',
    stages: [],
    stressKinds: [],
    failureMode: 'Contact resistance or a sagging supply pulls the rail down and output falls off during transmit.',
    // [SM] section 1 power supply and current drain; section 5 PA UNIT: D202
    // DF30SC4M, IC211 INA199A2DCKR, Q221 TJ50S06M3L; section 6 ACCESSORIES
    // fuse ratings; section 9 block diagram [DC 13.8V] entry on the PA unit.
    fidelity: 'confirmed',
    explodeOffset: [0.05, 0.02, -0.26],
  },

  // ── Front panel ────────────────────────────────────────────────────────────
  {
    id: 'tft-panel',
    name: 'Display panel',
    assembly: 'front-panel',
    part: 'DS1 (RFE430H-AZH-DNS-000)',
    purpose: 'Shows the spectrum scope, the meters and the menus, and takes touch input.',
    detail:
      'A 4.3 inch colour TFT. The front unit carries the panel and a touch sensor; the display unit behind it carries the backlight driver (IC101), the LCD controller (IC152), a sub-microcontroller and the twenty-five front-panel switches. The scope it draws is computed in the FPGA from the same samples the receiver uses, so what you see is the ADC input, not a separate receiver. If the backlight driver fails the panel goes dark while the radio keeps working, and it will still transmit on whatever was set.',
    stages: [],
    stressKinds: [],
    failureMode: 'The backlight or its driver fails and the radio goes on working behind a dark screen.',
    // [SM] section 5 FRONT UNIT: DS1 RFE430H-AZH-DNS-000, EP1 EX-2500 SENSOR;
    // DISPLAY UNIT: IC101 TPS61161A, IC152 UC6528XBNQ4GRC, IC501 R5F104LCAFB,
    // S1-S25 LS37J2-T. [SPEC] "Large 4.3 inch color TFT touch LCD".
    fidelity: 'confirmed',
    explodeOffset: [-0.03, 0.05, 0.26],
  },
  {
    id: 'main-dial',
    name: 'Main dial',
    assembly: 'front-panel',
    part: 'K-300 knob assembly',
    purpose: 'Sets the operating frequency.',
    detail:
      'The knob runs against a friction brake: a brake plate, a button on the front panel and two brake pads, so drag is an adjustment rather than a fixed property. Everything else about tuning — step size, rate, how fast a spin translates into kilohertz — is firmware, not mechanism. Worn pads show up as a dial that either free-wheels or drags unevenly through a turn, without changing how the radio tunes.',
    stages: [],
    stressKinds: [],
    failureMode: 'The brake pads wear and the dial free-wheels or drags unevenly, with tuning otherwise unaffected.',
    // [SM] section 6 FRONT UNIT: MP3 KNOB K-300 ASSEMBLY, MP31 3765 BRAKE PLATE,
    // MP32 3765 BRAKE BUTTON, MP33 3073 BRAKE PAD x2, MP34 3765 BRAKE SHEET.
    fidelity: 'confirmed',
    explodeOffset: [0.04, 0.05, 0.38],
  },

  // ── Chassis ────────────────────────────────────────────────────────────────
  {
    id: 'speaker',
    name: 'Internal speaker',
    assembly: 'chassis',
    part: 'SP1',
    purpose: 'Reproduces the received audio.',
    detail:
      'An 8 ohm speaker driven by a class-D amplifier (IC721) rated at more than 2.5 W into 8 ohms at 10 percent distortion and 1 kHz. It is mounted under the top cover on a rubber surround, firing upward through a metal grille, which is why the radio sounds noticeably better with clear air above it than pushed under a shelf. Plugging into the rear EXT-SP jack disconnects it through a switch (Q746). Nothing in the transmit path passes through it.',
    stages: [],
    stressKinds: [],
    failureMode: 'The voice coil opens or rubs and receive audio is lost or distorted, with transmit unaffected.',
    // [SM] section 1 audio output power and 8 ohm output impedance; section 3-3
    // "AF circuit" naming IC721 and the speaker switch Q746; section 6 CHASSIS
    // PARTS: SP1, MP4 3765 SP RUBBER (TOP), MP5 3765 NET.
    fidelity: 'confirmed',
    explodeOffset: [0.14, 0.28, 0.12],
  },
  {
    id: 'chassis',
    name: 'Chassis and covers',
    assembly: 'chassis',
    part: 'MP1 chassis, MP2 upper cover, MP3 lower cover',
    purpose: 'Holds the boards, carries the heat and keeps the RF where it belongs.',
    detail:
      'A one-piece chassis with an upper and a lower cover; the whole radio is 240 by 94 by 238 mm excluding projections and weighs 4.2 kg. The chassis also carries the antenna socket, the fan and the heatsink, and it is the ground return that ties the PA, tuner and main units together. The RF unit has its own shield case and so does part of the main unit, because a direct-sampling receiver has no IF selectivity to hide behind. A cover left off is an RF leak and a change in the airflow, not only a cosmetic fault.',
    stages: [],
    stressKinds: [],
    failureMode: '',
    // [SM] section 1 dimensions and weight; section 6 CHASSIS PARTS: MP1 3765
    // CHASSIS, MP2 3765 U-COVER, MP3 3765 L-COVER; MP1251 3765 RF-SHIELD CASE,
    // MP721 3765 MAIN SHIELD CASE.
    fidelity: 'confirmed',
    explodeOffset: [0, 0.5, 0],
  },

  // ── Station: outside the radio, and not to Icom's specification ────────────
  {
    id: 'coax',
    name: 'Feedline',
    assembly: 'station',
    part: '',
    purpose: 'Carries power to the feedpoint, and carries the reflection back.',
    detail:
      'The line is where the standing wave lives, and it is the only part of the station whose behaviour changes with its length. Reflected power is not thrown away at the antenna: it travels back down the line, loses a little on the way, and is largely re-reflected at the transmitter or the tuner. What a mismatch actually costs is that extra travel through a lossy medium — negligible on a short run of good cable at 3.5 MHz, severe on a long run of thin cable at 50 MHz. This model uses published matched-loss curves fitted per cable type and derives the excess loss from the SWR at the load, so the numbers are representative of the type, not of your particular reel.',
    stages: ['feedline'],
    stressKinds: ['peak-voltage', 'dielectric-heating'],
    failureMode: 'The dielectric breaks down at a voltage antinode, or the line heats until the jacket softens and the geometry changes.',
    fidelity: 'representative',
    explodeOffset: [0, 0, 0],
  },
  {
    id: 'coax-connector',
    name: 'Feedline connector',
    assembly: 'station',
    part: '',
    purpose: 'Joins the cable to the radio.',
    detail:
      'A PL-259 into the radio SO-239. This is the highest-resistance point in an otherwise continuous conductor, and it carries the entire line current. Its problems are contact problems rather than impedance problems: at HF the connector geometry is far too short a piece of line to affect SWR, but a joint that is only finger-tight, or a braid soldered to nothing, is a resistance in series with your antenna. It usually announces itself as an SWR reading that changes when you move the cable.',
    stages: ['so239', 'feedline'],
    stressKinds: ['connector-heating'],
    failureMode: 'A loose or unsoldered joint heats, its resistance rises, and SWR climbs and moves as the cable is handled.',
    fidelity: 'representative',
    explodeOffset: [0, 0, -0.12],
  },
  {
    id: 'balun',
    name: 'Balun or feedline choke',
    assembly: 'station',
    part: '',
    purpose: 'Stops current flowing back along the outside of the coax braid.',
    detail:
      'A coaxial feedline has three conductors, not two, and the outside of the braid is the third. Without a choke at the feedpoint that third conductor becomes part of the antenna, which puts RF in the shack, changes the pattern, and makes the SWR reading depend on how the cable is routed. A current choke works by presenting a high common-mode impedance and leaves the differential path alone; a voltage balun does not do the same job, which is why the two are not interchangeable. This model treats the choke as ideal and does not simulate common-mode current.',
    stages: ['feedline', 'antenna'],
    stressKinds: ['core-saturation', 'peak-voltage'],
    failureMode: 'The core heats, permeability falls, the choking impedance collapses and the core cracks.',
    fidelity: 'representative',
    explodeOffset: [0, 0, 0],
  },
  {
    id: 'antenna-element',
    name: 'Antenna element',
    assembly: 'station',
    part: '',
    purpose: 'Turns the current flowing in it into a radiated field.',
    detail:
      'Feedpoint impedance is set by the length of the element in wavelengths, its height above ground and everything close to it, which is why the same dipole measures differently in two gardens. Nothing here has a manufacturer rating in the way a transistor does; what fails is mechanical or dielectric — a trap that arcs at a voltage maximum, a corroded joint at a wire end, a loading coil carrying more current than its wire was chosen for. The impedance models in this simulation are analytic approximations that reproduce the right resonances and the right orders of magnitude, not NEC results.',
    stages: ['antenna', 'space'],
    stressKinds: ['peak-voltage'],
    failureMode: 'A trap, insulator or loading coil arcs at a voltage maximum and either burns through or detunes.',
    fidelity: 'representative',
    explodeOffset: [0, 0, 0],
  },
]

export const partById = (id: string): PartDef | undefined => PARTS.find((p) => p.id === id)

export const PARTS_BY_ASSEMBLY: Record<string, readonly PartDef[]> = {
  'front-panel': PARTS.filter((p) => p.assembly === 'front-panel'),
  'main-board': PARTS.filter((p) => p.assembly === 'main-board'),
  'pa-board': PARTS.filter((p) => p.assembly === 'pa-board'),
  'lpf-board': PARTS.filter((p) => p.assembly === 'lpf-board'),
  'tuner-board': PARTS.filter((p) => p.assembly === 'tuner-board'),
  chassis: PARTS.filter((p) => p.assembly === 'chassis'),
  'rear-panel': PARTS.filter((p) => p.assembly === 'rear-panel'),
  station: PARTS.filter((p) => p.assembly === 'station'),
}
