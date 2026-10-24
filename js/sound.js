/* Soft, synthesised sounds (Web Audio). Nothing is loaded from the network.
   On by default, never before the visitor's first interaction, and the
   mute choice is remembered on this device. */
let ctx = null;
let unlocked = false;
let muted = false;
try { muted = localStorage.getItem('photomatic-muted') === '1'; } catch { /* storage blocked */ }

export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('photomatic-muted', m ? '1' : '0'); } catch { /* storage blocked */ }
}

// the first pointer or key press unlocks audio (browsers require a gesture)
['pointerdown', 'keydown'].forEach(t => window.addEventListener(t, () => { unlocked = true; }, { once: true, capture: true }));

export function audio() {
  if (!unlocked || muted) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noiseBuffer(a, seconds) {
  const len = Math.floor(a.sampleRate * seconds);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
  return buf;
}

function tone(freq, dur, { type = 'sine', vol = 0.05, when = 0 } = {}) {
  const a = audio(); if (!a) return;
  const t = a.currentTime + when;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

// Short filtered noise burst
function tick(when, freq, gain, len = 0.05) {
  const a = audio(); if (!a) return;
  const s = a.createBufferSource();
  s.buffer = noiseBuffer(a, len);
  const f = a.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
  const g = a.createGain();
  const t = a.currentTime + when;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  s.connect(f).connect(g).connect(a.destination);
  s.start(t);
}

export const countBeep = last => tone(last ? 880 : 660, 0.12, { vol: 0.04 });

// A soft, muffled two-part shutter
export function shutter() {
  tick(0, 2400, 0.35, 0.04);
  tick(0.07, 1300, 0.28, 0.06);
  tone(140, 0.12, { type: 'triangle', vol: 0.08 });
}

export const click = () => tick(0, 1800, 0.18, 0.025);

// Mechanical whirr: low hum with a slow wobble
export function whirr(seconds = 1) {
  const a = audio(); if (!a) return;
  const t = a.currentTime;
  const s = a.createBufferSource();
  s.buffer = noiseBuffer(a, seconds);
  const f = a.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 520; f.Q.value = 4;
  const lfo = a.createOscillator(), lfoGain = a.createGain();
  lfo.frequency.value = 9; lfoGain.gain.value = 140;
  lfo.connect(lfoGain).connect(f.frequency);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.07, t + 0.08);
  g.gain.setValueAtTime(0.07, t + seconds - 0.12);
  g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  s.connect(f).connect(g).connect(a.destination);
  s.start(t); lfo.start(t); lfo.stop(t + seconds);
}

export function chime() {
  [784, 988, 1319].forEach((f, i) => tone(f, 0.5, { vol: 0.03, when: i * 0.09 }));
}

// Soft fabric / paper swish for the page transitions
export function swish(seconds = 0.4, freq = 900) {
  const a = audio(); if (!a) return;
  const t = a.currentTime;
  const s = a.createBufferSource();
  s.buffer = noiseBuffer(a, seconds);
  const f = a.createBiquadFilter();
  f.type = 'bandpass'; f.Q.value = 0.7;
  f.frequency.setValueAtTime(freq * 0.5, t);
  f.frequency.exponentialRampToValueAtTime(freq, t + seconds * 0.6);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, t + seconds * 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  s.connect(f).connect(g).connect(a.destination);
  s.start(t);
}

// A bright little pop as the flash fires
export function flashPop() {
  tick(0, 4200, 0.16, 0.03);
  tone(1800, 0.08, { type: 'triangle', vol: 0.025 });
}

// A ticket punch: a dull snap with a paper tick
export function punch() {
  tick(0, 900, 0.3, 0.04);
  tick(0.03, 3000, 0.12, 0.02);
}

// A brass toggle switch
export function switchClick() {
  tick(0, 2600, 0.22, 0.018);
  tone(420, 0.05, { type: 'square', vol: 0.015 });
}

// The big arcade button
export function thunk() {
  tone(90, 0.16, { type: 'triangle', vol: 0.1 });
  tick(0, 1200, 0.2, 0.05);
}
