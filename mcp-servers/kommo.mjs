#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const BASE = "https://contatoslimasaudecom.kommo.com";
const TOKEN = process.env.KOMMO_LONG_LIVED_TOKEN;
const PIPELINE = 12894447;

const USERS = {
  14597455: "Veridiana",
  14709187: "Thaisa",
};
const USER_IDS = { veridiana: 14597455, thaisa: 14709187 };

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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function toUnix(d, end) {
  const [y, m, day] = d.split("-").map(Number);
  return end
    ? Math.floor(Date.UTC(y, m - 1, day + 1, 2, 59, 59) / 1000)
    : Math.floor(Date.UTC(y, m - 1, day, 3, 0, 0) / 1000);
}

function toDate(ts) {
  return new Date((ts - 10800) * 1000).toISOString().slice(0, 10);
}

function toDateTime(ts) {
  return new Date((ts - 10800) * 1000).toISOString().slice(0, 16).replace("T", " ");
}

async function hit(path) {
  if (!TOKEN) throw new Error("KOMMO_LONG_LIVED_TOKEN not set in .env");
  const r = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
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

async function pages(base, key, max = 10) {
  const items = [];
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

function vendedoraName(uid) {
  return USERS[uid] || `User ${uid}`;
}

function resolveVendedora(name) {
  if (!name) return null;
  const key = name.toLowerCase().trim();
  return USER_IDS[key] || null;
}

// ---------- Conversation status per lead ----------

async function getLeadsWithTalks(leadIds) {
  if (leadIds.length === 0) return new Set();
  const hasTalk = new Set();
  for (let i = 0; i < leadIds.length; i += 50) {
    const batch = leadIds.slice(i, i + 50);
    const filter = batch.map((id) => `filter[entity_id][]=${id}`).join("&");
    await wait(150);
    const data = await hit(`/api/v4/talks?filter[entity_type]=leads&${filter}&limit=250`);
    if (data?._embedded?.talks) {
      for (const t of data._embedded.talks) {
        if (t.entity_id) hasTalk.add(t.entity_id);
      }
    }
  }
  return hasTalk;
}

// ---------- MCP Server ----------

const server = new McpServer({
  name: "kommo",
  version: "1.0.0",
});

// Tool 1: List leads with filters
server.tool(
  "kommo_leads",
  "List Kommo CRM leads with optional filters. Returns lead name, stage, vendedora, price, dates.",
  {
    from: z.string().optional().describe("Start date YYYY-MM-DD"),
    to: z.string().optional().describe("End date YYYY-MM-DD"),
    vendedora: z.string().optional().describe("Filter by vendedora: Veridiana or Thaisa"),
    stage: z.string().optional().describe("Filter by stage name (e.g. Incoming Leads, Ganho, Perdido)"),
    limit: z.number().optional().describe("Max leads to return (default 50)"),
  },
  async ({ from, to, vendedora, stage, limit }) => {
    const sf = STAGES.map(
      (s, i) =>
        `filter[statuses][${i}][status_id]=${s.id}&filter[statuses][${i}][pipeline_id]=${PIPELINE}`
    ).join("&");

    const fU = from ? toUnix(from, false) : null;
    const tU = to ? toUnix(to, true) : null;
    let dateFilter = "";
    if (fU) dateFilter += `&filter[created_at][from]=${fU}`;
    if (tU) dateFilter += `&filter[created_at][to]=${tU}`;

    const rawLeads = await pages(`/api/v4/leads?${sf}${dateFilter}&with=contacts`, "leads");
    let leads = rawLeads.filter((l) => l.pipeline_id === PIPELINE);

    const vid = resolveVendedora(vendedora);
    if (vid) leads = leads.filter((l) => l.responsible_user_id === vid);

    if (stage) {
      const stObj = STAGES.find((s) => s.name.toLowerCase() === stage.toLowerCase());
      if (stObj) leads = leads.filter((l) => l.status_id === stObj.id);
    }

    const maxN = limit || 50;
    const sliced = leads.slice(0, maxN);

    // Check which leads have conversations (talks)
    const leadsWithTalks = await getLeadsWithTalks(sliced.map((l) => l.id));

    const result = sliced.map((l) => ({
      id: l.id,
      name: l.name || "—",
      stage: STAGES.find((s) => s.id === l.status_id)?.name || l.status_id,
      vendedora: vendedoraName(l.responsible_user_id),
      price: l.price || 0,
      created: toDate(l.created_at),
      updated: toDateTime(l.updated_at),
      closed: l.closed_at ? toDate(l.closed_at) : null,
      has_conversation: leadsWithTalks.has(l.id),
    }));

    const withConvo = result.filter((r) => r.has_conversation).length;
    const withoutConvo = result.filter((r) => !r.has_conversation).length;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            total: leads.length,
            showing: result.length,
            with_conversation: withConvo,
            without_conversation: withoutConvo,
            leads: result,
          }, null, 2),
        },
      ],
    };
  }
);

// Tool 2: Funnel overview
server.tool(
  "kommo_funnel",
  "Get the current sales funnel with lead counts per stage, broken down by vendedora.",
  {
    from: z.string().optional().describe("Start date YYYY-MM-DD"),
    to: z.string().optional().describe("End date YYYY-MM-DD"),
  },
  async ({ from, to }) => {
    const sf = STAGES.map(
      (s, i) =>
        `filter[statuses][${i}][status_id]=${s.id}&filter[statuses][${i}][pipeline_id]=${PIPELINE}`
    ).join("&");

    const fU = from ? toUnix(from, false) : null;
    const tU = to ? toUnix(to, true) : null;
    let dateFilter = "";
    if (fU) dateFilter += `&filter[created_at][from]=${fU}`;
    if (tU) dateFilter += `&filter[created_at][to]=${tU}`;

    const rawLeads = await pages(`/api/v4/leads?${sf}${dateFilter}`, "leads");
    let leads = rawLeads.filter((l) => l.pipeline_id === PIPELINE);

    const funnel = STAGES.map((st) => ({
      stage: st.name,
      veridiana: leads.filter((l) => l.status_id === st.id && l.responsible_user_id === 14597455).length,
      thaisa: leads.filter((l) => l.status_id === st.id && l.responsible_user_id === 14709187).length,
      total: leads.filter((l) => l.status_id === st.id).length,
    }));

    return {
      content: [{ type: "text", text: JSON.stringify(funnel, null, 2) }],
    };
  }
);

// Tool 3: Vendedora performance stats
server.tool(
  "kommo_performance",
  "Get vendedora performance stats: wins, losses, win rate, avg days to close.",
  {
    from: z.string().optional().describe("Start date YYYY-MM-DD"),
    to: z.string().optional().describe("End date YYYY-MM-DD"),
    vendedora: z.string().optional().describe("Veridiana or Thaisa (omit for both)"),
  },
  async ({ from, to, vendedora }) => {
    const sf = STAGES.map(
      (s, i) =>
        `filter[statuses][${i}][status_id]=${s.id}&filter[statuses][${i}][pipeline_id]=${PIPELINE}`
    ).join("&");
    const rawLeads = await pages(`/api/v4/leads?${sf}`, "leads");
    let leads = rawLeads.filter((l) => l.pipeline_id === PIPELINE);

    const fU = from ? toUnix(from, false) : null;
    const tU = to ? toUnix(to, true) : null;

    // Performance uses closed_at filter client-side (Kommo API only supports created_at server-side)
    const perf = (uid, label) => {
      const won = leads.filter(
        (l) =>
          l.status_id === 142 &&
          (!uid || l.responsible_user_id === uid) &&
          l.closed_at &&
          (!fU || l.closed_at >= fU) &&
          (!tU || l.closed_at <= tU)
      );
      const lost = leads.filter(
        (l) =>
          l.status_id === 143 &&
          (!uid || l.responsible_user_id === uid) &&
          l.closed_at &&
          (!fU || l.closed_at >= fU) &&
          (!tU || l.closed_at <= tU)
      );
      const n = won.length + lost.length;
      const days = won
        .filter((l) => l.closed_at && l.created_at)
        .map((l) => (l.closed_at - l.created_at) / 86400);
      return {
        vendedora: label,
        won: won.length,
        lost: lost.length,
        winRate: n > 0 ? `${((won.length / n) * 100).toFixed(1)}%` : "N/A",
        avgDaysToClose: days.length > 0 ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null,
        totalRevenue: won.reduce((s, l) => s + (l.price || 0), 0),
      };
    };

    const vid = resolveVendedora(vendedora);
    let result;
    if (vid) {
      result = perf(vid, vendedoraName(vid));
    } else {
      result = [perf(14597455, "Veridiana"), perf(14709187, "Thaisa"), perf(null, "Total")];
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool 4: Activity (messages, calls, status changes)
server.tool(
  "kommo_activity",
  "Get activity stats (outgoing messages, calls, status changes) per vendedora per day.",
  {
    from: z.string().optional().describe("Start date YYYY-MM-DD"),
    to: z.string().optional().describe("End date YYYY-MM-DD"),
  },
  async ({ from, to }) => {
    const fU = from ? toUnix(from, false) : null;
    const tU = to ? toUnix(to, true) : null;
    let ef = "";
    if (fU) ef += `&filter[created_at][from]=${fU}`;
    if (tU) ef += `&filter[created_at][to]=${tU}`;

    const msgs = await pages(`/api/v4/events?filter[type][]=outgoing_chat_message${ef}`, "events", 5);
    const calls = await pages(`/api/v4/events?filter[type][]=outgoing_call${ef}`, "events", 5);
    const statusEvts = await pages(`/api/v4/events?filter[type][]=lead_status_changed${ef}`, "events", 5);

    const actMap = {};
    const addEvt = (evts, key) => {
      for (const e of evts) {
        const uid = e.created_by;
        if (uid !== 14597455 && uid !== 14709187) continue;
        const day = toDate(e.created_at);
        if (!actMap[day])
          actMap[day] = {
            veridiana: { msgs: 0, calls: 0, changes: 0 },
            thaisa: { msgs: 0, calls: 0, changes: 0 },
          };
        actMap[day][uid === 14597455 ? "veridiana" : "thaisa"][key]++;
      }
    };
    addEvt(msgs, "msgs");
    addEvt(calls, "calls");
    addEvt(statusEvts, "changes");

    const activity = Object.entries(actMap)
      .map(([date, d]) => ({ date, ...d }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      content: [{ type: "text", text: JSON.stringify(activity, null, 2) }],
    };
  }
);

// Tool 5: Search lead by name or phone
server.tool(
  "kommo_search",
  "Search for a lead or contact in Kommo by name, phone, or email.",
  {
    query: z.string().describe("Search term (name, phone, or email)"),
  },
  async ({ query }) => {
    const data = await hit(`/api/v4/leads?query=${encodeURIComponent(query)}&with=contacts&limit=10`);
    const leads = data?._embedded?.leads || [];

    const cIds = new Set();
    for (const l of leads) {
      const contacts = l._embedded?.contacts;
      if (contacts) for (const c of contacts) cIds.add(c.id);
    }

    const contactMap = {};
    if (cIds.size > 0) {
      const f = [...cIds].map((id) => `filter[id][]=${id}`).join("&");
      const contacts = await pages(`/api/v4/contacts?${f}`, "contacts", 1);
      for (const c of contacts) {
        let phone = "";
        const pf = c.custom_fields_values?.find(
          (v) => v.field_code === "PHONE" || String(v.field_name || "").toLowerCase().includes("phone")
        );
        if (pf?.values?.[0]?.value) phone = pf.values[0].value;
        contactMap[c.id] = { name: c.name || "", phone };
      }
    }

    const result = leads.map((l) => {
      const cid = l._embedded?.contacts?.[0]?.id;
      const c = cid ? contactMap[cid] : null;
      return {
        id: l.id,
        name: c?.name || l.name || "—",
        phone: c?.phone || "—",
        stage: STAGES.find((s) => s.id === l.status_id)?.name || l.status_id,
        vendedora: vendedoraName(l.responsible_user_id),
        price: l.price || 0,
        created: toDate(l.created_at),
      };
    });

    return {
      content: [
        { type: "text", text: JSON.stringify({ total: result.length, results: result }, null, 2) },
      ],
    };
  }
);

// Tool 6: Stale leads and overdue tasks
server.tool(
  "kommo_health",
  "Get pipeline health: stale leads (no update in 7+ days) and overdue tasks.",
  {},
  async () => {
    const sf = STAGES.map(
      (s, i) =>
        `filter[statuses][${i}][status_id]=${s.id}&filter[statuses][${i}][pipeline_id]=${PIPELINE}`
    ).join("&");
    const rawLeads = await pages(`/api/v4/leads?${sf}`, "leads");
    const leads = rawLeads.filter((l) => l.pipeline_id === PIPELINE);

    const now = Math.floor(Date.now() / 1000);
    const stale = leads.filter(
      (l) => l.status_id !== 142 && l.status_id !== 143 && l.updated_at < now - 7 * 86400
    );

    const openTasks = await pages(`/api/v4/tasks?filter[is_completed]=0`, "tasks", 3);
    const overdue = openTasks.filter((t) => t.complete_till && t.complete_till < now);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              staleLeads: {
                veridiana: stale.filter((l) => l.responsible_user_id === 14597455).length,
                thaisa: stale.filter((l) => l.responsible_user_id === 14709187).length,
                total: stale.length,
                leads: stale.slice(0, 20).map((l) => ({
                  id: l.id,
                  name: l.name,
                  stage: STAGES.find((s) => s.id === l.status_id)?.name,
                  lastUpdate: toDate(l.updated_at),
                  vendedora: vendedoraName(l.responsible_user_id),
                })),
              },
              overdueTasks: {
                veridiana: overdue.filter((t) => t.responsible_user_id === 14597455).length,
                thaisa: overdue.filter((t) => t.responsible_user_id === 14709187).length,
                total: overdue.length,
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Start
const transport = new StdioServerTransport();
await server.connect(transport);
