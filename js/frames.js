/* Twelve strip frames in three groups. Every frame is drawn on the canvas,
   so the editor, the PNG export, the reveal and the story collage match.

   A frame can provide:
     metrics(horizontal, design, variant)  paddings and the gutter between photos
     drawBg / backing (behind each photo) / drawFg / punch (holes) / under
     footer(L) + drawText(L)               its own text spots instead of the
                                           standard caption / date / dedication block
   Every hook receives (ctx, L, v) where v is the chosen colour variant. */
import { C, FONT, rrect, circle, tracking, fitFont, mulberry32, hashString, pad2, MONTHS, heartPath, starPath } from './utils.js';
import { fillBackground } from './patterns.js';
import { IMG, grainOver, drawLetterPaper, drawSafetyPin, drawWaxSeal } from './textures.js';
import { state } from './state.js';
import { LAYOUTS } from './layouts.js';

const D = () => state.design;
const seeded = () => mulberry32(hashString(D().shotDate.toISOString().slice(0, 16)));
const dateOf = () => {
  const d = D();
  if (d.date.text.trim()) return d.date.text.trim();
  const s = d.shotDate;
  return `${MONTHS[s.getMonth()]} ${pad2(s.getDate())} '${String(s.getFullYear()).slice(2)}`;
};
const timeOf = () => { const s = D().shotDate; return `${pad2(s.getHours())}:${pad2(s.getMinutes())}`; };
const showDate = () => D().date.show;
const caption = () => D().caption.trim();
const dedication = () => D().dedication.trim();

function text(ctx, str, x, y, font, color, { align = 'center', track = 0, base = 'middle', max } = {}) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  tracking(ctx, track);
  if (max) { const size = parseFloat(font.match(/(\d+(\.\d+)?)px/)[1]); fitFont(ctx, s => font.replace(/\d+(\.\d+)?px/, `${s}px`), size, str, max, 9); }
  ctx.fillText(str, x, y);
  ctx.restore();
}

// Map a band drawn along the top edge (u = along, v = depth) onto every edge
function eachEdge(ctx, L, edges, fn) {
  const all = {
    top: [[1, 0, 0, 1, 0, 0], L.W],
    bottom: [[-1, 0, 0, -1, L.W, L.H], L.W],
    left: [[0, -1, 1, 0, 0, L.H], L.H],
    right: [[0, 1, -1, 0, L.W, 0], L.H],
  };
  edges.forEach(e => { const [m, len] = all[e]; ctx.save(); ctx.transform(...m); fn(len); ctx.restore(); });
}
const FOUR = ['top', 'right', 'bottom', 'left'];

function barcode(ctx, x, y, w, h, seed, color) {
  const rnd = mulberry32(seed);
  ctx.fillStyle = color;
  for (let px = x; px < x + w;) {
    const bw = 1 + Math.floor(rnd() * 3);
    if (rnd() > 0.35) ctx.fillRect(px, y, bw, h);
    px += bw + 1 + Math.floor(rnd() * 2);
  }
}

// A rubber stamp: rounded box, ink a little uneven
function stamp(ctx, label, x, y, rot, color, size = 26) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = 0.82;
  ctx.strokeStyle = ctx.fillStyle = color;
  ctx.font = FONT.sans(size, 800);
  tracking(ctx, size * 0.12);
  const w = ctx.measureText(label).width + size * 1.1, h = size * 1.6;
  ctx.lineWidth = size * 0.12;
  rrect(ctx, -w / 2, -h / 2, w, h, size * 0.25); ctx.stroke();
  ctx.lineWidth = size * 0.05;
  rrect(ctx, -w / 2 + size * 0.2, -h / 2 + size * 0.2, w - size * 0.4, h - size * 0.4, size * 0.15); ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, size * 0.06, size * 0.06);
  ctx.globalCompositeOperation = 'destination-out';
  if (IMG.grain) { ctx.globalAlpha = 0.45; ctx.fillStyle = ctx.createPattern(IMG.grain, 'repeat'); ctx.fillRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8); }
  ctx.restore();
}

/* --- lace: scalloped band with eyelets, picots and mesh, all four sides --- */
const LACE_D = 50, LACE_R = 11;
function laceBand(ctx, len, col) {
  const R = LACE_R, n = Math.floor((len - LACE_D * 2) / (R * 2)), u0 = (len - n * R * 2) / 2;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(0, LACE_D); ctx.lineTo(0, R * 1.4); ctx.lineTo(u0, R * 1.4);
  for (let k = 0; k < n; k++) ctx.arc(u0 + R + k * R * 2, R * 1.1, R, Math.PI, 0, false);
  ctx.lineTo(len, R * 1.4); ctx.lineTo(len, LACE_D); ctx.closePath();
  ctx.fill();
}
function lacePunch(ctx, len) {
  const R = LACE_R, n = Math.floor((len - LACE_D * 2) / (R * 2)), u0 = (len - n * R * 2) / 2;
  for (let k = 0; k < n; k++) {
    const c = u0 + R + k * R * 2;
    circle(ctx, c, R * 1.15, 3.6); ctx.fill();
    circle(ctx, c + R, R * 2.1, 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(c, R * 2.9, 2.6, 5.5, 0, 0, Math.PI * 2); ctx.fill();
    for (let j = 0; j < 2; j++) { circle(ctx, c - R * 0.5 + j * R, LACE_D - 9, 1.2); ctx.fill(); }
  }
}
function laceCorner(ctx, x, y, col, holes) {
  const r = LACE_D * 0.86;
  if (!holes) {
    ctx.fillStyle = col;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) ctx.arc(x + Math.cos((i / 12) * Math.PI * 2) * r * 0.8, y + Math.sin((i / 12) * Math.PI * 2) * r * 0.8, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    circle(ctx, x, y, r * 0.82); ctx.fill();
    return;
  }
  circle(ctx, x, y, 5); ctx.fill();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r * 0.42, y + Math.sin(a) * r * 0.42, 2.4, 6, a + Math.PI / 2, 0, Math.PI * 2); ctx.fill();
    circle(ctx, x + Math.cos(a + 0.39) * r * 0.78, y + Math.sin(a + 0.39) * r * 0.78, 2); ctx.fill();
  }
}
const laceCorners = L => [[LACE_D * 0.6, LACE_D * 0.6], [L.W - LACE_D * 0.6, LACE_D * 0.6], [LACE_D * 0.6, L.H - LACE_D * 0.6], [L.W - LACE_D * 0.6, L.H - LACE_D * 0.6]];

/* --- perforated stamp edge around a rect (clip with evenodd, then fill) --- */
function stampPath(ctx, x, y, w, h, r, pitch) {
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  const nx = Math.round(w / pitch), ny = Math.round(h / pitch);
  for (let i = 0; i <= nx; i++) { const px = x + (i * w) / nx; ctx.moveTo(px + r, y); ctx.arc(px, y, r, 0, Math.PI * 2); ctx.moveTo(px + r, y + h); ctx.arc(px, y + h, r, 0, Math.PI * 2); }
  for (let j = 1; j < ny; j++) { const py = y + (j * h) / ny; ctx.moveTo(x + r, py); ctx.arc(x, py, r, 0, Math.PI * 2); ctx.moveTo(x + w + r, py); ctx.arc(x + w, py, r, 0, Math.PI * 2); }
}

/* --- an engraved little locomotive for the ticket --- */
function train(ctx, x, y, s, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.strokeStyle = ctx.fillStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.rect(14, 10, 30, 14); ctx.stroke();           // boiler
  for (let k = 17; k < 44; k += 4) { ctx.beginPath(); ctx.moveTo(k, 11); ctx.lineTo(k, 23); ctx.lineWidth = 0.6; ctx.stroke(); }
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.rect(44, 2, 14, 22); ctx.stroke();            // cab
  ctx.beginPath(); ctx.rect(47, 5, 8, 7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(20, 10); ctx.lineTo(18, 0); ctx.lineTo(26, 0); ctx.lineTo(25, 10); ctx.stroke(); // chimney
  ctx.beginPath(); ctx.moveTo(14, 24); ctx.lineTo(4, 30); ctx.lineTo(14, 30); ctx.closePath(); ctx.stroke(); // cowcatcher
  [[20, 29, 5], [33, 29, 5], [51, 28, 6]].forEach(([cx, cy, r]) => { circle(ctx, cx, cy, r); ctx.stroke(); circle(ctx, cx, cy, 1.2); ctx.fill(); });
  ctx.beginPath(); ctx.moveTo(20, 29); ctx.lineTo(51, 28); ctx.lineWidth = 1.2; ctx.stroke();
  ctx.restore();
}

/* --- Photomatic's own mark for the foot of a print: a gold hairline broken
       by a small cherry star, the blackletter wordmark, the date below --- */
function printMark(ctx, cx, y, w, { date = '', ink = C.cream, scale = 1 } = {}) {
  const k = scale;
  ctx.save();
  ctx.strokeStyle = 'rgba(184,147,74,.9)';
  ctx.lineWidth = Math.max(0.75, 1.2 * k);
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, y); ctx.lineTo(cx - 12 * k, y);
  ctx.moveTo(cx + 12 * k, y); ctx.lineTo(cx + w / 2, y);
  ctx.stroke();
  ctx.fillStyle = C.cherry;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = (i % 2 ? 2.4 : 6) * k, a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath(); ctx.fill();
  ctx.restore();
  text(ctx, 'Photomatic', cx, y + 34 * k, FONT.logo(38 * k), ink);
  if (date) text(ctx, date, cx, y + 66 * k, FONT.type(14 * k), ink, { track: 3 * k });
}

/* ---- occasions drawing helpers ---- */
/* The border, the corner flourishes and the divider are shared by every Occasions frame and nothing
   else, so they take their scale from the plan: a film row is twice the width of a tall strip, and
   a 12px inset that reads as a margin on one reads as a hairline on the other. */
function occBorder(ctx, W, H, col) {
  const u = occPlan().u;
  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = 1.5 * u;
  ctx.strokeRect(12 * u, 12 * u, W - 24 * u, H - 24 * u);
  ctx.globalAlpha = 0.4; ctx.lineWidth = 1 * u;
  ctx.strokeRect(20 * u, 20 * u, W - 40 * u, H - 40 * u);
  ctx.restore();
}
function occStars(ctx, W, topH, col, seed, n) {
  const rnd = mulberry32(seed);
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 0.8;
  for (let i = 0; i < n; i++) {
    const x = 28 + rnd() * (W - 56), y = 28 + rnd() * Math.max(1, topH - 36);
    const r = 2.5 + rnd() * 3.5, pts = rnd() > 0.4 ? 4 : 6;
    ctx.beginPath(); ctx.globalAlpha = 0.4 + rnd() * 0.45;
    for (let j = 0; j < pts * 2; j++) {
      const ri = j % 2 ? r * 0.38 : r, a = -Math.PI / 2 + j * Math.PI / pts;
      const px = x + Math.cos(a) * ri, py = y + Math.sin(a) * ri;
      j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
  }
  ctx.restore();
}
/* Two arcs in one path, filled even-odd: the bite is a hole in this shape only. Cutting it with
   destination-out instead would erase whatever had already been drawn underneath, which on a dark
   frame reads as a black disc rather than a moon. */
function occCrescent(ctx, cx, cy, r, col) {
  ctx.save(); ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.44, cy - r * 0.08, r * 0.76, 0, Math.PI * 2);
  ctx.fill('evenodd');
  ctx.restore();
}
function occBat(ctx, cx, cy, s, col) {
  ctx.save(); ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.08);
  ctx.bezierCurveTo(cx - s * 0.12, cy - s * 0.28, cx - s * 0.52, cy - s * 0.52, cx - s, cy - s * 0.18);
  ctx.bezierCurveTo(cx - s * 0.7, cy - s * 0.04, cx - s * 0.38, cy + s * 0.1, cx - s * 0.16, cy + s * 0.24);
  ctx.bezierCurveTo(cx - s * 0.06, cy + s * 0.06, cx, cy + s * 0.08, cx, cy + s * 0.08);
  ctx.bezierCurveTo(cx, cy + s * 0.08, cx + s * 0.06, cy + s * 0.06, cx + s * 0.16, cy + s * 0.24);
  ctx.bezierCurveTo(cx + s * 0.38, cy + s * 0.1, cx + s * 0.7, cy - s * 0.04, cx + s, cy - s * 0.18);
  ctx.bezierCurveTo(cx + s * 0.52, cy - s * 0.52, cx + s * 0.12, cy - s * 0.28, cx, cy + s * 0.08);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
function occGradCap(ctx, cx, cy, s, col) {
  ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx - s, cy); ctx.lineTo(cx, cy - s * 0.3);
  ctx.lineTo(cx + s, cy); ctx.lineTo(cx, cy + s * 0.3); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.5, cy + s * 0.06);
  ctx.lineTo(cx - s * 0.5, cy + s * 0.72);
  ctx.bezierCurveTo(cx - s * 0.5, cy + s * 0.9, cx + s * 0.5, cy + s * 0.9, cx + s * 0.5, cy + s * 0.72);
  ctx.lineTo(cx + s * 0.5, cy + s * 0.06); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.08, cy - s * 0.04);
  ctx.lineTo(cx + s * 0.42, cy + s * 0.38);
  ctx.lineTo(cx + s * 0.42, cy + s * 0.65); ctx.stroke();
  circle(ctx, cx + s * 0.42, cy + s * 0.68, s * 0.07); ctx.fill();
  ctx.restore();
}
function occRings(ctx, cx, cy, r, col) {
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1.8;
  circle(ctx, cx - r * 0.52, cy, r); ctx.stroke();
  circle(ctx, cx + r * 0.52, cy, r); ctx.stroke();
  ctx.restore();
}
function occBow(ctx, cx, cy, s, col) {
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.bezierCurveTo(cx - s * 0.55, cy - s * 0.6, cx - s * 1.4, cy - s * 0.2, cx - s, cy + s * 0.2);
  ctx.bezierCurveTo(cx - s * 0.65, cy + s * 0.45, cx - s * 0.18, cy + s * 0.16, cx, cy); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.bezierCurveTo(cx + s * 0.55, cy - s * 0.6, cx + s * 1.4, cy - s * 0.2, cx + s, cy + s * 0.2);
  ctx.bezierCurveTo(cx + s * 0.65, cy + s * 0.45, cx + s * 0.18, cy + s * 0.16, cx, cy); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy); ctx.lineTo(cx - s * 0.5, cy + s * 0.65);
  ctx.moveTo(cx, cy); ctx.lineTo(cx + s * 0.5, cy + s * 0.65); ctx.stroke();
  ctx.fillStyle = col; circle(ctx, cx, cy, s * 0.1); ctx.fill();
  ctx.restore();
}
function occCloud(ctx, cx, cy, w, col) {
  const r = w * 0.2;
  ctx.save(); ctx.fillStyle = col;
  ctx.beginPath();
  [[-0.30, 0.05, 0.76], [-0.15, -0.05, 0.92], [0.02, -0.11, 1], [0.19, -0.03, 0.88], [0.32, 0.06, 0.72]]
    .forEach(([dx, dy, k]) => { const x = cx + dx * w, y = cy + dy * w; ctx.moveTo(x + r * k, y); ctx.arc(x, y, r * k, 0, Math.PI * 2); });
  ctx.rect(cx - w * 0.36, cy, w * 0.72, r * 0.6);
  ctx.fill();
  ctx.restore();
}
function occConfetti(ctx, W, topH, cols, seed) {
  const rnd = mulberry32(seed);
  ctx.save();
  for (let i = 0; i < 34; i++) {
    const x = rnd() * W, y = 26 + rnd() * Math.max(1, topH - 36), s = 2.5 + rnd() * 3.5;
    ctx.globalAlpha = 0.45 + rnd() * 0.4; ctx.fillStyle = cols[i % cols.length];
    ctx.save(); ctx.translate(x, y); ctx.rotate(rnd() * Math.PI * 2);
    if (rnd() > 0.45) ctx.fillRect(-s, -s / 2.2, s * 2, s);
    else { ctx.beginPath(); circle(ctx, 0, 0, s * 0.7); ctx.fill(); }
    ctx.restore();
  }
  ctx.restore();
}
function occPartyHat(ctx, cx, cy, s, col) {
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.62, cy + s * 0.88); ctx.lineTo(cx, cy - s * 0.48);
  ctx.lineTo(cx + s * 0.62, cy + s * 0.88); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.88, s * 0.62, s * 0.14, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = col; circle(ctx, cx, cy - s * 0.52, s * 0.09); ctx.fill();
  ctx.save(); ctx.globalAlpha = 0.45; ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.22, cy + s * 0.06); ctx.lineTo(cx + s * 0.02, cy + s * 0.55);
  ctx.moveTo(cx + s * 0.14, cy - s * 0.18); ctx.lineTo(cx + s * 0.38, cy + s * 0.38);
  ctx.stroke(); ctx.restore(); ctx.restore();
}
function occBowtie(ctx, cx, cy, s, col) {
  ctx.save(); ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.1, cy - s * 0.18);
  ctx.bezierCurveTo(cx - s * 0.28, cy - s * 0.44, cx - s * 1.1, cy - s * 0.38, cx - s, cy);
  ctx.bezierCurveTo(cx - s * 1.1, cy + s * 0.38, cx - s * 0.28, cy + s * 0.44, cx - s * 0.1, cy + s * 0.18);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.1, cy - s * 0.18);
  ctx.bezierCurveTo(cx + s * 0.28, cy - s * 0.44, cx + s * 1.1, cy - s * 0.38, cx + s, cy);
  ctx.bezierCurveTo(cx + s * 1.1, cy + s * 0.38, cx + s * 0.28, cy + s * 0.44, cx + s * 0.1, cy + s * 0.18);
  ctx.closePath(); ctx.fill();
  ctx.beginPath(); rrect(ctx, cx - s * 0.1, cy - s * 0.18, s * 0.2, s * 0.36, s * 0.05); ctx.fill();
  ctx.restore();
}

/* From October on, the new year being celebrated is the one about to start, not the one ending. */
const occYear = () => { const s = D().shotDate; return s.getMonth() >= 9 ? s.getFullYear() + 1 : s.getFullYear(); };
/* Frames with a year in the headline (Class of, Prom) let the caption override it, but only when the
   caption actually reads as a year — otherwise it is a name and belongs in the footer like anywhere else. */
const YEARISH = /^'?\d{2}$|^\d{4}$/;
const occHeadYear = () => (YEARISH.test(caption()) ? caption().replace(/^'/, '') : String(D().shotDate.getFullYear()));
const occFreeCaption = () => (YEARISH.test(caption()) ? '' : caption());

/* edges fall off into the paper, so a flat fill reads as a print rather than a swatch */
function occVignette(ctx, W, H, col, amount) {
  const g = ctx.createRadialGradient(W / 2, H * 0.42, Math.min(W, H) * 0.28, W / 2, H * 0.5, Math.max(W, H) * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, col);
  ctx.save(); ctx.globalAlpha = amount; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
}
/* an L-rule with an inward curl; sx/sy flip the same shape into each corner */
function occCornerFlourish(ctx, x, y, s, col, sx, sy) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(sx, sy);
  ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, s); ctx.lineTo(0, 0); ctx.lineTo(s, 0); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, s * 0.6);
  ctx.bezierCurveTo(s * 0.32, s * 0.54, s * 0.54, s * 0.32, s * 0.6, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(s * 0.22, s * 0.22);
  ctx.bezierCurveTo(s * 0.46, s * 0.22, s * 0.54, s * 0.34, s * 0.36, s * 0.38);
  ctx.bezierCurveTo(s * 0.21, s * 0.41, s * 0.21, s * 0.28, s * 0.32, s * 0.28);
  ctx.stroke();
  ctx.restore();
}
function occFrameCorners(ctx, W, H, inset, s, col) {
  const u = occPlan().u, i = inset * u, z = s * u;
  occCornerFlourish(ctx, i, i, z, col, 1, 1);
  occCornerFlourish(ctx, W - i, i, z, col, -1, 1);
  occCornerFlourish(ctx, i, H - i, z, col, 1, -1);
  occCornerFlourish(ctx, W - i, H - i, z, col, -1, -1);
}
/* hairline — open diamond — hairline */
function occDivider(ctx, W, y, col, half = 84) {
  const u = occPlan().u, L = half * u, g = 13 * u, d = 4.5 * u;
  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = 1 * u; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(W / 2 - L, y); ctx.lineTo(W / 2 - g, y);
  ctx.moveTo(W / 2 + g, y); ctx.lineTo(W / 2 + L, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(W / 2, y - d); ctx.lineTo(W / 2 + d * 1.16, y); ctx.lineTo(W / 2, y + d); ctx.lineTo(W / 2 - d * 1.16, y);
  ctx.closePath(); ctx.stroke();
  ctx.restore();
}
/* a banner with folded tails; the caller draws the title over it */
function occRibbon(ctx, cx, cy, w, h, fill, edge) {
  const half = w / 2, t = h * 0.5;
  ctx.save();
  ctx.fillStyle = edge;
  [-1, 1].forEach(d => {
    ctx.beginPath();
    ctx.moveTo(cx + d * half, cy - t * 0.62);
    ctx.lineTo(cx + d * (half + h * 0.46), cy - t * 0.24);
    ctx.lineTo(cx + d * (half + h * 0.46), cy + t * 0.8);
    ctx.lineTo(cx + d * half, cy + t * 0.42);
    ctx.closePath(); ctx.fill();
  });
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(cx - half, cy - t); ctx.lineTo(cx + half, cy - t); ctx.lineTo(cx + half, cy + t);
  ctx.lineTo(cx, cy + t * 0.72); ctx.lineTo(cx - half, cy + t);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}
/* firework burst: alternating long/short rays with dotted tips */
function occBurst(ctx, cx, cy, r, col, rays = 12) {
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = col; ctx.lineWidth = 0.9; ctx.lineCap = 'round';
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2, rr = i % 2 ? r * 0.6 : r;
    ctx.globalAlpha = 0.72;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.24, cy + Math.sin(a) * r * 0.24);
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    ctx.stroke();
    ctx.globalAlpha = 0.95;
    circle(ctx, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1.3); ctx.fill();
  }
  ctx.globalAlpha = 0.28;
  circle(ctx, cx, cy, r * 0.36); ctx.stroke();
  ctx.restore();
}
/* a ring of holly leaves with berry clusters */
function occWreath(ctx, cx, cy, r, leafCol, berryCol) {
  ctx.save();
  ctx.strokeStyle = leafCol; ctx.lineWidth = 1.1;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.rotate(a + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.21);
    ctx.bezierCurveTo(r * 0.23, -r * 0.1, r * 0.21, r * 0.14, 0, r * 0.21);
    ctx.bezierCurveTo(-r * 0.21, r * 0.14, -r * 0.23, -r * 0.1, 0, -r * 0.21);
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = berryCol;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    [[0, 0], [r * 0.09, r * 0.05], [-r * 0.04, r * 0.09]].forEach(([dx, dy]) => {
      circle(ctx, cx + Math.cos(a) * r + dx, cy + Math.sin(a) * r + dy, r * 0.055); ctx.fill();
    });
  }
  ctx.restore();
}
/* =========================================================
   Occasions: one proportion system

   Every measurement is a share of the strip's own width or height, so a frame holds together at any
   export scale and reads the same on a tall strip, a grid, a film row or a stack: side margins at
   6.5% of the width, gutters at 3%, a header at 15% of the height and a footer band at 9%. The
   height depends on the header and the footer and both are shares of the height, so it settles over
   a few passes rather than being solved. A film row's width in turn depends on the very margins
   being sized from it, so that settles too.
   ========================================================= */
const OCC = { pad: 0.065, gap: 0.03, top: 0.15, foot: 0.09, bot: 0.03 };

/* Type sizes as shares of S, the print's short side. Keyed to the width instead, a title would come
   out three times the size on a film row as on a tall strip; the short side is what the eye reads
   the print's size by, so the type stays the same weight on all four layouts. The date is
   deliberately the second largest thing in the frame: at 13px it could not be read in the editor's
   preview at all. */
const occType = (S) => ({
  title: Math.round(S * 0.062),
  year: Math.round(S * 0.046),
  small: Math.round(S * 0.026),
  date: Math.round(S * 0.055),
  cap: Math.round(S * 0.040),
  ded: Math.round(S * 0.058),
});

// what the footer's own text needs, so the band never crops it when a caption or dedication is set
function occFootNeed(S) {
  const t = occType(S);
  let h = S * 0.052;
  if (caption()) h += t.cap * 1.7;
  if (showDate()) h += t.date * 1.5;
  if (dedication()) h += t.ded * 1.6;
  return Math.round(h + S * 0.028);
}

let occKey = '', occVal = null;
function occPlan(d = D()) {
  const n = d.photos.length;
  const key = [d.frame, d.layout, n, caption(), dedication(), showDate()].join('|');
  if (key === occKey && occVal) return occVal;
  const lay = LAYOUTS[d.layout] || LAYOUTS.strip;
  let W = lay.width(n, 32, 24);
  for (let i = 0; i < 4; i++) W = lay.width(n, W * OCC.pad, W * OCC.gap);
  const pad = Math.round(W * OCC.pad), gap = Math.round(W * OCC.gap);
  W = Math.round(lay.width(n, pad, gap));
  const P = lay.arrange(n, W - pad * 2, gap).h;      // the photos' own height, from the real layout
  /* The type is sized from the height and the height from the type, so let the pair settle.
     A film row is three times wider than it is tall, and 15% of that height is a band too shallow
     to hold a title and a motif at all — the type ends up over the photos. A strip that wide gets a
     deeper header instead, which costs it a few points of the 14-16% the taller layouts hold to. */
  let H = P / (1 - OCC.top - OCC.foot), S = Math.min(W, H), need = occFootNeed(S), share = OCC.top;
  for (let i = 0; i < 6; i++) {
    S = Math.min(W, H);
    share = W > H * 1.5 ? 0.26 : OCC.top;
    need = occFootNeed(S);
    H = (P + Math.max((OCC.foot - OCC.bot) * H, need)) / (1 - share - OCC.bot);
  }
  const top = Math.round(H * share), t = occType(S);
  // a film row's header is a thin band next to its width; the title follows the band it sits in
  t.title = Math.min(t.title, Math.round(top * 0.34));
  t.year = Math.min(t.year, Math.round(top * 0.26));
  occKey = key;
  occVal = {
    W, pad, gap, top, S,
    bottom: Math.round(H * OCC.bot),
    footer: Math.max(Math.round((OCC.foot - OCC.bot) * H), need),
    t,
    u: S / 600,                                      // one unit: the old 600-wide strip's scale
  };
  return occVal;
}
const occMetrics = (horizontal, d = D()) => {
  const p = occPlan(d);
  return { pad: p.pad, top: p.top, gap: p.gap, footerGap: 0, bottom: p.bottom };
};
const occFooterH = () => occPlan().footer;

/* The header box every Occasions frame lays its title and motif inside: the full width, inset by
   the side margin, from the top edge down to where the photos start. Positions inside it are given
   as fractions of the box, so the same drawing fits whatever shape the strip is. */
const occHead = (L) => {
  const p = occPlan();
  return { x: p.pad, y: 0, w: L.W - p.pad * 2, h: p.top, cx: L.W / 2, t: p.t, u: p.u, pad: p.pad };
};
// and the footer box, from the end of the photos to the bottom edge
const occFoot = (L) => {
  const p = occPlan();
  return { x: p.pad, y: L.photosEnd, w: L.W - p.pad * 2, h: L.H - L.photosEnd, cx: L.W / 2, t: p.t, u: p.u };
};

/* The footer every Occasions frame shares: a rule, then whichever of caption / date / dedication
   are set. One place, so the date is the same readable size on all twelve. `script` and `cap` let a
   frame keep its own voice for the caption and dedication. */
function occFooterDraw(ctx, L, o) {
  const g = occFoot(L), t = g.t, u = g.u, W = L.W;
  occDivider(ctx, W, g.y + 18 * u, o.rule);
  let y = g.y + 46 * u;
  if (caption()) {
    text(ctx, caption(), g.cx, y, (o.capFont || FONT.type)(t.cap), o.cap, { max: g.w * 0.9 });
    y += t.cap * 1.7;
  }
  if (showDate()) {
    text(ctx, dateOf().toUpperCase(), g.cx, y, FONT.type(t.date), o.date,
      { track: t.date * 0.17, max: g.w * 0.92 });
    y += t.date * 1.5;
  }
  if (dedication()) {
    text(ctx, dedication(), g.cx, y, (o.dedFont || FONT.script)(t.ded), o.ded, { max: g.w * 0.9 });
  }
}

/* =========================================================
   Line-art for the three redesigned frames

   All of it is drawn as fine strokes in the Photomatic palette, sized from a single `s`, so it sits
   with the rest of the site rather than on top of it.
   ========================================================= */

/* a sprig of holly: two leaves off a stem with a cluster of berries */
function occHolly(ctx, cx, cy, s, leafCol, berryCol, turn = 0) {
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(turn);
  ctx.strokeStyle = leafCol; ctx.lineWidth = s * 0.05; ctx.lineJoin = 'round';
  [-1, 1].forEach(d => {
    ctx.save(); ctx.scale(d, 1);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    // a leaf edge with three points a side, the way a holly leaf is drawn
    ctx.quadraticCurveTo(s * 0.26, -s * 0.34, s * 0.52, -s * 0.2);
    ctx.quadraticCurveTo(s * 0.4, -s * 0.12, s * 0.62, -s * 0.06);
    ctx.quadraticCurveTo(s * 0.44, s * 0.04, s * 0.58, s * 0.16);
    ctx.quadraticCurveTo(s * 0.3, s * 0.14, s * 0.2, s * 0.3);
    ctx.quadraticCurveTo(s * 0.1, s * 0.12, 0, 0);
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 0.04, s * 0.02); ctx.lineTo(s * 0.48, -s * 0.04); ctx.stroke();
    ctx.restore();
  });
  ctx.fillStyle = berryCol;
  [[0, -s * 0.2], [-s * 0.16, -s * 0.33], [s * 0.15, -s * 0.34]].forEach(([x, y]) => {
    circle(ctx, x, y, s * 0.1); ctx.fill();
  });
  ctx.restore();
}

/* a bauble on a fine thread, hung from `topY` */
function occBauble(ctx, cx, topY, len, r, thread, col, accent) {
  ctx.save();
  ctx.strokeStyle = thread; ctx.lineWidth = Math.max(0.6, r * 0.08);
  ctx.beginPath(); ctx.moveTo(cx, topY); ctx.lineTo(cx, topY + len - r * 1.3); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.8, r * 0.14);
  // the cap, then the ball
  ctx.strokeRect(cx - r * 0.3, topY + len - r * 1.35, r * 0.6, r * 0.38);
  circle(ctx, cx, topY + len, r); ctx.stroke();
  ctx.strokeStyle = accent; ctx.lineWidth = Math.max(0.6, r * 0.1);
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.92, topY + len - r * 0.18);
  ctx.quadraticCurveTo(cx, topY + len + r * 0.3, cx + r * 0.92, topY + len - r * 0.18);
  ctx.stroke();
  ctx.restore();
}

/* a barber-pole rule: short diagonals in two colours along a line */
function occCandyStripe(ctx, x, y, len, thick, colA, colB, vertical = false) {
  const pitch = thick * 1.7;
  ctx.save();
  ctx.translate(x, y);
  if (vertical) ctx.rotate(Math.PI / 2);
  ctx.beginPath(); ctx.rect(0, -thick / 2, len, thick); ctx.clip();
  ctx.lineWidth = thick * 0.62; ctx.lineCap = 'butt';
  for (let i = 0; i * pitch < len + thick * 2; i++) {
    ctx.strokeStyle = i % 2 ? colB : colA;
    ctx.beginPath();
    ctx.moveTo(i * pitch - thick, thick); ctx.lineTo(i * pitch + thick, -thick);
    ctx.stroke();
  }
  ctx.restore();
}

function occSnowflake(ctx, cx, cy, r, col) {
  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.6, r * 0.13); ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -r); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r * 0.26, -r * 0.62); ctx.lineTo(0, -r * 0.42); ctx.lineTo(r * 0.26, -r * 0.62);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

/* cobweb in a corner: arcs strung between radiating threads. sx/sy flip it into each corner. */
function occCobweb(ctx, x, y, r, col, sx, sy) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(sx, sy);
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.6, r * 0.014); ctx.lineCap = 'round';
  const spokes = 5;
  for (let i = 0; i <= spokes; i++) {
    const a = (i / spokes) * (Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke();
  }
  for (let ring = 1; ring <= 4; ring++) {
    const rr = (ring / 4.4) * r;
    ctx.beginPath();
    for (let i = 0; i <= spokes; i++) {
      const a = (i / spokes) * (Math.PI / 2);
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else {
        const pa = ((i - 0.5) / spokes) * (Math.PI / 2);
        ctx.quadraticCurveTo(Math.cos(pa) * rr * 0.86, Math.sin(pa) * rr * 0.86, px, py);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

/* a spider on a thread dropped from `topY` */
function occSpider(ctx, cx, topY, drop, s, col) {
  const cy = topY + drop;
  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.6, s * 0.07); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx, topY); ctx.lineTo(cx, cy - s * 0.5); ctx.stroke();
  [-1, 1].forEach(d => {
    for (let i = 0; i < 3; i++) {
      const yy = cy - s * 0.2 + i * s * 0.26;
      ctx.beginPath();
      ctx.moveTo(cx + d * s * 0.22, yy);
      ctx.quadraticCurveTo(cx + d * s * 0.72, yy - s * 0.2, cx + d * s * 0.86, yy + s * 0.26);
      ctx.stroke();
    }
  });
  ctx.fillStyle = col;
  circle(ctx, cx, cy - s * 0.42, s * 0.19); ctx.fill();
  circle(ctx, cx, cy + s * 0.12, s * 0.34); ctx.fill();
  ctx.restore();
}

/* a small sheet ghost with a wavy hem */
function occGhost(ctx, cx, cy, s, col, eyeCol) {
  ctx.save();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.5, cy + s * 0.52);
  ctx.lineTo(cx - s * 0.5, cy - s * 0.04);
  ctx.arc(cx, cy - s * 0.04, s * 0.5, Math.PI, 0);
  ctx.lineTo(cx + s * 0.5, cy + s * 0.52);
  [0.22, -0.16, 0.22, -0.16].forEach((d, i) => {
    const x0 = cx + s * (0.5 - (i + 1) * 0.25), x1 = cx + s * (0.5 - (i + 0.5) * 0.25);
    ctx.quadraticCurveTo(x1, cy + s * (0.52 + d), x0, cy + s * 0.52);
  });
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = eyeCol;
  circle(ctx, cx - s * 0.17, cy - s * 0.06, s * 0.075); ctx.fill();
  circle(ctx, cx + s * 0.17, cy - s * 0.06, s * 0.075); ctx.fill();
  ctx.restore();
}

/* a jack-o'-lantern in outline, with a stalk and a cut face */
function occPumpkin(ctx, cx, cy, s, col) {
  ctx.save();
  ctx.strokeStyle = col; ctx.fillStyle = col;
  ctx.lineWidth = Math.max(0.7, s * 0.1); ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.ellipse(cx, cy, s * 0.62, s * 0.52, 0, 0, Math.PI * 2); ctx.stroke();
  [-0.3, 0.3].forEach(d => {
    ctx.beginPath(); ctx.ellipse(cx + s * d, cy, s * 0.22, s * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
  });
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.5); ctx.quadraticCurveTo(cx + s * 0.06, cy - s * 0.78, cx + s * 0.22, cy - s * 0.8);
  ctx.stroke();
  [-0.26, 0.26].forEach(d => {
    ctx.beginPath();
    ctx.moveTo(cx + s * d - s * 0.1, cy - s * 0.06);
    ctx.lineTo(cx + s * d + s * 0.1, cy - s * 0.06);
    ctx.lineTo(cx + s * d, cy - s * 0.24);
    ctx.closePath(); ctx.fill();
  });
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.24, cy + s * 0.16);
  ctx.quadraticCurveTo(cx, cy + s * 0.36, cx + s * 0.24, cy + s * 0.16);
  ctx.stroke();
  ctx.restore();
}

/* a torn ticket stub: a notch bitten out of each side.
   The bite is an arc whose ends sit well inside the ticket's own height, so the path has to come
   back out to the edge after it before running along the bottom — without those two segments the
   bottom edge is drawn from the end of one arc straight to the far corner and the whole ticket
   comes out sloping. */
function occTicket(ctx, cx, cy, w, h, fill, edge) {
  const l = cx - w / 2 + h * 0.15, r = cx + w / 2 - h * 0.15, n = h * 0.21;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(l, cy - h / 2);
  ctx.lineTo(r, cy - h / 2);
  ctx.lineTo(r, cy - n);
  ctx.arc(r, cy, n, -Math.PI / 2, Math.PI / 2, true);
  ctx.lineTo(r, cy + h / 2);
  ctx.lineTo(l, cy + h / 2);
  ctx.lineTo(l, cy + n);
  ctx.arc(l, cy, n, Math.PI / 2, -Math.PI / 2, true);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = edge; ctx.lineWidth = Math.max(0.8, h * 0.035); ctx.stroke();
  ctx.setLineDash([h * 0.1, h * 0.1]);
  ctx.beginPath();
  ctx.moveTo(cx - w / 2 + r * 0.72, cy - h * 0.34); ctx.lineTo(cx - w / 2 + r * 0.72, cy + h * 0.34);
  ctx.moveTo(cx + w / 2 - r * 0.72, cy - h * 0.34); ctx.lineTo(cx + w / 2 - r * 0.72, cy + h * 0.34);
  ctx.stroke();
  ctx.restore();
}

/* an art deco fan: wedges from a centre, alternating weight */
function occDecoFan(ctx, cx, cy, r, col, rays = 13) {
  ctx.save();
  ctx.strokeStyle = col; ctx.lineCap = 'butt';
  for (let i = 0; i < rays; i++) {
    const a = -Math.PI + (i / (rays - 1)) * Math.PI;
    ctx.globalAlpha = i % 2 ? 0.3 : 0.6;
    ctx.lineWidth = (i % 2 ? r * 0.035 : r * 0.07);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.16, cy + Math.sin(a) * r * 0.16);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.5; ctx.lineWidth = r * 0.04;
  [0.52, 0.78, 1].forEach(k => {
    ctx.beginPath(); ctx.arc(cx, cy, r * k, Math.PI, 0); ctx.stroke();
  });
  ctx.restore();
}

/* a stepped deco bracket; sx/sy flip it into each corner */
function occDecoBracket(ctx, x, y, s, col, sx, sy, w = 1) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(sx, sy);
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = 'miter';
  ctx.beginPath();
  ctx.moveTo(0, s);
  ctx.lineTo(0, s * 0.42); ctx.lineTo(s * 0.26, s * 0.42);
  ctx.lineTo(s * 0.26, s * 0.18); ctx.lineTo(s * 0.56, s * 0.18);
  ctx.lineTo(s * 0.56, 0); ctx.lineTo(s, 0);
  ctx.stroke();
  ctx.restore();
}

/* a thin curled streamer */
function occStreamer(ctx, x, y, len, amp, col, w) {
  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let i = 1; i <= 6; i++) {
    const t = i / 6, yy = y + len * t, d = (i % 2 ? 1 : -1) * amp;
    ctx.quadraticCurveTo(x + d, yy - len / 12, x, yy);
  }
  ctx.stroke();
  ctx.restore();
}

/* two coupes tipped together */
function occCoupes(ctx, cx, cy, s, col) {
  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.7, s * 0.07); ctx.lineCap = 'round';
  [-1, 1].forEach(d => {
    ctx.save();
    ctx.translate(cx + d * s * 0.3, cy);
    ctx.rotate(d * 0.32);
    ctx.beginPath(); ctx.arc(0, -s * 0.2, s * 0.38, 0, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s * 0.38, -s * 0.2); ctx.lineTo(s * 0.38, -s * 0.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, s * 0.18); ctx.lineTo(0, s * 0.58); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s * 0.22, s * 0.58); ctx.lineTo(s * 0.22, s * 0.58); ctx.stroke();
    ctx.restore();
  });
  ctx.fillStyle = col;
  [[-0.66, -0.66], [0.7, -0.74], [0.06, -0.92]].forEach(([x, y]) => {
    circle(ctx, cx + x * s, cy + y * s, s * 0.05); ctx.fill();
  });
  ctx.restore();
}

/* The mark a frame shows where a caption would go when none has been written. Drawn as an outline
   in the same hairline weight as the rest of the frame, in place of the ♥ and ♡ glyphs these four
   used to set in a script face: a glyph is rendered by whichever font the device substitutes, which
   on some of them is a full-colour emoji, and it sat heavier than everything around it. */
function occHeartMark(ctx, cx, cy, s, col) {
  ctx.save();
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.lineJoin = 'round';
  heartPath(ctx, cx, cy, s);
  ctx.stroke();
  ctx.restore();
}

/* a mat and keyline around a photo slot (drawn in the slot's own frame)

   This replaces four corner ticks that read as a rendering fault rather than decoration: a cream
   mat with a fine inner line, even on all four sides, and a hairline outside it. */
function occSlotKeyline(ctx, s, col, lineCol, matCol = null) {
  const u = Math.max(1, Math.min(s.w, s.h) / 300);
  const m = Math.round(10 * u), x = -s.w / 2 - m, y = -s.h / 2 - m, w = s.w + m * 2, h = s.h + m * 2;
  ctx.save();
  if (matCol) { ctx.fillStyle = matCol; ctx.fillRect(x, y, w, h); }
  ctx.strokeStyle = lineCol; ctx.lineWidth = Math.max(1, 1.4 * u);
  ctx.strokeRect(-s.w / 2 - m * 0.42, -s.h / 2 - m * 0.42, s.w + m * 0.84, s.h + m * 0.84);
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, 1 * u);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

/* =========================================================
   The frames
   ========================================================= */
export const FRAME_GROUPS = [
  { id: 'classic', name: 'Classic' },
  { id: 'occasions', name: 'Occasions' },
];

export const FRAMES = {
  /* ---------------- Classic ---------------- */
  booth: {
    name: 'Midnight', group: 'classic', pairs: ['silver', 'darkroom'],
    variants: [['black', 'Black card', '#141110'], ['navy', 'Navy card', '#1A2338'], ['oxblood', 'Oxblood card', '#330A0E']],
    ink: C.cream,
    hints: { caption: 'under the wordmark', dedication: 'in script, at the foot' },
    canDouble: true,
    metrics: () => ({ pad: 30, top: 30, gap: 22, footerGap: 0, bottom: 28 }),
    footer: () => 112 + (caption() ? 30 : 0) + (dedication() ? 36 : 0),
    drawBg(ctx, L, v) {
      ctx.fillStyle = v.color; ctx.fillRect(0, 0, L.W, L.H);
      grainOver(ctx, 0, 0, L.W, L.H, 0.5);
    },
    backing(ctx, s) {
      ctx.fillStyle = '#F7F4EE';
      ctx.fillRect(-s.w / 2 - 4, -s.h / 2 - 4, s.w + 8, s.h + 8);
    },
    drawText(ctx, L) {
      let y = L.photosEnd + 32;
      printMark(ctx, L.W / 2, y, Math.min(L.region.w * 0.6, 300), { date: showDate() ? dateOf().toUpperCase() : '' });
      y += showDate() ? 98 : 74;
      if (caption()) { text(ctx, caption(), L.W / 2, y, FONT.type(17), C.cream, { max: L.region.w }); y += 32; }
      if (dedication()) text(ctx, dedication(), L.W / 2, y + 4, FONT.script(30), C.cream, { max: L.region.w });
    },
  },

  classic: {
    name: 'Classic Cream', group: 'classic', paper: true, pairs: ['natural', 'warm400', 'faded'],
    variants: [],
    metrics: () => ({ pad: 34, top: 34, gap: 16, footerGap: 26, bottom: 30 }),
    drawBg(ctx, L) {
      fillBackground(ctx, D().bg, 0, 0, L.W, L.H);
      grainOver(ctx, 0, 0, L.W, L.H, 0.8);
      ctx.strokeStyle = L.ink; ctx.globalAlpha = 0.4; ctx.lineWidth = 1.5;
      ctx.strokeRect(12, 12, L.W - 24, L.H - 24);
      ctx.globalAlpha = 1;
    },
  },

  lace: {
    name: 'Lace', group: 'classic', paper: true, pairs: ['faded', 'silver', 'natural'],
    variants: [['ivory', 'Ivory lace', '#FAF6EE'], ['oxblood', 'Oxblood lace', '#5A1218'], ['black', 'Black lace', '#1E1916']],
    metrics: () => ({ pad: 72, top: 72, gap: 18, footerGap: 24, bottom: 42 }),
    drawBg(ctx, L, v) {
      const inset = LACE_D - 8, col = v.color;
      fillBackground(ctx, D().bg, inset, inset, L.W - inset * 2, L.H - inset * 2);
      grainOver(ctx, inset, inset, L.W - inset * 2, L.H - inset * 2, 0.8);
      ctx.save(); ctx.strokeStyle = 'rgba(42,33,28,.14)'; ctx.lineWidth = 6;
      ctx.strokeRect(inset + 3, inset + 3, L.W - inset * 2 - 6, L.H - inset * 2 - 6); ctx.restore();
      eachEdge(ctx, L, FOUR, len => laceBand(ctx, len, col));
      laceCorners(L).forEach(([x, y]) => laceCorner(ctx, x, y, col, false));
      ctx.save();
      ctx.strokeStyle = v.id === 'ivory' ? 'rgba(92,75,65,.35)' : 'rgba(255,255,255,.2)';
      ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.strokeRect(LACE_D - 4, LACE_D - 4, L.W - (LACE_D - 4) * 2, L.H - (LACE_D - 4) * 2);
      ctx.restore();
    },
    punch(ctx, L) {
      eachEdge(ctx, L, FOUR, len => lacePunch(ctx, len));
      laceCorners(L).forEach(([x, y]) => laceCorner(ctx, x, y, null, true));
    },
  },

  checker: {
    name: 'Checkerboard', group: 'classic', ink: C.ink, pairs: ['silver', 'darkroom', 'natural'],
    variants: [['black', 'Black squares', '#1E1916'], ['oxblood', 'Oxblood squares', '#4A0E14'], ['navy', 'Navy squares', '#1E2A44']],
    metrics: () => ({ pad: 74, top: 74, gap: 18, footerGap: 26, bottom: 64 }),
    drawBg(ctx, L, v) {
      const { W, H } = L, s = 22, band = 44;
      ctx.fillStyle = C.cream; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = v.color;
      for (let row = 0, y = 0; y < H; y += s, row++) for (let x = (row % 2) * s; x < W; x += s * 2) ctx.fillRect(x, y, s, s);
      ctx.save();
      ctx.shadowColor = 'rgba(20,6,8,.35)'; ctx.shadowBlur = 10; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 3;
      ctx.fillStyle = C.cream; ctx.fillRect(band, band, W - band * 2, H - band * 2);
      ctx.restore();
      grainOver(ctx, band, band, W - band * 2, H - band * 2, 0.9);
      ctx.strokeStyle = 'rgba(30,25,22,.55)'; ctx.lineWidth = 1.2;
      ctx.strokeRect(band + 9, band + 9, W - band * 2 - 18, H - band * 2 - 18);
    },
  },

  /* ---------------- Paper goods ---------------- */
  ticket: {
    name: 'Train Ticket', group: 'paper', ink: C.red, pairs: ['warm400', 'sepia', 'faded'],
    variants: [['cream', 'Cream stock', '#F4EEE3'], ['butter', 'Butter stock', '#EBD9A0'], ['blue', 'Dusty blue stock', '#CBD8E2']],
    hints: { caption: 'as the destination', dedication: 'as the passenger' },
    mat: { color: C.red, w: 3 },
    metrics: () => ({ pad: 46, top: 156, gap: 24, footerGap: 0, bottom: 30 }),
    footer: () => 232,
    drawBg(ctx, L, v) {
      const { W, H } = L;
      ctx.save(); rrect(ctx, 0, 0, W, H, 26); ctx.clip();
      ctx.fillStyle = v.color; ctx.fillRect(0, 0, W, H);
      grainOver(ctx, 0, 0, W, H, 1);
      ctx.restore();
      ctx.strokeStyle = C.red;
      ctx.lineWidth = 5; rrect(ctx, 14, 14, W - 28, H - 28, 18); ctx.stroke();
      ctx.lineWidth = 1.5; rrect(ctx, 23, 23, W - 46, H - 46, 12); ctx.stroke();
      train(ctx, 44, 40, 1.1, C.red);
      text(ctx, 'ADMIT ONE', 120, 56, FONT.type(15), C.red, { align: 'left', track: 4 });
      text(ctx, 'PHOTOMATIC LINE', W / 2, 98, FONT.serif(38, 800), C.red, { track: 3, max: W - 100 });
      const rnd = seeded();
      const row = pad2(1 + Math.floor(rnd() * 24)), seat = `${1 + Math.floor(rnd() * 8)}${'ABCD'[Math.floor(rnd() * 4)]}`, car = pad2(1 + Math.floor(rnd() * 12));
      text(ctx, `ROW ${row}  ·  SEAT ${seat}  ·  CAR ${car}`, W / 2, 128, FONT.type(14), C.red, { track: 3 });
    },
    drawText(ctx, L) {
      const { W } = L, y0 = L.photosEnd + 40;
      text(ctx, `TO: ${(caption() || 'anywhere you like').toUpperCase()}`, 48, y0, FONT.type(17), C.red, { align: 'left', track: 1.5, max: W - 96 });
      text(ctx, `PASSENGER: ${(dedication() || 'you').toUpperCase()}`, 48, y0 + 30, FONT.type(14), C.red, { align: 'left', track: 1.5, max: W - 96 });
      if (showDate()) text(ctx, `DEPARTS ${dateOf().toUpperCase()} · ${timeOf()}`, 48, y0 + 56, FONT.type(14), C.red, { align: 'left', track: 1.5 });
      // perforation and stub
      const py = y0 + 88;
      ctx.save(); ctx.strokeStyle = C.red; ctx.setLineDash([7, 7]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(32, py); ctx.lineTo(W - 32, py); ctx.stroke(); ctx.restore();
      const serial = `No. ${String(100000 + (hashString(D().shotDate.toISOString()) % 900000))}`;
      barcode(ctx, 48, py + 28, Math.min(260, W - 200), 54, hashString(serial), C.red);
      text(ctx, serial, 48, py + 100, FONT.type(14), C.red, { align: 'left', track: 2 });
      stamp(ctx, 'VALID', W - 110, py + 58, -0.22, C.cherry, 26);
    },
    punch(ctx, L) {
      const py = L.photosEnd + 128;
      [L.region.y - 18, py].forEach(y => { circle(ctx, 0, y, 16); ctx.fill(); circle(ctx, L.W, y, 16); ctx.fill(); });
    },
  },

  receipt: {
    name: 'Receipt', group: 'paper', ink: '#2B2B2B', pairs: ['silver', 'faded', 'natural'],
    variants: [['white', 'Thermal white', '#F7F7F4'], ['pink', 'Pink carbon copy', '#F6E1E1']],
    hints: { caption: 'as a line item', dedication: 'as a note on the slip' },
    metrics: (h) => ({ pad: 40, top: 150, gap: h ? 24 : 54, footerGap: 0, bottom: 34 }),
    footer: () => 300 + (caption() ? 28 : 0) + (dedication() ? 28 : 0),
    drawBg(ctx, L, v) {
      const { W, H } = L, rnd = mulberry32(7);
      ctx.fillStyle = v.color; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 26; i++) { ctx.fillStyle = `rgba(120,120,120,${0.02 + rnd() * 0.04})`; ctx.fillRect(0, rnd() * H, W, 1 + rnd() * 3); }
      grainOver(ctx, 0, 0, W, H, 0.5);
      const ink = '#2B2B2B';
      text(ctx, 'PHOTOMATIC', W / 2, 54, `40px "Bebas Neue", Impact, sans-serif`, ink, { track: 8 });
      text(ctx, 'BOOTH No. 26 · CORNER OF MAIN', W / 2, 88, FONT.type(14), ink, { track: 2 });
      text(ctx, showDate() ? `${dateOf().toUpperCase()}   ${timeOf()}` : 'OPEN ALL HOURS', W / 2, 112, FONT.type(14), ink, { track: 2 });
      ctx.save(); ctx.strokeStyle = ink; ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.moveTo(30, 132); ctx.lineTo(W - 30, 132); ctx.stroke(); ctx.restore();
      // line items between photos (strip layout only)
      if (L.isStrip) L.slots.slice(0, -1).forEach((s, i) => this.item(ctx, L, `1x POSE ${pad2(i + 1)}`, s.y + s.h + L.m.gap / 2));
    },
    item(ctx, L, label, y) {
      const ink = '#2B2B2B', x0 = 44, x1 = L.W - 44;
      ctx.save();
      ctx.font = FONT.type(15); tracking(ctx, 1);
      ctx.fillStyle = ink; ctx.textBaseline = 'middle';
      ctx.textAlign = 'left'; ctx.fillText(label, x0, y);
      ctx.textAlign = 'right'; ctx.fillText('0.00', x1, y);
      const a = x0 + ctx.measureText(label).width + 10, b = x1 - ctx.measureText('0.00').width - 10;
      ctx.fillStyle = 'rgba(43,43,43,.55)';
      for (let x = a; x < b; x += 7) ctx.fillRect(x, y + 4, 2, 2);
      ctx.restore();
    },
    drawText(ctx, L) {
      const ink = '#2B2B2B', W = L.W;
      let y = L.photosEnd + 32;
      this.item(ctx, L, '1x FLASH', y); y += 28;
      this.item(ctx, L, '1x DEVELOP', y); y += 28;
      if (caption()) { this.item(ctx, L, `1x ${caption().toUpperCase().slice(0, 18)}`, y); y += 28; }
      ctx.save(); ctx.strokeStyle = ink; ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(W - 30, y); ctx.stroke(); ctx.restore();
      y += 32;
      text(ctx, 'TOTAL: PRICELESS', W / 2, y, FONT.type(22), ink, { track: 3 }); y += 34;
      if (dedication()) { text(ctx, dedication(), W / 2, y, FONT.type(15), ink, { max: W - 80 }); y += 28; }
      text(ctx, 'THANK YOU, COME AGAIN', W / 2, y, FONT.type(14), ink, { track: 3 }); y += 30;
      barcode(ctx, W / 2 - 110, y, 220, 44, 99, ink); y += 62;
      text(ctx, `TXN ${hashString(D().shotDate.toISOString()) % 100000}`, W / 2, y, FONT.type(14), ink, { track: 4 });
    },
    punch(ctx, L) {
      const t = 11;
      for (let x = 0; x <= L.W; x += t * 2) {
        ctx.beginPath(); ctx.moveTo(x - t, 0); ctx.lineTo(x, t); ctx.lineTo(x + t, 0); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - t, L.H); ctx.lineTo(x, L.H - t); ctx.lineTo(x + t, L.H); ctx.closePath(); ctx.fill();
      }
    },
  },

  postage: {
    name: 'Postage Stamp', group: 'paper', paper: true, pairs: ['warm400', 'faded', 'sepia'],
    variants: [['mixed', 'Mixed stamps', '#C9D6E0'], ['cream', 'Cream stamps', '#FBF7EE'], ['blue', 'Dusty blue stamps', '#CBD8E2'], ['blush', 'Blush stamps', '#F1D3D5']],
    metrics: () => ({ pad: 54, top: 50, gap: 46, footerGap: 40, bottom: 34 }),
    backing(ctx, s, i, L, v) {
      const tones = v.id === 'mixed' ? ['#FBF7EE', '#CBD8E2', '#F1D3D5'] : [v.color];
      const paper = tones[i % tones.length];
      const m = 16, mb = 30, x = -s.w / 2 - m, y = -s.h / 2 - m, w = s.w + m * 2, h = s.h + m + mb;
      ctx.save();
      ctx.shadowColor = 'rgba(20,6,8,.28)'; ctx.shadowBlur = 10; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 4;
      ctx.fillStyle = paper; ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
      ctx.restore();
      ctx.save();
      stampPath(ctx, x, y, w, h, 4.2, 13); ctx.clip('evenodd');
      ctx.fillStyle = paper; ctx.fillRect(x, y, w, h);
      grainOver(ctx, x, y, w, h, 0.7);
      ctx.strokeStyle = 'rgba(94,28,35,.5)'; ctx.lineWidth = 1; ctx.strokeRect(x + 9, y + 9, w - 18, h - 18);
      text(ctx, 'PHOTOMATIC POST', x + 16, s.h / 2 + 14, FONT.sans(10, 700), C.red, { align: 'left', track: 2 });
      text(ctx, '25¢', x + w - 16, s.h / 2 + 14, FONT.serif(18, 800), C.red, { align: 'right' });
      ctx.restore();
    },
    drawBg(ctx, L) {
      fillBackground(ctx, D().bg, 0, 0, L.W, L.H);
      grainOver(ctx, 0, 0, L.W, L.H, 0.8);
    },
    drawFg(ctx, L) {
      const s = L.slots[0];
      if (!s || s.rot) return;
      const cx = s.x + s.w - 6, cy = s.y + 10;
      ctx.save();
      ctx.strokeStyle = 'rgba(42,33,28,.5)'; ctx.lineWidth = 2;
      circle(ctx, cx, cy, 40); ctx.stroke(); circle(ctx, cx, cy, 32); ctx.stroke();
      ctx.restore();
      text(ctx, 'PHOTOMATIC', cx, cy - 10, FONT.sans(8, 700), 'rgba(42,33,28,.6)', { track: 1.5 });
      text(ctx, showDate() ? dateOf().toUpperCase() : String(D().shotDate.getFullYear()), cx, cy + 8, FONT.serif(13, 700), 'rgba(42,33,28,.6)', { max: 56 });
      ctx.save(); ctx.strokeStyle = 'rgba(42,33,28,.5)'; ctx.lineWidth = 2;
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        for (let x = cx - 150; x <= cx - 46; x += 4) { const y = cy - 21 + k * 14 + Math.sin(x / 13) * 4; if (x === cx - 150) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.stroke();
      }
      ctx.restore();
    },
  },

  letter: {
    name: 'Love Letter', group: 'paper', ink: C.ink, pairs: ['sepia', 'warm400', 'faded'],
    variants: [['cream', 'Cream envelope', '#EFE4CF'], ['kraft', 'Kraft envelope', '#C9A97A'], ['blush', 'Blush envelope', '#EDC9CB']],
    hints: { caption: 'under the photos', dedication: 'on the flap' },
    usesToFrom: true,
    metrics: () => ({ pad: 54, top: 170, gap: 18, footerGap: 0, bottom: 30 }),
    footer: () => 196 + (caption() ? 30 : 0),
    drawBg(ctx, L, v) {
      const { W, H } = L, band = 16;
      ctx.fillStyle = v.color; ctx.fillRect(0, 0, W, H);
      grainOver(ctx, 0, 0, W, H, 1);
      // airmail border: diagonal cherry and dusty-blue stripes
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(band, band, W - band * 2, H - band * 2); ctx.clip('evenodd');
      for (let k = -H; k < W + H; k += 40) {
        [[C.cherry, 0], [C.dusty, 20]].forEach(([col, off]) => {
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.moveTo(k + off, 0); ctx.lineTo(k + off + 12, 0); ctx.lineTo(k + off + 12 - H, H); ctx.lineTo(k + off - H, H); ctx.closePath(); ctx.fill();
        });
      }
      ctx.restore();
      // to / from on the face of the envelope
      const d = D(), ink = C.ink;
      [['To:', d.to], ['From:', d.from]].forEach(([k, val], i) => {
        const y = 62 + i * 40;
        text(ctx, k, 44, y, FONT.type(17), ink, { align: 'left', track: 1 });
        ctx.fillStyle = 'rgba(31,26,23,.45)'; ctx.fillRect(112, y + 12, W - 260, 1.5);
        if (val && val.trim()) text(ctx, val.trim(), 118, y, FONT.type(17), ink, { align: 'left', max: W - 270 });
      });
      // a little heart stamp, top right
      const sx = W - 124, sy = 36, sw = 80, sh = 96;
      ctx.save();
      stampPath(ctx, sx, sy, sw, sh, 3.2, 10); ctx.clip('evenodd');
      ctx.fillStyle = '#FBF7EE'; ctx.fillRect(sx, sy, sw, sh);
      ctx.fillStyle = C.blush; ctx.fillRect(sx + 7, sy + 7, sw - 14, sh - 14);
      ctx.fillStyle = C.cherry;
      ctx.beginPath(); const hx = sx + sw / 2, hy = sy + sh / 2 - 6;
      ctx.moveTo(hx, hy + 18); ctx.bezierCurveTo(hx - 26, hy, hx - 14, hy - 20, hx, hy - 8); ctx.bezierCurveTo(hx + 14, hy - 20, hx + 26, hy, hx, hy + 18); ctx.fill();
      ctx.restore();
      text(ctx, '25¢', sx + sw / 2, sy + sh - 16, FONT.type(13), C.red);
    },
    drawText(ctx, L, v) {
      const { W, H } = L, band = 16;
      let y = L.photosEnd + 28;
      if (caption()) { text(ctx, caption(), W / 2, y, FONT.type(18), C.ink, { max: W - 120 }); y += 30; }
      if (showDate()) text(ctx, `POSTED ${dateOf().toUpperCase()}`, W / 2, y, FONT.type(14), C.ink, { track: 3 });
      // the flap at the bottom, sealed with wax
      const top = H - band - 150, mid = W / 2;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(band, H - band); ctx.lineTo(mid, top); ctx.lineTo(W - band, H - band); ctx.closePath();
      ctx.shadowColor = 'rgba(31,26,23,.25)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = -3;
      ctx.fillStyle = v.color; ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.beginPath(); ctx.moveTo(band, H - band); ctx.lineTo(mid, top); ctx.lineTo(W - band, H - band); ctx.closePath(); ctx.clip();
      grainOver(ctx, 0, top, W, H - top, 1);
      ctx.fillStyle = 'rgba(31,26,23,.06)'; ctx.fillRect(0, top, W, H - top);
      ctx.restore();
      ctx.strokeStyle = 'rgba(31,26,23,.3)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(band, H - band); ctx.lineTo(mid, top); ctx.lineTo(W - band, H - band); ctx.stroke();
      if (dedication()) text(ctx, dedication(), mid, H - band - 34, FONT.script(28), C.ink, { max: W * 0.5 });
      drawWaxSeal(ctx, mid, top + 6, 76, 0.18);
    },
  },

  library: {
    name: 'Library Card', group: 'paper', ink: C.ink, pairs: ['sepia', 'faded', 'silver'],
    variants: [['buff', 'Buff card', '#F1E6CC'], ['butter', 'Butter card', '#EBD9A0'], ['sage', 'Sage card', '#D9DFCF']],
    hints: { caption: 'as the title', dedication: 'as the borrower' },
    metrics: () => ({ pad: 50, top: 128, gap: 16, footerGap: 0, bottom: 0 }),
    footer: () => 330,
    drawBg(ctx, L, v) {
      const { W, H } = L;
      ctx.fillStyle = v.color; ctx.fillRect(0, 0, W, H);
      grainOver(ctx, 0, 0, W, H, 1);
      ctx.fillStyle = 'rgba(80,110,150,.28)';
      for (let y = 112; y < H; y += 30) ctx.fillRect(0, y, W, 1.2);
      ctx.fillStyle = 'rgba(179,32,42,.45)'; ctx.fillRect(34, 0, 1.5, H);
      text(ctx, 'PHOTOMATIC PUBLIC LIBRARY', W / 2, 44, FONT.type(18), C.ink, { track: 3, max: W - 80 });
      text(ctx, "BORROWER'S CARD", W / 2, 76, FONT.serifItalic(22, 600), C.ink);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.strokeRect(14, 14, W - 28, H - 28);
    },
    drawText(ctx, L) {
      const { W } = L, purple = '#5B3A8C';
      let y = L.photosEnd + 34;
      text(ctx, `TITLE: ${(caption() || 'a good afternoon').toUpperCase()}`, 50, y, FONT.type(15), C.ink, { align: 'left', track: 1, max: W - 100 });
      y += 30;
      // the due-date table
      const x0 = 50, x1 = W - 50, colX = x0 + (x1 - x0) * 0.42;
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2;
      ctx.strokeRect(x0, y, x1 - x0, 120);
      ctx.beginPath(); ctx.moveTo(colX, y); ctx.lineTo(colX, y + 120); ctx.moveTo(x0, y + 30); ctx.lineTo(x1, y + 30); ctx.stroke();
      text(ctx, 'DATE DUE', (x0 + colX) / 2, y + 16, FONT.type(14), C.ink, { track: 2 });
      text(ctx, 'BORROWER', (colX + x1) / 2, y + 16, FONT.type(14), C.ink, { track: 2 });
      if (showDate()) {
        ctx.save(); ctx.globalAlpha = 0.85;
        text(ctx, dateOf().toUpperCase(), (x0 + colX) / 2, y + 56, FONT.type(17), purple, { track: 2 });
        ctx.restore();
      }
      text(ctx, dedication() || 'you, forever', (colX + x1) / 2, y + 56, FONT.script(24), C.ink, { max: x1 - colX - 16 });
      // the kraft pocket
      const py = L.H - 130;
      ctx.save();
      ctx.shadowColor = 'rgba(31,26,23,.3)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = -2;
      ctx.beginPath(); ctx.moveTo(14, py); ctx.lineTo(W / 2 - 70, py); ctx.arc(W / 2, py, 70, Math.PI, 0, true); ctx.lineTo(W - 14, py); ctx.lineTo(W - 14, L.H - 14); ctx.lineTo(14, L.H - 14); ctx.closePath();
      ctx.fillStyle = C.kraft; ctx.fill();
      ctx.restore();
      text(ctx, 'PHOTOMATIC  ·  CARD POCKET', W / 2, L.H - 56, FONT.type(15), C.ink, { track: 3 });
      text(ctx, 'please return with love', W / 2, L.H - 32, FONT.type(14), C.ink, { track: 1 });
    },
  },

  /* ---------------- Film ---------------- */
  film: {
    name: 'Red Film', group: 'film', ink: C.cream, pairs: ['warm400', 'faded', 'natural'],
    variants: [['red', 'Red film', '#8E1A22'], ['oxblood', 'Oxblood film', '#4E0E14'], ['navy', 'Night film', '#25304B']],
    metrics: (h, d) => {
      const P = d.filmPaper ? 64 : 0;
      return h ? { pad: 44 + P, top: 74 + P, gap: 24, footerGap: 22, bottom: 64 + P }
               : { pad: 78 + P, top: 58 + P, gap: 26, footerGap: 24, bottom: 52 + P };
    },
    band: L => { const P = D().filmPaper ? 64 : 0; return { x: P, y: P, w: L.W - P * 2, h: L.H - P * 2 }; },
    drawBg(ctx, L, v) {
      const B = this.band(L);
      const g = L.horizontal ? ctx.createLinearGradient(0, B.y, 0, B.y + B.h) : ctx.createLinearGradient(B.x, 0, B.x + B.w, 0);
      g.addColorStop(0, 'rgba(0,0,0,.35)'); g.addColorStop(0.12, 'rgba(255,255,255,.08)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(0.88, 'rgba(255,255,255,.08)'); g.addColorStop(1, 'rgba(0,0,0,.35)');
      ctx.fillStyle = v.color; ctx.fillRect(B.x, B.y, B.w, B.h);
      ctx.fillStyle = g; ctx.fillRect(B.x, B.y, B.w, B.h);
      grainOver(ctx, B.x, B.y, B.w, B.h, 0.9);
      ctx.save();
      ctx.fillStyle = 'rgba(244,238,227,.82)';
      ctx.font = FONT.type(13); ctx.textBaseline = 'middle'; tracking(ctx, 4);
      const len = L.horizontal ? B.w : B.h;
      ctx.save();
      if (L.horizontal) ctx.translate(B.x, B.y + 56); else { ctx.translate(B.x + 56, B.y); ctx.rotate(Math.PI / 2); }
      for (let p = 40; p < len - 140; p += 320) ctx.fillText('PHOTOMATIC 400', p, 0);
      ctx.restore();
      ctx.font = FONT.sans(12, 700); tracking(ctx, 2); ctx.textAlign = 'center';
      L.slots.forEach((s, i) => {
        const label = `${i + 1}  ▸  ${i + 1}A`;
        if (L.horizontal) ctx.fillText(label, s.x + s.w / 2, B.y + B.h - 56);
        else { ctx.save(); ctx.translate(B.x + B.w - 56, s.y + s.h / 2); ctx.rotate(Math.PI / 2); ctx.fillText(label, 0, 0); ctx.restore(); }
      });
      ctx.restore();
    },
    drawFg(ctx, L) {
      ctx.strokeStyle = 'rgba(30,4,8,.55)'; ctx.lineWidth = 2;
      L.slots.forEach(s => ctx.strokeRect(s.x, s.y, s.w, s.h));
      if (D().filmPaper) { const B = this.band(L); drawSafetyPin(ctx, B.x + 70, B.y + 6, 170, L.horizontal ? -0.12 : -0.42); }
    },
    punch(ctx, L) { sprockets(ctx, L, this.band(L)); },
    under(ctx, L) {
      if (!D().filmPaper) return;
      const B = this.band(L), k = Math.hypot(ctx.getTransform().a, ctx.getTransform().b);
      ctx.save();
      ctx.shadowColor = 'rgba(20,6,8,.45)'; ctx.shadowBlur = 18 * k; ctx.shadowOffsetX = 10000 * k + 4 * k; ctx.shadowOffsetY = 6 * k;
      ctx.fillStyle = '#000'; ctx.fillRect(B.x - 10000, B.y, B.w, B.h);
      ctx.restore();
      drawLetterPaper(ctx, 0, 0, L.W, L.H, { shadow: false });
    },
  },

  negative: {
    name: '35mm Negative', group: 'film', ink: '#F3A65A', pairs: ['darkroom', 'silver', 'warm400'],
    variants: [['amber', 'Amber base', '#2A1B12'], ['black', 'Black base', '#141210']],
    metrics: h => (h ? { pad: 44, top: 72, gap: 24, footerGap: 22, bottom: 64 } : { pad: 76, top: 56, gap: 26, footerGap: 24, bottom: 52 }),
    drawBg(ctx, L, v) {
      const { W, H } = L;
      ctx.fillStyle = v.color; ctx.fillRect(0, 0, W, H);
      const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, 'rgba(255,140,60,.08)'); g.addColorStop(1, 'rgba(0,0,0,.25)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      grainOver(ctx, 0, 0, W, H, 0.7);
      ctx.save();
      ctx.fillStyle = C.orange; ctx.globalAlpha = 0.88;
      ctx.font = FONT.sans(12, 700); ctx.textBaseline = 'middle'; tracking(ctx, 3);
      const len = L.horizontal ? W : H;
      ctx.save();
      if (L.horizontal) ctx.translate(0, 54); else { ctx.translate(54, 0); ctx.rotate(Math.PI / 2); }
      for (let p = 40; p < len - 120; p += 300) ctx.fillText('PHOTOMATIC 400  ◂  5063', p, 0);
      ctx.restore();
      ctx.textAlign = 'center';
      L.slots.forEach((s, i) => {
        const label = `${i + 1}  ▸  ${i + 1}A`;
        if (L.horizontal) ctx.fillText(label, s.x + s.w / 2, H - 54);
        else { ctx.save(); ctx.translate(W - 56, s.y + s.h / 2); ctx.rotate(Math.PI / 2); ctx.fillText(label, 0, 0); ctx.restore(); }
      });
      ctx.restore();
    },
    drawFg(ctx, L) {
      ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 2;
      L.slots.forEach(s => ctx.strokeRect(s.x, s.y, s.w, s.h));
    },
    punch(ctx, L) { sprockets(ctx, L, { x: 0, y: 0, w: L.W, h: L.H }); },
  },

  instant: {
    name: 'Polaroid', group: 'film', paper: true, pairs: ['faded', 'warm400', 'natural'],
    variants: [['white', 'White frames', '#FBFAF6'], ['cream', 'Cream frames', '#F1EADB'], ['black', 'Black frames', '#1C1A19']],
    hints: { caption: 'under the first photo', dedication: 'under the last photo' },
    metrics: () => ({ pad: 54, top: 46, gap: 96, footerGap: 70, bottom: 28 }),
    footer: () => 76,
    backing(ctx, s, i, L, v) {
      const m = 16, mb = 70;
      ctx.save();
      ctx.shadowColor = 'rgba(31,26,23,.3)'; ctx.shadowBlur = 12; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 6;
      ctx.fillStyle = v.color; ctx.fillRect(-s.w / 2 - m, -s.h / 2 - m, s.w + m * 2, s.h + m + mb);
      ctx.restore();
      grainOver(ctx, -s.w / 2 - m, -s.h / 2 - m, s.w + m * 2, s.h + m + mb, 0.6);
      const words = [caption(), showDate() ? dateOf().toLowerCase() : '', dedication()];
      const label = i === 0 ? words[0] : i === L.n - 1 ? words[2] : (i === 1 ? words[1] : '');
      if (label) text(ctx, label, 0, s.h / 2 + mb / 2 + 2, FONT.script(30), v.id === 'black' ? C.cream : C.ink, { max: s.w - 20 });
    },
    drawBg(ctx, L) {
      fillBackground(ctx, D().bg, 0, 0, L.W, L.H);
      grainOver(ctx, 0, 0, L.W, L.H, 0.8);
    },
    drawText(ctx, L) {
      ctx.save(); ctx.globalAlpha = 0.55;
      text(ctx, 'photomatic', L.W / 2, L.H - 40, FONT.logo(18), L.ink);
      ctx.restore();
    },
  },

  /* ---------------- Occasions ---------------- */
  newyear: {
    name: 'New Year', category: 'occasions', group: 'occasions',
    ink: C.cream, pairs: ['darkroom', 'silver'],
    hints: { caption: 'a name or message', dedication: 'a wish for the year' },
    variants: [['navy', 'Midnight navy', '#1A2338'], ['black', 'Jet black', '#141110'], ['oxblood', 'Oxblood', '#2E0A0D']],
    metrics: occMetrics,
    footer: occFooterH,
    drawBg(ctx, L, v) {
      const { W, H } = L, G = 'rgba(184,147,74,', g = occHead(L), u = g.u;
      ctx.fillStyle = v.color; ctx.fillRect(0, 0, W, H);
      occVignette(ctx, W, H, 'rgba(0,0,0,.55)', 0.8);
      grainOver(ctx, 0, 0, W, H, 0.5);
      occStars(ctx, W, g.h * 0.55, G + '1)', 31, 22);

      // a deco fan as a crown over the type, kept light so the title stays legible on it
      ctx.save(); ctx.globalAlpha = 0.5;
      occDecoFan(ctx, g.cx, g.h * 0.47, Math.min(g.h * 0.4, g.w * 0.27), C.gold);
      ctx.restore();
      // firework bursts out in the header's corners
      occBurst(ctx, g.x + g.w * 0.1, g.h * 0.26, Math.min(g.h * 0.2, g.w * 0.08), G + '.9)', 12);
      occBurst(ctx, g.x + g.w * 0.9, g.h * 0.2, Math.min(g.h * 0.15, g.w * 0.06), G + '.72)', 10);

      // a gold double line with stepped corners around the whole strip
      ctx.save();
      ctx.strokeStyle = G + '.85)'; ctx.lineWidth = 1.6 * u;
      ctx.strokeRect(14 * u, 14 * u, W - 28 * u, H - 28 * u);
      ctx.strokeStyle = G + '.4)'; ctx.lineWidth = 1 * u;
      ctx.strokeRect(21 * u, 21 * u, W - 42 * u, H - 42 * u);
      ctx.restore();
      const bs = 26 * u;
      [[14 * u, 14 * u, 1, 1], [W - 14 * u, 14 * u, -1, 1],
       [14 * u, H - 14 * u, 1, -1], [W - 14 * u, H - 14 * u, -1, -1]]
        .forEach(([x, y, fx, fy]) => occDecoBracket(ctx, x, y, bs, G + '.9)', fx, fy, 1.6 * u));

      // gold confetti and a few streamers down the side margins
      occConfetti(ctx, W, g.h * 0.6, [C.gold, 'rgba(244,238,227,.9)', G + '.7)'], 31);
      ctx.save(); ctx.globalAlpha = 0.5;
      [[0.5, 0.26], [W - 0.5 * u - 24 * u, 0.2]].forEach(([x, t], i) => {
        occStreamer(ctx, i ? W - 30 * u : 30 * u, g.h * 0.2, g.h * 0.9, 5 * u, G + '.8)', 1.2 * u);
      });
      ctx.restore();

      text(ctx, 'Happy New Year', g.cx, g.h * 0.64, FONT.serif(g.t.title * 0.8, 700), C.gold,
        { track: g.t.title * 0.08, max: g.w * 0.8 });
      text(ctx, String(occYear()), g.cx, g.h * 0.87, FONT.serif(g.t.title * 1.1, 800), C.cream,
        { track: g.t.title * 0.26, max: g.w * 0.7 });
    },
    backing(ctx, s) {
      // stepped deco brackets at each corner of the photo, instead of the old ticks
      occSlotKeyline(ctx, s, 'rgba(184,147,74,.45)', 'rgba(184,147,74,.65)');
      const u = Math.max(1, Math.min(s.w, s.h) / 300), m = 10 * u, b = Math.min(s.w, s.h) * 0.1;
      const x = -s.w / 2 - m, y = -s.h / 2 - m, w = s.w + m * 2, h = s.h + m * 2;
      [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]
        .forEach(([px, py, fx, fy]) => occDecoBracket(ctx, px, py, b, 'rgba(184,147,74,.9)', fx, fy, 1.6 * u));
    },
    drawText(ctx, L) {
      const g = occFoot(L), u = g.u;
      occFooterDraw(ctx, L, { rule: 'rgba(184,147,74,.45)', cap: C.cream, date: C.gold, ded: C.cream });
      // a pair of coupes beside the date
      const cy = g.y + 46 * u, cs = Math.min(g.t.date * 0.62, g.w * 0.035);
      [-1, 1].forEach(d => occCoupes(ctx, g.cx + d * g.w * 0.34, cy, cs, 'rgba(184,147,74,.9)'));
    },
  },

  valentine: {
    name: "Valentine's Day", category: 'occasions', group: 'occasions',
    ink: C.ink, pairs: ['warm400', 'faded'],
    hints: { caption: 'a name', dedication: 'a message' },
    variants: [['blush', 'Blush', '#F2D0D2'], ['cream', 'Cream', '#F8F2E8'], ['rose', 'Deep rose', '#DDACB4']],
    metrics: occMetrics,
    footer: occFooterH,
    drawBg(ctx, L, v) {
      const { W, H } = L, g = occHead(L), u = g.u, k = g.h / 166;
      ctx.fillStyle = v.color; ctx.fillRect(0, 0, W, H);
      occVignette(ctx, W, H, 'rgba(120,30,40,.22)', 0.7);
      grainOver(ctx, 0, 0, W, H, 0.7);
      ctx.save(); ctx.strokeStyle = 'rgba(179,32,42,.34)'; ctx.lineWidth = 1.5 * u;
      ctx.strokeRect(12 * u, 12 * u, W - 24 * u, H - 24 * u);
      ctx.strokeStyle = 'rgba(184,147,74,.26)'; ctx.lineWidth = 1 * u;
      ctx.strokeRect(20 * u, 20 * u, W - 40 * u, H - 40 * u); ctx.restore();
      occFrameCorners(ctx, W, H, 27, 21, 'rgba(179,32,42,.42)');
      ctx.save(); ctx.strokeStyle = C.cherry; ctx.lineWidth = 1.5 * u; ctx.globalAlpha = 0.68;
      heartPath(ctx, g.cx, 56 * k, 40 * k); ctx.stroke();
      ctx.globalAlpha = 0.3; ctx.lineWidth = 1.1 * u;
      heartPath(ctx, g.cx - 78 * k, 50 * k, 17 * k); ctx.stroke();
      heartPath(ctx, g.cx + 78 * k, 50 * k, 17 * k); ctx.stroke();
      ctx.globalAlpha = 0.16;
      heartPath(ctx, g.cx, 56 * k, 56 * k); ctx.stroke();
      ctx.restore();
      text(ctx, 'Be Mine', g.cx, g.h * 0.72, FONT.script(g.t.title * 1.15), C.cherry, { max: g.w * 0.86 });
      occDivider(ctx, W, g.h * 0.9, 'rgba(184,147,74,.5)');
    },
    backing(ctx, s) { occSlotKeyline(ctx, s, 'rgba(179,32,42,.34)', 'rgba(179,32,42,.55)', 'rgba(250,244,238,.9)'); },
    drawText(ctx, L) {
      occFooterDraw(ctx, L, {
        rule: 'rgba(179,32,42,.34)', cap: C.ink, date: 'rgba(179,32,42,.8)', ded: C.ink,
        capFont: FONT.script,
      });
    },
  },

  halloween: {
    name: 'Halloween', category: 'occasions', group: 'occasions',
    ink: C.cream, pairs: ['darkroom', 'sepia'],
    hints: { caption: 'a name', dedication: 'a message' },
    variants: [['oxblood', 'Oxblood', '#2E0A0D'], ['black', 'Jet black', '#141110'], ['navy', 'Dark navy', '#141C2E']],
    metrics: occMetrics,
    footer: occFooterH,
    drawBg(ctx, L, v) {
      const { W, H } = L, K = 'rgba(201,169,122,', g = occHead(L), u = g.u;
      const orange = 'rgba(214,122,52,';
      ctx.fillStyle = v.color; ctx.fillRect(0, 0, W, H);
      occVignette(ctx, W, H, 'rgba(0,0,0,.62)', 0.85);
      grainOver(ctx, 0, 0, W, H, 0.6);
      occStars(ctx, W, g.h * 0.5, K + '1)', 73, 16);

      // a moon low on the left, with the bats arcing away from it
      const mr = Math.min(g.h * 0.2, g.w * 0.14), my = g.h * 0.28, mx = g.cx - g.w * 0.26;
      // a halo that falls off, rather than a flat disc whose hard edge read as a blot on the paper
      ctx.save();
      const halo = ctx.createRadialGradient(mx, my, mr * 0.7, mx, my, mr * 2.1);
      halo.addColorStop(0, 'rgba(201,169,122,.26)');
      halo.addColorStop(1, 'rgba(201,169,122,0)');
      ctx.fillStyle = halo;
      circle(ctx, mx, my, mr * 2.1); ctx.fill();
      ctx.restore();
      occCrescent(ctx, mx, my, mr, C.kraft);
      ctx.save();
      [[0.02, 0.17, 1], [0.18, 0.3, 0.7], [0.33, 0.2, 0.46]].forEach(([dx, dy, a], i) => {
        ctx.globalAlpha = a;
        occBat(ctx, g.cx + g.w * dx, g.h * dy, mr * (0.9 - i * 0.22), C.kraft);
      });
      ctx.restore();

      occBorder(ctx, W, H, K + '1)');
      // cobwebs strung across the two top corners
      ctx.save(); ctx.globalAlpha = 0.5;
      const cw = Math.min(g.h * 0.5, g.w * 0.17);
      occCobweb(ctx, 22 * u, 22 * u, cw, K + '1)', 1, 1);
      occCobweb(ctx, W - 22 * u, 22 * u, cw, K + '1)', -1, 1);
      ctx.restore();
      occFrameCorners(ctx, W, H, 27, 17, K + '.5)');
      // a spider dropping down the right margin, below the header so it clears the cobweb
      occSpider(ctx, W - 26 * u, g.h * 1.02, g.h * 0.62, 10 * u, K + '.85)');

      // "Boo." on a torn ticket stub, held clear of the photos whatever the header's depth
      const tw = Math.min(g.w * 0.52, g.t.title * 5.4), th = g.t.title * 1.4;
      const ty = Math.min(g.h * 0.76, g.h * 0.95 - th / 2);
      occTicket(ctx, g.cx, ty, tw, th, 'rgba(46,10,13,.78)', K + '.7)');
      text(ctx, 'Boo.', g.cx, ty, FONT.serif(g.t.title, 700), C.kraft, { track: g.t.title * 0.1, max: tw * 0.7 });
      ctx.save(); ctx.globalAlpha = 0.5; ctx.setLineDash([3 * u, 4 * u]);
      ctx.strokeStyle = K + '1)'; ctx.lineWidth = 1 * u;
      ctx.beginPath(); ctx.moveTo(g.x, g.h * 0.985); ctx.lineTo(g.x + g.w, g.h * 0.985); ctx.stroke();
      ctx.restore();
    },
    /* a ghost peeking out from behind the top photo's right corner — drawn after the photos so it
       reads as in front of the print, and held to the corner so it never covers a face */
    drawFg(ctx, L) {
      const s = L.slots[0];
      if (!s) return;
      /* Sized from the photo's own width so it covers the same share of it on every layout: a
         little over half the card hangs off the corner, leaving 8% of the photo covered, which is
         the most the decoration is allowed. Drawn in the slot's own frame so it sits on a tilted
         polaroid the way it sits on a square print. */
      const sz = s.w * 0.1;
      ctx.save();
      ctx.translate(s.x + s.w / 2, s.y + s.h / 2);
      if (s.rot) ctx.rotate((s.rot * Math.PI) / 180);
      occGhost(ctx, s.w / 2 - sz * 0.3, -s.h / 2 + sz * 0.34, sz, 'rgba(244,238,227,.92)', '#2E0A0D');
      ctx.restore();
    },
    backing(ctx, s) {
      occSlotKeyline(ctx, s, 'rgba(201,169,122,.42)', 'rgba(214,122,52,.5)', 'rgba(201,169,122,.16)');
    },
    drawText(ctx, L) {
      const g = occFoot(L), u = g.u, K = 'rgba(201,169,122,';
      // a row of jack-o'-lanterns beside the date
      const py = g.y + 46 * u, ps = Math.min(g.t.date * 0.5, g.w * 0.03);
      [-1, 1].forEach(d => {
        [0.3, 0.38, 0.46].forEach((k, i) => {
          occPumpkin(ctx, g.cx + d * g.w * k, py, ps * (1 - i * 0.14), 'rgba(214,122,52,.85)');
        });
      });
      occFooterDraw(ctx, L, { rule: K + '.4)', cap: C.cream, date: C.kraft, ded: C.cream });
    },
  },

  christmas: {
    name: 'Christmas', category: 'occasions', group: 'occasions',
    ink: C.ink, pairs: ['warm400', 'natural'],
    hints: { caption: 'a name', dedication: 'a message' },
    variants: [['sage', 'Sage', '#CAD5C2'], ['cream', 'Cream', '#F6F0E4'], ['navy', 'Night navy', '#1A2338']],
    metrics: occMetrics,
    footer: occFooterH,
    drawBg(ctx, L, v) {
      const { W, H } = L, g = occHead(L), u = g.u, dark = v.id === 'navy';
      const accentCol = dark ? C.gold : C.red;
      const borderCol = dark ? 'rgba(184,147,74,.5)' : 'rgba(42,33,28,.18)';
      const leafCol = dark ? 'rgba(167,180,154,.95)' : 'rgba(56,90,56,.75)';
      const cream = dark ? 'rgba(244,238,227,.9)' : 'rgba(252,248,240,.95)';
      ctx.fillStyle = v.color; ctx.fillRect(0, 0, W, H);
      occVignette(ctx, W, H, dark ? 'rgba(0,0,0,.5)' : 'rgba(60,70,55,.16)', 0.72);
      grainOver(ctx, 0, 0, W, H, 0.7);

      // a candy-stripe down both edges, the way a sweet-shop bag is printed
      const sx = 15 * u, sw = 4.5 * u;
      ctx.save(); ctx.globalAlpha = 0.85;
      occCandyStripe(ctx, sx, 26 * u, H - 52 * u, sw, C.cherry, cream, true);
      occCandyStripe(ctx, W - sx, 26 * u, H - 52 * u, sw, C.cherry, cream, true);
      ctx.restore();
      ctx.save(); ctx.strokeStyle = borderCol; ctx.lineWidth = 1 * u;
      ctx.strokeRect(25 * u, 21 * u, W - 50 * u, H - 42 * u); ctx.restore();
      occFrameCorners(ctx, W, H, 37, 17, dark ? 'rgba(184,147,74,.6)' : 'rgba(56,90,56,.42)');

      // the wreath, with a bow at its foot and the year held inside it
      const wr = Math.min(g.h * 0.235, g.w * 0.17), wy = g.h * 0.30;
      occWreath(ctx, g.cx, wy, wr, leafCol, C.cherry);
      occBow(ctx, g.cx, wy + wr * 1.12, wr * 0.26, C.cherry);
      text(ctx, String(D().shotDate.getFullYear()), g.cx, wy, FONT.type(g.t.year * 0.66),
        dark ? C.cream : C.muted, { track: g.t.year * 0.18 });
      // a holly sprig tucked into the header's top left corner
      occHolly(ctx, g.x + g.w * 0.11, g.h * 0.19, wr * 0.8, leafCol, C.cherry, -0.35);

      // baubles on fine gold threads, out at the sides so they clear the title
      const rule = g.h * 0.94;
      [[-0.4, 0.3, 0.052], [0.41, 0.22, 0.042]].forEach(([dx, drop, rr]) => {
        occBauble(ctx, g.cx + g.w * dx, g.h * 0.42, g.h * drop, g.h * rr,
          'rgba(184,147,74,.75)', dark ? 'rgba(184,147,74,.9)' : 'rgba(179,32,42,.75)', cream);
      });

      text(ctx, 'Merry Christmas', g.cx, g.h * 0.74, FONT.serifItalic(g.t.title, 700), accentCol, { max: g.w * 0.78 });
      occCandyStripe(ctx, g.cx - g.w * 0.28, rule, g.w * 0.56, 4 * u, C.cherry, cream);
    },
    backing(ctx, s, i, L, v) {
      const dark = v.id === 'navy';
      // a cream mat with a fine cherry line inside it
      occSlotKeyline(ctx, s, dark ? 'rgba(184,147,74,.4)' : 'rgba(42,33,28,.22)',
        'rgba(179,32,42,.55)', dark ? 'rgba(244,238,227,.92)' : 'rgba(252,248,240,.95)');
    },
    drawText(ctx, L, v) {
      const g = occFoot(L), u = g.u, dark = v.id === 'navy';
      const textCol = dark ? C.cream : C.ink;
      const leafCol = dark ? 'rgba(167,180,154,.9)' : 'rgba(56,90,56,.6)';
      // small snowflakes either side of the date, then the greeting in typewriter
      const fy = g.y + 46 * u;
      [-1, 1].forEach(d => {
        [0.3, 0.38, 0.46].forEach((k, i) => {
          occSnowflake(ctx, g.cx + d * g.w * k, fy, (6 - i) * u, 'rgba(184,147,74,.75)');
        });
      });
      occFooterDraw(ctx, L, {
        rule: dark ? 'rgba(184,147,74,.4)' : 'rgba(42,33,28,.2)',
        cap: textCol, date: textCol, ded: textCol,
      });
      text(ctx, "Season's Greetings", g.cx, g.y + g.h * 0.72, FONT.type(g.t.small),
        leafCol, { track: g.t.small * 0.24, max: g.w * 0.8 });
    },
  },

  graduation: {
    name: 'Graduation', category: 'occasions', group: 'occasions',
    ink: C.cream, pairs: ['darkroom', 'silver'],
    hints: { caption: 'the class year e.g. 2025', dedication: 'a congratulations message' },
    variants: [['oxblood', 'Oxblood', '#2E0A0D'], ['black', 'Jet black', '#141110'], ['navy', 'Navy', '#1A2338']],
    metrics: occMetrics,
    footer: occFooterH,
    drawBg(ctx, L, v) {
      const { W, H } = L, G = 'rgba(184,147,74,', g = occHead(L), k = g.h / 192;
      ctx.fillStyle = v.color; ctx.fillRect(0, 0, W, H);
      occVignette(ctx, W, H, 'rgba(0,0,0,.5)', 0.78);
      grainOver(ctx, 0, 0, W, H, 0.5);
      occBurst(ctx, g.cx, 58 * k, 46 * k, G + '.3)', 16);
      occGradCap(ctx, g.cx, 56 * k, 31 * k, C.gold);
      occBorder(ctx, W, H, G + '1)');
      occFrameCorners(ctx, W, H, 27, 22, G + '.78)');
      occRibbon(ctx, g.cx, g.h * 0.62, 132 * k, 27 * k, 'rgba(58,10,14,.55)', C.gold);
      text(ctx, 'CLASS OF', g.cx, g.h * 0.62, FONT.type(g.t.small), C.gold, { track: g.t.small * 0.46 });
      text(ctx, occHeadYear(), g.cx, g.h * 0.83, FONT.serif(g.t.title, 700), C.gold, { track: g.t.title * 0.1, max: g.w * 0.9 });
      occDivider(ctx, W, g.h * 0.95, G + '.5)');
    },
    backing(ctx, s) { occSlotKeyline(ctx, s, 'rgba(184,147,74,.5)', 'rgba(184,147,74,.75)'); },
    drawText(ctx, L) {
      occFooterDraw(ctx, L, { rule: 'rgba(184,147,74,.45)', cap: C.cream, date: C.gold, ded: C.cream });
    },
  },

  anniversary: {
    name: 'Anniversary', category: 'occasions', group: 'occasions',
    ink: C.ink, pairs: ['warm400', 'faded'],
    hints: { caption: "the couple's names", dedication: 'a message' },
    variants: [['blush', 'Blush', '#F0CCCE'], ['cream', 'Cream', '#F6F0E4'], ['dusty', 'Dusty blue', '#C4D3DF']],
    metrics: occMetrics,
    footer: occFooterH,
    drawBg(ctx, L, v) {
      const { W, H } = L, g = occHead(L), u = g.u, k = g.h / 186;
      ctx.fillStyle = v.color; ctx.fillRect(0, 0, W, H);
      grainOver(ctx, 0, 0, W, H, 0.7);
      ctx.save(); ctx.strokeStyle = 'rgba(184,147,74,.38)'; ctx.lineWidth = 1.5 * u;
      ctx.strokeRect(12 * u, 12 * u, W - 24 * u, H - 24 * u);
      ctx.globalAlpha = 0.35; ctx.lineWidth = 1 * u;
      ctx.strokeRect(20 * u, 20 * u, W - 40 * u, H - 40 * u); ctx.restore();
      occFrameCorners(ctx, W, H, 27, 21, 'rgba(184,147,74,.55)');
      occBurst(ctx, g.cx, 58 * k, 44 * k, 'rgba(184,147,74,.3)', 16);
      occRings(ctx, g.cx, 58 * k, 23 * k, 'rgba(184,147,74,.85)');
      text(ctx, 'ANNIVERSARY', g.cx, g.h * 0.61, FONT.serif(g.t.title * 0.74, 700), C.ink, { track: g.t.title * 0.2, max: g.w * 0.9 });
      occDivider(ctx, W, g.h * 0.75, 'rgba(184,147,74,.5)');
      if (caption()) text(ctx, caption(), g.cx, g.h * 0.89, FONT.script(g.t.year), C.ink, { max: g.w * 0.9 });
      else occHeartMark(ctx, g.cx, g.h * 0.89, g.t.year * 0.85, 'rgba(184,147,74,.85)');
    },
    backing(ctx, s) { occSlotKeyline(ctx, s, 'rgba(184,147,74,.42)', 'rgba(184,147,74,.6)', 'rgba(250,246,238,.85)'); },
    drawText(ctx, L) {
      occFooterDraw(ctx, L, { rule: 'rgba(184,147,74,.42)', cap: C.ink, date: C.muted, ded: C.ink, capFont: FONT.script });
    },
  },

  wedding: {
    name: 'Wedding', category: 'occasions', group: 'occasions',
    ink: C.ink, pairs: ['warm400', 'faded'],
    hints: { caption: "names or 'Mr & Mrs'", dedication: 'date and venue' },
    variants: [['cream', 'Ivory cream', '#FAFAF4'], ['blush', 'Blush white', '#F6ECEE'], ['paper', 'Natural paper', '#F4EEE3']],
    metrics: occMetrics,
    footer: occFooterH,
    drawBg(ctx, L, v) {
      const { W, H } = L, g = occHead(L), u = g.u, k = g.h / 178;
      ctx.fillStyle = v.color; ctx.fillRect(0, 0, W, H);
      occVignette(ctx, W, H, 'rgba(120,100,60,.14)', 0.7);
      grainOver(ctx, 0, 0, W, H, 0.7);
      ctx.save();
      ctx.strokeStyle = 'rgba(184,147,74,.5)'; ctx.lineWidth = 1.5 * u;
      ctx.strokeRect(12 * u, 12 * u, W - 24 * u, H - 24 * u);
      ctx.strokeStyle = 'rgba(184,147,74,.24)'; ctx.lineWidth = 1 * u;
      ctx.strokeRect(18 * u, 18 * u, W - 36 * u, H - 36 * u);
      ctx.strokeRect(24 * u, 24 * u, W - 48 * u, H - 48 * u); ctx.restore();
      occFrameCorners(ctx, W, H, 32, 22, 'rgba(184,147,74,.6)');
      occRings(ctx, g.cx, 50 * k, 15 * k, 'rgba(184,147,74,.7)');
      text(ctx, 'Mr & Mrs', g.cx, g.h * 0.58, FONT.serifItalic(g.t.title, 600), C.ink, { max: g.w * 0.88 });
      occDivider(ctx, W, g.h * 0.74, 'rgba(184,147,74,.55)', 72);
      if (caption()) text(ctx, caption(), g.cx, g.h * 0.89, FONT.script(g.t.year), C.muted, { max: g.w * 0.88 });
      else occHeartMark(ctx, g.cx, g.h * 0.89, g.t.year * 0.85, 'rgba(184,147,74,.8)');
    },
    backing(ctx, s) { occSlotKeyline(ctx, s, 'rgba(184,147,74,.42)', 'rgba(184,147,74,.58)', 'rgba(252,250,244,.9)'); },
    drawText(ctx, L) {
      occFooterDraw(ctx, L, { rule: 'rgba(184,147,74,.42)', cap: C.ink, date: C.muted, ded: C.ink, capFont: FONT.serifItalic });
    },
  },

  bdayA: {
    name: 'Birthday (A)', category: 'occasions', group: 'occasions',
    ink: C.ink, pairs: ['warm400', 'faded'],
    hints: { caption: "the birthday person's name", dedication: 'a message' },
    variants: [['butter', 'Butter', '#EBD9A0'], ['blush', 'Blush', '#F2D0D2'], ['cream', 'Cream', '#F6F0E4']],
    metrics: occMetrics,
    footer: occFooterH,
    drawBg(ctx, L, v) {
      const { W, H } = L, g = occHead(L), u = g.u, k = g.h / 192;
      ctx.fillStyle = v.color; ctx.fillRect(0, 0, W, H);
      occVignette(ctx, W, H, 'rgba(90,50,20,.14)', 0.7);
      grainOver(ctx, 0, 0, W, H, 0.7);
      occConfetti(ctx, W, g.h * 0.5, [C.cherry, C.gold, C.dusty, C.sage], 13);
      ctx.save(); ctx.strokeStyle = 'rgba(58,10,14,.24)'; ctx.lineWidth = 1.5 * u;
      ctx.strokeRect(12 * u, 12 * u, W - 24 * u, H - 24 * u);
      ctx.strokeStyle = 'rgba(58,10,14,.13)'; ctx.lineWidth = 1 * u;
      ctx.strokeRect(20 * u, 20 * u, W - 40 * u, H - 40 * u); ctx.restore();
      occFrameCorners(ctx, W, H, 27, 21, 'rgba(58,10,14,.4)');
      occRibbon(ctx, g.cx, g.h * 0.63, Math.min(g.w * 0.92, 196 * k), 30 * k, 'rgba(179,32,42,.9)', C.gold);
      text(ctx, 'HAPPY BIRTHDAY', g.cx, g.h * 0.63, FONT.serif(g.t.title * 0.7, 800), C.cream, { track: g.t.title * 0.1, max: Math.min(g.w * 0.8, 182 * k) });
      text(ctx, caption() || '★', g.cx, g.h * 0.85, FONT.script(g.t.year * 1.1), C.oxblood, { max: g.w * 0.9 });
      occDivider(ctx, W, g.h * 0.96, 'rgba(58,10,14,.2)');
    },
    backing(ctx, s) { occSlotKeyline(ctx, s, 'rgba(58,10,14,.2)', 'rgba(179,32,42,.55)', 'rgba(252,248,240,.9)'); },
    drawText(ctx, L) {
      occFooterDraw(ctx, L, { rule: 'rgba(58,10,14,.2)', cap: C.oxblood, date: C.muted, ded: C.ink, capFont: FONT.script });
    },
  },

  bdayB: {
    name: 'Birthday (B)', category: 'occasions', group: 'occasions',
    ink: C.cream, pairs: ['silver', 'darkroom'],
    hints: { caption: "the birthday person's name", dedication: 'a message' },
    variants: [['dusty', 'Dusty blue', '#2E4254'], ['navy', 'Navy', '#1A2338'], ['slate', 'Slate', '#333F49']],
    metrics: occMetrics,
    footer: occFooterH,
    drawBg(ctx, L, v) {
      const { W, H } = L, G = 'rgba(184,147,74,', g = occHead(L), k = g.h / 180;
      ctx.fillStyle = v.color; ctx.fillRect(0, 0, W, H);
      occVignette(ctx, W, H, 'rgba(0,0,0,.42)', 0.75);
      grainOver(ctx, 0, 0, W, H, 0.5);
      occBurst(ctx, g.cx, 56 * k, 40 * k, G + '.32)', 14);
      occStars(ctx, W, g.h * 0.53, G + '1)', 91, 10);
      occPartyHat(ctx, g.cx, 54 * k, 29 * k, C.gold);
      occBorder(ctx, W, H, G + '1)');
      occFrameCorners(ctx, W, H, 27, 21, G + '.7)');
      text(ctx, 'Happy Birthday', g.cx, g.h * 0.68, FONT.serifItalic(g.t.title, 600), C.gold, { max: g.w * 0.9 });
      text(ctx, caption() || '★', g.cx, g.h * 0.84, FONT.type(g.t.small), C.cream, { track: g.t.small * 0.3, max: g.w * 0.9 });
      occDivider(ctx, W, g.h * 0.95, G + '.45)');
    },
    backing(ctx, s) { occSlotKeyline(ctx, s, 'rgba(184,147,74,.45)', 'rgba(184,147,74,.7)'); },
    drawText(ctx, L) {
      occFooterDraw(ctx, L, { rule: 'rgba(184,147,74,.42)', cap: C.cream, date: C.gold, ded: C.cream });
    },
  },

  bridal: {
    name: 'Bridal Shower', category: 'occasions', group: 'occasions',
    ink: C.ink, pairs: ['warm400', 'faded'],
    hints: { caption: "the bride's name", dedication: 'a message' },
    variants: [['blush', 'Blush', '#F0CCCE'], ['cream', 'Cream', '#F8F4EE'], ['rose', 'Rose', '#E8B8BE']],
    metrics: occMetrics,
    footer: occFooterH,
    drawBg(ctx, L, v) {
      const { W, H } = L, g = occHead(L), u = g.u, k = g.h / 190;
      ctx.fillStyle = v.color; ctx.fillRect(0, 0, W, H);
      occVignette(ctx, W, H, 'rgba(140,50,70,.18)', 0.7);
      grainOver(ctx, 0, 0, W, H, 0.7);
      ctx.save(); ctx.strokeStyle = 'rgba(179,32,42,.3)'; ctx.lineWidth = 1.5 * u;
      ctx.strokeRect(12 * u, 12 * u, W - 24 * u, H - 24 * u);
      ctx.strokeStyle = 'rgba(184,147,74,.22)'; ctx.lineWidth = 1 * u;
      ctx.strokeRect(20 * u, 20 * u, W - 40 * u, H - 40 * u); ctx.restore();
      occFrameCorners(ctx, W, H, 27, 21, 'rgba(179,32,42,.4)');
      occBow(ctx, g.cx, 48 * k, 34 * k, 'rgba(179,32,42,.62)');
      ctx.save(); ctx.strokeStyle = 'rgba(184,147,74,.65)'; ctx.lineWidth = 1.4 * u;
      circle(ctx, g.cx, 98 * k, 11 * k); ctx.stroke();
      ctx.fillStyle = 'rgba(184,147,74,.8)';
      starPath(ctx, g.cx, 82 * k, 4.5 * k, 2 * k, 4); ctx.fill(); ctx.restore();
      text(ctx, 'SHE SAID YES', g.cx, g.h * 0.68, FONT.serif(g.t.title * 0.74, 700), C.ink, { track: g.t.title * 0.2, max: g.w * 0.9 });
      occDivider(ctx, W, g.h * 0.81, 'rgba(179,32,42,.26)');
      if (caption()) text(ctx, caption(), g.cx, g.h * 0.93, FONT.script(g.t.year * 0.9), C.muted, { max: g.w * 0.9 });
      else occHeartMark(ctx, g.cx, g.h * 0.93, g.t.year * 0.78, 'rgba(179,32,42,.6)');
    },
    backing(ctx, s) { occSlotKeyline(ctx, s, 'rgba(179,32,42,.26)', 'rgba(179,32,42,.5)', 'rgba(252,246,242,.9)'); },
    drawText(ctx, L) {
      occFooterDraw(ctx, L, { rule: 'rgba(179,32,42,.26)', cap: C.ink, date: C.muted, ded: C.ink, capFont: FONT.script });
    },
  },

  baby: {
    name: 'Baby Shower', category: 'occasions', group: 'occasions',
    ink: C.ink, pairs: ['natural', 'faded'],
    hints: { caption: "the baby's name", dedication: 'a message' },
    variants: [['sage', 'Sage', '#C8D4BE'], ['butter', 'Butter', '#EBD9A0'], ['mist', 'Mist', '#D6E2D4']],
    metrics: occMetrics,
    footer: occFooterH,
    drawBg(ctx, L, v) {
      const { W, H } = L, g = occHead(L), u = g.u, k = g.h / 186;
      ctx.fillStyle = v.color; ctx.fillRect(0, 0, W, H);
      occVignette(ctx, W, H, 'rgba(60,70,55,.14)', 0.7);
      grainOver(ctx, 0, 0, W, H, 0.7);
      ctx.save(); ctx.strokeStyle = 'rgba(42,33,28,.18)'; ctx.lineWidth = 1.5 * u;
      ctx.strokeRect(12 * u, 12 * u, W - 24 * u, H - 24 * u);
      ctx.globalAlpha = 0.5; ctx.lineWidth = 1 * u;
      ctx.strokeRect(20 * u, 20 * u, W - 40 * u, H - 40 * u); ctx.restore();
      occFrameCorners(ctx, W, H, 27, 20, 'rgba(42,33,28,.28)');
      ctx.save(); ctx.globalAlpha = 0.45; occCloud(ctx, g.cx - 62 * k, 44 * k, 50 * k, 'rgba(255,255,255,.9)');
      occCloud(ctx, g.cx + 68 * k, 38 * k, 42 * k, 'rgba(255,255,255,.9)'); ctx.restore();
      occCloud(ctx, g.cx, 66 * k, 92 * k, 'rgba(255,255,255,.82)');
      ctx.save(); ctx.fillStyle = 'rgba(184,147,74,.6)';
      [[-74, 86, 5.5], [76, 74, 5], [52, 100, 3.6], [-46, 24, 3.6]].forEach(([x, y, r]) => {
        starPath(ctx, g.cx + x * k, y * k, r * k, r * 0.44 * k, 5); ctx.fill();
      });
      ctx.restore();
      text(ctx, 'WELCOME BABY', g.cx, g.h * 0.67, FONT.serif(g.t.title * 0.7, 700), C.ink, { track: g.t.title * 0.2, max: g.w * 0.9 });
      if (caption()) text(ctx, caption(), g.cx, g.h * 0.82, FONT.script(g.t.year * 1.1), C.ink, { max: g.w * 0.9 });
      else occHeartMark(ctx, g.cx, g.h * 0.82, g.t.year * 0.9, 'rgba(42,33,28,.5)');
      occDivider(ctx, W, g.h * 0.94, 'rgba(42,33,28,.18)');
    },
    backing(ctx, s) { occSlotKeyline(ctx, s, 'rgba(42,33,28,.18)', 'rgba(42,33,28,.42)', 'rgba(252,250,244,.9)'); },
    drawText(ctx, L) {
      occFooterDraw(ctx, L, { rule: 'rgba(42,33,28,.18)', cap: C.ink, date: C.muted, ded: C.ink, capFont: FONT.script });
    },
  },

  prom: {
    name: 'Prom Night', category: 'occasions', group: 'occasions',
    ink: C.cream, pairs: ['darkroom', 'silver'],
    hints: { caption: 'the prom year e.g. 2025', dedication: 'a message' },
    variants: [['navy', 'Midnight navy', '#1A2338'], ['black', 'Jet black', '#141110'], ['oxblood', 'Oxblood', '#2E0A0D']],
    metrics: occMetrics,
    footer: occFooterH,
    drawBg(ctx, L, v) {
      const { W, H } = L, G = 'rgba(184,147,74,', g = occHead(L), k = g.h / 190;
      ctx.fillStyle = v.color; ctx.fillRect(0, 0, W, H);
      occVignette(ctx, W, H, 'rgba(0,0,0,.55)', 0.82);
      grainOver(ctx, 0, 0, W, H, 0.5);
      occStars(ctx, W, g.h * 0.53, G + '1)', 47, 16);
      occBurst(ctx, g.cx, 54 * k, 42 * k, G + '.34)', 14);
      occBowtie(ctx, g.cx, 54 * k, 30 * k, C.gold);
      occBorder(ctx, W, H, G + '1)');
      occFrameCorners(ctx, W, H, 27, 22, G + '.78)');
      text(ctx, 'PROM', g.cx, g.h * 0.63, FONT.serif(g.t.title * 0.82, 700), C.gold, { track: g.t.title * 0.33 });
      text(ctx, occHeadYear(), g.cx, g.h * 0.82, FONT.serif(g.t.title, 700), C.cream, { track: g.t.title * 0.3, max: g.w * 0.9 });
      occDivider(ctx, W, g.h * 0.94, G + '.5)');
    },
    backing(ctx, s) { occSlotKeyline(ctx, s, 'rgba(184,147,74,.5)', 'rgba(184,147,74,.75)'); },
    drawText(ctx, L) {
      occFooterDraw(ctx, L, { rule: 'rgba(184,147,74,.45)', cap: C.cream, date: C.gold, ded: C.cream });
    },
  },
};

function sprockets(ctx, L, B) {
  const len = L.horizontal ? B.w : B.h, pitch = 26, n = Math.floor((len - 20) / pitch), start = (len - n * pitch) / 2;
  for (let i = 0; i <= n; i++) {
    const p = start + i * pitch - 7;
    if (L.horizontal) { rrect(ctx, B.x + p, B.y + 15, 14, 19, 3); ctx.fill(); rrect(ctx, B.x + p, B.y + B.h - 34, 14, 19, 3); ctx.fill(); }
    else { rrect(ctx, B.x + 15, B.y + p, 19, 14, 3); ctx.fill(); rrect(ctx, B.x + B.w - 34, B.y + p, 19, 14, 3); ctx.fill(); }
  }
}

// The chosen colour variant for a frame (or a neutral stand-in)
export function variantOf(id, d = state.design) {
  const f = FRAMES[id];
  if (!f.variants.length) return { id: 'default', name: '', color: '' };
  const [vid, name, color] = f.variants.find(v => v[0] === d.variants[id]) || f.variants[0];
  return { id: vid, name, color };
}
