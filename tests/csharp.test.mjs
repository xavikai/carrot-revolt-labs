import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, Runner, formatValue } from '../labs/csharp/interpreter.js';
import { World } from '../labs/csharp/world.js';
import { CHALLENGES, assembleParsons, judge } from '../labs/csharp/levels.js';
import { runHeadless, verifySeeds } from '../labs/csharp/evaluate.js';

function run(code, world = new World()) {
  const c = compile(code);
  assert.equal(c.ok, true, c.errors.map(e => `${e.line}: ${e.code} ${e.message}`).join('\n'));
  const r = new Runner(c.ast, world);
  r.runToEnd();
  return r;
}
const out = code => run(code).output.map(o => o.text);
const errors = code => compile(code).errors.map(e => e.code);

test('every challenge solution passes, including extra random seeds', () => {
  for (const ch of CHALLENGES.filter(c => !c.sandbox && c.type !== 'classify')) {
    const r = runHeadless(ch, ch.solution, 7, ch.question?.answer);
    assert.equal(r.ok, true, `${ch.id}: ${r.error?.message || r.compiled.errors.map(e => e.message).join(', ') || JSON.stringify({ shape: r.shape, output: r.output, req: r.requirements })}`);
    if (ch.randomized) assert.ok(verifySeeds(ch, ch.solution, [11, 23, 42]).every(s => s.ok), ch.id);
  }
});

test('predict questions: the declared answer is what really happens, and it is one of the options', () => {
  for (const ch of CHALLENGES.filter(c => c.type === 'predict')) {
    const r = runHeadless(ch, ch.starter, 1, ch.question.answer);
    assert.equal(r.prediction.actual, ch.question.answer, ch.id);
    assert.ok(ch.question.options.includes(ch.question.answer), ch.id);
    assert.equal(r.prediction.ok, true, ch.id);
    const wrong = ch.question.options.find(o => o !== ch.question.answer);
    assert.equal(runHeadless(ch, ch.starter, 1, wrong).prediction.ok, false, ch.id);
  }
});

test('starters: create/fix/complete need work, observe/predict run as given', () => {
  for (const ch of CHALLENGES) {
    if (ch.type === 'parsons' || ch.type === 'classify') { assert.equal(ch.starter, ''); continue; }
    const c = compile(ch.starter, { mode: ch.mode });
    if (ch.type === 'observe' || ch.type === 'predict') { assert.equal(runHeadless(ch, ch.starter).error, null, ch.id); continue; }
    if (ch.type === 'complete') { assert.ok(c.errors.some(e => e.message === 'Fill in the blank ___'), ch.id); continue; }
    if (['1-3', '2-3', '0-7', 'n-5', 't-7', 'l-7', 'm-6', 'm-8', 'a-8'].includes(ch.id)) { assert.equal(c.ok, false, ch.id); continue; }
    assert.equal(c.ok, true, `${ch.id}: ${c.errors.map(e => e.message)}`);
    if (!ch.sandbox) assert.equal(runHeadless(ch, ch.starter, 3).ok, false, ch.id);
  }
});

test('parsons: distractors break the program and the lines alone solve it', () => {
  for (const ch of CHALLENGES.filter(c => c.type === 'parsons')) {
    const reversed = assembleParsons([...ch.parsons.lines].reverse());
    assert.equal(runHeadless(ch, reversed).ok, false, ch.id);
    const withDistractor = assembleParsons([...ch.parsons.lines.slice(0, -1), ch.parsons.distractors[0], ch.parsons.lines.at(-1)]);
    assert.equal(runHeadless(ch, withDistractor).ok, false, ch.id);
  }
});

test('the broken calculator shows the classic string + number trap', () => {
  assert.deepEqual(out('Console.WriteLine("2 + 3 = " + 2 + 3);'), ['2 + 3 = 23']);
});

test('drone.Build builds a tower and steps right, staying on the grid', () => {
  const w = new World();
  run('for (int i = 0; i < 10; i++) { drone.Build(1); }', w);
  assert.equal(w.columns.size, 8);
  assert.equal(w.column(7, 0).length, 3);
  assert.throws(() => run('drone.Build(9);'), /doesn't fit/);
  assert.throws(() => run('drone.Build(2 - 5);'), /negative/);
});

test('the sandbox pyramid runs without errors', () => {
  const ch = CHALLENGES.find(c => c.sandbox);
  const r = runHeadless(ch, ch.starter);
  assert.equal(r.error, null);
  assert.ok(r.world.blockCount() > 40);
});

test('integer division truncates, double division does not', () => {
  assert.deepEqual(out('int a = 7; Console.WriteLine(a / 2); double b = 7; Console.WriteLine(b / 2); Console.WriteLine(-7 / 2); Console.WriteLine(7 % 3);'), ['3', '3.5', '-3', '1']);
});

test('values print like C#', () => {
  assert.deepEqual(out('bool ok = 3 > 2; Console.WriteLine(ok); Console.WriteLine("n = " + 5 + 1); Console.WriteLine(0.1 + 0.2); float f = 1.1f; Console.WriteLine(f); Console.WriteLine(Color.Red); Console.WriteLine($"x={1 + 1}");'),
    ['True', 'n = 51', '0.30000000000000004', '1.1', 'Red', 'x=2']);
  assert.equal(formatValue(2, 'double'), '2');
});

test('the compiler reports type errors before anything runs', () => {
  assert.deepEqual(errors('int x = 2.5;'), ['CS0266']);
  assert.deepEqual(errors('float f = 2.5;'), ['CS0664']);
  assert.deepEqual(errors('int x = "3";'), ['CS0029']);
  assert.deepEqual(errors('Color c = "Red";'), ['CS0029']);
  assert.deepEqual(errors('int x = 1; if (x) { }'), ['CS0029']);
  assert.deepEqual(errors('bool b = 1 == "1";'), ['CS0019']);
  assert.deepEqual(errors('drone.Move(3);'), ['CS1503']);
  assert.deepEqual(errors('drone.MoveTo(1);'), ['CS1501']);
});

test('names, case sensitivity and scopes are checked', () => {
  assert.deepEqual(errors('drone.place(Color.Red);'), ['CS1061']);
  assert.deepEqual(errors('drone.Place(Color.red);'), ['CS0117']);
  assert.deepEqual(errors('y = 3;'), ['CS0103']);
  assert.deepEqual(errors('int a = 1; int a = 2;'), ['CS0128']);
  assert.deepEqual(errors('for (int i = 0; i < 3; i++) { } Console.WriteLine(i);'), ['CS0103']);
  assert.deepEqual(errors('int a; Console.WriteLine(a);'), ['CS0165']);
  assert.deepEqual(errors('int a; if (true) { a = 1; } else { a = 2; } Console.WriteLine(a);'), []);
  assert.deepEqual(errors('int a; if (true) { a = 1; } Console.WriteLine(a);'), ['CS0165']);
  assert.deepEqual(errors('break;'), ['CS0139']);
  assert.deepEqual(errors('drone.X = 3;'), ['CS0200']);
  assert.deepEqual(errors('Int n = 1;'), ['CS0246']);
});

test('syntax errors point to the right line', () => {
  const c = compile('drone.Move(Direction.Right)\ndrone.Place(Color.Red);');
  assert.equal(c.errors[0].code, 'CS1002');
  assert.equal(c.errors[0].line, 1);
  assert.equal(compile('for (int i = 0; i < 3; i++)\n{\n drone.Place();\n').errors[0].code, 'CS1513');
  assert.equal(compile('int x = 1;\nif (x = 2) { }').errors[0].line, 2);
  assert.equal(compile('Console.WriteLine("hi);').errors[0].code, 'CS1010');
});

test('loops, break and continue', () => {
  assert.deepEqual(out('for (int i = 0; i < 10; i++) { if (i == 4) break; if (i % 2 == 1) continue; Console.WriteLine(i); }'), ['0', '2']);
  assert.deepEqual(out('int n = 3; while (n > 0) { n--; } Console.WriteLine(n); int k = 0; do { k += 5; } while (k < 12); Console.WriteLine(k);'), ['0', '15']);
});

test('the step runner exposes conditions, line counts and scopes', () => {
  const c = compile('for (int i = 0; i < 2; i++)\n{\n    drone.Place(Color.Red);\n}');
  const r = new Runner(c.ast, new World());
  const events = [...r.run()];
  const conds = events.filter(e => e.kind === 'cond');
  assert.deepEqual(conds.map(e => e.value), [true, true, false]);
  assert.equal(conds[0].text, 'i < 2  →  0 < 2  →  true');
  assert.equal(r.lineCounts.get(3), 2);
  assert.equal(r.world.height(), 2);
});

test('runtime errors: leaving the grid, dividing by zero and endless loops', () => {
  const grid = compile('for (int i = 0; i < 9; i++) { drone.Move(Direction.Right); }');
  assert.throws(() => new Runner(grid.ast, new World()).runToEnd(), e => e.exception === 'DroneException' && e.line === 1);
  const div = compile('int z = 0;\nint y = 5 / z;');
  assert.throws(() => new Runner(div.ast, new World()).runToEnd(), e => e.exception === 'DivideByZeroException' && e.line === 2);
  const loop = compile('int i = 0;\nwhile (i < 5) { drone.Move(Direction.Right); drone.Move(Direction.Left); }');
  assert.throws(() => new Runner(loop.ast, new World(), { maxSteps: 500 }).runToEnd(), e => e.exception === 'TimeoutException');
});

test('a hard-coded answer fails the randomized challenge on other floors', () => {
  const ch = CHALLENGES.find(c => c.id === '3-5');
  const hard = runHeadless(ch, ch.solution, 5);
  assert.equal(hard.ok, true);
  const cols = [...hard.world.columns.entries()].map(([k, v]) => [k, v.length - v.filter(c => c === 'White').length]);
  const hardcoded = cols.map(([k, n]) => `drone.MoveTo(${k.split(',')[0]}, 0);` + ' drone.Place(Color.Blue);'.repeat(n)).join('\n');
  assert.equal(runHeadless(ch, hardcoded, 5).result.ok, true);
  assert.ok(verifySeeds(ch, hardcoded, [11, 23, 42]).some(s => !s.ok));
});

test('classify: the compiler/judge agrees with every expected answer', () => {
  for (const ch of CHALLENGES.filter(c => c.type === 'classify')) {
    for (const item of ch.classify.items) {
      const j = judge(ch.classify.judge, item.text);
      assert.equal(j.answer, item.answer, `${ch.id}: ${item.text} → ${j.answer} (${j.why})`);
      assert.ok(ch.classify.categories.includes(item.answer), ch.id);
      assert.ok(j.why.length > 5, ch.id);
    }
  }
});

test('calculator mode: one calculation per line, no semicolons, results with types', () => {
  const c = compile('// note\n2 + 3 * 4\n7 / 2\n7.0 / 2\n"3" + 4\nint age = 16\nage + 1\nage = age + 1\nage * 2', { mode: 'calc' });
  assert.equal(c.ok, true);
  const r = new Runner(c.ast, new World());
  r.runToEnd();
  assert.deepEqual(r.results.map(x => x.text), ['14', '3', '3.5', '"34"', 'age = 16', '17', 'age = 17', '34']);
  assert.deepEqual(r.results.slice(0, 4).map(x => x.type), ['int', 'int', 'double', 'string']);
  assert.equal(r.lineCounts.get(2), 1);
});

test('calculator mode: beginner-friendly errors', () => {
  const msg = src => compile(src, { mode: 'calc' }).errors[0];
  assert.match(msg('int player score = 10').message, /spaces/);
  assert.match(msg('int player score = 10').hint, /playerScore/);
  assert.match(msg('3,5').message, /point/);
  assert.equal(msg('True').code, 'CS0103');
  assert.equal(msg('Int bonus = 5').code, 'CS0246');
  assert.match(msg('2 3').hint, /operator/);
  assert.match(msg('if (true) 3').message, /not used in the calculator/);
});

test('Make 12 only accepts the numbers 3 and 4', () => {
  const ch = CHALLENGES.find(c => c.id === 'k-3');
  assert.equal(runHeadless(ch, '3 * 4').ok, true);
  assert.equal(runHeadless(ch, '4 + 4 + 4').ok, true);
  assert.equal(runHeadless(ch, '12').ok, false);
  assert.equal(runHeadless(ch, '6 * 2').ok, false);
});

test('strings: length, positions from 0, char, methods and runtime errors', () => {
  const c = compile('string w = "drone"\nw.Length\nw[0]\nw[w.Length - 1]\nw.ToUpper()\n"Blender".Substring(2, 3)\n"Blender".IndexOf("end")\n$"{w}!"', { mode: 'calc' });
  assert.equal(c.ok, true, c.errors.map(e => e.message).join());
  const r = new Runner(c.ast, new World()); r.runToEnd();
  assert.deepEqual(r.results.map(x => x.text), ['w = "drone"', '5', "'d'", "'e'", '"DRONE"', '"end"', '2', '"drone!"']);
  assert.deepEqual(r.results[5].textView, { text: 'Blender', from: 2, to: 5 });
  const err = src => { const x = compile(src, { mode: 'calc' }); return x.ok ? null : x.errors[0].code; };
  assert.equal(err("string c = 'Barcelona'"), 'CS1012');
  assert.equal(err('"x".length'), 'CS1061');
  assert.equal(err('"x".ToUpper'), 'CS0428');
  assert.equal(err('"x".Length()'), 'CS1955');
  const oob = compile('"abc"[3]', { mode: 'calc' });
  assert.throws(() => new Runner(oob.ast, new World()).runToEnd(), e => e.exception === 'IndexOutOfRangeException');
});

// ─── Methods ────────────────────────────────────────────────────────────────
test('methods: calls with parameters, return values, nesting and recursion', () => {
  assert.deepEqual(out(`Console.WriteLine(Area(3, 4));
Console.WriteLine(Square(Square(2)) + 1);
Console.WriteLine(Fact(5));
Hi("Ada");
int Area(int w, int d) { return w * d; }
int Square(int n) => n * n;
int Fact(int n)
{
    if (n <= 1) return 1;
    return n * Fact(n - 1);
}
void Hi(string name) { Console.WriteLine($"Hi {name}"); }`), ['12', '17', '120', 'Hi Ada']);
});

test('methods: a parameter is a copy, and a method has its own variables', () => {
  assert.deepEqual(out(`int x = 5;
Change(x);
Console.WriteLine(x);
void Change(int x) { x = 100; Console.WriteLine(x); }`), ['100', '5']);
});

test('methods: && only calls the right side when needed, return leaves loops', () => {
  assert.deepEqual(out(`bool b = false && Loud();
Console.WriteLine(First());
bool Loud() { Console.WriteLine("called"); return true; }
int First()
{
    for (int i = 0; i < 10; i++)
    {
        if (i == 3) return i;
    }
    return -1;
}`), ['3']);
});

test('methods: compiler errors for common mistakes', () => {
  assert.deepEqual(errors('int F(int a) { int b = a; }\nF(1);'), ['CS0161']);
  assert.deepEqual(errors('void F() { return 3; }\nF();'), ['CS0127']);
  assert.deepEqual(errors('int F() { return; }\nF();'), ['CS0126']);
  assert.deepEqual(errors('F(1, 2);\nvoid F(int a) { }'), ['CS1501']);
  assert.deepEqual(errors('F("3");\nvoid F(int a) { }'), ['CS1503']);
  assert.deepEqual(errors('F();\nConsole.WriteLine(r);\nvoid F() { int r = 1; }'), ['CS0103']);
  assert.deepEqual(errors('int n = 1;\nF();\nvoid F() { Console.WriteLine(n); }'), ['LAB']);
  assert.deepEqual(errors('int x = F;\nint F() { return 1; }'), ['CS0428']);
  assert.deepEqual(errors('void F() { }\nvoid F() { }\nF();'), ['CS0128']);
  assert.deepEqual(errors('int v = Show();\nvoid Show() { }'), ['CS0029']);
  const w = compile('void Unused() { }\nint F() { return 1; Console.WriteLine(2); }\nF();').warnings.map(x => x.code);
  assert.deepEqual(w.sort(), ['CS0162', 'CS8321']);
});

test('methods: stepping yields call and return events with the call depth', () => {
  const c = compile('Tower(2);\nvoid Tower(int h)\n{\n    drone.Build(h);\n}');
  const r = new Runner(c.ast, new World());
  const evs = [...r.run()].map(e => `${e.kind}:${e.line}:${e.depth}`);
  assert.deepEqual(evs, ['line:1:0', 'call:2:1', 'line:4:1', 'return:1:0']);
});

test('methods: endless recursion stops with a StackOverflowException', () => {
  const c = compile('F(0);\nvoid F(int n) { F(n + 1); }');
  const r = new Runner(c.ast, new World());
  assert.throws(() => r.runToEnd(), e => e.exception === 'StackOverflowException');
});

// ─── Arrays ─────────────────────────────────────────────────────────────────
test('arrays: initializers, new, indexing, Length, foreach and printing', () => {
  assert.deepEqual(out(`int[] h = { 3, 5, 2 };
Console.WriteLine(h.Length);
Console.WriteLine(h[1]);
Console.WriteLine(h);
int[] f = new int[3];
f[1] = 4; f[2]++; f[0] += 2;
Console.WriteLine(f[0] + f[1] + f[2]);
int total = 0;
foreach (int x in h) { total += x; }
Console.WriteLine(total);
string[] names = new string[2];
Console.WriteLine("[" + names[0] + "]");
Color[] cs = new Color[] { Color.Red, Color.Blue };
Console.WriteLine(cs[1]);`), ['3', '5', 'System.Int32[]', '7', '10', '[]', 'Blue']);
});

test('arrays: passed to a method, the method changes the same array', () => {
  assert.deepEqual(out(`int[] a = { 1, 2 };
Double(a);
Console.WriteLine(a[0] + a[1]);
void Double(int[] v) { for (int i = 0; i < v.Length; i++) v[i] = v[i] * 2; }`), ['6']);
});

test('arrays: one position too far is an IndexOutOfRangeException at that line', () => {
  const c = compile('int[] h = { 3, 1, 4 };\nfor (int i = 0; i <= h.Length; i++)\n{\n    drone.Build(h[i]);\n}');
  const r = new Runner(c.ast, new World());
  assert.throws(() => r.runToEnd(), e => e.exception === 'IndexOutOfRangeException' && e.line === 4 && /positions 0 to 2/.test(e.hint));
});

test('arrays: compiler errors for common mistakes', () => {
  assert.deepEqual(errors('var a = { 1, 2 };'), ['CS0820']);
  assert.deepEqual(errors('int a = { 1, 2 };'), ['CS0622']);
  assert.deepEqual(errors('int[] a = { 1, 2 };\nint b = a;'), ['CS0029']);
  assert.deepEqual(errors('int[] a = { 1, 2 };\nforeach (int x in a) { x = 3; }'), ['CS1656']);
  assert.deepEqual(errors('string s = "hi";\ns[0] = \'H\';'), ['CS0200']);
  assert.deepEqual(errors('int[5] a;'), ['CS0270']);
  assert.deepEqual(errors('int[] a = new int[3];\na.Length = 4;'), ['CS0200']);
  assert.deepEqual(errors('int n = 5;\nforeach (int x in n) { }'), ['CS1579']);
  assert.deepEqual(errors('int[] a;\na[0] = 1;'), ['CS0165']);
});

test('arrays: conditions show the position first, then the value', () => {
  const c = compile('int[] h = { 3, 7 };\nint i = 1;\nif (h[i] > 5) { }');
  const r = new Runner(c.ast, new World());
  const cond = [...r.run()].find(e => e.kind === 'cond');
  assert.equal(cond.text, 'h[i] > 5  →  h[1] > 5  →  7 > 5  →  true');
});

test('drone.Scan gives the plan of the current row as a new int[]', () => {
  const w = new World({ plans: { 0: [3, 0, 2], 2: [1] } });
  const r = run(`int[] a = drone.Scan();
a[0] = 9;
Console.WriteLine(drone.Scan()[0] + " " + a.Length);
drone.MoveTo(0, 2);
Console.WriteLine(drone.Scan().Length);
drone.MoveTo(0, 1);
Console.WriteLine(drone.Scan().Length);`, w);
  assert.deepEqual(r.output.map(o => o.text), ['3 3', '1', '0']);
});
