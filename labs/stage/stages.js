// Stages of the Stage House Lab. Every step loads its own state and says which pieces are on stage.
import * as M from './stage.js';

const BORDERS = [1, 2, 3, 4, 5].map(i => 'border' + i);
const LEGS = [1, 2, 3, 4, 5].map(i => 'leg' + i);
const ELECTRICS = [1, 2, 3, 4].map(i => 'elec' + i);
const PLATS = Array.from({ length: M.PLATFORM.count }, (_, i) => 'plat' + i);
const MASKING = [...BORDERS, ...LEGS];
export const GOOD = { border: 12.6, leg: 6.5 };      // masking trims that work (the solutions use them)
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// A state from the default one, with some values changed.
export function stateWith(values = {}, extra = {}) {
  const st = M.defaultState();
  Object.assign(st.v, values);
  return Object.assign(st, extra);
}
const masked = (values = {}) => {
  const v = {}; BORDERS.forEach(b => { v[b] = GOOD.border; }); LEGS.forEach(l => { v[l] = GOOD.leg; });
  return { ...v, ...values };
};

// The parts of the stage house, for the first step (click the part named).
// Boxes: [x0, x1, y0, y1, z0, z1]. Several boxes can share a part (the two wings).
export const PARTS = [
  { id: 'boca', name: 'Proscenium opening', es: 'Boca', boxes: [[-7, 7, 0, 11, -0.25, 0.25]], about: 'The window the audience sees the show through (14 × 11 m here).' },
  { id: 'stage', name: 'Main stage', es: 'Escenario', boxes: [[-11, 11, -0.35, 0.35, -21.5, 0]], about: 'The acting area inside the fly tower.' },
  { id: 'wings', name: 'Wings', es: 'Hombros', boxes: [[-25, -11, 0, 14, -21.5, 0], [11, 25, 0, 14, -21.5, 0]], about: 'Stage right and stage left: where the scenery waits, as big as the stage itself.' },
  { id: 'rear', name: 'Rear stage', es: 'Chácena', boxes: [[-11, 11, 0, 14, -37, -21.5]], about: 'Behind the stage: another full set can wait here, and come forward on a wagon.' },
  { id: 'flies', name: 'Fly tower', es: 'Caja escénica (peine)', boxes: [[-13, 13, 11, 31.5, -22.5, 0.4]], about: 'The space above the stage where the scenery flies out of sight.' },
  { id: 'grid', name: 'Grid', es: 'Parrilla', boxes: [[-13, 13, 31.5, 33, -22.5, 0.4]], about: 'The floor of steel at the top of the tower that holds the pulleys and motors of every bar.' },
  { id: 'galleries', name: 'Fly galleries', es: 'Galerías', boxes: [[-13, -11.2, 9.5, 10.6, -22, -1], [11.2, 13, 9.5, 10.6, -22, -1], [-13, -11.2, 19.5, 20.6, -22, -1], [11.2, 13, 19.5, 20.6, -22, -1]], about: 'Walkways along the side walls of the tower, where the machinery is worked and the cables are tied off.' },
  { id: 'fire', name: 'Safety curtain', es: 'Telón cortafuegos', boxes: [[-8, 8, 11.5, 23.5, 0.4, 0.8]], about: 'A steel curtain that closes the proscenium in a fire, so the stage and the auditorium are separated.' },
  { id: 'pit', name: 'Orchestra pit', es: 'Foso de orquesta', boxes: [[-9, 9, -3.2, 0, 1.5, 6.5]], about: 'Between the stage and the audience, lower than both. Its floor is a lift.' },
  { id: 'understage', name: 'Understage', es: 'Foso (bajo escenario)', boxes: [[-13, 13, -24, -0.4, -22.5, 0]], about: 'Below the stage: the machinery of the platforms and the traps. At the Teatro Real it goes 24 m down.' },
  { id: 'platforms', name: 'Stage platforms', es: 'Plataformas', boxes: [[-9.1, 9.1, -3, -0.4, -21.5, -0.5]], about: 'Strips of floor that go up and down (Teatro Real: 18.2 × 3.5 m, they carry up to 24 t).' },
  { id: 'house', name: 'Auditorium', es: 'Sala', boxes: [[-15, 15, -1.5, 20, 7, 32]], about: 'Where the audience sits: stalls and balconies.' },
];

export const STAGES = [
  {
    id: 'parts', name: 'The stage house', sub: 'Parts · sightlines',
    steps: [
      {
        id: 'p1', title: 'Find the parts',
        text: 'An opera house is two buildings joined by a hole: the auditorium and the stage house. The stage house is much bigger than what the audience sees. Click the part the lab asks for; clicking any other part tells you its name.',
        how: ['Read the part to find in the panel on the right.', 'Click it in the 3D view. Orbit with <kbd>MMB</kbd> (or <kbd>Alt</kbd> <kbd>LMB</kbd>) and zoom with the wheel to reach the hidden ones.', 'The view is cut in half so you can see inside: switch off <b>Section</b> to see the building closed.'],
        why: 'The wings, the rear stage and the fly tower each hold a full set, so the show can change scene in seconds.',
        quiz: PARTS.map(p => p.id),
        show: ['forest', ...MASKING, ...ELECTRICS, ...PLATS, 'pit', 'wForest', 'wPalace'],
        start: () => stateWith(masked({ forest: 12, pit: -2.8 })),
        check: (st, c) => PARTS.every(p => c.flags.found?.includes(p.id)),
        solve: (st, flags) => { flags.found = PARTS.map(p => p.id); },
      },
      {
        id: 'p2', title: 'Why is it so tall?',
        text: 'The backdrop is 12 m tall, a bit more than the opening. Fly it out: raise its bar until nobody in the audience can see any part of it. Look at the seat views: the front row looks up the most.',
        how: ['Click the <b>Forest backdrop</b> (or pick it in the list).', 'Press <kbd>G</kbd> and move the mouse up, or type the height of the bar: <kbd>G</kbd> <kbd>2</kbd><kbd>2</kbd> <kbd>Enter</kbd>.', 'The panel shows from which seats it is still seen.'],
        why: 'A cloth as tall as the opening needs about twice the height of the opening above the stage to disappear. That is why the fly tower is the tallest part of a theatre (here the grid is at 32 m for an 11 m opening).',
        seat: 'front',
        show: ['forest', ...MASKING],
        start: () => stateWith(masked({ forest: 12 })),
        check: st => M.hidden('forest', st, ['forest', ...MASKING]),
        solve: st => { st.v.forest = 22; },
        focus: 'forest',
      },
      {
        id: 'p3', title: 'Opera or theatre',
        text: 'The floor of the orchestra pit is a lift. At stage level it becomes a forestage for plays and concerts; lowered, it makes room for 80 musicians under the eyes of the audience. Tonight is opera: lower the pit.',
        how: ['Click the <b>Orchestra pit lift</b>.', 'Press <kbd>G</kbd> and move it down to about -2.8 m (between -2.4 and -3.2 m).', 'Watch the balcony view: the musicians stay visible from above, not from the stalls.'],
        why: 'A lower pit lets the conductor see the singers and the singers be heard over the orchestra, without blocking the view of the stalls.',
        seat: 'front',
        show: ['pit', ...MASKING, 'forest'],
        start: () => stateWith(masked({ forest: 12, pit: 0 })),
        check: st => st.v.pit <= -2.4 && st.v.pit >= -3.2,
        solve: st => { st.v.pit = -2.8; },
        focus: 'pit',
      },
    ],
  },
  {
    id: 'fly', name: 'Upper machinery', sub: 'Bars · counterweights · loads',
    steps: [
      {
        id: 'f1', title: 'Balance the counterweight',
        text: 'Many theatres fly by hand: the rope of each bar goes over the grid to an arbor loaded with steel bricks that weighs as much as the bar. The painted cloth (140 kg) and its empty bar (55 kg) weigh 195 kg. Load the arbor so the set is balanced, then fly the cloth out.',
        how: ['Add bricks of 12.5 kg with the <b>+</b> button until the imbalance is under 6.25 kg (half a brick).', 'Select the <b>Painted cloth</b> and fly it out (<kbd>G</kbd>) to 20 m or more.', 'With too little or too much counterweight the bar runs away: the lab will not let you fly it.'],
        why: 'A balanced set moves with the force of one hand and stops where you leave it. The Teatro Real has motorised bars instead: 68 bars of 20 m that lift 750 kg each.',
        seat: 'front', cw: true,
        show: ['cloth'],
        start: () => stateWith({ cloth: 10 }),
        check: st => Math.abs(M.counterweight(st).diff) <= M.BRICK / 2 && st.v.cloth >= 20,
        solve: st => { st.cw = Math.round((M.PIECES.cloth.kg + M.PIPE_KG) / M.BRICK); st.v.cloth = 22; },
        focus: 'cloth',
      },
      {
        id: 'f2', title: 'Share the load',
        text: 'A lighting truss of 1100 kg must fly over the stage. One motorised bar lifts 750 kg, and the four bars near it already carry lights and cloths. Hang the truss from bars that can take their share without going over the limit.',
        how: ['Tick the bars to hang the truss from in the panel: it shares its weight equally between them.', 'Each bar shows its total load; red means over 750 kg.', 'Try with two bars first, then with three.'],
        why: 'Heavy pieces hang from two or more bars (or from chain hoists, the "puntos" of 150 kg and "puntuales" of 250 kg of the Teatro Real). The limit of every bar includes what it already carries.',
        seat: 'balcony', truss: true,
        show: ['truss'],
        start: () => stateWith({ truss: 14 }),
        check: st => st.truss.length >= 2 && Object.values(M.trussLoads(st)).every(kg => kg <= M.BAR_LIMIT),
        solve: st => { st.truss = ['A', 'C']; },
        focus: 'truss',
      },
    ],
  },
  {
    id: 'lower', name: 'Lower machinery', sub: 'Platforms · wagons',
    steps: [
      {
        id: 'l1', title: 'A stepped stage',
        text: 'The stage floor is made of platforms that go up and down. Build steps for a choir: the first platform stays at stage level and every platform behind it is 0.4 m higher than the one in front.',
        how: ['Select <b>Platform 2</b> and type <kbd>G</kbd> <kbd>.</kbd><kbd>4</kbd> <kbd>Enter</kbd>.', 'Then Platform 3 at 0.8 m, Platform 4 at 1.2 m, Platform 5 at 1.6 m and Platform 6 at 2 m.', 'You can also type the heights in the list.'],
        why: 'Platforms build levels, slopes and pits without building scenery. At the Teatro Real they are 18.2 × 3.5 m and carry up to 24 t.',
        seat: 'front',
        show: [...PLATS, ...MASKING, 'forest'],
        start: () => stateWith(masked({ forest: 12 })),
        check: st => PLATS.every((p, i) => near(st.v[p], 0.4 * i, 0.05)),
        solve: st => { PLATS.forEach((p, i) => { st.v[p] = +(0.4 * i).toFixed(2); }); },
      },
      {
        id: 'l2', title: 'Make the statue disappear',
        text: 'The statue stands on Platform 2. Send it down under the stage so the whole statue is below the floor: the audience sees it sink.',
        how: ['Select <b>Platform 2</b>.', 'Press <kbd>G</kbd> and move it down until the top of the statue is under the floor (about -4 m).', 'The understage is 24 m deep at the Teatro Real: a full set can be stored under the stage.'],
        why: 'Sinking and rising are the oldest stage effects. The hole left in the floor must be closed or lit before anyone walks there.',
        seat: 'balcony',
        show: [...PLATS, 'statue', ...MASKING, 'forest'],
        start: () => stateWith(masked({ forest: 12 })),
        check: st => M.boxes('statue', st)[0].y1 <= -0.2,
        solve: st => { st.v.plat1 = -4; },
        focus: 'plat1',
      },
      {
        id: 'l3', title: 'Bring on the wagon',
        text: 'The forest wagon waits in the stage left wing. Bring it to the centre of the stage. A wagon rolls on the floor: it can only cross platforms that are at stage level.',
        how: ['Select the <b>Forest wagon</b> and press <kbd>G</kbd>: it moves along its track only.', 'If it stops, something is in its way: read the status bar.', 'Fix the platform, then bring the wagon to 0 m (the centre).'],
        why: 'Wagons (carros) carry whole sets on and off the stage from the wings and the rear stage. The machines have interlocks so that a wagon never runs into a hole.',
        seat: 'front',
        show: [...PLATS, 'wForest', ...MASKING, 'forest'],
        start: () => stateWith(masked({ forest: 12, plat2: -1.2, wForest: 17 })),
        check: st => st.v.wForest <= 0.2 && !M.conflict(st, [...PLATS, 'wForest']),
        solve: st => { st.v.plat2 = 0; st.v.wForest = 0; },
        focus: 'wForest',
      },
    ],
  },
  {
    id: 'mask', name: 'Masking', sub: 'Legs · borders · seats',
    steps: [
      {
        id: 'm1', title: 'Hide the wings',
        text: 'From the seats at the sides you can look past the legs into the wings, where the scenery and the singers wait. Bring the legs in (their inner edge closer to the centre) until nobody can see into the wings, but keep an acting width of at least 12 m.',
        how: ['Switch the seat view to <b>Stalls, far left</b>: the red marks are what it sees of the wings.', 'Select a pair of legs and press <kbd>G</kbd>, or type the distance of their inner edge from the centre in the list.', 'All five pairs must work together: the sightline that passes one leg must hit the next.'],
        why: 'Masking is designed from the worst seats: the extreme sides for the legs, the front row for the borders.',
        seat: 'left', wings: true,
        show: [...MASKING, ...ELECTRICS, 'forest'],
        start: () => { const st = stateWith(masked({ forest: 12 })); LEGS.forEach(l => { st.v[l] = 9; }); return st; },
        check: st => Object.values(M.wingsSeen(st, [...MASKING, 'forest'])).every(v => !v) && M.openingWidth(st) >= 12 - 1e-6,
        solve: st => { LEGS.forEach(l => { st.v[l] = GOOD.leg; }); },
        focus: 'leg1',
      },
      {
        id: 'm2', title: 'Hide the lights',
        text: 'The electrics (bars of lights) hang just upstage of each border. The borders are too high: the front row sees the lamps. Lower the borders until no seat sees an electric, but keep the bottom of every border at 7.2 m or higher so the stage picture stays tall.',
        how: ['Switch the seat view to <b>Stalls, front row</b>: it looks up the most.', 'Select a border and lower it with <kbd>G</kbd> (the value is the height of its bar; the border is 5 m tall).', 'Check the list: every electric must say "hidden".'],
        why: 'Borders (bambalinas) and legs (patas) frame the stage like a series of doors. Raising them shows more stage but also more machinery.',
        seat: 'front', lights: true,
        show: [...MASKING, ...ELECTRICS, 'forest'],
        start: () => { const st = stateWith(masked({ forest: 12 })); BORDERS.forEach(b => { st.v[b] = 15; }); return st; },
        check: st => ELECTRICS.every(e => M.hidden(e, st, [...MASKING, ...ELECTRICS, 'forest'])) && M.lowestBorder(st) >= 7.2 - 1e-6,
        solve: st => { BORDERS.forEach(b => { st.v[b] = GOOD.border; }); },
        focus: 'border1',
      },
    ],
  },
  {
    id: 'change', name: 'Scene change', sub: 'Everything at once',
    steps: [
      {
        id: 'c1', title: 'From the forest to the palace',
        text: 'Scene change with the curtain down. The forest (backdrop and wagon) goes out; the palace comes in: its wagon from the rear stage to the centre of the stage (-11 m), and its backdrop in (bar at 12 m). The machines stop if something is in the way: find the right order.',
        how: ['Fly the <b>Forest backdrop</b> out (21 m or more).', 'Send the <b>Forest wagon</b> to the wing (17 m) before the palace wagon comes.', 'Bring the <b>Palace wagon</b> forward to -11 m, then fly the <b>Palace backdrop</b> in to 12 m.'],
        why: 'Every scene change is a sequence: pieces that cross each other\'s path must move in the right order. The stage manager writes it as a list of cues.',
        seat: 'front', change: true,
        show: ['forest', 'palace', 'hell', 'wForest', 'wPalace', ...PLATS, ...MASKING],
        start: () => stateWith(masked({ forest: 12, palace: 25, hell: 25, wForest: 0, wPalace: -29 })),
        targets: [['forest', 'out'], ['palace', 'in'], ['wForest', 17], ['wPalace', -11]],
        check: (st, c) => changeDone(c.step, st),
        solve: st => { Object.assign(st.v, { forest: 25, wForest: 17, wPalace: -11, palace: 12 }); },
      },
      {
        id: 'c2', title: 'Down to hell',
        text: 'Last scene: the palace goes back to the rear stage, the hell backdrop comes in (12 m) and the statue sinks under the stage (its top below the floor).',
        how: ['Fly the <b>Palace backdrop</b> out.', 'Send the <b>Palace wagon</b> back to the rear stage (-29 m).', 'Fly the <b>Hell backdrop</b> in and lower <b>Platform 2</b> with the statue.'],
        why: 'A big opera house moves several tonnes of scenery in less than a minute, safely, because each move has its place in the sequence.',
        seat: 'front', change: true,
        show: ['forest', 'palace', 'hell', 'wForest', 'wPalace', 'statue', ...PLATS, ...MASKING],
        start: () => stateWith(masked({ forest: 25, palace: 12, hell: 25, wForest: 17, wPalace: -11 })),
        targets: [['palace', 'out'], ['hell', 'in'], ['wPalace', -29], ['statue', 'down']],
        check: (st, c) => changeDone(c.step, st),
        solve: st => { Object.assign(st.v, { palace: 25, wPalace: -29, hell: 12, plat1: -4 }); },
      },
    ],
  },
];

// Is one target of a scene change reached?
export function targetDone(step, st, [id, want]) {
  if (want === 'out') return M.hidden(id, st, step.show);
  if (want === 'in') return near(st.v[id], M.PIECES[id].h, 0.05);
  if (want === 'down') return M.boxes(id, st)[0].y1 <= -0.2;
  return near(st.v[id], want, 0.25);
}
export const changeDone = (step, st) => step.targets.every(t => targetDone(step, st, t)) && !M.conflict(st, step.show);
export { BORDERS, LEGS, ELECTRICS, PLATS, MASKING };
