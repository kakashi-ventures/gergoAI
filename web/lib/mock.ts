// Dati finti per /console finché FONDAMENTA non mette online il DB e BRIDGE non tagga contracts-v1.
// Forme provvisorie, allineate a PLAN.md §3 e MOTION_SAFETY.md; si sostituiscono con lib/contracts.ts.

export type SkillStatus = "draft" | "confirmed" | "deprecated";

export interface SkillRow {
  name: string;
  kind: "primitive" | "composite" | "motion" | "session";
  preconditions: string[];
  jbi: string | null;
  status: SkillStatus;
  sim_ok: boolean;
  real_ok: boolean;
}

export interface EventRow {
  id: string;
  ts: string;
  type: string;
  text: string;
  duration_ms?: number;
  ok?: boolean;
  step?: number;
  cycle?: boolean;
  payload?: Record<string, unknown>;
  command_id?: string | null;
}

export interface SafetyState {
  guard_alive: boolean;
  guard_heartbeat_ms_ago: number;
  last_trigger: { trigger: "parola" | "botta" | "urlo" | "sfregamento" | "heartbeat"; latency_ms: number; ts: string } | null;
  bridge_heartbeat_ms_ago: number;
  mode: "sim" | "elite";
  ontology_version: number;
  velocita_mm_s: number;
}

export interface Workspace {
  frame: string;
  min_mm: [number, number, number];
  max_mm: [number, number, number];
}

const t = (minAgo: number) => new Date(Date.UTC(2026, 10, 5, 11, 40 - minAgo, 0)).toISOString();

export const mockSafety: SafetyState = {
  guard_alive: true,
  guard_heartbeat_ms_ago: 180,
  last_trigger: { trigger: "parola", latency_ms: 142, ts: t(6) },
  bridge_heartbeat_ms_ago: 1200,
  mode: "sim",
  ontology_version: 1,
  velocita_mm_s: 50,
};

export const mockWorkspace: Workspace = { frame: "tavolo", min_mm: [-300, 200, 30], max_mm: [300, 600, 400] };
export const mockTcp: [number, number, number] = [40, 420, 180];

export const mockSkills: SkillRow[] = [
  { name: "solleva", kind: "primitive", preconditions: ["forchetta libera"], jbi: "solleva_INGRESSO", status: "confirmed", sim_ok: true, real_ok: false },
  { name: "porta", kind: "primitive", preconditions: ["luogo esistente"], jbi: "porta_STAZIONE", status: "confirmed", sim_ok: true, real_ok: false },
  { name: "applica", kind: "primitive", preconditions: ["in STAZIONE"], jbi: "applica_STAZIONE", status: "draft", sim_ok: true, real_ok: false },
  { name: "deposita", kind: "primitive", preconditions: ["forchetta occupata"], jbi: "deposita_USCITA", status: "draft", sim_ok: false, real_ok: false },
  { name: "sposta", kind: "primitive", preconditions: ["TCP coincide col tool", "dentro la geofence"], jbi: null, status: "draft", sim_ok: true, real_ok: false },
  { name: "home", kind: "primitive", preconditions: [], jbi: "home", status: "deprecated", sim_ok: true, real_ok: false },
];

export const mockRoutines = [
  { name: "frontale", version: 2, parent_version: 1, status: "active", source_utterance: "Ti insegno la frontale: prendi dall'ingresso, portalo in stazione…", diff: "− home tra i cicli" },
  { name: "frontale", version: 1, parent_version: null, status: "retired", source_utterance: "Ti insegno la frontale…", diff: "" },
];

export const mockPending = {
  skill: "sposta",
  frase: "Scendo di 10 centimetri a 50 millimetri al secondo. Confermi?",
};

export const mockEvents: EventRow[] = [
  { id: "e9", ts: t(0), type: "interpretation", text: "sposta {giu, 10, cm}" },
  { id: "e8", ts: t(1), type: "utterance", text: "scendi di 10 centimetri" },
  { id: "e7", ts: t(2), type: "motion_check", text: "geofence ok · cinematica ok (max 0,4°/mm)", ok: true },
  { id: "e6", ts: t(3), type: "step_end", text: "deposita USCITA", duration_ms: 2140, ok: true, step: 5 },
  { id: "e5", ts: t(4), type: "step_end", text: "applica", duration_ms: 3890, ok: true, step: 4 },
  { id: "e4", ts: t(5), type: "feedback", text: "è storta" },
  { id: "e3", ts: t(6), type: "safety_trigger", text: "parola «fermo» · 142 ms", ok: true },
  { id: "e2", ts: t(7), type: "stop", text: "stop da audio_guard" },
  { id: "e1", ts: t(9), type: "confirmation", text: "sì" },
];

export const mockProposal = {
  summary: "Ho notato che tra un ciclo e l'altro torno sempre a casa: vuoi che lo tolga?",
  rule: "redundant_step",
  before: 14200,
  after: null as number | null,
};

export const mockResoconto = { cicli: 6, tempo_medio_ms: 13650, correzioni: 1, stop: 1, anomalie: 0 };
