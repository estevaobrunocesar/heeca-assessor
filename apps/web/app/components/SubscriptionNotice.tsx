"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { TriangleAlert, Lock } from "lucide-react";

export type Subscription = {
  managed: boolean;
  plan: string | null;
  status: string | null;
  blocked: boolean;
  warning: boolean;
  periodEnd: string | null;
  trialEndsAt: string | null;
  usersUsed?: number;
  usersMax?: number | null;
  accountUrl: string;
};

const STATUS_PT: Record<string, string> = { TRIALING: "Período de teste", ACTIVE: "Ativa", PAST_DUE: "Pagamento em atraso", SUSPENDED: "Suspensa", CANCELED: "Cancelada" };

/** The subscription state kept by the Heeca portal, or null while loading / when there is no session. */
export function useSubscription(): Subscription | null {
  const pathname = usePathname();
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => setSubscription(me?.subscription ?? null))
      .catch(() => setSubscription(null));
  }, [pathname]);

  return subscription;
}

/** A strip above the page when the portal flagged the account as at risk (payment late, trial ending...). */
export function WarningStrip({ subscription }: { subscription: Subscription | null }) {
  if (!subscription?.warning || subscription.blocked) return null;
  return (
    <div role="status" style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 28px", background: "var(--amber-soft)", color: "var(--amber)", fontSize: 13 }}>
      <TriangleAlert size={16} />
      <span>
        Sua assinatura precisa de atenção. <a href={subscription.accountUrl} style={{ color: "inherit", fontWeight: 600 }}>Ver minha conta Heeca</a>
      </span>
    </div>
  );
}

/** Replaces the page when the portal blocked the account: nothing else works until it is settled there. */
export function BlockedScreen({ subscription }: { subscription: Subscription }) {
  return (
    <main style={{ padding: "64px 28px", maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
      <Lock size={40} color="var(--red)" />
      <h1 style={{ fontSize: 22, marginTop: 16 }}>Acesso suspenso</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 8 }}>
        O acesso ao Heeca Assist está bloqueado no momento
        {subscription.status ? ` (assinatura: ${(STATUS_PT[subscription.status] ?? subscription.status).toLowerCase()})` : ""}. Seus dados continuam guardados. Regularize a assinatura na sua conta Heeca para voltar a usar.
      </p>
      <a href={subscription.accountUrl} className="btn btn-primary" style={{ marginTop: 20, textDecoration: "none" }}>
        Ir para minha conta Heeca
      </a>
    </main>
  );
}


/** Plan and status as the portal reports them, with the way to the page where they are changed. */
export function SubscriptionCard() {
  const subscription = useSubscription();
  if (!subscription?.managed) return null;
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : null);
  const until = date(subscription.status === "TRIALING" ? subscription.trialEndsAt : subscription.periodEnd);

  return (
    <div className="card" style={{ padding: 18, marginTop: 24, maxWidth: 560 }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>Assinatura</div>
      <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>
        Plano <strong style={{ color: "var(--ink)" }}>{subscription.plan}</strong> · {STATUS_PT[subscription.status ?? ""] ?? subscription.status}
        {until ? ` · até ${until}` : ""}. Plano, pagamento e cancelamento são gerenciados na sua conta Heeca.
      </p>
      <a href={subscription.accountUrl} className="btn btn-ghost" style={{ marginTop: 10, textDecoration: "none" }}>
        Gerenciar na conta Heeca
      </a>
    </div>
  );
}
