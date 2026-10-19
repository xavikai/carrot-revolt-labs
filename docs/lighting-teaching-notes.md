# Lighting Lab — teaching notes

Explanations are in Catalan or Spanish. Blender's interface names (Point, Sun, Spot, Area, Power, Strength, Radius, Spot Size, Blend, World, View Transform, AgX, False Color, Exposure…) stay in English so students find the same words in Blender.

## The set

- **Subjects**: a plaster bust (albedo 72%) on a socle and a pedestal, a grey ball (18%) and a chrome ball on a stand.
  - The bust is a sculpt of smooth blended shapes (head, features, hair, neck, shoulders and the classic cut of a bust) meshed with surface nets by `tools/make-bust.mjs` into `labs/lighting/assets/bust.bin` (about 53 000 vertices, 1.1 MB). A simple bust is shown until it loads.
  - **Your model…** (Subject panel) loads a .glb (uncompressed), .obj or .stl, scales it to 40 cm, gives it the plaster material and puts it on the socle. Z up turns files with Blender's axes; Turn 90° turns it around the vertical. Faces that point inwards are turned round. It stays in the tab only. The light meter keeps reading the points of the lab's bust, so step checks are unchanged.
- **Backdrop**: a paper sweep 1.2 m behind the bust. It can be white (85%), grey (50%) or black (4%).
- **Lights**: four of them (Key_Light, Fill_Light, Rim_Light, BG_Light) and a Bounce_Card.
  - Each one is placed by Azimuth (0° = in front of the bust, +90° = camera right), Elevation and Distance.
  - Each one always points at its target (the head, or the backdrop for BG_Light), like a Track To constraint.
- **Camera**: fixed, portrait framing.

## The physics (light.js, tested)

| Light | Irradiance on a surface |
|---|---|
| Point / Spot | E = P / (4π d²) · cos θ. The spot only multiplies by its cone (Spot Size, Blend with a smoothstep); narrowing it does not concentrate the power. |
| Sun | E = Strength · cos θ, whatever the distance |
| Area | intensity (P / π) · cos θ_light, integrated over 5 × 5 points of its surface. On its axis it gives 4× the light of a point light of the same power. |
| World colour | E = π · L · Strength |
| World HDRI | numerical integration of the procedural HDRI |
| Area with Spread | each point of the panel × max(0, 1 − tan a / tan(Spread/2)): the grid removes the light at the sides and keeps the axis |
| Gobo / IES (cookie) | × the value of the gobo (Mapping Scale and Rotation, Clip) or of the IES profile in the direction of the point |
| Light Falloff | Quadratic 1/d², Linear 1/d, Constant 1 (Cycles node) |
| Soft Falloff on | P / (4π) · cos θ / (d² + R²), like Blender before 4.0 |
| Soft Falloff off | a real sphere of radius R, partly below the horizon if needed (Lagarde & de Rousiers 2014); 0 inside the sphere |
| Custom Distance | × (1 − (d/D)⁴)², 0 beyond D (EEVEE) |
| Light Linking | 0 on objects the light may not reach (Include / Exclude); the meter knows which probes are on the bust and which on the backdrop |
| Shadow Linking | the Blocker Collection decides whether the bust (head and chest spheres) blocks the light; a probe on the backdrop (backS) sits in the bust's shadow |
| Fog_Volume | Volume Scatter: scattering = extinction = Density · Color. Principled Volume: scattering = Density · Color, absorption = Density · (1 − Color) · (1 − Absorption Color). The meter dims light by exp(−σ · d) with σ the luminance of the extinction; the render does it per colour channel |

- A diffuse surface of albedo ρ has the scene-linear value ρ · E / π. The meter shows it in stops from middle grey (0.18), after the Exposure.
- **Bounce card**: it receives E and becomes an area light of power ρ · E · A, with the colour of the card.
- **Colour temperature**: Planck's law integrated with the CIE 1931 colour matching functions, then scaled to luminance 1. The temperature changes the colour, not the amount.
- **Occlusion** in the meter: the head and the chest (spheres) block light. The nose shadow is not measured. The checks use angles and ratios instead.

## The renderer (scene.js)

- **Light objects**: three.js physical lights with decay 2. An Area light is approximated by a 170° spot with a smooth edge that follows the cosine of a panel.
- **Soft shadows and reflections**: every sample moves each light to another point of its surface (Radius, Size or Angle, a Halton sequence). The samples are averaged in a float target, as a path tracer does. The chrome ball therefore shows the shape of the lights.
- **Display**: Exposure in stops, then Standard (clip), AgX (three.js AgX) or False Color (bands from the same table as the legend).
- **Cookies**: gobos, IES profiles and Spread are drawn as `SpotLight.map` textures made from the same functions as the meter (a Point light with an IES profile becomes a spot as wide as its cut-off).
- **Falloff**: the three.js light decay carries the Light Falloff exponent, the Radius for Soft Falloff and a flag for the hard sphere (a patched `getDistanceAttenuation`). Custom Distance is the three.js light distance. With Soft Falloff off, the lamp is rendered from its centre (no soft shadows) so the inside of the sphere stays dark.
- **Light and Shadow Linking**: the unlinked lights render the whole set; each linked light is rendered alone and added on top, only on its receivers. The other objects still hide what is behind them; only the objects of its Blocker Collection cast its shadows. The fog volume ignores both.
- **Fog_Volume**: after every sample, a pass marches 48 steps along each camera ray inside the cube (6 × 3.4 × 4 m). Every step adds the light that the fog scatters towards the camera (Henyey–Greenstein phase with the Anisotropy) from each light at its jittered position, with its cone, cookie, falloff and Custom Distance, times its Volume Scatter influence. The bust, the pedestal and the ball stand cast shadows into the fog as simple shapes. Surfaces are dimmed by exp(−Density · distance) both from the light and towards the camera. The World light is not dimmed.
- **Not modelled**:
  - Indirect light between objects, except the bounce card.
  - Occlusion of the World: HDRIs light the scene without ambient occlusion.

## Stages and checks

"Face +1" means the lit cheek reads +1 stop over middle grey (±0.25 to ±0.4 depending on the step).

| Step | What the student does | Check |
|---|---|---|
| t1 Twice as far | Point light from 1 m to 2 m, Power × 4 | Point, distance ≥ 1.9 m, face +1 |
| t2 The Sun does not fall off | Type Sun, set Strength | Sun, face +1 |
| t3 A spot on the face | Narrow Spot Size, some Blend | backdrop ≤ 10% of the face, blend ≥ 0.05, face +1 |
| t4 An Area light | Area, Rectangle, taller than wide | face +1 |
| h1 Bigger is softer | Radius or Area Size | apparent size ≥ 20°, face +1 |
| h2 Farther is harder | 1 m softbox moved away | size ≥ 0.95 m, apparent size ≤ 8°, face +1 |
| h3 Match the reference | Rebuild a reference render | key az 38–62°, el 25–45°, apparent size 22.6 ± 6°, face +1 |
| c1 Three-point | Fill on the other side, rim behind | ratio 2–4.5, rim az ≥ 120°, rim ≥ 70% of the face |
| c2 Rembrandt | Key ±45°, 30–55° up | ratio ≥ 4, face +1 |
| c3 Butterfly | Key in front, 35–60° up | ratio ≤ 1.3, face +1 |
| c4 Split and low key | Key ±90°, low | ratio ≥ 8, backdrop ≤ face − 3 stops |
| c5 High key | White backdrop, BG light, strong fill | backdrop ≥ face + 1 stop, ratio ≤ 2 |
| k1 Warm and cool | Blackbody key ≤ 3500 K, fill or rim ≥ 6500 K | temperatures |
| k2 Light with an HDRI | Lights off, studio HDRI rotated to the camera left | camera-left cheek brighter, ratio ≥ 1.5, face +1 |
| k3 A bounce card | Card on the shadow side, no other lamps | ratio ≤ 4.5 |
| e1 Exposure | Only Exposure | face +1 ± 0.3, key power unchanged |
| e2 Standard or AgX | Switch to AgX | AgX, face +1 |
| e3 Read it with False Color | BG light until the backdrop is grey | False Color, backdrop ±0.5, face +1 |

| s1 A grid on the softbox | Lower Spread, raise Power | Area, Spread < 180°, apparent size ≥ 20°, backdrop ≤ face − 3.3 stops, face +1 |
| g1 A gobo | Blinds gobo, Mapping Rotation, small Radius | Spot, Blinds, rotation 20–45° (or 135–160°), Radius ≤ 0.02 m |
| i1 Photometric light (IES) | BG_Light: Scallop profile, high and close to the wall | Scallop, Elevation ≥ 65°, Distance ≤ 0.8 m |
| l1 Light Linking | Rim_Light: Backdrop Exclude (or Bust Include) | rim reaches the bust but not the backdrop, rim ≥ 70% of the face |
| l2 Shadow Linking | Key_Light: Blocker Collection, Bust Exclude | the bust casts no shadow of the key on the backdrop (backS lit), the key still lights the bust, face +1 |
| f1 Light Falloff | Linear or Constant, raise Power | not Quadratic, Distance ≤ 0.9 m, backdrop ≥ face − 1.2 stops, face +1 |
| f2 Soft Falloff | Tick Soft Falloff (or move the lamp off the wall) | Radius ≥ 0.2 m and Soft Falloff on or distance to the wall > Radius |
| c1 Custom Distance | Candle with Custom Distance | Custom Distance on, backdrop ≤ 1% of the candle's light on the face, face +1 |
| v1 Light you can see | Fog_Volume on, Density, Anisotropy | fog on, Density 0.03–0.5, Anisotropy ≥ 0.3 |
| v2 Shafts through the blinds | Gobo spot behind the bust, fill Volume Scatter 0 | fog on, gobo spot with Azimuth ≥ 110° (either side), fill off or Volume Scatter ≤ 0.05 |
| v3 Coloured fog | Principled Volume, blue Color, Density, Absorption Color | Principled, Color blue ≥ 1.3 × red, Density 0.15–1, face ≥ −0.5 stops |

Every step has a solution button. The tests check that each step starts unsolved and that its solution solves it.

## Teaching points worth stopping on

- **t1**: moving the light away also changes the balance with the background. This is the practical meaning of the inverse square law.
- **h2**: the numbers make the "apparent size" idea concrete. The Sun is huge, yet only 0.5° wide.
- **Portrait setups**: the render refines in a second or two. Let students compare the nose shadow (loop, Rembrandt, butterfly) at full samples.
- **k3**: gold and black cards show that reflectors add or remove light with the colour of their surface.
- **e2 and e3**: exposure is judged by numbers (meter, False Color), and the look by the view transform.
- **s1 and g1**: Spread and gobos change where the light goes, not how soft it is. The blurred slats of the gobo are the same penumbra as in stage 2: a smaller Radius sharpens them.
- **i1**: open a real .ies file from a manufacturer afterwards in Blender and compare the scallop.
- **l1, f1 and c1**: they are cheats (non-physical). Ask what the honest alternative is each time: a flag, moving the light away, a smaller lamp.
- **f2**: a detail of Blender 4.x that surprises students with practical lamps near walls.
- **v1 and v2**: compare Anisotropy 0 and 0.6 with a backlight; then turn the fill's Volume Scatter on and off. In v3, compare Absorption Color black and white with the same Color. In the Stage Lighting Lab, the same haze reveals the beams of a rig.
