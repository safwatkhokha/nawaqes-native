#!/usr/bin/env bash
# =====================================================
# Nawaqes — APK Build Script (Capacitor)
# =====================================================
# Builds the Android APK from the React app using Capacitor.
#
# Prerequisites:
#   - Node.js 20+
#   - Android Studio + Android SDK (compileSdk 34)
#   - JDK 17
#
# Usage:
#   ./build-apk.sh              # Debug APK (signed with debug key)
#   ./build-apk.sh release      # Release APK (signed with debug key)
#   ./build-apk.sh aab          # Release AAB (for Play Store)
#   ./build-apk.sh clean        # Clean build artifacts
# =====================================================

set -e

PROJECT_ROOT="/home/z/my-project/nawaqes"
ANDROID_DIR="$PROJECT_ROOT/android"
OUTPUT_DIR="/home/z/my-project/download"
APK_VERSION="2.0.0"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() { echo -e "${BLUE}▶ $1${NC}"; }
print_ok()   { echo -e "${GREEN}✓ $1${NC}"; }
print_err()  { echo -e "${RED}✗ $1${NC}"; }
print_warn() { echo -e "${YELLOW}! $1${NC}"; }

# ---- Create output dir ----
mkdir -p "$OUTPUT_DIR"

# ---- Parse mode ----
MODE="${1:-debug}"
case "$MODE" in
  debug|release|aab|clean) ;;
  *)
    print_err "Unknown mode: $MODE"
    echo "Usage: $0 [debug|release|aab|clean]"
    exit 1
    ;;
esac

# ---- Clean ----
if [ "$MODE" = "clean" ]; then
  print_step "Cleaning build artifacts..."
  cd "$PROJECT_ROOT"
  rm -rf dist android
  npm run clean
  print_ok "Cleaned"
  exit 0
fi

cd "$PROJECT_ROOT"

# ---- Step 1: Install dependencies ----
print_step "Installing dependencies..."
if [ ! -d node_modules ]; then
  npm install
fi
print_ok "Dependencies installed"

# ---- Step 2: Build web assets (Capacitor mode) ----
print_step "Building web assets (Capacitor mode)..."
CAPACITOR_BUILD=true npm run build:web
print_ok "Web build complete"

# ---- Step 3: Add Capacitor Android platform (if missing) ----
if [ ! -d "$ANDROID_DIR" ]; then
  print_step "Adding Android platform..."
  npx cap add android
  print_ok "Android platform added"
fi

# ---- Step 4: Copy custom AndroidManifest and resources ----
print_step "Copying Android resources..."
ANDROID_MANIFEST_SRC="/home/z/my-project/nawaqes-apk/apk-source/AndroidManifest.xml"
ANDROID_MANIFEST_DST="$ANDROID_DIR/app/src/main/AndroidManifest.xml"

if [ -f "$ANDROID_MANIFEST_SRC" ]; then
  cp "$ANDROID_MANIFEST_SRC" "$ANDROID_MANIFEST_DST"
  print_ok "Custom AndroidManifest.xml copied"
fi

# Copy Java sources
JAVA_SRC="/home/z/my-project/nawaqes-apk/apk-source/src/com"
JAVA_DST="$ANDROID_DIR/app/src/main/java/com"
mkdir -p "$(dirname "$JAVA_DST")"
if [ -d "$JAVA_SRC" ]; then
  cp -r "$JAVA_SRC" "$JAVA_DST"
  print_ok "Java sources copied"
fi

# Copy resources
RES_SRC="/home/z/my-project/nawaqes-apk/apk-source/res"
RES_DST="$ANDROID_DIR/app/src/main/res"
if [ -d "$RES_SRC" ]; then
  cp -rn "$RES_SRC"/* "$RES_DST"/ 2>/dev/null || true
  print_ok "Android resources copied"
fi

# Copy build.gradle (only if newer)
GRADLE_SRC="/home/z/my-project/nawaqes-apk/apk-source/build.gradle"
GRADLE_DST="$ANDROID_DIR/app/build.gradle"
if [ -f "$GRADLE_SRC" ]; then
  cp "$GRADLE_SRC" "$GRADLE_DST"
  print_ok "build.gradle copied"
fi

# Copy google-services.json (if exists)
GS_SRC="/home/z/my-project/nawaqes-apk/firebase/google-services.json"
GS_DST="$ANDROID_DIR/app/google-services.json"
if [ -f "$GS_SRC" ]; then
  cp "$GS_SRC" "$GS_DST"
  print_ok "google-services.json copied"
else
  print_warn "google-services.json not found — Firebase Push will not work"
  print_warn "Get it from Firebase Console > Project Settings > Add Android App"
fi

# ---- Step 5: Sync Capacitor ----
print_step "Syncing Capacitor..."
npx cap sync android
print_ok "Capacitor sync complete"

# ---- Step 6: Build APK/AAB ----
cd "$ANDROID_DIR"

case "$MODE" in
  debug)
    print_step "Building DEBUG APK..."
    ./gradlew assembleDebug
    APK_PATH="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
    OUTPUT_NAME="nawaqes-v${APK_VERSION}-debug.apk"
    ;;
  release)
    print_step "Building RELEASE APK (signed with debug key)..."
    ./gradlew assembleRelease
    APK_PATH="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
    OUTPUT_NAME="nawaqes-v${APK_VERSION}.apk"
    ;;
  aab)
    print_step "Building RELEASE AAB (for Play Store)..."
    ./gradlew bundleRelease
    APK_PATH="$ANDROID_DIR/app/build/outputs/bundle/release/app-release.aab"
    OUTPUT_NAME="nawaqes-v${APK_VERSION}.aab"
    ;;
esac

# ---- Step 7: Copy to output ----
if [ -f "$APK_PATH" ]; then
  cp "$APK_PATH" "$OUTPUT_DIR/$OUTPUT_NAME"
  print_ok "Built: $OUTPUT_DIR/$OUTPUT_NAME"
  print_ok "Size: $(du -h "$OUTPUT_DIR/$OUTPUT_NAME" | cut -f1)"
else
  print_err "Build artifact not found at: $APK_PATH"
  exit 1
fi

cd "$PROJECT_ROOT"
print_ok "Done! Output: $OUTPUT_DIR/$OUTPUT_NAME"
