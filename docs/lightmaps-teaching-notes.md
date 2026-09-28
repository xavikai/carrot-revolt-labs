# Lightmap Lab · teaching notes

Lab 19, in `labs/lightmaps/`. Blender → Unity 6 with URP (the names follow those programs). Four stages, 12 steps.

## Stages
| Stage | Steps | What students do |
|---|---|---|
| 1 · UV2 and export | u1 A second UV map · u2 Margin between the islands · u3 Export the FBX | Bake the crate through UV0 (five faces overlap: the light of the top and of the sides mixes) and then through UV1 (Lightmap Pack). Raise the Lightmap Pack Margin until it is 2–6 texels of the crate's lightmap (≈ 67 px at 20 texels/unit: margin ≈ 0.03–0.09). Fix the FBX export and Model import settings until the crate arrives at 1:1, upright, with its own UV1. |
| 2 · Bake in Unity | b1 Lightmap Resolution · b2 Scale In Lightmap · b3 Bounces, samples and denoiser | From 4 to 10–25 texels/unit within one 512 lightmap. Floor ×2 and ceiling ×0.25 within one 256 lightmap at 12 texels/unit. Max Bounces 2 and enough Indirect Samples + Denoiser for noise < 3 %. |
| 3 · Light modes | m1 The character has no shadow · m2 Static or not · m3 Which Lighting Mode? | Baked sun: the walking character gets no direct light and casts no shadow → Mixed + Baked Indirect and rebake. Door (it opens) not static; small vase → Light Probes; the rest static with lightmaps. Quiz: Subtractive / Baked Indirect / Shadowmask / Distance Shadowmask. |
| 4 · Probes | p1 Light Probes · p2 Adaptive Probe Volumes · p3 Reflection Probe | Click probes on a top view until the average error of the character's light along its walk is < 15 % (≤ 30 probes). APV with Min Probe Spacing 1 m. A Baked Reflection Probe with Box Projection and a box of 8 × 3 × 6 m. |

## FBX export for Unity (the settings the lab checks)
- Blender: apply the scale (Ctrl A › Scale); UV Maps order: texture map first, lightmap map second (UV0, UV1).
- Export FBX: Selected Objects, Object Types Mesh, Apply Scalings FBX Units Scale (FBX All also works), -Z Forward, Y Up, Apply Modifiers, Smoothing Face. Apply Transform is optional (it is marked experimental and breaks armatures).
- Unity Model tab: Scale Factor 1, Convert Units on, Bake Axis Conversion on (removes the −90° X rotation), Generate Lightmap UVs off when you made your own UV1 (on: Hard Angle 88°, Angle Error 8 %, Area Error 15 %, Margin Method Calculate / Pack Margin 4 px).

## Numbers
- Room 8 × 6 × 3 m, ≈ 190 m² of lightmapped surface: ≈ 3,000 texels at 4 texels/unit, 19,000 at 10, 76,000 at 20, 303,000 at 40 (two 512 lightmaps).
- Double resolution = four times the texels, memory and bake time.
- Noise of the bounce ∝ 1/√(Indirect Samples); the filters remove most of it (Gaussian ≈ ×0.45, denoiser ≈ ×0.15 in the model).

## Talking points
- A lightmap is a texture for light: it needs its own UVs, and texel density applies (Lightmap Resolution = texels per unit).
- Margins are measured in texels of the final lightmap, so they depend on the resolution and the object size.
- Baked lights ignore moving objects. Mixed lights keep the bounce baked and give real-time direct light and shadows. The Lighting Mode decides how much is baked.
- Static is a decision per object: big still surfaces in lightmaps, small props with probes, anything that moves never static.
- Probes: Light Probe Groups need manual placement where light changes; APV places them automatically and samples per pixel (URP/HDRP only).
- Reflection Probes: without one, shiny materials reflect the skybox. Box Projection for rooms.

## Simulation notes
- The bake is a small path tracer in JavaScript (axis-aligned boxes, cosine sampling, bounces as passes that reuse the previous lightmap). It runs in slices with a progress bar, like the Progressive Lightmapper.
- The Gaussian / denoiser filters act on the indirect and sky light only; direct light stays sharp (Unity filters Direct, Indirect and AO separately).
- Probes store only the average irradiance (L0) and blend the nearest four; Unity stores L2 spherical harmonics and blends tetrahedra.
- The real-time sun in the shader tests the room's boxes and the character analytically instead of using shadow maps.
