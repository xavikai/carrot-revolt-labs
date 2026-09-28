import * as THREE from 'three';
import {OrbitControls} from '../../vendor/OrbitControls.js';
import {FACES,FACE_ORDER,EDGES,PRESETS} from './unfold.js?v=4';
import {foldMatrices,facePose,faceDims} from './fold.js?v=4';
import {MODELS,defaultCuts,buildCharts,packCharts,averageIslandScale,faceUV,faceUVPoint,stretchMetrics,edgeName,edgeSegment,edgesOfFace,boundaryEdges,edgesOfFaces} from './workbench.js?v=4';

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */
const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const ns='http://www.w3.org/2000/svg';
const S=(tag,attrs={})=>{const node=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));return node;};
const V3=values=>new THREE.Vector3(...values);
// Blender is Z-up; the Three.js preview is Y-up.
const blenderToWorld=([x,y,z])=>new THREE.Vector3(x,z,y);
const worldToBlender=vector=>[vector.x,vector.z,vector.y];
const dot2=(a,b)=>a[0]*b[0]+a[1]*b[1];
// Edge keys carry their part: "cube|F-T", "seat|B-L". Face keys: "cube:F".
const ek=(part,edge)=>`${part}|${edge}`;
const splitEdge=key=>key.split('|');
const COLORS={edge:'#101215',sel:'#ffa01c',active:'#ffffff',cut:'#ff3b30',hover:'#ffffff',object:'#ff9800'};

const state={
 model:'cube',cuts:{cube:defaultCuts('cube'),chair:defaultCuts('chair')},
 mode:'edit',selectMode:'edge',tool:'select',live:true,stale:false,projection:null,objectSelected:true,
 selEdges:new Set(),activeEdge:null,selFaces:new Set(),activeFace:'cube:F',
 hoverEdge:null,hoverFace:null,
 charts:[],invalid:null,fold:1,stretch:'none',listPart:'cube',staleReason:'',
 // Mesh data (what Unwrap reads) and Object scale (what you see) are kept apart, as in Blender.
 mesh:{cube:structuredClone(MODELS.cube),chair:structuredClone(MODELS.chair)},objScale:{cube:[1,1,1],chair:[1,1,1]},objLocation:{cube:[0,0,0],chair:[0,0,0]}
};
const pointer={area:null,x:innerWidth/2,y:innerHeight/2};

const parts=()=>state.mesh[state.model];
const partById=id=>parts().find(part=>part.id===id);
const cutsOf=partId=>state.cuts[state.model].get(partId);
const isSeam=key=>{const [part,edge]=splitEdge(key);return cutsOf(part)?.has(edge);};
const edgeLabel=key=>{const [part,edge]=splitEdge(key),info=EDGES.find(item=>item.key===edge);return `${state.model==='chair'?partById(part).name+' · ':''}${edgeName(info)}`;};
const faceLabel=key=>{const [part,id]=key.split(':');return `${state.model==='chair'?partById(part)?.name+' · ':''}${FACES[id].name}`;};
const chartOf=faceKey=>state.charts.find(chart=>chart.faces.some(face=>face.key===faceKey));

/* ------------------------------------------------------------------ *
 * Status bar, guide and header state
 * ------------------------------------------------------------------ */
function message(text,warning=false){const el=$('#status-msg');el.textContent=text;el.classList.toggle('warning',warning);el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash');}
const K=(keys,label)=>`<span>${keys.map(key=>`<kbd>${key}</kbd>`).join('')} ${label}</span>`;
function updateStatusKeys(){
 let html;
 if(state.mode==='object')html=K(['LMB'],'Select')+K(['G'],'Move')+K(['Alt','G'],'Clear Location')+K(['S'],'Scale')+K(['Ctrl','A'],'Apply')+K(['MMB'],'Orbit')+K(['Shift','MMB'],'Pan')+K(['Wheel'],'Zoom');
 else if(state.hoverEdge&&state.selectMode==='edge')html=state.tool==='seam'?K(['LMB'],isSeam(state.hoverEdge)?'Clear this seam':'Mark this seam')+K(['Shift','LMB'],'Add to selection'):K(['LMB'],'Select edge')+K(['Shift','LMB'],'Add / remove')+K(['RMB'],'Context menu')+K(['U'],'UV menu · 3D Viewport');
 else if(state.hoverFace&&state.selectMode==='face')html=K(['LMB'],'Select face')+K(['Shift','LMB'],'Add / remove')+K(['RMB'],'Context menu')+K(['U'],'UV menu · 3D Viewport');
 else html=K(['LMB'],'Select')+K(['MMB'],'Orbit')+K(['Shift','MMB'],'Pan')+K(['Wheel'],'Zoom')+K(['A'],'All')+K(['Alt','A'],'None')+K(['U'],'UV menu · 3D Viewport')+K(['Ctrl','E'],'Edge menu')+K(['Tab'],'Mode')+K(['2','3'],'Edge / Face');
 $('#status-keys').innerHTML=html;
}
function seamTargets(mark){
 if(state.mode!=='edit')return [];
 if(state.selectMode==='edge')return [...state.selEdges];
 const byPart=new Map();
 for(const key of state.selFaces){const [part,id]=key.split(':');if(!byPart.has(part))byPart.set(part,new Set());byPart.get(part).add(id);}
 const out=[];for(const [part,faces] of byPart)for(const edge of (mark?boundaryEdges(faces):edgesOfFaces(faces)))out.push(ek(part,edge));
 return out;
}
function hasSelection(){return state.selectMode==='edge'?state.selEdges.size>0:state.selFaces.size>0;}
function updateHeader(){
 const markable=seamTargets(true).some(key=>!isSeam(key)),clearable=seamTargets(false).some(isSeam);
 $('#op-mark').disabled=state.mode!=='edit'||!markable;$('#op-clear').disabled=state.mode!=='edit'||!clearable;
 $('#op-unwrap').disabled=state.mode!=='edit';$('#op-unwrap').classList.toggle('needed',state.stale);
 $('#mode-select').value=state.mode;
 $$('[data-edit-only]').forEach(el=>el.hidden=state.mode!=='edit');$$('[data-object-only]').forEach(el=>el.hidden=state.mode!=='object');
 $$('[data-select-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.selectMode===state.selectMode)));
 $$('[data-tool]').forEach(button=>{const on=button.dataset.tool===state.tool;button.classList.toggle('active',on);button.setAttribute('aria-pressed',String(on));});
 $('#workspace').classList.toggle('face-mode',state.selectMode==='face');$('#workspace').classList.toggle('object-mode',state.mode==='object');
 const selection=$('#object-selection-state');selection.hidden=state.mode!=='object';selection.textContent=state.objectSelected?'Selected':'Not selected';selection.classList.toggle('off',!state.objectSelected);
 $('#live-unwrap').checked=state.live;
 // Guide: which step comes next?
 let step=state.touched?4:1;
 if(state.mode==='edit'&&hasSelection()&&markable)step=2;
 if(state.stale)step=3;
 if(state.invalid&&!state.stale)step=hasSelection()&&markable?2:1;
 $$('#guide li').forEach(li=>{const n=Number(li.dataset.step);li.classList.toggle('current',n===step);li.classList.toggle('done',n<step);});
 updateStatusKeys();
}
function nudge(step){const li=$(`#guide li[data-step="${step}"]`);li.classList.remove('nudge');void li.offsetWidth;li.classList.add('nudge');}

/* ------------------------------------------------------------------ *
 * Selection
 * ------------------------------------------------------------------ */
function toggleIn(set,key,activeKey){
 if(set.has(key)&&activeKey===key){set.delete(key);return [...set].at(-1)||null;}
 set.add(key);return key;
}
function selectEdge(key,extend=false){
 if(state.mode!=='edit')return needEditMode();
 if(state.selectMode!=='edge')setSelectMode('edge',false);
 if(extend)state.activeEdge=toggleIn(state.selEdges,key,state.activeEdge);
 else{state.selEdges=new Set([key]);state.activeEdge=key;}
 const n=state.selEdges.size;
 if(!n)message('Selection cleared.');
 else if(isSeam(key)&&state.selEdges.has(key))message(`${edgeLabel(key)} is a seam. In the UV Editor it appears twice — once on each side of the cut.${n>1?` (${n} edges selected)`:''}`);
 else message(`${n>1?`${n} edges selected. `:''}${edgeLabel(key)} is joined. Mark Seam to cut the surface here.`);
 refreshSelection();
}
function selectFace(key,extend=false){
 if(state.mode!=='edit')return needEditMode();
 state.activeFace=key;
 if(state.selectMode==='face'){
  if(extend)state.activeFace=toggleIn(state.selFaces,key,state.activeFace===key?key:null)||key;
  else state.selFaces=new Set([key]);
  message(`${state.selFaces.size>1?`${state.selFaces.size} faces selected. `:''}${faceLabel(key)} selected. Mark Seam now cuts around the selected faces.`);
 }else message(`${faceLabel(key)} is outlined in both views. Faces joined by dark edges share one UV island.`);
 refreshSelection();renderMap();
}
function selectAll(){
 if(state.mode!=='edit')return needEditMode();
 if(state.selectMode==='edge'){state.selEdges=new Set(parts().flatMap(part=>EDGES.map(edge=>ek(part.id,edge.key))));state.activeEdge=null;}
 else state.selFaces=new Set(parts().flatMap(part=>FACE_ORDER.map(id=>`${part.id}:${id}`)));
 message(`Selected all ${state.selectMode==='edge'?'edges':'faces'} (A).`);refreshSelection();renderMap();
}
function deselectAll(silent=false){
 state.selEdges.clear();state.activeEdge=null;state.selFaces.clear();
 if(!silent)message('Deselected everything (Alt A).');refreshSelection();renderMap();
}
function setSelectMode(mode,announce=true){
 if(state.selectMode===mode)return;
 state.selectMode=mode;state.hoverEdge=null;state.hoverFace=null;
 if(mode==='face'){state.selEdges.clear();state.activeEdge=null;}else state.selFaces.clear();
 if(announce)message(mode==='edge'?'Edge Select (2): click edges to select them.':'Face Select (3): click faces. Mark Seam will cut around the selection.');
 refreshSelection();renderMap();
}
function setMode(mode){
 if(state.mode===mode)return;
 if(moveModal)finishMove(false);
 if(mode==='edit')state.objectSelected=true;
 state.mode=mode;state.hoverEdge=null;state.hoverFace=null;closeMenu();
 message(mode==='edit'?(nonUniform()?'Edit Mode. Careful: the object scale is still not applied, so Unwrap will stretch the texture.':'Edit Mode: you can now select edges and faces.'):'Object Mode: transform the whole object here (S to scale, Ctrl A to apply). Seams and UVs are edited in Edit Mode (Tab).',mode==='edit'&&nonUniform());
 updateTransformPanel();
 refreshSelection();renderMap();
}
function needEditMode(){message('You are in Object Mode. Press Tab (or use the mode menu) to enter Edit Mode first.',true);nudge(1);}
function setTool(tool){state.tool=tool;updateHeader();message(tool==='seam'?'Quick Seam (lab shortcut): click an edge to mark or clear its seam in one step. Blender itself uses Select + Mark Seam.':'Select tool: select first, then run an operator — the Blender way.');}

/* ------------------------------------------------------------------ *
 * Operators
 * ------------------------------------------------------------------ */
function setSeams(mark){
 if(state.mode!=='edit')return needEditMode();
 const targets=seamTargets(mark);
 if(!targets.length){message(state.selectMode==='edge'?'Select one or more edges first: click an edge, Shift + click to add more.':'Select faces first. Mark Seam cuts around the selected region.',true);nudge(1);return;}
 let changed=0;
 for(const key of targets){const [part,edge]=splitEdge(key),cuts=cutsOf(part);if(cuts.has(edge)!==mark){mark?cuts.add(edge):cuts.delete(edge);changed++;}}
 if(!changed){message(mark?'Those edges are already seams.':'There are no seams to clear in the selection.');return;}
 state.touched=true;
 const what=`${mark?'Marked':'Cleared'} ${changed} seam${changed>1?'s':''}`;
 if(state.live)unwrap(`${what}. Live Unwrap updated the UV map straight away.`);
 else{state.stale=true;state.staleReason='The seams changed.';refreshSelection();renderMap();message(`${what}. The UV map has not changed yet: run U › Unwrap.`);nudge(3);}
}
function toggleSeam(key){
 if(state.mode!=='edit')return needEditMode();
 if(state.selectMode!=='edge')setSelectMode('edge',false);
 const [part,edge]=splitEdge(key),mark=!cutsOf(part).has(edge);
 state.selEdges=new Set([key]);state.activeEdge=key;setSeams(mark);
}
function unwrap(text,projection=null,force=false){
 if(state.mode!=='edit'&&!force)return needEditMode();
 animation++;state.stale=false;state.projection=projection;
 const allCut=new Map(parts().map(part=>[part.id,new Set(EDGES.map(edge=>edge.key))]));
 const cuts=projection==='cube'?allCut:state.cuts[state.model];
 const result=buildCharts(state.model,cuts,parts());state.charts=result.charts;state.invalid=result.invalid;
 packCharts(state.charts,{margin:.32});
 $('#fold').disabled=!foldReady();$('#animate').disabled=!foldReady();updateFold(1);
 if(!chartOf(state.activeFace))state.activeFace=state.charts[0]?.faces[0]?.key||(state.model==='cube'?'cube:F':'seat:T');
 refreshSelection();renderMap();
 if(state.invalid){const {part,layout}=state.invalid;message(layout.cycle?`${part.name}: the surface still forms a closed loop, so it cannot lie flat. Mark one more seam.`:`${part.name}: faces would overlap in the UV map. Move a seam.`,true);nudge(1);}
 else if(nonUniform()){state.scaleWarned=true;message(`Warning: Object has non-uniform scale, unwrap will operate on a non-scaled version of the mesh. Look at the checker: it is stretched on the 3D object. Fix: Tab › Ctrl A › Scale, then Unwrap again.`,true);}
 else if(state.scaleWarned&&state.model==='cube'){state.scaleWarned=false;message('Unwrapped after Apply Scale: the checker is square again on every face, and Unfold now matches the model.');}
 else message(text||`Unwrapped into ${state.charts.length} UV island${state.charts.length===1?'':'s'}.`);
}
function packIslands(){if(state.invalid)return;packCharts(state.charts,{margin:.09});renderMap();message('Pack Islands (Ctrl P): islands moved closer together to use more of the 0–1 image square. Their relative scale is kept.');}
function averageScale(){if(state.invalid)return;averageIslandScale(state.charts);renderMap();message('Average Islands Scale (Ctrl A): every island now has the same texture density. Compare with Display Stretch › Area.');}
function resetSeams(){state.cuts[state.model]=defaultCuts(state.model);deselectAll(true);unwrap('Seams reset to the starting layout.');}

/* ------------------------------------------------------------------ *
 * Menus (header menus, U, Ctrl+E, right-click)
 * ------------------------------------------------------------------ */
const sep={sep:true};
const item=(label,action,opts={})=>({label,action,...opts});
function markItems(){return [item('Mark Seam',()=>setSeams(true),{disabled:!seamTargets(true).some(key=>!isSeam(key)),hint:state.selectMode==='face'?'Cut around the selected faces':'Cut the selected edges'}),item('Clear Seam',()=>setSeams(false),{disabled:!seamTargets(false).some(isSeam),hint:'Join the selected edges again'})];}
const MENUS={
 uv:()=>({title:'UV Mapping · 3D Viewport',items:[item('Unwrap',()=>unwrap(),{hint:'Open the surface at the marked seams'}),item('Smart UV Project',null,{disabled:true,hint:'Not in this lab'}),item('Lightmap Pack',null,{disabled:true}),item('Follow Active Quads',null,{disabled:true}),sep,item('Cube Projection',()=>unwrap('Cube Projection ignores your seams: every box side becomes its own island. Change a seam to go back to a seam-based Unwrap.','cube'),{hint:'Ignores seams — one island per side'}),item('Cylinder Projection',null,{disabled:true}),item('Sphere Projection',null,{disabled:true}),sep,...markItems(),sep,item('Reset Seams',resetSeams,{hint:'Lab: back to the starting layout'})]}),
 edge:()=>({title:'Edge',items:[item('Extrude Edges',null,{disabled:true}),item('Bevel Edges',null,{disabled:true}),sep,...markItems(),sep,item('Mark Sharp',null,{disabled:true}),item('Clear Sharp',null,{disabled:true})]}),
 context:()=>({title:state.selectMode==='edge'?'Edge Context Menu':'Face Context Menu',items:[...markItems(),sep,item('Select All',selectAll,{key:'A'}),item('Select None',()=>deselectAll(),{key:'Alt A'})]}),
 select:()=>({title:'Select',items:[item('All',selectAll,{key:'A'}),item('None',()=>deselectAll(),{key:'Alt A'}),sep,item('Edge Select',()=>setSelectMode('edge'),{key:'2',check:state.selectMode==='edge'}),item('Face Select',()=>setSelectMode('face'),{key:'3',check:state.selectMode==='face'})]}),
 'uv-editor':()=>({title:'UV',items:[item('Unwrap',()=>unwrap(),{key:'U'}),sep,item('Pack Islands',packIslands,{key:'Ctrl P',disabled:!!state.invalid}),item('Average Islands Scale',averageScale,{key:'Ctrl A',disabled:!!state.invalid}),sep,item('Live Unwrap',()=>setLive(!state.live),{check:state.live,hint:'Re-unwrap every time a seam changes'})]}),
 object:()=>({title:'Object',items:[item('Move',startMoveModal,{key:'G',disabled:!state.objectSelected,hint:'Move freely or constrain to X / Y / Z'}),item('Clear Location',()=>setObjectLocation([0,0,0]),{key:'Alt G',disabled:!state.objectSelected}),item('Scale',startScaleModal,{key:'S',disabled:!state.objectSelected,hint:'Then X / Y / Z, a number, Enter'}),sep,item('Apply ›  Scale',applyScale,{key:'Ctrl A',disabled:!state.objectSelected||!scaled(),hint:'Bake the scale into the mesh data'}),item('Reset Object',resetObject,{hint:'Lab: original mesh, location and scale'})]}),
 apply:()=>({title:'Apply',items:[item('Location',null,{disabled:true}),item('Rotation',null,{disabled:true}),item('Scale',applyScale,{disabled:!state.objectSelected||!scaled(),hint:'Mesh data gets the real proportions; scale becomes 1'}),item('All Transforms',applyScale,{disabled:!state.objectSelected||!scaled()})]}),
 'uv-context':()=>({title:'UV Context Menu',items:[item('Unwrap',()=>unwrap(),{key:'U'}),item('Pack Islands',packIslands,{key:'Ctrl P',disabled:!!state.invalid}),item('Average Islands Scale',averageScale,{key:'Ctrl A',disabled:!!state.invalid})]})
};
const keyName={uv:'U',edge:'Ctrl E',apply:'Ctrl A'};
let menuOpener=null;
function openMenu(name,x,y,opener=null){
 if(state.mode!=='edit'&&!['select','object','apply'].includes(name)){needEditMode();return;}
 if(state.mode==='edit'&&['object','apply'].includes(name)){message('Apply Scale is an Object Mode operator. Press Tab first.',true);return;}
 const {title,items}=MENUS[name](),menu=$('#menu');menu.replaceChildren();
 const head=document.createElement('div');head.className='menu-title';head.textContent=keyName[name]?`${title}  ·  ${keyName[name]}`:title;menu.append(head);
 for(const entry of items){
  if(entry.sep){menu.append(document.createElement('hr'));continue;}
  const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitem');button.disabled=!!entry.disabled||!entry.action;
  button.innerHTML=`${entry.check!==undefined?`<span class="m-check">${entry.check?'✓':''}</span>`:''}<span class="m-label">${entry.label}${entry.hint?`<small>${entry.hint}</small>`:''}</span>${entry.key?`<span class="m-key">${entry.key}</span>`:''}`;
  button.addEventListener('click',()=>{closeMenu();entry.action?.();});menu.append(button);
 }
 menu.hidden=false;
 const rect=menu.getBoundingClientRect();
 menu.style.left=`${Math.max(6,Math.min(x,innerWidth-rect.width-6))}px`;menu.style.top=`${Math.max(6,Math.min(y,innerHeight-rect.height-6))}px`;
 menuOpener=opener;opener?.setAttribute('aria-expanded','true');
 menu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
}
function closeMenu(){const menu=$('#menu');if(menu.hidden)return;menu.hidden=true;menuOpener?.setAttribute('aria-expanded','false');menuOpener=null;}
$('#menu').addEventListener('keydown',event=>{
 if(!['ArrowDown','ArrowUp'].includes(event.key))return;event.preventDefault();
 const buttons=$$('#menu button:not(:disabled)'),at=buttons.indexOf(document.activeElement);
 buttons[(at+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();
});
$$('[data-open-menu]').forEach(button=>button.addEventListener('click',event=>{
 event.stopPropagation();if(menuOpener===button){closeMenu();return;}closeMenu();
 const rect=button.getBoundingClientRect();openMenu(button.dataset.openMenu,rect.left,rect.bottom+3,button);
}));
document.addEventListener('pointerdown',event=>{if(!event.target.closest('#menu')&&!event.target.closest('[data-open-menu]'))closeMenu();});

/* ------------------------------------------------------------------ *
 * 3D viewport
 * ------------------------------------------------------------------ */
const host=$('#viewer');
let renderer,scene,camera,controls,dirty=true,animation=0,previewReady=false;
const objectGroups={},edgeGroups={},faceMeshes={cube:{},chair:{}},edgeObjects=new Map(),hitMeshes={cube:[],chair:[]};
const views={cube:new THREE.Vector3(4.2,3,5.4),chair:new THREE.Vector3(5,4.3,6.3)};
const targetY={cube:0,chair:1.45},flatSpan={cube:4.4,chair:5};
const viewTargets={cube:new THREE.Vector3(0,0,0),chair:new THREE.Vector3(0,1.45,0)};

// One texture for the whole object, painted from the UV map. The 3D faces
// sample it through their UVs, exactly like an image texture in Blender.
const uvCanvas=document.createElement('canvas');uvCanvas.width=uvCanvas.height=1024;
const uvTexture=new THREE.CanvasTexture(uvCanvas);uvTexture.colorSpace=THREE.SRGBColorSpace;uvTexture.anisotropy=8;
const CELLS=16;
function paintTexture(){
 const ctx=uvCanvas.getContext('2d'),N=1024,cell=N/CELLS,P=([u,v])=>[u*N,(1-v)*N];
 ctx.fillStyle='#3c4046';ctx.fillRect(0,0,N,N);
 for(const chart of state.charts)for(const face of chart.faces){
  const corners=faceUV(chart,face).map(P);ctx.beginPath();corners.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();
  ctx.fillStyle=chart.part.id==='cube'?FACES[face.id].color:chart.part.color;ctx.fill();
 }
 // A checker that is square in UV space: on the 3D model it shows stretch
 // and uneven texture density, the same way Blender's UV Grid does.
 for(let y=0;y<CELLS;y++)for(let x=0;x<CELLS;x++){ctx.fillStyle=(x+y)%2?'rgba(20,32,44,.2)':'rgba(255,255,255,.2)';ctx.fillRect(x*cell,y*cell,cell,cell);}
 ctx.strokeStyle='rgba(20,28,36,.35)';ctx.lineWidth=2;ctx.beginPath();for(let i=0;i<=CELLS;i++){ctx.moveTo(i*cell,0);ctx.lineTo(i*cell,N);ctx.moveTo(0,i*cell);ctx.lineTo(N,i*cell);}ctx.stroke();
 ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#1d232b';
 for(const chart of state.charts)for(const face of chart.faces){
  const corners=faceUV(chart,face).map(P),cx=corners.reduce((s,p)=>s+p[0],0)/4,cy=corners.reduce((s,p)=>s+p[1],0)/4;
  const w=Math.hypot(corners[1][0]-corners[0][0],corners[1][1]-corners[0][1]),h=Math.hypot(corners[3][0]-corners[0][0],corners[3][1]-corners[0][1]),m=Math.min(w,h);
  if(m<34)continue;
  ctx.font=`900 ${Math.min(120,m*.45)}px Arial`;ctx.fillText(face.id,cx,cy-(m>150?m*.08:0));
  if(m>150){ctx.font=`700 ${Math.min(34,m*.13)}px Arial`;ctx.fillText(FACES[face.id].name.toUpperCase(),cx,cy+m*.22);}
 }
 uvTexture.needsUpdate=true;
}
// PlaneGeometry corners: 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right.
function updateFaceUVs(){
 for(const [key,mesh] of Object.entries(faceMeshes[state.model])){
  const chart=chartOf(key),face=chart?.faces.find(item=>item.key===key),uv=mesh.geometry.attributes.uv;
  if(!face){for(let i=0;i<4;i++)uv.setXY(i,.001,.001);}
  else{const [bl,br,tr,tl]=faceUV(chart,face);[tl,tr,bl,br].forEach((p,i)=>uv.setXY(i,p[0],p[1]));}
  uv.needsUpdate=true;
 }
 dirty=true;
}
function faceMesh(key,part,id){
 const size=faceDims(part,id),material=new THREE.MeshStandardMaterial({map:uvTexture,side:THREE.DoubleSide,roughness:1,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(...size),material);mesh.userData.face=key;mesh.matrixAutoUpdate=false;mesh.matrix.copy(facePose(part,id));
 const outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(Math.max(.01,size[0]*.86),Math.max(.01,size[1]*.86))),new THREE.LineDashedMaterial({color:0xffbf00,dashSize:.12,gapSize:.08,depthTest:false}));
 outline.computeLineDistances();outline.position.z=.01;outline.visible=false;outline.renderOrder=6;mesh.add(outline);mesh.userData.outline=outline;
 return mesh;
}
// Every edge is a thin cylinder, a faint copy drawn through the surface (so
// hidden seams still read) and a wider invisible pick target. Edges are not
// children of the scaled object, so their thickness stays even.
const cylinder=new THREE.CylinderGeometry(1,1,1,10),axisY=new THREE.Vector3(0,1,0);
function makeEdges(model,part,radius){
 for(const edge of EDGES){
  const make=(material,r)=>{const mesh=new THREE.Mesh(cylinder,material);mesh.userData.r=r;edgeGroups[model].add(mesh);return mesh;};
  const mesh=make(new THREE.MeshBasicMaterial({color:COLORS.edge}),radius);mesh.renderOrder=4;
  const ghost=make(new THREE.MeshBasicMaterial({color:COLORS.edge,transparent:true,opacity:.14,depthTest:false,depthWrite:false}),radius);ghost.renderOrder=3;
  const hit=make(new THREE.MeshBasicMaterial({visible:false}),radius*3.4);
  const key=ek(part.id,edge.key);hit.userData.edge=key;
  edgeObjects.set(key,{mesh,ghost,hit,radius,model,part:part.id,edge});hitMeshes[model].push(hit);
 }
}
function placeEdges(model){
 const scale=state.objScale[model];
 for(const obj of edgeObjects.values()){
  if(obj.model!==model)continue;
  const part=state.mesh[model].find(item=>item.id===obj.part),a=FACES[obj.edge.a].n,b=FACES[obj.edge.b].n;
  const direction=new THREE.Vector3().crossVectors(V3(a),V3(b)).normalize(),center=new THREE.Vector3();
  for(let i=0;i<3;i++)center.setComponent(i,((a[i]+b[i])*part.size[i]/2+part.position[i])*scale[i]);
  const length=[0,1,2].reduce((sum,i)=>sum+Math.abs(direction.getComponent(i))*part.size[i]*scale[i],0);
  for(const mesh of [obj.mesh,obj.ghost,obj.hit]){mesh.position.copy(center);mesh.quaternion.setFromUnitVectors(axisY,direction);mesh.scale.y=length+mesh.userData.r*.6;}
 }
 dirty=true;
}
function placeObject(model){
 const location=blenderToWorld(state.objLocation[model]).multiplyScalar(state.fold);
 objectGroups[model]?.position.copy(location);
 edgeGroups[model]?.position.copy(location);
 objectGroups[model]?.updateMatrixWorld(true);
 edgeGroups[model]?.updateMatrixWorld(true);
 dirty=true;
}
// (Re)build an object from its current mesh data — also used by Apply Scale.
function buildModel(model){
 for(const group of [objectGroups[model],edgeGroups[model]])if(group){scene.remove(group);group.traverse(item=>{if(item.geometry&&item.geometry!==cylinder)item.geometry.dispose();if(item.material&&item.material.map!==uvTexture)item.material.dispose?.();});}
 for(const key of [...edgeObjects.keys()])if(edgeObjects.get(key).model===model)edgeObjects.delete(key);
 faceMeshes[model]={};hitMeshes[model]=[];
 objectGroups[model]=new THREE.Group();edgeGroups[model]=new THREE.Group();scene.add(objectGroups[model],edgeGroups[model]);
 for(const part of state.mesh[model]){
  for(const id of FACE_ORDER){const key=`${part.id}:${id}`,mesh=faceMesh(key,part,id);objectGroups[model].add(mesh);faceMeshes[model][key]=mesh;}
  makeEdges(model,part,model==='cube'?.026:.014);
 }
 placeEdges(model);
 const visible=state.model===model;objectGroups[model].visible=edgeGroups[model].visible=visible;
 placeObject(model);
}
const foldReady=()=>previewReady&&!state.invalid&&state.charts.length>0;
function updateFold(amount){
 state.fold=amount;$('#fold').value=Math.round(amount*100);$('#animate').textContent=amount>.5?'Unfold ↘':'Fold back ↗';
 const model=state.model,group=objectGroups[model];
 if(group){
  const scale=state.objScale[model];
  // The flat pieces come from the mesh data, not from the Object scale.
  group.scale.set(...scale.map(s=>1+(s-1)*amount));
  const byId=Object.fromEntries(state.mesh[model].map(part=>[part.id,part]));
  const matrices=foldReady()?foldMatrices(state.charts,byId,amount,{span:flatSpan[model],center:[0,targetY[model],0]}):new Map();
  for(const [key,mesh] of Object.entries(faceMeshes[model])){const [partId,id]=key.split(':');mesh.matrix.copy(matrices.get(key)||facePose(byId[partId],id));mesh.matrixWorldNeedsUpdate=true;}
  group.updateMatrixWorld(true);
 }
 placeObject(model);
 if(camera&&controls){
  const flat=new THREE.Vector3(0,targetY[model],flatSpan[model]*2);
  controls.enabled=true;controls.enableRotate=amount>=.999;
  if(amount<.999){camera.position.copy(flat).lerp(views[model],amount);controls.target.set(0,targetY[model],0);}
  else{camera.position.copy(views[model]);controls.target.copy(viewTargets[model]);}
  controls.update();
 }
 updateScene();
}
function animateTo(target){
 if(!foldReady())return;
 const from=state.fold,start=performance.now(),duration=1100,run=++animation;
 if(target<.5&&nonUniform())message('Watch the proportions: the flat pieces follow the mesh data, not the Object scale. That is the mismatch Apply Scale fixes.',true);
 function tick(now){if(run!==animation)return;const t=Math.min(1,(now-start)/duration),ease=t*t*(3-2*t);updateFold(from+(target-from)*ease);if(t<1)requestAnimationFrame(tick);}
 requestAnimationFrame(tick);
}
function overlayColor(score){const t=Math.min(1,score),a=[104,166,236],b=[246,102,97];return `rgb(${a.map((v,i)=>Math.round(v+(b[i]-v)*t)).join(',')})`;}
function stretchScore(metrics,key){if(state.stretch==='none')return null;const value=metrics?.get(key)?.[state.stretch]||0;return Math.min(1,value/(state.stretch==='angle'?25:1.6));}
let lastMetrics=null;
function updateScene(){
 const edit=state.mode==='edit',object=state.mode==='object',edgesVisible=edit&&state.fold>.96;
 for(const [key,obj] of edgeObjects){
  if(object){
   const selected=state.objectSelected&&obj.model===state.model;
   obj.mesh.visible=selected;obj.ghost.visible=false;obj.hit.visible=false;
   if(selected){const r=obj.radius*1.75;obj.mesh.material.color.set(COLORS.object);obj.mesh.scale.x=obj.mesh.scale.z=r;}
   continue;
  }
  const visible=edgesVisible&&obj.model===state.model;
  obj.mesh.visible=obj.ghost.visible=obj.hit.visible=visible;if(!visible)continue;
  const selected=state.selEdges.has(key),active=state.activeEdge===key&&selected,seam=isSeam(key),hover=state.hoverEdge===key;
  const color=active?COLORS.active:selected?COLORS.sel:seam?COLORS.cut:hover?COLORS.hover:COLORS.edge;
  const r=obj.radius*(selected||seam?1.9:1)*(hover?1.45:1);
  for(const mesh of [obj.mesh,obj.ghost]){mesh.material.color.set(color);mesh.scale.x=mesh.scale.z=r;}
  obj.ghost.material.opacity=selected||seam?.5:hover?.35:.1;
 }
 for(const [key,mesh] of Object.entries(faceMeshes[state.model])){
  const score=stretchScore(lastMetrics,key),selected=edit&&state.selectMode==='face'&&state.selFaces.has(key),hover=edit&&state.hoverFace===key;
  mesh.material.color.set(score===null?0xffffff:overlayColor(score));
  mesh.material.emissive.set(selected?'#ff8a00':hover?'#ffffff':'#000000');mesh.material.emissiveIntensity=selected?.42:hover?.14:0;
  mesh.userData.outline.visible=edit&&key===state.activeFace;
 }
 dirty=true;
}

/* ------------------------------------------------------------------ *
 * Object scale (Object Mode) and Apply Scale
 * ------------------------------------------------------------------ */
const nonUniform=(model=state.model)=>{const s=state.objScale[model];return Math.max(...s)-Math.min(...s)>1e-6;};
const scaled=(model=state.model)=>state.objScale[model].some(s=>Math.abs(s-1)>1e-6);
function setObjectLocation(location,announce=true){
 state.objLocation[state.model]=location.map(value=>Math.round(value*100)/100);
 placeObject(state.model);updateTransformPanel();
 if(announce)message(`Object moved to ${state.objLocation[state.model].map(value=>value.toFixed(2)).join(', ')}. The UV map stays on the object.`);
}
function setObjectScale(scale,announce=true){
 state.objScale[state.model]=scale.map(s=>Math.round(Math.min(4,Math.max(.25,s))*100)/100);
 placeEdges(state.model);updateFold(state.fold);updateTransformPanel();
 if(announce)message(`Object scale ${state.objScale[state.model].map(s=>s.toFixed(2)).join(' × ')}. The mesh data is unchanged${scaled()?': Unwrap will still use the unscaled shape.':'.'}`,nonUniform());
}
function applyScale(){
 if(state.mode!=='object'){message('Apply Scale works in Object Mode. Press Tab first (the Blender way: Ctrl A in Object Mode).',true);return;}
 if(!state.objectSelected){message('Select the object before applying scale.',true);return;}
 if(!scaled()){message('Scale is already 1, 1, 1: nothing to apply.');return;}
 const s=state.objScale[state.model],wasNonUniform=nonUniform();
 for(const part of state.mesh[state.model]){part.size=part.size.map((n,i)=>n*s[i]);part.position=part.position.map((n,i)=>n*s[i]);}
 state.objScale[state.model]=[1,1,1];buildModel(state.model);updateFaceUVs();updateFold(1);updateTransformPanel();
 if(wasNonUniform){state.stale=true;state.staleReason='The mesh changed shape (Apply Scale).';renderMap();message('Scale applied: the mesh data now has the real proportions and the scale is 1, 1, 1. The UVs do not update by themselves — Tab into Edit Mode and Unwrap again.');nudge(3);}
 else message('Scale applied. It was uniform, so the UV proportions were already correct.');
 updateHeader();
}
function resetObject(){state.mesh[state.model]=structuredClone(MODELS[state.model]);state.objScale[state.model]=[1,1,1];state.objLocation[state.model]=[0,0,0];buildModel(state.model);updateTransformPanel();unwrap('Object reset: original mesh data, location 0, 0, 0 and scale 1, 1, 1.',null,true);}
function updateTransformPanel(){
 const s=state.objScale[state.model],location=state.objLocation[state.model],object=state.mode==='object';
 $$('[data-location-axis]').forEach(input=>{const i=Number(input.dataset.locationAxis);if(document.activeElement!==input)input.value=location[i].toFixed(2);input.disabled=!object||!state.objectSelected;});
 $$('[data-scale-axis]').forEach(input=>{const i=Number(input.dataset.scaleAxis);if(document.activeElement!==input)input.value=s[i].toFixed(2);input.disabled=!object||!state.objectSelected;});
 $('#apply-scale').disabled=!object||!state.objectSelected||!scaled();
 const panel=$('#transform-panel');panel.classList.toggle('warn',nonUniform());panel.classList.toggle('locked',!object);
 $('#transform-note').textContent=object?(!state.objectSelected?'Select the object to edit its transforms.':scaled()?'Not applied: Unwrap ignores this scale. Ctrl A › Scale.':'Scale 1, 1, 1: mesh and object agree.'):(nonUniform()?'Scale not applied! Tab to Object Mode › Ctrl A › Scale.':'Change scale in Object Mode (Tab).');
}
// Blender-like modal scale: S, optional X / Y / Z, type a number, Enter.
let scaleModal=null;
function startScaleModal(){if(state.mode!=='object'){message('In Edit Mode, S would scale the selected elements. To scale the object, press Tab for Object Mode, then S.');return;}if(!state.objectSelected){message('Select the object before pressing S.',true);return;}scaleModal={axis:null,text:'',start:[...state.objScale[state.model]]};showScaleModal();}
function showScaleModal(){const m=scaleModal,axis=m.axis===null?'':` along ${'XYZ'[m.axis]}`;message(`Scale${axis}: ${m.text||'type a value'} · X / Y / Z pick an axis · Enter confirm · Esc cancel`);}
function scaleModalKey(event){
 const m=scaleModal,key=event.key.toLowerCase();event.preventDefault();
 if(key==='escape'){setObjectScale(m.start,false);scaleModal=null;message('Scale cancelled.');return;}
 if(key==='enter'){scaleModal=null;setObjectScale(state.objScale[state.model]);return;}
 if('xyz'.includes(key)&&key.length===1)m.axis='xyz'.indexOf(key);
 else if(/^[0-9.]$/.test(key))m.text+=key;
 else if(key==='backspace')m.text=m.text.slice(0,-1);
 const v=parseFloat(m.text);
 const next=[...m.start];if(Number.isFinite(v)&&v>0)for(let i=0;i<3;i++)if(m.axis===null||m.axis===i)next[i]=m.start[i]*v;
 setObjectScale(next,false);showScaleModal();
}
// Blender-style G transform: the cursor moves the object in the view plane;
// X/Y/Z constrain it to a world axis and typed numbers give an exact distance.
let moveModal=null;
function startMoveModal(){
 if(state.mode!=='object'||!state.objectSelected){message('Select the object in Object Mode before pressing G.',true);return;}
 if(state.fold<.999){message('Fold back to the 3D object before moving it.',true);return;}
 moveModal={start:[...state.objLocation[state.model]],axis:null,text:'',x:pointer.x,y:pointer.y};
 showMoveModal();
}
function showMoveModal(){
 const m=moveModal,axis=m.axis===null?'freely':`on ${'XYZ'[m.axis]}`;
 message(`Move ${axis}${m.text?` · ${m.text}`:''}. Move the mouse or type a value · X/Y/Z constrain · LMB/Enter confirm · RMB/Esc cancel.`);
}
function movePreview(x,y){
 if(!moveModal||!camera)return;
 const m=moveModal,rect=renderer.domElement.getBoundingClientRect(),distance=camera.position.distanceTo(controls.target);
 const units=2*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)*distance/rect.height;
 const dx=x-m.x,dy=y-m.y,delta=new THREE.Vector3();
 if(m.text){
  const amount=Number(m.text);
  if(Number.isFinite(amount)){
   if(m.axis!==null){const components=[0,0,0];components[m.axis]=amount;delta.copy(blenderToWorld(components));}
   else{
    const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0);
    const up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1);
    delta.addScaledVector(right,dx).addScaledVector(up,-dy);
    if(delta.lengthSq()<1e-6)delta.copy(right);
    delta.normalize().multiplyScalar(amount);
   }
  }
 }else if(m.axis===null){
  const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0);
  const up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1);
  delta.addScaledVector(right,dx*units).addScaledVector(up,-dy*units);
 }else{
  const origin=blenderToWorld(m.start).add(new THREE.Vector3(0,targetY[state.model],0));
  const axis=blenderToWorld([0,0,0].map((_,i)=>i===m.axis?1:0));
  const a=origin.clone().project(camera),b=origin.clone().add(axis).project(camera);
  const vx=(b.x-a.x)*rect.width/2,vy=-(b.y-a.y)*rect.height/2,length=vx*vx+vy*vy;
  const amount=length>4?(dx*vx+dy*vy)/length:-dy*units;
  delta.addScaledVector(axis,amount);
 }
 const blenderDelta=worldToBlender(delta);
 setObjectLocation(m.start.map((value,i)=>value+blenderDelta[i]),false);
}
function finishMove(commit){
 if(!moveModal)return;
 const start=moveModal.start;moveModal=null;
 if(!commit){setObjectLocation(start,false);message('Move cancelled.');}
 else message(`Move confirmed. Location: ${state.objLocation[state.model].map(value=>value.toFixed(2)).join(', ')}.`);
}
function moveModalKey(event){
 const m=moveModal,key=event.key.toLowerCase();event.preventDefault();
 if(key==='escape'){finishMove(false);return;}
 if(key==='enter'){finishMove(true);return;}
 if('xyz'.includes(key)&&key.length===1){m.axis='xyz'.indexOf(key);showMoveModal();movePreview(pointer.x,pointer.y);return;}
 if(/^[0-9.]$/.test(key)||key==='-'&&m.text==='')m.text+=key;
 else if(key==='backspace')m.text=m.text.slice(0,-1);
 movePreview(pointer.x,pointer.y);showMoveModal();
}

/* ------------------------------------------------------------------ *
 * UV Editor
 * ------------------------------------------------------------------ */
const svgFaces=$('#uv-faces'),svgEdges=$('#uv-edges'),svgLabels=$('#uv-labels');
const mapPoint=uv=>[70+uv[0]*420,460-uv[1]*420];
function renderFace(chart,face,metrics){
 const key=face.key,corners=faceUV(chart,face).map(mapPoint),score=stretchScore(metrics,key);
 const fill=score===null?(chart.part.id==='cube'?FACES[face.id].color:chart.part.color):overlayColor(score);
 const selected=state.selectMode==='face'&&state.selFaces.has(key);
 const group=S('g',{class:`uv-face${selected?' selected':''}${state.hoverFace===key?' hovered':''}`,tabindex:0,role:'button','aria-label':`${faceLabel(key)} in the UV map`,'aria-pressed':String(selected)});
 group.dataset.face=key;
 const points=corners.map(point=>point.join(',')).join(' ');
 group.append(S('polygon',{points,fill}));
 group.append(S('polygon',{points,class:'uv-checker'}));
 if(selected)group.append(S('polygon',{points,class:'sel-tint'}));
 const cx=corners.reduce((sum,p)=>sum+p[0],0)/4,cy=corners.reduce((sum,p)=>sum+p[1],0)/4;
 const fw=Math.hypot(corners[1][0]-corners[0][0],corners[1][1]-corners[0][1]),fh=Math.hypot(corners[3][0]-corners[0][0],corners[3][1]-corners[0][1]),area=fw*fh;
 if(Math.min(fw,fh)>19&&area>400){const letter=S('text',{class:'face-letter',x:cx,y:cy-(area>3000?5:0),'font-size':Math.min(25,Math.max(11,Math.min(fw,fh)*.5))});letter.textContent=face.id;group.append(letter);}
 if(area>3000){const label=S('text',{class:'face-name',x:cx,y:cy+Math.min(17,Math.sqrt(area)*.2),'font-size':Math.min(12,Math.sqrt(area)*.15)});label.textContent=FACES[face.id].name;group.append(label);}
 if(key===state.activeFace)group.append(S('polygon',{points:shrink(corners,.14).map(point=>point.join(',')).join(' '),class:'trace'}));
 group.addEventListener('click',event=>{if(state.selectMode==='face'||!event.target.closest('.uv-edge'))selectFace(key,event.shiftKey);});
 group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectFace(key,event.shiftKey);}});
 group.addEventListener('pointerenter',()=>setHoverFace(key));group.addEventListener('pointerleave',()=>setHoverFace(null));
 return group;
}
function shrink(corners,t){const cx=corners.reduce((s,p)=>s+p[0],0)/4,cy=corners.reduce((s,p)=>s+p[1],0)/4;return corners.map(([x,y])=>[x+(cx-x)*t,y+(cy-y)*t]);}
function renderEdges(){
 svgEdges.replaceChildren();const list=[];
 for(const chart of state.charts)for(const face of chart.faces){
  const partId=chart.part.id;
  for(const edge of edgesOfFace(face.id)){
   const other=edge.a===face.id?edge.b:edge.a,seg=edgeSegment(face.id,other,face.size);if(!seg)continue;
   const key=ek(partId,edge.key),[a,b]=seg.map(([u,v])=>mapPoint(faceUVPoint(chart,face,u,v)));
   const seam=state.projection==='cube'||isSeam(key);
   list.push({key,a,b,seam,interior:!seam&&face.id>other});
  }
 }
 // Interior edges are shared by two faces: draw them once. Seams: twice.
 const rank=item=>(state.selEdges.has(item.key)?2:0)+(item.seam?1:0);
 for(const item of list.filter(entry=>!entry.interior).sort((x,y)=>rank(x)-rank(y))){
  const selected=state.selEdges.has(item.key);
  const g=S('g',{class:`uv-edge${item.seam?' seam':''}${selected?' selected':''}${selected&&state.activeEdge===item.key?' active':''}${state.hoverEdge===item.key?' hovered':''}`});
  g.dataset.edge=item.key;
  const line={x1:item.a[0],y1:item.a[1],x2:item.b[0],y2:item.b[1]};
  g.append(S('line',{...line,class:'edge-line'}),S('line',{...line,class:'edge-hit'}));
  g.addEventListener('click',event=>{event.stopPropagation();if(state.tool==='seam'&&!event.shiftKey)toggleSeam(item.key);else selectEdge(item.key,event.shiftKey);});
  g.addEventListener('pointerenter',()=>setHoverEdge(item.key));g.addEventListener('pointerleave',()=>setHoverEdge(null));
  svgEdges.append(g);
 }
}
function renderMap(){
 svgFaces.replaceChildren();svgEdges.replaceChildren();svgLabels.replaceChildren();
 const overlay=$('#map-overlay'),hostEl=$('#map-host');
 overlay.classList.remove('warning');overlay.hidden=true;
 $('#map-stale').hidden=!(state.stale&&state.mode==='edit');hostEl.classList.toggle('is-stale',state.stale);$('#stale-text').textContent=`UV map out of date. ${state.staleReason||'The seams changed.'}`;
 if(previewReady){paintTexture();updateFaceUVs();}
 if(state.mode!=='edit'){
  overlay.hidden=false;overlay.innerHTML='<strong>UVs are shown in Edit Mode</strong><span>Blender\'s UV Editor only displays UVs while the object is in Edit Mode.</span><button type="button" data-enter-edit>Enter Edit Mode <kbd>Tab</kbd></button>';
  overlay.querySelector('[data-enter-edit]').onclick=()=>setMode('edit');
  $('#island-count').textContent='—';lastMetrics=null;updateScene();return;
 }
 const metrics=state.charts.length?stretchMetrics(state.charts):new Map();lastMetrics=metrics;
 for(const chart of state.charts){
  for(const face of chart.faces)svgFaces.append(renderFace(chart,face,metrics));
  if(state.model==='chair'){
   const tag={seat:'SEAT',back:'BACK','leg-fl':'FL LEG','leg-fr':'FR LEG','leg-bl':'BL LEG','leg-br':'BR LEG'}[chart.part.id];
   const label=S('text',{class:'island-label',x:70+(chart.x+chart.width*chart.densityScale*chart.stretchU*chart.unitScale/2)*420,y:460-(chart.y+chart.height*chart.densityScale*chart.stretchV*chart.unitScale)*420-6,'text-anchor':'middle'});label.textContent=tag;svgLabels.append(label);
  }
 }
 renderEdges();
 if(state.invalid){
  const {part,layout}=state.invalid;overlay.hidden=false;overlay.classList.add('warning');
  overlay.innerHTML=`<strong>${part.name} can't lie flat yet</strong><span>${layout.cycle?'Its faces still form a closed loop, like a tube. Select one more edge on it and Mark Seam.':'Some faces would overlap in the UV map. Clear one seam and mark a different one.'}</span>`;
 }
 const n=state.charts.length;
 $('#island-count').textContent=state.invalid?'No valid layout':`${n} UV island${n===1?'':'s'}${state.projection==='cube'?' · Cube Projection':''}`;
 const chart=chartOf(state.activeFace);
 $('#stretch-value').textContent=`${(chart?.stretchU||1).toFixed(2)}×`;$('#stretch-u').value=String(chart?.stretchU||1);
 updateScene();
}
// Hover: cheap class toggles, no full re-render.
function setHoverEdge(key){
 if(state.hoverEdge===key)return;state.hoverEdge=key;
 $$('.uv-edge.hovered').forEach(el=>el.classList.remove('hovered'));
 if(key)$$(`.uv-edge[data-edge="${key}"]`).forEach(el=>{el.classList.add('hovered');el.parentNode.append(el);});
 $$('#edge-list button').forEach(button=>button.classList.toggle('hovered',button.dataset.edge===key));
 host.classList.toggle('hovering-edge',!!key);updateScene();updateStatusKeys();
}
function setHoverFace(key){
 if(state.hoverFace===key)return;state.hoverFace=key;
 $$('.uv-face.hovered').forEach(el=>el.classList.remove('hovered'));
 if(key)$(`.uv-face[data-face="${key}"]`)?.classList.add('hovered');
 updateScene();updateStatusKeys();
}

/* ------------------------------------------------------------------ *
 * Edge list (accessible fallback)
 * ------------------------------------------------------------------ */
const edgeList=$('#edge-list');
function renderEdgeList(){
 edgeList.replaceChildren();
 for(const edge of EDGES){
  const key=ek(state.listPart,edge.key),button=document.createElement('button');button.type='button';button.dataset.edge=key;button.textContent=edgeName(edge);
  button.addEventListener('click',event=>{if(state.tool==='seam'&&!event.shiftKey)toggleSeam(key);else selectEdge(key,event.shiftKey);});
  button.addEventListener('pointerenter',()=>setHoverEdge(key));button.addEventListener('pointerleave',()=>setHoverEdge(null));
  edgeList.append(button);
 }
 updateEdgeList();
}
function updateEdgeList(){
 for(const button of edgeList.querySelectorAll('button')){const key=button.dataset.edge,cut=isSeam(key),sel=state.selEdges.has(key);button.classList.toggle('cut',cut);button.classList.toggle('selected',sel);button.setAttribute('aria-pressed',String(sel));button.title=`${cut?'Seam':'Joined edge'} · ${button.textContent}`;}
 const total=parts().reduce((sum,part)=>sum+cutsOf(part.id).size,0);
 $('#seam-count').textContent=state.model==='cube'?`${total} of 12 edges are seams`:`${cutsOf(state.listPart).size} of 12 seams on ${partById(state.listPart).name} · ${total} in total`;
 const active=state.model==='cube'?Object.entries(PRESETS).find(([,preset])=>{const cuts=cutsOf('cube');return preset.size===cuts.size&&[...preset].every(key=>cuts.has(key));})?.[0]:null;
 $$('[data-preset]').forEach(button=>{button.classList.toggle('active',button.dataset.preset===active);button.setAttribute('aria-pressed',String(button.dataset.preset===active));});
}
function refreshSelection(){
 // Keep the chair's edge list on the part the user is working on.
 const lastEdge=state.activeEdge||[...state.selEdges].at(-1);
 if(state.model==='chair'&&lastEdge){const [part]=splitEdge(lastEdge);if(part!==state.listPart){state.listPart=part;$('#part-select').value=part;renderEdgeList();}}
 updateEdgeList();updateHeader();
 // Update UV edge classes without re-rendering faces.
 if(state.mode==='edit'&&state.charts.length)renderEdges();
 updateScene();
}

/* ------------------------------------------------------------------ *
 * Model switching
 * ------------------------------------------------------------------ */
function switchModel(model){
 if(state.model===model)return;animation++;
 if(moveModal)finishMove(false);
 state.model=model;state.objectSelected=true;state.listPart=model==='cube'?'cube':'seat';state.activeFace=model==='cube'?'cube:F':'seat:T';
 state.selEdges.clear();state.selFaces.clear();state.activeEdge=null;state.hoverEdge=null;state.hoverFace=null;state.stale=false;
 $$('[data-model]').forEach(button=>{button.classList.toggle('active',button.dataset.model===model);button.setAttribute('aria-pressed',String(button.dataset.model===model));});
 $('#object-title').textContent=model==='cube'?'Cube':'Chair · 6 separate box parts';
 $('#preset-section').hidden=model!=='cube';$('#part-label').hidden=model!=='chair';
 for(const name of ['cube','chair'])if(objectGroups[name]){objectGroups[name].visible=edgeGroups[name].visible=name===model;}
 if(camera&&controls){controls.enabled=true;controls.target.copy(viewTargets[model]);camera.position.copy(views[model]);controls.update();}
 updateTransformPanel();
 const select=$('#part-select');select.replaceChildren(...MODELS.chair.map(part=>{const option=document.createElement('option');option.value=part.id;option.textContent=part.name;return option;}));select.value=state.listPart;
 renderEdgeList();state.fold=1;
 unwrap(model==='cube'?'Cube ready. Click an edge, then Mark Seam.':'Chair ready: six separate box parts, so at least six UV islands of very different sizes. Try Unfold.',null,true);
}

/* ------------------------------------------------------------------ *
 * Wiring: header, tools, UV editor, keys
 * ------------------------------------------------------------------ */
$('#mode-select').addEventListener('change',event=>setMode(event.target.value));
$$('[data-select-mode]').forEach(button=>button.addEventListener('click',()=>setSelectMode(button.dataset.selectMode)));
$$('[data-tool]').forEach(button=>button.addEventListener('click',()=>setTool(button.dataset.tool)));
$('#op-mark').addEventListener('click',()=>setSeams(true));
$('#op-clear').addEventListener('click',()=>setSeams(false));
$('#op-unwrap').addEventListener('click',()=>unwrap());
$('#stale-unwrap').addEventListener('click',()=>unwrap());
function setLive(on){state.live=on;updateHeader();message(on?'Live Unwrap on: the UV map updates every time a seam changes.':'Live Unwrap off: after changing seams, run U › Unwrap yourself — the classic Blender workflow.');if(on&&state.stale)unwrap('Live Unwrap on: the UV map is up to date again.');}
$('#live-unwrap').addEventListener('change',event=>setLive(event.target.checked));
$$('[data-stretch]').forEach(button=>button.addEventListener('click',()=>{
 state.stretch=button.dataset.stretch;$$('[data-stretch]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));renderMap();
 message(state.stretch==='none'?'Display Stretch off.':`Display Stretch · ${state.stretch==='angle'?'Angle: compares the shape of each face with the 3D face':'Area: compares how much texture each face receives'}. Blue = little distortion, red = a lot.`);
}));
$('#stretch-u').addEventListener('input',event=>{const chart=chartOf(state.activeFace);if(!chart)return;chart.stretchU=Number(event.target.value);packCharts(state.charts,{margin:.09});renderMap();message(`Scaled the island with ${faceLabel(state.activeFace)} to ${chart.stretchU.toFixed(2)}× in U. Now try Display Stretch › Angle and › Area.`);});
$('#reset-stretch').addEventListener('click',()=>{const chart=chartOf(state.activeFace);if(!chart)return;chart.stretchU=1;chart.stretchV=1;packCharts(state.charts,{margin:.09});renderMap();message('Island shape restored.');});
$$('[data-preset]').forEach(button=>button.addEventListener('click',()=>{state.cuts.cube.set('cube',new Set(PRESETS[button.dataset.preset]));deselectAll(true);state.touched=true;unwrap(`Starting layout: ${button.firstChild.textContent}.`);}));
$$('[data-model]').forEach(button=>button.addEventListener('click',()=>switchModel(button.dataset.model)));
$('#part-select').addEventListener('change',event=>{state.listPart=event.target.value;renderEdgeList();});
$('#animate').addEventListener('click',()=>animateTo(state.fold>.5?0:1));
$$('[data-scale-axis]').forEach(input=>input.addEventListener('change',()=>{const next=[...state.objScale[state.model]],v=Number(input.value);if(Number.isFinite(v)&&v>0)next[Number(input.dataset.scaleAxis)]=v;setObjectScale(next);}));
$$('[data-location-axis]').forEach(input=>input.addEventListener('change',()=>{const next=[...state.objLocation[state.model]],v=Number(input.value);if(Number.isFinite(v))next[Number(input.dataset.locationAxis)]=v;setObjectLocation(next);}));
$('#apply-scale').addEventListener('click',applyScale);
$('#scale-experiment').addEventListener('click',()=>{
 switchModel('cube');state.mesh.cube=structuredClone(MODELS.cube);buildModel('cube');state.objScale.cube=[2,1,1];placeEdges('cube');
 state.objLocation.cube=[0,0,0];placeObject('cube');
 state.cuts.cube.set('cube',new Set(PRESETS.classic));deselectAll(true);if(state.mode!=='edit')setMode('edit');
 $('#workspace').scrollIntoView({behavior:'smooth',block:'start'});updateTransformPanel();
 unwrap(null,null,true);
});
$('#fold').addEventListener('input',event=>{animation++;updateFold(Number(event.target.value)/100);});
$('#reset-object').addEventListener('click',resetObject);
$('#map-host').addEventListener('click',event=>{if(!event.target.closest('.uv-face,.uv-edge,.map-stale,.map-overlay')&&!event.shiftKey&&state.mode==='edit'&&hasSelection())deselectAll();});

for(const [id,area] of [['#uv-editor','uv'],['#viewport','view']]){
 const el=$(id);
 el.addEventListener('pointerenter',()=>{pointer.area=area;});
 el.addEventListener('pointerleave',()=>{if(pointer.area===area)pointer.area=null;});
}
$('#workspace').addEventListener('pointermove',event=>{pointer.x=event.clientX;pointer.y=event.clientY;});
$('#map-host').addEventListener('contextmenu',event=>{
 event.preventDefault();
 const edge=event.target.closest('.uv-edge')?.dataset.edge,face=event.target.closest('.uv-face')?.dataset.face;
 if(edge&&state.selectMode==='edge'&&!state.selEdges.has(edge))selectEdge(edge);
 if(face&&state.selectMode==='face'&&!state.selFaces.has(face))selectFace(face);
 openMenu(edge||(face&&state.selectMode==='face')?'context':'uv-context',event.clientX,event.clientY);
});

function typing(){const el=document.activeElement;return el&&(['INPUT','SELECT','TEXTAREA'].includes(el.tagName)&&el.type!=='checkbox'&&el.type!=='range');}
function frameView(selected=false){
 if(!camera||!controls||state.fold<.999)return;
 if(selected&&state.mode==='object'&&!state.objectSelected){message('Select the object before using Numpad .',true);return;}
 const center=blenderToWorld(state.objLocation[state.model]).add(new THREE.Vector3(0,targetY[state.model],0));
 const direction=camera.position.clone().sub(controls.target).normalize();
 const distance=state.model==='cube'?5.5:8.5;
 controls.target.copy(center);camera.position.copy(center).addScaledVector(direction,distance);controls.update();
 message(selected?'Framed selected object (Numpad .).':'Framed all objects (Home).');
}
function zoomView(inward){
 if(!camera||!controls||state.fold<.999)return;
 const offset=camera.position.clone().sub(controls.target),distance=offset.length();
 offset.setLength(THREE.MathUtils.clamp(distance*(inward?.8:1.25),controls.minDistance,controls.maxDistance));
 camera.position.copy(controls.target).add(offset);controls.update();
}
function orbitStep(code){
 if(!camera||!controls||state.fold<.999)return;
 const spherical=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
 const step=THREE.MathUtils.degToRad(15);
 if(code==='Numpad4')spherical.theta-=step;
 if(code==='Numpad6')spherical.theta+=step;
 if(code==='Numpad8')spherical.phi=Math.max(.05,spherical.phi-step);
 if(code==='Numpad2')spherical.phi=Math.min(Math.PI-.05,spherical.phi+step);
 camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));controls.update();
}
document.addEventListener('keydown',event=>{
 if(moveModal){moveModalKey(event);return;}
 if(scaleModal){scaleModalKey(event);return;}
 if(event.key==='Escape'){closeMenu();return;}
 if(typing())return;
 // Like Blender, shortcuts go to the editor under the mouse pointer.
 const inside=pointer.area||document.activeElement?.closest?.('#workspace');
 if(!inside)return;
 const key=event.key.toLowerCase(),ctrl=event.ctrlKey||event.metaKey;
 if(pointer.area==='view'&&!ctrl&&!event.altKey){
  if(['Numpad2','Numpad4','Numpad6','Numpad8'].includes(event.code)){event.preventDefault();orbitStep(event.code);return;}
  if(event.code==='NumpadAdd'||event.code==='NumpadSubtract'){event.preventDefault();zoomView(event.code==='NumpadAdd');return;}
  if(event.code==='NumpadDecimal'||event.key==='Home'){event.preventDefault();frameView(event.code==='NumpadDecimal');return;}
 }
 if(key==='tab'&&pointer.area&&!ctrl&&!event.altKey){event.preventDefault();setMode(state.mode==='edit'?'object':'edit');return;}
 if(ctrl&&key==='e'){event.preventDefault();openMenu('edge',pointer.x,pointer.y);return;}
 if(ctrl&&key==='p'&&pointer.area==='uv'){event.preventDefault();packIslands();return;}
 if(ctrl&&key==='a'&&pointer.area==='uv'){event.preventDefault();averageScale();return;}
 if(ctrl&&key==='a'&&state.mode==='object'){event.preventDefault();openMenu('apply',pointer.x,pointer.y);return;}
 if(ctrl)return;
 if(event.altKey&&key==='a'){event.preventDefault();deselectAll();return;}
 if(event.altKey&&key==='g'&&pointer.area==='view'&&state.mode==='object'){event.preventDefault();if(state.objectSelected)setObjectLocation([0,0,0]);return;}
 if(event.altKey)return;
 if(key==='u'){event.preventDefault();openMenu('uv',pointer.area?pointer.x:innerWidth/2,pointer.area?pointer.y:innerHeight/2);return;}
 if(key==='g'&&pointer.area==='view'){event.preventDefault();startMoveModal();return;}
 if(key==='s'&&pointer.area==='view'){event.preventDefault();startScaleModal();return;}
 if(key==='a'){event.preventDefault();selectAll();return;}
 if(key==='2'){setSelectMode('edge');return;}
 if(key==='3'){setSelectMode('face');return;}
 if(key==='1'){message('Vertex Select (1) is not used in this lab. Use Edge (2) or Face (3).');return;}
});

/* ------------------------------------------------------------------ *
 * 3D setup and picking
 * ------------------------------------------------------------------ */
function start3D(){
 try{
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0x2d3035,0);host.prepend(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','Interactive 3D object. Middle-drag to orbit, Shift-middle-drag to pan, wheel or Ctrl-middle-drag to zoom; left-click to select.');renderer.domElement.setAttribute('role','img');
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(42,1,.1,100);camera.position.copy(views.cube);
  scene.add(new THREE.AmbientLight(0xffffff,2.1));const light=new THREE.DirectionalLight(0xffffff,2.1);light.position.set(4,6,7);scene.add(light);
  controls=new OrbitControls(camera,renderer.domElement);controls.target.copy(viewTargets.cube);controls.enableDamping=true;controls.dampingFactor=.08;controls.enablePan=true;
  controls.enableZoom=true;controls.minDistance=.75;controls.maxDistance=80;controls.zoomSpeed=1.1;
  controls.mouseButtons={LEFT:-1,MIDDLE:THREE.MOUSE.ROTATE,RIGHT:-1};
  renderer.domElement.addEventListener('pointerdown',event=>{if(event.button===1)controls.mouseButtons.MIDDLE=event.ctrlKey?THREE.MOUSE.DOLLY:THREE.MOUSE.ROTATE;},true);
  renderer.domElement.style.touchAction=matchMedia('(max-width:900px)').matches?'pan-y':'none';
  controls.addEventListener('change',()=>{dirty=true;if(state.fold>=.999&&controls.enableRotate){views[state.model].copy(camera.position);viewTargets[state.model].copy(controls.target);}});
  controls.update();
  buildModel('cube');buildModel('chair');
  const raycaster=new THREE.Raycaster(),ndc=new THREE.Vector2();
  function pick(event){
   const rect=renderer.domElement.getBoundingClientRect();ndc.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(ndc,camera);
   const face=raycaster.intersectObjects(Object.values(faceMeshes[state.model]),false)[0];
   let edge=null;
   if(state.mode==='edit'&&state.selectMode==='edge'&&state.fold>.97){
    const hit=raycaster.intersectObjects(hitMeshes[state.model],false)[0];
    if(hit&&(!face||hit.distance<face.distance+(state.model==='cube'?.14:.07)*Math.max(...state.objScale[state.model])))edge=hit.object.userData.edge;
   }
   return {edge,face:face?.object.userData.face||null};
  }
  let down=null,hoverQueued=null;
  renderer.domElement.addEventListener('pointerdown',event=>{down={x:event.clientX,y:event.clientY,button:event.button};closeMenu();});
  renderer.domElement.addEventListener('pointermove',event=>{
   if(moveModal){movePreview(event.clientX,event.clientY);return;}
   if(down||event.pointerType==='touch')return;
   hoverQueued=event;requestAnimationFrame(()=>{if(!hoverQueued)return;const e=hoverQueued;hoverQueued=null;if(state.mode!=='edit'){setHoverEdge(null);setHoverFace(null);return;}const hit=pick(e);setHoverEdge(hit.edge);setHoverFace(state.selectMode==='face'?hit.face:null);});
  });
  renderer.domElement.addEventListener('pointerleave',()=>{hoverQueued=null;setHoverEdge(null);setHoverFace(null);});
  renderer.domElement.addEventListener('pointerup',event=>{
   if(moveModal){if(event.button===0)finishMove(true);else if(event.button===2)finishMove(false);down=null;return;}
   if(!down||down.button!==0||Math.hypot(event.clientX-down.x,event.clientY-down.y)>6){down=null;return;}down=null;
   const hit=pick(event);
   if(state.mode!=='edit'){
    if(hit.face){state.objectSelected=true;message('Object selected. The orange outline marks the active object. Press Tab to edit edges and faces.');}
    else{state.objectSelected=false;message('Nothing selected. Click the object to select it.',true);}
    updateHeader();updateTransformPanel();updateScene();return;
   }
   if(hit.edge){if(state.tool==='seam'&&!event.shiftKey)toggleSeam(hit.edge);else selectEdge(hit.edge,event.shiftKey);return;}
   if(hit.face){selectFace(hit.face,event.shiftKey);return;}
   if(!event.shiftKey&&hasSelection())deselectAll();
  });
  renderer.domElement.addEventListener('contextmenu',event=>{
   event.preventDefault();if(moveModal){finishMove(false);return;}if(state.mode!=='edit'){needEditMode();return;}
   const hit=pick(event);
   if(state.selectMode==='edge'&&hit.edge&&!state.selEdges.has(hit.edge))selectEdge(hit.edge);
   if(state.selectMode==='face'&&hit.face&&!state.selFaces.has(hit.face))selectFace(hit.face);
   openMenu('context',event.clientX,event.clientY);
  });
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();$('#canvas-hint').textContent='The 3D view paused. Reload this page to restore it.';$('#canvas-hint').hidden=false;});
  new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();dirty=true;}).observe(host);
  previewReady=true;$('#canvas-hint').hidden=true;
  updateTransformPanel();renderEdgeList();unwrap('Welcome! Click an edge on the cube, then Mark Seam. Red edges are seams.');
  function frame(){requestAnimationFrame(frame);if(document.hidden)return;controls.update();if(dirty){renderer.render(scene,camera);dirty=false;}}frame();
 }catch(error){
  previewReady=false;$('#canvas-hint').textContent='3D preview unavailable in this browser. The UV Editor, edge list and operators still work.';console.error('3D preview failed',error);
  renderEdgeList();unwrap();
 }
}
start3D();
