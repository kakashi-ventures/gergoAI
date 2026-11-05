"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AlertCenter } from "@/components/AlertCenter";
import { CycleCompare } from "@/components/CycleCompare";
import { Movimenti } from "@/components/Movimenti";
import { MachineBar, Pendant } from "@/components/Pendant";
import { type LocalTools, MovementTest } from "@/components/MovementTest";
import { ScriptProposals } from "@/components/ScriptProposals";
import { Dot, Panel } from "@/components/Panel";
import { Registro } from "@/components/Registro";
import { RegistroOperazioni } from "@/components/RegistroOperazioni";
import { SafetyPanel } from "@/components/SafetyPanel";
import { StopButton } from "@/components/StopButton";
import { VoicePanel } from "@/components/VoicePanel";
import { WorkspaceBox } from "@/components/WorkspaceBox";
import type { Alert } from "@/lib/alerts";
import { useLiveData } from "@/lib/live";

async function tool(name: string, body: Record<string, unknown> = {}) {
  const r = await fetch(`/api/tools/${name}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as { frase?: string };
  return j.frase ?? `errore ${r.status}`;
}

const NAV = [
  { href: "/console", label: "Postazione" },
  { href: "/console/report", label: "Report" },
  { href: "/console/codice", label: "Registro del codice" },
  { href: "/console/protocollo", label: "Protocollo" },
  { href: "/console/protocollo", label: "Come parla col braccio" },
  { href: "/console/probe", label: "Prova voce" },
];

export function Console() {
  const live = useLiveData();
  const s = live.safety;
  const [msg, setMsg] = useState("");
  const [demo, setDemo] = useState(false);
  const [step, setStep] = useState(20);
  const localTools = useRef<LocalTools>({} as LocalTools);
  const say = (text: string) => setAnnounce({ id: Date.now(), text });
  useEffect(() => { setDemo(new URLSearchParams(window.location.search).has("demo")); }, []);

  const act = async (name: string, body: Record<string, unknown> = {}, domanda?: string) => {
    if (domanda && !window.confirm(domanda)) return;
    setMsg(await tool(name, body));
    live.refresh();
  };
  const ack = async (a: Alert) => { await tool("presa_visione", { alert_id: a.id, livello: a.level, titolo: a.titolo }); live.refresh(); };

  // Pattern miner dopo ogni ciclo concluso (event step_end con cycle: true); la proposta la dice Grok.
  const [announce, setAnnounce] = useState<{ id: number; text: string } | null>(null);
  const lastCycle = useRef<string | null>(null);
  const lastCycleId = live.source === "db" ? (live.events.find((e) => e.cycle)?.id ?? null) : null;
  useEffect(() => {
    if (!lastCycleId || lastCycleId === lastCycle.current) return;
    const first = lastCycle.current === null;
    lastCycle.current = lastCycleId;
    if (first) return;
    void fetch("/api/tools/mina", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
      .then((r) => r.json())
      .then((j: { nuove?: string[] }) => { if (j.nuove?.length) setAnnounce({ id: Date.now(), text: j.nuove[0] }); live.refresh(); })
      .catch(() => {});
  }, [lastCycleId, live]);

  const bridgeOk = s.bridge_heartbeat_ms_ago < 5000;
  const workspace = (
    <Panel title="Area di lavoro · vista dall'alto">
      {live.workspace && live.tcp ? (
        <WorkspaceBox ws={live.workspace} tcp={live.tcp} onSaveCorner={() => act("salva_angolo", {}, "Salvo la posizione attuale del TCP come angolo dell'area di lavoro?")} />
      ) : (
        <div className="space-y-2 text-sm text-white/60">
          <p>{live.workspace ? "Posizione del TCP non disponibile (bridge spento?)." : "Nessuna area di lavoro: porta il braccio in jog su due angoli opposti e salva."}</p>
          <button onClick={() => act("salva_angolo", {}, "Salvo la posizione attuale del TCP come angolo dell'area di lavoro?")} className="rounded border border-sky-400/40 px-3 py-1.5 text-sm text-sky-300">salva angolo</button>
        </div>
      )}
    </Panel>
  );

  return (
    <div className={`min-h-screen ${demo ? "text-[17px]" : ""}`}>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b0d10]/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <Link href="/" className="rounded-lg border border-white/15 px-2.5 py-1 text-sm text-white/70 hover:bg-white/5" title="Torna alla presentazione">← Indietro</Link>
          <Link href="/" className="text-xl font-black tracking-tight">Gergo</Link>
          <nav className="flex gap-1 text-sm">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className={`rounded-md px-2.5 py-1 ${n.href === "/console" ? "bg-white/10" : "text-white/60 hover:text-white"}`}>{n.label}</a>
            ))}
            <a href={demo ? "/console" : "/console?demo"} className="rounded-md px-2.5 py-1 text-white/60 hover:text-white">{demo ? "Vista completa" : "Modalità demo"}</a>
          </nav>
          <span className="flex items-center gap-2 text-sm"><Dot ok={bridgeOk} /> bridge</span>
          <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-xs">mode {s.mode}</span>
          <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-xs">ontologia v{s.ontology_version}</span>
          <span className="rounded bg-sky-400/15 px-2 py-0.5 font-mono text-xs text-sky-300">{s.velocita_mm_s} mm/s</span>
          {live.source === "finti" ? (
            <span className="rounded bg-amber-400/20 px-2 py-0.5 text-xs text-amber-200">dati finti</span>
          ) : (
            <span className="rounded bg-white/10 px-2 py-0.5 text-xs">{live.realtime ? "realtime" : "polling 1 s"}</span>
          )}
          {live.error && <span className="text-xs text-red-400" title={live.error}>errore DB</span>}
          <div className="ml-auto"><StopButton /></div>
        </div>
        {msg && <p className="border-t border-white/5 px-4 py-1.5 text-sm text-white/80">{msg}</p>}
      </header>

      <AlertCenter live={live} onAck={ack} />

      {demo ? (
        <main className="grid gap-5 p-5 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-5">
            <VoicePanel announce={announce} big pendingFrase={live.pending?.frase ?? null} />
            <SafetyPanel s={s} />
          </div>
          <div className="space-y-5">
            <CycleCompare cycles={live.cycles} big />
            <Registro events={live.events} compact />
          </div>
        </main>
      ) : (
        <main className="space-y-4 p-4">
          <MachineBar live={live} />
          <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr_1fr]">
            <VoicePanel announce={announce} big pendingFrase={live.pending?.frase ?? null} local={localTools} />
            <Pendant live={live} act={act} step={step} setStep={setStep} />
            <div className="space-y-4">
              <SafetyPanel s={s} />
              {workspace}
            </div>
          </div>
          <MovementTest live={live} local={localTools} say={say} />
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1.1fr]">
          <div className="space-y-4">
            {live.awaiting && (
              <Panel title="La routine aspetta te" className="border-emerald-400/40">
                <p className="text-lg">«{live.awaiting}»</p>
                <button onClick={() => act("fatto")} className="mt-3 rounded bg-emerald-600 px-4 py-2 font-semibold">Fatto</button>
              </Panel>
            )}
            <ScriptProposals live={live} refresh={live.refresh} />
            <Movimenti live={live} act={act} />
            <CycleCompare cycles={live.cycles} />
          </div>
          <div className="space-y-4">
            <RegistroOperazioni events={live.events} onReplay={(p) => act("sposta", { origine: "registro", direzione: p.direzione, quantita: p.quantita, unita: p.unita, intensita: p.intensita ?? null })} />
            <Registro events={live.events} />
            <Panel title="Resoconto del turno (da v_shift_summary)">
              <div className="grid grid-cols-3 gap-2 text-center">
                {Object.keys(live.resoconto).length === 0 && <p className="col-span-3 text-sm text-white/40">Nessun dato del turno.</p>}
                {Object.entries(live.resoconto).map(([k, v]) => (
                  <div key={k} className={`rounded p-2 ${k === "senza conferma" && v > 0 ? "bg-red-500/30" : "bg-white/5"}`}>
                    <div className="font-mono text-lg">{k === "tempo_medio_ms" ? `${(v / 1000).toFixed(1)} s` : v}</div>
                    <div className="text-[10px] uppercase text-white/40">{k.replace("_ms", "").replace("_", " ")}</div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
          </div>
        </main>
      )}
    </div>
  );
}
