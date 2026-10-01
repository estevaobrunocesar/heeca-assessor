# Meu Assessor Financeiro

Assistente financeiro pessoal via WhatsApp. Arquitetura:

```
WhatsApp (Twilio) → Gateway → IA (OpenAI) → Motor Financeiro → Postgres → Dashboard (Next.js)
```

- `apps/api` — backend Express/TypeScript: webhook do WhatsApp, interpretação via IA, motor financeiro, API do dashboard.
- `apps/web` — dashboard Next.js (somente leitura no MVP).

## Rodando localmente

1. Copie `.env.example` para `.env` e preencha `OPENAI_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`.
2. Suba o Postgres: `docker compose up -d db`
3. `cd apps/api && npm install && npx prisma migrate dev && npm run prisma:generate`
4. Rode o seed de categorias: `npx tsx prisma/seed.ts`
5. Cadastre seu usuário (obrigatório — números não cadastrados são rejeitados):
   `npx tsx scripts/create-user.ts "Bruno" "+5511999998888" ADMIN`
6. `npm run dev` (API em `:3001`)
7. Em outro terminal: `cd apps/web && npm install && npm run dev` (dashboard em `:3000`)

## Expondo o webhook para o Twilio

Em dev, use um túnel (ex: `ngrok http 3001`) e configure a URL
`https://<seu-tunnel>/webhook/whatsapp` no sandbox do WhatsApp da Twilio.

## Status

MVP (Fase 1 do briefing): texto, áudio, identificação por número, IA de
interpretação, receitas/despesas, categorias, correções básicas por
WhatsApp, consulta de saldo mensal, dashboard somente leitura.

Pendente de decisão de produto: política de confiança para auto-confirmar
um lançamento vs. pedir esclarecimento — ver TODO em
`apps/api/src/financial/confidence.ts`.

Fases 2 e 3 (parcelamentos, recorrências, orçamentos, alertas, Open
Finance) ainda não implementadas.
