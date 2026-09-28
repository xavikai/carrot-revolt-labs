// Material Lab: the node graph. Links are stored as { 'toNode:input': 'fromNode:output' }.
export const TEXTURES = ['color', 'rough', 'normalTex', 'mask', 'height'];
export const DEFAULT_LINKS = Object.freeze({
 'mapping:input':'coordinates:uv',
 'color:vector':'mapping:vector', 'rough:vector':'mapping:vector', 'normalTex:vector':'mapping:vector',
 'bsdf:base':'color:color', 'bsdf:roughness':'rough:color', 'normal:color':'normalTex:color',
 'bsdf:normal':'normal:normal', 'output:surface':'bsdf:bsdf'
});
export const COORDINATES = ['generated','normal','uv','object','camera','window','reflection'];
const coordinateOutputs=COORDINATES.map(name=>`coordinates:${name}`);
const colorOutputs=[...TEXTURES.map(t=>`${t}:color`),'invert:color'];
const imageOutputs=TEXTURES.map(t=>`${t}:color`);
export const OUTPUTS = Object.freeze({
 ...Object.fromEntries(coordinateOutputs.map(key=>[key,'vector'])),
 'mapping:vector':'vector', ...Object.fromEntries(colorOutputs.map(k=>[k,'color'])),
 'normal:normal':'vector', 'bump:normal':'vector', 'disp:displacement':'vector', 'bsdf:bsdf':'shader'
});
export const INPUTS = Object.freeze({
 'mapping:input':coordinateOutputs,
 'mapping:location':coordinateOutputs, 'mapping:rotation':coordinateOutputs, 'mapping:scale':coordinateOutputs,
 ...Object.fromEntries(TEXTURES.map(t=>[`${t}:vector`,['mapping:vector',...coordinateOutputs]])),
 'normal:color':colorOutputs,
 'invert:color':imageOutputs,
 'bump:height':colorOutputs,
 'disp:height':colorOutputs,
 'bsdf:base':colorOutputs,
 'bsdf:roughness':colorOutputs,
 'bsdf:metallic':colorOutputs,
 'bsdf:alpha':colorOutputs,
 'bsdf:normal':['normal:normal','bump:normal'], 'output:surface':['bsdf:bsdf'], 'output:displacement':['disp:displacement']
});
export function coordinateRoute(links,node){
 const output=links[`${node}:vector`];
 const mapped=output==='mapping:vector';
 const source=mapped?links['mapping:input']:output;
 return {mapped,source:source?COORDINATES.indexOf(source.split(':')[1]):mapped?-1:2};
}
export function canConnect(from,to){return Boolean(INPUTS[to]?.includes(from));}
export function connect(links,from,to){if(!canConnect(from,to))return false;links[to]=from;return true;}
// The image node that feeds an input, directly or through Invert: { node, invert } or null.
export function sourceFor(links,input){
 const from=links[input];
 if(!from?.endsWith(':color'))return null;
 const node=from.split(':')[0];
 if(node==='invert'){const src=links['invert:color'];return src?{node:src.split(':')[0],invert:true}:null;}
 return {node,invert:false};
}
export function textureNodeFor(links,input){return sourceFor(links,input)?.node??null;}
export function resolveGraph(links){
 const via=input=>sourceFor(links,input);
 const normalLink=links['bsdf:normal'];
 return {
  visible: links['output:surface']==='bsdf:bsdf',
  base: textureNodeFor(links,'bsdf:base'),
  rough: textureNodeFor(links,'bsdf:roughness'),
  roughInvert: via('bsdf:roughness')?.invert??false,
  metallic: textureNodeFor(links,'bsdf:metallic'),
  alpha: textureNodeFor(links,'bsdf:alpha'),
  normal: normalLink==='normal:normal'?textureNodeFor(links,'normal:color'):null,
  bump: normalLink==='bump:normal'?textureNodeFor(links,'bump:height'):null,
  displacement: links['output:displacement']==='disp:displacement'?textureNodeFor(links,'disp:height'):null,
 };
}
