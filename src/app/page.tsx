"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  LineChart,
  Line,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import type { PieLabelRenderProps } from "recharts";

interface Sale {
  id: string;
  name: string;
  checkout_path: string;
  order_value: string | null;
  sale_date: string;
  is_affiliate: boolean;
  referring_afiliado_id: string | null;
  is_agendamento: boolean;
}

interface Aggregate {
  path: string;
  vendas: number;
  agendamentos: number;
  afiliado: number;
  sem_atendimento: number;
}

interface DailySale {
  date: string;
  vendas: number;
  agendamentos: number;
  revenue: number;
}

interface FunnelData {
  gastoMeta: number;
  gastoGoogle: number;
  cliquesMeta: number;
  cliquesGoogle: number;
  sessoesLanding: number;
  sessoesForm: number;
  leadsCheckpoint: number;
  leadsCompleto: number;
  formAprovados: number;
  formRejeitados: number;
  consultasAgendadas: number;
  consultasFeitas: number;
  vendasFunil: number;
  faturamento: number;
}

const EMPTY_FUNNEL: FunnelData = {
  gastoMeta: 0, gastoGoogle: 0, cliquesMeta: 0, cliquesGoogle: 0,
  sessoesLanding: 0, sessoesForm: 0, leadsCheckpoint: 0, leadsCompleto: 0,
  formAprovados: 0, formRejeitados: 0, consultasAgendadas: 0, consultasFeitas: 0,
  vendasFunil: 0, faturamento: 0,
};

interface FunnelRowDef {
  label: string;
  field?: string;
  sumOf?: [string, string];
  prev?: string;
  currency?: boolean;
  bold?: boolean;
  red?: boolean;
  indent?: boolean;
  noConv?: boolean;
  noAccum?: boolean;
  isBase?: boolean;
  optional?: boolean;
  auto?: boolean;
}

const FUNNEL_ROWS: FunnelRowDef[] = [
  { label: "Valor Gasto Ads Total", sumOf: ["gastoMeta", "gastoGoogle"], currency: true, bold: true, red: true, noConv: true },
  { label: "Valor Gasto Ads Meta", field: "gastoMeta", currency: true, indent: true, red: true, noConv: true, auto: true },
  { label: "Valor Gasto Ads Google", field: "gastoGoogle", currency: true, indent: true, red: true, noConv: true, auto: true },
  { label: "Cliques no Link Ads Total", sumOf: ["cliquesMeta", "cliquesGoogle"], bold: true, isBase: true },
  { label: "Cliques no Link Ads Meta", field: "cliquesMeta", indent: true, noConv: true, auto: true },
  { label: "Cliques no Link Ads Google", field: "cliquesGoogle", indent: true, noConv: true, auto: true },
  { label: "Sessoes na Landing Page", field: "sessoesLanding", prev: "cliquesTotal", auto: true },
  { label: "Sessoes na form/tela de produto", field: "sessoesForm", prev: "sessoesLanding", optional: true, auto: true },
  { label: "Leads Formulario Checkpoint", field: "leadsCheckpoint", prev: "sessoesLanding", auto: true },
  { label: "Leads Formulario Completo", field: "leadsCompleto", prev: "leadsCheckpoint", auto: true },
  { label: "Formularios Aprovados", field: "formAprovados", prev: "leadsCompleto", auto: true },
  { label: "Formularios Rejeitados", field: "formRejeitados", prev: "leadsCompleto", red: true, noAccum: true, auto: true },
  { label: "Consultas Agendadas", field: "consultasAgendadas", prev: "formAprovados", auto: true },
  { label: "Consultas Feitas", field: "consultasFeitas", prev: "consultasAgendadas", auto: true },
  { label: "Vendas", field: "vendasFunil", prev: "formAprovados", bold: true, auto: true },
  { label: "Faturamento", field: "faturamento", currency: true, bold: true, noConv: true, auto: true },
];

interface FunnelAfiliadosData {
  gastoFixoProdutos: number;
  leadsCheckpoint: number;
  leadsCompleto: number;
  formAprovados: number;
  formRejeitados: number;
  consultasAgendadas: number;
  consultasFeitas: number;
  vendasFunil: number;
  faturamento: number;
}

const EMPTY_FUNNEL_AFILIADOS: FunnelAfiliadosData = {
  gastoFixoProdutos: 0, leadsCheckpoint: 0, leadsCompleto: 0,
  formAprovados: 0, formRejeitados: 0, consultasAgendadas: 0,
  consultasFeitas: 0, vendasFunil: 0, faturamento: 0,
};

const FUNNEL_AFILIADOS_ROWS: FunnelRowDef[] = [
  { label: "Valor Gasto (fixo + produtos)", field: "gastoFixoProdutos", currency: true, bold: true, red: true, noConv: true },
  { label: "Sessões Chat (Afiliados)", field: "sessoesAfiliados", isBase: true, auto: true, noConv: true },
  { label: "Leads Formulario Checkpoint", field: "leadsCheckpoint", prev: "sessoesAfiliados", auto: true },
  { label: "Leads Formulario Completo", field: "leadsCompleto", prev: "leadsCheckpoint", auto: true },
  { label: "Formularios Aprovados", field: "formAprovados", prev: "leadsCompleto", auto: true },
  { label: "Formularios Rejeitados", field: "formRejeitados", prev: "leadsCompleto", red: true, noAccum: true, auto: true },
  { label: "Consultas Agendadas", field: "consultasAgendadas", prev: "formAprovados", auto: true },
  { label: "Consultas Feitas", field: "consultasFeitas", prev: "consultasAgendadas", auto: true },
  { label: "Vendas", field: "vendasFunil", prev: "formAprovados", bold: true, auto: true },
  { label: "Faturamento", field: "faturamento", currency: true, bold: true, noConv: true, auto: true },
];

interface FunnelMedicosData {
  gastoProdutosComissoes: number;
  formAprovados: number;
  vendasFeitas: number;
  faturamento: number;
}

const EMPTY_FUNNEL_MEDICOS: FunnelMedicosData = {
  gastoProdutosComissoes: 0, formAprovados: 0, vendasFeitas: 0, faturamento: 0,
};

const FUNNEL_MEDICOS_ROWS: FunnelRowDef[] = [
  { label: "Valor Produtos + Comissoes", field: "gastoProdutosComissoes", currency: true, bold: true, red: true, noConv: true },
  { label: "Formularios Aprovados", field: "formAprovados", isBase: true, auto: true },
  { label: "Vendas Feitas", field: "vendasFeitas", prev: "formAprovados", bold: true, auto: true },
  { label: "Faturamento", field: "faturamento", currency: true, bold: true, noConv: true, auto: true },
];

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
  typebot: "Typebot",
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
  typebot: "#14B8A6",
  unknown: "#9CA3AF",
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function formatCurrency(value: string | null) {
  if (!value) return "\u2014";
  return `R$${parseFloat(value).toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`;
}

function formatCurrencyNum(value: number) {
  return `R$${value.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`;
}

function formatShortDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatMonth(monthStr: string) {
  const [, m] = monthStr.split("-");
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return months[parseInt(m) - 1] || monthStr;
}

function formatNum(value: number) {
  return value.toLocaleString("pt-BR");
}

function formatCurrencyFull(value: number) {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(value: number) {
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function getFunnelRef(ref: string, f: Record<string, number>): number {
  if (ref === "cliquesTotal") return (f["cliquesMeta"] || 0) + (f["cliquesGoogle"] || 0);
  return f[ref] || 0;
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
  const [channelLeads, setChannelLeads] = useState({ ads: 0, afiliados: 0, medicos: 0 });
  const [channelFunnel, setChannelFunnel] = useState({
    ads: { leadsCompleto: 0, formAprovados: 0, formRejeitados: 0, consultasAgendadas: 0, consultasFeitas: 0 },
    afiliados: { leadsCompleto: 0, formAprovados: 0, formRejeitados: 0, consultasAgendadas: 0, consultasFeitas: 0 },
    medicos: { leadsCompleto: 0, formAprovados: 0, formRejeitados: 0, consultasAgendadas: 0, consultasFeitas: 0 },
  });
  const [loading, setLoading] = useState(false);

  // Date filter state
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Ads API metrics (Meta + GA4)
  const [adsMetrics, setAdsMetrics] = useState({
    gastoMeta: 0, gastoGoogle: 0,
    cliquesMeta: 0, cliquesGoogle: 0,
    sessoesLanding: 0, sessoesForm: 0,
    sessoesAfiliados: 0,
    loaded: false,
  });

  // GA4 analytics data
  const [ga4Data, setGa4Data] = useState<{
    trafficSources: { channel: string; sessions: number }[];
    dailySessions: { date: string; sessions: number; users: number }[];
    newVsReturning: { type: string; users: number; sessions: number }[];
    devices: { device: string; sessions: number }[];
    engagement: { engagementRate: number; avgSessionDuration: number; sessionsPerUser: number; totalSessions: number; totalUsers: number };
  }>({
    trafficSources: [], dailySessions: [], newVsReturning: [], devices: [],
    engagement: { engagementRate: 0, avgSessionDuration: 0, sessionsPerUser: 0, totalSessions: 0, totalUsers: 0 },
  });

  const [ga4Error, setGa4Error] = useState("");
  const [metaError, setMetaError] = useState("");

  // Meta Ads analytics data
  const [metaData, setMetaData] = useState<{
    impressions: number; reach: number; cpm: number; cpc: number; ctr: number; frequency: number;
    campaigns: { name: string; spend: number; impressions: number; clicks: number; cpc: number; ctr: number; leads: number }[];
    dailySpend: { date: string; spend: number; impressions: number; clicks: number }[];
  }>({
    impressions: 0, reach: 0, cpm: 0, cpc: 0, ctr: 0, frequency: 0,
    campaigns: [], dailySpend: [],
  });

  // Meta and funnel state
  const [metaMensal, setMetaMensal] = useState(0);
  const [metaInput, setMetaInput] = useState("");
  const [funnel, setFunnel] = useState<FunnelData>(EMPTY_FUNNEL);
  const [funnelInputs, setFunnelInputs] = useState<Record<string, string>>({});
  const [funnelAfiliados, setFunnelAfiliados] = useState<FunnelAfiliadosData>(EMPTY_FUNNEL_AFILIADOS);
  const [funnelAfiliadosInputs, setFunnelAfiliadosInputs] = useState<Record<string, string>>({});
  const [funnelMedicos, setFunnelMedicos] = useState<FunnelMedicosData>(EMPTY_FUNNEL_MEDICOS);
  const [funnelMedicosInputs, setFunnelMedicosInputs] = useState<Record<string, string>>({});
  // Ads sub-channel data (Form vs Typebot)
  const [adsSubLeads, setAdsSubLeads] = useState({ form: 0, typebot: 0 });
  const [adsSubFunnel, setAdsSubFunnel] = useState({
    form: { leadsCompleto: 0, formAprovados: 0, formRejeitados: 0, consultasAgendadas: 0, consultasFeitas: 0 },
    typebot: { leadsCompleto: 0, formAprovados: 0, formRejeitados: 0, consultasAgendadas: 0, consultasFeitas: 0 },
  });

  // Load saved settings from localStorage
  useEffect(() => {
    try {
      const savedMeta = localStorage.getItem("slima_meta");
      if (savedMeta) {
        const val = parseFloat(savedMeta);
        if (val > 0) {
          setMetaMensal(val);
          setMetaInput(val.toString());
        }
      }
      const savedFunnel = localStorage.getItem("slima_funnel");
      if (savedFunnel) {
        const f = JSON.parse(savedFunnel) as FunnelData;
        setFunnel(f);
        const inputs: Record<string, string> = {};
        for (const [k, v] of Object.entries(f)) {
          if (v > 0) inputs[k] = v.toString();
        }
        setFunnelInputs(inputs);
      }
      const savedAfiliados = localStorage.getItem("slima_funnel_afiliados");
      if (savedAfiliados) {
        const f = JSON.parse(savedAfiliados) as FunnelAfiliadosData;
        setFunnelAfiliados(f);
        const inputs: Record<string, string> = {};
        for (const [k, v] of Object.entries(f)) {
          if (v > 0) inputs[k] = v.toString();
        }
        setFunnelAfiliadosInputs(inputs);
      }
      const savedMedicos = localStorage.getItem("slima_funnel_medicos");
      if (savedMedicos) {
        const f = JSON.parse(savedMedicos) as FunnelMedicosData;
        setFunnelMedicos(f);
        const inputs: Record<string, string> = {};
        for (const [k, v] of Object.entries(f)) {
          if (v > 0) inputs[k] = v.toString();
        }
        setFunnelMedicosInputs(inputs);
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  function handleMetaChange(value: string) {
    setMetaInput(value);
    const num = parseFloat(value) || 0;
    setMetaMensal(num);
    try {
      localStorage.setItem("slima_meta", num.toString());
    } catch {
      // ignore
    }
  }

  function handleFunnelChange(field: keyof FunnelData, value: string) {
    setFunnelInputs((prev) => ({ ...prev, [field]: value }));
    const num = parseFloat(value) || 0;
    const updated = { ...funnel, [field]: num };
    setFunnel(updated);
    try {
      localStorage.setItem("slima_funnel", JSON.stringify(updated));
    } catch {
      // ignore
    }
  }

  function handleFunnelAfiliadosChange(field: keyof FunnelAfiliadosData, value: string) {
    setFunnelAfiliadosInputs((prev) => ({ ...prev, [field]: value }));
    const num = parseFloat(value) || 0;
    const updated = { ...funnelAfiliados, [field]: num };
    setFunnelAfiliados(updated);
    try {
      localStorage.setItem("slima_funnel_afiliados", JSON.stringify(updated));
    } catch {
      // ignore
    }
  }

  function handleFunnelMedicosChange(field: keyof FunnelMedicosData, value: string) {
    setFunnelMedicosInputs((prev) => ({ ...prev, [field]: value }));
    const num = parseFloat(value) || 0;
    const updated = { ...funnelMedicos, [field]: num };
    setFunnelMedicos(updated);
    try {
      localStorage.setItem("slima_funnel_medicos", JSON.stringify(updated));
    } catch {
      // ignore
    }
  }

  const fetchData = useCallback(async (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    const res = await fetch(`/api/sales${qs ? `?${qs}` : ""}`);
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
    setChannelLeads(data.channelLeads || { ads: 0, afiliados: 0, medicos: 0 });
    if (data.adsSubLeads) setAdsSubLeads(data.adsSubLeads);
    if (data.adsSubFunnel) setAdsSubFunnel(data.adsSubFunnel);
    if (data.channelFunnel) setChannelFunnel(data.channelFunnel);
  }, []);

  const fetchAdsMetrics = useCallback(async (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();

    const [metaRes, gaRes] = await Promise.all([
      fetch(`/api/meta-ads${qs ? `?${qs}` : ""}`).then((r) => r.json()).catch((e) => ({ error: `Fetch failed: ${e.message}` })),
      fetch(`/api/google-analytics${qs ? `?${qs}` : ""}`).then((r) => r.json()).catch((e) => ({ error: `Fetch failed: ${e.message}` })),
    ]);
    console.log("Meta API response:", JSON.stringify(metaRes).slice(0, 500));
    console.log("GA4 API response:", JSON.stringify(gaRes).slice(0, 500));

    setAdsMetrics({
      gastoMeta: metaRes.gastoMeta || 0,
      gastoGoogle: gaRes.gastoGoogle || 0,
      cliquesMeta: metaRes.cliquesMeta || 0,
      cliquesGoogle: gaRes.cliquesGoogle || 0,
      sessoesLanding: gaRes.sessoesLanding || 0,
      sessoesForm: gaRes.sessoesForm || 0,
      sessoesAfiliados: gaRes.sessoesAfiliados || 0,
      loaded: true,
    });

    setGa4Data({
      trafficSources: gaRes.trafficSources || [],
      dailySessions: gaRes.dailySessions || [],
      newVsReturning: gaRes.newVsReturning || [],
      devices: gaRes.devices || [],
      engagement: gaRes.engagement || { engagementRate: 0, avgSessionDuration: 0, sessionsPerUser: 0, totalSessions: 0, totalUsers: 0 },
    });

    setMetaData({
      impressions: metaRes.impressions || 0,
      reach: metaRes.reach || 0,
      cpm: metaRes.cpm || 0,
      cpc: metaRes.cpc || 0,
      ctr: metaRes.ctr || 0,
      frequency: metaRes.frequency || 0,
      campaigns: metaRes.campaigns || [],
      dailySpend: metaRes.dailySpend || [],
    });

    if (gaRes.error) setGa4Error(gaRes.error);
    else setGa4Error("");
    if (metaRes.error) setMetaError(metaRes.error);
    else setMetaError("");
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
          setChannelLeads(data.channelLeads || { ads: 0, afiliados: 0, medicos: 0 });
    if (data.adsSubLeads) setAdsSubLeads(data.adsSubLeads);
    if (data.adsSubFunnel) setAdsSubFunnel(data.adsSubFunnel);
          if (data.channelFunnel) setChannelFunnel(data.channelFunnel);
        });
        fetchAdsMetrics();
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh every 30s
  useEffect(() => {
    if (!authed) return;
    const interval = setInterval(() => {
      fetchData(dateFrom || undefined, dateTo || undefined);
      fetchAdsMetrics(dateFrom || undefined, dateTo || undefined);
    }, 30000);
    return () => clearInterval(interval);
  }, [authed, fetchData, fetchAdsMetrics, dateFrom, dateTo]);

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
      fetchData(dateFrom || undefined, dateTo || undefined);
      fetchAdsMetrics(dateFrom || undefined, dateTo || undefined);
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
  const totalAgendamentos = enrichedAggregate.reduce((s, a) => s + (a.agendamentos || 0), 0);
  const totalAfiliado = enrichedAggregate.reduce((s, a) => s + a.afiliado, 0);
  const totalSemAtendimento = enrichedAggregate.reduce((s, a) => s + a.sem_atendimento, 0);
  const totalOrders = totalVendas + totalAgendamentos;
  const ticketMedio = totalVendas > 0 ? totalRevenue / totalOrders : 0;

  const totalLeadsAll = Object.values(totalByPath).reduce((a, b) => a + b, 0);
  const conversionRate = totalLeadsAll > 0 ? ((totalOrders / totalLeadsAll) * 100).toFixed(1) : "0";

  // Monthly sales data
  const monthlySalesData = useMemo(() => {
    const monthMap: Record<string, { vendas: number; revenue: number }> = {};
    for (const s of sales) {
      const month = s.sale_date.slice(0, 7);
      if (!monthMap[month]) monthMap[month] = { vendas: 0, revenue: 0 };
      monthMap[month].vendas++;
      monthMap[month].revenue += s.order_value ? parseFloat(s.order_value) : 0;
    }
    return Object.entries(monthMap)
      .map(([month, data]) => ({ month, label: formatMonth(month), ...data }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [sales]);

  // Current month metrics (for meta comparison)
  const currentMonthMetrics = useMemo(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let vendas = 0;
    let revenue = 0;
    for (const s of sales) {
      if (s.sale_date.startsWith(ym)) {
        vendas++;
        revenue += s.order_value ? parseFloat(s.order_value) : 0;
      }
    }
    return { vendas, revenue };
  }, [sales]);

  // Meta calculations
  const metaCalcs = useMemo(() => {
    if (!metaMensal || metaMensal <= 0) return null;
    const now = new Date();
    const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const currentDay = now.getDate();
    const escalonado = (currentDay / totalDays) * metaMensal;
    const gap = currentMonthMetrics.revenue - escalonado;
    const progress = (currentMonthMetrics.revenue / metaMensal) * 100;
    const remainingDays = totalDays - currentDay;
    const needPerDay = remainingDays > 0 ? (metaMensal - currentMonthMetrics.revenue) / remainingDays : 0;
    return { totalDays, currentDay, escalonado, gap, progress, remainingDays, needPerDay };
  }, [metaMensal, currentMonthMetrics]);

  // Funnel computed values (will be recalculated after effectiveAds is built)
  let funnelCliquesTotal = 0;
  let funnelGastoTotal = 0;

  // Auto-populated channel data from API
  const adsAutoData = useMemo(() => {
    const adsSales = sales.filter(s => !s.is_affiliate && s.checkout_path !== "prescription_checkout");
    return {
      leadsCheckpoint: channelLeads.ads,
      leadsCompleto: channelFunnel.ads.leadsCompleto,
      formAprovados: channelFunnel.ads.formAprovados,
      formRejeitados: channelFunnel.ads.formRejeitados,
      consultasAgendadas: channelFunnel.ads.consultasAgendadas,
      consultasFeitas: channelFunnel.ads.consultasFeitas,
      vendasFunil: adsSales.length,
      faturamento: adsSales.reduce((sum, s) => sum + (s.order_value ? parseFloat(s.order_value) : 0), 0),
    };
  }, [sales, channelLeads, channelFunnel]);

  const afiliadosAutoData = useMemo(() => {
    const afSales = sales.filter(s => s.is_affiliate);
    return {
      sessoesAfiliados: adsMetrics.sessoesAfiliados,
      leadsCheckpoint: channelLeads.afiliados,
      leadsCompleto: channelFunnel.afiliados.leadsCompleto,
      formAprovados: channelFunnel.afiliados.formAprovados,
      formRejeitados: channelFunnel.afiliados.formRejeitados,
      consultasAgendadas: channelFunnel.afiliados.consultasAgendadas,
      consultasFeitas: channelFunnel.afiliados.consultasFeitas,
      vendasFunil: afSales.length,
      faturamento: afSales.reduce((sum, s) => sum + (s.order_value ? parseFloat(s.order_value) : 0), 0),
    };
  }, [sales, channelLeads, channelFunnel, adsMetrics.sessoesAfiliados]);

  const medicosAutoData = useMemo(() => {
    const medSales = sales.filter(s => s.checkout_path === "prescription_checkout");
    return {
      formAprovados: channelFunnel.medicos.formAprovados,
      vendasFeitas: medSales.length,
      faturamento: medSales.reduce((sum, s) => sum + (s.order_value ? parseFloat(s.order_value) : 0), 0),
    };
  }, [sales, channelFunnel]);

  // Ads sub-channel auto data (Form vs Typebot)
  const adsSubAutoData = useMemo(() => {
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

  // Helper: check if a field should be editable due to API error
  const isApiFieldEditable = (field: string): boolean => {
    if (metaError && (field === "gastoMeta" || field === "cliquesMeta")) return true;
    if (ga4Error && (field === "gastoGoogle" || field === "cliquesGoogle" || field === "sessoesLanding" || field === "sessoesForm" || field === "sessoesAfiliados")) return true;
    return false;
  };

  // Effective funnels (merge manual + auto data + API ads metrics)
  // When API has error, don't overwrite manual values with zeros
  const effectiveAds: Record<string, number> = {
    ...funnel,
    ...adsAutoData,
    ...(adsMetrics.loaded ? {
      ...(!metaError ? { gastoMeta: adsMetrics.gastoMeta, cliquesMeta: adsMetrics.cliquesMeta } : {}),
      ...(!ga4Error ? { gastoGoogle: adsMetrics.gastoGoogle, cliquesGoogle: adsMetrics.cliquesGoogle, sessoesLanding: adsMetrics.sessoesLanding, sessoesForm: adsMetrics.sessoesForm } : {}),
    } : {}),
  };
  funnelCliquesTotal = (effectiveAds["cliquesMeta"] || 0) + (effectiveAds["cliquesGoogle"] || 0);
  funnelGastoTotal = (effectiveAds["gastoMeta"] || 0) + (effectiveAds["gastoGoogle"] || 0);

  const effectiveAfiliados: Record<string, number> = {
    ...funnelAfiliados,
    ...afiliadosAutoData,
    ...(ga4Error ? { sessoesAfiliados: parseFloat(funnelAfiliadosInputs["sessoesAfiliados"] || "0") } : {}),
  };
  const effectiveMedicos: Record<string, number> = { ...funnelMedicos, ...medicosAutoData };

  // Protocol chart data (horizontal bars)
  const protocolBarData = enrichedAggregate
    .map((a) => ({
      name: PATH_LABELS[a.path] || a.path,
      vendas: a.vendas,
      fill: PATH_COLORS[a.path] || "#9CA3AF",
    }))
    .sort((a, b) => b.vendas - a.vendas);

  // Revenue bar data
  const revenueBarData = enrichedAggregate.map((a) => ({
    name: PATH_LABELS[a.path] || a.path,
    revenue: revenueByPath[a.path] || 0,
    fill: PATH_COLORS[a.path] || "#9CA3AF",
  }));

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
      {/* Header */}
      <div className="flex items-baseline justify-between mb-8">
        <div>
          <p className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-1">SLIMA GROWTH</p>
          <h1 className="text-3xl font-bold">Dashboard</h1>
        </div>
        <div className="flex items-center gap-4">
          <a href="/resumo" className="px-3 py-1.5 text-xs font-medium bg-[#C75028] text-white rounded-lg hover:bg-[#A8421F] transition-colors">Resumo do Mes</a>
          <a href="/vendedoras" className="px-3 py-1.5 text-xs font-medium bg-[#1A1A1A] text-white rounded-lg hover:bg-[#333] transition-colors">Vendedoras</a>
          <p className="text-xs text-[#9B9590]">Atualiza a cada 30s</p>
        </div>
      </div>

      {/* Date Filter */}
      <div className="bg-white border border-[#E5E2DC] rounded-lg p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium tracking-widest uppercase text-[#C75028]">PERIODO</span>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                fetchData(e.target.value || undefined, dateTo || undefined);
                fetchAdsMetrics(e.target.value || undefined, dateTo || undefined);
              }}
              className="px-3 py-1.5 text-sm border border-[#E5E2DC] rounded-lg focus:outline-none focus:border-[#C75028]"
            />
            <span className="text-xs text-[#9B9590]">ate</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                fetchData(dateFrom || undefined, e.target.value || undefined);
                fetchAdsMetrics(dateFrom || undefined, e.target.value || undefined);
              }}
              className="px-3 py-1.5 text-sm border border-[#E5E2DC] rounded-lg focus:outline-none focus:border-[#C75028]"
            />
          </div>
          <div className="flex gap-1.5 ml-auto">
            {[
              { label: "7d", fn: () => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); } },
              { label: "30d", fn: () => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); } },
              { label: "Este mes", fn: () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; } },
              { label: "3m", fn: () => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10); } },
            ].map((preset) => (
              <button
                key={preset.label}
                onClick={() => {
                  const from = preset.fn();
                  const to = new Date().toISOString().slice(0, 10);
                  setDateFrom(from);
                  setDateTo(to);
                  fetchData(from, to);
                  fetchAdsMetrics(from, to);
                }}
                className="px-3 py-1.5 text-xs font-medium border border-[#E5E2DC] rounded-lg hover:bg-[#F9F8F6] transition-colors"
              >
                {preset.label}
              </button>
            ))}
            <button
              onClick={() => {
                setDateFrom("");
                setDateTo("");
                fetchData(undefined, undefined);
                fetchAdsMetrics(undefined, undefined);
              }}
              className="px-3 py-1.5 text-xs font-medium border border-[#E5E2DC] rounded-lg hover:bg-[#F9F8F6] transition-colors text-[#C75028]"
            >
              Tudo
            </button>
          </div>
        </div>
      </div>

      {/* Meta Mensal Section */}
      <div className="bg-white border border-[#E5E2DC] rounded-lg p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-medium tracking-widest uppercase text-[#C75028]">META MENSAL</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#9B9590]">R$</span>
            <input
              type="number"
              value={metaInput}
              onChange={(e) => handleMetaChange(e.target.value)}
              placeholder="Definir meta..."
              className="w-40 px-3 py-1.5 text-sm border border-[#E5E2DC] rounded-lg focus:outline-none focus:border-[#C75028] text-right"
            />
          </div>
        </div>
        {metaCalcs && (
          <>
            <div className="w-full bg-[#F0EDEA] rounded-full h-3 mb-3">
              <div
                className="h-3 rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(metaCalcs.progress, 100)}%`,
                  backgroundColor: metaCalcs.gap >= 0 ? "#059669" : "#DC2626",
                }}
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-[#9B9590]">Realizado</p>
                <p className="text-lg font-bold">{formatCurrencyNum(currentMonthMetrics.revenue)}</p>
                <p className="text-xs text-[#9B9590]">{metaCalcs.progress.toFixed(1)}% da meta</p>
              </div>
              <div>
                <p className="text-xs text-[#9B9590]">Escalonado (dia {metaCalcs.currentDay}/{metaCalcs.totalDays})</p>
                <p className="text-lg font-bold">{formatCurrencyNum(metaCalcs.escalonado)}</p>
                <p className={`text-xs font-medium ${metaCalcs.gap >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {metaCalcs.gap >= 0 ? "+" : ""}{formatCurrencyNum(metaCalcs.gap)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#9B9590]">Falta</p>
                <p className="text-lg font-bold">{formatCurrencyNum(Math.max(metaMensal - currentMonthMetrics.revenue, 0))}</p>
                <p className="text-xs text-[#9B9590]">{metaCalcs.remainingDays} dias restantes</p>
              </div>
              <div>
                <p className="text-xs text-[#9B9590]">Necessario/dia</p>
                <p className="text-lg font-bold">{formatCurrencyNum(Math.max(metaCalcs.needPerDay, 0))}</p>
                <p className="text-xs text-[#9B9590]">para atingir a meta</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
          <p className="text-xs text-[#9B9590] uppercase tracking-wide mb-1">Vendas (≥R$100)</p>
          <p className="text-3xl font-bold">{totalVendas}</p>
        </div>
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
          <p className="text-xs text-[#9B9590] uppercase tracking-wide mb-1">Agendamentos (&lt;R$100)</p>
          <p className="text-3xl font-bold text-[#14B8A6]">{totalAgendamentos}</p>
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
          <p className="text-xs text-[#9B9590] mt-1">{totalOrders} de {totalLeadsAll} leads</p>
        </div>
      </div>

      {/* Error Banners */}
      {(ga4Error || metaError) && (
        <div className="space-y-2 mb-4">
          {ga4Error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <p className="text-sm text-red-700"><span className="font-medium">GA4:</span> {ga4Error}</p>
            </div>
          )}
          {metaError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <p className="text-sm text-red-700"><span className="font-medium">Meta:</span> {metaError}</p>
            </div>
          )}
        </div>
      )}

      {/* Engagement KPI Cards (GA4) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
          <p className="text-xs text-[#9B9590] uppercase tracking-wide mb-1">Sessoes Totais</p>
          <p className="text-3xl font-bold">{formatNum(ga4Data.engagement.totalSessions)}</p>
          <p className="text-xs text-[#9B9590] mt-1">{formatNum(ga4Data.engagement.totalUsers)} usuarios</p>
        </div>
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
          <p className="text-xs text-[#9B9590] uppercase tracking-wide mb-1">Taxa Engajamento</p>
          <p className="text-3xl font-bold">{(ga4Data.engagement.engagementRate * 100).toFixed(1)}%</p>
        </div>
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
          <p className="text-xs text-[#9B9590] uppercase tracking-wide mb-1">Duracao Media</p>
          <p className="text-3xl font-bold">{ga4Data.engagement.avgSessionDuration > 0 ? `${Math.floor(ga4Data.engagement.avgSessionDuration / 60)}m${Math.round(ga4Data.engagement.avgSessionDuration % 60)}s` : "\u2014"}</p>
        </div>
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
          <p className="text-xs text-[#9B9590] uppercase tracking-wide mb-1">Sessoes/Usuario</p>
          <p className="text-3xl font-bold">{ga4Data.engagement.sessionsPerUser > 0 ? ga4Data.engagement.sessionsPerUser.toFixed(2) : "\u2014"}</p>
        </div>
      </div>

      {/* GA4 Analytics Row: Traffic Sources + New vs Returning + Device Split */}
      {ga4Data.trafficSources.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Traffic Sources */}
          <div className="bg-white border border-[#E5E2DC] rounded-lg p-5 lg:col-span-1">
            <h3 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-4">FONTES DE TRAFEGO</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={ga4Data.trafficSources.slice(0, 6).map(s => ({ name: s.channel, value: s.sessions }))}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="value"
                  paddingAngle={2}
                  label={(props: PieLabelRenderProps) => `${props.name || ""} ${((props.percent || 0) * 100).toFixed(0)}%`}
                  style={{ fontSize: 10 }}
                >
                  {ga4Data.trafficSources.slice(0, 6).map((_, i) => (
                    <Cell key={i} fill={["#C75028", "#2563EB", "#059669", "#D97706", "#7C3AED", "#9CA3AF"][i]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, border: "1px solid #E5E2DC", borderRadius: 8 }} formatter={(v) => [formatNum(v as number), "Sessoes"]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 space-y-1">
              {ga4Data.trafficSources.slice(0, 6).map((s, i) => {
                const total = ga4Data.trafficSources.reduce((sum, x) => sum + x.sessions, 0);
                return (
                  <div key={s.channel} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: ["#C75028", "#2563EB", "#059669", "#D97706", "#7C3AED", "#9CA3AF"][i] }} />
                      <span className="text-[#6B6560]">{s.channel}</span>
                    </div>
                    <span className="font-medium">{formatNum(s.sessions)} <span className="text-[#9B9590] font-normal">({total > 0 ? ((s.sessions / total) * 100).toFixed(1) : 0}%)</span></span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* New vs Returning */}
          <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
            <h3 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-4">NOVOS VS RETORNANTES</h3>
            {(() => {
              const newUsers = ga4Data.newVsReturning.find(x => x.type === "new")?.users || 0;
              const returning = ga4Data.newVsReturning.find(x => x.type === "returning")?.users || 0;
              const total = newUsers + returning;
              const newPct = total > 0 ? (newUsers / total) * 100 : 0;
              const retPct = total > 0 ? (returning / total) * 100 : 0;
              return (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={[{ name: "Novos", value: newUsers }, { name: "Retornantes", value: returning }]}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        dataKey="value"
                        paddingAngle={2}
                      >
                        <Cell fill="#C75028" />
                        <Cell fill="#2563EB" />
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 12, border: "1px solid #E5E2DC", borderRadius: 8 }} formatter={(v) => [formatNum(v as number), "Usuarios"]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 mt-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs"><span className="w-2.5 h-2.5 rounded-full bg-[#C75028] inline-block" />Novos</div>
                      <span className="text-sm font-bold">{formatNum(newUsers)} <span className="text-xs text-[#9B9590] font-normal">({newPct.toFixed(1)}%)</span></span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs"><span className="w-2.5 h-2.5 rounded-full bg-[#2563EB] inline-block" />Retornantes</div>
                      <span className="text-sm font-bold">{formatNum(returning)} <span className="text-xs text-[#9B9590] font-normal">({retPct.toFixed(1)}%)</span></span>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Device Split */}
          <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
            <h3 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-4">DISPOSITIVOS</h3>
            {(() => {
              const total = ga4Data.devices.reduce((s, d) => s + d.sessions, 0);
              return (
                <div className="space-y-4 mt-4">
                  {ga4Data.devices.map((d, i) => {
                    const pct = total > 0 ? (d.sessions / total) * 100 : 0;
                    const colors = ["#C75028", "#2563EB", "#059669"];
                    const labels: Record<string, string> = { desktop: "Desktop", mobile: "Mobile", tablet: "Tablet" };
                    return (
                      <div key={d.device}>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="text-[#6B6560] font-medium">{labels[d.device] || d.device}</span>
                          <span className="font-bold">{formatNum(d.sessions)} <span className="text-[#9B9590] font-normal">({pct.toFixed(1)}%)</span></span>
                        </div>
                        <div className="w-full bg-[#F0EDEA] rounded-full h-3">
                          <div className="h-3 rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: colors[i] || "#9CA3AF" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Daily Traffic Trend + Sales */}
      {ga4Data.dailySessions.length > 0 && (
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-5 mb-6">
          <h3 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-4">TRAFEGO DIARIO VS VENDAS</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart
              data={ga4Data.dailySessions.map(d => {
                const daySale = dailySales.find(s => s.date === d.date);
                return { date: d.date, sessoes: d.sessions, usuarios: d.users, vendas: daySale?.vendas || 0, revenue: daySale?.revenue || 0 };
              })}
              margin={{ left: 10, right: 20, top: 5, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EDEA" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9B9590" }} tickFormatter={(v) => { const p = v.split("-"); return `${p[2]}/${p[1]}`; }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#9B9590" }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#9B9590" }} />
              <Tooltip
                contentStyle={{ fontSize: 12, border: "1px solid #E5E2DC", borderRadius: 8 }}
                labelFormatter={(v) => { const p = String(v).split("-"); return `${p[2]}/${p[1]}/${p[0]}`; }}
                formatter={(value, name) => {
                  const labels: Record<string, string> = { sessoes: "Sessoes", usuarios: "Usuarios", vendas: "Vendas", revenue: "Receita" };
                  return [name === "revenue" ? formatCurrencyNum(value as number) : formatNum(value as number), labels[name as string] || name];
                }}
              />
              <Legend formatter={(v) => { const m: Record<string, string> = { sessoes: "Sessoes", usuarios: "Usuarios", vendas: "Vendas" }; return m[v] || v; }} />
              <Line yAxisId="left" type="monotone" dataKey="sessoes" stroke="#C75028" strokeWidth={2} dot={false} />
              <Line yAxisId="left" type="monotone" dataKey="usuarios" stroke="#D97706" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              <Line yAxisId="right" type="monotone" dataKey="vendas" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Monthly Sales Vertical Bar Chart */}
      {monthlySalesData.length > 0 && (
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-5 mb-6">
          <h3 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-4">VENDAS POR MES</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlySalesData} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EDEA" />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#6B6560" }} />
              <YAxis tick={{ fontSize: 12, fill: "#9B9590" }} />
              <Tooltip
                contentStyle={{ fontSize: 12, border: "1px solid #E5E2DC", borderRadius: 8 }}
                formatter={(value, name) => [
                  name === "revenue" ? formatCurrencyNum(value as number) : value,
                  name === "revenue" ? "Receita" : "Vendas",
                ]}
              />
              <Bar dataKey="vendas" fill="#C75028" radius={[4, 4, 0, 0]} name="Vendas" />
              <Bar dataKey="revenue" fill="#2563EB" radius={[4, 4, 0, 0]} name="Receita" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Vendas por Protocolo */}
      <div className="bg-white border border-[#E5E2DC] rounded-lg p-5 mb-10">
        <h3 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-4">VENDAS POR PROTOCOLO</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={protocolBarData} layout="vertical" margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
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
              formatter={(value) => [value as number, "Vendas"]}
            />
            <Bar dataKey="vendas" radius={[0, 4, 4, 0]}>
              {protocolBarData.map((entry, index) => (
                <Cell key={index} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Meta Ads Performance */}
      {(metaData.impressions > 0 || metaData.campaigns.length > 0) && (
        <>
          {/* Meta KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <div className="bg-white border border-[#E5E2DC] rounded-lg p-4">
              <p className="text-[10px] text-[#9B9590] uppercase tracking-wide mb-1">Impressoes</p>
              <p className="text-xl font-bold">{formatNum(metaData.impressions)}</p>
            </div>
            <div className="bg-white border border-[#E5E2DC] rounded-lg p-4">
              <p className="text-[10px] text-[#9B9590] uppercase tracking-wide mb-1">Alcance</p>
              <p className="text-xl font-bold">{formatNum(metaData.reach)}</p>
            </div>
            <div className="bg-white border border-[#E5E2DC] rounded-lg p-4">
              <p className="text-[10px] text-[#9B9590] uppercase tracking-wide mb-1">CPM</p>
              <p className="text-xl font-bold">R${metaData.cpm.toFixed(2)}</p>
            </div>
            <div className="bg-white border border-[#E5E2DC] rounded-lg p-4">
              <p className="text-[10px] text-[#9B9590] uppercase tracking-wide mb-1">CPC</p>
              <p className="text-xl font-bold">R${metaData.cpc.toFixed(2)}</p>
            </div>
            <div className="bg-white border border-[#E5E2DC] rounded-lg p-4">
              <p className="text-[10px] text-[#9B9590] uppercase tracking-wide mb-1">CTR</p>
              <p className="text-xl font-bold">{metaData.ctr.toFixed(2)}%</p>
            </div>
            <div className="bg-white border border-[#E5E2DC] rounded-lg p-4">
              <p className="text-[10px] text-[#9B9590] uppercase tracking-wide mb-1">Frequencia</p>
              <p className="text-xl font-bold">{metaData.frequency.toFixed(2)}</p>
            </div>
          </div>

          {/* Meta Daily Spend + Campaign Table */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
            {/* Daily Ad Spend Chart */}
            {metaData.dailySpend.length > 0 && (
              <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
                <h3 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-4">GASTO DIARIO META ADS</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={metaData.dailySpend} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0EDEA" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9B9590" }} tickFormatter={(v) => { const p = v.split("-"); return `${p[2]}/${p[1]}`; }} />
                    <YAxis tick={{ fontSize: 11, fill: "#9B9590" }} tickFormatter={(v) => `R$${v}`} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, border: "1px solid #E5E2DC", borderRadius: 8 }}
                      labelFormatter={(v) => { const p = String(v).split("-"); return `${p[2]}/${p[1]}/${p[0]}`; }}
                      formatter={(value, name) => {
                        const labels: Record<string, string> = { spend: "Gasto", clicks: "Cliques", impressions: "Impressoes" };
                        return [name === "spend" ? `R$${(value as number).toFixed(2)}` : formatNum(value as number), labels[name as string] || name];
                      }}
                    />
                    <Bar dataKey="spend" fill="#C75028" radius={[3, 3, 0, 0]} name="spend" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Campaign Performance Table */}
            {metaData.campaigns.length > 0 && (
              <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
                <h3 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-4">CAMPANHAS META ADS</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#E5E2DC]">
                        <th className="text-left py-2 pr-2 font-medium text-[#9B9590]">Campanha</th>
                        <th className="text-right py-2 px-2 font-medium text-[#9B9590]">Gasto</th>
                        <th className="text-right py-2 px-2 font-medium text-[#9B9590]">Cliques</th>
                        <th className="text-right py-2 px-2 font-medium text-[#9B9590]">CPC</th>
                        <th className="text-right py-2 px-2 font-medium text-[#9B9590]">CTR</th>
                        <th className="text-right py-2 pl-2 font-medium text-[#9B9590]">Impr.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metaData.campaigns.map((c, i) => (
                        <tr key={i} className="border-b border-[#F0EDEA] hover:bg-[#F9F8F6]">
                          <td className="py-2 pr-2 font-medium truncate max-w-[180px]" title={c.name}>{c.name}</td>
                          <td className="py-2 px-2 text-right text-red-600 font-medium">R${c.spend.toFixed(2)}</td>
                          <td className="py-2 px-2 text-right">{formatNum(c.clicks)}</td>
                          <td className="py-2 px-2 text-right">R${c.cpc.toFixed(2)}</td>
                          <td className="py-2 px-2 text-right">{c.ctr.toFixed(2)}%</td>
                          <td className="py-2 pl-2 text-right text-[#9B9590]">{formatNum(c.impressions)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-[#E5E2DC] font-bold">
                        <td className="py-2 pr-2">Total</td>
                        <td className="py-2 px-2 text-right text-red-600">R${metaData.campaigns.reduce((s, c) => s + c.spend, 0).toFixed(2)}</td>
                        <td className="py-2 px-2 text-right">{formatNum(metaData.campaigns.reduce((s, c) => s + c.clicks, 0))}</td>
                        <td className="py-2 px-2 text-right">{metaData.campaigns.reduce((s, c) => s + c.clicks, 0) > 0 ? `R$${(metaData.campaigns.reduce((s, c) => s + c.spend, 0) / metaData.campaigns.reduce((s, c) => s + c.clicks, 0)).toFixed(2)}` : "\u2014"}</td>
                        <td className="py-2 px-2 text-right">{metaData.ctr.toFixed(2)}%</td>
                        <td className="py-2 pl-2 text-right text-[#9B9590]">{formatNum(metaData.campaigns.reduce((s, c) => s + c.impressions, 0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Funnels Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">

        {/* ── CANAL ADS ── */}
        <div className="rounded-lg overflow-hidden border border-[#E5E2DC] flex flex-col">
          <div className="bg-[#1A1A1A] text-white px-4 py-4 text-center">
            <h3 className="text-lg font-bold tracking-wide">CANAL ADS</h3>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#2A2A2A] text-white">
                  <th className="text-left px-3 py-2 font-medium text-[10px] uppercase tracking-wide">Etapa do Funil</th>
                  <th className="text-center px-2 py-2 font-medium text-[10px] uppercase tracking-wide">Qtd</th>
                  <th className="text-center px-2 py-2 font-medium text-[10px] uppercase tracking-wide">Conv.</th>
                  <th className="text-center px-2 py-2 font-medium text-[10px] uppercase tracking-wide">Acum.</th>
                </tr>
              </thead>
              <tbody>
                {FUNNEL_ROWS.map((row, idx) => {
                  let value = 0;
                  if (row.sumOf) {
                    value = (effectiveAds[row.sumOf[0]] || 0) + (effectiveAds[row.sumOf[1]] || 0);
                  } else if (row.field) {
                    value = effectiveAds[row.field] || 0;
                  }
                  const isOptionalEmpty = row.optional && value === 0;

                  let convRate = "\u2014";
                  if (!row.noConv) {
                    if (row.isBase) convRate = "\u2014";
                    else if (isOptionalEmpty) convRate = "x";
                    else if (row.prev) {
                      const prevVal = getFunnelRef(row.prev, effectiveAds);
                      convRate = prevVal > 0 ? formatPct((value / prevVal) * 100) : "\u2014";
                    }
                  }

                  let convAccum = "\u2014";
                  if (!row.noConv && !row.noAccum) {
                    if (row.isBase) convAccum = "100%";
                    else if (isOptionalEmpty) convAccum = "x";
                    else if (row.prev) {
                      convAccum = funnelCliquesTotal > 0 ? formatPct((value / funnelCliquesTotal) * 100) : "\u2014";
                    }
                  }

                  let displayValue: React.ReactNode;
                  const fieldEditable = row.field ? isApiFieldEditable(row.field) : false;
                  if (isOptionalEmpty) {
                    displayValue = <span className="text-[#9B9590]">x</span>;
                  } else if (row.auto && !fieldEditable) {
                    displayValue = (
                      <span className={`font-semibold ${row.red ? "text-red-600" : ""}`}>
                        {row.currency ? formatCurrencyFull(value) : formatNum(value)}
                      </span>
                    );
                  } else if (row.field) {
                    displayValue = (
                      <input
                        type="number"
                        value={funnelInputs[row.field] ?? ""}
                        onChange={(e) => handleFunnelChange(row.field! as keyof FunnelData, e.target.value)}
                        placeholder="0"
                        className={`w-full max-w-[100px] px-1 py-1 text-sm border border-[#E5E2DC] rounded text-center focus:outline-none focus:border-[#C75028] ${row.red ? "text-red-600" : ""} ${fieldEditable ? "border-amber-400 bg-amber-50" : ""}`}
                      />
                    );
                  } else if (row.sumOf) {
                    displayValue = (
                      <span className={row.red ? "text-red-600 font-semibold" : "font-semibold"}>
                        {row.currency ? formatCurrencyFull(value) : formatNum(value)}
                      </span>
                    );
                  }

                  return (
                    <tr key={idx} className={`border-b border-[#F0EDEA] hover:bg-[#F9F8F6] ${row.bold ? "bg-[#FAFAF8]" : ""}`}>
                      <td className={`px-3 py-2 text-xs ${row.indent ? "pl-6" : ""} ${row.bold ? "font-bold" : ""}`}>
                        {row.label}
                      </td>
                      <td className="px-2 py-2 text-center text-xs">{displayValue}</td>
                      <td className={`px-2 py-2 text-center text-xs ${row.red ? "text-red-600" : "text-[#6B6560]"}`}>{convRate}</td>
                      <td className="px-2 py-2 text-center text-xs text-[#059669]">{convAccum}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="bg-[#F9F8F6] border-t border-[#E5E2DC] p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <p className="text-[10px] text-[#9B9590] uppercase mb-0.5">CPA</p>
                <p className="text-sm font-bold">
                  {funnelGastoTotal > 0 && adsAutoData.vendasFunil > 0 ? formatCurrencyFull(funnelGastoTotal / adsAutoData.vendasFunil) : "\u2014"}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-[#9B9590] uppercase mb-0.5">ROAS</p>
                <p className="text-sm font-bold">
                  {funnelGastoTotal > 0 && adsAutoData.faturamento > 0 ? `${(adsAutoData.faturamento / funnelGastoTotal).toFixed(1)}x` : "\u2014"}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-[#9B9590] uppercase mb-0.5">Investimento</p>
                <p className="text-sm font-bold">{formatCurrencyFull(funnelGastoTotal)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-[#9B9590] uppercase mb-0.5">ROI</p>
                <p className={`text-sm font-bold ${funnelGastoTotal > 0 && adsAutoData.faturamento > funnelGastoTotal ? "text-green-600" : funnelGastoTotal > 0 ? "text-red-600" : ""}`}>
                  {funnelGastoTotal > 0 ? `${(((adsAutoData.faturamento - funnelGastoTotal) / funnelGastoTotal) * 100).toFixed(0)}%` : "\u2014"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── CANAL AFILIADOS ── */}
        <div className="rounded-lg overflow-hidden border border-[#E5E2DC] flex flex-col">
          <div className="bg-[#1A1A1A] text-white px-4 py-4 text-center">
            <h3 className="text-lg font-bold tracking-wide">CANAL AFILIADOS</h3>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#2A2A2A] text-white">
                  <th className="text-left px-3 py-2 font-medium text-[10px] uppercase tracking-wide">Etapa do Funil</th>
                  <th className="text-center px-2 py-2 font-medium text-[10px] uppercase tracking-wide">Qtd</th>
                  <th className="text-center px-2 py-2 font-medium text-[10px] uppercase tracking-wide">Conv.</th>
                  <th className="text-center px-2 py-2 font-medium text-[10px] uppercase tracking-wide">Acum.</th>
                </tr>
              </thead>
              <tbody>
                {FUNNEL_AFILIADOS_ROWS.map((row, idx) => {
                  const value = effectiveAfiliados[row.field!] || 0;
                  const accumBase = effectiveAfiliados["sessoesAfiliados"] || 0;

                  let convRate = "\u2014";
                  if (!row.noConv) {
                    if (row.isBase) convRate = "\u2014";
                    else if (row.prev) {
                      const prevVal = effectiveAfiliados[row.prev] || 0;
                      convRate = prevVal > 0 ? formatPct((value / prevVal) * 100) : "\u2014";
                    }
                  }

                  let convAccum = "\u2014";
                  if (!row.noConv && !row.noAccum) {
                    if (row.isBase) convAccum = "100%";
                    else if (row.prev) {
                      convAccum = accumBase > 0 ? formatPct((value / accumBase) * 100) : "\u2014";
                    }
                  }

                  return (
                    <tr key={idx} className={`border-b border-[#F0EDEA] hover:bg-[#F9F8F6] ${row.bold ? "bg-[#FAFAF8]" : ""}`}>
                      <td className={`px-3 py-2 text-xs ${row.bold ? "font-bold" : ""}`}>{row.label}</td>
                      <td className="px-2 py-2 text-center text-xs">
                        {row.auto && !(row.field && isApiFieldEditable(row.field)) ? (
                          <span className={`font-semibold ${row.red ? "text-red-600" : ""}`}>
                            {row.currency ? formatCurrencyFull(value) : formatNum(value)}
                          </span>
                        ) : (
                          <input
                            type="number"
                            value={funnelAfiliadosInputs[row.field!] ?? ""}
                            onChange={(e) => {
                              setFunnelAfiliadosInputs(prev => ({ ...prev, [row.field!]: e.target.value }));
                              if (!isApiFieldEditable(row.field!)) {
                                handleFunnelAfiliadosChange(row.field! as keyof FunnelAfiliadosData, e.target.value);
                              }
                            }}
                            placeholder="0"
                            className={`w-full max-w-[100px] px-1 py-1 text-sm border border-[#E5E2DC] rounded text-center focus:outline-none focus:border-[#C75028] ${row.red ? "text-red-600" : ""} ${row.field && isApiFieldEditable(row.field) ? "border-amber-400 bg-amber-50" : ""}`}
                          />
                        )}
                      </td>
                      <td className={`px-2 py-2 text-center text-xs ${row.red ? "text-red-600" : "text-[#6B6560]"}`}>{convRate}</td>
                      <td className="px-2 py-2 text-center text-xs text-[#059669]">{convAccum}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="bg-[#F9F8F6] border-t border-[#E5E2DC] p-4 mt-auto">
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <p className="text-[10px] text-[#9B9590] uppercase mb-0.5">CPA</p>
                <p className="text-sm font-bold">
                  {funnelAfiliados.gastoFixoProdutos > 0 && afiliadosAutoData.vendasFunil > 0 ? formatCurrencyFull(funnelAfiliados.gastoFixoProdutos / afiliadosAutoData.vendasFunil) : "\u2014"}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-[#9B9590] uppercase mb-0.5">ROAS</p>
                <p className="text-sm font-bold">
                  {funnelAfiliados.gastoFixoProdutos > 0 && afiliadosAutoData.faturamento > 0 ? `${(afiliadosAutoData.faturamento / funnelAfiliados.gastoFixoProdutos).toFixed(1)}x` : "\u2014"}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-[#9B9590] uppercase mb-0.5">Investimento</p>
                <p className="text-sm font-bold">{formatCurrencyFull(funnelAfiliados.gastoFixoProdutos)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-[#9B9590] uppercase mb-0.5">ROI</p>
                <p className={`text-sm font-bold ${funnelAfiliados.gastoFixoProdutos > 0 && afiliadosAutoData.faturamento > funnelAfiliados.gastoFixoProdutos ? "text-green-600" : funnelAfiliados.gastoFixoProdutos > 0 ? "text-red-600" : ""}`}>
                  {funnelAfiliados.gastoFixoProdutos > 0 ? `${(((afiliadosAutoData.faturamento - funnelAfiliados.gastoFixoProdutos) / funnelAfiliados.gastoFixoProdutos) * 100).toFixed(0)}%` : "\u2014"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── CANAL MEDICOS ── */}
        <div className="rounded-lg overflow-hidden border border-[#E5E2DC] flex flex-col">
          <div className="bg-[#1A1A1A] text-white px-4 py-4 text-center">
            <h3 className="text-lg font-bold tracking-wide">CANAL MEDICOS</h3>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#2A2A2A] text-white">
                  <th className="text-left px-3 py-2 font-medium text-[10px] uppercase tracking-wide">Etapa do Funil</th>
                  <th className="text-center px-2 py-2 font-medium text-[10px] uppercase tracking-wide">Qtd</th>
                  <th className="text-center px-2 py-2 font-medium text-[10px] uppercase tracking-wide">Conv.</th>
                </tr>
              </thead>
              <tbody>
                {FUNNEL_MEDICOS_ROWS.map((row, idx) => {
                  const value = effectiveMedicos[row.field!] || 0;

                  let convRate = "\u2014";
                  if (!row.noConv) {
                    if (row.isBase) convRate = "\u2014";
                    else if (row.prev) {
                      const prevVal = effectiveMedicos[row.prev] || 0;
                      convRate = prevVal > 0 ? formatPct((value / prevVal) * 100) : "\u2014";
                    }
                  }

                  return (
                    <tr key={idx} className={`border-b border-[#F0EDEA] hover:bg-[#F9F8F6] ${row.bold ? "bg-[#FAFAF8]" : ""}`}>
                      <td className={`px-3 py-2 text-xs ${row.bold ? "font-bold" : ""}`}>{row.label}</td>
                      <td className="px-2 py-2 text-center text-xs">
                        {row.auto ? (
                          <span className={`font-semibold ${row.red ? "text-red-600" : ""}`}>
                            {row.currency ? formatCurrencyFull(value) : formatNum(value)}
                          </span>
                        ) : (
                          <input
                            type="number"
                            value={funnelMedicosInputs[row.field!] ?? ""}
                            onChange={(e) => handleFunnelMedicosChange(row.field! as keyof FunnelMedicosData, e.target.value)}
                            placeholder="0"
                            className={`w-full max-w-[100px] px-1 py-1 text-sm border border-[#E5E2DC] rounded text-center focus:outline-none focus:border-[#C75028] ${row.red ? "text-red-600" : ""}`}
                          />
                        )}
                      </td>
                      <td className={`px-2 py-2 text-center text-xs ${row.red ? "text-red-600" : "text-[#6B6560]"}`}>{convRate}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="bg-[#F9F8F6] border-t border-[#E5E2DC] p-4 mt-auto">
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <p className="text-[10px] text-[#9B9590] uppercase mb-0.5">CPA</p>
                <p className="text-sm font-bold">
                  {funnelMedicos.gastoProdutosComissoes > 0 && medicosAutoData.vendasFeitas > 0 ? formatCurrencyFull(funnelMedicos.gastoProdutosComissoes / medicosAutoData.vendasFeitas) : "\u2014"}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-[#9B9590] uppercase mb-0.5">ROAS</p>
                <p className="text-sm font-bold">
                  {funnelMedicos.gastoProdutosComissoes > 0 && medicosAutoData.faturamento > 0 ? `${(medicosAutoData.faturamento / funnelMedicos.gastoProdutosComissoes).toFixed(1)}x` : "\u2014"}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-[#9B9590] uppercase mb-0.5">Investimento</p>
                <p className="text-sm font-bold">{formatCurrencyFull(funnelMedicos.gastoProdutosComissoes)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-[#9B9590] uppercase mb-0.5">ROI</p>
                <p className={`text-sm font-bold ${funnelMedicos.gastoProdutosComissoes > 0 && medicosAutoData.faturamento > funnelMedicos.gastoProdutosComissoes ? "text-green-600" : funnelMedicos.gastoProdutosComissoes > 0 ? "text-red-600" : ""}`}>
                  {funnelMedicos.gastoProdutosComissoes > 0 ? `${(((medicosAutoData.faturamento - funnelMedicos.gastoProdutosComissoes) / funnelMedicos.gastoProdutosComissoes) * 100).toFixed(0)}%` : "\u2014"}
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Ads Sub-Channels: Form vs Typebot */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        {/* ── SUB-CANAL FORM ── */}
        <div className="rounded-lg overflow-hidden border border-[#2563EB]">
          <div className="bg-[#2563EB] text-white px-4 py-3 flex items-center justify-between">
            <h3 className="text-sm font-bold tracking-wide">FORM (Ads)</h3>
            <span className="text-xs opacity-80">{formatNum(adsSubAutoData.form.leads)} leads</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#EFF6FF] border-b border-[#DBEAFE]">
                <th className="text-left px-3 py-2 font-medium text-[10px] uppercase tracking-wide text-[#6B6560]">Metrica</th>
                <th className="text-center px-2 py-2 font-medium text-[10px] uppercase tracking-wide text-[#6B6560]">Qtd</th>
                <th className="text-center px-2 py-2 font-medium text-[10px] uppercase tracking-wide text-[#6B6560]">Conv.</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Leads", value: adsSubAutoData.form.leads, base: true },
                { label: "Leads Completo", value: adsSubAutoData.form.leadsCompleto, prev: adsSubAutoData.form.leads },
                { label: "Form. Aprovados", value: adsSubAutoData.form.formAprovados, prev: adsSubAutoData.form.leadsCompleto },
                { label: "Form. Rejeitados", value: adsSubAutoData.form.formRejeitados, prev: adsSubAutoData.form.leadsCompleto, red: true },
                { label: "Consultas Agendadas", value: adsSubAutoData.form.consultasAgendadas, prev: adsSubAutoData.form.formAprovados },
                { label: "Consultas Feitas", value: adsSubAutoData.form.consultasFeitas, prev: adsSubAutoData.form.consultasAgendadas },
                { label: "Agendamentos (<R$100)", value: adsSubAutoData.form.agendamentos, prev: adsSubAutoData.form.formAprovados, bold: true },
                { label: "Vendas (≥R$100)", value: adsSubAutoData.form.vendas, prev: adsSubAutoData.form.formAprovados, bold: true },
              ].map((row, idx) => (
                <tr key={idx} className={`border-b border-[#F0EDEA] hover:bg-[#F9F8F6] ${row.bold ? "bg-[#FAFAF8]" : ""}`}>
                  <td className={`px-3 py-1.5 text-xs ${row.bold ? "font-bold" : ""}`}>{row.label}</td>
                  <td className={`px-2 py-1.5 text-center text-xs font-semibold ${row.red ? "text-red-600" : ""}`}>{formatNum(row.value)}</td>
                  <td className={`px-2 py-1.5 text-center text-xs ${row.red ? "text-red-600" : "text-[#6B6560]"}`}>
                    {row.base ? "\u2014" : row.prev && row.prev > 0 ? formatPct((row.value / row.prev) * 100) : "\u2014"}
                  </td>
                </tr>
              ))}
              <tr className="bg-[#EFF6FF] font-semibold">
                <td className="px-3 py-1.5 text-xs">Faturamento</td>
                <td className="px-2 py-1.5 text-center text-xs" colSpan={2}>{formatCurrencyFull(adsSubAutoData.form.faturamento)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── SUB-CANAL TYPEBOT ── */}
        <div className="rounded-lg overflow-hidden border border-[#14B8A6]">
          <div className="bg-[#14B8A6] text-white px-4 py-3 flex items-center justify-between">
            <h3 className="text-sm font-bold tracking-wide">TYPEBOT (Ads)</h3>
            <span className="text-xs opacity-80">{formatNum(adsSubAutoData.typebot.leads)} leads</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F0FDFA] border-b border-[#CCFBF1]">
                <th className="text-left px-3 py-2 font-medium text-[10px] uppercase tracking-wide text-[#6B6560]">Metrica</th>
                <th className="text-center px-2 py-2 font-medium text-[10px] uppercase tracking-wide text-[#6B6560]">Qtd</th>
                <th className="text-center px-2 py-2 font-medium text-[10px] uppercase tracking-wide text-[#6B6560]">Conv.</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Leads", value: adsSubAutoData.typebot.leads, base: true },
                { label: "Leads Completo", value: adsSubAutoData.typebot.leadsCompleto, prev: adsSubAutoData.typebot.leads },
                { label: "Form. Aprovados", value: adsSubAutoData.typebot.formAprovados, prev: adsSubAutoData.typebot.leadsCompleto },
                { label: "Form. Rejeitados", value: adsSubAutoData.typebot.formRejeitados, prev: adsSubAutoData.typebot.leadsCompleto, red: true },
                { label: "Consultas Agendadas", value: adsSubAutoData.typebot.consultasAgendadas, prev: adsSubAutoData.typebot.formAprovados },
                { label: "Consultas Feitas", value: adsSubAutoData.typebot.consultasFeitas, prev: adsSubAutoData.typebot.consultasAgendadas },
                { label: "Agendamentos (<R$100)", value: adsSubAutoData.typebot.agendamentos, prev: adsSubAutoData.typebot.formAprovados, bold: true },
                { label: "Vendas (≥R$100)", value: adsSubAutoData.typebot.vendas, prev: adsSubAutoData.typebot.formAprovados, bold: true },
              ].map((row, idx) => (
                <tr key={idx} className={`border-b border-[#F0EDEA] hover:bg-[#F9F8F6] ${row.bold ? "bg-[#FAFAF8]" : ""}`}>
                  <td className={`px-3 py-1.5 text-xs ${row.bold ? "font-bold" : ""}`}>{row.label}</td>
                  <td className={`px-2 py-1.5 text-center text-xs font-semibold ${row.red ? "text-red-600" : ""}`}>{formatNum(row.value)}</td>
                  <td className={`px-2 py-1.5 text-center text-xs ${row.red ? "text-red-600" : "text-[#6B6560]"}`}>
                    {row.base ? "\u2014" : row.prev && row.prev > 0 ? formatPct((row.value / row.prev) * 100) : "\u2014"}
                  </td>
                </tr>
              ))}
              <tr className="bg-[#F0FDFA] font-semibold">
                <td className="px-3 py-1.5 text-xs">Faturamento</td>
                <td className="px-2 py-1.5 text-center text-xs" colSpan={2}>{formatCurrencyFull(adsSubAutoData.typebot.faturamento)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Aggregate Table */}
      <div className="mb-10">
        <h2 className="text-xs font-medium tracking-widest uppercase text-[#C75028] mb-3">AGREGADO POR CAMINHO</h2>
        <div className="overflow-hidden rounded-lg border border-[#E5E2DC]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F9F8F6] border-b border-[#E5E2DC]">
                <th className="text-left px-4 py-2.5 font-medium text-[#6B6560]">Caminho</th>
                <th className="text-center px-4 py-2.5 font-medium text-[#6B6560]">Vendas</th>
                <th className="text-center px-4 py-2.5 font-medium text-[#14B8A6]">Agend.</th>
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
                const totalPath = a.vendas + (a.agendamentos || 0);
                const ticket = totalPath > 0 ? revenue / totalPath : 0;
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
                    <td className="px-4 py-2.5 text-center font-semibold text-[#14B8A6]">{a.agendamentos || 0}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{formatCurrencyNum(revenue)}</td>
                    <td className="px-4 py-2.5 text-right text-[#6B6560]">{formatCurrencyNum(ticket)}</td>
                    <td className="px-4 py-2.5 text-center text-[#6B6560]">{totalByPath[a.path] || "\u2014"}</td>
                    <td className="px-4 py-2.5 text-center text-[#6B6560]">
                      {totalByPath[a.path]
                        ? `${((totalPath / totalByPath[a.path]) * 100).toFixed(1)}%`
                        : "\u2014"}
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
                <td className="px-4 py-2.5 text-center text-[#14B8A6]">{totalAgendamentos}</td>
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
                <th className="text-center px-4 py-2.5 font-medium text-[#6B6560]">Tipo</th>
                <th className="text-center px-4 py-2.5 font-medium text-[#6B6560]">Afiliado</th>
                <th className="text-center px-4 py-2.5 font-medium text-[#6B6560]">Sem Atendimento</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s, i) => (
                <tr key={`${s.id}-${i}`} className="border-b border-[#F0EDEA] hover:bg-[#F9F8F6]">
                  <td className="px-4 py-2.5 font-medium">{s.name || "\u2014"}</td>
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
                    {s.is_agendamento ? (
                      <span className="inline-flex px-2 py-0.5 text-[10px] font-medium rounded bg-[#F0FDFA] text-[#14B8A6]">Agend.</span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 text-[10px] font-medium rounded bg-[#F0FDF4] text-[#059669]">Venda</span>
                    )}
                  </td>
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
