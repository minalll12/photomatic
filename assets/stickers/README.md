# Stickers

The **Stickers** tab in the editor shows only real PNG images from this folder,
exactly as you provide them: no recolouring, no outlines, no filters. The only
thing the app adds is a soft drop shadow when a sticker is placed (people can
switch it off per sticker).

## Adding a sticker

1. Save each sticker as its **own transparent PNG** in this folder, trimmed close
   to the edges (for example `cherry-keychain.png`). Up to about 2000 px on the
   longest side is plenty: the editor uses a downscaled copy and exports keep
   up to 2048 px.
2. List it in `stickers.json`:

   ```json
   [
     { "file": "cherry-keychain.png", "name": "Cherry keychain", "pack": "Keepsakes" },
     { "file": "gingham-bow.png",     "name": "Gingham bow",     "pack": "Keepsakes" },
     { "file": "glitter-star.png",    "name": "Glitter star",    "pack": "Shine" }
   ]
   ```

   - `file`: the file name in this folder (must end in `.png`)
   - `name`: tooltip and screen-reader label
   - `pack`: the tab it appears under; stickers with the same pack are grouped

3. Reload the page. No code changes needed.

The first three stickers in the list are also used as small decorations on the
home page, the reveal and the album.

A JPG, or a sheet with many stickers on one background, will not work: each
sticker needs its own file with a transparent background. Only use images you
made or have the rights to use, and leave out anything with a real brand name,
logo or song lyric on it.
