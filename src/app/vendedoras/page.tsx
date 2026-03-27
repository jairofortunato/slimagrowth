"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, Legend, Cell,
} from "recharts";

interface Perf { won: number; lost: number; winRate: number; avgDays: number }
interface FunnelStage { id: number; name: string; veri: number; thaisa: number; total: number }
interface ActivityDay {
  date: string;
  veri: { msgs: number; calls: number; changes: number };
  thaisa: { msgs: number; calls: number; changes: number };
}
interface LeadDetail { name: string; phone: string; createdAt: string; closedAt: string; vendedora: string }
interface KommoData {
  funnel: FunnelStage[];
  performance: { veri: Perf; thaisa: Perf; total: Perf };
  health: FunnelStage[];
  staleLeads: { veri: number; thaisa: number; total: number };
  overdueTasks: { veri: number; thaisa: number; total: number };
  activity: ActivityDay[];
  wonLeads: LeadDetail[];
  lostLeads: LeadDetail[];
}

function fmt(n: number) { return n.toLocaleString("pt-BR"); }
function fmtPct(n: number) { return `${n.toFixed(1)}%`; }
function fmtDays(n: number) { return n > 0 ? `${n.toFixed(1)}d` : "\u2014"; }
function fmtShort(d: string) { const p = d.split("-"); return `${p[2]}/${p[1]}`; }

const VERI_COLOR = "#C75028";
const THAISA_COLOR = "#2563EB";

export default function VendedorasPage() {
  const [authed, setAuthed] = useState<boolean | null>(null); // null = checking
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<KommoData | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showLost, setShowLost] = useState(false);

  // Check auth first via /api/sales (lightweight, proven to work)
  useEffect(() => {
    fetch("/api/sales").then((r) => {
      if (r.ok) { setAuthed(true); }
      else { setAuthed(false); }
    }).catch(() => setAuthed(false));
  }, []);

  const fetchData = useCallback(async (from?: string, to?: string) => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    try {
      const res = await fetch(`/api/kommo${qs ? `?${qs}` : ""}`);
      if (res.status === 401) { setAuthed(false); setLoading(false); return; }
      const json = await res.json();
      if (json.error) { setError(json.error); setLoading(false); return; }
      setData(json);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  // Fetch Kommo data once authed
  useEffect(() => {
    if (authed) fetchData();
  }, [authed, fetchData]);

  // Auto-refresh every 5 min
  useEffect(() => {
    if (!authed) return;
    const iv = setInterval(() => fetchData(dateFrom || undefined, dateTo || undefined), 300000);
    return () => clearInterval(iv);
  }, [authed, fetchData, dateFrom, dateTo]);

  // Activity chart data
  const activityChart = useMemo(() => {
    if (!data?.activity) return [];
    return data.activity.map(d => ({
      date: d.date,
      veriMsgs: d.veri.msgs,
      thaisaMsgs: d.thaisa.msgs,
      veriCalls: d.veri.calls,
      thaisaCalls: d.thaisa.calls,
      veriChanges: d.veri.changes,
      thaisaChanges: d.thaisa.changes,
      veriTotal: d.veri.msgs + d.veri.calls + d.veri.changes,
      thaisaTotal: d.thaisa.msgs + d.thaisa.calls + d.thaisa.changes,
    }));
  }, [data]);

  // Activity totals
  const actTotals = useMemo(() => {
    if (!data?.activity) return { veri: { msgs: 0, calls: 0, changes: 0 }, thaisa: { msgs: 0, calls: 0, changes: 0 } };
    return data.activity.reduce((acc, d) => ({
      veri: { msgs: acc.veri.msgs + d.veri.msgs, calls: acc.veri.calls + d.veri.calls, changes: acc.veri.changes + d.veri.changes },
      thaisa: { msgs: acc.thaisa.msgs + d.thaisa.msgs, calls: acc.thaisa.calls + d.thaisa.calls, changes: acc.thaisa.changes + d.thaisa.changes },
    }), { veri: { msgs: 0, calls: 0, changes: 0 }, thaisa: { msgs: 0, calls: 0, changes: 0 } });
  }, [data]);

  // Filtered lead details
  const filteredLeads = useMemo(() => {
    const list = showLost ? (data?.lostLeads || []) : (data?.wonLeads || []);
    if (!searchQuery) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(l => l.name.toLowerCase().includes(q) || l.phone.includes(q));
  }, [data, showLost, searchQuery]);

  // Funnel bar chart data
  const funnelChart = useMemo(() => {
    if (!data?.funnel) return [];
    return data.funnel.map(s => ({ name: s.name, Veridiana: s.veri, Thaisa: s.thaisa }));
  }, [data]);

  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-[#9B9590]">Verificando autenticacao...</p>
      </div>
    );
  }

  if (authed === false) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-bold mb-2">Nao autenticado</p>
          <a href="/" className="text-[#C75028] underline text-sm">Voltar ao Dashboard e fazer login</a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-8">
        <div>
          <p className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-1">SLIMA GROWTH</p>
          <h1 className="text-3xl font-bold">Vendedoras</h1>
          <p className="text-xs text-[#9B9590] mt-1">Dados do Kommo CRM</p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/resumo" className="px-3 py-1.5 text-xs font-medium bg-[#C75028] text-white rounded-lg hover:bg-[#A8421F] transition-colors">Resumo do Mes</a>
          <a href="/" className="text-xs text-[#C75028] hover:underline">&larr; Dashboard Principal</a>
        </div>
      </div>

      {/* Date Filter */}
      <div className="bg-white border border-[#E5E2DC] rounded-lg p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium tracking-widest uppercase text-[#C75028]">PERIODO</span>
          <div className="flex items-center gap-2">
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); fetchData(e.target.value || undefined, dateTo || undefined); }}
              className="px-3 py-1.5 text-sm border border-[#E5E2DC] rounded-lg focus:outline-none focus:border-[#C75028]" />
            <span className="text-xs text-[#9B9590]">ate</span>
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); fetchData(dateFrom || undefined, e.target.value || undefined); }}
              className="px-3 py-1.5 text-sm border border-[#E5E2DC] rounded-lg focus:outline-none focus:border-[#C75028]" />
          </div>
          <div className="flex gap-1.5 ml-auto">
            {[
              { label: "7d", fn: () => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); } },
              { label: "30d", fn: () => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); } },
              { label: "Este mes", fn: () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; } },
            ].map((preset) => (
              <button key={preset.label} onClick={() => { const f = preset.fn(); const t = new Date().toISOString().slice(0, 10); setDateFrom(f); setDateTo(t); fetchData(f, t); }}
                className="px-3 py-1.5 text-xs font-medium border border-[#E5E2DC] rounded-lg hover:bg-[#F9F8F6] transition-colors">
                {preset.label}
              </button>
            ))}
            <button onClick={() => { setDateFrom(""); setDateTo(""); fetchData(); }}
              className="px-3 py-1.5 text-xs font-medium border border-[#E5E2DC] rounded-lg hover:bg-[#F9F8F6] transition-colors text-[#C75028]">
              Tudo
            </button>
          </div>
        </div>
      </div>

      {/* Loading / Error */}
      {(loading || (!data && !error)) && (
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-10 text-center mb-6">
          <p className="text-sm text-[#9B9590]">Carregando dados do Kommo CRM...</p>
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6">
          <p className="text-sm text-red-700"><span className="font-medium">Erro Kommo:</span> {error}</p>
        </div>
      )}

      {data && !loading && (
        <>
          {/* ═══ PERFORMANCE KPIs ═══ */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[
              { label: "Veridiana", color: VERI_COLOR, p: data.performance.veri },
              { label: "Thaisa", color: THAISA_COLOR, p: data.performance.thaisa },
              { label: "Total", color: "#1A1A1A", p: data.performance.total },
            ].map(({ label, color, p }) => (
              <div key={label} className="bg-white border border-[#E5E2DC] rounded-lg p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                  <h3 className="text-sm font-bold">{label}</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-[#9B9590] uppercase">Ganhos</p>
                    <p className="text-2xl font-bold text-green-600">{p.won}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#9B9590] uppercase">Perdidos</p>
                    <p className="text-2xl font-bold text-red-500">{p.lost}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#9B9590] uppercase">Win Rate</p>
                    <p className="text-lg font-bold">{fmtPct(p.winRate)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#9B9590] uppercase">Tempo Medio</p>
                    <p className="text-lg font-bold">{fmtDays(p.avgDays)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ═══ FUNIL DE CONVERSAO ═══ */}
          <div className="bg-white border border-[#E5E2DC] rounded-lg p-5 mb-6">
            <h3 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-4">FUNIL DE CONVERSAO</h3>
            {funnelChart.length > 0 && (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={funnelChart} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0EDEA" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#9B9590" }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#6B6560" }} width={120} />
                  <Tooltip contentStyle={{ fontSize: 12, border: "1px solid #E5E2DC", borderRadius: 8 }} />
                  <Legend formatter={(v) => v} />
                  <Bar dataKey="Veridiana" fill={VERI_COLOR} radius={[0, 3, 3, 0]} />
                  <Bar dataKey="Thaisa" fill={THAISA_COLOR} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
            {/* Funnel table */}
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F9F8F6] border-b border-[#E5E2DC]">
                    <th className="text-left px-3 py-2 font-medium text-[#6B6560]">Etapa</th>
                    <th className="text-center px-3 py-2 font-medium" style={{ color: VERI_COLOR }}>Veridiana</th>
                    <th className="text-center px-3 py-2 font-medium" style={{ color: THAISA_COLOR }}>Thaisa</th>
                    <th className="text-center px-3 py-2 font-medium text-[#6B6560]">Total</th>
                    <th className="text-center px-3 py-2 font-medium text-[#6B6560]">Conv.</th>
                  </tr>
                </thead>
                <tbody>
                  {data.funnel.map((s, idx) => {
                    const prev = idx > 0 ? data.funnel[idx - 1].total : 0;
                    const conv = prev > 0 ? (s.total / prev) * 100 : 0;
                    return (
                      <tr key={s.id} className="border-b border-[#F0EDEA] hover:bg-[#F9F8F6]">
                        <td className="px-3 py-2 text-xs font-medium">{s.name}</td>
                        <td className="px-3 py-2 text-center text-xs font-semibold">{fmt(s.veri)}</td>
                        <td className="px-3 py-2 text-center text-xs font-semibold">{fmt(s.thaisa)}</td>
                        <td className="px-3 py-2 text-center text-xs font-bold">{fmt(s.total)}</td>
                        <td className="px-3 py-2 text-center text-xs text-[#6B6560]">{idx > 0 ? fmtPct(conv) : "\u2014"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ═══ ATIVIDADE DIARIA ═══ */}
          <div className="bg-white border border-[#E5E2DC] rounded-lg p-5 mb-6">
            <h3 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-4">ATIVIDADE DIARIA</h3>

            {/* Activity totals */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[
                { label: "Mensagens Veri", val: actTotals.veri.msgs, color: VERI_COLOR },
                { label: "Mensagens Thaisa", val: actTotals.thaisa.msgs, color: THAISA_COLOR },
                { label: "Ligacoes Veri", val: actTotals.veri.calls, color: VERI_COLOR },
                { label: "Ligacoes Thaisa", val: actTotals.thaisa.calls, color: THAISA_COLOR },
              ].map(({ label, val, color }) => (
                <div key={label} className="bg-[#F9F8F6] rounded-lg p-3 text-center">
                  <p className="text-[10px] text-[#9B9590] uppercase mb-0.5">{label}</p>
                  <p className="text-xl font-bold" style={{ color }}>{fmt(val)}</p>
                </div>
              ))}
            </div>

            {activityChart.length > 0 && (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={activityChart} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0EDEA" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9B9590" }} tickFormatter={fmtShort} />
                  <YAxis tick={{ fontSize: 11, fill: "#9B9590" }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, border: "1px solid #E5E2DC", borderRadius: 8 }}
                    labelFormatter={(v) => { const p = String(v).split("-"); return `${p[2]}/${p[1]}/${p[0]}`; }}
                  />
                  <Legend formatter={(v) => {
                    const m: Record<string, string> = { veriMsgs: "Msgs Veri", thaisaMsgs: "Msgs Thaisa", veriCalls: "Lig. Veri", thaisaCalls: "Lig. Thaisa" };
                    return m[v] || v;
                  }} />
                  <Line type="monotone" dataKey="veriMsgs" stroke={VERI_COLOR} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="thaisaMsgs" stroke={THAISA_COLOR} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="veriCalls" stroke={VERI_COLOR} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="thaisaCalls" stroke={THAISA_COLOR} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* ═══ SAUDE DO PIPELINE ═══ */}
          <div className="bg-white border border-[#E5E2DC] rounded-lg p-5 mb-6">
            <h3 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-4">SAUDE DO PIPELINE (SNAPSHOT ATUAL)</h3>

            {/* Alerts */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                <p className="text-[10px] text-amber-700 uppercase mb-0.5">Tarefas Atrasadas</p>
                <p className="text-2xl font-bold text-amber-700">{data.overdueTasks.total}</p>
                <p className="text-[10px] text-amber-600">V:{data.overdueTasks.veri} T:{data.overdueTasks.thaisa}</p>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
                <p className="text-[10px] text-orange-700 uppercase mb-0.5">Leads Parados (7d+)</p>
                <p className="text-2xl font-bold text-orange-700">{data.staleLeads.total}</p>
                <p className="text-[10px] text-orange-600">V:{data.staleLeads.veri} T:{data.staleLeads.thaisa}</p>
              </div>
              <div className="bg-[#F9F8F6] rounded-lg p-3 text-center">
                <p className="text-[10px] text-[#9B9590] uppercase mb-0.5">Leads Veri (abertos)</p>
                <p className="text-2xl font-bold" style={{ color: VERI_COLOR }}>{fmt(data.health.reduce((s, h) => s + h.veri, 0))}</p>
              </div>
              <div className="bg-[#F9F8F6] rounded-lg p-3 text-center">
                <p className="text-[10px] text-[#9B9590] uppercase mb-0.5">Leads Thaisa (abertos)</p>
                <p className="text-2xl font-bold" style={{ color: THAISA_COLOR }}>{fmt(data.health.reduce((s, h) => s + h.thaisa, 0))}</p>
              </div>
            </div>

            {/* Pipeline snapshot table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F9F8F6] border-b border-[#E5E2DC]">
                    <th className="text-left px-3 py-2 font-medium text-[#6B6560]">Etapa</th>
                    <th className="text-center px-3 py-2 font-medium" style={{ color: VERI_COLOR }}>Veri</th>
                    <th className="text-center px-3 py-2 font-medium" style={{ color: THAISA_COLOR }}>Thaisa</th>
                    <th className="text-center px-3 py-2 font-medium text-[#6B6560]">Total</th>
                    <th className="text-left px-3 py-2 font-medium text-[#6B6560]">Distribuicao</th>
                  </tr>
                </thead>
                <tbody>
                  {data.health.map(s => {
                    const maxTotal = Math.max(...data.health.map(h => h.total), 1);
                    const vPct = s.total > 0 ? (s.veri / s.total) * 100 : 50;
                    return (
                      <tr key={s.id} className="border-b border-[#F0EDEA] hover:bg-[#F9F8F6]">
                        <td className="px-3 py-2 text-xs font-medium">{s.name}</td>
                        <td className="px-3 py-2 text-center text-xs font-semibold">{s.veri}</td>
                        <td className="px-3 py-2 text-center text-xs font-semibold">{s.thaisa}</td>
                        <td className="px-3 py-2 text-center text-xs font-bold">{s.total}</td>
                        <td className="px-3 py-2">
                          <div className="flex h-4 rounded overflow-hidden" style={{ width: `${Math.max((s.total / maxTotal) * 100, 10)}%` }}>
                            <div style={{ width: `${vPct}%`, backgroundColor: VERI_COLOR }} />
                            <div style={{ width: `${100 - vPct}%`, backgroundColor: THAISA_COLOR }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-[#F9F8F6] font-semibold">
                    <td className="px-3 py-2 text-xs">Total Abertos</td>
                    <td className="px-3 py-2 text-center text-xs">{data.health.reduce((s, h) => s + h.veri, 0)}</td>
                    <td className="px-3 py-2 text-center text-xs">{data.health.reduce((s, h) => s + h.thaisa, 0)}</td>
                    <td className="px-3 py-2 text-center text-xs">{data.health.reduce((s, h) => s + h.total, 0)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ═══ DETALHAMENTO POR LEAD ═══ */}
          <div className="bg-white border border-[#E5E2DC] rounded-lg p-5 mb-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-medium tracking-widest uppercase text-[#C75028]">DETALHAMENTO POR LEAD</h3>
              <div className="flex items-center gap-3">
                <input
                  type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar nome ou telefone..."
                  className="px-3 py-1.5 text-sm border border-[#E5E2DC] rounded-lg focus:outline-none focus:border-[#C75028] w-56"
                />
                <div className="flex rounded-lg overflow-hidden border border-[#E5E2DC]">
                  <button onClick={() => setShowLost(false)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${!showLost ? "bg-green-600 text-white" : "bg-white text-[#6B6560] hover:bg-[#F9F8F6]"}`}>
                    Ganhos ({data.wonLeads.length})
                  </button>
                  <button onClick={() => setShowLost(true)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${showLost ? "bg-red-500 text-white" : "bg-white text-[#6B6560] hover:bg-[#F9F8F6]"}`}>
                    Perdidos ({data.lostLeads.length})
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F9F8F6] border-b border-[#E5E2DC]">
                    <th className="text-left px-4 py-2.5 font-medium text-[#6B6560]">Nome</th>
                    <th className="text-left px-4 py-2.5 font-medium text-[#6B6560]">Telefone</th>
                    <th className="text-left px-4 py-2.5 font-medium text-[#6B6560]">Criado em</th>
                    <th className="text-left px-4 py-2.5 font-medium text-[#6B6560]">Fechado em</th>
                    <th className="text-left px-4 py-2.5 font-medium text-[#6B6560]">Vendedora</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-[#9B9590]">Nenhum lead encontrado</td></tr>
                  ) : filteredLeads.map((l, i) => (
                    <tr key={i} className="border-b border-[#F0EDEA] hover:bg-[#F9F8F6]">
                      <td className="px-4 py-2.5 font-medium">{l.name}</td>
                      <td className="px-4 py-2.5 text-[#6B6560]">{l.phone}</td>
                      <td className="px-4 py-2.5 text-[#6B6560]">{fmtShort(l.createdAt)}</td>
                      <td className="px-4 py-2.5 text-[#6B6560]">{l.closedAt !== "\u2014" ? fmtShort(l.closedAt) : "\u2014"}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded"
                          style={{
                            backgroundColor: l.vendedora === "Veridiana" ? `${VERI_COLOR}15` : `${THAISA_COLOR}15`,
                            color: l.vendedora === "Veridiana" ? VERI_COLOR : THAISA_COLOR,
                          }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: l.vendedora === "Veridiana" ? VERI_COLOR : THAISA_COLOR }} />
                          {l.vendedora}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
