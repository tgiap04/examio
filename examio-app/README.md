# ExamioApp

Kotlin Multiplatform mobile app (Android Compose + iOS SwiftUI) for Examio.

## Requirements

| Tool | Version |
|------|---------|
| JDK | 17+ |
| Android Studio | Hedgehog+ |
| Xcode | 15+ (iOS only) |
| `adb` | (Android device/emulator testing) |

## Setup

```bash
# Clone and enter project
cd examio-app

# Android: wrapper already included — no extra install needed
./gradlew --version

# iOS: open in Xcode
open iosApp/ExamioApp.xcodeproj
```

## Android

### Build

```bash
# Debug APK
./gradlew :androidApp:assembleDebug

# Release APK (requires signing config)
./gradlew :androidApp:assembleRelease
```

APK output: `androidApp/build/outputs/apk/debug/androidApp-debug.apk`

### Install & Run on Emulator/Device

```bash
# Install debug APK
adb install -r androidApp/build/outputs/apk/debug/androidApp-debug.apk

# Launch app
adb shell am start -n com.examio.app/.MainActivity
```

### Install & Run via Gradle (emulator must be running)

```bash
./gradlew :androidApp:installDebug
```

### API URL

- **Emulator**: uses `http://10.0.2.2:3000` (maps to host machine localhost)
- **Physical device**: change `buildConfigField` in `androidApp/build.gradle.kts` to your machine's local IP

## iOS

### Build & Run in Simulator

```bash
# Build and launch on iPhone 17 simulator (default)
make dev-ios

# Override simulator name
IOS_SIMULATOR_NAME="iPhone 16 Pro" make dev-ios

# Build only (no launch)
make run-ios
```

### Open in Xcode

```bash
open iosApp/ExamioApp.xcodeproj
```

Then select a simulator or device and press **Run (⌘R)**.

## Configuration

### Quiz AES key (required)

Exam/quiz questions are encrypted with AES-256-CBC. You must supply the key that matches the backend `QUIZ_AES_KEY` env var.

**Android** — add to `local.properties` (gitignored, never commit):

```
quizAesKey=<value from backend .env>
```

The build reads this via `local.properties` and injects it as `BuildConfig.QUIZ_AES_KEY`.  
Fallback: pass `-PquizAesKey=<value>` as a Gradle property.

**iOS** — edit `iosApp/ExamioApp/Info.plist`, key `ExamioQuizAESKey`, to the same value. The plist ships a placeholder; replace it before running against a real backend.

If the key is wrong or missing, quiz questions will fail to decrypt at runtime.

## Shared Module

The `shared/` module contains repositories, API services, and models used by both platforms.

```bash
# Check shared module compiles for Android
./gradlew :shared:compileDebugKotlinAndroid

# Check shared module compiles for iOS (requires macOS + Xcode)
./gradlew :shared:linkDebugFrameworkIosSimulatorArm64
```

## Clean Build

```bash
./gradlew clean
./gradlew :androidApp:assembleDebug
```
