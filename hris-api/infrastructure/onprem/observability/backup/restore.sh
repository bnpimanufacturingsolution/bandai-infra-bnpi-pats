#!/bin/sh
set -eu

ARCHIVE_PATH="${1:-}"
RESTORE_ROOT="${RESTORE_ROOT:-/restore}"

if [ -z "$ARCHIVE_PATH" ]; then
  echo "usage: restore.sh /backups/full/observability-full-....tar.gz"
  exit 1
fi

if [ ! -f "$ARCHIVE_PATH" ]; then
  echo "archive_not_found=$ARCHIVE_PATH"
  exit 1
fi

mkdir -p "$RESTORE_ROOT"
tar -xzpf "$ARCHIVE_PATH" -C "$RESTORE_ROOT"

echo "restore_extracted_to=$RESTORE_ROOT"
