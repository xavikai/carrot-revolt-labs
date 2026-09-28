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

- A diffuse surface of albedo ρ has the scene-linear value ρ · E / π. The meter shows it in stops from middle grey (0.18), after the Exposure.
- **Bounce card**: it receives E and becomes an area light of power ρ · E · A, with the colour of the card.
- **Colour temperature**: Planck's law integrated with the CIE 1931 colour matching functions, then scaled to luminance 1. The temperature changes the colour, not the amount.
- **Occlusion** in the meter: the head and the chest (spheres) block light. The nose shadow is not measured. The checks use angles and ratios instead.

## The renderer (scene.js)

- **Light objects**: three.js physical lights with decay 2. An Area light is approximated by a 170° spot with a smooth edge that follows the cosine of a panel.
- **Soft shadows and reflections**: every sample moves each light to another point of its surface (Radius, Size or Angle, a Halton sequence). The samples are averaged in a float target, as a path tracer does. The chrome ball therefore shows the shape of the lights.
- **Display**: Exposure in stops, then Standard (clip), AgX (three.js AgX) or False Color (bands from the same table as the legend).
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

Every step has a solution button. The tests check that each step starts unsolved and that its solution solves it.

## Teaching points worth stopping on

- **t1**: moving the light away also changes the balance with the background. This is the practical meaning of the inverse square law.
- **h2**: the numbers make the "apparent size" idea concrete. The Sun is huge, yet only 0.5° wide.
- **Portrait setups**: the render refines in a second or two. Let students compare the nose shadow (loop, Rembrandt, butterfly) at full samples.
- **k3**: gold and black cards show that reflectors add or remove light with the colour of their surface.
- **e2 and e3**: exposure is judged by numbers (meter, False Color), and the look by the view transform.
