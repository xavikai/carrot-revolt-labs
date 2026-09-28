// A small, teaching-oriented C# interpreter.
// It understands a focused subset of C# (top-level statements, local variables,
// if/else, while, do/while, for, break/continue, methods (local functions with
// parameters and return), arrays and foreach, expressions and the lab API)
// and runs programs step by step so the interface can show what happens.

export const COLORS = ['None', 'White', 'Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Black'];
export const DIRECTIONS = ['Forward', 'Back', 'Left', 'Right'];
const NUMERIC = ['int', 'float', 'double'];
const VALUE_TYPES = ['int', 'float', 'double', 'bool', 'string', 'char', 'Color', 'Direction'];
const TYPE_KEYWORDS = new Set(['int', 'float', 'double', 'bool', 'string', 'char', 'var']);
const KEYWORDS = new Set([...TYPE_KEYWORDS, 'if', 'else', 'for', 'while', 'do', 'break', 'continue', 'true', 'false',
  'using', 'return', 'void', 'new', 'null', 'foreach', 'in', 'class', 'static', 'public', 'private', 'switch', 'case',
  'default', 'const', 'char', 'long', 'object', 'namespace', 'struct', 'protected', 'virtual', 'override', 'this', 'base',
  'abstract', 'readonly', 'sealed', 'is', 'as']);
const MODIFIERS = new Set(['public', 'private', 'protected', 'static', 'virtual', 'override', 'abstract', 'readonly', 'sealed']);
const STATIC_CLASSES = ['Color', 'Direction', 'Math', 'Console', 'Vector3', 'Time', 'Mathf', 'Scene', 'Debug'];

export class CSharpError extends Error {
  constructor({ kind = 'compile', code = '', message, line = 1, col = 1, hint = '', exception = '' }) {
    super(message);
    Object.assign(this, { kind, code, line, col, hint, exception });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const isNum = t => NUMERIC.includes(t);
export const listElem = t => { const m = typeof t === 'string' && t.match(/^List<(.+)>$/); return m ? m[1] : null; };
// Types the lab provides for Code Lab 02 (a small, Unity-like world).
function builtinTypes() {
  const fld = (type, extra = {}) => ({ type, access: 'public', builtin: true, ...extra });
  const info = (name, kind, fields, extra = {}) => ({ name, kind, builtin: true, base: null, fields: new Map(Object.entries(fields)), methods: new Map(), ctors: [], ...extra });
  return new Map([
    ['Vector3', info('Vector3', 'struct', { x: fld('float'), y: fld('float'), z: fld('float') }, { ctors: [{ builtin: true, params: ['x', 'y', 'z'].map(n => ({ name: n, resolvedType: 'float', varType: 'float' })) }, { builtin: true, params: ['x', 'y'].map(n => ({ name: n, resolvedType: 'float', varType: 'float' })) }, { builtin: true, params: [] }] })],
    ['Transform', info('Transform', 'class', { position: fld('Vector3', { property: true }), localScale: fld('Vector3', { property: true }) }, { noNew: true })],
    ['MonoBehaviour', info('MonoBehaviour', 'class', { transform: fld('Transform', { readonly: true }) }, { ctors: [{ builtin: true, params: [] }] })],
  ]);
}
// Runtime values: class objects are shared (references), structs are copied.
export const isObj = v => !!v && typeof v === 'object' && !!v.__cls;
export const isStructVal = v => !!v && typeof v === 'object' && !!v.__struct;
export const isList = v => !!v && typeof v === 'object' && !!v.__list;
export const vec = (x, y, z) => ({ __struct: 'Vector3', f: { x: Math.fround(x), y: Math.fround(y), z: Math.fround(z) } });
export function copyValue(v) {
  if (!isStructVal(v)) return v;
  const f = {};
  for (const [k, x] of Object.entries(v.f)) f[k] = copyValue(x);
  return { __struct: v.__struct, f };
}
const f2 = n => (Math.round(n * 100) / 100).toFixed(2);
export function formatVector(v) { return `(${f2(v.f.x)}, ${f2(v.f.y)}, ${f2(v.f.z)})`; }
export const VECTOR_STATICS = { zero: [0, 0, 0], one: [1, 1, 1], up: [0, 1, 0], down: [0, -1, 0], left: [-1, 0, 0], right: [1, 0, 0], forward: [0, 0, 1], back: [0, 0, -1] };
export const LIST_METHODS = {
  Add: { params: ['T'], returns: 'void' }, Remove: { params: ['T'], returns: 'bool' }, RemoveAt: { params: ['int'], returns: 'void' },
  Clear: { params: [], returns: 'void' }, Contains: { params: ['T'], returns: 'bool' }, IndexOf: { params: ['T'], returns: 'int' }, Insert: { params: ['int', 'T'], returns: 'void' },
};
export const isArr = t => typeof t === 'string' && t.endsWith('[]');
export const elemOf = t => t.slice(0, -2);
const DEFAULTS = { int: 0, float: 0, double: 0, bool: false, char: '\0', string: null, Color: 'None', Direction: 'Forward' };
const NET_NAMES = { int: 'Int32', float: 'Single', double: 'Double', bool: 'Boolean', string: 'String', char: 'Char' };
const widest = (a, b) => NUMERIC[Math.max(NUMERIC.indexOf(a), NUMERIC.indexOf(b))];
export function implicitOK(from, to) {
  if (from === to) return true;
  return isNum(from) && isNum(to) && NUMERIC.indexOf(from) <= NUMERIC.indexOf(to);
}
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
export function suggest(name, options) {
  const lower = name.toLowerCase();
  const exact = options.find(o => o.toLowerCase() === lower);
  if (exact) return exact;
  let best = null, score = 3;
  for (const o of options) { const s = distance(lower, o.toLowerCase()); if (s < score) { score = s; best = o; } }
  return best;
}

export function formatFloat(v) {
  if (!Number.isFinite(v)) return Number.isNaN(v) ? 'NaN' : (v > 0 ? '∞' : '-∞');
  for (let p = 1; p <= 9; p++) { const s = Number(v.toPrecision(p)); if (Math.fround(s) === v) return String(s); }
  return String(v);
}
// How C# prints a value (Console.WriteLine, string concatenation)
export function formatValue(value, type) {
  if (value === undefined || value === null) return '';
  if (isStructVal(value)) return value.__struct === 'Vector3' ? formatVector(value) : value.__struct;
  if (isObj(value)) return value.__cls.name;
  if (isList(value)) return `System.Collections.Generic.List\`1[${NET_NAMES[value.elem] ? 'System.' + NET_NAMES[value.elem] : value.elem}]`;
  // Printing an array shows its type, not its values (a classic surprise).
  if (isArr(type)) return NET_NAMES[elemOf(type)] ? `System.${NET_NAMES[elemOf(type)]}[]` : type;
  switch (type) {
    case 'bool': return value ? 'True' : 'False';
    case 'float': return formatFloat(value);
    case 'double': return Number.isFinite(value) ? String(value) : (Number.isNaN(value) ? 'NaN' : (value > 0 ? '∞' : '-∞'));
    default: return String(value);
  }
}
// How a value would look written as C# source (used in the Memory panel and explanations)
export function literal(value, type) {
  if (value === undefined) return '?';
  if (value === null) return 'null';
  if (isStructVal(value)) return value.__struct === 'Vector3' ? formatVector(value) : `{ ${Object.entries(value.f).map(([k, x]) => `${k} = ${literal(x, typeof x === 'number' ? 'float' : typeof x === 'boolean' ? 'bool' : undefined)}`).join(', ')} }`;
  if (isObj(value)) return `${value.__cls.name} #${value.__id}`;
  if (isList(value)) return `List #${value.__id} { ${value.items.map(v => literal(v, value.elem)).join(', ')} }`;
  if (isArr(type)) return `{ ${value.map(v => literal(v, elemOf(type))).join(', ')} }`;
  switch (type) {
    case 'string': return JSON.stringify(value);
    case 'char': return `'${value === "'" ? "\\'" : value === '\n' ? '\\n' : value}'`;
    case 'bool': return value ? 'true' : 'false';
    case 'Color': return `Color.${value}`;
    case 'Direction': return `Direction.${value}`;
    case 'float': return formatFloat(value) + 'f';
    case 'double': { const s = formatValue(value, 'double'); return /[.eE∞N]/.test(s) ? s : s + '.0'; }
    default: return String(value);
  }
}

// ─── Tokenizer ────────────────────────────────────────────────────────────────
export function tokenize(src, baseLine = 1, baseCol = 1) {
  const tokens = [];
  let i = 0, line = baseLine, col = baseCol;
  const fail = (code, message, l, c, hint = '') => { throw new CSharpError({ code, message, line: l, col: c, hint }); };
  const adv = (n = 1) => { for (let k = 0; k < n; k++) { if (src[i] === '\n') { line++; col = 1; } else col++; i++; } };
  const push = (tok, l, c) => tokens.push({ ...tok, line: l, col: c, endLine: line, endCol: col });
  while (i < src.length) {
    const ch = src[i];
    if (' \t\r\n'.includes(ch)) { adv(); continue; }
    if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') adv(); continue; }
    if (ch === '/' && src[i + 1] === '*') {
      const l = line, c = col; adv(2);
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) adv();
      if (i >= src.length) fail('CS1035', "End-of-file found, '*/' expected", l, c, 'A comment that starts with /* must end with */.');
      adv(2); continue;
    }
    const l = line, c = col;
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let s = '';
      while (/[0-9_]/.test(src[i] ?? '')) { s += src[i]; adv(); }
      let real = false;
      if (src[i] === '.' && /[0-9]/.test(src[i + 1] ?? '')) { real = true; s += '.'; adv(); while (/[0-9_]/.test(src[i] ?? '')) { s += src[i]; adv(); } }
      let ty = real ? 'double' : 'int', raw = s;
      const suf = src[i];
      if (suf === 'f' || suf === 'F') { ty = 'float'; raw += suf; adv(); }
      else if (suf === 'd' || suf === 'D') { ty = 'double'; raw += suf; adv(); }
      else if (suf === 'm' || suf === 'M') fail('LAB', "The 'decimal' type isn't part of this lab.", l, c, 'Use int, float or double.');
      let v = Number(s.replace(/_/g, ''));
      if (ty === 'int' && v > 2147483647) fail('CS1021', 'Integral constant is too large', l, c, 'An int can store values up to 2,147,483,647.');
      if (ty === 'float') v = Math.fround(v);
      push({ t: 'num', v, ty, raw }, l, c); continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let s = ''; while (/[A-Za-z0-9_]/.test(src[i] ?? '')) { s += src[i]; adv(); }
      push({ t: KEYWORDS.has(s) ? 'kw' : 'id', v: s }, l, c); continue;
    }
    if (ch === '"' || (ch === '$' && src[i + 1] === '"')) {
      const interp = ch === '$'; if (interp) adv(); adv();
      let s = ''; const parts = [];
      for (;;) {
        if (i >= src.length || src[i] === '\n') fail('CS1010', 'Newline in constant', l, c, 'Text must end with a closing " on the same line.');
        const x = src[i];
        if (x === '"') { adv(); break; }
        if (x === '\\') {
          const map = { n: '\n', t: '\t', '"': '"', '\\': '\\', 0: '\0', r: '\r' };
          if (!(src[i + 1] in map)) fail('CS1009', 'Unrecognized escape sequence', line, col, 'Inside text, \\ starts a special character like \\n (new line). Write \\\\ for a backslash.');
          s += map[src[i + 1]]; adv(2); continue;
        }
        if (interp && x === '{') {
          if (src[i + 1] === '{') { s += '{'; adv(2); continue; }
          parts.push(s); s = ''; adv();
          const el = line, ec = col; let depth = 0, e = '';
          while (i < src.length && !(src[i] === '}' && depth === 0)) {
            if (src[i] === '\n') fail('CS1010', 'Newline in constant', l, c);
            if (src[i] === '{') depth++;
            if (src[i] === '}') depth--;
            e += src[i]; adv();
          }
          if (i >= src.length) fail('CS1010', 'Newline in constant', l, c);
          adv();
          if (!e.trim()) fail('CS1733', 'Expected expression', el, ec, 'Write a value or variable inside { }.');
          parts.push({ src: e, line: el, col: ec }); continue;
        }
        if (interp && x === '}') {
          if (src[i + 1] === '}') { s += '}'; adv(2); continue; }
          fail('CS8086', "A '}' character must be escaped (by doubling) in an interpolated string.", line, col);
        }
        s += x; adv();
      }
      if (interp) { parts.push(s); push({ t: 'istr', parts }, l, c); }
      else push({ t: 'str', v: s }, l, c);
      continue;
    }
    if (ch === "'") {
      adv();
      let v;
      if (src[i] === '\\') {
        const map = { n: '\n', t: '\t', "'": "'", '"': '"', '\\': '\\', 0: '\0' };
        if (!(src[i + 1] in map)) fail('CS1009', 'Unrecognized escape sequence', line, col);
        v = map[src[i + 1]]; adv(2);
      } else if (src[i] === "'" || src[i] === undefined || src[i] === '\n') fail('CS1011', 'Empty character literal', l, c, "Single quotes hold exactly one character, like 'a'.");
      else { v = src[i]; adv(); }
      if (src[i] !== "'") fail('CS1012', 'Too many characters in character literal', l, c, 'Single quotes hold ONE character (a char), like \'a\'. For text use double quotes: "hello".');
      adv();
      push({ t: 'chr', v }, l, c); continue;
    }
    const two = src.substr(i, 2);
    if (['++', '--', '+=', '-=', '*=', '/=', '%=', '==', '!=', '<=', '>=', '&&', '||', '=>'].includes(two)) { adv(2); push({ t: 'op', v: two }, l, c); continue; }
    if ('+-*/%=<>!(){};,.?:[]&|'.includes(ch)) { adv(); push({ t: 'op', v: ch }, l, c); continue; }
    fail('CS1056', `Unexpected character '${ch}'`, l, c);
  }
  tokens.push({ t: 'eof', v: '', line, col, endLine: line, endCol: col });
  return tokens;
}

// ─── Parser ───────────────────────────────────────────────────────────────────
const EXPECT = {
  ';': ['CS1002', '; expected', 'Every instruction in C# ends with a semicolon ;'],
  ')': ['CS1026', ') expected', 'Every ( needs a matching ).'],
  '(': ['CS1003', "Syntax error, '(' expected", ''],
  '}': ['CS1513', '} expected', 'Every { needs a matching }.'],
  '{': ['CS1514', '{ expected', ''],
  ':': ['CS1003', "Syntax error, ':' expected", ''],
  ']': ['CS1003', "Syntax error, ']' expected", 'Every [ needs a matching ].'],
};

class Parser {
  constructor(tokens) { this.toks = tokens; this.p = 0; this.depth = 0; this.inMethod = false; }
  get tok() { return this.toks[this.p]; }
  peek(n = 1) { return this.toks[Math.min(this.p + n, this.toks.length - 1)]; }
  prev() { return this.toks[this.p - 1] || this.toks[0]; }
  is(v) { const k = this.tok; return (k.t === 'op' || k.t === 'kw') && k.v === v; }
  eat(v) { return this.is(v) ? this.toks[this.p++] : null; }
  fail(code, message, at, hint = '') { throw new CSharpError({ code, message, line: at.line, col: at.col, hint }); }
  expect(v) {
    if (this.is(v)) return this.toks[this.p++];
    const [code, msg, hint] = EXPECT[v] || ['CS1003', `Syntax error, '${v}' expected`, ''];
    // Missing ; or ) are reported where the previous token ends, like Visual Studio does.
    const pv = this.prev();
    const at = (v === ';' || v === ')') && this.p > 0 ? { line: pv.endLine, col: pv.endCol } : this.tok;
    let extra = hint;
    if (v === ';' && this.tok.t !== 'eof' && this.tok.line === pv.endLine) extra = `Something unexpected was found: '${this.tok.v ?? ''}'. ${hint}`;
    this.fail(code, msg, at, extra);
  }
  node(type, props, at) { return { type, line: at.line, col: at.col, ...props }; }

  program() {
    const body = [];
    while (this.tok.t !== 'eof') {
      if (this.is('using')) { this.p++; while (!this.is(';') && this.tok.t !== 'eof') this.p++; this.expect(';'); continue; }
      if (this.is('}')) this.fail('CS1022', 'Type or namespace definition, or end-of-file expected', this.tok, 'There is an extra } here. Every } must close a { that was opened before it.');
      const st = this.statement();
      if (st.type !== 'ClassDecl' && body.some(b => b.type === 'ClassDecl'))
        this.fail('CS8803', 'Top-level statements must precede namespace and type declarations.', st, 'In C#, the main program goes first and the classes go at the end of the file.');
      body.push(st);
    }
    return { type: 'Program', body, line: 1, col: 1 };
  }

  // Looks ahead (without moving) for a type like int, Building, List<int>, int[] starting at token i.
  // Returns the index just after the type, or -1.
  scanType(i) {
    const t = this.toks[i];
    if (!t || !(t.t === 'id' || (t.t === 'kw' && TYPE_KEYWORDS.has(t.v)))) return -1;
    let j = i + 1;
    const tk = k => this.toks[Math.min(k, this.toks.length - 1)];
    if (t.t === 'id' && tk(j).t === 'op' && tk(j).v === '<') {
      const k = this.scanType(j + 1);
      if (k < 0 || !(tk(k).t === 'op' && tk(k).v === '>')) return -1;
      j = k + 1;
    }
    if (tk(j).t === 'op' && tk(j).v === '[' && tk(j + 1).v === ']') j += 2;
    return j;
  }
  isDeclStart() {
    const t = this.tok;
    if (t.t === 'kw' && TYPE_KEYWORDS.has(t.v)) return true;
    const j = this.scanType(this.p);
    if (j < 0) return false;
    const a = this.toks[j], b = this.toks[j + 1];
    return a && a.t === 'id' && !(b && b.t === 'op' && b.v === '(');
  }
  // Reads a type: int, Building, List<Building>, Vector3[] …
  typeName() {
    const t = this.tok;
    if (!(t.t === 'id' || (t.t === 'kw' && TYPE_KEYWORDS.has(t.v)))) this.fail('CS1001', 'Identifier expected', t);
    this.p++;
    let name = t.v;
    if (t.t === 'id' && this.is('<')) {
      this.p++;
      const inner = this.typeName();
      if (!this.is('>')) this.fail('CS1003', "Syntax error, '>' expected", this.tok, `A list type is written List<${inner}>.`);
      this.p++;
      name = `${name}<${inner}>`;
    }
    return this.arraySuffix(name);
  }
  // After a type name: optional [] makes it an array type.
  arraySuffix(type) {
    if (!this.is('[')) return type;
    const open = this.tok; this.p++;
    if (this.is(',')) this.fail('LAB', 'Arrays with several dimensions [,] are not part of this lab yet.', this.tok, 'Use a one-dimensional array: int[] heights.');
    if (!this.is(']')) this.fail('CS0270', "Array size cannot be specified in a variable declaration (try initializing with a 'new' expression)", open, `Write the size after new: ${type}[] name = new ${type}[5];`);
    this.p++;
    if (this.is('[')) this.fail('LAB', 'Arrays of arrays are not part of this lab.', this.tok);
    return type + '[]';
  }
  arrayItems() {
    const open = this.expect('{'), items = [];
    while (!this.is('}')) {
      if (this.tok.t === 'eof') this.fail('CS1513', '} expected', open, 'The list of values that starts with { must end with }.');
      items.push(this.expression());
      if (!this.eat(',')) break;
    }
    this.expect('}');
    return items;
  }

  isMethodStart() {
    if (this.is('void') || this.is('static')) return true;
    if (this.is('var')) return false;
    const j = this.scanType(this.p);
    if (j < 0) return false;
    const a = this.toks[j], b = this.toks[j + 1];
    return a && a.t === 'id' && b && b.t === 'op' && b.v === '(';
  }
  isClassStart() {
    let i = this.p;
    while (this.toks[i] && this.toks[i].t === 'kw' && MODIFIERS.has(this.toks[i].v)) i++;
    const t = this.toks[i];
    return t && t.t === 'kw' && (t.v === 'class' || t.v === 'struct');
  }

  methodDecl() {
    const start = this.tok;
    if (this.depth > 0 || this.inMethod) this.fail('LAB', 'In this lab, methods are written at the top level of the program, not inside { }.', start, 'Move the method below the main program, outside any { }.');
    if (this.eat('static')) { /* a static local function: allowed, same meaning here */ }
    const typeTok = this.tok;
    if (!(typeTok.t === 'id' || (typeTok.t === 'kw' && (TYPE_KEYWORDS.has(typeTok.v) || typeTok.v === 'void')))) this.fail('CS1001', 'Identifier expected', typeTok, 'A method starts with the type of value it gives back (void if none), then its name: void Tower(int h)');
    if (typeTok.v === 'var') this.fail('CS0825', "The contextual keyword 'var' may only appear within a local variable declaration", typeTok, 'Write the real type the method gives back: int, string… or void.');
    let returnType;
    if (typeTok.v === 'void') { this.p++; returnType = 'void'; } else returnType = this.typeName();
    const nameTok = this.tok;
    if (nameTok.t !== 'id') {
      if (nameTok.t === 'kw') this.fail('CS1041', `Identifier expected; '${nameTok.v}' is a keyword`, nameTok, `${nameTok.v} is a reserved word in C#. Choose another name for your method.`);
      this.fail('CS1001', 'Identifier expected', nameTok, 'After the type, write the name of the method: void Tower(int h)');
    }
    this.p++;
    const params = this.parseParams();
    const close = this.prev();
    const body = this.methodBody(returnType);
    return this.node('MethodDecl', { returnType, name: nameTok.v, params, body, nameLine: nameTok.line, nameCol: nameTok.col, headerEnd: close.line }, start);
  }
  parseParams() {
    this.expect('(');
    const params = [];
    if (!this.is(')')) {
      do {
        const pt = this.tok;
        if (!(pt.t === 'id' || (pt.t === 'kw' && TYPE_KEYWORDS.has(pt.v)))) this.fail('CS1001', 'Identifier expected', pt, 'Each parameter needs a type and a name: int h');
        if (pt.v === 'var') this.fail('CS0825', "The contextual keyword 'var' may only appear within a local variable declaration", pt, 'Parameters need a real type: int h, not var h.');
        const ptype = this.typeName();
        const pn = this.tok;
        if (pn.t !== 'id') {
          if (pn.t === 'kw') this.fail('CS1041', `Identifier expected; '${pn.v}' is a keyword`, pn, `${pn.v} is a reserved word in C#. Choose another name.`);
          this.fail('CS1001', 'Identifier expected', pn, `After the type, write a name for the parameter: ${pt.v} value`);
        }
        this.p++;
        params.push({ varType: ptype, name: pn.v, line: pn.line, col: pn.col });
      } while (this.eat(','));
    }
    this.expect(')');
    return params;
  }
  methodBody(returnType) {
    const was = this.inMethod;
    this.inMethod = true;
    let body;
    if (this.is('=>')) {
      const arrow = this.tok; this.p++;
      const value = this.expression();
      this.expect(';');
      const ret = returnType === 'void' ? this.node('ExprStmt', { expr: value }, value) : this.node('Return', { value }, arrow);
      body = this.node('Block', { body: [ret], endLine: arrow.line, arrow: true }, arrow);
    } else {
      if (this.is(';')) this.fail('CS1514', '{ expected', this.tok, 'A method needs a body: the instructions go between { and }.');
      body = this.block();
    }
    this.inMethod = was;
    return body;
  }

  // class Name : Base { fields, constructors, methods }   (also struct)
  classDecl() {
    const start = this.tok;
    if (this.depth > 0 || this.inMethod) this.fail('LAB', 'In this lab, classes are written at the top level, below the main program.', start);
    const mods = [];
    while (this.tok.t === 'kw' && MODIFIERS.has(this.tok.v)) mods.push(this.toks[this.p++].v);
    const kind = this.toks[this.p++].v;
    const nameTok = this.tok;
    if (nameTok.t !== 'id') this.fail(nameTok.t === 'kw' ? 'CS1041' : 'CS1001', nameTok.t === 'kw' ? `Identifier expected; '${nameTok.v}' is a keyword` : 'Identifier expected', nameTok, `Write the name of the ${kind}: ${kind} Building`);
    this.p++;
    let base = null, baseTok = null;
    if (this.eat(':')) { baseTok = this.tok; base = this.typeName(); }
    const open = this.expect('{');
    const members = [];
    this.inClass = nameTok.v;
    while (!this.is('}')) {
      if (this.tok.t === 'eof') this.fail('CS1513', '} expected', open, `The { of ${kind} ${nameTok.v} (line ${open.line}) is never closed.`);
      members.push(this.member(nameTok.v));
    }
    this.inClass = null;
    const close = this.expect('}');
    return this.node('ClassDecl', { kind, name: nameTok.v, base, baseLine: baseTok?.line, mods, members, nameLine: nameTok.line, nameCol: nameTok.col, endLine: close.line }, start);
  }
  member(className) {
    const start = this.tok, mods = [];
    while (this.tok.t === 'kw' && MODIFIERS.has(this.tok.v)) mods.push(this.toks[this.p++].v);
    if (this.is('class') || this.is('struct')) this.fail('LAB', 'Classes inside classes are not part of this lab.', this.tok);
    // Constructor: Name(…)
    if (this.tok.t === 'id' && this.tok.v === className && this.peek().v === '(') {
      const nameTok = this.toks[this.p++];
      const params = this.parseParams();
      let baseArgs = null;
      if (this.eat(':')) {
        if (!this.is('base')) this.fail('LAB', "Only ': base(…)' is part of this lab.", this.tok);
        this.p++;
        this.expect('(');
        baseArgs = [];
        if (!this.is(')')) { do { baseArgs.push(this.expression()); } while (this.eat(',')); }
        this.expect(')');
      }
      const body = this.methodBody('void');
      return this.node('Ctor', { mods, params, baseArgs, body, name: className, nameLine: nameTok.line, nameCol: nameTok.col }, start);
    }
    let returnType;
    const typeTok = this.tok;
    if (this.is('void')) { this.p++; returnType = 'void'; }
    else {
      if (this.tok.t === 'id' && this.peek().v === '(') this.fail('CS1520', 'Method must have a return type', this.tok, `A constructor has exactly the name of the class (${className}). A method needs a type or void first: void ${this.tok.v}()`);
      returnType = this.typeName();
    }
    const nameTok = this.tok;
    if (nameTok.t !== 'id') this.fail(nameTok.t === 'kw' ? 'CS1041' : 'CS1001', nameTok.t === 'kw' ? `Identifier expected; '${nameTok.v}' is a keyword` : 'Identifier expected', nameTok, 'Write a name: public int floors;');
    this.p++;
    if (this.is('(')) {
      const params = this.parseParams();
      const body = this.methodBody(returnType);
      return this.node('MethodDecl', { mods, returnType, name: nameTok.v, params, body, nameLine: nameTok.line, nameCol: nameTok.col, owner: className }, start);
    }
    if (this.is('{')) this.fail('LAB', 'Properties with { get; set; } are not part of this lab. Use a public field.', this.tok, `public ${returnType} ${nameTok.v};`);
    if (returnType === 'void') this.fail('CS1547', "Keyword 'void' cannot be used in this context", typeTok, 'A field needs a type, like int or Color.');
    const decls = [];
    let n = nameTok;
    for (;;) {
      let init = null;
      if (this.eat('=')) init = this.expression();
      decls.push({ name: n.v, init, line: n.line, col: n.col });
      if (!this.eat(',')) break;
      n = this.tok; if (n.t !== 'id') this.fail('CS1001', 'Identifier expected', n); this.p++;
    }
    this.expect(';');
    return this.node('Field', { mods, varType: returnType, decls }, start);
  }

  statement() {
    const t = this.tok;
    if (this.is('{')) return this.block();
    if (this.isClassStart()) return this.classDecl();
    if (this.isMethodStart()) return this.methodDecl();
    if (this.is('return')) {
      this.p++;
      const value = this.is(';') ? null : this.expression();
      this.expect(';');
      return this.node('Return', { value }, t);
    }
    if (this.is(';')) { this.p++; return this.node('Empty', {}, t); }
    if (t.t === 'kw') {
      switch (t.v) {
        case 'if': return this.ifStmt();
        case 'while': return this.whileStmt();
        case 'do': return this.doStmt();
        case 'for': return this.forStmt();
        case 'foreach': return this.foreachStmt();
        case 'break': case 'continue': this.p++; this.expect(';'); return this.node(t.v === 'break' ? 'Break' : 'Continue', {}, t);
        case 'else': this.fail('CS1525', "Invalid expression term 'else'", t, 'An else must come right after the } of an if block.');
        default:
          if (!TYPE_KEYWORDS.has(t.v) && !['true', 'false', 'this', 'base', 'new', 'null'].includes(t.v))
            this.fail('LAB', `'${t.v}' is valid C#, but it isn't part of this lab yet.`, t);
      }
    }
    let s;
    if (this.isDeclStart()) s = this.declaration();
    else s = this.simple();
    this.expect(';');
    return s;
  }

  block() {
    const open = this.expect('{'), body = [];
    this.depth++;
    while (!this.is('}')) {
      if (this.tok.t === 'eof') this.fail('CS1513', '} expected', open, `The { on line ${open.line} is never closed.`);
      body.push(this.statement());
    }
    this.depth--;
    const close = this.expect('}');
    return this.node('Block', { body, endLine: close.line }, open);
  }

  declaration() {
    const typeTok = this.tok;
    const varType = typeTok.v === 'var' ? (this.p++, 'var') : this.typeName();
    const decls = [];
    do {
      const n = this.tok;
      if (n.t !== 'id') {
        if (n.t === 'kw') this.fail('CS1041', `Identifier expected; '${n.v}' is a keyword`, n, `${n.v} is a reserved word in C#. Choose another name for your variable.`);
        this.fail('CS1001', 'Identifier expected', n, 'After the type, write a name for the variable: int count = 0;');
      }
      this.p++;
      let init = null;
      if (this.eat('=')) {
        if (this.is('{')) { const at = this.tok; init = this.node('ArrayInit', { items: this.arrayItems() }, at); }
        else init = this.expression();
      }
      else if (this.is('==')) this.fail('CS1002', '; expected', this.tok, 'To give a variable a value use a single = (== compares two values).');
      decls.push({ name: n.v, init, line: n.line, col: n.col });
    } while (this.eat(','));
    return this.node('VarDecl', { varType, decls }, typeTok);
  }

  simple() {
    const start = this.tok;
    if (this.is('++') || this.is('--')) { this.p++; const target = this.postfix(); return this.node('IncDec', { op: start.v, target, prefix: true }, start); }
    const e = this.expression();
    if (this.tok.t === 'op' && ['=', '+=', '-=', '*=', '/=', '%='].includes(this.tok.v)) {
      const op = this.tok.v; this.p++;
      const value = this.expression();
      return this.node('Assign', { op, target: e, value }, start);
    }
    if (this.is('++') || this.is('--')) { const op = this.tok.v; this.p++; return this.node('IncDec', { op, target: e }, start); }
    return this.node('ExprStmt', { expr: e }, start);
  }

  condition() {
    this.expect('(');
    const test = this.expression();
    if (this.is('=')) this.fail('CS0029', "'=' stores a value. To compare two values, use ==", this.tok, 'Write == to ask "is it equal?" and = to store a value.');
    this.expect(')');
    return test;
  }
  ifStmt() {
    const t = this.tok; this.p++;
    const test = this.condition();
    const cons = this.statement();
    let alt = null, elseLine = null;
    if (this.is('else')) { elseLine = this.tok.line; this.p++; alt = this.statement(); }
    return this.node('If', { test, cons, alt, elseLine }, t);
  }
  whileStmt() { const t = this.tok; this.p++; const test = this.condition(); return this.node('While', { test, body: this.statement() }, t); }
  doStmt() {
    const t = this.tok; this.p++;
    const body = this.statement();
    const w = this.tok;
    if (!this.is('while')) this.fail('CS1003', "Syntax error, 'while' expected", w);
    this.p++;
    const test = this.condition(); this.expect(';');
    return this.node('Do', { body, test, whileLine: w.line }, t);
  }
  forStmt() {
    const t = this.tok; this.p++;
    this.expect('(');
    let init = null, test = null, update = null;
    if (!this.is(';')) init = this.isDeclStart() ? this.declaration() : this.simple();
    this.expect(';');
    if (!this.is(';')) test = this.expression();
    if (this.is('=')) this.fail('CS0029', "'=' stores a value. To compare two values, use ==", this.tok);
    this.expect(';');
    if (!this.is(')')) update = this.simple();
    if (this.is(',')) this.fail('LAB', 'Several updates separated by commas are not part of this lab.', this.tok);
    this.expect(')');
    return this.node('For', { init, test, update, body: this.statement() }, t);
  }

  foreachStmt() {
    const t = this.tok; this.p++;
    this.expect('(');
    const typeTok = this.tok;
    if (!(typeTok.t === 'id' || (typeTok.t === 'kw' && TYPE_KEYWORDS.has(typeTok.v)))) this.fail('CS1525', `Invalid expression term '${typeTok.v}'`, typeTok, 'foreach starts with the type and the name of the item: foreach (int h in heights)');
    const varType = typeTok.v === 'var' ? (this.p++, 'var') : this.typeName();
    const n = this.tok;
    if (n.t !== 'id') this.fail('CS1001', 'Identifier expected', n, 'Write a name for each item: foreach (int h in heights)');
    this.p++;
    if (!this.is('in')) this.fail('CS1515', "'in' expected", this.tok, 'foreach (type name in array)');
    this.p++;
    const collection = this.expression();
    this.expect(')');
    return this.node('Foreach', { varType, name: n.v, nameLine: n.line, nameCol: n.col, collection, body: this.statement() }, t);
  }

  expression() { return this.ternary(); }
  ternary() {
    const c = this.binary(0);
    if (this.is('?')) { this.p++; const a = this.expression(); this.expect(':'); const b = this.expression(); return { type: 'Cond', test: c, a, b, line: c.line, col: c.col }; }
    return c;
  }
  binary(level) {
    const LEVELS = [['||'], ['&&'], ['==', '!='], ['<', '>', '<=', '>='], ['+', '-'], ['*', '/', '%']];
    if (level === LEVELS.length) return this.unary();
    let left = this.binary(level + 1);
    while (this.tok.t === 'op' && LEVELS[level].includes(this.tok.v)) {
      const op = this.tok; this.p++;
      const right = this.binary(level + 1);
      left = { type: 'Binary', op: op.v, left, right, line: left.line, col: left.col, opLine: op.line, opCol: op.col };
    }
    if (level === 1 && (this.is('&') || this.is('|'))) this.fail('LAB', `Use ${this.tok.v}${this.tok.v} for logical ${this.tok.v === '&' ? 'AND' : 'OR'}.`, this.tok);
    return left;
  }
  unary() {
    const t = this.tok;
    if (this.is('!') || this.is('-') || this.is('+')) { this.p++; return this.node('Unary', { op: t.v, arg: this.unary() }, t); }
    if (this.is('++') || this.is('--')) this.fail('LAB', `Use ${t.v} as its own instruction (i${t.v};), not inside another expression.`, t);
    if (this.is('(') && this.peek().t === 'kw' && ['int', 'float', 'double'].includes(this.peek().v) && this.peek(2).v === ')') {
      this.p++; const to = this.tok.v; this.p += 2;
      return this.node('Cast', { to, arg: this.unary() }, t);
    }
    return this.postfix();
  }
  postfix() {
    let e = this.primary();
    for (;;) {
      if (this.is('.')) {
        this.p++;
        const n = this.tok;
        if (n.t !== 'id') this.fail('CS1001', 'Identifier expected', n, 'After a dot, write the name of a property or method, like drone.Move');
        this.p++;
        e = { type: 'Member', object: e, name: n.v, line: e.line, col: e.col, nameLine: n.line, nameCol: n.col };
        continue;
      }
      if (this.is('(')) {
        this.p++;
        const args = [];
        if (!this.is(')')) { do { args.push(this.expression()); } while (this.eat(',')); }
        this.expect(')');
        e = { type: 'Call', callee: e, args, line: e.line, col: e.col };
        continue;
      }
      if (this.is('[')) {
        this.p++;
        const index = this.expression();
        this.expect(']');
        e = { type: 'Index', object: e, index, line: e.line, col: e.col };
        continue;
      }
      return e;
    }
  }
  newExpr() {
    const t = this.tok; this.p++;
    const typeTok = this.tok;
    if (typeTok.t === 'op' && typeTok.v === '[') this.fail('LAB', 'Write the type of the array after new: new int[] { … }', typeTok);
    if (!(typeTok.t === 'id' || (typeTok.t === 'kw' && TYPE_KEYWORDS.has(typeTok.v) && typeTok.v !== 'var'))) this.fail('CS1526', 'A new expression requires an argument list or (), [], or {} after type', typeTok);
    this.p++;
    let tname = typeTok.v;
    if (typeTok.t === 'id' && this.is('<')) {
      this.p++; const inner = this.typeName();
      if (!this.is('>')) this.fail('CS1003', "Syntax error, '>' expected", this.tok); this.p++;
      tname = `${tname}<${inner}>`;
    }
    if (this.is('(') || (this.is('{') && tname.includes('<'))) {
      const args = [];
      if (this.eat('(')) { if (!this.is(')')) { do { args.push(this.expression()); } while (this.eat(',')); } this.expect(')'); }
      let items = null;
      if (this.is('{')) items = this.arrayItems();
      return this.node('NewObject', { typeName: tname, args, items }, t);
    }
    if (!this.is('[')) this.fail('CS1526', 'A new expression requires an argument list or (), [], or {} after type', this.tok, `To create an object: new ${typeTok.v}() · an array: new ${typeTok.v}[5]`);
    this.p++;
    if (this.is(']')) {
      this.p++;
      if (!this.is('{')) this.fail('CS1586', 'Array creation must have array size or array initializer', this.tok, `Give a size, new ${typeTok.v}[5], or the values, new ${typeTok.v}[] { 1, 2, 3 }.`);
      return this.node('NewArray', { elem: typeTok.v, items: this.arrayItems() }, t);
    }
    if (this.is(',')) this.fail('LAB', 'Arrays with several dimensions [,] are not part of this lab yet.', this.tok);
    const size = this.expression();
    this.expect(']');
    if (this.is('{')) this.fail('LAB', 'Give either the size or the values, not both.', this.tok, `new ${typeTok.v}[] { 1, 2, 3 } works out the size by itself.`);
    return this.node('NewArray', { elem: typeTok.v, size }, t);
  }
  primary() {
    const t = this.tok;
    switch (t.t) {
      case 'num': this.p++; return this.node('Num', { value: t.v, ty: t.ty, raw: t.raw }, t);
      case 'str': this.p++; return this.node('Str', { value: t.v }, t);
      case 'chr': this.p++; return this.node('Char', { value: t.v }, t);
      case 'istr': {
        this.p++;
        const parts = t.parts.map(p => {
          if (typeof p === 'string') return p;
          const sub = new Parser(tokenize(p.src, p.line, p.col));
          const e = sub.expression();
          if (sub.tok.t !== 'eof') sub.fail('CS1026', ') expected', sub.tok);
          return e;
        });
        return this.node('Interp', { parts }, t);
      }
      case 'id': this.p++; return this.node('Ident', { name: t.v }, t);
      case 'kw':
        if (t.v === 'true' || t.v === 'false') { this.p++; return this.node('Bool', { value: t.v === 'true' }, t); }
        if (t.v === 'new') return this.newExpr();
        if (t.v === 'this') { this.p++; return this.node('This', {}, t); }
        if (t.v === 'base') { this.p++; return this.node('Base', {}, t); }
        if (t.v === 'null') { this.p++; return this.node('Null', {}, t); }
        if (TYPE_KEYWORDS.has(t.v)) this.fail('CS1525', `Invalid expression term '${t.v}'`, t, `${t.v} is a type. To create a variable write: ${t.v} name = value;`);
        this.fail('LAB', `'${t.v}' is valid C#, but it isn't part of this lab yet.`, t);
        break;
      case 'op':
        if (t.v === '(') { this.p++; const e = this.expression(); this.expect(')'); return this.node('Paren', { expr: e }, t); }
        if (t.v === '{') this.fail('CS1525', "Invalid expression term '{'", t, 'Here, create the array with new: new int[] { 1, 2, 3 }');
        break;
      case 'eof':
        this.fail('CS1733', 'Expected expression', t, 'The program ends in the middle of an instruction.');
    }
    this.fail('CS1525', `Invalid expression term '${t.v}'`, t, 'A value, a variable or a calculation was expected here.');
  }
}

// Calculator mode: every line is one calculation, declaration or assignment.
// No semicolons needed (like C# Interactive). Used for the very first lessons.
function parseCalc(tokens) {
  const body = [], groups = new Map();
  for (const t of tokens) {
    if (t.t === 'eof') continue;
    if (!groups.has(t.line)) groups.set(t.line, []);
    groups.get(t.line).push(t);
  }
  for (const [line, toks] of groups) {
    const last = toks.at(-1);
    const p = new Parser([...toks, { t: 'eof', v: '', line, col: last.endCol, endLine: line, endCol: last.endCol }]);
    if (p.tok.t === 'kw' && !TYPE_KEYWORDS.has(p.tok.v) && !['true', 'false'].includes(p.tok.v))
      p.fail('LAB', `'${p.tok.v}' is not used in the calculator.`, p.tok, 'Here each line is just a calculation, like 2 + 3.');
    const stmt = p.isDeclStart() ? p.declaration() : p.simple();
    p.eat(';');
    if (p.tok.t !== 'eof') {
      if (/^_{2,}$/.test(p.tok.v)) p.fail('LAB', 'Fill in the blank ___', p.tok, 'Replace ___ with the missing piece. Here it goes between two values, so it is probably an operator.');
      if (p.tok.v === '=>') p.fail('LAB', "'=>' is not a comparison. Did you mean >= ?", p.tok, 'Greater than or equal is written >= : the > goes first.');
      if (stmt.type === 'VarDecl' && p.tok.t === 'id') p.fail('LAB', "A name can't contain spaces", p.tok, `Join the words and start each new word with a capital letter: ${stmt.decls.at(-1).name}${p.tok.v[0].toUpperCase()}${p.tok.v.slice(1)}`);
      if (p.is(',') && toks.some(t => t.t === 'num')) p.fail('LAB', "Decimals use a point, not a comma", p.tok, 'Write 3.5, not 3,5.');
      p.fail('LAB', `Unexpected '${p.tok.v}'`, p.tok, 'Write one calculation per line. Did you forget an operator such as + or *?');
    }
    body.push({ type: 'Calc', stmt, line, col: toks[0].col });
  }
  return { type: 'Program', body, line: 1, col: 1, calc: true };
}

// ─── Lab API (the drone, Console, Math) ──────────────────────────────────────
export const DRONE_PROPS = { X: 'int', Z: 'int', Height: 'int', Ground: 'Color' };
export const METHODS = {
  'Drone.Move': { overloads: [['Direction'], ['Direction', 'int']], returns: 'void' },
  'Drone.MoveTo': { overloads: [['int', 'int']], returns: 'void' },
  'Drone.Place': { overloads: [[], ['Color']], returns: 'void' },
  'Drone.Build': { overloads: [['int'], ['int', 'Color']], returns: 'void' },
  'Drone.Scan': { overloads: [[]], returns: 'int[]' },
  'Console.WriteLine': { overloads: [[], ['any']], returns: 'void' },
  'Console.Write': { overloads: [['any']], returns: 'void' },
  'Math.Abs': { overloads: [['number']], returns: 'arg' },
  'Math.Max': { overloads: [['number', 'number']], returns: 'widest' },
  'Math.Min': { overloads: [['number', 'number']], returns: 'widest' },
  'Math.Sqrt': { overloads: [['double']], returns: 'double' },
  'Math.Pow': { overloads: [['double', 'double']], returns: 'double' },
  'Math.Floor': { overloads: [['double']], returns: 'double' },
  'Math.Round': { overloads: [['double']], returns: 'double' },
  'Mathf.Abs': { overloads: [['number']], returns: 'arg' },
  'Mathf.Min': { overloads: [['float', 'float']], returns: 'float' },
  'Mathf.Max': { overloads: [['float', 'float']], returns: 'float' },
  'Mathf.Clamp': { overloads: [['float', 'float', 'float']], returns: 'float' },
  'Mathf.Sin': { overloads: [['float']], returns: 'float' },
  'Mathf.Cos': { overloads: [['float']], returns: 'float' },
  'Mathf.Sqrt': { overloads: [['float']], returns: 'float' },
  'Vector3.Distance': { overloads: [['Vector3', 'Vector3']], returns: 'float' },
  'Vector3.Lerp': { overloads: [['Vector3', 'Vector3', 'float']], returns: 'Vector3' },
  'Scene.Add': { overloads: [['MonoBehaviour']], returns: 'void' },
  'Debug.Log': { overloads: [['any']], returns: 'void' },
};
export const STRING_METHODS = {
  ToUpper: { overloads: [[]], returns: 'string' }, ToLower: { overloads: [[]], returns: 'string' }, Trim: { overloads: [[]], returns: 'string' },
  Substring: { overloads: [['int'], ['int', 'int']], returns: 'string' },
  Contains: { overloads: [['string'], ['char']], returns: 'bool' },
  IndexOf: { overloads: [['string'], ['char']], returns: 'int' },
  Replace: { overloads: [['string', 'string'], ['char', 'char']], returns: 'string' },
  StartsWith: { overloads: [['string']], returns: 'bool' }, EndsWith: { overloads: [['string']], returns: 'bool' },
};
const methodNames = cls => Object.keys(METHODS).filter(k => k.startsWith(cls + '.')).map(k => k.split('.')[1]);

// Sub-expressions of an expression node, in evaluation order.
function kidsOf(e) {
  const out = [];
  for (const k of ['object', 'left', 'right', 'arg', 'expr', 'index', 'test', 'a', 'b', 'callee']) if (e[k] && typeof e[k] === 'object') out.push(e[k]);
  if (e.args) out.push(...e.args);
  if (e.items) out.push(...e.items);
  if (e.size) out.push(e.size);
  if (e.type === 'Interp') for (const p of e.parts) if (typeof p !== 'string') out.push(p);
  return out;
}
// Does this expression contain a call to one of the student's own methods?
export const hasUserCall = e => !!e && (!!e.userCall || !!e.hasUserCall || (e.type === 'Member' && hasUserCall(e.object)));
export const signature = m => `${m.name}(${m.params.map(p => p.varType).join(', ')})`;

// Names declared inside a statement list (used for friendlier "does not exist" hints).
function declaredNames(stmts, out = new Map()) {
  const visit = s => {
    if (!s || typeof s !== 'object') return;
    if (s.type === 'MethodDecl') return;
    if (s.type === 'VarDecl') for (const d of s.decls) if (!out.has(d.name)) out.set(d.name, d.line);
    if (s.type === 'Foreach' && !out.has(s.name)) out.set(s.name, s.nameLine);
    for (const k of ['body', 'cons', 'alt', 'init', 'update']) {
      const v = s[k];
      if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v === 'object' && v.type) visit(v);
    }
  };
  stmts.forEach(visit);
  return out;
}
// Can execution run past the end of this statement? (for CS0161 and CS0162)
function alwaysReturns(s) {
  if (!s) return false;
  switch (s.type) {
    case 'Return': return true;
    case 'Block': return s.body.some(alwaysReturns);
    case 'If': return !!s.alt && alwaysReturns(s.cons) && alwaysReturns(s.alt);
  }
  return false;
}

// ─── Checker (what the C# compiler verifies before running) ──────────────────
class Checker {
  constructor() {
    this.errors = []; this.warnings = [];
    this.scopes = [];
    this.loops = 0;
    this.stats = { features: new Set(), declTypes: new Set(), statements: 0, methods: new Set(), numbers: [], userMethods: new Set(), calls: new Map(), returns: 0 };
    this.reportedUnassigned = new Set();
    this.userMethods = new Map();
    this.method = null;       // the method being checked (null = main program)
    this.mainNames = new Map();
    this.methodLocals = new Map(); // name → method name, for hints in the main program
    this.types = builtinTypes();   // classes and structs: the lab's and the student's
    this.cls = null;               // the class whose code is being checked
  }

  // ─── Classes, structs and references ─────────────────────────────────────
  info(t) { return typeof t === 'string' ? this.types.get(t) : null; }
  isStruct(t) { return this.info(t)?.kind === 'struct'; }
  isRef(t) { return t === 'string' || t === 'null' || isArr(t) || !!listElem(t) || this.info(t)?.kind === 'class'; }
  chain(t) { const out = []; let i = this.info(t); const seen = new Set(); while (i && !seen.has(i)) { seen.add(i); out.push(i); i = this.info(i.base); } return out; }
  isSubclass(a, b) { return this.chain(a).some(i => i.name === b); }
  assignable(from, to) {
    if (!from || !to) return true;
    if (implicitOK(from, to)) return true;
    if (from === 'null') return this.isRef(to);
    return this.info(from)?.kind === 'class' && this.isSubclass(from, to);
  }
  findField(t, name) { for (const i of this.chain(t)) { const f = i.fields.get(name); if (f) return { f, owner: i.name }; } return null; }
  findMethod(t, name) { for (const i of this.chain(t)) { const m = i.methods.get(name); if (m) return { m, owner: i.name }; } return null; }
  canAccess(access, owner) {
    if (access === 'public') return true;
    if (!this.cls) return false;
    return access === 'private' ? this.cls.name === owner : this.isSubclass(this.cls.name, owner);
  }
  accessError(at, owner, name, kind) {
    const f = this.info(owner)?.fields.get(name);
    this.error('CS0122', `'${owner}.${name}' is inaccessible due to its protection level`, at,
      kind === 'method' ? `Methods are private unless you write public. Write public before it in ${owner}: public void ${name}(…)` : `Fields are private unless you write public. Write public ${f?.type || 'int'} ${name}; in ${owner}, or use a public method.`);
  }
  declareClasses(decls) {
    for (const c of decls) {
      if (this.types.has(c.name) || STATIC_CLASSES.includes(c.name) || VALUE_TYPES.includes(c.name)) {
        this.error(this.types.get(c.name)?.builtin || STATIC_CLASSES.includes(c.name) ? 'LAB' : 'CS0101', this.types.get(c.name)?.builtin || STATIC_CLASSES.includes(c.name) ? `'${c.name}' is already a type of this lab. Choose another name.` : `The namespace '<global namespace>' already contains a definition for '${c.name}'`, { line: c.nameLine, col: c.nameCol });
        continue;
      }
      c.info = { name: c.name, kind: c.kind, base: c.base, decl: c, fields: new Map(), methods: new Map(), ctors: [], abstract: c.mods.includes('abstract') };
      this.types.set(c.name, c.info);
      this.stats.features.add(c.kind === 'struct' ? 'struct' : 'class');
    }
    for (const c of decls) {
      const I = c.info; if (!I) continue;
      if (I.base) {
        const b = this.info(I.base);
        if (!b) { this.error('CS0246', `The type or namespace name '${I.base}' could not be found`, { line: c.baseLine, col: c.nameCol }, 'The base class must exist: class Ball : MonoBehaviour'); I.base = null; }
        else if (c.kind === 'struct') { this.error('CS0527', `Type '${I.base}' in interface list is not an interface`, c, 'A struct cannot inherit from a class. Use class instead of struct.'); I.base = null; }
        else if (b.kind === 'struct') { this.error('CS0509', `'${c.name}': cannot derive from sealed type '${I.base}'`, c, 'Structs cannot be used as base classes.'); I.base = null; }
        else if (this.chain(I.base).includes(I)) { this.error('CS0146', `Circular base type dependency involving '${I.base}' and '${c.name}'`, c); I.base = null; }
        else this.stats.features.add('inheritance');
      }
      for (const m of c.members) {
        const access = m.mods.includes('public') ? 'public' : m.mods.includes('protected') ? 'protected' : 'private';
        if (m.mods.includes('static')) this.error('LAB', 'static members are not part of this lab: every field and method belongs to an object.', m);
        if (m.type === 'Field') {
          const type = this.resolveType(m.varType, m);
          for (const d of m.decls) {
            if (I.fields.has(d.name) || I.methods.has(d.name)) { this.error('CS0102', `The type '${c.name}' already contains a definition for '${d.name}'`, d); continue; }
            I.fields.set(d.name, { type, access, init: d.init, line: d.line, decl: d });
            this.stats.features.add('field');
          }
        } else if (m.type === 'MethodDecl') {
          if (m.name === c.name) { this.error('CS0542', `'${m.name}': member names cannot be the same as their enclosing type`, { line: m.nameLine, col: m.nameCol }, `A constructor has no return type: public ${c.name}(…) { … }`); continue; }
          if (I.fields.has(m.name) || I.methods.has(m.name)) { this.error(I.methods.has(m.name) ? 'LAB' : 'CS0102', I.methods.has(m.name) ? `'${c.name}' already has a method called '${m.name}'. Overloads are not part of this lab: choose another name.` : `The type '${c.name}' already contains a definition for '${m.name}'`, { line: m.nameLine, col: m.nameCol }); continue; }
          m.access = access; m.owner = c.name;
          m.isVirtual = m.mods.includes('virtual') || m.mods.includes('abstract'); m.isOverride = m.mods.includes('override');
          m.resolvedReturn = m.returnType === 'void' ? 'void' : this.resolveType(m.returnType, m);
          for (const p of m.params) p.resolvedType = this.resolveType(p.varType, p);
          I.methods.set(m.name, m);
          this.stats.features.add('classMethod');
        } else if (m.type === 'Ctor') {
          m.access = access; m.owner = c.name;
          for (const p of m.params) p.resolvedType = this.resolveType(p.varType, p);
          if (I.ctors.some(k => k.params.length === m.params.length)) this.error('CS0111', `Type '${c.name}' already defines a member called '${c.name}' with the same parameter types`, m);
          I.ctors.push(m);
          this.stats.features.add('constructor');
        }
      }
    }
    // override / virtual rules
    for (const c of decls) {
      const I = c.info; if (!I) continue;
      for (const m of I.methods.values()) {
        const inherited = I.base ? this.findMethod(I.base, m.name) : null;
        if (m.isOverride) {
          if (!inherited) this.error('CS0115', `'${c.name}.${m.name}()': no suitable method found to override`, { line: m.nameLine, col: m.nameCol }, `The base class has no method called ${m.name} to override.`);
          else if (!inherited.m.isVirtual && !inherited.m.isOverride) this.error('CS0506', `'${c.name}.${m.name}()': cannot override inherited member '${inherited.owner}.${m.name}()' because it is not marked virtual, abstract, or override`, { line: m.nameLine, col: m.nameCol }, `Write virtual in ${inherited.owner}: public virtual void ${m.name}()`);
          else { m.overrides = inherited.m; this.stats.features.add('override'); }
        } else if (inherited && !inherited.m.isVirtual && !inherited.m.isOverride) {
          this.warnings.push(new CSharpError({ code: 'CS0108', message: `'${c.name}.${m.name}()' hides inherited member '${inherited.owner}.${m.name}()'. Use the new keyword if hiding was intended.`, line: m.nameLine, col: m.nameCol, hint: `A ${inherited.owner} variable will still run the ${inherited.owner} version. To replace it for every ${c.name}, make it virtual in ${inherited.owner} and override here.` }));
        } else if (inherited && (inherited.m.isVirtual || inherited.m.isOverride)) {
          this.warnings.push(new CSharpError({ code: 'CS0114', message: `'${c.name}.${m.name}()' hides inherited member '${inherited.owner}.${m.name}()'. To make the current member override that implementation, add the override keyword. Otherwise add the new keyword.`, line: m.nameLine, col: m.nameCol, hint: `Write override: public override void ${m.name}(). Without it, a ${inherited.owner} variable still runs the ${inherited.owner} version.` }));
        }
      }
    }
  }
  checkClass(c) {
    const I = c.info; if (!I) return;
    this.cls = I;
    for (const [name, f] of I.fields) if (f.init && f.decl) {
      const saved = this.scopes; this.scopes = [new Map()];
      const t = this.type(f.init, new Set());
      if (t && f.type) this.convertible(f.init, t, f.type);
      this.scopes = saved;
    }
    for (const k of I.ctors) {
      if (k.baseArgs) {
        const base = this.info(I.base);
        const saved = this.scopes; this.scopes = [new Map(k.params.map(p => [p.name, { name: p.name, type: p.resolvedType, line: p.line, param: true }]))];
        const types = k.baseArgs.map(a => this.type(a, new Set(this.scopes[0].values())));
        this.scopes = saved;
        if (!base) this.error('CS0117', `'object' does not contain a constructor that takes ${types.length} arguments`, k);
        else k.baseCtor = this.pickCtor(base, types, k.baseArgs, k);
      }
      this.methodBody(Object.assign(k, { resolvedReturn: 'void', nameLine: k.nameLine }), I);
    }
    for (const m of I.methods.values()) this.methodBody(m, I);
    this.cls = null;
  }
  pickCtor(I, types, args, at) {
    const ctors = I.ctors.length ? I.ctors : [{ params: [], implicit: true }];
    const k = ctors.find(c => c.params.length === types.length);
    if (!k) {
      const sig = ctors.map(c => `${I.name}(${c.params.map(p => p.resolvedType || p.varType).join(', ')})`).join(' or ');
      this.error('CS1729', `'${I.name}' does not contain a constructor that takes ${types.length} arguments`, at, `Create it with ${sig}.`);
      return null;
    }
    types.forEach((t, i) => {
      const want = k.params[i].resolvedType;
      if (t && want && !this.assignable(t, want)) {
        const hint = want === 'float' && t === 'double' ? args[i].raw ? `Vector3 uses float numbers: write ${args[i].raw}f.` : 'Vector3 uses float numbers: add an f to decimal numbers, like 1.5f.' : `Parameter ${k.params[i].name} is of type ${want}.`;
        this.error('CS1503', `Argument ${i + 1}: cannot convert from '${t}' to '${want}'`, args[i], hint);
      }
    });
    if (k.access && k.access !== 'public' && !this.canAccess(k.access, I.name)) this.error('CS0122', `'${I.name}.${I.name}(${k.params.map(p => p.resolvedType).join(', ')})' is inaccessible due to its protection level`, at, `Write public before the constructor: public ${I.name}(…)`);
    return k.implicit ? null : k;
  }
  // Is this expression a variable that can be changed in place (for struct fields)?
  isVariable(e) {
    if (e.type === 'Ident' || e.type === 'This') return true;
    if (e.type === 'Member') { const f = e.fieldInfo; if (!f || f.property) return false; return this.info(e.object.ty)?.kind === 'class' || this.isVariable(e.object); }
    if (e.type === 'Index') return isArr(e.object.ty);
    return false;
  }
  error(code, message, at, hint = '') {
    if (this.errors.some(e => e.line === at.line && e.code === code && e.message === message)) return;
    this.errors.push(new CSharpError({ code, message, line: at.line, col: at.col, hint }));
  }
  lookup(name) { for (let i = this.scopes.length - 1; i >= 0; i--) { const v = this.scopes[i].get(name); if (v) return v; } return null; }
  allNames() { return this.scopes.flatMap(s => [...s.keys()]); }

  program(ast) {
    // Methods can be called before the line where they are written (like C# local functions).
    const decls = ast.body.filter(s => s.type === 'MethodDecl');
    const classes = ast.body.filter(s => s.type === 'ClassDecl');
    this.declareClasses(classes);
    this.mainNames = declaredNames(ast.body.filter(s => s.type !== 'MethodDecl' && s.type !== 'ClassDecl'));
    for (const m of decls) {
      if (this.userMethods.has(m.name) || m.name === 'drone') {
        this.error('CS0128', `A local variable or function named '${m.name}' is already defined in this scope`, { line: m.nameLine, col: m.nameCol }, `There is already a method called ${m.name}. Give each method its own name.`);
        continue;
      }
      if (STATIC_CLASSES.includes(m.name)) { this.error('LAB', `'${m.name}' is already used by C#. Choose another name for your method.`, { line: m.nameLine, col: m.nameCol }); continue; }
      m.resolvedReturn = m.returnType === 'void' ? 'void' : this.resolveType(m.returnType, m);
      for (const p of m.params) p.resolvedType = this.resolveType(p.varType, p);
      this.userMethods.set(m.name, m);
      this.stats.userMethods.add(m.name);
      this.stats.features.add('method');
      for (const [n] of declaredNames(m.body.body)) if (!this.methodLocals.has(n)) this.methodLocals.set(n, m.name);
      for (const p of m.params) if (!this.methodLocals.has(p.name)) this.methodLocals.set(p.name, m.name);
    }
    this.scopes.push(new Map());
    let A = new Set();
    for (const s of ast.body) if (s.type !== 'MethodDecl' && s.type !== 'ClassDecl') A = this.stmt(s, A);
    this.scopes.pop();
    for (const m of decls) if (this.userMethods.get(m.name) === m) this.methodBody(m);
    for (const c of classes) this.checkClass(c);
    for (const m of decls) if (this.userMethods.get(m.name) === m && !this.stats.calls.has(m.name))
      this.warnings.push(new CSharpError({ code: 'CS8321', message: `The local function '${m.name}' is declared but never used`, line: m.nameLine, col: m.nameCol, hint: `Writing a method does not run it. Call it with ${m.name}(${m.params.map(p => p.name).join(', ')});` }));
  }
  methodBody(m, cls = null) {
    const saved = { scopes: this.scopes, loops: this.loops, cls: this.cls };
    this.method = m; this.loops = 0; this.cls = cls;
    const params = new Map();
    let A = new Set();
    for (const p of m.params) {
      if (params.has(p.name)) { this.error('CS0100', `The parameter name '${p.name}' is a duplicate`, p, 'Each parameter needs a different name.'); continue; }
      if (p.name === 'drone') { this.error('CS0136', `A local or parameter named 'drone' cannot be declared in this scope because that name is used in an enclosing local scope to define a local or parameter`, p, 'drone is already the name of your drone.'); continue; }
      const v = { name: p.name, type: p.resolvedType, line: p.line, param: true };
      params.set(p.name, v); A.add(v);
    }
    this.scopes = [params];
    this.block(m.body, A);
    if (m.resolvedReturn && m.resolvedReturn !== 'void' && !alwaysReturns(m.body))
      this.error('CS0161', `'${signature(m)}': not all code paths return a value`, { line: m.nameLine, col: m.nameCol }, `${m.name} promises to give back a value of type ${m.resolvedReturn}, so every way through it must end with return …;`);
    this.scopes = saved.scopes; this.loops = saved.loops; this.method = null; this.cls = saved.cls;
  }
  block(s, A) {
    this.scopes.push(new Map());
    let warned = false;
    for (let i = 0; i < s.body.length; i++) {
      const st = s.body[i];
      A = this.stmt(st, A);
      if (!warned && i < s.body.length - 1 && alwaysReturns(st) && s.body[i + 1].type !== 'MethodDecl') {
        warned = true;
        const nx = s.body[i + 1];
        this.warnings.push(new CSharpError({ code: 'CS0162', message: 'Unreachable code detected', line: nx.line, col: nx.col, hint: 'return leaves the method straight away: the lines after it never run.' }));
      }
    }
    this.scopes.pop();
    return A;
  }
  body(s, A) { return s.type === 'Block' ? this.block(s, A) : this.stmt(s, A); }

  stmt(s, A) {
    if (s.type !== 'Block' && s.type !== 'Empty' && s.type !== 'Calc') this.stats.statements++;
    switch (s.type) {
      case 'Calc':
        if (s.stmt.type === 'ExprStmt') { this.stats.statements++; this.type(s.stmt.expr, A); return A; }
        return this.stmt(s.stmt, A);
      case 'Block': return this.block(s, A);
      case 'Empty': return A;
      case 'VarDecl': return this.varDecl(s, A);
      case 'Assign': return this.assign(s, A);
      case 'IncDec': {
        const v = this.target(s.target, A, true);
        if (v && !isNum(v.type)) this.error('CS0023', `Operator '${s.op}' cannot be applied to operand of type '${v.type}'`, s);
        return A;
      }
      case 'ExprStmt': {
        const t = this.type(s.expr, A);
        if (s.expr.type !== 'Call' && s.expr.type !== 'NewObject' && t !== null) {
          const hint = s.expr.type === 'Binary' && s.expr.op === '==' ? 'Did you mean = to store a value? == only compares.' :
            s.expr.type === 'Member' && s.expr.ty === 'void' ? '' : 'An instruction must do something: call a method, assign a value or change a variable.';
          this.error('CS0201', 'Only assignment, call, increment, decrement, await, and new object expressions can be used as a statement', s, hint);
        }
        return A;
      }
      case 'If': {
        this.stats.features.add('if');
        if (s.alt) this.stats.features.add('else');
        this.cond(s.test, A);
        if (s.cons.type === 'Empty') this.warnings.push(new CSharpError({ code: 'CS0642', message: 'Possible mistaken empty statement', line: s.cons.line, col: s.cons.col, hint: 'The ; right after if (...) ends the if. The next lines will always run.' }));
        const a1 = this.body(s.cons, new Set(A));
        const a2 = s.alt ? this.body(s.alt, new Set(A)) : new Set(A);
        return new Set([...a1].filter(v => a2.has(v)));
      }
      case 'While': case 'Do': case 'For': return this.loop(s, A);
      case 'Foreach': return this.foreachStmt(s, A);
      case 'MethodDecl': return A;
      case 'ClassDecl': return A;
      case 'Return': return this.returnStmt(s, A);
      case 'Break': case 'Continue':
        if (!this.loops) this.error('CS0139', `No enclosing loop out of which to break or continue`, s, `${s.type.toLowerCase()} only works inside a loop.`);
        return A;
    }
    return A;
  }

  loop(s, A) {
    const feature = { While: 'while', Do: 'while', For: 'for' }[s.type];
    this.stats.features.add(feature);
    if (this.loops) this.stats.features.add('nestedLoop');
    this.loops++;
    let out = A;
    if (s.type === 'While') { this.cond(s.test, A); this.body(s.body, new Set(A)); }
    else if (s.type === 'Do') { const a = this.body(s.body, new Set(A)); this.cond(s.test, a); out = a; }
    else {
      this.scopes.push(new Map());
      let a = new Set(A);
      if (s.init) a = this.stmt(s.init, a), this.stats.statements--;
      if (s.test) this.cond(s.test, a);
      const b = this.body(s.body, new Set(a));
      if (s.update) this.stmt(s.update, b), this.stats.statements--;
      this.scopes.pop();
    }
    this.loops--;
    return out;
  }

  returnStmt(s, A) {
    this.stats.features.add('return');
    this.stats.returns++;
    const m = this.method;
    if (!m) {
      if (s.value) this.type(s.value, A);
      this.error('LAB', 'return is used inside a method, to finish it and give back a value.', s, 'The main program simply ends after its last line.');
      return A;
    }
    const want = m.resolvedReturn;
    if (want === 'void') {
      if (s.value) { this.type(s.value, A); this.error('CS0127', `Since '${signature(m)}' returns void, a return keyword must not be followed by an object expression`, s, `${m.name} is void: it does not give anything back. Write just return; or change void to the type you want to return.`); }
      return A;
    }
    if (!s.value) { this.error('CS0126', `An object of a type convertible to '${want}' is required`, s, `${m.name} must give back a value of type ${want}: return value;`); return A; }
    const t = this.type(s.value, A);
    if (t && want) this.convertible(s.value, t, want);
    return A;
  }

  foreachStmt(s, A) {
    this.stats.features.add('foreach');
    if (this.loops) this.stats.features.add('nestedLoop');
    const ct = this.type(s.collection, A);
    let item = null;
    if (ct) {
      if (isArr(ct)) item = elemOf(ct);
      else if (listElem(ct)) { item = listElem(ct); this.stats.features.add('listForeach'); }
      else if (ct === 'string') item = 'char';
      else this.error('CS1579', `foreach statement cannot operate on variables of type '${ct}' because '${ct}' does not contain a public instance or extension definition for 'GetEnumerator'`, s.collection, 'foreach goes through the items of an array (or the characters of a string). To repeat a number of times, use for.');
    }
    let type = s.varType === 'var' ? item : this.resolveType(s.varType, s);
    if (type && item && s.varType !== 'var' && !implicitOK(item, type)) {
      this.error('CS0030', `Cannot convert type '${item}' to '${type}'`, s, `The items are of type ${item}: foreach (${item} ${s.name} in …)`);
      type = null;
    }
    this.scopes.push(new Map());
    const existing = this.lookup(s.name);
    if (existing) this.error('CS0136', `A local or parameter named '${s.name}' cannot be declared in this scope because that name is used in an enclosing local scope to define a local or parameter`, { line: s.nameLine, col: s.nameCol }, `${s.name} already exists (line ${existing.line}). Pick a different name.`);
    const v = { name: s.name, type, line: s.nameLine, foreachVar: true };
    s.resolvedType = type; s.itemType = item;
    this.scopes.at(-1).set(s.name, v);
    this.loops++;
    this.body(s.body, new Set(A).add(v));
    this.loops--;
    this.scopes.pop();
    return A;
  }

  cond(e, A) {
    const t = this.type(e, A);
    if (t && t !== 'bool') this.error('CS0029', `Cannot implicitly convert type '${t}' to 'bool'`, e, 'A condition must be true or false, for example x > 3 or x == 0.');
  }

  resolveType(name, at) {
    if (VALUE_TYPES.includes(name)) return name;
    if (this.types.has(name)) return name;
    const le = listElem(name);
    if (le) { const el = this.resolveType(le, at); this.stats.features.add('list'); return el ? `List<${el}>` : null; }
    if (isArr(name)) { const el = this.resolveType(elemOf(name), at); if (el) this.stats.features.add('array'); return el ? el + '[]' : null; }
    const s = suggest(name, [...VALUE_TYPES, ...this.types.keys(), 'List']);
    this.error('CS0246', `The type or namespace name '${name}' could not be found`, at, s ? `Did you mean ${s}? C# is case-sensitive.` : name === 'Vector2' ? 'This lab uses Vector3 (x, y, z).' : 'Available types here: int, float, double, bool, string, Color, Direction, your own classes.');
    return null;
  }

  varDecl(s, A) {
    this.stats.features.add('variable');
    const declared = s.varType === 'var' ? 'var' : this.resolveType(s.varType, s);
    for (const d of s.decls) {
      let type = declared;
      if (d.init && d.init.type === 'ArrayInit') {
        if (declared === 'var') { this.error('CS0820', 'Cannot initialize an implicitly-typed variable with an array initializer', d.init, 'With var, write the type of the array: var heights = new int[] { 1, 2, 3 };'); type = null; }
        else if (declared && !isArr(declared)) { this.error('CS0622', 'Can only use array initializer expressions to assign to array types. Try using a new expression instead.', d.init, `{ … } holds several values. For an array, write the type with []: ${declared}[] ${d.name} = { … };`); type = null; }
        else if (declared) this.arrayItemsCheck(d.init, elemOf(declared), A);
      } else if (d.init) {
        const t = this.type(d.init, A);
        if (declared === 'var') {
          type = t;
          if (t === 'void') { this.error('CS0815', 'Cannot assign void to an implicitly-typed variable', d.init, 'This method does not give back a value.'); type = null; }
        } else if (type && t) this.convertible(d.init, t, type);
      } else if (declared === 'var') {
        this.error('CS0818', 'Implicitly-typed variables must be initialized', d, 'With var, C# works out the type from the value: var count = 0;');
        type = null;
      }
      const existing = this.lookup(d.name);
      if (d.name === 'drone') this.error('CS0136', `A local variable named 'drone' cannot be declared in this scope because it would give a different meaning to 'drone'`, d, 'drone is already the name of your drone.');
      else if (existing) {
        if (this.scopes.at(-1).has(d.name)) this.error('CS0128', `A local variable or function named '${d.name}' is already defined in this scope`, d, `${d.name} was created on line ${existing.line}. To change its value write ${d.name} = …; without the type.`);
        else this.error('CS0136', `A local or parameter named '${d.name}' cannot be declared in this scope because that name is used in an enclosing local scope to define a local or parameter`, d, `${d.name} already exists (line ${existing.line}). Pick a different name.`);
      }
      const v = { name: d.name, type, line: d.line };
      d.resolvedType = type;
      if (!existing) this.scopes.at(-1).set(d.name, v);
      if (type) this.stats.declTypes.add(type);
      if (d.init) A = new Set(A).add(v);
    }
    return A;
  }

  arrayItemsCheck(node, elem, A) {
    node.elemType = elem;
    this.stats.features.add('array');
    for (const it of node.items) { const t = this.type(it, A); if (t) this.convertible(it, t, elem); }
    node.hasUserCall = node.items.some(hasUserCall);
  }

  convertible(node, from, to) {
    if (from === 'void') { this.error('CS0029', `Cannot implicitly convert type 'void' to '${to}'`, node, 'This method does not give back a value.'); return false; }
    if (this.assignable(from, to)) return true;
    if (from === 'null') { this.error('CS0037', `Cannot convert null to '${to}' because it is a non-nullable value type`, node, `null means "no object". A ${to} always has a value${this.isStruct(to) ? ' (it is a struct)' : ''}.`); return false; }
    if (this.info(from)?.kind === 'class' && this.isSubclass(to, from)) { this.error('CS0266', `Cannot implicitly convert type '${from}' to '${to}'. An explicit conversion exists (are you missing a cast?)`, node, `Every ${to} is a ${from}, but not every ${from} is a ${to}.`); return false; }
    if (node.type === 'Num' && from === 'double' && to === 'float')
      this.error('CS0664', "Literal of type double cannot be implicitly converted to type 'float'; use an 'F' suffix to create a literal of this type", node, `Write ${node.raw}f to make it a float.`);
    else if (isNum(from) && isNum(to))
      this.error('CS0266', `Cannot implicitly convert type '${from}' to '${to}'. An explicit conversion exists (are you missing a cast?)`, node,
        to === 'int' ? `An int can't hold decimals. Use (int) to cut them off, or make the variable a ${from}.` : `A ${to} is less precise than a ${from}. Use (${to}) to convert it.`);
    else {
      let hint = '';
      if (isArr(from) && elemOf(from) === to) hint = 'An array holds many values. Pick one with [i], or count them with .Length.';
      else if (isArr(to) && elemOf(to) === from) hint = `To store several values, create an array: { 1, 2, 3 } or new ${from}[3].`;
      else if (from === 'string' && to === 'Color') hint = 'Colors are written Color.Red, not "Red".';
      else if (from === 'string' && isNum(to)) hint = 'Numbers are written without quotes: 3, not "3".';
      else if (isNum(from) && to === 'string') hint = 'Text needs quotes: "3". Or convert the number with .ToString().';
      else if (from === 'string' && to === 'bool') hint = 'Write true or false without quotes.';
      this.error('CS0029', `Cannot implicitly convert type '${from}' to '${to}'`, node, hint);
    }
    return false;
  }

  target(e, A, mustBeAssigned) {
    if (e.type === 'Index') {
      const t = this.type(e.object, A), it = this.type(e.index, A);
      if (!t) return null;
      if (t === 'string') { this.error('CS0200', "Property or indexer 'string.this[int]' cannot be assigned to -- it is read only", e, 'The characters of a string cannot be changed one by one. Build a new string instead.'); return null; }
      if (listElem(t)) {
        if (it && it !== 'int') { this.error('CS0029', `Cannot implicitly convert type '${it}' to 'int'`, e.index, 'The position inside [ ] must be a whole number.'); return null; }
        e.ty = listElem(t); return { name: show(e), type: listElem(t), element: true };
      }
      if (!isArr(t)) { this.error('CS0021', `Cannot apply indexing with [] to an expression of type '${t}'`, e); return null; }
      if (it && it !== 'int') { this.error('CS0029', `Cannot implicitly convert type '${it}' to 'int'`, e.index, 'The position inside [ ] must be a whole number.'); return null; }
      this.stats.features.add('arrayWrite');
      e.ty = elemOf(t);
      return { name: show(e), type: elemOf(t), element: true };
    }
    if (e.type === 'Member') {
      const objType = this.staticClass(e.object) ? null : this.type(e.object, A);
      const fi = objType && this.info(objType) ? this.findField(objType, e.name) : null;
      if (fi) {
        if (!this.canAccess(fi.f.access, fi.owner)) { this.accessError({ line: e.nameLine, col: e.nameCol }, fi.owner, e.name, 'field'); return null; }
        if (fi.f.readonly) { this.error('CS0200', `Property or indexer '${fi.owner}.${e.name}' cannot be assigned to -- it is read only`, e, 'The lab gives every object its own transform. Change transform.position instead.'); return null; }
        e.fieldInfo = fi.f; e.ty = fi.f.type;
        if (this.isStruct(objType) && !this.isVariable(e.object)) {
          const what = e.object.type === 'Member' && e.object.fieldInfo?.property ? `${e.object.object.ty}.${e.object.name}` : e.object.type === 'Index' ? `${e.object.object.ty}.this[int]` : show(e.object);
          this.error('CS1612', `Cannot modify the return value of '${what}' because it is not a variable`, e, `${show(e.object)} gives you a copy (${objType} is a struct), so changing its ${e.name} would change nothing. Copy it into a variable, change it and assign it back: ${objType} p = ${show(e.object)}; p.${e.name} = …; ${show(e.object)} = p;`);
          return null;
        }
        this.stats.features.add('fieldWrite');
        return { name: show(e), type: fi.f.type, element: true };
      }
      if (listElem(objType) && e.name === 'Count') { this.error('CS0200', `Property or indexer 'List<${listElem(objType)}>.Count' cannot be assigned to -- it is read only`, e, 'Count changes when you Add or Remove items.'); return null; }
      if (objType === 'Vector3' && ['magnitude', 'normalized'].includes(e.name)) { this.error('CS0200', `Property or indexer 'Vector3.${e.name}' cannot be assigned to -- it is read only`, e); return null; }
      if (e.name === 'Length' && (isArr(objType) || objType === 'string')) this.error('CS0200', `Property or indexer '${isArr(objType) ? 'Array' : 'string'}.Length' cannot be assigned to -- it is read only`, e, isArr(objType) ? 'An array keeps the size it was created with. Create a new array to get a different size.' : 'The length of a string changes only when its text changes.');
      else if (objType === 'Drone' && e.name in DRONE_PROPS) this.error('CS0200', `Property or indexer 'Drone.${e.name}' cannot be assigned to -- it is read only`, e, 'Use drone.Move(...) or drone.MoveTo(x, z) to change where the drone is.');
      else this.error('CS0131', 'The left-hand side of an assignment must be a variable, property or indexer', e);
      return null;
    }
    if (e.type === 'This') { this.error('CS1604', "Cannot assign to 'this' because it is read-only", e); return null; }
    if (e.type !== 'Ident') { this.error('CS0131', 'The left-hand side of an assignment must be a variable, property or indexer', e); return null; }
    const v = this.lookup(e.name);
    if (!v && this.cls) {
      const fi = this.findField(this.cls.name, e.name);
      if (fi) {
        if (!this.canAccess(fi.f.access, fi.owner)) { this.accessError(e, fi.owner, e.name, 'field'); return null; }
        if (fi.f.readonly) { this.error('CS0200', `Property or indexer '${fi.owner}.${e.name}' cannot be assigned to -- it is read only`, e); return null; }
        e.field = true; e.fieldInfo = fi.f; e.ty = fi.f.type; this.stats.features.add('fieldWrite');
        return { name: e.name, type: fi.f.type, element: true };
      }
    }
    if (!v) { this.unknownName(e); return null; }
    if (v.foreachVar) { this.error('CS1656', `Cannot assign to '${e.name}' because it is a 'foreach iteration variable'`, e, 'foreach only reads the items. To change them, use a for loop and write array[i] = …;'); return null; }
    if (mustBeAssigned && !A.has(v)) this.unassigned(e, v);
    e.ty = v.type;
    return v;
  }

  assign(s, A) {
    this.stats.features.add('assign');
    const v = this.target(s.target, A, s.op !== '=');
    const t = this.type(s.value, A);
    if (!v || !v.type || !t) return A;
    if (s.op === '=') { this.convertible(s.value, t, v.type); return v.element ? A : new Set(A).add(v); }
    const r = this.binaryType(s.op[0], v.type, t, s);
    if (r && !this.assignable(r, v.type)) this.convertible(s.value, r, v.type);
    return A;
  }

  unassigned(e, v) {
    if (this.reportedUnassigned.has(v)) return;
    this.reportedUnassigned.add(v);
    this.error('CS0165', `Use of unassigned local variable '${e.name}'`, e, `${e.name} was created without a value (line ${v.line}). Give it one first: ${e.name} = …;`);
  }

  unknownName(e) {
    const name = e.name;
    if (/^_{2,}$/.test(name)) { this.error('LAB', 'Fill in the blank ___', e, 'Replace ___ with a value, a variable or a calculation.'); return; }
    let hint = '';
    if (name === 'True' || name === 'False') hint = `In C#, ${name.toLowerCase()} is written in lowercase.`;
    else if (['Move', 'MoveTo', 'Place', 'Build', 'Scan'].includes(name)) hint = `${name} belongs to the drone. Write drone.${name}(...).`;
    else if (name === 'WriteLine') hint = 'WriteLine belongs to the Console. Write Console.WriteLine(...).';
    else if (['Red', 'Blue', 'Green', 'Yellow', 'White', 'Orange', 'Purple', 'Black'].includes(name)) hint = `Colors are written Color.${name}.`;
    else if (DIRECTIONS.includes(name)) hint = `Directions are written Direction.${name}.`;
    else if (this.cls && this.mainNames.has(name)) {
      this.error('CS0103', `The name '${name}' does not exist in the current context`, e, `${name} is a variable of the main program. The code of a class only sees its own fields, its parameters and its local variables.`);
      return;
    }
    else if (this.method && this.mainNames.has(name)) {
      this.error('LAB', `'${name}' belongs to the main program, not to ${this.method.name}`, e, `A method only sees its parameters and its own variables. Pass ${name} in as a parameter: ${this.method.name}(…, int ${name}).`);
      return;
    }
    else if (!this.method && this.methodLocals.has(name)) hint = `${name} only exists inside the method ${this.methodLocals.get(name)}. To get a value out of a method, use return.`;
    else if (this.method && this.methodLocals.has(name) && this.methodLocals.get(name) !== this.method.name) hint = `${name} only exists inside the method ${this.methodLocals.get(name)}. Each method has its own variables.`;
    else {
      const s = suggest(name, [...this.allNames(), ...this.userMethods.keys(), 'drone', ...STATIC_CLASSES]);
      hint = s ? `Did you mean ${s}? Names in C# are case-sensitive.` : `Create it first, for example: int ${name} = 0;`;
    }
    this.error('CS0103', `The name '${name}' does not exist in the current context`, e, hint);
  }

  staticClass(e) {
    return e.type === 'Ident' && STATIC_CLASSES.includes(e.name) && !this.lookup(e.name) ? e.name : null;
  }

  type(e, A) { const t = this.infer(e, A); e.ty = t; e.hasUserCall = !!e.userCall || kidsOf(e).some(hasUserCall); return t; }
  infer(e, A) {
    switch (e.type) {
      case 'Num': this.stats.numbers.push(e.value); return e.ty;
      case 'Str': return 'string';
      case 'Char': return 'char';
      case 'Bool': return 'bool';
      case 'Index': {
        const t = this.type(e.object, A), it = this.type(e.index, A);
        if (!t) return null;
        if (listElem(t)) {
          if (it && it !== 'int') { this.error('CS0029', `Cannot implicitly convert type '${it}' to 'int'`, e.index, 'The position inside [ ] must be a whole number.'); return null; }
          this.stats.features.add('listIndex'); return listElem(t);
        }
        if (t !== 'string' && !isArr(t)) { this.error('CS0021', `Cannot apply indexing with [] to an expression of type '${t}'`, e, 'Only arrays and text (string) can be read item by item with [ ].'); return null; }
        if (it && it !== 'int') { this.error('CS0029', `Cannot implicitly convert type '${it}' to 'int'`, e.index, 'The position inside [ ] must be a whole number.'); return null; }
        if (isArr(t)) { this.stats.features.add('arrayIndex'); return elemOf(t); }
        this.stats.features.add('index');
        return 'char';
      }
      case 'Interp': if (e.parts.some(x => typeof x !== 'string')) this.stats.features.add('interpolation'); for (const p of e.parts) if (typeof p !== 'string') { const t = this.type(p, A); if (t === 'void') this.error('CS0029', "Cannot implicitly convert type 'void' to 'object'", p); } return 'string';
      case 'Paren': return this.type(e.expr, A);
      case 'Null': this.stats.features.add('null'); return 'null';
      case 'This':
        if (!this.cls) { this.error('CS0027', "Keyword 'this' is not available in the current context", e, 'this means "the object running this method": use it inside a class.'); return null; }
        this.stats.features.add('this'); return this.cls.name;
      case 'Base':
        if (!this.cls || !this.cls.base) { this.error('CS0175', "Use of keyword 'base' is not valid in this context", e); return null; }
        return this.cls.base;
      case 'NewObject': return this.newObject(e, A);
      case 'ArrayInit': this.error('CS1525', "Invalid expression term '{'", e, 'Here, create the array with new: new int[] { 1, 2, 3 }'); return null;
      case 'NewArray': {
        const el = this.resolveType(e.elem, e);
        this.stats.features.add('newArray'); this.stats.features.add('array');
        if (e.size) {
          const st = this.type(e.size, A);
          if (st && st !== 'int') this.error('CS0029', `Cannot implicitly convert type '${st}' to 'int'`, e.size, 'The size of an array is a whole number.');
          if (e.size.type === 'Unary' && e.size.op === '-' && e.size.arg.type === 'Num') this.error('CS0248', 'Cannot create an array with a negative size', e.size);
        } else if (el) this.arrayItemsCheck(e, el, A);
        return el ? el + '[]' : null;
      }
      case 'Ident': {
        if (e.name === 'drone' && !this.lookup('drone')) return 'Drone';
        if (this.staticClass(e)) { this.error('CS0119', `'${e.name}' is a type, which is not valid in the given context`, e, e.name === 'Color' ? 'Choose one color: Color.Red' : ''); return null; }
        const v = this.lookup(e.name);
        if (!v && this.cls) {
          const fi = this.findField(this.cls.name, e.name);
          if (fi) {
            if (!this.canAccess(fi.f.access, fi.owner)) { this.accessError(e, fi.owner, e.name, 'field'); return null; }
            e.field = true; e.fieldInfo = fi.f; return fi.f.type;
          }
        }
        if (!v && this.types.has(e.name)) { this.error('CS0119', `'${e.name}' is a type, which is not valid in the given context`, e, `To make an object of this class write new ${e.name}().`); return null; }
        if (!v && this.userMethods.has(e.name)) { this.error('CS0428', `Cannot convert method group '${e.name}' to non-delegate type`, e, `${e.name} is a method. To run it, add brackets: ${e.name}(…)`); return null; }
        if (!v) { this.unknownName(e); return null; }
        if (!A.has(v)) this.unassigned(e, v);
        return v.type;
      }
      case 'Member': return this.member(e, A);
      case 'Call': return this.call(e, A);
      case 'Unary': {
        const t = this.type(e.arg, A);
        if (!t) return null;
        if (e.op === '!') { if (t !== 'bool') { this.error('CS0023', `Operator '!' cannot be applied to operand of type '${t}'`, e); return null; } return 'bool'; }
        if (e.op === '-' && t === 'Vector3') return t;
        if (!isNum(t)) { this.error('CS0023', `Operator '${e.op}' cannot be applied to operand of type '${t}'`, e); return null; }
        return t;
      }
      case 'Binary': {
        if (e.op === '&&' || e.op === '||') this.stats.features.add('logic');
        if (e.op === '%') this.stats.features.add('modulo');
        const l = this.type(e.left, A), r = this.type(e.right, A);
        if (!l || !r) return null;
        if ((e.op === '/' || e.op === '%') && l === 'int' && r === 'int' && e.right.type === 'Num' && e.right.value === 0) {
          this.error('CS0020', 'Division by constant zero', e.right, 'Nothing can be divided by 0.'); return 'int';
        }
        return this.binaryType(e.op, l, r, e);
      }
      case 'Cast': {
        const t = this.type(e.arg, A);
        if (t && !isNum(t)) { this.error('CS0030', `Cannot convert type '${t}' to '${e.to}'`, e); return null; }
        return e.to;
      }
      case 'Cond': {
        this.cond(e.test, A);
        const a = this.type(e.a, A), b = this.type(e.b, A);
        if (!a || !b) return null;
        if (a === b) return a;
        if (isNum(a) && isNum(b)) return widest(a, b);
        if (a === 'null' && this.isRef(b)) return b;
        if (b === 'null' && this.isRef(a)) return a;
        this.error('CS0173', `Type of conditional expression cannot be determined because there is no implicit conversion between '${a}' and '${b}'`, e);
        return null;
      }
    }
    return null;
  }

  binaryType(op, l, r, at) {
    const bad = () => {
      let hint = '';
      if (op === '+' && (l === 'bool' || r === 'bool')) hint = 'true and false cannot be added.';
      else if (['==', '!='].includes(op) && (l === 'string' || r === 'string')) hint = 'Compare text with text and numbers with numbers. "3" (text) is not the same as 3 (number).';
      else if (['&&', '||'].includes(op)) hint = `Both sides of ${op} must be true/false conditions, for example x > 0 ${op} x < 5.`;
      else if (isArr(l) || isArr(r)) hint = 'An array is a whole row of values. Use one item, like heights[0], or heights.Length.';
      this.error('CS0019', `Operator '${op}' cannot be applied to operands of type '${l}' and '${r}'`, at, hint);
      return null;
    };
    if (l === 'void' || r === 'void') return bad();
    if (l === 'Vector3' || r === 'Vector3') {
      this.stats.features.add('vectorMath');
      if ((op === '+' || op === '-') && l === r) return 'Vector3';
      if (op === '*' && ((l === 'Vector3' && isNum(r)) || (r === 'Vector3' && isNum(l)))) return 'Vector3';
      if (op === '/' && l === 'Vector3' && isNum(r)) return 'Vector3';
      if ((op === '==' || op === '!=') && l === r) return 'bool';
      if (op === '+' && (l === 'string' || r === 'string')) return 'string';
      return bad();
    }
    if ((op === '==' || op === '!=') && (this.isRef(l) || this.isRef(r)) && (l === r || (l === 'null' && this.isRef(r)) || (r === 'null' && this.isRef(l)) || this.assignable(l, r) || this.assignable(r, l))) {
      if (l === 'null' || r === 'null') this.stats.features.add('nullCheck');
      return 'bool';
    }
    if (op === '+' && (l === 'string' || r === 'string') && l !== 'void' && r !== 'void') return 'string';
    if ((this.isStruct(l) || this.isStruct(r)) && l === r && (op === '==' || op === '!=')) { this.error('CS0019', `Operator '${op}' cannot be applied to operands of type '${l}' and '${r}'`, at, `C# doesn't know how to compare two ${l} values. Compare their fields instead.`); return null; }
    switch (op) {
      case '+': if (l === 'string' || r === 'string') return 'string';
      // fall through
      case '-': case '*': case '/': case '%': return isNum(l) && isNum(r) ? widest(l, r) : bad();
      case '<': case '>': case '<=': case '>=': return isNum(l) && isNum(r) ? 'bool' : bad();
      case '==': case '!=': return (isNum(l) && isNum(r)) || l === r ? 'bool' : bad();
      case '&&': case '||': return l === 'bool' && r === 'bool' ? 'bool' : bad();
    }
    return bad();
  }

  member(e, A) {
    const cls = this.staticClass(e.object);
    if (cls === 'Color' || cls === 'Direction') {
      const list = cls === 'Color' ? COLORS : DIRECTIONS;
      if (list.includes(e.name)) return cls;
      const s = suggest(e.name, list);
      this.error('CS0117', `'${cls}' does not contain a definition for '${e.name}'`, { line: e.nameLine, col: e.nameCol },
        s ? `Did you mean ${cls}.${s}? C# is case-sensitive.` : `Options: ${list.map(x => `${cls}.${x}`).join(', ')}.`);
      return null;
    }
    if (cls === 'Math' && e.name === 'PI') return 'double';
    if (cls === 'Mathf' && e.name === 'PI') return 'float';
    if (cls === 'Vector3' && e.name in VECTOR_STATICS) { this.stats.features.add('vector'); return 'Vector3'; }
    if (cls === 'Time' && (e.name === 'deltaTime' || e.name === 'time')) { this.stats.features.add('time'); return 'float'; }
    if (cls === 'Time') { this.error('CS0117', `'Time' does not contain a definition for '${e.name}'`, { line: e.nameLine, col: e.nameCol }, suggest(e.name, ['deltaTime', 'time']) ? `Did you mean Time.${suggest(e.name, ['deltaTime', 'time'])}? C# is case-sensitive.` : 'Time.deltaTime is the time between two frames.'); return null; }
    if (cls === 'Vector3' && !methodNames('Vector3').includes(e.name)) { const s = suggest(e.name, Object.keys(VECTOR_STATICS)); this.error('CS0117', `'Vector3' does not contain a definition for '${e.name}'`, { line: e.nameLine, col: e.nameCol }, s ? `Did you mean Vector3.${s}? Unity writes them in lowercase.` : ''); return null; }
    if (cls) {
      if (methodNames(cls).includes(e.name)) { this.error('CS0428', `Cannot convert method group '${e.name}' to non-delegate type`, e, `Add brackets to call it: ${cls}.${e.name}(...)`); return null; }
      const s = suggest(e.name, methodNames(cls));
      this.error('CS0117', `'${cls}' does not contain a definition for '${e.name}'`, { line: e.nameLine, col: e.nameCol }, s ? `Did you mean ${s}?` : '');
      return null;
    }
    const t = this.type(e.object, A);
    if (!t) return null;
    if (t === 'null') { this.error('CS0023', `Operator '.' cannot be applied to operand of type '<null>'`, e); return null; }
    const le = listElem(t);
    if (le) {
      if (e.name === 'Count') { this.stats.features.add('list'); return 'int'; }
      if (e.name in LIST_METHODS) { this.error('CS0428', `Cannot convert method group '${e.name}' to non-delegate type`, e, `${e.name} is a method: add brackets, ${e.name}(…).`); return null; }
      this.error('CS1061', `'${t}' does not contain a definition for '${e.name}'`, { line: e.nameLine, col: e.nameCol }, e.name === 'Length' ? 'A List uses Count, not Length (arrays use Length).' : suggest(e.name, ['Count', ...Object.keys(LIST_METHODS)]) ? `Did you mean ${suggest(e.name, ['Count', ...Object.keys(LIST_METHODS)])}?` : '');
      return null;
    }
    if (this.info(t)) {
      if (t === 'Vector3' && e.name === 'magnitude') return 'float';
      if (t === 'Vector3' && e.name === 'normalized') return 'Vector3';
      const fi = this.findField(t, e.name);
      if (fi) {
        if (!this.canAccess(fi.f.access, fi.owner)) { this.accessError({ line: e.nameLine, col: e.nameCol }, fi.owner, e.name, 'field'); return null; }
        e.fieldInfo = fi.f; this.stats.features.add('fieldRead');
        return fi.f.type;
      }
      const mi = this.findMethod(t, e.name);
      if (mi) { this.error('CS0428', `Cannot convert method group '${e.name}' to non-delegate type`, e, `${e.name} is a method: add brackets, ${e.name}(…).`); return null; }
      const names = this.chain(t).flatMap(i => [...i.fields.keys(), ...i.methods.keys()]);
      const s = suggest(e.name, t === 'Vector3' ? ['x', 'y', 'z', 'magnitude', 'normalized'] : names);
      this.error('CS1061', `'${t}' does not contain a definition for '${e.name}'`, { line: e.nameLine, col: e.nameCol }, s ? `Did you mean ${s}? C# is case-sensitive.` : t === 'Vector3' ? 'A Vector3 has x, y and z (lowercase).' : `Add it to the class ${t}: public int ${e.name};`);
      return null;
    }
    if (t === 'Drone') {
      if (e.name in DRONE_PROPS) { this.stats.methods.add(e.name); return DRONE_PROPS[e.name]; }
      if (methodNames('Drone').includes(e.name)) { this.error('CS0428', `Cannot convert method group '${e.name}' to non-delegate type`, e, `Add brackets to call it: drone.${e.name}(...)`); return null; }
      const s = suggest(e.name, [...Object.keys(DRONE_PROPS), ...methodNames('Drone')]);
      this.error('CS1061', `'Drone' does not contain a definition for '${e.name}'`, { line: e.nameLine, col: e.nameCol }, s ? `Did you mean ${s}? C# is case-sensitive.` : '');
      return null;
    }
    if ((t === 'string' || isArr(t)) && e.name === 'Length') return 'int';
    if (isArr(t)) {
      const s = suggest(e.name, ['Length']);
      this.error('CS1061', `'${t}' does not contain a definition for '${e.name}'`, { line: e.nameLine, col: e.nameCol }, s ? `Did you mean ${s}? C# is case-sensitive.` : 'An array has Length (how many items it holds). Read an item with [i].');
      return null;
    }
    if (t === 'string' && e.name in STRING_METHODS) { this.error('CS0428', `Cannot convert method group '${e.name}' to non-delegate type`, e, `${e.name} is a method: add brackets, ${e.name}().`); return null; }
    const s = t === 'string' ? suggest(e.name, ['Length', ...Object.keys(STRING_METHODS)]) : null;
    this.error('CS1061', `'${t}' does not contain a definition for '${e.name}'`, { line: e.nameLine, col: e.nameCol }, s ? `Did you mean ${s}?` : '');
    return null;
  }

  instanceCall(e, mi, types, { implicitThis = false, base = false }) {
    const m = mi.m;
    if (!this.canAccess(m.access, mi.owner)) { this.accessError(e.callee.type === 'Member' ? { line: e.callee.nameLine, col: e.callee.nameCol } : e.callee, mi.owner, m.name, 'method'); }
    e.method = 'instance'; e.decl = m; e.userCall = true; e.implicitThis = implicitThis; e.baseCall = base;
    this.stats.calls.set(`${mi.owner}.${m.name}`, (this.stats.calls.get(`${mi.owner}.${m.name}`) || 0) + 1);
    this.stats.features.add('instanceCall');
    const ret = m.resolvedReturn ?? null;
    if (types.length !== m.params.length) {
      this.error('CS1501', `No overload for method '${m.name}' takes ${types.length} arguments`, e, m.params.length ? `${m.name} needs ${m.params.length}: ${m.name}(${m.params.map(p => `${p.varType} ${p.name}`).join(', ')}).` : `${m.name} has no parameters: ${m.name}().`);
      return ret;
    }
    types.forEach((t, i) => { const want = m.params[i].resolvedType; if (t && want && !this.assignable(t, want)) this.error('CS1503', `Argument ${i + 1}: cannot convert from '${t}' to '${want}'`, e.args[i], `Parameter ${m.params[i].name} of ${m.name} is of type ${want}.`); });
    return ret;
  }

  newObject(e, A) {
    const t = this.resolveType(e.typeName, e);
    const types = e.args.map(a => this.type(a, A));
    if (!t) return null;
    const le = listElem(t);
    if (le) {
      if (types.length) this.error('LAB', 'Create an empty list with new List<…>() and fill it with Add or { … }.', e);
      if (e.items) for (const it of e.items) { const x = this.type(it, A); if (x) this.convertible(it, x, le); }
      e.kind = 'list'; e.elem = le; this.stats.features.add('list'); this.stats.features.add('new');
      return t;
    }
    const I = this.info(t);
    if (!I) { this.error('LAB', `new ${t}() is not needed: give it a value directly.`, e); return null; }
    if (I.noNew) { this.error('LAB', `The lab creates the ${t} of every object for you.`, e); return null; }
    if (e.items) { this.error('LAB', 'Object initializers { … } are not part of this lab. Use a constructor.', e); }
    if (I.abstract) { this.error('CS0144', `Cannot create an instance of the abstract type or interface '${t}'`, e); return null; }
    e.kind = I.builtin ? t : 'user'; e.cls = I;
    e.ctor = this.pickCtor(I, types, e.args, e);
    if (!I.builtin) { e.userCall = true; this.stats.features.add('new'); this.stats.features.add(I.kind === 'struct' ? 'newStruct' : 'object'); }
    return t;
  }

  userCall(e, m, types) {
    this.stats.calls.set(m.name, (this.stats.calls.get(m.name) || 0) + 1);
    this.stats.features.add('call');
    if (this.method) this.stats.features.add('callInMethod');
    if (this.method === m) this.stats.features.add('recursion');
    e.method = 'user'; e.decl = m; e.userCall = true;
    const ret = m.resolvedReturn ?? null;
    if (types.length !== m.params.length) {
      this.error('CS1501', `No overload for method '${m.name}' takes ${types.length} arguments`, e,
        m.params.length ? `${m.name} needs ${m.params.length} value${m.params.length === 1 ? '' : 's'}: ${m.name}(${m.params.map(p => `${p.varType} ${p.name}`).join(', ')}).` : `${m.name} has no parameters: call it with empty brackets, ${m.name}().`);
      return ret;
    }
    types.forEach((t, i) => {
      const want = m.params[i].resolvedType;
      if (!t || !want || this.assignable(t, want)) return;
      let hint = `Parameter ${m.params[i].name} of ${m.name} is of type ${want}.`;
      if (want === 'Color' && t === 'string') hint = 'Write colors as Color.Red, not "Red". ' + hint;
      else if (isNum(want) && t === 'string') hint = 'Numbers are written without quotes. ' + hint;
      else if (want === 'int' && isNum(t)) hint = 'Use (int) to convert it. ' + hint;
      this.error('CS1503', `Argument ${i + 1}: cannot convert from '${t}' to '${want}'`, e.args[i], hint);
    });
    return ret;
  }

  call(e, A) {
    const argTypes = () => e.args.map(a => this.type(a, A));
    const c = e.callee;
    if (c.type === 'Ident') {
      if (this.lookup(c.name)) { argTypes(); this.error('CS0149', 'Method name expected', c, `${c.name} is a variable, not a method.`); return null; }
      if (this.cls) {
        const mi = this.findMethod(this.cls.name, c.name);
        if (mi) return this.instanceCall(e, mi, argTypes(), { implicitThis: true });
        if (this.userMethods.has(c.name)) { argTypes(); this.error('CS0103', `The name '${c.name}' does not exist in the current context`, c, `${c.name} is a method of the main program. A class can only call its own methods: move ${c.name} into the class.`); return null; }
      }
      const m = this.userMethods.get(c.name);
      if (!m) {
        argTypes();
        const s = suggest(c.name, [...this.userMethods.keys()]);
        if (s) { this.error('CS0103', `The name '${c.name}' does not exist in the current context`, c, `Did you mean ${s}? Names in C# are case-sensitive.`); return null; }
        const other = suggest(c.name, [...this.allNames(), 'drone', ...STATIC_CLASSES]);
        if (['Move', 'MoveTo', 'Place', 'Build', 'WriteLine'].includes(c.name) || other) { this.unknownName(c); return null; }
        this.error('CS0103', `The name '${c.name}' does not exist in the current context`, c, `There is no method called ${c.name} yet. Declare it below the main program: void ${c.name}(…) { … }`);
        return null;
      }
      return this.userCall(e, m, argTypes());
    }
    if (c.type !== 'Member') { argTypes(); this.error('CS0149', 'Method name expected', c); return null; }
    if (/^_{2,}$/.test(c.name)) { this.type(c.object, A); argTypes(); this.error('LAB', 'Fill in the blank ___', { line: c.nameLine, col: c.nameCol }, 'Replace ___ with the name of the method.'); return null; }
    if (c.object.type === 'Base') {
      const bt = this.type(c.object, A);
      const mi = bt ? this.findMethod(bt, c.name) : null;
      if (!mi) { argTypes(); if (bt) this.error('CS0117', `'${bt}' does not contain a definition for '${c.name}'`, { line: c.nameLine, col: c.nameCol }); return null; }
      return this.instanceCall(e, mi, argTypes(), { base: true });
    }
    let key, owner = this.staticClass(c.object);
    if (owner === 'Color' || owner === 'Direction') { argTypes(); this.error('CS0117', `'${owner}' does not contain a definition for '${c.name}'`, c); return null; }
    if (owner) key = `${owner}.${c.name}`;
    else {
      const t = this.type(c.object, A);
      if (!t) { argTypes(); return null; }
      const le = listElem(t);
      if (le) {
        const types = argTypes();
        const lm = LIST_METHODS[c.name];
        if (!lm) { const sg = suggest(c.name, Object.keys(LIST_METHODS)); this.error('CS1061', `'${t}' does not contain a definition for '${c.name}'`, { line: c.nameLine, col: c.nameCol }, c.name === 'Count' ? 'Count is a property, not a method: remove the brackets.' : sg ? `Did you mean ${sg}? C# is case-sensitive.` : c.name === 'Length' ? 'A List uses Count.' : ''); return null; }
        const params = lm.params.map(p => p === 'T' ? le : p);
        if (types.length !== params.length) { this.error('CS1501', `No overload for method '${c.name}' takes ${types.length} arguments`, e, `Use ${c.name}(${params.join(', ')}).`); return null; }
        types.forEach((x, i) => { if (x && !this.assignable(x, params[i])) this.error('CS1503', `Argument ${i + 1}: cannot convert from '${x}' to '${params[i]}'`, e.args[i], `This list holds ${le} values.`); });
        e.method = 'list.' + c.name; this.stats.features.add('list'); this.stats.methods.add(c.name);
        if (c.name === 'Add') this.stats.features.add('listAdd');
        return lm.returns;
      }
      if (this.info(t) && c.name !== 'ToString') {
        const mi = this.findMethod(t, c.name);
        if (!mi) {
          argTypes();
          const fi = this.findField(t, c.name);
          if (fi) { this.error('CS1955', `Non-invocable member '${fi.owner}.${c.name}' cannot be used like a method.`, e, `${c.name} is a field: remove the brackets.`); return null; }
          const s = suggest(c.name, this.chain(t).flatMap(i => [...i.methods.keys()]));
          this.error('CS1061', `'${t}' does not contain a definition for '${c.name}'`, { line: c.nameLine, col: c.nameCol }, s ? `Did you mean ${s}? C# is case-sensitive.` : `Add the method to the class ${t}: public void ${c.name}() { … }`);
          return null;
        }
        return this.instanceCall(e, mi, argTypes(), {});
      }
      if (c.name === 'ToString' && t !== 'Drone') {
        argTypes();
        if (e.args.length) { this.error('CS1501', `No overload for method 'ToString' takes ${e.args.length} arguments`, e); return null; }
        e.method = 'ToString'; return 'string';
      }
      if (t === 'string') {
        const types = argTypes();
        if (c.name === 'Length') { this.error('CS1955', "Non-invocable member 'string.Length' cannot be used like a method.", e, 'Length is a property, not a method: remove the brackets.'); return null; }
        const m = STRING_METHODS[c.name];
        if (!m) { const sg = suggest(c.name, ['Length', ...Object.keys(STRING_METHODS)]); this.error('CS1061', `'string' does not contain a definition for '${c.name}'`, { line: c.nameLine, col: c.nameCol }, sg ? `Did you mean ${sg}? C# is case-sensitive.` : ''); return null; }
        const cands = m.overloads.filter(o => o.length === e.args.length);
        if (!cands.length) { this.error('CS1501', `No overload for method '${c.name}' takes ${e.args.length} arguments`, e, `Use ${m.overloads.map(o => `${c.name}(${o.join(', ')})`).join('  or  ')}.`); return null; }
        if (types.some(x => x === null)) return m.returns;
        if (!cands.some(o => o.every((p, i) => implicitOK(types[i], p)))) {
          const o = cands[0], i = o.findIndex((p, k) => !implicitOK(types[k], p));
          this.error('CS1503', `Argument ${i + 1}: cannot convert from '${types[i]}' to '${o[i]}'`, e.args[i], o[i] === 'string' && types[i] === 'char' ? '' : '');
          return m.returns;
        }
        e.method = 'string.' + c.name;
        this.stats.methods.add(c.name);
        return m.returns;
      }
      if (isArr(t) && c.name === 'Length') { argTypes(); this.error('CS1955', "Non-invocable member 'Array.Length' cannot be used like a method.", e, 'Length is a property, not a method: remove the brackets.'); return null; }
      if (t !== 'Drone') { argTypes(); this.error('CS1061', `'${t}' does not contain a definition for '${c.name}'`, { line: c.nameLine, col: c.nameCol }); return null; }
      key = `Drone.${c.name}`;
      owner = 'Drone';
    }
    const m = METHODS[key];
    const types = argTypes();
    if (!m) {
      const options = owner === 'Drone' ? [...methodNames('Drone'), ...Object.keys(DRONE_PROPS)] : methodNames(owner);
      const s = suggest(c.name, options);
      const code = owner === 'Drone' ? 'CS1061' : 'CS0117';
      this.error(code, `'${owner}' does not contain a definition for '${c.name}'`, { line: c.nameLine, col: c.nameCol }, s ? `Did you mean ${s}? C# is case-sensitive.` : '');
      return null;
    }
    if (owner === 'Drone' && c.name in DRONE_PROPS) { this.error('CS1955', `Non-invocable member 'Drone.${c.name}' cannot be used like a method.`, e, `Remove the brackets: drone.${c.name}`); return null; }
    e.method = key;
    this.stats.methods.add(c.name);
    const candidates = m.overloads.filter(o => o.length === e.args.length);
    if (!candidates.length) {
      const sigs = m.overloads.map(o => `${key.split('.')[1]}(${o.map(x => x === 'any' ? 'value' : x === 'number' ? 'number' : x).join(', ')})`).join('  or  ');
      this.error('CS1501', `No overload for method '${c.name}' takes ${e.args.length} arguments`, e, `Use ${sigs}.`);
      return null;
    }
    if (types.some(t => t === null)) return m.returns === 'void' ? 'void' : null;
    const accepts = (p, a) => p === 'any' ? a !== 'void' : p === 'number' ? isNum(a) : this.assignable(a, p);
    if (key === 'Scene.Add') this.stats.features.add('scene');
    const match = candidates.find(o => o.every((p, i) => accepts(p, types[i])));
    if (!match) {
      const o = candidates[0];
      const i = o.findIndex((p, k) => !accepts(p, types[k]));
      const expected = o[i] === 'number' ? 'double' : o[i] === 'any' ? 'object' : o[i];
      let hint = '';
      if (expected === 'Direction') hint = 'Directions are written Direction.Right, Direction.Left, Direction.Forward or Direction.Back.';
      else if (expected === 'Color') hint = 'Colors are written Color.Red, Color.Blue…';
      else if (expected === 'int' && isNum(types[i])) hint = 'Tile positions are whole numbers (int). Use (int) to convert.';
      this.error('CS1503', `Argument ${i + 1}: cannot convert from '${types[i]}' to '${expected}'`, e.args[i], hint);
      return m.returns === 'void' ? 'void' : null;
    }
    if (m.returns === 'arg') return types[0];
    if (m.returns === 'widest') return widest(types[0], types[1]);
    return m.returns;
  }
}

// ─── Compile ─────────────────────────────────────────────────────────────────
export function compile(src, { mode = 'program' } = {}) {
  let ast;
  try { ast = mode === 'calc' ? parseCalc(tokenize(src)) : new Parser(tokenize(src)).program(); }
  catch (err) {
    if (err instanceof CSharpError) return { ok: false, errors: [err], warnings: [], ast: null, stats: null };
    throw err;
  }
  const checker = new Checker();
  checker.program(ast);
  checker.errors.sort((a, b) => a.line - b.line || a.col - b.col);
  ast.types = checker.types;
  return { ok: checker.errors.length === 0, errors: checker.errors, warnings: checker.warnings, ast, stats: checker.stats };
}

// ─── Source display (for explanations) ───────────────────────────────────────
export function show(e, valueOf) {
  const s = x => show(x, valueOf);
  switch (e.type) {
    case 'Num': return e.raw;
    case 'Str': return JSON.stringify(e.value);
    case 'Char': return literal(e.value, 'char');
    case 'Lit': return literal(e.value, e.ty);
    case 'Index': return `${show(e.object, valueOf)}[${show(e.index, valueOf)}]`;
    case 'Bool': return String(e.value);
    case 'Interp': return '$"' + e.parts.map(p => typeof p === 'string' ? p : `{${s(p)}}`).join('') + '"';
    case 'Ident': return valueOf && e.name !== 'drone' ? valueOf(e) : e.name;
    case 'Paren': return `(${s(e.expr)})`;
    case 'Member': return valueOf && e.object.type === 'Ident' && e.object.name === 'drone' ? valueOf(e) : `${show(e.object)}.${e.name}`;
    case 'Call': return `${show(e.callee)}(${e.args.map(s).join(', ')})`;
    case 'Unary': return e.op + s(e.arg);
    case 'Binary': return `${s(e.left)} ${e.op} ${s(e.right)}`;
    case 'Cast': return `(${e.to})${s(e.arg)}`;
    case 'Cond': return `${s(e.test)} ? ${s(e.a)} : ${s(e.b)}`;
    case 'ArrayInit': return `{ ${e.items.map(s).join(', ')} }`;
    case 'NewObject': return `new ${e.typeName}(${e.args.map(s).join(', ')})${e.items ? ` { ${e.items.map(s).join(', ')} }` : ''}`;
    case 'This': return 'this';
    case 'Base': return 'base';
    case 'Null': return 'null';
    case 'NewArray': return e.size ? `new ${e.elem}[${s(e.size)}]` : `new ${e.elem}[] { ${e.items.map(s).join(', ')} }`;
  }
  return '';
}
export function showStatement(s) {
  switch (s.type) {
    case 'VarDecl': return `${s.varType} ${s.decls.map(d => d.init ? `${d.name} = ${show(d.init)}` : d.name).join(', ')}`;
    case 'Assign': return `${show(s.target)} ${s.op} ${show(s.value)}`;
    case 'IncDec': return s.prefix ? `${s.op}${show(s.target)}` : `${show(s.target)}${s.op}`;
    case 'ExprStmt': return show(s.expr);
  }
  return '';
}

// ─── Runner (executes step by step) ──────────────────────────────────────────
class Signal { constructor(kind, value) { this.kind = kind; this.value = value; } }
const BREAK = new Signal('break'), CONTINUE = new Signal('continue');
const MAX_DEPTH = 100;

export class Runner {
  constructor(ast, world, { maxSteps = 20000, calcTowers = false, frames = 60, deltaTime = 0.05 } = {}) {
    this.ast = ast; this.world = world; this.maxSteps = maxSteps; this.calcTowers = calcTowers;
    this.types = ast.types || new Map();
    this.heap = []; this.objId = 0;        // every class object (and list) created, for the Memory panel
    this.scene = []; this.history = [];    // objects added with Scene.Add, and their positions every frame
    this.frameCount = frames; this.dt = Math.fround(deltaTime); this.frameNo = 0;
    this.results = [];
    this.resultsByLine = new Map();
    this.scopes = [];
    this.output = [];
    this.steps = 0;
    this.line = 1;
    this.lineCounts = new Map();
    this.notes = new Map();
    this.log = [];
    this.changed = new Set();
    this.uid = 0;
    this.memo = new Map();   // values of the student's own method calls, for the expression being evaluated
    this.depth = 0;          // how many method calls are running (0 = main program)
    this.frames = [];        // call stack: { name, text, callLine }
  }

  // Generator: yields one event per visible step.
  *run() {
    // Scopes are only removed on normal exit, so after a runtime error the
    // Memory panel still shows the variables at the moment of the error.
    this.pushScope('Program', 1, 'program');
    for (const s of this.ast.body) {
      if (s.type === 'MethodDecl' || s.type === 'ClassDecl') continue;
      const sig = yield* this.exec(s);
      if (sig) break;
    }
    if (this.scene.length) yield* this.playFrames();
    this.finished = true;
  }
  runToEnd() { for (const _ of this.run()); return this; }

  pushScope(label, line, kind) { const sc = { id: ++this.uid, label, line, kind, vars: new Map(), iteration: 0 }; this.scopes.push(sc); return sc; }
  popScope() { this.scopes.pop(); }
  // A method only sees its own frame: the search stops at the scope where the method call started.
  lookup(name) {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const v = this.scopes[i].vars.get(name); if (v) return v;
      if (this.scopes[i].kind === 'method') break;
    }
    throw new Error('Unknown variable ' + name);
  }

  tick(line, count = true) {
    this.line = line;
    if (++this.steps > this.maxSteps) throw new CSharpError({
      kind: 'runtime', exception: 'TimeoutException', message: `The program ran more than ${this.maxSteps.toLocaleString('en')} steps and was stopped.`, line,
      hint: 'Is there a loop whose condition never becomes false? Check that the loop variable changes on every turn.'
    });
    if (count) this.lineCounts.set(line, (this.lineCounts.get(line) || 0) + 1);
    this.changed = new Set();
    this.access = null; // the array item read or written in this step
  }
  note(line, text, summary = text) {
    this.notes.set(line, text);
    this.log.push({ line, text: summary, step: this.steps });
    if (this.log.length > 200) this.log.shift();
  }
  at(s, count = true) { this.tick(s.line, count); return { kind: 'line', line: s.line, depth: this.depth }; }

  // Runs the student's own method calls inside an expression (step by step),
  // storing their results so the normal evaluation can use them.
  *pre(e) {
    if (!e || !hasUserCall(e)) return;
    if (e.type === 'Call' && e.method === 'instance') {
      let target;
      if (e.implicitThis || e.baseCall) target = this.currentThis();
      else { yield* this.pre(e.callee.object); target = this.eval(e.callee.object); }
      for (const a of e.args) yield* this.pre(a);
      const args = e.args.map(a => this.eval(a));
      if (target == null) throw this.nullError(e.callee.object, `, so it has no ${e.decl.name}() to run`);
      const decl = e.baseCall ? e.decl : this.dispatch(target, e.decl);
      this.memo.set(e, yield* this.invokeMethod(decl, args, target));
      return;
    }
    if (e.type === 'NewObject' && e.userCall) {
      for (const a of e.args) yield* this.pre(a);
      const args = e.args.map(a => this.eval(a));
      this.memo.set(e, yield* this.construct(e, args));
      return;
    }
    if (e.type === 'Call' && e.method === 'user') {
      for (const a of e.args) yield* this.pre(a);
      const args = e.args.map(a => this.eval(a));
      this.memo.set(e, yield* this.invoke(e, args));
      return;
    }
    if (e.type === 'Binary' && (e.op === '&&' || e.op === '||')) {
      yield* this.pre(e.left);
      const l = this.eval(e.left);
      if (e.op === '&&' ? l : !l) yield* this.pre(e.right);
      return;
    }
    if (e.type === 'Cond') {
      yield* this.pre(e.test);
      yield* this.pre(this.eval(e.test) ? e.a : e.b);
      return;
    }
    for (const k of kidsOf(e)) yield* this.pre(k);
  }
  *preStmt(s) {
    switch (s.type) {
      case 'VarDecl': for (const d of s.decls) if (d.init) yield* this.pre(d.init); return;
      case 'Assign': yield* this.pre(s.target.type === 'Member' ? s.target.object : s.target); yield* this.pre(s.value); return;
      case 'IncDec': yield* this.pre(s.target); return;
      case 'ExprStmt': yield* this.pre(s.expr); return;
      case 'Return': if (s.value) yield* this.pre(s.value); return;
    }
  }

  *invoke(call, args) { return yield* this.invokeMethod(call.decl, args, null); }

  // ─── Objects ──────────────────────────────────────────────────────────────
  currentThis() { for (let i = this.scopes.length - 1; i >= 0; i--) if (this.scopes[i].kind === 'method') return this.scopes[i].thisObj ?? null; return null; }
  info(name) { return this.types.get(name); }
  chainOf(I) { const out = []; while (I) { out.push(I); I = I.base ? this.info(I.base) : null; } return out; }
  defaultValue(type) {
    if (type in DEFAULTS) return DEFAULTS[type];
    const I = this.info(type);
    if (I && I.kind === 'struct') return this.makeStruct(I);
    return null;
  }
  makeStruct(I) {
    if (I.name === 'Vector3') return vec(0, 0, 0);
    const o = { __struct: I.name, f: {} };
    for (const [n, f] of I.fields) o.f[n] = this.defaultValue(f.type);
    return o;
  }
  newRef(obj) { obj.__id = ++this.objId; this.heap.push(obj); return obj; }
  makeList(elem, items = []) { return this.newRef({ __list: true, elem, items, version: 0 }); }
  nullError(expr, what = '') {
    return this.runtimeError('NullReferenceException', 'Object reference not set to an instance of an object.', `${show(expr)} is null: it doesn't point to any object${what}. Create one with new before using it, or check if (${show(expr)} != null).`);
  }
  // Runs field initializers and constructors (base class first).
  *construct(e, args) {
    const I = e.cls, callLine = this.line;
    if (I.kind === 'struct') {
      const o = this.makeStruct(I);
      for (const [n, f] of I.fields) if (f.init) o.f[n] = yield* this.fieldInit(o, f, I);
      if (e.ctor) yield* this.invokeMethod(e.ctor, args, o, { ctor: true, callLine });
      return o;
    }
    const obj = this.newRef({ __cls: I, f: {} });
    const chain = this.chainOf(I).reverse();
    for (const C of chain) for (const [n, f] of C.fields) obj.f[n] = this.defaultValue(f.type);
    if (chain.some(C => C.name === 'MonoBehaviour')) obj.f.transform = this.newRef({ __cls: this.info('Transform'), f: { position: vec(0, 0, 0), localScale: vec(1, 1, 1) } });
    for (const C of chain) for (const [n, f] of C.fields) if (f.init) obj.f[n] = yield* this.fieldInit(obj, f, C);
    yield* this.runCtor(I, e.ctor, args, obj, callLine);
    this.line = callLine;
    return obj;
  }
  *fieldInit(obj, f, C) {
    const sc = this.pushScope(`${C.name} fields`, f.line, 'method'); sc.thisObj = obj;
    yield* this.pre(f.init);
    const v = this.convert(this.eval(f.init), f.type);
    this.scopes.splice(this.scopes.indexOf(sc), 1);
    return v;
  }
  *runCtor(I, ctor, args, obj, callLine) {
    if (!ctor) { // implicit constructor: run the base class's parameterless one
      const B = I.base ? this.info(I.base) : null;
      if (B && !B.builtin) yield* this.runCtor(B, B.ctors.find(k => !k.params.length) || null, [], obj, callLine);
      return;
    }
    yield* this.invokeMethod(ctor, args, obj, { ctor: true, callLine, cls: I });
  }
  dispatch(obj, decl) {
    if (!isObj(obj) || !(decl.isVirtual || decl.isOverride)) return decl;
    for (const C of this.chainOf(obj.__cls)) {
      const m = C.methods.get(decl.name);
      if (m && (m === decl || m.isOverride)) return m;
    }
    return decl;
  }
  findRuntimeMethod(obj, name) { for (const C of this.chainOf(obj.__cls)) { const m = C.methods.get(name); if (m) return m; } return null; }

  // Unity-like loop: Start() once, then Update() on every object, every frame.
  *playFrames() {
    const snap = () => this.scene.map(o => { const p = o.f.transform?.f.position || vec(0, 0, 0); return { id: o.__id, x: p.f.x, y: p.f.y, z: p.f.z, color: typeof o.f.color === 'string' ? o.f.color : 'White' }; });
    for (let f = 1; f <= this.frameCount; f++) {
      this.frameNo = f;
      const first = this.scene.map(o => this.findRuntimeMethod(o, 'Update')).find(Boolean);
      this.tick(first?.line || this.line, false);
      yield { kind: 'frame', frame: f, line: first?.line || this.line, depth: 0, time: (f - 1) * this.dt };
      for (const o of [...this.scene]) {
        if (f === 1) { const st = this.findRuntimeMethod(o, 'Start'); if (st && !st.params.length) yield* this.invokeMethod(st, [], o, { engine: true }); }
        const u = this.findRuntimeMethod(o, 'Update');
        if (u && !u.params.length) yield* this.invokeMethod(u, [], o, { engine: true });
      }
      this.history.push(snap());
    }
  }

  *invokeMethod(m, args, thisObj, { ctor = false, callLine = this.line, engine = false, cls = null } = {}) {
    const who = thisObj ? (isObj(thisObj) ? `${thisObj.__cls.name} #${thisObj.__id}` : thisObj.__struct) : '';
    const argText = args.map((a, i) => literal(a, m.params[i].resolvedType)).join(', ');
    const text = ctor ? `new ${m.name}(${argText})` : thisObj ? `${who}.${m.name}(${argText})` : `${m.name}(${argText})`;
    if (this.depth >= MAX_DEPTH) throw this.runtimeError('StackOverflowException', 'Stack overflow: too many method calls inside each other.', `${m.name} keeps calling itself and never stops. A method that calls itself needs a case where it returns without calling again.`);
    const scope = this.pushScope(text, m.line, 'method');
    scope.thisObj = thisObj; scope.engine = engine;
    scope.method = m.name; scope.callLine = callLine; scope.returnType = m.resolvedReturn;
    this.frames.push({ name: m.name, text, callLine, scope });
    this.depth++;
    m.params.forEach((p, i) => {
      const v = { name: p.name, type: p.resolvedType, value: undefined, assigned: false, line: p.line, id: ++this.uid, param: true };
      scope.vars.set(p.name, v);
      this.set(v, args[i]);
    });
    this.tick(m.line);
    const paramText = m.params.map((p, i) => `${p.name} = ${literal(scope.vars.get(p.name).value, p.resolvedType)}`).join(', ');
    this.note(m.line, `called ${text}${paramText ? ` · ${paramText}` : ''}`, engine ? `frame ${this.frameNo}: the lab calls ${text}` : `line ${callLine} calls ${text}${paramText ? `: ${paramText}` : ''}`);
    yield { kind: 'call', line: m.line, depth: this.depth, method: m.name, text, callLine, engine, ctor };
    if (ctor && m.baseArgs) { // : base(…) runs before the body
      for (const a of m.baseArgs) yield* this.pre(a);
      const bargs = m.baseArgs.map(a => this.eval(a));
      const B = this.info((cls || thisObj.__cls).base);
      if (B) yield* this.runCtor(B, m.baseCtor, bargs, thisObj, m.line);
    } else if (ctor && isObj(thisObj)) {
      const B = (cls || thisObj.__cls).base ? this.info((cls || thisObj.__cls).base) : null;
      if (B && !B.builtin) yield* this.runCtor(B, B.ctors.find(k => !k.params.length) || null, [], thisObj, m.line);
    }
    let value, sig;
    for (const st of m.body.body) { sig = yield* this.exec(st); if (sig) break; }
    if (sig && sig.kind === 'return') value = sig.value;
    this.depth--;
    this.frames.pop();
    this.popScope();
    this.line = callLine;
    this.tick(callLine, false);
    if (engine) { this.line = m.line; return value; }
    const shown = ctor ? `${text} created ${who}` : m.resolvedReturn === 'void' ? `${text} finished` : `${text} gave back ${literal(value, m.resolvedReturn)}`;
    this.note(callLine, shown, `back on line ${callLine}: ${shown}`);
    yield { kind: 'return', line: callLine, depth: this.depth, method: m.name, text, value: ctor ? thisObj : value, type: ctor ? (thisObj.__cls?.name || thisObj.__struct) : m.resolvedReturn, ctor };
    return value;
  }

  runtimeError(exception, message, hint = '') {
    return new CSharpError({ kind: 'runtime', exception, message, line: this.line, hint });
  }

  *exec(s, label) {
    switch (s.type) {
      case 'Block': {
        this.pushScope(label || `{ } block`, s.line, 'block');
        for (const st of s.body) { const sig = yield* this.exec(st); if (sig) { this.popScope(); return sig; } }
        this.popScope();
        return;
      }
      case 'Empty': return;
      case 'Calc': {
        yield this.at(s);
        this.calcLine(s);
        return;
      }
      case 'VarDecl': case 'Assign': case 'IncDec': case 'ExprStmt':
        yield this.at(s);
        yield* this.preStmt(s);
        this.line = s.line;
        this.simple(s);
        return;
      case 'MethodDecl': return;
      case 'Return': {
        yield this.at(s);
        yield* this.preStmt(s);
        this.line = s.line;
        const m = this.frames.at(-1);
        const type = s.value ? (m?.scope.returnType || s.value.ty) : null;
        const value = s.value ? this.convert(this.eval(s.value), type) : undefined;
        this.note(s.line, s.value ? `return ${literal(value, type)}` : 'return → leave the method', s.value ? `${show(s.value)} is ${literal(value, type)}: give it back to line ${m?.callLine}` : 'return: leave the method');
        return new Signal('return', value);
      }
      case 'If': {
        yield* this.pre(s.test);
        const v = this.cond(s.test, s.line);
        yield this.condEvent(s, s.test, v, v ? 'true → run the if block' : s.alt ? 'false → run the else part' : 'false → skip the if block');
        if (v) return yield* this.exec(s.cons, `if (line ${s.line})`);
        if (s.alt) return yield* this.exec(s.alt, `else (line ${s.elseLine})`);
        return;
      }
      case 'While': {
        let n = 0;
        for (;;) {
          yield* this.pre(s.test);
          const v = this.cond(s.test, s.line);
          yield this.condEvent(s, s.test, v, v ? `true → loop turn ${n + 1}` : `false → the loop ends after ${n} turn${n === 1 ? '' : 's'}`);
          if (!v) break;
          n++;
          const sig = yield* this.exec(s.body, `while · turn ${n}`);
          if (sig === BREAK) break;
          if (sig && sig.kind === 'return') return sig;
        }
        return;
      }
      case 'Do': {
        let n = 0;
        for (;;) {
          n++;
          const sig = yield* this.exec(s.body, `do · turn ${n}`);
          if (sig === BREAK) break;
          if (sig && sig.kind === 'return') return sig;
          yield* this.pre(s.test);
          const v = this.cond(s.test, s.whileLine);
          yield this.condEvent({ line: s.whileLine }, s.test, v, v ? 'true → repeat' : `false → the loop ends after ${n} turn${n === 1 ? '' : 's'}`);
          if (!v) break;
        }
        return;
      }
      case 'For': {
        this.pushScope(`for (line ${s.line})`, s.line, 'for');
        if (s.init) { yield { ...this.at(s, false), phase: 'init' }; yield* this.preStmt(s.init); this.simple(s.init, s.line); }
        let n = 0;
        for (;;) {
          if (s.test) yield* this.pre(s.test);
          const v = s.test ? this.cond(s.test, s.line) : true;
          yield this.condEvent(s, s.test, v, v ? `true → loop turn ${n + 1}` : `false → the loop ends after ${n} turn${n === 1 ? '' : 's'}`);
          if (!v) break;
          n++;
          this.scopes.at(-1).iteration = n;
          const sig = yield* this.exec(s.body, `for · turn ${n}`);
          if (sig === BREAK) break;
          if (sig && sig.kind === 'return') { this.popScope(); return sig; }
          if (s.update) { yield { ...this.at(s, false), phase: 'update' }; yield* this.preStmt(s.update); this.simple(s.update, s.line); }
        }
        this.popScope();
        return;
      }
      case 'Foreach': {
        yield* this.pre(s.collection);
        this.line = s.line;
        const coll = this.eval(s.collection);
        if (coll == null) throw this.runtimeError('NullReferenceException', 'Object reference not set to an instance of an object.', `${show(s.collection)} has no value yet (null).`);
        const isText = typeof coll === 'string';
        const list = isList(coll) ? coll : null, v0 = list?.version;
        const items = isText ? [...coll] : list ? list.items : coll;
        const scope = this.pushScope(`foreach (line ${s.line})`, s.line, 'for');
        const v = { name: s.name, type: s.resolvedType, value: undefined, assigned: false, line: s.nameLine, id: ++this.uid, readOnly: true };
        let n = 0;
        for (;;) {
          if (list && list.version !== v0) { this.line = s.line; throw this.runtimeError('InvalidOperationException', 'Collection was modified; enumeration operation may not execute.', "A list can't change (Add, Remove…) while foreach goes through it. Use a for loop, or collect the changes and apply them after the loop."); }
          const has = n < items.length;
          if (has) { if (!scope.vars.has(s.name)) scope.vars.set(s.name, v); this.set(v, items[n]); }
          yield this.foreachEvent(s, has, n, items, isText);
          if (!has) break;
          n++;
          scope.iteration = n;
          const sig = yield* this.exec(s.body, `foreach · turn ${n}`);
          if (sig === BREAK) break;
          if (sig && sig.kind === 'return') { this.popScope(); return sig; }
        }
        this.popScope();
        return;
      }
      case 'Break': yield this.at(s); this.note(s.line, 'break → leave the loop'); return BREAK;
      case 'Continue': yield this.at(s); this.note(s.line, 'continue → next turn'); return CONTINUE;
    }
  }

  calcLine(s) {
    const st = s.stmt;
    let entry;
    this.lastText = null;
    if (st.type === 'ExprStmt') {
      const e = st.expr, value = this.eval(e), type = e.ty;
      const text = type === 'void' ? '' : literal(value, type);
      entry = { line: s.line, value, type, text, expression: true };
      if (type === 'bool' && !['Bool'].includes(e.type)) entry.steps = this.reduceSteps(e);
      if (e.type === 'Call' && type === 'void') this.note(s.line, this.lastCallNote || show(e));
      else this.note(s.line, `${show(e)} → ${text}`, `${show(e)} is ${text}`);
      if (this.calcTowers && type === 'int') {
        if (value >= 0 && this.world.height() + value <= this.world.maxHeight) this.world.build(value);
        else entry.noTower = true;
      }
    } else {
      this.simple(st);
      const name = st.type === 'VarDecl' ? st.decls.at(-1).name : st.target.name;
      const v = this.lookup(name);
      entry = { line: s.line, value: v.value, type: v.type, text: `${name} = ${literal(v.value, v.type)}`, expression: false };
    }
    const top = st.type === 'ExprStmt' ? st.expr : null;
    const showsSource = top && (top.type === 'Index' || (top.type === 'Member' && top.name === 'Length') || ['string.Substring', 'string.IndexOf'].includes(top.method));
    entry.textView = showsSource && this.lastText ? this.lastText : entry.type === 'string' ? { text: entry.value } : entry.type === 'char' ? { text: entry.value, from: 0, to: 1 } : null;
    this.results.push(entry);
    this.resultsByLine.set(s.line, entry);
  }

  // How an expression is worked out, step by step:
  // age >= 18 && member → 16 >= 18 && true → false && true → false
  reduceSteps(e) {
    const orig = n => n._o || n;
    const LEAVES = ['Num', 'Str', 'Bool', 'Char', 'Lit', 'Null'];
    const KEYS = ['left', 'right', 'arg', 'expr', 'object', 'index'];
    const isLit = n => LEAVES.includes(n.type);
    const isStatic = n => n.type === 'Member' && n.object.type === 'Ident' && ['Color', 'Direction', 'Math'].includes(n.object.name);
    const isStaticValue = n => n.type === 'Member' && n.object.type === 'Ident' && !n.object.ty && ['Vector3', 'Time', 'Mathf'].includes(n.object.name);
    const done = n => isLit(n) || isStatic(n);
    const L = n => ({ type: 'Lit', value: this.eval(orig(n)), ty: orig(n).ty });
    const map = (n, f) => { const c = { ...n, _o: orig(n) }; for (const k of KEYS) if (n[k]) c[k] = f(n[k]); if (n.args) c.args = n.args.map(f); return c; };
    // heights[i] → heights[2] → 7: the array name stays, its position is worked out first.
    const namedItem = n => n.type === 'Index' && n.object.type === 'Ident' && isArr(n.object.ty);
    const kids = n => namedItem(n) ? [n.index] : [...KEYS.filter(k => n[k]).map(k => n[k]), ...(n.args || [])];
    const subst = n => done(n) ? n
      : (n.type === 'Ident' || n.type === 'This' || isStaticValue(n) || (n.type === 'Member' && (n.object.type === 'Ident' || n.object.type === 'This'))) ? L(n)
      : namedItem(n) ? { ...n, _o: orig(n), index: subst(n.index) } : map(n, subst);
    const collapse = n => done(n) ? n : kids(n).every(done) ? (n.type === 'Paren' ? n.expr : L(n)) : namedItem(n) ? { ...n, index: collapse(n.index) } : map(n, collapse);
    const steps = [show(e)];
    const push = x => { if (steps.at(-1) !== x) steps.push(x); };
    let cur = subst(e);
    push(show(cur));
    for (let i = 0; i < 16 && !isLit(cur); i++) { cur = collapse(cur); push(show(cur)); }
    return steps;
  }

  cond(test, line) { this.line = line; return this.eval(test); }
  condEvent(s, test, value, outcome) {
    this.tick(s.line);
    let text = 'true';
    if (test) {
      const steps = this.reduceSteps(test);
      if (steps.at(-1) !== String(value)) steps.push(String(value));
      text = steps.join('  →  ');
    }
    this.note(s.line, `${value ? '✓' : '✗'} ${test ? show(test, e => literal(this.eval(e), e.ty)) : 'true'} is ${value}`, `${test ? show(test) : 'true'} is ${value}: ${outcome.split('→ ')[1] || outcome}`);
    return { kind: 'cond', line: s.line, value, text, outcome, depth: this.depth };
  }

  foreachEvent(s, has, n, items, isText) {
    this.tick(s.line);
    const src = show(s.collection);
    let text, outcome;
    if (has) {
      if (!isText) this.access = { arr: items, i: n, write: false };
      const lit = literal(items[n], s.itemType);
      text = `${src}[${n}]  →  ${lit}`;
      outcome = `next item → loop turn ${n + 1}`;
      this.note(s.line, `${s.name} = ${lit} (item ${n} of ${src})`, `${s.name} = ${src}[${n}] = ${lit}`);
    } else {
      text = `${src}.Length  →  ${items.length}`;
      outcome = `no more items → the loop ends after ${n} turn${n === 1 ? '' : 's'}`;
      this.note(s.line, `no more items in ${src}`, `${src} has no more items: the loop ends`);
    }
    return { kind: 'cond', line: s.line, value: has, text, outcome, depth: this.depth };
  }

  convert(v, type) {
    if (isStructVal(v)) return copyValue(v);
    if (type === 'float') return Math.fround(v);
    if (type === 'int') return v | 0;
    return v;
  }
  set(variable, value) {
    variable.value = this.convert(value, variable.type);
    variable.assigned = true;
    variable.version = (variable.version || 0) + 1;
    this.changed.add(variable);
  }

  simple(s, line = s.line) {
    this.line = line;
    switch (s.type) {
      case 'VarDecl': {
        const parts = [];
        for (const d of s.decls) {
          const v = { name: d.name, type: d.resolvedType, value: undefined, assigned: false, line: d.line, id: ++this.uid };
          this.scopes.at(-1).vars.set(d.name, v);
          if (d.init) { this.set(v, this.eval(d.init)); parts.push(`${d.name} = ${literal(v.value, v.type)}`); }
          else { this.changed.add(v); parts.push(`${d.name} (no value yet)`); }
        }
        this.note(line, parts.join(', '), `new ${s.varType === 'var' ? s.decls[0].resolvedType : s.varType} ${parts.join(', ')}`);
        return;
      }
      case 'Assign': {
        if (s.target.type === 'Index') return this.assignElement(s, line);
        if (s.target.type === 'Member' || s.target.field) return this.assignMember(s, line);
        const v = this.lookup(s.target.name);
        const r = this.eval(s.value);
        if (s.op === '=') { this.set(v, r); this.note(line, `${v.name} = ${literal(v.value, v.type)}`); return; }
        const before = v.value;
        const result = this.arith(s.op[0], before, r, v.type === 'string' ? 'string' : widest(v.type, s.value.ty), v.type, s.value.ty);
        this.set(v, result);
        this.note(line, `${v.name} ${s.op} ${literal(r, s.value.ty)} → ${literal(v.value, v.type)}`, `${v.name} was ${literal(before, v.type)}, now ${literal(v.value, v.type)}`);
        return;
      }
      case 'IncDec': {
        if (s.target.type === 'Index') return this.assignElement(s, line);
        if (s.target.type === 'Member' || s.target.field) return this.assignMember(s, line);
        const v = this.lookup(s.target.name);
        const before = v.value;
        this.set(v, v.type === 'int' ? (before + (s.op === '++' ? 1 : -1)) | 0 : before + (s.op === '++' ? 1 : -1));
        this.note(line, `${v.name}${s.op} → ${literal(v.value, v.type)}`, `${v.name} went from ${literal(before, v.type)} to ${literal(v.value, v.type)}`);
        return;
      }
      case 'ExprStmt': {
        const e = s.expr;
        if (e.type === 'Call' && (e.method === 'user' || e.method === 'instance')) return; // the call already explained itself
        if (e.type === 'NewObject' && e.userCall) return;
        const result = this.eval(e, true);
        this.note(line, result || showStatement(s));
        return;
      }
    }
  }

  assignMember(s, line) {
    const t = s.target, name = t.name;
    const holder = t.type === 'Ident' ? this.currentThis() : this.eval(t.object);
    if (holder == null) throw this.nullError(t.object);
    const type = t.ty, before = holder.f[name];
    let value;
    if (s.type === 'IncDec') value = before + (s.op === '++' ? 1 : -1);
    else {
      const r = this.eval(s.value);
      value = s.op === '=' ? r : this.binaryValue(s.op[0], before, r, type, s.value.ty, type === 'string' ? 'string' : type === 'Vector3' ? 'Vector3' : widest(type, s.value.ty));
    }
    holder.f[name] = this.convert(value, type);
    this.access = { obj: holder, field: name, write: true };
    for (const sc of this.scopes) for (const v of sc.vars.values()) if (v.value === holder) this.changed.add(v);
    const now = literal(holder.f[name], type);
    this.note(line, `${show(t)} = ${now}`, s.op === '=' ? `${show(t)} is now ${now}` : `${show(t)} was ${literal(before, type)}, now ${now}`);
  }
  // Arithmetic that also knows about Vector3.
  binaryValue(op, l, r, lt, rt, type) {
    if (type === 'Vector3' || lt === 'Vector3' || rt === 'Vector3') {
      if (op === '+' && (lt === 'string' || rt === 'string')) return formatValue(l, lt) + formatValue(r, rt);
      const V = v => v.f;
      switch (op) {
        case '+': return vec(V(l).x + V(r).x, V(l).y + V(r).y, V(l).z + V(r).z);
        case '-': return vec(V(l).x - V(r).x, V(l).y - V(r).y, V(l).z - V(r).z);
        case '*': { const [v, k] = lt === 'Vector3' ? [l, r] : [r, l]; return vec(V(v).x * k, V(v).y * k, V(v).z * k); }
        case '/': return vec(V(l).x / r, V(l).y / r, V(l).z / r);
      }
    }
    return this.arith(op, l, r, type, lt, rt);
  }
  element(indexNode) {
    let arr = this.eval(indexNode.object);
    const i = this.eval(indexNode.index);
    const name = show(indexNode.object);
    if (arr == null) throw this.runtimeError('NullReferenceException', 'Object reference not set to an instance of an object.', `${name} has no value yet (null).`);
    if (isList(arr)) {
      if (i < 0 || i >= arr.items.length) throw this.runtimeError('ArgumentOutOfRangeException', "Index was out of range. Must be non-negative and less than the size of the collection. (Parameter 'index')",
        arr.items.length ? `${name} has ${arr.items.length} item${arr.items.length === 1 ? '' : 's'} (Count): positions 0 to ${arr.items.length - 1}. You asked for position ${i}.` : `${name} is empty (Count is 0). Add items first.`);
      return { arr: arr.items, i, name, list: arr };
    }
    if (i < 0 || i >= arr.length) throw this.runtimeError('IndexOutOfRangeException', 'Index was outside the bounds of the array.',
      arr.length ? `${name} has ${arr.length} item${arr.length === 1 ? '' : 's'}: positions 0 to ${arr.length - 1}. You asked for position ${i}.` : `${name} is empty: it has no positions at all.`);
    return { arr, i, name };
  }
  assignElement(s, line) {
    const { arr, i, name, list } = this.element(s.target);
    if (list) list.version++;
    const type = s.target.ty, before = arr[i];
    let value;
    if (s.type === 'IncDec') value = before + (s.op === '++' ? 1 : -1);
    else {
      const r = this.eval(s.value);
      value = s.op === '=' ? r : this.arith(s.op[0], before, r, type === 'string' ? 'string' : widest(type, s.value.ty), type, s.value.ty);
    }
    arr[i] = this.convert(value, type);
    this.access = { arr, i, write: true };
    for (const sc of this.scopes) for (const v of sc.vars.values()) if (v.value === arr) this.changed.add(v);
    const now = literal(arr[i], type);
    this.note(line, `${name}[${i}] = ${now}`, s.op === '=' ? `${name}[${i}] is now ${now}` : `${name}[${i}] was ${literal(before, type)}, now ${now}`);
  }

  arith(op, l, r, type, lt, rt) {
    switch (op) {
      case '+': if (type === 'string') return formatValue(l, lt) + formatValue(r, rt); break;
    }
    if (type === 'int' && (op === '/' || op === '%') && r === 0)
      throw this.runtimeError('DivideByZeroException', 'Attempted to divide by zero.', 'Whole numbers (int) cannot be divided by 0. Check the value of the divisor before dividing.');
    let v;
    switch (op) {
      case '+': v = l + r; break;
      case '-': v = l - r; break;
      case '*': v = type === 'int' ? Math.imul(l, r) : l * r; break;
      case '/': v = type === 'int' ? Math.trunc(l / r) : l / r; break;
      case '%': v = l % r; break;
    }
    if (type === 'int') return v | 0;
    if (type === 'float') return Math.fround(v);
    return v;
  }

  eval(e, statement = false) {
    switch (e.type) {
      case 'Num': return e.value;
      case 'Str': return e.value;
      case 'Char': return e.value;
      case 'ArrayInit': return e.items.map(x => this.convert(this.eval(x), e.elemType));
      case 'Null': return null;
      case 'This': case 'Base': return this.currentThis();
      case 'NewObject': {
        if (e.userCall) { if (!this.memo.has(e)) throw new Error('Object created before it ran'); return this.memo.get(e); }
        const args = e.args.map(a => this.eval(a));
        if (e.kind === 'list') return this.makeList(e.elem, (e.items || []).map(x => this.convert(this.eval(x), e.elem)));
        if (e.kind === 'Vector3') return vec(args[0] ?? 0, args[1] ?? 0, args[2] ?? 0);
        if (e.kind === 'MonoBehaviour') return this.newRef({ __cls: e.cls, f: { transform: this.newRef({ __cls: this.info('Transform'), f: { position: vec(0, 0, 0), localScale: vec(1, 1, 1) } }) } });
        return null;
      }
      case 'NewArray': {
        if (e.items) return e.items.map(x => this.convert(this.eval(x), e.elemType));
        const n = this.eval(e.size);
        if (n < 0) throw this.runtimeError('OverflowException', 'Arithmetic operation resulted in an overflow.', `An array cannot have a negative size (${n}).`);
        if (n > 1000) throw this.runtimeError('LabException', 'Arrays in this lab can hold up to 1,000 items.', 'Use a smaller size.');
        return Array(n).fill(DEFAULTS[e.elem] ?? null);
      }
      case 'Index': {
        if (isArr(e.object.ty) || listElem(e.object.ty)) {
          const { arr, i } = this.element(e);
          this.access = { arr, i, write: false };
          return arr[i];
        }
        const text = this.eval(e.object), i = this.eval(e.index);
        if (text == null) throw this.runtimeError('NullReferenceException', 'Object reference not set to an instance of an object.', `${show(e.object)} has no value yet (null).`);
        if (i < 0 || i >= text.length) throw this.runtimeError('IndexOutOfRangeException', 'Index was outside the bounds of the array.', `"${text}" has ${text.length} characters: positions 0 to ${text.length - 1}. You asked for position ${i}.`);
        this.lastText = { text, from: i, to: i + 1 };
        return text[i];
      }
      case 'Bool': return e.value;
      case 'Interp': return e.parts.map(p => typeof p === 'string' ? p : formatValue(this.eval(p), p.ty)).join('');
      case 'Paren': return this.eval(e.expr);
      case 'Ident': {
        if (e.ty === 'Drone') return this.world;
        if (e.field) { const o = this.currentThis(); return o ? o.f[e.name] : undefined; }
        return this.lookup(e.name).value;
      }
      case 'Member': {
        if (e.ty === 'Color' && e.object.type === 'Ident' && e.object.name === 'Color') return e.name;
        if (e.ty === 'Direction' && e.object.type === 'Ident' && e.object.name === 'Direction') return e.name;
        if (e.object.type === 'Ident' && e.object.name === 'Math' && e.name === 'PI') return Math.PI;
        if (e.object.type === 'Ident' && !e.object.ty) {
          if (e.object.name === 'Vector3' && e.name in VECTOR_STATICS) return vec(...VECTOR_STATICS[e.name]);
          if (e.object.name === 'Time') return e.name === 'deltaTime' ? this.dt : Math.fround(Math.max(0, this.frameNo - 1) * this.dt);
          if (e.object.name === 'Mathf' && e.name === 'PI') return Math.fround(Math.PI);
        }
        const o = this.eval(e.object);
        if (o == null && e.object.ty !== 'Drone') throw this.nullError(e.object, `, so it has no ${e.name}`);
        if (isList(o) && e.name === 'Count') return o.items.length;
        if (isStructVal(o) || isObj(o)) {
          if (o.__struct === 'Vector3' && e.name === 'magnitude') return Math.fround(Math.hypot(o.f.x, o.f.y, o.f.z));
          if (o.__struct === 'Vector3' && e.name === 'normalized') { const m = Math.hypot(o.f.x, o.f.y, o.f.z) || 1; return vec(o.f.x / m, o.f.y / m, o.f.z / m); }
          this.access = { obj: o, field: e.name, write: false };
          return o.f[e.name];
        }
        if (o === this.world) {
          switch (e.name) {
            case 'X': return this.world.drone.x;
            case 'Z': return this.world.drone.z;
            case 'Height': return this.world.height();
            case 'Ground': return this.world.groundColor();
          }
        }
        if (e.name === 'Length') {
          if (o == null) throw this.runtimeError('NullReferenceException', 'Object reference not set to an instance of an object.', `${show(e.object)} has no value yet (null), so it has no Length.`);
          if (typeof o === 'string') this.lastText = { text: o, from: 0, to: o.length, count: true };
          return o.length;
        }
        return undefined;
      }
      case 'Call':
        if (e.method === 'instance') {
          if (!this.memo.has(e)) throw new Error('Method call evaluated before it ran');
          const v = this.memo.get(e);
          return statement ? (e.decl.resolvedReturn === 'void' ? `called ${show(e)}` : `${show(e)} → ${literal(v, e.decl.resolvedReturn)}`) : v;
        }
        if (e.method === 'user') {
          if (!this.memo.has(e)) throw new Error('Method call evaluated before it ran');
          const v = this.memo.get(e);
          return statement ? (e.decl.resolvedReturn === 'void' ? `called ${show(e)}` : `${show(e)} → ${literal(v, e.decl.resolvedReturn)}`) : v;
        }
        return this.callMethod(e, statement);
      case 'Unary': {
        const v = this.eval(e.arg);
        if (e.op === '!') return !v;
        if (e.op === '-' && isStructVal(v)) return vec(-v.f.x, -v.f.y, -v.f.z);
        if (e.op === '-') return e.ty === 'int' ? (-v | 0) : e.ty === 'float' ? Math.fround(-v) : -v;
        return v;
      }
      case 'Binary': {
        if (e.op === '&&') return this.eval(e.left) && this.eval(e.right);
        if (e.op === '||') return this.eval(e.left) || this.eval(e.right);
        const l = this.eval(e.left), r = this.eval(e.right);
        if (isStructVal(l) && isStructVal(r) && (e.op === '==' || e.op === '!=')) {
          const same = Math.hypot(l.f.x - r.f.x, l.f.y - r.f.y, l.f.z - r.f.z) < 1e-5; // Unity compares vectors approximately
          return e.op === '==' ? same : !same;
        }
        if (e.ty === 'Vector3' || (e.op === '+' && e.ty === 'string' && (isStructVal(l) || isStructVal(r)))) return this.binaryValue(e.op, l, r, e.left.ty, e.right.ty, e.ty);
        switch (e.op) {
          case '==': return l === r;
          case '!=': return l !== r;
          case '<': return l < r;
          case '>': return l > r;
          case '<=': return l <= r;
          case '>=': return l >= r;
        }
        return this.arith(e.op, l, r, e.ty, e.left.ty, e.right.ty);
      }
      case 'Cast': {
        const v = this.eval(e.arg);
        if (e.to === 'int') return Number.isFinite(v) ? Math.trunc(v) | 0 : -2147483648;
        if (e.to === 'float') return Math.fround(v);
        return v;
      }
      case 'Cond': return this.eval(e.test) ? this.eval(e.a) : this.eval(e.b);
    }
  }

  callMethod(e, statement) {
    const args = e.args.map(a => this.eval(a));
    if (e.method && (e.method.startsWith('string.') || e.method === 'ToString') && this.eval(e.callee.object) == null)
      throw this.runtimeError('NullReferenceException', 'Object reference not set to an instance of an object.', `${show(e.callee.object)} has no value yet (null).`);
    const w = this.world;
    const wrap = fn => {
      try { return fn(); }
      catch (err) { if (err && err.exception) throw this.runtimeError(err.exception, err.message, err.hint); throw err; }
    };
    switch (e.method) {
      case 'Drone.Move': return wrap(() => w.move(args[0], args.length > 1 ? args[1] : 1));
      case 'Drone.MoveTo': return wrap(() => w.moveTo(args[0], args[1]));
      case 'Drone.Place': return wrap(() => w.place(args.length ? args[0] : 'White'));
      case 'Drone.Build': return wrap(() => w.build(args[0], args.length > 1 ? args[1] : 'White'));
      case 'Drone.Scan': { const plan = w.scan(); return statement ? `scanned the plan of row ${w.drone.z}: ${literal(plan, 'int[]')}` : plan; }
      case 'Console.WriteLine': case 'Console.Write': {
        const text = args.length ? formatValue(args[0], e.args[0].ty) : '';
        if (e.method === 'Console.Write' && this.output.length && !this.output.at(-1).done) this.output.at(-1).text += text;
        else this.output.push({ text, line: this.line, done: e.method === 'Console.WriteLine' });
        if (e.method === 'Console.WriteLine' && this.output.length) this.output.at(-1).done = true;
        return statement ? `printed "${text}"` : undefined;
      }
      case 'ToString': return formatValue(this.eval(e.callee.object), e.callee.object.ty);
      case 'Debug.Log': {
        const text = formatValue(args[0], e.args[0].ty);
        this.output.push({ text, line: this.line, done: true });
        return statement ? `logged "${text}"` : undefined;
      }
      case 'Scene.Add': {
        const o = args[0];
        if (o == null) throw this.runtimeError('ArgumentNullException', "Value cannot be null. (Parameter 'obj')", `${show(e.args[0])} is null: create the object with new first.`);
        if (!this.scene.includes(o)) this.scene.push(o);
        return statement ? `${literal(o, e.args[0].ty)} joins the scene: the lab will call its Start() and Update()` : undefined;
      }
      case 'Mathf.Abs': return e.ty === 'int' ? Math.abs(args[0]) | 0 : Math.fround(Math.abs(args[0]));
      case 'Mathf.Min': return Math.fround(Math.min(args[0], args[1]));
      case 'Mathf.Max': return Math.fround(Math.max(args[0], args[1]));
      case 'Mathf.Clamp': return Math.fround(Math.min(args[2], Math.max(args[1], args[0])));
      case 'Mathf.Sin': return Math.fround(Math.sin(args[0]));
      case 'Mathf.Cos': return Math.fround(Math.cos(args[0]));
      case 'Mathf.Sqrt': return Math.fround(Math.sqrt(args[0]));
      case 'Vector3.Distance': { const [a, b] = args; return Math.fround(Math.hypot(a.f.x - b.f.x, a.f.y - b.f.y, a.f.z - b.f.z)); }
      case 'Vector3.Lerp': { const [a, b, t0] = args, t = Math.max(0, Math.min(1, t0)); return vec(a.f.x + (b.f.x - a.f.x) * t, a.f.y + (b.f.y - a.f.y) * t, a.f.z + (b.f.z - a.f.z) * t); }
    }
    if (e.method && e.method.startsWith('list.')) {
      const list = this.eval(e.callee.object);
      if (list == null) throw this.nullError(e.callee.object);
      const eq = (a, b) => isStructVal(a) && isStructVal(b) ? JSON.stringify(a) === JSON.stringify(b) : a === b;
      const it = list.items, name = show(e.callee.object);
      const range = i => { if (i < 0 || i > it.length - (e.method === 'list.Insert' ? 0 : 1)) throw this.runtimeError('ArgumentOutOfRangeException', "Index was out of range. Must be non-negative and less than the size of the collection. (Parameter 'index')", `${name} has ${it.length} item${it.length === 1 ? '' : 's'}: positions 0 to ${it.length - 1}.`); };
      let r, text;
      switch (e.method) {
        case 'list.Add': it.push(copyValue(args[0])); list.version++; text = `${name}.Add(${literal(args[0], list.elem)}) → Count ${it.length}`; break;
        case 'list.Insert': range(args[0]); it.splice(args[0], 0, copyValue(args[1])); list.version++; text = `${name} now has ${it.length} items`; break;
        case 'list.Remove': { const i = it.findIndex(x => eq(x, args[0])); r = i >= 0; if (r) { it.splice(i, 1); list.version++; } text = r ? `removed ${literal(args[0], list.elem)} → Count ${it.length}` : `${literal(args[0], list.elem)} was not in the list`; break; }
        case 'list.RemoveAt': range(args[0]); it.splice(args[0], 1); list.version++; text = `removed position ${args[0]} → Count ${it.length}`; break;
        case 'list.Clear': it.length = 0; list.version++; text = `${name} is empty`; break;
        case 'list.Contains': r = it.some(x => eq(x, args[0])); break;
        case 'list.IndexOf': r = it.findIndex(x => eq(x, args[0])); break;
      }
      this.access = { obj: list, write: true };
      for (const sc of this.scopes) for (const v of sc.vars.values()) if (v.value === list) this.changed.add(v);
      return statement ? text : r;
    }
    switch (e.method) {
      case 'string.ToUpper': return this.eval(e.callee.object).toUpperCase();
      case 'string.ToLower': return this.eval(e.callee.object).toLowerCase();
      case 'string.Trim': return this.eval(e.callee.object).trim();
      case 'string.Contains': return this.eval(e.callee.object).includes(args[0]);
      case 'string.StartsWith': return this.eval(e.callee.object).startsWith(args[0]);
      case 'string.EndsWith': return this.eval(e.callee.object).endsWith(args[0]);
      case 'string.Replace': return this.eval(e.callee.object).split(args[0]).join(args[1]);
      case 'string.IndexOf': {
        const text = this.eval(e.callee.object), i = text.indexOf(args[0]);
        this.lastText = i >= 0 ? { text, from: i, to: i + String(args[0]).length } : { text };
        return i;
      }
      case 'string.Substring': {
        const text = this.eval(e.callee.object), a = args[0], n = args.length > 1 ? args[1] : text.length - a;
        if (a < 0 || a > text.length) throw this.runtimeError('ArgumentOutOfRangeException', 'startIndex cannot be larger than length of string.', `"${text}" has ${text.length} characters. The start must be between 0 and ${text.length}.`);
        if (n < 0 || a + n > text.length) throw this.runtimeError('ArgumentOutOfRangeException', 'Index and length must refer to a location within the string.', `From position ${a}, only ${text.length - a} character${text.length - a === 1 ? ' is' : 's are'} left, but you asked for ${n}.`);
        this.lastText = { text, from: a, to: a + n };
        return text.substr(a, n);
      }
      case 'Math.Abs': return e.ty === 'int' ? Math.abs(args[0]) | 0 : Math.abs(args[0]);
      case 'Math.Max': return Math.max(args[0], args[1]);
      case 'Math.Min': return Math.min(args[0], args[1]);
      case 'Math.Sqrt': return Math.sqrt(args[0]);
      case 'Math.Pow': return Math.pow(args[0], args[1]);
      case 'Math.Floor': return Math.floor(args[0]);
      case 'Math.Round': { const x = args[0], f = Math.floor(x), d = x - f; return d === 0.5 ? (f % 2 === 0 ? f : f + 1) : Math.round(x); }
    }
    return undefined;
  }
}
