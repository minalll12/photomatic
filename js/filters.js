/* Film looks. One WebGL fragment shader (canvas 2D fallback) does:
   white balance, skin-aware saturation, channel-mixed black & white,
   halation on warm stocks, per-channel tone curves (LUT), split toning,
   vignette and resolution-independent grain.
   Photos are filtered at the size they are drawn: small in the editor,
   full size for exports. Results are cached per photo. */
import { makeCanvas, range } from './utils.js';
import { state } from './state.js';

const NEUTRAL = [0.5, 0.5, 0.5];
// `tone` is the look's colour on the editor's swatch-fan prop
export const FILTERS = [
  {
    id: 'natural', tone: '#C79A74', name: 'Natural',
    warmth: 0.04, sat: 1.06, vignette: 0.1, grain: 0.012, grainSize: 1,
    curve: [[0, 0], [0.25, 0.235], [0.5, 0.5], [0.75, 0.77], [1, 1]],
  },
  {
    id: 'silver', tone: '#A3A09A', name: 'Silver',
    mono: [0.36, 0.54, 0.1], vignette: 0.22, grain: 0.035, grainSize: 1,
    curve: [[0, 0], [0.1, 0.045], [0.3, 0.24], [0.55, 0.56], [0.8, 0.85], [1, 0.98]],
    split: { shadow: [0.47, 0.5, 0.54], high: [0.53, 0.5, 0.47], amount: 0.5 },
  },
  {
    id: 'darkroom', tone: '#4A4541', name: 'Darkroom',
    mono: [0.52, 0.4, 0.08], vignette: 0.38, grain: 0.075, grainSize: 1.6,
    curve: [[0, 0], [0.15, 0.035], [0.4, 0.29], [0.6, 0.67], [0.85, 0.95], [1, 1]],
  },
  {
    id: 'warm400', tone: '#D4925A', name: 'Warm 400',
    warmth: 0.28, sat: 0.9, halation: 0.45, vignette: 0.18, grain: 0.03, grainSize: 1.2,
    curve: [[0, 0.04], [0.25, 0.255], [0.5, 0.53], [0.8, 0.82], [1, 0.97]],
    channels: { b: [[0, 0.02], [0.5, 0.48], [1, 0.94]] },
    split: { shadow: [0.5, 0.47, 0.45], high: [0.57, 0.5, 0.41], amount: 0.35 },
  },
  {
    id: 'sepia', tone: '#9C7048', name: 'Sepia Print',
    mono: [0.33, 0.55, 0.12], vignette: 0.3, grain: 0.04, grainSize: 1.3,
    curve: [[0, 0.07], [0.3, 0.28], [0.6, 0.62], [1, 0.93]],
    split: { shadow: [0.38, 0.24, 0.15], high: [0.62, 0.55, 0.43], amount: 1.3 },
  },
  {
    id: 'faded', tone: '#C2B8A8', name: 'Faded',
    warmth: 0.06, sat: 0.72, vignette: 0.12, grain: 0.03, grainSize: 1.1,
    curve: [[0, 0.12], [0.3, 0.33], [0.7, 0.7], [1, 0.92]],
    split: { shadow: [0.46, 0.49, 0.54], high: [0.54, 0.5, 0.46], amount: 0.5 },
  },
];
const BY_ID = new Map(FILTERS.map(f => [f.id, f]));

/* --- tone curves: monotone cubic through the control points --- */
function curveLUT(pts) {
  const n = pts.length, xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const d = range(n - 1).map(i => (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m = range(n).map(i => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : (d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2)));
  return range(256).map(k => {
    const x = k / 255;
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h;
    const t2 = t * t, t3 = t2 * t;
    const y = (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
    return Math.min(1, Math.max(0, y));
  });
}
const lutCache = new Map();
function lutFor(f) {
  if (lutCache.has(f.id)) return lutCache.get(f.id);
  const master = curveLUT(f.curve);
  const ch = ['r', 'g', 'b'].map(c => (f.channels && f.channels[c] ? curveLUT(f.channels[c]) : null));
  const data = new Uint8Array(256 * 4);
  for (let k = 0; k < 256; k++) {
    for (let c = 0; c < 3; c++) {
      let v = master[k];
      if (ch[c]) v = ch[c][Math.round(v * 255)];
      data[k * 4 + c] = Math.round(v * 255);
    }
    data[k * 4 + 3] = 255;
  }
  lutCache.set(f.id, data);
  return data;
}

/* =========================================================
   WebGL path
   ========================================================= */
const VERT = `attribute vec2 p; varying vec2 v;
void main(){ v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `precision highp float;
varying vec2 v;
uniform sampler2D img; uniform sampler2D lut;
uniform vec2 res;
uniform vec3 mixer; uniform float mono;
uniform float warmth, sat, halation, vignette, grain, grainSize, seed, amount, split, bright;
uniform vec3 shadowTint, highTint;
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 chroma(vec3 t){ return t - vec3(luma(t)); }
float hash(vec2 q){ q = fract(q * vec2(123.34, 456.21)); q += dot(q, q + 45.32 + seed); return fract(q.x * q.y); }
float vnoise(vec2 q){
  vec2 i = floor(q), f = fract(q); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main(){
  // brightness first, as a gentle gamma, so it applies at any intensity
  vec3 o = pow(texture2D(img, v).rgb, vec3(1.0 - bright));
  vec3 c = o;
  // skin: warm hues at moderate saturation are protected from big colour shifts
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float s = mx > 0.0 ? (mx - mn) / mx : 0.0;
  float hr = (c.g - c.b) / max(c.r - c.b, 0.001);
  float skin = step(c.b, c.g) * step(c.g, c.r) * smoothstep(0.1, 0.22, s) * (1.0 - smoothstep(0.62, 0.78, s))
             * smoothstep(0.15, 0.3, mx) * smoothstep(0.08, 0.22, hr) * (1.0 - smoothstep(0.78, 0.92, hr));
  float wk = warmth * (1.0 - skin * 0.5);
  c *= vec3(1.0 + wk * 0.10, 1.0 + wk * 0.012, 1.0 - wk * 0.12);
  float l = luma(c);
  c = mix(vec3(l), c, mix(sat, 1.0 + (sat - 1.0) * 0.35, skin));
  c = mix(c, vec3(dot(o, mixer)), mono);
  if (halation > 0.0) {
    float glow = 0.0;
    float r = 0.007 * res.x;
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 0.5236;
      vec2 d = vec2(cos(a), sin(a)) / res;
      glow += smoothstep(0.7, 1.0, luma(texture2D(img, v + d * r).rgb));
      glow += smoothstep(0.7, 1.0, luma(texture2D(img, v + d * r * 2.2).rgb)) * 0.6;
    }
    c += vec3(1.0, 0.34, 0.14) * (glow / 19.2) * halation * 0.55;
  }
  c = clamp(c, 0.0, 1.0) * (255.0 / 256.0) + 0.5 / 256.0;
  c = vec3(texture2D(lut, vec2(c.r, 0.5)).r, texture2D(lut, vec2(c.g, 0.5)).g, texture2D(lut, vec2(c.b, 0.5)).b);
  l = luma(c);
  c += chroma(shadowTint) * (1.0 - smoothstep(0.0, 0.55, l)) * split + chroma(highTint) * smoothstep(0.45, 1.0, l) * split;
  vec2 q = v - 0.5; float ar = res.x / res.y; q.x *= ar;
  c *= 1.0 - vignette * smoothstep(0.42, 1.05, length(q) / length(vec2(0.5 * ar, 0.5)));
  vec2 gp = v * vec2(900.0, 900.0 / ar) / grainSize;
  float n = (vnoise(gp) + vnoise(gp * 2.03 + 17.0) * 0.5 - 0.75) * 1.6;
  c += n * grain * (1.0 - abs(luma(c) - 0.5) * 1.3);
  gl_FragColor = vec4(mix(o, clamp(c, 0.0, 1.0), amount), 1.0);
}`;

let gl = null, glCanvas = null, prog = null, loc = null, texImg = null, texLut = null, glFailed = false;

function initGL() {
  if (glFailed) return null;
  if (gl && !gl.isContextLost()) return gl;
  try {
    glCanvas = document.createElement('canvas');
    gl = glCanvas.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false });
    if (!gl) throw new Error('no webgl');
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link failed');
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const p = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(p);
    gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
    loc = Object.fromEntries(['img', 'lut', 'res', 'mixer', 'mono', 'warmth', 'sat', 'halation', 'vignette', 'grain', 'grainSize', 'seed', 'amount', 'split', 'shadowTint', 'highTint', 'bright']
      .map(n => [n, gl.getUniformLocation(prog, n)]));
    const tex = () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return t;
    };
    texImg = tex(); texLut = tex();
    gl.uniform1i(loc.img, 0);
    gl.uniform1i(loc.lut, 1);
    glCanvas.addEventListener('webglcontextlost', e => { e.preventDefault(); gl = null; });
    return gl;
  } catch {
    glFailed = true;
    gl = null;
    return null;
  }
}

function renderGL(src, f, amount, seed, bright) {
  const g = initGL();
  if (!g) return null;
  const w = src.width, h = src.height;
  if (Math.max(w, h) > g.getParameter(g.MAX_TEXTURE_SIZE)) return null;
  glCanvas.width = w; glCanvas.height = h;
  g.viewport(0, 0, w, h);
  g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, true);
  g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, texImg);
  g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, src);
  g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false);
  g.activeTexture(g.TEXTURE1); g.bindTexture(g.TEXTURE_2D, texLut);
  g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, 256, 1, 0, g.RGBA, g.UNSIGNED_BYTE, lutFor(f));
  const sp = f.split || { shadow: NEUTRAL, high: NEUTRAL, amount: 0 };
  g.uniform2f(loc.res, w, h);
  g.uniform3fv(loc.mixer, f.mono || [0.2126, 0.7152, 0.0722]);
  g.uniform1f(loc.mono, f.mono ? 1 : 0);
  g.uniform1f(loc.warmth, f.warmth || 0);
  g.uniform1f(loc.sat, f.sat == null ? 1 : f.sat);
  g.uniform1f(loc.halation, f.halation || 0);
  g.uniform1f(loc.vignette, f.vignette || 0);
  g.uniform1f(loc.grain, f.grain || 0);
  g.uniform1f(loc.grainSize, f.grainSize || 1);
  g.uniform1f(loc.seed, (seed % 997) / 97);
  g.uniform1f(loc.amount, amount);
  g.uniform1f(loc.bright, bright);
  g.uniform1f(loc.split, sp.amount);
  g.uniform3fv(loc.shadowTint, sp.shadow);
  g.uniform3fv(loc.highTint, sp.high);
  g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
  const out = makeCanvas(w, h);
  out.getContext('2d').drawImage(glCanvas, 0, 0);
  return out;
}

/* =========================================================
   Canvas 2D fallback: the same maths per pixel (no halation)
   ========================================================= */
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

function render2D(src, f, amount, seed, bright) {
  const w = src.width, h = src.height;
  const out = makeCanvas(w, h);
  const x = out.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, 0, 0);
  const img = x.getImageData(0, 0, w, h), d = img.data, lut = lutFor(f);
  const mixer = f.mono || [0, 0, 0], mono = f.mono ? 1 : 0, warmth = f.warmth || 0, sat = f.sat == null ? 1 : f.sat;
  const sp = f.split || { shadow: NEUTRAL, high: NEUTRAL, amount: 0 };
  const chroma = t => { const l = luma(...t); return t.map(v => v - l); };
  const cs = chroma(sp.shadow), chh = chroma(sp.high);
  const ar = w / h, vmax = Math.hypot(0.5 * ar, 0.5), gs = f.grainSize || 1;
  for (let py = 0, i = 0; py < h; py++) {
    for (let px = 0; px < w; px++, i += 4) {
      const gm = 1 - bright;
      const or = Math.pow(d[i] / 255, gm), og = Math.pow(d[i + 1] / 255, gm), ob = Math.pow(d[i + 2] / 255, gm);
      let r = or, g = og, b = ob;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), s = mx > 0 ? (mx - mn) / mx : 0;
      const hr = (g - b) / Math.max(r - b, 0.001);
      const skin = (b <= g && g <= r ? 1 : 0) * smooth(0.1, 0.22, s) * (1 - smooth(0.62, 0.78, s)) * smooth(0.15, 0.3, mx) * smooth(0.08, 0.22, hr) * (1 - smooth(0.78, 0.92, hr));
      const wk = warmth * (1 - skin * 0.5);
      r *= 1 + wk * 0.1; g *= 1 + wk * 0.012; b *= 1 - wk * 0.12;
      let l = luma(r, g, b);
      const k = sat + (1 + (sat - 1) * 0.35 - sat) * skin;
      r = l + (r - l) * k; g = l + (g - l) * k; b = l + (b - l) * k;
      if (mono) { const m = or * mixer[0] + og * mixer[1] + ob * mixer[2]; r = g = b = m; }
      r = lut[Math.round(Math.min(1, Math.max(0, r)) * 255) * 4] / 255;
      g = lut[Math.round(Math.min(1, Math.max(0, g)) * 255) * 4 + 1] / 255;
      b = lut[Math.round(Math.min(1, Math.max(0, b)) * 255) * 4 + 2] / 255;
      l = luma(r, g, b);
      const ws = (1 - smooth(0, 0.55, l)) * sp.amount, wh = smooth(0.45, 1, l) * sp.amount;
      r += cs[0] * ws + chh[0] * wh; g += cs[1] * ws + chh[1] * wh; b += cs[2] * ws + chh[2] * wh;
      const u = px / w, vv = 1 - py / h, qx = (u - 0.5) * ar, qy = vv - 0.5;
      const vig = 1 - (f.vignette || 0) * smooth(0.42, 1.05, Math.hypot(qx, qy) / vmax);
      r *= vig; g *= vig; b *= vig;
      const gx = (u * 900) / gs, gy = (vv * 900) / ar / gs;
      const n = (vnoise(gx, gy, seed) + vnoise(gx * 2.03 + 17, gy * 2.03 + 17, seed) * 0.5 - 0.75) * 1.6;
      const gn = n * (f.grain || 0) * (1 - Math.abs(luma(r, g, b) - 0.5) * 1.3);
      d[i] = (or + (r + gn - or) * amount) * 255;
      d[i + 1] = (og + (g + gn - og) * amount) * 255;
      d[i + 2] = (ob + (b + gn - ob) * amount) * 255;
    }
  }
  x.putImageData(img, 0, 0);
  return out;
}

/* =========================================================
   Public: draw a photo filtered at the size it is drawn
   ========================================================= */
function sized(photo, pw) {
  const src = photo.src;
  if (pw >= src.width) return src;
  photo.sized ||= new Map();
  const bucket = Math.min(src.width, Math.ceil(pw / 64) * 64);
  if (!photo.sized.has(bucket)) {
    const c = makeCanvas(bucket, (bucket * src.height) / src.width);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, c.width, c.height);
    if (photo.sized.size > 4) photo.sized.delete(photo.sized.keys().next().value);
    photo.sized.set(bucket, c);
  }
  return photo.sized.get(bucket);
}

// `brightness` is the editor's -20..+20 slider
export function filtered(photo, id, amount, pw, brightness = 0) {
  const base = sized(photo, pw);
  const f = BY_ID.get(id) || FILTERS[0];
  if (amount <= 0 && !brightness) return base;
  const bright = (brightness / 100) * 1.2;
  photo.fcache ||= new Map();
  const key = `${f.id}|${amount.toFixed(2)}|${base.width}|${brightness}`;
  if (photo.fcache.has(key)) return photo.fcache.get(key);
  const out = renderGL(base, f, amount, photo.seed, bright) || render2D(base, f, amount, photo.seed, bright);
  if (photo.fcache.size > 6) photo.fcache.delete(photo.fcache.keys().next().value);
  photo.fcache.set(key, out);
  return out;
}

export function drawFilteredPhoto(ctx, photo, id, amount, x, y, w, h) {
  const t = ctx.getTransform();
  const pw = Math.ceil(w * Math.hypot(t.a, t.b));
  ctx.drawImage(filtered(photo, id, amount, pw, state.design.brightness || 0), x, y, w, h);
}

// Small preview for the filter cards
export function filterThumb(photo, id, w = 120) {
  const src = filtered(photo, id, 1, w);
  const c = makeCanvas(w, Math.round(w * 0.75));
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c;
}
