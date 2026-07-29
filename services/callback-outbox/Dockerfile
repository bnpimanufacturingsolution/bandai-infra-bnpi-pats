# Project Truth — K3s callback outbox (SQLite + HTTP drain to hris-api)
FROM python:3.12-alpine
WORKDIR /app
COPY outbox_server.py /app/outbox_server.py
ENV PORT=8080 \
    OUTBOX_DB=/data/outbox.db \
    DRAIN_CALLBACK_URL=http://hris-api:3001/api/hikvision/callback \
    DRAIN_INTERVAL_SEC=2 \
    IMMEDIATE_DRAIN=1
EXPOSE 8080
VOLUME ["/data"]
CMD ["python", "-u", "/app/outbox_server.py"]
