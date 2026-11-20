import { clamp, fields, hexToLinear, mathValue, mixColor } from '../_procedural/core.js';

export const colors = { paint: '#2c8294', primer: '#ad6638' };
export const defaults = {
  scale: 7, threshold: 0.58, transition: 0.12, paintRoughness: 0.29, primerRoughness: 0.72,
  grain: 0.12, strength: 0.32, distance: 0.055, light: 65, relief: true,
};

const paint = hexToLinear(colors.paint), primer = hexToLinear(colors.primer);
const gray = n => [n, n, n];
export const rampStops = [['#143f49', 0.22], ['#5eacaa', 0.78]];
const rampColors = rampStops.map(([hex]) => hexToLinear(hex));

export function grayscaleSampler(data, width, height) {
  const sample = (x, y) => data[4 * (y * width + x)] / 255;
  return (u, v) => {
    const x = clamp(u * width - 0.5, 0, width - 1);
    const y = clamp((1 - v) * height - 0.5, 0, height - 1);
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, width - 1), y1 = Math.min(y0 + 1, height - 1);
    const dx = x - x0, dy = y - y0;
    const top = sample(x0, y0) * (1 - dx) + sample(x1, y0) * dx;
    const bottom = sample(x0, y1) * (1 - dx) + sample(x1, y1) * dx;
    return top * (1 - dy) + bottom * dy;
  };
}

export function imageMask(u, v) {
  const mottling = fields.Noise(u, v, 5);
  const streak = Math.abs(Math.sin(21 * (v - 0.37 * u) + 0.8 * Math.sin(u * 11)));
  return clamp(0.17 + 0.65 * mottling + 0.32 * Math.exp(-26 * streak ** 2));
}

const cell = Array.from({ length: 29 * 29 }, (_, i) => {
  const random = factor => {
    const x = Math.sin((i + 1) * factor) * 4381.751;
    return 0.12 + 0.76 * (x - Math.floor(x));
  };
  return [random(12.173), random(89.321)];
});

const wrapCell = value => ((value % 29) + 29) % 29;

export function voronoi(u, v, scale, randomness = 1) {
  const x = u * scale, y = v * scale;
  const ix = Math.floor(x), iy = Math.floor(y);
  let distance = Infinity;
  for (let j = iy - 1; j <= iy + 1; j++) {
    for (let i = ix - 1; i <= ix + 1; i++) {
      const [dx, dy] = cell[wrapCell(i) + 29 * wrapCell(j)];
      const px = i + 0.5 + randomness * (dx - 0.5);
      const py = j + 0.5 + randomness * (dy - 0.5);
      distance = Math.min(distance, (x - px) ** 2 + (y - py) ** 2);
    }
  }
  return Math.sqrt(distance);
}

export function maskBounds({ threshold, transition }) {
  return [clamp(threshold - transition / 2), clamp(threshold + transition / 2)];
}

export function wearMask(noise, settings, soft) {
  if (!soft) return mathValue('Greater Than', noise, settings.threshold);
  const [min, max] = maskBounds(settings);
  if (min === max) return mathValue('Greater Than', noise, min);
  const t = clamp((noise - min) / (max - min));
  return t * t * (3 - 2 * t);
}

export function surfaceHeight(mask, detail, grain) {
  const layer = mathValue('Multiply Add', mask, -0.55, 0.65);
  return mathValue('Multiply Add', detail, grain, layer);
}

export function surfaceLighting(light) {
  const direction = light * Math.PI / 180;
  const lx = Math.cos(direction) * 0.72, ly = Math.sin(direction) * 0.72;
  const lz = Math.sqrt(1 - lx ** 2 - ly ** 2);
  const halfLength = Math.hypot(lx, ly, lz + 1);
  return (rgb, roughness, metallic, [nx, ny, nz]) => {
    const length = Math.hypot(nx, ny, nz) || 1;
    const diffuse = Math.max(0, (nx * lx + ny * ly + nz * lz) / length);
    const alignment = Math.max(0, (nx * lx + ny * ly + nz * (lz + 1)) / (length * halfLength));
    const rough = clamp(roughness);
    const metal = clamp(metallic);
    const specular = alignment ** (4 + (1 - rough) ** 3 * 105) * (0.06 + (1 - rough) * 0.28);
    return rgb.map(channel => channel * (0.36 + 0.64 * diffuse) * (1 - 0.65 * metal)
      + specular * (1 - metal + channel * metal));
  };
}

export function materialSampler(settings, stage, view, variant = 'noise', imageSource = imageMask) {
  const soft = stage >= 2;
  const hasBump = stage >= 3 && settings.relief;
  const source = variant === 'image' ? imageSource : variant === 'voronoi' ? voronoi : fields.Noise;
  const maskAt = (u, v) => wearMask(source(u, v, settings.scale), settings, soft);
  const paintAt = variant === 'ramp' ? (u, v) => {
    const value = fields.Noise(u, v, 18);
    const factor = clamp((value - rampStops[0][1]) / (rampStops[1][1] - rampStops[0][1]));
    return mixColor('Mix', ...rampColors, factor, true, false);
  } : () => paint;
  const heightAt = (u, v, mask = maskAt(u, v)) => surfaceHeight(mask, fields.Noise(u, v, 65), settings.grain);
  const shade = surfaceLighting(settings.light);
  const sampleStep = 1 / 320;

  return (u, v) => {
    const mask = maskAt(u, v);
    if (view === 'mask') return gray(mask);
    const rgb = mixColor('Mix', paintAt(u, v), primer, mask, true, false);
    if (view === 'color') return rgb;
    const roughness = settings.paintRoughness + mask * (settings.primerRoughness - settings.paintRoughness);
    if (view === 'roughness') return gray(roughness);
    const height = stage >= 3 ? heightAt(u, v, mask) : 0;
    if (view === 'height') return gray(height);

    const bump = hasBump ? settings.strength * settings.distance / (2 * sampleStep) : 0;
    const nx = bump ? -bump * (heightAt(u + sampleStep, v) - heightAt(u - sampleStep, v)) : 0;
    const ny = bump ? -bump * (heightAt(u, v + sampleStep) - heightAt(u, v - sampleStep)) : 0;
    return shade(rgb, stage >= 2 ? roughness : 0.45, 0, [nx, ny, 1]);
  };
}
