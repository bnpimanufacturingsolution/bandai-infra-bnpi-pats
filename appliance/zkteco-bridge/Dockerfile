FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV ZKTECO_DEVICE_IPS=10.184.38.10,10.184.38.234,10.184.38.235,10.184.38.9
ENV ZKTECO_DEVICE_PORT=4370
ENV ZKTECO_WEBHOOK_URL=http://hris-api:3001/api/zkteco/events
ENV ZKTECO_STATUS_PORT=4371
ENV ZKTECO_POLL_INTERVAL_SECONDS=60

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src

EXPOSE 4371

CMD ["npm", "start"]
