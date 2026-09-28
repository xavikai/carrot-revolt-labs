# Photo Lab — teaching notes

The camera settings are explained in Catalan or Spanish. The modes (M, Av, Tv) and Blender's interface names (Focal Length, Sensor Fit, Depth of Field, F-Stop, Motion Blur…) stay in English so students find the same words on the camera dial and in Blender.

## What the lab models

- **Exposure**: full stops only (one click = double or half the light). The scene has a light level in EV at ISO 100 (full sun 15, bright shade 13, overcast 12, dusk 10, indoors 7, night street 4).
  - Error in stops = scene EV − log2(N²/t) + log2(ISO/100).
  - The meter under the photo goes from −3 to +3 and blinks beyond that.
  - Av and Tv pick the nearest full stop, like a camera would.
- **The photo**: the scene is rendered many times and averaged (up to 40 samples).
  - *Depth of field*: every sample looks from another point of the aperture (diameter = focal length / N), with an off-axis frustum so the focus plane stays still. Out-of-focus lights become discs (bokeh).
  - *Motion blur*: every sample is another instant of the exposure. A small windmill 3 m behind the person, on the left, always turns (5.3 rad/s, sails 0.75 m: the tips move at 4 m/s), so a slow shutter blurs the sails in every step. The photo pane is a **live view** (switch *Live view*, on by default): it renders again about 20 times a second with the current time, so the sails turn on screen; the number of samples adapts to the speed of the computer. *Shoot* keeps one frame in full quality for 1.5 s and in the strip of shots. The sidebar gives the blur at the tips in px.
- **Motion overlay** (switch *Motion* above the photo, in the motion steps and when shooting hand-held): a blue line where the top sail was when the shutter opened, a yellow one where it was when it closed, the arc between them, and the angle, the distance of the tips in cm and the blur in px (angular speed × exposure time). Under 3 px it turns green (frozen). Hand-held, a red crosshair and arrow show how far the whole photo slid while the shutter was open.
  - *Camera shake*: without a tripod the camera turns about 3° per second while the shutter is open. This reproduces the 1 / focal length rule of thumb.
  - *Exposure and noise* are applied at the end. Highlights clip, and noise grows with ISO and in the shadows. The histogram shows clipped highlights (red) and shadows (blue).
- **The DSLR cut in half**: the lens gets longer with the focal length, the iris closes with the f-number during the shot, and the sensor changes size.
  - Shoot plays mirror up → aperture stops down → first curtain → exposure → second curtain → mirror down.
  - Short exposures are shown slowed down, and it says so.
- **Measured values** (sidebar): depth of field (circle of confusion = sensor diagonal / 1500), background blur, motion blur, shake, hand-held limit, how much of the frame the person fills, angle of view and full-frame equivalent focal length.

## How to use it in class

- Start by asking "what else changes?" for each setting: aperture → depth of field, shutter → motion, ISO → noise.
- Use Shoot to build a strip of photos with different settings and compare them side by side.
- Click the photo to focus: students see immediately that focus and depth of field are different things.
- The DSLR model is useful before the exposure steps: show why the viewfinder goes black during the shot (the mirror is up).

## Stage 1 · Exposure triangle

1. **Balance the meter** (overcast, M): from +6 EV to 0, one stop at a time. One solution: f/4, 1/250, ISO 100.
2. **Blur the background** (Av, 85 mm, 3 m): f/2.8 or wider, focus on the person (click), background blur ≥ 12 px.
3. **Freeze the motion** (Tv): 1/1000 or faster; the camera opens to f/2.8.
4. **Show the movement** (dusk, M): tripod, 1/15, f/8, ISO 100; the streak is about 70 px.
5. **Low light by hand** (night, M, no tripod): 1/60, f/2, ISO 1600. The noise is visible.

## Stage 2 · Focal length & sensor

1. **Frame the person** from 6 m: 70–90% of the frame height (≈ 60–70 mm).
2. **Perspective compression**: the same framing (55–70%) at ≤ 24 mm, close (≈ 2.8 m), and at ≥ 135 mm, far (≈ 15 m). The autofocus follows the person. Compare the size of the posters and trees.
3. **The crop factor**: APS-C (× 1.53) with ≈ 50 mm frames like 75 mm on full frame.

## Stage 3 · Blender camera

Each step shows a reference render to match.

1. **Focal Length** 85 mm on the default 36 mm sensor.
2. **Depth of Field**: Focus Distance 4 m, F-Stop 2. In Blender F-Stop does not change brightness.
3. **Motion Blur**: Shutter is in frames. 1/100 s at 25 fps = 0.25 frames; the default 0.5 is a 180° shutter.
4. **A real APS-C camera**: Sensor Fit Horizontal, Size 23.5 mm, Focal Length 35 mm (≈ 54 mm equivalent).

## Simplifications

- Light is not physically based: the scene is rendered at a "correct" brightness and then multiplied by the exposure error.
- Only full stops, no 1/3 stops; no exposure compensation, metering modes or white balance.
- Diffraction, lens distortion and rolling shutter are not simulated.
- The aperture is circular in the photo (7 blades only in the 3D model).

## Stage "Colour and filters" (white balance and ND)

- Every scene light has a colour temperature: full sun 5500 K, shade 7000 K, overcast 6500 K, dusk 4500 K, indoors 3000 K, night street 2700 K.
- **White balance** (Auto, Tungsten 3200, Fluorescent 4000, Daylight 5500, Cloudy 6500, Shade 7500, or Kelvin 2500–10000): the photo gets a colour cast = colour of the light ÷ colour of the white balance (Tanner Helland's fit of the Planck curve, in linear RGB, same brightness). Auto matches the light, so there is no cast.
- **ND filters** (ND8, ND64, ND1000 = 3, 6, 10 stops) lower the scene EV used by the meter and by the exposure.
- Steps: w1 set the white balance by hand indoors (within 400 K of the light); w2 warm the photo on purpose in the sun (6800–10000 K); n1 1/8 s at f/22 in full sun with an ND8 on a tripod (the sails blur); n2 f/2 at noon in Av, where 1/4000 s is not enough without an ND.
