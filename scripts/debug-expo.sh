#!/bin/bash
cd /home/z/my-project/nawaqes-native
export EXPO_TOKEN="4NIPZMKt0zxtJaCkV3U1lNc4kersarZ9mtosqOt4"

echo "=== Node version ==="
node --version

echo ""
echo "=== NPM list expo ==="
npm ls expo 2>&1 | head -5

echo ""
echo "=== Try expo config (full error) ==="
node node_modules/expo/bin/cli config --json 2>&1 | head -40

echo ""
echo "=== Check app.json syntax ==="
node -e "const c = require('./app.json'); console.log('app.json OK:', JSON.stringify(c.expo.name))" 2>&1

echo ""
echo "=== Check package.json ==="
node -e "const p = require('./package.json'); console.log('name:', p.name, 'deps:', Object.keys(p.dependencies).length)" 2>&1
