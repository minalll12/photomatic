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
const photos = [0, 1, 2, 3].map(i => ({ src: faceHere(720, 540, i), seed: i + 1 }));
const ready = Promise.all([fontsReady, texturesReady]);
let shown = null, last = '';

// a throwaway design with the menu's choices; the renderer reads state.design, so it is swapped in
// for the length of one synchronous draw and put straight back
function draw(canvas, box, shots, layout) {
  const design = {
    photos: photos.slice(0, shots), layout, frame: 'booth', variants: {}, double: false, filmPaper: false,
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

export async function updatePreview() {
  const root = document.querySelector('#menu-preview');
  if (!root) return;
  const { shots, timer, layout } = state.settings;
  const name = SHORT[layout] || LAYOUTS[layout].name.toLowerCase();
  document.querySelector('#coin-plate').textContent = `your strip · ${shots} photos · ${name}`;
  root.querySelector('.preview-timer').textContent = `${timer}s`;
  const key = `${shots}|${layout}|${Math.round(root.clientWidth)}`;
  if (key === last) return;
  last = key;
  await ready;
  const stage = root.querySelector('.preview-stage');
  const box = { w: stage.clientWidth, h: stage.clientHeight };
  if (!box.w || !box.h) { last = ''; return; }
  const [a, b] = stage.querySelectorAll('canvas');
  const next = shown === a ? b : a;
  draw(next, box, shots, layout);
  // the timer stamp sits on the strip's top-right corner, overlapping it a little
  const w = parseFloat(next.style.width), h = parseFloat(next.style.height), stamp = root.querySelector('.preview-timer');
  stamp.style.setProperty('--stamp-x', `${Math.round(w / 2 - stamp.offsetWidth / 2 - 6)}px`);
  stamp.style.setProperty('--stamp-y', `${Math.round((box.h - h) / 2 - stamp.offsetHeight / 2 + 4)}px`);
  next.classList.add('is-shown');
  if (shown) shown.classList.remove('is-shown');
  shown = next;
}
