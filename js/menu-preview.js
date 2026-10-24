/* The booth menu's live preview: the strip the visitor is about to make, drawn with the real
   renderer on the default Midnight frame with "your face here" prints. It crossfades (~250ms)
   whenever the photo count or layout changes, and shows the timer as a small stamp. */
import { C, fontsReady } from './utils.js';
import { state } from './state.js';
import { LAYOUTS } from './layouts.js';
import { computeLayout, render } from './render.js';
import { texturesReady } from './textures.js';
import { faceHere } from './placeholders.js';

const SHORT = { strip: 'classic', grid: '2×2 grid', film: 'film row', polaroid: 'polaroid stack' };
// the four "your face here" prints, drawn the first time the menu is shown (not on page load)
let photos = null;
const prints = () => photos || (photos = [0, 1, 2, 3].map(i => ({ src: faceHere(720, 540, i), seed: i + 1 })));
// the booth waits for this before its transition starts, so the first drawing is never late
export const previewReady = Promise.all([fontsReady, texturesReady]);
const ready = previewReady;
let shown = null, last = '';

// a throwaway design with the menu's choices; the renderer reads state.design, so it is swapped in
// for the length of one synchronous draw and put straight back
function draw(canvas, box, shots, layout) {
  const design = {
    photos: prints().slice(0, shots), layout, frame: 'booth', variants: {}, double: false, filmPaper: false,
    to: '', from: '', filter: 'natural', intensity: 0, brightness: 0,
    bg: { color: C.cream, pattern: 'solid' }, date: { show: true, style: 'typewriter', text: '' },
    caption: '', dedication: '', stickers: [], shotDate: new Date(),
  };
  const real = state.design;
  state.design = design;
  try {
    const L = computeLayout(design);
    const fit = Math.min(box.w / L.W, box.h / L.H), dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(L.W * fit * dpr); canvas.height = Math.round(L.H * fit * dpr);
    canvas.style.width = `${Math.round(L.W * fit)}px`; canvas.style.height = `${Math.round(L.H * fit)}px`;
    render(canvas.getContext('2d'), fit * dpr, { L, quality: 'screen' });
  } finally {
    state.design = real;
  }
}

// `instant`: the menu has just appeared, so the strip is simply there (no crossfade, no growing mount)
export async function updatePreview({ instant = false } = {}) {
  const root = document.querySelector('#menu-preview');
  if (!root) return;
  const stage = root.querySelector('.preview-stage');
  if (instant) { stage.classList.add('is-instant'); last = ''; }
  const { shots, timer, layout } = state.settings;
  const name = SHORT[layout] || LAYOUTS[layout].name.toLowerCase();
  document.querySelector('#coin-plate').textContent = `your strip · ${shots} photos · ${name}`;
  root.querySelector('.preview-timer').textContent = `${timer}s`;
  const key = `${shots}|${layout}|${Math.round(root.clientWidth)}`;
  if (key === last) return;
  last = key;
  await ready;
  const box = { w: stage.clientWidth - 28, h: stage.clientHeight - 28 };
  if (!box.w || !box.h) { last = ''; return; }
  const [a, b] = stage.querySelectorAll('canvas');
  const next = shown === a ? b : a;
  draw(next, box, shots, layout);
  // the cream mount is the strip plus a 10px margin; the timer stamp sits on the mount's top-right corner
  const w = parseFloat(next.style.width), h = parseFloat(next.style.height), stamp = root.querySelector('.preview-timer');
  stage.style.setProperty('--mount-w', `${Math.round(w + 20)}px`);
  stage.style.setProperty('--mount-h', `${Math.round(h + 20)}px`);
  stamp.style.setProperty('--stamp-x', `${Math.round(w / 2 + 10 - stamp.offsetWidth / 2 - 4)}px`);
  stamp.style.setProperty('--stamp-y', `${Math.round((stage.clientHeight - h) / 2 - 10 - stamp.offsetHeight / 2 + 4)}px`);
  // crossfade: the new strip fades in on top while the old one stays solid underneath, so the
  // mount never shows through; the old one is hidden once the fade is done
  const prev = shown;
  next.style.zIndex = '2'; if (prev) prev.style.zIndex = '1';
  next.classList.add('is-shown');
  if (instant && prev) { prev.classList.remove('is-shown'); }
  else if (prev) setTimeout(() => { if (shown !== prev) { prev.style.transition = 'none'; prev.classList.remove('is-shown'); prev.getBoundingClientRect(); prev.style.transition = ''; } }, 260);
  shown = next;
  // later changes (photo count, layout) crossfade again
  if (instant) { stage.getBoundingClientRect(); requestAnimationFrame(() => requestAnimationFrame(() => stage.classList.remove('is-instant'))); }
}
