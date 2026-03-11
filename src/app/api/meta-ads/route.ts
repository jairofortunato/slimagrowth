import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || "";
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID || "";
const GRAPH_API_VERSION = "v21.0";

// Simple in-memory cache (5 min TTL)
let cache: { data: unknown; key: string; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("sg_auth");
  if (cookie?.value !== "1") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
    return NextResponse.json({ gastoMeta: 0, cliquesMeta: 0, error: "Meta credentials not configured" });
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
    const timeRange = JSON.stringify({ since: from, until: to });
    const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${META_AD_ACCOUNT_ID}/insights`);
    url.searchParams.set("fields", "spend,actions");
    url.searchParams.set("time_range", timeRange);
    url.searchParams.set("level", "account");
    url.searchParams.set("access_token", META_ACCESS_TOKEN);

    const res = await fetch(url.toString());
    const json = await res.json();

    if (json.error) {
      console.error("Meta API error:", json.error);
      return NextResponse.json({ gastoMeta: 0, cliquesMeta: 0, error: json.error.message });
    }

    let gastoMeta = 0;
    let cliquesMeta = 0;

    if (json.data && json.data.length > 0) {
      const insight = json.data[0];
      gastoMeta = parseFloat(insight.spend || "0");

      if (insight.actions) {
        const linkClick = insight.actions.find(
          (a: { action_type: string; value: string }) => a.action_type === "link_click"
        );
        if (linkClick) cliquesMeta = parseInt(linkClick.value, 10);
      }
    }

    const data = { gastoMeta, cliquesMeta };
    cache = { data, key: cacheKey, ts: Date.now() };
    return NextResponse.json(data);
  } catch (err) {
    console.error("Meta API fetch error:", err);
    return NextResponse.json({ gastoMeta: 0, cliquesMeta: 0, error: "Failed to fetch Meta data" });
  }
}

function getMonthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}
