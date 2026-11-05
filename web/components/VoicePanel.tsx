"use client";
import { useRef, useState } from "react";
import { VoiceSession } from "@/lib/voice/client";
import { Panel } from "./Panel";

// Voce della console: ogni function call va a /api/tools/<nome>. Inizio parlato durante un movimento → stop
// (stop software in più: l'arresto vocale e acustico locale è audio_guard, l'e-stop è fisico).
const MOVE_WINDOW_MS = 20_000;
const ALLOWED: Record<string, string[]> = {
  propone_azione: ["skill", "params", "utterance"],
  sposta: ["direzione", "quantita", "unita", "intensita", "utterance"],
  piu_piano: ["utterance"], piu_veloce: ["utterance"], conferma: [], annulla: [], stop: [],
};

export function VoicePanel() {
  const [state, setState] = useState("spenta");
  const [said, setSaid] = useState("");
  const [last, setLast] = useState<string>("");
  const sess = useRef<VoiceSession | null>(null);
  const movingUntil = useRef(0);

  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await fetch(`/api/tools/${name}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(args) });
    const out = (await r.json()) as Record<string, unknown>;
    setLast(`${name} → ${String(out.frase ?? "")}`);
    if (name === "conferma" && out.ok) movingUntil.current = Date.now() + MOVE_WINDOW_MS;
    if (name === "stop") movingUntil.current = 0;
    return out;
  };

  const start = async () => {
    const s = new VoiceSession({
      onState: setState,
      onTranscript: setSaid,
      onLog: (l) => setLast(l),
      onSpeechStarted: () => {
        if (Date.now() < movingUntil.current) { movingUntil.current = 0; void call("stop", { source: "voce_vad" }); }
      },
      onCall: async (name, args) => {
        // Solo le chiavi che la route accetta: le route sono strict e rifiutano tutto il resto.
        const keep = ALLOWED[name] ?? [];
        const body = Object.fromEntries(Object.entries(args).filter(([k]) => keep.includes(k)));
        return call(name, name === "stop" ? { source: "voce" } : body);
      },
    });
    sess.current = s;
    try { await s.start(); } catch (e) { setLast((e as Error).message); }
  };

  return (
    <Panel title="Voce · Grok">
      <div className="flex items-center gap-2">
        {state === "in ascolto" ? (
          <button onClick={() => { sess.current?.close(); setState("spenta"); }} className="rounded bg-white/10 px-3 py-1.5 text-sm">Spegni</button>
        ) : (
          <button onClick={start} className="rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold">Accendi la voce</button>
        )}
        <span className="text-xs text-white/50">{state}</span>
        <a href="/console/probe" className="ml-auto text-xs text-sky-300 underline">prova della voce</a>
      </div>
      {said && <p className="mt-2 text-sm italic">«{said}»</p>}
      {last && <p className="mt-1 font-mono text-xs text-white/60">{last}</p>}
    </Panel>
  );
}
