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
      sessoesLanding: 0,
      sessoesForm: 0,
      cliquesGoogle: 0,
      gastoGoogle: 0,
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

    const data = { sessoesLanding, sessoesForm, cliquesGoogle, gastoGoogle };
    cache = { data, key: cacheKey, ts: Date.now() };
    return NextResponse.json(data);
  } catch (err) {
    console.error("GA4 API error:", err);
    return NextResponse.json({
      sessoesLanding: 0,
      sessoesForm: 0,
      cliquesGoogle: 0,
      gastoGoogle: 0,
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
