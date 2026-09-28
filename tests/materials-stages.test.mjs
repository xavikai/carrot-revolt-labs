import {test} from 'node:test';
import assert from 'node:assert/strict';
import {STAGES,startState,hsv} from '../labs/materials/stages.js';
import {INPUTS} from '../labs/materials/graph.js';
const steps=STAGES.flatMap(s=>s.steps);
test('every step starts unsolved and its solution solves it',()=>{
 for(const step of steps){
  const s=startState(step);
  assert.equal(step.check(s),false,`${step.id} starts solved`);
  step.solve(s);assert.equal(step.check(s),true,`${step.id} solution fails`);
 }
});
test('start links are valid connections between visible nodes',()=>{
 for(const step of steps){
  const s=startState(step);
  for(const [to,from] of Object.entries(s.links)){
   assert.ok(INPUTS[to]?.includes(from),`${step.id}: ${from} -> ${to}`);
   for(const n of [to,from].map(k=>k.split(':')[0])) assert.ok(s.nodes.includes(n),`${step.id}: ${n} hidden`);
  }
 }
});
test('step ids are unique and every stage has steps',()=>{
 assert.equal(new Set(steps.map(s=>s.id)).size,steps.length);
 for(const st of STAGES)assert.ok(st.steps.length>=(st.id==='studio'?1:3));
});
test('hsv reads gold as warm yellow',()=>{const c=hsv('#ffe29b');assert.ok(c.h>35&&c.h<50&&c.v===1);});
test('start states are independent copies',()=>{
 const a=startState(steps[0]);a.values.roughness=0;a.links.x=1;
 const b=startState(steps[0]);assert.notEqual(b.values.roughness,0);assert.equal(b.links.x,undefined);
});
import {displacementMode,meshMoves,refractsScene,emissionLights,glareVisible,effectiveLevel,applyPreset,PRESETS,DEFAULT_SETTINGS} from '../labs/materials/stages.js';
const byId=id=>steps.find(s=>s.id===id);
test('material displacement needs the Displacement setting and enough vertices',()=>{
 const s=startState(byId('r2')); s.links['disp:height']='height:color'; s.links['output:displacement']='disp:displacement';
 assert.equal(displacementMode(s).moves,false); assert.equal(displacementMode(s).bumps,true); assert.equal(meshMoves(s),false);
 s.settings.dispMethod='both'; assert.equal(meshMoves(s),true);
 s.subdiv=0; assert.equal(meshMoves(s),false);
 s.settings.adaptive=true; assert.equal(meshMoves(s),false,'adaptive does nothing in EEVEE');
 s.settings.engine='cycles'; assert.equal(effectiveLevel(s),8); assert.equal(meshMoves(s),true);
});
test('EEVEE treats Displacement Only as Displacement and Bump',()=>{
 const s=startState(byId('r3')); s.settings.dispMethod='displacement';
 assert.equal(displacementMode(s).method,'both'); s.settings.engine='cycles'; assert.equal(displacementMode(s).method,'displacement');
});
test('the Displace modifier works without material displacement',()=>{
 const s=startState(byId('r4')); assert.equal(meshMoves(s),false); s.settings.dispMod=true; assert.equal(meshMoves(s),true);
});
test('engine rules for glass, emission light and glare',()=>{
 const e={...DEFAULT_SETTINGS};
 assert.equal(refractsScene(e),false); assert.equal(refractsScene({...e,raytracing:true}),false); assert.equal(refractsScene({...e,raytracing:true,rtTransmission:true}),true); assert.equal(refractsScene({...e,engine:'cycles'}),true);
 assert.equal(emissionLights(e),false); assert.equal(emissionLights({...e,engine:'cycles'}),true);
 assert.equal(glareVisible({...e,glare:true}),false); assert.equal(glareVisible({...e,glare:true,vpCompositor:'always'}),true);
});
test('presets reset the other channels and mark the studio step',()=>{
 const s=startState(byId('s1')); s.values.sheen=1; applyPreset(s,'gold');
 assert.equal(s.values.sheen,0); assert.equal(s.values.metallic,1); assert.equal(s.flags.preset,true); assert.equal(s.flags.edited,false);
 assert.ok(Object.keys(PRESETS).length>=10);
});
