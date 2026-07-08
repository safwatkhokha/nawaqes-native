#!/usr/bin/env bash
# =====================================================
# Nawaqes — Firebase Setup Helper Script
# =====================================================
# This script helps you:
#   1. Add google-services.json to the Android project
#   2. Rebuild APK with Firebase enabled
#   3. Update HF Spaces env variables
#   4. Upload the new APK to HF Spaces
#
# Usage:
#   ./setup-firebase.sh
# =====================================================

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() { echo -e "${BLUE}▶ $1${NC}"; }
print_ok()   { echo -e "${GREEN}✓ $1${NC}"; }
print_err()  { echo -e "${RED}✗ $1${NC}"; }
print_warn() { echo -e "${YELLOW}! $1${NC}"; }

PROJECT_ROOT="/home/z/my-project/nawaqes"
APK_PROJECT="/home/z/my-project/nawaqes-apk/webview-apk"
GOOGLE_SERVICES_PATH="$APK_PROJECT/app/google-services.json"
FIREBASE_BACKUP="/home/z/my-project/nawaqes-apk/firebase-backup"

export ANDROID_HOME=$HOME/android-sdk
export ANDROID_SDK_ROOT=$ANDROID_HOME
export JAVA_HOME=$HOME/jdk17
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

echo "================================================"
echo "  🔥 Nawaqes — Firebase Setup Helper"
echo "================================================"
echo ""

# ---- Step 1: Check for google-services.json ----
print_step "Step 1: Check for google-services.json"
if [ ! -f "$GOOGLE_SERVICES_PATH" ]; then
  print_warn "google-services.json not found at:"
  echo "    $GOOGLE_SERVICES_PATH"
  echo ""
  echo "  Get it from: https://console.firebase.google.com"
  echo "  Project Settings → Add App → Android"
  echo "  Package name: com.nawaqes.app"
  echo ""
  echo "  After downloading, place it at the path above and run this script again."
  exit 1
fi
print_ok "google-services.json found"
echo ""

# ---- Step 2: Restore FirebaseMessagingService.java ----
print_step "Step 2: Restore Firebase Messaging Service"
if [ -f "$FIREBASE_BACKUP/NawaqesFirebaseMessagingService.java" ]; then
  cp "$FIREBASE_BACKUP/NawaqesFirebaseMessagingService.java" \
     "$APK_PROJECT/app/src/main/java/com/nawaqes/app/NawaqesFirebaseMessagingService.java"
  print_ok "NawaqesFirebaseMessagingService.java restored"

  # Uncomment the service in AndroidManifest.xml
  sed -i 's|<!-- <service|<service|; s|</service> -->|</service>|' \
    "$APK_PROJECT/app/src/main/AndroidManifest.xml"
  print_ok "Service enabled in AndroidManifest.xml"

  # Add Firebase dependencies to build.gradle
  if ! grep -q "firebase-bom" "$APK_PROJECT/app/build.gradle"; then
    sed -i "/implementation 'androidx.work:work-runtime:2.9.1'/a\\
    \\n    // Firebase (push notifications)\\n    implementation platform('com.google.firebase:firebase-bom:33.1.2')\\n    implementation 'com.google.firebase:firebase-messaging:24.0.0'" \
      "$APK_PROJECT/app/build.gradle"
    print_ok "Firebase dependencies added to build.gradle"
  fi
else
  print_err "NawaqesFirebaseMessagingService.java backup not found!"
  exit 1
fi
echo ""

# ---- Step 3: Build APK with Firebase ----
print_step "Step 3: Build APK with Firebase"
cd "$APK_PROJECT"
./gradlew clean assembleRelease --no-daemon 2>&1 | tail -10

APK_PATH="$APK_PROJECT/app/build/outputs/apk/release/app-release.apk"
if [ ! -f "$APK_PATH" ]; then
  print_err "APK build failed!"
  exit 1
fi
print_ok "APK built: $(ls -lh $APK_PATH | awk '{print $5}')"
echo ""

# ---- Step 4: Copy APK to project downloads ----
print_step "Step 4: Copy APK to project"
mkdir -p "$PROJECT_ROOT/downloads"
cp "$APK_PATH" "$PROJECT_ROOT/downloads/nawaqes-v2.0.0.apk"
print_ok "APK copied to downloads/"
echo ""

# ---- Step 5: Upload to HF Spaces ----
print_step "Step 5: Upload APK to Hugging Face Spaces"
read -p "Continue with upload? (y/N) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  python3 << 'EOF'
from huggingface_hub import HfApi
import os

api = HfApi()
space_id = "safwatkhokha/nawaqes"
apk_path = "/home/z/my-project/nawaqes/downloads/nawaqes-v2.0.0.apk"

print(f"Uploading APK ({os.path.getsize(apk_path) / (1024*1024):.2f} MB)...")
api.upload_file(
    path_or_fileobj=apk_path,
    path_in_repo="downloads/nawaqes-v2.0.0.apk",
    repo_id=space_id,
    repo_type="space",
    commit_message="📦 Update APK with Firebase Cloud Messaging"
)
print("✅ APK uploaded!")
EOF
  print_ok "APK uploaded to HF Spaces"
else
  print_warn "Upload skipped. You can upload manually via HF API later."
fi
echo ""

# ---- Step 6: Show next steps ----
print_step "Step 6: Next Steps"
echo ""
echo "  ✅ APK with Firebase built and uploaded!"
echo ""
echo "  📋 Don't forget to set these env variables on HF Spaces:"
echo "     https://huggingface.co/spaces/safwatkhokha/nawaqes/settings"
echo ""
echo "     FIREBASE_PROJECT_ID=nawaqes-app"
echo "     FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXX"
echo "     FIREBASE_AUTH_DOMAIN=nawaqes-app.firebaseapp.com"
echo "     FIREBASE_STORAGE_BUCKET=nawaqes-app.appspot.com"
echo "     FIREBASE_MESSAGING_SENDER_ID=123456789012"
echo "     FIREBASE_APP_ID=1:123456789012:web:abcdef"
echo "     FIREBASE_VAPID_KEY=BJXXXXXXXXXXXX"
echo ""
echo "  📖 Full guide: https://safwatkhokha-nawaqes.hf.space/firebase-setup"
echo ""
print_ok "Done!"
