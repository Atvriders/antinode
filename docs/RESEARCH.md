# Research reference

Compiled by a fan-out of research agents against primary sources, then
adversarially fact-checked. This is the factual reference the simulation and the
teaching copy were written against. Where it disagrees with the code, the code is
wrong.

---

device (PD), V_DSS 10 V class | Thermal / overdrive | ms |
| **LPF bank inductors** (7 Chebyshev sections, Icom coils LA-604/LA-590/LA-547, LR-294/LR-295) | Mis-termination raises circulating current and distorts the internal V/I distribution away from design | No published rating. At 100 W, 50 Ω the line current is 1.41 A rms / 2.0 A peak; at 3:1 the current maximum is 3× the matched value | Core heating, wire heating, detuning | Seconds to minutes |
| **LPF bank capacitors** | Voltage across shunt caps rises with the voltage maximum | `V_peak = sqrt(2·Z0·P·SWR)` → 100 W: 1:1 = 100 V; 3:1 = 173 V; 10:1 = 316 V; 50:1 = 707 V. At 1500 W into 10:1 only 1225 V | Dielectric breakdown (unlikely at 100 W), value drift from heat | Instant (arc) or minutes (heat) |
| **LPF relays RL820…RL941** (14 × Fujitsu FTR-B4CA009Z) | Nothing, while closed. Everything, if switched hot | Contact rating **1 A / 30 VDC** — a *carry* rating; closed-contact carry typically exceeds the switched rating by many times | **Contact pitting, welding.** W8JI: *"a peak RF voltage as low as 100 volts can sustain an arc 1/4 inch or more in length, and transmitter RF will sustain the arc until something fails."* **100 W into 50 Ω is exactly 100 V peak** — the arc-sustaining threshold, before any mismatch | Single event, µs; arc temperature > 3000 °C vs silver 961 °C / copper 1085 °C |
| **T/R relay RL801** (same part) | Same | Same | Same | Same |
| **ATU relays** (25 × Panasonic EC2-9TNU, 9 V 2-coil latching, 1 A) | Node voltages inside an L-network exceed the line voltage; the tuner is where the highest volts and amps in the radio appear | 1 A contact rating; no published RF rating | Arcing, welding, latch loss under shock | µs (arc), instant (shock unlatch) |
| **ATU inductors** (LA-459…LA-464, LR-542/LR-539 on T68-2 iron powder) | Circulating current rises with network Q, which rises with transformation ratio | No published rating | Core heating, saturation-adjacent loss, value drift | Seconds to minutes |
| **Coax dielectric** | Voltage maximum rises as √SWR | RG-213 3700 V rms; RG-58C/U 1400 V; RG-8X only **300 V (UL CM)**. At 100 W the peak is 100–707 V for 1:1 through 50:1 | **Essentially never fails at 100 W.** Voltage is not the coax failure mode at legal 100 W levels | — |
| **Coax conductors/jacket** | Additional loss becomes heat distributed along the line, concentrated at current maxima | Derate rated power by **1/SWR** | Jacket softening, centre-conductor migration in foam dielectric | Minutes to hours |
| **Feedpoint balun/unun ferrite** | **The dominant real-world failure in modern wire antenna systems.** Loss is core loss, and the load-side SWR is the driver | Industry rule: divide rated power by **√SWR**. At 5:1, √5 = 2.24, so a 1.5 kW-PEP-SSB-rated part is limited to **670 W**. Under FT8 (100 % duty) that 1.5 kW part is ~656 W, and only **468 W at 2:1** | **Core cracking from thermal shock; voltage breakdown on multi-winding transformers at high SWR.** W8JI: *"heat does not indicate saturation"* — HF balun heating is almost exclusively core loss | Minutes. Evaluate by temperature rise, over the full frequency and load range |
| **Balun, wrong-band case** | A balun fed on a band where the antenna presents a very different impedance sees a load far from design | Documented: an 80 m dipole balun fed on 40 m at 1 kW "will probably damage the balun" | Heat, then cracking | Minutes |
| **PL-259 / SO-239 connector** | Current maximum at the connector raises contact heating | Rule of thumb: RF current capacity of a wire can be **20 % or less** of its DC rating due to skin effect | Contact resistance rise, then localised heating | Minutes to hours |
| **Common-mode choke** | Not driven by SWR at all — driven by common-mode current, which is driven by feed asymmetry | Target ≥ **5000 Ω resistive** at the feedpoint | Ferrite heating; at high power, cracking | Minutes |
| **The station (RF in the shack)** | Common-mode current, again not SWR | — | Burns, computer lockups, noise floor rise, SWR that changes when you touch the coax | Immediate |

### Time-scale hierarchy — put this on screen

```
10 ns      RF cycle. Avalanche and latch-up happen here.
1 µs       Relay arc initiates.
10 µs      Detector diode + RC filter respond.
1 ms       ALC/APC loop responds. Die reaches thermal steady state (2–5 ms).
10 ms      Relay transfer completes (5–20 ms with bounce).
100 ms–1 s All transient thermal effects in the package have died out.
2 min      Chassis time constant (τ ≈ 126 s).
10 min     Chassis fully saturated; thermal protection territory.
weeks      Latent die damage surfaces as a failure.
```

### Relay timing — the amplifier-behind-a-radio failure

W8JI's measured transfer times: small to medium relays **5–15 ms** to transfer and stop bouncing; small enclosed and vacuum relays ~5 ms; larger open-frame 10–20 ms; reed under 1 ms; PIN diodes a few ms or less. A 5 ms closing time can rise to 15 ms or more on low coil voltage, and back-EMF clamp diodes can increase **release** time by 200 % or more.

Documented case: an IC-7700 outputs RF **6 ms** after PTT while a mechanical T/R relay takes ~31 ms to energise, leaving roughly **25 ms of transmitting into an open circuit.**

**Current, specific IC-7300 hazard — flag this in the UI.** On one measured unit, firmware **v1.42 shortened the TX delay to 2.6 ms**, down from 9.4 ms on v1.40 in the same radio. Setting TX DELAY to its 30 ms maximum gave 31.4 ms measured; returning it to the OFF default (nominally 10 ms) then gave 8.3 ms. There is a separate 50M TX DELAY for 6 m. **Single-unit measurement — label representative — but anyone driving an amplifier should re-check TX DELAY after a firmware update.**

### Documented real-world total PA destruction

An IC-7300 lost **all five PA-chain transistors** (2SK2854, RD01MUS2, RD15HVF1, both RD70HVF1C). Root cause was not "high SWR" but an **open circuit**: a failed MFJ-993B autotuner whose lead-free solder joints on the toroidal inductor leads had failed — two of them, both ends of the same toroid, completely open. Because those inductors sit directly in the signal path, an open joint means the radio is transmitting with **no antenna load whatsoever**. The tuner's 25 Ω input pad (four 2 W 100 Ω resistors in parallel) had also failed, measuring 0.9 Ω.

The compounding factor documented in the same case: the owner ran **FT8 at 7.074 MHz (100 % duty)** on a dipole with 47 ft legs instead of the calculated 33 ft, fed with 450 Ω window line routed within inches of an aluminium downspout and doubled back on itself. Technician's assessment: the mismatch caused *"the radio to roll back its output power almost all of the time… This in turn taxed the power amplifier chain, generating excessive heat and putting undue stress on all of the PA chain components."*

**Chronic foldback operation is itself a stress, independent of any single catastrophic event.** That is a lesson the simulator should be able to demonstrate over simulated time.

### What actually breaks, ranked by observed frequency in repair reports

1. **DC supply faults** — over-voltage from a failing PSU pass transistor feeding 20–30 V into the radio, killing protection zeners, the 5 A PA-board fuse, the DC-switch FET and the 9 V regulator.
2. **An actual open or short caused by a downstream device failing** — tuner solder joints, broken feedline, a hot-switched relay.
3. **Manufacturing defects** — e.g. a series capacitor in the TX path desoldered at the factory.
4. **SWR/ALC detector components** — IC211 and IC981 on the PA board, replaced after high-SWR events.

**Notably absent:** any well-documented case of an IC-7300 losing its finals from simply operating at a steady 2:1 or 3:1 into a real antenna. The simulator should be honest about that.

### One protection the IC-7300 does not have

An **isolator/circulator** routing reflected power into a 50 Ω termination is the only phase-independent, complete protection (20–25 dB isolation). No amateur HF rig has one, because a broadband HF circulator is impractical.

### And one "protection" that is actively harmful

A conjugate match at the transmitter can **destabilise** a solid-state PA. K6OIK: a conjugate-match network between amplifier and transmission line interferes with the amplifier's coupling network and can make the amplifier unstable unless the transistors are unconditionally stable; transistor gain can be unwittingly altered to exceed maximum stable gain. This is a real damage mechanism with nothing to do with reflected power.

---

## 10. Teaching points and myth-busting

### 10.1 The master table — SWR vs reflected power vs loss

| SWR | \|Γ\| | % power reflected | % past | Mismatch loss (dB) | Return loss (dB) |
|---|---|---|---|---|---|
| 1.1 : 1 | 0.0476 | 0.23 % | 99.77 % | 0.010 | 26.44 |
| 1.2 : 1 | 0.0909 | 0.83 % | 99.17 % | 0.036 | 20.83 |
| **1.5 : 1** | 0.2000 | **4.00 %** | 96.00 % | **0.177** | 13.98 |
| 1.8 : 1 | 0.2857 | 8.16 % | 91.84 % | 0.370 | 10.88 |
| **2.0 : 1** | 0.3333 | **11.11 %** | 88.89 % | **0.512** | 9.54 |
| 2.5 : 1 | 0.4286 | 18.37 % | 81.63 % | 0.881 | 7.36 |
| **3.0 : 1** | 0.5000 | **25.00 %** | 75.00 % | **1.249** | 6.02 |
| 4.0 : 1 | **0.6000** | 36.00 % | 64.00 % | 1.938 | 4.44 |
| 5.0 : 1 | 0.6667 | 44.44 % | 55.56 % | 2.553 | 3.52 |
| 10 : 1 | 0.8182 | 66.94 % | 33.06 % | 4.807 | 1.74 |
| 20 : 1 | 0.9048 | 81.86 % | 18.14 % | 7.413 | 0.87 |

*Note: the widely reproduced QST November 2006 Table 1 has a typo at the 4:1 row — it prints 56 % voltage reflected; the correct value is **60 %** (|Γ| = 3/5). The power column (36 %) is right, which proves the voltage entry is the error. Every other row checks out.*

### 10.2 The demo table — forward and reflected for 100 W actually delivered

| SWR | Forward (W) | Reflected (W) | Delivered (W) |
|---|---|---|---|
| 1.5 : 1 | 104.2 | 4.2 | 100 |
| 2 : 1 | 112.5 | 12.5 | 100 |
| 3 : 1 | 133.3 | 33.3 | 100 |
| **5 : 1** | **180.0** | **80.0** | **100** |
| 10 : 1 | 302.5 | 202.5 | 100 |

Fwd − Refl = delivered, always. The 5:1 row is the one that changes minds: the meter says "80 watts reflected" and the load still gets all 100 W.

### 10.3 Real-station numbers — 100 ft RG-213 at 14 MHz (0.6 dB matched), 100 W in

| SWR at antenna | Power at antenna |
|---|---|
| 1.0 : 1 | 87.1 W |
| **1.5 : 1** | **86.2 W** |
| **1.8 : 1** | **85.3 W** |
| 2 : 1 | 84.5 W |
| 2.5 : 1 | 82.6 W |
| 3 : 1 | 80.6 W |
| 5 : 1 | 73.0 W |
| 10 : 1 | 58.5 W |

The 1.5-vs-1.8 argument in numbers: **86.2 W vs 85.3 W — 0.049 dB, or 0.8 % of one S-unit.**

### 10.4 The "extra feet of coax" equivalence

On 100 ft of RG-213 at 14 MHz, the additional loss from SWR equals the loss of adding this much more of the same cable:

| SWR | Equivalent extra coax |
|---|---|
| 1.5 : 1 | 7 ft |
| 1.8 : 1 | 15 ft |
| 2 : 1 | 21 ft |
| 2.5 : 1 | 38 ft |
| 3 : 1 | 56 ft |
| 5 : 1 | 128 ft |
| 10 : 1 | 288 ft |

(On RG-8X at 14 MHz: 1.5:1 → 7 ft; 2:1 → 20 ft; 3:1 → 50 ft; 5:1 → 112 ft.)

> **UI copy:** "Running 2:1 instead of 1:1 costs you exactly what 20 more feet of coax costs you."

### 10.5 Losing an S-unit to SWR is essentially impossible on decent HF coax

On 100 ft of 0.6 dB line you would need **SWR ≈ 51:1** to incur 6 dB of additional loss — but the physical maximum that line can present at the shack end is **14.5:1**. To incur just +1 dB additional you need 6.1:1. On 0.25 dB line, +1 dB needs 11.4:1; on 1.0 dB line, 4.6:1; on 3.0 dB line, 3.1:1 (and 3.0:1 is that line's ceiling).

### 10.6 Myths to correct — UI-ready copy

**MYTH: "Reflected power comes back and cooks your finals."**
> The reflected wave is not dissipated in the transmitter. What changes is the *impedance* the PA is working into — and the amplifier's response to that impedance (over-voltage, over-current, or collapsed efficiency) is what causes stress. With a tuner adjusted so Γ = 0 at the radio, *zero* net power flows back into the PA. That is arithmetic, not theory. **Extra heat is generated by the device's own v·i product drawn from the DC supply, not by returning joules.**

**MYTH: "A given SWR costs a given number of dB."**
> Mismatch loss is not the loss your antenna system suffers. The real quantity is *additional loss due to SWR*, and it depends on the **matched loss of your feedline** as well as the SWR. On a lossless line, SWR costs exactly nothing.

**MYTH: "The SWR meter at the radio tells me about my antenna."**
> A lossy line puts a hard ceiling on what the meter can read. With 3 dB of matched line loss, a **dead open circuit** at the antenna reads 3:1 in the shack. 100 ft of RG-58 at 440 MHz with nothing on the far end reads about **1.25:1**.

**MYTH: "The tuner tunes the antenna."**
> It matches the *radio* to the shack end of the coax. It cannot change the antenna's feedpoint impedance, cannot change the reflection at the antenna, and cannot flatten the standing wave on the coax. Put an SWR meter on both sides of the tuner and watch: one side goes to 1:1, the other does not move.

**MYTH: "Low SWR means a good antenna."**
> A 50 Ω dummy load reads 1.00:1 on every band, forever, and radiates nothing. Worse: a **lossy antenna has flatter SWR** — added loss resistance pulls the feedpoint toward 50 Ω and broadens the curve. "Flat across the whole band" is as often a symptom of loss as of merit. Adding radials to a vertical *raises* its SWR and makes it substantially better.

**MYTH: "Resonance, match and efficiency are the same thing."**
> Three independent properties. Resonance means X = 0 — a resonant antenna can be 15 Ω or 300 Ω. Efficiency is R_radiation/(R_radiation + R_loss) and has nothing to do with resonance. They get confused because a half-wave dipole at typical heights happens to be resonant *and* near 50 Ω at the same time.

**MYTH: "High SWR damages the antenna."**
> The antenna *causes* the SWR. What takes stress is the line, the matching network and the PA — and the mechanism is volt-amps, not reflected heat. At 100 W: a resonant 80 m dipole sees 75.9 V and 1.318 A with negligible reactive power; a 102 ft G5RV sees 143.5 V, 1.441 A, 207 VAR; shortened to 88 ft it sees **1078 V, 2.153 A, 2317 VAR**; a 20 m dipole used on 80 m sees **14 570 V, 6.233 A, 9.1 kVAR**. Those volts and amps melt tuner capacitors and cook baluns.

**MYTH: "High SWR makes your feedline radiate."**
> Inside a coax, centre-conductor and inner-shield currents are equal and opposite and their fields cancel regardless of SWR. Radiation requires current on the **outside** of the shield — a third, common-mode path. Test: if adding a coax jumper *changes* your SWR reading, you have common-mode current, because on a lossless line changing length rotates the impedance around a constant-SWR circle and cannot change SWR.

**MYTH: "Tuners waste your power."**
> W8JI measured a T-network matching 50 Ω to 50 Ω at 1000 W: 5° phase shift lost 0.5 W; 90° lost 10.6 W; 130° lost 22 W (−0.1 dB). IZ2UUF measured an MFJ-949E in a real mismatched setup at **0.043 dB** of tuner dissipation. An L-network inside a 3:1 window is > 99 % efficient. Tuner loss only becomes serious at extreme transformation ratios — and *there* the real failure is arcing and inductor heating, not gradual dB.

**MYTH: "Energy sloshes back and forth in the coax."**
> In steady state the standing-wave *pattern* is stationary and net energy flow is one-way. Walk a fluorescent tube along an open-wire line: it glows at the voltage maxima and stays dark at the minima, and the pattern does not move.

**MYTH: "SWR is one number for the whole line."**
> On a lossless line, yes. On a **real** lossy line, SWR is maximum at the load and decreases toward the source, and the textbook Vmax/Vmin definition breaks down because max and min occur at different places. "What is the SWR?" is an incomplete question. The complete one is: **"at which reference plane?"**

**MYTH: "Overdriving the mic on an SDR causes splatter outside the passband."**
> On the IC-7300, compression and EQ happen on already-digitised audio and the TX filter is applied in DSP before up-conversion, so the emission stays inside the selected TBW. The real penalties are ALC pumping (average power *drops*, because the loop latches to peaks and recovers slowly), in-band distortion, and PA IMD regrowth. Icom's instruction is 30–50 % of the ALC scale, not full scale.

**MYTH: "TX bandwidth doesn't affect power."**
> It does, via peak-to-average ratio. NAR noticeably reduces SSB output vs MID/WIDE, and changing TX bass/treble from +1/+5 to 0/0 raised measured dummy-load output from ~60–65 W to ~80–85 W.

**MYTH: "The tuner protects the finals."**
> It doesn't. The APC loop reducing drive on high reflected power, high drain current or high temperature does. With the tuner bypassed or out of range, the finals see whatever the antenna presents.

**MYTH: "A conjugate match at the transmitter is always protective."**
> It can actively destabilise a solid-state PA by interfering with the amplifier's own coupling network. The half of the solution worth having is the one **at the antenna**.

### 10.7 Analogies — which to use and which to ban

**BEST — anti-reflection lens coating.** Not an analogy at all; it is the same physics, and it is in everyone's pocket. Bare glass (n = 1.52) reflects 4.26 % per surface. A quarter-wave coating of index n₂ = √(n₁n₃) = 1.233 makes the front- and back-surface reflections equal in amplitude and 180° out of phase; they cancel, and transmission goes to ~100 %. The coating does not *absorb* the reflection — it cancels it by interference, and energy conservation forces the extra light forward. **That is precisely the tuner mechanism:** two backward waves, equal amplitude, 180° apart, cancel at the input port, and the energy has nowhere to go but forward. Nobody thinks their coated glasses "waste" the reflection.

**SECOND BEST — two ropes of different mass tied together.** Shows partial reflection, both reflection polarities (heavy rope → inverted, like a short; lighter rope → upright, like an open), transmission of the remainder, and the meaning of characteristic impedance (mass per unit length ↔ √(L/C)). **Use the two-rope version, never rope-tied-to-a-wall** — total reflection with nothing transmitted is the one case that teaches nothing about power delivery.

**BAN THESE:**
- *"Water hammer / back-pressure in a hose"* — implies the source pushes against a static pressure and burns up; predicts a fixed loss per SWR value; predicts damage by a mechanism that is not the real one.
- *"Reflected power comes back and cooks your finals"* — the single most damaging sentence in ham radio.
- *"Energy sloshes back and forth in the coax"* — makes people think energy is trapped and heating things.
- *"Light hitting a window / echo off a cliff"* — fine for introducing partial reflection, harmful if you stop there. If you use it you must immediately add the second window that sends the echo back.
- *"A tuner fools the radio" / "tuners are cheating"* — the tuner is a real impedance transformer that really does let the PA deliver full power. Calling it a lie makes hams distrust the one device that solves their problem.
- **Quoting the mismatch-loss table as if it were system loss.**

### 10.8 So why does SWR matter at all? — the honest answer

Replace *"What's your SWR?"* with three separate questions:

1. **What is the SWR at the ANTENNA, and what is the matched loss of my feedline at this frequency?** Those two together give the only loss figure that matters (§4.7).
2. **What SWR does my RADIO see, and is it under the foldback threshold?** That is the tuner's job and has nothing to do with (1). Modern solid-state PAs fold back drive above roughly 1.5:1, drop ~3 dB by 2:1 and lock out near 3:1 — a legitimate, non-cosmetic reason to own a tuner.
3. **Is my antenna actually radiating?** SWR cannot answer that. Only efficiency, height, pattern and on-air comparison can.

Stating up front that these are three independent questions is what makes the numbers land instead of reading as contrarianism.

### 10.9 Six demonstrations the simulator should be able to reproduce

1. **The impossible SWR meter.** 100 ft of RG-58, nothing on the far end. Prediction: infinite SWR, rig shuts down. Reality: ~1.96:1 at 146 MHz, ~1.25:1 at 440 MHz. Then reveal `max SWR = 1/tanh(ML/8.686)`.
2. **The wattmeter that says 80 W are lost.** 100 W into a 250 Ω or 10 Ω load (5:1). Meter reads ~180 W forward, 80 W reflected. Measure what the load got: ~100 W.
3. **The constant-SWR circle.** Insert a λ/8 jumper: the Smith point rotates 90°, the impedance changes completely, the SWR does not move. Repeat on a lossy line and show the trace spiralling **inward** — line loss making a bad antenna look good, live. Bonus: if the SWR *does* change, you have just diagnosed common-mode current.
4. **SWR meters on both sides of the tuner, simultaneously.** Rig side goes to 1.0:1. Antenna side does not move at all. Leave both visible.
5. **The dummy-load beauty contest.** Dummy load (1.00:1) vs a real dipole at 2.2:1. Vote on SWR alone, then compare on a remote receiver. Extend with a deliberately lossy but flat antenna versus a full-size dipole with worse SWR.
6. **The fluorescent tube along the line.** The standing-wave pattern becomes visible and is visibly stationary — the fix for "sloshing energy."

### 10.10 Two conflicts inside the sources — do not repeat them

- **QST Nov 2006 (K5DVW)** quotes 0.9 dB additional loss for the ladder-line case (0.5 dB matched, 10:1) and 12 dB for the coax case (0.25 dB matched, 90:1). The formula gives **1.51 dB and 5.31 dB.** The 12 dB looks like mismatch loss (13.6 dB), not additional line loss. Use the formula. The article's qualitative conclusion (ladder line wins by a mile) survives: 2.01 dB vs 5.56 dB is still a 3.5 dB rout.
- **Maxwell's conjugate-match corollary is disputed.** His transmission-line theory is correct for lossless lines; the claim that a single conjugate match implies one everywhere, with 100 % re-reflection at the *generator*, was contested by Bruene (QST Nov 1991), Best (QEX 2001) and Stearns (Pacificon 2011, "Conjugate Match Myths"), and fails for physical lossy lines. **The core teaching does not depend on it** — even the critics agree the causal agent is terminal impedance, not reflected watts. State re-reflection at the **matching network**, where it is uncontroversial, and keep the debate to a footnote.

---

## 11. Open questions and known uncertainties

Label anything in this section as **"Not published — representative"** wherever it surfaces in the UI. A knowledgeable ham *will* check these.

### 11.1 Transmit chain

| # | Question | How the simulator should label it |
|---|---|---|
| 1 | **No inter-stage RF level table exists anywhere.** Icom publishes no dBm figures for the RF UNIT input, YGR amp output, or the gates of Q101/Q111/Q121/Q131. Only the antenna-port alignment targets (2/12.5/52.5/105 W) are published. | "Representative level ladder — Icom publishes no inter-stage levels. Upper bound at the RF UNIT output is the BGA2866's +4 dBm P1dB." |
| 2 | **LR-592 turns ratio unknown**, so the absolute DAC output level cannot be pinned. The −2.5 dBm figure assumes the datasheet's 1:1 reference configuration. | "Assumes 1:1 transformer — ratio not published." |
| 3 | **Does DACLK leave the FPGA at 41.344 MHz** (with FI1221 selecting the 3rd harmonic) **or already at 124.032 MHz** (FI1221 acting purely as a jitter cleaner)? The schematic shows DACLK originating at an FPGA PLL either way. | Show the clock chain, don't claim which. |
| 4 | **Is the 70 MHz version genuinely transmitting a second-Nyquist alias?** 70.0–70.5 MHz > 62.016 MHz Nyquist, so it must be; the required fundamental (53.53–54.03 MHz) falls inside the 6 m TX BPF, which is why a separate 70.00–72.00 MHz TX BPF had to be fitted. **The arithmetic is forced; no source confirms it.** The linked "3 dB sinc rolloff explains the 50 W rating" claim does **not** hold — the sinc delta from 54 to 70.25 MHz is only ~2.3 dB at milliwatt level ahead of multiple gain stages and ALC, and AM scales identically (25 → 12.5 W). Treat the 2:1 as a PA/thermal design decision and the 3 dB coincidence as coincidence. | "Derived from Icom's published clock and filter table. Not confirmed by Icom." |
| 5 | **Does RF POWER scale the digital DAC amplitude in addition to moving POCV?** The block diagram shows only the POCV path. | Model POCV only; note the uncertainty. |
| 6 | **Is any pre-distortion or spur/dither shaping implemented in the FPGA?** Icom neither confirms nor denies, and firmware could have changed since 2016. What *is* provable is that adaptive DPD is precluded — there is no PA-output feedback path into the ADC. | State the hardware constraint, not the intent. |
| 7 | **PCM1802 sample rate and word format.** 48 kHz is the canonical 256 f_S choice from 12.288 MHz; 32 and 24 kHz are also legal in master mode; the MODE0/MODE1 strapping is only in the full schematic. **96 kHz is affirmatively excluded by the datasheet's clock table.** | "48 kHz inferred; 96 kHz is impossible on this clock." |
| 8 | **The DSP's internal TX-domain rate**, which must exceed 72 kHz to carry a 36 kHz IF. Unpublished. | Show the 36 kHz IF label (confirmed); do not state a rate. |
| 9 | **ISL5857 interpolating (2×) vs straight 1× mode.** The CMOS bus is drawn as a single 12-bit port (D0–D11), suggesting 1×, but the mode-control pins are not annotated. | Model 1×; flag it. |
| 10 | **Insertion loss and shape of the RF UNIT band BPFs on transmit** — relevant to how much DAC image rejection they actually provide at 6 m, where the image falls only 16 MHz away. | Not modelled; note that the BPF is the sole defence there. |
| 11 | **HM-219 internal schematic, element part number and output level.** Icom publishes none. The service manual's [MIC UNIT] covers only the connector board. | "Element type from dealer catalogue data; Icom does not publish it." |
| 12 | **IC-7300 mic input sensitivity in mV is not published** — only the 600 Ω impedance. The one hard number is the ACC MOD pin (100 mV rms / 10 kΩ at 50 %) and the alignment reference (30 mVrms at 1.5 kHz). | Use the alignment reference and say what it is. |
| 13 | **COMP compression ratio, attack, release, knee** — all unpublished. Only the 0–10 control range and the 0–30 dB meter scale are documented. | "Representative compressor." |
| 14 | **Internal ALC attack/decay time constants** — unpublished. The ~3 s recovery figure is a single third-party observation and materially changes how an animated ALC meter behaves. | "Single third-party observation." |
| 15 | **TBW filter implementation** — type (FIR/IIR), order, actual skirt steepness. Drawing a brick wall at 100/2900 Hz is an idealisation of unknown accuracy. | Draw soft skirts, label them representative. |
| 16 | **No independent lab measurement of carrier or opposite-sideband suppression** exists — only Icom's ">50 dB" floor and ARRL's ">70 dB". DC4KU measured IMD and harmonics but not these. | Quote both, note the ">" in each. |
| 17 | **CW duty cycle is disputed:** ARRL says 40 %, PA9X and others say 50 %, W8JI says SSB is "less than 35 %". | Use ARRL's 40 %, expose the disagreement. |

### 11.2 Receive chain

| # | Question | Label |
|---|---|---|
| 18 | **Is IP+ literally the LTC2208 DITH/RAND pins, or an Icom composite?** No Icom document says. The strongest counter-evidence is quantitative: the chip's dither is specified to cost < 0.5 dB, yet early IC-7300s lost 9–13 dB of MDS. Something else was happening. Resolving it needs a scope on IC1301's pins or FPGA bitstream analysis. | "Mechanism inferred (VA7OJ), never documented by Icom." |
| 19 | **What changed between early production (~S/N 0200140x, 10–13 dB IP+ penalty) and 2018 (S/N 0201227x, ~1 dB)?** Sherwood states outright that the timing and nature of the change is unknown; his sample #2 was on firmware 1.20 vs 1.14 with only the CPU version differing, which weakly argues for a hardware/production change. | State both measurements and the gap. |
| 20 | **Exact FFT parameters of the spectrum scope** — point count, window, overlap, decimation ratio from 124.032 MSPS to the ~1 MHz display stream. **Do not report a bin count; none is sourced.** Only the empirical 50 Hz RBW at ±2.5 kHz span is established. | Omit. |
| 21 | **The 30 fps figure** comes from Icom's own brochure ("Max. 30 frames/second (approx.)") but appears in neither manual, and what FAST/MID/SLOW map to numerically is unknown, as is whether frame rate varies with span. The **80 dB vertical range is also brochure-only.** | "Brochure-grade, not lab-verified." |
| 22 | **DDC decimation ratio and filter architecture** inside the FPGA — 124.032 MHz down to a 12 kHz-wide baseband on 36 kHz implies a large decimation factor (likely CIC + FIR), but only the block-level image-reject diagram is published. | Show the block diagram only. |
| 23 | **Exact gain budget from antenna connector to ADC pins** (per-band preselector insertion loss, PIN attenuator range, LTC6401-20 loaded gain), which would tie the −10 dBm OVF point rigorously to the 2.25 Vp-p full scale rather than approximately. | "OVF at −10 dBm is measured; the internal budget is approximate." |
| 24 | **Does the scope share the main DDC output or run a parallel FFT engine?** VA7OJ describes a separate ~1 MHz stream, suggesting parallel, but the service manual's FPGA block diagram does not draw the scope path at all. | Draw it as a separate tap, note the uncertainty. |
| 25 | **Does Icom count the "15 filters" as (13 BPF + LPF A + HPF A) or (13 BPF + LPF A + the 1.60–30 MHz LPF)?** The manual says 15; the diagram draws more than 15 discrete blocks including in-series ones. | Say 15, note the ambiguity. |
| 26 | **Attenuator value discrepancy:** the circuit description and VA7OJ's measurement both say 20 dB; the RF UNIT block diagram prints 18 dB. | Use 20 dB, cite the discrepancy. |

### 11.3 PA, thermal and protection

| # | Question | Label |
|---|---|---|
| 27 | **The actual SWR at which firmware begins folding back drive, and the foldback law** (linear in reflected voltage? in reflected power? a hard step?). Icom publishes nothing in any of the three manuals. Resolvable on a bench: a calibrated mismatch (resistive loads of 25/33/75/100/150 Ω, or a 6 dB pad plus sliding load) with a through-line wattmeter, sweeping SWR at several feedline phase lengths, recording delivered power, ID and VD. | **"Representative foldback profile — Icom publishes no thresholds."** This is the single most likely thing a ham will challenge. |
| 28 | **Is foldback phase-dependent?** i.e. does the CPU use only \|reflected power\| from the CM coupler, or also drain current from IC211? The dedicated INA199A2 strongly suggests a parallel ID-based limit, which would make the radio behave differently at the low-Z and high-Z phases of the same SWR. Needs measurement with resistive loads above and below 50 Ω at the same SWR. | Model both loops; label the interaction representative. |
| 29 | **Is SWR-APC a fast analogue loop into the PIN attenuators, or CPU-mediated?** This is the difference between microsecond and millisecond response — i.e. between catching and not catching a hot-switch transient. The block diagram is ambiguous. | State the time-scale hierarchy as reasoning, not measurement. |
| 30 | **Numeric PA temperature thresholds** for (a) "LMT" power-down and (b) TX inhibit, and the fan start/full-speed temperatures. The sensor is R351 (NTCG20 4AG 473JT, 47 kΩ NTC); the trip points live in firmware. | "Not published." |
| 31 | **Actual BV_DSS of the RD70HVF1C.** The datasheet gives only V_DSS = 30 V as an absolute maximum and tests IDSS at V_ds = 17 V. Passing 20:1 all-phase at V_ds = 15.2 V proves real avalanche is well above 30 V, but the number is unpublished, so the true voltage margin under mismatch cannot be computed exactly. | Say "30 V absolute maximum rating," never "V(BR)DSS = 30 V." |
| 32 | **No Z_th(t) transient thermal curve** is published for the RD70HVF1C — only steady-state R_th(j-c) = 1.0 °C/W. The millisecond die time constants here are computed from silicon properties and plausible die geometry. | "Computed, not from a manufacturer curve." |
| 33 | **Exact output transformer turns ratio and true drain-referred load.** The 17:1–24:1 range derives from the load-line equation with an assumed V_sat; the schematic does not yield winding data. Every drain-side impedance figure depends on it. | "Derived from the load-line relation." |
| 34 | **Measured drain efficiency of the RD70HVF1C pair as fitted, band by band.** Whole-radio efficiency (34.5 % at spec, 40.5 % measured) brackets it, but the split between final dissipation, driver dissipation and LPF/transformer loss is estimated (±20 %). A DC clamp on the PA drain feed plus a calibrated through-line wattmeter would separate them. | "±20 % — split is estimated." |
| 35 | **Was the RD70HVF1C's 20:1 all-phase rating validated only at 175 MHz?** The datasheet states ruggedness at 175 MHz and 520 MHz; there is **no HF ruggedness line**, yet the radio runs the part from 1.8 MHz where gain and swing are much higher, and Mitsubishi's precaution 4 warns about sub-recommended-frequency operation. **This may be the single most important unverified assumption in the radio's PA design.** | Surface it explicitly in the damage model. |
| 36 | **Did Icom change the final device across production runs or in the IC-7300MK2?** The service manual used here is the March 2016 original (S-15218XZ-C1) plus the October 2016 addendum; MK2 documentation was not checked. | Scope the model to the original IC-7300. |
| 37 | **Does the internal ATU ever hot-switch its EC2-9TNU relays during a retune under RF?** The external AH-4 explicitly inserts an attenuator ahead of the matching network to prevent exactly this; whether the internal tuner does anything equivalent is not stated. | Flag as unknown; do not assert either way. |
| 38 | **No measured data on capacitor voltage or inductor circulating current inside the LPF bank under mismatch.** The claim that filter elements are stressed is sound in principle but unquantified for this radio. | "Qualitative — not quantified for this radio." |
| 39 | **The TX DELAY firmware finding (2.6 ms on v1.42 vs 9.4 ms on v1.40) is a single measured unit.** Whether it is a general v1.42 regression is unconfirmed. | "One unit — verify on yours before driving an amplifier." |
| 40 | **Fan airflow direction (exhaust vs intake) and its RPM-vs-temperature curve are not published;** only the part number and guard are. Rated acoustic noise is also disputed (Conrad 33 dB max vs a comparison table's 37.5 dB(A)). | Model as exhaust; label it. |
| 41 | **No published failure-rate statistics** for the IC-7300 broken down by component. The evidence base is individual repair reports, heavily selection-biased toward interesting failures. | Present repair-report findings as anecdotes, not statistics. |

### 11.4 Tuner

| # | Question | Label |
|---|---|---|
| 42 | **Actual inductance values of L2011–L2091 are not printed anywhere** — only Icom part numbers. Confirming a binary ladder (and its LSB and total) requires a teardown or LCR measurement. | "Range derived from the published matching spec." |
| 43 | **The capacitor ladder (9/18/37/75/150/300/600/1200/2400 pF, ~4788 pF) was reconstructed from schematic column positions** in the PDF text layer — particularly whether same-column pairs are in series (this reading) or parallel. | "Reconstructed from the schematic." |
| 44 | **25 latching relays but only 24 set/reset control-signal pairs.** One signal must drive two relays in parallel — most likely the bypass pair RL2211/RL2221 — but this is not confirmed. | Note it. |
| 45 | **Exact roles of RL2211/RL2221** (presumed straight-through bypass) **and RL2281/NCRED with its two 56 pF capacitors** (presumed a series "capacitance reduce" padder to extend range at 6 m) are inferred from placement, not text. | "Inferred from schematic placement." |
| 46 | **Is the internal ATU enabled on 70 MHz** on European versions? The manual never mentions the tuner in connection with the 4 m band. | Unknown. |
| 47 | **Icom publishes no separate 6 m matching range** for the IC-7300, and no count of ATU preset memories (100 kHz segments over 1.8–54 MHz would be ~520). LDG narrows its equivalent switched-L tuner from 6–1000 Ω on HF to **16–150 Ω on 6 m**, which suggests the IC-7300's 6 m range is also narrower than its HF spec — unconfirmed. | Model the 6 m narrowing as representative and say why. |
| 48 | **Does Emergency (Tuner) mode change the SWR-detector threshold in firmware, or only relax the accept criterion and clamp power to 50 W?** | Model as an accept-criterion relaxation + 50 W clamp. |
| 49 | **Unloaded Q of the ATU inductors at 1.8 MHz is unknown**, so the >99 % internal-tuner efficiency figures here are modelled (Q_L = 200 assumed), not measured. **No published measurement of IC-7300 internal ATU insertion loss was found.** | "Modelled at Q_L = 200 — no published measurement exists." |

### 11.5 Transmission line and antennas

| # | Question | Label |
|---|---|---|
| 50 | **Which loss convention should ship as default** — nominal Belden/Times datasheet values or the ~15–27 % more pessimistic ARRL-style ham-band table? They disagree by 0.65 vs 0.75 dB/100 ft for RG-213 at 14 MHz. | Ship both behind a "new cable / typical installed cable" toggle. |
| 51 | **ARRL's own TLW cable coefficients could not be recovered** (TLW ships on the Antenna Book CD-ROM). The k1/k2 here are least-squares fits to manufacturer tables; the method is validated (it reproduces Times' official LMR-400 coefficients to 3 s.f.) but the RG-58/8X/213 numbers are fitted, not ARRL's. | "Fitted from manufacturer tables." |
| 52 | **Should the K0 (DC-resistance) loss term be included?** RG-58's 14.9 Ω/1000 ft total DCR contributes ~0.13 dB/100 ft. Negligible above 1.8 MHz, **necessary below ~500 kHz** (630 m / 2200 m). | Omit above 1.8 MHz; note the limit. |
| 53 | **Complex-Z0 model choice is unresolved.** The first-order Chipman-style form is used here; TLDetails uses a fuller model including internal inductance and a frequency-varying "true velocity factor" whose equations are not published. Sub-0.05 dB agreement would need that model. | "First-order complex-Z0 approximation." |
| 54 | **Max-power ratings at HF are not published for every cable.** Belden gives RG-58C/U only from 50 MHz and RG-8X from 10 MHz; RG-213's 1 MHz figure is voltage-limited and unrealistic. The HF numbers here are editorially chosen ham practice. | "Editorial, not datasheet." |
| 55 | **"Derate by SWR" vs "derate by SWR²" is unresolved in the sources.** The physics verified here (voltage-breakdown and I²R hot-spot both scale as SWR for constant net power) supports SWR; multiple vendor pages state SWR². | Pick SWR, **label the convention visibly.** |
| 56 | **Common-mode Z_shield_to_ground has no closed form** — it depends on feedline length, routing, height and station grounding. A credible model needs either a NEC-derived lookup or a deliberately simplified resonant-stub approximation. | "Simplified resonant-stub approximation." |
| 57 | **The N6LF sparse-radial values (4 radials on ground → R_g ≈ 100 Ω) are much higher than the commonly cited 15–25 Ω**, because near-resonant sparse radial screens add their own loss. Which curve should be the default? Also unresolved: whether to model radial resonance at all. | Ship a smooth R_g(N) fit; expose both endpoints. |
| 58 | **The ARRL Antenna Book K-factor-vs-(L/d) table was not obtained** (it exists as a graph; Cebik points to "Calibrating K to NEC", QEX March 1996). The K values here (0.959–0.977) are free-space and induced-EMF-derived; the empirical installed value behind 468/f is ~0.951. | "K derived, not from the Antenna Book table." |
| 59 | **Hamstick bandwidth model disagrees with the one published measurement on 20 m** (model 204 kHz vs reported 100 kHz), though 40 m and 75 m match well. Either the reported figure is for a different whip, or the upper-stub Z0 needs frequency scaling. A second independent dataset would settle it. | "20 m figure disputed." |
| 60 | **Cebik's multi-band inverted-V and 135 ft doublet tables exist only as images**, so there is no per-band R + jX for an inverted V on its harmonics including apex-angle effects. | Model the inverted V by the apex-angle correction only. |
| 61 | **The antiresonant R cap (2000–5000 Ω) is a judgement call** that depends on height, wire loss and what the feedline/transformer adds. Per-antenna-type values (EFHW ~2500, high thin-wire dipole ~4500) should be confirmed against NEC runs with a real ground model. | "Clamp value chosen per antenna type." |
| 62 | **No measured full SWR sweep of a stock 49:1 EFHW across 40/20/15/10 m was located.** The harmonic-drift numbers are model-derived plus per-band SWR values from one builder; a real sweep would let the compensation-capacitor model be calibrated rather than assumed. | "Compensation capacitor modelled, not calibrated." |
| 63 | **Should the model expose frequency-dependent feedpoint impedance, or accept a fixed Z_L?** A station sim that only lets you type 50 + j0 shows none of the interesting behaviour. | Always drive Z_L from the antenna model. |

### 11.6 Physical model

| # | Question | Label |
|---|---|---|
| 64 | **How far the main tuning dial projects forward from the panel face.** The manuals give only "projections not included" for the 238 mm depth; no side-elevation dimension drawing was found. Estimate ~12–15 mm. | "Estimated." |
| 65 | **Knob protrusion heights and key-recess depths** for TWIN PBT, AF/RF-SQL and MULTI — not in any published drawing. | "Estimated." |
| 66 | **Icom publishes no colour code.** The dark grey/graphite covers vs black front panel split is from photography; exact values need eyedropping from a colour-calibrated photo. | "Colours approximated from photography." |
| 67 | **Is the narrow lens slot in the POWER key cap actually illuminated?** The parts list pairs the knob with a "3765 A-LENS", implying a light pipe, but the manual's panel description lists no power indicator there. | Model it unlit; note it. |
| 68 | **Which physical side holds PA vs MAIN** is inferred from rear-connector heights and the fan offset, not stated anywhere. | "Inferred board placement." |
| 69 | **The exact on-screen font.** Icom offers "Basic" and "Round" for the frequency readout only and does not name the typeface. A close free substitute (squared-off geometric sans, heavy rounded terminals) must be chosen by eye. | Use an original face; never claim it is Icom's. |
| 70 | **Rear-panel jack ordering (ALC left of SEND) is from the manual drawing and brochure callouts**, and is worth confirming against a photograph since the silkscreen is the ground truth. | Minor. |
| 71 | **The control-DAC attribution is ambiguous in the sources.** The FANV/POCV/REFV analogue control voltages are shown coming from IC121 R2A20169SA (a serial multi-channel DAC) on the schematic, while the parts list and one block-diagram reading attribute AGC/POCV generation to IC971 PCM1754DBQR. Both parts exist. | Name both; do not assert which generates POCV. |

### 11.7 Trademark and asset policy

Everything in §3 is dimensional and descriptive data, obtained by measuring Icom's published orthographic line drawings and reading published specification text. **No bitmap from any Icom manual is required to build the model.** The scale marks (S1-3-5-7-9/+20/+40/+60 dB; Po 0/25/50/100 %; SWR 1/1.5/2/2.5/3/∞; COMP 0/5/10/15/20 dB; Id 0/5/10/15/20/25 A; Vd 10–16 V; TEMP COOL–HOT), the 8 × 10 dB grid, the 480 × 272 canvas and the sampled hex colours are sufficient to redraw an original screen from scratch.

**Icom's logo, wordmark and the "IC-7300" model legend are trademarks and must be replaced with the project's own branding on a stylised model.**

---

## Appendix A — Definitive part list for the simulator

Only parts confirmed from Icom's parts list, schematic set or the component manufacturer's datasheet. **Do not invent additions.**

**MAIN UNIT:** IC301 R7S721000VCFP (CPU, X301 CR-1017 48.000 MHz) · IC351 GT24C128B (config EEPROM) · IC661 PCM2901E (USB codec, X661 CR-1020 12.000 MHz) · IC721 MP7741DQ-LF-P (class-D AF) · IC901 TMS320C6745DPTPA3 (DSP, X901 CR-1021 12.288 MHz) · IC902 EN25QH32A (32 MB flash) · IC971 PCM1754DBQR (control DAC) · IC972 NJM2904 + Q971/Q972 (DC amps) · IC991 PCM1754DBQR (RX audio DAC) · IC992 TS462CPT (AF amp/anti-alias) · IC1001 PCM1802DBR (TX audio ADC) · IC1002 TS462CPT (MIC amp + ACC LPF) · IC1003 TC7W53FK + Q1001 LDTC114 (MOD mux) · IC1121 R2A20169SA (multi-channel control DAC: FANV, POCV, REFV, ICCV, IDL…) — *listed in the schematic as IC121* · IC125 NJM2904CRB1 (fan buffer) · Q45 DSC7004S0L (fan pass) · IC141 SN74AHC595PW (I/O expander) · IC1211 SN74AHC1GU04DCKR (41 MHz squarer) · IC1212/IC1315 SN65LVDS1DBVR (LVDS) · IC1221 SN74LVC1G04DCKR (124 MHz re-squarer) · IC1241 XC6209F502MR-G, IC1321 XC6209F332MR-G (regulators) · IC1261 LTC6401IUD-20 (ADC driver) · IC1301 LTC2208IUP-14 (RF ADC) · IC1331 ISL5857IAZ (TX DAC) · IC1351 EP4CE55F23I7N (FPGA) · IC1401 23LC1024T (1 MB SRAM) · X1201 CR-932 41.344 MHz VC-TCXO · FI1221 FL-391 / DSF334SAF 124.032 MHz · L1331 LR-592 · D1231/D1232 1SV308 · D1251 BAP70Q · R1331 49.9 Ω · R1334 120 Ω · R1335 1.8 kΩ · C1332 0.1 µF · L1281/L1282 LQW18ANR12G00D 120 nH · C1281/C1285 33 pF · C1283 82 pF · C1235 0.1 µF

**RF UNIT:** IC1031 BGA2866115 (YGR amp) · Q1411 2SC3356L (RX preamp) with Q1412/Q1413 LDTC143ZET1G · D1001 (RX mute) · D1081–D1083 (attenuator) · D1021/D1041 BAP70Q (ALC) · D1051/D1052 BAR64-02V (band gain) · IC1301–IC1303 SN74AHC595 (band select) · IC1501 NJM13403, IC1502 NJM2904, IC1571, Q1521 L2SA1576, Q1571 L2SC4081 (ALC/APC) · IC1061 XC6209 · J201 LGR4609-7000 (ALC/SEND RCA) · J101 RL-1515-2 (KEY)

**PA UNIT:** Q101 2SK2854 (T2LICOMF) · Q111 RD01MUS2-T113 · Q121 RD15HVF1-101 · Q131/Q132 RD70HVF1C-121 (Icom P/N 1560001591) · R101 270 Ω, R102 18 Ω, R103 270 Ω (3 dB pad) · D101/D102 KDS122 · R104 68 Ω, R105 820 Ω (Q101) · R111 56 Ω, R114 820 Ω, R112 2.7 k, R113 6.8 k (Q111) · R121 56 Ω, R125 150 Ω + C125 0.01 µF, R122 1 k (Q121) · L131 LR-606 (drive balun) + R131 100 Ω · R142/R143 0.68 Ω (gate) · L133 LR-605 (output transformer) · L134 LR-507 (drain choke) · C160/C161/C162 470 µF · D201 DZ2J180 · D202 DF30SC4M · R211 0.001 Ω · IC211 INA199A2DCKR · Q221 TJ50S06M3L + Q222 RUM002N02T2L (supply cut) · F201 5 A · LPF inductors LA-604 / LA-590 / LA-547 (7-element), LR-294 / LR-295 (5-element) · Relays RL801 + RL820/821, RL840/841, RL860/861, RL880/881, RL900/901, RL920/921, RL940/941 = 15 × Fujitsu FTR-B4CA009Z · IC751 SN74AHC595PW + Q771–Q777, Q781–Q787 · D961/D962 LRB751S-40T1G · IC981 NJM2904CRB1 · R351 NTCG20 4AG 473JT (47 kΩ NTC) · Q811 KTC2875, D811/D812 BAR64-02V (TX mute)

**TUNER UNIT (B-8329B):** L2011 LA-559 · L2021–L2071 LA-459, LA-460, LA-461, LA-462, LA-463, LA-464 · L2081 LR-542 (T68-2) · L2091 LR-539 (T68-2) · L2099 AS080447-33N · 25 × Panasonic/NEC EC2-9TNU · IC2811/2821/2831/2841 BU2092FV · D1201 MMBD452 (power det) · D1311/D1312 MMBD352 (phase det) · D1505 MMBD452 (SWR det) · D1701 (impedance det) · IC1701 BA2903 · IC1901 NJM2904

**FRONT/DISPLAY:** DS1 Raystar RFE430H-AZH-DNS-000 (4.3", 480 × 272, LED backlight, resistive touch) · S1–S25 LS37J2-T · EP1 EX-2500 (main dial optical encoder) · PBT UNIT TP90D96AE20-30.5F · RIT UNIT TP90N00AE20-14.5F

**CHASSIS:** MP1 3765 CHASSIS (die-cast) · MP2 3765 U-COVER · MP3 3765 L-COVER · MP4 3765 SP RUBBER (TOP) · MP5 3765 NET · MP6 3015 STAND HOLDER ×2 · MP7 3015 STAND · MP9 RUBBER LEG (A) SK1912A ×2 · MP51 3765 MAIN HEATSINK-1 Y2205A · MP52 THERMAL SHEET (CL) TC-200CAS 26×37 · MP60/MP61 THERMAL SHEET AY ×2 each · MP63 THERMAL SHEET (CA) TC600HS1.4 6.9×9 ×3 · MF1 FD128025HB-N (2N7R1) · EP2 S80-5 · SP1 057D0805 · J1 MR-DS-01-2 (DC) · J45 B2B-PH-SM4-TB (fan)

---

## Appendix B — Numbers to hard-code, at a glance

```ts
// clocks & converters
REF_HZ          = 41_344_000        // X1201 CR-932
FS_RF_HZ        = 124_032_000       // 3 × ref; block diagram prints 124.033
NYQUIST_HZ      =  62_016_000
IF_TX_HZ        =      36_000       // DSP → FPGA, real IF
IF_RX_HZ        =      36_000       // 12 kHz wide
AUDIO_FS_HZ     =      48_000       // representative (256 fS from 12.288 MHz)
DAC_BITS        = 12                // ISL5857
ADC_BITS        = 14                // LTC2208-14
DAC_IOUTFS_A    = 0.020
DAC_FS_DBM      = -2.5              // representative
ADC_FS_VPP      = 2.25
ADC_OVF_DBM_ANT = -10

// PA (RD70HVF1C ×2)
VDS_MAX_V       = 30                // absolute max rating, NOT a breakdown spec
ID_MAX_A        = 20
PCH_MAX_W       = 150               // at Tc = 25 °C
TCH_MAX_C       = 175
TCH_TARGET_C    = 140               // Mitsubishi reliability recommendation
RTH_JC_K_PER_W  = 1.0
RTH_CS_K_PER_W  = 0.4               // representative
RTH_SA_K_PER_W  = 0.35              // representative, pair, fan running
CHASSIS_C_J_PER_K = 360             // representative, ~400 g Al
TAU_DIE_S       = 0.003             // representative
TAU_CHASSIS_S   = 126               // = 360 × 0.35

// driver / pre-driver
Q121_PCH_W = 48 ; Q121_TCH_C = 150 ; Q121_RTH_JC = 2.6
Q111_PCH_W = 3.6; Q111_TCH_C = 150 ; Q111_RTH_JC = 34.5   // Oct-2011 datasheet rev

// station
VDD_NOM_V       = 13.8
VDD_TOL         = 0.15
I_TX_MAX_A      = 21.0              // spec (PSU sizing)
I_TX_TYP_A      = 17.9              // measured (N9EWO); ARRL 18.5
I_RX_A          = 0.836
P_OUT_W         = 100               // AM 25 W; 70 MHz versions 50 / 12.5 W
Z0_OHM          = 50

// tuner
ATU_R_MIN = 16.7 ; ATU_R_MAX = 150 ; ATU_SWR_MAX = 3.0
ATU_TARGET_SWR = 1.5
ATU_TUNE_S_TYP = 2.5 ; ATU_TUNE_S_MAX = 20
ATU_PRESET_STEP_HZ = 100_000
ATU_RETUNE_FRACTION = 0.01
EMERGENCY_P_MAX_W = 50

// protection — ALL REPRESENTATIVE, Icom publishes none
FOLDBACK_START_SWR = 1.5
FOLDBACK_3DB_SWR   = 2.0
FOLDBACK_LOCK_SWR  = 3.0
FAN_ON_CASE_C      = 50
ARC_SUSTAIN_V_PEAK = 100            // W8JI; = exactly 100 W into 50 Ω
RELAY_TRANSFER_S   = 0.010          // 5–20 ms with bounce
TX_DELAY_S_DEFAULT = 0.008          // ~8.3 ms measured at the OFF default
```

---

*End of reference. Every figure above is either first-party, manufacturer-datasheet, an identified third-party lab measurement, or explicitly marked as derived. Where two sources conflict, both are stated. Where nothing is published, the document says so rather than filling the gap.*