/* Editor: Frame · Filter · Stickers · Text, undo/redo, sticker gestures. */
import { $, $$, el, clamp, pick, rand, fontsReady, dateTypewriter, dateSerif, dateDigital, isCoarse, makeCanvas } from './utils.js';
import { state } from './state.js';
import { show, onScreen, confirmDialog } from './ui.js';
import { icon } from './icons.js';
import { LAYOUTS, createLayoutPicker, fitLayout } from './layouts.js';
import { FRAMES, FRAME_GROUPS, variantOf } from './frames.js';
import { BG_SWATCHES, PATTERNS } from './patterns.js';
import { FILTERS, filterThumb } from './filters.js';
import { PACKS, TYPE_STYLES, DEFS, isEditable, stickerThumb, stickerArt, stickerBox, setArtListener } from './stickers.js';
import { texturesReady } from './textures.js';
import { computeLayout, render, handlePositions } from './render.js';
import { openBooth } from './booth.js';
import { openReveal } from './reveal.js';

const MAX_VIEW_SCALE = 0.72;
const HISTORY_LIMIT = 80;
const { design: D, editor: E } = state;

const strip = $('#strip');
const stage = $('#stage');
const bar = $('#sticker-bar');
const panel = $('#panel');

let uidSeq = 1;
const selectedSticker = () => D.stickers.find(s => s.uid === E.selected) || null;

/* =========================================================
   Session setup
   ========================================================= */
export async function newDesign() {
  await Promise.all([fontsReady, texturesReady]);
  Object.assign(D, {
    layout: fitLayout(state.settings.layout, D.photos.length),
    frame: 'booth', variants: {}, double: false, filmPaper: false, filter: 'silver', intensity: 1, brightness: 0,
    bg: { color: '#F4EEE3', pattern: 'solid' },
    stickers: [], shotDate: new Date(),
  });
  D.date.text = '';
  E.history = []; E.future = []; E.selected = null;
  state.output.canvas = state.output.blob = null;
  state.output.savedId = null;
  filterThumbsFor = null;
}

export function openEditor({ via = 'fade' } = {}) {
  selectTab($('#tab-frame'));
  if (window.innerWidth <= 860) setSheetCollapsed(true);
  buildProps();
  // everything is drawn before the screen is uncovered: the frame thumbnails here, the strip in the swap
  frameButtons.forEach((_, id) => renderThumb(id));
  const shown = show('editor', { via });
  syncUI();
  return shown;
}
onScreen('editor', () => { cancelAnimationFrame(E.rafId); E.rafId = 0; drawDisplay(); });

/* =========================================================
   Rendering (dirty flag: one frame per change, nothing while idle)
   ========================================================= */
export function requestRender() {
  if (E.rafId) return;
  E.rafId = requestAnimationFrame(() => { E.rafId = 0; drawDisplay(); });
}
setArtListener(requestRender);

function drawDisplay() {
  if (state.screen !== 'editor' || !D.photos.length || !E.stageW) return;
  const L = computeLayout();
  const v = E.view;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  // fit the whole strip in the space left below the heading: above the sheet on phones (its handle
  // sticks out 26px), above the fold on desktop; the mat pads it on each side
  const top = stage.getBoundingClientRect().top + window.scrollY;
  const padY = parseFloat(getComputedStyle(stage).paddingTop) || 0;
  const maxH = window.innerWidth <= 860
    ? Math.max(140, panel.getBoundingClientRect().top - 26 - top - 2 * padY)
    : Math.max(280, window.innerHeight - top - 2 * padY - 24);
  v.scale = Math.min(E.stageW / L.W, maxH / L.H, MAX_VIEW_SCALE);
  v.k = v.scale * dpr; v.W = L.W; v.H = L.H;
  const pw = Math.round(L.W * v.k), ph = Math.round(L.H * v.k);
  if (strip.width !== pw || strip.height !== ph) {
    strip.width = pw; strip.height = ph;
    strip.style.width = `${L.W * v.scale}px`;
    strip.style.height = `${L.H * v.scale}px`;
  }
  render(strip.getContext('2d'), v.k, { ui: true, L });
  placeBar();
}

// the room for the strip: the page's content width, minus the panel, the gap and the mat's padding
// (its sides leave room for the props). Measured from the page, not the editor, because the editor
// shrinks to fit the strip; the panel width, gap and padding come from the stylesheet.
const MAX = 1140;
const editorGrid = $('#screen-editor .editor');
new ResizeObserver(() => {
  const vw = document.documentElement.clientWidth;
  const w = Math.min(vw - 2 * Math.min(40, Math.max(16, vw * 0.04)), MAX);
  const cs = getComputedStyle(editorGrid), ss = getComputedStyle(stage);
  const padX = (parseFloat(ss.paddingLeft) || 0) + (parseFloat(ss.paddingRight) || 0);
  const side = window.innerWidth <= 860 ? 0 : (parseFloat(cs.getPropertyValue('--panel-w')) || 0) + (parseFloat(cs.getPropertyValue('--gap')) || 0);
  E.stageW = Math.floor(w - side - padX);
  requestRender();
}).observe(document.documentElement);

/* =========================================================
   Props on the mat: a sheet of the real stickers (two already peeled off),
   a date stamper set to today and a swatch fan of the film looks. Each one
   opens its tab in the panel.
   ========================================================= */
let propsBuilt = false;
function buildProps() {
  $('#stamp-date').textContent = dateTypewriter(D.shotDate || new Date()).replace("'", '’');
  if (propsBuilt) return;
  propsBuilt = true;
  // the photo packs' first stickers when there are any, otherwise the Type-your-own styles
  const png = PACKS.flatMap(p => p.items).slice(0, 2);
  const items = [
    ...png.map(def => ({ def })),
    { def: DEFS.get('ransom'), text: 'xoxo' },
    { def: DEFS.get('label'), text: 'fragile', variant: 'red' },
    { def: DEFS.get('note'), text: 'keep this one' },
    { def: DEFS.get('label'), text: 'besties', variant: 'black' },
  ].slice(0, 4);
  const cells = items.map(({ def, text, variant }) => {
    const cell = el('span', { className: 'sheet-cell' });
    const put = c => { if (c) cell.replaceChildren(c); };
    if (def.kind === 'png') stickerThumb(def, 96).then(put);
    else put(stickerArt(def, text, variant));
    return cell;
  });
  // two die-cut spaces where stickers have already been peeled off
  const peeled = () => el('span', { className: 'sheet-cell is-peeled' });
  $('#prop-sheet-cells').replaceChildren(cells[0], peeled(), cells[1], cells[2], peeled(), cells[3]);
  const n = FILTERS.length;
  $('#prop-fan').replaceChildren(...FILTERS.map((f, i) => el('span', {
    className: 'fan-blade', style: { '--a': `${(-34 + (i * 60) / Math.max(1, n - 1)).toFixed(1)}deg`, '--c': f.tone || '#B9B2A8' },
  })), el('span', { className: 'fan-rivet' }));
}
$$('.mat-prop').forEach(b => b.addEventListener('click', () => selectTab($(`#${b.dataset.tab}`), true)));


/* =========================================================
   History
   ========================================================= */
const snapshot = () => JSON.stringify({
  layout: D.layout, frame: D.frame, variants: D.variants, double: D.double, filmPaper: D.filmPaper, filter: D.filter, intensity: D.intensity, brightness: D.brightness,
  bg: D.bg, date: D.date, caption: D.caption, dedication: D.dedication, to: D.to, from: D.from, stickers: D.stickers,
});

function pushHistory(snap = snapshot()) {
  if (E.history[E.history.length - 1] === snap) return;
  E.history.push(snap);
  if (E.history.length > HISTORY_LIMIT) E.history.shift();
  E.future = [];
  syncHistoryButtons();
}
function restore(snap) {
  Object.assign(D, JSON.parse(snap));
  if (!selectedSticker()) E.selected = null;
  syncUI();
}
export function undo() {
  if (!E.history.length) return;
  E.future.push(snapshot());
  restore(E.history.pop());
}
export function redo() {
  if (!E.future.length) return;
  E.history.push(snapshot());
  restore(E.future.pop());
}
function syncHistoryButtons() {
  $('#btn-undo').disabled = !E.history.length;
  $('#btn-redo').disabled = !E.future.length;
}
$('#btn-undo').addEventListener('click', undo);
$('#btn-redo').addEventListener('click', redo);

// Every discrete, undoable change goes through here
function edit(mutate) {
  pushHistory();
  mutate();
  syncUI();
}

// Text fields and sliders: live preview, one undo step per focus session
function bindUndoable(input, apply, evt = 'input') {
  let before = null;
  input.addEventListener('focus', () => { before = snapshot(); });
  input.addEventListener('pointerdown', () => { before = snapshot(); });
  input.addEventListener(evt, () => { apply(input); requestRender(); });
  input.addEventListener('change', () => {
    if (before && before !== snapshot()) pushHistory(before);
    before = snapshot();
  });
}

/* =========================================================
   Panel: folder tabs
   ========================================================= */
const tabs = $$('#editor-tabs [role="tab"]');
function selectTab(tab, focus = false) {
  tabs.forEach(t => {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    $(`#${t.getAttribute('aria-controls')}`).hidden = !on;
  });
  E.tab = tab.id.replace('tab-', '');
  if (focus) tab.focus();
  setSheetCollapsed(false);
  if (E.tab === 'filter') buildFilterThumbs();
  if (E.tab === 'frame') scheduleThumbs();
  if (E.tab === 'stickers') showPack(E.pack);
}
tabs.forEach(t => t.addEventListener('click', () => selectTab(t)));
$('#editor-tabs').addEventListener('keydown', e => {
  const i = tabs.indexOf(document.activeElement);
  const next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
  if (i < 0 || next == null) return;
  e.preventDefault();
  selectTab(tabs[(next + tabs.length) % tabs.length], true);
});

function setSheetCollapsed(c) {
  panel.classList.toggle('is-collapsed', c);
  $('#sheet-handle').setAttribute('aria-expanded', String(!c));
  requestRender();
}
$('#sheet-handle').addEventListener('click', () => setSheetCollapsed(!panel.classList.contains('is-collapsed')));

/* --- small builders --- */
function chips(root, items, onPick) {
  root.replaceChildren(...items.map(([id, name]) => el('button', {
    className: 'chip', text: name, attrs: { type: 'button', 'aria-pressed': 'false' }, dataset: { value: id }, on: { click: () => onPick(id) },
  })));
}
function swatches(root, items, label, onPick) {
  root.replaceChildren(...items.map(([value, name, color]) => el('button', {
    className: 'swatch', attrs: { type: 'button', 'aria-pressed': 'false', 'aria-label': `${label}: ${name}`, title: name },
    dataset: { value }, style: { '--c': color || value }, on: { click: () => onPick(value) },
  })));
}
const syncPressed = (root, isOn) => root.querySelectorAll('[data-value]').forEach(b => b.setAttribute('aria-pressed', String(isOn(b.dataset.value))));

/* =========================================================
   Frame tab
   ========================================================= */
const layoutPicker = createLayoutPicker($('#editor-layouts'), 'editor-layout', id => {
  if (id === D.layout || !LAYOUTS[id].supports(D.photos.length)) return syncUI();
  edit(() => {
    const a = computeLayout();
    D.layout = id;
    const b = computeLayout();
    // keep stickers in roughly the same place on the new canvas
    D.stickers.forEach(s => { s.x *= b.W / a.W; s.y *= b.H / a.H; });
  });
});
// Frames, grouped, each shown as a small live thumbnail of the user's own strip
const frameButtons = new Map();
$('#frame-groups').replaceChildren(...FRAME_GROUPS.map(g => el('div', { className: 'frame-group' }, [
  el('span', { className: 'label', text: g.name, attrs: { id: `fg-${g.id}` } }),
  el('div', { className: 'frame-grid', attrs: { role: 'group', 'aria-labelledby': `fg-${g.id}` } },
    Object.entries(FRAMES).filter(([, f]) => f.group === g.id).map(([id, f]) => {
      const btn = el('button', {
        className: 'frame-opt', attrs: { type: 'button', 'aria-pressed': 'false' }, dataset: { value: id },
        on: { click: () => edit(() => { D.frame = id; }) },
      }, [el('span', { className: 'frame-thumb', attrs: { 'aria-hidden': 'true' } }), el('span', { className: 'frame-name', text: f.name })]);
      frameButtons.set(id, btn);
      return btn;
    })),
])));

/* thumbnails: rendered lazily, cached by everything that changes their look */
const thumbCache = new Map();
let thumbTimer = 0;
const thumbKey = id => JSON.stringify([id, variantOf(id).id, D.layout, D.filter, Math.round(D.intensity * 20), D.brightness, D.bg, D.photos.length, D.photos[0] && D.photos[0].seed, D.filmPaper, D.date.show]);
function renderThumb(id) {
  const key = thumbKey(id);
  if (!thumbCache.has(key)) {
    const saved = { frame: D.frame, double: D.double, stickers: D.stickers };
    Object.assign(D, { frame: id, double: false, stickers: [] });
    const L = computeLayout();
    const box = 132, k = Math.min(box / L.W, box / L.H) * Math.min(window.devicePixelRatio || 1, 2);
    const c = makeCanvas(L.W * k, L.H * k);
    render(c.getContext('2d'), k, { L });
    Object.assign(D, saved);
    if (thumbCache.size > 80) thumbCache.clear();
    thumbCache.set(key, c);
  }
  const holder = frameButtons.get(id).querySelector('.frame-thumb');
  const c = thumbCache.get(key);
  if (holder.firstChild !== c) holder.replaceChildren(c);
}
const visibleThumbs = new Set();
const thumbIO = 'IntersectionObserver' in window ? new IntersectionObserver(entries => entries.forEach(en => {
  const id = en.target.dataset.value;
  if (en.isIntersecting) { visibleThumbs.add(id); scheduleThumbs(); } else visibleThumbs.delete(id);
}), { rootMargin: '80px' }) : null;
frameButtons.forEach(b => thumbIO && thumbIO.observe(b));
function scheduleThumbs() {
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(() => {
    if (state.screen !== 'editor' || E.tab !== 'frame' || !D.photos.length) return;
    (thumbIO ? [...visibleThumbs] : [...frameButtons.keys()]).forEach(renderThumb);
  }, 220);
}

$('#opt-double').addEventListener('change', e => edit(() => { D.double = e.target.checked; }));
swatches($('#bg-swatches'), BG_SWATCHES.map(([c, n]) => [c, n]), 'Paper', c => edit(() => { D.bg = { ...D.bg, color: c }; }));
$('#pattern-chips').replaceChildren(...PATTERNS.map(p => el('button', {
  className: 'pattern-opt', attrs: { type: 'button', 'aria-pressed': 'false' }, dataset: { value: p.id },
  on: { click: () => edit(() => { D.bg = { ...D.bg, pattern: p.id }; }) },
}, [el('span', { className: 'pattern-dot', dataset: { p: p.id }, attrs: { 'aria-hidden': 'true' } }), el('span', { text: p.name })])));

/* =========================================================
   Filter tab
   ========================================================= */
let filterThumbsFor = null;
function buildFilterThumbs() {
  const p = D.photos[0];
  if (!p || filterThumbsFor === p) return;
  filterThumbsFor = p;
  $$('#filter-grid .filter-card').forEach(card => {
    const c = filterThumb(p, card.dataset.value);
    c.setAttribute('aria-hidden', 'true');
    card.querySelector('.filter-thumb').replaceChildren(c);
  });
}
$('#filter-grid').replaceChildren(...FILTERS.map(f => el('button', {
  className: 'filter-card', attrs: { type: 'button', 'aria-pressed': 'false' }, dataset: { value: f.id },
  on: { click: () => edit(() => { D.filter = f.id; }) },
}, [el('span', { className: 'filter-thumb' }), el('span', { text: f.name })])));
// sliders fill gold up to the knob
function fillRange(r) { r.style.setProperty('--fill', `${((r.value - r.min) / (r.max - r.min)) * 100}%`); }
$$('#tp-filter input[type="range"]').forEach(r => r.addEventListener('input', () => fillRange(r)));

bindUndoable($('#intensity'), i => {
  D.intensity = +i.value / 100;
  $('#intensity-out').textContent = `${i.value}%`;
});
bindUndoable($('#brightness'), i => {
  D.brightness = +i.value;
  $('#brightness-out').textContent = D.brightness > 0 ? `+${D.brightness}` : String(D.brightness);
});

/* =========================================================
   Stickers tab: one tab per pack in stickers.json, plus Type your own
   ========================================================= */
const packNav = $('#pack-nav');
const packBody = $('#pack-body');
const builtPacks = new Map();
const thumbObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  entries.forEach(async en => {
    if (!en.isIntersecting) return;
    thumbObserver.unobserve(en.target);
    const c = await stickerThumb(DEFS.get(en.target.dataset.def));
    if (c) { c.setAttribute('aria-hidden', 'true'); en.target.querySelector('.sticker-face').replaceChildren(c); }
  });
}, { root: null, rootMargin: '120px' }) : null;

const allPacks = () => [...PACKS, { id: 'type', name: 'Type your own', items: TYPE_STYLES }];

function renderPackNav() {
  chips(packNav, allPacks().map(p => [p.id, p.name]), id => showPack(id));
}

function stickerButton(def) {
  const btn = el('button', {
    className: 'sticker-btn', attrs: { type: 'button', 'aria-label': `Add ${def.name}`, title: def.name },
    dataset: { def: def.id }, on: { click: () => addSticker(def) },
  }, [el('span', { className: 'sticker-face' })]);
  if (thumbObserver) thumbObserver.observe(btn);
  else stickerThumb(def).then(c => c && btn.firstChild.replaceChildren(c));
  return btn;
}

function buildComposer() {
  const input = el('input', { attrs: { type: 'text', id: 'type-text', maxlength: '24', placeholder: 'Type a word or two', autocomplete: 'off' } });
  let style = TYPE_STYLES[0].id, variant = 'red';
  const styleRow = el('div', { className: 'chips', attrs: { role: 'group', 'aria-label': 'Sticker style' } });
  const variantRow = el('div', { className: 'chips', attrs: { role: 'group', 'aria-label': 'Tape colour' } });
  const sync = () => {
    syncPressed(styleRow, v => v === style);
    syncPressed(variantRow, v => v === variant);
    variantRow.hidden = style !== 'label';
  };
  chips(styleRow, TYPE_STYLES.map(d => [d.id, d.name]), id => { style = id; sync(); });
  chips(variantRow, [['red', 'Red oxide tape'], ['black', 'Black tape']], id => { variant = id; sync(); });
  sync();
  const add = el('button', {
    className: 'btn btn-primary btn-block', attrs: { type: 'button' }, html: `${icon('plus', { size: 18 })}<span>Add to strip</span>`,
    on: { click: () => { const def = DEFS.get(style); addSticker(def, { text: input.value.trim() || def.defaultText, variant: style === 'label' ? variant : '' }); } },
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') add.click(); });
  const parts = [
    el('label', { className: 'field' }, [el('span', { className: 'label', text: 'Your words' }), input]),
    el('div', { className: 'field' }, [el('span', { className: 'label', text: 'Style' }), styleRow]),
    variantRow, add,
  ];
  if (!PACKS.length) {
    parts.unshift(el('div', { className: 'sticker-empty' }, [el('p', { text: 'The sticker drawer is empty for now. Type your own instead.' })]));
  }
  return el('div', { className: 'composer' }, parts);
}

function showPack(id) {
  const packs = allPacks();
  const pack = packs.find(p => p.id === id) || packs[0];
  E.pack = pack.id;
  syncPressed(packNav, v => v === pack.id);
  if (!builtPacks.has(pack.id)) {
    builtPacks.set(pack.id, pack.id === 'type' ? buildComposer() : el('div', { className: 'sticker-grid' }, pack.items.map(stickerButton)));
  }
  packBody.replaceChildren(builtPacks.get(pack.id));
}

export function refreshPacks() {
  builtPacks.clear();
  if (PACKS.length && E.pack === 'type') E.pack = PACKS[0].id;
  renderPackNav();
  if (E.tab === 'stickers') showPack(E.pack);
}
renderPackNav();

function visibleCentre() {
  const r = strip.getBoundingClientRect(), sr = stage.getBoundingClientRect(), v = E.view;
  const top = Math.max(r.top, sr.top, 0), bot = Math.min(r.bottom, sr.bottom, window.innerHeight);
  const left = Math.max(r.left, sr.left), right = Math.min(r.right, sr.right);
  return {
    x: right > left ? ((left + right) / 2 - r.left) / r.width * v.W : v.W / 2,
    y: bot > top ? ((top + bot) / 2 - r.top) / r.height * v.H : v.H / 2,
  };
}

function addSticker(def, { text = '', variant = '' } = {}) {
  pushHistory();
  const v = E.view, c = visibleCentre();
  const base = def.kind === 'text' ? 0.36 : 0.3;
  const s = {
    uid: uidSeq++, def: def.id,
    x: clamp(c.x + rand(-50, 50), 60, v.W - 60), y: clamp(c.y + rand(-40, 40), 60, v.H - 60),
    w: clamp(Math.min(v.W, 600) * base, 80, 320), rot: rand(-0.14, 0.14), flip: false, shadow: true,
    text: isEditable(def) ? (text || def.defaultText) : '', variant: variant || (def.variants ? def.variants[0][0] : ''),
  };
  D.stickers.push(s);
  select(s);
  syncUI();
}

/* --- selected sticker: toolbar + text editing --- */
function select(s) {
  E.selected = s ? s.uid : null;
  strip.style.touchAction = s ? 'none' : 'pan-y';
  syncStickerEdit();
  requestRender();
}

function syncStickerEdit() {
  const s = selectedSticker(), def = s && DEFS.get(s.def);
  const editable = isEditable(def);
  $('#sticker-edit').hidden = !editable;
  bar.hidden = !s;
  bar.querySelector('[data-act="edit"]').hidden = !editable;
  bar.querySelector('[data-act="shadow"]').setAttribute('aria-pressed', String(!s || s.shadow !== false));
  if (editable && document.activeElement !== $('#sticker-text')) $('#sticker-text').value = s.text;
}

bindUndoable($('#sticker-text'), i => {
  const s = selectedSticker();
  if (s) s.text = i.value.trim() ? i.value : DEFS.get(s.def).defaultText;
});

function placeBar() {
  const s = selectedSticker();
  if (!s) { bar.hidden = true; return; }
  bar.hidden = false;
  const { w, h } = stickerBox(s), sc = E.view.scale;
  const halfH = Math.abs(w / 2 * Math.sin(s.rot)) + Math.abs(h / 2 * Math.cos(s.rot));
  const bw = bar.offsetWidth, bh = bar.offsetHeight;
  const cssW = E.view.W * sc;
  let top = (s.y - halfH) * sc - bh - 46;
  if (top < 4) top = (s.y + halfH) * sc + 18;
  const left = clamp(s.x * sc - bw / 2, 4, Math.max(4, cssW - bw - 4));
  bar.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

const ACTIONS = {
  edit() {
    selectTab($('#tab-stickers'));
    $('#sticker-text').focus();
    $('#sticker-text').select();
  },
  flip: () => { const s = selectedSticker(); edit(() => { s.flip = !s.flip; }); },
  shadow: () => { const s = selectedSticker(); edit(() => { s.shadow = s.shadow === false; }); },
  duplicate() {
    const s = selectedSticker();
    edit(() => {
      const copy = { ...s, uid: uidSeq++, x: s.x + 24, y: s.y + 24 };
      D.stickers.push(copy);
      E.selected = copy.uid;
    });
  },
  forward() {
    const s = selectedSticker(), i = D.stickers.indexOf(s);
    if (i < D.stickers.length - 1) edit(() => { D.stickers.splice(i, 1); D.stickers.splice(i + 1, 0, s); });
  },
  backward() {
    const s = selectedSticker(), i = D.stickers.indexOf(s);
    if (i > 0) edit(() => { D.stickers.splice(i, 1); D.stickers.splice(i - 1, 0, s); });
  },
  delete() {
    const s = selectedSticker();
    edit(() => { D.stickers = D.stickers.filter(x => x !== s); E.selected = null; });
    select(null);
  },
};
bar.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (b && selectedSticker()) ACTIONS[b.dataset.act]();
});

/* =========================================================
   Text tab
   ========================================================= */
$('#opt-date').addEventListener('change', e => edit(() => { D.date = { ...D.date, show: e.target.checked }; }));
$('#date-style').addEventListener('change', e => edit(() => { D.date = { ...D.date, style: e.target.value }; }));
bindUndoable($('#date-text'), i => { D.date = { ...D.date, text: i.value }; });
bindUndoable($('#caption'), i => { D.caption = i.value; });
bindUndoable($('#dedication'), i => { D.dedication = i.value; });
bindUndoable($('#letter-to'), i => { D.to = i.value; });
bindUndoable($('#letter-from'), i => { D.from = i.value; });

/* =========================================================
   Surprise me: a tasteful random frame + look + date style
   ========================================================= */
$('#btn-surprise').addEventListener('click', () => edit(() => {
  const id = pick(Object.keys(FRAMES).filter(k => k !== D.frame));
  const f = FRAMES[id];
  D.frame = id;
  if (f.variants.length) D.variants = { ...D.variants, [id]: pick(f.variants)[0] };
  D.filter = pick(f.pairs);
  D.intensity = Math.round(rand(0.75, 1) * 20) / 20;
  D.filmPaper = false;   // the strip stays the hero: letter paper and its pin only when chosen
  D.double = f.canDouble && D.layout === 'strip' && Math.random() > 0.6;
  if (f.paper) D.bg = { color: pick(BG_SWATCHES.slice(0, 6))[0], pattern: pick(['solid', 'solid', 'polka', 'gingham', 'stars']) };
  D.date = { ...D.date, show: true, style: pick(['typewriter', 'serif', 'digital']) };
}));

/* =========================================================
   Sync panel controls with state
   ========================================================= */
function syncUI() {
  const f = FRAMES[D.frame];
  layoutPicker.update(D.photos.length, D.layout);
  frameButtons.forEach((b, id) => b.setAttribute('aria-pressed', String(id === D.frame)));
  // colour variants for the chosen frame
  const vf = $('#variant-field');
  vf.hidden = !f.variants.length;
  if (f.variants.length) {
    const vs = $('#variant-swatches');
    if (vs.dataset.frame !== D.frame) {
      vs.dataset.frame = D.frame;
      swatches(vs, f.variants.map(([id, n, c]) => [id, n, c]), 'Colour', id => edit(() => { D.variants = { ...D.variants, [D.frame]: id }; }));
    }
    syncPressed(vs, v => v === variantOf(D.frame).id);
  }
  $('#double-field').hidden = !(f.canDouble && D.layout === 'strip');
  $('#opt-double').checked = D.double;
  $('#film-paper-field').hidden = D.frame !== 'film';
  $('#opt-film-paper').checked = D.filmPaper;
  $('#bg-field').hidden = !f.paper;
  // where the words go on this frame
  $('#caption-hint').textContent = f.hints && f.hints.caption ? `· ${f.hints.caption}` : '';
  $('#dedication-hint').textContent = f.hints && f.hints.dedication ? `· ${f.hints.dedication}` : '';
  $('#to-from').hidden = !f.usesToFrom;
  ['letter-to', 'letter-from'].forEach(id => { const i = $(`#${id}`); if (document.activeElement !== i) i.value = id === 'letter-to' ? D.to : D.from; });
  syncPressed($('#bg-swatches'), v => v.toLowerCase() === D.bg.color.toLowerCase());
  syncPressed($('#pattern-chips'), v => v === D.bg.pattern);
  syncPressed($('#filter-grid'), v => v === D.filter);
  $('#intensity').value = Math.round(D.intensity * 100);
  $('#intensity-out').textContent = `${Math.round(D.intensity * 100)}%`;
  $('#brightness').value = D.brightness;
  $('#brightness-out').textContent = D.brightness > 0 ? `+${D.brightness}` : String(D.brightness);
  $$('#tp-filter input[type="range"]').forEach(fillRange);
  $('#opt-date').checked = D.date.show;
  $$('#date-style input').forEach(r => { r.checked = r.value === D.date.style; r.disabled = !D.date.show; });
  $('#ds-typewriter').textContent = dateTypewriter(D.shotDate).replace("'", '’');
  $('#ds-serif').textContent = dateSerif(D.shotDate).replace("'", '’');
  $('#ds-digital').textContent = dateDigital(D.shotDate).replace("'", '’');
  const dt = $('#date-text');
  dt.disabled = !D.date.show;
  dt.placeholder = { typewriter: dateTypewriter, serif: dateSerif, digital: dateDigital }[D.date.style](D.shotDate);
  if (document.activeElement !== dt) dt.value = D.date.text;
  if (document.activeElement !== $('#caption')) $('#caption').value = D.caption;
  if (document.activeElement !== $('#dedication')) $('#dedication').value = D.dedication;
  syncHistoryButtons();
  syncStickerEdit();
  requestRender();
  if (E.tab === 'frame') scheduleThumbs();
}

/* =========================================================
   Pointer gestures on the strip
   ========================================================= */
function toLogical(e) {
  const r = strip.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * E.view.W, y: (e.clientY - r.top) / r.height * E.view.H };
}
function hitSticker(p) {
  for (let i = D.stickers.length - 1; i >= 0; i--) {
    const s = D.stickers[i], { w, h } = stickerBox(s);
    const dx = p.x - s.x, dy = p.y - s.y, c = Math.cos(-s.rot), sn = Math.sin(-s.rot);
    if (Math.abs(dx * c - dy * sn) <= w / 2 && Math.abs(dx * sn + dy * c) <= h / 2) return s;
  }
  return null;
}
function hitHandle(s, p) {
  const hp = handlePositions(s, E.view.scale), r = (isCoarse() ? 22 : 15) / E.view.scale;
  return ['rotate', 'resize'].find(k => Math.hypot(p.x - hp[k].x, p.y - hp[k].y) <= r) || null;
}
function pinchStart(s) {
  const [a, b] = [...E.pointers.values()];
  E.drag = {
    type: 'pinch', s, before: E.drag ? E.drag.before : snapshot(), w: s.w, rot: s.rot,
    dist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), angle: Math.atan2(b.y - a.y, b.x - a.x),
  };
}

strip.addEventListener('pointerdown', e => {
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  const p = toLogical(e);
  E.pointers.set(e.pointerId, p);
  strip.setPointerCapture(e.pointerId);
  const sel = selectedSticker();
  if (E.pointers.size === 2 && sel) { pinchStart(sel); return; }
  if (sel) {
    const h = hitHandle(sel, p);
    if (h) {
      E.drag = {
        type: h, s: sel, before: snapshot(), w: sel.w, rot: sel.rot,
        dist: Math.max(1, Math.hypot(p.x - sel.x, p.y - sel.y)), angle: Math.atan2(p.y - sel.y, p.x - sel.x),
      };
      e.preventDefault();
      return;
    }
  }
  const hit = hitSticker(p);
  if (hit) {
    const before = snapshot();
    select(hit);
    E.drag = { type: 'move', s: hit, before, ox: p.x - hit.x, oy: p.y - hit.y };
    e.preventDefault();
  } else {
    select(null);
  }
});

strip.addEventListener('pointermove', e => {
  if (!E.pointers.has(e.pointerId)) return;
  const p = toLogical(e);
  E.pointers.set(e.pointerId, p);
  const d = E.drag;
  if (!d) return;
  const s = d.s, v = E.view;
  if (d.type === 'pinch' && E.pointers.size >= 2) {
    const [a, b] = [...E.pointers.values()];
    s.w = clamp(d.w * Math.hypot(b.x - a.x, b.y - a.y) / d.dist, 30, 900);
    s.rot = d.rot + Math.atan2(b.y - a.y, b.x - a.x) - d.angle;
  } else if (d.type === 'move') {
    s.x = clamp(p.x - d.ox, -40, (state.design.double && D.layout === 'strip' ? v.W / 2 : v.W) + 40);
    s.y = clamp(p.y - d.oy, -40, v.H + 40);
  } else if (d.type === 'resize') {
    s.w = clamp(d.w * Math.hypot(p.x - s.x, p.y - s.y) / d.dist, 30, 900);
  } else if (d.type === 'rotate') {
    s.rot = d.rot + Math.atan2(p.y - s.y, p.x - s.x) - d.angle;
  }
  requestRender();
});

function endPointer(e) {
  E.pointers.delete(e.pointerId);
  const d = E.drag;
  if (!d) return;
  if (d.type === 'pinch' && E.pointers.size === 1) {
    const [p] = E.pointers.values();
    E.drag = { type: 'move', s: d.s, before: d.before, ox: p.x - d.s.x, oy: p.y - d.s.y };
    return;
  }
  if (E.pointers.size) return;
  if (d.before !== snapshot()) pushHistory(d.before);
  E.drag = null;
  requestRender();
}
strip.addEventListener('pointerup', endPointer);
strip.addEventListener('pointercancel', endPointer);

/* =========================================================
   Leaving the editor
   ========================================================= */
async function leaveEditor() {
  if (await confirmDialog({ title: 'Start over?', body: 'Your edits and photos will be cleared and you’ll go back to the booth.', ok: 'Start over' })) openBooth();
}
$('#btn-editor-back').addEventListener('click', leaveEditor);
$('#btn-finish').addEventListener('click', () => { select(null); openReveal(); });

export function editorKeys(e) {
  const t = e.target;
  if (t.matches && t.matches('input[type="text"], textarea')) {
    if (e.key === 'Escape') t.blur();
    return;
  }
  const s = selectedSticker();
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  const nudge = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[key];
  const interactive = t.closest && t.closest('button, input, select, [role="tab"], label');
  if (mod && key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
  else if (mod && key === 'y') { e.preventDefault(); redo(); }
  else if (s && (key === 'delete' || key === 'backspace')) { e.preventDefault(); ACTIONS.delete(); }
  else if (s && nudge && !interactive) {
    e.preventDefault();
    if (!e.repeat) pushHistory();
    const step = e.shiftKey ? 24 : 4;
    s.x += nudge[0] * step; s.y += nudge[1] * step;
    requestRender();
  } else if (s && (key === ']' || key === '[')) ACTIONS[key === ']' ? 'forward' : 'backward']();
  else if (key === 'escape') {
    e.preventDefault(); // otherwise this same Escape closes the confirm dialog it opens
    if (s) select(null);
    else leaveEditor();
  }
}
