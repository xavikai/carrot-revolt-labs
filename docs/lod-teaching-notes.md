# LOD & Mipmaps Lab · teaching notes

Lab 17, in `labs/lod/`. Four stages, 12 steps. One idea runs through the whole lab: the screen has a fixed number of pixels, so detail smaller than a pixel costs time and memory and shows nothing. LODs apply it to triangles, mipmaps to texels.

## Stages
| Stage | Steps | What students do |
|---|---|---|
| 1 · What a LOD is | l1 Far away, fewer triangles · l2 When to switch · l3 Hide the pop | Move the camera from 1.6 to 200 m and see LOD0–LOD3 (LOD colours). Set the three LOD Group thresholds (% of screen height) so each LOD appears with 0.5–1 px of error. Turn on Fade Mode › Cross Fade (width ≥ 0.1) and play the dolly. |
| 2 · Make the LODs | d1 Halve the triangles · d2 Only as many as the distance needs · d3 Collapse, Un-Subdivide or Planar? | Decimate Collapse Ratio on three copies: 50 / 25 / 12.5 % (Face Count). Then the smallest ratio whose error stays under 1 px at 8, 20 and 50 m. Quiz of five cases on the three modes. |
| 3 · Mipmaps | m1 Far tiles shimmer · m2 Which mip? · m3 Blur at grazing angles · m4 Mipmaps cost memory | A real WebGL floor (1024 px, 512 px/m): play the camera with mips off, then on. Mip colours view and three cases of log₂(texels per pixel). Bilinear bands, Trilinear, Anisotropic ×8–16. Four cases: mips on or off. |
| 4 · Scene budget | b1 A field of rocks · b2 Decide | 160 rocks from 6 to 300 m: 5.12 M triangles without LODs. Fit 1.1 M with the LOD Group, LOD Bias 1 and Culled 1 %, with no error over 1 px and no rock above 1 % of the screen culled. Four decisions. |

## Numbers (to check on the board)
- Screen 1080 px high, vertical FOV 60°: 1 m covers 935 ÷ distance px (94 px at 10 m).
- Rock 1.44 m high. LOD0 32,000 triangles (frequency 40), LOD1 15,680, LOD2 8,000, LOD3 3,920. Error against LOD0: 5.8 / 14.3 / 36.5 mm.
- Screen relative height = height × px per metre ÷ 1080. A LOD switches in with 1 px of error at 100 × H ÷ (error × 1080) %: 23.1 %, 9.3 % and 3.7 % (5.4, 13.4 and 34 m).
- Minimum frequency for 1 px at 8 / 20 / 50 m: 26 / 18 / 11 (ratios 0.42 / 0.20 / 0.08).
- Mip level = log₂(texels per metre ÷ screen pixels per metre). The chain adds ¼ + ¹⁄₁₆ + … = ⅓ memory (4 MB → 5.33 MB for 1024² RGBA).
- Field: LODs on 1.22 M, + Culled 1 % 0.99 M; LOD Bias 0.5 gives 1.9 px of error; Culled 2 % removes 29 visible rocks.

## Talking points
- A LOD Group switches on the size on screen, not the distance: the same settings work for a pebble and a cliff, and on any resolution.
- The error in pixels is the honest measure: under about one pixel, nobody sees the change. Earlier is visible (popping); much later wastes triangles.
- "Halve the triangles" is a starting rule; the distance where each LOD starts decides how far you can go.
- Decimate modes: Collapse for organic meshes (Symmetry, Triangulate), Un-Subdivide for grids, Planar for flat hard surface (Angle Limit, Delimit keeps seams and materials).
- Mipmaps are the LODs of textures, made automatically on import. Floors need Trilinear and Anisotropic; UI drawn pixel for pixel does not need mips.
- LOD Bias (quality settings) and Culled are global knobs: good for weaker machines, but check that nothing visible disappears.

## Simulation notes
- LODs are the same rock at lower geodesic frequencies (what Collapse would do to an evenly dense scan); the error is measured at triangle centres and edge midpoints.
- The insets render the rock at the true pixel size it has on a 1080p screen and enlarge it without smoothing.
- Cross Fade uses alpha hashing (a dither), like Unity's dithered cross fade.
- The floor uses the browser's real GPU mipmaps; the mip colours view uploads tinted mip levels. Anisotropic is limited by the GPU (the panel says so).
- Links: Texel Density Lab (px/m and the screen formula), Topology Lab, Baking Lab (margin against mip seams).
