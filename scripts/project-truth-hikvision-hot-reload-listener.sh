#!/usr/bin/env bash
set -euo pipefail

WORK=/home/infra/project-truth-hikvision-biometric-service
SDK_ROOT=/home/infra/project-truth-hcnetsdk/EN-HCNetSDKV6.1.9.48_build20230410_linux64
LOCAL_API_BASE=${HIKVISION_HOT_RELOAD_API_BASE:-http://10.184.37.250:3001}
POSTGRES_CONTAINER=${HIKVISION_POSTGRES_CONTAINER:-hris-postgres-dev}
LOGIN_EMAIL=${HIKVISION_HOT_RELOAD_LOGIN_EMAIL:-admin@bandai.local}
LOGIN_PASSWORD=${HIKVISION_HOT_RELOAD_LOGIN_PASSWORD:-password123}
LOGIN_APP_CODE=${HIKVISION_HOT_RELOAD_APP_CODE:-hris}
SPEC=/run/project-truth/hikvision-hot-reload-device.spec
PREPARE_ONLY=0
RUN_ONCE=0
DEVICE_ID_FILTER=${HIKVISION_DEVICE_ID_FILTER:-}
PASSTHROUGH_ARGS=()

while [[ $# -gt 0 ]]; do
  case "${1:-}" in
    --prepare-only)
      PREPARE_ONLY=1
      shift
      ;;
    --run-once)
      RUN_ONCE=1
      shift
      ;;
    --device-id-filter)
      if [[ $# -lt 2 ]]; then
        echo "missing value for --device-id-filter" >&2
        exit 2
      fi
      DEVICE_ID_FILTER="$2"
      shift 2
      ;;
    --)
      shift
      PASSTHROUGH_ARGS+=("$@")
      break
      ;;
    *)
      PASSTHROUGH_ARGS+=("$1")
      shift
      ;;
  esac
done

if [[ "$PREPARE_ONLY" == "1" && ${#PASSTHROUGH_ARGS[@]} -gt 0 ]]; then
  echo "--prepare-only does not accept passthrough runtime arguments" >&2
  exit 2
fi

mkdir -p /run/project-truth /var/log/project-truth

fetch_hikvision_hris_token() {
  local login_url="${LOCAL_API_BASE%/}/api/auth/login"
  local login_payload
  login_payload=$(python3 - <<'PY'
import json
import os
print(json.dumps({
    "email": os.environ["LOGIN_EMAIL"],
    "password": os.environ["LOGIN_PASSWORD"],
    "appCode": os.environ["LOGIN_APP_CODE"],
}))
PY
)

  local login_response
  login_response=$(curl --fail --silent --show-error \
    -H 'Content-Type: application/json' \
    --data "$login_payload" \
    "$login_url")

  LOGIN_RESPONSE="$login_response" python3 - <<'PY'
import json
import os
payload = json.loads(os.environ["LOGIN_RESPONSE"])
token = (((payload or {}).get("data") or {}).get("token") or "").strip()
if not token:
    raise SystemExit("missing auth token in login response")
print(token)
PY
}

query=$(cat <<'SQL'
COPY (
  SELECT
    id,
    "organizationId",
    regexp_replace(name, E'[\\r\\n|]+', ' ', 'g'),
    address,
    COALESCE(config->>'sdkPort', '8000'),
    COALESCE(access->>'username', ''),
    COALESCE(access->>'password', '')
  FROM "Device"
  WHERE "isDeleted" = false
    AND COALESCE(config->>'vendor', '') = 'Hikvision'
    AND COALESCE(access->>'password', '') <> ''
  ORDER BY name, id
) TO STDOUT WITH DELIMITER '|'
SQL
)

rows=$(
  docker exec -i "$POSTGRES_CONTAINER" \
    psql -U postgres -d hris -v ON_ERROR_STOP=1 -qAt -c "$query" | tr -d '\r'
)

if [[ -z "${rows:-}" ]]; then
  echo "missing Hikvision device rows or credentials" >&2
  exit 2
fi

tmp_spec=$(mktemp /tmp/project-truth-hikvision-device.XXXXXX)
trap 'rm -f "$tmp_spec"' EXIT

while IFS='|' read -r device_id org_id device_name device_addr sdk_port sdk_user sdk_pass; do
  [[ -n "${device_id:-}" ]] || continue
  [[ -n "${sdk_pass:-}" ]] || continue
  if [[ -n "${DEVICE_ID_FILTER:-}" ]]; then
    case ",${DEVICE_ID_FILTER}," in
      *,"${device_id}",*) ;;
      *) continue ;;
    esac
  fi
  printf '%s|%s|%s|%s|%s|%s|%s|true\n' \
    "$device_id" \
    "$org_id" \
    "$device_name" \
    "$device_addr" \
    "${sdk_port:-8000}" \
    "$sdk_user" \
    "$sdk_pass" >> "$tmp_spec"
done <<< "$rows"

if [[ ! -s "$tmp_spec" ]]; then
  echo "no Hikvision device rows with usable credentials were prepared" >&2
  exit 2
fi

umask 077
install -m 600 "$tmp_spec" "$SPEC"

if [[ "$PREPARE_ONLY" == "1" ]]; then
  exit 0
fi

cd "$WORK"
export HIKVISION_LINUX_SDK_ROOT="$SDK_ROOT"
export LD_LIBRARY_PATH="$SDK_ROOT/lib:$SDK_ROOT:$SDK_ROOT/HCNetSDKCom:${LD_LIBRARY_PATH:-}"
export LOGIN_EMAIL LOGIN_PASSWORD LOGIN_APP_CODE
export HIKVISION_HRIS_API_TOKEN="$(fetch_hikvision_hris_token)"

cmd=(
  ./build/hikvision-biometric-service
  --device-file "$SPEC"
  --hris-api-base "$LOCAL_API_BASE"
  --evidence-jsonl /var/log/project-truth/hikvision-hot-reload-listener.jsonl
)

if [[ "$RUN_ONCE" == "1" ]]; then
  cmd+=(--seconds "${HIKVISION_RUN_SECONDS:-1}")
fi

if [[ ${#PASSTHROUGH_ARGS[@]} -gt 0 ]]; then
  cmd+=("${PASSTHROUGH_ARGS[@]}")
fi

exec "${cmd[@]}"
