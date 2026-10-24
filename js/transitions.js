/* Page transitions: every screen change feels like turning a scrapbook page.
   All of them run on the Web Animations API (transform + opacity only),
   can be interrupted by the next one, and collapse to a short fade when
   the visitor prefers reduced motion.

   kinds: fade · zoom (landing -> booth) · curtain · film (developing -> editor)
          · desk (editor -> reveal) · tin (album)
   Motion tokens: 150 / 300 / 600 / 900 ms, one ease-out and one spring. */
import { $, el, reducedMotion } from './utils.js';
import { swish } from './sound.js';

let current = null;

export async function play(kind, swap, nextScreen) {
  if (current) current.skip();
  const run = {
    skipped: false,
    anims: new Set(),
    skip() {
      this.skipped = true;
      this.anims.forEach(a => { try { a.finish(); } catch { a.cancel(); } });
    },
  };
  current = run;
  const layer = el('div', { className: 'tx-layer' });
  document.body.append(layer);
  const screenAnims = [];
  let swapped = false;
  const doSwap = () => { if (!swapped) { swapped = true; swap(); } };

  // Animate and resolve when done; finished instantly once skipped
  const animate = (node, keyframes, opts, onScreen = false) => {
    const a = node.animate(keyframes, { fill: 'forwards', easing: 'cubic-bezier(.22,.8,.24,1)', ...opts });
    run.anims.add(a);
    if (onScreen) screenAnims.push(a);
    if (run.skipped) { try { a.finish(); } catch { a.cancel(); } }
    return a.finished.catch(() => {}).finally(() => run.anims.delete(a));
  };
  const ctx = { layer, animate, swap: doSwap, run, next: nextScreen, prev: visibleScreen() };

  const onKey = e => { if (e.key === 'Escape' && layer.classList.contains('is-skippable')) { e.preventDefault(); e.stopPropagation(); run.skip(); } };
  // a hidden tab renders no frames, so animations would never finish: jump to the end
  const onHidden = () => { if (document.hidden) run.skip(); };
  const guard = setTimeout(() => run.skip(), 4000);
  layer.addEventListener('pointerdown', () => { if (layer.classList.contains('is-skippable')) run.skip(); });
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('visibilitychange', onHidden);
  if (document.hidden) run.skip();
  try {
    const k = reducedMotion() ? (kind === 'zoom' || kind === 'curtain' ? 'curtainFade' : 'crossfade') : kind;
    await (KINDS[k] || KINDS.fade)(ctx);
  } finally {
    doSwap();
    screenAnims.forEach(a => a.cancel());   // never leave inline effects on screens
    clearTimeout(guard);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('visibilitychange', onHidden);
    layer.remove();
    if (current === run) current = null;
  }
}

const visibleScreen = () => document.querySelector('main > .screen:not([hidden])');
const delay = (ctx, ms) => ctx.animate(ctx.layer, [{ opacity: 1 }, { opacity: 1 }], { duration: ms });

// incoming screen settles in like a page laid on the table
const settleIn = (ctx, ms = 320, y = 10) =>
  ctx.next && ctx.animate(ctx.next, [{ opacity: 0, transform: `translateY(${y}px)` }, { opacity: 1, transform: 'none' }], { duration: ms }, true);

/* =========================================================
   Overlays
   ========================================================= */
function curtainHalves(layer) {
  const l = el('div', { className: 'tx-curtain-half l' }), r = el('div', { className: 'tx-curtain-half r' });
  layer.append(l, r);
  return [l, r];
}
async function closeCurtain(ctx, [l, r], ms = 380) {
  swish(ms / 1000);
  await Promise.all([
    ctx.animate(l, [{ transform: 'translateX(-102%) rotate(0deg)' }, { transform: 'translateX(0) rotate(1.2deg)', offset: 0.75 }, { transform: 'translateX(0) rotate(0deg)' }], { duration: ms, easing: 'cubic-bezier(.5,0,.3,1)' }),
    ctx.animate(r, [{ transform: 'translateX(102%) rotate(0deg)' }, { transform: 'translateX(0) rotate(-1.2deg)', offset: 0.75 }, { transform: 'translateX(0) rotate(0deg)' }], { duration: ms, easing: 'cubic-bezier(.5,0,.3,1)' }),
  ]);
}
async function openCurtain(ctx, [l, r], ms = 440) {
  swish(ms / 1000);
  await Promise.all([
    ctx.animate(l, [{ transform: 'translateX(0) rotate(0deg)' }, { transform: 'translateX(-104%) rotate(-2deg)' }], { duration: ms, easing: 'cubic-bezier(.6,0,.2,1)' }),
    ctx.animate(r, [{ transform: 'translateX(0) rotate(0deg)' }, { transform: 'translateX(104%) rotate(2deg)' }], { duration: ms, easing: 'cubic-bezier(.6,0,.2,1)' }),
  ]);
}

export const EASE_OUT = 'cubic-bezier(.22,.8,.24,1)';
export const SPRING = 'cubic-bezier(.34,1.56,.64,1)';

/* =========================================================
   Kinds
   ========================================================= */
const KINDS = {
  async fade(ctx) {
    if (ctx.prev) await ctx.animate(ctx.prev, [{ opacity: 1 }, { opacity: 0, transform: 'translateY(-6px)' }], { duration: 160, easing: 'ease-in' }, true);
    ctx.swap();
    await settleIn(ctx);
  },

  async crossfade(ctx) {
    const f = el('div', { className: 'tx-fade' });
    ctx.layer.append(f);
    await ctx.animate(f, [{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: 'linear' });
    ctx.swap();
    await ctx.animate(f, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'linear' });
  },

  async curtainFade(ctx) {
    const halves = curtainHalves(ctx.layer);
    halves.forEach(h => { h.style.transform = 'none'; });
    await Promise.all(halves.map(h => ctx.animate(h, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'linear' })));
    ctx.swap();
    await Promise.all(halves.map(h => ctx.animate(h, [{ opacity: 1 }, { opacity: 0 }], { duration: 280, easing: 'linear' })));
  },

  async curtain(ctx) {
    const halves = curtainHalves(ctx.layer);
    halves.forEach((h, i) => { h.style.transform = `translateX(${i ? 102 : -102}%)`; });
    await closeCurtain(ctx, halves);
    ctx.swap();
    await delay(ctx, 80);
    await openCurtain(ctx, halves);
  },

  // zoom into the booth until the velvet fills the screen, then open onto the booth room
  async zoom(ctx) {
    const { layer, animate } = ctx;
    layer.classList.add('is-skippable');
    const booth = $('#hero-booth');
    const r = booth && booth.getBoundingClientRect();
    if (r && r.bottom > 0 && r.top < innerHeight && ctx.prev) {
      // aim at the parted curtain (about 40% across, 40% down the booth)
      const ox = r.left + r.width * 0.4, oy = r.top + r.height * 0.4;
      ctx.prev.style.transformOrigin = `${ox + scrollX}px ${oy + scrollY}px`;
      await animate(ctx.prev, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(3.2)', opacity: 1 }], { duration: 600, easing: 'cubic-bezier(.6,0,.4,1)' }, true);
    }
    const halves = curtainHalves(layer);
    halves.forEach(h => { h.style.transform = 'none'; });
    swish(0.3);
    await Promise.all(halves.map(h => animate(h, [{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: 'linear' })));
    if (ctx.prev) ctx.prev.style.transformOrigin = '';
    ctx.swap();
    await delay(ctx, 150);
    await openCurtain(ctx, halves, 600);
  },

  // a strip of film advances across the screen, sprocket edge first
  async film(ctx) {
    const sheet = el('div', { className: 'tx-film' });
    ctx.layer.append(sheet);
    swish(0.3, 1400);
    await ctx.animate(sheet, [{ transform: 'translateX(-104%)' }, { transform: 'translateX(0)' }], { duration: 300, easing: 'cubic-bezier(.6,0,.3,1)' });
    ctx.swap();
    await ctx.animate(sheet, [{ transform: 'translateX(0)' }, { transform: 'translateX(104%)' }], { duration: 300, easing: 'cubic-bezier(.6,0,.3,1)' });
  },

  // the desk slides away like a turned page
  async desk(ctx) {
    const sheet = el('div', { className: 'tx-desk' });
    ctx.layer.append(sheet);
    swish(0.34, 1600);
    await ctx.animate(sheet, [{ transform: 'translateX(104%) rotate(4deg)' }, { transform: 'translateX(0) rotate(0deg)' }], { duration: 300, easing: 'cubic-bezier(.6,0,.3,1)' });
    ctx.swap();
    await ctx.animate(sheet, [{ transform: 'translateX(0) rotate(0deg)', transformOrigin: '0 100%' }, { transform: 'translateX(-110%) rotate(-8deg)', transformOrigin: '0 100%' }], { duration: 600, easing: 'cubic-bezier(.6,0,.3,1)' });
  },

  // the album opens like a keepsake tin
  async tin(ctx) {
    if (ctx.prev) await ctx.animate(ctx.prev, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-in' }, true);
    ctx.swap();
    const lid = ctx.next && ctx.next.querySelector('.tin-lid');
    if (!lid) return;
    lid.style.visibility = 'visible';
    try {
      await ctx.animate(lid, [
        { transform: 'none', opacity: 1 },
        { transform: 'translateY(-14px) rotateX(10deg)', opacity: 1, offset: 0.3 },
        { transform: 'translateY(-46%) rotateX(78deg)', opacity: 0 },
      ], { duration: 640, easing: 'cubic-bezier(.5,0,.3,1)' }, true);
    } finally {
      lid.style.visibility = '';
    }
  },
};
