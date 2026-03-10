"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";

interface Sale {
  id: string;
  name: string;
  checkout_path: string;
  order_value: string | null;
  sale_date: string;
  is_affiliate: boolean;
  referring_afiliado_id: string | null;
}

interface Aggregate {
  path: string;
  vendas: number;
  afiliado: number;
  sem_atendimento: number;
}

interface DailySale {
  date: string;
  vendas: number;
  revenue: number;
}

// Manual overrides for "venda sem atendimento" (by lead name)
const SEM_ATENDIMENTO: Record<string, boolean> = {
  "Dionisio Stefano Rafael Pereira": true,
  "Tatiana Rodrigues": true,
};

const PATH_LABELS: Record<string, string> = {
  chat_web: "Chat Web",
  form_web: "Formulario (Programa)",
  prescription_checkout: "Receita Medica",
  manual_sales: "Venda Manual",
  revalife_form: "Formulario Revalife",
  chat_whatsapp: "Chat WhatsApp",
  whatsapp_flow: "WhatsApp Flow",
  affiliate_gift: "Presente Afiliado",
  pagarme_direct: "Pagarme Direto",
  agendamento: "Agendamento",
  unknown: "Desconhecido",
};

const PATH_COLORS: Record<string, string> = {
  chat_web: "#C75028",
  form_web: "#2563EB",
  prescription_checkout: "#059669",
  manual_sales: "#7C3AED",
  revalife_form: "#D97706",
  chat_whatsapp: "#10B981",
  whatsapp_flow: "#06B6D4",
  affiliate_gift: "#EC4899",
  pagarme_direct: "#6366F1",
  agendamento: "#8B5CF6",
  unknown: "#9CA3AF",
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function formatCurrency(value: string | null) {
  if (!value) return "—";
  return `R$${parseFloat(value).toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`;
}

function formatCurrencyNum(value: number) {
  return `R$${value.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`;
}

function formatShortDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function Home() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sales, setSales] = useState<Sale[]>([]);
  const [aggregate, setAggregate] = useState<Aggregate[]>([]);
  const [totalByPath, setTotalByPath] = useState<Record<string, number>>({});
  const [revenueByPath, setRevenueByPath] = useState<Record<string, number>>({});
  const [dailySales, setDailySales] = useState<DailySale[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/sales");
    if (res.status === 401) {
      setAuthed(false);
      return;
    }
    const data = await res.json();
    setSales(data.sales || []);
    setAggregate(data.aggregate || []);
    setTotalByPath(data.totalByPath || {});
    setRevenueByPath(data.revenueByPath || {});
    setDailySales(data.dailySales || []);
    setTotalRevenue(data.totalRevenue || 0);
  }, []);

  // Check if already authed on mount
  useEffect(() => {
    fetch("/api/sales").then((r) => {
      if (r.ok) {
        setAuthed(true);
        r.json().then((data) => {
          setSales(data.sales || []);
          setAggregate(data.aggregate || []);
          setTotalByPath(data.totalByPath || {});
          setRevenueByPath(data.revenueByPath || {});
          setDailySales(data.dailySales || []);
          setTotalRevenue(data.totalRevenue || 0);
        });
      }
    });
  }, []);

  // Auto-refresh every 30s
  useEffect(() => {
    if (!authed) return;
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [authed, fetchData]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      setAuthed(true);
      fetchData();
    } else {
      setError("Senha incorreta");
    }
    setLoading(false);
  }

  // Build aggregate with sem_atendimento from manual overrides
  const enrichedAggregate = aggregate.map((a) => {
    const semAtendimento = sales.filter(
      (s) => s.checkout_path === a.path && SEM_ATENDIMENTO[s.name]
    ).length;
    return { ...a, sem_atendimento: semAtendimento };
  });

  const totalVendas = enrichedAggregate.reduce((s, a) => s + a.vendas, 0);
  const totalAfiliado = enrichedAggregate.reduce((s, a) => s + a.afiliado, 0);
  const totalSemAtendimento = enrichedAggregate.reduce((s, a) => s + a.sem_atendimento, 0);
  const ticketMedio = totalVendas > 0 ? totalRevenue / totalVendas : 0;

  // Chart data: vendas por caminho
  const barData = enrichedAggregate.map((a) => ({
    name: PATH_LABELS[a.path] || a.path,
    vendas: a.vendas,
    revenue: revenueByPath[a.path] || 0,
    fill: PATH_COLORS[a.path] || "#9CA3AF",
  }));

  // Revenue bar data
  const revenueBarData = enrichedAggregate.map((a) => ({
    name: PATH_LABELS[a.path] || a.path,
    revenue: revenueByPath[a.path] || 0,
    fill: PATH_COLORS[a.path] || "#9CA3AF",
  }));

  // Total leads across all paths
  const totalLeadsAll = Object.values(totalByPath).reduce((a, b) => a + b, 0);
  const conversionRate = totalLeadsAll > 0 ? ((totalVendas / totalLeadsAll) * 100).toFixed(1) : "0";

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <form onSubmit={handleLogin} className="flex flex-col gap-4 w-80">
          <h1 className="text-2xl font-bold text-center">Slima Growth</h1>
          <p className="text-sm text-[#6B6560] text-center">Digite a senha para acessar</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha"
            className="px-4 py-3 border border-[#E5E2DC] rounded-lg text-sm focus:outline-none focus:border-[#C75028]"
            autoFocus
          />
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-3 bg-[#1A1A1A] text-white rounded-lg text-sm font-medium hover:bg-[#333] disabled:opacity-50"
          >
            {loading ? "..." : "Entrar"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-baseline justify-between mb-8">
        <div>
          <p className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-1">SLIMA GROWTH</p>
          <h1 className="text-3xl font-bold">Dashboard</h1>
        </div>
        <p className="text-xs text-[#9B9590]">Atualiza a cada 30s</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
          <p className="text-xs text-[#9B9590] uppercase tracking-wide mb-1">Total Vendas</p>
          <p className="text-3xl font-bold">{totalVendas}</p>
        </div>
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
          <p className="text-xs text-[#9B9590] uppercase tracking-wide mb-1">Valor Total</p>
          <p className="text-3xl font-bold">{formatCurrencyNum(totalRevenue)}</p>
        </div>
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
          <p className="text-xs text-[#9B9590] uppercase tracking-wide mb-1">Ticket Medio</p>
          <p className="text-3xl font-bold">{formatCurrencyNum(ticketMedio)}</p>
        </div>
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
          <p className="text-xs text-[#9B9590] uppercase tracking-wide mb-1">Conversao Geral</p>
          <p className="text-3xl font-bold">{conversionRate}%</p>
          <p className="text-xs text-[#9B9590] mt-1">{totalVendas} de {totalLeadsAll} leads</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        {/* Vendas por Caminho */}
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
          <h3 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-4">Vendas por Caminho</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={barData} layout="vertical" margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EDEA" />
              <XAxis type="number" tick={{ fontSize: 12, fill: "#9B9590" }} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11, fill: "#6B6560" }}
                width={130}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, border: "1px solid #E5E2DC", borderRadius: 8 }}
                formatter={(value: number) => [value, "Vendas"]}
              />
              <Bar dataKey="vendas" radius={[0, 4, 4, 0]}>
                {barData.map((entry, index) => (
                  <rect key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Receita por Caminho */}
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
          <h3 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-4">Receita por Caminho</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={revenueBarData} layout="vertical" margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EDEA" />
              <XAxis
                type="number"
                tick={{ fontSize: 12, fill: "#9B9590" }}
                tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11, fill: "#6B6560" }}
                width={130}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, border: "1px solid #E5E2DC", borderRadius: 8 }}
                formatter={(value: number) => [formatCurrencyNum(value), "Receita"]}
              />
              <Bar dataKey="revenue" fill="#C75028" radius={[0, 4, 4, 0]}>
                {revenueBarData.map((entry, index) => (
                  <rect key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Daily Sales Line Chart */}
      {dailySales.length > 1 && (
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-5 mb-10">
          <h3 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-4">Vendas por Dia</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailySales} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EDEA" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#9B9590" }}
                tickFormatter={formatShortDate}
              />
              <YAxis tick={{ fontSize: 12, fill: "#9B9590" }} />
              <Tooltip
                contentStyle={{ fontSize: 12, border: "1px solid #E5E2DC", borderRadius: 8 }}
                labelFormatter={formatShortDate}
                formatter={(value: number, name: string) => [
                  name === "revenue" ? formatCurrencyNum(value) : value,
                  name === "revenue" ? "Receita" : "Vendas",
                ]}
              />
              <Line
                type="monotone"
                dataKey="vendas"
                stroke="#C75028"
                strokeWidth={2}
                dot={{ fill: "#C75028", r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#2563EB"
                strokeWidth={2}
                dot={{ fill: "#2563EB", r: 4 }}
                yAxisId={1}
                hide
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Aggregate Table */}
      <div className="mb-10">
        <h2 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-3">AGREGADO POR CAMINHO</h2>
        <div className="overflow-hidden rounded-lg border border-[#E5E2DC]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F9F8F6] border-b border-[#E5E2DC]">
                <th className="text-left px-4 py-2.5 font-medium text-[#6B6560]">Caminho</th>
                <th className="text-center px-4 py-2.5 font-medium text-[#6B6560]">Vendas</th>
                <th className="text-right px-4 py-2.5 font-medium text-[#6B6560]">Receita</th>
                <th className="text-right px-4 py-2.5 font-medium text-[#6B6560]">Ticket Medio</th>
                <th className="text-center px-4 py-2.5 font-medium text-[#6B6560]">Total Leads</th>
                <th className="text-center px-4 py-2.5 font-medium text-[#6B6560]">Conversao</th>
                <th className="text-center px-4 py-2.5 font-medium text-[#6B6560]">Afiliado</th>
                <th className="text-center px-4 py-2.5 font-medium text-[#6B6560]">Sem Atendimento</th>
                <th className="text-center px-4 py-2.5 font-medium text-[#6B6560]">Com Atendimento</th>
              </tr>
            </thead>
            <tbody>
              {enrichedAggregate.map((a) => {
                const revenue = revenueByPath[a.path] || 0;
                const ticket = a.vendas > 0 ? revenue / a.vendas : 0;
                return (
                  <tr key={a.path} className="border-b border-[#F0EDEA] hover:bg-[#F9F8F6]">
                    <td className="px-4 py-2.5 font-medium">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full inline-block"
                          style={{ backgroundColor: PATH_COLORS[a.path] || "#9CA3AF" }}
                        />
                        {PATH_LABELS[a.path] || a.path}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center font-semibold">{a.vendas}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{formatCurrencyNum(revenue)}</td>
                    <td className="px-4 py-2.5 text-right text-[#6B6560]">{formatCurrencyNum(ticket)}</td>
                    <td className="px-4 py-2.5 text-center text-[#6B6560]">{totalByPath[a.path] || "—"}</td>
                    <td className="px-4 py-2.5 text-center text-[#6B6560]">
                      {totalByPath[a.path]
                        ? `${((a.vendas / totalByPath[a.path]) * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-center">{a.afiliado || ""}</td>
                    <td className="px-4 py-2.5 text-center">{a.sem_atendimento || ""}</td>
                    <td className="px-4 py-2.5 text-center">{a.vendas - a.sem_atendimento}</td>
                  </tr>
                );
              })}
              <tr className="bg-[#F9F8F6] font-semibold">
                <td className="px-4 py-2.5">Total</td>
                <td className="px-4 py-2.5 text-center">{totalVendas}</td>
                <td className="px-4 py-2.5 text-right">{formatCurrencyNum(totalRevenue)}</td>
                <td className="px-4 py-2.5 text-right">{formatCurrencyNum(ticketMedio)}</td>
                <td className="px-4 py-2.5 text-center"></td>
                <td className="px-4 py-2.5 text-center"></td>
                <td className="px-4 py-2.5 text-center">{totalAfiliado || ""}</td>
                <td className="px-4 py-2.5 text-center">{totalSemAtendimento || ""}</td>
                <td className="px-4 py-2.5 text-center">{totalVendas - totalSemAtendimento}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Sales Table */}
      <div>
        <h2 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-3">TODAS AS VENDAS</h2>
        <div className="overflow-hidden rounded-lg border border-[#E5E2DC]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F9F8F6] border-b border-[#E5E2DC]">
                <th className="text-left px-4 py-2.5 font-medium text-[#6B6560]">Nome</th>
                <th className="text-left px-4 py-2.5 font-medium text-[#6B6560]">Data</th>
                <th className="text-left px-4 py-2.5 font-medium text-[#6B6560]">Caminho</th>
                <th className="text-right px-4 py-2.5 font-medium text-[#6B6560]">Valor</th>
                <th className="text-center px-4 py-2.5 font-medium text-[#6B6560]">Afiliado</th>
                <th className="text-center px-4 py-2.5 font-medium text-[#6B6560]">Sem Atendimento</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s, i) => (
                <tr key={`${s.id}-${i}`} className="border-b border-[#F0EDEA] hover:bg-[#F9F8F6]">
                  <td className="px-4 py-2.5 font-medium">{s.name || "—"}</td>
                  <td className="px-4 py-2.5 text-[#6B6560]">{formatDate(s.sale_date)}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded"
                      style={{
                        backgroundColor: `${PATH_COLORS[s.checkout_path] || "#9CA3AF"}15`,
                        color: PATH_COLORS[s.checkout_path] || "#6B6560",
                      }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: PATH_COLORS[s.checkout_path] || "#9CA3AF" }}
                      />
                      {PATH_LABELS[s.checkout_path] || s.checkout_path}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(s.order_value)}</td>
                  <td className="px-4 py-2.5 text-center">
                    {s.is_affiliate ? "x" : ""}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {SEM_ATENDIMENTO[s.name] ? "x" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
