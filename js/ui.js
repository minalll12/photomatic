/* Screens, heading swashes, toasts and dialogs. */
import { $, $$ } from './utils.js';
import { state } from './state.js';
import { play } from './transitions.js';

const screens = {
  home: $('#screen-home'),
  booth: $('#screen-booth'),
  editor: $('#screen-editor'),
  reveal: $('#screen-reveal'),
  album: $('#screen-album'),
};
const listeners = {};
export const onScreen = (name, fn) => { (listeners[name] ||= []).push(fn); };

// Swap screens behind a transition (see transitions.js for the kinds)
export async function show(name, { via = 'fade', scroll = 0 } = {}) {
  const next = screens[name];
  const changed = screens[state.screen] !== next;
  state.screen = name;
  const swap = () => {
    Object.values(screens).forEach(s => { s.hidden = s !== next; });
    document.body.dataset.screen = name;
    $$('[data-nav]').forEach(a => a.toggleAttribute('aria-current', a.dataset.nav === name));
    if (changed) {
      window.scrollTo(0, scroll);
      const heading = next.querySelector('[data-focus]');
      if (heading) heading.focus({ preventScroll: true });
    }
    (listeners[name] || []).forEach(fn => fn());
  };
  if (changed) await play(via, swap, next);
  else swap();
}

/* --- headings: a red-pencil swash under the italic word draws itself in --- */
const SWASH = '<svg class="swash" viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path pathLength="1" d="M3 13 C40 6 80 15 118 9 C146 5 170 8 197 6"/><path pathLength="1" d="M8 16 C52 10 96 17 140 12 C160 10 178 11 192 10"/></svg>';
$$('.title em').forEach(em => em.insertAdjacentHTML('beforeend', SWASH));
const swashIO = 'IntersectionObserver' in window ? new IntersectionObserver(entries => entries.forEach(en => {
  if (en.isIntersecting) { en.target.classList.add('is-drawn'); swashIO.unobserve(en.target); }
}), { threshold: 0.6 }) : null;
$$('.title em').forEach(em => (swashIO ? swashIO.observe(em) : em.classList.add('is-drawn')));

/* --- toast + confirm --- */
export function toast(msg, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, ms);
}

// Promise-based confirm using a styled <dialog>
export function confirmDialog({ title, body, ok = 'Confirm', cancel = 'Cancel' }) {
  const d = $('#confirm-dialog');
  $('#confirm-title').textContent = title;
  $('#confirm-body').textContent = body;
  $('#confirm-ok').textContent = ok;
  $('#confirm-cancel').textContent = cancel;
  d.showModal();
  $('#confirm-cancel').focus();
  return new Promise(resolve => {
    const done = v => () => { d.close(); cleanup(); resolve(v); };
    const yes = done(true), no = done(false);
    const onCancel = e => { e.preventDefault(); no(); };
    function cleanup() {
      $('#confirm-ok').removeEventListener('click', yes);
      $('#confirm-cancel').removeEventListener('click', no);
      d.removeEventListener('cancel', onCancel);
    }
    $('#confirm-ok').addEventListener('click', yes);
    $('#confirm-cancel').addEventListener('click', no);
    d.addEventListener('cancel', onCancel);
  });
}
