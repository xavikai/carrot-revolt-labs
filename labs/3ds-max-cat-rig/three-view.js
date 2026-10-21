import * as THREE from 'three';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { createMaxViewport } from '../_max/max-viewport.js';
import { weightColor } from './core.js';
import { hasLeg, partFrame, jointPosition, gizmoFrame, worldMoveToRig, worldAxisToRig, axisDragPlane, parentMatrix, baseId } from './transform-frame.js';
import { chainBones, footBones, handDigits, gizmoAnchor, transformable, targetVector, PALM_LENGTH } from './rig-geometry.js';

const canvasPos = (event, canvas) => { const r=canvas.getBoundingClientRect(); return new THREE.Vector2((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1); };

export function createCatView(host, state, handlers) {
  const canvas=document.createElement('canvas'); canvas.className='cat-canvas'; canvas.tabIndex=0; canvas.setAttribute('aria-label','Model 3D i ossos CAT; arrossega un os per moure’l, arrossega el fons per girar la vista');
  host.insertBefore(canvas,host.querySelector('#cat-vp-note'));
  const axisFeedback=document.createElement('div');axisFeedback.className='cat-axis-feedback';axisFeedback.hidden=true;axisFeedback.setAttribute('aria-hidden','true');host.appendChild(axisFeedback);
  let viewport;
  viewport=createMaxViewport({host,canvas,orthoViews:true,onChange:()=>{if(!viewport)return;if(gizmoDist&&Math.abs(viewport.view.dist-gizmoDist)/gizmoDist>.04){buildRig();return;}if(host.dataset.nav==='orbit')handlers.onOrbit?.();else viewport.render();}});
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
  let modelObjects=[],rigPick=[],mesh=null,loadError=false,wire=false,meshMode='xray';
  let drag=null,hoverAxis=null,hoverPart=null,pointerPosition=null,gizmoHandles=[],gizmoDist=null;
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
  const put=(object,id,joint=null)=>{object.userData.partId=id;if(joint)object.userData.joint=joint;object.renderOrder=6;rigRoot.add(object);rigPick.push(object);return object;};
  const isSelected=id=>!!state.selected&&(state.selected===id||baseId(state.selected)===id&&!String(state.selected).startsWith('gizmo:'));
  const hub=(id,width,height,depth,color)=>{
    const frame=partFrame(state,id);if(!frame)return;
    const selected=isSelected(id),size=state.hubSizes?.[id],hubColor=state.hubColors?.[id]||color;
    const h=height*(size?.height??10)/10,shape=new THREE.Mesh(new THREE.BoxGeometry(width*(size?.length??25)/25,h,depth*(size?.width??20)/20),mat(hubColor,false,selected?.68:.4));
    shape.quaternion.copy(frame.rotation);shape.position.copy(frame.pivot);
    // The head hub grows upwards from its pivot at the base of the skull.
    if(id==='head')shape.position.add(new THREE.Vector3(0,h/2,0).applyQuaternion(frame.rotation));
    put(shape,id);addEdges(shape,selected?0xffdf7a:0x9fdbe1);return shape;
  };
  // A CAT bone: a box from a to b, slightly tapered. Limb bones keep their Local frame so a twist is visible.
  const bone=(id,a,b,color,width,depth,{joint=null,frameId=null}={})=>{
    const length=a.distanceTo(b);if(length<.004)return;
    const geometry=new THREE.BoxGeometry(width,length,depth),positions=geometry.attributes.position;
    for(let i=0;i<positions.count;i++)if(positions.getY(i)>0){positions.setX(i,positions.getX(i)*.82);positions.setZ(i,positions.getZ(i)*.82);}geometry.computeVertexNormals();
    const selected=isSelected(id)||isSelected(baseId(id)),shape=new THREE.Mesh(geometry,mat(color,false,selected?.92:.78));
    shape.position.copy(a).add(b).multiplyScalar(.5);
    const along=b.clone().sub(a).normalize();
    shape.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),along);
    const frame=frameId&&partFrame(state,frameId);
    if(frame){const lengthAxis=state.lengthAxis==='Z'?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0);const q=frame.rotation.clone().multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),lengthAxis));if(new THREE.Vector3(0,1,0).applyQuaternion(q).dot(along)>.9998)shape.quaternion.copy(q);}
    put(shape,id,joint);addEdges(shape,selected?0xffdf7a:color);
    return shape;
  };
  const line=(points,color,opacity=.9,order=8)=>{const object=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,transparent:true,opacity,depthTest:false,depthWrite:false}));object.renderOrder=order;rigRoot.add(object);return object;};
  const cross=(id,point,color,r=.06)=>{const pts=[[-r,0,0],[r,0,0],[0,-r,0],[0,r,0],[0,0,-r],[0,0,r]].map(v=>new THREE.Vector3(...v).add(point));const object=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:isSelected(id)?0xffe184:color,depthTest:false,transparent:true,opacity:.95}));object.renderOrder=8;
    // invisible ball so the thin cross is easy to click
    const hit=new THREE.Mesh(new THREE.SphereGeometry(r*.7,8,6),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthTest:false,depthWrite:false}));hit.position.copy(point);put(hit,id);put(object,id);};
  // CAT IKTarget (FootPlatform or hand IK Target): a flat rectangle outline (Platform) or a Cross, sized by Length × Width.
  const ikTarget=(id,point,rotation,color)=>{
    const display=state.targetDisplay?.[id]||(id.startsWith('foot')?'platform':'cross'),size={length:20,width:20,...(state.targetSize?.[id]||{})},selected=isSelected(id);
    const L=size.length*.011,W=size.width*.011;
    if(display==='cross'){cross(id,point,color,Math.max(L,W)*.35);return;}
    const corners=[[-W/2,-L/2],[W/2,-L/2],[W/2,L/2],[-W/2,L/2],[-W/2,-L/2]].map(([x,z])=>new THREE.Vector3(x,0,z).applyQuaternion(rotation).add(point));
    const outline=new THREE.Line(new THREE.BufferGeometry().setFromPoints(corners),new THREE.LineBasicMaterial({color:selected?0xffffff:color,depthTest:false,transparent:true}));outline.renderOrder=9;put(outline,id);
    const plate=new THREE.Mesh(new THREE.BoxGeometry(W,.006,L),new THREE.MeshBasicMaterial({color,transparent:true,opacity:selected?.25:.06,depthTest:false,depthWrite:false}));plate.position.copy(point);plate.quaternion.copy(rotation);plate.renderOrder=5;put(plate,id);
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
  // Gizmo shapes from CAT's Gizmos library, drawn around the bone they control.
  const gizmoShape=(id,settings)=>{
    const anchor=gizmoAnchor(state,id);if(!anchor)return;
    const n=anchor.axis.clone().normalize(),u=(Math.abs(n.y)<.9?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0)).cross(n).normalize(),v=n.clone().cross(u);
    const turn=(settings.rot||0)*Math.PI/180,cu=u.clone().multiplyScalar(Math.cos(turn)).addScaledVector(v,Math.sin(turn)),cv=v.clone().multiplyScalar(Math.cos(turn)).addScaledVector(u,-Math.sin(turn));
    const r=anchor.size*(settings.radius??1),sx=settings.sx??1,sy=settings.sy??1;
    const at=(x,y)=>anchor.centre.clone().addScaledVector(cu,x*r*sx).addScaledVector(cv,y*r*sy).addScaledVector(n,settings.offset||0);
    const shape=settings.shape||'Circle',selected=state.selected===`gizmo:${id}`,color=selected?0xffffff:(state.gizmoColors?.[id]??0x5cf08f);
    let points;
    if(shape==='Rectangle')points=[[-1,-.7],[1,-.7],[1,.7],[-1,.7],[-1,-.7]].map(p=>at(...p));
    else if(shape==='NGon')points=Array.from({length:7},(_,i)=>at(Math.cos(i*Math.PI/3),Math.sin(i*Math.PI/3)));
    else if(shape==='Text')points=[[-.7,.6],[.7,.6],[0,.6],[0,-.8]].map(p=>at(...p));
    else points=Array.from({length:49},(_,i)=>at(Math.cos(i/48*Math.PI*2),Math.sin(i/48*Math.PI*2)));
    const object=shape==='Text'?new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,depthTest:false,transparent:true})):new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,depthTest:false,transparent:true}));
    object.renderOrder=9;put(object,`gizmo:${id}`);
    if(shape==='Torus'){const tube=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.slice(0,48),true),64,.004,5,true),new THREE.MeshBasicMaterial({color,depthTest:false,depthWrite:false}));tube.renderOrder=9;put(tube,`gizmo:${id}`);}
  };
  const clearRig=()=>{for(const group of [rigRoot,gizmoRoot])for(const child of [...group.children]){group.remove(child);child.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose();}});}rigPick=[];gizmoHandles=[];};
  const legColor=(id,side)=>id.startsWith('thigh')||id.startsWith('shin')?(side==='L'?0x9b5fd8:0xe1a64b):0xe16b69;
  const armColor=side=>side==='L'?0xe0679f:0x6aa6e0;
  function buildRig(){
    clearRig();if(!state.root){refreshAxisFeedback();viewport.render();return;}
    rigRoot.matrixAutoUpdate=false;rigRoot.matrix.copy(parentMatrix(state));rigRoot.matrixWorldNeedsUpdate=true;
    parent();
    if(!state.pelvis){rigRoot.updateMatrixWorld(true);buildGizmo();refreshAxisFeedback();viewport.render();return;}
    hub('pelvis',.32,.12,.18,0xe2d593);
    if(state.spine)hub('ribcage',.34,.11,.18,0xe9b4d3);
    if(state.head)hub('head',.16,.2,.18,0xd9b5d0);
    const jointEnd={spine:'chest',neck:'head',thigh:'knee',shin:'ankle',arm:'shoulder',upperArm:'elbow',forearm:'wrist'};
    for(const item of chainBones(state)){
      const m=/^(thigh|shin|arm|upperArm|forearm)([LR])$/.exec(item.base),side=m?.[2];
      const color=item.base==='spine'?0xe5c9dd:item.base==='neck'?0xe7bfda:m[1]==='thigh'||m[1]==='shin'?legColor(item.base,side):armColor(side);
      const size=state.boneSizes?.[item.base],width=size?.width??(item.base==='spine'?.085:item.base==='neck'?.06:m[1]==='thigh'?.1:m[1]==='shin'?.085:m[1]==='arm'?.045:state.boneWidth);
      const depth=size?.depth??(item.base==='spine'?.09:item.base==='neck'?.06:m[1]==='thigh'?.1:m[1]==='shin'?.085:m[1]==='arm'?.04:state.boneDepth);
      const joint=item.last?(m?`${jointEnd[m[1]]}${side}`:jointEnd[item.base]):null;
      bone(item.id,item.a,item.b,color,width,depth,{joint,frameId:m&&m[1]!=='arm'?item.base:null});
    }
    for(const side of ['L','R']){
      if(!hasLeg(state,side))continue;
      for(const item of footBones(state,side))bone(item.id,item.a,item.b,item.id.startsWith('ankle')?0xe16b69:0x9ad7e9,item.width,item.depth,{joint:item.id.startsWith('ankle')?`ankle${side}`:null});
      // The FootPlatform is the leg's IK target. The cyan line shows the IK link from the hip.
      const frame=partFrame(state,`foot${side}`);
      ikTarget(`foot${side}`,frame.pivot,frame.rotation,side==='L'?0xe0679f:0x6aa6e0);
      const hip=jointPosition(state,`hip${side}`);
      const guide=line([hip.clone().add(new THREE.Vector3(side==='L'?-.05:.05,0,.12)),frame.pivot.clone().add(new THREE.Vector3(side==='L'?-.05:.05,0,.12))],0x55e7f7,.85,12);guide.userData.ikGuide=side;
      const up=state.upNodes?.[`leg${side}`];
      if(up){const point=targetVector(up);cross(`legUp${side}`,point,0x94d5ea);line([jointPosition(state,`knee${side}`),point],0x94d5ea,.6);}
    }
    for(const side of ['L','R']){
      if(state.arms<(side==='L'?1:2))continue;
      const frame=partFrame(state,`palm${side}`);
      if(state.palm!==false&&frame){const palm=new THREE.Mesh(new THREE.BoxGeometry(PALM_LENGTH,.028,.085),mat(0xe4bed8,isSelected(`palm${side}`),isSelected(`palm${side}`)?.8:.55));palm.quaternion.copy(frame.rotation);palm.position.copy(frame.pivot).add(new THREE.Vector3(PALM_LENGTH/2,0,0).applyQuaternion(frame.rotation));put(palm,`palm${side}`);addEdges(palm,isSelected(`palm${side}`)?0xffdf7a:0xc5e6ed);}
      for(const item of handDigits(state,side))bone(item.id,item.a,item.b,item.digit===0?0xf0b3d6:0xe8cbe0,.016,.016);
      const target=state.ikTargets?.[side];
      if(target){
        ikTarget(`ik${side}`,targetVector(target),new THREE.Quaternion().setFromEuler(new THREE.Euler(...(state.ikRotations?.[side]||[0,0,0]))),0xebd8ef);
      }
      const up=state.upNodes?.[`arm${side}`];
      if(up){const point=targetVector(up);cross(`armUp${side}`,point,0xe8c6dd);line([jointPosition(state,`elbow${side}`),point],0xe8c6dd,.6);}
    }
    for(const id of state.gizmos)gizmoShape(id,state.gizmoSettings?.[id]||{});
    if(state.tail)bone('tail',jointPosition(state,'pelvis'),jointPosition(state,'pelvis').add(new THREE.Vector3(0,-.12,-.3)),0xd07ebc,.06,.05);
    if(state.extra)bone('extra',jointPosition(state,'head'),jointPosition(state,'head').add(new THREE.Vector3(0,.08,.12)),0xd07ebc,.04,.04);
    if(state.skin&&state.envelopes&&state.selected==='mesh'){const a=jointPosition(state,'shoulderL'),b=jointPosition(state,'wristL');for(let i=0;i<state.weights.length;i++){const t=(i+.5)/state.weights.length,p=a.clone().lerp(b,t);p.y-=.05;p.z+=.06;const c=new THREE.Color(weightColor(state.paintBlend?state.blendWeights[i]:state.weights[i]));const m=new THREE.Mesh(new THREE.SphereGeometry(i===state.selectedVertex?.03:.022,10,8),new THREE.MeshBasicMaterial({color:c,depthTest:false,depthWrite:false}));m.position.copy(p);m.userData.weightIndex=i;m.renderOrder=10;rigRoot.add(m);rigPick.push(m);}}
    rigRoot.updateMatrixWorld(true);
    buildGizmo();
    refreshAxisFeedback();
    viewport.render();
  }
  function buildGizmo(){
    const selected=state.selected||'',activeTool=state.transformTool==='select'?'move':state.transformTool;
    if(!transformable(state,selected,activeTool,true))return;
    const frame=gizmoFrame(state,selected,viewport.camera.quaternion);if(!frame)return;
    const {pivot,axes}=frame;
    // Like 3ds Max, the transform gizmo keeps a constant size on screen.
    const k=Math.max(.12,Math.min(2,viewport.view.dist/5));gizmoDist=viewport.view.dist;
    for(const [axis,dir] of Object.entries(axes)){
      let handle;
      const hitMaterial=()=>new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthTest:false,depthWrite:false});
      if(activeTool==='rotate'){
        handle=new THREE.Mesh(new THREE.TorusGeometry(.28,.012,8,48),new THREE.MeshBasicMaterial({color:axisColors[axis],transparent:true,depthTest:false,depthWrite:false}));
        handle.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),dir);handle.position.copy(pivot);
        handle.add(new THREE.Mesh(new THREE.TorusGeometry(.28,.065,6,48),hitMaterial()));
      }else{
        const group=new THREE.Group();
        const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.011,.011,.30,8),new THREE.MeshBasicMaterial({color:axisColors[axis],transparent:true,depthTest:false,depthWrite:false}));
        shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);shaft.position.copy(dir).multiplyScalar(.15);group.add(shaft);
        const tip=new THREE.Mesh(activeTool==='scale'?new THREE.BoxGeometry(.065,.065,.065):new THREE.ConeGeometry(.045,.11,8),new THREE.MeshBasicMaterial({color:axisColors[axis],transparent:true,depthTest:false,depthWrite:false}));
        if(activeTool==='move')tip.quaternion.copy(shaft.quaternion);tip.position.copy(dir).multiplyScalar(.33);group.add(tip);
        const target=new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,.43,8),hitMaterial());
        target.quaternion.copy(shaft.quaternion);target.position.copy(dir).multiplyScalar(.18);group.add(target);
        handle=group;handle.position.copy(pivot);
      }
      handle.scale.setScalar(k);handle.userData.partId=state.selected;handle.userData.transformAxis=axis;handle.userData.transformDirection=dir.clone();handle.renderOrder=20;gizmoRoot.add(handle);rigPick.unshift(handle);for(const child of handle.children){child.userData.partId=state.selected;child.userData.transformAxis=axis;child.userData.transformDirection=dir.clone();child.renderOrder=21;rigPick.unshift(child);}
      const materials=[];handle.traverse(object=>{if(object.isMesh&&object.material?.opacity!==0)materials.push(object.material);});
      if(activeTool!=='rotate'){
        const label=new THREE.Sprite(new THREE.SpriteMaterial({map:axisTextures[axis],transparent:true,depthTest:false,depthWrite:false}));
        label.position.copy(pivot).addScaledVector(dir,.44*k);label.scale.set(.11*k,.11*k,1);label.renderOrder=22;gizmoRoot.add(label);
      }
      gizmoHandles.push({name:axis,materials});
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
  const activeTool=()=>state.transformTool==='select'?'move':state.transformTool;
  function onDown(event){if(event.button!==0)return;event.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);const hit=pick(event),o=hit?.object;
    host.querySelector('.cat-context-menu')?.remove();
    if(state.armed){hoverAxis=null;refreshAxisFeedback(event,true);handlers.onBeginUndo?.();drag={kind:'create',x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY};canvas.style.cursor='crosshair';return;}
    if(o?.userData.weightIndex!=null){handlers.onWeight(o.userData.weightIndex);if(state.paint)drag={kind:'paint'};return;}
    if(o?.userData.transformAxis){
      handlers.onBeginUndo?.();
      const worldAxis=o.userData.transformDirection.clone(),position=gizmoFrame(state,o.userData.partId,viewport.camera.quaternion).pivot;
      const direction=o.userData.partId==='catparent'?worldAxis.clone():worldAxisToRig(state,worldAxis);
      const start=position.clone().project(viewport.camera),end=position.clone().add(worldAxis).project(viewport.camera),rect=canvas.getBoundingClientRect();
      const projected=[(end.x-start.x)*rect.width/2,-(end.y-start.y)*rect.height/2];
      const tool=activeTool();
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
    // Endpoint handles move the shared joint itself, on a plane facing the camera: in Front you adjust
    // height and width, in Left you adjust height and depth (as when placing pivots in 3ds Max).
    const nearJoint=o?.userData.joint&&hit.point&&(()=>{const world=jointPosition(state,o.userData.joint).applyMatrix4(parentMatrix(state));const box=new THREE.Box3().setFromObject(o),size=box.getSize(new THREE.Vector3()).length();return hit.point.distanceTo(world)<Math.max(.05,size*.3);})();
    if(nearJoint&&state.mode==='Setup'&&activeTool()==='move'){
      handlers.onSelect(o.userData.partId||o.userData.joint);handlers.onBeginUndo?.();
      const world=jointPosition(state,o.userData.joint).applyMatrix4(parentMatrix(state)),normal=new THREE.Vector3();viewport.camera.getWorldDirection(normal);
      drag={kind:'joint',joint:o.userData.joint,plane:new THREE.Plane().setFromNormalAndCoplanarPoint(normal,world),x:event.clientX,y:event.clientY};canvas.style.cursor='crosshair';return;
    }
    if(o?.userData.partId){const id=o.userData.partId;handlers.onSelect(id);if(transformable(state,id,activeTool())){handlers.onBeginUndo?.();const normal=new THREE.Vector3();viewport.camera.getWorldDirection(normal);const start=hit.point.clone();drag={kind:'transform',id,axis:'free',freePlane:new THREE.Plane().setFromNormalAndCoplanarPoint(normal,start),freePoint:start,x:event.clientX,y:event.clientY};}canvas.style.cursor='crosshair';return;}
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
          drag.rotation.total+=delta;
          drag.rotation.previousAngle=angle;
          dragScalar=delta/.012;
        }else{drag.rotation.previousAngle=null;dragScalar=0;}
      }else if(drag.freePlane&&activeTool()==='move'){
        raycaster.setFromCamera(canvasPos(event,canvas),viewport.camera);const point=new THREE.Vector3();
        if(raycaster.ray.intersectPlane(drag.freePlane,point)){const delta=point.clone().sub(drag.freePoint);drag.freePoint=point;worldDelta=(drag.id==='catparent'?delta:worldMoveToRig(state,delta)).toArray();}
        else worldDelta=[0,0,0];
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
      handlers.onTransform?.(drag.id,drag.tool||activeTool(),dragScalar,dy,drag.axis,worldDelta,drag.direction?.toArray()||null);refreshAxisFeedback(event);return;
    }
    if(drag.kind==='paint'){const hit=pick(event);if(hit?.object?.userData.weightIndex!=null)handlers.onWeight(hit.object.userData.weightIndex);return;}
    if(drag.kind==='joint'){
      raycaster.setFromCamera(canvasPos(event,canvas),viewport.camera);const p=new THREE.Vector3();
      if(raycaster.ray.intersectPlane(drag.plane,p)){const local=p.applyMatrix4(parentMatrix(state).invert());handlers.onJoint(drag.joint,[Math.max(40,Math.min(560,300+local.x*225)),Math.max(20,Math.min(475,480-local.y*225))],Math.max(-.5,Math.min(.5,local.z)));}
    }
  }
  canvas.addEventListener('pointerdown',onDown);canvas.addEventListener('pointermove',onMove);canvas.addEventListener('pointerup',event=>{if(drag?.kind==='create'){const distance=Math.hypot(drag.x-drag.startX,drag.y-drag.startY),height=canvas.getBoundingClientRect().height;for(const child of [...previewRoot.children]){previewRoot.remove(child);child.geometry?.dispose();child.material?.dispose();}handlers.onPlace(Math.max(.3,Math.min(2.6,distance/Math.max(1,height)*3.2)));}if(drag?.kind==='transform'||drag?.kind==='joint')handlers.onTransformEnd?.(drag.id||drag.joint);drag=null;const hit=pick(event)?.object;hoverAxis=hit?.userData.transformAxis||null;hoverPart=hit?.userData.partId||null;refreshAxisFeedback(event,true);canvas.style.cursor=state.armed?'crosshair':'default';});canvas.addEventListener('pointercancel',()=>{previewRoot.clear();drag=null;hoverAxis=null;hoverPart=null;refreshAxisFeedback(null,true);canvas.style.cursor=state.armed?'crosshair':'default';});canvas.addEventListener('pointerleave',()=>{if(drag)return;hoverAxis=null;hoverPart=null;refreshAxisFeedback(null,true);});
  // Right click on a CAT bone in Setup Mode › Add Gizmo, as in 3ds Max.
  canvas.addEventListener('contextmenu',event=>{event.preventDefault();host.querySelector('.cat-context-menu')?.remove();const id=pick(event)?.object?.userData.partId;if(!id||id==='mesh'||id.startsWith('gizmo:'))return;const bounds=host.getBoundingClientRect(),menu=document.createElement('div');menu.className='cat-context-menu';menu.style.left=`${Math.min(event.clientX-bounds.left,bounds.width-145)}px`;menu.style.top=`${Math.min(event.clientY-bounds.top,bounds.height-50)}px`;menu.innerHTML='<button type="button">Add Gizmo</button>';menu.querySelector('button').addEventListener('click',()=>{handlers.onGizmo?.(id);menu.remove();});host.appendChild(menu);});
  host.insertAdjacentHTML('beforeend','<div class="cat-3d-tools"><button type="button" data-view-tool="xray" class="on">See-Through</button><button type="button" data-view-tool="solid">Solid</button><button type="button" data-view-tool="hidden">Rig only</button></div>');
  host.addEventListener('click',event=>{const button=event.target.closest('[data-view-tool]');if(!button)return;meshMode=button.dataset.viewTool;host.querySelectorAll('[data-view-tool]').forEach(b=>b.classList.toggle('on',b===button));setMeshOpacity();});
  window.addEventListener('keydown',event=>{if(event.altKey&&event.key.toLowerCase()==='x'&&!/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName||'')){event.preventDefault();meshMode=meshMode==='xray'?'solid':'xray';host.querySelectorAll('[data-view-tool]').forEach(b=>b.classList.toggle('on',b.dataset.viewTool===meshMode));setMeshOpacity();}});
  const fitDistance=(ortho=false)=>{const rect=host.getBoundingClientRect(),aspect=Math.max(.25,rect.width/Math.max(1,rect.height));return Math.max(ortho?3.1:4.5,2.2/(2*Math.tan(40*Math.PI/360)*aspect));};
  viewport.setView('perspective',{x:0,y:0,z:.91},fitDistance());
  return {
    update:buildRig,
    setView(name){viewport.setView(name==='Front'?'front':name==='Left'?'left':name==='Top'?'top':'perspective',name==='Top'?{x:0,y:0,z:1.2}:{x:0,y:0,z:.91},fitDistance(name!=='Perspective'));viewport.render();},
    setWireframe(on){wire=!!on;setMeshOpacity();},
    loadObj(text){
      const v=[],tri=[];for(const line of text.split(/\r?\n/)){if(line.startsWith('v ')){const p=line.trim().split(/\s+/).slice(1,4).map(Number);if(p.length===3&&p.every(Number.isFinite))v.push(p);}else if(line.startsWith('f ')){const f=line.trim().split(/\s+/).slice(1).map(s=>parseInt(s,10)-1);for(let i=1;i<f.length-1;i++)if([f[0],f[i],f[i+1]].every(n=>Number.isInteger(n)&&v[n]))tri.push(...v[f[0]],...v[f[i]],...v[f[i+1]]);}}
      if(tri.length<9)throw new Error('OBJ sense geometria vàlida.');const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(tri,3));g.computeVertexNormals();const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:0x92a2a9,roughness:.85,side:THREE.DoubleSide}));installModel(m);viewport.render();
    },
    error:()=>loadError,
    render:()=>viewport.render(),
    isOrtho:()=>viewport.isOrtho(),
    viewport,
  };
}
