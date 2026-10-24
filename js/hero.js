/* Home: "the arcade corner". A striped wall, a checker floor, the red
   booth standing on it, a framed strip on the wall and the red film strip
   pinned beside it. No people anywhere: example frames are "your face
   here" prints, or the visitor's own latest strip from their album. */
import { $, $$, makeCanvas, mulberry32, range, rand, wait, loadImage, reducedMotion, isCoarse } from './utils.js';
import { TEX, texturesReady } from './textures.js';
import { faceHere, faceHereStrip } from './placeholders.js';
import { latestStrip } from './album.js';
import { state } from './state.js';
import { coinClink } from './sound.js';

/* =========================================================
   The booth (drawn when /assets/hero/booth.png is absent)
   ========================================================= */
function boothSVG() {
  // 300 x 540: a tall, narrow booth (the sign above adds the rest, about 1 : 2.1 overall).
  // The curtained opening takes 60% of the body; the side panel holds the samples, coin and strip slots.
  const rnd = mulberry32(42);
  const rivets = [...range(13).map(i => [20 + i * 21.7, 28]), ...range(13).map(i => [20 + i * 21.7, 404])]
    .map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y}" r="2.2" fill="#5A1218"/><circle cx="${(x - 0.6).toFixed(1)}" cy="${y - 0.6}" r=".9" fill="#F4D7D9"/>`).join('');
  const scuffs = range(12).map(() => {
    const x = 12 + rnd() * 276, y = 40 + rnd() * 360, l = 4 + rnd() * 10, a = rnd() * 0.6 - 0.3;
    return `<path d="M${x.toFixed(1)} ${y.toFixed(1)} l${(Math.cos(a) * l).toFixed(1)} ${(Math.sin(a) * l).toFixed(1)}" stroke="${rnd() > 0.5 ? '#fff' : '#2A0A0E'}" stroke-opacity="${(0.1 + rnd() * 0.14).toFixed(2)}" stroke-width="${(0.5 + rnd()).toFixed(1)}"/>`;
  }).join('');
  const folds = (x0, x1, flip) => range(4).map(i => {
    const x = x0 + ((x1 - x0) * (i + 0.5)) / 4, sway = (flip ? -1 : 1) * (i * 1.2);
    return `<path d="M${x.toFixed(1)} 52 C${(x + sway).toFixed(1)} 160 ${(x - 3 + sway).toFixed(1)} 270 ${(x + sway * 1.6).toFixed(1)} 378" stroke="#140306" stroke-opacity=".5" stroke-width="4.5" fill="none"/>
      <path d="M${(x + 6).toFixed(1)} 52 C${(x + 6 + sway).toFixed(1)} 160 ${(x + 4 + sway).toFixed(1)} 270 ${(x + 6 + sway * 1.6).toFixed(1)} 376" stroke="#E2848C" stroke-opacity=".22" stroke-width="2.2" fill="none"/>`;
  }).join('');
  const rings = range(10).map(i => `<circle cx="${30 + i * 17.5}" cy="46" r="3.6" fill="none" stroke="#C9C4BA" stroke-width="1.8"/>`).join('');
  const curtainL = 'M22 48 H100 C102 140 96 250 104 382 C92 388 80 380 68 386 C56 392 42 382 30 388 C26 390 24 388 22 386Z';
  const curtainR = 'M116 48 H194 V386 C188 389 182 391 176 388 C164 382 150 392 138 386 C126 380 118 386 110 382 C118 250 114 140 116 48Z';
  // two groups per curtain: the outer one parts on hover, the inner one sways
  const curtain = (side, d, x0, x1, hem) => `<g class="curtain-part curtain-part-${side}"><g class="curtain curtain-${side}">
      <path d="${d}" fill="url(#velvet)"/>
      <path d="${d}" fill="url(#velvetTex)" opacity=".45"/>
      ${folds(x0, x1, side === 'r')}
      <path d="${d}" fill="url(#velvetShade)"/>
      <path d="${hem}" stroke="url(#gold)" stroke-width="2.6" fill="none"/>
    </g></g>`;
  return `<svg class="booth-art" viewBox="0 0 300 540" role="img" aria-labelledby="booth-art-title">
  <title id="booth-art-title">A red photo booth with its velvet curtain slightly parted</title>
  <defs>
    <linearGradient id="metal" x1="0" x2="1"><stop offset="0" stop-color="#7A1C24"/><stop offset=".07" stop-color="#B8323C"/><stop offset=".3" stop-color="#9A2630"/><stop offset=".52" stop-color="#C2414A"/><stop offset=".74" stop-color="#931F29"/><stop offset=".93" stop-color="#A92C36"/><stop offset="1" stop-color="#6E1820"/></linearGradient>
    <linearGradient id="metalDark" x1="0" x2="1"><stop offset="0" stop-color="#857F76"/><stop offset=".5" stop-color="#D4D0C9"/><stop offset="1" stop-color="#7C776F"/></linearGradient>
    <linearGradient id="brass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F3D98B"/><stop offset=".5" stop-color="#B8934A"/><stop offset="1" stop-color="#E7C46A"/></linearGradient>
    <linearGradient id="velvet" x1="0" x2="16" gradientUnits="userSpaceOnUse" spreadMethod="reflect"><stop offset="0" stop-color="#3E0B11"/><stop offset=".45" stop-color="#6E1E27"/><stop offset=".7" stop-color="#8C2E37"/><stop offset="1" stop-color="#5A1820"/></linearGradient>
    <linearGradient id="velvetShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset=".22" stop-color="#000" stop-opacity="0"/><stop offset=".8" stop-color="#000" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient>
    <radialGradient id="interior" cx=".5" cy=".5" r=".7"><stop offset="0" stop-color="#FFE3A3"/><stop offset=".45" stop-color="#E3A55A"/><stop offset="1" stop-color="#3A2418"/></radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F3D98B"/><stop offset=".5" stop-color="#B8862E"/><stop offset="1" stop-color="#E7C46A"/></linearGradient>
    <linearGradient id="bodyLight" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>
    <pattern id="brushedTex" width="256" height="128" patternUnits="userSpaceOnUse"><image class="tex-brushed" width="256" height="128" preserveAspectRatio="none"/></pattern>
    <pattern id="velvetTex" width="512" height="512" patternUnits="userSpaceOnUse"><image class="tex-velvet" width="512" height="512" preserveAspectRatio="none"/></pattern>
    <linearGradient id="gapGlow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE9B8" stop-opacity=".2"/><stop offset=".35" stop-color="#FFE3A3" stop-opacity=".75"/><stop offset=".8" stop-color="#FFD58A" stop-opacity=".65"/><stop offset="1" stop-color="#FFD58A" stop-opacity="0"/></linearGradient>
    <filter id="glowBlur" x="-200%" y="-10%" width="500%" height="120%"><feGaussianBlur stdDeviation="5"/></filter>
    <clipPath id="slotOut"><rect x="200" y="277" width="100" height="130"/></clipPath>
    <clipPath id="opening"><rect x="22" y="42" width="172" height="354" rx="2"/></clipPath>
  </defs>

  <!-- cornice -->
  <rect x="0" y="0" width="300" height="17" rx="3" fill="url(#metalDark)"/>
  <rect x="0" y="0" width="300" height="17" rx="3" fill="url(#brushedTex)" opacity=".7"/>
  <rect x="0" y="15" width="300" height="3" fill="#4C463F" opacity=".6"/>

  <!-- red enamel body, lit from the top left -->
  <rect x="6" y="17" width="288" height="507" rx="4" fill="url(#metal)"/>
  <rect x="6" y="17" width="288" height="507" rx="4" fill="url(#brushedTex)" opacity=".3"/>
  <rect x="6" y="17" width="288" height="507" rx="4" fill="url(#bodyLight)"/>
  ${rivets}
  <g stroke-linecap="round">${scuffs}</g>

  <!-- the opening, warm light behind the parted curtain -->
  <rect x="18" y="38" width="180" height="362" rx="4" fill="#1F1A17"/>
  <rect x="22" y="42" width="172" height="354" rx="2" fill="url(#interior)"/>
  <g clip-path="url(#opening)">
    <rect x="22" y="340" width="172" height="56" fill="#2A1A12" opacity=".7"/>
    <ellipse cx="108" cy="354" rx="34" ry="7" fill="#7A2630"/>
    <ellipse cx="108" cy="350" rx="32" ry="6" fill="#A63A44"/>
    <!-- someone's in the booth: the flash fires behind the curtain... -->
    <rect class="flash-back" x="22" y="42" width="172" height="354" fill="#FFFDF6" opacity="0"/>
    ${curtain('l', curtainL, 22, 100, 'M22 380 C36 374 50 386 64 378 C78 370 90 382 104 374')}
    ${curtain('r', curtainR, 116, 194, 'M110 374 C126 384 140 372 154 380 C168 388 182 376 194 382')}
    <!-- ...and lights the velvet from inside -->
    <rect class="flash-fabric" x="22" y="42" width="172" height="354" fill="#FFE6DC" opacity="0" style="mix-blend-mode: screen"/>
    <!-- warm light spilling through the gap in the curtain -->
    <rect class="gap-glow" x="99" y="52" width="18" height="330" fill="url(#gapGlow)" filter="url(#glowBlur)"/>
  </g>
  <ellipse cx="108" cy="402" rx="34" ry="5" fill="#FFD58A" opacity=".35" filter="url(#glowBlur)"/>
  <rect x="18" y="42" width="180" height="6" rx="3" fill="url(#metalDark)"/>
  <g>${rings}</g>

  <!-- side panel: sample strips, the coin slot, the strip slot -->
  <rect x="210" y="40" width="70" height="124" rx="4" fill="#1F1A17"/>
  <rect x="214" y="44" width="62" height="116" rx="2" fill="#EFE8DC"/>
  <image class="display-strips" x="216" y="46" width="58" height="112" preserveAspectRatio="xMidYMid meet"/>
  <path d="M214 44 L246 44 L216 112Z" fill="#fff" opacity=".14"/>

  <rect x="226" y="182" width="38" height="58" rx="5" fill="url(#metalDark)" stroke="#857F76"/>
  <rect x="243" y="192" width="4" height="20" rx="2" fill="#1F1A17"/>
  <text x="245" y="232" text-anchor="middle" font-family='"Playfair Display", Georgia, serif' font-weight="700" font-size="11" fill="#1F1A17">25¢</text>

  <rect x="212" y="258" width="66" height="58" rx="5" fill="url(#metalDark)" stroke="#857F76"/>
  <rect x="220" y="272" width="50" height="6" rx="3" fill="#120A08"/>
  <rect x="233" y="276" width="24" height="22" fill="#FBF6EC" stroke="#8B7B6D" stroke-width=".6"/>
  <text x="245" y="334" text-anchor="middle" font-family='"Special Elite", "Courier New", monospace' font-size="8.5" letter-spacing="1.5" fill="#F4D7D9" opacity=".8">PRINTS</text>
  <!-- the little strip that drops out of the slot after a session -->
  <g clip-path="url(#slotOut)"><g class="mini-strip">
    <rect x="233" y="277" width="24" height="80" fill="#FBF6EC" stroke="#B8A88E" stroke-width=".5"/>
    ${range(4).map(i => `<rect x="235.5" y="${279.5 + i * 18.5}" width="19" height="16" fill="#E9E1D2"/><ellipse cx="245" cy="${287.5 + i * 18.5}" rx="4.5" ry="5.5" fill="none" stroke="#8B7B6D" stroke-width=".5" stroke-dasharray="1 1"/>`).join('')}
    <rect x="240" y="353" width="10" height="1" fill="#8B7B6D" opacity=".6"/>
  </g></g>

  <!-- kick plate and its brass plaque -->
  <rect x="6" y="412" width="288" height="112" rx="4" fill="url(#metalDark)"/>
  <rect x="6" y="412" width="288" height="112" rx="4" fill="url(#brushedTex)" opacity=".6"/>
  ${range(4).map(i => `<rect x="${172 + i * 28}" y="456" width="20" height="4" rx="2" fill="#1F1A17" opacity=".4"/>`).join('')}
  <rect x="26" y="444" width="112" height="32" rx="3" fill="url(#brass)" stroke="#7A5C24"/>
  <circle cx="33" cy="460" r="2" fill="#7A5C24"/><circle cx="131" cy="460" r="2" fill="#7A5C24"/>
  <text x="82" y="465" text-anchor="middle" font-family='"Special Elite", "Courier New", monospace' font-size="12" letter-spacing="2" fill="#3A2A10">EST. 2026</text>
  <rect x="16" y="524" width="26" height="14" rx="2" fill="#1F1A17"/><rect x="258" y="524" width="26" height="14" rx="2" fill="#1F1A17"/>
</svg>`;
}

// Three tiny "your face here" strips for the display case
function displayStrips() {
  const c = makeCanvas(198, 456), x = c.getContext('2d');
  [[8, 10, -0.05], [72, 18, 0.035], [136, 10, -0.02]].forEach(([sx, sy, r]) => {
    x.save();
    x.translate(sx + 28, sy + 210); x.rotate(r); x.translate(-28, -210);
    x.shadowColor = 'rgba(0,0,0,.25)'; x.shadowBlur = 4; x.shadowOffsetX = 1; x.shadowOffsetY = 2;
    x.drawImage(faceHereStrip(56, 196, 4), 0, 0);
    x.restore();
  });
  return c.toDataURL('image/png');
}

/* =========================================================
   Wiring
   ========================================================= */
export async function initHero({ onEnter }) {
  const hero = $('#hero');
  const stage = $('#hero-booth');
  const photo = await loadImage('assets/hero/booth.png').catch(() => null);
  if (photo) { photo.alt = 'A vintage photo booth'; stage.replaceChildren(photo); }
  else stage.innerHTML = boothSVG();
  $('#booth-wrap').addEventListener('click', onEnter);   // the sign, the booth or its curtain
  insertCoin(photo ? null : $('#hero-coin'), onEnter);
  if (!photo) boothSession(hero);
  $('#hero-cta').addEventListener('click', onEnter);

  // idle motion only while the hero is on screen
  if ('IntersectionObserver' in window) new IntersectionObserver(([en]) => hero.classList.toggle('is-paused', !en.isIntersecting)).observe(hero);

  // a little parallax on mouse move (wall and gallery 2px, booth 6px)
  if (!reducedMotion() && !isCoarse()) {
    const layers = $$('[data-depth]', hero);
    let raf = 0, mx = 0, my = 0;
    hero.addEventListener('pointermove', e => {
      const r = hero.getBoundingClientRect();
      mx = (e.clientX - r.left) / r.width - 0.5; my = (e.clientY - r.top) / r.height - 0.5;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        layers.forEach(l => { const d = +l.dataset.depth; l.style.translate = `${(-mx * d * 2).toFixed(1)}px ${(-my * d).toFixed(1)}px`; });
      });
    });
    hero.addEventListener('pointerleave', () => layers.forEach(l => { l.style.translate = ''; }));
  }

  // everything below only decorates; the hero is already visible without it
  howItWorks();
  await texturesReady;
  if (!photo) {
    stage.querySelector('.tex-brushed').setAttribute('href', TEX.brushed);
    stage.querySelector('.tex-velvet').setAttribute('href', TEX.velvet);
    stage.querySelector('.display-strips').setAttribute('href', displayStrips());
  }

  // the framed strip on the wall: the visitor's latest strip, or "your face here"
  const wall = $('#wall-strip'), wx = wall.getContext('2d');
  const blob = await latestStrip();
  const own = blob ? await loadImage(URL.createObjectURL(blob)).catch(() => null) : null;
  if (own) {
    const s = Math.min(wall.width / own.naturalWidth, wall.height / own.naturalHeight);
    wx.fillStyle = '#1F1A17'; wx.fillRect(0, 0, wall.width, wall.height);
    wx.drawImage(own, (wall.width - own.naturalWidth * s) / 2, (wall.height - own.naturalHeight * s) / 2, own.naturalWidth * s, own.naturalHeight * s);
    URL.revokeObjectURL(own.src);
  } else {
    wx.drawImage(faceHereStrip(wall.width, wall.height, 4), 0, 0);
  }

  // the red film strip, pinned with a brass tack
  const film = $('#hero-film');
  for (let i = 0; i < 4; i++) {
    const c = faceHere(320, 240, i);
    c.setAttribute('aria-hidden', 'true');
    film.append(c);
  }
}

/* "Someone's in the booth": every 12-16s four flashes go off behind the curtain, then a little
   strip drops out of the PRINTS slot, hangs for a moment and slides back. Silent, and only while
   the hero is on screen, the tab is visible, nobody is touching the booth and motion is allowed. */
function boothSession(hero) {
  const art = $('#hero-booth .booth-art');
  const back = $('.flash-back', art), fabric = $('.flash-fabric', art), strip = $('.mini-strip', art), pool = $('.light-pool', hero);
  let visible = true, busy = false, running = [];
  const stop = () => { running.forEach(a => a.cancel()); running = []; };
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
    const FLASH = 180, GAP = 700, flashes = [0, GAP, GAP * 2, GAP * 3];
    flashes.forEach(delay => {
      run(back, [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], { duration: FLASH, delay });
      run(fabric, [{ opacity: 0 }, { opacity: 0.55, offset: 0.25 }, { opacity: 0 }], { duration: FLASH, delay });
      run(pool, [{ filter: 'brightness(1)' }, { filter: 'brightness(2.4)', offset: 0.25 }, { filter: 'brightness(1)' }], { duration: FLASH + 80, delay });
    });
    // ~1s after the last flash: slide out (0.6s), hang with a slight sway (3s), slide back (0.6s)
    const out = GAP * 3 + FLASH + 1000, T = 4200, at = s => s / (T / 1000);
    run(strip, [
      { transform: 'translateY(-82px) rotate(0deg)' },
      { transform: 'translateY(0) rotate(0deg)', offset: at(0.6), easing: 'ease-in-out' },
      { transform: 'translateY(0) rotate(1.6deg)', offset: at(1.4), easing: 'ease-in-out' },
      { transform: 'translateY(0) rotate(-1.2deg)', offset: at(2.4), easing: 'ease-in-out' },
      { transform: 'translateY(0) rotate(.6deg)', offset: at(3.2), easing: 'ease-in-out' },
      { transform: 'translateY(0) rotate(0deg)', offset: at(3.6), easing: 'ease-in' },
      { transform: 'translateY(-82px) rotate(0deg)' },
    ], { duration: T, delay: out, easing: 'ease-out' });
  }
  (function schedule() {
    setTimeout(() => {
      if (!reducedMotion() && visible && !document.hidden && !busy && state.screen === 'home') session();
      schedule();
    }, rand(12000, 16000));
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

/* "How it works": polaroids develop the first time they scroll into view,
   their little demos loop only while visible, and the pencil arrows draw in */
function howItWorks() {
  const items = $$('.polaroid'), doodles = $$('.doodle');
  if (!('IntersectionObserver' in window) || reducedMotion()) {
    items.forEach(p => p.classList.add('is-developed', 'is-playing'));
    doodles.forEach(d => d.classList.add('is-drawn'));
    return;
  }
  // opt in to the undeveloped look only now that something will develop it
  document.documentElement.classList.add('js-develop');
  const io = new IntersectionObserver(entries => entries.forEach(en => {
    en.target.classList.toggle('is-playing', en.isIntersecting);
    if (en.isIntersecting) en.target.classList.add('is-developed', 'is-drawn');
  }), { threshold: 0.3 });
  [...items, ...doodles].forEach(n => io.observe(n));
}
