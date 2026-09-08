# Audit

Before release the project was audited adversarially: six independent auditors
over separate territories (RF mathematics, IC-7300 facts, antenna models, the
solver and thermal model, the teaching copy, and code/security/deployment), each
told to find things that were wrong rather than to summarise what was right.
Every finding was then handed to a separate verifier whose job was to refute it.

**104 findings raised. 74 refuted on verification. 30 survived** — 15 confirmed
outright, 15 confirmed but overstated in severity or in the proposed fix.

## What it found that mattered

**The transmit chain was drawn in the wrong order.** The interface put the
transmit/receive relay after the antenna tuner — the exact ordering the same file
names as the misconception it exists to correct, and the opposite of the block
diagram traced in its own header. Icom's diagram puts RL801 between the low-pass
filter bank and the directional coupler. Fixed in the stage list, the chain
solver's ordering and the tests.

**The tour taught the myth the application exists to demolish.** The step on
heat said reflected power "arrives back at the PA and adds to what the radio is
already dissipating". It does not: the output network is a transformer, not a
terminator, and the returning wave is re-reflected. What a mismatch actually does
is rotate the load line, so the stage converts less DC into RF and the difference
stays in the silicon. Rewritten.

**Every horizontal wire went dead below a third of a wavelength.** The ground
image coupling was subtracted from the wire's self-resistance outright, but
Carter's mutual impedance is written for two half-wave elements. On a wire that
is not a half wave the subtraction over-cancels: a 40 m dipole on 80 m had
0.1 ohm of radiation resistance against 32 ohms of fitted ground loss, and the
application reported it as radiating 0.3 percent of the power reaching it. It is
a poor antenna, not a dummy load. Now applied as a fraction of the reference
element's resistance, which is dimensionally consistent and bounded.

**Feedline loss was routed through a meter.** `solveLine` computed the additional
loss due to SWR from `swrFromGamma`, which pegs at 999 because it is what drives
a display. An open feedline reported 5.1 dB of excess loss where the exact answer
is 12.3 dB. The physics no longer passes through the clamp.

**The security headers were silently dropped.** nginx does not merge `add_header`
directives down: a `location` block with one header of its own discards every
header it would otherwise inherit. The content security policy the config was
built around was being served on nothing. Now in an include, pulled into every
location, with the trap documented where the next person will read it.

**The Tune key was decorative.** Selecting a tuner applied its match instantly,
so the SWR fell to 1:1 without anyone pressing anything. A tuner in circuit is
not a tuner that has tuned; `tunerEngaged` now requires a search, the search
takes time, and moving the dial or changing the antenna loses the match.

**The myth cards and the glossary were rendered nowhere.** Fifteen sourced
corrections and fifty-eight definitions — the payload of the whole thing — were
in the bundle and unreachable. There is now a Reference drawer.

**Eleven sentences of teaching copy were computed every frame and thrown away.**
`StationSolution.warnings` had no reader. The advice now appears under the meters.

**The supply current was wrong by a third.** The PA used the RD70HVF1's 60 percent
drain efficiency, which is a device figure measured at 175 MHz, as the whole
transmitter's DC-to-RF efficiency at HF. That gave 12.1 A at rated output against
Icom's published 21 A maximum and 16.6 A measured independently. Now 50 percent,
labelled representative, with the thermal chain retuned to match.

Smaller confirmed corrections: the receive ADC is IC1301, not its driver IC1261;
the antenna socket has no published designator and J1/MR-DS-01-2 is the DC
connector; the G5RV's rendered summary quoted a matching section the model does
not use; several part numbers, counts and a datasheet figure that existed in no
source; the peak drain current used a factor of 2 where a push-pull pair needs π.

## What it refuted

Three quarters of the findings did not survive. The power accounting invariant
holds across a 36,960-configuration sweep; the duty cycle is applied exactly
once; the SWR, reflected-power and mismatch-loss tables are arithmetically
correct throughout; the URL parser resists prototype pollution; the tour's
markup escaping cannot be broken; and no real hostname, address or host path is
committed anywhere.

## Known and open

These were raised, are defensible, and are not fixed:

- The cable loss fits ship only the manufacturer-nominal convention. Real cable
  of unknown age is lossier, and both conventions would be better.
- `excessLossDb` returns zero rather than a maximum for a literally infinite SWR.
  The path that matters clamps before it, so nothing on screen is affected.
- The window-line entry ships the round 450 ohm nominal rather than the measured
  characteristic impedance of a specific product.
- Component stresses are evaluated on the instantaneous envelope, so they can
  flicker between syllables. The standing wave itself uses the envelope peak.
- The 3D model's rear panel is a plausible arrangement, not a measured one.

The honest statement of what is modelled and what is not is in
[MODEL.md](MODEL.md); the sources are in [RESEARCH.md](RESEARCH.md).
