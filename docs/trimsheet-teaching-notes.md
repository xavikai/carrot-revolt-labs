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

## Production order (since the rework)

The lab now follows the order of a real trim sheet: Read → Choose the texel density → Design the sheet → Model the high poly → Bake in Blender → Texture in Painter → UVs → Bevels → Reuse. The old steps keep their ids; the new ones are td1–td2, h1–h2, k1–k3 and s1–s3.

### Choose the texel density (td1, td2) · `plan.js`
- Screen pixels per metre = H ÷ (2 · d · tan(FOV ÷ 2)); target = the power of two at or just above it.
- Platforms (H, FOV, usual closest distance d → px/m → target): mobile top-down 1080, 60°, 4 m → 234 → 256 · handheld 720, 60°, 3 m → 208 → 256 · PC/console third person 1440, 60°, 2.5 m → 499 → **512** (the project of the lab) · PC/console first person 1440, 60°, 1.5 m → 831 → 1024 · VR 2200 per eye, 96°, 1 m → 990 → 1024.
- td1: the 3D view becomes the game camera (the platform's FOV at distance d) and the board is drawn with the chosen density; the loupe shows 25 × 25 cm of planks as texels and as screen pixels: < 0.9 texels per screen pixel is blurry, > 2.2 is wasted memory. Check: three platforms compared, PC third person, 512.
- td2: rows needed = 1.875 m × density + 8 strips × padding (padding = sheet ÷ 128). 256 px/m → 512 sheet, 512 → 1024, 1024 → 2048. The sheet width ÷ density is the repeat length (2 m in all three). Memory of a set (colour + normal + ORM, compressed, with mips): 512 → 1 MB, 1K → 4 MB, 2K → 16 MB.
- Talking point: the density is a project decision written in the art bible; budgets often lower it a step; hero props are exceptions.

### Model the high poly (h1, h2)
- The low poly is one quad of sheet ÷ density = 1024 ÷ 512 = **2 m**, UVs filling 0–1. The high poly is modelled at real scale on top of it, inside the strip bands. h1 starts with a 1 m plane: the bake preview shows the strips twice too big (1024 px/m) and out of their bands.
- Heights of the high poly above the plane (bake.js `DEPTH`): planks 2 cm, stone 3, beam 2.5, molding **5** (the tallest), iron 1.5, plinth 2, bevels 3.
- h2: without pieces past the edges the bake has rounded ends at the left and right borders: a seam every 2 m when the sheet repeats. Array modifier, offset 2 m (or copies at ±2 m).

### Bake in Blender (k1–k3)
- Panel modelled on Render Properties › Bake (Cycles). Rules (bake.js): Selected to Active off → flat normals; Extrusion below a piece's height → its top is cut flat; Max Ray Distance shorter than the extrusion → grooves and joints lost; image ≠ 1024 → wrong density; no overhang → seam.
- k1 engine preview is Blender (OpenGL). k2 targets Unreal (DirectX): +Y reads inverted (bevels look dented); Swizzle G −Y fixes it. The preview flips G as the engine would.
- k3: ID map = Diffuse with only Color (Direct and Indirect off), one flat colour per material: Wood red, Stone green, Iron blue. Starts with the beam without material (default grey), the iron strap as wood and the stone bevel as wood.

### Texture in Painter (s1–s3)
- s1 Bake Mesh Maps: load the high poly, maps Normal, ID, AO, Curvature; ID Color Source Material Color (Vertex Color gives an empty ID); Max Frontal Distance is relative to the mesh size (diagonal 2.83 m): 0.01 → 2.8 cm (cuts the molding), 0.02 → 5.7 cm.
- s2 Fill layers (Oak Planks, Sandstone Blocks, Wrought Iron) with masks by Color Selection on the ID colours. An unmasked layer on top covers everything.
- s3 Edge wear from Curvature, Dirt from AO, export preset Unreal Engine (Packed): BaseColor, Normal DirectX, OcclusionRoughnessMetallic.
- Simplifications: AO and curvature come from the height field of the sheet (blurred differences), not ray-traced; Painter materials reuse the painted colours of the sheet.
