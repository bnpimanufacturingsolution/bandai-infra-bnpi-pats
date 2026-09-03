#!/usr/bin/env bash
set -euo pipefail

while true; do
  /usr/local/bin/project-truth-hikvision-hot-reload-listener || true
  sleep "${HIKVISION_HOT_RELOAD_RETRY_SECONDS:-5}"
done
