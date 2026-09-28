# Stage Lighting Lab · teaching notes

A small theatre stage lit like on a DMX lighting desk. The lab follows the workflow of **Lightkey** (DMX software for Mac): Output → Patch → Design view → Live View → Cue lists. Lightkey is well suited to teach these basics (fixtures from a library, patch, presets, cue lists with fades); larger theatres use consoles (ETC Eos, grandMA) with the same concepts.

## The rig (12 fixtures, universe 1)

| Fixture | Type | Address | Channels |
|---|---|---|---|
| FOH left / right | Profile (ERS), 26°, 60 000 cd | 1, 2 | Dimmer |
| Lectern special | Profile, edge 0.05–0.6 | 3 | Dimmer |
| Wash left / right | Fresnel, zoom 12–60° | 4, 5 | Dimmer |
| Centre PC | PC, zoom 10–50° | 6 | Dimmer |
| Backlight | Fresnel | 7 | Dimmer |
| LED PAR left / right | RGBW | 11–15, 16–20 | Dimmer, Red, Green, Blue, White |
| Cyc batten left / right | RGB | 21–24, 25–28 | Dimmer, Red, Green, Blue |
| Moving head | spot, zoom 10–40° | 31–38 | Pan, Pan fine, Tilt, Tilt fine, Dimmer, Colour, Gobo, Zoom |

Conventional fixtures hang on a dimmer channel each (as with a dimmer pack).

## Photometry

- Illuminance E = I(θ) · cos(incidence) / d² (lux), with I in candela. I(θ) is full inside the hot centre and falls smoothly to zero at the edge of the field; the edge setting moves the start of the fall.
- Zooming wider spreads the same light: the peak intensity goes down with the square of the angle.
- Gels: the colour is tungsten 3200 K × the filter; the transmission (201: 35 %, 204: 63 % from LEE; others approximate) reduces the light.
- The 3D view uses three.js spotlights in candela with physical falloff, so the pools on stage match the numbers of the light meter.
- The face is measured at 1.55 m looking at the audience; the backlight on the head and shoulders.

## Stages

1. **The fixtures** — turn on one of each kind; a hard special on the lectern (profile, edge ≤ 0.2) and a flooded Fresnel wash (zoom ≥ 40°).
2. **DMX and patch** — type 153 / 255 / ≈140 / 0 / 0 for amber at 60 %; fix a patch with overlaps (footprints: 1, 5, 4, 8 channels); DIP switches for address 37 (32 + 4 + 1).
3. **Designing the light** — ≥ 400 lx on the face, key:fill 1.5–3 (e.g. FOH left 100 %, right 55 %: about 400 + 220 lx), backlight ≥ 150 lx; cyc blue (hue 200–250°) and LED PARs warm (15–50°); aim the moving head at the dancer (the beam axis within 35 cm of her chest).
4. **Cues** — cue 1 preset (cyc only, face < 50 lx), cue 2 scene (face ≥ 400 lx); cue 2 fade ≥ 3 s, a blackout as the last cue, and run the list with GO from cue 1 to the end.

## Ideas for class

- Before the light meter, ask for a guess: how much does the face lose if the FOH bar were twice as far?
- Show the DMX monitor while a colour fades: the numbers are the show.
- With a real Lightkey setup, repeat the patch of the lab and address a real fixture with its menu or DIP switches.
