#!/usr/bin/env bash
# =====================================================
# Nawaqes — APK Build via Bubblewrap (TWA)
# =====================================================
# Builds a Trusted Web Activity (TWA) APK from the PWA using Bubblewrap.
# This is the EASIEST method — no Android Studio, no JDK setup, no manual XML.
#
# Prerequisites:
#   - Node.js 20+
#   - Java JDK 17 (Bubblewrap installs it if missing)
#   - Internet connection
#
# The TWA wraps the PWA at https://safwatkhokha-nawaqes.hf.space
# Users get a "native" app experience without writing any Java code.
#
# Usage:
#   ./build-apk-twa.sh init        # First-time setup (~5 min)
#   ./build-apk-twa.sh build       # Build debug APK
#   ./build-apk-twa.sh release     # Build release APK (signed)
#   ./build-apk-twa.sh update      # Update PWA URL/assets only
# =====================================================

set -e

PROJECT_ROOT="/home/z/my-project/nawaqes"
TWA_DIR="/home/z/my-project/nawaqes-apk/twa"
OUTPUT_DIR="/home/z/my-project/download"
APK_VERSION="2.0.0"
PWA_URL="https://safwatkhokha-nawaqes.hf.space"
PACKAGE_ID="com.nawaqes.app"
APP_NAME="نواقص"

mkdir -p "$OUTPUT_DIR" "$TWA_DIR"

MODE="${1:-build}"

print_step() { echo -e "\033[0;34m▶ $1\033[0m"; }
print_ok()   { echo -e "\033[0;32m✓ $1\033[0m"; }
print_err()  { echo -e "\033[0;31m✗ $1\033[0m"; }
print_warn() { echo -e "\033[0;33m! $1\033[0m"; }

# ---- Install bubblewrap globally ----
if ! command -v bubblewrap &>/dev/null; then
  print_step "Installing Bubblewrap CLI..."
  npm install -g @bubblewrap/cli
  print_ok "Bubblewrap installed"
fi

cd "$TWA_DIR"

case "$MODE" in
  init)
    print_step "Initializing TWA project (first-time setup)..."
    bubblewrap init \
      --manifest="$PWA_URL/manifest.webmanifest" \
      --packageId="$PACKAGE_ID" \
      --name="$APP_NAME" \
      --launcherName="نواقص" \
      --display=standalone \
      --orientation=portrait \
      --themeColor="#DC2626" \
      --backgroundColor="#1e0c0c" \
      --iconUrl="$PWA_URL/icons/icon-512.png" \
      --maskableIconUrl="$PWA_URL/icons/maskable-512.png" \
      --splashScreenFadeOutDuration=300 \
      --signingKeyPath=./keystore \
      --signingKeyAlias=nawaqes
    print_ok "TWA project initialized"
    ;;

  build)
    print_step "Building DEBUG APK via Bubblewrap..."
    bubblewrap build \
      --skipPwaValidation \
      --type=apk
    cp app-release-signed.apk "$OUTPUT_DIR/nawaqes-v${APK_VERSION}-twa.apk" 2>/dev/null || \
    cp app-release-unsigned.apk "$OUTPUT_DIR/nawaqes-v${APK_VERSION}-twa-unsigned.apk" 2>/dev/null || true
    print_ok "TWA APK built: $OUTPUT_DIR/nawaqes-v${APK_VERSION}-twa.apk"
    ;;

  release)
    print_step "Building RELEASE APK via Bubblewrap..."
    bubblewrap build \
      --skipPwaValidation \
      --type=apk \
      --sign
    cp app-release-signed.apk "$OUTPUT_DIR/nawaqes-v${APK_VERSION}-twa.apk"
    print_ok "TWA Release APK built: $OUTPUT_DIR/nawaqes-v${APK_VERSION}-twa.apk"
    ;;

  update)
    print_step "Updating TWA assets from PWA..."
    bubblewrap update
    print_ok "TWA assets updated"
    ;;

  *)
    print_err "Unknown mode: $MODE"
    echo "Usage: $0 [init|build|release|update]"
    exit 1
    ;;
esac

ls -lh "$OUTPUT_DIR"/nawaqes-v${APK_VERSION}* 2>/dev/null || true
