/**
 * Antinode — glossary.
 *
 * One or two sentences per term, written for someone who already holds a licence.
 * Where a number is quoted it is either from a published source named in the
 * comment block below, or arithmetic from the models in src/rf.
 *
 * Ordered alphabetically by `term` so a reader can find one without a search box.
 * Every string in `seeAlso` is the exact `term` of another entry in this file.
 *
 * ── Sources ─────────────────────────────────────────────────────────────────
 *
 * [MANUAL]  Icom IC-7300 Instruction Manual (Full). Harmonics "Less than -50 dB
 *           (1.8~28 MHz)", "Less than -63 dB (50 MHz band)". Antenna tuner
 *           "16.7~150 ohm (unbalanced) (less than 3:1 VSWR)", tuning accuracy
 *           "Less than 1.5:1 VSWR". Two-step protection function: power down
 *           (LMT) then TX inhibit, triggered on final amplifier temperature.
 *           Speech Compressor: MIC GAIN set so the ALC meter reads "within the
 *           30 to 50 % range of the ALC zone"; COMP meter zone "10 to 20 dB".
 * [SERVICE] Icom IC-7300 Service Manual. Direct sampling; the A/D converter feeds
 *           the FPGA (IC1351), which produces the 36 kHz IF for the DSP (IC901).
 *           PA control carries an "SWR-APC" line. Finals Q131/Q132 RD70HVF1C-121.
 * [RD70]    Mitsubishi RD70HVF1C data sheet, Jun. 2019. VDSS 30 V, ID 20 A,
 *           Pch 150 W, Tch 175 degC, Rth(j-c) 1.0 degC/W, load VSWR tolerance
 *           20:1 all phase "No destroy" at 70 W / 15.2 V with input control.
 * [K6OIK]   S. D. Stearns, K6OIK, "Facts About SWR, Reflected Power, and Power
 *           Transfer on Real Transmission Lines with Loss" (Pacificon 2010) and
 *           "Conjugate Match Myths" (Pacificon 2011). Additional loss due to SWR;
 *           the coth(alpha*l) bound; copper skin depth 6.6 um at 100 MHz;
 *           Everitt's conjugate match theorem (1932) and its limits on lossy
 *           lines; the return-loss sign-convention literature.
 * [W8JI]    Tom Rauch, W8JI, "VSWR Reactive Power" and "ANTENNA TUNERS or
 *           Matching Networks", w8ji.com. The 88 ft dipole VAR example; the
 *           T-network phase-shift versus loss table at 1 kW.
 * [K9YC]    Jim Brown, K9YC, "Understanding and Solving RF Interference
 *           Problems", k9yc.com. Choking impedance targets; 6 dB per doubling;
 *           Guanella current baluns versus Ruthroff voltage baluns.
 * [N6LF]    Rudy Severns, N6LF, QEX March/April 2009, Part 3, Table 1.
 * [FCC]     47 CFR 97.3(b)(3) ERP, 97.3(b)(2) EIRP, 97.3(b)(9) PEP,
 *           97.3(c)(43) spurious emission, 97.307(d) 43 dB spurious limit.
 * [BIRD]    T. S. Bird, "Definition and Misuse of Return Loss", IEEE Antennas and
 *           Propagation Magazine, vol. 51 no. 2, pp. 166-167, April 2009.
 *
 * Derived figures: 1/sqrt(2.25) = 0.667 for solid polyethylene; 20 log10(e) =
 * 8.686 dB per neper; 10 log10(1.64) = 2.15 dB between ERP and EIRP; the 50 ohm
 * line voltage maximum sqrt(2 * Z0 * Pnet * SWR), which is 316 V peak at 100 W
 * and 10:1 against 100 V peak matched; RG-213 at 14.2 MHz, vf 0.66, half wave
 * 6.97 m against 10.56 m in air.
 */

import type { GlossaryEntry } from './types'

export const GLOSSARY: readonly GlossaryEntry[] = Object.freeze([
  {
    term: 'ADC',
    definition:
      'Analogue-to-digital converter. In a direct-sampling receiver it sets the '
      + 'ceiling and the floor of the whole radio at once: the largest signal it can '
      + 'take before clipping and the noise of its own quantising bracket everything '
      + 'downstream, which is why a front-end attenuator earns its keep here in a way '
      + 'it never did in a superheterodyne.',
    seeAlso: ['Direct sampling', 'FPGA', 'DDC', 'Dynamic range'],
  },
  {
    term: 'Additional loss due to SWR',
    definition:
      'The dissipation a standing wave adds to a line, over and above its matched '
      + 'loss: 10 log10[(1 - |Gin|^2) / (1 - |GL|^2)] dB, where |GL| is the reflection '
      + 'coefficient magnitude at the load and |Gin| is that divided by the matched '
      + 'loss expressed as a power ratio. A graph of it has appeared in every ARRL '
      + 'Antenna Book since 1949.',
    seeAlso: ['Matched-line loss', 'Mismatch loss', 'Standing wave', 'Attenuation constant'],
  },
  {
    term: 'ALC',
    definition:
      'Automatic level control: a feedback loop that reduces drive when the detected '
      + 'output exceeds the level the power control asked for. It acts on peaks after '
      + 'they have started, so it limits rather than compresses, and the meter reading '
      + 'is a measure of how hard it is having to intervene, not of output power.',
    seeAlso: ['Speech compression', 'PEP', 'IMD', 'Foldback'],
  },
  {
    term: 'Antinode',
    definition:
      'A maximum in a standing wave. A voltage antinode sits where the current is at '
      + 'a minimum, and it is where insulation is stressed rather than conductors: '
      + '100 W of net power on a 50 ohm line at 10:1 puts 316 V peak at the voltage '
      + 'antinode, against 100 V peak when the line is matched.',
    seeAlso: ['Node', 'Standing wave', 'SWR', 'Reactive power'],
  },
  {
    term: 'Attenuation constant',
    definition:
      'Alpha, the real part of the propagation constant, in nepers per metre. '
      + 'Conductor loss makes it rise as the square root of frequency and dielectric '
      + 'loss makes it rise linearly, which is why published cable tables are fitted '
      + 'as k1 x sqrt(fMHz) + k2 x fMHz.',
    seeAlso: ['Propagation constant', 'Neper', 'Matched-line loss', 'Skin effect'],
  },
  {
    term: 'Balun',
    definition:
      'A device joining a balanced load to an unbalanced line. The two families '
      + 'behave differently under load: a voltage balun (Ruthroff) is a transformer '
      + 'whose core carries the whole transmitted power, while a current balun '
      + '(Guanella) is a common-mode choke that sees only the common-mode field, so it '
      + 'can be small and is hard to saturate.',
    seeAlso: ['Unun', 'Common-mode current', 'Choking impedance', 'Ladder line'],
  },
  {
    term: 'Characteristic impedance',
    definition:
      'Z0 = sqrt((R + jwL) / (G + jwC)): the ratio of voltage to current in a single '
      + 'travelling wave on a line, independent of how long the line is. On HF coax '
      + 'the reactive part is a fraction of an ohm, so Z0 is treated as real and '
      + 'quoted as 50, 75 or 450 ohms.',
    seeAlso: ['Propagation constant', 'Velocity factor', 'Reflection coefficient', 'Ladder line'],
  },
  {
    term: 'Choking impedance',
    definition:
      'The series impedance a choke presents to common-mode current on a feedline. '
      + 'Common-mode current and the noise it couples fall 6 dB for every doubling of '
      + 'it; K9YC gives 5000 ohms as the target at a feedpoint, which puts the '
      + 'traditional 500 ohm figure 20 dB short.',
    seeAlso: ['Common-mode current', 'Balun', 'Skin effect'],
  },
  {
    term: 'Common-mode current',
    definition:
      'The part of the current on a feedline that has no equal and opposite partner '
      + 'in the other conductor. On coax it rides the outside of the shield, which '
      + 'skin effect makes a separate conductor from the inside, and it turns the '
      + 'feedline into part of the antenna in both directions.',
    seeAlso: ['Choking impedance', 'Balun', 'Skin effect', 'Feedpoint'],
  },
  {
    term: 'Conjugate match',
    definition:
      'The condition ZL = the complex conjugate of ZS, which draws the most power a '
      + 'given source can deliver. Everitt showed in 1932 that through a cascade of '
      + 'lossless two-ports a conjugate match at any port implies one at every port; '
      + 'K6OIK shows that through a lossy line it does not, and that a single-ended '
      + 'conjugate match at one end of a 1 dB line does not maximise power into the '
      + 'load.',
    seeAlso: ['Reflection coefficient', 'Matched-line loss', 'L-network', 'Load line'],
  },
  {
    term: 'Counterpoise',
    definition:
      'A ground system deliberately not bonded to earth: elevated radials, or a wire '
      + 'mat under the antenna, carrying the return current by conduction and '
      + 'capacitance to the radiator instead of through soil. It substitutes copper '
      + 'for the lossy part of the circuit rather than trying to improve the soil.',
    seeAlso: ['Radial', 'Ground loss', 'Radiation resistance'],
  },
  {
    term: 'DDC',
    definition:
      'Digital down-converter: the arithmetic that multiplies the sampled RF stream by '
      + 'a numerically generated local oscillator and decimates the result to a low '
      + 'intermediate frequency. In the IC-7300 the FPGA lands on 36 kHz before handing '
      + 'the signal to the DSP.',
    seeAlso: ['Direct sampling', 'FPGA', 'ADC'],
  },
  {
    term: 'Direct sampling',
    definition:
      'Digitising the antenna signal at radio frequency and doing every filtering and '
      + 'demodulation step in arithmetic, with no analogue mixer and no crystal IF. '
      + 'The IC-7300 service manual describes the received signal going straight to the '
      + 'A/D converter, with the FPGA producing the 36 kHz IF the DSP works on.',
    seeAlso: ['ADC', 'FPGA', 'DDC', 'Dynamic range'],
  },
  {
    term: 'Directional coupler',
    definition:
      'The bridge inside an SWR meter. It samples the line and separates the forward '
      + 'from the reverse travelling wave, producing two readings whose difference is '
      + 'the net power. Neither reading on its own is the transmitter output, and both '
      + 'describe the point where the coupler sits rather than the antenna.',
    seeAlso: ['SWR', 'Reflection coefficient', 'Return loss', 'Feedpoint'],
  },
  {
    term: 'Dummy load',
    definition:
      'A non-radiating resistor of the system impedance, used to test a transmitter '
      + 'without putting a signal on the air. It reads 1.00:1 at every frequency, '
      + 'which is the shortest available argument against treating SWR as a measure of '
      + 'antenna performance.',
    seeAlso: ['SWR', 'Duty cycle', 'Thermal resistance'],
  },
  {
    term: 'Duty cycle',
    definition:
      'The ratio of average power to peak envelope power over a period of '
      + 'transmission. It decides heating; PEP does not. Unprocessed SSB speech is '
      + 'usually taken as 0.2 to 0.25, while FM, RTTY and a key-down carrier are 1.0, '
      + 'so the same 100 W setting is four or five times the heat in the finals.',
    seeAlso: ['PEP', 'Speech compression', 'Junction temperature', 'Thermal resistance'],
  },
  {
    term: 'Dynamic range',
    definition:
      'The span between the weakest signal a receiver can render and the strongest it '
      + 'can tolerate before a stated impairment appears. The impairment has to be '
      + 'named: blocking dynamic range, third-order IMD dynamic range and '
      + 'reciprocal-mixing dynamic range are three different numbers for the same '
      + 'radio.',
    seeAlso: ['Third-order intercept', 'IMD', 'ADC', 'Direct sampling'],
  },
  {
    term: 'Effective radiated power',
    definition:
      'Under 47 CFR 97.3(b)(3), the power supplied to the antenna multiplied by the '
      + 'antenna gain relative to a half-wave dipole in a given direction. Multiply by '
      + '1.64, or add 2.15 dB, to convert to EIRP, which is referred to an isotropic '
      + 'radiator instead.',
    seeAlso: ['Radiation resistance', 'Ground loss', 'PEP'],
  },
  {
    term: 'Electrical length',
    definition:
      'Length measured in wavelengths of the medium rather than in metres: physical '
      + 'length divided by the wavelength inside the line, quoted in wavelengths or '
      + 'degrees. It is what decides how a line transforms an impedance, and a '
      + 'half-wave repeats the load while a quarter-wave inverts it about Z0.',
    seeAlso: ['Wavelength', 'Velocity factor', 'Smith chart', 'Characteristic impedance'],
  },
  {
    term: 'Feedpoint',
    definition:
      'The pair of terminals where the transmission line joins the antenna, and the '
      + 'only place the antenna impedance itself can be measured. Anything a meter in '
      + 'the shack reports is that impedance transformed by the line, the connectors '
      + 'and whatever the shield is coupled to.',
    seeAlso: ['Radiation resistance', 'Ground loss', 'Electrical length', 'SWR'],
  },
  {
    term: 'Foldback',
    definition:
      'Reducing output power in response to a measured fault instead of shutting down. '
      + 'The IC-7300 service manual shows an SWR-APC line into the power control, and '
      + 'the instruction manual describes a two-step protection - power down, marked '
      + 'LMT, then transmit inhibit - which it attributes to the final amplifier '
      + 'temperature.',
    seeAlso: ['Load line', 'Junction temperature', 'Thermal resistance', 'ALC'],
  },
  {
    term: 'FPGA',
    definition:
      'Field-programmable gate array: a chip whose logic is wired by a configuration '
      + 'loaded at power-up rather than by masks at manufacture. In the IC-7300 it is '
      + 'IC1351, and it does the down-conversion and filtering that a superheterodyne '
      + 'does with mixers and crystal filters.',
    seeAlso: ['DDC', 'Direct sampling', 'ADC'],
  },
  {
    term: 'Ground loss',
    definition:
      'Power dissipated in the soil beneath a vertical, which shows up at the '
      + 'feedpoint as resistance in series with the radiation resistance. Because it '
      + 'raises the feedpoint resistance, a lossy ground system reads as a better match '
      + 'than a good one.',
    seeAlso: ['Radial', 'Counterpoise', 'Radiation resistance', 'Feedpoint'],
  },
  {
    term: 'Harmonic',
    definition:
      'An emission at an integer multiple of the operating frequency, produced by any '
      + 'nonlinearity in the transmitter and removed by the low-pass filter after the '
      + 'PA. The IC-7300 publishes better than 50 dB down from 1.8 to 28 MHz and 63 dB '
      + 'down on 50 MHz.',
    seeAlso: ['Low-pass filter', 'Spurious emission', 'IMD'],
  },
  {
    term: 'IMD',
    definition:
      'Intermodulation distortion: the products a nonlinear stage makes when more '
      + 'than one tone is present. The third-order pair at 2f1 - f2 and 2f2 - f1 falls '
      + 'close either side of the wanted signal, which is why intermodulation, not '
      + 'harmonics, is what an overdriven SSB transmitter puts on the neighbouring '
      + 'frequency.',
    seeAlso: ['Third-order intercept', 'ALC', 'Speech compression', 'Spurious emission'],
  },
  {
    term: 'Insertion loss',
    definition:
      'The power a component removes from an otherwise matched line, in dB, and '
      + 'dissipated inside the component. It is not the same idea as mismatch loss, '
      + 'which is reflected away rather than absorbed.',
    seeAlso: ['Mismatch loss', 'Matched-line loss', 'T-network', 'Loaded Q'],
  },
  {
    term: 'Junction temperature',
    definition:
      'The temperature of the semiconductor die itself, always higher than any case '
      + 'or heatsink sensor reads and always the number that decides service life. The '
      + 'RD70HVF1C used in the IC-7300 final stage is rated to a maximum channel '
      + 'temperature of 175 degC.',
    seeAlso: ['Thermal resistance', 'Foldback', 'Duty cycle', 'Load line'],
  },
  {
    term: 'L-network',
    definition:
      'Two reactances, one in series and one in shunt. The transformation ratio fixes '
      + 'the loaded Q with no freedom left over - Q = sqrt(Rhigh / Rlow - 1), so 50 to '
      + '200 ohms is Q = 1.73 and nothing else. It is the lowest-loss network for a '
      + 'given transformation and it refuses the loads that would overheat it.',
    seeAlso: ['T-network', 'Loaded Q', 'Conjugate match', 'Insertion loss'],
  },
  {
    term: 'Ladder line',
    definition:
      'Two parallel conductors held apart by insulating webbing, with most of the '
      + 'field in air and a characteristic impedance of roughly 300 to 600 ohms. Loss '
      + 'is very low and, because Z0 is high, a given SWR costs far less than the same '
      + 'ratio on coax; the price is that it must be kept clear of metal and needs a '
      + 'balun where it meets the radio.',
    seeAlso: ['Characteristic impedance', 'Balun', 'Velocity factor', 'Additional loss due to SWR'],
  },
  {
    term: 'Load line',
    definition:
      'The path traced by instantaneous device voltage against instantaneous device '
      + 'current over an RF cycle, set by the impedance the device works into. A '
      + 'mismatch rotates it, so the same reflection magnitude can push a drain toward '
      + 'its voltage rating or toward its current rating depending on the angle.',
    seeAlso: ['Reflection coefficient', 'Foldback', 'Junction temperature', 'Conjugate match'],
  },
  {
    term: 'Loaded Q',
    definition:
      'The ratio of reactive to resistive power in a network as it is actually '
      + 'terminated, which is not the Q of any component in it. It sets the bandwidth, '
      + 'the voltage standing across the reactances, and how much of the through power '
      + 'the network turns into heat.',
    seeAlso: ['T-network', 'L-network', 'Reactive power', 'Insertion loss'],
  },
  {
    term: 'Low-pass filter',
    definition:
      'A filter passing everything below a cut-off and rejecting what is above it. '
      + 'The IC-7300 service manual describes a bank of Chebyshev low-pass filters on '
      + 'the PA board, switched in by relays either side of each one according to the '
      + 'transmit frequency. They are what keeps harmonics off the air, and they are '
      + 'the last things between the finals and the antenna socket that carry full '
      + 'power and full mismatch.',
    seeAlso: ['Harmonic', 'Spurious emission', 'Foldback'],
  },
  {
    term: 'Matched-line loss',
    definition:
      'The attenuation of a length of line terminated in its own characteristic '
      + 'impedance, so that no reflected wave exists. It is the least loss that line '
      + 'can ever have, and it is the figure a manufacturer prints in a decibels per '
      + '100 feet table.',
    seeAlso: ['Additional loss due to SWR', 'Attenuation constant', 'Insertion loss', 'Neper'],
  },
  {
    term: 'Mismatch loss',
    definition:
      'Minus 10 log10(1 - |G|^2): the share of an incident wave that does not cross '
      + 'into the load on its first pass. It is what you would lose if the source '
      + 'absorbed everything returned to it, which a transmitter does not, so read it '
      + 'as an upper bound rather than as a bill. At 1.5:1 it is 0.177 dB and at 2:1 '
      + 'it is 0.511 dB.',
    seeAlso: ['Return loss', 'Reflection coefficient', 'Additional loss due to SWR', 'Insertion loss'],
  },
  {
    term: 'Neper',
    definition:
      'The natural unit of attenuation: one neper is one e-fold of amplitude. '
      + '1 Np = 20 log10(e) = 8.686 dB, which is the only conversion needed between '
      + 'the exponentials in the line equations and the decibels on a cable data sheet.',
    seeAlso: ['Attenuation constant', 'Propagation constant', 'Matched-line loss'],
  },
  {
    term: 'Node',
    definition:
      'A minimum in a standing wave. Adjacent nodes of the same quantity are half a '
      + 'wavelength apart, and a voltage node sits a quarter wavelength from the '
      + 'nearest current node, which is why the impedance seen along a mismatched line '
      + 'swings between a low and a high value every quarter wave.',
    seeAlso: ['Antinode', 'Standing wave', 'Wavelength', 'Electrical length'],
  },
  {
    term: 'PEP',
    definition:
      'Peak envelope power. Under 47 CFR 97.3(b)(9), the average power supplied to the '
      + 'antenna transmission line during one RF cycle at the crest of the modulation '
      + 'envelope, under normal operating conditions. It is a peak of the envelope, not '
      + 'an instantaneous peak of the carrier, and it says nothing about heating.',
    seeAlso: ['Duty cycle', 'ALC', 'Speech compression', 'Effective radiated power'],
  },
  {
    term: 'Propagation constant',
    definition:
      'Gamma = alpha + j beta = sqrt((R + jwL)(G + jwC)): the complex rate at which a '
      + 'wave decays and advances in phase along a line. Alpha is in nepers per metre '
      + 'and beta in radians per metre.',
    seeAlso: ['Attenuation constant', 'Characteristic impedance', 'Neper', 'Velocity factor'],
  },
  {
    term: 'Radial',
    definition:
      'A wire in the ground system of a vertical, laid on, in, or above the earth, '
      + 'giving the return current copper to flow in instead of soil. N6LF measured a '
      + '33.5 ft vertical at 7.2 MHz with radials on the ground: 4 radials gave '
      + '137 + j14.9 ohms, 16 gave 56.1 + j6.2, and 64 gave 39.7 - j1.2.',
    seeAlso: ['Ground loss', 'Counterpoise', 'Radiation resistance', 'Feedpoint'],
  },
  {
    term: 'Radiation resistance',
    definition:
      'The resistance that accounts for radiated power: total power radiated in all '
      + 'directions divided by the square of the current causing it. It is not the '
      + 'feedpoint resistance, which is radiation resistance plus every loss resistance '
      + 'in the antenna and its ground. A thin half-wave dipole in free space is about '
      + '73 ohms, a quarter-wave monopole over perfect ground about 36.',
    seeAlso: ['Feedpoint', 'Ground loss', 'Radial', 'Resonance'],
  },
  {
    term: 'Reactance',
    definition:
      'The imaginary part of an impedance, in ohms. It stores energy rather than '
      + 'dissipating it and it puts voltage and current out of phase, so the '
      + 'volt-amperes a component has to survive rise above the watts it is passing.',
    seeAlso: ['Reactive power', 'Resonance', 'Loaded Q', 'Smith chart'],
  },
  {
    term: 'Reactive power',
    definition:
      'The volt-ampere product circulating in a reactive load, in VAR, and the '
      + 'quantity that actually destroys components. W8JI’s worked case: an 88 ft '
      + 'dipole at 3.72 MHz is 21.58 - j500.3 ohms, so 100 W of real power means '
      + '2.153 A and 1078 V at the feedpoint - 2317 VA, twenty-three times the real '
      + 'power, for the tuner, balun and line to hold.',
    seeAlso: ['Reactance', 'Loaded Q', 'Antinode', 'T-network'],
  },
  {
    term: 'Reflection coefficient',
    definition:
      'G = (ZL - Z0) / (ZL + Z0), the complex ratio of the reflected wave to the '
      + 'incident wave at a boundary. Its magnitude sets every scalar mismatch figure; '
      + 'its angle sets where the voltage and current maxima fall on the line and '
      + 'whether a mismatch stresses a device with volts or with amps.',
    seeAlso: ['SWR', 'Return loss', 'Mismatch loss', 'Smith chart'],
  },
  {
    term: 'Resonance',
    definition:
      'The condition where the reactance at the feedpoint is zero, so voltage and '
      + 'current there are in phase. It says nothing about the resistance and '
      + 'therefore nothing about the match: a resonant quarter-wave monopole over '
      + 'perfect ground is 36 ohms, which is 1.39:1 on a 50 ohm system.',
    seeAlso: ['Reactance', 'Radiation resistance', 'Conjugate match', 'Feedpoint'],
  },
  {
    term: 'Return loss',
    definition:
      'Minus 20 log10|G|, quoted as a positive number: 14 dB of return loss is '
      + '|G| = 0.2, which is 1.5:1. The sign convention is contested in the literature '
      + '(T. S. Bird, IEEE Antennas and Propagation Magazine, April 2009), so read it '
      + 'as how far down the reflection is and check the sign before quoting it.',
    seeAlso: ['Reflection coefficient', 'SWR', 'Mismatch loss', 'Directional coupler'],
  },
  {
    term: 'Skin effect',
    definition:
      'The confinement of RF current to a thin layer at the surface of a conductor, of '
      + 'depth sqrt(rho / (pi f mu)). In copper that is 6.6 micrometres at 100 MHz and '
      + 'about 18 at 14 MHz, so the inside and the outside of a coax shield are '
      + 'electrically separate conductors carrying separate currents.',
    seeAlso: ['Common-mode current', 'Attenuation constant', 'Choking impedance'],
  },
  {
    term: 'Smith chart',
    definition:
      'The complex reflection-coefficient plane with contours of constant resistance '
      + 'and reactance drawn on it. Distance from the centre is |G|, so constant SWR is '
      + 'a circle; travelling along a lossless line is a rotation about the centre, and '
      + 'adding loss turns that rotation into an inward spiral.',
    seeAlso: ['Reflection coefficient', 'Electrical length', 'SWR', 'Reactance'],
  },
  {
    term: 'Speech compression',
    definition:
      'Raising the average level of speech relative to its peaks so that more average '
      + 'power leaves the antenna for the same peak envelope power. The IC-7300 marks a '
      + '10 to 20 dB zone on its COMP meter, and the manual warns that peaks beyond it '
      + 'distort the transmitted voice.',
    seeAlso: ['ALC', 'PEP', 'Duty cycle', 'IMD'],
  },
  {
    term: 'Spurious emission',
    definition:
      'Under 47 CFR 97.3(c)(43), an emission outside the necessary bandwidth whose '
      + 'level can be reduced without affecting the information being sent. Section '
      + '97.307(d) requires it to be at least 43 dB below the fundamental for HF '
      + 'transmitters installed after 1 January 2003.',
    seeAlso: ['Harmonic', 'IMD', 'Low-pass filter'],
  },
  {
    term: 'Standing wave',
    definition:
      'The stationary pattern of voltage and current magnitude that appears when a '
      + 'forward and a reverse travelling wave of the same frequency share a line. The '
      + 'pattern does not move along the line; the energy in it still does.',
    seeAlso: ['Node', 'Antinode', 'SWR', 'Additional loss due to SWR'],
  },
  {
    term: 'SWR',
    definition:
      'Standing wave ratio. On a lossless line it is the ratio of maximum to minimum '
      + 'voltage magnitude along the line, equal to (1 + |G|) / (1 - |G|). On a line '
      + 'with loss the maxima and minima are no longer in a fixed ratio, so the working '
      + 'definition is that same expression evaluated from the reflection coefficient '
      + 'at the point of measurement - which makes SWR a property of a point, not of '
      + 'an antenna.',
    seeAlso: ['VSWR', 'Reflection coefficient', 'Standing wave', 'Directional coupler', 'Dummy load'],
  },
  {
    term: 'T-network',
    definition:
      'Two series reactances with a shunt element between them. The extra component '
      + 'frees the loaded Q, so the same match can be made at many settings with very '
      + 'different losses and voltages: W8JI measured a 1 kW T-network matching 50 to '
      + '50 ohms losing 22 W at 130 degrees of phase shift and 109 W at 170 degrees. '
      + 'Tune for the least inductance and the most capacitance that will match.',
    seeAlso: ['L-network', 'Loaded Q', 'Insertion loss', 'Reactive power'],
  },
  {
    term: 'Thermal resistance',
    definition:
      'Degrees Celsius of temperature rise per watt of heat crossing an interface. The '
      + 'RD70HVF1C in the IC-7300 final stage is 1.0 degC/W junction to case, so 30 W '
      + 'dissipated in one device puts its junction 30 degC above its own flange before '
      + 'the heatsink and the fan are considered.',
    seeAlso: ['Junction temperature', 'Foldback', 'Duty cycle'],
  },
  {
    term: 'Third-order intercept',
    definition:
      'The extrapolated level at which a third-order intermodulation product would '
      + 'equal the fundamental. Third-order products rise 3 dB for every 1 dB of input, '
      + 'so one measured point fixes the whole family; the intercept itself is a '
      + 'bookkeeping point no real stage ever reaches.',
    seeAlso: ['IMD', 'Dynamic range', 'ADC'],
  },
  {
    term: 'Unun',
    definition:
      'An unbalanced-to-unbalanced transformer, usually a transmission-line '
      + 'transformer on a ferrite core. A 9:1 unun has a 3:1 turns ratio and presents '
      + '50 ohms for a 450 ohm load; it does not make a wire resonant, and on its own '
      + 'it does nothing about common-mode current.',
    seeAlso: ['Balun', 'Common-mode current', 'Choking impedance', 'L-network'],
  },
  {
    term: 'Velocity factor',
    definition:
      'The speed of propagation along a line as a fraction of the speed of light in '
      + 'vacuum, equal to 1/sqrt(er) for a uniform dielectric. Solid polyethylene gives '
      + '0.667, foam 0.82 to 0.85, window line about 0.91 - which is why a half wave of '
      + 'RG-213 at 14.2 MHz is 6.97 m and not the 10.56 m it would be in air.',
    seeAlso: ['Wavelength', 'Electrical length', 'Characteristic impedance', 'Propagation constant'],
  },
  {
    term: 'VSWR',
    definition:
      'Voltage standing wave ratio: the same number as SWR, named for the quantity it '
      + 'was originally measured on. The current standing wave ratio has the identical '
      + 'value on a two-conductor line, so the V carries no extra information.',
    seeAlso: ['SWR', 'Standing wave', 'Reflection coefficient'],
  },
  {
    term: 'Wavelength',
    definition:
      'The distance a wave advances in one cycle: c/f in free space, and vf x c/f '
      + 'inside a line. At 14.2 MHz that is 21.11 m in air and 13.93 m inside RG-213.',
    seeAlso: ['Velocity factor', 'Electrical length', 'Node', 'Antinode'],
  },
])
