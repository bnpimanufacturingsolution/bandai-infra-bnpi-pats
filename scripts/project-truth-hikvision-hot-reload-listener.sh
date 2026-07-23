#!/usr/bin/env bash
set -euo pipefail

WORK=/home/infra/project-truth-hikvision-biometric-service
SDK_ROOT=/home/infra/project-truth-hcnetsdk/EN-HCNetSDKV6.1.9.48_build20230410_linux64
SOURCE_ROOT=${HIKVISION_HOT_RELOAD_SOURCE_ROOT:-/opt/project-truth/vendor/hikvision-linux}
# Host-local socket truth (Windows Vite 5175 → host API 3001):
#   listener posts to VM :53001 which is SSH -R into host :3001
# VM K3s DEV API is :3101 — valid for pure-VM work, but WRONG for host browser sockets.
# Prefer healthy host reverse unless HIKVISION_HOT_RELOAD_FORCE_API_BASE=1.
HOST_REVERSE_API_BASE=${HIKVISION_HOST_REVERSE_API_BASE:-http://127.0.0.1:53001}
VM_DEV_API_BASE=${HIKVISION_VM_DEV_API_BASE:-http://localhost:3101}
POSTGRES_CONTAINER=${HIKVISION_POSTGRES_CONTAINER:-hris-postgres-dev}
DEVICE_SOURCE=${HIKVISION_HOT_RELOAD_DEVICE_SOURCE:-postgres}
DEVICE_FETCH_LIMIT=${HIKVISION_HOT_RELOAD_DEVICE_FETCH_LIMIT:-200}
LOGIN_EMAIL=${HIKVISION_HOT_RELOAD_LOGIN_EMAIL:-admin@bandai.local}
LOGIN_PASSWORD=${HIKVISION_HOT_RELOAD_LOGIN_PASSWORD:-password123}
LOGIN_APP_CODE=${HIKVISION_HOT_RELOAD_LOGIN_APP_CODE:-hris}

api_health_ok() {
  local base="${1%/}"
  curl --fail --silent --show-error --max-time 1 "${base}/health" >/dev/null 2>&1
}

resolve_local_api_base() {
  local preferred="${HIKVISION_HOT_RELOAD_API_BASE:-}"
  local force="${HIKVISION_HOT_RELOAD_FORCE_API_BASE:-0}"
  local host_base="$HOST_REVERSE_API_BASE"
  local vm_base="$VM_DEV_API_BASE"

  if [[ "$force" == "1" || "$force" == "true" || "$force" == "yes" ]]; then
    if [[ -n "$preferred" ]]; then
      echo "$preferred"
      return 0
    fi
  fi

  # When host reverse is live, always use it — blocks accidental 3101 drift from unit/env defaults.
  if api_health_ok "$host_base"; then
    if [[ -n "$preferred" && "$preferred" != "$host_base" && "$preferred" != "http://localhost:53001" ]]; then
      echo "WARN: ignoring HIKVISION_HOT_RELOAD_API_BASE=$preferred; $host_base is healthy (host socket path). Set HIKVISION_HOT_RELOAD_FORCE_API_BASE=1 to force." >&2
    fi
    echo "$host_base"
    return 0
  fi

  # A configured default is not a force flag. Only keep it when it is healthy;
  # otherwise a dead host reverse must not prevent the VM-owned listener from
  # falling back to the K3s DEV API.
  if [[ -n "$preferred" ]] && api_health_ok "$preferred"; then
    echo "$preferred"
    return 0
  fi

  if api_health_ok "$vm_base"; then
    if [[ -n "$preferred" && "$preferred" != "$vm_base" ]]; then
      echo "WARN: HIKVISION_HOT_RELOAD_API_BASE=$preferred is unhealthy; using healthy VM DEV API $vm_base." >&2
    fi
    echo "$vm_base"
    return 0
  fi

  # Nothing is healthy yet. Retain the configured/default target so the daemon
  # can retry without silently changing an explicitly prepared startup path.
  echo "${preferred:-$host_base}"
}

LOCAL_API_BASE="$(resolve_local_api_base)"
export HIKVISION_HOT_RELOAD_API_BASE="$LOCAL_API_BASE"
echo "INFO: hikvision hot-reload LOCAL_API_BASE=$LOCAL_API_BASE" >&2
SPEC=/run/project-truth/hikvision-hot-reload-device.spec
SPEC_OVERRIDE=${HIKVISION_DEVICE_SPEC_OVERRIDE:-}
ALLOW_STATIC_SPEC_OVERRIDE=${HIKVISION_ALLOW_STATIC_DEVICE_SPEC:-0}
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

ensure_work_tree() {
  local build_script="$WORK/scripts/build-hikvision-biometric-service.sh"
  local source_file="$WORK/hikvision_biometric_service.cpp"
  local binary="$WORK/build/hikvision-biometric-service"

  if [[ ! -f "$source_file" || ! -f "$build_script" ]]; then
    mkdir -p "$WORK/scripts"
    cp "$SOURCE_ROOT/hikvision_biometric_service.cpp" "$source_file"
    cp "$SOURCE_ROOT/scripts/build-hikvision-biometric-service.sh" "$build_script"
    chmod 0755 "$build_script"
  fi

  if [[ ! -x "$binary" || "$SOURCE_ROOT/hikvision_biometric_service.cpp" -nt "$source_file" ]]; then
    cp "$SOURCE_ROOT/hikvision_biometric_service.cpp" "$source_file"
  fi

  if [[ ! -x "$binary" || "$source_file" -nt "$binary" || "$build_script" -nt "$binary" ]]; then
    HIKVISION_LINUX_SDK_ROOT="$SDK_ROOT" bash "$build_script" >/dev/null
  fi
}

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

fetch_hikvision_device_rows_from_postgres() {
  local query
  query=$(cat <<'SQL'
COPY (
  SELECT
    id,
    "organizationId",
    regexp_replace(name, E'[\\r\\n|]+', ' ', 'g'),
    COALESCE(NULLIF(config->>'hikvisionSdkRuntimeAddress', ''), address),
    COALESCE(NULLIF(config->>'hikvisionSdkRuntimePort', ''), NULLIF(config->>'sdkPort', ''), '8000'),
    COALESCE(access->>'username', ''),
    COALESCE(access->>'password', '')
  FROM "Device"
  WHERE "isDeleted" = false
    AND COALESCE(config->>'vendor', '') = 'Hikvision'
  ORDER BY name, id
) TO STDOUT WITH DELIMITER '|'
SQL
)

  docker exec -i "$POSTGRES_CONTAINER" \
    psql -U postgres -d hris -v ON_ERROR_STOP=1 -qAt -c "$query" | tr -d '\r'
}

fetch_hikvision_device_rows_from_api() {
  local token="$1"
  local device_url="${LOCAL_API_BASE%/}/api/device?page=1&limit=${DEVICE_FETCH_LIMIT}&document=true"
  local response
  response=$(curl --fail --silent --show-error \
    -H "Authorization: Bearer $token" \
    "$device_url")

  HIKVISION_DEVICE_FILTER="$DEVICE_ID_FILTER" API_RESPONSE="$response" python3 - <<'PY'
import json
import os

payload = json.loads(os.environ["API_RESPONSE"])
devices = (((payload or {}).get("data") or {}).get("devices") or [])
device_filter = {item.strip() for item in os.environ.get("HIKVISION_DEVICE_FILTER", "").split(",") if item.strip()}

def clean(value):
    text = "" if value is None else str(value)
    return text.replace("\r", " ").replace("\n", " ").replace("|", " ").strip()

for device in devices:
    config = device.get("config") or {}
    access = device.get("access") or {}
    device_id = clean(device.get("id"))
    if not device_id:
      continue
    if device_filter and device_id not in device_filter:
      continue
    if device.get("isDeleted") is True:
      continue
    if clean(config.get("vendor")) != "Hikvision":
      continue
    username = clean(access.get("username")) or clean(os.environ.get("HIKVISION_USERNAME"))
    password = clean(access.get("password")) or clean(os.environ.get("HIKVISION_PASSWORD"))
    if not password:
      continue
    row = [
      device_id,
      clean(device.get("organizationId")),
      clean(device.get("name")),
      clean(config.get("hikvisionSdkRuntimeAddress") or device.get("address")),
      clean(config.get("hikvisionSdkRuntimePort") or config.get("sdkPort") or "8000"),
      username,
      password,
    ]
    print("|".join(row))
PY
}

hris_token=""
export LOGIN_EMAIL LOGIN_PASSWORD LOGIN_APP_CODE
tmp_spec=$(mktemp /tmp/project-truth-hikvision-device.XXXXXX)
trap 'rm -f "$tmp_spec"' EXIT

if [[ "$ALLOW_STATIC_SPEC_OVERRIDE" == "1" && -n "$SPEC_OVERRIDE" && -s "$SPEC_OVERRIDE" ]]; then
  cp "$SPEC_OVERRIDE" "$tmp_spec"
else
  case "$DEVICE_SOURCE" in
    postgres)
      rows="$(fetch_hikvision_device_rows_from_postgres)"
      ;;
    api)
      hris_token="$(fetch_hikvision_hris_token)"
      rows="$(fetch_hikvision_device_rows_from_api "$hris_token")"
      ;;
    *)
      echo "unsupported HIKVISION_HOT_RELOAD_DEVICE_SOURCE: $DEVICE_SOURCE" >&2
      exit 2
      ;;
  esac

  if [[ -z "${rows:-}" ]]; then
    echo "missing Hikvision device rows or credentials from ${DEVICE_SOURCE}" >&2
    exit 2
  fi

  while IFS='|' read -r device_id org_id device_name device_addr sdk_port sdk_user sdk_pass; do
  [[ -n "${device_id:-}" ]] || continue
  sdk_user="${sdk_user:-${HIKVISION_USERNAME:-}}"
  sdk_pass="${sdk_pass:-${HIKVISION_PASSWORD:-}}"
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
fi

if [[ ! -s "$tmp_spec" ]]; then
  echo "no Hikvision device rows with usable credentials were prepared" >&2
  exit 2
fi

umask 077
install -m 600 "$tmp_spec" "$SPEC"

if [[ "$PREPARE_ONLY" == "1" ]]; then
  exit 0
fi

ensure_work_tree

cd "$WORK"
export HIKVISION_LINUX_SDK_ROOT="$SDK_ROOT"
export LD_LIBRARY_PATH="$SDK_ROOT/lib:$SDK_ROOT:$SDK_ROOT/HCNetSDKCom:${LD_LIBRARY_PATH:-}"
# Always mint a token when empty. Static-spec override used to skip the API device
# fetch and left HIKVISION_HRIS_API_TOKEN blank, so every callback/reconcile curl
# returned HTTP 401 ("No token provided") and merge peer-copy looked like total failure.
if [[ -z "${hris_token:-}" ]]; then
  if ! hris_token="$(fetch_hikvision_hris_token)"; then
    echo "WARN: failed to mint HRIS API token; HRIS posts may 401 until login works" >&2
    hris_token=""
  fi
fi
export HIKVISION_HRIS_API_TOKEN="$hris_token"

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
