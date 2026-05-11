"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";

// ─── Tipos ────────────────────────────────────────────────────────────────
interface SaleRow {
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

// ─── Config ───────────────────────────────────────────────────────────────
const COMMISSION_PER_SALE = 30;

// Meta mensal por vendedora. Chave YYYY-MM. Quando o mês não estiver no
// mapa, cai no DEFAULT_MONTHLY_GOAL.
const MONTHLY_GOALS: Record<string, number> = {
  "2026-05": 40,
};
const DEFAULT_MONTHLY_GOAL = 40;

const VENDEDORAS = {
  veri: {
    display: "Veridiana",
    short: "Veri",
    initial: "V",
    color: "#C75028",
    colorDark: "#8E3717",
    match: ["Veridiana", "Veri"],
  },
  thaisa: {
    display: "Thaisa",
    short: "Thaisa",
    initial: "T",
    color: "#2563EB",
    colorDark: "#1D4ED8",
    match: ["Thaisa", "Gabriel"],
  },
} as const;

type VendedoraSlug = keyof typeof VENDEDORAS;

// ─── Helpers ──────────────────────────────────────────────────────────────
function fmtBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
}

function fmtPhone(raw: string) {
  const d = (raw || "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw || "—";
}

function phoneKey(raw: string) {
  const d = (raw || "").replace(/\D/g, "");
  return d.length >= 8 ? d.slice(-8) : d;
}

function fmtDateBR(iso: string) {
  if (!iso || iso === "—") return "—";
  const p = iso.slice(0, 10).split("-");
  if (p.length !== 3) return iso;
  return `${p[2]}/${p[1]}/${p[0]}`;
}

function whatsappLink(raw: string) {
  const d = (raw || "").replace(/\D/g, "");
  if (d.length < 10) return null;
  const withCountry = d.startsWith("55") ? d : `55${d}`;
  return `https://wa.me/${withCountry}`;
}

function daysSince(iso: string) {
  const d = new Date(iso + "T12:00:00");
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  return diff < 0 ? 0 : diff;
}

function relativeLabel(iso: string): string {
  const d = daysSince(iso);
  if (d === 0) return "hoje";
  if (d === 1) return "1 dia";
  if (d < 30) return `${d} dias`;
  if (d < 365) return `${Math.floor(d / 30)} m${Math.floor(d / 30) > 1 ? "eses" : "ês"}`;
  return `${Math.floor(d / 365)} ano${Math.floor(d / 365) > 1 ? "s" : ""}`;
}

function categorizeVendedor(raw: string | null | undefined): "veri" | "thaisa" | "gabriel" | "none" {
  if (!raw) return "none";
  const v = raw.trim().toLowerCase();
  if (!v) return "none";
  if (v === "veridiana" || v === "veri") return "veri";
  if (v === "thaisa") return "thaisa";
  if (v === "gabriel") return "gabriel";
  return "none";
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const WEEK_DAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

// ─── Tipo unificado da tabela ─────────────────────────────────────────────
interface UnifiedRow {
  key: string;
  leadId: string | null; // null se não veio do Supabase
  name: string;
  phone: string;
  date: string; // YYYY-MM-DD
  value: number;
  originalVendedor: string;
  status: "owned" | "reassigned" | "unassigned";
}

type SortOrder = "asc" | "desc";

const SELLER_SLUG_OPTIONS = [
  { slug: "veridiana", label: "Veridiana" },
  { slug: "thaisa", label: "Thaisa" },
  { slug: "gabriel", label: "Gabriel" },
  { slug: "jairo", label: "Jairo" },
] as const;

export default function VendedoraDetailPage() {
  const params = useParams<{ nome: string }>();
  const slug = (params?.nome || "").toLowerCase() as VendedoraSlug;
  const config = VENDEDORAS[slug];

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [progressionEnabled, setProgressionEnabled] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc"); // mais antigos no topo (recompra)
  const [calendarMonth, setCalendarMonth] = useState<{ year: number; month: number } | null>(null);
  const [showOnlyUnassigned, setShowOnlyUnassigned] = useState(false);
  const [assigningLeadId, setAssigningLeadId] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string>("");

  // Auth check
  useEffect(() => {
    fetch("/api/sales")
      .then((r) => setAuthed(r.ok))
      .catch(() => setAuthed(false));
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sales");
      if (res.status === 401) {
        setAuthed(false);
        return;
      }
      const json = await res.json();
      if (json.error) setError(json.error);
      else setSales(json.sales || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authed) loadData();
  }, [authed, loadData]);

  // ─── Atribuir vendedor manualmente (atualiza leads.assigned_seller) ─────
  const assignSeller = useCallback(
    async (leadId: string, newSlug: string | null) => {
      setAssigningLeadId(leadId);
      setAssignError("");
      // Optimistic: já atualiza localmente para resposta instantânea.
      const display = newSlug
        ? SELLER_SLUG_OPTIONS.find((o) => o.slug === newSlug)?.label ?? null
        : null;
      setSales((prev) =>
        prev.map((s) => (s.id === leadId ? { ...s, vendedor: display } : s)),
      );
      try {
        const res = await fetch("/api/sales/assign-seller", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId, slug: newSlug }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          setAssignError(json.error || `Falha ao salvar (${res.status})`);
          // Rollback: recarrega do servidor.
          await loadData();
        }
      } catch (e) {
        setAssignError(e instanceof Error ? e.message : String(e));
        await loadData();
      } finally {
        setAssigningLeadId(null);
      }
    },
    [loadData],
  );

  // ─── Construção dos rows (apenas Supabase / API local) ──────────────────
  // O endpoint /api/sales já resolve o vendedor via leads.assigned_seller
  // (Supabase) com fallback no campo "Vendedor(a)" do Kommo por telefone.
  // Por isso não precisamos de um segundo fetch no Kommo aqui.
  const unifiedRows: UnifiedRow[] = useMemo(() => {
    if (!config) return [];

    const map = new Map<string, UnifiedRow>();

    const include = (cat: ReturnType<typeof categorizeVendedor>): UnifiedRow["status"] | null => {
      // "sem vendedor" entra nas duas páginas
      if (cat === "none") return "unassigned";
      // Veri / Thaisa: pega leads do próprio nome
      if (slug === "veri" && cat === "veri") return "owned";
      // Thaisa: pega Thaisa direta e Gabriel transferido
      if (slug === "thaisa" && cat === "thaisa") return "owned";
      if (slug === "thaisa" && cat === "gabriel") return "reassigned";
      // ignora o restante (ex.: Veri não vê leads da Thaisa)
      return null;
    };

    for (const s of sales) {
      const cat = categorizeVendedor(s.vendedor);
      const status = include(cat);
      if (!status) continue;
      const value = s.order_value ? parseFloat(s.order_value) : 0;
      const k = phoneKey(s.phone) || `sys-${s.id}`;
      if (map.has(k)) continue;
      map.set(k, {
        key: k,
        leadId: s.id,
        name: s.name || "—",
        phone: s.phone || "",
        date: s.sale_date.slice(0, 10),
        value,
        originalVendedor: (s.vendedor || "").trim() || "—",
        status,
      });
    }

    return Array.from(map.values());
  }, [sales, slug, config]);

  // ─── Calendário (default = mês mais recente com venda) ──────────────────
  useEffect(() => {
    if (calendarMonth || unifiedRows.length === 0) return;
    const latest = unifiedRows.reduce((acc, r) => (r.date > acc ? r.date : acc), "");
    if (latest) {
      const [y, m] = latest.split("-").map(Number);
      setCalendarMonth({ year: y, month: m });
    } else {
      const now = new Date();
      setCalendarMonth({ year: now.getFullYear(), month: now.getMonth() + 1 });
    }
  }, [unifiedRows, calendarMonth]);

  const salesByDay = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    for (const r of unifiedRows) {
      if (!map[r.date]) map[r.date] = { count: 0, total: 0 };
      map[r.date].count += 1;
      map[r.date].total += r.value;
    }
    return map;
  }, [unifiedRows]);

  const calendarDays = useMemo(() => {
    if (!calendarMonth) return [] as Array<{ day: number | null; iso: string | null; count: number; total: number }>;
    const { year, month } = calendarMonth;
    const firstDay = new Date(year, month - 1, 1).getDay(); // 0 = domingo
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells: Array<{ day: number | null; iso: string | null; count: number; total: number }> = [];
    for (let i = 0; i < firstDay; i++) cells.push({ day: null, iso: null, count: 0, total: 0 });
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const stat = salesByDay[iso] || { count: 0, total: 0 };
      cells.push({ day: d, iso, count: stat.count, total: stat.total });
    }
    return cells;
  }, [calendarMonth, salesByDay]);

  function navMonth(delta: number) {
    if (!calendarMonth) return;
    let m = calendarMonth.month + delta;
    let y = calendarMonth.year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setCalendarMonth({ year: y, month: m });
  }

  // ─── Filtro + ordenação ─────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    let list = unifiedRows;
    if (showOnlyUnassigned) list = list.filter((r) => r.status === "unassigned");
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const qDigits = q.replace(/\D/g, "");
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (qDigits.length > 0 && r.phone.replace(/\D/g, "").includes(qDigits)),
      );
    }
    return [...list].sort((a, b) =>
      sortOrder === "asc" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date),
    );
  }, [unifiedRows, searchQuery, sortOrder, showOnlyUnassigned]);

  // ─── KPIs ────────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1; // 1-12
    const monthPrefix = `${curYear}-${String(curMonth).padStart(2, "0")}`;
    const isCurrentMonth = (iso: string) => iso.startsWith(monthPrefix);

    const ownedCount = unifiedRows.filter((r) => r.status === "owned").length;
    const reassigned = unifiedRows.filter((r) => r.status === "reassigned").length;
    const unassigned = unifiedRows.filter((r) => r.status === "unassigned").length;
    const total = unifiedRows.length;

    // Comissão e meta = R$ 30 × vendas próprias do MÊS ATUAL.
    // Vendas do Gabriel (status "reassigned") aparecem só na tabela para
    // recompra — não contam para a meta nem para a comissão da Thaisa.
    const monthRows = unifiedRows.filter(
      (r) => r.status === "owned" && isCurrentMonth(r.date),
    );
    const comissaoBase = monthRows.length;
    const comissao = comissaoBase * COMMISSION_PER_SALE;
    const faturamentoMes = monthRows.reduce((s, r) => s + r.value, 0);

    // Meta do mês — mesma para Veri e Thaisa
    const monthlyGoal = MONTHLY_GOALS[monthPrefix] ?? DEFAULT_MONTHLY_GOAL;
    const faltaParaMeta = Math.max(monthlyGoal - comissaoBase, 0);
    const progressoMeta = monthlyGoal > 0 ? Math.min((comissaoBase / monthlyGoal) * 100, 100) : 0;
    const metaBatida = comissaoBase >= monthlyGoal;

    return {
      total, ownedCount, reassigned, unassigned,
      comissao, comissaoBase, faturamentoMes,
      monthlyGoal, faltaParaMeta, progressoMeta, metaBatida,
      monthLabel: MONTH_NAMES[curMonth - 1],
      monthYear: curYear,
      monthPrefix,
    };
  }, [unifiedRows]);

  // ─── Render guards ──────────────────────────────────────────────────────
  if (!config) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-bold mb-2">Vendedora não encontrada</p>
          <p className="text-sm text-[#9B9590] mb-4">Use /vendedoras/veri ou /vendedoras/thaisa</p>
          <a href="/vendedoras" className="text-[#C75028] underline text-sm">← Voltar</a>
        </div>
      </div>
    );
  }

  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-[#9B9590]">Verificando autenticação…</p>
      </div>
    );
  }

  if (authed === false) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-bold mb-2">Não autenticado</p>
          <a href="/" className="text-[#C75028] underline text-sm">Voltar ao Dashboard e fazer login</a>
        </div>
      </div>
    );
  }

  const maxDayCount = calendarDays.reduce((m, d) => (d.count > m ? d.count : m), 0);

  return (
    <div className="min-h-screen bg-[#FAF8F4]">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* ═══ TOP NAV ═══ */}
        <div className="flex items-center justify-between mb-6 text-xs">
          <a href="/vendedoras" className="text-[#9B9590] hover:text-[#C75028] transition-colors">
            ← Painel Vendedoras
          </a>
          <div className="flex items-center gap-2">
            <a
              href={slug === "veri" ? "/vendedoras/thaisa" : "/vendedoras/veri"}
              className="px-3 py-1.5 font-medium border border-[#E5E2DC] rounded-lg bg-white hover:bg-[#F9F8F6] transition-colors"
            >
              Ver {slug === "veri" ? "Thaisa" : "Veri"} →
            </a>
            <a href="/" className="text-[#C75028] hover:underline">Dashboard</a>
          </div>
        </div>

        {/* ═══ HERO ═══ */}
        <div
          className="relative overflow-hidden rounded-3xl p-8 mb-6 text-white shadow-xl"
          style={{
            background: `linear-gradient(135deg, ${config.color} 0%, ${config.colorDark} 100%)`,
          }}
        >
          <div className="absolute -top-10 -right-10 w-56 h-56 rounded-full bg-white/10" />
          <div className="absolute -bottom-20 -left-10 w-72 h-72 rounded-full bg-white/5" />

          <div className="relative flex items-center justify-between gap-6 flex-wrap">
            <div className="flex items-center gap-5">
              <div
                className="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-4xl font-bold shadow-inner"
                style={{ textShadow: "0 2px 6px rgba(0,0,0,0.15)" }}
              >
                {config.initial}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] opacity-80 mb-1">VENDEDORA · SLIMA GROWTH</p>
                <h1 className="text-4xl font-bold leading-tight">{config.display}</h1>
                <p className="text-sm opacity-90 mt-1">
                  Histórico completo · use os telefones para iniciar a recompra
                </p>
              </div>
            </div>

            <div className="text-right">
              <p className="text-[11px] uppercase tracking-[0.2em] opacity-80">
                Comissão de {totals.monthLabel} {totals.monthYear}
              </p>
              <p className="text-4xl font-bold mt-1">{fmtBRL(totals.comissao)}</p>
              <p className="text-xs opacity-80 mt-1">
                {totals.comissaoBase} venda{totals.comissaoBase === 1 ? "" : "s"} no mês × R$ 30,00
              </p>
              <p className="text-[10px] opacity-70 mt-1">
                Faturamento do mês: {fmtBRL(totals.faturamentoMes)}
              </p>
            </div>
          </div>
        </div>

        {/* ═══ META DO MÊS ═══ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Meta + progresso (2 colunas) */}
          <div className="md:col-span-2 bg-white border border-[#E5E2DC] rounded-2xl p-6">
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <p className="text-[11px] uppercase tracking-widest font-medium" style={{ color: config.color }}>
                  META · {totals.monthLabel.toUpperCase()} {totals.monthYear}
                </p>
                <p className="text-xs text-[#9B9590] mt-0.5">
                  Cada vendedora tem meta de {totals.monthlyGoal} vendas em {totals.monthLabel}.
                  {slug === "thaisa" && (
                    <span className="block text-[10px] mt-0.5 text-[#9B9590]">
                      Vendas do Gabriel só aparecem na tabela (para recompra) — não contam para a meta.
                    </span>
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className="text-4xl font-bold leading-none">
                  {totals.comissaoBase}
                  <span className="text-2xl text-[#9B9590] font-normal"> / {totals.monthlyGoal}</span>
                </p>
                <p className="text-[10px] text-[#9B9590] mt-1 uppercase tracking-wide">vendas no mês</p>
              </div>
            </div>

            <div className="w-full bg-[#F0EDEA] rounded-full h-3 overflow-hidden">
              <div
                className="h-3 rounded-full transition-all duration-500"
                style={{
                  width: `${totals.progressoMeta}%`,
                  backgroundColor: totals.metaBatida ? "#059669" : config.color,
                }}
              />
            </div>
            <div className="flex justify-between mt-2 text-[11px]">
              <span className="text-[#6B6560]">
                {totals.progressoMeta.toFixed(0)}% concluído
              </span>
              <span className="text-[#6B6560]">
                {totals.metaBatida ? "🎯 Meta batida" : `Faltam ${totals.faltaParaMeta} venda${totals.faltaParaMeta === 1 ? "" : "s"}`}
              </span>
            </div>
          </div>

          {/* Card "Faltam X vendas" */}
          <div
            className="rounded-2xl p-6 text-white shadow-lg flex flex-col justify-between"
            style={{
              background: totals.metaBatida
                ? "linear-gradient(135deg, #059669 0%, #047857 100%)"
                : `linear-gradient(135deg, ${config.color} 0%, ${config.colorDark} 100%)`,
            }}
          >
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] opacity-80">
                {totals.metaBatida ? "Meta atingida" : "Faltam para a meta"}
              </p>
              <p className="text-6xl font-bold mt-2 leading-none">
                {totals.metaBatida ? totals.comissaoBase : totals.faltaParaMeta}
              </p>
              <p className="text-xs opacity-80 mt-2">
                {totals.metaBatida
                  ? `Você já bateu as ${totals.monthlyGoal} vendas de ${totals.monthLabel}!`
                  : `venda${totals.faltaParaMeta === 1 ? "" : "s"} até atingir ${totals.monthlyGoal} em ${totals.monthLabel}`}
              </p>
            </div>
            {!totals.metaBatida && totals.faltaParaMeta > 0 && (
              <p className="text-[10px] opacity-70 mt-3">
                Comissão restante: {fmtBRL(totals.faltaParaMeta * COMMISSION_PER_SALE)}
              </p>
            )}
          </div>
        </div>

        {/* Loading / Error */}
        {loading && (
          <div className="bg-white border border-[#E5E2DC] rounded-2xl p-10 text-center mb-6">
            <p className="text-sm text-[#9B9590]">Carregando dados…</p>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 mb-6">
            <p className="text-sm text-red-700"><span className="font-medium">Erro:</span> {error}</p>
          </div>
        )}
        {assignError && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-6 flex items-center justify-between">
            <p className="text-sm text-amber-800"><span className="font-medium">Atribuição falhou:</span> {assignError}</p>
            <button onClick={() => setAssignError("")} className="text-amber-700 hover:underline text-xs">Fechar</button>
          </div>
        )}

        {!loading && (
          <>
            {/* ═══ KPI ROW ═══ */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <button
                onClick={() => setShowOnlyUnassigned(false)}
                className={`text-left bg-white border rounded-2xl p-5 transition-all ${
                  !showOnlyUnassigned ? "border-[#1A1A1A] shadow-sm" : "border-[#E5E2DC] hover:border-[#9B9590]"
                }`}
              >
                <p className="text-[11px] text-[#9B9590] uppercase tracking-wide mb-1">Total na lista</p>
                <p className="text-3xl font-bold" style={{ color: config.color }}>{totals.total}</p>
                <p className="text-[10px] text-[#9B9590] mt-1">
                  {totals.ownedCount} próprias
                  {slug === "thaisa" && totals.reassigned > 0 && ` · ${totals.reassigned} Gabriel`}
                  {totals.unassigned > 0 && ` · ${totals.unassigned} sem vendedor`}
                </p>
              </button>

              <button
                onClick={() => setShowOnlyUnassigned((v) => !v)}
                className={`text-left bg-white border rounded-2xl p-5 transition-all ${
                  showOnlyUnassigned ? "border-amber-400 shadow-sm" : "border-[#E5E2DC] hover:border-amber-300"
                }`}
              >
                <p className="text-[11px] uppercase tracking-wide mb-1 text-amber-700">Sem vendedor</p>
                <p className="text-3xl font-bold text-amber-700">{totals.unassigned}</p>
                <p className="text-[10px] text-[#9B9590] mt-1">
                  {showOnlyUnassigned ? "filtrando…" : "clique para filtrar"}
                </p>
              </button>

              {/* Card de progressão (desligado) */}
              <div
                className={`border-2 border-dashed rounded-2xl p-5 transition-opacity ${
                  progressionEnabled ? "opacity-100 border-green-400" : "opacity-60 border-[#9B9590]"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[11px] uppercase tracking-wide font-medium text-[#6B6560]">
                    Progressão
                  </p>
                  <button
                    onClick={() => setProgressionEnabled((v) => !v)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      progressionEnabled ? "bg-green-500" : "bg-[#D6D2CC]"
                    }`}
                    aria-label="Ativar progressão de comissão"
                    title={progressionEnabled ? "Progressão ativa (preview)" : "Inativa — pode começar a valer"}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        progressionEnabled ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
                <p className="text-lg font-bold text-[#6B6560]">
                  {progressionEnabled ? "ativa (preview)" : "em breve"}
                </p>
                <p className="text-[10px] text-[#9B9590] mt-1">
                  Hoje: R$ 30/venda do mês. Ative quando regra entrar em vigor.
                </p>
              </div>
            </div>

            {/* ═══ CALENDÁRIO DE VENDAS ═══ */}
            {calendarMonth && (
              <div className="bg-white border border-[#E5E2DC] rounded-2xl p-6 mb-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-xs font-medium tracking-widest uppercase" style={{ color: config.color }}>
                      CALENDÁRIO DE VENDAS
                    </h3>
                    <p className="text-[11px] text-[#9B9590] mt-1">
                      Cada ponto representa uma venda registrada nesse dia.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => navMonth(-1)}
                      className="w-8 h-8 rounded-lg border border-[#E5E2DC] hover:bg-[#F9F8F6] transition-colors text-sm"
                      aria-label="Mês anterior"
                    >
                      ‹
                    </button>
                    <p className="text-sm font-semibold w-36 text-center">
                      {MONTH_NAMES[calendarMonth.month - 1]} {calendarMonth.year}
                    </p>
                    <button
                      onClick={() => navMonth(1)}
                      className="w-8 h-8 rounded-lg border border-[#E5E2DC] hover:bg-[#F9F8F6] transition-colors text-sm"
                      aria-label="Próximo mês"
                    >
                      ›
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1.5 mb-2">
                  {WEEK_DAYS.map((w, i) => (
                    <div key={i} className="text-[10px] font-semibold text-center text-[#9B9590] uppercase tracking-wider py-1">
                      {w}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {calendarDays.map((cell, i) => {
                    if (cell.day === null) {
                      return <div key={i} className="aspect-square" />;
                    }
                    const intensity = maxDayCount > 0 ? cell.count / maxDayCount : 0;
                    const hasSale = cell.count > 0;
                    return (
                      <div
                        key={i}
                        className={`aspect-square rounded-xl border flex flex-col items-center justify-center text-xs transition-all ${
                          hasSale
                            ? "border-transparent shadow-sm"
                            : "border-[#F0EDEA] bg-[#FAFAF8]"
                        }`}
                        style={hasSale ? {
                          backgroundColor: `${config.color}${Math.round(15 + intensity * 30).toString(16).padStart(2, "0")}`,
                        } : undefined}
                        title={hasSale ? `${cell.count} venda${cell.count > 1 ? "s" : ""} · ${fmtBRL(cell.total)}` : "Sem vendas"}
                      >
                        <span className={`font-semibold ${hasSale ? "text-[#1A1A1A]" : "text-[#9B9590]"}`}>
                          {cell.day}
                        </span>
                        {hasSale && (
                          <div className="flex gap-0.5 mt-0.5">
                            {Array.from({ length: Math.min(cell.count, 4) }).map((_, j) => (
                              <span
                                key={j}
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: config.color }}
                              />
                            ))}
                            {cell.count > 4 && (
                              <span className="text-[8px] font-bold ml-0.5" style={{ color: config.color }}>
                                +{cell.count - 4}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Mini legenda */}
                <div className="flex items-center justify-end gap-2 mt-4 text-[10px] text-[#9B9590]">
                  <span>menos</span>
                  {[0.15, 0.3, 0.5, 0.7, 1].map((op, i) => (
                    <span
                      key={i}
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: `${config.color}${Math.round(op * 80).toString(16).padStart(2, "0")}` }}
                    />
                  ))}
                  <span>mais</span>
                </div>
              </div>
            )}

            {/* ═══ TABELA DE HISTÓRICO ═══ */}
            <div className="bg-white border border-[#E5E2DC] rounded-2xl p-6 mb-10">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
                <div>
                  <h3 className="text-xs font-medium tracking-widest uppercase" style={{ color: config.color }}>
                    HISTÓRICO PARA RECOMPRA
                  </h3>
                  <p className="text-[11px] text-[#9B9590] mt-1 max-w-md">
                    Leads mais antigos no topo — esses são os principais alvos de recompra. Toque no WhatsApp para retomar a conversa. Linhas "sem vendedor" têm um dropdown na coluna Origem para você atribuir o cliente direto ao banco.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setSortOrder((s) => (s === "asc" ? "desc" : "asc"))}
                    className="px-3 py-1.5 text-xs font-medium border border-[#E5E2DC] rounded-lg bg-white hover:bg-[#F9F8F6] transition-colors inline-flex items-center gap-1.5"
                    title="Ordenar por data"
                  >
                    {sortOrder === "asc" ? "↑ Mais antigos primeiro" : "↓ Mais recentes primeiro"}
                  </button>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar nome ou telefone…"
                    className="px-3 py-1.5 text-sm border border-[#E5E2DC] rounded-lg focus:outline-none focus:border-[#C75028] w-56"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F9F8F6] border-b border-[#E5E2DC]">
                      <th className="text-left px-4 py-2.5 font-medium text-[#6B6560] text-[11px] uppercase tracking-wide">Cliente</th>
                      <th className="text-left px-4 py-2.5 font-medium text-[#6B6560] text-[11px] uppercase tracking-wide">Telefone</th>
                      <th className="text-left px-4 py-2.5 font-medium text-[#6B6560] text-[11px] uppercase tracking-wide">
                        Data {sortOrder === "asc" ? "↑" : "↓"}
                      </th>
                      <th className="text-right px-4 py-2.5 font-medium text-[#6B6560] text-[11px] uppercase tracking-wide">Valor</th>
                      <th className="text-left px-4 py-2.5 font-medium text-[#6B6560] text-[11px] uppercase tracking-wide">Origem</th>
                      <th className="text-left px-4 py-2.5 font-medium text-[#6B6560] text-[11px] uppercase tracking-wide">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-[#9B9590]">
                          {unifiedRows.length === 0
                            ? "Nenhuma venda registrada ainda."
                            : "Nenhum resultado para esse filtro."}
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((r) => {
                        const wa = whatsappLink(r.phone);
                        const days = daysSince(r.date);
                        const isRecompra = days >= 45;
                        const isCurrentMonth = r.date.startsWith(totals.monthPrefix);
                        const rowBg = isRecompra
                          ? "bg-rose-50/60 hover:bg-rose-50"
                          : isCurrentMonth
                          ? "bg-emerald-50/60 hover:bg-emerald-50"
                          : "hover:bg-[#F9F8F6]";
                        const rowAccent = isRecompra
                          ? "#E11D48"
                          : isCurrentMonth
                          ? "#059669"
                          : null;
                        const badgeStyle =
                          r.status === "reassigned"
                            ? { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", label: "Do Gabriel" }
                            : r.status === "unassigned"
                            ? { bg: "bg-[#F0EDEA]", text: "text-[#6B6560]", dot: "bg-[#9B9590]", label: "Sem vendedor" }
                            : {
                                bg: "",
                                text: "",
                                dot: "",
                                label: r.originalVendedor,
                              };
                        return (
                          <tr
                            key={r.key}
                            className={`border-b border-[#F0EDEA] transition-colors ${rowBg}`}
                            style={rowAccent ? { boxShadow: `inset 3px 0 0 0 ${rowAccent}` } : undefined}
                          >
                            <td className="px-4 py-3 font-medium">{r.name}</td>
                            <td className="px-4 py-3 text-[#6B6560] font-mono text-xs">{fmtPhone(r.phone)}</td>
                            <td className="px-4 py-3">
                              <p className="text-[#1A1A1A] text-xs">{fmtDateBR(r.date)}</p>
                              <p className={`text-[10px] font-medium`}
                                 style={{ color: rowAccent || "#9B9590" }}>
                                {isCurrentMonth
                                  ? "deste mês"
                                  : isRecompra
                                  ? `recompra · ${relativeLabel(r.date)}`
                                  : `${relativeLabel(r.date)} atrás`}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold">
                              {r.value > 0 ? fmtBRL(r.value) : "—"}
                            </td>
                            <td className="px-4 py-3">
                              {r.status === "unassigned" && r.leadId ? (
                                <div className="flex items-center gap-1.5">
                                  <select
                                    value=""
                                    disabled={assigningLeadId === r.leadId}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      if (v && r.leadId) assignSeller(r.leadId, v);
                                    }}
                                    className="px-2 py-1 text-[11px] border border-dashed border-[#9B9590] rounded bg-[#FAFAF8] text-[#6B6560] hover:bg-white hover:border-solid focus:outline-none focus:border-[#C75028] cursor-pointer transition-colors"
                                    title="Atribuir vendedor a este cliente"
                                  >
                                    <option value="" disabled>
                                      {assigningLeadId === r.leadId ? "Salvando…" : "+ Atribuir vendedor"}
                                    </option>
                                    {SELLER_SLUG_OPTIONS.map((opt) => (
                                      <option key={opt.slug} value={opt.slug}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ) : r.status === "owned" ? (
                                <span
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-medium rounded"
                                  style={{ backgroundColor: `${config.color}15`, color: config.color }}
                                >
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: config.color }} />
                                  {r.originalVendedor}
                                </span>
                              ) : (
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-medium rounded ${badgeStyle.bg} ${badgeStyle.text}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${badgeStyle.dot}`} />
                                  {badgeStyle.label}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {wa ? (
                                <a
                                  href={wa}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                                >
                                  WhatsApp →
                                </a>
                              ) : (
                                <span className="text-[11px] text-[#9B9590]">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {filteredRows.length > 0 && (
                    <tfoot>
                      <tr className="bg-[#FAFAF8] font-bold border-t-2 border-[#E5E2DC]">
                        <td className="px-4 py-3" colSpan={3}>
                          Total exibido ({filteredRows.length} venda{filteredRows.length > 1 ? "s" : ""})
                        </td>
                        <td className="px-4 py-3 text-right">
                          {fmtBRL(filteredRows.reduce((s, r) => s + r.value, 0))}
                        </td>
                        <td colSpan={2} className="px-4 py-3 text-[#6B6560] text-xs font-normal">
                          Comissão (próprias + transferidas): {fmtBRL(totals.comissao)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Legenda das cores */}
              <div className="flex flex-wrap items-center gap-4 mt-4 text-[11px] text-[#6B6560]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded bg-emerald-100 border border-emerald-300" />
                  Venda deste mês
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded bg-rose-100 border border-rose-300" />
                  Recompra · ≥ 45 dias sem comprar
                </span>
                <span className="inline-flex items-center gap-1.5 text-[#9B9590]">
                  <span className="inline-block w-3 h-3 rounded bg-white border border-[#E5E2DC]" />
                  Vendas anteriores
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
