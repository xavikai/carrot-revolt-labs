import * as THREE from '../../vendor/three.module.js';
import {FACES} from './unfold.js?v=4';
import {faceUV} from './workbench.js?v=4';

// Folding a box open like paper. Every face turns about the edge it shares
// with its parent in the UV island, so at t = 0 each face lies exactly where
// the UV map puts it, and at t = 1 the box is closed again.
const V3=values=>new THREE.Vector3(...values);
export const faceDims=(part,id)=>[FACES[id].u,FACES[id].v].map(axis=>axis.reduce((sum,n,i)=>sum+Math.abs(n)*part.size[i],0));
export function facePose(part,id){
 const basis=FACES[id],depth=basis.n.reduce((sum,n,i)=>sum+Math.abs(n)*part.size[i],0)/2;
 return new THREE.Matrix4().makeBasis(V3(basis.u),V3(basis.v),V3(basis.n)).setPosition(V3(basis.n).multiplyScalar(depth).add(V3(part.position)));
}
function hinge(part,a,b,angle){
 const nA=FACES[a].n,nB=FACES[b].n,axis=new THREE.Vector3().crossVectors(V3(nA),V3(nB)).normalize(),e=new THREE.Vector3();
 for(let i=0;i<3;i++)e.setComponent(i,(nA[i]+nB[i])*part.size[i]/2+part.position[i]);
 return new THREE.Matrix4().makeTranslation(e.x,e.y,e.z).multiply(new THREE.Matrix4().makeRotationAxis(axis,angle)).multiply(new THREE.Matrix4().makeTranslation(-e.x,-e.y,-e.z));
}
// UV (0–1) → a flat square `span` wide, centred on `center`, facing +Z.
export const displayPoint=(uv,{span,center})=>new THREE.Vector3((uv[0]-.5)*span+center[0],(uv[1]-.5)*span+center[1],center[2]);
export function foldMatrices(charts,partsById,t,view={span:4.2,center:[0,0,0]}){
 const out=new Map();
 for(const chart of charts){
  const part=partsById[chart.part.id],ids=new Set(chart.faces.map(face=>face.id));
  const root=chart.faces.find(face=>!face.parent||!ids.has(face.parent));
  const corners=faceUV(chart,root),mid=[corners.reduce((s,p)=>s+p[0],0)/4,corners.reduce((s,p)=>s+p[1],0)/4];
  const k=chart.densityScale*chart.unitScale*view.span;
  const flat=new THREE.Matrix4().compose(displayPoint(mid,view),new THREE.Quaternion(),new THREE.Vector3(k,k,k));
  const start=flat.multiply(facePose(part,root.id).invert());
  const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();start.decompose(p,q,s);
  const u=1-t,motion=new Map([[root.id,new THREE.Matrix4().compose(p.multiplyScalar(u),new THREE.Quaternion().slerp(q,u),new THREE.Vector3(1,1,1).lerp(s,u))]]);
  for(const face of chart.faces)if(face!==root)motion.set(face.id,motion.get(face.parent).clone().multiply(hinge(part,face.parent,face.id,-Math.PI/2*u)));
  for(const face of chart.faces)out.set(face.key,motion.get(face.id).clone().multiply(facePose(part,face.id)));
 }
 return out;
}
