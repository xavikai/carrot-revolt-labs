// Photo Lab: a DSLR cut in half. The lens gets longer with the focal length, the iris closes with the f-number,
// the sensor changes size, and "Shoot" plays the real sequence: mirror up, aperture stops down,
// first curtain opens, second curtain closes, mirror down.
import * as THREE from 'three';

const glass = (color, opacity) => new THREE.MeshPhysicalMaterial({ color, transparent: true, opacity, roughness: 0.1, metalness: 0, depthWrite: false, side: THREE.DoubleSide });
const solid = (color, rough = 0.6, metal = 0.1) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, side: THREE.DoubleSide });
const edges = (geo, color = 0xcfd6de, opacity = 0.55) => new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
const MM = 0.0125; // model units per mm of sensor

export function buildDslr() {
  const root = new THREE.Group();
  const parts = {};
  // Body (cut away: transparent shell with its outline)
  const bodyGeo = new THREE.BoxGeometry(1.5, 1.0, 0.8);
  const body = new THREE.Mesh(bodyGeo, glass(0x9aa3ad, 0.08)); root.add(body, edges(bodyGeo));
  const gripGeo = new THREE.BoxGeometry(0.34, 0.95, 0.5); const grip = new THREE.Mesh(gripGeo, glass(0x6d747c, 0.12)); grip.position.set(-0.83, -0.01, 0.12); root.add(grip); const ge = edges(gripGeo, 0xcfd6de, 0.35); ge.position.copy(grip.position); root.add(ge);
  // Prism housing (the hump on top)
  const humpShape = new THREE.Shape(); humpShape.moveTo(-0.34, 0); humpShape.lineTo(0.34, 0); humpShape.lineTo(0.2, 0.36); humpShape.lineTo(-0.2, 0.36); humpShape.closePath();
  const humpGeo = new THREE.ExtrudeGeometry(humpShape, { depth: 0.62, bevelEnabled: false }); humpGeo.translate(0, 0, -0.31); humpGeo.rotateY(Math.PI / 2);
  const hump = new THREE.Mesh(humpGeo, glass(0x9aa3ad, 0.08)); hump.position.y = 0.5; root.add(hump); const he = edges(humpGeo); he.position.y = 0.5; root.add(he);
  // Shutter button
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16), solid(0x8a8f96, 0.4, 0.6)); btn.position.set(-0.8, 0.5, 0.2); root.add(btn); parts.button = btn;
  // Lens mount and lens barrel (length follows the focal length)
  const lens = new THREE.Group(); lens.position.z = 0.4; root.add(lens); parts.lens = lens;
  const mount = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.025, 8, 40), solid(0xb8bec6, 0.3, 0.9)); lens.add(mount);
  const barrelGeo = new THREE.CylinderGeometry(0.36, 0.36, 1, 40, 1, true); barrelGeo.rotateX(Math.PI / 2); barrelGeo.translate(0, 0, 0.5);
  const barrel = new THREE.Mesh(barrelGeo, glass(0x2b2f35, 0.18)); lens.add(barrel); parts.barrel = barrel;
  const barrelEdges = new THREE.Group(); lens.add(barrelEdges);
  for (const z of [0, 1]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.012, 6, 40), solid(0x3a3f46, 0.5, 0.4)); ring.position.z = z; barrelEdges.add(ring); }
  parts.barrelEdges = barrelEdges;
  const elements = [0.15, 0.55, 0.92].map((z, i) => { const g = new THREE.SphereGeometry(0.3, 32, 12); g.scale(1, 1, i === 1 ? 0.12 : 0.2); const m = new THREE.Mesh(g, glass(0x9fd3ff, 0.35)); m.userData.z = z; lens.add(m); return m; });
  parts.elements = elements;
  // Iris: a ring whose hole has 7 sides, like the blades of a real diaphragm
  const iris = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.33, 7, 1), solid(0x15171a, 0.5, 0.3)); lens.add(iris); parts.iris = iris;
  // Reflex mirror (hinged at its top edge) and focusing screen
  const mirrorPivot = new THREE.Group(); mirrorPivot.position.set(0, 0.24, -0.2); root.add(mirrorPivot);
  const mirrorGeo = new THREE.PlaneGeometry(0.58, 0.62);
  const mirror = new THREE.Mesh(mirrorGeo, new THREE.MeshStandardMaterial({ color: 0xdfe9f2, emissive: 0x3a4652, roughness: 0.15, metalness: 0.35, side: THREE.DoubleSide }));
  mirror.position.set(0, -0.22, 0.22); mirror.rotation.x = -Math.PI / 4; mirrorPivot.add(mirror); parts.mirrorPivot = mirrorPivot;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.44), glass(0xffffff, 0.25)); screen.rotation.x = -Math.PI / 2; screen.position.set(0, 0.27, 0.02); root.add(screen);
  // Pentaprism and eyepiece (viewfinder)
  const prismShape = new THREE.Shape(); prismShape.moveTo(-0.22, 0); prismShape.lineTo(0.24, 0); prismShape.lineTo(0.1, 0.3); prismShape.lineTo(-0.12, 0.3); prismShape.closePath();
  const prismGeo = new THREE.ExtrudeGeometry(prismShape, { depth: 0.36, bevelEnabled: false }); prismGeo.translate(0, 0, -0.18); prismGeo.rotateY(-Math.PI / 2);
  const prism = new THREE.Mesh(prismGeo, glass(0x7fc4ff, 0.35)); prism.position.set(0, 0.3, 0.02); root.add(prism); const pe = edges(prismGeo, 0x9fd3ff, 0.8); pe.position.copy(prism.position); root.add(pe);
  const eyeGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.2, 24); eyeGeo.rotateX(Math.PI / 2);
  const eyepiece = new THREE.Mesh(eyeGeo, solid(0x24272c, 0.8)); eyepiece.position.set(0, 0.6, -0.48); root.add(eyepiece);
  // Shutter curtains and sensor
  const curtainGeo = new THREE.PlaneGeometry(0.58, 0.4);
  const first = new THREE.Mesh(curtainGeo, solid(0x2a2d31, 0.7, 0.2)), second = new THREE.Mesh(curtainGeo, solid(0x3a3e44, 0.7, 0.2));
  first.position.set(0, 0, -0.29); second.position.set(0, 0.42, -0.295); root.add(first, second); parts.first = first; parts.second = second;
  const sensorTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#3a2a55'; g.fillRect(0, 0, 64, 64); g.strokeStyle = '#6b4fa0'; for (let i = 0; i <= 64; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.moveTo(0, i); g.lineTo(64, i); g.stroke(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const sensor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: sensorTex, roughness: 0.3, metalness: 0.4, emissive: 0x000000 }));
  sensor.position.z = -0.33; root.add(sensor); parts.sensor = sensor;
  const sensorFF = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(36 * MM, 24 * MM)), new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.02, gapSize: 0.015, transparent: true, opacity: 0.6 }));
  sensorFF.computeLineDistances(); sensorFF.position.z = -0.325; root.add(sensorFF); parts.sensorFF = sensorFF;
  // Light rays
  const rays = new THREE.Group(); root.add(rays); parts.rays = rays;
  const rayMat = new THREE.LineBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.9 });
  parts.rayLines = [0, 1, 2].map(() => { const l = new THREE.Line(new THREE.BufferGeometry(), rayMat); rays.add(l); return l; });

  const state = { f: 50, N: 5.6, sensor: { w: 36, h: 24 }, mirror: 0, stop: 0, first: 0, second: 0 };
  const lensLength = f => 0.28 + 0.9 * Math.log2(f / 16) / Math.log2(200 / 16);
  function layout() {
    const L = lensLength(state.f);
    barrel.scale.z = L; barrelEdges.children[1].position.z = L;
    elements.forEach(e => { e.position.z = e.userData.z * L; });
    iris.position.z = 0.5 * L;
    // aperture opening: the diameter is proportional to 1/N (shown wide open until the shot)
    const shown = state.stop ? state.N : 1.4;
    const r = Math.max(0.025, 0.3 * 1.4 / shown);
    iris.geometry.dispose(); iris.geometry = new THREE.RingGeometry(r, 0.33, 7, 1);
    mirrorPivot.rotation.x = -state.mirror * Math.PI / 4;
    first.position.y = -state.first * 0.42;
    second.position.y = 0.42 - state.second * 0.42;
    sensor.scale.set(state.sensor.w * MM, state.sensor.h * MM, 1);
    // rays: from the scene in front, through the lens, then to the viewfinder or to the sensor
    const front = 0.4 + L + 0.5, lensZ = 0.4 + 0.5 * L;
    const up = state.mirror < 0.5;
    parts.rayLines.forEach((line, i) => {
      const y0 = (i - 1) * 0.16;
      const pts = [new THREE.Vector3(0, y0, front), new THREE.Vector3(0, y0 * 1.3, lensZ)];
      if (up) pts.push(new THREE.Vector3(0, y0 * 0.25 - 0.02, -0.02), new THREE.Vector3(0, 0.27, -0.02 + y0 * 0.2), new THREE.Vector3(0, 0.45, -0.1), new THREE.Vector3(0, 0.6, -0.58));
      else pts.push(new THREE.Vector3(0, -y0 * 0.4, -0.33));
      line.geometry.setFromPoints(pts);
    });
    rays.visible = up || state.first > 0.95;
    rayMat.color.set(up ? 0xffd24a : 0xfff3b0);
  }
  layout();
  return {
    root, parts, state,
    set(p) { Object.assign(state, p); layout(); },
    // Anchors for labels (model space)
    anchors: () => {
      const L = lensLength(state.f);
      return [
        ['Lens', new THREE.Vector3(0, 0.42, 0.4 + 0.8 * L)],
        ['Aperture', new THREE.Vector3(0, -0.46, 0.4 + 0.5 * L)],
        ['Mirror', new THREE.Vector3(0, -0.28, 0.18)],
        ['Pentaprism', new THREE.Vector3(0, 0.72, 0.1)],
        ['Viewfinder', new THREE.Vector3(0, 0.62, -0.62)],
        ['Shutter curtains', new THREE.Vector3(0, 0.32, -0.3)],
        ['Sensor', new THREE.Vector3(0, -0.3, -0.38)],
      ];
    },
  };
}

// The shot, as a timeline (seconds). Exposures shorter than 0.4 s are shown slowed down.
export function shotTimeline(t) {
  const shown = Math.min(2.5, Math.max(0.4, t));
  const k = [0, 0.18, 0.3, 0.3 + shown, 0.42 + shown, 0.62 + shown];
  return { shown, slowed: shown > t * 1.01, total: k[5] + 0.05, at(time) {
    const c = x => Math.max(0, Math.min(1, x));
    return {
      mirror: time < k[3] + 0.12 ? c(time / 0.15) : 1 - c((time - k[4]) / 0.15),
      stop: time > 0.02 && time < k[4] + 0.1 ? 1 : 0,
      first: c((time - k[1]) / 0.1),
      second: c((time - k[3]) / 0.1),
      exposing: time > k[1] + 0.1 && time < k[3],
    };
  } };
}
