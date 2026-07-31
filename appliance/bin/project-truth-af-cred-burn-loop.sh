#!/usr/bin/env bash
# Durable Main A/B/D/E/F credential burn supervisor (VM nohup).
# Burns profile decisions + face + fingerprint via recovery waves.
# Separate from people-only project-truth-af-burn-loop.sh.
# Survives host disconnect. Single-instance lock.
set -u
set -o pipefail

API_BASE="${PT_API_BASE:-http://127.0.0.1:3101}"
EMAIL="${PT_EMAIL:-admin@bandai.local}"
PASSWORD="${PT_PASSWORD:-password123}"
APP_CODE="${PT_APP_CODE:-hris}"
WAVE_MAX="${PT_WAVE_MAX:-50}"
SLEEP_SEC="${PT_SLEEP_SEC:-20}"
IDLE_SLEEP_SEC="${PT_IDLE_SLEEP_SEC:-90}"
# FP waves with replan+serial physical write often need 15–25 min.
# Old defaults POLL_MAX=40 * POLL_SLEEP=12 ≈ 8 min caused premature timeout
# while job was still recovering (verified still climbing after poll end).
POLL_MAX="${PT_POLL_MAX:-150}"
POLL_SLEEP="${PT_POLL_SLEEP:-10}"
# Hard ceiling so one stuck job cannot block forever (~50 min at 10s).
POLL_HARD_MAX="${PT_POLL_HARD_MAX:-300}"

# Main A/B/D/E/F always. Main C is included only when live From is readable
# (source_unavailable → skip C; face residual to C burns when C returns).
# TEST A/B always excluded.
A_ID=cmrht5s2w00ei7zgsre8y3o5n
B_ID=cmpxw13hx002h7zwso7dyedrn
C_ID=cmripjwbx00ewl001ihcke210
D_ID=cmripjwkw00ffl0013lfxcbxw
E_ID=cmriu5ab102goi001x9o7nfct
F_ID=cmrim1zop05ik7zp4zgm2sm4k

if mkdir -p /var/log/project-truth/af-cred-burn 2>/dev/null; then
  LOG_DIR=/var/log/project-truth/af-cred-burn
else
  LOG_DIR=/tmp/project-truth-af-cred-burn
  mkdir -p "$LOG_DIR"
fi

LOCK="$LOG_DIR/af-cred-burn.lock"
PIDF="$LOG_DIR/af-cred-burn.pid"
LOGF="$LOG_DIR/cycle.log"
HBF="$LOG_DIR/HEARTBEATS.log"
STATUSF="$LOG_DIR/STATUS.md"
NOHUP="$LOG_DIR/nohup.out"
BLOCKERF="$LOG_DIR/BLOCKER.json"
MATRIXF="$LOG_DIR/matrix-latest.json"

log() {
  printf '%s %s\n' "$(date -Is)" "$*" >>"$LOGF"
  printf '%s %s\n' "$(date -Is)" "$*" >>"$NOHUP"
}

hb() {
  printf 'HEARTBEAT | ts=%s | %s\n' "$(date -Is)" "$*" >>"$HBF"
  printf 'HEARTBEAT | ts=%s | %s\n' "$(date -Is)" "$*" >>"$NOHUP"
}

# Single instance via mkdir lock
if ! mkdir "$LOCK" 2>/dev/null; then
  if [[ -f "$PIDF" ]]; then
    old=$(cat "$PIDF" 2>/dev/null || true)
    if [[ -n "${old:-}" ]] && kill -0 "$old" 2>/dev/null; then
      echo "another af-cred-burn running pid=$old" >&2
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
  local method="$1" path="$2" body="${3:-}" out="${4:-}" max="${5:-180}" code
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
  # write_status cycle decisions uFace uFp faceReady fpReady job note
  cat >"$STATUSF" <<EOF
# A/B/D/E/F durable credential burn (VM)

Updated: $(date -Is)
PID: $$
API: $API_BASE
Devices: A B D E F + C-if-readable
Cycle: $1
decision: $2
uFace: $3
uFp: $4
faceReady: $5
fpReady: $6
job: $7
note: $8
includeC: ${INCLUDE_C:-false}

Watch:
  tail -f $HBF
  tail -f $LOGF
  cat $STATUSF
Stop:
  kill \$(cat $PIDF); rmdir $LOCK 2>/dev/null
EOF
}

# Returns deviceIds JSON array. Sets INCLUDE_C=true|false.
build_device_ids_json() {
  local out code include_c=false
  out=$(mktemp)
  code=$(auth_curl GET '/api/device/sync-preview?quick=true' '' "$out" 90)
  if [[ "$code" == "200" ]]; then
    local c_from c_status
    c_from=$(jq -r --arg id "$C_ID" '
      (.data.devices//[])[]
      | select((.deviceId//.id)==$id or (.name|test("Device C$")))
      | .vendorUserCount // empty
    ' "$out" 2>/dev/null | head -1)
    c_status=$(jq -r --arg id "$C_ID" '
      (.data.devices//[])[]
      | select((.deviceId//.id)==$id or (.name|test("Device C$")))
      | .status // empty
    ' "$out" 2>/dev/null | head -1)
    if [[ "$c_status" == "user_count_ready" && -n "${c_from:-}" && "${c_from}" =~ ^[0-9]+$ && "$c_from" -ge 800 ]]; then
      include_c=true
    fi
  fi
  rm -f "$out"
  INCLUDE_C=$include_c
  if [[ "$include_c" == "true" ]]; then
    echo "[\"$A_ID\",\"$B_ID\",\"$C_ID\",\"$D_ID\",\"$E_ID\",\"$F_ID\"]"
  else
    echo "[\"$A_ID\",\"$B_ID\",\"$D_ID\",\"$E_ID\",\"$F_ID\"]"
  fi
}

write_blocker() {
  # write_blocker class reason residual_json would_face would_fp
  cat >"$BLOCKERF" <<EOF
{
  "ts": "$(date -Is)",
  "pid": $$,
  "class": "$1",
  "reason": "$2",
  "wouldFace": $3,
  "wouldFp": $4,
  "residual": $5,
  "note": "wouldWrite=0 with residual>0 — replan next cycle; agent-owned export/code fix"
}
EOF
  log "BLOCKER class=$1 reason=$2 wouldFace=$3 wouldFp=$4"
}

any_active_jobs() {
  local out code running recovery_running active_id
  out=$(mktemp)
  code=$(auth_curl GET '/api/device/hikvision/sdk-users/merge/jobs' '' "$out" 30)
  running=$(jq -r '.data.running // 0' "$out" 2>/dev/null || echo 0)
  rm -f "$out"
  out=$(mktemp)
  code=$(auth_curl GET '/api/device/hikvision/sdk-users/merge/recovery/jobs?limit=20' '' "$out" 30)
  # Only truly in-flight statuses count as active.
  # needs_attention / awaiting_replan / completed / failed are terminal for the supervisor.
  # Keep jq simple (no def) — some appliance jq builds mishandle nested defs here.
  recovery_running=$(jq -r '
    [
      (.data.jobs // [])[]
      | select(
          .status=="recovering" or .status=="running" or .status=="queued"
          or .status=="pending" or .status=="in_progress" or .status=="writing"
          or .status=="starting"
        )
    ] | length
  ' "$out" 2>/dev/null || echo 0)
  active_id=$(jq -r '
    (.data.activeJobId // .data.activeJob.id // empty) as $aid
    | if ($aid|tostring|length) > 0 then $aid
      else
        (
          [
            (.data.jobs // [])[]
            | select(
                .status=="recovering" or .status=="running" or .status=="queued"
                or .status=="pending" or .status=="in_progress" or .status=="writing"
                or .status=="starting"
              )
            | .id
          ]
          | first
        ) // empty
      end
  ' "$out" 2>/dev/null || true)
  # last-resort: scrape "already active" style id from raw if counters missing
  if [[ -z "${active_id:-}" && "${recovery_running:-0}" -gt 0 ]]; then
    active_id=$(jq -r '[.data.jobs[]?|select(.status=="recovering")|.id]|first // empty' "$out" 2>/dev/null || true)
  fi
  rm -f "$out"
  log "ACTIVE_PROBE merge=${running:-0} recovery=${recovery_running:-0} active=${active_id:-} code=$code"
  if [[ "${running:-0}" -gt 0 || "${recovery_running:-0}" -gt 0 ]]; then
    echo "merge=$running recovery=$recovery_running active=${active_id:-}"
    return 0
  fi
  return 1
}

poll_merge_job() {
  local job_id="$1" label="${2:-merge}" i ST OK FAIL TOT PROC STAGE STALE code POLL
  for i in $(seq 1 "$POLL_MAX"); do
    sleep "$POLL_SLEEP"
    POLL=$(mktemp)
    code=$(auth_curl GET "/api/device/hikvision/sdk-users/merge/jobs/$job_id" '' "$POLL" 60)
    if [[ "$code" != "200" ]]; then
      log "POLL_$label fail code=$code"
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
    log "poll_$label=$i job=$job_id status=$ST ok=$OK fail=$FAIL proc=$PROC/$TOT stage=$STAGE"
    hb "cycle=$cycle poll=$i kind=$label job=$job_id status=$ST ok=$OK fail=$FAIL"
    cp "$POLL" "$LOG_DIR/job-poll-latest.json"
    rm -f "$POLL"
    if [[ "$ST" == "completed" || "$ST" == "failed" || "$STALE" == "true" ]]; then
      echo "$ST ok=$OK fail=$FAIL"
      return 0
    fi
  done
  echo "timeout"
  return 1
}

poll_recovery_job() {
  local job_id="$1" label="${2:-recovery}" would="${3:-0}" i ST VER FAIL TOT STAGE PHASE code POLL
  local last_ver=-1 stagnant=0 soft_max="$POLL_MAX"
  i=0
  while [[ "$i" -lt "$POLL_HARD_MAX" ]]; do
    i=$((i + 1))
    sleep "$POLL_SLEEP"
    POLL=$(mktemp)
    code=$(auth_curl GET "/api/device/hikvision/sdk-users/merge/recovery/jobs/$job_id" '' "$POLL" 60)
    if [[ "$code" != "200" ]]; then
      log "POLL_$label fail code=$code"
      rm -f "$POLL"
      continue
    fi
    # Prefer counters.verified (live durable job shape). Fall back to legacy fields.
    ST=$(jq -r '.data.job.status // .data.status // empty' "$POLL")
    VER=$(jq -r '
      .data.job.counters.verified // .data.counters.verified //
      .data.job.verifiedWrites // .data.verifiedWrites //
      .data.job.successfulWrites // .data.successfulWrites // 0
    ' "$POLL")
    FAIL=$(jq -r '
      .data.job.counters.failed // .data.counters.failed //
      .data.job.failedWrites // .data.failedWrites // 0
    ' "$POLL")
    TOT=$(jq -r '
      .data.job.counters.recoveringNow // .data.counters.recoveringNow //
      .data.job.totalWrites // .data.totalWrites //
      .data.job.plannedWrites // .data.plannedWrites // 0
    ' "$POLL")
    STAGE=$(jq -r '.data.job.currentStage // .data.currentStage // empty' "$POLL")
    PHASE=$(jq -r '.data.job.counters.phase // .data.counters.phase // empty' "$POLL")
    log "poll_$label=$i job=$job_id status=$ST verified=$VER fail=$FAIL tot=$TOT stage=$STAGE phase=$PHASE would=$would"
    hb "cycle=$cycle poll=$i kind=$label job=$job_id status=$ST verified=$VER fail=$FAIL would=$would phase=$PHASE"
    cp "$POLL" "$LOG_DIR/recovery-poll-latest.json"
    rm -f "$POLL"
    if [[ "$ST" == "completed" || "$ST" == "failed" || "$ST" == "needs_attention" || "$ST" == "awaiting_replan" ]]; then
      echo "$ST verified=$VER fail=$FAIL"
      return 0
    fi
    # Adaptive soft budget: if still recovering and verified is moving, keep going.
    if [[ "$ST" == "recovering" || "$ST" == "running" || "$ST" == "writing" ]]; then
      if [[ "$VER" != "$last_ver" ]]; then
        stagnant=0
        last_ver=$VER
        # extend soft ceiling while progress is real
        if [[ "$i" -ge "$soft_max" && "$soft_max" -lt "$POLL_HARD_MAX" ]]; then
          soft_max=$((soft_max + 60))
          if [[ "$soft_max" -gt "$POLL_HARD_MAX" ]]; then soft_max=$POLL_HARD_MAX; fi
          log "POLL_$label extend soft_max=$soft_max verified=$VER"
        fi
      else
        stagnant=$((stagnant + 1))
      fi
    fi
    # Soft timeout only when no progress for long after soft_max, or hard max hit
    if [[ "$i" -ge "$soft_max" ]]; then
      # still writing with progress recently? keep until hard max
      if [[ "$stagnant" -lt 30 && ( "$ST" == "recovering" || "$ST" == "running" || "$ST" == "writing" ) ]]; then
        continue
      fi
      log "POLL_$label soft_timeout i=$i stagnant=$stagnant verified=$VER"
      echo "timeout verified=$VER fail=$FAIL"
      return 1
    fi
  done
  echo "timeout verified=${VER:-0} fail=${FAIL:-0}"
  return 1
}

run_decision_wave() {
  local plan_id="$1" plan_out="$2" decisions="$3"
  local KEYS_FILE REV_BODY REV_OUT JOB_BODY JOB_OUT code SCOPE JOB_ID WAVE_N result

  if [[ "${decisions:-0}" -le 0 ]]; then
    log "DECISION skip decisions=0"
    return 0
  fi

  KEYS_FILE=$(mktemp)
  jq -c --argjson n "$WAVE_MAX" '
    [.data.plan.users[]|select((.conflicts//[])|length>0)|.key][0:$n]
  ' "$plan_out" >"$KEYS_FILE"
  WAVE_N=$(jq 'length' "$KEYS_FILE")
  log "DECISION keys=$WAVE_N"
  if [[ "${WAVE_N:-0}" -le 0 ]]; then
    rm -f "$KEYS_FILE"
    return 0
  fi

  REV_BODY=$(mktemp)
  REV_OUT=$(mktemp)
  jq -n --arg p "$plan_id" --slurpfile k "$KEYS_FILE" \
    '{planId:$p, selectedUserKeys:$k[0], autoResolveDecisions:true, applyAll:"A"}' >"$REV_BODY"
  code=$(auth_curl POST '/api/device/hikvision/sdk-users/merge/review' "$REV_BODY" "$REV_OUT" 180)
  rm -f "$REV_BODY"
  if [[ "$code" != "200" && "$code" != "201" ]]; then
    log "DECISION_REVIEW_FAIL code=$code $(head -c 240 "$REV_OUT")"
    rm -f "$KEYS_FILE" "$REV_OUT"
    return 1
  fi
  SCOPE=$(jq -r '.data.scopeHash // empty' "$REV_OUT")
  PHYS=$(jq -r '.data.physicalWrites // 0' "$REV_OUT")
  log "DECISION review physical=$PHYS scope=${SCOPE:0:12}"
  rm -f "$REV_OUT"

  if [[ -z "$SCOPE" ]]; then
    log "DECISION no scopeHash — skip job (review may have closed without writes)"
    rm -f "$KEYS_FILE"
    return 0
  fi

  JOB_BODY=$(mktemp)
  JOB_OUT=$(mktemp)
  jq -n --arg p "$plan_id" --arg s "$SCOPE" --slurpfile k "$KEYS_FILE" \
    '{planId:$p, mode:"users", selectedUserKeys:$k[0], autoResolveDecisions:true, applyAll:"A", expectedScopeHash:$s, dryRun:false}' >"$JOB_BODY"
  code=$(auth_curl POST '/api/device/hikvision/sdk-users/merge/jobs' "$JOB_BODY" "$JOB_OUT" 180)
  rm -f "$JOB_BODY" "$KEYS_FILE"
  if [[ "$code" != "200" && "$code" != "201" && "$code" != "202" ]]; then
    log "DECISION_JOB_FAIL code=$code $(head -c 280 "$JOB_OUT")"
    rm -f "$JOB_OUT"
    return 1
  fi
  JOB_ID=$(jq -r '.data.jobId // empty' "$JOB_OUT")
  cp "$JOB_OUT" "$LOG_DIR/decision-job-start-latest.json"
  rm -f "$JOB_OUT"
  log "DECISION_JOB id=$JOB_ID"
  hb "cycle=$cycle decision_job=$JOB_ID wave=$WAVE_N"
  result=$(poll_merge_job "$JOB_ID" "decision")
  log "DECISION_DONE $result"
  LAST_JOB="decision:$JOB_ID $result"
  return 0
}

run_recovery_wave() {
  local plan_id="$1" modality="$2"
  local REV_BODY REV_OUT DRY_BODY DRY_OUT JOB_BODY JOB_OUT code SCOPE WOULD FACE_R FP_R JOB_ID result

  REV_BODY=$(mktemp)
  REV_OUT=$(mktemp)
  jq -n --arg p "$plan_id" --arg m "$modality" --argjson n "$WAVE_MAX" \
    '{planId:$p, canaryModality:$m, maxVerifiedWrites:$n}' >"$REV_BODY"
  code=$(auth_curl POST '/api/device/hikvision/sdk-users/merge/recovery/review' "$REV_BODY" "$REV_OUT" 240)
  rm -f "$REV_BODY"
  if [[ "$code" != "200" && "$code" != "201" ]]; then
    log "RECOVERY_REVIEW_FAIL modality=$modality code=$code $(head -c 240 "$REV_OUT")"
    rm -f "$REV_OUT"
    return 1
  fi
  cp "$REV_OUT" "$LOG_DIR/recovery-review-${modality}-latest.json"
  SCOPE=$(jq -r '.data.scopeHash // empty' "$REV_OUT")
  WOULD=$(jq -r '.data.executionPreview.wouldWriteCount // 0' "$REV_OUT")
  FACE_R=$(jq -r '.data.executionPreview.faceReady // .data.counters.faceReady // 0' "$REV_OUT")
  FP_R=$(jq -r '.data.executionPreview.fingerprintReady // .data.counters.fingerprintReady // 0' "$REV_OUT")
  BLOCK_ZERO=$(jq -c '.data.executionPreview.blockReasonsWhenZeroReady // {}' "$REV_OUT" 2>/dev/null || echo '{}')
  log "RECOVERY_REVIEW modality=$modality would=$WOULD faceReady=$FACE_R fpReady=$FP_R scope=${SCOPE:0:12}"
  hb "cycle=$cycle recovery_review modality=$modality would=$WOULD faceReady=$FACE_R fpReady=$FP_R"

  if [[ "$modality" == "face" ]]; then
    LAST_FACE_READY="$FACE_R"
    LAST_WOULD_FACE="$WOULD"
  else
    LAST_FP_READY="$FP_R"
    LAST_WOULD_FP="$WOULD"
  fi

  if [[ -z "$SCOPE" ]]; then
    log "RECOVERY no scopeHash modality=$modality"
    rm -f "$REV_OUT"
    return 1
  fi

  # dryRun first
  DRY_BODY=$(mktemp)
  DRY_OUT=$(mktemp)
  jq -n --arg p "$plan_id" --arg s "$SCOPE" --arg m "$modality" --argjson n "$WAVE_MAX" \
    '{planId:$p, expectedScopeHash:$s, canaryModality:$m, maxVerifiedWrites:$n, dryRun:true}' >"$DRY_BODY"
  code=$(auth_curl POST '/api/device/hikvision/sdk-users/merge/recovery/jobs' "$DRY_BODY" "$DRY_OUT" 240)
  rm -f "$DRY_BODY"
  if [[ "$code" != "200" && "$code" != "201" ]]; then
    log "RECOVERY_DRY_FAIL modality=$modality code=$code $(head -c 240 "$DRY_OUT")"
    rm -f "$REV_OUT" "$DRY_OUT"
    return 1
  fi
  DRY_WOULD=$(jq -r '.data.executionPreview.wouldWriteCount // .data.wouldWriteCount // 0' "$DRY_OUT")
  WILL=$(jq -r '.data.willCreateJob // false' "$DRY_OUT")
  log "RECOVERY_DRY modality=$modality would=$DRY_WOULD willCreate=$WILL"
  cp "$DRY_OUT" "$LOG_DIR/recovery-dry-${modality}-latest.json"
  rm -f "$DRY_OUT"
  WOULD="$DRY_WOULD"

  if [[ "$modality" == "face" ]]; then
    LAST_WOULD_FACE="$WOULD"
  else
    LAST_WOULD_FP="$WOULD"
  fi

  if [[ "${WOULD:-0}" -le 0 ]]; then
    log "RECOVERY skip write modality=$modality wouldWrite=0 block=$BLOCK_ZERO"
    rm -f "$REV_OUT"
    return 0
  fi

  # real write
  JOB_BODY=$(mktemp)
  JOB_OUT=$(mktemp)
  jq -n --arg p "$plan_id" --arg s "$SCOPE" --arg m "$modality" --argjson n "$WAVE_MAX" \
    '{planId:$p, expectedScopeHash:$s, canaryModality:$m, maxVerifiedWrites:$n, dryRun:false}' >"$JOB_BODY"
  code=$(auth_curl POST '/api/device/hikvision/sdk-users/merge/recovery/jobs' "$JOB_BODY" "$JOB_OUT" 240)
  rm -f "$JOB_BODY" "$REV_OUT"
  # 409 = another recovery job already active — poll it instead of failing hard
  if [[ "$code" == "409" ]]; then
    JOB_ID=$(jq -r '
      .data.activeJobId // .data.job.id // .data.jobId //
      (.message|capture("job (?<id>[a-z0-9]+) is already active")|.id) // empty
    ' "$JOB_OUT" 2>/dev/null || true)
    if [[ -z "$JOB_ID" ]]; then
      # extract cuid/uuid-ish token from message
      JOB_ID=$(grep -oE 'cms[a-z0-9]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' "$JOB_OUT" | head -1 || true)
    fi
    log "RECOVERY_JOB busy modality=$modality active=$JOB_ID $(head -c 160 "$JOB_OUT")"
    if [[ -n "$JOB_ID" ]]; then
      result=$(poll_recovery_job "$JOB_ID" "rec-active" 0)
      log "RECOVERY_ACTIVE_DONE $result"
      LAST_JOB="rec-active:$JOB_ID $result"
      rm -f "$JOB_OUT"
      return 0
    fi
    rm -f "$JOB_OUT"
    return 1
  fi
  if [[ "$code" != "200" && "$code" != "201" && "$code" != "202" ]]; then
    log "RECOVERY_JOB_FAIL modality=$modality code=$code $(head -c 280 "$JOB_OUT")"
    rm -f "$JOB_OUT"
    return 1
  fi
  # Response shape: data.job.id (durable) or data.jobId (legacy)
  JOB_ID=$(jq -r '.data.job.id // .data.jobId // .data.id // empty' "$JOB_OUT")
  if [[ -z "$JOB_ID" ]]; then
    log "RECOVERY_JOB no jobId modality=$modality body=$(head -c 280 "$JOB_OUT")"
    rm -f "$JOB_OUT"
    return 1
  fi
  cp "$JOB_OUT" "$LOG_DIR/recovery-job-start-${modality}-latest.json"
  rm -f "$JOB_OUT"
  log "RECOVERY_JOB modality=$modality id=$JOB_ID would=$WOULD"
  hb "cycle=$cycle recovery_job modality=$modality job=$JOB_ID would=$WOULD"
  result=$(poll_recovery_job "$JOB_ID" "rec-$modality" "$WOULD")
  log "RECOVERY_DONE modality=$modality $result"
  LAST_JOB="rec-$modality:$JOB_ID $result"
  return 0
}

cycle=0
LAST_JOB=none
LAST_FACE_READY=0
LAST_FP_READY=0
LAST_WOULD_FACE=0
LAST_WOULD_FP=0
DECISIONS=0
UFACE=0
UFP=0

INCLUDE_C=false
log "START pid=$$ api=$API_BASE wave_max=$WAVE_MAX devices=A,B,D,E,F+C-if-readable"
hb "start pid=$$ api=$API_BASE devices=A,B,D,E,F+C-if-readable"
write_status 0 "?" "?" "?" "?" "?" "none" "starting"

while true; do
  cycle=$((cycle + 1))
  log "CYCLE $cycle begin"
  LAST_JOB=none
  LAST_WOULD_FACE=0
  LAST_WOULD_FP=0

  if ! login; then
    write_status "$cycle" "?" "?" "?" "?" "?" "none" "login_fail"
    hb "cycle=$cycle login_fail"
    sleep "$SLEEP_SEC"
    continue
  fi
  log "login ok"

  # Wait if people-loop or recovery already writing — poll recovery to terminal
  if active=$(any_active_jobs); then
    active_id=$(echo "$active" | sed -n 's/.*active=\([^ ]*\).*/\1/p')
    if [[ -n "${active_id:-}" ]]; then
      log "WAIT_POLL pre-plan active recovery job=$active_id ($active)"
      hb "cycle=$cycle wait_poll_pre job=$active_id"
      result=$(poll_recovery_job "$active_id" "rec-active" 0)
      log "WAIT_POLL_PRE_DONE $result"
      LAST_JOB="rec-active:$active_id $result"
      write_status "$cycle" "$DECISIONS" "$UFACE" "$UFP" "$LAST_FACE_READY" "$LAST_FP_READY" "$LAST_JOB" "polled active recovery pre-plan"
      sleep 5
      # fall through to plan after terminal
    else
      log "WAIT active jobs: $active"
      write_status "$cycle" "$DECISIONS" "$UFACE" "$UFP" "$LAST_FACE_READY" "$LAST_FP_READY" "wait $active" "active job"
      hb "cycle=$cycle wait_active=$active"
      sleep "$SLEEP_SEC"
      continue
    fi
  fi

  # PLAN A/B/D/E/F (+ C when live From readable)
  PLAN_BODY=$(mktemp)
  PLAN_OUT=$(mktemp)
  IDS_JSON=$(build_device_ids_json)
  printf '{"deviceIds":%s}\n' "$IDS_JSON" >"$PLAN_BODY"
  log "PLAN start includeC=$INCLUDE_C ids=$IDS_JSON"
  code=$(auth_curl POST '/api/device/hikvision/sdk-users/merge/plan' "$PLAN_BODY" "$PLAN_OUT" 500)
  rm -f "$PLAN_BODY"
  if [[ "$code" != "200" && "$code" != "201" ]]; then
    log "PLAN_FAIL code=$code body=$(head -c 200 "$PLAN_OUT")"
    rm -f "$PLAN_OUT"
    write_status "$cycle" "?" "?" "?" "?" "?" "plan_fail" "code=$code"
    hb "cycle=$cycle plan_fail code=$code"
    sleep "$SLEEP_SEC"
    continue
  fi
  PLAN_ID=$(jq -r '.data.planId // empty' "$PLAN_OUT")
  cp "$PLAN_OUT" "$LOG_DIR/plan-latest.json"

  # residual matrix
  MATRIX=$(jq -c --arg a "$A_ID" --arg b "$B_ID" --arg d "$D_ID" --arg e "$E_ID" --arg f "$F_ID" '
    .data.plan as $p | {
      planId: .data.planId,
      uniqueIds: (($p.users//[])|length),
      decisions: ([($p.users//[])[]|select((.conflicts//[])|length>0)]|length),
      missingPeople: ([($p.users//[])[]|select((.missingOnDeviceIds//[])|length>0)]|length),
      decisionKeys: ([($p.users//[])[]|select((.conflicts//[])|length>0)|.key][0:20]),
      cwTotal: (($p.credentialWrites//[])|length),
      faceOps: ([($p.credentialWrites//[])[]|select(.modality=="face")]|length),
      fpOps: ([($p.credentialWrites//[])[]|select(.modality=="fingerprint")]|length),
      cardOps: ([($p.credentialWrites//[])[]|select(.modality=="card")]|length),
      uFace: ([($p.credentialWrites//[])[]|select(.modality=="face")|.vendorUserId//.userKey//.key]|unique|length),
      uFp: ([($p.credentialWrites//[])[]|select(.modality=="fingerprint")|.vendorUserId//.userKey//.key]|unique|length),
      faceReadyOps: ([($p.credentialWrites//[])[]|select(.modality=="face" and ((.executionEligibility//"")|test("ready";"i")))]|length),
      fpReadyOps: ([($p.credentialWrites//[])[]|select(.modality=="fingerprint" and ((.executionEligibility//"")|test("ready";"i")))]|length),
      blockedByReason: ((($p.credentialWrites//[])|group_by(.blockingReason//"null")|map({(.[0].blockingReason//"null"):length})|add)//{})
    }
  ' "$PLAN_OUT" 2>/dev/null || echo '{}')
  echo "$MATRIX" >"$MATRIXF"
  echo "$MATRIX" >"$LOG_DIR/matrix-cycle-$(printf '%03d' "$cycle").json"

  DECISIONS=$(echo "$MATRIX" | jq -r '.decisions // 0')
  UFACE=$(echo "$MATRIX" | jq -r '.uFace // 0')
  UFP=$(echo "$MATRIX" | jq -r '.uFp // 0')
  FACE_READY_OPS=$(echo "$MATRIX" | jq -r '.faceReadyOps // 0')
  FP_READY_OPS=$(echo "$MATRIX" | jq -r '.fpReadyOps // 0')
  log "PLAN ok id=$PLAN_ID matrix=$MATRIX"
  hb "cycle=$cycle plan=$PLAN_ID decision=$DECISIONS uFace=$UFACE uFp=$UFP faceReadyOps=$FACE_READY_OPS fpReadyOps=$FP_READY_OPS"
  write_status "$cycle" "$DECISIONS" "$UFACE" "$UFP" "$FACE_READY_OPS" "$FP_READY_OPS" "planned" "plan=$PLAN_ID"

  # If a recovery job is already active (from prior cycle / concurrent worker),
  # poll it to terminal before starting new waves — do not fake wouldWrite=0 BLOCKER.
  if active=$(any_active_jobs); then
    active_id=$(echo "$active" | sed -n 's/.*active=\([^ ]*\).*/\1/p')
    if [[ -n "${active_id:-}" ]]; then
      log "WAIT_POLL active recovery job=$active_id ($active)"
      hb "cycle=$cycle wait_poll job=$active_id"
      result=$(poll_recovery_job "$active_id" "rec-active" 0)
      log "WAIT_POLL_DONE $result"
      LAST_JOB="rec-active:$active_id $result"
      write_status "$cycle" "$DECISIONS" "$UFACE" "$UFP" \
        "${LAST_FACE_READY:-$FACE_READY_OPS}" "${LAST_FP_READY:-$FP_READY_OPS}" \
        "$LAST_JOB" "polled active recovery"
      rm -f "$PLAN_OUT"
      sleep 8
      continue
    fi
    log "WAIT other active jobs: $active"
    write_status "$cycle" "$DECISIONS" "$UFACE" "$UFP" \
      "${LAST_FACE_READY:-$FACE_READY_OPS}" "${LAST_FP_READY:-$FP_READY_OPS}" \
      "wait $active" "active job"
    hb "cycle=$cycle wait_active=$active"
    rm -f "$PLAN_OUT"
    sleep "$SLEEP_SEC"
    continue
  fi

  # 1) DECISION path
  if [[ "${DECISIONS:-0}" -gt 0 ]]; then
    run_decision_wave "$PLAN_ID" "$PLAN_OUT" "$DECISIONS" || log "DECISION wave error"
    # replan after decision job so recovery uses fresh plan
    if [[ "$LAST_JOB" == decision:* ]]; then
      PLAN_BODY=$(mktemp)
      IDS_JSON=$(build_device_ids_json)
      printf '{"deviceIds":%s}\n' "$IDS_JSON" >"$PLAN_BODY"
      code=$(auth_curl POST '/api/device/hikvision/sdk-users/merge/plan' "$PLAN_BODY" "$PLAN_OUT" 500)
      rm -f "$PLAN_BODY"
      if [[ "$code" == "200" || "$code" == "201" ]]; then
        PLAN_ID=$(jq -r '.data.planId // empty' "$PLAN_OUT")
        log "REPLAN after decision plan=$PLAN_ID"
      fi
    fi
  fi

  # 2) FACE recovery
  if active=$(any_active_jobs); then
    active_id=$(echo "$active" | sed -n 's/.*active=\([^ ]*\).*/\1/p')
    if [[ -n "${active_id:-}" ]]; then
      log "FACE wait_poll job=$active_id"
      result=$(poll_recovery_job "$active_id" "rec-active" 0)
      LAST_JOB="rec-active:$active_id $result"
    else
      log "FACE defer active=$active"
    fi
  else
    run_recovery_wave "$PLAN_ID" "face" || log "FACE wave error"
    if [[ "$LAST_JOB" == rec-face:* ]]; then
      PLAN_BODY=$(mktemp)
      cat >"$PLAN_BODY" <<JSON
{"deviceIds":["$A_ID","$B_ID","$D_ID","$E_ID","$F_ID"]}
JSON
      code=$(auth_curl POST '/api/device/hikvision/sdk-users/merge/plan' "$PLAN_BODY" "$PLAN_OUT" 500)
      rm -f "$PLAN_BODY"
      if [[ "$code" == "200" || "$code" == "201" ]]; then
        PLAN_ID=$(jq -r '.data.planId // empty' "$PLAN_OUT")
        log "REPLAN after face plan=$PLAN_ID"
      fi
    fi
  fi

  # 3) FP recovery
  if active=$(any_active_jobs); then
    active_id=$(echo "$active" | sed -n 's/.*active=\([^ ]*\).*/\1/p')
    if [[ -n "${active_id:-}" ]]; then
      log "FP wait_poll job=$active_id"
      result=$(poll_recovery_job "$active_id" "rec-active" 0)
      LAST_JOB="rec-active:$active_id $result"
    else
      log "FP defer active=$active"
    fi
  else
    run_recovery_wave "$PLAN_ID" "fingerprint" || log "FP wave error"
  fi

  rm -f "$PLAN_OUT"

  # residual after waves (refresh matrix counts if we still have last matrix)
  TOTAL_WOULD=$(( ${LAST_WOULD_FACE:-0} + ${LAST_WOULD_FP:-0} ))
  RESIDUAL_SUM=$(( ${DECISIONS:-0} + ${UFACE:-0} + ${UFP:-0} ))

  if [[ "${TOTAL_WOULD:-0}" -le 0 && "${RESIDUAL_SUM:-0}" -gt 0 ]]; then
    write_blocker "export_or_code_gate" \
      "wouldWrite=0 residual_decision=${DECISIONS} uFace=${UFACE} uFp=${UFP}" \
      "${LAST_WOULD_FACE:-0}" "${LAST_WOULD_FP:-0}" "$MATRIX"
    write_status "$cycle" "$DECISIONS" "$UFACE" "$UFP" \
      "${LAST_FACE_READY:-$FACE_READY_OPS}" "${LAST_FP_READY:-$FP_READY_OPS}" \
      "$LAST_JOB" "BLOCKER wouldWrite=0 residual>0"
    hb "cycle=$cycle BLOCKER wouldFace=${LAST_WOULD_FACE:-0} wouldFp=${LAST_WOULD_FP:-0} decision=$DECISIONS uFace=$UFACE uFp=$UFP job=$LAST_JOB"
    sleep "$IDLE_SLEEP_SEC"
  elif [[ "${RESIDUAL_SUM:-0}" -eq 0 ]]; then
    write_status "$cycle" 0 0 0 \
      "${LAST_FACE_READY:-0}" "${LAST_FP_READY:-0}" \
      "$LAST_JOB" "ALL residual burned — idle replan"
    hb "cycle=$cycle DONE residual=0 job=$LAST_JOB"
    sleep "$IDLE_SLEEP_SEC"
  else
    write_status "$cycle" "$DECISIONS" "$UFACE" "$UFP" \
      "${LAST_FACE_READY:-$FACE_READY_OPS}" "${LAST_FP_READY:-$FP_READY_OPS}" \
      "$LAST_JOB" "wave complete wouldFace=${LAST_WOULD_FACE:-0} wouldFp=${LAST_WOULD_FP:-0}"
    hb "cycle=$cycle end decision=$DECISIONS uFace=$UFACE uFp=$UFP faceReady=${LAST_FACE_READY:-$FACE_READY_OPS} fpReady=${LAST_FP_READY:-$FP_READY_OPS} wouldFace=${LAST_WOULD_FACE:-0} wouldFp=${LAST_WOULD_FP:-0} job=$LAST_JOB"
    sleep 8
  fi
done
