#!/bin/sh
set -eu

BACKUP_ROOT="${BACKUP_ROOT:-/backups}"
ROLLING_DIR="${BACKUP_ROOT}/rolling"
FULL_DIR="${BACKUP_ROOT}/full"
TMP_DIR="${BACKUP_ROOT}/tmp"

BACKUP_KEEP_ROLLING="${BACKUP_KEEP_ROLLING:-48}"
BACKUP_KEEP_FULL="${BACKUP_KEEP_FULL:-30}"
FULL_FREQUENCY="${FULL_FREQUENCY:-daily}" # always|daily|weekly|monthly

mkdir -p "$ROLLING_DIR" "$FULL_DIR" "$TMP_DIR"

TS="$(date +%Y%m%d-%H%M%S)"
TODAY="$(date +%Y%m%d)"
WEEK_KEY="$(date +%G-W%V)"
MONTH_KEY="$(date +%Y-%m)"

SRC_PATHS="/data/grafana /data/prometheus /data/loki /data/tempo /data/alertmanager"

create_archive() {
  out_file="$1"
  tar -czpf "$out_file" $SRC_PATHS
  sha256sum "$out_file" > "${out_file}.sha256"
  echo "backup_created=$out_file"
}

prune_keep_n() {
  dir="$1"
  keep="$2"
  if [ "$keep" -lt 1 ] 2>/dev/null; then
    return 0
  fi
  ls -1t "$dir"/*.tar.gz 2>/dev/null | awk "NR>${keep}" | xargs -r rm -f
  ls -1t "$dir"/*.tar.gz.sha256 2>/dev/null | awk "NR>${keep}" | xargs -r rm -f
}

ROLLING_FILE="${ROLLING_DIR}/observability-rolling-${TS}.tar.gz"
create_archive "$ROLLING_FILE"

DO_FULL="false"
FULL_SUFFIX=""

case "$FULL_FREQUENCY" in
  always)
    DO_FULL="true"
    FULL_SUFFIX="$TODAY"
    ;;
  daily)
    if ! ls "$FULL_DIR"/observability-full-${TODAY}-*.tar.gz >/dev/null 2>&1; then
      DO_FULL="true"
      FULL_SUFFIX="$TODAY"
    fi
    ;;
  weekly)
    if [ "$(date +%u)" = "7" ] && ! ls "$FULL_DIR"/observability-full-${WEEK_KEY}-*.tar.gz >/dev/null 2>&1; then
      DO_FULL="true"
      FULL_SUFFIX="$WEEK_KEY"
    fi
    ;;
  monthly)
    if [ "$(date +%d)" = "01" ] && ! ls "$FULL_DIR"/observability-full-${MONTH_KEY}-*.tar.gz >/dev/null 2>&1; then
      DO_FULL="true"
      FULL_SUFFIX="$MONTH_KEY"
    fi
    ;;
  *)
    echo "invalid FULL_FREQUENCY=$FULL_FREQUENCY (expected: always|daily|weekly|monthly)"
    exit 1
    ;;
esac

if [ "$DO_FULL" = "true" ]; then
  FULL_FILE="${FULL_DIR}/observability-full-${FULL_SUFFIX}-${TS}.tar.gz"
  create_archive "$FULL_FILE"
fi

prune_keep_n "$ROLLING_DIR" "$BACKUP_KEEP_ROLLING"
prune_keep_n "$FULL_DIR" "$BACKUP_KEEP_FULL"

echo "backup_done ts=$TS"
