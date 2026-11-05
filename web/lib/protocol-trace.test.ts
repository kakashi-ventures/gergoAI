// La traccia mostrata in /console/protocollo è generata dal codice Python vero (web/scripts/protocol-trace.py).
// Questi test fanno fallire il build se la traccia committata mostra qualcosa che le whitelist non ammettono.
import { describe, expect, it } from "vitest";
import trace from "./generated/protocol-trace.json";
import { SDK_MAP } from "./protocol-map";

// Stessa forma di MOVEL_RE in sdk/gergo_sdk/primary.py.
const NUM = String.raw`-?\d+\.\d{6}`;
const MOVEL = new RegExp(String.raw`^def gergo_sposta\(\):\n\tmovel\(\[${NUM}, ${NUM}, ${NUM}, ${NUM}, ${NUM}, ${NUM}\], a=${NUM}, v=${NUM}\)\nend$`);
// Stessa whitelist TASK + stop di sdk/gergo_sdk/dashboard.py.
const DASH = [/^task -p [A-Za-z0-9_./-]+\.task$/, /^play$/, /^pause$/, /^stop$/];

describe("protocol-trace.json", () => {
  const ex = trace.examples;

  it("ha esempi e un commit di origine", () => {
    expect(ex.length).toBeGreaterThan(0);
    expect(trace.source_commit).toBeTruthy();
  });

  it("ogni script sulla 30001 è un solo movel nella forma ammessa", () => {
    for (const e of ex) for (const s of e.wire.primary_30001) expect(s).toMatch(MOVEL);
  });

  it("ogni riga sulla 29999 è nella whitelist dei task", () => {
    for (const e of ex) for (const l of e.wire.dashboard_29999) expect(DASH.some((r) => r.test(l))).toBe(true);
  });

  it("uno sposta accettato produce esattamente uno script, un comando rifiutato nessun byte", () => {
    for (const e of ex) {
      if (e.command.skill === "sposta" && e.validator.ok && e.kinematics?.ok) expect(e.wire.primary_30001).toHaveLength(1);
      if (!e.validator.ok) expect([...e.wire.primary_30001, ...e.wire.dashboard_29999]).toHaveLength(0);
    }
  });

  it("la mappa dell'SDK ufficiale non ha righe duplicate", () => {
    const k = SDK_MAP.map((r) => r.ufficiale);
    expect(new Set(k).size).toBe(k.length);
  });
});
