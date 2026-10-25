/* Crop & adjust: non-destructive. Every photo keeps its original image (`orig`) and a crop record:
     { cx, cy, zoom, angle, quarter, flip }
   - the image frame is the original turned by `quarter` × 90° and then mirrored when `flip` is set;
   - cx, cy: the crop window's centre in that frame, as a fraction of its width and height from the middle;
   - zoom: 1 = the largest window of the slot's shape that fits, up to 3;
   - angle: straighten, -15..15 degrees.
   `photo.src` is always rebuilt from these at full resolution, so the strip, every export and the
   album use exactly the same crop. The window always lies inside the photo (no empty edges). */
import { makeCanvas } from './utils.js';
import { LAYOUTS } from './layouts.js';

export const MAX_SIDE = 4096;
export const ZOOM_MAX = 3, ANGLE_MAX = 15;
export const defaultCrop = () => ({ cx: 0, cy: 0, zoom: 1, angle: 0, quarter: 0, flip: false });
export const isDefaultCrop = c => !c || (!c.cx && !c.cy && c.zoom === 1 && !c.angle && !c.quarter && !c.flip);

// width / height of a photo slot in this layout (every layout uses one shape for all its slots)
export function slotAspect(layoutId, n = 4) {
  const lay = LAYOUTS[layoutId] || LAYOUTS.strip;
  const count = lay.supports(n) ? n : 4;
  const s = lay.arrange(count, 600, 24).slots[0];
  return s.w / s.h;
}

// size of the image frame (after the quarter turns)
export const frameSize = (img, c) => (c.quarter % 2 ? { w: img.height, h: img.width } : { w: img.width, h: img.height });

// The crop window for this crop: its size in image pixels and its centre in the image frame,
// clamped so the (straightened) window stays inside the photo. Returns a corrected copy of the crop too.
export function cropGeometry(img, crop, aspect) {
  const c = { ...defaultCrop(), ...crop };
  const { w: W, h: H } = frameSize(img, c);
  const t = (c.angle * Math.PI) / 180, cos = Math.abs(Math.cos(t)), sin = Math.abs(Math.sin(t));
  // the largest window of this shape that fits the turned photo, centred
  const baseH = Math.min(W / (aspect * cos + sin), H / (aspect * sin + cos));
  c.zoom = Math.min(ZOOM_MAX, Math.max(1, c.zoom));
  const h = baseH / c.zoom, w = h * aspect;
  // how far the window's corners reach in the image frame, so its centre can move only that far
  const ex = (w / 2) * cos + (h / 2) * sin, ey = (w / 2) * sin + (h / 2) * cos;
  const mx = Math.max(0, W / 2 - ex) / W, my = Math.max(0, H / 2 - ey) / H;
  c.cx = Math.min(mx, Math.max(-mx, c.cx));
  c.cy = Math.min(my, Math.max(-my, c.cy));
  return { crop: c, W, H, w, h, x: c.cx * W, y: c.cy * H, angle: t };
}

// Draw the photo as seen through the crop window: the window fills (0, 0, outW, outH)
export function drawCropped(ctx, img, crop, aspect, outW, outH) {
  const g = cropGeometry(img, crop, aspect);
  const k = outH / g.h;
  ctx.save();
  ctx.translate(outW / 2, outH / 2);
  ctx.scale(k, k);
  ctx.rotate(g.angle);
  ctx.translate(-g.x, -g.y);
  imageFrame(ctx, img, g.crop);
  ctx.restore();
  return g;
}

// the original, drawn centred at the origin in the image frame (quarter turns, then the mirror)
export function imageFrame(ctx, img, c) {
  ctx.save();
  if (c.flip) ctx.scale(-1, 1);
  ctx.rotate((c.quarter * Math.PI) / 2);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}

// Rebuild photo.src from the original and its crop, at full resolution (never upscaled)
export function applyCrop(photo, crop, aspect) {
  if (!photo || !photo.orig) return photo;
  const g = cropGeometry(photo.orig, crop, aspect);
  photo.crop = g.crop;
  photo.aspect = aspect;
  const s = Math.min(1, MAX_SIDE / Math.max(g.w, g.h));
  const outW = Math.max(1, Math.round(g.w * s)), outH = Math.max(1, Math.round(g.h * s));
  if (isDefaultCrop(g.crop) && Math.abs(photo.orig.width / photo.orig.height - aspect) < 0.002) {
    photo.src = photo.orig;                       // nothing to do: the original already is the crop
  } else {
    const c = makeCanvas(outW, outH);
    drawCropped(c.getContext('2d'), photo.orig, g.crop, aspect, outW, outH);
    photo.src = c;
  }
  // drop the downscaled and filtered copies made from the old crop
  photo.sized = null;
  photo.fcache = null;
  photo.rev = (photo.rev || 0) + 1;
  return photo;
}

// A new photo from an image (camera frame or upload): the original kept, centre-cropped by default
export function makeCroppable(img, aspect, extra = {}) {
  const photo = { orig: img, crop: defaultCrop(), seed: Math.floor(Math.random() * 1e9), ...extra };
  return applyCrop(photo, photo.crop, aspect);
}

// The layout changed: keep each photo's centre point and zoom, fitted to the new shape
export function reshapeAll(photos, aspect) {
  photos.forEach(p => { if (p.orig && Math.abs((p.aspect || aspect) - aspect) > 0.001) applyCrop(p, p.crop, aspect); });
}

// Does this image's shape differ noticeably from the slot? (uploads: offer to adjust)
export const shapeDiffers = (img, aspect) => Math.abs(Math.log((img.width / img.height) / aspect)) > 0.08;
