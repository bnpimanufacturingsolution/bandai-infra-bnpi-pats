#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SDK_ROOT="${HIKVISION_LINUX_SDK_ROOT:-$PROJECT_DIR/sdk-local/hcnetsdk-6.1.9.48/EN-HCNetSDKV6.1.9.48_build20230410_linux64}"

if [[ ! -f "$SDK_ROOT/incEn/HCNetSDK.h" ]]; then
  echo "SDK headers missing under $SDK_ROOT/incEn" >&2
  exit 1
fi
if [[ ! -f "$SDK_ROOT/lib/libhcnetsdk.so" ]]; then
  echo "libhcnetsdk.so missing under $SDK_ROOT/lib" >&2
  exit 1
fi

mkdir -p "$PROJECT_DIR/build"

g++ -std=c++17 -O2 -pthread \
  -I"$SDK_ROOT/incEn" \
  -I"$SDK_ROOT/consoleDemo/include" \
  "$PROJECT_DIR/opaque_id_sdk_probe.cpp" \
  -L"$SDK_ROOT/lib" \
  -lhcnetsdk \
  -Wl,-rpath,"$SDK_ROOT/lib" \
  -o "$PROJECT_DIR/build/opaque-id-sdk-probe"

echo "$PROJECT_DIR/build/opaque-id-sdk-probe"
