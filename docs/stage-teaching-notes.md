# Stage House Lab · teaching notes

An opera house stage cut in half, simplified from the Teatro Real (Madrid). The numbers of the real house come from the article *El titiritero mecánico del Teatro Real* (El Mercantil, 12 December 2020).

## The model (metres)

- Proscenium opening 14 × 11 m. Main stage 22 × 21.5 m inside a fly tower of 26 m width with the **grid at 32 m** (2.9 × the opening height).
- Wings (hombros) 14 m wide on both sides, rear stage (chácena) 15.5 m deep, understage 24 m deep ("cota -16" at the Teatro Real).
- Six platforms of 18.2 × 3.5 m (the real size; the Teatro Real has more), travel −12 … +3 m. Orchestra pit lift 0 … −3.2 m.
- Five borders (5 m tall) with a pair of legs (5.5 m wide) each, four electrics just upstage of the borders, three backdrops of 20 × 12 m, two wagons: one in the stage-left wing (moves across), one in the rear stage (moves forwards).
- Seats (eye positions): front row (0, 0.1, 8.5), far left and far right (±9, 0.6, 12), top balcony (0, 17, 30).

## Sightlines

A point is seen from a seat if the straight line between them passes through the opening, stays above the stage floor and does not cross a drop, a border or a leg in between. Every piece is sampled on its faces; "hidden" means no seat sees any sample. The seat view marks in red the samples that should be hidden and are still seen (the backdrop to fly out, the electrics, the wings, the wagons in store).

## Stages

1. **The stage house.** Find 12 parts (the smallest box under the mouse wins, so the grid can be picked inside the fly tower). Fly the backdrop out: with the borders trimmed at 7.6 m, its bottom must reach about 9 m, so the bar goes to about 21 m: a cloth as tall as the opening needs about twice the opening height above the stage. Lower the pit to −2.4 … −3.2 m.
2. **Upper machinery.** Counterweight: cloth 140 kg + bar 55 kg = 195 kg; 16 bricks of 12.5 kg = 200 kg balances it (±6.25 kg). With more than 60 kg of imbalance the bar is not allowed to move ("it runs away"). Truss of 1100 kg: bars already carry A 200, B 500, C 0, D 300 kg; limit 750 kg. A + C works (750 / 550), B never works, three bars A + C + D also work.
3. **Lower machinery.** Steps of 0.4 m per platform. The statue (3.6 m) sinks when its platform goes below −3.8 m. The wagon stops at the lowered platform (interlock) until the platform is back at 0.
4. **Masking.** Legs: inner edges at about 6–6.8 m hide the wings from the side seats while keeping 12 m of acting width; at 7 m the far seats see between the legs. Borders: bars at about 12.2–12.7 m (bottoms 7.2–7.7 m) hide the electrics from the front row.
5. **Scene change.** Forest → palace: forest backdrop out, forest wagon to the wing (otherwise the two wagons would crash), palace wagon forward (only once both backdrops are out), then palace backdrop in. Palace → hell: palace backdrop out, palace wagon back, hell backdrop in, statue down.

## Ideas for class

- Ask for the reason of every interlock before showing a solution.
- Compare the lab with the section of the Teatro Real (Caja escénica, parrillas, chácena, contrachácena, plataformas, montacargas).
- In Blender, place a camera at each seat of the lab and check a set model with the Camera view.
