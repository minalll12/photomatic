/* Stickers: photo-real PNGs listed in /assets/stickers/stickers.json, shown
   exactly as provided (no recolouring, no outlines, no filters), plus the
   "Type your own" text tools: ransom letters, label tape and a typed note.
   The only thing ever added is an optional soft drop shadow at draw time. */
import { C, FONT, makeCanvas, mulberry32, hashString, loadImage, tracking } from './utils.js';
import { IMG } from './textures.js';
import { drawRansom } from './ransom.js';

const SCREEN_PX = 640;    // longest side used in the editor (big sources are downscaled)
const EXPORT_PX = 2048;   // longest side kept for exports (never upscaled)

/* =========================================================
   Type-your-own: each returns a canvas; u = resolution scale
   ========================================================= */
const textCanvas = (w, h) => { const c = makeCanvas(w, h); return [c, c.getContext('2d')]; };

const TEXT_STYLES = {
  ransom: (text, u) => drawRansom(text, 52 * u),

  // embossed label-maker tape
  label(text, u, variant = 'red') {
    const S = 40 * u, t = text.toUpperCase().slice(0, 22);
    const font = FONT.sans(S, 700);
    const m = makeCanvas(10, 10).getContext('2d');
    m.font = font; tracking(m, S * 0.14);
    const W = m.measureText(t).width + S * 1.6, H = S * 1.7;
    const [c, ctx] = textCanvas(W, H);
    const tape = variant === 'black' ? '#1E1916' : C.red;
    ctx.beginPath();
    ctx.moveTo(S * 0.2, 0); ctx.lineTo(W - S * 0.2, 0); ctx.lineTo(W, H / 2); ctx.lineTo(W - S * 0.2, H);
    ctx.lineTo(S * 0.2, H); ctx.lineTo(0, H / 2); ctx.closePath();
    ctx.fillStyle = tape; ctx.fill();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,.18)'); g.addColorStop(0.45, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.18)');
    ctx.fillStyle = g; ctx.fill();
    ctx.font = font; tracking(ctx, S * 0.14);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillText(t, W / 2 + S * 0.05, H / 2 + S * 0.07);
    ctx.fillStyle = '#F7F3EC'; ctx.fillText(t, W / 2, H / 2 + S * 0.02);
    return c;
  },

  // a typewritten note on a torn scrap of paper
  note(text, u) {
    const S = 26 * u, maxW = 300 * u;
    const m = makeCanvas(10, 10).getContext('2d');
    m.font = FONT.type(S);
    const words = text.slice(0, 60).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach(w => { const test = line ? `${line} ${w}` : w; if (m.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; });
    if (line) lines.push(line);
    const tw = Math.max(...lines.map(l => m.measureText(l).width), S * 3);
    const W = tw + S * 2.2, lh = S * 1.5, H = lines.length * lh + S * 2;
    const [c, ctx] = textCanvas(W, H);
    const rnd = mulberry32(hashString(text));
    // torn outline: jagged top and bottom, slightly uneven sides
    ctx.beginPath();
    ctx.moveTo(0, S * 0.3);
    for (let x = 0; x <= W; x += S * 0.4) ctx.lineTo(x, S * 0.15 + rnd() * S * 0.3);
    ctx.lineTo(W - rnd() * S * 0.15, H * 0.5);
    for (let x = W; x >= 0; x -= S * 0.4) ctx.lineTo(x, H - S * 0.15 - rnd() * S * 0.3);
    ctx.closePath();
    ctx.save();
    ctx.shadowColor = 'rgba(20,6,8,.25)'; ctx.shadowBlur = S * 0.2; ctx.shadowOffsetY = S * 0.08;
    ctx.fillStyle = '#F7F0E2'; ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.clip();
    if (IMG.grain) { ctx.fillStyle = ctx.createPattern(IMG.grain, 'repeat'); ctx.fillRect(0, 0, W, H); }
    ctx.fillStyle = 'rgba(177,199,212,.7)';
    lines.forEach((_, i) => ctx.fillRect(0, S + (i + 1) * lh - S * 0.25, W, Math.max(1, u)));
    ctx.restore();
    ctx.fillStyle = C.ink;
    ctx.font = FONT.type(S);
    ctx.textBaseline = 'alphabetic';
    lines.forEach((l, i) => ctx.fillText(l, S * 1.1, S + (i + 1) * lh - S * 0.4));
    return c;
  },
};

export const TYPE_STYLES = [
  { id: 'ransom', name: 'Ransom letters', kind: 'text', defaultText: 'besties' },
  { id: 'label', name: 'Label tape', kind: 'text', defaultText: 'fragile', variants: [['red', 'Red oxide'], ['black', 'Black']] },
  { id: 'note', name: 'Typed note', kind: 'text', defaultText: 'remember this one' },
];

/* =========================================================
   Catalogue: Type your own + packs from the manifest
   ========================================================= */
export const PACKS = [];                       // [{ id, name, items }] from stickers.json
export const DEFS = new Map(TYPE_STYLES.map(d => [d.id, d]));
export const isEditable = def => !!def && def.kind === 'text';

export async function loadStickerPacks() {
  PACKS.length = 0;
  try {
    const res = await fetch('assets/stickers/stickers.json', { cache: 'no-cache' });
    const list = res.ok ? await res.json() : [];
    if (!Array.isArray(list)) return PACKS;
    const byPack = new Map();
    list.filter(e => e && typeof e.file === 'string' && /\.png$/i.test(e.file)).forEach((e, i) => {
      const pack = (e.pack || 'Stickers').trim();
      const def = { id: `png-${i}-${e.file}`, name: e.name || e.file.replace(/\.png$/i, ''), kind: 'png', src: `assets/stickers/${encodeURIComponent(e.file)}`, pack };
      if (!byPack.has(pack)) byPack.set(pack, []);
      byPack.get(pack).push(def);
      DEFS.set(def.id, def);
    });
    byPack.forEach((items, name) => PACKS.push({ id: `pack-${hashString(name)}`, name, items }));
  } catch { /* no manifest: the drawer shows its empty state */ }
  return PACKS;
}

/* =========================================================
   Art pipeline: source image -> canvas at screen or export size
   ========================================================= */
const sources = new Map();   // def id -> Promise<HTMLImageElement | null>
const loaded = new Map();    // def id -> HTMLImageElement
const artCache = new Map();
let onArtReady = () => {};
export const setArtListener = fn => { onArtReady = fn; };

function loadSource(def) {
  if (!sources.has(def.id)) {
    sources.set(def.id, loadImage(def.src).then(img => { loaded.set(def.id, img); onArtReady(); return img; }).catch(() => null));
  }
  return sources.get(def.id);
}

function resized(img, longest) {
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
  const s = Math.min(1, longest / Math.max(w0, h0));    // never upscale
  if (s === 1) return img;
  const c = makeCanvas(w0 * s, h0 * s);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

const artKey = (s, q) => `${s.def}|${s.text || ''}|${s.variant || ''}|${q}`;

// Canvas (or image) for a sticker instance, or null while it loads
function getArt(s, quality = 'screen') {
  const key = artKey(s, quality);
  if (artCache.has(key)) return artCache.get(key);
  const def = DEFS.get(s.def);
  if (!def) return null;
  let art;
  if (def.kind === 'text') {
    art = TEXT_STYLES[def.id](s.text || def.defaultText, quality === 'export' ? 2.4 : 1, s.variant);
  } else {
    const img = loaded.get(def.id);
    if (!img) { loadSource(def); return null; }
    art = resized(img, quality === 'export' ? EXPORT_PX : SCREEN_PX);
  }
  if (artCache.size > 160) artCache.clear();
  artCache.set(key, art);
  return art;
}

export const ensureArt = stickers => Promise.all(stickers.map(s => {
  const def = DEFS.get(s.def);
  return def && def.kind === 'png' ? loadSource(def) : null;
}));

// Size of a sticker in logical units
export function stickerBox(s, art = getArt(s)) {
  if (!art) return { w: s.w, h: s.w };
  return { w: s.w, h: (s.w * art.height) / art.width };
}

export function drawSticker(ctx, s, { quality = 'screen', lifted = false } = {}) {
  const art = getArt(s, quality);
  if (!art) return;
  const { w, h } = stickerBox(s, art);
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.rot);
  if (s.flip) ctx.scale(-1, 1);
  if (lifted) ctx.scale(1.04, 1.04);
  if (s.shadow !== false) {
    // canvas shadows ignore the transform, so scale them by the device pixels per unit
    const k = Math.hypot(ctx.getTransform().a, ctx.getTransform().b);
    ctx.shadowColor = lifted ? 'rgba(20,6,8,.34)' : 'rgba(20,6,8,.28)';
    ctx.shadowBlur = w * (lifted ? 0.08 : 0.045) * k;
    ctx.shadowOffsetY = w * (lifted ? 0.04 : 0.022) * k;
  }
  ctx.drawImage(art, -w / 2, -h / 2, w, h);
  ctx.restore();
}

// The art of a Type-your-own sticker with given words (the editor's sticker-sheet prop)
export const stickerArt = (def, text = '', variant = '') => getArt({ def: def.id, text, variant: variant || (def.variants ? def.variants[0][0] : '') });

// Lightweight thumbnail for the picker (downscaled, square-fitted)
export async function stickerThumb(def, px = 128) {
  if (def.kind === 'png') { if (!(await loadSource(def))) return null; }
  const art = getArt({ def: def.id, text: '', variant: def.variants ? def.variants[0][0] : '' });
  if (!art) return null;
  const s = px / Math.max(art.width, art.height);
  const w = art.width * s, h = art.height * s;
  const c = makeCanvas(px, px);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(art, (px - w) / 2, (px - h) / 2, w, h);
  return c;
}
