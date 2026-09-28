import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_LINKS,COORDINATES,canConnect,connect,resolveGraph,coordinateRoute} from '../labs/materials/graph.js';
import {mappingMatrix} from '../labs/materials/mapping.js';
import {Vector3} from '../vendor/three.module.js';
test('default graph routes color, roughness and normal through the shader',()=>{
 assert.deepEqual(resolveGraph(DEFAULT_LINKS),{visible:true,base:'color',rough:'rough',roughInvert:false,metallic:null,alpha:null,normal:'normalTex',bump:null,displacement:null});
});
test('a normal texture cannot skip the Normal Map conversion',()=>{
 assert.equal(canConnect('normalTex:color','bsdf:normal'),false);
 assert.equal(canConnect('normalTex:color','normal:color'),true);
 assert.equal(canConnect('normal:normal','bsdf:normal'),true);
});
test('a new texture connection replaces one input without losing the others',()=>{
 const links={...DEFAULT_LINKS};assert.equal(connect(links,'color:color','bsdf:roughness'),true);
 assert.equal(resolveGraph(links).rough,'color');assert.equal(resolveGraph(links).normal,'normalTex');
 assert.equal(Object.keys(links).length,Object.keys(DEFAULT_LINKS).length);
});
test('disconnected normal and surface do not contribute to the material',()=>{
 const links={...DEFAULT_LINKS};delete links['normal:color'];delete links['output:surface'];
 assert.equal(resolveGraph(links).normal,null);assert.equal(resolveGraph(links).visible,false);
});
test('invalid socket directions and graph cycles are rejected',()=>{
 const links={...DEFAULT_LINKS};assert.equal(connect(links,'bsdf:bsdf','color:vector'),false);
 assert.equal(canConnect('output:surface','bsdf:bsdf'),false);assert.deepEqual(links,DEFAULT_LINKS);
});
test('all coordinate outputs can feed Mapping or an image directly',()=>{
 for(const name of COORDINATES){
  const source=`coordinates:${name}`,links={...DEFAULT_LINKS};
  assert.equal(connect(links,source,'mapping:input'),true);
  assert.deepEqual(coordinateRoute(links,'color'),{mapped:true,source:COORDINATES.indexOf(name)});
  assert.equal(connect(links,source,'color:vector'),true);
  assert.deepEqual(coordinateRoute(links,'color'),{mapped:false,source:COORDINATES.indexOf(name)});
 }
});
test('unconnected image uses UVs, while unconnected Mapping uses its manual vector',()=>{
 const links={...DEFAULT_LINKS};delete links['mapping:input'];
 assert.deepEqual(coordinateRoute(links,'color'),{mapped:true,source:-1});
 delete links['color:vector'];assert.deepEqual(coordinateRoute(links,'color'),{mapped:false,source:2});
 assert.equal(canConnect('mapping:vector','mapping:input'),false);
 assert.equal(canConnect('mapping:vector','mapping:scale'),false);
 assert.equal(canConnect('coordinates:generated','mapping:scale'),true);
});
const close=(actual,expected)=>actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-10,`${actual} != ${expected}`));
test('Point applies scale then rotation then location, and Texture reverses it',()=>{
 const l=[.4,-.3,.2],r=[.2,.5,.8],s=[2,3,4],v=new Vector3(.1,.2,.3);
 const point=mappingMatrix('Point',l,r,s);
 close(v.clone().applyMatrix4(point).applyMatrix4(mappingMatrix('Texture',l,r,s)).toArray(),v.toArray());
 close(new Vector3(1,0,0).applyMatrix4(mappingMatrix('Point',[3,4,5],[0,0,Math.PI/2],[2,3,4])).toArray(),[3,6,5]);
});
test('X and Y rotations transform Z, Vector ignores location, Normal uses inverse scale',()=>{
 close(new Vector3(0,1,0).applyMatrix4(mappingMatrix('Vector',[9,8,7],[Math.PI/2,0,0],[1,1,1])).toArray(),[0,0,1]);
 close(new Vector3(0,0,1).applyMatrix4(mappingMatrix('Vector',[9,8,7],[0,Math.PI/2,0],[1,1,1])).toArray(),[1,0,0]);
 close(new Vector3(1,1,0).applyMatrix4(mappingMatrix('Normal',[9,8,7],[0,0,0],[2,1,1])).normalize().toArray(),new Vector3(.5,1,0).normalize().toArray());
});
test('zero and negative scales remain finite and mirror or collapse the coordinate',()=>{
 close(new Vector3(1,2,3).applyMatrix4(mappingMatrix('Point',[0,0,0],[0,0,0],[-2,0,1])).toArray(),[-2,0,3]);
 close(new Vector3(1,2,3).applyMatrix4(mappingMatrix('Texture',[0,0,0],[0,0,0],[0,2,1])).toArray(),[0,1,3]);
});
test('Invert passes the image through and marks it inverted',()=>{
 const links={...DEFAULT_LINKS};assert.equal(connect(links,'rough:color','invert:color'),true);
 assert.equal(connect(links,'invert:color','bsdf:roughness'),true);
 assert.equal(resolveGraph(links).rough,'rough');assert.equal(resolveGraph(links).roughInvert,true);
 assert.equal(canConnect('invert:color','invert:color'),false);
});
test('Bump replaces the normal map and displacement goes to the output',()=>{
 const links={...DEFAULT_LINKS};connect(links,'height:color','bump:height');connect(links,'bump:normal','bsdf:normal');
 assert.equal(resolveGraph(links).normal,null);assert.equal(resolveGraph(links).bump,'height');
 assert.equal(canConnect('height:color','output:displacement'),false);
 connect(links,'height:color','disp:height');connect(links,'disp:displacement','output:displacement');
 assert.equal(resolveGraph(links).displacement,'height');
});
