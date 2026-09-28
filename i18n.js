// Carrot Revolt Labs · shared translations (English · Català · Español)
//
// The pages are written in English. Each lab adds a dictionary whose keys are
// the English texts (as they appear in the page) and whose values hold the
// Catalan and Spanish versions. Keys may contain {placeholders} for texts that
// include values, e.g. 'Cut {n} links.'.
//
// Technical names stay in English on purpose (Blender operators and nodes,
// C# keywords and compiler messages), so students recognise them in the real tools.

const STORAGE_KEY = 'carrot-revolt-lang';
export const LANGS = [['en', 'EN', 'English'], ['ca', 'CA', 'Català'], ['es', 'ES', 'Español']];
const SKIP = 'script,style,svg,canvas,textarea,input,select,option,pre,code,kbd,[data-no-i18n]';

let lang = initialLang();
const exact = new Map();
const templates = [];
const templateKeys = new Map();
const sources = new WeakMap(), ours = new WeakMap();
const textSources = new WeakMap(), textOurs = new WeakMap();
const listeners = new Set();
let started = false;

function initialLang() {
  try { const saved = localStorage.getItem(STORAGE_KEY); if (LANGS.some(l => l[0] === saved)) return saved; } catch { /* storage unavailable */ }
  const nav = (navigator.language || 'en').toLowerCase();
  return nav.startsWith('ca') ? 'ca' : nav.startsWith('es') ? 'es' : 'en';
}
export const getLang = () => lang;

const norm = s => String(s).replace(/\s+/g, ' ').trim();
const tpl = typeof document !== 'undefined' ? document.createElement('template') : null;
const canon = html => { if (!tpl) return norm(html); tpl.innerHTML = html; return norm(tpl.innerHTML); };
const escapeRe = s => s.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
// Placeholders with these names only match numbers, so short templates never swallow whole sentences.
const NUMERIC = new Set(['n', 'a', 'b', 'i', 'l', 'x', 'z', 'd', 'total', 'max', 'count']);

const decode = html => { if (!tpl) return html; tpl.innerHTML = html; return tpl.content.textContent; };

export function addDictionary(dict) {
  for (const [en, tr] of Object.entries(dict)) {
    // Register the HTML form (as in innerHTML) and, for plain texts, the raw text form (as in textContent).
    const forms = new Set([canon(en)]);
    if (!/<[a-z]/i.test(en)) forms.add(norm(decode(en)));
    for (const key of forms) {
      const parts = key.split(/\{(\w+)\}/);
      if (parts.length === 1) { exact.set(key, tr); continue; }
      const names = [];
      let re = '^';
      parts.forEach((p, i) => { if (i % 2) { names.push(p); re += NUMERIC.has(p) ? '(-?[\\d.,]+)' : '(.+?)'; } else re += escapeRe(p); });
      templates.push({ re: new RegExp(re + '$', 's'), names, tr });
      templateKeys.set(key, tr);
    }
  }
  if (started) translateAll();
}

// Translate any English text (exact entry or template). Used by lab code for dynamic messages.
export function t(text) {
  if (text == null || lang === 'en') return text;
  return lookup(norm(text)) ?? text;
}

function lookup(key) {
  if (!key) return null;
  const e = exact.get(key);
  if (e) return e[lang] ?? null;
  if (key.length > 700) return null;
  for (const t of templates) {
    const m = key.match(t.re);
    if (!m) continue;
    let out = t.tr[lang];
    if (!out) return null;
    t.names.forEach((n, i) => {
      const v = m[i + 1];
      const vt = exact.get(v)?.[lang] ?? lookupNested(v) ?? v;
      out = out.split(`{${n}}`).join(vt);
    });
    return out;
  }
  return null;
}
function lookupNested(v) { return v && v.length < 300 && /[A-Za-z]{3}/.test(v) ? lookupTemplateOnly(v) : null; }
function lookupTemplateOnly(v) { for (const t of templates) { const m = v.match(t.re); if (m && t.tr[lang]) { let out = t.tr[lang]; t.names.forEach((n, i) => { out = out.split(`{${n}}`).join(exact.get(m[i + 1])?.[lang] ?? m[i + 1]); }); return out; } } return null; }

// Translate a string from code: tr('Cut {n} links.', { n: 3 })
export function tr(en, vars = {}) {
  const fill = s => s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  if (lang !== 'en') {
    const k = canon(en), raw = norm(en), e = exact.get(k) || templateKeys.get(k) || exact.get(raw) || templateKeys.get(raw);
    if (e && e[lang]) return fill(e[lang]);
  }
  return fill(en);
}

function visit(el) {
  if (el.nodeType !== 1 || el.matches(SKIP)) return;
  let src = sources.get(el);
  if (src !== undefined && ours.get(el) !== el.innerHTML) { sources.delete(el); src = undefined; }
  const html = el.innerHTML;
  if (html.length < 3000) {
    const key = src ?? norm(html);
    const hit = lang === 'en' ? null : lookup(key);
    if (hit != null || src !== undefined) {
      if (src === undefined) sources.set(el, key);
      const out = hit ?? src;
      if (norm(el.innerHTML) !== norm(out)) el.innerHTML = out;
      ours.set(el, el.innerHTML);
      return;
    }
  }
  for (const n of [...el.childNodes]) {
    if (n.nodeType === 3) visitText(n);
    else if (n.nodeType === 1) visit(n);
  }
}
function visitText(n) {
  const raw = n.textContent;
  if (!/[A-Za-z]{2}/.test(raw) && !textSources.has(n)) return;
  let src = textSources.get(n);
  if (src !== undefined && textOurs.get(n) !== raw) { textSources.delete(n); src = undefined; }
  const key = src ?? norm(raw);
  const hit = lang === 'en' ? null : lookup(key);
  if (hit == null && src === undefined) return;
  if (src === undefined) textSources.set(n, key);
  const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0];
  const out = lead + (hit ?? src) + trail;
  if (raw !== out) n.textContent = out;
  textOurs.set(n, out);
}

export function translate(root = document.body) {
  if (!root) return;
  if (root.nodeType === 3) visitText(root); else visit(root);
}
function translateAll() {
  document.documentElement.lang = lang;
  translate(document.body);
  document.querySelectorAll('.lang-switch button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
}

export function setLang(next) {
  if (!LANGS.some(l => l[0] === next) || next === lang) return;
  lang = next;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* storage unavailable */ }
  translateAll();
  listeners.forEach(fn => fn(lang));
}
export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

const CSS = `.lang-switch{display:inline-flex;border:1px solid #4a5058;border-radius:6px;overflow:hidden;flex:none}
.lang-switch button{background:none;border:0;border-radius:0;color:#aeb5bf;font:700 .68rem/1 Inter,'Segoe UI',Arial,sans-serif;letter-spacing:.8px;padding:7px 8px;cursor:pointer}
.lang-switch button+button{border-left:1px solid #4a5058}
.lang-switch button:hover{background:#2c3036;color:#fff}
.lang-switch button[aria-pressed="true"]{background:#ffbf00;color:#17191c}
.lang-switch button:focus-visible{outline:2px solid #ffbf00;outline-offset:-2px}`;

// Call once per page, after the page has rendered.
export function initI18n({ dictionaries = [], mount, append = false } = {}) {
  dictionaries.forEach(d => { for (const [en, trs] of Object.entries(d)) addDictionary({ [en]: trs }); });
  if (!document.getElementById('lang-switch-style')) {
    const style = document.createElement('style'); style.id = 'lang-switch-style'; style.textContent = CSS; document.head.append(style);
  }
  const host = typeof mount === 'string' ? document.querySelector(mount) : mount;
  if (host && !host.querySelector('.lang-switch')) {
    const box = document.createElement('div');
    box.className = 'lang-switch'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Language'); box.dataset.noI18n = '';
    box.innerHTML = LANGS.map(([code, label, name]) => `<button type="button" data-lang="${code}" title="${name}" aria-pressed="${code === lang}">${label}</button>`).join('');
    box.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setLang(b.dataset.lang); });
    if (append) host.append(box); else host.prepend(box);
  }
  started = true;
  translateAll();
  const pending = new Set();
  let scheduled = false;
  new MutationObserver(records => {
    for (const r of records) {
      const el = r.type === 'characterData' ? r.target.parentElement : r.target;
      if (el && el.nodeType === 1) pending.add(el);
    }
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        const items = [...pending]; pending.clear();
        if (lang === 'en') return;
        for (const el of items) {
          if (!el.isConnected || el.closest(SKIP)) continue;
          if (ours.get(el) === el.innerHTML) continue;
          visit(el);
        }
      });
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true });
}
