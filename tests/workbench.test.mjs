import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MODELS,defaultCuts,buildCharts,packCharts,averageIslandScale,faceUV,stretchMetrics} from '../labs/uv-unwrapping/workbench.js';

test('chair nets keep all six parts and thirty-six rectangular faces',()=>{
 const result=buildCharts('chair',defaultCuts('chair'));
 assert.equal(result.invalid,null);assert.equal(result.charts.length,6);
 assert.equal(result.charts.reduce((sum,chart)=>sum+chart.faces.length,0),36);
 const seatTop=result.charts.flatMap(chart=>chart.faces).find(face=>face.key==='seat:T');
 assert.deepEqual(seatTop.size,[2.4,2]);
});

test('marking a chair seam splits an island while a closed part is rejected',()=>{
 const cuts=defaultCuts('chair');cuts.get('seat').add('F-R');
 const split=buildCharts('chair',cuts);assert.equal(split.invalid,null);assert.equal(split.charts.length,7);
 cuts.set('seat',new Set());const closed=buildCharts('chair',cuts);
 assert.equal(closed.invalid.part.id,'seat');assert.equal(closed.invalid.layout.cycle,true);
});

test('packing keeps every face inside the image square and islands apart',()=>{
 const {charts}=buildCharts('chair',defaultCuts('chair'));packCharts(charts,{margin:.09});
 for(const chart of charts)for(const face of chart.faces)for(const point of faceUV(chart,face)){
  assert.ok(point[0]>=0&&point[0]<=1,`U ${point[0]}`);assert.ok(point[1]>=0&&point[1]<=1,`V ${point[1]}`);
 }
 for(let i=0;i<charts.length;i++)for(let j=i+1;j<charts.length;j++){
  const a=charts[i],b=charts[j],aw=a.width*a.densityScale*a.stretchU*a.unitScale,ah=a.height*a.densityScale*a.stretchV*a.unitScale,bw=b.width*b.densityScale*b.stretchU*b.unitScale,bh=b.height*b.densityScale*b.stretchV*b.unitScale;
  assert.ok(a.x+aw<=b.x+1e-8||b.x+bw<=a.x+1e-8||a.y+ah<=b.y+1e-8||b.y+bh<=a.y+1e-8);
 }
});

test('average scale clears area differences and horizontal stretching adds angle distortion',()=>{
 const {charts}=buildCharts('chair',defaultCuts('chair'));
 assert.ok([...stretchMetrics(charts).values()].some(value=>value.area>.5));
 averageIslandScale(charts);assert.ok([...stretchMetrics(charts).values()].every(value=>value.area<1e-9&&value.angle<1e-9));
 charts[0].stretchU=1.7;const metrics=stretchMetrics(charts);
 assert.ok(charts[0].faces.some(face=>metrics.get(face.key).angle>5));
 assert.ok(charts[0].faces.some(face=>metrics.get(face.key).area>.2));
});

import {edgeSegment,boundaryEdges,edgesOfFaces} from '../labs/uv-unwrapping/workbench.js';
test('edge segments sit on the correct side of each face',()=>{
 assert.deepEqual(edgeSegment('F','R',[2,2]),[[1,-1],[1,1]]);
 assert.deepEqual(edgeSegment('F','T',[2,2]),[[-1,1],[1,1]]);
 assert.deepEqual(edgeSegment('T','F',[2.4,2]),[[-1.2,-1],[1.2,-1]]);
});
test('face-select seam helpers cut around a region and clear inside it',()=>{
 assert.deepEqual(boundaryEdges(new Set(['T'])).sort(),['B-T','F-T','L-T','R-T']);
 assert.equal(boundaryEdges(new Set(['F','R','B','L','T','D'])).length,0);
 assert.equal(edgesOfFaces(new Set(['F','T'])).length,7);
});
