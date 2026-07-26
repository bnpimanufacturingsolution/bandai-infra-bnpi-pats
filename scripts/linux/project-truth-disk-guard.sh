#!/usr/bin/env bash
# Project Truth VM disk guard — prevent K3s DiskPressure outages.
# Safe reclaim only. Never touches Cloudflare credentials, Postgres PVCs, or live secrets.
set -euo pipefail

MIN_AVAIL_GB="${PROJECT_TRUTH_DISK_MIN_AVAIL_GB:-25}"
MAX_USE_PCT="${PROJECT_TRUTH_DISK_MAX_USE_PCT:-85}"
ROLLING_DAYS="${PROJECT_TRUTH_OBS_ROLLING_DAYS:-3}"
TMP_DAYS="${PROJECT_TRUTH_TMP_DAYS:-2}"
JOURNAL_SIZE="${PROJECT_TRUTH_JOURNAL_SIZE:-200M}"
DRY_RUN="${PROJECT_TRUTH_DISK_GUARD_DRY_RUN:-0}"

log() { printf '[disk-guard] %s\n' "$*"; }

df_root() {
  # POSIX df: 1K-blocks Used Available Capacity Mounted
  df -Pk / | awk 'NR==2 {gsub(/%/,"",$5); print $2,$3,$4,$5}'
}

bytes_to_gb() {
  awk -v b="${1:-0}" 'BEGIN { printf "%.1f", b/1024/1024/1024 }'
}

run_cmd() {
  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY_RUN: $*"
  else
    log "RUN: $*"
    # shellcheck disable=SC2086
    eval "$@"
  fi
}

log "start $(date -u +%Y-%m-%dT%H:%M:%SZ) dry_run=$DRY_RUN"
read -r total_kb used_kb avail_kb use_pct < <(df_root)
# ensure integers
total_kb=${total_kb//[^0-9]/}
used_kb=${used_kb//[^0-9]/}
avail_kb=${avail_kb//[^0-9]/}
use_pct=${use_pct//[^0-9]/}
avail_gb="$(bytes_to_gb $((avail_kb * 1024)))"
log "df / before: use=${use_pct}% avail_gb=${avail_gb} (total_kb=${total_kb} used_kb=${used_kb} avail_kb=${avail_kb})"

# 1) journal
if command -v journalctl >/dev/null 2>&1; then
  run_cmd "journalctl --vacuum-size=${JOURNAL_SIZE}" || true
fi

# 2) observability rolling backups (historical safe reclaim path)
rolling="/srv/hris/observability/backups/rolling"
if [[ -d "$rolling" ]]; then
  log "pruning rolling backups older than ${ROLLING_DAYS}d under $rolling"
  if [[ "$DRY_RUN" == "1" ]]; then
    find "$rolling" -mindepth 1 -mtime "+${ROLLING_DAYS}" -print 2>/dev/null | head -50 || true
  else
    find "$rolling" -mindepth 1 -mtime "+${ROLLING_DAYS}" -print -exec rm -rf {} + 2>/dev/null || true
  fi
fi

# 3) old agent tmp workdirs
for base in /tmp /var/tmp; do
  [[ -d "$base" ]] || continue
  log "pruning old agent dirs under $base older than ${TMP_DAYS}d"
  if [[ "$DRY_RUN" == "1" ]]; then
    find "$base" -maxdepth 1 -mindepth 1 -mtime "+${TMP_DAYS}" \
      \( -name 'overnight-*' -o -name 'device-user-*' -o -name 'copy-peer-*' -o -name 'pt-*' -o -name 'credential-*' \) \
      -print 2>/dev/null | head -50 || true
  else
    find "$base" -maxdepth 1 -mindepth 1 -mtime "+${TMP_DAYS}" \
      \( -name 'overnight-*' -o -name 'device-user-*' -o -name 'copy-peer-*' -o -name 'pt-*' -o -name 'credential-*' \) \
      -exec rm -rf {} + 2>/dev/null || true
  fi
done

# 4) unused container images (k3s/crictl)
if command -v k3s >/dev/null 2>&1; then
  run_cmd "k3s crictl rmi --prune" || true
elif command -v crictl >/dev/null 2>&1; then
  run_cmd "crictl rmi --prune" || true
fi

# 5) rotated logs
if [[ -d /var/log ]]; then
  if [[ "$DRY_RUN" == "1" ]]; then
    find /var/log -type f \( -name '*.gz' -o -name '*.1' -o -name '*.old' \) -mtime +7 -print 2>/dev/null | head -30 || true
  else
    find /var/log -type f \( -name '*.gz' -o -name '*.1' -o -name '*.old' \) -mtime +7 -delete 2>/dev/null || true
  fi
fi

read -r total_kb used_kb avail_kb use_pct < <(df_root)
total_kb=${total_kb//[^0-9]/}
used_kb=${used_kb//[^0-9]/}
avail_kb=${avail_kb//[^0-9]/}
use_pct=${use_pct//[^0-9]/}
avail_gb="$(bytes_to_gb $((avail_kb * 1024)))"
log "df / after: use=${use_pct}% avail_gb=${avail_gb}"

# Threshold gate
status=0
if (( 10#${use_pct:-0} >= 10#${MAX_USE_PCT} )); then
  log "ALERT: disk use ${use_pct}% >= max ${MAX_USE_PCT}%"
  status=1
fi
# compare avail in GB as integer
avail_int=${avail_gb%.*}
if (( 10#${avail_int:-0} < 10#${MIN_AVAIL_GB} )); then
  log "ALERT: avail ${avail_gb}G < min ${MIN_AVAIL_GB}G"
  status=1
fi

if (( status != 0 )); then
  log "FAIL disk threshold (status=$status)"
  exit "$status"
fi

log "OK disk within thresholds"
exit 0
