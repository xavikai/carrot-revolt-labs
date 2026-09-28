// Color Grading Lab: stages, steps and checks. Pure JS (tested with node).
import { defaultNode, gradeImage, regionMean, levels, balance, chroma, scopeAngle, angleDiff, SKIN_LINE, luma, rgbPuck, keyImage } from './grade.js?v=1';
import { shot, REG } from './shots.js?v=1';

export const MW = 160, MH = 90;                     // the checks measure a small copy of the shot
const clone = o => JSON.parse(JSON.stringify(o));
export function defaultState() { return { shot: 'intA', nodes: [defaultNode('01')], sel: 0, flags: {}, quiz: 0, scope: 'waveform', palette: 'wheels', view: 'graded', wipe: false }; }
export function startState(step) {
  const s = Object.assign(defaultState(), clone(step.start || {}), { flags: {} });
  if (step.setup) step.setup(s);
  return s;
}
// Measure the graded shot (small copy): levels and the means of every region.
const mcache = new Map();
export function measure(st, nodes = st.nodes, id = st.shot) {
  const key = id + JSON.stringify(nodes); if (mcache.has(key)) return mcache.get(key);
  const img = shot(id, MW, MH), data = gradeImage(img, nodes), m = { ...levels(data), reg: {} };
  for (const [k, v] of Object.entries(REG)) m.reg[k] = regionMean(data, img.mask, v);
  if (mcache.size > 200) mcache.clear(); mcache.set(key, m); return m;
}
export const levelsOk = m => m.black >= -0.005 && m.black <= 0.06 && m.white >= 0.88 && m.white <= 1.0;
export const greyOk = (m, tol = 0.012) => balance(m.reg.grey) <= tol;
export const skinOk = m => angleDiff(scopeAngle(...m.reg.skin), SKIN_LINE) <= 6;
export const skinChromaOk = m => { const c = chroma(m.reg.skin); return c >= 0.115 && c <= 0.16; };
export const cardMidOk = m => { const y = luma(...m.reg.grey); return y >= 0.4 && y <= 0.52; };

// ─── Solvers (used by "Show a solution" and by the tests) ────────────────────
// Lift and Gain masters of node i so the black point is `b` and the white point `w`.
export function fitLevels(st, i = st.sel, b = 0.025, w = 0.95) {
  const n = st.nodes[i];
  for (let it = 0; it < 30; it++) {
    const m = measure(st), eb = m.black - b, ew = m.white - w;
    if (Math.abs(eb) < 0.004 && Math.abs(ew) < 0.004) break;
    n.gain.m += -ew * 1.1; n.lift.m += -eb * 1.2;
  }
  return st;
}
// Move a wheel's puck until a region is neutral (grey card) or on a hue.
export function fitNeutral(st, wheelName = 'gain', region = 'grey', i = st.sel) {
  const n = st.nodes[i];
  for (let it = 0; it < 40; it++) {
    const c = measure(st).reg[region], d = rgbPuck(...c);
    if (Math.hypot(d.x, d.y) < 0.0015) break;
    n[wheelName].x -= d.x * 1.6; n[wheelName].y -= d.y * 1.6;
  }
  return st;
}
export function fitSaturation(st, target = 0.13, i = st.sel) {
  const n = st.nodes[i];
  for (let it = 0; it < 30; it++) { const c = chroma(measure(st).reg.skin); if (Math.abs(c - target) < 0.003) break; n.sat = Math.max(0, Math.min(100, n.sat * target / Math.max(0.01, c))); }
  return st;
}
// The balanced first node of the interview (levels, grey card, saturation): the start of later steps.
let balancedA = null;
export function balancedNode() {
  if (balancedA) return clone(balancedA);
  const s = defaultState(); fitLevels(s, 0); fitNeutral(s, 'gain', 'grey', 0); fitLevels(s, 0); fitNeutral(s, 'gain', 'grey', 0); fitSaturation(s, 0.13, 0);
  balancedA = s.nodes[0]; return clone(balancedA);
}
// The graded A camera the B camera has to match.
export const referenceA = () => [balancedNode()];
export function matchReport(st) {
  const a = measure({ shot: 'intA', nodes: referenceA() }), b = measure(st);
  const sa = a.reg.skin, sb = b.reg.skin;
  return { dAngle: angleDiff(scopeAngle(...sa), scopeAngle(...sb)), dLuma: luma(...sb) - luma(...sa), dChroma: chroma(sb) - chroma(sa), dWall: luma(...b.reg.wall) - luma(...a.reg.wall), black: b.black, a, b };
}
export const matchOk = r => r.dAngle <= 5 && Math.abs(r.dLuma) <= 0.03 && Math.abs(r.dChroma) <= 0.02 && Math.abs(r.dWall) <= 0.06 && r.black <= 0.09 && r.black >= -0.005;
export function fitMatch(st, i = 0) {
  const n = st.nodes[i];
  for (let it = 0; it < 60; it++) {
    const r = matchReport(st); if (matchOk(r) && r.dAngle < 2 && Math.abs(r.dLuma) < 0.01 && Math.abs(r.black - 0.04) < 0.01) break;
    const sb = r.b.reg.skin, sa = r.a.reg.skin, pa = rgbPuck(...sa), pb = rgbPuck(...sb);
    n.gain.x += (pa.x - pb.x) * 1.2; n.gain.y += (pa.y - pb.y) * 1.2; n.gain.m -= r.dLuma * 1.4; n.lift.m -= (r.black - 0.04) * 1.1;
    n.sat = Math.max(0, Math.min(100, n.sat * (1 - r.dChroma * 3)));
  }
  return st;
}
// Qualifier on the sky: how much of the sky it keys and how much of the rest.
export function keyReport(st, i = st.sel, id = st.shot) {
  const img = shot(id, MW, MH), input = { w: img.w, h: img.h, data: gradeImage(img, st.nodes.slice(0, i)) }, k = keyImage(input, st.nodes[i]);
  let inS = 0, nS = 0, out = 0, nO = 0, face = 0, nF = 0;
  for (let p = 0; p < k.length; p++) {
    const r = img.mask[p];
    if (r === REG.sky) { inS += k[p]; nS++; } else { out += k[p]; nO++; }
    if (r === REG.skin || r === REG.face) { face += k[p]; nF++; }
  }
  return { sky: nS ? inS / nS : 0, rest: nO ? out / nO : 0, face: nF ? face / nF : 0 };
}

// ─── Quizzes ─────────────────────────────────────────────────────────────────
export function answerQuiz(st, list, a) {
  const item = list[st.quiz | 0]; if (!item) return { ok: false, item: list[list.length - 1] };
  const ok = a === item.a; if (ok) st.quiz = (st.quiz | 0) + 1; return { ok, item };
}
export const WAVE_QUIZ = [
  { q: 'On the Waveform, where are the darkest parts of this shot (the bookshelf)?', opts: ['At 0, true black', 'Around 15–20: lifted, the picture is flat', 'Below 0: crushed'], a: 1, why: 'Cameras record flat (log) pictures to keep detail: nothing reaches 0. The grade has to bring the blacks down.' },
  { q: 'And the brightest part, the window?', opts: ['Above 100: clipped', 'Around 70–75: it could be much brighter', 'Exactly 100'], a: 1, why: 'The window is the brightest thing in the room but sits at about 70: the contrast is still in the file, waiting to be stretched.' },
];
export const PARADE_QUIZ = [
  { q: 'Look at the grey card on the Parade (the small flat line in the lower middle of each channel). Which channel is the highest?', opts: ['Red', 'Green', 'Blue'], a: 2, why: 'The card is neutral grey, so its three lines should be level. Blue is highest: the shot is too cool (the camera was set to a warmer white balance than the light).' },
  { q: 'On the Vectorscope, where does the skin sit compared to the skin tone line?', opts: ['On the line', 'Rotated towards red and magenta', 'Rotated towards yellow and green'], a: 1, why: 'The skin cluster points a little under the line, towards red and magenta, and it is very short: low saturation. Balance first, then check it again.' },
];
export const MATCH_QUIZ = [
  { q: 'In which order do you normally work on a shot?', opts: ['Look first, then balance', 'Balance (levels, white), then the look, then secondaries', 'Secondaries first'], a: 1, why: 'A look or a LUT expects a normal, balanced picture. If you balance after the look, every shot needs a different look.' },
  { q: 'Where does a creative LUT go in the node tree?', opts: ['On node 01, before any correction', 'On a node after the balance node', 'On every node'], a: 1, why: 'Creative LUTs are built for balanced Rec.709 pictures. Put the balance first and the LUT in a later node, so you can change one without the other.' },
  { q: 'The shot is for broadcast television. Where must the levels stay?', opts: ['Anywhere, the TV fixes it', 'Between 0 and 100 on the Waveform (legal levels)', 'Between 20 and 80'], a: 1, why: 'Broadcast has legal limits: below 0 or above 100 can be clipped or rejected by the channel. Resolve can also clamp them in the output settings.' },
  { q: 'The sky is too pale, but only the sky. What do you use?', opts: ['Saturation of the whole node', 'A qualifier (and maybe a window) on a new node', 'A different LUT'], a: 1, why: 'A secondary correction: key the sky with the qualifier, limit it with a window if needed, and grade only what is inside the key.' },
];

export const STAGES = [
  {
    id: 'scopes', name: 'Read the scopes', sub: 'Waveform · Parade · Vectorscope',
    steps: [
      {
        id: 's1', title: 'The Waveform',
        text: 'Monitors lie; scopes do not. The Waveform draws every column of the picture as a column of dots: the higher a dot, the brighter that pixel, from 0 (black) to 100 (white). This interview was shot in a flat, log-like mode: look at where its darkest and brightest parts land.',
        how: ['In the <b>Scopes</b> panel, keep <b>Waveform</b>. Move the pointer over the viewer: a line marks the same column on the Waveform.', 'Find the bookshelf (dark, on the right) and the window (bright, on the left) on the Waveform.', 'Answer the two questions.'],
        why: 'The Waveform tells you the real levels. In a flat picture nothing reaches 0 or 100: the contrast is there, but you have to stretch it.',
        start: { shot: 'intA', scope: 'waveform' },
        check: s => (s.quiz | 0) >= WAVE_QUIZ.length,
        solve: s => { s.quiz = WAVE_QUIZ.length; },
      },
      {
        id: 's2', title: 'Parade and Vectorscope',
        text: 'The Parade is a Waveform for each channel side by side: red, green and blue. Anything neutral (white, grey, black) must have the three at the same height. The Vectorscope forgets brightness and shows colour: the angle is the hue, the distance from the centre is the saturation. The diagonal line is the skin tone indicator: skin of any people lies close to it.',
        how: ['Switch the scope to <b>Parade</b> and find the grey card on the desk.', 'Switch to <b>Vectorscope</b>: the small cluster near the centre is mostly the skin, the wall and the card.', 'Answer the two questions.'],
        why: 'A grey card in the shot is the colourist\'s best friend: it tells you exactly how much each channel is off.',
        start: { shot: 'intA', scope: 'parade' },
        check: s => (s.quiz | 0) >= PARADE_QUIZ.length,
        solve: s => { s.quiz = PARADE_QUIZ.length; },
      },
    ],
  },
  {
    id: 'primary', name: 'Primary correction', sub: 'Lift · Gamma · Gain · white balance',
    steps: [
      {
        id: 'p1', title: 'Blacks and whites',
        text: 'The Color Wheels of Resolve work on tonal ranges. Lift moves the blacks (and less and less towards white), Gain scales the whites (and less towards black), Gamma bends the middle, Offset moves everything. Use the master dials under Lift and Gain: bring the darkest parts close to 0 and the window close to 100, without clipping.',
        how: ['In the <b>Color Wheels</b> palette, drag the master dial under <b>Lift</b> to the left: the bottom of the Waveform goes down.', 'Drag the master dial under <b>Gain</b> to the right: the top goes up.', 'Aim for blacks at 0–6 and whites at 88–100 (see the <b>Levels</b> readout). Adjust Lift again: each one moves the other a little.'],
        why: 'Setting the black and white points first gives the picture its full contrast. Everything else (colour, look) is easier on a picture that uses the whole range.',
        start: { shot: 'intA', scope: 'waveform' },
        check: s => levelsOk(measure(s)),
        solve: s => { fitLevels(s, 0); },
      },
      {
        id: 'p2', title: 'A neutral grey card',
        text: 'The levels are right, but the picture is blue: on the Parade, the grey card has blue above red. Move the colour puck of the Gain wheel (or of Offset) away from blue, towards yellow and red, until the three lines of the card are level. Watch the skin on the Vectorscope move to its line.',
        how: ['Switch the scope to <b>Parade</b>.', 'Drag the puck in the centre of the <b>Gain</b> wheel towards orange (between red and yellow). The numbers under the wheel show R G B.', 'Stop when the grey card is neutral (the <b>Grey card</b> readout turns green). Check the levels again.'],
        why: 'A neutral reference fixes the white balance for everything lit by the same light. Resolve also has a picker (the colour picker of the wheels) that does this in one click on the card.',
        start: { shot: 'intA', scope: 'parade' },
        setup: s => { fitLevels(s, 0); },
        check: s => { const m = measure(s); return greyOk(m) && levelsOk(m); },
        solve: s => { fitNeutral(s, 'gain', 'grey', 0); fitLevels(s, 0); fitNeutral(s, 'gain', 'grey', 0); },
      },
      {
        id: 'p3', title: 'Contrast and saturation',
        text: 'The picture is balanced but still pale: log footage stores colour at low saturation. Raise Saturation until the skin looks alive, not orange. Use the Vectorscope: the skin cluster should grow along its line, to about a third of the way to the small target boxes. Keep the grey card neutral and in the middle of the Waveform.',
        how: ['In the <b>Color Wheels</b> palette, raise <b>Sat</b> (50 is the neutral value).', 'Switch to the <b>Vectorscope</b> and watch the skin grow along the line.', 'Readouts: skin saturation in the green range, grey card neutral, card level 40–52.'],
        why: 'Saturation multiplies the distance from the centre of the Vectorscope: grey stays grey, colours grow. Too much and skin turns orange first.',
        start: { shot: 'intA', scope: 'vectorscope' },
        setup: s => { fitLevels(s, 0); fitNeutral(s, 'gain', 'grey', 0); fitLevels(s, 0); fitNeutral(s, 'gain', 'grey', 0); },
        check: s => { const m = measure(s); return skinChromaOk(m) && greyOk(m, 0.015) && cardMidOk(m) && levelsOk(m) && skinOk(m); },
        solve: s => { fitSaturation(s, 0.13, 0); },
      },
    ],
  },
  {
    id: 'nodes', name: 'Nodes and the look', sub: 'Serial nodes · LUT · Curves',
    steps: [
      {
        id: 'n1', title: 'A node for the look',
        text: 'Node 01 holds the balance. Resolve works with nodes: each one is a full set of tools, applied one after the other (serial). Keep the balance in node 01 and build the look in a new node. Add a Serial node and give it a creative LUT: Film Print.',
        how: ['In the <b>Node Editor</b>, select node 01 and press <b>+ Serial</b> (<kbd>Alt</kbd> <kbd>S</kbd> in Resolve).', 'With node 02 selected, open the <b>LUTs</b> palette and choose <b>Film Print (2383 style)</b>.', 'Toggle node 02 on and off (<kbd>Ctrl</kbd> <kbd>D</kbd>) to compare: before and after.'],
        why: 'Separating balance and look means you can match many shots in their own node 01 and share the same look node between them.',
        start: { shot: 'intA', scope: 'vectorscope' },
        setup: s => { s.nodes = [balancedNode()]; },
        check: s => s.nodes.length >= 2 && s.nodes.slice(1).some(n => n.on && n.lut?.id === 'film') && !s.nodes[0].lut && levelsOk(measure(s, s.nodes.slice(0, 1))),
        solve: s => { if (s.nodes.length < 2) s.nodes.push(defaultNodeLike('02')); s.nodes[1].lut = { id: 'film', mix: 1 }; s.nodes[1].on = true; s.sel = 1; },
      },
      {
        id: 'n2', title: 'An S curve',
        text: 'Curves give precise control of contrast. In the Custom curve, lower a point in the shadows and raise a point in the highlights: an S. The middle stays, the ends spread. Do it on node 03, after the LUT, and keep the blacks and whites inside 0–100.',
        how: ['Add a <b>Serial</b> node after node 02 and open the <b>Curves</b> palette.', 'Click on the curve to add a point near a quarter and drag it down a little; add a point near three quarters and drag it up.', 'Watch the Waveform: the blacks must not go below 0 and the whites not above 100.'],
        why: 'An S curve adds contrast without moving mid grey, which keeps skin and the balance where they were. Curves are also how many LUTs are built.',
        start: { shot: 'intA', scope: 'waveform' },
        setup: s => { s.nodes = [balancedNode(), { ...defaultNodeLike('02'), lut: { id: 'film', mix: 1 } }]; s.sel = 1; },
        check: s => s.nodes.length >= 3 && s.nodes.slice(2).some(n => n.on && isSCurve(n.curve)) && (() => { const m = measure(s); return m.black >= -0.005 && m.white <= 1.0; })(),
        solve: s => { if (s.nodes.length < 3) s.nodes.push(defaultNodeLike('03')); s.nodes[2].curve = [[0, 0], [0.25, 0.2], [0.75, 0.8], [1, 1]]; s.sel = 2; },
      },
    ],
  },
  {
    id: 'secondary', name: 'Secondaries', sub: 'Qualifier · Power Window',
    steps: [
      {
        id: 'q1', title: 'Qualifier: only the sky',
        text: 'A secondary correction changes only part of the picture. The HSL Qualifier makes a key from a range of hue, saturation and luminance. This exterior is balanced, but the sky is pale. On node 02, key the blue of the sky (not the clouds, not the building), then deepen it with Saturation and a little Gamma down.',
        how: ['Select node 02 and open the <b>Qualifier</b> palette. Set the <b>Hue</b> centre on blue and adjust the width, <b>Sat</b> and <b>Lum</b> ranges.', 'Turn on <b>Highlight</b> (<kbd>Shift</kbd> <kbd>H</kbd>): what is not keyed turns grey. Aim for most of the sky and almost nothing else.', 'Then, in <b>Color Wheels</b>, raise <b>Sat</b> and lower the <b>Gamma</b> master a little: only the sky changes.'],
        why: 'Qualifiers key colours; windows key places. Together they let you grade one thing without touching the rest.',
        start: { shot: 'ext', scope: 'vectorscope', palette: 'qualifier' },
        setup: s => { s.nodes = [defaultNode('01'), defaultNodeLike('02')]; fitLevels(s, 0, 0.03, 0.93); s.sel = 1; },
        check: s => { const n = s.nodes[s.sel] || s.nodes[1]; if (!n || !n.qual) return false; const k = keyReport(s, s.nodes.indexOf(n)); const before = measure(s, s.nodes.slice(0, 1)).reg.sky, after = measure(s).reg.sky; return k.sky >= 0.8 && k.rest <= 0.08 && chroma(after) >= chroma(before) * 1.25; },
        solve: s => { const n = s.nodes[1]; n.qual = { h: 205, hw: 40, s0: 0.25, s1: 1, l0: 0.4, l1: 0.95, soft: 0.1 }; n.sat = 80; n.gamma.m = -0.08; s.sel = 1; },
      },
      {
        id: 'q2', title: 'Power Window: light the face',
        text: 'The face is a little darker than the window behind: the eye goes to the brightest part of a picture. A Power Window limits a node to a shape. Add a node, draw a Circle on the face with a soft edge and lift the Gamma inside: the face gets brighter, the room stays as it was.',
        how: ['Add a <b>Serial</b> node and open the <b>Window</b> palette. Press <b>Circle</b>.', 'Drag the circle in the viewer onto the face; adjust <b>Size</b>, <b>Aspect</b> and <b>Soft</b> so it covers the face and fades out.', 'In <b>Color Wheels</b>, raise the <b>Gamma</b> master a little inside the window.'],
        why: 'In Resolve the window can also track the face when it moves (the Tracker palette). Soft edges hide the trick.',
        start: { shot: 'intA', scope: 'waveform', palette: 'window' },
        setup: s => { s.nodes = [balancedNode()]; s.sel = 0; },
        check: s => { if (s.nodes.length < 2) return false; const i = s.nodes.findIndex((n, k) => k > 0 && n.win && n.on); if (i < 0) return false; const base = measure(s, s.nodes.slice(0, i)), m = measure(s); const dFace = luma(...m.reg.skin) - luma(...base.reg.skin), dWall = Math.abs(luma(...m.reg.wall) - luma(...base.reg.wall)); const k = keyReport(s, i); return dFace >= 0.03 && dWall <= 0.015 && k.face >= 0.6; },
        solve: s => { if (s.nodes.length < 2) s.nodes.push(defaultNodeLike('02')); const n = s.nodes[1]; n.win = { cx: 0.47, cy: 0.37, rx: 0.13, ry: 0.19, soft: 0.35, invert: false }; n.gamma.m = 0.12; s.sel = 1; },
      },
    ],
  },
  {
    id: 'match', name: 'Shot matching', sub: 'Gallery still · split screen',
    steps: [
      {
        id: 'm1', title: 'Match the B camera',
        text: 'The close-up comes from a second camera: darker and more magenta. It has to cut with the graded wide shot. On the left of the split screen is a still of the graded A camera (from the Gallery); on the right, your B camera. Balance node 01 of the B camera until the skin and the wall match.',
        how: ['Keep <b>Split</b> on in the viewer: A camera on the left, B camera on the right.', 'Use <b>Lift</b>, <b>Gain</b> and the Gain puck; compare the skin on the Vectorscope and the Parade.', 'The <b>Match</b> readout compares the skin (hue, level, saturation) and the wall level of both shots.'],
        why: 'Viewers notice when the same face changes colour between two cuts. Skin is the first thing to match, then the neutral areas.',
        start: { shot: 'intB', scope: 'vectorscope', wipe: true },
        check: s => matchOk(matchReport(s)),
        solve: s => { fitMatch(s, 0); },
      },
      {
        id: 'm2', title: 'Colourist decisions',
        text: 'Four questions from real jobs. Choose the answer.',
        how: ['Read the case.', 'Choose an answer.', 'Read why.'],
        why: 'Grading is a craft with an order and rules; the look is where you break them on purpose.',
        start: { shot: 'intA', scope: 'waveform' },
        setup: s => { s.nodes = [balancedNode(), { ...defaultNodeLike('02'), lut: { id: 'film', mix: 1 } }]; },
        check: s => (s.quiz | 0) >= MATCH_QUIZ.length,
        solve: s => { s.quiz = MATCH_QUIZ.length; },
      },
    ],
  },
];
function defaultNodeLike(label) { return defaultNode(label); }
// An S curve: at least one point clearly below the diagonal in the shadows and one above in the highlights.
export function isSCurve(c) { return c.some(([x, y]) => x > 0.08 && x < 0.45 && y < x - 0.02) && c.some(([x, y]) => x > 0.55 && x < 0.92 && y > x + 0.02); }
export { REG, SKIN_LINE };
