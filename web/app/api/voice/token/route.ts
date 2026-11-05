import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Emette un token effimero xAI per il browser (shared/xai-notes.md §Token effimeri).
// XAI_API_KEY resta sul server; il browser usa il subprotocol "xai-client-secret.<token>".
export async function POST() {
  const key = process.env.XAI_API_KEY;
  if (!key) return NextResponse.json({ error: "XAI_API_KEY mancante sul server" }, { status: 503 });
  const r = await fetch("https://api.x.ai/v1/realtime/client_secrets", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ expires_after: { seconds: 300 } }),
    cache: "no-store",
  });
  if (!r.ok) {
    return NextResponse.json({ error: `xAI client_secrets ${r.status}` }, { status: 502 });
  }
  const j = (await r.json()) as { value?: string; expires_at?: number };
  if (!j.value?.startsWith("xai-realtime-client-secret")) {
    return NextResponse.json({ error: "risposta xAI inattesa" }, { status: 502 });
  }
  return NextResponse.json({
    token: j.value,
    expires_at: j.expires_at,
    model: process.env.XAI_VOICE_MODEL || "grok-voice-3.0",
  });
}
