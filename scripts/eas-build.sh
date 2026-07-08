#!/bin/bash
set -e
cd /home/z/my-project/nawaqes-native
export EXPO_TOKEN="4NIPZMKt0zxtJaCkV3U1lNc4kersarZ9mtosqOt4"

echo "PWD: $(pwd)"
echo "EAS binary: $(ls node_modules/.bin/eas 2>&1)"

# Use npx but from the correct directory
npx --yes eas-cli build --platform android --profile preview --non-interactive --no-wait 2>&1
