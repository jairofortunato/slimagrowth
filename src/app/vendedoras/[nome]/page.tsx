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

interface KommoLead {
  kommoId?: number;
  name: string;
  phone: string;
  price?: number;
  createdAt: string;
  closedAt: string;
  vendedora: string;
}

interface KommoData {
  wonLeads: KommoLead[];
  lostLeads: KommoLead[];
}

// ─── Config ───────────────────────────────────────────────────────────────
const COMMISSION_PER_SALE = 30;

const VENDEDORAS = {
  veri: { display: "Veridiana", short: "Veri", color: "#C75028", match: ["Veridiana"] },
  thaisa: { display: "Thaisa", short: "Thaisa", color: "#2563EB", match: ["Thaisa", "Gabriel"] },
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

// ─── Tipo unificado da tabela ─────────────────────────────────────────────
interface UnifiedRow {
  key: string;
  name: string;
  phone: string;
  date: string; // YYYY-MM-DD
  value: number;
  originalVendedor: string;
  reassigned: boolean;
  source: "sistema" | "kommo";
}

export default function VendedoraDetailPage() {
  const params = useParams<{ nome: string }>();
  const slug = (params?.nome || "").toLowerCase() as VendedoraSlug;
  const config = VENDEDORAS[slug];

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [kommo, setKommo] = useState<KommoData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [progressionEnabled, setProgressionEnabled] = useState(false);

  // Auth check via lightweight endpoint
  useEffect(() => {
    fetch("/api/sales")
      .then((r) => setAuthed(r.ok))
      .catch(() => setAuthed(false));
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [salesRes, kommoRes] = await Promise.all([
        fetch("/api/sales"),
        fetch("/api/kommo"),
      ]);
      if (salesRes.status === 401 || kommoRes.status === 401) {
        setAuthed(false);
        return;
      }
      const salesJson = await salesRes.json();
      const kommoJson = await kommoRes.json();
      if (salesJson.error) setError(salesJson.error);
      else setSales(salesJson.sales || []);
      if (!kommoJson.error) setKommo(kommoJson);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authed) loadData();
  }, [authed, loadData]);

  // ─── Filtragem por vendedora ────────────────────────────────────────────
  const ownedSales = useMemo(() => {
    if (!config) return [] as SaleRow[];
    return sales.filter((s) => {
      const v = (s.vendedor || "").trim();
      return config.match.some((m) => v.toLowerCase() === m.toLowerCase());
    });
  }, [sales, config]);

  const ownedKommo = useMemo(() => {
    if (!config || !kommo) return { won: [] as KommoLead[], lost: [] as KommoLead[] };
    const matcher = (l: KommoLead) =>
      config.match.some((m) => (l.vendedora || "").toLowerCase() === m.toLowerCase());
    return {
      won: kommo.wonLeads.filter(matcher),
      lost: kommo.lostLeads.filter(matcher),
    };
  }, [kommo, config]);

  // ─── Tabela unificada (sistema + Kommo, dedup por telefone) ─────────────
  const unifiedRows: UnifiedRow[] = useMemo(() => {
    const map = new Map<string, UnifiedRow>();

    for (const s of ownedSales) {
      const value = s.order_value ? parseFloat(s.order_value) : 0;
      const k = phoneKey(s.phone) || `sys-${s.id}`;
      const origVend = (s.vendedor || "—").trim();
      map.set(k, {
        key: k,
        name: s.name || "—",
        phone: s.phone || "",
        date: s.sale_date.slice(0, 10),
        value,
        originalVendedor: origVend,
        reassigned: slug === "thaisa" && origVend.toLowerCase() === "gabriel",
        source: "sistema",
      });
    }

    for (const l of ownedKommo.won) {
      const k = phoneKey(l.phone) || `kommo-${l.kommoId}`;
      if (map.has(k)) continue; // o sistema já tem essa venda
      const origVend = (l.vendedora || "—").trim();
      map.set(k, {
        key: k,
        name: l.name || "—",
        phone: l.phone || "",
        date: (l.closedAt && l.closedAt !== "—" ? l.closedAt : l.createdAt).slice(0, 10),
        value: l.price || 0,
        originalVendedor: origVend,
        reassigned: slug === "thaisa" && origVend.toLowerCase() === "gabriel",
        source: "kommo",
      });
    }

    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [ownedSales, ownedKommo, slug]);

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return unifiedRows;
    const q = searchQuery.toLowerCase();
    return unifiedRows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.phone.replace(/\D/g, "").includes(q.replace(/\D/g, "")),
    );
  }, [unifiedRows, searchQuery]);

  // ─── KPIs ────────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const total = unifiedRows.length;
    const reassigned = unifiedRows.filter((r) => r.reassigned).length;
    const faturamento = unifiedRows.reduce((s, r) => s + r.value, 0);
    const ticketMedio = total > 0 ? faturamento / total : 0;
    const comissao = total * COMMISSION_PER_SALE;
    return { total, reassigned, faturamento, ticketMedio, comissao };
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

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-8">
        <div>
          <p className="text-xs font-medium tracking-widest uppercase mb-1" style={{ color: config.color }}>
            SLIMA GROWTH · VENDEDORA
          </p>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <span className="w-4 h-4 rounded-full" style={{ backgroundColor: config.color }} />
            {config.display}
          </h1>
          <p className="text-xs text-[#9B9590] mt-1">
            Histórico completo de vendas e leads
            {slug === "thaisa" && totals.reassigned > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-medium">
                {totals.reassigned} venda{totals.reassigned > 1 ? "s" : ""} transferida{totals.reassigned > 1 ? "s" : ""} do Gabriel
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={slug === "veri" ? "/vendedoras/thaisa" : "/vendedoras/veri"}
            className="px-3 py-1.5 text-xs font-medium border border-[#E5E2DC] rounded-lg hover:bg-[#F9F8F6] transition-colors"
          >
            Ver {slug === "veri" ? "Thaisa" : "Veri"} →
          </a>
          <a href="/vendedoras" className="text-xs text-[#C75028] hover:underline">← Painel Vendedoras</a>
        </div>
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-10 text-center mb-6">
          <p className="text-sm text-[#9B9590]">Carregando dados…</p>
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6">
          <p className="text-sm text-red-700"><span className="font-medium">Erro:</span> {error}</p>
        </div>
      )}

      {!loading && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
              <p className="text-xs text-[#9B9590] uppercase tracking-wide mb-1">Total de vendas</p>
              <p className="text-3xl font-bold" style={{ color: config.color }}>{totals.total}</p>
              {slug === "thaisa" && totals.reassigned > 0 && (
                <p className="text-[10px] text-[#9B9590] mt-1">incluindo {totals.reassigned} do Gabriel</p>
              )}
            </div>
            <div className="bg-white border border-[#E5E2DC] rounded-lg p-5">
              <p className="text-xs text-[#9B9590] uppercase tracking-wide mb-1">Faturamento</p>
              <p className="text-3xl font-bold">{fmtBRL(totals.faturamento)}</p>
              <p className="text-[10px] text-[#9B9590] mt-1">ticket médio {fmtBRL(totals.ticketMedio)}</p>
            </div>

            {/* Card de comissão */}
            <div
              className="border rounded-lg p-5"
              style={{ backgroundColor: `${config.color}08`, borderColor: `${config.color}33` }}
            >
              <p className="text-xs uppercase tracking-wide mb-1 font-medium" style={{ color: config.color }}>
                Comissão (R$ 30 / venda)
              </p>
              <p className="text-3xl font-bold" style={{ color: config.color }}>{fmtBRL(totals.comissao)}</p>
              <p className="text-[10px] text-[#9B9590] mt-1">{totals.total} × R$ 30,00</p>
            </div>

            {/* Card de progressão (desligado) */}
            <div
              className={`border rounded-lg p-5 transition-opacity ${progressionEnabled ? "opacity-100" : "opacity-50"}`}
              style={{ borderStyle: "dashed", borderColor: "#9B9590" }}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs uppercase tracking-wide font-medium text-[#6B6560]">
                  Progressão de comissão
                </p>
                {/* Toggle */}
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
              <p className="text-xl font-bold text-[#6B6560]">
                {progressionEnabled ? "preview" : "em breve"}
              </p>
              <p className="text-[10px] text-[#9B9590] mt-1">
                {progressionEnabled
                  ? "regra ainda não definida — apenas demonstrativo"
                  : "ative quando a regra entrar em vigor"}
              </p>
            </div>
          </div>

          {/* Tabela */}
          <div className="bg-white border border-[#E5E2DC] rounded-lg p-5 mb-10">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-xs font-medium tracking-widest uppercase" style={{ color: config.color }}>
                  HISTÓRICO DE VENDAS · {config.display.toUpperCase()}
                </h3>
                <p className="text-[11px] text-[#9B9590] mt-1">
                  Use os telefones para retomar conversa, descobrir em que etapa do tratamento o lead está e oferecer nova venda.
                </p>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar nome ou telefone…"
                className="px-3 py-1.5 text-sm border border-[#E5E2DC] rounded-lg focus:outline-none focus:border-[#C75028] w-64"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F9F8F6] border-b border-[#E5E2DC]">
                    <th className="text-left px-4 py-2.5 font-medium text-[#6B6560] text-[11px] uppercase tracking-wide">Cliente</th>
                    <th className="text-left px-4 py-2.5 font-medium text-[#6B6560] text-[11px] uppercase tracking-wide">Telefone</th>
                    <th className="text-left px-4 py-2.5 font-medium text-[#6B6560] text-[11px] uppercase tracking-wide">Data</th>
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
                          ? "Nenhuma venda registrada para esta vendedora ainda."
                          : "Nenhum resultado para esse filtro."}
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((r) => {
                      const wa = whatsappLink(r.phone);
                      return (
                        <tr key={r.key} className="border-b border-[#F0EDEA] hover:bg-[#F9F8F6]">
                          <td className="px-4 py-2.5 font-medium">{r.name}</td>
                          <td className="px-4 py-2.5 text-[#6B6560] font-mono text-xs">{fmtPhone(r.phone)}</td>
                          <td className="px-4 py-2.5 text-[#6B6560]">{fmtDateBR(r.date)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold">
                            {r.value > 0 ? fmtBRL(r.value) : "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            {r.reassigned ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-medium rounded bg-amber-50 text-amber-700">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                Transferida do Gabriel
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-medium rounded"
                                style={{ backgroundColor: `${config.color}15`, color: config.color }}>
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: config.color }} />
                                {r.originalVendedor}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {wa ? (
                              <a
                                href={wa}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
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
                        Total ({filteredRows.length} venda{filteredRows.length > 1 ? "s" : ""})
                      </td>
                      <td className="px-4 py-3 text-right">
                        {fmtBRL(filteredRows.reduce((s, r) => s + r.value, 0))}
                      </td>
                      <td colSpan={2} className="px-4 py-3 text-[#6B6560] text-xs font-normal">
                        Comissão: {fmtBRL(filteredRows.length * COMMISSION_PER_SALE)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
