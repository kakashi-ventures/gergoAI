import { describe, expect, it } from "vitest";
import { checkTaughtFile, pyLiteralToJson } from "./scriptGate";

const head = `"""Movimento «x» v2: proposta di Gergo.\n\nEvidenze nel registro (events.id): a, b.\n"""\n\n`;
const good = head + `MOVIMENTO = {\n    "id": "avvicinamento",\n    "name": "Avvicinamento",\n    "version": 2,\n    "base": None,\n    "steps": [\n        {\n            "direzione": "giu",\n            "quantita": 7,\n            "unita": "cm",\n        },\n    ],\n    "command_ids": [\n        "c1",\n    ],\n}\n`;

describe("gate del codice", () => {
  it("letterale Python", () => expect(pyLiteralToJson(`{"a": True, "b": [None, 1.5,], }`)).toEqual({ a: true, b: [null, 1.5] }));
  it("un file di soli dati passa", () => {
    const r = checkTaughtFile("bridge/taught/movimento_avvicinamento_v2.py", good);
    expect(r.checks.filter((c) => !c.ok)).toEqual([]);
    expect(r.ok).toBe(true);
  });
  it("import o chiamate: bocciato", () => {
    expect(checkTaughtFile("bridge/taught/x.py", good.replace("MOVIMENTO =", "import os\nMOVIMENTO =")).ok).toBe(false);
    expect(checkTaughtFile("bridge/taught/x.py", good.replace('"cm"', 'open("/etc/passwd")')).ok).toBe(false);
  });
  it("passo oltre 100 mm o coordinate: bocciato", () => {
    expect(checkTaughtFile("bridge/taught/x.py", good.replace('"quantita": 7', '"quantita": 30')).checks.find((c) => c.id === "passi_validi")?.ok).toBe(false);
    expect(checkTaughtFile("bridge/taught/x.py", good.replace('"unita": "cm",', '"unita": "cm",\n            "z": 120,')).ok).toBe(false);
  });
  it("fuori da bridge/taught: bocciato", () => expect(checkTaughtFile("bridge/validator.py", good).ok).toBe(false));
});
