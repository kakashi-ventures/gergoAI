// Stessi casi di bridge/tests/test_validator.py.
import { describe, expect, it } from "vitest";
import { Event, MotionCheckPayload, SpostaParams } from "./contracts";
import * as motion from "./motion";
import { type Context, StationState, validate } from "./validator";

const NOW = new Date(Date.UTC(2026, 10, 5, 12, 0, 0));
const PLACES = new Set(["INGRESSO", "STAZIONE", "USCITA", "SCARTI", "HOME"]);
const WS = { frame: 1, min_mm: [-200, -300, 30], max_mm: [300, 300, 400] };
const NAMES = ["solleva", "deposita", "porta", "applica", "home", "stop", "sposta", "piu_piano", "piu_veloce"];
const skills = (status = "draft") => Object.fromEntries(NAMES.map((n) => [n, { status }]));
const ctx = (kw: Partial<Context> = {}): Context => ({
  mode: "sim", skills: skills(), places: PLACES, now: NOW, workspace: WS, pose: [100, 0, 250], guard_alive: true, ...kw,
});
const cmd = (skill: string, params: Record<string, unknown> = {}, age_s = 1) => ({
  id: "c", skill, params, status: "confirmed", confirmed_at: new Date(NOW.getTime() - age_s * 1000).toISOString(),
});
const sp = (o: object) => SpostaParams.parse(o);

describe("intento → mm", () => {
  it.each([
    [{ direzione: "giu", quantita: 10, unita: "cm" }, 100],
    [{ direzione: "giu", quantita: 15, unita: "mm" }, 15],
    [{ direzione: "su", intensita: "poco" }, 10],
    [{ direzione: "su", intensita: "un_po" }, 20],
    [{ direzione: "su", intensita: "tanto" }, 50],
    [{ direzione: "su" }, 20],
    [{ direzione: "su", quantita: 30, unita: "cm" }, 100],
  ])("%j → %d mm", (p, mm) => expect(motion.amountMm(sp(p)).mm).toBe(mm));

  it("assi", () => {
    expect(motion.deltaMm(sp({ direzione: "giu", quantita: 1, unita: "cm" })).delta).toEqual([0, 0, -10]);
    expect(motion.deltaMm(sp({ direzione: "avanti", quantita: 1, unita: "cm" })).delta).toEqual([10, 0, 0]);
  });
  it("rilettura", () => {
    expect(motion.readback(sp({ direzione: "giu", quantita: 10, unita: "cm" }), 50)).toBe(
      "Scendo di 10 centimetri a 50 millimetri al secondo. Confermi?");
    expect(motion.readback(sp({ direzione: "su", quantita: 30, unita: "cm" }), 25)).toBe(
      "Salgo di 10 centimetri (massimo 10 centimetri per comando) a 25 millimetri al secondo. Confermi?");
    expect(motion.readback(sp({ direzione: "destra", quantita: 15, unita: "mm" }), 12.5)).toBe(
      "Vado a destra di 15 millimetri a 12,5 millimetri al secondo. Confermi?");
  });
  it("velocità", () => {
    expect(motion.nextSpeed(50, "piu_piano")).toBe(25);
    expect(motion.nextSpeed(15, "piu_piano")).toBe(10);
    expect(motion.nextSpeed(50, "piu_veloce")).toBe(75);
    expect(motion.nextSpeed(80, "piu_veloce")).toBe(100);
  });
});

describe("sposta", () => {
  it("ok e contratto dell'event", () => {
    const d = validate(cmd("sposta", { direzione: "giu", quantita: 10, unita: "cm" }), ctx());
    expect(d.ok).toBe(true);
    expect(d.target).toEqual([100, 0, 150]);
    expect(Event.safeParse({ type: "motion_check", command_id: "c", payload: d.motion_check }).success).toBe(true);
    expect(MotionCheckPayload.safeParse(d.motion_check).success).toBe(true);
  });
  it("geofence su z_min", () => {
    const d = validate(cmd("sposta", { direzione: "giu", quantita: 10, unita: "cm" }), ctx({ pose: [100, 0, 80] }));
    expect(d.code).toBe("geofence");
    expect(d.reason).toBe("arriverei fuori dall'area di lavoro di 5 cm");
    expect(d.motion_check?.geofence_ok).toBe(false);
    expect(MotionCheckPayload.safeParse(d.motion_check).success).toBe(true);
  });
  it("fuori dal box di lato", () => {
    const d = validate(cmd("sposta", { direzione: "avanti", quantita: 10, unita: "cm" }), ctx({ pose: [290, 0, 200] }));
    expect(d.ok).toBe(false);
    expect(d.motion_check?.fuori_di_mm).toBe(90);
  });
  it("audio_guard morto", () => expect(validate(cmd("sposta", { direzione: "su" }), ctx({ guard_alive: false })).code).toBe("guard_dead"));
  it("TCP non coincide", () =>
    expect(validate(cmd("sposta", { direzione: "su" }), ctx({ tool_expected_tcp_mm: [0, 0, 200], tool_actual_tcp_mm: [0, 0, 0] })).code).toBe("tcp_mismatch"));
  it("senza workspace", () => expect(validate(cmd("sposta", { direzione: "su" }), ctx({ workspace: null })).code).toBe("no_workspace"));
  it("coordinate rifiutate", () => expect(validate(cmd("sposta", { direzione: "su", z: 10 }), ctx()).code).toBe("contract"));
});

describe("regole generali", () => {
  it("deprecata", () => {
    const s = skills(); s.solleva.status = "deprecated";
    expect(validate(cmd("solleva", { place: "INGRESSO" }), ctx({ skills: s })).code).toBe("deprecated");
  });
  it("vecchio", () => expect(validate(cmd("home", {}, 31), ctx()).code).toBe("stale"));
  it("non confermato", () => {
    expect(validate({ ...cmd("home"), status: "queued", confirmed_at: null }, ctx()).code).toBe("not_confirmed");
  });
  it("alla proposta non serve la conferma", () => {
    expect(validate({ ...cmd("home"), status: "queued", confirmed_at: null }, ctx({ phase: "propose" })).ok).toBe(true);
  });
  it("elite richiede confirmed", () => {
    expect(validate(cmd("home"), ctx({ mode: "elite" })).code).toBe("not_confirmed_skill");
    expect(validate(cmd("home"), ctx({ mode: "elite", skills: skills("confirmed") })).code).toBe("ontology_draft");
    expect(validate(cmd("home"), ctx({ mode: "elite", skills: skills("confirmed"), ontology_status: "confirmed" })).ok).toBe(true);
  });
  it("precondizioni", () => {
    expect(validate(cmd("deposita", { place: "USCITA" }), ctx()).code).toBe("precondition");
    expect(validate(cmd("applica"), ctx({ station: new StationState(true, "INGRESSO") })).code).toBe("precondition");
    expect(validate(cmd("applica"), ctx({ station: new StationState(true, "STAZIONE") })).ok).toBe(true);
    expect(validate(cmd("solleva", { place: "INGRESSO" }), ctx({ station: new StationState(true, "HOME") })).code).toBe("precondition");
  });
  it("lo stop passa sempre", () => expect(validate(cmd("stop"), ctx({ skills: {} })).ok).toBe(true));
});
