#!/bin/bash
set -e
cd /home/z/my-project/nawaqes-native

echo "PWD: $(pwd)"
echo "package.json exists: $(ls package.json 2>&1)"

echo ""
echo "=== Cleaning ==="
rm -rf node_modules package-lock.json .expo

echo ""
echo "=== Installing dependencies ==="
npm install 2>&1 | tail -5

echo ""
echo "=== TypeScript check ==="
node_modules/.bin/tsc --noEmit --project tsconfig.json 2>&1 | head -10
echo "tsc exit=$?"

echo ""
echo "=== Submitting EAS build ==="
export EXPO_TOKEN="4NIPZMKt0zxtJaCkV3U1lNc4kersarZ9mtosqOt4"
npx --yes eas-cli build --platform android --profile preview --non-interactive --no-wait 2>&1 | tail -15
