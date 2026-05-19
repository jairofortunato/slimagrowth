"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

interface Sale {
  id: string;
  name: string;
  phone: string;
  checkout_path: string;
  order_value: string | null;
  sale_date: string;
  is_affiliate: boolean;
  is_agendamento: boolean;
  vendedor: string | null;
}

const VERI_COLOR = "#C75028";
const THAISA_COLOR = "#2563EB";
const GABRIEL_COLOR = "#059669";

function fmt(n: number) { return n.toLocaleString("pt-BR"); }
function fmtCurrency(n: number) { return `R$${n.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`; }
function fmtShort(d: string) { const p = d.split("-"); return `${p[2]}/${p[1]}`; }

export default function VendedorasPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sales, setSales] = useState<Sale[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchData = useCallback(async (from?: string, to?: string) => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    try {
      const res = await fetch(`/api/sales${qs ? `?${qs}` : ""}`);
      if (res.status === 401) { setAuthed(false); setLoading(false); return; }
      const json = await res.json();
      if (json.error) { setError(json.error); setLoading(false); return; }
      setSales(json.sales || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }, []);

  // Auth check (mirrors /vendedoras/[nome])
  useEffect(() => {
    fetch("/api/sales")
      .then((r) => setAuthed(r.ok))
      .catch(() => setAuthed(false));
  }, []);

  // Fetch once authed
  useEffect(() => {
    if (authed) fetchData();
  }, [authed, fetchData]);

  // Vendedora stats (sales attributed via Supabase leads.assigned_seller)
  const vendedoraStats = useMemo(() => {
    const init = () => ({ vendas: 0, agendamentos: 0, faturamento: 0 });
    const stats = {
      Veridiana: init(),
      Thaisa: init(),
      Gabriel: init(),
      Jairo: init(),
      sem: init(),
    };
    for (const s of sales) {
      const v = (s.vendedor || "").trim();
      const key = (v === "Veridiana" || v === "Veri") ? "Veridiana"
        : v === "Thaisa" ? "Thaisa"
        : v === "Gabriel" ? "Gabriel"
        : v === "Jairo" ? "Jairo"
        : "sem";
      const val = s.order_value ? parseFloat(s.order_value) : 0;
      if (s.is_agendamento) stats[key].agendamentos++;
      else stats[key].vendas++;
      stats[key].faturamento += val;
    }
    return stats;
  }, [sales]);

  // Daily sales by vendedora
  const dailyByVendedora = useMemo(() => {
    const map: Record<string, { date: string; Veridiana: number; Thaisa: number; Gabriel: number }> = {};
    for (const s of sales) {
      const v = (s.vendedor || "").trim();
      const key = (v === "Veridiana" || v === "Veri") ? "Veridiana"
        : v === "Thaisa" ? "Thaisa"
        : v === "Gabriel" ? "Gabriel"
        : null;
      if (!key) continue;
      const day = s.sale_date.slice(0, 10);
      if (!map[day]) map[day] = { date: day, Veridiana: 0, Thaisa: 0, Gabriel: 0 };
      map[day][key]++;
    }
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [sales]);

  const totalSales = sales.length;
  const semVendedora = vendedoraStats.sem.vendas + vendedoraStats.sem.agendamentos;

  if (authed === null && !error) {
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

  const cards = [
    { key: "veri", label: "Veridiana", color: VERI_COLOR, stats: vendedoraStats.Veridiana, href: "/vendedoras/veri" },
    { key: "thaisa", label: "Thaisa", color: THAISA_COLOR, stats: vendedoraStats.Thaisa, href: "/vendedoras/thaisa" },
    { key: "gabriel", label: "Gabriel", color: GABRIEL_COLOR, stats: vendedoraStats.Gabriel, href: null },
  ] as const;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-8">
        <div>
          <p className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-1">SLIMA GROWTH</p>
          <h1 className="text-3xl font-bold">Vendedoras</h1>
          <p className="text-xs text-[#9B9590] mt-1">Dados da Supabase (leads.assigned_seller)</p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/vendedoras/veri" className="px-3 py-1.5 text-xs font-medium text-white rounded-lg hover:opacity-90 transition-opacity" style={{ backgroundColor: VERI_COLOR }}>Pagina Veri</a>
          <a href="/vendedoras/thaisa" className="px-3 py-1.5 text-xs font-medium text-white rounded-lg hover:opacity-90 transition-opacity" style={{ backgroundColor: THAISA_COLOR }}>Pagina Thaisa</a>
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
      {loading && (
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-10 text-center mb-6">
          <p className="text-sm text-[#9B9590]">Carregando dados...</p>
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6">
          <p className="text-sm text-red-700"><span className="font-medium">Erro:</span> {error}</p>
        </div>
      )}

      {!loading && (
        <>
          {/* ═══ VENDEDORA CARDS ═══ */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {cards.map(({ key, label, color, stats, href }) => {
              const inner = (
                <div className="bg-white border border-[#E5E2DC] rounded-lg p-5 hover:shadow-sm transition-shadow h-full">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                      <h3 className="text-sm font-bold">{label}</h3>
                    </div>
                    {href && <span className="text-[10px] text-[#9B9590]">ver detalhes &rarr;</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-[#9B9590] uppercase">Vendas</p>
                      <p className="text-2xl font-bold" style={{ color }}>{stats.vendas}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#9B9590] uppercase">Agendamentos</p>
                      <p className="text-2xl font-bold text-[#14B8A6]">{stats.agendamentos}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[10px] text-[#9B9590] uppercase">Faturamento</p>
                      <p className="text-lg font-bold">{fmtCurrency(stats.faturamento)}</p>
                    </div>
                  </div>
                </div>
              );
              return href ? (
                <a key={key} href={href} className="block">{inner}</a>
              ) : (
                <div key={key}>{inner}</div>
              );
            })}
          </div>

          {/* ═══ SUMARIO ═══ */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
              <p className="text-[10px] text-[#9B9590] uppercase mb-1">Total Vendas</p>
              <p className="text-2xl font-bold">{totalSales}</p>
              <p className="text-[10px] text-[#9B9590] mt-1">no periodo</p>
            </div>
            <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
              <p className="text-[10px] text-[#9B9590] uppercase mb-1">Com Vendedora</p>
              <p className="text-2xl font-bold text-green-600">{totalSales - semVendedora}</p>
              <p className="text-[10px] text-[#9B9590] mt-1">
                {totalSales > 0 ? `${(((totalSales - semVendedora) / totalSales) * 100).toFixed(0)}%` : "—"} atribuidas
              </p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-5">
              <p className="text-[10px] text-amber-700 uppercase mb-1">Sem Vendedora</p>
              <p className="text-2xl font-bold text-amber-700">{semVendedora}</p>
              <p className="text-[10px] text-amber-600 mt-1">atribuir nas paginas individuais</p>
            </div>
            <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
              <p className="text-[10px] text-[#9B9590] uppercase mb-1">Faturamento Total</p>
              <p className="text-2xl font-bold">{fmtCurrency(sales.reduce((s, v) => s + (v.order_value ? parseFloat(v.order_value) : 0), 0))}</p>
            </div>
          </div>

          {/* ═══ VENDAS DIARIAS POR VENDEDORA ═══ */}
          {dailyByVendedora.length > 0 && (
            <div className="bg-white border border-[#E5E2DC] rounded-lg p-5 mb-10">
              <h3 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-4">VENDAS DIARIAS POR VENDEDORA</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dailyByVendedora} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0EDEA" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9B9590" }} tickFormatter={fmtShort} />
                  <YAxis tick={{ fontSize: 11, fill: "#9B9590" }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, border: "1px solid #E5E2DC", borderRadius: 8 }}
                    labelFormatter={(v) => { const p = String(v).split("-"); return `${p[2]}/${p[1]}/${p[0]}`; }}
                  />
                  <Legend />
                  <Bar dataKey="Veridiana" fill={VERI_COLOR} stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Thaisa" fill={THAISA_COLOR} stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Gabriel" fill={GABRIEL_COLOR} stackId="a" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-[10px] text-[#9B9590] mt-3">
                Cada barra = vendas pagas no dia, atribuidas pelo campo {""}
                <code className="bg-[#F9F8F6] px-1 rounded">leads.assigned_seller</code> da Supabase.
              </p>
            </div>
          )}

          {/* ═══ ATALHOS ═══ */}
          <div className="bg-white border border-[#E5E2DC] rounded-lg p-5 mb-10">
            <h3 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-3">PAGINAS INDIVIDUAIS</h3>
            <p className="text-xs text-[#9B9590] mb-4">
              Histórico de vendas, recompra, atribuição manual e comissão de cada vendedora.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <a href="/vendedoras/veri" className="flex items-center justify-between px-4 py-3 rounded-lg border border-[#E5E2DC] hover:border-[#C75028] transition-colors">
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: VERI_COLOR }} />
                  <div>
                    <p className="text-sm font-semibold">Veridiana</p>
                    <p className="text-[10px] text-[#9B9590]">{fmt(vendedoraStats.Veridiana.vendas)} vendas · {fmt(vendedoraStats.Veridiana.agendamentos)} agend.</p>
                  </div>
                </div>
                <span className="text-xs" style={{ color: VERI_COLOR }}>abrir &rarr;</span>
              </a>
              <a href="/vendedoras/thaisa" className="flex items-center justify-between px-4 py-3 rounded-lg border border-[#E5E2DC] hover:border-[#2563EB] transition-colors">
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: THAISA_COLOR }} />
                  <div>
                    <p className="text-sm font-semibold">Thaisa</p>
                    <p className="text-[10px] text-[#9B9590]">{fmt(vendedoraStats.Thaisa.vendas)} vendas · {fmt(vendedoraStats.Thaisa.agendamentos)} agend. {vendedoraStats.Gabriel.vendas > 0 ? `· ${fmt(vendedoraStats.Gabriel.vendas)} Gabriel` : ""}</p>
                  </div>
                </div>
                <span className="text-xs" style={{ color: THAISA_COLOR }}>abrir &rarr;</span>
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
