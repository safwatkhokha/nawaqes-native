#!/bin/bash
# Build Nawaqes native APK via EAS
set -e

export EXPO_TOKEN="4NIPZMKt0zxtJaCkV3U1lNc4kersarZ9mtosqOt4"
cd /home/z/my-project/nawaqes-native

echo "[BUILD] Working dir: $(pwd)"
echo "[BUILD] EXPO_TOKEN set: ${#EXPO_TOKEN} chars"

echo ""
echo "[BUILD] Running EAS build (preview profile = APK)..."
echo "[BUILD] This will take 5-15 minutes..."
echo ""

npx eas-cli build --platform android --profile preview --non-interactive --no-wait 2>&1

echo ""
echo "[BUILD] Build submitted!"
