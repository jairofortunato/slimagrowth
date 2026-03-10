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

  // Fetch paid leads with their orders
  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, name, phone, checkout_path, payment_status, order_value, referring_afiliado_id, created_at")
    .eq("payment_status", "paid")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch paid orders to get actual sale dates
  const { data: orders } = await supabase
    .from("orders")
    .select("lead_id, created_at, amount_cents, status, checkout_path")
    .eq("status", "paid")
    .gte("amount_cents", 100000);

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

  // Total leads by checkout_path (for conversion rates)
  const { data: allLeads } = await supabase
    .from("leads")
    .select("checkout_path")
    .not("checkout_path", "is", null);

  const totalByPath: Record<string, number> = {};
  for (const l of allLeads || []) {
    const p = l.checkout_path || "unknown";
    totalByPath[p] = (totalByPath[p] || 0) + 1;
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
  });
}
