// The voxel world the drone builds in. Pure logic: no DOM.
export const DIRECTION_VECTORS = { Right: [1, 0], Left: [-1, 0], Forward: [0, 1], Back: [0, -1] };
export const BLOCK_COLORS = ['White', 'Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Black'];

const key = (x, z) => `${x},${z}`;
class DroneException extends Error {
  constructor(exception, message, hint = '') { super(message); this.exception = exception; this.hint = hint; }
}

export class World {
  constructor({ size = 8, maxHeight = 8, start = [0, 0], columns = {}, ground = {}, plans = {} } = {}) {
    this.size = size;
    this.maxHeight = maxHeight;
    this.drone = { x: start[0], z: start[1] };
    this.columns = new Map(Object.entries(columns).map(([k, v]) => [k, [...v]]));
    this.ground = new Map(Object.entries(ground));
    this.plans = new Map(Object.entries(plans).map(([z, p]) => [Number(z), [...p]]));
    this.actions = 0;
    this.events = [];
  }
  column(x = this.drone.x, z = this.drone.z) { return this.columns.get(key(x, z)) || []; }
  height() { return this.column().length; }
  groundColor() { return this.ground.get(key(this.drone.x, this.drone.z)) || 'None'; }
  inside(x, z) { return x >= 0 && z >= 0 && x < this.size && z < this.size; }

  fly(x, z, text) {
    if (!this.inside(x, z)) {
      const axis = x < 0 || x >= this.size ? `X would be ${x}` : `Z would be ${z}`;
      throw new DroneException('DroneException', `The drone can't leave the grid: ${axis}. X and Z go from 0 to ${this.size - 1}.`,
        'Check the value you move to. If a loop moves the drone, does it move one time too many?');
    }
    const from = { ...this.drone };
    this.drone = { x, z };
    this.actions++;
    this.events.push({ type: 'move', from, to: { x, z } });
    return text;
  }
  move(direction, distance = 1) {
    if (distance < 0) throw new DroneException('ArgumentOutOfRangeException', `The distance can't be negative (it was ${distance}).`, 'Use the opposite direction instead.');
    const [dx, dz] = DIRECTION_VECTORS[direction];
    const x = this.drone.x + dx * distance, z = this.drone.z + dz * distance;
    return this.fly(x, z, `moved ${direction}${distance !== 1 ? ` ${distance} tiles` : ''} → (${x}, ${z})`);
  }
  moveTo(x, z) { return this.fly(x, z, `flew to (${x}, ${z})`); }
  place(color = 'White') {
    if (color === 'None') throw new DroneException('ArgumentException', 'Color.None is not a block color.', 'Choose a color such as Color.Red.');
    const k = key(this.drone.x, this.drone.z);
    const col = this.columns.get(k) || [];
    if (col.length >= this.maxHeight) throw new DroneException('DroneException', `The column at (${this.drone.x}, ${this.drone.z}) is full: it already has ${this.maxHeight} blocks.`, 'Is a loop placing more blocks than you expected?');
    col.push(color);
    this.columns.set(k, col);
    this.actions++;
    this.events.push({ type: 'place', x: this.drone.x, z: this.drone.z, y: col.length - 1, color });
    return `placed ${color} at (${this.drone.x}, ${this.drone.z}) · column height ${col.length}`;
  }
  // Builds a tower of n blocks here, then steps one tile right (if there is room) for the next tower.
  build(n, color = 'White') {
    if (n < 0) throw new DroneException('ArgumentOutOfRangeException', `A tower can't have a negative height (it was ${n}).`, 'Check the calculation: the result is below zero.');
    if (color === 'None') throw new DroneException('ArgumentException', 'Color.None is not a block color.', 'Choose a color such as Color.Red.');
    const x = this.drone.x, z = this.drone.z, have = this.column().length;
    if (have + n > this.maxHeight) throw new DroneException('DroneException', `A tower of ${n} doesn't fit: the maximum height is ${this.maxHeight} blocks.`, 'Check the calculation: the result is bigger than you expected.');
    for (let i = 0; i < n; i++) this.place(color);
    if (n === 0) this.actions++;
    if (x < this.size - 1) { this.drone = { x: x + 1, z }; this.events.push({ type: 'move', from: { x, z }, to: { x: x + 1, z } }); }
    return `built a tower of ${n} at (${x}, ${z})`;
  }
  // The plan of the street where the drone is: one number per plot, from x = 0.
  scan() {
    this.actions++;
    return [...(this.plans.get(this.drone.z) || [])];
  }
  blockCount() { let n = 0; for (const c of this.columns.values()) n += c.length; return n; }
}

// Compare the built world with a target { "x,z": [colors bottom → top] }
export function compare(world, target) {
  const keys = new Set([...Object.keys(target), ...world.columns.keys()]);
  const result = { ok: true, missing: [], wrong: [], extra: [], correct: 0, total: 0 };
  for (const k of keys) {
    const [x, z] = k.split(',').map(Number);
    const want = target[k] || [], have = world.columns.get(k) || [];
    result.total += want.length;
    for (let y = 0; y < Math.max(want.length, have.length); y++) {
      if (y >= have.length) result.missing.push({ x, z, y, color: want[y] });
      else if (y >= want.length) result.extra.push({ x, z, y, color: have[y] });
      else if (want[y] !== have[y]) result.wrong.push({ x, z, y, color: have[y], want: want[y] });
      else result.correct++;
    }
  }
  result.ok = !result.missing.length && !result.wrong.length && !result.extra.length;
  return result;
}

// Small seeded random generator so randomized challenges can be replayed and verified.
export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
