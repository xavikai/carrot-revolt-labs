// Lighting Lab: read a model of the user's own (.glb, .obj or .stl) as a single geometry, and fit it on
// the socle where the bust stands. Only the shape is read: the lab gives it the plaster material.
import * as THREE from '../../vendor/three.module.js';

const MAX_TRIS = 1500000;

// OBJ: v and f lines (polygons are fanned into triangles, negative indices allowed).
export function parseOBJ(text) {
  const v = [], idx = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('v ')) { const p = line.trim().split(/\s+/); v.push(+p[1], +p[2], +p[3]); }
    else if (line.startsWith('f ')) {
      const ids = line.trim().split(/\s+/).slice(1).map(s => { const n = parseInt(s, 10); return n < 0 ? v.length / 3 + n : n - 1; });
      for (let i = 1; i < ids.length - 1; i++) idx.push(ids[0], ids[i], ids[i + 1]);
    }
  }
  if (!idx.length) throw new Error('no faces');
  return { pos: new Float32Array(v), idx };
}
// Triangle soups (STL) share their corners, so the model gets smooth normals.
function weld(pos) {
  const map = new Map(), out = [], idx = [];
  for (let i = 0; i < pos.length; i += 3) {
    const key = `${Math.round(pos[i] * 1e5)},${Math.round(pos[i + 1] * 1e5)},${Math.round(pos[i + 2] * 1e5)}`;
    let j = map.get(key);
    if (j == null) { j = out.length / 3; map.set(key, j); out.push(pos[i], pos[i + 1], pos[i + 2]); }
    idx.push(j);
  }
  return { pos: new Float32Array(out), idx };
}
// STL, binary or ASCII.
export function parseSTL(buffer) {
  const dv = new DataView(buffer);
  const n = buffer.byteLength >= 84 ? dv.getUint32(80, true) : 0;
  if (n && 84 + n * 50 === buffer.byteLength) {
    const pos = new Float32Array(n * 9);
    for (let t = 0; t < n; t++) for (let k = 0; k < 9; k++) pos[t * 9 + k] = dv.getFloat32(84 + t * 50 + 12 + k * 4, true);
    return weld(pos);
  }
  const text = new TextDecoder().decode(buffer), v = [];
  for (const m of text.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)) v.push(+m[1], +m[2], +m[3]);
  if (!v.length) throw new Error('no faces');
  return weld(v);
}
// GLB (binary glTF 2.0): every triangle primitive of the default scene, with the node transforms.
export function parseGLB(buffer) {
  const dv = new DataView(buffer);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a .glb file');
  let off = 12, json = null, bin = null;
  while (off < buffer.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, off + 8, len)));
    else if (type === 0x004e4942) bin = new Uint8Array(buffer, off + 8, len);
    off += 8 + len;
  }
  if (!json || !bin) throw new Error('empty .glb');
  if ((json.extensionsUsed || []).some(e => /draco|meshopt/i.test(e))) throw new Error('compressed');
  const read = (ai, comps) => {
    const a = json.accessors[ai], bv = json.bufferViews[a.bufferView], base = bin.byteOffset + (bv.byteOffset || 0) + (a.byteOffset || 0);
    const size = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[a.componentType], stride = bv.byteStride || size * comps;
    const d = new DataView(bin.buffer), out = new Array(a.count * comps);
    const get = { 5121: o => d.getUint8(o), 5123: o => d.getUint16(o, true), 5125: o => d.getUint32(o, true), 5126: o => d.getFloat32(o, true) }[a.componentType];
    for (let i = 0; i < a.count; i++) for (let c = 0; c < comps; c++) out[i * comps + c] = get(base + i * stride + c * size);
    return out;
  };
  const pos = [], idx = [];
  const visit = (ni, parent) => {
    const n = json.nodes[ni], m = new THREE.Matrix4();
    if (n.matrix) m.fromArray(n.matrix);
    else m.compose(new THREE.Vector3(...(n.translation || [0, 0, 0])), new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(n.scale || [1, 1, 1])));
    const world = parent.clone().multiply(m);
    if (n.mesh != null) for (const p of json.meshes[n.mesh].primitives) {
      if (p.mode != null && p.mode !== 4) continue;
      const P = read(p.attributes.POSITION, 3), start = pos.length / 3, v = new THREE.Vector3();
      for (let i = 0; i < P.length; i += 3) { v.set(P[i], P[i + 1], P[i + 2]).applyMatrix4(world); pos.push(v.x, v.y, v.z); }
      if (p.indices != null) for (const i of read(p.indices, 1)) idx.push(start + i);
      else for (let i = 0; i < P.length / 3; i++) idx.push(start + i);
    }
    for (const c of n.children || []) visit(c, world);
  };
  const scene = json.scenes?.[json.scene ?? 0];
  for (const ni of scene ? scene.nodes : json.nodes.map((_, i) => i)) visit(ni, new THREE.Matrix4());
  if (!idx.length) throw new Error('no faces');
  return { pos: new Float32Array(pos), idx };
}
export function parseModel(name, buffer) {
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'glb') return parseGLB(buffer);
  if (ext === 'obj') return parseOBJ(new TextDecoder().decode(buffer));
  if (ext === 'stl') return parseSTL(buffer);
  throw new Error('format');
}
// Build the geometry, turned as asked (zUp: the file has Z up, as Blender's axes; turn: quarter turns
// around the vertical), then scaled to 0.4 m tall and put on the socle, centred like the bust.
export function fitModel(data, { zUp = false, turn = 0 } = {}) {
  const n = data.pos.length / 3, tris = data.idx ? data.idx.length / 3 : n / 3;
  if (tris > MAX_TRIS) throw new Error('too big');
  const p = new Float32Array(data.pos), a = turn * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
  for (let i = 0; i < n; i++) {
    let x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
    if (zUp) [y, z] = [z, -y];
    p[i * 3] = c * x + s * z; p[i * 3 + 1] = y; p[i * 3 + 2] = -s * x + c * z;
  }
  // Faces that point inwards (the volume comes out negative) are turned round, so the normals point out.
  let idx = data.idx ? [...data.idx] : null;
  if (idx) {
    let vol = 0;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      vol += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
    }
    if (vol < 0) for (let t = 0; t < idx.length; t += 3) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]];
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  if (idx) g.setIndex(idx);
  g.computeBoundingBox();
  const b = g.boundingBox, size = b.getSize(new THREE.Vector3());
  const k = Math.min(0.4 / Math.max(size.y, 1e-6), 0.44 / Math.max(size.x, 1e-6), 0.34 / Math.max(size.z, 1e-6));
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  g.scale(k, k, k); g.translate(0, 1.285, -0.02);
  g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}
