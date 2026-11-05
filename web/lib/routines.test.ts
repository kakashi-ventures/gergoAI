import { describe, expect, it } from "vitest";
import { checkSteps, readbackRoutine } from "./routines";

const NAMES = ["solleva", "deposita", "porta", "applica", "home", "stop", "sposta", "piu_piano", "piu_veloce"];
const ctx = { mode: "sim" as const, skills: Object.fromEntries(NAMES.map((n) => [n, { status: "draft" }])), places: new Set(["INGRESSO", "STAZIONE", "USCITA", "SCARTI", "HOME"]) };
const frontale = [
  { skill: "solleva" as const, place: "INGRESSO" as const },
  { skill: "porta" as const, place: "STAZIONE" as const },
  { skill: "attendi_operatore" as const, prompt: "metti l'etichetta frontale" },
  { skill: "applica" as const },
  { skill: "deposita" as const, place: "USCITA" as const },
];

describe("routine", () => {
  it("la frontale passa", () => expect(checkSteps(frontale, ctx)).toEqual({ ok: true }));
  it("applica fuori stazione no", () => {
    const r = checkSteps([{ skill: "solleva", place: "INGRESSO" }, { skill: "applica" }], ctx);
    expect(r).toMatchObject({ ok: false, step: 2 });
    expect(r.reason).toMatch(/STAZIONE/);
  });
  it("doppio solleva no", () => expect(checkSteps([{ skill: "solleva", place: "INGRESSO" }, { skill: "solleva", place: "INGRESSO" }], ctx).step).toBe(2));
  it("sposta non entra in una routine", () => expect(checkSteps([{ skill: "sposta", params: { direzione: "su" } }], ctx).ok).toBe(false));
  it("skill deprecata no", () => {
    const c = { ...ctx, skills: { ...ctx.skills, porta: { status: "deprecated" } } };
    expect(checkSteps(frontale, c).step).toBe(2);
  });
  it("rilettura", () =>
    expect(readbackRoutine("frontale", frontale)).toBe(
      "La routine «frontale»: sollevo dall'ingresso, porto in stazione, aspetto che tu mi dica fatto: «metti l'etichetta frontale», applico, deposito in uscita. La salvo?"));
});
