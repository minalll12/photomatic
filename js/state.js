/* The single source of truth. Modules read and write this object;
   nothing else holds app data. */
import { C } from './utils.js';

export const state = {
  screen: 'home',               // 'home' | 'booth' | 'editor' | 'reveal' | 'album'

  // Chosen on the booth menu
  settings: { shots: 4, timer: 3, layout: 'strip', prompts: true, mirror: true },

  // Camera + capture
  booth: {
    phase: 'setup',             // 'setup' | 'loading' | 'live' | 'shooting' | 'review' | 'error' | 'developing' | 'leaving'
    stream: null,
    camToken: 0,                // bumps to discard a stale getUserMedia result
    session: 0,                 // bumps to cancel a running countdown
    fave: 0,                    // the photo circled on the contact sheet: the reveal's polaroid
  },

  // The strip being made: undo snapshots this (minus photos) and every export renders it
  design: {
    photos: [],                 // { src: full-size canvas, seed, sized, fcache }
    layout: 'strip',
    frame: 'booth',
    variants: {},               // frame id -> colour variant id
    double: false,              // Booth Black as a double strip
    filmPaper: false,
    to: '',                     // Love Letter envelope
    from: '',
    filter: 'natural',
    intensity: 1,
    brightness: 0,              // editor slider, -20..+20
    bg: { color: C.cream, pattern: 'solid' },
    date: { show: true, style: 'typewriter', text: '' },   // empty text = auto from shotDate
    caption: '',
    dedication: '',
    stickers: [],               // { uid, def, x, y, w, rot, flip, shadow, text, variant }
    shotDate: new Date(),
  },

  // Editor-only UI state (never exported)
  editor: {
    tab: 'frame',
    pack: 'type',
    selected: null,             // uid of the selected sticker
    history: [],
    future: [],
    drag: null,
    pointers: new Map(),
    view: { scale: 1, k: 1, W: 600, H: 1000 },  // css px / unit, canvas px / unit, logical size
    stageW: 0,
    rafId: 0,
  },

  // The finished strip
  output: { canvas: null, blob: null, savedId: null, polaroid: 0 },

  // Story collage: its own copies of the words, so editing them never changes the strip
  story: { template: 'pinned', pattern: 'solid', dedication: '', date: '' },
};
