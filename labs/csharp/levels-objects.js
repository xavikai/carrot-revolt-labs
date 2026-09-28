// Code Lab 02 · Objects (towards Unity). Same app and interpreter as Code Lab 01.
import { buildChallenges } from './levels.js';
import dictionary from './i18n-objects.js';
export { dictionary };

const SIZE = 8;
const repeat = (color, n) => Array(n).fill(color);
function fill(fn) {
  const t = {};
  for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) { const c = fn(x, z); if (c && c.length) t[`${x},${z}`] = c; }
  return t;
}
const towers = list => Object.fromEntries(list.map(([h, c], x) => [`${x},0`, Array.isArray(c) ? c : repeat(c || 'White', h)]).filter(([, v]) => v.length));
const SCENE = () => ({ size: 8, maxHeight: 8, viewHeight: 5, target: {} });

// ─── Scene analysis (positions recorded every frame) ─────────────────────────
const track = (history, i = 0) => history.map(f => f[i]).filter(Boolean);
export function bounces(history, i = 0) {
  const t = track(history, i), out = [];
  for (let k = 1; k < t.length - 1; k++) if (t[k].y <= 0.05 && t[k + 1].y > t[k].y + 1e-4) out.push(k);
  return out;
}
export function peaks(history, i = 0) {
  const t = track(history, i), out = [];
  for (let k = 1; k < t.length - 1; k++) if (t[k].y > 0.1 && t[k].y >= t[k - 1].y && t[k].y > t[k + 1].y) out.push(t[k].y);
  return out;
}
const last = (history, i = 0) => track(history, i).at(-1);
const near = (a, b, e = 0.06) => Math.abs(a - b) <= e;

export const API = [
  { level: 0, code: 'class Building\n{\n    public int floors;\n}', text: 'A class is a blueprint: it says which data (fields) every object of that kind has. Classes go at the end of the file, after the main program.' },
  { level: 0, code: 'Building a = new Building();', text: '<code>new</code> builds an object from the blueprint. Each object has its own copy of the fields: <code>a.floors = 3;</code>' },
  { level: 0, code: 'public Building(int f)\n{\n    floors = f;\n}', text: 'A constructor: it runs when the object is created with <code>new Building(3)</code>. It has the name of the class and no return type.' },
  { level: 0, code: 'public void Build()\n{\n    \n}', text: 'A method inside a class: every object can run it with its own fields. <code>a.Build();</code>' },
  { level: 1, code: 'Building b = a;', text: 'For a class, the variable holds an arrow to the object, not the object. Now a and b point to the same object.' },
  { level: 1, code: 'Building c = null;\nif (c != null) { }', text: '<code>null</code>: an arrow to nothing. Using it gives a NullReferenceException, so check it first.' },
  { level: 2, code: 'List<int> heights = new List<int>();', text: 'A list: like an array, but it can grow and shrink. <code>Add</code>, <code>Remove</code>, <code>RemoveAt</code>, <code>Count</code>, <code>[i]</code>.' },
  { level: 2, code: 'foreach (Building b in city)\n{\n    \n}', text: 'Goes through every item of a list. Don\'t Add or Remove items of that list inside the loop.' },
  { level: 3, code: 'Vector3 p = new Vector3(1f, 0f, 2f);', text: 'A Vector3 holds x, y and z (floats: write 1.5f). It is a struct: assigning it makes a copy.' },
  { level: 3, code: 'Vector3.up * 2f + Vector3.right', text: 'Vectors can be added, subtracted and multiplied by a number. Also <code>Vector3.zero</code>, <code>.magnitude</code>, <code>Vector3.Distance(a, b)</code>.' },
  { level: 4, code: 'class Ball : MonoBehaviour\n{\n    void Update()\n    {\n        \n    }\n}', text: 'A script like in Unity. <code>Scene.Add(new Ball());</code> puts it in the scene; then the lab calls <code>Start()</code> once and <code>Update()</code> every frame.' },
  { level: 4, code: 'transform.position += velocity * Time.deltaTime;', text: '<code>Time.deltaTime</code> is the time of one frame (0.05 s). Multiplying by it turns "units per second" into "units this frame".' },
  { level: 5, code: 'class SuperBall : Ball\n{\n    \n}', text: 'Inheritance: a SuperBall is a Ball, with everything a Ball has. It can add fields and methods.' },
  { level: 5, code: 'public virtual float Bounce() { … }\npublic override float Bounce() { … }', text: '<code>virtual</code> in the base class allows a child class to replace the method with <code>override</code>.' },
];

export const LEVELS = [
  {
    id: 0, name: 'Classes and objects', concept: 'Blueprints',
    intro: 'A class is a blueprint and an object is something built from it. Each object keeps its own data.',
    challenges: [
      {
        id: 'o-1', type: 'observe', title: 'One blueprint, two buildings',
        goal: 'Step through and watch the HEAP in the Memory panel: two objects appear.',
        brief: '<p>At the end of the file, <code>class Building</code> is a <b>blueprint</b>: every building has <code>floors</code> and a <code>roof</code> (its <b>fields</b>). <code>new Building()</code> builds an <b>object</b> from it. Each object has its own fields: <code>a.floors</code> and <code>b.floors</code> are different boxes.</p><p>In Memory, the objects live in the <b>heap</b>, and the variables <code>a</code> and <code>b</code> hold an <b>arrow</b> to them (→ #1).</p>',
        hint: 'Watch how each object gets a number (#1, #2) and a colour.',
        starter: `Building a = new Building();
a.floors = 3;
a.roof = Color.Red;

Building b = new Building();
b.floors = 5;
b.roof = Color.Blue;

drone.Build(a.floors, a.roof);
drone.Build(b.floors, b.roof);

class Building
{
    public int floors;
    public Color roof;
}
`,
        labels: true,
        setup: () => ({ size: 6, maxHeight: 8, viewHeight: 5, target: {} }),
      },
      {
        id: 'o-2', type: 'predict', noDrone: true, title: 'Each object has its own fields',
        goal: 'Predict what the Console will print.',
        brief: '<p>Two objects from the same class. Changing the fields of one of them…</p>',
        starter: `Building a = new Building();
Building b = new Building();
a.floors = 4;
b.floors = 2;
a.floors = a.floors + b.floors;
Console.WriteLine(a.floors + " " + b.floors);

class Building
{
    public int floors;
}
`,
        question: {
          prompt: 'What will the Console print?', options: ['6 2', '6 6', '4 2'], answer: '6 2',
          actual: ({ output }) => output[0],
          explain: 'a and b are two different objects, each with its own floors. Only a changed: 4 + 2 = 6. b still has 2.',
        },
        setup: () => ({ size: 6, target: {} }),
      },
      {
        id: 'o-3', type: 'fix', title: 'Private by default',
        goal: 'Build a Green tower of 4 using the Tower object.',
        brief: '<p>In C#, the fields of a class are <b>private</b> unless you write <code>public</code>: only the class itself can use them. Read the compiler error (CS0122).</p>',
        hint: 'public int height; and public Color color;',
        starter: `Tower t = new Tower();
t.height = 4;
t.color = Color.Green;
drone.Build(t.height, t.color);

class Tower
{
    int height;
    Color color;
}
`,
        solution: `Tower t = new Tower();
t.height = 4;
t.color = Color.Green;
drone.Build(t.height, t.color);

class Tower
{
    public int height;
    public Color color;
}`,
        labels: true,
        setup: () => ({ size: 6, maxHeight: 8, viewHeight: 5, target: towers([[4, 'Green']]) }),
      },
      {
        id: 'o-4', type: 'complete', title: 'A constructor',
        goal: 'Complete the constructor so each tower gets the height and colour given to new.',
        brief: '<p>Setting every field by hand after <code>new</code> is long and easy to forget. A <b>constructor</b> is a special method with the name of the class and no return type: it runs when the object is created, with the values between the brackets of <code>new Tower(3, Color.Red)</code>.</p>',
        hint: 'height = h;  and  color = c;',
        starter: `Tower a = new Tower(3, Color.Red);
Tower b = new Tower(6, Color.Blue);
drone.Build(a.height, a.color);
drone.Build(b.height, b.color);

class Tower
{
    public int height;
    public Color color;

    public Tower(int h, Color c)
    {
        height = ___;
        color = ___;
    }
}
`,
        solution: `Tower a = new Tower(3, Color.Red);
Tower b = new Tower(6, Color.Blue);
drone.Build(a.height, a.color);
drone.Build(b.height, b.color);

class Tower
{
    public int height;
    public Color color;

    public Tower(int h, Color c)
    {
        height = h;
        color = c;
    }
}`,
        labels: true,
        setup: () => ({ size: 6, maxHeight: 8, viewHeight: 6, target: towers([[3, 'Red'], [6, 'Blue']]) }),
      },
      {
        id: 'o-5', title: 'Objects that act',
        goal: 'Write the method Build(): White floors, the roof colour on top, then one step right.',
        brief: '<p>An object can also <b>do</b> things: a method written inside the class works with the fields of the object that runs it. <code>small.Build()</code> uses the floors of <code>small</code>, and <code>big.Build()</code> those of <code>big</code>.</p>',
        hint: 'public void Build() { for (int i = 0; i < floors; i++) { drone.Place(Color.White); } drone.Place(roof); drone.Move(Direction.Right); }',
        starter: `House small = new House(1, Color.Red);
House big = new House(4, Color.Blue);
small.Build();
big.Build();

class House
{
    public int floors;
    public Color roof;

    public House(int f, Color r)
    {
        floors = f;
        roof = r;
    }

    // Write the method Build() here.
}
`,
        solution: `House small = new House(1, Color.Red);
House big = new House(4, Color.Blue);
small.Build();
big.Build();

class House
{
    public int floors;
    public Color roof;

    public House(int f, Color r)
    {
        floors = f;
        roof = r;
    }

    public void Build()
    {
        for (int i = 0; i < floors; i++)
        {
            drone.Place(Color.White);
        }
        drone.Place(roof);
        drone.Move(Direction.Right);
    }
}`,
        requires: [{ feature: 'classMethod', label: 'Write a method in the class' }],
        labels: true,
        setup: () => ({ size: 6, maxHeight: 8, viewHeight: 5, target: towers([[0, ['White', 'Red']], [0, ['White', 'White', 'White', 'White', 'Blue']]]) }),
      },
    ],
  },
  {
    id: 1, name: 'References and null', concept: 'Arrows',
    intro: 'A class variable does not hold the object: it holds an arrow to it. Two variables can point to the same object, or to nothing (null).',
    challenges: [
      {
        id: 'r-1', type: 'predict', noDrone: true, title: 'Two names, one object',
        goal: 'Predict what the Console will print.',
        brief: '<p>Remember <code>int b = a;</code> in Code Lab 01: it copied the value. Is it the same with objects? Predict, then step through and look at the arrows in Memory.</p>',
        starter: `Building a = new Building();
a.floors = 3;
Building b = a;
b.floors = 7;
Console.WriteLine(a.floors);

class Building
{
    public int floors;
}
`,
        question: {
          prompt: 'What will the Console print?', options: ['3', '7', 'An error'], answer: '7',
          actual: ({ output }) => output[0],
          explain: 'Building b = a; copies the arrow, not the object. There is only one Building (#1), with two names. Changing b.floors changes the same object that a points to.',
        },
        setup: () => ({ size: 6, target: {} }),
      },
      {
        id: 'r-2', type: 'predict', noDrone: true, title: 'A method changes the object',
        goal: 'Predict what the Console will print.',
        brief: '<p>In Code Lab 01 a parameter was a copy: changing it inside the method changed nothing outside. What happens when the parameter is an object?</p>',
        starter: `Building a = new Building();
a.floors = 3;
AddFloor(a);
Console.WriteLine(a.floors);

void AddFloor(Building x)
{
    x.floors = x.floors + 1;
}

class Building
{
    public int floors;
}
`,
        question: {
          prompt: 'What will the Console print?', options: ['3', '4'], answer: '4',
          actual: ({ output }) => output[0],
          explain: 'The parameter x is a copy of the arrow, so it points to the same object as a. The method changes that object: a.floors is now 4. (An int parameter would still be a copy of the number.)',
        },
        setup: () => ({ size: 6, target: {} }),
      },
      {
        id: 'r-3', type: 'fix', title: 'An arrow to nothing',
        goal: 'Build the towers of 2 and 5.',
        brief: '<p><code>null</code> means "no object". The program compiles, but it crashes while running with the most famous error in C# and Unity: <b>NullReferenceException</b>. Read which line and which variable.</p>',
        hint: 'b needs a real object: Building b = new Building();',
        starter: `Building a = new Building();
Building b = null;
a.floors = 2;
b.floors = 5;
drone.Build(a.floors);
drone.Build(b.floors);

class Building
{
    public int floors;
}
`,
        solution: `Building a = new Building();
Building b = new Building();
a.floors = 2;
b.floors = 5;
drone.Build(a.floors);
drone.Build(b.floors);

class Building
{
    public int floors;
}`,
        labels: true,
        setup: () => ({ size: 6, maxHeight: 8, viewHeight: 5, target: towers([[2], [5]]) }),
      },
      {
        id: 'r-4', type: 'predict', noDrone: true, title: 'Same values, same object?',
        goal: 'Predict what the Console will print.',
        brief: '<p>Two buildings with exactly the same number of floors. Are they equal?</p>',
        starter: `Building a = new Building();
Building b = new Building();
a.floors = 3;
b.floors = 3;
Console.WriteLine(a == b);

class Building
{
    public int floors;
}
`,
        question: {
          prompt: 'What will the Console print?', options: ['True', 'False'], answer: 'False',
          actual: ({ output }) => output[0],
          explain: 'For classes, == asks "do both arrows point to the same object?". a and b are two different objects (#1 and #2) that happen to have the same fields, so a == b is False. Compare the fields instead: a.floors == b.floors.',
        },
        setup: () => ({ size: 6, target: {} }),
      },
      {
        id: 'r-5', title: 'Check before you use it',
        goal: 'Build every plot of the array. Empty plots (null) are skipped, but the drone still moves.',
        brief: '<p>This array holds arrows to buildings, and some of them are <code>null</code>: empty plots. Write <code>BuildPlot</code> so it checks <code>if (b != null)</code> before using the building.</p>',
        hint: 'if (b != null) { for (…) drone.Place(Color.White); }  and always drone.Move(Direction.Right); at the end.',
        starter: `Building[] plots = { new Building(2), null, new Building(4), null, new Building(1) };
foreach (Building p in plots)
{
    BuildPlot(p);
}

void BuildPlot(Building b)
{
    for (int i = 0; i < b.floors; i++)
    {
        drone.Place(Color.White);
    }
    drone.Move(Direction.Right);
}

class Building
{
    public int floors;
    public Building(int f) { floors = f; }
}
`,
        solution: `Building[] plots = { new Building(2), null, new Building(4), null, new Building(1) };
foreach (Building p in plots)
{
    BuildPlot(p);
}

void BuildPlot(Building b)
{
    if (b != null)
    {
        for (int i = 0; i < b.floors; i++)
        {
            drone.Place(Color.White);
        }
    }
    drone.Move(Direction.Right);
}

class Building
{
    public int floors;
    public Building(int f) { floors = f; }
}`,
        requires: [{ feature: 'nullCheck', label: 'Check for null' }],
        labels: true,
        setup: () => ({ size: 6, maxHeight: 8, viewHeight: 5, target: { '0,0': repeat('White', 2), '2,0': repeat('White', 4), '4,0': repeat('White', 1) } }),
      },
    ],
  },
  {
    id: 2, name: 'Lists', concept: 'Collections that grow',
    intro: 'A List is like an array that can grow and shrink. Lists of objects are everywhere in games: enemies, bullets, buildings.',
    challenges: [
      {
        id: 'l-1', type: 'observe', title: 'A list that grows',
        goal: 'Step through and watch the list in the heap grow with every Add.',
        brief: '<p><code>List&lt;int&gt;</code> is a list of ints. It starts empty; <code>Add</code> puts an item at the end and <code>Count</code> says how many there are. Positions start at 0, like arrays. A list is an object too: the variable holds an arrow to it.</p>',
        hint: 'Watch Count change in the heap.',
        starter: `List<int> heights = new List<int>();
heights.Add(3);
heights.Add(1);
heights.Add(4);
Console.WriteLine(heights.Count);

foreach (int h in heights)
{
    drone.Build(h);
}
`,
        labels: true,
        setup: () => ({ size: 6, maxHeight: 8, viewHeight: 5, target: {} }),
      },
      {
        id: 'l-2', type: 'predict', noDrone: true, title: 'After a Remove',
        goal: 'Predict what the Console will print.',
        brief: '<p><code>Remove</code> takes an item out of the list. What happens to the positions of the items after it?</p>',
        starter: `List<string> names = new List<string> { "Ada", "Bo", "Cy" };
names.Remove("Bo");
Console.WriteLine(names.Count + " " + names[1]);
`,
        question: {
          prompt: 'What will the Console print?', options: ['2 Cy', '3 Bo', '2 Bo'], answer: '2 Cy',
          actual: ({ output }) => output[0],
          explain: 'After removing "Bo" the list has 2 items and the ones after it move up one position: "Cy" is now at position 1.',
        },
        setup: () => ({ size: 6, target: {} }),
      },
      {
        id: 'l-3', type: 'complete', title: 'A list of objects',
        goal: 'Fill the gaps: add the three towers to the list, then build every tower of the list.',
        brief: '<p>A list can hold objects: <code>List&lt;Tower&gt;</code>. Each item is an arrow to a Tower in the heap. Then one <code>foreach</code> can ask every object to build itself.</p>',
        hint: 'city.Add(…)  and  foreach (Tower t in city)',
        starter: `List<Tower> city = new List<Tower>();
city.___(new Tower(2, Color.Red));
city.___(new Tower(5, Color.Blue));
city.___(new Tower(3, Color.Green));

foreach (Tower t in ___)
{
    t.Build();
}

class Tower
{
    public int height;
    public Color color;
    public Tower(int h, Color c) { height = h; color = c; }
    public void Build() { drone.Build(height, color); }
}
`,
        solution: `List<Tower> city = new List<Tower>();
city.Add(new Tower(2, Color.Red));
city.Add(new Tower(5, Color.Blue));
city.Add(new Tower(3, Color.Green));

foreach (Tower t in city)
{
    t.Build();
}

class Tower
{
    public int height;
    public Color color;
    public Tower(int h, Color c) { height = h; color = c; }
    public void Build() { drone.Build(height, color); }
}`,
        labels: true,
        setup: () => ({ size: 6, maxHeight: 8, viewHeight: 5, target: towers([[2, 'Red'], [5, 'Blue'], [3, 'Green']]) }),
      },
      {
        id: 'l-4', type: 'fix', title: 'Don\'t remove while looping',
        goal: 'Remove the short heights (less than 3) and build the rest: 5, 4, 6.',
        brief: '<p>This program crashes with <b>InvalidOperationException</b>: a list cannot change while <code>foreach</code> is going through it. Use a <code>for</code> loop that goes <b>backwards</b> and <code>RemoveAt(i)</code>: going backwards, removing an item doesn\'t move the ones you haven\'t checked yet.</p>',
        hint: 'for (int i = heights.Count - 1; i >= 0; i--) { if (heights[i] < 3) heights.RemoveAt(i); }',
        starter: `List<int> heights = new List<int> { 5, 1, 4, 2, 6 };

foreach (int h in heights)
{
    if (h < 3)
    {
        heights.Remove(h);
    }
}

foreach (int h in heights)
{
    drone.Build(h);
}
`,
        solution: `List<int> heights = new List<int> { 5, 1, 4, 2, 6 };

for (int i = heights.Count - 1; i >= 0; i--)
{
    if (heights[i] < 3)
    {
        heights.RemoveAt(i);
    }
}

foreach (int h in heights)
{
    drone.Build(h);
}`,
        labels: true,
        setup: () => ({ size: 6, maxHeight: 8, viewHeight: 6, target: towers([[5], [4], [6]]) }),
      },
      {
        id: 'l-5', title: 'A street from the plan', randomized: true,
        goal: 'Turn the scanned plan into a list of Tower objects (skip the zeros), then build every tower of the list.',
        brief: '<p>The plan changes every run. Read it with <code>drone.Scan()</code>, create a <code>Tower</code> for every number bigger than 0 and <code>Add</code> it to the list. Towers of 4 or more are <b>Blue</b>, the others <b>Red</b>. Then build the list: the towers stand next to each other, with no gaps.</p>',
        hint: 'foreach (int h in plan) { if (h > 0) { Color c = h >= 4 ? Color.Blue : Color.Red; city.Add(new Tower(h, c)); } }  then foreach (Tower t in city) t.Build();',
        starter: `int[] plan = drone.Scan();
List<Tower> city = new List<Tower>();

// 1. Fill the list from the plan.

// 2. Build every tower of the list.

class Tower
{
    public int height;
    public Color color;
    public Tower(int h, Color c) { height = h; color = c; }
    public void Build() { drone.Build(height, color); }
}
`,
        solution: `int[] plan = drone.Scan();
List<Tower> city = new List<Tower>();

foreach (int h in plan)
{
    if (h > 0)
    {
        Color c = h >= 4 ? Color.Blue : Color.Red;
        city.Add(new Tower(h, c));
    }
}

foreach (Tower t in city)
{
    t.Build();
}

class Tower
{
    public int height;
    public Color color;
    public Tower(int h, Color c) { height = h; color = c; }
    public void Build() { drone.Build(height, color); }
}`,
        requires: [{ feature: 'listAdd', label: 'Add objects to the list' }],
        labels: true,
        setup: rand => {
          const plan = Array.from({ length: 7 }, (_, i) => i === 2 || rand() < 0.2 ? 0 : 1 + Math.floor(rand() * 6));
          const built = plan.filter(h => h > 0);
          return { maxHeight: 8, viewHeight: 6, plans: { 0: plan }, target: Object.fromEntries(built.map((h, x) => [`${x},0`, repeat(h >= 4 ? 'Blue' : 'Red', h)])) };
        },
      },
    ],
  },
  {
    id: 3, name: 'Structs and Vector3', concept: 'Copies',
    intro: 'A struct is a small value that is copied, not shared. Vector3, the position of everything in Unity, is a struct.',
    challenges: [
      {
        id: 'v-1', type: 'observe', title: 'Positions as vectors',
        goal: 'Step through and read the vectors in Memory and the Console.',
        brief: '<p>A <code>Vector3</code> holds three floats: <b>x</b> (right), <b>y</b> (up) and <b>z</b> (forward). Vectors can be added and multiplied by a number: <code>Vector3.up * 3f</code> is three units up. Unity uses them for positions, directions and speeds. Notice in Memory: a Vector3 is stored <b>inside</b> the variable, not in the heap.</p>',
        hint: 'Floats are written with an f: 3f, 1.5f.',
        starter: `Vector3 start = new Vector3(1f, 0f, 2f);
Vector3 jump = Vector3.up * 3f;
Vector3 top = start + jump;
Console.WriteLine(top);
Console.WriteLine(Vector3.Distance(start, top));
`,
        setup: () => ({ size: 6, target: {} }), noDrone: true,
      },
      {
        id: 'v-2', type: 'predict', title: 'A copy, not an arrow',
        goal: 'Predict what the Console will print.',
        brief: '<p>In the last level, <code>Building b = a;</code> copied the arrow. <code>Vector3</code> is a <b>struct</b>, not a class…</p>',
        starter: `Vector3 a = new Vector3(1f, 0f, 0f);
Vector3 b = a;
b.x = 5f;
Console.WriteLine(a.x);
`,
        question: {
          prompt: 'What will the Console print?', options: ['1', '5'], answer: '1',
          actual: ({ output }) => output[0],
          explain: 'A struct is copied when you assign it: b is a new Vector3 with the same numbers. Changing b.x does not touch a. Classes share (arrows), structs copy (values).',
        },
        setup: () => ({ size: 6, target: {} }), noDrone: true,
      },
      {
        id: 'v-3', type: 'fix', title: 'Floats need an f',
        goal: 'Make the Console print (3.00, 0.00, 1.00).',
        brief: '<p>In C#, <code>1.5</code> is a <code>double</code>. Unity works with <code>float</code>, so decimal numbers need an <b>f</b>: <code>1.5f</code>. Read the three errors.</p>',
        hint: 'new Vector3(1.5f, 0f, 0.5f) and float time = 2f;',
        starter: `Vector3 speed = new Vector3(1.5, 0, 0.5);
float time = 2.0;
Vector3 moved = speed * time;
Console.WriteLine(moved);
`,
        solution: `Vector3 speed = new Vector3(1.5f, 0f, 0.5f);
float time = 2f;
Vector3 moved = speed * time;
Console.WriteLine(moved);`,
        expectOutput: ['(3.00, 0.00, 1.00)'],
        setup: () => ({ size: 6, target: {} }), noDrone: true,
      },
      {
        id: 'v-4', type: 'fix', title: 'The famous Unity error',
        goal: 'Put the ball at height 3 in Start().',
        brief: '<p>This is a Unity script: <code>class Ball : MonoBehaviour</code>. Every object in the scene has a <code>transform</code>, and <code>transform.position</code> is a Vector3. But it gives you a <b>copy</b>, so you can\'t change just its <code>y</code>: CS1612. Copy it into a variable, change the copy and assign it back, or assign a whole new Vector3.</p>',
        hint: 'Vector3 p = transform.position; p.y = 3f; transform.position = p;',
        starter: `Scene.Add(new Ball());

class Ball : MonoBehaviour
{
    public Color color = Color.Orange;

    void Start()
    {
        transform.position.y = 3f;
    }
}
`,
        solution: `Scene.Add(new Ball());

class Ball : MonoBehaviour
{
    public Color color = Color.Orange;

    void Start()
    {
        Vector3 p = transform.position;
        p.y = 3f;
        transform.position = p;
    }
}`,
        frames: 3, noDrone: true,
        expectScene: ({ history }) => ({ ok: !!last(history) && near(last(history).y, 3), message: 'The ball must end at height 3 (y = 3).' }),
        setup: SCENE,
      },
      {
        id: 'v-5', type: 'complete', title: 'Walk towards a target',
        goal: 'Complete the code so the Console prints the three steps towards the target.',
        brief: '<p>A classic of games: move towards a target. The <b>direction</b> is <code>target - position</code>; <code>.normalized</code> makes its length 1, so multiplying it by a speed moves exactly that distance.</p>',
        hint: 'Vector3 direction = (target - position).normalized;  and  position = position + direction * 2f;',
        starter: `Vector3 position = Vector3.zero;
Vector3 target = new Vector3(6f, 0f, 8f);

for (int i = 0; i < 3; i++)
{
    Vector3 direction = (___ - ___).normalized;
    position = position + direction * 2f;
    Console.WriteLine(position);
}
`,
        solution: `Vector3 position = Vector3.zero;
Vector3 target = new Vector3(6f, 0f, 8f);

for (int i = 0; i < 3; i++)
{
    Vector3 direction = (target - position).normalized;
    position = position + direction * 2f;
    Console.WriteLine(position);
}`,
        expectOutput: ['(1.20, 0.00, 1.60)', '(2.40, 0.00, 3.20)', '(3.60, 0.00, 4.80)'],
        setup: () => ({ size: 6, target: {} }), noDrone: true,
      },
    ],
  },
  {
    id: 4, name: 'Update and time', concept: 'Frames',
    intro: 'Games run frame by frame. Like Unity, the lab calls Start() once and Update() on every object, every frame. Time.deltaTime makes movement independent of the frame rate.',
    challenges: [
      {
        id: 'u-1', type: 'observe', title: 'Update, frame by frame',
        goal: 'Run it and watch the ball move. Then Step: every frame, Update() runs once.',
        brief: '<p><code>Scene.Add(new Mover())</code> puts the object in the scene. From then on, the lab calls its <code>Update()</code> <b>every frame</b> (20 frames per second here). Each frame the ball moves <code>speed * Time.deltaTime</code>: 2 units per second × 0.05 s = 0.1 units per frame. The dots show where it was on every frame.</p>',
        hint: 'After 2 seconds (40 frames) it has moved 4 units.',
        starter: `Scene.Add(new Mover());

class Mover : MonoBehaviour
{
    public float speed = 2f;
    public Color color = Color.Blue;

    void Start()
    {
        transform.position = new Vector3(0f, 1f, 3f);
    }

    void Update()
    {
        transform.position += Vector3.right * speed * Time.deltaTime;
    }
}
`,
        frames: 40, noDrone: true, setup: SCENE,
      },
      {
        id: 'u-2', type: 'predict', title: 'Where after one second?',
        goal: 'Predict the ball\'s x after 20 frames (1 second).',
        brief: '<p>The ball moves with a <b>speed</b> of 3 units per second. The program runs for 20 frames, and each frame lasts <code>Time.deltaTime</code> = 0.05 s.</p>',
        starter: `Scene.Add(new Mover());

class Mover : MonoBehaviour
{
    public float speed = 3f;
    public Color color = Color.Blue;

    void Update()
    {
        transform.position += Vector3.right * speed * Time.deltaTime;
    }
}
`,
        frames: 20, noDrone: true, setup: SCENE,
        question: {
          prompt: 'What is x after 20 frames?', options: ['3', '60', '0.15'], answer: '3',
          actual: ({ runner }) => String(Math.round(last(runner.history).x * 100) / 100),
          explain: 'Each frame it moves 3 × 0.05 = 0.15, and 20 frames × 0.15 = 3: exactly the speed per second. Without Time.deltaTime (moving 3 every frame) it would be at 60, and faster on faster computers.',
        },
      },
      {
        id: 'u-3', type: 'complete', title: 'Falling',
        goal: 'Complete Update so the ball falls with gravity and stops on the floor (y = 0).',
        brief: '<p>Gravity changes the <b>velocity</b> every frame (<code>velocity.y -= 9.8f * Time.deltaTime</code>), and the velocity changes the <b>position</b>. When the ball goes below the floor, put it back at y = 0 and stop it.</p>',
        hint: 'transform.position += velocity * Time.deltaTime;  and in the if: velocity = Vector3.zero;',
        starter: `Scene.Add(new Ball());

class Ball : MonoBehaviour
{
    public Vector3 velocity = Vector3.zero;
    public Color color = Color.Orange;

    void Start()
    {
        transform.position = new Vector3(2f, 4f, 3f);
    }

    void Update()
    {
        velocity.y -= 9.8f * Time.deltaTime;
        transform.position += ___ * Time.deltaTime;
        if (transform.position.y < 0f)
        {
            Vector3 p = transform.position;
            p.y = 0f;
            transform.position = p;
            velocity = ___;
        }
    }
}
`,
        solution: `Scene.Add(new Ball());

class Ball : MonoBehaviour
{
    public Vector3 velocity = Vector3.zero;
    public Color color = Color.Orange;

    void Start()
    {
        transform.position = new Vector3(2f, 4f, 3f);
    }

    void Update()
    {
        velocity.y -= 9.8f * Time.deltaTime;
        transform.position += velocity * Time.deltaTime;
        if (transform.position.y < 0f)
        {
            Vector3 p = transform.position;
            p.y = 0f;
            transform.position = p;
            velocity = Vector3.zero;
        }
    }
}`,
        frames: 30, noDrone: true, setup: SCENE,
        expectScene: ({ history }) => { const t = track(history); return { ok: t.length > 5 && Math.max(...t.map(o => o.y)) >= 3.9 && near(t.at(-1).y, 0, 0.02) && t.every(o => o.y >= -0.001), message: 'The ball must start at height 4, fall and end resting on the floor (y = 0), never below it.' }; },
      },
      {
        id: 'u-4', title: 'The bouncing ball, in code',
        goal: 'Make the ball bounce: at the floor, reverse its vertical velocity and keep 60% of it.',
        brief: '<p>The same ball as in the Animation Lab, but now <b>simulated</b> instead of keyframed. When it touches the floor, instead of stopping it, send it back up: <code>velocity.y = -velocity.y * 0.6f;</code>. The 0.6 is how much energy it keeps. Watch the trail: lower and shorter bounces, like the curve you animated by hand.</p>',
        hint: 'Replace velocity = Vector3.zero; with velocity.y = -velocity.y * 0.6f;',
        starter: `Scene.Add(new Ball());

class Ball : MonoBehaviour
{
    public Vector3 velocity = new Vector3(0.8f, 0f, 0f);
    public Color color = Color.Orange;

    void Start()
    {
        transform.position = new Vector3(0f, 4f, 3f);
    }

    void Update()
    {
        velocity.y -= 9.8f * Time.deltaTime;
        transform.position += velocity * Time.deltaTime;
        if (transform.position.y < 0f)
        {
            Vector3 p = transform.position;
            p.y = 0f;
            transform.position = p;
            velocity = Vector3.zero;
        }
    }
}
`,
        solution: `Scene.Add(new Ball());

class Ball : MonoBehaviour
{
    public Vector3 velocity = new Vector3(0.8f, 0f, 0f);
    public Color color = Color.Orange;

    void Start()
    {
        transform.position = new Vector3(0f, 4f, 3f);
    }

    void Update()
    {
        velocity.y -= 9.8f * Time.deltaTime;
        transform.position += velocity * Time.deltaTime;
        if (transform.position.y < 0f)
        {
            Vector3 p = transform.position;
            p.y = 0f;
            transform.position = p;
            velocity.y = -velocity.y * 0.6f;
        }
    }
}`,
        frames: 80, noDrone: true, setup: SCENE,
        expectScene: ({ history }) => { const b = bounces(history), p = peaks(history); return { ok: b.length >= 3 && p.length >= 2 && p.every((v, i) => i === 0 || v < p[i - 1]), message: 'The ball should bounce at least three times, each bounce lower than the one before.' }; },
      },
      {
        id: 'u-5', title: 'Five balls, one class',
        goal: 'Create five balls in a loop, at x = 0, 1, 2, 3, 4, dropped from heights 1, 2, 3, 4, 5.',
        brief: '<p>One class, many objects: each ball has its own position and its own velocity, so each one bounces on its own. The constructor receives where to start. Write the loop that creates the balls and adds them to the scene.</p>',
        hint: 'for (int i = 0; i < 5; i++) { Scene.Add(new Ball(new Vector3(i, i + 1, 3f))); }',
        starter: `// Create five balls here.

class Ball : MonoBehaviour
{
    public Vector3 velocity = Vector3.zero;
    public Vector3 start;
    public Color color = Color.Purple;

    public Ball(Vector3 s)
    {
        start = s;
    }

    void Start()
    {
        transform.position = start;
    }

    void Update()
    {
        velocity.y -= 9.8f * Time.deltaTime;
        transform.position += velocity * Time.deltaTime;
        if (transform.position.y < 0f)
        {
            Vector3 p = transform.position;
            p.y = 0f;
            transform.position = p;
            velocity.y = -velocity.y * 0.7f;
        }
    }
}
`,
        solution: `for (int i = 0; i < 5; i++)
{
    Scene.Add(new Ball(new Vector3(i, i + 1, 3f)));
}

class Ball : MonoBehaviour
{
    public Vector3 velocity = Vector3.zero;
    public Vector3 start;
    public Color color = Color.Purple;

    public Ball(Vector3 s)
    {
        start = s;
    }

    void Start()
    {
        transform.position = start;
    }

    void Update()
    {
        velocity.y -= 9.8f * Time.deltaTime;
        transform.position += velocity * Time.deltaTime;
        if (transform.position.y < 0f)
        {
            Vector3 p = transform.position;
            p.y = 0f;
            transform.position = p;
            velocity.y = -velocity.y * 0.7f;
        }
    }
}`,
        frames: 60, noDrone: true, setup: SCENE,
        requires: [{ feature: 'for', label: 'Use a loop' }],
        expectScene: ({ history }) => {
          const n = history[0]?.length || 0;
          const starts = n === 5 ? [0, 1, 2, 3, 4].map(i => history[0][i]) : [];
          const ok = n === 5 && starts.every((o, i) => near(o.x, i) && Math.abs(o.y - (i + 1)) < 0.3);
          return { ok, message: 'There should be 5 balls, starting at x = 0 … 4 and heights 1 … 5.' };
        },
      },
    ],
  },
  {
    id: 5, name: 'Inheritance', concept: 'Families',
    intro: 'A class can inherit from another: it gets everything the parent has, and can add or replace things. MonoBehaviour is the parent of every Unity script.',
    challenges: [
      {
        id: 'i-1', type: 'predict', title: 'Which Speak runs?',
        goal: 'Predict what the Console will print.',
        brief: '<p>A <code>Dog</code> is an <code>Animal</code>, so an Animal variable can point to a Dog. <code>Speak</code> is <code>virtual</code> and Dog <code>override</code>s it; <code>Name</code> is not virtual. Which versions run?</p>',
        starter: `Animal a = new Dog();
a.Speak();
a.Name();

class Animal
{
    public virtual void Speak() { Console.WriteLine("..."); }
    public void Name() { Console.WriteLine("animal"); }
}

class Dog : Animal
{
    public override void Speak() { Console.WriteLine("Woof"); }
    public void Name() { Console.WriteLine("dog"); }
}
`,
        question: {
          prompt: 'What will the Console print?', options: ['Woof, animal', 'Woof, dog', '..., animal'], answer: 'Woof, animal',
          actual: ({ output }) => output.join(', '),
          explain: 'virtual + override: the object decides, and the object is a Dog, so "Woof". Name is not virtual: the type of the variable (Animal) decides, so "animal". The compiler even warns about it (CS0108).',
        },
        setup: () => ({ size: 6, target: {} }), noDrone: true,
      },
      {
        id: 'i-2', type: 'fix', title: 'Forgot virtual',
        goal: 'Make the Rocket fly up while the base Mover moves right.',
        brief: '<p>A <code>Rocket</code> is a <code>Mover</code> that replaces how it moves. To replace a method, the base class must allow it with <code>virtual</code>, and the child must say <code>override</code>. Read the error.</p>',
        hint: 'In Mover: protected virtual void Move()',
        starter: `Scene.Add(new Mover());
Scene.Add(new Rocket());

class Mover : MonoBehaviour
{
    public Color color = Color.Blue;

    protected void Move()
    {
        transform.position += Vector3.right * 2f * Time.deltaTime;
    }

    void Update()
    {
        Move();
    }
}

class Rocket : Mover
{
    public Rocket()
    {
        color = Color.Red;
    }

    protected override void Move()
    {
        transform.position += Vector3.up * 2f * Time.deltaTime;
    }
}
`,
        solution: `Scene.Add(new Mover());
Scene.Add(new Rocket());

class Mover : MonoBehaviour
{
    public Color color = Color.Blue;

    protected virtual void Move()
    {
        transform.position += Vector3.right * 2f * Time.deltaTime;
    }

    void Update()
    {
        Move();
    }
}

class Rocket : Mover
{
    public Rocket()
    {
        color = Color.Red;
    }

    protected override void Move()
    {
        transform.position += Vector3.up * 2f * Time.deltaTime;
    }
}`,
        frames: 30, noDrone: true, setup: SCENE,
        expectScene: ({ history }) => { const a = last(history, 0), b = last(history, 1); return { ok: !!a && !!b && a.x > 2.5 && near(a.y, 0) && b.y > 2.5 && near(b.x, 0), message: 'The Mover (blue) must move right and the Rocket (red) must go up.' }; },
      },
      {
        id: 'i-3', title: 'A super ball',
        goal: 'Create SuperBall: a Ball that keeps 90% of its speed at every bounce. Add one of each to the scene.',
        brief: '<p>The <code>Ball</code> is ready and asks <code>Bounciness()</code> how much speed it keeps (0.6). Write a class <code>SuperBall : Ball</code> that <b>overrides</b> <code>Bounciness()</code> to give back <code>0.9f</code> and is Green. Put a Ball at x = 1 and a SuperBall at x = 4. Everything else is inherited.</p>',
        hint: 'class SuperBall : Ball { public SuperBall(float x) : base(x) { color = Color.Green; } public override float Bounciness() { return 0.9f; } }',
        starter: `Scene.Add(new Ball(1f));
// Add a SuperBall at x = 4 here.

class Ball : MonoBehaviour
{
    public Vector3 velocity = Vector3.zero;
    public Color color = Color.Orange;

    public Ball(float x)
    {
        transform.position = new Vector3(x, 4f, 3f);
    }

    public virtual float Bounciness()
    {
        return 0.6f;
    }

    void Update()
    {
        velocity.y -= 9.8f * Time.deltaTime;
        transform.position += velocity * Time.deltaTime;
        if (transform.position.y < 0f)
        {
            Vector3 p = transform.position;
            p.y = 0f;
            transform.position = p;
            velocity.y = -velocity.y * Bounciness();
        }
    }
}

// Write the class SuperBall here.
`,
        solution: `Scene.Add(new Ball(1f));
Scene.Add(new SuperBall(4f));

class Ball : MonoBehaviour
{
    public Vector3 velocity = Vector3.zero;
    public Color color = Color.Orange;

    public Ball(float x)
    {
        transform.position = new Vector3(x, 4f, 3f);
    }

    public virtual float Bounciness()
    {
        return 0.6f;
    }

    void Update()
    {
        velocity.y -= 9.8f * Time.deltaTime;
        transform.position += velocity * Time.deltaTime;
        if (transform.position.y < 0f)
        {
            Vector3 p = transform.position;
            p.y = 0f;
            transform.position = p;
            velocity.y = -velocity.y * Bounciness();
        }
    }
}

class SuperBall : Ball
{
    public SuperBall(float x) : base(x)
    {
        color = Color.Green;
    }

    public override float Bounciness()
    {
        return 0.9f;
    }
}`,
        frames: 60, noDrone: true, setup: SCENE,
        requires: [{ feature: 'override', label: 'Override Bounciness' }],
        expectScene: ({ history, scene }) => {
          const two = scene.length === 2 && scene[1].__cls.name === 'SuperBall';
          const p0 = peaks(history, 0), p1 = peaks(history, 1);
          return { ok: two && p1.length > 0 && p0.length > 0 && p1[0] > p0[0] + 0.5 && near(history[0][1].x, 4), message: 'There should be a Ball and a SuperBall (at x = 4), and the SuperBall must bounce clearly higher.' };
        },
      },
    ],
  },
  {
    id: 6, name: 'Ready for Unity', concept: 'Bridge',
    intro: 'Everything you wrote here is real C#. A few details change when the script goes into Unity.',
    challenges: [
      {
        id: 'f-1', type: 'observe', title: 'Your script in Unity',
        goal: 'Read the script and the notes: this class works in Unity almost as it is.',
        brief: '<p>To use this script in Unity: create a C# script called <b>Bouncer</b>, paste the class and attach it to a Sphere. What changes:</p><p>• <code>using UnityEngine;</code> goes at the top (here it is optional).<br>• There is no <code>Scene.Add</code>: you <b>attach</b> the script to a GameObject in the Inspector, and Unity never uses <code>new</code> for MonoBehaviours.<br>• Colours are <code>Color.red</code> (lowercase) and go in a material, not a field.<br>• <code>public</code> fields appear in the <b>Inspector</b>, where you can change them without touching the code.<br>• <code>Debug.Log</code> writes in Unity\'s Console, like Console.WriteLine here.</p>',
        hint: 'Change speed or bounce and run it again.',
        starter: `using UnityEngine;

Scene.Add(new Bouncer());

class Bouncer : MonoBehaviour
{
    public float bounce = 0.7f;
    public Vector3 velocity = new Vector3(1f, 0f, 0f);
    public Color color = Color.Yellow;

    void Start()
    {
        transform.position = new Vector3(0f, 4f, 3f);
        Debug.Log("Start: " + transform.position);
    }

    void Update()
    {
        velocity.y -= 9.8f * Time.deltaTime;
        transform.position += velocity * Time.deltaTime;
        if (transform.position.y < 0f)
        {
            Vector3 p = transform.position;
            p.y = 0f;
            transform.position = p;
            velocity.y = -velocity.y * bounce;
            Debug.Log("Bounce!");
        }
    }
}
`,
        frames: 80, noDrone: true, setup: SCENE,
      },
      {
        id: 'free2', title: 'Free scene', sandbox: true,
        goal: 'No target. Build your own scene with classes and objects.',
        brief: '<p>Ideas: a row of balls with different bounciness, an object that orbits with <code>Mathf.Sin</code> and <code>Mathf.Cos</code>, a spawner that adds objects every few frames, a city of Tower objects from a list.</p>',
        hint: 'Time.time is the time since the start: new Vector3(Mathf.Cos(Time.time), 1f, Mathf.Sin(Time.time)).',
        starter: `for (int i = 0; i < 4; i++)
{
    Scene.Add(new Orbiter(i * 1.5f));
}

class Orbiter : MonoBehaviour
{
    public float offset;
    public Color color = Color.Blue;

    public Orbiter(float o)
    {
        offset = o;
    }

    void Update()
    {
        float t = Time.time * 2f + offset;
        transform.position = new Vector3(3.5f + Mathf.Cos(t) * 2.5f, 1f + offset * 0.5f, 3.5f + Mathf.Sin(t) * 2.5f);
    }
}
`,
        solution: '', frames: 80, noDrone: true, setup: SCENE,
      },
    ],
  },
];

export const CHALLENGES = buildChallenges(LEVELS);
