#!/usr/bin/env bash
# Daily Postgres backup. Run it on the server that hosts the stack, from the project folder
# (where docker-compose.yml is), e.g. from cron:  15 3 * * * /srv/heeca/scripts/backup.sh
#
#   BACKUP_DIR        where the files go          (default: ./backups)
#   BACKUP_KEEP_DAYS  how long to keep them       (default: 14)
#   DB_SERVICE        compose service of the DB   (default: db)
#   DB_USER / DB_NAME                             (default: assessor / assessor)
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
SERVICE="${DB_SERVICE:-db}"
DB_USER="${DB_USER:-assessor}"
DB_NAME="${DB_NAME:-assessor}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"   # the dump holds everyone's financial data
stamp="$(date +%Y%m%d-%H%M%S)"
file="$BACKUP_DIR/assessor-$stamp.sql.gz"
tmp="$file.partial"

# Written to a .partial file first, so a failed run never leaves something that looks like a good backup.
docker compose exec -T "$SERVICE" pg_dump -U "$DB_USER" --no-owner --no-privileges "$DB_NAME" | gzip -9 > "$tmp"

# A dump that is nearly empty or not valid gzip means something went wrong.
gzip -t "$tmp"
if [ "$(wc -c < "$tmp")" -lt 1024 ]; then
  rm -f "$tmp"
  echo "Backup failed: the dump is suspiciously small." >&2
  exit 1
fi
mv "$tmp" "$file"
chmod 600 "$file"

# Retention: remove only our own old files.
find "$BACKUP_DIR" -maxdepth 1 -name 'assessor-*.sql.gz' -mtime +"$KEEP_DAYS" -delete

echo "Backup written: $file ($(du -h "$file" | cut -f1)), keeping the last $KEEP_DAYS days."
