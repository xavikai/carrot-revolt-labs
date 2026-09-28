// Tileable Texture Lab: the Photoshop-style workspace (menus, tools, options bar, Layers and a lab check panel).
import { composite, copyImage, crop, resize, offset, gaussianBlur, desaturate, invert, stroke, BLEND_MODES, isPow2, SEAM_OK, SEAM_SEG } from './texture.js?v=2';
import { flat, lightReport, sizeReport, seamOf, stainOf, seamIn } from './stages.js?v=2';
import { t, tr } from '../../i18n.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

const ICONS = {
  move: '<path d="M8 1v14M1 8h14M8 1 6 3M8 1l2 2M8 15l-2-2M8 15l2-2M1 8l2-2M1 8l2 2M15 8l-2-2M15 8l-2 2"/>',
  marquee: '<rect x="2.5" y="3.5" width="11" height="9" stroke-dasharray="2 1.5"/>',
  crop: '<path d="M4 1v11h11M1 4h11v11"/>',
  clone: '<path d="M5 2h6v3H5zM7 5v4M3 9h10v2H3zM4 11v3h8v-3"/>',
  heal: '<rect x="1.5" y="5.5" width="13" height="5" rx="2.5" transform="rotate(-35 8 8)"/><path d="M6.6 7.2l2.8 1.6M7.2 9.4l1.6-2.8"/>',
  hand: '<path d="M5 8V3.5a1 1 0 0 1 2 0V8M7 7V2.5a1 1 0 0 1 2 0V7M9 7V3.5a1 1 0 0 1 2 0V9M5 8V6a1 1 0 0 0-2 0v4c0 3 2 5 5 5s4-2 4-5V6a1 1 0 0 0-2 0"/>',
  zoom: '<circle cx="6.5" cy="6.5" r="4.5"/><path d="M10 10l5 5M4.5 6.5h4M6.5 4.5v4"/>',
};
const TOOLS = [
  { id: 'move', name: 'Move Tool', key: 'V', off: true },
  { id: 'marquee', name: 'Rectangular Marquee Tool', key: 'M', off: true },
  { id: 'crop', name: 'Crop Tool', key: 'C' },
  { id: 'clone', name: 'Clone Stamp Tool', key: 'S' },
  { id: 'heal', name: 'Healing Brush Tool', key: 'J' },
  { id: 'hand', name: 'Hand Tool', key: 'H' },
  { id: 'zoom', name: 'Zoom Tool', key: 'Z' },
];
const RATIOS = { free: null, '1:1': 1, '4:3': 4 / 3, '16:9': 16 / 9 };

export function createPS(ctx) {
  const canvas = $('#ps-canvas'), host = $('#ps-host'), g = canvas.getContext('2d');
  const doc = document.createElement('canvas'), dg = doc.getContext('2d');
  const U = {
    tool: 'crop', z: 0.5, ox: 0, oy: 0, dirty: true, pattern: false, seamOverlay: true,
    brush: { size: 70, hard: 20, aligned: true }, source: null, srcOff: null, stroke: null,
    crop: null, ratio: 'free', dragCrop: null, pan: null, space: false, mouse: null, preview: null, busy: false,
  };
  const st = () => ctx.S.st;
  const layer = () => st().layers[st().active];
  const docSize = () => { const im = st().layers[0].img; return [im.w, im.h]; };

  // ─── Document canvas ───────────────────────────────────────────────────────
  let flatCache = null;
  function refreshDoc() {
    const im = U.preview || flat(st()); flatCache = im;
    if (doc.width !== im.w || doc.height !== im.h) { doc.width = im.w; doc.height = im.h; }
    dg.putImageData(new ImageData(im.d, im.w, im.h), 0, 0); U.dirty = true;
  }
  function refreshRect(r) {
    if (!r) return; const im = layer().img;
    if (st().layers.length > 1) { refreshDoc(); return; }
    dg.putImageData(new ImageData(im.d, im.w, im.h), 0, 0, r[0], r[1], r[2], r[3]); U.dirty = true;
  }
  function fit() {
    const [w, h] = docSize(), W = host.clientWidth, H = host.clientHeight;
    U.z = Math.min((W - 40) / w, (H - 40) / h); if (U.pattern) U.z /= 2.2;
    U.ox = (W - w * U.z) / 2; U.oy = (H - h * U.z) / 2; U.dirty = true;
  }
  const toDoc = (x, y) => [(x - U.ox) / U.z, (y - U.oy) / U.z];
  const toScr = (x, y) => [U.ox + x * U.z, U.oy + y * U.z];
  function resizeCanvas() { const w = host.clientWidth, h = host.clientHeight, dpr = Math.min(2, devicePixelRatio || 1); canvas.width = w * dpr; canvas.height = h * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); U.dirty = true; }
  new ResizeObserver(() => { resizeCanvas(); if (ctx.S.st?.app === 'ps') fit(); }).observe(host);

  function draw() {
    const W = host.clientWidth, H = host.clientHeight, [w, h] = [doc.width, doc.height];
    g.fillStyle = '#1e1e1e'; g.fillRect(0, 0, W, H);
    if (!w) return;
    g.imageSmoothingEnabled = U.z < 2; g.imageSmoothingQuality = 'high';
    const [x0, y0] = toScr(0, 0), sw = w * U.z, sh = h * U.z;
    if (U.pattern) {
      const k0 = Math.floor(-x0 / sw) - 1, k1 = Math.ceil((W - x0) / sw), j0 = Math.floor(-y0 / sh) - 1, j1 = Math.ceil((H - y0) / sh);
      for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) g.drawImage(doc, x0 + k * sw, y0 + j * sh, sw, sh);
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.setLineDash([5, 5]); g.strokeRect(x0 + 0.5, y0 + 0.5, sw, sh); g.setLineDash([]);
    } else {
      g.fillStyle = '#000'; g.fillRect(x0 - 1, y0 - 1, sw + 2, sh + 2);
      g.drawImage(doc, x0, y0, sw, sh);
    }
    drawSeamOverlay(x0, y0, sw, sh);
    drawCrop();
    drawBrush();
  }
  function drawSeamOverlay(x0, y0) {
    const s = st(), id = ctx.stepId();
    if (!s.seam || !U.seamOverlay || U.preview || !(id === 's2' || id === 's3')) return;
    const rep = seamCache(); if (!rep) return;
    const [w, h] = docSize(), seg = SEAM_SEG;
    g.lineWidth = 3;
    rep.v.forEach((r, i) => { g.strokeStyle = r > SEAM_OK ? 'rgba(255,70,60,.85)' : 'rgba(90,220,120,.7)'; g.beginPath(); g.moveTo(x0 + s.seam.x * U.z, y0 + i * seg * U.z + 1); g.lineTo(x0 + s.seam.x * U.z, y0 + Math.min(h, (i + 1) * seg) * U.z - 1); g.stroke(); });
    rep.h.forEach((r, i) => { g.strokeStyle = r > SEAM_OK ? 'rgba(255,70,60,.85)' : 'rgba(90,220,120,.7)'; g.beginPath(); g.moveTo(x0 + i * seg * U.z + 1, y0 + s.seam.y * U.z); g.lineTo(x0 + Math.min(w, (i + 1) * seg) * U.z - 1, y0 + s.seam.y * U.z); g.stroke(); });
    if (s.stain && id === 's3') { const [cx, cy] = toScr(s.stain.x, s.stain.y), ok = stainOf(s) >= 0.9; if (!ok && U.pattern) { g.strokeStyle = 'rgba(255,200,60,.9)'; g.lineWidth = 2; g.setLineDash([4, 3]); g.beginPath(); g.arc(cx, cy, s.stain.r * 2.2 * U.z, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); } }
    g.lineWidth = 1;
  }
  let seamMemo = { ver: -1, rep: null };
  function seamCache() { if (seamMemo.ver !== ctx.S.ver) seamMemo = { ver: ctx.S.ver, rep: seamOf(st()) }; return seamMemo.rep; }
  function drawCrop() {
    if (U.tool !== 'crop' || !U.crop) return;
    const W = host.clientWidth, H = host.clientHeight, c = U.crop, [x, y] = toScr(c.x, c.y), w = c.w * U.z, h = c.h * U.z;
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, W, y); g.fillRect(0, y + h, W, H - y - h); g.fillRect(0, y, x, h); g.fillRect(x + w, y, W - x - w, h);
    g.strokeStyle = '#fff'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w, h);
    g.strokeStyle = 'rgba(255,255,255,.4)'; g.beginPath();
    for (const k of [1, 2]) { g.moveTo(x + w * k / 3, y); g.lineTo(x + w * k / 3, y + h); g.moveTo(x, y + h * k / 3); g.lineTo(x + w, y + h * k / 3); } g.stroke();
    g.fillStyle = '#fff'; for (const [hx, hy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) g.fillRect(hx - 4, hy - 4, 8, 8);
    const label = `W: ${Math.round(c.w)} px  H: ${Math.round(c.h)} px`;
    g.font = '12px Inter, Segoe UI, sans-serif'; const tw = g.measureText(label).width;
    g.fillStyle = 'rgba(20,20,20,.85)'; g.fillRect(x + w / 2 - tw / 2 - 6, y + h + 8, tw + 12, 20); g.fillStyle = '#fff'; g.fillText(label, x + w / 2 - tw / 2, y + h + 22);
  }
  function drawBrush() {
    if (!U.mouse || !(U.tool === 'clone' || U.tool === 'heal') || U.space) return;
    const [mx, my] = U.mouse, r = U.brush.size / 2 * U.z;
    g.strokeStyle = '#fff'; g.lineWidth = 1; g.beginPath(); g.arc(mx, my, r, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = '#000a'; g.beginPath(); g.arc(mx, my, r + 1, 0, Math.PI * 2); g.stroke();
    if (U.brush.hard < 95) { g.strokeStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(mx, my, r * U.brush.hard / 100, 0, Math.PI * 2); g.stroke(); }
    // Source crosshair: where the pixels come from.
    let src = null;
    if (U.stroke) { const [dx, dy] = toDoc(mx, my); src = [dx + U.stroke.ox, dy + U.stroke.oy]; }
    else if (U.source && U.srcOff && U.brush.aligned) { const [dx, dy] = toDoc(mx, my); src = [dx + U.srcOff[0], dy + U.srcOff[1]]; }
    else if (U.source) src = [U.source.x, U.source.y];
    if (src) {
      const [sx, sy] = toScr(...src);
      g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(sx - 8, sy); g.lineTo(sx + 8, sy); g.moveTo(sx, sy - 8); g.lineTo(sx, sy + 8); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.setLineDash([3, 3]); g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    }
  }
  (function loop() { requestAnimationFrame(loop); if (U.dirty && !$('#ps').hidden) { U.dirty = false; draw(); } })();

  // ─── Pointer ───────────────────────────────────────────────────────────────
  const inDoc = (x, y) => { const [w, h] = docSize(); return x >= 0 && y >= 0 && x < w && y < h; };
  const wrapDoc = (x, y) => { const [w, h] = docSize(); return U.pattern ? [((x % w) + w) % w, ((y % h) + h) % h] : [x, y]; };
  canvas.addEventListener('pointerdown', e => {
    if (U.busy) return;
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    canvas.setPointerCapture(e.pointerId);
    if (e.button === 1 || U.space || U.tool === 'hand') { U.pan = { x: e.clientX, y: e.clientY, ox: U.ox, oy: U.oy }; e.preventDefault(); return; }
    if (e.button !== 0) return;
    const [dx, dy] = wrapDoc(...toDoc(x, y));
    if (U.tool === 'zoom') { zoomAt(x, y, e.altKey ? 1 / 1.5 : 1.5); return; }
    if (U.tool === 'crop') { cropDown(dx, dy, ...toDoc(x, y)); return; }
    if (U.tool === 'clone' || U.tool === 'heal') {
      if (e.altKey || U.pickSource) { if (!inDoc(dx, dy)) return; if (U.pickSource) { U.pickSource = false; renderOptions(); } U.source = { x: dx, y: dy }; U.srcOff = null; ctx.msg(tr('Source set at {a}, {b} px.', { a: Math.round(dx), b: Math.round(dy) })); U.dirty = true; return; }
      if (!U.source) { ctx.msg('Alt-click to define a source point first, as in Photoshop.', true); return; }
      if (!inDoc(dx, dy)) return;
      let off = U.brush.aligned && U.srcOff ? U.srcOff : [U.source.x - dx, U.source.y - dy];
      if (U.brush.aligned) U.srcOff = off;
      ctx.pushUndo();
      U.stroke = { ox: off[0], oy: off[1], src: copyImage(layer().img), last: [dx, dy] };
      paintSeg([dx, dy], [dx, dy]);
    }
  });
  function paintSeg(a, b) {
    const s = U.stroke, rad = U.brush.size / 2, im = layer().img;
    stroke(im, s.src, [a, b], s.ox, s.oy, rad, U.brush.hard / 100, U.tool === 'heal');
    const x0 = Math.floor(Math.min(a[0], b[0]) - rad - 2), y0 = Math.floor(Math.min(a[1], b[1]) - rad - 2), x1 = Math.ceil(Math.max(a[0], b[0]) + rad + 2), y1 = Math.ceil(Math.max(a[1], b[1]) + rad + 2);
    const cx0 = clamp(x0, 0, im.w), cy0 = clamp(y0, 0, im.h);
    refreshRect([cx0, cy0, clamp(x1, 0, im.w) - cx0, clamp(y1, 0, im.h) - cy0]);
  }
  canvas.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    U.mouse = [x, y]; U.dirty = true;
    if (U.pan) { U.ox = U.pan.ox + e.clientX - U.pan.x; U.oy = U.pan.oy + e.clientY - U.pan.y; return; }
    if (U.dragCrop) { cropMove(...toDoc(x, y), e.shiftKey); return; }
    if (U.stroke) {
      // In Pattern Preview a stroke that crosses into the next copy jumps to the other side of the document: start again there.
      const cur = wrapDoc(...toDoc(x, y)), [w] = docSize();
      if (Math.hypot(cur[0] - U.stroke.last[0], cur[1] - U.stroke.last[1]) < w / 3) paintSeg(U.stroke.last, cur);
      U.stroke.last = cur;
    }
    canvas.style.cursor = U.space || U.tool === 'hand' ? (U.pan ? 'grabbing' : 'grab') : U.tool === 'clone' || U.tool === 'heal' ? 'none' : U.tool === 'zoom' ? 'zoom-in' : 'crosshair';
  });
  canvas.addEventListener('pointerleave', () => { U.mouse = null; U.dirty = true; });
  window.addEventListener('pointerup', () => {
    if (U.pan) U.pan = null;
    if (U.dragCrop) { U.dragCrop = null; renderOptions(); }
    if (U.stroke) { U.stroke = null; ctx.changed('paint'); }
  });
  canvas.addEventListener('wheel', e => { e.preventDefault(); const r = canvas.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY > 0 ? 1 / 1.15 : 1.15); }, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  function zoomAt(x, y, k) { const z = clamp(U.z * k, 0.05, 16), f = z / U.z; U.ox = x - (x - U.ox) * f; U.oy = y - (y - U.oy) * f; U.z = z; U.dirty = true; renderDocbar(); }

  // ─── Crop ──────────────────────────────────────────────────────────────────
  function cropDown(dx, dy, rx, ry) {
    const c = U.crop, hs = 8 / U.z;
    if (c) {
      const corners = [[c.x, c.y, 'tl'], [c.x + c.w, c.y, 'tr'], [c.x, c.y + c.h, 'bl'], [c.x + c.w, c.y + c.h, 'br']];
      const hit = corners.find(([hx, hy]) => Math.abs(rx - hx) < hs && Math.abs(ry - hy) < hs);
      if (hit) { const opp = { tl: [c.x + c.w, c.y + c.h], tr: [c.x, c.y + c.h], bl: [c.x + c.w, c.y], br: [c.x, c.y] }[hit[2]]; U.dragCrop = { mode: 'new', ax: opp[0], ay: opp[1] }; return; }
      if (rx > c.x && ry > c.y && rx < c.x + c.w && ry < c.y + c.h) { U.dragCrop = { mode: 'move', sx: rx, sy: ry, cx: c.x, cy: c.y }; return; }
    }
    const [w, h] = docSize();
    U.dragCrop = { mode: 'new', ax: clamp(rx, 0, w), ay: clamp(ry, 0, h) }; U.crop = { x: U.dragCrop.ax, y: U.dragCrop.ay, w: 0, h: 0 };
  }
  function cropMove(rx, ry, shift) {
    const d = U.dragCrop, [W, H] = docSize(), c = U.crop;
    if (d.mode === 'move') { c.x = clamp(d.cx + rx - d.sx, 0, W - c.w); c.y = clamp(d.cy + ry - d.sy, 0, H - c.h); U.dirty = true; return; }
    let bx = clamp(rx, 0, W), by = clamp(ry, 0, H);
    const ratio = shift ? 1 : RATIOS[U.ratio];
    let w = Math.abs(bx - d.ax), h = Math.abs(by - d.ay);
    if (ratio) {
      const sx = Math.sign(bx - d.ax) || 1, sy = Math.sign(by - d.ay) || 1;
      if (w / ratio > h) h = w / ratio; else w = h * ratio;
      const maxW = sx > 0 ? W - d.ax : d.ax, maxH = sy > 0 ? H - d.ay : d.ay;
      if (w > maxW) { w = maxW; h = w / ratio; } if (h > maxH) { h = maxH; w = h * ratio; }
      bx = d.ax + sx * w; by = d.ay + sy * h;
    }
    c.x = Math.round(Math.min(d.ax, bx)); c.y = Math.round(Math.min(d.ay, by)); c.w = Math.round(Math.abs(bx - d.ax)); c.h = Math.round(Math.abs(by - d.ay));
    if (ratio === 1) c.h = c.w;
    U.dirty = true; renderOptionsReadout();
  }
  function commitCrop() {
    const c = U.crop; if (!c || c.w < 8 || c.h < 8) { ctx.msg('Drag a rectangle on the image first.', true); return; }
    ctx.pushUndo();
    for (const L of st().layers) L.img = crop(L.img, c.x, c.y, c.w, c.h);
    st().cropSide = c.w === c.h ? c.w : null;
    U.crop = null; ctx.msg(tr('Cropped to {a} × {b} px.', { a: c.w, b: c.h })); fit(); ctx.changed('crop');
  }
  function cancelCrop() { U.crop = null; U.dirty = true; renderOptions(); }

  // ─── Operations ────────────────────────────────────────────────────────────
  function busy(fn) { U.busy = true; $('#ps-busy').hidden = false; setTimeout(() => { try { fn(); } finally { U.busy = false; $('#ps-busy').hidden = true; } }, 20); }
  const onBackground = () => layer().bg;
  const OPS = {
    undo: () => ctx.undo(), redo: () => ctx.redo(),
    desaturate: () => busy(() => { ctx.pushUndo(); layer().img = desaturate(layer().img); ctx.msg(tr('Desaturate: {n}.', { n: layer().name })); ctx.changed('adjust'); }),
    invert: () => busy(() => { ctx.pushUndo(); layer().img = invert(layer().img); ctx.msg(tr('Invert: {n}.', { n: layer().name })); ctx.changed('adjust'); }),
    imageSize: () => dialogImageSize(),
    duplicate: () => { ctx.pushUndo(); const L = layer(), s = st(); s.layers.splice(s.active + 1, 0, { name: L.bg ? 'Background copy' : L.name + ' copy', img: copyImage(L.img), blend: 'Normal', opacity: 1, visible: true }); s.active++; ctx.msg('Duplicate Layer.'); ctx.changed('layers'); },
    deleteLayer: () => { const s = st(); if (s.layers.length < 2 || onBackground()) { ctx.msg('The Background layer stays: add a layer above it instead.', true); return; } ctx.pushUndo(); s.layers.splice(s.active, 1); s.active = Math.max(0, s.active - 1); ctx.changed('layers'); },
    flatten: () => { const s = st(); if (s.layers.length < 2) return; busy(() => { ctx.pushUndo(); const im = copyImage(flat(s)); s.layers = [{ name: 'Background', img: im, blend: 'Normal', opacity: 1, visible: true, bg: true }]; s.active = 0; ctx.msg('Flatten Image: one layer again.'); ctx.changed('layers'); }); },
    blur: () => dialogBlur(),
    offset: () => dialogOffset(),
    pattern: () => { U.pattern = !U.pattern; if (U.pattern) st().flags.pattern = true; fit(); renderMenusState(); ctx.msg(U.pattern ? 'Pattern Preview: the document is shown repeated. You can paint on any copy.' : 'Pattern Preview off.'); ctx.changed('view'); },
    fit: () => fit(), actual: () => { const W = host.clientWidth, H = host.clientHeight, [w, h] = docSize(); U.z = 1; U.ox = (W - w) / 2; U.oy = (H - h) / 2; U.dirty = true; renderDocbar(); },
    seamOverlay: () => { U.seamOverlay = !U.seamOverlay; U.dirty = true; renderPanels(); },
  };
  const MENUS = {
    file: [['Open…', null, 'Ctrl+O'], ['Save As…', null, 'Shift+Ctrl+S'], ['Export', null]],
    edit: [['Undo', 'undo', 'Ctrl+Z'], ['Redo', 'redo', 'Shift+Ctrl+Z'], '-', ['Content-Aware Fill…', null], ['Fill…', null, 'Shift+F5']],
    image: [['#Adjustments'], ['Desaturate', 'desaturate', 'Shift+Ctrl+U'], ['Invert', 'invert', 'Ctrl+I'], ['Levels…', null, 'Ctrl+L'], '-', ['Image Size…', 'imageSize', 'Alt+Ctrl+I'], ['Canvas Size…', null, 'Alt+Ctrl+C']],
    layer: [['Duplicate Layer', 'duplicate', 'Ctrl+J'], ['Delete Layer', 'deleteLayer'], '-', ['Flatten Image', 'flatten']],
    select: [['All', null, 'Ctrl+A'], ['Deselect', null, 'Ctrl+D']],
    filter: [['#Blur'], ['Gaussian Blur…', 'blur'], ['#Other'], ['High Pass…', null], ['Offset…', 'offset'], '-', ['Filter Gallery…', null]],
    view: [['Pattern Preview', 'pattern', '', () => U.pattern], '-', ['Fit on Screen', 'fit', 'Ctrl+0'], ['100%', 'actual', 'Ctrl+1'], '-', ['Seam check (lab)', 'seamOverlay', '', () => U.seamOverlay]],
    window: [['Layers', null, 'F7'], ['Navigator', null]],
    help: [['Photoshop Help…', null]],
  };
  const menuEl = $('#ps-menu');
  let openMenu = null;
  function showMenu(name, btn) {
    if (openMenu === name) { closeMenu(); return; }
    openMenu = name;
    const wr = $('#workspace').getBoundingClientRect(), br = btn.getBoundingClientRect();
    menuEl.innerHTML = MENUS[name].map(it => {
      if (it === '-') return '<hr>';
      if (it[0][0] === '#') return `<div class="menu-sub">${esc(it[0].slice(1))}</div>`;
      const [label, op, key = '', checked] = it, on = checked ? checked() : null;
      return `<button type="button" role="menuitem" ${op ? `data-op="${op}"` : 'disabled title="Not used in this lab"'}${it[0].includes('…') || !op ? '' : ''}><span class="m-check">${on ? '✓' : ''}</span><span class="m-label">${esc(label)}</span><span class="m-key">${esc(key)}</span></button>`;
    }).join('');
    menuEl.style.left = `${br.left - wr.left}px`; menuEl.style.top = `${br.bottom - wr.top}px`; menuEl.hidden = false;
    for (const b of document.querySelectorAll('#ps-menubar [data-menu]')) b.setAttribute('aria-expanded', b.dataset.menu === name);
  }
  function closeMenu() { openMenu = null; menuEl.hidden = true; for (const b of document.querySelectorAll('#ps-menubar [data-menu]')) b.setAttribute('aria-expanded', 'false'); }
  const renderMenusState = () => { if (openMenu) { const n = openMenu; openMenu = null; showMenu(n, document.querySelector(`#ps-menubar [data-menu="${n}"]`)); } };
  $('#ps-menubar').addEventListener('click', e => { const b = e.target.closest('[data-menu]'); if (b) showMenu(b.dataset.menu, b); });
  $('#ps-menubar').addEventListener('pointerover', e => { const b = e.target.closest('[data-menu]'); if (b && openMenu && openMenu !== b.dataset.menu) showMenu(b.dataset.menu, b); });
  menuEl.addEventListener('click', e => { const b = e.target.closest('[data-op]'); if (!b) return; closeMenu(); OPS[b.dataset.op](); });
  document.addEventListener('pointerdown', e => { if (openMenu && !e.target.closest('#ps-menu, #ps-menubar')) closeMenu(); });

  // ─── Dialogs ───────────────────────────────────────────────────────────────
  const dlg = $('#ps-dialog');
  function openDialog(title, body, onOk, onCancel, onInput) {
    dlg.innerHTML = `<div class="ps-dlg" role="dialog" aria-label="${esc(title)}"><div class="ps-dlg-title" data-no-i18n>${esc(title)}</div><div class="ps-dlg-body">${body}</div><div class="ps-dlg-buttons"><button type="button" class="ps-btn primary" data-dlg="ok">OK</button><button type="button" class="ps-btn" data-dlg="cancel">Cancel</button></div></div>`;
    dlg.hidden = false;
    const close = () => { dlg.hidden = true; dlg.innerHTML = ''; dlg.onclick = dlg.oninput = dlg.onkeydown = null; };
    dlg.onclick = e => { const b = e.target.closest('[data-dlg]'); if (!b) return; if (b.dataset.dlg === 'ok') { const keep = onOk(); if (keep !== false) close(); } else { onCancel?.(); close(); } };
    dlg.oninput = e => onInput?.(e);
    dlg.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); dlg.querySelector('[data-dlg="ok"]').click(); } if (e.key === 'Escape') { e.preventDefault(); dlg.querySelector('[data-dlg="cancel"]').click(); } e.stopPropagation(); };
    setTimeout(() => dlg.querySelector('input')?.select(), 30);
  }
  const num = id => parseFloat(dlg.querySelector('#' + id)?.value);
  function dialogImageSize() {
    const [w, h] = docSize();
    openDialog('Image Size', `<p class="ps-dlg-info" data-no-i18n>Image Size: ${(w * h * 3 / 1048576).toFixed(1)} M · ${w} × ${h} px</p>
      <label class="ps-f"><span data-no-i18n>Width:</span><input id="is-w" type="number" min="16" max="4096" value="${w}"><em data-no-i18n>Pixels</em></label>
      <label class="ps-f"><span data-no-i18n>Height:</span><input id="is-h" type="number" min="16" max="4096" value="${h}"><em data-no-i18n>Pixels</em></label>
      <label class="ps-c"><input id="is-link" type="checkbox" checked><span data-no-i18n>Constrain proportions</span></label>
      <label class="ps-c"><input type="checkbox" checked disabled><span data-no-i18n>Resample: Automatic</span></label>`,
    () => {
      const W = Math.round(num('is-w')), H = Math.round(num('is-h'));
      if (!(W >= 16 && H >= 16 && W <= 4096 && H <= 4096)) { ctx.msg('Width and height must be between 16 and 4096 px.', true); return false; }
      if (W === w && H === h) return;
      busy(() => {
        ctx.pushUndo();
        const distort = Math.abs(W / H - w / h) > 0.005;
        for (const L of st().layers) L.img = resize(L.img, W, H);
        if (distort) st().flags.distorted = true;
        if (st().cropSide && W !== H) st().cropSide = null;
        ctx.msg(distort ? tr('Image Size: {a} × {b} px. The proportions changed: the photo is stretched.', { a: W, b: H }) : tr('Image Size: {a} × {b} px.', { a: W, b: H }), distort);
        fit(); ctx.changed('size');
      });
    }, null, e => {
      if (!dlg.querySelector('#is-link').checked) return;
      if (e.target.id === 'is-w') dlg.querySelector('#is-h').value = Math.round(num('is-w') * h / w);
      if (e.target.id === 'is-h') dlg.querySelector('#is-w').value = Math.round(num('is-h') * w / h);
    });
  }
  function dialogOffset() {
    const [w, h] = docSize();
    const prevMode = U.lastOffMode || 'background';
    openDialog('Offset', `<label class="ps-f"><span data-no-i18n>Horizontal:</span><input id="of-x" type="number" value="${U.lastOff?.[0] ?? 0}"><em data-no-i18n>pixels right</em></label>
      <label class="ps-f"><span data-no-i18n>Vertical:</span><input id="of-y" type="number" value="${U.lastOff?.[1] ?? 0}"><em data-no-i18n>pixels down</em></label>
      <fieldset class="ps-fs"><legend data-no-i18n>Undefined Areas</legend>
      ${[['background', 'Set to Background'], ['repeat', 'Repeat Edge Pixels'], ['wrap', 'Wrap Around']].map(([v, l]) => `<label class="ps-c"><input type="radio" name="of-m" value="${v}"${v === prevMode ? ' checked' : ''}><span data-no-i18n>${l}</span></label>`).join('')}</fieldset>
      <label class="ps-c"><input id="of-prev" type="checkbox" checked><span data-no-i18n>Preview</span></label>`,
    () => {
      const dx = Math.round(num('of-x') || 0), dy = Math.round(num('of-y') || 0), mode = dlg.querySelector('[name="of-m"]:checked').value;
      U.preview = null; U.lastOff = [dx, dy]; U.lastOffMode = mode;
      if (!dx && !dy) { refreshDoc(); return; }
      busy(() => {
        ctx.pushUndo();
        layer().img = offset(layer().img, dx, dy, mode);
        const s = st();
        if (mode === 'wrap') { if (s.seam) s.seam = { x: (((s.seam.x + dx) % w) + w) % w, y: (((s.seam.y + dy) % h) + h) % h }; if (s.stain) s.stain = { ...s.stain, x: (((s.stain.x + dx) % w) + w) % w, y: (((s.stain.y + dy) % h) + h) % h }; ctx.msg(tr('Offset {a}, {b} px with Wrap Around: nothing lost, the edges moved inside.', { a: dx, b: dy })); }
        else { s.flags.smeared = true; ctx.msg(mode === 'repeat' ? 'Repeat Edge Pixels smeared the last row of pixels into the gap. Undo (Ctrl Z) and use Wrap Around.' : 'Set to Background filled the gap with white. Undo (Ctrl Z) and use Wrap Around.', true); }
        ctx.changed('offset');
      });
    }, () => { U.preview = null; refreshDoc(); }, () => previewOffset());
    previewOffset();
  }
  let pvTimer;
  function previewOffset() {
    clearTimeout(pvTimer);
    pvTimer = setTimeout(() => {
      if (dlg.hidden) return;
      if (!dlg.querySelector('#of-prev')?.checked) { U.preview = null; refreshDoc(); return; }
      const dx = Math.round(num('of-x') || 0), dy = Math.round(num('of-y') || 0), mode = dlg.querySelector('[name="of-m"]:checked')?.value || 'wrap';
      const s = st(), layers = s.layers.map((L, i) => (i === s.active ? { ...L, img: offset(L.img, dx, dy, mode) } : L));
      U.preview = composite(layers); refreshDoc();
    }, 60);
  }
  function dialogBlur() {
    const r0 = U.lastBlur ?? 4;
    openDialog('Gaussian Blur', `<div class="ps-dlg-thumb" id="gb-note" data-no-i18n></div>
      <label class="ps-f"><span data-no-i18n>Radius:</span><input id="gb-r" type="number" min="0.1" max="250" step="0.1" value="${r0}"><em data-no-i18n>Pixels</em></label>
      <input id="gb-s" type="range" min="0" max="1000" value="${Math.round(Math.log(r0 / 0.1) / Math.log(2500) * 1000)}" aria-label="Radius">
      <label class="ps-c"><input id="gb-prev" type="checkbox" checked><span data-no-i18n>Preview</span></label>`,
    () => {
      const r = clamp(num('gb-r') || 0.1, 0.1, 250); U.lastBlur = r; U.preview = null;
      busy(() => { ctx.pushUndo(); layer().img = gaussianBlur(layer().img, r); ctx.msg(tr('Gaussian Blur: {a} px on {n}.', { a: r, n: layer().name })); ctx.changed('blur'); });
    }, () => { U.preview = null; refreshDoc(); }, e => {
      if (e.target.id === 'gb-s') dlg.querySelector('#gb-r').value = +(0.1 * Math.pow(2500, e.target.value / 1000)).toFixed(1);
      if (e.target.id === 'gb-r') dlg.querySelector('#gb-s').value = Math.round(Math.log(clamp(num('gb-r') || 0.1, 0.1, 250) / 0.1) / Math.log(2500) * 1000);
      previewBlur();
    });
    previewBlur();
  }
  function previewBlur() {
    clearTimeout(pvTimer);
    pvTimer = setTimeout(() => {
      if (dlg.hidden) return;
      if (!dlg.querySelector('#gb-prev')?.checked) { U.preview = null; refreshDoc(); return; }
      const r = clamp(num('gb-r') || 0.1, 0.1, 250), s = st(), layers = s.layers.map((L, i) => (i === s.active ? { ...L, img: gaussianBlur(L.img, r) } : L));
      U.preview = composite(layers); refreshDoc();
    }, 120);
  }

  // ─── Tools, options bar, panels ────────────────────────────────────────────
  function renderTools() {
    $('#ps-tools').innerHTML = TOOLS.map(tl => `<button type="button" data-tool="${tl.id}" aria-pressed="${U.tool === tl.id}" title="${esc(tl.name)} (${tl.key})"${tl.off ? ' class="off"' : ''}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[tl.id]}</svg></button>`).join('');
  }
  function setTool(id) {
    const tl = TOOLS.find(x => x.id === id); if (!tl) return;
    if (tl.off) { ctx.msg(tr('{n} is not needed in this lab.', { n: tl.name })); return; }
    U.tool = id; if (id !== 'crop') U.crop = null; renderTools(); renderOptions(); U.dirty = true;
  }
  $('#ps-tools').addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });
  function renderOptionsReadout() { const el = $('#crop-readout'); if (el) el.textContent = U.crop ? `${Math.round(U.crop.w)} × ${Math.round(U.crop.h)} px` : '—'; }
  function renderOptions() {
    const tl = TOOLS.find(x => x.id === U.tool); let h = `<span class="ps-opt-tool" data-no-i18n><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2">${ICONS[tl.id]}</svg>${esc(tl.name)}</span>`;
    if (U.tool === 'crop') {
      h += `<label class="ps-o" data-no-i18n><select id="o-ratio">${[['free', 'Ratio'], ['1:1', '1:1 (Square)'], ['4:3', '4 : 3'], ['16:9', '16 : 9']].map(([v, l]) => `<option value="${v}"${U.ratio === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <span class="ps-o ps-read" id="crop-readout" data-no-i18n></span>
        <label class="ps-o" data-no-i18n><input type="checkbox" checked disabled> Delete Cropped Pixels</label>
        <span class="ps-o-right"><button type="button" class="ps-btn" id="o-crop-cancel" title="Cancel (Esc)">⃠</button><button type="button" class="ps-btn primary" id="o-crop-ok" title="Commit (Enter)">✓</button></span>`;
    } else if (U.tool === 'clone' || U.tool === 'heal') {
      h += `<label class="ps-o"><span data-no-i18n>Size:</span><input type="range" id="o-size" min="4" max="300" value="${U.brush.size}"><output data-no-i18n>${U.brush.size} px</output></label>
        <label class="ps-o"><span data-no-i18n>Hardness:</span><input type="range" id="o-hard" min="0" max="100" value="${U.brush.hard}"><output data-no-i18n>${U.brush.hard}%</output></label>
        <label class="ps-o" data-no-i18n><input type="checkbox" id="o-aligned"${U.brush.aligned ? ' checked' : ''}> Aligned</label>
        <button type="button" class="ps-btn${U.pickSource ? ' primary' : ''}" id="o-src" title="Alt + click">${esc(t('Set source'))}</button>
        <span class="ps-o" data-no-i18n>Sample: Current Layer</span>
        <span class="ps-o ps-read" data-no-i18n>${U.tool === 'heal' ? 'Source: Sampled · Mode: Normal' : 'Mode: Normal · Opacity: 100%'}</span>`;
    } else if (U.tool === 'hand' || U.tool === 'zoom') {
      h += `<span class="ps-o-right"><button type="button" class="ps-btn" data-o="actual">100%</button><button type="button" class="ps-btn" data-o="fit">Fit Screen</button></span>`;
    }
    $('#ps-options').innerHTML = h; renderOptionsReadout();
  }
  $('#ps-options').addEventListener('input', e => {
    const id = e.target.id;
    if (id === 'o-size') { U.brush.size = +e.target.value; e.target.nextElementSibling.textContent = `${U.brush.size} px`; }
    if (id === 'o-hard') { U.brush.hard = +e.target.value; e.target.nextElementSibling.textContent = `${U.brush.hard}%`; }
  });
  $('#ps-options').addEventListener('change', e => {
    if (e.target.id === 'o-ratio') { U.ratio = e.target.value; if (U.crop && RATIOS[U.ratio]) { const r = RATIOS[U.ratio]; U.crop.h = Math.round(U.crop.w / r); const [, H] = docSize(); if (U.crop.y + U.crop.h > H) { U.crop.h = H - U.crop.y; U.crop.w = Math.round(U.crop.h * r); } if (r === 1) U.crop.h = U.crop.w = Math.min(U.crop.w, U.crop.h); renderOptionsReadout(); U.dirty = true; } }
    if (e.target.id === 'o-aligned') { U.brush.aligned = e.target.checked; U.srcOff = null; }
  });
  $('#ps-options').addEventListener('click', e => {
    if (e.target.closest('#o-crop-ok')) commitCrop();
    if (e.target.closest('#o-crop-cancel')) cancelCrop();
    // For touch screens and tablets: the next click sets the source, like Alt + click.
    if (e.target.closest('#o-src')) { U.pickSource = !U.pickSource; renderOptions(); if (U.pickSource) ctx.msg('Click the image to set the source (same as Alt + click).'); }
    const o = e.target.closest('[data-o]'); if (o) OPS[o.dataset.o]();
  });

  function renderDocbar() { const [w, h] = docSize(); $('#ps-docbar').textContent = `${Math.round(U.z * 100)}%   ·   Doc: ${w} × ${h} px (RGB/8)${U.pattern ? '   ·   Pattern Preview' : ''}`; }
  function renderTab() { $('#ps-tab').innerHTML = `<span>${esc(st().doc)} @ ${Math.round(U.z * 100)}% (${esc(layer().name)}, RGB/8)</span><i>×</i>`; }

  const row = (label, value, ok) => `<div class="sb-stat ${ok == null ? '' : ok ? 'good' : 'bad'}"><span>${esc(t(label))}</span><b data-no-i18n>${esc(value)}</b></div>`;
  function checkPanel() {
    const s = st(), id = ctx.stepId();
    let h = `<h4>${esc(t('Lab check'))}<small>${esc(t('not in Photoshop'))}</small></h4>`;
    if (id === 'p1') {
      const r = sizeReport(s);
      h += row('Size', `${r.w} × ${r.h} px`, null) + row('Square', r.square ? '✓' : '✗', r.square) + row('1024 × 1024', r.is1024 ? '✓' : '✗', r.is1024) + row('Cropped (not stretched)', r.distorted ? t('stretched') : r.cropped ? '✓' : '—', !r.distorted && r.cropped) + row('Not bigger than the crop', r.cropped ? (r.upscaled ? tr('crop was {n} px', { n: r.w > 0 ? s.cropSide : 0 }) : '✓') : '—', r.cropped && !r.upscaled);
      h += `<p class="sb-empty">${esc(t('Power of two: 256, 512, 1024, 2048… The photo covers 2.7 m in 1400 px: about 520 px per metre.'))}</p>`;
    } else if (id === 'p2') {
      const r = lightReportCached();
      h += row('Light across the image', `${Math.round(r.uneven * 100)}%`, r.evenOk) + row('Pebbles kept', `${Math.round(r.structure * 100)}%`, r.structureOk) + row('Colour kept', `${Math.round(r.chroma * 100)}%`, r.chromaOk);
      h += `<p class="sb-empty">${esc(t(!r.structureOk ? 'The pebbles lost their shape: the blur radius is too small, so the copy removes the pebbles too.' : !r.chromaOk ? 'The colour is gone: desaturate the copy before you blur it, so it only corrects the light.' : !r.evenOk ? 'Light: the difference between the brightest and darkest areas must be 10% or less.' : '✓ Even light, pebbles and colour kept.'))}</p>`;
    } else if (s.seam) {
      const [w, h2] = docSize(), inX = seamIn(s.seam.x), inY = seamIn(s.seam.y);
      if (id === 's1') {
        h += row('Old left/right edge at', `x = ${s.seam.x} px`, inX) + row('Old top/bottom edge at', `y = ${s.seam.y} px`, inY);
        if (s.flags.smeared) h += `<p class="sb-empty warn">${esc(t('The image was smeared or filled. Undo (Ctrl Z) and use Wrap Around.'))}</p>`;
        else h += `<p class="sb-empty">${esc(t(inX && inY ? '✓ The edges meet in the middle, where you can paint over them.' : 'The old edges are still at the border of the image, where you cannot paint across them.'))}</p>`;
      } else {
        const rep = seamCache(), n = rep.v.length + rep.h.length, good = n - rep.bad;
        h += row('Seam pieces fixed', `${good} / ${n}`, rep.ok);
        h += `<div class="seam-bars" aria-hidden="true"><div>${rep.v.map(r => `<i class="${r > SEAM_OK ? 'bad' : ''}"></i>`).join('')}</div><div>${rep.h.map(r => `<i class="${r > SEAM_OK ? 'bad' : ''}"></i>`).join('')}</div></div>`;
        h += `<label class="ps-c small"><input type="checkbox" id="seam-ov"${U.seamOverlay ? ' checked' : ''}><span>${esc(t('Show the seam check on the image'))}</span></label>`;
        if (id === 's3') { const b = stainOf(s); h += row('Pattern Preview used', s.flags.pattern ? '✓' : '✗', !!s.flags.pattern) + row('Stain', b >= 0.9 ? t('gone') : t('still there'), b >= 0.9); }
        if (s.flags.smeared) h += `<p class="sb-empty warn">${esc(t('The image was smeared or filled. Undo (Ctrl Z) and use Wrap Around.'))}</p>`;
      }
      void w; void h2;
    }
    return h;
  }
  let lightMemo = { ver: -1, r: null };
  function lightReportCached() { if (lightMemo.ver !== ctx.S.ver) lightMemo = { ver: ctx.S.ver, r: lightReport(st()) }; return lightMemo.r; }
  const thumbs = new WeakMap();
  function thumbFor(img) {
    if (thumbs.has(img)) return thumbs.get(img);
    const c = document.createElement('canvas'); c.width = 34; c.height = 34;
    const tmp = document.createElement('canvas'); tmp.width = img.w; tmp.height = img.h; tmp.getContext('2d').putImageData(new ImageData(img.d, img.w, img.h), 0, 0);
    const k = Math.min(34 / img.w, 34 / img.h), cg = c.getContext('2d'); cg.imageSmoothingQuality = 'high'; cg.drawImage(tmp, (34 - img.w * k) / 2, (34 - img.h * k) / 2, img.w * k, img.h * k);
    const url = c.toDataURL(); thumbs.set(img, url); return url;
  }
  function layersPanel() {
    const s = st(), L = layer();
    return `<h4 data-no-i18n>Layers</h4>
      <div class="ly-top" data-no-i18n><select id="ly-blend"${L.bg ? ' disabled' : ''}>${BLEND_MODES.map(m => `<option${m === L.blend ? ' selected' : ''}>${m}</option>`).join('')}</select>
      <label>Opacity: <input id="ly-op" type="number" min="0" max="100" value="${Math.round(L.opacity * 100)}"${L.bg ? ' disabled' : ''}>%</label></div>
      <ul class="ly-list" data-no-i18n>${s.layers.map((l, i) => ({ l, i })).reverse().map(({ l, i }) => `<li class="${i === s.active ? 'active' : ''}" data-ly="${i}"><button type="button" class="eye" data-eye="${i}" aria-pressed="${l.visible !== false}" title="Visibility">${l.visible !== false ? '👁' : ''}</button><img src="${thumbFor(l.img)}" alt=""><span>${esc(l.name)}</span>${l.bg ? '<em>🔒</em>' : `<em>${esc(l.blend)} · ${Math.round(l.opacity * 100)}%</em>`}</li>`).join('')}</ul>
      <div class="ly-bottom" data-no-i18n><button type="button" data-op="duplicate" title="Duplicate Layer (Ctrl J)">⧉</button><button type="button" data-op="flatten" title="Flatten Image">▤</button><button type="button" data-op="deleteLayer" title="Delete Layer">🗑</button></div>`;
  }
  function renderPanels() { $('#ps-check').innerHTML = checkPanel(); $('#ps-layers').innerHTML = layersPanel(); }
  $('#ps-layers').addEventListener('click', e => {
    const op = e.target.closest('[data-op]'); if (op) { OPS[op.dataset.op](); return; }
    const eye = e.target.closest('[data-eye]'); if (eye) { ctx.pushUndo(); const L = st().layers[+eye.dataset.eye]; L.visible = L.visible === false; ctx.changed('layers'); return; }
    const li = e.target.closest('[data-ly]'); if (li) { st().active = +li.dataset.ly; renderPanels(); renderTab(); }
  });
  let opGesture = false;
  $('#ps-layers').addEventListener('change', e => {
    if (e.target.id === 'ly-blend') { ctx.pushUndo(); layer().blend = e.target.value; ctx.msg(tr('Blend mode: {n}.', { n: e.target.value })); ctx.changed('layers'); }
    if (e.target.id === 'ly-op') { if (!opGesture) ctx.pushUndo(); opGesture = false; layer().opacity = clamp((+e.target.value || 0) / 100, 0, 1); ctx.changed('layers'); }
  });
  $('#ps-check').addEventListener('change', e => { if (e.target.id === 'seam-ov') { U.seamOverlay = e.target.checked; U.dirty = true; } });

  // ─── Keyboard ──────────────────────────────────────────────────────────────
  function keydown(e) {
    if (!dlg.hidden) return false;
    const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
    if (e.key === ' ') { if (!U.space) { U.space = true; U.dirty = true; } return true; }
    if (ctrl && e.altKey && k === 'i') { OPS.imageSize(); return true; }
    if (ctrl && e.shiftKey && k === 'u') { OPS.desaturate(); return true; }
    if (ctrl && k === 'j') { OPS.duplicate(); return true; }
    if (ctrl && k === 'i') { OPS.invert(); return true; }
    if (ctrl && k === '0') { OPS.fit(); return true; }
    if (ctrl && k === '1') { OPS.actual(); return true; }
    if (ctrl) return false;
    if (e.key === 'Enter' && U.tool === 'crop') { commitCrop(); return true; }
    if (e.key === 'Escape') { if (U.crop) cancelCrop(); closeMenu(); return true; }
    if (e.key === '[' || e.key === ']') { U.brush.size = clamp(Math.round(U.brush.size * (e.key === ']' ? 1.15 : 1 / 1.15)), 4, 300); renderOptions(); U.dirty = true; return true; }
    const tl = TOOLS.find(x => x.key.toLowerCase() === k); if (tl) { setTool(tl.id); return true; }
    return false;
  }
  window.addEventListener('keyup', e => { if (e.key === ' ') { U.space = false; U.dirty = true; } });

  return {
    enter() { U.crop = null; U.source = null; U.srcOff = null; U.preview = null; U.pattern = false; closeMenu(); dlg.hidden = true; const id = ctx.stepId(); U.tool = id === 'p1' ? 'crop' : id === 's2' ? 'clone' : id === 's3' ? 'heal' : 'hand'; U.seamOverlay = true; resizeCanvas(); refreshDoc(); fit(); this.render(); },
    render() { refreshDoc(); renderTools(); renderOptions(); renderPanels(); renderDocbar(); renderTab(); },
    keydown,
    statusKeys: () => `<span><kbd>C</kbd>Crop</span><span><kbd>S</kbd>Clone Stamp</span><span><kbd>J</kbd>Healing Brush</span><span><kbd>Alt</kbd>+click Source</span><span><kbd>[</kbd><kbd>]</kbd>Brush size</span><span><kbd>Space</kbd>Pan</span><span><kbd>Ctrl</kbd><kbd>Z</kbd>Undo</span>`,
    U,
  };
}
