// 3ds Max UI kit · transform gizmos (three.js)
// Select and Move / Rotate / Scale gizmos drawn like 3ds Max: X red, Y green, Z blue, plane handles
// between two axes, the part under the pointer turns yellow and dragging it constrains the transform.
// Max is Z-up and three.js is Y-up: Max (x, y, z) = three (x, z, -y) is handled here, so labs work
// in Max coordinates.
import * as THREE from 'three';

const COL = { x: 0xe23c32, y: 0x3fbf3f, z: 0x2f6fe8, hi: 0xffe23a, grey: 0x9a9a9a, tri: 0xf2dc3a };
export const MAX_AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 0, -1), z: new THREE.Vector3(0, 1, 0) };
export const toMax = v => ({ x: v.x, y: -v.z, z: v.y });
export const fromMax = (x, y, z) => new THREE.Vector3(x, z, -y);

const lineMat = color => new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 1 });
const meshMat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity, side: THREE.DoubleSide });
const pickMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
const seg = (a, b, color) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), lineMat(color));
function label(text, color) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.font = 'bold 40px Segoe UI, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#' + color.toString(16).padStart(6, '0'); g.fillText(text, 32, 34);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.setScalar(.22); s.renderOrder = 1001; return s;
}
function circle(radius, color, axis) {
  const pts = []; for (let i = 0; i <= 96; i++) { const a = i / 96 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0)); }
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat(color));
  if (axis === 'x') l.rotation.y = Math.PI / 2; if (axis === 'z') l.rotation.x = Math.PI / 2; // three Y is Max Z
  return l;
}

export function createGizmo({ scene, camera, dom }) {
  const root = new THREE.Group(); root.renderOrder = 1000; scene.add(root);
  const modes = { move: new THREE.Group(), rotate: new THREE.Group(), scale: new THREE.Group() };
  for (const g of Object.values(modes)) root.add(g);
  const parts = {};       // part id -> { visuals: [objects with material], pick: mesh, colors: [...] }
  const pickables = [];
  const add = (mode, id, visuals, pick) => {
    const p = parts[`${mode}:${id}`] = { mode, id, visuals, colors: visuals.map(v => v.material.color.getHex()), pick };
    for (const v of visuals) { v.renderOrder = 1000; modes[mode].add(v); }
    if (pick) { pick.userData.part = `${mode}:${id}`; modes[mode].add(pick); pickables.push(pick); }
    return p;
  };
  const axisDir = a => MAX_AXES[a].clone();

  // ── Move: arrows, labels and plane brackets ──
  for (const a of ['x', 'y', 'z']) {
    const d = axisDir(a), line = seg(new THREE.Vector3(), d.clone().multiplyScalar(.82), COL[a]);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(.055, .2, 14), meshMat(COL[a]));
    cone.position.copy(d.clone().multiplyScalar(.9)); cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    const lab = label(a.toUpperCase(), COL[a]); lab.position.copy(d.clone().multiplyScalar(1.14));
    const pick = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, 1, 8), pickMat);
    pick.position.copy(d.clone().multiplyScalar(.55)); pick.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    add('move', a, [line, cone, lab], pick);
  }
  for (const [a, b] of [['x', 'y'], ['y', 'z'], ['x', 'z']]) {
    const da = axisDir(a).multiplyScalar(.3), db = axisDir(b).multiplyScalar(.3), corner = da.clone().add(db);
    const l1 = seg(da, corner, COL[b]), l2 = seg(db, corner, COL[a]);
    const quad = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), da, corner, new THREE.Vector3(), corner, db]), meshMat(COL.hi, 0));
    const pick = new THREE.Mesh(quad.geometry, pickMat);
    add('move', a + b, [l1, l2, quad], pick);
  }
  // ── Rotate: one circle per axis, the grey view circle and the trackball outline ──
  for (const a of ['x', 'y', 'z']) {
    const c = circle(1, COL[a], a);
    const pick = new THREE.Mesh(new THREE.TorusGeometry(1, .06, 6, 48), pickMat);
    if (a === 'x') pick.rotation.y = Math.PI / 2; if (a === 'z') pick.rotation.x = Math.PI / 2;
    add('rotate', a, [c], pick);
  }
  const viewRing = circle(1.22, COL.grey), ball = circle(1, 0x6a6a6a);
  const viewPick = new THREE.Mesh(new THREE.TorusGeometry(1.22, .06, 6, 48), pickMat);
  add('rotate', 'view', [viewRing], viewPick); modes.rotate.add(ball); ball.renderOrder = 999;
  const billboards = [viewRing, ball, viewPick];
  // ── Scale: axis lines, outer triangle (two axes) and the filled inner triangle (uniform) ──
  const P = a => axisDir(a).multiplyScalar(.95), Q = a => axisDir(a).multiplyScalar(.55);
  for (const a of ['x', 'y', 'z']) {
    const line = seg(new THREE.Vector3(), P(a), COL[a]); const lab = label(a.toUpperCase(), COL[a]); lab.position.copy(axisDir(a).multiplyScalar(1.12));
    const pick = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .4, 8), pickMat);
    pick.position.copy(axisDir(a).multiplyScalar(.78)); pick.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axisDir(a));
    add('scale', a, [line, lab], pick);
  }
  for (const [a, b] of [['x', 'y'], ['y', 'z'], ['x', 'z']]) {
    const outer = seg(P(a), P(b), COL.tri), inner = seg(Q(a), Q(b), COL.tri);
    const quadGeo = new THREE.BufferGeometry().setFromPoints([Q(a), P(a), P(b), Q(a), P(b), Q(b)]);
    add('scale', a + b, [outer, inner, new THREE.Mesh(quadGeo, meshMat(COL.hi, 0))], new THREE.Mesh(quadGeo, pickMat));
  }
  const innerGeo = new THREE.BufferGeometry().setFromPoints([Q('x'), Q('y'), Q('z')]);
  add('scale', 'xyz', [new THREE.Mesh(innerGeo, meshMat(COL.tri, .28))], new THREE.Mesh(innerGeo, pickMat));

  let mode = 'move', hovered = null, locked = null, enabled = { x: true, y: true, z: true }, drag = null;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const setNdc = e => { const r = dom.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, camera); };
  const partAxes = id => id === 'view' ? [] : id.split('');

  function paint() {
    for (const p of Object.values(parts)) {
      if (p.mode !== mode) continue;
      const on = hovered === `${mode}:${p.id}` || (drag && drag.part === p.id) || (!hovered && !drag && locked && (p.id === locked));
      const off = partAxes(p.id).some(a => !enabled[a]);
      p.visuals.forEach((v, i) => {
        const isFill = v.isMesh && v.material.opacity < 1 && p.colors[i] === COL.hi;
        v.material.color.setHex(on ? COL.hi : p.colors[i]);
        v.material.opacity = isFill ? (on ? .35 : 0) : off ? .3 : (v.isMesh && p.id === 'xyz' ? (on ? .5 : .28) : 1);
      });
    }
  }
  const api = {
    root,
    get mode() { return mode; },
    setMode(m) { mode = m; for (const [k, g] of Object.entries(modes)) g.visible = k === m; hovered = null; paint(); },
    setVisible(v) { root.visible = v; },
    attach(maxPos) { if (!maxPos) { root.visible = false; return; } root.visible = true; root.position.copy(fromMax(maxPos.x, maxPos.y, maxPos.z)); },
    setEnabled(axes) { enabled = { x: true, y: true, z: true, ...axes }; paint(); },
    setLocked(part) { locked = part; paint(); },          // F5–F8: the constrained axis or plane stays yellow
    // Keep a constant size on screen, as Max does, and turn the view circles to the camera.
    update() {
      const dist = camera.position.distanceTo(root.position);
      root.scale.setScalar(dist * Math.tan(camera.fov * Math.PI / 360) * .42);
      for (const b of billboards) b.quaternion.copy(camera.quaternion);
    },
    pick(e) {
      if (!root.visible) return null;
      api.update(); root.updateMatrixWorld(true); setNdc(e);
      // dimmed (disabled) axes can't be grabbed, so an edge-on circle never hides the one that works
      const hits = ray.intersectObjects(pickables.filter(p => { const q = parts[p.userData.part]; return q.mode === mode && partAxes(q.id).every(ax => enabled[ax]); }), false);
      if (!hits.length) return null;
      // prefer axes over planes when both are hit, so thin arrows stay easy to grab
      hits.sort((a, b) => (parts[a.object.userData.part].id.length - parts[b.object.userData.part].id.length) || a.distance - b.distance);
      return parts[hits[0].object.userData.part].id;
    },
    hover(e) { const id = drag ? drag.part : api.pick(e), key = id ? `${mode}:${id}` : null; if (key === hovered) return false; hovered = key; paint(); return true; },
    begin(e, part) {
      setNdc(e); api.update();
      const origin = root.position.clone(), camDir = camera.getWorldDirection(new THREE.Vector3());
      drag = { part, origin, x0: e.clientX, y0: e.clientY, angle: 0 };
      if (mode === 'move') {
        const axes = part.split('').filter(a => 'xyz'.includes(a));
        let normal;
        if (axes.length === 1) { const d = axisDir(axes[0]); normal = camDir.clone().sub(d.clone().multiplyScalar(camDir.dot(d))); if (normal.lengthSq() < 1e-6) normal = camera.up.clone(); normal.normalize(); }
        else normal = axisDir(axes[0]).cross(axisDir(axes[1])).normalize();
        drag.axes = axes; drag.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin);
        drag.hit0 = ray.ray.intersectPlane(drag.plane, new THREE.Vector3()) || origin.clone();
      }
      if (mode === 'rotate' && part !== 'view') {
        const d = axisDir(part); drag.axis = d; drag.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(d, origin);
        drag.edgeOn = Math.abs(camDir.dot(d)) < .2;
        const h = ray.ray.intersectPlane(drag.plane, new THREE.Vector3()); drag.last = h ? h.sub(origin) : null;
      }
      paint(); return drag;
    },
    // Totals since begin(): move in Max units, rotation in degrees, scale as a factor.
    drag(e) {
      if (!drag) return null;
      setNdc(e);
      if (mode === 'move') {
        const h = ray.ray.intersectPlane(drag.plane, new THREE.Vector3()); if (!h) return { move: { x: 0, y: 0, z: 0 } };
        let d = h.sub(drag.hit0);
        if (drag.axes.length === 1) { const a = axisDir(drag.axes[0]); d = a.multiplyScalar(d.dot(a)); }
        const m = toMax(d); for (const a of ['x', 'y', 'z']) if (!drag.axes.includes(a)) m[a] = 0;
        return { move: m };
      }
      if (mode === 'rotate') {
        if (drag.part === 'view' || drag.edgeOn || !drag.last) { drag.angle = -(e.clientX - drag.x0) * .6; return { angle: drag.angle }; }
        const h = ray.ray.intersectPlane(drag.plane, new THREE.Vector3()); if (!h) return { angle: drag.angle };
        const v = h.sub(drag.origin), a = Math.atan2(drag.last.clone().cross(v).dot(drag.axis), drag.last.dot(v));
        drag.angle += a * 180 / Math.PI; drag.last = v;
        return { angle: drag.angle };
      }
      return { scale: Math.max(.05, 1 - (e.clientY - drag.y0) / 120) }; // drag up = bigger, as in Max
    },
    end() { drag = null; paint(); },
    get dragging() { return !!drag; },
    get hoveredPart() { return hovered ? hovered.split(':')[1] : null; },
  };
  api.setMode('move');
  return api;
}
