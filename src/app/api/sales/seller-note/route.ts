import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const MAX_LEN = 2000;

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

  const { leadId, note } = body as { leadId?: unknown; note?: unknown };
  if (!isUuid(leadId)) {
    return NextResponse.json({ error: "invalid leadId" }, { status: 400 });
  }

  let normalized: string | null;
  if (note === null || note === "" || note === undefined) {
    normalized = null;
  } else if (typeof note === "string") {
    const trimmed = note.trim();
    if (trimmed.length === 0) {
      normalized = null;
    } else if (trimmed.length > MAX_LEN) {
      return NextResponse.json({ error: `note too long (max ${MAX_LEN})` }, { status: 400 });
    } else {
      normalized = trimmed;
    }
  } else {
    return NextResponse.json({ error: "invalid note" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("leads")
    .update({ seller_note: normalized })
    .eq("id", leadId)
    .select("id, seller_note")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, lead: data });
}
