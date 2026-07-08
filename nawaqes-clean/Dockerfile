# ════════════════════════════════════════════════════════════════════
#  Nawaqes — Dockerfile for Hugging Face Spaces
#  - HF Spaces expects the app to listen on 0.0.0.0:7860
#  - Persistent storage is mounted at /data (HF Spaces convention)
#  - Secrets are injected via HF Spaces "Variables and secrets"
# ════════════════════════════════════════════════════════════════════

FROM node:20-slim

# ─── System deps for better-sqlite3 native build ────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ libc6-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ─── HF Spaces convention ───────────────────────────────────────────
# node:20-slim already has a "node" user with UID 1000 — reuse it.
# - Persistent storage: /data (auto-mounted by HF Spaces)
# - App port: 7860
ENV NODE_ENV=production \
    PORT=7860 \
    PERSISTENT_DIR=/data

WORKDIR /app

# ─── Copy package files & install deps (cached layer) ──────────────
COPY --chown=node:node package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund 2>/dev/null || npm install --omit=dev --no-audit --no-fund

# ─── Copy source & build ────────────────────────────────────────────
COPY --chown=node:node . .

# Build the web bundle + server bundle
RUN npm run build

# ─── Create persistent storage directories ─────────────────────────
RUN mkdir -p /data/uploads /data/uploads/videos /data/backups /data/downloads \
    && chown -R node:node /data /app

# Switch to non-root user (HF Spaces requirement — 'node' user already exists in base image)
USER node

# ─── Default .env handling ─────────────────────────────────────────
RUN cp -n .env.example .env 2>/dev/null || true

EXPOSE 7860

# ─── Health check ──────────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://localhost:7860/api/health').then(r=>{process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"

# ─── Start command ──────────────────────────────────────────────────
CMD ["node", "dist/server.mjs"]
