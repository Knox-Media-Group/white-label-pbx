#!/bin/bash
# White Label PBX - Server Setup Script
# Supports: Ubuntu/Debian, AlmaLinux/RHEL/CentOS/Rocky
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

# Detect OS
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS_ID="${ID,,}"
else
  OS_ID="unknown"
fi

case "$OS_ID" in
  ubuntu|debian|pop|linuxmint) PKG_FAMILY="deb" ;;
  almalinux|rocky|centos|rhel|ol|fedora) PKG_FAMILY="rpm" ;;
  *) echo "Warning: Unknown OS $OS_ID, trying rpm-based commands"; PKG_FAMILY="rpm" ;;
esac

echo "Detected: $OS_ID ($PKG_FAMILY)"

pkg_install() {
  if [ "$PKG_FAMILY" = "deb" ]; then
    apt-get install -y -qq "$@"
  else
    dnf install -y -q "$@" 2>/dev/null || yum install -y -q "$@"
  fi
}

# Update system
echo "[1/8] Updating system packages..."
if [ "$PKG_FAMILY" = "deb" ]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y -qq && apt-get upgrade -y -qq
else
  dnf update -y -q 2>/dev/null || yum update -y -q
fi

# Install dependencies
echo "[2/8] Installing dependencies..."
if [ "$PKG_FAMILY" = "deb" ]; then
  pkg_install curl git nginx certbot python3-certbot-nginx ufw fail2ban build-essential
else
  pkg_install epel-release 2>/dev/null || true
  pkg_install curl git nginx certbot python3-certbot-nginx fail2ban make gcc gcc-c++
  # SELinux: allow nginx to proxy
  if command -v setsebool &> /dev/null; then
    setsebool -P httpd_can_network_connect 1 2>/dev/null || true
  fi
fi

# Install Node.js 20
echo "[3/8] Installing Node.js 20..."
if ! command -v node &> /dev/null; then
  if [ "$PKG_FAMILY" = "deb" ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  else
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    dnf install -y nodejs 2>/dev/null || yum install -y nodejs
  fi
fi

# Install pnpm
echo "[4/8] Installing pnpm..."
corepack enable 2>/dev/null || npm install -g corepack
corepack prepare pnpm@10.4.1 --activate 2>/dev/null || true

# Install PM2
echo "[5/8] Installing PM2..."
npm install -g pm2

# Create app directory and log directory
echo "[6/8] Setting up directories..."
mkdir -p "$APP_DIR"
mkdir -p "$LOG_DIR"

# Configure firewall
echo "[7/8] Configuring firewall..."
if [ "$PKG_FAMILY" = "deb" ]; then
  ufw --force enable
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow ssh
  ufw allow http
  ufw allow https
else
  systemctl enable firewalld 2>/dev/null || true
  systemctl start firewalld 2>/dev/null || true
  firewall-cmd --permanent --add-service=ssh 2>/dev/null || true
  firewall-cmd --permanent --add-service=http 2>/dev/null || true
  firewall-cmd --permanent --add-service=https 2>/dev/null || true
  firewall-cmd --reload 2>/dev/null || true
fi

# Configure fail2ban
echo "[8/8] Configuring fail2ban..."
systemctl enable fail2ban 2>/dev/null || true
systemctl start fail2ban 2>/dev/null || true

echo ""
echo "=== Server setup complete! ==="
echo ""
echo "Next steps:"
echo "  1. Clone/copy your app to $APP_DIR"
echo "  2. Copy .env file to $APP_DIR/.env"
echo "  3. Run: cd $APP_DIR && pnpm install && pnpm run build"

if [ "$PKG_FAMILY" = "deb" ]; then
  echo "  4. Configure nginx:"
  echo "     cp $APP_DIR/deploy/nginx.conf /etc/nginx/sites-available/pbx"
  echo "     ln -s /etc/nginx/sites-available/pbx /etc/nginx/sites-enabled/"
  echo "     rm /etc/nginx/sites-enabled/default"
else
  echo "  4. Configure nginx:"
  echo "     cp $APP_DIR/deploy/nginx.conf /etc/nginx/conf.d/pbx.conf"
  echo "     rm -f /etc/nginx/conf.d/default.conf"
fi

echo "  5. Get SSL cert: certbot --nginx -d $DOMAIN"
echo "  6. Start app: cd $APP_DIR && pm2 start ecosystem.config.cjs"
echo "  7. Save PM2: pm2 save && pm2 startup"
echo ""
