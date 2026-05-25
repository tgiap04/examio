#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_PATH="$ROOT_DIR/iosApp/ExamioApp.xcodeproj"
SCHEME="ExamioApp"
DESTINATION="platform=iOS Simulator,name=${IOS_SIMULATOR_NAME:-iPhone 17}"

xcodebuild \
  -project "$PROJECT_PATH" \
  -scheme "$SCHEME" \
  -destination "$DESTINATION" \
  build
