import { clamp, fields, hexToLinear, mathValue, mixColor } from '../_procedural/core.js';

export const colors = { paint: '#2c8294', primer: '#ad6638' };
export const defaults = {
  scale: 7, threshold: 0.58, transition: 0.12, paintRoughness: 0.29, primerRoughness: 0.72,
  grain: 0.12, strength: 0.32, distance: 0.055, light: 65, relief: true,
};

const paint = hexToLinear(colors.paint), primer = hexToLinear(colors.primer);
const gray = n => [n, n, n];

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

export function materialSampler(settings, stage, view) {
  const soft = stage >= 2;
  const hasBump = stage >= 3 && settings.relief;
  const maskAt = (u, v) => wearMask(fields.Noise(u, v, settings.scale), settings, soft);
  const heightAt = (u, v, mask = maskAt(u, v)) => surfaceHeight(mask, fields.Noise(u, v, 65), settings.grain);
  const direction = settings.light * Math.PI / 180;
  const lx = Math.cos(direction) * 0.72, ly = Math.sin(direction) * 0.72;
  const lz = Math.sqrt(1 - lx ** 2 - ly ** 2);
  const halfLength = Math.hypot(lx, ly, lz + 1);
  const sampleStep = 1 / 320;

  return (u, v) => {
    const mask = maskAt(u, v);
    if (view === 'mask') return gray(mask);
    const rgb = mixColor('Mix', paint, primer, mask, true, false);
    if (view === 'color') return rgb;
    const roughness = settings.paintRoughness + mask * (settings.primerRoughness - settings.paintRoughness);
    if (view === 'roughness') return gray(roughness);
    const height = stage >= 3 ? heightAt(u, v, mask) : 0;
    if (view === 'height') return gray(height);

    const bump = hasBump ? settings.strength * settings.distance / (2 * sampleStep) : 0;
    const nx = bump ? -bump * (heightAt(u + sampleStep, v) - heightAt(u - sampleStep, v)) : 0;
    const ny = bump ? -bump * (heightAt(u, v + sampleStep) - heightAt(u, v - sampleStep)) : 0;
    const length = Math.hypot(nx, ny, 1);
    const diffuse = Math.max(0, (nx * lx + ny * ly + lz) / length);
    const alignment = Math.max(0, (nx * lx + ny * ly + lz + 1) / (length * halfLength));
    const rough = stage >= 2 ? roughness : 0.45;
    // A local preview to compare highlight width and normal response under a grazing light.
    const specular = alignment ** (4 + (1 - rough) ** 3 * 105) * (0.06 + (1 - rough) * 0.28);
    return rgb.map(channel => channel * (0.36 + 0.64 * diffuse) + specular);
  };
}
