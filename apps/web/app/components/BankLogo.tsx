"use client";

import { useState } from "react";
import { Landmark } from "lucide-react";
import { findBank } from "../../lib/banks";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || name.slice(0, 2).toUpperCase();
}

export function BankLogo({ bankName, size = 38 }: { bankName: string | null; size?: number }) {
  const bank = findBank(bankName);
  const [failed, setFailed] = useState(false);

  const showFallback = !bank || !bank.domain || failed;
  const color = bank?.color ?? "#6B7280";

  if (showFallback) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.24,
          background: color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          color: "#fff",
          fontWeight: 700,
          fontSize: size * 0.34,
        }}
      >
        {bankName ? initials(bankName) : <Landmark size={size * 0.5} />}
      </div>
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.24,
        background: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        overflow: "hidden",
        border: "1px solid var(--card-border)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://www.google.com/s2/favicons?domain=${bank.domain}&sz=128`}
        alt={bank.name}
        width={size * 0.6}
        height={size * 0.6}
        style={{ objectFit: "contain" }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
