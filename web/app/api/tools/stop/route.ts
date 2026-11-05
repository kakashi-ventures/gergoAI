import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Provvisorio fino a contracts-v1 e DB online: risponde e non persiste.
// Con il DB: inserisce un command "stop" e un event "stop" (service role, solo server).
export async function POST() {
  return NextResponse.json({ ok: true, persisted: false, frase: "Mi fermo." });
}
