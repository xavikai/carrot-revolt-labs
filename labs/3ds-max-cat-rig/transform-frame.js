import * as THREE from '../../vendor/three.module.js';

// Max X/Y/Z expressed in Three's Y-up coordinates.
export const maxAxes = () => ({x:new THREE.Vector3(1,0,0),y:new THREE.Vector3(0,0,-1),z:new THREE.Vector3(0,1,0)});
// A new CAT rig is built flat on the character's centre plane (depth 0): the student corrects depth in the Left view.
export const jointDepthOf = (state,name) => state.jointDepths?.[name] ?? 0;
// Segments, phalanges and gizmos share the setup of their base object: forearmL~2 -> forearmL, gizmo:headL -> head.
export const baseId = id => String(id??'').replace(/^gizmo:/,'').split('~')[0];
// Three-space point of a [screen x, screen y, depth] target (foot platforms, IK targets and Up Nodes).
export const targetVector = target => new THREE.Vector3((target[0]-300)/225,(480-target[1])/225,target[2]);
export const jointPosition = (state,name) => new THREE.Vector3((state.joints[name][0]-300)/225,(480-state.joints[name][1])/225,jointDepthOf(state,name));
const quaternion = values => new THREE.Quaternion().setFromEuler(new THREE.Euler(...(values||[0,0,0])));

// ── Spine and neck (CAT procedural spine) ──
// A chain of N bones from its base joint to its hub. Each bone keeps a local rotation (spineSegs); spineBase keeps the
// chain's base orientation. The bone length is fixed by the distance base → hub, so bending the chain moves the hub.
export const SPINE_CHAINS = Object.freeze({ spine:{from:'pelvis',to:'chest',hub:'ribcage',count:'spineBones'}, neck:{from:'chest',to:'head',hub:'head',count:'headBones'} });
export function spineChain(state, name) {
  const c = SPINE_CHAINS[name], n = Math.max(1, state[c.count] || 1), up = new THREE.Vector3(0, 1, 0);
  const segs = state.spineSegs?.[name] || [], D = [], acc = new THREE.Quaternion();
  for (let i = 0; i < n; i++) { acc.multiply(quaternion(segs[i])); D.push(acc.clone()); }
  const s = D.reduce((sum, q) => sum.add(up.clone().applyQuaternion(q)), new THREE.Vector3()).divideScalar(n);
  const a = jointPosition(state, c.from), v = jointPosition(state, c.to).sub(a);
  const base = quaternion(state.spineBase?.[name]), predicted = s.clone().applyQuaternion(base);
  // If the hub was moved, re-aim the chain with the smallest rotation (keeps its twist).
  const B = predicted.lengthSq() > 1e-12 && v.lengthSq() > 1e-12 ? new THREE.Quaternion().setFromUnitVectors(predicted.clone().normalize(), v.clone().normalize()).multiply(base) : base;
  const l = v.length() / Math.max(1e-6, n * s.length());
  const points = [a.clone()];
  for (let i = 0; i < n; i++) points.push(points[i].clone().addScaledVector(up.clone().applyQuaternion(B.clone().multiply(D[i])), l));
  return { n, D, B, l, points, segs };
}
// Rotate bone k of a chain (k = n rotates the hub): bones k.. turn about the start of bone k; returns the transform
// to apply to everything above it (point → point').
export function rotateSpineSegment(state, name, k, axis, angle) {
  const chain = spineChain(state, name), { n, D, B } = chain;
  const turn = new THREE.Quaternion().setFromAxisAngle(axis.clone().normalize(), angle);
  const local = B.clone().invert().multiply(turn).multiply(B);
  const segs = Array.from({ length: n }, (_, i) => quaternion(chain.segs[i]));
  const prev = k > 0 ? D[k - 1] : new THREE.Quaternion();
  segs[k] = prev.clone().invert().multiply(local).multiply(prev).multiply(segs[k]);
  state.spineSegs ??= {}; state.spineBase ??= {};
  state.spineSegs[name] = segs.map(q => new THREE.Euler().setFromQuaternion(q.normalize(), 'XYZ').toArray().slice(0, 3));
  state.spineBase[name] = new THREE.Euler().setFromQuaternion(B, 'XYZ').toArray().slice(0, 3);
  // Same base and bone length: the hub joint goes to the new end of the chain.
  const up = new THREE.Vector3(0, 1, 0), acc = new THREE.Quaternion(), end = chain.points[0].clone();
  for (const q of segs) { acc.multiply(q); end.addScaledVector(up.clone().applyQuaternion(B.clone().multiply(acc)), chain.l); }
  const to = SPINE_CHAINS[name].to; state.joints[to] = [300 + end.x * 225, 480 - end.y * 225]; state.jointDepths ??= {}; state.jointDepths[to] = end.z;
  const pivot = chain.points[k].clone();
  return point => point.clone().sub(pivot).applyQuaternion(turn).add(pivot);
}
// Rotating the hub bends the whole chain: the turn is shared equally by its bones (the hub ends up turned by all of it).
export function bendSpine(state, name, axis, angle) {
  const n = spineChain(state, name).n, before = jointPosition(state, SPINE_CHAINS[name].to);
  for (let k = 0; k < n; k++) rotateSpineSegment(state, name, k, axis, angle / n);
  const after = spineChain(state, name).points.at(-1), turn = new THREE.Quaternion().setFromAxisAngle(axis.clone().normalize(), angle);
  return point => point.clone().sub(before).applyQuaternion(turn).add(after);
}
export const resetSpine = (state, name) => { delete state.spineSegs?.[name]; delete state.spineBase?.[name]; };

// ── Foot ──
// The FootPlatform pivot sits on the ground under the tip of the foot bone (default ankle at 7.5 cm height).
export const FOOT_PIVOT = Object.freeze([0,-.075,.075]);
export const ANKLE_HEIGHT = .075;
// The foot (Ankle) bone runs from the ankle joint down to its tip, turned by the platform and by its own rotation.
export const ankleDirection = (state,side) => new THREE.Vector3(0,-.5,.866).normalize().applyQuaternion(quaternion(state.footRotations?.[side]).multiply(quaternion(state.ankleRotations?.[side])));
export const ankleLength = (state,side) => (state.ankleSizes?.[side]?.length ?? 15)/100;
export const ankleTip = (state,side) => jointPosition(state,`ankle${side}`).addScaledVector(ankleDirection(state,side),ankleLength(state,side));

export function invalidateLegSetup(state,names) {
  for(const side of ['L','R']){
    if(!names.some(name=>['hip','knee','ankle'].some(joint=>name===joint+side)))continue;
    if(names.includes(`ankle${side}`)&&!state.pinnedFootTargets?.[side])delete state.footTargets?.[side];
    delete state.legIKLengths?.[side];
    delete state.legIKRest?.[side];
    delete state.footOffsets?.[side];
  }
}

// A shared joint moves both adjacent bones. Never offset one bone's mesh independently.
export function moveSetupJoints(state,names,delta) {
  state.jointDepths??={};
  for(const name of names){
    const point=jointPosition(state,name).add(delta);
    state.joints[name]=[300+point.x*225,480-point.y*225];
    state.jointDepths[name]=point.z;
  }
  invalidateLegSetup(state,names);
}

// Once a leg bone is edited, pin the current IK controller position. This
// keeps setup edits one-way: bones may move away from the target, while moving
// the FootPlatform is the operation that solves the leg toward a new target.
export function pinFootTarget(state,side) {
  state.footTargets??={};
  state.pinnedFootTargets??={};
  if(state.footTargets[side]===undefined){
    const name=`ankle${side}`;
    state.footTargets[side]=[...state.joints[name],jointDepthOf(state,name)];
  }
  state.pinnedFootTargets[side]=true;
  return state.footTargets[side];
}

export function partSegment(id) {
  id=baseId(id);
  if(id==='spine')return ['pelvis','chest'];
  if(id==='neck')return ['chest','head'];
  const end=/^(palm|ankle)([LR])$/.exec(id);
  if(end)return end[1]==='palm'?[`elbow${end[2]}`,`wrist${end[2]}`]:[`knee${end[2]}`,`ankle${end[2]}`];
  const match=/^(upperArm|forearm|thigh|shin|arm|leg)([LR])$/.exec(id);
  if(!match)return null;
  const [,part,side]=match;
  return {arm:['chest',`shoulder${side}`],leg:['pelvis',`hip${side}`],upperArm:[`shoulder${side}`,`elbow${side}`],forearm:[`elbow${side}`,`wrist${side}`],thigh:[`hip${side}`,`knee${side}`],shin:[`knee${side}`,`ankle${side}`]}[part];
}

export function partFrame(state,id) {
  let pivot,rotation;
  const spinePiece=/^(spine|neck)(?:~(\d+))?$/.exec(String(id??''));
  if(spinePiece){
    // A spine bone pivots at its base; Local Z runs along the bone.
    const chain=spineChain(state,spinePiece[1]),k=Math.min(chain.n,+(spinePiece[2]||1))-1;
    const zToY=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),0);
    return {pivot:chain.points[k].clone().add(new THREE.Vector3(0,0,(state.pelvisDepth||0))),rotation:chain.B.clone().multiply(chain.D[k]).multiply(zToY).normalize()};
  }
  id=baseId(id);
  const segment=partSegment(id),end=/^(palm|ankle|foot)([LR])$/.exec(id);
  if(id==='catparent')return {pivot:new THREE.Vector3(0,.06,0),rotation:new THREE.Quaternion()};
  const helper=/^(ik|legUp|armUp)([LR])$/.exec(id);
  if(helper){
    const target=helper[1]==='ik'?state.ikTargets?.[helper[2]]:state.upNodes?.[`${helper[1]==='legUp'?'leg':'arm'}${helper[2]}`];
    if(!target)return null;
    return {pivot:targetVector(target),rotation:helper[1]==='ik'?quaternion(state.ikRotations?.[helper[2]]):new THREE.Quaternion()};
  }
  const toe=/^footDigit([LR])(\d)$/.exec(id);
  if(toe)return footDigitFrame(state,toe[1],+toe[2]);
  if(['pelvis','ribcage','head'].includes(id)){
    pivot=jointPosition(state,id==='ribcage'?'chest':id);
    rotation=quaternion(state.partRotations?.[id]);
  }else if(end?.[1]==='foot'){
    const name=`ankle${end[2]}`,target=state.footTargets?.[end[2]];
    pivot=target?new THREE.Vector3((target[0]-300)/225,(480-target[1])/225,target[2]):jointPosition(state,name);
    pivot.add(new THREE.Vector3(...FOOT_PIVOT));
    rotation=quaternion(state.footRotations?.[end[2]]);
  }else if(segment){
    const [first,last]=segment;
    pivot=jointPosition(state,end?last:first);
    // The Ankle gizmo sits on the ankle joint (top of the foot bone); its Local X runs along the bone.
    // (With IK the rotation itself turns around the tip of the bone: see the lab's rotateAnkleFromTip.)
    if(end?.[1]==='ankle'){
      const foot=quaternion(state.footRotations?.[end[2]]),ankle=quaternion(state.ankleRotations?.[end[2]]);
      const base=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1,0,0),new THREE.Vector3(0,-.5,.866).normalize());
      return {pivot:jointPosition(state,`ankle${end[2]}`).add(new THREE.Vector3(0,0,(state.depthOffsets?.[id]||0)+(state.pelvisDepth||0))),rotation:foot.multiply(ankle).multiply(base).normalize()};
    }
    const along=jointPosition(state,last).sub(jointPosition(state,first));
    if(along.lengthSq()<1e-12)along.set(0,1,0);else along.normalize();
    const lengthAxis=state.lengthAxis==='Z'?'z':'x',stored=state.partRotations?.[id];
    if(stored){
      rotation=quaternion(stored);
      const previous=maxAxes()[lengthAxis].applyQuaternion(rotation);
      if(!end)rotation.premultiply(new THREE.Quaternion().setFromUnitVectors(previous,along));
    }else{
      let normal=new THREE.Vector3(0,0,-1);
      normal.addScaledVector(along,-normal.dot(along));
      if(normal.lengthSq()<1e-8){normal.set(1,0,0);normal.addScaledVector(along,-normal.dot(along));}
      normal.normalize();
      const axes=lengthAxis==='x'?{x:along,y:normal,z:along.clone().cross(normal)}:{x:normal.clone().cross(along),y:normal,z:along};
      rotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(axes.x,axes.z,axes.y.clone().negate()));
      // Right arm: use the mirror of the left frame (as Add Arm builds it), so palm and digits keep the same local meaning.
      if(/^(arm|upperArm|forearm|palm)R$/.test(id))rotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI));
    }
  }else return null;
  pivot.z+=(state.depthOffsets?.[id]||0)+(state.pelvisDepth||0);
  return {pivot,rotation:rotation.normalize()};
}

export function parentMatrix(state) {
  const transform=state.parentTransform||{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},scale=state.catScale??1;
  return new THREE.Matrix4().compose(new THREE.Vector3(transform.position[0],transform.position[1]+.03*(1-scale),transform.position[2]),quaternion(transform.rotation),new THREE.Vector3(...transform.scale).multiplyScalar(scale));
}

export function gizmoFrame(state,id,cameraRotation=new THREE.Quaternion()) {
  const frame=partFrame(state,id);if(!frame)return null;
  const pivot=frame.pivot.applyMatrix4(parentMatrix(state));
  let axes=maxAxes();
  if(state.coord==='Local'){
    const rotation=quaternion(state.parentTransform?.rotation).multiply(frame.rotation);
    for(const direction of Object.values(axes))direction.applyQuaternion(rotation);
  }
  // View behaves as World: the axes keep their World directions instead of turning with the camera.
  return {pivot,axes};
}

export function worldMoveToRig(state,delta) {
  return delta.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(parentMatrix(state).invert()));
}
export function worldAxisToRig(state,direction) {
  return direction.clone().applyQuaternion(quaternion(state.parentTransform?.rotation).invert()).normalize();
}

export function axisDragPlane(pivot,direction,cameraPosition) {
  const normal=cameraPosition.clone().sub(pivot).normalize();
  normal.addScaledVector(direction,-normal.dot(direction));
  return normal.lengthSq()<.0064?null:new THREE.Plane().setFromNormalAndCoplanarPoint(normal.normalize(),pivot);
}

export function rotatePartFrames(state,ids,direction,angle) {
  const turn=new THREE.Quaternion().setFromAxisAngle(direction,angle);
  state.partRotations??={};
  for(const id of [...new Set(ids.map(baseId))]){
    const frame=partFrame(state,id);if(!frame||id==='catparent')continue;
    const values=new THREE.Euler().setFromQuaternion(frame.rotation.premultiply(turn),'XYZ').toArray().slice(0,3);
    const foot=/^foot([LR])$/.exec(id);
    if(foot){state.footRotations??={};state.footRotations[foot[1]]=values;}
    else state.partRotations[id]=values;
  }
}

// Mirror matrix through the pelvis (or any hub) plane of symmetry, in rig space.
export function hubMirror(state,hubId,centreName){
  const centre=jointPosition(state,centreName),hub=partFrame(state,hubId),rotation=new THREE.Matrix4().makeRotationFromQuaternion(hub.rotation);
  return {centre,reflection:rotation.clone().multiply(new THREE.Matrix4().makeScale(-1,1,1)).multiply(rotation.clone().invert())};
}
export const mirrorEuler=(values,reflection)=>{const m=reflection.clone().multiply(new THREE.Matrix4().makeRotationFromQuaternion(quaternion(values))).multiply(reflection);return new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromRotationMatrix(m).normalize(),'XYZ').toArray().slice(0,3);};

// Which legs exist. state.legSides (['L'], ['R'] or ['L','R']) once a leg has been deleted; otherwise the leg count.
export const legSidesOf = state => state.legSides ? [...state.legSides] : ['L','R'].slice(0, Math.max(0, Math.min(2, state.legs || 0)));
export const hasLeg = (state, side) => legSidesOf(state).includes(side);
const LEG_FIELDS = ['footTargets','pinnedFootTargets','legIKLengths','legIKRest','footOffsets','footRotations','ankleRotations','ankleSizes'];
// Per-toe setup, keyed by side + digit index ('L0', 'L1'...).
const TOE_FIELDS = ['footDigitRotations','footDigitOffsets'];
const dropToes = (state, side) => { for (const field of TOE_FIELDS) for (const key of Object.keys(state[field] || {})) if (key[0] === side) delete state[field][key]; };

// Add Leg. The first leg hangs from the pelvis down to the ground (its platform at the base of the rig).
// The next one is the mirror of the leg that already exists, as it has been set up.
export function addLegFromSetup(state) {
  const sides = legSidesOf(state);
  if (sides.length >= 2) return false;
  state.jointDepths ??= {};
  const put = (name, point) => { state.joints[name] = [300 + point.x * 225, 480 - point.y * 225]; state.jointDepths[name] = point.z; };
  if (!sides.length) {
    const pelvis = jointPosition(state, 'pelvis'), hub = partFrame(state, 'pelvis');
    const hip = new THREE.Vector3(.1, -.06, 0).applyQuaternion(hub.rotation).add(pelvis);
    const ankle = new THREE.Vector3(hip.x, ANKLE_HEIGHT, hip.z);
    put('hipL', hip); put('kneeL', hip.clone().lerp(ankle, .5)); put('ankleL', ankle);
    for (const field of LEG_FIELDS) delete state[field]?.L;
    dropToes(state, 'L');
    sides.push('L');
  } else {
    const from = sides[0], to = from === 'L' ? 'R' : 'L';
    const { centre, reflection } = hubMirror(state, 'pelvis', 'pelvis');
    for (const joint of ['hip', 'knee', 'ankle']) put(`${joint}${to}`, jointPosition(state, `${joint}${from}`).sub(centre).applyMatrix4(reflection).add(centre));
    const mirrorPoint = target => { const p = targetVector(target).sub(centre).applyMatrix4(reflection).add(centre); return [300 + p.x * 225, 480 - p.y * 225, p.z]; };
    if (state.footTargets?.[from]) { state.footTargets[to] = mirrorPoint(state.footTargets[from]); state.pinnedFootTargets ??= {}; state.pinnedFootTargets[to] = !!state.pinnedFootTargets?.[from]; } else delete state.footTargets?.[to];
    for (const field of ['footRotations', 'ankleRotations']) { if (state[field]?.[from]) state[field][to] = mirrorEuler(state[field][from], reflection); else delete state[field]?.[to]; }
    dropToes(state, to);
    for (const [key, value] of Object.entries(state.footDigitRotations || {})) if (key[0] === from) state.footDigitRotations[to + key.slice(1)] = mirrorEuler(value, reflection);
    for (const [key, value] of Object.entries(state.footDigitOffsets || {})) if (key[0] === from) state.footDigitOffsets[to + key.slice(1)] = new THREE.Vector3(...value).applyMatrix4(reflection).toArray();
    if (state.upNodes?.[`leg${from}`]) state.upNodes[`leg${to}`] = mirrorPoint(state.upNodes[`leg${from}`]); else delete state.upNodes?.[`leg${to}`];
    for (const part of ['thigh', 'shin', 'ankle']) for (const field of ['segmentsById', 'boneSizes', 'locksById']) { if (state[field]?.[`${part}${from}`] !== undefined) state[field][`${part}${to}`] = structuredClone(state[field][`${part}${from}`]); }
    if (state.ankleSizes?.[from]) state.ankleSizes[to] = structuredClone(state.ankleSizes[from]);
    for (const field of ['targetSize', 'targetDisplay']) if (state[field]?.[`foot${from}`] !== undefined) state[field][`foot${to}`] = structuredClone(state[field][`foot${from}`]);
    if (state.ikfk && state.ikfk[`leg${from}`] !== undefined) state.ikfk[`leg${to}`] = state.ikfk[`leg${from}`];
    for (const field of ['legIKLengths', 'legIKRest', 'footOffsets']) delete state[field]?.[to];
    sides.push(to);
  }
  state.legSides = ['L', 'R'].filter(side => sides.includes(side));
  state.legs = state.legSides.length;
  return true;
}

// Delete a leg (select any of its bones, its platform or its Up Node and press Delete).
export function removeLeg(state, side) {
  if (!hasLeg(state, side)) return false;
  state.legSides = legSidesOf(state).filter(s => s !== side);
  state.legs = state.legSides.length;
  for (const field of LEG_FIELDS) delete state[field]?.[side];
  dropToes(state, side);
  delete state.upNodes?.[`leg${side}`];
  const ofLeg = id => new RegExp(`^(thigh|shin|ankle|footDigit|foot|legUp)${side}`).test(id);
  for (const field of ['segmentsById', 'boneSizes', 'locksById', 'partRotations', 'renames', 'targetSize', 'targetDisplay', 'gizmoSettings']) for (const key of Object.keys(state[field] || {})) if (ofLeg(key)) delete state[field][key];
  if (state.gizmos) for (const id of [...state.gizmos]) if (ofLeg(id)) state.gizmos.delete(id);
  if (state.skinBones) for (const id of [...state.skinBones]) if (ofLeg(id)) state.skinBones.delete(id);
  return true;
}

// Foot digits (toes) start at the tip of the Ankle; they can be moved and rotated in Setup Mode.
// Each toe sits side by side across the tip of the foot; its own Setup rotation and offset are added on top.
export function footDigitFrame(state, side, digit = 0) {
  const ankle = quaternion(state.footRotations?.[side]).multiply(quaternion(state.ankleRotations?.[side]));
  const count = Math.max(1, state.footDigits || 1), across = (digit - (count - 1) / 2) * .05;
  const rotation = ankle.clone().multiply(quaternion(state.footDigitRotations?.[`${side}${digit}`]));
  const base = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -.06, 1).normalize());
  const pivot = ankleTip(state, side).add(new THREE.Vector3(across, 0, 0).applyQuaternion(ankle)).add(new THREE.Vector3(...(state.footDigitOffsets?.[`${side}${digit}`] || [0, 0, 0])));
  return { pivot, rotation: rotation.multiply(base).normalize() };
}

// Start of the collarbone: on top of the Chest hub, beside the neck.
export function collarboneStartPoint(state, side) {
  const frame = partFrame(state, 'ribcage');
  return new THREE.Vector3(side === 'L' ? .035 : -.035, .07, .015).applyQuaternion(frame.rotation).add(jointPosition(state, 'chest'));
}

// Add Arm. As in 3ds Max, the first arm is built from the Chest hub: the collarbone goes out sideways and the
// arm hangs straight down (Arm1, Arm2 and Palm). The second arm is the mirror of the first one (as set up).
export function addArmFromSetup(state, { keepJoints = false } = {}) {
  if(state.arms>=2)return false;
  if(!state.arms&&!keepJoints){
    const hub=partFrame(state,'ribcage'),start=collarboneStartPoint(state,'L'),down=new THREE.Vector3(0,-1,0).applyQuaternion(hub.rotation);
    const shoulder=start.clone().add(new THREE.Vector3(.15,-.02,0).applyQuaternion(hub.rotation));
    const elbow=shoulder.clone().addScaledVector(down,.28),wrist=elbow.clone().addScaledVector(down,.25);
    state.jointDepths??={};
    for(const [name,p] of [['shoulderL',shoulder],['elbowL',elbow],['wristL',wrist]]){state.joints[name]=[300+p.x*225,480-p.y*225];state.jointDepths[name]=p.z;}
    for(const part of ['arm','upperArm','forearm','palm'])delete state.partRotations?.[`${part}L`];
  }
  if(state.arms===1){
    const centre=jointPosition(state,'chest'),hub=partFrame(state,'ribcage');
    const hubRotation=new THREE.Matrix4().makeRotationFromQuaternion(hub.rotation);
    const reflection=hubRotation.clone().multiply(new THREE.Matrix4().makeScale(-1,1,1)).multiply(hubRotation.clone().invert());
    state.jointDepths??={};state.partRotations??={};
    for(const joint of ['shoulder','elbow','wrist']){
      const point=jointPosition(state,`${joint}L`).sub(centre).applyMatrix4(reflection).add(centre);
      state.joints[`${joint}R`]=[300+point.x*225,480-point.y*225];
      state.jointDepths[`${joint}R`]=point.z;
    }
    for(const part of ['arm','upperArm','forearm','palm']){
      const source=`${part}L`,target=`${part}R`;
      // Two reflections keep the mirrored bone's frame right handed and its length axis pointing outward.
      const rotation=reflection.clone().multiply(new THREE.Matrix4().makeRotationFromQuaternion(partFrame(state,source).rotation)).multiply(new THREE.Matrix4().makeScale(1,1,-1));
      state.partRotations[target]=new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromRotationMatrix(rotation).normalize(),'XYZ').toArray().slice(0,3);
      for(const field of ['boneSizes','locksById']){
        if(state[field]?.[source]!==undefined){state[field]??={};state[field][target]=structuredClone(state[field][source]);}
        else delete state[field]?.[target];
      }
      if(state.stretchById?.[source]!==undefined)state.stretchById[target]=state.stretchById[source];
      if(state.segmentsById?.[source]!==undefined)state.segmentsById[target]=state.segmentsById[source];
    }
    // The new arm also copies the Up Node setting, mirrored to the other side.
    if(state.upNodes?.armL){const point=targetVector(state.upNodes.armL).sub(centre).applyMatrix4(reflection).add(centre);state.upNodes.armR=[300+point.x*225,480-point.y*225,point.z];}
  }
  state.arms=(state.arms||0)+1;
  return true;
}
