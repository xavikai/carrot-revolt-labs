// Video & 3D Lab: video latents, fps, motion, i2v / flf2v, memory, length, Wan 2.2 experts, image to 3D; every step can be solved.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, execute } from '../labs/comfyui/engine.js';
import { STAGES, TEMPLATES, GRAPHS as G, outputExtra } from '../labs/comfyui-video/lab.js';

const set = (g, id, k, v) => { g.nodes.find(n => n.id === id).widgets[k] = v; return g; };
const run = g => { const r = execute(g); if (!r.ok) return { entries: [], flags: {} }; if (r.runtime) return { entries: [], flags: { [`rt_${r.runtime.msg}`]: true } };
  const entries = Object.entries(r.outputs).filter(([, x]) => x).flatMap(([id, img]) => { const n = g.nodes.find(x => x.id === id); if (!['SaveAnimatedWEBP', 'SaveGLB', 'SaveImage', 'PreviewImage'].includes(n.type)) return []; const ex = outputExtra(img, g); return ex.video || ex.mesh ? [{ graph: g, ...ex }] : []; });
  return { entries, flags: {} }; };
const one = g => run(g).entries[0];
const v = g => one(g)?.video, m = g => one(g)?.mesh;

test('every starter, solution and template is a valid workflow', () => {
  for (const s of STAGES) for (const st of s.steps) for (const make of [st.starter, st.solution]) { const r = validate(make()); assert.ok(r.ok, `${s.id}: ${st.title.en} ${JSON.stringify(r.errors)}`); }
  for (const t of TEMPLATES) { const g = t.make(); assert.ok(validate(g).ok, t.id); assert.ok(one(g), `template ${t.id} gives a result`); }
});
test('video numbers, motion and camera', () => {
  assert.equal(v(G.t2v({ still: true })), undefined, 'an image latent is not a video');
  const a = v(G.t2v({ len: 81 })); assert.equal(a.frames, 81); assert.equal(a.seconds, 5.06); assert.ok(a.motion && a.camera && !a.drift && !a.flicker);
  assert.equal(v(set(G.t2v({ len: 81 }), 'save', 'fps', 30)).seconds, 2.7);
  const still = v(G.t2v({ text: 'a cat in the snow, detailed' })); assert.ok(!still.motion && !still.camera);
  assert.ok(v(G.t2v({ len: 129 })).drift);
  assert.ok(v(G.t2v({ steps: 8 })).flicker);
  assert.ok(v(G.t2v({ w: 1280, h: 720 })).tooBig, '1.3B at 720p breaks');
});
test('image to video, first-last frame, errors', () => {
  assert.equal(run(G.i2v({ unet: 'wan2.1_t2v_1.3B_fp16.safetensors', vision: false })).flags.rt_shape, true);
  const nv = v(G.i2v({ vision: false })); assert.ok(nv.keepsStart && nv.identity < 1);
  assert.ok(v(G.i2v()).identity >= 1);
  const f = v(G.flf()); assert.ok(f.reachesEnd && f.keepsStart);
  assert.equal(run(G.t2v({ unet: 'wan2.1_t2v_14B_fp8_e4m3fn.safetensors', w: 1280, h: 720, len: 121 })).flags.rt_oom, true);
  assert.ok(v(G.t2v({ unet: 'wan2.1_t2v_14B_fp8_e4m3fn.safetensors', len: 81 })));
});
test('Wan 2.2 experts', () => {
  assert.equal(v(G.wan22()).experts, 'ok'); assert.ok(!v(G.wan22()).flicker);
  assert.equal(v(G.wan22('wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors', 'wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors')).experts, 'reversed');
});
test('image to 3D', () => {
  const good = m(G.h3d()); assert.ok(good.ok && !good.slab && !good.blocky && !good.holes && !good.bloated);
  const room = m(G.h3d({ image: 'toy_robot_room.png', octree: 64 })); assert.ok(room.slab && room.blocky);
  assert.ok(!m(G.h3d({ image: 'toy_robot_room.png', rembg: true })).slab);
  assert.ok(m(G.h3d({ threshold: .2 })).bloated); assert.ok(m(G.h3d({ threshold: .98 })).holes);
});
const TRIES = {
  't2v:1': [set(G.t2v({ len: 81 }), 'save', 'fps', 30)],
  'limits:2': [],
};
test('every step can be completed', () => {
  for (const s of STAGES) s.steps.forEach((st, i) => {
    const g = st.solution(), runs = [st.starter(), ...(TRIES[`${s.id}:${i}`] || []), g].map(run);
    const history = runs.flatMap(r => r.entries), flags = Object.assign({ saved: true }, ...runs.map(r => r.flags));
    st.goals.forEach(gl => { if (!gl.optional) assert.ok(gl.test(g, { flags, history }), `${s.id} ${i + 1}: ${gl.text.en}`); });
  });
});
test('the starters are not already solved', () => {
  for (const s of STAGES) s.steps.forEach((st, i) => { const g = st.starter(); const r = run(g); assert.ok(st.goals.some(gl => !gl.optional && !gl.test(g, { flags: {}, history: [] })), `${s.id} ${i + 1}`); void r; });
});
