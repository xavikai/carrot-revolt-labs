import * as THREE from '../../vendor/three.module.js';

// Max X/Y/Z expressed in Three's Y-up coordinates.
export const maxAxes = () => ({x:new THREE.Vector3(1,0,0),y:new THREE.Vector3(0,0,-1),z:new THREE.Vector3(0,1,0)});
export const jointDepthOf = (state,name) => state.jointDepths?.[name] ?? (['pelvis','chest','head'].includes(name)?.08:name.startsWith('knee')?.19:name.startsWith('elbow')?.17:.11);
export const jointPosition = (state,name) => new THREE.Vector3((state.joints[name][0]-300)/225,(480-state.joints[name][1])/225,jointDepthOf(state,name));
const quaternion = values => new THREE.Quaternion().setFromEuler(new THREE.Euler(...(values||[0,0,0])));

export function invalidateLegSetup(state,names) {
  for(const side of ['L','R']){
    if(!names.some(name=>['hip','knee','ankle'].some(joint=>name===joint+side)))continue;
    if(names.includes(`ankle${side}`)&&!state.pinnedFootTargets?.[side])delete state.footTargets?.[side];
    delete state.legIKLengths?.[side];
    delete state.legIKRest?.[side];
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
    state.footTargets[side]=[...state.joints[name],state.jointDepths?.[name]??.11];
  }
  state.pinnedFootTargets[side]=true;
  return state.footTargets[side];
}

export function partSegment(id) {
  if(id==='spine')return ['pelvis','chest'];
  const end=/^(palm|ankle)([LR])$/.exec(id);
  if(end)return end[1]==='palm'?[`elbow${end[2]}`,`wrist${end[2]}`]:[`knee${end[2]}`,`ankle${end[2]}`];
  const match=/^(upperArm|forearm|thigh|shin|arm|leg)([LR])$/.exec(id);
  if(!match)return null;
  const [,part,side]=match;
  return {arm:['chest',`shoulder${side}`],leg:['pelvis',`hip${side}`],upperArm:[`shoulder${side}`,`elbow${side}`],forearm:[`elbow${side}`,`wrist${side}`],thigh:[`hip${side}`,`knee${side}`],shin:[`knee${side}`,`ankle${side}`]}[part];
}

export function partFrame(state,id) {
  let pivot,rotation;
  const segment=partSegment(id),end=/^(palm|ankle|foot)([LR])$/.exec(id);
  if(id==='catparent')return {pivot:new THREE.Vector3(0,.06,0),rotation:new THREE.Quaternion()};
  if(['pelvis','ribcage','head'].includes(id)){
    pivot=jointPosition(state,id==='ribcage'?'chest':id);
    rotation=quaternion(state.partRotations?.[id]);
  }else if(end?.[1]==='foot'){
    const name=`ankle${end[2]}`,target=state.footTargets?.[end[2]];
    pivot=target?new THREE.Vector3((target[0]-300)/225,(480-target[1])/225,target[2]):jointPosition(state,name);
    pivot.y-=.05;pivot.z+=.07;
    rotation=quaternion(state.footRotations?.[end[2]]);
  }else if(segment){
    const [first,last]=segment;
    pivot=jointPosition(state,end?last:first);
    if(end?.[1]==='ankle')pivot.y-=.035;
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
  }else if(state.coord==='View'&&state.view!=='Perspective'){
    axes={x:new THREE.Vector3(1,0,0).applyQuaternion(cameraRotation),y:new THREE.Vector3(0,1,0).applyQuaternion(cameraRotation),z:new THREE.Vector3(0,0,1).applyQuaternion(cameraRotation)};
  }
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
  for(const id of ids){
    const frame=partFrame(state,id);if(!frame||id==='catparent')continue;
    const values=new THREE.Euler().setFromQuaternion(frame.rotation.premultiply(turn),'XYZ').toArray().slice(0,3);
    const foot=/^foot([LR])$/.exec(id);
    if(foot){state.footRotations??={};state.footRotations[foot[1]]=values;}
    else state.partRotations[id]=values;
  }
}

export function addArmFromSetup(state) {
  if(state.arms>=2)return false;
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
    }
  }
  state.arms=(state.arms||0)+1;
  return true;
}
