import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Allowlist dos slugs aceitos — bate com a tabela public.sellers.
const ALLOWED_SLUGS = new Set(["veridiana", "thaisa", "gabriel", "jairo"]);

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function POST(req: NextRequest) {
  if (req.cookies.get("sg_auth")?.value !== "1") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const { leadId, slug } = body as { leadId?: unknown; slug?: unknown };
  if (!isUuid(leadId)) {
    return NextResponse.json({ error: "invalid leadId" }, { status: 400 });
  }

  // slug pode ser null/"" → limpar, ou um dos permitidos
  let normalized: string | null;
  if (slug === null || slug === "") {
    normalized = null;
  } else if (typeof slug === "string" && ALLOWED_SLUGS.has(slug.toLowerCase())) {
    normalized = slug.toLowerCase();
  } else {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("leads")
    .update({ assigned_seller: normalized })
    .eq("id", leadId)
    .select("id, assigned_seller")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, lead: data });
}
