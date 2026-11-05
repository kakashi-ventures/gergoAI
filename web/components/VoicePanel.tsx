"use client";
import { useEffect, useRef, useState } from "react";
import { type Activity, VoiceSession } from "@/lib/voice/client";

// "Parla al braccio": ogni function call di Grok va a /api/tools/<nome>; la frase da dire la scrive il codice.
// Inizio parlato durante un movimento → stop (stop software in più: l'arresto vocale e acustico locale è
// audio_guard, l'e-stop è il pulsante fisico dello staff).
const MOVE_WINDOW_MS = 20_000;
const ALLOWED: Record<string, string[]> = {
  propone_azione: ["skill", "params", "utterance"],
  sposta: ["direzione", "quantita", "unita", "intensita", "utterance"],
  piu_piano: ["utterance"], piu_veloce: ["utterance"], conferma: [], annulla: [], stop: [],
  definisci_routine: ["name", "steps", "utterance"], salva_routine: ["name"], esegui_routine: ["name", "ripetizioni", "utterance"],
  fatto: [], segnala: ["text"], resoconto: [], approva_proposta: ["approva"], proponi_script: ["kind", "name"],
};

const LABEL: Record<Activity | "spenta" | "connessione" | "errore", string> = {
  spenta: "Voce spenta", connessione: "Mi collego…", errore: "Voce non disponibile",
  ascolto: "Ti ascolto", parli: "Stai parlando", penso: "Ci penso", risponde: "Ti rispondo",
};
const RING: Record<string, string> = {
  spenta: "from-white/10 to-white/5", connessione: "from-sky-500/40 to-sky-900/20", errore: "from-red-600/50 to-red-900/30",
  ascolto: "from-sky-400/60 to-indigo-700/30", parli: "from-emerald-400/70 to-emerald-800/30",
  penso: "from-amber-300/60 to-amber-800/30", risponde: "from-fuchsia-400/60 to-indigo-800/30",
};

export interface VoiceLine { who: "tu" | "gergo" | "sistema"; text: string; ts: number }

export function VoicePanel({ announce, big = false, pendingFrase }: { announce?: { id: number; text: string } | null; big?: boolean; pendingFrase?: string | null }) {
  const [state, setState] = useState<string>("spenta");
  const [act, setAct] = useState<Activity | null>(null);
  const [level, setLevel] = useState(0);
  const [said, setSaid] = useState("");
  const [reply, setReply] = useState("");
  const [lines, setLines] = useState<VoiceLine[]>([]);
  const [awaitingYes, setAwaitingYes] = useState<string | null>(null);
  const sess = useRef<VoiceSession | null>(null);
  const movingUntil = useRef(0);
  const push = (l: Omit<VoiceLine, "ts">) => setLines((x) => [{ ...l, ts: Date.now() }, ...x].slice(0, 8));

  useEffect(() => { if (announce && state === "in ascolto") sess.current?.say(announce.text); }, [announce, state]);

  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await fetch(`/api/tools/${name}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(args) });
    const out = (await r.json().catch(() => ({ ok: false, frase: `errore ${r.status}` }))) as Record<string, unknown>;
    const frase = String(out.frase ?? "");
    push({ who: "sistema", text: `${name} → ${frase}` });
    setAwaitingYes(out.ok && /Confermi\?|La salvo\?/.test(frase) ? frase : null);
    if (name === "conferma" && out.ok) movingUntil.current = Date.now() + MOVE_WINDOW_MS;
    if (name === "stop") movingUntil.current = 0;
    return out;
  };

  const start = async () => {
    const s = new VoiceSession({
      onState: setState,
      onActivity: setAct,
      onLevel: setLevel,
      onTranscript: setSaid,
      onReply: setReply,
      onLog: (l) => push({ who: "sistema", text: l }),
      onSpeechStarted: () => {
        setReply("");
        if (Date.now() < movingUntil.current) { movingUntil.current = 0; void call("stop", { source: "voce_vad" }); }
      },
      onCall: async (name, args, meta) => {
        if (meta.transcript) push({ who: "tu", text: meta.transcript });
        const keep = ALLOWED[name] ?? [];
        const body = Object.fromEntries(Object.entries(args).filter(([k]) => keep.includes(k)));
        return call(name, name === "stop" ? { source: "voce" } : body);
      },
    });
    sess.current = s;
    try { await s.start(); } catch (e) { push({ who: "sistema", text: (e as Error).message }); setState("errore"); }
  };
  const stopVoice = () => { sess.current?.close(); sess.current = null; setState("spenta"); setAct(null); setLevel(0); };

  useEffect(() => { if (reply && act !== "risponde" && act !== "penso") push({ who: "gergo", text: reply }); }, [act]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => sess.current?.close(), []);

  const key = state === "in ascolto" ? (act ?? "ascolto") : state === "chiusa" ? "spenta" : state;
  const on = state === "in ascolto";
  const size = big ? "h-44 w-44" : "h-32 w-32";
  const confirmText = awaitingYes ?? pendingFrase ?? null;

  return (
    <section className="rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white/50">Parla al braccio</h2>
        <a href="/console/probe" className="text-[11px] text-sky-300/80 underline">prova della voce</a>
      </div>
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={on ? stopVoice : start}
          aria-label={on ? "Spegni la voce" : "Accendi la voce"}
          className={`relative ${size} rounded-full bg-gradient-to-br ${RING[key] ?? RING.spenta} shadow-[0_0_60px_-10px] shadow-sky-500/30 transition-all duration-300`}
          style={{ transform: `scale(${1 + (on && act === "parli" ? level * 0.25 : 0)})` }}
        >
          {on && <span className="absolute inset-0 animate-ping rounded-full bg-white/5" />}
          <span className="absolute inset-3 rounded-full bg-[#0b0d10]/80 backdrop-blur" />
          <span className="relative flex h-full flex-col items-center justify-center gap-1">
            <svg viewBox="0 0 24 24" className="h-9 w-9 fill-white/90"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" /></svg>
            <span className="text-xs font-semibold text-white/90">{LABEL[key as keyof typeof LABEL] ?? key}</span>
          </span>
        </button>
        <div className="flex h-6 items-end gap-0.5" aria-hidden>
          {Array.from({ length: 24 }).map((_, k) => (
            <span key={k} className="w-1 rounded bg-sky-400/70 transition-all duration-75"
              style={{ height: `${on ? Math.max(8, Math.min(100, level * 100 * (0.5 + Math.abs(Math.sin(k * 1.7 + Date.now() / 300))))) : 8}%` }} />
          ))}
        </div>
        <p className="min-h-[1.5rem] text-center text-lg italic text-white/90">{said ? `«${said}»` : on ? "Di' per esempio: «scendi di 10 centimetri»" : "Tocca il microfono per parlare"}</p>
        {reply && <p className="text-center text-sm text-fuchsia-200/90">Gergo: {reply}</p>}
      </div>

      {confirmText && (
        <div className="mt-4 rounded-lg border border-amber-400/50 bg-amber-400/10 p-4">
          <p className="text-xs uppercase tracking-wider text-amber-200/80">Rilettura (scritta dal codice)</p>
          <p className="mt-1 text-xl font-semibold">{confirmText}</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button onClick={() => void call(/La salvo\?/.test(confirmText) ? "salva_routine" : "conferma", /La salvo\?/.test(confirmText) ? { name: (confirmText.match(/«(.+?)»/) ?? [])[1] ?? "" } : {})}
              className="rounded-lg bg-emerald-600 py-3 text-lg font-bold hover:bg-emerald-500">Sì</button>
            <button onClick={() => void call("annulla", {})} className="rounded-lg border border-white/20 py-3 text-lg font-bold hover:bg-white/5">No</button>
          </div>
          <p className="mt-2 text-center text-[11px] text-white/50">Puoi anche dirlo a voce: «sì» oppure «no».</p>
        </div>
      )}

      {lines.length > 0 && (
        <ol className="mt-4 space-y-1 border-t border-white/5 pt-3 text-xs">
          {lines.map((l) => (
            <li key={l.ts + l.text} className="flex gap-2">
              <span className={`w-14 shrink-0 font-semibold ${l.who === "tu" ? "text-emerald-300" : l.who === "gergo" ? "text-fuchsia-300" : "text-white/40"}`}>{l.who}</span>
              <span className={l.who === "sistema" ? "font-mono text-white/50" : "text-white/85"}>{l.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
