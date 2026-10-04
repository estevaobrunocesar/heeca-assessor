# Backup do banco

O banco (Postgres) guarda os dados financeiros de todo mundo, então o backup também é sensível:
os arquivos ficam com permissão restrita (`700`/`600`) e **não devem ir para o Git** (`scratch_*.sql` e `backups/` já estão fora do repositório).

## Fazer um backup

Na máquina que roda a stack, dentro da pasta do projeto (onde fica o `docker-compose.yml`):

```bash
scripts/backup.sh
```

Gera `backups/assessor-AAAAMMDD-HHMMSS.sql.gz`, confere se o arquivo é válido e apaga os com mais de 14 dias.
Variáveis opcionais: `BACKUP_DIR`, `BACKUP_KEEP_DAYS`, `DB_SERVICE`, `DB_USER`, `DB_NAME`.

## Agendar (todo dia às 03:15)

```cron
15 3 * * * cd /caminho/do/projeto && BACKUP_DIR=/var/backups/heeca scripts/backup.sh >> /var/log/heeca-backup.log 2>&1
```

No Coolify, o mesmo comando pode ser cadastrado como *Scheduled Task* do serviço. **Isso precisa ser configurado no servidor;
o código do aplicativo não agenda o backup sozinho.**

## Guardar uma cópia fora do servidor

Um backup que mora no mesmo disco do banco não protege contra perda do servidor. Copie `BACKUP_DIR` periodicamente para outro
lugar (outro servidor via `rsync`/`scp`, ou um bucket S3 compatível), de preferência criptografado.

## Restaurar (e conferir)

```bash
scripts/restore.sh backups/assessor-20261004-031500.sql.gz assessor_restaurado
```

Cria um banco **novo** (nunca sobrescreve um existente) e carrega o backup nele. Confira as contagens
(`SELECT count(*) FROM "Transaction";` etc.) antes de usar. Para colocar o restaurado no ar, aponte a `DATABASE_URL` da API para
ele, ou renomeie os bancos pelo `psql` com a API parada.

Teste a restauração de tempos em tempos: um backup que nunca foi restaurado não é garantia.
