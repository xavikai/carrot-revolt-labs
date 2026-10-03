// ComfyUI Lab: the simulator follows ComfyUI's rules, and every step can be solved.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultGraph, makeNode, makeLink, connect, canConnect, validate, cacheKeys, execute, parsePrompt, convergence, effects, describeRecipe } from '../labs/comfyui/engine.js';
import { STAGES } from '../labs/comfyui/lessons.js';

const set = (g, id, k, v) => { g.nodes.find(n => n.id === id).widgets[k] = v; return g; };
test('the default workflow is valid and runs in dependency order', () => {
  const g = defaultGraph(), v = validate(g);
  assert.ok(v.ok); assert.equal(v.order.at(-1), 'save');
  assert.ok(v.order.indexOf('sampler') > v.order.indexOf('pos') && v.order.indexOf('decode') > v.order.indexOf('sampler'));
  const r = execute(g); assert.equal(r.outputs.save.kind, 'generated'); assert.equal(r.outputs.save.recipe.seed, 156680208700286);
});
test('missing inputs, no outputs and wrong types are refused like ComfyUI', () => {
  const g = defaultGraph(); g.links = g.links.filter(l => l.input !== 'vae');
  assert.deepEqual(validate(g).errors, [{ node: 'decode', msg: 'missing', input: 'vae' }]);
  const none = defaultGraph(); none.nodes = none.nodes.filter(n => n.id !== 'save'); assert.equal(validate(none).errors[0].msg, 'noOutputs');
  assert.equal(canConnect(defaultGraph(), makeLink('ckpt', 0, 'pos', 'clip')), false, 'MODEL into clip');
});
test('an input takes one wire: a new link replaces the old one', () => {
  const g = defaultGraph(); assert.ok(connect(g, makeLink('neg', 0, 'sampler', 'positive')));
  assert.equal(g.links.filter(l => l.to === 'sampler' && l.input === 'positive').length, 1);
});
test('bypass passes the data through; mute removes the node', () => {
  const g = defaultGraph(); g.nodes.push(makeNode('LoraLoader', 0, 0, {}, 'lora'));
  for (const l of [['ckpt', 0, 'lora', 'model'], ['ckpt', 1, 'lora', 'clip'], ['lora', 0, 'sampler', 'model'], ['lora', 1, 'pos', 'clip'], ['lora', 1, 'neg', 'clip']]) connect(g, makeLink(...l));
  assert.equal(execute(g).outputs.save.recipe.model.loras.length, 1);
  g.nodes.find(n => n.id === 'lora').mode = 4; assert.equal(execute(g).outputs.save.recipe.model.loras.length, 0);
  g.nodes.find(n => n.id === 'lora').mode = 2; assert.equal(validate(g).ok, false);
});
test('cache: only changed nodes and what depends on them run again', () => {
  const a = defaultGraph(), b = set(defaultGraph(), 'sampler', 'steps', 30);
  const ka = cacheKeys(a, validate(a).order), kb = cacheKeys(b, validate(b).order);
  assert.equal(ka.ckpt, kb.ckpt); assert.equal(ka.pos, kb.pos); assert.notEqual(ka.sampler, kb.sampler); assert.notEqual(ka.decode, kb.decode);
});
test('prompt weights, LoRA family and ControlNet family', () => {
  assert.equal(parsePrompt('a (red:1.4) robot').weights.red, 1.4);
  assert.equal(parsePrompt('a (cat) on the beach').weights.cat, 1.1);
  const g = set(defaultGraph(), 'ckpt', 'ckpt_name', 'sd_xl_base_1.0.safetensors'); g.nodes.push(makeNode('LoraLoader', 0, 0, {}, 'lora'));
  for (const l of [['ckpt', 0, 'lora', 'model'], ['ckpt', 1, 'lora', 'clip'], ['lora', 0, 'sampler', 'model'], ['lora', 1, 'pos', 'clip'], ['lora', 1, 'neg', 'clip']]) connect(g, makeLink(...l));
  const r = execute(g); assert.equal(r.warnings[0].msg, 'loraArch'); assert.equal(r.outputs.save.recipe.model.loras[0].strength, 0);
  const c = STAGES.find(s => s.id === 'controlnet').steps[1].solution(); set(c, 'ckpt', 'ckpt_name', 'sd_xl_base_1.0.safetensors');
  assert.match(execute(c).runtime.detail, /mat1 and mat2 shapes/);
});
test('steps converge, CFG burns, the native size matters, the right ControlNet map matters', () => {
  assert.ok(convergence(4, 'euler', 'normal') < .6 && convergence(25, 'euler', 'normal') > .95);
  assert.ok(convergence(10, 'dpmpp_2m', 'karras') > convergence(10, 'euler', 'normal'));
  const fx = (mut) => { const g = mut(defaultGraph()); return effects(describeRecipe(execute(g).outputs.save.recipe)); };
  assert.equal(fx(g => g).burn, 0); assert.ok(fx(g => set(g, 'sampler', 'cfg', 18)).burn > 0);
  assert.equal(fx(g => set(set(g, 'latent', 'width', 1024), 'latent', 'height', 1024)).duplicates, 2);
  const cn = STAGES.find(s => s.id === 'controlnet').steps[1].solution(), amount = g => effects(describeRecipe(execute(g).outputs.save.recipe)).control[0].amount;
  const right = amount(cn); set(cn, 'cnl', 'control_net_name', 'control_v11f1p_sd15_depth.pth'); assert.ok(right > .9 && amount(cn) < .4);
});
test('every step: the solution is valid and runs; starters and texts are complete', () => {
  for (const s of STAGES) s.steps.forEach((st, i) => {
    const g = st.solution(), r = execute(g); assert.ok(r.ok && !r.runtime, `${s.id} ${i + 1}`);
    assert.ok(st.starter().nodes.length);
    for (const t of [st.title, st.task, st.concept, st.note, ...st.how, ...st.goals.map(x => x.text)]) for (const l of ['en', 'ca', 'es']) assert.ok(t[l], `${s.id} ${i + 1} missing ${l}`);
  });
});
