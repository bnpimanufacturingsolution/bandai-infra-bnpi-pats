#!/bin/sh
set -eu

ARCHIVE_PATH="${1:-}"

if [ -z "$ARCHIVE_PATH" ]; then
  echo "usage: restore.sh /backups/full/grafana-full-....dump"
  exit 1
fi

if [ ! -f "$ARCHIVE_PATH" ]; then
  echo "backup_not_found=$ARCHIVE_PATH"
  exit 1
fi

if [ -f "${ARCHIVE_PATH}.sha256" ]; then
  expected="$(awk 'NR == 1 {print $1}' "${ARCHIVE_PATH}.sha256")"
  actual="$(sha256sum "$ARCHIVE_PATH" | awk '{print $1}')"
  if [ "$expected" != "$actual" ]; then
    echo "backup_checksum_failed=$ARCHIVE_PATH" >&2
    exit 1
  fi
fi

if ! pg_restore --list "$ARCHIVE_PATH" >/dev/null 2>&1; then
  echo "backup_validation_failed=$ARCHIVE_PATH" >&2
  exit 1
fi

echo "backup_valid=$ARCHIVE_PATH"
echo "restore_requires_explicit_pg_restore=true"
