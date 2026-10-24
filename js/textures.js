/* Static textures and attached props (wax seal, safety pin, clips).
   Everything is generated once at boot, or replaced by a real PNG from
   /assets/textures/ when one exists, then shared by CSS and the canvases. */
import { C, FONT, makeCanvas, mulberry32, range, svgUrl, loadImage, fontsReady, tracking } from './utils.js';

// Canvas-ready images, filled in by initTextures()
export const IMG = {};
// Their URLs, for SVG <image> patterns
export const TEX = {};

/* =========================================================
   Generated bitmaps (seeded, so they never change between loads)
   ========================================================= */
function speckle(ctx, w, h, rnd, rgb, maxA) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = rnd();
    d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2];
    d[i + 3] = v > 0.5 ? (v - 0.5) * 2 * maxA : 0;
  }
  ctx.putImageData(img, 0, 0);
}

// Draw fn at every wrap offset so a shape crossing an edge tiles cleanly
function wrapped(ctx, S, fn) {
  for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { ctx.save(); ctx.translate(ox, oy); fn(); ctx.restore(); }
}

// Grain is rendered once per strength as a small static tile.
// `peak` is the darkest speck; the visible average is about half of it.
export const GRAIN = { subtle: 0.05, paper: 0.09, strong: 0.14 };
function makeGrain(peak, fibres = 0) {
  const S = 256, c = makeCanvas(S, S), x = c.getContext('2d'), rnd = mulberry32(3);
  speckle(x, S, S, rnd, [42, 33, 28], Math.round(peak * 255));
  x.lineCap = 'round';
  for (let i = 0; i < fibres; i++) {
    const px = rnd() * S, py = rnd() * S, a = rnd() * Math.PI, l = 6 + rnd() * 16;
    x.strokeStyle = rnd() > 0.5 ? 'rgba(42,33,28,.04)' : 'rgba(255,255,255,.1)';
    x.lineWidth = 0.6;
    wrapped(x, S, () => { x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a) * l * 0.5 + 2, py + Math.sin(a) * l * 0.5, px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); });
  }
  return c;
}

function makeVelvet() {
  const S = 512, c = makeCanvas(S, S), x = c.getContext('2d'), rnd = mulberry32(9);
  x.fillStyle = C.oxblood;
  x.fillRect(0, 0, S, S);
  // crushed-velvet sheen: soft light and dark pools
  for (let i = 0; i < 46; i++) {
    const px = rnd() * S, py = rnd() * S, r = 40 + rnd() * 120, light = rnd() > 0.45;
    wrapped(x, S, () => {
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, light ? 'rgba(120,34,42,.16)' : 'rgba(12,2,4,.2)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(px - r, py - r, r * 2, r * 2);
    });
  }
  // vertical nap
  for (let col = 0; col < S; col++) {
    const v = rnd();
    x.fillStyle = v > 0.5 ? `rgba(140,48,56,${(v - 0.5) * 0.08})` : `rgba(0,0,0,${(0.5 - v) * 0.1})`;
    x.fillRect(col, 0, 1, S);
  }
  // fine pile
  const n = makeCanvas(S, S), nx = n.getContext('2d');
  speckle(nx, S, S, rnd, [0, 0, 0], 40);
  x.drawImage(n, 0, 0);
  return c;
}

function makeCrumple() {
  const S = 512, c = makeCanvas(S, S), x = c.getContext('2d'), rnd = mulberry32(17);
  // faceted light and shade
  for (let i = 0; i < 70; i++) {
    const cx = rnd() * S, cy = rnd() * S, pts = range(3).map(() => [cx + (rnd() - 0.5) * 240, cy + (rnd() - 0.5) * 240]);
    x.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(60,40,30,.045)';
    wrapped(x, S, () => { x.beginPath(); pts.forEach(([px, py], k) => (k ? x.lineTo(px, py) : x.moveTo(px, py))); x.fill(); });
  }
  // creases: a dark line with a light edge beside it
  for (let i = 0; i < 22; i++) {
    let px = rnd() * S, py = rnd() * S, a = rnd() * Math.PI * 2;
    const seg = range(6).map(() => { a += (rnd() - 0.5) * 0.9; px += Math.cos(a) * 30; py += Math.sin(a) * 30; return [px, py]; });
    const start = [seg[0][0] - Math.cos(a) * 30, seg[0][1] - Math.sin(a) * 30];
    wrapped(x, S, () => {
      [['rgba(70,50,40,.12)', 0], ['rgba(255,255,255,.22)', 1.2]].forEach(([col, off]) => {
        x.strokeStyle = col; x.lineWidth = 1;
        x.beginPath(); x.moveTo(start[0] + off, start[1] + off);
        seg.forEach(([qx, qy]) => x.lineTo(qx + off, qy + off));
        x.stroke();
      });
    });
  }
  return c;
}

function makeBrushed() {
  const W = 256, H = 128, c = makeCanvas(W, H), x = c.getContext('2d'), rnd = mulberry32(5);
  for (let y = 0; y < H; y++) {
    const v = rnd();
    x.fillStyle = v > 0.5 ? `rgba(255,255,255,${(v - 0.5) * 0.36})` : `rgba(0,0,0,${(0.5 - v) * 0.16})`;
    x.fillRect(0, y, W, 1);
  }
  for (let i = 0; i < 90; i++) {
    const y = rnd() * H, x0 = rnd() * W, l = 20 + rnd() * 120;
    x.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.12)';
    x.fillRect(x0, y, l, 0.6);
    x.fillRect(x0 - W, y, l, 0.6);
  }
  return c;
}

// Walnut for the writing desk: warm, muted, low-contrast grain that tiles
function makeWalnut() {
  const S = 512, c = makeCanvas(S, S), x = c.getContext('2d'), rnd = mulberry32(29);
  x.fillStyle = '#4A3123'; x.fillRect(0, 0, S, S);
  // long, gently wavy grain lines; the waves repeat every tile so it tiles cleanly
  for (let i = 0; i < 170; i++) {
    const y0 = rnd() * S, amp = 2 + rnd() * 7, ph = rnd() * Math.PI * 2, k = (Math.PI * 2 * (1 + Math.floor(rnd() * 2))) / S;
    const light = rnd() > 0.55;
    x.strokeStyle = light ? `rgba(150,105,70,${(0.05 + rnd() * 0.08).toFixed(3)})` : `rgba(25,14,8,${(0.06 + rnd() * 0.1).toFixed(3)})`;
    x.lineWidth = 0.6 + rnd() * 2.4;
    wrapped(x, S, () => {
      x.beginPath();
      for (let px = 0; px <= S; px += 8) {
        const py = y0 + Math.sin(px * k + ph) * amp;
        if (px) x.lineTo(px, py); else x.moveTo(px, py);
      }
      x.stroke();
    });
  }
  const n = makeCanvas(S, S);
  speckle(n.getContext('2d'), S, S, rnd, [20, 12, 6], 12);
  x.drawImage(n, 0, 0);
  return c;
}

/* Handwritten letter paper: cream laid paper with faded script lines */
const LETTER = [
  'My dearest,',
  'I found this strip in my coat pocket today',
  'and laughed the whole way home. Keep it safe',
  'for the rainy afternoons, and for me.',
  'The booth on the corner is still there,',
  'still humming, still a quarter a go.',
  'Let us go back soon and do it again,',
  'all four frames, no blinking this time.',
  'Always yours,',
];
function makeLetter() {
  const W = 720, H = 960, c = makeCanvas(W, H), x = c.getContext('2d');
  x.fillStyle = '#F2EADB';
  x.fillRect(0, 0, W, H);
  x.fillStyle = x.createPattern(IMG.grain, 'repeat');
  x.fillRect(0, 0, W, H);
  // laid-paper chain lines
  x.fillStyle = 'rgba(92,75,65,.05)';
  for (let px = 30; px < W; px += 60) x.fillRect(px, 0, 1, H);
  x.fillStyle = 'rgba(42,33,28,.5)';
  x.font = FONT.script(40);
  x.textBaseline = 'alphabetic';
  const rnd = mulberry32(21);
  LETTER.forEach((line, i) => {
    x.save();
    x.translate(56 + (i === 0 || i === LETTER.length - 1 ? 0 : 18), 120 + i * 88);
    x.rotate((rnd() - 0.5) * 0.012);
    x.fillText(line, 0, 0);
    x.restore();
  });
  return c;
}

/* =========================================================
   Props as static SVG
   ========================================================= */
// the blackletter P from the favicon, drawn in a 64 x 64 box
const P_GLYPH = 'M575 751Q596 768 611 753Q626 738 600 711Q560 675 508 664Q456 652 403 651Q243 647 137 746Q31 846 31 1018Q31 1189 164 1312Q297 1435 525 1435Q663 1432 757 1366Q851 1300 904 1210Q911 1196 925 1204L1358 1429Q1387 1442 1400 1426Q1413 1409 1393 1393Q1322 1342 1374 1252Q1427 1161 1546 1065Q1783 869 1770 666Q1758 463 1623 277Q1469 68 1319 0Q1169 -69 962 46Q954 51 946 47Q939 43 938 35Q923 -91 886 -176Q850 -261 775 -332Q761 -345 749 -336Q737 -327 747 -310Q824 -149 798 121Q798 130 788 134Q588 212 489 116Q472 99 456 110Q441 122 455 141Q611 344 759 356Q767 357 770 361Q774 365 774 374Q762 503 750 632Q737 760 725 889Q710 1035 626 1142Q542 1248 417 1250Q283 1257 191 1184Q99 1112 99 981Q99 850 184 774Q268 698 409 698Q510 696 575 751ZM938 1137Q955 1091 962 1045Q968 999 970 958Q976 745 968 597Q959 449 956 326Q956 314 965 311Q1014 289 1072 255Q1275 138 1394 162Q1514 186 1586 300Q1744 550 1389 837Q1268 933 1186 1022Q1103 1111 1097 1209Q1097 1221 1089 1224Q1081 1227 1073 1223L946 1157Q932 1150 938 1137Z';
export const glyphP = (fill, x = 0, y = 0, s = 1) =>
  `<g transform="translate(${x} ${y}) scale(${s})"><g transform="translate(5.5 48.5) scale(0.0302 -0.0302)" fill="${fill}"><path d="${P_GLYPH}"/></g></g>`;

const svg = (vb, body) => {
  const [, , w, h] = vb.split(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w}" height="${h}">${body}</svg>`;
};

function waxSealSVG() {
  const rnd = mulberry32(8), n = 16, c = 60;
  const pts = range(n).map(i => { const a = (i / n) * Math.PI * 2, r = 50 + rnd() * 7; return [c + Math.cos(a) * r, c + Math.sin(a) * r]; });
  let d = `M${((pts[0][0] + pts[n - 1][0]) / 2).toFixed(1)} ${((pts[0][1] + pts[n - 1][1]) / 2).toFixed(1)}`;
  pts.forEach((p, i) => { const q = pts[(i + 1) % n]; d += `Q${p[0].toFixed(1)} ${p[1].toFixed(1)} ${((p[0] + q[0]) / 2).toFixed(1)} ${((p[1] + q[1]) / 2).toFixed(1)}`; });
  return svg('0 0 120 120', `<defs>
    <radialGradient id="w" cx=".38" cy=".34" r=".75"><stop offset="0" stop-color="#A3262E"/><stop offset=".55" stop-color="#6E1A21"/><stop offset="1" stop-color="#3A0A0E"/></radialGradient>
    <radialGradient id="in" cx=".6" cy=".65" r=".7"><stop offset="0" stop-color="#7A1D25"/><stop offset="1" stop-color="#4A0F14"/></radialGradient></defs>
    <path d="${d}Z" fill="url(#w)"/>
    <circle cx="60" cy="60" r="35" fill="url(#in)"/>
    <circle cx="60" cy="60" r="35" fill="none" stroke="#2A0508" stroke-opacity=".55" stroke-width="2.5"/>
    <circle cx="60.8" cy="61" r="36.5" fill="none" stroke="#C4545C" stroke-opacity=".45" stroke-width="1.2"/>
    ${glyphP('#B4434C', 39.2, 40, 0.68)}${glyphP('#3A0A0E', 38, 38.6, 0.68)}
    <ellipse cx="40" cy="32" rx="14" ry="7" fill="#fff" opacity=".16" transform="rotate(-30 40 32)"/>`);
}

// gold wire, lit from the top left
const METAL = `<linearGradient id="mt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FBEBB8"/><stop offset=".45" stop-color="#B8934A"/><stop offset=".7" stop-color="#E9CF86"/><stop offset="1" stop-color="#7A5C24"/></linearGradient>`;
function safetyPinSVG() {
  return svg('0 0 220 64', `<defs>${METAL}</defs>
    <g fill="none" stroke-linecap="round">
      <path d="M30 34 C70 24 150 21 186 22" stroke="#6B4F1C" stroke-width="5.4"/>
      <path d="M30 34 C70 24 150 21 186 22" stroke="url(#mt)" stroke-width="4"/>
      <path d="M30 34 C70 46 150 47 196 43" stroke="#6B4F1C" stroke-width="5.4"/>
      <path d="M30 34 C70 46 150 47 196 43" stroke="url(#mt)" stroke-width="4"/>
      <path d="M44 31 C80 26 140 24 176 24" stroke="#fff" stroke-opacity=".6" stroke-width="1"/>
      <circle cx="21" cy="34" r="11" stroke="#6B4F1C" stroke-width="5.4"/>
      <circle cx="21" cy="34" r="11" stroke="url(#mt)" stroke-width="4"/>
      <circle cx="21" cy="34" r="5" stroke="url(#mt)" stroke-width="2.6"/>
    </g>
    <path d="M172 12 h26 a12 12 0 0 1 12 12 v12 a12 12 0 0 1 -12 12 h-14 q-8 0 -10 -8 l-6 -16 q-2 -12 4 -12z" fill="url(#mt)" stroke="#6B4F1C" stroke-width="1.6"/>
    <path d="M180 18 h16 a6 6 0 0 1 6 6" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="1.6"/>`);
}

function bulldogSVG() {
  return svg('0 0 120 110', `<defs>
    <linearGradient id="gd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6DE94"/><stop offset=".35" stop-color="#C9993C"/><stop offset=".6" stop-color="#EBCB72"/><stop offset="1" stop-color="#8C6420"/></linearGradient></defs>
    <g fill="none" stroke-linecap="round">
      <path d="M34 54 C26 30 30 8 46 6 C58 5 60 22 56 44" stroke="#6E4E18" stroke-width="5"/><path d="M34 54 C26 30 30 8 46 6 C58 5 60 22 56 44" stroke="url(#gd)" stroke-width="3.4"/>
      <path d="M86 54 C94 30 90 8 74 6 C62 5 60 22 64 44" stroke="#6E4E18" stroke-width="5"/><path d="M86 54 C94 30 90 8 74 6 C62 5 60 22 64 44" stroke="url(#gd)" stroke-width="3.4"/>
    </g>
    <path d="M14 50 h92 l-10 52 h-72z" fill="url(#gd)" stroke="#6E4E18" stroke-width="2"/>
    <path d="M18 56 h84" stroke="#fff" stroke-opacity=".55" stroke-width="2"/>
    <circle cx="30" cy="66" r="4" fill="#8C6420"/><circle cx="90" cy="66" r="4" fill="#8C6420"/>
    <circle cx="29" cy="65" r="1.5" fill="#FFF3C8"/><circle cx="89" cy="65" r="1.5" fill="#FFF3C8"/>`);
}

function pushpinSVG() {
  return svg('0 0 60 60', `<defs><radialGradient id="pp" cx=".38" cy=".32" r=".7"><stop offset="0" stop-color="#D2474F"/><stop offset=".6" stop-color="#9E1B22"/><stop offset="1" stop-color="#5E1C23"/></radialGradient></defs>
    <circle cx="30" cy="28" r="17" fill="url(#pp)"/>
    <circle cx="30" cy="28" r="10" fill="#9E1B22" stroke="#5E1C23" stroke-opacity=".5"/>
    <ellipse cx="24" cy="21" rx="5" ry="3" fill="#fff" opacity=".5" transform="rotate(-30 24 21)"/>`);
}

function starburstSVG() {
  const rnd = mulberry32(14), n = 16;
  const pts = (R, r) => range(n * 2).map(i => {
    const a = -Math.PI / 2 + (i * Math.PI) / n, rr = (i % 2 ? r : R) * (0.88 + rnd() * 0.24);
    return `${(50 + Math.cos(a) * rr).toFixed(1)},${(50 + Math.sin(a) * rr).toFixed(1)}`;
  }).join(' ');
  return svg('0 0 100 100', `<polygon points="${pts(48, 24)}" fill="${C.dusty}" stroke="#5F7489" stroke-width="1.5"/><polygon points="${pts(24, 12)}" fill="${C.cream}"/>`);
}

/* --- desk props for the editor (drawn when /assets/props/*.png is missing) --- */
function scissorsSVG() {
  return svg('0 0 220 120', `<defs>
    <linearGradient id="br" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F3D98B"/><stop offset=".5" stop-color="#B8934A"/><stop offset="1" stop-color="#7A5C24"/></linearGradient>
    <linearGradient id="st" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F4F4F0"/><stop offset=".5" stop-color="#A9A9A3"/><stop offset="1" stop-color="#6E6E68"/></linearGradient></defs>
    <path d="M92 52 L214 30 L216 36 L98 64Z" fill="url(#st)" stroke="#55554F" stroke-width="1"/>
    <path d="M92 68 L212 92 L210 98 L96 80Z" fill="url(#st)" stroke="#55554F" stroke-width="1"/>
    <path d="M120 50 L210 33" stroke="#fff" stroke-opacity=".6" stroke-width="1"/>
    <g fill="none" stroke="url(#br)" stroke-width="9"><ellipse cx="44" cy="36" rx="34" ry="24" transform="rotate(-14 44 36)"/><ellipse cx="44" cy="86" rx="34" ry="24" transform="rotate(14 44 86)"/></g>
    <g fill="none" stroke="#6B4F1C" stroke-width="1.2" opacity=".7"><ellipse cx="44" cy="36" rx="38.5" ry="28.5" transform="rotate(-14 44 36)"/><ellipse cx="44" cy="86" rx="38.5" ry="28.5" transform="rotate(14 44 86)"/></g>
    <path d="M74 44 L98 58 M74 78 L98 66" stroke="url(#br)" stroke-width="10" stroke-linecap="round"/>
    <circle cx="98" cy="62" r="7" fill="url(#br)" stroke="#6B4F1C" stroke-width="1.2"/><circle cx="96.5" cy="60.5" r="2" fill="#FBEBB8"/>`);
}
function washiRollSVG() {
  const rings = range(6).map(i => `<circle cx="70" cy="60" r="${50 - i * 4}" fill="none" stroke="#FFFFFF" stroke-opacity=".12"/>`).join('');
  const dots = range(8).map(i => `<circle cx="${(70 + Math.cos(i * 0.785) * 44).toFixed(1)}" cy="${(60 + Math.sin(i * 0.785) * 44).toFixed(1)}" r="4" fill="#F4EEE3" opacity=".7"/>`).join('');
  return svg('0 0 160 120', `<defs><radialGradient id="cr" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#E8DCC4"/><stop offset="1" stop-color="#B9A684"/></radialGradient></defs>
    <path d="M118 74 L156 96 L150 108 L112 86Z" fill="#9FB4C7" opacity=".9"/>
    <circle cx="70" cy="60" r="56" fill="#9FB4C7"/>
    <circle cx="70" cy="60" r="56" fill="none" stroke="#7E95A8" stroke-width="2"/>
    ${rings}${dots}
    <circle cx="70" cy="60" r="28" fill="url(#cr)" stroke="#8C7A5C" stroke-width="1.5"/>
    <circle cx="70" cy="60" r="20" fill="#2E1E14" opacity=".55"/>`);
}
function pencilSVG() {
  return svg('0 0 260 40', `<defs><linearGradient id="pb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D14A52"/><stop offset=".5" stop-color="#B3202A"/><stop offset="1" stop-color="#7A141A"/></linearGradient>
    <linearGradient id="fe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F3D98B"/><stop offset=".5" stop-color="#B8934A"/><stop offset="1" stop-color="#7A5C24"/></linearGradient></defs>
    <rect x="40" y="10" width="170" height="20" fill="url(#pb)"/>
    <path d="M40 16.5 H210 M40 23.5 H210" stroke="#000" stroke-opacity=".18"/>
    <rect x="22" y="9" width="20" height="22" fill="url(#fe)"/>
    <path d="M27 9 V31 M32 9 V31 M37 9 V31" stroke="#6B4F1C" stroke-opacity=".6"/>
    <rect x="6" y="10" width="17" height="20" rx="4" fill="#E8B4B8"/>
    <path d="M210 10 L246 20 L210 30Z" fill="#E2C49A"/>
    <path d="M236 17.2 L254 20 L236 22.8Z" fill="#2A211C"/>
    <text x="118" y="23.5" font-family="Special Elite, monospace" font-size="9" fill="#F4EEE3" letter-spacing="1.5">PHOTOMATIC No.2</text>`);
}
function stampsSVG() {
  const perf = (x, y, w, h) => {
    let d = '';
    for (let i = 0; i <= w; i += 8) d += `<circle cx="${x + i}" cy="${y}" r="2.6"/><circle cx="${x + i}" cy="${y + h}" r="2.6"/>`;
    for (let j = 8; j < h; j += 8) d += `<circle cx="${x}" cy="${y + j}" r="2.6"/><circle cx="${x + w}" cy="${y + j}" r="2.6"/>`;
    return d;
  };
  return svg('0 0 170 130', `<defs>
    <mask id="m1"><rect width="170" height="130" fill="#fff"/><g fill="#000">${perf(12, 30, 80, 96)}</g></mask>
    <mask id="m2"><rect width="170" height="130" fill="#fff"/><g fill="#000">${perf(70, 6, 88, 70)}</g></mask></defs>
    <g transform="rotate(-8 52 78)" mask="url(#m1)"><rect x="12" y="30" width="80" height="96" fill="#F7F1E4"/><rect x="20" y="38" width="64" height="68" fill="#9FB4C7"/>
      <path d="M52 52 l5 11 12 1 -9 8 3 12 -11 -6 -11 6 3 -12 -9 -8 12 -1Z" fill="#F4EEE3"/>
      <text x="52" y="118" text-anchor="middle" font-family="Special Elite, monospace" font-size="9" fill="#5E1C23">25¢ POST</text></g>
    <g transform="rotate(10 114 41)" mask="url(#m2)"><rect x="70" y="6" width="88" height="70" fill="#F7F1E4"/><rect x="78" y="14" width="72" height="42" fill="#E8B4B8"/>
      <path d="M114 24 c-8 -9 -20 2 0 16 c20 -14 8 -25 0 -16Z" fill="#B3202A"/>
      <text x="114" y="68" text-anchor="middle" font-family="Special Elite, monospace" font-size="9" fill="#5E1C23">AIR MAIL</text></g>`);
}

const PROPS = {
  waxSeal: waxSealSVG,
  safetyPin: safetyPinSVG,
  bulldog: bulldogSVG,
  pushpin: pushpinSVG,
  starburst: starburstSVG,
  scissors: scissorsSVG,
  washiRoll: washiRollSVG,
  pencil: pencilSVG,
  stamps: stampsSVG,
};
export const propUrl = (name, ...args) => svgUrl(PROPS[name](...args));

/* =========================================================
   Boot: prefer real PNGs from /assets/textures/
   ========================================================= */
const asset = name => loadImage(`assets/textures/${name}.png`).catch(() => null);
const DESK_PROPS = [['scissors', 'scissors'], ['washi-tape', 'washiRoll'], ['pencil', 'pencil'], ['stamps', 'stamps']];
const blobUrl = canvas => new Promise(res => canvas.toBlob(b => res(URL.createObjectURL(b)), 'image/png'));
const setVar = (name, url) => document.documentElement.style.setProperty(name, `url("${url}")`);

export const texturesReady = (async () => {
  const [grain, velvet, crumple, brushed, letter, walnut, ...props] = await Promise.all([
    asset('paper-grain'), asset('velvet'), asset('crumpled-paper'), asset('brushed-metal'),
    asset('letter-paper'), asset('walnut'),
    ...DESK_PROPS.map(([file]) => loadImage(`assets/props/${file}.png`).catch(() => null)),
  ]);
  IMG.grain = grain || makeGrain(GRAIN.paper, 14);
  IMG.velvet = velvet || makeVelvet();
  IMG.crumple = crumple || makeCrumple();
  IMG.brushed = brushed || makeBrushed();

  const [uGrain, uVelvet, uCrumple, uBrushed] = await Promise.all([
    grain ? grain.src : blobUrl(IMG.grain), velvet ? velvet.src : blobUrl(IMG.velvet),
    crumple ? crumple.src : blobUrl(IMG.crumple), brushed ? brushed.src : blobUrl(IMG.brushed),
  ]);
  Object.assign(TEX, { grain: uGrain, velvet: uVelvet, crumple: uCrumple, brushed: uBrushed });
  // three grain strengths, each one small static tile
  setVar('--tex-grain-subtle', await blobUrl(makeGrain(GRAIN.subtle)));
  setVar('--tex-grain-strong', await blobUrl(makeGrain(GRAIN.strong, 20)));
  setVar('--tex-walnut', walnut ? walnut.src : await blobUrl(makeWalnut()));
  // desk props: real PNGs from /assets/props/ when present, otherwise drawn
  DESK_PROPS.forEach(([file, prop], i) => setVar(`--img-${file}`, props[i] ? props[i].src : propUrl(prop)));
  setVar('--tex-grain', uGrain);
  setVar('--tex-velvet', uVelvet);
  setVar('--tex-crumple', uCrumple);
  setVar('--tex-brushed', uBrushed);

  ['waxSeal', 'safetyPin', 'bulldog', 'pushpin', 'starburst'].forEach(n => setVar(`--img-${n.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}`, propUrl(n)));
  [IMG.waxSeal, IMG.safetyPin, IMG.bulldog] = await Promise.all([loadImage(propUrl('waxSeal')), loadImage(propUrl('safetyPin')), loadImage(propUrl('bulldog'))]);

  // the letter needs Pinyon Script, so it comes last
  await fontsReady;
  IMG.letter = letter || makeLetter();
  setVar('--tex-letter', letter ? letter.src : await blobUrl(IMG.letter));
})();

/* =========================================================
   Canvas helpers shared by frames, reveal and story
   ========================================================= */
// Letter paper fitted into a rect (cover), with a soft lift shadow
export function drawLetterPaper(ctx, x, y, w, h, { shadow = true } = {}) {
  ctx.save();
  if (shadow) {
    ctx.shadowColor = 'rgba(20,6,8,.35)';
    ctx.shadowBlur = Math.max(w, h) * 0.03;
    ctx.shadowOffsetY = Math.max(w, h) * 0.012;
  }
  ctx.fillStyle = '#F2EADB';
  ctx.fillRect(x, y, w, h);
  ctx.shadowColor = 'transparent';
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const L = IMG.letter;
  if (L) {
    const s = Math.max(w / L.width, h / L.height) * 0.9;
    ctx.drawImage(L, x, y, L.width * s, L.height * s);
  }
  ctx.restore();
}

// Paper grain on top of whatever is already in the rect
export function grainOver(ctx, x, y, w, h, alpha = 1) {
  if (!IMG.grain) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = ctx.createPattern(IMG.grain, 'repeat');
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

// Safety pin drawn across a point, length in canvas units
export function drawSafetyPin(ctx, x, y, length, rot = 0) {
  const img = IMG.safetyPin;
  if (!img) return;
  const h = (length * 64) / 220;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.shadowColor = 'rgba(20,6,8,.4)';
  ctx.shadowBlur = length * 0.05;
  ctx.shadowOffsetY = length * 0.03;
  ctx.drawImage(img, -length / 2, -h / 2, length, h);
  ctx.restore();
}

export function drawWaxSeal(ctx, x, y, size, rot = 0) {
  const img = IMG.waxSeal;
  if (!img) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.shadowColor = 'rgba(20,6,8,.4)';
  ctx.shadowBlur = size * 0.08;
  ctx.shadowOffsetY = size * 0.04;
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
}

// Typewritten label (used by story templates)
export function typeLabel(ctx, text, x, y, size, color = C.ink, align = 'center') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = FONT.type(size);
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  tracking(ctx, size * 0.06);
  ctx.fillText(text, x, y);
  ctx.restore();
}
