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
)

COMMON_LINK_ARGS=(
  -L"$SDK_ROOT/lib"
  -lhcnetsdk
  -Wl,-rpath,"$SDK_ROOT/lib"
)

g++ "${COMMON_ARGS[@]}" \
  "$PROJECT_DIR/hikvision_biometric_service.cpp" \
  "${COMMON_LINK_ARGS[@]}" \
  -o "$PROJECT_DIR/build/hikvision-biometric-service"

echo "$PROJECT_DIR/build/hikvision-biometric-service"
