"use client";
import { useMemo, useState } from "react";
import type { EventRow } from "@/lib/mock";

// Registro del cobot: fonte unica per resoconto e report. Ogni riga si apre sul payload originale.
const META: Record<string, { icon: string; label: string; cat: string; color: string }> = {
  utterance: { icon: "🗣", label: "detto", cat: "voce", color: "text-emerald-300" },
  interpretation: { icon: "🧠", label: "capito", cat: "voce", color: "text-sky-300" },
  confirmation: { icon: "✅", label: "confermato", cat: "approvazioni", color: "text-emerald-300" },
  correction: { icon: "✏️", label: "correzione", cat: "approvazioni", color: "text-amber-300" },
  approval: { icon: "🖊", label: "approvazione", cat: "approvazioni", color: "text-emerald-300" },
  proposal: { icon: "💡", label: "proposta", cat: "approvazioni", color: "text-fuchsia-300" },
  step_start: { icon: "▶️", label: "inizio", cat: "movimenti", color: "text-white/70" },
  step_end: { icon: "⏹", label: "fine", cat: "movimenti", color: "text-white/70" },
  motion_check: { icon: "📐", label: "controllo movimento", cat: "sicurezza", color: "text-sky-300" },
  speed_change: { icon: "🐢", label: "velocità", cat: "movimenti", color: "text-sky-300" },
  feedback: { icon: "💬", label: "operatore", cat: "voce", color: "text-amber-200" },
  stop: { icon: "🛑", label: "stop", cat: "sicurezza", color: "text-red-300" },
  safety_trigger: { icon: "🚨", label: "arresto acustico", cat: "sicurezza", color: "text-red-300" },
  anomaly: { icon: "⚠️", label: "anomalia", cat: "sicurezza", color: "text-amber-300" },
};
const CATS = ["tutti", "voce", "movimenti", "approvazioni", "sicurezza"];

export function Registro({ events, compact = false }: { events: EventRow[]; compact?: boolean }) {
  const [cat, setCat] = useState("tutti");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => events.filter((e) => {
    const m = META[e.type];
    if (cat !== "tutti" && m?.cat !== cat) return false;
    return !q || `${e.type} ${e.text}`.toLowerCase().includes(q.toLowerCase());
  }), [events, cat, q]);

  const exportJson = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ esportato: new Date().toISOString(), filtro: { cat, q }, eventi: rows }, null, 2)], { type: "application/json" }));
    a.download = `gergo-registro-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`;
    a.click();
  };

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white/50">Registro del cobot</h2>
        {!compact && <button onClick={exportJson} className="ml-auto rounded border border-white/15 px-2 py-0.5 text-[11px] text-white/70">esporta JSON</button>}
      </div>
      {!compact && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {CATS.map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`rounded-full px-2.5 py-0.5 text-xs ${cat === c ? "bg-white/20 text-white" : "bg-white/5 text-white/60"}`}>{c}</button>
          ))}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="cerca" className="ml-auto w-28 rounded bg-white/10 px-2 py-0.5 text-xs" />
        </div>
      )}
      <ol className={`space-y-1 overflow-y-auto pr-1 ${compact ? "max-h-72" : "max-h-[34rem]"}`}>
        {rows.length === 0 && <li className="text-sm text-white/40">Nessun evento.</li>}
        {rows.map((e) => {
          const m = META[e.type] ?? { icon: "•", label: e.type, cat: "", color: "text-white/70" };
          return (
            <li key={e.id} className={`rounded px-2 py-1 ${e.type === "safety_trigger" || e.type === "stop" ? "bg-red-500/10" : e.cycle ? "bg-emerald-500/10" : "hover:bg-white/5"}`}>
              <button onClick={() => setOpen(open === e.id ? null : e.id)} className="flex w-full items-baseline gap-2 text-left text-xs">
                <span className="w-14 shrink-0 font-mono text-white/40">{new Date(e.ts).toLocaleTimeString("it-IT")}</span>
                <span aria-hidden>{m.icon}</span>
                <span className={`w-28 shrink-0 ${m.color}`}>{e.cycle ? "ciclo completo" : m.label}</span>
                <span className="min-w-0 flex-1 truncate text-white/85">{e.text}</span>
                {e.duration_ms != null && <span className="font-mono text-white/50">{(e.duration_ms / 1000).toFixed(1)} s</span>}
                {e.ok === false && <span className="text-red-400">✗</span>}
              </button>
              {open === e.id && (
                <pre className="mt-1 max-h-48 overflow-auto rounded bg-black/40 p-2 font-mono text-[10px] text-white/70">{JSON.stringify({ id: e.id, ts: e.ts, type: e.type, step: e.step, payload: e.payload }, null, 2)}</pre>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
