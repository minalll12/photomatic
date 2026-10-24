"""The site's public address, in one place.

Link previews (og:image, og:url, twitter:image) and the canonical link must be
absolute URLs written into the HTML itself: crawlers don't run JavaScript, so a
script can't fill them in. Every tag that needs the address carries a `data-site`
attribute. Change SITE_URL below, then run from the project folder:

    python tools/set-site-url.py

It rewrites the address in each `data-site` tag (keeping the path) and is safe
to run as often as you like.
"""
import re
from pathlib import Path

SITE_URL = "https://photomatic.vercel.app"

ROOT = Path(__file__).resolve().parent.parent
FILES = ["index.html", "privacy.html"]

# href="…" or content="…" on a tag that has data-site
TAG = re.compile(r"<[^>]*\bdata-site\b[^>]*>")
ATTR = re.compile(r'\b(href|content)="https?://[^/"]+(/[^"]*)?"')


def main():
    base = SITE_URL.rstrip("/")
    for name in FILES:
        path = ROOT / name
        text = path.read_text(encoding="utf-8")
        count = 0

        def fix_tag(m):
            nonlocal count
            count += 1
            return ATTR.sub(lambda a: f'{a.group(1)}="{base}{a.group(2) or "/"}"', m.group(0))

        path.write_text(TAG.sub(fix_tag, text), encoding="utf-8", newline="")
        print(f"{name}: {count} tag(s) now use {base}")


if __name__ == "__main__":
    main()
