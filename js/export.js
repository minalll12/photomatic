/* Exports: strip PNG, sharing/downloading, and the reveal video. */
import { el, makeCanvas, canvasToBlob, fileStamp, fontsReady, isCoarse } from './utils.js';
import { state } from './state.js';
import { computeLayout, render } from './render.js';
import { ensureArt } from './stickers.js';

const EXPORT_SCALE = 2;

// Same renderer as the editor, at 2x, export-quality sticker art, no handles
export async function exportStrip() {
  await Promise.all([fontsReady, ensureArt(state.design.stickers)]);
  const L = computeLayout();
  const canvas = makeCanvas(L.W * EXPORT_SCALE, L.H * EXPORT_SCALE);
  render(canvas.getContext('2d'), EXPORT_SCALE, { quality: 'export', L });
  state.output.canvas = canvas;
  state.output.blob = await canvasToBlob(canvas);
  return state.output;
}

export const fileName = (kind = '', ext = 'png', d = new Date()) => `photomatic-${kind ? `${kind}-` : ''}${fileStamp(d)}.${ext}`;

// On phones the share sheet saves to the camera roll; elsewhere, a normal download
export async function deliver(blob, name, title = 'My Photomatic strip') {
  const file = new File([blob], name, { type: blob.type });
  if (isCoarse() && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = el('a', { attrs: { href: url, download: name } });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}

const VIDEO_TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

export function videoSupport() {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
  return VIDEO_TYPES.find(t => MediaRecorder.isTypeSupported(t)) || null;
}

// Record `draw(ctx, t)` on a W×H canvas for `seconds`. Resolves to { blob, ext }.
export function recordCanvas(W, H, seconds, draw, onProgress = () => {}) {
  const type = videoSupport();
  if (!type) return Promise.reject(new Error('unsupported'));
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  draw(ctx, 0);
  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 });
  const chunks = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  return new Promise((resolve, reject) => {
    rec.onerror = e => reject(e.error || new Error('recording failed'));
    rec.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const blobType = type.split(';')[0];
      resolve({ blob: new Blob(chunks, { type: blobType }), ext: blobType === 'video/mp4' ? 'mp4' : 'webm' });
    };
    rec.start(250);
    const start = performance.now();
    const tick = now => {
      const t = (now - start) / 1000;
      draw(ctx, Math.min(t, seconds));
      onProgress(Math.min(1, t / seconds));
      if (t < seconds) requestAnimationFrame(tick);
      else rec.stop();
    };
    requestAnimationFrame(tick);
  });
}
