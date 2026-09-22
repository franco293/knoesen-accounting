"""Local-only preview of the prepared release, including clean URL routing."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, unquote
import argparse

ROOT = Path(__file__).resolve().parent / 'dist'


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        relative = path.lstrip('/') or 'index.html'
        candidate = (ROOT / relative).resolve()
        if ROOT.resolve() not in candidate.parents:
            self.send_error(404)
            return
        if path == '/tools' or path.startswith('/tools/'):
            self.send_response(301)
            self.send_header('Location', '/resources')
            self.end_headers()
            return
        if not candidate.suffix:
            candidate = candidate.with_suffix('.html')
        if not candidate.is_file():
            body = (ROOT / '404.html').read_bytes()
            self.send_response(404)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.path = '/' + candidate.relative_to(ROOT).as_posix()
        super().do_GET()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8081)
    args = parser.parse_args()
    if not (ROOT / 'index.html').exists():
        raise SystemExit('Run python publish.py first.')
    from functools import partial
    print('Preview: http://127.0.0.1:%d (Ctrl+C to stop)' % args.port, flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(ROOT))).serve_forever()
