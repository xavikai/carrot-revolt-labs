// Stages of the Photo Lab. Every step loads its own camera settings and scene.
import * as O from './optics.js?v=2';

export const SUBJECT_H = 1.75;     // the person, in metres
export const BACKGROUND = 10;      // the string of lights behind the person (m)
export const FACE = 0.15;          // the face is this much closer to the camera than the person's feet
// A small windmill 3 m behind the person, on the left: its sails always turn (omega in rad/s, r = sail length).
export const WINDMILL = { behind: 3, x: -1.75, hub: 1.55, r: 0.75, omega: 16 / 3 }; // tips at 4 m/s
export const tipSpeed = () => WINDMILL.omega * WINDMILL.r; // m/s at the tips of the sails
export const IMAGE_H = 512;
export const imageWidth = sensor => Math.round(IMAGE_H * sensor.w / sensor.h);

export const DEFAULTS = { mode: 'M', N: 5.6, t: 1 / 125, iso: 100, f: 50, focus: 4, sensor: 'ff', tripod: false, dist: 4, wb: 'auto', kelvin: 5500, nd: 'none' };
export const BLENDER_DEFAULTS = { focal: 50, fit: 'Auto', size: 36, dof: false, focusDist: 10, fstop: 2.8, blades: 0, mblur: false, shutter: 0.5, fps: 24 };

// The white balance in kelvin: Auto measures the light, the presets have fixed values, Kelvin is typed.
export function wbKelvin(s, light) { const p = O.WB_PRESETS[s.wb || 'auto']; return s.wb === 'custom' ? s.kelvin : p?.k || light.cct; }
// Everything the lab measures about a shot.
export function derive(s, step) {
  const scene = step.scene || {};
  const light = O.LIGHTS[scene.light || 'shade'];
  if (step.blender) {
    const b = s.blender, sensor = O.blenderSensor(b.size, b.fit, 1.5);
    sensor.crop = Math.hypot(36, 24) / Math.hypot(sensor.w, sensor.h);
    const N = b.dof ? b.fstop : Infinity, t = b.mblur ? O.blenderShutterSeconds(b.shutter, b.fps) : 0;
    return finish({ f: b.focal, N, t, iso: 100, focus: b.dof ? b.focusDist : 1e6, tripod: true, dist: s.dist, sensor, err: 0, gain: 1, ev: light.ev, nd: 0, cct: light.cct, wbK: light.cct, tint: [1, 1, 1], auto: null }, scene);
  }
  const sensor = O.SENSORS[s.sensor];
  const nd = O.ndStops(s.nd), ev = light.ev - nd;          // an ND filter takes away whole stops of light
  const u = O.resolve(s.mode, s, ev);
  const err = O.exposureError(ev, u.N, u.t, u.iso);
  const wbK = wbKelvin(s, light), tint = O.wbTint(light.cct, wbK);
  return finish({ f: s.f, N: u.N, t: u.t, iso: u.iso, focus: s.focus, tripod: s.tripod, dist: s.dist, sensor, err, gain: Math.pow(2, err), ev: light.ev, nd, cct: light.cct, wbK, tint, auto: s.mode === 'Av' ? 't' : s.mode === 'Tv' ? 'N' : null }, scene);
}
function finish(d, scene) {
  const W = imageWidth(d.sensor), px = mm => O.toPixels(mm, d.sensor, W);
  d.width = W;
  d.dof = isFinite(d.N) ? O.depthOfField(d.f, d.N, d.focus, d.sensor) : { near: 0, far: Infinity, hyperfocal: 0 };
  d.subjectBlurPx = isFinite(d.N) ? px(O.blurDisc(d.f, d.N, d.focus, d.dist - FACE)) : 0;
  d.inFocus = d.subjectBlurPx <= px(O.acceptableCoC(d.sensor)) * 2;
  d.bgBlurPx = isFinite(d.N) ? px(O.blurDisc(d.f, d.N, d.focus, d.dist + BACKGROUND)) : 0;
  d.motionPx = px(O.motionBlur(tipSpeed(), d.t, d.dist + WINDMILL.behind, d.f)); // at the tips of the sails
  d.shakePx = px(O.shakeBlur(d.t, d.f, d.tripod));
  d.coverage = O.coverage(SUBJECT_H, d.dist, d.f, d.sensor);
  d.equivalent = O.equivalentFocal(d.f, d.sensor);
  return d;
}
const okExposure = (d, tol = 0.5) => Math.abs(d.err) <= tol;
const near = (a, b, tol) => Math.abs(a - b) <= tol;

export const STAGES = [
  {
    id: 'exposure', name: 'Exposure triangle', sub: 'Aperture · shutter · ISO',
    steps: [
      {
        id: 'e1', title: 'Balance the meter',
        text: 'Three settings decide how much light makes the photo: the aperture (how wide the lens opens), the shutter speed (how long the sensor is exposed) and the ISO (how much the signal is amplified). Every full step doubles or halves the light. This photo is far too bright: in Manual mode, bring the exposure meter to 0.',
        how: ['Watch the meter under the photo: <b>+</b> means too much light.', 'Use a faster shutter (1/250, 1/500…), a smaller aperture (a bigger f-number) or a lower ISO.', 'Each click is one stop: the meter moves one mark.'],
        why: 'The camera meter measures the scene and says how far your settings are from a normal exposure.',
        scene: { light: 'cloudy' },
        start: { mode: 'M', N: 2.8, t: 1 / 30, iso: 400 },
        lock: ['mode', 'sensor', 'dist'],
        check: d => okExposure(d, 0.35),
      },
      {
        id: 'e2', title: 'Blur the background',
        text: 'A wide aperture (a small f-number like f/2) gives a shallow depth of field: only a thin slice of the scene is sharp. Use aperture priority (Av): you choose the aperture, the camera picks the shutter speed. Keep the person sharp and turn the lights behind into soft discs (bokeh).',
        how: ['The mode is <b>Av</b>: change the <b>aperture</b> to f/2.8 or wider.', 'Click on the person in the photo to focus there (or use the Focus slider).', 'The sidebar shows the depth of field: the person must be inside it.'],
        why: 'Portraits use wide apertures and longer lenses to separate the subject from the background.',
        scene: { light: 'shade' },
        start: { mode: 'Av', N: 11, t: 1 / 60, iso: 100, f: 85, focus: 12, dist: 3 },
        lock: ['mode', 'sensor', 'dist'],
        check: d => d.N <= 2.8 && d.inFocus && d.bgBlurPx >= 12 && okExposure(d),
      },
      {
        id: 'e3', motion: true, title: 'Freeze the motion',
        text: 'The windmill behind the person turns fast: the tips of its sails move at 4 m/s. With a slow shutter the sails become a blurred disc. Use shutter priority (Tv): you choose the speed, the camera opens the aperture to compensate. Freeze the sails: the blur at the tips must be under 1.5 pixels.',
        how: ['The mode is <b>Tv</b>: choose a faster <b>shutter speed</b>.', 'Watch the <b>Motion</b> overlay on the photo: it shows how far a sail turns while the shutter is open.', 'If the camera runs out of aperture (the meter goes negative), raise the ISO.'],
        why: 'Sport and wildlife photography need fast shutter speeds; the aperture and ISO pay for them.',
        scene: { light: 'shade' },
        start: { mode: 'Tv', N: 8, t: 1 / 60, iso: 100, f: 50, focus: 6, dist: 4 },
        lock: ['mode', 'sensor', 'dist'],
        check: d => d.t <= 1 / 1000 && d.motionPx <= 1.5 && okExposure(d),
      },
      {
        id: 'e4', motion: true, title: 'Show the movement',
        text: 'Now the opposite: a long exposure on a tripod, so the sails of the windmill blur into a disc and everything else stays sharp. In Manual, use 1/15 s or slower and still get a correct exposure.',
        how: ['Turn on <b>Tripod</b>.', 'Set the shutter to 1/15 or slower.', 'Close the aperture (f/8, f/11…) and use ISO 100 so the photo is not too bright.'],
        why: 'Motion blur tells the viewer that something moves. Slow shutters need a tripod, and in daylight a small aperture.',
        scene: { light: 'dusk' },
        start: { mode: 'M', N: 4, t: 1 / 250, iso: 400, f: 50, focus: 6, dist: 4, tripod: false },
        lock: ['mode', 'sensor', 'dist'],
        check: d => d.t >= 1 / 15 && d.tripod && d.motionPx >= 20 && okExposure(d),
      },
      {
        id: 'e5', title: 'Low light by hand',
        text: 'A night street and no tripod. Slow shutters make the whole photo shake; the rule of thumb is not to go slower than 1 / focal length. Get a correct exposure with less than 2 pixels of camera shake: you will need to open the aperture and raise the ISO. Look at the noise.',
        how: ['Keep the shutter at about 1/60 (the handheld limit for 50 mm).', 'Open the aperture as much as you can.', 'Raise the <b>ISO</b> until the meter reaches 0. Zoom into the photo to see the noise.'],
        why: 'ISO does not add light: it amplifies the signal, and the noise with it. It is the last setting to raise.',
        scene: { light: 'night' },
        start: { mode: 'M', N: 5.6, t: 1 / 4, iso: 100, f: 50, focus: 4, dist: 4, tripod: false },
        lock: ['mode', 'sensor', 'dist', 'tripod'],
        check: d => okExposure(d) && d.shakePx <= 2,
      },
    ],
  },
  {
    id: 'lens', name: 'Focal length & sensor', sub: 'Zoom · perspective · crop',
    steps: [
      {
        id: 's1', title: 'Frame the person',
        text: 'The focal length sets the angle of view: 16 mm sees a wide scene, 200 mm a narrow one. From 6 m away, zoom until the person fills between 70% and 90% of the frame height.',
        how: ['Drag the <b>Focal length</b> slider.', 'The sidebar shows how much of the frame the person fills.', 'Watch the lens in the 3D camera: it gets longer as you zoom in.'],
        why: 'Short focal lengths are called wide-angle, long ones telephoto. 50 mm on full frame is close to how we see.',
        scene: { light: 'shade' },
        start: { mode: 'Av', N: 8, f: 18, focus: 6, dist: 6 },
        lock: ['mode', 'sensor', 'dist'],
        check: d => d.coverage >= 0.7 && d.coverage <= 0.9,
      },
      {
        id: 's2', title: 'Perspective compression',
        text: 'Keep the person the same size in the frame (55%–70% of the height) twice: once close with a wide angle (24 mm or less) and once far away with a telephoto (135 mm or more). Compare the background: the lens does not change the perspective, the distance does.',
        how: ['Set the focal length to 24 mm or less and move closer with <b>Distance</b> until the person fills 55–70%. The autofocus follows the person.', 'Then set 135 mm or more and walk back until the person has the same size.', 'The step is done when you have shot both (they are checked as you go).'],
        why: 'Telephoto portraits "compress" the background: far objects look closer and bigger. Wide angles exaggerate depth.',
        scene: { light: 'shade' },
        start: { mode: 'Av', N: 8, f: 50, focus: 5, dist: 5 },
        lock: ['mode', 'sensor'],
        track: d => d.coverage >= 0.55 && d.coverage <= 0.7 ? (d.f <= 24 ? 'wide' : d.f >= 135 ? 'tele' : null) : null,
        check: (d, flags) => !!(flags.wide && flags.tele),
      },
      {
        id: 's3', title: 'The crop factor',
        text: 'A smaller sensor only sees the centre of the image. With an APS-C sensor (crop ≈ 1.5) a 50 mm lens frames like 75 mm on full frame. Switch to APS-C and choose the focal length that frames like 75 mm on full frame (equivalent 70–80 mm).',
        how: ['Set <b>Sensor</b> to APS-C.', 'Change the focal length until the equivalent focal length is about 75 mm.', 'Watch the sensor in the 3D camera: it is smaller.'],
        why: 'Focal lengths are often given "full-frame equivalent". In Blender, the Sensor Size does the same job.',
        scene: { light: 'shade' },
        start: { mode: 'Av', N: 8, f: 75, focus: 6, dist: 6, sensor: 'ff' },
        lock: ['mode', 'dist'],
        check: d => d.sensor.w < 30 && d.sensor.w > 20 && d.equivalent >= 70 && d.equivalent <= 80,
      },
    ],
  },
  {
    id: 'light', name: 'Colour and filters', sub: 'White balance · ND',
    steps: [
      {
        id: 'w1', title: 'White balance indoors',
        text: 'Indoors, the light of the lamps is warm (about 3000 K), but the camera is set to Daylight (5500 K): the photo comes out orange. Our eyes adapt to the light; the camera needs to be told. Set the white balance for this light by hand.',
        how: ['In <b>Colour & filter</b>, change <b>White balance</b> from Daylight to <b>Tungsten</b>.', 'Or choose <b>Kelvin</b> and set about 3000 K.', 'Watch the orange cast disappear from the wall and the skin.'],
        why: 'White balance tells the camera which colour of light is white. Auto often works, but it is fooled by scenes with one dominant colour; in video and in a series of photos it is set by hand so it does not change between shots.',
        colour: true, scene: { light: 'indoor' },
        start: { mode: 'M', N: 2.8, t: 1 / 15, iso: 100, f: 50, focus: 4, dist: 4, tripod: true, wb: 'daylight' },
        lock: ['mode', 'sensor', 'dist', 'N', 't', 'iso', 'tripod'],
        check: (d, f, s) => s.wb !== 'auto' && Math.abs(d.wbK - d.cct) <= 400,
      },
      {
        id: 'w2', title: 'Warmer on purpose',
        text: 'The white balance is also a creative tool. In full sun (5500 K), make the photo feel like a warm late afternoon without touching the light: tell the camera the light is bluer than it is.',
        how: ['Set <b>White balance</b> to <b>Shade</b> or <b>Cloudy</b>, or choose <b>Kelvin</b>.', 'The number is the light you tell the camera: a higher number than the real light warms the photo, a lower one cools it.', 'Aim for 6800–10000 K.'],
        why: 'The camera compensates for the light it has been told about. Told that the light is blue, it adds orange; told that it is orange, it adds blue. In Blender the same idea is Color Management with a white balance (temperature) setting.',
        colour: true, scene: { light: 'sunny' },
        start: { mode: 'Av', N: 8, iso: 100, f: 50, focus: 4, dist: 4, wb: 'daylight' },
        lock: ['mode', 'sensor', 'dist'],
        check: d => d.wbK >= 6800 && d.wbK <= 10000,
      },
      {
        id: 'n1', title: 'Long exposure in full sun',
        text: 'You want the sails of the windmill to blur in full sun, on a tripod: at least 1/8 s. But even at f/22 and ISO 100 there is too much light. An ND filter is a dark grey glass in front of the lens: it takes away whole stops without changing the colour.',
        how: ['Turn on <b>Tripod</b> and set the shutter to 1/8 s or slower, f/22, ISO 100: the photo is white.', 'In <b>Colour & filter</b>, add an <b>ND filter</b>: ND8 takes away 3 stops, ND64 6, ND1000 10.', 'Find the filter that gives a correct exposure.'],
        why: 'Each stop halves the light: ND8 lets through 1/8 of it (3 stops). Photographers use ND filters for silky water, for car light trails in daylight and for video, where the shutter must stay near 1/50 s.',
        colour: true, motion: true, scene: { light: 'sunny' },
        start: { mode: 'M', N: 16, t: 1 / 125, iso: 100, f: 50, focus: 4, dist: 4, tripod: false },
        lock: ['mode', 'sensor', 'dist'],
        check: d => d.t >= 1 / 8 - 1e-9 && d.tripod && d.nd > 0 && okExposure(d) && d.motionPx >= 20,
      },
      {
        id: 'n2', title: 'Shallow focus at noon',
        text: 'A portrait at noon with a blurred background: f/2 or wider. In Av the camera picks the shutter speed, but its fastest is 1/4000 s and it is not enough: the photo is overexposed. Fix it without closing the aperture.',
        how: ['The mode is <b>Av</b>: open the aperture to f/2 or f/1.4 and look at the meter.', 'Add an <b>ND filter</b> so the camera can choose a shutter speed it has.', 'Keep the person in focus.'],
        why: 'ND filters let you choose the aperture for the look (depth of field) and the shutter for the movement, whatever the light.',
        colour: true, scene: { light: 'sunny' },
        start: { mode: 'Av', N: 5.6, iso: 100, f: 85, focus: 3, dist: 3 },
        lock: ['mode', 'sensor', 'dist'],
        check: d => d.N <= 2 && d.nd > 0 && okExposure(d) && d.inFocus,
      },
    ],
  },
  {
    id: 'blender', name: 'Blender camera', sub: 'Same ideas, other names',
    steps: [
      {
        id: 'b1', title: 'Match the lens',
        text: 'Blender\'s camera works like a real one, with different names. Its default is a 50 mm lens on a 36 mm sensor: a full-frame camera. Match the reference photo, taken with an 85 mm lens.',
        how: ['In <b>Camera Properties › Lens</b>, set <b>Focal Length</b>.', 'Keep <b>Sensor Fit: Auto</b> and <b>Size: 36 mm</b>.', 'Compare with the reference picture.'],
        why: 'Matching a real lens and sensor is the first step to put 3D objects into real footage.',
        blender: true, scene: { light: 'shade' },
        start: { dist: 4 }, target: { focal: 85 },
        check: (d, f, s) => near(s.blender.focal, 85, 2) && near(s.blender.size, 36, 0.5),
      },
      {
        id: 'b2', title: 'Match the depth of field',
        text: 'Blender renders everything sharp until you turn on Depth of Field. Then Focus Distance and F-Stop do what focus and aperture do on a real camera. The reference was taken at f/2, focused on the person (4 m).',
        how: ['Turn on <b>Depth of Field</b>.', 'Set <b>Focus Distance</b> to 4 m (or pick the person as Focus Object in Blender).', 'Set <b>F-Stop</b> to 2.'],
        why: 'F-Stop in Blender only affects blur, not brightness: there is no exposure triangle in a render.',
        blender: true, scene: { light: 'shade' },
        start: { dist: 4, blender: { focal: 85 } }, target: { focal: 85, dof: true, focusDist: 4, fstop: 2 },
        check: (d, f, s) => s.blender.dof && near(s.blender.focusDist, 4, 0.3) && near(s.blender.fstop, 2, 0.25),
      },
      {
        id: 'b3', motion: true, title: 'Motion blur in frames',
        text: 'Blender measures the shutter in frames, not seconds: seconds = Shutter ÷ frame rate. The reference photo of the windmill was shot at 1/100 s, and the scene runs at 25 fps. Set the Shutter that gives the same blur.',
        how: ['In <b>Output Properties</b>, set <b>Frame Rate</b> to 25 fps.', 'In <b>Render Properties › Motion Blur</b>, turn it on.', 'Shutter = 1/100 × 25 = <b>0.25</b> frames.'],
        why: 'The default 0.5 frames is the "180° shutter" of film cameras: 1/48 s at 24 fps.',
        blender: true, scene: { light: 'shade' },
        start: { dist: 4 }, target: { mblur: true, shutter: 0.25, fps: 25 },
        check: (d, f, s) => s.blender.mblur && s.blender.fps === 25 && near(s.blender.shutter, 0.25, 0.02),
      },
      {
        id: 'b4', title: 'A real APS-C camera',
        text: 'You filmed a scene with an APS-C camera (sensor 23.5 mm wide) and a 35 mm lens. To match it in Blender, enter the real sensor width and the real focal length: the angle of view will be the same as on the camera.',
        how: ['Set <b>Sensor Fit</b> to Horizontal and <b>Size</b> to 23.5 mm.', 'Set <b>Focal Length</b> to 35 mm.', 'The equivalent full-frame focal length is shown in the sidebar (≈ 54 mm).'],
        why: 'Camera tracking and compositing only line up when the Blender camera has the real sensor and lens.',
        blender: true, scene: { light: 'shade' },
        start: { dist: 5 }, target: { focal: 35, fit: 'Horizontal', size: 23.5 },
        check: (d, f, s) => near(s.blender.size, 23.5, 0.3) && s.blender.fit !== 'Vertical' && near(s.blender.focal, 35, 1),
      },
    ],
  },
];

export function startSettings(step) {
  const s = { ...DEFAULTS, ...step.start };
  s.blender = { ...BLENDER_DEFAULTS, ...(step.start.blender || {}) };
  return s;
}
export function targetSettings(step) {
  const s = startSettings(step);
  s.blender = { ...s.blender, ...step.target };
  return s;
}

// One possible solution per step (used by "Show a solution" and by the tests).
export const SOLUTIONS = {
  e1: s => { s.t = 1 / 250; s.N = 4; s.iso = 100; },
  e2: s => { s.N = 2; s.focus = 2.85; },
  e3: s => { s.t = 1 / 1000; },
  e4: s => { s.tripod = true; s.t = 1 / 15; s.N = 8; s.iso = 100; },
  e5: s => { s.t = 1 / 60; s.N = 2; s.iso = 1600; },
  s1: s => { s.f = 65; },
  s2: (s, flags) => { flags.wide = true; flags.tele = true; s.f = 135; s.dist = 15; s.focus = 15; },
  s3: s => { s.sensor = 'apsc'; s.f = 50; },
  w1: s => { s.wb = 'tungsten'; },
  w2: s => { s.wb = 'shade'; },
  n1: s => { s.tripod = true; s.N = 22; s.t = 1 / 8; s.iso = 100; s.nd = 'nd8'; },
  n2: s => { s.N = 2; s.nd = 'nd8'; s.focus = 2.85; },
  b1: s => { s.blender.focal = 85; },
  b2: s => { Object.assign(s.blender, { dof: true, focusDist: 4, fstop: 2 }); },
  b3: s => { Object.assign(s.blender, { mblur: true, shutter: 0.25, fps: 25 }); },
  b4: s => { Object.assign(s.blender, { fit: 'Horizontal', size: 23.5, focal: 35 }); },
};
