"use client";
import { useMemo, useState } from "react";
import { Dot, Panel } from "@/components/Panel";
import { SafetyPanel } from "@/components/SafetyPanel";
import { StopButton } from "@/components/StopButton";
import { WorkspaceBox } from "@/components/WorkspaceBox";
import {
  mockEvents, mockPending, mockProposal, mockResoconto, mockRoutines, mockSafety, mockSkills, mockTcp, mockWorkspace,
  type SkillRow,
} from "@/lib/mock";

const STATUS_STYLE: Record<SkillRow["status"], string> = {
  draft: "bg-amber-400/15 text-amber-300",
  confirmed: "bg-emerald-400/15 text-emerald-300",
  deprecated: "bg-white/10 text-white/40 line-through",
};

export function Console() {
  const s = mockSafety;
  const [filter, setFilter] = useState("tutti");
  const types = useMemo(() => ["tutti", ...Array.from(new Set(mockEvents.map((e) => e.type)))], []);
  const events = filter === "tutti" ? mockEvents : mockEvents.filter((e) => e.type === filter);
  const bridgeOk = s.bridge_heartbeat_ms_ago < 5000;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-4 border-b border-white/10 bg-[#0b0d10]/95 px-4 py-3 backdrop-blur">
        <h1 className="text-xl font-bold">Gergo <span className="text-sm font-normal text-white/50">postazione etichettatura</span></h1>
        <span className="flex items-center gap-2 text-sm"><Dot ok={bridgeOk} /> bridge</span>
        <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-xs">mode {s.mode}</span>
        <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-xs">ontologia v{s.ontology_version}</span>
        <span className="rounded bg-sky-400/15 px-2 py-0.5 font-mono text-xs text-sky-300">{s.velocita_mm_s} mm/s</span>
        <span className="rounded bg-amber-400/20 px-2 py-0.5 text-xs text-amber-200">dati finti</span>
        <div className="ml-auto"><StopButton /></div>
      </header>

      <main className="grid gap-4 p-4 lg:grid-cols-3">
        <div className="space-y-4">
          <SafetyPanel s={s} />
          <Panel title="Area di lavoro">
            <WorkspaceBox ws={mockWorkspace} tcp={mockTcp} />
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Comando in attesa" className="border-amber-400/40">
            <p className="text-lg">{mockPending.frase}</p>
            <div className="mt-3 flex gap-2">
              <button className="rounded bg-emerald-600 px-4 py-2 font-semibold hover:bg-emerald-500">Conferma</button>
              <button className="rounded border border-white/20 px-4 py-2 hover:bg-white/5">Annulla</button>
            </div>
          </Panel>
          <Panel title="Skill della postazione">
            <ul className="divide-y divide-white/5">
              {mockSkills.map((k) => (
                <li key={k.name} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="font-semibold">{k.name}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] ${STATUS_STYLE[k.status]}`}>{k.status}</span>
                  <span className="font-mono text-[11px] text-white/40">{k.jbi ?? "MoveL"}</span>
                  <span className="text-[11px] text-white/50">sim {k.sim_ok ? "✓" : "–"} · real {k.real_ok ? "✓" : "–"}</span>
                  <span className="ml-auto flex gap-1">
                    <button disabled={!k.sim_ok || k.status !== "draft"} className="rounded px-2 py-0.5 text-xs text-emerald-300 hover:bg-emerald-400/10 disabled:opacity-30">Conferma</button>
                    <button disabled={k.status === "deprecated"} className="rounded px-2 py-0.5 text-xs text-red-300 hover:bg-red-400/10 disabled:opacity-30">Depreca</button>
                  </span>
                  {k.preconditions.length > 0 && <span className="w-full text-[11px] text-white/40">pre: {k.preconditions.join(" · ")}</span>}
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Routine">
            <ul className="space-y-2 text-sm">
              {mockRoutines.map((r) => (
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
            <p className="text-sm">{mockProposal.summary}</p>
            <p className="mt-1 font-mono text-xs text-white/50">{mockProposal.rule} · prima {(mockProposal.before / 1000).toFixed(1)} s · dopo {mockProposal.after ?? "—"}</p>
            <div className="mt-2 flex gap-2">
              <button className="rounded bg-emerald-700 px-3 py-1 text-sm">Approva</button>
              <button className="rounded border border-white/20 px-3 py-1 text-sm">Rifiuta</button>
            </div>
          </Panel>
          <Panel title="Resoconto (da v_shift_summary)">
            <div className="grid grid-cols-3 gap-2 text-center">
              {Object.entries(mockResoconto).map(([k, v]) => (
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
