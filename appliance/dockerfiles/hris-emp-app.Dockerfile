# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS build-env
WORKDIR /workspace/hris-emp-app
COPY hris-emp-app/package.json hris-emp-app/package-lock.json ./
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN set -eux; \
    npm_config_fetch_retries=5 \
    npm_config_fetch_retry_factor=2 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_fetch_timeout=600000 \
    sh -c 'npm ci --prefer-offline --no-audit --no-fund --network-timeout=300000 || npm ci --prefer-offline --no-audit --no-fund --network-timeout=300000'
COPY hris-emp-app/ ./
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ARG VITE_KIOSK_DEVICE_ID=cmrim1zop05ik7zp4zgm2sm4k
ENV VITE_KIOSK_DEVICE_ID=${VITE_KIOSK_DEVICE_ID}
ARG VITE_KIOSK_LOGIN_APP_CODE=hris
ENV VITE_KIOSK_LOGIN_APP_CODE=${VITE_KIOSK_LOGIN_APP_CODE}
RUN npm run build

FROM nginx:1.27-alpine
ENV PORT=3000
ENV HRIS_API_ORIGIN=http://127.0.0.1:3001
COPY appliance/dockerfiles/hris-emp-app.nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build-env /workspace/hris-emp-app/build/client /usr/share/nginx/html
EXPOSE 3000
