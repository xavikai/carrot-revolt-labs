import { TRACKS, createLesson, track, findKey, trackForKey, valueAt, addKey, moveKeys, deleteKeys, moveGraphKey, setTangent, dragTangent, checkLesson } from './model.js';

const $ = s => document.querySelector(s);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (v, n = 2) => +v.toFixed(n);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const meta = id => TRACKS.find(t => t.id === id);
const LESSONS = {
  timeline: { index: 'EXERCICI 01 · TIME SLIDER', title: 'Timeline i fotogrames clau', summary: 'El Time Slider marca el fotograma actual; el Track Bar mostra les claus de l’objecte. Configura el rang, prova el player i crea una clau amb Auto Key o Set Keys. Els filtres decideixen quines pistes grava Set Keys.', task: 'Ves a un fotograma entre 1 i 59. Activa Auto Key i posa X Position a 5 m, o prepara el valor i prem Set Keys. Després arrossega la nova clau al Track Bar.', success: 'Clau intermèdia creada. Prova de moure-la o duplicar-la amb Shift.' },
  curves: { index: 'EXERCICI 02 · KEY WINDOW', title: 'Curve Editor i interpolacions', summary: 'A la gràfica, X és temps i Y és valor. La pendent mostra com de ràpid canvia la posició. Compara Linear, Smooth i Step; selecciona una clau per aplanar o trencar-ne les tangents.', task: 'A X Position, puja la clau central per sobre de 6 m i aplica Smooth. Arrossega-la o escriu el seu valor al panell Selected Key. Després prova Flat i Break.', success: 'Has canviat el valor i la interpolació: observa com varia la velocitat al viewport.' },
  dope: { index: 'EXERCICI 03 · PISTES', title: 'Dope Sheet i timing', summary: 'El Dope Sheet separa les claus en files: Position, Rotation i Scale. Aquí mous el temps de les claus sense modificar-ne el valor. Amb Shift i arrossegant, en fas una còpia.', task: 'Obre Dope Sheet. Mou la clau central de Y Rotation del fotograma 30 a un fotograma 25 o anterior. Després duplica la clau central de Uniform Scale amb Shift i arrossegant, o amb Copy to Frame.', success: 'Has canviat el ritme de dues pistes sense canviar-ne els valors.' },
  loops: { index: 'EXERCICI 04 · OUT-OF-RANGE TYPES', title: 'Cycle, Loop i Ping Pong', summary: 'Quan el temps surt del rang de claus, 3ds Max pot mantenir l’últim valor, repetir-lo, continuar-lo o invertir-lo. En aquesta escena la rotació té claus a 0° i 360° entre els fotogrames 0 i 20.', task: 'Al panell Out-of-Range Types, compara Cycle, Loop i Ping Pong. Tria Loop i ves al fotograma 60: el valor de Y Rotation ha de ser 1080°.', success: 'Loop conserva la continuïtat: 360° per volta, 1080° al fotograma 60.' },
  free: { index: 'EXPLORACIÓ LLIURE', title: 'Construeix la teva animació', summary: 'Tens accés als controls de Position, Rotation i Scale, al Time Slider, al Dope Sheet i al Curve Editor. Afegeix, mou, copia o elimina claus i observa com canvia l’objecte.', task: 'Prova d’animar la pilota com vulguis. Canvia els filtres de Set Keys, compara tangents i fes una rotació que es repeteixi.', success: 'Segueix experimentant amb les pistes i els fotogrames.' },
};
const OUT_TEXT = { constant: 'Manté el primer o l’últim valor.', cycle: 'Repeteix el mateix tram i torna al valor inicial.', loop: 'Repeteix el tram sumant la diferència de cada volta.', pingpong: 'Alterna endavant i enrere entre les claus.' };
const scenes = new Map();
const S = { lesson: 'timeline', scene: null, frame: 0, active: 'x', selected: [], view: 'curve', tool: 'move', auto: false, setMode: true, keyMode: false, pending: {}, drag: null, playing: false, graphStart: 0, graphEnd: 60, status: '', lastStamp: 0, playFloat: 0 };
const ids = () => Object.values(S.scene.tracks).flat().map(k => k.id);
const selectedKeys = () => S.selected.map(id => findKey(S.scene, id)).filter(Boolean);
const current = id => S.pending[id] ?? valueAt(S.scene, id, S.frame);
const cleanPending = () => { S.pending = {}; };
const notify = msg => { S.status = msg; $('#status-message').textContent = msg; };

function enterLesson(id) {
  stop(); S.lesson = id; S.scene = scenes.get(id) || createLesson(id); scenes.set(id, S.scene);
  S.frame = 0; S.playFloat = 0; S.active = id === 'loops' ? 'rotation' : 'x'; S.selected = []; S.view = id === 'dope' ? 'dope' : 'curve'; S.tool = 'move'; S.auto = false; S.setMode = true; S.keyMode = false; S.graphStart = S.scene.start; S.graphEnd = S.scene.end; cleanPending();
  document.querySelectorAll('[data-lesson]').forEach(b => b.setAttribute('aria-current', String(b.dataset.lesson === id)));
  const lesson = LESSONS[id];
  $('#lesson-index').textContent = lesson.index; $('#lesson-title').textContent = lesson.title;
  $('#lesson-summary').textContent = lesson.summary; $('#lesson-task').textContent = lesson.task;
  notify(''); render();
}

function lessonStatus() {
  const ok = checkLesson(S.lesson, S.scene, S.frame), el = $('#lesson-result');
  el.classList.toggle('done', ok);
  el.textContent = S.lesson === 'free' ? 'Sense objectiu fix · prova lliurement' : ok ? `✓ ${LESSONS[S.lesson].success}` : 'Pendent · segueix les instruccions';
}

function selectKey(id, additive = false) {
  if (additive) S.selected = S.selected.includes(id) ? S.selected.filter(k => k !== id) : [...S.selected, id];
  else S.selected = [id];
  const t = trackForKey(S.scene, id); if (t) S.active = t;
  render();
}
function setFrame(f) {
  S.frame = clamp(Math.round(f), S.scene.start, S.scene.end); S.playFloat = S.frame;
  cleanPending(); render();
}
function record(changedIds) {
  if (!S.auto) return;
  for (const id of changedIds) addKey(S.scene, id, S.frame, current(id));
  S.selected = changedIds.map(id => track(S.scene, id).find(k => k.frame === S.frame)?.id).filter(Boolean);
  cleanPending(); notify(`Auto Key · ${changedIds.map(id => meta(id).name).join(', ')} · frame ${S.frame}`);
}
function setValue(id, value) {
  if (!Number.isFinite(value)) return;
  if (id === 'scale') value = clamp(value, .1, 4);
  S.pending[id] = round(value, 3);
  record([id]); render();
}
function setKeysFromFilters() {
  if (!S.setMode) { notify('Activa Set Key Mode per desar les claus manualment.'); return; }
  const groups = [...document.querySelectorAll('[data-key-filter]:checked')].map(x => x.dataset.keyFilter);
  const tracks = TRACKS.filter(t => groups.includes(t.group));
  if (!tracks.length) { notify('Tria almenys un filtre: Position, Rotation o Scale.'); return; }
  const values = Object.fromEntries(tracks.map(t => [t.id, current(t.id)]));
  S.selected = tracks.map(t => addKey(S.scene, t.id, S.frame, values[t.id]).id);
  cleanPending(); notify(`Set Keys · ${tracks.length} pistes · frame ${S.frame}`); render();
}

function graphDomain() { return [S.graphStart, S.graphEnd]; }
function svgBox(el, height) { const w = Math.max(280, el.clientWidth); el.setAttribute('viewBox', `0 0 ${w} ${height}`); return w; }
const point = (svg, e) => { const r = svg.getBoundingClientRect(); const b = svg.viewBox.baseVal; return { x: (e.clientX-r.left)*b.width/r.width, y: (e.clientY-r.top)*b.height/r.height }; };
const ruler = (a,b,x0,x1,y0,y1,step=10) => { let h=''; for (let f=Math.ceil(a/step)*step; f<=b; f+=step) { const x=x0+(f-a)/(b-a)*(x1-x0); h+=`<line x1="${x}" x2="${x}" y1="${y0}" y2="${y1}" stroke="#565656" stroke-width="1"/><text x="${x+3}" y="${y0+12}" fill="#bfc4c8" font-size="10">${f}</text>`; } return h; };
const keyShape = (x,y,k,t,kind='diamond') => {
  const selected = S.selected.includes(k.id), fill=meta(t).color, stroke=selected?'#fff':'#191919';
  const shape=kind==='circle'?`<circle cx="${x}" cy="${y}" r="${selected?6:5}" fill="${fill}" stroke="${stroke}" stroke-width="${selected?2:1}"/>`:`<path d="M${x} ${y-6}L${x+6} ${y} ${x} ${y+6} ${x-6} ${y}Z" fill="${fill}" stroke="${stroke}" stroke-width="${selected?2:1}"/>`;
  return `<g data-key="${k.id}" data-track="${t}" tabindex="0" role="button" aria-label="${esc(meta(t).name)}; frame ${k.frame}; valor ${round(k.value)}" style="cursor:grab">${shape}<circle cx="${x}" cy="${y}" r="12" fill="transparent"/></g>`;
};

function drawTrackbar() {
  const svg=$('#trackbar'), w=svgBox(svg,84), x0=26, x1=w-20, span=Math.max(1,S.scene.end-S.scene.start), X=f=>x0+(f-S.scene.start)/span*(x1-x0);
  let h=`<rect width="${w}" height="84" fill="#383838"/><rect x="0" y="0" width="${w}" height="27" fill="#444"/>`;
  h+=ruler(S.scene.start,S.scene.end,x0,x1,4,83,10);
  h+=`<line x1="${x0}" x2="${x1}" y1="70" y2="70" stroke="#858585"/>`;
  const rows={x:37,z:46,rotation:55,scale:64};
  for(const t of TRACKS) for(const k of track(S.scene,t.id)) if(k.frame>=S.scene.start&&k.frame<=S.scene.end) h+=keyShape(X(k.frame),rows[t.id],k,t.id);
  h+=`<line x1="${X(S.frame)}" x2="${X(S.frame)}" y1="0" y2="76" stroke="#edcf32" stroke-width="2" pointer-events="none"/><rect x="${X(S.frame)-5}" y="0" width="10" height="8" fill="#f2d64d" pointer-events="none"/>`;
  h+=`<rect x="${x0}" y="0" width="${x1-x0}" height="26" fill="transparent" data-scrub="true" style="cursor:ew-resize"/>`;
  svg.innerHTML=h; svg.dataset.x0=x0;svg.dataset.x1=x1;svg.dataset.f0=S.scene.start;svg.dataset.f1=S.scene.end;
}

function drawTree() {
  $('#track-list').innerHTML=TRACKS.map(t=>`<button type="button" class="controller-row${S.active===t.id?' active':''}" data-track-id="${t.id}" aria-pressed="${S.active===t.id}"><i style="background:${t.color}"></i>${esc(t.name)}</button>`).join('');
  $('#active-track-label').textContent=`Ball_01 / ${meta(S.active).name}`;
}

function curveSpace() {
  const el=$('#curve-svg'),w=svgBox(el,345),keys=track(S.scene,S.active),values=keys.map(k=>k.value);
  for(let i=0;i<=60;i++)values.push(valueAt(S.scene,S.active,S.graphStart+(S.graphEnd-S.graphStart)*i/60));
  const minVal=Math.min(...values,0),maxVal=Math.max(...values,S.active==='scale'?2:1),pad=Math.max(1,(maxVal-minVal)*.17);
  const ymin=minVal-pad,ymax=maxVal+pad,x0=46,x1=w-20,y0=24,y1=315,[a,b]=graphDomain();
  return {el,w,x0,x1,y0,y1,a,b,ymin,ymax,X:f=>x0+(f-a)/(b-a)*(x1-x0),Y:v=>y1-(v-ymin)/(ymax-ymin)*(y1-y0),frame:x=>a+(x-x0)/(x1-x0)*(b-a),value:y=>ymin+(y1-y)/(y1-y0)*(ymax-ymin)};
}
function drawCurve() {
  const p=curveSpace(),t=meta(S.active),keys=track(S.scene,S.active); let h=`<rect width="${p.w}" height="345" fill="#343434"/>`;
  h+=ruler(p.a,p.b,p.x0,p.x1,22,316,10);
  for(let i=0;i<=5;i++){const v=p.ymin+(p.ymax-p.ymin)*i/5,y=p.Y(v);h+=`<line x1="${p.x0}" x2="${p.x1}" y1="${y}" y2="${y}" stroke="#494949"/><text x="3" y="${y-3}" fill="#bec4c9" font-size="10">${round(v,1)}</text>`;}
  if(S.active==='rotation'&&keys.length&&keys.at(-1).frame<p.b){const x=clamp(p.X(keys.at(-1).frame),p.x0,p.x1);h+=`<rect x="${x}" y="24" width="${p.x1-x}" height="291" fill="#efcf3420"/><line x1="${x}" x2="${x}" y1="24" y2="315" stroke="#e4c753" stroke-dasharray="4 3"/><text x="${Math.min(x+7,p.x1-89)}" y="43" fill="#e8d489" font-size="9">OUT OF RANGE</text>`;}
  h+=`<line x1="${p.X(S.frame)}" x2="${p.X(S.frame)}" y1="20" y2="316" stroke="#ead328" stroke-width="2"/>`;
  if(keys.length){let d='';const samples=Math.max(100,Math.min(420,Math.round(p.w)));for(let i=0;i<=samples;i++){const f=p.a+(p.b-p.a)*i/samples,v=valueAt(S.scene,S.active,f);d+=`${i?'L':'M'}${round(p.X(f),2)} ${round(p.Y(v),2)}`;}
    h+=`<path d="${d}" fill="none" stroke="${t.color}" stroke-width="2.2"/>`;
    for(const k of keys){if(k.frame<p.a||k.frame>p.b)continue;if(S.selected.includes(k.id)&&k.interp==='BEZIER')for(const side of ['left','right']){const q=k[side];h+=`<line x1="${p.X(k.frame)}" y1="${p.Y(k.value)}" x2="${p.X(q.frame)}" y2="${p.Y(q.value)}" stroke="#bfcbd5" stroke-width="1"/><rect x="${p.X(q.frame)-4}" y="${p.Y(q.value)-4}" width="8" height="8" fill="#b7d4e6" stroke="#202020" data-handle="${side}" data-key="${k.id}" style="cursor:crosshair"/>`;}
      h+=keyShape(p.X(k.frame),p.Y(k.value),k,S.active,'circle');}}
  h+=`<text x="${p.w-6}" y="339" fill="#aeb8c0" font-size="10" text-anchor="end">Frame</text>`;
  p.el.innerHTML=h;
}

function drawDope() {
  const el=$('#dope-svg'),w=svgBox(el,345),x0=30,x1=w-20,a=S.scene.start,b=S.scene.end,X=f=>x0+(f-a)/(b-a)*(x1-x0);
  let h=`<rect width="${w}" height="345" fill="#343434"/>`+ruler(a,b,x0,x1,20,332,10);
  TRACKS.forEach((t,i)=>{const y=80+i*60;h+=`<rect x="0" y="${y-27}" width="${w}" height="52" fill="${i%2?'#393939':'#3e3e3e'}"/><text x="8" y="${y-11}" fill="${t.color}" font-size="10" font-weight="bold">${esc(t.name)}</text>`;for(const k of track(S.scene,t.id))if(k.frame>=a&&k.frame<=b)h+=keyShape(X(k.frame),y+4,k,t.id);});
  h+=`<line x1="${X(S.frame)}" x2="${X(S.frame)}" y1="22" y2="332" stroke="#e6cf28" stroke-width="2" pointer-events="none"/>`;
  el.innerHTML=h;el.dataset.x0=x0;el.dataset.x1=x1;el.dataset.f0=a;el.dataset.f1=b;
}

function drawInspector() {
  const k=selectedKeys()[0],el=$('#key-properties');
  if(!k){el.innerHTML='<p>Selecciona una clau al Track Bar, Curve Editor o Dope Sheet. <kbd>Ctrl</kbd> + clic permet triar-ne diverses.</p>';return;}
  const t=meta(trackForKey(S.scene,k.id));
  el.innerHTML=`<p class="key-name"><i style="background:${t.color}"></i>${esc(t.name)}${S.selected.length>1?` · ${S.selected.length} claus`:''}</p><label>Time / Frame <input type="number" id="key-frame" min="0" max="250" value="${k.frame}"></label><label>Value <input type="number" id="key-value" step="0.1" value="${round(k.value,3)}"></label><label>Interpolation <select id="key-interp"><option value="smooth"${k.interp==='BEZIER'?' selected':''}>Smooth / Bézier</option><option value="linear"${k.interp==='LINEAR'?' selected':''}>Linear</option><option value="step"${k.interp==='CONSTANT'?' selected':''}>Step</option></select></label><div class="clone-row"><label>Copy to Frame <input type="number" id="copy-frame" min="0" max="250" value="${Math.min(k.frame+10,250)}"></label><button type="button" id="copy-key">Duplicate ◆</button></div><p>Time = fotograma · Value = coordenada o angle. Les tangents ajusten la velocitat entre claus.</p>`;
}

function drawViewport() {
  const canvas=$('#view'),r=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2),w=Math.max(1,r.width),h=Math.max(1,r.height);
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);
  c.fillStyle='#343434';c.fillRect(0,0,w,h);
  const horizon=h*.47,base=h*.77,cx=w*.48;
  c.fillStyle='#393939';c.fillRect(0,horizon,w,h-horizon);
  c.lineWidth=1;c.strokeStyle='#5b5b5b';
  for(let i=0;i<=13;i++){const y=horizon+(h-horizon)*(i/13)**1.75;c.beginPath();c.moveTo(0,Math.round(y)+.5);c.lineTo(w,Math.round(y)+.5);c.stroke();}
  for(let i=-16;i<=16;i++){c.beginPath();c.moveTo(cx+i*8,horizon);c.lineTo(cx+i*50,h);c.stroke();}
  c.strokeStyle='#8d4444';c.beginPath();c.moveTo(0,base);c.lineTo(w,base);c.stroke();
  c.strokeStyle='#4d8e60';c.beginPath();c.moveTo(cx,horizon);c.lineTo(cx,h);c.stroke();
  const x=current('x'),z=current('z'),rot=current('rotation')*Math.PI/180,scale=clamp(current('scale'),.1,4),radius=clamp(31*scale,7,100),bx=clamp(w*.2+x*w*.058,28,w-28),by=base-z*31-radius;
  S.ball={x:bx,y:by,r:radius,w,h};
  c.fillStyle='#1118';c.beginPath();c.ellipse(bx,base+5,Math.max(16,radius*.95),Math.max(4,radius*.18),0,0,Math.PI*2);c.fill();
  const gradient=c.createRadialGradient(bx-radius*.4,by-radius*.45,radius*.1,bx,by,radius);gradient.addColorStop(0,'#ffda9b');gradient.addColorStop(.32,'#f39248');gradient.addColorStop(.7,'#c44925');gradient.addColorStop(1,'#442019');
  c.save();c.translate(bx,by);c.beginPath();c.arc(0,0,radius,0,Math.PI*2);c.clip();c.fillStyle=gradient;c.fillRect(-radius,-radius,radius*2,radius*2);
  c.rotate(rot);c.strokeStyle='#f4e6bd';c.lineWidth=Math.max(3,radius*.16);c.beginPath();c.moveTo(-radius*.95,-radius*.3);c.quadraticCurveTo(0,radius*.17,radius*.95,-radius*.3);c.stroke();c.strokeStyle='#2662b8';c.lineWidth=Math.max(3,radius*.18);c.beginPath();c.moveTo(-radius*.85,radius*.42);c.quadraticCurveTo(0,-radius*.1,radius*.85,radius*.42);c.stroke();c.restore();
  c.strokeStyle='#f3dd47';c.lineWidth=1;c.strokeRect(bx-radius-5,by-radius-5,radius*2+10,radius*2+10);
  if(S.tool==='move'){c.lineWidth=3;c.strokeStyle='#f36b62';c.beginPath();c.moveTo(bx,by);c.lineTo(bx+radius+35,by);c.stroke();c.fillStyle='#f36b62';c.beginPath();c.moveTo(bx+radius+35,by);c.lineTo(bx+radius+25,by-5);c.lineTo(bx+radius+25,by+5);c.fill();c.strokeStyle='#6fb0fb';c.beginPath();c.moveTo(bx,by);c.lineTo(bx,by-radius-35);c.stroke();c.fillStyle='#6fb0fb';c.beginPath();c.moveTo(bx,by-radius-35);c.lineTo(bx-5,by-radius-25);c.lineTo(bx+5,by-radius-25);c.fill();}
  if(S.tool==='rotate'){c.strokeStyle='#8ad495';c.lineWidth=2;c.beginPath();c.ellipse(bx,by,radius+17,(radius+17)*.4,0,0,Math.PI*2);c.stroke();}
  if(S.tool==='scale'){c.strokeStyle='#f3c76c';c.lineWidth=3;c.beginPath();c.moveTo(bx+radius*.5,by-radius*.5);c.lineTo(bx+radius+28,by-radius-28);c.stroke();c.fillStyle='#f3c76c';c.fillRect(bx+radius+22,by-radius-34,12,12);}
  c.fillStyle='#e4e8ec';c.font='11px Segoe UI,Arial';c.fillText('Ball_01',bx-radius,by-radius-16);
}

function render() {
  if(!S.scene)return;
  $('#viewport-frame').textContent=`Frame ${S.frame}`;$('#current-frame').value=S.frame;$('#time-readout').textContent=`${(S.frame/S.scene.fps).toFixed(2)} s`;
  $('#out-type').value=S.scene.out;$('#out-explain').textContent=OUT_TEXT[S.scene.out];
  $('#track-title').textContent=`Track View - ${S.view==='curve'?'Curve Editor':'Dope Sheet'}`;
  $('#curve-svg').toggleAttribute('hidden',S.view!=='curve');$('#dope-svg').toggleAttribute('hidden',S.view!=='dope');
  $('#edit-axis-label').textContent=S.view==='curve'?'Temps (fotogrames) →  ·  valor ↑':'Temps (fotogrames) →  ·  una fila per pista';
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===S.view)));
  document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===S.tool));
  $('#auto-key').setAttribute('aria-pressed',String(S.auto));$('#set-key-mode').setAttribute('aria-pressed',String(S.setMode));$('#key-mode').setAttribute('aria-pressed',String(S.keyMode));$('#play').setAttribute('aria-pressed',String(S.playing));$('#play').textContent=S.playing?'■':'▶';
  for(const t of TRACKS){const el=$(`#val-${t.id}`);if(document.activeElement!==el)el.value=round(current(t.id),2);}
  drawTree();drawTrackbar();if(S.view==='curve')drawCurve();else drawDope();drawInspector();drawViewport();lessonStatus();
}

function stop(){S.playing=false;S.lastStamp=0;$('#play').textContent='▶';$('#play').setAttribute('aria-pressed','false');}
function tick(stamp){if(!S.playing)return;if(!S.lastStamp)S.lastStamp=stamp;const dt=Math.min(.1,(stamp-S.lastStamp)/1000);S.lastStamp=stamp;S.playFloat+=dt*S.scene.fps*S.scene.speed;if(S.playFloat>S.scene.end)S.playFloat=S.scene.start+(S.playFloat-S.scene.start)%(S.scene.end-S.scene.start+1);const f=Math.round(S.playFloat);if(f!==S.frame){S.frame=f;cleanPending();render();}requestAnimationFrame(tick);}
function togglePlay(){if(S.playing){stop();return;}cleanPending();S.playing=true;S.playFloat=S.frame;S.lastStamp=0;render();requestAnimationFrame(tick);}
function previous(direction){const f=S.frame;if(!S.keyMode){setFrame(f+direction);return;}const frames=[...new Set(Object.values(S.scene.tracks).flat().map(k=>k.frame))].sort((a,b)=>a-b);const to=direction<0?frames.filter(n=>n<f).at(-1):frames.find(n=>n>f);if(to!=null)setFrame(to);}

function svgFrame(svg,x){return Math.round(+svg.dataset.f0+(x-(+svg.dataset.x0))/(+svg.dataset.x1-(+svg.dataset.x0))*(+svg.dataset.f1-(+svg.dataset.f0)));}
function attachTimeSvg(svg){svg.addEventListener('pointerdown',e=>{const target=e.target.closest('[data-key]'),p=point(svg,e);if(target){const id=target.dataset.key;if(e.ctrlKey){selectKey(id,true);return;}if(!S.selected.includes(id)||S.selected.length===0)selectKey(id);S.drag={kind:'keys',svg,start:p.x,df:0,duplicate:e.shiftKey,ids:[...S.selected]};svg.setPointerCapture(e.pointerId);e.preventDefault();return;}if(svg.id==='trackbar'&&e.target.closest('[data-scrub]')){S.drag={kind:'scrub',svg};svg.setPointerCapture(e.pointerId);setFrame(svgFrame(svg,p.x));e.preventDefault();}});
  svg.addEventListener('pointermove',e=>{const d=S.drag;if(!d||d.svg!==svg)return;const p=point(svg,e);if(d.kind==='scrub'){setFrame(svgFrame(svg,p.x));return;}d.df=svgFrame(svg,p.x)-svgFrame(svg,d.start);$('#drag-readout').textContent=`Offset ${d.df>=0?'+':''}${d.df} frames${d.duplicate?' · copy':''}`;});
  svg.addEventListener('pointerup',e=>{const d=S.drag;if(!d||d.svg!==svg)return;S.drag=null;$('#drag-readout').textContent='';if(d.kind==='keys'&&d.df){const ok=moveKeys(S.scene,d.ids,d.df,d.duplicate);notify(ok?`${d.duplicate?'Claus duplicades':'Claus mogudes'} · Offset ${d.df>=0?'+':''}${d.df}`:'No es pot posar una clau en un fotograma ocupat o fora del rang.');if(ok&&d.duplicate)S.selected=[];render();}else if(d.kind==='keys')render();svg.releasePointerCapture(e.pointerId);});}

const graph=$('#curve-svg');
graph.addEventListener('pointerdown',e=>{const hit=e.target.closest('[data-key]');if(!hit){if(e.button===1){S.drag={kind:'pan',svg:graph,start:point(graph,e).x,a:S.graphStart,b:S.graphEnd};graph.setPointerCapture(e.pointerId);e.preventDefault();}return;}const id=hit.dataset.key;if(e.ctrlKey){selectKey(id,true);return;}if(!S.selected.includes(id))selectKey(id);const p=point(graph,e),k=findKey(S.scene,id);S.drag={kind:hit.dataset.handle?'handle':'graphkey',svg:graph,id,side:hit.dataset.handle,start:p,frame:k.frame,value:k.value};graph.setPointerCapture(e.pointerId);e.preventDefault();});
graph.addEventListener('pointermove',e=>{const d=S.drag;if(!d||d.svg!==graph)return;const p=point(graph,e),c=curveSpace();if(d.kind==='pan'){const df=(p.x-d.start)/(c.x1-c.x0)*(d.b-d.a);S.graphStart=d.a-df;S.graphEnd=d.b-df;drawCurve();return;}const frame=c.frame(p.x),value=c.value(p.y);if(d.kind==='handle'){dragTangent(S.scene,d.id,d.side,frame,value);$('#drag-readout').textContent=`Tangent ${d.side} · frame ${round(frame,1)} · value ${round(value,2)}`;}else{moveGraphKey(S.scene,d.id,frame,round(value,2));const k=findKey(S.scene,d.id);$('#drag-readout').textContent=`Time ${k.frame} · Offset ${k.frame-d.frame>=0?'+':''}${k.frame-d.frame} · Value ${round(k.value,2)}`;}drawCurve();drawViewport();});
graph.addEventListener('pointerup',e=>{if(!S.drag||S.drag.svg!==graph)return;S.drag=null;$('#drag-readout').textContent='';graph.releasePointerCapture(e.pointerId);render();});
graph.addEventListener('wheel',e=>{e.preventDefault();const p=point(graph,e),c=curveSpace(),center=c.frame(p.x),span=c.b-c.a,factor=e.deltaY<0?.82:1.22,newSpan=clamp(span*factor,6,250),ratio=(center-c.a)/span;S.graphStart=center-ratio*newSpan;S.graphEnd=S.graphStart+newSpan;drawCurve();},{passive:false});

const view=$('#view');
view.addEventListener('pointerdown',e=>{if(!S.ball)return;const r=view.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,b=S.ball;if(Math.hypot(x-b.x,y-b.y)>b.r+18)return;const values=Object.fromEntries(TRACKS.map(t=>[t.id,current(t.id)]));S.drag={kind:'viewport',startX:x,startY:y,values};view.setPointerCapture(e.pointerId);$('.viewport-canvas').classList.add('dragging');e.preventDefault();});
view.addEventListener('pointermove',e=>{const d=S.drag;if(!d||d.kind!=='viewport')return;const r=view.getBoundingClientRect(),dx=e.clientX-r.left-d.startX,dy=e.clientY-r.top-d.startY;if(S.tool==='move'){S.pending.x=round(d.values.x+dx/(r.width*.058),2);S.pending.z=round(d.values.z-dy/31,2);}if(S.tool==='rotate')S.pending.rotation=round(d.values.rotation+dx*2,1);if(S.tool==='scale')S.pending.scale=round(clamp(d.values.scale+dx/100,.1,4),2);drawViewport();for(const t of TRACKS)if(document.activeElement!==$(`#val-${t.id}`))$(`#val-${t.id}`).value=round(current(t.id),2);});
view.addEventListener('pointerup',e=>{const d=S.drag;if(!d||d.kind!=='viewport')return;S.drag=null;view.releasePointerCapture(e.pointerId);$('.viewport-canvas').classList.remove('dragging');const changed=Object.keys(S.pending).filter(id=>Math.abs(S.pending[id]-d.values[id])>.001);if(changed.length){record(changed);if(!S.auto)notify('Transformació preparada · prem Set Keys per enregistrar-la.');}render();});

document.querySelectorAll('[data-lesson]').forEach(b=>b.addEventListener('click',()=>enterLesson(b.dataset.lesson)));
$('#reset-lesson').onclick=()=>{scenes.delete(S.lesson);enterLesson(S.lesson);notify('Exercici reiniciat.');};
document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>{S.tool=b.dataset.tool;render();}));
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{S.view=b.dataset.view;render();}));
document.querySelectorAll('[data-tangent]').forEach(b=>b.addEventListener('click',()=>{if(!S.selected.length){notify('Selecciona una o més claus al Curve Editor o al Dope Sheet.');return;}setTangent(S.scene,S.selected,b.dataset.tangent);notify(`Tangent ${b.dataset.tangent} aplicada a ${S.selected.length} claus.`);render();}));
document.querySelectorAll('.command-panel input').forEach(el=>el.addEventListener('change',()=>setValue(el.id.slice(4),+el.value)));
$('#auto-key').onclick=()=>{S.auto=!S.auto;if(S.auto)S.setMode=false;notify(S.auto?'Auto Key activat: cada canvi posa claus a les pistes modificades.':'Auto Key desactivat.');render();};
$('#set-key-mode').onclick=()=>{S.setMode=!S.setMode;if(S.setMode)S.auto=false;notify(S.setMode?'Set Key Mode activat: prepara el valor i prem Set Keys.':'Set Key Mode desactivat.');render();};
$('#set-keys').onclick=setKeysFromFilters;
$('#first').onclick=()=>setFrame(S.scene.start);$('#last').onclick=()=>setFrame(S.scene.end);
$('#prev').onclick=()=>previous(-1);$('#next').onclick=()=>previous(1);$('#key-mode').onclick=()=>{S.keyMode=!S.keyMode;notify(S.keyMode?'Key Mode: les fletxes salten entre claus.':'Frame Mode: les fletxes avancen d’un fotograma.');render();};
$('#play').onclick=togglePlay;$('#current-frame').onchange=e=>setFrame(+e.target.value);
$('#add-key').onclick=()=>{const k=addKey(S.scene,S.active,S.frame,current(S.active));S.selected=[k.id];notify(`Add Keys · ${meta(S.active).name} · frame ${S.frame}`);render();};
$('#delete-key').onclick=()=>{if(!S.selected.length){notify('Selecciona una clau per suprimir-la.');return;}deleteKeys(S.scene,S.selected);S.selected=[];notify('Claus seleccionades suprimides.');render();};
$('#fit-keys').onclick=()=>{const k=track(S.scene,S.active);S.graphStart=Math.min(S.scene.start,k[0]?.frame??S.scene.start);S.graphEnd=Math.max(S.scene.end,k.at(-1)?.frame??S.scene.end);notify('Vista ajustada al rang de claus.');render();};
$('#track-list').addEventListener('click',e=>{const b=e.target.closest('[data-track-id]');if(!b)return;S.active=b.dataset.trackId;S.selected=[];render();});
$('#key-properties').addEventListener('change',e=>{if(e.target.id==='copy-frame')return;const k=selectedKeys()[0];if(!k)return;if(e.target.id==='key-frame'){const ok=moveGraphKey(S.scene,k.id,+e.target.value,k.value);notify(ok?'Fotograma actualitzat.':'Ja hi ha una clau en aquest fotograma.');}if(e.target.id==='key-value')moveGraphKey(S.scene,k.id,k.frame,+e.target.value);if(e.target.id==='key-interp')setTangent(S.scene,[k.id],e.target.value);render();});
$('#key-properties').addEventListener('click',e=>{if(e.target.id!=='copy-key')return;const k=selectedKeys()[0];if(!k)return;const frame=+$('#copy-frame').value,t=trackForKey(S.scene,k.id);if(!Number.isInteger(frame)||!moveKeys(S.scene,[k.id],frame-k.frame,true)){notify('Tria un fotograma lliure diferent de l’original.');return;}S.selected=[track(S.scene,t).find(other=>other.frame===frame&&other.id!==k.id).id];notify(`Clau duplicada al fotograma ${frame}.`);render();});
$('#out-type').onchange=e=>{S.scene.out=e.target.value;notify(`Out-of-Range: ${e.target.selectedOptions[0].textContent}`);render();};
attachTimeSvg($('#trackbar'));attachTimeSvg($('#dope-svg'));
for(const svg of [$('#trackbar'),$('#curve-svg'),$('#dope-svg')])svg.addEventListener('keydown',e=>{const hit=e.target.closest('[data-key]');if(!hit||!['Enter',' '].includes(e.key))return;e.preventDefault();selectKey(hit.dataset.key,e.ctrlKey);});
const dialog=$('#time-dialog');$('#open-config').onclick=()=>{$('#start-frame').value=S.scene.start;$('#end-frame').value=S.scene.end;$('#fps').value=S.scene.fps;$('#speed').value=S.scene.speed;dialog.showModal();};
dialog.addEventListener('close',()=>{if(dialog.returnValue!=='save')return;const start=+$('#start-frame').value,end=+$('#end-frame').value;if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>250||start>=end){notify('El fotograma final ha de ser posterior a l’inicial, entre 0 i 250.');return;}S.scene.start=start;S.scene.end=end;S.scene.fps=+$('#fps').value;S.scene.speed=+$('#speed').value;S.graphStart=start;S.graphEnd=end;S.frame=clamp(S.frame,start,end);notify(`Time Configuration · ${start}–${end} · ${S.scene.fps} fps · velocitat ${S.scene.speed}×`);render();});
document.addEventListener('keydown',e=>{if(e.target.closest('input,select,textarea,dialog'))return;const key=e.key.toLowerCase();if(key===' '){e.preventDefault();togglePlay();}if(key==='delete'||key==='backspace'){$('#delete-key').click();e.preventDefault();}if(key==='w'||key==='e'||key==='r'){S.tool={w:'move',e:'rotate',r:'scale'}[key];render();}if(key==='arrowleft'){previous(-1);e.preventDefault();}if(key==='arrowright'){previous(1);e.preventDefault();}});
new ResizeObserver(()=>render()).observe($('.max-shell'));
enterLesson('timeline');
