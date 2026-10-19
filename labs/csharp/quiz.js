// Graded tests for the Code Lab: "what is the value of result?"
// A test is a list of short programs. The student types the final value of
// result; at the end the lab gives a grade out of 10, a breakdown by topic and
// the step-by-step reasoning for every question. It can be repeated.
import { compile, Runner, literal, showStatement } from './interpreter.js';
import { World } from './world.js';

// Operators test (imported from the Moodle bank 3D090 · C# · Operadores, 35 cloze questions).
export const OPERATORS = [
  { n: 1, tag: 'arith', answer: "7", code: `int result = 4 + 3;` },
  { n: 2, tag: 'arith', answer: "3", code: `int result = 10 - 7;` },
  { n: 3, tag: 'order', answer: "8", code: `int result = 4 + 2 * 2;` },
  { n: 4, tag: 'arith', answer: "10", code: `int a = 5;
int b = 5;
int result = a + b;` },
  { n: 5, tag: 'compare', answer: "false", code: `bool result = 5 > 7;` },
  { n: 6, tag: 'compare', answer: "false", code: `bool result = 4 == 5;` },
  { n: 7, tag: 'decimals', answer: "4.5", code: `double a = 3.0, b = 3.5;
double result = b + 0.5 * (5 - a);` },
  { n: 8, tag: 'compare', answer: "false", code: `bool result = 3 >= 7;` },
  { n: 9, tag: 'compare', answer: "true", code: `bool result = 8 < 12;` },
  { n: 10, tag: 'logic', answer: "false", code: `bool result = !(5 == 5);` },
  { n: 11, tag: 'compare', answer: "true", code: `bool result = 4 != 8;` },
  { n: 12, tag: 'arith', answer: "24", code: `int p = 4;
int q = 6;
int result = p * q;` },
  { n: 13, tag: 'intdiv', answer: "6", code: `int m = 20;
int n = 3;
int result = m / n;` },
  { n: 14, tag: 'intdiv', answer: "2", code: `int num = 17;
int divisor = 5;
int result = num % divisor;` },
  { n: 15, tag: 'decimals', answer: "5.2f", code: `float a = 4.5f;
float b = 2f;
float result = a + b - 1.3f;` },
  { n: 16, tag: 'text', answer: "\"Hola, Mundo\"", code: `string cadena1 = "Hola";
string cadena2 = "Mundo";
string result = cadena1 + ", " + cadena2;` },
  { n: 17, tag: 'order', answer: "11", code: `int a = 5;
int b = 3;
int result = a + b * 2;` },
  { n: 18, tag: 'update', answer: "0", code: `int a = 2;
int b = 3;
int result = (b - a) * 2;
result -= 2;` },
  { n: 19, tag: 'logic', answer: "false", code: `int a = 6;
int b = 4;
bool result = a > 7 && b < 6;` },
  { n: 20, tag: 'logic', answer: "true", code: `int a = 5;
int b = 3;
bool result = a >= 6 || b < a;` },
  { n: 21, tag: 'update', answer: "true", code: `int a = 3;
int b = 3;
b++;
bool result = !(a == b);` },
  { n: 22, tag: 'logic', answer: "false", code: `int a = 10;
int b = 2;
bool result = 4 + 3 < b || b > a;` },
  { n: 23, tag: 'order', answer: "true", code: `int a = 5;
int b = 4;
int c = 3;
bool result = c > b == b > a;` },
  { n: 24, tag: 'logic', answer: "true", code: `int a = 4;
int b = 3;
int c = 7;
bool result = (!(c < a) && a != c) && a + b <= c;` },
  { n: 25, tag: 'logic', answer: "true", code: `int a = 5;
int b = 3;
bool result = (a > b || a + b < 10) && !(a == b);` },
  { n: 26, tag: 'logic', answer: "true", code: `int a = 9;
bool result = (9 != a) == !(a <= 10);` },
  { n: 27, tag: 'logic', answer: "false", code: `int a = 4;
int b = 5;
bool result = !(a != b && a < b);` },
  { n: 28, tag: 'logic', answer: "false", code: `int a = 10;
int b = 9;
bool result = !(!(a >= b + 2));` },
  { n: 29, tag: 'update', answer: "true", code: `int a = 5;
int b = 5;
bool result = a >= b + 1 || a++ == b;` },
  { n: 30, tag: 'update', answer: "true", code: `int a = 7;
int b = 8;
b--;
bool result = !(b != a) || (b == a);` },
  { n: 31, tag: 'text', answer: "\"12\"", code: `string a = "1";
string b = "2";
string result = a + b;` },
  { n: 32, tag: 'logic', answer: "true", code: `int a = 4;
int b = 8;
bool result = !((a * 2 == b / 2) != (b - 3 <= a));` },
  { n: 33, tag: 'update', answer: "true", code: `int a = 10;
int b = a;
a++;
b--;
bool result = a + b - 1 > a + 5 && a * b < 3000;` },
  { n: 34, tag: 'logic', answer: "true", code: `bool isStudent = false;
bool isEmployed = true;
int age = 22;
bool result = (isStudent || isEmployed) && age >= 18;` },
  { n: 35, tag: 'intdiv', answer: "true", code: `int m = 12, n = 4;
bool result = (m % n == 0) && (m / n > 1);` },
];

// Question 29 uses a++ inside an expression, which the lab's interpreter keeps as its own
// instruction on purpose. Its reasoning is written by hand.
const MANUAL_STEPS = {
  29: { before: [], steps: ['a >= b + 1 || a++ == b', '5 >= 5 + 1 || 5 == 5', '5 >= 6 || 5 == 5', 'false || true', 'true'], after: ['a++  →  a = 6'] },
};

// Topics: what each question practises, a short reminder and a challenge to review.
export const TAGS = {
  arith: { label: 'Arithmetic', tip: 'Replace each variable by the value it holds at that moment, then calculate.', review: 'k-4' },
  order: { label: 'Order of operations', tip: '* / % go before + -, then < > <= >=, then == !=, then &&, and || last. Brackets go first.', review: 'k-2' },
  intdiv: { label: 'Integer division and %', tip: 'int / int gives a whole number: the decimals are cut off, not rounded. % gives what is left over.', review: 'k-5' },
  decimals: { label: 'Decimal numbers', tip: 'With double and float the decimals stay: 0.5 * 2.0 is 1.0. A float is written with f: 4.5f.', review: 'k-7' },
  compare: { label: 'Comparisons', tip: 'A comparison gives a bool: true or false. == means equal, != means different, = stores.', review: 'l-2' },
  logic: { label: 'Logic: && || !', tip: '&& is true only when both sides are true · || when at least one is · ! flips the value. Solve the brackets first.', review: 'l-4' },
  text: { label: 'Text with +', tip: 'With strings, + joins the texts: "1" + "2" is "12", not 3. Spaces and commas count.', review: 'k-7' },
  update: { label: '++ -- and -=', tip: 'b++ adds 1 and b-- takes 1 away. result -= 2 means result = result - 2. In a++ == b, the old value of a is compared, then a goes up.', review: '2-p1' },
};

// Grades as in Catalan and Spanish schools.
export const BANDS = [
  { min: 9, label: 'Excellent', text: 'You read operators like the compiler does. Ready for loops and conditions.' },
  { min: 7, label: 'Very good', text: 'Solid. Look at the few mistakes below: they usually repeat the same idea.' },
  { min: 6, label: 'Good', text: 'You have the basics. Review the topics in red and try again.' },
  { min: 5, label: 'Pass', text: 'Passed, just. Review the topics in red and repeat the test to make it stick.' },
  { min: 0, label: 'Not passed', text: 'Not passed yet. Review the topics in red, read the steps of each mistake and try again: you can repeat it as many times as you need.' },
];
export const PASS = 5;
export const band = grade => BANDS.find(b => grade >= b.min);
export const gradeOf = (right, total) => Math.round((right / total) * 100) / 10;

// The type of result, read from its declaration.
export function resultType(q) { return q.code.match(/\b(int|double|float|bool|string)\s+result\b/)[1]; }

const NUM = /^-?\d+(\.\d+)?$/;
const FLOAT = /^-?\d+(\.\d+)?[fF]?$/;
const DOUBLE = /^-?\d+(\.\d+)?[dD]?$/;
const unquote = s => s.replace(/^"/, '').replace(/"$/, '');

// Decides whether an answer is right. Returns { ok, note } where note explains a format problem.
export function checkAnswer(q, input) {
  const type = resultType(q);
  let s = String(input ?? '').trim().replace(/;\s*$/, '').trim();
  const want = q.answer;
  if (!s) return { ok: false, empty: true };
  if (type === 'string') return { ok: unquote(s) === unquote(want) };
  if (type === 'bool') {
    const low = s.toLowerCase();
    if (low !== 'true' && low !== 'false') return { ok: false, note: 'A bool can only be true or false.' };
    return { ok: low === want };
  }
  let note = '';
  if (/^-?\d+,\d+[fFdD]?$/.test(s)) { s = s.replace(',', '.'); note = 'In C# decimals are written with a dot: 4.5, not 4,5.'; }
  if (s.startsWith('"')) return { ok: false, note: `result is a ${type}, a number: it is written without quotes.` };
  const value = parseFloat(want);
  if (type === 'int') {
    if (!NUM.test(s)) return { ok: false, note };
    if (s.includes('.')) return { ok: false, note: parseFloat(s) === value ? 'result is an int: whole numbers are written without a decimal point.' : note };
    return { ok: Number(s) === value, note };
  }
  if (!(type === 'float' ? FLOAT : DOUBLE).test(s)) return { ok: false, note: note || (type === 'double' && /f$/i.test(s) ? 'result is a double: the f is only for float.' : '') };
  return { ok: Math.abs(parseFloat(s) - value) < 1e-6, note };
}

// The answer as C# would write it in code.
export function shownAnswer(q) {
  const type = resultType(q);
  if (type === 'string') return q.answer.startsWith('"') ? q.answer : JSON.stringify(q.answer);
  if (type === 'float' && !/f$/i.test(q.answer)) return q.answer + 'f';
  return q.answer.replace(/[dD]$/, '');
}

// How the value of result is worked out, from the lab's own interpreter:
// { before: changes before result is created, steps: result's expression reduced, after: changes to result later }
export function explain(q) {
  if (MANUAL_STEPS[q.n]) return MANUAL_STEPS[q.n];
  const c = compile(q.code);
  if (!c.ok) return null;
  const body = c.ast.body;
  const decl = body.find(s => s.type === 'VarDecl' && s.decls.some(d => d.name === 'result'));
  const init = decl.decls.find(d => d.name === 'result').init;
  const r = new Runner(c.ast, new World());
  const out = { before: [], steps: null, after: [] };
  let prev = null;
  const record = s => {
    if (!s || !(s.type === 'IncDec' || s.type === 'Assign')) return;
    const v = r.lookup(s.target.name);
    (out.steps ? out.after : out.before).push(`${showStatement(s)}  →  ${v.name} = ${literal(v.value, v.type)}`);
  };
  for (const ev of r.run()) {
    record(prev);
    const s = body.find(x => x.line === ev.line) || null;
    if (s === decl && !out.steps) out.steps = r.reduceSteps(init);
    prev = s;
  }
  record(prev);
  return out;
}

// Scores one attempt. answers: { [n]: text }
export function score(questions, answers) {
  const rows = questions.map(q => ({ q, answer: answers[q.n] ?? '', ...checkAnswer(q, answers[q.n]) }));
  const right = rows.filter(r => r.ok).length;
  const byTag = {};
  for (const r of rows) {
    const t = byTag[r.q.tag] ||= { tag: r.q.tag, right: 0, total: 0 };
    t.total++; if (r.ok) t.right++;
  }
  const grade = gradeOf(right, questions.length);
  return { rows, right, total: questions.length, grade, band: band(grade), passed: grade >= PASS, byTag: Object.values(byTag) };
}
