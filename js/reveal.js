/* Final reveal on the dark oxblood table, under a warm spotlight.
   The strip feeds down through a cream printer slot in short mechanical
   steps, drops onto a handwritten letter, settles, is pinned, and a small
   polaroid slides out from behind it. The same timeline is drawn on screen
   and into the 1080×1920 video, so they always match. */
import { C, $, el, clamp, lerp, rrect, reducedMotion, mulberry32, dateTypewriter } from './utils.js';
import { state } from './state.js';
import { show, onScreen, toast } from './ui.js';
import { click, whirr, chime } from './sound.js';
import { exportStrip } from './export.js';
import { IMG, drawSafetyPin, drawWaxSeal, grainOver } from './textures.js';
import { drawFilteredPhoto } from './filters.js';

const STEPS = 6, START = 0.5, MOVE = 0.42, PAUSE = 0.14;
const FEED_END = START + STEPS * (MOVE + PAUSE);
const DROP = 0.6, SETTLE = 0.35, PIN = 0.45, POLA = 0.45, SLOT_OUT = 0.4;
const PIN_START = FEED_END + DROP + SETTLE;
const POLA_START = PIN_START + PIN;
export const REVEAL_END = POLA_START + POLA + 0.1;

const easeOut = t => 1 - Math.pow(1 - t, 3);
function bounce(t) {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}

// How much of the strip has fed out (0..1) at time t
function fedAt(t) {
  if (t <= START) return 0;
  const k = Math.min(STEPS, Math.floor((t - START) / (MOVE + PAUSE)));
  if (k >= STEPS) return 1;
  const local = (t - START - k * (MOVE + PAUSE)) / MOVE;
  return (k + easeOut(clamp(local, 0, 1))) / STEPS;
}

/* --- the dark table (drawn for the video; on screen it's CSS) --- */
function table(ctx, W, H) {
  ctx.fillStyle = C.oxblood; ctx.fillRect(0, 0, W, H);
  if (IMG.velvet) { ctx.fillStyle = ctx.createPattern(IMG.velvet, 'repeat'); ctx.fillRect(0, 0, W, H); }
  const glow = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, H * 0.6);
  glow.addColorStop(0, 'rgba(235,217,160,.18)'); glow.addColorStop(1, 'rgba(235,217,160,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  const v = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.25, W / 2, H * 0.45, H * 0.85);
  v.addColorStop(0, 'rgba(14,2,4,0)'); v.addColorStop(1, 'rgba(14,2,4,.55)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}

// The letter the strip lands on: deckled (torn) edges, handwriting on both sides
function deckledLetter(ctx, x, y, w, h, u) {
  const rnd = mulberry32(19);
  const step = 12 * u, pts = [];
  for (let px = x; px < x + w; px += step) pts.push([px, y + rnd() * 3 * u]);
  for (let py = y; py < y + h; py += step) pts.push([x + w - rnd() * 3 * u, py]);
  for (let px = x + w; px > x; px -= step) pts.push([px, y + h - rnd() * 3 * u]);
  for (let py = y + h; py > y; py -= step) pts.push([x + rnd() * 3 * u, py]);
  const path = new Path2D();
  pts.forEach(([px, py], i) => (i ? path.lineTo(px, py) : path.moveTo(px, py)));
  path.closePath();
  ctx.save();
  ctx.shadowColor = 'rgba(14,2,4,.32)'; ctx.shadowBlur = 22 * u; ctx.shadowOffsetX = 6 * u; ctx.shadowOffsetY = 12 * u;
  ctx.fillStyle = '#F2EADB';
  ctx.fill(path);
  ctx.restore();
  ctx.save();
  ctx.clip(path);
  const L = IMG.letter;
  if (L) {
    const s = (w * 0.62) / L.width;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(L, x - 4 * u, y + 4 * u, L.width * s, L.height * s);
    ctx.drawImage(L, x + w * 0.5, y + h * 0.34, L.width * s, L.height * s);
  }
  ctx.globalAlpha = 1;
  grainOver(ctx, x, y, w, h, 0.6);
  ctx.restore();
}

const TURN = 0.035;              // the letter sits a couple of degrees off square
// the unit a width-held spread is drawn at; 330 is set so a strip that fills its box keeps the
// weight of furniture it already has, and the two regimes meet without a step
const wideUnit = (sw, sh) => Math.sqrt(sw * sh) / 330;

// Where the strip rests, in canvas units (shared with the action column layout)
function geometry(W, H, strip, align, fit = false) {
  let u = Math.min(W, (H * 9) / 16) / 400;
  const aspect = strip.width / strip.height;
  const maxW = W * (aspect > 1 ? 0.78 : 0.46);
  let slotY = Math.max(16 * u, H * 0.03), slitY = slotY + 17 * u, drop = 30 * u;
  let sh = H - slitY - drop - 70 * u, sw = sh * aspect;
  if (sw > maxW) {
    sw = maxW; sh = sw / aspect;
    /* Held by the width, so the box's height no longer says how big the drawing is: left as it was,
       `u` would shrink the slot, the letter's margin and the wax seal to specks on a short stage.
       Take the measure from the strip instead. Only the fitted (phone) path asks for this. */
    if (fit) {
      u = wideUnit(sw, sh);
      slotY = Math.max(16 * u, H * 0.03); slitY = slotY + 17 * u; drop = 30 * u;
    }
  }
  const restTop = slitY + drop;
  const pw = Math.min(W * 0.92, sw + (aspect > 1 ? 70 : 150) * u), ph = sh + 64 * u;
  const cx = align === 'end' ? Math.max(W / 2, W - pw / 2 - 40 * u) : W / 2;
  return { u, slotY, slitY, drop, sw, sh, cx, restTop, pw, ph, aspect, wide: sw >= maxW - 0.01 };
}

// `table: false` leaves the background transparent so the CSS table shows through on screen.
// `align: 'end'` pushes the spread toward the actions column (desktop screen only).
export function drawReveal(ctx, W, H, t, strip, { table: bg = true, align = 'center', fit = false, hold = false } = {}) {
  const g = geometry(W, H, strip, align, fit);
  const { u, slotY, slitY, drop, sw, sh, cx, restTop, pw, ph } = g;
  ctx.clearRect(0, 0, W, H);
  if (bg) table(ctx, W, H);

  // the letter, slightly larger than the strip, turned the other way (~2°)
  ctx.save();
  ctx.translate(cx + 4 * u, restTop + sh / 2 + 10 * u);
  ctx.rotate(0.035);
  deckledLetter(ctx, -pw / 2, -ph / 2, pw, ph, u);
  drawWaxSeal(ctx, pw / 2 - 22 * u, ph / 2 - 24 * u, 54 * u, 0.3);
  ctx.restore();

  // the polaroid slides out from behind the strip once it's pinned
  const pp = clamp((t - POLA_START) / POLA, 0, 1);
  const photo = state.design.photos[state.output.polaroid % Math.max(1, state.design.photos.length)];
  if (pp > 0 && photo) {
    const e = easeOut(pp), pw2 = Math.min(150 * u, sw * 0.9), ph2 = pw2 * 1.2;
    const turn = 0.05 + e * 0.12;
    /* It peeks out from behind the strip, which is a fraction of the strip's own width — on a wide
       strip that lands it past the edge of the canvas, cut in half. Hold it inside instead, so it
       tucks further behind rather than being clipped. */
    let px = cx + sw * 0.22 + e * sw * 0.42;
    /* `hold` is the recorded video, whose frame is fixed at 9:16 and cannot be re-fitted the way the
       stage is, so there the card is held in whenever it would leave the frame, whatever the layout:
       a tall strip and a stack are clamped to the same width and put the card in the same place, so
       no rule drawn from the geometry could treat them differently anyway. */
    if ((fit && g.wide) || hold) {
      // its own shadow reaches past the card (offset 4u, blur 14u), so leave that too
      const reach = (pw2 * Math.cos(turn) + ph2 * Math.sin(turn)) / 2 + 18 * u;
      px = Math.min(px, W - reach);
    }
    ctx.save();
    ctx.translate(px, restTop + sh * 0.3 + e * 10 * u);
    ctx.rotate(turn);
    ctx.shadowColor = 'rgba(14,2,4,.35)'; ctx.shadowBlur = 14 * u; ctx.shadowOffsetX = 4 * u; ctx.shadowOffsetY = 8 * u;
    ctx.fillStyle = '#FBFAF6'; ctx.fillRect(-pw2 / 2, -ph2 / 2, pw2, ph2);
    ctx.shadowColor = 'transparent';
    const m = pw2 * 0.08, iw = pw2 - m * 2, ih = iw * 0.75;
    ctx.save(); ctx.beginPath(); ctx.rect(-iw / 2, -ph2 / 2 + m, iw, ih); ctx.clip();
    drawFilteredPhoto(ctx, photo, state.design.filter, state.design.intensity, -iw / 2, -ph2 / 2 + m, iw, ih);
    ctx.restore();
    ctx.restore();
  }

  // printer slot: lifts and fades away once the strip is pinned
  const slotAlpha = 1 - clamp((t - PIN_START - PIN) / SLOT_OUT, 0, 1);
  if (slotAlpha > 0) {
    const plate = sw + 64 * u, lift = (1 - slotAlpha) * 20 * u;
    ctx.save();
    ctx.globalAlpha = slotAlpha;
    ctx.save();
    ctx.shadowColor = 'rgba(14,2,4,.4)'; ctx.shadowBlur = 18 * u; ctx.shadowOffsetX = 3 * u; ctx.shadowOffsetY = 6 * u;
    rrect(ctx, cx - plate / 2, slotY - lift, plate, 34 * u, 17 * u);
    const grad = ctx.createLinearGradient(0, slotY - lift, 0, slotY - lift + 34 * u);
    grad.addColorStop(0, '#FBF6EC'); grad.addColorStop(1, '#DCD0BC');
    ctx.fillStyle = grad; ctx.fill();
    ctx.restore();
    rrect(ctx, cx - sw / 2 - 9 * u, slitY - 3.5 * u - lift, sw + 18 * u, 7 * u, 3.5 * u);
    ctx.fillStyle = '#120A08'; ctx.fill();
    ctx.restore();
  }

  // the strip
  const fed = fedAt(t);
  if (fed <= 0) return;
  const q = clamp((t - FEED_END) / DROP, 0, 1);
  const settle = clamp((t - FEED_END - DROP) / SETTLE, 0, 1);
  let top = slitY - sh + fed * sh, rot;
  if (q <= 0) rot = Math.sin(t * 3.2) * 0.012 * fed;
  else {
    top = slitY + drop * bounce(q);
    rot = lerp(Math.sin(FEED_END * 3.2) * 0.012, -0.03, easeOut(q)) + Math.sin(settle * Math.PI * 2) * 0.006 * (1 - settle);
  }
  ctx.save();
  if (q <= 0) { ctx.beginPath(); ctx.rect(0, slitY, W, H); ctx.clip(); }
  ctx.translate(cx, q <= 0 ? slitY : top);
  ctx.rotate(rot);
  ctx.shadowColor = 'rgba(14,2,4,.38)';
  ctx.shadowBlur = (6 + 16 * fed + 6 * q) * u;
  ctx.shadowOffsetX = (2 + 3 * fed) * u;
  ctx.shadowOffsetY = (3 + 7 * fed + 4 * q) * u;
  ctx.drawImage(strip, -sw / 2, q <= 0 ? top - slitY : 0, sw, sh);
  ctx.restore();

  // the gold safety pin clicks in once it has settled
  const p = clamp((t - PIN_START) / PIN, 0, 1);
  if (p > 0) {
    const e = easeOut(p), len = clamp(sw * 0.62, 90 * u, 170 * u);
    ctx.save();
    ctx.globalAlpha = Math.min(1, p * 2.5);
    ctx.translate(cx - sw * 0.12 + (1 - e) * 60 * u, restTop + 12 * u - (1 - e) * 90 * u);
    ctx.scale(1.25 - 0.25 * e, 1.25 - 0.25 * e);
    drawSafetyPin(ctx, 0, 0, len, -0.32 - (1 - e) * 0.5);
    ctx.restore();
  }
}

/* --- paper confetti: falls once when the strip lands, fades out within ~2.5s and is removed --- */
const CONFETTI = [C.cream, C.butter, C.dusty, C.cherry, C.sage];
let confettiRun = 0;
function confetti() {
  const box = $('#confetti'), run = ++confettiRun;
  box.replaceChildren();
  if (reducedMotion()) return;
  const r = box.getBoundingClientRect(), rnd = mulberry32(Math.floor(performance.now()) % 997);
  const lo = innerWidth > 960 ? 0.4 : 0.14, span = innerWidth > 960 ? 0.56 : 0.72;
  const falls = [];
  for (let i = 0; i < 18; i++) {
    const w = 5 + rnd() * 6, h = rnd() > 0.5 ? w : w * 1.6;
    const piece = el('i', { style: { width: `${w.toFixed(1)}px`, height: `${h.toFixed(1)}px`, background: CONFETTI[i % CONFETTI.length], 'border-radius': rnd() > 0.7 ? '50%' : '1px' } });
    box.append(piece);
    const x0 = r.width * (lo + rnd() * span), x1 = r.width * (lo + rnd() * span), y1 = r.height * (0.5 + rnd() * 0.36);
    const spin = (rnd() - 0.5) * 720;
    falls.push(piece.animate([
      { transform: `translate(${x0}px, ${-20 - rnd() * 40}px) rotate(0deg)`, opacity: 0 },
      { transform: `translate(${(x0 + x1) / 2}px, ${y1 * 0.5}px) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.3 },
      { transform: `translate(${x1}px, ${y1}px) rotate(${spin}deg)`, opacity: 1, offset: 0.65 },
      { transform: `translate(${x1}px, ${y1 + 6}px) rotate(${spin}deg)`, opacity: 0 },
    ], { duration: 2000 + rnd() * 200, delay: rnd() * 250, easing: 'cubic-bezier(.25,.6,.4,1)', fill: 'both' }).finished);
  }
  // nothing stays on the strip: once every piece has faded, the confetti leaves the page
  const clear = () => { if (run === confettiRun) box.replaceChildren(); };
  Promise.all(falls).then(clear, clear);
  setTimeout(clear, 2700);
}

/* =========================================================
   On-screen playback (stops when it ends: nothing runs while idle)
   ========================================================= */
const canvas = $('#reveal-canvas');
const stage = $('#reveal-stage');
const actions = $('#reveal-actions');
let raf = 0, t0 = 0, lastStep = -1, pinned = false, landed = false, confettiDone = false;
const alignment = () => (window.innerWidth > 960 ? 'end' : 'center');
const fitted = () => window.matchMedia('(max-width: 600px)').matches;

const GAP_TO_LABEL = 32;         // paper to the "Developed" label, per the design
const SHADOW = 14;               // room left under the letter for its drop shadow, in units of u

/* On a phone the stage is only as tall as the spread needs. A strip that fills its box (the classic
   vertical one) already does that and is left exactly as it was; a strip held by the width instead
   — a film row, a 2x2 grid, a stack — used to keep the tall stage and leave a long empty drop above
   the label. The room the shadow needs comes back off the row gap, so the distance from the paper
   to the label reads the same whichever way the stage was sized. */
function fitStage() {
  const reveal = stage.parentElement;
  stage.style.removeProperty('--stage-h');
  reveal.style.removeProperty('--reveal-gap');
  const strip = state.output.canvas;
  if (!fitted() || !strip) return;
  const r = canvas.getBoundingClientRect();
  if (!geometry(r.width, r.height, strip, 'center', true).wide) return;

  const W = r.width, aspect = strip.width / strip.height;
  const sw = W * (aspect > 1 ? 0.78 : 0.46), sh = sw / aspect;
  const u = wideUnit(sw, sh);
  const pw = Math.min(W * 0.92, sw + (aspect > 1 ? 70 : 150) * u);
  // the slot's inset is itself a share of the height, so let it settle
  let H = sh * 2;
  for (let i = 0; i < 4; i++) {
    H = Math.max(16 * u, H * 0.03) + sh + 89 * u + (pw / 2) * Math.sin(TURN) + SHADOW * u;
  }
  stage.style.setProperty('--stage-h', `${Math.round(H)}px`);
  reveal.style.setProperty('--reveal-gap', `${Math.max(0, Math.round(GAP_TO_LABEL - SHADOW * u))}px`);
}

function size() {
  const r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return { W: r.width, H: r.height, dpr };
}

// the warm spotlight sits on the strip's centre; beside it (desktop), the action column is centred
// on the strip: its own height measured, so a taller or shorter column stays centred
function alignActions(W, H) {
  const g = geometry(W, H, state.output.canvas, alignment(), fitted());
  const mid = g.restTop + g.sh / 2;
  stage.style.setProperty('--spot-x', `${Math.round(g.cx)}px`);
  stage.style.setProperty('--spot-y', `${Math.round(mid)}px`);
  const beside = alignment() === 'end';
  actions.style.setProperty('--strip-top', beside ? `${Math.round(Math.max(0, mid - actions.offsetHeight / 2))}px` : '0px');
}

function drawAt(t) {
  const { W, H, dpr } = size();
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawReveal(ctx, W, H, t, state.output.canvas, { table: false, align: alignment(), fit: fitted() });
}

function frame(now) {
  if (!state.output.canvas || state.screen !== 'reveal') return;
  const t = (now - t0) / 1000;
  drawAt(Math.min(t, REVEAL_END));

  // mechanism sounds, in step with the feed
  const step = t < START ? -1 : Math.floor((t - START) / (MOVE + PAUSE));
  if (step !== lastStep && step >= 0 && step < STEPS) { click(); whirr(MOVE); }
  if (lastStep < STEPS && step >= STEPS) setTimeout(click, DROP * 600);
  lastStep = step;
  if (!pinned && t >= PIN_START + PIN * 0.8) { pinned = true; click(); }
  if (!landed && t >= FEED_END + DROP * 0.6) { landed = true; if (!confettiDone) { confettiDone = true; confetti(); } }

  if (t >= REVEAL_END) { done(); return; }
  raf = requestAnimationFrame(frame);
}

function done() {
  const { W, H } = size();
  alignActions(W, H);
  actions.classList.add('is-done');
  if (!done.played) { chime(); done.played = true; }
  $('#btn-download').focus({ preventScroll: true });
}

export function play() {
  cancelAnimationFrame(raf);
  actions.classList.remove('is-done');
  done.played = false;
  lastStep = -1;
  pinned = reducedMotion();
  landed = false;
  const { W, H } = size();
  alignActions(W, H);
  t0 = performance.now() - (reducedMotion() ? REVEAL_END * 1000 : 0);
  raf = requestAnimationFrame(frame);
}

// choose which photo goes on the little polaroid
export function swapPolaroid() {
  state.output.polaroid = (state.output.polaroid + 1) % Math.max(1, state.design.photos.length);
  if (actions.classList.contains('is-done')) drawAt(REVEAL_END);
}

export async function openReveal() {
  try {
    await exportStrip();
  } catch {
    toast('Something went wrong printing your strip. Please try again.');
    return;
  }
  const btn = $('#btn-album-save');
  btn.disabled = false;
  btn.querySelector('.btn-label').textContent = 'Save to album';
  const n = state.design.photos.length;
  $('#dev-label').textContent = `Developed · ${dateTypewriter(state.design.shotDate)} · ${n} frame${n === 1 ? '' : 's'}`;
  confettiDone = false;
  $('#confetti').replaceChildren();
  await show('reveal', { via: 'desk' });
  play();
}
// the screen is uncovered complete: the letter and the slot are drawn and the actions placed in the
// swap; only the strip itself (printing, landing, the pin) moves afterwards
onScreen('reveal', () => {
  if (!state.output.canvas) return;
  fitStage();
  const { W, H } = size();
  alignActions(W, H);
  drawAt(0);
});

// redraw the settled frame at the new size
new ResizeObserver(() => {
  if (state.screen !== 'reveal' || !state.output.canvas) return;
  fitStage();
  const { W, H } = size();
  alignActions(W, H);
  if (actions.classList.contains('is-done')) drawAt(REVEAL_END);
}).observe(canvas);
