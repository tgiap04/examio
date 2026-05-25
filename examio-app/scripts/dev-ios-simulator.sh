#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_PATH="$ROOT_DIR/iosApp/ExamioApp.xcodeproj"
SCHEME="ExamioApp"
DEVICE_NAME="${IOS_SIMULATOR_NAME:-iPhone 17}"

DEVICE_ID="$(xcrun simctl list devices available | sed -n "s/.*$DEVICE_NAME (\([A-F0-9-]*\)) (.*/\1/p" | head -n 1)"

if [[ -z "$DEVICE_ID" ]]; then
  echo "Simulator not found: $DEVICE_NAME" >&2
  echo "Available devices:" >&2
  xcrun simctl list devices available >&2
  exit 1
fi

xcrun simctl boot "$DEVICE_ID" 2>/dev/null || true
open -a Simulator

xcodebuild \
  -project "$PROJECT_PATH" \
  -scheme "$SCHEME" \
  -destination "id=$DEVICE_ID" \
  -quiet \
  build

BUILD_SETTINGS="$(xcodebuild \
  -project "$PROJECT_PATH" \
  -scheme "$SCHEME" \
  -destination "id=$DEVICE_ID" \
  -showBuildSettings 2>/dev/null)"

BUILT_PRODUCTS_DIR="$(awk -F '= ' '/^[[:space:]]*BUILT_PRODUCTS_DIR = / { print $2; exit }' <<<"$BUILD_SETTINGS")"
FULL_PRODUCT_NAME="$(awk -F '= ' '/^[[:space:]]*FULL_PRODUCT_NAME = / { print $2; exit }' <<<"$BUILD_SETTINGS")"
BUNDLE_ID="$(awk -F '= ' '/^[[:space:]]*PRODUCT_BUNDLE_IDENTIFIER = / { print $2; exit }' <<<"$BUILD_SETTINGS")"
APP_PATH="$BUILT_PRODUCTS_DIR/$FULL_PRODUCT_NAME"

xcrun simctl install "$DEVICE_ID" "$APP_PATH"
xcrun simctl launch "$DEVICE_ID" "$BUNDLE_ID"
