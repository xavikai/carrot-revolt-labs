import { createMaxShell, rollout, spinner } from '../_max/max-shell.js';
import { icon } from '../_max/max-icons.js';
import { initialJoints, targetJoints, mirrorJoint, defaultWeights, paintWeight, alignmentScore, solveLegIK } from './core.js';
import { createCatView } from './three-view.js';
import * as THREE from 'three';
import { jointPosition, moveSetupJoints, invalidateLegSetup, pinFootTarget, worldAxisToRig, addArmFromSetup } from './transform-frame.js';
import { legObjects, rotateHierarchyFrames } from './rig-hierarchy.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const btn = (label, action, extra = '') => `<button type="button" class="mx-btn${extra===' on'?' on':''}" data-cat="${action}"${extra===' disabled'?' disabled':''}>${label}</button>`;
const row = (label, control) => `<div class="cat-panel-row"><label>${label}</label>${control}</div>`;
const spin = (id, value, min, max, step = 1, decimals = 0) => spinner({ id, value, min, max, step, decimals, width: 72 });
const tasks = [
  { title:'01 · Model i CATParent', text:'Comprova la malla en postura neutra. A Create › Helpers › CAT Objects, activa CATParent i fes clic i arrossega al terra per crear la base a l’origen 0,0,0. Amb Modify › Create Pelvis afegeix el primer hub; CATUnits Ratio ajusta l’escala global. Alt+X mostra la malla transparent.', route:'Create › Helpers › CAT Objects › CATParent · Modify › CATRig Parameters › CATUnits Ratio.' },
  { title:'02 · Cames i peus', text:'Des de la pelvis fes Add Leg. Col·loca primer la FootPlatform i l’ankle amb coordenades Local; després alinea el genoll amb una petita inclinació. A Ankle Setup crea 1 digit i deixa-li 1 os. Activa Up Node davant del genoll. Repeteix Add Leg per a la segona cama.', route:'Modify › Hub Setup › Add Leg · Ankle Setup › Num Digits · Limb Setup › Use Up Node.' },
  { title:'03 · Columna i braços', text:'A la pelvis, Add Spine; al Spine Setup deixa 3 ossos i situa el hub superior a la caixa toràcica. Des d’aquest hub, Add Arm. Alinea espatlla, colze lleugerament flexionat i canell; replica el braç. Al Selection Filter pots triar CATBones. A l’avantbraç, posa Num Segs a 3.', route:'Modify › Hub Setup › Add Spine / Add Arm · Spine Setup › Bones · Bone Setup › Num Segs.' },
  { title:'04 · Mans i controls IK', text:'Selecciona Palm i crea 5 digits. Al Digit Setup posa 4 ossos a cada dit, excepte 3 al polze. Al Motion panel crea un IKTarget per a la mà i canvia Display de Cross a Rectangle. Activa Up Node per orientar el colze.', route:'Modify › Palm Setup › Num Digits / Digit Setup › Bones · Motion › Limb Animation › Create IKTarget.' },
  { title:'05 · Cap i gizmos', text:'Afegeix una segona spine des del hub superior i redueix-ne els ossos. Des del cap, Add Bone per a la mandíbula i els ulls. Afegeix Gizmos als ossos que s’animaran, ajusta Radius i revisa que les corbes siguin seleccionables.', route:'Modify › Hub Setup › Add Spine · Bone Setup › Add Bone · clic dret › Add Gizmo.' },
  { title:'06 · Skin i pesos', text:'Torna el Selection Filter a All per poder seleccionar la malla i aplicar Skin. Amb Add Bones incorpora només els ossos deformadors: exclou FootPlatform, IKTargets, Up Nodes i Gizmos. A Advanced Parameters posa Bone Affect Limit a 3. Activa Edit Envelopes i ajusta els pesos mentre proves la flexió.', route:'Modify › Skin › Parameters › Add Bones · Advanced Parameters › Bone Affect Limit: 3.' },
  { title:'07 · Link Info i capes', text:'A Hierarchy › Link Info desactiva Manipulation Causes Stretching per braços i cames. Al Motion panel crea dues capes Absolute: T-Pose i Pesos; activa la capa Pesos abans d’animar per comprovar les deformacions sense alterar Setup Mode.', route:'Hierarchy › Link Info › Manipulation Causes Stretching · Motion › Layer Manager › Add Absolute Layer.' },
  { title:'08 · Noms i límits', text:'Reanomena els ossos amb noms entenedors. Als gizmos i controls, limita Move, Rotate i Scale segons el moviment que hagi de fer cada corba. Torna a revisar tots els pivots des de les vistes frontal i lateral.', route:'Modify › Name · Hierarchy › Link Info › Locks · Front / Left / Perspective.' },
];
const S = {
  stage:0, selected:'mesh', preset:'none', objectClass:'Standard', armed:false, root:false, pelvis:false, legs:0, spine:false, arms:0, head:false, rigName:'Character', transformTool:'move', linkTab:'2', paintBlend:false,
  tail:false, extra:false, joints:structuredClone(initialJoints), pelvisDepth:0, depthOffsets:{}, partRotations:{}, jointDepths:{}, footTargets:{}, pinnedFootTargets:{}, legIKLengths:{}, legIKRest:{}, footRotations:{}, footScales:{}, parentTransform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}, mirror:true, catScale:1, lengthAxis:'X',
  skin:false, skinBones:new Set(), envelopes:false, vertices:false, selectedVertex:null, selectedBone:'armL',
  weights:[...defaultWeights], blendWeights:Array(defaultWeights.length).fill(0), paint:false, paintValue:.5, bend:0, segments:1, handDigits:0, footDigits:0, digitBoneCounts:[3,4,4,4,4], footDigitBones:1, collarbone:true, palm:true,
  spineBones:3, headBones:2, ankleBones:2, ankleSizes:{}, boneWidth:.075, boneDepth:.065, boneSizes:{}, hubSizes:{}, hubColors:{}, customHubMeshes:{}, baseRadius:.95, legUpNode:false, armUpNode:false, ikTarget:false, ikDisplay:'cross', gizmos:new Set(), gizmoRadius:.28, jaw:false, eyes:false,
  boneAffectLimit:20, stretchById:{armL:true,armR:true,legL:true,legR:true}, absLayers:[], activeLayer:null, locksById:{}, renames:{}, filter:'All', coord:'View', ik:'FK', digitCurl:0, layer:false, mode:'Setup', view:'Perspective', wire:false, reference:null, objName:null, message:'',
};
let max, cat3d, hubClipboard=null;
const root = $('max-app');
const undoStack=[],redoStack=[];
const cloneState=()=>structuredClone(S);
function pushUndo(){undoStack.push(cloneState());if(undoStack.length>40)undoStack.shift();redoStack.length=0;}
function restoreState(snapshot){const viewSettings={coord:S.coord,view:S.view,transformTool:S.transformTool,wire:S.wire};Object.assign(S,snapshot,viewSettings);sync();}
function undo(){if(!undoStack.length){tell('No hi ha cap acció per desfer.');return;}redoStack.push(cloneState());restoreState(undoStack.pop());tell('Acció desfeta amb Ctrl+Z.');}
function redo(){if(!redoStack.length){tell('No hi ha cap acció per refer.');return;}undoStack.push(cloneState());restoreState(redoStack.pop());tell('Acció refeta amb Ctrl+Y.');}
const boneSize = () => S.boneSizes[S.selected] || {width:S.boneWidth,depth:S.boneDepth};
const hubSize = id => S.hubSizes[id] || {length:25,width:20,height:10};
const hubColor = id => S.hubColors[id] || (id==='pelvis'?'#e2d593':'#e9b4d3');
const named = objects => { for(const object of objects) { if(object.name.startsWith('Character_')) object.name=S.rigName+object.name.slice('Character'.length); if(S.renames[object.id])object.name=S.renames[object.id]; } return objects; };
const listObjects = () => {
  const a = [{ id:'mesh', name:S.objName || 'Character_Mesh', kind:'Geometry', color:'#969e9f' }];
  if (!S.root) return named(a);
  a.push({ id:'catparent', name:'CATParent001', kind:'Helper', color:'#80d5ac' });
  if (!S.pelvis) return named(a);
  a.push({ id:'pelvis', name:'Character_Pelvis', kind:'Bone', parent:'catparent', color:hubColor('pelvis') });
  for(const side of ['L','R']) if(S.legs >= (side==='L'?1:2)) a.push(...legObjects(side));
  if (S.spine) a.push({ id:'spine', name:'Character_Spine', kind:'Bone', parent:'pelvis', color:'#43a9d8' }, { id:'ribcage', name:'Character_Ribcage', kind:'Bone', parent:'spine', color:hubColor('ribcage') });
  for(const side of ['L','R']) if(S.arms >= (side==='L'?1:2)) a.push(
    {id:`arm${side}`,name:`Character_${side}Arm`,kind:'Bone',parent:'ribcage',color:'#d990a9'},
    {id:`upperArm${side}`,name:`Character_${side}UpperArm`,kind:'Bone',parent:`arm${side}`,color:'#d990a9'},
    {id:`forearm${side}`,name:`Character_${side}Forearm`,kind:'Bone',parent:`upperArm${side}`,color:'#d990a9'},
    {id:`palm${side}`,name:`Character_${side}Palm`,kind:'Bone',parent:`forearm${side}`,color:'#d990a9'});
  if (S.head) a.push({ id:'head', name:'Character_Head', kind:'Bone', parent:'ribcage', color:'#43a9d8' });
  if (S.head && S.jaw) a.push({ id:'jaw', name:'Character_Jaw', kind:'Bone', parent:'head', color:'#dba6c8' });
  if (S.head && S.eyes) for(const side of ['L','R']) a.push({ id:`eye${side}`, name:`Character_${side}Eye`, kind:'Bone', parent:'head', color:'#9cd9d6' });
  if (S.legUpNode) for(const side of ['L','R']) if(S.legs >= (side==='L'?1:2)) a.push({id:`legUp${side}`,name:`Character_${side}LegUpNode`,kind:'Helper',parent:`leg${side}`,color:'#a5d4e5'});
  if (S.armUpNode) for(const side of ['L','R']) if(S.arms >= (side==='L'?1:2)) a.push({id:`armUp${side}`,name:`Character_${side}ArmUpNode`,kind:'Helper',parent:`arm${side}`,color:'#e7c9de'});
  if (S.ikTarget) for(const side of ['L','R']) if(S.arms >= (side==='L'?1:2)) a.push({id:`ik${side}`,name:`Character_${side}HandIKTarget`,kind:'Helper',parent:`palm${side}`,color:'#e8d7ef'});
  for(const side of ['L','R']) {
    if(S.handDigits && S.arms >= (side==='L'?1:2)) for(let i=0;i<S.handDigits;i++) a.push({id:`handDigit${side}${i}`,name:`Character_${side}HandDigit${i+1}`,kind:'Bone',parent:`palm${side}`,color:'#ddbedb'});
    if(S.footDigits && S.legs >= (side==='L'?1:2)) a.push({id:`footDigit${side}`,name:`Character_${side}FootDigit`,kind:'Bone',parent:`ankle${side}`,color:'#9acfe0'});
  }
  for(const id of S.gizmos) if(a.some(o=>o.id===id)) a.push({id:`gizmo:${id}`,name:`Character_${id}_Gizmo`,kind:'Helper',parent:id,color:'#e6ce8b'});
  if (S.tail) a.push({ id:'tail', name:'Character_Tail', kind:'Bone', parent:'pelvis', color:'#43a9d8' });
  if (S.extra) a.push({ id:'extra', name:'Character_ExtraBone', kind:'Bone', parent:S.selected === 'ribcage' ? 'ribcage' : 'pelvis', color:'#43a9d8' });
  return named(a);
};
const has = id => listObjects().some(o => o.id === id);
function select(id, tab) {
  if (id && !has(id)) return;
  if(S.filter==='CATBones'&&id&&listObjects().find(o=>o.id===id)?.kind!=='Bone') return;
  S.selected = id;
  max.select(id);
  if (tab) max.showTab(tab); else max.showTab(max.state.tab);
  draw();
}
function tell(message) { S.message = message; max.prompt(message); renderTask(); }
function sync() {
  if (S.selected && !has(S.selected)) S.selected = 'mesh';
  const coordinates=$('cat-refcoord');if(coordinates)coordinates.value=S.coord;
  max.setModes({tool:S.transformTool});
  max.setObjects(listObjects(), S.selected);
  max.showTab(max.state.tab);
  draw();
  renderTask();
}
function stageDone(i=S.stage){return [
  S.root&&S.pelvis,
  S.legs===2&&S.footDigits>=1&&S.legUpNode,
  S.spine&&S.arms===2&&S.segments>=3,
  S.handDigits===5&&S.ikTarget&&S.armUpNode,
  S.head&&S.jaw&&S.eyes&&S.gizmos.size>0,
  S.skin&&S.skinBones.size>0&&S.boneAffectLimit===3,
  ['armL','armR','legL','legR'].every(id=>S.stretchById[id]===false)&&S.absLayers.length>=2,
  Object.keys(S.renames).length>=4&&Object.keys(S.locksById).length>0][i];}
function renderTask() {
  $('steps').innerHTML = tasks.map((task,i) => `<button type="button" data-stage="${i}" class="${i===S.stage?'active':''}" aria-current="${i===S.stage?'step':'false'}"><small>${String(i+1).padStart(2,'0')} / CAT RIG</small>${task.title.slice(5)}</button>`).join('');
  const t=tasks[S.stage],done=stageDone(),card=$('task-card');
  card.classList.toggle('done',done);
  card.innerHTML=`<div class="task-intro"><span class="control-label">ETAPA ${S.stage+1} DE ${tasks.length}</span><h2>${esc(t.title)}</h2><p>${esc(t.text)}</p>${S.message?`<p class="task-message">${esc(S.message)}</p>`:''}</div>
    <div class="task-how"><span class="control-label">COM, A 3DS MAX</span><ol>${t.route.split(' · ').map(part=>`<li>${esc(part)}</li>`).join('')}</ol></div>
    <div class="step-actions"><span class="step-state">${done?'✓ Pas complet':'Encara pendent'}</span>${done&&S.stage<tasks.length-1?'<button type="button" class="exp-button" data-lab="next">Pas següent →</button>':''}<button type="button" class="mini-link" data-lab="solution">Mostra una solució</button><button type="button" class="mini-link" data-lab="reset">Reinicia el lab</button></div>`;
}
function presetList() { return `<div class="cat-preset-list"><button type="button" data-cat="preset:none" class="${S.preset==='none'?'on':''}">&lt;None&gt;</button><button type="button" data-cat="preset:human" class="${S.preset==='human'?'on':''}">Base Human</button></div>`; }
function catParameters() { return rollout('CATRig Parameters', `${row('Name', `<input class="mx-text" id="cat-name" value="${esc(S.rigName)}" aria-label="CATRig Name">`)}${row('CATUnits Ratio', S.layer?'<span>Locked by animation layer</span>':spin('cat-scale',S.catScale,.5,2,.05,2))}${row('Bone Length Axis', `<select class="mx-text" id="cat-axis" ${S.layer?'disabled':''}><option ${S.lengthAxis==='X'?'selected':''}>X</option><option ${S.lengthAxis==='Z'?'selected':''}>Z</option></select>`)}<p class="cat-panel-note">Ajusta la mida global abans de crear capes d’animació.</p>`,true); }
function createPage() {
  return `<div class="mx-cats">${['catGeometry','catShapes','catLights','catCameras','catHelpers','catSpaceWarps','catSystems'].map((name,i)=>`<button type="button" class="mx-cat${i===4?' on':''}" title="${['Geometry','Shapes','Lights','Cameras','Helpers','Space Warps','Systems'][i]}" aria-label="${['Geometry','Shapes','Lights','Cameras','Helpers','Space Warps','Systems'][i]}">${icon(name)}</button>`).join('')}</div><select class="mx-combo cat-native-select" id="cat-object-class" aria-label="Categoria d'objectes">${['Standard','Atmospheric Apparatus','Camera Match','Assembly Heads','Manipulators','Particle Flow','MassFX','CAT Objects','VRML97'].map(x=>`<option${S.objectClass===x?' selected':''}>${x}</option>`).join('')}</select>${S.objectClass==='CAT Objects'?`${rollout('Object Type', `<label class="mx-check dim"><input type="checkbox" disabled> AutoGrid</label><div class="cat-panel-grid">${btn('CATParent','arm',S.armed?' on':'')}</div>`)}${rollout('CATRig Load Save', `${presetList()}<p class="cat-panel-note">Tria un preset i fes clic i arrossega al terra per crear la base CATParent.</p>`)}${catParameters()}`:`<p class="cat-panel-note">Selecciona CAT Objects per crear un CATParent.</p>`}`;
}
function modifierHead(name) { return `<div class="cat-panel-section"><select class="mx-combo cat-native-select" id="cat-modifier-list" aria-label="Modifier List"><option value="">Modifier List</option><option value="Skin">Skin</option><option value="Edit Poly">Edit Poly</option><option value="TurboSmooth">TurboSmooth</option></select><div class="cat-panel-stack">${S.skin?'<button type="button" class="on" data-cat="select-skin">▸ Skin</button><div class="sub">▸ Envelope</div>':''}<button type="button">▸ ${esc(name)}</button></div></div>`; }
function skinPage() {
  const bones=[...S.skinBones], selectedVertex=S.selectedVertex;
  return `${modifierHead(S.objName||'Editable Poly')}${S.skin?`${rollout('Parameters', `
    <div class="cat-skin-main">${btn(S.envelopes?'Edit Envelopes ✓':'Edit Envelopes','envelopes',S.envelopes?' on':'')}</div>
    <fieldset class="cat-fieldset"><legend>Select</legend><label class="mx-check"><input id="cat-vertices" type="checkbox" ${S.vertices?'checked':''}> Vertices</label><div class="cat-panel-grid">${btn('Shrink','shrink',' disabled')}${btn('Grow','grow',' disabled')}${btn('Ring','ring',' disabled')}${btn('Loop','loop',' disabled')}</div><label class="mx-check"><input type="checkbox" checked disabled> Envelopes</label><label class="mx-check"><input type="checkbox" checked disabled> Cross Sections</label></fieldset>
    <fieldset class="cat-fieldset"><legend>Dual Quaternion</legend><label class="mx-check"><input type="checkbox" checked disabled> DQ Skinning Toggle</label>${btn('Blend Weights','blend-weights',' disabled')}</fieldset>
    <div class="cat-panel-row"><span>Bones:</span>${btn('Add','add-bones')}${btn('Remove','remove-bone',bones.length?'':' disabled')}</div><div class="cat-panel-list cat-bones-list">${bones.length?bones.map(id=>`<button type="button" data-cat="bone:${id}" class="${S.selectedBone===id?'on':''}">${esc(listObjects().find(o=>o.id===id)?.name||id)}</button>`).join(''):'No bones assigned'}</div>`)}
    ${rollout('Weight Properties', `${row('Abs. Effect',spin('cat-effect',selectedVertex==null?0:S.weights[selectedVertex],0,1,.05,2))}<label class="mx-check"><input type="checkbox" disabled> Rigid</label><label class="mx-check"><input type="checkbox" disabled> Normalize</label><div class="cat-panel-grid">${btn('Weight Tool','weight-tool')}${btn('Weight Table','weight-table')}${btn('Paint Weights','paint-toggle',S.paint?' on':'')}</div>${row('Paint Value',spin('cat-paint-value',S.paintValue,0,1,.05,2))}<label class="mx-check"><input id="cat-paint-blend" type="checkbox" ${S.paintBlend?'checked':''}> Paint Blend Weights</label><p class="cat-panel-note">${S.paintBlend?'Pintes la barreja Dual Quaternion.':'Selecciona un os de la llista i pinta els pesos de Skin.'} Vermell = més influència.</p>`)}
    ${rollout('Mirror Parameters', btn(S.mirror?'Mirror Mode ✓':'Mirror Mode','mirror',S.mirror?' on':''),false)}
    ${rollout('Advanced Parameters', `${row('Bone Affect Limit',spin('cat-affect-limit',S.boneAffectLimit,1,20))}`,false)}`:''}`;
}
function parentPage() { return `${catParameters()}${rollout('CATRig Load Save', `${presetList()}<div class="cat-panel-grid">${btn('Open Preset Rig','preset-open')}${btn('Save Preset Rig','preset-save')}</div>${!S.pelvis?btn('Create Pelvis','create-pelvis'):btn('Reload','reload')}<p class="cat-panel-note">Els presets reals es desen com a fitxers RG3 a 3ds Max.</p>`)}${rollout('Add Rigging', `<p class="cat-panel-note">Inclou malla, props i altres objectes al preset del rig.</p>${btn('Add Rigging...','rigging-info')}`,false)}`; }
function hubPage(id) {
  const pelvis=id==='pelvis';
  const size=hubSize(id),name=listObjects().find(o=>o.id===id)?.name||id;
  return `${rollout('Hub Setup', `<div class="cat-hub-setup">
    <div class="cat-hub-name"><label for="cat-hub-name">Name</label><div><input id="cat-hub-name" class="mx-text cat-rename" value="${esc(name)}" aria-label="Rename selected hub"><input id="cat-hub-color" type="color" value="${hubColor(id)}" aria-label="Hub color" title="Hub color"></div></div>
    <div class="cat-hub-clipboard"><button type="button" data-cat="hub-copy" title="Copy Hub Setup" aria-label="Copy Hub Setup"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h11v14H4zM8 7h11v14H8zM10 10h7m-7 3h7m-7 3h5"/></svg></button><button type="button" data-cat="hub-paste" title="Paste Hub Setup" aria-label="Paste Hub Setup"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10l2 3v14H5V7zM9 3h6v3H9zM8 10h8m-8 3h8m-8 3h6"/></svg></button><button type="button" data-cat="hub-paste-color" title="Paste Hub Color" aria-label="Paste Hub Color"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l2 2v16H5zM8 8h8M8 11h8M8 14h8"/><path d="M11 17h5v2h-5z"/></svg></button></div>
    <label class="cat-hub-custom"><input id="cat-hub-custom" type="checkbox" ${S.customHubMeshes[id]?'checked':''}> Use Custom Mesh</label>
    <div class="cat-hub-dimensions"><div><label for="cat-hub-length">Length :</label>${spin('cat-hub-length',size.length,1,100,.5,1)}</div><div><label for="cat-hub-width">Width :</label>${spin('cat-hub-width',size.width,1,100,.5,1)}</div><div><label for="cat-hub-height">Height :</label>${spin('cat-hub-height',size.height,1,100,.5,1)}</div></div>
    <div class="cat-hub-actions">${btn('Add Leg','add-leg')}${btn('Add Arm','add-arm')}${btn('Add Spine',pelvis?'add-spine':'add-head')}${btn('Add Tail','add-tail')}${btn('Add Bone','add-extra')}${btn('Add Rigging','rigging-info')}</div>
  </div>`)}${!pelvis?rollout('Spine Setup',`${row('Bones',spin('cat-spine-bones',S.spineBones,1,8))}<p class="cat-panel-note">La guia del curs utilitza 3 ossos de columna.</p>`):''}`;
}
function limbPage(id) {
  const isArm=id.startsWith('arm'), side=id.endsWith('L')?'Left':'Right';
  const name=listObjects().find(object=>object.id===id)?.name||id;
  return `${rollout('Limb Setup', `${row('Name',`<input class="mx-text cat-rename" value="${esc(name)}" aria-label="Rename selected bone">`)}<div class="cat-panel-row"><span>L / M / R</span><b>${side==='Left'?'L':'R'}</b></div><label class="mx-check"><input id="cat-collar" type="checkbox" ${S.collarbone?'checked':''}> Collarbone</label><label class="mx-check"><input id="cat-palm" type="checkbox" ${S.palm?'checked':''}> ${isArm?'Palm':'Ankle'}</label>${isArm?'':row('Ankle · Bones',spin('cat-ankle-bones',S.ankleBones,1,5))}<label class="mx-check"><input id="cat-upnode" type="checkbox" ${(isArm?S.armUpNode:S.legUpNode)?'checked':''}> Use Up Node</label><p class="cat-panel-note">${isArm?'El colze necessita una lleugera flexió i un Up Node davant del braç.':'La línia cian mostra l’objectiu IK de la FootPlatform. Mou-la per flexionar els dos ossos de la cama.'}</p>`)}${rollout('Bone Setup', `${row('Width',spin('cat-bone-width',boneSize().width,0.03,0.2,0.005,3))}${row('Depth',spin('cat-bone-depth',boneSize().depth,0.03,0.2,0.005,3))}${row('Segments',spin('cat-segments',S.segments,1,8))}<div class="cat-panel-grid">${btn('Add Bone','add-extra')}${btn('Add Gizmo','add-gizmo')}</div><p class="cat-panel-note">${isArm?'Posa 3 segments a l’avantbraç per repartir la torsió.':'La mida de l’os és visual; el pivot defineix el centre de rotació.'}</p>`)}${rollout('Bone Twist Weight', `<div class="cat-twist-graph"><svg viewBox="0 0 220 68" aria-label="Gràfic de repartiment de torsió"><path d="M8 57 C70 48 152 17 213 9" stroke="#c9ddec" stroke-width="2" fill="none"/><path d="M8 57H213M8 9V57" stroke="#777" fill="none"/></svg></div><p class="cat-panel-note">La torsió es reparteix entre ${S.segments} segments.</p>`,false)}`;
}
function palmPage(id) { const hand=id.startsWith('palm'),name=listObjects().find(object=>object.id===id)?.name||id,size=S.ankleSizes[id.at(-1)]||{length:15,width:20,height:10};return `${rollout(hand?'Palm Setup':'Ankle Setup', `${row('Name',`<input class="mx-text cat-rename" value="${esc(name)}" aria-label="Rename selected bone">`)}${hand?'':`${row('Length',spin('cat-ankle-length',size.length,5,50,.5,1))}${row('Width',spin('cat-ankle-width',size.width,5,50,.5,1))}${row('Height',spin('cat-ankle-height',size.height,5,50,.5,1))}`}${row('Num Digits',spin(hand?'cat-hand-digits':'cat-foot-digits',hand?S.handDigits:S.footDigits,0,hand?5:1))}<p class="cat-panel-note">${hand?'Crea 5 digits. Selecciona cada cadena per posar 4 ossos, excepte 3 al polze.':'Crea 1 digit per a la punta del peu i deixa-li 1 os.'}</p>`)}${hand?rollout('Limb Animation',`${btn(S.ikTarget?'IKTarget creat ✓':'Create IKTarget','ik-target',S.ikTarget?' on':'')}<p class="cat-panel-note">El target es pot mostrar com a Cross o Rectangle.</p>`,false):''}`; }
function digitPage(id){const hand=id.startsWith('hand'),index=hand?+id.at(-1):0,bones=hand?S.digitBoneCounts[index]:S.footDigitBones;return `${rollout('Digit Setup',`${row('Name',`<input class="mx-text cat-rename" value="${esc(listObjects().find(o=>o.id===id)?.name||id)}" aria-label="Rename selected bone">`)}${row('Bones',spin('cat-digit-bones',bones,1,5))}<p class="cat-panel-note">${hand?'Polze: 3 ossos · altres dits: 4 ossos.':'Punta del peu: 1 os.'} Revisa que el pivot coincideixi amb l’articulació.</p>`)}${rollout('Digit Bone Setup',`${row('Width',spin('cat-bone-width',boneSize().width,0.03,0.2,0.005,3))}${btn('Add Bone','digit-add-bone')}`,false)}`;}
function headPage(){return `${rollout('Head Setup',`${row('Neck Bones',spin('cat-head-bones',S.headBones,1,5))}<div class="cat-panel-grid">${btn('Add Jaw Bone','add-jaw')}${btn('Add Eye Bones','add-eyes')}</div><p class="cat-panel-note">La mandíbula pivota prop de l’articulació; els ossos dels ulls se centren a cada globus ocular.</p>`)}${rollout('Bone Setup',`${row('Width',spin('cat-bone-width',boneSize().width,0.03,0.2,0.005,3))}${btn('Add Gizmo','add-gizmo')}`,false)}`;}
function gizmoPage(){return `${rollout('Gizmo',`${row('Name',`<input class="mx-text cat-rename" value="${esc(listObjects().find(o=>o.id===S.selected)?.name||S.selected)}" aria-label="Rename selected bone">`)}${row('Radius',spin('cat-gizmo-radius',S.gizmoRadius,.08,.9,.02,2))}${btn('Convert to Editable Spline','editable-gizmo')}<p class="cat-panel-note">La corba és un controlador de selecció. Ajusta’n el radi perquè es vegi fora de la malla.</p>`)}`;}
function hierarchyPage(){
  if(!S.root||!S.selected||S.selected==='mesh')return '<p class="mx-empty">Select a CAT bone or controller for Link Info.</p>';
  const limb=/^(arm|leg|upperArm|forearm|thigh|shin)[LR]$/.test(S.selected);
  const locks=S.locksById[S.selected]||{};
  return `<div class="cat-hierarchy-tabs">${['Pivot','IK','Link Info'].map((name,i)=>`<button type="button" data-cat="link-tab:${i}" class="${S.linkTab===String(i)?'on':''}">${name}</button>`).join('')}</div>${S.linkTab==='2'?`${rollout('Locks',`${['Move','Rotate','Scale'].map(key=>`<fieldset class="cat-fieldset"><legend>${key}:</legend><div class="cat-lock-axes">${['X','Y','Z'].map(axis=>`<label><input type="checkbox" data-lock="${key.toLowerCase()}:${axis.toLowerCase()}" ${locks[`${key.toLowerCase()}:${axis.toLowerCase()}`]?'checked':''}> ${axis}</label>`).join('')}</div></fieldset>`).join('')}`)}${rollout('Link Info',limb?`<label class="mx-check"><input id="cat-stretch" type="checkbox" ${S.stretchById[S.selected]?'checked':''}> Manipulation Causes Stretching</label>`:'<p class="cat-panel-note">Selecciona un os de braç o cama per configurar l’estirament.</p>',false)}`:S.linkTab==='1'?rollout('IK',`<p class="cat-panel-note">Els controls IK de la mà es configuren al panell Motion.</p>`):rollout('Pivot',`<p class="cat-panel-note">El pivot determina el centre de rotació de cada os.</p>`)}`;
}
function motionPage() {
  if (!S.root || !S.selected || S.selected==='mesh') return `<p class="mx-empty">Select a CATParent or CAT bone to open CAT Layer Manager.</p>`;
  const layers=S.absLayers.length?S.absLayers.map((name,i)=>`<button type="button" data-cat="layer:${i}" class="${S.activeLayer===i?'on':''}">${esc(name)} · 100% ${S.activeLayer===i?'●':''}</button>`).join(''):'No animation layers';
  return `${rollout('Layer Manager', `<div class="cat-mode">${btn(`Setup Mode${S.mode==='Setup'?' ✓':''}`,'setup',S.mode==='Setup'?' on':'')}${btn(`Animation Mode${S.mode==='Animation'?' ✓':''}`,'animation',S.mode==='Animation'?' on':'')}</div><div class="cat-panel-list">${layers}</div><div class="cat-panel-grid">${btn('Add Absolute Layer','add-layer')}${btn('Add CATMotion','catmotion-info')}</div><p class="cat-panel-note">Crea T-Pose i Pesos; activa Pesos abans de moure controls. Setup Mode conserva l’estructura.</p>`)}${S.selected.startsWith('arm')||S.selected.startsWith('leg')||S.selected.startsWith('palm')?rollout('Limb Animation',`${row('IK/FK',`<select class="mx-text" id="cat-ik"><option ${S.ik==='FK'?'selected':''}>FK</option><option ${S.ik==='IK'?'selected':''}>IK</option></select>`)}${S.selected.startsWith('palm')?`${btn(S.ikTarget?'IKTarget creat ✓':'Create IKTarget','ik-target',S.ikTarget?' on':'')}${S.ikTarget?`<div class="cat-panel-row"><span>Display</span><select class="mx-text" id="cat-ik-display"><option value="cross" ${S.ikDisplay==='cross'?'selected':''}>Cross</option><option value="rectangle" ${S.ikDisplay==='rectangle'?'selected':''}>Rectangle</option></select></div>`:''}`:''}<p class="cat-panel-note">La FootPlatform és el target IK de la cama; la mà pot tenir un IKTarget propi.</p>`,false):''}${(S.selected.startsWith('palm')||S.selected.startsWith('ankle'))&&(S.handDigits||S.footDigits)?rollout('Digit Manager',`${row('Curl',spin('cat-curl',S.digitCurl,-90,90,5))}<p class="cat-panel-note">Spread, Bend, Roll i Curl controlen els digits seleccionats.</p>`,false):''}`;
}
function renderCommand(tab,page) {
  const pageContent=tab==='create'?createPage():tab==='modify'?(S.selected==='mesh'?skinPage():S.selected==='catparent'?parentPage():['pelvis','ribcage'].includes(S.selected)?hubPage(S.selected):['armL','armR','legL','legR'].includes(S.selected)?limbPage(S.selected):['palmL','palmR','ankleL','ankleR'].includes(S.selected)?palmPage(S.selected):S.selected?.startsWith('handDigit')||S.selected?.startsWith('footDigit')?digitPage(S.selected):S.selected==='head'?headPage():S.selected?.startsWith('gizmo:')?gizmoPage():S.selected?rollout('Bone Setup',`${row('Name',`<input class="mx-text cat-rename" value="${esc(listObjects().find(o=>o.id===S.selected)?.name||S.selected)}" aria-label="Rename selected bone">`)}${row('Width',spin('cat-bone-width',boneSize().width,.03,.2,.005,3))}${btn('Add Gizmo','add-gizmo')}`):'<p class="mx-empty">Select an object.</p>'):tab==='motion'?motionPage():tab==='hierarchy'?hierarchyPage():`<p class="mx-empty">Select a CAT part and use Create, Modify, Hierarchy or Motion.</p>`;
  page.insertAdjacentHTML('beforeend',pageContent);
  const name=page.querySelector('#mx-objname');if(name)name.readOnly=false;
}
function setPreset(preset) { S.preset=preset; max.showTab(max.state.tab); }
function moveOnAxis(id,axis,dx,dy) {
  if(axis==='free')return {x:dx,y:dy,depth:0};
  const m=/^(upperArm|forearm|thigh|shin|arm|leg)([LR])$/.exec(id);
  if(S.coord==='Local'&&m){
    const [,part,side]=m;
    const first=part==='arm'?'chest':part==='leg'?'pelvis':part==='upperArm'?`shoulder${side}`:part==='forearm'?`elbow${side}`:part==='thigh'?`hip${side}`:`knee${side}`;
    const last=part==='arm'?`shoulder${side}`:part==='leg'?`hip${side}`:part==='upperArm'?`elbow${side}`:part==='forearm'?`wrist${side}`:part==='thigh'?`knee${side}`:`ankle${side}`;
    const a=S.joints[first],b=S.joints[last],length=Math.hypot(b[0]-a[0],b[1]-a[1])||1;
    const along=[(b[0]-a[0])/length,(b[1]-a[1])/length],sideways=[along[1],-along[0]];
    const direction=axis.toUpperCase()===S.lengthAxis?along:axis===(S.lengthAxis==='X'?'y':'x')?sideways:null;
    if(direction){const amount=dx*direction[0]+dy*direction[1];return {x:direction[0]*amount,y:direction[1]*amount,depth:0};}
    return {x:0,y:0,depth:dx/225};
  }
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
function rotateEuler(values,direction,theta,local=false){
  const current=new THREE.Quaternion().setFromEuler(new THREE.Euler(...values));
  const turn=new THREE.Quaternion().setFromAxisAngle(direction,theta);
  if(local)current.multiply(turn);else current.premultiply(turn);
  return new THREE.Euler().setFromQuaternion(current,'XYZ').toArray().slice(0,3);
}
const dominantAxis=direction=>direction.toArray().map(Math.abs).indexOf(Math.max(...direction.toArray().map(Math.abs)));
function rotateObjectFrames(id,direction,angle){
  rotateHierarchyFrames(S,listObjects(),id,direction,angle);
}
function transformBone(id,tool,dx,dy,axis='free',worldDelta=null,axisVector=null) {
  const locks=S.locksById[id]||{},kind=tool==='move'?'move':tool==='rotate'?'rotate':'scale';
  if(axis!=='free'&&locks[`${kind}:${axis}`])return;
  const direction=new THREE.Vector3(...(axisVector||(axis==='x'?[1,0,0]:axis==='y'?[0,0,-1]:axis==='z'?[0,1,0]:[0,0,-1]))).normalize();
  const movement=tool==='move'?(worldDelta?{x:worldDelta[0]*225,y:-worldDelta[1]*225,depth:worldDelta[2]}:moveOnAxis(id,axis,dx,dy)):null;
  const jointDelta=movement?new THREE.Vector3(movement.x/225,-movement.y/225,movement.depth):null;
  if(id==='catparent'){
    const transform=S.parentTransform;
    if(tool==='move'){
      transform.position[0]+=(movement.x||0)/225;
      transform.position[1]-=(movement.y||0)/225;
      transform.position[2]+=movement.depth||0;
    }else if(tool==='rotate'){
      transform.rotation=rotateEuler(transform.rotation,direction,dx*.012);
    }else if(tool==='scale'){
      const factor=Math.max(.8,Math.min(1.2,1+dx*.008));
      const index=dominantAxis(worldAxisToRig(S,direction));
      if(axis==='free')transform.scale=transform.scale.map(value=>Math.max(.3,Math.min(3,value*factor)));
      else transform.scale[index]=Math.max(.3,Math.min(3,transform.scale[index]*factor));
    }
    draw();return;
  }
  const foot=/^foot([LR])$/.exec(id);
  if(foot){
    const side=foot[1],hipName=`hip${side}`,kneeName=`knee${side}`,ankleName=`ankle${side}`;
    const target=S.footTargets[side]??[...S.joints[ankleName],S.jointDepths[ankleName]??.11];
    if(tool==='move'){
      target[0]+=movement.x||0;target[1]+=movement.y||0;target[2]+=movement.depth||0;
      S.footTargets[side]=target;
      const hip=[...S.joints[hipName],S.jointDepths[hipName]??.11].map((v,i)=>i===2?v*225:v);
      const restKnee=[...S.joints[kneeName],S.jointDepths[kneeName]??.19].map((v,i)=>i===2?v*225:v);
      const restAnkle=[...S.joints[ankleName],S.jointDepths[ankleName]??.11].map((v,i)=>i===2?v*225:v);
      const lengths=S.legIKLengths[side]??[Math.hypot(...restKnee.map((v,i)=>v-hip[i])),Math.hypot(...restAnkle.map((v,i)=>v-restKnee[i]))];
      S.legIKLengths[side]=lengths;
      S.legIKRest[side]??=restKnee;
      const solved=solveLegIK(hip,S.legIKRest[side],[target[0],target[1],target[2]*225],...lengths);
      S.joints[kneeName]=solved.knee.slice(0,2);S.joints[ankleName]=solved.ankle.slice(0,2);
      S.jointDepths[kneeName]=solved.knee[2]/225;S.jointDepths[ankleName]=solved.ankle[2]/225;
    }else if(tool==='rotate'){
      S.footRotations[side]=rotateEuler(S.footRotations[side]||[0,0,0],direction,dx*.012);
    }else if(tool==='scale'){
      const footRotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(...(S.footRotations[side]||[0,0,0])));
      const index=dominantAxis(direction.clone().applyQuaternion(footRotation.invert())),factor=Math.max(.8,Math.min(1.2,1+dx*.008));
      S.footScales[side]??=[1,1,1];
      if(axis==='free')S.footScales[side]=S.footScales[side].map(value=>Math.max(.3,Math.min(3,value*factor)));
      else S.footScales[side][index]=Math.max(.3,Math.min(3,S.footScales[side][index]*factor));
    }
    draw();return;
  }
  if(S.mode!=='Setup')return;
  const legObject=/^(leg|thigh|shin|ankle)([LR])$/.exec(id);
  if(legObject)pinFootTarget(S,legObject[2]);
  if(tool==='rotate')rotateObjectFrames(id,direction,dx*.012);
  if(id==='pelvis'){
    if(tool==='move')moveSetupJoints(S,Object.keys(S.joints).filter(name=>name!=='root'),jointDelta);
    else {
      for(const name of Object.keys(S.joints)){
        if(name==='root')continue;
        if(tool==='rotate'&&name!=='pelvis')transformJoint(name,'pelvis',tool,dx*.012,direction);
        else if(tool==='scale'&&name!=='pelvis')transformJoint(name,'pelvis',tool,Math.max(.5,Math.min(1.5,1+dx*.008)),direction,axis==='free');
      }
      invalidateLegSetup(S,Object.keys(S.joints));
    }
    draw();return;
  }
  if(['spine','ribcage','head'].includes(id)||/^(palm|ankle)[LR]$/.test(id)){
    const upper=['chest','head','shoulderL','elbowL','wristL','shoulderR','elbowR','wristR'];
    const terminal=/^(palm|ankle)([LR])$/.exec(id);
    const names=terminal?[`${terminal[1]==='palm'?'wrist':'ankle'}${terminal[2]}`]:id==='head'?['head']:upper;
    const pivotName=terminal?`${terminal[1]==='palm'?'wrist':'ankle'}${terminal[2]}`:id==='spine'?'pelvis':id==='head'?'head':'chest';
    if(tool==='move'){moveSetupJoints(S,names,jointDelta);draw();return;}
    // Rotating an end bone changes its frame only; its joint and IK target stay fixed.
    if(terminal){draw();return;}
    for(const name of names){
      if(name===pivotName)continue;
      if(tool==='rotate')transformJoint(name,pivotName,tool,dx*.012,direction);
      else if(tool==='scale')transformJoint(name,pivotName,tool,Math.max(.5,Math.min(1.5,1+dx*.008)),direction,axis==='free');
    }
    invalidateLegSetup(S,names);
    draw();return;
  }
  const m=/^(upperArm|forearm|thigh|shin|arm|leg)([LR])$/.exec(id);if(!m)return;
  const [,part,side]=m,arm=/Arm|arm/.test(part),chain=arm?['shoulder','elbow','wrist']:['hip','knee','ankle'];
  const pivot=part==='forearm'?'elbow':part==='shin'?'knee':chain[0],start=chain.indexOf(pivot);
  const rootLimb=part==='arm'||part==='leg';
  const names=(rootLimb?chain:chain.slice(start+(tool==='move'?0:1))).map(n=>n+side);
  if(!names.length)return;
  const key=part==='arm'?'chest':part==='leg'?'pelvis':pivot+side;
  if(tool==='move')moveSetupJoints(S,names,jointDelta);
  else {
    for(const name of names){
      if(tool==='rotate')transformJoint(name,key,tool,dx*.012,direction);
      else if(tool==='scale')transformJoint(name,key,tool,Math.max(.5,Math.min(1.5,1+dx*.008)),direction,axis==='free');
    }
    invalidateLegSetup(S,names);
  }
  draw();
}
function createParent(radius=0.95) {
  S.root=true; S.armed=false; S.baseRadius=Math.max(.3,Math.min(2.6,radius));
  S.parentTransform={position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]};
  if(S.preset==='human') { S.pelvis=true; S.legs=2; S.spine=true; S.arms=2; S.head=true; }
  select('catparent','modify'); sync();
  tell(S.preset==='human'?'Base Human carregat. Selecciona els hubs o els ossos per veure els seus rollouts.':'CATParent creat. A Modify › CATRig Load Save, prem Create Pelvis.');
}
function addPart(which) {
  if(S.mode!=='Setup') { tell('Torna a Setup Mode per modificar l’estructura.'); return; }
  if(which==='leg'&&S.selected!=='pelvis')return tell('Per afegir aquesta cama, selecciona el hub de la pelvis.');
  if(which==='arm'&&S.selected!=='ribcage')return tell('Per afegir aquest braç, selecciona el hub superior de la columna.');
  if(which==='arm'&&S.arms>=2)return tell('El rig ja té dos braços.');
  pushUndo();
  if(which==='pelvis') { S.pelvis=true; select('pelvis','modify'); }
  if(which==='leg' && S.selected==='pelvis') { S.legs=Math.min(2,S.legs+1); }
  if(which==='spine' && S.selected==='pelvis') { S.spine=true; select('ribcage','modify'); }
  if(which==='arm' && S.selected==='ribcage') { addArmFromSetup(S); }
  if(which==='head' && S.selected==='ribcage') { S.head=true; }
  if(which==='jaw' && S.head) { S.jaw=true; select('jaw','modify'); }
  if(which==='eyes' && S.head) { S.eyes=true; select('eyeL','modify'); }
  if(which==='tail') S.tail=true;
  if(which==='extra') S.extra=true;
  sync();
  if(which==='spine') tell('Spine i Ribcage creats. Selecciona Ribcage i fes Add Arm dues vegades.');
  else if(which==='head') tell('El segon Add Spine ha creat el hub del cap.');
  else tell(`${which} afegit al rig.`);
}
function boneDialog() {
  const candidates=listObjects().filter(o=>o.id!=='mesh'&&o.id!=='catparent');
  if(!candidates.some(o=>o.kind==='Bone'))return tell('Crea els ossos CAT abans d’afegir-los a Skin.');
  const dlg=max.dialog('Select Bones',`<div class="cat-select-bones"><div class="cat-select-toolbar">● ◉ ▣ ◈ ☰</div><input class="mx-text" id="cat-bone-search" placeholder="Search objects..." aria-label="Search objects"><div class="cat-select-head">Name (Sorted Ascending)</div><div class="cat-select-rows">${candidates.sort((a,b)=>a.name.localeCompare(b.name)).map(o=>`<label class="cat-select-row" data-bone-name="${esc(o.name.toLowerCase())}"><input type="checkbox" value="${o.id}" ${S.skinBones.has(o.id)?'checked':''}><span>${o.kind==='Bone'?'●':'◇'}</span>${esc(o.name)}${o.kind==='Helper'?'<small>control</small>':''}</label>`).join('')}</div></div>`,dlg=>{const chosen=[...dlg.querySelectorAll('input[type=checkbox]:checked')].map(x=>x.value);S.skinBones=new Set(chosen.filter(id=>candidates.find(o=>o.id===id)?.kind==='Bone'));S.selectedBone=[...S.skinBones][0]||'armL';S.envelopes=true;S.vertices=true;sync();tell(`${S.skinBones.size} ossos deformadors assignats a Skin${chosen.length>S.skinBones.size?' · els controls no deformen la malla':''}.`);},{ok:'Select',width:590});
  dlg.querySelector('#cat-bone-search')?.addEventListener('input',e=>{for(const row of dlg.querySelectorAll('.cat-select-row'))row.hidden=!row.dataset.boneName.includes(e.target.value.toLowerCase());});
}
function weightTool() {
  if(S.selectedVertex==null) { tell('Activa Vertices i selecciona un punt del colze.'); return; }
  max.dialog('Weight Tool',`<p>Vertex ${S.selectedVertex+1} · ${esc(listObjects().find(o=>o.id===S.selectedBone)?.name||S.selectedBone)}</p><div class="cat-panel-grid">${[0,.25,.5,.75,1].map(n=>btn(n.toFixed(2),`tool-weight:${n}`)).join('')}${btn('Blend','tool-blend')}</div><p>El pes de l’altre os compensa fins a 1.0 en aquesta pràctica de dos ossos.</p>`,null,{ok:'Close',cancel:'',width:350});
}
function weightTable() {
  max.dialog('Weight Table',`<div class="cat-weight-table"><table><thead><tr><th>Vertex</th><th>Upper Arm</th><th>Forearm</th></tr></thead><tbody>${S.weights.map((w,i)=>`<tr><td>${i+1}</td><td><input type="number" data-table="${i}" value="${w.toFixed(2)}" min="0" max="1" step="0.05"></td><td>${(1-w).toFixed(2)}</td></tr>`).join('')}</tbody></table></div>`,dlg=>{dlg.querySelectorAll('[data-table]').forEach(input=>{S.weights=paintWeight(S.weights,+input.dataset.table,+input.value);});sync();},{width:390});
}
function handleAction(action) {
  if(action==='arm') { pushUndo();S.objectClass='CAT Objects';S.armed=true; max.showTab('create'); tell('CATParent actiu. Fes clic i arrossega a la vista per dimensionar la base del personatge.'); return; }
  if(action.startsWith('link-tab:')) {S.linkTab=action.slice(9);max.showTab('hierarchy');return;}
  if(action.startsWith('preset:')) { pushUndo();setPreset(action.slice(7)); return; }
  if(action==='create-pelvis') return addPart('pelvis');
  if(action==='add-leg') return addPart('leg');
  if(action==='add-spine') return addPart('spine');
  if(action==='add-arm') return addPart('arm');
  if(action==='add-head') return addPart('head');
  if(action==='add-tail') return addPart('tail');
  if(action==='add-extra') return addPart('extra');
  if(action==='add-jaw') return addPart('jaw');
  if(action==='add-eyes') return addPart('eyes');
  if(action==='hub-copy') {hubClipboard={size:{...hubSize(S.selected)},color:hubColor(S.selected)};tell('Paràmetres del hub copiats.');return;}
  if(action==='hub-paste'||action==='hub-paste-color') {if(!hubClipboard)return tell('Copia primer els paràmetres d’un hub.');pushUndo();S.hubColors[S.selected]=hubClipboard.color;if(action==='hub-paste')S.hubSizes[S.selected]={...hubClipboard.size};sync();return;}
  if(action==='ik-target') { S.ikTarget=true; S.ik='IK'; sync(); tell('IKTarget creat a la mà. A Motion › Limb Animation canvia Display a Rectangle.'); return; }
  if(action==='add-gizmo') { if(!S.selected||S.selected==='mesh')return tell('Selecciona un os CAT abans d’afegir un Gizmo.');const parent=S.selected;S.gizmos.add(parent);sync();select(`gizmo:${parent}`,'modify');tell('Gizmo afegit. Ajusta Radius per veure la corba fora de la malla.');return; }
  if(action==='editable-gizmo') return tell('A 3ds Max, Convert to Editable Spline permet moure els vèrtexs de la corba de control.');
  if(action==='digit-add-bone') { const id=S.selected;if(id.startsWith('handDigit'))S.digitBoneCounts[+id.at(-1)]=Math.min(5,S.digitBoneCounts[+id.at(-1)]+1);else S.footDigitBones=Math.min(5,S.footDigitBones+1);sync();return; }
  if(action==='apply-skin') { pushUndo();S.skin=true; S.stage=5; sync(); tell('Skin aplicat. Prem Add a Parameters per triar només els CATBones deformadors.'); return; }
  if(action==='add-bones') return boneDialog();
  if(action==='envelopes') { pushUndo();S.envelopes=!S.envelopes;S.vertices=S.envelopes;sync(); return; }
  if(action==='normalize') { if(S.selectedVertex==null) return tell('Selecciona un vèrtex abans de normalitzar.'); S.weights=paintWeight(S.weights,S.selectedVertex,S.weights[S.selectedVertex]); sync();tell('Pesos normalitzats: braç superior + avantbraç = 1.0.'); return; }
  if(action==='weight-tool') return weightTool();
  if(action==='weight-table') return weightTable();
  if(action==='paint-toggle') { pushUndo();S.paint=!S.paint;sync();return; }
  if(action==='remove-bone') {S.skinBones.delete(S.selectedBone);S.selectedBone=[...S.skinBones][0]||'armL';sync();return;}
  if(action==='mirror') { pushUndo();S.mirror=!S.mirror;sync();return; }
  if(action==='add-layer') { const name=S.absLayers.length===0?'T-Pose':S.absLayers.length===1?'Pesos':`Absolute Layer ${S.absLayers.length+1}`;S.absLayers.push(name);S.activeLayer=S.absLayers.length-1;S.layer=true;sync();tell(`Absolute Layer «${name}» creada i activa.`);return; }
  if(action.startsWith('layer:')) {S.activeLayer=+action.slice(6);sync();tell(`Capa «${S.absLayers[S.activeLayer]}» activa.`);return;}
  if(action==='setup') { S.mode='Setup';sync();return; }
  if(action==='animation') { if(S.absLayers.length<2) return tell('Crea primer les capes Absolute T-Pose i Pesos, i activa Pesos.');S.mode='Animation';sync();return; }
  if(action.startsWith('bone:')) { S.selectedBone=action.slice(5);max.showTab('modify');draw();return; }
  if(action.startsWith('tool-weight:')) { S.weights=paintWeight(S.weights,S.selectedVertex,+action.slice(12));sync();return; }
  if(action==='tool-blend') { const i=S.selectedVertex;S.weights=paintWeight(S.weights,i,(S.weights[Math.max(0,i-1)]+S.weights[Math.min(9,i+1)])/2);sync();return; }
  if(action==='reload') { pushUndo();S.joints=structuredClone(initialJoints);S.partRotations={};S.footRotations={};S.jointDepths={};S.footTargets={};S.legIKLengths={};S.legIKRest={};if(S.preset==='human'){S.pelvis=true;S.legs=2;S.spine=true;S.arms=2;S.head=true;}sync();tell('Preset restaurat. A 3ds Max, Reload llegeix el fitxer RG3 desat.');return; }
  if(action==='preset-open'||action==='preset-save') return tell('Els fitxers RG3 es carreguen i desen a 3ds Max des de CATRig Load Save.');
  if(action==='rigging-info') return tell('Add Rigging afegeix malles i props al preset RG3 del rig.');
  if(action==='catmotion-info') return tell('CATMotion es treballa al lab següent: crea cicles procedimentals en una capa pròpia.');
}
max=createMaxShell(root,{file:'CAT_Rig_Practice.max',objects:listObjects(),selected:S.selected,pages:{create:'',modify:'',motion:'',hierarchy:''},tab:'create',fps:30,units:'cm',explorer:innerWidth>900,
  actions:{undo,redo,commandPanel:renderCommand,selectObject:id=>select(id),frame:f=>max.setTime({frame:f}),viewFront:()=>{S.view='Front';max.setViewLabel('Front');cat3d?.setView('Front');draw();},viewLeft:()=>{S.view='Left';max.setViewLabel('Left');cat3d?.setView('Left');draw();},viewPerspective:()=>{S.view='Perspective';max.setViewLabel('Perspective');cat3d?.setView('Perspective');draw();},wireframe:()=>{S.wire=!S.wire;max.setViewLabel(null,S.wire?'Wireframe':'Default Shading');cat3d?.setWireframe(S.wire);draw();},refCoord:()=>{S.coord={View:'World',World:'Local',Local:'View'}[S.coord]||'View';const control=$('cat-refcoord');if(control)control.value=S.coord;draw();},select:()=>{S.transformTool='select';max.setModes({tool:'select'});draw();},move:()=>{S.transformTool='move';max.setModes({tool:'move'});draw();},rotate:()=>{S.transformTool='rotate';max.setModes({tool:'rotate'});draw();},scale:()=>{S.transformTool='scale';max.setModes({tool:'scale'});draw();},
    importObj:()=>$('obj-file').click(),catCreate:()=>{max.showTab('create');handleAction('arm');},catModify:()=>{max.showTab('modify');},catMotion:()=>{max.showTab('motion');}},
  menus:{File:[{label:'Import...',action:'importObj'}],Create:[{label:'Helpers › CAT Objects › CATParent',action:'catCreate'}],Modifiers:[{label:'Animation Modifiers › Skin',run:()=>{select('mesh','modify');handleAction('apply-skin');}}],Animation:[{label:'CAT Character › Layer Manager',action:'catMotion'}]}});
max.setViewLabel('Perspective','Default Shading');
const filterControl=root.querySelector('.mx-toolbar .mx-drop[title="Selection Filter"]');
if(filterControl)filterControl.outerHTML='<select id="cat-selection-filter" class="mx-drop cat-selection-filter" aria-label="Selection Filter"><option>All</option><option>CATBones</option></select>';
const coordControl=root.querySelector('#mx-refcoord');
if(coordControl)coordControl.outerHTML='<select id="cat-refcoord" class="mx-drop cat-refcoord" aria-label="Reference Coordinate System"><option>View</option><option>World</option><option>Local</option></select>';
max.host.innerHTML='<div class="cat-vp" id="cat-vp"><img class="cat-reference" id="cat-reference" alt="Referència del personatge" hidden><div class="cat-vp-note" id="cat-vp-note"></div></div>';
root.insertAdjacentHTML('beforeend','<input id="obj-file" type="file" accept=".obj" hidden>');
function draw() {
  cat3d?.update();
  const canvas=$('cat-vp')?.querySelector('.cat-canvas');if(canvas&&S.armed)canvas.style.cursor='crosshair';
  $('cat-vp-note').textContent=S.armed?'CATParent: click + drag al terra · origen 0,0,0':S.selected==='mesh'&&S.envelopes?'Skin · selecciona o pinta els pesos':S.mode==='Setup'&&S.root?'Setup Mode · alinea els pivots · clic dret: Add Gizmo':'Vista 3D · Alt+X: transparència';
  const img=$('cat-reference');img.hidden=!S.reference;img.src=S.reference||'';
}
root.addEventListener('click',e=>{const b=e.target.closest('[data-cat]');if(b&&!b.disabled)handleAction(b.dataset.cat);});
root.addEventListener('input',e=>{
  const el=e.target,v=+el.value;
  if(el.id==='mx-objname'||el.classList.contains('cat-rename')) {if(!S.selected)return;S.renames[S.selected]=el.value.trim().slice(0,40)||S.selected;max.setObjects(listObjects(),S.selected);const peer=el.id==='mx-objname'?root.querySelector('.cat-rename'):root.querySelector('#mx-objname');if(peer)peer.value=S.renames[S.selected];return;}
  if(el.id==='cat-name') { S.rigName=el.value.trim().replace(/[^\p{L}\p{N}_-]/gu,'').slice(0,24)||'Character'; max.setObjects(listObjects(),S.selected); return; }
  if(el.id==='cat-hub-color') {S.hubColors[S.selected]=el.value;max.setObjects(listObjects(),S.selected);draw();return;}
  if(['cat-hub-length','cat-hub-width','cat-hub-height'].includes(el.id)&&Number.isFinite(v)){S.hubSizes[S.selected]??={...hubSize(S.selected)};S.hubSizes[S.selected][el.id.slice(8)]=v;draw();return;}
  if(!Number.isFinite(v))return;
  if(el.id==='cat-curl') { S.digitCurl=Math.max(-90,Math.min(90,v));draw(); }
  if(el.id==='cat-scale') { S.catScale=Math.max(.5,Math.min(2,v));draw(); }
  if(el.id==='cat-effect'&&S.selectedVertex!=null) { S.weights=paintWeight(S.weights,S.selectedVertex,v);draw(); }
});
root.addEventListener('change',e=>{
  const el=e.target;
  if(el.id==='cat-object-class'){S.objectClass=el.value;S.armed=false;sync();return;}
  if(el.id==='cat-modifier-list'){if(el.value==='Skin')handleAction('apply-skin');else if(el.value)tell(`El modificador ${el.value} no forma part d'aquest exercici.`);return;}
  if(el.id==='mx-objname'){if(S.selected){S.renames[S.selected]=el.value.trim().slice(0,40)||S.selected;sync();}return;}
  if(el.id==='cat-selection-filter') {S.filter=el.value;const selected=listObjects().find(o=>o.id===S.selected);if(S.filter==='CATBones'&&selected?.kind!=='Bone')S.selected=listObjects().find(o=>o.kind==='Bone')?.id||null;sync();return;}
  if(el.id==='cat-refcoord') {S.coord=el.value;draw();return;}
  if(el.classList.contains('cat-rename')) {S.renames[S.selected]=el.value.trim().slice(0,40)||S.selected;sync();return;}
  if(el.id==='cat-name') { S.rigName=el.value.trim().replace(/[^\p{L}\p{N}_-]/gu,'').slice(0,24)||'Character';sync(); }
  if(el.id==='cat-scale') { S.catScale=Math.max(.5,Math.min(2,+el.value||1));sync(); }
  if(el.id==='cat-axis') { S.lengthAxis=el.value;sync(); }
  if(el.id==='cat-hub-color') {S.hubColors[S.selected]=el.value;sync();return;}
  if(el.id==='cat-hub-custom') {S.customHubMeshes[S.selected]=el.checked;tell(el.checked?'A 3ds Max, Use Custom Mesh permet triar una malla pròpia per al hub.':'S’ha desactivat Use Custom Mesh.');return;}
  if(['cat-hub-length','cat-hub-width','cat-hub-height'].includes(el.id)) {S.hubSizes[S.selected]??={...hubSize(S.selected)};S.hubSizes[S.selected][el.id.slice(8)]=Math.max(1,Math.min(100,+el.value||1));sync();return;}
  if(el.id==='cat-segments') { S.segments=+el.value;sync(); }
  if(el.id==='cat-ankle-bones') {S.ankleBones=Math.max(1,Math.min(5,+el.value||1));sync();}
  if(['cat-ankle-length','cat-ankle-width','cat-ankle-height'].includes(el.id)) {const side=S.selected.at(-1),key=el.id.slice('cat-ankle-'.length);S.ankleSizes[side]??={length:15,width:20,height:10};S.ankleSizes[side][key]=Math.max(5,Math.min(50,+el.value||5));sync();}
  if(el.id==='cat-spine-bones') {S.spineBones=+el.value;sync();}
  if(el.id==='cat-head-bones') {S.headBones=+el.value;sync();}
  if(el.id==='cat-bone-width') {S.boneSizes[S.selected]??={width:S.boneWidth,depth:S.boneDepth};S.boneSizes[S.selected].width=+el.value;sync();}
  if(el.id==='cat-bone-depth') {S.boneSizes[S.selected]??={width:S.boneWidth,depth:S.boneDepth};S.boneSizes[S.selected].depth=+el.value;sync();}
  if(el.id==='cat-hand-digits') {S.handDigits=+el.value;sync();}
  if(el.id==='cat-foot-digits') {S.footDigits=+el.value;sync();}
  if(el.id==='cat-digit-bones') {if(S.selected.startsWith('handDigit'))S.digitBoneCounts[+S.selected.at(-1)]=+el.value;else S.footDigitBones=+el.value;sync();}
  if(el.id==='cat-gizmo-radius') {S.gizmoRadius=+el.value;sync();}
  if(el.id==='cat-affect-limit') {S.boneAffectLimit=+el.value;sync();}
  if(el.id==='cat-curl') { S.digitCurl=+el.value;sync(); }
  if(el.id==='cat-effect'&&S.selectedVertex!=null) { S.weights=paintWeight(S.weights,S.selectedVertex,+el.value);sync(); }
  if(el.id==='cat-paint-value') { S.paintValue=Math.max(0,Math.min(1,+el.value));sync(); }
  if(el.id==='cat-paint-blend'){S.paintBlend=el.checked;sync();return;}
  if(el.id==='cat-paint'||el.id==='cat-vertices'||el.id==='cat-collar'||el.id==='cat-palm') { const key={ 'cat-paint':'paint','cat-vertices':'vertices','cat-collar':'collarbone','cat-palm':'palm' }[el.id];S[key]=el.checked;sync(); }
  if(el.id==='cat-upnode') {S[S.selected.startsWith('arm')?'armUpNode':'legUpNode']=el.checked;sync();}
  if(el.id==='cat-stretch') {S.stretchById[S.selected]=el.checked;sync();}
  if(el.dataset.lock) {S.locksById[S.selected]??={};S.locksById[S.selected][el.dataset.lock]=el.checked;sync();}
  if(el.id==='cat-ik-display') {S.ikDisplay=el.value;sync();}
  if(el.id==='cat-ik') { S.ik=el.value;sync(); }
});
$('steps').addEventListener('click',e=>{const b=e.target.closest('[data-stage]');if(!b)return;S.stage=+b.dataset.stage;S.message='';renderTask();const focus=[null,'pelvis','ribcage','palmL','head','mesh','armL','armL'][S.stage];if(S.stage===0)max.showTab('create');else if(focus&&has(focus))select(focus,S.stage===6||S.stage===7?'hierarchy':'modify');else max.showTab('create');draw();});
$('task-card').addEventListener('click',e=>{const action=e.target.closest('[data-lab]')?.dataset.lab;if(!action)return;
  if(action==='reset'){if(S.reference)URL.revokeObjectURL(S.reference);location.reload();return;}
  if(action==='next'){if(stageDone())$('steps').querySelector(`[data-stage="${S.stage+1}"]`)?.click();return;}
  pushUndo();
  S.objectClass='CAT Objects';S.root=true;S.armed=false;S.baseRadius=1;S.pelvis=true;
  if(S.stage>=1){S.legs=2;S.footDigits=1;S.legUpNode=true;}
  if(S.stage>=2){S.spine=true;S.arms=2;S.joints=structuredClone(targetJoints);S.jointDepths={};S.footTargets={};S.pinnedFootTargets={};S.legIKLengths={};S.legIKRest={};S.segments=3;}
  if(S.stage>=3){S.handDigits=5;S.footDigits=1;S.ikTarget=true;S.armUpNode=true;S.legUpNode=true;}
  if(S.stage>=4){S.head=true;S.jaw=true;S.eyes=true;S.gizmos.add('head');}
  if(S.stage>=5){S.skin=true;S.skinBones=new Set(listObjects().filter(o=>o.kind==='Bone').map(o=>o.id));S.envelopes=true;S.vertices=true;S.boneAffectLimit=3;}
  if(S.stage>=6){for(const id of ['armL','armR','legL','legR'])S.stretchById[id]=false;S.absLayers=['T-Pose','Pesos'];S.activeLayer=1;}
  if(S.stage>=7){S.renames.thighL='L_Thigh';S.renames.shinL='L_Shin';S.renames.thighR='R_Thigh';S.renames.shinR='R_Shin';S.locksById['ikL']={'rotate:x':true,'rotate:y':true,'rotate:z':true};}
  const focus=['catparent','thighL','upperArmL','palmL','head','mesh','armL','thighL'][S.stage];select(focus,S.stage>=6?'hierarchy':'modify');sync();tell('S’ha mostrat una possible solució d’aquesta etapa.');
});
$('reference-file').addEventListener('change',e=>{const file=e.target.files?.[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8e6){tell('Tria una imatge PNG, JPG o WebP de menys de 8 MB.');return;}if(S.reference)URL.revokeObjectURL(S.reference);S.reference=URL.createObjectURL(file);draw();});
$('obj-file').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>12e6)throw new Error('OBJ massa gran per al lab (màxim 12 MB).');cat3d.loadObj(await file.text());S.objName=file.name.replace(/\.obj$/i,'').slice(0,30)||'Imported_OBJ';sync();tell(`${S.objName} importat a la vista 3D. A 3ds Max pots aplicar-hi el rig definitiu.`);}catch(err){tell(err.message);}});
cat3d=createCatView($('cat-vp'),S,{
  onPlace:createParent,
  onBeginUndo:pushUndo,
  onSelect:id=>select(id,'modify'),
  onGizmo:id=>{select(id,'modify');handleAction('add-gizmo');},
  onJoint:(name,point)=>{const legJoint=/^(hip|knee|ankle)([LR])$/.exec(name);if(legJoint)pinFootTarget(S,legJoint[2]);S.joints[name]=point;const changed=[name];if(S.mirror){const pair=mirrorJoint(name,point);if(pair){S.joints[pair[0]]=pair[1];if(S.jointDepths[name]!==undefined)S.jointDepths[pair[0]]=S.jointDepths[name];changed.push(pair[0]);}}invalidateLegSetup(S,changed);draw();},
  onTransform:transformBone,
  onWeight:i=>{if(S.selected==='mesh'&&S.vertices){S.selectedVertex=i;if(S.paint){if(S.paintBlend)S.blendWeights=paintWeight(S.blendWeights,i,S.paintValue);else S.weights=paintWeight(S.weights,i,S.paintValue);}sync();}},
  onOrbit:()=>{S.view='Perspective';max.setViewLabel('Perspective');draw();},
  onError:()=>tell('No s’ha pogut carregar el model 3D; es mostra un model de reserva.'),
});
sync();
window.__catRigLab={S,max,cat3d,handleAction,select};
window.addEventListener('keydown',event=>{if(event.defaultPrevented||/INPUT|SELECT|TEXTAREA/.test(event.target?.tagName||''))return;if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&!event.shiftKey){event.preventDefault();undo();}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();redo();}});
