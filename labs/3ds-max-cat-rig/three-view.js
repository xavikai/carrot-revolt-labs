import * as THREE from 'three';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { createMaxViewport } from '../_max/max-viewport.js';
import { boneSegments, weightColor } from './core.js';
import { partFrame, partSegment, jointDepthOf, gizmoFrame, worldMoveToRig, worldAxisToRig, axisDragPlane } from './transform-frame.js';

const X = x => (x - 300) / 225;
const Y = y => (480 - y) / 225;
const fromJoint = (joint, z = 0.045) => new THREE.Vector3(X(joint[0]), Y(joint[1]), z);
const canvasPos = (event, canvas) => { const r=canvas.getBoundingClientRect(); return new THREE.Vector2((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1); };

export function createCatView(host, state, handlers) {
  const canvas=document.createElement('canvas'); canvas.className='cat-canvas'; canvas.tabIndex=0; canvas.setAttribute('aria-label','Model 3D i ossos CAT; arrossega un os per moure’l, arrossega el fons per girar la vista');
  host.insertBefore(canvas,host.querySelector('#cat-vp-note'));
  const axisFeedback=document.createElement('div');axisFeedback.className='cat-axis-feedback';axisFeedback.hidden=true;axisFeedback.setAttribute('aria-hidden','true');host.appendChild(axisFeedback);
  let viewport;
  viewport=createMaxViewport({host,canvas,onChange:()=>{if(host.dataset.nav==='orbit')handlers.onOrbit?.();else viewport?.render();}});
  const scene=viewport.scene;
  scene.add(new THREE.AmbientLight(0xffffff,.38));
  const fill=new THREE.DirectionalLight(0x95c8ee,.85);fill.position.set(3,2,4);scene.add(fill);
  const back=new THREE.DirectionalLight(0xffffff,.5);back.position.set(0,4,-3);scene.add(back);
  viewport.grid.visible=true;
  const modelRoot=new THREE.Group();scene.add(modelRoot);
  const rigRoot=new THREE.Group();scene.add(rigRoot);
  const gizmoRoot=new THREE.Group();scene.add(gizmoRoot);
  const previewRoot=new THREE.Group();scene.add(previewRoot);
  const raycaster=new THREE.Raycaster();
  raycaster.params.Line.threshold=.018;
  const plane=new THREE.Plane(new THREE.Vector3(0,0,1),-.09);
  let modelObjects=[],rigPick=[],mesh=null,loadError=false,wire=false,meshMode='xray';
  let drag=null,hoverAxis=null,hoverPart=null,pointerPosition=null,gizmoHandles=[];
  const axisColors={x:0xe44953,y:0x64cd63,z:0x5588ee};
  function rotationPointerAngle(event,rotation){
    const [cx,cy]=rotation.center,[ux,uy]=rotation.basisX,[vx,vy]=rotation.basisY;
    const px=event.clientX-cx,py=event.clientY-cy,det=ux*vy-uy*vx;
    if(Math.hypot(px,py)<8)return null;
    if(Math.abs(det)>Math.hypot(ux,uy)*Math.hypot(vx,vy)*.12){
      return Math.atan2((ux*py-uy*px)/det,(px*vy-py*vx)/det);
    }
    return Math.atan2(py,px);
  }
  function refreshAxisFeedback(event,render=false){
    if(event)pointerPosition=[event.clientX,event.clientY];
    const active=drag?.kind==='transform'&&drag.axis!=='free'&&drag.axis!==undefined;
    const axis=!state.armed&&(active?drag.axis:hoverPart===state.selected?hoverAxis:null);
    for(const {name,materials} of gizmoHandles)for(const material of materials){
      material.color.setHex(axis===name?0xffe184:axisColors[name]);
      material.opacity=axis&&axis!==name ? .48 : 1;
    }
    axisFeedback.hidden=!axis;
    if(axis){
      const tool=active?drag.tool:state.transformTool==='select'?'move':state.transformTool;
      const action={move:'Moure',rotate:'Rotar',scale:'Escalar'}[tool]||'Transformar';
      const degrees=active&&tool==='rotate'&&drag.rotation?THREE.MathUtils.radToDeg(drag.rotation.total):null;
      const angle=degrees===null?'':` · ${degrees>=0?'+':''}${degrees.toLocaleString('ca-ES',{minimumFractionDigits:1,maximumFractionDigits:1})}°`;
      axisFeedback.textContent=`${action} · Eix ${axis.toUpperCase()}${angle}`;
      axisFeedback.classList.toggle('active',active);
      axisFeedback.style.setProperty('--axis-color',`#${(active?0xffe184:axisColors[axis]).toString(16).padStart(6,'0')}`);
      if(pointerPosition){const bounds=host.getBoundingClientRect();axisFeedback.style.left=`${Math.max(8,Math.min(bounds.width-axisFeedback.offsetWidth-8,pointerPosition[0]-bounds.left+15))}px`;axisFeedback.style.top=`${Math.max(8,Math.min(bounds.height-axisFeedback.offsetHeight-8,pointerPosition[1]-bounds.top+17))}px`;}
    }
    if(render)viewport.render();
  }
  const axisTextures=Object.fromEntries(Object.entries({x:'#e44953',y:'#64cd63',z:'#5588ee'}).map(([axis,color])=>{
    const labelCanvas=document.createElement('canvas');labelCanvas.width=64;labelCanvas.height=64;
    const context=labelCanvas.getContext('2d');context.font='bold 44px Segoe UI, Arial';context.textAlign='center';context.textBaseline='middle';context.fillStyle=color;context.fillText(axis,32,33);
    return [axis,new THREE.CanvasTexture(labelCanvas)];
  }));

  const mat=(color,selected=false,opacity=null)=>new THREE.MeshStandardMaterial({color:selected?0xffe184:color,roughness:.8,metalness:0,transparent:true,opacity:opacity??(selected?.68:.4),depthTest:false,depthWrite:false,side:THREE.DoubleSide});
  const addEdges=(shape,color=0x75bccc)=>{const edges=new THREE.LineSegments(new THREE.EdgesGeometry(shape.geometry,25),new THREE.LineBasicMaterial({color,transparent:true,opacity:.82,depthTest:false,depthWrite:false}));edges.renderOrder=7;shape.add(edges);};
  const put=(object,id,joint=null)=>{object.userData.partId=id;if(joint)object.userData.joint=joint;object.position.z+=state.depthOffsets?.[id]||0;object.renderOrder=6;rigRoot.add(object);rigPick.push(object);return object;};
  const hub=(id,point,width,height,depth,color)=>{const selected=state.selected===id,size=state.hubSizes?.[id],hubColor=state.hubColors?.[id]||color,shape=new THREE.Mesh(new THREE.BoxGeometry(width*(size?.length??25)/25,height*(size?.height??10)/10,depth*(size?.width??20)/20),mat(hubColor,false,selected?.68:.4));shape.position.copy(fromJoint(point,jointDepthOf(state,id==='ribcage'?'chest':id)));const frame=partFrame(state,id);if(frame)shape.quaternion.copy(frame.rotation);put(shape,id);addEdges(shape,selected?0xffdf7a:0x9fdbe1);return shape;};
  const bone=(id,a,b,color,width=state.boneSizes[id]?.width??state.boneWidth,depth=state.boneSizes[id]?.depth??state.boneDepth,joint=null,zA=.11,zB=.11)=>{
    const p=fromJoint(a,zA),q=fromJoint(b,zB),length=p.distanceTo(q);
    if(length<.01)return;
    const geometry=new THREE.BoxGeometry(width,length,depth),positions=geometry.attributes.position;
    for(let i=0;i<positions.count;i++)if(positions.getY(i)>0){positions.setX(i,positions.getX(i)*.82);positions.setZ(i,positions.getZ(i)*.82);}geometry.computeVertexNormals();
    const shape=new THREE.Mesh(geometry,mat(color,false,.78));
    shape.position.copy(p).add(q).multiplyScalar(.5);
    shape.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),q.clone().sub(p).normalize());
    if(partSegment(id))shape.quaternion.copy(partFrame(state,id).rotation).multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),state.lengthAxis==='Z'?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0)));
    put(shape,id,joint);addEdges(shape,state.selected===id?0xffdf7a:color);
    const axis=new THREE.Line(new THREE.BufferGeometry().setFromPoints([p,q]),new THREE.LineBasicMaterial({color:0x45404d,depthTest:false,transparent:true,opacity:.72}));axis.position.z=state.depthOffsets?.[id]||0;axis.renderOrder=8;rigRoot.add(axis);
  };
  const foot=(id,name,color)=>{const side=id.at(-1),target=state.footTargets?.[side]||[...state.joints[name],state.jointDepths?.[name]??.11],p=fromJoint(target,target[2]+.07),shape=new THREE.Mesh(new THREE.BoxGeometry(.28,.012,.36),mat(color,state.selected===id,.28));shape.position.set(p.x,p.y-.05,p.z);shape.scale.set(...(state.footScales?.[side]||[1,1,1]));shape.rotation.set(...(state.footRotations?.[side]||[0,0,0]));put(shape,id);addEdges(shape,state.selected===id?0xffdf7a:0xbb8be5);};
  const palm=(id,name,color)=>{
    const ankle=id.startsWith('ankle'),depth=jointDepthOf(state,name),p=fromJoint(state.joints[name],depth);
    const size=ankle?(state.ankleSizes?.[id.at(-1)]||{length:15,width:20,height:10}):null;
    const count=ankle?Math.max(1,state.ankleBones||2):1;
    for(let index=0;index<count;index++){
      const shape=new THREE.Mesh(new THREE.BoxGeometry(ankle?.11*size.width/20:.13,ankle?.17*size.length/15/count:.085,ankle?.11*size.height/10:.075),mat(color,state.selected===id));
      shape.position.copy(p);
      const frame=partFrame(state,id);
      shape.quaternion.copy(frame.rotation).multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),state.lengthAxis==='Z'?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0)));
      if(ankle){shape.position.y-=.035;shape.position.add(new THREE.Vector3(0,-(.17*size.length/15)*(index-(count-1)/2)/count,0).applyQuaternion(shape.quaternion));}
      put(shape,id,ankle?name:null);addEdges(shape,ankle?0xe98a84:0xc5e6ed);
    }
  };
  const parentShape=(r,group,selectable=true)=>{
    const green=0x76d9a1,y=.035,selected=state.selected==='catparent';
    // Three rounded corners: the point and the arrow both face the character's front (+Z).
    const vertices=[[-1.12,-.58],[1.12,-.58],[0,.9]].map(([x,z])=>new THREE.Vector3(x*r,y,z*r));
    const corner=vertices.map((v,i)=>{
      const toward=(other)=>other.clone().sub(v).normalize().multiplyScalar(.23*r).add(v);
      return {entry:toward(vertices[(i+2)%3]),exit:toward(vertices[(i+1)%3])};
    });
    const border=new THREE.CurvePath();
    corner.forEach((c,i)=>{border.add(new THREE.QuadraticBezierCurve3(c.entry,vertices[i],c.exit));border.add(new THREE.LineCurve3(c.exit,corner[(i+1)%3].entry));});
    const borderMat=new THREE.MeshBasicMaterial({color:green,depthTest:false,depthWrite:false});
    const outline=new THREE.Mesh(new THREE.TubeGeometry(border,108,.026,8,true),borderMat);outline.renderOrder=7;group.add(outline);
    if(selected){const rim=new THREE.Mesh(new THREE.TubeGeometry(border,108,.006,5,true),new THREE.MeshBasicMaterial({color:0xf7e65c,depthTest:false,depthWrite:false}));rim.position.y=.004;rim.renderOrder=8;group.add(rim);}
    const arrowShape=new THREE.Shape();arrowShape.moveTo(-.13*r,-.28*r);arrowShape.lineTo(.13*r,-.28*r);arrowShape.lineTo(.13*r,.02*r);arrowShape.lineTo(.36*r,.02*r);arrowShape.lineTo(0,.42*r);arrowShape.lineTo(-.36*r,.02*r);arrowShape.lineTo(-.13*r,.02*r);arrowShape.closePath();
    const arrow=new THREE.Mesh(new THREE.ShapeGeometry(arrowShape),new THREE.MeshBasicMaterial({color:green,depthTest:false,depthWrite:false,side:THREE.DoubleSide}));arrow.rotation.x=Math.PI/2;arrow.position.y=.058;arrow.renderOrder=11;group.add(arrow);
    if(selected){const edgePoints=arrowShape.getPoints(1).map(p=>new THREE.Vector3(p.x,.064,p.y));edgePoints.push(edgePoints[0].clone());const edge=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edgePoints,false,'centripetal'),42,.007,5,false),new THREE.MeshBasicMaterial({color:0xf7e65c,depthTest:false,depthWrite:false}));edge.renderOrder=13;group.add(edge);}
    if(selectable){outline.userData.partId='catparent';arrow.userData.partId='catparent';rigPick.push(outline,arrow);}
  };
  const parent=()=>{const group=new THREE.Group();group.userData.catParent=true;rigRoot.add(group);parentShape(state.baseRadius||.95,group);};
  const partVisible=(part,a,b)=>{if(!state.root||!state.pelvis)return false;if(part==='pelvis')return false;if(part==='spine')return state.spine;if(part==='head')return state.head;if(part==='legs')return a.endsWith('L')||b.endsWith('L')?state.legs>=1:state.legs>=2;if(part==='arms')return a.endsWith('L')||b.endsWith('L')?state.arms>=1:state.arms>=2;return false;};
  const partId=name=>{if(name==='chest')return 'ribcage';if(name==='head')return 'head';if(name==='pelvis')return 'pelvis';for(const [prefix,id] of [['shoulder','arm'],['elbow','upperArm'],['wrist','forearm'],['hip','leg'],['knee','thigh'],['ankle','shin']])if(name.startsWith(prefix))return `${id}${name.at(-1)}`;return 'catparent';};
  const boneJointDepth=name=>jointDepthOf(state,name);
  const clearRig=()=>{for(const group of [rigRoot,gizmoRoot])for(const child of [...group.children]){group.remove(child);child.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose();}});}rigPick=[];gizmoHandles=[];};
  function buildRig(){
    clearRig();if(!state.root){refreshAxisFeedback();return;}
    const parentTransform=state.parentTransform||{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]};
    rigRoot.scale.set(...parentTransform.scale.map(value=>value*state.catScale));
    rigRoot.position.set(parentTransform.position[0],parentTransform.position[1]+.03*(1-state.catScale),parentTransform.position[2]);
    rigRoot.rotation.set(...parentTransform.rotation);
    parent();
    if(!state.pelvis){buildGizmo();refreshAxisFeedback();viewport.render();return;}
    hub('pelvis',state.joints.pelvis,.32,.12,.18,0xe2d593);
    if(state.spine){const a=state.joints.pelvis,b=state.joints.chest,n=state.spineBones||3,za=jointDepthOf(state,'pelvis'),zb=jointDepthOf(state,'chest');for(let i=0;i<n;i++){const p=[a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n],q=[a[0]+(b[0]-a[0])*(i+1)/n,a[1]+(b[1]-a[1])*(i+1)/n];bone('spine',p,q,0xe5c9dd,.085,.09,i===n-1?'chest':null,za+(zb-za)*i/n,za+(zb-za)*(i+1)/n);}hub('ribcage',state.joints.chest,.43,.11,.18,0xe9b4d3);}
    if(state.head){const a=state.joints.chest,b=state.joints.head,n=state.headBones||2,za=jointDepthOf(state,'chest'),zb=jointDepthOf(state,'head');for(let i=0;i<n;i++){const p=[a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n],q=[a[0]+(b[0]-a[0])*(i+1)/n,a[1]+(b[1]-a[1])*(i+1)/n];bone('head',p,q,0xe7bfda,.075,.075,i===n-1?'head':null,za+(zb-za)*i/n,za+(zb-za)*(i+1)/n);}hub('head',state.joints.head,.13,.09,.12,0xd9b5d0);}
    for(const [a,b,part] of boneSegments){
      if(!partVisible(part,a,b)||part==='spine'||part==='head')continue;
      const id=partId(b),color=part==='legs'?(id.startsWith('thigh')?0x6268d8:0x50bb55):b.endsWith('L')?0xd78ba3:0x5b61c8,width=state.boneSizes[id]?.width??(part==='legs'?Math.max(.10,state.boneWidth):state.boneWidth),depth=state.boneSizes[id]?.depth??state.boneDepth;
      const n=part==='arms'&&a.startsWith('elbow')?state.segments:1;
      for(let i=0;i<n;i++){const p=state.joints[a].map((v,k)=>v+(state.joints[b][k]-v)*i/n),q=state.joints[a].map((v,k)=>v+(state.joints[b][k]-v)*(i+1)/n),depthA=state.jointDepths?.[a]??boneJointDepth(a),depthB=state.jointDepths?.[b]??boneJointDepth(b),za=depthA+(depthB-depthA)*i/n,zb=depthA+(depthB-depthA)*(i+1)/n;bone(id,p,q,color,width,depth,i===n-1?b:null,za,zb);}
    }
    for(const side of ['L','R']){
      if(state.legs<(side==='L'?1:2))continue;
      const hip=fromJoint(state.joints[`hip${side}`],state.jointDepths?.[`hip${side}`]??.11);
      const target=state.footTargets?.[side]||[...state.joints[`ankle${side}`],state.jointDepths?.[`ankle${side}`]??.11];
      const footPoint=fromJoint(target,target[2]+.07);footPoint.y-=.05;
      const offset=side==='L'?-0.055:0.055;
      hip.x+=offset;footPoint.x+=offset;hip.z+=.14;footPoint.z+=.14;
      const guide=new THREE.Line(new THREE.BufferGeometry().setFromPoints([hip,footPoint]),new THREE.LineBasicMaterial({color:0x55e7f7,transparent:true,opacity:.95,depthTest:false,depthWrite:false}));
      guide.renderOrder=12;guide.userData.ikGuide=side;rigRoot.add(guide);
      foot(`foot${side}`,`ankle${side}`,0xa479d0);
    }
    if(state.palm){if(state.legs>=1)palm('ankleL','ankleL',0xe16b69);if(state.legs>=2)palm('ankleR','ankleR',0xe16b69);if(state.arms>=1)palm('palmL','wristL',0xe4bed8);if(state.arms>=2)palm('palmR','wristR',0xe4bed8);}
    for(const side of ['L','R']){
      const readyArm=state.arms >= (side==='L'?1:2),readyLeg=state.legs >= (side==='L'?1:2),sign=side==='L'?1:-1;
      if(readyArm&&state.handDigits){const wrist=state.joints[`wrist${side}`];for(let i=0;i<state.handDigits;i++){const count=state.digitBoneCounts[i]||4,span=i===0?21:31-(i===4?8:0),dy=(i-2)*5;for(let j=0;j<count;j++){const a=[wrist[0]+sign*(7+span*j/count),wrist[1]+dy*j/count],b=[wrist[0]+sign*(7+span*(j+1)/count),wrist[1]+dy*(j+1)/count];bone(`handDigit${side}${i}`,a,b,0xe8cbe0,.013,.018,null,.18,.18);}}}
      if(readyLeg&&state.footDigits){const p=state.joints[`ankle${side}`];for(let i=0;i<state.footDigitBones;i++)bone(`footDigit${side}`,[p[0],p[1]],[p[0],p[1]-1],0x9ad7e9,.045,.035,null,.16+i*.13/state.footDigitBones,.16+(i+1)*.13/state.footDigitBones);}
    }
    const helper=(id,point,color,z=.62)=>{const p=fromJoint(point,z),r=.07,pts=[new THREE.Vector3(-r,0,0),new THREE.Vector3(r,0,0),new THREE.Vector3(0,-r,0),new THREE.Vector3(0,r,0),new THREE.Vector3(0,0,-r),new THREE.Vector3(0,0,r)].map(v=>v.add(p));const line=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color,depthTest:false,transparent:true,opacity:.9}));line.renderOrder=8;put(line,id);};
    for(const side of ['L','R']){if(state.legUpNode&&state.legs>=(side==='L'?1:2))helper(`legUp${side}`,state.joints[`knee${side}`],0x94d5ea);if(state.armUpNode&&state.arms>=(side==='L'?1:2))helper(`armUp${side}`,state.joints[`elbow${side}`],0xe8c6dd);if(state.ikTarget&&state.arms>=(side==='L'?1:2)){const p=fromJoint(state.joints[`wrist${side}`],.31);if(state.ikDisplay==='rectangle'){const m=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(.23,.23,.015)),new THREE.LineBasicMaterial({color:0xebd8ef,depthTest:false}));m.position.copy(p);m.renderOrder=8;put(m,`ik${side}`);}else helper(`ik${side}`,state.joints[`wrist${side}`],0xebd8ef,.31);}}
    if(state.jaw&&state.head)bone('jaw',[300,139],[300,151],0x9ed8cb,.095,.07,null,.22,.25);
    if(state.eyes&&state.head)for(const side of ['L','R']){const x=side==='L'?315:285;hub(`eye${side}`,[x,110],.045,.04,.055,0xa8d8c9);}
    for(const id of state.gizmos){const anchor=id==='head'?state.joints.head:id==='pelvis'?state.joints.pelvis:id==='ribcage'?state.joints.chest:id.startsWith('arm')?state.joints[`elbow${id.at(-1)}`]:id.startsWith('leg')?state.joints[`knee${id.at(-1)}`]:null;if(!anchor)continue;const ring=new THREE.Mesh(new THREE.TorusGeometry(state.gizmoRadius,.006,6,56),new THREE.MeshBasicMaterial({color:0xe7c982,depthTest:false,depthWrite:false}));ring.position.copy(fromJoint(anchor,.24));ring.renderOrder=9;put(ring,`gizmo:${id}`);}
    if(state.tail)bone('tail',state.joints.pelvis,[380,395],0xd07ebc,.08,.07);
    if(state.extra)bone('extra',state.joints.chest,[330,245],0xd07ebc,.075,.065);
    if(state.skin&&state.envelopes&&state.selected==='mesh'){const a=fromJoint(state.joints.shoulderL,.26),b=fromJoint(state.joints.wristL,.26);for(let i=0;i<state.weights.length;i++){const t=(i+.5)/state.weights.length,p=a.clone().lerp(b,t);p.y-=.06;const c=new THREE.Color(weightColor(state.paintBlend?state.blendWeights[i]:state.weights[i]));const m=new THREE.Mesh(new THREE.SphereGeometry(i===state.selectedVertex?.035:.027,10,8),new THREE.MeshBasicMaterial({color:c,depthTest:false,depthWrite:false}));m.position.copy(p);m.userData.weightIndex=i;m.renderOrder=10;rigRoot.add(m);rigPick.push(m);}}
    if(state.pelvisDepth)for(const child of rigRoot.children)if(!child.userData.catParent)child.position.z+=state.pelvisDepth;
    buildGizmo();
    refreshAxisFeedback();
    viewport.render();
  }
  function buildGizmo(){
    const selected=state.selected||'';
    const hubSelected=['pelvis','ribcage','head'].includes(selected);
    const spineSelected=selected==='spine';
    const match=/^(upperArm|forearm|thigh|shin|arm|leg)([LR])$/.exec(selected);
    const endMatch=/^(palm|ankle|foot)([LR])$/.exec(selected);
    const activeTool=state.transformTool==='select'?'move':state.transformTool;
    if((selected==='catparent'||endMatch?.[1]==='foot')||((hubSelected||spineSelected||match||endMatch)&&state.mode==='Setup')){
      const {pivot,axes}=gizmoFrame(state,selected,viewport.camera.quaternion);
      const colors=axisColors;
      for(const [axis,dir] of Object.entries(axes)){
        let handle;
        const hitMaterial=()=>new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthTest:false,depthWrite:false});
        if(activeTool==='rotate'){
          handle=new THREE.Mesh(new THREE.TorusGeometry(.28,.012,8,48),new THREE.MeshBasicMaterial({color:colors[axis],transparent:true,depthTest:false,depthWrite:false}));
          handle.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),dir);handle.position.copy(pivot);
          handle.add(new THREE.Mesh(new THREE.TorusGeometry(.28,.065,6,48),hitMaterial()));
        }else{
          const group=new THREE.Group();
          const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.011,.011,.30,8),new THREE.MeshBasicMaterial({color:colors[axis],transparent:true,depthTest:false,depthWrite:false}));
          shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);shaft.position.copy(dir).multiplyScalar(.15);group.add(shaft);
          const tip=new THREE.Mesh(activeTool==='scale'?new THREE.BoxGeometry(.065,.065,.065):new THREE.ConeGeometry(.045,.11,8),new THREE.MeshBasicMaterial({color:colors[axis],transparent:true,depthTest:false,depthWrite:false}));
          if(activeTool==='move')tip.quaternion.copy(shaft.quaternion);tip.position.copy(dir).multiplyScalar(.33);group.add(tip);
          const target=new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,.43,8),hitMaterial());
          target.quaternion.copy(shaft.quaternion);target.position.copy(dir).multiplyScalar(.18);group.add(target);
          handle=group;handle.position.copy(pivot);
        }
        handle.userData.partId=state.selected;handle.userData.transformAxis=axis;handle.userData.transformDirection=dir.clone();handle.renderOrder=20;gizmoRoot.add(handle);rigPick.unshift(handle);for(const child of handle.children){child.userData.partId=state.selected;child.userData.transformAxis=axis;child.userData.transformDirection=dir.clone();child.renderOrder=21;rigPick.unshift(child);}
        const materials=[];handle.traverse(object=>{if(object.isMesh&&object.material?.opacity!==0)materials.push(object.material);});
        if(activeTool!=='rotate'){
          const label=new THREE.Sprite(new THREE.SpriteMaterial({map:axisTextures[axis],transparent:true,depthTest:false,depthWrite:false}));
          label.position.copy(pivot).addScaledVector(dir,.44);label.scale.set(.11,.11,1);label.renderOrder=22;gizmoRoot.add(label);
        }
        gizmoHandles.push({name:axis,materials});
      }
    }
  }
  function setMeshOpacity(){for(const o of modelObjects){if(!o.material)continue;const materials=Array.isArray(o.material)?o.material:[o.material];for(const m of materials){m.transparent=meshMode!=='solid';m.opacity=meshMode==='hidden'?0:meshMode==='solid'?1:.48;m.depthWrite=meshMode==='solid';m.wireframe=wire;}}viewport.render();}
  function installModel(object){
    for(const old of [...modelRoot.children])modelRoot.remove(old);
    modelRoot.add(object);mesh=object;
    const box=new THREE.Box3().setFromObject(object),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    if(size.y>0){const scale=1.79/size.y;object.scale.multiplyScalar(scale);object.position.x-=center.x*scale;object.position.y-=box.min.y*scale;object.position.z-=center.z*scale;}
    modelObjects=[];object.traverse(o=>{if(!o.isMesh)return;const originals=Array.isArray(o.material)?o.material:[o.material];o.material=originals.map(m=>m.clone());if(o.material.length===1)o.material=o.material[0];o.castShadow=false;modelObjects.push(o);});
    setMeshOpacity();viewport.render();
  }
  function fallback(){
    const group=new THREE.Group(),body=new THREE.MeshStandardMaterial({color:0x789aa7,roughness:.86}),skin=new THREE.MeshStandardMaterial({color:0xc69d80,roughness:.9});
    const add=(g,m,x,y,z,sx,sy,sz)=>{const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);group.add(o);};
    add(new THREE.SphereGeometry(1,24,16),skin,0,1.62,0,.19,.23,.17);add(new THREE.SphereGeometry(1,24,16),body,0,1.12,0,.33,.52,.19);add(new THREE.SphereGeometry(1,24,16),body,0,.72,0,.24,.16,.18);
    for(const s of [-1,1]){add(new THREE.SphereGeometry(1,16,12),body,s*.29,1.24,0,.1,.33,.1);add(new THREE.SphereGeometry(1,16,12),skin,s*.42,.83,0,.08,.28,.075);add(new THREE.SphereGeometry(1,16,12),body,s*.15,.42,0,.12,.38,.12);add(new THREE.SphereGeometry(1,16,12),body,s*.17,.16,0,.09,.25,.09);}
    installModel(group);
  }
  new GLTFLoader().load('./vendor/night-striker.glb',gltf=>installModel(gltf.scene),undefined,error=>{loadError=true;fallback();handlers.onError?.(error);});

  function pick(event){
    raycaster.setFromCamera(canvasPos(event,canvas),viewport.camera);
    const rigHits=raycaster.intersectObjects(rigPick,true).map(hit=>{let object=hit.object;while(object&&!object.userData.transformAxis&&!object.userData.partId&&object.userData.weightIndex==null)object=object.parent;return {...hit,object:object||hit.object};});
    return rigHits.find(hit=>hit.object.userData.transformAxis)||rigHits.find(hit=>hit.object.userData.partId||hit.object.userData.weightIndex!=null)||raycaster.intersectObjects(modelObjects,true)[0]||null;
  }
  function onDown(event){if(event.button!==0)return;event.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);const hit=pick(event),o=hit?.object;
    if(state.armed){hoverAxis=null;refreshAxisFeedback(event,true);handlers.onBeginUndo?.();drag={kind:'create',x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY};canvas.style.cursor='crosshair';return;}
    if(o?.userData.weightIndex!=null){handlers.onWeight(o.userData.weightIndex);if(state.paint)drag={kind:'paint'};return;}
    if(o?.userData.transformAxis){
      handlers.onBeginUndo?.();
      const worldAxis=o.userData.transformDirection.clone(),position=gizmoFrame(state,o.userData.partId,viewport.camera.quaternion).pivot;
      const direction=o.userData.partId==='catparent'?worldAxis.clone():worldAxisToRig(state,worldAxis);
      const start=position.clone().project(viewport.camera),end=position.clone().add(worldAxis).project(viewport.camera),rect=canvas.getBoundingClientRect();
      const projected=[(end.x-start.x)*rect.width/2,-(end.y-start.y)*rect.height/2];
      const tool=state.transformTool==='select'?'move':state.transformTool;
      let rotation=null;
      if(tool==='rotate'){
        const ring=o.parent?.userData.transformAxis===o.userData.transformAxis?o.parent:o;
        const screen=point=>{const p=point.project(viewport.camera);return [rect.left+(p.x+1)*rect.width/2,rect.top+(1-p.y)*rect.height/2];};
        const center=screen(ring.localToWorld(new THREE.Vector3())),x=screen(ring.localToWorld(new THREE.Vector3(.28,0,0))),y=screen(ring.localToWorld(new THREE.Vector3(0,.28,0)));
        rotation={center,basisX:[x[0]-center[0],x[1]-center[1]],basisY:[y[0]-center[0],y[1]-center[1]],total:0,previousAngle:null};
        rotation.previousAngle=rotationPointerAngle(event,rotation);
      }
      const movePlane=axisDragPlane(position,worldAxis,viewport.camera.position),point=new THREE.Vector3();
      const movePoint=movePlane&&raycaster.ray.intersectPlane(movePlane,point)?point:null;
      drag={kind:'transform',id:o.userData.partId,axis:o.userData.transformAxis,tool,direction,worldAxis,projected,rotation,movePlane,movePoint,x:event.clientX,y:event.clientY};refreshAxisFeedback(event,true);canvas.style.cursor='crosshair';return;
    }
    hoverAxis=null;refreshAxisFeedback(event,true);
    // Endpoint handles move the shared joint itself. This lets the knee stretch
    // both connected bones while the ankle and FootPlatform stay fixed.
    if(o?.userData.joint&&state.mode==='Setup'){
      handlers.onSelect(o.userData.partId||o.userData.joint);handlers.onBeginUndo?.();
      drag={kind:'joint',joint:o.userData.joint,x:event.clientX,y:event.clientY};canvas.style.cursor='crosshair';return;
    }
    if(o?.userData.partId){const id=o.userData.partId;handlers.onSelect(id);if((id==='catparent'||/^foot[LR]$/.test(id))||(state.mode==='Setup'&&(['pelvis','spine','ribcage','head'].includes(id)||/^(upperArm|forearm|thigh|shin|arm|leg|palm|ankle)[LR]$/.test(id)))){handlers.onBeginUndo?.();drag={kind:'transform',id,axis:'free',x:event.clientX,y:event.clientY};}canvas.style.cursor='crosshair';return;}
    if(o&&modelObjects.some(m=>m===o||m.children.includes(o))){handlers.onSelect('mesh');return;}
    drag={kind:'orbit',x:event.clientX,y:event.clientY};canvas.style.cursor='grabbing';
  }
  function onMove(event){if(!drag){const o=pick(event)?.object,axis=o?.userData.transformAxis||null,part=o?.userData.partId||null,changed=axis!==hoverAxis||part!==hoverPart;hoverAxis=axis;hoverPart=part;refreshAxisFeedback(event,changed);canvas.style.cursor=state.armed||part||axis?'crosshair':'default';return;}const dx=event.clientX-drag.x,dy=event.clientY-drag.y;drag.x=event.clientX;drag.y=event.clientY;
    if(drag.kind==='create'){for(const child of [...previewRoot.children]){previewRoot.remove(child);child.geometry?.dispose();child.material?.dispose();}const distance=Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY),height=canvas.getBoundingClientRect().height;parentShape(Math.max(.3,Math.min(2.6,distance/Math.max(1,height)*3.2)),previewRoot,false);viewport.render();return;}
    if(drag.kind==='orbit'){viewport.orbit(dx,dy);handlers.onOrbit?.();return;}
    if(drag.kind==='transform'){
      let worldDelta=null;
      let dragScalar=dx;
      if(drag.rotation){
        const angle=rotationPointerAngle(event,drag.rotation),previous=drag.rotation.previousAngle;
        if(angle!==null){
          const delta=previous===null?0:Math.atan2(Math.sin(angle-previous),Math.cos(angle-previous));
          const signedDelta=delta;
          drag.rotation.total+=signedDelta;
          drag.rotation.previousAngle=angle;
          dragScalar=signedDelta/.012;
        }else{drag.rotation.previousAngle=null;dragScalar=0;}
      }else if(drag.direction){
        const [px,py]=drag.projected,lengthSq=px*px+py*py;
        dragScalar=Math.abs(px)>=Math.abs(py)?dx*Math.sign(px||1):dy*Math.sign(py||1);
        if(drag.tool==='move'){
          let amount=lengthSq>64?(dx*px+dy*py)/lengthSq:dragScalar*.008;
          if(drag.movePlane){
            raycaster.setFromCamera(canvasPos(event,canvas),viewport.camera);
            const point=new THREE.Vector3();
            if(raycaster.ray.intersectPlane(drag.movePlane,point)){
              amount=drag.movePoint?point.clone().sub(drag.movePoint).dot(drag.worldAxis):0;
              drag.movePoint=point;
            }
          }
          const delta=drag.worldAxis.clone().multiplyScalar(amount);
          worldDelta=(drag.id==='catparent'?delta:worldMoveToRig(state,delta)).toArray();
        }
      }
      handlers.onTransform?.(drag.id,drag.tool||(state.transformTool==='select'?'move':state.transformTool),dragScalar,dy,drag.axis,worldDelta,drag.direction?.toArray()||null);refreshAxisFeedback(event);return;
    }
    if(drag.kind==='paint'){const hit=pick(event);if(hit?.object?.userData.weightIndex!=null)handlers.onWeight(hit.object.userData.weightIndex);return;}
    raycaster.setFromCamera(canvasPos(event,canvas),viewport.camera);const p=new THREE.Vector3();if(raycaster.ray.intersectPlane(plane,p)){const x=Math.max(70,Math.min(530,300+p.x*225)),y=Math.max(44,Math.min(470,480-p.y*225));handlers.onJoint(drag.joint,[x,y]);}
  }
  canvas.addEventListener('pointerdown',onDown);canvas.addEventListener('pointermove',onMove);canvas.addEventListener('pointerup',event=>{if(drag?.kind==='create'){const distance=Math.hypot(drag.x-drag.startX,drag.y-drag.startY),height=canvas.getBoundingClientRect().height;for(const child of [...previewRoot.children]){previewRoot.remove(child);child.geometry?.dispose();child.material?.dispose();}handlers.onPlace(Math.max(.3,Math.min(2.6,distance/Math.max(1,height)*3.2)));}drag=null;const hit=pick(event)?.object;hoverAxis=hit?.userData.transformAxis||null;hoverPart=hit?.userData.partId||null;refreshAxisFeedback(event,true);canvas.style.cursor=state.armed?'crosshair':'default';});canvas.addEventListener('pointercancel',()=>{previewRoot.clear();drag=null;hoverAxis=null;hoverPart=null;refreshAxisFeedback(null,true);canvas.style.cursor=state.armed?'crosshair':'default';});canvas.addEventListener('pointerleave',()=>{if(drag)return;hoverAxis=null;hoverPart=null;refreshAxisFeedback(null,true);});
  canvas.addEventListener('contextmenu',event=>{event.preventDefault();host.querySelector('.cat-context-menu')?.remove();const id=pick(event)?.object?.userData.partId;if(!id||id==='mesh'||id.startsWith('gizmo:'))return;const bounds=host.getBoundingClientRect(),menu=document.createElement('div');menu.className='cat-context-menu';menu.style.left=`${Math.min(event.clientX-bounds.left,bounds.width-145)}px`;menu.style.top=`${Math.min(event.clientY-bounds.top,bounds.height-50)}px`;menu.innerHTML='<button type="button">Add Gizmo</button>';menu.querySelector('button').addEventListener('click',()=>{handlers.onGizmo?.(id);menu.remove();});host.appendChild(menu);});
  host.insertAdjacentHTML('beforeend','<div class="cat-3d-tools"><button type="button" data-view-tool="xray" class="on">See-Through</button><button type="button" data-view-tool="solid">Solid</button><button type="button" data-view-tool="hidden">Rig only</button></div>');
  host.addEventListener('click',event=>{const button=event.target.closest('[data-view-tool]');if(!button)return;meshMode=button.dataset.viewTool;host.querySelectorAll('[data-view-tool]').forEach(b=>b.classList.toggle('on',b===button));setMeshOpacity();});
  window.addEventListener('keydown',event=>{if(event.altKey&&event.key.toLowerCase()==='x'&&!/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName||'')){event.preventDefault();meshMode=meshMode==='xray'?'solid':'xray';host.querySelectorAll('[data-view-tool]').forEach(b=>b.classList.toggle('on',b.dataset.viewTool===meshMode));setMeshOpacity();}});
  const fitDistance=()=>{const rect=host.getBoundingClientRect(),aspect=Math.max(.25,rect.width/Math.max(1,rect.height));return Math.max(4.5,2.2/(2*Math.tan(40*Math.PI/360)*aspect));};
  viewport.setView('perspective',{x:0,y:0,z:.91},fitDistance());
  return {
    update:buildRig,
    setView(name){viewport.setView(name==='Front'?'front':name==='Left'?'left':'perspective',{x:0,y:0,z:.91},fitDistance());viewport.render();},
    setWireframe(on){wire=!!on;setMeshOpacity();},
    loadObj(text){
      const v=[],tri=[];for(const line of text.split(/\r?\n/)){if(line.startsWith('v ')){const p=line.trim().split(/\s+/).slice(1,4).map(Number);if(p.length===3&&p.every(Number.isFinite))v.push(p);}else if(line.startsWith('f ')){const f=line.trim().split(/\s+/).slice(1).map(s=>parseInt(s,10)-1);for(let i=1;i<f.length-1;i++)if([f[0],f[i],f[i+1]].every(n=>Number.isInteger(n)&&v[n]))tri.push(...v[f[0]],...v[f[i]],...v[f[i+1]]);}}
      if(tri.length<9)throw new Error('OBJ sense geometria vàlida.');const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(tri,3));g.computeVertexNormals();const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:0x92a2a9,roughness:.85,side:THREE.DoubleSide}));installModel(m);viewport.render();
    },
    error:()=>loadError,
    render:()=>viewport.render(),
  };
}
