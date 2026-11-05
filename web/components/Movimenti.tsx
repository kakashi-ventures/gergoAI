"use client";
import { useMemo, useState } from "react";
import { diffSteps, diffSummary, type StepLike } from "@/lib/diff";
import type { LiveData, RoutineRow } from "@/lib/live";
import { stepText } from "@/lib/routines";

// Approvazione di nuovi movimenti e modifiche. Regole: niente si attiva da solo; ogni modifica è una nuova
// versione in bozza; l'approvazione chiede una seconda conferma e finisce nel registro con chi e quando.
type Act = (name: string, body?: Record<string, unknown>, domanda?: string) => Promise<void>;

const SKILLS = ["solleva", "porta", "applica", "deposita", "home", "attendi_operatore"] as const;
const PLACES = ["INGRESSO", "STAZIONE", "USCITA", "SCARTI", "HOME"] as const;
const NEEDS_PLACE = new Set(["solleva", "porta", "deposita"]);
const txt = (s: StepLike) => stepText(s as Parameters<typeof stepText>[0]);

function Diff({ from, to }: { from: StepLike[]; to: StepLike[] }) {
  const rows = diffSteps(from, to);
  return (
    <div>
      <p className="mb-1 text-[11px] text-white/50">{diffSummary(rows)}</p>
      <ol className="space-y-0.5 font-mono text-xs">
        {rows.map((r, k) => (
          <li key={k} className={r.op === "tolto" ? "bg-red-500/10 text-red-300 line-through" : r.op === "aggiunto" ? "bg-emerald-500/10 text-emerald-300" : "text-white/70"}>
            <span className="inline-block w-4">{r.op === "tolto" ? "−" : r.op === "aggiunto" ? "+" : " "}</span>{txt(r.step)}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Editor({ routine, act, onDone }: { routine: RoutineRow; act: Act; onDone: () => void }) {
  const [steps, setSteps] = useState<StepLike[]>(routine.steps.map((s) => ({ ...s })));
  const [motivo, setMotivo] = useState("");
  const set = (k: number, p: Partial<StepLike>) => setSteps((x) => x.map((s, i) => (i === k ? { ...s, ...p } : s)));
  const move = (k: number, d: -1 | 1) => setSteps((x) => { const y = [...x]; const j = k + d; if (j < 0 || j >= y.length) return x; [y[k], y[j]] = [y[j], y[k]]; return y; });
  const clean = steps.map((s) => ({ skill: s.skill, ...(NEEDS_PLACE.has(s.skill) ? { place: s.place ?? "INGRESSO" } : {}), ...(s.skill === "attendi_operatore" ? { prompt: s.prompt || "dimmi fatto" } : {}) }));
  return (
    <div className="space-y-3">
      <ol className="space-y-1.5">
        {steps.map((s, k) => (
          <li key={k} className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="w-5 text-right font-mono text-white/40">{k + 1}</span>
            <select value={s.skill} onChange={(e) => set(k, { skill: e.target.value })} className="rounded bg-white/10 px-2 py-1">
              {SKILLS.map((x) => <option key={x}>{x}</option>)}
            </select>
            {NEEDS_PLACE.has(s.skill) && (
              <select value={s.place ?? "INGRESSO"} onChange={(e) => set(k, { place: e.target.value })} className="rounded bg-white/10 px-2 py-1">
                {PLACES.map((x) => <option key={x}>{x}</option>)}
              </select>
            )}
            {s.skill === "attendi_operatore" && (
              <input value={s.prompt ?? ""} onChange={(e) => set(k, { prompt: e.target.value })} placeholder="cosa fa l'operatore" className="min-w-40 flex-1 rounded bg-white/10 px-2 py-1" />
            )}
            <span className="ml-auto flex gap-1">
              <button onClick={() => move(k, -1)} className="rounded px-1.5 hover:bg-white/10" aria-label="su">↑</button>
              <button onClick={() => move(k, 1)} className="rounded px-1.5 hover:bg-white/10" aria-label="giù">↓</button>
              <button onClick={() => setSteps((x) => x.filter((_, i) => i !== k))} className="rounded px-1.5 text-red-300 hover:bg-red-500/10" aria-label="togli">✕</button>
            </span>
          </li>
        ))}
      </ol>
      <button onClick={() => setSteps((x) => [...x, { skill: "home" }])} className="text-xs text-sky-300">+ aggiungi passo</button>
      <div className="rounded border border-white/10 p-2"><Diff from={routine.steps} to={clean} /></div>
      <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Perché la cambi? (resta nel registro)" className="w-full rounded bg-white/10 px-3 py-2 text-sm" />
      <div className="flex gap-2">
        <button disabled={motivo.trim().length < 3}
          onClick={async () => { await act("modifica_routine", { name: routine.name, from_version: routine.version, steps: clean, motivo: motivo.trim() }, `Creo la versione ${routine.version + 1} della «${routine.name}» in bozza? Non sarà usata finché non la approvi.`); onDone(); }}
          className="rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold disabled:opacity-40">Salva come nuova versione</button>
        <button onClick={onDone} className="rounded border border-white/20 px-3 py-1.5 text-sm">Annulla</button>
      </div>
    </div>
  );
}

export function Movimenti({ live, act }: { live: LiveData; act: Act }) {
  const [tab, setTab] = useState<"approva" | "modifica">("approva");
  const [editing, setEditing] = useState<string | null>(null);
  const byName = useMemo(() => {
    const m = new Map<string, RoutineRow[]>();
    for (const r of live.routines) m.set(r.name, [...(m.get(r.name) ?? []), r]);
    return m;
  }, [live.routines]);
  const drafts = live.routines.filter((r) => r.status === "draft");
  const active = live.routines.filter((r) => r.status === "active");
  const newSkills = live.skills.filter((k) => k.status === "draft");
  const pending = drafts.length + newSkills.filter((k) => k.sim_ok).length + (live.proposal ? 1 : 0);

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white/50">Movimenti</h2>
        <div className="ml-auto flex rounded-lg bg-white/5 p-0.5 text-sm">
          <button onClick={() => setTab("approva")} className={`rounded-md px-3 py-1 ${tab === "approva" ? "bg-white/15" : "text-white/60"}`}>
            Da approvare {pending > 0 && <span className="ml-1 rounded-full bg-amber-400 px-1.5 text-xs font-bold text-black">{pending}</span>}
          </button>
          <button onClick={() => setTab("modifica")} className={`rounded-md px-3 py-1 ${tab === "modifica" ? "bg-white/15" : "text-white/60"}`}>Modifica</button>
        </div>
      </div>

      {tab === "approva" && (
        <div className="space-y-3">
          {live.proposal && (
            <article className="rounded-lg border border-fuchsia-400/40 bg-fuchsia-400/5 p-3">
              <p className="text-[11px] uppercase tracking-wider text-fuchsia-300">Proposta della memoria · {live.proposal.rule}</p>
              <p className="mt-1">{live.proposal.summary}</p>
              <p className="mt-1 font-mono text-xs text-white/50">prima {live.proposal.before != null ? `${(live.proposal.before / 1000).toFixed(1)} s` : "—"} · dopo {live.proposal.after != null ? `${(live.proposal.after / 1000).toFixed(1)} s` : "si misura al prossimo ciclo"}</p>
              <div className="mt-2 flex gap-2">
                <button onClick={() => act("approva_proposta", { approva: true }, "Approvi la nuova versione proposta? Diventa quella attiva.")} className="rounded bg-emerald-600 px-3 py-1 text-sm font-semibold">Approva</button>
                <button onClick={() => act("approva_proposta", { approva: false })} className="rounded border border-white/20 px-3 py-1 text-sm">Rifiuta</button>
              </div>
            </article>
          )}

          {drafts.map((d) => {
            const from = (byName.get(d.name) ?? []).find((r) => r.version === (d.edited_from_version ?? d.parent_version));
            return (
              <article key={`${d.name}-${d.version}`} className="rounded-lg border border-amber-400/40 bg-amber-400/5 p-3">
                <p className="text-[11px] uppercase tracking-wider text-amber-300">{from ? "Modifica movimento" : "Nuovo movimento"} · bozza</p>
                <p className="mt-1 font-semibold">«{d.name}» v{d.version}{from && <span className="font-normal text-white/50"> da v{from.version}</span>}</p>
                {d.source_utterance && <p className="text-xs italic text-white/50">«{d.source_utterance}»</p>}
                <div className="mt-2"><Diff from={from?.steps ?? []} to={d.steps} /></div>
                <button onClick={() => act("salva_routine", { name: d.name }, `Approvi «${d.name}» v${d.version}? Sostituisce la versione attiva; la precedente resta nel registro.`)}
                  className="mt-2 rounded bg-emerald-600 px-3 py-1 text-sm font-semibold">Approva v{d.version}</button>
              </article>
            );
          })}

          {newSkills.map((k) => (
            <article key={k.name} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 p-3 text-sm">
              <span className="text-[11px] uppercase tracking-wider text-white/50">{k.kind === "session" ? "sessione" : k.kind === "motion" ? "movimento a voce" : "primitiva"}</span>
              <span className="font-semibold">{k.name}</span>
              <span className="font-mono text-xs text-white/40">{k.jbi ?? (k.name === "sposta" ? "MoveL" : "task —")}</span>
              <span className="text-xs text-white/50">sim {k.sim_ok ? "✓" : "da provare"} · reale {k.real_ok ? "✓" : "–"}</span>
              <span className="ml-auto flex gap-1">
                <button onClick={() => act("conferma_skill", { name: k.name }, `Confermi ${k.name}? In modalità elite potrà muovere il braccio vero.`)} disabled={!k.sim_ok}
                  className="rounded bg-emerald-700 px-2 py-0.5 text-xs disabled:opacity-30" title={k.sim_ok ? "" : "Serve prima un'esecuzione riuscita in simulazione"}>Conferma</button>
                <button onClick={() => { const m = window.prompt(`Perché depreci ${k.name}?`); if (m && m.trim().length >= 3) void act("depreca_skill", { name: k.name, motivo: m.trim() }, `Depreco ${k.name}: «${m.trim()}»?`); }}
                  className="rounded px-2 py-0.5 text-xs text-red-300 hover:bg-red-400/10">Depreca</button>
              </span>
            </article>
          ))}
          {pending === 0 && newSkills.length === 0 && <p className="text-sm text-white/40">Niente da approvare.</p>}
        </div>
      )}

      {tab === "modifica" && (
        <div className="space-y-3">
          {active.length === 0 && <p className="text-sm text-white/40">Nessuna routine attiva. Insegnala a voce: «Ti insegno la frontale…».</p>}
          {active.map((r) => (
            <article key={r.name} className="rounded-lg border border-white/10 p-3">
              <div className="flex items-center gap-2">
                <p className="font-semibold">«{r.name}» v{r.version}</p>
                <span className="text-xs text-white/40">{(byName.get(r.name) ?? []).length} versioni</span>
                {editing !== r.name && <button onClick={() => setEditing(r.name)} className="ml-auto rounded border border-sky-400/40 px-2 py-0.5 text-xs text-sky-300">Modifica</button>}
              </div>
              {editing === r.name ? (
                <div className="mt-2"><Editor routine={r} act={act} onDone={() => { setEditing(null); setTab("approva"); }} /></div>
              ) : (
                <ol className="mt-1 list-decimal pl-5 text-sm text-white/70">{r.steps.map((s, k) => <li key={k}>{txt(s)}</li>)}</ol>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
