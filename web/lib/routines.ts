// Routine insegnate a voce: controllo dei passi sull'ontologia e rilettura, funzioni pure (PLAN.md §4, P2).
// Il validatore simula lo stato della postazione passo per passo: precondizioni in sequenza, applica solo in STAZIONE.
import { Routine } from "./contracts";
import { type Context, StationState, validate } from "./validator";

type Step = Routine["steps"][number];

const PLACE: Record<string, string> = { INGRESSO: "dall'ingresso", STAZIONE: "in stazione", USCITA: "in uscita", SCARTI: "negli scarti", HOME: "a casa" };
const PLACE_TO: Record<string, string> = { INGRESSO: "all'ingresso", STAZIONE: "in stazione", USCITA: "in uscita", SCARTI: "negli scarti", HOME: "a casa" };

export function stepText(s: Step): string {
  const p = s.place ?? (s.params?.place as string | undefined);
  switch (s.skill) {
    case "solleva": return `sollevo ${p ? PLACE[p] : ""}`.trim();
    case "porta": return `porto ${p ? PLACE_TO[p] : ""}`.trim();
    case "deposita": return `deposito ${p ? PLACE_TO[p] : ""}`.trim();
    case "applica": return "applico";
    case "home": return "torno a casa";
    case "attendi_operatore": return `aspetto che tu ${s.prompt ? `mi dica fatto: «${s.prompt}»` : "dica fatto"}`;
    default: return s.skill;
  }
}

export function readbackRoutine(name: string, steps: Step[]): string {
  return `La routine «${name}»: ${steps.map(stepText).join(", ")}. La salvo?`;
}

export interface StepsCheck { ok: boolean; step?: number; reason?: string }

/** Controlla i passi in sequenza a partire dallo stato iniziale (default: forchetta libera, a casa). */
export function checkSteps(steps: Step[], ctx: Omit<Context, "phase" | "station">, start = new StationState()): StepsCheck {
  const st = new StationState(start.fork_loaded, start.at);
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.skill === "attendi_operatore") continue;
    if (s.skill === "sposta" || s.skill === "stop" || s.skill === "piu_piano" || s.skill === "piu_veloce") {
      return { ok: false, step: i + 1, reason: `il passo ${i + 1} (${s.skill}) non può stare in una routine: solo primitive insegnate` };
    }
    const params = s.place ? { place: s.place } : (s.params ?? {});
    const d = validate({ id: `step-${i + 1}`, skill: s.skill, params, status: "queued" }, { ...ctx, phase: "propose", station: st });
    if (!d.ok) return { ok: false, step: i + 1, reason: `passo ${i + 1}: ${d.reason}` };
    st.apply(s.skill, params);
  }
  return { ok: true };
}
