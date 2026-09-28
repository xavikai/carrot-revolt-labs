# Trim Sheet Lab — teaching notes

Explanations are in Catalan or Spanish. Blender's editor and operator names (UV Editor, Follow Active Quads, Align Rotation, Pivot, Individual Origins, Bevel, Weighted Normal, Shade Smooth, Smooth by Angle…) stay in English. The key names are also Blender's.

## The sheet

A 1024 × 1024 medieval sheet, painted in the browser (`paint.js`), with a colour map and an OpenGL normal map. Every strip repeats every 1024 px in x, so it tiles in U. The target texel density is 512 px/m.

| Strip | Height | Real size | Used by |
|---|---|---|---|
| Wood planks | 256 px | 0.5 m | chest sides and lid |
| Stone course | 256 px | 0.5 m | wall rows, column drums |
| Wood beam | 128 px | 0.25 m | beams |
| Stone molding | 128 px | 0.25 m | column capital |
| Iron strap | 64 px | 0.125 m | chest straps |
| Stone plinth | 64 px | 0.125 m | wall and column base |
| Wood bevel | 32 px | 0.0625 m | beam chamfers |
| Stone bevel | 32 px | 0.0625 m | (spare, for stone edges) |

With 8 px of padding after each strip the sheet is used exactly (960 + 64 = 1024 px). Padding rows copy the edge row of the nearest strip. Three versions of the sheet (Oak & sandstone, Dark oak & granite, Pine & red stone) change only the colours.

## The editor

- **UV Editor**: the sheet is drawn repeated left and right (dimmed outside 0–1). Hovering a strip shows its name, height and real size.
- **Selecting**: click an island in the UV Editor or on the model; Shift adds or removes. Clicking again on overlapping islands cycles through them. A / Alt A.
- **Transforms**: G, S, R act on the selected islands. X / Y lock U or V, Ctrl snaps (8 px, 5°, 0.1), typed numbers set the value (G: pixels along the locked axis; S: factor; R: degrees). LMB or Enter confirms, RMB or Esc cancels. Pivot: Bounding Box Center or Individual Origins.
- **Operators**: Follow Active Quads straightens a band of quads into their real proportions, keeping its area, its centre and the direction of the middle ("active") quad. Align Rotation turns the island by the smallest angle that lines its quads up with the axes. Fit to Trim (stage 5 only, like trim-sheet add-ons) straightens an island, makes it as tall as a strip and centres it on it.
- **Island panel**: texel density (px/m, green within ±10% of 512), the strip that holds it (or "crosses an edge"), straight (trim direction within 5° of U), up is up (the top of the face points up the sheet), not stretched (within 10%).
- **3D view**: the props with one MeshStandardMaterial using the sheet. The selected islands are tinted orange; a hovered strip tints the parts that use it in blue.

## Stages and checks

| Step | Scene | Check |
|---|---|---|
| t2 Which strip is which? | four props | three strip questions answered (beam, iron, wood bevel) |
| t3 Only in U | wall, plinth across the iron strip | an island moved ≥ 0.2 in U with no V change, and the plinth on its strip |
| d1 Sizes from texel density | sample board | every strip at m × 512 px |
| d2 Fill the whole sheet | sample board, Stone bevel missing | 8 strips, correct sizes, exactly 1024 px used |
| d3 Padding for mipmaps | sample board, no padding, mip 3 | padding ≥ 8 px and ≤ 1024 px used |
| u1 Fit the beam | wall, beam islands turned 90° at 0.6× | the three beam islands pass every check |
| u2 Stack the stone rows | wall, rows at 0.5× | rows pass, and their U starts differ by ≥ 0.06 (61 px) |
| u3 Straighten the column | column, rings as curved bands at 0.5× | all rings pass (base, drums, capital) |
| u4 Same texel density | chest, one side 0.5×, lid 1.6× | every island passes |
| b1 Round edges from a strip | chamfered beam, chamfers on the planks | the four chamfers on Wood bevel |
| b2 Weighted normals | same, Shade Smooth | shading is Weighted Normal |
| b3 Chamfer width = strip height | chamfers 12 cm, islands refitted automatically | width 5.6–6.6 cm and every island passes |
| p1 Texture a chest fast | chest with straps, just unwrapped, Fit to Trim | every island passes |
| p3 Re-skin everything | four props | another version of the sheet |

- **Texel density** is √(UV area × 1024² ÷ 3D area) over the island. It is the plan of the sheet: 512 px/m means a strip is (real height in m × 512) px tall. The Texel Density Lab explains the concept itself.
- The lab focuses on the trim sheet only: the comparison with unique and tileable textures and the texture budget step were removed.
- **Normals**: Weighted Normal uses the biggest faces around each vertex (Face Area with a strong weight). Smooth by Angle uses 30°, so the 45° chamfers stay sharp.

## Simplifications

- UVs are stored per face corner and the islands come from the modelled props; there is no seam marking or unwrapping here (see the UV Unwrap Lab).
- Follow Active Quads uses the ideal layout of the prop (real edge lengths), not a propagation over arbitrary quads.
- The column is 2 m round, so each ring is exactly two tiles and closes without a seam; other sizes would show a seam where the island ends.
- In b3 the lab refits the islands when the Bevel width changes; in Blender you refit them after changing the modifier.
- There is no wear, dirt or decal layer on top of the sheet.

## Teaching points worth stopping on

- **t2**: start here: a trim sheet is one texture of strips that repeat along U, shared by every prop.
- **d1**: stop on the rule height in px = size in m × 512; this is where texel density plans the sheet.
- **t3**: move an island in V slowly across a strip edge and watch the 3D view pick up the neighbour.
- **d3**: show mip 3 to 5 with no padding and look at the 3D board from far away: coloured lines appear at the strip edges.
- **u2**: before staggering, turn the wall to see the continuous vertical joints.
- **b1–b3**: compare the beam with Flat shading and the planks mapping, then the final version: the difference is a handful of quads and one strip.
