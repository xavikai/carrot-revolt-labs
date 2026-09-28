import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {MODELS,defaultCuts,buildCharts,packCharts,faceUV} from '../labs/uv-unwrapping/workbench.js?v=4';
import {PRESETS} from '../labs/uv-unwrapping/unfold.js?v=4';
import {foldMatrices,faceDims,displayPoint,facePose} from '../labs/uv-unwrapping/fold.js';

const view={span:4,center:[0,1,0]};
function check(model,cuts){
 const parts=MODELS[model],byId=Object.fromEntries(parts.map(p=>[p.id,p]));
 const {charts}=buildCharts(model,cuts);packCharts(charts,{margin:.3});
 const flat=foldMatrices(charts,byId,0,view),closed=foldMatrices(charts,byId,1,view);
 for(const chart of charts)for(const face of chart.faces){
  const [w,h]=faceDims(byId[chart.part.id],face.id).map(n=>n/2);
  const local=[[-w,-h],[w,-h],[w,h],[-w,h]].map(([x,y])=>new THREE.Vector3(x,y,0));
  const expected=faceUV(chart,face).map(uv=>displayPoint(uv,view));
  local.forEach((point,i)=>{const got=point.clone().applyMatrix4(flat.get(face.key));assert.ok(got.distanceTo(expected[i])<1e-6,`${face.key} corner ${i}: ${got.toArray()} vs ${expected[i].toArray()}`);});
  assert.ok(closed.get(face.key).equals(facePose(byId[chart.part.id],face.id))||closed.get(face.key).elements.every((v,i)=>Math.abs(v-facePose(byId[chart.part.id],face.id).elements[i])<1e-9));
 }
}
test('unfolded cube faces land exactly on their UV positions',()=>{
 for(const preset of ['classic','two','separate'])check('cube',new Map([['cube',new Set(PRESETS[preset])]]));
 check('cube',new Map([['cube',new Set([...PRESETS.classic].filter(k=>k!=='B-T').concat('D-F'))]]));
});
test('unfolded chair parts land on the UV map too',()=>check('chair',defaultCuts('chair')));
