/* Paper backgrounds shared by the strip, ransom tiles and the story collages. */
import { C, isDark, mulberry32, starPath } from './utils.js';

export const BG_SWATCHES = [
  [C.cream, 'Cream'], [C.paper, 'Paper'], [C.red, 'Red oxide'], [C.oxblood, 'Oxblood'],
  [C.ink, 'Ink'], [C.butter, 'Butter'], [C.dusty, 'Dusty blue'], [C.navy, 'Navy'],
];

export const PATTERNS = [
  { id: 'solid', name: 'Plain' },
  { id: 'polka', name: 'Polka dot' },
  { id: 'gingham', name: 'Gingham' },
  { id: 'stripe', name: 'Candy stripe' },
  { id: 'stars', name: 'Stars' },
  { id: 'checker', name: 'Checkerboard' },
];

export const bgIsDark = bg => isDark(bg.color);

// Fill a rectangle with a paper colour + pattern. `u` scales the motif size.
export function fillBackground(ctx, bg, x, y, w, h, u = 1, seed = 11) {
  const base = bg.color, dark = isDark(base);
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);

  if (bg.pattern === 'polka') {
    // blush on dark papers, ink on light ones
    const step = 28 * u, r = 5 * u;
    ctx.fillStyle = dark ? C.blush : 'rgba(42,33,28,.82)';
    for (let row = 0, py = y + step / 2; py < y + h + step; py += step * 0.866, row++) {
      for (let px = x + (row % 2 ? step / 2 : 0); px < x + w + step; px += step) {
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
      }
    }
  } else if (bg.pattern === 'gingham') {
    const s = 16 * u;
    ctx.fillStyle = dark ? 'rgba(244,238,227,.26)' : 'rgba(94,28,35,.36)';
    for (let px = x; px < x + w; px += s * 2) ctx.fillRect(px, y, s, h);
    for (let py = y; py < y + h; py += s * 2) ctx.fillRect(x, py, w, s);
  } else if (bg.pattern === 'stripe') {
    const s = 14 * u;
    ctx.fillStyle = dark ? 'rgba(244,238,227,.88)' : C.red;
    for (let px = x + s; px < x + w; px += s * 2) ctx.fillRect(px, y, s, h);
  } else if (bg.pattern === 'stars') {
    const rnd = mulberry32(seed);
    const count = Math.round((w * h) / (1700 * u * u));
    const ink = dark ? [244, 238, 227] : [94, 28, 35];
    for (let i = 0; i < count; i++) {
      const px = x + rnd() * w, py = y + rnd() * h, big = rnd();
      ctx.fillStyle = `rgba(${ink},${0.45 + rnd() * 0.5})`;
      if (big > 0.9) { starPath(ctx, px, py, 4.5 * u, 1.4 * u, 4, 0); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(px, py, (0.6 + big * 1.2) * u, 0, Math.PI * 2); ctx.fill(); }
    }
  } else if (bg.pattern === 'checker') {
    const s = 20 * u;
    ctx.fillStyle = dark ? C.cream : C.ink;
    for (let row = 0, py = y; py < y + h; py += s, row++) {
      for (let px = x + (row % 2) * s; px < x + w; px += s * 2) ctx.fillRect(px, py, s, s);
    }
  }
  ctx.restore();
}
