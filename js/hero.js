/* Home: "the arcade corner". A striped wall, a checker floor, the red
   booth standing on it, a framed strip on the wall and the red film strip
   pinned beside it. No people anywhere: example frames are "your face
   here" prints, or the visitor's own latest strip from their album. */
import { $, $$, rand, wait, loadImage, optionalImage, reducedMotion } from './utils.js';
import { latestStrip } from './album.js';
import { state } from './state.js';
import { coinClink } from './sound.js';

/* =========================================================
   Wiring
   ========================================================= */
export async function initHero({ onEnter }) {
  const hero = $('#hero');
  const stage = $('#hero-booth');
  const photo = await optionalImage('assets/hero/booth.png');
  // the booth is drawn in the page itself; an optional photo replaces it
  if (photo) { photo.alt = 'A vintage photo booth'; stage.replaceChildren(photo); }
  $('#booth-wrap').addEventListener('click', onEnter);   // the sign, the booth or its curtain
  insertCoin(photo ? null : $('#hero-coin'), onEnter);
  hangingThings(hero);
  if (!photo) boothSession(hero);
  $('#hero-cta').addEventListener('click', onEnter);
  const tapCta = $('#booth-tap-cta');
  if (tapCta) {
    if (window.innerWidth >= 769 && window.innerWidth <= 860) tapCta.hidden = false;
    tapCta.addEventListener('click', onEnter);
  }

  // idle motion only while the hero is on screen
  if ('IntersectionObserver' in window) new IntersectionObserver(([en]) => hero.classList.toggle('is-paused', !en.isIntersecting)).observe(hero);

  // everything below only decorates; the hero is already visible without it
  howItWorks();

  // the framed strip on the wall shows the visitor's latest strip from their album, if they have one;
  // otherwise the static "your face here" print in the page stays as it is (nothing is redrawn on load)
  const blob = await latestStrip();
  const own = blob ? await loadImage(URL.createObjectURL(blob)).catch(() => null) : null;
  if (own) {
    const wall = $('#wall-strip'), wx = wall.getContext('2d');
    const dpr = Math.min(3, window.devicePixelRatio || 1), shown = wall.getBoundingClientRect().width;
    if (shown) { wall.width = Math.max(180, Math.round(shown * dpr)); wall.height = Math.round(wall.width * 560 / 180); }
    const s = Math.min(wall.width / own.naturalWidth, wall.height / own.naturalHeight);
    wx.fillStyle = '#1F1A17'; wx.fillRect(0, 0, wall.width, wall.height);
    wx.drawImage(own, (wall.width - own.naturalWidth * s) / 2, (wall.height - own.naturalHeight * s) / 2, own.naturalWidth * s, own.naturalHeight * s);
    URL.revokeObjectURL(own.src);
  }
}

/* "Someone's in the booth": every 20-30s four soft flashes go off behind the curtain, then a little
   strip drops out of the PRINTS slot, hangs for a moment and slides back. Silent, and only while
   the hero is on screen, the tab is visible, nobody is touching the booth and motion is allowed. */
function boothSession(hero) {
  const art = $('#hero-booth .booth-art');
  const back = $('.flash-back', art), fabric = $('#hero-booth .flash-fabric'), strip = $('.mini-strip', art), pool = $('.light-pool', hero);
  let visible = true, busy = false, running = [];
  const stop = () => { running.forEach(a => a.cancel()); running = []; document.body.classList.remove('ambient-busy'); };
  const run = (node, frames, opts) => running.push(node.animate(frames, { fill: 'none', ...opts }));
  const wrap = $('#booth-wrap');
  wrap.addEventListener('pointerenter', () => { busy = true; stop(); });
  wrap.addEventListener('pointerleave', () => { busy = false; });
  wrap.addEventListener('pointerdown', () => { busy = true; stop(); });
  // "on screen" means at least half the booth is in view, not a sliver behind the sticky nav
  if ('IntersectionObserver' in window) new IntersectionObserver(([en]) => { visible = en.intersectionRatio >= 0.5; if (!visible) stop(); }, { threshold: [0, 0.5, 1] }).observe(wrap);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });

  function session() {
    stop();
    const FLASH = 260, GAP = 700, flashes = [0, GAP, GAP * 2, GAP * 3], easing = 'cubic-bezier(.22, .61, .36, 1)';
    flashes.forEach(delay => {
      run(back, [{ opacity: 0 }, { opacity: 0.6, offset: 0.25 }, { opacity: 0 }], { duration: FLASH, delay, easing });
      run(fabric, [{ opacity: 0 }, { opacity: 0.33, offset: 0.25 }, { opacity: 0 }], { duration: FLASH, delay, easing });
      run(pool, [{ filter: 'brightness(1)' }, { filter: 'brightness(1.84)', offset: 0.25 }, { filter: 'brightness(1)' }], { duration: FLASH + 80, delay, easing });
    });
    // ~1s after the last flash: slide out (0.6s), hang with a slight sway (3s), slide back (0.6s)
    const out = GAP * 3 + FLASH + 1000, T = 4200, at = s => s / (T / 1000);
    run(strip, [
      { transform: 'translateY(-82px) rotate(0deg)' },
      { transform: 'translateY(0) rotate(0deg)', offset: at(0.6), easing },
      { transform: 'translateY(0) rotate(1.6deg)', offset: at(1.4), easing },
      { transform: 'translateY(0) rotate(-1.2deg)', offset: at(2.4), easing },
      { transform: 'translateY(0) rotate(.6deg)', offset: at(3.2), easing },
      { transform: 'translateY(0) rotate(0deg)', offset: at(3.6), easing },
      { transform: 'translateY(-82px) rotate(0deg)' },
    ], { duration: T, delay: out, easing });
    // while it runs it is the only ambient motion: the marquee waits and the bulbs chase
    document.body.classList.add('ambient-busy');
    running[running.length - 1].finished.catch(() => {}).finally(() => { if (!running.length || running.every(a => a.playState !== 'running')) document.body.classList.remove('ambient-busy'); });
  }
  (function schedule() {
    setTimeout(() => {
      if (!reducedMotion() && visible && !document.hidden && !busy && state.screen === 'home') session();
      schedule();
    }, rand(20000, 30000));
  })();
}

/* "Insert coin": the 25¢ slot takes a brass coin, the bulbs chase once, then into the booth */
function insertCoin(slot, onEnter) {
  if (!slot) return;
  let going = false;
  slot.addEventListener('click', async e => {
    e.stopPropagation();                      // the booth's own click would enter straight away
    if (going) return;
    going = true;
    const still = reducedMotion();
    if (!still) {
      await $('.coin', slot).animate([
        { opacity: 0, transform: 'translateY(-48px) rotateY(0deg)' },
        { opacity: 1, transform: 'translateY(-40px) rotateY(90deg)', offset: 0.15 },
        { opacity: 1, transform: 'translateY(-4px) rotateY(540deg)', offset: 0.85 },
        { opacity: 0, transform: 'translateY(2px) rotateY(540deg) scaleX(.2)' },
      ], { duration: 420, easing: 'cubic-bezier(.55, 0, .8, .4)' }).finished.catch(() => {});
    }
    coinClink();
    const sign = $('.booth-sign');
    sign.classList.add('is-chasing');
    await wait(still ? 0 : 450);
    sign.classList.remove('is-chasing');
    going = false;
    onEnter();
  });
}

/* Hover physics: everything that hangs swings on its real pivot (nail, tack, tape, string) as a
   damped spring. A nudge follows the cursor's side and speed; the shadow shifts the other way and
   spreads a touch while it tilts. One requestAnimationFrame loop runs only while something moves,
   and it only ever writes transforms (the `rotate` property, skewX for the rope). */
function hangingThings(hero) {
  if (!window.requestAnimationFrame) return;
  const active = new Set();
  let raf = 0, last = 0;

  // a pendulum: natural period, settle time (to ~2%), largest angle
  function swing({ max, period, settle, apply, node }) {
    const wn = (2 * Math.PI) / period;
    return { max, wn, zeta: Math.min(0.9, 4 / (settle * wn)), th: 0, w: 0, apply, node };
  }
  function nudge(s, dir, strength) {
    if (reducedMotion()) return;
    // an impulse of v = max * wn peaks just under max; adding to the current motion keeps it lively
    s.w = Math.max(-s.max * s.wn, Math.min(s.max * s.wn, s.w + dir * strength * s.max * s.wn));
    active.add(s);
    if (s.node) s.node.style.willChange = 'transform';
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); }
  }
  function step(now) {
    // a frame's timestamp can predate the nudge, so never step backwards
    const dt = Math.min(0.032, Math.max(0, now - last) / 1000); last = Math.max(last, now);
    for (const s of active) {
      // semi-implicit Euler on th'' = -wn^2 th - 2 zeta wn th'
      s.w += (-s.wn * s.wn * s.th - 2 * s.zeta * s.wn * s.w) * dt;
      s.th += s.w * dt;
      // at rest once within 2% of its range and barely moving; the last hair of motion is invisible
      if (Math.abs(s.th) < s.max * 0.02 && Math.abs(s.w) < s.max * 0.3) { s.th = 0; s.w = 0; active.delete(s); if (s.node) s.node.style.willChange = ''; }
      s.apply(s.th, s.max);
    }
    raf = active.size ? requestAnimationFrame(step) : 0;
  }

  // rotate an item about its pivot; its shadow moves against the tilt and spreads slightly
  const tilt = (node, shadowVar = '--sx', spreadVar = '--ss', shift = 1.6) => (th, max) => {
    node.style.rotate = th ? `${th.toFixed(3)}deg` : '';
    node.style.setProperty(shadowVar, `${(-th * shift).toFixed(2)}px`);
    if (spreadVar) node.style.setProperty(spreadVar, (1 + (Math.abs(th) / max) * 0.04).toFixed(4));
  };
  const frame = $('.wall-frame'), film = $('.film-wall'), note = $('.torn-note');
  const stanchion = $('.stanchion'), rope = $('.stanchion .rope'), card = $('.stanchion .st-card');
  const items = [
    // heavy frame on a nail, red film on a tack, the paper note on its tape
    { el: frame, s: swing({ max: 1.5, period: 0.8, settle: 1.2, apply: tilt(frame), node: frame }) },
    { el: film, s: swing({ max: 3, period: 0.65, settle: 1.2, apply: tilt(film), node: film }) },
    { el: note, s: swing({ max: 1.5, period: 0.7, settle: 1.2, apply: tilt(note), node: note }) },
  ].filter(i => i.el);
  // the card on its string, and the velvet rope: heavy, slow, swinging only at the sag (skew about the hooks)
  const cardSwing = card && swing({ max: 6, period: 0.55, settle: 1.2, apply: (th) => { card.style.rotate = th ? `${th.toFixed(3)}deg` : ''; stanchion.style.setProperty('--cx', `${(-th * 0.5).toFixed(2)}px`); } });
  const ropeSwing = rope && swing({ max: 4, period: 1.4, settle: 2.2, apply: (th) => {
    rope.style.transform = th ? `skewX(${th.toFixed(3)}deg)` : '';
    stanchion.style.setProperty('--rx', `${(-th * 1.2).toFixed(2)}px`);
  } });

  // ~40% gentler than a full push: most peaks stay under a degree; a quick pass swings a little harder
  const strength = v => 0.6 * Math.min(1, Math.max(0.35, 0.35 + Math.abs(v) * 0.6));
  // moving right pushes the bottom to the right, which is a negative (anticlockwise) angle
  const sideOf = (e, el) => { const r = el.getBoundingClientRect(); return e.clientX < r.left + r.width / 2 ? 1 : -1; };

  // No continuous cursor tracking. On entering an item we read the very next move inside it for
  // direction and speed, then stop listening (or after 60ms fall back to the side it came in from).
  // How deep past the edge the cursor first lands says how fast it arrived (one frame is ~16ms).
  const onEnter = (el, kick) => e => {
    if (e.pointerType !== 'mouse') return;
    const x0 = e.clientX, t0 = e.timeStamp, r = el.getBoundingClientRect();
    const arrival = Math.min(x0 - r.left, r.right - x0) / 16;
    let fired = false;
    const fire = (dir, v) => { if (fired) return; fired = true; el.removeEventListener('pointermove', first); clearTimeout(timer); kick(dir, strength(Math.max(Math.abs(v), arrival))); };
    // the move that caused the enter arrives right after it at the same spot; wait for one that moved
    const first = m => { if (m.clientX === x0) return; const v = (m.clientX - x0) / Math.max(1, m.timeStamp - t0); fire(Math.abs(v) > 0.05 ? Math.sign(v) : sideOf(e, el), v); };
    el.addEventListener('pointermove', first, { passive: true });
    const timer = setTimeout(() => fire(sideOf(e, el), 0), 60);
  };

  const hook = (el, kick) => {
    el.addEventListener('pointerenter', onEnter(el, kick));
    // touch and pen: one gentle swing per tap, no hover state left behind
    el.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') kick(sideOf(e, el), 0.3); });
  };
  items.forEach(({ el, s }) => hook(el, (side, k) => nudge(s, -side, k)));
  if (rope) hook(rope, (side, k) => { nudge(ropeSwing, side, k * 0.8); nudge(cardSwing, -side, k * 0.8); });
}

/* "How it works": polaroids develop the first time they scroll into view,
   and their little demos loop only while visible */
function howItWorks() {
  const items = $$('.polaroid');
  if (!('IntersectionObserver' in window) || reducedMotion()) {
    items.forEach(p => p.classList.add('is-developed', 'is-playing'));
    return;
  }
  // opt in to the undeveloped look only now that something will develop it
  document.documentElement.classList.add('js-develop');
  // prints always develop in order, 01 then 02 then 03, 400ms apart: when one comes into view,
  // any earlier print that has not developed yet goes first
  let queued = 0, lastAt = 0;
  const develop = upTo => {
    const now = performance.now();
    for (; queued <= upTo; queued++) {
      lastAt = Math.max(now, lastAt + 400);
      items[queued].style.setProperty('--delay', `${Math.round(lastAt - now)}ms`);
      items[queued].classList.add('is-developed');
    }
  };
  const io = new IntersectionObserver(entries => entries.forEach(en => {
    en.target.classList.toggle('is-playing', en.isIntersecting);
    if (en.isIntersecting) develop(items.indexOf(en.target));
  }), { threshold: 0.3 });
  items.forEach(n => io.observe(n));
}
