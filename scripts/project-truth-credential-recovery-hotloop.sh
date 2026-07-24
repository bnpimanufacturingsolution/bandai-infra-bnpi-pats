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

  echo "Running focused tests from staged source (live API is untouched)..."
  sudo docker exec "$TEST_CONTAINER" node scripts/ensure-prisma-client.cjs
  sudo docker exec "$TEST_CONTAINER" \
    ./node_modules/.bin/tsx \
    node_modules/mocha/bin/mocha \
    --no-config \
    tests/hikvision-credential-recovery.helper.spec.ts \
    tests/hikvision-biometric-sync-contract.spec.ts \
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

case "$MODE" in
  test)
    run_tests
    ;;
  sdk-export)
    run_sdk_export
    ;;
  *)
    echo "Usage: $0 test STAGE_ROOT [TEST_GREP]" >&2
    echo "   or: $0 sdk-export STAGE_ROOT DEVICE_ID VENDOR_USER_ID face|fingerprint" >&2
    exit 2
    ;;
esac
