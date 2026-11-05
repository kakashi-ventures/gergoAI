// Intento "sposta" → millimetri e rilettura. Funzioni pure (MOTION_SAFETY.md §2, punti 1, 7 e 8).
// Grok emette solo l'intento a enum; i numeri e la frase da rileggere li calcola questo codice.
// I tipi sono provvisori: con contracts-v1 vengono sostituiti dagli schemi zod di lib/contracts.ts.

export const DIREZIONI = ["su", "giu", "avanti", "indietro", "destra", "sinistra"] as const;
export const UNITA = ["mm", "cm"] as const;
export const INTENSITA = ["poco", "un_po", "tanto"] as const;

export type Direzione = (typeof DIREZIONI)[number];
export type Unita = (typeof UNITA)[number];
export type Intensita = (typeof INTENSITA)[number];

export interface SpostaParams {
  direzione: Direzione;
  quantita: number | null;
  unita: Unita | null;
  intensita: Intensita | null;
}

export const MAX_MM_PER_COMANDO = 100;
export const MM_INTENSITA: Record<Intensita, number> = { poco: 10, un_po: 20, tanto: 50 };
export const MM_DEFAULT = 20;

export const VELOCITA_DEFAULT_MM_S = 50;
export const VELOCITA_MIN_MM_S = 10;
export const VELOCITA_MAX_MM_S = 100;

export interface DeltaMm {
  mm: number; // sempre > 0, già limitato a MAX_MM_PER_COMANDO
  richiesti_mm: number; // prima del clamp
  limitato: boolean;
}

/** Converte l'intento in millimetri. Una quantità senza unità vale in centimetri (come si parla). */
export function deltaMm(p: SpostaParams): DeltaMm {
  let mm: number;
  if (p.quantita != null) {
    if (!Number.isFinite(p.quantita) || p.quantita <= 0) {
      throw new Error("quantita deve essere un numero positivo");
    }
    mm = p.unita === "mm" ? p.quantita : p.quantita * 10;
  } else if (p.intensita != null) {
    mm = MM_INTENSITA[p.intensita];
  } else {
    mm = MM_DEFAULT;
  }
  const richiesti = Math.round(mm * 10) / 10;
  const limitato = richiesti > MAX_MM_PER_COMANDO;
  return { mm: limitato ? MAX_MM_PER_COMANDO : richiesti, richiesti_mm: richiesti, limitato };
}

export type ComandoVelocita = "piu_piano" | "piu_veloce";

export function nuovaVelocita(attuale: number, comando: ComandoVelocita): number {
  const v = comando === "piu_piano" ? attuale * 0.5 : attuale * 1.5;
  return Math.round(Math.min(VELOCITA_MAX_MM_S, Math.max(VELOCITA_MIN_MM_S, v)));
}

const VERBO: Record<Direzione, string> = {
  su: "Salgo",
  giu: "Scendo",
  avanti: "Vado avanti",
  indietro: "Torno indietro",
  destra: "Vado a destra",
  sinistra: "Vado a sinistra",
};

export function formattaDistanza(mm: number): string {
  if (mm % 10 === 0) {
    const cm = mm / 10;
    return `${cm} ${cm === 1 ? "centimetro" : "centimetri"}`;
  }
  return `${String(mm).replace(".", ",")} ${mm === 1 ? "millimetro" : "millimetri"}`;
}

/** La frase che la console fa dire a Grok prima del "sì". Es.: "Scendo di 10 centimetri a 50 millimetri al secondo. Confermi?" */
export function rileggiSposta(p: SpostaParams, velocita_mm_s: number): string {
  const d = deltaMm(p);
  const prefisso = d.limitato
    ? `Il massimo per un comando è ${formattaDistanza(MAX_MM_PER_COMANDO)}. `
    : "";
  return `${prefisso}${VERBO[p.direzione]} di ${formattaDistanza(d.mm)} a ${velocita_mm_s} millimetri al secondo. Confermi?`;
}

export function rileggiVelocita(prima: number, dopo: number): string {
  if (dopo === prima) {
    return dopo >= VELOCITA_MAX_MM_S
      ? `Sono già alla velocità massima, ${dopo} millimetri al secondo.`
      : `Sono già alla velocità minima, ${dopo} millimetri al secondo.`;
  }
  return `Da ora vado a ${dopo} millimetri al secondo.`;
}

/** Frase di rifiuto della geofence (MOTION_SAFETY.md §2 punto 5). */
export function frasefuoriArea(sforamento_mm: number): string {
  const cm = Math.max(1, Math.ceil(sforamento_mm / 10));
  return `Non lo faccio: arriverei fuori dall'area di lavoro di ${cm} ${cm === 1 ? "centimetro" : "centimetri"}.`;
}
