# Assets the design looks for

Everything here is optional. When a file is missing the app draws its own
version, so nothing breaks. Drop a file in with the exact name and reload.

The design never shows people: example photos are drawn "your face here"
prints, or the visitor's own latest strip from their on-device album.

## stickers/  (see stickers/README.md)
- `stickers.json`: the manifest, `[{ "file", "name", "pack" }]`
- one transparent `.png` per sticker, named in the manifest

## hero/
- `booth.png`: a cut-out photo of a red vintage photo booth on a transparent
  background, about 900 × 1300 px. It stands on the checker floor.
- `hand-camera.png`: a halftone hand holding a camera, transparent background
  (already here, cut from your sticker image)

## props/
- `scissors.png`, `washi-tape.png`, `pencil.png`, `stamps.png`: props on the
  editor's writing desk (brass scissors, a dusty-blue washi roll, a pencil,
  a few loose postage stamps), transparent, about 400 px each

## textures/  (seamless tiles unless noted)
- `paper-grain.png`: subtle paper fibre, transparent, 256 px tile
- `velvet.png`: oxblood velvet, 512 px tile (booth curtains)
- `crumpled-paper.png`: soft creases, transparent overlay, 512 px tile
- `brushed-metal.png`: horizontal brushed steel, 256 × 128 px tile
- `walnut.png`: muted walnut wood grain for the editor desk, 512 px tile
- `letter-paper.png`: a handwritten letter on cream paper (not a tile), about 720 × 960 px
