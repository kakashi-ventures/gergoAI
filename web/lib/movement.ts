// Prova di un movimento con correzione a voce. Funzioni pure: il movimento è una sequenza di spostamenti relativi
// (intenti, mai coordinate); una correzione crea SEMPRE una nuova versione; la rilettura la scrive il codice.
import { amountMm, fmtNum, VERBI } from "./motion";
import type { SpostaParams } from "./contracts";

export interface MoveStep { direzione: SpostaParams["direzione"]; quantita: number; unita: "mm" | "cm" }
export interface Movement { id: string; name: string; version: number; steps: MoveStep[]; note?: string }

export const PRESETS: Movement[] = [
  { id: "avvicinamento", name: "Avvicinamento alla stazione", version: 1, steps: [{ direzione: "giu", quantita: 5, unita: "cm" }, { direzione: "avanti", quantita: 3, unita: "cm" }] },
  { id: "alzata", name: "Alzata dal vassoio", version: 1, steps: [{ direzione: "su", quantita: 5, unita: "cm" }] },
  { id: "laterale", name: "Spostamento laterale", version: 1, steps: [{ direzione: "destra", quantita: 5, unita: "cm" }, { direzione: "sinistra", quantita: 5, unita: "cm" }] },
  { id: "pressione", name: "Pressione sull'etichetta", version: 1, steps: [{ direzione: "giu", quantita: 2, unita: "cm" }, { direzione: "su", quantita: 2, unita: "cm" }] },
];

const OPP: Record<MoveStep["direzione"], MoveStep["direzione"]> = { su: "giu", giu: "su", avanti: "indietro", indietro: "avanti", destra: "sinistra", sinistra: "destra" };
const mm = (s: MoveStep) => amountMm({ direzione: s.direzione, quantita: s.quantita, unita: s.unita, intensita: null }).mm;
const qty = (v: number) => (v % 10 === 0 ? `${fmtNum(v / 10)} centimetri` : `${fmtNum(v)} millimetri`);

export function stepPhrase(s: MoveStep): string {
  return `${VERBI[s.direzione].toLowerCase()} di ${qty(mm(s))}`;
}

export function readbackTest(m: Movement, speed: number): string {
  return `Provo «${m.name}» versione ${m.version}: ${m.steps.map(stepPhrase).join(", poi ")}, a ${fmtNum(speed)} millimetri al secondo. Confermi?`;
}

/**
 * Applica una correzione detta a voce ("doveva scendere 2 cm in più") e restituisce la versione successiva.
 * La correzione si somma al passo con la stessa direzione (o si sottrae a quello opposto); se non c'è, si aggiunge un passo.
 * `passo` (1-based) forza il passo da correggere. I passi a zero spariscono; ogni passo resta entro 100 mm.
 */
export function correct(m: Movement, c: { direzione: MoveStep["direzione"]; quantita: number; unita: "mm" | "cm"; passo?: number | null }): Movement {
  const d = c.quantita * (c.unita === "cm" ? 10 : 1);
  if (!(d > 0)) throw new Error("correzione non valida");
  const steps = m.steps.map((s) => ({ ...s }));
  const idx = c.passo && c.passo >= 1 && c.passo <= steps.length ? c.passo - 1
    : steps.findIndex((s) => s.direzione === c.direzione || s.direzione === OPP[c.direzione]);
  if (idx < 0) steps.push({ direzione: c.direzione, quantita: c.quantita, unita: c.unita });
  else {
    const s = steps[idx];
    // con segno rispetto alla direzione del passo: positivo = stessa direzione
    const v = (s.direzione === c.direzione ? mm(s) + d : mm(s) - d);
    if (Math.abs(v) < 1) steps.splice(idx, 1);
    else {
      const dir = v > 0 ? s.direzione : OPP[s.direzione];
      const a = Math.min(100, Math.abs(Math.round(v)));
      steps[idx] = a % 10 === 0 ? { direzione: dir, quantita: a / 10, unita: "cm" } : { direzione: dir, quantita: a, unita: "mm" };
    }
  }
  if (!steps.length) throw new Error("con questa correzione il movimento non fa più niente");
  return { ...m, version: m.version + 1, steps, note: `corretto: ${stepPhrase({ direzione: c.direzione, quantita: c.quantita, unita: c.unita })}` };
}

export function readbackCorrection(m: Movement): string {
  return `Versione ${m.version} di «${m.name}»: ${m.steps.map(stepPhrase).join(", poi ")}. La provo?`;
}
