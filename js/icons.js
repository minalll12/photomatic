/* One icon set: 24px grid, 1.75 stroke, round caps and joins. */
const P = {
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.4-2h5.8l1.4 2h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.5"/>',
  sliders: '<path d="M5 6h9M18 6h1M5 12h3M12 12h7M5 18h11M20 18h-1"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  keep: '<path d="M7 3.5h10v17l-5-3.5-5 3.5z"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  undo: '<path d="M9 14 4.5 9.5 9 5"/><path d="M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3"/>',
  redo: '<path d="M15 14l4.5-4.5L15 5"/><path d="M19.5 9.5H10a5.5 5.5 0 0 0 0 11h3"/>',
  surprise: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="8.5" cy="8.5" r=".6" fill="currentColor"/><circle cx="15.5" cy="15.5" r=".6" fill="currentColor"/><circle cx="12" cy="12" r=".6" fill="currentColor"/><circle cx="15.5" cy="8.5" r=".6" fill="currentColor"/><circle cx="8.5" cy="15.5" r=".6" fill="currentColor"/>',
  flip: '<path d="M12 3v18"/><path d="M8.5 7 4 17h4.5zM15.5 7 20 17h-4.5z"/>',
  duplicate: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  layerUp: '<path d="m12 4 8 4-8 4-8-4z"/><path d="m4 13 8 4 8-4" opacity=".45"/><path d="M12 21v-4"/>',
  layerDown: '<path d="m4 11 8 4 8-4"/><path d="m12 3 8 4-8 4-8-4z" opacity=".45"/><path d="M12 21v-6"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10.5 11v5.5M13.5 11v5.5"/>',
  pencil: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  retake: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9"/><path d="M4.5 4.5V9H9"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  crop: '<path d="M7 3v12.5A1.5 1.5 0 0 0 8.5 17H21"/><path d="M3 7h12.5A1.5 1.5 0 0 1 17 8.5V21"/>',
  rotate: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9"/><path d="M19.5 4.5V9H15"/>',
  upload: '<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="9" cy="9.5" r="1.5"/><path d="m4.5 17 4.5-4.5 3 3 2.5-2.5 5 5"/>',
  replay: '<path d="M8 5.5v13l10-6.5z"/>',
  album: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  video: '<rect x="3.5" y="6.5" width="12" height="11" rx="2"/><path d="m15.5 10.5 5-3v9l-5-3z"/>',
  story: '<rect x="6.5" y="3" width="11" height="18" rx="2"/><path d="M9.5 7.5h5M9.5 11h5"/>',
  frame: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><rect x="7.5" y="7.5" width="9" height="9"/>',
  filter: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>',
  sticker: '<path d="M20 13V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7z"/><path d="M13 20a7 7 0 0 1 7-7h-5a2 2 0 0 0-2 2z"/>',
  text: '<path d="M5 6.5V5h14v1.5M12 5v14M9 19h6"/>',
  heart: '<path d="M12 19.5s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.6-7.5 10-7.5 10z"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  soundOn: '<path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  soundOff: '<path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  shadow: '<rect x="4" y="4" width="12" height="12" rx="2"/><path d="M19 8.5V18a1 1 0 0 1-1 1H8.5" opacity=".55"/>',
};

export function icon(name, { size = 20, label } = {}) {
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ${a11y} focusable="false">${P[name] || ''}</svg>`;
}

// <span data-icon="camera"></span> in the HTML becomes the inline SVG
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(n => {
    n.innerHTML = icon(n.dataset.icon, { size: +(n.dataset.size || 20) });
    n.classList.add('i');
    n.removeAttribute('data-icon');
  });
}
