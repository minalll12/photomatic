/* "Your face here" prints: the only stand-in photos the design ever uses.
   No people, real or drawn. They look like a carnival cut-out board:
   cream photo paper, a dashed oval guide, a typed "POSE 01" label and a
   small stamped arrow, printed slightly faded. */
import { C, FONT, makeCanvas, mulberry32, tracking, pad2 } from './utils.js';
import { IMG, texturesReady } from './textures.js';

export function faceHere(w, h, i = 0) {
  const c = makeCanvas(w, h), x = c.getContext('2d'), u = Math.min(w, h) / 200, rnd = mulberry32(31 + i * 7);
  // cream photo paper with a soft, uneven exposure
  const g = x.createRadialGradient(w * 0.42, h * 0.38, 0, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.65);
  g.addColorStop(0, '#F6EFE2'); g.addColorStop(1, '#E2D6C0');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  // the dashed oval cut-out guide
  const ox = w / 2 + (rnd() - 0.5) * 6 * u, oy = h * 0.46, rx = Math.min(w * 0.22, h * 0.3), ry = rx * 1.28;
  x.save();
  x.strokeStyle = 'rgba(31,26,23,.42)';
  x.lineWidth = Math.max(1, 1.6 * u);
  x.setLineDash([7 * u, 5 * u]);
  x.beginPath(); x.ellipse(ox, oy, rx, ry, 0, 0, Math.PI * 2); x.stroke();
  x.restore();
  // "your face here" inside the oval
  x.fillStyle = 'rgba(31,26,23,.5)';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = FONT.type(Math.max(7, 10 * u));
  tracking(x, 1.5 * u);
  x.fillText('YOUR FACE', ox, oy - 6 * u);
  x.fillText('HERE', ox, oy + 8 * u);
  // the typed label and a small stamped arrow pointing at the oval
  x.textAlign = 'left';
  x.fillStyle = 'rgba(179,32,42,.75)';
  x.font = FONT.type(Math.max(7, 11 * u));
  x.fillText(`POSE ${pad2(i + 1)}`, 10 * u, h - 14 * u);
  x.save();
  x.translate(w - 34 * u, h - 30 * u);
  x.rotate(-0.7 + (rnd() - 0.5) * 0.3);
  x.strokeStyle = 'rgba(179,32,42,.7)';
  x.lineWidth = Math.max(1, 2 * u); x.lineCap = 'round'; x.lineJoin = 'round';
  x.beginPath(); x.moveTo(0, 12 * u); x.lineTo(0, -10 * u); x.moveTo(-6 * u, -4 * u); x.lineTo(0, -11 * u); x.lineTo(6 * u, -4 * u); x.stroke();
  x.restore();
  // a faded, slightly uneven print
  x.fillStyle = 'rgba(244,238,227,.18)'; x.fillRect(0, 0, w, h);
  if (IMG.grain) { x.fillStyle = x.createPattern(IMG.grain, 'repeat'); x.fillRect(0, 0, w, h); }
  return c;
}

// A whole little booth strip of "your face here" frames
export function faceHereStrip(w, h, n = 4) {
  const c = makeCanvas(w, h), x = c.getContext('2d');
  x.fillStyle = '#141110'; x.fillRect(0, 0, w, h);
  const pad = w * 0.08, fw = w - pad * 2, fh = fw * 0.75, gap = pad * 0.8;
  for (let i = 0; i < n; i++) {
    const y = pad + i * (fh + gap);
    x.fillStyle = '#F7F4EE'; x.fillRect(pad - 2, y - 2, fw + 4, fh + 4);
    x.drawImage(faceHere(Math.round(fw * 2), Math.round(fh * 2), i), pad, y, fw, fh);
  }
  // Photomatic's own mark at the foot
  const footY = pad + n * (fh + gap), footH = h - footY;
  if (footH > 24) {
    const k = Math.min(fw / 300, footH / 110);
    x.save();
    x.strokeStyle = 'rgba(184,147,74,.9)'; x.lineWidth = Math.max(0.5, 1.2 * k);
    x.beginPath(); x.moveTo(w / 2 - fw * 0.3, footY + 8 * k); x.lineTo(w / 2 + fw * 0.3, footY + 8 * k); x.stroke();
    x.fillStyle = C.cream; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = FONT.logo(Math.max(7, 38 * k));
    x.fillText('Photomatic', w / 2, footY + 8 * k + Math.min(footH * 0.45, 34 * k));
    x.restore();
  }
  return c;
}

export const placeholdersReady = texturesReady;
