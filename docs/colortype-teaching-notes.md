# Color & Type Lab · teaching notes

A Figma-style editor (Layers, Design panel, colour styles with modes, text styles) on the home page of a film festival ("Lumen Fest"). Aimed at the cycle of interactive graphic products, useful in any cycle that designs screens.

## What is measured

- **Contrast**: WCAG 2 relative luminance. Normal text AA 4.5:1, AAA 7:1; large text (24 px, or 18.66 px bold) AA 3:1, AAA 4.5:1; buttons and other UI shapes 3:1 against their surroundings (1.4.11).
- **Colour difference**: CIEDE2000 (ΔE ≈ 2 just noticeable). Used to compare the mixed colour with the target, and the two status chips as seen with deuteranopia.
- **Colour vision**: Machado, Oliveira & Fernandes (2009) matrices at full severity, in linear RGB. The canvas uses the same matrices as SVG filters.
- **Print**: a teaching model, not an ICC profile. Paper and the overprints of C, M, Y with Lab values close to FOGRA39, mixed with Yule-Nielsen modified Neugebauer (n = 2); black ink darkens the mixture. A colour is "printable" if the nearest printable colour is within ΔE76 6. Ink limit 300%.
- **Type**: font metrics measured from the files (x-height, cap height, ascender, descender, average advance). Body text: 16–20 px, line height 140–170%, 45–75 characters per line (width ÷ size × average advance). Type scale: body 16–18 px, caption ≥ 12 px, every step ×1.15–×2.

## Stages

1. **Colour on screen** — mix the brand purple (#5B34C9) with HSL only (hex locked, ΔE ≤ 5); darken three greys to AA; a yellow button with white text must pass 4.5:1 (label) and 3:1 (button on page); red/green chips: view with deuteranopia, then icons or ΔE ≥ 20 between the simulated colours.
2. **Screen and print** — RGB lights and CMY inks (white, black, red = M + Y); electric blue and lime out of gamut: turn on Proof colours and bring both in while keeping the hue within 30°; body text K 100 only, nav bar rich black with K 100 and 240–300% total.
3. **Typography** — click the five lines (baseline, x-height, cap height, ascender, descender), then leave the specimen on the font with the smallest x-height (Jost); fix a 12 px / 100% / 900 px paragraph; replace the script and monospaced faces in body and subtitle; tracking of small capitals 5–15%, of the title −3–0%.
4. **Hierarchy and system** — type scale (the generator applies base × ratio); at most two families, headings bold, body regular; link every layer to a colour style and fix the failing pairs (muted and primary are too light); dark mode values for every style (background lightness under 25, not pure black).

## Ideas for class

- Ask for the contrast ratio before the students measure it: the eye is a bad judge of luminance (a saturated yellow is very light).
- Compare the same page in the four vision modes and discuss which information is lost.
- Take one step to Figma: create the same colour variables with two modes and switch a frame between them.
