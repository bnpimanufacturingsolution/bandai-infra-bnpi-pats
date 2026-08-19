#!/usr/bin/env bash
set -euo pipefail

SDK_ROOT="${HIKVISION_LINUX_SDK_ROOT:?HIKVISION_LINUX_SDK_ROOT is required}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

mkdir -p "$PROJECT_DIR/build"

COMMON_ARGS=(
  -std=c++17
  -pthread
  -I"$SDK_ROOT/incEn"
  -I"$SDK_ROOT/consoleDemo/include"
  -I"$PROJECT_DIR/include"
  -I"$PROJECT_DIR/src/hikvision_bio"
)

COMMON_LINK_ARGS=(
  -L"$SDK_ROOT/lib"
  -lhcnetsdk
  -Wl,-rpath,"$SDK_ROOT/lib"
)

SOURCES=(
  "$PROJECT_DIR/src/hikvision_bio/common.cpp"
  "$PROJECT_DIR/src/hikvision_bio/time/device_time.cpp"
  "$PROJECT_DIR/src/hikvision_bio/main.cpp"
)

for source in "${SOURCES[@]}"; do
  if [[ ! -f "$source" ]]; then
    echo "missing Hikvision source: $source" >&2
    exit 1
  fi
done

g++ "${COMMON_ARGS[@]}" \
  "${SOURCES[@]}" \
  "${COMMON_LINK_ARGS[@]}" \
  -o "$PROJECT_DIR/build/hikvision-biometric-service"

echo "$PROJECT_DIR/build/hikvision-biometric-service"
