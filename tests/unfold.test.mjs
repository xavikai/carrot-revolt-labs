import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildLayout,PRESETS,EDGES,FACES,edgeKey} from '../labs/uv-unwrapping/unfold.js';
test('a classic paper net keeps all six faces in one non-overlapping island',()=>{
 const net=buildLayout(PRESETS.classic);
 assert.equal(net.valid,true);assert.equal(net.components.length,1);assert.equal(net.seams,7);
 assert.equal(new Set(Object.values(net.faces).map(f=>f.center.join(','))).size,6);
});
test('cutting a hinge splits islands and all cuts separate every face',()=>{
 const two=buildLayout(PRESETS.two),separate=buildLayout(PRESETS.separate);
 assert.equal(two.valid,true);assert.equal(two.components.length,2);
 assert.equal(separate.valid,true);assert.equal(separate.components.length,6);
 assert.ok(separate.bounds.maxX-separate.bounds.minX<=2*(separate.bounds.maxY-separate.bounds.minY));
});
test('an uncut cube is a closed loop, not a flat paper net',()=>{
 const layout=buildLayout(PRESETS.closed);assert.equal(layout.valid,false);assert.equal(layout.cycle,true);
});
test('the twelve edge labels correspond to pairs of perpendicular face normals',()=>{
 assert.equal(EDGES.length,12);assert.equal(new Set(EDGES.map(e=>e.key)).size,12);
 for(const edge of EDGES){assert.equal(edge.key,edgeKey(edge.a,edge.b));assert.equal(FACES[edge.a].n.reduce((sum,n,i)=>sum+n*FACES[edge.b].n[i],0),0);}
});
test('each uncut edge lands its two face edges on the same 2D line',()=>{
 const net=buildLayout(PRESETS.classic);
 for(const edge of EDGES.filter(e=>!PRESETS.classic.has(e.key))){
  const a=net.faces[edge.a],b=net.faces[edge.b],na=FACES[edge.a].n,nb=FACES[edge.b].n;
  const outward=(face,basis,other)=>[face.U[0]*other.n.reduce((s,n,i)=>s+n*basis.u[i],0)+face.V[0]*other.n.reduce((s,n,i)=>s+n*basis.v[i],0),face.U[1]*other.n.reduce((s,n,i)=>s+n*basis.u[i],0)+face.V[1]*other.n.reduce((s,n,i)=>s+n*basis.v[i],0)];
  const pa=outward(a,FACES[edge.a],FACES[edge.b]),pb=outward(b,FACES[edge.b],FACES[edge.a]);
  assert.deepEqual([a.center[0]+pa[0],a.center[1]+pa[1]],[b.center[0]+pb[0],b.center[1]+pb[1]]);
 }
});
test('every five-hinge choice is classified as a clear net or an explained conflict',()=>{
 let clear=0,checked=0;
 for(let a=0;a<8;a++)for(let b=a+1;b<9;b++)for(let c=b+1;c<10;c++)for(let d=c+1;d<11;d++)for(let e=d+1;e<12;e++){
  const hinges=new Set([a,b,c,d,e].map(i=>EDGES[i].key));
  const layout=buildLayout(new Set(EDGES.filter(edge=>!hinges.has(edge.key)).map(edge=>edge.key)));
  checked++;assert.equal(Object.keys(layout.faces).length,6);
  if(layout.valid){clear++;assert.equal(layout.cycle,false);assert.equal(layout.overlap,false);assert.equal(new Set(Object.values(layout.faces).map(face=>face.center.join(','))).size,6);}
  else assert.ok(layout.cycle||layout.overlap);
 }
 assert.equal(checked,792);assert.ok(clear>0);
});
