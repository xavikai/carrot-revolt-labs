# Sèrie de labs de ComfyUI · pla

Tots els labs fan servir la mateixa interfície simulada de ComfyUI (`labs/comfyui/app.js`). Cada lab és una carpeta amb un `index.html` (`data-config="./lab.js"`), un `lab.js` (etapes, passos, checklists, plantilles) i, si cal, un `nodes.js` amb nodes nous i el seu simulador (`registerNodes`, `KIND_RENDERERS`, `RECIPE_HOOKS`).

| # | Lab | Estat | Continguts |
|---|-----|-------|-----------|
| 01 | **ComfyUI Lab** (`labs/comfyui/`) | Fet | Interfície i dreceres, els 7 nodes del text a imatge, seed / steps / CFG / samplers, mida i img2img, LoRA, ControlNet, hàbits (grups, workflows dins el PNG). |
| 02 | **Inpainting Lab** (`labs/comfyui-inpaint/`) | Fet | Màscares (Mask Editor, grow, blur), les quatre vies (VAE Encode for Inpainting, Set Latent Noise Mask, InpaintModelConditioning + model d’inpainting, Differential Diffusion), ImageCompositeMasked, Crop & Stitch, outpainting (pad, feathering, prompt), cleanplates. |
| 03 | **Upscale & Detail Lab** (`labs/comfyui-upscale/`) | Fet | Upscale latent vs píxel, models d’upscale (ESRGAN i similars), hires fix en dues passades, upscale per tiles (Ultimate SD Upscale) amb ControlNet Tile, detailers de cares i mans (detecció bbox/segm, crop, inpaint, stitch), arribar a 4K sense quedar-se sense VRAM. |
| 04 | **Flux Lab** (`labs/comfyui-flux/`) | Fet | Carregar models per parts (UNET, DualCLIP/T5, VAE), Flux dev/schnell, guidance vs CFG, prompts en llenguatge natural, fp8/GGUF i memòria, eines Flux (Fill, Depth, Canny, Redux), edició per instruccions, comparativa amb SDXL / SD 3.5. |
| 05 | **Control & injecció de conceptes** | Següent | Multi-ControlNet i preprocessadors (depth, pose, lineart), prompts regionals (Conditioning Set Mask / Area), IPAdapter (estil i composició, weight types), identitat (models de cara), atenció amb màscara, combinar-ho tot. |
| 06 | **Sampling, prompting i workflows** | Pendent | Instal·lació i carpetes de models, Manager i custom nodes, errors típics; samplers i schedulers a fons, KSampler Advanced i passades encadenades, pesos i programació de prompts, wildcards, comparatives XY, primitives, reroutes, subgraphs. |
| 07 | **LoRA a fons i entrenament** | Pendent | Com funciona una LoRA (rank, capes), apilar-ne, preparar el dataset, captions, paràmetres d’entrenament (simulats), overfitting, avaluar checkpoints amb comparatives. |
| 08 | **3D i vídeo** | Pendent | Vídeo amb Wan (text i imatge a vídeo, frames, fps, durada, primer/últim frame, control), exportar vídeo, imatge a malla 3D, mapes de profunditat i normals, projecció de textures. |

Ordre de prioritat acordat: 03 Upscale & Detail (fet) → 04 Flux (fet) → 05 Control & injecció → 06 → 07 → 08.

## Integració per a cada lab nou
- `lab-brief.js`: prefix de localStorage propi (`carrot-revolt-comfy-<id>:`).
- Home: targeta a la secció ComfyUI, comptadors i textos a `home.i18n.js`.
- Tests a `tests/comfyui-<id>.test.mjs` (tots els starters/solucions vàlids, cada pas resoluble amb la solució, cap starter ja resolt) i a `package.json`.
- Paràgraf al README.
