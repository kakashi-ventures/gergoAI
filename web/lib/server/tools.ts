import "server-only";
import { z } from "zod";
import { Command, Routine, SkillName, SpostaParams, VELOCITA_DEFAULT_MM_S } from "../contracts";
import { checkSteps, readbackRoutine } from "../routines";
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
  const [skills, places, ws, bridge, guard] = await Promise.all([
    must(s.from("skills").select("name,status,sim_ok,real_ok").eq("ontology_version", version ?? -1)),
    must(s.from("places").select("name").eq("ontology_version", version ?? -1)),
    must(s.from("workspace").select("frame,min_mm,max_mm").eq("attivo", true).limit(1)),
    must(s.from("bridge_status").select("*").eq("bridge_id", BRIDGE_ID()).limit(1)),
    must(s.from("guard_status").select("alive,last_heartbeat_at").eq("bridge_id", BRIDGE_ID()).limit(1)),
  ]);
  const b = bridge[0] as { velocita_mm_s?: number; station?: { fork_loaded?: boolean; at?: string }; pose_mm?: number[]; mode?: "sim" | "elite" } | undefined;
  const g = guard[0] as { alive?: boolean; last_heartbeat_at?: string } | undefined;
  const guardFresh = !!g?.alive && !!g.last_heartbeat_at && Date.now() - new Date(g.last_heartbeat_at).getTime() < 1000;
  // In sim la guardia la dà il SimArm del bridge (bridge_status.guard_alive), se il bridge è vivo. In elite conta solo audio_guard.
  const bb = bridge[0] as { guard_alive?: boolean; last_heartbeat_at?: string } | undefined;
  const simGuard = b?.mode === "sim" && !!bb?.guard_alive && !!bb.last_heartbeat_at && Date.now() - new Date(bb.last_heartbeat_at).getTime() < 5000;
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
    // Il TCP vero lo legge solo il bridge dal controller, e rifiuta se non coincide con il tool: qui non si controlla.
    tool_expected_tcp_mm: null,
    tool_actual_tcp_mm: null,
    guard_alive: guardFresh || simGuard,
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
export async function proponi(skill: z.infer<typeof SkillName>, params: Record<string, unknown>, utterance?: string, origine = "voce"): Promise<ToolResult> {
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
  await event("interpretation", { skill, params, readback, origine }, row.id);
  return { ok: true, frase: readback, command_id: row.id };
}

export async function conferma(command_id?: string): Promise<ToolResult> {
  const s = db();
  const rows = await must(command_id
    ? s.from("commands").select("*").eq("id", command_id).eq("status", "queued").limit(1)
    : s.from("commands").select("*").eq("status", "queued").order("created_at", { ascending: false }).limit(1));
  const runs = command_id ? [] : await must(s.from("routine_runs").select("*").eq("status", "queued").order("created_at", { ascending: false }).limit(1));
  const c = rows[0], run = runs[0];
  if (run && (!c || new Date(run.created_at) > new Date(c.created_at))) return confermaRun(run);
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

async function confermaRun(run: { id: string; created_at: string; routine_name: string }): Promise<ToolResult> {
  const s = db();
  if (Date.now() - new Date(run.created_at).getTime() > 60_000) {
    await must(s.from("routine_runs").update({ status: "cancelled" }).eq("id", run.id));
    return { ok: false, frase: "La richiesta era troppo vecchia e l'ho annullata. Ripetimela." };
  }
  const confirmed_at = new Date().toISOString();
  await must(s.from("routine_runs").update({ status: "confirmed", confirmed_at }).eq("id", run.id).eq("status", "queued"));
  await must(s.from("events").insert({ type: "confirmation", routine_run_id: run.id, payload: { text: "sì", routine: run.routine_name } }));
  return { ok: true, frase: "Parto.", routine_run_id: run.id };
}

export async function annulla(): Promise<ToolResult> {
  await must(db().from("commands").update({ status: "cancelled" }).eq("status", "queued"));
  await must(db().from("routine_runs").update({ status: "cancelled" }).eq("status", "queued"));
  return { ok: true, frase: "Annullato." };
}

export async function stop(source: string): Promise<ToolResult> {
  const s = db();
  const now = new Date().toISOString();
  await must(s.from("commands").update({ status: "cancelled" }).in("status", ["queued", "confirmed"]).neq("skill", "stop"));
  await must(s.from("routine_runs").update({ status: "cancelled", finished_at: now }).in("status", ["queued", "confirmed", "running"]));
  const [row] = await must(s.from("commands").insert({ skill: "stop", params: {}, status: "confirmed", confirmed_at: now, readback: "Braccio in pausa." }).select("id"));
  await event("stop", { source }, row.id);
  return { ok: true, frase: "Braccio in pausa.", command_id: row.id };
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

/** Conferma di una skill dalla console: solo se sim_ok (vincolo anche nel DB). Scrive un event "approval". */
export async function confermaSkill(name: string, by: string): Promise<ToolResult> {
  const s = db();
  const ont = await must(s.from("ontology_versions").select("version").order("version", { ascending: false }).limit(1));
  const v = ont[0]?.version;
  const [k] = await must(s.from("skills").select("name,status,sim_ok").eq("ontology_version", v ?? -1).eq("name", name).limit(1));
  if (!k) return { ok: false, frase: `La skill ${name} non c'è.` };
  if (!k.sim_ok) return { ok: false, frase: `Prima di confermare ${name} deve girare bene in simulazione.` };
  if (k.status !== "draft") return { ok: false, frase: `La skill ${name} è ${k.status}.` };
  await must(s.from("skills").update({ status: "confirmed", confirmed_by: by, confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("ontology_version", v).eq("name", name));
  await event("approval", { oggetto: "skill", name, by, ontology_version: v });
  return { ok: true, frase: `Skill ${name} confermata.` };
}

export async function deprecaSkill(name: string, motivo: string, by: string): Promise<ToolResult> {
  const s = db();
  const ont = await must(s.from("ontology_versions").select("version").order("version", { ascending: false }).limit(1));
  const v = ont[0]?.version;
  const rows = await must(s.from("skills").update({ status: "deprecated", deprecated_reason: motivo, updated_at: new Date().toISOString() }).eq("ontology_version", v ?? -1).eq("name", name).neq("status", "deprecated").select("name"));
  if (!rows.length) return { ok: false, frase: `La skill ${name} non c'è o è già deprecata.` };
  await event("approval", { oggetto: "skill", azione: "depreca", name, motivo, by, ontology_version: v });
  return { ok: true, frase: `Skill ${name} deprecata.` };
}

// ---------------------------------------------------------------- routine, feedback, resoconto, proposte

type Steps = Routine["steps"];

export async function definisciRoutine(name: string, steps: Steps, utterance?: string): Promise<ToolResult> {
  const r = Routine.safeParse({ name, version: 1, steps });
  if (!r.success) return { ok: false, frase: "Non ho capito i passi. Me li ripeti uno per uno?", errore: r.error.issues[0]?.message };
  const ctx = await loadContext("propose");
  const chk = checkSteps(r.data.steps, ctx);
  if (!chk.ok) return { ok: false, frase: `Non la posso salvare: ${chk.reason}.`, step: chk.step };
  const s = db();
  const prev = await must(s.from("routines").select("version,status").eq("name", name).order("version", { ascending: false }));
  const version = (prev[0]?.version ?? 0) + 1;
  const active = prev.find((x: { status: string }) => x.status === "active");
  await must(s.from("routines").delete().eq("name", name).eq("status", "draft"));
  await must(s.from("routines").insert({
    name, version, parent_version: active?.version ?? null, steps: r.data.steps, taught_by_voice: true,
    source_utterance: utterance ?? null, status: "draft",
  }));
  await event("interpretation", { routine: name, version, steps: r.data.steps, text: utterance ?? null });
  return { ok: true, frase: readbackRoutine(name, r.data.steps), routine: name, version };
}

export async function salvaRoutine(name: string): Promise<ToolResult> {
  const s = db();
  const [d] = await must(s.from("routines").select("version").eq("name", name).eq("status", "draft").order("version", { ascending: false }).limit(1));
  if (!d) return { ok: false, frase: `Non ho nessuna routine «${name}» da salvare.` };
  await must(s.from("routines").update({ status: "deprecated" }).eq("name", name).eq("status", "active"));
  await must(s.from("routines").update({ status: "active" }).eq("name", name).eq("version", d.version));
  await event("approval", { oggetto: "routine", routine: name, version: d.version });
  return { ok: true, frase: `Salvata: «${name}», versione ${d.version}.` };
}

export async function eseguiRoutine(name: string, ripetizioni: number): Promise<ToolResult> {
  const s = db();
  const [r] = await must(s.from("routines").select("version").eq("name", name).eq("status", "active").limit(1));
  if (!r) return { ok: false, frase: `Non conosco una routine attiva che si chiama «${name}».` };
  await must(s.from("routine_runs").update({ status: "cancelled" }).eq("status", "queued"));
  await must(s.from("commands").update({ status: "cancelled" }).eq("status", "queued"));
  const [run] = await must(s.from("routine_runs").insert({ routine_name: name, routine_version: r.version, repetitions: ripetizioni, status: "queued" }).select("id"));
  const volte = ripetizioni === 1 ? "una volta" : `${ripetizioni} volte`;
  return { ok: true, frase: `Faccio la «${name}» versione ${r.version}, ${volte}. Puoi interrompermi quando vuoi. Confermi?`, routine_run_id: run.id };
}

async function currentRun(): Promise<string | null> {
  const [r] = await must(db().from("routine_runs").select("id").in("status", ["running", "confirmed"]).order("created_at", { ascending: false }).limit(1));
  return r?.id ?? null;
}

/** "fatto": risponde al passo attendi_operatore del run in corso. */
export async function fatto(): Promise<ToolResult> {
  const id = await currentRun();
  if (!id) return { ok: false, frase: "Non sto aspettando niente." };
  await must(db().from("events").insert({ type: "feedback", routine_run_id: id, payload: { done: true, text: "fatto" } }));
  return { ok: true, frase: "Bene, continuo." };
}

/** Segnalazione dell'operatore ("è storta"): finisce nel registro, il pattern miner la conta. */
export async function segnala(text: string): Promise<ToolResult> {
  const id = await currentRun();
  await must(db().from("events").insert({ type: "feedback", routine_run_id: id, payload: { text } }));
  return { ok: true, frase: `Registrato: «${text}».` };
}

/** Numeri del turno dalle view SQL; Grok li racconta, non li calcola. */
export async function resoconto(): Promise<ToolResult> {
  const s = db();
  const [sum] = await must(s.from("v_shift_summary").select("*").limit(1));
  const cycles = await must(s.from("v_cycle_stats").select("routine_name,routine_version,cycles,avg_cycle_time_ms").gt("cycles", 0));
  const sec = (ms: number | null) => (ms == null ? "—" : `${(ms / 1000).toFixed(1).replace(".", ",")} secondi`);
  const per = cycles.map((c: { routine_name: string; routine_version: number; cycles: number; avg_cycle_time_ms: number }) =>
    `«${c.routine_name}» v${c.routine_version}: ${c.cycles} cicli, media ${sec(c.avg_cycle_time_ms)}`).join("; ");
  const n = (k: string) => Number(sum?.[k] ?? 0);
  const frase = `Oggi ${n("cycles_done")} cicli, tempo medio ${sec(sum?.avg_cycle_time_ms ?? null)}. ${per ? per + ". " : ""}` +
    `${n("corrections")} correzioni, ${n("stops")} interruzioni, ${n("anomalies")} anomalie, ${n("proposals_approved")} proposte approvate. ` +
    `Comandi eseguiti senza conferma: ${n("commands_unconfirmed_executed")}.`;
  return { ok: true, frase, numeri: { ...sum, per_routine: cycles }, nota: "Racconta solo questi numeri, senza calcolarne altri." };
}

export async function approvaProposta(approva: boolean, by: string): Promise<ToolResult> {
  const s = db();
  const [p] = await must(s.from("proposals").select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(1));
  if (!p) return { ok: false, frase: "Non ho proposte in attesa." };
  const now = new Date().toISOString();
  if (!approva) {
    await must(s.from("proposals").update({ status: "rejected", decided_at: now, decided_by: by }).eq("id", p.id));
    await event("approval", { oggetto: "proposta", id: p.id, esito: "rifiutata" });
    return { ok: true, frase: "Va bene, lascio la routine com'è." };
  }
  const ch = p.change as { routine: string; from_version: number; to_version: number; diff: string };
  const [to] = await must(s.from("routines").select("version,status").eq("name", ch.routine).eq("version", ch.to_version).limit(1));
  if (!to) return { ok: false, frase: `Non trovo la versione ${ch.to_version} della «${ch.routine}».` };
  const [st] = await must(s.from("v_cycle_stats").select("avg_cycle_time_ms").eq("routine_name", ch.routine).eq("routine_version", ch.from_version).limit(1));
  await must(s.from("routines").update({ status: "deprecated" }).eq("name", ch.routine).eq("status", "active"));
  await must(s.from("routines").update({ status: "active" }).eq("name", ch.routine).eq("version", ch.to_version));
  await must(s.from("proposals").update({ status: "approved", decided_at: now, decided_by: by, before: st?.avg_cycle_time_ms ?? p.before ?? null }).eq("id", p.id));
  await event("approval", { oggetto: "proposta", id: p.id, esito: "approvata", routine: ch.routine, from_version: ch.from_version, to_version: ch.to_version });
  return { ok: true, frase: `Fatto: «${ch.routine}» versione ${ch.to_version} (${ch.diff}). Misuro il prossimo ciclo.` };
}

/** Esegue il pattern miner sugli ultimi eventi; scrive observations e, se possibile, proposal + routine draft. */
export async function mina(): Promise<ToolResult & { nuove: string[] }> {
  const { mine } = await import("../miner");
  const s = db();
  const [evs, runs, routines, obs, props] = await Promise.all([
    must(s.from("events").select("id,ts,type,routine_run_id,step,payload").order("ts", { ascending: false }).limit(400)),
    must(s.from("routine_runs").select("id,routine_name,routine_version").order("created_at", { ascending: false }).limit(100)),
    must(s.from("routines").select("name,version,status,steps")),
    must(s.from("observations").select("rule,evidence").order("created_at", { ascending: false }).limit(200)),
    must(s.from("proposals").select("id,status,change,after")),
  ]);
  const seen = new Set(obs.map((o: { rule: string; evidence: string[] }) => `${o.rule}|${o.evidence?.[0]}`));
  const nuove: string[] = [];
  for (const f of mine(evs, runs, routines)) {
    if (seen.has(`${f.rule}|${f.evidence[0]}`)) continue;
    if (f.proposal && props.some((p: { change: { routine: string; from_version: number } }) => p.change.routine === f.proposal!.routine && p.change.from_version === f.proposal!.from_version)) continue;
    const [o] = await must(s.from("observations").insert({ kind: f.kind, rule: f.rule, evidence: f.evidence, summary: f.summary }).select("id"));
    await event("proposal", { observation_id: o.id, rule: f.rule, text: f.summary });
    if (f.proposal) {
      const max = Math.max(0, ...routines.filter((r: { name: string }) => r.name === f.proposal!.routine).map((r: { version: number }) => r.version));
      const to = max + 1;
      await must(s.from("routines").delete().eq("name", f.proposal.routine).eq("status", "draft"));
      await must(s.from("routines").insert({ name: f.proposal.routine, version: to, parent_version: f.proposal.from_version, edited_from_version: f.proposal.from_version, steps: f.proposal.steps, taught_by_voice: false, source_utterance: `proposta: ${f.proposal.diff}`, status: "draft" }));
      const [st] = await must(s.from("v_cycle_stats").select("avg_cycle_time_ms").eq("routine_name", f.proposal.routine).eq("routine_version", f.proposal.from_version).limit(1));
      await must(s.from("proposals").insert({ observation_id: o.id, change: { routine: f.proposal.routine, from_version: f.proposal.from_version, to_version: to, diff: f.proposal.diff }, status: "pending", metric: "cycle_time_ms", before: st?.avg_cycle_time_ms ?? null }));
    }
    seen.add(`${f.rule}|${f.evidence[0]}`);
    nuove.push(f.summary);
  }
  // "after": tempo medio della nuova versione appena ha almeno un ciclo
  for (const p of props.filter((x: { status: string; after: number | null }) => x.status === "approved" && x.after == null)) {
    const ch = p.change as { routine: string; to_version: number };
    const [st] = await must(s.from("v_cycle_stats").select("cycles,avg_cycle_time_ms").eq("routine_name", ch.routine).eq("routine_version", ch.to_version).limit(1));
    if (st && st.cycles > 0) await must(s.from("proposals").update({ after: st.avg_cycle_time_ms }).eq("id", p.id));
  }
  return { ok: true, frase: nuove[0] ?? "", nuove };
}

/** Modifica di un movimento insegnato: crea SEMPRE una nuova versione in bozza, mai una sovrascrittura. */
export async function modificaRoutine(name: string, from_version: number, steps: Steps, by: string, motivo: string): Promise<ToolResult> {
  const r = Routine.safeParse({ name, version: 1, steps });
  if (!r.success) return { ok: false, frase: "I passi non sono validi.", errore: r.error.issues[0]?.message };
  const ctx = await loadContext("propose");
  const chk = checkSteps(r.data.steps, ctx);
  if (!chk.ok) return { ok: false, frase: `Non la posso salvare: ${chk.reason}.`, step: chk.step };
  const s = db();
  const all = await must(s.from("routines").select("version,status,steps").eq("name", name).order("version", { ascending: false }));
  const from = all.find((x: { version: number }) => x.version === from_version);
  if (!from) return { ok: false, frase: `La versione ${from_version} della «${name}» non esiste.` };
  if (JSON.stringify(from.steps) === JSON.stringify(r.data.steps)) return { ok: false, frase: "Non hai cambiato niente." };
  const version = (all[0]?.version ?? 0) + 1;
  await must(s.from("routines").delete().eq("name", name).eq("status", "draft"));
  await must(s.from("routines").insert({
    name, version, parent_version: from_version, edited_from_version: from_version, steps: r.data.steps,
    taught_by_voice: false, source_utterance: `modifica dalla console (${by}): ${motivo}`, status: "draft",
  }));
  await event("correction", { oggetto: "routine", routine: name, from_version, to_version: version, by, motivo, steps: r.data.steps });
  return { ok: true, frase: `Versione ${version} della «${name}» pronta: va approvata prima di essere usata.`, version };
}

/** Presa visione di un'allerta: resta nel registro con chi e quando. Non resetta niente sul controller. */
export async function presaVisione(alert_id: string, livello: string, titolo: string, by: string): Promise<ToolResult> {
  await event("approval", { oggetto: "allerta", alert_id, livello, titolo, by });
  return { ok: true, frase: "Presa visione registrata." };
}

/** Un passo della prova di un movimento, dopo il sì dell'operatore alla rilettura dell'intera prova. */
export async function passoTest(p: { direzione: string; quantita: number; unita: string }, test: string, passo: number, totale: number): Promise<ToolResult> {
  const ctx = await loadContext("execute");
  const confirmed_at = new Date().toISOString();
  const params = { direzione: p.direzione, quantita: p.quantita, unita: p.unita, intensita: null };
  const d = validate({ id: "test", skill: "sposta", params, status: "confirmed", confirmed_at }, ctx);
  if (!d.ok) {
    await event("anomaly", { origine: "web", code: d.code, reason: d.reason, test, passo });
    if (d.motion_check) await event("motion_check", { ...d.motion_check });
    return { ok: false, frase: `Interrompo al passo ${passo}: ${d.reason}.`, code: d.code };
  }
  const s = db();
  const [row] = await must(s.from("commands").insert({ skill: "sposta", params, status: "confirmed", confirmed_at, readback: `${test} · passo ${passo}/${totale}: ${d.readback ?? ""}` }).select("id"));
  await event("confirmation", { text: "sì", test, passo, totale }, row.id);
  return { ok: true, frase: "", command_id: row.id };
}

/** Il task del pendant all'inizio della prova di un movimento della libreria (dopo il sì alla rilettura). */
export async function passoBase(skill: string, place: string | null, test: string): Promise<ToolResult> {
  const ctx = await loadContext("execute");
  const confirmed_at = new Date().toISOString();
  const params = place ? { place } : {};
  const d = validate({ id: "test", skill, params, status: "confirmed", confirmed_at }, ctx);
  if (!d.ok) {
    await event("anomaly", { origine: "web", code: d.code, reason: d.reason, test, passo: 0 });
    return { ok: false, frase: `Non eseguo il task: ${d.reason}.`, code: d.code };
  }
  const [row] = await must(db().from("commands").insert({ skill, params, status: "confirmed", confirmed_at, readback: `${test} · task di base` }).select("id"));
  await event("confirmation", { text: "sì", test, passo: 0 }, row.id);
  return { ok: true, frase: "", command_id: row.id };
}
