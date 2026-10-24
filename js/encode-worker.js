/* PNG encoding off the main thread: the generated textures arrive as ImageBitmaps and go back
   as Blobs, so turning them into CSS-ready URLs never blocks input or animation. */
self.onmessage = async ({ data: { id, bitmap } }) => {
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    bitmap.close();
    self.postMessage({ id, blob: await canvas.convertToBlob({ type: 'image/png' }) });
  } catch {
    self.postMessage({ id, blob: null });
  }
};
