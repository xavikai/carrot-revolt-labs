# Material Lab — teaching notes

The interface uses English so students can transfer the terminology to Blender: node, socket and option names such as Principled BSDF, Base Color, Roughness, Color Space, Non-Color, Invert Color, Bump, Displacement, Subsurface, Specular, Transmission, Coat, Sheen, Emission and Thin Film, and the Properties editor (Render Engine, Raytracing, Glare, Subdivision Surface, Displace, Material Settings). The explanations can be switched to Catalan or Spanish.

The lab has seven stages (26 steps). A Properties editor next to the Shader Editor has three tabs: **Render** (Render Engine EEVEE/Cycles, EEVEE Raytracing, the Compositor Glare node and Viewport Shading › Compositor), **Modifiers** (Subdivision Surface levels, Adaptive Subdivision for Cycles, Displace modifier) and **Material** (Settings › Surface › Displacement, Raytraced Transmission). Each step loads a material and checks what the student changes. **Show a solution**, **Reset this step** and **Ctrl Z / Ctrl Shift Z** are always available. Work is kept per step in the browser (localStorage).

## Stages and checks

| Step | Material | Check |
|---|---|---|
| n1 Sharp and blurry reflections | Plain gold-coloured metal | Roughness has been ≤ 0.1 and ≥ 0.8 during the step |
| n2 Detail without geometry | Brick, normal map not connected | Normal image → Normal Map → BSDF Normal, Non-Color, Strength > 0 |
| n3 Repeat the texture | Brick on a plane, the Roughness image takes the UVs directly | Scale X = Scale Y ≥ 3 and all three images fed by Mapping |
| m1 Gold | Grey dielectric | Metallic ≥ 0.95, warm yellow Base Color (hue 30–55°, bright), Roughness ≤ 0.35 |
| m2 Red plastic | Red metal | Metallic ≤ 0.05, saturated red, Roughness 0.15–0.6 |
| m3 Half metal? | Metallic 0.5 | Metallic ≤ 0.02 or ≥ 0.98 |
| m4 Whiter than white | Pure white paint | brightest channel 200–240, neutral, not metal |
| c1 Colour or data? | Brick with every Color Space wrong | Base Color sRGB, Roughness and Normal Non-Color |
| c2 Painted metal | Painted steel, metallic mask not connected | mask → Metallic (not inverted), Non-Color |
| c3 Gloss is not roughness | Same steel with a gloss image in Roughness | Roughness fed through Invert Color |
| c4 A cut-out leaf | Leaf colour on a quad | alpha mask → BSDF Alpha, Non-Color |
| r1 Bump from a height map | Tiles on a cube | height → Bump → BSDF Normal, Non-Color |
| r2 Real displacement | Tiles on a plane, Displacement setting Bump Only | height → Displacement → Material Output, and Displacement set to Displacement Only or Displacement and Bump |
| r3 Enough vertices | Same, plane with 1 × 1 faces | Subdivision Surface levels ≥ 6, or Cycles + Adaptive Subdivision |
| r4 The Displace modifier | Tiles, no material displacement | Displace modifier on, Strength > 0, levels ≥ 6, seen in EEVEE and Cycles |
| e1 Emission | Dark ball, dark studio | Emission Strength ≥ 1 with a visible colour (no halo yet) |
| e2 Glow in the Compositor | Glowing ball | Glare node (Bloom) on and Viewport Shading › Compositor Always |
| e3 Emission lights the scene | Glowing ball over a floor | floor seen lit in Cycles, and in EEVEE with Raytracing |
| e4 Glass in Cycles | White dielectric, IOR 1.1, striped board behind | Transmission ≥ 0.95, Roughness ≤ 0.1, IOR 1.4–1.6, not metal |
| e5 Glass in EEVEE | Glass without Raytracing | EEVEE with Raytracing and Raytraced Transmission |
| l1 Car paint | Red paint | Coat ≥ 0.9, coat Roughness ≤ 0.1, base Roughness ≥ 0.3 |
| l2 Velvet | Dark purple cloth | Sheen ≥ 0.8, Sheen Roughness ≥ 0.2, light Tint |
| l3 Skin and wax | Skin colour | Subsurface Weight ≥ 0.9, red Radius the largest, Scale ≥ 0.05 |
| l4 Soap bubble | Clear shell, IOR 1.0 | Thin Film Thickness 200–1000 nm, IOR 1.2–1.6 |
| l5 Brushed metal | Steel | Anisotropic ≥ 0.6, Metallic 1, Roughness 0.2–0.6 |
| s1 Your own material | Studio | a preset chosen and then changed |

## What Blender needs (checked against the manual and release notes)

- **Displacement**: the Material Output › Displacement socket moves the mesh only when Material Properties › Settings › Surface › Displacement is Displacement Only or Displacement and Bump; the default, Bump Only, uses the height as bump. The mesh needs vertices: a Subdivision Surface modifier, or Adaptive Subdivision in Cycles (now a regular option of the modifier). EEVEE displaces too, and treats Displacement Only as Displacement and Bump. The Displace modifier is the geometry alternative and works in every engine and viewport mode.
- **Transmission**: Cycles refracts everything. EEVEE refracts only the world (light probes) unless Raytracing (Render Properties) and Raytraced Transmission (Material Settings) are on; the object needs real thickness.
- **Glare**: EEVEE's old Bloom checkbox is gone. Use the Glare node (type Bloom) in the Compositor; to see it in the viewport, set Viewport Shading › Compositor to Always.
- **Emission lighting**: Cycles traces emissive surfaces as lights; EEVEE catches them with Raytracing (screen space) or baked light probes.

## How the preview differs from Blender

- The preview is Three.js's physical material (MeshPhysicalMaterial) with AgX tone mapping. The Render Engine switch does not run EEVEE or Cycles: it applies their rules (glass, emission light, displacement, adaptive subdivision) to the same preview.
- **Worlds**: Room (a small studio environment with two lights), Dark studio, and the three procedural HDRIs of the Lighting Lab (Studio, Sunset, Overcast), shown blurred in the background. Glass steps add a striped board behind the object.
- **Color Space**: an sRGB image is decoded to linear before it is used; a Non-Color image is used as it is. This is what makes the wrong settings of c1 visible.
- **Invert Color** is done on the image (1 − value) with Fac fixed at 1.
- **Bump**: the height image goes to the renderer's bump map; Strength scales it. Distance and Invert are not shown. A Bump and a Normal Map cannot be chained here (the renderer uses one or the other).
- **Displacement** is done on the CPU like a Displace modifier: each vertex moves along its normal by (height − Midlevel) × Scale and the normals are recomputed, so shading, silhouette and shadows change. It samples the mesh UVs directly (Mapping is not applied to displacement). It only happens with the right material setting (or with the Displace modifier, which adds its own height). With Bump Only or Displacement and Bump the height is also used as bump.
- **Subdivision Surface › Levels Viewport** set the plane (and cube) to 2ⁿ × 2ⁿ faces, like the modifier in Simple mode. Adaptive Subdivision in Cycles uses level 8. The sphere always has enough vertices.
- **Alpha**: a connected alpha image cuts at 0.5 (alpha clip); an Alpha value below 1 without a texture blends.
- **Emission** lights the floor and the board with a point light in Cycles (and weaker in EEVEE with Raytracing).
- **Glare** is a real post-process: the scene is rendered in HDR, pixels above Threshold are blurred at five sizes and added back before tone mapping.
- **Subsurface** is approximated with wrap lighting per colour channel (Radius × Scale); the Subsurface Method and IOR are not shown. **Coat IOR** changes the coat reflection; **Coat Tint** tints what is under the coat. **Sheen**, **Anisotropic**, **IOR Level**, **Specular Tint** and **Thin Film** use the renderer's sheen, anisotropy, specular and iridescence.
- **Transmission** uses the renderer's screen-space refraction, with a fixed thickness on the sphere and cube. In EEVEE without Raytracing and Raytraced Transmission the board is left out of the refraction, so only the world is seen through the glass.

## Texture sets

- Brick: Brick Wall 001 from Poly Haven (colour, roughness, OpenGL normal), CC0.
- Painted steel, gloss version, tiles and leaf are drawn by `labs/materials/textures.js` in the browser: scratches mask, satin paint roughness about 0.5 and polished steel about 0.18 (inverted for the gloss image), a height map with bevelled tiles, a leaf colour and a supersampled alpha outline.

## Teaching points worth stopping on

- **n1 and m1–m4** are the core of PBR: two numbers (Metallic, Roughness) and a believable Base Color. Ask students to describe real objects with them before touching the lab.
- **m2**: turn the ball to see the Fresnel edges. The highlight is white on the plastic and red on the metal.
- **c1**: switch one Color Space back and forth. The Base Color gets washed out as Non-Color; the normal map breaks as sRGB.
- **c2–c3**: link to the Baking Lab's Painter stage and to game engines (Unity's smoothness is gloss). A metallic mask is the reason in-between values exist.
- **r1–r3**: compare bump and displacement at a grazing angle, then drop the subdivisions to show why displacement needs dense geometry.
- **e4–e5**: change the IOR to 1.33 and 2.42 to compare water and diamond, then switch engines to see why EEVEE glass needs extra settings.
- **e1–e3**: glow is not emission. Emission is the material; the halo is the Compositor; the light on the floor is the engine.
- **l1–l5**: each layer answers one question: is there a varnish (Coat), fibres (Sheen), light inside (Subsurface), a film (Thin Film), grooves (Anisotropic)?
- **c4**: open the alpha image to show that the shape of a leaf is only a texture on four vertices.

## Node editor controls

The controls match Blender: drag output → input to connect, drag a connected input away to move or remove a link, Ctrl + right-drag to cut links, mouse wheel to zoom, middle mouse (or background drag) to pan, Home to see all nodes. Values are Blender-style slider bars. Click-output-then-click-input also works on touch screens. Principled BSDF panels (Subsurface, Specular, Transmission, Coat, Sheen, Emission, Thin Film) open and close with their headers.

## Material Lab scope and accuracy

This is a teaching simulation, not Blender running in a browser. It cannot load `.blend` files or evaluate arbitrary Blender graphs.

Texture Coordinate includes Generated, Normal, UV, Object, Camera, Window and Reflection. Mapping includes Point, Texture, Vector and Normal modes, with Vector, Location, Rotation and Scale in XYZ. All seven coordinate outputs can feed Mapping or an Image Texture directly. Mapping's Location, Rotation and Scale sockets can receive coordinates; connected fields hide their manual values. Rotation fields display degrees; linked rotation vectors represent radians.

The Image Texture nodes use Flat projection and Repeat extension: X and Y of the transformed vector sample the image. UV has Z = 0, so Scale Z or Location Z alone does not change a flat image. Object uses the preview mesh. The preview uses its own Y-up object axes.

For scalar maps the browser renderer samples a single channel; the lab's roughness, metallic, height and alpha images are grayscale. Arbitrary coloured-image-to-value conversions may differ from Blender.

## Parameter cards
- Every value, panel header and Properties setting has a card (`params.js`, 62 entries): rest the pointer on it (or focus it with Tab). The card says what it does, typical values with real-material examples (chips), the usual mistake and, when it matters, the EEVEE/Cycles difference.
- Use them as a reference during free work in the Studio stage: ask students to predict a value from the card, then check it on the preview.
