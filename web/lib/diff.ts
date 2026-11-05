// Confronto passo per passo tra due versioni di una routine (LCS sulle firme dei passi). Funzione pura.
export interface StepLike { skill: string; place?: string | null; prompt?: string | null }
export type DiffRow = { op: "uguale" | "tolto" | "aggiunto"; step: StepLike };

const sig = (s: StepLike) => `${s.skill}|${s.place ?? ""}|${s.prompt ?? ""}`;

export function diffSteps(a: StepLike[], b: StepLike[]): DiffRow[] {
  const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i][j] = sig(a[i]) === sig(b[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: DiffRow[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (sig(a[i]) === sig(b[j])) { out.push({ op: "uguale", step: a[i] }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) out.push({ op: "tolto", step: a[i++] });
    else out.push({ op: "aggiunto", step: b[j++] });
  }
  while (i < n) out.push({ op: "tolto", step: a[i++] });
  while (j < m) out.push({ op: "aggiunto", step: b[j++] });
  return out;
}

export function diffSummary(rows: DiffRow[]): string {
  const t = rows.filter((r) => r.op === "tolto").length, g = rows.filter((r) => r.op === "aggiunto").length;
  if (!t && !g) return "nessuna differenza";
  return [t && `${t} ${t === 1 ? "passo tolto" : "passi tolti"}`, g && `${g} ${g === 1 ? "passo aggiunto" : "passi aggiunti"}`].filter(Boolean).join(", ");
}
