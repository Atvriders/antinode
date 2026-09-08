/**
 * Antinode — the IC-7300 signal chain, stage by stage, microphone to space.
 *
 * ─── What this radio actually is ────────────────────────────────────────────
 *
 * The IC-7300 is not a superheterodyne with a DSP bolted on the back. On
 * receive it digitises the antenna directly; on transmit it synthesises the
 * signal at the operating frequency inside an FPGA and converts it to analogue
 * RF in one step. There is no transmit mixer and no transmit local oscillator.
 * Icom's own brochure puts it plainly: the direct sampling system makes it
 * "possible to eliminate physical mixer and filter devices". [BR]
 *
 * The transmit chain, traced off Icom's own block diagrams: [SCH BD-1, BD-2]
 *
 *   microphone -> TS462CPT amplifier -> PCM1802 audio A/D
 *     -> TMS320C6745 DSP + EP4CE55 FPGA (filtering, compression, P.S.N.
 *        sideband generation, digital up-conversion to the dial frequency)
 *     -> ISL5857 12-bit D/A at 124.033 MHz -> reconstruction low-pass
 *     -> RF unit: PIN-diode attenuators (ALC, DRIV) and a BGA2866 amplifier
 *     -> 15-section band-pass filter bank
 *     -> PA unit: 3 dB pad, 2SK2854, RD01MUS2, RD15HVF1, RD70HVF1 x2
 *     -> 7-section low-pass filter bank (relay switched)
 *     -> RL801 transmit/receive relay
 *     -> forward/reflected coupler (D961/D962)
 *     -> antenna tuner (relay-switched L network)
 *     -> J1, SO-239
 *
 * Two orderings in that list surprise people and are worth checking on the
 * diagram yourself. The coupler that feeds the SWR meter sits AFTER the
 * low-pass bank and BEFORE the tuner, so the meter reads the tuner's input.
 * And the transmit/receive relay sits between the low-pass bank and the
 * coupler, not between the tuner and the socket, so the receiver is fed
 * through the tuner and the coupler but never through the low-pass bank.
 *
 * ─── Sources ────────────────────────────────────────────────────────────────
 *
 * [IM]     Icom, "IC-7300 Instruction Manual (Full)", IC-7300_ENG_FM_12b.pdf,
 *          icomjapan.com. Section 16 is the specification table.
 * [SCH]    Icom Inc., "IC-7300/M/S SCHEMATIC DIAGRAMS", A-7290-3EX-w,
 *          (c) 2015-2016. BD-1 = BLOCK DIAGRAM-1 (RF, PA, TUNER units),
 *          BD-2 = BLOCK DIAGRAM-2 (MAIN unit). Sheet references such as
 *          MAIN-5 and PA-2 are the schematic sheets themselves.
 * [BR]     Icom, "IC-7300 pre-release information" brochure, ic7300br_en.pdf.
 * [IA]     Icom America IC-7300 product page (15 discrete RF band-pass
 *          filters; RF signals converted directly to digital in the FPGA).
 * [VA7OJ]  Adam Farson VA7OJ/AB4OJ, "IC-7300 User Evaluation & Test Report",
 *          Iss. 2, 3 June 2016, with an RF lab test suite in Appendix 1.
 *          Retrieved from the Internet Archive: the ab4oj.com domain has since
 *          been taken over and no longer hosts his work. This is the source
 *          for the receive A/D converter type and clock, which Icom's
 *          published schematic set does not identify.
 * [MIT70]  Mitsubishi Electric, RD70HVF1 datasheet, Oct 2011.
 * [MIT01]  Mitsubishi Electric, RD01MUS2 datasheet.
 * [REN]    Renesas ISL5857 product page (12-bit, 260+ MSPS, current output).
 * [TI1802] Texas Instruments PCM1802 product page (24-bit, 16-96 kHz).
 * [TI6745] Texas Instruments TMS320C6745 product page (375/456 MHz).
 * [CFR]    47 CFR 97.307(d) and (e), via govinfo.gov.
 *
 * ─── Honesty ────────────────────────────────────────────────────────────────
 *
 * fidelity: 'confirmed' means every claim in that stage's copy is traceable to
 * a source above, and the source is named in a comment beside it. Arithmetic
 * on a published number (peak volts from watts into 50 ohms) counts as
 * confirmed; a level that nobody publishes does not, and those stages are
 * marked 'representative' and say so in the copy itself. Icom does not publish
 * signal levels anywhere in the small-signal transmit chain, which is why the
 * three amplifier stages below the finals are all 'representative'.
 */

import type { StageDef, StageId } from '../rf/types'

export const STAGES: readonly StageDef[] = [
  {
    id: 'voice',
    index: 0,
    label: 'Voice',
    part: '',
    domain: 'acoustic',
    purpose:
      'Sets the ceiling on everything downstream: no later stage adds information to the speech, they can only spend it.',
    representation:
      'A pressure wave at the microphone, roughly 0.1 to 1 Pa (74 to 94 dB SPL) for close speech, with most of the intelligibility between 300 and 3000 Hz. Those are typical close-talking figures, not an Icom specification.',
    // TBW WIDE default 100-2900 Hz: [IM] 4-14 and 12-3.
    misconception:
      'That talking louder helps. The widest default SSB transmit filter passes 100 to 2900 Hz, and energy outside that is discarded at any volume.',
    fidelity: 'representative',
    components: [],
  },
  {
    id: 'mic-element',
    index: 1,
    label: 'Microphone element',
    // Supplied hand microphone HM-219: [IM] supplied accessories.
    // "Microphone impedance: 600 ohms": [IM] 16-2, Transmitter specifications.
    part: 'HM-219 hand microphone',
    domain: 'audio',
    purpose:
      'Converts pressure into a voltage at the 600 ohm impedance the radio is specified for, which is why a studio microphone needs an interface rather than a plug adaptor.',
    representation:
      'A few millivolts of audio from a 600 ohm source, into the 8-pin connector on the front panel. Icom publishes the 600 ohm figure; the millivolt level is an estimate.',
    misconception:
      'That the microphone makes RF. It makes an audio voltage. The first RF in this chain appears four stages later, at the transmit D/A converter.',
    fidelity: 'representative',
    components: ['mic-capsule'],
  },
  {
    id: 'mic-preamp',
    index: 2,
    label: 'Microphone amplifier',
    // IC1002 TS462CPT, MIC AMP block on the MAIN unit: [SCH] BD-2.
    part: 'IC1002 (TS462CPT)',
    domain: 'audio',
    purpose:
      'Raises the element output to the codec input range and fixes the noise floor of the whole transmitter, because nothing downstream can subtract noise added here.',
    representation:
      'Audio at a few hundred millivolts driving the codec, from a TS462CPT operational amplifier on the main unit. The device comes from Icom’s block diagram; the level is an estimate.',
    // "Adjust the MIC GAIN to where the ALC meter reads within the 30 to 50%
    // range of the ALC zone": [IM] 4-12, Setting the Speech Compressor.
    misconception:
      'That MIC GAIN sets transmit power. It sets how hard this stage drives the converter. Icom asks for 30 to 50 percent of the ALC zone on peaks, and gain past that buys distortion, not watts.',
    fidelity: 'representative',
    components: ['mic-preamp-ic', 'main-board'],
  },
  {
    id: 'af-adc',
    index: 3,
    label: 'Audio A/D converter',
    // IC1001 PCM1802DBR: [SCH] BD-2 and sheet MAIN-4.
    part: 'IC1001 (TI PCM1802)',
    domain: 'digital',
    purpose:
      'Ends the analogue transmitter: from here to the D/A converter the signal exists only as numbers, and every filter, compressor and modulator after it is arithmetic.',
    // 24-bit stereo delta-sigma, 16-96 kHz: [TI1802].
    // X901 CR-1021, 12.288 MHz on the MAIN unit: [SCH] BD-2.
    representation:
      '24-bit samples from a stereo delta-sigma codec specified for 16 to 96 kHz sampling. The main unit’s audio clock is a 12.288 MHz crystal. Icom does not publish the rate the codec is run at.',
    misconception:
      'That this is the converter people mean when they call the IC-7300 a direct-sampling radio. This one digitises speech. The receive converter is a different device on the same board, clocked at 124.033 MHz.',
    fidelity: 'confirmed',
    components: ['af-codec', 'main-board'],
  },
  {
    id: 'dsp-tx',
    index: 4,
    label: 'DSP and FPGA',
    // IC901 TMS320C6745DPTPA3 on sheet MAIN-4; IC1351 EP4CE55F23I7N on
    // sheet MAIN-6: [SCH]. Confirmed independently by [VA7OJ].
    part: 'IC901 (TI TMS320C6745), IC1351 (Altera EP4CE55F23I7N)',
    domain: 'digital',
    purpose:
      'Generates the transmitted signal outright: transmit filtering, speech compression, sideband generation and the move to the operating frequency are all arithmetic in these two devices.',
    // "Modulation system: SSB - P.S.N. modulation"; carrier suppression more
    // than 50 dB; unwanted sideband suppression more than 50 dB: [IM] 16-2.
    // TX filter defaults 100-2900 / 300-2700 / 500-2500 Hz: [IM] 4-14.
    representation:
      'Sample streams. Icom specifies SSB as P.S.N. modulation, so the unwanted sideband is cancelled by a phasing network in software instead of being filtered off by a crystal; carrier and unwanted sideband suppression are each specified at more than 50 dB. The transmit filter is 100 to 2900 Hz wide, 300 to 2700 or 500 to 2500 on the narrower settings.',
    // COMP zone is 10 to 20 dB: [IM] 4-12.
    misconception:
      'That the compressor makes you louder. It raises average power under a fixed peak ceiling: PEP stays where the ALC puts it while the average climbs. Icom asks for 10 to 20 dB on the COMP meter, and beyond that the density arrives as distortion.',
    fidelity: 'confirmed',
    components: ['fpga', 'main-board'],
  },
  {
    id: 'tx-dac',
    index: 5,
    label: 'Transmit D/A converter',
    // IC1331 ISL5857IAZ, sheet MAIN-5. The schematic pin list runs D11(MSB)
    // to D0(LSB): 12 bits. DACLK is 124.033 MHz, generated by the FPGA and
    // cleaned by a crystal band-pass filter and amplifier: [SCH] BD-2.
    // 12-bit, current output, 2 to 20 mA full scale: [REN].
    part: 'IC1331 (Intersil ISL5857)',
    domain: 'rf-low',
    purpose:
      'Produces the analogue transmit signal already on the operating frequency, which makes it the first point in the transmitter you could put on a spectrum analyser.',
    representation:
      'RF at the dial frequency from a 12-bit current-output converter with a 2 to 20 mA full-scale range, clocked at 124.033 MHz. Twelve bits and that clock define everything the radio will transmit.',
    // Receive converter is 14-bit (LTC2208-14): [VA7OJ].
    misconception:
      'That a transmitter needs more resolution than a receiver. This converter has 12 bits and the receive converter has 14, because the transmitter only has to make one clean signal while the receiver has to survive every signal on the band at once.',
    fidelity: 'confirmed',
    components: ['tx-dac', 'pll'],
  },
  {
    id: 'tx-mixer',
    index: 6,
    label: 'Up-conversion',
    // There is no transmit mixer and no transmit local oscillator. The
    // hardware at this point in the chain is the D/A reconstruction low-pass
    // and the FTXS-controlled transmit switch: [SCH] BD-2. Icom: the direct
    // sampling system makes it "possible to eliminate physical mixer and
    // filter devices" [BR]. The up-conversion is done digitally in the FPGA
    // [VA7OJ]. Nothing here carries a part designation, so part is ''.
    part: '',
    domain: 'rf-low',
    purpose:
      'Marks where a superheterodyne would mix an IF up to the band. Here the frequency was applied numerically inside the FPGA, and the hardware is a reconstruction low-pass filter and a transmit/receive switch.',
    // 124.033 / 2 = 62.0 MHz. Transmit range is 1.8 to 54 MHz: [IM] 16-1.
    representation:
      'The converter output with everything above half the clock removed. At a 124.033 MHz clock the first Nyquist zone reaches 62.0 MHz, which covers every band this radio transmits on.',
    // Reference X1201 CR-932, 41.344 MHz; DACLK cleaned by a crystal BPF:
    // [SCH] BD-2. Phase noise about 15 dB better than the IC-7200 at 1 kHz
    // offset: [IM] Features, and [BR].
    misconception:
      'That there is a VFO in here. There is no transmit mixer and no local oscillator: the operating frequency is a number. The transmitted phase noise follows the 41.344 MHz reference and the crystal filter that cleans the 124.033 MHz clock, not a chain of PLLs.',
    fidelity: 'confirmed',
    components: ['fpga', 'main-board'],
  },
  {
    id: 'bpf',
    index: 7,
    label: 'Band-pass filter bank',
    // 15 discrete RF band-pass filters: [IA], [BR], [VA7OJ]. Section edges
    // and the two transmit-only sections (B11TX 50.00-54.00 MHz, B12TX
    // 70.00-72.00 MHz) are read off [SCH] BD-1, RF UNIT.
    part: 'RF unit filter bank, 15 sections',
    domain: 'rf-low',
    purpose:
      'Cleans converter images and spurs off the signal before any power is added to them, using the same bank that protects the receive converter from the rest of the band.',
    representation:
      'Low-level RF confined to one filter section. The bank splits the range into fifteen paths, from a 0.03 to 1.59 MHz low-pass and a 1.60 to 1.99 MHz section up to 70.00 to 74.80 MHz. Two sections, 50.00 to 54.00 and 70.00 to 72.00 MHz, are switched in only on transmit.',
    // ALC and DRIV control PIN-diode attenuators (D1021, D1041, both BAP70Q)
    // on the RF unit, ahead of the PA unit: [SCH] BD-1, RF UNIT.
    misconception:
      'That band-pass filters are a receiver feature. The transmit signal goes through the same bank, and the level control that sets your output power lives on this board too: the ALC biases PIN-diode attenuators here rather than throttling the finals.',
    fidelity: 'confirmed',
    components: ['bpf-bank'],
  },
  {
    id: 'predriver',
    index: 8,
    label: 'Pre-drive amplifier',
    // Q111 RD01MUS2, preceded by a 3 dB pad and Q101 (2SK2854): [SCH] BD-1,
    // PA UNIT. Device rating Pout 0.8 W min / 1.3 W typ at VDD 7.2 V,
    // 520 MHz; VDSS 40 V; channel dissipation 12.5 W: [MIT01]. Those are
    // datasheet conditions, not the conditions inside this radio.
    part: 'Q111 (Mitsubishi RD01MUS2)',
    domain: 'rf-low',
    purpose:
      'Lifts the filtered signal to a level the driver can work with, and it is the first device in the chain that has to get rid of any real heat.',
    representation:
      'Under a watt of RF. The RD01MUS2 is a 1 W class MOSFET, rated 0.8 W minimum at 7.2 V in Mitsubishi’s test circuit, and in this radio it follows a 3 dB pad and a 2SK2854 stage. Icom does not publish the drive level here, so the figure is an estimate.',
    misconception:
      'That all the power comes from the finals. The transmit chain is four amplifiers deep before the low-pass bank; low output on one band is usually a small stage or a filter relay, not the finals.',
    fidelity: 'representative',
    components: ['predriver'],
  },
  {
    id: 'driver',
    index: 9,
    label: 'Drive amplifier',
    // Q121 RD15HVF1, DRIVE AMP: [SCH] BD-1, PA UNIT. Mitsubishi's datasheet
    // for this device was not obtained, so no rating is quoted for it.
    part: 'Q121 (Mitsubishi RD15HVF1)',
    domain: 'rf-low',
    purpose:
      'Supplies the gate drive the final pair needs, on the same board and the same duty cycle as the finals, with a fraction of their die area.',
    representation:
      'A few watts of RF into the gates of the final pair. The device is the RD15HVF1 named on Icom’s block diagram; the level is an estimate, because Icom publishes no drive figures.',
    // Bias networks for pre-drive, drive and power stages are separate blocks
    // (HFID1V, HFID2V, DRIDV): [SCH] BD-1, PA UNIT.
    misconception:
      'That bias is set once at the factory and forgotten. The pre-driver, driver and finals each have their own bias rail, and a drifted idling current shows up as distortion on the air long before it shows up as a power reading.',
    fidelity: 'representative',
    components: ['driver', 'pa-heatsink'],
  },
  {
    id: 'final-pa',
    index: 10,
    label: 'Final amplifier',
    // Q131/Q132, RD70HVF1 x2, PWR AMP: [SCH] BD-1, PA UNIT. Later parts
    // lists give the RD70HVF1C variant for the same positions.
    part: 'Q131, Q132 (Mitsubishi RD70HVF1, pair)',
    domain: 'rf-high',
    purpose:
      'Turns 13.8 V DC into RF at rather less than half efficiency, which means that at 100 W out it is making more heat than output.',
    // 2-100 W SSB/CW/RTTY/FM, 1-25 W AM; 13.8 V supply; 21.0 A maximum
    // transmit current: [IM] 16-1/16-2. Measured 100.5 W at 16.6 A on
    // 14.1 MHz, so 229 W DC in for 44 percent overall: [VA7OJ] Table 20.
    // 100 W into 50 ohms: Vpk = sqrt(2*100*50) = 100 V, Ipk = 2 A.
    representation:
      'Up to 100 W on HF and 50 MHz, 25 W on AM. Into 50 ohms that is 100 V peak and 2 A peak. Measured draw at 100 W on 14.1 MHz is 16.6 A from 13.8 V, so 229 W in for 100 W out; Icom specifies 21 A maximum.',
    // RD70HVF1 load VSWR tolerance: no destroy at 20:1, all phase angles,
    // VDD 15.2 V, Po 70 W, 175 MHz, with Pin control: [MIT70]. Two-step
    // protection (power down, then TX inhibit) triggered by PA temperature:
    // [IM] 13-4.
    misconception:
      'That a high SWR destroys the finals on the spot. Mitsubishi rates the RD70HVF1 to survive a 20:1 load at every phase angle — but at 70 W from 15.2 V and, crucially, with drive control: the device survives because something upstream pulls the drive back, which is exactly what the protection circuit here is doing. The radio’s two-step protection watches power amplifier temperature, and the damage that does accumulate is thermal.',
    fidelity: 'confirmed',
    components: ['final-q1', 'final-q2', 'pa-heatsink', 'cooling-fan', 'dc-jack'],
  },
  {
    id: 'lpf-bank',
    index: 11,
    label: 'Harmonic filter bank',
    // Seven relay-switched low-pass sections with the crossovers listed
    // below, selected by relay pairs RL820/821 through RL940/941 (Fujitsu
    // FTR-B4CA009Z): [SCH] BD-1 PA UNIT and sheet PA-2.
    part: 'PA unit low-pass sections, seven filters',
    domain: 'rf-high',
    purpose:
      'Removes the harmonics a class-AB amplifier inevitably makes, and it is the one part of the transmitter whose specification is written on behalf of other people.',
    // Harmonics less than -50 dB (1.8-28 MHz), less than -63 dB (50 MHz
    // band): [IM] 16-2. -50 dB of 100 W is 1 mW.
    representation:
      'Full transmitter power through one of seven relay-switched sections: 0.03 to 2.0, 2.0 to 4.0, 4.0 to 7.3, 7.3 to 14.35, 14.35 to 21.45, 21.45 to 33.0 and 33.0 to 76 MHz. Icom specifies harmonics below -50 dB from 1.8 to 28 MHz and below -63 dB on 50 MHz, so at 100 W the worst harmonic leaving the socket is about 1 mW.',
    // 47 CFR 97.307(d): at least 43 dB below the mean power of the
    // fundamental below 30 MHz for transmitters installed after 1 Jan 2003.
    // 97.307(e): at least 60 dB between 30 and 225 MHz. [CFR]
    misconception:
      'That the low-pass filter is there to protect your radio. It is there to protect everyone else. The FCC requires spurious emissions at least 43 dB below the fundamental below 30 MHz and 60 dB from 30 to 225 MHz, and this bank is what meets that.',
    fidelity: 'confirmed',
    components: ['lpf-board', 'lpf-relay', 'lpf-cap'],
  },
  {
    id: 'ant-relay',
    index: 12,
    label: 'Transmit/receive relay',
    // RL801, Fujitsu FTR-B4CA009Z, the one relay on the PA unit that is not
    // part of a low-pass pair: [SCH] sheet PA-2. Its position, between the
    // low-pass bank and the coupler, and the receive path through a
    // fc = 76 MHz low-pass and the Q811/Q1001 mute stages: [SCH] BD-1.
    part: 'RL801 (Fujitsu FTR-B4CA009Z)',
    domain: 'rf-high',
    purpose:
      'Hands the single antenna socket to either the low-pass bank or the receiver, which is why the receiver never looks through the transmit harmonic filters.',
    representation:
      'A 9 V signal relay carrying up to 100 W of RF, thrown between overs rather than during them. On receive its other contact routes the antenna through a 76 MHz low-pass and two mute stages to the preselector.',
    misconception:
      'That this relay sits between the tuner and the socket. It sits between the low-pass bank and the coupler. On receive the signal has already passed the socket, the tuner and the coupler before it reaches this relay.',
    fidelity: 'confirmed',
    components: ['ant-relay'],
  },
  {
    id: 'swr-bridge',
    index: 13,
    label: 'Directional coupler',
    // D961/D962 (LRB751S x2), PWR/SWR DET on the PA unit, positioned after
    // the low-pass bank and the T/R relay and before the tuner unit. Outputs
    // FORLP and REFLP buffered by IC981: [SCH] BD-1.
    part: 'D961, D962 (LRB751S), PA unit',
    domain: 'rf-high',
    purpose:
      'Measures forward and reflected power at one particular point, after the harmonic filters and before the tuner, and everything the radio says about SWR is said from there.',
    representation:
      'Two detected DC voltages, FORLP and REFLP, taken off the forward and reverse waves on the 100 W line. They drive the meter, the ALC loop and the protection circuit alike.',
    // "If the SWR meter indicates 1.5 or less, the antenna is matched":
    // [IM] 13-2. Tuner reduces SWR to less than 1.5:1 after 2-3 s: [IM] 11-2.
    misconception:
      'That the SWR reading describes your antenna. It describes everything beyond this point taken together: tuner, socket, coax, connectors and antenna. Switch the tuner in and the reading falls below 1.5:1 while the antenna has not changed at all.',
    fidelity: 'confirmed',
    components: ['swr-coupler'],
  },
  {
    id: 'atu',
    index: 14,
    label: 'Antenna tuner',
    // TUNER unit: nine switched inductors (L2011-L2091) and a switched
    // capacitor bank, thrown by around 23 latching relays (RL2011-RL2281):
    // [SCH] sheets TUNER-1/TUNER-2. "Relay-chain type auto-tuner ... in the
    // signal path on receive and transmit": [VA7OJ].
    part: 'TUNER unit, relay-switched L network',
    domain: 'rf-high',
    purpose:
      'Presents the finals with something near 50 ohms by inserting reactance between them and the feedline; it changes what the radio sees, not what the antenna does.',
    // Tunable impedance range 16.7-150 ohms, less than 3:1 VSWR; tuning
    // accuracy less than 1.5:1; 2-3 s average, 15 s maximum: [IM] 16-3.
    // Up to 100 relay combinations memorised, reused within +/-1.5% of the
    // memorised frequency, otherwise bypass: [IM] 11-2.
    representation:
      'The same 100 W passing through switched inductors and capacitors. Icom specifies a matching range of 16.7 to 150 ohms at an SWR below 3:1, a result better than 1.5:1, and 2 to 3 seconds to get there, 15 seconds at worst. It remembers up to 100 relay combinations and reuses one within 1.5 percent of its frequency.',
    // "If the tuner cannot tune, TUNE disappears and the tuning circuit is
    // automatically bypassed": [IM] 11-2. Emergency tuner mode allows SWR
    // above 3:1 but limits output to 50 W: [IM] 11-4.
    misconception:
      'That a tuner fixes a bad antenna. The standing wave on the feedline is exactly as it was; the tuner sits at the radio end, so the extra loss stays out on the coax where you cannot see it. When it fails to match it takes itself out of circuit and hands the raw load back to the finals.',
    fidelity: 'confirmed',
    components: ['atu-board', 'atu-relay', 'atu-inductor', 'atu-cap'],
  },
  {
    id: 'so239',
    index: 15,
    label: 'Antenna socket',
    // "Antenna impedance: 50 ohms unbalanced": [IM] 16-1. SO-239 socket, J1.
    // 100 W into 50 ohms: Vpk = 100 V, Ipk = 2 A.
    part: 'J1 (SO-239)',
    domain: 'rf-high',
    purpose:
      'Marks the edge of Icom’s specification: inside it the radio is 50 ohms unbalanced by design, outside it nothing is specified at all.',
    representation:
      'A UHF-series socket carrying up to 100 W into a nominal 50 ohms unbalanced, which at full power is 100 V peak and 2 A peak. A corroded joint here dissipates the difference in a few square millimetres of contact.',
    misconception:
      'That the station starts here. It ends here. Every fault the SWR bridge reports is on the far side of this socket, and every one of them is yours.',
    fidelity: 'confirmed',
    components: ['so239', 'chassis'],
  },
  {
    id: 'feedline',
    index: 16,
    label: 'Feedline',
    part: '',
    domain: 'rf-high',
    purpose:
      'Carries power in both directions at once, and transforms the antenna’s impedance into something else at the radio end unless the line happens to be matched.',
    // Matched-line figure: 100 W into a 50 ohm line is 100 V peak, constant
    // along the run. Loss in this simulation comes from published cable
    // attenuation tables (see src/rf/cables.ts), not from measurement.
    representation:
      'Forward and reflected travelling waves on a 50 ohm line. Matched, the voltage is the same everywhere: 100 W is 100 V peak at both ends. Mismatched, the peaks and nulls stand still along the line and the antinodes can run several times higher. The loss modelled here comes from published attenuation tables, not from your cable.',
    misconception:
      'That reflected power comes back and is burned in the radio. Most of it is re-reflected at the transmitter; what the mismatch actually costs is extra heating in the line, which is why a long lossy run flatters the SWR meter instead of fixing anything.',
    fidelity: 'representative',
    components: ['coax', 'coax-connector'],
  },
  {
    id: 'antenna',
    index: 17,
    label: 'Antenna',
    part: '',
    domain: 'rf-high',
    purpose:
      'Turns a guided wave into a radiated one; its feedpoint impedance is the load every earlier stage has been arguing about.',
    // Textbook values, not a NEC model of any particular installation:
    // a half-wave dipole in free space is near 73 ohms resistive at
    // resonance and rises to thousands of ohms at twice that frequency.
    representation:
      'A complex feedpoint impedance and a current distribution along the wire. A half-wave dipole in the clear is near 70 ohms resistive at resonance and thousands of ohms at twice that frequency; height above ground moves the resistive part by tens of ohms. These are textbook figures, and the model behind this display is an approximation, not a simulation of your installation.',
    misconception:
      'That a 1:1 SWR means a good antenna. A dummy load is a perfect match and radiates nothing. SWR tells you how well the antenna matches the line, not how much of your power leaves the property.',
    fidelity: 'representative',
    components: ['antenna-element', 'balun'],
  },
  {
    id: 'space',
    index: 18,
    label: 'Radiation',
    part: '',
    domain: 'radiated',
    purpose:
      'Does the only job that matters; everything before it exists to put current into a conductor at the right frequency, phase and place.',
    // Half-wave dipole gain 2.15 dBi (1.64 numeric). Free-space field
    // strength E = sqrt(30*P*G)/d: 100 W, G = 1.64, d = 1000 m gives
    // 70 mV/m. Textbook relations, not an Icom or measured figure.
    representation:
      'An electromagnetic field. 100 W into a half-wave dipole is about 2.15 dBi broadside and roughly 70 mV/m at 1 km in free space. Ground, obstacles and the ionosphere decide what actually arrives, and none of that is modelled here.',
    misconception:
      'That radiated power is what the radio reports. The radio reports forward minus reflected at its own coupler. Tuner loss, feedline loss and connector loss all happen after that measurement, and none of them reach the meter.',
    fidelity: 'representative',
    components: ['antenna-element'],
  },
]

/**
 * Total lookup. STAGES contains every StageId exactly once, so indexing a
 * Record keyed by the StageId union is safe under noUncheckedIndexedAccess.
 */
const BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s])) as Record<StageId, StageDef>

export const stageById = (id: StageId): StageDef => BY_ID[id]

/** The transmit chain in signal order: microphone to space. */
export const TX_STAGES: readonly StageId[] = [
  'voice',
  'mic-element',
  'mic-preamp',
  'af-adc',
  'dsp-tx',
  'tx-dac',
  'tx-mixer',
  'bpf',
  'predriver',
  'driver',
  'final-pa',
  'lpf-bank',
  'ant-relay',
  'swr-bridge',
  'atu',
  'so239',
  'feedline',
  'antenna',
  'space',
]

/**
 * The receive chain in signal order: space to the DSP.
 *
 * Only the stages that exist on both paths have a StageId. Going inward from
 * the antenna the signal passes the socket, the tuner and the coupler before
 * it reaches the transmit/receive relay, and it never passes the transmit
 * low-pass bank at all: [SCH] BD-1. The receive-only blocks between the
 * band-pass filters and the DSP -- the preamplifiers and attenuator, the
 * receive A/D converter, the down-converter in the FPGA and the spectrum
 * scope -- have no StageId of their own and are described in RX_STAGE_NOTES.
 */
export const RX_STAGES: readonly StageId[] = [
  'space',
  'antenna',
  'feedline',
  'so239',
  'atu',
  'swr-bridge',
  'ant-relay',
  'bpf',
  'dsp-tx',
]

/**
 * Receive path notes, keyed by StageId where one exists and by a plain
 * receive-only key where it does not. Sources are the same set as above.
 */
export const RX_STAGE_NOTES: Readonly<Record<string, string>> = {
  space:
    'The receiver starts with whatever the site gives it. Below about 10 MHz the band noise arriving on the antenna is far above the radio’s own noise floor, which is why Icom advises against the preamplifier on 7 MHz and down.',

  antenna:
    'The antenna is a two-way device and its pattern on receive is the pattern it has on transmit. Nothing in the receiver can recover a signal the antenna did not collect.',

  feedline:
    'Feedline loss costs you signal and noise in equal measure, so on a noisy low band a lossy run barely changes what you hear; on 50 MHz, where the receiver’s own noise matters, the same loss is expensive.',

  so239:
    'The socket is specified as 50 ohms unbalanced (Icom, IC-7300 specifications). Receive sensitivity is quoted at this connector: less than -123 dBm for 10 dB S/N on SSB from 1.8 to 30 MHz with preamplifier 1, and -125 dBm on 50 MHz with preamplifier 2.',

  atu:
    'The tuner is in the signal path on receive as well as transmit (Farson, IC-7300 evaluation report). Leaving it engaged after a match changes the impedance the front end sees, which changes preamplifier loading slightly and nothing else.',

  'swr-bridge':
    'The forward and reflected detector sits in the receive path too, between the tuner and the transmit/receive relay, but it is a coupler: on receive it does nothing except pass the signal through.',

  'ant-relay':
    'RL801 selects the receiver. On receive the antenna reaches the RF unit through a 76 MHz low-pass and two mute stages, not through the transmit harmonic filters (Icom block diagram 1).',

  bpf:
    'The preselector: fifteen switched filter sections, from a 0.03 to 1.59 MHz low-pass and a 1.60 to 1.99 MHz section up to 70.00 to 74.80 MHz (Icom; the fifteen filters are Icom’s own count). In a direct-sampling receiver this bank is the only thing standing between the antenna and a converter that digitises the whole band at once, so it decides what the converter has to survive.',

  'dsp-tx':
    'The same FPGA and DSP that build the transmitted signal are the entire receiver behind the converter: the FPGA does the down-conversion and the DSP does the filtering and demodulation. The two halves of that work are set out separately below, under the down-converter and the DSP.',

  'preamp-att':
    'Two preamplifiers and a pad. Preamplifier 1 is the wide-dynamic-range stage for the HF bands, preamplifier 2 the high-gain one for 50 MHz (Icom manual, 4-3). The front-panel attenuator is 20 dB in Icom’s CI-V command set, and the block diagram labels the pad itself 18 dB. A separate 16 dB attenuator is switched in below 1.7 MHz to keep broadcast stations out of the converter.',

  'rx-adc':
    'The heart of the radio: a Linear Technology LTC2208-14 sampling at 124.033 MHz, 14 bits, fed through an LTC6401-20 driver (Farson, from teardown; Icom’s published schematic set does not identify the converter). Every signal from 30 kHz to 74.8 MHz that gets past the preselector has to fit inside those 14 bits at once. Measured overflow at 14.1 MHz is -10 dBm at the socket with the preamplifier off, -23 dBm on preamplifier 1 and -27 dBm on preamplifier 2. IP+ turns on converter dither and output randomisation, trading a little sensitivity for intermodulation performance.',

  ddc:
    'The FPGA, an Altera EP4CE55F23I7N, multiplies the sample stream by a numerically generated carrier and decimates it, handing the DSP a band about 12 kHz wide centred on 36 kHz (Farson). Icom’s own specification calls the receiver a "direct sampling superheterodyne" with a 36 kHz intermediate frequency, and 36 kHz is where that IF lives: in arithmetic, not in a can.',

  'dsp-rx':
    'A TMS320C6745, a fixed and floating point DSP running at 375 or 456 MHz, does selectivity, AGC, noise reduction, notch and demodulation. Icom specifies the SHARP SSB filter as more than 2.4 kHz at -6 dB and less than 3.4 kHz at -40 dB, a shape factor no crystal filter at this price could hold, and the AGC controls a PIN-diode attenuator ahead of the converter rather than an IF gain stage.',

  scope:
    'The spectrum scope is an FFT of the same samples the receiver is demodulating, not a second receiver and not a swept analyser. The FPGA passes about 1 MHz of spectrum to the display processor (Farson); spans run from plus or minus 2.5 kHz to plus or minus 500 kHz and the resolution bandwidth reaches 50 Hz or better. It costs nothing in receive performance because the samples were already there, and it stops where the FPGA stops, not where the band stops.',
}
