import {buildLayout, EDGES, FACES, PRESETS} from './unfold.js?v=4';

export const MODELS = Object.freeze({
 cube:[{id:'cube',name:'Cube',size:[2,2,2],position:[0,0,0],color:'#e9a667'}],
 chair:[
  {id:'seat',name:'Seat',size:[2.4,.24,2],position:[0,1.55,0],color:'#e9a667'},
  {id:'back',name:'Backrest',size:[2.4,1.75,.24],position:[0,2.5,-.91],color:'#9a94e4'},
  {id:'leg-fl',name:'Front left leg',size:[.24,1.48,.24],position:[-1.03,.74,.82],color:'#70c4aa'},
  {id:'leg-fr',name:'Front right leg',size:[.24,1.48,.24],position:[1.03,.74,.82],color:'#91b9ed'},
  {id:'leg-bl',name:'Back left leg',size:[.24,1.48,.24],position:[-1.03,.74,-.82],color:'#e6ca72'},
  {id:'leg-br',name:'Back right leg',size:[.24,1.48,.24],position:[1.03,.74,-.82],color:'#de88a7'}
 ]
});

export const defaultCuts=model=>new Map(MODELS[model].map(part=>[part.id,new Set(PRESETS.classic)]));

const extent=face=>[
 (Math.abs(face.U[0])*face.size[0]+Math.abs(face.V[0])*face.size[1])/2,
 (Math.abs(face.U[1])*face.size[0]+Math.abs(face.V[1])*face.size[1])/2
];

// Each disconnected box part has its own seam graph. The paper-net solver
// keeps the dimensions of every rectangular face, so UV area is measurable.
// `parts` is the current mesh data (sizes change when Apply Scale is used).
export function buildCharts(model,cutsByPart,parts=MODELS[model]){
 const charts=[];let invalid=null;
 for(const part of parts){
  const layout=buildLayout(cutsByPart.get(part.id),part.size);
  if(!layout.valid){invalid={part,layout};continue;}
  for(const component of layout.components){
   const faces=component.ids.map(id=>({...layout.faces[id],key:`${part.id}:${id}`}));
   const minX=Math.min(...faces.map(face=>face.center[0]-extent(face)[0]));
   const maxX=Math.max(...faces.map(face=>face.center[0]+extent(face)[0]));
   const minY=Math.min(...faces.map(face=>face.center[1]-extent(face)[1]));
   const maxY=Math.max(...faces.map(face=>face.center[1]+extent(face)[1]));
   charts.push({id:`${part.id}:${component.root}`,part,faces,minX,minY,width:maxX-minX,height:maxY-minY,densityScale:model==='chair'?1/Math.sqrt(2*(part.size[0]*part.size[1]+part.size[0]*part.size[2]+part.size[1]*part.size[2])):1,stretchU:1,stretchV:1,x:0,y:0,unitScale:1});
  }
 }
 return {charts,invalid};
}

// A simple shelf pack. The same uniform factor applies to every island;
// Pack never silently changes relative texel density.
export function packCharts(charts,{margin=.12}={}){
 if(!charts.length)return charts;
 const items=charts.map(chart=>({chart,width:chart.width*chart.densityScale*chart.stretchU,height:chart.height*chart.densityScale*chart.stretchV}));
 const rowLimit=Math.max(...items.map(item=>item.width),Math.sqrt(items.reduce((sum,item)=>sum+item.width*item.height,0))*1.3);
 let x=0,y=0,rowHeight=0,maxX=0;
 for(const item of items){
  if(x>0&&x+item.width>rowLimit){x=0;y+=rowHeight+margin;rowHeight=0;}
  item.x=x;item.y=y;x+=item.width+margin;rowHeight=Math.max(rowHeight,item.height);maxX=Math.max(maxX,item.x+item.width);
 }
 const maxY=y+rowHeight,factor=.9/Math.max(maxX,maxY),offsetX=(1-maxX*factor)/2,offsetY=(1-maxY*factor)/2;
 for(const item of items){item.chart.x=offsetX+item.x*factor;item.chart.y=offsetY+item.y*factor;item.chart.unitScale=factor;}
 return charts;
}

export function averageIslandScale(charts){for(const chart of charts)chart.densityScale=1;return packCharts(charts);}

export function faceUVPoint(chart,face,u,v){
  const px=face.center[0]+face.U[0]*u+face.V[0]*v-chart.minX;
  const py=face.center[1]+face.U[1]*u+face.V[1]*v-chart.minY;
  return [chart.x+px*chart.densityScale*chart.stretchU*chart.unitScale,chart.y+py*chart.densityScale*chart.stretchV*chart.unitScale];
}
export function faceUV(chart,face){
 const [w,h]=face.size.map(value=>value/2);
 return [faceUVPoint(chart,face,-w,-h),faceUVPoint(chart,face,w,-h),faceUVPoint(chart,face,w,h),faceUVPoint(chart,face,-w,h)];
}

export function stretchMetrics(charts){
 const all=charts.flatMap(chart=>chart.faces.map(face=>({chart,face,ratio:chart.densityScale**2*chart.stretchU*chart.stretchV,area:face.size[0]*face.size[1]})));
 const totalArea=all.reduce((sum,item)=>sum+item.area,0),ranked=[...all].sort((a,b)=>a.ratio-b.ratio);
 let running=0,reference=ranked.at(-1)?.ratio||1;
 for(const item of ranked){running+=item.area;if(running>=totalArea/2){reference=item.ratio;break;}}
 return new Map(all.map(({chart,face,ratio})=>{
  const angle=Math.abs(Math.atan(face.size[1]/face.size[0]*chart.stretchV/chart.stretchU)-Math.atan(face.size[1]/face.size[0]))*180/Math.PI;
  const area=Math.abs(Math.log2(ratio/reference));
  return [face.key,{angle,area}];
 }));
}

export const edgeName=edge=>`${FACES[edge.a].name} / ${FACES[edge.b].name}`;
export const hasEdge=key=>EDGES.some(edge=>edge.key===key);

// Where the edge shared with `otherId` lies on a face, in that face's local
// (u, v) units. Used to draw the same 3D edge in the UV Editor: a joined edge
// appears once, a seam appears twice (once on each side of the cut).
const dot3=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export function edgeSegment(faceId,otherId,size){
 const face=FACES[faceId],normal=FACES[otherId].n,su=dot3(normal,face.u),sv=dot3(normal,face.v),w=size[0]/2,h=size[1]/2;
 if(su)return [[su*w,-h],[su*w,h]];
 if(sv)return [[-w,sv*h],[w,sv*h]];
 return null;
}
export const edgesOfFace=faceId=>EDGES.filter(edge=>edge.a===faceId||edge.b===faceId);
// Face Select + Mark Seam: Blender cuts around the selected region.
export const boundaryEdges=faces=>EDGES.filter(edge=>faces.has(edge.a)!==faces.has(edge.b)).map(edge=>edge.key);
// Face Select + Clear Seam: every edge that belongs to a selected face.
export const edgesOfFaces=faces=>EDGES.filter(edge=>faces.has(edge.a)||faces.has(edge.b)).map(edge=>edge.key);
