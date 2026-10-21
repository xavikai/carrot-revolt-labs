export const requiredParts = ['pelvis','legs','spine','arms','head'];
export const initialJoints = Object.freeze({root:[300,480],pelvis:[300,301],chest:[300,186],head:[300,132],shoulderL:[365,188],elbowL:[435,201],wristL:[495,209],shoulderR:[235,188],elbowR:[165,201],wristR:[105,209],hipL:[331,309],kneeL:[335,388],ankleL:[335,461],hipR:[269,309],kneeR:[265,388],ankleR:[265,461]});
export const boneSegments = [
  ['root','pelvis','pelvis'],['pelvis','chest','spine'],['chest','head','head'],
  ['chest','shoulderL','arms'],['shoulderL','elbowL','arms'],['elbowL','wristL','arms'],
  ['chest','shoulderR','arms'],['shoulderR','elbowR','arms'],['elbowR','wristR','arms'],
  ['hipL','kneeL','legs'],['kneeL','ankleL','legs'],
  ['hipR','kneeR','legs'],['kneeR','ankleR','legs']
];
// Pivots measured on the practice mesh (Night Striker, 1.79 m): [screen x, screen y] in the 225 px/m grid.
export const targetJoints = Object.freeze({pelvis:[300,259],chest:[300,183],head:[300,113],shoulderL:[344,159],elbowL:[400,161],wristL:[452,159],hipL:[320,274],kneeL:[326,370],ankleL:[327,461],shoulderR:[256,159],elbowR:[200,161],wristR:[148,159],hipR:[280,274],kneeR:[274,370],ankleR:[273,461]});
// Depth (metres, +Z = character front) of each pivot inside the mesh, as checked in the Left view.
export const targetDepths = Object.freeze({pelvis:-.01,chest:0,head:.01,shoulderL:-.05,elbowL:-.075,wristL:-.045,shoulderR:-.05,elbowR:-.075,wristR:-.045,hipL:-.01,kneeL:-.02,ankleL:-.06,hipR:-.01,kneeR:-.02,ankleR:-.06});
export const targetPoint = name => [(targetJoints[name][0]-300)/225,(480-targetJoints[name][1])/225,targetDepths[name]];
export function mirrorJoint(name, point){const suffix=name.slice(-1);if(!['L','R'].includes(suffix))return null;return [name.slice(0,-1)+(suffix==='L'?'R':'L'),[600-point[0],point[1]]];}
// Solve a two-bone leg toward a FootPlatform target. Coordinates are [screen x, screen y, depth in pixel units].
export function solveLegIK(hip, restKnee, target, upperLength, lowerLength) {
  const sub=(a,b)=>a.map((v,i)=>v-b[i]);
  const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
  const length=v=>Math.hypot(...v);
  const aim=sub(target,hip),distance=length(aim),direction=distance>1e-8?aim.map(v=>v/distance):[0,1,0];
  const reach=Math.max(1e-5,Math.min(distance,upperLength+lowerLength-1e-4));
  const ankle=hip.map((v,i)=>v+direction[i]*reach);
  const along=(upperLength*upperLength-lowerLength*lowerLength+reach*reach)/(2*reach);
  const bend=Math.sqrt(Math.max(0,upperLength*upperLength-along*along));
  const rest=sub(restKnee,hip),projection=dot(rest,direction);
  let pole=rest.map((v,i)=>v-direction[i]*projection);
  if(length(pole)<1e-5){const fallback=Math.abs(direction[0])<.9?[1,0,0]:[0,0,1];const d=dot(fallback,direction);pole=fallback.map((v,i)=>v-direction[i]*d);}
  const poleLength=length(pole)||1;
  const knee=hip.map((v,i)=>v+direction[i]*along+pole[i]/poleLength*bend);
  return {knee,ankle};
}
export function alignmentScore(joints){const names=Object.keys(targetJoints);const error=names.reduce((sum,name)=>{const p=joints[name],t=targetJoints[name];return sum+Math.hypot(p[0]-t[0],p[1]-t[1]);},0);return Math.max(0,Math.round(100-error/names.length*2.6));}
export const defaultWeights = Object.freeze([.95,.9,.8,.64,.55,.45,.36,.2,.1,.05]);
export function paintWeight(weights,index,value){if(index<0||index>=weights.length)return weights;const next=[...weights];next[index]=Math.max(0,Math.min(1,Number(value)));return next;}
export function weightColor(weight){const t=Math.max(0,Math.min(1,weight));const r=Math.round(55+200*t),g=Math.round(95+100*(1-Math.abs(t-.5)*2)),b=Math.round(240-180*t);return `rgb(${r},${g},${b})`;}
