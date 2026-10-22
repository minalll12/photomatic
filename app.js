/* =========================================================
   PHOTOMATIC ☆ retro photobooth
   Vanilla JS, no build step. Everything happens client-side:
   photos never leave the device.

   Sections
     1. Config      constants, palettes, copy
     2. Helpers     DOM, maths, canvas drawing
     3. State       the single source of truth
     4. UI          screens, toasts, cursor trail
     5. Sound       synthesised blips + shutter
     6. Layouts     where the photos sit on a strip
     7. Settings    landing-screen controls
     8. Camera      getUserMedia lifecycle
     9. Booth       countdown + capture sequence, uploads
    10. Filters     per-photo pixel processing
    11. Stickers    definitions + drawing
    12. Frames      strip templates
    13. Render      one renderer for screen and export
    14. Editor      panel, tools, history, pointer input
    15. Export      PNG, share / download, confirmation
    16. Keyboard    global shortcuts
    17. Boot
   ========================================================= */
'use strict';

(() => {
  /* =========================================================
     1. CONFIG
     ========================================================= */
  const C = {
    maroon: '#6B1420', cherry: '#B3122E', cream: '#F6EEDC',
    butter: '#F3E3A0', pink: '#E77FA4', ink: '#1A1012', paper: '#FFFDF8',
  };

  const EXPORT_SCALE = 2;       // PNG export = 2x logical size
  const MAX_CAPTURE_W = 1080;   // stored photo width (enough for 2x export)
  const MAX_VIEW_SCALE = 0.72;  // largest on-screen size, in css px per logical unit
  const PHOTO_ASPECT = 3 / 4;   // photo height / width
  const HISTORY_LIMIT = 60;

  const POSES = [
    'DRAMATIC GASP', 'POINT AT CAMERA', 'MAIN CHARACTER', 'FAKE LAUGH', 'BLOW A KISS',
    'SERVE FACE', 'SIDE EYE', 'JAZZ HANDS', 'HEART HANDS', 'PEACE SIGN', 'ROCKSTAR',
    'SECRET AGENT', 'CRY ABOUT IT', 'TOO COOL', 'CHERRY ON TOP', 'SMIZE', 'GROUP HUG',
    'VILLAIN ERA', 'WINK WINK', 'SURPRISE PARTY', 'CHIN ON HANDS', 'BIG CHEESE',
  ];
  const PRAISE = ['CUTE!', 'SERVED!', 'ICONIC!', 'YESSS!', 'GORGEOUS!', 'NAILED IT!'];

  const FILTERS = [
    { id: 'original', name: 'Original' },
    { id: 'bw', name: 'B&W' },
    { id: 'sepia', name: 'Sepia' },
    { id: 'film', name: '90s Film' },
    { id: 'cherry', name: 'Cherry Tint' },
    { id: 'pixel', name: 'Pixelate' },
    { id: 'dither', name: '1-Bit Dither' },
  ];
  const CHAOS_FILTERS = FILTERS.filter(f => f.id !== 'original').map(f => f.id);
  const filterName = id => (FILTERS.find(f => f.id === id) || FILTERS[0]).name;

  const CAPTION_FONTS = [
    { id: 'script', name: 'Script', css: s => `${s}px "Pinyon Script"`, size: 50 },
    { id: 'black', name: 'Blackletter', css: s => `${s}px "UnifrakturMaguntia"`, size: 44 },
    { id: 'pixel', name: 'Pixel', css: s => `700 ${s}px Silkscreen`, size: 28 },
    { id: 'loud', name: 'Loud', css: s => `${s}px Anton`, size: 42, upper: true },
  ];

  const BG_SWATCHES = [
    ['#F6EEDC', 'Cream'], ['#F3E3A0', 'Butter'], ['#F9D6E1', 'Blush'], ['#E77FA4', 'Pink'],
    ['#B3122E', 'Cherry'], ['#6B1420', 'Maroon'], ['#1A1012', 'Ink'], ['#FFFFFF', 'White'],
    ['#BFE3C8', 'Mint'], ['#CDB9E8', 'Lilac'], ['#BFD9EE', 'Sky'], ['#FBF8F0', 'Paper'],
  ];
  const PEN_COLORS = [
    ['#1A1012', 'Ink'], ['#B3122E', 'Cherry'], ['#E77FA4', 'Pink'], ['#6B1420', 'Maroon'],
    ['#F3E3A0', 'Butter'], ['#F6EEDC', 'Cream'], ['#FFFFFF', 'White'], ['#3E7CB1', 'Blue'],
  ];

  const CAMERA_ERRORS = {
    NotAllowedError: 'Camera access is blocked. Allow it from the camera icon in your address bar, then hit Try again. Or just upload photos instead.',
    SecurityError: 'Your browser blocked camera access for this page.',
    NotFoundError: "We couldn't find a camera on this device.",
    OverconstrainedError: "Your camera doesn't support the settings we asked for.",
    NotReadableError: 'Your camera is busy. Close any other app using it, then try again.',
    InsecureContext: 'The camera only works over https:// or on localhost.',
    NotSupportedError: "This browser doesn't support camera access.",
  };

  /* =========================================================
     2. HELPERS
     ========================================================= */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pad2 = n => String(n).padStart(2, '0');

  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const reducedMotion = () => motionQuery.matches;
  const isCoarse = () => matchMedia('(pointer: coarse)').matches;

  // Tiny element factory: el('button', { className, text, attrs, dataset, style, on }, children)
  function el(tag, { className, text, attrs, dataset, style, on } = {}, children = []) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    if (attrs) for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (dataset) Object.assign(n.dataset, dataset);
    if (style) for (const [k, v] of Object.entries(style)) n.style.setProperty(k, v);
    if (on) for (const [k, fn] of Object.entries(on)) n.addEventListener(k, fn);
    n.append(...children);
    return n;
  }

  // Re-trigger a CSS animation class
  function restartAnimation(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  // Deterministic PRNG so grain/barcodes don't flicker between renders
  function mulberry32(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function isDark(hex) {
    const [r, g, b] = hexToRgb(hex);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
  }
  // amt < 0 darkens toward black, amt > 0 lightens toward white
  function shade(hex, amt) {
    const [r, g, b] = hexToRgb(hex);
    const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
    const m = v => Math.round(v + (t - v) * p);
    return `rgb(${m(r)},${m(g)},${m(b)})`;
  }

  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const receiptDate = d => `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const dateStamp = d => `${MONTHS[d.getMonth()]} ${pad2(d.getDate())} ${d.getFullYear()}`;

  /* --- canvas drawing --- */
  // Silkscreen sits on an 8px grid, so canvas sizes are multiples of 4
  // (= multiples of 8 in the 2x export) to keep it crisp.
  const pixelFont = s => `700 ${s}px Silkscreen`;

  function rrect(ctx, x, y, w, h, r) {
    const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
    ctx.beginPath();
    ctx.moveTo(x + tl, y);
    ctx.arcTo(x + w, y, x + w, y + h, tr);
    ctx.arcTo(x + w, y + h, x, y + h, br);
    ctx.arcTo(x, y + h, x, y, bl);
    ctx.arcTo(x, y, x + w, y, tl);
    ctx.closePath();
  }
  function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  function dashLine(ctx, x1, y1, x2, y2, color, dash, width) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  }
  // Shrink the font until text fits maxW
  function fitFont(ctx, make, size, text, maxW, min = 10, step = 1) {
    let s = size;
    ctx.font = make(s);
    while (ctx.measureText(text).width > maxW && s - step >= min) {
      s -= step;
      ctx.font = make(s);
    }
    return s;
  }
  function truncate(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }
  // "LEFT ........ RIGHT" receipt line
  function dotLeader(ctx, left, right, x1, x2, y) {
    ctx.textAlign = 'left'; ctx.fillText(left, x1, y);
    ctx.textAlign = 'right'; ctx.fillText(right, x2, y);
    const lw = ctx.measureText(left).width, rw = ctx.measureText(right).width;
    const dw = ctx.measureText('.').width || 6;
    const n = Math.max(0, Math.floor((x2 - x1 - lw - rw - 16) / dw));
    ctx.textAlign = 'left';
    ctx.fillText('.'.repeat(n), x1 + lw + 8, y);
  }
  function drawHeart(ctx, x, y, s, color) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(s / 100, s / 100); ctx.translate(-50, -50);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(50, 88);
    ctx.bezierCurveTo(20, 66, 6, 48, 10, 30);
    ctx.bezierCurveTo(14, 14, 36, 10, 50, 28);
    ctx.bezierCurveTo(64, 10, 86, 14, 90, 30);
    ctx.bezierCurveTo(94, 48, 80, 66, 50, 88);
    ctx.fill();
    ctx.restore();
  }

  // Canvas text needs the webfonts loaded first
  const fontsReady = (async () => {
    if (!document.fonts || !document.fonts.load) return;
    try {
      await Promise.all([
        '40px "UnifrakturMaguntia"', '40px Silkscreen', '700 40px Silkscreen',
        '40px VT323', '40px Anton', '40px "Pinyon Script"',
      ].map(f => document.fonts.load(f)));
    } catch (e) { /* fall back to system fonts */ }
  })();

  /* =========================================================
     3. STATE: everything the app knows lives here
     ========================================================= */
  const state = {
    screen: 'landing',          // 'landing' | 'booth' | 'editor' | 'final'

    // Chosen on the landing screen
    settings: { shots: 4, timer: 3, layout: 'strip', pose: true, chaos: false },

    // Camera + capture sequence
    booth: {
      status: 'idle',           // 'loading' | 'ready' | 'running' | 'error'
      stream: null,
      camToken: 0,              // bumps to discard a stale getUserMedia result
      session: 0,               // bumps to cancel a running shot sequence
    },

    // The strip being made: this is what undo snapshots and what gets exported
    design: {
      photos: [],               // { src: canvas, filter, tilt, seed, cache }
      layout: 'strip',
      frame: 'ticket',
      bg: C.cream,
      caption: '',
      captionFont: 'script',
      showDate: true,
      song: '',
      artist: '',
      stickers: [],             // { def, x, y, size, rot, aspect }
      strokes: [],              // { color, size, points: [{ x, y }] }
      shotDate: new Date(),
      order: 1000,
    },

    // Editor-only UI state (never exported)
    editor: {
      tool: 'select',           // 'select' | 'pen'
      selected: null,           // the selected sticker object
      pen: { color: C.ink, size: 8 },
      history: [],              // JSON snapshots of `design`
      drag: null,               // active pointer gesture on the strip
      view: { scale: 1, k: 1, W: 600, H: 1000 }, // css px / unit, canvas px / unit, logical size
      stageW: 0,                // measured by ResizeObserver
      rafId: 0,
    },

    // The rendered PNG on the download screen
    output: { blob: null, url: null },
  };
  const { design, editor } = state;

  /* =========================================================
     4. UI: screens, toasts, cursor trail
     ========================================================= */
  const screens = {
    landing: $('#screen-landing'),
    booth: $('#screen-booth'),
    editor: $('#screen-editor'),
    final: $('#screen-final'),
  };
  let showToken = 0;

  // Fade the current screen out, swap, and let CSS fade the next one in
  async function show(name) {
    const prev = screens[state.screen], next = screens[name];
    state.screen = name;
    const token = ++showToken;
    if (prev !== next && !prev.hidden && !reducedMotion()) {
      prev.classList.add('is-leaving');
      await wait(160);
      prev.classList.remove('is-leaving');
      if (token !== showToken) return; // a newer show() took over
    }
    Object.values(screens).forEach(s => { s.hidden = s !== next; });
    document.body.dataset.screen = name;
    window.scrollTo(0, 0);
    // move focus to the new screen's heading for keyboard + screen reader users
    const heading = next.querySelector('[tabindex="-1"]');
    if (heading) heading.focus({ preventScroll: true });
    if (name === 'editor') requestRender();
  }

  function toast(msg, ms = 2800) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, ms);
  }

  // Sparkle cursor trail (mouse only, off with reduced motion)
  (() => {
    const chars = ['✦', '☆', '✧', '★', '♥', '✿'];
    const colors = [C.cherry, C.pink, C.maroon, '#ffffff', C.butter];
    let last = 0;
    window.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' || reducedMotion()) return;
      const now = performance.now();
      if (now - last < 45) return;
      last = now;
      const s = el('span', {
        className: 'sparkle',
        text: pick(chars),
        attrs: { 'aria-hidden': 'true' },
        style: {
          left: `${e.clientX}px`, top: `${e.clientY}px`, color: pick(colors),
          'font-size': `${Math.round(rand(12, 24))}px`,
          '--dx': `${Math.round(rand(-30, 30))}px`, '--rot': `${Math.round(rand(-200, 200))}deg`,
        },
      });
      s.addEventListener('animationend', () => s.remove());
      document.body.appendChild(s);
    }, { passive: true });
  })();

  /* =========================================================
     5. SOUND: everything synthesised with Web Audio
     ========================================================= */
  let audioCtx = null;
  function audio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function beep(freq = 880, dur = 0.09, type = 'square', vol = 0.12) {
    const a = audio(); if (!a) return;
    const t = a.currentTime;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // Two filtered noise clicks + a low thunk, like a mechanical shutter
  function shutter() {
    const a = audio(); if (!a) return;
    const t = a.currentTime;
    const len = Math.floor(a.sampleRate * 0.12);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);

    const click = (when, freq, gain) => {
      const s = a.createBufferSource();
      s.buffer = buf;
      const f = a.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
      const g = a.createGain(); g.gain.value = gain;
      s.connect(f).connect(g).connect(a.destination);
      s.start(when);
    };
    click(t, 3200, 0.9);
    click(t + 0.075, 1700, 0.7);

    const o = a.createOscillator(), g = a.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.12);
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + 0.16);
  }

  function jingle() {
    [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => beep(f, 0.12, 'square', 0.08), i * 90));
  }

  /* =========================================================
     6. LAYOUTS
     Each layout arranges n 4:3 photos inside a region `A` units
     wide and returns the slots (relative to the region) plus the
     region height. Frames then draw around that region.
     ========================================================= */
  const GRID_GAP = 24;
  const TILT_ROOM = 12;  // breathing room so rotated photos don't hit the header
  const POLAROID_MAT = { color: C.paper, t: 16, r: 16, b: 64, l: 16, stroke: 'rgba(26,16,18,.18)' };

  // Scrapbook plans: [x, y, width, rotation°], all as fractions of the region width
  const COLLAGE = {
    1: [[0.05, 0.00, 0.90, -2]],
    2: [[0.00, 0.00, 0.66, -3], [0.34, 0.42, 0.66, 3]],
    3: [[0.00, 0.00, 0.64, -3], [0.58, 0.14, 0.42, 4], [0.18, 0.48, 0.60, 2]],
    4: [[0.00, 0.02, 0.62, -3], [0.60, 0.00, 0.40, 4], [0.55, 0.30, 0.45, -2], [0.05, 0.50, 0.50, 3]],
  };

  const range = n => Array.from({ length: n }, (_, i) => i);

  const LAYOUTS = {
    strip: {
      name: 'Classic Strip',
      supports: n => n >= 1,
      width: () => 600,
      arrange(n, A, gap) {
        const h = A * PHOTO_ASPECT;
        return {
          slots: range(n).map(i => ({ x: 0, y: i * (h + gap), w: A, h, rot: 0 })),
          h: n * h + (n - 1) * gap,
        };
      },
    },
    grid: {
      name: '2×2 Grid',
      needs: 'Needs exactly 4 photos',
      supports: n => n === 4,
      width: () => 860,
      arrange(n, A) {
        const w = (A - GRID_GAP) / 2, h = w * PHOTO_ASPECT;
        return {
          slots: range(n).map(i => ({ x: (i % 2) * (w + GRID_GAP), y: Math.floor(i / 2) * (h + GRID_GAP), w, h, rot: 0 })),
          h: 2 * h + GRID_GAP,
        };
      },
    },
    film: {
      name: 'Film Row',
      supports: n => n >= 1,
      width: (n, pad) => pad * 2 + n * 320 + (n - 1) * GRID_GAP,
      arrange(n, A) {
        const w = (A - (n - 1) * GRID_GAP) / n, h = w * PHOTO_ASPECT;
        return { slots: range(n).map(i => ({ x: i * (w + GRID_GAP), y: 0, w, h, rot: 0 })), h };
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
        const step = cardH * 0.74;  // each polaroid overlaps the one above
        const rots = [-4, 3.5, -2.5, 4];
        return {
          slots: range(n).map(i => ({
            x: (i % 2 ? A - cardW : 0) + m.l, y: TILT_ROOM + i * step + m.t, w, h, rot: rots[i % rots.length],
          })),
          h: TILT_ROOM * 2 + (n - 1) * step + cardH,
        };
      },
    },
    collage: {
      name: 'Scrapbook',
      supports: n => n >= 1,
      width: () => 720,
      shadow: true,
      arrange(n, A) {
        const slots = COLLAGE[clamp(n, 1, 4)].map(([x, y, w, rot]) => ({
          x: x * A, y: TILT_ROOM + y * A, w: w * A, h: w * A * PHOTO_ASPECT, rot,
        }));
        return { slots, h: Math.max(...slots.map(s => s.y + s.h)) + TILT_ROOM * 2 };
      },
    },
  };

  const fitLayout = (id, n) => (LAYOUTS[id] && LAYOUTS[id].supports(n) ? id : 'strip');

  // Mini SVG preview generated from the real layout maths, so it always matches
  function layoutPreview(id, n) {
    const lay = LAYOUTS[id];
    const count = lay.supports(n) ? n : 4;
    const pad = 40;
    const A = lay.width(count, pad) - pad * 2;
    const { slots, h } = lay.arrange(count, A, 40);
    const m = lay.mat || { t: 10, r: 10, b: 10, l: 10 };
    const fills = [C.cherry, C.pink, C.maroon, C.cherry];
    const shapes = slots.map((s, i) => {
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      return `<g transform="rotate(${s.rot} ${cx} ${cy})">` +
        `<rect x="${s.x - m.l}" y="${s.y - m.t}" width="${s.w + m.l + m.r}" height="${s.h + m.t + m.b}" fill="#fff" stroke="${C.ink}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>` +
        `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${fills[i % fills.length]}"/></g>`;
    }).join('');
    const vw = A + pad * 2, vh = h + pad * 2;
    return `<svg viewBox="${-pad} ${-pad} ${vw} ${vh}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">` +
      `<rect x="${-pad}" y="${-pad}" width="${vw}" height="${vh}" fill="${C.cream}" stroke="${C.ink}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>${shapes}</svg>`;
  }

  // A radio group of layout cards, used on the landing screen and in the editor
  function createLayoutPicker(root, name, onPick) {
    const items = Object.entries(LAYOUTS).map(([id, lay]) => {
      const input = el('input', { attrs: { type: 'radio', name, value: id } });
      const preview = el('span', { className: 'layout-preview' });
      const note = el('span', { className: 'visually-hidden' });
      const label = el('label', { className: 'layout-opt' }, [
        input,
        el('span', { className: 'layout-card' }, [preview, el('span', { className: 'layout-name', text: lay.name }), note]),
      ]);
      input.addEventListener('change', () => { if (input.checked) onPick(id); });
      root.append(label);
      return { id, lay, input, preview, label, note };
    });
    let lastN = null;
    return {
      update(n, current) {
        items.forEach(({ id, lay, input, preview, label, note }) => {
          const ok = lay.supports(n);
          input.disabled = !ok;
          input.checked = id === current;
          label.classList.toggle('is-disabled', !ok);
          if (ok) delete label.dataset.tip; else label.dataset.tip = lay.needs;
          note.textContent = ok ? '' : ` (${lay.needs.toLowerCase()})`;
          if (n !== lastN) preview.innerHTML = layoutPreview(id, n);
        });
        lastN = n;
      },
    };
  }

  /* =========================================================
     7. SETTINGS (landing screen)
     ========================================================= */
  const settingsForm = $('#settings-form');
  const landingPicker = createLayoutPicker($('#landing-layouts'), 'layout', id => {
    state.settings.layout = id;
    refreshLandingPicker();
  });

  function refreshLandingPicker(note = '') {
    landingPicker.update(state.settings.shots, state.settings.layout);
    $('#landing-layout-hint').textContent = note;
  }

  // Browsers may restore form values on back/forward, so read them once on boot
  function readSettingsForm() {
    const s = state.settings;
    s.timer = +$('input[name="timer"]:checked', settingsForm).value;
    s.shots = +$('input[name="shots"]:checked', settingsForm).value;
    s.pose = $('#opt-pose').checked;
    s.chaos = $('#opt-chaos').checked;
  }

  settingsForm.addEventListener('change', e => {
    const t = e.target, s = state.settings;
    if (t.name === 'timer') s.timer = +t.value;
    else if (t.id === 'opt-pose') s.pose = t.checked;
    else if (t.id === 'opt-chaos') s.chaos = t.checked;
    else if (t.name === 'shots') {
      s.shots = +t.value;
      let note = '';
      if (!LAYOUTS[s.layout].supports(s.shots)) {
        note = `${LAYOUTS[s.layout].name} needs 4 photos, so we switched you to ${LAYOUTS.strip.name}.`;
        s.layout = 'strip';
      }
      refreshLandingPicker(note);
    }
  });

  settingsForm.addEventListener('submit', e => {
    e.preventDefault();
    audio(); // unlock audio during a user gesture (iOS)
    openBooth();
  });

  /* =========================================================
     8. CAMERA
     ========================================================= */
  const video = $('#video');

  async function startCamera() {
    const token = ++state.booth.camToken;
    stopCamera(false);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const e = new Error('unsupported');
      e.name = window.isSecureContext ? 'NotSupportedError' : 'InsecureContext';
      throw e;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    });
    // the user left (or restarted) while we were waiting for permission
    if (token !== state.booth.camToken) {
      stream.getTracks().forEach(t => t.stop());
      const e = new Error('superseded');
      e.name = 'Superseded';
      throw e;
    }
    state.booth.stream = stream;
    video.srcObject = stream;
    await video.play().catch(() => {});
    if (!video.videoWidth) {
      await new Promise(res => video.addEventListener('loadedmetadata', res, { once: true }));
    }
  }

  function stopCamera(invalidatePending = true) {
    if (invalidatePending) state.booth.camToken++;
    if (state.booth.stream) state.booth.stream.getTracks().forEach(t => t.stop());
    state.booth.stream = null;
    video.srcObject = null;
  }

  // Never leave the camera running in the background
  window.addEventListener('pagehide', () => stopCamera());

  /* =========================================================
     9. BOOTH
     ========================================================= */
  const boothEl = {
    frame: $('#booth-frame'),
    prompt: $('#pose-prompt'),
    countdown: $('#countdown'),
    countNum: $('#countdown-num'),
    flash: $('#flash'),
    counter: $('#shot-counter-text'),
    skeletonText: $('#booth-skeleton-text'),
    live: $('#booth-live'),
    snap: $('#btn-snap'),
    error: $('#cam-error'),
    errorMsg: $('#cam-error-msg'),
    tray: $('#tray'),
    file: $('#file-input'),
  };

  function setBoothStatus(status) {
    state.booth.status = status;
    boothEl.frame.dataset.state = status;
    boothEl.snap.disabled = status !== 'ready';
    $$('[data-action="upload"]').forEach(b => { b.disabled = status === 'running'; });
    boothEl.error.hidden = status !== 'error';
    boothEl.tray.hidden = status === 'error';
    if (status === 'loading') boothEl.skeletonText.textContent = 'Starting camera…';
    if (status === 'error') boothEl.skeletonText.textContent = 'No camera';
    if (status === 'ready') boothEl.counter.textContent = 'Ready';
  }

  // "SHOT 2 / 4" with fixed-width digits so nothing shifts
  function setCounter(i, n) {
    boothEl.counter.innerHTML = `Shot <span class="digit">${i}</span> / <span class="digit">${n}</span>`;
  }

  const announce = msg => { boothEl.live.textContent = msg; };

  async function openBooth() {
    cancelSession();
    design.photos = [];
    renderTray();
    setBoothStatus('loading');
    show('booth');
    try {
      await startCamera();
      if (state.screen !== 'booth') return stopCamera();
      setBoothStatus('ready');
    } catch (err) {
      if (err.name !== 'Superseded' && state.screen === 'booth') showCameraError(err);
    }
  }

  function leaveBooth() {
    cancelSession();
    stopCamera();
    show('landing');
  }

  function showCameraError(err) {
    stopCamera();
    boothEl.errorMsg.textContent = CAMERA_ERRORS[err && err.name] || "We couldn't reach your camera. You can try again or upload photos instead.";
    setBoothStatus('error');
  }

  function renderTray() {
    const slots = Math.max(state.settings.shots, design.photos.length);
    boothEl.tray.replaceChildren(...range(slots).map(i => {
      const p = design.photos[i];
      const slot = el('li', {
        className: 'slot',
        attrs: { 'aria-label': p ? `Photo ${i + 1}, taken` : `Photo ${i + 1}, waiting` },
        style: { '--r': `${p && p.tilt ? p.tilt : (i % 2 ? 1 : -1) * (2 + (i % 3))}deg` },
      });
      if (!p) {
        slot.textContent = pad2(i + 1);
        return slot;
      }
      slot.classList.add('filled');
      const thumb = makeCanvas(240, 180);
      thumb.getContext('2d').drawImage(p.src, 0, 0, 240, 180);
      slot.append(thumb);
      if (p.filter !== 'original') slot.append(el('span', { className: 'tag', text: filterName(p.filter) }));
      return slot;
    }));
  }

  function makePhoto(src, filter = 'original') {
    return {
      src,
      filter,
      tilt: state.settings.chaos ? Math.round(rand(-6, 6) * 10) / 10 : 0,
      seed: Math.floor(Math.random() * 1e9),
      cache: null,
    };
  }

  // Centre-crop any source to 4:3, optionally mirrored
  function cropTo43(source, sw, sh, mirror) {
    const target = 4 / 3;
    let cw = sw, ch = sh;
    if (sw / sh > target) cw = sh * target; else ch = sw / target;
    const sx = (sw - cw) / 2, sy = (sh - ch) / 2;
    const ow = Math.round(Math.min(MAX_CAPTURE_W, cw));
    const oh = Math.round(ow / target);
    const c = makeCanvas(ow, oh);
    const x = c.getContext('2d');
    if (mirror) { x.translate(ow, 0); x.scale(-1, 1); }
    x.drawImage(source, sx, sy, cw, ch, 0, 0, ow, oh);
    return c;
  }

  async function showPrompt(text, sub, ms) {
    const p = boothEl.prompt;
    p.replaceChildren(el('span', { text }), ...(sub ? [el('small', { text: sub })] : []));
    p.style.setProperty('--tilt', `${rand(-6, 6).toFixed(1)}deg`);
    restartAnimation(p, 'show');
    await wait(ms);
    p.classList.remove('show');
  }

  function showCount(n) {
    boothEl.countdown.classList.add('is-on');
    boothEl.countNum.textContent = n;
    boothEl.countNum.classList.toggle('is-last', n === 1);
    restartAnimation(boothEl.countNum, 'pop');
  }

  function hideOverlays() {
    boothEl.countdown.classList.remove('is-on');
    boothEl.countNum.classList.remove('pop');
    boothEl.prompt.classList.remove('show');
    boothEl.frame.classList.remove('shake');
  }

  function cancelSession() {
    state.booth.session++;
    hideOverlays();
  }

  async function runSession() {
    if (state.booth.status !== 'ready') return;
    const my = ++state.booth.session;
    const alive = () => my === state.booth.session && state.booth.stream;
    const { shots, timer, pose, chaos } = state.settings;

    setBoothStatus('running');
    design.photos = [];
    renderTray();

    for (let i = 0; i < shots; i++) {
      if (!alive()) return;
      setCounter(i + 1, shots);
      announce(`Shot ${i + 1} of ${shots}`);
      const filter = chaos ? pick(CHAOS_FILTERS) : 'original';

      if (pose || chaos) {
        beep(520, 0.14, 'sawtooth', 0.08);
        await showPrompt(pose ? pick(POSES) : 'CHAOS!', chaos ? `Filter: ${filterName(filter)}` : '', 1500);
        if (!alive()) return;
      }

      if (chaos) boothEl.frame.classList.add('shake');
      for (let c = timer; c >= 1; c--) {
        showCount(c);
        beep(c === 1 ? 1320 : 880);
        await wait(1000);
        if (!alive()) return; // cancelSession() already cleaned up the overlays
      }
      hideOverlays();

      // SNAP
      restartAnimation(boothEl.flash, 'go');
      shutter();
      design.photos.push(makePhoto(cropTo43(video, video.videoWidth, video.videoHeight, true), filter));
      renderTray();
      announce(`Photo ${i + 1} taken`);

      await showPrompt(pick(PRAISE), '', 650);
    }

    if (!alive()) return;
    stopCamera();
    openEditor();
  }

  boothEl.snap.addEventListener('click', () => { audio(); runSession(); });
  $('#btn-booth-back').addEventListener('click', leaveBooth);
  $('#btn-retry').addEventListener('click', openBooth);

  // Upload fallback
  $$('[data-action="upload"]').forEach(b => b.addEventListener('click', () => boothEl.file.click()));

  boothEl.file.addEventListener('change', async () => {
    const shots = state.settings.shots;
    const files = [...boothEl.file.files].filter(f => f.type.startsWith('image/')).slice(0, shots);
    boothEl.file.value = '';
    if (!files.length) return;
    cancelSession();
    const photos = [];
    for (const f of files) {
      try {
        const img = await loadImage(f);
        const filter = state.settings.chaos ? pick(CHAOS_FILTERS) : 'original';
        photos.push(makePhoto(cropTo43(img, img.naturalWidth, img.naturalHeight, false), filter));
      } catch (e) {
        toast(`Couldn't read ${f.name} :(`);
      }
    }
    if (!photos.length) return;
    if (photos.length < shots) toast(`Using ${photos.length} photo${photos.length > 1 ? 's' : ''} ☆`);
    stopCamera();
    design.photos = photos;
    openEditor();
  });

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
      img.src = url;
    });
  }

  /* =========================================================
     10. FILTERS (pixel processing, cached per photo)
     ========================================================= */
  function filtered(photo) {
    const id = photo.filter;
    if (id === 'original') return photo.src;
    if (photo.cache && photo.cache.id === id) return photo.cache.canvas;
    const canvas = applyFilter(photo.src, id, photo.seed);
    photo.cache = { id, canvas }; // keep only one cached variant to save memory
    return canvas;
  }

  function applyFilter(src, id, seed) {
    if (id === 'pixel') return pixelate(src);
    if (id === 'dither') return dither(src);

    const w = src.width, h = src.height;
    const c = makeCanvas(w, h);
    const x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    const img = x.getImageData(0, 0, w, h);
    const d = img.data;
    const rnd = mulberry32(seed);
    const cherryStops = [[42, 7, 16], [179, 18, 46], [252, 226, 232]];

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (id === 'bw') {
        const l = (0.299 * r + 0.587 * g + 0.114 * b - 128) * 1.2 + 128;
        d[i] = d[i + 1] = d[i + 2] = l;
      } else if (id === 'sepia') {
        const sr = 0.393 * r + 0.769 * g + 0.189 * b;
        const sg = 0.349 * r + 0.686 * g + 0.168 * b;
        const sb = 0.272 * r + 0.534 * g + 0.131 * b;
        d[i] = sr * 0.92 + 14; d[i + 1] = sg * 0.92 + 10; d[i + 2] = sb * 0.92 + 6;
      } else if (id === 'cherry') {
        // gradient-map luminance through maroon → cherry → blush
        let l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        l = clamp((l - 0.5) * 1.15 + 0.5, 0, 1);
        const [a0, a1, t] = l < 0.5 ? [cherryStops[0], cherryStops[1], l * 2] : [cherryStops[1], cherryStops[2], (l - 0.5) * 2];
        d[i] = a0[0] + (a1[0] - a0[0]) * t;
        d[i + 1] = a0[1] + (a1[1] - a0[1]) * t;
        d[i + 2] = a0[2] + (a1[2] - a0[2]) * t;
      } else if (id === 'film') {
        // warm, faded blacks, grain
        const n = (rnd() - 0.5) * 36;
        d[i] = (r * 1.06 + 12) * 0.9 + 16 + n;
        d[i + 1] = (g * 1.0 + 6) * 0.9 + 13 + n;
        d[i + 2] = (b * 0.84 + 4) * 0.9 + 12 + n;
      }
      // Uint8ClampedArray clamps for us
    }
    x.putImageData(img, 0, 0);

    if (id === 'film') {
      // light leaks
      x.globalCompositeOperation = 'screen';
      let gr = x.createRadialGradient(w * 0.96, h * 0.08, 0, w * 0.96, h * 0.08, w * 0.6);
      gr.addColorStop(0, 'rgba(255,110,40,.8)');
      gr.addColorStop(0.45, 'rgba(231,127,164,.35)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gr; x.fillRect(0, 0, w, h);
      gr = x.createLinearGradient(0, h, w * 0.25, h * 0.6);
      gr.addColorStop(0, 'rgba(255,200,90,.45)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gr; x.fillRect(0, 0, w, h);
      // vignette
      x.globalCompositeOperation = 'multiply';
      gr = x.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.75);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(1, 'rgb(120,88,80)');
      x.fillStyle = gr; x.fillRect(0, 0, w, h);
      x.globalCompositeOperation = 'source-over';
    }
    return c;
  }

  function pixelate(src) {
    const pw = 72, ph = Math.round(pw * src.height / src.width);
    const c = makeCanvas(pw, ph);
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = true;
    x.drawImage(src, 0, 0, pw, ph);
    c.pixelated = true; // draw with nearest-neighbour
    return c;
  }

  // 1-bit Atkinson dither in ink + cream
  function dither(src) {
    const dw = 260, dh = Math.round(dw * src.height / src.width);
    const c = makeCanvas(dw, dh);
    const x = c.getContext('2d');
    x.drawImage(src, 0, 0, dw, dh);
    const img = x.getImageData(0, 0, dw, dh);
    const d = img.data;
    const g = new Float32Array(dw * dh);
    for (let i = 0; i < g.length; i++) {
      const l = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      g[i] = (l - 128) * 1.3 + 140;
    }
    const spread = [[1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]];
    for (let y = 0; y < dh; y++) {
      for (let xx = 0; xx < dw; xx++) {
        const i = y * dw + xx;
        const old = g[i];
        const nv = old < 128 ? 0 : 255;
        const err = (old - nv) / 8;
        g[i] = nv;
        for (const [ox, oy] of spread) {
          const nx = xx + ox, ny = y + oy;
          if (nx >= 0 && nx < dw && ny < dh) g[ny * dw + nx] += err;
        }
      }
    }
    const dark = hexToRgb(C.ink), light = hexToRgb(C.cream);
    for (let i = 0; i < g.length; i++) {
      const col = g[i] > 127 ? light : dark;
      d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; d[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    c.pixelated = true;
    return c;
  }

  /* =========================================================
     11. STICKERS: original SVGs + emoji + zine words
     ========================================================= */
  const svgWrap = (body, vb = '0 0 100 100', extra = '') =>
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${vb}' width='400' height='400' ${extra}>${body}</svg>`;

  // Build crisp pixel-art SVG from a character map
  function pixelSVG(rows, palette) {
    const h = rows.length, w = rows[0].length;
    let rects = '';
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (palette[ch]) rects += `<rect x='${x}' y='${y}' width='1.02' height='1.02' fill='${palette[ch]}'/>`;
    }));
    const size = Math.max(w, h);
    return svgWrap(rects, `${-(size - w) / 2} ${-(size - h) / 2} ${size} ${size}`, `shape-rendering='crispEdges'`);
  }

  const SVG_STICKERS = {
    bow: svgWrap(`<g stroke='#1A1012' stroke-width='4' stroke-linejoin='round'>
      <path d='M46 54 L34 92 L44 86 L50 94 L52 56Z' fill='#B3122E'/><path d='M54 54 L66 92 L56 86 L50 94Z' fill='#B3122E'/>
      <path d='M50 50 L12 24 Q4 50 12 76Z' fill='#E77FA4'/><path d='M50 50 L88 24 Q96 50 88 76Z' fill='#E77FA4'/>
      <path d='M20 36 Q22 50 20 64' stroke='#B3122E' fill='none'/><path d='M80 36 Q78 50 80 64' stroke='#B3122E' fill='none'/>
      <rect x='40' y='39' width='20' height='22' rx='6' fill='#B3122E'/></g>`),
    heart: svgWrap(`<path d='M50 88 C20 66 6 48 10 30 C14 14 36 10 50 28 C64 10 86 14 90 30 C94 48 80 66 50 88Z' fill='#B3122E' stroke='#1A1012' stroke-width='4' stroke-linejoin='round'/>
      <ellipse cx='30' cy='32' rx='8' ry='4.5' fill='#F6EEDC' transform='rotate(-35 30 32)'/>`),
    star: svgWrap(`<polygon points='50,6 61,36 93,36 67,55 77,86 50,67 23,86 33,55 7,36 39,36' fill='#F3E3A0' stroke='#1A1012' stroke-width='4' stroke-linejoin='round'/>
      <path d='M40 40 L46 30' stroke='#fff' stroke-width='4' stroke-linecap='round'/>`),
    cherry: svgWrap(`<path d='M36 70 Q42 38 62 14 M70 66 Q66 40 62 14' stroke='#6B1420' stroke-width='5' fill='none' stroke-linecap='round'/>
      <path d='M62 14 Q78 2 92 12 Q76 26 62 14Z' fill='#5E8C3A' stroke='#1A1012' stroke-width='3'/>
      <circle cx='34' cy='72' r='18' fill='#B3122E' stroke='#1A1012' stroke-width='4'/><circle cx='70' cy='68' r='18' fill='#B3122E' stroke='#1A1012' stroke-width='4'/>
      <circle cx='27' cy='66' r='4' fill='#F6EEDC'/><circle cx='63' cy='62' r='4' fill='#F6EEDC'/>`),
    butterfly: svgWrap(`<g stroke='#1A1012' stroke-width='4' stroke-linejoin='round'>
      <path d='M50 50 C30 12 4 16 9 40 C12 55 30 57 50 52Z' fill='#E77FA4'/><path d='M50 50 C70 12 96 16 91 40 C88 55 70 57 50 52Z' fill='#E77FA4'/>
      <path d='M50 54 C32 58 17 70 25 84 C33 93 46 77 50 58Z' fill='#B3122E'/><path d='M50 54 C68 58 83 70 75 84 C67 93 54 77 50 58Z' fill='#B3122E'/></g>
      <circle cx='28' cy='34' r='5' fill='#F6EEDC'/><circle cx='72' cy='34' r='5' fill='#F6EEDC'/>
      <rect x='46' y='32' width='8' height='48' rx='4' fill='#1A1012'/>
      <path d='M48 34 Q40 18 33 16 M52 34 Q60 18 67 16' stroke='#1A1012' stroke-width='3' fill='none' stroke-linecap='round'/>`),
    sparkle: svgWrap(`<path d='M44 6 Q50 40 84 46 Q50 52 44 86 Q38 52 4 46 Q38 40 44 6Z' fill='#F6EEDC' stroke='#1A1012' stroke-width='4' stroke-linejoin='round'/>
      <path d='M80 62 Q82 76 96 78 Q82 80 80 94 Q78 80 64 78 Q78 76 80 62Z' fill='#E77FA4' stroke='#1A1012' stroke-width='3' stroke-linejoin='round'/>`),
    seal: svgWrap(`<path d='M50 5 C62 3 71 11 81 14 C92 20 92 32 95 44 C98 56 92 67 88 77 C80 89 68 94 54 95 C40 98 28 90 18 84 C8 74 5 62 5 50 C3 36 10 24 20 16 C30 8 40 7 50 5Z' fill='#8E1A28' stroke='#1A1012' stroke-width='3'/>
      <circle cx='50' cy='50' r='31' fill='#B3122E' stroke='#6B1420' stroke-width='4'/>
      <path d='M50 66 C38 58 32 50 34 42 C36 34 46 34 50 42 C54 34 64 34 66 42 C68 50 62 58 50 66Z' fill='#6B1420'/>
      <path d='M28 30 Q34 22 44 20' stroke='#F6EEDC' stroke-opacity='.55' stroke-width='4' fill='none' stroke-linecap='round'/>`),
    pxheart: pixelSVG([
      '..kkk.kkk..',
      '.kXXXkXXXk.',
      'kXooXXXXXXk',
      'kXoXXXXXXXk',
      'kXXXXXXXXXk',
      '.kXXXXXXXk.',
      '..kXXXXXk..',
      '...kXXXk...',
      '....kXk....',
      '.....k.....',
    ], { k: C.ink, X: C.cherry, o: C.cream }),
    pxstar: pixelSVG([
      '.....k.....',
      '....kYk....',
      '....kYk....',
      'kkkkYoYkkkk',
      'kYYYYYYYYYk',
      '.kYYYYYYYk.',
      '..kYYYYYk..',
      '..kYYkYYk..',
      '.kYYk.kYYk.',
      '.kYk...kYk.',
      '.kk.....kk.',
    ], { k: C.ink, Y: '#F2C94C', o: '#fff' }),
  };

  const STICKERS = [
    ...Object.entries(SVG_STICKERS).map(([id, svg]) => ({ id, kind: 'img', svg, label: id })),
    ...[['🎀', 'ribbon'], ['🍒', 'cherries'], ['💋', 'kiss'], ['🌸', 'blossom'], ['🦋', 'butterfly emoji'], ['💌', 'love letter'], ['📸', 'camera'], ['✨', 'sparkles']]
      .map(([e, label]) => ({ id: e, kind: 'emoji', text: e, label })),
    { id: 'xoxo', kind: 'word', text: 'XOXO', color: C.cherry },
    { id: 'omg', kind: 'word', text: 'OMG!', color: C.pink },
    { id: 'cute', kind: 'word', text: 'CUTE', color: C.butter },
    { id: 'feral', kind: 'word', text: 'FERAL', color: C.cream },
    { id: 'besties', kind: 'word', text: 'BESTIES', color: C.pink },
  ];
  const STICKER_BY_ID = Object.fromEntries(STICKERS.map(s => [s.id, s]));
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

  // Pre-load SVG stickers into Image objects for canvas drawing
  const stickersReady = Promise.all(STICKERS.filter(s => s.kind === 'img').map(s => new Promise(res => {
    s.url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s.svg);
    s.img = new Image();
    s.img.onload = res;
    s.img.onerror = res;
    s.img.src = s.url;
  })));

  // Word stickers are wider than tall
  function stickerAspect(def) {
    if (def.kind !== 'word') return 1;
    const x = makeCanvas(10, 10).getContext('2d');
    x.font = '72px Anton';
    return (x.measureText(def.text).width + 26) / 100;
  }

  const stickerDims = s => ({ w: s.size * (s.aspect || 1), h: s.size });

  function drawSticker(ctx, s) {
    const def = STICKER_BY_ID[s.def];
    if (!def) return;
    const { w, h } = stickerDims(s);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (def.kind === 'img') {
      if (def.img && def.img.complete) ctx.drawImage(def.img, -w / 2, -h / 2, w, h);
    } else if (def.kind === 'emoji') {
      ctx.font = `${Math.round(h * 0.82)}px ${EMOJI_FONT}`;
      ctx.fillText(def.text, 0, h * 0.04);
    } else {
      ctx.font = `${h * 0.72}px Anton`;
      ctx.lineJoin = 'round';
      ctx.fillStyle = C.ink;
      ctx.fillText(def.text, h * 0.06, h * 0.06); // hard shadow
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = h * 0.14;
      ctx.strokeText(def.text, 0, 0);
      ctx.fillStyle = def.color;
      ctx.fillText(def.text, 0, 0);
    }
    ctx.restore();
  }

  /* =========================================================
     12. FRAMES
     Each frame sets its paddings and draws a background, an
     optional foreground and optional punched-out holes. They work
     with any layout: per-gap decorations only appear on the
     classic strip, where there are gaps to decorate.
     ========================================================= */
  function drawTrain(ctx, x, y, col, bg) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.35;
    circle(ctx, 26, -4, 7); ctx.fill();
    circle(ctx, 38, -12, 9); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillRect(10, 0, 22, 6);                  // chimney cap
    ctx.fillRect(14, 4, 14, 18);                 // chimney
    rrect(ctx, 2, 20, 60, 30, 8); ctx.fill();    // boiler
    ctx.fillRect(48, 8, 36, 42);                 // cab
    ctx.fillRect(44, 2, 44, 9);                  // roof
    ctx.beginPath(); ctx.moveTo(4, 48); ctx.lineTo(-8, 64); ctx.lineTo(12, 64); ctx.closePath(); ctx.fill(); // cowcatcher
    ctx.fillRect(2, 48, 84, 7);
    ctx.fillStyle = bg;
    ctx.fillRect(56, 16, 20, 14);                // window
    ctx.fillRect(6, 30, 40, 3);                  // boiler stripe
    [[20, 64, 10], [44, 64, 10], [72, 62, 13]].forEach(([cx, cy, r]) => {
      ctx.fillStyle = col; circle(ctx, cx, cy, r); ctx.fill();
      ctx.fillStyle = bg; circle(ctx, cx, cy, r * 0.38); ctx.fill();
    });
    ctx.restore();
  }

  const FRAMES = {
    ticket: {
      name: 'Train Ticket', bg: C.cream, ink: C.maroon, accent: C.cherry,
      pad: 46, top: 150, gap: 58, footerGap: 26, bottom: 76,
      mat: { color: C.maroon, w: 4 },
      drawBg(ctx, L) {
        const { W, H } = L;
        ctx.fillStyle = design.bg;
        rrect(ctx, 0, 0, W, H, 28); ctx.fill();
        ctx.strokeStyle = L.ink;
        ctx.lineWidth = 6; rrect(ctx, 14, 14, W - 28, H - 28, 20); ctx.stroke();
        ctx.lineWidth = 2; rrect(ctx, 24, 24, W - 48, H - 48, 14); ctx.stroke();

        drawTrain(ctx, 52, 42, L.ink, design.bg);
        ctx.fillStyle = L.ink;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        fitFont(ctx, s => `${s}px Anton`, 46, 'PHOTOMATIC EXPRESS', W - 200);
        ctx.fillText('PHOTOMATIC EXPRESS', 156, 86);
        const sub = `ADMIT ONE * PLATFORM 26 * No.${design.order}`;
        fitFont(ctx, pixelFont, 16, sub, W - 202, 8, 4);
        ctx.fillText(sub, 158, 114);
        dashLine(ctx, 40, L.region.y - 22, W - 40, L.region.y - 22, L.ink, [10, 8], 3);
      },
      drawFg(ctx, L) {
        const { W } = L;
        ctx.fillStyle = L.ink;
        ctx.textBaseline = 'middle';
        if (L.isStrip) {
          ctx.font = pixelFont(16);
          L.slots.forEach((s, i) => {
            if (i === L.n - 1) return;
            const y = s.y + s.h + L.f.gap / 2;
            ctx.textAlign = 'left'; ctx.fillText(`ROW 0${i + 1}`, s.x, y);
            ctx.textAlign = 'right'; ctx.fillText(`SEAT ${i + 1}${'ABCD'[i]}`, s.x + s.w, y);
            dashLine(ctx, s.x + 110, y, s.x + s.w - 120, y, L.ink, [6, 6], 2);
          });
        }
        const by = L.footerEnd + 8;
        dashLine(ctx, 40, by, W - 40, by, L.ink, [10, 8], 3);
        ctx.textAlign = 'center';
        ctx.font = pixelFont(12);
        ctx.fillText('NON-REFUNDABLE * VALID FOR ONE SWEET RIDE', W / 2, by + 32);
      },
      punch(ctx, L) {
        [L.region.y - 22, L.footerEnd + 8].forEach(y => {
          circle(ctx, 0, y, 18); ctx.fill();
          circle(ctx, L.W, y, 18); ctx.fill();
        });
      },
    },

    stamp: {
      name: 'Postage Stamp', bg: C.maroon, ink: C.maroon, accent: C.cherry,
      pad: 58, top: 130, gap: 58, footerGap: 30, bottom: 124,
      mat: { color: C.cream, w: 8 },
      drawBg(ctx, L) {
        const { W, H } = L;
        ctx.fillStyle = design.bg;
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = L.ink;
        ctx.lineWidth = 3;
        ctx.strokeRect(20, 20, W - 40, H - 40);

        ctx.fillStyle = L.ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        fitFont(ctx, s => `${s}px Anton`, 50, 'PHOTOMATIC POST', 380);
        ctx.fillText('PHOTOMATIC POST', W / 2 - 20, 80);
        ctx.font = '34px Anton';
        ctx.textAlign = 'right';
        ctx.fillText('25¢', W - 40, 80);
        ctx.textAlign = 'center';
        ctx.fillStyle = L.accent;
        ctx.font = pixelFont(16);
        ctx.fillText('* PAR AVION * AIR MAIL * 2026 *', W / 2, 108);

        // film-hole dots: side columns + rows between photos
        ctx.fillStyle = L.ink;
        for (let y = L.region.y; y < L.photosEnd - 6; y += 26) {
          rrect(ctx, 30, y, 14, 10, 3); ctx.fill();
          rrect(ctx, W - 44, y, 14, 10, 3); ctx.fill();
        }
        if (L.isStrip) {
          L.slots.forEach((s, i) => {
            if (i === L.n - 1) return;
            const y = s.y + s.h + L.f.gap / 2 - 6;
            for (let x = s.x + 4; x < s.x + s.w - 10; x += 27) { rrect(ctx, x, y, 16, 12, 3); ctx.fill(); }
          });
        }
      },
      drawFg(ctx, L) {
        // postmark
        const cx = L.W - 118, cy = L.footerEnd + 58;
        ctx.save();
        ctx.strokeStyle = L.ink;
        ctx.fillStyle = L.ink;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 3;
        circle(ctx, cx, cy, 44); ctx.stroke();
        circle(ctx, cx, cy, 35); ctx.stroke();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        fitFont(ctx, pixelFont, 12, 'PHOTOMATIC', 58, 8, 4);
        ctx.fillText('PHOTOMATIC', cx, cy - 12);
        ctx.font = '24px Anton';
        ctx.fillText('2026', cx, cy + 9);
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          for (let x = 52; x <= cx - 52; x += 4) {
            const y = cy - 24 + k * 16 + Math.sin(x / 14) * 5;
            if (x === 52) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.restore();
      },
      punch(ctx, L) {
        const r = 9;
        const nx = Math.round(L.W / 26), sx = L.W / nx;
        for (let i = 0; i <= nx; i++) {
          circle(ctx, i * sx, 0, r); ctx.fill();
          circle(ctx, i * sx, L.H, r); ctx.fill();
        }
        const ny = Math.round(L.H / 26), sy = L.H / ny;
        for (let j = 0; j <= ny; j++) {
          circle(ctx, 0, j * sy, r); ctx.fill();
          circle(ctx, L.W, j * sy, r); ctx.fill();
        }
      },
    },

    letter: {
      name: 'Love Letter', bg: '#F9D6E1', ink: C.maroon, accent: C.cherry,
      pad: 54, top: 156, gap: 38, footerGap: 32, bottom: 200,
      mat: { color: '#FFFFFF', w: 12 },
      drawBg(ctx, L) {
        const { W, H } = L;
        // airmail-striped border
        ctx.fillStyle = C.cream;
        ctx.fillRect(0, 0, W, H);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W, H);
        ctx.rect(16, 16, W - 32, H - 32);
        ctx.clip('evenodd');
        for (let x = -H; x < W + H; x += 64) {
          [[0, C.cherry], [32, C.pink]].forEach(([off, col]) => {
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.moveTo(x + off, 0); ctx.lineTo(x + off + 16, 0);
            ctx.lineTo(x + off + 16 + H, H); ctx.lineTo(x + off + H, H);
            ctx.fill();
          });
        }
        ctx.restore();
        ctx.fillStyle = design.bg;
        ctx.fillRect(16, 16, W - 32, H - 32);

        ctx.fillStyle = L.ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.font = '74px "Pinyon Script"';
        ctx.fillText('with love,', W / 2, 100);
        drawHeart(ctx, W / 2 - 208, 70, 34, C.cherry);
        drawHeart(ctx, W / 2 + 208, 70, 34, C.cherry);
        ctx.font = pixelFont(12);
        ctx.fillStyle = L.accent;
        ctx.fillText('XOXO * SEALED WITH A KISS * XOXO', W / 2, 130);
      },
      drawFg(ctx, L) {
        const { W, H } = L;
        // washi tape across the top corners of each photo, following its tilt
        eachPhotoFrame(ctx, L, box => {
          const tw = Math.min(84, box.w * 0.3), th = tw * 0.31;
          [[box.x + tw * 0.43, -0.45], [box.x + box.w - tw * 0.43, 0.45]].forEach(([tx, a]) => {
            ctx.save();
            ctx.translate(tx, box.y - 4);
            ctx.rotate(a);
            ctx.fillStyle = 'rgba(243,227,160,.82)';
            ctx.fillRect(-tw / 2, -th / 2, tw, th);
            ctx.fillStyle = 'rgba(231,127,164,.5)';
            for (let k = -tw / 2 + 6; k < tw / 2; k += 14) ctx.fillRect(k, -th / 2, 6, th);
            ctx.restore();
          });
        });
        // envelope flap at the bottom
        const top = L.footerEnd, bot = H - 16, l = 16, r = W - 16;
        const tipY = top + (bot - top) * 0.6;
        ctx.save();
        ctx.fillStyle = shade(design.bg, -0.06);
        ctx.beginPath(); ctx.moveTo(l, bot); ctx.lineTo(W / 2, tipY); ctx.lineTo(r, bot); ctx.closePath(); ctx.fill();
        ctx.fillStyle = shade(design.bg, -0.12);
        ctx.beginPath(); ctx.moveTo(l, top); ctx.lineTo(W / 2, tipY); ctx.lineTo(r, top); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = L.ink;
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.moveTo(l, bot); ctx.lineTo(W / 2 - 40, tipY + 14); ctx.moveTo(r, bot); ctx.lineTo(W / 2 + 40, tipY + 14); ctx.stroke();
        ctx.restore();
        // wax seal
        ctx.fillStyle = '#8E1A28';
        circle(ctx, W / 2, tipY, 34); ctx.fill();
        ctx.fillStyle = C.cherry;
        circle(ctx, W / 2, tipY, 26); ctx.fill();
        ctx.strokeStyle = C.maroon; ctx.lineWidth = 3; ctx.stroke();
        drawHeart(ctx, W / 2, tipY + 1, 28, C.maroon);
      },
    },

    receipt: {
      name: 'Receipt', bg: '#FBF8F0', ink: C.ink, accent: C.cherry,
      pad: 58, top: 216, gap: 56, footerGap: 56, bottom: 252,
      mat: { color: C.ink, w: 2 },
      drawBg(ctx, L) {
        const { W, H } = L;
        ctx.fillStyle = design.bg;
        ctx.fillRect(0, 0, W, H);
        // thermal paper shading
        const g = ctx.createLinearGradient(0, 0, W, 0);
        g.addColorStop(0, 'rgba(0,0,0,.07)'); g.addColorStop(0.12, 'rgba(0,0,0,0)');
        g.addColorStop(0.88, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.07)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);

        // VT323 is monospaced, so receipt numbers line up like a real till roll
        const x1 = L.f.pad, x2 = W - L.f.pad;
        ctx.fillStyle = L.ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.font = '60px VT323';
        ctx.fillText('PHOTOMATIC', W / 2, 78);
        ctx.font = '27px VT323';
        ctx.fillText('PHOTO CO. & SNACK BAR', W / 2, 106);
        ctx.fillText('EST. 2026 * BOOTH No.04', W / 2, 130);
        ctx.textAlign = 'left';
        ctx.fillText(`ORDER #${design.order}`, x1, 164);
        ctx.textAlign = 'right';
        ctx.fillText(receiptDate(design.shotDate), x2, 164);
        dashLine(ctx, x1, 178, x2, 178, L.ink, [6, 5], 2);
        ctx.textAlign = 'left';
        ctx.fillText('QTY ITEM', x1, 202);
        ctx.textAlign = 'right';
        ctx.fillText('PRICE', x2, 202);
      },
      drawFg(ctx, L) {
        const { W } = L;
        const x1 = L.f.pad, x2 = W - L.f.pad;
        ctx.fillStyle = L.ink;
        ctx.font = '27px VT323';
        if (L.isStrip) {
          ctx.textBaseline = 'middle';
          L.slots.forEach((s, i) => dotLeader(ctx, `${i + 1}x SNAPSHOT #${i + 1}`, '$0.25', x1, x2, s.y + s.h + 28));
        }
        const fe = L.footerEnd;
        ctx.textBaseline = 'alphabetic';
        dashLine(ctx, x1, fe + 10, x2, fe + 10, L.ink, [6, 5], 2);
        dotLeader(ctx, `${L.n}x SNAPSHOTS`, `$${(L.n * 0.25).toFixed(2)}`, x1, x2, fe + 40);
        dotLeader(ctx, 'SMILES', 'LOTS', x1, x2, fe + 66);
        ctx.font = '36px VT323';
        dotLeader(ctx, 'TOTAL', 'PRICELESS', x1, x2, fe + 102);
        dashLine(ctx, x1, fe + 118, x2, fe + 118, L.ink, [6, 5], 2);
        // barcode
        const rnd = mulberry32(design.order);
        let bx = 120;
        while (bx < W - 120) {
          const bw = 1 + Math.floor(rnd() * 4);
          if (rnd() > 0.35) ctx.fillRect(bx, fe + 132, bw * 1.5, 54);
          bx += bw * 1.5 + 2;
        }
        ctx.font = '25px VT323';
        ctx.textAlign = 'center';
        ctx.fillText('* THANK YOU * COME AGAIN *', W / 2, fe + 216);
      },
      punch(ctx, L) {
        // torn zigzag top & bottom
        const t = 10, step = 10;
        ctx.beginPath();
        ctx.moveTo(0, -1);
        for (let x = 0, i = 0; x <= L.W; x += step, i++) ctx.lineTo(x, i % 2 ? t : 0);
        ctx.lineTo(L.W, -1);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, L.H + 1);
        for (let x = 0, i = 0; x <= L.W; x += step, i++) ctx.lineTo(x, L.H - (i % 2 ? t : 0));
        ctx.lineTo(L.W, L.H + 1);
        ctx.closePath(); ctx.fill();
      },
    },

    pixel: {
      name: 'Pixel Pal', bg: C.pink, ink: C.ink, accent: C.maroon,
      pad: 72, top: 112, gap: 22, footerGap: 124, bottom: 252,
      mat: { color: '#0F380F', w: 3 },
      drawBg(ctx, L) {
        const { W, H, region: r } = L;
        ctx.fillStyle = design.bg;
        rrect(ctx, 0, 0, W, H, [30, 30, 120, 30]); ctx.fill();
        // case seam
        ctx.fillStyle = 'rgba(26,16,18,.16)';
        ctx.fillRect(30, 22, W - 60, 3);
        ctx.fillRect(30, 10, 3, 15);
        ctx.fillRect(W - 33, 10, 3, 15);

        // bezel
        const bx = 30, by = 44, bw = W - 60, bh = L.photosEnd - by + 50;
        ctx.fillStyle = '#3E3A4A';
        rrect(ctx, bx, by, bw, bh, [14, 14, 56, 14]); ctx.fill();
        [[bx + 16], [bx + bw - 112]].forEach(([sx]) => {
          ctx.fillStyle = C.cherry; ctx.fillRect(sx, by + 20, 96, 3);
          ctx.fillStyle = C.pink; ctx.fillRect(sx, by + 26, 96, 3);
        });
        ctx.fillStyle = '#CFC8DA';
        ctx.font = pixelFont(12);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('DOT MATRIX SNAPS', W / 2, by + 25);
        // power LED
        ctx.fillStyle = '#FF3355';
        circle(ctx, bx + 14, r.y + 30, 6); ctx.fill();
        ctx.fillStyle = 'rgba(255,51,85,.3)';
        circle(ctx, bx + 14, r.y + 30, 10); ctx.fill();

        // green LCD screen
        ctx.fillStyle = '#9BBC0F';
        ctx.fillRect(r.x - 14, r.y - 14, r.w + 28, r.h + 28);

        // logo
        const ly = by + bh + 46;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = L.accent;
        ctx.font = '40px "UnifrakturMaguntia"';
        ctx.fillText('Photomatic', 38, ly);
        const lw = ctx.measureText('Photomatic').width;
        ctx.fillStyle = L.ink;
        ctx.font = pixelFont(24);
        ctx.fillText('PIXEL PAL', 38 + lw + 12, ly);
      },
      drawFg(ctx, L) {
        const { W, region: r } = L;
        // LCD scanlines
        ctx.fillStyle = 'rgba(15,56,15,.12)';
        for (let y = r.y - 14; y < r.y + r.h + 14; y += 4) ctx.fillRect(r.x - 14, y, r.w + 28, 1.2);

        const fe = L.footerEnd;
        // D-pad
        const dx = 126, dy = fe + 96;
        ctx.fillStyle = '#2B2630';
        ctx.fillRect(dx - 19, dy - 58, 38, 116);
        ctx.fillRect(dx - 58, dy - 19, 116, 38);
        ctx.fillStyle = 'rgba(255,255,255,.12)';
        circle(ctx, dx, dy, 10); ctx.fill();
        // A / B
        [[W - 130, fe + 76, 'A'], [W - 210, fe + 112, 'B']].forEach(([x, y, label]) => {
          ctx.fillStyle = C.cherry;
          circle(ctx, x, y, 32); ctx.fill();
          ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,.25)';
          circle(ctx, x - 10, y - 10, 8); ctx.fill();
          ctx.fillStyle = L.ink;
          ctx.font = pixelFont(20);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, x + 2, y + 48);
        });
        // select / start
        [[W / 2 - 64, 'SELECT'], [W / 2 + 30, 'START']].forEach(([x, label]) => {
          ctx.save();
          ctx.translate(x, fe + 196);
          ctx.rotate(-0.45);
          ctx.fillStyle = '#6E6878';
          rrect(ctx, -30, -9, 60, 18, 9); ctx.fill();
          ctx.fillStyle = L.ink;
          ctx.font = pixelFont(12);
          ctx.textAlign = 'center';
          ctx.fillText(label, 0, 26);
          ctx.restore();
        });
        // speaker grille
        ctx.fillStyle = 'rgba(26,16,18,.22)';
        for (let k = 0; k < 5; k++) {
          ctx.save();
          ctx.translate(W - 148 + k * 18, fe + 206);
          ctx.rotate(-0.45);
          rrect(ctx, -4, -28, 8, 56, 4); ctx.fill();
          ctx.restore();
        }
      },
    },
  };

  /* =========================================================
     13. RENDER
     ========================================================= */
  // Works out where everything sits on the strip, in logical units
  function computeLayout() {
    const f = FRAMES[design.frame];
    const lay = LAYOUTS[design.layout];
    const n = design.photos.length;
    const W = Math.round(lay.width(n, f.pad));
    const region = { x: f.pad, y: f.top, w: W - f.pad * 2, h: 0 };
    const { slots, h } = lay.arrange(n, region.w, f.gap);
    slots.forEach(s => { s.x += region.x; s.y += region.y; });
    region.h = h;
    const photosEnd = region.y + h;

    // footer: caption, date stamp, now-playing card
    const textW = Math.min(region.w, 504);
    let fy = photosEnd + f.footerGap;
    const items = {};
    if (design.caption.trim()) { items.caption = fy + 36; fy += 66; }
    if (design.showDate) { items.date = fy + 14; fy += 38; }
    if (design.song.trim() || design.artist.trim()) {
      items.np = { x: (W - textW) / 2, y: fy + 6, w: textW, h: 104 };
      fy += 128;
    }
    const footerEnd = fy + 8;
    const H = Math.round(footerEnd + f.bottom + 46);

    const dark = isDark(design.bg);
    return {
      W, H, n, f, slots, region, photosEnd, footerEnd, items, textW,
      isStrip: design.layout === 'strip',
      mat: lay.mat || { color: f.mat.color, t: f.mat.w, r: f.mat.w, b: f.mat.w, l: f.mat.w },
      shadow: !!lay.shadow,
      ink: dark ? C.cream : f.ink,
      accent: dark ? C.butter : f.accent,
    };
  }

  // One renderer for both the on-screen preview and the export
  function render(ctx, scale, showUI, L = computeLayout()) {
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, L.W, L.H);
    ctx.imageSmoothingQuality = 'high';

    L.f.drawBg(ctx, L);
    drawPhotos(ctx, L);
    if (L.f.drawFg) L.f.drawFg(ctx, L);
    drawFooter(ctx, L);

    // punch holes / notches / torn edges out of the paper
    if (L.f.punch) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';
      L.f.punch(ctx, L);
      ctx.restore();
    }

    drawStrokes(ctx);
    design.stickers.forEach(s => drawSticker(ctx, s));
    drawWatermark(ctx, L);

    // editing handles only on screen, never in the export
    if (showUI && editor.selected) drawSelection(ctx, editor.selected);
    ctx.restore();
  }

  // Run fn inside each photo's rotated frame; `box` is the mat's outer rect
  function eachPhotoFrame(ctx, L, fn) {
    const m = L.mat;
    L.slots.forEach((s, i) => {
      const p = design.photos[i];
      if (!p) return;
      ctx.save();
      ctx.translate(s.x + s.w / 2, s.y + s.h / 2);
      const rot = (s.rot + (p.tilt || 0)) * Math.PI / 180;
      if (rot) ctx.rotate(rot);
      fn({ x: -s.w / 2 - m.l, y: -s.h / 2 - m.t, w: s.w + m.l + m.r, h: s.h + m.t + m.b }, s, p, rot);
      ctx.restore();
    });
  }

  function drawPhotos(ctx, L) {
    eachPhotoFrame(ctx, L, (box, s, p, rot) => {
      if (rot || L.shadow) {
        ctx.fillStyle = 'rgba(26,16,18,.35)';
        ctx.fillRect(box.x + 6, box.y + 6, box.w, box.h);
      }
      ctx.fillStyle = L.mat.color;
      ctx.fillRect(box.x, box.y, box.w, box.h);
      if (L.mat.stroke) {
        ctx.strokeStyle = L.mat.stroke;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(box.x, box.y, box.w, box.h);
      }
      const img = filtered(p);
      ctx.imageSmoothingEnabled = !img.pixelated;
      ctx.drawImage(img, -s.w / 2, -s.h / 2, s.w, s.h);
    });
  }

  function drawFooter(ctx, L) {
    const it = L.items;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = L.ink;

    if (it.caption != null) {
      const font = CAPTION_FONTS.find(f => f.id === design.captionFont) || CAPTION_FONTS[0];
      const text = font.upper ? design.caption.trim().toUpperCase() : design.caption.trim();
      fitFont(ctx, font.css, font.size, text, L.textW, 14);
      ctx.fillText(text, L.W / 2, it.caption);
    }
    if (it.date != null) {
      // a clean sans for numbers, spaced out like a camera date stamp
      ctx.font = '22px Anton';
      if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
      ctx.fillStyle = L.accent;
      ctx.fillText(`★ ${dateStamp(design.shotDate)} ★`, L.W / 2, it.date);
    }
    ctx.restore();
    if (it.np) drawNowPlaying(ctx, it.np);
  }

  // Tiny music-player card
  function drawNowPlaying(ctx, r) {
    const { x, y, w, h } = r;
    const title = design.song.trim() || 'Untitled';
    const artist = design.artist.trim() || 'Unknown Artist';
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(-0.012);
    ctx.translate(-w / 2, -h / 2);

    ctx.fillStyle = C.cherry;
    rrect(ctx, 6, 6, w, h, 16); ctx.fill();
    ctx.fillStyle = C.ink;
    rrect(ctx, 0, 0, w, h, 16); ctx.fill();

    // album art + vinyl
    const a = h - 24, ax = 12, ay = 12;
    ctx.fillStyle = C.pink;
    rrect(ctx, ax, ay, a, a, 8); ctx.fill();
    ctx.fillStyle = C.ink;
    circle(ctx, ax + a / 2, ay + a / 2, a * 0.38); ctx.fill();
    ctx.strokeStyle = 'rgba(246,238,220,.18)'; ctx.lineWidth = 1.5;
    circle(ctx, ax + a / 2, ay + a / 2, a * 0.28); ctx.stroke();
    ctx.fillStyle = C.cherry;
    circle(ctx, ax + a / 2, ay + a / 2, a * 0.13); ctx.fill();
    ctx.fillStyle = C.cream;
    circle(ctx, ax + a / 2, ay + a / 2, 2.5); ctx.fill();

    // text
    const tx = ax + a + 16, controlsW = 112, tw = w - tx - controlsW;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.pink;
    ctx.font = pixelFont(12);
    ctx.fillText('NOW PLAYING', tx, 28);
    ctx.fillStyle = C.cream;
    fitFont(ctx, s => `${s}px Anton`, 28, title.toUpperCase(), tw, 18);
    ctx.fillText(truncate(ctx, title.toUpperCase(), tw), tx, 60);
    ctx.fillStyle = C.butter;
    ctx.font = '24px VT323';
    ctx.fillText(truncate(ctx, artist, tw), tx, 82);

    // progress bar
    ctx.fillStyle = 'rgba(246,238,220,.25)';
    ctx.fillRect(tx, h - 14, tw, 4);
    ctx.fillStyle = C.pink;
    ctx.fillRect(tx, h - 14, tw * 0.42, 4);
    circle(ctx, tx + tw * 0.42, h - 12, 5); ctx.fill();

    // controls ◀◀ ▶ ▶▶
    const cy = h / 2, c0 = w - controlsW + 8;
    ctx.fillStyle = C.cream;
    const tri = (px, py, s, dir) => {
      ctx.beginPath();
      ctx.moveTo(px, py - s); ctx.lineTo(px + s * dir * 1.2, py); ctx.lineTo(px, py + s);
      ctx.closePath(); ctx.fill();
    };
    tri(c0 + 14, cy, 8, -1); ctx.fillRect(c0 - 1, cy - 8, 3, 16);
    circle(ctx, c0 + 50, cy, 21); ctx.fill();
    ctx.fillStyle = C.ink; tri(c0 + 44, cy, 9, 1);
    ctx.fillStyle = C.cream;
    tri(c0 + 84, cy, 8, 1); ctx.fillRect(c0 + 94, cy - 8, 3, 16);
    ctx.restore();
  }

  // "Photomatic ☆" signature along the bottom edge
  function drawWatermark(ctx, L) {
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = L.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '22px "UnifrakturMaguntia"';
    const word = 'Photomatic';
    const ww = ctx.measureText(word).width;
    ctx.fillText(word, L.W / 2 - 10, L.H - 24);
    ctx.font = '18px sans-serif';
    ctx.fillText('☆', L.W / 2 + ww / 2 + 2, L.H - 25);
    ctx.restore();
  }

  function drawStrokes(ctx) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    design.strokes.forEach(st => {
      const pts = st.points;
      ctx.strokeStyle = st.color;
      ctx.fillStyle = st.color;
      ctx.lineWidth = st.size;
      if (pts.length === 1) {
        circle(ctx, pts[0].x, pts[0].y, st.size / 2); ctx.fill();
        return;
      }
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    });
    ctx.restore();
  }

  /* --- sticker selection handles (screen only) --- */
  function localToWorld(s, lx, ly) {
    const c = Math.cos(s.rot), sn = Math.sin(s.rot);
    return { x: s.x + lx * c - ly * sn, y: s.y + lx * sn + ly * c };
  }
  function worldToLocal(s, p) {
    const dx = p.x - s.x, dy = p.y - s.y;
    const c = Math.cos(-s.rot), sn = Math.sin(-s.rot);
    return { x: dx * c - dy * sn, y: dx * sn + dy * c };
  }
  // Handles keep a constant on-screen size, so offsets are in css px
  function handlePositions(s) {
    const { w, h } = stickerDims(s);
    const m = 8 / editor.view.scale, off = 32 / editor.view.scale;
    return {
      del: localToWorld(s, -w / 2 - m, -h / 2 - m),
      resize: localToWorld(s, w / 2 + m, h / 2 + m),
      rotate: localToWorld(s, 0, -h / 2 - m - off),
    };
  }

  function drawSelection(ctx, s) {
    const { w, h } = stickerDims(s);
    const u = 1 / editor.view.scale; // one css pixel in logical units
    const m = 8 * u, off = 32 * u;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    ctx.lineWidth = 2 * u;
    ctx.setLineDash([6 * u, 4 * u]);
    ctx.strokeStyle = C.cherry;
    ctx.strokeRect(-w / 2 - m, -h / 2 - m, w + 2 * m, h + 2 * m);
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(0, -h / 2 - m); ctx.lineTo(0, -h / 2 - m - off); ctx.stroke();
    ctx.restore();

    const hp = handlePositions(s);
    const r = 13 * u;
    const knob = (p, fill) => {
      ctx.fillStyle = C.ink;
      circle(ctx, p.x + 2 * u, p.y + 2 * u, r); ctx.fill();
      ctx.fillStyle = fill;
      circle(ctx, p.x, p.y, r); ctx.fill();
      ctx.lineWidth = 2.5 * u;
      ctx.strokeStyle = C.ink;
      ctx.stroke();
    };
    ctx.save();
    ctx.lineCap = 'round';
    // delete ×
    knob(hp.del, C.cherry);
    ctx.strokeStyle = C.cream;
    ctx.beginPath();
    ctx.moveTo(hp.del.x - 5 * u, hp.del.y - 5 * u); ctx.lineTo(hp.del.x + 5 * u, hp.del.y + 5 * u);
    ctx.moveTo(hp.del.x + 5 * u, hp.del.y - 5 * u); ctx.lineTo(hp.del.x - 5 * u, hp.del.y + 5 * u);
    ctx.stroke();
    // resize ⤡
    knob(hp.resize, C.butter);
    ctx.strokeStyle = C.ink;
    ctx.beginPath();
    ctx.moveTo(hp.resize.x - 5 * u, hp.resize.y - 5 * u); ctx.lineTo(hp.resize.x + 5 * u, hp.resize.y + 5 * u);
    ctx.moveTo(hp.resize.x + 5 * u, hp.resize.y); ctx.lineTo(hp.resize.x + 5 * u, hp.resize.y + 5 * u); ctx.lineTo(hp.resize.x, hp.resize.y + 5 * u);
    ctx.stroke();
    // rotate ↻
    knob(hp.rotate, C.pink);
    ctx.strokeStyle = C.ink;
    ctx.beginPath();
    ctx.arc(hp.rotate.x, hp.rotate.y, 6 * u, -Math.PI * 0.2, Math.PI * 1.3);
    ctx.stroke();
    ctx.restore();
  }

  /* =========================================================
     14. EDITOR
     ========================================================= */
  const strip = $('#strip');
  const stage = $('#stage');
  const panel = $('#panel');

  // Coalesce redraws into one per animation frame
  function requestRender() {
    if (editor.rafId) return;
    editor.rafId = requestAnimationFrame(() => {
      editor.rafId = 0;
      drawDisplay();
    });
  }

  function drawDisplay() {
    if (state.screen !== 'editor' || !design.photos.length || !editor.stageW) return;
    const L = computeLayout();
    const v = editor.view;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    v.scale = Math.min(editor.stageW / L.W, MAX_VIEW_SCALE);
    v.k = v.scale * dpr;
    v.W = L.W;
    v.H = L.H;
    const pw = Math.round(L.W * v.k), ph = Math.round(L.H * v.k);
    if (strip.width !== pw || strip.height !== ph) {
      strip.width = pw;
      strip.height = ph;
      strip.style.width = `${L.W * v.scale}px`;
      strip.style.height = `${L.H * v.scale}px`;
    }
    render(strip.getContext('2d'), v.k, true, L);
  }

  // Measure the stage without reading layout inside the render loop
  new ResizeObserver(([entry]) => {
    editor.stageW = Math.floor(entry.contentRect.width);
    requestRender();
  }).observe(stage);

  async function openEditor() {
    await Promise.all([fontsReady, stickersReady]);
    Object.assign(design, {
      layout: fitLayout(state.settings.layout, design.photos.length),
      frame: 'ticket',
      bg: FRAMES.ticket.bg,
      stickers: [],
      strokes: [],
      shotDate: new Date(),
      order: 1000 + Math.floor(Math.random() * 9000),
    });
    editor.history = [];
    editor.selected = null;
    selectTab(tabs[0]); // also puts the pen down
    show('editor');
    syncUI();
  }

  /* --- panel construction --- */
  const editorPicker = createLayoutPicker($('#editor-layouts'), 'editor-layout', setLayout);

  function buildChips(root, items, onPick) {
    root.append(...items.map(({ id, name }) => el('button', {
      className: 'chip', text: name,
      attrs: { type: 'button', 'aria-pressed': 'false' },
      dataset: { value: id },
      on: { click: () => onPick(id) },
    })));
  }

  function buildSwatches(root, colors, prefix, onPick) {
    root.append(...colors.map(([col, name]) => el('button', {
      className: 'swatch',
      attrs: { type: 'button', 'aria-pressed': 'false', 'aria-label': `${prefix} ${name}`, title: name },
      dataset: { value: col },
      style: { '--c': col },
      on: { click: () => onPick(col) },
    })));
  }

  // Reflect the current value in a group of toggle buttons
  function syncPressed(root, isOn) {
    root.querySelectorAll('[data-value]').forEach(b => b.setAttribute('aria-pressed', String(isOn(b.dataset.value))));
  }

  function buildPanel() {
    buildChips($('#frame-chips'), Object.entries(FRAMES).map(([id, f]) => ({ id, name: f.name })), id => edit(() => {
      design.frame = id;
      design.bg = FRAMES[id].bg;
    }));
    buildChips($('#filter-chips'), FILTERS, id => edit(() => {
      design.photos.forEach(p => { p.filter = id; });
    }));
    buildChips($('#font-chips'), CAPTION_FONTS, id => {
      design.captionFont = id;
      syncUI(); requestRender();
    });
    buildSwatches($('#bg-swatches'), BG_SWATCHES, 'Background', col => edit(() => { design.bg = col; }));
    buildSwatches($('#pen-swatches'), PEN_COLORS, 'Pen colour', col => {
      editor.pen.color = col;
      setTool('pen');
      syncUI();
    });

    $('#sticker-grid').append(...STICKERS.map((def, i) => {
      let face;
      if (def.kind === 'img') face = el('img', { attrs: { src: def.url || 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(def.svg), alt: '' } });
      else if (def.kind === 'emoji') face = el('span', { text: def.text });
      else face = el('span', { className: 'word', text: def.text, style: { '--c': def.color } });
      return el('button', {
        className: 'sticker-btn',
        attrs: { type: 'button', 'aria-label': `Add ${def.label || def.text} sticker` },
        style: { '--r': `${(i % 3 - 1) * 4}deg` },
        on: { click: () => addSticker(def) },
      }, [face]);
    }));
  }

  // Reflect state in the panel controls
  function syncUI() {
    syncPressed($('#frame-chips'), v => v === design.frame);
    const filters = new Set(design.photos.map(p => p.filter));
    syncPressed($('#filter-chips'), v => filters.size === 1 && filters.has(v));
    syncPressed($('#font-chips'), v => v === design.captionFont);
    syncPressed($('#bg-swatches'), v => v.toLowerCase() === design.bg.toLowerCase());
    syncPressed($('#pen-swatches'), v => v === editor.pen.color);
    editorPicker.update(design.photos.length, design.layout);
    $('#editor-layout-hint').textContent = LAYOUTS.grid.supports(design.photos.length) ? '' : `${LAYOUTS.grid.name} needs exactly 4 photos.`;
    $('#bg-custom').value = design.bg;
    $('#caption').value = design.caption;
    $('#opt-date').checked = design.showDate;
    $('#song-title').value = design.song;
    $('#song-artist').value = design.artist;
    $('#btn-undo').disabled = !editor.history.length;
  }

  // Every undoable change goes through here
  function edit(mutate) {
    pushHistory();
    mutate();
    syncUI();
    requestRender();
  }

  /* --- layout switching (no retake needed) --- */
  function setLayout(id) {
    if (id === design.layout || !LAYOUTS[id].supports(design.photos.length)) return syncUI();
    edit(() => {
      const before = computeLayout();
      design.layout = id;
      remapArt(before, computeLayout());
    });
  }

  // Keep stickers + doodles in roughly the same place when the canvas changes size
  function remapArt(a, b) {
    const sx = b.W / a.W, sy = b.H / a.H;
    design.stickers.forEach(s => { s.x *= sx; s.y *= sy; });
    design.strokes.forEach(st => st.points.forEach(p => { p.x *= sx; p.y *= sy; }));
  }

  /* --- tabs (ARIA tabs with arrow-key support) --- */
  const tabs = $$('#tabs [role="tab"]');

  function selectTab(tab, focus = false) {
    tabs.forEach(t => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(`#${t.getAttribute('aria-controls')}`).hidden = !on;
    });
    if (focus) tab.focus();
    setSheetCollapsed(false);
    // the Draw tab picks up the pen; leaving it puts the pen down
    setTool(tab.id === 'tab-draw' ? 'pen' : 'select');
  }

  tabs.forEach(t => t.addEventListener('click', () => selectTab(t)));
  $('#tabs').addEventListener('keydown', e => {
    const i = tabs.indexOf(document.activeElement);
    const next = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (i < 0 || next == null) return;
    e.preventDefault();
    selectTab(tabs[(next + tabs.length) % tabs.length], true);
  });

  // Mobile bottom sheet can fold down to just the tab bar
  function setSheetCollapsed(collapsed) {
    panel.classList.toggle('is-collapsed', collapsed);
    $('#sheet-handle').setAttribute('aria-expanded', String(!collapsed));
  }
  $('#sheet-handle').addEventListener('click', () => setSheetCollapsed(!panel.classList.contains('is-collapsed')));

  /* --- text + colour inputs --- */
  $('#caption').addEventListener('input', e => { design.caption = e.target.value; requestRender(); });
  $('#opt-date').addEventListener('change', e => { design.showDate = e.target.checked; requestRender(); });
  $('#song-title').addEventListener('input', e => { design.song = e.target.value; requestRender(); });
  $('#song-artist').addEventListener('input', e => { design.artist = e.target.value; requestRender(); });
  // live preview while dragging the picker, one undo step per pick
  $('#bg-custom').addEventListener('focus', () => { $('#bg-custom').dataset.before = snapshot(); });
  $('#bg-custom').addEventListener('input', e => { design.bg = e.target.value; syncUI(); requestRender(); });
  $('#bg-custom').addEventListener('change', e => { pushHistory(e.target.dataset.before); e.target.dataset.before = snapshot(); syncUI(); });

  /* --- pen tool --- */
  function setTool(tool) {
    editor.tool = tool;
    const on = tool === 'pen';
    if (on) editor.selected = null;
    const btn = $('#btn-pen');
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = on ? '✎ Pen on' : '✎ Pen off';
    strip.classList.toggle('pen-mode', on);
    updateTouchAction();
    requestRender();
  }
  $('#btn-pen').addEventListener('click', () => setTool(editor.tool === 'pen' ? 'select' : 'pen'));
  $('#pen-size').addEventListener('input', e => {
    editor.pen.size = +e.target.value;
    $('#pen-size-out').textContent = e.target.value;
  });
  $('#btn-clear-doodles').addEventListener('click', () => {
    if (design.strokes.length) edit(() => { design.strokes = []; });
  });

  /* --- undo history --- */
  function snapshot() {
    return JSON.stringify({
      layout: design.layout,
      frame: design.frame,
      bg: design.bg,
      stickers: design.stickers,
      strokes: design.strokes,
      filters: design.photos.map(p => p.filter),
    });
  }
  function pushHistory(snap = snapshot()) {
    if (!snap || editor.history[editor.history.length - 1] === snap) return;
    editor.history.push(snap);
    if (editor.history.length > HISTORY_LIMIT) editor.history.shift();
    $('#btn-undo').disabled = false;
  }
  function undo() {
    const snap = editor.history.pop();
    if (!snap) return;
    const s = JSON.parse(snap);
    Object.assign(design, { layout: s.layout, frame: s.frame, bg: s.bg, stickers: s.stickers, strokes: s.strokes });
    s.filters.forEach((f, i) => { if (design.photos[i]) design.photos[i].filter = f; });
    selectSticker(null);
    syncUI();
  }
  $('#btn-undo').addEventListener('click', undo);

  /* --- stickers --- */
  // Centre of the part of the strip currently visible in the stage
  function visibleCentre() {
    const r = strip.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    const v = editor.view;
    const top = Math.max(r.top, sr.top), bot = Math.min(r.bottom, sr.bottom);
    const left = Math.max(r.left, sr.left), right = Math.min(r.right, sr.right);
    return {
      x: right > left ? ((left + right) / 2 - r.left) / r.width * v.W : v.W / 2,
      y: bot > top ? ((top + bot) / 2 - r.top) / r.height * v.H : v.H / 2,
    };
  }

  function addSticker(def) {
    pushHistory();
    const v = editor.view, c = visibleCentre();
    const s = {
      def: def.id,
      x: clamp(c.x + rand(-100, 100), 60, v.W - 60),
      y: clamp(c.y + rand(-40, 40), 60, v.H - 60),
      size: def.kind === 'word' ? 70 : 110,
      rot: rand(-0.3, 0.3),
      aspect: stickerAspect(def),
    };
    design.stickers.push(s);
    if (editor.tool === 'pen') setTool('select');
    selectSticker(s);
    beep(1200, 0.05, 'square', 0.05);
  }

  function selectSticker(s) {
    editor.selected = s;
    updateTouchAction();
    requestRender();
  }

  function deleteSelected() {
    const sel = editor.selected;
    if (!sel) return;
    pushHistory();
    design.stickers = design.stickers.filter(s => s !== sel);
    selectSticker(null);
  }

  // Let the page scroll on touch unless we're dragging a sticker or drawing
  function updateTouchAction() {
    strip.style.touchAction = (editor.tool === 'pen' || editor.selected) ? 'none' : 'pan-y';
  }

  function hitSticker(p) {
    for (let i = design.stickers.length - 1; i >= 0; i--) {
      const s = design.stickers[i];
      const l = worldToLocal(s, p);
      const { w, h } = stickerDims(s);
      if (Math.abs(l.x) <= w / 2 && Math.abs(l.y) <= h / 2) return s;
    }
    return null;
  }

  function hitHandle(s, p) {
    const hp = handlePositions(s);
    const r = 22 / editor.view.scale;
    return ['del', 'resize', 'rotate'].find(k => Math.hypot(p.x - hp[k].x, p.y - hp[k].y) <= r) || null;
  }

  function toLogical(e) {
    const r = strip.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * editor.view.W, y: (e.clientY - r.top) / r.height * editor.view.H };
  }

  /* --- pointer interactions on the strip --- */
  strip.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const p = toLogical(e);

    if (editor.tool === 'pen') {
      pushHistory();
      const stroke = { color: editor.pen.color, size: editor.pen.size, points: [p] };
      design.strokes.push(stroke);
      editor.drag = { type: 'pen', stroke };
      strip.setPointerCapture(e.pointerId);
      requestRender();
      return;
    }

    const sel = editor.selected;
    if (sel) {
      const h = hitHandle(sel, p);
      if (h === 'del') return deleteSelected();
      if (h) {
        editor.drag = {
          type: h, s: sel, before: snapshot(),
          startSize: sel.size, startRot: sel.rot,
          startDist: Math.max(1, Math.hypot(p.x - sel.x, p.y - sel.y)),
          startAngle: Math.atan2(p.y - sel.y, p.x - sel.x),
        };
        strip.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
    }

    const hit = hitSticker(p);
    if (hit) {
      const before = snapshot();
      design.stickers = design.stickers.filter(s => s !== hit).concat(hit); // bring to front
      selectSticker(hit);
      editor.drag = { type: 'move', s: hit, before, ox: p.x - hit.x, oy: p.y - hit.y };
      strip.setPointerCapture(e.pointerId);
      e.preventDefault();
    } else {
      selectSticker(null);
    }
  });

  strip.addEventListener('pointermove', e => {
    const d = editor.drag;
    if (!d) return;
    const p = toLogical(e), s = d.s, v = editor.view;
    if (d.type === 'pen') {
      const pts = d.stroke.points, last = pts[pts.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) > 1.5) pts.push(p);
    } else if (d.type === 'move') {
      s.x = clamp(p.x - d.ox, -40, v.W + 40);
      s.y = clamp(p.y - d.oy, -40, v.H + 40);
    } else if (d.type === 'resize') {
      s.size = clamp(d.startSize * Math.hypot(p.x - s.x, p.y - s.y) / d.startDist, 24, 520);
    } else if (d.type === 'rotate') {
      s.rot = d.startRot + Math.atan2(p.y - s.y, p.x - s.x) - d.startAngle;
    }
    requestRender();
  });

  const endDrag = () => {
    const d = editor.drag;
    if (d && d.before && d.before !== snapshot()) pushHistory(d.before);
    editor.drag = null;
  };
  strip.addEventListener('pointerup', endDrag);
  strip.addEventListener('pointercancel', endDrag);

  /* --- shuffle chaos --- */
  $('#btn-shuffle').addEventListener('click', () => {
    edit(() => {
      const ids = Object.keys(FRAMES);
      design.frame = pick(ids.filter(id => id !== design.frame));
      design.bg = Math.random() < 0.5 ? FRAMES[design.frame].bg : pick(BG_SWATCHES)[0];
      const f = pick(FILTERS).id;
      design.photos.forEach(p => { p.filter = f; });
      design.captionFont = pick(CAPTION_FONTS).id;

      const L = computeLayout();
      design.stickers = range(4 + Math.floor(Math.random() * 4)).map(() => {
        const def = pick(STICKERS);
        return {
          def: def.id,
          x: rand(50, L.W - 50),
          y: rand(60, L.H - 80),
          size: def.kind === 'word' ? rand(55, 85) : rand(70, 150),
          rot: rand(-0.6, 0.6),
          aspect: stickerAspect(def),
        };
      });
      editor.selected = null;
    });
    beep(300, 0.08, 'sawtooth', 0.08);
    setTimeout(() => beep(900, 0.08, 'sawtooth', 0.08), 80);
  });

  function confirmRetake() {
    if (confirm('Retake your photos? This Photomatic strip will be lost.')) openBooth();
  }
  $('#btn-retake').addEventListener('click', confirmRetake);

  /* =========================================================
     15. EXPORT
     ========================================================= */
  const modal = $('#modal');

  // Same renderer as the screen, at 2x, with editing handles hidden
  function exportCanvas() {
    const L = computeLayout();
    const c = makeCanvas(Math.round(L.W * EXPORT_SCALE), Math.round(L.H * EXPORT_SCALE));
    render(c.getContext('2d'), EXPORT_SCALE, false, L);
    return { canvas: c, wide: L.W > L.H };
  }

  // photomatic-YYYY-MM-DD-HHMM.png
  function fileName(d = new Date()) {
    return `photomatic-${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}.png`;
  }

  async function finish() {
    selectSticker(null);
    setTool('select');
    const btn = $('#btn-finish');
    btn.disabled = true;
    try {
      const { canvas, wide } = exportCanvas();
      // pre-build the blob so the share sheet opens instantly on tap
      state.output.blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
      if (state.output.url) URL.revokeObjectURL(state.output.url);
      state.output.url = URL.createObjectURL(state.output.blob);
      $('#final-img').src = state.output.url;
      $('#final').classList.toggle('is-wide', wide);
      show('final');
    } catch (e) {
      toast('Something went wrong rendering your strip :(');
    } finally {
      btn.disabled = false;
    }
  }
  $('#btn-finish').addEventListener('click', finish);
  $('#btn-back-edit').addEventListener('click', () => show('editor'));

  async function deliver(blob, name) {
    const file = new File([blob], name, { type: 'image/png' });
    // On phones, the share sheet lets people save to camera roll / post to stories
    if (isCoarse() && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'My Photomatic strip' });
        return true;
      } catch (e) {
        if (e.name === 'AbortError') return false;
        // otherwise fall through to a plain download
      }
    }
    const url = URL.createObjectURL(blob);
    const a = el('a', { attrs: { href: url, download: name } });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  }

  $('#btn-download').addEventListener('click', async () => {
    if (!state.output.blob) return;
    if (!(await deliver(state.output.blob, fileName()))) return;
    jingle();
    modal.showModal();
    $('#btn-again').focus();
  });

  $('#btn-again').addEventListener('click', () => {
    modal.close();
    Object.assign(design, { photos: [], caption: '', song: '', artist: '', showDate: true, captionFont: 'script' });
    if (state.output.url) URL.revokeObjectURL(state.output.url);
    state.output.blob = state.output.url = null;
    show('landing');
  });

  function backToEditor() {
    modal.close();
    show('editor');
  }
  $('#btn-edit-more').addEventListener('click', backToEditor);
  // Esc on the dialog behaves like "Edit more"
  modal.addEventListener('cancel', e => { e.preventDefault(); backToEditor(); });

  /* =========================================================
     16. KEYBOARD
     ========================================================= */
  const isInteractive = t => !!(t && t.closest && t.closest('button, a, input, select, textarea, label, [role="tab"]'));
  const isTyping = t => !!(t && t.matches && t.matches('input[type="text"], textarea'));

  function editorKeys(e) {
    if (isTyping(e.target)) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    const sel = editor.selected;
    const nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];

    if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
      e.preventDefault();
      deleteSelected();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
    } else if (nudge && sel && !isInteractive(e.target)) {
      e.preventDefault();
      if (!e.repeat) pushHistory();
      const step = e.shiftKey ? 24 : 4;
      sel.x += nudge[0] * step;
      sel.y += nudge[1] * step;
      requestRender();
    } else if (e.key === 'Escape') {
      // peel back one layer at a time: selection → pen → leave
      if (sel) selectSticker(null);
      else if (editor.tool === 'pen') setTool('select');
      else confirmRetake();
    }
  }

  document.addEventListener('keydown', e => {
    if (modal.open) return; // the dialog handles its own keys
    switch (state.screen) {
      case 'booth':
        if ((e.key === ' ' || e.key === 'Enter') && !isInteractive(e.target)) {
          e.preventDefault();
          audio();
          runSession();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          leaveBooth();
        }
        break;
      case 'editor':
        editorKeys(e);
        break;
      case 'final':
        if (e.key === 'Escape') show('editor');
        break;
    }
  });

  /* =========================================================
     17. BOOT
     ========================================================= */
  buildPanel();
  readSettingsForm();
  refreshLandingPicker();
  fontsReady.then(requestRender);
})();
