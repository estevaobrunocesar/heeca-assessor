"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid, Legend } from "recharts";

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
    ink: "#111113",
    muted: "#6b7280",
    green: "#16a34a",
    red: "#dc2626",
    blue: "#2563eb",
    amber: "#d97706",
    border: "#e5e7eb",
    card: "#ffffff",
  });

  useEffect(() => {
    const read = () => {
      const style = getComputedStyle(document.documentElement);
      const v = (name: string) => style.getPropertyValue(name).trim();
      setColors({
        ink: v("--ink"),
        muted: v("--muted"),
        green: v("--green"),
        red: v("--red"),
        blue: v("--blue"),
        amber: v("--amber"),
        border: v("--card-border"),
        card: v("--card"),
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
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} barGap={4}>
        <CartesianGrid strokeDasharray="2 4" stroke={c.border} vertical={false} />
        <XAxis dataKey="month" tickFormatter={formatMonth} stroke={c.muted} fontSize={11} tickLine={false} axisLine={{ stroke: c.border }} />
        <YAxis stroke={c.muted} fontSize={11} tickFormatter={(v) => formatBRL(v)} width={78} tickLine={false} axisLine={false} />
        <Tooltip
          formatter={(value) => formatBRL(Number(value))}
          labelFormatter={(label) => formatMonth(String(label))}
          contentStyle={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 8, fontSize: 13 }}
        />
        <Legend
          formatter={(value) => <span style={{ color: c.ink, fontSize: 12 }}>{value}</span>}
          iconType="circle"
          iconSize={8}
        />
        <Bar dataKey="income" name="Receitas" fill={c.green} radius={[4, 4, 0, 0]} />
        <Bar dataKey="expense" name="Despesas" fill={c.red} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CategoryPieChart({ data }: { data: { name: string; total: number }[] }) {
  const c = useThemeColors();
  const palette = [c.red, c.green, c.blue, c.amber, "#8b5cf6", "#ec4899", "#14b8a6", c.muted];

  if (data.length === 0) {
    return <p style={{ color: c.muted, fontSize: 14 }}>Sem despesas este mês.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="total" nameKey="name" innerRadius={62} outerRadius={100} paddingAngle={2} stroke={c.card} strokeWidth={2}>
          {data.map((_, i) => (
            <Cell key={i} fill={palette[i % palette.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => formatBRL(Number(value))}
          contentStyle={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 8, fontSize: 13 }}
        />
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          formatter={(value) => <span style={{ color: c.ink, fontSize: 12 }}>{value}</span>}
          iconType="circle"
          iconSize={8}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
