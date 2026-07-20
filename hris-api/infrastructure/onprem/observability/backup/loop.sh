#!/bin/sh
set -eu

echo "backup_loop_started"

while true; do
  sh /backup/backup.sh || true
  sleep "${BACKUP_INTERVAL_SECONDS:-3600}"
done
