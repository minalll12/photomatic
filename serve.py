"""Local dev server for Photomatic: like `python -m http.server`, but tells the
browser not to cache, so an edited page never runs against stale scripts.

    python serve.py          # http://localhost:8765/
    python serve.py 9000     # another port
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    handler = partial(NoCacheHandler, directory=str(Path(__file__).parent))
    print(f'Photomatic on http://localhost:{port}/')
    ThreadingHTTPServer(('', port), handler).serve_forever()
