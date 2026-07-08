#!/usr/bin/env python3
"""
Nawaqes — Firebase Auto-Setup Script
=====================================
Applies a Firebase config JSON (downloaded from /firebase-setup-interactive)
to:
1. Update HF Spaces env variables
2. Add google-services.json to webview-apk project
3. Add Service Account JSON to /data
4. Restore FirebaseMessagingService.java
5. Rebuild APK with Firebase
6. Upload new APK to HF Spaces

Usage:
    python3 apply-firebase-config.py nawaqes-firebase-config.json
"""

import json
import os
import sys
import subprocess
import shutil
from pathlib import Path

# =====================================================
# Configuration
# =====================================================
PROJECT_ROOT = Path("/home/z/my-project/nawaqes")
APK_PROJECT = Path("/home/z/my-project/nawaqes-apk/webview-apk")
FIREBASE_BACKUP = Path("/home/z/my-project/nawaqes-apk/firebase-backup")
GS_PATH = APK_PROJECT / "app" / "google-services.json"
SERVICE_ACCOUNT_PATH = Path("/data/firebase-service-account.json")
HF_SPACE_ID = "safwatkhokha/nawaqes"

# Environment variables
ANDROID_HOME = os.path.expanduser("~/android-sdk")
JAVA_HOME = os.path.expanduser("~/jdk17")

# Colors
GREEN = "\033[0;32m"
RED = "\033[0;31m"
YELLOW = "\033[1;33m"
BLUE = "\033[0;34m"
NC = "\033[0m"

def step(msg): print(f"{BLUE}▶ {msg}{NC}")
def ok(msg):   print(f"{GREEN}✓ {msg}{NC}")
def err(msg):  print(f"{RED}✗ {msg}{NC}")
def warn(msg): print(f"{YELLOW}! {msg}{NC}")

def main():
    if len(sys.argv) != 2:
        err("Usage: python3 apply-firebase-config.py <config-file.json>")
        sys.exit(1)

    config_file = Path(sys.argv[1])
    if not config_file.exists():
        err(f"Config file not found: {config_file}")
        sys.exit(1)

    step(f"Loading Firebase config from: {config_file}")
    with open(config_file) as f:
        config = json.load(f)

    fb_config = config.get("firebase_config", {})
    google_services = config.get("google_services", {})
    vapid_key = config.get("vapid_key", "")
    service_account = config.get("service_account", {})

    # Validate
    if not fb_config.get("apiKey"):
        err("firebase_config.apiKey missing!")
        sys.exit(1)
    if not google_services:
        err("google_services missing!")
        sys.exit(1)
    if not vapid_key:
        err("vapid_key missing!")
        sys.exit(1)
    if not service_account:
        err("service_account missing!")
        sys.exit(1)

    ok("All required fields present")

    # =====================================================
    # Step 1: Save google-services.json to APK project
    # =====================================================
    step("Step 1: Save google-services.json to webview-apk project")
    GS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(GS_PATH, "w") as f:
        json.dump(google_services, f, indent=2)
    ok(f"google-services.json saved at: {GS_PATH}")

    # =====================================================
    # Step 2: Restore FirebaseMessagingService.java
    # =====================================================
    step("Step 2: Restore Firebase Messaging Service")
    backup_java = FIREBASE_BACKUP / "NawaqesFirebaseMessagingService.java"
    target_java = APK_PROJECT / "app/src/main/java/com/nawaqes/app/NawaqesFirebaseMessagingService.java"
    if backup_java.exists():
        shutil.copy2(backup_java, target_java)
        ok("NawaqesFirebaseMessagingService.java restored")
    else:
        err(f"Backup not found: {backup_java}")
        sys.exit(1)

    # Uncomment service in AndroidManifest.xml
    manifest_path = APK_PROJECT / "app/src/main/AndroidManifest.xml"
    manifest_content = manifest_path.read_text()
    manifest_content = manifest_content.replace("<!-- <service", "<service")
    manifest_content = manifest_content.replace("</service> -->", "</service>")

    # Add Firebase meta-data if not present
    if "default_notification_channel_id" not in manifest_content:
        manifest_content = manifest_content.replace(
            "</application>",
            '''        <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id"
            android:value="nawaqes_default" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_icon"
            android:resource="@mipmap/ic_launcher" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_color"
            android:resource="@color/colorPrimary" />

    </application>'''
        )

    manifest_path.write_text(manifest_content)
    ok("AndroidManifest.xml updated with Firebase service")

    # Add Firebase dependencies to build.gradle
    build_gradle = APK_PROJECT / "app/build.gradle"
    bg_content = build_gradle.read_text()
    if "firebase-bom" not in bg_content:
        bg_content = bg_content.replace(
            "implementation 'androidx.work:work-runtime:2.9.1'",
            """implementation 'androidx.work:work-runtime:2.9.1'

    // Firebase (push notifications)
    implementation platform('com.google.firebase:firebase-bom:33.1.2')
    implementation 'com.google.firebase:firebase-messaging:24.0.0'"""
        )
        build_gradle.write_text(bg_content)
        ok("Firebase dependencies added to build.gradle")
    else:
        ok("Firebase dependencies already present")

    # =====================================================
    # Step 3: Save Service Account JSON
    # =====================================================
    step("Step 3: Save Service Account JSON")
    SERVICE_ACCOUNT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(SERVICE_ACCOUNT_PATH, "w") as f:
        json.dump(service_account, f, indent=2)
    ok(f"Service Account JSON saved at: {SERVICE_ACCOUNT_PATH}")

    # Also save locally (HF Spaces persistent storage will pick it up)
    local_sa_path = PROJECT_ROOT / "data" / "firebase-service-account.json"
    local_sa_path.parent.mkdir(parents=True, exist_ok=True)
    with open(local_sa_path, "w") as f:
        json.dump(service_account, f, indent=2)
    ok(f"Local copy: {local_sa_path}")

    # =====================================================
    # Step 4: Build APK with Firebase
    # =====================================================
    step("Step 4: Build APK with Firebase enabled")
    env = os.environ.copy()
    env.update({
        "ANDROID_HOME": ANDROID_HOME,
        "ANDROID_SDK_ROOT": ANDROID_HOME,
        "JAVA_HOME": JAVA_HOME,
        "PATH": f"{JAVA_HOME}/bin:{ANDROID_HOME}/cmdline-tools/latest/bin:{ANDROID_HOME}/platform-tools:{env['PATH']}",
    })

    cmd = ["./gradlew", "clean", "assembleRelease", "--no-daemon"]
    print(f"  Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=str(APK_PROJECT), env=env, capture_output=True, text=True)

    if result.returncode != 0:
        err("APK build failed!")
        print("\n--- STDOUT (last 30 lines) ---")
        print("\n".join(result.stdout.split("\n")[-30:]))
        print("\n--- STDERR (last 30 lines) ---")
        print("\n".join(result.stderr.split("\n")[-30:]))
        sys.exit(1)

    apk_path = APK_PROJECT / "app/build/outputs/apk/release/app-release.apk"
    if not apk_path.exists():
        err(f"APK file not found: {apk_path}")
        sys.exit(1)

    apk_size = apk_path.stat().st_size / (1024 * 1024)
    ok(f"APK built: {apk_path} ({apk_size:.2f} MB)")

    # Copy APK to project downloads
    downloads_dir = PROJECT_ROOT / "downloads"
    downloads_dir.mkdir(parents=True, exist_ok=True)
    final_apk = downloads_dir / "nawaqes-v2.0.0.apk"
    shutil.copy2(apk_path, final_apk)
    ok(f"APK copied to: {final_apk}")

    # =====================================================
    # Step 5: Upload APK to HF Spaces
    # =====================================================
    step("Step 5: Upload APK to HF Spaces")
    try:
        from huggingface_hub import HfApi
        api = HfApi()
        api.upload_file(
            path_or_fileobj=str(final_apk),
            path_in_repo="downloads/nawaqes-v2.0.0.apk",
            repo_id=HF_SPACE_ID,
            repo_type="space",
            commit_message="📦 Update APK with Firebase Cloud Messaging"
        )
        ok("APK uploaded to HF Spaces")
    except Exception as e:
        err(f"APK upload failed: {e}")
        warn("You can upload manually via HF API later")

    # =====================================================
    # Step 6: Set HF Spaces env variables
    # =====================================================
    step("Step 6: Set HF Spaces environment variables")
    env_vars = {
        "FIREBASE_PROJECT_ID": fb_config.get("projectId", "nawaqes-app"),
        "FIREBASE_API_KEY": fb_config["apiKey"],
        "FIREBASE_AUTH_DOMAIN": fb_config.get("authDomain", ""),
        "FIREBASE_STORAGE_BUCKET": fb_config.get("storageBucket", ""),
        "FIREBASE_MESSAGING_SENDER_ID": fb_config.get("messagingSenderId", ""),
        "FIREBASE_APP_ID": fb_config.get("appId", ""),
        "FIREBASE_VAPID_KEY": vapid_key,
    }

    try:
        from huggingface_hub import HfApi
        api = HfApi()
        for key, value in env_vars.items():
            try:
                api.add_space_secret(HF_SPACE_ID, key, value)
                ok(f"  Set {key}")
            except Exception as e:
                warn(f"  Failed to set {key}: {e}")
        ok("All env variables set on HF Spaces")
    except Exception as e:
        err(f"Failed to set env variables: {e}")
        warn("Set them manually at: https://huggingface.co/spaces/safwatkhokha/nawaqes/settings")

    # =====================================================
    # Done!
    # =====================================================
    print()
    print(f"{GREEN}================================================{NC}")
    print(f"{GREEN}  🎉 Firebase setup complete!{NC}")
    print(f"{GREEN}================================================{NC}")
    print()
    print(f"  ✅ google-services.json added to APK project")
    print(f"  ✅ FirebaseMessagingService.java restored")
    print(f"  ✅ Service Account JSON saved")
    print(f"  ✅ APK rebuilt with Firebase ({apk_size:.2f} MB)")
    print(f"  ✅ APK uploaded to HF Spaces")
    print(f"  ✅ HF Spaces env variables set")
    print()
    print(f"  📱 App URL: https://safwatkhokha-nawaqes.hf.space")
    print(f"  📦 APK URL: https://safwatkhokha-nawaqes.hf.space/download/nawaqes-v2.0.0.apk")
    print(f"  🔥 Firebase: {fb_config.get('projectId', 'nawaqes-app')}")
    print()
    print(f"{YELLOW}  ⏳ HF Space is rebuilding. Test in 2-3 minutes.{NC}")
    print()
    print(f"{BLUE}  To test push notifications:{NC}")
    print(f"  1. Open the app in Chrome (desktop or Android)")
    print(f"  2. Login, go to Settings, enable notifications")
    print(f"  3. Allow notifications when prompted")
    print(f"  4. Copy the device token from browser console")
    print(f"  5. Run: node /home/z/my-project/nawaqes-apk/firebase/test-push.js YOUR_TOKEN")
    print()


if __name__ == "__main__":
    main()
