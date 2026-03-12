import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || "";
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID || "";
const GRAPH_API_VERSION = "v21.0";

// Simple in-memory cache (5 min TTL)
let cache: { data: unknown; key: string; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

async function fetchInsights(params: Record<string, string>) {
  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${META_AD_ACCOUNT_ID}/insights`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", META_ACCESS_TOKEN);
  const res = await fetch(url.toString());
  return res.json();
}

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("sg_auth");
  if (cookie?.value !== "1") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
    return NextResponse.json({
      gastoMeta: 0, cliquesMeta: 0,
      impressions: 0, reach: 0, cpm: 0, cpc: 0, ctr: 0, frequency: 0,
      campaigns: [], dailySpend: [],
      error: "Meta credentials not configured",
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
    const timeRange = JSON.stringify({ since: from, until: to });

    // Fetch all three reports in parallel
    const [accountJson, campaignJson, dailyJson] = await Promise.all([
      // 1. Account-level metrics
      fetchInsights({
        fields: "spend,impressions,reach,clicks,cpc,cpm,ctr,frequency,actions",
        time_range: timeRange,
        level: "account",
      }),
      // 2. Campaign-level breakdown
      fetchInsights({
        fields: "campaign_name,spend,impressions,clicks,cpc,ctr,actions",
        time_range: timeRange,
        level: "campaign",
        limit: "50",
      }),
      // 3. Daily breakdown
      fetchInsights({
        fields: "spend,impressions,clicks,actions",
        time_range: timeRange,
        time_increment: "1",
        level: "account",
      }),
    ]);

    // Check for API errors
    const apiError = accountJson.error || campaignJson.error || dailyJson.error;
    if (apiError) {
      console.error("Meta API error:", apiError);
      return NextResponse.json({
        gastoMeta: 0, cliquesMeta: 0,
        impressions: 0, reach: 0, cpm: 0, cpc: 0, ctr: 0, frequency: 0,
        campaigns: [], dailySpend: [],
        error: `Meta error: ${apiError.message || JSON.stringify(apiError)}`,
      });
    }

    // Parse account-level data
    let gastoMeta = 0, cliquesMeta = 0;
    let impressions = 0, reach = 0, cpm = 0, cpc = 0, ctr = 0, frequency = 0;

    if (accountJson.data && accountJson.data.length > 0) {
      const d = accountJson.data[0];
      gastoMeta = parseFloat(d.spend || "0");
      impressions = parseInt(d.impressions || "0", 10);
      reach = parseInt(d.reach || "0", 10);
      cpm = parseFloat(d.cpm || "0");
      cpc = parseFloat(d.cpc || "0");
      ctr = parseFloat(d.ctr || "0");
      frequency = parseFloat(d.frequency || "0");

      if (d.actions) {
        const linkClick = d.actions.find(
          (a: { action_type: string; value: string }) => a.action_type === "link_click"
        );
        if (linkClick) cliquesMeta = parseInt(linkClick.value, 10);
      }
    }

    // Parse campaign-level data
    const campaigns: { name: string; spend: number; impressions: number; clicks: number; cpc: number; ctr: number; leads: number }[] = [];
    if (campaignJson.data) {
      for (const c of campaignJson.data) {
        let leads = 0;
        if (c.actions) {
          const leadAction = c.actions.find(
            (a: { action_type: string; value: string }) => a.action_type === "lead" || a.action_type === "onsite_conversion.lead_grouped"
          );
          if (leadAction) leads = parseInt(leadAction.value, 10);
        }
        campaigns.push({
          name: c.campaign_name || "Unknown",
          spend: parseFloat(c.spend || "0"),
          impressions: parseInt(c.impressions || "0", 10),
          clicks: parseInt(c.clicks || "0", 10),
          cpc: parseFloat(c.cpc || "0"),
          ctr: parseFloat(c.ctr || "0"),
          leads,
        });
      }
      campaigns.sort((a, b) => b.spend - a.spend);
    }

    // Parse daily data
    const dailySpend: { date: string; spend: number; impressions: number; clicks: number }[] = [];
    if (dailyJson.data) {
      for (const d of dailyJson.data) {
        dailySpend.push({
          date: d.date_start || "",
          spend: parseFloat(d.spend || "0"),
          impressions: parseInt(d.impressions || "0", 10),
          clicks: parseInt(d.clicks || "0", 10),
        });
      }
      dailySpend.sort((a, b) => a.date.localeCompare(b.date));
    }

    const data = {
      gastoMeta, cliquesMeta,
      impressions, reach, cpm, cpc, ctr, frequency,
      campaigns, dailySpend,
    };
    cache = { data, key: cacheKey, ts: Date.now() };
    return NextResponse.json(data);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("Meta API fetch error:", errMsg);
    return NextResponse.json({
      gastoMeta: 0, cliquesMeta: 0,
      impressions: 0, reach: 0, cpm: 0, cpc: 0, ctr: 0, frequency: 0,
      campaigns: [], dailySpend: [],
      error: `Meta error: ${errMsg}`,
    });
  }
}

function getMonthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}
