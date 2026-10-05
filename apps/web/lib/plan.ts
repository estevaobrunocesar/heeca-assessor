// How a plan and a subscription are shown in the panel. Pure, so it can be tested alone.

export type SubscriptionView = {
  plan: string | null;
  status: string | null;
  periodEnd: string | null;
  trialEndsAt: string | null;
  usersUsed?: number;
  usersMax?: number | null;
};

const LABELS: Record<string, string> = { pessoal: "Pessoal", familia: "Família" };

/** The plans the portal sells, in order, with what the next step offers. */
const NEXT_STEP: Record<string, { label: string; offer: string }> = {
  pessoal: { label: "Família", offer: "até 5 usuários" },
};

/** "familia" -> "Família"; a plan the panel does not know is shown by its code, capitalized. */
export function planLabel(code: string | null): string {
  if (!code) return "—";
  return LABELS[code] ?? code.charAt(0).toUpperCase() + code.slice(1);
}

export function nextStep(code: string | null): { label: string; offer: string } | null {
  return code ? (NEXT_STEP[code] ?? null) : null;
}

export type Tone = "ok" | "warn" | "bad";

const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

/** The one-line state of the subscription and how worrying it is. */
export function statusInfo(s: Pick<SubscriptionView, "status" | "periodEnd" | "trialEndsAt">): { text: string; tone: Tone } {
  switch (s.status) {
    case "TRIALING":
      return { text: s.trialEndsAt ? `Teste até ${day(s.trialEndsAt)}` : "Período de teste", tone: "warn" };
    case "ACTIVE":
      return { text: s.periodEnd ? `Ativa · renova ${day(s.periodEnd)}` : "Ativa", tone: "ok" };
    case "PAST_DUE":
      return { text: "Pagamento em atraso", tone: "bad" };
    case "SUSPENDED":
      return { text: "Suspensa", tone: "bad" };
    case "CANCELED":
      return { text: s.periodEnd ? `Cancelada · até ${day(s.periodEnd)}` : "Cancelada", tone: "bad" };
    default:
      return { text: s.status ?? "—", tone: "warn" };
  }
}

/** Seats: "1 de 5 usuários", or null when the plan has no limit (nothing to show). */
export function seatsInfo(s: Pick<SubscriptionView, "usersUsed" | "usersMax">): { text: string; full: boolean; ratio: number } | null {
  if (s.usersMax == null || s.usersUsed == null) return null;
  return {
    text: `${s.usersUsed} de ${s.usersMax} ${s.usersMax === 1 ? "usuário" : "usuários"}`,
    full: s.usersUsed >= s.usersMax,
    ratio: Math.min(1, s.usersUsed / s.usersMax),
  };
}
