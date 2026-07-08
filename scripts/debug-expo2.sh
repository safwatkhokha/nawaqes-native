#!/bin/bash
cd /home/z/my-project/nawaqes-native
export EXPO_TOKEN="4NIPZMKt0zxtJaCkV3U1lNc4kersarZ9mtosqOt4"

echo "=== Testing local expo config ==="
node node_modules/expo/bin/cli config 2>&1 | head -20
echo "exit=$?"

echo ""
echo "=== Testing EAS build (non-interactive, no-wait) ==="
node node_modules/eas-cli/bin/run build --platform android --profile preview --non-interactive --no-wait 2>&1 | tail -30
echo "exit=$?"
