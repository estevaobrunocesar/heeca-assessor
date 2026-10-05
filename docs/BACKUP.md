# Backup do banco

O banco (Postgres) guarda os dados financeiros de todo mundo, então o backup também é sensível:
os arquivos ficam com permissão restrita (`700`/`600`) e **não devem ir para o Git** (`scratch_*.sql` e `backups/` já estão fora do repositório).

## Backup automático no servidor (já instalado)

Em produção (`heeca-prod`) o backup roda **todo dia às 03:15 UTC (00:15 em Brasília)** pelo cron:

| O quê | Onde |
|---|---|
| Script | `/usr/local/bin/heeca-assist-backup` (fonte: `scripts/server-backup.sh`) |
| Agendamento | `/etc/cron.d/heeca-assist-backup` |
| Backups | `/var/backups/heeca-assist/assist-AAAAMMDD-HHMMSS.sql.gz` (pasta 700, arquivos 600, só root) |
| Cópia mensal | `/var/backups/heeca-assist/mensal/` (dia 1, guardada por 6 meses) |
| Log | `/var/log/heeca-assist-backup.log` |

Guarda 14 dias de backups diários. Cada backup é conferido antes de ser aceito (gzip íntegro, tamanho, tabelas e histórico de
migrations). **Um backup que falha nunca apaga os antigos**: a limpeza só roda depois de um backup bom. O nome do container do banco
muda a cada deploy do Coolify, então o script o procura pelo prefixo.

Conferir se está em dia (sai com erro se o último backup tem mais de 26 h):

```bash
ssh heeca-prod heeca-assist-backup --check
```

Rodar agora: `ssh heeca-prod heeca-assist-backup`. Reinstalar ou atualizar o script: `bash scripts/server-backup.sh install`.

**Não há alerta automático de falha**: se o backup parar, ninguém é avisado. Rode o `--check` de vez em quando (ou agende-o
na sua máquina). **E os backups ficam no mesmo disco do banco**: não protegem contra perda do servidor. Copie-os para outro lugar:

```bash
scp heeca-prod:/var/backups/heeca-assist/assist-*.sql.gz ./backups-assist/
```

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

Para restaurar um backup do servidor, traga o arquivo (`scp`, acima) e use o `scripts/restore.sh` numa máquina com Docker. A restauração foi testada com o backup de produção: as 20 tabelas e uma impressão digital dos dados (valores, textos, ids, senhas em hash) saíram idênticas às do banco real.


```bash
scripts/restore.sh backups/assessor-20261004-031500.sql.gz assessor_restaurado
```

Cria um banco **novo** (nunca sobrescreve um existente) e carrega o backup nele. Confira as contagens
(`SELECT count(*) FROM "Transaction";` etc.) antes de usar. Para colocar o restaurado no ar, aponte a `DATABASE_URL` da API para
ele, ou renomeie os bancos pelo `psql` com a API parada.

Teste a restauração de tempos em tempos: um backup que nunca foi restaurado não é garantia.
