#!/usr/bin/env bash
# Backup diário do banco do Heeca Assist, para rodar NO servidor (heeca-prod) pelo cron.
#
#   instalar (da sua máquina):  bash scripts/server-backup.sh install
#   rodar agora (no servidor):  heeca-assist-backup
#   conferir se está em dia:    heeca-assist-backup --check      (sai com erro se o último backup tem mais de 26 h)
#
# O que faz: descobre o container do banco (o nome muda a cada deploy do Coolify), gera um dump comprimido,
# confere se ele é de verdade (gzip íntegro, tamanho, tabelas e histórico de migrations) e só então o guarda.
# Um backup que falha nunca apaga os antigos: a limpeza só roda depois de um backup bom.
#
# Variáveis (todas opcionais):
#   BACKUP_DIR   onde guardar                    (padrão /var/backups/heeca-assist)
#   KEEP_DAYS    dias de backups diários         (padrão 14)
#   KEEP_MONTHS  meses de backups do dia 1       (padrão 6)
#   DB_PREFIX    prefixo do container do banco   (padrão db-tdwnmpf2rpon7kaz5yfdss7y, o app do Assist no Coolify)
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/heeca-assist}"
KEEP_DAYS="${KEEP_DAYS:-14}"
KEEP_MONTHS="${KEEP_MONTHS:-6}"
DB_PREFIX="${DB_PREFIX:-db-tdwnmpf2rpon7kaz5yfdss7y}"
MAX_AGE_HOURS=26

log() { echo "[$(date -Is)] $*"; }

if [ "${1:-}" = "install" ]; then
  # Copia este script para o servidor e cria o agendamento (03:15 UTC = 00:15 em Brasília), no mesmo padrão
  # das rotinas heeca-disk-watchdog e heeca-docker-prune.
  ssh heeca-prod 'cat > /usr/local/bin/heeca-assist-backup && chmod 755 /usr/local/bin/heeca-assist-backup \
    && printf "%s\n" "SHELL=/bin/bash" "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
       "15 3 * * * root flock -n /var/lock/heeca-assist-backup.lock /usr/local/bin/heeca-assist-backup >> /var/log/heeca-assist-backup.log 2>&1" \
       > /etc/cron.d/heeca-assist-backup && chmod 644 /etc/cron.d/heeca-assist-backup && echo instalado' < "$0"
  exit 0
fi

if [ "${1:-}" = "--check" ]; then
  last="$(find "$BACKUP_DIR" -maxdepth 1 -name 'assist-*.sql.gz' -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 || true)"
  if [ -z "$last" ]; then echo "ERRO: nenhum backup em $BACKUP_DIR"; exit 1; fi
  age_h=$(( ( $(date +%s) - ${last%%.*} ) / 3600 ))
  file="${last#* }"
  if [ "$age_h" -gt "$MAX_AGE_HOURS" ]; then echo "ERRO: o último backup tem ${age_h} h ($file)"; exit 1; fi
  echo "OK: último backup há ${age_h} h — $file ($(du -h "$file" | cut -f1))"
  exit 0
fi

# --- 1. achar o container do banco (só os que estão rodando; se houver dois, no meio de um deploy, o mais novo)
container="$(docker ps --filter "name=^${DB_PREFIX}" --format '{{.CreatedAt}}|{{.Names}}' | sort -r | head -1 | cut -d'|' -f2)"
if [ -z "$container" ]; then
  log "ERRO: nenhum container de banco rodando com o prefixo '${DB_PREFIX}'. Nada foi feito."
  exit 1
fi
db_user="$(docker exec "$container" printenv POSTGRES_USER)"
db_name="$(docker exec "$container" printenv POSTGRES_DB)"

# --- 2. gerar o dump num arquivo .partial: uma falha nunca deixa algo que pareça um backup bom
umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
stamp="$(date -u +%Y%m%d-%H%M%S)"
final="$BACKUP_DIR/assist-$stamp.sql.gz"
partial="$final.partial"
trap 'rm -f "$partial"' EXIT

docker exec "$container" pg_dump -U "$db_user" -d "$db_name" --no-owner --no-privileges | gzip -9 > "$partial"

# --- 3. conferir que o dump é de verdade
gzip -t "$partial" || { log "ERRO: o arquivo gerado está corrompido."; exit 1; }
size="$(wc -c < "$partial")"
if [ "$size" -lt 2048 ]; then log "ERRO: dump pequeno demais (${size} bytes)."; exit 1; fi
tables="$(gunzip -c "$partial" | grep -c '^CREATE TABLE' || true)"
if [ "$tables" -lt 10 ]; then log "ERRO: o dump tem só ${tables} tabelas, esperado 10 ou mais."; exit 1; fi
# grep -c (não -q): com pipefail, um grep que sai cedo mataria o gunzip por SIGPIPE e reprovaria um dump bom.
migrations="$(gunzip -c "$partial" | grep -c '_prisma_migrations' || true)"
if [ "$migrations" -lt 1 ]; then log "ERRO: o dump não tem o histórico de migrations."; exit 1; fi

mv "$partial" "$final"
trap - EXIT
chmod 600 "$final"

# --- 4. cópia mensal (dia 1) e limpeza, só depois de um backup bom
if [ "$(date -u +%d)" = "01" ]; then
  mkdir -p "$BACKUP_DIR/mensal"
  cp -p "$final" "$BACKUP_DIR/mensal/"
fi
find "$BACKUP_DIR" -maxdepth 1 -name 'assist-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
[ -d "$BACKUP_DIR/mensal" ] && find "$BACKUP_DIR/mensal" -name 'assist-*.sql.gz' -mtime +$(( KEEP_MONTHS * 31 )) -delete
date -u +%FT%TZ > "$BACKUP_DIR/ULTIMO_OK"

count="$(find "$BACKUP_DIR" -maxdepth 1 -name 'assist-*.sql.gz' | wc -l)"
log "OK: $final ($(du -h "$final" | cut -f1), ${tables} tabelas, container ${container}); ${count} backup(s) diário(s) guardado(s), $(df -h "$BACKUP_DIR" | awk 'NR==2{print $4}') livres no disco."
