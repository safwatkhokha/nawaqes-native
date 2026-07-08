#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  Nawaqes — Deploy to Hugging Face Spaces
#  ───────────────────────────────────────────────────────────────────
#  Usage:
#    ./deploy-to-hf.sh build        # build only, no push
#    ./deploy-to-hf.sh prepare      # build + prepare deploy folder, no push
#    ./deploy-to-hf.sh push         # push only (must prepare first)
#    ./deploy-to-hf.sh all          # build + prepare + push (default)
#
#  Required env vars (read from your shell or .env):
#    HF_TOKEN   — write-enabled HF token (https://huggingface.co/settings/tokens)
#    HF_USER    — your HF username (default: safwatkhokha)
#    HF_REPO    — Space repo name (default: nawaqes)
#  ───────────────────────────────────────────────────────────────────
#  Push strategy:
#    - We clone the existing Space repo (or init a fresh one if 404)
#    - Copy build output + server bundle + Dockerfile into the clone
#    - Commit + push with HF_TOKEN in the remote URL (no interactive prompt)
# ════════════════════════════════════════════════════════════════════
set -euo pipefail

# ─── Config ─────────────────────────────────────────────────────────
PROJECT_ROOT="${PROJECT_ROOT:-/home/z/my-project/nawaqes}"
DEPLOY_DIR="${DEPLOY_DIR:-/home/z/my-project/nawaqes-deploy}"
HF_USER="${HF_USER:-safwatkhokha}"
HF_REPO="${HF_REPO:-nawaqes}"
HF_SPACE_URL="https://huggingface.co/spaces/${HF_USER}/${HF_REPO}"
HF_APP_URL="https://${HF_USER}-${HF_REPO}.hf.space"
MODE="${1:-all}"

# Load .env if present (so HF_TOKEN etc. are available)
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a; . "$PROJECT_ROOT/.env"; set +a
fi

# ─── Colors ─────────────────────────────────────────────────────────
G='\033[0;32m'; R='\033[0;31m'; Y='\033[1;33m'; B='\033[0;34m'; N='\033[0m'
ok()   { echo -e "${G}✓ $1${N}"; }
err()  { echo -e "${R}✗ $1${N}"; }
step() { echo -e "${B}▶ $1${N}"; }
warn() { echo -e "${Y}! $1${N}"; }

# ─── Validate ──────────────────────────────────────────────────────
if [ "$MODE" = "push" ] || [ "$MODE" = "all" ]; then
  if [ -z "${HF_TOKEN:-}" ]; then
    err "HF_TOKEN is not set. Get a write token from https://huggingface.co/settings/tokens"
    err "Then: export HF_TOKEN=hf_xxx  (or add to $PROJECT_ROOT/.env)"
    exit 1
  fi
fi

# ════════════════════════════════════════════════════════════════════
#  STEP 1 — Build
# ════════════════════════════════════════════════════════════════════
if [ "$MODE" = "all" ] || [ "$MODE" = "build" ] || [ "$MODE" = "prepare" ]; then
  cd "$PROJECT_ROOT"
  step "Installing dependencies..."
  if [ -f package-lock.json ]; then
    npm ci --no-audit --no-fund --loglevel=error || npm install --no-audit --no-fund --loglevel=error
  else
    npm install --no-audit --no-fund --loglevel=error
  fi
  ok "Dependencies installed"

  step "Type-checking (tsc --noEmit)..."
  if npx tsc --noEmit; then
    ok "Type check passed"
  else
    warn "Type check found errors (continuing — esbuild will still bundle)"
  fi

  step "Building production bundle (vite + esbuild)..."
  npm run build
  ok "Build complete"
  ls -la dist/ dist/client/ 2>/dev/null | head -20
fi

if [ "$MODE" = "build" ]; then
  ok "Build-only mode complete. Output: $PROJECT_ROOT/dist/"
  exit 0
fi

# ════════════════════════════════════════════════════════════════════
#  STEP 2 — Prepare deployment folder
# ════════════════════════════════════════════════════════════════════
if [ "$MODE" = "all" ] || [ "$MODE" = "prepare" ]; then
  step "Preparing deployment folder at $DEPLOY_DIR..."
  rm -rf "$DEPLOY_DIR"
  mkdir -p "$DEPLOY_DIR"

  cd "$PROJECT_ROOT"

  # Files we DO want to ship (the Dockerfile will run `npm run build` inside the container)
  rsync -a --delete \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='dist' \
    --exclude='.env' \
    --exclude='.env.local' \
    --exclude='.env.*.local' \
    --exclude='data/*.db' \
    --exclude='data/*.db-*' \
    --exclude='uploads' \
    --exclude='backups' \
    --exclude='.cache' \
    --exclude='.vite' \
    --exclude='*.apk' \
    --exclude='*.aab' \
    --exclude='*.idsig' \
    --exclude='*.keystore' \
    --exclude='*.jks' \
    --exclude='apk-source-chat' \
    --exclude='nawaqes-apk-docs' \
    --exclude='agent-ctx' \
    --exclude='*.log' \
    --exclude='server-data/data/firebase-service-account.json' \
    --exclude='nawaqes-firebase-admin.json' \
    --exclude='google-services.json' \
    --exclude='GoogleService-Info.plist' \
    ./ "$DEPLOY_DIR/"

  # .env.example as fallback .env (HF Spaces secrets override)
  if [ -f "$DEPLOY_DIR/.env.example" ]; then
    cp "$DEPLOY_DIR/.env.example" "$DEPLOY_DIR/.env"
  fi

  # .gitattributes for LFS (HF Spaces uses LFS for large files)
  cat > "$DEPLOY_DIR/.gitattributes" << 'EOF'
*.tar.gz filter=lfs diff=lfs merge=lfs -text
*.bin filter=lfs diff=lfs merge=lfs -text
*.apk filter=lfs diff=lfs merge=lfs -text
*.db filter=lfs diff=lfs merge=lfs -text
*.sqlite filter=lfs diff=lfs merge=lfs -text
*.sqlite3 filter=lfs diff=lfs merge=lfs -text
EOF

  # README.md header for HF Spaces (specifies SDK)
  # NOTE: colorFrom/colorTo must be one of: red, yellow, green, blue, indigo, purple, pink, gray
  cat > "$DEPLOY_DIR/README.md" << EOF
---
title: Nawaqes
emoji: 📢
colorFrom: red
colorTo: pink
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# Nawaqes — منصة الإعلانات الذكية المتكاملة

Production deployment of Nawaqes. The Dockerfile builds the Vite + Express
app and runs it on port 7860.

## Live URL
- App: https://${HF_USER}-${HF_REPO}.hf.space
- Health: https://${HF_USER}-${HF_REPO}.hf.space/api/health

## Configuration
All secrets are set as HF Spaces Variables/Secrets. See \`.env.example\` for the full list.
EOF

  ok "Deployment folder ready: $DEPLOY_DIR"
  echo "  Files: $(find "$DEPLOY_DIR" -type f | wc -l)"
  echo "  Size:  $(du -sh "$DEPLOY_DIR" | cut -f1)"
fi

if [ "$MODE" = "prepare" ]; then
  ok "Prepare-only mode complete. Inspect $DEPLOY_DIR and run './deploy-to-hf.sh push' when ready."
  exit 0
fi

# ════════════════════════════════════════════════════════════════════
#  STEP 3 — Push to HF Spaces
# ════════════════════════════════════════════════════════════════════
if [ "$MODE" = "all" ] || [ "$MODE" = "push" ]; then
  if [ ! -d "$DEPLOY_DIR" ]; then
    err "Deploy folder $DEPLOY_DIR does not exist. Run './deploy-to-hf.sh prepare' first."
    exit 1
  fi

  cd "$DEPLOY_DIR"

  step "Setting up git..."
  if [ ! -d .git ]; then
    git init -q
    git config user.email "deploy@nawaqes.app"
    git config user.name "Nawaqes Deploy Bot"
  fi

  # Remote with token-embedded URL (no interactive prompt)
  git remote remove origin 2>/dev/null || true
  git remote add origin "https://${HF_USER}:${HF_TOKEN}@huggingface.co/spaces/${HF_USER}/${HF_REPO}"

  step "Committing files..."
  git add -A
  if git diff --cached --quiet; then
    warn "No changes to commit. Pushing existing commit."
  else
    git commit -m "🚀 Nawaqes deploy $(date -u '+%Y-%m-%d %H:%M:%S UTC')" -q
    ok "Committed"
  fi

  step "Pushing to Hugging Face Spaces..."
  step "  URL: $HF_SPACE_URL"
  if git push -u origin main 2>&1; then
    ok "🚀 Successfully deployed to Hugging Face Spaces!"
    ok "  App will be live in 2-5 minutes at:"
    ok "  $HF_APP_URL"
    echo ""
    echo "📱 Direct app URL:    $HF_APP_URL"
    echo "❤️  Health endpoint:  $HF_APP_URL/api/health"
    echo "⬇️  Download page:    $HF_APP_URL/get-app"
    echo "🌐 PWA manifest:     $HF_APP_URL/manifest.webmanifest"
  else
    err "Push failed. Check the error above."
    err "Common causes:"
    err "  - Wrong HF_TOKEN (regenerate at https://huggingface.co/settings/tokens)"
    err "  - Wrong HF_USER / HF_REPO"
    err "  - Space doesn't exist yet — create it first at https://huggingface.co/new-space"
    exit 1
  fi
fi
