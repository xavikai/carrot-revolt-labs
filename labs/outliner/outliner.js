// Outliner Lab: a Blender scene as the Outliner sees it: collections, objects, restriction toggles, filters
// and data-blocks. No DOM, no three.js, so it can be tested.
//
// Rules, as in Blender:
//   · An object can live in several collections (linked); moving it takes it out of all the others.
//   · A collection hides its contents: Exclude (checkbox) and Hide in Viewport (eye) act on the view layer,
//     Disable in Viewports (monitor) and Disable in Renders (camera) everywhere. An object is drawn if at
//     least one of its collections is visible all the way up to the Scene Collection.
//   · Selectable (arrow) off on an object or any of its collections: it cannot be clicked in the viewport.
//   · A Collection Instance is an Empty that draws a whole collection at its place, even if that collection
//     is excluded from the view layer.
//   · Data-blocks have users; with 0 users (and no Fake User) they are Unused Data and Purge deletes them.

export const ROOT = 'Scene Collection';
export const COLOR_TAGS = { none: null, red: '#e2574c', orange: '#e8923a', yellow: '#e3c54d', green: '#6cbf5a', blue: '#4f8fe0', violet: '#9b6fe0', pink: '#e070b0', brown: '#9b7552' };
const clone = o => JSON.parse(JSON.stringify(o));

// ─── Building a scene ────────────────────────────────────────────────────────
export function makeCollection(name, o = {}) {
  return { name, children: [], objects: [], color: 'none', exclude: false, hide: false, disableViewport: false, disableRender: false, selectable: true, holdout: false, indirectOnly: false, exporters: [], ...o };
}
export function makeObject(name, o = {}) {
  return { name, type: 'MESH', parts: [], loc: [0, 0, 0], parent: null, mesh: null, mats: [], hide: false, disableViewport: false, disableRender: false, selectable: true, instanceOf: null, ...o };
}
export function makeScene({ collections = [], objects = [], materials = {}, images = {}, meshes = {} }) {
  const s = { collections: {}, objects: {}, materials: clone(materials), images: clone(images), meshes: clone(meshes), sel: [], active: null, activeColl: ROOT, cursor: [0, 0, 0] };
  s.collections[ROOT] = makeCollection(ROOT);
  for (const c of collections) s.collections[c.name] = makeCollection(c.name, c);
  for (const c of Object.values(s.collections)) for (const ch of c.children) if (!s.collections[ch]) s.collections[ch] = makeCollection(ch);
  // collections not listed as a child go under the Scene Collection
  const kids = new Set(Object.values(s.collections).flatMap(c => c.children));
  for (const n of Object.keys(s.collections)) if (n !== ROOT && !kids.has(n)) s.collections[ROOT].children.push(n);
  for (const o of objects) { s.objects[o.name] = makeObject(o.name, o); if (o.in) { for (const c of [].concat(o.in)) s.collections[c].objects.push(o.name); delete s.objects[o.name].in; } else s.collections[ROOT].objects.push(o.name); }
  return s;
}

// ─── Queries ─────────────────────────────────────────────────────────────────
export const parentOf = (s, name) => Object.values(s.collections).find(c => c.children.includes(name))?.name || null;
export function pathTo(s, name) { const p = []; let n = name; while (n) { p.unshift(n); n = parentOf(s, n); } return p; }
export const collectionsOf = (s, obj) => Object.values(s.collections).filter(c => c.objects.includes(obj)).map(c => c.name);
export function descendants(s, name) { const out = []; const go = n => { for (const ch of s.collections[n].children) { out.push(ch); go(ch); } }; go(name); return out; }
// Is a collection visible all the way up? mode: 'viewport' or 'render'
export function collectionVisible(s, name, mode = 'viewport') {
  return pathTo(s, name).every(n => { const c = s.collections[n]; if (!c) return false; if (c.exclude) return false; return mode === 'render' ? !c.disableRender : !c.hide && !c.disableViewport; });
}
export const collectionSelectable = (s, name) => pathTo(s, name).every(n => s.collections[n].selectable);
export function objectVisible(s, name, mode = 'viewport') {
  const o = s.objects[name]; if (!o) return false;
  if (mode === 'render' ? o.disableRender : o.hide || o.disableViewport) return false;
  if (o.parent && !objectVisibleByParentRules(s, o)) return false;
  return collectionsOf(s, name).some(c => collectionVisible(s, c, mode));
}
function objectVisibleByParentRules() { return true; }
export const objectSelectable = (s, name) => { const o = s.objects[name]; return !!o && o.selectable && objectVisible(s, name) && collectionsOf(s, name).some(c => collectionSelectable(s, c) && collectionVisible(s, c)); };
// Everything drawn: objects (with their offset when drawn through a Collection Instance).
export function drawn(s, mode = 'viewport') {
  const out = [];
  for (const o of Object.values(s.objects)) {
    if (!objectVisible(s, o.name, mode)) continue;
    out.push({ obj: o, offset: [0, 0, 0], via: null });
    if (o.instanceOf && s.collections[o.instanceOf]) {
      const inst = s.collections[o.instanceOf], off = o.loc.map((v, k) => v - (inst.instanceOffset || [0, 0, 0])[k]);
      const inside = new Set([o.instanceOf, ...descendants(s, o.instanceOf)].flatMap(c => s.collections[c].objects));
      for (const n of inside) { const x = s.objects[n]; if (x && !(mode === 'render' ? x.disableRender : x.hide || x.disableViewport)) out.push({ obj: x, offset: off, via: o.name }); }
    }
  }
  return out;
}

// ─── Names (Blender adds .001, .002…) ────────────────────────────────────────
export function uniqueName(taken, base) {
  if (!taken.has(base)) return base;
  const stem = base.replace(/\.\d{3}$/, '');
  for (let i = 1; i < 1000; i++) { const n = `${stem}.${String(i).padStart(3, '0')}`; if (!taken.has(n)) return n; }
  return base + '_';
}
const allNames = s => new Set([...Object.keys(s.objects), ...Object.keys(s.collections)]);

// ─── Operators ───────────────────────────────────────────────────────────────
export const OPS = {
  // Outliner › right click › New Collection (inside the active collection)
  newCollection(s, parent = s.activeColl || ROOT, base = 'Collection') {
    const name = uniqueName(new Set(Object.keys(s.collections)), base);
    s.collections[name] = makeCollection(name); (s.collections[parent] || s.collections[ROOT]).children.push(name);
    return name;
  },
  rename(s, kind, from, to) {
    to = String(to || '').trim(); if (!to || to === from) return from;
    if (kind === 'collection') {
      if (from === ROOT) return from;
      const name = uniqueName(new Set(Object.keys(s.collections).filter(n => n !== from)), to);
      const c = s.collections[from]; delete s.collections[from]; c.name = name; s.collections[name] = c;
      for (const x of Object.values(s.collections)) x.children = x.children.map(n => (n === from ? name : n));
      for (const o of Object.values(s.objects)) if (o.instanceOf === from) o.instanceOf = name;
      if (s.activeColl === from) s.activeColl = name;
      return name;
    }
    if (kind === 'object') {
      const name = uniqueName(new Set(Object.keys(s.objects).filter(n => n !== from)), to);
      const o = s.objects[from]; delete s.objects[from]; o.name = name; s.objects[name] = o;
      for (const c of Object.values(s.collections)) c.objects = c.objects.map(n => (n === from ? name : n));
      for (const x of Object.values(s.objects)) if (x.parent === from) x.parent = name;
      s.sel = s.sel.map(n => (n === from ? name : n)); if (s.active === from) s.active = name;
      return name;
    }
    const bag = kind === 'material' ? s.materials : kind === 'image' ? s.images : s.meshes;
    const name = uniqueName(new Set(Object.keys(bag).filter(n => n !== from)), to);
    bag[name] = bag[from]; delete bag[from];
    if (kind === 'material') for (const o of Object.values(s.objects)) o.mats = o.mats.map(m => (m === from ? name : m));
    if (kind === 'image') for (const m of Object.values(s.materials)) m.images = (m.images || []).map(i => (i === from ? name : i));
    if (kind === 'mesh') for (const o of Object.values(s.objects)) if (o.mesh === from) o.mesh = name;
    return name;
  },
  // M: Move to Collection (out of every other collection)
  moveTo(s, names, target) { if (!s.collections[target]) return; for (const n of names) { for (const c of Object.values(s.collections)) c.objects = c.objects.filter(x => x !== n); s.collections[target].objects.push(n); } },
  // Shift M / Ctrl drag: Link to Collection (one more collection, same object)
  linkTo(s, names, target) { if (!s.collections[target]) return; for (const n of names) if (!s.collections[target].objects.includes(n)) s.collections[target].objects.push(n); },
  // Unlink from one collection (never the last one: the object would leave the scene)
  unlink(s, name, coll) { if (collectionsOf(s, name).length < 2) return false; s.collections[coll].objects = s.collections[coll].objects.filter(x => x !== name); return true; },
  // Drag a collection onto another one
  nestCollection(s, name, target) {
    if (name === ROOT || name === target || descendants(s, name).includes(target) || !s.collections[target]) return false;
    for (const c of Object.values(s.collections)) c.children = c.children.filter(x => x !== name);
    s.collections[target].children.push(name); return true;
  },
  // Delete a collection: its objects and child collections go to its parent
  deleteCollection(s, name) {
    if (name === ROOT) return;
    const parent = parentOf(s, name) || ROOT, c = s.collections[name], p = s.collections[parent];
    p.children = p.children.filter(x => x !== name).concat(c.children);
    for (const o of c.objects) if (!p.objects.includes(o)) p.objects.push(o);
    delete s.collections[name];
    for (const o of Object.values(s.objects)) if (o.instanceOf === name) o.instanceOf = null;
    if (s.activeColl === name) s.activeColl = parent;
  },
  deleteObjects(s, names) { for (const n of names) { delete s.objects[n]; for (const c of Object.values(s.collections)) c.objects = c.objects.filter(x => x !== n); for (const o of Object.values(s.objects)) if (o.parent === n) o.parent = null; } s.sel = s.sel.filter(n => !names.includes(n)); if (names.includes(s.active)) s.active = null; },
  // Add › Collection Instance: an Empty at the 3D cursor, in the active collection
  addInstance(s, coll) {
    const name = uniqueName(new Set(Object.keys(s.objects)), coll);
    s.objects[name] = makeObject(name, { type: 'EMPTY', loc: [...s.cursor], instanceOf: coll });
    s.collections[s.activeColl]?.objects.push(name) ?? s.collections[ROOT].objects.push(name);
    return name;
  },
  cursorToSelected(s) { const o = s.objects[s.active]; if (o) s.cursor = [...o.loc]; },
  // Restriction toggles. Shift: the collection and everything inside. Ctrl on an eye: isolate.
  toggle(s, kind, name, prop, { shift = false } = {}) {
    const target = kind === 'collection' ? s.collections[name] : s.objects[name]; if (!target) return;
    const v = !target[prop]; target[prop] = v;
    if (shift && kind === 'collection') for (const d of descendants(s, name)) { s.collections[d][prop] = v; for (const o of s.collections[d].objects) if (prop in s.objects[o]) s.objects[o][prop] = v; }
    if (shift && kind === 'collection') for (const o of target.objects) if (prop in s.objects[o]) s.objects[o][prop] = v;
  },
  isolate(s, name) {
    const keep = new Set([...pathTo(s, name), ...descendants(s, name)]);
    for (const c of Object.values(s.collections)) if (c.name !== ROOT) c.hide = !keep.has(c.name);
  },
  hideSelected(s) { for (const n of s.sel) if (s.objects[n]) s.objects[n].hide = true; },
  unhideAll(s) { for (const o of Object.values(s.objects)) o.hide = false; for (const c of Object.values(s.collections)) c.hide = false; },
  // Blender File › right click › Remap Users
  remapUsers(s, kind, from, to) {
    if (kind === 'material') for (const o of Object.values(s.objects)) o.mats = o.mats.map(m => (m === from ? to : m));
    if (kind === 'image') for (const m of Object.values(s.materials)) m.images = (m.images || []).map(i => (i === from ? to : i));
    if (kind === 'mesh') for (const o of Object.values(s.objects)) if (o.mesh === from) o.mesh = to;
  },
  setMaterial(s, obj, slot, mat) { const o = s.objects[obj]; if (o && slot < o.mats.length) o.mats[slot] = mat; },
  toggleFake(s, kind, name) { const b = bagOf(s, kind); if (b[name]) b[name].fake = !b[name].fake; },
  // Unused Data › Purge (Recursive also removes what becomes unused)
  purge(s, recursive = true) {
    const removed = [];
    for (;;) {
      // what is unused now; what becomes unused by deleting it waits for the next round (Recursive only)
      const now = unusedData(s).filter(u => !u.fake);
      if (!now.length) break;
      for (const u of now) { delete bagOf(s, u.kind)[u.name]; removed.push(`${u.kind}:${u.name}`); }
      if (!recursive) break;
    }
    return removed;
  },
};
const bagOf = (s, kind) => (kind === 'material' ? s.materials : kind === 'image' ? s.images : s.meshes);

// ─── Data-blocks and their users ─────────────────────────────────────────────
export function users(s, kind, name) {
  const d = bagOf(s, kind)[name]; if (!d) return 0;
  let n = 0;
  if (kind === 'material') for (const o of Object.values(s.objects)) n += o.mats.filter(m => m === name).length ? 1 : 0;
  if (kind === 'image') for (const m of Object.values(s.materials)) if ((m.images || []).includes(name)) n++;
  if (kind === 'mesh') for (const o of Object.values(s.objects)) if (o.mesh === name) n++;
  return n;
}
export const totalUsers = (s, kind, name) => users(s, kind, name) + (bagOf(s, kind)[name]?.fake ? 1 : 0);
export function unusedData(s) {
  const out = [];
  for (const kind of ['material', 'mesh', 'image']) for (const [name, d] of Object.entries(bagOf(s, kind))) if (users(s, kind, name) === 0) out.push({ kind, name, fake: !!d.fake });
  return out;
}

// ─── The Outliner's rows ─────────────────────────────────────────────────────
// A tree of rows for the chosen display mode, then filtered as the Filter popover and the search say.
export const DEFAULT_FILTER = {
  search: '', exact: false, caseSensitive: false, sortAlpha: true, syncSelection: true,
  collections: true, objects: true, objectState: 'All', contents: false, children: true,
  types: { MESH: true, LIGHT: true, CAMERA: true, EMPTY: true, OTHER: true },
  columns: { exclude: true, selectable: false, hide: true, disableViewport: false, disableRender: false, holdout: false, indirectOnly: false },
};
const OBJ_TYPE_KEY = t => (['MESH', 'LIGHT', 'CAMERA', 'EMPTY'].includes(t) ? t : 'OTHER');
function objectRows(s, name, f, depth, seen) {
  const o = s.objects[name], kids = [];
  if (f.contents) {
    if (o.mesh) kids.push({ kind: 'mesh', name: o.mesh, depth: depth + 1, children: [] });
    o.mats.forEach((m, i) => kids.push({ kind: 'material', name: m, depth: depth + 1, slot: i, owner: name, children: [] }));
    if (o.instanceOf) kids.push({ kind: 'instance', name: o.instanceOf, depth: depth + 1, children: [] });
  }
  if (f.children) for (const ch of Object.values(s.objects).filter(x => x.parent === name)) if (!seen.has(ch.name)) { seen.add(ch.name); kids.push(objectRows(s, ch.name, f, depth + 1, seen)); }
  return { kind: 'object', name, type: o.type, depth, children: kids };
}
function keepObject(s, name, f) {
  const o = s.objects[name];
  if (!f.types[OBJ_TYPE_KEY(o.type)]) return false;
  if (f.objectState === 'Visible' && !objectVisible(s, name)) return false;
  if (f.objectState === 'Selected' && !s.sel.includes(name)) return false;
  if (f.objectState === 'Active' && s.active !== name) return false;
  if (f.objectState === 'Selectable' && !objectSelectable(s, name)) return false;
  return true;
}
function collectionRows(s, name, f, depth) {
  const c = s.collections[name], rows = [];
  const kids = f.collections ? [...c.children] : [];
  if (f.sortAlpha) kids.sort((a, b) => a.localeCompare(b));
  for (const ch of kids) rows.push(collectionRows(s, ch, f, depth + 1));
  if (f.objects) {
    const inColl = f.collections ? c.objects : [c.name, ...descendants(s, c.name)].flatMap(n => s.collections[n].objects);
    const seen = new Set();
    let names = [...new Set(inColl)].filter(n => s.objects[n] && keepObject(s, n, f));
    // with Object Children, a child is listed under its parent when the parent is in the same list
    if (f.children) names = names.filter(n => !s.objects[n].parent || !names.includes(s.objects[n].parent));
    if (f.sortAlpha) names.sort((a, b) => a.localeCompare(b));
    for (const n of names) { seen.add(n); rows.push(objectRows(s, n, f, depth + 1, seen)); }
  }
  return { kind: 'collection', name, depth, children: rows };
}
export function viewLayerTree(s, f = DEFAULT_FILTER) {
  if (!f.collections) return collectionRows(s, ROOT, f, 0);
  return collectionRows(s, ROOT, f, 0);
}
export const DATA_KINDS = [['collection', 'Collections'], ['image', 'Images'], ['material', 'Materials'], ['mesh', 'Meshes'], ['object', 'Objects']];
export function blenderFileTree(s) {
  const kids = DATA_KINDS.map(([kind, label]) => {
    const names = kind === 'collection' ? Object.keys(s.collections).filter(n => n !== ROOT) : kind === 'object' ? Object.keys(s.objects) : Object.keys(bagOf(s, kind));
    return { kind: 'category', name: label, cat: kind, depth: 1, children: names.sort((a, b) => a.localeCompare(b)).map(n => ({ kind, name: n, depth: 2, children: [] })) };
  });
  return { kind: 'file', name: 'Current File', depth: 0, children: kids };
}
export function unusedTree(s) {
  const list = unusedData(s), cats = [['image', 'Images'], ['material', 'Materials'], ['mesh', 'Meshes']];
  return { kind: 'file', name: 'Unused Data', depth: 0, children: cats.map(([kind, label]) => ({ kind: 'category', name: label, cat: kind, depth: 1, children: list.filter(x => x.kind === kind).map(x => ({ kind, name: x.name, depth: 2, children: [], fake: x.fake })) })).filter(c => c.children.length) };
}
// Search: keep the rows that match and the rows on the way to them.
export function searchTree(tree, f) {
  if (!f.search) return tree;
  const q = f.caseSensitive ? f.search : f.search.toLowerCase();
  const match = n => { const x = f.caseSensitive ? n : n.toLowerCase(); return f.exact ? x === q : x.includes(q); };
  const go = r => { const kids = r.children.map(go).filter(Boolean); if (match(r.name) || kids.length || r.depth === 0) return { ...r, children: kids, hit: match(r.name) }; return null; };
  return go(tree);
}
export function flatten(tree, collapsed = {}) {
  const out = [];
  const go = (r, path) => { const key = `${path}/${r.kind}:${r.name}`; out.push({ ...r, key }); if (!collapsed[key]) for (const c of r.children) go(c, key); };
  go(tree, '');
  return out;
}
