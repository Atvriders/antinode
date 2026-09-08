/**
 * Antinode — misconception cards.
 *
 * These are the load-bearing teaching content. Every `evidence` field carries a
 * number that can be checked: either a figure quoted from a published source, or
 * arithmetic done from the models in src/rf with the inputs written out so the
 * reader can repeat it.
 *
 * ── Sources used in this file ────────────────────────────────────────────────
 *
 * [MANUAL]   Icom IC-7300 Instruction Manual (Full).
 *            - Antenna tuner: "matches the transceiver to the antenna within the
 *              range of 16.7 ~ 150 ohm (SWR of less than 3:1)"; tuning accuracy
 *              "Less than 1.5:1 VSWR"; tuning time 2-3 s typical, 15 s maximum.
 *            - Emergency mode (Tuner): allows tuning above 3:1 and "limits the
 *              maximum output power to 50 W".
 *            - Protection function: "The transceiver has a 2 step protection
 *              function to protect the final power amplifiers in case the antenna
 *              SWR becomes high. The function detects the power amplifier
 *              temperature and activates when the temperature becomes too high."
 *              Step 1 "Power down transmission" (displays LMT), step 2 "TX inhibit".
 *            - Transmit output power, HF and 50 MHz: SSB/CW/RTTY/FM 2~100 W,
 *              AM 1~25 W. Harmonics "Less than -50 dB (1.8~28 MHz)".
 *            - Speech Compressor: set MIC GAIN so the ALC meter reads "within the
 *              30 to 50 % range of the ALC zone"; keep the COMP meter inside the
 *              marked zone, "10 to 20 dB range".
 *
 * [SERVICE]  Icom IC-7300 Service Manual.
 *            - Final devices Q131, Q132 = RD70HVF1C-121 (parts list).
 *            - "The transmit signal from the drive amplifier (Q121) is applied to
 *              the push-pull power amplifier (Q131 and Q132) to be amplified up to
 *              100 watts (for the HF/50 MHz band)."
 *            - "The transmit signal is passed through the SWR detection circuit,
 *              which is composed of the CM coupler and rectifier diodes."
 *            - PA block diagram carries an "SWR-APC" control line into the
 *              automatic power control, alongside "ID-APC".
 *
 * [RD70]     Mitsubishi RD70HVF1C data sheet, publication date Jun. 2019.
 *            VDSS 30 V; VGSS -5/+10 V; Pch 150 W; ID 20 A; Tch 175 degC;
 *            Rth(j-c) 1.0 degC/W. "Load VSWR tolerance ... Vds=15.2V, Po=70W
 *            (PinControl), f=175MHz, Idq=2.0A, Zg=50, Load VSWR=20:1 (All phase)
 *            -> No destroy."
 *
 * [K6OIK-A]  S. D. Stearns, K6OIK, "Facts About SWR, Reflected Power, and Power
 *            Transfer on Real Transmission Lines with Loss", ARRL Pacificon
 *            Antenna Seminar, October 2010.
 * [K6OIK-B]  S. D. Stearns, K6OIK, "Conjugate Match Myths", ARRL Pacificon
 *            Antenna Seminar, October 2011.
 *            Between them: the additional-loss-due-to-SWR expression, the
 *            coth(alpha*l) bound on input SWR, and the refutation of the central
 *            single-ended conjugate-match claim in Maxwell's "Reflections".
 *
 * [W8JI-VAR] Tom Rauch, W8JI, "VSWR Reactive Power", w8ji.com.
 *            88 ft dipole at 3.72 MHz with 100 W: 21.58 - j500.3 ohms, 2.153 A,
 *            1078 V at the feedpoint, "VAR power is 2317 watts", "like we have
 *            increased power level 23 times".
 * [W8JI-TUN] Tom Rauch, W8JI, "ANTENNA TUNERS or Matching Networks", w8ji.com.
 *            T-network at 1000 W matching 50 to 50 ohms, inductor Q 200,
 *            capacitor Q 3000: 130 deg phase shift = 22 W lost, 170 deg = 109 W.
 *
 * [N6LF]     Rudy Severns, N6LF, "Experimental Determination of Ground System
 *            Performance for HF Verticals - Part 3", QEX, March/April 2009,
 *            Table 1. 33.5 ft vertical, 7.2 MHz, 33 ft radials on the ground:
 *            64 radials 39.7 - j1.2; 32 radials 42.9 + j2.1; 16 radials
 *            56.1 + j6.2; 8 radials 85.5 + j8.0; 4 radials 137 + j14.9 ohms.
 *
 * [K9YC]     Jim Brown, K9YC, "Understanding and Solving RF Interference
 *            Problems" (RFI-Ham.pdf), k9yc.com.
 *            Choking impedance: 500 ohms traditional, Maxwell 1000 ohms for
 *            pattern, W1HIS 5000 ohms for noise, K9YC concurs. Noise coupled from
 *            the feedline falls as 20 log(Z1/Z2), so 6 dB per doubling.
 *
 * [FCC]      47 CFR 97.307(b): emissions outside the necessary bandwidth must not
 *            cause splatter or keyclick interference on adjacent frequencies.
 *
 * ── Arithmetic used below ───────────────────────────────────────────────────
 *
 * Cable figures come from the fit in src/rf/cables.ts, evaluated at the stated
 * frequency and length, and from the standard lossy-line relations:
 *
 *   matched loss a (power ratio)  = 10^(matchedLossDb / 10)
 *   |gamma| at the radio          = |gamma| at the load / a
 *   additional loss dB            = 10 log10[(1 - |gamma_in|^2)/(1 - |gamma_L|^2)]
 *   max input SWR, open or short  = (a + 1) / (a - 1) = coth(alpha * l)   [K6OIK]
 *
 * Worked values quoted in this file, all recomputed rather than remembered:
 *
 *   SWR   |gamma|   reflected     mismatch loss   return loss
 *   1.5   0.2000     4.000 %      0.177 dB        13.98 dB
 *   2.0   0.3333    11.111 %      0.511 dB         9.54 dB
 *   3.0   0.5000    25.000 %      1.249 dB         6.02 dB
 *  10.0   0.8182    66.942 %      4.807 dB         1.74 dB
 *
 *   30 m RG-213 @ 14.2 MHz: matched 0.652 dB. Into 4:1 -> radio reads 3.13:1,
 *     additional loss 0.592 dB, total 1.244 dB. 100 W net in -> 75.1 W at the
 *     antenna; the same line matched would deliver 86.1 W.
 *   30 m RG-58  @ 28.5 MHz: matched 2.423 dB (100 W -> 57.2 W). a = 1.7472, so
 *     open or short at the far end reads 3.68:1; a 10:1 antenna reads 2.76:1;
 *     a 3:1 antenna reads 1.80:1.
 *   30 m RG-58  @  3.5 MHz: matched 0.808 dB (100 W -> 83.0 W).
 *   30 m RG-213 @ 28.5 MHz: matched 0.939 dB (100 W -> 80.6 W).
 *   30 m LMR-400@ 28.5 MHz: matched 0.650 dB (100 W -> 86.1 W).
 *   N6LF Table 1 referred to 50 ohms: 4 radials 2.78:1, 8 radials 1.73:1,
 *     16 radials 1.18:1, 32 radials 1.17:1, 64 radials 1.26:1.
 */

import type { MythCard } from './types'

export const MYTHS: readonly MythCard[] = Object.freeze([
  {
    id: 'reflected-power-burns-finals',
    myth: 'Reflected power comes back down the coax and burns up the finals.',
    reality:
      'Forward and reflected are the two travelling-wave components of one field. '
      + 'Only their difference is a net flow of energy, and in the steady state the '
      + 'only accounting that closes is: DC in equals net RF out plus heat. A '
      + 'transistor amplifier has no fixed 50 ohm source resistance for the returning '
      + 'wave to be absorbed in, so no fixed share of it lands in the devices. The '
      + 'finals are still stressed, for a different reason. The mismatch rotates the '
      + 'load the drains work into, which moves the load line: depending on the angle '
      + 'of the reflection that raises peak drain voltage or peak drain current, drops '
      + 'efficiency, and turns more of the same DC input into heat in the same die.',
    evidence:
      'The IC-7300 runs two RD70HVF1C on 13.8 V. At full output the ideal class-B '
      + 'push-pull drain swing is 2 x 13.8 = 27.6 V peak against a 30 V VDSS rating, '
      + 'leaving 2.4 V of headroom before the mismatch is considered. The same data '
      + 'sheet rates the device "no destroy" into a 20:1 load at every phase angle at '
      + '70 W and 15.2 V, but only with the input power controlled.',
    demo:
      'Set the 40 m dipole, tune to 20 m, leave the tuner in bypass, key PTT, and '
      + 'watch the PA temperature readout on the fast time scale while forward power '
      + 'folds back.',
  },
  {
    id: 'reflected-power-is-wasted',
    myth: 'Whatever the meter shows as reflected power is power you have lost.',
    reality:
      'On a line with no loss, none of it is lost. Net power is the difference between '
      + 'the two waves, and on a lossless line that difference is the same at every '
      + 'point, so whatever the transmitter delivers arrives at the antenna no matter '
      + 'how large the reflected reading is. What the mismatch genuinely '
      + 'costs is extra dissipation in the line itself. The standing wave raises the '
      + 'current at the current maxima and the voltage at the voltage maxima, so both '
      + 'the conductor heating and the dielectric heating rise above the matched-line '
      + 'figure. That excess is the additional loss due to SWR, and it is the only '
      + 'line loss the mismatch is responsible for.',
    evidence:
      '30 m of RG-213 at 14.2 MHz has 0.652 dB of matched loss. Feeding a 4:1 load '
      + 'through it adds 0.592 dB: 100 W of net power into the line delivers 75.1 W to '
      + 'the antenna instead of 86.1 W. The reflected reading was 36 % of the forward '
      + 'wave; 11 W actually went missing.',
    demo:
      'Set RG-213 at 30 m on 20 m. Compare radiated power into the dummy load with '
      + 'radiated power into a mismatched antenna at the same forward power.',
  },
  {
    id: 'tuner-lowers-swr',
    myth: 'The tuner lowers the SWR.',
    reality:
      'It lowers the SWR the radio sees, at the point where it is inserted, and '
      + 'nowhere else. Everything on the far side of it is untouched: the same '
      + 'reflection sits at the antenna, the same standing wave sits on the coax, and '
      + 'the same additional loss is still being paid. A tuner in the shack hides a '
      + 'mismatch from the PA. A tuner at the antenna removes it from the feedline. '
      + 'Those are different jobs and the meter on the front panel cannot tell them '
      + 'apart.',
    evidence:
      'A 4:1 load on 30 m of RG-213 at 14.2 MHz. Tuner at the radio: the panel reads '
      + '1.0:1 and 75.1 W reaches the antenna. The same tuner at the feedpoint: the '
      + 'panel reads 1.0:1 and 86.1 W reaches it. Moving the tuner is worth 0.59 dB; '
      + 'the reading on the radio is identical either way.',
    demo:
      'Switch the tuner between Internal and External at antenna. The SWR readout '
      + 'stays at 1.0:1 in both. The antenna SWR readout and the radiated power do not.',
  },
  {
    id: 'low-swr-means-good-antenna',
    myth: 'The SWR is 1.2:1, so the antenna is working.',
    reality:
      'SWR reports one thing: how close the impedance at the meter is to 50 ohms. It '
      + 'says nothing about how much of the power entering the antenna leaves as a '
      + 'wave. A 50 ohm resistor is a perfect match and radiates nothing worth '
      + 'measuring. Worse, loss between the meter and the antenna flatters the '
      + 'reading, because the reflected wave is attenuated on the way out and again on '
      + 'the way back.',
    evidence:
      'A dummy load reads 1.00:1 at every frequency the radio will transmit on. '
      + 'Through 30 m of RG-58 at 28.5 MHz, which has 2.42 dB of matched loss, a 10:1 '
      + 'antenna reads 2.76:1 at the radio and an antenna disconnected altogether '
      + 'reads 3.68:1 rather than infinity.',
    demo:
      'Select the dummy load and read 1.00:1. Then select RG-58 at 30 m on 10 m and '
      + 'run the open-feedline preset: the radio still reads under 4:1 with nothing '
      + 'connected.',
  },
  {
    id: 'one-point-five-versus-two',
    myth: 'I will not operate above 1.5:1. Two to one is much worse.',
    reality:
      'Work the numbers instead of the adjectives. The share of the forward wave that '
      + 'does not cross into the load on the first pass is the mismatch loss, and even '
      + 'that overstates the cost, because a transmitter re-reflects most of what '
      + 'comes back to it. The difference between the two figures is smaller than the '
      + 'hour-to-hour variation in propagation, and far smaller than the difference '
      + 'between two feedlines.',
    evidence:
      '1.5:1 reflects 4.0 % of the forward wave, 2:1 reflects 11.1 %. As power that '
      + 'is 0.177 dB against 0.511 dB: a difference of 0.334 dB, about one eighteenth '
      + 'of an S-unit at the far end. For scale, 3:1 reflects 25.0 %, which is 1.25 dB, '
      + 'and 30 m of RG-58 on 10 m throws away 2.42 dB before the antenna is reached.',
    demo:
      'Put the 40 m dipole on 40 m and walk the dial out from its resonance until the '
      + 'SWR readout passes 1.5:1, then 2:1. Read the radiated power at each stop.',
  },
  {
    id: 'swr-damages-the-antenna',
    myth: 'A high SWR will damage the antenna.',
    reality:
      'The antenna is the cause of the reflection, not its victim. Nothing extra is '
      + 'being done to it; its voltage and current distribution follows from its own '
      + 'impedance and the power delivered. What a badly mismatched, strongly reactive '
      + 'load does put at risk is everything with a voltage or a current concentration '
      + 'in it: traps, loading coils, centre insulators, baluns, the coax dielectric, '
      + 'and the tuner. A reactive load makes the volt-amperes much larger than the '
      + 'watts, and components fail on volt-amperes.',
    evidence:
      'W8JI modelled an 88 ft dipole at 3.72 MHz: 21.58 - j500.3 ohms. Delivering '
      + '100 W of real power into it means 2.153 A and 1078 V at the feedpoint, which '
      + 'is 2317 VA of apparent power. The wire does not care. The centre insulator, '
      + 'the balun and the tuner capacitor are being asked to hold 23 times the real '
      + 'power.',
    demo: null,
  },
  {
    id: 'never-transmit-above-two-to-one',
    myth: 'Never key up above 2:1 or you will destroy the radio.',
    reality:
      'The radio defends itself, and the published description of how is not what '
      + 'most operators assume. The IC-7300 manual describes a two-step protection: '
      + 'it first reduces output power and shows LMT, then inhibits transmit, and it '
      + 'attributes both to the final amplifier temperature rather than to the SWR '
      + 'directly. The service manual block diagram also carries an SWR-APC line into '
      + 'the power control, so drive is pulled back as the mismatch rises. The '
      + 'genuinely dangerous cases are elsewhere: an external amplifier with slower '
      + 'protection than the exciter, switching a tuner or an antenna relay with the '
      + 'carrier up, and a line left open or shorted at full power.',
    evidence:
      'The RD70HVF1C in the final stage is rated "no destroy" into a 20:1 load at '
      + 'every phase angle, at 70 W and 15.2 V, with the input power controlled. The '
      + 'internal tuner will not attempt worse than 3:1 (16.7 to 150 ohms) unless the '
      + 'emergency mode is enabled, and that mode caps output at 50 W.',
    demo:
      'Run the open-feedline preset with the power control at 100 W. Watch forward '
      + 'power fold back and the PA temperature climb on the fast time scale.',
  },
  {
    id: 'swr-meter-measures-the-antenna',
    myth: 'The SWR meter is telling me about my antenna.',
    reality:
      'It measures the impedance at one point, the point where it is inserted, '
      + 'against 50 ohms. Between it and the antenna sit the coax, every connector, '
      + 'the ATU and antenna relays, and anything coupled to the outside of the shield. '
      + 'All of that is inside the measurement. Line loss in particular makes the '
      + 'reading better than the antenna is, because the reflection passes through the '
      + 'attenuation twice.',
    evidence:
      'Through 30 m of RG-58 at 28.5 MHz, 2.42 dB of matched loss: a 10:1 antenna '
      + 'reads 2.76:1 at the radio and a 3:1 antenna reads 1.80:1. K6OIK gives the '
      + 'ceiling. With the far end open or shorted the input SWR cannot exceed '
      + 'coth(alpha x l), which for this line is 3.68:1.',
    demo:
      'Select RG-58 on 10 m and drag the cable length from 3 m to 60 m. The SWR '
      + 'readout falls; the antenna SWR readout does not move.',
  },
  {
    id: 'radials-lower-the-swr',
    myth: 'Adding radials to a vertical will lower the SWR.',
    reality:
      'Radials cut ground loss, and ground loss appears at the feedpoint as '
      + 'resistance in series with the radiation resistance. Removing it makes the '
      + 'feedpoint resistance fall toward the radiator’s own value, which for a '
      + 'quarter-wave monopole is roughly 36 ohms. The SWR follows the resistance, not '
      + 'the efficiency, so it reaches its minimum wherever the remaining loss happens '
      + 'to put the feedpoint at 50 ohms. Keep adding radials past that point and the '
      + 'SWR gets worse while the antenna gets better.',
    evidence:
      'N6LF measured a 33.5 ft vertical at 7.2 MHz with radials lying on the ground. '
      + '4 radials: 137 + j14.9 ohms, 2.78:1. 8 radials: 85.5 + j8.0, 1.73:1. '
      + '16 radials: 56.1 + j6.2, 1.18:1. 32 radials: 42.9 + j2.1, 1.17:1. '
      + '64 radials: 39.7 - j1.2, 1.26:1. The SWR bottoms out around 16 to 32 radials; '
      + 'the best ground system in the set reads the second worst.',
    demo: null,
  },
  {
    id: 'coax-loss-does-not-matter-on-hf',
    myth: 'Coax loss is a VHF problem. On HF anything will do.',
    reality:
      'Conductor loss rises as the square root of frequency, dielectric loss rises '
      + 'linearly with it, and both scale with length. You pay it twice: once on '
      + 'transmit, and once on receive, where it comes straight off the '
      + 'signal-to-noise the antenna delivered. The figure that matters is decibels '
      + 'over the run you actually have, not decibels per 100 feet.',
    evidence:
      '30 m of RG-58 at 28.5 MHz is 2.42 dB matched: 100 W in, 57.2 W out, 43 W into '
      + 'the jacket. The same run of RG-213 is 0.94 dB (80.6 W) and LMR-400 is 0.65 dB '
      + '(86.1 W). At 3.5 MHz that same RG-58 run is only 0.81 dB, so the identical '
      + 'cable is unremarkable on 80 m and expensive on 10 m.',
    demo:
      'Set RG-58 at 30 m. Key up on 80 m, read radiated power, then key up on 10 m '
      + 'and read it again.',
  },
  {
    id: 'common-mode-touching-the-radio',
    myth: 'The SWR changes when I touch the radio, so something must be broken.',
    reality:
      'Something is common-mode current. Skin effect makes the inside and the outside '
      + 'of a coax shield two electrically separate conductors, and the outside is a '
      + 'wire joining the antenna to the chassis, the mains earth and everything else '
      + 'in the room. When that path carries current the feedline is part of the '
      + 'antenna, and a hand on the case changes the impedance of the path. That '
      + 'changes the current distribution on the antenna, which changes the impedance '
      + 'the bridge is measuring. The fix is choking impedance at the feedpoint, not a '
      + 'different tuner.',
    evidence:
      'Copper skin depth is 6.6 micrometres at 100 MHz and about 18 at 14 MHz, so a '
      + 'braid is many skin depths thick and the two surfaces are excited separately. '
      + 'K9YC’s target for a feedpoint choke is 5000 ohms of common-mode impedance; '
      + 'coupled noise falls 6 dB for each doubling of it, so the traditional 500 ohm '
      + '"balun" is 20 dB short of the target.',
    demo: null,
  },
  {
    id: 'resonance-is-a-match',
    myth: 'Once the antenna is resonant it is matched.',
    reality:
      'Resonance means the reactance at the feedpoint is zero, so voltage and current '
      + 'there are in phase. A match means the impedance equals the system impedance. '
      + 'They are separate conditions and they coincide only when the resistive part '
      + 'happens to land on 50 ohms. Every resonant antenna has some resistance and it '
      + 'is rarely 50; conversely, a matching network can present 50 + j0 to the radio '
      + 'at a frequency where the antenna itself is nowhere near resonance.',
    evidence:
      'At resonance a thin half-wave dipole in free space is about 73 ohms, which is '
      + '1.46:1 on a 50 ohm system. A quarter-wave monopole over perfect ground is '
      + 'about 36 ohms, 1.39:1. A folded dipole is about 280 ohms, 5.6:1. All three '
      + 'are exactly resonant.',
    demo:
      'Select the dummy load and sweep the dial from 1.8 to 54 MHz. It reads 1.00:1 '
      + 'everywhere and is resonant nowhere.',
  },
  {
    id: 'forward-reading-is-transmitter-output',
    myth: 'The wattmeter reads 130 W forward, so the radio is making 130 W.',
    reality:
      'A directional wattmeter splits the line into a forward and a reverse '
      + 'travelling wave and reports each separately. Neither one is the '
      + 'transmitter’s output. The output is the difference. When the load is '
      + 'mismatched the forward reading has to rise above the net power by exactly the '
      + 'factor the reflection takes back out.',
    evidence:
      'For 100 W of net power at 2:1 the forward wave must be 112.5 W with 12.5 W '
      + 'reflected. At 3:1 it is 133.3 W forward and 33.3 W reflected, still 100 W net. '
      + 'Nothing about what the amplifier is doing has changed between those two lines.',
    demo:
      'Key up into a mismatched antenna and check that forward minus reflected, not '
      + 'forward alone, matches the net power the radio is delivering.',
  },
  {
    id: 'coax-length-changes-swr',
    myth: 'Cut the coax to a half wavelength and the SWR will come down.',
    reality:
      'On a line with no loss, changing the length rotates the impedance around the '
      + 'Smith chart but leaves the magnitude of the reflection coefficient alone, so '
      + 'the SWR is the same everywhere on the line. A half-wave repeats the load '
      + 'impedance exactly, which is useful for measuring an antenna from the shack '
      + 'and useless for improving it. On a real line the reading does improve as you '
      + 'add length, because you added loss. If a length change moves the reading '
      + 'further than the loss can account for, common-mode current on the shield is '
      + 'doing it, and the length is a symptom rather than a cure.',
    evidence:
      'K6OIK gives the bound: a line terminated in an open or a short cannot read '
      + 'higher than coth(alpha x l) at its input. 30 m of RG-58 at 28.5 MHz has '
      + '2.42 dB of matched loss, so the worst reading it can ever produce is 3.68:1, '
      + 'no matter what is or is not on the far end.',
    demo:
      'Set RG-213 on 20 m with a mismatched antenna and drag the cable length from '
      + '3 m to 60 m. The SWR readout falls and the radiated power falls with it.',
  },
  {
    id: 'alc-peaks-mean-full-output',
    myth: 'Turn the mic gain up until the ALC pegs; that is how you get full output.',
    reality:
      'ALC is a feedback loop that pulls drive back when the detected output exceeds '
      + 'the set level. It acts on peaks that have already started, so it limits and '
      + 'delays rather than compressing cleanly. Peak envelope power is set by the RF '
      + 'power control, not by how hard the ALC is working. Driving past the marked '
      + 'zone does not add output; it adds intermodulation products, and those land on '
      + 'the frequencies either side of yours.',
    evidence:
      'Icom’s own instruction for the IC-7300 is to set MIC GAIN so the ALC meter '
      + 'reads within the 30 to 50 percent range of the ALC zone, and to keep the '
      + 'compressor meter inside its marked 10 to 20 dB zone, beyond which the manual '
      + 'says the transmitted voice may be distorted. 47 CFR 97.307(b) makes splatter '
      + 'on adjacent frequencies the operator’s problem either way.',
    demo:
      'Raise mic gain and compression together. The ALC readout climbs and the '
      + 'forward power readout stops rising.',
  },
])
