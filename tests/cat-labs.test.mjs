import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialJoints,targetJoints,mirrorJoint,alignmentScore,paintWeight,solveLegIK} from '../labs/3ds-max-cat-rig/core.js';
import {sampleKeys,blendPose,walkPose,composedPose} from '../labs/3ds-max-cat-animation/core.js';
import * as THREE from '../vendor/three.module.js';
import {targetVector,maxAxes,partFrame,partSegment,parentMatrix,gizmoFrame,worldMoveToRig,worldAxisToRig,axisDragPlane,rotatePartFrames,jointPosition,moveSetupJoints,pinFootTarget,addArmFromSetup,addLegFromSetup,removeLeg,legSidesOf,ankleTip,FOOT_PIVOT,spineChain,bendSpine,rotateSpineSegment} from '../labs/3ds-max-cat-rig/transform-frame.js';
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
  const footPivot=partFrame(state,'footL').pivot,expected=jointPosition(state,'ankleL').add(new THREE.Vector3(...FOOT_PIVOT));
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
  assert.deepEqual(state.footTargets.L,[...state.joints.ankleL.slice(0,2),state.jointDepths.ankleL??0]);
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
    assert.ok(partFrame(state,`ankle${side}`).rotation.angleTo(ankle)<1e-7,'the Ankle frame follows its platform and its own Ankle rotation only');
  }
});

test('FootPlatform rotation remains selectable and does not move the ankle joint',()=>{
  const state=frameState(),objects=legObjects('L'),ankle=jointPosition(state,'ankleL');
  state.coord='Local';
  rotateHierarchyFrames(state,objects,'footL',new THREE.Vector3(0,1,0),.6);
  closeVector(maxAxes().x.applyQuaternion(partFrame(state,'footL').rotation),new THREE.Vector3(1,0,0).applyAxisAngle(new THREE.Vector3(0,1,0),.6));
  closeVector(jointPosition(state,'ankleL'),ankle);
});

// ── CAT Rig lab: geometry and controls ──
import {handDigits,footBones,chainBones,gizmoAnchor,transformable,limbIsIK} from '../labs/3ds-max-cat-rig/rig-geometry.js';
import {targetJoints as catTargets,targetDepths as catDepths} from '../labs/3ds-max-cat-rig/core.js';
const rigState=()=>{const state=frameState();Object.assign(state,{parentTransform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},catScale:1,root:true,pelvis:true,legs:2,spine:true,spineBones:3,arms:0,head:true,headBones:2,handDigits:5,digitBoneCounts:[3,3,3,3,3],footDigits:1,footDigitBones:1,segmentsById:{forearmL:3,shinL:2},mode:'Setup'});for(const [name,point] of Object.entries(catTargets)){state.joints[name]=[...point];state.jointDepths[name]=catDepths[name];}addArmFromSetup(state,{keepJoints:true});addArmFromSetup(state);return state;};

test('Curl closes the fingers of both hands towards the palm, mirrored left and right',()=>{
  const state=rigState(),tip=side=>handDigits(state,side).filter(item=>item.digit===2).at(-1).b;
  const open={L:tip('L'),R:tip('R')};
  closeVector(open.R,new THREE.Vector3(-open.L.x,open.L.y,open.L.z));
  state.digitPoses={L:{2:{curl:60}},R:{2:{curl:60}}};
  for(const side of ['L','R'])assert.ok(tip(side).y<open[side].y-.05,`${side} middle finger must curl down (palm down T-pose)`);
  closeVector(tip('R'),new THREE.Vector3(-tip('L').x,tip('L').y,tip('L').z));
  const thumb=handDigits(state,'L').find(item=>item.digit===0);assert.ok(thumb.b.z>thumb.a.z,'the thumb points to the front');
});

test('the ankle points forward to the ball of the foot and segments split a bone without moving its joints',()=>{
  const state=rigState(),[ankle,toe]=footBones(state,'L');
  assert.ok(ankle.b.z>ankle.a.z+.08&&ankle.b.y<ankle.a.y);assert.ok(toe.b.z>toe.a.z);
  const fore=chainBones(state).filter(item=>item.base==='forearmL');
  assert.equal(fore.length,3);closeVector(fore[0].a,jointPosition(state,'elbowL'));closeVector(fore[2].b,jointPosition(state,'wristL'));
  assert.equal(chainBones(state).filter(item=>item.base==='shinL').length,2);
  assert.equal(chainBones(state).filter(item=>item.base==='forearmR').length,3,'Add Arm copies the Segments of the first arm');
});

test('gizmos attach to any CAT bone and Animation Mode only allows rotating bones',()=>{
  const state=rigState();
  for(const id of ['pelvis','ribcage','head','neck~2','forearmL~2','shinL','handDigitL1~2','ankleR'])assert.ok(gizmoAnchor(state,id),id);
  assert.equal(transformable(state,'thighL','move'),true);
  state.mode='Animation';state.ikfk={legL:1};
  assert.equal(transformable(state,'thighL','move'),false);assert.equal(transformable(state,'thighL','rotate'),true);
  assert.equal(transformable(state,'pelvis','move'),true);assert.equal(transformable(state,'gizmo:forearmL','rotate'),true);
  assert.equal(transformable(state,'footL','move'),true);
});

test('an Up Node behind the elbow makes the IK arm bend backwards',()=>{
  const state=rigState(),px=name=>[...state.joints[name],state.jointDepths[name]*225];
  const shoulder=px('shoulderL'),elbow=px('elbowL'),wrist=px('wristL');
  const lengths=[Math.hypot(...elbow.map((v,i)=>v-shoulder[i])),Math.hypot(...wrist.map((v,i)=>v-elbow[i]))];
  const target=[shoulder[0]+60,shoulder[1]+20,shoulder[2]];
  for(const [pole,sign] of [[[elbow[0],elbow[1],elbow[2]-100],-1],[[elbow[0],elbow[1],elbow[2]+100],1]]){
    const solved=solveLegIK(shoulder,pole,target,...lengths);
    assert.ok(Math.sign(solved.knee[2]-shoulder[2])===sign);
    assert.ok(Math.abs(Math.hypot(...solved.knee.map((v,i)=>v-shoulder[i]))-lengths[0])<1e-6);
  }
});

test('rotating the Ankle turns the foot bone while its platform rotation stays separate',()=>{
  const state=rigState(),[before]=footBones(state,'L');
  state.ankleRotations={L:[.5,0,0]};
  const [after]=footBones(state,'L');
  closeVector(after.a,before.a);assert.ok(after.b.distanceTo(before.b)>.03);
  assert.deepEqual(state.footRotations,{});
});

test('the Ankle gizmo sits on the ankle joint and its Local X runs along the bone',()=>{
  const state=rigState();state.ankleRotations={L:[.4,0,0]};state.footRotations={L:[0,.3,0]};
  const frame=partFrame(state,'ankleL'),[ankle]=footBones(state,'L');
  closeVector(frame.pivot,ankle.a);
  closeVector(new THREE.Vector3(1,0,0).applyQuaternion(frame.rotation),ankle.b.clone().sub(ankle.a).normalize());
});

test('Add Leg hangs the first leg down to the ground and mirrors it for the second one',()=>{
  const state=frameState();Object.assign(state,{parentTransform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},catScale:1,legs:0});
  addLegFromSetup(state);
  assert.equal(state.legs,1);assert.ok(Math.abs(partFrame(state,'footL').pivot.y)<1e-9,'the platform sits at the base of the rig');
  state.joints.kneeL=[340,380];state.jointDepths.kneeL=.05;state.footTargets={L:[...state.joints.ankleL,0]};state.footRotations={L:[0,.4,0]};state.ankleRotations={L:[.3,.2,0]};state.segmentsById={shinL:2};state.upNodes={legL:[340,380,.5]};
  addLegFromSetup(state);
  assert.equal(state.legs,2);assert.equal(addLegFromSetup(state),false);
  const centre=jointPosition(state,'pelvis');
  for(const j of ['hip','knee','ankle']){const l=jointPosition(state,j+'L'),r=jointPosition(state,j+'R');closeVector(r,new THREE.Vector3(2*centre.x-l.x,l.y,l.z));}
  assert.equal(state.segmentsById.shinR,2);
  const tl=ankleTip(state,'L'),tr=ankleTip(state,'R');closeVector(tr,new THREE.Vector3(2*centre.x-tl.x,tl.y,tl.z));
  closeVector(targetVector(state.upNodes.legR),new THREE.Vector3(2*centre.x-targetVector(state.upNodes.legL).x,targetVector(state.upNodes.legL).y,targetVector(state.upNodes.legL).z));
});

test('IK legs only translate the thigh and shin; FK lets the three leg joints rotate',()=>{
  const state=rigState();
  for(const id of ['thighL','shinL'])assert.equal(transformable(state,id,'rotate'),false),assert.equal(transformable(state,id,'rotate',true),true),assert.equal(transformable(state,id,'move'),true);
  assert.equal(transformable(state,'ankleL','rotate'),true);
  state.ikfk={legL:1};
  for(const id of ['thighL','shinL','ankleL'])assert.equal(transformable(state,id,'rotate'),true);
  assert.equal(limbIsIK(state,'thighL'),false);assert.equal(limbIsIK(state,'thighR'),true);
});

test('a leg can be deleted and Add Leg rebuilds it as the mirror of the remaining one',()=>{
  const state=frameState();Object.assign(state,{parentTransform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},catScale:1,legs:0,root:true,pelvis:true});
  addLegFromSetup(state);addLegFromSetup(state);
  state.joints.kneeR=[262,380];state.jointDepths.kneeR=.07;state.segmentsById={shinL:2};state.gizmos=new Set(['thighL','pelvis']);
  assert.equal(removeLeg(state,'L'),true);
  assert.deepEqual(legSidesOf(state),['R']);assert.equal(state.legs,1);assert.ok(!state.gizmos.has('thighL')&&state.gizmos.has('pelvis'));assert.equal(state.segmentsById.shinL,undefined);
  assert.equal(chainBones(state).some(b=>b.base==='thighL'),false);
  addLegFromSetup(state);
  assert.deepEqual(legSidesOf(state),['L','R']);
  const c=jointPosition(state,'pelvis'),r=jointPosition(state,'kneeR');closeVector(jointPosition(state,'kneeL'),new THREE.Vector3(2*c.x-r.x,r.y,r.z));
});

test('foot digits sit at the tip of the foot and can be rotated and moved',()=>{
  const state=rigState();state.footDigits=2;state.footDigitBones=1;
  const toes=footBones(state,'L').filter(b=>b.id.startsWith('footDigit'));
  assert.deepEqual(toes.map(t=>t.id),['footDigitL0','footDigitL1']);
  const before=toes[0].b.clone();
  state.footDigitRotations={L0:[.6,0,0]};state.footDigitOffsets={L1:[0,.02,0]};
  const after=footBones(state,'L').filter(b=>b.id.startsWith('footDigit'));
  closeVector(after[0].a,toes[0].a);assert.ok(after[0].b.distanceTo(before)>.02);
  closeVector(after[1].a,toes[1].a.clone().add(new THREE.Vector3(0,.02,0)));
  closeVector(partFrame(state,'footDigitL0').pivot,after[0].a);
  assert.equal(transformable(state,'footDigitL0','rotate'),true);assert.equal(transformable(state,'footDigitL0','move'),true);
});

test('rotating the Chest hub bends the spine with a fixed length; a spine bone turns from its base',()=>{
  const state=rigState(),len=c=>c.points.slice(1).reduce((s,p,i)=>s+p.distanceTo(c.points[i]),0);
  const before=spineChain(state,'spine'),L=len(before);
  bendSpine(state,'spine',new THREE.Vector3(1,0,0),.9);
  const bent=spineChain(state,'spine');
  assert.ok(Math.abs(len(bent)-L)<1e-9);closeVector(bent.points[0],before.points[0]);
  closeVector(bent.points.at(-1),jointPosition(state,'chest'));assert.ok(jointPosition(state,'chest').z>.05,'the chest moves along the curve');
  const p0=bent.points[1].clone();
  rotateSpineSegment(state,'spine',1,new THREE.Vector3(0,0,1),.4);
  const after=spineChain(state,'spine');
  closeVector(after.points[1],p0);closeVector(after.points[0],before.points[0]);assert.ok(Math.abs(len(after)-L)<1e-9);
  closeVector(partFrame(state,'spine~2').pivot,p0);
});

test('Add Arm builds the first arm hanging down from a sideways collarbone',()=>{
  const state=rigState();state.arms=0;
  addArmFromSetup(state);
  const s=jointPosition(state,'shoulderL'),e=jointPosition(state,'elbowL'),w=jointPosition(state,'wristL');
  assert.ok(s.x>jointPosition(state,'chest').x+.1,'the collarbone goes out to the side');
  assert.ok(Math.abs(e.x-s.x)<1e-6&&e.y<s.y-.2&&w.y<e.y-.2,'the arm hangs straight down');
});
