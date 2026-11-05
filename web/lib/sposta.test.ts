import { describe, expect, it } from "vitest";
import { deltaMm, frasefuoriArea, nuovaVelocita, rileggiSposta, rileggiVelocita } from "./sposta";

const p = (o: Partial<Parameters<typeof deltaMm>[0]>) => ({
  direzione: "giu" as const, quantita: null, unita: null, intensita: null, ...o,
});

describe("deltaMm (MOTION_SAFETY §2.1)", () => {
  it("cm × 10", () => expect(deltaMm(p({ quantita: 10, unita: "cm" })).mm).toBe(100));
  it("mm così come sono", () => expect(deltaMm(p({ quantita: 15, unita: "mm" })).mm).toBe(15));
  it("quantità senza unità = centimetri", () => expect(deltaMm(p({ quantita: 3 })).mm).toBe(30));
  it("poco / un po' / tanto", () => {
    expect(deltaMm(p({ intensita: "poco" })).mm).toBe(10);
    expect(deltaMm(p({ intensita: "un_po" })).mm).toBe(20);
    expect(deltaMm(p({ intensita: "tanto" })).mm).toBe(50);
  });
  it("senza quantità = 20 mm", () => expect(deltaMm(p({})).mm).toBe(20));
  it("clamp a 100 mm", () => {
    const d = deltaMm(p({ quantita: 30, unita: "cm" }));
    expect(d).toEqual({ mm: 100, richiesti_mm: 300, limitato: true });
  });
  it("rifiuta quantità non positive", () => {
    expect(() => deltaMm(p({ quantita: 0, unita: "cm" }))).toThrow();
    expect(() => deltaMm(p({ quantita: -5, unita: "cm" }))).toThrow();
  });
});

describe("velocità", () => {
  it("più piano ×0,5 con minimo 10", () => {
    expect(nuovaVelocita(50, "piu_piano")).toBe(25);
    expect(nuovaVelocita(15, "piu_piano")).toBe(10);
  });
  it("più veloce ×1,5 con massimo 100", () => {
    expect(nuovaVelocita(50, "piu_veloce")).toBe(75);
    expect(nuovaVelocita(80, "piu_veloce")).toBe(100);
  });
  it("rilettura", () => {
    expect(rileggiVelocita(50, 25)).toBe("Da ora vado a 25 millimetri al secondo.");
    expect(rileggiVelocita(100, 100)).toMatch(/massima/);
  });
});

describe("rilettura", () => {
  it("esempio di CANTIERI.md", () => {
    expect(rileggiSposta(p({ quantita: 10, unita: "cm" }), 50)).toBe(
      "Scendo di 10 centimetri a 50 millimetri al secondo. Confermi?",
    );
  });
  it("singolare e millimetri", () => {
    expect(rileggiSposta(p({ direzione: "su", quantita: 1, unita: "cm" }), 20)).toBe(
      "Salgo di 1 centimetro a 20 millimetri al secondo. Confermi?",
    );
    expect(rileggiSposta(p({ direzione: "destra", quantita: 15, unita: "mm" }), 50)).toBe(
      "Vado a destra di 15 millimetri a 50 millimetri al secondo. Confermi?",
    );
  });
  it("dichiara il clamp", () => {
    expect(rileggiSposta(p({ direzione: "avanti", quantita: 25, unita: "cm" }), 50)).toBe(
      "Il massimo per un comando è 10 centimetri. Vado avanti di 10 centimetri a 50 millimetri al secondo. Confermi?",
    );
  });
  it("fuori area", () => {
    expect(frasefuoriArea(42)).toBe("Non lo faccio: arriverei fuori dall'area di lavoro di 5 centimetri.");
    expect(frasefuoriArea(3)).toMatch(/1 centimetro\.$/);
  });
});
