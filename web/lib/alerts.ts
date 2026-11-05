// Sistema di allerta: regole deterministiche su stato e registro. Nessuna allerta viene da Grok.
// Linguaggio: "arresto vocale e acustico" è uno stop software; l'e-stop è il pulsante fisico dello staff.

export type Level = "critico" | "attenzione" | "info";

export interface Alert {
  id: string;
  level: Level;
  titolo: string;
  successo: string; // cosa è successo
  sistema: string; // cosa ha già fatto il sistema
  fare: string; // cosa deve fare la persona
  ts: string | null;
  persistente: boolean; // resta finché la condizione dura (non si archivia con "presa visione")
}

export interface AlertInput {
  now: number;
  mode: "sim" | "elite";
  guard_alive: boolean;
  guard_hb_ms: number; // Infinity = mai visto
  bridge_hb_ms: number;
  events: { id: string; ts: string; type: string; payload?: Record<string, unknown> }[];
  acked: Set<string>;
}

// Reale: 1 s come il bridge. Sim: la guardia arriva col heartbeat del bridge ogni 2 s, quindi 5 s.
const GUARD_MAX_MS = { elite: 1000, sim: 5000 } as const;
const BRIDGE_MAX_MS = 5000;
const RECENT_MS = { trigger: 120_000, stop: 30_000, reject: 60_000 };

const BURST = 3;
const ESTOP_HINTS = /e-?stop|emergenz|collisi|protective|safeguard|allarme|alarm|fault/i;

export function deriveAlerts(i: AlertInput): Alert[] {
  const out: Alert[] = [];
  const age = (ts: string) => i.now - new Date(ts).getTime();
  const bridgeSeen = Number.isFinite(i.bridge_hb_ms);

  if (!bridgeSeen && !Number.isFinite(i.guard_hb_ms)) {
    out.push({
      id: "postazione-spenta", level: "info", titolo: "Postazione non collegata", ts: null, persistente: true,
      successo: "Né il bridge né audio_guard hanno mai mandato un segnale.",
      sistema: "Nessun comando può arrivare al braccio.",
      fare: "Avvia il bridge sul laptop della postazione (python -m bridge.main --mode sim) e audio_guard.",
    });
  } else {
    if (bridgeSeen && i.bridge_hb_ms > BRIDGE_MAX_MS) {
      out.push({
        id: "bridge-muto", level: "critico", titolo: "Il bridge non risponde", ts: null, persistente: true,
        successo: `Ultimo segnale dal bridge ${Math.round(i.bridge_hb_ms / 1000)} secondi fa.`,
        sistema: "I comandi restano in coda: nessuno viene eseguito finché il bridge non torna.",
        fare: "Se il braccio si sta muovendo, premi l'e-stop fisico. Poi controlla il laptop del bridge.",
      });
    }
    if (!i.guard_alive || i.guard_hb_ms > GUARD_MAX_MS[i.mode]) {
      out.push({
        id: "guard-morto", level: i.mode === "elite" ? "critico" : "attenzione", titolo: "Arresto vocale e acustico non attivo", ts: null, persistente: true,
        successo: Number.isFinite(i.guard_hb_ms) ? `audio_guard tace da ${(i.guard_hb_ms / 1000).toFixed(1)} s.` : "audio_guard non è mai partito.",
        sistema: "Il bridge rifiuta ogni movimento finché audio_guard non è vivo (fail-safe).",
        fare: "Controlla microfono e processo audio_guard sul laptop. L'e-stop fisico resta sempre disponibile.",
      });
    }
  }

  // Arresti acustici: a braccio fermo non sono un'emergenza (nessun movimento da fermare). Una raffica di trigger
  // in pochi minuti è quasi sempre un falso positivo del riconoscitore: si segnala UNA volta, con il conteggio.
  const recentTriggers = i.events.filter((e) => e.type === "safety_trigger" && age(e.ts) < RECENT_MS.trigger);
  const movingTriggers = recentTriggers.filter((e) => (e.payload?.features as Record<string, unknown> | undefined)?.moving === true);
  const idleTriggers = recentTriggers.filter((e) => !movingTriggers.includes(e));
  if (idleTriggers.length >= BURST) {
    const last = idleTriggers[0];
    const byType = idleTriggers.reduce<Record<string, number>>((m, e) => { const k = String(e.payload?.trigger ?? "?"); m[k] = (m[k] ?? 0) + 1; return m; }, {});
    out.push({
      id: `raffica-${last.id}`, level: "attenzione", titolo: `Arresto acustico: ${idleTriggers.length} trigger a braccio fermo in 2 minuti`, ts: last.ts, persistente: false,
      successo: `Probabili falsi positivi (${Object.entries(byType).map(([k, n]) => `${k} ${n}`).join(", ")}). Il braccio era fermo.`,
      sistema: "Ogni trigger manda comunque lo stop: nessun nuovo movimento parte finché il segnale non si calma.",
      fare: "Usa un headset con microfono vicino alla bocca, abbassa il volume delle casse e ritara audio_guard sulla sala.",
    });
  }
  for (const e of i.events) {
    const p = e.payload ?? {};
    const a = age(e.ts);
    const moving = (p.features as Record<string, unknown> | undefined)?.moving === true;
    if (e.type === "safety_trigger" && a < RECENT_MS.trigger && (moving || idleTriggers.length < BURST)) {
      out.push({
        id: e.id, level: moving ? "critico" : "attenzione", titolo: `Arresto vocale e acustico: ${String(p.trigger ?? "trigger")}${moving ? "" : " (braccio fermo)"}`, ts: e.ts, persistente: false,
        successo: `audio_guard ha riconosciuto «${String(p.trigger)}»${p.features && (p.features as Record<string, unknown>).word ? ` (${String((p.features as Record<string, unknown>).word)})` : ""}.`,
        sistema: `Stop inviato direttamente al controller in ${Math.round(Number(p.latency_ms ?? 0))} ms. Coda dei comandi svuotata.`,
        fare: "Verifica che nessuno sia nell'area del braccio. Se il controller è in allarme, si riarma dal pendant (lo fa una persona).",
      });
    } else if (e.type === "anomaly" && ESTOP_HINTS.test(JSON.stringify(p)) && a < RECENT_MS.trigger) {
      out.push({
        id: e.id, level: "critico", titolo: "Il controller segnala emergenza o collisione", ts: e.ts, persistente: false,
        successo: String(p.reason ?? p.code ?? p.kind ?? "stato di sicurezza del controller"),
        sistema: "Nessun nuovo comando: il software non resetta mai allarmi né collisioni.",
        fare: "Riarmo solo dal pendant, a cura dello staff. Poi di' «pronto».",
      });
    } else if (e.type === "stop" && a < RECENT_MS.stop) {
      out.push({
        id: e.id, level: "attenzione", titolo: "Stop eseguito", ts: e.ts, persistente: false,
        successo: `Stop richiesto da ${String(p.source ?? "operatore")}.`,
        sistema: "Comandi in coda annullati.",
        fare: "Quando la postazione è sicura, ridai il comando.",
      });
    } else if (e.type === "motion_check" && p.ok === false && a < RECENT_MS.reject) {
      out.push({
        id: e.id, level: "attenzione", titolo: "Movimento rifiutato", ts: e.ts, persistente: false,
        successo: String(p.reason ?? "controllo del movimento non superato"),
        sistema: "Il braccio non si è mosso.",
        fare: "Ridai un comando più piccolo o in un'altra direzione.",
      });
    } else if (e.type === "anomaly" && a < RECENT_MS.reject) {
      out.push({
        id: e.id, level: "attenzione", titolo: "Comando rifiutato dal validatore", ts: e.ts, persistente: false,
        successo: String(p.reason ?? p.code ?? "regola non rispettata"),
        sistema: "Il comando non è stato eseguito ed è nel registro.",
        fare: "Controlla il motivo e ripeti il comando corretto.",
      });
    }
  }

  const rank: Record<Level, number> = { critico: 0, attenzione: 1, info: 2 };
  return out
    .filter((x) => x.persistente || !i.acked.has(x.id))
    .sort((a, b) => rank[a.level] - rank[b.level] || (b.ts ?? "").localeCompare(a.ts ?? ""));
}
