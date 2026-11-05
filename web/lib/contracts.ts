// Schemi zod scritti a mano da bridge/contracts.py (contracts-v1). Stesso esito di pydantic su ogni
// fixture in shared/fixtures/{valid,invalid}: lo verifica lib/contracts.test.ts. Non modificare senza BRIDGE.
import { z } from "zod";

export const CONTRACTS_VERSION = "contracts-v1";

const isoDate = z.iso.datetime({ offset: true, local: true });
const nullish = <T extends z.ZodTypeAny>(s: T) => s.nullable().optional();
const vec3 = z.array(z.number()).length(3);

export const PlaceName = z.enum(["INGRESSO", "STAZIONE", "USCITA", "SCARTI", "HOME"]);
export const SkillName = z.enum(["solleva", "deposita", "porta", "applica", "home", "stop", "sposta", "piu_piano", "piu_veloce"]);
export const Direzione = z.enum(["su", "giu", "avanti", "indietro", "destra", "sinistra"]);
export const Unita = z.enum(["mm", "cm"]);
export const Intensita = z.enum(["poco", "un_po", "tanto"]);
export const SkillStatus = z.enum(["draft", "confirmed", "deprecated"]);

export const PlaceParams = z.strictObject({ place: PlaceName });
export const EmptyParams = z.strictObject({});

export const SpostaParams = z
  .strictObject({
    direzione: Direzione,
    quantita: nullish(z.number().gt(0).lte(1000)),
    unita: nullish(Unita),
    intensita: nullish(Intensita),
  })
  .superRefine((p, ctx) => {
    const q = p.quantita != null, u = p.unita != null, i = p.intensita != null;
    if (q && !u) ctx.addIssue({ code: "custom", message: "quantita senza unita" });
    if (u && !q) ctx.addIssue({ code: "custom", message: "unita senza quantita" });
    if (q && i) ctx.addIssue({ code: "custom", message: "quantita e intensita sono alternative" });
  });
export type SpostaParams = z.infer<typeof SpostaParams>;

export const SKILLS_WITH_PLACE = new Set(["solleva", "deposita", "porta"]);
export const SKILLS_NO_PARAMS = new Set(["applica", "home", "stop", "piu_piano", "piu_veloce"]);

export function paramsSchemaFor(skill: z.infer<typeof SkillName>) {
  if (SKILLS_WITH_PLACE.has(skill)) return PlaceParams;
  if (skill === "sposta") return SpostaParams;
  return EmptyParams;
}

export const Place = z.strictObject({ name: PlaceName, label: nullish(z.string()) });

export const Skill = z
  .strictObject({
    name: SkillName,
    kind: z.enum(["primitive", "composite", "motion", "session"]),
    params_schema: z.record(z.string(), z.unknown()).optional(),
    preconditions: z.array(z.string()).optional(),
    effects: z.array(z.string()).optional(),
    jbi: nullish(z.string()),
    status: SkillStatus.default("draft"),
    confirmed_by: nullish(z.string()),
    confirmed_at: nullish(isoDate),
    sim_ok: z.boolean().default(false),
    real_ok: z.boolean().default(false),
  })
  .superRefine((s, ctx) => {
    if (s.status === "confirmed") {
      if (!s.sim_ok) ctx.addIssue({ code: "custom", message: "una skill confirmed richiede sim_ok = true" });
      if (!s.confirmed_by || !s.confirmed_at)
        ctx.addIssue({ code: "custom", message: "una skill confirmed richiede confirmed_by e confirmed_at" });
    }
  });
export type Skill = z.infer<typeof Skill>;

export const Tool = z.strictObject({ nome: z.string().min(1), tcp_atteso_mm: vec3 });

export const Workspace = z
  .strictObject({ frame: z.int().gte(0).lte(7), min_mm: vec3, max_mm: vec3 })
  .refine((w) => w.min_mm.every((lo, i) => lo < w.max_mm[i]), { message: "min_mm deve essere < max_mm su ogni asse" });
export type Workspace = z.infer<typeof Workspace>;

export const OntologyVersion = z.strictObject({
  version: z.int().gte(1),
  places: z.array(Place),
  skills: z.array(Skill),
  tools: z.array(Tool).optional(),
  workspace: nullish(Workspace),
  status: z.enum(["draft", "confirmed"]).default("draft"),
  confirmed_by: nullish(z.string()),
  confirmed_at: nullish(isoDate),
});

export const Binding = z.strictObject({
  expression: z.string().min(1),
  means: z.record(z.string(), z.unknown()),
  alpha: z.number().gte(0).default(1),
  beta: z.number().gte(0).default(1),
  regime: z.enum(["WORKING", "CANONICAL"]).default("WORKING"),
  uses: z.int().gte(0).default(0),
  last_used: nullish(isoDate),
});

export const RoutineStep = z.strictObject({
  skill: z.union([SkillName, z.literal("attendi_operatore")]),
  place: nullish(PlaceName),
  prompt: nullish(z.string()),
  params: nullish(z.record(z.string(), z.unknown())),
});

export const Routine = z.strictObject({
  name: z.string().min(1),
  version: z.int().gte(1),
  parent_version: nullish(z.int()),
  edited_from_version: nullish(z.int()),
  steps: z.array(RoutineStep).min(1),
  taught_by_voice: z.boolean().default(false),
  source_utterance: nullish(z.string()),
  status: z.enum(["draft", "active", "deprecated"]).default("draft"),
});
export type Routine = z.infer<typeof Routine>;

export const CommandStatus = z.enum(["queued", "confirmed", "running", "done", "failed", "cancelled"]);

export const Command = z
  .strictObject({
    id: z.string(),
    skill: SkillName,
    params: z.record(z.string(), z.unknown()).default({}),
    routine_run_id: nullish(z.string()),
    step: nullish(z.int()),
    status: CommandStatus.default("queued"),
    created_at: nullish(isoDate),
    confirmed_at: nullish(isoDate),
    readback: nullish(z.string()),
  })
  .superRefine((c, ctx) => {
    const r = paramsSchemaFor(c.skill).safeParse(c.params);
    if (!r.success) ctx.addIssue({ code: "custom", message: `params non validi per ${c.skill}: ${r.error.issues[0]?.message}` });
    if (["confirmed", "running", "done"].includes(c.status) && c.confirmed_at == null)
      ctx.addIssue({ code: "custom", message: "un command confermato richiede confirmed_at" });
  });
export type Command = z.infer<typeof Command>;

export const VELOCITA_DEFAULT_MM_S = 50;
export const VELOCITA_MIN_MM_S = 10;
export const VELOCITA_MAX_MM_S = 100;

export const SessionState = z.strictObject({
  velocita_mm_s: z.number().gte(VELOCITA_MIN_MM_S).lte(VELOCITA_MAX_MM_S).default(VELOCITA_DEFAULT_MM_S),
  tool: nullish(z.string()),
});

export const EventType = z.enum([
  "utterance", "interpretation", "confirmation", "correction", "step_start", "step_end",
  "feedback", "stop", "anomaly", "proposal", "approval", "safety_trigger", "motion_check", "speed_change",
]);
export type EventType = z.infer<typeof EventType>;

export const SafetyTriggerPayload = z.strictObject({
  trigger: z.enum(["parola", "botta", "urlo", "sfregamento", "heartbeat"]),
  latency_ms: z.number().gte(0),
  features: z.record(z.string(), z.unknown()).optional(),
});

export const MotionCheckPayload = z.strictObject({
  command_id: z.string(),
  delta_mm: vec3,
  pose_mm: nullish(vec3),
  target_mm: nullish(vec3),
  geofence_ok: z.boolean(),
  fuori_di_mm: nullish(z.number()),
  kinematics_ok: nullish(z.boolean()),
  kinematics_reason: nullish(z.string()),
  velocita_mm_s: z.number(),
  ok: z.boolean(),
  reason: nullish(z.string()),
});

export const SpeedChangePayload = z.strictObject({ da_mm_s: z.number(), a_mm_s: z.number() });

export const Event = z
  .strictObject({
    id: nullish(z.string()),
    ts: nullish(isoDate),
    type: EventType,
    routine_run_id: nullish(z.string()),
    command_id: nullish(z.string()),
    step: nullish(z.int()),
    payload: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((e, ctx) => {
    const s =
      e.type === "safety_trigger" ? SafetyTriggerPayload
      : e.type === "motion_check" ? MotionCheckPayload
      : e.type === "speed_change" ? SpeedChangePayload
      : null;
    if (s) {
      const r = s.safeParse(e.payload);
      if (!r.success) ctx.addIssue({ code: "custom", message: `payload ${e.type}: ${r.error.issues[0]?.message}` });
    }
  });
export type Event = z.infer<typeof Event>;

export const Observation = z.strictObject({
  id: nullish(z.string()),
  kind: z.enum(["anomaly", "pattern"]),
  rule: z.enum(["slow_step", "repeated_failure", "repeated_correction", "repeated_sequence", "redundant_step", "safety_pattern"]),
  evidence: z.array(z.string()).min(1),
  summary: z.string(),
});

export const ProposalChange = z.strictObject({
  routine: z.string(), from_version: z.int(), to_version: z.int(), diff: z.string(),
});

export const Proposal = z.strictObject({
  id: nullish(z.string()),
  observation_id: z.string(),
  change: ProposalChange,
  status: z.enum(["pending", "approved", "rejected", "reverted"]).default("pending"),
  metric: z.string().default("cycle_time_ms"),
  before: nullish(z.number()),
  after: nullish(z.number()),
});

export const BridgeStatus = z.strictObject({
  bridge_id: z.string(),
  mode: z.enum(["sim", "elite"]),
  ontology_version: nullish(z.int()),
  adapter: z.string(),
  last_command_id: nullish(z.string()),
  velocita_mm_s: z.number().default(VELOCITA_DEFAULT_MM_S),
  guard_alive: z.boolean().default(false),
  ts: nullish(isoDate),
});

export const MODELS = {
  Place, Skill, OntologyVersion, Binding, Routine, Command, Event, Observation, Proposal,
  SpostaParams, SessionState, Tool, Workspace, SafetyTriggerPayload, MotionCheckPayload, BridgeStatus,
} as const;
export type ModelName = keyof typeof MODELS;
