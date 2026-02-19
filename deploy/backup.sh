#!/bin/bash
# White Label PBX - Automated Backup Script
# Backs up database and application state
# Add to crontab: 0 2 * * * /opt/white-label-pbx/deploy/backup.sh
#
# Usage: bash backup.sh

set -euo pipefail

BACKUP_DIR="/var/backups/pbx"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30
APP_DIR="/opt/white-label-pbx"

echo "=== PBX Backup - $DATE ==="

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Load environment variables
if [ -f "$APP_DIR/.env" ]; then
  export $(grep -v '^#' "$APP_DIR/.env" | xargs)
fi

# Backup database (MySQL)
if [ -n "${DATABASE_URL:-}" ]; then
  echo "[1/3] Backing up database..."

  # Parse DATABASE_URL: mysql://user:password@host:port/database
  DB_URL="$DATABASE_URL"

  # Extract components using parameter expansion
  DB_PROTO="${DB_URL%%://*}"
  DB_REST="${DB_URL#*://}"
  DB_USER="${DB_REST%%:*}"
  DB_REST="${DB_REST#*:}"
  DB_PASS="${DB_REST%%@*}"
  DB_REST="${DB_REST#*@}"
  DB_HOST="${DB_REST%%:*}"
  DB_REST="${DB_REST#*:}"
  DB_PORT="${DB_REST%%/*}"
  DB_NAME="${DB_REST#*/}"
  # Remove query params
  DB_NAME="${DB_NAME%%\?*}"

  if command -v mysqldump &> /dev/null; then
    mysqldump \
      --host="$DB_HOST" \
      --port="${DB_PORT:-3306}" \
      --user="$DB_USER" \
      --password="$DB_PASS" \
      --single-transaction \
      --routines \
      --triggers \
      "$DB_NAME" | gzip > "$BACKUP_DIR/db_${DATE}.sql.gz"
    echo "  Database backup saved: db_${DATE}.sql.gz"
  else
    echo "  Warning: mysqldump not found, skipping database backup"
  fi
else
  echo "[1/3] Skipping database backup (DATABASE_URL not set)"
fi

# Backup .env file
echo "[2/3] Backing up configuration..."
if [ -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env" "$BACKUP_DIR/env_${DATE}.bak"
  echo "  Config backup saved: env_${DATE}.bak"
fi

# Cleanup old backups
echo "[3/3] Cleaning old backups (>${RETENTION_DAYS} days)..."
find "$BACKUP_DIR" -type f -mtime +"$RETENTION_DAYS" -delete
BACKUP_COUNT=$(find "$BACKUP_DIR" -type f | wc -l)
echo "  $BACKUP_COUNT backup files remaining"

echo ""
echo "=== Backup complete ==="
echo "Location: $BACKUP_DIR"
ls -lh "$BACKUP_DIR"/*_${DATE}* 2>/dev/null || echo "No files created this run"
