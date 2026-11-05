import "server-only";
import { z } from "zod";
import { Command, SkillName, SpostaParams, VELOCITA_DEFAULT_MM_S } from "../contracts";
import * as motion from "../motion";
import { type Context, StationState, validate, type Vec3 } from "../validator";
import { BRIDGE_ID, db, must } from "./db";

// Orchestratore delle function call di Grok. Nessuna route muove il braccio: crea righe che il bridge legge,
// le rivalida e poi esegue. Ogni route restituisce la frase da dire, scritta dal codice.

export interface ToolResult { ok: boolean; frase: string; [k: string]: unknown }

async function event(type: string, payload: Record<string, unknown>, command_id?: string | null) {
  await must(db().from("events").insert({ type, payload, command_id: command_id ?? null }));
}

export async function loadContext(phase: "propose" | "execute"): Promise<Context & { ontology_version: number | null }> {
  const s = db();
  const ont = await must(s.from("ontology_versions").select("version,status").order("version", { ascending: false }).limit(1));
  const version = ont[0]?.version ?? null;
  const [skills, places, ws, tool, bridge, guard] = await Promise.all([
    must(s.from("skills").select("name,status,sim_ok,real_ok").eq("ontology_version", version ?? -1)),
    must(s.from("places").select("name").eq("ontology_version", version ?? -1)),
    must(s.from("workspace").select("frame,min_mm,max_mm").eq("attivo", true).limit(1)),
    must(s.from("tools").select("nome,tcp_atteso_mm").eq("attivo", true).limit(1)),
    must(s.from("bridge_status").select("*").eq("bridge_id", BRIDGE_ID()).limit(1)),
    must(s.from("guard_status").select("alive,last_heartbeat_at").eq("bridge_id", BRIDGE_ID()).limit(1)),
  ]);
  const b = bridge[0] as { velocita_mm_s?: number; station?: { fork_loaded?: boolean; at?: string }; pose_mm?: number[]; mode?: "sim" | "elite" } | undefined;
  const g = guard[0] as { alive?: boolean; last_heartbeat_at?: string } | undefined;
  const guardFresh = !!g?.alive && !!g.last_heartbeat_at && Date.now() - new Date(g.last_heartbeat_at).getTime() < 1000;
  return {
    phase,
    mode: b?.mode ?? "sim",
    ontology_version: version,
    ontology_status: ont[0]?.status ?? "draft",
    skills: Object.fromEntries(skills.map((k: { name: string; status: string }) => [k.name, k])),
    places: new Set(places.map((p: { name: string }) => p.name)),
    station: new StationState(!!b?.station?.fork_loaded, b?.station?.at ?? "HOME"),
    speed_mm_s: b?.velocita_mm_s ?? VELOCITA_DEFAULT_MM_S,
    workspace: ws[0] ?? null,
    pose: (b?.pose_mm?.length === 3 ? b.pose_mm : null) as Vec3 | null,
    tool_expected_tcp_mm: (tool[0]?.tcp_atteso_mm ?? null) as Vec3 | null,
    tool_actual_tcp_mm: null, // lo legge il bridge dal controller e rifiuta se non coincide
    guard_alive: guardFresh,
  };
}

const PLACE_TEXT: Record<string, string> = { INGRESSO: "all'ingresso", STAZIONE: "in stazione", USCITA: "in uscita", SCARTI: "negli scarti", HOME: "a casa" };

function readbackPrimitive(skill: string, params: Record<string, unknown>): string {
  const p = params.place ? ` ${PLACE_TEXT[String(params.place)] ?? String(params.place)}` : "";
  const v: Record<string, string> = {
    solleva: `Sollevo il vassoio${p}`, deposita: `Deposito il vassoio${p}`, porta: `Porto il vassoio${p}`,
    applica: "Applico l'etichetta in stazione", home: "Torno a casa",
  };
  return `${v[skill] ?? skill}. Confermi?`;
}

/** Crea un command "queued" dopo il validatore (fase propose). Torna la rilettura da far dire a Grok. */
export async function proponi(skill: z.infer<typeof SkillName>, params: Record<string, unknown>, utterance?: string): Promise<ToolResult> {
  if (skill === "stop") return stop("voce");
  const ctx = await loadContext("propose");
  const draft = { id: "proposta", skill, params, status: "queued" as const };
  const parsed = Command.safeParse(draft);
  if (!parsed.success) return { ok: false, frase: "Non ho capito il comando. Me lo ripeti?", errore: parsed.error.issues[0]?.message };

  let readback: string;
  if (skill === "piu_piano" || skill === "piu_veloce") {
    const speed = ctx.speed_mm_s ?? VELOCITA_DEFAULT_MM_S;
    const dopo = motion.nextSpeed(speed, skill);
    if (dopo === speed) return { ok: false, frase: motion.speedReadback(speed, dopo) };
    readback = motion.speedReadback(speed, dopo);
  } else {
    const d = validate(draft, ctx);
    if (!d.ok) {
      await event("anomaly", { origine: "web", code: d.code, reason: d.reason, skill, params });
      if (d.motion_check) await event("motion_check", { ...d.motion_check, command_id: d.motion_check.command_id });
      return { ok: false, frase: `Non lo faccio: ${d.reason}.`, code: d.code };
    }
    readback = skill === "sposta" ? d.readback! : readbackPrimitive(skill, params);
  }

  const s = db();
  // Un solo comando in attesa: i precedenti non confermati si annullano.
  await must(s.from("commands").update({ status: "cancelled" }).eq("status", "queued"));
  const [row] = await must(s.from("commands").insert({ skill, params, status: "queued", readback }).select("id"));
  if (utterance) await event("utterance", { text: utterance }, row.id);
  await event("interpretation", { skill, params, readback }, row.id);
  return { ok: true, frase: readback, command_id: row.id };
}

export async function conferma(command_id?: string): Promise<ToolResult> {
  const s = db();
  const q = s.from("commands").select("*").eq("status", "queued").order("created_at", { ascending: false }).limit(1);
  const rows = await must(command_id ? s.from("commands").select("*").eq("id", command_id).eq("status", "queued").limit(1) : q);
  const c = rows[0];
  if (!c) return { ok: false, frase: "Non c'è nessun comando da confermare." };
  if (Date.now() - new Date(c.created_at).getTime() > 60_000) {
    await must(s.from("commands").update({ status: "cancelled" }).eq("id", c.id));
    return { ok: false, frase: "Il comando era troppo vecchio e l'ho annullato. Ripetimelo." };
  }
  const confirmed_at = new Date().toISOString();
  const ctx = await loadContext("execute");
  const d = validate({ id: c.id, skill: c.skill, params: c.params, status: "confirmed", confirmed_at }, ctx);
  if (!d.ok && c.skill !== "piu_piano" && c.skill !== "piu_veloce") {
    await must(s.from("commands").update({ status: "cancelled" }).eq("id", c.id));
    await event("anomaly", { origine: "web", code: d.code, reason: d.reason }, c.id);
    return { ok: false, frase: `Non lo faccio: ${d.reason}.`, code: d.code };
  }
  await must(s.from("commands").update({ status: "confirmed", confirmed_at }).eq("id", c.id).eq("status", "queued"));
  await event("confirmation", { text: "sì", skill: c.skill }, c.id);
  return { ok: true, frase: "Vado.", command_id: c.id };
}

export async function annulla(): Promise<ToolResult> {
  await must(db().from("commands").update({ status: "cancelled" }).eq("status", "queued"));
  return { ok: true, frase: "Annullato." };
}

export async function stop(source: string): Promise<ToolResult> {
  const s = db();
  const now = new Date().toISOString();
  await must(s.from("commands").update({ status: "cancelled" }).in("status", ["queued", "confirmed"]).neq("skill", "stop"));
  const [row] = await must(s.from("commands").insert({ skill: "stop", params: {}, status: "confirmed", confirmed_at: now, readback: "Mi fermo." }).select("id"));
  await event("stop", { source }, row.id);
  return { ok: true, frase: "Mi fermo.", command_id: row.id };
}

/** "salva angolo": il primo angolo si tiene nel cookie, al secondo si scrive il workspace attivo. */
export async function salvaAngolo(primo: Vec3 | null): Promise<ToolResult & { angolo?: Vec3; fatto?: boolean }> {
  const ctx = await loadContext("propose");
  if (!ctx.pose) return { ok: false, frase: "Non leggo la posizione del braccio: il bridge è acceso?" };
  const qui = ctx.pose;
  if (!primo) return { ok: true, frase: "Primo angolo salvato. Porta il braccio nell'angolo opposto e salva di nuovo.", angolo: qui };
  const min_mm = qui.map((v, i) => Math.min(v, primo[i]));
  const max_mm = qui.map((v, i) => Math.max(v, primo[i]));
  if (min_mm.some((v, i) => max_mm[i] - v < 20)) {
    return { ok: false, frase: "I due angoli sono troppo vicini su un asse: servono almeno 2 centimetri." };
  }
  const s = db();
  const frame = ctx.workspace?.frame ?? 0;
  await must(s.from("workspace").update({ attivo: false }).eq("attivo", true));
  await must(s.from("workspace").insert({ frame, min_mm, max_mm, source: "taught", attivo: true, created_by: "console" }));
  return { ok: true, fatto: true, frase: "Area di lavoro salvata.", min_mm, max_mm };
}

export const SpostaInput = SpostaParams;
