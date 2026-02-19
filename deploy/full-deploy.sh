#!/bin/bash
# =============================================================
# White Label PBX - Full Production Deploy
# Server: 149.28.121.133 (kltconnect.com)
# Runtime: PM2
#
# HOW TO RUN:
#   ssh root@149.28.121.133
#   curl -sSL <this-file-url> | bash
#   -- OR --
#   scp deploy/full-deploy.sh root@149.28.121.133:/tmp/
#   ssh root@149.28.121.133 'bash /tmp/full-deploy.sh'
# =============================================================

set -euo pipefail

DOMAIN="kltconnect.com"
SERVER_IP="149.28.121.133"
APP_DIR="/opt/white-label-pbx"
LOG_DIR="/var/log/pbx"
REPO_URL="https://github.com/Knox-Media-Group/white-label-pbx.git"
BRANCH="claude/explore-pbx-system-oorwR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARNING:${NC} $1"; }
err() { echo -e "${RED}[$(date +'%H:%M:%S')] ERROR:${NC} $1"; }

echo ""
echo "=================================================="
echo "  White Label PBX - Production Deployment"
echo "  Domain:  $DOMAIN"
echo "  Server:  $SERVER_IP"
echo "  Runtime: PM2"
echo "=================================================="
echo ""

# ============ STEP 1: System packages ============
log "[1/10] Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -qq
apt-get upgrade -y -qq

# ============ STEP 2: Install dependencies ============
log "[2/10] Installing system dependencies..."
apt-get install -y -qq \
  curl git nginx certbot python3-certbot-nginx \
  ufw fail2ban build-essential

# ============ STEP 3: Install Node.js 20 ============
log "[3/10] Installing Node.js 20..."
if ! command -v node &> /dev/null || [[ "$(node -v)" != v20* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
log "  Node $(node -v), npm $(npm -v)"

# ============ STEP 4: Install pnpm + PM2 ============
log "[4/10] Installing pnpm and PM2..."
corepack enable 2>/dev/null || npm install -g corepack
corepack prepare pnpm@10.4.1 --activate 2>/dev/null || true
npm install -g pm2

# ============ STEP 5: Clone / update repo ============
log "[5/10] Setting up application code..."
mkdir -p "$APP_DIR"
mkdir -p "$LOG_DIR"

if [ -d "$APP_DIR/.git" ]; then
  log "  Repo exists, pulling latest..."
  cd "$APP_DIR"
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull origin "$BRANCH"
else
  log "  Cloning repository..."
  git clone -b "$BRANCH" "$REPO_URL" "$APP_DIR" 2>/dev/null || {
    warn "Git clone failed. You may need to manually copy files to $APP_DIR"
    warn "Try: scp -r ./* root@$SERVER_IP:$APP_DIR/"
  }
  cd "$APP_DIR"
fi

# ============ STEP 6: Install deps + build ============
log "[6/10] Installing dependencies and building..."
cd "$APP_DIR"

if [ -f "pnpm-lock.yaml" ]; then
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  pnpm run build
else
  err "No pnpm-lock.yaml found. Make sure the code is in $APP_DIR"
  exit 1
fi

# ============ STEP 7: Configure nginx ============
log "[7/10] Configuring nginx for $DOMAIN..."

# Copy our nginx config
cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/pbx

# Temporarily set up HTTP-only config for certbot
cat > /etc/nginx/sites-available/pbx-temp <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX

# Enable temp config first (SSL comes after certbot)
rm -f /etc/nginx/sites-enabled/default
rm -f /etc/nginx/sites-enabled/pbx
rm -f /etc/nginx/sites-enabled/pbx-temp
ln -sf /etc/nginx/sites-available/pbx-temp /etc/nginx/sites-enabled/pbx-temp

mkdir -p /var/www/certbot
nginx -t && systemctl restart nginx

# ============ STEP 8: Firewall ============
log "[8/10] Configuring firewall..."
ufw --force enable
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow http
ufw allow https

# fail2ban
systemctl enable fail2ban 2>/dev/null
systemctl start fail2ban 2>/dev/null

# ============ STEP 9: Start application with PM2 ============
log "[9/10] Starting application with PM2..."
cd "$APP_DIR"

# Stop existing instance if any
pm2 delete white-label-pbx 2>/dev/null || true

# Start
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

# Wait for app to be ready
log "  Waiting for app to start..."
sleep 5

if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
  log "  App is running! Health check passed."
else
  warn "  App may not be ready yet. Check: pm2 logs white-label-pbx"
fi

# ============ STEP 10: SSL Certificate ============
log "[10/10] Getting SSL certificate..."

# Try to get SSL cert
certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" \
  --non-interactive --agree-tos \
  --email "admin@$DOMAIN" \
  --redirect 2>/dev/null && {

  # SSL obtained - switch to full nginx config
  rm -f /etc/nginx/sites-enabled/pbx-temp
  ln -sf /etc/nginx/sites-available/pbx /etc/nginx/sites-enabled/pbx
  nginx -t && systemctl reload nginx
  log "  SSL certificate installed!"

} || {
  warn "  SSL cert failed. Make sure DNS for $DOMAIN points to $SERVER_IP"
  warn "  You can retry later: certbot --nginx -d $DOMAIN -d www.$DOMAIN"
  warn "  App is running on HTTP for now."
}

# ============ STEP 11: Setup backup cron ============
log "Setting up automated backups..."
chmod +x "$APP_DIR/deploy/backup.sh"
(crontab -l 2>/dev/null; echo "0 2 * * * $APP_DIR/deploy/backup.sh >> /var/log/pbx/backup.log 2>&1") | sort -u | crontab -

# ============ DONE ============
echo ""
echo "=================================================="
echo -e "  ${GREEN}DEPLOYMENT COMPLETE${NC}"
echo "=================================================="
echo ""
echo "  Domain:     https://$DOMAIN"
echo "  Health:     https://$DOMAIN/api/health"
echo "  Admin:      https://$DOMAIN/admin"
echo "  Portal:     https://$DOMAIN/portal"
echo ""
echo "  PM2 Status: pm2 status"
echo "  PM2 Logs:   pm2 logs white-label-pbx"
echo "  Restart:    pm2 restart white-label-pbx"
echo ""
echo "  Telnyx Webhooks to configure:"
echo "    Voice:     https://$DOMAIN/api/webhooks/telnyx/voice"
echo "    Status:    https://$DOMAIN/api/webhooks/telnyx/status"
echo "    Recording: https://$DOMAIN/api/webhooks/telnyx/recording"
echo ""
echo "  Retell Webhooks:"
echo "    Call Status:    https://$DOMAIN/api/webhooks/retell/call-status"
echo "    Inbound Config: https://$DOMAIN/api/webhooks/retell/inbound-config"
echo ""
