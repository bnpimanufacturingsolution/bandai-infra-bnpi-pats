# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS build-env
WORKDIR /app
COPY ./package.json ./package-lock.json ./
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN --mount=type=cache,target=/root/.npm set -eux; \
    npm_config_fetch_retries=5 \
    npm_config_fetch_retry_factor=2 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_fetch_timeout=600000 \
    sh -c 'npm ci --prefer-offline --no-audit --no-fund --network-timeout=300000 || npm ci --prefer-offline --no-audit --no-fund --network-timeout=300000'
COPY . /app/
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build
RUN mkdir -p /app/build/client/app/assets \
    && cp /app/app/assets/bandai_logo.png /app/build/client/app/assets/bandai_logo.png
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:20-alpine
COPY ./package.json package-lock.json /app/
COPY --from=build-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
WORKDIR /app
RUN <<'EOF' cat > /app/server.cjs
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "build", "client");
const port = Number(process.env.PORT || 3000);
const apiOrigin = process.env.HRIS_API_ORIGIN || "http://hris-api:3001";
const proxyPrefixes = ["/api/", "/uploads/", "/socket.io/"];

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf",
};

const shouldProxy = (url = "/") => proxyPrefixes.some((prefix) => url.startsWith(prefix));

const proxyHttpRequest = (req, res) => {
  const target = new URL(req.url || "/", apiOrigin);
  const proxyReq = http.request(
    target,
    {
      method: req.method,
      headers: {
        ...req.headers,
        host: target.host,
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", (error) => {
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ status: "error", message: error.message }));
  });

  req.pipe(proxyReq);
};

const proxyWebSocketUpgrade = (req, socket, head) => {
  if (!shouldProxy(req.url || "/")) {
    socket.destroy();
    return;
  }

  const target = new URL(req.url || "/", apiOrigin);
  const proxyReq = http.request({
    host: target.hostname,
    port: target.port || 80,
    path: `${target.pathname}${target.search}`,
    method: req.method,
    headers: {
      ...req.headers,
      host: target.host,
    },
  });

  proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    const headers = Object.entries(proxyRes.headers)
      .flatMap(([key, value]) => {
        if (Array.isArray(value)) return value.map((item) => `${key}: ${item}`);
        return value === undefined ? [] : [`${key}: ${value}`];
      })
      .join("\r\n");
    socket.write(`HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n${headers}\r\n\r\n`);
    if (proxyHead.length) socket.write(proxyHead);
    if (head.length) proxySocket.write(head);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });

  proxyReq.on("error", () => socket.destroy());
  proxyReq.end();
};

const server = http
  .createServer((req, res) => {
    if (shouldProxy(req.url || "/")) {
      proxyHttpRequest(req, res);
      return;
    }

    if ((req.url || "/").split("?")[0] === "/health") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ status: "ok", service: "hris-app" }));
      return;
    }

    const reqPath = decodeURIComponent((req.url || "/").split("?")[0]);
    const normalized = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, "");
    let filePath = path.join(root, normalized);

    if (normalized.endsWith("/") || normalized === ".") {
      filePath = path.join(root, "index.html");
    }

    const withinRoot = path.resolve(filePath).startsWith(path.resolve(root));
    if (!withinRoot) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    fs.stat(filePath, (err, stat) => {
      if (!err && stat.isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }

      fs.readFile(filePath, (readErr, data) => {
        if (readErr) {
          fs.readFile(path.join(root, "index.html"), (indexErr, indexData) => {
            if (indexErr) {
              res.writeHead(500);
              res.end("Internal Server Error");
              return;
            }
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(indexData);
          });
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
        res.end(data);
      });
    });
  })
  .listen(port, "0.0.0.0", () => {
    console.log(`Static app server listening on http://0.0.0.0:${port}`);
  });

server.on("upgrade", proxyWebSocketUpgrade);
EOF
EXPOSE 3000
CMD ["node", "server.cjs"]
