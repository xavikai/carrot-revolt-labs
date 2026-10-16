import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialJoints,targetJoints,mirrorJoint,alignmentScore,paintWeight,solveLegIK} from '../labs/3ds-max-cat-rig/core.js';
import {sampleKeys,blendPose,walkPose,composedPose} from '../labs/3ds-max-cat-animation/core.js';
import * as THREE from '../vendor/three.module.js';
import {maxAxes,partFrame,partSegment,parentMatrix,gizmoFrame,worldMoveToRig,worldAxisToRig,axisDragPlane,rotatePartFrames,jointPosition,moveSetupJoints,pinFootTarget,addArmFromSetup} from '../labs/3ds-max-cat-rig/transform-frame.js';
import {legObjects,rotateHierarchyFrames} from '../labs/3ds-max-cat-rig/rig-hierarchy.js';

const frameState=()=>({joints:structuredClone(initialJoints),jointDepths:{},depthOffsets:{},pelvisDepth:0,footTargets:{},footRotations:{},partRotations:{},parentTransform:{position:[.4,-.2,.3],rotation:[.3,-.7,.2],scale:[1.8,.7,1.2]},catScale:1.3,coord:'World',view:'Perspective',lengthAxis:'X'});
const closeVector=(actual,expected)=>assert.ok(actual.distanceTo(expected)<1e-9,`${actual.toArray()} != ${expected.toArray()}`);
const renderedBoneEnds=(state,id)=>{
  const [a,b]=partSegment(id),start=jointPosition(state,a),end=jointPosition(state,b);
  const centre=start.clone().add(end).multiplyScalar(.5);
  centre.z+=(state.depthOffsets[id]||0)+(state.pelvisDepth||0);
  const rotation=partFrame(state,id).rotation.multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),state.lengthAxis==='Z'?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0)));
  const halfLength=start.distanceTo(end)/2,matrix=parentMatrix(state);
  return [-1,1].map(sign=>new THREE.Vector3(0,sign*halfLength,0).applyQuaternion(rotation).add(centre).applyMatrix4(matrix));
};

test('left and right joints mirror around the character centre',()=>{
  assert.deepEqual(mirrorJoint('elbowL',[180,250]),['elbowR',[420,250]]);
  assert.equal(mirrorJoint('head',[300,90]),null);
  assert.ok(initialJoints.hipL[0]>initialJoints.hipR[0]);
  assert.ok(initialJoints.ankleL[0]>initialJoints.ankleR[0]);
});
test('moving a foot target bends the leg without changing bone lengths',()=>{
  const hip=[...initialJoints.hipL,24.75],knee=[...initialJoints.kneeL,42.75],ankle=[...initialJoints.ankleL,24.75];
  const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
  const upper=distance(hip,knee),lower=distance(knee,ankle),target=[ankle[0]+15,ankle[1]-22,ankle[2]+10];
  const solved=solveLegIK(hip,knee,target,upper,lower);
  assert.ok(distance(solved.ankle,target)<1e-7);
  assert.ok(Math.abs(distance(hip,solved.knee)-upper)<1e-7);
  assert.ok(Math.abs(distance(solved.knee,solved.ankle)-lower)<1e-7);
  assert.ok(distance(solved.knee,knee)>1);
});
test('alignment score improves when the joints match the guide',()=>{
  assert.ok(alignmentScore(targetJoints)>alignmentScore(initialJoints));
  assert.equal(alignmentScore(targetJoints),100);
});
test('painted skin weights stay within zero and one and keep other points',()=>{
  const w=[.2,.5,.8];
  assert.deepEqual(paintWeight(w,1,2),[.2,1,.8]);
  assert.deepEqual(paintWeight(w,1,-1),[.2,0,.8]);
  assert.deepEqual(w,[.2,.5,.8]);
});
test('keys interpolate each CAT control and clamp beyond the keyed range',()=>{
  const keys=[{frame:0,pose:{hips:0,arm:0,foot:0}},{frame:20,pose:{hips:-40,arm:60,foot:20}}];
  assert.deepEqual(sampleKeys(keys,10),{hips:-20,arm:30,foot:10});
  assert.deepEqual(sampleKeys(keys,30),keys[1].pose);
});
test('Relative Local adjustment and CATMotion weights blend predictably',()=>{
  assert.deepEqual(blendPose({hips:0,arm:10,foot:0},{hips:0,arm:20,foot:0},.5),{hips:0,arm:20,foot:0});
  const keys=[{frame:10,pose:{hips:0,arm:0,foot:0}}];
  const walk=walkPose(10,{stride:30,lift:0});
  const pose=composedPose(keys,10,{motion:true,motionWeight:1,stride:30,lift:0});
  assert.equal(pose.arm,walk.arm);
  assert.equal(pose.foot,walk.foot);
  assert.ok(Math.abs(pose.hips-walk.hips)<1e-9);
});

test('World axes keep their directions across views, object rotations and nonuniform parent scale',()=>{
  const state=frameState();state.partRotations.pelvis=[.8,.2,-.4];
  const before=structuredClone(state);
  for(const view of ['Front','Left','Perspective']){
    state.view=view;
    const camera=new THREE.Quaternion().setFromEuler(new THREE.Euler(.9,-.5,.3));
    for(const id of ['catparent','pelvis','forearmL','footL']){
      const frame=gizmoFrame(state,id,camera);
      for(const [name,direction] of Object.entries(maxAxes()))closeVector(frame.axes[name],direction);
    }
  }
  state.view=before.view;assert.deepEqual(state,before,'building the gizmo must not mutate the rig');
});

test('Local hub axes follow the object and its parent rotation while keeping an orthonormal basis',()=>{
  const state=frameState();state.coord='Local';state.partRotations.pelvis=[.4,.6,-.3];
  const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(...state.parentTransform.rotation)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...state.partRotations.pelvis)));
  const first=gizmoFrame(state,'pelvis');
  for(const [name,direction] of Object.entries(maxAxes()))closeVector(first.axes[name],direction.applyQuaternion(rotation));
  for(const view of ['Left','Front','Perspective']){
    state.view=view;
    const frame=gizmoFrame(state,'pelvis',new THREE.Quaternion().setFromEuler(new THREE.Euler(.6,-1,.2)));
    for(const name of ['x','y','z'])closeVector(frame.axes[name],first.axes[name]);
  }
  assert.ok(Math.abs(first.axes.x.clone().cross(first.axes.y).dot(first.axes.z)-1)<1e-9);
});

test('gizmo pivots include the actual joint depth and stay attached without shifting the CATParent',()=>{
  const state=frameState();state.jointDepths.elbowL=.73;state.depthOffsets.forearmL=.24;state.pelvisDepth=.5;
  const expected=jointPosition(state,'elbowL');expected.z+=.24+.5;expected.applyMatrix4(parentMatrix(state));
  closeVector(gizmoFrame(state,'forearmL').pivot,expected);
  const parentPivot=gizmoFrame(state,'catparent').pivot;
  state.pelvisDepth=1.2;closeVector(gizmoFrame(state,'catparent').pivot,parentPivot);
  const pelvis=jointPosition(state,'pelvis');pelvis.z+=state.pelvisDepth;
  closeVector(gizmoFrame(state,'pelvis').pivot,pelvis.applyMatrix4(parentMatrix(state)));
});

test('Local bone axes use the 3D segment and remain right handed when the bone points in depth',()=>{
  const state=frameState();state.coord='Local';state.joints.elbowL=[400,200];state.joints.wristL=[400,200];state.jointDepths.elbowL=.2;state.jointDepths.wristL=.9;
  const along=jointPosition(state,'wristL').sub(jointPosition(state,'elbowL')).normalize();
  for(const lengthAxis of ['X','Z']){
    state.lengthAxis=lengthAxis;
    const frame=partFrame(state,'forearmL'),axes=maxAxes();
    for(const direction of Object.values(axes))direction.applyQuaternion(frame.rotation);
    closeVector(axes[lengthAxis.toLowerCase()],along);
    assert.ok(Math.abs(axes.x.clone().cross(axes.y).dot(axes.z)-1)<1e-9);
    for(const direction of Object.values(axes))assert.ok(Math.abs(direction.length()-1)<1e-9);
  }
});

test('world movement converts to rig space without changing direction or accumulating parent transforms',()=>{
  const state=frameState(),linear=new THREE.Matrix3().setFromMatrix4(parentMatrix(state));
  for(const direction of Object.values(maxAxes())){
    const worldDelta=direction.clone().multiplyScalar(.3),rigDelta=worldMoveToRig(state,worldDelta);
    closeVector(rigDelta.clone().applyMatrix3(linear),worldDelta);
    const total=new THREE.Vector3();
    for(let i=0;i<100;i++)total.add(worldMoveToRig(state,worldDelta.clone().multiplyScalar(.01)));
    closeVector(total,rigDelta);
    const rotated=worldAxisToRig(state,direction).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...state.parentTransform.rotation)));
    closeVector(rotated,direction);
  }
});

test('rotating a hub changes its Local orientation without moving its pivot or the World directions',()=>{
  const state=frameState(),pivot=partFrame(state,'pelvis').pivot.clone();
  const axis=new THREE.Vector3(0,1,0);
  rotatePartFrames(state,['pelvis'],axis,Math.PI/3);
  closeVector(partFrame(state,'pelvis').pivot,pivot);
  const local=maxAxes().x.applyQuaternion(partFrame(state,'pelvis').rotation);
  closeVector(local,new THREE.Vector3(1,0,0).applyAxisAngle(axis,Math.PI/3));
  for(const [name,direction] of Object.entries(maxAxes()))closeVector(gizmoFrame(state,'pelvis').axes[name],direction);
});

test('axis dragging measures motion on a fixed plane and avoids a singular plane for a hidden axis',()=>{
  const pivot=new THREE.Vector3(.4,.8,.2),axis=new THREE.Vector3(1,0,0),camera=new THREE.PerspectiveCamera(40,1,.05,100);
  camera.position.set(-2,3,5);camera.lookAt(pivot);camera.updateMatrixWorld();
  const plane=axisDragPlane(pivot,axis,camera.position);
  assert.ok(Math.abs(plane.normal.dot(axis))<1e-9);
  const ray=new THREE.Raycaster(),hit=new THREE.Vector3();
  for(const amount of [0,.1,.25,.4]){
    const point=pivot.clone().addScaledVector(axis,amount),screen=point.clone().project(camera);
    ray.setFromCamera(new THREE.Vector2(screen.x,screen.y),camera);ray.ray.intersectPlane(plane,hit);
    closeVector(hit,point);
  }
  assert.equal(axisDragPlane(pivot,axis,pivot.clone().addScaledVector(axis,5)),null);
});

test('moving the knee along every World or Local axis keeps the rendered thigh and shin joined',()=>{
  for(const lengthAxis of ['X','Z'])for(const coord of ['World','Local'])for(const axis of ['x','y','z']){
    const state=frameState();state.coord=coord;state.lengthAxis=lengthAxis;
    const oldHip=jointPosition(state,'hipL'),oldKnee=jointPosition(state,'kneeL'),oldAnkle=jointPosition(state,'ankleL');
    const [oldShinStart,oldShinEnd]=renderedBoneEnds(state,'shinL');
    const delta=gizmoFrame(state,'shinL').axes[axis].multiplyScalar(.18);
    moveSetupJoints(state,['kneeL','ankleL'],worldMoveToRig(state,delta));
    const [thighStart,thighEnd]=renderedBoneEnds(state,'thighL'),[shinStart,shinEnd]=renderedBoneEnds(state,'shinL');
    closeVector(thighEnd,shinStart);
    closeVector(thighStart,oldHip.clone().applyMatrix4(parentMatrix(state)));
    closeVector(shinStart,oldShinStart.add(delta));closeVector(shinEnd,oldShinEnd.add(delta));
    closeVector(jointPosition(state,'ankleL').sub(jointPosition(state,'kneeL')),oldAnkle.sub(oldKnee));
    assert.deepEqual(state.depthOffsets,{},'movement must change shared joints, not shift one mesh away from its neighbour');
  }
});

test('adjusting a leg clears the old IK setup and keeps its FootPlatform attached to the ankle',()=>{
  const state=frameState();
  state.footTargets.L=[...state.joints.ankleL,.11];state.legIKLengths={L:[82,74]};state.legIKRest={L:[335,388,42.75]};
  const delta=new THREE.Vector3(.1,.03,.22);
  moveSetupJoints(state,['kneeL','ankleL'],delta);
  assert.equal(state.legIKLengths.L,undefined);assert.equal(state.legIKRest.L,undefined);assert.equal(state.footTargets.L,undefined);
  const footPivot=partFrame(state,'footL').pivot,expected=jointPosition(state,'ankleL');expected.y-=.05;expected.z+=.07;
  closeVector(footPivot,expected);
  closeVector(renderedBoneEnds(state,'thighL')[1],renderedBoneEnds(state,'shinL')[0]);
});

test('moving only the knee keeps an existing foot target while rebuilding the IK rest pose',()=>{
  const state=frameState();state.footTargets.L=[...state.joints.ankleL,.11];state.legIKLengths={L:[82,74]};state.legIKRest={L:[335,388,42.75]};
  const target=[...state.footTargets.L],ankle=jointPosition(state,'ankleL');
  moveSetupJoints(state,['kneeL'],new THREE.Vector3(.15,0,.25));
  assert.deepEqual(state.footTargets.L,target);closeVector(jointPosition(state,'ankleL'),ankle);
  assert.equal(state.legIKLengths.L,undefined);assert.equal(state.legIKRest.L,undefined);
  closeVector(renderedBoneEnds(state,'thighL')[1],renderedBoneEnds(state,'shinL')[0]);
});

test('pinning a leg bone creates a fixed FootPlatform target before the bone moves',()=>{
  const state=frameState(),before=partFrame(state,'footL').pivot.clone();
  pinFootTarget(state,'L');
  moveSetupJoints(state,['kneeL'],new THREE.Vector3(.18,-.06,.2));
  closeVector(partFrame(state,'footL').pivot,before);
  assert.deepEqual(state.footTargets.L,[...state.joints.ankleL.slice(0,2),state.jointDepths.ankleL??.11]);
});

test('a pinned target survives moving the ankle itself while IK still owns the platform',()=>{
  const state=frameState(),before=partFrame(state,'footL').pivot.clone();
  pinFootTarget(state,'L');
  moveSetupJoints(state,['ankleL'],new THREE.Vector3(-.12,.08,.15));
  closeVector(partFrame(state,'footL').pivot,before);
  assert.equal(state.pinnedFootTargets.L,true);
});

test('moving the elbow in depth also keeps the upper arm and forearm joined',()=>{
  const state=frameState();
  moveSetupJoints(state,['elbowL','wristL'],new THREE.Vector3(-.12,.08,.4));
  closeVector(renderedBoneEnds(state,'upperArmL')[1],renderedBoneEnds(state,'forearmL')[0]);
  closeVector(gizmoFrame(state,'forearmL').pivot,renderedBoneEnds(state,'forearmL')[0]);
});

test('Add Arm mirrors the configured first arm around the current chest, including its depth',()=>{
  const state=frameState();state.arms=0;state.joints.chest=[347,172];state.jointDepths.chest=.28;
  assert.equal(addArmFromSetup(state),true);assert.equal(state.arms,1);
  state.joints.shoulderL=[410,170];state.joints.elbowL=[472,168];state.joints.wristL=[523,175];
  state.jointDepths.shoulderL=.33;state.jointDepths.elbowL=.4;state.jointDepths.wristL=.37;
  const left=Object.fromEntries(['shoulder','elbow','wrist'].map(name=>[name,jointPosition(state,`${name}L`)]));
  assert.equal(addArmFromSetup(state),true);assert.equal(state.arms,2);
  const centre=jointPosition(state,'chest');
  for(const [name,point] of Object.entries(left)){
    closeVector(jointPosition(state,`${name}R`),new THREE.Vector3(2*centre.x-point.x,point.y,point.z));
    closeVector(jointPosition(state,`${name}L`),point);
  }
  closeVector(renderedBoneEnds(state,'armR')[1],renderedBoneEnds(state,'upperArmR')[0]);
  closeVector(renderedBoneEnds(state,'upperArmR')[1],renderedBoneEnds(state,'forearmR')[0]);
});

test('the second arm reflects its pose and bone orientation in the rotated ribcage frame',()=>{
  for(const lengthAxis of ['X','Z']){
    const state=frameState();state.arms=1;state.lengthAxis=lengthAxis;state.partRotations.ribcage=[.3,-.5,.2];
    state.joints.chest=[335,165];state.jointDepths.chest=.42;
    const hub=partFrame(state,'ribcage'),centre=jointPosition(state,'chest'),inverse=hub.rotation.clone().invert();
    for(const [joint,local] of [['shoulder',[.28,.01,.04]],['elbow',[.64,-.02,.09]],['wrist',[.93,.02,.07]]]){
      const point=new THREE.Vector3(...local).applyQuaternion(hub.rotation).add(centre);
      state.joints[`${joint}L`]=[300+point.x*225,480-point.y*225];state.jointDepths[`${joint}L`]=point.z;
    }
    state.partRotations.palmL=[.6,-.3,.4];
    const sourceRotations=structuredClone(state.partRotations);
    addArmFromSetup(state);
    for(const joint of ['shoulder','elbow','wrist']){
      const left=jointPosition(state,`${joint}L`).sub(centre).applyQuaternion(inverse),right=jointPosition(state,`${joint}R`).sub(centre).applyQuaternion(inverse);
      closeVector(right,new THREE.Vector3(-left.x,left.y,left.z));
    }
    for(const part of ['arm','upperArm','forearm','palm']){
      const left=partFrame(state,`${part}L`),right=partFrame(state,`${part}R`);
      const reflect=point=>{const local=point.clone().applyQuaternion(inverse);local.x=-local.x;return local.applyQuaternion(hub.rotation);};
      const leftAlong=maxAxes()[lengthAxis.toLowerCase()].applyQuaternion(left.rotation);
      closeVector(maxAxes()[lengthAxis.toLowerCase()].applyQuaternion(right.rotation),reflect(leftAlong));
      const corners=[];
      for(const x of [-.06,.06])for(const y of [-.09,.09])for(const z of [-.025,.025])corners.push(new THREE.Vector3(x,y,z));
      const rightCorners=corners.map(point=>point.clone().applyQuaternion(right.rotation));
      for(const point of corners){const mirrored=reflect(point.clone().applyQuaternion(left.rotation));assert.ok(rightCorners.some(candidate=>candidate.distanceTo(mirrored)<1e-9));}
    }
    for(const [id,rotation] of Object.entries(sourceRotations))assert.deepEqual(state.partRotations[id],rotation);
  }
});

test('Add Arm copies setup dimensions without linking the two arms and stops after the second',()=>{
  const state=frameState();state.arms=1;state.boneSizes={upperArmL:{width:.11,depth:.08},forearmL:{width:.09,depth:.07}};
  state.locksById={palmL:{'rotate:x':true}};state.stretchById={armL:false,armR:true};
  addArmFromSetup(state);
  assert.deepEqual(state.boneSizes.upperArmR,state.boneSizes.upperArmL);assert.deepEqual(state.boneSizes.forearmR,state.boneSizes.forearmL);
  assert.deepEqual(state.locksById.palmR,state.locksById.palmL);assert.equal(state.stretchById.armR,false);
  state.boneSizes.upperArmR.width=.2;state.locksById.palmR['rotate:x']=false;
  assert.equal(state.boneSizes.upperArmL.width,.11);assert.equal(state.locksById.palmL['rotate:x'],true);
  const before=structuredClone(state);assert.equal(addArmFromSetup(state),false);assert.deepEqual(state,before);
});

test('rotating the ankle or its ancestors keeps the independent FootPlatform frame fixed',()=>{
  for(const side of ['L','R'])for(const coord of ['World','Local'])for(const axis of ['x','y','z']){
    const state=frameState();state.coord=coord;
    state.footTargets[side]=[341,450,.47];state.footRotations[side]=[.2,-.4,.1];state.footScales={[side]:[1.2,.8,1.1]};
    state.legIKLengths={[side]:[82,74]};state.legIKRest={[side]:[335,388,42.75]};
    const objects=[{id:'pelvis',parent:'catparent'},...legObjects(side)];
    assert.equal(objects.find(object=>object.id===`foot${side}`).parent,'catparent');
    const before=structuredClone(state),foot=partFrame(state,`foot${side}`),gizmo=gizmoFrame(state,`foot${side}`);
    const ankle=partFrame(state,`ankle${side}`).rotation.clone();
    for(const id of [`ankle${side}`,`shin${side}`,`thigh${side}`,`leg${side}`,'pelvis']){
      const direction=worldAxisToRig(state,gizmoFrame(state,id).axes[axis]);
      rotateHierarchyFrames(state,objects,id,direction,.3);
      const after=partFrame(state,`foot${side}`),afterGizmo=gizmoFrame(state,`foot${side}`);
      closeVector(after.pivot,foot.pivot);assert.ok(after.rotation.angleTo(foot.rotation)<1e-7);
      closeVector(afterGizmo.pivot,gizmo.pivot);
      for(const name of ['x','y','z'])closeVector(afterGizmo.axes[name],gizmo.axes[name]);
      for(const field of ['footTargets','footRotations','footScales','legIKLengths','legIKRest'])assert.deepEqual(state[field],before[field]);
    }
    assert.ok(partFrame(state,`ankle${side}`).rotation.angleTo(ankle)>.01);
  }
});

test('FootPlatform rotation remains selectable independently of the ankle',()=>{
  const state=frameState(),objects=legObjects('L'),ankle=partFrame(state,'ankleL').rotation.clone();
  state.coord='Local';
  rotateHierarchyFrames(state,objects,'footL',new THREE.Vector3(0,1,0),.6);
  closeVector(maxAxes().x.applyQuaternion(partFrame(state,'footL').rotation),new THREE.Vector3(1,0,0).applyAxisAngle(new THREE.Vector3(0,1,0),.6));
  assert.ok(partFrame(state,'ankleL').rotation.angleTo(ankle)<1e-7);
});
