// Lighting Lab: the set (bust, balls, backdrop), the lights and the progressive renderer.
import * as THREE from 'three';
import { HEAD, BACKDROP_Z, BACKDROPS, CARD_COLORS, ALBEDO, lightPos, lightDir, lightColor, lightFrame, allLights, makeHdri, FALSE_COLOR, rad } from './light.js';

// ─── The bust: a compact CC0 sculpt, with a simple geometry fallback if its asset cannot load ──
const gauss = (x, y, cx, cy, sx, sy) => Math.exp(-0.5 * (((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));
function headGeometry() {
  const geo = new THREE.SphereGeometry(1, 128, 96), p = geo.attributes.position;
  const a = 0.076, b = 0.105, c = 0.097;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) * a, y = p.getY(i) * b, z = p.getZ(i) * c;
    const low = Math.min(1, Math.max(0, -y / b));        // jaw and chin: narrower at the bottom
    x *= 1 - 0.2 * low * low; z *= 1 - 0.08 * low;
    const front = Math.max(0, z / c);
    let h = 0;
    // nose: a ridge that grows towards the tip
    const ridge = Math.max(0, Math.min(1, (0.03 - y) / 0.06));
    h += front ** 4 * 0.028 * ridge * gauss(x, y, 0, -0.018, 0.011 + 0.006 * ridge, 0.032);
    h += front ** 4 * 0.006 * gauss(x, y, 0, -0.048, 0.02, 0.008);               // nostrils
    h += front ** 3 * 0.008 * gauss(x, y, 0, 0.032, 0.05, 0.01);                // brow ridge
    for (const s of [-1, 1]) {
      h -= front ** 3 * 0.013 * gauss(x, y, s * 0.032, 0.014, 0.014, 0.012);    // eye sockets
      h += front ** 3 * 0.004 * gauss(x, y, s * 0.032, 0.012, 0.009, 0.006);    // eyeballs
      h += front ** 2 * 0.006 * gauss(x, y, s * 0.048, -0.012, 0.018, 0.016);   // cheekbones
    }
    h += front ** 4 * 0.007 * gauss(x, y, 0, -0.066, 0.022, 0.007);             // lips
    h -= front ** 4 * 0.004 * gauss(x, y, 0, -0.078, 0.02, 0.005);              // under the lip
    h += front ** 3 * 0.008 * gauss(x, y, 0, -0.095, 0.022, 0.012);             // chin
    const n = new THREE.Vector3(x / (a * a), y / (b * b), z / (c * c)).normalize();
    p.setXYZ(i, x + n.x * h, y + n.y * h, z + n.z * h);
  }
  geo.computeVertexNormals();
  return geo;
}
function ellipsoid(rx, ry, rz, cut) {
  const geo = new THREE.SphereGeometry(1, 64, 48, 0, Math.PI * 2, 0, cut ?? Math.PI), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * rx, p.getY(i) * ry, p.getZ(i) * rz);
  geo.computeVertexNormals();
  return geo;
}

// The sculpted bust (tools/make-bust.mjs): 'BST1', vertex and index counts, bounds, quantised positions,
// normals as signed bytes, then 16- or 32-bit indices. Positions are relative to the centre of the head.
export function readBust(buffer) {
  const dv = new DataView(buffer);
  if (String.fromCharCode(...new Uint8Array(buffer, 0, 4)) !== 'BST1') throw new Error('Not a bust file');
  const nv = dv.getUint32(4, true), ni = dv.getUint32(8, true), f = i => dv.getFloat32(12 + i * 4, true);
  const min = [f(0), f(1), f(2)], size = [f(3), f(4), f(5)];
  const q = new Uint16Array(buffer, 36, nv * 3), n8 = new Int8Array(buffer, 36 + nv * 6, nv * 3);
  const idxOff = Math.ceil((36 + nv * 6 + nv * 3) / 4) * 4;
  const index = nv >= 65536 ? new Uint32Array(buffer, idxOff, ni) : new Uint16Array(buffer, idxOff, ni);
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3);
  for (let i = 0; i < nv * 3; i++) { const c = i % 3; pos[i] = min[c] + q[i] / 65535 * size[c]; nor[i] = n8[i] / 127; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeBoundingSphere();
  return geo;
}
const bustData = fetch(new URL('./assets/bust.bin?v=2', import.meta.url)).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); });

export function buildSet(scene) {
  const plaster = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(ALBEDO.plaster, ALBEDO.plaster * 0.98, ALBEDO.plaster * 0.95, THREE.LinearSRGBColorSpace), roughness: 0.65 });
  const cast = m => { m.castShadow = true; m.receiveShadow = true; return m; };
  const set = new THREE.Group(); scene.add(set);
  // The bust: a simple placeholder until the sculpted mesh (assets/bust.bin) has loaded.
  const bust = new THREE.Group(); set.add(bust);
  const head = cast(new THREE.Mesh(headGeometry(), plaster)); head.position.set(...HEAD.c); bust.add(head);
  const neck = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.058, 0.13, 32), plaster)); neck.position.set(0, 1.44, -0.012); bust.add(neck);
  const chest = cast(new THREE.Mesh(ellipsoid(0.18, 0.1, 0.12, Math.PI * 0.66), plaster)); chest.position.set(0, 1.32, -0.02); bust.add(chest);
  const ready = bustData.then(buf => {
    const m = cast(new THREE.Mesh(readBust(buf), plaster)); m.position.set(...HEAD.c);
    bust.clear(); bust.add(m);
  }).catch(err => console.warn('The sculpted bust could not be loaded; using the simple one.', err));
  // A model of the user's own replaces the bust (see setModel).
  // Two-sided, so models with flipped faces still read correctly.
  const own = new THREE.Group(), ownMat = plaster.clone(); ownMat.side = THREE.DoubleSide; ownMat.shadowSide = THREE.BackSide; own.visible = false; set.add(own);
  const setModel = geo => {
    own.clear();
    if (geo) own.add(cast(new THREE.Mesh(geo, ownMat)));
    own.visible = !!geo; bust.visible = !geo;
  };
  const socle = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.18, 32), plaster)); socle.position.set(0, 1.2, -0.02); set.add(socle);
  const lin = v => new THREE.Color().setRGB(v, v, v, THREE.LinearSRGBColorSpace);
  const pedestal = cast(new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.12, 0.3), new THREE.MeshStandardMaterial({ color: lin(0.3), roughness: 0.8 }))); pedestal.position.set(0, 0.56, -0.01); set.add(pedestal);
  // Grey ball (18 %) and chrome ball on a small stand: the reference balls of VFX lighting
  const stand = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.12, 24), new THREE.MeshStandardMaterial({ color: lin(0.3), roughness: 0.8 }))); stand.position.set(0.46, 0.56, 0.05); set.add(stand);
  const grey = cast(new THREE.Mesh(new THREE.SphereGeometry(0.055, 48, 32), new THREE.MeshStandardMaterial({ color: lin(ALBEDO.grey), roughness: 0.55 }))); grey.position.set(0.4, 1.175, 0.05); set.add(grey);
  const chrome = cast(new THREE.Mesh(new THREE.SphereGeometry(0.055, 64, 48), new THREE.MeshStandardMaterial({ color: lin(0.92), metalness: 1, roughness: 0.04 }))); chrome.position.set(0.52, 1.175, 0.05); set.add(chrome);
  // Paper backdrop: a sweep from the floor up the wall
  const backMat = new THREE.MeshStandardMaterial({ color: lin(BACKDROPS.grey), roughness: 0.95 });
  const R = 0.8, profile = [[2.2, 0]], W = 6, verts = [], idx = [];
  for (let i = 0; i <= 24; i++) { const t = (i / 24) * Math.PI / 2; profile.push([BACKDROP_Z + R - R * Math.sin(t), R - R * Math.cos(t)]); }
  profile.push([BACKDROP_Z, 3.4]);
  profile.forEach(([z, y]) => { verts.push(-W / 2, y, z, W / 2, y, z); });
  for (let i = 0; i < profile.length - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 3, k, k + 3, k + 2); }
  const sweep = new THREE.BufferGeometry();
  sweep.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); sweep.setIndex(idx); sweep.computeVertexNormals();
  const backdrop = new THREE.Mesh(sweep, backMat); backdrop.receiveShadow = true; set.add(backdrop);
  // Bounce card (foam board), placed by the app
  const card = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: lin(0.85), roughness: 0.9, side: THREE.DoubleSide }));
  card.castShadow = true; card.visible = false; set.add(card);
  return { set, head: bust, backMat, card, chrome, ready, setModel };
}
export function applySet(parts, state) {
  const v = BACKDROPS[state.backdrop] ?? 0.5;
  parts.backMat.color.setRGB(v, v, v, THREE.LinearSRGBColorSpace);
  const c = state.card;
  parts.card.visible = !!c.on;
  if (c.on) {
    parts.card.position.set(...lightPos({ ...c, target: 'head' }));
    parts.card.lookAt(...HEAD.c);
    parts.card.scale.set(c.size, c.size, 1);
    const col = CARD_COLORS[c.color] || CARD_COLORS.white;
    parts.card.material.color.setRGB(...col, THREE.LinearSRGBColorSpace);
  }
}

// ─── Lights ──────────────────────────────────────────────────────────────────
// Point → PointLight, Spot → SpotLight, Sun → DirectionalLight. An Area light becomes a very wide
// SpotLight whose smooth edge follows the cosine of a flat diffuse panel. Soft shadows come from
// moving the light over its emitting surface (Radius, Size or Angle) at every sample and averaging.
export class Rig {
  constructor(scene, { shadowSize = 1024 } = {}) { this.scene = scene; this.items = []; this.shadowSize = shadowSize; this.key = ''; }
  sync(state) {
    const ls = allLights(state);
    const key = ls.map(l => `${l.on}${l.type}${l.shadow}`).join('|');
    if (key !== this.key) this.rebuild(ls);
    this.key = key;
    this.lights = ls;
    ls.forEach((l, i) => this.place(this.items[i], l, null));
  }
  rebuild(ls) {
    for (const it of this.items) if (it.obj) { this.scene.remove(it.obj); if (it.obj.target) this.scene.remove(it.obj.target); it.obj.dispose?.(); }
    this.items = ls.map(l => {
      if (!l.on) return { obj: null };
      let obj;
      if (l.type === 'SUN') { obj = new THREE.DirectionalLight(); const s = obj.shadow.camera; s.left = -1.6; s.right = 1.6; s.top = 1.6; s.bottom = -1.6; s.near = 0.1; s.far = 30; }
      else if (l.type === 'POINT') { obj = new THREE.PointLight(); obj.decay = 2; obj.shadow.camera.near = 0.05; obj.shadow.camera.far = 30; }
      else { obj = new THREE.SpotLight(); obj.decay = 2; obj.shadow.camera.near = 0.05; obj.shadow.camera.far = 30; }
      obj.castShadow = l.shadow !== false;
      obj.shadow.mapSize.set(this.shadowSize, this.shadowSize);
      obj.shadow.bias = -0.0004; obj.shadow.normalBias = 0.01;
      this.scene.add(obj); if (obj.target) this.scene.add(obj.target);
      return { obj };
    });
  }
  // Put a light in place; jitter = [a, b] in [0, 1)² picks a point on its emitting surface (null = centre).
  place(it, l, jitter) {
    const o = it?.obj; if (!o) return;
    const c = lightColor(l), target = l.card ? [0, 1.55, 0] : l.target === 'backdrop' ? [0, 1.35, BACKDROP_Z] : [0, 1.55, 0];
    o.color.setRGB(c[0], c[1], c[2], THREE.LinearSRGBColorSpace);
    let pos = lightPos(l);
    const { u, v } = lightFrame(l);
    const [ja, jb] = jitter || [0.5, 0.5];
    if (l.type === 'SUN') {
      const r = rad(l.angle) / 2 * Math.sqrt(ja), t = 2 * Math.PI * jb, d = lightDir(l);
      const dd = [d[0] + (u[0] * Math.cos(t) + v[0] * Math.sin(t)) * r, d[1] + (u[1] * Math.cos(t) + v[1] * Math.sin(t)) * r, d[2] + (u[2] * Math.cos(t) + v[2] * Math.sin(t)) * r];
      o.position.set(target[0] + dd[0] * 10, target[1] + dd[1] * 10, target[2] + dd[2] * 10);
      o.intensity = l.strength;
    } else {
      if (l.type === 'AREA') {
        const sx = l.size, sy = l.shape === 'RECTANGLE' ? l.sizeY : l.size;
        let a = ja - 0.5, b = jb - 0.5;
        if (l.shape === 'DISK') { const r = Math.sqrt(ja) / 2, t = 2 * Math.PI * jb; a = r * Math.cos(t); b = r * Math.sin(t); }
        pos = pos.map((p, k) => p + u[k] * a * sx + v[k] * b * sy);
        o.intensity = l.power / Math.PI; o.angle = rad(85); o.penumbra = 1;
      } else {
        const r = l.radius * Math.sqrt(ja), t = 2 * Math.PI * jb;
        pos = pos.map((p, k) => p + (u[k] * Math.cos(t) + v[k] * Math.sin(t)) * r);
        o.intensity = l.power / (4 * Math.PI);
        if (l.type === 'SPOT') { o.angle = Math.min(rad(l.spotSize) / 2, rad(89)); o.penumbra = l.blend; }
      }
      o.position.set(...pos);
    }
    if (o.target) {
      // spots and areas keep pointing along their axis, even when moved over their surface
      const d = lightDir(l);
      o.target.position.set(o.position.x - d[0], o.position.y - d[1], o.position.z - d[2]);
      o.target.updateMatrixWorld();
    }
  }
  jitter(sample) {
    const h = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
    this.lights.forEach((l, i) => this.place(this.items[i], l, [h(sample + 1 + i * 7, 2), h(sample + 1 + i * 7, 3)]));
  }
}

// ─── World ───────────────────────────────────────────────────────────────────
export class World {
  constructor(renderer, scene) { this.pmrem = new THREE.PMREMGenerator(renderer); this.scene = scene; this.key = ''; }
  sync(w, showBackground = true) {
    const key = w.mode === 'hdri' ? `h${w.hdri}${w.rot}` : `c${w.color.join()}`;
    if (key !== this.key) {
      this.env?.dispose(); this.tex?.dispose();
      const px = w.mode === 'hdri' ? makeHdri(w.hdri, w.rot) : new Float32Array(Array.from({ length: 4 * 8 * 4 }, (_, i) => i % 4 === 3 ? 1 : w.color[i % 4]));
      const [W, H] = w.mode === 'hdri' ? [256, 128] : [8, 4];
      this.tex = new THREE.DataTexture(px, W, H, THREE.RGBAFormat, THREE.FloatType);
      this.tex.mapping = THREE.EquirectangularReflectionMapping; this.tex.colorSpace = THREE.LinearSRGBColorSpace;
      this.tex.magFilter = this.tex.minFilter = THREE.LinearFilter; this.tex.needsUpdate = true;
      this.env = this.pmrem.fromEquirectangular(this.tex).texture;
      this.key = key;
    }
    this.scene.environment = this.env;
    this.scene.environmentIntensity = w.strength;
    this.scene.background = showBackground ? this.tex : null;
    this.scene.backgroundIntensity = w.strength;
  }
}

// ─── The progressive renderer ────────────────────────────────────────────────
// Every sample renders the scene (lights moved over their surfaces) into a float target, and the
// average is kept in another. The display applies Exposure and the View Transform, like Blender's
// Color Management: Standard (clip), AgX (roll-off) or False Color.
const QUAD_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
export class Progressive {
  constructor(renderer, w, h) {
    this.renderer = renderer; this.n = 0;
    const opt = { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: true, samples: 4 };
    this.sample = new THREE.WebGLRenderTarget(w, h, opt);
    this.acc = [new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, depthBuffer: false }), new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, depthBuffer: false })];
    this.quadScene = new THREE.Scene(); this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); this.quadScene.add(this.quad);
    this.blend = new THREE.ShaderMaterial({ uniforms: { prev: { value: null }, cur: { value: null }, w: { value: 1 } }, vertexShader: QUAD_VS,
      fragmentShader: 'uniform sampler2D prev, cur; uniform float w; varying vec2 vUv; void main(){ gl_FragColor = mix(texture2D(prev, vUv), texture2D(cur, vUv), w); }', depthTest: false });
    const bands = FALSE_COLOR.map((b, i) => `if (s < ${b.to.toFixed(2)}) return vec3(${b.color.map(v => v.toFixed(3)).join(',')});`).join('\n');
    this.display = new THREE.ShaderMaterial({
      uniforms: { src: { value: null }, gain: { value: 1 }, mode: { value: 1 }, toneMappingExposure: { value: 1 } }, vertexShader: QUAD_VS, depthTest: false,
      fragmentShader: `#include <common>
        #include <tonemapping_pars_fragment>
        uniform sampler2D src; uniform float gain; uniform int mode; varying vec2 vUv;
        vec3 falseColor(float s) { ${bands} return vec3(1.0); }
        vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
        void main() {
          vec3 c = texture2D(src, vUv).rgb * gain;
          if (mode == 2) { float y = dot(c, vec3(0.2126, 0.7152, 0.0722)); gl_FragColor = vec4(toSRGB(falseColor(log2(max(y, 1e-6) / 0.18))), 1.0); return; }
          if (mode == 1) c = AgXToneMapping(c); else c = clamp(c, 0.0, 1.0);
          gl_FragColor = vec4(toSRGB(clamp(c, 0.0, 1.0)), 1.0);
        }` });
  }
  reset() { this.n = 0; }
  add(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.sample); r.render(scene, camera);
    this.blend.uniforms.prev.value = this.acc[0].texture; this.blend.uniforms.cur.value = this.sample.texture; this.blend.uniforms.w.value = 1 / (this.n + 1);
    this.quad.material = this.blend; r.setRenderTarget(this.acc[1]); r.render(this.quadScene, this.quadCam);
    this.acc.reverse(); this.n++;
    r.setRenderTarget(null);
  }
  show(exposure, transform) {
    const r = this.renderer;
    this.display.uniforms.src.value = this.acc[0].texture; this.display.uniforms.gain.value = Math.pow(2, exposure);
    this.display.uniforms.mode.value = transform === 'False Color' ? 2 : transform === 'AgX' ? 1 : 0;
    this.quad.material = this.display; r.setRenderTarget(null); r.render(this.quadScene, this.quadCam);
  }
  // Scene-linear RGB of a pixel of the average (x, y in 0…1 from the top left).
  read(x, y) {
    const t = this.acc[0], px = new Float32Array(4);
    this.renderer.readRenderTargetPixels(t, Math.floor(x * t.width), Math.floor((1 - y) * t.height), 1, 1, px);
    return [px[0], px[1], px[2]];
  }
}
