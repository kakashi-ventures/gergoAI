// Pattern miner deterministico (PLAN.md §4). Gira dopo ogni ciclo; Grok racconta solo il risultato.
// Funzioni pure: ricevono eventi, run e routine, restituiscono osservazioni e, quando si può, la proposta.
import type { Routine } from "./contracts";

export interface Ev { id: string; ts: string; type: string; routine_run_id: string | null; step: number | null; payload: Record<string, unknown> }
export interface Run { id: string; routine_name: string; routine_version: number | null }
export interface RoutineRow { name: string; version: number; status: string; steps: Routine["steps"] }

export interface Finding {
  kind: "anomaly" | "pattern";
  rule: "slow_step" | "repeated_failure" | "repeated_correction" | "repeated_sequence" | "redundant_step";
  key: string; // per non ripetere la stessa osservazione
  evidence: string[];
  summary: string;
  proposal?: { routine: string; from_version: number; steps: Routine["steps"]; diff: string };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const SKILL_IT: Record<string, string> = { solleva: "sollevare", porta: "portare", applica: "applicare", deposita: "depositare", home: "tornare a casa" };

/** Raggruppa per (routine, versione, passo) gli step_end dei run di routine, in ordine di tempo. */
function stepGroups(events: Ev[], runs: Map<string, Run>, routines: RoutineRow[]) {
  const g = new Map<string, { routine: string; version: number; step: number; skill: string; evs: Ev[] }>();
  for (const e of [...events].sort((a, b) => a.ts.localeCompare(b.ts))) {
    if (e.type !== "step_end" || e.payload.cycle === true || !e.routine_run_id || e.step == null) continue;
    const run = runs.get(e.routine_run_id);
    if (!run) continue;
    const version = run.routine_version ?? routines.find((r) => r.name === run.routine_name && r.status === "active")?.version;
    if (version == null) continue;
    const k = `${run.routine_name}|${version}|${e.step}`;
    if (!g.has(k)) g.set(k, { routine: run.routine_name, version, step: e.step, skill: String(e.payload.skill ?? "?"), evs: [] });
    g.get(k)!.evs.push(e);
  }
  return [...g.values()];
}

export function mine(events: Ev[], runList: Run[], routines: RoutineRow[]): Finding[] {
  const runs = new Map(runList.map((r) => [r.id, r]));
  const out: Finding[] = [];
  const groups = stepGroups(events, runs, routines);

  for (const gr of groups) {
    const ok = gr.evs.filter((e) => e.payload.ok !== false && typeof e.payload.duration_ms === "number");
    // slow_step: l'ultima durata oltre mediana + 3 MAD delle precedenti (almeno 4)
    if (ok.length >= 5) {
      const last = ok[ok.length - 1], prev = ok.slice(0, -1).map((e) => Number(e.payload.duration_ms));
      const med = median(prev), mad = median(prev.map((x) => Math.abs(x - med))) || 1;
      const d = Number(last.payload.duration_ms);
      if (d > med + 3 * mad) {
        out.push({
          kind: "anomaly", rule: "slow_step", key: `slow|${gr.routine}|${gr.version}|${gr.step}|${last.id}`,
          evidence: [last.id],
          summary: `Ho notato che ${SKILL_IT[gr.skill] ?? gr.skill} nella «${gr.routine}» ci ha messo ${(d / 1000).toFixed(1).replace(".", ",")} secondi, contro i soliti ${(med / 1000).toFixed(1).replace(".", ",")}.`,
        });
      }
    }
    // repeated_failure: lo stesso passo fallisce 2 volte sulle ultime 5
    const last5 = gr.evs.slice(-5), fails = last5.filter((e) => e.payload.ok === false);
    if (fails.length >= 2) {
      out.push({
        kind: "anomaly", rule: "repeated_failure", key: `fail|${gr.routine}|${gr.version}|${gr.step}|${fails.slice(-2).map((e) => e.id).join(",")}`,
        evidence: fails.map((e) => e.id),
        summary: `Ho notato che il passo ${gr.step} della «${gr.routine}» (${gr.skill}) è fallito ${fails.length} volte sulle ultime ${last5.length}.`,
      });
    }
  }

  // repeated_correction: lo stesso feedback dell'operatore sullo stesso passo della stessa routine, 2 volte
  const corr = new Map<string, Ev[]>();
  for (const e of events) {
    if (e.type !== "feedback" || e.payload.awaiting === true || e.payload.done === true) continue;
    const text = String(e.payload.text ?? "").trim().toLowerCase();
    if (!text || text === "fatto" || !e.routine_run_id) continue;
    const run = runs.get(e.routine_run_id);
    if (!run) continue;
    const k = `${run.routine_name}|${text}`;
    corr.set(k, [...(corr.get(k) ?? []), e]);
  }
  for (const [k, evs] of corr) {
    if (evs.length < 2) continue;
    const [routine, text] = k.split("|");
    out.push({
      kind: "pattern", rule: "repeated_correction", key: `corr|${k}|${evs.length}`, evidence: evs.map((e) => e.id),
      summary: `Ho notato che nella «${routine}» mi hai detto «${text}» ${evs.length} volte.`,
    });
  }

  // redundant_step: un "home" tra un deposita e l'inizio del ciclo successivo, in una routine attiva
  for (const r of routines.filter((x) => x.status === "active")) {
    const i = r.steps.findIndex((s, k) => s.skill === "home" && k > 0 && r.steps[k - 1].skill === "deposita" &&
      (k === r.steps.length - 1 || r.steps[k + 1].skill === "solleva"));
    if (i < 0) continue;
    const cycles = events.filter((e) => e.type === "step_end" && e.payload.cycle === true && e.payload.routine === r.name && Number(e.payload.version) === r.version);
    if (cycles.length < 2) continue; // si propone dopo averlo visto succedere
    out.push({
      kind: "pattern", rule: "redundant_step", key: `home|${r.name}|${r.version}`, evidence: cycles.map((e) => e.id),
      summary: `Ho notato che nella «${r.name}» tra un ciclo e l'altro torno sempre a casa: vuoi che lo tolga?`,
      proposal: { routine: r.name, from_version: r.version, steps: r.steps.filter((_, k) => k !== i), diff: "rimuovi home tra i cicli" },
    });
  }

  // repeated_sequence: la stessa sequenza di 3 primitive dettata a mano (fuori routine) 3 volte
  const manual = [...events].sort((a, b) => a.ts.localeCompare(b.ts))
    .filter((e) => e.type === "step_end" && !e.routine_run_id && e.payload.ok !== false && ["solleva", "porta", "applica", "deposita"].includes(String(e.payload.skill)));
  const seqs = new Map<string, Ev[]>();
  for (let k = 0; k + 3 <= manual.length; k++) {
    const sig = manual.slice(k, k + 3).map((e) => `${e.payload.skill}`).join(">");
    if (new Set(sig.split(">")).size < 3) continue;
    seqs.set(sig, [...(seqs.get(sig) ?? []), manual[k]]);
  }
  for (const [sig, evs] of seqs) {
    if (evs.length < 3) continue;
    out.push({
      kind: "pattern", rule: "repeated_sequence", key: `seq|${sig}|${evs.length}`, evidence: evs.map((e) => e.id),
      summary: `Ho notato che mi hai chiesto ${evs.length} volte di fila ${sig.split(">").map((s) => SKILL_IT[s] ?? s).join(", ")}: vuoi che ne faccia una routine?`,
    });
  }
  return out;
}
