import { describe, expect, it } from "vitest";
import { type AlertInput, deriveAlerts } from "./alerts";

const NOW = Date.UTC(2026, 10, 5, 13, 0, 0);
const ts = (sAgo: number) => new Date(NOW - sAgo * 1000).toISOString();
const base = (o: Partial<AlertInput> = {}): AlertInput => ({
  now: NOW, mode: "sim", guard_alive: true, guard_hb_ms: 200, bridge_hb_ms: 1000, events: [], acked: new Set(), ...o,
});

describe("allerta", () => {
  it("tutto a posto: nessuna allerta", () => expect(deriveAlerts(base())).toEqual([]));
  it("postazione mai collegata: solo info", () => {
    const a = deriveAlerts(base({ guard_hb_ms: Infinity, bridge_hb_ms: Infinity, guard_alive: false }));
    expect(a.map((x) => x.id)).toEqual(["postazione-spenta"]);
  });
  it("bridge muto da 8 s: critico", () => expect(deriveAlerts(base({ bridge_hb_ms: 8000 }))[0]).toMatchObject({ id: "bridge-muto", level: "critico" }));
  it("audio_guard morto: critico in elite, attenzione in sim", () => {
    expect(deriveAlerts(base({ mode: "elite", guard_alive: false }))[0].level).toBe("critico");
    expect(deriveAlerts(base({ guard_hb_ms: 6000 }))[0].level).toBe("attenzione");
    expect(deriveAlerts(base({ mode: "elite", guard_hb_ms: 1500 }))[0].level).toBe("critico");
    expect(deriveAlerts(base({ guard_hb_ms: 2500 }))).toEqual([]);
  });
  it("trigger acustico recente: critico con la latenza; sparisce dopo la presa visione", () => {
    const ev = { id: "t1", ts: ts(5), type: "safety_trigger", payload: { trigger: "parola", latency_ms: 142.4, features: { moving: true } } };
    const a = deriveAlerts(base({ events: [ev] }));
    expect(a[0]).toMatchObject({ level: "critico", titolo: "Arresto vocale e acustico: parola" });
    expect(a[0].sistema).toMatch(/142 ms/);
    expect(deriveAlerts(base({ events: [ev], acked: new Set(["t1"]) }))).toEqual([]);
  });
  it("le allerte persistenti non si archiviano", () => {
    expect(deriveAlerts(base({ bridge_hb_ms: 9000, acked: new Set(["bridge-muto"]) }))).toHaveLength(1);
  });
  it("collisione dal controller: critico", () => {
    const a = deriveAlerts(base({ events: [{ id: "a1", ts: ts(3), type: "anomaly", payload: { kind: "robot_state", reason: "collisione rilevata" } }] }));
    expect(a[0].level).toBe("critico");
    expect(a[0].fare).toMatch(/pendant/);
  });
  it("geofence: attenzione; eventi vecchi ignorati", () => {
    const ev = (s: number) => ({ id: `m${s}`, ts: ts(s), type: "motion_check", payload: { ok: false, reason: "arriverei fuori dall'area di lavoro di 5 cm" } });
    expect(deriveAlerts(base({ events: [ev(10)] }))[0]).toMatchObject({ level: "attenzione", titolo: "Movimento rifiutato" });
    expect(deriveAlerts(base({ events: [ev(600)] }))).toEqual([]);
  });
  it("ordine: critici prima", () => {
    const a = deriveAlerts(base({ bridge_hb_ms: 9000, events: [{ id: "s", ts: ts(2), type: "stop", payload: {} }] }));
    expect(a.map((x) => x.level)).toEqual(["critico", "attenzione"]);
  });
  it("non dice mai e-stop vocale", () => {
    const a = deriveAlerts(base({ mode: "elite", guard_alive: false, bridge_hb_ms: 9000, events: [{ id: "t", ts: ts(1), type: "safety_trigger", payload: { trigger: "botta", latency_ms: 20, features: { moving: true } } }] }));
    expect(JSON.stringify(a)).not.toMatch(/e-stop vocale/i);
  });
  it("trigger a braccio fermo: attenzione, non critico", () => {
    const a = deriveAlerts(base({ events: [{ id: "f", ts: ts(3), type: "safety_trigger", payload: { trigger: "parola", latency_ms: 24, features: { word: "stop", moving: false } } }] }));
    expect(a[0].level).toBe("attenzione");
    expect(a[0].titolo).toMatch(/braccio fermo/);
  });
  it("raffica di falsi positivi: una sola allerta con il conteggio", () => {
    const evs = Array.from({ length: 12 }, (_, k) => ({ id: `r${k}`, ts: ts(k * 5), type: "safety_trigger", payload: { trigger: "parola", latency_ms: 24, features: { word: "stop", moving: false } } }));
    const a = deriveAlerts(base({ events: evs }));
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ level: "attenzione" });
    expect(a[0].titolo).toMatch(/12 trigger/);
  });
  it("a braccio in moto resta critico anche dentro una raffica", () => {
    const evs = [{ id: "m", ts: ts(1), type: "safety_trigger", payload: { trigger: "parola", latency_ms: 30, features: { moving: true } } },
      ...Array.from({ length: 5 }, (_, k) => ({ id: `r${k}`, ts: ts(10 + k), type: "safety_trigger", payload: { trigger: "parola", latency_ms: 24, features: { moving: false } } }))];
    const a = deriveAlerts(base({ events: evs }));
    expect(a[0]).toMatchObject({ id: "m", level: "critico" });
  });
});
