#!/usr/bin/env bash
# project-truth-af-burn-loop.sh
#
# Durable Main A–F merge burn supervisor. Runs on the Project Truth VM so
# host/agent sessions can disconnect without stopping progress.
#
# What it burns (priority order):
#   1) People missing on any Main A–F device (mode=users peer create)
#   2) Profile decisions with autoResolveDecisions=true when they block writes
#   3) Does NOT treat finger/face gap chips as headcount finish line
#
# Observability: /var/log/project-truth/af-burn/ (or /tmp fallback)
# Lock: single instance via flock
#
# Env overrides:
#   PT_API_BASE   default https://dev-api.bnpi-hris.tech  (or http://127.0.0.1:3101)
#   PT_EMAIL      default admin@bandai.local
#   PT_PASSWORD   default password123
#   PT_APP_CODE   default hris
#   PT_WAVE_SIZE  default 30
#   PT_SLEEP_SEC  default 45 between cycles when idle
#   PT_MAX_CYCLES default 0 = forever
#   PT_TARGET_FROM default 874

set -u
set -o pipefail

API_BASE="${PT_API_BASE:-https://dev-api.bnpi-hris.tech}"
EMAIL="${PT_EMAIL:-admin@bandai.local}"
PASSWORD="${PT_PASSWORD:-password123}"
APP_CODE="${PT_APP_CODE:-hris}"
WAVE_SIZE="${PT_WAVE_SIZE:-30}"
SLEEP_SEC="${PT_SLEEP_SEC:-45}"
MAX_CYCLES="${PT_MAX_CYCLES:-0}"
TARGET_FROM="${PT_TARGET_FROM:-874}"

A_ID=cmrht5s2w00ei7zgsre8y3o5n
B_ID=cmpxw13hx002h7zwso7dyedrn
C_ID=cmripjwbx00ewl001ihcke210
D_ID=cmripjwkw00ffl0013lfxcbxw
E_ID=cmriu5ab102goi001x9o7nfct
F_ID=cmrim1zop05ik7zp4zgm2sm4k
MAIN_IDS_JSON="[\"$A_ID\",\"$B_ID\",\"$C_ID\",\"$D_ID\",\"$E_ID\",\"$F_ID\"]"

if [[ -w /var/log/project-truth ]] || mkdir -p /var/log/project-truth/af-burn 2>/dev/null; then
  LOG_DIR=/var/log/project-truth/af-burn
else
  LOG_DIR=/tmp/project-truth-af-burn
  mkdir -p "$LOG_DIR"
fi
LOCK_FILE="$LOG_DIR/af-burn.lock"
STATUS_FILE="$LOG_DIR/STATUS.md"
HEARTBEAT_FILE="$LOG_DIR/HEARTBEATS.log"
CYCLE_LOG="$LOG_DIR/cycle.log"
PID_FILE="$LOG_DIR/af-burn.pid"

log() {
  local ts
  ts=$(date -Is)
  echo "[$ts] $*" | tee -a "$CYCLE_LOG"
}

hb() {
  local ts
  ts=$(date -Is)
  echo "HEARTBEAT | ts=$ts | $*" | tee -a "$HEARTBEAT_FILE"
}

json_get() {
  # json_get <file|stdin->file> jq-expr
  local file="$1"
  shift
  jq -r "$@" "$file" 2>/dev/null
}

login() {
  local body resp code
  body=$(jq -n --arg e "$EMAIL" --arg p "$PASSWORD" --arg a "$APP_CODE" \
    '{email:$e,password:$p,appCode:$a}')
  resp=$(mktemp)
  code=$(curl -sS -m 45 -o "$resp" -w '%{http_code}' \
    -X POST "$API_BASE/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "$body" || echo 000)
  if [[ "$code" != "200" ]]; then
    log "LOGIN_FAIL http=$code body=$(head -c 200 "$resp")"
    rm -f "$resp"
    return 1
  fi
  TOKEN=$(jq -r '.data.token // empty' "$resp")
  rm -f "$resp"
  if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
    log "LOGIN_FAIL no token"
    return 1
  fi
  AUTH="Authorization: Bearer $TOKEN"
  return 0
}

api_get() {
  local path="$1" out="$2" code
  code=$(curl -sS -m 120 -o "$out" -w '%{http_code}' \
    -H "$AUTH" "$API_BASE$path" || echo 000)
  echo "$code"
}

api_post() {
  local path="$1" body="$2" out="$3" code
  code=$(curl -sS -m 420 -o "$out" -w '%{http_code}' \
    -X POST "$API_BASE$path" \
    -H "$AUTH" -H 'Content-Type: application/json' \
    -d "$body" || echo 000)
  echo "$code"
}

write_status() {
  local cycle="$1" e_from="$2" missing_total="$3" job_line="$4" note="$5"
  cat >"$STATUS_FILE" <<EOF
# A–F durable burn STATUS (VM supervisor)

**Updated:** $(date -Is)
**PID:** $$
**API:** \`$API_BASE\`
**Cycle:** $cycle
**Log dir:** \`$LOG_DIR\`

## Live headcount finish line

| Metric | Value | Target |
|---|---:|---:|
| E From (primary burn) | $e_from | $TARGET_FROM |
| Plan missing-any keys | $missing_total | 0 |

## Job

$job_line

## Note

$note

## How to watch

\`\`\`bash
tail -f $HEARTBEAT_FILE
cat $STATUS_FILE
\`\`\`

## Stop

\`\`\`bash
kill \$(cat $PID_FILE)
\`\`\`
EOF
}

running_merge_jobs() {
  local out code running
  out=$(mktemp)
  code=$(api_get '/api/device/hikvision/sdk-users/merge/jobs' "$out")
  if [[ "$code" != "200" ]]; then
    echo "0"
    rm -f "$out"
    return
  fi
  running=$(jq -r '.data.running // 0' "$out")
  rm -f "$out"
  echo "${running:-0}"
}

sync_preview_from() {
  # Sets globals: MATRIX_LINE, E_FROM (not via command substitution — that loses E_FROM).
  local out code
  out=$(mktemp)
  code=$(api_get '/api/device/sync-preview?quick=true' "$out")
  if [[ "$code" != "200" ]]; then
    MATRIX_LINE="ERR"
    E_FROM="?"
    rm -f "$out"
    return 1
  fi
  MATRIX_LINE=$(jq -r '
    .data.devices
    | map(select(.name|test("Device [A-F]$")))
    | map(
        ((.name|capture("Device (?<L>[A-F])$").L) // "?") as $L
        | "\($L)=\(.vendorUserCount // "null")/\(.hrisUserCount // 0):\(.status // "?")"
      )
    | join(" ")
  ' "$out")
  E_FROM=$(jq -r '
    [.data.devices[] | select(.name|test("Device E$")) | .vendorUserCount // empty][0] // "?"
  ' "$out")
  rm -f "$out"
  return 0
}

build_plan() {
  local out code body
  out=$(mktemp)
  body=$(jq -n --argjson ids "$MAIN_IDS_JSON" '{deviceIds:$ids}')
  code=$(api_post '/api/device/hikvision/sdk-users/merge/plan' "$body" "$out")
  if [[ "$code" != "200" && "$code" != "201" ]]; then
    log "PLAN_FAIL http=$code $(head -c 300 "$out")"
    rm -f "$out"
    return 1
  fi
  PLAN_FILE="$out"
  PLAN_ID=$(jq -r '.data.planId // empty' "$out")
  UNIQUE=$(jq -r '.data.plan.counts.unionUsers // (.data.plan.users|length) // 0' "$out")
  # missing counts per letter
  MISSING_JSON=$(jq -c --arg a "$A_ID" --arg b "$B_ID" --arg c "$C_ID" --arg d "$D_ID" --arg e "$E_ID" --arg f "$F_ID" '
    .data.plan.users as $u
    | {
        A: [$u[] | select(.missingOnDeviceIds != null and (.missingOnDeviceIds|index($a)))] | length,
        B: [$u[] | select(.missingOnDeviceIds != null and (.missingOnDeviceIds|index($b)))] | length,
        C: [$u[] | select(.missingOnDeviceIds != null and (.missingOnDeviceIds|index($c)))] | length,
        D: [$u[] | select(.missingOnDeviceIds != null and (.missingOnDeviceIds|index($d)))] | length,
        E: [$u[] | select(.missingOnDeviceIds != null and (.missingOnDeviceIds|index($e)))] | length,
        F: [$u[] | select(.missingOnDeviceIds != null and (.missingOnDeviceIds|index($f)))] | length,
        any: [$u[] | select(.missingOnDeviceIds != null and (.missingOnDeviceIds|length>0))] | length,
        decisions: [$u[] | select(.conflicts != null and (.conflicts|length>0))] | length
      }
  ' "$out")
  echo "$MISSING_JSON" >"$LOG_DIR/missing-counts-latest.json"
  DECISIONS=$(echo "$MISSING_JSON" | jq -r '.decisions')
  MISSING_ANY=$(echo "$MISSING_JSON" | jq -r '.any')
  MISSING_E=$(echo "$MISSING_JSON" | jq -r '.E')
  log "PLAN ok planId=$PLAN_ID unique=$UNIQUE missing=$MISSING_JSON"
  return 0
}

pick_wave_keys() {
  # Prefer keys missing on E, then any missing, skip pure-conflict-only if possible
  local out keys n
  out=$(mktemp)
  jq -c --arg e "$E_ID" --argjson n "$WAVE_SIZE" '
    .data.plan.users as $u
    | (
        [$u[] | select(.missingOnDeviceIds != null and (.missingOnDeviceIds|index($e))
          and ((.conflicts//[])|length)==0) | .key]
        + [$u[] | select(.missingOnDeviceIds != null and (.missingOnDeviceIds|index($e))) | .key]
        + [$u[] | select(.missingOnDeviceIds != null and (.missingOnDeviceIds|length>0)
          and ((.conflicts//[])|length)==0) | .key]
        + [$u[] | select(.missingOnDeviceIds != null and (.missingOnDeviceIds|length>0)) | .key]
      )
    | unique
    | .[0:$n]
  ' "$PLAN_FILE" >"$out"
  WAVE_KEYS_JSON=$(cat "$out")
  WAVE_N=$(jq 'length' "$out")
  rm -f "$out"
  log "WAVE keys=$WAVE_N"
}

start_wave() {
  local rev_body rev_out job_body job_out code scope
  if [[ "${WAVE_N:-0}" -le 0 ]]; then
    log "WAVE empty — nothing to burn"
    return 2
  fi
  rev_out=$(mktemp)
  rev_body=$(jq -n --arg p "$PLAN_ID" --argjson keys "$WAVE_KEYS_JSON" \
    '{planId:$p, selectedUserKeys:$keys, autoResolveDecisions:true}')
  code=$(api_post '/api/device/hikvision/sdk-users/merge/review' "$rev_body" "$rev_out")
  if [[ "$code" != "200" && "$code" != "201" ]]; then
    log "REVIEW_FAIL http=$code $(head -c 400 "$rev_out")"
    rm -f "$rev_out"
    return 1
  fi
  scope=$(jq -r '.data.scopeHash // empty' "$rev_out")
  physical=$(jq -r '.data.physicalWrites // 0' "$rev_out")
  log "REVIEW scopeHash=${scope:0:16}... physical=$physical"
  job_out=$(mktemp)
  job_body=$(jq -n --arg p "$PLAN_ID" --arg s "$scope" --argjson keys "$WAVE_KEYS_JSON" \
    '{planId:$p, mode:"users", selectedUserKeys:$keys, autoResolveDecisions:true, expectedScopeHash:$s, dryRun:false}')
  code=$(api_post '/api/device/hikvision/sdk-users/merge/jobs' "$job_body" "$job_out")
  if [[ "$code" != "200" && "$code" != "201" && "$code" != "202" ]]; then
    log "JOB_START_FAIL http=$code $(head -c 500 "$job_out")"
    # lease busy?
    if grep -qi 'busy\|lease\|already\|active' "$job_out" 2>/dev/null; then
      log "JOB lease/busy — will wait"
      rm -f "$rev_out" "$job_out"
      return 3
    fi
    rm -f "$rev_out" "$job_out"
    return 1
  fi
  JOB_ID=$(jq -r '.data.jobId // empty' "$job_out")
  cp "$job_out" "$LOG_DIR/job-start-latest.json"
  rm -f "$rev_out" "$job_out"
  log "JOB_START id=$JOB_ID"
  return 0
}

poll_job() {
  local job_id="$1" out code status i max_polls
  max_polls=40
  for ((i=1; i<=max_polls; i++)); do
    out=$(mktemp)
    code=$(api_get "/api/device/hikvision/sdk-users/merge/jobs/$job_id" "$out")
    if [[ "$code" != "200" ]]; then
      log "POLL http=$code"
      rm -f "$out"
      sleep 10
      continue
    fi
    status=$(jq -r '.data.status // .data.progress.status // empty' "$out")
    ok=$(jq -r '.data.successfulWrites // .data.progress.successfulWrites // 0' "$out")
    fail=$(jq -r '.data.failedWrites // .data.progress.failedWrites // 0' "$out")
    total=$(jq -r '.data.totalWrites // .data.progress.totalWrites // 0' "$out")
    proc=$(jq -r '.data.processedWrites // .data.progress.processedWrites // 0' "$out")
    stage=$(jq -r '.data.currentStage // .data.progress.currentStage // empty' "$out")
    stale=$(jq -r '.data.stale // false' "$out")
    remain=$(jq -r '(.data.remainingUserKeys // [])|length' "$out")
    line="poll=$i job=$job_id status=$status ok=$ok fail=$fail proc=$proc/$total stage=$stage stale=$stale remainKeys=$remain"
    log "$line"
    hb "$line | E_from=${E_FROM:-?} missing_any=${MISSING_ANY:-?} missing_E=${MISSING_E:-?} decisions=${DECISIONS:-?}"
    cp "$out" "$LOG_DIR/job-poll-latest.json"
    if [[ "$status" == "completed" || "$status" == "failed" || "$stale" == "true" ]]; then
      LAST_JOB_LINE="| $job_id | $status | $ok | $fail | $total | $stage | stale=$stale |"
      rm -f "$out"
      return 0
    fi
    rm -f "$out"
    sleep 12
  done
  LAST_JOB_LINE="| $job_id | timeout_poll | ? | ? | ? | ? | |"
  return 1
}

main_loop() {
  local cycle=0 matrix
  echo $$ >"$PID_FILE"
  log "START af-burn supervisor pid=$$ api=$API_BASE wave=$WAVE_SIZE target_from=$TARGET_FROM"
  hb "start pid=$$ api=$API_BASE"

  while true; do
    cycle=$((cycle + 1))
    if [[ "$MAX_CYCLES" -gt 0 && "$cycle" -gt "$MAX_CYCLES" ]]; then
      log "MAX_CYCLES reached"
      break
    fi

    if ! login; then
      hb "cycle=$cycle login_fail sleep"
      sleep "$SLEEP_SEC"
      continue
    fi

    sync_preview_from || true
    log "MATRIX $MATRIX_LINE E_FROM=${E_FROM:-?}"

    running=$(running_merge_jobs)
    if [[ "${running:-0}" -gt 0 ]]; then
      log "MERGE already running=$running — wait"
      write_status "$cycle" "${E_FROM:-?}" "${MISSING_ANY:-?}" "| (active) | running=$running | | | | |" "Waiting for in-flight merge"
      hb "cycle=$cycle wait_running=$running matrix=$MATRIX_LINE"
      sleep "$SLEEP_SEC"
      continue
    fi

    if ! build_plan; then
      write_status "$cycle" "${E_FROM:-?}" "?" "| plan_fail | | | | | |" "Plan failed; retry"
      sleep "$SLEEP_SEC"
      continue
    fi

    # Finish line: no missing people on any A-F and E at target (when measurable)
    if [[ "${MISSING_ANY:-1}" -eq 0 ]]; then
      log "DONE missing_any=0 E_from=${E_FROM:-?} decisions=$DECISIONS"
      write_status "$cycle" "${E_FROM:-?}" "0" "| none | idle | | | | |" "Headcount missing burned. Decision residual=$DECISIONS (profile). Finger/face chips are credential residual not this loop."
      hb "cycle=$cycle DONE missing_any=0 E_from=${E_FROM:-?} decisions=$DECISIONS"
      # Keep process alive reporting every few minutes so operator sees green
      sleep 180
      continue
    fi

    pick_wave_keys
    if ! start_wave; then
      rc=$?
      write_status "$cycle" "${E_FROM:-?}" "${MISSING_ANY:-?}" "| start_fail rc=$rc | | | | | |" "Wave start failed (lease/API). Retry."
      sleep "$SLEEP_SEC"
      continue
    fi

    poll_job "$JOB_ID" || true
    # refresh matrix after job
    sync_preview_from || true
    write_status "$cycle" "${E_FROM:-?}" "${MISSING_ANY:-?}" "${LAST_JOB_LINE:-| ? |}" "missing_counts=$MISSING_JSON matrix=$MATRIX_LINE"
    hb "cycle=$cycle post_job matrix=$MATRIX_LINE missing=$MISSING_JSON"

    # free plan file
    rm -f "${PLAN_FILE:-}"
    sleep 8
  done
}

# single instance
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another af-burn loop holds $LOCK_FILE" >&2
  exit 1
fi

main_loop
