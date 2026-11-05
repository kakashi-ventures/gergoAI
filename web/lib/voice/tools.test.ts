import { describe, expect, it } from "vitest";
import { SpostaParams } from "../contracts";
import { callMatches, PROBE_PHRASES, VOICE_TOOLS } from "./tools";

describe("tool vocali", () => {
  it("sposta non ha campi di coordinate", () => {
    const sposta = VOICE_TOOLS.find((t) => t.name === "sposta")!;
    const keys = Object.keys(sposta.parameters.properties);
    expect(keys.sort()).toEqual(["direzione", "intensita", "quantita", "unita", "utterance"].sort());
    for (const k of ["x", "y", "z", "pose", "target_pose", "joints"]) expect(keys).not.toContain(k);
  });
  it("gli args attesi di sposta rispettano il contratto", () => {
    for (const p of PROBE_PHRASES.filter((p) => p.tool === "sposta")) expect(SpostaParams.safeParse(p.args).success).toBe(true);
  });
  it("callMatches", () => {
    expect(callMatches(PROBE_PHRASES[3], "sposta", { direzione: "giu", quantita: 10, unita: "cm", intensita: null })).toBe(true);
    expect(callMatches(PROBE_PHRASES[3], "sposta", { direzione: "giu", intensita: "tanto" })).toBe(false);
    expect(callMatches(PROBE_PHRASES[9], "propone_azione", {})).toBe(false);
  });
});
