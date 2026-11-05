"use client";
import { useRef, useState } from "react";
import { VoiceSession } from "@/lib/voice/client";
import { callMatches, PROBE_PHRASES } from "@/lib/voice/tools";

// Prova della voce di P0 con il kill criterion scritto prima:
// meno di 8 frasi su 10 con la function call giusta, o latenza mediana (fine parlato → function call) oltre 2,5 s → push-to-talk.
// I tool qui sono finti: niente righe sul DB, niente comandi al bridge.
interface Row { frase: string; atteso: string; trascrizione: string; call: string; ok: boolean; latency_ms: number | null }

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function Probe() {
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState("ferma");
  const [log, setLog] = useState<string[]>([]);
  const idx = useRef(0);
  const sess = useRef<VoiceSession | null>(null);
  const i = rows.length;
  const done = i >= PROBE_PHRASES.length;

  const start = async () => {
    idx.current = rows.length;
    const s = new VoiceSession({
      onState: setState,
      onLog: (l) => setLog((x) => [l, ...x].slice(0, 20)),
      onCall: async (name, args, meta) => {
        const k = idx.current;
        if (k >= PROBE_PHRASES.length) return { ok: true, frase: "Prova finita." };
        const exp = PROBE_PHRASES[k];
        idx.current = k + 1;
        setRows((r) => [...r, {
          frase: exp.frase, atteso: `${exp.tool} ${JSON.stringify(exp.args ?? {})}`, trascrizione: meta.transcript,
          call: `${name} ${JSON.stringify(args)}`, ok: callMatches(exp, name, args), latency_ms: meta.latency_ms,
        }]);
        return { ok: true, frase: "Ricevuto." };
      },
    });
    sess.current = s;
    try { await s.start(); } catch (e) { setLog((x) => [`${(e as Error).message}`, ...x]); }
  };

  const ok = rows.filter((r) => r.ok).length;
  const med = median(rows.map((r) => r.latency_ms).filter((x): x is number => x != null));
  const verdict = done ? (ok >= 8 && med != null && med <= 2500 ? "PASSA: voce realtime" : "NON PASSA → push-to-talk") : null;
  const result = { ts: new Date().toISOString(), corrette: ok, totale: rows.length, latenza_mediana_ms: med, verdetto: verdict, righe: rows };

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-2xl font-bold">Prova della voce (P0)</h1>
      <p className="text-sm text-white/60">Walkie-talkie: tieni premuto il pulsante verde mentre dici la frase, poi rilascia; la latenza si misura dal rilascio alla function call. Kill criterion: almeno 8 frasi su 10 con la function call giusta e latenza mediana ≤ 2,5 s, altrimenti push-to-talk. I tool sono finti: nessun comando arriva al bridge.</p>
      <div className="flex items-center gap-3">
        <button onClick={start} disabled={state === "in ascolto" || state === "connessione"} className="rounded bg-sky-600 px-4 py-2 font-semibold disabled:opacity-40">Avvia</button>
        <button onClick={() => { sess.current?.close(); setState("ferma"); }} className="rounded border border-white/20 px-4 py-2">Chiudi</button>
        <button onClick={() => { setRows([]); idx.current = 0; }} className="rounded border border-white/20 px-4 py-2">Ricomincia</button>
        <span className="text-sm">stato: {state}</span>
        {state === "in ascolto" && (
          <button onPointerDown={(e) => { e.preventDefault(); sess.current?.pressStart(); }} onPointerUp={() => sess.current?.pressEnd()} onPointerCancel={() => sess.current?.pressEnd()} onPointerLeave={() => sess.current?.pressEnd()}
            className="select-none touch-none rounded bg-emerald-600 px-4 py-2 font-semibold active:bg-emerald-400">Tieni premuto e di&apos; la frase</button>
        )}
      </div>
      {!done && (
        <div className="rounded-lg border border-amber-400/40 p-4 text-xl">
          Frase {i + 1}/10: <b>«{PROBE_PHRASES[i].frase}»</b>
        </div>
      )}
      <table className="w-full text-left text-xs">
        <thead className="text-white/50"><tr><th>#</th><th>frase</th><th>trascrizione</th><th>call</th><th>ms</th><th></th></tr></thead>
        <tbody>
          {rows.map((r, k) => (
            <tr key={k} className="border-t border-white/5 align-top">
              <td>{k + 1}</td><td>{r.frase}</td><td className="text-white/60">{r.trascrizione}</td>
              <td className="font-mono">{r.call}</td><td className="font-mono">{r.latency_ms ?? "—"}</td>
              <td>{r.ok ? "✓" : <span className="text-red-400" title={r.atteso}>✗</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="rounded bg-white/5 p-3 font-mono text-sm">
        corrette {ok}/{rows.length} · latenza mediana {med ?? "—"} ms {verdict && <b className="ml-2">{verdict}</b>}
      </div>
      {done && (
        <button onClick={() => navigator.clipboard.writeText(JSON.stringify(result, null, 2))} className="rounded border border-white/20 px-3 py-1 text-sm">
          copia risultato JSON (va in shared/xai-notes.md)
        </button>
      )}
      <ul className="font-mono text-[11px] text-white/40">{log.map((l, k) => <li key={k}>{l}</li>)}</ul>
    </main>
  );
}
