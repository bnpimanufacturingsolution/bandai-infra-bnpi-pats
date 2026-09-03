#!/usr/bin/env bash
# Durable Main A-F missing-people burn supervisor (VM nohup).
# Re-plans every cycle; starts mode=users waves; survives host disconnect.
set -u
set -o pipefail

API_BASE="${PT_API_BASE:-http://127.0.0.1:3101}"
EMAIL="${PT_EMAIL:-admin@bandai.local}"
PASSWORD="${PT_PASSWORD:-password123}"
APP_CODE="${PT_APP_CODE:-hris}"
WAVE_SIZE="${PT_WAVE_SIZE:-25}"
SLEEP_SEC="${PT_SLEEP_SEC:-30}"
TARGET_FROM="${PT_TARGET_FROM:-874}"

A_ID=cmrht5s2w00ei7zgsre8y3o5n
B_ID=cmpxw13hx002h7zwso7dyedrn
C_ID=cmripjwbx00ewl001ihcke210
D_ID=cmripjwkw00ffl0013lfxcbxw
E_ID=cmriu5ab102goi001x9o7nfct
F_ID=cmrim1zop05ik7zp4zgm2sm4k

if mkdir -p /var/log/project-truth/af-burn 2>/dev/null; then
  LOG_DIR=/var/log/project-truth/af-burn
else
  LOG_DIR=/tmp/project-truth-af-burn
  mkdir -p "$LOG_DIR"
fi

LOCK="$LOG_DIR/af-burn.lock"
PIDF="$LOG_DIR/af-burn.pid"
LOGF="$LOG_DIR/cycle.log"
HBF="$LOG_DIR/HEARTBEATS.log"
STATUSF="$LOG_DIR/STATUS.md"
NOHUP="$LOG_DIR/nohup.out"

log() {
  printf '%s %s\n' "$(date -Is)" "$*" >>"$LOGF"
  printf '%s %s\n' "$(date -Is)" "$*" >>"$NOHUP"
}

hb() {
  printf 'HEARTBEAT | ts=%s | %s\n' "$(date -Is)" "$*" >>"$HBF"
  printf 'HEARTBEAT | ts=%s | %s\n' "$(date -Is)" "$*" >>"$NOHUP"
}

# Single instance via mkdir lock (no flock dependency / pipe weirdness)
if ! mkdir "$LOCK" 2>/dev/null; then
  # stale lock if pid dead
  if [[ -f "$PIDF" ]]; then
    old=$(cat "$PIDF" 2>/dev/null || true)
    if [[ -n "${old:-}" ]] && kill -0 "$old" 2>/dev/null; then
      echo "another af-burn running pid=$old" >&2
      exit 1
    fi
  fi
  rmdir "$LOCK" 2>/dev/null || rm -rf "$LOCK"
  mkdir "$LOCK" || exit 1
fi
trap 'rm -rf "$LOCK"' EXIT
echo $$ >"$PIDF"

login() {
  local resp code
  resp=$(mktemp)
  code=$(curl -sS -m 40 -o "$resp" -w '%{http_code}' \
    -X POST "$API_BASE/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"appCode\":\"$APP_CODE\"}" || echo 000)
  TOKEN=$(jq -r '.data.token // empty' "$resp" 2>/dev/null || true)
  rm -f "$resp"
  if [[ "$code" != "200" || -z "$TOKEN" ]]; then
    log "LOGIN_FAIL code=$code"
    return 1
  fi
  return 0
}

auth_curl() {
  # auth_curl METHOD PATH [bodyfile] [outfile] [max_time]
  local method="$1" path="$2" body="${3:-}" out="${4:-}" max="${5:-120}" code
  if [[ -z "$out" ]]; then out=$(mktemp); fi
  if [[ -n "$body" ]]; then
    code=$(curl -sS -m "$max" -o "$out" -w '%{http_code}' \
      -X "$method" "$API_BASE$path" \
      -H "Authorization: Bearer $TOKEN" \
      -H 'Content-Type: application/json' \
      --data-binary @"$body" || echo 000)
  else
    code=$(curl -sS -m "$max" -o "$out" -w '%{http_code}' \
      -X "$method" "$API_BASE$path" \
      -H "Authorization: Bearer $TOKEN" || echo 000)
  fi
  echo "$code"
}

write_status() {
  cat >"$STATUSF" <<EOF
# A-F durable burn (VM)

Updated: $(date -Is)
PID: $$
API: $API_BASE
Cycle: $1
E_from: $2
missing_any: $3
job: $4
note: $5

Watch:
  tail -f $HBF
  tail -f $LOGF
Stop:
  kill \$(cat $PIDF); rmdir $LOCK 2>/dev/null
EOF
}

cycle=0
log "START pid=$$ api=$API_BASE wave=$WAVE_SIZE"
hb "start pid=$$ api=$API_BASE"

while true; do
  cycle=$((cycle + 1))
  log "CYCLE $cycle begin"

  if ! login; then
    write_status "$cycle" "?" "?" "none" "login_fail"
    hb "cycle=$cycle login_fail"
    sleep "$SLEEP_SEC"
    continue
  fi
  log "login ok"

  PREVIEW=$(mktemp)
  code=$(auth_curl GET '/api/device/sync-preview?quick=true' '' "$PREVIEW" 90)
  if [[ "$code" != "200" ]]; then
    log "PREVIEW_FAIL code=$code"
    rm -f "$PREVIEW"
    sleep "$SLEEP_SEC"
    continue
  fi
  E_FROM=$(jq -r '[.data.devices[]|select(.name|test("Device E$"))|.vendorUserCount//empty][0]//"?"' "$PREVIEW")
  MATRIX=$(jq -r '
    [.data.devices[]|select(.name|test("Device [A-F]$"))|
      ((.name|capture("Device (?<L>[A-F])$").L)//"?") as $L |
      "\($L)=\(.vendorUserCount//"n")/\(.hrisUserCount//0)"
    ]|join(" ")
  ' "$PREVIEW" 2>/dev/null || echo matrix_jq_fail)
  rm -f "$PREVIEW"
  log "MATRIX $MATRIX E_FROM=$E_FROM"
  hb "cycle=$cycle matrix=$MATRIX E_from=$E_FROM"

  JOBS=$(mktemp)
  code=$(auth_curl GET '/api/device/hikvision/sdk-users/merge/jobs' '' "$JOBS" 30)
  RUNNING=$(jq -r '.data.running // 0' "$JOBS" 2>/dev/null || echo 0)
  rm -f "$JOBS"
  log "merge_running=$RUNNING"
  if [[ "${RUNNING:-0}" -gt 0 ]]; then
    write_status "$cycle" "$E_FROM" "?" "running=$RUNNING" "wait active job"
    hb "cycle=$cycle wait_running=$RUNNING"
    sleep "$SLEEP_SEC"
    continue
  fi

  log "PLAN start"
  PLAN_BODY=$(mktemp)
  PLAN_OUT=$(mktemp)
  cat >"$PLAN_BODY" <<JSON
{"deviceIds":["$A_ID","$B_ID","$C_ID","$D_ID","$E_ID","$F_ID"]}
JSON
  code=$(auth_curl POST '/api/device/hikvision/sdk-users/merge/plan' "$PLAN_BODY" "$PLAN_OUT" 400)
  rm -f "$PLAN_BODY"
  if [[ "$code" != "200" && "$code" != "201" ]]; then
    log "PLAN_FAIL code=$code body=$(head -c 200 "$PLAN_OUT")"
    rm -f "$PLAN_OUT"
    write_status "$cycle" "$E_FROM" "?" "plan_fail" "code=$code"
    hb "cycle=$cycle plan_fail code=$code"
    sleep "$SLEEP_SEC"
    continue
  fi
  PLAN_ID=$(jq -r '.data.planId // empty' "$PLAN_OUT")
  MISSING_JSON=$(jq -c --arg a "$A_ID" --arg b "$B_ID" --arg c "$C_ID" --arg d "$D_ID" --arg e "$E_ID" --arg f "$F_ID" '
    .data.plan.users as $u | {
      A:([$u[]|select(.missingOnDeviceIds!=null and (.missingOnDeviceIds|index($a)))]|length),
      B:([$u[]|select(.missingOnDeviceIds!=null and (.missingOnDeviceIds|index($b)))]|length),
      C:([$u[]|select(.missingOnDeviceIds!=null and (.missingOnDeviceIds|index($c)))]|length),
      D:([$u[]|select(.missingOnDeviceIds!=null and (.missingOnDeviceIds|index($d)))]|length),
      E:([$u[]|select(.missingOnDeviceIds!=null and (.missingOnDeviceIds|index($e)))]|length),
      F:([$u[]|select(.missingOnDeviceIds!=null and (.missingOnDeviceIds|index($f)))]|length),
      any:([$u[]|select(.missingOnDeviceIds!=null and (.missingOnDeviceIds|length>0))]|length),
      decisions:([$u[]|select(.conflicts!=null and (.conflicts|length>0))]|length)
    }
  ' "$PLAN_OUT" 2>/dev/null || echo '{}')
  echo "$MISSING_JSON" >"$LOG_DIR/missing-counts-latest.json"
  MISSING_ANY=$(echo "$MISSING_JSON" | jq -r '.any // 0')
  MISSING_E=$(echo "$MISSING_JSON" | jq -r '.E // 0')
  DECISIONS=$(echo "$MISSING_JSON" | jq -r '.decisions // 0')
  log "PLAN ok id=$PLAN_ID missing=$MISSING_JSON"
  hb "cycle=$cycle plan=$PLAN_ID missing_any=$MISSING_ANY missing_E=$MISSING_E decisions=$DECISIONS E_from=$E_FROM"

  if [[ "${MISSING_ANY:-0}" -eq 0 ]]; then
    log "DONE missing_any=0 E_from=$E_FROM decisions=$DECISIONS"
    write_status "$cycle" "$E_FROM" "0" "idle" "headcount missing burned; decisions=$DECISIONS finger/face not this loop"
    hb "cycle=$cycle DONE missing_any=0 E_from=$E_FROM"
    rm -f "$PLAN_OUT"
    sleep 180
    continue
  fi

  # Prefer E missing keys without conflicts; never mix unresolved decision rows first
  KEYS_FILE=$(mktemp)
  AMBIG=$(jq -r '(.data.plan.ambiguousMatches//[])|length' "$PLAN_OUT")
  PERR=$(jq -r '((.data.plan.errors//[])|length)' "$PLAN_OUT")
  log "plan_ambiguous=$AMBIG plan_errors=$PERR"
  jq -c --arg e "$E_ID" --argjson n "$WAVE_SIZE" '
    .data.plan.users as $u
    | (
        [$u[]|select(.missingOnDeviceIds!=null and (.missingOnDeviceIds|index($e)) and ((.conflicts//[])|length)==0)|.key]
        + [$u[]|select(.missingOnDeviceIds!=null and (.missingOnDeviceIds|length>0) and ((.conflicts//[])|length)==0)|.key]
        + [$u[]|select(.missingOnDeviceIds!=null and (.missingOnDeviceIds|index($e)))|.key]
      ) | unique | .[0:$n]
  ' "$PLAN_OUT" >"$KEYS_FILE"
  WAVE_N=$(jq 'length' "$KEYS_FILE")
  log "WAVE_N=$WAVE_N"
  if [[ "${WAVE_N:-0}" -le 0 ]]; then
    log "WAVE empty despite missing_any=$MISSING_ANY"
    rm -f "$PLAN_OUT" "$KEYS_FILE"
    sleep "$SLEEP_SEC"
    continue
  fi

  REV_BODY=$(mktemp)
  REV_OUT=$(mktemp)
  # applyAll A + autoResolve: make subset review executable even with profile conflicts
  jq -n --arg p "$PLAN_ID" --slurpfile k "$KEYS_FILE" \
    '{planId:$p, selectedUserKeys:$k[0], autoResolveDecisions:true, applyAll:"A"}' >"$REV_BODY"
  code=$(auth_curl POST '/api/device/hikvision/sdk-users/merge/review' "$REV_BODY" "$REV_OUT" 180)
  rm -f "$REV_BODY"
  if [[ "$code" != "200" && "$code" != "201" ]]; then
    log "REVIEW_FAIL code=$code $(head -c 280 "$REV_OUT")"
    # Retry once with only zero-conflict keys if first wave mixed
    jq -c --arg e "$E_ID" --argjson n "$WAVE_SIZE" '
      [.data.plan.users[]|select(.missingOnDeviceIds!=null and (.missingOnDeviceIds|index($e)) and ((.conflicts//[])|length)==0)|.key][0:$n]
    ' "$PLAN_OUT" >"$KEYS_FILE"
    WAVE_N=$(jq 'length' "$KEYS_FILE")
    log "REVIEW retry WAVE_N=$WAVE_N zero-conflict only"
    if [[ "${WAVE_N:-0}" -gt 0 ]]; then
      REV_BODY=$(mktemp)
      jq -n --arg p "$PLAN_ID" --slurpfile k "$KEYS_FILE" \
        '{planId:$p, selectedUserKeys:$k[0], autoResolveDecisions:true, applyAll:"A"}' >"$REV_BODY"
      code=$(auth_curl POST '/api/device/hikvision/sdk-users/merge/review' "$REV_BODY" "$REV_OUT" 180)
      rm -f "$REV_BODY"
    fi
  fi
  if [[ "$code" != "200" && "$code" != "201" ]]; then
    log "REVIEW_FAIL final code=$code $(head -c 280 "$REV_OUT")"
    rm -f "$PLAN_OUT" "$KEYS_FILE" "$REV_OUT"
    write_status "$cycle" "$E_FROM" "$MISSING_ANY" "review_fail" "code=$code ambig=$AMBIG"
    hb "cycle=$cycle review_fail code=$code ambig=$AMBIG"
    sleep "$SLEEP_SEC"
    continue
  fi
  SCOPE=$(jq -r '.data.scopeHash // empty' "$REV_OUT")
  PHYS=$(jq -r '.data.physicalWrites // 0' "$REV_OUT")
  log "REVIEW physical=$PHYS scope=${SCOPE:0:12}"
  rm -f "$REV_OUT"

  JOB_BODY=$(mktemp)
  JOB_OUT=$(mktemp)
  jq -n --arg p "$PLAN_ID" --arg s "$SCOPE" --slurpfile k "$KEYS_FILE" \
    '{planId:$p, mode:"users", selectedUserKeys:$k[0], autoResolveDecisions:true, applyAll:"A", expectedScopeHash:$s, dryRun:false}' >"$JOB_BODY"
  code=$(auth_curl POST '/api/device/hikvision/sdk-users/merge/jobs' "$JOB_BODY" "$JOB_OUT" 180)
  rm -f "$JOB_BODY" "$KEYS_FILE"
  if [[ "$code" != "200" && "$code" != "201" && "$code" != "202" ]]; then
    log "JOB_START_FAIL code=$code $(head -c 300 "$JOB_OUT")"
    rm -f "$PLAN_OUT" "$JOB_OUT"
    write_status "$cycle" "$E_FROM" "$MISSING_ANY" "start_fail" "code=$code"
    hb "cycle=$cycle job_start_fail code=$code"
    sleep "$SLEEP_SEC"
    continue
  fi
  JOB_ID=$(jq -r '.data.jobId // empty' "$JOB_OUT")
  cp "$JOB_OUT" "$LOG_DIR/job-start-latest.json"
  rm -f "$JOB_OUT" "$PLAN_OUT"
  log "JOB_START id=$JOB_ID"
  hb "cycle=$cycle job_start=$JOB_ID wave=$WAVE_N missing_E=$MISSING_E"

  # poll up to ~8 min
  for i in $(seq 1 40); do
    sleep 12
    POLL=$(mktemp)
    code=$(auth_curl GET "/api/device/hikvision/sdk-users/merge/jobs/$JOB_ID" '' "$POLL" 60)
    if [[ "$code" != "200" ]]; then
      log "POLL fail code=$code"
      rm -f "$POLL"
      continue
    fi
    ST=$(jq -r '.data.status // empty' "$POLL")
    OK=$(jq -r '.data.successfulWrites // 0' "$POLL")
    FAIL=$(jq -r '.data.failedWrites // 0' "$POLL")
    TOT=$(jq -r '.data.totalWrites // 0' "$POLL")
    PROC=$(jq -r '.data.processedWrites // 0' "$POLL")
    STAGE=$(jq -r '.data.currentStage // empty' "$POLL")
    STALE=$(jq -r '.data.stale // false' "$POLL")
    log "poll=$i job=$JOB_ID status=$ST ok=$OK fail=$FAIL proc=$PROC/$TOT stage=$STAGE stale=$STALE"
    hb "cycle=$cycle poll=$i job=$JOB_ID status=$ST ok=$OK fail=$FAIL proc=$PROC/$TOT E_from=$E_FROM missing_E=$MISSING_E"
    cp "$POLL" "$LOG_DIR/job-poll-latest.json"
    rm -f "$POLL"
    if [[ "$ST" == "completed" || "$ST" == "failed" || "$STALE" == "true" ]]; then
      write_status "$cycle" "$E_FROM" "$MISSING_ANY" "$JOB_ID $ST ok=$OK fail=$FAIL" "missing=$MISSING_JSON"
      break
    fi
  done

  # post matrix
  PREVIEW=$(mktemp)
  auth_curl GET '/api/device/sync-preview?quick=true' '' "$PREVIEW" 90 >/dev/null || true
  E_FROM=$(jq -r '[.data.devices[]|select(.name|test("Device E$"))|.vendorUserCount//empty][0]//"?"' "$PREVIEW" 2>/dev/null || echo "?")
  rm -f "$PREVIEW"
  log "POST_JOB E_from=$E_FROM"
  hb "cycle=$cycle post_job E_from=$E_FROM"
  sleep 8
done
