"use client";
import { type MutableRefObject, useEffect, useRef, useState } from "react";
import type { LiveData } from "@/lib/live";
import { correct, type Movement, type MoveStep, PRESETS, readbackCorrection, readbackTest, stepPhrase } from "@/lib/movement";

// Prova di un movimento con correzione a voce:
// scegli un movimento prestabilito → rilettura → sì → il braccio lo esegue passo per passo → "si è mosso bene?" →
// correzione ("doveva scendere 2 cm in più") = nuova versione → riprova → "è giusto" → proposta di script (PR).
export type LocalTools = Record<string, (args: Record<string, unknown>) => Promise<Record<string, unknown>>> & { __intercept?: (name: string) => boolean };

type Phase = "scegli" | "conferma_prova" | "in_esecuzione" | "valuta" | "conferma_salva" | "salvato";

const post = async (name: string, body: unknown) => {
  const r = await fetch(`/api/tools/${name}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return (await r.json().catch(() => ({ ok: false, frase: `errore ${r.status}` }))) as Record<string, unknown>;
};

export function MovementTest({ live, local, say }: { live: LiveData & { refresh: () => void }; local: MutableRefObject<LocalTools>; say: (t: string) => void }) {
  const [mov, setMov] = useState<Movement | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>("scegli");
  const [msg, setMsg] = useState("");
  const [ran, setRan] = useState<string[]>([]);
  const [corr, setCorr] = useState<{ direzione: MoveStep["direzione"]; quantita: number; unita: "cm" | "mm"; passo: number | "" }>({ direzione: "giu", quantita: 1, unita: "cm", passo: "" });
  const events = useRef(live.events);
  useEffect(() => { events.current = live.events; }, [live.events]);
  const speed = live.safety.velocita_mm_s;

  const waitEnd = async (id: string) => {
    const t0 = Date.now();
    while (Date.now() - t0 < 30_000) {
      const e = events.current.find((x) => x.type === "step_end" && x.command_id === id);
      if (e) return e;
      await new Promise((r) => setTimeout(r, 300));
    }
    return null;
  };

  const choose = (m: Movement) => { setMov(m); setHistory([]); setRan([]); setPhase("conferma_prova"); const f = readbackTest(m, speed); setMsg(f); return f; };

  const run = async (m: Movement) => {
    setPhase("in_esecuzione"); setRan([]);
    const ids: string[] = [];
    for (let i = 0; i < m.steps.length; i++) {
      setMsg(`Passo ${i + 1} di ${m.steps.length}: ${stepPhrase(m.steps[i])}…`);
      const r = await post("passo_test", { step: m.steps[i], test: `${m.name} v${m.version}`, passo: i + 1, totale: m.steps.length });
      if (!r.ok) { setMsg(String(r.frase)); setPhase("valuta"); say(String(r.frase)); return; }
      const e = await waitEnd(String(r.command_id));
      if (!e) { const f = "Il bridge non ha risposto in 30 secondi: interrompo la prova."; setMsg(f); setPhase("valuta"); say(f); return; }
      if (e.ok === false || e.payload?.ok === false) { const f = `Il passo ${i + 1} non è andato a buon fine: ${String(e.payload?.error ?? "vedi registro")}.`; setMsg(f); setPhase("valuta"); say(f); return; }
      ids.push(String(r.command_id));
      setRan([...ids]);
    }
    const f = "Fatto. Si è mosso correttamente? Dimmi «è giusto», oppure come dovrebbe muoversi.";
    setMsg(f); setPhase("valuta"); say(f);
  };

  const applyCorrection = (c: { direzione: MoveStep["direzione"]; quantita: number; unita: "cm" | "mm"; passo?: number | null }) => {
    if (!mov) return "Prima scegli un movimento da provare.";
    try {
      const next = correct(mov, c);
      setHistory((h) => [...h, `v${mov.version}→v${next.version}: ${next.note}`]);
      setMov(next); setPhase("conferma_prova");
      void post("segnala", { text: `correzione «${mov.name}» v${mov.version}: ${next.note}` });
      const f = readbackCorrection(next); setMsg(f); return f;
    } catch (e) { const f = `Non posso: ${(e as Error).message}.`; setMsg(f); return f; }
  };

  const save = async () => {
    if (!mov) return;
    const r = await post("proponi_script", { kind: "test", test: { id: mov.id, name: mov.name, version: mov.version, steps: mov.steps, history, command_ids: ran } });
    setMsg(String(r.frase)); setPhase("salvato");
    if (r.content) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([String(r.content)], { type: "text/x-python" }));
      a.download = String(r.path ?? "movimento.py").split("/").pop()!;
      a.click();
    }
    live.refresh();
    return String(r.frase);
  };

  // Strumenti locali per la voce: prova, correggi, giusto; e il sì/no quando la prova li aspetta.
  useEffect(() => {
    const t: LocalTools = {
      prova_movimento: async (a) => {
        const n = String(a.nome ?? "").toLowerCase();
        const m = PRESETS.find((p) => p.id === n || p.name.toLowerCase().includes(n)) ?? mov;
        if (!m) return { ok: false, frase: `Quale movimento? ${PRESETS.map((p) => p.name).join(", ")}.` };
        return { ok: true, frase: m === mov && phase !== "scegli" ? readbackTest(m, speed) : choose(m) };
      },
      correggi_movimento: async (a) => ({ ok: true, frase: applyCorrection({ direzione: a.direzione as MoveStep["direzione"], quantita: Number(a.quantita), unita: (a.unita as "cm" | "mm") ?? "cm", passo: (a.passo as number) ?? null }) }),
      movimento_corretto: async () => {
        if (!mov || ran.length !== mov.steps.length) return { ok: false, frase: "Prima va provato fino in fondo." };
        setPhase("conferma_salva"); const f = `Salvo «${mov.name}» versione ${mov.version} nello script? Apro una proposta da rivedere. Confermi?`; setMsg(f); return { ok: true, frase: f };
      },
      conferma: async () => {
        if (phase === "conferma_prova" && mov) { void run(mov); return { ok: true, frase: "Parto." }; }
        if (phase === "conferma_salva") { const f = await save(); return { ok: true, frase: f ?? "" }; }
        return { ok: false, frase: "" };
      },
      annulla: async () => { setPhase(mov ? "valuta" : "scegli"); setMsg("Annullato."); return { ok: true, frase: "Annullato." }; },
    };
    t.__intercept = (name) => ["prova_movimento", "correggi_movimento", "movimento_corretto"].includes(name) || ((name === "conferma" || name === "annulla") && (phase === "conferma_prova" || phase === "conferma_salva"));
    local.current = t;
  });

  return (
    <section className="rounded-xl border border-sky-400/30 bg-sky-400/[0.04] p-4">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-sky-200/80">Prova un movimento e correggilo a voce</h2>
        {mov && <span className="ml-auto font-mono text-xs text-white/60">«{mov.name}» v{mov.version}</span>}
      </div>
      <ol className="mb-3 flex flex-wrap gap-1.5 text-[11px] text-white/50">
        {["1 scegli", "2 sì", "3 si muove", "4 si è mosso bene?", "5 correggi e riprova", "6 è giusto → script"].map((t, i) => {
          const on = (phase === "scegli" && i === 0) || (phase === "conferma_prova" && i === 1) || (phase === "in_esecuzione" && i === 2) || (phase === "valuta" && (i === 3 || i === 4)) || ((phase === "conferma_salva" || phase === "salvato") && i === 5);
          return <li key={t} className={`rounded-full px-2 py-0.5 ${on ? "bg-sky-500 text-black" : "bg-white/5"}`}>{t}</li>;
        })}
      </ol>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button key={p.id} onClick={() => choose(p)} disabled={phase === "in_esecuzione"}
            className={`rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-40 ${mov?.id === p.id ? "border-sky-400 bg-sky-400/10" : "border-white/10 hover:border-white/30"}`}>
            <span className="block font-semibold">{p.name}</span>
            <span className="block font-mono text-[10px] text-white/50">{p.steps.map((s) => `${s.direzione} ${s.quantita} ${s.unita}`).join(" · ")}</span>
          </button>
        ))}
      </div>

      {mov && (
        <div className="mt-3 rounded-lg bg-black/30 p-3">
          <ol className="space-y-0.5 font-mono text-sm">
            {mov.steps.map((s, i) => <li key={i} className={ran.length > i ? "text-emerald-300" : "text-white/80"}>{ran.length > i ? "✓" : `${i + 1}.`} {stepPhrase(s)}</li>)}
          </ol>
          {msg && <p className="mt-2 text-base">{msg}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {(phase === "conferma_prova" || phase === "conferma_salva") && (
              <>
                <button onClick={() => void local.current.conferma?.({})} className="rounded-lg bg-emerald-600 px-5 py-2 font-bold">Sì</button>
                <button onClick={() => void local.current.annulla?.({})} className="rounded-lg border border-white/20 px-5 py-2 font-bold">No</button>
              </>
            )}
            {phase === "valuta" && (
              <>
                <button disabled={ran.length !== mov.steps.length} onClick={() => void local.current.movimento_corretto?.({})} className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold disabled:opacity-30">È giusto</button>
                <button onClick={() => { setPhase("conferma_prova"); setMsg(readbackTest(mov, speed)); }} className="rounded-lg border border-white/20 px-4 py-2">Riprova</button>
              </>
            )}
          </div>
          {phase === "valuta" && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-white/60">Doveva andare</span>
              <select value={corr.direzione} onChange={(e) => setCorr({ ...corr, direzione: e.target.value as MoveStep["direzione"] })} className="rounded bg-white/10 px-2 py-1">
                {["su", "giu", "avanti", "indietro", "destra", "sinistra"].map((d) => <option key={d} value={d}>{d === "giu" ? "più giù" : `più ${d === "su" ? "su" : `a ${d}`}`.replace("a avanti", "avanti").replace("a indietro", "indietro")}</option>)}
              </select>
              <span className="text-white/60">di</span>
              <input type="number" min={1} max={100} value={corr.quantita} onChange={(e) => setCorr({ ...corr, quantita: Number(e.target.value) })} className="w-16 rounded bg-white/10 px-2 py-1" />
              <select value={corr.unita} onChange={(e) => setCorr({ ...corr, unita: e.target.value as "cm" | "mm" })} className="rounded bg-white/10 px-2 py-1"><option>cm</option><option>mm</option></select>
              <span className="text-white/60">al passo</span>
              <select value={corr.passo} onChange={(e) => setCorr({ ...corr, passo: e.target.value ? Number(e.target.value) : "" })} className="rounded bg-white/10 px-2 py-1">
                <option value="">automatico</option>{mov.steps.map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
              </select>
              <button onClick={() => applyCorrection({ ...corr, passo: corr.passo === "" ? null : corr.passo })} className="rounded bg-sky-600 px-3 py-1 font-semibold">Correggi</button>
            </div>
          )}
          {history.length > 0 && <p className="mt-2 font-mono text-[11px] text-white/40">{history.join(" · ")}</p>}
        </div>
      )}
      <p className="mt-3 text-[11px] text-white/40">A voce: «prova l&apos;avvicinamento alla stazione» · «sì» · «no, doveva scendere 2 centimetri in più» · «sì» · «è giusto» · «sì». Ogni passo passa dal validatore; la proposta di script la verifica il server sul registro.</p>
    </section>
  );
}
