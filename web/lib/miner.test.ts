import { describe, expect, it } from "vitest";
import { type Ev, mine, type RoutineRow } from "./miner";

let n = 0;
const ev = (type: string, payload: Record<string, unknown>, run: string | null = "r1", step: number | null = null): Ev =>
  ({ id: `e${++n}`, ts: new Date(Date.UTC(2026, 10, 5, 12, 0, n)).toISOString(), type, routine_run_id: run, step, payload });
const steps = [
  { skill: "solleva" as const, place: "INGRESSO" as const }, { skill: "porta" as const, place: "STAZIONE" as const },
  { skill: "applica" as const }, { skill: "deposita" as const, place: "USCITA" as const }, { skill: "home" as const },
];
const routines: RoutineRow[] = [{ name: "frontale", version: 1, status: "active", steps }];
const runs = [{ id: "r1", routine_name: "frontale", routine_version: 1 }];

describe("miner", () => {
  it("redundant_step propone v2 senza home dopo 2 cicli", () => {
    const evs = [ev("step_end", { cycle: true, routine: "frontale", version: 1 }), ev("step_end", { cycle: true, routine: "frontale", version: 1 })];
    const f = mine(evs, runs, routines).find((x) => x.rule === "redundant_step")!;
    expect(f.proposal?.steps.map((s) => s.skill)).toEqual(["solleva", "porta", "applica", "deposita"]);
    expect(f.summary).toMatch(/torno sempre a casa/);
    expect(mine(evs.slice(0, 1), runs, routines).some((x) => x.rule === "redundant_step")).toBe(false);
  });
  it("slow_step con --inject slow:applica", () => {
    const evs = [2000, 2100, 1900, 2050, 2000, 6000].map((d) => ev("step_end", { skill: "applica", ok: true, duration_ms: d }, "r1", 3));
    const f = mine(evs, runs, routines).filter((x) => x.rule === "slow_step");
    expect(f).toHaveLength(1);
    expect(f[0].summary).toMatch(/6,0 secondi/);
  });
  it("niente slow_step se è nella norma", () => {
    const evs = [2000, 2100, 1900, 2050, 2000, 2080].map((d) => ev("step_end", { skill: "applica", ok: true, duration_ms: d }, "r1", 3));
    expect(mine(evs, runs, routines).some((x) => x.rule === "slow_step")).toBe(false);
  });
  it("repeated_failure 2 su 5", () => {
    const evs = [true, false, true, false].map((ok) => ev("step_end", { skill: "solleva", ok, duration_ms: 1000 }, "r1", 1));
    expect(mine(evs, runs, routines).some((x) => x.rule === "repeated_failure")).toBe(true);
  });
  it("repeated_correction: «è storta» 2 volte, ignorando i feedback di servizio", () => {
    const evs = [ev("feedback", { text: "è storta" }), ev("feedback", { awaiting: true, prompt: "x" }), ev("feedback", { text: "fatto", done: true }), ev("feedback", { text: "È storta " })];
    const f = mine(evs, runs, routines).filter((x) => x.rule === "repeated_correction");
    expect(f).toHaveLength(1);
    expect(f[0].evidence).toHaveLength(2);
  });
  it("repeated_sequence dettata a mano 3 volte", () => {
    const evs: Ev[] = [];
    for (let k = 0; k < 3; k++) for (const s of ["solleva", "porta", "applica"]) evs.push(ev("step_end", { skill: s, ok: true }, null));
    expect(mine(evs, runs, routines).some((x) => x.rule === "repeated_sequence")).toBe(true);
  });
});
