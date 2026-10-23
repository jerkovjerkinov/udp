# python serve.py  ->  http://localhost:8642
# Serves the built game suite in dist/. Build it with `npm run build` (needs Node);
# the dist/ folder that ships with the project works without Node.
import http.server, socketserver, functools, os

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript', '.mjs': 'text/javascript', '.woff2': 'font/woff2', '.svg': 'image/svg+xml'}

    # always ask the server again, so a new build shows on a plain refresh
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

PORT = 8642
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dist')
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('127.0.0.1', PORT), functools.partial(Handler, directory=root)) as httpd:
    print('serving on http://localhost:%d' % PORT)
    httpd.serve_forever()
