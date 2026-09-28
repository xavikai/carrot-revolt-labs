# Tileable Texture Lab — teaching notes

Explanations are in English, Catalan and Spanish. Photoshop menu, tool and option names (Image Size, Offset, Wrap Around, Clone Stamp, Healing Brush, Pattern Preview, Linear Light…) and Blender node and editor names (Image Texture, Mapping, Extension, Texture Coordinate, Projection Box, Noise Texture, UV Editor…) stay in English. The keys are the ones of each program.

## Two workspaces

- **Blender-style** (stages 1, 2, 5, 6, 7): Image Editor or UV Editor on the left, 3D Viewport in the middle, Properties on the right drawn as shader nodes. Only the fields that the step is about are editable; the others are shown greyed out, so students see the whole chain (Texture Coordinate → Mapping → Image Texture → Principled BSDF).
- **Photoshop-style** (stages 3 and 4): menu bar, options bar, toolbar, the document with a tab and a status bar, a Layers panel and a yellow **Lab check** panel that is not part of Photoshop (it measures what the teacher would look at).

## The images

Everything is painted in the browser from the same procedural material, so the photo, the crop and the tileable texture show the same gravel. Gravel was chosen because it has no lines that must meet across a seam (as flagstones or bricks would), so the cross is quick to clone away in class.

| Image | Size | What it is |
|---|---|---|
| gravel_photo.jpg | 1400 × 1050 px, 2.7 × 2.03 m (≈ 518 px/m) | Gravel (rounded pebbles of 3–6 cm in dark earth), not tileable, with a light slope (bright top left, dark bottom right), a soft diagonal shadow, a vignette and a dark oil stain |
| crop 1024 | 2 m of the photo | The square the Photoshop steps start from (with or without the uneven light) |
| gravel_tileable.png | 1024 px, 2 m | Truly periodic gravel: colour, roughness and an OpenGL normal map |
| gravel_rough_photo.png | 1024 px | A roughness map made from the lit photo: not tileable and with the light baked in |
| bricks.png | 512 px, 2 m | 25 × 8.3 cm bricks, 8 per row, 24 rows, stretcher bond |
| rock.png, moss_earth.png | 512 px, 2 m | Tileable rock and moss for the Box projection and the mix |

## Stages

1. **Use it** — *Spot the seam*: the 8 m floor repeats the photo of gravel 4 × 4; clicking near a line where two copies meet (UV × scale close to a whole number) marks the seam; then switch to the tileable image. *Repeat it at real size*: Extension Extend and Scale 1 at the start; students set Repeat and Scale 4 (8 m ÷ 2 m). Mirror and Clip can be tried; the readout explains what they do. The Image Editor draws the floor island (0–1) and, dashed, the range the shader reads after Mapping (0–Scale).
2. **UVs for tiling** — a 6 × 4 × 3 m building with four one-face walls. The Island panel shows how many metres one tile covers in U and in V, whether the rows are horizontal (Up is up) and whether the island is stretched. *Out of the square*: after Unwrap + Pack one tile covers 13 m; A, S 6.5. *Straight, not stretched*: the right wall turned 90°, the left wall scaled 1.5 in U. *Round the corner*: all walls right but scattered; the pattern continues across a corner only if the right edge of one wall and the left edge of the next land on the same point of the tile (difference a whole number in U and V, tolerance 2.4 cm). Snap (magnet) sticks corners together while moving. Solution: the four islands in a row, touching (20 m = 10 tiles, so the loop closes).
3. **Prepare the photo** — *Square, power of two*: Crop Tool with 1:1 (Square), Enter, then Image Size 1024 × 1024. The check fails if the photo was stretched (proportions changed in Image Size) or if 1024 is bigger than the crop (upscaled). *Even out the light*: Ctrl J, Desaturate, Gaussian Blur (much bigger than a pebble), Invert, Linear Light at 50 %. The check measures three things on the result: light across the image (max − min of a very blurred luminance ≤ 10 %), pebbles kept (middle-frequency contrast ≥ 80 % of the photo; a radius under ~16 px fails) and colour kept (≥ 80 %; without Desaturate the colour turns grey and fails). A radius above ~150 px leaves too much light. Linear Light at 50 % gives *photo − blur + 0.5*, so the average becomes middle grey: in real work a Levels adjustment follows.
4. **Make it seamless** — *Offset*: Filter › Other › Offset with half the size and Wrap Around; the check follows where the old edges are and wants both in the middle half of the image. Set to Background (white) or Repeat Edge Pixels (smear) are flagged. *Clone and heal the cross*: the seam check cuts each old edge into 8 pieces of 128 px and compares the jump across the line with the jumps of the columns (or rows) next to it; a piece is fixed when the jump is less than 2.4 × its neighbours (clean gravel stays under 1.6; the untouched seam is above 3.4). Clone Stamp copies exactly; Healing Brush (lab version) copies the texture and shifts its colour by the difference between the rings around the brush and around the source. *Pattern Preview*: View › Pattern Preview shows the document repeated (painting works on any copy); the dark stain must be healed (mean inside ≥ 90 % of the ring around it) and the cross must stay green.
5. **PBR maps** — the sun shines towards the camera so reflections are visible. *Every map must tile*: the Roughness made from the photo shows a grid of shiny corners; swap it. *Keep the maps aligned*: the colour was offset 512 × 512 but the other maps were not (a lab field on each node, since Blender has no such setting); all offsets must be equal (mod 1024).
6. **Scale & projection** — *Sharp enough*: texel density = image px × Scale ÷ 8 m; 512 px/m with the pebbles at real size means 1024 px and Scale 4 (2048 px gives 1024 px/m and four times the memory; the lab shows it with the 1024 image). *No UVs? Box projection*: a displaced sphere with its automatic spherical UVs; Object coordinates, Projection Box, Blend 0.1–0.6, Scale 0.5.
7. **Break the repetition** — a 40 m square with 20 × 20 copies. *Big variation*: Noise Texture × colour through a Mix (Multiply), Factor 0.25–0.8 and spots of 6 m or more (spot size ≈ 1 / Scale). *A second texture*: moss mixed through a noise mask (Color Ramp position → 15–60 % cover). The readout shows after how many metres the gravel (2 m) and the moss (40 ÷ scale) line up again (first n·2 within 3 cm of a multiple of the moss size); 20 m or more passes. 4 m lines up every 4 m; 3.3 m every 66 m.

## Notes for class

- The lab keeps the pixels of the Photoshop steps only while the page is open; the Blender steps are saved in the browser. "Show a solution" and "Reset this step" can be undone with Ctrl Z.
- The seam check is strict only on the old edges. A clone brush dragged with the same source along the line makes a new straight edge next to it; that is a good moment to talk about changing the source and using a soft brush, and to look at the result in Pattern Preview.
- Useful extras to show in the real programs: Edit › Content-Aware Fill on the cross, Filter › Other › High Pass as another way to remove the light, Blender's Node Wrangler (Ctrl T adds Texture Coordinate + Mapping) and, in game engines, triplanar and stochastic (hex-tiling) sampling.
