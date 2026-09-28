// Photo Lab: the optics and exposure maths of a camera. Pure functions, no DOM.
// Units: focal length and sensor sizes in mm, distances in metres, times in seconds.

// Full stops, as on most camera dials (one click = double or half the light).
export const APERTURES = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22];
export const SHUTTERS = [30, 15, 8, 4, 2, 1, 1 / 2, 1 / 4, 1 / 8, 1 / 15, 1 / 30, 1 / 60, 1 / 125, 1 / 250, 1 / 500, 1 / 1000, 1 / 2000, 1 / 4000];
export const ISOS = [100, 200, 400, 800, 1600, 3200, 6400, 12800];
export const FOCAL_RANGE = [16, 200];

const FF_DIAG = Math.hypot(36, 24);
export const SENSORS = {
  ff: { name: 'Full frame', w: 36, h: 24 },
  apsc: { name: 'APS-C', w: 23.5, h: 15.6 },
  m43: { name: 'Micro Four Thirds', w: 17.3, h: 13 },
};
for (const s of Object.values(SENSORS)) s.crop = Math.round(FF_DIAG / Math.hypot(s.w, s.h) * 100) / 100;

// Scene light, as an exposure value at ISO 100 (the "sunny 16" rule: EV 15 in full sun).
export const LIGHTS = {
  sunny: { name: 'Full sun', ev: 15, cct: 5500 },
  shade: { name: 'Bright shade', ev: 13, cct: 7000 },
  cloudy: { name: 'Overcast', ev: 12, cct: 6500 },
  dusk: { name: 'Dusk', ev: 10, cct: 4500 },
  indoor: { name: 'Indoors', ev: 7, cct: 3000 },
  night: { name: 'Night street', ev: 4, cct: 2700 },
};

// Neutral density filters: grey glass that takes away light without changing the colour.
export const ND_FILTERS = {
  none: { name: 'No filter', stops: 0 },
  nd8: { name: 'ND8 (3 stops)', stops: 3 },
  nd64: { name: 'ND64 (6 stops)', stops: 6 },
  nd1000: { name: 'ND1000 (10 stops)', stops: 10 },
};
export const ndStops = id => (ND_FILTERS[id] || ND_FILTERS.none).stops;

// White balance: the colour temperature (kelvin) the camera treats as white.
export const WB_PRESETS = {
  auto: { name: 'Auto', k: null },
  tungsten: { name: 'Tungsten', k: 3200 },
  fluorescent: { name: 'Fluorescent', k: 4000 },
  daylight: { name: 'Daylight', k: 5500 },
  cloudy: { name: 'Cloudy', k: 6500 },
  shade: { name: 'Shade', k: 7500 },
  custom: { name: 'Kelvin', k: null },
};
// Colour of a light source of temperature k (sRGB 0–1), after Tanner Helland's fit of the Planck curve.
export function kelvinRGB(k) {
  const t = k / 100; let r, g, b;
  if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661; b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307; }
  else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); b = 255; }
  return [r, g, b].map(v => Math.min(255, Math.max(0, v)) / 255);
}
const lin = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
// The colour cast of a photo of light `sceneK` taken with white balance `wbK`: a multiplier per channel
// (linear RGB, same brightness). Equal temperatures give no cast; a lower white balance makes it bluer.
export function wbTint(sceneK, wbK) {
  const a = kelvinRGB(sceneK).map(lin), b = kelvinRGB(wbK).map(lin);
  const m = a.map((v, i) => v / b[i]), Y = 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2];
  return m.map(v => v / Y);
}

export const shutterLabel = t => t >= 1 ? `${Math.round(t * 10) / 10}"` : `1/${Math.round(1 / t)}`;
export const apertureLabel = N => `f/${N}`;

// Exposure value of the camera settings, referred to ISO 100.
export const settingsEV = (N, t, iso) => Math.log2((N * N) / t) - Math.log2(iso / 100);
// Positive = more light than needed (overexposed), negative = underexposed. In stops.
export const exposureError = (sceneEV, N, t, iso) => sceneEV - settingsEV(N, t, iso);
// Brightness multiplier of the photo compared with a correct exposure.
export const exposureGain = (sceneEV, N, t, iso) => Math.pow(2, exposureError(sceneEV, N, t, iso));

const nearestLog = (list, v) => list.reduce((best, x) => Math.abs(Math.log2(x / v)) < Math.abs(Math.log2(best / v)) ? x : best, list[0]);
// Aperture priority (Av / A): the camera picks the shutter speed.
export function autoShutter(sceneEV, N, iso) { return nearestLog(SHUTTERS, (N * N) / (Math.pow(2, sceneEV) * iso / 100)); }
// Shutter priority (Tv / S): the camera picks the aperture.
export function autoAperture(sceneEV, t, iso) { return nearestLog(APERTURES, Math.sqrt(t * Math.pow(2, sceneEV) * iso / 100)); }
// Settings actually used, depending on the mode.
export function resolve(mode, s, sceneEV) {
  const r = { ...s };
  if (mode === 'Av') r.t = autoShutter(sceneEV, s.N, s.iso);
  if (mode === 'Tv') r.N = autoAperture(sceneEV, s.t, s.iso);
  return r;
}

// Field of view (radians) along one side of the sensor.
export const fov = (f, side) => 2 * Math.atan(side / (2 * f));
export const fovDeg = (f, side) => fov(f, side) * 180 / Math.PI;
export const equivalentFocal = (f, sensor) => f * sensor.crop;
// How much of the frame height an object of this height fills (1 = exactly the frame).
export const coverage = (height, dist, f, sensor) => (height * f / dist) / sensor.h;

// Circle of confusion accepted as sharp: the sensor diagonal / 1500 (≈ 0.029 mm on full frame).
export const acceptableCoC = sensor => Math.hypot(sensor.w, sensor.h) / 1500;
// Diameter (mm on the sensor) of the blur disc of a point at distance z when focused at s.
export function blurDisc(f, N, s, z) {
  const S = s * 1000, Z = z * 1000;
  if (S <= f) return Infinity;
  return (f / N) * (f / (S - f)) * Math.abs(Z - S) / Z;
}
export const toPixels = (mm, sensor, imageWidth) => mm / sensor.w * imageWidth;
export function depthOfField(f, N, s, sensor) {
  const c = acceptableCoC(sensor), H = (f * f) / (N * c) + f, S = s * 1000;
  const near = S * (H - f) / (H + S - 2 * f), far = S < H ? S * (H - f) / (H - S) : Infinity;
  return { near: near / 1000, far: far / 1000, hyperfocal: H / 1000 };
}
// Length of the streak (mm on the sensor) of something crossing the frame at v m/s, at distance d.
export const motionBlur = (v, t, d, f) => v * t * f / d;
// Camera shake when shooting by hand: the camera turns about 3° per second while the shutter is open.
export const SHAKE_RATE = 3 * Math.PI / 180;
export const shakeBlur = (t, f, tripod) => tripod ? 0 : SHAKE_RATE * t * f;
// The old rule of thumb for hand-held shots: at least 1 / (equivalent focal length).
export const handheldLimit = (f, sensor) => 1 / equivalentFocal(f, sensor);

// ─── Blender's camera ────────────────────────────────────────────────────────
// Motion Blur › Shutter is measured in frames: seconds = shutter / fps.
export const blenderShutterFrames = (t, fps) => t * fps;
export const blenderShutterSeconds = (frames, fps) => frames / fps;
// Sensor Fit Auto: the Size applies to the larger side of the render.
export function blenderSensor(size, fit, aspect) {
  const horizontal = fit === 'Horizontal' || (fit === 'Auto' && aspect >= 1);
  return horizontal ? { w: size, h: size / aspect } : { w: size * aspect, h: size };
}
