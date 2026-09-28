import { compile, Runner, CSharpError, formatValue } from './interpreter.js';
import { World, compare, random } from './world.js';
import { checkRequirements } from './levels.js';

export function prepare(challenge, seed = 1) {
  const s = challenge.setup(random(seed));
  const world = new World({ size: s.size || 8, maxHeight: s.maxHeight || 8, start: s.start || [0, 0], columns: s.columns || {}, ground: s.ground || {}, plans: s.plans || {} });
  world.viewHeight = s.viewHeight || Math.min(world.maxHeight, 4);
  return { world, target: s.target || {} };
}

// Final value of a top-level variable, as C# would print it.
function variables(runner) {
  const out = {};
  for (const v of runner?.scopes[0]?.vars.values() || []) out[v.name] = formatValue(v.value, v.type);
  return out;
}

// Decides whether a finished run completes the challenge.
// Returns { ok, shape, output, requirements, prediction }.
export function assess(challenge, { compiled, runner, world, target, prediction = null }) {
  const output = runner.output.map(o => o.text);
  const results = runner.results.filter(r => r.text);
  const shape = Object.keys(target).length ? compare(world, target) : null;
  const requirements = checkRequirements(challenge, compiled.stats);
  let outputCheck = null;
  if (challenge.expectOutput) {
    const want = challenge.expectOutput;
    outputCheck = { ok: want.length === output.length && want.every((l, i) => l === output[i]), want, got: output };
  }
  if (challenge.expectLast != null) {
    const got = results.at(-1)?.text ?? '';
    outputCheck = { ok: got === challenge.expectLast, want: [challenge.expectLast], got: [got], last: true };
  }
  if (challenge.expectTail) {
    const want = challenge.expectTail, got = results.slice(-want.length).map(r => r.text);
    outputCheck = { ok: got.length === want.length && want.every((w, i) => w === got[i]), want, got, tail: true };
  }
  let predictionCheck = null;
  if (challenge.question) {
    const actual = challenge.question.actual({ output, results, world, vars: variables(runner), runner });
    predictionCheck = { actual, chosen: prediction, ok: prediction != null && String(prediction) === String(actual) };
  }
  // Scene challenges (Code Lab 02) check how the objects moved, frame by frame.
  let sceneCheck = null;
  if (challenge.expectScene) sceneCheck = challenge.expectScene({ history: runner.history, scene: runner.scene, output, runner });
  // Predict and observe challenges are complete once the program has run: being wrong is part of learning.
  const ok = (!shape || shape.ok) && (!outputCheck || outputCheck.ok) && (!sceneCheck || sceneCheck.ok) && requirements.every(r => r.ok);
  return { ok, shape, output: outputCheck, requirements, prediction: predictionCheck, scene: sceneCheck };
}

// Runs a program without animation. Used for tests and for checking randomized challenges.
export function runHeadless(challenge, code, seed = 1, prediction = null) {
  const compiled = compile(code, { mode: challenge.mode });
  if (!compiled.ok) return { compiled, ok: false };
  const { world, target } = prepare(challenge, seed);
  const runner = new Runner(compiled.ast, world, { calcTowers: !!challenge.calcTowers, frames: challenge.frames ?? 60 });
  let error = null;
  try { runner.runToEnd(); }
  catch (e) { if (e instanceof CSharpError) error = e; else throw e; }
  const a = assess(challenge, { compiled, runner, world, target, prediction });
  return { compiled, runner, world, target, error, ...a, result: a.shape || { ok: true }, ok: !error && a.ok };
}

export function verifySeeds(challenge, code, seeds) {
  return seeds.map(seed => {
    const r = runHeadless(challenge, code, seed);
    return { seed, ok: !r.error && r.ok };
  });
}
