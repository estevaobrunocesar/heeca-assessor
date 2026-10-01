# Meu Assessor Financeiro (Heeca Assessor)

Assistente financeiro pessoal via WhatsApp, multi-tenant. Arquitetura:

```
WhatsApp (Twilio) → Gateway → IA (OpenAI) → Motor Financeiro → Postgres → Dashboard (Next.js)
```

- `apps/api` — backend Express/TypeScript: webhook do WhatsApp, interpretação via IA, motor financeiro, API do dashboard.
- `apps/web` — dashboard Next.js (sidebar, gráficos, contas, categorias, usuários).

Cada **Workspace** é um tenant totalmente isolado: contas bancárias, categorias e lançamentos nunca são
compartilhados entre workspaces. Um workspace pode ter um ou mais usuários (ex: uma família), mas dois
workspaces diferentes (ex: dois clientes distintos) nunca veem dados um do outro.

## Rodando localmente

1. Copie `.env.example` para `.env` e preencha `OPENAI_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `JWT_SECRET`.
2. Suba o Postgres: `docker compose up -d db`
3. `cd apps/api && npm install && npx prisma migrate dev && npm run prisma:generate`
4. Crie um workspace novo com seu usuário admin (isso já semeia as categorias padrão):
   `npx tsx scripts/create-workspace.ts "Meu Workspace" "Bruno" "+5511999998888" "senha"`
5. `npm run dev` (API em `:3001`)
6. Em outro terminal: `cd apps/web && npm install && npm run dev` (dashboard em `:3000`)

Para adicionar mais um usuário a um workspace **existente** (ex: cônjuge no mesmo workspace):
```bash
npx tsx scripts/create-user.ts "Nome" "+55..." USER "senha" "+55<telefone-de-alguem-do-mesmo-workspace>"
```

## Expondo o webhook para o Twilio

Em dev, use um túnel (ex: `ngrok http 3001`) e configure a URL
`https://<seu-tunnel>/webhook/whatsapp` no sandbox do WhatsApp da Twilio.

## Status

MVP (Fase 1 do briefing): texto, áudio, identificação por número, IA de
interpretação, receitas/despesas, categorias, correções básicas por
WhatsApp, consulta de saldo mensal, dashboard com login, gráficos, contas
bancárias (saldo calculado + ajuste manual) e administração de
usuários/categorias — tudo isolado por workspace.

Pendente de decisão de produto: política de confiança para auto-confirmar
um lançamento vs. pedir esclarecimento — ver TODO em
`apps/api/src/financial/confidence.ts`.

Fases 2 e 3 (parcelamentos, recorrências, orçamentos, alertas, Open
Finance) ainda não implementadas — telas "Relatórios" e "Planejamento" no
menu são placeholders.
