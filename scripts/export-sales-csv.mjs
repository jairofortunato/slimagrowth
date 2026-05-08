#!/usr/bin/env node
/**
 * Exporta todas as vendas (leads pagos com pelo menos um order pago > R$50)
 * para CSV, com colunas de período (dia, semana ISO, mês, ano, dia da semana
 * em pt-BR), tipo (venda x agendamento), vendedor e afiliado.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/export-sales-csv.mjs [--from=YYYY-MM-DD] [--to=YYYY-MM-DD] [--out=arquivo.csv]
 *
 * Sem --from/--to, exporta o histórico completo. Datas são aplicadas sobre
 * a data do order pago (sale_date_brt, fuso America/Sao_Paulo).
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const from = args.from ? String(args.from) : null;
const to = args.to ? String(args.to) : null;
const outPath = path.resolve(
  String(args.out || `exports/vendas-por-periodo${from || to ? `-${from || "inicio"}_a_${to || "hoje"}` : ""}.csv`),
);

const TZ = "America/Sao_Paulo";
const DIAS_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function periodoCols(saleDateUtc) {
  // Devolve { dia, semana, mes, ano, dia_semana, data_brt } no fuso BRT.
  const d = new Date(saleDateUtc);
  // Componentes em America/Sao_Paulo
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(d).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  );
  const yyyy = parts.year;
  const mm = parts.month;
  const dd = parts.day;
  const hh = parts.hour === "24" ? "00" : parts.hour;
  const mi = parts.minute;
  const ss = parts.second;
  const dia = `${yyyy}-${mm}-${dd}`;
  const dataBrt = `${dia} ${hh}:${mi}:${ss}`;
  // Recompõe um Date em UTC representando o instante BRT pra calcular semana/dia da semana
  const localAsUtc = new Date(`${dia}T${hh}:${mi}:${ss}Z`);
  const dow = localAsUtc.getUTCDay();
  const diaSemana = DIAS_PT[dow];
  // ISO week
  const tmp = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
  const semana = `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  return {
    sale_date_brt: dataBrt,
    periodo_dia: dia,
    periodo_semana: semana,
    periodo_mes: `${yyyy}-${mm}`,
    periodo_ano: yyyy,
    dia_semana: diaSemana,
  };
}

function csvCell(v) {
  if (v === null || v === undefined) return "";
  let s = String(v).replace(/\s+$/g, "");
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r") || s.includes(";")) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

async function main() {
  // 1) Leads pagos
  const { data: leads, error: leadsErr } = await supabase
    .from("leads")
    .select(
      "id, name, email, phone, cpf, checkout_path, payment_status, order_value, assigned_seller, referring_afiliado_id, revalife_status, user_id, created_at",
    )
    .eq("payment_status", "paid");
  if (leadsErr) throw leadsErr;

  // 2) Orders pagas > R$50
  let ordersQuery = supabase
    .from("orders")
    .select("lead_id, created_at, amount_cents, status")
    .eq("status", "paid")
    .gt("amount_cents", 5000);
  const { data: orders, error: ordersErr } = await ordersQuery;
  if (ordersErr) throw ordersErr;

  // Agrega por lead_id: earliest_paid_order_at, max_amount, total_amount, count
  const agg = {};
  for (const o of orders || []) {
    if (!o.lead_id) continue;
    const slot = agg[o.lead_id] || (agg[o.lead_id] = { earliest: null, max: 0, total: 0, count: 0 });
    if (!slot.earliest || o.created_at < slot.earliest) slot.earliest = o.created_at;
    if (o.amount_cents > slot.max) slot.max = o.amount_cents;
    slot.total += o.amount_cents;
    slot.count += 1;
  }

  // 3) Vendedoras
  const { data: sellers } = await supabase.from("sellers").select("slug, display_name");
  const sellerMap = Object.fromEntries((sellers || []).map((s) => [s.slug, s.display_name]));

  // 4) Afiliados
  const afiliadoIds = [
    ...new Set((leads || []).map((l) => l.referring_afiliado_id).filter(Boolean)),
  ];
  const afiliadoMap = {};
  if (afiliadoIds.length) {
    const { data: afis } = await supabase
      .from("afiliados")
      .select("id, name, referral_code")
      .in("id", afiliadoIds);
    for (const a of afis || []) afiliadoMap[a.id] = a;
  }

  // 5) Filtra leads que têm order pago e aplica filtro de data sobre o sale_date_brt
  const rows = [];
  for (const l of leads || []) {
    const a = agg[l.id];
    if (!a) continue;
    const periodo = periodoCols(a.earliest);
    if (from && periodo.periodo_dia < from) continue;
    if (to && periodo.periodo_dia > to) continue;
    rows.push({
      lead_id: l.id,
      name: l.name,
      email: l.email,
      phone: l.phone,
      cpf: l.cpf,
      checkout_path: l.checkout_path || "unknown",
      payment_status: l.payment_status,
      order_value: l.order_value,
      seller_slug: l.assigned_seller || "",
      vendedor: sellerMap[l.assigned_seller] || "",
      referring_afiliado_id: l.referring_afiliado_id || "",
      afiliado_name: afiliadoMap[l.referring_afiliado_id]?.name || "",
      afiliado_referral_code: afiliadoMap[l.referring_afiliado_id]?.referral_code || "",
      revalife_status: l.revalife_status,
      user_id: l.user_id,
      lead_created_at: l.created_at,
      sale_date_utc: a.earliest,
      sale_date_brt: periodo.sale_date_brt,
      periodo_dia: periodo.periodo_dia,
      periodo_semana: periodo.periodo_semana,
      periodo_mes: periodo.periodo_mes,
      periodo_ano: periodo.periodo_ano,
      dia_semana: periodo.dia_semana,
      max_amount_cents: a.max,
      total_amount_cents: a.total,
      paid_orders_count: a.count,
      tipo: a.max < 10000 ? "agendamento" : "venda",
      is_afiliado: !!l.referring_afiliado_id && l.checkout_path !== "prescription_checkout",
    });
  }

  rows.sort((x, y) => (x.sale_date_utc < y.sale_date_utc ? -1 : 1));

  const cols = rows.length ? Object.keys(rows[0]) : [];
  const csv = [cols.join(",")]
    .concat(rows.map((r) => cols.map((c) => csvCell(r[c])).join(",")))
    .join("\n");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, csv + "\n");
  console.log(`Wrote ${rows.length} rows to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
