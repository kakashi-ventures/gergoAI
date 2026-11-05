import "server-only";
import { createHash } from "node:crypto";
import { db, must } from "./db";

// Proposta di modifica agli script Python dopo un test riuscito e la conferma dell'operatore.
// Regole: si apre SEMPRE una Pull Request su un ramo nuovo, mai un push su main; il file generato contiene solo
// dati (la routine o il movimento approvato, con la provenienza), mai logica; il bridge resta l'unico a eseguire e
// rivalida tutto. La PR la rivede e la unisce una persona (BRIDGE). Ogni proposta finisce nel registro.
const REPO = "kakashi-ventures/gergoAI";
const API = "https://api.github.com";

export interface ScriptProposal { ok: boolean; frase: string; pr_url?: string; path?: string; content?: string; sha256?: string; needs_token?: boolean }

function py(v: unknown, ind = 0): string {
  const pad = "    ".repeat(ind + 1), end = "    ".repeat(ind);
  if (v === null || v === undefined) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return v.length ? `[\n${v.map((x) => pad + py(x, ind + 1)).join(",\n")},\n${end}]` : "[]";
  const e = Object.entries(v as Record<string, unknown>);
  return e.length ? `{\n${e.map(([k, x]) => `${pad}${JSON.stringify(k)}: ${py(x, ind + 1)}`).join(",\n")},\n${end}}` : "{}";
}

async function gh(path: string, init: RequestInit = {}) {
  const token = process.env.GITHUB_TOKEN;
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${String(j.message ?? "")}`);
  return j;
}

/** Costruisce il file Python di dati per una routine attiva testata (almeno un ciclo ok) o per l'ultimo movimento eseguito. */
export async function buildProposal(kind: "routine" | "movimento" | "test", name?: string, test?: TestInput): Promise<{ path: string; content: string; title: string; body: string; evidence: string[] } | { error: string }> {
  const s = db();
  const now = new Date().toISOString();
  if (kind === "test") {
    if (!test) return { error: "Manca il movimento provato." };
    // Il server non si fida del client: ogni passo deve esistere nel registro, eseguito con esito ok, con gli stessi parametri.
    const ids = test.command_ids;
    if (ids.length !== test.steps.length) return { error: "Il numero dei passi eseguiti non coincide con il movimento." };
    const cmds = await must(s.from("commands").select("id,params,status,finished_at").in("id", ids));
    const ends = await must(s.from("events").select("id,command_id,payload").eq("type", "step_end").in("command_id", ids));
    for (let i = 0; i < ids.length; i++) {
      const c = cmds.find((x: { id: string }) => x.id === ids[i]);
      const st = test.steps[i];
      if (!c || c.status !== "done") return { error: `Il passo ${i + 1} non risulta eseguito.` };
      if (c.params?.direzione !== st.direzione || Number(c.params?.quantita) !== st.quantita || c.params?.unita !== st.unita) return { error: `Il passo ${i + 1} eseguito non coincide con quello proposto.` };
      if (!ends.some((e: { command_id: string; payload: Record<string, unknown> }) => e.command_id === ids[i] && e.payload?.ok === true)) return { error: `Il passo ${i + 1} non ha un esito positivo nel registro.` };
    }
    const evidence = [...ids, ...ends.map((e: { id: string }) => e.id)];
    const data = { id: test.id, name: test.name, version: test.version, steps: test.steps, history: test.history ?? [], esito: "corretto secondo l'operatore", command_ids: ids };
    const content = header(`Movimento «${test.name}» v${test.version}`, now, evidence, `${ids.length} passi eseguiti con esito ok; l'operatore ha detto che è corretto`) + `MOVIMENTO = ${py(data)}\n`;
    return {
      path: `bridge/taught/movimento_${slug(test.id)}_v${test.version}.py`, content, evidence,
      title: `Gergo: movimento «${test.name}» v${test.version} corretto a voce`,
      body: `Proposta generata dalla console dopo la prova e la conferma dell'operatore.\n\n- Movimento: «${test.name}» v${test.version}\n- Passi: ${test.steps.map((x) => `${x.direzione} ${x.quantita} ${x.unita}`).join(", ")}\n- Correzioni: ${(test.history ?? []).join(" · ") || "—"}\n- Evidenze (comandi ed eventi del registro): ${evidence.join(", ")}\n\nIl file contiene solo dati (intenti, nessuna coordinata). Il bridge li rivalida con \`bridge/validator.py\`. Da rivedere e unire a cura di BRIDGE.`,
    };
  }
  if (kind === "routine") {
    const [r] = await must(s.from("routines").select("*").eq("name", name ?? "").eq("status", "active").limit(1));
    if (!r) return { error: `La routine «${name}» non è attiva: prima va approvata.` };
    const cycles = await must(s.from("events").select("id,ts,payload").eq("type", "step_end").eq("payload->>cycle", "true").eq("payload->>routine", r.name).eq("payload->>version", String(r.version)).order("ts", { ascending: false }).limit(20));
    if (!cycles.length) return { error: `La «${r.name}» v${r.version} non ha ancora un ciclo completo: prima va provata.` };
    const appr = await must(s.from("events").select("id,ts,payload").eq("type", "approval").eq("payload->>routine", r.name).order("ts", { ascending: false }).limit(5));
    const evidence = [...cycles.map((c: { id: string }) => c.id), ...appr.map((a: { id: string }) => a.id)];
    const data = { name: r.name, version: r.version, parent_version: r.parent_version, steps: r.steps, source_utterance: r.source_utterance, taught_by_voice: r.taught_by_voice };
    const content = header(`Routine «${r.name}» v${r.version}`, now, evidence, `${cycles.length} cicli riusciti in ${cycles[0] ? "sim/elite" : "—"}; approvata in console`) +
      `ROUTINE = ${py(data)}\n`;
    return {
      path: `bridge/taught/routine_${slug(r.name)}_v${r.version}.py`, content, evidence,
      title: `Gergo: routine «${r.name}» v${r.version} insegnata a voce`,
      body: `Proposta generata dalla console dopo il test e la conferma dell'operatore.\n\n- Routine: «${r.name}» v${r.version} (da v${r.parent_version ?? "—"})\n- Frase dell'operatore: ${r.source_utterance ?? "—"}\n- Cicli riusciti: ${cycles.length}\n- Evidenze (id degli eventi nel registro): ${evidence.join(", ")}\n\nIl file contiene solo dati. Il bridge li rivalida comunque con \`bridge/validator.py\`. Da rivedere e unire a cura di BRIDGE.`,
    };
  }
  const [c] = await must(s.from("commands").select("*").eq("skill", "sposta").eq("status", "done").order("finished_at", { ascending: false }).limit(1));
  if (!c) return { error: "Non c'è un movimento a voce eseguito con successo da proporre." };
  const ends = await must(s.from("events").select("id,ts,payload").eq("command_id", c.id).in("type", ["step_end", "motion_check", "confirmation", "utterance"]).order("ts"));
  const ok = ends.find((e: { payload: Record<string, unknown> }) => e.payload?.ok === true);
  if (!ok) return { error: "L'ultimo movimento non ha un esito positivo nel registro." };
  const evidence = ends.map((e: { id: string }) => e.id);
  const utt = ends.find((e: { payload: Record<string, unknown> }) => typeof e.payload?.text === "string" && e.payload.text !== "sì")?.payload?.text;
  const data = { command_id: c.id, params: c.params, readback: c.readback, confirmed_at: c.confirmed_at, finished_at: c.finished_at, utterance: utt ?? null };
  const content = header("Movimento a voce testato", now, evidence, "eseguito con esito ok dopo il sì dell'operatore") + `MOVIMENTO = ${py(data)}\n`;
  return {
    path: `bridge/taught/movimento_${c.id.slice(0, 8)}.py`, content, evidence,
    title: `Gergo: movimento a voce «${c.readback ?? "sposta"}»`,
    body: `Proposta generata dalla console dopo il test e la conferma dell'operatore.\n\n- Rilettura: ${c.readback}\n- Parametri (intenti, nessuna coordinata): \`${JSON.stringify(c.params)}\`\n- Evidenze: ${evidence.join(", ")}\n\nIl file contiene solo dati. Da rivedere e unire a cura di BRIDGE.`,
  };
}

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

function header(what: string, now: string, evidence: string[], esito: string) {
  return `"""${what}: proposta di Gergo, generata dalla console il ${now}.

Solo dati, nessuna logica. Esito del test: ${esito}.
Evidenze nel registro (events.id): ${evidence.join(", ")}.
Il bridge rivalida tutto con bridge/validator.py prima di eseguire; questo file non cambia limiti né whitelist.
"""

`;
}

export interface TestInput { id: string; name: string; version: number; steps: { direzione: string; quantita: number; unita: string }[]; history?: string[]; command_ids: string[] }

export async function proposeScript(kind: "routine" | "movimento" | "test", name: string | undefined, by: string, test?: TestInput): Promise<ScriptProposal> {
  const p = await buildProposal(kind, name, test);
  if ("error" in p) return { ok: false, frase: p.error };
  const sha256 = createHash("sha256").update(p.content).digest("hex");
  const s = db();
  if (!process.env.GITHUB_TOKEN) {
    await must(s.from("events").insert({ type: "proposal", payload: { oggetto: "script", stato: "senza_token", path: p.path, sha256, by, evidence: p.evidence } }));
    return { ok: false, needs_token: true, path: p.path, content: p.content, sha256, frase: "Proposta pronta ma non inviata: manca GITHUB_TOKEN su Vercel. Puoi scaricare il file." };
  }
  const ref = (await gh(`/repos/${REPO}/git/ref/heads/main`)) as { object: { sha: string } };
  const branch = `gergo/${p.path.split("/").pop()!.replace(".py", "")}-${Date.now().toString(36)}`;
  await gh(`/repos/${REPO}/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: ref.object.sha }) });
  await gh(`/repos/${REPO}/contents/${p.path}`, { method: "PUT", body: JSON.stringify({ message: p.title, content: Buffer.from(p.content).toString("base64"), branch }) });
  const pr = (await gh(`/repos/${REPO}/pulls`, { method: "POST", body: JSON.stringify({ title: p.title, head: branch, base: "main", body: `${p.body}\n\nsha256 del file: \`${sha256}\` · proposta da: ${by}` }) })) as { html_url: string; number: number };
  await must(s.from("events").insert({ type: "proposal", payload: { oggetto: "script", stato: "pr_aperta", pr_url: pr.html_url, pr: pr.number, branch, path: p.path, sha256, by, evidence: p.evidence } }));
  return { ok: true, pr_url: pr.html_url, path: p.path, sha256, frase: `Ho aperto la proposta di modifica: ${p.path}. Va rivista e unita da una persona.` };
}
