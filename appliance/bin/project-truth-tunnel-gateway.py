#!/usr/bin/env python3
import html
import http.client
import os
import socketserver
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler


LISTEN_HOST = os.environ.get("PROJECT_TRUTH_GATEWAY_HOST", "0.0.0.0")
LISTEN_PORT = int(os.environ.get("PROJECT_TRUTH_GATEWAY_PORT", "38080"))
TARGET_HOST = os.environ.get("PROJECT_TRUTH_TUNNEL_TARGET_HOST", "127.0.0.1")

ROUTES = [
    ("/prod-api", "PROD API", 3001),
    ("/dev-api", "DEV API", 3101),
    ("/uat-api", "UAT API", 3201),
    ("/grafana", "Grafana", 53000),
    ("/prometheus", "Prometheus", 9091),
    ("/loki", "Loki", 3110),
    ("/prod", "PROD BNPI PATS", 3000),
    ("/dev", "DEV BNPI PATS", 3100),
    ("/uat", "UAT BNPI PATS", 3200),
]

HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
}


def route_for(path):
    for prefix, name, port in ROUTES:
        if path == prefix or path.startswith(prefix + "/"):
            return prefix, name, port
    return None


def rewrite_location(value, prefix):
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme or parsed.netloc:
        value = urllib.parse.urlunsplit(("", "", parsed.path or "/", parsed.query, parsed.fragment))
    if value.startswith("/") and not value.startswith(prefix + "/"):
        return prefix + value
    return value


def rewrite_body(data, content_type, prefix):
    if not data:
        return data
    if "text/html" not in content_type and "application/javascript" not in content_type:
        return data
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return data
    for attr in ("href", "src", "action"):
        text = text.replace(f'{attr}="/', f'{attr}="{prefix}/')
        text = text.replace(f"{attr}='/", f"{attr}='{prefix}/")
    text = text.replace('url(/', f'url({prefix}/')
    return text.encode("utf-8")


class ThreadingHTTPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


class GatewayHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - - [%s] %s\n" % (self.client_address[0], self.log_date_time_string(), fmt % args))

    def do_GET(self):
        self.handle_proxy()

    def do_HEAD(self):
        self.handle_proxy()

    def do_POST(self):
        self.handle_proxy()

    def do_PUT(self):
        self.handle_proxy()

    def do_PATCH(self):
        self.handle_proxy()

    def do_DELETE(self):
        self.handle_proxy()

    def do_OPTIONS(self):
        self.handle_proxy()

    def send_text(self, code, body, content_type="text/plain; charset=utf-8"):
        data = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def handle_proxy(self):
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path in ("", "/"):
            return self.index()
        if parsed.path == "/healthz":
            return self.send_text(200, "ok\n")

        route = route_for(parsed.path)
        if route is None:
            return self.send_text(404, "Project Truth gateway route not found\n")

        prefix, _name, port = route
        upstream_path = parsed.path[len(prefix):] or "/"
        if not upstream_path.startswith("/"):
            upstream_path = "/" + upstream_path
        upstream_url = urllib.parse.urlunsplit(("", "", upstream_path, parsed.query, ""))
        body = None
        if self.headers.get("Content-Length"):
            body = self.rfile.read(int(self.headers["Content-Length"]))

        headers = {}
        for key, value in self.headers.items():
            if key.lower() in HOP_BY_HOP or key.lower() == "host":
                continue
            headers[key] = value
        headers["Host"] = f"{TARGET_HOST}:{port}"
        headers["X-Forwarded-Host"] = self.headers.get("Host", "")
        headers["X-Forwarded-Proto"] = "https" if self.headers.get("Cf-Visitor") else "http"
        headers["X-Forwarded-Prefix"] = prefix

        conn = http.client.HTTPConnection(TARGET_HOST, port, timeout=30)
        try:
            conn.request(self.command, upstream_url, body=body, headers=headers)
            resp = conn.getresponse()
            data = b"" if self.command == "HEAD" else resp.read()
        except Exception as exc:
            conn.close()
            return self.send_text(502, f"Project Truth gateway upstream failed: {exc}\n")

        response_headers = []
        content_type = ""
        for key, value in resp.getheaders():
            lower = key.lower()
            if lower in HOP_BY_HOP or lower == "content-length":
                continue
            if lower == "location":
                value = rewrite_location(value, prefix)
            if lower == "set-cookie":
                value = value.replace("Path=/;", f"Path={prefix}/;")
                value = value.replace("path=/;", f"path={prefix}/;")
            if lower == "content-type":
                content_type = value
            response_headers.append((key, value))

        data = rewrite_body(data, content_type, prefix)
        self.send_response(resp.status, resp.reason)
        for key, value in response_headers:
            self.send_header(key, value)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)
        conn.close()

    def index(self):
        host = html.escape(self.headers.get("Host", f"{LISTEN_HOST}:{LISTEN_PORT}"))
        links = [
            ("/prod/auth/login", "PROD login"),
            ("/prod-api/health", "PROD API health"),
            ("/dev/auth/login", "DEV login"),
            ("/dev-api/health", "DEV API health"),
            ("/uat/auth/login", "UAT login"),
            ("/uat-api/health", "UAT API health"),
            ("/grafana/api/health", "Grafana health"),
            ("/prometheus/-/ready", "Prometheus ready"),
            ("/loki/ready", "Loki ready"),
        ]
        items = "\n".join(f'<li><a href="{path}">{html.escape(label)}</a></li>' for path, label in links)
        body = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Project Truth Gateway</title>
  <style>
    body {{ font-family: system-ui, sans-serif; margin: 2rem; line-height: 1.5; }}
    code {{ background: #f3f4f6; padding: .15rem .3rem; border-radius: .25rem; }}
  </style>
</head>
<body>
  <h1>Project Truth Gateway</h1>
  <p>One host: <code>{host}</code></p>
  <ul>{items}</ul>
</body>
</html>
"""
        self.send_text(200, body, "text/html; charset=utf-8")


def main():
    with ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), GatewayHandler) as server:
        print(f"Project Truth gateway listening on http://{LISTEN_HOST}:{LISTEN_PORT}", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
