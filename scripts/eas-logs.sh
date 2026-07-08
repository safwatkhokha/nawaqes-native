#!/bin/bash
cd /home/z/my-project/nawaqes-native
export EXPO_TOKEN="4NIPZMKt0zxtJaCkV3U1lNc4kersarZ9mtosqOt4"

echo "=== Build logs (last 60 lines) ==="
npx --yes eas-cli build:view bc07eab4-8c88-498c-a41d-7ff644881835 2>&1 | tail -60
