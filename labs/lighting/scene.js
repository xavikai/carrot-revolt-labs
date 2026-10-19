// Lighting Lab: the set (bust, balls, backdrop), the lights and the progressive renderer.
import * as THREE from 'three';
import { HEAD, BACKDROP_Z, BACKDROPS, CARD_COLORS, ALBEDO, TARGETS, lightPos, lightDir, lightColor, lightFrame, allLights, makeHdri, FALSE_COLOR, rad, fogCoeffs, cookieOf, linkOk, shadowOk, FALLOFF_EXP, IES } from './light.js?v=4';

// ─── Blender's falloff options inside three.js lights ─────────────────────────
// three.js gives every point and spot light a decay exponent. The lab packs more into it:
//   decay = e + 4·round(R·1000) (+16000 when Soft Falloff is off)
// e is the Light Falloff (2 Quadratic, 1 Linear, 0 Constant) and R the Radius. With Soft Falloff on, the
// light falls as 1/(d² + R²), like Blender before 4.0; off, the lamp is a sphere and nothing inside it is
// lit. The cutoff distance is EEVEE's Custom Distance, and cifogFog dims the light inside the fog volume.
THREE.ShaderChunk.lights_pars_begin = THREE.ShaderChunk.lights_pars_begin.replace(
  /float getDistanceAttenuation\([\s\S]*?\n}\n/,
  `uniform float cifogFog;
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float code = decayExponent;
	bool sphere = code > 15999.0;
	if ( sphere ) code -= 16000.0;
	float k = floor( code / 4.0 + 0.001 );
	float e = code - 4.0 * k;
	float r = k / 1000.0;
	float distanceFalloff;
	if ( sphere ) distanceFalloff = lightDistance < r ? 0.0 : 1.0 / max( pow( lightDistance, e ), 0.01 );
	else distanceFalloff = 1.0 / max( pow( lightDistance, e ) + ( e > 1.5 ? r * r : 0.0 ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff * exp( - cifogFog * lightDistance );
}
`);
if (!THREE.ShaderChunk.lights_pars_begin.includes('cifogFog')) console.warn('Lighting Lab: the light falloff patch did not apply.');
export const FOG = { value: 0 };
// Every material of the set reads the fog density.
function fogged(m) { m.onBeforeCompile = sh => { sh.uniforms.cifogFog = FOG; }; return m; }
export function decayCode(l) {
  const e = FALLOFF_EXP[l.falloff] ?? 2;
  if (l.type === 'AREA' || l.card || e !== 2) return e;
  const k = Math.round(Math.min(l.radius || 0, 3.9) * 1000);
  return l.softFalloff === false && k > 0 ? 16000 + e + 4 * k : e + 4 * k;
}

// ─── Cookies: gobos, IES profiles and Spread projected by spot lights ─────────
// A texture in the same projection three.js uses for SpotLight.map (its shadow camera). The camera's
// x axis is −u of lightFrame, so the texture's s runs along −u.
const cookieCache = new Map();
export function cookieTexture(ck, size = 256) {
  if (cookieCache.has(ck.key)) return cookieCache.get(ck.key);
  const data = new Uint16Array(size * size * 4), T = ck.tanHalf;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = -((i + 0.5) / size * 2 - 1) * T, y = ((j + 0.5) / size * 2 - 1) * T;
    const h = THREE.DataUtils.toHalfFloat(Math.max(0, ck.f(x, y))), k = (j * size + i) * 4;
    data[k] = data[k + 1] = data[k + 2] = h; data[k + 3] = THREE.DataUtils.toHalfFloat(1);
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
  if (cookieCache.size > 40) { for (const t of cookieCache.values()) t.dispose(); cookieCache.clear(); }
  cookieCache.set(ck.key, tex);
  return tex;
}

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
  const plaster = fogged(new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(ALBEDO.plaster, ALBEDO.plaster * 0.98, ALBEDO.plaster * 0.95, THREE.LinearSRGBColorSpace), roughness: 0.65 }));
  const cast = (m, link = 'bust') => { m.castShadow = true; m.receiveShadow = true; m.userData.link = link; return m; };
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
  const own = new THREE.Group(), ownMat = fogged(plaster.clone()); ownMat.side = THREE.DoubleSide; ownMat.shadowSide = THREE.BackSide; own.visible = false; set.add(own);
  const setModel = geo => {
    own.clear();
    if (geo) own.add(cast(new THREE.Mesh(geo, ownMat)));
    own.visible = !!geo; bust.visible = !geo;
  };
  const socle = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.18, 32), plaster)); socle.position.set(0, 1.2, -0.02); set.add(socle);
  const lin = v => new THREE.Color().setRGB(v, v, v, THREE.LinearSRGBColorSpace);
  const pedestal = cast(new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.12, 0.3), fogged(new THREE.MeshStandardMaterial({ color: lin(0.3), roughness: 0.8 })))); pedestal.position.set(0, 0.56, -0.01); set.add(pedestal);
  // Grey ball (18 %) and chrome ball on a small stand: the reference balls of VFX lighting
  const stand = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.12, 24), fogged(new THREE.MeshStandardMaterial({ color: lin(0.3), roughness: 0.8 }))), 'balls'); stand.position.set(0.46, 0.56, 0.05); set.add(stand);
  const grey = cast(new THREE.Mesh(new THREE.SphereGeometry(0.055, 48, 32), fogged(new THREE.MeshStandardMaterial({ color: lin(ALBEDO.grey), roughness: 0.55 }))), 'balls'); grey.position.set(0.4, 1.175, 0.05); set.add(grey);
  const chrome = cast(new THREE.Mesh(new THREE.SphereGeometry(0.055, 64, 48), fogged(new THREE.MeshStandardMaterial({ color: lin(0.92), metalness: 1, roughness: 0.04 }))), 'balls'); chrome.position.set(0.52, 1.175, 0.05); set.add(chrome);
  // Paper backdrop: a sweep from the floor up the wall
  const backMat = fogged(new THREE.MeshStandardMaterial({ color: lin(BACKDROPS.grey), roughness: 0.95 }));
  const R = 0.8, profile = [[2.2, 0]], W = 6, verts = [], idx = [];
  for (let i = 0; i <= 24; i++) { const t = (i / 24) * Math.PI / 2; profile.push([BACKDROP_Z + R - R * Math.sin(t), R - R * Math.cos(t)]); }
  profile.push([BACKDROP_Z, 3.4]);
  profile.forEach(([z, y]) => { verts.push(-W / 2, y, z, W / 2, y, z); });
  for (let i = 0; i < profile.length - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 3, k, k + 3, k + 2); }
  const sweep = new THREE.BufferGeometry();
  sweep.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); sweep.setIndex(idx); sweep.computeVertexNormals();
  const backdrop = new THREE.Mesh(sweep, backMat); backdrop.receiveShadow = true; backdrop.userData.link = 'backdrop'; set.add(backdrop);
  // Bounce card (foam board), placed by the app
  const card = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fogged(new THREE.MeshStandardMaterial({ color: lin(0.85), roughness: 0.9, side: THREE.DoubleSide })));
  card.castShadow = true; card.userData.link = 'card'; card.visible = false; set.add(card);
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
  // A light is drawn by a three.js SpotLight when it has a cone: Spot, Area, or a Point with an IES profile.
  static coned(l) { return l.type === 'SPOT' || l.type === 'AREA' || (l.type === 'POINT' && l.ies && l.ies !== 'none'); }
  sync(state) {
    const ls = allLights(state);
    const key = ls.map(l => `${l.on}${l.type}${l.shadow}${Rig.coned(l)}`).join('|');
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
      else if (!Rig.coned(l)) { obj = new THREE.PointLight(); obj.decay = 2; obj.shadow.camera.near = 0.05; obj.shadow.camera.far = 30; }
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
    it.l = l;
    const c = lightColor(l), target = l.card ? TARGETS.head : TARGETS[l.target || 'head'];
    o.color.setRGB(c[0], c[1], c[2], THREE.LinearSRGBColorSpace);
    let pos = lightPos(l);
    const { u, v, w } = lightFrame(l);
    const [ja, jb] = jitter || [0.5, 0.5];
    if (l.type === 'SUN') {
      const r = rad(l.angle) / 2 * Math.sqrt(ja), t = 2 * Math.PI * jb, d = lightDir(l);
      const dd = [d[0] + (u[0] * Math.cos(t) + v[0] * Math.sin(t)) * r, d[1] + (u[1] * Math.cos(t) + v[1] * Math.sin(t)) * r, d[2] + (u[2] * Math.cos(t) + v[2] * Math.sin(t)) * r];
      o.position.set(target[0] + dd[0] * 10, target[1] + dd[1] * 10, target[2] + dd[2] * 10);
      o.intensity = l.strength;
    } else {
      const ck = cookieOf(l);
      o.decay = decayCode(l);
      o.distance = l.customDist ? Math.max(0.05, l.customDistance) : 0;
      if (l.type === 'AREA') {
        const sx = l.size, sy = l.shape === 'RECTANGLE' ? l.sizeY : l.size;
        let a = ja - 0.5, b = jb - 0.5;
        if (l.shape === 'DISK') { const r = Math.sqrt(ja) / 2, t = 2 * Math.PI * jb; a = r * Math.cos(t); b = r * Math.sin(t); }
        pos = pos.map((p, k) => p + u[k] * a * sx + v[k] * b * sy);
        o.intensity = l.power / Math.PI;
        // no Spread: the smooth edge of a 170° cone follows the cosine of a panel; with Spread, a cookie
        // holds the cosine and the grid, inside a cone of Spread/2
        if (ck) { o.angle = Math.atan(ck.tanHalf); o.penumbra = 0.02; } else { o.angle = rad(85); o.penumbra = 1; }
      } else {
        // Soft Falloff off: the lamp is a sphere lit from its centre, so nothing inside it gets light
        const sphere = l.softFalloff === false && (FALLOFF_EXP[l.falloff] ?? 2) === 2 && l.radius > 0;
        const r = sphere ? 0 : l.radius * Math.sqrt(ja), t = 2 * Math.PI * jb;
        pos = pos.map((p, k) => p + (u[k] * Math.cos(t) + v[k] * Math.sin(t)) * r);
        o.intensity = l.power / (4 * Math.PI);
        if (l.type === 'SPOT') { o.angle = Math.min(rad(l.spotSize) / 2, rad(89)); o.penumbra = Math.max(0.02, l.blend); }
        else if (o.isSpotLight) { o.angle = rad(Math.min(IES[l.ies].cutoff + 2, 85)); o.penumbra = 0.02; }
      }
      if (o.isSpotLight) {
        const tex = ck ? cookieTexture(ck) : null;
        if (o.map !== tex) o.map = tex;
        // the projection of the cookie uses the same "up" as lightFrame
        o.shadow.camera.up.set(...(Math.abs(w[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0]));
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
  // Light and Shadow Linking: the lights that only reach some objects, or whose shadows only some objects cast.
  linked() { const set = o => o && Object.values(o).some(Boolean); return this.items.filter(it => it.obj && (set(it.l?.link) || set(it.l?.shadowLink))); }
}

// ─── Light and Shadow Linking in the render ───────────────────────────────────
// First every light that is not linked lights the whole set. Then each linked light is rendered alone and
// added on top, only on the objects it may reach (the others only hide what is behind them), and only the
// objects of its Blocker Collection cast its shadows.
const DEPTH_ONLY = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
function additive(m) {
  if (!m.userData.additive) {
    const c = m.clone(); c.blending = THREE.AdditiveBlending; c.onBeforeCompile = m.onBeforeCompile; m.userData.additive = c;
  }
  const c = m.userData.additive; if (c.color && m.color) c.color.copy(m.color);
  return c;
}
export function renderLinked(r, scene, camera, rig) {
  const linked = rig.linked();
  if (!linked.length) { r.render(scene, camera); return; }
  for (const it of linked) it.obj.visible = false;
  r.render(scene, camera);
  const others = rig.items.filter(it => it.obj && !linked.includes(it)), bg = scene.background, env = scene.environment, auto = r.autoClear;
  for (const it of others) it.obj.visible = false;
  scene.background = null; scene.environment = null; r.autoClear = false;
  const meshes = []; scene.traverse(o => { if (o.isMesh && o.visible) meshes.push(o); });
  for (const it of linked) {
    it.obj.visible = true;
    const saved = meshes.map(m => [m, m.material, m.renderOrder, m.castShadow]);
    for (const m of meshes) {
      const obj = m.userData.link || 'other';
      if (linkOk(it.l, obj)) m.material = additive(m.material);
      else { m.material = DEPTH_ONLY; m.renderOrder = -1; }
      m.castShadow = m.castShadow && shadowOk(it.l, obj);
    }
    r.clearDepth(); r.render(scene, camera);
    for (const [m, mat, ro, cs] of saved) { m.material = mat; m.renderOrder = ro; m.castShadow = cs; }
    it.obj.visible = false;
  }
  for (const it of [...others, ...linked]) it.obj.visible = true;
  scene.background = bg; scene.environment = env; r.autoClear = auto;
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

// ─── The fog volume ──────────────────────────────────────────────────────────
// Fog_Volume is a cube around the set with a Volume Scatter shader (Density, Anisotropy). After every
// sample, a pass marches along each camera ray through the fog: the surface behind is dimmed by
// exp(−Density · distance), and every step adds the light that the fog scatters towards the camera
// (Henyey–Greenstein phase with the Anisotropy). Scattering and extinction are per colour channel, so a
// Principled Volume can tint the beam and absorb light (see fogCoeffs). The lights are the same three.js lights, at the same
// jittered positions, with their cones, cookies (gobos, IES, Spread), falloff and Custom Distance; the
// bust, the pedestal and the stand of the balls cast their shadows into the fog as simple shapes.
export const FOG_BOX = { min: [-3, 0, BACKDROP_Z], max: [3, 3.4, 2.8] };
const NL = 6;
const VOLUME_FS = `
#define NL ${NL}
uniform sampler2D tColor, tDepth;
uniform mat4 projInv, camWorld; uniform vec3 camPos;
uniform float g, seed; uniform vec3 sigS, sigT, boxMin, boxMax;
uniform int nL;
uniform vec3 lPos[NL], lAxis[NL], lCol[NL];
uniform vec4 lPar[NL];
uniform float lCut[NL], lMapOn[NL];
uniform mat4 lMat[NL];
uniform sampler2D m0, m1, m2, m3, m4, m5;
varying vec2 vUv;
vec4 cookie(int i, vec2 uv) {
  if (i == 0) return texture2D(m0, uv); if (i == 1) return texture2D(m1, uv); if (i == 2) return texture2D(m2, uv);
  if (i == 3) return texture2D(m3, uv); if (i == 4) return texture2D(m4, uv); return texture2D(m5, uv);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
bool hitSphere(vec3 o, vec3 d, float len, vec3 c, float r) {
  vec3 oc = o - c; float b = dot(oc, d), q = dot(oc, oc) - r * r, h = b * b - q;
  if (h < 0.0) return false;
  float t = -b - sqrt(h); return t > 1e-3 && t < len;
}
bool hitBox(vec3 o, vec3 d, float len, vec3 bmin, vec3 bmax) {
  vec3 inv = 1.0 / d, t0 = (bmin - o) * inv, t1 = (bmax - o) * inv, lo = min(t0, t1), hi = max(t0, t1);
  float tn = max(max(lo.x, lo.y), lo.z), tf = min(min(hi.x, hi.y), hi.z);
  return tf >= max(tn, 1e-3) && tn < len;
}
bool blocked(vec3 o, vec3 d, float len) {
  return hitSphere(o, d, len, vec3(${HEAD.c.join(', ')}), 0.105) || hitSphere(o, d, len, vec3(0.0, 1.32, -0.02), 0.15)
    || hitBox(o, d, len, vec3(-0.17, 0.0, -0.16), vec3(0.17, 1.29, 0.14)) || hitBox(o, d, len, vec3(0.36, 0.0, -0.05), vec3(0.58, 1.23, 0.15));
}
float atten(float dl, float code, float cut) {
  bool sphere = code > 15999.0; if (sphere) code -= 16000.0;
  float k = floor(code / 4.0 + 0.001), e = code - 4.0 * k, r = k / 1000.0, f;
  if (sphere) f = dl < r ? 0.0 : 1.0 / max(pow(dl, e), 0.01);
  else f = 1.0 / max(pow(dl, e) + (e > 1.5 ? r * r : 0.0), 0.01);
  if (cut > 0.0) { float q = clamp(1.0 - pow(dl / cut, 4.0), 0.0, 1.0); f *= q * q; }
  return f;
}
float phaseHG(float c) { float g2 = g * g; return (1.0 - g2) / (12.566371 * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5)); }
void main() {
  vec3 col = texture2D(tColor, vUv).rgb;
  float z = texture2D(tDepth, vUv).x;
  vec4 v = projInv * vec4(vUv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0); v /= v.w;
  vec3 wp = (camWorld * vec4(v.xyz, 1.0)).xyz, rd = normalize(wp - camPos);
  float tSurf = z >= 0.99999 ? 1e6 : length(wp - camPos);
  vec3 inv = 1.0 / rd, t0 = (boxMin - camPos) * inv, t1 = (boxMax - camPos) * inv, lo = min(t0, t1), hi = max(t0, t1);
  float tin = max(max(max(lo.x, lo.y), lo.z), 0.0), tout = min(min(hi.x, hi.y), hi.z), tEnd = min(tSurf, tout);
  if (tEnd <= tin) { gl_FragColor = vec4(col, 1.0); return; }
  const int N = 48;
  float dt = (tEnd - tin) / float(N), j = fract(hash(gl_FragCoord.xy) + seed);
  vec3 L = vec3(0.0);
  for (int s = 0; s < N; s++) {
    float t = tin + (float(s) + j) * dt; vec3 x = camPos + rd * t;
    vec3 S = vec3(0.0);
    for (int i = 0; i < NL; i++) {
      if (i >= nL) break;
      vec4 P = lPar[i]; vec3 wi, toL; float a = 1.0, dl = 30.0;
      if (P.x > 1.5) { toL = lAxis[i]; wi = -toL; }
      else {
        vec3 dv = lPos[i] - x; dl = length(dv); toL = dv / dl; wi = -toL;
        a = atten(dl, P.w, lCut[i]);
        if (P.x > 0.5) {
          a *= smoothstep(P.y, P.z, dot(wi, lAxis[i]));
          if (a > 0.0 && lMapOn[i] > 0.5) {
            vec4 c = lMat[i] * vec4(x, 1.0); vec3 uvw = c.xyz / c.w;
            a = all(lessThan(abs(uvw * 2.0 - 1.0), vec3(1.0))) ? a * cookie(i, uvw.xy).r : 0.0;
          }
        }
      }
      if (a <= 0.0 || blocked(x, toL, dl)) continue;
      S += lCol[i] * a * phaseHG(dot(wi, -rd)) * (P.x > 1.5 ? vec3(1.0) : exp(-sigT * dl));
    }
    L += exp(-sigT * (t - tin)) * sigS * S * dt;
  }
  gl_FragColor = vec4(col * exp(-sigT * (tEnd - tin)) + L, 1.0);
}`;
export class Volume {
  constructor() {
    const u = { tColor: { value: null }, tDepth: { value: null }, projInv: { value: new THREE.Matrix4() }, camWorld: { value: new THREE.Matrix4() }, camPos: { value: new THREE.Vector3() },
      sigS: { value: new THREE.Vector3() }, sigT: { value: new THREE.Vector3() }, g: { value: 0 }, seed: { value: 0 }, boxMin: { value: new THREE.Vector3(...FOG_BOX.min) }, boxMax: { value: new THREE.Vector3(...FOG_BOX.max) },
      nL: { value: 0 }, lPos: { value: [] }, lAxis: { value: [] }, lCol: { value: [] }, lPar: { value: [] }, lCut: { value: [] }, lMapOn: { value: [] }, lMat: { value: [] } };
    for (let i = 0; i < NL; i++) { u.lPos.value.push(new THREE.Vector3()); u.lAxis.value.push(new THREE.Vector3()); u.lCol.value.push(new THREE.Vector3()); u.lPar.value.push(new THREE.Vector4()); u.lCut.value.push(0); u.lMapOn.value.push(0); u.lMat.value.push(new THREE.Matrix4()); u['m' + i] = { value: null }; }
    this.mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: QUAD_VS, fragmentShader: VOLUME_FS, depthTest: false });
    this.blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); this.blank.needsUpdate = true;
  }
  setup(fog, camera, rig, sampleIndex) {
    const u = this.mat.uniforms;
    const k = fogCoeffs(fog); u.sigS.value.set(...k.sigS); u.sigT.value.set(...k.sigT); u.g.value = Math.max(-0.95, Math.min(0.95, fog.anisotropy)); u.seed.value = (sampleIndex * 0.618034) % 1;
    u.projInv.value.copy(camera.projectionMatrixInverse); u.camWorld.value.copy(camera.matrixWorld); u.camPos.value.setFromMatrixPosition(camera.matrixWorld);
    let n = 0;
    rig.items.forEach(it => {
      const o = it.obj, l = it.l; if (!o || !l || n >= NL) return;
      const k = (l.volume ?? 1) * o.intensity; if (k <= 0) return;
      u.lCol.value[n].set(o.color.r * k, o.color.g * k, o.color.b * k);
      if (o.isDirectionalLight) {
        u.lAxis.value[n].copy(o.position).sub(o.target.position).normalize();
        u.lPar.value[n].set(2, 0, 0, 0);
      } else {
        u.lPos.value[n].copy(o.position);
        if (o.isSpotLight) {
          u.lAxis.value[n].copy(o.target.position).sub(o.position).normalize();
          u.lPar.value[n].set(1, Math.cos(o.angle), Math.cos(o.angle * (1 - o.penumbra)), o.decay);
        } else u.lPar.value[n].set(0, 0, 0, o.decay);
        u.lCut.value[n] = o.distance;
      }
      const map = o.isSpotLight && o.map;
      u.lMapOn.value[n] = map ? 1 : 0; u['m' + n].value = map || this.blank;
      if (map) { o.shadow.updateMatrices(o); u.lMat.value[n].copy(o.shadow.matrix); }
      n++;
    });
    for (let i = n; i < NL; i++) u['m' + i].value = this.blank;
    u.nL.value = n;
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
    const opt = { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: true, samples: 4, depthTexture: new THREE.DepthTexture(w, h, THREE.FloatType) };
    this.sample = new THREE.WebGLRenderTarget(w, h, opt);
    this.fogged = new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, depthBuffer: false });
    this.volume = new Volume();
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
  // One sample: the set (with Light Linking passes if needed), then the fog volume if it is on.
  add(scene, camera, rig = null, fog = null) {
    const r = this.renderer;
    r.setRenderTarget(this.sample);
    if (rig) renderLinked(r, scene, camera, rig); else r.render(scene, camera);
    let cur = this.sample.texture;
    if (fog?.on && fog.density > 0 && rig) {
      const v = this.volume; v.setup(fog, camera, rig, this.n);
      v.mat.uniforms.tColor.value = this.sample.texture; v.mat.uniforms.tDepth.value = this.sample.depthTexture;
      this.quad.material = v.mat; r.setRenderTarget(this.fogged); r.render(this.quadScene, this.quadCam);
      cur = this.fogged.texture;
    }
    this.blend.uniforms.prev.value = this.acc[0].texture; this.blend.uniforms.cur.value = cur; this.blend.uniforms.w.value = 1 / (this.n + 1);
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
