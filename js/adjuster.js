/* The photo adjuster: a modal that crops one photo at a time to the exact shape of the layout's slots.
   Drag to move, pinch / wheel / slider to zoom, straighten, rotate 90°, flip, reset. Edits are kept per
   photo while stepping through them with Previous / Next; Apply hands them all back, Cancel drops them.
   The window always stays filled (see crop.js). */
import { $, makeCanvas, reducedMotion } from './utils.js';
import { cropGeometry, imageFrame, defaultCrop, ZOOM_MAX, ANGLE_MAX } from './crop.js';
import { switchClick } from './sound.js';
import { onScreen } from './ui.js';

const dlg = $('#adjust-dialog');
const canvas = $('#adj-canvas');
const zoomIn = $('#adj-zoom'), angleIn = $('#adj-angle');
const PREVIEW_PX = 1600;                    // the preview draws from a smaller copy of the original
const previews = new WeakMap();
const preview = img => {
  if (!previews.has(img)) {
    const s = Math.min(1, PREVIEW_PX / Math.max(img.width, img.height));
    let p = img;
    if (s < 1) { p = makeCanvas(img.width * s, img.height * s); const x = p.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, p.width, p.height); }
    previews.set(img, p);
  }
  return previews.get(img);
};

let S = null;   // the open session: { photos, index, aspect, work: [crop], resolve, guides, pointers, drag }

// Close adjuster whenever the user navigates to any non-editor screen (back gesture, browser nav, etc.)
['home', 'booth', 'reveal', 'album'].forEach(s => onScreen(s, () => { if (S) close(false); }));

/* --- drawing --- */
function view() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = canvas.getBoundingClientRect();
  let W = r.width, H = r.height;
  if (!H && S) {
    // On mobile Safari, .adj-stage has height:auto inside a CSS grid cell so getBoundingClientRect()
    // returns 0 height. Derive height from the image's natural aspect ratio scaled to fit the viewport.
    const img = S.photos[S.index].orig;
    W = W || window.innerWidth;
    H = img.naturalWidth && img.naturalHeight
      ? Math.min(Math.round(W * img.naturalHeight / img.naturalWidth), Math.round(window.innerHeight * 0.55))
      : Math.round(W * 0.75);
    canvas.style.height = H + 'px';
  }
  if (!W || !H) return null;
  const tw = Math.round(W * dpr), th = Math.round(H * dpr);
  if (canvas.width !== tw || canvas.height !== th) { canvas.width = tw; canvas.height = th; }
  // the crop window: as large as fits with a margin round it to show what is being cut away
  const m = Math.min(56, W * 0.1), aw = W - 2 * m, ah = H - 2 * m;
  const winH = Math.min(ah, aw / S.aspect), winW = winH * S.aspect;
  return { W, H, dpr, win: { x: (W - winW) / 2, y: (H - winH) / 2, w: winW, h: winH } };
}

function draw() {
  if (!S) return;
  const p = S.photos[S.index], img = p.orig, v = view(), ctx = canvas.getContext('2d');
  if (!v) return;
  const g = cropGeometry(img, S.work[S.index], S.aspect);
  S.work[S.index] = g.crop;
  const k = v.win.h / g.h, pre = preview(img), pf = img.width / pre.width;
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
  ctx.clearRect(0, 0, v.W, v.H);
  ctx.fillStyle = '#1F1A17'; ctx.fillRect(0, 0, v.W, v.H);
  // the whole photo, placed so the crop window shows exactly what the strip will
  ctx.save();
  ctx.translate(v.win.x + v.win.w / 2, v.win.y + v.win.h / 2);
  ctx.scale(k, k);
  ctx.rotate(g.angle);
  ctx.translate(-g.x, -g.y);
  ctx.scale(pf, pf);
  imageFrame(ctx, pre, g.crop);
  ctx.restore();
  // everything outside the window is dimmed
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, v.W, v.H); ctx.rect(v.win.x, v.win.y, v.win.w, v.win.h);
  ctx.fillStyle = 'rgba(28, 6, 10, .62)'; ctx.fill('evenodd');
  ctx.restore();
  // the window's edge: a cream line inside a gold hairline; thirds while something is moving
  ctx.strokeStyle = 'rgba(184, 147, 74, .9)'; ctx.lineWidth = 1;
  ctx.strokeRect(v.win.x - .5, v.win.y - .5, v.win.w + 1, v.win.h + 1);
  ctx.strokeStyle = 'rgba(251, 246, 236, .9)'; ctx.lineWidth = 1.5;
  ctx.strokeRect(v.win.x + .75, v.win.y + .75, v.win.w - 1.5, v.win.h - 1.5);
  if (S.guides) {
    ctx.strokeStyle = 'rgba(251, 246, 236, .55)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const f of [1 / 3, 2 / 3]) {
      ctx.moveTo(v.win.x + v.win.w * f, v.win.y); ctx.lineTo(v.win.x + v.win.w * f, v.win.y + v.win.h);
      ctx.moveTo(v.win.x, v.win.y + v.win.h * f); ctx.lineTo(v.win.x + v.win.w, v.win.y + v.win.h * f);
    }
    ctx.stroke();
  }
  syncControls(g.crop);
}

function syncControls(c) {
  const z = Math.round(c.zoom * 100), a = Math.round(c.angle * 2) / 2;
  if (document.activeElement !== zoomIn) zoomIn.value = z;
  if (document.activeElement !== angleIn) angleIn.value = a;
  $('#adj-zoom-out').textContent = `${z}%`;
  $('#adj-angle-out').textContent = `${a > 0 ? '+' : ''}${a}°`;
  [zoomIn, angleIn].forEach(r => r.style.setProperty('--fill', `${((r.value - r.min) / (r.max - r.min)) * 100}%`));
  const n = S.photos.length;
  $('#adjust-count').textContent = `— Photo ${S.index + 1} of ${n} —`;
  $('#adj-steps').hidden = n < 2;
  $('#adj-prev').disabled = S.index === 0;
  $('#adj-next').disabled = S.index === n - 1;
  canvas.setAttribute('aria-label', `Photo ${S.index + 1}: zoom ${z}%, straightened ${a}°${c.quarter ? `, turned ${c.quarter * 90}°` : ''}${c.flip ? ', flipped' : ''}. Drag or use the arrow keys to move it.`);
}

/* --- editing the current crop --- */
const cur = () => S.work[S.index];
function change(patch) {
  S.work[S.index] = { ...cur(), ...patch };
  draw();
}
// move the photo by a screen distance: the window's centre moves the other way, in the photo's frame
function moveBy(dx, dy) {
  const p = S.photos[S.index], v = view(), g = cropGeometry(p.orig, cur(), S.aspect), k = v.win.h / g.h;
  const c = Math.cos(-g.angle), s = Math.sin(-g.angle);
  const ix = (-dx * c + dy * s) / k, iy = (-dx * s - dy * c) / k;
  change({ cx: cur().cx + ix / g.W, cy: cur().cy + iy / g.H });
}
const zoomTo = z => change({ zoom: Math.min(ZOOM_MAX, Math.max(1, z)) });
function rotate90() {
  const c = cur();
  // a point in the frame turns with it: (x, y) -> (-y, x), measured in the turned frame's own size
  change({ quarter: (c.quarter + 1) % 4, cx: -c.cy, cy: c.cx });
  switchClick();
}
const flip = () => { change({ flip: !cur().flip, cx: -cur().cx }); switchClick(); };
const reset = () => { S.work[S.index] = defaultCrop(); draw(); };

let guideTimer = 0;
function showGuides(on) {
  clearTimeout(guideTimer);
  if (on) { S.guides = true; draw(); }
  else guideTimer = setTimeout(() => { if (S) { S.guides = false; draw(); } }, reducedMotion() ? 0 : 350);
}

/* --- pointer: drag to move, two fingers to pinch, wheel to zoom --- */
canvas.addEventListener('pointerdown', e => {
  if (!S) return;
  canvas.setPointerCapture(e.pointerId);
  S.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (S.pointers.size === 2) {
    const [a, b] = [...S.pointers.values()];
    S.pinch = { d: Math.hypot(b.x - a.x, b.y - a.y) || 1, z: cur().zoom };
  }
  showGuides(true);
});
canvas.addEventListener('pointermove', e => {
  if (!S || !S.pointers.has(e.pointerId)) return;
  const last = S.pointers.get(e.pointerId);
  S.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (S.pointers.size >= 2 && S.pinch) {
    const [a, b] = [...S.pointers.values()];
    zoomTo(S.pinch.z * Math.hypot(b.x - a.x, b.y - a.y) / S.pinch.d);
  } else moveBy(e.clientX - last.x, e.clientY - last.y);
});
const endPointer = e => {
  if (!S) return;
  S.pointers.delete(e.pointerId);
  if (S.pointers.size < 2) S.pinch = null;
  if (!S.pointers.size) showGuides(false);
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', e => {
  if (!S) return;
  e.preventDefault();
  showGuides(true);
  zoomTo(cur().zoom * Math.exp(-e.deltaY * 0.0015));
  showGuides(false);
}, { passive: false });

/* --- controls --- */
// (read the value first: redrawing syncs the sliders back to the crop)
zoomIn.addEventListener('input', () => { const z = zoomIn.value / 100; clearTimeout(guideTimer); S.guides = true; zoomTo(z); });
angleIn.addEventListener('input', () => { const a = Math.max(-ANGLE_MAX, Math.min(ANGLE_MAX, +angleIn.value)); clearTimeout(guideTimer); S.guides = true; change({ angle: a }); });
[zoomIn, angleIn].forEach(r => r.addEventListener('change', () => showGuides(false)));
$('#adj-rotate').addEventListener('click', rotate90);
$('#adj-flip').addEventListener('click', flip);
$('#adj-reset').addEventListener('click', reset);
const step = d => { S.index = Math.max(0, Math.min(S.photos.length - 1, S.index + d)); draw(); };
$('#adj-prev').addEventListener('click', () => step(-1));
$('#adj-next').addEventListener('click', () => step(1));
$('#adj-cancel').addEventListener('click', () => close(false));
$('#adj-apply').addEventListener('click', () => close(true));
dlg.addEventListener('cancel', e => { e.preventDefault(); close(false); });

dlg.addEventListener('keydown', e => {
  if (!S) return;
  const t = e.target, onRange = t.matches && t.matches('input[type="range"]');
  const nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (nudge && !onRange) {
    e.preventDefault();
    const v = view(), d = (e.shiftKey ? 0.1 : 0.02) * v.win.h;
    moveBy(nudge[0] * d, nudge[1] * d);
  } else if ((e.key === '+' || e.key === '=') && !onRange) { e.preventDefault(); zoomTo(cur().zoom + 0.1); }
  else if (e.key === '-' && !onRange) { e.preventDefault(); zoomTo(cur().zoom - 0.1); }
  else if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey) { e.preventDefault(); rotate90(); }
  else if (e.key === 'Enter' && !(t.matches && t.matches('button'))) { e.preventDefault(); close(true); }
});

new ResizeObserver(() => { if (S) draw(); }).observe(canvas);
// redraw after orientation change — canvas may have been resized by the browser
window.addEventListener('orientationchange', () => { requestAnimationFrame(() => { if (S) draw(); }); });

/* --- open / close --- */
function close(applied) {
  if (!S) return;
  const { resolve, work } = S;
  S = null;
  canvas.style.height = '';
  dlg.close();
  resolve({ applied, crops: work });
}

// photos: the strip's photos (each with .orig and .crop); index: the one to start on; aspect: the slot shape.
// Resolves to { applied, crops } once the visitor applies or cancels.
export function openAdjuster({ photos, index = 0, aspect }) {
  if (S) close(false);
  const usable = photos.every(p => p.orig);
  if (!usable) return Promise.resolve({ applied: false, crops: photos.map(p => p.crop) });
  return new Promise(resolve => {
    S = { photos, index, aspect, work: photos.map(p => ({ ...defaultCrop(), ...p.crop })), resolve, guides: false, pointers: new Map(), pinch: null };
    dlg.showModal();
    // Wait for the image to be decoded before drawing; fall back to a load-event path for older browsers.
    // Then defer two frames so the dialog has finished layout (getBoundingClientRect returns 0 synchronously).
    const img = photos[index].orig;
    const ready = typeof img.decode === 'function' ? img.decode().catch(() => {}) : Promise.resolve();
    ready.then(() => requestAnimationFrame(() => requestAnimationFrame(() => {
      draw();
      canvas.focus({ preventScroll: true });
    })));
  });
}
