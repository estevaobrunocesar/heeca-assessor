# Variáveis de ambiente do Heeca Assist

Nenhum valor real vai para o Git: o `.env` está no `.gitignore` e as chaves ficam só no Coolify.

## API (`apps/api`)

| Variável | Tipo | Observação |
|---|---|---|
| `DATABASE_URL` | segredo (gerada pela Heeca) | `postgresql://usuario:senha@host:5432/banco` |
| `JWT_SECRET` | **segredo, gerada pela Heeca** | assina as sessões. Trocar desloga todo mundo |
| `MFA_ENCRYPTION_KEY` | **segredo, gerada pela Heeca** | criptografa o segredo do MFA. **Defina e nunca troque**: trocar inutiliza o MFA de todos. Sem ela, o código usa a `JWT_SECRET` |
| `OPENAI_API_KEY` | segredo, credencial própria | interpretação das mensagens, áudio e fotos |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | segredo, credencial própria | WhatsApp e validação das assinaturas do webhook |
| `TWILIO_WHATSAPP_NUMBER` | config | `whatsapp:+55...` |
| `TWILIO_SUMMARY_TEMPLATE_SID` | config, opcional | template aprovado do resumo semanal (fora da janela de 24 h) |
| `RESEND_API_KEY` | segredo, credencial própria | e-mails (senha, relatórios, alertas) |
| `RESEND_FROM_EMAIL` | config | ex.: `Heeca Assist <naoresponda@heeca.com.br>` |
| `WEB_URL` | config | endereço público do painel (links nos e-mails) |
| `PUBLIC_API_URL` | config | endereço público da API: callbacks de entrega do WhatsApp e links de relatório |
| `PORT` | config | padrão 3001 |
| `MIGRATE_ON_START` | config | `true` (padrão) aplica as migrations ao subir; `false` pula |
| `WHATSAPP_OUTBOUND` | só desenvolvimento | `log` imprime em vez de enviar. **Nunca em produção** |

## Web (`apps/web`)

| Variável | Tipo | Observação |
|---|---|---|
| `API_URL` | config | endereço da API (padrão `http://localhost:3001`) |

## Verificação de saúde

- API: `GET /api/health` responde 200 com `{"ok":true,"db":true}` só quando o banco responde; 503 caso contrário. `GET /health` continua existindo e não consulta o banco.
- Web: `GET /api/health` responde 200 (público, sem sessão).
