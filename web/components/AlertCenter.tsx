"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { type Alert, deriveAlerts } from "@/lib/alerts";
import type { LiveData } from "@/lib/live";

// Sistema di allerta della postazione. Le regole sono in lib/alerts.ts (testate). Qui: banner sempre visibile,
// sovrapposizione a tutto schermo per i critici, segnale acustico, presa visione registrata nel registro.
// Non sostituisce l'e-stop fisico e non resetta mai allarmi sul controller.

function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.25, 0.5].forEach((t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "square"; o.frequency.value = 880; g.gain.value = 0.08;
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.15);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch { /* audio non disponibile */ }
}

const STYLE = {
  critico: "border-red-500 bg-red-950/80 text-red-50",
  attenzione: "border-amber-400/70 bg-amber-950/60 text-amber-50",
  info: "border-sky-400/40 bg-sky-950/50 text-sky-50",
};
const ICON = { critico: "⛔", attenzione: "⚠️", info: "ℹ️" };

export function AlertCenter({ live, onAck }: { live: LiveData; onAck: (a: Alert) => Promise<void> }) {
  const [localAck, setLocalAck] = useState<Set<string>>(new Set());
  const [muted, setMuted] = useState(false);
  const beeped = useRef<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const alerts = useMemo(() => deriveAlerts({
    now, mode: live.safety.mode, guard_alive: live.safety.guard_alive,
    guard_hb_ms: live.safety.guard_heartbeat_ms_ago, bridge_hb_ms: live.safety.bridge_heartbeat_ms_ago,
    events: live.events.map((e) => ({ id: e.id, ts: e.ts, type: e.type, payload: e.payload })),
    acked: new Set([...live.acked, ...localAck]),
  }), [now, live, localAck]);

  const critical = alerts.find((a) => a.level === "critico" && !a.persistente) ?? null;
  useEffect(() => {
    for (const a of alerts.filter((x) => x.level === "critico")) {
      if (!beeped.current.has(a.id)) { beeped.current.add(a.id); if (!muted && live.source === "db") beep(); }
    }
  }, [alerts, muted, live.source]);

  const ack = async (a: Alert) => { setLocalAck((s) => new Set(s).add(a.id)); await onAck(a); };

  return (
    <>
      {alerts.length > 0 && (
        <div className="space-y-2 px-4 pt-3" role="status" aria-live="assertive">
          {alerts.slice(0, 4).map((a) => (
            <div key={a.id} className={`flex flex-wrap items-start gap-3 rounded-lg border-l-4 px-4 py-2 ${STYLE[a.level]}`}>
              <span className="text-xl">{ICON[a.level]}</span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">{a.titolo} <span className="ml-2 text-[10px] uppercase tracking-wider opacity-70">{a.level}</span></p>
                <p className="text-sm opacity-90">{a.successo} <span className="opacity-70">· {a.sistema}</span></p>
                <p className="text-sm font-semibold">→ {a.fare}</p>
              </div>
              {!a.persistente && (
                <button onClick={() => void ack(a)} className="rounded border border-current/40 px-2 py-1 text-xs hover:bg-white/10">Ho preso visione</button>
              )}
            </div>
          ))}
          {alerts.length > 4 && <p className="text-xs text-white/50">+{alerts.length - 4} altre allerte</p>}
        </div>
      )}

      {critical && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-red-950/85 p-6 backdrop-blur-sm" role="alertdialog" aria-labelledby="alert-title">
          <div className="w-full max-w-2xl rounded-2xl border-2 border-red-500 bg-[#1a0606] p-8 shadow-2xl shadow-red-900">
            <p className="animate-pulse text-sm font-bold uppercase tracking-[0.3em] text-red-400">Allerta critica</p>
            <h2 id="alert-title" className="mt-2 text-3xl font-black text-white">{critical.titolo}</h2>
            <dl className="mt-6 space-y-4 text-lg">
              <div><dt className="text-xs uppercase tracking-wider text-red-300/70">Cosa è successo</dt><dd>{critical.successo}</dd></div>
              <div><dt className="text-xs uppercase tracking-wider text-red-300/70">Cosa ha fatto il sistema</dt><dd>{critical.sistema}</dd></div>
              <div><dt className="text-xs uppercase tracking-wider text-red-300/70">Cosa devi fare</dt><dd className="font-bold text-white">{critical.fare}</dd></div>
            </dl>
            <p className="mt-6 rounded bg-black/40 p-3 text-sm text-red-100/80">
              Questo è uno stop software, in più rispetto all&apos;e-stop fisico e alla rilevazione di collisione del controller. In caso di pericolo premi l&apos;e-stop.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <button onClick={() => void ack(critical)} className="flex-1 rounded-lg bg-white py-3 text-lg font-bold text-red-900 hover:bg-red-100">Ho preso visione</button>
              <button onClick={() => setMuted((m) => !m)} className="rounded-lg border border-white/30 px-4 py-3 text-sm">{muted ? "Suono spento" : "Silenzia"}</button>
            </div>
            <p className="mt-2 text-center text-xs text-white/50">La presa visione resta nel registro con l&apos;ora. Non riarma niente sul controller.</p>
          </div>
        </div>
      )}
    </>
  );
}
