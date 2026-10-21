import * as THREE from '../../vendor/three.module.js';
import { jointPosition, partFrame, targetVector, baseId, ankleDirection, hasLeg, footDigitFrame, spineChain, collarboneStartPoint } from './transform-frame.js';

// Rig-space geometry (metres, Three Y-up, +Z = character front) shared by the 3D view, the gizmos and the tests.

// Digit layout in palm space: X along the palm, Y = back of the hand, Z = thumb side (mirrored on the right hand).
const DIGITS = [
  { root:[.025,-.014,.034], dir:[.55,-.3,.78], length:.095 },   // Digit1 · thumb
  { root:[.1,0,.03], dir:[1,0,.08], length:.11 },               // Digit2 · index
  { root:[.103,0,.01], dir:[1,0,0], length:.118 },              // Digit3 · middle
  { root:[.1,0,-.01], dir:[1,0,-.06], length:.11 },             // Digit4 · ring
  { root:[.093,0,-.029], dir:[1,0,-.15], length:.088 },         // Digit5 · little finger
];
export const PALM_LENGTH = .1;
const DEG = Math.PI / 180;
export const digitPose = (state, side, index) => ({ curl:0, bend:0, spread:0, roll:0, ...(state.digitPoses?.[side]?.[index] || {}) });

export function handDigits(state, side) {
  const count = Math.min(5, state.handDigits || 0), frame = partFrame(state, `palm${side}`);
  if (!count || !frame) return [];
  const mirror = side === 'L' ? 1 : -1, out = [];
  for (let index = 0; index < count; index++) {
    const template = DIGITS[index], pose = digitPose(state, side, index);
    const bones = Math.max(1, state.digitBoneCounts?.[index] ?? 3), segment = template.length / bones;
    let point = new THREE.Vector3(template.root[0], template.root[1], template.root[2] * mirror);
    let direction = new THREE.Vector3(template.dir[0], template.dir[1], template.dir[2] * mirror).normalize();
    direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), pose.spread * DEG * mirror);
    // Curl closes every phalanx towards the palm (local -Y); Bend only folds the knuckle.
    const axis = direction.clone().cross(new THREE.Vector3(0, -1, 0)).normalize();
    for (let bone = 0; bone < bones; bone++) {
      direction = direction.clone().applyAxisAngle(axis, (pose.curl + (bone === 0 ? pose.bend : 0)) * DEG);
      const next = point.clone().addScaledVector(direction, segment);
      out.push({ id:`handDigit${side}${index}${bone ? `~${bone + 1}` : ''}`, digit:index, bone, a:point.clone().applyQuaternion(frame.rotation).add(frame.pivot), b:next.clone().applyQuaternion(frame.rotation).add(frame.pivot) });
      point = next;
    }
  }
  return out;
}

const euler = values => new THREE.Quaternion().setFromEuler(new THREE.Euler(...(values || [0, 0, 0])));
export const footRotation = (state, side) => euler(state.footRotations?.[side]);
// The ankle follows its FootPlatform and keeps its own Setup rotation on top (rotating the Ankle turns the foot).
export const ankleRotation = (state, side) => euler(state.ankleRotations?.[side]).premultiply(footRotation(state, side));
export const ANKLE_DEFAULT = Object.freeze({ length:15, width:20, height:10 });

// The ankle runs from the ankle pivot towards the ball of the foot, following the FootPlatform orientation.
export function footBones(state, side) {
  const ankle = jointPosition(state, `ankle${side}`), rotation = ankleRotation(state, side);
  const size = { ...ANKLE_DEFAULT, ...(state.ankleSizes?.[side] || {}) };
  const ball = ankle.clone().addScaledVector(ankleDirection(state, side), size.length / 100);
  // CAT units: Length along the bone, Width and Height across it (scaled to this 1.79 m character).
  const bones = [{ id:`ankle${side}`, a:ankle, b:ball, width:size.width * .006, depth:size.height * .006 }];
  // Toes: one chain per foot digit, each from its own frame (so it can be moved and rotated in Setup Mode).
  for (let digit = 0; digit < (state.footDigits || 0); digit++) {
    const frame = footDigitFrame(state, side, digit), count = Math.max(1, state.footDigitBones || 1), direction = new THREE.Vector3(1, 0, 0).applyQuaternion(frame.rotation);
    let point = frame.pivot.clone();
    for (let bone = 0; bone < count; bone++) {
      const next = point.clone().addScaledVector(direction, .075 / count);
      bones.push({ id:`footDigit${side}${digit}${bone ? `~${bone + 1}` : ''}`, a:point, b:next, width:.04, depth:.03 });
      point = next;
    }
  }
  return bones;
}

// Limb chains, spine and neck as straight segments, split by their Segments value.
export function chainBones(state) {
  const out = [], seg = id => Math.max(1, state.segmentsById?.[id] || 1);
  const push = (id, a, b, count = 1) => { for (let i = 0; i < count; i++) out.push({ id:i ? `${id}~${i + 1}` : id, base:id, index:i, a:a.clone().lerp(b, i / count), b:a.clone().lerp(b, (i + 1) / count), last:i === count - 1 }); };
  const J = name => jointPosition(state, name);
  // Spine and neck follow their (possibly bent) CAT chain.
  const curve = name => { const { points, n } = spineChain(state, name); for (let i = 0; i < n; i++) out.push({ id:i ? `${name}~${i + 1}` : name, base:name, index:i, a:points[i], b:points[i + 1], last:i === n - 1 }); };
  if (state.spine) curve('spine');
  if (state.head) curve('neck');
  for (const side of ['L', 'R']) {
    if (hasLeg(state, side)) { push(`thigh${side}`, J(`hip${side}`), J(`knee${side}`), seg(`thigh${side}`)); push(`shin${side}`, J(`knee${side}`), J(`ankle${side}`), seg(`shin${side}`)); }
    if (state.arms >= (side === 'L' ? 1 : 2)) {
      if (state.collarbone !== false) push(`arm${side}`, collarboneStart(state, side), J(`shoulder${side}`));
      push(`upperArm${side}`, J(`shoulder${side}`), J(`elbow${side}`), seg(`upperArm${side}`));
      push(`forearm${side}`, J(`elbow${side}`), J(`wrist${side}`), seg(`forearm${side}`));
    }
  }
  return out;
}

// The collarbone starts at the top of the Ribcage hub, beside the neck, not at the hub pivot.
export const collarboneStart = collarboneStartPoint;

// Where a gizmo sits and which way it faces (the bone direction): used to draw it and to keep it attached.
export function gizmoAnchor(state, id) {
  if (['pelvis', 'ribcage', 'head'].includes(id)) {
    // Pelvis and head get a horizontal ring; the chest gizmo faces the front, as in the guide.
    const frame = partFrame(state, id), up = new THREE.Vector3(0, 1, 0).applyQuaternion(frame.rotation);
    if (id === 'ribcage') return { centre:frame.pivot.clone().addScaledVector(up, .04).add(new THREE.Vector3(0, 0, .16).applyQuaternion(frame.rotation)), axis:new THREE.Vector3(0, 0, 1).applyQuaternion(frame.rotation), size:.15 };
    return { centre:frame.pivot.clone().addScaledVector(up, id === 'head' ? .1 : 0), axis:up, size:id === 'head' ? .13 : .2 };
  }
  const all = [...chainBones(state), ...['L', 'R'].flatMap(side => [...handDigits(state, side), ...(hasLeg(state, side) ? footBones(state, side) : [])])];
  const bone = all.find(item => item.id === id);
  if (bone) { const length = bone.a.distanceTo(bone.b); return { centre:bone.a.clone().lerp(bone.b, .5), axis:bone.b.clone().sub(bone.a).normalize(), size:Math.max(.025, Math.min(.12, length * .55)) }; }
  if (/^palm[LR]$/.test(id)) { const frame = partFrame(state, id), along = new THREE.Vector3(1, 0, 0).applyQuaternion(frame.rotation); return { centre:frame.pivot.clone().addScaledVector(along, PALM_LENGTH / 2), axis:along, size:.07 }; }
  return null;
}

export { targetVector };

// What the Move/Rotate/Scale gizmo may act on. In Animation Mode CAT bones only rotate (the pelvis may also move);
// IK controllers (FootPlatform, IK Target, Up Nodes) and the CATParent move in both modes.
// IK limb: the leg is IK while IK/FK = 0 (default); the arm once it has an IK Target and IK/FK = 0.
export function limbIsIK(state, id) {
  const m = /^(thigh|shin|ankle|arm|upperArm|forearm|palm)([LR])$/.exec(baseId(id));
  if (!m) return false;
  // 3ds Max convention: IK/FK = 0 is IK, 1 is FK.
  if (['thigh', 'shin', 'ankle'].includes(m[1])) return (state.ikfk?.[`leg${m[2]}`] ?? 0) < .5;
  return !!state.ikTargets?.[m[2]] && (state.ikfk?.[`arm${m[2]}`] ?? 1) < .5;
}
export function transformable(state, id, tool, forDisplay = false) {
  const base = baseId(id);
  if (!base || base === 'mesh' || !state.root) return false;
  // With IK on, the upper and lower limb bones only translate (their pivots); in FK they rotate from their top.
  // The gizmo is still drawn (forDisplay) so the axes stay visible, as in 3ds Max.
  if (!forDisplay && tool === 'rotate' && /^(thigh|shin|upperArm|forearm)[LR]$/.test(base) && limbIsIK(state, base)) return false;
  if (base === 'catparent' || /^(foot|ik|legUp|armUp)[LR]$/.test(base)) return true;
  const bone = ['pelvis', 'ribcage', 'head', 'spine', 'neck'].includes(base) || /^(upperArm|forearm|thigh|shin|arm|palm|ankle)[LR]$/.test(base) || /^footDigit[LR]\d$/.test(base);
  if (!bone) return false;
  if (state.mode === 'Setup') return true;
  return tool === 'rotate' || (base === 'pelvis' && tool !== 'scale');
}
