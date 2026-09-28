// Rig Lab: armatures in Pose Mode. Bones, forward kinematics and an IK constraint with a pole target.
// Coordinates are three.js (Y up, +Z towards the front). Blender shows the same space as
// X = x, Y = -z (depth), Z = y (up): see toBlender / fromBlender.
import { Vector3, Quaternion, Matrix4, Euler } from '../../vendor/three.module.js';

export const toBlender = v => [v.x, -v.z, v.y];
export const fromBlender = ([x, y, z]) => new Vector3(x, z, -y);
const V = a => new Vector3(...a);
const UP = new Vector3(0, 1, 0);
const DEG = Math.PI / 180;

// ─── Rigs ────────────────────────────────────────────────────────────────────
// type: 'bone' (drawn as an octahedron) or 'control' / 'pole' (drawn with a custom shape).
// move: the bone can be moved with G (not connected and not locked).
export const RIGS = {
  arm: {
    name: 'Armature',
    bones: [
      { name: 'Chest', head: [0, 2.5, 0], tail: [0, 3.3, 0], parent: null },
      { name: 'Shoulder', head: [0.15, 3.15, 0], tail: [0.7, 3.2, 0], parent: 'Chest' },
      { name: 'UpperArm', head: [0.7, 3.2, 0], tail: [2.0, 3.2, 0], parent: 'Shoulder', connected: true },
      { name: 'Forearm', head: [2.0, 3.2, 0], tail: [3.2, 3.2, 0], parent: 'UpperArm', connected: true },
      { name: 'Hand', head: [3.2, 3.2, 0], tail: [3.75, 3.2, 0], parent: 'Forearm', connected: true },
    ],
  },
  leg: {
    name: 'Armature',
    bones: [
      { name: 'Hips', head: [0, 2.3, 0], tail: [0, 2.75, 0], parent: null, move: true },
      { name: 'Thigh', head: [0.35, 2.2, 0], tail: [0.35, 1.2, 0], parent: 'Hips' },
      { name: 'Shin', head: [0.35, 1.2, 0], tail: [0.35, 0.15, 0], parent: 'Thigh', connected: true },
      { name: 'IK_Foot', head: [0.35, 0.15, 0], tail: [0.35, 0.15, -0.45], parent: null, type: 'control', move: true },
      { name: 'Foot', head: [0.35, 0.15, 0], tail: [0.35, 0.05, 0.55], parent: 'IK_Foot' },
      { name: 'Knee_Pole', head: [0.35, 1.2, 1.5], tail: [0.35, 1.2, 1.75], parent: null, type: 'pole', move: true },
    ],
  },
};

// Blender's bone roll 0: a horizontal bone has its Z axis up; a vertical bone has its X axis along world X.
// Bones within about 10° of vertical (a slightly bent leg) keep the vertical rule, so their roll does not jump.
function restFrame(dir) {
  const Y = dir.clone().normalize();
  let X, Z;
  if (Math.abs(Y.dot(UP)) < 0.985) { Z = UP.clone().addScaledVector(Y, -UP.dot(Y)).normalize(); X = new Vector3().crossVectors(Y, Z); }
  else { X = new Vector3(1, 0, 0).addScaledVector(Y, -Y.x).normalize(); Z = new Vector3().crossVectors(X, Y); }
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(X, Y, Z));
}

// opts.knee: how far the knee joint was moved forward in Edit Mode (metres, three.js +Z = the front).
// opts.kneeSide: how far the knee was modelled to the side (+X, outwards). opts.roll: bone roll of Thigh and Shin (degrees).
export function makeRig(kind, opts = {}) {
  const def = RIGS[kind], leg = kind === 'leg', knee = leg ? +(opts.knee || 0) : 0, side = leg ? +(opts.kneeSide || 0) : 0, roll = leg ? +(opts.roll || 0) : 0;
  const bones = def.bones.map(b => {
    const o = { type: 'bone', connected: false, move: false, ...b, head: [...b.head], tail: [...b.tail] };
    if (b.name === 'Thigh') { o.tail[2] += knee; o.tail[0] += side; }
    if (b.name === 'Shin') { o.head[2] += knee; o.head[0] += side; }
    return o;
  });
  const index = Object.fromEntries(bones.map((b, i) => [b.name, i]));
  for (const b of bones) {
    b.headV = V(b.head); b.tailV = V(b.tail);
    b.length = b.headV.distanceTo(b.tailV);
    b.restQ = restFrame(b.tailV.clone().sub(b.headV));
    if (roll && (b.name === 'Thigh' || b.name === 'Shin')) b.restQ.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), roll * DEG));
    b.parentIndex = b.parent ? index[b.parent] : -1;
    if (b.parentIndex >= 0) {
      const p = bones[b.parentIndex], pinv = p.restQ.clone().invert();
      b.relQ = pinv.clone().multiply(b.restQ);
      b.offset = b.headV.clone().sub(p.headV).applyQuaternion(pinv);
    }
    b.canMove = b.move && !b.connected;
  }
  return { kind, name: def.name, bones, index, knee, kneeSide: side, roll };
}
// How much a two-bone chain is bent in its rest pose (Edit Mode), as a vector from the straight line to the joint.
export function restBend(rig, ia, ib) {
  const a = rig.bones[ia], b = rig.bones[ib], line = b.tailV.clone().sub(a.headV).normalize(), j = b.headV.clone().sub(a.headV);
  return j.addScaledVector(line, -j.dot(line));
}

// ─── State ───────────────────────────────────────────────────────────────────
// pose: name → { rot: [x, y, z] degrees (XYZ Euler, bone local), loc: [x, y, z] (bone local) }
// ik: null or { owner, target, pole, poleAngle (degrees), chain, influence }
export function defaultState(rig) {
  return { pose: Object.fromEntries(rig.bones.map(b => [b.name, { rot: [0, 0, 0], loc: [0, 0, 0] }])), ik: null, knee: rig.knee || 0 };
}
export const cloneState = s => JSON.parse(JSON.stringify(s));
// Blender's XYZ Euler applies X first, then Y, then Z: in three.js that is the order 'ZYX'.
export const quatFromRot = r => new Quaternion().setFromEuler(new Euler(r[0] * DEG, r[1] * DEG, r[2] * DEG, 'ZYX'));
export function rotFromQuat(q) {
  const e = new Euler().setFromQuaternion(q, 'ZYX');
  return [e.x, e.y, e.z].map(a => Math.round(a / DEG * 100) / 100 + 0);
}
export const rotAngle = r => 2 * Math.acos(Math.min(1, Math.abs(quatFromRot(r).w))) / DEG;
const rotateAbout = (v, axis, deg) => v.clone().applyQuaternion(new Quaternion().setFromAxisAngle(axis, deg * DEG));

// ─── Evaluation: FK, then the IK constraint, then the bones that depend on the chain ─
function fkBone(rig, st, W, i) {
  const b = rig.bones[i], p = st.pose[b.name] || { rot: [0, 0, 0], loc: [0, 0, 0] };
  const loc = b.connected ? new Vector3() : V(p.loc);
  let pre, h;
  if (b.parentIndex < 0) { pre = b.restQ.clone(); h = b.headV.clone().add(loc.applyQuaternion(pre)); }
  else {
    const P = W[b.parentIndex];
    pre = P.q.clone().multiply(b.relQ);
    h = P.h.clone().add(b.offset.clone().applyQuaternion(P.q)).add(loc.applyQuaternion(pre));
  }
  const q = pre.clone().multiply(quatFromRot(p.rot));
  W[i] = { q, h, t: h.clone().add(new Vector3(0, b.length, 0).applyQuaternion(q)), pre };
}
const tailOf = (b, w) => w.h.clone().add(new Vector3(0, b.length, 0).applyQuaternion(w.q));

export function solve(rig, st) {
  const W = [];
  rig.bones.forEach((_, i) => fkBone(rig, st, W, i));
  const info = { active: false };
  const ik = st.ik;
  if (ik && ik.target && rig.index[ik.target] != null && rig.index[ik.owner] != null && ik.target !== ik.owner) {
    const chain = [];
    for (let i = rig.index[ik.owner], n = 0; i >= 0 && (ik.chain === 0 || n < ik.chain); i = rig.bones[i].parentIndex, n++) chain.unshift(i);
    const T = W[rig.index[ik.target]].h.clone();
    const fk = chain.map(i => W[i].q.clone());
    const solved = chain.length === 2 ? twoBone(rig, W, chain, T, ik, info) : ccd(rig, W, chain, T);
    // Influence blends the FK and the IK rotations, like the Influence slider of any constraint.
    const inf = Math.max(0, Math.min(1, ik.influence ?? 1));
    chain.forEach((i, k) => { W[i].q = fk[k].clone().slerp(solved[k], inf); });
    placeChain(rig, W, chain);
    const tipB = rig.bones[chain[chain.length - 1]], tip = tailOf(tipB, W[chain[chain.length - 1]]);
    Object.assign(info, { active: true, chain, target: T, dist: tip.distanceTo(T) });
    if (chain.length === 2) {
      const A = W[chain[0]].h, u = T.clone().sub(A).normalize(), B = W[chain[1]].h;
      const k = B.clone().sub(A); k.addScaledVector(u, -k.dot(u));
      info.kneeDir = k.length() > 1e-4 ? k.normalize() : null;
    }
    // bones that hang from the chain (none in the lab rigs, but keep it general)
    const moved = new Set(chain);
    rig.bones.forEach((b, i) => { if (!moved.has(i) && moved.has(b.parentIndex)) { fkBone(rig, st, W, i); moved.add(i); } });
  }
  return { W, info };
}
function placeChain(rig, W, chain) {
  for (let k = 0; k < chain.length; k++) {
    const i = chain[k], b = rig.bones[i];
    if (k > 0) { const pi = chain[k - 1]; W[i].h = W[pi].h.clone().add(b.offset.clone().applyQuaternion(W[pi].q)); }
    W[i].t = tailOf(b, W[i]);
  }
}
// Two bones, solved exactly. The root bone's X axis is turned towards the pole target (plus the Pole Angle),
// as Blender does; without a pole the chain keeps the X axis it has in FK. The joint bends away from that axis,
// towards the bones' local Z: a leg that is straight in the rest pose bends its knee backwards until it has a pole.
function twoBone(rig, W, [ia, ib], T, ik, info) {
  const a = rig.bones[ia], b = rig.bones[ib];
  const A = W[ia].h.clone(), L1 = a.length, L2 = b.length;
  const dv = T.clone().sub(A), d0 = dv.length();
  const u = d0 > 1e-6 ? dv.clone().divideScalar(d0) : new Vector3(0, -1, 0);
  const d = Math.max(Math.abs(L1 - L2) + 1e-4, Math.min(L1 + L2 - 1e-6, d0));
  info.reached = d0 <= L1 + L2 + 1e-4;
  const perp = v => v.clone().addScaledVector(u, -v.dot(u));
  let r = null;
  if (ik.pole && rig.index[ik.pole] != null) {
    const pv = perp(W[rig.index[ik.pole]].h.clone().sub(A));
    if (pv.length() > 1e-5) r = rotateAbout(pv.normalize(), u, ik.poleAngle || 0);
  }
  if (!r) {
    // No pole: the chain bends the way it is already bent in the rest pose (turned with the parent of the chain).
    // A perfectly straight chain gives no hint: the solver falls back on the bones' X axis and here bends backwards.
    const bend = restBend(rig, ia, ib);
    info.straight = bend.length() < 1e-3;
    if (!info.straight) {
      if (a.parentIndex >= 0) bend.applyQuaternion(W[a.parentIndex].q.clone().multiply(rig.bones[a.parentIndex].restQ.clone().invert()));
      const kb = perp(bend);
      if (kb.length() > 1e-5) r = new Vector3().crossVectors(kb.normalize(), u).normalize();
    }
    if (!r) {
      const x = perp(new Vector3(1, 0, 0).applyQuaternion(W[ia].q));
      r = (x.length() > 1e-5 ? x.normalize() : perp(new Vector3(0, 0, 1)).normalize()).negate();
    }
  }
  // The joint bends towards −Z of the root bone (its X axis is r), as in Blender.
  const k = new Vector3().crossVectors(u, r).normalize();
  const along = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - along * along));
  const B = A.clone().addScaledVector(u, along).addScaledVector(k, h), tip = A.clone().addScaledVector(u, d);
  const frame = (Y) => { const Z = new Vector3().crossVectors(r, Y).normalize(); const X = new Vector3().crossVectors(Y, Z); return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(X, Y, Z)); };
  return [frame(B.clone().sub(A).normalize()), frame(tip.sub(B).normalize())];
}
// Longer or shorter chains: cyclic coordinate descent. (Blender uses its own iterative solver; the result is similar.)
function ccd(rig, W, chain, T) {
  const Q = chain.map(i => W[i].q.clone()), tmp = chain.map(i => ({ ...W[i] }));
  const place = () => { chain.forEach((i, k) => { tmp[k].q = Q[k]; }); const Wt = [...W]; chain.forEach((i, k) => { Wt[i] = tmp[k]; }); placeChain(rig, Wt, chain); return Wt; };
  for (let it = 0; it < 40; it++) {
    for (let k = chain.length - 1; k >= 0; k--) {
      const Wt = place(), last = chain[chain.length - 1];
      const tip = tailOf(rig.bones[last], Wt[last]), h = Wt[chain[k]].h;
      const v1 = tip.sub(h).normalize(), v2 = T.clone().sub(h).normalize();
      if (v1.lengthSq() < 1e-9 || v2.lengthSq() < 1e-9) continue;
      const dq = new Quaternion().setFromUnitVectors(v1, v2);
      for (let j = k; j < chain.length; j++) Q[j] = dq.clone().multiply(Q[j]);
    }
  }
  return Q;
}

// ─── Helpers for the app and the checks ──────────────────────────────────────
export const posOf = (rig, W, name, end = 'h') => W[rig.index[name]][end].clone();
// Turn a world rotation into the bone's own XYZ Euler, as Pose Mode stores it.
export function setWorldRotation(rig, st, W, name, q) {
  const w = W[rig.index[name]];
  st.pose[name].rot = rotFromQuat(w.pre.clone().invert().multiply(q));
}
// Move a bone by a world offset: Pose Mode stores the location in the bone's own rest space.
export function addWorldLocation(rig, st, W, name, delta) {
  const w = W[rig.index[name]], local = delta.clone().applyQuaternion(w.pre.clone().invert());
  const l = st.pose[name].loc;
  st.pose[name].loc = [l[0] + local.x, l[1] + local.y, l[2] + local.z].map(v => Math.round(v * 1e4) / 1e4);
}
// FK "by hand": rotate the listed bones (root first) so the tail of the last one reaches a point.
export function reachFK(rig, st, names, point, iters = 60) {
  for (let it = 0; it < iters; it++) {
    for (let k = names.length - 1; k >= 0; k--) {
      const { W } = solve(rig, st);
      const tip = posOf(rig, W, names[names.length - 1], 't'), w = W[rig.index[names[k]]];
      const v1 = tip.sub(w.h).normalize(), v2 = point.clone().sub(w.h).normalize();
      const dq = new Quaternion().setFromUnitVectors(v1, v2);
      setWorldRotation(rig, st, W, names[k], dq.multiply(w.q));
    }
  }
  return st;
}
