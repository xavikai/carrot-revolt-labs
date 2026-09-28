// A paper-cube model: the five uncut edges of a single island form a tree.
// A cut removes one shared edge from that tree. A cycle cannot flatten as
// rigid squares without either another cut or distortion.
export const FACES = Object.freeze({
 F:{name:'Front',color:'#e9a667',n:[0,0,1],u:[1,0,0],v:[0,1,0]},
 B:{name:'Back',color:'#9a94e4',n:[0,0,-1],u:[-1,0,0],v:[0,1,0]},
 R:{name:'Right',color:'#70c4aa',n:[1,0,0],u:[0,0,-1],v:[0,1,0]},
 L:{name:'Left',color:'#91b9ed',n:[-1,0,0],u:[0,0,1],v:[0,1,0]},
 T:{name:'Top',color:'#e6ca72',n:[0,1,0],u:[1,0,0],v:[0,0,-1]},
 D:{name:'Bottom',color:'#de88a7',n:[0,-1,0],u:[1,0,0],v:[0,0,1]}
});
export const FACE_ORDER=['F','R','B','L','T','D'];
export const EDGE_PAIRS=[['F','T'],['F','D'],['F','L'],['F','R'],['B','T'],['B','D'],['B','L'],['B','R'],['T','L'],['T','R'],['D','L'],['D','R']];
export const edgeKey=(a,b)=>[a,b].sort().join('-');
export const EDGES=EDGE_PAIRS.map(([a,b])=>({a,b,key:edgeKey(a,b)}));
export const CLASSIC_HINGES=['F-R','F-L','F-T','F-D','B-T'].map(k=>k.split('-').sort().join('-'));
export const PRESETS={classic:new Set(EDGES.filter(e=>!CLASSIC_HINGES.includes(e.key)).map(e=>e.key)),two:new Set(EDGES.filter(e=>!CLASSIC_HINGES.includes(e.key)||e.key===edgeKey('B','T')).map(e=>e.key)),separate:new Set(EDGES.map(e=>e.key)),closed:new Set()};
const dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const add=(a,b)=>[a[0]+b[0],a[1]+b[1]];
const multiply=(a,n)=>[a[0]*n,a[1]*n];
const project=(vector,face)=>add(multiply(face.U,dot(vector,face.u)),multiply(face.V,dot(vector,face.v)));

const faceSize=(id,size)=>[Math.abs(FACES[id].u[0])*size[0]+Math.abs(FACES[id].u[1])*size[1]+Math.abs(FACES[id].u[2])*size[2],Math.abs(FACES[id].v[0])*size[0]+Math.abs(FACES[id].v[1])*size[1]+Math.abs(FACES[id].v[2])*size[2]];
const halfExtent=(face)=>[Math.abs(face.U[0])*face.size[0]+Math.abs(face.V[0])*face.size[1],Math.abs(face.U[1])*face.size[0]+Math.abs(face.V[1])*face.size[1]].map(n=>n/2);
export function buildLayout(cuts,size=[2,2,2]){
 const unknown=[...cuts].filter(k=>!EDGES.some(e=>e.key===k));if(unknown.length)throw new Error(`Unknown cube edge: ${unknown[0]}`);
 const linked=EDGES.filter(e=>!cuts.has(e.key));
 const adjacency=Object.fromEntries(FACE_ORDER.map(id=>[id,[]]));
 linked.forEach(e=>{adjacency[e.a].push(e.b);adjacency[e.b].push(e.a);});
 const visited=new Set(),faces={},components=[];let cycle=false;
 for(const root of FACE_ORDER){
  if(visited.has(root))continue;
  const component={root,ids:[]};components.push(component);
  faces[root]={id:root,parent:null,center:[0,0],U:[1,0],V:[0,1],size:faceSize(root,size)};
  visited.add(root);const queue=[root];
  for(let at=0;at<queue.length;at++){
   const a=queue[at],fa=faces[a],basisA=FACES[a];component.ids.push(a);
   for(const b of adjacency[a]){
    if(visited.has(b)){if(fa.parent!==b)cycle=true;continue;}
    const basisB=FACES[b],t=cross(basisA.n,basisB.n),p=project(basisB.n,{...basisA,...fa}),T=project(t,{...basisA,...fa});
    const U=add(multiply(T,dot(basisB.u,t)),multiply(p,-dot(basisB.u,basisA.n)));
    const V=add(multiply(T,dot(basisB.v,t)),multiply(p,-dot(basisB.v,basisA.n)));
    const parentExtent=halfExtent(fa),childSize=faceSize(b,size),childExtent=halfExtent({U,V,size:childSize});
    const distance=Math.abs(p[0])*(parentExtent[0]+childExtent[0])+Math.abs(p[1])*(parentExtent[1]+childExtent[1]);
    faces[b]={id:b,parent:a,center:add(fa.center,multiply(p,distance)),U,V,size:childSize,side:[dot(basisB.n,basisA.u),dot(basisB.n,basisA.v)],axis:[dot(t,basisA.u),dot(t,basisA.v),0]};
    visited.add(b);queue.push(b);
   }
  }
 }
 const boxes=components.map(component=>{const minX=Math.min(...component.ids.map(id=>faces[id].center[0]-halfExtent(faces[id])[0])),maxX=Math.max(...component.ids.map(id=>faces[id].center[0]+halfExtent(faces[id])[0])),minY=Math.min(...component.ids.map(id=>faces[id].center[1]-halfExtent(faces[id])[1])),maxY=Math.max(...component.ids.map(id=>faces[id].center[1]+halfExtent(faces[id])[1]));return{component,minX,minY,width:maxX-minX,height:maxY-minY};});
 const rowLimit=Math.max(...boxes.map(box=>box.width),Math.sqrt(boxes.reduce((sum,box)=>sum+box.width*box.height,0))*1.65);
 let cursorX=0,rowY=0,rowHeight=0,overlap=false;
 for(const box of boxes){
  if(cursorX>0&&cursorX+box.width>rowLimit){cursorX=0;rowY+=rowHeight+1;rowHeight=0;}
  const shift=[cursorX-box.minX,rowY-box.minY];box.component.shift=shift;
  box.component.ids.forEach(id=>{faces[id].center=add(faces[id].center,shift);});
  cursorX+=box.width+1;rowHeight=Math.max(rowHeight,box.height);
  for(let i=0;i<box.component.ids.length;i++)for(let j=i+1;j<box.component.ids.length;j++){
   const a=faces[box.component.ids[i]],b=faces[box.component.ids[j]],ea=halfExtent(a),eb=halfExtent(b);
   if(Math.abs(a.center[0]-b.center[0])<ea[0]+eb[0]-1e-6&&Math.abs(a.center[1]-b.center[1])<ea[1]+eb[1]-1e-6)overlap=true;
  }
 }
 const all=Object.values(faces),bounds={minX:Math.min(...all.map(f=>f.center[0]-halfExtent(f)[0])),maxX:Math.max(...all.map(f=>f.center[0]+halfExtent(f)[0])),minY:Math.min(...all.map(f=>f.center[1]-halfExtent(f)[1])),maxY:Math.max(...all.map(f=>f.center[1]+halfExtent(f)[1]))};
 return {valid:!cycle&&!overlap,cycle,overlap,faces,components,bounds,seams:cuts.size,hinges:linked.length};
}
