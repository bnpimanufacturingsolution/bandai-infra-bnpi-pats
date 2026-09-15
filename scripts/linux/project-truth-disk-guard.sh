#!/usr/bin/env bash
# project-truth-disk-guard.sh
#
# Durable disk-pressure prevention for Project Truth appliance VMs (K3s DiskPressure).
# Safe reclaim only. Intended for systemd oneshot + timer.
#
# HARD BANS (never do these):
#   - Never touch /etc/cloudflared or any cloudflared credentials/config
#   - Never stop/disable/mask cloudflared-bnpi-pats.service (or any cloudflared unit)
#   - Never delete postgres PVC data or /var/lib/rancher/k3s/storage/*
#   - Never run docker/k3s "system prune -af" or delete in-use volumes/containers
#
# Safe actions:
#   1) journalctl --vacuum-size=200M
#   2) prune /srv/bnpi-pats/observability/backups/rolling files older than 3 days
#   3) prune old /tmp and /var/tmp agent dirs older than 2 days
#      (overnight-*, device-user-*, copy-peer-*, pt-*, credential-*)
#   4) k3s crictl rmi --prune (unused images only) when available
#   5) delete rotated log files under /var/log older than 7 days (*.gz, *.1, *.old)
#   6) report df; exit 1 if root Use% >= 85 or Avail < 25G
#
# Env overrides:
#   PROJECT_TRUTH_DISK_MIN_AVAIL_GB   default 25
#   PROJECT_TRUTH_DISK_MAX_USE_PCT    default 85
#   PROJECT_TRUTH_OBS_ROLLING_DAYS    default 3
#   PROJECT_TRUTH_TMP_DAYS            default 2
#   PROJECT_TRUTH_JOURNAL_SIZE        default 200M
#   PROJECT_TRUTH_DISK_GUARD_DRY_RUN  set 1 to log without deleting

set -euo pipefail

MIN_AVAIL_GB="${PROJECT_TRUTH_DISK_MIN_AVAIL_GB:-25}"
MAX_USE_PCT="${PROJECT_TRUTH_DISK_MAX_USE_PCT:-85}"
ROLLING_DAYS="${PROJECT_TRUTH_OBS_ROLLING_DAYS:-3}"
TMP_DAYS="${PROJECT_TRUTH_TMP_DAYS:-2}"
JOURNAL_SIZE="${PROJECT_TRUTH_JOURNAL_SIZE:-200M}"
DRY_RUN="${PROJECT_TRUTH_DISK_GUARD_DRY_RUN:-0}"

ROLLING_DIR="/srv/bnpi-pats/observability/backups/rolling"

log() { printf '[disk-guard] %s\n' "$*"; }
warn() { printf '[disk-guard] WARN %s\n' "$*" >&2; }

# Refuse accidental operation on banned paths.
assert_not_banned() {
  local path="$1"
  case "$path" in
    /etc/cloudflared|/etc/cloudflared/*)
      log "ERROR: refusing banned cloudflared path: $path"
      exit 2
      ;;
    /var/lib/rancher/k3s/storage|/var/lib/rancher/k3s/storage/*)
      log "ERROR: refusing k3s PVC storage path: $path"
      exit 2
      ;;
    /var/lib/postgresql|/var/lib/postgresql/*|/var/lib/pgsql|/var/lib/pgsql/*)
      log "ERROR: refusing postgres data path: $path"
      exit 2
      ;;
  esac
}

# Parse root FS via POSIX df (-P) in 1K-blocks (-k). Prints: total used avail use_pct
df_root() {
  df -Pk / | awk 'NR==2 {
    gsub(/%/, "", $5)
    if ($2 ~ /^[0-9]+$/ && $3 ~ /^[0-9]+$/ && $4 ~ /^[0-9]+$/ && $5 ~ /^[0-9]+$/) {
      print $2, $3, $4, $5
      exit 0
    }
    exit 1
  }'
}

kb_to_gb_int() {
  # 1K-blocks -> whole GiB (floor)
  local kb="${1:-0}"
  echo $(( kb / 1024 / 1024 ))
}

log "start $(date -u +%Y-%m-%dT%H:%M:%SZ) dry_run=${DRY_RUN} host=$(hostname -s 2>/dev/null || hostname)"

if ! read -r total_kb used_kb avail_kb use_pct < <(df_root); then
  log "ERROR: could not parse df -Pk /"
  exit 2
fi
avail_gb="$(kb_to_gb_int "$avail_kb")"
log "df / before: use=${use_pct}% avail_gb=${avail_gb} (total_kb=${total_kb} used_kb=${used_kb} avail_kb=${avail_kb})"
df -h / /var /tmp 2>/dev/null || df -h /

# 1) journal vacuum (size-capped)
if command -v journalctl >/dev/null 2>&1; then
  log "step1: journalctl --vacuum-size=${JOURNAL_SIZE}"
  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY_RUN: journalctl --vacuum-size=${JOURNAL_SIZE}"
  else
    journalctl --vacuum-size="${JOURNAL_SIZE}" 2>&1 | while IFS= read -r line; do log "journal: $line"; done || warn "journal vacuum non-zero (continuing)"
  fi
else
  warn "journalctl not found; skip"
fi

# 2) observability rolling backups older than N days (files only under rolling)
assert_not_banned "$ROLLING_DIR"
if [[ -d "$ROLLING_DIR" ]]; then
  log "step2: prune ${ROLLING_DIR} files older than ${ROLLING_DAYS}d"
  # Only regular files; never follow symlinks out of the tree.
  mapfile -t old_rolling < <(
    find "$ROLLING_DIR" -xdev -maxdepth 1 -type f \( \
      -name 'observability-rolling-*.tar.gz' -o \
      -name 'observability-rolling-*.tar.gz.sha256' -o \
      -name '*.tar.gz' -o \
      -name '*.tar.gz.sha256' \
    \) -mtime "+${ROLLING_DAYS}" 2>/dev/null | sort || true
  )
  if [[ "${#old_rolling[@]}" -eq 0 ]]; then
    log "no rolling backup files older than ${ROLLING_DAYS}d"
  else
    log "removing ${#old_rolling[@]} rolling backup file(s)"
    for f in "${old_rolling[@]}"; do
      assert_not_banned "$f"
      case "$f" in
        "${ROLLING_DIR}"/*) ;;
        *) warn "skip path outside rolling dir: $f"; continue ;;
      esac
      if [[ "$DRY_RUN" == "1" ]]; then
        log "DRY_RUN: rm -f -- $f"
      else
        rm -f -- "$f" && log "removed $f" || warn "failed to remove $f"
      fi
    done
  fi
else
  log "rolling dir not present: ${ROLLING_DIR} (skip)"
fi

# 3) old agent scratch dirs under /tmp and /var/tmp
log "step3: prune agent dirs older than ${TMP_DAYS}d (overnight-*, device-user-*, copy-peer-*, pt-*, credential-*)"
for base in /tmp /var/tmp; do
  [[ -d "$base" ]] || continue
  mapfile -t tmp_dirs < <(
    find "$base" -xdev -maxdepth 1 -mindepth 1 -type d \( \
      -name 'overnight-*' -o \
      -name 'device-user-*' -o \
      -name 'copy-peer-*' -o \
      -name 'pt-*' -o \
      -name 'credential-*' \
    \) -mtime "+${TMP_DAYS}" 2>/dev/null | sort || true
  )
  if [[ "${#tmp_dirs[@]}" -eq 0 ]]; then
    log "no matching agent dirs under ${base}"
    continue
  fi
  log "removing ${#tmp_dirs[@]} dir(s) under ${base}"
  for d in "${tmp_dirs[@]}"; do
    assert_not_banned "$d"
    case "$d" in
      /tmp/overnight-*|/tmp/device-user-*|/tmp/copy-peer-*|/tmp/pt-*|/tmp/credential-*) ;;
      /var/tmp/overnight-*|/var/tmp/device-user-*|/var/tmp/copy-peer-*|/var/tmp/pt-*|/var/tmp/credential-*) ;;
      *) warn "skip unexpected path: $d"; continue ;;
    esac
    if [[ "$DRY_RUN" == "1" ]]; then
      log "DRY_RUN: rm -rf -- $d"
    else
      rm -rf -- "$d" && log "removed $d" || warn "failed to remove $d"
    fi
  done
done

# 4) unused container images only (never volumes / PVCs)
log "step4: crictl rmi --prune (unused images)"
if command -v k3s >/dev/null 2>&1; then
  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY_RUN: k3s crictl rmi --prune"
  else
    k3s crictl rmi --prune 2>&1 | while IFS= read -r line; do log "crictl: $line"; done || warn "k3s crictl rmi --prune failed (continuing)"
  fi
elif command -v crictl >/dev/null 2>&1; then
  if [[ -z "${CONTAINER_RUNTIME_ENDPOINT:-}" ]]; then
    if [[ -S /run/k3s/containerd/containerd.sock ]]; then
      export CONTAINER_RUNTIME_ENDPOINT="unix:///run/k3s/containerd/containerd.sock"
    elif [[ -S /run/containerd/containerd.sock ]]; then
      export CONTAINER_RUNTIME_ENDPOINT="unix:///run/containerd/containerd.sock"
    fi
  fi
  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY_RUN: crictl rmi --prune"
  else
    crictl rmi --prune 2>&1 | while IFS= read -r line; do log "crictl: $line"; done || warn "crictl rmi --prune failed (continuing)"
  fi
else
  log "crictl/k3s not found; skip image prune"
fi

# 5) old rotated logs only (never wipe active logs or entire /var/log)
log "step5: prune rotated /var/log files older than 7d (*.gz *.1 *.old)"
if [[ -d /var/log ]]; then
  mapfile -t old_logs < <(
    find /var/log -xdev -type f \( -name '*.gz' -o -name '*.1' -o -name '*.old' \) -mtime +7 2>/dev/null | sort || true
  )
  if [[ "${#old_logs[@]}" -eq 0 ]]; then
    log "no old rotated logs to remove"
  else
    log "removing ${#old_logs[@]} rotated log file(s)"
    for f in "${old_logs[@]}"; do
      assert_not_banned "$f"
      case "$f" in
        /var/log/*) ;;
        *) warn "skip unexpected log path: $f"; continue ;;
      esac
      if [[ "$DRY_RUN" == "1" ]]; then
        log "DRY_RUN: rm -f -- $f"
      else
        rm -f -- "$f" || warn "failed to remove $f"
      fi
    done
  fi
fi

# 6) report + threshold gate
if ! read -r total_kb used_kb avail_kb use_pct < <(df_root); then
  log "ERROR: could not parse df -Pk / after prune"
  exit 2
fi
avail_gb="$(kb_to_gb_int "$avail_kb")"
log "df / after: use=${use_pct}% avail_gb=${avail_gb} (total_kb=${total_kb} used_kb=${used_kb} avail_kb=${avail_kb})"
df -h / /var /tmp 2>/dev/null || df -h /

status=0
if (( 10#${use_pct} >= 10#${MAX_USE_PCT} )); then
  log "ALERT: disk use ${use_pct}% >= max ${MAX_USE_PCT}%"
  status=1
fi
if (( 10#${avail_gb} < 10#${MIN_AVAIL_GB} )); then
  log "ALERT: avail ${avail_gb}G < min ${MIN_AVAIL_GB}G"
  status=1
fi

if (( status != 0 )); then
  log "FAIL disk threshold (status=${status}) — inspect large dirs: sudo du -xh / --max-depth=2 | sort -h | tail"
  exit "$status"
fi

log "OK disk within thresholds"
exit 0
