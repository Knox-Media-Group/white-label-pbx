#!/bin/bash
# White Label PBX - Server Setup Script
# Run this on a fresh Ubuntu/Debian VPS
# Usage: bash setup-server.sh your-domain.com

set -euo pipefail

DOMAIN=${1:-""}
APP_DIR="/opt/white-label-pbx"
LOG_DIR="/var/log/pbx"

echo "=== White Label PBX Server Setup ==="

if [ -z "$DOMAIN" ]; then
  echo "Usage: bash setup-server.sh your-domain.com"
  exit 1
fi

# Update system
echo "[1/8] Updating system packages..."
apt-get update -y && apt-get upgrade -y

# Install dependencies
echo "[2/8] Installing dependencies..."
apt-get install -y \
  curl \
  git \
  nginx \
  certbot \
  python3-certbot-nginx \
  ufw \
  fail2ban

# Install Node.js 20
echo "[3/8] Installing Node.js 20..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# Install pnpm
echo "[4/8] Installing pnpm..."
corepack enable
corepack prepare pnpm@10.4.1 --activate

# Install PM2
echo "[5/8] Installing PM2..."
npm install -g pm2

# Create app directory and log directory
echo "[6/8] Setting up directories..."
mkdir -p "$APP_DIR"
mkdir -p "$LOG_DIR"

# Configure firewall
echo "[7/8] Configuring firewall..."
ufw --force enable
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow http
ufw allow https
ufw allow 51820/udp  # WireGuard

# Configure fail2ban
echo "[8/8] Configuring fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban

echo ""
echo "=== Server setup complete! ==="
echo ""
echo "Next steps:"
echo "  1. Clone/copy your app to $APP_DIR"
echo "  2. Copy .env file to $APP_DIR/.env"
echo "  3. Run: cd $APP_DIR && pnpm install && pnpm run build"
echo "  4. Configure nginx: cp $APP_DIR/deploy/nginx.conf /etc/nginx/sites-available/pbx"
echo "     Then edit the domain name in the config"
echo "     ln -s /etc/nginx/sites-available/pbx /etc/nginx/sites-enabled/"
echo "     rm /etc/nginx/sites-enabled/default"
echo "  5. Get SSL cert: certbot --nginx -d $DOMAIN"
echo "  6. Start app: cd $APP_DIR && pm2 start ecosystem.config.cjs"
echo "  7. Save PM2: pm2 save && pm2 startup"
echo ""
