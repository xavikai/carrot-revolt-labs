// Carrot Revolt Labs · Geometry Nodes · the 3D Viewport, drawn like Blender's Solid shading.
import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import { MAT } from './core.js';

const SOLID = 0xc8c8c8;
// Flatten a geometry set (with nested instances) into triangle and edge arrays.
function flatten(geo, values, wire) {
  const pos = [], col = [], edges = [], points = [], curves = [];
  let vmin = Infinity, vmax = -Infinity;
  const num = v => Array.isArray(v) ? null : typeof v === 'boolean' ? (v ? 1 : 0) : Number(v);
  if (values) for (const v of values) { const n = num(v); if (n != null && Number.isFinite(n)) { vmin = Math.min(vmin, n); vmax = Math.max(vmax, n); } }
  const colorOf = v => { if (Array.isArray(v)) return v.map(x => Math.min(1, Math.abs(x))); const n = num(v); const t = vmax > vmin ? (n - vmin) / (vmax - vmin) : (n > 0 ? 1 : 0); return [t, t, t]; };
  const walk = (g, m, top) => {
    if (g.mesh) {
      const vs = g.mesh.verts.map(p => m ? MAT.point(m, p) : p);
      const colours = top && values && values.length === vs.length ? values.map(colorOf) : null;
      for (const f of g.mesh.faces) for (let t = 1; t < f.length - 1; t++) for (const i of [f[0], f[t], f[t + 1]]) { pos.push(...vs[i]); if (colours) col.push(...colours[i]); else col.push(-1, -1, -1); }
      if (wire) { const seen = new Set(); for (const f of g.mesh.faces) for (let i = 0; i < f.length; i++) { const a = f[i], b = f[(i + 1) % f.length], k = a < b ? `${a}_${b}` : `${b}_${a}`; if (seen.has(k)) continue; seen.add(k); edges.push(...vs[a], ...vs[b]); } }
      if (!g.mesh.faces.length) for (let i = 1; i < vs.length; i++) curves.push([vs[i - 1], vs[i]]);
    }
    g.points.forEach((p, i) => points.push({ p: m ? MAT.point(m, p.position) : p.position, c: top && values && values.length === g.points.length ? colorOf(values[i]) : null }));
    g.curves.forEach(c => { const ps = c.points.map(p => m ? MAT.point(m, p) : p); curves.push(c.cyclic ? [...ps, ps[0]] : ps); });
    g.instances.forEach(s => walk(s.geometry, m ? MAT.mul(m, s.matrix) : s.matrix, false));
  };
  walk(geo, null, true);
  return { pos, col, edges, points, curves };
}
export function createPreview(container, gizmoEl) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x393939);
  const camera = new THREE.PerspectiveCamera(39.6, 1, .05, 400); camera.up.set(0, 0, 1); camera.position.set(9, -9, 6.5);
  const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace; container.append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = .12; controls.target.set(0, 0, .5); controls.maxDistance = 120;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
  scene.add(new THREE.HemisphereLight(0xffffff, 0x4a4a4a, 1.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.7); key.position.set(4, -6, 9); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, .5); rim.position.set(-6, 5, 3); scene.add(rim);
  // Floor grid and the red X / green Y axes, as in Blender.
  const gridGeo = new THREE.BufferGeometry(), gl = [];
  for (let i = -20; i <= 20; i++) { if (i === 0) continue; gl.push(i, -20, 0, i, 20, 0, -20, i, 0, 20, i, 0); }
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gl, 3));
  scene.add(new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: 0x4f4f4f })));
  const axis = (a, b, c) => { const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]); scene.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: c }))); };
  axis([-20, 0, 0], [20, 0, 0], 0x9b3443); axis([0, -20, 0], [0, 20, 0], 0x6c9a22);
  const origin = new THREE.Mesh(new THREE.SphereGeometry(.035, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffa64d, depthTest: false })); origin.renderOrder = 10; scene.add(origin);
  let content = new THREE.Group(); scene.add(content);
  const solid = new THREE.MeshStandardMaterial({ color: SOLID, roughness: .78, metalness: 0, flatShading: true, side: THREE.DoubleSide, vertexColors: false });
  const coloured = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .85, metalness: 0, flatShading: true, side: THREE.DoubleSide, vertexColors: true });
  function size() { const w = Math.max(60, container.clientWidth), h = Math.max(60, container.clientHeight); camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false); }
  const ro = new ResizeObserver(size); ro.observe(container); size();
  let lastBox = null;
  function update(geo, opts = {}) {
    scene.remove(content); content.traverse(o => { o.geometry?.dispose(); });
    content = new THREE.Group(); scene.add(content);
    const f = flatten(geo, opts.values, opts.wire);
    if (f.pos.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(f.pos, 3));
      const hasCol = opts.values && f.col.some(v => v >= 0);
      if (hasCol) g.setAttribute('color', new THREE.Float32BufferAttribute(f.col.map(v => v < 0 ? .78 : v * .9 + .05), 3));
      g.computeVertexNormals(); content.add(new THREE.Mesh(g, hasCol ? coloured : solid));
    }
    if (f.edges.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(f.edges, 3)); const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x151515, transparent: true, opacity: .55 })); content.add(l); }
    if (f.points.length) {
      const sphere = new THREE.SphereGeometry(.06, 8, 6), mesh = new THREE.InstancedMesh(sphere, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .6 }), Math.min(f.points.length, 5000)), m = new THREE.Matrix4(), c = new THREE.Color();
      f.points.slice(0, 5000).forEach((p, i) => { m.makeTranslation(...p.p); mesh.setMatrixAt(i, m); mesh.setColorAt(i, p.c ? c.setRGB(...p.c) : c.setHex(0xd8d8d8)); });
      content.add(mesh);
    }
    for (const c of f.curves) { if (c.length < 2) continue; const g = new THREE.BufferGeometry().setFromPoints(c.map(p => new THREE.Vector3(...p))); content.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: opts.active ? 0xffaa40 : 0x111111 }))); }
    const box = new THREE.Box3().setFromObject(content);
    lastBox = box.isEmpty() ? null : box;
    if (opts.frame) frame();
  }
  function frame() {
    const box = lastBox, center = box ? box.getCenter(new THREE.Vector3()) : new THREE.Vector3(0, 0, .5), span = box ? Math.max(3, box.getSize(new THREE.Vector3()).length()) : 6;
    controls.target.copy(center); const dir = camera.position.clone().sub(controls.target).normalize(); if (dir.lengthSq() < .5) dir.set(.6, -.6, .5).normalize();
    camera.position.copy(center).add(dir.multiplyScalar(span * 1.35)); controls.update();
  }
  // Navigation gizmo: the three coloured axis balls rotate with the view.
  const AX = [['X', [1, 0, 0], '#ff3352', '#7a2833'], ['Y', [0, 1, 0], '#8bdc00', '#47691a'], ['Z', [0, 0, 1], '#2890ff', '#264f7d']];
  function drawGizmo() {
    if (!gizmoEl) return;
    const q = camera.quaternion.clone().invert(), items = [];
    for (const [n, d, c, dark] of AX) for (const s of [1, -1]) { const v = new THREE.Vector3(...d).multiplyScalar(s).applyQuaternion(q); items.push({ n: s > 0 ? n : '', x: 40 + v.x * 28, y: 40 - v.y * 28, z: v.z, c: s > 0 ? c : dark, pos: s > 0 }); }
    items.sort((a, b) => a.z - b.z);
    gizmoEl.innerHTML = items.map(i => `${i.pos ? `<line x1="40" y1="40" x2="${i.x.toFixed(1)}" y2="${i.y.toFixed(1)}" stroke="${i.c}" stroke-width="2"/>` : ''}<circle cx="${i.x.toFixed(1)}" cy="${i.y.toFixed(1)}" r="${i.pos ? 8 : 6.5}" fill="${i.c}"${i.pos ? '' : ' fill-opacity=".75"'}/>${i.n ? `<text x="${i.x.toFixed(1)}" y="${(i.y + 3.5).toFixed(1)}">${i.n}</text>` : ''}`).join('');
  }
  let running = true;
  (function tick() { if (!running) return; requestAnimationFrame(tick); controls.update(); renderer.render(scene, camera); drawGizmo(); })();
  return { update, frame, setOrigin(v) { origin.visible = v; }, dispose() { running = false; ro.disconnect(); controls.dispose(); renderer.dispose(); renderer.domElement.remove(); } };
}
