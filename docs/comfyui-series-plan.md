# Sèrie de labs de ComfyUI · pla

Tots els labs fan servir la mateixa interfície simulada de ComfyUI (`labs/comfyui/app.js`). Cada lab és una carpeta amb un `index.html` (`data-config="./lab.js"`), un `lab.js` (etapes, passos, checklists, plantilles) i, si cal, un `nodes.js` amb nodes nous i el seu simulador (`registerNodes`, `KIND_RENDERERS`, `RECIPE_HOOKS`).

| # | Lab | Estat | Continguts |
|---|-----|-------|-----------|
| 01 | **ComfyUI Lab** (`labs/comfyui/`) | Fet | Interfície i dreceres, els 7 nodes del text a imatge, seed / steps / CFG / samplers, mida i img2img, LoRA, ControlNet, hàbits (grups, workflows dins el PNG). |
| 02 | **Inpainting Lab** (`labs/comfyui-inpaint/`) | Fet | Màscares (Mask Editor, grow, blur), les quatre vies (VAE Encode for Inpainting, Set Latent Noise Mask, InpaintModelConditioning + model d’inpainting, Differential Diffusion), ImageCompositeMasked, Crop & Stitch, outpainting (pad, feathering, prompt), cleanplates. |
| 03 | **Upscale & Detail Lab** (`labs/comfyui-upscale/`) | Fet | Upscale latent vs píxel, models d’upscale (ESRGAN i similars), hires fix en dues passades, upscale per tiles (Ultimate SD Upscale) amb ControlNet Tile, detailers de cares i mans (detecció bbox/segm, crop, inpaint, stitch), arribar a 4K sense quedar-se sense VRAM. |
| 04 | **Flux Lab** (`labs/comfyui-flux/`) | Fet | Carregar models per parts (UNET, DualCLIP/T5, VAE), Flux dev/schnell, guidance vs CFG, prompts en llenguatge natural, fp8/GGUF i memòria, eines Flux (Fill, Depth, Canny, Redux), edició per instruccions, comparativa amb SDXL / SD 3.5. |
| 05 | **Control & Injection Lab** (`labs/comfyui-control/`) | Fet | Multi-ControlNet i preprocessadors (depth, pose, lineart), prompts regionals (Conditioning Set Mask / Area), IPAdapter (estil i composició, weight types), identitat (models de cara), atenció amb màscara, combinar-ho tot. |
| 06 | **Sampling & Prompting Lab** (`labs/comfyui-sampling/`) | Fet | “Value not in list” i carpetes de models, embeddings negatius, samplers ancestrals vs convergents, schedulers i steps, KSampler Advanced en dues etapes, prompts per trams (ConditioningSetTimestepRange), pesos, prompts dinàmics {a\|b}, prompts llargs (75 tokens), explorar i conservar seeds. Pendent per a més endavant: Manager i nodes que falten, reroutes, primitives, subgraphs, comparatives XY. |
| 07 | **LoRA Lab** (`labs/comfyui-lora/`) | Fet | Força de model i de clip, paraula clau, massa força, apilar LoRAs; dataset (varietat), captions (paraula clau + el que canvia); entrenar amb els nodes de ComfyUI (Train LoRA, Load LoRA Model, Save LoRA Weights, Plot Loss Graph); infra/sobreentrenament, learning rate i rank; flexibilitat i triar el checkpoint. Personatge propi: la Pip. |
| 08 | **Video & 3D Lab** (`labs/comfyui-video/`) | Fet | Vídeo amb Wan: latent de vídeo, frames / fps / durada, prompts de moviment i càmera, imatge a vídeo (i2v + CLIP Vision, error de canals), primer i últim frame, memòria (OOM), clips massa llargs, els dos experts de Wan 2.2 amb KSampler Advanced; imatge a malla 3D (treure el fons, octree_resolution, threshold, multivista). Pendent per a més endavant: exportar MP4 i interpolar frames, ControlNet de vídeo / VACE, mapes de profunditat i normals, projecció de textures. |
| 09 | **Workflow Lab** (`labs/comfyui-workflow/`) | Fet | Workflows d’altres: custom nodes que falten i Manager (instal·lar, reiniciar), models que falten (Model Manager); reroutes; primitives Int / String que governen widgets (seed compartit, prompt compartit); subgraphs (convertir, obrir, editar una definició compartida); graelles XY (cfg × sampler, seeds). |

Ordre de prioritat acordat: 03 Upscale & Detail (fet) → 04 Flux (fet) → 05 Control & injecció (fet) → 06 (fet) → 07 (fet) → 08 (fet) → 09 (fet).

## Integració per a cada lab nou
- `lab-brief.js`: prefix de localStorage propi (`carrot-revolt-comfy-<id>:`).
- Home: targeta a la secció ComfyUI, comptadors i textos a `home.i18n.js`.
- Tests a `tests/comfyui-<id>.test.mjs` (tots els starters/solucions vàlids, cada pas resoluble amb la solució, cap starter ja resolt) i a `package.json`.
- Paràgraf al README.
