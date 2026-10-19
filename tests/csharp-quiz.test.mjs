import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, Runner, formatValue } from '../labs/csharp/interpreter.js';
import { World } from '../labs/csharp/world.js';
import { CHALLENGES, LEVELS, API } from '../labs/csharp/levels.js';
import { OPERATORS, TAGS, checkAnswer, explain, score, shownAnswer, resultType, gradeOf, band } from '../labs/csharp/quiz.js';
import dict from '../labs/csharp/i18n.js';

test('operators test: 35 questions, each with a known topic', () => {
  assert.equal(OPERATORS.length, 35);
  assert.deepEqual(OPERATORS.map(q => q.n), Array.from({ length: 35 }, (_, i) => i + 1));
  for (const q of OPERATORS) assert.ok(TAGS[q.tag], `${q.n}: ${q.tag}`);
  for (const T of Object.values(TAGS)) assert.ok(CHALLENGES.some(c => c.id === T.review), T.review);
});

test('operators test: the lab interpreter agrees with every answer of the Moodle bank', () => {
  for (const q of OPERATORS) {
    if (q.n === 29) continue; // a++ inside an expression: checked by hand below
    const c = compile(q.code);
    assert.equal(c.ok, true, `${q.n}: ${c.errors.map(e => e.message)}`);
    const r = new Runner(c.ast, new World()); r.runToEnd();
    const v = r.scopes[0].vars.get('result');
    assert.equal(v.type, resultType(q), `${q.n}`);
    assert.equal(checkAnswer(q, formatValue(v.value, v.type)).ok, true, `${q.n}: ${formatValue(v.value, v.type)} vs ${q.answer}`);
  }
  // 29: 5 >= 6 is false, so a++ == b runs: it compares the old value of a (5) with b (5).
  assert.equal(OPERATORS[28].answer, 'true');
});

test('operators test: every question has step-by-step reasoning that ends in the answer', () => {
  for (const q of OPERATORS) {
    const e = explain(q);
    assert.ok(e && e.steps.length >= 2, `${q.n}`);
    const last = q.n === 18 ? e.after.at(-1).split('= ').at(-1) : e.steps.at(-1);
    assert.equal(checkAnswer(q, last).ok, true, `${q.n}: ${last}`);
  }
  assert.deepEqual(explain(OPERATORS[20]).before, ['b++  →  b = 4']);
});

test('answers: flexible about format, strict about the value and the type', () => {
  const q = n => OPERATORS[n - 1];
  assert.equal(checkAnswer(q(5), 'false').ok, true);
  assert.equal(checkAnswer(q(5), 'False').ok, true);
  assert.equal(checkAnswer(q(5), ' false; ').ok, true);
  assert.equal(checkAnswer(q(5), 'true').ok, false);
  assert.ok(checkAnswer(q(5), 'no').note);
  assert.equal(checkAnswer(q(13), '6').ok, true);
  assert.equal(checkAnswer(q(13), '6.67').ok, false);
  assert.equal(checkAnswer(q(1), '7.0').ok, false);
  assert.ok(checkAnswer(q(1), '7.0').note);
  assert.equal(checkAnswer(q(7), '4.5').ok, true);
  assert.equal(checkAnswer(q(7), '4.5d').ok, true);
  assert.equal(checkAnswer(q(7), '4,5').ok, true);
  assert.ok(checkAnswer(q(7), '4,5').note);
  assert.equal(checkAnswer(q(15), '5.2').ok, true);
  assert.equal(checkAnswer(q(15), '5.2f').ok, true);
  assert.equal(checkAnswer(q(15), '5.3').ok, false);
  assert.equal(checkAnswer(q(16), '"Hola, Mundo"').ok, true);
  assert.equal(checkAnswer(q(16), 'Hola, Mundo').ok, true);
  assert.equal(checkAnswer(q(16), 'Hola,Mundo').ok, false);
  assert.equal(checkAnswer(q(31), '12').ok, true);
  assert.equal(checkAnswer(q(31), '3').ok, false);
  assert.equal(checkAnswer(q(1), '').empty, true);
  assert.equal(shownAnswer(q(16)), '"Hola, Mundo"');
  assert.equal(shownAnswer(q(15)), '5.2f');
  assert.equal(shownAnswer(q(7)), '4.5');
});

test('grades: out of 10, with school bands and a breakdown by topic', () => {
  assert.equal(gradeOf(35, 35), 10);
  assert.equal(gradeOf(18, 35), 5.1);
  assert.equal(band(4.9).label, 'Not passed');
  assert.equal(band(5).label, 'Pass');
  assert.equal(band(9.4).label, 'Excellent');
  const all = Object.fromEntries(OPERATORS.map(q => [q.n, q.answer]));
  const r = score(OPERATORS, all);
  assert.equal(r.right, 35); assert.equal(r.grade, 10); assert.equal(r.passed, true);
  assert.equal(r.byTag.reduce((s, b) => s + b.total, 0), 35);
  const none = score(OPERATORS, {});
  assert.equal(none.right, 0); assert.equal(none.passed, false);
});

test('the test is a level of its own, after Variables, with ++ and -= in the toolbox', () => {
  const ids = LEVELS.map(l => l.id);
  assert.deepEqual(ids, ids.map((_, i) => i));
  const lv = LEVELS.find(l => l.challenges.some(c => c.type === 'quiz'));
  assert.equal(LEVELS[lv.id - 1].name, 'Variables');
  assert.ok(API.some(a => a.level === lv.id && a.code.includes('++')));
  assert.ok(API.every(a => a.level <= LEVELS.at(-1).id));
});

test('quiz texts are translated', () => {
  const keys = ['Operators', 'Test', 'Operators test', 'Answer every question, then get your grade. You can repeat it.',
    ...Object.values(TAGS).flatMap(T => [T.label, T.tip]), 'Excellent', 'Very good', 'Good', 'Pass', 'Not passed',
    'In C# decimals are written with a dot: 4.5, not 4,5.', 'A bool can only be true or false.',
    'result is an int: whole numbers are written without a decimal point.', 'result is a double: the f is only for float.'];
  for (const k of keys) assert.ok(dict[k]?.ca && dict[k]?.es, k);
  const L = LEVELS.find(l => l.name === 'Operators');
  for (const k of [L.intro, L.challenges[0].goal, L.challenges[0].brief, L.challenges[0].hint]) assert.ok(dict[k]?.ca && dict[k]?.es, k.slice(0, 60));
});
