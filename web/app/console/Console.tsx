"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Dot, Panel } from "@/components/Panel";
import { SafetyPanel } from "@/components/SafetyPanel";
import { StopButton } from "@/components/StopButton";
import { VoicePanel } from "@/components/VoicePanel";
import { WorkspaceBox } from "@/components/WorkspaceBox";
import { useLiveData } from "@/lib/live";
import type { SkillRow } from "@/lib/mock";

async function tool(name: string, body: Record<string, unknown> = {}) {
  const r = await fetch(`/api/tools/${name}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as { frase?: string };
  return j.frase ?? `errore ${r.status}`;
}

const STATUS_STYLE: Record<SkillRow["status"], string> = {
  draft: "bg-amber-400/15 text-amber-300",
  confirmed: "bg-emerald-400/15 text-emerald-300",
  deprecated: "bg-white/10 text-white/40 line-through",
};

export function Console() {
  const live = useLiveData();
  const s = live.safety;
  const [filter, setFilter] = useState("tutti");
  const [msg, setMsg] = useState("");
  const types = useMemo(() => ["tutti", ...Array.from(new Set(live.events.map((e) => e.type)))], [live.events]);
  const events = filter === "tutti" ? live.events : live.events.filter((e) => e.type === filter);
  // Pattern miner dopo ogni ciclo concluso (event step_end con cycle: true).
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
  const act = async (name: string, body: Record<string, unknown> = {}, domanda?: string) => {
    if (domanda && !window.confirm(domanda)) return;
    setMsg(await tool(name, body));
    live.refresh();
  };
  const bridgeOk = s.bridge_heartbeat_ms_ago < 5000;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-4 border-b border-white/10 bg-[#0b0d10]/95 px-4 py-3 backdrop-blur">
        <h1 className="text-xl font-bold">Gergo <span className="text-sm font-normal text-white/50">postazione etichettatura</span></h1>
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
        {msg && <span className="text-sm text-white/80">{msg}</span>}
        <div className="ml-auto"><StopButton /></div>
      </header>

      <main className="grid gap-4 p-4 lg:grid-cols-3">
        <div className="space-y-4">
          <SafetyPanel s={s} />
          <Panel title="Area di lavoro">
            {live.workspace && live.tcp ? (
              <WorkspaceBox ws={live.workspace} tcp={live.tcp} onSaveCorner={() => act("salva_angolo", {}, "Salvo la posizione attuale del TCP come angolo dell'area di lavoro?")} />
            ) : (
              <div className="space-y-2 text-sm text-white/60">
                <p>{live.workspace ? "Posizione del TCP non disponibile (bridge spento?)." : "Nessuna area di lavoro: portala in jog su due angoli opposti e salva."}</p>
                <button onClick={() => act("salva_angolo", {}, "Salvo la posizione attuale del TCP come angolo dell'area di lavoro?")} className="rounded border border-sky-400/40 px-3 py-1.5 text-sm text-sky-300">salva angolo</button>
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <VoicePanel announce={announce} />
          <Panel title="Comando in attesa" className={live.pending ? "border-amber-400/40" : ""}>
            {live.pending ? (
              <>
                <p className="text-lg">{live.pending.frase}</p>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => act("conferma", live.pending?.id ? { command_id: live.pending.id } : {})} className="rounded bg-emerald-600 px-4 py-2 font-semibold hover:bg-emerald-500">Conferma</button>
                  <button onClick={() => act("annulla")} className="rounded border border-white/20 px-4 py-2 hover:bg-white/5">Annulla</button>
                </div>
              </>
            ) : (
              <p className="text-sm text-white/40">Nessun comando in attesa.</p>
            )}
          </Panel>
          <Panel title="Skill della postazione">
            <ul className="divide-y divide-white/5">
              {live.skills.map((k) => (
                <li key={k.name} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="font-semibold">{k.name}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] ${STATUS_STYLE[k.status]}`}>{k.status}</span>
                  <span className="font-mono text-[11px] text-white/40">{k.jbi ?? (k.name === "sposta" ? "MoveL" : "task —")}</span>
                  <span className="text-[11px] text-white/50">sim {k.sim_ok ? "✓" : "–"} · real {k.real_ok ? "✓" : "–"}</span>
                  <span className="ml-auto flex gap-1">
                    <button onClick={() => act("conferma_skill", { name: k.name }, `Confermi la skill ${k.name}? In modalità elite potrà muovere il braccio vero.`)} disabled={!k.sim_ok || k.status !== "draft"} className="rounded px-2 py-0.5 text-xs text-emerald-300 hover:bg-emerald-400/10 disabled:opacity-30">Conferma</button>
                    <button onClick={() => { const motivo = window.prompt(`Perché depreci ${k.name}?`); if (motivo && motivo.trim().length >= 3) void act("depreca_skill", { name: k.name, motivo: motivo.trim() }, `Depreco ${k.name}: «${motivo.trim()}»?`); }} disabled={k.status === "deprecated"} className="rounded px-2 py-0.5 text-xs text-red-300 hover:bg-red-400/10 disabled:opacity-30">Depreca</button>
                  </span>
                  {k.preconditions.length > 0 && <span className="w-full text-[11px] text-white/40">pre: {k.preconditions.join(" · ")}</span>}
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Routine">
            <ul className="space-y-2 text-sm">
              {live.routines.length === 0 && <li className="text-white/40">Nessuna routine insegnata.</li>}
              {live.routines.map((r) => (
                <li key={`${r.name}-${r.version}`}>
                  <span className="font-semibold">{r.name}</span> v{r.version}{" "}
                  <span className="text-xs text-white/50">{r.status}</span>
                  {r.diff && <span className="ml-2 font-mono text-xs text-amber-300">{r.diff}</span>}
                  <p className="text-xs italic text-white/40">«{r.source_utterance}»</p>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Proposta">
            {live.proposal ? (
              <>
                <p className="text-sm">{live.proposal.summary}</p>
                <p className="mt-1 font-mono text-xs text-white/50">{live.proposal.rule} · prima {live.proposal.before != null ? `${(live.proposal.before / 1000).toFixed(1)} s` : "—"} · dopo {live.proposal.after != null ? `${(live.proposal.after / 1000).toFixed(1)} s` : "—"}</p>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => act("approva_proposta", { approva: true }, "Approvi la nuova versione della routine?")} className="rounded bg-emerald-700 px-3 py-1 text-sm">Approva</button>
                  <button onClick={() => act("approva_proposta", { approva: false })} className="rounded border border-white/20 px-3 py-1 text-sm">Rifiuta</button>
                </div>
              </>
            ) : (
              <p className="text-sm text-white/40">Nessuna proposta in attesa.</p>
            )}
          </Panel>
          <Panel title="Resoconto (da v_shift_summary)">
            <div className="grid grid-cols-3 gap-2 text-center">
              {Object.keys(live.resoconto).length === 0 && <p className="col-span-3 text-sm text-white/40">Nessun dato del turno.</p>}
              {Object.entries(live.resoconto).map(([k, v]) => (
                <div key={k} className="rounded bg-white/5 p-2">
                  <div className="font-mono text-lg">{k === "tempo_medio_ms" ? `${(v / 1000).toFixed(1)} s` : v}</div>
                  <div className="text-[10px] uppercase text-white/40">{k.replace("_ms", "").replace("_", " ")}</div>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Registro del cobot">
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="mb-2 rounded bg-white/10 px-2 py-1 text-xs">
              {types.map((t) => <option key={t}>{t}</option>)}
            </select>
            <ol className="space-y-1 font-mono text-xs">
              {events.map((e) => (
                <li key={e.id} className="flex gap-2">
                  <span className="text-white/40">{new Date(e.ts).toLocaleTimeString("it-IT")}</span>
                  <span className={e.ok === false ? "text-red-400" : "text-sky-300"}>{e.type}</span>
                  <span className="text-white/80">{e.text}</span>
                  {e.duration_ms != null && <span className="ml-auto text-white/50">{e.duration_ms} ms</span>}
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </main>
    </div>
  );
}
