import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Paths that count as "prescription" for the aggregation
const HUMAN_SALE_PATHS = [
  "prescription_checkout",
  "manual_sales",
  "form_web",
  "revalife_form",
  "chat_web",
  "chat_whatsapp",
  "whatsapp_flow",
];

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("sg_auth");
  if (cookie?.value !== "1") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Parse date range filters
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from"); // YYYY-MM-DD
  const to = searchParams.get("to"); // YYYY-MM-DD

  // Fetch paid leads with their orders
  let leadsQuery = supabase
    .from("leads")
    .select("id, name, phone, checkout_path, payment_status, order_value, referring_afiliado_id, created_at")
    .eq("payment_status", "paid")
    .order("created_at", { ascending: false });
  if (from) leadsQuery = leadsQuery.gte("created_at", `${from}T00:00:00`);
  if (to) leadsQuery = leadsQuery.lte("created_at", `${to}T23:59:59`);

  const { data: leads, error } = await leadsQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch paid orders to get actual sale dates
  let ordersQuery = supabase
    .from("orders")
    .select("lead_id, created_at, amount_cents, status, checkout_path")
    .eq("status", "paid")
    .gte("amount_cents", 100000);
  if (from) ordersQuery = ordersQuery.gte("created_at", `${from}T00:00:00`);
  if (to) ordersQuery = ordersQuery.lte("created_at", `${to}T23:59:59`);

  const { data: orders } = await ordersQuery;

  // Build a map of lead_id -> earliest paid order date
  const orderDateMap: Record<string, string> = {};
  for (const o of orders || []) {
    if (o.lead_id && (!orderDateMap[o.lead_id] || o.created_at < orderDateMap[o.lead_id])) {
      orderDateMap[o.lead_id] = o.created_at;
    }
  }

  // Filter to only leads that have a real paid order >= R$1000
  const sales = leads
    ?.filter((l) => orderDateMap[l.id])
    .map((l) => ({
      id: l.id,
      name: l.name,
      checkout_path: l.checkout_path || "unknown",
      order_value: l.order_value,
      sale_date: orderDateMap[l.id],
      is_affiliate: !!l.referring_afiliado_id && l.checkout_path !== "prescription_checkout",
      referring_afiliado_id: l.referring_afiliado_id,
    }));

  // Aggregate by checkout_path
  const aggMap: Record<string, { vendas: number; afiliado: number; sem_atendimento: number }> = {};
  for (const s of sales || []) {
    const path = s.checkout_path;
    if (!aggMap[path]) aggMap[path] = { vendas: 0, afiliado: 0, sem_atendimento: 0 };
    aggMap[path].vendas++;
    if (s.is_affiliate) aggMap[path].afiliado++;
  }

  const aggregate = Object.entries(aggMap)
    .map(([path, data]) => ({ path, ...data }))
    .sort((a, b) => b.vendas - a.vendas);

  // Total leads by checkout_path (for conversion rates + funnel metrics)
  let allLeadsQuery = supabase
    .from("leads")
    .select("checkout_path, referring_afiliado_id, revalife_status, user_id")
    .not("checkout_path", "is", null);
  if (from) allLeadsQuery = allLeadsQuery.gte("created_at", `${from}T00:00:00`);
  if (to) allLeadsQuery = allLeadsQuery.lte("created_at", `${to}T23:59:59`);

  const { data: allLeads } = await allLeadsQuery;

  // Fetch consultations for funnel data
  let consultQuery = supabase
    .from("consultations")
    .select("user_id, status");
  if (from) consultQuery = consultQuery.gte("created_at", `${from}T00:00:00`);
  if (to) consultQuery = consultQuery.lte("created_at", `${to}T23:59:59`);

  const { data: consultations } = await consultQuery;

  // Build user_id -> channel map from leads
  const userChannelMap: Record<string, string> = {};
  for (const l of allLeads || []) {
    if (!l.user_id) continue;
    const p = l.checkout_path || "unknown";
    if (p === "prescription_checkout") userChannelMap[l.user_id] = "medicos";
    else if (l.referring_afiliado_id) userChannelMap[l.user_id] = "afiliados";
    else userChannelMap[l.user_id] = "ads";
  }

  const totalByPath: Record<string, number> = {};
  const channelLeads = { ads: 0, afiliados: 0, medicos: 0 };
  const channelFunnel = {
    ads: { leadsCompleto: 0, formAprovados: 0, formRejeitados: 0, consultasAgendadas: 0, consultasFeitas: 0 },
    afiliados: { leadsCompleto: 0, formAprovados: 0, formRejeitados: 0, consultasAgendadas: 0, consultasFeitas: 0 },
    medicos: { leadsCompleto: 0, formAprovados: 0, formRejeitados: 0, consultasAgendadas: 0, consultasFeitas: 0 },
  };

  for (const l of allLeads || []) {
    const p = l.checkout_path || "unknown";
    totalByPath[p] = (totalByPath[p] || 0) + 1;
    let ch: "ads" | "afiliados" | "medicos";
    if (p === "prescription_checkout") ch = "medicos";
    else if (l.referring_afiliado_id) ch = "afiliados";
    else ch = "ads";
    channelLeads[ch]++;
    // leadsCompleto = form fully processed (not still IN_PROGRESS)
    if (l.revalife_status !== "IN_PROGRESS") channelFunnel[ch].leadsCompleto++;
    // null revalife_status counts as approved
    if (l.revalife_status === "APPROVED" || !l.revalife_status) channelFunnel[ch].formAprovados++;
    if (l.revalife_status === "REJECTED") channelFunnel[ch].formRejeitados++;
  }

  // Count consultations by channel
  for (const c of consultations || []) {
    if (!c.user_id) continue;
    const ch = userChannelMap[c.user_id] as "ads" | "afiliados" | "medicos" | undefined;
    if (!ch) continue;
    if (["scheduled", "done", "rescheduled", "no_show"].includes(c.status)) {
      channelFunnel[ch].consultasAgendadas++;
    }
    if (c.status === "done") {
      channelFunnel[ch].consultasFeitas++;
    }
  }

  // Revenue by path
  const revenueByPath: Record<string, number> = {};
  for (const s of sales || []) {
    const val = s.order_value ? parseFloat(s.order_value) : 0;
    revenueByPath[s.checkout_path] = (revenueByPath[s.checkout_path] || 0) + val;
  }

  // Daily sales (last 30 days)
  const dailySales: Record<string, { vendas: number; revenue: number }> = {};
  for (const s of sales || []) {
    const day = s.sale_date.slice(0, 10); // YYYY-MM-DD
    if (!dailySales[day]) dailySales[day] = { vendas: 0, revenue: 0 };
    dailySales[day].vendas++;
    dailySales[day].revenue += s.order_value ? parseFloat(s.order_value) : 0;
  }

  const dailyArray = Object.entries(dailySales)
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Total revenue
  const totalRevenue = (sales || []).reduce(
    (sum, s) => sum + (s.order_value ? parseFloat(s.order_value) : 0),
    0
  );

  return NextResponse.json({
    sales,
    aggregate,
    totalByPath,
    revenueByPath,
    dailySales: dailyArray,
    totalRevenue,
    channelLeads,
    channelFunnel,
  });
}
