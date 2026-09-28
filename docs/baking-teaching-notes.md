# Baking Lab — teaching notes

Explanations are in Catalan or Spanish. Blender's interface names (Selected to Active, Extrusion, Cage, Max Ray Distance, Bake Type, Swizzle, Margin, Non-Color, Normal Map…) stay in English so students find the same words in Blender.

## What the lab models

- **The crate**
  - **Crate_high** is a rounded box with 110,592 triangles. It has 0.12 m bevels, bolts that stick out 6 cm, grooves 4 cm deep, slots and a striped plate. Its vertex colours are paint, steel, the plate stripes and dark grooves.
  - **Crate_low** is a cube with 12 triangles. It has one UV island per face (UVMap) or all six faces stacked on the same space (UVMap_stacked). It can be shaded Flat, Smooth or Auto Smooth (30°, so it looks flat on a cube).
- **The bake**, for each texel of the image:
  1. Find the point of the low poly with those UVs.
  2. Cast a ray inwards: from the low poly pushed out by *Extrusion*, along the normal of the face or, with *Cage*, along averaged normals.
  3. Write what the ray finds into the texel.
  - *Max Ray Distance* limits how far the ray travels.
  - A **miss** means the ray found nothing.
  - A **wrong hit** means the ray found the back of a surface: the far side of the crate.
- **Maps**
  - **Normal**: tangent space (R = +U, G = +V, B = out), with the Swizzle applied. Flat is (0.5, 0.5, 1).
  - **Ambient Occlusion**: cosine-weighted rays over the hemisphere, up to 0.5 m, with Samples rays per texel. Few samples give noise.
  - **Diffuse**: the Direct, Indirect and Color contributions. The light is computed in linear space and the image is stored as sRGB.
- **Margin** repeats the border texels outwards. The engine preview uses mipmaps, so with Margin 0 the black background bleeds into the edges when the crate is seen from far away.
- **Engine preview**
  - Blender and Unity read green as +Y (OpenGL). Unreal reads it as −Y (DirectX).
  - The material can be wrong on purpose: the normal map in sRGB, the normal map connected without a Normal Map node, or missing colour and AO links.

## Substance Painter stage

- **The scene**: the same crate plus a steel handle on top. It has its own names (crate_low / crate_high, handle_low / handle_high) and its own texture set. The lab bakes only the crate texture set.
- **Distances**:
  - Painter's rays start *Max Frontal Distance* above the low poly and stop *Max Rear Distance* below it.
  - With *Relative to Bounding Box* the values are fractions of the diagonal of the low poly scene (≈ 3.53 m). The default 0.01 is about 3.5 cm.
  - *Average Normals* sends the rays along averaged normals. *Use Cage* replaces the distances with a cage mesh.
- **Match**:
  - *Always* lets the crate's rays hit the handle: the handle is printed into the crate's normal map. The report shows this as "hits on other meshes" (magenta).
  - *By Mesh Name* only pairs name_low with name_high.
- **Mesh maps**:
  - World Space Normal and Position (normalised to the bounding box of the scene).
  - ID: one flat colour per material painted on the high poly, from Vertex Color.
  - Ambient Occlusion.
  - Curvature: the change of the baked normal from texel to texel. Convex is bright and concave is dark.
  - Thickness: rays into the model. The crate is solid, so almost all of it is white.
  - A small "smart material" in the viewport uses ID (base materials), Curvature (worn edges), AO (dirt) and World Space Normal (dust on top).
- **Export**: the output template decides the format of the exported normal map (the converted maps *Normal OpenGL* / *Normal DirectX*).

  | Output template | Normal map | Files |
  |---|---|---|
  | Blender (Principled BSDF) | OpenGL | separate maps |
  | Unity URP | OpenGL | separate maps |
  | Unreal Engine (Packed) | DirectX | packs AO, Roughness and Metallic into the R, G and B channels of OcclusionRoughnessMetallic |

  The file lists are simplified.

| Step | What the student does | Check |
|---|---|---|
| p1 Frontal and rear distance | Raise both from 0.01 to about 0.03 | clean normal map (Match By Mesh Name already set) |
| p2 Average Normals or cage | Tick Average Normals or Use Cage | clean, with averaged rays or a cage |
| p3 Match by Mesh Name | Match Always → By Mesh Name | 0 hits on other meshes |
| p4 Maps for smart materials | Tick and bake the six other mesh maps | all seven maps baked clean |
| p5 Export to the engine | Output template for Unreal | template Unreal Engine (Packed), engine Unreal |

## The ray caster

A BVH (median split, up to 4 triangles per leaf) with Möller–Trumbore intersection. The bake runs in slices of rows, so the image fills up with a progress bar (Esc cancels).

Approximate times at 256 px:

| Bake | Time |
|---|---|
| Normal map | ≈ 0.1 s |
| AO, 16 samples | ≈ 0.5 s |

The lab is a simplified model of Cycles: no render samples for the normal map, and a single sun plus a constant ambient for Diffuse.

## Stages and checks

| Step | What the student does | Check |
|---|---|---|
| n1 Selected to Active | Select high, Shift-click low, tick Selected to Active, bake | a normal map baked from the high poly |
| n2 Reach the bolts | Raise Extrusion (starts at 0: the bolts give wrong hits) | 0 wrong hits, misses ≤ 1 %, Extrusion > 0 |
| n3 Close the corners | Tick Cage and keep Shade Flat | 0 misses, 0 wrong hits, low not Smooth |
| t1 Read the colours | Click a texel with R ≥ 0.75 and one with G ≥ 0.75 | both clicks |
| t2 OpenGL or DirectX | Unreal preview: Swizzle G −Y or Flip Green Channel | exactly one of the two |
| t3 No overlapping UVs | Switch from UVMap_stacked to UVMap and bake again | clean bake, 0 overlapping texels |
| m1 Ambient Occlusion | Bake AO with 16 or more samples (starts at 4) | AO from the high poly, 0 misses |
| m2 Only the colour | Diffuse with only Color | Color_Map without Direct or Indirect |
| m3 Connect the maps | Non-Color, Normal Map node, Color and AO links | the material is fixed |
| m4 Margin for the engine | Margin ≥ 8 px (starts at 0), bake Normal again | clean normal map with margin |

## Teaching points worth stopping on

- **n3**:
  - A low poly with hard edges and straight rays leaves gaps at rounded corners. At 256 px there are about 64 missed texels.
  - Shade Smooth also closes them, but it skews the whole normal map, and the map then only works with that exact smoothing.
  - The cage keeps hard edges and fans the rays out. The report shows the largest ray angle (≈ 54°): details near the edges lean a little.
- **t1**: The channel buttons (R, G) are the fastest way to read a map. A bolt looks like a sphere lit from the right (red) and from above (green).
- **t2**: With a flipped green channel the light seems to come from below. Doing both fixes flips it back, which is a common real mistake.
- **m3**: An sRGB normal map is subtly wrong: the details look too strong and bend to one side. Connecting it straight into Normal ignores the tangents, so every face looks lit the same way.
