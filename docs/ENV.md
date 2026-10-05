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
| `HEECA_PLATFORM_SECRET` | **segredo, gerado pela Heeca** | o mesmo cadastrado no portal (mín. 16 caracteres). Assina provision/entitlement e o token do SSO. Vazio = integração desligada |
| `HEECA_PORTAL_URL` | config | endereço do portal (ex.: `https://heeca.com.br`): links "Gerenciar assinatura" e "Entrar com conta Heeca" |
| `MIGRATE_ON_START` | config | `true` (padrão) aplica as migrations ao subir; `false` pula |
| `WHATSAPP_OUTBOUND` | só desenvolvimento | `log` imprime em vez de enviar. **Nunca em produção** |

## Web (`apps/web`)

| Variável | Tipo | Observação |
|---|---|---|
| `API_URL` | config | endereço da API (padrão `http://localhost:3001`) |
| `HEECA_PORTAL_URL` | config | o mesmo do portal acima (botão "Entrar com conta Heeca" no login) |

## Verificação de saúde

- API: `GET /api/health` responde 200 com `{"ok":true,"db":true}` só quando o banco responde; 503 caso contrário. `GET /health` continua existindo e não consulta o banco.
- Web: `GET /api/health` responde 200 (público, sem sessão).

## Integração com o portal Heeca

Contrato: `heeca_site/docs/ENTITLEMENT.md` (repositório da plataforma). Slug do produto: `assist`.

- `POST /api/heeca/provision` e `POST /api/heeca/entitlement` (API): HMAC-SHA256 de `${timestamp}.${corpo}` com `HEECA_PLATFORM_SECRET`, janela de 5 minutos, comparação em tempo constante. O tenant é o `Workspace`; o `tenantId` devolvido é o id dele.
- `GET /sso/heeca?token=&next=` (web): JWT HS256, `iss=heeca-portal`, `aud=assist`, 60 s, uso único. Cria a sessão local; `next` só aceita caminho do próprio site. O SSO não pede o segundo fator do MFA: quem autentica é o portal.
- Acesso `blocked` bloqueia a API (403 `access_blocked`, exceto `GET /api/auth/me`) e o WhatsApp (resposta curta). `warning` mostra uma faixa no painel. O produto nunca cobra nem suspende sozinho.
- Limite de usuários por plano: `plan.limits.maxUsers`; sem ele, `pessoal` = 1 e `familia` = 5.
