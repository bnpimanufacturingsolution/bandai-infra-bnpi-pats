#!/usr/bin/env bash
# Project Truth disk guard — report, safely prune, fail when free space is low.
#
# Safe targets only (never deletes Postgres/K3s application data, DB dumps under
# active backup stamp dirs unless age-expired retained-vhdx, or Cloudflare creds).
#
# Exit codes:
#   0  ok (usage below warn thresholds after prune)
#   1  warning (above warn % or free below warn free GiB)
#   2  critical (above critical % or free below critical free GiB)
#   3  usage / invalid args
#
# Retention constants (override via environment or /etc/project-truth/disk-guard.env):
#   DISK_GUARD_WARN_PCT=85
#   DISK_GUARD_CRIT_PCT=95
#   DISK_GUARD_WARN_FREE_GIB=30
#   DISK_GUARD_CRIT_FREE_GIB=10
#   DISK_GUARD_JOURNAL_VACUUM=7d
#   DISK_GUARD_JOURNAL_MAX_SIZE=500M
#   DISK_GUARD_OBS_ROLLING_DAYS=3
#   DISK_GUARD_OBS_ROLLING_KEEP=24
#   DISK_GUARD_OBS_FULL_DAYS=14
#   DISK_GUARD_OBS_FULL_KEEP=7
#   DISK_GUARD_RETAINED_VHDX_KEEP=1
#   DISK_GUARD_TMP_DAYS=2
#   DISK_GUARD_K8S_IMAGE_TAR_DAYS=3
#   DISK_GUARD_APPLY=1          # set 0 for report-only
#   DISK_GUARD_PRUNE_IMAGES=1   # dangling/unused container images
#   DISK_GUARD_MOUNT=/

set -euo pipefail

if [ -f /etc/project-truth/disk-guard.env ]; then
  # shellcheck disable=SC1091
  . /etc/project-truth/disk-guard.env
fi

MOUNT="${DISK_GUARD_MOUNT:-/}"
WARN_PCT="${DISK_GUARD_WARN_PCT:-85}"
CRIT_PCT="${DISK_GUARD_CRIT_PCT:-95}"
WARN_FREE_GIB="${DISK_GUARD_WARN_FREE_GIB:-30}"
CRIT_FREE_GIB="${DISK_GUARD_CRIT_FREE_GIB:-10}"
JOURNAL_VACUUM="${DISK_GUARD_JOURNAL_VACUUM:-7d}"
JOURNAL_MAX_SIZE="${DISK_GUARD_JOURNAL_MAX_SIZE:-500M}"
OBS_ROLLING_DAYS="${DISK_GUARD_OBS_ROLLING_DAYS:-3}"
OBS_ROLLING_KEEP="${DISK_GUARD_OBS_ROLLING_KEEP:-24}"
OBS_FULL_DAYS="${DISK_GUARD_OBS_FULL_DAYS:-14}"
OBS_FULL_KEEP="${DISK_GUARD_OBS_FULL_KEEP:-7}"
RETAINED_VHDX_KEEP="${DISK_GUARD_RETAINED_VHDX_KEEP:-1}"
TMP_DAYS="${DISK_GUARD_TMP_DAYS:-2}"
K8S_IMAGE_TAR_DAYS="${DISK_GUARD_K8S_IMAGE_TAR_DAYS:-3}"
APPLY="${DISK_GUARD_APPLY:-1}"
PRUNE_IMAGES="${DISK_GUARD_PRUNE_IMAGES:-1}"
STATE_DIR="${DISK_GUARD_STATE_DIR:-/var/lib/project-truth/disk-guard}"
LOG_DIR="${DISK_GUARD_LOG_DIR:-/var/log/project-truth}"
OBS_ROOT="${OBSERVABILITY_DATA_ROOT:-/srv/hris/observability}"
OBS_BACKUPS="${OBS_ROOT}/backups"
RETAINED_VHDX_ROOT="${DISK_GUARD_RETAINED_VHDX_ROOT:-/var/lib/project-truth/retained-vhdx}"
K8S_RUNTIME_ROOT="${DISK_GUARD_K8S_RUNTIME_ROOT:-/var/lib/project-truth/k8s}"

as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

bytes_to_gib() {
  # integer GiB (floor)
  awk -v b="$1" 'BEGIN { printf "%d", int(b / 1024 / 1024 / 1024) }'
}

df_fields() {
  # prints: size_bytes used_bytes avail_bytes use_pct mount
  df -B1 --output=size,used,avail,pcent,target "$MOUNT" 2>/dev/null | awk 'NR==2 {
    gsub(/%/, "", $4)
    print $1, $2, $3, $4, $5
  }'
}

report_df() {
  local size used avail pct target free_gib
  read -r size used avail pct target <<<"$(df_fields)"
  free_gib="$(bytes_to_gib "$avail")"
  log "df mount=${target:-$MOUNT} size_bytes=$size used_bytes=$used avail_bytes=$avail use_pct=${pct}% free_gib=${free_gib}"
  df -hT "$MOUNT" || true
  printf 'DISK_GUARD_REPORT mount=%s use_pct=%s free_gib=%s warn_pct=%s crit_pct=%s warn_free_gib=%s crit_free_gib=%s apply=%s\n' \
    "${target:-$MOUNT}" "$pct" "$free_gib" "$WARN_PCT" "$CRIT_PCT" "$WARN_FREE_GIB" "$CRIT_FREE_GIB" "$APPLY"
}

dir_size_human() {
  local path="$1"
  local seconds="${2:-20}"
  if [ ! -d "$path" ]; then
    echo "missing"
    return 0
  fi
  # Bound du so containerd/docker scans cannot hang the timer unit.
  if command -v timeout >/dev/null 2>&1; then
    as_root timeout "$seconds" du -sh "$path" 2>/dev/null | awk '{print $1}' || echo "timeout_or_error"
  else
    as_root du -sh "$path" 2>/dev/null | awk '{print $1}' || echo "?"
  fi
}

report_hotspots() {
  log "hotspot observability=${OBS_ROOT} size=$(dir_size_human "$OBS_ROOT" 30)"
  log "hotspot obs_backups=${OBS_BACKUPS} size=$(dir_size_human "$OBS_BACKUPS" 15)"
  log "hotspot retained_vhdx=${RETAINED_VHDX_ROOT} size=$(dir_size_human "$RETAINED_VHDX_ROOT" 15)"
  log "hotspot docker=/var/lib/docker size=$(dir_size_human /var/lib/docker 25)"
  log "hotspot containerd=/var/lib/containerd size=$(dir_size_human /var/lib/containerd 25)"
  if command -v journalctl >/dev/null 2>&1; then
    journalctl --disk-usage 2>/dev/null | sed 's/^/journal: /' || true
  fi
}

prune_by_mtime_days() {
  # delete regular files older than N days under dir matching optional name pattern
  local dir="$1"
  local days="$2"
  local pattern="${3:-*}"
  if [ ! -d "$dir" ]; then
    return 0
  fi
  if [ "$APPLY" != "1" ]; then
    local count
    count="$(as_root find "$dir" -type f -name "$pattern" -mtime "+${days}" 2>/dev/null | wc -l | tr -d ' ')"
    log "dry-run would delete mtime>${days}d pattern=$pattern under $dir count=$count"
    return 0
  fi
  local deleted
  deleted="$(as_root find "$dir" -type f -name "$pattern" -mtime "+${days}" -print -delete 2>/dev/null | wc -l | tr -d ' ')"
  log "deleted mtime>${days}d pattern=$pattern under $dir count=${deleted:-0}"
}

prune_keep_newest_n() {
  local dir="$1"
  local keep="$2"
  local pattern="${3:-*}"
  if [ ! -d "$dir" ]; then
    return 0
  fi
  if [ "$keep" -lt 1 ] 2>/dev/null; then
    return 0
  fi
  # list newest first, drop keep, delete rest
  mapfile -t files < <(as_root find "$dir" -maxdepth 1 -type f -name "$pattern" -printf '%T@ %p\n' 2>/dev/null | sort -nr | awk '{print $2}')
  local total="${#files[@]}"
  if [ "$total" -le "$keep" ]; then
    log "keep-n ok dir=$dir pattern=$pattern total=$total keep=$keep"
    return 0
  fi
  local i
  for ((i = keep; i < total; i++)); do
    local f="${files[$i]}"
    if [ "$APPLY" = "1" ]; then
      as_root rm -f -- "$f" "${f}.sha256" 2>/dev/null || as_root rm -f -- "$f" || true
      log "deleted keep-n excess file=$f"
    else
      log "dry-run would delete keep-n excess file=$f"
    fi
  done
}

prune_keep_newest_dirs_n() {
  local dir="$1"
  local keep="$2"
  if [ ! -d "$dir" ]; then
    return 0
  fi
  if [ "$keep" -lt 1 ] 2>/dev/null; then
    return 0
  fi
  mapfile -t dirs < <(as_root find "$dir" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' 2>/dev/null | sort -nr | awk '{print $2}')
  local total="${#dirs[@]}"
  if [ "$total" -le "$keep" ]; then
    log "keep-n dirs ok dir=$dir total=$total keep=$keep"
    return 0
  fi
  local i
  for ((i = keep; i < total; i++)); do
    local d="${dirs[$i]}"
    if [ "$APPLY" = "1" ]; then
      as_root rm -rf -- "$d"
      log "deleted keep-n excess dir=$d"
    else
      log "dry-run would delete keep-n excess dir=$d"
    fi
  done
}

prune_journal() {
  if ! command -v journalctl >/dev/null 2>&1; then
    return 0
  fi
  if [ "$APPLY" != "1" ]; then
    log "dry-run journal vacuum-time=$JOURNAL_VACUUM vacuum-size=$JOURNAL_MAX_SIZE"
    return 0
  fi
  as_root journalctl --rotate >/dev/null 2>&1 || true
  as_root journalctl --vacuum-time="$JOURNAL_VACUUM" >/dev/null 2>&1 || true
  as_root journalctl --vacuum-size="$JOURNAL_MAX_SIZE" >/dev/null 2>&1 || true
  log "journal vacuumed time=$JOURNAL_VACUUM size=$JOURNAL_MAX_SIZE"
}

prune_observability_backups() {
  local rolling="${OBS_BACKUPS}/rolling"
  local full="${OBS_BACKUPS}/full"
  local tmp="${OBS_BACKUPS}/tmp"

  # Age-based first (historical 161G fill was rolling archives)
  prune_by_mtime_days "$rolling" "$OBS_ROLLING_DAYS" "observability-rolling-*.tar.gz"
  prune_by_mtime_days "$rolling" "$OBS_ROLLING_DAYS" "observability-rolling-*.tar.gz.sha256"
  prune_by_mtime_days "$full" "$OBS_FULL_DAYS" "observability-full-*.tar.gz"
  prune_by_mtime_days "$full" "$OBS_FULL_DAYS" "observability-full-*.tar.gz.sha256"

  # Count-based safety net
  prune_keep_newest_n "$rolling" "$OBS_ROLLING_KEEP" "observability-rolling-*.tar.gz"
  prune_keep_newest_n "$full" "$OBS_FULL_KEEP" "observability-full-*.tar.gz"

  # Stale backup temp
  if [ -d "$tmp" ]; then
    if [ "$APPLY" = "1" ]; then
      as_root find "$tmp" -mindepth 1 -mtime +1 -delete 2>/dev/null || true
      log "cleared stale observability backup tmp older than 1d"
    else
      log "dry-run would clear observability backup tmp older than 1d"
    fi
  fi
}

prune_retained_vhdx() {
  # Keep only newest N stamp directories under retained-vhdx
  prune_keep_newest_dirs_n "$RETAINED_VHDX_ROOT" "$RETAINED_VHDX_KEEP"
}

prune_tmp_artifacts() {
  # Agent/runtime scratch under /tmp — never broad /tmp wipe
  local patterns=(
    "project-truth-*"
    "project-truth-*.tar"
    "project-truth-staging*"
    "project-truth-k8s-runtime-*.tar"
    "project-truth-os-sync*"
    "project-truth-hikvision*"
    "project-truth-zkteco*"
  )
  local p
  for p in "${patterns[@]}"; do
    if [ "$APPLY" = "1" ]; then
      as_root find /tmp -maxdepth 2 -name "$p" -mtime "+${TMP_DAYS}" -print -exec rm -rf -- {} + 2>/dev/null || true
    else
      local count
      count="$(as_root find /tmp -maxdepth 2 -name "$p" -mtime "+${TMP_DAYS}" 2>/dev/null | wc -l | tr -d ' ')"
      log "dry-run would prune /tmp pattern=$p mtime>${TMP_DAYS}d count=$count"
    fi
  done
  log "tmp artifact prune patterns done days=$TMP_DAYS apply=$APPLY"
}

prune_k8s_image_tars() {
  # Temporary image export tarballs used by ansible image import — not PVC data
  if [ -d "$K8S_RUNTIME_ROOT" ]; then
    prune_by_mtime_days "$K8S_RUNTIME_ROOT" "$K8S_IMAGE_TAR_DAYS" "*.tar"
    prune_by_mtime_days /tmp "$K8S_IMAGE_TAR_DAYS" "project-truth-k8s-runtime-*.tar"
  fi
}

prune_container_images() {
  if [ "$PRUNE_IMAGES" != "1" ]; then
    log "image prune skipped PRUNE_IMAGES=$PRUNE_IMAGES"
    return 0
  fi

  if [ "$APPLY" != "1" ]; then
    log "dry-run would prune dangling docker/containerd images"
    return 0
  fi

  # Docker (observability compose stack)
  # dangling only — do not prune all unused (would drop :develop tags still wanted)
  if command -v docker >/dev/null 2>&1; then
    if docker info >/dev/null 2>&1; then
      docker image prune -f 2>/dev/null || true
      docker builder prune -f --filter until=72h 2>/dev/null || true
      log "docker dangling image + builder prune completed"
    elif as_root docker info >/dev/null 2>&1; then
      as_root docker image prune -f 2>/dev/null || true
      as_root docker builder prune -f --filter until=72h 2>/dev/null || true
      log "docker dangling image + builder prune completed (via sudo)"
    fi
  fi

  # containerd / k3s
  if command -v crictl >/dev/null 2>&1; then
    as_root crictl rmi --prune 2>/dev/null || true
    log "crictl image prune completed"
  elif command -v k3s >/dev/null 2>&1; then
    as_root k3s crictl rmi --prune 2>/dev/null || true
    log "k3s crictl image prune completed"
  fi
}

prune_apt_cache() {
  if [ "$APPLY" != "1" ]; then
    log "dry-run would apt-get clean"
    return 0
  fi
  if command -v apt-get >/dev/null 2>&1; then
    as_root apt-get clean >/dev/null 2>&1 || true
    log "apt cache cleaned"
  fi
}

exit_for_thresholds() {
  local size used avail pct target free_gib
  read -r size used avail pct target <<<"$(df_fields)"
  free_gib="$(bytes_to_gib "$avail")"

  if [ "$pct" -ge "$CRIT_PCT" ] || [ "$free_gib" -lt "$CRIT_FREE_GIB" ]; then
    log "CRITICAL use_pct=${pct}% free_gib=${free_gib} (crit_pct=${CRIT_PCT} crit_free_gib=${CRIT_FREE_GIB})"
    printf 'DISK_GUARD_STATUS=critical use_pct=%s free_gib=%s\n' "$pct" "$free_gib"
    return 2
  fi
  if [ "$pct" -ge "$WARN_PCT" ] || [ "$free_gib" -lt "$WARN_FREE_GIB" ]; then
    log "WARNING use_pct=${pct}% free_gib=${free_gib} (warn_pct=${WARN_PCT} warn_free_gib=${WARN_FREE_GIB})"
    printf 'DISK_GUARD_STATUS=warning use_pct=%s free_gib=%s\n' "$pct" "$free_gib"
    return 1
  fi
  log "OK use_pct=${pct}% free_gib=${free_gib}"
  printf 'DISK_GUARD_STATUS=ok use_pct=%s free_gib=%s\n' "$pct" "$free_gib"
  return 0
}

usage() {
  cat <<'EOF'
Usage: project-truth-disk-guard [--report-only|--apply|--help]

  --report-only   measure and print hotspots; no deletions
  --apply         run safe prunes then re-check thresholds (default)
  --help          this help

Environment / /etc/project-truth/disk-guard.env overrides retention constants.
Safe prunes: journal, observability rolling/full backups (age+count), retained
VHDX stamp dirs (keep newest N), agent /tmp artifacts, image tarballs,
dangling docker/containerd images, apt cache.
Never touches: Postgres data dirs, live K3s PVC app data, Cloudflare config.
EOF
}

main() {
  local mode="apply"
  case "${1:-}" in
    --report-only|-n)
      mode="report"
      APPLY=0
      ;;
    --apply|"")
      mode="apply"
      APPLY="${DISK_GUARD_APPLY:-1}"
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 3
      ;;
  esac

  as_root mkdir -p "$STATE_DIR" "$LOG_DIR" 2>/dev/null || mkdir -p "$STATE_DIR" 2>/dev/null || true

  log "project-truth-disk-guard start mode=$mode"
  report_df
  report_hotspots

  if [ "$mode" = "apply" ] || [ "$APPLY" = "1" ]; then
    prune_journal
    prune_observability_backups
    prune_retained_vhdx
    prune_tmp_artifacts
    prune_k8s_image_tars
    prune_container_images
    prune_apt_cache
    log "prune phase complete; re-measuring"
    report_df
  fi

  # Persist last report for operators / timers
  local stamp
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  local report_file="${STATE_DIR}/last-report.txt"
  {
    report_df
    report_hotspots
  } >"$report_file" 2>&1 || true
  if [ -d "$LOG_DIR" ] && [ -w "$LOG_DIR" ] 2>/dev/null; then
    cp -f "$report_file" "${LOG_DIR}/disk-guard-${stamp}.txt" 2>/dev/null || true
  fi

  exit_for_thresholds
}

main "$@"
