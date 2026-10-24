/* My Album: strips stored only in this browser (IndexedDB). */
import { $, el, fileStamp } from './utils.js';
import { icon } from './icons.js';
import { toast, confirmDialog } from './ui.js';
import { deliver } from './export.js';
import { faceHereStrip } from './placeholders.js';

const DB = 'photomatic', STORE = 'strips';
let dbPromise = null;

function db() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB unavailable'));
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
  });
}

// fave: a small JPEG of the photo circled on the contact sheet, tucked in beside the strip
export const saveStrip = (blob, width, height, fave = null) => tx('readwrite', s => s.add({ blob, width, height, fave, created: Date.now() }));
const listStrips = () => tx('readonly', s => s.getAll());
const removeStrip = id => tx('readwrite', s => s.delete(id));
const clearStrips = () => tx('readwrite', s => s.clear());

// The most recent saved strip (local only), for the hero's wall frame
export async function latestStrip() {
  try {
    const items = await listStrips();
    items.sort((x, y) => y.created - x.created);
    return items[0] ? items[0].blob : null;
  } catch { return null; }
}

/* --- UI --- */
const grid = $('#album-grid');
const viewer = $('#album-viewer');
let urls = [];
let current = null;

const nameFor = item => `photomatic-${fileStamp(new Date(item.created))}.png`;
const prettyDate = ts => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export async function renderAlbum() {
  urls.forEach(u => URL.revokeObjectURL(u));
  urls = [];
  let items = [];
  try { items = (await listStrips()).sort((a, b) => b.created - a.created); }
  catch { toast('Your browser is blocking on-device storage, so the album is unavailable.'); }
  $('#album-empty').hidden = items.length > 0;
  if (!items.length) {
    const c = $('#album-empty-strip');
    c.getContext('2d').drawImage(faceHereStrip(c.width, c.height, 4), 0, 0);
  }
  $('#btn-album-clear').hidden = items.length === 0;
  grid.replaceChildren(...items.map(item => {
    const url = URL.createObjectURL(item.blob);
    urls.push(url);
    const faveUrl = item.fave ? URL.createObjectURL(item.fave) : null;
    if (faveUrl) urls.push(faveUrl);
    return el('li', { className: 'album-item' }, [
      el('button', {
        className: 'album-open', attrs: { type: 'button', 'aria-label': `Open strip from ${prettyDate(item.created)}` },
        on: { click: () => openItem(item, url) },
      }, [
        el('img', { attrs: { src: url, alt: '', loading: 'lazy', width: item.width, height: item.height } }),
        ...(faveUrl ? [el('span', { className: 'album-fave' }, [el('img', { attrs: { src: faveUrl, alt: '', loading: 'lazy', width: 160, height: 120 } })])] : []),
      ]),
      el('div', { className: 'album-meta' }, [
        el('span', { className: 'num', text: prettyDate(item.created) }),
        el('span', { className: 'album-actions' }, [
          el('button', { className: 'icon-btn', attrs: { type: 'button', 'aria-label': 'Download', title: 'Download' }, html: icon('download', { size: 18 }), on: { click: () => deliver(item.blob, nameFor(item)) } }),
          el('button', { className: 'icon-btn', attrs: { type: 'button', 'aria-label': 'Delete', title: 'Delete' }, html: icon('trash', { size: 18 }), on: { click: () => deleteItem(item) } }),
        ]),
      ]),
    ]);
  }));
}

function openItem(item, url) {
  current = item;
  $('#viewer-img').src = url;
  $('#viewer-date').textContent = prettyDate(item.created);
  viewer.showModal();
}

async function deleteItem(item) {
  if (!(await confirmDialog({ title: 'Delete this strip?', body: 'It will be removed from this device.', ok: 'Delete' }))) return;
  await removeStrip(item.id);
  if (viewer.open) viewer.close();
  renderAlbum();
}

$('#viewer-close').addEventListener('click', () => viewer.close());
$('#viewer-download').addEventListener('click', () => current && deliver(current.blob, nameFor(current)));
$('#viewer-delete').addEventListener('click', () => current && deleteItem(current));
$('#btn-album-clear').addEventListener('click', async () => {
  if (!(await confirmDialog({ title: 'Clear the whole album?', body: 'Every saved strip will be removed from this device. This can’t be undone.', ok: 'Clear album' }))) return;
  await clearStrips();
  renderAlbum();
  toast('Album cleared.');
});
