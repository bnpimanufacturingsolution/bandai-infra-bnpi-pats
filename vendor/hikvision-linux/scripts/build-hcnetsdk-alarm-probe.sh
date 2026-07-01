#!/usr/bin/env bash
set -euo pipefail

SDK_ROOT="${HIKVISION_LINUX_SDK_ROOT:?HIKVISION_LINUX_SDK_ROOT is required}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

mkdir -p "$PROJECT_DIR/build"

g++ -std=c++17 \
  -I"$SDK_ROOT/incEn" \
  "$PROJECT_DIR/hcnetsdk_alarm_probe.cpp" \
  -L"$SDK_ROOT/lib" \
  -lhcnetsdk \
  -Wl,-rpath,"$SDK_ROOT/lib" \
  -o "$PROJECT_DIR/build/hcnetsdk_alarm_probe"

echo "$PROJECT_DIR/build/hcnetsdk_alarm_probe"
