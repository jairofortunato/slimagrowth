import { NextRequest, NextResponse } from "next/server";
import { BetaAnalyticsDataClient } from "@google-analytics/data";

export const dynamic = "force-dynamic";

const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID || "";
const GA4_CLIENT_EMAIL = process.env.GA4_CLIENT_EMAIL || "";
const GA4_PRIVATE_KEY = (process.env.GA4_PRIVATE_KEY || "").replace(/\\n/g, "\n");

// Page path patterns (comma-separated in env, with sensible defaults)
const LANDING_PATHS = (process.env.GA4_LANDING_PAGE_PATHS || "/").split(",").map((p) => p.trim());
const FORM_PATHS = (process.env.GA4_FORM_PAGE_PATHS || "/formulario,/form").split(",").map((p) => p.trim());

// Simple in-memory cache (5 min TTL)
let cache: { data: unknown; key: string; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

let clientInstance: BetaAnalyticsDataClient | null = null;
function getClient() {
  if (!clientInstance) {
    clientInstance = new BetaAnalyticsDataClient({
      credentials: {
        client_email: GA4_CLIENT_EMAIL,
        private_key: GA4_PRIVATE_KEY,
      },
    });
  }
  return clientInstance;
}

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("sg_auth");
  if (cookie?.value !== "1") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!GA4_PROPERTY_ID || !GA4_CLIENT_EMAIL || !GA4_PRIVATE_KEY) {
    return NextResponse.json({
      sessoesLanding: 0, sessoesForm: 0, cliquesGoogle: 0, gastoGoogle: 0, sessoesAfiliados: 0,
      trafficSources: [], dailySessions: [], newVsReturning: [], devices: [],
      engagement: { engagementRate: 0, avgSessionDuration: 0, sessionsPerUser: 0, totalSessions: 0, totalUsers: 0 },
      error: "GA4 credentials not configured",
    });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") || getMonthStart();
  const to = searchParams.get("to") || getToday();

  // Check cache
  const cacheKey = `${from}-${to}`;
  if (cache && cache.key === cacheKey && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  try {
    const client = getClient();

    // Report 1: Sessions by page path (for landing + form sessions)
    const [sessionsReport] = await client.runReport({
      property: GA4_PROPERTY_ID,
      dateRanges: [{ startDate: from, endDate: to }],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "sessions" }],
    });

    let sessoesLanding = 0;
    let sessoesForm = 0;

    for (const row of sessionsReport.rows || []) {
      const pagePath = row.dimensionValues?.[0]?.value || "";
      const sessions = parseInt(row.metricValues?.[0]?.value || "0", 10);

      if (matchesAnyPath(pagePath, LANDING_PATHS)) {
        sessoesLanding += sessions;
      }
      if (matchesAnyPath(pagePath, FORM_PATHS)) {
        sessoesForm += sessions;
      }
    }

    // Report 2: Google Ads clicks (CPC traffic from google)
    const [adsReport] = await client.runReport({
      property: GA4_PROPERTY_ID,
      dateRanges: [{ startDate: from, endDate: to }],
      metrics: [{ name: "sessions" }, { name: "advertiserAdCost" }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            {
              filter: {
                fieldName: "sessionSource",
                stringFilter: { value: "google" },
              },
            },
            {
              filter: {
                fieldName: "sessionMedium",
                stringFilter: { value: "cpc" },
              },
            },
          ],
        },
      },
    });

    let cliquesGoogle = 0;
    let gastoGoogle = 0;

    if (adsReport.rows && adsReport.rows.length > 0) {
      cliquesGoogle = parseInt(adsReport.rows[0].metricValues?.[0]?.value || "0", 10);
      gastoGoogle = parseFloat(adsReport.rows[0].metricValues?.[1]?.value || "0");
    }

    // Report 3: Affiliate sessions — /chat pages with ?ref= parameter
    const [affiliateReport] = await client.runReport({
      property: GA4_PROPERTY_ID,
      dateRanges: [{ startDate: from, endDate: to }],
      dimensions: [{ name: "pagePathPlusQueryString" }],
      metrics: [{ name: "sessions" }],
      dimensionFilter: {
        filter: {
          fieldName: "pagePathPlusQueryString",
          stringFilter: { value: "/chat", matchType: "BEGINS_WITH" },
        },
      },
    });

    let sessoesAfiliados = 0;

    for (const row of affiliateReport.rows || []) {
      const fullPath = row.dimensionValues?.[0]?.value || "";
      const sessions = parseInt(row.metricValues?.[0]?.value || "0", 10);
      // Only count sessions where the URL contains ref= (affiliate referral)
      if (fullPath.includes("ref=")) {
        sessoesAfiliados += sessions;
      }
    }

    // Report 4: Traffic sources by default channel group
    const [sourcesReport] = await client.runReport({
      property: GA4_PROPERTY_ID,
      dateRanges: [{ startDate: from, endDate: to }],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }],
    });

    const trafficSources: { channel: string; sessions: number }[] = [];
    for (const row of sourcesReport.rows || []) {
      const channel = row.dimensionValues?.[0]?.value || "Other";
      const sessions = parseInt(row.metricValues?.[0]?.value || "0", 10);
      trafficSources.push({ channel, sessions });
    }
    trafficSources.sort((a, b) => b.sessions - a.sessions);

    // Report 5: Daily sessions for trend chart
    const [dailyReport] = await client.runReport({
      property: GA4_PROPERTY_ID,
      dateRanges: [{ startDate: from, endDate: to }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
    });

    const dailySessions: { date: string; sessions: number; users: number }[] = [];
    for (const row of dailyReport.rows || []) {
      const raw = row.dimensionValues?.[0]?.value || "";
      const date = raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw;
      dailySessions.push({
        date,
        sessions: parseInt(row.metricValues?.[0]?.value || "0", 10),
        users: parseInt(row.metricValues?.[1]?.value || "0", 10),
      });
    }

    // Report 6: New vs returning users
    const [nvrReport] = await client.runReport({
      property: GA4_PROPERTY_ID,
      dateRanges: [{ startDate: from, endDate: to }],
      dimensions: [{ name: "newVsReturning" }],
      metrics: [{ name: "totalUsers" }, { name: "sessions" }],
    });

    const newVsReturning: { type: string; users: number; sessions: number }[] = [];
    for (const row of nvrReport.rows || []) {
      newVsReturning.push({
        type: row.dimensionValues?.[0]?.value || "unknown",
        users: parseInt(row.metricValues?.[0]?.value || "0", 10),
        sessions: parseInt(row.metricValues?.[1]?.value || "0", 10),
      });
    }

    // Report 7: Device category breakdown
    const [deviceReport] = await client.runReport({
      property: GA4_PROPERTY_ID,
      dateRanges: [{ startDate: from, endDate: to }],
      dimensions: [{ name: "deviceCategory" }],
      metrics: [{ name: "sessions" }],
    });

    const devices: { device: string; sessions: number }[] = [];
    for (const row of deviceReport.rows || []) {
      devices.push({
        device: row.dimensionValues?.[0]?.value || "unknown",
        sessions: parseInt(row.metricValues?.[0]?.value || "0", 10),
      });
    }
    devices.sort((a, b) => b.sessions - a.sessions);

    // Report 8: Engagement metrics (site-wide)
    const [engagementReport] = await client.runReport({
      property: GA4_PROPERTY_ID,
      dateRanges: [{ startDate: from, endDate: to }],
      metrics: [
        { name: "engagementRate" },
        { name: "averageSessionDuration" },
        { name: "sessionsPerUser" },
        { name: "sessions" },
        { name: "totalUsers" },
      ],
    });

    let engagementRate = 0;
    let avgSessionDuration = 0;
    let sessionsPerUser = 0;
    let totalSessions = 0;
    let totalUsers = 0;

    if (engagementReport.rows && engagementReport.rows.length > 0) {
      const r = engagementReport.rows[0];
      engagementRate = parseFloat(r.metricValues?.[0]?.value || "0");
      avgSessionDuration = parseFloat(r.metricValues?.[1]?.value || "0");
      sessionsPerUser = parseFloat(r.metricValues?.[2]?.value || "0");
      totalSessions = parseInt(r.metricValues?.[3]?.value || "0", 10);
      totalUsers = parseInt(r.metricValues?.[4]?.value || "0", 10);
    }

    const data = {
      sessoesLanding, sessoesForm, cliquesGoogle, gastoGoogle, sessoesAfiliados,
      trafficSources, dailySessions, newVsReturning, devices,
      engagement: { engagementRate, avgSessionDuration, sessionsPerUser, totalSessions, totalUsers },
    };
    cache = { data, key: cacheKey, ts: Date.now() };
    return NextResponse.json(data);
  } catch (err) {
    console.error("GA4 API error:", err);
    return NextResponse.json({
      sessoesLanding: 0,
      sessoesForm: 0,
      cliquesGoogle: 0,
      gastoGoogle: 0,
      sessoesAfiliados: 0,
      trafficSources: [],
      dailySessions: [],
      newVsReturning: [],
      devices: [],
      engagement: { engagementRate: 0, avgSessionDuration: 0, sessionsPerUser: 0, totalSessions: 0, totalUsers: 0 },
      error: "Failed to fetch GA4 data",
    });
  }
}

function matchesAnyPath(pagePath: string, patterns: string[]): boolean {
  return patterns.some((p) => pagePath === p || pagePath.startsWith(p + "/") || pagePath.startsWith(p + "?"));
}

function getMonthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}
