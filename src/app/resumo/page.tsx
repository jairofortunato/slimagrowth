"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, Legend, PieChart, Pie, Cell,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Sale {
  id: string;
  name: string;
  phone: string;
  checkout_path: string;
  order_value: string | null;
  sale_date: string;
  is_affiliate: boolean;
  referring_afiliado_id: string | null;
  is_agendamento: boolean;
  vendedor: string | null;
}

interface ChannelFunnel {
  leadsCompleto: number;
  formAprovados: number;
  formRejeitados: number;
  consultasAgendadas: number;
  consultasFeitas: number;
}

interface SubChannelData {
  leads: number;
  leadsCompleto: number;
  formAprovados: number;
  formRejeitados: number;
  consultasAgendadas: number;
  consultasFeitas: number;
  agendamentos: number;
  vendas: number;
  faturamento: number;
}

interface Perf { won: number; lost: number; winRate: number; avgDays: number }
interface FunnelStage { id: number; name: string; veri: number; thaisa: number; gabriel?: number; total: number }
interface ActivityDay {
  date: string;
  veri: { msgs: number; calls: number; changes: number };
  thaisa: { msgs: number; calls: number; changes: number };
}
interface LeadDetail { kommoId: number; name: string; phone: string; price: number; createdAt: string; closedAt: string; vendedora: string }
interface KommoData {
  funnel: FunnelStage[];
  performance: { veri: Perf; thaisa: Perf; gabriel?: Perf; total: Perf };
  health: FunnelStage[];
  staleLeads: { veri: number; thaisa: number; gabriel?: number; total: number };
  overdueTasks: { veri: number; thaisa: number; total: number };
  activity: ActivityDay[];
  wonLeads: LeadDetail[];
  lostLeads: LeadDetail[];
}

interface DailySale {
  date: string;
  vendas: number;
  agendamentos: number;
  revenue: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const VERI_COLOR = "#C75028";
const THAISA_COLOR = "#2563EB";
const ADS_COLOR = "#C75028";
const AFILIADOS_COLOR = "#059669";
const TYPEBOT_COLOR = "#14B8A6";
const FORM_COLOR = "#2563EB";

function fmt(n: number) { return n.toLocaleString("pt-BR"); }
function fmtCurrency(n: number) { return `R$${n.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`; }
function fmtPct(n: number) { return `${n.toFixed(1)}%`; }
function fmtDays(n: number) { return n > 0 ? `${n.toFixed(1)}d` : "\u2014"; }
function fmtShort(d: string) { const p = d.split("-"); return `${p[2]}/${p[1]}`; }

// Normalize phone for cross-referencing: strip everything except digits, keep last 8-11 digits
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  // Brazilian phones: country(55) + DDD(2) + number(8-9) = 12-13 digits
  // We keep last 11 digits (DDD + number) for matching, or all if shorter
  if (digits.length >= 11) return digits.slice(-11);
  if (digits.length >= 8) return digits.slice(-digits.length);
  return digits;
}

interface MergedClient {
  // Supabase (sale) data
  saleId: string | null;
  name: string;
  phone: string;
  channel: "Ads" | "Afiliados";
  funnel: "Typebot" | "AG-Direto";
  tipo: "Venda" | "Agendamento";
  valor: number;
  dataPagamento: string;
  checkoutPath: string;
  // Kommo (CRM) data
  kommoMatch: boolean;
  kommoId: number | null;
  vendedora: string | null;
  kommoPrice: number;
  kmmoCriado: string | null;
  kmmoFechado: string | null;
}

function getCurrentMonthRange() {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

function getMonthLabel() {
  const months = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const now = new Date();
  return `${months[now.getMonth()]} ${now.getFullYear()}`;
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function ResumoPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Sales data
  const [sales, setSales] = useState<Sale[]>([]);
  const [dailySales, setDailySales] = useState<DailySale[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [channelLeads, setChannelLeads] = useState({ ads: 0, afiliados: 0, medicos: 0 });
  const [channelFunnel, setChannelFunnel] = useState<Record<string, ChannelFunnel>>({
    ads: { leadsCompleto: 0, formAprovados: 0, formRejeitados: 0, consultasAgendadas: 0, consultasFeitas: 0 },
    afiliados: { leadsCompleto: 0, formAprovados: 0, formRejeitados: 0, consultasAgendadas: 0, consultasFeitas: 0 },
  });
  const [adsSubLeads, setAdsSubLeads] = useState({ form: 0, typebot: 0 });
  const [adsSubFunnel, setAdsSubFunnel] = useState({
    form: { leadsCompleto: 0, formAprovados: 0, formRejeitados: 0, consultasAgendadas: 0, consultasFeitas: 0 },
    typebot: { leadsCompleto: 0, formAprovados: 0, formRejeitados: 0, consultasAgendadas: 0, consultasFeitas: 0 },
  });
  const [affiliateMap, setAffiliateMap] = useState<Record<string, { name: string; referral_code: string; commission_fixed_value: number | null; commission_percentage: number }>>({});

  // Kommo data
  const [kommo, setKommo] = useState<KommoData | null>(null);
  const [kommoError, setKommoError] = useState("");

  // Consultas vs Compras data
  const [consultasSummary, setConsultasSummary] = useState<{
    totalCompras: number; faturamento: number; pctConsultaPos: number;
    pctRecompra: number; taxaConversao: number; ticketMedio: number;
    preConsultBuyers: number; consultOnly: number;
  } | null>(null);

  // ── Fetch sales data ─────────────────────────────────────────────────────────
  const fetchSales = useCallback(async () => {
    const { from, to } = getCurrentMonthRange();
    const params = new URLSearchParams({ from, to });
    try {
      const res = await fetch(`/api/sales?${params}`);
      if (res.status === 401) { setAuthed(false); return; }
      const data = await res.json();
      setSales(data.sales || []);
      setDailySales(data.dailySales || []);
      setTotalRevenue(data.totalRevenue || 0);
      setChannelLeads(data.channelLeads || { ads: 0, afiliados: 0, medicos: 0 });
      if (data.channelFunnel) setChannelFunnel(data.channelFunnel);
      if (data.adsSubLeads) setAdsSubLeads(data.adsSubLeads);
      if (data.adsSubFunnel) setAdsSubFunnel(data.adsSubFunnel);
      if (data.affiliateMap) setAffiliateMap(data.affiliateMap);
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  }, []);

  // ── Fetch Kommo data ─────────────────────────────────────────────────────────
  const fetchKommo = useCallback(async () => {
    const { from, to } = getCurrentMonthRange();
    const params = new URLSearchParams({ from, to });
    try {
      const res = await fetch(`/api/kommo?${params}`);
      if (res.status === 401) return;
      const json = await res.json();
      if (json.error) { setKommoError(json.error); return; }
      setKommo(json);
    } catch (e: unknown) {
      setKommoError((e as Error).message);
    }
  }, []);

  // ── Fetch Consultas vs Compras ─────────────────────────────────────────────
  const fetchConsultas = useCallback(async () => {
    const { from, to } = getCurrentMonthRange();
    const params = new URLSearchParams({ from, to });
    try {
      const res = await fetch(`/api/consultas-compras?${params}`);
      if (res.ok) {
        const json = await res.json();
        if (json.summary) setConsultasSummary(json.summary);
      }
    } catch { /* ignore */ }
  }, []);

  // ── Auth check + initial fetch ───────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    fetch("/api/sales").then(r => {
      if (r.ok) {
        setAuthed(true);
        fetchSales();
        fetchKommo();
        fetchConsultas();
      } else {
        setAuthed(false);
      }
    }).catch(() => setAuthed(false)).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh every 5 min
  useEffect(() => {
    if (!authed) return;
    const iv = setInterval(() => { fetchSales(); fetchKommo(); }, 300000);
    return () => clearInterval(iv);
  }, [authed, fetchSales, fetchKommo]);

  // ── Derived data ─────────────────────────────────────────────────────────────

  // Channel-level sales
  const channelSales = useMemo(() => {
    const adsSales = sales.filter(s => !s.is_affiliate && s.checkout_path !== "prescription_checkout");
    const afSales = sales.filter(s => s.is_affiliate);
    return {
      ads: {
        vendas: adsSales.filter(s => !s.is_agendamento).length,
        agendamentos: adsSales.filter(s => s.is_agendamento).length,
        total: adsSales.length,
        faturamento: adsSales.reduce((sum, s) => sum + (s.order_value ? parseFloat(s.order_value) : 0), 0),
      },
      afiliados: {
        vendas: afSales.filter(s => !s.is_agendamento).length,
        agendamentos: afSales.filter(s => s.is_agendamento).length,
        total: afSales.length,
        faturamento: afSales.reduce((sum, s) => sum + (s.order_value ? parseFloat(s.order_value) : 0), 0),
      },
    };
  }, [sales]);

  // Sub-channel data (Typebot vs Form/AG-Direto)
  const subChannelData = useMemo((): { form: SubChannelData; typebot: SubChannelData } => {
    const formSales = sales.filter(s => !s.is_affiliate && s.checkout_path !== "prescription_checkout" && s.checkout_path !== "typebot" && s.checkout_path !== "agendamento");
    const typebotSales = sales.filter(s => s.checkout_path === "typebot" || s.checkout_path === "agendamento");
    return {
      form: {
        leads: adsSubLeads.form,
        leadsCompleto: adsSubFunnel.form.leadsCompleto,
        formAprovados: adsSubFunnel.form.formAprovados,
        formRejeitados: adsSubFunnel.form.formRejeitados,
        consultasAgendadas: adsSubFunnel.form.consultasAgendadas,
        consultasFeitas: adsSubFunnel.form.consultasFeitas,
        agendamentos: formSales.filter(s => s.is_agendamento).length,
        vendas: formSales.filter(s => !s.is_agendamento).length,
        faturamento: formSales.reduce((sum, s) => sum + (s.order_value ? parseFloat(s.order_value) : 0), 0),
      },
      typebot: {
        leads: adsSubLeads.typebot,
        leadsCompleto: adsSubFunnel.typebot.leadsCompleto,
        formAprovados: adsSubFunnel.typebot.formAprovados,
        formRejeitados: adsSubFunnel.typebot.formRejeitados,
        consultasAgendadas: adsSubFunnel.typebot.consultasAgendadas,
        consultasFeitas: adsSubFunnel.typebot.consultasFeitas,
        agendamentos: typebotSales.filter(s => s.is_agendamento).length,
        vendas: typebotSales.filter(s => !s.is_agendamento).length,
        faturamento: typebotSales.reduce((sum, s) => sum + (s.order_value ? parseFloat(s.order_value) : 0), 0),
      },
    };
  }, [sales, adsSubLeads, adsSubFunnel]);

  // Daily sales split by channel
  const dailyByChannel = useMemo(() => {
    const map: Record<string, { date: string; ads: number; afiliados: number; adsRev: number; afRev: number }> = {};
    for (const s of sales) {
      const day = s.sale_date.slice(0, 10);
      if (!map[day]) map[day] = { date: day, ads: 0, afiliados: 0, adsRev: 0, afRev: 0 };
      const val = s.order_value ? parseFloat(s.order_value) : 0;
      if (s.is_affiliate) { map[day].afiliados++; map[day].afRev += val; }
      else if (s.checkout_path !== "prescription_checkout") { map[day].ads++; map[day].adsRev += val; }
    }
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [sales]);

  // Daily sales split by sub-channel
  const dailyBySubChannel = useMemo(() => {
    const map: Record<string, { date: string; typebot: number; form: number }> = {};
    for (const s of sales) {
      if (s.is_affiliate || s.checkout_path === "prescription_checkout") continue;
      const day = s.sale_date.slice(0, 10);
      if (!map[day]) map[day] = { date: day, typebot: 0, form: 0 };
      if (s.checkout_path === "typebot" || s.checkout_path === "agendamento") map[day].typebot++;
      else map[day].form++;
    }
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [sales]);

  // Affiliate sales grouped by affiliate
  const affiliateSalesData = useMemo(() => {
    const afSales = sales.filter(s => s.is_affiliate && s.referring_afiliado_id);
    const grouped: Record<string, { afiliado: { id: string; name: string; code: string; commission: string }; clients: Sale[] }> = {};
    for (const s of afSales) {
      const aid = s.referring_afiliado_id!;
      if (!grouped[aid]) {
        const af = affiliateMap[aid];
        const commLabel = af
          ? (af.commission_percentage > 0 ? `${af.commission_percentage}%` : af.commission_fixed_value ? `R$${af.commission_fixed_value}` : "\u2014")
          : "\u2014";
        grouped[aid] = {
          afiliado: { id: aid, name: af?.name || aid.slice(0, 8), code: af?.referral_code || "\u2014", commission: commLabel },
          clients: [],
        };
      }
      grouped[aid].clients.push(s);
    }
    return Object.values(grouped).sort((a, b) => b.clients.length - a.clients.length);
  }, [sales, affiliateMap]);

  // Pie data: channel distribution
  const channelPie = useMemo(() => {
    return [
      { name: "Ads", value: channelSales.ads.total, color: ADS_COLOR },
      { name: "Afiliados", value: channelSales.afiliados.total, color: AFILIADOS_COLOR },
    ].filter(d => d.value > 0);
  }, [channelSales]);

  // Pie data: sub-channel distribution
  const subChannelPie = useMemo(() => {
    return [
      { name: "AG-Direto (Form)", value: subChannelData.form.vendas + subChannelData.form.agendamentos, color: FORM_COLOR },
      { name: "Typebot", value: subChannelData.typebot.vendas + subChannelData.typebot.agendamentos, color: TYPEBOT_COLOR },
    ].filter(d => d.value > 0);
  }, [subChannelData]);

  // Kommo: vendedoras won leads this month
  const vendedorasWon = useMemo(() => {
    if (!kommo) return { veri: [] as LeadDetail[], thaisa: [] as LeadDetail[], gabriel: [] as LeadDetail[] };
    return {
      veri: kommo.wonLeads.filter(l => l.vendedora === "Veridiana"),
      thaisa: kommo.wonLeads.filter(l => l.vendedora === "Thaisa"),
      gabriel: kommo.wonLeads.filter(l => l.vendedora === "Gabriel"),
    };
  }, [kommo]);

  // ── Cross-reference: Supabase sales ↔ Kommo leads by phone ───────────────
  const mergedClients = useMemo((): MergedClient[] => {
    // Build Kommo phone→lead index (won + lost)
    const kommoByPhone: Record<string, LeadDetail> = {};
    const kommoByName: Record<string, LeadDetail> = {};
    const allKommo = [...(kommo?.wonLeads || []), ...(kommo?.lostLeads || [])];
    for (const k of allKommo) {
      if (k.phone && k.phone !== "\u2014") {
        const norm = normalizePhone(k.phone);
        if (norm.length >= 8) kommoByPhone[norm] = k;
      }
      if (k.name && k.name !== "\u2014") {
        kommoByName[k.name.toLowerCase().trim()] = k;
      }
    }

    // Filter sales to Ads + Afiliados only
    const relevantSales = sales.filter(s => s.checkout_path !== "prescription_checkout");
    const usedKommoIds = new Set<number>();

    const merged: MergedClient[] = relevantSales.map(s => {
      const channel: "Ads" | "Afiliados" = s.is_affiliate ? "Afiliados" : "Ads";
      const funnel: "Typebot" | "AG-Direto" = (s.checkout_path === "typebot" || s.checkout_path === "agendamento") ? "Typebot" : "AG-Direto";
      const tipo: "Venda" | "Agendamento" = s.is_agendamento ? "Agendamento" : "Venda";
      const valor = s.order_value ? parseFloat(s.order_value) : 0;

      // Try to match by phone first, then by name
      let match: LeadDetail | null = null;
      if (s.phone) {
        const norm = normalizePhone(s.phone);
        if (norm.length >= 8 && kommoByPhone[norm]) {
          match = kommoByPhone[norm];
        }
      }
      if (!match && s.name) {
        const normName = s.name.toLowerCase().trim();
        if (kommoByName[normName]) {
          match = kommoByName[normName];
        }
      }

      if (match) usedKommoIds.add(match.kommoId);

      return {
        saleId: s.id,
        name: s.name,
        phone: s.phone || "\u2014",
        channel,
        funnel,
        tipo,
        valor,
        dataPagamento: s.sale_date.slice(0, 10),
        checkoutPath: s.checkout_path,
        kommoMatch: !!match,
        kommoId: match?.kommoId || null,
        // Prefer assigned_seller (Supabase) → Kommo Vendedor(a) field via /api/sales,
        // and only fall back to the Kommo phone-match attribution.
        vendedora: s.vendedor || match?.vendedora || null,
        kommoPrice: match?.price || 0,
        kmmoCriado: match?.createdAt || null,
        kmmoFechado: match?.closedAt || null,
      };
    });

    // Add Kommo won leads that didn't match any Supabase sale (CRM-only wins)
    for (const k of kommo?.wonLeads || []) {
      if (usedKommoIds.has(k.kommoId)) continue;
      merged.push({
        saleId: null,
        name: k.name,
        phone: k.phone,
        channel: "Ads",
        funnel: "AG-Direto",
        tipo: "Venda",
        valor: 0,
        dataPagamento: k.closedAt !== "\u2014" ? k.closedAt : "\u2014",
        checkoutPath: "\u2014",
        kommoMatch: true,
        kommoId: k.kommoId,
        vendedora: k.vendedora,
        kommoPrice: k.price,
        kmmoCriado: k.createdAt,
        kmmoFechado: k.closedAt,
      });
    }

    // Sort: most recent first
    return merged.sort((a, b) => (b.dataPagamento || "").localeCompare(a.dataPagamento || ""));
  }, [sales, kommo]);

  // Cross-reference stats
  const matchStats = useMemo(() => {
    const total = mergedClients.length;
    const matched = mergedClients.filter(c => c.kommoMatch).length;
    const unmatched = total - matched;
    const kommoOnly = mergedClients.filter(c => c.saleId === null).length;
    return { total, matched, unmatched, kommoOnly };
  }, [mergedClients]);

  // Search filter for the table
  const [clientSearch, setClientSearch] = useState("");
  const [filterChannel, setFilterChannel] = useState<"all" | "Ads" | "Afiliados">("all");
  const [filterVendedora, setFilterVendedora] = useState<"all" | "Veridiana" | "Thaisa" | "Gabriel" | "sem">("all");

  const filteredClients = useMemo(() => {
    let list = mergedClients;
    if (filterChannel !== "all") list = list.filter(c => c.channel === filterChannel);
    if (filterVendedora === "Veridiana") list = list.filter(c => c.vendedora === "Veridiana");
    else if (filterVendedora === "Thaisa") list = list.filter(c => c.vendedora === "Thaisa");
    else if (filterVendedora === "Gabriel") list = list.filter(c => c.vendedora === "Gabriel");
    else if (filterVendedora === "sem") list = list.filter(c => !c.vendedora);
    if (clientSearch) {
      const q = clientSearch.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q));
    }
    return list;
  }, [mergedClients, filterChannel, filterVendedora, clientSearch]);

  // Funnel comparison data for bar chart
  const funnelCompare = useMemo(() => {
    if (!channelFunnel.ads || !channelFunnel.afiliados) return [];
    return [
      { stage: "Leads", Ads: channelLeads.ads, Afiliados: channelLeads.afiliados },
      { stage: "Completos", Ads: channelFunnel.ads.leadsCompleto, Afiliados: channelFunnel.afiliados.leadsCompleto },
      { stage: "Aprovados", Ads: channelFunnel.ads.formAprovados, Afiliados: channelFunnel.afiliados.formAprovados },
      { stage: "Consultas", Ads: channelFunnel.ads.consultasAgendadas, Afiliados: channelFunnel.afiliados.consultasAgendadas },
      { stage: "Vendas", Ads: channelSales.ads.total, Afiliados: channelSales.afiliados.total },
    ];
  }, [channelLeads, channelFunnel, channelSales]);

  // Sub-channel funnel comparison
  const subFunnelCompare = useMemo(() => {
    return [
      { stage: "Leads", "AG-Direto": subChannelData.form.leads, Typebot: subChannelData.typebot.leads },
      { stage: "Completos", "AG-Direto": subChannelData.form.leadsCompleto, Typebot: subChannelData.typebot.leadsCompleto },
      { stage: "Aprovados", "AG-Direto": subChannelData.form.formAprovados, Typebot: subChannelData.typebot.formAprovados },
      { stage: "Consultas", "AG-Direto": subChannelData.form.consultasAgendadas, Typebot: subChannelData.typebot.consultasAgendadas },
      { stage: "Vendas", "AG-Direto": subChannelData.form.vendas + subChannelData.form.agendamentos, Typebot: subChannelData.typebot.vendas + subChannelData.typebot.agendamentos },
    ];
  }, [subChannelData]);

  // Total vendas (ads + afiliados only)
  const totalVendas = channelSales.ads.vendas + channelSales.afiliados.vendas;
  const totalAgendamentos = channelSales.ads.agendamentos + channelSales.afiliados.agendamentos;
  const totalFaturamento = channelSales.ads.faturamento + channelSales.afiliados.faturamento;

  // ── Render ───────────────────────────────────────────────────────────────────

  if (authed === null || loading) {
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
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-8">
        <div>
          <p className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-1">SLIMA GROWTH</p>
          <h1 className="text-3xl font-bold">Resumo do Mes</h1>
          <p className="text-sm text-[#9B9590] mt-1">{getMonthLabel()} &mdash; Ads &amp; Afiliados</p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/" className="px-3 py-1.5 text-xs font-medium border border-[#E5E2DC] rounded-lg hover:bg-[#F9F8F6] transition-colors">Dashboard</a>
          <a href="/vendedoras" className="px-3 py-1.5 text-xs font-medium border border-[#E5E2DC] rounded-lg hover:bg-[#F9F8F6] transition-colors">Vendedoras</a>
          <a href="/consultas" className="px-3 py-1.5 text-xs font-medium border border-[#E5E2DC] rounded-lg hover:bg-[#F9F8F6] transition-colors">Consultas</a>
        </div>
      </div>

      {/* Error banners */}
      {(error || kommoError) && (
        <div className="space-y-2 mb-6">
          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3"><p className="text-sm text-red-700"><span className="font-medium">Erro:</span> {error}</p></div>}
          {kommoError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3"><p className="text-sm text-red-700"><span className="font-medium">Kommo:</span> {kommoError}</p></div>}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 1: KPIs GERAIS DO MES                                         */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
          <p className="text-[10px] text-[#9B9590] uppercase tracking-wide mb-1">Vendas (Ads+Afiliados)</p>
          <p className="text-3xl font-bold">{totalVendas}</p>
          <p className="text-xs text-[#9B9590] mt-1">+ {totalAgendamentos} agendamentos</p>
        </div>
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
          <p className="text-[10px] text-[#9B9590] uppercase tracking-wide mb-1">Faturamento</p>
          <p className="text-3xl font-bold">{fmtCurrency(totalFaturamento)}</p>
          <p className="text-xs text-[#9B9590] mt-1">ticket medio {totalVendas + totalAgendamentos > 0 ? fmtCurrency(totalFaturamento / (totalVendas + totalAgendamentos)) : "—"}</p>
        </div>
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
          <p className="text-[10px] text-[#9B9590] uppercase tracking-wide mb-1">Leads (Ads+Afiliados)</p>
          <p className="text-3xl font-bold">{fmt(channelLeads.ads + channelLeads.afiliados)}</p>
          <p className="text-xs text-[#9B9590] mt-1">
            conv. {(channelLeads.ads + channelLeads.afiliados) > 0 ? fmtPct(((totalVendas + totalAgendamentos) / (channelLeads.ads + channelLeads.afiliados)) * 100) : "—"}
          </p>
        </div>
        {kommo && (
          <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
            <p className="text-[10px] text-[#9B9590] uppercase tracking-wide mb-1">Vendedoras (Ganhos)</p>
            <p className="text-3xl font-bold">{kommo.performance.total.won}</p>
            <p className="text-xs text-[#9B9590] mt-1">win rate {fmtPct(kommo.performance.total.winRate)}</p>
          </div>
        )}
      </div>

      {/* ═══ Consultas vs Compras KPIs ═══ */}
      {consultasSummary && (
        <>
          <h2 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-4">CONSULTAS VS COMPRAS</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
              <p className="text-[10px] text-[#9B9590] uppercase tracking-wide mb-1">Consulta Pos-Compra</p>
              <p className="text-3xl font-bold">{fmtPct(consultasSummary.pctConsultaPos)}</p>
            </div>
            <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
              <p className="text-[10px] text-[#9B9590] uppercase tracking-wide mb-1">Recompra</p>
              <p className="text-3xl font-bold">{fmtPct(consultasSummary.pctRecompra)}</p>
            </div>
            <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
              <p className="text-[10px] text-[#9B9590] uppercase tracking-wide mb-1">Conv. Pos-Consulta</p>
              <p className="text-3xl font-bold text-[#C75028]">{fmtPct(consultasSummary.taxaConversao)}</p>
              <p className="text-xs text-[#9B9590] mt-1">{consultasSummary.preConsultBuyers} conv / {consultasSummary.preConsultBuyers + consultasSummary.consultOnly} consultas</p>
            </div>
            <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
              <p className="text-[10px] text-[#9B9590] uppercase tracking-wide mb-1">So Consultaram</p>
              <p className="text-3xl font-bold text-[#9B9590]">{consultasSummary.consultOnly}</p>
              <p className="text-xs text-[#9B9590] mt-1">sem compra no periodo</p>
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 2: CANAIS — ADS vs AFILIADOS                                  */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <h2 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-4">CANAIS: ADS VS AFILIADOS</h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Ads Card */}
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: ADS_COLOR }} />
            <h3 className="text-sm font-bold">Ads</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-[#9B9590] uppercase">Vendas</p>
              <p className="text-2xl font-bold">{channelSales.ads.vendas}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#9B9590] uppercase">Agendamentos</p>
              <p className="text-2xl font-bold text-[#14B8A6]">{channelSales.ads.agendamentos}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#9B9590] uppercase">Faturamento</p>
              <p className="text-lg font-bold">{fmtCurrency(channelSales.ads.faturamento)}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#9B9590] uppercase">Leads</p>
              <p className="text-lg font-bold">{fmt(channelLeads.ads)}</p>
            </div>
          </div>
        </div>

        {/* Afiliados Card */}
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: AFILIADOS_COLOR }} />
            <h3 className="text-sm font-bold">Afiliados</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-[#9B9590] uppercase">Vendas</p>
              <p className="text-2xl font-bold">{channelSales.afiliados.vendas}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#9B9590] uppercase">Agendamentos</p>
              <p className="text-2xl font-bold text-[#14B8A6]">{channelSales.afiliados.agendamentos}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#9B9590] uppercase">Faturamento</p>
              <p className="text-lg font-bold">{fmtCurrency(channelSales.afiliados.faturamento)}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#9B9590] uppercase">Leads</p>
              <p className="text-lg font-bold">{fmt(channelLeads.afiliados)}</p>
            </div>
          </div>
        </div>

        {/* Channel Pie */}
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
          <h3 className="text-xs font-medium tracking-widest uppercase text-[#6B6560] mb-3">DISTRIBUICAO</h3>
          {channelPie.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={channelPie} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                    {channelPie.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, border: "1px solid #E5E2DC", borderRadius: 8 }} formatter={(v) => [fmt(v as number), "Vendas"]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {channelPie.map(d => {
                  const total = channelPie.reduce((s, x) => s + x.value, 0);
                  return (
                    <div key={d.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                        <span className="text-[#6B6560]">{d.name}</span>
                      </div>
                      <span className="font-medium">{fmt(d.value)} <span className="text-[#9B9590] font-normal">({total > 0 ? fmtPct((d.value / total) * 100) : "0%"})</span></span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-sm text-[#9B9590] text-center py-8">Sem dados</p>
          )}
        </div>
      </div>

      {/* Funnel Comparison: Ads vs Afiliados */}
      {funnelCompare.length > 0 && (
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-5 mb-8">
          <h3 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-4">FUNIL: ADS VS AFILIADOS</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={funnelCompare} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EDEA" />
              <XAxis dataKey="stage" tick={{ fontSize: 12, fill: "#6B6560" }} />
              <YAxis tick={{ fontSize: 11, fill: "#9B9590" }} />
              <Tooltip contentStyle={{ fontSize: 12, border: "1px solid #E5E2DC", borderRadius: 8 }} />
              <Legend />
              <Bar dataKey="Ads" fill={ADS_COLOR} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Afiliados" fill={AFILIADOS_COLOR} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          {/* Conversion table */}
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F9F8F6] border-b border-[#E5E2DC]">
                  <th className="text-left px-3 py-2 font-medium text-[#6B6560]">Etapa</th>
                  <th className="text-center px-3 py-2 font-medium" style={{ color: ADS_COLOR }}>Ads</th>
                  <th className="text-center px-3 py-2 font-medium text-[#9B9590]">Conv.</th>
                  <th className="text-center px-3 py-2 font-medium" style={{ color: AFILIADOS_COLOR }}>Afiliados</th>
                  <th className="text-center px-3 py-2 font-medium text-[#9B9590]">Conv.</th>
                </tr>
              </thead>
              <tbody>
                {funnelCompare.map((row, idx) => {
                  const prevAds = idx > 0 ? funnelCompare[idx - 1].Ads : 0;
                  const prevAf = idx > 0 ? funnelCompare[idx - 1].Afiliados : 0;
                  const convAds = prevAds > 0 ? (row.Ads / prevAds) * 100 : 0;
                  const convAf = prevAf > 0 ? (row.Afiliados / prevAf) * 100 : 0;
                  return (
                    <tr key={row.stage} className="border-b border-[#F0EDEA] hover:bg-[#F9F8F6]">
                      <td className="px-3 py-2 text-xs font-medium">{row.stage}</td>
                      <td className="px-3 py-2 text-center text-xs font-bold">{fmt(row.Ads)}</td>
                      <td className="px-3 py-2 text-center text-xs text-[#9B9590]">{idx > 0 ? fmtPct(convAds) : "\u2014"}</td>
                      <td className="px-3 py-2 text-center text-xs font-bold">{fmt(row.Afiliados)}</td>
                      <td className="px-3 py-2 text-center text-xs text-[#9B9590]">{idx > 0 ? fmtPct(convAf) : "\u2014"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Daily Sales by Channel */}
      {dailyByChannel.length > 0 && (
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-5 mb-8">
          <h3 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-4">VENDAS DIARIAS POR CANAL</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={dailyByChannel} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EDEA" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9B9590" }} tickFormatter={fmtShort} />
              <YAxis tick={{ fontSize: 11, fill: "#9B9590" }} />
              <Tooltip
                contentStyle={{ fontSize: 12, border: "1px solid #E5E2DC", borderRadius: 8 }}
                labelFormatter={(v) => { const p = String(v).split("-"); return `${p[2]}/${p[1]}/${p[0]}`; }}
              />
              <Legend />
              <Bar dataKey="ads" name="Ads" fill={ADS_COLOR} radius={[3, 3, 0, 0]} stackId="a" />
              <Bar dataKey="afiliados" name="Afiliados" fill={AFILIADOS_COLOR} radius={[3, 3, 0, 0]} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 2B: VENDAS POR AFILIADO                                       */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {affiliateSalesData.length > 0 && (
        <>
          <h2 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-4">VENDAS POR AFILIADO</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {affiliateSalesData.map(({ afiliado, clients }) => {
              const totalVal = clients.reduce((s, c) => s + (c.order_value ? parseFloat(c.order_value) : 0), 0);
              const vendas = clients.filter(c => !c.is_agendamento).length;
              const agendamentos = clients.filter(c => c.is_agendamento).length;
              return (
                <div key={afiliado.id} className="bg-white border border-[#E5E2DC] rounded-lg p-5">
                  {/* Affiliate header */}
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-bold">{afiliado.name}</h3>
                      <p className="text-[10px] text-[#9B9590]">@{afiliado.code}</p>
                    </div>
                    <div className="text-right">
                      <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded bg-[#05966915] text-[#059669]">
                        comissao: {afiliado.commission}
                      </span>
                    </div>
                  </div>
                  {/* KPIs */}
                  <div className="grid grid-cols-3 gap-2 mb-3 pb-3 border-b border-[#F0EDEA]">
                    <div className="text-center">
                      <p className="text-[10px] text-[#9B9590] uppercase">Vendas</p>
                      <p className="text-lg font-bold">{vendas}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-[#9B9590] uppercase">Agend.</p>
                      <p className="text-lg font-bold text-[#14B8A6]">{agendamentos}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-[#9B9590] uppercase">Faturamento</p>
                      <p className="text-lg font-bold">{fmtCurrency(totalVal)}</p>
                    </div>
                  </div>
                  {/* Client list */}
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {clients.map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-[#F9F8F6]">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{c.name}</p>
                          <p className="text-[10px] text-[#9B9590]">{c.phone || "\u2014"} &middot; {fmtShort(c.sale_date.slice(0, 10))}</p>
                        </div>
                        <div className="text-right ml-2 flex-shrink-0">
                          <p className="font-medium">{c.order_value ? fmtCurrency(parseFloat(c.order_value)) : "\u2014"}</p>
                          <p className="text-[10px]">
                            {c.is_agendamento
                              ? <span className="text-[#14B8A6]">agend.</span>
                              : <span className="text-[#1A1A1A]">venda</span>
                            }
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 3: FUNIS — TYPEBOT vs AG-DIRETO (FORM)                        */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <h2 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-4">FUNIS: TYPEBOT VS AG-DIRETO (FORM)</h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Typebot Card */}
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: TYPEBOT_COLOR }} />
            <h3 className="text-sm font-bold">Typebot</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-[#9B9590] uppercase">Vendas</p>
              <p className="text-2xl font-bold">{subChannelData.typebot.vendas}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#9B9590] uppercase">Agendamentos</p>
              <p className="text-2xl font-bold text-[#14B8A6]">{subChannelData.typebot.agendamentos}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#9B9590] uppercase">Faturamento</p>
              <p className="text-lg font-bold">{fmtCurrency(subChannelData.typebot.faturamento)}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#9B9590] uppercase">Leads</p>
              <p className="text-lg font-bold">{fmt(subChannelData.typebot.leads)}</p>
            </div>
          </div>
        </div>

        {/* AG-Direto Card */}
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: FORM_COLOR }} />
            <h3 className="text-sm font-bold">AG-Direto (Form)</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-[#9B9590] uppercase">Vendas</p>
              <p className="text-2xl font-bold">{subChannelData.form.vendas}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#9B9590] uppercase">Agendamentos</p>
              <p className="text-2xl font-bold text-[#14B8A6]">{subChannelData.form.agendamentos}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#9B9590] uppercase">Faturamento</p>
              <p className="text-lg font-bold">{fmtCurrency(subChannelData.form.faturamento)}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#9B9590] uppercase">Leads</p>
              <p className="text-lg font-bold">{fmt(subChannelData.form.leads)}</p>
            </div>
          </div>
        </div>

        {/* Sub-channel Pie */}
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
          <h3 className="text-xs font-medium tracking-widest uppercase text-[#6B6560] mb-3">DISTRIBUICAO FUNIS</h3>
          {subChannelPie.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={subChannelPie} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                    {subChannelPie.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, border: "1px solid #E5E2DC", borderRadius: 8 }} formatter={(v) => [fmt(v as number), "Vendas"]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {subChannelPie.map(d => {
                  const total = subChannelPie.reduce((s, x) => s + x.value, 0);
                  return (
                    <div key={d.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                        <span className="text-[#6B6560]">{d.name}</span>
                      </div>
                      <span className="font-medium">{fmt(d.value)} <span className="text-[#9B9590] font-normal">({total > 0 ? fmtPct((d.value / total) * 100) : "0%"})</span></span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-sm text-[#9B9590] text-center py-8">Sem dados</p>
          )}
        </div>
      </div>

      {/* Sub-channel Funnel Comparison */}
      <div className="bg-white border border-[#E5E2DC] rounded-lg p-5 mb-8">
        <h3 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-4">FUNIL: TYPEBOT VS AG-DIRETO</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={subFunnelCompare} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0EDEA" />
            <XAxis dataKey="stage" tick={{ fontSize: 12, fill: "#6B6560" }} />
            <YAxis tick={{ fontSize: 11, fill: "#9B9590" }} />
            <Tooltip contentStyle={{ fontSize: 12, border: "1px solid #E5E2DC", borderRadius: 8 }} />
            <Legend />
            <Bar dataKey="Typebot" fill={TYPEBOT_COLOR} radius={[4, 4, 0, 0]} />
            <Bar dataKey="AG-Direto" fill={FORM_COLOR} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        {/* Conversion table */}
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F9F8F6] border-b border-[#E5E2DC]">
                <th className="text-left px-3 py-2 font-medium text-[#6B6560]">Etapa</th>
                <th className="text-center px-3 py-2 font-medium" style={{ color: TYPEBOT_COLOR }}>Typebot</th>
                <th className="text-center px-3 py-2 font-medium text-[#9B9590]">Conv.</th>
                <th className="text-center px-3 py-2 font-medium" style={{ color: FORM_COLOR }}>AG-Direto</th>
                <th className="text-center px-3 py-2 font-medium text-[#9B9590]">Conv.</th>
              </tr>
            </thead>
            <tbody>
              {subFunnelCompare.map((row, idx) => {
                const prevT = idx > 0 ? subFunnelCompare[idx - 1].Typebot : 0;
                const prevF = idx > 0 ? subFunnelCompare[idx - 1]["AG-Direto"] : 0;
                const convT = prevT > 0 ? (row.Typebot / prevT) * 100 : 0;
                const convF = prevF > 0 ? (row["AG-Direto"] / prevF) * 100 : 0;
                return (
                  <tr key={row.stage} className="border-b border-[#F0EDEA] hover:bg-[#F9F8F6]">
                    <td className="px-3 py-2 text-xs font-medium">{row.stage}</td>
                    <td className="px-3 py-2 text-center text-xs font-bold">{fmt(row.Typebot)}</td>
                    <td className="px-3 py-2 text-center text-xs text-[#9B9590]">{idx > 0 ? fmtPct(convT) : "\u2014"}</td>
                    <td className="px-3 py-2 text-center text-xs font-bold">{fmt(row["AG-Direto"])}</td>
                    <td className="px-3 py-2 text-center text-xs text-[#9B9590]">{idx > 0 ? fmtPct(convF) : "\u2014"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Daily Sub-channel Chart */}
      {dailyBySubChannel.length > 0 && (
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-5 mb-8">
          <h3 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-4">VENDAS DIARIAS: TYPEBOT VS AG-DIRETO</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={dailyBySubChannel} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EDEA" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9B9590" }} tickFormatter={fmtShort} />
              <YAxis tick={{ fontSize: 11, fill: "#9B9590" }} />
              <Tooltip
                contentStyle={{ fontSize: 12, border: "1px solid #E5E2DC", borderRadius: 8 }}
                labelFormatter={(v) => { const p = String(v).split("-"); return `${p[2]}/${p[1]}/${p[0]}`; }}
              />
              <Legend />
              <Bar dataKey="typebot" name="Typebot" fill={TYPEBOT_COLOR} radius={[3, 3, 0, 0]} stackId="a" />
              <Bar dataKey="form" name="AG-Direto" fill={FORM_COLOR} radius={[3, 3, 0, 0]} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 4: VENDEDORAS — VERI, THAISA & GABRIEL                        */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <h2 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-4">VENDEDORAS: VERI, THAISA &amp; GABRIEL</h2>

      {kommo ? (
        <>
          {/* Performance Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Veridiana", color: VERI_COLOR, p: kommo.performance.veri, won: vendedorasWon.veri.length },
              { label: "Thaisa", color: THAISA_COLOR, p: kommo.performance.thaisa, won: vendedorasWon.thaisa.length },
              { label: "Gabriel", color: "#059669", p: kommo.performance.gabriel ?? { won: 0, lost: 0, winRate: 0, avgDays: 0 }, won: vendedorasWon.gabriel.length },
              { label: "Total", color: "#1A1A1A", p: kommo.performance.total, won: kommo.wonLeads.length },
            ].map(({ label, color, p, won }) => (
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

          {/* Vendedoras Funnel Bar Chart */}
          {kommo.funnel.length > 0 && (
            <div className="bg-white border border-[#E5E2DC] rounded-lg p-5 mb-6">
              <h3 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-4">FUNIL POR VENDEDORA</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={kommo.funnel.map(s => ({ name: s.name, Veridiana: s.veri, Thaisa: s.thaisa, Gabriel: s.gabriel || 0 }))}
                  layout="vertical"
                  margin={{ left: 10, right: 20, top: 5, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0EDEA" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#9B9590" }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#6B6560" }} width={120} />
                  <Tooltip contentStyle={{ fontSize: 12, border: "1px solid #E5E2DC", borderRadius: 8 }} />
                  <Legend />
                  <Bar dataKey="Veridiana" fill={VERI_COLOR} radius={[0, 3, 3, 0]} />
                  <Bar dataKey="Thaisa" fill={THAISA_COLOR} radius={[0, 3, 3, 0]} />
                  <Bar dataKey="Gabriel" fill="#059669" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Activity Chart */}
          {kommo.activity.length > 0 && (
            <div className="bg-white border border-[#E5E2DC] rounded-lg p-5 mb-6">
              <h3 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-4">ATIVIDADE DIARIA</h3>
              {/* Activity totals */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {(() => {
                  const totals = kommo.activity.reduce((acc, d) => ({
                    vMsgs: acc.vMsgs + d.veri.msgs, vCalls: acc.vCalls + d.veri.calls,
                    tMsgs: acc.tMsgs + d.thaisa.msgs, tCalls: acc.tCalls + d.thaisa.calls,
                  }), { vMsgs: 0, vCalls: 0, tMsgs: 0, tCalls: 0 });
                  return [
                    { label: "Msgs Veri", val: totals.vMsgs, color: VERI_COLOR },
                    { label: "Msgs Thaisa", val: totals.tMsgs, color: THAISA_COLOR },
                    { label: "Ligacoes Veri", val: totals.vCalls, color: VERI_COLOR },
                    { label: "Ligacoes Thaisa", val: totals.tCalls, color: THAISA_COLOR },
                  ].map(({ label, val, color }) => (
                    <div key={label} className="bg-[#F9F8F6] rounded-lg p-3 text-center">
                      <p className="text-[10px] text-[#9B9590] uppercase mb-0.5">{label}</p>
                      <p className="text-xl font-bold" style={{ color }}>{fmt(val)}</p>
                    </div>
                  ));
                })()}
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart
                  data={kommo.activity.map(d => ({
                    date: d.date,
                    veriMsgs: d.veri.msgs, thaisaMsgs: d.thaisa.msgs,
                    veriCalls: d.veri.calls, thaisaCalls: d.thaisa.calls,
                  }))}
                  margin={{ left: 10, right: 20, top: 5, bottom: 5 }}
                >
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
            </div>
          )}

          {/* Pipeline Health + Alerts */}
          <div className="bg-white border border-[#E5E2DC] rounded-lg p-5 mb-6">
            <h3 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-4">SAUDE DO PIPELINE</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                <p className="text-[10px] text-amber-700 uppercase mb-0.5">Tarefas Atrasadas</p>
                <p className="text-2xl font-bold text-amber-700">{kommo.overdueTasks.total}</p>
                <p className="text-[10px] text-amber-600">V:{kommo.overdueTasks.veri} T:{kommo.overdueTasks.thaisa}</p>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
                <p className="text-[10px] text-orange-700 uppercase mb-0.5">Leads Parados (7d+)</p>
                <p className="text-2xl font-bold text-orange-700">{kommo.staleLeads.total}</p>
                <p className="text-[10px] text-orange-600">V:{kommo.staleLeads.veri} T:{kommo.staleLeads.thaisa}</p>
              </div>
              <div className="bg-[#F9F8F6] rounded-lg p-3 text-center">
                <p className="text-[10px] text-[#9B9590] uppercase mb-0.5">Leads Veri (abertos)</p>
                <p className="text-2xl font-bold" style={{ color: VERI_COLOR }}>{fmt(kommo.health.reduce((s, h) => s + h.veri, 0))}</p>
              </div>
              <div className="bg-[#F9F8F6] rounded-lg p-3 text-center">
                <p className="text-[10px] text-[#9B9590] uppercase mb-0.5">Leads Thaisa (abertos)</p>
                <p className="text-2xl font-bold" style={{ color: THAISA_COLOR }}>{fmt(kommo.health.reduce((s, h) => s + h.thaisa, 0))}</p>
              </div>
            </div>
            {/* Pipeline table */}
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
                  {kommo.health.map(s => {
                    const maxTotal = Math.max(...kommo.health.map(h => h.total), 1);
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
                    <td className="px-3 py-2 text-xs">Total</td>
                    <td className="px-3 py-2 text-center text-xs">{kommo.health.reduce((s, h) => s + h.veri, 0)}</td>
                    <td className="px-3 py-2 text-center text-xs">{kommo.health.reduce((s, h) => s + h.thaisa, 0)}</td>
                    <td className="px-3 py-2 text-center text-xs">{kommo.health.reduce((s, h) => s + h.total, 0)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* SECTION 5: CLIENTES — TABELA CRUZADA (Supabase x Kommo)           */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <h2 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-4">CLIENTES — DADOS CRUZADOS (DB x CRM)</h2>

          {/* Match stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-white border border-[#E5E2DC] rounded-lg p-4 text-center">
              <p className="text-[10px] text-[#9B9590] uppercase mb-0.5">Total Registros</p>
              <p className="text-2xl font-bold">{matchStats.total}</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="text-[10px] text-green-700 uppercase mb-0.5">Match DB + Kommo</p>
              <p className="text-2xl font-bold text-green-700">{matchStats.matched}</p>
              <p className="text-[10px] text-green-600">{matchStats.total > 0 ? fmtPct((matchStats.matched / matchStats.total) * 100) : "0%"} do total</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
              <p className="text-[10px] text-amber-700 uppercase mb-0.5">Sem Match no Kommo</p>
              <p className="text-2xl font-bold text-amber-700">{matchStats.unmatched}</p>
              <p className="text-[10px] text-amber-600">venda sem vendedora</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
              <p className="text-[10px] text-blue-700 uppercase mb-0.5">So no Kommo</p>
              <p className="text-2xl font-bold text-blue-700">{matchStats.kommoOnly}</p>
              <p className="text-[10px] text-blue-600">ganho no CRM, sem pagamento</p>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white border border-[#E5E2DC] rounded-lg p-4 mb-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text" value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                placeholder="Buscar nome ou telefone..."
                className="px-3 py-1.5 text-sm border border-[#E5E2DC] rounded-lg focus:outline-none focus:border-[#C75028] w-56"
              />
              <div className="flex rounded-lg overflow-hidden border border-[#E5E2DC]">
                {(["all", "Ads", "Afiliados"] as const).map(v => (
                  <button key={v} onClick={() => setFilterChannel(v)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${filterChannel === v ? "bg-[#1A1A1A] text-white" : "bg-white text-[#6B6560] hover:bg-[#F9F8F6]"}`}>
                    {v === "all" ? "Todos Canais" : v}
                  </button>
                ))}
              </div>
              <div className="flex rounded-lg overflow-hidden border border-[#E5E2DC]">
                {([
                  { key: "all" as const, label: "Todas" },
                  { key: "Veridiana" as const, label: "Veri" },
                  { key: "Thaisa" as const, label: "Thaisa" },
                  { key: "Gabriel" as const, label: "Gabriel" },
                  { key: "sem" as const, label: "Sem vendedora" },
                ]).map(({ key, label }) => (
                  <button key={key} onClick={() => setFilterVendedora(key)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${filterVendedora === key ? "bg-[#1A1A1A] text-white" : "bg-white text-[#6B6560] hover:bg-[#F9F8F6]"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-[#9B9590] ml-auto">{filteredClients.length} registros</span>
            </div>
          </div>

          {/* Merged table */}
          <div className="bg-white border border-[#E5E2DC] rounded-lg p-5 mb-10">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F9F8F6] border-b border-[#E5E2DC]">
                    <th className="text-left px-3 py-2.5 font-medium text-[#6B6560]">Nome</th>
                    <th className="text-left px-3 py-2.5 font-medium text-[#6B6560]">Telefone</th>
                    <th className="text-left px-3 py-2.5 font-medium text-[#6B6560]">Canal</th>
                    <th className="text-left px-3 py-2.5 font-medium text-[#6B6560]">Funil</th>
                    <th className="text-left px-3 py-2.5 font-medium text-[#6B6560]">Tipo</th>
                    <th className="text-right px-3 py-2.5 font-medium text-[#6B6560]">Valor Pago</th>
                    <th className="text-left px-3 py-2.5 font-medium text-[#6B6560]">Data Pgto</th>
                    <th className="text-left px-3 py-2.5 font-medium text-[#6B6560]">Vendedora</th>
                    <th className="text-center px-3 py-2.5 font-medium text-[#6B6560]">CRM</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-[#9B9590]">Nenhum registro encontrado</td></tr>
                  ) : filteredClients.map((c, i) => {
                    const channelColor = c.channel === "Afiliados" ? AFILIADOS_COLOR : ADS_COLOR;
                    const funnelColor = c.funnel === "Typebot" ? TYPEBOT_COLOR : FORM_COLOR;
                    const isKommoOnly = c.saleId === null;
                    return (
                      <tr key={i} className={`border-b border-[#F0EDEA] hover:bg-[#F9F8F6] ${isKommoOnly ? "bg-blue-50/40" : ""}`}>
                        <td className="px-3 py-2.5 font-medium whitespace-nowrap">{c.name}</td>
                        <td className="px-3 py-2.5 text-[#6B6560] text-xs whitespace-nowrap">{c.phone}</td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded" style={{ backgroundColor: `${channelColor}15`, color: channelColor }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: channelColor }} />
                            {c.channel}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded" style={{ backgroundColor: `${funnelColor}15`, color: funnelColor }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: funnelColor }} />
                            {c.funnel}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          {c.tipo === "Agendamento" ? (
                            <span className="text-[#14B8A6] font-medium">Agend.</span>
                          ) : (
                            <span className="text-[#1A1A1A] font-medium">Venda</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
                          {c.valor > 0 ? fmtCurrency(c.valor) : isKommoOnly && c.kommoPrice > 0 ? (
                            <span className="text-blue-600">{fmtCurrency(c.kommoPrice)}<span className="text-[10px] text-[#9B9590] ml-1">crm</span></span>
                          ) : "\u2014"}
                        </td>
                        <td className="px-3 py-2.5 text-[#6B6560] text-xs whitespace-nowrap">
                          {c.dataPagamento !== "\u2014" ? fmtShort(c.dataPagamento) : "\u2014"}
                        </td>
                        <td className="px-3 py-2.5">
                          {c.vendedora ? (() => {
                            const color = c.vendedora === "Veridiana" ? VERI_COLOR
                              : c.vendedora === "Gabriel" ? "#059669"
                              : c.vendedora === "Thaisa" ? THAISA_COLOR
                              : "#9B9590";
                            const short = c.vendedora === "Veridiana" ? "Veri" : c.vendedora;
                            return (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded"
                                style={{ backgroundColor: `${color}15`, color }}>
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                                {short}
                              </span>
                            );
                          })() : (
                            <span className="text-xs text-[#9B9590]">&mdash;</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {c.kommoMatch ? (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold" title={`Kommo #${c.kommoId}`}>
                              &#10003;
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#F0EDEA] text-[#9B9590] text-[10px]" title="Sem match no Kommo">
                              &mdash;
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-[#9B9590] mt-3">
              Match feito por telefone (normalizado) e nome. Linhas azuis = lead ganho no Kommo sem pagamento encontrado no banco.
            </p>
          </div>
        </>
      ) : (
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-10 text-center mb-10">
          <p className="text-sm text-[#9B9590]">Carregando dados do Kommo CRM...</p>
        </div>
      )}
    </div>
  );
}
