"use client";
import { useMemo, useState } from "react";
import type { EventRow } from "@/lib/mock";

// Registro per operazione: tutti gli eventi di un comando insieme (detto → capito → confermato → inizio → fine),
// con origine, esito e durata. Un movimento si può ripetere o invertire: torna al pendant come nuovo comando,
// con la sua rilettura e il suo sì.
const OPP: Record<string, string> = { su: "giu", giu: "su", avanti: "indietro", indietro: "avanti", destra: "sinistra", sinistra: "destra" };
const STEPS = ["utterance", "interpretation", "confirmation", "step_start", "step_end"] as const;
const LABEL: Record<string, string> = { utterance: "detto", interpretation: "capito", confirmation: "sì", step_start: "parte", step_end: "fine" };

interface Op { id: string; ts: string; evs: EventRow[]; titolo: string; origine: string; esito: "ok" | "ko" | "in corso" | "rifiutato"; durata?: number; params?: Record<string, unknown>; skill?: string }

export function RegistroOperazioni({ events, onReplay }: { events: EventRow[]; onReplay: (params: Record<string, unknown>) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const ops = useMemo(() => {
    const m = new Map<string, EventRow[]>();
    for (const e of events) if (e.command_id) m.set(e.command_id, [...(m.get(e.command_id) ?? []), e]);
    const out: Op[] = [];
    for (const [id, evs] of m) {
      const sorted = [...evs].sort((a, b) => a.ts.localeCompare(b.ts));
      const it = sorted.find((e) => e.type === "interpretation");
      const start = sorted.find((e) => e.type === "step_start");
      const end = sorted.find((e) => e.type === "step_end");
      const conf = sorted.find((e) => e.type === "confirmation");
      const params = (it?.payload?.params ?? start?.payload?.params) as Record<string, unknown> | undefined;
      const skill = String(it?.payload?.skill ?? start?.payload?.skill ?? end?.payload?.skill ?? "");
      const origine = conf?.payload?.test ? "prova" : String(it?.payload?.origine ?? (sorted.some((e) => e.type === "utterance") ? "voce" : skill === "stop" ? "stop" : "console"));
      const rejected = sorted.some((e) => e.type === "anomaly");
      const stopEv = sorted.find((e) => e.type === "stop");
      if (stopEv && !it) {
        out.push({ id, ts: sorted[0].ts, evs: sorted, skill: "stop", origine: "stop", titolo: `Pausa richiesta da ${String(stopEv.payload?.source ?? "operatore")}`, esito: "ok" });
        continue;
      }
      out.push({
        id, ts: sorted[0].ts, evs: sorted, params, skill, origine,
        titolo: String(it?.payload?.readback ?? conf?.payload?.test ?? (skill || sorted[0].text)).replace(/ Confermi\?$/, ""),
        esito: end ? (end.ok === false || end.payload?.ok === false ? "ko" : "ok") : rejected ? "rifiutato" : "in corso",
        durata: (end?.duration_ms as number | undefined) ?? undefined,
      });
    }
    return out.sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 25);
  }, [events]);

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/50">Registro per operazione</h2>
      {ops.length === 0 && <p className="text-sm text-white/40">Nessuna operazione ancora.</p>}
      <ol className="max-h-[30rem] space-y-1.5 overflow-y-auto pr-1">
        {ops.map((o) => (
          <li key={o.id} className={`rounded-lg border px-3 py-2 ${o.esito === "ko" || o.esito === "rifiutato" ? "border-red-500/30 bg-red-500/5" : o.esito === "ok" ? "border-emerald-500/20" : "border-amber-400/30"}`}>
            <button onClick={() => setOpen(open === o.id ? null : o.id)} className="flex w-full items-center gap-2 text-left">
              <span className="font-mono text-[11px] text-white/40">{new Date(o.ts).toLocaleTimeString("it-IT")}</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${o.origine === "pendant" ? "bg-sky-500/20 text-sky-200" : o.origine === "prova" ? "bg-fuchsia-500/20 text-fuchsia-200" : o.origine === "stop" ? "bg-red-500/20 text-red-200" : "bg-emerald-500/20 text-emerald-200"}`}>{o.origine}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{o.titolo}</span>
              <span className={`text-xs ${o.esito === "ok" ? "text-emerald-300" : o.esito === "in corso" ? "text-amber-300" : "text-red-300"}`}>{o.esito}{o.durata != null ? ` · ${(o.durata / 1000).toFixed(1)} s` : ""}</span>
            </button>
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {STEPS.map((t) => {
                const has = o.evs.some((e) => e.type === t);
                return <span key={t} className={`rounded-full px-2 py-0.5 text-[10px] ${has ? "bg-white/15 text-white/85" : "bg-white/[0.03] text-white/25"}`}>{LABEL[t]}</span>;
              })}
              {o.skill === "sposta" && o.params && (
                <span className="ml-auto flex gap-1">
                  <button onClick={() => onReplay({ ...o.params, origine: "registro" })} className="rounded border border-white/15 px-2 py-0.5 text-[11px] hover:bg-white/5">↻ Ripeti</button>
                  <button onClick={() => onReplay({ ...o.params, direzione: OPP[String(o.params?.direzione)] ?? o.params?.direzione, origine: "registro" })} className="rounded border border-white/15 px-2 py-0.5 text-[11px] hover:bg-white/5">⇄ Inverti</button>
                </span>
              )}
            </div>
            {open === o.id && (
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-black/40 p-2 font-mono text-[10px] text-white/70">{JSON.stringify(o.evs.map((e) => ({ ts: e.ts, type: e.type, payload: e.payload })), null, 2)}</pre>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
