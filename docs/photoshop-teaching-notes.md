# Photoshop Selection & Mask Lab — teaching notes

## Why one lab

Selection and masking are one workflow: first decide *where*, then decide *what remains visible*. The lab uses a single image and two short blocks. A natural pause falls between the five selection exercises and the four mask exercises. Each step asks for one visible result before introducing another control.

## Suggested classroom run (about 30 minutes)

1. **Show the real interface (2 min).** Find the selection tools on the left and the `Capas` panel on the right. The provided screenshot has Spanish menus; the simulated controls use the same names. Explain that the lab is a focused practice model of those controls.
2. **Selections (12–15 min).** Demonstrate the rectangular marquee once. Students then try the ellipse, lasso and object selection. Pause at the quick-selection task: starting with the mug and plate both selected, choose `Restar` and brush over the plate. Use the visible selected edge to check what remains.
3. **Masks (12–15 min).** Begin with the mug selected. Click the mask icon at the bottom of `Capas`. Ask students to point to the *photo* thumbnail and then to the *mask* thumbnail before painting. Black hides the stray old background; white restores the missing mug. Use `Alt`+click on the mask thumbnail or the lab's `Ver máscara` control to inspect the black-and-white image.
4. **Transfer (3 min).** In Photoshop, open a copy of a photo with a clear subject, use `Selección de objetos` or `Selección rápida`, then click `Añadir máscara de capa`. Select the mask thumbnail before using `Pincel`. Save a PSD so the original pixels and mask remain editable.

## What to look for

- A selection edge follows the intended object rather than just a nearby rectangle.
- Subtracting the plate leaves the mug selected.
- A white mask area shows the source layer; black reveals the layer below.
- Students can find the mask thumbnail and describe why painting the photo thumbnail would have a different result.

The lab checks the *result* with a generous geometric tolerance for freehand work. Hint and example controls remain available at every step. Students can revisit any exercise without losing completed-step marks.

## Scope of the simulation

The scene is an illustration generated in the browser. `Selección de objetos` and `Selección rápida` recognise its four known objects; they do not use Photoshop's actual image analysis. The layer mask is a real editable pixel mask in the simulation, and the source image is retained. The lab is designed to rehearse tool choice and mask logic before work on a real photograph.

## Adobe reference

- [Selection tools in Photoshop](https://helpx.adobe.com/photoshop/desktop/make-selections/get-started-selections/selection-tools-overview.html)
- [Add and edit layer masks](https://helpx.adobe.com/es/photoshop/desktop/create-masks/layer-masks/add-layer-masks.html)
