#!/usr/bin/env bash
set -euo pipefail

MODE=${1:-}
STAGE_ROOT=${2:-/home/infra/project-truth-hotloop/current}
TEST_GREP_B64=${3:-}
TEST_GREP=credential
DEVICE_ID=${3:-}
VENDOR_USER_ID=${4:-}
MODALITY=${5:-face}
HOTLOOP_IMAGE=${PROJECT_TRUTH_HOTLOOP_IMAGE:-project-truth-hris-api-hotloop:node20}
TEST_CONTAINER=""
SDK_SPEC=""
SDK_RAW_STDOUT=""
SDK_RAW_STDERR=""
CAPABILITY_RESULT=""
CAPABILITY_CURL_CONFIG=""

if [[ "$STAGE_ROOT" != /home/infra/project-truth-hotloop/* ]]; then
  echo "Refusing hot-loop stage outside /home/infra/project-truth-hotloop" >&2
  exit 2
fi

run_tests() {
  if [[ -n "$TEST_GREP_B64" ]]; then
    TEST_GREP=$(printf '%s' "$TEST_GREP_B64" | base64 -d)
  fi
  if ! sudo docker image inspect "$HOTLOOP_IMAGE" >/dev/null 2>&1; then
    echo "Preparing the one-time cached API test image..."
    sudo docker build \
      --target builder \
      --tag "$HOTLOOP_IMAGE" \
      /opt/project-truth/hris-api
  fi

  TEST_CONTAINER="project-truth-hotloop-$$"
  cleanup_test_container() {
    if [[ -n "${TEST_CONTAINER:-}" ]]; then
      sudo docker rm -f "$TEST_CONTAINER" >/dev/null 2>&1 || true
    fi
  }
  trap cleanup_test_container EXIT

  sudo docker create \
    --name "$TEST_CONTAINER" \
    --entrypoint sh \
    "$HOTLOOP_IMAGE" \
    -c 'sleep 3600' >/dev/null
  sudo docker start "$TEST_CONTAINER" >/dev/null
  sudo docker cp "$STAGE_ROOT/hris-api/." "$TEST_CONTAINER:/app/"
  sudo docker exec "$TEST_CONTAINER" mkdir -p /scripts /vendor
  sudo docker cp "$STAGE_ROOT/scripts/." "$TEST_CONTAINER:/scripts/"
  sudo docker cp "$STAGE_ROOT/vendor/." "$TEST_CONTAINER:/vendor/"

  echo "Running focused tests from staged source (live API is untouched)..."
  sudo docker exec "$TEST_CONTAINER" node scripts/ensure-prisma-client.cjs
  sudo docker exec "$TEST_CONTAINER" \
    ./node_modules/.bin/tsx \
    node_modules/mocha/bin/mocha \
    --no-config \
    tests/hikvision-credential-recovery.helper.spec.ts \
    tests/hikvision-biometric-sync-contract.spec.ts \
    tests/hikvision-fdlib-face.helper.spec.ts \
    --grep "$TEST_GREP"
  echo "Running TypeScript validation from staged source..."
  sudo docker exec "$TEST_CONTAINER" npm run typecheck
}

run_sdk_export() {
  if [[ ! "$DEVICE_ID" =~ ^[A-Za-z0-9_-]+$ ]] ||
     [[ ! "$VENDOR_USER_ID" =~ ^[A-Za-z0-9_.@-]+$ ]]; then
    echo "Device ID or vendor user ID contains unsupported characters" >&2
    exit 2
  fi
  if [[ "$MODALITY" != "face" && "$MODALITY" != "fingerprint" ]]; then
    echo "Modality must be face or fingerprint" >&2
    exit 2
  fi

  SDK_SPEC=$(mktemp /tmp/project-truth-hotloop-device.XXXXXX)
  SDK_RAW_STDOUT=$(mktemp /tmp/project-truth-hotloop-sdk-stdout.XXXXXX)
  SDK_RAW_STDERR=$(mktemp /tmp/project-truth-hotloop-sdk-stderr.XXXXXX)
  chmod 600 "$SDK_SPEC" "$SDK_RAW_STDOUT" "$SDK_RAW_STDERR"
  cleanup_sdk_probe() {
    rm -f "${SDK_SPEC:-}" "${SDK_RAW_STDOUT:-}" "${SDK_RAW_STDERR:-}"
  }
  trap cleanup_sdk_probe EXIT

  local query
  query=$(cat <<SQL
COPY (
  SELECT
    id,
    "organizationId",
    regexp_replace(name, E'[\r\n|]+', ' ', 'g'),
    COALESCE(NULLIF(config->>'hikvisionSdkRuntimeAddress', ''), address),
    COALESCE(NULLIF(config->>'hikvisionSdkRuntimePort', ''), NULLIF(config->>'sdkPort', ''), '8000'),
    regexp_replace(COALESCE(access->>'username', ''), E'[\r\n|]+', '', 'g'),
    regexp_replace(COALESCE(access->>'password', ''), E'[\r\n|]+', '', 'g'),
    'true'
  FROM "Device"
  WHERE id = '$DEVICE_ID'
    AND "isDeleted" = false
    AND COALESCE(config->>'vendor', '') = 'Hikvision'
) TO STDOUT WITH DELIMITER '|'
SQL
)
  sudo k3s kubectl -n dev exec statefulset/hris-postgres -- \
    psql -U postgres -d hris -v ON_ERROR_STOP=1 -qAt -c "$query" \
    >"$SDK_SPEC"
  if [[ ! -s "$SDK_SPEC" ]]; then
    echo "No current Hikvision device row was found for $DEVICE_ID" >&2
    exit 3
  fi

  local modality_args=()
  if [[ "$MODALITY" == "face" ]]; then
    modality_args+=(--export-biometric-no-fingerprints)
  else
    modality_args+=(--export-biometric-no-face)
  fi

  echo "Running isolated VM-side SDK $MODALITY read probe; live API is untouched..."
  set +e
  sudo env \
    HIKVISION_ALLOW_STATIC_DEVICE_SPEC=1 \
    HIKVISION_SKIP_SPOOL_REPLAY=1 \
    HIKVISION_DEVICE_SPEC_OVERRIDE="$SDK_SPEC" \
    HIKVISION_HOT_RELOAD_SOURCE_ROOT="$STAGE_ROOT/vendor/hikvision-linux" \
    HIKVISION_HOT_RELOAD_FORCE_API_BASE=1 \
    HIKVISION_HOT_RELOAD_API_BASE=http://localhost:3101 \
    HIKVISION_RUN_SECONDS=1 \
    "$STAGE_ROOT/scripts/project-truth-hikvision-hot-reload-listener.sh" \
    --run-once \
    --export-biometric-source-device-id "$DEVICE_ID" \
    --export-biometric-employee-no "$VENDOR_USER_ID" \
    "${modality_args[@]}" \
    >"$SDK_RAW_STDOUT" 2>"$SDK_RAW_STDERR"
  local probe_exit=$?
  set -e

  # The SDK completion event contains biometric bytes. Summarize it on the VM
  # and never return raw templates, pictures, cards, credentials, or tokens.
  python3 - "$SDK_RAW_STDOUT" <<'PY'
import json
import sys

allowed = {
    "event", "ok", "reason", "deviceId", "sourceDeviceId", "employeeNo",
    "lastError", "attempt", "attempts", "userReadOk", "cardOwnerVerified",
    "cardAssociationStrategy", "fingerprintCount", "faceTemplateSize",
    "facePictureSize", "durationMs",
}
with open(sys.argv[1], "r", encoding="utf-8", errors="replace") as handle:
    for line in handle:
        try:
            payload = json.loads(line)
        except Exception:
            continue
        safe = {key: payload.get(key) for key in allowed if key in payload}
        print(json.dumps(safe, separators=(",", ":")))
PY
  if [[ -s "$SDK_RAW_STDERR" ]]; then
    tail -n 20 "$SDK_RAW_STDERR" | sed -E 's/(password|token|cardNo)=[^ ]+/\1=[redacted]/Ig'
  fi
  return "$probe_exit"
}

run_capability_probe() {
  if [[ ! "$DEVICE_ID" =~ ^[A-Za-z0-9_-]+$ ]]; then
    echo "Device ID contains unsupported characters" >&2
    exit 2
  fi

  local connection_spec
  connection_spec=$(mktemp /tmp/project-truth-hotloop-isapi.XXXXXX)
  CAPABILITY_RESULT=$(mktemp /tmp/project-truth-hotloop-capability.XXXXXX)
  CAPABILITY_CURL_CONFIG=$(mktemp /tmp/project-truth-hotloop-curl.XXXXXX)
  chmod 600 "$connection_spec" "$CAPABILITY_RESULT" "$CAPABILITY_CURL_CONFIG"
  cleanup_capability_probe() {
    rm -f \
      "${connection_spec:-}" \
      "${CAPABILITY_RESULT:-}" \
      "${CAPABILITY_CURL_CONFIG:-}"
  }
  trap cleanup_capability_probe EXIT

  local query
  query=$(cat <<SQL
COPY (
  SELECT
    encode(convert_to(COALESCE(NULLIF(protocol::text, ''), 'https'), 'UTF8'), 'base64'),
    encode(convert_to(address, 'UTF8'), 'base64'),
    encode(convert_to(COALESCE(port::text, '443'), 'UTF8'), 'base64'),
    encode(convert_to(COALESCE(access->>'username', ''), 'UTF8'), 'base64'),
    encode(convert_to(COALESCE(access->>'password', ''), 'UTF8'), 'base64')
  FROM "Device"
  WHERE id = '$DEVICE_ID'
    AND "isDeleted" = false
    AND COALESCE(config->>'vendor', '') = 'Hikvision'
) TO STDOUT WITH DELIMITER '|'
SQL
)
  sudo k3s kubectl -n dev exec statefulset/hris-postgres -- \
    psql -U postgres -d hris -v ON_ERROR_STOP=1 -qAt -c "$query" \
    >"$connection_spec"
  if [[ ! -s "$connection_spec" ]]; then
    echo "No current Hikvision device row was found for $DEVICE_ID" >&2
    exit 3
  fi

  local protocol_b64 host_b64 port_b64 username_b64 password_b64
  IFS='|' read -r \
    protocol_b64 host_b64 port_b64 username_b64 password_b64 \
    <"$connection_spec"
  local protocol host port username password
  protocol=$(printf '%s' "$protocol_b64" | base64 -d)
  host=$(printf '%s' "$host_b64" | base64 -d)
  port=$(printf '%s' "$port_b64" | base64 -d)
  username=$(printf '%s' "$username_b64" | base64 -d)
  password=$(printf '%s' "$password_b64" | base64 -d)
  if [[ -z "$host" || -z "$username" || -z "$password" ]]; then
    echo "Current device connection evidence is incomplete" >&2
    exit 3
  fi

  # Keep credentials out of argv/process listings. curl reads the protected
  # config file and the response is reduced to capability fields on the VM.
  local escaped_user escaped_password
  escaped_user=${username//\\/\\\\}
  escaped_user=${escaped_user//\"/\\\"}
  escaped_password=${password//\\/\\\\}
  escaped_password=${escaped_password//\"/\\\"}
  printf 'user = "%s:%s"\n' "$escaped_user" "$escaped_password" \
    >"$CAPABILITY_CURL_CONFIG"

  local endpoints=(
    "/ISAPI/Intelligent/FDLib/FaceDataRecord/capabilities?format=json"
    "/ISAPI/Intelligent/FDLib/capabilities?format=json"
    "/ISAPI/Intelligent/FDLib/Count?format=json&FDID=1&faceLibType=blackFD"
  )
  local endpoint http_status
  for endpoint in "${endpoints[@]}"; do
    : >"$CAPABILITY_RESULT"
    set +e
    http_status=$(curl \
      --silent \
      --show-error \
      --insecure \
      --digest \
      --config "$CAPABILITY_CURL_CONFIG" \
      --connect-timeout 4 \
      --max-time 10 \
      --output "$CAPABILITY_RESULT" \
      --write-out '%{http_code}' \
      "${protocol}://${host}:${port}${endpoint}")
    local curl_exit=$?
    set -e
    python3 - \
      "$DEVICE_ID" \
      "$endpoint" \
      "$http_status" \
      "$curl_exit" \
      "$CAPABILITY_RESULT" <<'PY'
import json
import sys

device_id, endpoint, http_status, curl_exit, result_path = sys.argv[1:]
raw = open(result_path, "r", encoding="utf-8", errors="replace").read()
try:
    payload = json.loads(raw)
except Exception:
    payload = {}

interesting = {}
def walk(value, path=""):
    if isinstance(value, dict):
        for key, item in value.items():
            child = f"{path}.{key}" if path else key
            lowered = key.lower()
            if any(term in lowered for term in ("support", "faceurl", "uploadpicture", "count", "num")):
                if isinstance(item, (str, int, float, bool)) or item is None:
                    interesting[child] = item
                elif isinstance(item, dict):
                    scalar = {
                        k: v for k, v in item.items()
                        if isinstance(v, (str, int, float, bool)) or v is None
                    }
                    if scalar:
                        interesting[child] = scalar
            walk(item, child)
    elif isinstance(value, list):
        for index, item in enumerate(value[:10]):
            walk(item, f"{path}[{index}]")

walk(payload)
print(json.dumps({
    "event": "hikvision_fdlib_capability_probe",
    "deviceId": device_id,
    "endpoint": endpoint,
    "httpStatus": int(http_status or 0),
    "transportOk": int(curl_exit) == 0,
    "responseTopLevelKeys": list(payload)[:20] if isinstance(payload, dict) else [],
    "capabilities": dict(list(interesting.items())[:100]),
}, separators=(",", ":")))
PY
  done
}

case "$MODE" in
  test)
    run_tests
    ;;
  sdk-export)
    run_sdk_export
    ;;
  capability-probe)
    run_capability_probe
    ;;
  *)
    echo "Usage: $0 test STAGE_ROOT [TEST_GREP]" >&2
    echo "   or: $0 sdk-export STAGE_ROOT DEVICE_ID VENDOR_USER_ID face|fingerprint" >&2
    echo "   or: $0 capability-probe STAGE_ROOT DEVICE_ID" >&2
    exit 2
    ;;
esac
