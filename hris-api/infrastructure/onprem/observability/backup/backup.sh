#!/bin/sh
set -eu

BACKUP_ROOT="${BACKUP_ROOT:-/backups}"
ROLLING_DIR="${BACKUP_ROOT}/rolling"
FULL_DIR="${BACKUP_ROOT}/full"
TMP_DIR="${BACKUP_ROOT}/tmp"

BACKUP_KEEP_ROLLING="${BACKUP_KEEP_ROLLING:-4}"
BACKUP_KEEP_FULL="${BACKUP_KEEP_FULL:-2}"
FULL_FREQUENCY="${FULL_FREQUENCY:-daily}" # always|daily|weekly|monthly

mkdir -p "$ROLLING_DIR" "$FULL_DIR" "$TMP_DIR"

TS="$(date +%Y%m%d-%H%M%S)"
TODAY="$(date +%Y%m%d)"
WEEK_KEY="$(date +%G-W%V)"
MONTH_KEY="$(date +%Y-%m)"

PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-grafana}"
PGUSER="${PGUSER:-postgres}"

if ! pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" >/dev/null 2>&1; then
  echo "backup_database_unavailable host=$PGHOST port=$PGPORT database=$PGDATABASE" >&2
  exit 1
fi

create_dump() {
  out_file="$1"
  tmp_file="${TMP_DIR}/$(basename "$out_file").partial.$$"
  checksum_tmp="${out_file}.sha256.partial.$$"
  if ! pg_dump --format=custom --no-owner --no-privileges --file="$tmp_file"; then
    rm -f "$tmp_file" "$checksum_tmp"
    echo "backup_dump_failed=$out_file" >&2
    return 1
  fi
  if ! pg_restore --list "$tmp_file" >/dev/null 2>&1; then
    rm -f "$tmp_file" "$checksum_tmp"
    echo "backup_validation_failed=$out_file" >&2
    return 1
  fi
  digest="$(sha256sum "$tmp_file" | awk '{print $1}')"
  mv "$tmp_file" "$out_file"
  printf '%s  %s\n' "$digest" "$out_file" > "$checksum_tmp"
  mv "$checksum_tmp" "${out_file}.sha256"
  echo "backup_created=$out_file"
}

prune_keep_n() {
  dir="$1"
  keep="$2"
  if [ "$keep" -lt 1 ] 2>/dev/null; then
    return 0
  fi
  ls -1t "$dir"/*.dump 2>/dev/null | awk "NR>${keep}" | xargs -r rm -f
  ls -1t "$dir"/*.dump.sha256 2>/dev/null | awk "NR>${keep}" | xargs -r rm -f
}

ROLLING_FILE="${ROLLING_DIR}/grafana-rolling-${TS}.dump"
create_dump "$ROLLING_FILE"

DO_FULL="false"
FULL_SUFFIX=""

case "$FULL_FREQUENCY" in
  always)
    DO_FULL="true"
    FULL_SUFFIX="$TODAY"
    ;;
  daily)
    if ! ls "$FULL_DIR"/grafana-full-${TODAY}-*.dump >/dev/null 2>&1; then
      DO_FULL="true"
      FULL_SUFFIX="$TODAY"
    fi
    ;;
  weekly)
    if [ "$(date +%u)" = "7" ] && ! ls "$FULL_DIR"/grafana-full-${WEEK_KEY}-*.dump >/dev/null 2>&1; then
      DO_FULL="true"
      FULL_SUFFIX="$WEEK_KEY"
    fi
    ;;
  monthly)
    if [ "$(date +%d)" = "01" ] && ! ls "$FULL_DIR"/grafana-full-${MONTH_KEY}-*.dump >/dev/null 2>&1; then
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
  FULL_FILE="${FULL_DIR}/grafana-full-${FULL_SUFFIX}-${TS}.dump"
  create_dump "$FULL_FILE"
fi

prune_keep_n "$ROLLING_DIR" "$BACKUP_KEEP_ROLLING"
prune_keep_n "$FULL_DIR" "$BACKUP_KEEP_FULL"

echo "backup_done ts=$TS"
