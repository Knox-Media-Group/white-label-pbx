#!/bin/bash
# White Label PBX - Deployment Script
# Pulls latest code, builds, and restarts the application
# Usage: bash deploy.sh

set -euo pipefail

APP_DIR="/opt/white-label-pbx"
BRANCH="${1:-main}"

echo "=== Deploying White Label PBX ==="
echo "Branch: $BRANCH"
echo "Directory: $APP_DIR"
echo ""

cd "$APP_DIR"

# Pull latest code
echo "[1/5] Pulling latest code..."
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull origin "$BRANCH"

# Install dependencies
echo "[2/5] Installing dependencies..."
pnpm install --frozen-lockfile

# Build
echo "[3/5] Building application..."
pnpm run build

# Run database migrations
echo "[4/5] Running database migrations..."
pnpm run db:push || echo "Warning: migrations failed or nothing to migrate"

# Restart application
echo "[5/5] Restarting application..."
if pm2 describe white-label-pbx > /dev/null 2>&1; then
  pm2 restart white-label-pbx
else
  pm2 start ecosystem.config.cjs
fi

pm2 save

echo ""
echo "=== Deployment complete! ==="
echo ""

# Health check
sleep 3
if curl -sf http://localhost:3000/api/health > /dev/null; then
  echo "Health check: PASSED"
else
  echo "Health check: FAILED - check logs with: pm2 logs white-label-pbx"
fi
