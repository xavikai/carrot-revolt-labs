// 3ds Max UI kit · 3D viewport (three.js)
// A perspective viewport that behaves like 3ds Max: home grid with the red X and green Y world axes,
// middle mouse button pans, Alt + middle button orbits, Ctrl + Alt + middle button zooms, the wheel
// zooms towards the pointer, and selected objects get the cyan selection outline of Max 2027.
import * as THREE from 'three';
import { fromMax } from './max-gizmo.js';

export function createMaxViewport({ host, canvas, onChange = () => {}, background = 0x383838 }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.setClearColor(background, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, .05, 500);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(-4, 9, 6); scene.add(sun);

  // Home grid: grey lines every metre, the world X axis in red and Y in green (Max's colours).
  const grid = new THREE.Group(); scene.add(grid);
  const pts = [], N = 30;
  // short segments: lines that pass behind the camera are clipped cleanly on every GPU
  for (let i = -N; i <= N; i++) { if (i === 0) continue; for (let j = -N; j < N; j++) pts.push(new THREE.Vector3(i, 0, j), new THREE.Vector3(i, 0, j + 1), new THREE.Vector3(j, 0, i), new THREE.Vector3(j + 1, 0, i)); }
  const axisPts = (dx, dz) => { const a = []; for (let j = -N; j < N; j++) a.push(new THREE.Vector3(j * dx, 0, j * dz), new THREE.Vector3((j + 1) * dx, 0, (j + 1) * dz)); return a; };
  grid.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x555555 })));
  grid.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(axisPts(1, 0)), new THREE.LineBasicMaterial({ color: 0xa13a36 })));
  grid.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(axisPts(0, 1)), new THREE.LineBasicMaterial({ color: 0x3a8a3f })));

  // Orbit camera around a pivot (target). Max's Z is up.
  const view = { target: new THREE.Vector3(0, 1, 0), dist: 10, az: -.75, el: .42 };
  function place() {
    const ce = Math.cos(view.el);
    camera.position.set(view.target.x + view.dist * ce * Math.sin(view.az), view.target.y + view.dist * Math.sin(view.el), view.target.z + view.dist * ce * Math.cos(view.az));
    camera.lookAt(view.target); camera.updateMatrixWorld();
    if (cube) drawCube();
  }
  // ── ViewCube: a grey cube with the face names and a compass ring, turned like the camera ──
  let cube = null;
  const FACES = [
    { name: 'front', label: 'FRONT', n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    { name: 'back', label: 'BACK', n: [0, 1, 0], u: [-1, 0, 0], v: [0, 0, -1] },
    { name: 'right', label: 'RIGHT', n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, -1] },
    { name: 'left', label: 'LEFT', n: [-1, 0, 0], u: [0, -1, 0], v: [0, 0, -1] },
    { name: 'top', label: 'TOP', n: [0, 0, 1], u: [1, 0, 0], v: [0, -1, 0] },
    { name: 'bottom', label: 'BOTTOM', n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] },
  ];
  function cubeProject(p) {
    const q = new THREE.Vector3(p[0], p[2], -p[1]).applyQuaternion(camera.quaternion.clone().invert());
    const k = cube.size;
    return { x: cube.cx + q.x * k, y: cube.cy - q.y * k, z: q.z };
  }
  function faceQuad(f) {
    const c = f.n, pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [0, 1, 2].map(i => c[i] + f.u[i] * a + f.v[i] * b));
    return pts.map(cubeProject);
  }
  const inQuad = (q, x, y) => { let sgn = 0; for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4], cr = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x); if (Math.abs(cr) < 1e-9) continue; const sg = Math.sign(cr); if (sgn && sg !== sgn) return false; sgn = sg; } return true; };
  function visibleFaces() { return FACES.map(f => ({ f, d: cubeProject(f.n).z, q: faceQuad(f) })).filter(e => e.d > 0.02).sort((a, b) => a.d - b.d); }
  function drawCube() {
    if (!cube) return;
    const c = cube.canvas, dpr = Math.min(2, devicePixelRatio || 1), W = c.clientWidth || 120, H = c.clientHeight || 110;
    if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    cube.cx = W / 2; cube.cy = H / 2 - 4; cube.size = Math.min(W, H) * .2;
    // compass ring on the floor of the cube: the half behind the cube first, the front half last
    const ring = [], R = 1.95, r0 = 1.55;
    for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2; ring.push({ o: cubeProject([Math.cos(a) * R, Math.sin(a) * R, -1]), i: cubeProject([Math.cos(a) * r0, Math.sin(a) * r0, -1]) }); }
    const band = back => { for (let i = 0; i < 64; i++) { const a = ring[i], b = ring[i + 1]; if ((a.o.z + b.o.z < 0) !== back) continue; g.beginPath(); g.moveTo(a.o.x, a.o.y); g.lineTo(b.o.x, b.o.y); g.lineTo(b.i.x, b.i.y); g.lineTo(a.i.x, a.i.y); g.closePath(); g.fillStyle = back ? '#6f6f6f' : '#9a9a9a'; g.strokeStyle = back ? '#6f6f6f' : '#9a9a9a'; g.lineWidth = .6; g.fill(); g.stroke(); } };
    band(true);
    for (const { f, q, d } of visibleFaces()) {
      g.beginPath(); q.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath();
      const shade = Math.round(150 + 80 * Math.min(1, d + (f.name === 'top' ? .15 : 0)));
      g.fillStyle = cube.hover === f.name ? '#9cc1ee' : `rgb(${shade},${shade},${shade})`; g.fill();
      g.strokeStyle = '#6a6a6a'; g.lineWidth = 1; g.stroke();
      // the label is drawn on the face plane (an orthographic face is a parallelogram: an affine map)
      const o = cubeProject(f.n), U = cubeProject(f.n.map((x, i) => x + f.u[i])), V = cubeProject(f.n.map((x, i) => x + f.v[i]));
      g.save(); g.transform((U.x - o.x) / 40, (U.y - o.y) / 40, (V.x - o.x) / 40, (V.y - o.y) / 40, o.x, o.y);
      g.fillStyle = '#3c3c3c'; g.font = `600 ${f.label.length > 5 ? 15 : 18}px Segoe UI, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(f.label, 0, 1);
      g.restore();
    }
    band(false);
  }
  const cubeFaceAt = e => { const r = cube.canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; const hit = visibleFaces().reverse().find(v => inQuad(v.q, x, y)); return hit?.f.name || null; };
  const api = {
    renderer, scene, camera, grid, view,
    render() { renderer.render(scene, camera); },
    resize() { const r = host.getBoundingClientRect(); if (!r.width || !r.height) return; renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); onChange(); },
    // Look at a point (Max coordinates) from a distance; name: 'perspective' | 'front' | 'left' | 'top'.
    setView(name, maxTarget = null, dist = null) {
      if (maxTarget) view.target.copy(fromMax(maxTarget.x, maxTarget.y, maxTarget.z));
      if (dist) view.dist = dist;
      if (name === 'front') { view.az = 0; view.el = 0; }
      else if (name === 'left') { view.az = -Math.PI / 2; view.el = 0; }
      else if (name === 'right') { view.az = Math.PI / 2; view.el = 0; }
      else if (name === 'back') { view.az = Math.PI; view.el = 0; }
      else if (name === 'top') { view.az = 0; view.el = Math.PI / 2 - .001; }
      else if (name === 'bottom') { view.az = 0; view.el = -Math.PI / 2 + .001; }
      else if (name === 'perspective') { view.az = -.75; view.el = .42; }
      place(); onChange();
    },
    // Zoom Extents: fit a box given in Max coordinates.
    frame(minMax, maxMax) {
      const a = fromMax(minMax.x, minMax.y, minMax.z), b = fromMax(maxMax.x, maxMax.y, maxMax.z);
      const box = new THREE.Box3().setFromPoints([a, b]), c = box.getCenter(new THREE.Vector3()), r = Math.max(.5, box.getSize(new THREE.Vector3()).length() / 2);
      view.target.copy(c); view.dist = r / Math.sin(camera.fov * Math.PI / 360) * 1.05; place(); onChange();
    },
    pan(dx, dy) {
      const r = host.getBoundingClientRect(), k = 2 * view.dist * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, r.height);
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      view.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k); place(); onChange();
    },
    orbit(dx, dy) { view.az -= dx * .008; view.el = Math.max(-1.56, Math.min(1.56, view.el + dy * .008)); place(); onChange(); },
    // Apply changes made to view.target / dist / az / el by the lab.
    update() { place(); onChange(); },
    zoom(factor) { view.dist = Math.max(.3, Math.min(200, view.dist * factor)); place(); onChange(); },
    // Screen position (pixels) of a Max point, for hit tests of helpers.
    toScreen(x, y, z) { const v = fromMax(x, y, z).project(camera), r = host.getBoundingClientRect(); return { x: (v.x + 1) / 2 * r.width, y: (1 - v.y) / 2 * r.height, behind: v.z > 1 }; },
    // The cyan outline that 3ds Max 2027 draws around selected objects.
    outline(mesh, on) {
      if (!mesh.userData.outline) {
        const o = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ color: 0x3fe0ff, side: THREE.BackSide }));
        o.scale.setScalar(1.06); o.visible = false; mesh.add(o); mesh.userData.outline = o;
      }
      mesh.userData.outline.visible = on;
    },
  };

  // ── Navigation, as in 3ds Max ──
  let nav = null;
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 1) return;
    e.preventDefault(); canvas.setPointerCapture(e.pointerId);
    nav = { x: e.clientX, y: e.clientY, kind: e.altKey && (e.ctrlKey || e.metaKey) ? 'zoom' : e.altKey ? 'orbit' : 'pan' };
    host.dataset.nav = nav.kind;
  });
  canvas.addEventListener('pointermove', e => {
    if (!nav) return;
    const dx = e.clientX - nav.x, dy = e.clientY - nav.y; nav.x = e.clientX; nav.y = e.clientY;
    if (nav.kind === 'pan') api.pan(dx, dy); else if (nav.kind === 'orbit') api.orbit(dx, dy); else api.zoom(Math.exp(dy * .01));
  });
  const endNav = () => { nav = null; delete host.dataset.nav; };
  canvas.addEventListener('pointerup', endNav); canvas.addEventListener('pointercancel', endNav);
  canvas.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
  canvas.addEventListener('wheel', e => { e.preventDefault(); api.zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12); }, { passive: false });
  api.isNavigating = () => !!nav;
  // attachViewCube(canvas, onPick): onPick(faceName) runs when a face is clicked (default: look from that side).
  api.attachViewCube = (canvas2, onPick = name => api.setView(name)) => {
    cube = { canvas: canvas2, hover: null };
    canvas2.addEventListener('pointermove', e => { const h = cubeFaceAt(e); if (h !== cube.hover) { cube.hover = h; canvas2.style.cursor = h ? 'pointer' : 'default'; drawCube(); } });
    canvas2.addEventListener('pointerleave', () => { cube.hover = null; drawCube(); });
    canvas2.addEventListener('click', e => { const h = cubeFaceAt(e); if (h) onPick(h); });
    // drag the cube to orbit, as in Max
    canvas2.addEventListener('pointerdown', e => { if (e.button !== 0) return; let x = e.clientX, y = e.clientY, moved = false; canvas2.setPointerCapture(e.pointerId); const mv = ev => { const dx = ev.clientX - x, dy = ev.clientY - y; if (Math.abs(dx) + Math.abs(dy) > 2) moved = true; x = ev.clientX; y = ev.clientY; if (moved) api.orbit(dx, dy); }; const up = ev => { canvas2.removeEventListener('pointermove', mv); canvas2.removeEventListener('pointerup', up); if (moved) ev.stopPropagation(); canvas2.dataset.dragged = moved ? '1' : ''; }; canvas2.addEventListener('pointermove', mv); canvas2.addEventListener('pointerup', up); });
    canvas2.addEventListener('click', e => { if (canvas2.dataset.dragged) { e.stopImmediatePropagation(); canvas2.dataset.dragged = ''; } }, true);
    drawCube();
  };
  place();
  new ResizeObserver(() => api.resize()).observe(host);
  api.resize();
  return api;
}
