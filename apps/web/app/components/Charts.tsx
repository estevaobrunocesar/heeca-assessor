"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from "recharts";

const COLORS = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function TrendChart({ data }: { data: { month: string; income: number; expense: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2d34" />
        <XAxis dataKey="month" stroke="#999" fontSize={12} />
        <YAxis stroke="#999" fontSize={12} tickFormatter={(v) => formatBRL(v)} width={90} />
        <Tooltip
          formatter={(value) => formatBRL(Number(value))}
          contentStyle={{ background: "#1a1d24", border: "1px solid #2a2d34", borderRadius: 8 }}
        />
        <Line type="monotone" dataKey="income" name="Receitas" stroke="#10b981" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="expense" name="Despesas" stroke="#ef4444" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CategoryPieChart({ data }: { data: { name: string; total: number }[] }) {
  if (data.length === 0) {
    return <p style={{ color: "#999", fontSize: 14 }}>Sem despesas este mês.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="total" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => formatBRL(Number(value))}
          contentStyle={{ background: "#1a1d24", border: "1px solid #2a2d34", borderRadius: 8 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
