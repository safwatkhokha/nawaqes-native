#!/usr/bin/env bash
# =====================================================
# Nawaqes — Auto Deploy Script to Hugging Face Spaces
# =====================================================
# This script:
#   1. Builds the web project
#   2. Prepares a deployment folder with everything needed
#   3. Creates a git repo and pushes to HF Spaces
#
# Usage:
#   ./deploy-to-hf.sh                  # Interactive setup
#   ./deploy-to-hf.sh build-only       # Just build, don't push
#   ./deploy-to-hf.sh deploy           # Skip build, just push
# =====================================================

set -e

PROJECT_ROOT="/home/z/my-project/nawaqes"
DEPLOY_DIR="/home/z/my-project/nawaqes-deploy"
HF_REPO="${HF_REPO:-safwatkhokha-nawaqes}"
HF_USER="${HF_USER:-safwatkhokha}"
HF_URL="https://huggingface.co/spaces/${HF_USER}/${HF_REPO}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() { echo -e "${BLUE}▶ $1${NC}"; }
print_ok()   { echo -e "${GREEN}✓ $1${NC}"; }
print_err()  { echo -e "${RED}✗ $1${NC}"; }
print_warn() { echo -e "${YELLOW}! $1${NC}"; }

MODE="${1:-all}"

# ---- Step 1: Build the web project ----
if [ "$MODE" = "all" ] || [ "$MODE" = "build-only" ]; then
  cd "$PROJECT_ROOT"

  print_step "Installing dependencies..."
  npm install --no-audit --no-fund --loglevel=error
  print_ok "Dependencies installed"

  print_step "Building web project (PWA + Vite)..."
  CAPACITOR_BUILD=false npm run build:web
  print_ok "Web build complete"

  print_step "Building server bundle (esbuild)..."
  npm run build
  print_ok "Server build complete"
fi

if [ "$MODE" = "build-only" ]; then
  print_ok "Build-only mode complete. Output in: $PROJECT_ROOT/dist/"
  exit 0
fi

# ---- Step 2: Prepare deployment directory ----
print_step "Preparing deployment directory..."
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"

# Copy all project files (excluding node_modules, dist, .env)
cd "$PROJECT_ROOT"
rsync -a --exclude='node_modules' --exclude='dist' --exclude='.env' \
          --exclude='.env.local' --exclude='data' --exclude='uploads' \
          --exclude='backups' --exclude='.git' --exclude='android' \
          --exclude='*.zip' --exclude='agent-ctx' \
  ./ "$DEPLOY_DIR/"

print_ok "Deployment files prepared at: $DEPLOY_DIR"
echo "Files in deployment:"
find "$DEPLOY_DIR" -maxdepth 2 -type f | wc -l
echo "files"

# ---- Step 3: Initialize git repo ----
cd "$DEPLOY_DIR"

if [ ! -d .git ]; then
  print_step "Initializing git repository..."
  git init -q
  git config user.email "deploy@nawaqes.app"
  git config user.name "Nawaqes Deploy Bot"
  git remote add origin "https://huggingface.co/spaces/${HF_USER}/${HF_REPO}" 2>/dev/null || true
  print_ok "Git repository initialized"
fi

# ---- Step 4: Create .gitattributes for HF Spaces ----
cat > .gitattributes << 'EOF'
*.tar.gz filter=lfs diff=lfs merge=lfs -text
*.bin filter=lfs diff=lfs merge=lfs -text
*.apk filter=lfs diff=lfs merge=lfs -text
*.db filter=lfs diff=lfs merge=lfs -text
EOF

# ---- Step 5: Commit and push ----
print_step "Committing changes..."
git add -A
git commit -m "🚀 Nawaqes v2.0.0 — Production Deploy $(date -u '+%Y-%m-%d %H:%M:%S UTC')

✨ Features:
- PWA (Progressive Web App) support with offline mode
- Service Worker with smart caching strategies
- Push notifications support (FCM)
- APK download landing page (/get-app)
- Mobile app icons and splash screens
- Arabic RTL support with dark mode

📦 Deployed via: deploy-to-hf.sh" -q

print_warn "Pushing to Hugging Face Spaces..."
print_warn "URL: $HF_URL"
print_warn ""
print_warn "If this is your first push, you'll be prompted for HF credentials."
print_warn "Get them from: https://huggingface.co/settings/tokens"
print_warn ""

if git push -u origin main 2>&1; then
  print_ok "🚀 Successfully deployed to Hugging Face Spaces!"
  print_ok "App will be live in 2-3 minutes at:"
  print_ok "  $HF_URL"
  echo ""
  echo "📱 Direct app URL:   $HF_URL"
  echo "⬇️  Download page:    $HF_URL/get-app"
  echo "🌐 PWA manifest:     $HF_URL/manifest.webmanifest"
else
  print_err "Push failed. Please check your HF credentials."
  print_err "Run: git remote -v"
  print_err "And: git push -u origin main"
  exit 1
fi
