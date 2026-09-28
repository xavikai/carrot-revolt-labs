import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, Runner } from '../labs/csharp/interpreter.js';
import { World } from '../labs/csharp/world.js';
import { CHALLENGES } from '../labs/csharp/levels-objects.js';
import { runHeadless, verifySeeds } from '../labs/csharp/evaluate.js';

function run(code, frames = 0) {
  const c = compile(code);
  assert.equal(c.ok, true, c.errors.map(e => `${e.line}: ${e.code} ${e.message}`).join('\n'));
  const r = new Runner(c.ast, new World(), { frames });
  r.runToEnd();
  return r;
}
const out = (code, frames) => run(code, frames).output.map(o => o.text);
const errors = code => compile(code).errors.map(e => e.code);

test('Code Lab 02: every solution passes (and randomized ones on other worlds)', () => {
  for (const ch of CHALLENGES.filter(c => !c.sandbox)) {
    const r = runHeadless(ch, ch.solution, 7, ch.question?.answer);
    assert.equal(r.ok, true, `${ch.id}: ${r.error?.message || r.compiled.errors.map(e => e.message).join(', ') || JSON.stringify({ out: r.output, scene: r.scene, req: r.requirements })}`);
    if (ch.randomized) assert.ok(verifySeeds(ch, ch.solution, [11, 23, 42]).every(s => s.ok), ch.id);
  }
});

test('Code Lab 02: starters need work; predictions match what really happens', () => {
  for (const ch of CHALLENGES.filter(c => !c.sandbox)) {
    if (ch.type === 'observe') { assert.equal(runHeadless(ch, ch.starter).error, null, ch.id); continue; }
    if (ch.type === 'predict') {
      const r = runHeadless(ch, ch.starter, 1, ch.question.answer);
      assert.equal(r.prediction.actual, ch.question.answer, ch.id);
      assert.ok(ch.question.options.includes(ch.question.answer), ch.id);
      continue;
    }
    if (ch.type === 'parsons') continue;
    const r = runHeadless(ch, ch.starter, 3);
    assert.equal(r.ok, false, `${ch.id} is solved by its starter`);
  }
  for (const ch of CHALLENGES.filter(c => c.sandbox)) assert.equal(runHeadless(ch, ch.starter).error, null, ch.id);
});

test('objects are shared through references; structs are copied', () => {
  assert.deepEqual(out(`B a = new B();
a.n = 3;
B b = a;
b.n = 7;
Vector3 v = new Vector3(1f, 0f, 0f);
Vector3 w = v;
w.x = 5f;
Console.WriteLine(a.n + " " + v.x + " " + (a == b) + " " + (new B() == new B()));
class B { public int n; }`), ['7 1 True False']);
});

test('constructors, field initializers, base constructors and virtual dispatch', () => {
  assert.deepEqual(out(`List<Animal> all = new List<Animal> { new Animal("a"), new Dog() };
foreach (Animal x in all) { x.Speak(); x.Name(); }
class Animal
{
    public string name = "?";
    public Animal(string n) { name = n; }
    public virtual void Speak() { Console.WriteLine(name + " ..."); }
    public void Name() { Console.WriteLine("animal"); }
}
class Dog : Animal
{
    public Dog() : base("rex") { }
    public override void Speak() { Console.WriteLine(name + " woof"); }
    public void Name() { Console.WriteLine("dog"); }
}`), ['a ...', 'animal', 'rex woof', 'animal']);
});

test('lists: Add, Remove, indexer, Count, foreach, and changing a list inside foreach', () => {
  assert.deepEqual(out(`List<int> xs = new List<int> { 1, 2, 3 };
xs.Add(4); xs.Remove(2); xs[0] = 9;
Console.WriteLine(xs.Count + " " + xs[0] + " " + xs.Contains(2) + " " + xs.IndexOf(4));`), ['3 9 False 2']);
  const c = compile('List<int> xs = new List<int> { 1, 2 };\nforeach (int x in xs) { xs.Add(x); }');
  assert.throws(() => new Runner(c.ast, new World()).runToEnd(), e => e.exception === 'InvalidOperationException');
});

test('null: NullReferenceException at runtime, CS0037 for structs', () => {
  const c = compile('B b = null;\nConsole.WriteLine(b.n);\nclass B { public int n; }');
  assert.throws(() => new Runner(c.ast, new World()).runToEnd(), e => e.exception === 'NullReferenceException' && e.line === 2);
  assert.deepEqual(errors('Vector3 v = null;'), ['CS0037']);
});

test('compiler errors of objects: private fields, CS1612, override rules, order of the file', () => {
  assert.deepEqual(errors('B b = new B();\nb.n = 1;\nclass B { int n; }'), ['CS0122']);
  assert.deepEqual(errors('class Ball : MonoBehaviour\n{\n    void Update() { transform.position.y = 0f; }\n}'), ['CS1612']);
  assert.deepEqual(errors('class A { public void F() { } }\nclass C : A { public override void F() { } }'), ['CS0506']);
  assert.deepEqual(errors('class A { }\nint x = 1;'), ['CS8803']);
  assert.deepEqual(errors('B b = new B(1);\nclass B { }'), ['CS1729']);
  assert.deepEqual(errors('Vector3 v = new Vector3(1.5, 0, 0);'), ['CS1503']);
  assert.deepEqual(errors('int x = 1;\nclass B { public void F() { Console.WriteLine(x); } }'), ['CS0103']);
});

test('Update loop: Start once, Update every frame, positions recorded with Time.deltaTime', () => {
  const r = run(`Scene.Add(new M());
class M : MonoBehaviour
{
    public int starts;
    void Start() { starts++; transform.position = new Vector3(0f, 1f, 0f); }
    void Update() { transform.position += Vector3.right * 2f * Time.deltaTime; }
}`, 20);
  assert.equal(r.history.length, 20);
  assert.ok(Math.abs(r.history.at(-1)[0].x - 2) < 1e-4);
  assert.equal(r.scene[0].f.starts, 1);
});
