import { CAMERAS, CUES, PLAN_ROLES, planIsCorrect, cueResult, cameraHasSubject } from './core.js?v=1';
import { addDictionary, onLangChange, t } from '../../i18n.js';
import dictionary from './i18n.js?v=5';
import { createRunway3D } from './scene3d.js?v=2';
addDictionary(dictionary);

const $ = selector => document.querySelector(selector);
const key = 'carrot-revolt-runway:state';
function load() { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } }
const saved = load();
const state = {
  step: Number.isInteger(saved.step) && saved.step >= 0 && saved.step <= CUES.length ? saved.step : 0,
  done: Array.isArray(saved.done) && saved.done.length === CUES.length + 1 ? saved.done.map(Boolean) : Array(CUES.length + 1).fill(false),
  roles: Array.isArray(saved.roles) && saved.roles.length === 5 ? saved.roles : Array(5).fill(''),
  program: CAMERAS.some(c => c.id === saved.program) ? saved.program : 1,
  preview: CAMERAS.some(c => c.id === saved.preview) ? saved.preview : 2,
  view: saved.view === 'map' ? 'map' : '3d',
  sweep: 0,
  feedback: '',
  feedbackKind: '',
};
if (state.step > 0 && !state.done[0]) state.step = 0;
if (CUES[state.step - 1]?.needsSweep && state.done[state.step]) state.sweep = 1;
let sweepTimer = null;
let scene3D = null, feedImages = [];
try { scene3D = createRunway3D($('#stage-3d')); } catch (error) { console.warn('3D view unavailable', error); state.view = 'map'; $('#view-3d').disabled = true; }
function save() { try { localStorage.setItem(key, JSON.stringify({ step: state.step, done: state.done, roles: state.roles, program: state.program, preview: state.preview, view: state.view })); } catch { /* private mode */ } }
function say(message, kind = '') { state.feedback = message; state.feedbackKind = kind; renderFeedback(); }
function renderFeedback() { const p = $(state.step === 0 ? '#plan-feedback' : '#live-feedback'); p.textContent = t(state.feedback); p.className = `feedback ${state.feedbackKind}`; }
function stepTo(index) {
  if (index > 0 && !state.done[0]) return;
  if (index < 0 || index > CUES.length) return;
  clearInterval(sweepTimer); sweepTimer = null; state.step = index; state.sweep = CUES[index - 1]?.needsSweep && state.done[index] ? 1 : 0; state.feedback = ''; state.feedbackKind = ''; save(); render();
}
function renderNav() {
  $('#stage-switch').innerHTML = `<button type="button" data-part="plan" class="${state.step === 0 ? 'active' : ''}">${t('Camera plan')}<small>${t('Five jobs')}</small></button><button type="button" data-part="live" class="${state.step > 0 ? 'active' : ''}" ${!state.done[0] ? 'disabled' : ''}>${t('Live rehearsal')}<small>${t('Nine moments')}</small></button>`;
  $('#guide').innerHTML = [{ name: 'Plan', i: 0 }, ...CUES.map((c, i) => ({ name: c.place, i: i + 1 }))].map(item => `<li class="${state.step === item.i ? 'current' : state.done[item.i] ? 'done' : ''}"><b>${state.done[item.i] ? '✓' : item.i + 1}</b>${t(item.name)}</li>`).join('');
  $('#desk-progress').textContent = `${state.step + 1} / ${CUES.length + 1}`;
  $('#cue-location').textContent = t(state.step === 0 ? 'Camera plan' : CUES[state.step - 1].place);
}
function renderBrief() {
  const plan = state.step === 0;
  const cue = CUES[state.step - 1];
  const done = state.done[state.step];
  const hint = plan ? ['Read the T route on the left.', 'Give each of the five camera positions one role.', 'Check the plan. C1 must stay on the presenter.'] : [cue.needsSweep ? 'Select C3 in preview, cut it to program, then start the feet-to-head tilt.' : cue.preferred === 1 ? 'Keep C1 framed on the presenter. Cut to it if another camera is live.' : 'Choose a camera that can see the model. Inspect it in preview, then cut to program.', 'Check this moment before advancing.'];
  const card = $('#step-card');
  card.classList.toggle('done', done);
  card.innerHTML = `<div class="step-intro"><span class="step-tag">${t(plan ? 'CAMERA PLAN' : 'LIVE REHEARSAL')} · ${state.step + 1}/${CUES.length + 1}</span><h3>${t(plan ? 'Give each camera a job' : cue.place)}</h3><p>${t(plan ? 'The model follows the yellow route. Assign the roles before going live.' : cue.action)}</p></div><div class="step-how"><span class="step-tag">${t('HOW')}</span><ol>${hint.map(h => `<li>${t(h)}</li>`).join('')}</ol><div class="step-tools">${state.step > 0 ? `<button type="button" data-action="previous">${t('Previous')}</button>` : ''}<button type="button" data-action="hint">${t('Hint')}</button><button type="button" data-action="check">${t('Check')}</button></div></div><div class="step-actions"><span class="step-state">${t(done ? '✓ Done' : 'Not yet')}</span>${done && state.step < CUES.length ? `<button type="button" class="next" data-action="next">${t('Next step')} →</button>` : ''}<button type="button" data-action="solution">${t('Show a solution')}</button><button type="button" data-action="reset">${t('Reset this step')}</button></div>`;
}
function renderPlan() {
  $('#plan-panel').hidden = state.step !== 0;
  $('#live-panel').hidden = state.step === 0;
  if (state.step !== 0) return;
  $('#role-list').innerHTML = CAMERAS.map((c, i) => `<label class="role-row"><span class="camera-tag">C${c.id}</span><span class="role-place">${t(c.place)}</span><select data-camera="${i}" aria-label="${t('Role for camera')} ${c.id}"><option value="">${t('Choose role…')}</option>${PLAN_ROLES.map(role => `<option value="${role}" ${state.roles[i] === role ? 'selected' : ''}>${t(role)}</option>`).join('')}</select></label>`).join('');
}
function renderView() {
  const three = state.view === '3d' && !!scene3D;
  $('#stage-3d').toggleAttribute('hidden', !three); $('#stage-map').toggleAttribute('hidden', three);
  $('#view-3d').setAttribute('aria-pressed', String(three));
  $('#view-map').setAttribute('aria-pressed', String(!three));
  document.querySelector('.view-switch').setAttribute('aria-label', t('Stage view'));
  $('#view-help').textContent = t(scene3D ? three ? 'Drag to rotate · Wheel to zoom · C1–C5 mark the cameras.' : 'The yellow line shows the model route.' : '3D is unavailable here. Use the top view.');
  scene3D?.setVisible(three);
}
function feed(cam, compact = false) {
  const cueIndex = Math.max(0, state.step - 1), cue = CUES[cueIndex];
  const subject = cameraHasSubject(cam, cueIndex);
  const type = cam === 1 ? 'presenter' : cam === 2 ? 'wide' : cam === 4 || cam === 5 ? 'side' : 'front';
  const scale = cam === 2 ? '.63' : cam === 3 ? '1.38' : cam === 4 ? '1.05' : cam === 5 ? '1.22' : '1';
  const label = cam === 1 ? 'PRESENTER' : cam === 2 ? 'WIDE' : cam === 3 ? 'FRONT' : cam === 4 ? 'LEFT' : 'SIDE';
  const image = feedImages[cam - 1] ? `<img class="feed-image" src="${feedImages[cam - 1]}" alt="" aria-hidden="true">` : '';
  const person = image ? '' : subject ? `<span class="feed-person" style="--person-scale:${scale}"></span>` : '';
  const empty = !subject ? `<span class="feed-empty">${t('Model out of frame')}</span>` : '';
  const tilt = cam === 3 && cue.id === 'tilt' ? `<span class="tilt-line" style="bottom:${12 + state.sweep * 68}%"></span><span class="tilt-badge">${t(state.sweep < .5 ? 'FEET' : 'HEAD')}</span>` : '';
  return `<div class="feed ${type} ${subject ? '' : 'no-subject'} ${image ? 'has-3d' : ''}"><span class="feed-runway"></span>${image}${person}${empty}${tilt}<span class="feed-caption">C${cam} · ${t(label)}${compact ? '' : ` · ${t('SIMULATED')}`}</span></div>`;
}
function renderLive() {
  if (state.step === 0) return;
  feedImages = scene3D?.update(CUES[state.step - 1], state.sweep, state.program, state.preview) || [];
  $('#program-screen').innerHTML = feed(state.program);
  $('#preview-screen').innerHTML = feed(state.preview);
  $('#program-name').textContent = `C${state.program} · ${t(CAMERAS[state.program - 1].role)}`;
  $('#preview-name').textContent = `C${state.preview} · ${t(CAMERAS[state.preview - 1].role)}`;
  $('#camera-bank').innerHTML = CAMERAS.map(c => `<button type="button" class="camera-choice ${state.preview === c.id ? 'selected' : ''} ${state.program === c.id ? 'on-air' : ''}" data-preview="${c.id}" aria-label="${t('Preview camera')} ${c.id}: ${t(c.role)}" aria-pressed="${state.preview === c.id}">${feed(c.id, true)}<strong>C${c.id} · ${t(c.role)}</strong></button>`).join('');
  $('#tilt-control').hidden = !CUES[state.step - 1].needsSweep;
  $('#tilt-progress').style.width = `${Math.round(state.sweep * 100)}%`;
  $('#tilt-button').disabled = state.sweep > 0 && state.sweep < 1;
  $('#tilt-button').textContent = t(state.sweep === 1 ? 'Repeat tilt' : state.sweep > 0 ? 'Tilt in progress…' : 'Start feet-to-head tilt');
  $('#next-cue').hidden = !state.done[state.step] || state.step === CUES.length;
}
function renderMap() {
  const marker = $('#model-marker');
  const cue = CUES[state.step - 1];
  marker.toggleAttribute('hidden', !cue?.position);
  if (cue?.position) marker.setAttribute('transform', `translate(${cue.position[0] * 3.04 + 48} ${cue.position[1] * 3.1 + 2.4})`);
  const mapLabels = ['STAGE LEFT / ENTRANCE', 'STAGE RIGHT', 'AUDIENCE'];
  document.querySelectorAll('.stage-label').forEach((label, i) => { label.textContent = t(mapLabels[i]); });
  document.querySelector('.presenter-marker text').textContent = t('PRESENTER');
  $('#stage-map').setAttribute('aria-label', t('T-shaped runway with the model route and five camera positions'));
  $('#workspace').setAttribute('aria-label', t('Live production simulator'));
  $('#stage-3d').setAttribute('aria-label', t('Interactive 3D view of the T-shaped runway, presenter, model and five cameras'));
  feedImages = scene3D?.update(cue, state.sweep, state.program, state.preview) || [];
}
function render() { renderNav(); renderBrief(); renderPlan(); renderView(); renderMap(); renderLive(); renderFeedback(); }
function checkPlan() {
  const firstEmpty = state.roles.findIndex(role => !role);
  if (firstEmpty >= 0) { say('Choose a role for every camera.', 'warn'); return; }
  if (!planIsCorrect(state.roles)) { const mismatch = state.roles.findIndex((role, i) => role !== PLAN_ROLES[i]); say(`Recheck C${mismatch + 1}: look at its position on the stage.`, 'warn'); return; }
  state.done[0] = true; save(); say('Good plan. C1 remains on the presenter; C2 gives you a wide safety shot.', 'good'); renderNav(); renderBrief();
}
function checkCue() {
  const cue = CUES[state.step - 1], result = cueResult(state.step - 1, state.program, state.sweep === 1);
  if (!result.ok) {
    if (result.reason === 'camera') say(`C${state.program} cannot cover this moment. Preview another camera, then CUT.`, 'warn');
    else say('Keep C3 on program and complete the vertical tilt from feet to head.', 'warn');
    return;
  }
  state.done[state.step] = true; save();
  say(state.step === CUES.length ? 'Show complete. The presenter is back on air and all nine moments are covered.' : result.preferred ? 'Good cut. The next moment is ready.' : 'This safe angle works. Compare it with the suggested angle in the camera plan.', 'good');
  renderNav(); renderBrief(); renderLive();
}
function showHint() {
  if (state.step === 0) { say('Read the camera positions: C1 presenter, C2 wide, C3 front tilt, C4 stage left, C5 runway side.', 'warn'); return; }
  const cue = CUES[state.step - 1];
  say(`Suggested shot: C${cue.preferred}${cue.needsSweep ? ' with a complete feet-to-head tilt' : ''}.`, 'warn');
}
function showSolution() {
  clearInterval(sweepTimer); sweepTimer = null;
  if (state.step === 0) {
    state.roles = [...PLAN_ROLES];
    state.done[0] = true;
    save(); render(); say('One possible solution is shown. Compare it with your attempt.', 'good');
    return;
  }
  const cue = CUES[state.step - 1];
  const previousProgram = state.program;
  state.program = cue.preferred;
  state.preview = previousProgram !== state.program ? previousProgram : state.program === 2 ? 1 : 2;
  state.sweep = 0;
  if (cue.needsSweep) {
    save(); render();
    startTilt(() => {
      state.done[state.step] = true;
      save(); render(); say('One possible solution is shown. Compare it with your attempt.', 'good');
    });
    return;
  }
  state.done[state.step] = true;
  save(); render(); say('One possible solution is shown. Compare it with your attempt.', 'good');
}
function resetStep() {
  clearInterval(sweepTimer); sweepTimer = null;
  state.done[state.step] = false;
  state.sweep = 0;
  if (state.step === 0) state.roles = Array(5).fill('');
  else {
    state.program = CUES[state.step - 2]?.preferred ?? 1;
    state.preview = state.program === 2 ? 1 : 2;
  }
  save(); render(); say('This step is ready to try again.', '');
}
function startTilt(onComplete = null) {
  if (state.program !== 3) { say('First preview C3 and cut it to program.', 'warn'); return; }
  clearInterval(sweepTimer); state.sweep = 0; state.done[state.step] = false; save(); renderNav(); renderBrief(); renderLive();
  let ticks = 0;
  sweepTimer = setInterval(() => {
    ticks += 1; state.sweep = Math.min(1, ticks / 32); renderLive();
    if (state.sweep === 1) { clearInterval(sweepTimer); sweepTimer = null; if (onComplete) onComplete(); else say('Vertical tilt complete: feet to head. Check this moment.', 'good'); }
  }, 85);
}
$('#role-list').addEventListener('change', e => { if (!e.target.matches('select[data-camera]')) return; state.roles[Number(e.target.dataset.camera)] = e.target.value; state.done[0] = false; save(); renderNav(); renderBrief(); });
$('#check-plan').addEventListener('click', checkPlan);
document.querySelector('.view-switch').addEventListener('click', e => { const view = e.target.closest('[data-view]')?.dataset.view; if (view && (view === 'map' || scene3D)) { state.view = view; save(); renderView(); } });
$('#stage-switch').addEventListener('click', e => { const b = e.target.closest('[data-part]'); if (b) stepTo(b.dataset.part === 'plan' ? 0 : Math.max(1, state.step)); });
$('#step-card').addEventListener('click', e => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'previous') stepTo(state.step - 1);
  if (action === 'next' && state.done[state.step]) stepTo(state.step + 1);
  if (action === 'hint') showHint();
  if (action === 'check') state.step === 0 ? checkPlan() : checkCue();
  if (action === 'solution') showSolution();
  if (action === 'reset') resetStep();
});
$('#camera-bank').addEventListener('click', e => { const b = e.target.closest('[data-preview]'); if (!b) return; state.preview = Number(b.dataset.preview); save(); renderLive(); });
$('#cut-button').addEventListener('click', () => { const old = state.program; state.program = state.preview; state.preview = old; state.sweep = 0; state.done[state.step] = false; clearInterval(sweepTimer); sweepTimer = null; save(); renderNav(); renderBrief(); renderLive(); say(`C${state.program} is now on program.`, ''); });
$('#tilt-button').addEventListener('click', () => startTilt());
$('#take-cue').addEventListener('click', checkCue);
$('#next-cue').addEventListener('click', () => { if (state.done[state.step]) stepTo(state.step + 1); });
onLangChange(render);
render();
