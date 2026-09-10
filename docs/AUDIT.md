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

## Found after the audit, in the field

**The container crash-looped on first run.** `docker-compose.yml` mounted a
tmpfs over `/var/cache/nginx` to keep the root filesystem read-only, which
replaced the ownership the image had set with a fresh root-owned filesystem —
and nginx runs as uid 10001, so it could not create its own temp directories.
The audit had flagged that nothing in the repository ever ran the container;
that finding was recorded as open, and this is exactly what it was pointing at.

The first fix gave the tmpfs `uid`, `gid` and `mode`, consolidated every
writable path under that one directory, and added a CI job. **It did not work,
and the CI job passed anyway** — because the job started the image with
`docker run` and a hand-written set of flags rather than with the compose file
that actually ships. Testing an equivalent of the artefact is not testing the
artefact, and a green build said so twice.

The real fix stops the container depending on the consumer's mount options at
all: the default `docker-compose.yml` no longer sets a read-only root, so the
directories the image creates and owns are the ones nginx uses. The hardening is
an opt-in overlay, `docker-compose.hardened.yml`, carrying the tmpfs options it
needs. CI now brings up both — by running those exact files — and checks the
healthcheck goes healthy, the application and the SPA fallback are served, a
self-hosted font is served, the process is not root, and the security headers
survive on a cached asset, which is where nginx drops them.

## Found in the field, second round

Reported from a live deployment, and all confirmed:

**The TEMP meter was showing the die.** The junction has a time constant of about
a tenth of a second — it genuinely does reach 108 degC five seconds after keying,
and it genuinely does swing with every syllable. But no operator has ever watched
a radio do that, because the meter reads a thermistor bolted to a few hundred
grams of aluminium. The meter now shows that sensor, which moves over minutes;
the die is reported beside it, labelled, because it is still the temperature that
decides whether the radio survives.

**The ammeter was showing the finals, not the radio.** 14.5 A against Icom's
published 21 A maximum and the 16.6 A measured independently. The driver chain
and the housekeeping load are now counted, which lands it on 16.6 A.

**Two switches did nothing.** `LABELS` was threaded all the way to the scene and
never read; the component `FLOW` was meant to drive was never written, because
the agent building it died mid-run and the gap was never noticed. Both are real
now — annotations that name what the numbers refer to, and energy markers whose
count follows the actual level at each stage, so the audio side is a trickle and
the run to the antenna is a flood.

**The camera fought the viewer**, a drag counted as a click on whatever was under
it, and hovering flooded the whole case with emissive cyan. All three are fixed
and covered by tests that drive a real drag.

**The feedline went amber at 1.4:1.** A well-matched line is not "slightly hot",
and colouring it as though it were tells the reader that an ordinary station is
in trouble. Nothing enters the heat ramp below about 2:1 now.

**The power split flickered to zero between syllables**, because those figures
are instantaneous envelope powers and SSB genuinely falls silent. They are
printed as numbers rather than swept as needles, so they now hold their peak long
enough to be compared with each other.

## Found in the field, third round

**The finals overheated far too quickly on a continuous-duty mode.** Reported by
an owner running DATA at 100 W: the die passed its warning point ten seconds in
and the radio had cut itself to 73 W inside two minutes. Real ones do not do
that. Research against primary sources found four separate errors:

- The heatsink was modelled as 400 g of aluminium floating in space. It is bolted
  into a 4.2 kg die-cast chassis that the reviewer who measured this radio
  explicitly describes as part of the heat path.
- The fan was thermostatic and did nothing for the first half-minute. The real
  one runs at near-full speed from the instant of key-up — it is the single most
  common complaint about the radio and the reason people fit a quieter one.
- The protection circuit was fed the junction temperature. The service manual
  lists an NTC thermistor on the PA board; the radio protects on what it can
  measure, which lags the die by tens of degrees and by minutes.
- The mounting resistance was too high for a device sitting on a 26 × 37 mm
  thermal sheet.

Calibrated against the one instrumented measurement in public — 33 °C average
case, 35 °C at the hottest point after several minutes of key-down at 100 W,
16.6 A at 14.1 MHz — the model now reproduces both figures and holds full output
indefinitely on a continuous carrier, which matches the complete absence of
first-hand reports of this radio limiting itself in ordinary use.

Also fixed: the radiated wavefronts left from a fixed point above the plinth
rather than from the antenna, because the origin was the height parameter passed
through a clamp. Raising a Yagi past the equivalent of seven metres left the
waves coming out of empty air, and every antenna without a height parameter
radiated from the ground.

## Found in the field, fourth round

**It did not work on a phone.** Reported by the owner. Measured at three sizes
before touching anything: on a 390x844 phone the six view tabs ran off the right
of the header and the last three could not be reached at all, and the floating
meter cluster and view tools covered the entire canvas; on a 768x1024 tablet the
header drew the tabs on top of the wordmark; and a phone held sideways gave the
3D view **100 pixels** of height. There was no responsive layout — one desktop
shell, three media queries, and no test that measured any of it.

What the diagnosis turned up, beyond the obvious:

- **The header could be crushed to nothing.** A CSS grid row set to `auto` is
  still compressible. When the rows under it asked for more than the window had,
  the header collapsed to zero height and its children — including the only
  control that changes view — spilled upward over the canvas. `min-height` on the
  header, not on the row.
- **The layout lagged the window by an event.** `window.innerWidth` is already
  the new number before the `resize` event is dispatched, so anything measuring
  in that gap sees the old layout at the new size. It is also the wrong signal
  for a phone: an address bar collapsing as the page scrolls, or an on-screen
  keyboard opening, changes the usable window without firing it. Now driven by a
  `ResizeObserver` on the document element and by `visualViewport` as well.
- **Two of the three "clipped text" findings were the measurement, not the page.**
  A callout offset with `transform: translate(8px, …)` still counts toward its
  wrapper's `scrollWidth`, which reads as eight pixels of clipped label; the
  offset is now a margin. And a Smith chart's constant-resistance circles are
  mostly outside the unit circle by construction — the group is clipped with a
  `clipPath`, which `getBoundingClientRect` ignores, so it measured as a `<g>`
  overflowing its `<svg>` by 660px while drawing perfectly. Verified by looking
  at the chart before changing anything.
- **The bottom bar was the real problem, not the panels.** At 390px it was 41% of
  the screen. It now sheds in two stages — mode and drive level to the sheet on a
  phone, the two levels set once a session to the tools panel on a tablet — which
  took it to 166px and gave the difference to the picture and the sheet.
- **Labels stacked on each other.** Not only on a phone: the antenna socket and
  the fan overlapped on a 1600px desktop too, because they are a few centimetres
  apart on the back of the radio and a label is a fixed number of pixels wide.
  Placement is now decided in screen space five times a second, and a label is
  drawn only where it is clear of the ones already placed.

Also found while fixing it: a Handbook card opened on a phone inherited the
sheet's height and gave a 420px article a 149px reading pane. The card now leaves
the sheet below the wide layout and takes the bottom of the window, or the right
of it in landscape, with the part it describes still lit up in the picture beside
it. And the event log had been dropped entirely below 900px, leaving an empty
panel where it used to be. It is the only thing that narrates a
protection event after the fact, which is most of what the high-SWR
demonstrations are for, so it now stays and the panel that held it scrolls.

Twenty e2e tests were written against the responsive contract before any of it
was implemented, five more for label placement and three for the Handbook as
those rules were added — twenty-eight in all. One existing test was rewritten: it
had been booting the whole scene six times to measure page width at six widths,
which is where the suite's only flake was coming from.

### The adversarial pass over that work

Five reviewers with different lenses — cascade, React, reachability,
accessibility, and real browsers — went over the responsive change before it
shipped, and every claim they made was handed to a separate agent whose job was
to refute it. Thirty-nine claims, twenty-seven survived. Twelve were refuted,
most of them usefully: two rested on a stale reading of the diff rather than the
files, one was a pre-existing idiom the change had not touched, and one asserted
a contract sentence that had already been rewritten.

What survived, and what it cost to have missed it:

- **A card opened on a phone covered the whole transport bar**, and with it Tune,
  Transmit, the band strip and the dial. Worse, it covered the tour's Next and
  Back, which on a touch screen are the only way to advance a presentation at
  all. This was a regression introduced by the fix for the 149px reading pane,
  half an hour old, and the test written alongside that fix checked only that the
  card was readable — never that anything behind it still worked. The card and
  the tour now get grid slots that stop above the transport row.
- **The floating tools column ran past the bottom of the picture** in `medium` on
  any window shorter than about 640px, which put "Use my mic" and "Copy this
  bench" under the transport with nothing to scroll. Also a regression from this
  change: moving the two level sliders into that column made it 410px tall. It is
  now bounded by the picture and scrolls.
- **Three quarters of the compact interface was never measured.** The per-size
  audit only ever sees the tab the sheet opens on, so the 40px touch rule was
  being checked against the Meters panel and nothing else. Fifty-three controls
  across the other three tabs were under it.
- **Presenter mode put the labels back on top of each other.** The collision
  boxes were estimated in unscaled pixels while the labels scale with
  `--ui-scale`, so the one configuration this application exists to be shown in
  was the one the declutter did not cover. Threading the scale through the
  estimate was not enough — a character count times a constant was still 27% out
  at the larger size — so the box is now measured: the real string, in the real
  font, through a 2D canvas, cached per string. The first version of the test
  written for this passed against the broken code, because it looked at the
  exterior view and its four labels; it only became a test when it was pointed at
  the cutaway and its eight.
- **`clock.getElapsedTime()` has a side effect.** It advances the Clock's own
  `oldTime`, so anything else asking the same Clock later in the frame gets a
  delta near zero. The declutter now accumulates the delta the render loop
  already passes it.
- **Space belonged to the key, not to the focused control**, so a keyboard user
  who tabbed to a sheet tab transmitted instead of opening it.
- **A closed drawer kept two dozen tab stops** in `medium`, and a card opened
  from the chain list was rendered into a drawer parked off the right edge.
- Smaller: the view picker was 11.5px, which makes Safari on iOS zoom the page in
  and never back out; only the bottom safe-area inset was honoured, so a
  landscape iPhone laid its notch over the Transmit key; `overflow: hidden` on
  the header shaved the focus ring off the picker; two pre-change media queries
  at `max-width: 900px` fired *inside* the medium layout at exactly 900px; a
  class name survived the rule it referenced and shipped as a literal
  `undefined`; and a `grid-template-rows` line was declared twice.

Two more, both found by asserting before the browser had caught up. Three
geometry assertions were measuring the Handbook card **six pixels from where it
lands**, because `toBeVisible` resolves the moment an element paints and the card
slides in over 0.42s. Two of them had been passing on that reading. A geometry assertion has to
wait for `getAnimations()` to empty, or it is testing the entrance rather than
the position.

And the resize test failed on CI after passing locally, for the third time in
this project's history of the same mistake. `setViewportSize` resolves when the
browser has been *told* the new size; `window.innerWidth` updates before the
resize is dispatched; the shell re-renders after that again. On a runner without
a GPU those three moments are far enough apart that a helper waiting for two
identical readings samples twice inside one of the gaps and calls it settled — so
the audit read the layout the shell had *before* the resize. It now waits for the
shell to reach the layout the contract says that window should have, and the
suite takes `SLOW_RUNNER=6` to throttle the CPU by that factor, which reproduces
the runner in thirty seconds instead of forty-two minutes. Verified both ways:
without the gate the test fails under throttling with exactly the CI symptom.

The pattern worth keeping: **every one of the three regressions was introduced by
a fix, and each was covered by a test written at the same time as the fix.** A
test written by the same hand, in the same minute, checks the thing that was just
made to work. It does not check what that change took away.

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
- Nobody has published an instrumented run at 100 percent duty and full power to
  thermal equilibrium — the measurement the model is anchored to is "several
  minutes". Where the radio settles after an hour is inference, not evidence.
- The protection thresholds are representative. Icom publish the two-step
  mechanism and no temperatures.

The honest statement of what is modelled and what is not is in
[MODEL.md](MODEL.md); the sources are in [RESEARCH.md](RESEARCH.md).
