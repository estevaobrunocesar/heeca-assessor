"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL, formatMonth, useThemeColors } from "./Charts";

type Month = { month: string; income: number; expense: number; result: number };

const axis = (c: ReturnType<typeof useThemeColors>) => ({
  stroke: c.muted,
  fontSize: 11,
  tickLine: false as const,
});

const tooltipStyle = (c: ReturnType<typeof useThemeColors>) => ({ background: c.card, border: `1px solid ${c.border}`, borderRadius: 8, fontSize: 13 });

/** Receita x despesa (and the result) month by month, as lines. */
export function MonthlyLineChart({ data }: { data: Month[] }) {
  const c = useThemeColors();
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="2 4" stroke={c.border} vertical={false} />
        <XAxis dataKey="month" tickFormatter={formatMonth} {...axis(c)} axisLine={{ stroke: c.border }} />
        <YAxis tickFormatter={(v) => formatBRL(v)} width={84} {...axis(c)} axisLine={false} />
        <Tooltip formatter={(v) => formatBRL(Number(v))} labelFormatter={(l) => formatMonth(String(l))} contentStyle={tooltipStyle(c)} />
        <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ color: c.ink, fontSize: 12 }}>{v}</span>} />
        <Line type="monotone" dataKey="income" name="Receitas" stroke={c.green} strokeWidth={2} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="expense" name="Despesas" stroke={c.red} strokeWidth={2} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="result" name="Resultado" stroke={c.blue} strokeWidth={2} strokeDasharray="5 4" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** The combined balance of the cash accounts at the end of each month. */
export function NetWorthChart({ data }: { data: { month: string; balance: number }[] }) {
  const c = useThemeColors();
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={c.blue} stopOpacity={0.35} />
            <stop offset="95%" stopColor={c.blue} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 4" stroke={c.border} vertical={false} />
        <XAxis dataKey="month" tickFormatter={formatMonth} {...axis(c)} axisLine={{ stroke: c.border }} />
        <YAxis tickFormatter={(v) => formatBRL(v)} width={84} {...axis(c)} axisLine={false} />
        <Tooltip formatter={(v) => formatBRL(Number(v))} labelFormatter={(l) => formatMonth(String(l))} contentStyle={tooltipStyle(c)} />
        <ReferenceLine y={0} stroke={c.border} />
        <Area type="monotone" dataKey="balance" name="Saldo das contas" stroke={c.blue} strokeWidth={2} fill="url(#netWorthFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Monthly spending as bars, with the average of the months shown as a dashed line. */
export function MonthlyExpenseBars({ data }: { data: Month[] }) {
  const c = useThemeColors();
  const withSpend = data.filter((m) => m.expense > 0);
  const average = withSpend.length ? withSpend.reduce((s, m) => s + m.expense, 0) / withSpend.length : 0;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="2 4" stroke={c.border} vertical={false} />
        <XAxis dataKey="month" tickFormatter={formatMonth} {...axis(c)} axisLine={{ stroke: c.border }} />
        <YAxis tickFormatter={(v) => formatBRL(v)} width={84} {...axis(c)} axisLine={false} />
        <Tooltip formatter={(v) => formatBRL(Number(v))} labelFormatter={(l) => formatMonth(String(l))} contentStyle={tooltipStyle(c)} />
        {average > 0 && <ReferenceLine y={average} stroke={c.amber} strokeDasharray="5 4" label={{ value: `média ${formatBRL(average)}`, fill: c.amber, fontSize: 11, position: "insideTopRight" }} />}
        <Bar dataKey="expense" name="Despesas" fill={c.red} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** One horizontal bar per person: who spent how much. */
export function UserBarsChart({ data }: { data: { name: string; total: number }[] }) {
  const c = useThemeColors();
  if (data.length === 0) return <p style={{ color: c.muted, fontSize: 14 }}>Sem despesas no período.</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 56)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
        <CartesianGrid strokeDasharray="2 4" stroke={c.border} horizontal={false} />
        <XAxis type="number" tickFormatter={(v) => formatBRL(v)} {...axis(c)} axisLine={{ stroke: c.border }} />
        <YAxis type="category" dataKey="name" width={90} {...axis(c)} axisLine={false} />
        <Tooltip formatter={(v) => formatBRL(Number(v))} contentStyle={tooltipStyle(c)} />
        <Bar dataKey="total" name="Despesas" fill={c.blue} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Projected balance day by day; the area turns red below zero. */
export function ForecastChart({ data }: { data: { date: string; balance: number }[] }) {
  const c = useThemeColors();
  const dayLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={c.blue} stopOpacity={0.35} />
            <stop offset="95%" stopColor={c.blue} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 4" stroke={c.border} vertical={false} />
        <XAxis dataKey="date" tickFormatter={dayLabel} {...axis(c)} axisLine={{ stroke: c.border }} minTickGap={28} />
        <YAxis tickFormatter={(v) => formatBRL(v)} width={84} {...axis(c)} axisLine={false} />
        <Tooltip formatter={(v) => formatBRL(Number(v))} labelFormatter={(l) => dayLabel(String(l))} contentStyle={tooltipStyle(c)} />
        <ReferenceLine y={0} stroke={c.red} strokeDasharray="4 4" />
        <Area type="monotone" dataKey="balance" name="Saldo estimado" stroke={c.blue} strokeWidth={2} fill="url(#forecastFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
