/* Booth: the menu card, camera, countdown capture, per-shot retakes,
   upload fallback and the "developing" moment. */
import { updatePreview, previewReady } from './menu-preview.js';
import { $, $$, el, wait, pick, makeCanvas, restartAnimation, reducedMotion, pad2, isIOS, settleNow } from './utils.js';
import { state } from './state.js';
import { createLayoutPicker, LAYOUTS } from './layouts.js';
import { audio, countBeep, shutter, whirr, flashPop, punch, switchClick, thunk, click } from './sound.js';
import { show, onScreen, toast, confirmDialog } from './ui.js';
import { icon } from './icons.js';
import { startCamera, stopCamera as stopStream, capture } from './camera.js';
import { makeCroppable, applyCrop, slotAspect, shapeDiffers, MAX_SIDE } from './crop.js';
import { openAdjuster } from './adjuster.js';
import { faceHere } from './placeholders.js';
import { newDesign, openEditor } from './editor.js';
import { computeLayout, render, eachPhotoFrame } from './render.js';

const ASPECT = 4 / 3;            // every layout uses 4:3 photo slots
const PREVIEW_W = 640;           // review thumbnails

const PROMPTS = [
  'Look away, then back', 'Chin up, eyes soft', 'Laugh like you mean it', 'Lean in a little closer',
  'Eyes to the lens', 'Your best side, please', 'A little mischief', 'Over the shoulder',
  'Think of someone you love', 'Shoulders down, breathe out', 'Now a serious one', 'Close your eyes, then open',
];

/* Camera problems, in plain words: what happened, and what to do about it. The browser's own error
   text is never shown; its error name only picks one of these cards. */
function allowSteps() {
  const ua = navigator.userAgent;
  if (isIOS()) return ['Tap <b>aA</b> in the address bar, then <b>Website Settings</b>.', 'Set <b>Camera</b> to <b>Allow</b>.', 'Come back here and press <b>Try again</b>.'];
  if (/Android/.test(ua)) return ['Tap the icon to the left of the web address, then <b>Permissions</b>.', 'Turn <b>Camera</b> on.', 'Come back here and press <b>Try again</b>.'];
  if (/Firefox\//.test(ua)) return ['Click the crossed-out camera in the address bar.', 'Clear the block on <b>Use the camera</b>.', 'Press <b>Try again</b>.'];
  if (/Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)) return ['In the menu bar choose <b>Safari › Settings for This Website</b>.', 'Set <b>Camera</b> to <b>Allow</b>.', 'Press <b>Try again</b>.'];
  return ['Click the camera or settings icon at the left of the address bar.', 'Set <b>Camera</b> to <b>Allow</b>.', 'Press <b>Try again</b>. If nothing changes, reload the page.'];
}
const CAMERA_STATES = {
  denied: () => ({
    title: 'Camera access <em>needed</em>',
    reason: 'The booth uses your camera to take your photos, and right now this browser has it switched off for Photomatic. Nothing is recorded or uploaded: the camera is used only while you’re in the booth.',
    label: 'How to allow it', steps: allowSteps(),
  }),
  missing: () => ({
    title: 'No camera <em>found</em>',
    reason: 'We couldn’t find a camera on this device. If you use a separate webcam, it may be unplugged or covered.',
    label: 'Things to try', steps: ['Plug your camera in, or slide open its privacy cover.', 'Check it’s switched on in your system’s privacy settings.', 'Press <b>Try again</b>.'],
  }),
  busy: () => ({
    title: 'Camera is <em>busy</em>',
    reason: 'Another app or tab seems to be using your camera, so the booth can’t reach it.',
    label: 'Things to try', steps: ['Close video calls or other camera apps.', 'Close other tabs that are showing your camera.', 'Press <b>Try again</b>.'],
  }),
  unavailable: () => ({
    title: 'Camera not <em>available</em>',
    reason: window.isSecureContext ? 'This browser doesn’t offer camera access to websites.' : 'The camera only works when the page is opened over a secure (https) address.',
    label: 'Things to try', steps: window.isSecureContext ? ['Open Photomatic in an up-to-date Chrome, Edge, Firefox or Safari.', 'Or upload photos you already have.'] : ['Open the https:// address of Photomatic.', 'Or upload photos you already have.'],
  }),
  unknown: () => ({
    title: 'Camera didn’t <em>start</em>',
    reason: 'Something stopped the camera from starting. This is usually brief.',
    label: 'Things to try', steps: ['Press <b>Try again</b>.', 'If it keeps happening, reload the page or restart your browser.'],
  }),
};
const CAMERA_STATE_FOR = {
  NotAllowedError: 'denied', PermissionDeniedError: 'denied', SecurityError: 'denied',
  NotFoundError: 'missing', DevicesNotFoundError: 'missing', OverconstrainedError: 'missing',
  NotReadableError: 'busy', TrackStartError: 'busy', AbortError: 'busy',
  InsecureContext: 'unavailable', NotSupportedError: 'unavailable', TypeError: 'unavailable',
};

const dom = {
  setup: $('#booth-setup'), live: $('#booth-live'), review: $('#booth-review'), develop: $('#booth-develop'),
  form: $('#booth-form'), frame: $('#camera'), video: $('#video'), status: $('#camera-status'),
  counter: $('#shot-counter'), prompt: $('#pose-line'), countdown: $('#countdown'), countNum: $('#countdown-num'),
  flash: $('#flash'), snap: $('#btn-snap'), error: $('#cam-error'),
  announcer: $('#booth-announce'), thumbs: $('#review-grid'), file: $('#file-input'),
  tray: $('#shot-tray'), sweep: $('#countdown-sweep'),
  machine: $('#develop-machine'), lampText: $('#develop-lamp-text'),
};

function showCameraProblem(kind) {
  const s = CAMERA_STATES[kind] ? CAMERA_STATES[kind]() : CAMERA_STATES.unknown();
  dom.error.dataset.kind = kind;
  $('#cam-error-title').innerHTML = s.title;
  $('#cam-error-msg').textContent = s.reason;
  $('#cam-error-label').textContent = s.label;
  $('#cam-error-steps').replaceChildren(...s.steps.map(html => el('li', { html })));
}

export const stopCamera = () => stopStream(dom.video);
window.addEventListener('pagehide', stopCamera);

/* =========================================================
   Phases
   ========================================================= */
function setPhase(phase) {
  if (phase !== state.booth.phase) settleNow(document.body);
  state.booth.phase = phase;
  dom.frame.dataset.state = phase;
  dom.setup.hidden = phase !== 'setup';
  dom.live.hidden = !['loading', 'live', 'shooting', 'error'].includes(phase);
  dom.review.hidden = phase !== 'review';
  dom.develop.hidden = phase !== 'developing';
  // during a countdown the shutter stays pressed in rather than greyed out
  dom.snap.disabled = phase !== 'live' && phase !== 'shooting';
  dom.snap.setAttribute('aria-disabled', String(phase === 'shooting'));
  dom.error.hidden = phase !== 'error';
  dom.live.classList.toggle('is-error', phase === 'error');
  if (phase === 'loading') dom.status.textContent = 'Warming up the camera…';
  if (phase === 'live') dom.counter.innerHTML = `<span class="num">${state.settings.shots}</span> shots · <span class="num">${state.settings.timer}</span>s timer`;
  if (phase === 'loading' || phase === 'live') fillTray([]);
}
const announce = msg => { dom.announcer.textContent = msg; };

/* =========================================================
   Menu card
   ========================================================= */
const picker = createLayoutPicker($('#booth-layouts'), 'layout', id => { state.settings.layout = id; refreshPicker(); });

addEventListener('resize', () => { if (state.booth.phase === 'setup') { sameScale($('#booth-layouts')); updatePreview(); } });
function refreshPicker(note = '') {
  picker.update(state.settings.shots, state.settings.layout);
  $('#booth-layout-hint').textContent = note;
  sameScale($('#booth-layouts'));
}
// every layout illustration at one scale: the photos in each are drawn the same size, as large as
// lets every illustration fit its 64px box and its cell
function sameScale(root) {
  const thumbs = $$('.layout-thumb', root), svgs = thumbs.map(t => t.querySelector('svg'));
  const info = svgs.map(svg => {
    const v = svg && svg.viewBox.baseVal, o = svg && svg.querySelector('ellipse');
    return v && o ? { v, slot: +o.getAttribute('rx') / 0.16 } : null;
  });
  if (info.some(i => !i)) return;
  const maxW = Math.max(40, Math.min(...thumbs.map(t => t.clientWidth)) - 8);
  const photoW = Math.min(...info.map(({ v, slot }) => Math.min(64 / v.height, maxW / v.width) * slot));
  svgs.forEach((svg, i) => {
    const { v, slot } = info[i], k = photoW / slot;
    svg.style.width = `${(v.width * k).toFixed(1)}px`; svg.style.height = `${(v.height * k).toFixed(1)}px`;
  });
}

function readForm() {
  const s = state.settings, f = dom.form;
  s.shots = +$('input[name="shots"]:checked', f).value;
  s.timer = +$('input[name="timer"]:checked', f).value;
  s.prompts = $('input[name="prompts"]:checked', f).value === 'on';
  s.mirror = $('input[name="mirror"]:checked', f).value === 'on';
  dom.frame.classList.toggle('is-unmirrored', !s.mirror);
  syncMenu();
}

// the live preview (and its caption) shows the strip these choices make
function syncMenu() { updatePreview(); }

dom.form.addEventListener('change', e => {
  const t = e.target, s = state.settings;
  if (t.name === 'prompts' || t.name === 'mirror') switchClick(); else if (t.name === 'shots' || t.name === 'timer') punch();
  if (t.name === 'timer') s.timer = +t.value;
  else if (t.name === 'prompts') s.prompts = t.value === 'on';
  else if (t.name === 'mirror') { s.mirror = t.value === 'on'; dom.frame.classList.toggle('is-unmirrored', !s.mirror); }
  else if (t.name === 'shots') {
    s.shots = +t.value;
    let note = '';
    if (!LAYOUTS[s.layout].supports(s.shots)) {
      note = `${LAYOUTS[s.layout].name} needs 4 photos, so we've switched to ${LAYOUTS.strip.name}.`;
      s.layout = 'strip';
    }
    refreshPicker(note);
  }
  syncMenu();
});
dom.form.addEventListener('submit', e => { e.preventDefault(); audio(); thunk(); startLive(); });

/* =========================================================
   Entering / leaving
   ========================================================= */
export async function openBooth({ via = 'curtain' } = {}) {
  await previewReady;
  cancelCountdown();
  stopCamera();
  readForm();
  refreshPicker();
  setPhase('setup');
  return show('booth', { via });
}
// the preview and the layout illustrations are measured and drawn the moment the screen is swapped in,
// while the transition still covers it, so the menu is uncovered complete
onScreen('booth', () => { if (state.booth.phase === 'setup') { sameScale($('#booth-layouts')); updatePreview({ instant: true }); } });

async function startLive() {
  state.design.photos = [];
  setPhase('loading');
  try {
    await startCamera(dom.video);
    if (state.screen !== 'booth' || state.booth.phase !== 'loading') return stopCamera();
    setPhase('live');
    dom.snap.focus();
  } catch (err) {
    if (err.name === 'Superseded' || state.screen !== 'booth' || state.booth.phase !== 'loading') return;
    stopCamera();
    showCameraProblem(CAMERA_STATE_FOR[err && err.name] || 'unknown');
    setPhase('error');
    $('#btn-retry').focus({ preventScroll: true });
  }
}

export async function boothBack() {
  const p = state.booth.phase;
  if (p === 'developing') return finishDeveloping();
  if (p === 'setup') return show('home');
  if (p === 'review' && !(await confirmDialog({ title: 'Discard these photos?', body: "You'll go back to the booth menu.", ok: 'Discard' }))) return;
  cancelCountdown();
  stopCamera();
  setPhase('setup');
  requestAnimationFrame(() => { sameScale($('#booth-layouts')); updatePreview(); });
}


// settings from earlier versions (the ring light, then the screen flash) are no longer used
try { ['photomatic-flash', 'photomatic-ringlight'].forEach(k => localStorage.removeItem(k)); } catch { /* storage blocked */ }

/* =========================================================
   Shot tray: one empty print per shot under the shutter
   ========================================================= */
const TRAY_W = 96;
function trayThumb(li, p) {
  const c = makeCanvas(TRAY_W, Math.round(TRAY_W / ASPECT));
  const cx = c.getContext('2d');
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(p.src, 0, 0, c.width, c.height);
  li.replaceChildren(c);
  li.className = p.failed ? 'is-failed' : 'is-filled';
}
// the tray for this session, with any photos already taken (photos[i] may be empty)
function fillTray(photos) {
  dom.tray.replaceChildren(...Array.from({ length: photos.length || state.settings.shots }, (_, i) => {
    const li = el('li', { text: String(i + 1) });
    if (photos[i]) trayThumb(li, photos[i]);
    return li;
  }));
}
function dropIntoTray(i, p) {
  const li = dom.tray.children[i];
  if (!li) return;
  trayThumb(li, p);
  restartAnimation(li, 'drop-in');
}

/* =========================================================
   Capture
   ========================================================= */
// the shape of a photo slot in the chosen layout (every photo is cropped to it, non-destructively)
const slotShape = () => slotAspect(state.settings.layout, state.settings.shots);
// a photo keeps its original image and a crop record; its .src is the crop (see crop.js)
const makePhoto = img => makeCroppable(img, slotShape());
// A shot the camera couldn't deliver: never silently blank, it asks for a retake
const failedPhoto = i => ({ src: faceHere(1440, 1080, i), seed: i + 1, failed: true });

function cancelCountdown() {
  state.booth.session++;
  dom.countdown.classList.remove('is-on');
  dom.prompt.classList.remove('is-on');
}

// One countdown + flash. Resolves to a promise of the photo, or null if cancelled.
async function shoot(i, total) {
  const my = state.booth.session;
  const alive = () => my === state.booth.session && state.booth.stream;
  dom.counter.innerHTML = `Shot <span class="num">${i + 1}</span> of <span class="num">${total}</span>`;
  [...dom.tray.children].forEach((li, j) => li.classList.toggle('is-current', j === i));
  announce(`Shot ${i + 1} of ${total}`);
  if (state.settings.prompts) {
    dom.prompt.textContent = pick(PROMPTS);
    restartAnimation(dom.prompt, 'is-on');
  }
  dom.countdown.classList.add('is-on');
  for (let c = state.settings.timer; c >= 1; c--) {
    dom.countNum.textContent = c;
    restartAnimation(dom.countNum, 'pop');
    restartAnimation(dom.sweep, 'go');
    countBeep(c === 1);
    await wait(1000);
    if (!alive()) return null;
  }
  dom.countdown.classList.remove('is-on');
  dom.prompt.classList.remove('is-on');
  restartAnimation(dom.flash, 'go');
  shutter();
  flashPop();
  // the still develops in the background so the next countdown isn't held up
  const pending = capture(dom.video, { aspect: ASPECT, mirror: state.settings.mirror })
    .then(c => (c ? makePhoto(c) : failedPhoto(i)))
    .catch(() => failedPhoto(i));
  pending.then(p => { if (my === state.booth.session) dropIntoTray(i, p); });
  announce(`Photo ${i + 1} taken`);
  await wait(700);
  return alive() ? pending : null;
}

async function runAll() {
  if (state.booth.phase !== 'live') return;
  audio();
  const my = ++state.booth.session;
  setPhase('shooting');
  state.booth.fave = 0;
  const total = state.settings.shots;
  const pending = [];
  for (let i = 0; i < total; i++) {
    const p = await shoot(i, total);
    if (!p || my !== state.booth.session) return;
    pending.push(p);
  }
  dom.counter.textContent = 'Developing…';
  state.design.photos = await Promise.all(pending);
  if (my === state.booth.session) showReview();
}

async function retakeOne(i) {
  const my = ++state.booth.session;
  setPhase('shooting');
  fillTray(state.design.photos.map((p, j) => (j === i ? null : p)));
  await wait(400);
  const p = await shoot(i, state.design.photos.length);
  if (!p || my !== state.booth.session) return;
  state.design.photos[i] = await p;
  showReview(i);
}

export function snapKey() {
  if (state.booth.phase === 'live') runAll();
}

dom.snap.addEventListener('click', () => { if (state.booth.phase !== 'live') return; audio(); thunk(); runAll(); });
$('#btn-live-back').addEventListener('click', boothBack);
$('#btn-retry').addEventListener('click', startLive);

/* =========================================================
   Review: a contact print of the roll. Click a photo to circle it
   as the favourite; retake from the photo itself (or R)
   ========================================================= */
// a grease-pencil loop, a little lopsided, drawn over the print
const LOOP = 'M34 16 C84 2 164 4 190 32 C206 66 194 124 140 141 C88 154 20 146 9 104 C-1 64 18 30 60 12';

function showReview(focusIndex = 0) {
  setPhase('review');
  const photos = state.design.photos;
  if (!(state.booth.fave < photos.length)) state.booth.fave = 0;
  dom.thumbs.style.setProperty('--cols', Math.min(4, photos.length));
  dom.thumbs.dataset.count = photos.length;
  dom.thumbs.replaceChildren(...photos.map((p, i) => {
    const h = Math.round(PREVIEW_W / ASPECT);
    const thumb = makeCanvas(PREVIEW_W, h);
    const tx = thumb.getContext('2d');
    tx.imageSmoothingQuality = 'high';
    tx.drawImage(p.src, 0, 0, PREVIEW_W, h);
    const fave = i === state.booth.fave;
    const label = `Photo ${i + 1}${p.failed ? ", didn't come out" : ''}. Press R to retake${p.failed ? '' : ', A to adjust'}.`;
    return el('li', { className: `contact-frame${p.failed ? ' is-failed' : ''}${fave ? ' is-fave' : ''}` }, [
      el('div', { className: 'film-cell' }, [
        el('span', { className: 'edge-print', attrs: { 'aria-hidden': 'true' }, text: i === 0 ? 'PHOTOMATIC 400 ▸ 1' : `▸ ${i + 1}` }),
        el('button', {
          className: 'contact-print',
          attrs: { type: 'button', 'aria-label': label, 'aria-pressed': String(fave), 'aria-keyshortcuts': p.failed ? 'R' : 'R A' },
          on: {
            click: () => setFave(i),
            keydown: e => {
              if (e.key === 'r' || e.key === 'R') { e.preventDefault(); retakeOne(i); }
              else if ((e.key === 'a' || e.key === 'A') && !p.failed) { e.preventDefault(); adjustOne(i); }
            },
          },
        }, [thumb]),
        el('span', { className: 'contact-tools' }, [
          el('button', {
            className: 'retake-btn', attrs: { type: 'button', tabindex: '-1', 'aria-label': `Retake photo ${i + 1}` },
            html: `${icon('retake', { size: 14 })}<span>Retake</span>`, on: { click: () => retakeOne(i) },
          }),
          ...(p.failed ? [] : [el('button', {
            className: 'adjust-btn', attrs: { type: 'button', tabindex: '-1', 'aria-label': `Adjust photo ${i + 1}` },
            html: `${icon('crop', { size: 14 })}<span>Adjust</span>`, on: { click: () => adjustOne(i) },
          })]),
        ]),
        el('span', {
          className: 'fave-mark', attrs: { 'aria-hidden': 'true' },
          html: `<svg class="fave-loop" viewBox="0 0 200 150" preserveAspectRatio="none"><path d="${LOOP}" pathLength="1"/></svg><span class="fave-note">fave</span>`,
        }),
      ]),
      el('p', { className: 'contact-label' }, [
        el('span', { className: 'num', text: `No. ${pad2(i + 1)}` }),
        ...(p.failed ? [el('span', { className: 'retake-needed', text: 'Retake needed' })] : []),
      ]),
    ]);
  }));
  // carry on only once every frame came out
  const failed = photos.filter(p => p.failed).length;
  $('#btn-continue').disabled = failed > 0;
  $('#review-note').textContent = failed ? `${failed === 1 ? 'One frame' : `${failed} frames`} didn't come out. Retake ${failed === 1 ? 'it' : 'them'} to carry on.` : 'Retake any frame, or carry on and make it yours.';
  const firstFailed = photos.findIndex(p => p.failed);
  const btn = dom.thumbs.querySelectorAll('.contact-print')[firstFailed >= 0 ? firstFailed : focusIndex];
  (btn || $('#btn-continue')).focus({ preventScroll: true });
}

// crop & adjust from the contact sheet; the print redraws with the new crop
async function adjustOne(i) {
  const photos = state.design.photos, aspect = slotShape();
  if (!photos[i] || photos[i].failed) return;
  const res = await openAdjuster({ photos, index: i, aspect });
  if (res.applied) { res.crops.forEach((c, j) => applyCrop(photos[j], c, aspect)); showReview(i); }
  else dom.thumbs.querySelectorAll('.contact-print')[i]?.focus({ preventScroll: true });
}

// one favourite: the loop draws itself round the new one
function setFave(i) {
  if (i === state.booth.fave) return;
  state.booth.fave = i;
  [...dom.thumbs.children].forEach((li, j) => {
    li.classList.toggle('is-fave', j === i);
    li.classList.remove('draw');
    li.querySelector('.contact-print').setAttribute('aria-pressed', String(j === i));
  });
  restartAnimation(dom.thumbs.children[i], 'draw');
  announce(`Photo ${i + 1} circled as your favourite`);
}

$('#btn-retake-all').addEventListener('click', () => { setPhase('live'); runAll(); });
$('#btn-continue').addEventListener('click', () => { state.output.polaroid = state.booth.fave; stopCamera(); develop(); });

/* =========================================================
   Upload fallback
   ========================================================= */
$$('[data-action="upload"]').forEach(b => b.addEventListener('click', () => dom.file.click()));

dom.file.addEventListener('change', async () => {
  const want = state.settings.shots;
  const files = [...dom.file.files].filter(f => f.type.startsWith('image/')).slice(0, want);
  dom.file.value = '';
  if (!files.length) return;
  cancelCountdown();
  const photos = [];
  for (const f of files) {
    try {
      // the whole picture is kept (only scaled down past 4096px); the crop is just a record on top
      const bmp = await createImageBitmap(f);
      const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      const orig = makeCanvas(bmp.width * s, bmp.height * s);
      const ox = orig.getContext('2d'); ox.imageSmoothingQuality = 'high'; ox.drawImage(bmp, 0, 0, orig.width, orig.height);
      bmp.close && bmp.close();
      photos.push(makePhoto(orig));
    } catch { toast(`We couldn't read ${f.name}.`); }
  }
  if (!photos.length) return;
  if (photos.length < want) toast(`Using ${photos.length} photo${photos.length > 1 ? 's' : ''}.`);
  stopCamera();
  state.design.photos = photos;
  state.output.polaroid = 0;
  // a photo whose shape differs from the slot: offer the adjuster first (Next photo steps through them)
  const aspect = slotShape(), first = photos.findIndex(p => shapeDiffers(p.orig, aspect));
  if (first >= 0) {
    const res = await openAdjuster({ photos, index: first, aspect });
    if (res.applied) res.crops.forEach((c, j) => applyCrop(photos[j], c, aspect));
  }
  develop();
});

/* =========================================================
   Developing: the booth's print side. The strip feeds down out of the
   PRINTS slot while the photos come up from grey paper; the lamp on the
   sign turns from warm to a green READY, the strip drops free, and a
   strip of film advances to the editor
   ========================================================= */
let developTimer = 0;
const DEVELOPED_AT = 4000, LEAVE_AFTER = 1000;

async function develop() {
  await newDesign();
  const L = computeLayout();
  const scale = 1.25;
  const full = makeCanvas(L.W * scale, L.H * scale);
  render(full.getContext('2d'), scale, { L });
  const blank = makeCanvas(full.width, full.height);
  const b = blank.getContext('2d');
  b.drawImage(full, 0, 0);
  b.setTransform(scale, 0, 0, scale, 0, 0);
  eachPhotoFrame(b, L, (box, s) => { b.fillStyle = '#B9B2A8'; b.fillRect(-s.w / 2, -s.h / 2, s.w, s.h); });

  // a grey, low-contrast print in between, so the photos "come up" in the tray
  const grey = makeCanvas(full.width, full.height);
  const g = grey.getContext('2d');
  if ('filter' in g) g.filter = 'grayscale(1) contrast(.65) brightness(1.12)';
  g.drawImage(full, 0, 0);

  const wrap = $('#develop-strip'), m = dom.machine;
  m.style.setProperty('--ar', `${L.W} / ${L.H}`);
  m.style.setProperty('--arn', (L.W / L.H).toFixed(4));
  m.classList.toggle('is-wide', L.W > L.H);
  m.classList.remove('is-done');
  dom.lampText.textContent = 'Developing';
  blank.className = 'develop-paper';
  grey.className = 'develop-grey';
  full.className = 'develop-photo';
  wrap.replaceChildren(blank, grey, full);
  setPhase('developing');
  $('#develop-skip').focus({ preventScroll: true });

  const quick = reducedMotion();
  restartAnimation(wrap, 'is-printing');
  if (!quick) whirr(2.4);
  clearTimeout(developTimer);
  developTimer = setTimeout(() => {
    m.classList.add('is-done');
    dom.lampText.textContent = 'Ready';
    announce('Your strip is ready');
    if (!quick) click();
    developTimer = setTimeout(finishDeveloping, quick ? 600 : LEAVE_AFTER);
  }, quick ? 900 : DEVELOPED_AT);
}

function finishDeveloping() {
  if (state.booth.phase !== 'developing') return;
  clearTimeout(developTimer);
  state.booth.phase = 'leaving';
  let p;
  try { p = openEditor({ via: 'film' }); } catch (e) { console.error('openEditor', e); p = Promise.resolve(); }
  (p || Promise.resolve()).then(() => setPhase('setup')).catch(() => setPhase('setup'));
}
$('#develop-skip').addEventListener('click', finishDeveloping);
