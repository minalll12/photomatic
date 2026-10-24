/* Boot + wiring: navigation, keyboard routing, idle pausing and the reveal actions. */
import { $, fontsReady, makeCanvas, canvasToBlob } from './utils.js';
import { state } from './state.js';
import { hydrateIcons, icon } from './icons.js';
import { show, onScreen, toast } from './ui.js';
import { audio, isMuted, setMuted } from './sound.js';
import { texturesReady } from './textures.js';
import { initHero } from './hero.js';
import { openBooth, boothBack, snapKey, stopCamera } from './booth.js';
import { editorKeys, requestRender, refreshPacks, openEditor } from './editor.js';
import { play, drawReveal, REVEAL_END, swapPolaroid } from './reveal.js';
import { drawFilteredPhoto } from './filters.js';
import { deliver, fileName, recordCanvas, videoSupport } from './export.js';
import { openStory } from './story.js';
import { saveStrip, renderAlbum } from './album.js';
import { loadStickerPacks } from './stickers.js';

hydrateIcons();

/* --- navigation --- */
const menu = $('#menu-sheet');
function setMenu(open) {
  menu.classList.toggle('is-open', open);
  $('#menu-toggle').setAttribute('aria-expanded', String(open));
}
$('#menu-toggle').addEventListener('click', () => setMenu(!menu.classList.contains('is-open')));

/* --- sound toggle (remembered on this device) --- */
const soundBtn = $('#sound-toggle');
function syncSound() {
  const on = !isMuted();
  soundBtn.setAttribute('aria-pressed', String(on));
  soundBtn.setAttribute('aria-label', on ? 'Sound effects on' : 'Sound effects off');
  soundBtn.innerHTML = icon(on ? 'soundOn' : 'soundOff', { size: 20 });
}
soundBtn.addEventListener('click', () => { setMuted(!isMuted()); syncSound(); });
syncSound();

async function go(where, { via } = {}) {
  setMenu(false);
  if (where === 'booth') { audio(); return openBooth({ via: via || (state.screen === 'home' ? 'zoom' : 'curtain') }); }
  stopCamera();
  if (where === 'album') return show('album', { via: 'tin' });
  if (where === 'how' || where === 'home') {
    await show('home');
    if (where === 'how') $('#how').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
}
document.addEventListener('click', e => {
  const link = e.target.closest('[data-nav]');
  if (!link) return;
  e.preventDefault();
  go(link.dataset.nav);
});

onScreen('album', renderAlbum);
onScreen('editor', requestRender);

/* --- reveal actions --- */
$('#btn-download').addEventListener('click', async () => {
  if (await deliver(state.output.blob, fileName())) toast('Strip downloaded.');
});
$('#btn-story').addEventListener('click', openStory);
$('#btn-replay').addEventListener('click', play);
$('#btn-polaroid').addEventListener('click', swapPolaroid);
$('#btn-reveal-edit').addEventListener('click', () => openEditor());
$('#btn-new-session').addEventListener('click', () => { state.design.caption = state.design.dedication = ''; openBooth(); });

// the photo on the reveal's polaroid (the contact sheet favourite), small, with the strip's filter
async function faveThumb() {
  const photos = state.design.photos, p = photos[state.output.polaroid % Math.max(1, photos.length)];
  if (!p) return null;
  const c = makeCanvas(160, 120);
  drawFilteredPhoto(c.getContext('2d'), p, state.design.filter, state.design.intensity, 0, 0, 160, 120);
  return canvasToBlob(c, 'image/jpeg', 0.85);
}

$('#btn-album-save').addEventListener('click', async e => {
  const btn = e.currentTarget, c = state.output.canvas;
  try {
    state.output.savedId = await saveStrip(state.output.blob, c.width, c.height, await faveThumb());
    btn.disabled = true;
    btn.querySelector('.btn-label').textContent = 'Saved to album';
    toast('Saved to your album on this device.');
  } catch {
    toast('This browser won’t let us save on this device.');
  }
});

const videoBtn = $('#btn-video');
if (!videoSupport()) videoBtn.title = 'Video export isn’t supported in this browser';
videoBtn.addEventListener('click', async () => {
  if (!videoSupport()) { toast('Video export isn’t supported in this browser. Try Chrome, Edge or Safari.'); return; }
  const label = videoBtn.querySelector('.btn-label'), original = label.textContent;
  videoBtn.disabled = true;
  const strip = state.output.canvas, scale = 1080 / 400, LH = 1920 / scale;
  try {
    const { blob, ext } = await recordCanvas(1080, 1920, 6, (ctx, t) => {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawReveal(ctx, 400, LH, Math.min(t, REVEAL_END), strip);
    }, p => { label.textContent = `Recording ${Math.round(p * 100)}%`; });
    await deliver(blob, fileName('', ext), 'My Photomatic reveal');
  } catch {
    toast('We couldn’t record the video in this browser.');
  } finally {
    label.textContent = original;
    videoBtn.disabled = false;
  }
});

/* --- keyboard: Space/Enter shoots, Esc goes back --- */
document.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]')) return;    // dialogs handle their own keys
  if (e.key === 'Escape' && menu.classList.contains('is-open')) { setMenu(false); $('#menu-toggle').focus(); return; }
  const interactive = e.target.closest && e.target.closest('button, a, input, select, textarea, label, [role="tab"]');
  switch (state.screen) {
    case 'booth':
      if ((e.key === ' ' || e.key === 'Enter') && !interactive) { e.preventDefault(); snapKey(); }
      else if (e.key === 'Escape') { e.preventDefault(); boothBack(); }
      break;
    case 'editor': editorKeys(e); break;
    case 'reveal': if (e.key === 'Escape') openEditor(); break;
    case 'album': if (e.key === 'Escape') show('home'); break;
  }
});

/* --- pause idle CSS animations when they are off-screen or the tab is hidden --- */
const marquee = $('.marquee');
if ('IntersectionObserver' in window) {
  new IntersectionObserver(([en]) => marquee.classList.toggle('is-paused', !en.isIntersecting)).observe(marquee);
}
document.addEventListener('visibilitychange', () => document.body.classList.toggle('is-paused', document.hidden));

/* --- boot --- */
const packsReady = loadStickerPacks();
initHero({ onEnter: () => go('booth', { via: 'zoom' }) }).catch(err => console.error('Hero decoration failed:', err));
Promise.all([packsReady, texturesReady]).then(refreshPacks);
fontsReady.then(requestRender);
if (location.hash === '#album') go('album');
else if (location.hash === '#booth') go('booth');
