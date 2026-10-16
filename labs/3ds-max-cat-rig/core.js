export const requiredParts = ['pelvis','legs','spine','arms','head'];
export const initialJoints = Object.freeze({root:[300,480],pelvis:[300,301],chest:[300,186],head:[300,132],shoulderL:[365,188],elbowL:[435,201],wristL:[495,209],shoulderR:[235,188],elbowR:[165,201],wristR:[105,209],hipL:[331,309],kneeL:[335,388],ankleL:[335,461],hipR:[269,309],kneeR:[265,388],ankleR:[265,461]});
export const boneSegments = [
  ['root','pelvis','pelvis'],['pelvis','chest','spine'],['chest','head','head'],
  ['chest','shoulderL','arms'],['shoulderL','elbowL','arms'],['elbowL','wristL','arms'],
  ['chest','shoulderR','arms'],['shoulderR','elbowR','arms'],['elbowR','wristR','arms'],
  ['hipL','kneeL','legs'],['kneeL','ankleL','legs'],
  ['hipR','kneeR','legs'],['kneeR','ankleR','legs']
];
export const targetJoints = Object.freeze({pelvis:[300,298],chest:[300,190],head:[300,128],shoulderL:[370,190],elbowL:[440,196],wristL:[504,198],hipL:[330,308],kneeL:[335,387],ankleL:[335,462],shoulderR:[230,190],elbowR:[160,196],wristR:[96,198],hipR:[270,308],kneeR:[265,387],ankleR:[265,462]});
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
