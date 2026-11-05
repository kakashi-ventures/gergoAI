import { describe, expect, it } from "vitest";
import { correct, PRESETS, readbackCorrection, readbackTest } from "./movement";

const avv = PRESETS[0];
describe("prova movimento", () => {
  it("rilettura", () => expect(readbackTest(avv, 50)).toBe(
    "Provo «Avvicinamento alla stazione» versione 1: scendo di 5 centimetri, poi vado avanti di 3 centimetri, a 50 millimetri al secondo. Confermi?"));
  it("doveva scendere 2 cm in più", () => {
    const v2 = correct(avv, { direzione: "giu", quantita: 2, unita: "cm" });
    expect(v2.version).toBe(2);
    expect(v2.steps[0]).toEqual({ direzione: "giu", quantita: 7, unita: "cm" });
    expect(readbackCorrection(v2)).toMatch(/^Versione 2 .*scendo di 7 centimetri, poi vado avanti di 3 centimetri\. La provo\?$/);
  });
  it("è sceso troppo: 1 cm più su", () => expect(correct(avv, { direzione: "su", quantita: 1, unita: "cm" }).steps[0]).toEqual({ direzione: "giu", quantita: 4, unita: "cm" }));
  it("in millimetri", () => expect(correct(avv, { direzione: "indietro", quantita: 5, unita: "mm" }).steps[1]).toEqual({ direzione: "avanti", quantita: 25, unita: "mm" }));
  it("direzione nuova = passo in più", () => expect(correct(avv, { direzione: "destra", quantita: 1, unita: "cm" }).steps).toHaveLength(3));
  it("passo esplicito e clamp a 100 mm", () => expect(correct(avv, { direzione: "avanti", quantita: 20, unita: "cm", passo: 2 }).steps[1]).toEqual({ direzione: "avanti", quantita: 10, unita: "cm" }));
  it("passo annullato sparisce", () => expect(correct(avv, { direzione: "indietro", quantita: 3, unita: "cm" }).steps).toHaveLength(1));
});
