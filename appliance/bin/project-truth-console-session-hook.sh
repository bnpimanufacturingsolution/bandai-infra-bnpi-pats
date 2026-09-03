#!/usr/bin/env bash
set -euo pipefail

lock_file="/run/project-truth/console-session-hook.lock"
log_file="/var/log/project-truth-console-session-hook.log"

mkdir -p /run/project-truth
export PROJECT_TRUTH_SKIP_TTY1_WRITE=1

{
  flock -n 9 || exit 0

  case "${PAM_SERVICE:-}" in
    login|"") ;;
    *) exit 0 ;;
  esac

  case "${PAM_TTY:-}" in
    tty1|/dev/tty1|"") ;;
    *) exit 0 ;;
  esac

  {
    echo "----- $(date '+%Y-%m-%d %H:%M:%S %Z') ${PAM_TYPE:-unknown} ${PAM_USER:-unknown} ${PAM_TTY:-unknown} -----"

    if [ "${PAM_TYPE:-}" = "open_session" ] || [ "${PAM_TYPE:-}" = "close_session" ]; then
      if command -v project-truth-lan-config >/dev/null 2>&1; then
        project-truth-lan-config >/dev/null 2>&1 || true
      fi

      if command -v project-truth-lan-summary >/dev/null 2>&1; then
        project-truth-lan-summary --quiet >/dev/null 2>&1 || true
      fi

      if [ "${PAM_TYPE:-}" = "close_session" ] && command -v project-truth-clean-console >/dev/null 2>&1; then
        nohup sh -c 'sleep 1; project-truth-clean-console' >/dev/null 2>&1 &
      fi
    fi
  } >> "$log_file" 2>&1
} 9>"$lock_file"
