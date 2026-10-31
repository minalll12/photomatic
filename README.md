<div align="center">

# Photomatic

**A retro photo booth that runs entirely in your browser.**

Strike a pose, style your strip, and take it home. No accounts, no uploads, no installs.

[**Try it live →**](https://photomatic-six.vercel.app)
<img width="2842" height="1456" alt="image" src="https://github.com/user-attachments/assets/ead721fa-7f8f-48ae-9ccc-cb237650b604" />

</div>

---

## Why I built it

Many photo booth strips have been pinned to the bulletin board in my room for months. Every time I looked at them, I wondered how hard it would be to recreate that experience in a browser: the countdown, the flash, and the wait while your strip develops!

Photomatic is the result. It's a small project, but I wanted every detail to feel right, from the visual style to how it behaves on a phone.

## Features

**The booth**
- 3 or 4 shots, a 3s or 5s timer, and a choice of strip layouts
- Live camera capture with a film-style countdown, a soft flash and optional sound
- Upload photos instead of using the camera
- Retake any single frame

**Customising**
- Crop, zoom, straighten, rotate and flip each photo
- Film-style filters
- Hand-designed strip frames, from train tickets and receipts to Polaroids and 35mm film
- Stickers, custom text and a date stamp
- Undo, redo and a "Surprise me" button

**Saving**
- High-resolution PNG download
- A 1080×1920 story collage for Instagram
- A short video of your session
- An album that stays on your device
- Native sharing on supported phones

## Privacy

There's no backend. Your camera feed, photos and album never leave your device. Everything is processed in the browser, and the album is stored locally with IndexedDB.

## Tech

| Area | Used |
| --- | --- |
| Core | HTML, CSS and JavaScript (ES modules), no framework |
| Camera | `getUserMedia`, `ImageCapture` |
| Rendering | Canvas 2D for strips and frames, WebGL for filters |
| Storage | IndexedDB |
| Media | `MediaRecorder`, Web Audio, Web Share API |
| Testing | Playwright |
| Hosting | Vercel |

A few decisions I'm happy with:

- **No runtime dependencies.** It's all static files, so it loads quickly and there's very little that can break.
- **One module per job.** Camera, editor, frames, filters, export and album each live in their own file.
- **Non-destructive editing.** Crop and adjust settings are saved as values and applied when the strip is drawn, so the original photo is never changed.
- **Tested on real phones**, not just emulators. Several layout bugs only showed up on an actual iPhone.
- **Accessible.** Text meets AA contrast, and animations respect the reduced-motion setting.

## Running it locally

It's a static site, but the camera needs `localhost` or HTTPS, so run it through a local server:

```bash
git clone https://github.com/minalll12/photomatic.git
cd photomatic
python serve.py
```

Then open http://localhost:8765. Any static server works too, for example `npx serve .`

## Browser support

Current versions of Chrome, Edge, Firefox and Safari, on desktop and mobile.

---

<div align="center">

Created by **Minal Bijumon ** · [LinkedIn](https://www.linkedin.com/in/minal-bijumon/)

</div>
