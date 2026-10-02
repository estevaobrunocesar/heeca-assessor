export type Bank = { name: string; domain: string; color: string };

export const BANKS: Bank[] = [
  { name: "Nubank", domain: "nubank.com.br", color: "#8A05BE" },
  { name: "Itaú", domain: "itau.com.br", color: "#EC7000" },
  { name: "Bradesco", domain: "bradesco.com.br", color: "#CC092F" },
  { name: "Santander", domain: "santander.com.br", color: "#EC0000" },
  { name: "Banco do Brasil", domain: "bb.com.br", color: "#FEF200" },
  { name: "Caixa Econômica Federal", domain: "caixa.gov.br", color: "#0070AD" },
  { name: "Inter", domain: "bancointer.com.br", color: "#FF7A00" },
  { name: "C6 Bank", domain: "c6bank.com.br", color: "#242424" },
  { name: "BTG Pactual", domain: "btgpactual.com", color: "#003087" },
  { name: "Next", domain: "next.me", color: "#00FF5F" },
  { name: "PicPay", domain: "picpay.com", color: "#21C25E" },
  { name: "Banco Original", domain: "original.com.br", color: "#00AA4F" },
  { name: "Sicredi", domain: "sicredi.com.br", color: "#6AA42E" },
  { name: "Sicoob", domain: "sicoob.com.br", color: "#003641" },
  { name: "Safra", domain: "safra.com.br", color: "#003057" },
  { name: "XP Investimentos", domain: "xpi.com.br", color: "#1C1C1C" },
  { name: "Banco Pan", domain: "bancopan.com.br", color: "#FF5500" },
  { name: "Mercado Pago", domain: "mercadopago.com.br", color: "#00AAFF" },
  { name: "Will Bank", domain: "willbank.com.br", color: "#1C1C1C" },
  { name: "Neon", domain: "neon.com.br", color: "#00D7A3" },
  { name: "PagBank", domain: "pagbank.com.br", color: "#FFC700" },
  { name: "Outro", domain: "", color: "#6B7280" },
];

function normalize(text: string) {
  return text.trim().toLowerCase();
}

export function findBank(name: string | null): Bank | null {
  if (!name) return null;
  return BANKS.find((b) => normalize(b.name) === normalize(name)) ?? null;
}
