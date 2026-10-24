/* Camera: best available stream, native-resolution stills, honest crops.
   Photos are never upscaled; the full-size original is kept and the editor
   draws downscaled copies (see filters.js). */
import { makeCanvas } from './utils.js';
import { state } from './state.js';

const MAX_SIDE = 4096;         // memory guard for very large sensors
const PHOTO_TIMEOUT = 1500;    // ms to wait for ImageCapture before using the video frame

export function cameraError(name) {
  const e = new Error(name);
  e.name = name;
  return e;
}

export async function startCamera(video) {
  const token = ++state.booth.camToken;
  stopCamera(video, false);
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw cameraError(window.isSecureContext ? 'NotSupportedError' : 'InsecureContext');
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
    });
  } catch (err) {
    if (err.name !== 'OverconstrainedError') throw err;
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user' } });
  }
  if (token !== state.booth.camToken) {          // the visitor left while we waited for permission
    stream.getTracks().forEach(t => t.stop());
    throw cameraError('Superseded');
  }
  state.booth.stream = stream;
  tuneExposure(stream);
  // iOS Safari only plays a camera stream inline when it is muted and marked playsinline
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.srcObject = stream;
  await video.play().catch(() => {});
  if (!video.videoWidth) await new Promise(r => video.addEventListener('loadedmetadata', r, { once: true }));
}

export function stopCamera(video, invalidate = true) {
  if (invalidate) state.booth.camToken++;
  if (state.booth.stream) state.booth.stream.getTracks().forEach(t => t.stop());
  state.booth.stream = null;
  if (video) video.srcObject = null;
}

// Largest centred crop of (sw x sh) with the given aspect (w / h)
function centreCrop(sw, sh, aspect) {
  let cw = sw, ch = sh;
  if (sw / sh > aspect) cw = sh * aspect; else ch = sw / aspect;
  return { x: (sw - cw) / 2, y: (sh - ch) / 2, w: cw, h: ch };
}

// Copy the crop into a new canvas at native size (capped, never upscaled)
export function cropToCanvas(source, sw, sh, aspect, mirror, view = null) {
  // `view` limits the crop to what the preview showed (a still can see more than the stream)
  const area = view ? centreCrop(sw, sh, view) : { x: 0, y: 0, w: sw, h: sh };
  const c0 = centreCrop(area.w, area.h, aspect);
  const r = { x: area.x + c0.x, y: area.y + c0.y, w: c0.w, h: c0.h };
  const s = Math.min(1, MAX_SIDE / Math.max(r.w, r.h));
  const c = makeCanvas(r.w * s, r.h * s);
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  if (mirror) { x.translate(c.width, 0); x.scale(-1, 1); }
  x.drawImage(source, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
  return c;
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
const pause = ms => new Promise(r => setTimeout(r, ms));

// Ask for continuous exposure and white balance where the camera supports it
export function tuneExposure(stream) {
  const track = stream && stream.getVideoTracks()[0];
  const caps = track && track.getCapabilities ? track.getCapabilities() : {};
  const advanced = [];
  if (caps.exposureMode && caps.exposureMode.includes('continuous')) advanced.push({ exposureMode: 'continuous' });
  if (caps.whiteBalanceMode && caps.whiteBalanceMode.includes('continuous')) advanced.push({ whiteBalanceMode: 'continuous' });
  if (advanced.length) track.applyConstraints({ advanced }).catch(() => {});
}

// Wait until the video has a decoded frame we can actually copy
async function freshFrame(video) {
  if (video.readyState < 2) {
    await Promise.race([new Promise(r => video.addEventListener('loadeddata', r, { once: true })), pause(1500)]);
  }
  if (video.paused) await video.play().catch(() => {});
  if ('requestVideoFrameCallback' in video) {
    await new Promise(r => { const t = setTimeout(r, 400); video.requestVideoFrameCallback(() => { clearTimeout(t); r(); }); });
  }
}

// Average luminance (0..1), the share of near-white pixels, and whether the image is effectively empty
function measure(src) {
  const c = makeCanvas(48, 36), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, 0, 0, 48, 36);
  const d = x.getImageData(0, 0, 48, 36).data;
  let sum = 0, max = 0, hot = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    sum += l; if (l > max) max = l;
    if (l > 236) hot++;
  }
  const n = d.length / 4;
  return { avg: sum / n / 255, hot: hot / n, blank: max < 14 };
}

// A gentle lift for dark, backlit shots (a gamma curve), and a soft shoulder on the brightest tones
// when a lot of the frame is near white (a bright ceiling, or the screen flash on a close face),
// so highlights roll off instead of clipping flat
const KNEE = 0.74, CEIL = 0.955;
function autoExpose(canvas) {
  const { avg, hot } = measure(canvas);
  const lift = avg > 0 && avg < 0.35, shoulder = hot > 0.03;
  if (!lift && !shoulder) return canvas;
  const g = lift ? Math.min(1, Math.max(0.62, Math.log(0.42) / Math.log(avg))) : 1;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    let y = Math.pow(v / 255, g);
    if (shoulder && y > KNEE) { const t = (y - KNEE) / (1 - KNEE); y = KNEE + (CEIL - KNEE) * (1 - Math.pow(1 - t, 2)); }
    lut[v] = 255 * y;
  }
  const x = canvas.getContext('2d', { willReadFrequently: true });
  const img = x.getImageData(0, 0, canvas.width, canvas.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
  x.putImageData(img, 0, 0);
  return canvas;
}

// Take one still. Waits for a real frame, rejects blank frames and retries
// once; resolves to a canvas, or null if the camera gave us nothing usable.
// `onGrab` fires as soon as the frame is in hand (the screen flash can let go then);
// `still: false` keeps that video frame instead of asking for a full-resolution photo,
// which would only arrive after the flash has faded.
export async function capture(video, { aspect, mirror, onGrab = () => {}, still = true }) {
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      await freshFrame(video);
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) { await pause(200); continue; }
      // grab the frame now, so the moment matches the flash even if takePhoto is slow
      const frame = cropToCanvas(video, vw, vh, aspect, mirror);
      if (measure(frame).blank) { await pause(200); continue; }
      onGrab();
      return autoExpose(still ? await fullStill(video, frame, vw, vh, aspect, mirror) : frame);
    }
    return null;
  } finally {
    onGrab();
  }
}

// The camera's own full-resolution photo, when it is larger than the video frame
async function fullStill(video, frame, vw, vh, aspect, mirror) {
  const track = state.booth.stream && state.booth.stream.getVideoTracks()[0];
  if (!track || !('ImageCapture' in window)) return frame;
  let best = frame;
  try {
    const blob = await withTimeout(new window.ImageCapture(track).takePhoto(), PHOTO_TIMEOUT);
    const bmp = await createImageBitmap(blob);
    const still = cropToCanvas(bmp, bmp.width, bmp.height, aspect, mirror, vw / vh);
    bmp.close && bmp.close();
    if (still.width > frame.width && !measure(still).blank) best = still;
  } catch { /* keep the video frame */ }
  if (video.paused) video.play().catch(() => {});
  return best;
}
