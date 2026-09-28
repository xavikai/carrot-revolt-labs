import { compile, Runner } from './interpreter.js';
import { World } from './world.js';

// Levels and challenges for the C# Code Lab.
// Each challenge builds a target in an 8 × 8 voxel world.
// setup(rand) returns { start, columns, ground, target }. Randomized challenges
// are verified on several extra seeds so hard-coded answers don't pass.

const SIZE = 8;
function fill(fn) {
  const t = {};
  for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) {
    const c = fn(x, z);
    if (c && c.length) t[`${x},${z}`] = c;
  }
  return t;
}
const repeat = (color, n) => Array(n).fill(color);

export const API = [
  { level: 0, code: '2 + 3 * 4', text: 'Operators: <code>+</code> <code>-</code> <code>*</code> <code>/</code> <code>%</code> (remainder). <code>*</code> <code>/</code> <code>%</code> go before <code>+</code> <code>-</code>. Use <code>( )</code> to change the order.' },
  { level: 0, code: '7 / 2      7.0 / 2', text: 'int ÷ int gives a whole number (3). With a decimal number (double) you get 3.5.' },
  { level: 0, code: '3   3.5   "3"   true', text: 'Types of values: <code>int</code>, <code>double</code>, <code>string</code> (text in double quotes), <code>bool</code>.' },
  { level: 2, code: '"Hello".Length      "Hello"[0]', text: 'A string is a row of characters. <code>Length</code> counts them; <code>[0]</code> reads one (a <code>char</code>, in single quotes). Positions start at 0.' },
  { level: 2, code: 'text.ToUpper()   text.Substring(0, 3)', text: 'Methods of text: <code>ToUpper()</code>, <code>ToLower()</code>, <code>Substring(start, length)</code>, <code>IndexOf("x")</code>, <code>Contains("x")</code>, <code>Replace("a", "b")</code>.' },
  { level: 2, code: '$"{name} is {age}"', text: 'Interpolation: a <code>$</code> before the quotes lets you put values inside <code>{ }</code>.' },
  { level: 3, code: '5 > 3    2 + 2 == 4    x != 0', text: 'Comparisons give a <code>bool</code> (true or false): <code>==</code> <code>!=</code> <code>&lt;</code> <code>&gt;</code> <code>&lt;=</code> <code>&gt;=</code>. <code>=</code> stores, <code>==</code> compares.' },
  { level: 3, code: 'a && b    a || b    !a', text: '<code>&amp;&amp;</code> and: both must be true · <code>||</code> or: at least one · <code>!</code> not: flips true and false.' },
  { level: 1, code: 'int age = 16', text: 'A variable: type, name, value. Names use <b>camelCase</b>: <code>playerScore</code>. C# is case-sensitive.' },
  { level: 4, code: 'Console.WriteLine("Hello!");', text: 'Prints text or a value in the Console. The drone also says it out loud.' },
  { level: 4, code: 'drone.Build(3);', text: 'Builds a tower of 3 blocks, then moves one tile right, ready for the next tower. Optional color: <code>drone.Build(3, Color.Red);</code>' },
  { level: 5, code: 'drone.Move(Direction.Right);', text: 'Moves one tile. Directions: <code>Right</code>, <code>Left</code>, <code>Forward</code>, <code>Back</code>.' },
  { level: 5, code: 'drone.Place(Color.Red);', text: 'Places a block on top of the column under the drone. Colors: White, Red, Orange, Yellow, Green, Blue, Purple, Black.' },
  { level: 6, code: 'int distance = 3;', text: 'Creates a variable: a named box with a type and a value. Types: <code>int</code> 3 · <code>double</code> 2.5 · <code>float</code> 2.5f · <code>bool</code> true · <code>string</code> "text" · <code>Color</code>.' },
  { level: 6, code: 'drone.Move(Direction.Right, distance);', text: 'Moves several tiles at once.' },
  { level: 7, code: 'for (int i = 0; i < 5; i++)\n{\n    \n}', text: 'Repeats the block. <code>i = 0</code> start · <code>i &lt; 5</code> keep going while true · <code>i++</code> add 1 after each turn.' },
  { level: 7, code: 'drone.MoveTo(x, z);', text: 'Flies straight to a tile. X goes right, Z goes forward.' },
  { level: 7, code: 'while (drone.Height < 6)\n{\n    \n}', text: 'Repeats while the condition is true. Use it when you don\'t know how many turns you need.' },
  { level: 7, code: 'drone.Height', text: 'How many blocks are in the column under the drone (int). Also <code>drone.X</code> and <code>drone.Z</code>.' },
  { level: 8, code: 'if (x == 0)\n{\n    \n}\nelse\n{\n    \n}', text: 'Runs one block or the other depending on the condition.' },
  { level: 8, code: 'x % 2 == 0', text: 'Compare with <code>==</code> <code>!=</code> <code>&lt;</code> <code>&gt;</code> <code>&lt;=</code> <code>&gt;=</code>. <code>%</code> is the remainder of a division. Combine with <code>&amp;&amp;</code> (and), <code>||</code> (or), <code>!</code> (not).' },
  { level: 8, code: 'drone.Ground', text: 'The color painted on the floor under the drone. <code>Color.None</code> if the tile is empty.' },
  { level: 9, code: 'void Tower(int height)\n{\n    \n}', text: 'Declares a method: a name for a group of instructions. <code>void</code>: it gives nothing back. <code>int height</code>: a parameter. Write methods below the main program.' },
  { level: 9, code: 'Tower(3);', text: 'Calls the method: its instructions run with <code>height = 3</code>, then the program carries on with the next line.' },
  { level: 9, code: 'int Area(int w, int d)\n{\n    return w * d;\n}', text: 'A method that gives back a value: write its type instead of <code>void</code> and end with <code>return</code>. The call is replaced by the value.' },
  { level: 10, code: 'int[] heights = { 3, 5, 2 };', text: 'An array: many values of one type in numbered boxes. <code>heights[0]</code> is the first box (positions start at 0) and <code>heights.Length</code> counts them.' },
  { level: 10, code: 'int[] floors = new int[4];', text: 'Creates an array of 4 boxes, all 0 for now. Write into a box with <code>floors[2] = 5;</code>' },
  { level: 10, code: 'for (int i = 0; i < heights.Length; i++)\n{\n    drone.Build(heights[i]);\n}', text: 'Goes through every position with its index <code>i</code>. Use <code>&lt;</code>, not <code>&lt;=</code>: the last position is <code>Length - 1</code>.' },
  { level: 10, code: 'foreach (int h in heights)\n{\n    \n}', text: 'Goes through the items one by one, without an index. <code>h</code> can be read but not changed.' },
  { level: 11, code: 'int[] plan = drone.Scan();', text: 'Reads the plan of the street where the drone is: one number per plot, from x = 0. The plan changes every run.' },
  { level: 11, code: 'Color LayerColor(int y)\n{\n    return Color.Green;\n}', text: 'A method can give back any type, also a <code>Color</code>: use it like a value, <code>drone.Place(LayerColor(y));</code>' },
];

export const LEVELS = [
  {
    id: 0, name: 'Calculator', concept: 'Values', mode: 'calc',
    intro: 'Before writing programs, let\'s see how C# calculates. Here each line is just a calculation, and its result appears next to it.',
    challenges: [
      {
        id: 'k-1', type: 'observe', title: 'The calculator', mode: 'calc', calcTowers: true,
        goal: 'Press Step (F10) and watch each result appear.',
        brief: '<p>Each line is a <b>calculation</b>. The computer works them out <b>one at a time, from top to bottom</b>. The result appears at the end of the line, and the drone builds it as a tower so you can see how big it is.</p><p>Lines starting with <code>//</code> are <b>comments</b>: notes for people. The computer ignores them.</p>',
        hint: 'Keep pressing Step. Run does everything at once.',
        starter: `// Each line is a calculation.
2 + 3
10 - 4
3 * 2
8 / 2
`,
        labels: true,
        setup: () => ({ size: 6, maxHeight: 16, viewHeight: 6, target: {} }),
      },
      {
        id: 'k-2', type: 'predict', title: 'Which goes first?', mode: 'calc', calcTowers: true,
        goal: 'Predict the result, then run it.',
        brief: '<p>Before running, decide what you think will happen. Being wrong is fine: it is how you find out how the computer really thinks.</p>',
        starter: `2 + 3 * 4
`,
        question: {
          prompt: 'What is 2 + 3 * 4 in C#?',
          options: ['20', '14', '9'], answer: '14',
          actual: ({ results }) => results[0]?.text,
          explain: '* and / are calculated before + and -, just like in maths: 3 * 4 = 12, then 2 + 12 = 14. To add first, use brackets: (2 + 3) * 4 is 20.',
        },
        labels: true,
        setup: () => ({ size: 6, maxHeight: 24, viewHeight: 14, target: {} }),
      },
      {
        id: 'k-3', type: 'create', title: 'Make 12', mode: 'calc', calcTowers: true,
        goal: 'Write one calculation that gives 12, using only the numbers 3 and 4.',
        brief: '<p>Your turn to write. Change the line so the result is <b>12</b>. You can use <code>+</code> <code>-</code> <code>*</code> <code>/</code> and brackets, but the only numbers allowed are 3 and 4. There is more than one answer!</p>',
        hint: '3 * 4 is one answer. Can you find another? (4 + 4 + 4…)',
        starter: `3 + 4
`,
        solution: `3 * 4`,
        requires: [{ onlyNumbers: [3, 4], label: 'Use only the numbers 3 and 4' }],
        labels: true,
        setup: () => ({ size: 6, maxHeight: 16, viewHeight: 12, target: { '0,0': Array(12).fill('White') } }),
      },
      {
        id: 'k-4', type: 'complete', title: 'Fill the gaps', mode: 'calc', calcTowers: true,
        goal: 'Replace each ___ so the results are 6, 8 and 3.',
        brief: '<p>Each <code>___</code> is a gap. Replace it with a number so every tower matches its ghost. The labels show the height of each tower.</p>',
        hint: '4 + 2 = 6 · 4 * 2 = 8 · (1 + 2) * 1 = 3',
        starter: `4 + ___
___ * 2
(1 + 2) * ___
`,
        solution: `4 + 2
4 * 2
(1 + 2) * 1`,
        labels: true,
        setup: () => ({ size: 6, maxHeight: 16, viewHeight: 8, target: { '0,0': Array(6).fill('White'), '1,0': Array(8).fill('White'), '2,0': Array(3).fill('White') } }),
      },
      {
        id: 'k-5', type: 'predict', title: 'Whole numbers', mode: 'calc',
        goal: 'Predict the result of 7 / 2.',
        brief: '<p>7 divided by 2 is 3.5… or is it? In C#, a number written without a decimal point is an <code>int</code>: a <b>whole number</b>. Look at the grey label next to each result: it tells you the <b>type</b>.</p>',
        starter: `7 / 2
`,
        question: {
          prompt: 'What is 7 / 2 in C#?',
          options: ['3.5', '3', '4'], answer: '3',
          actual: ({ results }) => results[0]?.text,
          explain: 'An int divided by an int gives an int: the decimals are cut off (not rounded). Try adding a line with 7.0 / 2: with a decimal number (double) the result is 3.5.',
        },
        setup: () => ({ size: 6, target: {} }),
      },
      {
        id: 'k-6', type: 'predict', title: 'What is left over', mode: 'calc', calcTowers: true,
        goal: 'Predict the result of 17 % 5.',
        brief: '<p><code>%</code> is the <b>remainder</b> operator: what is left over after dividing. It is used all the time to repeat patterns: every 2nd tile, every 5th floor…</p>',
        starter: `17 % 5
`,
        question: {
          prompt: 'What is 17 % 5?',
          options: ['3', '2', '3.4'], answer: '2',
          actual: ({ results }) => results[0]?.text,
          explain: '17 / 5 is 3 (because 3 × 5 = 15) and 2 is left over. So 17 % 5 is 2. A number is even when n % 2 is 0.',
        },
        labels: true,
        setup: () => ({ size: 6, maxHeight: 20, viewHeight: 5, target: {} }),
      },
      {
        id: 'k-7', type: 'predict', title: 'Kinds of values', mode: 'calc',
        goal: 'Look at the type of each value and predict the last result.',
        brief: '<p>Values have a <b>type</b>: <code>int</code> whole numbers, <code>double</code> decimal numbers, <code>string</code> text (between double quotes) and <code>bool</code> true or false. <code>"3"</code> looks like a number, but it is <b>text</b>.</p>',
        starter: `3
3.5
"3"
true
"3" + 4
`,
        question: {
          prompt: 'What is "3" + 4?',
          options: ['7', '"34"', 'An error'], answer: '"34"',
          actual: ({ results }) => results.at(-1)?.text,
          explain: 'When text and a number meet with +, C# joins them as text: "3" + 4 is "34". To calculate, both sides must be numbers.',
        },
        setup: () => ({ size: 6, target: {} }),
      },
    ],
  },
  {
    id: 1, name: 'Names', concept: 'Words', mode: 'calc',
    intro: 'C# is very strict with how things are written. Capital letters, quotes and names all matter.',
    challenges: [
      {
        id: 'n-1', type: 'classify', title: 'Capital letters matter', mode: 'calc',
        goal: 'Decide which lines C# accepts and which give an error.',
        brief: '<p>C# is <b>case-sensitive</b>: <code>true</code> and <code>True</code> are different words. Text goes between <b>double</b> quotes, and decimals use a <b>point</b>. Choose an answer for every line, then press <b>Check</b>. The real C# compiler decides.</p>',
        hint: 'Keywords like true are lowercase. Built-in names like Math and Max start with a capital letter.',
        classify: { categories: ['Works', 'Error'], judge: 'calc', items: [
          { text: 'true', answer: 'Works' }, { text: 'True', answer: 'Error' },
          { text: '"Hello"', answer: 'Works' }, { text: "'Hello'", answer: 'Error' },
          { text: '3.5', answer: 'Works' }, { text: '3,5', answer: 'Error' },
          { text: 'Math.Max(2, 5)', answer: 'Works' }, { text: 'math.max(2, 5)', answer: 'Error' },
        ] },
        setup: () => ({ size: 6, target: {} }),
      },
      {
        id: 'n-2', type: 'classify', title: 'Valid names',
        goal: 'Decide which names can be used for a variable.',
        brief: '<p>Soon you will give names to values. A name can contain letters, digits and <code>_</code>, but it <b>cannot start with a digit</b>, cannot contain <b>spaces</b> or symbols like <code>-</code>, and cannot be a <b>reserved word</b> of C# (like <code>int</code> or <code>class</code>). The compiler checks each one as <code>int name = 0;</code></p>',
        hint: 'Watch out for the tricky ones: Class (capital C) is not the same word as class.',
        classify: { categories: ['Valid', 'Invalid'], judge: 'name', items: [
          { text: 'score', answer: 'Valid' }, { text: 'playerScore', answer: 'Valid' },
          { text: '2players', answer: 'Invalid' }, { text: 'player score', answer: 'Invalid' },
          { text: 'my-name', answer: 'Invalid' }, { text: 'total2', answer: 'Valid' },
          { text: 'class', answer: 'Invalid' }, { text: 'Class', answer: 'Valid' },
          { text: '_count', answer: 'Valid' },
        ] },
        setup: () => ({ size: 6, target: {} }),
      },
      {
        id: 'n-3', type: 'classify', title: 'Name styles',
        goal: 'Classify each name by its style.',
        brief: '<p>Names can\'t have spaces, so programmers join words with capital letters:</p><p><b>camelCase</b> starts lowercase: <code>playerScore</code>. In C# it is used for <b>variables</b>.<br><b>PascalCase</b> starts uppercase: <code>PlayerScore</code>. It is used for <b>methods and types</b>: <code>Console</code>, <code>WriteLine</code>, <code>Color</code>.</p><p>Other styles work, but are not the C# way.</p>',
        hint: 'Look only at the first letter and at how the words are joined.',
        classify: { categories: ['camelCase', 'PascalCase', 'Other style'], judge: 'style', items: [
          { text: 'playerScore', answer: 'camelCase' }, { text: 'PlayerScore', answer: 'PascalCase' },
          { text: 'WriteLine', answer: 'PascalCase' }, { text: 'totalBlocks', answer: 'camelCase' },
          { text: 'player_score', answer: 'Other style' }, { text: 'Console', answer: 'PascalCase' },
          { text: 'MAXSPEED', answer: 'Other style' }, { text: 'score', answer: 'camelCase' },
        ] },
        setup: () => ({ size: 6, target: {} }),
      },
      {
        id: 'n-4', type: 'predict', title: 'A box with a name', mode: 'calc',
        goal: 'Follow the box called age and predict the last result.',
        brief: '<p><code>int age = 16</code> creates a <b>variable</b>: a box with a <b>type</b> (int), a <b>name</b> (age) and a <b>value</b> (16). Watch it in the <b>Memory</b> panel. Careful: calculating with a variable is not the same as <b>changing</b> it.</p>',
        starter: `int age = 16
age + 1
age = age + 1
age * 2
`,
        question: {
          prompt: 'What will the last line (age * 2) give?',
          options: ['32', '34', '36'], answer: '34',
          actual: ({ results }) => results.at(-1)?.text,
          explain: 'Line 2 calculates 17 but does not store it: age is still 16. Line 3 stores the result with =, so age becomes 17. Then 17 * 2 = 34.',
        },
        setup: () => ({ size: 6, target: {} }),
      },
      {
        id: 'n-5', type: 'fix', title: 'Fix the names', mode: 'calc',
        goal: 'Fix the three lines so the last one gives 15.',
        brief: '<p>Three small naming mistakes. Read each error in the Console: it gives the line and a hint. Use <b>camelCase</b> for your variable names.</p>',
        hint: 'playerScore (no space) · int (lowercase) · the name must be written exactly the same every time.',
        starter: `int player score = 10
Int bonus = 5
playerscore + bonus
`,
        solution: `int playerScore = 10
int bonus = 5
playerScore + bonus`,
        expectLast: '15',
        setup: () => ({ size: 6, target: {} }),
      },
    ],
  },
  {
    id: 2, name: 'Text', concept: 'Strings', mode: 'calc',
    intro: 'Text (string) is a row of characters. The strip under the scene shows every character with its position.',
    challenges: [
      {
        id: 't-1', type: 'observe', title: 'A row of characters', mode: 'calc', textStrip: true,
        goal: 'Step through the lines and watch the character strip.',
        brief: '<p>A <code>string</code> is a row of <b>characters</b>, and each one has a <b>position</b> (index) that starts at <b>0</b>. <code>Length</code> counts the characters. <code>[0]</code> reads one character: a <code>char</code>, written with single quotes.</p>',
        hint: 'Watch the numbers under each letter in the strip.',
        starter: `"Hello"
"Hello".Length
"Hello"[0]
"Hello"[4]
"Hello".ToUpper()
`,
        setup: () => ({ size: 6, target: {} }),
      },
      {
        id: 't-2', type: 'predict', title: 'Counting from zero', mode: 'calc', textStrip: true,
        goal: 'Predict which character word[1] gives.',
        brief: '<p>Almost every programming language counts positions from <b>0</b>, not from 1. It feels strange at first, and it causes many bugs.</p>',
        starter: `string word = "drone"
word[1]
`,
        question: {
          prompt: 'What is word[1]?',
          options: ["'d'", "'r'", "'o'"], answer: "'r'",
          actual: ({ results }) => results.at(-1)?.text,
          explain: "Positions start at 0: d is 0, r is 1, o is 2. So word[1] is 'r', the second character.",
        },
        setup: () => ({ size: 6, target: {} }),
      },
      {
        id: 't-3', type: 'predict', title: 'The last letter', mode: 'calc', textStrip: true,
        goal: 'Predict the result of the last line.',
        brief: '<p>If a text has 6 characters, what is the position of the last one? Use the strip to check.</p>',
        starter: `string lab = "CARROT"
lab.Length
lab[lab.Length - 1]
`,
        question: {
          prompt: 'What is lab[lab.Length - 1]?',
          options: ["'T'", "'O'", 'An error'], answer: "'T'",
          actual: ({ results }) => results.at(-1)?.text,
          explain: 'Length is 6, but positions go from 0 to 5. So the last character is always at Length - 1. lab[lab.Length] would be an error: position 6 does not exist.',
        },
        setup: () => ({ size: 6, target: {} }),
      },
      {
        id: 't-4', type: 'complete', title: 'Say hello', mode: 'calc', textStrip: true,
        goal: 'Fill the gap so the last line gives "Hello, Ada!".',
        brief: '<p><code>+</code> joins pieces of text. You can join <b>literal</b> text (between quotes) with a <b>variable</b> that holds text. Careful with the spaces: they are characters too.</p>',
        hint: 'Put the variable name in the gap, without quotes.',
        starter: `string name = "Ada"
"Hello, " + ___ + "!"
`,
        solution: `string name = "Ada"
"Hello, " + name + "!"`,
        expectLast: '"Hello, Ada!"',
        setup: () => ({ size: 6, target: {} }),
      },
      {
        id: 't-5', type: 'predict', title: 'A piece of text', mode: 'calc', textStrip: true,
        goal: 'Predict what Substring(0, 3) gives.',
        brief: '<p><code>Substring(start, length)</code> cuts a piece of text: it starts at a position and takes a number of characters.</p>',
        starter: `"Blender".Substring(0, 3)
`,
        question: {
          prompt: 'What is "Blender".Substring(0, 3)?',
          options: ['"Ble"', '"Blen"', '"len"'], answer: '"Ble"',
          actual: ({ results }) => results.at(-1)?.text,
          explain: 'Start at position 0 and take 3 characters: B, l, e. The second number is how many characters, not where to stop. "Blender".Substring(2, 3) would be "end".',
        },
        setup: () => ({ size: 6, target: {} }),
      },
      {
        id: 't-6', type: 'create', title: 'Fill in the template', mode: 'calc', textStrip: true,
        goal: 'Make the last line give "Ada is 16" using $"…" and the two variables.',
        brief: '<p>Joining text with <code>+</code> gets messy. <b>Interpolation</b> is cleaner: write <code>$</code> before the quotes and put values inside <code>{ }</code>: <code>$"{name} is {age}"</code>. If the variables change, the text changes with them.</p>',
        hint: '$"{name} is {age}"',
        starter: `string name = "Ada"
int age = 16
"Ada is 16"
`,
        solution: `string name = "Ada"
int age = 16
$"{name} is {age}"`,
        expectLast: '"Ada is 16"',
        requires: [{ feature: 'interpolation', label: 'Use $"…" with {name} and {age}' }],
        setup: () => ({ size: 6, target: {} }),
      },
      {
        id: 't-7', type: 'fix', title: 'Text traps', mode: 'calc', textStrip: true,
        goal: 'Fix the three lines so the last one gives "BARCELONA".',
        brief: '<p>Three classic text mistakes: the wrong quotes, a lowercase name, and a method without brackets. The compiler tells you where each one is.</p>',
        hint: 'Double quotes for text · Length with a capital L · ToUpper() needs brackets.',
        starter: `string city = 'Barcelona'
city.length
city.ToUpper
`,
        solution: `string city = "Barcelona"
city.Length
city.ToUpper()`,
        expectLast: '"BARCELONA"',
        setup: () => ({ size: 6, target: {} }),
      },
    ],
  },
  {
    id: 3, name: 'Logic', concept: 'True or false', mode: 'calc',
    intro: 'Programs make decisions with questions whose answer is true or false. Each answer lights a lamp: green for true, red for false.',
    challenges: [
      {
        id: 'l-1', type: 'observe', title: 'True or false', mode: 'calc', lamps: true,
        goal: 'Step through the comparisons and watch the lamps.',
        brief: '<p>A <b>comparison</b> asks a question, and the answer is a <code>bool</code>: <code>true</code> or <code>false</code>. <code>==</code> asks "is it equal?" (two equals signs!), <code>!=</code> asks "is it different?".</p>',
        hint: 'Each line lights one lamp.',
        starter: `5 > 3
5 < 3
2 + 2 == 4
2 + 2 != 4
10 >= 10
`,
        setup: () => ({ size: 6, target: {} }),
      },
      {
        id: 'l-2', type: 'predict', title: 'Store or compare?', mode: 'calc', lamps: true,
        goal: 'Predict what the last line gives.',
        brief: '<p>One of the most common mistakes: <code>=</code> <b>stores</b> a value in a box. <code>==</code> <b>compares</b> two values and gives true or false.</p>',
        starter: `int x = 3
x == 5
x = 5
x == 5
`,
        question: {
          prompt: 'What does the last line (x == 5) give?',
          options: ['true', 'false'], answer: 'true',
          actual: ({ results }) => results.at(-1)?.text,
          explain: 'Line 2 compares: 3 == 5 is false. Line 3 stores 5 in x (=). So on line 4, x == 5 is true. The same question can have different answers at different moments.',
        },
        setup: () => ({ size: 6, target: {} }),
      },
      {
        id: 'l-3', type: 'predict', title: 'Both at once', mode: 'calc', lamps: true,
        goal: 'Predict whether Ada can enter.',
        brief: '<p><code>&amp;&amp;</code> means <b>and</b>: the result is true only if <b>both</b> sides are true. The panel shows how the computer works it out, one step at a time.</p>',
        starter: `int age = 16
bool hasTicket = true
age >= 18 && hasTicket
`,
        question: {
          prompt: 'What does age >= 18 && hasTicket give?',
          options: ['true', 'false'], answer: 'false',
          actual: ({ results }) => results.at(-1)?.text,
          explain: 'age >= 18 is 16 >= 18, which is false. With &&, one false side is enough to make everything false: false && true is false.',
        },
        setup: () => ({ size: 6, target: {} }),
      },
      {
        id: 'l-4', type: 'classify', title: 'And, or, not',
        goal: 'Decide whether each expression is true or false.',
        brief: '<p>Here <code>int age = 16;</code> and <code>bool member = true;</code>.</p><p><code>&amp;&amp;</code> <b>and</b>: both must be true.<br><code>||</code> <b>or</b>: at least one must be true.<br><code>!</code> <b>not</b>: flips true and false.</p><p>The computer checks your answers by running each line.</p>',
        hint: 'Work out each comparison first, then combine them.',
        classify: { categories: ['true', 'false'], judge: 'bool', items: [
          { text: 'age > 10 && age < 20', answer: 'true' },
          { text: 'age > 18 || member', answer: 'true' },
          { text: '!member', answer: 'false' },
          { text: 'age == 16 && !member', answer: 'false' },
          { text: 'age < 12 || age > 65', answer: 'false' },
          { text: '!(age >= 18)', answer: 'true' },
        ] },
        setup: () => ({ size: 6, target: {} }),
      },
      {
        id: 'l-5', type: 'complete', title: 'Can I ride?', mode: 'calc', lamps: true,
        goal: 'Fill the gap: to ride you must be at least 12 AND at least 130 cm tall.',
        brief: '<p>Turn a rule written in words into code. Leo is 10 and 140 cm tall, so he <b>cannot</b> ride: the last line must be <code>false</code>.</p>',
        hint: 'The word AND becomes &&.',
        starter: `int age = 10
int height = 140
age >= 12 ___ height >= 130
`,
        solution: `int age = 10
int height = 140
age >= 12 && height >= 130`,
        expectLast: 'false',
        requires: [{ feature: 'logic', label: 'Combine both conditions' }],
        setup: () => ({ size: 6, target: {} }),
      },
      {
        id: 'l-6', type: 'create', title: 'Even or odd', mode: 'calc', lamps: true,
        goal: 'Write two lines: is a even? is b even? (false, then true)',
        brief: '<p>A number is <b>even</b> when the remainder of dividing it by 2 is 0. Remember <code>%</code> from the calculator? Write one comparison for <code>a</code> and one for <code>b</code>, using the variables (not the numbers).</p>',
        hint: 'a % 2 == 0',
        starter: `int a = 7
int b = 10
`,
        solution: `int a = 7
int b = 10
a % 2 == 0
b % 2 == 0`,
        expectTail: ['false', 'true'],
        requires: [{ feature: 'modulo', label: 'Use %' }],
        setup: () => ({ size: 6, target: {} }),
      },
      {
        id: 'l-7', type: 'fix', title: 'Logic bugs', mode: 'calc', lamps: true,
        goal: 'Fix the program so the last line gives true.',
        brief: '<p>Three typical logic typos: an operator written backwards, a single <code>&amp;</code> instead of <code>&amp;&amp;</code>, and a name with the wrong capital letter.</p>',
        hint: '>= (not =>) · && (two) · excellent (lowercase)',
        starter: `int score = 75
bool passed = score => 50
bool excellent = score > 90 & score <= 100
passed && !Excellent
`,
        solution: `int score = 75
bool passed = score >= 50
bool excellent = score > 90 && score <= 100
passed && !excellent`,
        expectLast: 'true',
        setup: () => ({ size: 6, target: {} }),
      },
    ],
  },
  {
    id: 4, name: 'First instructions', concept: 'Statements',
    intro: 'Programs are lists of instructions. Each one ends with ; and many of them call a method to do something.',
    challenges: [
      {
        id: '0-1', type: 'observe', title: 'Your first instructions',
        goal: 'Follow the program with Step (F10): each instruction runs in order.',
        brief: '<p>Until now each line was a calculation. Real programs are made of <b>instructions</b>: orders that <b>do</b> something. Each instruction ends with a semicolon <code>;</code>.</p><p><code>Console.WriteLine("Hello!")</code> <b>calls</b> a method: <code>Console</code> is who does it, <code>WriteLine</code> is what it does, and the value in brackets is what it works with. <code>drone.Build(3)</code> asks the drone to build a tower of 3. Press <b>Step</b> and follow it.</p>',
        hint: 'Keep pressing Step until the Console says "Done". You can also press Run to see it all at once.',
        starter: `// Lines that start with // are comments: the computer ignores them.
Console.WriteLine("Hello!");
drone.Build(3);
drone.Build(5);
drone.Build(2);
Console.WriteLine("Done");
`,
        labels: true,
        setup: () => ({ size: 6, maxHeight: 16, viewHeight: 5, target: {} }),
      },
      {
        id: '0-6', type: 'parsons', title: 'Put it in order',
        goal: 'Build stairs of 1, 2, 3 and 4 blocks, then print "Stairs!".',
        brief: '<p>The lines are already written but mixed up, and one of them is not needed. Click a line to add it to your program, drag to reorder, and press <b>Run</b>.</p>',
        hint: 'The first tower (height 1) is built first. The extra line builds a tower of 5.',
        parsons: { lines: ['drone.Build(1);', 'drone.Build(2);', 'drone.Build(3);', 'drone.Build(4);', 'Console.WriteLine("Stairs!");'], distractors: ['drone.Build(5);'] },
        expectOutput: ['Stairs!'],
        labels: true,
        setup: () => ({ size: 6, maxHeight: 16, viewHeight: 5, target: { '0,0': ['White'], '1,0': Array(2).fill('White'), '2,0': Array(3).fill('White'), '3,0': Array(4).fill('White') } }),
      },
      {
        id: '0-7', type: 'fix', title: 'The broken calculator',
        goal: 'Make the Console print exactly: 2 + 3 = 5 and 10 / 4 = 2.5',
        brief: '<p>This program has one error the compiler finds… and one it <b>can\'t</b> find: it runs, but prints the wrong result. That is a <b>logic error</b>. When text and numbers meet with <code>+</code>, C# joins them as text, from left to right.</p>',
        hint: 'Use brackets to calculate first: "2 + 3 = " + (2 + 3). And C# is case-sensitive: WriteLine.',
        starter: `Console.WriteLine("2 + 3 = " + 2 + 3);
Console.Writeline("10 / 4 = " + 10 / 4.0);
`,
        solution: `Console.WriteLine("2 + 3 = " + (2 + 3));
Console.WriteLine("10 / 4 = " + 10 / 4.0);`,
        expectOutput: ['2 + 3 = 5', '10 / 4 = 2.5'],
        setup: () => ({ size: 6, maxHeight: 16, viewHeight: 4, target: {} }),
      },
    ],
  },
  {
    id: 5, name: 'The drone', concept: 'Sequence',
    intro: 'A program is a list of instructions. The computer runs them in order, top to bottom, one at a time.',
    challenges: [
      {
        id: '1-1', title: 'First block',
        goal: 'Place a red block on the ghost tile at (3, 0).',
        brief: '<p>The drone starts at <b>(0, 0)</b>. Each <code>drone.Move(Direction.Right);</code> moves it <b>one</b> tile. Press <b>Run</b> to see what the program does now, then add the lines it is missing.</p>',
        hint: 'You need three Move lines before Place. Copy a line with Ctrl+C and paste it with Ctrl+V.',
        starter: `// Press Run ▶ to see what this program does.
// Then add lines so the red block lands on the ghost tile.
drone.Move(Direction.Right);
drone.Place(Color.Red);
`,
        solution: `drone.Move(Direction.Right);
drone.Move(Direction.Right);
drone.Move(Direction.Right);
drone.Place(Color.Red);`,
        setup: () => ({ target: { '3,0': ['Red'] } }),
      },
      {
        id: '1-2', title: 'Order matters',
        goal: 'Build a tower at (2, 2): Blue at the bottom, White in the middle, Red on top.',
        brief: '<p>Blocks stack in the order you place them. The program is almost right, but the computer does <b>exactly</b> what you write, in the order you write it. Use <b>Step</b> to follow it one line at a time.</p>',
        hint: 'Reorder the three Place lines. The first block placed ends up at the bottom.',
        starter: `drone.Move(Direction.Right);
drone.Move(Direction.Right);
drone.Move(Direction.Forward);
drone.Move(Direction.Forward);
drone.Place(Color.Red);
drone.Place(Color.White);
drone.Place(Color.Blue);
`,
        solution: `drone.Move(Direction.Right);
drone.Move(Direction.Right);
drone.Move(Direction.Forward);
drone.Move(Direction.Forward);
drone.Place(Color.Blue);
drone.Place(Color.White);
drone.Place(Color.Red);`,
        setup: () => ({ target: { '2,2': ['Blue', 'White', 'Red'] } }),
      },
      {
        id: '1-3', type: 'fix', title: 'Read the errors',
        goal: 'Fix the program so it places green blocks at (1, 0) and (2, 0).',
        brief: '<p>This program has <b>three mistakes</b>. Before running anything, the <b>compiler</b> checks the whole program. If it finds a mistake, nothing runs. Press Run and read the Console: it tells you the line and what is wrong.</p>',
        hint: 'Look for a missing ; and remember that C# is case-sensitive: Place is not place.',
        starter: `// This program has 3 mistakes. Press Run and read the Console.
drone.Move(Direction.Right)
drone.place(Color.Green);
drone.Move(Direction.Right);
drone.Place(Color.green);
`,
        solution: `drone.Move(Direction.Right);
drone.Place(Color.Green);
drone.Move(Direction.Right);
drone.Place(Color.Green);`,
        setup: () => ({ target: { '1,0': ['Green'], '2,0': ['Green'] } }),
      },
    ],
  },
  {
    id: 6, name: 'Variables', concept: 'Store values',
    intro: 'A variable is a named box that stores a value. Every variable has a type that says what it can hold.',
    challenges: [
      {
        id: '2-p1', type: 'predict', title: 'A box, not an equation',
        goal: 'Predict what the Console will print.',
        brief: '<p>In maths, <code>x = x + 1</code> is impossible. In C#, <code>=</code> means <b>store</b>: calculate the right side, then put the result in the box on the left.</p>',
        starter: `int x = 5;
x = x + 1;
x = x * 2;
Console.WriteLine(x);
`,
        question: {
          prompt: 'What will the Console print?',
          options: ['5', '6', '11', '12'], answer: '12',
          actual: ({ output }) => output[0] || '',
          explain: 'x starts at 5. x + 1 is 6, stored in x. Then x * 2 is 12, stored in x. The box only keeps its latest value.',
        },
        setup: () => ({ target: {} }),
      },
      {
        id: '2-p2', type: 'predict', title: 'A copy, not a link',
        goal: 'Predict what the Console will print.',
        brief: '<p><code>int b = a;</code> puts a <b>copy</b> of a\'s value in b. What happens to b when a changes later?</p>',
        starter: `int a = 3;
int b = a;
a = 10;
Console.WriteLine(b);
`,
        question: {
          prompt: 'What will the Console print?',
          options: ['3', '10', '13'], answer: '3',
          actual: ({ output }) => output[0] || '',
          explain: 'b got a copy of the 3 when line 2 ran. Changing a afterwards does not change b: they are two separate boxes.',
        },
        setup: () => ({ target: {} }),
      },
      {
        id: '2-o1', type: 'parsons', title: 'Swap two boxes',
        goal: 'Swap the values of a and b, then print: a = 7, b = 3',
        brief: '<p>A classic puzzle: to swap two glasses of juice you need a third, empty glass. Order the lines. Two of them are traps.</p>',
        hint: 'Save a in temp first. Then a = b. Then b = temp.',
        parsons: {
          lines: ['int a = 3;', 'int b = 7;', 'int temp = a;', 'a = b;', 'b = temp;', 'Console.WriteLine($"a = {a}, b = {b}");'],
          distractors: ['b = a;', 'int a = b;'],
        },
        expectOutput: ['a = 7, b = 3'],
        setup: () => ({ target: {} }),
      },
      {
        id: '2-1', title: 'Store a value',
        goal: 'Place blue blocks at (3, 0) and (6, 0).',
        brief: '<p><code>int distance = 2;</code> creates a box called <b>distance</b> that holds the whole number 2. Every line that uses <code>distance</code> reads what is in the box. Change the value <b>once</b> and both moves change. Watch the <b>Memory</b> panel.</p>',
        hint: 'Change only the number in the first line.',
        starter: `int distance = 2;

drone.Move(Direction.Right, distance);
drone.Place(Color.Blue);
drone.Move(Direction.Right, distance);
drone.Place(Color.Blue);
`,
        solution: `int distance = 3;

drone.Move(Direction.Right, distance);
drone.Place(Color.Blue);
drone.Move(Direction.Right, distance);
drone.Place(Color.Blue);`,
        requires: [{ feature: 'variable', label: 'Use a variable' }],
        setup: () => ({ target: { '3,0': ['Blue'], '6,0': ['Blue'] } }),
      },
      {
        id: '2-2', title: 'Whole numbers',
        goal: 'Yellow at the start (0, 0), Orange in the middle (3, 0), Yellow at the end (6, 0) of a 7-tile wall.',
        brief: '<p>Variables can be calculated from other variables. But careful: an <code>int</code> only holds <b>whole numbers</b>. What is <code>7 / 2</code> in C#? Run the program and check <code>middle</code> in the Memory panel.</p><p>Finish the program using <code>width</code> and <code>middle</code> to reach the last tile.</p>',
        hint: 'The last tile is at width - 1. The drone is already at middle, so it has to move (width - 1) - middle more tiles.',
        starter: `int width = 7;
int middle = width / 2;     // What value does middle get?
Console.WriteLine("middle = " + middle);

drone.Place(Color.Yellow);                // start of the wall
drone.Move(Direction.Right, middle);
drone.Place(Color.Orange);                // middle
// Move to the last tile of the wall and place Yellow.
`,
        solution: `int width = 7;
int middle = width / 2;
Console.WriteLine("middle = " + middle);
drone.Place(Color.Yellow);
drone.Move(Direction.Right, middle);
drone.Place(Color.Orange);
drone.Move(Direction.Right, width - 1 - middle);
drone.Place(Color.Yellow);`,
        requires: [{ feature: 'variable', label: 'Use variables' }],
        setup: () => ({ target: { '0,0': ['Yellow'], '3,0': ['Orange'], '6,0': ['Yellow'] } }),
      },
      {
        id: '2-3', type: 'fix', title: 'Types',
        goal: 'Build two towers, Green · Green · Red, at (1, 1) and (4, 1).',
        brief: '<p>Every variable has a <b>type</b>: <code>int</code>, <code>double</code>, <code>bool</code>, <code>string</code>… and here also <code>Color</code>. The compiler refuses to put a value of the wrong type in a box. Fix the error, then build the second tower using the same variables.</p>',
        hint: 'Colors are written Color.Red, not "Red" (that is a string). Then move 3 tiles right and repeat the three Place lines.',
        starter: `Color wall = Color.Green;
Color roof = "Red";
string label = "Tower A";

Console.WriteLine("Building " + label);
drone.Move(Direction.Right);
drone.Move(Direction.Forward);
drone.Place(wall);
drone.Place(wall);
drone.Place(roof);

// Build the same tower at (4, 1) and print "Building Tower B".
`,
        solution: `Color wall = Color.Green;
Color roof = Color.Red;
string label = "Tower A";
Console.WriteLine("Building " + label);
drone.Move(Direction.Right);
drone.Move(Direction.Forward);
drone.Place(wall);
drone.Place(wall);
drone.Place(roof);
label = "Tower B";
Console.WriteLine("Building " + label);
drone.Move(Direction.Right, 3);
drone.Place(wall);
drone.Place(wall);
drone.Place(roof);`,
        requires: [{ declType: 'Color', label: 'Store a color in a Color variable' }],
        setup: () => ({ target: { '1,1': ['Green', 'Green', 'Red'], '4,1': ['Green', 'Green', 'Red'] } }),
      },
    ],
  },
  {
    id: 7, name: 'Loops', concept: 'Repeat',
    intro: 'A loop repeats a block of code. The loop variable changes on every turn, so each turn can do something slightly different.',
    challenges: [
      {
        id: '3-p1', type: 'predict', title: 'Count the turns',
        goal: 'Predict how many towers the loop builds.',
        brief: '<p>Look carefully at the condition: <code>&lt;=</code> means "less than <b>or equal</b>". Counting starts at 0.</p>',
        starter: `for (int i = 0; i <= 4; i++)
{
    drone.Build(i + 1);
}
`,
        question: {
          prompt: 'How many towers will be built?',
          options: ['4', '5', '6'], answer: '5',
          actual: ({ world }) => String(world.columns.size),
          explain: 'i takes the values 0, 1, 2, 3 and 4: five turns. With i < 4 it would be four. Loops that start at 0 and use < run exactly N times: for (int i = 0; i < 5; i++).',
        },
        labels: true,
        setup: () => ({ viewHeight: 5, target: {} }),
      },
      {
        id: '3-1', title: 'The wall',
        goal: 'Build a wall of 7 blue blocks from (0, 0) to (6, 0).',
        brief: '<p>Without a loop you would need 14 lines. <code>for (int i = 0; i &lt; 3; i++)</code> has three parts: <b>start</b> <code>i = 0</code>, <b>condition</b> <code>i &lt; 3</code> (checked before every turn) and <b>step</b> <code>i++</code> (after every turn). Watch <code>i</code> in Memory and the <b>×</b> counters next to the line numbers.</p>',
        hint: 'Change only the number in the condition.',
        starter: `for (int i = 0; i < 3; i++)
{
    drone.Place(Color.Blue);
    drone.Move(Direction.Right);
}
`,
        solution: `for (int i = 0; i < 7; i++)
{
    drone.Place(Color.Blue);
    drone.Move(Direction.Right);
}`,
        requires: [{ feature: 'for', label: 'Use a for loop' }, { maxStatements: 3, label: 'At most 3 instructions' }],
        setup: () => ({ target: fill((x, z) => z === 0 && x < 7 ? ['Blue'] : null) }),
      },
      {
        id: '3-2', title: 'Use the counter',
        goal: 'Place purple blocks on every other tile: (0, 0), (2, 0), (4, 0), (6, 0).',
        brief: '<p><code>drone.MoveTo(x, z)</code> flies straight to a tile. The loop variable <code>i</code> is a normal <code>int</code>: you can use it in calculations. Which calculation turns 0, 1, 2, 3 into 0, 2, 4, 6?</p>',
        hint: 'Multiply: i * 2.',
        starter: `for (int i = 0; i < 4; i++)
{
    drone.MoveTo(i, 0);
    drone.Place(Color.Purple);
}
`,
        solution: `for (int i = 0; i < 4; i++)
{
    drone.MoveTo(i * 2, 0);
    drone.Place(Color.Purple);
}`,
        requires: [{ feature: 'for', label: 'Use a for loop' }, { maxStatements: 3, label: 'At most 3 instructions' }],
        setup: () => ({ target: fill((x, z) => z === 0 && x % 2 === 0 ? ['Purple'] : null) }),
      },
      {
        id: '3-3', title: 'Stairs',
        goal: 'Build orange stairs: 1 block at (1, 0), 2 at (2, 0)… up to 5 at (5, 0).',
        brief: '<p>A loop can go <b>inside</b> another loop. The inner loop runs completely on every turn of the outer loop. Look at the <b>for scopes</b> in Memory: the inner <code>h</code> is created and destroyed on every turn.</p>',
        hint: 'Inside the outer loop add: for (int h = 0; h < x; h++) { drone.Place(Color.Orange); }',
        starter: `for (int x = 1; x <= 5; x++)
{
    drone.MoveTo(x, 0);
    // Add an inner loop here that places x blocks.
    drone.Place(Color.Orange);
}
`,
        solution: `for (int x = 1; x <= 5; x++)
{
    drone.MoveTo(x, 0);
    for (int h = 0; h < x; h++)
    {
        drone.Place(Color.Orange);
    }
}`,
        requires: [{ feature: 'nestedLoop', label: 'Use a loop inside a loop' }],
        setup: () => ({ target: fill((x, z) => z === 0 && x >= 1 && x <= 5 ? repeat('Orange', x) : null) }),
      },
      {
        id: '3-o1', type: 'parsons', title: 'Loop inside a loop',
        goal: 'Cover a 4 × 4 floor with blue blocks.',
        brief: '<p>Order the lines to build a floor with two nested loops. The braces <code>{ }</code> are lines too: they mark where each loop starts and ends.</p>',
        hint: 'for x → { → for z → { → MoveTo → Place → } → }',
        parsons: {
          lines: ['for (int x = 0; x < 4; x++)', '{', 'for (int z = 0; z < 4; z++)', '{', 'drone.MoveTo(x, z);', 'drone.Place(Color.Blue);', '}', '}'],
          distractors: ['drone.MoveTo(z, x + 1);'],
        },
        setup: () => ({ target: fill((x, z) => x < 4 && z < 4 ? ['Blue'] : null) }),
      },
      {
        id: '3-4', title: 'The floor',
        goal: 'Cover a 6 × 6 floor with green blocks, from (0, 0) to (5, 5).',
        brief: '<p>Two nested loops visit every tile of a grid: one for <code>x</code>, one for <code>z</code>. This is how many 3D tools place instances on a grid.</p>',
        hint: 'for x from 0 to 5 → for z from 0 to 5 → MoveTo(x, z) and Place.',
        starter: `// Cover a 6 × 6 floor with Green blocks.
// Tip: one loop for x, and one loop for z inside it.
`,
        solution: `for (int x = 0; x < 6; x++)
{
    for (int z = 0; z < 6; z++)
    {
        drone.MoveTo(x, z);
        drone.Place(Color.Green);
    }
}`,
        requires: [{ feature: 'nestedLoop', label: 'Use a loop inside a loop' }, { maxStatements: 4, label: 'At most 4 instructions' }],
        setup: () => ({ target: fill((x, z) => x < 6 && z < 6 ? ['Green'] : null) }),
      },
      {
        id: '3-5', title: 'Fill it up',
        goal: 'Make every column in the first row exactly 6 blocks tall, filling with Blue.',
        brief: '<p>The starting heights <b>change every time you press Run</b>, so you can\'t know how many blocks each column needs. A <code>while</code> loop repeats <b>as long as</b> its condition is true: <code>while (drone.Height &lt; 6)</code>.</p>',
        hint: 'Inside the for loop, after MoveTo: while (drone.Height < 6) { drone.Place(Color.Blue); }',
        randomized: true,
        starter: `// The white columns change height every run.
for (int x = 0; x < 8; x++)
{
    drone.MoveTo(x, 0);
    // Keep placing Blue while the column is lower than 6.
}
`,
        solution: `for (int x = 0; x < 8; x++)
{
    drone.MoveTo(x, 0);
    while (drone.Height < 6)
    {
        drone.Place(Color.Blue);
    }
}`,
        requires: [{ feature: 'while', label: 'Use a while loop' }],
        setup: rand => {
          const columns = {}, target = {};
          for (let x = 0; x < SIZE; x++) {
            const h = Math.floor(rand() * 6);
            if (h) columns[`${x},0`] = repeat('White', h);
            target[`${x},0`] = [...repeat('White', h), ...repeat('Blue', 6 - h)];
          }
          return { columns, target };
        },
      },
    ],
  },
  {
    id: 8, name: 'Conditions', concept: 'Decide',
    intro: 'An if statement lets the program decide. The condition is evaluated to true or false, and only one path runs.',
    challenges: [
      {
        id: '4-p1', type: 'predict', title: 'Which path?',
        goal: 'Predict what the Console will print.',
        brief: '<p>An <code>if / else if / else</code> chain checks the conditions from top to bottom and runs <b>only the first</b> one that is true.</p>',
        starter: `int x = 7;

if (x > 5 && x % 2 == 0)
{
    Console.WriteLine("A");
}
else if (x > 5)
{
    Console.WriteLine("B");
}
else
{
    Console.WriteLine("C");
}
`,
        question: {
          prompt: 'What will the Console print?',
          options: ['A', 'B', 'C', 'A and B'], answer: 'B',
          actual: ({ output }) => output.join(' and '),
          explain: '7 > 5 is true, but 7 % 2 == 0 is false (7 is odd), so the whole && is false. Then x > 5 is true: B runs and the chain stops.',
        },
        setup: () => ({ target: {} }),
      },
      {
        id: '4-1', title: 'Checkerboard',
        goal: 'Cover 6 × 6 tiles: Red where (x + z) is even, White where it is odd.',
        brief: '<p><code>%</code> gives the <b>remainder</b> of a division: <code>7 % 2</code> is 1, <code>8 % 2</code> is 0. So <code>(x + z) % 2 == 0</code> is true on every other tile. Use <b>Step</b> and read how each condition is evaluated.</p>',
        hint: 'if ((x + z) % 2 == 0) { place Red } else { place White }',
        starter: `for (int x = 0; x < 6; x++)
{
    for (int z = 0; z < 6; z++)
    {
        drone.MoveTo(x, z);
        drone.Place(Color.Red);
    }
}
`,
        solution: `for (int x = 0; x < 6; x++)
{
    for (int z = 0; z < 6; z++)
    {
        drone.MoveTo(x, z);
        if ((x + z) % 2 == 0)
        {
            drone.Place(Color.Red);
        }
        else
        {
            drone.Place(Color.White);
        }
    }
}`,
        requires: [{ feature: 'if', label: 'Use if' }, { feature: 'else', label: 'Use else' }],
        setup: () => ({ target: fill((x, z) => x < 6 && z < 6 ? [(x + z) % 2 === 0 ? 'Red' : 'White'] : null) }),
      },
      {
        id: '4-2', title: 'The frame',
        goal: 'Build only the border of a 7 × 7 square in Purple.',
        brief: '<p><code>||</code> means <b>or</b>: the condition is true if either side is true. <code>&amp;&amp;</code> means <b>and</b>: both sides must be true. A tile is on the border if x is 0, <b>or</b> x is 6, <b>or</b> z is 0, <b>or</b> z is 6.</p>',
        hint: 'if (x == 0 || x == 6 || z == 0 || z == 6)',
        starter: `for (int x = 0; x < 7; x++)
{
    for (int z = 0; z < 7; z++)
    {
        if (x == 0)
        {
            drone.MoveTo(x, z);
            drone.Place(Color.Purple);
        }
    }
}
`,
        solution: `for (int x = 0; x < 7; x++)
{
    for (int z = 0; z < 7; z++)
    {
        if (x == 0 || x == 6 || z == 0 || z == 6)
        {
            drone.MoveTo(x, z);
            drone.Place(Color.Purple);
        }
    }
}`,
        requires: [{ feature: 'if', label: 'Use if' }, { feature: 'logic', label: 'Combine conditions with || or &&' }],
        setup: () => ({ target: fill((x, z) => x < 7 && z < 7 && (x === 0 || x === 6 || z === 0 || z === 6) ? ['Purple'] : null) }),
      },
      {
        id: '4-3', title: 'Read the floor',
        goal: 'Red tile → 2 Red blocks · Blue tile → 1 Blue block · empty tile → nothing.',
        brief: '<p>The painted floor <b>changes every run</b>. <code>drone.Ground</code> tells you the color of the tile under the drone. Chain decisions with <code>else if</code>. Your program is also tested on other floors, so it has to work for any pattern.</p>',
        hint: 'else if (drone.Ground == Color.Blue) { drone.Place(Color.Blue); }  and place Red twice in the first branch.',
        randomized: true,
        starter: `for (int x = 0; x < 8; x++)
{
    for (int z = 0; z < 8; z++)
    {
        drone.MoveTo(x, z);
        if (drone.Ground == Color.Red)
        {
            drone.Place(Color.Red);
        }
    }
}
`,
        solution: `for (int x = 0; x < 8; x++)
{
    for (int z = 0; z < 8; z++)
    {
        drone.MoveTo(x, z);
        if (drone.Ground == Color.Red)
        {
            drone.Place(Color.Red);
            drone.Place(Color.Red);
        }
        else if (drone.Ground == Color.Blue)
        {
            drone.Place(Color.Blue);
        }
    }
}`,
        requires: [{ feature: 'if', label: 'Use if' }, { feature: 'else', label: 'Use else if' }],
        setup: rand => {
          const ground = {}, target = {};
          for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) {
            const r = rand();
            if (r < 0.14) { ground[`${x},${z}`] = 'Red'; target[`${x},${z}`] = ['Red', 'Red']; }
            else if (r < 0.28) { ground[`${x},${z}`] = 'Blue'; target[`${x},${z}`] = ['Blue']; }
          }
          return { ground, target };
        },
      },
    ],
  },
  {
    id: 9, name: 'Methods', concept: 'Reuse',
    intro: 'A method gives a name to a group of instructions. Write it once, then call it as many times as you need.',
    challenges: [
      {
        id: 'm-1', type: 'observe', title: 'Write once, use many times',
        goal: 'Follow the program with Step Into (F11): watch it jump into Tower and come back.',
        brief: '<p>A <b>method</b> is a new instruction that you invent. <code>void Tower(int height)</code> <b>declares</b> it: <code>void</code> means it gives nothing back, <code>Tower</code> is its name (PascalCase) and <code>int height</code> is a <b>parameter</b>: a variable that gets its value from each call.</p><p><code>Tower(2);</code> <b>calls</b> it: the program jumps into the method with <code>height = 2</code>, runs it, and comes back to the next line. <b>Step Into</b> follows it inside; <b>Step</b> runs the whole call at once. Watch the Memory panel: each call gets its own frame.</p>',
        hint: 'Use Step Into (F11) to go inside the method and Step (F10) to run a call in one go.',
        starter: `// The main program: three calls.
Tower(2);
Tower(4);
Tower(3);

// The method: written once, below the main program.
void Tower(int height)
{
    Console.WriteLine("Tower of " + height);
    drone.Build(height, Color.Blue);
}
`,
        labels: true,
        setup: () => ({ size: 6, maxHeight: 8, viewHeight: 5, target: {} }),
      },
      {
        id: 'm-2', type: 'predict', title: 'Written, but never called',
        goal: 'Predict what the Console will print.',
        brief: '<p>This program declares a method called <code>Hello</code>. Read it carefully: what does the computer actually run?</p>',
        starter: `Console.WriteLine("Start");
Console.WriteLine("End");

void Hello()
{
    Console.WriteLine("Hello!");
}
`,
        question: {
          prompt: 'What will the Console print?',
          options: ['Start, End', 'Start, Hello!, End', 'Hello!, Start, End'], answer: 'Start, End',
          actual: ({ output }) => output.join(', '),
          explain: 'Declaring a method only teaches the computer a new instruction. It runs only when something calls it: Hello();. The compiler even warns you about it (CS8321).',
        },
        setup: () => ({ size: 6, target: {} }),
      },
      {
        id: 'm-3', type: 'create', title: 'Stop copying',
        goal: 'Build four houses (2 White blocks + a Red roof) using a method House().',
        brief: '<p>The code for one house is written twice, and you need <b>four</b>. Copying works, but every copy is a place for mistakes. Put the four lines of one house inside a method called <code>House</code>, then call it four times.</p>',
        hint: 'void House() { the four lines } and above it: House(); four times.',
        starter: `// One house, then another… Make a method instead.
drone.Place(Color.White);
drone.Place(Color.White);
drone.Place(Color.Red);
drone.Move(Direction.Right);

drone.Place(Color.White);
drone.Place(Color.White);
drone.Place(Color.Red);
drone.Move(Direction.Right);
`,
        solution: `House();
House();
House();
House();

void House()
{
    drone.Place(Color.White);
    drone.Place(Color.White);
    drone.Place(Color.Red);
    drone.Move(Direction.Right);
}`,
        requires: [{ feature: 'method', label: 'Write a method' }, { maxStatements: 8, label: 'At most 8 instructions' }],
        setup: () => ({ size: 6, viewHeight: 4, target: fill((x, z) => z === 0 && x < 4 ? ['White', 'White', 'Red'] : null) }),
      },
      {
        id: 'm-4', type: 'predict', title: 'A copy, not the original',
        goal: 'Predict what the Console will print.',
        brief: '<p>The method <code>LoseOne</code> takes <code>lives</code> and subtracts 1. After the call, the main program prints its own <code>lives</code>. Use <b>Step Into</b> and watch the Memory panel after you predict.</p>',
        starter: `int lives = 3;
LoseOne(lives);
Console.WriteLine(lives);

void LoseOne(int lives)
{
    lives = lives - 1;
}
`,
        question: {
          prompt: 'What will the Console print?',
          options: ['3', '2', 'An error'], answer: '3',
          actual: ({ output }) => output[0],
          explain: 'The parameter lives is a new box inside LoseOne that gets a copy of the value 3. Changing the copy does not change the original: the Memory panel shows two boxes called lives, one in each frame. To send a value back, a method uses return.',
        },
        setup: () => ({ size: 6, target: {} }),
      },
      {
        id: 'm-5', type: 'complete', title: 'Give it back',
        goal: 'Complete Area so the Console prints 8 and 10, and the tower is 6 blocks high.',
        brief: '<p>Some methods <b>calculate</b> something and give it back. Instead of <code>void</code> they have a type (<code>int Area</code>), and they end with <code>return value;</code>. Where the method was called, the call is replaced by that value: <code>Area(4, 2)</code> becomes <code>8</code>. Step over a call and read the panel on the right.</p>',
        hint: 'return width * depth;',
        starter: `int area = Area(4, 2);
Console.WriteLine(area);
Console.WriteLine(Area(3, 3) + 1);
drone.Build(Area(2, 3));

int Area(int width, int depth)
{
    return ___;
}
`,
        solution: `int area = Area(4, 2);
Console.WriteLine(area);
Console.WriteLine(Area(3, 3) + 1);
drone.Build(Area(2, 3));

int Area(int width, int depth)
{
    return width * depth;
}`,
        expectOutput: ['8', '10'],
        labels: true,
        setup: () => ({ size: 6, maxHeight: 8, viewHeight: 6, target: { '0,0': repeat('White', 6) } }),
      },
      {
        id: 'm-6', type: 'fix', title: 'Printing is not returning',
        goal: 'Make the Console print only 30 (5 doubled plus 10 doubled).',
        brief: '<p><code>Double</code> should give back twice its number, but it only <b>prints</b> something. Printing shows a value to a person; <code>return</code> gives it to the program. There is also a small logic mistake.</p>',
        hint: 'Replace Console.WriteLine(…) with return …; and double means n * 2.',
        starter: `int total = Double(5) + Double(10);
Console.WriteLine(total);

int Double(int n)
{
    Console.WriteLine(n + 2);
}
`,
        solution: `int total = Double(5) + Double(10);
Console.WriteLine(total);

int Double(int n)
{
    return n * 2;
}`,
        expectOutput: ['30'],
        setup: () => ({ size: 6, target: {} }),
      },
      {
        id: 'm-7', type: 'parsons', title: 'Build a wall method',
        goal: 'A Blue wall of 4 in the first row and a Red wall of 3 in the second.',
        brief: '<p>A method can have <b>several parameters</b>, separated by commas: <code>Wall(int length, Color color)</code>. Each call gives the values in the same order: <code>Wall(4, Color.Blue)</code>. Put the lines in order; one of them is not needed.</p>',
        hint: 'The main program comes first: Wall, MoveTo, Wall. Then the method: its header, {, the loop, }.',
        parsons: {
          lines: ['Wall(4, Color.Blue);', 'drone.MoveTo(0, 1);', 'Wall(3, Color.Red);', 'void Wall(int length, Color color)', '{', 'for (int i = 0; i < length; i++)', '{', 'drone.Place(color);', 'drone.Move(Direction.Right);', '}', '}'],
          distractors: ['drone.Place(Color.Blue);'],
        },
        setup: () => ({ size: 6, viewHeight: 3, target: fill((x, z) => z === 0 && x < 4 ? ['Blue'] : z === 1 && x < 3 ? ['Red'] : null) }),
      },
      {
        id: 'm-8', type: 'create', title: 'A street of houses',
        goal: 'Write House(int walls): a column of White walls with a Red roof, then one step right.',
        brief: '<p>The main program is ready: four houses with 1, 2, 3 and 4 walls. Write the method <code>House</code> below it. It needs a <b>parameter</b> for the number of walls and a <b>loop</b> to place them.</p>',
        hint: 'void House(int walls) { for (int i = 0; i < walls; i++) { drone.Place(Color.White); } then the Red roof and drone.Move(Direction.Right); }',
        starter: `House(1);
House(2);
House(3);
House(4);

// Write the method House(int walls) here.
`,
        solution: `House(1);
House(2);
House(3);
House(4);

void House(int walls)
{
    for (int i = 0; i < walls; i++)
    {
        drone.Place(Color.White);
    }
    drone.Place(Color.Red);
    drone.Move(Direction.Right);
}`,
        requires: [{ feature: 'method', label: 'Write a method' }, { maxStatements: 8, label: 'At most 8 instructions' }],
        labels: true,
        setup: () => ({ size: 6, maxHeight: 8, viewHeight: 5, target: fill((x, z) => z === 0 && x < 4 ? [...repeat('White', x + 1), 'Red'] : null) }),
      },
    ],
  },
  {
    id: 10, name: 'Arrays', concept: 'Many values',
    intro: 'An array keeps many values of the same type in one variable, in numbered boxes. Loops and arrays work together.',
    challenges: [
      {
        id: 'a-1', type: 'observe', title: 'A row of boxes',
        goal: 'Step through the program and watch the array in the Memory panel.',
        brief: '<p>An <b>array</b> is one variable with many boxes. <code>int[] heights</code> means "an array of ints"; <code>{ 3, 5, 2, 6 }</code> fills it. Each box has a <b>position</b> (index) that starts at <b>0</b>, like the characters of a string.</p><p><code>heights[0]</code> reads the first box and <code>heights.Length</code> counts them. In Memory, the box being read lights up in blue.</p>',
        hint: 'Watch the small numbers under each box: they are the positions.',
        starter: `int[] heights = { 3, 5, 2, 6 };
Console.WriteLine(heights.Length);

drone.Build(heights[0]);
drone.Build(heights[1]);
drone.Build(heights[2]);
drone.Build(heights[3]);
`,
        labels: true,
        setup: () => ({ size: 6, maxHeight: 8, viewHeight: 6, target: {} }),
      },
      {
        id: 'a-2', type: 'predict', title: 'Which box?',
        goal: 'Predict what the Console will print.',
        brief: '<p>Read the positions carefully: the first box is number 0.</p>',
        starter: `int[] scores = { 4, 7, 1, 5 };
Console.WriteLine(scores[1]);
`,
        question: {
          prompt: 'What will scores[1] print?',
          options: ['4', '7', '1'], answer: '7',
          actual: ({ output }) => output[0],
          explain: 'Positions start at 0: scores[0] is 4, scores[1] is 7. The last box of an array with 4 items is scores[3], which is scores.Length - 1.',
        },
        setup: () => ({ size: 6, target: {} }),
      },
      {
        id: 'a-3', type: 'complete', title: 'A skyline with a loop',
        goal: 'Fill the gaps so the loop builds one tower for each value.',
        brief: '<p>Writing <code>drone.Build(heights[0])</code>, <code>[1]</code>, <code>[2]</code>… by hand does not scale. A <code>for</code> loop can walk through every position: <code>i</code> goes 0, 1, 2… and <code>heights[i]</code> reads the box at position <code>i</code>. Use <code>heights.Length</code> so the loop works for any size.</p>',
        hint: 'i < heights.Length · drone.Build(heights[i]);',
        starter: `int[] heights = { 2, 4, 6, 3, 5, 1 };

for (int i = 0; i < ___; i++)
{
    drone.Build(___);
}
`,
        solution: `int[] heights = { 2, 4, 6, 3, 5, 1 };

for (int i = 0; i < heights.Length; i++)
{
    drone.Build(heights[i]);
}`,
        requires: [{ feature: 'for', label: 'Use a for loop' }],
        labels: true,
        setup: () => ({ size: 8, maxHeight: 8, viewHeight: 6, target: { '0,0': repeat('White', 2), '1,0': repeat('White', 4), '2,0': repeat('White', 6), '3,0': repeat('White', 3), '4,0': repeat('White', 5), '5,0': repeat('White', 1) } }),
      },
      {
        id: 'a-4', type: 'fix', title: 'One box too far',
        goal: 'Build the five towers and print exactly: Towers: 5',
        brief: '<p>This program runs… and crashes. Read the runtime error: which position did it ask for? There is also a surprise in the Console: printing an array does not print its values.</p>',
        hint: 'Positions go from 0 to Length - 1, so use i < heights.Length. For the count, print heights.Length.',
        starter: `int[] heights = { 3, 1, 4, 1, 5 };
Console.WriteLine("Towers: " + heights);

for (int i = 0; i <= heights.Length; i++)
{
    drone.Build(heights[i]);
}
`,
        solution: `int[] heights = { 3, 1, 4, 1, 5 };
Console.WriteLine("Towers: " + heights.Length);

for (int i = 0; i < heights.Length; i++)
{
    drone.Build(heights[i]);
}`,
        expectOutput: ['Towers: 5'],
        labels: true,
        setup: () => ({ size: 8, maxHeight: 8, viewHeight: 5, target: { '0,0': repeat('White', 3), '1,0': repeat('White', 1), '2,0': repeat('White', 4), '3,0': repeat('White', 1), '4,0': repeat('White', 5) } }),
      },
      {
        id: 'a-5', type: 'predict', title: 'Empty boxes',
        goal: 'Predict what the Console will print.',
        brief: '<p><code>new int[4]</code> creates an array with 4 boxes <b>before</b> you know the values. Then you can write into a box: <code>floors[2] = 5;</code>. What is inside the boxes nobody wrote?</p>',
        starter: `int[] floors = new int[4];
floors[2] = 5;
floors[0] = floors[2] - 1;
Console.WriteLine(floors[0] + floors[1] + floors[3]);
`,
        question: {
          prompt: 'What will the Console print?',
          options: ['4', '5', 'An error'], answer: '4',
          actual: ({ output }) => output[0],
          explain: 'A new int array starts full of zeros. floors[0] becomes 5 - 1 = 4, and floors[1] and floors[3] are still 0: 4 + 0 + 0 = 4. (A new bool array starts with false and a string array with null.)',
        },
        setup: () => ({ size: 6, target: {} }),
      },
      {
        id: 'a-6', type: 'create', title: 'Add up and find the tallest',
        goal: 'Build the towers, then print the total number of blocks and the tallest tower.',
        brief: '<p>Two classic jobs with an array: <b>adding up</b> (start at 0 and add each value) and <b>finding the biggest</b> (keep the best so far, and replace it when you find a bigger one). The Console must print exactly <code>Total: 21</code> and <code>Tallest: 6</code>, but calculate them: don\'t write the numbers.</p>',
        hint: 'Inside the loop: total += heights[i]; and if (heights[i] > tallest) { tallest = heights[i]; }',
        starter: `int[] heights = { 2, 6, 3, 4, 1, 5 };
int total = 0;
int tallest = 0;

for (int i = 0; i < heights.Length; i++)
{
    drone.Build(heights[i]);
    // add to total, and keep the tallest
}

Console.WriteLine("Total: " + total);
Console.WriteLine("Tallest: " + tallest);
`,
        solution: `int[] heights = { 2, 6, 3, 4, 1, 5 };
int total = 0;
int tallest = 0;

for (int i = 0; i < heights.Length; i++)
{
    drone.Build(heights[i]);
    total += heights[i];
    if (heights[i] > tallest)
    {
        tallest = heights[i];
    }
}

Console.WriteLine("Total: " + total);
Console.WriteLine("Tallest: " + tallest);`,
        expectOutput: ['Total: 21', 'Tallest: 6'],
        requires: [{ feature: 'if', label: 'Use if to find the tallest' }, { onlyNumbers: [0, 1, 2, 3, 4, 5, 6], label: 'Calculate the results: don\'t write 21' }],
        labels: true,
        setup: () => ({ size: 8, maxHeight: 8, viewHeight: 6, target: { '0,0': repeat('White', 2), '1,0': repeat('White', 6), '2,0': repeat('White', 3), '3,0': repeat('White', 4), '4,0': repeat('White', 1), '5,0': repeat('White', 5) } }),
      },
      {
        id: 'a-7', type: 'parsons', title: 'One by one with foreach',
        goal: 'Stack the colors of the array in one column: Red, Yellow, Blue, from the bottom.',
        brief: '<p><code>foreach (Color c in colors)</code> goes through the array <b>item by item</b>, in order: no index, no <code>Length</code>, no way to go too far. In each turn, <code>c</code> is the next item. It can only <b>read</b> the items: to change them, use <code>for</code>. Put the lines in order; one of them is not needed.</p>',
        hint: 'The array first, then foreach, {, Place, }. The drone must not move.',
        parsons: {
          lines: ['Color[] colors = { Color.Red, Color.Yellow, Color.Blue };', 'foreach (Color c in colors)', '{', 'drone.Place(c);', '}'],
          distractors: ['drone.Move(Direction.Right);'],
        },
        setup: () => ({ size: 6, viewHeight: 4, target: { '0,0': ['Red', 'Yellow', 'Blue'] } }),
      },
      {
        id: 'a-8', type: 'create', title: 'Two streets, one method',
        goal: 'Write Skyline(int[] heights): one tower for each value, in a row.',
        brief: '<p>A method can receive a whole array as a parameter: <code>void Skyline(int[] heights)</code>. The main program is ready and calls it for two streets. Write the method below it, with a loop inside.</p>',
        hint: 'void Skyline(int[] heights) { foreach (int h in heights) { drone.Build(h); } }',
        starter: `int[] street1 = { 3, 5, 2, 4 };
int[] street2 = { 1, 2, 3, 4, 5 };

Skyline(street1);
drone.MoveTo(0, 3);
Skyline(street2);

// Write the method Skyline(int[] heights) here.
`,
        solution: `int[] street1 = { 3, 5, 2, 4 };
int[] street2 = { 1, 2, 3, 4, 5 };

Skyline(street1);
drone.MoveTo(0, 3);
Skyline(street2);

void Skyline(int[] heights)
{
    foreach (int h in heights)
    {
        drone.Build(h);
    }
}`,
        requires: [{ feature: 'method', label: 'Write a method' }],
        labels: true,
        setup: () => ({ size: 6, maxHeight: 8, viewHeight: 5, target: fill((x, z) => z === 0 && x < 4 ? repeat('White', [3, 5, 2, 4][x]) : z === 3 && x < 5 ? repeat('White', x + 1) : null) }),
      },
    ],
  },
  {
    id: 11, name: 'From block to city', concept: 'Project',
    intro: 'The final project: read a plan with drone.Scan() and generate a whole city with methods, arrays, loops and conditions. The plan changes every run, like in procedural generation.',
    challenges: [
      {
        id: 'p-1', title: 'Read the plan', randomized: true,
        goal: 'Build one tower for each number of the plan. The plan changes every run.',
        brief: '<p><code>drone.Scan()</code> reads the <b>plan</b> of the street where the drone is and gives it back as an <code>int[]</code>: one number per plot, from left to right. Every run brings a different plan, and your program is also tested on other plans, so read the numbers: don\'t copy them.</p>',
        hint: 'foreach (int floors in plan) { drone.Build(floors); }',
        starter: `// The drone scans the plan of this street: one number per building.
int[] plan = drone.Scan();
Console.WriteLine(plan.Length + " buildings");

// Build one tower for each number in the plan.
`,
        solution: `int[] plan = drone.Scan();
Console.WriteLine(plan.Length + " buildings");

foreach (int floors in plan)
{
    drone.Build(floors);
}`,
        labels: true,
        setup: rand => {
          const plan = Array.from({ length: 6 }, () => 1 + Math.floor(rand() * 6));
          return { maxHeight: 8, viewHeight: 6, plans: { 0: plan }, target: Object.fromEntries(plan.map((h, x) => [`${x},0`, repeat('White', h)])) };
        },
      },
      {
        id: 'p-2', title: 'Buildings with roofs', randomized: true,
        goal: 'For each plot: its floors in White and a Red roof on top. A 0 is an empty plot.',
        brief: '<p>Now each building is more than a tower: <b>floors</b> plus a <b>roof</b>. Put that in a method <code>Building(int floors)</code>, so the main program only reads the plan and calls it. Careful with the plots marked <b>0</b>: nothing is built there, but the drone must still move on.</p>',
        hint: 'In Building: if (floors > 0) { a loop placing White floors, then drone.Place(Color.Red); } and always drone.Move(Direction.Right); at the end.',
        starter: `int[] plan = drone.Scan();

foreach (int floors in plan)
{
    Building(floors);
}

// Floors in White, a Red roof, then one step right.
// A plot with 0 floors stays empty (but the drone still moves).
void Building(int floors)
{
    drone.Build(floors);
}
`,
        solution: `int[] plan = drone.Scan();

foreach (int floors in plan)
{
    Building(floors);
}

void Building(int floors)
{
    if (floors > 0)
    {
        for (int i = 0; i < floors; i++)
        {
            drone.Place(Color.White);
        }
        drone.Place(Color.Red);
    }
    drone.Move(Direction.Right);
}`,
        requires: [{ feature: 'method', label: 'Write a method' }, { feature: 'if', label: 'Use if' }],
        labels: true,
        setup: rand => {
          const plan = Array.from({ length: 6 }, (_, i) => i === 1 || rand() < 0.2 ? 0 : 1 + Math.floor(rand() * 5));
          return { maxHeight: 8, viewHeight: 6, plans: { 0: plan }, target: Object.fromEntries(plan.map((h, x) => [`${x},0`, h ? [...repeat('White', h), 'Red'] : []]).filter(([, c]) => c.length)) };
        },
      },
      {
        id: 'p-3', title: 'The whole city', randomized: true,
        goal: 'Build the four streets (rows 0, 2, 4 and 6). Buildings with 4 floors or more get a Blue roof.',
        brief: '<p>A city is many streets. The streets are in rows <b>0, 2, 4 and 6</b>: fly to the start of each one with <code>drone.MoveTo(0, z)</code>, scan its plan and build it. And a new rule: tall buildings (<b>4 floors or more</b>) get a <b>Blue</b> roof; the others keep the Red one. This is how procedural cities are made in games and films: a few rules, applied to data.</p>',
        hint: 'for (int z = 0; z < 8; z += 2) { drone.MoveTo(0, z); int[] plan = drone.Scan(); foreach … } and in Building: if (floors >= 4) Blue roof, else Red.',
        starter: `// This builds only the first street.
drone.MoveTo(0, 0);
int[] plan = drone.Scan();
foreach (int floors in plan)
{
    Building(floors);
}

void Building(int floors)
{
    if (floors > 0)
    {
        for (int i = 0; i < floors; i++)
        {
            drone.Place(Color.White);
        }
        drone.Place(Color.Red);
    }
    drone.Move(Direction.Right);
}
`,
        solution: `for (int z = 0; z < 8; z += 2)
{
    drone.MoveTo(0, z);
    int[] plan = drone.Scan();
    foreach (int floors in plan)
    {
        Building(floors);
    }
}

void Building(int floors)
{
    if (floors > 0)
    {
        for (int i = 0; i < floors; i++)
        {
            drone.Place(Color.White);
        }
        if (floors >= 4)
        {
            drone.Place(Color.Blue);
        }
        else
        {
            drone.Place(Color.Red);
        }
    }
    drone.Move(Direction.Right);
}`,
        requires: [{ feature: 'method', label: 'Write a method' }, { feature: 'nestedLoop', label: 'Use a loop inside a loop' }],
        setup: rand => {
          const plans = {}, target = {};
          for (let z = 0; z < 8; z += 2) {
            plans[z] = Array.from({ length: 6 }, () => rand() < 0.2 ? 0 : 1 + Math.floor(rand() * 6));
            plans[z].forEach((h, x) => { if (h) target[`${x},${z}`] = [...repeat('White', h), h >= 4 ? 'Blue' : 'Red']; });
          }
          return { maxHeight: 8, viewHeight: 7, plans, target };
        },
      },
      {
        id: 'p-4', title: 'Terrain from a heightmap', randomized: true,
        goal: 'Every row is a heightmap. Build each column with the color of its altitude; height 0 is water.',
        brief: '<p>In 3D, a <b>heightmap</b> is a grid of numbers that says how high the ground is at each point. Here each row of the grid is scanned as an <code>int[]</code>. Build every column layer by layer and color each layer by its <b>altitude</b> <code>y</code>: layers 0 and 1 <b>Green</b>, 2 and 3 <b>Orange</b>, 4 and up <b>White</b> (snow). A height of <b>0</b> is water: one <b>Blue</b> block. The main program is ready; complete the two methods. <code>LayerColor</code> is a method that gives back a <code>Color</code>.</p>',
        hint: 'Column: if (h == 0) place Blue; for (int y = 0; y < h; y++) drone.Place(LayerColor(y)); · LayerColor: if (y < 2) return Color.Green; if (y < 4) return Color.Orange; return Color.White;',
        starter: `for (int z = 0; z < 8; z++)
{
    drone.MoveTo(0, z);
    int[] heights = drone.Scan();
    for (int x = 0; x < heights.Length; x++)
    {
        drone.MoveTo(x, z);
        Column(heights[x]);
    }
}

void Column(int h)
{
    // Water (h == 0): one Blue block.
    // Otherwise h blocks, each with the color of its layer.
}

// The color of layer y: 0-1 Green, 2-3 Orange, 4 and up White.
Color LayerColor(int y)
{
    return Color.Green;
}
`,
        solution: `for (int z = 0; z < 8; z++)
{
    drone.MoveTo(0, z);
    int[] heights = drone.Scan();
    for (int x = 0; x < heights.Length; x++)
    {
        drone.MoveTo(x, z);
        Column(heights[x]);
    }
}

void Column(int h)
{
    if (h == 0)
    {
        drone.Place(Color.Blue);
    }
    for (int y = 0; y < h; y++)
    {
        drone.Place(LayerColor(y));
    }
}

Color LayerColor(int y)
{
    if (y < 2)
    {
        return Color.Green;
    }
    if (y < 4)
    {
        return Color.Orange;
    }
    return Color.White;
}`,
        setup: rand => {
          const p1 = rand() * 6.28, p2 = rand() * 6.28, fx = 0.6 + rand() * 0.5, fz = 0.5 + rand() * 0.5;
          const plans = {}, target = {};
          const layer = y => y < 2 ? 'Green' : y < 4 ? 'Orange' : 'White';
          for (let z = 0; z < 8; z++) {
            plans[z] = Array.from({ length: 8 }, (_, x) => Math.max(0, Math.min(6, Math.round(2.6 + 2.8 * Math.sin(x * fx + p1) * Math.cos(z * fz + p2) + (rand() - 0.5)))));
            plans[z].forEach((h, x) => { target[`${x},${z}`] = h === 0 ? ['Blue'] : Array.from({ length: h }, (_, y) => layer(y)); });
          }
          return { maxHeight: 8, viewHeight: 6, plans, target };
        },
      },
    ],
  },
  {
    id: 12, name: 'Free build', concept: 'Sandbox',
    intro: 'No goal: experiment with everything you have learned.',
    challenges: [
      {
        id: 'free', title: 'Sandbox', sandbox: true,
        goal: 'No target. Build whatever you like.',
        brief: '<p>Try changing the numbers in this pyramid, or write your own program. Can you build a staircase that turns? A tower with alternating colors?</p>',
        hint: 'Each layer starts one tile further in and ends one tile earlier.',
        starter: `// A pyramid: each level is a smaller square on top of the last one.
for (int level = 0; level < 4; level++)
{
    for (int x = level; x < 7 - level; x++)
    {
        for (int z = level; z < 7 - level; z++)
        {
            drone.MoveTo(x, z);
            drone.Place(level % 2 == 0 ? Color.Yellow : Color.Orange);
        }
    }
}
`,
        solution: '',
        setup: () => ({ target: {} }),
      },
    ],
  },
];

export const TYPES = {
  observe: { label: 'Observe', mark: '◉', tip: 'Read and follow the program. Nothing to write.' },
  predict: { label: 'Predict', mark: '?', tip: 'Choose what you think will happen, then run it.' },
  parsons: { label: 'Order', mark: '⇅', tip: 'Put the lines in the right order.' },
  fix: { label: 'Fix', mark: '!', tip: 'Find and fix the mistakes.' },
  complete: { label: 'Complete', mark: '_', tip: 'Fill in the gaps marked ___.' },
  classify: { label: 'Classify', mark: '≡', tip: 'Choose an answer for each item, then check.' },
  create: { label: 'Create', mark: '■', tip: 'Write the program yourself.' },
};

// Indents Parsons lines automatically from their braces.
export function assembleParsons(lines) {
  let depth = 0;
  return lines.map(l => {
    const t = l.trim();
    if (t.startsWith('}')) depth = Math.max(0, depth - 1);
    const out = '    '.repeat(depth) + t;
    if (t.endsWith('{')) depth++;
    return out;
  }).join('\n');
}

export const buildChallenges = levels => levels.flatMap(level => level.challenges.map(c => {
  const type = c.type || (c.sandbox ? 'create' : 'create');
  const ch = { ...c, type, level, mode: c.mode || 'program' };
  if (type === 'parsons') { ch.solution = assembleParsons(c.parsons.lines); ch.starter = ''; }
  if ((type === 'observe' || type === 'predict') && !ch.solution) ch.solution = ch.starter;
  if (type === 'classify') { ch.starter = ''; ch.solution = ''; }
  return ch;
}));
export const CHALLENGES = buildChallenges(LEVELS);

export function checkRequirements(challenge, stats) {
  return (challenge.requires || []).map(r => {
    let ok = true;
    if (r.feature) ok = stats.features.has(r.feature);
    if (r.maxStatements) ok = stats.statements <= r.maxStatements;
    if (r.declType) ok = stats.declTypes.has(r.declType);
    if (r.onlyNumbers) ok = stats.numbers.length > 0 && stats.numbers.every(n => r.onlyNumbers.includes(n));
    return { ...r, ok };
  });
}

// Classify challenges: the answer is decided by the real checker, not by a list.
export function judge(kind, text) {
  if (kind === 'name') {
    const c = compile(`int ${text} = 0;`);
    return { answer: c.ok ? 'Valid' : 'Invalid', why: c.ok ? `int ${text} = 0; compiles.` : `${c.errors[0].code && c.errors[0].code !== 'LAB' ? c.errors[0].code + ': ' : ''}${c.errors[0].message}`, hint: c.ok ? '' : c.errors[0].hint };
  }
  if (kind === 'calc') {
    const c = compile(text, { mode: 'calc' });
    return { answer: c.ok ? 'Works' : 'Error', why: c.ok ? 'The compiler accepts it.' : c.errors[0].message, hint: c.ok ? '' : c.errors[0].hint };
  }
  if (kind === 'bool') {
    const c = compile(`int age = 16\nbool member = true\n${text}`, { mode: 'calc' });
    if (!c.ok) return { answer: 'error', why: c.errors[0].message };
    const r = new Runner(c.ast, new World()); r.runToEnd();
    const last = r.results.at(-1);
    return { answer: last.text, why: last.steps ? last.steps.join('  →  ') : last.text };
  }
  if (kind === 'style') {
    const camel = /^[a-z][a-z0-9]*([A-Z][a-z0-9]*)*$/.test(text);
    const pascal = /^[A-Z][a-z0-9]+([A-Z][a-z0-9]*)*$/.test(text);
    const answer = camel ? 'camelCase' : pascal ? 'PascalCase' : 'Other style';
    const why = camel ? 'Starts lowercase, each new word starts with a capital: used for variables.'
      : pascal ? 'Starts with a capital, each new word too: used for methods and types.'
      : text.includes('_') ? 'Words joined with _ (snake_case) is common in Python, not in C#.' : 'ALL CAPS is not a C# naming style.';
    return { answer, why };
  }
  return { answer: null, why: '' };
}
