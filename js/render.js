/* One renderer for the editor preview and every export. */
import { C, FONT, dateTypewriter, dateSerif, dateDigital, circle, fitFont, tracking } from './utils.js';
import { state } from './state.js';
import { LAYOUTS } from './layouts.js';
import { FRAMES, variantOf } from './frames.js';
import { bgIsDark } from './patterns.js';
import { grainOver } from './textures.js';
import { drawFilteredPhoto } from './filters.js';
import { drawSticker, stickerBox } from './stickers.js';

const DATE_FORMAT = { typewriter: dateTypewriter, serif: dateSerif, digital: dateDigital };
export const dateText = (d = state.design, style = d.date.style) => d.date.text.trim() || DATE_FORMAT[style](d.shotDate);

// Patterns too busy to read text on: the footer gets a paper label
const BUSY = new Set(['polka', 'gingham', 'stripe', 'checker']);

// Where everything sits on the strip, in logical units
export function computeLayout(d = state.design) {
  const f = FRAMES[d.frame];
  const v = variantOf(d.frame, d);
  const lay = LAYOUTS[d.layout];
  const n = d.photos.length;
  const horizontal = !!lay.horizontal;
  const m = f.metrics(horizontal, d, v);
  const W = Math.round(lay.width(n, m.pad, m.gap));
  const region = { x: m.pad, y: m.top, w: W - m.pad * 2, h: 0 };
  const { slots, h } = lay.arrange(n, region.w, m.gap);
  slots.forEach(s => { s.x += region.x; s.y += region.y; });
  region.h = h;
  const photosEnd = region.y + h;

  // footer: the frame's own text spots, or the standard caption / date / dedication block
  const footerDate = !f.footer && d.date.show && d.date.style !== 'digital' ? d.date.style : null;
  let fy = photosEnd + m.footerGap;
  const items = {};
  if (f.footer) fy += f.footer();
  else {
    if (d.caption.trim()) { items.caption = fy + 18; fy += 42; }
    if (footerDate) { items.date = fy + 12; fy += 32; }
    if (d.dedication.trim()) { items.dedication = fy + 24; fy += 54; }
  }
  const footerEnd = fy;
  const markY = footerEnd + 14;          // discreet wordmark right under the footer
  const decoY = footerEnd + (f.footer ? 0 : 32);
  const H = Math.round(decoY + m.bottom);
  // the booth print can be a double strip: two identical strips on one card
  const double = !!(f.canDouble && d.double && d.layout === 'strip');

  const label = f.paper && BUSY.has(d.bg.pattern);
  const ink = label ? C.ink : f.paper ? (bgIsDark(d.bg) ? C.cream : (f.ink || C.ink)) : f.ink;
  const fm = f.mat ? { color: f.mat.color, t: f.mat.w, r: f.mat.w, b: f.mat.w, l: f.mat.w } : { color: null, t: 0, r: 0, b: 0, l: 0 };
  return {
    W: double ? W * 2 : W, W1: W, double, v,
    H, n, f, m, slots, region, photosEnd, footerEnd, markY, decoY, items, horizontal, footerDate, label,
    textW: Math.min(region.w, 504),
    isStrip: d.layout === 'strip',
    mat: lay.mat || fm,
    ownMat: !!lay.mat,
    shadow: !!lay.shadow,
    ink,
  };
}

// Run fn inside each photo's rotated frame; `box` is the mat's outer rect
export function eachPhotoFrame(ctx, L, fn) {
  const m = L.mat;
  L.slots.forEach((s, i) => {
    const p = state.design.photos[i];
    if (!p) return;
    ctx.save();
    ctx.translate(s.x + s.w / 2, s.y + s.h / 2);
    if (s.rot) ctx.rotate((s.rot * Math.PI) / 180);
    fn({ x: -s.w / 2 - m.l, y: -s.h / 2 - m.t, w: s.w + m.l + m.r, h: s.h + m.t + m.b }, s, p, i);
    ctx.restore();
  });
}

function drawPhotos(ctx, L) {
  const d = state.design;
  eachPhotoFrame(ctx, L, (box, s, p, i) => {
    if (L.f.backing && !L.ownMat) L.f.backing(ctx, s, i, L, L.v);
    if (L.shadow) {
      ctx.save();
      ctx.shadowColor = 'rgba(42,33,28,.3)';
      ctx.shadowBlur = 14 * Math.hypot(ctx.getTransform().a, ctx.getTransform().b);
      ctx.shadowOffsetY = 5 * Math.hypot(ctx.getTransform().a, ctx.getTransform().b);
      ctx.fillStyle = L.mat.color;
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.restore();
      grainOver(ctx, box.x, box.y, box.w, box.h, 0.6);
    } else if (L.mat.color) {
      ctx.fillStyle = L.mat.color;
      ctx.fillRect(box.x, box.y, box.w, box.h);
    }
    drawFilteredPhoto(ctx, p, d.filter, d.intensity, -s.w / 2, -s.h / 2, s.w, s.h);
  });
}

/* --- film-camera date: seven-segment digits, drawn by hand --- */
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcfgd', '-': 'g' };

function sevenSegWidth(text, h) {
  return [...text].reduce((w, ch) => w + (SEG[ch] ? h * 0.56 : ch === ' ' ? h * 0.34 : h * 0.24) + h * 0.14, 0);
}

function drawSevenSeg(ctx, text, right, bottom, h) {
  const w = h * 0.56, t = h * 0.13;
  let x = right - sevenSegWidth(text, h);
  const top = bottom - h;
  ctx.save();
  ctx.fillStyle = C.orange;
  ctx.shadowColor = 'rgba(240,138,43,.75)';
  ctx.shadowBlur = h * 0.35 * Math.hypot(ctx.getTransform().a, ctx.getTransform().b);
  ctx.transform(1, 0, -0.08, 1, bottom * 0.08, 0);
  for (const ch of text) {
    const segs = SEG[ch];
    if (segs) {
      const R = {
        a: [x + t * 0.6, top, w - t * 1.2, t], g: [x + t * 0.6, top + h / 2 - t / 2, w - t * 1.2, t], d: [x + t * 0.6, top + h - t, w - t * 1.2, t],
        f: [x, top + t * 0.6, t, h / 2 - t * 0.9], b: [x + w - t, top + t * 0.6, t, h / 2 - t * 0.9],
        e: [x, top + h / 2 + t * 0.3, t, h / 2 - t * 0.9], c: [x + w - t, top + h / 2 + t * 0.3, t, h / 2 - t * 0.9],
      };
      for (const k of segs) ctx.fillRect(...R[k]);
      x += w + h * 0.14;
    } else if (ch === ' ') {
      x += h * 0.34 + h * 0.14;
    } else {
      ctx.fillRect(x + h * 0.06, top, t, h * 0.28);
      x += h * 0.24 + h * 0.14;
    }
  }
  ctx.restore();
}

function drawDigitalDate(ctx, L) {
  const d = state.design;
  if (!d.date.show || d.date.style !== 'digital') return;
  const last = L.slots.length - 1;
  eachPhotoFrame(ctx, L, (box, s, p, i) => {
    if (i !== last) return;
    const h = Math.max(14, s.w * 0.042);
    drawSevenSeg(ctx, dateText(d, 'digital').replace(/[^0-9 '\-]/g, ''), s.w / 2 - h * 0.7, s.h / 2 - h * 0.6, h);
  });
}

function drawFooter(ctx, L) {
  const d = state.design, it = L.items;
  const cx = L.W / 2;
  if (L.label) {
    // a cream paper label taped under the photos, so the words stay readable
    const top = L.photosEnd + L.m.footerGap - 14, bottom = L.markY + 14;
    const w = Math.min(L.region.w, L.textW + 40);
    ctx.save();
    ctx.translate(cx, (top + bottom) / 2);
    ctx.rotate(-0.012);
    ctx.shadowColor = 'rgba(20,6,8,.3)'; ctx.shadowBlur = 8 * Math.hypot(ctx.getTransform().a, ctx.getTransform().b); ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#FBF6EC';
    ctx.fillRect(-w / 2, -(bottom - top) / 2, w, bottom - top);
    ctx.shadowColor = 'transparent';
    grainOver(ctx, -w / 2, -(bottom - top) / 2, w, bottom - top, 0.8);
    ctx.restore();
  }
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = L.ink;
  if (it.caption != null) {
    fitFont(ctx, FONT.type, 25, d.caption.trim(), L.textW, 13);
    ctx.fillText(d.caption.trim(), cx, it.caption);
  }
  if (it.date != null) {
    const text = dateText(d, L.footerDate).toUpperCase();
    if (L.footerDate === 'serif') {
      tracking(ctx, 7);
      ctx.font = FONT.serif(17, 600);
      ctx.fillText(text, cx + 3.5, it.date);
    } else {
      tracking(ctx, 3);
      ctx.font = FONT.type(18);
      ctx.fillText(text, cx + 1.5, it.date);
    }
    tracking(ctx, 0);
  }
  if (it.dedication != null) {
    fitFont(ctx, FONT.script, 38, d.dedication.trim(), L.textW, 16);
    ctx.fillText(d.dedication.trim(), cx, it.dedication);
  }
  // discreet wordmark
  ctx.globalAlpha = 0.55;
  ctx.font = FONT.logo(16);
  ctx.fillText('photomatic', cx, L.markY);
  ctx.restore();
}

/* --- selection handles (screen only) --- */
export function handlePositions(s, scale) {
  const { w, h } = stickerBox(s);
  const m = 8 / scale, off = 30 / scale;
  const at = (lx, ly) => {
    const c = Math.cos(s.rot), sn = Math.sin(s.rot);
    return { x: s.x + lx * c - ly * sn, y: s.y + lx * sn + ly * c };
  };
  return { rotate: at(0, -h / 2 - m - off), resize: at(w / 2 + m, h / 2 + m) };
}

function drawSelection(ctx, s, scale) {
  const { w, h } = stickerBox(s);
  const u = 1 / scale, m = 8 * u, off = 30 * u;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.rot);
  ctx.strokeStyle = C.cherry;
  ctx.lineWidth = 1.5 * u;
  ctx.setLineDash([5 * u, 4 * u]);
  ctx.strokeRect(-w / 2 - m, -h / 2 - m, w + 2 * m, h + 2 * m);
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(0, -h / 2 - m); ctx.lineTo(0, -h / 2 - m - off); ctx.stroke();
  ctx.restore();
  const hp = handlePositions(s, scale);
  [hp.rotate, hp.resize].forEach(p => {
    ctx.save();
    ctx.shadowColor = 'rgba(42,33,28,.25)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    circle(ctx, p.x, p.y, 10 * u);
    ctx.fillStyle = '#FBF6EC'; ctx.fill();
    ctx.restore();
    circle(ctx, p.x, p.y, 10 * u);
    ctx.strokeStyle = C.cherry; ctx.lineWidth = 1.75 * u; ctx.stroke();
  });
  ctx.save();
  ctx.strokeStyle = C.cherry; ctx.lineWidth = 1.5 * u; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(hp.rotate.x, hp.rotate.y, 4.5 * u, -Math.PI * 0.15, Math.PI * 1.3); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(hp.resize.x - 4 * u, hp.resize.y - 4 * u); ctx.lineTo(hp.resize.x + 4 * u, hp.resize.y + 4 * u);
  ctx.stroke();
  ctx.restore();
}

/* --- the render pass --- */
function drawStrip(ctx, L, quality, ui) {
  const d = state.design, ed = state.editor;
  L.f.drawBg(ctx, L, L.v);
  drawPhotos(ctx, L);
  drawDigitalDate(ctx, L);
  if (L.f.drawFg) L.f.drawFg(ctx, L, L.v);
  if (L.f.drawText) L.f.drawText(ctx, L, L.v);
  else drawFooter(ctx, L);

  // perforations, sprockets and lace eyelets are cut out of the paper
  if (L.f.punch) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    L.f.punch(ctx, L, L.v);
    ctx.restore();
  }
  // whatever lies underneath (letter paper) shows through the holes
  if (L.f.under) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    L.f.under(ctx, L, L.v);
    ctx.restore();
  }
  d.stickers.forEach(s => drawSticker(ctx, s, { quality, lifted: ui && ed.drag && ed.drag.s === s && ed.drag.type === 'move' }));
}

export function render(ctx, scale, { ui = false, quality = 'screen', L = computeLayout() } = {}) {
  const d = state.design, ed = state.editor;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, L.W, L.H);
  ctx.imageSmoothingQuality = 'high';
  if (!L.double) drawStrip(ctx, L, quality, ui);
  else {
    // the same strip twice, side by side, with a faint cutting line between
    const one = { ...L, W: L.W1 };
    [0, L.W1].forEach(x => {
      ctx.save();
      ctx.translate(x, 0);
      ctx.beginPath(); ctx.rect(0, 0, L.W1, L.H); ctx.clip();
      drawStrip(ctx, one, quality, ui);
      ctx.restore();
    });
    ctx.save();
    ctx.strokeStyle = 'rgba(244,238,227,.35)'; ctx.setLineDash([6, 8]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L.W1, 8); ctx.lineTo(L.W1, L.H - 8); ctx.stroke();
    ctx.restore();
  }
  const selected = ui ? d.stickers.find(s => s.uid === ed.selected) : null;
  if (selected) drawSelection(ctx, selected, ed.view.scale);
  ctx.restore();
}
