#!/bin/bash
# =============================================================
# White Label PBX - Full Production Deploy
# Server: 149.28.121.133 (kltconnect.com)
# Runtime: PM2
#
# Supports: Ubuntu/Debian, AlmaLinux/RHEL/CentOS/Rocky
#
# HOW TO RUN:
#   ssh root@149.28.121.133
#   bash /opt/white-label-pbx/deploy/full-deploy.sh
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

# ============ Detect OS family ============
detect_os() {
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS_ID="${ID,,}"
    OS_VERSION="${VERSION_ID}"
  elif [ -f /etc/redhat-release ]; then
    OS_ID="rhel"
    OS_VERSION=$(grep -oE '[0-9]+' /etc/redhat-release | head -1)
  else
    OS_ID="unknown"
    OS_VERSION="0"
  fi

  case "$OS_ID" in
    ubuntu|debian|pop|linuxmint)
      PKG_FAMILY="deb"
      ;;
    almalinux|rocky|centos|rhel|ol|fedora)
      PKG_FAMILY="rpm"
      ;;
    *)
      warn "Unknown OS: $OS_ID. Will attempt rpm-based commands."
      PKG_FAMILY="rpm"
      ;;
  esac

  log "Detected OS: $OS_ID $OS_VERSION (package family: $PKG_FAMILY)"
}

# ============ Package manager wrappers ============
pkg_update() {
  if [ "$PKG_FAMILY" = "deb" ]; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y -qq
    apt-get upgrade -y -qq
  else
    dnf update -y -q 2>/dev/null || yum update -y -q
  fi
}

pkg_install() {
  if [ "$PKG_FAMILY" = "deb" ]; then
    apt-get install -y -qq "$@"
  else
    dnf install -y -q "$@" 2>/dev/null || yum install -y -q "$@"
  fi
}

# ============ Install nginx (distro-specific) ============
install_nginx() {
  if command -v nginx &> /dev/null; then
    log "  nginx already installed"
    return
  fi

  if [ "$PKG_FAMILY" = "deb" ]; then
    pkg_install nginx
  else
    # EPEL + nginx module for RHEL family
    pkg_install epel-release 2>/dev/null || true
    dnf module enable nginx:mainline -y 2>/dev/null || true
    pkg_install nginx
  fi
}

# ============ Install certbot (distro-specific) ============
install_certbot() {
  if command -v certbot &> /dev/null; then
    log "  certbot already installed"
    return
  fi

  if [ "$PKG_FAMILY" = "deb" ]; then
    pkg_install certbot python3-certbot-nginx
  else
    pkg_install certbot python3-certbot-nginx 2>/dev/null || {
      # Fallback: install via pip
      pkg_install python3-pip
      pip3 install certbot certbot-nginx 2>/dev/null || true
    }
  fi
}

# ============ Install Node.js 20 (distro-specific) ============
install_node() {
  if command -v node &> /dev/null && [[ "$(node -v)" == v20* ]]; then
    log "  Node $(node -v) already installed"
    return
  fi

  if [ "$PKG_FAMILY" = "deb" ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
  else
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    dnf install -y -q nodejs 2>/dev/null || yum install -y -q nodejs
  fi
}

# ============ Configure firewall (distro-specific) ============
configure_firewall() {
  if [ "$PKG_FAMILY" = "deb" ]; then
    if command -v ufw &> /dev/null; then
      ufw --force enable
      ufw default deny incoming
      ufw default allow outgoing
      ufw allow ssh
      ufw allow http
      ufw allow https
    fi
  else
    # RHEL family uses firewalld
    if command -v firewall-cmd &> /dev/null; then
      systemctl enable firewalld 2>/dev/null || true
      systemctl start firewalld 2>/dev/null || true
      firewall-cmd --permanent --add-service=ssh 2>/dev/null || true
      firewall-cmd --permanent --add-service=http 2>/dev/null || true
      firewall-cmd --permanent --add-service=https 2>/dev/null || true
      firewall-cmd --reload 2>/dev/null || true
    else
      # No firewalld, try installing it
      pkg_install firewalld 2>/dev/null || true
      if command -v firewall-cmd &> /dev/null; then
        systemctl enable firewalld
        systemctl start firewalld
        firewall-cmd --permanent --add-service=ssh
        firewall-cmd --permanent --add-service=http
        firewall-cmd --permanent --add-service=https
        firewall-cmd --reload
      fi
    fi
  fi
}

# ============ Configure nginx paths (distro-specific) ============
# Debian: /etc/nginx/sites-available + sites-enabled
# RHEL:   /etc/nginx/conf.d/
get_nginx_conf_path() {
  if [ -d /etc/nginx/sites-available ]; then
    NGINX_STYLE="debian"
  else
    NGINX_STYLE="rhel"
  fi
}

install_nginx_config() {
  get_nginx_conf_path

  if [ "$NGINX_STYLE" = "debian" ]; then
    cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/pbx
    rm -f /etc/nginx/sites-enabled/default
    rm -f /etc/nginx/sites-enabled/pbx
    ln -sf /etc/nginx/sites-available/pbx /etc/nginx/sites-enabled/pbx
  else
    # RHEL style: drop config in conf.d
    cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/conf.d/pbx.conf
    # Remove default server block if it exists
    if [ -f /etc/nginx/nginx.conf ]; then
      # Comment out default server block in main config
      sed -i '/^\s*server\s*{/,/^\s*}/s/^/#/' /etc/nginx/conf.d/default.conf 2>/dev/null || true
      rm -f /etc/nginx/conf.d/default.conf 2>/dev/null || true
    fi
  fi
}

install_nginx_temp_config() {
  get_nginx_conf_path

  local TEMP_CONF
  TEMP_CONF=$(cat <<NGINX
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
)

  if [ "$NGINX_STYLE" = "debian" ]; then
    echo "$TEMP_CONF" > /etc/nginx/sites-available/pbx-temp
    rm -f /etc/nginx/sites-enabled/default
    rm -f /etc/nginx/sites-enabled/pbx
    rm -f /etc/nginx/sites-enabled/pbx-temp
    ln -sf /etc/nginx/sites-available/pbx-temp /etc/nginx/sites-enabled/pbx-temp
  else
    echo "$TEMP_CONF" > /etc/nginx/conf.d/pbx.conf
    rm -f /etc/nginx/conf.d/default.conf 2>/dev/null || true
  fi
}

switch_to_ssl_config() {
  get_nginx_conf_path

  if [ "$NGINX_STYLE" = "debian" ]; then
    rm -f /etc/nginx/sites-enabled/pbx-temp
    ln -sf /etc/nginx/sites-available/pbx /etc/nginx/sites-enabled/pbx
  else
    cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/conf.d/pbx.conf
  fi
}

# =============================================================
# MAIN DEPLOYMENT
# =============================================================

echo ""
echo "=================================================="
echo "  White Label PBX - Production Deployment"
echo "  Domain:  $DOMAIN"
echo "  Server:  $SERVER_IP"
echo "  Runtime: PM2"
echo "=================================================="
echo ""

detect_os

# ============ STEP 1: System packages ============
log "[1/10] Updating system packages..."
pkg_update

# ============ STEP 2: Install dependencies ============
log "[2/10] Installing system dependencies..."
pkg_install curl git make gcc gcc-c++ 2>/dev/null || pkg_install curl git build-essential

# ============ STEP 3: Install Node.js 20 ============
log "[3/10] Installing Node.js 20..."
install_node
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
install_nginx
install_certbot

# Start with temp HTTP-only config for certbot
install_nginx_temp_config
mkdir -p /var/www/certbot

# SELinux: allow nginx to proxy
if command -v setsebool &> /dev/null; then
  setsebool -P httpd_can_network_connect 1 2>/dev/null || true
fi

nginx -t && systemctl enable nginx && systemctl restart nginx

# ============ STEP 8: Firewall ============
log "[8/10] Configuring firewall..."
configure_firewall

# fail2ban
pkg_install fail2ban 2>/dev/null || true
systemctl enable fail2ban 2>/dev/null || true
systemctl start fail2ban 2>/dev/null || true

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

certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" \
  --non-interactive --agree-tos \
  --email "admin@$DOMAIN" \
  --redirect 2>/dev/null && {

  # SSL obtained - switch to full nginx config with SSL hardening
  switch_to_ssl_config
  nginx -t && systemctl reload nginx
  log "  SSL certificate installed!"

} || {
  warn "  SSL cert failed. Make sure DNS for $DOMAIN points to $SERVER_IP"
  warn "  You can retry later: certbot --nginx -d $DOMAIN -d www.$DOMAIN"
  warn "  App is running on HTTP for now."
}

# ============ Setup backup cron ============
log "Setting up automated backups..."
chmod +x "$APP_DIR/deploy/backup.sh"
(crontab -l 2>/dev/null; echo "0 2 * * * $APP_DIR/deploy/backup.sh >> /var/log/pbx/backup.log 2>&1") | sort -u | crontab -

# ============ Setup certbot auto-renewal ============
if [ "$PKG_FAMILY" = "rpm" ]; then
  # RHEL family: certbot doesn't always set up the timer
  (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --nginx >> /var/log/pbx/certbot.log 2>&1") | sort -u | crontab -
fi

# ============ DONE ============
echo ""
echo "=================================================="
echo -e "  ${GREEN}DEPLOYMENT COMPLETE${NC}"
echo "=================================================="
echo ""
echo "  OS:         $OS_ID $OS_VERSION ($PKG_FAMILY)"
echo "  Domain:     https://$DOMAIN"
echo "  Health:     https://$DOMAIN/api/health"
echo "  Admin:      https://$DOMAIN/admin"
echo "  Portal:     https://$DOMAIN/portal"
echo ""
echo "  PM2 Status: pm2 status"
echo "  PM2 Logs:   pm2 logs white-label-pbx"
echo "  Restart:    pm2 restart white-label-pbx"
echo "  Redeploy:   bash $APP_DIR/deploy/deploy.sh"
echo ""
echo "  Telnyx Webhooks:"
echo "    Voice:     https://$DOMAIN/api/webhooks/telnyx/voice"
echo "    Status:    https://$DOMAIN/api/webhooks/telnyx/status"
echo "    Recording: https://$DOMAIN/api/webhooks/telnyx/recording"
echo ""
echo "  Retell Webhooks:"
echo "    Call Status:    https://$DOMAIN/api/webhooks/retell/call-status"
echo "    Inbound Config: https://$DOMAIN/api/webhooks/retell/inbound-config"
echo ""
