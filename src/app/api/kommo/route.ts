import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BASE = "https://contatoslimasaudecom.kommo.com";
const PIPELINE = 12894447;
const VERI = 14597455;
const THAISA = 14709187;

const STAGES = [
  { id: 99426635, name: "Incoming Leads" },
  { id: 99426639, name: "Form. Checkpoint" },
  { id: 99426643, name: "Form. Completo" },
  { id: 99426647, name: "Pagamento" },
  { id: 100099951, name: "Consulta Agendada" },
  { id: 101290563, name: "Negociacao" },
  { id: 142, name: "Ganho" },
  { id: 143, name: "Perdido" },
];
const OPEN_STAGES = STAGES.filter(s => s.id !== 142 && s.id !== 143);

let cached: { key: string; data: any; ts: number } | null = null;
const TTL = 300_000; // 5 min

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function toUnix(d: string, end: boolean) {
  const [y, m, day] = d.split("-").map(Number);
  // BRT = UTC-3: start of day 00:00 BRT = 03:00 UTC
  return end
    ? Math.floor(Date.UTC(y, m - 1, day + 1, 2, 59, 59) / 1000)
    : Math.floor(Date.UTC(y, m - 1, day, 3, 0, 0) / 1000);
}

function toDate(ts: number) {
  // Unix (UTC) → YYYY-MM-DD in BRT (UTC-3)
  return new Date((ts - 10800) * 1000).toISOString().slice(0, 10);
}

async function hit(path: string): Promise<any> {
  const t = process.env.KOMMO_LONG_LIVED_TOKEN;
  if (!t) throw new Error("KOMMO_LONG_LIVED_TOKEN not configured");
  const r = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${t}` },
  });
  if (r.status === 204) return null;
  if (r.status === 429) {
    await wait(2000);
    return hit(path);
  }
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Kommo ${r.status}: ${txt.slice(0, 300)}`);
  }
  return r.json();
}

async function pages(base: string, key: string, max = 10): Promise<any[]> {
  const items: any[] = [];
  const sep = base.includes("?") ? "&" : "?";
  for (let p = 1; p <= max; p++) {
    await wait(150);
    const d = await hit(`${base}${sep}page=${p}&limit=250`);
    if (!d?._embedded?.[key]) break;
    items.push(...d._embedded[key]);
    if (!d._links?.next) break;
  }
  return items;
}

export async function GET(req: NextRequest) {
  if (req.cookies.get("sg_auth")?.value !== "1")
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const u = new URL(req.url);
  const from = u.searchParams.get("from");
  const to = u.searchParams.get("to");
  const ck = `${from || ""}_${to || ""}`;

  if (cached?.key === ck && Date.now() - cached.ts < TTL)
    return NextResponse.json(cached.data);

  try {
    // Filter for all stages in pipeline 12894447
    const sf = STAGES.map((s, i) =>
      `filter[statuses][${i}][status_id]=${s.id}&filter[statuses][${i}][pipeline_id]=${PIPELINE}`
    ).join("&");

    // 1. Fetch all pipeline leads (with contact IDs)
    const rawLeads = await pages(`/api/v4/leads?${sf}&with=contacts`, "leads");
    const pLeads = rawLeads.filter(l => l.pipeline_id === PIPELINE);

    const fU = from ? toUnix(from, false) : null;
    const tU = to ? toUnix(to, true) : null;

    // Date-filtered leads (created_at) for funnel
    const dLeads = pLeads.filter(l =>
      (!fU || l.created_at >= fU) && (!tU || l.created_at <= tU)
    );

    // Won/lost (closed_at) for performance
    const won = pLeads.filter(l =>
      l.status_id === 142 && l.closed_at &&
      (!fU || l.closed_at >= fU) && (!tU || l.closed_at <= tU)
    );
    const lost = pLeads.filter(l =>
      l.status_id === 143 && l.closed_at &&
      (!fU || l.closed_at >= fU) && (!tU || l.closed_at <= tU)
    );

    // Funnel (date-filtered)
    const funnel = OPEN_STAGES.map(st => {
      const v = dLeads.filter(l => l.status_id === st.id && l.responsible_user_id === VERI).length;
      const t = dLeads.filter(l => l.status_id === st.id && l.responsible_user_id === THAISA).length;
      return { id: st.id, name: st.name, veri: v, thaisa: t, total: v + t };
    });

    // Performance
    const perf = (uid: number | null) => {
      const w = won.filter(l => !uid || l.responsible_user_id === uid);
      const lo = lost.filter(l => !uid || l.responsible_user_id === uid);
      const n = w.length + lo.length;
      const days = w.filter(l => l.closed_at && l.created_at).map(l => (l.closed_at - l.created_at) / 86400);
      return {
        won: w.length,
        lost: lo.length,
        winRate: n > 0 ? (w.length / n) * 100 : 0,
        avgDays: days.length > 0 ? days.reduce((a, b) => a + b, 0) / days.length : 0,
      };
    };

    // Health (current snapshot, no date filter)
    const health = OPEN_STAGES.map(st => {
      const v = pLeads.filter(l => l.status_id === st.id && l.responsible_user_id === VERI).length;
      const t = pLeads.filter(l => l.status_id === st.id && l.responsible_user_id === THAISA).length;
      return { id: st.id, name: st.name, veri: v, thaisa: t, total: v + t };
    });

    const now = Math.floor(Date.now() / 1000);
    const staleLeads = pLeads.filter(l =>
      l.status_id !== 142 && l.status_id !== 143 && l.updated_at < now - 7 * 86400
    );

    // 2. Events for activity (sequential, rate-limited)
    let ef = "";
    if (fU) ef += `&filter[created_at][from]=${fU}`;
    if (tU) ef += `&filter[created_at][to]=${tU}`;

    const msgs = await pages(`/api/v4/events?filter[type][]=outgoing_chat_message${ef}`, "events", 5);
    const calls = await pages(`/api/v4/events?filter[type][]=outgoing_call${ef}`, "events", 5);
    const statusEvts = await pages(`/api/v4/events?filter[type][]=lead_status_changed${ef}`, "events", 5);

    // Group activity by day and vendedora
    const actMap: Record<string, { veri: { msgs: number; calls: number; changes: number }; thaisa: { msgs: number; calls: number; changes: number } }> = {};
    const addEvt = (evts: any[], key: "msgs" | "calls" | "changes") => {
      for (const e of evts) {
        const uid = e.created_by;
        if (uid !== VERI && uid !== THAISA) continue;
        const day = toDate(e.created_at);
        if (!actMap[day]) actMap[day] = {
          veri: { msgs: 0, calls: 0, changes: 0 },
          thaisa: { msgs: 0, calls: 0, changes: 0 },
        };
        actMap[day][uid === VERI ? "veri" : "thaisa"][key]++;
      }
    };
    addEvt(msgs, "msgs");
    addEvt(calls, "calls");
    addEvt(statusEvts, "changes");

    const activity = Object.entries(actMap)
      .map(([date, d]) => ({ date, veri: d.veri, thaisa: d.thaisa }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 3. Open tasks (for overdue)
    const openTasks = await pages(`/api/v4/tasks?filter[is_completed]=0`, "tasks", 3);
    const overdue = openTasks.filter(t => t.complete_till && t.complete_till < now);

    // 4. Contact details for won/lost leads
    const cIds = new Set<number>();
    for (const l of [...won, ...lost]) {
      const contacts = l._embedded?.contacts;
      if (contacts) for (const c of contacts) cIds.add(c.id);
    }

    const contactMap: Record<number, { name: string; phone: string }> = {};
    const idArr = [...cIds];
    for (let i = 0; i < idArr.length; i += 50) {
      const batch = idArr.slice(i, i + 50);
      const f = batch.map(id => `filter[id][]=${id}`).join("&");
      const contacts = await pages(`/api/v4/contacts?${f}`, "contacts", 1);
      for (const c of contacts) {
        let phone = "";
        const pf = c.custom_fields_values?.find((v: any) =>
          v.field_code === "PHONE" || String(v.field_name || "").toLowerCase().includes("phone")
        );
        if (pf?.values?.[0]?.value) phone = pf.values[0].value;
        contactMap[c.id] = { name: c.name || "", phone };
      }
    }

    const detail = (l: any) => {
      const cid = l._embedded?.contacts?.[0]?.id;
      const c = cid ? contactMap[cid] : null;
      return {
        name: c?.name || l.name || "\u2014",
        phone: c?.phone || "\u2014",
        createdAt: toDate(l.created_at),
        closedAt: l.closed_at ? toDate(l.closed_at) : "\u2014",
        vendedora: l.responsible_user_id === VERI ? "Veridiana"
          : l.responsible_user_id === THAISA ? "Thaisa" : "Outro",
      };
    };

    const result = {
      funnel,
      performance: { veri: perf(VERI), thaisa: perf(THAISA), total: perf(null) },
      health,
      staleLeads: {
        veri: staleLeads.filter(l => l.responsible_user_id === VERI).length,
        thaisa: staleLeads.filter(l => l.responsible_user_id === THAISA).length,
        total: staleLeads.length,
      },
      overdueTasks: {
        veri: overdue.filter(t => t.responsible_user_id === VERI).length,
        thaisa: overdue.filter(t => t.responsible_user_id === THAISA).length,
        total: overdue.length,
      },
      activity,
      wonLeads: won.map(detail),
      lostLeads: lost.map(detail),
    };

    cached = { key: ck, data: result, ts: Date.now() };
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
