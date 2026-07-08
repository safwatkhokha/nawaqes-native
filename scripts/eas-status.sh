#!/bin/bash
cd /home/z/my-project/nawaqes-native
export EXPO_TOKEN="4NIPZMKt0zxtJaCkV3U1lNc4kersarZ9mtosqOt4"

echo "=== Build Status ==="
npx --yes eas-cli build:list --platform android --limit 1 2>&1
