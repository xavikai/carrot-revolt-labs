import { rotatePartFrames } from './transform-frame.js';

export const legObjects = side => [
  {id:`leg${side}`,name:`Character_${side}Leg`,kind:'Helper',parent:'pelvis',color:'#6e73d5'},
  {id:`thigh${side}`,name:`Character_${side}Thigh`,kind:'Bone',parent:`leg${side}`,color:'#6268d8'},
  {id:`shin${side}`,name:`Character_${side}Shin`,kind:'Bone',parent:`thigh${side}`,color:'#50bb55'},
  {id:`ankle${side}`,name:`Character_${side}Ankle`,kind:'Bone',parent:`shin${side}`,color:'#e16b69'},
  // The IK controller belongs to the rig root, independently of the deforming leg.
  {id:`foot${side}`,name:`Character_${side}FootPlatform`,kind:'Helper',parent:'catparent',color:'#a479d0'},
];

export function rotateHierarchyFrames(state,objects,id,direction,angle) {
  const ids=[id];
  for(let index=0;index<ids.length;index++)ids.push(...objects.filter(object=>object.parent===ids[index]).map(object=>object.id));
  rotatePartFrames(state,ids,direction,angle);
}
