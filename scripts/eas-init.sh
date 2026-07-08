#!/bin/bash
set -e
cd /home/z/my-project/nawaqes-native
export EXPO_TOKEN="4NIPZMKt0zxtJaCkV3U1lNc4kersarZ9mtosqOt4"

echo "=== Creating new project on Expo ==="
npx --yes eas-cli init --non-interactive 2>&1

echo ""
echo "=== Project ID ==="
node -e "const c=require('./app.json'); console.log('Project ID:', c.expo.extra?.eas?.projectId || 'NOT SET')" 2>&1

echo ""
echo "=== Submitting build ==="
npx --yes eas-cli build --platform android --profile preview --non-interactive --no-wait 2>&1
