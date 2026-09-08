# What Antinode models, and what it does not

This page exists because the application will be shown to people who can check it.
Everything below is either derived from a published source, computed from first
principles, or an admitted approximation. Nothing is presented as a measurement of
a real radio.

## The rule the code follows

`src/rf` is the simulation. It is pure TypeScript with no graphics in it: same
inputs, same outputs, every time, and every exported function has unit tests. The
3D scene only draws what `src/rf` returns. If the picture and the physics ever
disagree, the physics is right and the picture is a bug.

Anything the interface shows that is not backed by a published source is stamped
**Representative model** on its Handbook page, and says what is approximated.

## Computed exactly

These are not approximations. They are the standard relations, implemented
directly and tested against published tables.

| Quantity | Relation |
|---|---|
| Reflection coefficient | Γ = (Z<sub>L</sub> − Z<sub>0</sub>) / (Z<sub>L</sub> + Z<sub>0</sub>) |
| SWR | (1 + \|Γ\|) / (1 − \|Γ\|) |
| Return loss | −20 log₁₀ \|Γ\| |
| Mismatch loss | −10 log₁₀ (1 − \|Γ\|²) |
| Reflected power | \|Γ\|² of the forward power |
| Line input impedance | Z<sub>in</sub> = Z<sub>0</sub> (Z<sub>L</sub> + Z<sub>0</sub> tanh γl) / (Z<sub>0</sub> + Z<sub>L</sub> tanh γl), with γ = α + jβ |
| Attenuation constant | α from the cable's published dB/100 ft, β = 2πf / (VF · c) |
| Additional loss due to SWR | 10 log₁₀ ((a² − \|Γ\|²) / (a (1 − \|Γ\|²))), a = 10<sup>matched loss/10</sup> |
| Standing wave | Γ(d) = Γ<sub>L</sub> e<sup>−2γd</sup>, V(d) ∝ \|1 + Γ(d)\|, I(d) ∝ \|1 − Γ(d)\| |
| L-network match | Q = √(R<sub>high</sub>/R<sub>low</sub> − 1) after absorbing the load reactance |
| PA voltage and current stress | ∝ \|1 + Γ\| and \|1 − Γ\| at the device plane |

The lossy-line transform is the full complex form, not the lossless
approximation, because the whole point of the long-coax demonstration is that
loss changes what the meter reads.

## Modelled from published data

- **Cable loss.** A two-term fit, dB/100 ft = k₁√f<sub>MHz</sub> + k₂f<sub>MHz</sub>,
  where k₁ is skin-effect conductor loss and k₂ is dielectric loss. The published
  loss tables for each cable are in a comment beside the fit, so you can check it.
  Velocity factors and characteristic impedances are the manufacturers' figures.
- **Band edges.** IARU Region 2 / FCC allocations.
- **Mode duty cycles.** Average-to-PEP ratios used only for heating.

## Approximated deliberately

- **Antenna feedpoint impedance.** Each antenna is a parametric model that
  reproduces the right resonant frequencies, the right feedpoint resistance at
  resonance, the right sign and rough magnitude of reactance off resonance, and
  the right multi-band behaviour. It is not a NEC model. It will give you a
  believable SWR curve; it will not give you your antenna's SWR curve.
- **The internal tuner's search.** Real automatic tuners step through a discrete
  set of relay-switched inductors and capacitors and settle on the best of a
  finite set. This model solves the network continuously and then applies the
  published matching limits. The match it finds is therefore slightly better than
  a real ATU would manage, and the tune time is a fixed representative delay.
- **The thermal network.** A lumped resistance-capacitance chain — junction,
  flange, heatsink, air — with separate small nodes for the parts that a
  mismatch actually reaches. The time constants are chosen so a junction responds
  in well under a second and a heatsink takes minutes, which is the behaviour that
  matters pedagogically. They are not measured values from a real IC-7300.
- **Damage.** Accumulates above a per-component threshold at a rate that roughly
  doubles every ten degrees. It is a teaching device: it makes "a bit too hot for
  a long time" and "far too hot briefly" visibly different. It is not a
  reliability prediction.
- **Internal component designations.** Icom publishes the finals and the headline
  specifications; it does not publish a full parts list. Where a designator is not
  public, the part carries an empty designation and the Handbook page says the
  detail is representative. No part number in this application is invented.

## Not modelled at all

State these plainly if someone asks:

- **Common-mode current.** The feedline is treated as a two-conductor
  transmission line with no current on the outside of the shield. Real stations
  frequently have common-mode problems, and they change what the meter reads.
- **Antenna patterns, gain and takeoff angle.** The radiated field in the scene
  shows how much power is leaving, not where it goes.
- **Ground constants, nearby objects, and coupling** between antennas.
- **Intermodulation, phase noise, and spectral purity** beyond a schematic
  representation of the transmitted spectrum.
- **The receive path's real dynamic range.** The receive view explains the
  architecture; it does not simulate a receiver.
- **Weather, ice, corrosion, and the connector someone did not solder properly**,
  which between them cause more antenna problems than everything above.

## Independence

This is an independent educational project. It is not affiliated with, endorsed
by, or connected to Icom Inc. "IC-7300" is Icom's trademark, used here only to
identify the equipment being explained. No Icom firmware, artwork, or 3D asset is
included — every mesh in the scene is generated from code in this repository.

Do not use this for engineering decisions.
