# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS build-env
WORKDIR /app
COPY ./package.json ./package-lock.json ./
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN set -eux; \
    npm_config_fetch_retries=5 \
    npm_config_fetch_retry_factor=2 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_fetch_timeout=600000 \
    sh -c 'npm ci --prefer-offline --no-audit --no-fund --network-timeout=300000 || npm ci --prefer-offline --no-audit --no-fund --network-timeout=300000'
COPY . /app/
ARG VITE_API_BASE_URL=
ARG VITE_ASSET_NAMESPACE=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_ASSET_NAMESPACE=${VITE_ASSET_NAMESPACE}
RUN npm run build
RUN mkdir -p /app/build/client/app/assets \
    && cp /app/app/assets/bandai_logo.png /app/build/client/app/assets/bandai_logo.png

FROM node:20-alpine
COPY ./package.json package-lock.json /app/
COPY --from=build-env /app/build /app/build
COPY ./server.cjs /app/server.cjs
WORKDIR /app
EXPOSE 3000
CMD ["node", "server.cjs"]
