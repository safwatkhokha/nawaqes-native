#!/usr/bin/env bash
# =====================================================
# Nawaqes — APK Build via Docker (No Android Studio needed)
# =====================================================
# Builds the APK using a Docker container that has Android SDK + JDK.
# This is perfect for users who don't have Android Studio installed.
#
# Usage:
#   ./build-apk-docker.sh              # Debug APK
#   ./build-apk-docker.sh release      # Release APK
#   ./build-apk-docker.sh aab          # Release AAB (Play Store)
# =====================================================

set -e

PROJECT_ROOT="/home/z/my-project/nawaqes"
OUTPUT_DIR="/home/z/my-project/download"
APK_VERSION="2.0.0"

MODE="${1:-debug}"

print_step() { echo -e "\033[0;34m▶ $1\033[0m"; }
print_ok()   { echo -e "\033[0;32m✓ $1\033[0m"; }
print_err()  { echo -e "\033[0;31m✗ $1\033[0m"; }

mkdir -p "$OUTPUT_DIR"

print_step "Building APK via Docker (mode: $MODE)..."

# Use the official Capacitor Docker image (includes Android SDK + JDK 17)
# Image: beevelop/capacitor (or alternative: runaponit/capacitor-android)
DOCKER_IMAGE="beevelop/capacitor:latest"

# Pull image if not cached
if ! docker image inspect "$DOCKER_IMAGE" &>/dev/null; then
  print_step "Pulling Docker image $DOCKER_IMAGE (first run takes ~5 min)..."
  docker pull "$DOCKER_IMAGE"
fi

# Run the build inside the container
print_step "Building inside Docker container..."
docker run --rm \
  -v "$PROJECT_ROOT:/app" \
  -v "/home/z/my-project/nawaqes-apk:/apk-source:ro" \
  -v "$OUTPUT_DIR:/output" \
  -w /app \
  -e CAPACITOR_BUILD=true \
  -e MODE="$MODE" \
  -e APK_VERSION="$APK_VERSION" \
  "$DOCKER_IMAGE" \
  bash -c "
    set -e
    cd /app

    echo '[DOCKER] Installing dependencies...'
    npm install --no-audit --no-fund

    echo '[DOCKER] Building web assets (Capacitor mode)...'
    CAPACITOR_BUILD=true npm run build:web

    if [ ! -d android ]; then
      echo '[DOCKER] Adding Android platform...'
      npx cap add android
    fi

    echo '[DOCKER] Copying Android resources...'
    cp -f /apk-source/apk-source/AndroidManifest.xml android/app/src/main/AndroidManifest.xml || true
    cp -rf /apk-source/apk-source/src/com android/app/src/main/java/com || true
    cp -rn /apk-source/apk-source/res/* android/app/src/main/res/ 2>/dev/null || true
    cp -f /apk-source/apk-source/build.gradle android/app/build.gradle || true
    cp -f /apk-source/firebase/google-services.json android/app/google-services.json 2>/dev/null || echo 'No google-services.json'

    echo '[DOCKER] Syncing Capacitor...'
    npx cap sync android

    cd android

    case '$MODE' in
      debug)
        echo '[DOCKER] Building DEBUG APK...'
        ./gradlew assembleDebug --no-daemon
        cp app/build/outputs/apk/debug/app-debug.apk /output/nawaqes-v${APK_VERSION}-debug.apk
        ;;
      release)
        echo '[DOCKER] Building RELEASE APK...'
        ./gradlew assembleRelease --no-daemon
        cp app/build/outputs/apk/release/app-release.apk /output/nawaqes-v${APK_VERSION}.apk
        ;;
      aab)
        echo '[DOCKER] Building AAB...'
        ./gradlew bundleRelease --no-daemon
        cp app/build/outputs/bundle/release/app-release.aab /output/nawaqes-v${APK_VERSION}.aab
        ;;
    esac

    echo '[DOCKER] Build complete!'
  "

print_ok "Build successful!"
print_ok "Output: $OUTPUT_DIR/"
ls -lh "$OUTPUT_DIR"/nawaqes-v${APK_VERSION}* 2>/dev/null || ls -lh "$OUTPUT_DIR/"
