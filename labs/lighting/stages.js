// Stages of the Lighting Lab. Every step loads its own lights; checks read the light meter (measure).
import { measure, apparentSize, lightPos } from './light.js';

export const LIGHT_IDS = ['key', 'fill', 'rim', 'bg'];
export const LIGHT_NAMES = { key: 'Key_Light', fill: 'Fill_Light', rim: 'Rim_Light', bg: 'BG_Light', card: 'Bounce_Card' };
const light = o => ({ on: true, type: 'AREA', power: 12, strength: 1, colorMode: 'rgb', color: [1, 1, 1], kelvin: 5500, radius: 0.1, angle: 1, spotSize: 45, blend: 0.15, shape: 'SQUARE', size: 0.6, sizeY: 0.6, az: -45, el: 30, dist: 1.5, target: 'head', shadow: true, ...o });
export function defaultState() {
  return {
    lights: {
      key: light({}),
      fill: light({ on: false, az: 55, el: 10, size: 1, sizeY: 1, power: 3 }),
      rim: light({ on: false, az: 150, el: 35, dist: 1.3, size: 0.3, sizeY: 0.3, power: 6 }),
      bg: light({ on: false, type: 'SPOT', target: 'backdrop', az: 0, el: 20, dist: 1.1, spotSize: 130, blend: 1, power: 60, radius: 0.05 }),
    },
    card: { on: false, color: 'white', size: 1, az: 60, el: -20, dist: 0.7 },
    world: { mode: 'color', color: [0.05, 0.05, 0.05], strength: 1, hdri: 'studio', rot: 0 },
    view: { exposure: 0, transform: 'AgX' },
    backdrop: 'grey',
    sel: 'key',
  };
}
const merge = (a, b) => { for (const [k, v] of Object.entries(b)) { if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object') merge(a[k], v); else a[k] = JSON.parse(JSON.stringify(v)); } return a; };

// Find the value of a setting that brings a measurement to a target (bisection; the measurement must grow with the value).
function tune(s, set, get, target, lo, hi) {
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; set(s, mid); if (get(measure(s)) < target) lo = mid; else hi = mid; }
  set(s, (lo + hi) / 2);
}
const facePlus1 = (s, id) => tune(s, (x, v) => { x.lights[id].type === 'SUN' ? x.lights[id].strength = v : x.lights[id].power = v; }, m => m.faceStops, 1, 0, 20000);
// Fill power for a ratio key side : other side (the key side is the side of the key light).
const ratioTo = (s, id, r) => { const kL = s.lights.key.az < 0; tune(s, (x, v) => { x.lights[id].power = v; }, m => (kL ? m.E.camR.total / m.E.camL.total : m.E.camL.total / m.E.camR.total), 1 / r, 0, 4 * s.lights.key.power); };
const round = v => Math.round(v * 100) / 100;
const faceOk = (m, tol = 0.35) => Math.abs(m.faceStops - 1) <= tol;
const sign = v => (v > 0 ? 1 : v < 0 ? -1 : 0);
const within = (v, a, b) => v >= a && v <= b;
const onlyKey = { fill: { on: false }, rim: { on: false }, bg: { on: false } };

export const STAGES = [
  {
    id: 'types', name: 'Types of light', sub: 'Point · Sun · Spot · Area',
    steps: [
      {
        id: 't1', title: 'Twice as far',
        text: 'A Point light shines in every direction, like a bare bulb. Its light spreads over a sphere that grows with the distance, so at twice the distance the same light covers four times the area: the face gets a quarter of the light (the inverse square law). The meter shows the plaster of the face at +1 stop over middle grey. Move the light to 2 m and bring the face back to +1.',
        how: ['Select <b>Key_Light</b>. In the Light panel, set <b>Distance</b> to 2 m: the face drops about 2 stops.', 'Raise <b>Power</b> until the meter shows the face at +1 again (about four times the power).', 'Look at the backdrop: it is 1.2 m behind the bust, so moving the light away makes it much closer in brightness to the face.'],
        why: 'The inverse square law explains why a light close to the subject makes the background fall into darkness, and a light far away lights both evenly.',
        start: { lights: { key: { type: 'POINT', power: 40, radius: 0.05, az: -40, el: 25, dist: 1 }, ...onlyKey } },
        check: (s, m) => s.lights.key.type === 'POINT' && s.lights.key.dist >= 1.9 && faceOk(m, 0.25),
        solve: s => { s.lights.key.dist = 2; facePlus1(s, 'key'); s.lights.key.power = round(s.lights.key.power); },
      },
      {
        id: 't2', title: 'The Sun does not fall off',
        text: 'A Sun light is so far away that its rays arrive parallel: only its angle matters, not its position, and its Strength is given in W/m² instead of watts. Turn the key into a Sun from the same direction and set the Strength so the face is at +1 stop again. Then compare the backdrop: with a Sun it is as bright as the light and the angle allow, with no falloff.',
        how: ['Change the <b>Type</b> of Key_Light to <b>Sun</b>.', 'Set <b>Strength</b> until the face reads +1 stop.', 'Try different distances: nothing changes. Only Azimuth and Elevation do.'],
        why: 'Sunlight and moonlight light every part of the set with the same strength. Shadows are parallel.',
        start: { lights: { key: { type: 'POINT', power: 160, radius: 0.05, az: -40, el: 25, dist: 2 }, ...onlyKey } },
        check: (s, m) => s.lights.key.type === 'SUN' && faceOk(m, 0.25),
        solve: s => { s.lights.key.type = 'SUN'; s.lights.key.angle = 1; facePlus1(s, 'key'); s.lights.key.strength = round(s.lights.key.strength); },
      },
      {
        id: 't3', title: 'A spot on the face',
        text: 'A Spot light is a point light inside a cone. Spot Size is the width of the cone and Blend softens its edge. Light only the head, like a theatre spotlight: the backdrop around the bust must fall to less than a tenth of the light on the face.',
        how: ['Key_Light is already a <b>Spot</b> with a very wide cone.', 'Reduce <b>Spot Size</b> until the backdrop darkens but the whole face stays lit.', 'Give it some <b>Blend</b> for a soft edge, and check the face is still at +1.'],
        why: 'A spot controls where the light goes. In Blender, narrowing the cone does not make the light brighter: the power is the same as a point light.',
        start: { lights: { key: { type: 'SPOT', power: 170, radius: 0.03, spotSize: 100, blend: 0.1, az: -40, el: 25, dist: 2 }, ...onlyKey } },
        check: (s, m) => {
          const k = s.lights.key, E = m.E;
          if (k.type !== 'SPOT' || k.blend < 0.05) return false;
          const onFace = Math.max(E.camL.per.key, E.camR.per.key), onBack = Math.max(E.backL.per.key, E.backR.per.key, E.backC.per.key);
          return onBack <= 0.1 * onFace && faceOk(m, 0.4);
        },
        solve: s => { Object.assign(s.lights.key, { spotSize: 22, blend: 0.25 }); facePlus1(s, 'key'); s.lights.key.power = round(s.lights.key.power); },
      },
      {
        id: 't4', title: 'An Area light',
        text: 'An Area light is a glowing panel, like a softbox or a window. It only lights what is in front of it, and it lights more on its axis than to the sides. With the same power, it puts more light on the face than a point light at the same distance, because it does not waste light backwards. Turn the key into a tall rectangular softbox and bring the face back to +1 stop.',
        how: ['Change the <b>Type</b> of Key_Light to <b>Area</b> and the <b>Shape</b> to <b>Rectangle</b>.', 'Make it tall: <b>Size X</b> 0.6 m and <b>Size Y</b> 1 m, for example.', 'Lower the <b>Power</b> until the face is at +1 stop.'],
        why: 'Most studio and product lighting is done with area lights: they behave like real softboxes and windows.',
        start: { lights: { key: { type: 'POINT', power: 90, radius: 0.03, az: -40, el: 25, dist: 1.5 }, ...onlyKey } },
        check: (s, m) => s.lights.key.type === 'AREA' && s.lights.key.shape === 'RECTANGLE' && s.lights.key.sizeY > s.lights.key.size && faceOk(m, 0.3),
        solve: s => { Object.assign(s.lights.key, { type: 'AREA', shape: 'RECTANGLE', size: 0.6, sizeY: 1 }); facePlus1(s, 'key'); s.lights.key.power = round(s.lights.key.power); },
      },
    ],
  },
  {
    id: 'soft', name: 'Hard and soft', sub: 'Size and distance',
    steps: [
      {
        id: 'h1', title: 'Bigger is softer',
        text: 'The shadow of a tiny light has a sharp edge: every point of the shadow either sees the light or not. A big light is partly hidden at the edge of the shadow, so the edge becomes a soft gradient (the penumbra). What counts is the apparent size of the light seen from the subject. Make the key look at least 20° wide from the face, and keep the face at +1 stop.',
        how: ['Look at the shadow of the nose and the shadow of the bust on the backdrop.', 'Raise the <b>Radius</b> of the point light, or change it to an <b>Area</b> light and raise its <b>Size</b>. The meter shows the apparent size in degrees.', 'Adjust the <b>Power</b> to keep the face at +1 stop.'],
        why: 'Soft light is flattering and forgiving; hard light gives drama and texture. Choosing the size of the source is choosing the character of the image.',
        start: { lights: { key: { type: 'POINT', power: 90, radius: 0.01, az: -45, el: 30, dist: 1.5 }, ...onlyKey } },
        check: (s, m) => apparentSize(s.lights.key) >= 20 && faceOk(m),
        solve: s => { Object.assign(s.lights.key, { type: 'AREA', shape: 'SQUARE', size: 0.6, sizeY: 0.6 }); facePlus1(s, 'key'); s.lights.key.power = round(s.lights.key.power); },
      },
      {
        id: 'h2', title: 'Farther is harder',
        text: 'The same softbox gets harder as it moves away, because it looks smaller from the subject. The Sun is enormous, but so far away that it is only half a degree wide: its shadows are hard. Keep this 1 m softbox, move it away until it is no more than 8° wide, and bring the face back to +1 stop.',
        how: ['Keep <b>Size</b> at 1 m.', 'Raise <b>Distance</b> until the meter shows an apparent size of 8° or less.', 'Raise the <b>Power</b> a lot: remember the inverse square law.'],
        why: 'Distance changes both the brightness and the quality of the light. That is why a softbox is used close to the subject.',
        start: { lights: { key: { type: 'AREA', shape: 'SQUARE', size: 1, sizeY: 1, power: 7, az: -45, el: 30, dist: 1 }, ...onlyKey } },
        check: (s, m) => s.lights.key.type === 'AREA' && s.lights.key.size >= 0.95 && apparentSize(s.lights.key) <= 8 && faceOk(m),
        solve: s => { s.lights.key.dist = 8; facePlus1(s, 'key'); s.lights.key.power = round(s.lights.key.power); },
      },
      {
        id: 'h3', title: 'Match the reference',
        text: 'The small image in the corner of the render is a reference: one soft key light, from high up on the camera right. Read its shadows (the direction of the nose shadow, how soft the edge is) and rebuild it with the key light.',
        how: ['Where does the nose shadow fall? That tells you the <b>Azimuth</b> and <b>Elevation</b> of the key.', 'How soft is the edge? That tells you the apparent size (Size and Distance).', 'Keep the face at +1 stop. Compare with the reference.'],
        why: 'Reading the light of a photograph or a film frame and rebuilding it is the everyday job of a lighting artist.',
        reference: { lights: { key: { type: 'AREA', shape: 'SQUARE', size: 0.8, sizeY: 0.8, az: 50, el: 35, dist: 2, power: 0 }, ...onlyKey } },
        start: { lights: { key: { type: 'POINT', power: 150, radius: 0.02, az: -40, el: 15, dist: 2 }, ...onlyKey } },
        check: (s, m) => { const k = s.lights.key; return within(k.az, 38, 62) && within(k.el, 25, 45) && Math.abs(apparentSize(k) - 22.6) <= 6 && faceOk(m, 0.4); },
        solve: s => { Object.assign(s.lights.key, { type: 'AREA', shape: 'SQUARE', size: 0.8, sizeY: 0.8, az: 50, el: 35, dist: 2 }); facePlus1(s, 'key'); s.lights.key.power = round(s.lights.key.power); },
      },
    ],
  },
  {
    id: 'setups', name: 'Classic setups', sub: 'Three-point · portrait',
    steps: [
      {
        id: 'c1', title: 'Three-point lighting',
        text: 'The key light draws the shape. A fill light on the other side opens the shadows without creating new ones, and a rim (back) light from behind draws a bright edge that separates the head from the background. The ratio between the lit cheek and the shadow cheek sets the mood: 2:1 is soft, 4:1 is more dramatic.',
        how: ['Turn on <b>Fill_Light</b> (the eye in the Outliner). It must be on the other side of the camera from the key.', 'Set its <b>Power</b> so the <b>Ratio</b> is between 2:1 and 4:1 (1 to 2 stops).', 'Turn on <b>Rim_Light</b> behind the bust (Azimuth beyond 120°) and make the edge of the head at least as bright as 70% of the key side.'],
        why: 'Three-point lighting is the starting point of almost every portrait, interview and character render.',
        start: { lights: { key: { az: -45, el: 30, size: 0.6, sizeY: 0.6, power: 12 }, fill: { on: false }, rim: { on: false }, bg: { on: false } } },
        check: (s, m) => { const L = s.lights; return L.fill.on && sign(L.fill.az) === -sign(L.key.az) && within(m.ratio, 2, 4.5) && L.rim.on && Math.abs(L.rim.az) >= 120 && m.rim >= 0.7 * m.face; },
        solve: s => { const L = s.lights; L.fill.on = true; L.fill.az = -sign(L.key.az) * 55; L.rim.on = true; L.rim.az = -sign(L.key.az) * 150; ratioTo(s, 'fill', 3); tune(s, (x, v) => { x.lights.rim.power = v; }, m => m.rim / m.face, 0.9, 0, 500); L.fill.power = round(L.fill.power); L.rim.power = round(L.rim.power); },
      },
      {
        id: 'c2', title: 'Rembrandt',
        text: 'Rembrandt lighting puts the key high and about 45° to the side. The shadow of the nose meets the shadow of the cheek and leaves a small triangle of light under the eye on the dark side. The fill is weak: at least 4:1.',
        how: ['Move the key to an <b>Azimuth</b> of about ±45° and an <b>Elevation</b> of 30–55°.', 'Lower or turn off the fill until the <b>Ratio</b> is 4:1 or more.', 'Look for the triangle of light on the shadow cheek. Keep the face at +1 stop.'],
        why: 'It is named after the painter, who lit his portraits from a high window. It gives volume and drama with a single light.',
        start: { lights: { key: { az: -15, el: 10, size: 0.6, sizeY: 0.6, power: 3 }, fill: { on: true, power: 7 }, rim: { on: false }, bg: { on: false } } },
        check: (s, m) => { const k = s.lights.key; return within(Math.abs(k.az), 35, 60) && within(k.el, 30, 55) && m.ratio >= 4 && faceOk(m, 0.4); },
        solve: s => { Object.assign(s.lights.key, { az: -45, el: 40 }); s.lights.fill.on = false; facePlus1(s, 'key'); s.lights.key.power = round(s.lights.key.power); },
      },
      {
        id: 'c3', title: 'Butterfly',
        text: 'Butterfly (or Paramount) lighting puts the key right in front of the face and high above the camera. The shadow of the nose falls straight down in a small butterfly shape, both cheeks get the same light, and the cheekbones are shaped from above.',
        how: ['Set the key <b>Azimuth</b> close to 0° (within 10°).', 'Raise the <b>Elevation</b> to 35–60°.', 'Both cheeks must be almost equal (ratio 1.3:1 or less). Keep the face at +1 stop.'],
        why: 'The classic glamour light of Hollywood portraits. A reflector under the chin often softens the shadows.',
        start: { lights: { key: { az: -45, el: 40, size: 0.6, sizeY: 0.6, power: 12 }, fill: { on: false }, rim: { on: false }, bg: { on: false } } },
        check: (s, m) => { const k = s.lights.key; return Math.abs(k.az) <= 10 && within(k.el, 35, 60) && m.ratio <= 1.3 && faceOk(m, 0.4); },
        solve: s => { Object.assign(s.lights.key, { az: 0, el: 45 }); facePlus1(s, 'key'); s.lights.key.power = round(s.lights.key.power); },
      },
      {
        id: 'c4', title: 'Split and low key',
        text: 'Split lighting puts the key at 90°: exactly half of the face is lit and the other half falls into shadow. Combined with a dark background it becomes low key: mostly dark tones, mystery and tension.',
        how: ['Move the key to an <b>Azimuth</b> of about ±90° and a low <b>Elevation</b> (25° or less).', 'Turn off the fill and the background light: the <b>Ratio</b> must be 8:1 (3 stops) or more.', 'The backdrop must be at least 3 stops darker than the face: a black backdrop helps.'],
        why: 'Low key lighting is used for thrillers, villains and dramatic portraits: what you hide is as important as what you show.',
        start: { lights: { key: { az: -45, el: 30, size: 0.6, sizeY: 0.6, power: 12 }, fill: { on: true, power: 5 }, rim: { on: true, power: 5 }, bg: { on: true } }, backdrop: 'grey' },
        check: (s, m) => { const k = s.lights.key; return within(Math.abs(k.az), 75, 105) && k.el <= 25 && m.ratio >= 8 && m.backVsFace <= -3; },
        solve: s => { Object.assign(s.lights.key, { az: -90, el: 10 }); s.lights.fill.on = false; s.lights.bg.on = false; s.backdrop = 'black'; facePlus1(s, 'key'); s.lights.key.power = round(s.lights.key.power); },
      },
      {
        id: 'c5', title: 'High key',
        text: 'High key is the opposite: bright, low contrast images with a white background, used in advertising, e-commerce and comedy. The background is lit separately, brighter than the face, and the fill is strong.',
        how: ['Set the <b>Backdrop</b> to white and turn on <b>BG_Light</b>: the backdrop must be at least 1 stop brighter than the face.', 'Turn on the fill and raise it until the <b>Ratio</b> is 2:1 or less.', 'Keep the face at +1 stop.'],
        why: 'A separate background light lets you choose the tone of the background independently from the subject.',
        start: { lights: { key: { az: -90, el: 10, size: 0.6, sizeY: 0.6, power: 3 }, fill: { on: false }, rim: { on: false }, bg: { on: false } }, backdrop: 'black' },
        check: (s, m) => m.backVsFace >= 1 && m.ratio <= 2 && faceOk(m, 0.4),
        solve: s => { const L = s.lights; s.backdrop = 'white'; Object.assign(L.key, { az: -45, el: 30 }); L.fill.on = true; L.fill.az = 55; facePlus1(s, 'key'); ratioTo(s, 'fill', 1.5); facePlus1(s, 'key'); L.bg.on = true; tune(s, (x, v) => { x.lights.bg.power = v; }, m => m.backVsFace, 1.5, 0, 5000); for (const l of Object.values(L)) l.power = round(l.power); },
      },
    ],
  },
  {
    id: 'colour', name: 'Colour and world', sub: 'Kelvin · HDRI · bounce',
    steps: [
      {
        id: 'k1', title: 'Warm and cool',
        text: 'The colour of light is measured as a temperature in kelvin: a candle is about 1900 K, a tungsten bulb 3200 K, daylight about 5500–6500 K and a blue sky 10,000 K or more. A warm key with a cool fill or rim is a classic way to separate light from shadow with colour, not only with brightness.',
        how: ['Select Key_Light, set <b>Color</b> to <b>Blackbody</b> and a <b>Temperature</b> of 3500 K or lower.', 'Set the fill or the rim to Blackbody with 6500 K or higher.', 'Look at the grey ball: it shows the colour of each light without the colour of the plaster.'],
        why: 'Warm and cool contrast suggests a time of day, a place (a lamp inside, the sky outside) and an emotion.',
        start: { lights: { key: { az: -45, el: 30, power: 12 }, fill: { on: true, power: 4 }, rim: { on: true, power: 6 }, bg: { on: false } } },
        check: s => { const L = s.lights, warm = l => l.on && l.colorMode === 'kelvin' && l.kelvin <= 3500, cool = l => l.on && l.colorMode === 'kelvin' && l.kelvin >= 6500; return warm(L.key) && (cool(L.fill) || cool(L.rim)); },
        solve: s => { Object.assign(s.lights.key, { colorMode: 'kelvin', kelvin: 3200 }); Object.assign(s.lights.rim, { colorMode: 'kelvin', kelvin: 9000 }); Object.assign(s.lights.fill, { colorMode: 'kelvin', kelvin: 7000 }); },
      },
      {
        id: 'k2', title: 'Light with an HDRI',
        text: 'An HDRI is a 360° photograph of a real place with the full range of light, from the darkest shadow to the sun. Used as the World, it lights the scene from every direction and it is what the chrome ball reflects. Turn off the lights and light the bust only with the studio HDRI, with its big softbox on the camera left.',
        how: ['Turn off the three lights (the eye in the Outliner).', 'In <b>World</b>, choose <b>HDRI</b> and the Studio image. Watch the chrome ball.', 'Turn <b>Rotation</b> until the camera-left cheek is the bright one (ratio 1.5:1 or more), and set <b>Strength</b> so the face is at +1 stop.'],
        why: 'HDRIs give believable light and reflections very quickly. Rotating the HDRI is like turning the subject in the room.',
        start: { lights: { key: { on: true, az: 45, el: 30, power: 12 }, fill: { on: true, power: 4 }, rim: { on: true, power: 6 }, bg: { on: false } } },
        check: (s, m) => LIGHT_IDS.every(id => !s.lights[id].on) && s.world.mode === 'hdri' && m.keySide === 'L' && m.ratio >= 1.5 && faceOk(m, 0.4),
        solve: s => { for (const id of LIGHT_IDS) s.lights[id].on = false; Object.assign(s.world, { mode: 'hdri', hdri: 'studio', rot: -50 }); tune(s, (x, v) => { x.world.strength = v; }, m => m.faceStops, 1, 0, 50); s.world.strength = round(s.world.strength); },
      },
      {
        id: 'k3', title: 'A bounce card',
        text: 'You do not always need another lamp for the fill: a white card on the shadow side reflects part of the key back into the shadows. It works like a very soft area light whose power comes from the light it receives. Gold cards warm the shadows, black cards (negative fill) make them darker.',
        how: ['Turn on <b>Bounce_Card</b> in the Outliner, on the other side from the key (positive Azimuth).', 'Move it closer (Distance) and turn it (Azimuth, Elevation) until the <b>Ratio</b> is 4:1 or less.', 'No other lamps: the fill and the rim stay off.'],
        why: 'Reflectors are cheap, soft and always match the colour of the key. In CG, the same idea is a bounce light or a light-blocker.',
        start: { lights: { key: { type: 'AREA', az: -90, el: 20, size: 0.6, sizeY: 0.6, power: 18 }, fill: { on: false }, rim: { on: false }, bg: { on: false } }, card: { on: false, az: 70, el: -10, dist: 1.2, size: 1 } },
        check: (s, m) => s.card.on && s.card.az > 0 && !s.lights.fill.on && !s.lights.rim.on && m.ratio <= 4.5,
        solve: s => { Object.assign(s.card, { on: true, az: 35, el: -20, dist: 0.55, size: 1, color: 'white' }); },
      },
    ],
  },
  {
    id: 'exposure', name: 'Exposure and view', sub: 'Exposure · AgX · False Color',
    steps: [
      {
        id: 'e1', title: 'Exposure',
        text: 'Exposure in Color Management brightens or darkens the whole image in stops, like the camera: +1 doubles every value, −1 halves it. It does not change the lights or their ratios. This render is overexposed: the face is far above +1 stop and clips to white. Fix it with Exposure only.',
        how: ['In <b>Color Management</b>, lower <b>Exposure</b>.', 'Watch the meter: the face must read +1 stop (±0.3).', 'The ratios between the lights stay exactly the same.'],
        why: 'Setting the exposure first, then balancing the lights against each other, keeps the lighting work independent of the brightness of the final image.',
        start: { lights: { key: { az: -45, el: 30, power: 12 }, fill: { on: true, power: 4 }, rim: { on: true, power: 6 }, bg: { on: false } }, view: { exposure: 2.5, transform: 'Standard' } },
        check: (s, m) => Math.abs(m.faceStops - 1) <= 0.3 && s.lights.key.power === 12,
        solve: s => { tune(s, (x, v) => { x.view.exposure = v; }, m => m.faceStops, 1, -10, 10); s.view.exposure = round(s.view.exposure); },
      },
      {
        id: 'e2', title: 'Standard or AgX',
        text: 'The render stores light as numbers without an upper limit, but a screen can only show up to white. The View Transform decides how the numbers become colours. Standard simply clips everything above 1.0 to flat white, so the bright forehead and the chrome ball lose their detail and saturated colours break. AgX rolls the highlights off gently, like film.',
        how: ['Look at the lit side of the face and the highlights of the chrome ball with <b>Standard</b>.', 'In <b>Color Management</b>, set <b>View Transform</b> to <b>AgX</b>.', 'Keep the face at +1 stop and compare the highlights.'],
        why: 'A good view transform is what makes a CG render look like a photograph instead of a computer image.',
        start: { lights: { key: { az: -45, el: 30, power: 12, colorMode: 'kelvin', kelvin: 3000 }, fill: { on: true, power: 4 }, rim: { on: true, power: 14, colorMode: 'kelvin', kelvin: 9000 }, bg: { on: false } }, view: { exposure: 0, transform: 'Standard' } },
        check: (s, m) => s.view.transform === 'AgX' && faceOk(m, 0.4),
        solve: s => { s.view.transform = 'AgX'; },
      },
      {
        id: 'e3', title: 'Read it with False Color',
        text: 'Your eyes adapt, so judging exposure on a screen is hard. False Color paints every exposure band with a colour: grey is middle grey, pink is about one stop over (typical of a lit face), red is more than four stops over. Use it to put the backdrop exactly on middle grey and the face at +1 stop.',
        how: ['In <b>Color Management</b>, set <b>View Transform</b> to <b>False Color</b> and look at the legend.', 'Adjust <b>BG_Light</b> until the backdrop is grey in False Color (within half a stop of middle grey).', 'Keep the face pink (+1 stop).'],
        why: 'Cinematographers and lighting artists use false color and light meters to light by numbers, and trust their eyes for the rest.',
        start: { lights: { key: { az: -45, el: 30, power: 12 }, fill: { on: true, power: 4 }, rim: { on: false }, bg: { on: true, power: 250 } }, backdrop: 'grey', view: { exposure: 0, transform: 'AgX' } },
        check: (s, m) => s.view.transform === 'False Color' && Math.abs(m.backStops) <= 0.5 && faceOk(m, 0.5),
        solve: s => { s.view.transform = 'False Color'; tune(s, (x, v) => { x.lights.bg.power = v; }, m => m.backStops, 0, 0, 5000); s.lights.bg.power = round(s.lights.bg.power); },
      },
    ],
  },
];

export function startState(step) {
  const s = defaultState();
  merge(s, step.start || {});
  return s;
}
// The state of the reference image of a step (its key power is set so the face is at +1 stop).
export function referenceState(step) {
  if (!step.reference) return null;
  const s = defaultState(); merge(s, step.reference); facePlus1(s, 'key');
  return s;
}
export { measure, apparentSize, lightPos };
