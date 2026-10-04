#!/usr/bin/env bash
# Restores a backup into a NEW database, so you can check it (and copy what you need) without touching
# the live one. It refuses to overwrite an existing database.
#
#   scripts/restore.sh backups/assessor-20261004-031500.sql.gz assessor_restored
#
# To make the restored copy the live one, point DATABASE_URL at it (or swap the names in psql) after checking.
set -euo pipefail

FILE="${1:-}"
TARGET="${2:-}"
SERVICE="${DB_SERVICE:-db}"
DB_USER="${DB_USER:-assessor}"

if [ -z "$FILE" ] || [ -z "$TARGET" ]; then
  echo "Usage: $0 <backup.sql.gz> <new_database_name>" >&2
  exit 2
fi
[ -f "$FILE" ] || { echo "File not found: $FILE" >&2; exit 2; }
[[ "$TARGET" =~ ^[a-z_][a-z0-9_]*$ ]] || { echo "Database name must be lowercase letters, digits and underscores." >&2; exit 2; }
gzip -t "$FILE"

exists="$(docker compose exec -T "$SERVICE" psql -U "$DB_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$TARGET'" | tr -d '[:space:]')"
if [ "$exists" = "1" ]; then
  echo "Database '$TARGET' already exists. Choose another name (this script never overwrites)." >&2
  exit 1
fi

docker compose exec -T "$SERVICE" psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$TARGET\""
gunzip -c "$FILE" | docker compose exec -T "$SERVICE" psql -U "$DB_USER" -d "$TARGET" -v ON_ERROR_STOP=1 -q > /dev/null
echo "Restored $FILE into database '$TARGET'."
