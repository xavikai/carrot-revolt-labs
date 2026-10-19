# LOD & Mipmaps Lab · teaching notes

Lab 17, in `labs/lod/`. Four stages, 12 steps. One idea runs through the whole lab: the screen has a fixed number of pixels, so detail smaller than a pixel costs time and memory and shows nothing. LODs apply it to triangles, mipmaps to texels.

## Stages
| Stage | Steps | What students do |
|---|---|---|
| 1 · What a LOD is | l1 Far away, fewer triangles and a smaller texture · l2 When to switch · lt A texture for each LOD · l3 Hide the pop | Move the camera away from a stone statue of the Stanford Bunny and see LOD0–LOD3; the close-up shows the mesh in use (wireframe) and its texture (2048 → 1024 → 256 → 64 px). Set the three LOD Group thresholds (% of screen height) so each LOD appears with 0.5–1 px of error. Choose the texture size of each LOD: 1 to under 2 texels per screen pixel where it starts. Turn on Fade Mode › Cross Fade (width ≥ 0.1) and play the dolly. |
| 2 · Make the LODs | d1 Halve the triangles · d2 Only as many as the distance needs · d3 Collapse, Un-Subdivide or Planar? | Decimate Collapse Ratio on three copies: 50 / 25 / 12.5 % (Face Count). Then the smallest ratio whose error stays under 1 px at 4, 10 and 25 m. Quiz of five cases on the three modes. |
| 3 · Mipmaps | m1 Far tiles shimmer · m2 Which mip? · m3 Blur at grazing angles · m4 Mipmaps cost memory | A real WebGL floor (1024 px, 512 px/m): play the camera with mips off, then on. Mip colours view and three cases of log₂(texels per pixel). Bilinear bands, Trilinear, Anisotropic ×8–16. Four cases: mips on or off. |
| 4 · Scene budget | b1 A park of statues · b2 Decide | 160 bunny statues from 6 to 300 m: 5.12 M triangles without LODs. Fit 290,000 with the LOD Group, LOD Bias 1 and Culled 1 %, with no error over 1 px and no statue above 1 % of the screen culled. Four decisions. |

## Numbers (to check on the board)
- Screen 1080 px high, vertical FOV 60°: 1 m covers 935 ÷ distance px (94 px at 10 m).
- Model: the Stanford Bunny as a 1.44 m stone statue. LOD0 32,000 triangles (the 69,451-triangle scan simplified once); LOD1 8,000, LOD2 1,999, LOD3 479 (each about a quarter). Error against LOD0: 3.1 / 10.1 / 46.1 mm (the distance 99.9 % of the LOD0 vertices stay within, measured offline for every ratio k/400).
- Screen relative height = height × px per metre ÷ 1080. A LOD switches in with 1 px of error at 100 × H ÷ (error × 1080) %: 42.6 %, 13.2 % and 2.9 % (2.9, 9.4 and 43 m). Default thresholds 41 / 12.5 / 2.8 %.
- Smallest Decimate ratio for 1 px at 4 / 10 / 25 m: 0.1725 / 0.0525 / 0.0225 (5,520 / 1,678 / 720 triangles).
- Textures at the default thresholds: 2048 / 1024 / 256 / 64 px give 1–2 texels per pixel where each LOD starts: 27 MB instead of 85 MB.
- Rock texture: one copy covers 2 m (triplanar). At the thresholds 23 / 9.3 / 3.6 % the textures that give 1–2 texels per pixel are 2048 / 512 / 256 / 64 px: 23 MB instead of 85 MB with 2048 px on every LOD (halving gives 28 MB).
- Mip level = log₂(texels per metre ÷ screen pixels per metre). The chain adds ¼ + ¹⁄₁₆ + … = ⅓ memory (4 MB → 5.33 MB for 1024² RGBA).
- Park: LODs on 309,000, + Culled 1 % 281,600 (23 / 39 / 41 statues at LOD1 / 2 / 3); LOD Bias 0.5 gives 2 px of error; Culled 2 % removes 29 visible statues.

## Talking points
- A LOD Group switches on the size on screen, not the distance: the same settings work for a pebble and a cliff, and on any resolution.
- The error in pixels is the honest measure: under about one pixel, nobody sees the change. Earlier is visible (popping); much later wastes triangles.
- "Halve the triangles" is a starting rule; the distance where each LOD starts decides how far you can go.
- Decimate modes: Collapse for organic meshes (Symmetry, Triangulate), Un-Subdivide for grids, Planar for flat hard surface (Angle Limit, Delimit keeps seams and materials).
- A LOD changes two things: the mesh and the texture. A far LOD with a big texture looks the same (the GPU reads a small mip) but wastes memory; a smaller texture per LOD, or mipmap streaming, removes that.
- Mipmaps are the LODs of textures, made automatically on import. Floors need Trilinear and Anisotropic; UI drawn pixel for pixel does not need mips.
- LOD Bias (quality settings) and Culled are global knobs: good for weaker machines, but check that nothing visible disappears.

## Simulation notes
- The LODs are made in the browser with meshoptimizer's simplifier (an edge collapse with quadric error, like Blender's Collapse) from `bunny.bin` (LOD0); `bunny-table.js` holds the triangles and the error of every ratio k/400, measured offline with the same simplifier. Stanford Bunny: Stanford Computer Graphics Laboratory, 3D Scanning Repository. meshoptimizer: MIT (vendor/LICENSE-meshoptimizer.md).
- The insets render the rock at the true pixel size it has on a 1080p screen: enlarged without smoothing when small, reduced when it is bigger than the inset.
- The close-up is a second renderer that draws the LOD in use from 1.9 m with its wireframe, whatever the camera distance.
- The stone texture is procedural (tileable noise, grains, lichen, cracks) at 2048 px; each LOD texture is a level of its mip chain. It is projected triplanar in a patched MeshStandardMaterial, so the GPU picks real mips; Mip colours tints each level by its size.
- Cross Fade uses alpha hashing (a dither), like Unity's dithered cross fade.
- The floor uses the browser's real GPU mipmaps; the mip colours view uploads tinted mip levels. Anisotropic is limited by the GPU (the panel says so).
- Links: Texel Density Lab (px/m and the screen formula), Topology Lab, Baking Lab (margin against mip seams).
