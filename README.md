# Antinode

An interactive 3D explorer of the Icom IC-7300 signal path. Follow a voice from
the microphone capsule, through every stage of the radio, out along the feedline,
and into the antenna — then change the antenna, lengthen the coax, move the tuner
and watch what standing waves actually do to the hardware.

It is built for a club talk. Everything on screen is computed, not animated: the
SWR, the loss, the power that actually radiates, and the temperature of the
finals all come from a transmission-line and thermal model that has unit tests.

```
docker compose up -d
```

Then open <http://localhost:3042>.

---

## What it is for

Most people learn SWR as a number that should be small. This shows the whole
system that produces that number, so the interesting facts have somewhere to
live:

- **A tuner at the radio does not fix the feedline.** Put one at the antenna
  instead and watch the excess loss disappear. The application reports SWR at the
  radio and SWR at the feedpoint separately, because they are different numbers.
- **A long lossy cable makes your SWR look better while delivering less power.**
  There is a preset for it. It is the result most likely to start an argument.
- **Adding radials to a ground-mounted vertical makes the SWR worse** — the
  feedpoint resistance falls toward 36 Ω — **and makes the antenna substantially
  better.** Drag the radial count and watch both numbers move in opposite
  directions.
- **Low SWR does not mean a good antenna.** A dummy load is 1.0:1 and radiates
  nothing. It is in the antenna list for exactly that reason.
- **Reflected power does not come back and cook the finals.** What a mismatch
  actually does is rotate the load line, and whether that is an overvoltage or an
  overcurrent event depends on the *phase* of the reflection, not just the SWR.
  The two failures are modelled separately.

## The views

| View | What it is for |
|---|---|
| Exterior | Work the radio from the front. Set frequency, mode and power, key it, and read the meters. |
| Signal path | Follow the signal stage by stage, with the level a probe would read at each point. |
| Exploded | Take the radio apart. Every board and component is selectable and has a page. |
| Cutaway | See the boards in place, in the order the signal crosses them. |
| Thermal | Where the heat goes, and which parts are being harmed right now. |
| Station | The whole system: radio, feedline and antenna, with the standing wave drawn on the coax. |

The feedline is the thing to point at. Its thickness is the voltage envelope the
model computed, so voltage antinodes bulge and nodes pinch, the spacing changes
as you tune, and the colour walks a heat ramp with *local* stress — you can see
where on the line the trouble is, which no meter reading can tell you.

## Controls

Drag any digit group of the frequency readout to tune by that decade, or use the
arrow keys. Everything else is a panel control on the two rails.

| Key | Action |
|---|---|
| `1`–`6` | Switch view |
| `Space` | Transmit |
| `T` | Run the tuner |
| `L` | Toggle labels |
| `P` | Presenter mode |
| `←` `→` | Step through the guided tour |
| `Esc` | Leave the tour, or close the open page |

**Use my mic** hands the transmit chain a real microphone instead of the
synthetic voice, so you can watch your own syllables push the ALC. Nothing is
recorded and nothing leaves the browser.

**Copy this bench** puts the whole station configuration in the URL, so you can
send someone the exact setup you were looking at.

## For presenters

Press `P` for presenter mode: larger type and heavier contrast, sized for a
projector at the back of a room.

The **Tour** walks the whole chain in order, setting the radio up at each step,
and ends by breaking it. It runs on two keys. Budget about twenty minutes.

If you have less time, the scenario buttons each make one point in about a
minute:

| Scenario | The point |
|---|---|
| Resonant dipole, 40 m | What right looks like. |
| Same dipole, one band up | Resonance is not a match. |
| 60 m of RG-58 on 20 m | The SWR meter improves; the radiated power collapses. |
| Internal tuner on a random wire | The radio is happy. The feedline is not. |
| Open circuit at full power | Foldback, heat, and what is actually at risk. |
| Dummy load | 1.0:1, and not a single watt on the air. |

Turn the **thermal clock** up to 60× before the damage demonstrations, or you
will be standing there for ten minutes. Temperatures stay correct; only the clock
is sped up, and the interface says so while it is.

## Running it

The published image is multi-architecture (amd64 and arm64) and completely
self-contained — it serves its own fonts and makes no outbound requests, so it
works on a venue network with no internet, or none at all.

```bash
docker compose up -d          # pull and run on port 3042
TAG=v1.0.0 docker compose up  # pin a version
```

The container runs unprivileged and cannot gain privileges. It does not set a
read-only root filesystem by default: nginx has to write a pid file and its temp
directories, and pinning that down needs tmpfs mount options that are easy to
lose when a compose file is copied around. If you want that hardening it is a
separate overlay, and it is tested:

```bash
docker compose -f docker-compose.yml -f docker-compose.hardened.yml up -d
```

To develop:

```bash
npm ci
npm run dev        # http://localhost:5173
npm run verify     # type check, lint, unit tests, build, end-to-end tests
```

The image is built by GitHub Actions on every push to `master`, which runs the
type check and the unit tests inside the build stage — a broken build never
produces an image.

## The model, and its limits

`src/rf` is the simulation: pure TypeScript, no graphics, fully unit tested. The
3D scene only draws what it returns. Reflection coefficient, SWR, the lossy-line
impedance transform, additional loss due to SWR, L-network matching and the
standing wave envelope are all the standard relations, implemented directly and
checked against published tables.

The antenna models are parametric approximations, not NEC models. They give you a
believable SWR curve with the right resonances and the right multi-band
behaviour; they will not give you *your* antenna's SWR curve. Common-mode current,
radiation patterns and takeoff angle are not modelled at all.

Everything the interface shows that is not backed by a published source is
stamped **Representative model** on its page and says what is approximated. The
full statement is in [docs/MODEL.md](docs/MODEL.md), and the sources the physics
and the copy were written against are in [docs/RESEARCH.md](docs/RESEARCH.md).

Before release the whole thing was audited adversarially and the findings were
themselves verified by a second pass. What that found, what it refuted, and what
is still open is written down in [docs/AUDIT.md](docs/AUDIT.md).

One correction worth stating plainly, since the internet is confidently wrong
about it: the IC-7300's finals are **RD70HVF1**, not RD100HHF1. Icom's own
service manual parts list gives RD70HVF1C-121 for Q131 and Q132.

Do not use this for engineering decisions.

## Independence

This is an independent educational project. It is not affiliated with, endorsed
by, or connected to Icom Inc. "IC-7300" is Icom's trademark, used here only to
identify the equipment being explained. No Icom firmware, artwork or 3D asset is
included — every mesh in the scene is generated from code in this repository.

## Licence

MIT. See [LICENSE](LICENSE).
