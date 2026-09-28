# Color Grading Lab · teaching notes

Lab 18, in `labs/grading/`, for the audiovisual groups. It copies the Color page of DaVinci Resolve (names in English, as in the program) and works on three painted shots recorded "flat", as a log camera would. Five stages, 11 steps.

## Stages
| Stage | Steps | What students do |
|---|---|---|
| 1 · Read the scopes | s1 The Waveform · s2 Parade and Vectorscope | Hover the viewer to find columns on the Waveform; answer where the blacks (≈17) and the window (≈73) sit. Read the grey card on the Parade (blue highest: too cool) and the skin on the Vectorscope (short, under the line). |
| 2 · Primary correction | p1 Blacks and whites · p2 A neutral grey card · p3 Contrast and saturation | Master dials of Lift and Gain: blacks 0–6, whites 88–100. Gain puck towards orange until the card is neutral (skin lands at ≈125°). Sat up until skin saturation is 11.5–16 on the readout. |
| 3 · Nodes and the look | n1 A node for the look · n2 An S curve | + Serial, Film Print LUT on node 02 (never on node 01). A Custom S curve on node 03 inside 0–100. |
| 4 · Secondaries | q1 Qualifier: only the sky · q2 Power Window: light the face | Exterior: pick the sky, refine Hue/Sat/Lum with Highlight (≥ 80 % of the sky, ≤ 8 % of the rest), then Sat up and Gamma down. Interview: Circle window on the face, Soft, Gamma up (face +3, wall unchanged). |
| 5 · Shot matching | m1 Match the B camera · m2 Colourist decisions | Split screen with a still of the graded A camera: match skin hue (≤ 5°), level and saturation, wall level and blacks. Four questions on order of work, LUT placement, legal levels and secondaries. |

## The maths (simplified, on display values 0–1)
- Per channel: Offset adds; Lift: x + L·(1 − x) (moves black, keeps white); Gain: × G (keeps black); Gamma: x^(1/(1+g)); Contrast around Pivot; then the Custom curve.
- A puck is a colour of zero luma (Rec.709) in the direction of the Vectorscope; the dial under the wheel is the master (the Y number).
- Sat scales the distance from grey (Vectorscope radius); Hue rotates it. Temp and Tint multiply R/B and G.
- Qualifier: soft ranges of hue, saturation and lightness of the node input. Window: soft ellipse. The node blends its result with its input by the key.
- Vectorscope: Cb/Cr of Rec.709; skin tone line at 123°.

## Talking points
- Scopes before eyes: after a few seconds the eye adapts to any cast.
- Order: balance (levels, white balance) → look (LUT, curves) → secondaries → matching. Put the balance in node 01 and the look in later nodes.
- A grey card in the shot is the fastest white balance. Skin should sit close to the skin tone line whatever the person's skin colour; its saturation is what changes.
- Creative LUTs expect Rec.709 balanced input; technical LUTs (camera log → Rec.709) go first, on their own node.
- Broadcast: keep 0–100 on the Waveform (legal levels).
- Matching: skin first, then neutrals and blacks. Grab Still + wipe in Resolve.

## Simulation notes
- The shots are painted procedurally (no footage files); the camera adds a flat log-like curve, a colour cast and grain. Masks mark grey card, skin, wall, sky, clouds and foliage for the checks.
- The checks measure a 160 × 90 copy of the graded shot; the viewer shows 512 × 288.
- "Show a solution" runs small solvers (levels, neutral card, saturation, matching) on the same measurements.
