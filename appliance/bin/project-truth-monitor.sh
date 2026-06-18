#!/usr/bin/env bash
set -euo pipefail

if command -v watch >/dev/null 2>&1; then
  exec watch -n 3 project-truth-progress
fi

while true; do
  clear || true
  project-truth-progress
  sleep 3
done
