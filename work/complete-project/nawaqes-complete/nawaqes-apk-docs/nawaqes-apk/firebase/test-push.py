#!/usr/bin/env python3
"""
Nawaqes — FCM Push Notification Test Script
============================================
Sends a test push notification to verify Firebase setup is working.

Usage:
    python3 test-push.py <DEVICE_TOKEN> [TITLE] [BODY] [URL]

Examples:
    python3 test-push.py "DEVICE_TOKEN_HERE"
    python3 test-push.py "TOKEN" "🎉 مرحباً" "هذه رسالة تجريبية" "/messages"
"""

import json
import sys
import os
import time
import urllib.request
import urllib.parse
import http.client
import ssl
import base64
from pathlib import Path

# Configuration
SERVICE_ACCOUNT_PATH = "/home/z/my-project/nawaqes/data/firebase-service-account.json"
# Also try alternate locations
ALT_PATHS = [
    "/data/firebase-service-account.json",
    "/home/z/my-project/nawaqes/data/firebase-service-account.json",
    "/home/z/my-project/upload/nawaqes-app-firebase-adminsdk-fbsvc-f3fb773f21.json",
]


def load_service_account():
    for path in [SERVICE_ACCOUNT_PATH] + ALT_PATHS:
        if os.path.exists(path):
            with open(path) as f:
                print(f"✅ Using service account from: {path}")
                return json.load(f)
    print("❌ Service account file not found!")
    print("   Looked in:")
    for p in [SERVICE_ACCOUNT_PATH] + ALT_PATHS:
        print(f"     - {p}")
    sys.exit(1)


def create_jwt(sa):
    """Create signed JWT for OAuth2 authentication."""
    try:
        from cryptography.hazmat.primitives import serialization, hashes
        from cryptography.hazmat.primitives.asymmetric import padding
    except ImportError:
        print("❌ cryptography library not installed. Run: pip install cryptography")
        sys.exit(1)

    header = {"alg": "RS256", "typ": "JWT"}
    now = int(time.time())
    payload = {
        "iss": sa["client_email"],
        "scope": "https://www.googleapis.com/auth/firebase.messaging",
        "aud": "https://oauth2.googleapis.com/token",
        "exp": now + 3600,
        "iat": now,
    }

    def b64url(data):
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

    header_b64 = b64url(json.dumps(header).encode())
    payload_b64 = b64url(json.dumps(payload).encode())
    signing_input = f"{header_b64}.{payload_b64}".encode()

    private_key = serialization.load_pem_private_key(
        sa["private_key"].encode(),
        password=None,
    )
    signature = private_key.sign(
        signing_input,
        padding.PKCS1v15(),
        hashes.SHA256(),
    )
    signature_b64 = b64url(signature)

    return f"{header_b64}.{payload_b64}.{signature_b64}"


def get_access_token(sa):
    """Exchange JWT for OAuth2 access token."""
    jwt_token = create_jwt(sa)
    data = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": jwt_token,
    }).encode()

    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    with urllib.request.urlopen(req, timeout=30) as resp:
        token_data = json.loads(resp.read())
        return token_data["access_token"]


def send_push_notification(token, title, body, url="/"):
    """Send push notification via FCM V1 API."""
    sa = load_service_account()
    project_id = sa["project_id"]

    print(f"\n📤 Sending push notification...")
    print(f"   Project: {project_id}")
    print(f"   Token: {token[:30]}...")
    print(f"   Title: {title}")
    print(f"   Body:  {body}")
    print(f"   URL:   {url}")

    access_token = get_access_token(sa)
    print(f"   ✅ Access token obtained")

    message = {
        "message": {
            "token": token,
            "notification": {
                "title": title,
                "body": body,
            },
            "data": {
                "url": url,
                "title": title,
                "body": body,
            },
            "android": {
                "priority": "high",
                "notification": {
                    "icon": "ic_launcher",
                    "color": "#DC2626",
                    "sound": "default",
                    "channel_id": "nawaqes_default",
                    "click_action": url,
                },
            },
            "webpush": {
                "notification": {
                    "icon": "/icons/icon-192.png",
                    "badge": "/icons/favicon-32.png",
                    "vibrate": [100, 50, 100],
                    "dir": "rtl",
                    "lang": "ar",
                    "tag": "nawaqes-test",
                    "renotify": True,
                    "actions": [
                        {"action": "open", "title": "فتح"},
                        {"action": "dismiss", "title": "إغلاق"},
                    ],
                },
                "fcm_options": {
                    "link": f"https://safwatkhokha-nawaqes.hf.space{url}",
                },
            },
        },
    }

    # Send via FCM V1 API
    url_fcm = f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"
    post_data = json.dumps(message).encode()

    req = urllib.request.Request(
        url_fcm,
        data=post_data,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            response = json.loads(resp.read())
            print(f"\n✅ Push notification sent successfully!")
            print(f"   Response: {json.dumps(response, indent=2)}")
            print(f"\n🎉 Check your device/browser — notification should appear!")
            return True
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"\n❌ Failed to send push notification!")
        print(f"   HTTP {e.code}: {e.reason}")
        print(f"   Response: {error_body}")

        # Parse error for helpful messages
        try:
            err_data = json.loads(error_body)
            err = err_data.get("error", {})
            msg = err.get("message", "")

            if "registration-token-not-registered" in msg:
                print("\n💡 The device token is invalid or expired.")
                print("   Make sure you copied the FULL token from the browser console.")
                print("   Refresh the page and try again.")
            elif "permission-denied" in msg:
                print("\n💡 Firebase project doesn't have permission to send.")
                print("   Check that you enabled Cloud Messaging API (V1).")
            elif "invalid-argument" in msg:
                print("\n💡 The request has invalid arguments.")
                print("   Check the device token format.")
        except Exception:
            pass
        return False


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        print("\n📋 HOW TO GET DEVICE TOKEN:")
        print("1. Open https://safwatkhokha-nawaqes.hf.space in Chrome")
        print("2. Login → Settings → Toggle 'Push Notifications' ON")
        print("3. Allow notifications when prompted")
        print("4. Open Browser Console (F12)")
        print("5. Look for: [FCM] Device token: XXXXX")
        print("6. Copy that token and run this script again")
        sys.exit(1)

    token = sys.argv[1]
    title = sys.argv[2] if len(sys.argv) > 2 else "🎉 نواقص"
    body = sys.argv[3] if len(sys.argv) > 3 else "هذه رسالة تجريبية من Firebase Cloud Messaging!"
    url = sys.argv[4] if len(sys.argv) > 4 else "/"

    send_push_notification(token, title, body, url)


if __name__ == "__main__":
    main()
