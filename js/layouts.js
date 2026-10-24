/* Where photos sit on a strip. Each layout arranges n 4:3 photos inside a
   region `A` units wide and returns slots (relative to the region) plus the
   region height. Frames then draw around that region. */
import { C, el, range } from './utils.js';

const PHOTO_ASPECT = 3 / 4;   // photo height / width
const GAP = 24;
const TILT_ROOM = 14;
const POLAROID_MAT = { color: '#FAF6EE', t: 16, r: 16, b: 60, l: 16 };

export const LAYOUTS = {
  strip: {
    name: 'Classic Strip',
    supports: n => n >= 1,
    width: () => 600,
    arrange(n, A, gap) {
      const h = A * PHOTO_ASPECT;
      return { slots: range(n).map(i => ({ x: 0, y: i * (h + gap), w: A, h, rot: 0 })), h: n * h + (n - 1) * gap };
    },
  },
  grid: {
    name: '2×2 Grid',
    needs: 'Needs exactly 4 photos',
    supports: n => n === 4,
    width: () => 860,
    arrange(n, A, gap = GAP) {
      const w = (A - gap) / 2, h = w * PHOTO_ASPECT;
      return {
        slots: range(n).map(i => ({ x: (i % 2) * (w + gap), y: Math.floor(i / 2) * (h + gap), w, h, rot: 0 })),
        h: 2 * h + gap,
      };
    },
  },
  film: {
    name: 'Film Row',
    horizontal: true,
    supports: n => n >= 1,
    width: (n, pad, gap = GAP) => pad * 2 + n * 320 + (n - 1) * gap,
    arrange(n, A, gap = GAP) {
      const w = (A - (n - 1) * gap) / n, h = w * PHOTO_ASPECT;
      return { slots: range(n).map(i => ({ x: i * (w + gap), y: 0, w, h, rot: 0 })), h };
    },
  },
  polaroid: {
    name: 'Polaroid Stack',
    supports: n => n >= 1,
    width: () => 600,
    mat: POLAROID_MAT,
    shadow: true,
    arrange(n, A) {
      const m = POLAROID_MAT, cardW = A * 0.8;
      const w = cardW - m.l - m.r, h = w * PHOTO_ASPECT, cardH = h + m.t + m.b;
      const step = cardH * 0.76;           // each polaroid overlaps the one above
      const rots = [-3.5, 3, -2, 3.5];
      return {
        slots: range(n).map(i => ({ x: (i % 2 ? A - cardW : 0) + m.l, y: TILT_ROOM + i * step + m.t, w, h, rot: rots[i % 4] })),
        h: TILT_ROOM * 2 + (n - 1) * step + cardH,
      };
    },
  },
};

export const fitLayout = (id, n) => (LAYOUTS[id] && LAYOUTS[id].supports(n) ? id : 'strip');

// Mini SVG preview built from the real layout maths, so it always matches
function preview(id, n) {
  const lay = LAYOUTS[id];
  const count = lay.supports(n) ? n : 4;
  const pad = 40;
  const A = lay.width(count, pad, 36) - pad * 2;
  const { slots, h } = lay.arrange(count, A, 36);
  const m = lay.mat || { t: 0, r: 0, b: 0, l: 0 };
  const shapes = slots.map(s => {
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    return `<g transform="rotate(${s.rot} ${cx} ${cy})">` +
      (lay.mat ? `<rect x="${s.x - m.l}" y="${s.y - m.t}" width="${s.w + m.l + m.r}" height="${s.h + m.t + m.b}" fill="#fff" stroke="${C.muted}" stroke-width="1" vector-effect="non-scaling-stroke"/>` : '') +
      // each slot is a little "your face here" print: cream with a dashed oval
      `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="#F1E8D6" stroke="${C.muted}" stroke-opacity=".5" stroke-width="1" vector-effect="non-scaling-stroke"/>` +
      `<ellipse cx="${cx}" cy="${cy}" rx="${s.w * 0.16}" ry="${s.h * 0.3}" fill="none" stroke="${C.ink}" stroke-opacity=".45" stroke-width="1.2" stroke-dasharray="3 2.5" vector-effect="non-scaling-stroke"/></g>`;
  }).join('');
  const vw = A + pad * 2, vh = h + pad * 2;
  return `<svg viewBox="${-pad} ${-pad} ${vw} ${vh}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">` +
    `<rect x="${-pad}" y="${-pad}" width="${vw}" height="${vh}" fill="#FBF6EC" stroke="${C.ink}" stroke-width="1.25" vector-effect="non-scaling-stroke"/>${shapes}</svg>`;
}

// Radio group of layout cards (used before shooting and in the editor)
export function createLayoutPicker(root, name, onPick) {
  const items = Object.entries(LAYOUTS).map(([id, lay]) => {
    const input = el('input', { attrs: { type: 'radio', name, value: id } });
    const thumb = el('span', { className: 'layout-thumb' });
    const note = el('span', { className: 'visually-hidden' });
    const label = el('label', { className: 'layout-opt' }, [
      input, el('span', { className: 'layout-card' }, [thumb, el('span', { className: 'layout-name', text: lay.name }), note]),
    ]);
    input.addEventListener('change', () => { if (input.checked) onPick(id); });
    root.append(label);
    return { id, lay, input, thumb, label, note };
  });
  let lastN = null;
  return {
    update(n, current) {
      items.forEach(({ id, lay, input, thumb, label, note }) => {
        const ok = lay.supports(n);
        input.disabled = !ok;
        input.checked = id === current;
        label.classList.toggle('is-disabled', !ok);
        if (ok) delete label.dataset.tip; else label.dataset.tip = lay.needs;
        note.textContent = ok ? '' : ` (${lay.needs.toLowerCase()})`;
        if (n !== lastN) thumb.innerHTML = preview(id, n);
      });
      lastN = n;
    },
  };
}
