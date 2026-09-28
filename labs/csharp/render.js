// Isometric view of the voxel world (Canvas 2D).
// +X goes down-right on screen, +Z goes up-right, Y is up (as in Unity).

export const PALETTE = {
  White: '#e7e8eb', Red: '#e25550', Orange: '#f08c3a', Yellow: '#f3c533',
  Green: '#5fbd6b', Blue: '#4d8fe2', Purple: '#9b6be2', Black: '#474b53',
};

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(f > 1 ? v + (255 - v) * (f - 1) : v * f))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
const ease = t => 1 - Math.pow(1 - t, 3);

export class IsoView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = null;
    this.target = {};
    this.result = null;
    this.drone = { x: 0, z: 0, fromX: 0, fromZ: 0, t0: 0, dur: 1 };
    this.births = new Map();
    this.known = new Set();
    this.animMs = 220;
    this.resize = this.resize.bind(this);
    new ResizeObserver(this.resize).observe(canvas.parentElement);
    this.resize();
    const loop = t => { this.draw(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  resize() {
    const box = this.canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(200, box.width); this.h = Math.max(200, box.height);
    this.canvas.width = Math.round(this.w * dpr); this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = this.w + 'px'; this.canvas.style.height = this.h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.layout();
  }

  layout() {
    const n = this.world?.size || 8, reserve = this.world?.viewHeight || 4;
    // Fit the grid (n × tw wide, n × th tall) plus room for towers above it, then centre it.
    const tw = Math.min((this.w - 90) / n, (this.h - 70) / (n * 0.5 + reserve * 0.55));
    this.tw = Math.max(18, tw); this.th = this.tw / 2; this.bh = this.tw * 0.55;
    const contentH = n * this.th + reserve * this.bh;
    const top = Math.max(10, (this.h - contentH) / 2) + 6;
    this.ox = (this.w - n * this.tw) / 2;
    this.oy = top + reserve * this.bh + (n * this.th) / 2;
  }

  P(x, z, y) { return [this.ox + (x + z) * this.tw / 2, this.oy + (x - z) * this.th / 2 - y * this.bh]; }

  // Called whenever the world may have changed. instant = skip animations.
  update(world, { target = this.target, result = null, instant = false, reset = false, labels = this.labels, say = undefined, scene = this.scene || [], trails = this.trails || [], noDrone = false } = {}) {
    const now = performance.now();
    this.labels = labels; this.scene = scene; this.trails = trails; this.noDrone = noDrone;
    if (say !== undefined && say !== this.say) { this.say = say; this.sayAt = now; }
    if (reset || world !== this.world) {
      this.world = world; this.births.clear(); this.known.clear(); this.say = null; this.alt = null;
      this.drone = { x: world.drone.x, z: world.drone.z, fromX: world.drone.x, fromZ: world.drone.z, t0: 0, dur: 1 };
      this.layout();
      for (const [k, col] of world.columns) col.forEach((_, y) => this.known.add(`${k},${y}`));
    }
    this.target = target; this.result = result;
    for (const [k, col] of world.columns) col.forEach((_, y) => {
      const id = `${k},${y}`;
      if (!this.known.has(id)) { this.known.add(id); if (!instant) this.births.set(id, now); }
    });
    const d = this.drone, cur = this.dronePos(now);
    if (d.x !== world.drone.x || d.z !== world.drone.z) {
      if (instant) Object.assign(d, { x: world.drone.x, z: world.drone.z, fromX: world.drone.x, fromZ: world.drone.z, t0: 0 });
      else {
        const dist = Math.hypot(world.drone.x - cur.x, world.drone.z - cur.z);
        Object.assign(d, { fromX: cur.x, fromZ: cur.z, x: world.drone.x, z: world.drone.z, t0: now, dur: Math.min(this.animMs * Math.max(1, Math.sqrt(dist)), 700) });
      }
    }
  }

  dronePos(now) {
    const d = this.drone, t = d.t0 ? Math.min(1, (now - d.t0) / d.dur) : 1, e = ease(t);
    return { x: d.fromX + (d.x - d.fromX) * e, z: d.fromZ + (d.z - d.fromZ) * e };
  }

  poly(pts, fill, stroke, lw = 1) {
    const c = this.ctx;
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
  }

  cube(x, z, y, color, { alpha = 1, ghost = false, outline = null, lift = 0 } = {}) {
    const c = this.ctx, base = PALETTE[color] || '#999';
    const Y = y + lift;
    const top = [this.P(x, z, Y + 1), this.P(x + 1, z, Y + 1), this.P(x + 1, z + 1, Y + 1), this.P(x, z + 1, Y + 1)];
    const left = [this.P(x, z, Y), this.P(x + 1, z, Y), this.P(x + 1, z, Y + 1), this.P(x, z, Y + 1)];
    const right = [this.P(x + 1, z, Y), this.P(x + 1, z + 1, Y), this.P(x + 1, z + 1, Y + 1), this.P(x + 1, z, Y + 1)];
    c.save();
    c.globalAlpha = alpha;
    if (ghost) {
      c.setLineDash([3, 3]);
      const s = shade(base, 1.1);
      this.poly(left, shade(base, 0.5) + '', null); c.globalAlpha = alpha * 0.9;
      this.poly(right, shade(base, 0.4), null);
      this.poly(top, shade(base, 0.7), null);
      c.globalAlpha = Math.min(1, alpha * 3.2);
      this.poly(top, null, s, 1.2); this.poly(left, null, s, 1.2); this.poly(right, null, s, 1.2);
    } else {
      this.poly(left, shade(base, 0.8), 'rgba(15,17,20,.35)');
      this.poly(right, shade(base, 0.63), 'rgba(15,17,20,.35)');
      this.poly(top, shade(base, 1.08), 'rgba(15,17,20,.35)');
    }
    if (outline) {
      c.setLineDash([]); c.globalAlpha = 1;
      this.poly(top, null, outline, 2.2); this.poly(left, null, outline, 2.2); this.poly(right, null, outline, 2.2);
    }
    c.restore();
  }

  draw(now) {
    const c = this.ctx, w = this.world;
    c.clearRect(0, 0, this.w, this.h);
    if (!w) return;
    const n = w.size;
    // Floor tiles
    for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) {
      const g = w.ground.get(`${x},${z}`);
      const tile = [this.P(x, z, 0), this.P(x + 1, z, 0), this.P(x + 1, z + 1, 0), this.P(x, z + 1, 0)];
      this.poly(tile, (x + z) % 2 ? '#2b2f36' : '#30353d', '#3d434c');
      if (g) {
        const inset = [[x + .12, z + .12], [x + .88, z + .12], [x + .88, z + .88], [x + .12, z + .88]].map(([a, b]) => this.P(a, b, 0));
        this.poly(inset, shade(PALETTE[g], 0.72), shade(PALETTE[g], 1.1), 1.5);
      }
    }
    this.axes(n);

    // Collect drawables in painter order
    const items = [];
    const res = this.result;
    const flagged = new Map();
    if (res) for (const b of [...res.wrong, ...res.extra]) flagged.set(`${b.x},${b.z},${b.y}`, '#ff4d5e');
    for (const [k, col] of w.columns) {
      const [x, z] = k.split(',').map(Number);
      col.forEach((color, y) => items.push({ x, z, y, kind: 'block', color }));
    }
    for (const [k, col] of Object.entries(this.target || {})) {
      const [x, z] = k.split(',').map(Number);
      const have = w.columns.get(k) || [];
      col.forEach((color, y) => { if (have[y] !== color && y >= have.length) items.push({ x, z, y, kind: 'ghost', color }); });
    }
    const pos = this.dronePos(now);
    items.sort((a, b) => (a.x - a.z) - (b.x - b.z) || a.y - b.y || (a.kind === 'ghost') - (b.kind === 'ghost'));

    const droneKey = Math.round(pos.x) - Math.round(pos.z);
    let droneDrawn = !!this.noDrone;
    const drawDrone = () => { this.droneShape(pos, now); droneDrawn = true; };
    for (const it of items) {
      if (!droneDrawn && it.x - it.z > droneKey) drawDrone();
      if (it.kind === 'ghost') {
        const pulse = res && !res.ok ? 0.3 + 0.12 * Math.sin(now / 260) : 0.22;
        this.cube(it.x, it.z, it.y, it.color, { ghost: true, alpha: pulse });
      } else {
        const born = this.births.get(`${it.x},${it.z},${it.y}`);
        let lift = 0, alpha = 1;
        if (born) { const t = Math.min(1, (now - born) / 180); lift = (1 - ease(t)) * 0.7; alpha = 0.4 + 0.6 * t; if (t >= 1) this.births.delete(`${it.x},${it.z},${it.y}`); }
        this.cube(it.x, it.z, it.y, it.color, { lift, alpha, outline: flagged.get(`${it.x},${it.z},${it.y}`) });
      }
    }
    if (!droneDrawn) drawDrone();
    this.drawScene();
    // Faint silhouette on top so the drone is never lost behind tall towers
    if (!this.noDrone) { c.save(); c.globalAlpha = 0.28; this.droneShape(pos, now, true); c.restore(); }
    if (this.labels) this.heightLabels();
    if (this.say) this.bubble(pos, now);
  }

  // Code Lab 02: objects in the scene (spheres at transform.position) and their trails, like a motion path.
  drawScene() {
    const c = this.ctx, R = 0.32;
    if (!this.scene?.length && !this.trails?.length) return;
    const trails = new Map();
    for (const frame of this.trails || []) for (const o of frame) { if (!trails.has(o.id)) trails.set(o.id, []); trails.get(o.id).push(o); }
    for (const [, pts] of trails) {
      c.save();
      c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 1; c.beginPath();
      pts.forEach((o, i) => { const [x, y] = this.P(o.x + 0.5, o.z + 0.5, o.y + R); i ? c.lineTo(x, y) : c.moveTo(x, y); });
      c.stroke();
      for (const o of pts) { const [x, y] = this.P(o.x + 0.5, o.z + 0.5, o.y + R); c.fillStyle = shade(PALETTE[o.color] || '#e7e8eb', 0.9); c.globalAlpha = 0.55; c.beginPath(); c.arc(x, y, 1.8, 0, Math.PI * 2); c.fill(); }
      c.restore();
    }
    const items = [...(this.scene || [])].sort((a, b) => (a.x - a.z) - (b.x - b.z));
    for (const o of items) {
      const base = PALETTE[o.color] || '#e7e8eb';
      const [gx, gy] = this.P(o.x + 0.5, o.z + 0.5, 0);
      c.save();
      c.fillStyle = `rgba(0,0,0,${Math.max(0.12, 0.4 - o.y * 0.05)})`;
      c.beginPath(); c.ellipse(gx, gy, this.tw * R * 0.9, this.th * R * 0.9, 0, 0, Math.PI * 2); c.fill();
      const [x, y] = this.P(o.x + 0.5, o.z + 0.5, o.y + R);
      const r = this.tw * R * 0.72;
      const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
      g.addColorStop(0, shade(base, 1.35)); g.addColorStop(0.6, base); g.addColorStop(1, shade(base, 0.45));
      c.fillStyle = g; c.strokeStyle = 'rgba(15,17,20,.6)'; c.lineWidth = 1;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.stroke();
      c.restore();
    }
  }

  heightLabels() {
    const c = this.ctx, w = this.world;
    const keys = new Set([...w.columns.keys(), ...Object.keys(this.target || {})]);
    c.save();
    c.textAlign = 'center'; c.textBaseline = 'bottom';
    c.font = `800 ${Math.max(11, Math.round(this.tw * 0.3))}px Inter, Segoe UI, Arial, sans-serif`;
    for (const k of keys) {
      const [x, z] = k.split(',').map(Number);
      const h = (w.columns.get(k) || []).length, want = (this.target[k] || []).length;
      const top = Math.max(h, want);
      const [sx, sy] = this.P(x + 0.5, z + 0.5, top + 1);
      const text = want && want !== h ? `${h}/${want}` : String(h);
      c.lineWidth = 4; c.strokeStyle = '#15171a'; c.strokeText(text, sx, sy - 2);
      c.fillStyle = want && want !== h ? '#aab1ba' : '#ffbf00'; c.fillText(text, sx, sy - 2);
    }
    c.restore();
  }

  bubble(pos, now) {
    const c = this.ctx;
    const text = this.say.length > 34 ? this.say.slice(0, 33) + '…' : this.say;
    const alt = (this.alt ?? 1) + 0.9;
    const [sx, sy] = this.P(pos.x + 0.5, pos.z + 0.5, alt);
    const t = Math.min(1, (now - this.sayAt) / 160);
    c.save();
    c.font = '600 12px Inter, Segoe UI, Arial, sans-serif';
    const w = c.measureText(text).width + 18, h = 24;
    let bx = sx - w / 2, by = sy - h - 12 - (1 - t) * 6;
    bx = Math.max(6, Math.min(this.w - w - 6, bx)); by = Math.max(6, by);
    c.globalAlpha = t;
    c.fillStyle = '#f3f4f5'; c.strokeStyle = '#15171a'; c.lineWidth = 1.5;
    c.beginPath(); c.roundRect(bx, by, w, h, 8); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(sx - 6, by + h - 1); c.lineTo(sx, by + h + 8); c.lineTo(sx + 6, by + h - 1); c.fill();
    c.fillStyle = '#17191c'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, bx + w / 2, by + h / 2 + 1);
    c.restore();
  }

  axes(n) {
    const c = this.ctx;
    c.save();
    c.font = '600 10px Inter, Segoe UI, Arial, sans-serif';
    c.fillStyle = '#8f98a4'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const [ax, ay] = this.P(i + 0.5, -0.55, 0); c.fillText(String(i), ax, ay);
      const [bx, by] = this.P(-0.55, i + 0.5, 0); c.fillText(String(i), bx, by);
    }
    c.font = '700 11px Inter, Segoe UI, Arial, sans-serif';
    c.fillStyle = '#e76f6f';
    const [xx, xy] = this.P(n + 0.35, -0.9, 0); c.fillText('X  Right →', xx + 8, xy + 6);
    c.fillStyle = '#6fb0e7';
    const [zx, zy] = this.P(-0.9, n + 0.35, 0); c.fillText('Z  Forward', zx + 6, zy - 8);
    c.restore();
  }

  droneShape(pos, now, silhouette = false) {
    const w = this.world, c = this.ctx;
    const tx = Math.round(pos.x), tz = Math.round(pos.z);
    const colH = (w.columns.get(`${tx},${tz}`) || []).length;
    const target = w.columns.get(`${w.drone.x},${w.drone.z}`) || [];
    // Smooth altitude: the drone climbs over towers instead of jumping
    const wanted = colH + 0.95;
    if (!silhouette) this.alt = this.alt == null || !this.drone.t0 && Math.abs(this.alt - wanted) > 3 ? wanted : this.alt + (wanted - this.alt) * 0.18;
    const alt = (this.alt ?? wanted) + Math.sin(now / 380) * 0.06;
    const [sx, sy] = this.P(pos.x + 0.5, pos.z + 0.5, alt);
    const s = this.tw / 64;
    if (!silhouette) {
      // Shadow and tile marker on the top of the column
      const [gx, gy] = this.P(pos.x + 0.5, pos.z + 0.5, colH);
      c.fillStyle = 'rgba(0,0,0,.35)';
      c.beginPath(); c.ellipse(gx, gy, 15 * s, 7.5 * s, 0, 0, Math.PI * 2); c.fill();
      const x = w.drone.x, z = w.drone.z, top = target.length;
      this.poly([this.P(x, z, top), this.P(x + 1, z, top), this.P(x + 1, z + 1, top), this.P(x, z + 1, top)], null, 'rgba(255,191,0,.85)', 1.6);
    }
    c.save();
    c.translate(sx, sy);
    // arms
    c.strokeStyle = silhouette ? '#ffbf00' : '#23262c'; c.lineWidth = 3 * s; c.lineCap = 'round';
    const arm = [[-17, -6], [17, 6], [-17, 6], [17, -6]];
    c.beginPath(); c.moveTo(arm[0][0] * s, arm[0][1] * s); c.lineTo(arm[1][0] * s, arm[1][1] * s); c.moveTo(arm[2][0] * s, arm[2][1] * s); c.lineTo(arm[3][0] * s, arm[3][1] * s); c.stroke();
    // rotors
    for (const [ax, ay] of arm) {
      c.fillStyle = silhouette ? 'transparent' : 'rgba(210,220,235,.28)';
      c.strokeStyle = silhouette ? '#ffbf00' : 'rgba(230,236,245,.75)'; c.lineWidth = 1.2 * s;
      c.beginPath(); c.ellipse(ax * s, (ay - 3) * s, 9 * s, 3.6 * s, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      if (!silhouette) {
        const a = now / 40 + ax;
        c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 1.4 * s;
        c.beginPath(); c.moveTo((ax - Math.cos(a) * 8) * s, (ay - 3 - Math.sin(a) * 3) * s); c.lineTo((ax + Math.cos(a) * 8) * s, (ay - 3 + Math.sin(a) * 3) * s); c.stroke();
      }
    }
    // body
    c.fillStyle = silhouette ? 'transparent' : '#2b2f36';
    c.strokeStyle = silhouette ? '#ffbf00' : '#15171a'; c.lineWidth = 1.2 * s;
    c.beginPath(); c.ellipse(0, 2 * s, 11 * s, 6.5 * s, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    if (!silhouette) {
      c.fillStyle = '#ffbf00';
      c.beginPath(); c.ellipse(0, -1 * s, 9 * s, 5 * s, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#1a1c20';
      c.beginPath(); c.ellipse(4 * s, 1 * s, 2.4 * s, 1.6 * s, 0, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }
}
