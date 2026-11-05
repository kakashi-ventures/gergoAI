// Gate del codice sugli script Python proposti dalla voce (bridge/taught/*.py). Deterministico, senza modelli.
// Un file passa solo se è SOLO DATI: docstring + una assegnazione a MOVIMENTO o ROUTINE con un letterale,
// nessun import, nessuna chiamata, nessun nome speciale, e i valori dentro i limiti di MOTION_SAFETY.md.
// Lo stesso controllo gira in CI (gate/check_taught.py) sulla Pull Request.

export interface GateCheck { id: string; ok: boolean; detail: string }

const DIREZIONI = new Set(["su", "giu", "avanti", "indietro", "destra", "sinistra"]);
const SKILLS = new Set(["solleva", "porta", "deposita", "applica", "home", "attendi_operatore"]);
const PLACES = new Set(["INGRESSO", "STAZIONE", "USCITA", "SCARTI", "HOME"]);
const AXIS: Record<string, [number, number]> = { su: [2, 1], giu: [2, -1], avanti: [0, 1], indietro: [0, -1], sinistra: [1, 1], destra: [1, -1] };
const FORBIDDEN = [/\bimport\b/, /\bexec\b/, /\beval\b/, /\bopen\s*\(/, /__\w+__/, /\blambda\b/, /^\s*def\s/m, /^\s*class\s/m, /\bos\./, /\bsubprocess\b/, /\bsocket\b/, /\bgetattr\b/, /\bcompile\b/];
export const MAX_STEP_MM = 100;
export const MAX_TOTAL_AXIS_MM = 300;

/** Letterale Python (dict/list/str/num/True/False/None) → JSON. Rifiuta qualunque altra cosa. */
export function pyLiteralToJson(src: string): unknown {
  let out = "", i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"') { // stringa JSON-compatibile (il generatore usa JSON.stringify)
      let j = i + 1;
      while (j < src.length && src[j] !== '"') j += src[j] === "\\" ? 2 : 1;
      out += src.slice(i, j + 1); i = j + 1; continue;
    }
    if (/[\s{}[\]:,\-0-9.eE+]/.test(c)) { out += c; i++; continue; }
    const m = /^(True|False|None)\b/.exec(src.slice(i));
    if (m) { out += m[1] === "True" ? "true" : m[1] === "False" ? "false" : "null"; i += m[1].length; continue; }
    throw new Error(`carattere non ammesso in un letterale: «${c}»`);
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

export function checkTaughtFile(path: string, content: string): { ok: boolean; checks: GateCheck[]; data: unknown } {
  const checks: GateCheck[] = [];
  const add = (id: string, ok: boolean, detail: string) => checks.push({ id, ok, detail });
  add("percorso", /^bridge\/taught\/[a-z0-9_]+\.py$/.test(path), `il file sta in bridge/taught/: ${path}`);
  const doc = /^"""[\s\S]*?"""\s*\n/.exec(content);
  add("provenienza", !!doc && /Evidenze nel registro/.test(doc[0]), "docstring con la provenienza e le evidenze del registro");
  const body = doc ? content.slice(doc[0].length) : content;
  const bad = FORBIDDEN.filter((r) => r.test(body)).map((r) => r.source);
  add("solo_dati", bad.length === 0, bad.length ? `costrutti vietati: ${bad.join(", ")}` : "nessun import, chiamata, def, class o nome speciale");
  const m = /^\s*(MOVIMENTO|ROUTINE)\s*=\s*([\s\S]+)$/.exec(body.trim());
  add("una_assegnazione", !!m, "una sola assegnazione a MOVIMENTO o ROUTINE");
  let data: unknown = null;
  if (m) {
    try { data = pyLiteralToJson(m[2]); add("letterale", true, "il valore è un letterale (dict, liste, stringhe, numeri)"); }
    catch (e) { add("letterale", false, (e as Error).message); }
  }
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    const steps = (Array.isArray(d.steps) ? d.steps : []) as Record<string, unknown>[];
    if (m?.[1] === "MOVIMENTO") {
      const errs: string[] = [];
      const tot = [0, 0, 0];
      steps.forEach((s, k) => {
        if (!DIREZIONI.has(String(s.direzione))) errs.push(`passo ${k + 1}: direzione «${String(s.direzione)}»`);
        const mm = Number(s.quantita) * (s.unita === "cm" ? 10 : s.unita === "mm" ? 1 : NaN);
        if (!(mm > 0 && mm <= MAX_STEP_MM)) errs.push(`passo ${k + 1}: ${String(s.quantita)} ${String(s.unita)} fuori da (0, ${MAX_STEP_MM}] mm`);
        const ax = AXIS[String(s.direzione)];
        if (ax && mm > 0) tot[ax[0]] += ax[1] * mm;
        for (const key of Object.keys(s)) if (!["direzione", "quantita", "unita"].includes(key)) errs.push(`passo ${k + 1}: campo «${key}» non ammesso (niente coordinate)`);
      });
      add("passi_validi", errs.length === 0, errs.length ? errs.join("; ") : `${steps.length} passi: direzioni valide, ogni passo ≤ ${MAX_STEP_MM} mm`);
      const over = tot.map(Math.abs).some((v) => v > MAX_TOTAL_AXIS_MM);
      add("spostamento_totale", !over, `spostamento netto x ${tot[0]} · y ${tot[1]} · z ${tot[2]} mm (limite ${MAX_TOTAL_AXIS_MM} mm per asse)`);
      const b = d.base as Record<string, unknown> | null | undefined;
      add("task_di_base", !b || (SKILLS.has(String(b.skill)) && (b.place == null || PLACES.has(String(b.place))) && /^[a-zA-Z0-9_]+\.task$/.test(String(b.task))), b ? `task ${String(b.task)}` : "nessun task di base");
      add("evidenze", Array.isArray(d.command_ids) && (d.command_ids as unknown[]).length === steps.length, "un comando eseguito nel registro per ogni passo");
    } else {
      const errs = steps.map((s, k) => (!SKILLS.has(String(s.skill)) ? `passo ${k + 1}: skill «${String(s.skill)}»` : s.place != null && !PLACES.has(String(s.place)) ? `passo ${k + 1}: luogo «${String(s.place)}»` : "")).filter(Boolean);
      add("passi_validi", steps.length > 0 && errs.length === 0, errs.length ? errs.join("; ") : `${steps.length} passi con skill e luoghi della whitelist`);
    }
  }
  return { ok: checks.every((c) => c.ok), checks, data };
}
