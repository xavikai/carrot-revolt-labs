import * as THREE from '../../vendor/three.module.js';
import {COORDINATES,coordinateRoute} from './graph.js?v=5';

// Same transform order as Blender: Point = Scale, Rotate (XYZ), Translate.
export function mappingMatrix(type,location,rotation,scale){
 const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation,'ZYX'));
 const r=new THREE.Matrix4().makeRotationFromQuaternion(q);
 const inverseScale=new THREE.Matrix4().makeScale(...scale.map(v=>v===0?0:1/v));
 if(type==='Texture')return inverseScale.multiply(r.transpose()).multiply(new THREE.Matrix4().makeTranslation(...location.map(v=>-v)));
 if(type==='Normal')return r.multiply(inverseScale);
 return new THREE.Matrix4().compose(new THREE.Vector3(...(type==='Vector'?[0,0,0]:location)),q,new THREE.Vector3(...scale));
}

export function installCoordinates(material){
 const uniforms={labModes:{value:new THREE.Vector4(2,2,2,2)},labMapped:{value:new THREE.Vector4()},labModes2:{value:new THREE.Vector4(2,2,2,2)},labMapped2:{value:new THREE.Vector4()},labFields:{value:new THREE.Vector4(-1,-1,-1,-1)},labVector:{value:new THREE.Vector3()},labLocation:{value:new THREE.Vector3()},labRotation:{value:new THREE.Vector3()},labScale:{value:new THREE.Vector3(1,1,1)},labType:{value:0},labBoundsMin:{value:new THREE.Vector3()},labBoundsSize:{value:new THREE.Vector3(1,1,1)},labResolution:{value:new THREE.Vector2(1,1)}};
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  const varying='varying vec3 labPosition, labNormal, labWorldPosition, labWorldNormal, labViewPosition; varying vec2 labMeshUV;';
  shader.vertexShader=varying+'\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   labPosition=position; labNormal=normal; labMeshUV=uv;
   labWorldPosition=(modelMatrix*vec4(position,1.0)).xyz;
   labWorldNormal=mat3(modelMatrix)*normal;
   labViewPosition=(modelViewMatrix*vec4(position,1.0)).xyz;`);
  shader.fragmentShader=varying+'\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <uv_pars_fragment>',`#include <uv_pars_fragment>
   uniform vec4 labModes,labMapped,labModes2,labMapped2,labFields;
   uniform vec3 labVector,labLocation,labRotation,labScale,labBoundsMin,labBoundsSize;
   uniform vec2 labResolution;
   uniform int labType;
   uniform mat4 labMappingMatrix;
   vec3 labInverseScale(vec3 s){return vec3(s.x==0.0?0.0:1.0/s.x,s.y==0.0?0.0:1.0/s.y,s.z==0.0?0.0:1.0/s.z);}
   vec3 labSource(float mode,vec3 fallback){
    if(mode<0.0)return fallback;
    if(mode<0.5)return (labPosition-labBoundsMin)/labBoundsSize;
    if(mode<1.5)return normalize(labNormal);
    if(mode<2.5)return vec3(labMeshUV,0.0);
    if(mode<3.5)return labPosition;
    if(mode<4.5)return labViewPosition;
    if(mode<5.5)return vec3(gl_FragCoord.xy/labResolution,0.0);
    return reflect(normalize(labWorldPosition-cameraPosition),normalize(labWorldNormal));
   }
   mat3 labRotationMatrix(vec3 r){
    vec3 c=cos(r),s=sin(r);
    mat3 rx=mat3(1,0,0, 0,c.x,s.x, 0,-s.x,c.x);
    mat3 ry=mat3(c.y,0,-s.y, 0,1,0, s.y,0,c.y);
    mat3 rz=mat3(c.z,s.z,0, -s.z,c.z,0, 0,0,1);
    return rz*ry*rx;
   }
   vec2 labUV(float mode,float mapped){
    vec3 v=labSource(mode,labVector);
    if(mapped<0.5)return v.xy;
    if(labFields.y<0.0&&labFields.z<0.0&&labFields.w<0.0){v=(labMappingMatrix*vec4(v,1.0)).xyz;if(labType==3)v=length(v)>0.0?normalize(v):vec3(0);return v.xy;}
    vec3 l=labSource(labFields.y,labLocation),r=labSource(labFields.z,labRotation),s=labSource(labFields.w,labScale);
    mat3 rotation=labRotationMatrix(r);
    if(labType==1)v=(transpose(rotation)*(v-l))*labInverseScale(s);
    else if(labType==2)v=rotation*(v*s);
    else if(labType==3){v=rotation*(v*labInverseScale(s));v=length(v)>0.0?normalize(v):vec3(0);}
    else v=rotation*(v*s)+l;
    return v.xy;
   }
   #define vMapUv labUV(labModes.x,labMapped.x)
   #define vRoughnessMapUv labUV(labModes.y,labMapped.y)
   #define vMetalnessMapUv labUV(labModes.z,labMapped.z)
   #define vNormalMapUv labUV(labModes.w,labMapped.w)
   #define vAlphaMapUv labUV(labModes2.x,labMapped2.x)
   #define vBumpMapUv labUV(labModes2.y,labMapped2.y)
  `);
 };
 material.customProgramCacheKey=()=> 'carrot-revolt-coordinates-v2';
 uniforms.labMappingMatrix={value:new THREE.Matrix4()};
 return {
  update(links,values,graph,geometry){
   const routes=[graph.base,graph.rough,graph.metallic,graph.normal].map(id=>coordinateRoute(links,id));
   uniforms.labModes.value.fromArray(routes.map(r=>r.source));uniforms.labMapped.value.fromArray(routes.map(r=>Number(r.mapped)));
   const routes2=[graph.alpha,graph.bump,null,null].map(id=>coordinateRoute(links,id));
   uniforms.labModes2.value.fromArray(routes2.map(r=>r.source));uniforms.labMapped2.value.fromArray(routes2.map(r=>Number(r.mapped)));
   uniforms.labFields.value.fromArray(['input','location','rotation','scale'].map(key=>COORDINATES.indexOf(links[`mapping:${key}`]?.split(':')[1])));
   for(const key of ['vector','location','rotation','scale'])uniforms['lab'+key[0].toUpperCase()+key.slice(1)].value.fromArray(['X','Y','Z'].map(axis=>values[key+axis]*(key==='rotation'?Math.PI/180:1)));
   uniforms.labType.value=['Point','Texture','Vector','Normal'].indexOf(values.mappingType);
   uniforms.labMappingMatrix.value.copy(mappingMatrix(values.mappingType,uniforms.labLocation.value.toArray(),uniforms.labRotation.value.toArray(),uniforms.labScale.value.toArray()));
   geometry.computeBoundingBox();uniforms.labBoundsMin.value.copy(geometry.boundingBox.min);geometry.boundingBox.getSize(uniforms.labBoundsSize.value);
   uniforms.labBoundsSize.value.max(new THREE.Vector3(1e-7,1e-7,1e-7));
  },
  resize(renderer){renderer.getDrawingBufferSize(uniforms.labResolution.value);}
 };
}
