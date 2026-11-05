import { describe, expect, it } from "vitest";
import { ARM, fkPoints, pathFrom, schematicArm, trailFromEvents } from "./arm3d";

const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe("spazio del braccio", () => {
  it("braccio schematico: segmenti con le lunghezze giuste e TCP raggiunto", () => {
    const a = schematicArm([250, -100, 200]);
    expect(a.reachable).toBe(true);
    const [, sh, el, wr, tcp] = a.points;
    expect(dist(sh, el)).toBeCloseTo(ARM.upper, 0);
    expect(dist(el, wr)).toBeCloseTo(ARM.fore, 0);
    expect(dist(tcp, [250, -100, 200])).toBeLessThan(1);
    expect(wr[2] - tcp[2]).toBeCloseTo(ARM.wrist, 0);
  });
  it("fuori portata: segnalato", () => expect(schematicArm([900, 0, 100]).reachable).toBe(false));
  it("percorso di una versione: avvicinamento v2 (giù 7 cm, avanti 3 cm)", () => {
    expect(pathFrom([100, 0, 250], [{ direzione: "giu", quantita: 7, unita: "cm" }, { direzione: "avanti", quantita: 3, unita: "cm" }]))
      .toEqual([[100, 0, 250], [100, 0, 180], [130, 0, 180]]);
  });
  it("FK dai giunti: 7 punti, base nell'origine", () => {
    const f = fkPoints([0, -90, 0, -90, 0, 0]);
    expect(f.points).toHaveLength(7);
    expect(f.points[0]).toEqual([0, 0, 0]);
  });
  it("scia dal registro", () => {
    const t = trailFromEvents([
      { ts: "2026-11-05T15:00:01Z", type: "motion_check", payload: { ok: true, pose_mm: [100, 0, 250], target_mm: [100, 0, 150] } },
      { ts: "2026-11-05T15:00:00Z", type: "motion_check", payload: { ok: false, pose_mm: [1, 1, 1] } },
    ]);
    expect(t).toEqual([[100, 0, 250], [100, 0, 150]]);
  });
});
