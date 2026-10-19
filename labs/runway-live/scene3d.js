import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';

// World coordinates follow the teaching plan: entrance at negative X,
// T junction at (0, -3), audience at positive Z.
const CUE_POINTS = {
  entry: [-4.65, -3.15], center: [0, -3.15], outbound: [0, 0.55],
  tilt: [0, 4.05], turn: [0, 4.05], return: [0, -1.0], exit: [-4.65, -3.15],
};
const CAMERA_SITES = [
  { position: [-7.2, 2.25, 4.2], target: [-5.15, 1.05, 1.25], fov: 38 },
  { position: [0, 4.05, 9.35], target: [0, 0.85, -1.25], fov: 49 },
  { position: [0, 1.48, 7.3], target: [0, 0.7, 4.05], fov: 29 },
  { position: [-6.5, 2.6, 0.6], target: [-2.25, 1.0, -3.1], fov: 72 },
  { position: [5.7, 2.8, 5.9], target: [0, 1.0, 1.7], fov: 66 },
];

const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.04, ...options });
function box(parent, x, y, z, w, h, d, mat, shadows = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z); mesh.castShadow = shadows; mesh.receiveShadow = shadows;
  parent.add(mesh); return mesh;
}
function cylinderBetween(parent, a, b, radius, mat) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, start.distanceTo(end), 8), mat);
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
  mesh.castShadow = true; parent.add(mesh); return mesh;
}
function labelSprite(text, color = '#9cdfff') {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#10232ddd'; ctx.fillRect(10, 8, 108, 48);
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.strokeRect(11.5, 9.5, 105, 45);
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 29px Segoe UI, Arial'; ctx.fillText(text, 64, 33);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(1.05, .53, 1); sprite.layers.set(1); return sprite;
}
function figure(parent, outfit, skin, trousers) {
  const group = new THREE.Group(); parent.add(group);
  const jacket = material(outfit), skinMat = material(skin), legMat = material(trousers);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.16, 16, 12), skinMat);
  head.position.y = 1.7; head.castShadow = true; group.add(head);
  box(group, 0, 1.15, 0, .52, .83, .28, jacket);
  for (const side of [-1, 1]) {
    cylinderBetween(group, [side * .34, 1.47, 0], [side * .4, .88, .02], .075, jacket);
    cylinderBetween(group, [side * .15, .76, 0], [side * .16, .11, side * .04], .095, legMat);
    box(group, side * .16, .08, .11, .18, .13, .34, legMat);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.035, 8, 6), skinMat);
  nose.position.set(0, 1.67, .155); group.add(nose);
  return group;
}
function aim(camera, target) { camera.lookAt(new THREE.Vector3(...target)); }

export function createRunway3D(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const feedRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  feedRenderer.setPixelRatio(1); feedRenderer.setSize(480, 270, false);
  feedRenderer.outputColorSpace = THREE.SRGBColorSpace;
  feedRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  feedRenderer.toneMappingExposure = 1.35;
  feedRenderer.shadowMap.enabled = true; feedRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x14232b); scene.fog = new THREE.Fog(0x14232b, 16, 37);
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x18272a, 2.1));
  const key = new THREE.DirectionalLight(0xffe4c1, 3.4); key.position.set(-3, 9, 3); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -10; key.shadow.camera.right = 10; key.shadow.camera.top = 10; key.shadow.camera.bottom = -10; scene.add(key);
  const fill = new THREE.DirectionalLight(0x75c2f0, 1.9); fill.position.set(5, 5, -5); scene.add(fill);
  const ground = material(0x1b292e), runway = material(0x65797e, { roughness: .94 });
  box(scene, 0, -.22, .8, 17, .28, 18, ground, false);
  box(scene, 0, .02, -3.15, 10.75, .2, 1.95, runway);
  box(scene, 0, .02, .55, 1.58, .2, 7.4, runway);
  const trim = material(0x9fb7bc, { metalness: .4, roughness: .45 });
  for (const x of [-.79, .79]) box(scene, x, .14, .55, .035, .035, 7.4, trim, false);
  for (const z of [-4.125, -2.175]) box(scene, 0, .14, z, 10.75, .035, .035, trim, false);
  for (const x of [-5.375, 5.375]) box(scene, x, .14, -3.15, .035, .035, 1.95, trim, false);
  box(scene, 0, 1.85, -4.7, 12.8, 3.7, .18, material(0x243842), false);
  for (const x of [-5.7, 5.7]) box(scene, x, 1.85, -4.56, .16, 3.7, .22, material(0x499cb5, { metalness: .35 }), false);
  for (let x = -4.3; x <= 4.3; x += 2.15) {
    const lamp = new THREE.PointLight(0xa8dcff, 2.6, 5); lamp.position.set(x, 3.1, -4.25); scene.add(lamp);
    box(scene, x, 3.15, -4.36, .2, .12, .14, material(0xb8e9ff, { emissive: 0x3d9ed1, emissiveIntensity: 1 }), false);
  }
  box(scene, -5.15, .42, 1.53, .78, .85, .55, material(0x385564));
  const presenter = figure(scene, 0x6eafce, 0xe0a782, 0x1e2d37); presenter.position.set(-5.15, .12, 1.13);
  const model = figure(scene, 0xec9854, 0xd9a17d, 0x262832); model.position.y = .12; model.visible = false;
  // The yellow route and labels belong to the planning view, not to broadcast feeds.
  const routePoints = [[-4.9,-3.15],[0,-3.15],[0,4.05],[0,-3.15],[-4.9,-3.15]].map(([x,z]) => new THREE.Vector3(x,.18,z));
  const route = new THREE.Line(new THREE.BufferGeometry().setFromPoints(routePoints), new THREE.LineDashedMaterial({ color: 0xffc742, dashSize: .26, gapSize: .16 }));
  route.computeLineDistances(); route.layers.set(1); scene.add(route);
  for (const [x,z,angle] of [[0,3.85,0],[-4.8,-3.15,-Math.PI/2]]) {
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(.14,.34,8), new THREE.MeshBasicMaterial({color:0xffc742}));
    arrow.rotation.x = Math.PI/2; arrow.rotation.z = angle; arrow.position.set(x,.2,z); arrow.layers.set(1); scene.add(arrow);
  }
  const dark = material(0x15252c, { metalness:.45, roughness:.45 });
  const rigs = CAMERA_SITES.map((site, index) => {
    const group = new THREE.Group(); group.position.set(site.position[0],0,site.position[2]); scene.add(group);
    const top = site.position[1];
    const stand = cylinderBetween(group,[0,.1,0],[0,top-.26,0],.045,dark); stand.layers.set(1);
    for (const [dx,dz] of [[-.38,-.28],[.38,-.28],[0,.43]]) { const leg = cylinderBetween(group,[0,.62,0],[dx,.06,dz],.033,dark); leg.layers.set(1); }
    const head = new THREE.Group(); head.position.y = top-.03; head.lookAt(site.target[0]-site.position[0],site.target[1]-head.position.y,site.target[2]-site.position[2]); group.add(head);
    const body = box(head,0,0,0,.35,.24,.48,material(0x74c5e9, { metalness:.55, roughness:.35 })); body.layers.set(1);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(.105,.105,.23,12),dark); lens.rotation.x=Math.PI/2; lens.position.z=.35; lens.layers.set(1); head.add(lens);
    const label = labelSprite(`C${index+1}`); label.position.set(0,top+.42,0); group.add(label);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(.085,12,8), new THREE.MeshBasicMaterial({color:0x74c5e9})); bulb.position.set(0,top+.16,0); bulb.layers.set(1); group.add(bulb);
    return { body, bulb };
  });
  const overview = new THREE.PerspectiveCamera(40,1,.1,70); overview.position.set(11.5,12.2,16.3); overview.layers.enable(1);
  const controls = new OrbitControls(overview,canvas); controls.target.set(0,.4,1.25); controls.enablePan=false;
  controls.minDistance=8; controls.maxDistance=28; controls.minPolarAngle=.2; controls.maxPolarAngle=1.48;
  controls.update();
  const feeds = CAMERA_SITES.map(site => {
    const camera = new THREE.PerspectiveCamera(site.fov,16/9,.1,50);
    camera.position.set(...site.position); aim(camera,site.target); return camera;
  });
  let active = true, scheduled = false, lastCue = null, lastSweep = null;
  const feedImages = Array(5).fill(null);
  function renderOverview() {
    scheduled = false; if (!active) return;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (width < 2 || height < 2) return;
    if (canvas.width !== Math.round(width*renderer.getPixelRatio()) || canvas.height !== Math.round(height*renderer.getPixelRatio())) renderer.setSize(width,height,false);
    overview.aspect=width/height; overview.updateProjectionMatrix(); renderer.render(scene,overview);
  }
  function requestOverview() { if (!scheduled) { scheduled=true; requestAnimationFrame(renderOverview); } }
  controls.addEventListener('change',requestOverview);
  const observer = new ResizeObserver(requestOverview); observer.observe(canvas.parentElement);
  function capture(index) { feedRenderer.render(scene,feeds[index]); feedImages[index]=feedRenderer.domElement.toDataURL('image/webp',.78); }
  function update(cue, sweep, program, preview) {
    const cueChanged=cue?.id!==lastCue, sweepChanged=sweep!==lastSweep;
    if (cueChanged) {
      const point=CUE_POINTS[cue?.id]; model.visible=!!point;
      if (point) { model.position.set(point[0],.12,point[1]); model.rotation.y=['return','exit'].includes(cue.id)?Math.PI:0; }
      lastCue=cue?.id;
    }
    if (cueChanged || sweepChanged) {
      const focus=cue?.id==='tilt'?4.05:cue?.id==='turn'?4.05:cue?.id==='outbound'?0.55:2.0;
      aim(feeds[2],[0,cue?.id==='tilt'?.22+sweep*1.45:1.05,focus]);
      if (cueChanged) feeds.forEach((_,i)=>capture(i)); else capture(2);
      lastSweep=sweep;
    }
    rigs.forEach(({body,bulb},i)=>{
      const color=i+1===program?0xf16c6c:i+1===preview?0x69d6a0:0x74c5e9;
      body.material.color.setHex(color); bulb.material.color.setHex(color);
    });
    requestOverview(); return feedImages;
  }
  function setVisible(visible) { active=visible; if (visible) requestOverview(); }
  requestOverview();
  return { update, setVisible, feedImages, dispose() { observer.disconnect(); controls.dispose(); renderer.dispose(); feedRenderer.dispose(); } };
}
