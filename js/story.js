/* Story collage (1080×1920): four editorial scrapbook templates. */
import { C, $, $$, el, FONT, MONTH_NAMES, dateLong, fitFont, heartPath, tracking, range } from './utils.js';
import { state } from './state.js';
import { fillBackground, PATTERNS } from './patterns.js';
import { drawFilteredPhoto } from './filters.js';
import { grainOver, drawLetterPaper, drawSafetyPin, typeLabel } from './textures.js';
import { fileName, deliver } from './export.js';
import { toast } from './ui.js';

const W = 1080, H = 1920;
const TEMPLATES = [
  { id: 'pinned', name: 'Pinned', base: C.oxblood, pattern: 'solid' },
  { id: 'calendar', name: 'Calendar', base: C.cream, pattern: 'solid' },
  { id: 'polka', name: 'Polka', base: C.oxblood, pattern: 'polka' },
  { id: 'starry', name: 'Starry', base: C.navy, pattern: 'stars' },
];

const words = () => state.story.dedication.trim();
const dateLine = () => state.story.date.trim() || dateLong(state.design.shotDate);

function background(ctx, tpl) {
  fillBackground(ctx, { color: tpl.base, pattern: state.story.pattern }, 0, 0, W, H, 2.2, 31);
  grainOver(ctx, 0, 0, W, H, 0.7);
  const v = ctx.createRadialGradient(W / 2, H * 0.42, H * 0.25, W / 2, H * 0.45, H * 0.78);
  v.addColorStop(0, 'rgba(14,2,4,0)'); v.addColorStop(1, tpl.base === C.cream ? 'rgba(92,75,65,.18)' : 'rgba(14,2,4,.45)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}

function fitStrip(img, maxW, maxH) {
  const s = Math.min(maxW / img.width, maxH / img.height);
  return { w: img.width * s, h: img.height * s };
}

function drawStrip(ctx, img, cx, cy, w, h, rot = 0) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.shadowColor = 'rgba(14,2,4,.38)'; ctx.shadowBlur = 36; ctx.shadowOffsetY = 16;
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function wordmark(ctx, color, y = H - 64) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.7;
  ctx.textAlign = 'center';
  ctx.font = FONT.logo(40);
  ctx.fillText('Photomatic', W / 2, y);
  ctx.restore();
}

// A translucent strip of washi tape
function tape(ctx, x, y, w, rot, color = 'rgba(244,238,227,.82)') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -18);
  for (let k = 0; k <= 6; k++) ctx.lineTo(-w / 2 + (k % 2 ? 5 : 0), -18 + k * 6);
  for (let k = 0; k <= 6; k++) ctx.lineTo(w / 2 - (k % 2 ? 5 : 0), 18 - k * 6);
  ctx.closePath();
  ctx.shadowColor = 'rgba(14,2,4,.2)'; ctx.shadowBlur = 4;
  ctx.fill();
  ctx.fillStyle = 'rgba(94,28,35,.35)';
  for (let k = -w / 2 + 10; k < w / 2 - 6; k += 18) ctx.fillRect(k, -18, 8, 36);
  ctx.restore();
}

// Draw text along a polyline, centred on its length
function textOnPath(ctx, text, pts, size) {
  const segs = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(l); total += l; }
  const at = d => {
    for (let i = 0; i < segs.length; i++) {
      if (d <= segs[i]) { const k = d / segs[i], a = pts[i], b = pts[i + 1]; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, Math.atan2(b[1] - a[1], b[0] - a[0])]; }
      d -= segs[i];
    }
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    return [b[0], b[1], Math.atan2(b[1] - a[1], b[0] - a[0])];
  };
  let s = size;
  ctx.font = FONT.script(s);
  while (ctx.measureText(text).width > total * 0.9 && s > 30) ctx.font = FONT.script(--s);
  let d = (total - ctx.measureText(text).width) / 2;
  for (const ch of text) {
    const cw = ctx.measureText(ch).width;
    const [x, y, a] = at(d + cw / 2);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillText(ch, -cw / 2, 0);
    ctx.restore();
    d += cw;
  }
}

// Catmull-Rom through points, sampled into a polyline
function smoothPath(points, steps = 24) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    for (let k = 0; k < steps; k++) {
      const t = k / steps, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(j => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

const RENDER = {
  // the strip pinned with a safety pin onto a handwritten letter
  pinned(ctx, tpl, img) {
    background(ctx, tpl);
    const wide = img.width > img.height;
    const { w, h } = fitStrip(img, wide ? 820 : 470, wide ? 560 : 1120);
    const pw = w + (wide ? 120 : 200), ph = h + 260, cy = 330 + ph / 2;
    ctx.save();
    ctx.translate(W / 2, cy);
    ctx.rotate(-0.025);
    drawLetterPaper(ctx, -pw / 2, -ph / 2, pw, ph);
    ctx.restore();
    drawStrip(ctx, img, W / 2, cy - 30, w, h, 0.02);
    drawSafetyPin(ctx, W / 2 - w * 0.12, cy - 30 - h / 2 + 18, Math.min(260, w * 0.7), -0.3);

    ctx.fillStyle = C.cream;
    ctx.textAlign = 'center';
    ctx.font = FONT.serifItalic(62, 500);
    fitFont(ctx, s => FONT.serifItalic(s, 500), 62, dateLine(), W - 160, 30);
    ctx.fillText(dateLine(), W / 2, 210);
    const t = words();
    if (t) {
      ctx.fillStyle = C.ink;
      fitFont(ctx, FONT.script, 76, t, pw - 120, 30);
      ctx.fillText(t, W / 2, cy + ph / 2 - 90);
    }
    wordmark(ctx, C.cream);
  },

  // an elegant month calendar, today circled with a small heart
  calendar(ctx, tpl, img) {
    background(ctx, tpl);
    const dark = tpl.base !== C.cream && state.story.pattern !== 'checker';
    const ink = dark ? C.cream : C.ink, accent = dark ? C.blush : C.cherry;
    const d = state.design.shotDate, y = d.getFullYear(), m = d.getMonth();
    const wide = img.width > img.height;
    const left = 96, colW = wide ? 126 : 76;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = ink;
    ctx.textAlign = 'left';
    ctx.font = FONT.serifItalic(wide ? 150 : 124, 500);
    ctx.fillText(MONTH_NAMES[m], left, 260);
    typeLabel(ctx, String(y), left + 8, 318, 34, ink, 'left');

    const gy = 420, rowH = wide ? 88 : 86;
    ctx.strokeStyle = dark ? 'rgba(244,238,227,.35)' : 'rgba(42,33,28,.28)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(left, gy + 22); ctx.lineTo(left + colW * 7, gy + 22); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = FONT.type(24);
    ctx.fillStyle = ink;
    'SMTWTFS'.split('').forEach((ch, i) => ctx.fillText(ch, left + colW * (i + 0.5), gy));
    const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
    for (let day = 1; day <= days; day++) {
      const idx = first + day - 1, cx = left + colW * ((idx % 7) + 0.5), cy = gy + 84 + Math.floor(idx / 7) * rowH;
      ctx.fillStyle = ink;
      ctx.font = FONT.serif(34, day === d.getDate() ? 700 : 400);
      if (day === d.getDate()) {
        ctx.save();
        ctx.strokeStyle = accent; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(cx, cy - 11, 36, 31, -0.15, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = accent;
        heartPath(ctx, cx + 30, cy - 46, 24); ctx.fill();
        ctx.restore();
      }
      ctx.fillText(String(day), cx, cy);
    }

    if (wide) {
      const { w, h } = fitStrip(img, 900, 600);
      drawStrip(ctx, img, W / 2, 1390, w, h, -0.02);
    } else {
      const { w, h } = fitStrip(img, 340, 1440);
      drawStrip(ctx, img, 852, 1000, w, h, 0.03);
    }
    const t = words();
    if (t) {
      ctx.fillStyle = accent;
      ctx.textAlign = wide ? 'center' : 'left';
      fitFont(ctx, FONT.script, 84, t, wide ? W - 200 : 560, 30);
      ctx.fillText(t, wide ? W / 2 : left, wide ? 1790 : 1160);
    }
    wordmark(ctx, ink);
  },

  // taped polaroids scattered softly, each with a typed label
  polka(ctx, tpl) {
    background(ctx, tpl);
    const d = state.design, n = d.photos.length;
    const spots = n >= 4
      ? [[310, 520, -0.07], [770, 650, 0.06], [330, 1130, 0.05], [760, 1260, -0.06]]
      : [[330, 560, -0.06], [750, 900, 0.07], [360, 1260, -0.04]];
    const pw = 400, ph = 300, m = 22, mb = 92;
    d.photos.slice(0, spots.length).forEach((p, i) => {
      const [x, y, r] = spots[i];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(r);
      ctx.shadowColor = 'rgba(14,2,4,.45)'; ctx.shadowBlur = 34; ctx.shadowOffsetY = 14;
      ctx.fillStyle = '#FAF6EE';
      ctx.fillRect(-pw / 2 - m, -ph / 2 - m, pw + m * 2, ph + m + mb);
      ctx.shadowColor = 'transparent';
      grainOver(ctx, -pw / 2 - m, -ph / 2 - m, pw + m * 2, ph + m + mb, 0.8);
      drawFilteredPhoto(ctx, p, d.filter, d.intensity, -pw / 2, -ph / 2, pw, ph);
      typeLabel(ctx, `no. ${String(i + 1).padStart(2, '0')}`, -pw / 2 + 4, ph / 2 + 46, 28, C.ink, 'left');
      typeLabel(ctx, dateLine().split(',')[0].toLowerCase(), pw / 2 - 4, ph / 2 + 46, 24, C.muted, 'right');
      ctx.restore();
      tape(ctx, x + Math.sin(r) * (ph / 2 + m), y - Math.cos(r) * (ph / 2 + m), 150, r + (i % 2 ? 0.12 : -0.1));
    });
    // the header is typed on a little paper label so it reads over the dots
    const head = `photomatic  ·  ${dateLine().toLowerCase()}`;
    ctx.save();
    ctx.font = FONT.type(30);
    const hw = ctx.measureText(head).width + head.length * 1.8 + 64;
    ctx.translate(W / 2, 200);
    ctx.rotate(-0.015);
    ctx.shadowColor = 'rgba(14,2,4,.4)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5;
    ctx.fillStyle = '#FBF6EC';
    ctx.fillRect(-hw / 2, -34, hw, 68);
    ctx.restore();
    typeLabel(ctx, head, W / 2, 200, 30, C.ink);
    const t = words();
    if (t) {
      ctx.fillStyle = C.cream;
      ctx.textAlign = 'center';
      fitFont(ctx, FONT.script, 96, t, W - 180, 30);
      ctx.fillText(t, W / 2, 1700);
    }
    wordmark(ctx, C.cream);
  },

  // photos in small circles along a gentle line, the dedication weaving between
  starry(ctx, tpl) {
    background(ctx, tpl);
    const ink = C.cream;
    const d = state.design, n = d.photos.length, R = n >= 4 ? 170 : 200;
    const y0 = 380, y1 = 1480;
    const centres = range(n).map(i => {
      const k = n === 1 ? 0.5 : i / (n - 1);
      return [W / 2 + Math.sin(k * Math.PI * 1.6 - 0.8) * 250, y0 + k * (y1 - y0)];
    });
    // a faint dotted line linking them
    ctx.save();
    ctx.strokeStyle = 'rgba(244,238,227,.35)';
    ctx.setLineDash([2, 12]); ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    smoothPath(centres).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.restore();
    centres.forEach(([x, y], i) => {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
      ctx.beginPath(); ctx.arc(x, y, R + 12, 0, Math.PI * 2); ctx.fillStyle = C.cream; ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.clip();
      drawFilteredPhoto(ctx, d.photos[i], d.filter, d.intensity, x - R * 4 / 3, y - R, R * 8 / 3, R * 2);
      ctx.restore();
    });
    const t = words();
    if (t && n > 1) {
      // weave: beside each circle on alternating sides, through the gaps between
      const pts = [];
      centres.forEach(([x, y], i) => {
        const side = i % 2 ? -1 : 1;
        pts.push([x + side * (R + 70), y]);
        if (i < n - 1) pts.push([(x + centres[i + 1][0]) / 2, (y + centres[i + 1][1]) / 2]);
      });
      ctx.fillStyle = C.blush;
      textOnPath(ctx, t, smoothPath(pts), 66);
    } else if (t) {
      ctx.fillStyle = C.blush;
      ctx.textAlign = 'center';
      fitFont(ctx, FONT.script, 90, t, W - 180, 30);
      ctx.fillText(t, W / 2, 1690);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = ink;
    tracking(ctx, 6);
    ctx.font = FONT.type(28);
    ctx.globalAlpha = 0.85;
    ctx.fillText(dateLine().toUpperCase(), W / 2 + 5, 1780);
    ctx.globalAlpha = 1;
    tracking(ctx, 0);
    wordmark(ctx, ink, H - 52);
  },
};

function renderStory(ctx) {
  const tpl = TEMPLATES.find(t => t.id === state.story.template);
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  RENDER[tpl.id](ctx, tpl, state.output.canvas);
  ctx.restore();
}

/* =========================================================
   Story sheet
   ========================================================= */
const dialog = $('#story-dialog');
const preview = $('#story-canvas');
preview.width = W; preview.height = H;
let raf = 0;
const redraw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => renderStory(preview.getContext('2d'))); };

function chips(root, items, current, onPick) {
  root.replaceChildren(...items.map(([id, name]) => el('button', {
    className: 'chip', text: name, attrs: { type: 'button', 'aria-pressed': String(id === current) }, dataset: { value: id },
    on: { click: () => onPick(id) },
  })));
}
function refresh() {
  chips($('#story-templates'), TEMPLATES.map(t => [t.id, t.name]), state.story.template, id => {
    state.story.template = id;
    state.story.pattern = TEMPLATES.find(t => t.id === id).pattern;
    refresh();
  });
  chips($('#story-patterns'), PATTERNS.map(p => [p.id, p.name]), state.story.pattern, id => { state.story.pattern = id; refresh(); });
  redraw();
}

$('#story-dedication').addEventListener('input', e => { state.story.dedication = e.target.value; redraw(); });
$('#story-date').addEventListener('input', e => { state.story.date = e.target.value; redraw(); });

export function openStory() {
  state.story.dedication = state.design.dedication || state.design.caption;
  state.story.date = '';
  $('#story-dedication').value = state.story.dedication;
  $('#story-date').value = '';
  $('#story-date').placeholder = dateLong(state.design.shotDate);
  refresh();
  dialog.showModal();
  $$('#story-templates .chip')[0].focus();
}
$('#story-close').addEventListener('click', () => dialog.close());
$('#story-download').addEventListener('click', async () => {
  cancelAnimationFrame(raf);
  renderStory(preview.getContext('2d'));
  const blob = await new Promise(r => preview.toBlob(r, 'image/png'));
  if (await deliver(blob, fileName('story'), 'My Photomatic story')) toast('Story collage saved.');
});
