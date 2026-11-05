import { describe, expect, it } from "vitest";
import { diffSteps, diffSummary } from "./diff";

const v1 = [{ skill: "solleva", place: "INGRESSO" }, { skill: "porta", place: "STAZIONE" }, { skill: "applica" }, { skill: "deposita", place: "USCITA" }, { skill: "home" }];
describe("diff", () => {
  it("home tolto", () => {
    const d = diffSteps(v1, v1.slice(0, 4));
    expect(d.map((r) => r.op)).toEqual(["uguale", "uguale", "uguale", "uguale", "tolto"]);
    expect(diffSummary(d)).toBe("1 passo tolto");
  });
  it("luogo cambiato = tolto + aggiunto", () => {
    const v2 = [...v1.slice(0, 3), { skill: "deposita", place: "SCARTI" }, v1[4]];
    expect(diffSummary(diffSteps(v1, v2))).toBe("1 passo tolto, 1 passo aggiunto");
  });
  it("uguali", () => expect(diffSummary(diffSteps(v1, v1))).toBe("nessuna differenza"));
});
