"use client";
import { useState } from "react";
import type { LiveData } from "@/lib/live";

// Dopo il test e la conferma: proposta di modifica agli script Python come Pull Request su GitHub.
// Niente va su main senza la revisione di una persona.
export function ScriptProposals({ live, refresh }: { live: LiveData; refresh: () => void }) {
  const [msg, setMsg] = useState<string>("");
  const [file, setFile] = useState<{ path: string; content: string } | null>(null);
  const active = live.routines.filter((r) => r.status === "active");
  const proposals = live.events.filter((e) => e.type === "proposal" && e.payload?.oggetto === "script");

  const propose = async (kind: "routine" | "movimento", name?: string) => {
    const label = kind === "routine" ? `la routine «${name}»` : "l'ultimo movimento a voce eseguito";
    if (!window.confirm(`Propongo ${label} come modifica agli script Python? Si apre una Pull Request: niente cambia finché una persona non la unisce.`)) return;
    setMsg("preparo la proposta…");
    const r = await fetch("/api/tools/proponi_script", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, ...(name ? { name } : {}) }) });
    const j = (await r.json().catch(() => ({}))) as { frase?: string; pr_url?: string; path?: string; content?: string };
    setMsg(j.frase ?? `errore ${r.status}`);
    setFile(j.content && j.path ? { path: j.path, content: j.content } : null);
    refresh();
  };
  const download = () => {
    if (!file) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([file.content], { type: "text/x-python" }));
    a.download = file.path.split("/").pop()!;
    a.click();
  };

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white/50">Proposte di modifica agli script</h2>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- è un download, non una pagina */}
        <a href="/api/tools/dataset" download className="ml-auto text-[11px] text-sky-300 underline">dataset (JSONL)</a>
        <a href="/console/codice" className="text-[11px] text-sky-300 underline">registro del codice</a>
      </div>
      <ol className="flex flex-wrap gap-1 text-[10px]">
        {["1 umano · prova e «è giusto»", "2 codice · solo dati, limiti", "3 agente AI · checklist sicurezza", "4 umano · revisione PR", "5 CI · check_taught.py", "6 bridge · rivalida a runtime"].map((t) => (
          <li key={t} className="rounded-full bg-white/10 px-2 py-0.5 text-white/75">{t}</li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-white/50">Ogni proposta passa da tutti i gate; basta un no per fermarla. Il file contiene solo dati.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => propose("movimento")} className="rounded border border-sky-400/40 px-3 py-1.5 text-sm text-sky-300 hover:bg-sky-400/10">Ultimo movimento testato</button>
        {active.map((r) => (
          <button key={r.name} onClick={() => propose("routine", r.name)} className="rounded border border-sky-400/40 px-3 py-1.5 text-sm text-sky-300 hover:bg-sky-400/10">Routine «{r.name}» v{r.version}</button>
        ))}
      </div>
      {msg && <p className="mt-2 text-sm text-white/85">{msg}</p>}
      {file && (
        <div className="mt-2">
          <button onClick={download} className="rounded bg-white/10 px-2 py-1 text-xs">scarica {file.path.split("/").pop()}</button>
          <pre className="mt-2 max-h-40 overflow-auto rounded bg-black/40 p-2 font-mono text-[10px] text-white/70">{file.content}</pre>
        </div>
      )}
      <ol className="mt-3 space-y-1 text-xs">
        {proposals.length === 0 && <li className="text-white/40">Nessuna proposta ancora.</li>}
        {proposals.map((e) => (
          <li key={e.id} className="flex gap-2">
            <span className="font-mono text-white/40">{new Date(e.ts).toLocaleTimeString("it-IT")}</span>
            <span className="font-mono text-white/80">{String(e.payload?.path ?? "")}</span>
            <span className={e.payload?.gate_ok === false ? "text-red-300" : "text-emerald-300"}>codice {e.payload?.gate_ok === false ? "✗" : "✓"}</span>
            <span className={String((e.payload?.ai as { status?: string })?.status) === "approva" ? "text-emerald-300" : String((e.payload?.ai as { status?: string })?.status) === "respinge" ? "text-red-300" : "text-amber-300"}>AI {String((e.payload?.ai as { status?: string })?.status ?? "—")}</span>
            {e.payload?.pr_url ? <a href={String(e.payload.pr_url)} target="_blank" rel="noreferrer" className="text-emerald-300 underline">PR #{String(e.payload.pr)}</a> : <span className="text-amber-300">{String(e.payload?.stato ?? "non inviata")}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}
