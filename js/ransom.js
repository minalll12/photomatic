/* Ransom-note lettering, used only by the "Type your own" sticker tool.

   - five curated faces, every glyph scaled to the same visual cap height
     (measured from the real font, so a Bebas "M" and an Abril "c" match)
   - uppercase, with at most one lowercase or italic accent per word
   - equal tile padding and gaps, one shared baseline, tiny seeded jitter
   - five solid papers; patterns only as a border around a solid patch
   Layout is in "cap units" (cap height = 100), drawn onto a canvas. */
import { C, mulberry32, hashString, makeCanvas, fontsReady } from './utils.js';

export const FACES = {
  abril: { family: '"Abril Fatface", Georgia, serif', weight: 400, style: 'normal' },
  playfair: { family: '"Playfair Display", Georgia, serif', weight: 700, style: 'normal' },
  playfairItalic: { family: '"Playfair Display", Georgia, serif', weight: 700, style: 'italic' },
  elite: { family: '"Special Elite", "Courier New", monospace', weight: 400, style: 'normal' },
  bebas: { family: '"Bebas Neue", Impact, sans-serif', weight: 400, style: 'normal' },
  bodoni: { family: '"Bodoni Moda", Didot, serif', weight: 700, style: 'normal' },
};
const REGULAR = ['abril', 'playfair', 'elite', 'bebas', 'bodoni'];
const SERIF_LOWER = ['abril', 'playfair', 'bodoni'];
const ASCENDERS = 'bdfhklt';           // lowercase letters that reach cap height

// every pair passes AA (ink/cream 13.7, red-oxide/paper 9.5, ink/butter 11, cream/ink 13.7, cream/red-oxide 10.9)
const PAPERS = [
  { id: 'cream', bg: C.cream, ink: C.ink },
  { id: 'paper', bg: C.paper, ink: C.red },
  { id: 'butter', bg: C.butter, ink: C.ink },
  { id: 'ink', bg: C.ink, ink: C.cream },
  { id: 'oxide', bg: C.red, ink: C.cream },
];
const LIGHT = ['cream', 'paper', 'butter'];

// tile geometry in cap units
const PAD_Y = 34, PAD_X = 26, GAP = 12, WORD_GAP = GAP * 3, TILE_H = 100 + PAD_Y * 2;

/* --- font metrics (measured once the faces load) --- */
const metricCtx = makeCanvas(8, 8).getContext('2d');
const cache = new Map();
let measured = false;
const fontCss = (f, px) => `${f.style} ${f.weight} ${px}px ${f.family}`;
function glyph(faceId, ch) {
  const key = `${faceId}|${ch}|${measured}`;
  if (cache.has(key)) return cache.get(key);
  const f = FACES[faceId];
  metricCtx.font = fontCss(f, 200);
  const m = metricCtx.measureText(ch);
  const asc = m.actualBoundingBoxAscent || 140;
  const s = 100 / asc;                  // font px (at 200) -> scale so the glyph is 100 units tall
  const out = {
    size: 200 * s,
    left: (m.actualBoundingBoxLeft || 0) * s,
    width: ((m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || m.width)) * s,
  };
  cache.set(key, out);
  return out;
}
export const ransomReady = (async () => {
  await fontsReady;
  if (document.fonts && document.fonts.load) {
    await Promise.all(Object.values(FACES).map(f => document.fonts.load(fontCss(f, 40), 'AbcH')).map(p => p.catch(() => null)));
  }
  measured = true;
})();

/* --- layout --- */
export function ransomLayout(text, seed = 0) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  let prevFace = null, prevPaper = null;
  return words.map(word => {
    const rnd = mulberry32(hashString(word.toUpperCase()) + seed * 7919);
    const letters = [...word];
    // one deliberate accent per word (lowercase serif or italic), seeded
    const accent = letters.length >= 3 && rnd() < 0.7 ? Math.floor(rnd() * letters.length) : -1;
    const patterned = new Set();
    const maxPatterned = letters.length >= 6 ? 2 : 1;
    let x = 0;
    const tiles = letters.map((raw, i) => {
      let face, ch = raw.toUpperCase();
      if (i === accent && /[a-z]/i.test(raw)) {
        if (ASCENDERS.includes(raw.toLowerCase())) { ch = raw.toLowerCase(); face = SERIF_LOWER.filter(f => f !== prevFace)[Math.floor(rnd() * 2)]; }
        else face = prevFace === 'playfair' ? 'abril' : 'playfairItalic';
        if (face === 'abril' && prevFace === 'abril') face = 'bodoni';
      } else {
        const pool = REGULAR.filter(f => f !== prevFace && !(prevFace === 'playfairItalic' && f === 'playfair'));
        face = pool[Math.floor(rnd() * pool.length)];
      }
      const paperPool = PAPERS.filter(p => p.id !== prevPaper);
      const paper = paperPool[Math.floor(rnd() * paperPool.length)];
      let pattern = null;
      if (patterned.size < maxPatterned && LIGHT.includes(paper.id) && rnd() < 0.22 && !patterned.has(i - 1)) {
        pattern = rnd() < 0.5 ? 'gingham' : 'polka';
        patterned.add(i);
      }
      prevFace = face; prevPaper = paper.id;
      const g = glyph(face, ch);
      const w = Math.max(g.width + PAD_X * 2, 74);
      const tile = {
        ch, face, paper, pattern, x, w, g,
        rot: (rnd() - 0.5) * 6,                       // ±3°
        dy: (rnd() - 0.5) * 8,                        // ±4 units, about ±2px at heading sizes
        corners: [0, 1, 2, 3].map(() => [(rnd() - 0.5) * 6, (rnd() - 0.5) * 6]),
      };
      x += w + GAP;
      return tile;
    });
    return { word, tiles, width: x - GAP };
  });
}

const poly = t => {
  const [a, b, c, d] = t.corners;
  return [[t.x + a[0], a[1]], [t.x + t.w + b[0], b[1]], [t.x + t.w + c[0], TILE_H + c[1]], [t.x + d[0], TILE_H + d[1]]];
};
const pts = p => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/* --- canvas: the same layout, drawn at `cap` px cap height --- */
export function drawRansom(text, cap, { maxLineWords = 2 } = {}) {
  const words = ransomLayout(text.slice(0, 24), 3);
  const k = cap / 100;
  const lines = [];
  words.forEach((w, i) => { if (i % maxLineWords === 0) lines.push([]); lines[lines.length - 1].push(w); });
  const lineW = lines.map(l => l.reduce((a, w) => a + w.width, 0) + WORD_GAP * (l.length - 1));
  const W = (Math.max(...lineW) + 40) * k, H = (lines.length * (TILE_H + 36) + 20) * k;
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.scale(k, k);
  lines.forEach((l, li) => {
    let ox = 20 + (Math.max(...lineW) - lineW[li]) / 2;
    const oy = 14 + li * (TILE_H + 36);
    l.forEach(w => {
      w.tiles.forEach(t => {
        const p = poly(t), cx = t.x + t.w / 2;
        ctx.save();
        ctx.translate(ox, oy + t.dy);
        ctx.translate(cx, TILE_H / 2); ctx.rotate((t.rot * Math.PI) / 180); ctx.translate(-cx, -TILE_H / 2);
        const path = new Path2D(`M${p.map(q => q.join(' ')).join('L')}Z`);
        ctx.save();
        ctx.shadowColor = 'rgba(14,2,4,.32)'; ctx.shadowBlur = 6 * k; ctx.shadowOffsetX = 2 * k; ctx.shadowOffsetY = 4 * k;
        ctx.fillStyle = t.pattern === 'gingham' ? C.cream : t.pattern === 'polka' ? C.red : t.paper.bg;
        ctx.fill(path);
        ctx.restore();
        if (t.pattern) {
          ctx.save(); ctx.clip(path);
          if (t.pattern === 'gingham') {
            ctx.fillStyle = 'rgba(94,28,35,.45)';
            for (let x = t.x; x < t.x + t.w; x += 28) ctx.fillRect(x, 0, 14, TILE_H);
            for (let y = 0; y < TILE_H; y += 28) ctx.fillRect(t.x, y, t.w, 14);
          } else {
            ctx.fillStyle = C.blush;
            for (let y = 5.5; y < TILE_H; y += 11) for (let x = t.x + ((y / 11) % 2 ? 11 : 0) + 5.5; x < t.x + t.w; x += 22) { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); }
          }
          ctx.restore();
          ctx.fillStyle = t.paper.bg;
          ctx.fill(new Path2D(`M${p.map(([x, y]) => [x + (x < cx ? 9 : -9), y + (y < TILE_H / 2 ? 9 : -9)].join(' ')).join('L')}Z`));
        }
        ctx.strokeStyle = 'rgba(0,0,0,.16)'; ctx.lineWidth = 2; ctx.stroke(path);
        const f = FACES[t.face];
        ctx.font = fontCss(f, t.g.size);
        ctx.fillStyle = t.paper.ink;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(t.ch, t.x + (t.w - t.g.width) / 2 + t.g.left, PAD_Y + 100);
        ctx.restore();
      });
      ox += w.width + WORD_GAP;
    });
  });
  return c;
}
