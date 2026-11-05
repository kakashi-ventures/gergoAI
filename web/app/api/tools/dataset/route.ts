import { db, must } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dataset delle modifiche agli script proposte dalla voce, in JSONL: una riga per proposta con l'input (frase,
// evidenze del registro), lo script generato, l'esito di ogni gate e lo stato. È la base di un workflow di verifica
// di sicurezza e qualità (stile CATALYST) riutilizzabile per altri input: voce oggi, visione domani.
export async function GET() {
  const rows = await must(db().from("events").select("id,ts,payload").eq("type", "proposal").eq("payload->>oggetto", "script").order("ts"));
  const lines = rows.map((r: { id: string; ts: string; payload: Record<string, unknown> }) => JSON.stringify({
    id: r.id, ts: r.ts, input: { modalita: "voce", evidenze: r.payload.evidence ?? [] },
    script: { path: r.payload.path, sha256: r.payload.sha256, content: r.payload.content ?? null },
    gate: { umano_prova: true, codice: r.payload.gate ?? null, codice_ok: r.payload.gate_ok ?? null, agente_ai: r.payload.ai ?? null },
    esito: { stato: r.payload.stato, pr: r.payload.pr_url ?? null, revisione_umana: null },
  }));
  return new Response(lines.join("\n") + (lines.length ? "\n" : ""), {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "content-disposition": `attachment; filename="gergo-script-dataset-${new Date().toISOString().slice(0, 10)}.jsonl"` },
  });
}
