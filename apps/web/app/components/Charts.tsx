"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from "recharts";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function formatMonth(yyyyMM: string) {
  const [year, month] = yyyyMM.split("-");
  return `${MONTHS_PT[Number(month) - 1]}/${year.slice(2)}`;
}

/** Reads the current theme's CSS custom properties so charts stay in sync with the toggle. */
function useThemeColors() {
  const [colors, setColors] = useState({
    ink: "#12161f",
    muted: "#5b6472",
    azul: "#1d4ed8",
    vermelho: "#b3261e",
    ouro: "#9c6b1f",
    linha: "#dadfe8",
    paperRaised: "#ffffff",
  });

  useEffect(() => {
    const read = () => {
      const style = getComputedStyle(document.documentElement);
      const v = (name: string) => style.getPropertyValue(name).trim();
      setColors({
        ink: v("--ink"),
        muted: v("--muted"),
        azul: v("--azul"),
        vermelho: v("--vermelho"),
        ouro: v("--ouro"),
        linha: v("--linha"),
        paperRaised: v("--paper-raised"),
      });
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return colors;
}

export function TrendChart({ data }: { data: { month: string; income: number; expense: number }[] }) {
  const c = useThemeColors();

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="2 4" stroke={c.linha} vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={formatMonth}
          stroke={c.muted}
          fontSize={11}
          fontFamily="var(--font-mono)"
          tickLine={false}
          axisLine={{ stroke: c.linha }}
        />
        <YAxis
          stroke={c.muted}
          fontSize={11}
          fontFamily="var(--font-mono)"
          tickFormatter={(v) => formatBRL(v)}
          width={88}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          formatter={(value) => formatBRL(Number(value))}
          labelFormatter={(label) => formatMonth(String(label))}
          contentStyle={{ background: c.paperRaised, border: `1px solid ${c.linha}`, borderRadius: 8, fontSize: 13 }}
        />
        <Line type="monotone" dataKey="income" name="Receitas" stroke={c.azul} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="expense" name="Despesas" stroke={c.vermelho} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CategoryPieChart({ data }: { data: { name: string; total: number }[] }) {
  const c = useThemeColors();
  const palette = [c.azul, c.ouro, c.vermelho, c.muted, "#7c9fd9", "#c98f3c", "#d98f87", "#9aa5b4"];

  if (data.length === 0) {
    return <p style={{ color: c.muted, fontSize: 14 }}>Sem despesas este mês.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data} dataKey="total" nameKey="name" innerRadius={58} outerRadius={96} paddingAngle={2} stroke={c.paperRaised} strokeWidth={2}>
          {data.map((_, i) => (
            <Cell key={i} fill={palette[i % palette.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => formatBRL(Number(value))}
          contentStyle={{ background: c.paperRaised, border: `1px solid ${c.linha}`, borderRadius: 8, fontSize: 13 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
