import { createMaxShell, rollout, spinner } from '../_max/max-shell.js';
import { icon } from '../_max/max-icons.js';
import { initialJoints, targetJoints, targetDepths, targetPoint, defaultWeights, paintWeight, solveLegIK } from './core.js';
import { createCatView } from './three-view.js';
import * as THREE from 'three';
import { jointPosition, jointDepthOf, moveSetupJoints, invalidateLegSetup, pinFootTarget, worldAxisToRig, addArmFromSetup, addLegFromSetup, collarboneStartPoint, removeLeg, hasLeg, hubMirror, mirrorEuler, rotateSpineSegment, bendSpine, resetSpine, ankleTip, ankleDirection, ankleLength, FOOT_PIVOT, parentMatrix, partSegment, baseId, targetVector } from './transform-frame.js';
import { rotateHierarchyFrames } from './rig-hierarchy.js';
import { transformable, chainBones, limbIsIK } from './rig-geometry.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const btn = (label, action, extra = '') => `<button type="button" class="mx-btn${extra.includes('on')?' on':''}" data-cat="${action}"${extra.includes('disabled')?' disabled':''}>${label}</button>`;
const row = (label, control) => `<div class="cat-panel-row"><label>${label}</label>${control}</div>`;
const spin = (id, value, min, max, step = 1, decimals = 0) => spinner({ id, value:+(+value).toFixed(decimals), min, max, step, decimals, width: 72 });
const SIDES = ['L','R'];
const sideOf = id => /([LR])(?:\d|~|$)/.exec(baseId(id))?.[1] || null;

// Etapes del lab, en l'ordre de la guia de construcció del rig CAT del curs.
const tasks = [
  { title:'01 · Escala i CATParent', text:'Abans de crear el rig, comprova l’escala: Customize › Units Setup en metres i una Box d’1 m al costat del model (aquí el personatge fa 1,79 m). A Create › Helpers › CAT Objects activa CATParent, deixa (None) a CATRig Load Save i fes clic i arrossega al terra, al centre del personatge. A Modify revisa el camp Name (per defecte CATRig, és el prefix de tots els ossos) i ajusta CATUnits Ratio abans de crear capes. Treballa en Setup Mode i amb Auto Key desactivat.', route:'Create › Helpers › CAT Objects › CATParent · CATRig Load Save › (None) · Modify › CATRig Parameters › Name (CATRig) · CATUnits Ratio.' },
  { title:'02 · Pelvis i cames', text:'Selecciona el CATParent i prem Create Pelvis. A Front centra la pelvis al pla de simetria; a Left n’ajustes l’alçada i la profunditat (Alt+X: malla transparent). Selecciona la pelvis i prem Add Leg. Col·loca els pivots de maluc, genoll i turmell a Front (F) i després a Left (L): un os centrat de front pot quedar fora del cos de perfil. Dona una lleu flexió cap endavant al genoll. Selecciona l’Ankle i posa Num Digits = 1 (1 os). Torna a la pelvis i fes Add Leg per a la segona cama.', route:'CATParent › Create Pelvis · Hub Setup › Add Leg (×2) · Setup Mode: pivots a Front i Left · Ankle Setup › Num Digits: 1.' },
  { title:'03 · Columna i braç', text:'Selecciona la pelvis i prem Add Spine. Selecciona un os de la columna i deixa Bones = 3. Situa el hub superior dins de la caixa toràcica i anomena’l Chest (Hub Setup › Name). Des de Chest fes Add Arm. Situa la clavícula entre el tòrax i l’espatlla, el pivot del braç a l’articulació de l’espatlla, el colze al centre de l’articulació amb una lleu flexió cap enrere i el canell a l’inici de la mà (la profunditat del braç es veu millor a Top, T). Recorda que Width i Depth només canvien el gruix: el pivot és el centre de gir.', route:'Pelvis › Add Spine · Spine Setup › Bones: 3 · Hub Setup › Name: Chest · Chest › Add Arm · Front + Left.' },
  { title:'04 · Segments i Up Nodes', text:'Selecciona l’avantbraç i posa Segments = 3 al Bone Setup: els trams reparteixen la torsió entre colze i canell. Al tram inferior de cada cama posa Segments = 2. A Limb Setup activa Use Up Node a cada extremitat. Mou l’Up Node del colze cap enrere i el del genoll cap endavant, en Local. Al Scene Explorer veuràs Arm21–23 i Leg21–22.', route:'Bone Setup › Segments (avantbraç 3 · cama 2) · Limb Setup › Up Vector › Use Up Node · Move: colze enrere, genoll endavant.' },
  { title:'05 · Mans, IK i segon braç', text:'Selecciona Palm i posa Num Digits = 5; a cada Digit deixa Bones = 3 i ajusta els pivots als artells (el polze té un pla de flexió propi). Amb Palm seleccionat, a Motion › Limb Animation prem Create IK Target; selecciona el target i a Modify canvia Cross per Platform. A Motion › Digit Manager selecciona els cinc dígits i mou Curl per comprovar el tancament. Després selecciona Chest i prem Add Arm: el segon braç copia el primer. Crea també el seu IK Target.', route:'Palm Setup › Num Digits: 5 · Digit Setup › Bones: 3 · Motion › Create IK Target · IK Target › Display: Platform · Digit Manager › Curl · Chest › Add Arm.' },
  { title:'06 · Coll i cap', text:'Selecciona Chest i prem Add Spine per crear la cadena del coll i el cap. Al fitxer aportat el coll té 2 ossos. Situa la base a l’inici anatòmic del coll i el pivot del cap prop de la base del crani; revisa-ho a Left. Al Scene Explorer els noms Spine1 es repeteixen al tronc i al coll: distingeix-los per la jerarquia.', route:'Chest › Add Spine · Spine Setup › Bones: 2 · pivot del cap a la base del crani (Left).' },
  { title:'07 · Gizmos de control', text:'En Setup Mode selecciona una peça CAT i fes clic dret › Add Gizmo; tria la forma a la biblioteca (Circle, Rectangle, NGon, Torus…) i ajusta’n el radi perquè sobresurti de la malla. Afegeix un anell a la pelvis, un rectangle al tòrax, anells separats al coll i al cap, i controls a braços, cames i falanges. Converteix un gizmo a Editable Spline i, al subobjecte Spline, canvia’n la forma sense moure l’os.', route:'Setup Mode › clic dret › Add Gizmo · Gizmos.max › forma · Radius · clic dret › Convert To › Editable Spline › Spline.' },
  { title:'08 · Proves i repòs', text:'Amb una peça CAT seleccionada, obre Motion › Layer Manager i crea una capa Absolute. Activa Animation Mode i prova amb moviments petits: la plataforma d’un peu (el genoll ha de flexionar cap endavant), el target d’una mà (el colze ha d’anar cap enrere) i la pelvis. Si no pots seleccionar un gizmo, canvia el filtre CATBone a All. Després torna a Setup Mode: el rig recupera la pose de repòs.', route:'Motion › Layer Manager › Add Absolute Layer · Animation Mode · mou plataforma, IK Target i pelvis · Setup Mode.' },
  { title:'09 · Extra: Skin', text:'Quan el rig estigui acabat, torna el Selection Filter a All, selecciona la malla i aplica Skin. Amb Add Bones incorpora només els ossos deformadors: exclou plataformes, IK Targets, Up Nodes i gizmos. A Advanced Parameters posa Bone Affect Limit a 3. Activa Edit Envelopes i ajusta els pesos del braç.', route:'Modify › Skin › Parameters › Add Bones · Advanced Parameters › Bone Affect Limit: 3 · Edit Envelopes.' },
];
const POSE_KEYS = ['joints','jointDepths','partRotations','ankleRotations','footOffsets','footDigitRotations','footDigitOffsets','spineSegs','spineBase','armSetupLengths','footTargets','pinnedFootTargets','legIKLengths','legIKRest','armIKLengths','armIKRest','footRotations','footScales','ikTargets','ikRotations','upNodes','parentTransform'];
const S = {
  stage:0, selected:'mesh', preset:'none', objectClass:'Standard', armed:false, root:false, pelvis:false, legs:0, spine:false, arms:0, head:false, rigName:'CATRig', transformTool:'move', linkTab:'2', paintBlend:false,
  tail:false, extra:false, joints:structuredClone(initialJoints), pelvisDepth:0, depthOffsets:{}, partRotations:{}, jointDepths:{}, footTargets:{}, pinnedFootTargets:{}, legIKLengths:{}, legIKRest:{}, armIKLengths:{}, armIKRest:{}, footRotations:{}, footScales:{}, parentTransform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}, mirror:true, catScale:1, lengthAxis:'X', trackDisplay:'Active Layer',
  skin:false, skinBones:new Set(), envelopes:false, vertices:false, selectedVertex:null, selectedBone:'upperArmL',
  weights:[...defaultWeights], blendWeights:Array(defaultWeights.length).fill(0), paint:false, paintValue:.5, handDigits:0, footDigits:0, digitBoneCounts:[2,2,2,2,2], footDigitBones:2, collarbone:true, palm:true,
  segmentsById:{}, spineBones:5, headBones:5, ankleSizes:{}, boneWidth:.05, boneDepth:.05, boneSizes:{}, hubSizes:{}, hubColors:{}, customHubMeshes:{}, baseRadius:.95,
  upNodes:{}, armSetupLengths:{}, ikTargets:{}, ikRotations:{}, ankleRotations:{}, footOffsets:{}, footDigitRotations:{}, footDigitOffsets:{}, spineSegs:{}, spineBase:{}, targetDisplay:{}, targetSize:{}, ikfk:{legL:0,legR:0,armL:1,armR:1}, fkDisplay:{}, ikBones:{}, retarget:{},
  digitPoses:{L:{},R:{}}, digitSel:[true,true,true,true,true], digitPreset:'<..>',
  gizmos:new Set(), gizmoSettings:{}, splineSub:false,
  boneAffectLimit:20, stretchById:{armL:true,armR:true,legL:true,legR:true}, absLayers:[], activeLayer:null, locksById:{}, renames:{}, filter:'All', coord:'View', mode:'Setup', setupPose:null, animLengths:null, tested:new Set(), restored:false,
  view:'Perspective', wire:false, reference:null, objName:null, message:'',
};
let max, cat3d, hubClipboard=null, limbClipboard=null;
const root = $('max-app');
const undoStack=[],redoStack=[];
const cloneState=()=>structuredClone(S);
function pushUndo(){undoStack.push(cloneState());if(undoStack.length>40)undoStack.shift();redoStack.length=0;}
function restoreState(snapshot){const viewSettings={coord:S.coord,view:S.view,transformTool:S.transformTool,wire:S.wire};Object.assign(S,snapshot,viewSettings);sync();}
function undo(){if(!undoStack.length){tell('No hi ha cap acció per desfer.');return;}redoStack.push(cloneState());restoreState(undoStack.pop());tell('Acció desfeta amb Ctrl+Z.');}
function redo(){if(!redoStack.length){tell('No hi ha cap acció per refer.');return;}undoStack.push(cloneState());restoreState(redoStack.pop());tell('Acció refeta amb Ctrl+Y.');}

// ── Names, as CAT builds them: CATRig Name (prefix) + short name, without separator ──
const hubSize = id => S.hubSizes[id] || {length:25,width:20,height:10};
const hubColor = id => S.hubColors[id] || (id==='pelvis'?'#e2d593':id==='head'?'#d9b5d0':'#e9b4d3');
const segmentsOf = id => Math.max(1,S.segmentsById[id]||1);
function shortName(id){
  if(S.renames[id])return S.renames[id];
  const [base,piece]=id.split('~'),k=+(piece||1),side=sideOf(base);
  const m=/^(\w+?)([LR])(\d?)$/.exec(base),part=m?.[1];
  if(base==='pelvis')return 'Hub001';if(base==='ribcage')return 'Hub002';if(base==='head')return 'Hub003';
  if(base==='spine'||base==='neck')return `Spine${k}`;
  if(base==='tail')return 'Tail1';if(base==='extra')return 'Bone001';
  const seg=(n,id2)=>segmentsOf(id2)>1?`${n}${k}`:n;
  switch(part){
    case 'arm':return `${side}ArmCollarbone`;case 'upperArm':return `${side}Arm${seg(1,base)}`;case 'forearm':return `${side}Arm${seg(2,base)}`;
    case 'palm':return `${side}ArmPalm`;case 'ik':return `${side}ArmIKTarget`;case 'armUp':return `${side}ArmUpVectorNode`;
    case 'thigh':return `${side}Leg${seg(1,base)}`;case 'shin':return `${side}Leg${seg(2,base)}`;case 'ankle':return `${side}LegAnkle`;
    case 'foot':return `${side}LegPlatform`;case 'legUp':return `${side}LegUpVectorNode`;case 'footDigit':return `${side}LegDigit${+m[3]+1}${k}`;
    case 'handDigit':return `${side}ArmDigit${+m[3]+1}${k}`;
  }
  return id;
}
const fullName = id => id==='mesh'?(S.objName||'Character_Mesh'):id==='catparent'?S.rigName:id.startsWith('gizmo:')?`${(S.gizmoSettings[id.slice(6)]?.shape)||'Circle'}_${fullName(id.slice(6))}`:S.rigName+shortName(id);
const listObjects = () => {
  const a=[], add=(id,kind,parent,color)=>a.push({id,name:fullName(id),kind,parent,color});
  add('mesh','Geometry',undefined,'#969e9f');
  if(!S.root)return a;
  add('catparent','Helper',undefined,'#80d5ac');
  if(!S.pelvis)return a;
  add('pelvis','Bone',undefined,hubColor('pelvis'));
  const chain=(id,count,parent,color)=>{let last=parent;for(let k=1;k<=count;k++){const piece=k===1?id:`${id}~${k}`;add(piece,'Bone',last,color);last=piece;}return last;};
  for(const side of SIDES) if(hasLeg(S,side)){
    const thigh=chain(`thigh${side}`,segmentsOf(`thigh${side}`),'pelvis',side==='L'?'#9b5fd8':'#e1a64b');
    const shin=chain(`shin${side}`,segmentsOf(`shin${side}`),thigh,side==='L'?'#9b5fd8':'#e1a64b');
    add(`ankle${side}`,'Bone',shin,'#e16b69');
    for(let d=0;d<S.footDigits;d++)chain(`footDigit${side}${d}`,Math.max(1,S.footDigitBones),`ankle${side}`,'#9acfe0');
    add(`foot${side}`,'Helper',undefined,'#e0679f');
    if(S.upNodes[`leg${side}`])add(`legUp${side}`,'Helper',undefined,'#a5d4e5');
  }
  if(S.spine){const top=chain('spine',S.spineBones,'pelvis','#e5c9dd');add('ribcage','Bone',top,hubColor('ribcage'));}
  for(const side of SIDES) if(S.arms>=(side==='L'?1:2)){
    const color=side==='L'?'#e0679f':'#6aa6e0';
    let parent='ribcage';
    if(S.collarbone!==false){add(`arm${side}`,'Bone','ribcage',color);parent=`arm${side}`;}
    const upper=chain(`upperArm${side}`,segmentsOf(`upperArm${side}`),parent,color);
    const fore=chain(`forearm${side}`,segmentsOf(`forearm${side}`),upper,color);
    add(`palm${side}`,'Bone',fore,color);
    for(let i=0;i<S.handDigits;i++)chain(`handDigit${side}${i}`,Math.max(1,S.digitBoneCounts[i]||1),`palm${side}`,'#ddbedb');
    if(S.ikTargets[side])add(`ik${side}`,'Helper',undefined,'#e8d7ef');
    if(S.upNodes[`arm${side}`])add(`armUp${side}`,'Helper',undefined,'#e7c9de');
  }
  if(S.head){const top=chain('neck',S.headBones,'ribcage','#e7bfda');add('head','Bone',top,hubColor('head'));}
  if(S.tail)add('tail','Bone','pelvis','#d07ebc');
  if(S.extra)add('extra','Bone',S.head?'head':'pelvis','#d07ebc');
  const ids=new Set(a.map(o=>o.id));
  for(const id of S.gizmos)if(ids.has(id))add(`gizmo:${id}`,'Shape',id,'#5cf08f');
  return a;
};
const has = id => listObjects().some(o => o.id === id);
const kindOf = id => listObjects().find(o=>o.id===id)?.kind;
function select(id, tab) {
  if (id && !has(id)) return;
  if(S.filter==='CATBone'&&id&&kindOf(id)!=='Bone'){tell('El filtre de selecció CATBone només deixa seleccionar ossos CAT. Canvia’l a All per seleccionar gizmos, plataformes o la malla.');return;}
  host3dMenu();
  S.selected = id; S.splineSub=false;
  max.select(id);
  if (tab) max.showTab(tab); else max.showTab(max.state.tab);
  draw();
}
const host3dMenu=()=>root.querySelector('.cat-context-menu')?.remove();
function tell(message) { S.message = message; max.prompt(message); renderTask(); }
function sync() {
  if (S.selected && !has(S.selected)) S.selected = 'mesh';
  const coordinates=$('cat-refcoord');if(coordinates)coordinates.value=S.coord;
  max.setModes({tool:S.transformTool,silent:true});
  max.setObjects(listObjects(), S.selected);
  max.showTab(max.state.tab);
  draw();
  renderTask();
}

// ── Checks against the practice mesh ──
const worldJoint = name => jointPosition(S,name).applyMatrix4(parentMatrix(S));
function jointCheck(name){const t=targetPoint(name),p=worldJoint(name);return {name,front:Math.hypot(p.x-t[0],p.y-t[1]),depth:Math.abs(p.z-t[2]),dz:p.z-t[2]};}
const TOL=.05;
const aligned = names => names.every(name=>{const c=jointCheck(name);return c.front<=TOL&&c.depth<=TOL;});
// Knee bends forward (+Z) and elbow backwards (−Z) of the straight line between its neighbours.
function bendOf(a,b,c){const A=worldJoint(a),B=worldJoint(b),C=worldJoint(c),t=Math.max(0,Math.min(1,(B.clone().sub(A)).dot(C.clone().sub(A))/Math.max(1e-6,C.distanceToSquared(A))));return B.z-A.clone().lerp(C,t).z;}
const kneeBent = side => bendOf(`hip${side}`,`knee${side}`,`ankle${side}`)>.006;
const elbowBent = side => bendOf(`shoulder${side}`,`elbow${side}`,`wrist${side}`)< -.006;
const armSides = () => SIDES.filter(side=>S.arms>=(side==='L'?1:2));
const upOk = (limb) => {const up=S.upNodes[limb];if(!up)return false;const side=limb.at(-1),joint=limb.startsWith('leg')?`knee${side}`:`elbow${side}`;const z=targetVector(up).z-jointPosition(S,joint).z;return limb.startsWith('leg')?z>.1:z< -.1;};
const LIMB_GIZMO = { armL:/^(arm|upperArm|forearm|palm)L/, armR:/^(arm|upperArm|forearm|palm)R/, legL:/^(thigh|shin|ankle)L/, legR:/^(thigh|shin|ankle)R/ };
function stageChecks(i=S.stage){
  const g=[...S.gizmos];
  return [
    [['CATParent creat amb (None)',S.root&&S.preset==='none'],['Base al centre (0,0,0)',S.root&&Math.hypot(...S.parentTransform.position)<.05]],
    [['Pelvis creada',S.pelvis],['Dues cames',S.legs===2],['Ankle amb 1 digit d’1 os',S.footDigits>=1&&S.footDigitBones===1],['Genolls flexionats cap endavant',S.legs===2&&kneeBent('L')&&kneeBent('R')],['Pivots de pelvis, maluc, genoll i turmell a Front i Left',S.legs===2&&aligned(['pelvis','hipL','kneeL','ankleL','hipR','kneeR','ankleR'])]],
    [['Columna amb 3 ossos',S.spine&&S.spineBones===3],['Hub superior anomenat Chest',/^chest$/i.test(S.renames.ribcage||'')],['Braç creat des de Chest',S.arms>=1],['Colze lleugerament flexionat cap enrere',S.arms>=1&&elbowBent('L')],['Pivots de Chest, espatlla, colze i canell',S.arms>=1&&aligned(['chest','shoulderL','elbowL','wristL'])]],
    [['Avantbraç amb 3 segments',S.arms>=1&&armSides().every(side=>segmentsOf(`forearm${side}`)===3)],['Tram inferior de les cames amb 2 segments',S.legs===2&&SIDES.every(side=>segmentsOf(`shin${side}`)===2)],['Up Nodes de les cames davant del genoll',S.legs===2&&upOk('legL')&&upOk('legR')],['Up Node del colze darrere del braç',S.arms>=1&&armSides().every(side=>upOk(`arm${side}`))]],
    [['5 dígits amb 3 ossos',S.handDigits===5&&S.digitBoneCounts.every(n=>n===3)],['Curl provat al Digit Manager',S.tested.has('curl')],['Segon braç (Chest › Add Arm)',S.arms===2],['IK Target a cada mà amb Display Platform',S.arms===2&&SIDES.every(side=>S.ikTargets[side]&&S.targetDisplay[`ik${side}`]==='platform')]],
    [['Coll i cap creats des de Chest',S.head],['Coll amb 2 ossos',S.head&&S.headBones===2],['Pivot del cap a la base del crani',S.head&&aligned(['head'])]],
    [['Gizmos a pelvis, Chest i cap',['pelvis','ribcage','head'].every(id=>S.gizmos.has(id))],['Gizmo al coll',g.some(id=>baseId(id)==='neck')],['Gizmos a braços i cames',Object.values(LIMB_GIZMO).every(re=>g.some(id=>re.test(id)))],['Gizmos a les falanges',g.some(id=>id.startsWith('handDigit'))],['Un gizmo convertit a Editable Spline',g.some(id=>S.gizmoSettings[id]?.editable)]],
    [['Capa Absolute creada',S.absLayers.length>=1],['Plataforma del peu provada en Animation Mode',S.tested.has('foot')],['IK Target de la mà provat',S.tested.has('ik')],['Pelvis provada',S.tested.has('pelvis')],['Tornada a Setup Mode (repòs)',S.restored&&S.mode==='Setup']],
    [['Skin aplicat a la malla',S.skin],['Només ossos deformadors a Skin',S.skinBones.size>0&&[...S.skinBones].every(id=>kindOf(id)==='Bone')],['Bone Affect Limit: 3',S.boneAffectLimit===3]],
  ][i];
}
const stageDone=(i=S.stage)=>stageChecks(i).every(([,ok])=>ok);
const PIVOTS=[[],['pelvis','hipL','kneeL','ankleL','hipR','kneeR','ankleR'],['chest','shoulderL','elbowL','wristL'],[],[],['head'],[],[],[]];
const JOINT_LABEL={pelvis:'Pelvis',chest:'Chest',head:'Cap',hipL:'Maluc L',kneeL:'Genoll L',ankleL:'Turmell L',hipR:'Maluc R',kneeR:'Genoll R',ankleR:'Turmell R',shoulderL:'Espatlla L',elbowL:'Colze L',wristL:'Canell L'};
function pivotReport(){
  const names=PIVOTS[S.stage].filter(name=>{if(/^(hip|knee|ankle)[LR]$/.test(name))return hasLeg(S,name.at(-1));if(/^(shoulder|elbow|wrist)/.test(name))return S.arms>=1;if(name==='chest')return S.spine;if(name==='head')return S.head;return S.pelvis;});
  if(!names.length)return '';
  return `<div class="cat-pivots"><span class="control-label">PIVOTS · FRONT / LEFT</span><ul>${names.map(name=>{const c=jointCheck(name),ok=c.front<=TOL,deep=c.depth<=TOL;return `<li class="${ok&&deep?'ok':''}"><b>${JOINT_LABEL[name]}</b><span class="${ok?'ok':''}">Front ${ok?'✓':`${Math.round(c.front*100)} cm`}</span><span class="${deep?'ok':''}">Left ${deep?'✓':`${Math.round(c.depth*100)} cm ${c.dz>0?'massa endavant':'massa enrere'}`}</span></li>`;}).join('')}</ul></div>`;
}
function renderTask() {
  $('steps').innerHTML = tasks.map((task,i) => `<button type="button" data-stage="${i}" class="${i===S.stage?'active':''}${stageDone(i)?' done':''}" aria-current="${i===S.stage?'step':'false'}"><small>${String(i+1).padStart(2,'0')} / CAT RIG</small>${task.title.slice(5)}</button>`).join('');
  const t=tasks[S.stage],done=stageDone(),card=$('task-card');
  card.classList.toggle('done',done);
  card.innerHTML=`<div class="task-intro"><span class="control-label">ETAPA ${S.stage+1} DE ${tasks.length}</span><h2>${esc(t.title)}</h2><p>${esc(t.text)}</p>${S.message?`<p class="task-message">${esc(S.message)}</p>`:''}</div>
    <div class="task-how"><span class="control-label">COM, A 3DS MAX</span><ol>${t.route.split(' · ').map(part=>`<li>${esc(part)}</li>`).join('')}</ol><span class="control-label">COMPROVACIONS</span><ul class="cat-checks">${stageChecks().map(([label,ok])=>`<li class="${ok?'ok':''}">${ok?'✓':'○'} ${esc(label)}</li>`).join('')}</ul>${pivotReport()}</div>
    <div class="step-actions"><span class="step-state">${done?'✓ Pas complet':'Encara pendent'}</span>${done&&S.stage<tasks.length-1?'<button type="button" class="exp-button" data-lab="next">Pas següent →</button>':''}<button type="button" class="mini-link" data-lab="solution">Mostra una solució</button><button type="button" class="mini-link" data-lab="reset">Reinicia el lab</button></div>`;
}

// ── Command Panel pages ──
function presetList() { return `<div class="cat-preset-list">${[['none','"(None)"'],['dots','&lt;..&gt;'],['human','Base Human']].map(([id,label])=>`<button type="button" data-cat="preset:${id}" class="${S.preset===id?'on':''}"${id==='dots'?' disabled':''}>${label}</button>`).join('')}</div>`; }
function catParameters() { return rollout('CATRig Parameters', `${row('Name', `<input class="mx-text" id="cat-name" value="${esc(S.rigName)}" aria-label="CATRig Name">`)}${row('CATUnits Ratio', S.absLayers.length?'<span>Locked by animation layer</span>':spin('cat-scale',S.catScale,.5,2,.05,2))}<fieldset class="cat-fieldset"><legend>Track Display</legend>${['Active Layer','Contributing Layers','All Layers'].map(name=>`<label class="mx-check"><input type="radio" name="cat-track" value="${name}" ${S.trackDisplay===name?'checked':''}> ${name}</label>`).join('')}</fieldset><fieldset class="cat-fieldset"><legend>Bone Length Axis</legend><div class="cat-lock-axes">${['X','Z'].map(axis=>`<label><input type="radio" name="cat-axis" value="${axis}" ${S.lengthAxis===axis?'checked':''} ${S.absLayers.length?'disabled':''}> ${axis} Axis</label>`).join('')}</div></fieldset>${btn('Motion Extraction Node','motion-extraction')}<p class="cat-panel-note">Ajusta CATUnits Ratio abans de crear capes d’animació: després queda bloquejat.</p>`,true); }
function createPage() {
  return `<div class="mx-cats">${['catGeometry','catShapes','catLights','catCameras','catHelpers','catSpaceWarps','catSystems'].map((name,i)=>`<button type="button" class="mx-cat${i===4?' on':''}" title="${['Geometry','Shapes','Lights','Cameras','Helpers','Space Warps','Systems'][i]}" aria-label="${['Geometry','Shapes','Lights','Cameras','Helpers','Space Warps','Systems'][i]}">${icon(name)}</button>`).join('')}</div><select class="mx-combo cat-native-select" id="cat-object-class" aria-label="Categoria d'objectes">${['Standard','Atmospheric Apparatus','Camera Match','Assembly Heads','Manipulators','Particle Flow','MassFX','CAT Objects','VRML97'].map(x=>`<option${S.objectClass===x?' selected':''}>${x}</option>`).join('')}</select>${S.objectClass==='CAT Objects'?`${rollout('Object Type', `<label class="mx-check dim"><input type="checkbox" disabled> AutoGrid</label><div class="cat-panel-grid">${btn('CATParent','arm',S.armed?' on':'')}${btn('CATMuscle','muscle-info')}${btn('Muscle Strand','muscle-info')}</div>`)}${rollout('CATRig Load Save', `${presetList()}<p class="cat-panel-note">Tria (None) per construir el rig peça a peça i fes clic i arrossega al terra per crear la base.</p>`)}${catParameters()}`:`<p class="cat-panel-note">Selecciona CAT Objects per crear un CATParent.</p>`}`;
}
function modifierHead(name) { return `<div class="cat-panel-section"><select class="mx-combo cat-native-select" id="cat-modifier-list" aria-label="Modifier List"><option value="">Modifier List</option><option value="Skin">Skin</option><option value="Edit Poly">Edit Poly</option><option value="TurboSmooth">TurboSmooth</option></select><div class="cat-panel-stack">${S.skin?'<button type="button" class="on" data-cat="select-skin">▸ Skin</button><div class="sub">▸ Envelope</div>':''}<button type="button">▸ ${esc(name)}</button></div></div>`; }
const stack = label => `<div class="cat-panel-section"><div class="cat-panel-stack"><button type="button" class="on">${esc(label)}</button></div></div>`;
function skinPage() {
  const bones=[...S.skinBones], selectedVertex=S.selectedVertex;
  return `${modifierHead(S.objName||'Editable Poly')}${S.skin?`${rollout('Parameters', `
    <div class="cat-skin-main">${btn(S.envelopes?'Edit Envelopes ✓':'Edit Envelopes','envelopes',S.envelopes?' on':'')}</div>
    <fieldset class="cat-fieldset"><legend>Select</legend><label class="mx-check"><input id="cat-vertices" type="checkbox" ${S.vertices?'checked':''}> Vertices</label><label class="mx-check"><input type="checkbox" checked disabled> Envelopes</label><label class="mx-check"><input type="checkbox" checked disabled> Cross Sections</label></fieldset>
    <div class="cat-panel-row"><span>Bones:</span>${btn('Add','add-bones')}${btn('Remove','remove-bone',bones.length?'':' disabled')}</div><div class="cat-panel-list cat-bones-list">${bones.length?bones.map(id=>`<button type="button" data-cat="bone:${id}" class="${S.selectedBone===id?'on':''}">${esc(fullName(id))}</button>`).join(''):'No bones assigned'}</div>`)}
    ${rollout('Weight Properties', `${row('Abs. Effect',spin('cat-effect',selectedVertex==null?0:S.weights[selectedVertex],0,1,.05,2))}<div class="cat-panel-grid">${btn('Weight Tool','weight-tool')}${btn('Weight Table','weight-table')}${btn('Paint Weights','paint-toggle',S.paint?' on':'')}</div>${row('Paint Value',spin('cat-paint-value',S.paintValue,0,1,.05,2))}<label class="mx-check"><input id="cat-paint-blend" type="checkbox" ${S.paintBlend?'checked':''}> Paint Blend Weights</label><p class="cat-panel-note">${S.paintBlend?'Pintes la barreja Dual Quaternion.':'Selecciona un os de la llista i pinta els pesos de Skin.'} Vermell = més influència.</p>`)}
    ${rollout('Mirror Parameters', btn(S.mirror?'Mirror Mode ✓':'Mirror Mode','mirror',S.mirror?' on':''),false)}
    ${rollout('Advanced Parameters', `${row('Bone Affect Limit',spin('cat-affect-limit',S.boneAffectLimit,1,20))}`,false)}`:'<p class="cat-panel-note">Modifier List › Skin per lligar la malla als ossos CAT.</p>'}`;
}
function parentPage() { return `${stack('CAT Object')}${catParameters()}${rollout('CATRig Load Save', `${presetList()}<div class="cat-panel-grid">${btn('Open Preset Rig','preset-open')}${btn('Save Preset Rig','preset-save')}</div>${!S.pelvis?btn('Create Pelvis','create-pelvis'):btn('Reload','reload')}<p class="cat-panel-note">Els presets reals es desen com a fitxers RG3.</p>`)}${rollout('Add Rigging', `<p class="cat-panel-note">Inclou malla, props i altres objectes al preset del rig.</p>${btn('Add Rigging...','rigging-info')}`,false)}`; }
const nameField = (id, label='Name') => row(label,`<input class="mx-text cat-rename" value="${esc(shortName(id))}" aria-label="Short name" data-rename="${esc(id)}">`);
const clipButtons = (prefix, title) => `<div class="cat-hub-clipboard"><button type="button" data-cat="${prefix}-copy" title="Copy ${title}" aria-label="Copy ${title}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h11v14H4zM8 7h11v14H8zM10 10h7m-7 3h7m-7 3h5"/></svg></button><button type="button" data-cat="${prefix}-paste" title="Paste ${title}" aria-label="Paste ${title}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10l2 3v14H5V7zM9 3h6v3H9zM8 10h8m-8 3h8m-8 3h6"/></svg></button><button type="button" data-cat="${prefix}-paste-mirror" title="Paste ${title} Mirrored" aria-label="Paste ${title} Mirrored"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l2 2v16H5zM12 3v18M8 9l-2 3 2 3m8-6 2 3-2 3"/></svg></button></div>`;
function hubPage(id) {
  const size=hubSize(id);
  return `${stack('Object')}${rollout('Hub Setup', `<div class="cat-hub-setup">
    <div class="cat-hub-name"><label for="cat-hub-name">Name</label><div><input id="cat-hub-name" class="mx-text cat-rename" data-rename="${id}" value="${esc(shortName(id))}" aria-label="Rename selected hub"><input id="cat-hub-color" type="color" value="${hubColor(id)}" aria-label="Hub color" title="Hub color"></div></div>
    ${clipButtons('hub','Hub Setup')}
    <label class="cat-hub-custom"><input id="cat-hub-custom" type="checkbox" ${S.customHubMeshes[id]?'checked':''}> Use Custom Mesh</label>
    <div class="cat-hub-dimensions"><div><label for="cat-hub-length">Length :</label>${spin('cat-hub-length',size.length,1,100,.5,1)}</div><div><label for="cat-hub-width">Width :</label>${spin('cat-hub-width',size.width,1,100,.5,1)}</div><div><label for="cat-hub-height">Height :</label>${spin('cat-hub-height',size.height,1,100,.5,1)}</div></div>
    <div class="cat-hub-actions">${btn('Add Leg','add-leg')}${btn('Add Arm','add-arm')}${btn('Add Spine','add-spine')}${btn('Add Tail','add-tail')}${btn('Add Bone','add-extra')}${btn('Add Rigging','rigging-info')}</div>
  </div>`)}`;
}
function spinePage(id) {
  const neck=baseId(id)==='neck';
  return `${stack('Object')}${rollout('Spine Setup',`${nameField(id)}${row('Bones',spin('cat-spine-bones',neck?S.headBones:S.spineBones,1,10))}<p class="cat-panel-note">${neck?'A la guia del curs el coll té 2 ossos.':'La guia del curs utilitza 3 ossos de columna.'} La cadena connecta ${neck?'Chest amb el hub del cap':'la pelvis amb el hub superior'}.</p>`)}${rollout('Bone Setup',`${boneSizeRows(baseId(id))}`,false)}`;
}
const LIMB_OF = id => { const m=/^(arm|upperArm|forearm|palm|thigh|shin|ankle)([LR])$/.exec(baseId(id)); if(!m)return null; return {limb:`${['thigh','shin','ankle'].includes(m[1])?'leg':'arm'}${m[2]}`,part:m[1],side:m[2]}; };
function boneLength(base){const seg=partSegment(base);if(!seg)return 0;if(base.startsWith('arm'))return 0;return jointPosition(S,seg[0]).distanceTo(jointPosition(S,seg[1]));}
function boneSizeRows(base){const size=S.boneSizes[base]||{};const def=chainDefault(base);return `${row('Width',spin('cat-bone-width',(size.width??def.width)*100,1,25,.1,2))}${row('Depth',spin('cat-bone-depth',(size.depth??def.depth)*100,1,25,.1,2))}`;}
function chainDefault(base){if(base==='spine')return {width:.085,depth:.09};if(base==='neck')return {width:.06,depth:.06};if(/^thigh/.test(base))return {width:.1,depth:.1};if(/^shin/.test(base))return {width:.085,depth:.085};if(/^arm[LR]$/.test(base))return {width:.045,depth:.04};return {width:S.boneWidth,depth:S.boneDepth};}
function limbPage(id) {
  const info=LIMB_OF(id),base=baseId(id),isArm=info.limb.startsWith('arm'),useUp=!!S.upNodes[info.limb];
  const collar=info.part==='arm',length=boneLength(base);
  return `${stack('Object')}${rollout('Limb Setup', `${row('Name',`<input class="mx-text" value="${info.side}${isArm?'Arm':'Leg'}" aria-label="Limb name" readonly>`)}${clipButtons('limb','Limb Settings')}<div class="cat-lmr">${['L','M','R'].map(x=>`<label><input type="radio" disabled ${x===info.side?'checked':''}> ${x}</label>`).join('')}</div><label class="mx-check"><input id="cat-collar" type="checkbox" ${isArm&&S.collarbone!==false?'checked':''} ${isArm?'':'disabled'}> Collarbone</label><label class="mx-check"><input id="cat-palm" type="checkbox" ${S.palm!==false?'checked':''}> ${isArm?'Palm':'Ankle'}</label>${row('Bones:','<span class="cat-readout">2</span>')}<fieldset class="cat-fieldset"><legend>Up Vector</legend>${btn(useUp?'Use Up Node ✓':'Use Up Node','up-node',useUp?' on':'')}</fieldset><p class="cat-panel-note">${isArm?'L’Up Node del colze va darrere del braç.':'L’Up Node del genoll va davant de la cama.'} Orienta el pla de flexió.</p>`)}
  ${rollout('Bone Setup', `${row('Name',`<input class="mx-text cat-rename" data-rename="${esc(base)}" value="${esc(collar?'Collarbone':shortName(base).replace(/^[LR](Arm|Leg)/,''))}" aria-label="Bone name">`)}${clipButtons('bone','Bone Setup')}<label class="mx-check"><input type="checkbox" disabled> Use Custom Mesh</label>${collar?'':row('Segments:',spin('cat-segments',segmentsOf(base),1,8))}${collar?'':row('Length :',spin('cat-bone-length',length*100,5,120,.5,2))}${boneSizeRows(base)}<div class="cat-panel-grid">${btn('Add Bone','add-extra')}${btn('Add Rigging','rigging-info')}</div><p class="cat-panel-note">${collar?'Canviar el gruix de l’os no corregeix el centre de gir.':base.startsWith('forearm')?'Posa 3 segments a l’avantbraç per repartir la torsió.':base.startsWith('shin')?'Posa 2 segments al tram inferior de la cama.':'Width i Depth només canvien el gruix visual; el pivot és el centre de gir.'}</p>`)}
  ${segmentsOf(base)>1?rollout('LayerTargetAlign', `<div class="cat-twist-graph"><svg viewBox="0 0 220 68" aria-label="Gràfic de repartiment de torsió"><path d="M8 57 C70 48 152 17 213 9" stroke="#c9ddec" stroke-width="2" fill="none"/><path d="M8 57H213M8 9V57" stroke="#777" fill="none"/></svg></div><p class="cat-panel-note">La torsió es reparteix entre ${segmentsOf(base)} segments; no hi ha articulacions noves.</p>`,false):''}`;
}
function palmPage(id) {
  const side=id.at(-1);
  return `${stack('Object')}${rollout('Palm Setup', `${nameField(id)}${clipButtons('bone','Palm Setup')}<label class="mx-check"><input type="checkbox" disabled> Use Custom Mesh</label>${row('Num Digits:',spin('cat-hand-digits',S.handDigits,0,5))}<div class="cat-panel-list">${Array.from({length:S.handDigits},(_,i)=>`<button type="button" data-cat="select:handDigit${side}${i}">Digit${i+1}</button>`).join('')||'No digits'}</div><p class="cat-panel-note">Orienta el Palm amb eixos Local seguint el pla del palmell. Els dits es generen en aquesta direcció.</p>`)}`;
}
function anklePage(id) {
  const side=id.at(-1),size={length:15,width:20,height:10,...(S.ankleSizes[side]||{})};
  return `${stack('Object')}${rollout('Ankle Setup', `${nameField(id)}${clipButtons('bone','Ankle Setup')}<label class="mx-check"><input type="checkbox" disabled> Use Custom Mesh</label>${row('Length:',spin('cat-ankle-length',size.length,3,40,.5,1))}${row('Width:',spin('cat-ankle-width',size.width,1,30,.5,1))}${row('Height:',spin('cat-ankle-height',size.height,1,30,.5,1))}${row('Num Digits:',spin('cat-foot-digits',S.footDigits,0,5))}<div class="cat-panel-list">${S.footDigits?Array.from({length:S.footDigits},(_,d)=>`<button type="button" data-cat="select:footDigit${side}${d}">Digit${d+1}</button>`).join(''):'No digits'}</div><p class="cat-panel-note">Distingeix turmell (pivot a l’articulació), avantpeu (digit) i plataforma IK (al terra).</p>`)}`;
}
function digitPage(id){
  const base=baseId(id),hand=base.startsWith('hand'),index=+base.at(-1),bones=hand?S.digitBoneCounts[index]:S.footDigitBones,piece=+(id.split('~')[1]||1);
  return `${stack('Object')}${rollout('Digit Setup',`${row('Name',`<input class="mx-text" value="Digit${index+1}" readonly aria-label="Digit name">`)}${clipButtons('bone','Digit Setup')}${row('Bones:',spin('cat-digit-bones',bones,1,5))}<p class="cat-panel-note">${hand?(index===0?'El polze té un pla de flexió propi: orienta tota la cadena des de la base.':'Ajusta cada pivot al seu artell.'):'Punta del peu: 1 os.'}</p>`)}${rollout('Digit Bone Setup',`${row('Name',`<input class="mx-text" value="${piece}" readonly aria-label="Bone name">`)}${row('Curl Weight:','<span class="cat-readout">1,0</span>')}`,false)}`;
}
// FootPlatforms and hand IK Targets are the same CAT object (IKTarget) with Platform or Cross display.
const targetDisplayOf = id => S.targetDisplay[id] || (id.startsWith('foot')?'platform':'cross');
const targetSizeOf = id => ({length:20,width:20,...(S.targetSize[id]||{})});
function ikPage(id){
  const display=targetDisplayOf(id),size=targetSizeOf(id),foot=id.startsWith('foot');
  return `${stack('IKTarget')}${rollout('IKTarget',`${row('Length :',spin('cat-target-length',size.length,1,100,.5,1))}${row('Width :',spin('cat-target-width',size.width,1,100,.5,1))}<fieldset class="cat-fieldset"><legend>Display</legend><div class="cat-lock-axes">${[['platform','Platform'],['cross','Cross']].map(([value,label])=>`<label><input type="radio" name="cat-ik-display" value="${value}" ${display===value?'checked':''}> ${label}</label>`).join('')}</div></fieldset><p class="cat-panel-note">${foot?'La plataforma és el target IK de la cama: en moure-la, la cama la segueix i el genoll es flexiona. El turmell conserva la distància que tenia respecte de la plataforma.':'Platform és fàcil de seleccionar fora de la malla. En IK, moure el target guia el canell i l’Up Node orienta el colze.'}</p>`)}`;
}
function upPage(){return `${stack('Object')}${rollout('Up Vector Node',`<p class="cat-panel-note">Mou aquest ajudant per orientar el pla de flexió de l’extremitat: colze cap enrere, genoll cap endavant.</p>`)}`;}
const GIZMO_SHAPES=['Circle','Rectangle','Text','NGon','Torus'];
function gizmoPage(){
  const id=S.selected.slice(6),g=S.gizmoSettings[id]||{};
  if(g.editable)return `<div class="cat-panel-section"><div class="cat-panel-stack"><button type="button" class="on" data-cat="spline-top">Editable Spline</button><button type="button" class="sub${S.splineSub?' on':''}" data-cat="spline-sub">· Spline</button></div></div>${rollout('Selection',`<p class="cat-panel-note">${S.splineSub?'Subobjecte Spline actiu: Move, Rotate i Scale canvien només el contorn. El pivot de l’os no es mou.':'Fora del subobjecte, transformar el gizmo mou l’os que controla.'}</p>`)}${S.splineSub?rollout('Spline',`${row('Scale X',spin('cat-gz-sx',(g.sx??1)*100,20,400,5,0))}${row('Scale Y',spin('cat-gz-sy',(g.sy??1)*100,20,400,5,0))}${row('Rotate',spin('cat-gz-rot',g.rot||0,-180,180,5,0))}${row('Offset',spin('cat-gz-offset',(g.offset||0)*100,-30,30,.5,1))}`):''}${rollout('Controls',`<p class="cat-panel-note">${esc(fullName(id))}</p>`,false)}`;
  return `${stack('Object')}${rollout('Gizmo',`${row('Shape',`<span class="cat-readout">${esc(g.shape||'Circle')}</span>`)}${row('Radius',spin('cat-gizmo-radius',g.radius??1,.3,4,.05,2))}${btn('Convert To › Editable Spline','editable-gizmo')}<p class="cat-panel-note">Controla ${esc(fullName(id))}. El contorn ha de sobresortir de la superfície per seleccionar-lo amb la malla opaca.</p>`)}`;
}
function hierarchyPage(){
  if(!S.root||!S.selected||S.selected==='mesh')return '<p class="mx-empty">Select a CAT bone or controller for Link Info.</p>';
  const base=baseId(S.selected),limb=/^(arm|upperArm|forearm|thigh|shin)[LR]$/.test(base),locks=S.locksById[base]||{};
  return `<div class="cat-hierarchy-tabs">${['Pivot','IK','Link Info'].map((name,i)=>`<button type="button" data-cat="link-tab:${i}" class="${S.linkTab===String(i)?'on':''}">${name}</button>`).join('')}</div>${S.linkTab==='2'?`${rollout('Locks',`${['Move','Rotate','Scale'].map(key=>`<fieldset class="cat-fieldset"><legend>${key}:</legend><div class="cat-lock-axes">${['X','Y','Z'].map(axis=>`<label><input type="checkbox" data-lock="${key.toLowerCase()}:${axis.toLowerCase()}" ${locks[`${key.toLowerCase()}:${axis.toLowerCase()}`]?'checked':''}> ${axis}</label>`).join('')}</div></fieldset>`).join('')}`)}${rollout('Link Info',limb?`<label class="mx-check"><input id="cat-stretch" type="checkbox" ${S.stretchById[base]??true?'checked':''}> Manipulation Causes Stretching</label>`:'<p class="cat-panel-note">Selecciona un os de braç o cama per configurar l’estirament.</p>',false)}`:S.linkTab==='1'?rollout('IK',`<p class="cat-panel-note">Els controls IK de CAT es configuren al panell Motion (Limb Animation).</p>`):rollout('Pivot',`<p class="cat-panel-note">A CAT, el pivot de cada os es col·loca movent l’os en Setup Mode.</p>`)}`;
}
const PRESETS={'<..>':()=>[0,0,0,0,0].map(()=>({curl:0,bend:0,spread:0})),fist:()=>[{curl:30,bend:20},{curl:75},{curl:75},{curl:75},{curl:75}],HangLoose:()=>[{curl:0,spread:-15},{curl:75},{curl:75},{curl:75},{curl:0,spread:20}],mettler:()=>[{curl:40},{curl:0},{curl:75},{curl:75},{curl:0}],Peace:()=>[{curl:40},{curl:0,spread:10},{curl:0,spread:-8},{curl:75},{curl:75}],point:()=>[{curl:40},{curl:0},{curl:75},{curl:75},{curl:75}]};
function digitManager(side){
  const first=S.digitSel.findIndex((on,i)=>on&&i<S.handDigits),pose=(first>=0&&S.digitPoses[side]?.[first])||{};
  return rollout('Digit Manager',`<fieldset class="cat-fieldset"><legend>Preset Poses</legend><div class="cat-panel-list">${Object.keys(PRESETS).map(name=>`<button type="button" data-cat="dm-preset:${name}" class="${S.digitPreset===name?'on':''}">${esc(name)}</button>`).join('')}</div></fieldset><div class="cat-panel-list cat-digit-list">${Array.from({length:S.handDigits},(_,i)=>`<button type="button" data-cat="dm-digit:${i}" class="${S.digitSel[i]?'on':''}">Digit${i+1}</button>`).join('')||'No digits'}</div>${['spread','bend','roll','curl'].map(key=>row(key[0].toUpperCase()+key.slice(1)+':',spin(`cat-dm-${key}`,pose[key]||0,-90,90,1,1))).join('')}<p class="cat-panel-note">Selecciona els dígits i mou Curl per tancar la mà. Si un dit es plega malament, revisa’n els eixos i pivots en Setup.</p>`);
}
function motionPage() {
  if (!S.root || !S.selected || S.selected==='mesh') return `<p class="mx-empty">Select a CATParent or CAT bone to open CAT Layer Manager.</p>`;
  const base=baseId(S.selected),info=LIMB_OF(base),layers=S.absLayers.length?S.absLayers.map((name,i)=>`<button type="button" data-cat="layer:${i}" class="${S.activeLayer===i?'on':''}">${esc(name)} · 100% ${S.activeLayer===i?'●':''}</button>`).join(''):'No animation layers';
  const palm=/^palm[LR]$/.test(base),helper=/^(foot|ik)([LR])$/.exec(base);
  const limb=info?.limb||(helper?`${helper[1]==='foot'?'leg':'arm'}${helper[2]}`:null),side=limb?.at(-1),leg=limb?.startsWith('leg');
  const layerRollout=rollout('Layer Manager', `<div class="cat-mode">${btn(`Setup Mode${S.mode==='Setup'?' ✓':''}`,'setup',S.mode==='Setup'?' on':'')}${btn(`Animation Mode${S.mode==='Animation'?' ✓':''}`,'animation',(S.mode==='Animation'?' on':'')+(S.absLayers.length?'':' disabled'))}</div><div class="cat-panel-list">${layers}</div><div class="cat-panel-grid">${btn('Add Absolute Layer','add-layer')}${btn('Add CATMotion','catmotion-info')}</div><p class="cat-panel-note">${S.absLayers.length?'Animation Mode prova el rig sense canviar la pose de Setup.':'Crea una capa Absolute per poder activar Animation Mode.'}</p>`,!limb);
  if(!limb)return layerRollout;
  // Limb Animation, as 3ds Max shows it for any bone of the limb and for its IK Target / platform.
  const ikfk=S.ikfk[limb]??(leg?0:1),hasTarget=leg||!!S.ikTargets[side];
  const slider=(id,value,min,max,step)=>`<div class="cat-slider-row">${spin(id,value,min,max,step,1)}<input type="range" class="cat-range" data-range="${id}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${id}"></div>`;
  const selection=`<div class="cat-panel-section"><span class="cat-panel-label">Selection Level:</span><div class="cat-panel-grid">${btn('Sub-Object','subobject-info',' disabled')}<select class="mx-text" disabled><option></option></select>${btn('Parameters','noop',' on')}${btn('Motion Paths','motion-paths-info')}</div></div>`;
  const limbRollout=rollout('Limb Animation',`<fieldset class="cat-fieldset"><legend>IK System</legend><div class="cat-ik-system">${btn('Create IKTarget','ik-target',leg||S.ikTargets[side]||!palm?' disabled':'')}${btn('Select Limb End','limb-end')}${btn(`Move IKTarget to ${leg?'Ankle':'Palm'}`,'ik-to-end',hasTarget?'':' disabled')}${btn('Match IK and FK','match-ikfk',hasTarget?'':' disabled')}</div></fieldset>
    <div class="cat-panel-label">IK/FK</div>${slider('cat-ikfk',ikfk,0,1,.1)}<label class="mx-check"><input type="checkbox" id="cat-fk-display" ${S.fkDisplay[limb]?'checked':''}> Display FK Limb in IK</label>
    <div class="cat-panel-label">Num IK Bones</div>${slider('cat-ik-bones',S.ikBones[limb]??3,1,3,1)}
    <div class="cat-panel-label">Retargeting</div>${slider('cat-retarget',S.retarget[limb]??0,0,1,.1)}
    <p class="cat-panel-note">IK/FK: 0 = IK · 1 = FK. ${leg?'En IK la cama segueix la plataforma i la cuixa i el genoll només es mouen; en FK giren des de dalt.':hasTarget?'En IK el braç segueix l’IK Target.':'Crea un IK Target des del Palm per poder treballar en IK.'}</p>`);
  const controller=helper?rollout('Assign Controller',`<div class="cat-controller-tree"><b>${esc(fullName(base))}</b><div>▾ Transform : ${helper[1]==='foot'?'CATFootTrans2':'CATIKTargetTrans'}</div><div class="sub">LayerTrans : LayerMatrix3</div><div>Object (IKTarget)</div></div>`,true):'';
  return `${selection}${limbRollout}${layerRollout}${controller}${palm?`${digitManager(side)}${rollout('Palm Animation',`${row('Target Align','<span class="cat-readout">1,0</span>')}`,false)}`:''}`;
}
function renderCommand(tab,page) {
  const sel=S.selected||'',base=baseId(sel);
  let html;
  if(tab==='create')html=createPage();
  else if(tab==='modify'){
    if(!sel)html='<p class="mx-empty">Select an object.</p>';
    else if(sel==='mesh')html=skinPage();
    else if(sel.startsWith('gizmo:'))html=gizmoPage();
    else if(sel==='catparent')html=parentPage();
    else if(['pelvis','ribcage','head'].includes(base))html=hubPage(base);
    else if(['spine','neck'].includes(base))html=spinePage(sel);
    else if(/^palm[LR]$/.test(base))html=palmPage(base);
    else if(/^ankle[LR]$/.test(base))html=anklePage(base);
    else if(LIMB_OF(base))html=limbPage(sel);
    else if(/^(handDigit|footDigit)/.test(base))html=digitPage(sel);
    else if(/^ik[LR]$/.test(base))html=ikPage(base);
    else if(/^(legUp|armUp)[LR]$/.test(base))html=upPage();
    else if(/^foot[LR]$/.test(base))html=ikPage(base);
    else html=rollout('Bone Setup',`${nameField(sel)}${btn('Add Rigging','rigging-info')}`);
  }
  else if(tab==='motion')html=motionPage();
  else if(tab==='hierarchy')html=hierarchyPage();
  else html=`<p class="mx-empty">Select a CAT part and use Create, Modify, Hierarchy or Motion.</p>`;
  page.insertAdjacentHTML('beforeend',html);
  const name=page.querySelector('#mx-objname');if(name)name.readOnly=false;
}

// ── IK solving (FootPlatform, IK Targets and Up Nodes) ──
const px3 = name => [...S.joints[name],jointDepthOf(S,name)*225];
const toPx3 = target => [target[0],target[1],target[2]*225];
function setJoint3(name,point){S.joints[name]=point.slice(0,2);S.jointDepths[name]=point[2]/225;}
function limbLengths(limb){
  const [a,b,c]=limb.startsWith('leg')?['hip','knee','ankle']:['shoulder','elbow','wrist'],side=limb.at(-1);
  if(S.mode==='Animation'&&S.animLengths?.[limb])return S.animLengths[limb];
  const store=limb.startsWith('leg')?S.legIKLengths:S.armIKLengths;
  return store[side]??=[Math.hypot(...px3(b+side).map((v,i)=>v-px3(a+side)[i])),Math.hypot(...px3(c+side).map((v,i)=>v-px3(b+side)[i]))];
}
const footQuat=side=>new THREE.Quaternion().setFromEuler(new THREE.Euler(...(S.footRotations[side]||[0,0,0])));
// Same pivot as the FootPlatform drawn in the viewport (on the ground, under the front of the foot).
const platformPivot=side=>targetVector(S.footTargets[side]).add(new THREE.Vector3(...FOOT_PIVOT));
// Ankle offset stored in platform space, so it turns with the platform.
function ensureFootOffset(side){return S.footOffsets[side]??=jointPosition(S,`ankle${side}`).sub(platformPivot(side)).applyQuaternion(footQuat(side).invert()).toArray();}
function solveLeg(side){
  if((S.ikfk[`leg${side}`]??0)>=.5)return; // IK/FK: 0 = IK, 1 = FK
  const target=S.footTargets[side];if(!target)return;
  const lengths=limbLengths(`leg${side}`),pole=S.upNodes[`leg${side}`]?toPx3(S.upNodes[`leg${side}`]):(S.legIKRest[side]??=px3(`knee${side}`));
  // As in 3ds Max, the ankle keeps its offset from the platform: moving the platform carries it, and rotating
  // the platform swings it around the platform pivot at the tip of the foot (the ankle lifts, the tip stays down).
  const goal=new THREE.Vector3(...ensureFootOffset(side)).applyQuaternion(footQuat(side)).add(platformPivot(side));
  const solved=solveLegIK(px3(`hip${side}`),pole,[300+goal.x*225,480-goal.y*225,goal.z*225],...lengths);
  setJoint3(`knee${side}`,solved.knee);setJoint3(`ankle${side}`,solved.ankle);
}
function solveArm(side){
  if((S.ikfk[`arm${side}`]??1)>=.5)return;
  const target=S.ikTargets[side];if(!target)return;
  const lengths=limbLengths(`arm${side}`),pole=S.upNodes[`arm${side}`]?toPx3(S.upNodes[`arm${side}`]):(S.armIKRest[side]??=px3(`elbow${side}`));
  const solved=solveLegIK(px3(`shoulder${side}`),pole,toPx3(target),...lengths);
  setJoint3(`elbow${side}`,solved.knee);setJoint3(`wrist${side}`,solved.ankle);
}
// In Setup Mode an IK target follows the hand when the arm is rebuilt.
function afterSetupEdit(){
  if(S.mode!=='Setup')return;
  for(const side of SIDES){if(S.ikTargets[side])S.ikTargets[side]=[...S.joints[`wrist${side}`],jointDepthOf(S,`wrist${side}`)];delete S.armIKLengths[side];delete S.armIKRest[side];}
}

// ── Transforms from the viewport gizmo ──
function moveOnAxis(axis,dx,dy) {
  if(axis==='free')return {x:dx,y:dy,depth:0};
  if(axis==='x')return {x:dx,y:0,depth:0};
  if(axis==='z')return {x:0,y:dy,depth:0};
  return {x:0,y:0,depth:dx/225};
}
const jointPoint=name=>jointPosition(S,name);
function transformJoint(name,pivotName,tool,amount,direction,free=false){
  const pivot=jointPoint(pivotName),relative=jointPoint(name).sub(pivot);
  if(tool==='rotate')relative.applyAxisAngle(direction,amount);
  else if(free)relative.multiplyScalar(amount);
  else relative.addScaledVector(direction,(amount-1)*relative.dot(direction));
  const point=relative.add(pivot);
  S.joints[name]=[300+point.x*225,480-point.y*225];S.jointDepths[name]=point.z;
}
function rotateEuler(values,direction,theta){
  const current=new THREE.Quaternion().setFromEuler(new THREE.Euler(...values));
  current.premultiply(new THREE.Quaternion().setFromAxisAngle(direction,theta));
  return new THREE.Euler().setFromQuaternion(current,'XYZ').toArray().slice(0,3);
}
const dominantAxis=direction=>direction.toArray().map(Math.abs).indexOf(Math.max(...direction.toArray().map(Math.abs)));
// Turn the ankle by a rig-space rotation while it stays expressed relative to its FootPlatform.
function rotateAnkle(side,direction,angle){
  const euler=v=>new THREE.Quaternion().setFromEuler(new THREE.Euler(...(v||[0,0,0])));
  const foot=euler(S.footRotations[side]),turn=new THREE.Quaternion().setFromAxisAngle(direction,angle);
  const q=foot.clone().invert().multiply(turn).multiply(foot).multiply(euler(S.ankleRotations[side]));
  S.ankleRotations[side]=new THREE.Euler().setFromQuaternion(q.normalize(),'XYZ').toArray().slice(0,3);
}
// Setup Mode: the Ankle turns around the tip of the foot bone; the tip stays and the ankle joint swings round it
// (Leg2 re-aims to the new ankle, as when the Ankle is moved).
function rotateAnkleFromTip(side,direction,angle){
  const tip=ankleTip(S,side);
  rotateAnkle(side,direction,angle);
  const ankle=tip.addScaledVector(ankleDirection(S,side),-ankleLength(S,side));
  S.joints[`ankle${side}`]=[300+ankle.x*225,480-ankle.y*225];S.jointDepths[`ankle${side}`]=ankle.z;
  invalidateLegSetup(S,[`ankle${side}`]);afterSetupEdit();
}
// Setup Mode, moving the Palm: the wrist goes there and the whole arm follows. The shoulder stays; the elbow keeps
// the bone lengths and its bend while it can reach, and the arm stretches straight when it can't.
// Setup Mode: when something above the arm moves (Chest, spine, collarbone), the Palm stays where it is and the arm
// re-aims to reach it from the new shoulder. Bone lengths are kept while it can reach (the arm stretches if not).
function armLengths(side){
  const P=n=>[...S.joints[n+side],jointDepthOf(S,n+side)*225],s=P('shoulder'),e=P('elbow'),w=P('wrist');
  if(!S.armSetupLengths[side]){
    // remember the bend direction too (elbow offset from the shoulder–wrist line)
    const sw=w.map((v,i)=>v-s[i]),se=e.map((v,i)=>v-s[i]),t=se.reduce((a,v,i)=>a+v*sw[i],0)/Math.max(1e-9,sw.reduce((a,v)=>a+v*v,0));
    S.armSetupLengths[side]=[Math.hypot(...se),Math.hypot(...w.map((v,i)=>v-e[i])),se.map((v,i)=>v-t*sw[i])];
  }
  return S.armSetupLengths[side];
}
function solveArmToPalm(side){
  const P=n=>[...S.joints[n+side],jointDepthOf(S,n+side)*225],s=P('shoulder'),w=P('wrist');
  let [L1,L2,bend]=armLengths(side);const d=Math.hypot(...w.map((v,i)=>v-s[i]));
  // A straight arm has no bend direction yet: bend it outwards, away from the body.
  if(!bend||Math.hypot(...bend)<2)bend=[side==='L'?45:-45,0,0];
  const pole=s.map((v,i)=>v+(w[i]-v)*L1/(L1+L2)+bend[i]);
  const elbow=d>=L1+L2-1e-3?s.map((v,i)=>v+(w[i]-v)*L1/(L1+L2)):solveLegIK(s,pole,w,L1,L2).knee;
  setJoint3(`elbow${side}`,elbow);
}
function reachWrist(side,delta){
  delete S.armSetupLengths[side];
  const P=n=>[...S.joints[n+side],jointDepthOf(S,n+side)*225];
  const s=P('shoulder'),e=P('elbow'),w0=P('wrist'),w=w0.map((v,i)=>v+[delta.x*225,-delta.y*225,delta.z*225][i]);
  const L1=Math.hypot(...e.map((v,i)=>v-s[i])),L2=Math.hypot(...w0.map((v,i)=>v-e[i])),d=Math.hypot(...w.map((v,i)=>v-s[i]));
  let elbow;
  if(d>=L1+L2-1e-3)elbow=s.map((v,i)=>v+(w[i]-v)*L1/(L1+L2));
  else elbow=solveLegIK(s,e,w,L1,L2).knee;
  setJoint3(`elbow${side}`,elbow);setJoint3(`wrist${side}`,w);
}
function moveTarget(target,movement){target[0]+=movement.x||0;target[1]+=movement.y||0;target[2]+=movement.depth||0;return target;}
function shiftJoints(names,delta){for(const name of names){const point=jointPosition(S,name).add(delta);S.joints[name]=[300+point.x*225,480-point.y*225];S.jointDepths[name]=point.z;}}
function transformBone(id,tool,dx,dy,axis='free',worldDelta=null,axisVector=null) {
  // A gizmo drives the bone it controls; in the Spline sub-object it only reshapes its outline.
  if(id.startsWith('gizmo:')){
    const owner=id.slice(6),g=S.gizmoSettings[owner]??={};
    if(g.editable&&S.splineSub){
      if(tool==='rotate')g.rot=((g.rot||0)+dx*.012*180/Math.PI+540)%360-180;
      else if(tool==='scale'){const f=Math.max(.8,Math.min(1.2,1+dx*.008));g.sx=Math.max(.2,Math.min(4,(g.sx??1)*f));g.sy=Math.max(.2,Math.min(4,(g.sy??1)*f));}
      else if(tool==='move'&&worldDelta)g.offset=Math.max(-.3,Math.min(.3,(g.offset||0)+worldDelta[1]));
      draw();return;
    }
    id=owner;
  }
  const base=baseId(id),locks=S.locksById[base]||{},kind=tool==='move'?'move':tool==='rotate'?'rotate':'scale';
  if(axis!=='free'&&locks[`${kind}:${axis}`])return;
  if(!transformable(S,base,tool)){if(tool==='rotate'&&limbIsIK(S,base))return tell('Aquesta extremitat està en IK: la cuixa i el genoll (o el braç i l’avantbraç) només es poden moure. Posa IK/FK a 1 (Motion › Limb Animation) per girar-los en FK.');if(S.mode==='Animation')tell('En Animation Mode els ossos CAT només giren (la pelvis també es pot moure). Torna a Setup Mode per canviar pivots o longituds.');return;}
  const direction=new THREE.Vector3(...(axisVector||(axis==='x'?[1,0,0]:axis==='y'?[0,0,-1]:axis==='z'?[0,1,0]:[0,0,-1]))).normalize();
  const movement=tool==='move'?(worldDelta?{x:worldDelta[0]*225,y:-worldDelta[1]*225,depth:worldDelta[2]}:moveOnAxis(axis,dx,dy)):null;
  const jointDelta=movement?new THREE.Vector3(movement.x/225,-movement.y/225,movement.depth):null;
  const animation=S.mode==='Animation';
  if(base==='catparent'){
    const transform=S.parentTransform;
    if(tool==='move'){transform.position[0]+=(movement.x||0)/225;transform.position[1]-=(movement.y||0)/225;transform.position[2]+=movement.depth||0;}
    else if(tool==='rotate')transform.rotation=rotateEuler(transform.rotation,direction,dx*.012);
    else if(tool==='scale'){const factor=Math.max(.8,Math.min(1.2,1+dx*.008)),index=dominantAxis(worldAxisToRig(S,direction));if(axis==='free')transform.scale=transform.scale.map(value=>Math.max(.3,Math.min(3,value*factor)));else transform.scale[index]=Math.max(.3,Math.min(3,transform.scale[index]*factor));}
    draw();return;
  }
  const helper=/^(foot|ik|legUp|armUp)([LR])$/.exec(base);
  if(helper){
    const [,part,side]=helper;
    if(part==='foot'){
      if(tool==='move'){pinFootTarget(S,side);ensureFootOffset(side);moveTarget(S.footTargets[side],movement);if(animation)S.tested.add('foot');solveLeg(side);}
        else if(tool==='rotate'){pinFootTarget(S,side);ensureFootOffset(side);S.footRotations[side]=rotateEuler(S.footRotations[side]||[0,0,0],direction,dx*.012);if(animation)S.tested.add('foot');solveLeg(side);}
      else if(tool==='scale'){const size=targetSizeOf(base),f=Math.max(.8,Math.min(1.2,1+dx*.008));S.targetSize[base]={length:Math.max(1,Math.min(100,size.length*f)),width:Math.max(1,Math.min(100,size.width*f))};}
    }else if(part==='ik'){
      if(tool==='move'){moveTarget(S.ikTargets[side],movement);if(animation)S.tested.add('ik');solveArm(side);if((S.ikfk[`arm${side}`]??1)>=.5)tell('Aquest braç està en FK (IK/FK = 1): el target es mou però no guia la mà. Posa IK/FK a 0 a Motion › Limb Animation.');}
      else if(tool==='rotate')S.ikRotations[side]=rotateEuler(S.ikRotations[side]||[0,0,0],direction,dx*.012);
      else{const size=targetSizeOf(base),f=Math.max(.8,Math.min(1.2,1+dx*.008));S.targetSize[base]={length:Math.max(1,Math.min(100,size.length*f)),width:Math.max(1,Math.min(100,size.width*f))};}
    }else if(tool==='move'){
      const limb=`${part==='legUp'?'leg':'arm'}${side}`;moveTarget(S.upNodes[limb],movement);
      if(part==='legUp'){if(S.footTargets[side])solveLeg(side);}else solveArm(side);
    }
    draw();return;
  }
  // An IK leg is driven by its FootPlatform in Animation Mode.
  if(animation&&/^(thigh|shin|ankle)[LR]$/.test(base)&&(S.ikfk[`leg${sideOf(base)}`]??0)<.5){tell('Aquesta cama és IK (IK/FK = 0): mou la plataforma del peu per animar-la.');return;}
  if(animation&&/^(arm|upperArm|forearm|palm)[LR]$/.test(base)&&S.ikTargets[sideOf(base)]&&(S.ikfk[`arm${sideOf(base)}`]??1)<.5&&base!=='palm'+sideOf(base)&&!base.startsWith('arm')){tell('Aquest braç és IK: mou l’IK Target de la mà per animar-lo.');return;}
  const legObject=/^(thigh|shin|ankle)([LR])$/.exec(base);
  if(legObject&&!animation)pinFootTarget(S,legObject[2]);
  if(tool==='rotate')rotateHierarchyFrames(S,listObjects(),/^(spine|neck)$/.test(base)?id:base,direction,dx*.012);
  // Foot digits (toes): rotate around their base and, in Setup Mode, move their pivot.
  const toe=/^footDigit([LR])(\d)$/.exec(base);
  if(toe){
    const key=toe[1]+toe[2],euler=v=>new THREE.Quaternion().setFromEuler(new THREE.Euler(...(v||[0,0,0])));
    if(tool==='rotate'){const ankle=euler(S.footRotations[toe[1]]).multiply(euler(S.ankleRotations[toe[1]])),turn=new THREE.Quaternion().setFromAxisAngle(direction,dx*.012);
      const q=ankle.clone().invert().multiply(turn).multiply(ankle).multiply(euler(S.footDigitRotations[key]));S.footDigitRotations[key]=new THREE.Euler().setFromQuaternion(q.normalize(),'XYZ').toArray().slice(0,3);}
    else if(tool==='move'&&!animation)S.footDigitOffsets[key]=new THREE.Vector3(...(S.footDigitOffsets[key]||[0,0,0])).add(jointDelta).toArray();
    draw();return;
  }
  if(base==='pelvis'){
    // The spine and neck turn with the pelvis, keeping their bend.
    if(tool==='rotate'){const turn=new THREE.Quaternion().setFromAxisAngle(direction.clone().normalize(),dx*.012);for(const name of ['spine','neck']){const b=new THREE.Quaternion().setFromEuler(new THREE.Euler(...(S.spineBase[name]||[0,0,0])));S.spineBase[name]=new THREE.Euler().setFromQuaternion(turn.clone().multiply(b),'XYZ').toArray().slice(0,3);}}
    if(animation){
      // The pelvis carries the upper body; IK feet and hands stay on their targets.
      for(const side of SIDES){if(hasLeg(S,side))pinFootTarget(S,side);}
      const names=Object.keys(S.joints).filter(name=>name!=='root'&&!/^(knee|ankle)[LR]$/.test(name));
      if(tool==='move'){shiftJoints(names,jointDelta);S.tested.add('pelvis');}
      else if(tool==='rotate'){for(const name of names)if(name!=='pelvis')transformJoint(name,'pelvis',tool,dx*.012,direction);S.tested.add('pelvis');}
      for(const side of SIDES){solveLeg(side);solveArm(side);}
    }else{
      if(tool==='move')moveSetupJoints(S,Object.keys(S.joints).filter(name=>name!=='root'),jointDelta);
      else{if(tool==='rotate')for(const side of SIDES)rotateAnkle(side,direction,dx*.012);for(const name of Object.keys(S.joints)){if(name==='root'||name==='pelvis')continue;if(tool==='rotate')transformJoint(name,'pelvis',tool,dx*.012,direction);else if(tool==='scale')transformJoint(name,'pelvis',tool,Math.max(.5,Math.min(1.5,1+dx*.008)),direction,axis==='free');}invalidateLegSetup(S,Object.keys(S.joints));}
      afterSetupEdit();
    }
    draw();return;
  }
  // CAT spine / neck: a spine bone rotates from its base and carries everything above it rigidly; rotating the hub
  // (Chest or head) bends the whole chain. Spine bones do not move: their pivots follow the chain.
  const SPINE_UPPER={spine:['chest','head','shoulderL','elbowL','wristL','shoulderR','elbowR','wristR'],neck:['head']};
  const chainOf=base==='spine'||base==='ribcage'?'spine':base==='neck'||base==='head'?'neck':null;
  if(chainOf&&((base==='ribcage'&&S.spine)||(base==='head'&&S.head)||base==='spine'||base==='neck')){
    if(base===chainOf&&tool==='move'){tell('Els ossos de la columna no es mouen: el seu pivot segueix la cadena. Mou o gira el hub per corbar-la.');return;}
    if(tool==='rotate'){
      const k=base===chainOf?Math.max(0,+(id.split('~')[1]||1)-1):-1;
      const before=Object.fromEntries(SPINE_UPPER[chainOf].filter(name=>S.joints[name]).map(name=>[name,jointPosition(S,name)]));
      if(chainOf==='spine'&&S.mode==='Setup')for(const side of SIDES)if(S.arms>=(side==='L'?1:2))armLengths(side);
      const map=k>=0?rotateSpineSegment(S,chainOf,k,direction,dx*.012):bendSpine(S,chainOf,direction,dx*.012);
      // the hub moves to the end of the chain; everything above it follows rigidly
      if(chainOf==='spine')for(const limb of ['armL','armR'])if(S.upNodes[limb]){const p=map(targetVector(S.upNodes[limb]));S.upNodes[limb]=[300+p.x*225,480-p.y*225,p.z];}
      const fixedPalm=chainOf==='spine'&&S.mode==='Setup';
      for(const [name,old] of Object.entries(before)){if(fixedPalm&&/^(elbow|wrist)[LR]$/.test(name))continue;const p=map(old);S.joints[name]=[300+p.x*225,480-p.y*225];S.jointDepths[name]=p.z;}
      if(fixedPalm)for(const side of SIDES)if(S.arms>=(side==='L'?1:2)){armLengths(side);solveArmToPalm(side,map(before[`elbow${side}`]));}
      if(chainOf==='spine'&&S.head){/* the neck keeps its shape and turns with the chest */const turn=new THREE.Quaternion().setFromAxisAngle(direction.clone().normalize(),dx*.012),b=new THREE.Quaternion().setFromEuler(new THREE.Euler(...(S.spineBase.neck||[0,0,0])));S.spineBase.neck=new THREE.Euler().setFromQuaternion(turn.multiply(b),'XYZ').toArray().slice(0,3);}
      if(!animation){afterSetupEdit();}else for(const side of SIDES)solveArm(side);
      draw();return;
    }
  }
  if(['spine','ribcage','head','neck'].includes(base)||/^(palm|ankle)[LR]$/.test(base)){
    const upper=['chest','head','shoulderL','elbowL','wristL','shoulderR','elbowR','wristR'];
    const terminal=/^(palm|ankle)([LR])$/.exec(base);
    const names=terminal?[`${terminal[1]==='palm'?'wrist':'ankle'}${terminal[2]}`]:base==='head'||base==='neck'?['head']:upper;
    const pivotName=terminal?names[0]:base==='spine'?'pelvis':base==='head'?'head':'chest';
    if(tool==='move'&&terminal?.[1]==='palm'){reachWrist(terminal[2],jointDelta);afterSetupEdit();draw();return;}
    if(tool==='move'&&base==='ribcage'&&!animation){for(const side of SIDES)if(S.arms>=(side==='L'?1:2))armLengths(side);const poles=Object.fromEntries(SIDES.map(side=>[side,S.joints[`elbow${side}`]&&jointPosition(S,`elbow${side}`).add(jointDelta)]));moveSetupJoints(S,names.filter(n=>!/^(elbow|wrist)[LR]$/.test(n)),jointDelta);for(const side of SIDES)if(S.arms>=(side==='L'?1:2))solveArmToPalm(side,poles[side]);afterSetupEdit();draw();return;}
    if(tool==='move'){moveSetupJoints(S,names,jointDelta);afterSetupEdit();draw();return;}
    // Rotating an end bone or a hub changes its frame only: the Ankle turns the foot, its platform stays.
    if(terminal||base==='head'){if(tool==='rotate'&&terminal?.[1]==='ankle'){/* IK: the foot turns from its tip; FK: from the ankle joint (top) */if(limbIsIK(S,base))rotateAnkleFromTip(terminal[2],direction,dx*.012);else rotateAnkle(terminal[2],direction,dx*.012);}draw();return;}
    for(const name of names){
      if(name===pivotName)continue;
      if(tool==='rotate')transformJoint(name,pivotName,tool,dx*.012,direction);
      else if(tool==='scale')transformJoint(name,pivotName,tool,Math.max(.5,Math.min(1.5,1+dx*.008)),direction,axis==='free');
    }
    if(!animation){invalidateLegSetup(S,names);afterSetupEdit();}else for(const side of SIDES)solveArm(side);
    draw();return;
  }
  const m=/^(upperArm|forearm|thigh|shin|arm)([LR])$/.exec(base);if(!m)return;
  if(/^(upperArm|forearm)[LR]$/.test(base))delete S.armSetupLengths[m[2]];
  const [,part,side]=m,arm=/Arm|arm/.test(part),chain=arm?['shoulder','elbow','wrist']:['hip','knee','ankle'];
  const pivot=part==='forearm'?'elbow':part==='shin'?'knee':chain[0],start=chain.indexOf(pivot);
  // CAT Setup Mode: moving a bone moves only its pivot (Leg1 → hip, Leg2 → knee, Arm1 → shoulder, Arm2 → elbow).
  // The next joint stays where it is, so the bone and its parent re-aim and change length; the foot stays on its platform.
  // Rotating a bone turns the rest of the chain with it (FK). The collarbone moves the whole arm.
  const names=(part==='arm'?chain:tool==='move'?[pivot]:chain.slice(start+1)).map(n=>n+side);
  const key=part==='arm'?'chest':pivot+side;
  // The collarbone rotates around its own start (on the Chest hub) and carries the whole arm.
  if(part==='arm'&&tool==='rotate'){
    const pivotPoint=collarboneStartPoint(S,side),turn=new THREE.Quaternion().setFromAxisAngle(direction.clone().normalize(),dx*.012);
    if(!animation){
      // Setup: the collarbone carries the shoulder; the Palm stays and the arm re-aims to it.
      armLengths(side);const pole=jointPosition(S,`elbow${side}`).sub(pivotPoint).applyQuaternion(turn).add(pivotPoint);
      const p=jointPosition(S,`shoulder${side}`).sub(pivotPoint).applyQuaternion(turn).add(pivotPoint);S.joints[`shoulder${side}`]=[300+p.x*225,480-p.y*225];S.jointDepths[`shoulder${side}`]=p.z;
      solveArmToPalm(side,pole);afterSetupEdit();
    }else{for(const name of names){const p=jointPosition(S,name).sub(pivotPoint).applyQuaternion(turn).add(pivotPoint);S.joints[name]=[300+p.x*225,480-p.y*225];S.jointDepths[name]=p.z;}solveArm(side);}
    draw();return;
  }
  if(tool==='move')moveSetupJoints(S,names,jointDelta);
  else{
    if(tool==='rotate'&&!arm)rotateAnkle(side,direction,dx*.012);
    for(const name of names){
      if(tool==='rotate')transformJoint(name,key,tool,dx*.012,direction);
      else if(tool==='scale')transformJoint(name,key,tool,Math.max(.5,Math.min(1.5,1+dx*.008)),direction,axis==='free');
    }
    if(!animation)invalidateLegSetup(S,names);
  }
  if(!animation)afterSetupEdit();
  draw();
}
function setBoneLength(base,length){
  const seg=partSegment(base);if(!seg||S.mode!=='Setup')return;
  const a=jointPosition(S,seg[0]),b=jointPosition(S,seg[1]),dir=b.clone().sub(a).normalize(),delta=dir.multiplyScalar(length-a.distanceTo(b));
  const side=sideOf(base),down={thigh:['knee','ankle'],shin:['ankle'],upperArm:['elbow','wrist'],forearm:['wrist']}[base.slice(0,-1)];
  if(!down)return;
  moveSetupJoints(S,down.map(n=>n+side),delta);afterSetupEdit();
}

// ── Structure ──
function createParent(radius=0.95) {
  S.root=true; S.armed=false; S.baseRadius=Math.max(.3,Math.min(2.6,radius));
  S.parentTransform={position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]};
  if(S.preset==='human') { S.pelvis=true; S.legs=0; S.legSides=[]; addLegFromSetup(S); addLegFromSetup(S); S.spine=true; S.spineBones=3; S.arms=0; addArmFromSetup(S); addArmFromSetup(S); S.head=true; S.headBones=2; }
  select('catparent','modify'); sync();
  tell(S.preset==='human'?'Base Human carregat. Per a la pràctica de la guia, crea el rig des de (None).':'CATParent creat a l’origen. Revisa el Name (CATRig) i prem Create Pelvis.');
}
function addPart(which) {
  if(S.mode!=='Setup') { tell('Torna a Setup Mode per modificar l’estructura.'); return; }
  const sel=baseId(S.selected);
  if(which==='leg'&&sel!=='pelvis')return tell('Add Leg: selecciona el hub de la pelvis.');
  if(which==='leg'&&S.legs>=2)return tell('El rig ja té dues cames.');
  if(which==='arm'&&sel!=='ribcage')return tell('Add Arm: selecciona el hub superior de la columna (Chest).');
  if(which==='arm'&&S.arms>=2)return tell('El rig ja té dos braços.');
  if(which==='spine'&&sel==='head')return tell('El hub del cap no necessita una altra columna.');
  if(which==='spine'&&sel==='pelvis'&&S.spine)return tell('La pelvis ja té columna.');
  if(which==='spine'&&sel==='ribcage'&&S.head)return tell('Chest ja té coll i cap.');
  pushUndo();
  if(which==='pelvis') { S.pelvis=true; select('pelvis','modify'); }
  if(which==='leg') { addLegFromSetup(S); tell(S.legs===1?'Cama L creada des de la pelvis fins a terra: la plataforma queda a la base del rig. Col·loca maluc, genoll i turmell a Front i Left.':'Cama R creada com a mirall de la L, amb els seus pivots, segments, plataforma i Up Node.'); }
  if(which==='spine'&&sel==='pelvis') { S.spine=true; sync(); select('spine','modify'); tell('Columna i hub superior creats. Deixa Bones = 3 i anomena el hub Chest.'); }
  else if(which==='spine'&&sel==='ribcage') { S.head=true; sync(); select('neck','modify'); tell('Coll i hub del cap creats des de Chest. Deixa 2 ossos al coll.'); }
  if(which==='arm') { S.armSetupLengths={}; addArmFromSetup(S); afterSetupEdit(); tell(S.arms===1?'Braç L creat amb clavícula, braç, avantbraç i Palm.':'Braç R creat com a còpia mirall del primer: revisa’l en dues vistes.'); }
  if(which==='tail') S.tail=true;
  if(which==='extra') S.extra=true;
  sync();
}
function boneDialog() {
  const candidates=listObjects().filter(o=>o.id!=='mesh'&&o.id!=='catparent');
  if(!candidates.some(o=>o.kind==='Bone'))return tell('Crea els ossos CAT abans d’afegir-los a Skin.');
  const dlg=max.dialog('Select Bones',`<div class="cat-select-bones"><input class="mx-text" id="cat-bone-search" placeholder="Search objects..." aria-label="Search objects"><div class="cat-select-head">Name (Sorted Ascending)</div><div class="cat-select-rows">${candidates.sort((a,b)=>a.name.localeCompare(b.name)).map(o=>`<label class="cat-select-row" data-bone-name="${esc(o.name.toLowerCase())}"><input type="checkbox" value="${o.id}" ${S.skinBones.has(o.id)?'checked':''}><span>${o.kind==='Bone'?'●':'◇'}</span>${esc(o.name)}${o.kind!=='Bone'?'<small>control</small>':''}</label>`).join('')}</div></div>`,dlg=>{const chosen=[...dlg.querySelectorAll('input[type=checkbox]:checked')].map(x=>x.value);S.skinBones=new Set(chosen);S.selectedBone=[...S.skinBones][0]||'upperArmL';S.envelopes=true;S.vertices=true;sync();const controls=chosen.filter(id=>kindOf(id)!=='Bone').length;tell(controls?`Has afegit ${controls} controls (plataformes, targets, Up Nodes o gizmos): no han de deformar la malla. Treu-los amb Remove.`:`${S.skinBones.size} ossos deformadors assignats a Skin.`);},{ok:'Select',width:590});
  dlg.querySelector('#cat-bone-search')?.addEventListener('input',e=>{for(const r of dlg.querySelectorAll('.cat-select-row'))r.hidden=!r.dataset.boneName.includes(e.target.value.toLowerCase());});
}
function gizmoDialog(id){
  if(S.mode!=='Setup')return tell('Add Gizmo es fa en Setup Mode.');
  if(kindOf(id)!=='Bone')return tell('Add Gizmo només funciona sobre peces CAT (ossos i hubs).');
  const dlg=max.dialog('Gizmos.max',`<div class="cat-panel-list cat-gizmo-lib">${GIZMO_SHAPES.map((shape,i)=>`<label class="cat-select-row"><input type="radio" name="cat-gizmo-shape" value="${shape}" ${i===(id==='ribcage'?1:0)?'checked':''}> ${shape}</label>`).join('')}</div><p class="cat-panel-note">Forma per a ${esc(fullName(id))}.</p>`,d=>{const shape=d.querySelector('input[name=cat-gizmo-shape]:checked')?.value||'Circle';pushUndo();S.gizmos.add(id);S.gizmoSettings[id]={radius:1.25,...(S.gizmoSettings[id]||{}),shape};sync();select(`gizmo:${id}`,'modify');tell(`Gizmo ${shape} afegit a ${fullName(id)}. Ajusta Radius perquè sobresurti de la malla.`);},{ok:'OK',width:300});
  return dlg;
}
function weightTool() {
  if(S.selectedVertex==null) { tell('Activa Vertices i selecciona un punt del colze.'); return; }
  max.dialog('Weight Tool',`<p>Vertex ${S.selectedVertex+1} · ${esc(fullName(S.selectedBone))}</p><div class="cat-panel-grid">${[0,.25,.5,.75,1].map(n=>btn(n.toFixed(2),`tool-weight:${n}`)).join('')}${btn('Blend','tool-blend')}</div><p>El pes de l’altre os compensa fins a 1.0 en aquesta pràctica de dos ossos.</p>`,null,{ok:'Close',cancel:'',width:350});
}
function weightTable() {
  max.dialog('Weight Table',`<div class="cat-weight-table"><table><thead><tr><th>Vertex</th><th>Upper Arm</th><th>Forearm</th></tr></thead><tbody>${S.weights.map((w,i)=>`<tr><td>${i+1}</td><td><input type="number" data-table="${i}" value="${w.toFixed(2)}" min="0" max="1" step="0.05"></td><td>${(1-w).toFixed(2)}</td></tr>`).join('')}</tbody></table></div>`,dlg=>{dlg.querySelectorAll('[data-table]').forEach(input=>{S.weights=paintWeight(S.weights,+input.dataset.table,+input.value);});sync();},{width:390});
}
// Animation Mode works on a layer: the Setup pose is kept and comes back when you return to Setup Mode.
function enterAnimation(){
  if(!S.absLayers.length)return tell('Crea primer una capa Absolute al Layer Manager.');
  if(S.mode==='Animation')return;
  S.setupPose=structuredClone(Object.fromEntries(POSE_KEYS.map(key=>[key,S[key]])));
  S.animLengths={};for(const limb of ['legL','legR','armL','armR']){const [a,b,c]=limb.startsWith('leg')?['hip','knee','ankle']:['shoulder','elbow','wrist'],side=limb.at(-1);if(S.joints[a+side])S.animLengths[limb]=[Math.hypot(...px3(b+side).map((v,i)=>v-px3(a+side)[i])),Math.hypot(...px3(c+side).map((v,i)=>v-px3(b+side)[i]))];}
  for(const side of SIDES)if(hasLeg(S,side))pinFootTarget(S,side);
  S.mode='Animation';S.restored=false;sync();tell('Animation Mode: prova la plataforma, l’IK Target i la pelvis amb moviments petits.');
}
function enterSetup(){
  if(S.mode==='Setup')return;
  if(S.setupPose)Object.assign(S,structuredClone(S.setupPose));
  S.setupPose=null;S.animLengths=null;S.mode='Setup';S.restored=S.tested.size>0;sync();tell('Setup Mode: el rig torna a la pose de repòs. La capa conserva la prova.');
}
// Copy / Paste / Paste Mirror of one bone (Bone, Ankle, Palm or Digit Setup), as in 3ds Max: pivots, rotation and sizes.
const BONE_JOINTS={thigh:['hip','knee'],shin:['knee','ankle'],ankle:['ankle'],upperArm:['shoulder','elbow'],forearm:['elbow','wrist'],palm:['wrist'],arm:['shoulder']};
let boneClipboard=null;
const boneParts=id=>/^(thigh|shin|ankle|upperArm|forearm|palm|arm|footDigit|handDigit)([LR])(\d?)$/.exec(baseId(id));
function copyBone(id){
  const m=boneParts(id);if(!m)return tell('Aquesta peça no té Copy Bone Setup.');
  const [,part,side,digit]=m,base=baseId(id),key=side+digit;
  boneClipboard={part,side,digit,joints:(BONE_JOINTS[part]||[]).map(n=>[n,jointPosition(S,n+side).toArray()]),size:structuredClone(S.boneSizes[base]),segments:S.segmentsById[base],
    partRotation:structuredClone(S.partRotations[base]),ankleRotation:part==='ankle'?structuredClone(S.ankleRotations[side]):undefined,ankleSize:part==='ankle'?structuredClone(S.ankleSizes[side]):undefined,
    toeRotation:part==='footDigit'?structuredClone(S.footDigitRotations[key]):undefined,toeOffset:part==='footDigit'?structuredClone(S.footDigitOffsets[key]):undefined};
  tell(`${fullName(base)} copiat: posició, rotació i mides.`);
}
function pasteBone(id,mirrored){
  if(!boneClipboard)return tell('Copia primer un os (botó Copy del rollout).');
  if(S.mode!=='Setup')return tell('Torna a Setup Mode per enganxar paràmetres d’un os.');
  const m=boneParts(id);if(!m||m[1]!==boneClipboard.part)return tell('Només pots enganxar-ho en el mateix tipus d’os (per exemple, d’un Ankle a l’altre Ankle).');
  const [,part,side,digit]=m,base=baseId(id),key=side+digit,from=boneClipboard;
  pushUndo();
  const leg=['thigh','shin','ankle','footDigit'].includes(part);
  const {centre,reflection}=leg?hubMirror(S,'pelvis','pelvis'):hubMirror(S,'ribcage','chest');
  const point=v=>{const p=new THREE.Vector3(...v);return mirrored?p.sub(centre).applyMatrix4(reflection).add(centre):p;};
  const turn=v=>v&&(mirrored?mirrorEuler(v,reflection):structuredClone(v));
  if(leg)pinFootTarget(S,side);
  const names=[];
  for(const [n,v] of from.joints){const p=point(v);S.joints[n+side]=[300+p.x*225,480-p.y*225];S.jointDepths[n+side]=p.z;names.push(n+side);}
  if(from.size)S.boneSizes[base]=structuredClone(from.size);
  if(from.segments)S.segmentsById[base]=from.segments;
  if(from.partRotation)S.partRotations[base]=turn(from.partRotation);
  if(part==='ankle'){if(from.ankleRotation)S.ankleRotations[side]=turn(from.ankleRotation);else delete S.ankleRotations[side];if(from.ankleSize)S.ankleSizes[side]=structuredClone(from.ankleSize);}
  if(part==='footDigit'){if(from.toeRotation)S.footDigitRotations[key]=turn(from.toeRotation);else delete S.footDigitRotations[key];if(from.toeOffset)S.footDigitOffsets[key]=mirrored?new THREE.Vector3(...from.toeOffset).applyMatrix4(reflection).toArray():[...from.toeOffset];else delete S.footDigitOffsets[key];}
  if(names.length)invalidateLegSetup(S,names);
  afterSetupEdit();sync();
  tell(mirrored?`Enganxat en mirall a ${fullName(base)}.`:`Enganxat a ${fullName(base)}.`);
}
function copyLimb(info){limbClipboard={limb:info.limb,side:info.side,arm:info.limb.startsWith('arm'),segments:Object.fromEntries(Object.entries(S.segmentsById).filter(([k])=>k.endsWith(info.side))),sizes:Object.fromEntries(Object.entries(S.boneSizes).filter(([k])=>k.endsWith(info.side))),joints:(info.limb.startsWith('arm')?['shoulder','elbow','wrist']:['hip','knee','ankle']).map(n=>[n,jointPosition(S,n+info.side)])};tell(`Limb Settings de ${info.side}${limbClipboard.arm?'Arm':'Leg'} copiats.`);}
function pasteLimb(info,mirrored){
  if(!limbClipboard)return tell('Copia primer els paràmetres d’una extremitat (Copy Limb Settings).');
  if(limbClipboard.arm!==info.limb.startsWith('arm'))return tell('Només pots enganxar paràmetres d’un braç a un braç, o d’una cama a una cama.');
  pushUndo();const from=limbClipboard.side,to=info.side;
  for(const [k,v] of Object.entries(limbClipboard.segments))S.segmentsById[k.slice(0,-1)+to]=v;
  for(const [k,v] of Object.entries(limbClipboard.sizes))S.boneSizes[k.slice(0,-1)+to]=structuredClone(v);
  if(mirrored&&from!==to){const centre=jointPosition(S,limbClipboard.arm?'chest':'pelvis');for(const [n,p] of limbClipboard.joints){S.joints[n+to]=[300+(2*centre.x-p.x)*225,480-p.y*225];S.jointDepths[n+to]=p.z;}invalidateLegSetup(S,limbClipboard.joints.map(([n])=>n+to));afterSetupEdit();}
  sync();tell(mirrored?'Limb Settings enganxats en mirall. La còpia no substitueix la revisió dels pivots: compara-ho en dues vistes.':'Segments i mides enganxats.');
}
// Delete (key Delete or Edit › Delete): a leg is deleted from any of its bones, its platform or its Up Node.
function deleteSelected(){
  const sel=S.selected||'',base=baseId(sel);
  if(!sel||sel==='mesh'||sel==='catparent')return tell('Selecciona una peça del rig per eliminar-la.');
  if(S.mode!=='Setup')return tell('Torna a Setup Mode per eliminar peces del rig.');
  if(sel.startsWith('gizmo:')){pushUndo();S.gizmos.delete(sel.slice(6));delete S.gizmoSettings[sel.slice(6)];S.selected=sel.slice(6);sync();return tell('Gizmo eliminat.');}
  const leg=/^(thigh|shin|ankle|footDigit|foot|legUp)([LR])/.exec(base);
  if(leg){pushUndo();removeLeg(S,leg[2]);S.selected='pelvis';sync();return tell(`Cama ${leg[2]} eliminada. Amb la pelvis seleccionada, Add Leg la torna a crear (mirall de l’altra cama si n’hi ha).`);}
  if(base==='tail'||base==='extra'){pushUndo();S[base]=false;S.selected='pelvis';sync();return tell('Os eliminat.');}
  tell('En aquest lab només es poden eliminar les cames, els gizmos i els ossos extra.');
}
function handleAction(action) {
  const sel=S.selected||'',base=baseId(sel),info=LIMB_OF(base);
  if(action==='arm') { pushUndo();S.objectClass='CAT Objects';S.armed=true; max.showTab('create'); tell('CATParent actiu. Fes clic i arrossega al terra, al centre del personatge, per dimensionar la base.'); return; }
  if(action.startsWith('select:')) return select(action.slice(7),'modify');
  if(action.startsWith('link-tab:')) {S.linkTab=action.slice(9);max.showTab('hierarchy');return;}
  if(action.startsWith('preset:')) { pushUndo();S.preset=action.slice(7);max.showTab(max.state.tab); return; }
  if(action==='create-pelvis') return addPart('pelvis');
  if(action==='add-leg') return addPart('leg');
  if(action==='add-spine') return addPart('spine');
  if(action==='add-arm') return addPart('arm');
  if(action==='add-tail') return addPart('tail');
  if(action==='add-extra') return addPart('extra');
  if(action==='hub-copy') {hubClipboard={size:{...hubSize(base)},color:hubColor(base)};tell('Hub Setup copiat.');return;}
  if(action==='hub-paste'||action==='hub-paste-mirror') {if(!hubClipboard)return tell('Copia primer els paràmetres d’un hub.');pushUndo();S.hubColors[base]=hubClipboard.color;S.hubSizes[base]={...hubClipboard.size};sync();return;}
  if(action==='bone-copy')return copyBone(sel);
  if(action==='bone-paste'||action==='bone-paste-mirror')return pasteBone(sel,action==='bone-paste-mirror');
  if(action==='limb-copy'&&info)return copyLimb(info);
  if((action==='limb-paste'||action==='limb-paste-mirror')&&info)return pasteLimb(info,action==='limb-paste-mirror');
  if(action==='up-node'&&info){
    pushUndo();const limb=info.limb;
    if(S.upNodes[limb])delete S.upNodes[limb];
    else{const joint=limb.startsWith('leg')?`knee${info.side}`:`elbow${info.side}`;S.upNodes[limb]=[...S.joints[joint],jointDepthOf(S,joint)];tell(limb.startsWith('leg')?'Up Node creat al genoll: mou-lo cap endavant (Local) fins que quedi davant de la cama.':'Up Node creat al colze: mou-lo cap enrere fins que quedi darrere del braç.');}
    sync();select(S.upNodes[limb]?(limb.startsWith('leg')?`legUp${info.side}`:`armUp${info.side}`):sel,'modify');return;
  }
  if(action==='ik-target'&&/^palm[LR]$/.test(base)) { pushUndo();const side=base.at(-1);S.ikTargets[side]=[...S.joints[`wrist${side}`],jointDepthOf(S,`wrist${side}`)];S.targetDisplay[`ik${side}`]='cross';S.ikfk[`arm${side}`]=0;sync();select(`ik${side}`,'modify');tell('IK Target creat al canell (Display: Cross). A Modify canvia Cross per Platform perquè sigui fàcil de seleccionar.'); return; }
  if(action==='limb-end'||action==='ik-to-end'||action==='match-ikfk'){
    const helper=/^(foot|ik)([LR])$/.exec(base),limb=info?.limb||(helper?`${helper[1]==='foot'?'leg':'arm'}${helper[2]}`:null);if(!limb)return;
    const side=limb.at(-1),leg=limb.startsWith('leg');
    if(action==='limb-end')return select(leg?`ankle${side}`:`palm${side}`,'motion');
    pushUndo();
    // Bring the IK Target to the end of the limb as it is now (Match IK and FK makes the IK pose equal the FK pose).
    if(leg){S.footTargets[side]=[...S.joints[`ankle${side}`],jointDepthOf(S,`ankle${side}`)];S.pinnedFootTargets[side]=true;delete S.footOffsets[side];}
    else if(S.ikTargets[side])S.ikTargets[side]=[...S.joints[`wrist${side}`],jointDepthOf(S,`wrist${side}`)];
    sync();return tell(action==='match-ikfk'?'IK i FK coincideixen: el target s’ha col·locat al final de l’extremitat.':`IK Target mogut a ${leg?'l’Ankle':'el Palm'}.`);
  }
  if(action==='delete')return deleteSelected();
  if(action==='subobject-info'||action==='noop')return;
  if(action==='motion-paths-info')return tell('Motion Paths mostra la trajectòria animada; es fa servir en animació.');
  if(action==='editable-gizmo') { const id=sel.slice(6);pushUndo();S.gizmoSettings[id]={...(S.gizmoSettings[id]||{}),editable:true};S.splineSub=true;sync();tell('Gizmo convertit a Editable Spline. Al subobjecte Spline, mou, gira o escala el contorn: el pivot de l’os no es mou.');return; }
  if(action==='spline-sub') { S.splineSub=!S.splineSub;max.showTab('modify');draw();return; }
  if(action==='spline-top') { S.splineSub=false;max.showTab('modify');draw();return; }
  if(action.startsWith('dm-digit:')) { const i=+action.slice(9);S.digitSel[i]=!S.digitSel[i];max.showTab('motion');return; }
  if(action.startsWith('dm-preset:')&&info) { const name=action.slice(10),poses=PRESETS[name]();pushUndo();S.digitPreset=name;S.digitPoses[info.side]=Object.fromEntries(poses.map((p,i)=>[i,{curl:0,bend:0,spread:0,roll:0,...p}]));if(name!=='<..>')S.tested.add('curl');max.showTab('motion');draw();renderTask();return; }
  if(action==='apply-skin') { pushUndo();S.skin=true; sync(); tell('Skin aplicat. Prem Add a Parameters per triar només els ossos CAT deformadors.'); return; }
  if(action==='add-bones') return boneDialog();
  if(action==='envelopes') { pushUndo();S.envelopes=!S.envelopes;S.vertices=S.envelopes;sync(); return; }
  if(action==='weight-tool') return weightTool();
  if(action==='weight-table') return weightTable();
  if(action==='paint-toggle') { pushUndo();S.paint=!S.paint;sync();return; }
  if(action==='remove-bone') {S.skinBones.delete(S.selectedBone);S.selectedBone=[...S.skinBones][0]||'upperArmL';sync();return;}
  if(action==='mirror') { pushUndo();S.mirror=!S.mirror;sync();return; }
  if(action==='add-layer') { pushUndo();const name=`Absolute Layer ${String(S.absLayers.length+1).padStart(2,'0')}`;S.absLayers.push(name);S.activeLayer=S.absLayers.length-1;sync();tell(`Capa Absolute «${name}» creada i activa. Ara pots activar Animation Mode.`);return; }
  if(action.startsWith('layer:')) {S.activeLayer=+action.slice(6);sync();tell(`Capa «${S.absLayers[S.activeLayer]}» activa.`);return;}
  if(action==='setup') return enterSetup();
  if(action==='animation') return enterAnimation();
  if(action.startsWith('bone:')) { S.selectedBone=action.slice(5);max.showTab('modify');draw();return; }
  if(action.startsWith('tool-weight:')) { S.weights=paintWeight(S.weights,S.selectedVertex,+action.slice(12));sync();return; }
  if(action==='tool-blend') { const i=S.selectedVertex;S.weights=paintWeight(S.weights,i,(S.weights[Math.max(0,i-1)]+S.weights[Math.min(9,i+1)])/2);sync();return; }
  if(action==='reload') { pushUndo();S.joints=structuredClone(initialJoints);S.partRotations={};S.footRotations={};S.ankleRotations={};S.footOffsets={};S.spineSegs={};S.spineBase={};S.jointDepths={};S.footTargets={};S.pinnedFootTargets={};S.legIKLengths={};S.legIKRest={};sync();tell('Pose de Setup restaurada. A 3ds Max, Reload llegeix el fitxer RG3 desat.');return; }
  if(action==='preset-open'||action==='preset-save') return tell('Els fitxers RG3 es carreguen i desen a 3ds Max des de CATRig Load Save.');
  if(action==='rigging-info') return tell('Add Rigging afegeix malles i props al preset RG3 del rig.');
  if(action==='catmotion-info') return tell('CATMotion es treballa al lab següent: crea cicles procedimentals en una capa pròpia.');
  if(action==='motion-extraction') return tell('Motion Extraction Node separa el desplaçament del personatge; es fa servir en animació, no en la construcció.');
  if(action==='muscle-info') return tell('CATMuscle i Muscle Strand no formen part d’aquesta pràctica.');
}

// ── Solution ──
function setJointTarget(name){S.joints[name]=[...targetJoints[name]];S.jointDepths[name]=targetDepths[name];}
function applySolution(stage){
  pushUndo();
  if(S.mode==='Animation')enterSetup();
  Object.assign(S,{objectClass:'CAT Objects',root:true,armed:false,baseRadius:1,preset:'none',rigName:'CATRig',parentTransform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},catScale:1});
  if(stage>=1){
    Object.assign(S,{pelvis:true,legs:2,legSides:['L','R'],footDigitRotations:{},footDigitOffsets:{},footDigits:1,footDigitBones:1,footTargets:{},pinnedFootTargets:{},legIKLengths:{},legIKRest:{},footRotations:{},ankleRotations:{},footOffsets:{}});
    for(const name of ['pelvis','hipL','kneeL','ankleL','hipR','kneeR','ankleR'])setJointTarget(name);
  }
  if(stage>=2){
    Object.assign(S,{spine:true,spineBones:3,arms:0,collarbone:true,palm:true});resetSpine(S,'spine');resetSpine(S,'neck');S.renames.ribcage='Chest';
    for(const name of ['chest','shoulderL','elbowL','wristL'])setJointTarget(name);
    S.armSetupLengths={};addArmFromSetup(S,{keepJoints:true});
  }
  if(stage>=3){
    S.segmentsById={...S.segmentsById,forearmL:3,shinL:2,shinR:2};
    S.upNodes={...S.upNodes,legL:[...targetJoints.kneeL,targetDepths.kneeL+.45],legR:[...targetJoints.kneeR,targetDepths.kneeR+.45],armL:[...targetJoints.elbowL,targetDepths.elbowL-.45]};
  }
  if(stage>=4){
    S.handDigits=5;S.digitBoneCounts=[3,3,3,3,3];S.tested.add('curl');
    if(S.arms<2)addArmFromSetup(S);
    for(const side of SIDES){S.ikTargets[side]=[...S.joints[`wrist${side}`],jointDepthOf(S,`wrist${side}`)];S.targetDisplay[`ik${side}`]='platform';S.ikfk[`arm${side}`]=0;}
  }
  if(stage>=5){S.head=true;S.headBones=2;resetSpine(S,'neck');setJointTarget('head');}
  if(stage>=6){
    const shapes={pelvis:'Circle',ribcage:'Rectangle',head:'Circle',neck:'Circle',armL:'Circle',upperArmL:'Circle',forearmL:'Circle',armR:'Circle',upperArmR:'Circle',forearmR:'Circle',thighL:'Circle',shinL:'Circle',thighR:'Circle',shinR:'Circle',handDigitL1:'Circle',handDigitR1:'Circle'};
    for(const [id,shape] of Object.entries(shapes)){S.gizmos.add(id);S.gizmoSettings[id]={radius:id==='pelvis'?1.5:1.3,shape,...(id==='ribcage'?{editable:true,sx:1.2}:{})};}
  }
  if(stage>=7){if(!S.absLayers.length)S.absLayers=['Absolute Layer 01'];S.activeLayer=0;['foot','ik','pelvis'].forEach(t=>S.tested.add(t));S.restored=true;S.mode='Setup';}
  if(stage>=8){S.skin=true;S.skinBones=new Set(listObjects().filter(o=>o.kind==='Bone').map(o=>o.id));S.envelopes=true;S.vertices=true;S.boneAffectLimit=3;}
  afterSetupEdit();
  const focus=['catparent','kneeL','ribcage','forearmL','palmL','neck','gizmo:ribcage','footL','mesh'][stage];
  sync();select(has(focus)?focus:'catparent',stage===7?'motion':'modify');tell('S’ha mostrat una possible solució d’aquesta etapa: compara-la amb el teu rig a Front i Left.');
}

// ── 3ds Max shell ──
const setView=name=>{S.view=name;max.setViewLabel(name);cat3d?.setView(name);draw();};
max=createMaxShell(root,{file:'CATRig_Practice.max',objects:listObjects(),selected:S.selected,pages:{create:'',modify:'',motion:'',hierarchy:''},tab:'create',fps:30,units:'m',explorer:innerWidth>900,
  actions:{undo,redo,commandPanel:renderCommand,selectObject:id=>select(id),frame:f=>max.setTime({frame:f}),viewFront:()=>setView('Front'),viewLeft:()=>setView('Left'),delete:()=>deleteSelected(),viewTop:()=>setView('Top'),viewPerspective:()=>setView('Perspective'),wireframe:()=>{S.wire=!S.wire;max.setViewLabel(null,S.wire?'Wireframe':'Default Shading');cat3d?.setWireframe(S.wire);draw();},refCoord:()=>{S.coord={View:'World',World:'Local',Local:'View'}[S.coord]||'View';const control=$('cat-refcoord');if(control)control.value=S.coord;draw();},select:()=>{S.transformTool='select';max.setModes({tool:'select'});draw();},move:()=>{S.transformTool='move';max.setModes({tool:'move'});draw();},rotate:()=>{S.transformTool='rotate';max.setModes({tool:'rotate'});draw();},scale:()=>{S.transformTool='scale';max.setModes({tool:'scale'});draw();},
    importObj:()=>$('obj-file').click(),catCreate:()=>{max.showTab('create');handleAction('arm');},catModify:()=>{max.showTab('modify');},catMotion:()=>{max.showTab('motion');}},
  menus:{File:[{label:'Import...',action:'importObj'}],Create:[{label:'Helpers › CAT Objects › CATParent',action:'catCreate'}],Modifiers:[{label:'Animation Modifiers › Skin',run:()=>{select('mesh','modify');handleAction('apply-skin');}}],Animation:[{label:'CAT Character › Layer Manager',action:'catMotion'}]}});
max.setViewLabel('Perspective','Default Shading');
const filterControl=root.querySelector('.mx-toolbar .mx-drop[title="Selection Filter"]');
if(filterControl)filterControl.outerHTML='<select id="cat-selection-filter" class="mx-drop cat-selection-filter" aria-label="Selection Filter"><option>All</option><option>CATBone</option></select>';
const coordControl=root.querySelector('#mx-refcoord');
if(coordControl)coordControl.outerHTML='<select id="cat-refcoord" class="mx-drop cat-refcoord" aria-label="Reference Coordinate System"><option>View</option><option>World</option><option>Local</option></select>';
max.host.innerHTML='<div class="cat-vp" id="cat-vp"><img class="cat-reference" id="cat-reference" alt="Referència del personatge" hidden><div class="cat-vp-note" id="cat-vp-note"></div></div>';
root.insertAdjacentHTML('beforeend','<input id="obj-file" type="file" accept=".obj" hidden>');
function draw() {
  cat3d?.update();
  const canvas=$('cat-vp')?.querySelector('.cat-canvas');if(canvas&&S.armed)canvas.style.cursor='crosshair';
  $('cat-vp-note').textContent=S.armed?'CATParent: clic + arrossega al terra · origen 0,0,0':S.selected==='mesh'&&S.envelopes?'Skin · selecciona o pinta els pesos':S.mode==='Animation'?`Animation Mode · ${S.absLayers[S.activeLayer]||'capa'} · torna a Setup per recuperar el repòs`:S.root?`Setup Mode · ${S.view} · arrossega els extrems dels ossos per col·locar els pivots · clic dret: Add Gizmo`:'Vista 3D · Alt+X: transparència';
  const img=$('cat-reference');img.hidden=!S.reference;img.src=S.reference||'';
}
root.addEventListener('click',e=>{const b=e.target.closest('[data-cat]');if(b&&!b.disabled)handleAction(b.dataset.cat);});
function renameFrom(el){const id=el.dataset.rename||S.selected;if(!id)return;let value=el.value.trim().slice(0,40);if(value.startsWith(S.rigName))value=value.slice(S.rigName.length);if(value)S.renames[id]=value;else delete S.renames[id];max.setObjects(listObjects(),S.selected);}
root.addEventListener('input',e=>{
  const el=e.target,v=+el.value;
  if(el.classList.contains('cat-rename')){renameFrom(el);return;}
  if(el.id==='mx-objname'){if(!S.selected||S.selected==='catparent')return;if(S.selected==='mesh'){S.objName=el.value.trim().slice(0,30)||null;max.setObjects(listObjects(),S.selected);return;}renameFrom(Object.assign(document.createElement('input'),{value:el.value}));return;}
  if(el.id==='cat-name') { S.rigName=el.value.trim().replace(/[^\p{L}\p{N}_-]/gu,'').slice(0,24)||'CATRig'; max.setObjects(listObjects(),S.selected); renderTask(); return; }
  if(el.id==='cat-hub-color') {S.hubColors[baseId(S.selected)]=el.value;max.setObjects(listObjects(),S.selected);draw();return;}
  if(!Number.isFinite(v))return;
  if(['cat-hub-length','cat-hub-width','cat-hub-height'].includes(el.id)){const id=baseId(S.selected);S.hubSizes[id]??={...hubSize(id)};S.hubSizes[id][el.id.slice(8)]=v;draw();return;}
  if(el.id==='cat-scale') { S.catScale=Math.max(.5,Math.min(2,v));draw();renderTask(); }
  if(el.id==='cat-effect'&&S.selectedVertex!=null) { S.weights=paintWeight(S.weights,S.selectedVertex,v);draw(); }
  const dm=/^cat-dm-(spread|bend|roll|curl)$/.exec(el.id);
  if(dm){const side=sideOf(S.selected);if(!side)return;S.digitPoses[side]??={};S.digitSel.forEach((on,i)=>{if(on&&i<S.handDigits)S.digitPoses[side][i]={curl:0,bend:0,spread:0,roll:0,...(S.digitPoses[side][i]||{}),[dm[1]]:Math.max(-90,Math.min(90,v))};});S.digitPreset='';if(dm[1]==='curl'&&v!==0)S.tested.add('curl');draw();renderTask();return;}
  const gz=/^cat-gz-(sx|sy|rot|offset)$/.exec(el.id);
  if(gz){const g=S.gizmoSettings[S.selected.slice(6)];if(!g)return;g[gz[1]]=gz[1]==='rot'?v:v/100;draw();return;}
  if(el.id==='cat-gizmo-radius'){const g=S.gizmoSettings[S.selected.slice(6)];if(g){g.radius=Math.max(.3,Math.min(4,v));draw();}return;}
});
root.addEventListener('change',e=>{
  const el=e.target,base=baseId(S.selected||'');
  if(el.id==='cat-object-class'){S.objectClass=el.value;S.armed=false;sync();return;}
  if(el.id==='cat-modifier-list'){if(el.value==='Skin')handleAction('apply-skin');else if(el.value)tell(`El modificador ${el.value} no forma part d'aquest exercici.`);return;}
  if(el.classList.contains('cat-rename')||el.id==='mx-objname'){sync();return;}
  if(el.id==='cat-selection-filter') {S.filter=el.value;if(S.filter==='CATBone'&&S.selected&&kindOf(S.selected)!=='Bone')S.selected=listObjects().find(o=>o.kind==='Bone')?.id||null;sync();return;}
  if(el.id==='cat-refcoord') {S.coord=el.value;draw();return;}
  if(el.id==='cat-name') { sync();return; }
  if(el.name==='cat-track'){S.trackDisplay=el.value;return;}
  if(el.name==='cat-axis') { S.lengthAxis=el.value;sync();return; }
  if(el.id==='cat-scale') { S.catScale=Math.max(.5,Math.min(2,+el.value||1));sync();return; }
  if(el.id==='cat-hub-custom') {S.customHubMeshes[base]=el.checked;tell(el.checked?'A 3ds Max, Use Custom Mesh permet triar una malla pròpia per al hub.':'S’ha desactivat Use Custom Mesh.');return;}
  if(['cat-hub-length','cat-hub-width','cat-hub-height'].includes(el.id)) {S.hubSizes[base]??={...hubSize(base)};S.hubSizes[base][el.id.slice(8)]=Math.max(1,Math.min(100,+el.value||1));sync();return;}
  if(el.id==='cat-segments') { pushUndo();S.segmentsById[base]=Math.max(1,Math.min(8,Math.round(+el.value||1)));sync();return; }
  if(el.id==='cat-bone-length') { pushUndo();setBoneLength(base,Math.max(.05,(+el.value||0)/100));sync();return; }
  if(['cat-ankle-length','cat-ankle-width','cat-ankle-height'].includes(el.id)) {const side=base.at(-1),key=el.id.slice('cat-ankle-'.length);S.ankleSizes[side]??={length:15,width:6,height:6};S.ankleSizes[side][key]=Math.max(1,Math.min(40,+el.value||1));sync();return;}
  if(el.id==='cat-spine-bones') {pushUndo();const n=Math.max(1,Math.min(10,Math.round(+el.value||1)));if(base==='neck')S.headBones=n;else S.spineBones=n;resetSpine(S,base==='neck'?'neck':'spine');sync();return;}
  if(el.id==='cat-bone-width'||el.id==='cat-bone-depth') {S.boneSizes[base]??={...chainDefault(base)};S.boneSizes[base][el.id==='cat-bone-width'?'width':'depth']=Math.max(.01,(+el.value||1)/100);sync();return;}
  if(el.id==='cat-hand-digits') {pushUndo();S.handDigits=Math.max(0,Math.min(5,Math.round(+el.value||0)));sync();return;}
  if(el.id==='cat-foot-digits') {pushUndo();S.footDigits=Math.max(0,Math.min(5,Math.round(+el.value||0)));sync();return;}
  if(el.id==='cat-digit-bones') {pushUndo();const n=Math.max(1,Math.min(5,Math.round(+el.value||1)));if(base.startsWith('handDigit'))S.digitBoneCounts[+base.at(-1)]=n;else S.footDigitBones=n;sync();return;}
  if(el.id==='cat-affect-limit') {S.boneAffectLimit=+el.value;sync();return;}
  if(el.id==='cat-paint-value') { S.paintValue=Math.max(0,Math.min(1,+el.value));sync();return; }
  if(el.id==='cat-paint-blend'){S.paintBlend=el.checked;sync();return;}
  if(el.id==='cat-vertices'){S.vertices=el.checked;sync();return;}
  if(el.id==='cat-collar'){pushUndo();S.collarbone=el.checked;sync();return;}
  if(el.id==='cat-palm'){pushUndo();S.palm=el.checked;sync();return;}
  if(el.id==='cat-stretch') {S.stretchById[base]=el.checked;sync();return;}
  if(el.dataset.lock) {S.locksById[base]??={};S.locksById[base][el.dataset.lock]=el.checked;sync();return;}
  if(el.name==='cat-ik-display') {pushUndo();S.targetDisplay[base]=el.value;sync();return;}
  if(el.id==='cat-target-length'||el.id==='cat-target-width') {S.targetSize[base]={...targetSizeOf(base),[el.id.slice(11)]:Math.max(1,Math.min(100,+el.value||20))};sync();return;}
  const limbOfSel=()=>{const h=/^(foot|ik)([LR])$/.exec(base);return LIMB_OF(base)?.limb||(h?`${h[1]==='foot'?'leg':'arm'}${h[2]}`:null);};
  const rangeId=el.dataset.range||el.id;
  if(['cat-ikfk','cat-ik-bones','cat-retarget'].includes(rangeId)){const limb=limbOfSel();if(!limb)return;const v=Math.max(0,+el.value||0);
    if(rangeId==='cat-ikfk'){pushUndo();S.ikfk[limb]=Math.min(1,v);if(limb.startsWith('arm'))solveArm(limb.at(-1));else solveLeg(limb.at(-1));}
    else if(rangeId==='cat-ik-bones')S.ikBones[limb]=Math.max(1,Math.min(3,Math.round(v)));else S.retarget[limb]=Math.min(1,v);
    sync();return;}
  if(el.id==='cat-fk-display'){const limb=limbOfSel();if(limb){S.fkDisplay[limb]=el.checked;sync();}return;}
  if(/^cat-dm-|^cat-gz-|^cat-gizmo-radius$/.test(el.id)){sync();return;}
});
$('steps').addEventListener('click',e=>{const b=e.target.closest('[data-stage]');if(!b)return;S.stage=+b.dataset.stage;S.message='';renderTask();const focus=[null,'pelvis','ribcage','forearmL','palmL','ribcage',null,'pelvis','mesh'][S.stage];if(S.stage===0)max.showTab(S.root?'modify':'create');else if(focus&&has(focus))select(focus,S.stage===7?'motion':'modify');draw();});
$('task-card').addEventListener('click',e=>{const action=e.target.closest('[data-lab]')?.dataset.lab;if(!action)return;
  if(action==='reset'){if(S.reference)URL.revokeObjectURL(S.reference);location.reload();return;}
  if(action==='next'){if(stageDone())$('steps').querySelector(`[data-stage="${S.stage+1}"]`)?.click();return;}
  if(action==='solution')applySolution(S.stage);
});
$('reference-file').addEventListener('change',e=>{const file=e.target.files?.[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8e6){tell('Tria una imatge PNG, JPG o WebP de menys de 8 MB.');return;}if(S.reference)URL.revokeObjectURL(S.reference);S.reference=URL.createObjectURL(file);draw();});
$('obj-file').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>12e6)throw new Error('OBJ massa gran per al lab (màxim 12 MB).');cat3d.loadObj(await file.text());S.objName=file.name.replace(/\.obj$/i,'').slice(0,30)||'Imported_OBJ';sync();tell(`${S.objName} importat a la vista 3D. Les comprovacions de pivots es calculen sobre el model de pràctica.`);}catch(err){tell(err.message);}});
cat3d=createCatView($('cat-vp'),S,{
  onPlace:createParent,
  onBeginUndo:pushUndo,
  onSelect:id=>select(id,max.state.tab==='motion'||max.state.tab==='hierarchy'?max.state.tab:'modify'),
  onGizmo:id=>gizmoDialog(id),
  onJoint:(name,point,depth)=>{const legJoint=/^(hip|knee|ankle)([LR])$/.exec(name);if(legJoint)pinFootTarget(S,legJoint[2]);S.joints[name]=point;if(Number.isFinite(depth))S.jointDepths[name]=depth;invalidateLegSetup(S,[name]);afterSetupEdit();draw();},
  onTransform:transformBone,
  onTransformEnd:()=>renderTask(),
  onWeight:i=>{if(S.selected==='mesh'&&S.vertices){S.selectedVertex=i;if(S.paint){if(S.paintBlend)S.blendWeights=paintWeight(S.blendWeights,i,S.paintValue);else S.weights=paintWeight(S.weights,i,S.paintValue);}sync();}},
  onOrbit:()=>{if(S.view!=='Perspective'&&S.view!=='Orthographic'){S.view=cat3d?.isOrtho()?'Orthographic':'Perspective';max.setViewLabel(S.view);}draw();},
  onError:()=>tell('No s’ha pogut carregar el model 3D; es mostra un model de reserva.'),
});
sync();
window.__catRigLab={S,max,cat3d,handleAction,select,applySolution,transformBone,listObjects,stageChecks,chainBones};
window.addEventListener('keydown',event=>{if(event.defaultPrevented||/INPUT|SELECT|TEXTAREA/.test(event.target?.tagName||''))return;if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&!event.shiftKey){event.preventDefault();undo();}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();redo();}});
