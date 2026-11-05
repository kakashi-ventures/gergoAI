"use client";
import { createClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

// Anteprima del report di deploy: numeri letti solo dalle view SQL (le stesse di bridge/deploy_report.py),
// niente calcoli nel client. "scarica JSON" esporta esattamente ciò che è a schermo.
type Rows = Record<string, unknown>[];
interface Data { generato: string; turno: Rows; cicli: Rows; ontologia: Rows; proposte: Rows; errore?: string }

export function Report() {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) { setD({ generato: new Date().toISOString(), turno: [], cicli: [], ontologia: [], proposte: [], errore: "Supabase non configurato" }); return; }
    const s = createClient(url, key, { auth: { persistSession: false } });
    void (async () => {
      const q = async (p: PromiseLike<{ data: Rows | null; error: { message: string } | null }>) => { const r = await p; if (r.error) throw new Error(r.error.message); return r.data ?? []; };
      try {
        const [turno, cicli, ontologia, proposte] = await Promise.all([
          q(s.from("v_shift_summary").select("*")),
          q(s.from("v_cycle_stats").select("*").order("routine_name").order("routine_version")),
          q(s.from("v_ontology_status").select("*")),
          q(s.from("proposals").select("id,status,change,metric,before,after,decided_at,decided_by").order("created_at")),
        ]);
        setD({ generato: new Date().toISOString(), turno, cicli, ontologia, proposte });
      } catch (e) { setD({ generato: new Date().toISOString(), turno: [], cicli: [], ontologia: [], proposte: [], errore: (e as Error).message }); }
    })();
  }, []);

  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }));
    a.download = `gergo-report-${d?.generato.slice(0, 16).replace(/[:T]/g, "-")}.json`;
    a.click();
  };

  const Table = ({ title, rows }: { title: string; rows: Rows }) => (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-white/50">{title}</h2>
      {rows.length === 0 ? <p className="text-sm text-white/40">Nessun dato.</p> : (
        <div className="overflow-x-auto">
          <table className="text-left font-mono text-xs">
            <thead className="text-white/50"><tr>{Object.keys(rows[0]).map((k) => <th key={k} className="pr-4">{k}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={i} className="border-t border-white/5">{Object.values(r).map((v, j) => <td key={j} className="pr-4">{typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "—")}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );

  if (!d) return <main className="p-6">Carico…</main>;
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold">Report di deploy · anteprima</h1>
        <button onClick={download} className="rounded border border-white/20 px-3 py-1 text-sm">scarica JSON</button>
        <a href="/console" className="text-sm text-sky-300 underline">console</a>
      </div>
      <p className="text-xs text-white/50">Generato {new Date(d.generato).toLocaleString("it-IT")} · numeri da v_shift_summary, v_cycle_stats, v_ontology_status, proposals. Il report finale è `python -m bridge.deploy_report`.</p>
      {d.errore && <p className="text-red-400">{d.errore}</p>}
      <Table title="Turno di oggi" rows={d.turno} />
      <Table title="Cicli per routine e versione (v1 contro v2)" rows={d.cicli} />
      <Table title="Ontologia" rows={d.ontologia} />
      <Table title="Proposte (before / after)" rows={d.proposte} />
    </main>
  );
}
