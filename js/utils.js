/* Shared helpers: DOM, maths, seeded randomness, canvas drawing. */

export const C = {
  oxblood: '#3A0A0E',    // nav, curtain, primary
  red: '#5E1C23',        // red-oxide: primary buttons, key accents
  cherry: '#B3202A',     // accents (5.8:1 on cream)
  cream: '#F4EEE3',      // paper
  paper: '#E9DFCC',      // darker paper
  butter: '#EBD9A0',     // warm light accent
  kraft: '#C9A97A',      // desk, pockets (ink text only)
  ink: '#1F1A17',        // text
  muted: '#5C4B41',      // secondary text on light papers (not on kraft)
  blush: '#E8B4B8',      // warm light accent
  dusty: '#9FB4C7',      // dusty blue: cool accent
  sage: '#A7B49A',       // cool accent
  navy: '#1E2A44',       // the booth room, starry page
  gold: '#B8934A',       // pins, clips, rims
  orange: '#F08A2B',     // film-camera date digits
};

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const wait = ms => new Promise(r => setTimeout(r, ms));
export const pad2 = n => String(n).padStart(2, '0');
export const range = n => Array.from({ length: n }, (_, i) => i);
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];

const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
export const reducedMotion = () => motionQuery.matches;
export const isCoarse = () => matchMedia('(pointer: coarse)').matches;
// iPhone, iPod and iPad (iPadOS reports itself as a Mac with a touch screen)
export const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Tiny element factory: el('button', { className, text, html, attrs, dataset, style, on }, children)
/* Optional art (see assets/README.md): only files listed in assets/overrides.json are requested,
   so a missing override never costs a failed network request. Resolves to an image or null. */
const overrides = fetch('assets/overrides.json').then(r => (r.ok ? r.json() : [])).catch(() => []);
export const optionalImage = path => overrides.then(list => (list.includes(path) ? loadImage(path).catch(() => null) : null));

export function el(tag, { className, text, html, attrs, dataset, style, on } = {}, children = []) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  if (html != null) n.innerHTML = html;
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) n.setAttribute(k, v === true ? '' : v);
  if (dataset) Object.assign(n.dataset, dataset);
  if (style) for (const [k, v] of Object.entries(style)) n.style.setProperty(k, v);
  if (on) for (const [k, fn] of Object.entries(on)) n.addEventListener(k, fn);
  n.append(...children);
  return n;
}

// A screen or booth step has just appeared: state set in the same moment (a control enabled, focus moved)
// shows at once instead of transitioning in. Hover and later changes transition as usual.
export function settleNow(node) {
  node.classList.add('is-settling');
  clearTimeout(node.__settle);
  requestAnimationFrame(() => requestAnimationFrame(() => { node.__settle = setTimeout(() => node.classList.remove('is-settling'), 0); }));
}

export function restartAnimation(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}


// Deterministic PRNG so patterns, grain and ransom letters never change between renders
export function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function isDark(hex) {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

/* --- dates --- */
export const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const yy = d => String(d.getFullYear()).slice(2);
export const dateTypewriter = d => `${MONTHS[d.getMonth()]} ${pad2(d.getDate())} '${yy(d)}`;
export const dateSerif = d => `${MONTHS[d.getMonth()]} '${yy(d)}`;
export const dateDigital = d => `${pad2(d.getMonth() + 1)} ${pad2(d.getDate())} '${yy(d)}`;
export const dateLong = d => `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
export function fileStamp(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`;
}

/* --- canvas --- */
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function rrect(ctx, x, y, w, h, r) {
  const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.arcTo(x + w, y, x + w, y + h, tr);
  ctx.arcTo(x + w, y + h, x, y + h, br);
  ctx.arcTo(x, y + h, x, y, bl);
  ctx.arcTo(x, y, x + w, y, tl);
  ctx.closePath();
}
export function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}
export function dashLine(ctx, x1, y1, x2, y2, color, dash, width) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.restore();
}
// Shrink the font until text fits maxW; returns the size used
export function fitFont(ctx, make, size, text, maxW, min = 10) {
  let s = size;
  ctx.font = make(s);
  while (ctx.measureText(text).width > maxW && s > min) ctx.font = make(--s);
  return s;
}
export function heartPath(ctx, x, y, s) {
  // heart centred on (x, y), s = width
  const k = s / 100;
  ctx.beginPath();
  ctx.moveTo(x, y + 38 * k);
  ctx.bezierCurveTo(x - 30 * k, y + 16 * k, x - 44 * k, y - 2 * k, x - 40 * k, y - 20 * k);
  ctx.bezierCurveTo(x - 36 * k, y - 36 * k, x - 14 * k, y - 40 * k, x, y - 22 * k);
  ctx.bezierCurveTo(x + 14 * k, y - 40 * k, x + 36 * k, y - 36 * k, x + 40 * k, y - 20 * k);
  ctx.bezierCurveTo(x + 44 * k, y - 2 * k, x + 30 * k, y + 16 * k, x, y + 38 * k);
  ctx.closePath();
}
export function starPath(ctx, x, y, outer, inner, points = 5, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = rot + (i * Math.PI) / points;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}
export const svgUrl = svg => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

export const canvasToBlob = (canvas, type = 'image/png', q) => new Promise(res => canvas.toBlob(res, type, q));

// Canvas text needs the webfonts loaded first
export const fontsReady = (async () => {
  if (!document.fonts || !document.fonts.load) return;
  try {
    await Promise.all([
      '40px "UnifrakturMaguntia"', '40px "Pinyon Script"', '40px "Special Elite"',
      '40px "Abril Fatface"', '40px "Bebas Neue"', '700 40px "Bodoni Moda"',
      '400 40px "Playfair Display"', '700 40px "Playfair Display"', '900 40px "Playfair Display"',
      'italic 400 40px "Playfair Display"', 'italic 700 40px "Playfair Display"',
      '400 40px "DM Sans"', '500 40px "DM Sans"', '700 40px "DM Sans"', '800 40px "DM Sans"',
    ].map(f => document.fonts.load(f)));
  } catch { /* fall back to system fonts */ }
})();

export const FONT = {
  logo: s => `${s}px "UnifrakturMaguntia", serif`,
  serif: (s, w = 400) => `${w} ${s}px "Playfair Display", Didot, Georgia, serif`,
  serifItalic: (s, w = 400) => `italic ${w} ${s}px "Playfair Display", Didot, Georgia, serif`,
  sans: (s, w = 500) => `${w} ${s}px "DM Sans", system-ui, sans-serif`,
  script: s => `${s}px "Pinyon Script", cursive`,
  type: s => `${s}px "Special Elite", "Courier New", monospace`,
};

export const tracking = (ctx, px) => { if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`; };
