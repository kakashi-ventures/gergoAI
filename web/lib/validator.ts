// Specchio TS di bridge/validator.py: stessi codici di rifiuto, stessi messaggi, stessi test (lib/validator.test.ts).
// La route web lo usa due volte: alla proposta (phase "propose": niente controllo di conferma e freschezza) e
// alla conferma (phase "execute", come il bridge). Il bridge rivalida comunque ogni command.
import { Command, SpostaParams, type Workspace } from "./contracts";
import * as motion from "./motion";

export const MAX_COMMAND_AGE_S = 30;
export const TCP_TOLERANCE_MM = 2;
const MOTION_SKILLS = new Set(["sposta"]);
const SESSION_SKILLS = new Set(["piu_piano", "piu_veloce"]);

export type Vec3 = [number, number, number];

export class StationState {
  constructor(public fork_loaded = false, public at = "HOME") {}
  apply(skill: string, params: Record<string, unknown>) {
    const place = params.place as string | undefined;
    if (skill === "solleva") { this.fork_loaded = true; this.at = place ?? this.at; }
    else if (skill === "deposita") { this.fork_loaded = false; this.at = place ?? this.at; }
    else if (skill === "porta") this.at = place ?? this.at;
    else if (skill === "home") this.at = "HOME";
  }
}

export interface Context {
  mode: "sim" | "elite";
  skills: Record<string, { status?: string; [k: string]: unknown }>;
  places: Set<string>;
  ontology_status?: string;
  station?: StationState;
  now?: Date;
  speed_mm_s?: number;
  workspace?: Workspace | null;
  pose?: Vec3 | null;
  tool_expected_tcp_mm?: Vec3 | null;
  tool_actual_tcp_mm?: Vec3 | null;
  guard_alive?: boolean;
  frame?: motion.Frame;
  phase?: "propose" | "execute";
}

export interface MotionCheck {
  command_id: string;
  delta_mm: number[];
  pose_mm?: number[];
  target_mm?: number[];
  geofence_ok: boolean;
  fuori_di_mm?: number;
  velocita_mm_s: number;
  ok: boolean;
  reason?: string;
}

export interface Decision {
  ok: boolean;
  code?: string;
  reason?: string;
  motion_check?: MotionCheck;
  target?: Vec3;
  readback?: string;
}

const reject = (code: string, reason: string, extra: Partial<Decision> = {}): Decision => ({ ok: false, code, reason, ...extra });

export function validate(raw: unknown, ctx: Context): Decision {
  const parsed = Command.safeParse(raw);
  if (!parsed.success) return reject("contract", `comando non valido: ${parsed.error.issues[0]?.message}`);
  const cmd = parsed.data;
  const skill = cmd.skill;
  const now = ctx.now ?? new Date();

  if ((ctx.phase ?? "execute") === "execute") {
    if (cmd.confirmed_at == null) return reject("not_confirmed", "il comando non è stato confermato");
    const age = (now.getTime() - new Date(cmd.confirmed_at).getTime()) / 1000;
    if (age > MAX_COMMAND_AGE_S)
      return reject("stale", `il comando è vecchio di ${Math.trunc(age)} secondi (massimo ${MAX_COMMAND_AGE_S})`);
  }

  if (skill === "stop") return { ok: true };

  const s = ctx.skills[skill];
  if (s == null) return reject("unknown_skill", `la skill ${skill} non è nell'ontologia`);
  const status = s.status;
  if (status === "deprecated") return reject("deprecated", `la skill ${skill} è deprecata`);
  if (ctx.mode === "elite") {
    if (status !== "confirmed") return reject("not_confirmed_skill", `in modalità elite la skill ${skill} deve essere confermata`);
    if ((ctx.ontology_status ?? "draft") !== "confirmed")
      return reject("ontology_draft", "in modalità elite l'ontologia attiva deve essere confermata");
  } else if (status !== "draft" && status !== "confirmed") {
    return reject("bad_status", `stato della skill ${skill} non valido: ${status}`);
  }

  if (SESSION_SKILLS.has(skill)) return { ok: true };
  if (MOTION_SKILLS.has(skill)) return validateSposta(cmd.id, SpostaParams.parse(cmd.params), ctx);

  const place = cmd.params.place as string | undefined;
  if (place != null && !ctx.places.has(place)) return reject("unknown_place", `il luogo ${place} non esiste`);
  const st = ctx.station ?? new StationState();
  if (skill === "solleva" && st.fork_loaded) return reject("precondition", "la forchetta è già occupata");
  if (skill === "deposita" && !st.fork_loaded) return reject("precondition", "la forchetta è vuota, non c'è niente da depositare");
  if (skill === "applica") {
    if (st.at !== "STAZIONE") return reject("precondition", "applica si fa solo in STAZIONE");
    if (!st.fork_loaded) return reject("precondition", "applica richiede un vassoio in STAZIONE");
  }
  return { ok: true };
}

function validateSposta(id: string, p: SpostaParams, ctx: Context): Decision {
  const { delta } = motion.deltaMm(p, ctx.frame);
  const speed = ctx.speed_mm_s ?? 50;
  const check: MotionCheck = { command_id: id, delta_mm: [...delta], geofence_ok: false, velocita_mm_s: speed, ok: false };
  const no = (code: string, reason: string) => { check.reason = reason; return reject(code, reason, { motion_check: check }); };

  if (!ctx.guard_alive) return no("guard_dead", "l'arresto acustico non è attivo: nessun movimento");
  if (!ctx.workspace) return no("no_workspace", 'manca l\'area di lavoro: insegnala con "salva angolo"');
  if (!ctx.pose) return no("no_pose", "non riesco a leggere la posizione del braccio");
  if (ctx.tool_expected_tcp_mm) {
    if (!ctx.tool_actual_tcp_mm) return no("tcp_unknown", "non riesco a leggere il TCP del controller");
    const err = Math.max(...ctx.tool_expected_tcp_mm.map((a, i) => Math.abs(a - ctx.tool_actual_tcp_mm![i])));
    if (err > TCP_TOLERANCE_MM) return no("tcp_mismatch", "il TCP del controller non coincide con il tool montato");
  }
  const target = ctx.pose.map((v, i) => v + delta[i]) as Vec3;
  check.pose_mm = [...ctx.pose];
  check.target_mm = [...target];
  const g = motion.geofence(target, ctx.workspace);
  check.geofence_ok = g.ok;
  if (!g.ok) {
    check.fuori_di_mm = g.fuori_di_mm;
    return no("geofence", motion.fuoriText(g.fuori_di_mm));
  }
  check.ok = true;
  return { ok: true, motion_check: check, target, readback: motion.readback(p, speed) };
}
