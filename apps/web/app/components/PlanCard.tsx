"use client";

import { Gem } from "lucide-react";
import { nextStep, planLabel, seatsInfo, statusInfo, type Tone } from "../../lib/plan";
import type { Subscription } from "./SubscriptionNotice";

const TONE_COLOR: Record<Tone, string> = { ok: "var(--green)", warn: "var(--amber)", bad: "var(--red)" };

/**
 * The plan card at the foot of the sidebar: plan name, state, seats used, the next step and the way to the
 * account page in the Heeca portal (which owns billing). Only for accounts managed by the portal; an account
 * created directly has no plan to show.
 */
export function PlanCard({ subscription, collapsed }: { subscription: Subscription | null; collapsed: boolean }) {
  if (!subscription?.managed) return null;

  const status = statusInfo(subscription);
  const seats = seatsInfo(subscription);
  const next = nextStep(subscription.plan);
  const color = TONE_COLOR[status.tone];
  const name = planLabel(subscription.plan);

  // The call to action follows what needs doing: fix the payment, make room for more people, or just manage.
  const action = status.tone === "bad" ? "Regularizar" : seats?.full && next ? `Mudar para ${next.label}` : "Gerenciar plano";

  if (collapsed) {
    return (
      <a
        href={subscription.accountUrl}
        title={`Plano ${name} · ${status.text}`}
        aria-label={`Plano ${name}: ${status.text}. Abrir a conta Heeca`}
        style={{ position: "relative", display: "flex", justifyContent: "center", padding: "10px 0", borderRadius: 10, color: "var(--sidebar-muted)" }}
      >
        <Gem size={18} />
        <span style={{ position: "absolute", top: 8, right: 18, width: 8, height: 8, borderRadius: "50%", background: color }} />
      </a>
    );
  }

  return (
    <div
      style={{
        padding: 14,
        borderRadius: 12,
        background: "rgba(255, 255, 255, 0.05)",
        border: "1px solid rgba(255, 255, 255, 0.09)",
        color: "var(--sidebar-ink)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Gem size={15} color="var(--primary)" />
        <span style={{ fontSize: 11, color: "var(--sidebar-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Seu plano</span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>{name}</div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 12, color: "var(--sidebar-muted)" }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
        <span>{status.text}</span>
      </div>

      {seats && (
        <div className="plan-extra" style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: "var(--sidebar-muted)" }}>Usuários</span>
            <span style={{ color: seats.full ? "var(--amber)" : undefined, fontWeight: 600 }}>{seats.text.replace(/ (usuários?)$/, "")}</span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: "rgba(255, 255, 255, 0.1)", marginTop: 5 }} role="progressbar" aria-valuenow={Math.round(seats.ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ width: `${seats.ratio * 100}%`, height: "100%", borderRadius: 3, background: seats.full ? "var(--amber)" : "var(--primary)" }} />
          </div>
        </div>
      )}

      {next && (
        <p className="plan-extra" style={{ fontSize: 11.5, color: "var(--sidebar-muted)", marginTop: 12, lineHeight: 1.4 }}>
          Próximo plano: <strong style={{ color: "var(--sidebar-ink)" }}>{next.label}</strong> ({next.offer})
        </p>
      )}

      <a
        href={subscription.accountUrl}
        style={{
          display: "block",
          marginTop: 12,
          padding: "8px 10px",
          borderRadius: 9,
          textAlign: "center",
          fontSize: 12.5,
          fontWeight: 600,
          textDecoration: "none",
          color: "#fff",
          background: status.tone === "bad" || (seats?.full && next) ? "var(--primary)" : "rgba(255, 255, 255, 0.1)",
        }}
      >
        {action}
      </a>
    </div>
  );
}
