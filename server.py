import http.server
import socketserver
import os
import sys
import threading
import webbrowser

DEFAULT_PORT = 8090
DIRECTORY = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Always serve fresh assets so local edits are visible on reload.
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


def start_server():
    no_browser = "--no-browser" in sys.argv
    port = DEFAULT_PORT
    for arg in sys.argv[1:]:
        if arg.isdigit():
            port = int(arg)
            break

    httpd = None
    for candidate in range(port, port + 20):
        try:
            httpd = ReusableTCPServer(("127.0.0.1", candidate), Handler)
            port = candidate
            break
        except OSError:
            continue

    if httpd is None:
        print("Error: Could not bind to any port in range 8090-8109.", flush=True)
        sys.exit(1)

    url = f"http://127.0.0.1:{port}/"
    print(f"Orbital Perimeter running at {url}", flush=True)
    print("Keep this window open while playing. Press Ctrl+C to stop.", flush=True)

    if not no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()

    try:
        with httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.", flush=True)


if __name__ == "__main__":
    start_server()
