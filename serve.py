"""Local dev server for Photomatic: like `python -m http.server`, but tells the
browser not to cache, so an edited page never runs against stale scripts, and
gzips text files the way a real host would.

    python serve.py          # http://localhost:8765/
    python serve.py 9000     # another port
"""
import gzip
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCacheHandler(SimpleHTTPRequestHandler):
    TEXT = ('.html', '.css', '.js', '.json', '.svg', '.md')

    def do_GET(self):
        path = Path(self.translate_path(self.path))
        if path.is_dir():
            path = path / 'index.html'
        if not path.exists():
            # unknown paths get the custom 404 page, as a static host would serve it
            body = (Path(self.directory) / '404.html').read_bytes()
            self.send_response(404)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if 'gzip' not in self.headers.get('Accept-Encoding', '') or path.suffix not in self.TEXT or not path.is_file():
            return super().do_GET()
        body = gzip.compress(path.read_bytes(), 6)
        self.send_response(200)
        self.send_header('Content-Type', self.guess_type(str(path)))
        self.send_header('Content-Encoding', 'gzip')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    handler = partial(NoCacheHandler, directory=str(Path(__file__).parent))
    print(f'Photomatic on http://localhost:{port}/')
    ThreadingHTTPServer(('', port), handler).serve_forever()
