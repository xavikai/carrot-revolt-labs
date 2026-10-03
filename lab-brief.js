// Carrot Revolt Labs · the step explanation goes above the workspace: read first, then try it below.
// It can be folded to a single line (remembered in this browser) once you know what to do.
import { getLang, onLangChange } from './i18n.js';

const TXT = {
  hide: { en: 'Fold the explanation', ca: "Plega l'explicació", es: 'Pliega la explicación' },
  show: { en: 'Show the explanation', ca: "Mostra l'explicació", es: 'Muestra la explicación' },
};
TXT.reset = { en: 'Restart the lab', ca: 'Reinicia el lab', es: 'Reinicia el lab' };
TXT.sure = { en: 'Sure? Click again: all progress is erased', ca: 'Segur? Torna a clicar: s\'esborra tot el progrés', es: '¿Seguro? Vuelve a hacer clic: se borra todo el progreso' };
TXT.resetTitle = { en: 'Erase the steps done and the work saved in this browser, and start the lab from the beginning', ca: 'Esborra els passos fets i la feina guardada en aquest navegador i torna a començar el lab', es: 'Borra los pasos hechos y el trabajo guardado en este navegador y vuelve a empezar el lab' };
const say = k => TXT[k][getLang()] || TXT[k].en;
// Where each lab keeps its progress in this browser.
const PREFIX = { animation: 'carrot-revolt-anim:', '3ds-max-animation': 'carrot-revolt-max-anim:', '3ds-max-viewport': 'carrot-revolt-max-vp:', baking: 'carrot-revolt-bake:', 'color-type': 'carrot-revolt-colortype:', csharp: 'carrot-revolt-csharp:', 'csharp-objects': 'carrot-revolt-csharp:objects:', editmode: 'carrot-revolt-editmode:', grading: 'carrot-revolt-grade:', 'gn-flow': 'carrot-revolt-gn:1:', 'gn-fields': 'carrot-revolt-gn:2:', 'gn-scatter': 'carrot-revolt-gn:3:', 'gn-curves': 'carrot-revolt-gn:4:', lighting: 'carrot-revolt-light:', lightmaps: 'carrot-revolt-lm:', lod: 'carrot-revolt-lod:', materials: 'carrot-revolt-mat:', photo: 'carrot-revolt-photo:', rig: 'carrot-revolt-rig:', 'skin-weights': 'carrot-revolt-skin:', 'stage-lighting': 'carrot-revolt-stagelx:', stage: 'carrot-revolt-stage:', 'texel-density': 'carrot-revolt-td:', tileable: 'carrot-revolt-tile:', topology: 'carrot-revolt-topo:', 'trim-sheet': 'carrot-revolt-trim:', 'uv-unwrapping': 'carrot-revolt-uv2:', viewport: 'carrot-revolt-viewport:' };
const labId = (location.pathname.match(/labs\/([^/]+)/) || [])[1];
export function resetLab(id = labId) {
  const p = PREFIX[id]; if (!p) return 0;
  let n = 0;
  try {
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith(p)) continue;
      if (id === 'csharp' && k.startsWith(PREFIX['csharp-objects'])) continue; // Code Lab 02 keeps its own progress
      localStorage.removeItem(k); n++;
    }
    if (id === 'gn-fields' && localStorage.getItem('carrot-revolt-gn:terrain')) { localStorage.removeItem('carrot-revolt-gn:terrain'); n++; } // GN 02 hands its terrain to GN 03
  } catch { /* storage unavailable */ }
  return n;
}
// A "Restart the lab" button in the page header. The first click asks, the second one erases and reloads.
function setupReset() {
  if (!PREFIX[labId]) return;
  const header = document.querySelector('.site-header') || document.querySelector('.header-actions'); if (!header || header.querySelector('.lab-reset')) return;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'lab-reset'; b.dataset.noI18n = '';
  let armed = null;
  const render = () => { b.classList.toggle('armed', !!armed); b.innerHTML = `<span aria-hidden="true">↺</span> ${say(armed ? 'sure' : 'reset')}`; b.title = say('resetTitle'); };
  b.addEventListener('click', () => {
    if (!armed) { armed = setTimeout(() => { armed = null; render(); }, 4000); render(); return; }
    clearTimeout(armed); resetLab(); location.reload();
  });
  const home = header.querySelector('.home-link');
  if (home) header.insertBefore(b, home); else header.prepend(b);
  onLangChange(render); render();
}
const KEY = 'carrot-revolt-brief-folded';

export function setupBrief() {
  const card = document.getElementById('step-card'), below = card?.closest('.below'), ws = document.getElementById('workspace');
  if (!card || !below || !ws || below.classList.contains('brief')) return;
  ws.parentNode.insertBefore(below, ws);
  below.classList.add('brief');
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'brief-toggle'; btn.dataset.noI18n = '';
  below.append(btn);
  let folded = false;
  try { folded = localStorage.getItem(KEY) === '1'; } catch { /* storage unavailable */ }
  const render = () => { below.classList.toggle('folded', folded); btn.setAttribute('aria-expanded', String(!folded)); btn.innerHTML = `<span aria-hidden="true">${folded ? '▾' : '▴'}</span> ${say(folded ? 'show' : 'hide')}`; };
  btn.addEventListener('click', () => { folded = !folded; try { localStorage.setItem(KEY, folded ? '1' : '0'); } catch { /* storage unavailable */ } render(); });
  onLangChange(render);
  render();
}
// Code Labs: the challenge card above the editor can be folded the same way.
function setupChallengeFold() {
  const card = document.getElementById('challenge'), acts = card?.querySelector('.challenge-actions');
  if (!card || !acts || card.querySelector('.ch-fold')) return;
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'ch-fold'; btn.dataset.noI18n = '';
  acts.append(btn);
  let folded = false;
  try { folded = localStorage.getItem(KEY) === '1'; } catch { /* storage unavailable */ }
  const render = () => { card.classList.toggle('folded', folded); btn.setAttribute('aria-expanded', String(!folded)); btn.innerHTML = `<span aria-hidden="true">${folded ? '▾' : '▴'}</span> ${say(folded ? 'show' : 'hide')}`; };
  btn.addEventListener('click', () => { folded = !folded; try { localStorage.setItem(KEY, folded ? '1' : '0'); } catch { /* storage unavailable */ } render(); });
  onLangChange(render); render();
}
setupBrief();
setupReset();
setupChallengeFold();
