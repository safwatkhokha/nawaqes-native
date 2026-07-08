#!/bin/bash
set -e
cd /home/z/my-project/nawaqes-native
export EXPO_TOKEN="4NIPZMKt0zxtJaCkV3U1lNc4kersarZ9mtosqOt4"

echo "=== Submitting EAS build ==="
npx --yes eas-cli build --platform android --profile preview --non-interactive --no-wait 2>&1
