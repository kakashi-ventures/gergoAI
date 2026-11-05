// Specchio TS di bridge/motion.py (riferimento). Funzioni pure: intento → Δ mm, geofence, velocità, rilettura.
// Stessi casi di test del Python in lib/motion.test.ts. Grok emette solo l'intento; i numeri li calcola il codice.
import { VELOCITA_DEFAULT_MM_S, VELOCITA_MAX_MM_S, VELOCITA_MIN_MM_S, type SpostaParams, type Workspace } from "./contracts";

export const CLAMP_MM = 100;
export const INTENSITA_MM = { poco: 10, un_po: 20, tanto: 50 } as const;
export const DEFAULT_MM = 20;

export type Axis = "x" | "y" | "z";
export type Frame = Record<SpostaParams["direzione"], [Axis, 1 | -1]>;

// Default; la verità è shared/fixtures/frame.json (BRACCIO), letta dal server quando c'è.
export const DEFAULT_FRAME: Frame = {
  su: ["z", 1], giu: ["z", -1],
  avanti: ["x", 1], indietro: ["x", -1],
  destra: ["y", -1], sinistra: ["y", 1],
};
const AXES: Record<Axis, number> = { x: 0, y: 1, z: 2 };

export function amountMm(p: SpostaParams): { mm: number; clamped: boolean } {
  let mm: number;
  if (p.quantita != null) mm = p.quantita * (p.unita === "cm" ? 10 : 1);
  else if (p.intensita != null) mm = INTENSITA_MM[p.intensita];
  else mm = DEFAULT_MM;
  return mm > CLAMP_MM ? { mm: CLAMP_MM, clamped: true } : { mm, clamped: false };
}

export function deltaMm(p: SpostaParams, frame: Frame = DEFAULT_FRAME) {
  const { mm, clamped } = amountMm(p);
  const [axis, sign] = frame[p.direzione];
  const d: [number, number, number] = [0, 0, 0];
  d[AXES[axis]] = sign * mm;
  return { delta: d, mm, clamped };
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function geofence(target: readonly number[], ws: Workspace): { ok: boolean; fuori_di_mm: number } {
  let out = 0;
  target.forEach((v, i) => {
    if (v < ws.min_mm[i]) out = Math.max(out, ws.min_mm[i] - v);
    else if (v > ws.max_mm[i]) out = Math.max(out, v - ws.max_mm[i]);
  });
  return { ok: out === 0, fuori_di_mm: round1(out) };
}

export function nextSpeed(current: number, skill: string): number {
  if (skill === "piu_piano") return Math.max(VELOCITA_MIN_MM_S, round1(current * 0.5));
  if (skill === "piu_veloce") return Math.min(VELOCITA_MAX_MM_S, round1(current * 1.5));
  return current;
}

export const VERBI: Record<SpostaParams["direzione"], string> = {
  su: "Salgo", giu: "Scendo", avanti: "Vado avanti", indietro: "Torno indietro",
  destra: "Vado a destra", sinistra: "Vado a sinistra",
};

export function fmtNum(v: number): string {
  return Number.isInteger(v) ? String(v) : String(v).replace(".", ",");
}

/** La rilettura la scrive il codice, non Grok. Identica a bridge/motion.py::readback. */
export function readback(p: SpostaParams, speed = VELOCITA_DEFAULT_MM_S): string {
  const { mm, clamped } = amountMm(p);
  const qty = mm >= 10 && mm % 10 === 0 ? `${fmtNum(mm / 10)} centimetri` : `${fmtNum(mm)} millimetri`;
  const extra = clamped ? " (massimo 10 centimetri per comando)" : "";
  return `${VERBI[p.direzione]} di ${qty}${extra} a ${fmtNum(speed)} millimetri al secondo. Confermi?`;
}

export function speedReadback(prima: number, dopo: number): string {
  if (dopo === prima) {
    return dopo >= VELOCITA_MAX_MM_S
      ? `Sono già alla velocità massima, ${fmtNum(dopo)} millimetri al secondo.`
      : `Sono già alla velocità minima, ${fmtNum(dopo)} millimetri al secondo.`;
  }
  return `Da ora vado a ${fmtNum(dopo)} millimetri al secondo. Confermi?`;
}

export function fuoriText(fuori_di_mm: number): string {
  return `arriverei fuori dall'area di lavoro di ${fmtNum(round1(fuori_di_mm / 10))} cm`;
}
