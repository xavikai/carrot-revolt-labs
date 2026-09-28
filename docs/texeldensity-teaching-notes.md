# Texel Density Lab · teaching notes

Lab 16, in `labs/texel-density/`. Five stages, 13 steps. It shows texel density from three sides: you see it (checker), you compute it (px ÷ m), and you decide it (camera, memory, exceptions).

## The idea in one sentence
Texel density = texture pixels per metre of surface = texture size × √(UV area ÷ 3D area). It depends on three things **together**: the texture size, the size of the UV islands and the real size of the object.

## Stages
| Stage | Steps | What students do |
|---|---|---|
| 1 · See it | s0 A ruler of one metre · s1 The checker map · s2 Blurry next to sharp | Click props: a yellow 1 m ruler lies on the face and on the texture in the UV Editor; its length in pixels of the image is the density (the 0.5 m crate: × 2). Then switch Texture/Checker, read px/m of a crate, a wall and a barrel (all 1K). Then pick the blurriest and the sharpest prop from the squares alone. |
| 2 · Measure it | m0 Islands on the image · m1 Pixels ÷ metres · m2 Three knobs | Click faces of the crate and see their island on the image (size in px) and the face (size in m); switch the UV Editor to Image › Texture to see the planks painted inside each island; zoom until the pixel grid appears. Then type the density of the crate for three cases (512, 1024, 256 px/m). Reach 512 px/m three ways: bigger texture, bigger islands (A, S 2), smaller object (Scale 0.5). |
| 3 · Match it | a1 Same squares by hand · a2 Average and pack · a3 One density for the scene · a4 Loop cuts for the texture zones | Scale the cabinet islands to 512 px/m with S; use Average Islands Scale + Pack Islands; choose the smallest texture for each prop and press Set TD. Then a 3 × 2 m corridor wall made of one quad, on a 1K trim sheet (baseboard 0.25 m, cornice 0.25 m, bricks 1.5 m, repeating across): turn on Wireframe, add two loop cuts (0.25 m and 1.75 m) and send each strip to its zone so every strip keeps 512 × 512 px/m. |
| 4 · Choose it | c1 The target comes from the camera · g1 Your game, your number · c2 Texture size and memory | Pixel loupe: texels vs screen pixels at 10 m / 2.5 m / 1.25 m (answers 128, 512, 1024 px/m). Then the formula with four game types (mobile, first person on 4K, VR, first-person weapon) and a "Your game" row with editable H, FOV and d. Fit four props in a 40 MB budget at 512 px/m and see ×4 memory at 1024. |
| 5 · Break the rule | e1 More for the hero, less for the hidden · e2 When to break it | Vending machine: front 1024, sides 512, top 256, back 128 px/m. Quiz of six cases: higher / same / lower. |

## Numbers used (so you can check them on the board)
- Checker square = 64 × 64 texels. At 512 px/m a square is 12.5 cm.
- Packed layouts (margin 0.01): crate 0.5 m → 655 px/m on 1K; wall 3 × 2 m → 335 px/m on 1K; barrel Ø0.6 × 0.9 m → 534 px/m on 1K; vending machine → 286 px/m on 1K.
- Smallest textures for 512 px/m: crate 1K, barrel 1K, wall 2K, vending machine 2K, cabinet 2K.
- Screen 2560 × 1440, vertical FOV 60°: 1 m covers 1247 ÷ distance px → 125 px at 10 m, 499 px at 2.5 m, 998 px at 1.25 m.
- The general formula (step g1): 1 m covers H ÷ (2 × d × tan(FOV ÷ 2)) screen pixels; the target is the power of two at or just above it. Examples: mobile top-down (1080 px, 60°, 4 m) → 234 → 256 px/m; first person on 4K (2160 px, 60°, 1.25 m) → 1497 → 2048; VR per eye (2200 px, 96°, 1 m) → 990 → 1024; first-person weapon (1440 px, 60°, 0.5 m) → 2494 → 4096.
- d is the closest *usual* distance, not the worst case. Published targets are conventions (older FPS 256–512 px/m, current AAA around 1024 px/m); the budget often lowers the result by one step, with exceptions for hero assets.
- Memory of a texture set (colour + normal + roughness, 1 byte/px block-compressed, + ⅓ mipmaps): 1K = 4 MB, 2K = 16 MB, 4K = 64 MB. Shop scene: 10 / 40 / 160 MB at 256 / 512 / 1024 px/m.

## Talking points
- The key sentence: texel density is measured on the model (texture size, UV size, object size), like its size in metres; it does not depend on the camera. The camera decides the target: how many px/m you need so the object is sharp at the size it appears on screen.
- "Pixels of texture" = pixels of the image. The UV square 0–1 is the whole image; an island only says which of its pixels paint a face. The UV map has no pixels of its own.
- A checker is only useful if its squares are a fixed number of **texels**: make it at the size of the real texture.
- Scaling an object in Object Mode changes its density: apply the scale before measuring.
- Average + Pack gives even squares on one object, but the density it lands on is an accident of packing. Set TD (Texel Density Checker) sets the number.
- The target is a project decision (camera + budget); texture sizes follow from it. Write it in the art bible.
- Exceptions are deliberate: hero areas, readable text and first-person weapons up; hidden, far or tiny faces down.

## Simulation notes
- The 3D view paints each texture procedurally at its real resolution (bilinear, with a mip-like limit), so blur follows the density without huge images in memory.
- The pixel loupe resamples the brick pattern at the texel grid, then shows what a screen at that distance would display.
- Links: Trim Sheet Lab (strip heights from density), UV Unwrap Lab.
- Wireframe (3D header, every step) draws the edges and vertices of the quads. Step a4 uses it to show why a plane without divisions cannot keep density with a trim sheet: one face can only sit on one zone; a strip taller or shorter than its zone is stretched vertically (e.g. one quad on the 1.5 m brick zone: 512 × 384 px/m).
