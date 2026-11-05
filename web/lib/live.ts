"use client";
// Dati della console: Supabase (anon, solo SELECT per RLS) con Realtime e polling di riserva a 1 s.
// Senza NEXT_PUBLIC_SUPABASE_* la console mostra i dati finti di lib/mock.ts, marcati come tali.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import * as mock from "./mock";

export interface LiveData {
  source: "db" | "finti";
  realtime: boolean;
  safety: mock.SafetyState;
  workspace: mock.Workspace | null;
  tcp: [number, number, number] | null;
  skills: mock.SkillRow[];
  routines: { name: string; version: number; status: string; source_utterance: string | null; diff: string }[];
  pending: { id?: string; skill: string; frase: string } | null;
  awaiting: string | null;
  events: mock.EventRow[];
  proposal: { id?: string; summary: string; rule: string; before: number | null; after: number | null } | null;
  resoconto: Record<string, number>;
  error?: string;
  hb?: { guard: string | null; bridge: string | null };
}

const MOCK: LiveData = {
  source: "finti", realtime: false, awaiting: null, safety: mock.mockSafety, workspace: mock.mockWorkspace, tcp: mock.mockTcp,
  skills: mock.mockSkills, routines: mock.mockRoutines, pending: mock.mockPending, events: mock.mockEvents,
  proposal: mock.mockProposal, resoconto: mock.mockResoconto,
};

const BRIDGE_ID = process.env.NEXT_PUBLIC_BRIDGE_ID || "pavia-postazione-1";
let sb: SupabaseClient | null = null;
function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return (sb ??= createClient(url, key, { auth: { persistSession: false } }));
}

const ago = (ts?: string | null) => (ts ? Date.now() - new Date(ts).getTime() : Infinity);

function eventText(type: string, p: Record<string, unknown>): string {
  if (typeof p.text === "string") return p.text;
  if (type === "motion_check") return p.ok ? `ok · Δ ${JSON.stringify(p.delta_mm)}` : String(p.reason ?? "rifiutato");
  if (type === "safety_trigger") return `${p.trigger} · ${p.latency_ms} ms`;
  if (type === "speed_change") return `${p.da_mm_s} → ${p.a_mm_s} mm/s`;
  if (type === "interpretation") return String(p.readback ?? `${p.skill} ${JSON.stringify(p.params ?? {})}`);
  if (type === "anomaly") return String(p.reason ?? p.code ?? "anomalia");
  if (type === "step_end" && p.cycle === true) return `ciclo «${p.routine}» v${p.version} · ${(Number(p.cycle_time_ms) / 1000).toFixed(1)} s`;
  if (type === "step_start" || type === "step_end") return String(p.skill ?? p.text ?? "");
  return Object.keys(p).length ? JSON.stringify(p).slice(0, 120) : "";
}

async function load(s: SupabaseClient): Promise<LiveData> {
  const q = async <T,>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>) => {
    const { data, error } = await p;
    if (error) throw new Error(error.message);
    return (data ?? []) as T;
  };
  const ont = await q<{ version: number; status: string }[]>(s.from("ontology_versions").select("version,status").order("version", { ascending: false }).limit(1));
  const v = ont[0]?.version ?? -1;
  const [bridge, guard, skills, ws, routines, cmds, evs, props, summary] = await Promise.all([
    q<Record<string, unknown>[]>(s.from("bridge_status").select("*").eq("bridge_id", BRIDGE_ID).limit(1)),
    q<Record<string, unknown>[]>(s.from("guard_status").select("*").eq("bridge_id", BRIDGE_ID).limit(1)),
    q<mock.SkillRow[]>(s.from("skills").select("name,kind,preconditions,jbi,status,sim_ok,real_ok").eq("ontology_version", v).order("name")),
    q<mock.Workspace[]>(s.from("workspace").select("frame,min_mm,max_mm").eq("attivo", true).limit(1)),
    q<Record<string, unknown>[]>(s.from("routines").select("name,version,status,source_utterance,parent_version").order("name").order("version", { ascending: false }).limit(10)).catch(() => []),
    q<Record<string, unknown>[]>(s.from("commands").select("id,skill,readback,status").eq("status", "queued").order("created_at", { ascending: false }).limit(1)),
    q<Record<string, unknown>[]>(s.from("events").select("id,ts,type,payload,step").order("ts", { ascending: false }).limit(60)),
    q<Record<string, unknown>[]>(s.from("proposals").select("id,status,change,before,after,observation_id,observations(summary,rule)").eq("status", "pending").order("created_at", { ascending: false }).limit(1)).catch(() => []),
    q<Record<string, unknown>[]>(s.from("v_shift_summary").select("*").limit(1)).catch(() => []),
  ]);
  const b = bridge[0] ?? {}, g = guard[0] ?? {};
  const lt = g.last_trigger as { trigger?: string; latency_ms?: number; ts?: string } | null;
  const sm = summary[0] ?? {};
  const pick = (k: string) => Number(sm[k] ?? 0);
  return {
    source: "db",
    realtime: false,
    safety: {
      guard_alive: !!g.alive,
      guard_heartbeat_ms_ago: ago(g.last_heartbeat_at as string),
      last_trigger: lt?.trigger ? { trigger: lt.trigger as never, latency_ms: Number(lt.latency_ms ?? 0), ts: String(lt.ts ?? new Date().toISOString()) } : null,
      bridge_heartbeat_ms_ago: ago(b.last_heartbeat_at as string),
      mode: (b.mode as "sim" | "elite") ?? "sim",
      ontology_version: ont[0]?.version ?? 0,
      velocita_mm_s: Number(b.velocita_mm_s ?? 50),
    },
    hb: { guard: (g.last_heartbeat_at as string) ?? null, bridge: (b.last_heartbeat_at as string) ?? null },
    workspace: ws[0] ?? null,
    tcp: Array.isArray(b.pose_mm) && b.pose_mm.length >= 3 ? (b.pose_mm.slice(0, 3) as [number, number, number]) : null,
    skills,
    routines: routines.map((r) => ({ name: String(r.name), version: Number(r.version), status: String(r.status), source_utterance: (r.source_utterance as string) ?? null, diff: "" })),
    pending: cmds[0] ? { id: String(cmds[0].id), skill: String(cmds[0].skill), frase: String(cmds[0].readback ?? cmds[0].skill) } : null,
    awaiting: (() => {
      // l'ultimo feedback {awaiting} non ancora seguito da un {done}
      for (const e of evs) {
        const p = (e.payload ?? {}) as Record<string, unknown>;
        if (e.type === "feedback" && (p.done === true || p.text === "fatto")) return null;
        if (e.type === "feedback" && p.awaiting === true) return String(p.prompt ?? "dimmi fatto");
        if (e.type === "stop") return null;
      }
      return null;
    })(),
    events: evs.map((e) => {
      const p = (e.payload ?? {}) as Record<string, unknown>;
      return { id: String(e.id), ts: String(e.ts), type: String(e.type), text: eventText(String(e.type), p), duration_ms: p.duration_ms as number | undefined, ok: p.ok as boolean | undefined, step: e.step as number | undefined, cycle: p.cycle === true };
    }),
    proposal: props[0] ? { id: String(props[0].id), summary: String((props[0].observations as { summary?: string } | null)?.summary ?? (props[0].change as { diff?: string })?.diff ?? ""), rule: String((props[0].observations as { rule?: string } | null)?.rule ?? ""), before: (props[0].before as number) ?? null, after: (props[0].after as number) ?? null } : null,
    resoconto: summary[0]
      ? { cicli: pick("cycles_done"), tempo_medio_ms: pick("avg_cycle_time_ms"), correzioni: pick("corrections"), stop: pick("stops"), anomalie: pick("anomalies"), "senza conferma": pick("commands_unconfirmed_executed"), "fuori area": pick("motion_rejected_geofence") }
      : {},
  };
}

export function useLiveData(): LiveData & { refresh: () => void } {
  const [data, setData] = useState<LiveData>(MOCK);
  const [, tick] = useState(0);
  const rt = useRef(false);
  const reload = useRef<() => void>(() => {});

  useEffect(() => {
    const s = client();
    if (!s) return;
    let alive = true, busy = false;
    const go = async () => {
      if (busy) return; busy = true;
      try { const d = await load(s); if (alive) setData({ ...d, realtime: rt.current }); }
      catch (e) { if (alive) setData((x) => ({ ...x, error: (e as Error).message })); }
      finally { busy = false; }
    };
    reload.current = () => void go();
    void go();
    const ch = s.channel("console");
    for (const t of ["events", "commands", "bridge_status", "proposals", "guard_status"]) {
      ch.on("postgres_changes", { event: "*", schema: "public", table: t }, () => void go());
    }
    ch.subscribe((st) => { rt.current = st === "SUBSCRIBED"; });
    // Polling di riserva: 1 s senza realtime, 5 s con (gli heartbeat aggiornano bridge_status di continuo).
    const poll = setInterval(() => { if (!rt.current || Date.now() % 5000 < 1000) void go(); }, 1000);
    return () => { alive = false; clearInterval(poll); void s.removeChannel(ch); };
  }, []);

  // Le età degli heartbeat vanno ricalcolate anche senza nuovi dati.
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 500); return () => clearInterval(t); }, []);

  const safety = data.hb
    ? { ...data.safety, guard_heartbeat_ms_ago: ago(data.hb.guard), bridge_heartbeat_ms_ago: ago(data.hb.bridge) }
    : data.safety;
  return { ...data, safety, refresh: () => reload.current() };
}
