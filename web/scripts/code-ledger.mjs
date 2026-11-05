#!/usr/bin/env node
// Registro del codice: legge gli script Python del braccio (bridge/, sdk/, safety/) ed estrae
// impronte (sha256) e parametri di sicurezza DIRETTAMENTE dal sorgente, con file e riga.
// Nessun valore è scritto a mano: se una regola non trova il nome, finisce in `missing`.
// Uso: node scripts/code-ledger.mjs   (anche come `prebuild`)
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = resolve(WEB, "..");
const OUT = join(WEB, "lib", "generated", "code-ledger.json");
const DIRS = ["bridge", "sdk", "safety"];

// File considerati critici per la sicurezza (stessa lista della route /api/code/history).
const SAFETY_CRITICAL = [
  /^bridge\/(validator|motion|contracts|main)\.py$/,
  /^bridge\/adapters\//,
  /^sdk\/gergo_sdk\/(motion|kinematics|primary|dashboard|cs|rtsi)\.py$/,
  /^safety\/audio_guard\.py$/,
];

// Regole: quale nome cercare in quale file. Il valore lo legge il programma.
// kind "assign": `NOME = ...` / `nome: tipo = ...` a inizio riga (anche indentato).
// kind "kwarg": parametro con default dentro una firma `nome: tipo = valore`.
const RULES = [
  { file: "bridge/motion.py", name: "CLAMP_MM", category: "movimento", note: "Spostamento massimo per singolo comando vocale (mm): oltre, il valore viene tagliato." },
  { file: "bridge/motion.py", name: "INTENSITA_MM", category: "movimento", note: "Traduzione delle parole d'intensità (poco / un po' / tanto) in millimetri." },
  { file: "bridge/motion.py", name: "DEFAULT_MM", category: "movimento", note: "Spostamento usato quando l'operatore non dice quanto." },
  { file: "bridge/motion.py", name: "DEFAULT_FRAME", category: "movimento", note: "Riferimento di lavoro di default (assi e limiti) se manca il file del frame." },
  { file: "bridge/contracts.py", name: "VELOCITA_DEFAULT_MM_S", category: "velocità", note: "Velocità iniziale della sessione (mm/s)." },
  { file: "bridge/contracts.py", name: "VELOCITA_MIN_MM_S", category: "velocità", note: "Limite inferiore di velocità impostabile a voce (mm/s)." },
  { file: "bridge/contracts.py", name: "VELOCITA_MAX_MM_S", category: "velocità", note: "Limite superiore di velocità impostabile a voce (mm/s)." },
  { file: "sdk/gergo_sdk/motion.py", name: "MAX_SPEED_M_S", category: "velocità", note: "Velocità cartesiana massima inviata al controller (m/s)." },
  { file: "sdk/gergo_sdk/motion.py", name: "MAX_ACC_M_S2", category: "velocità", note: "Accelerazione massima dei movimenti lineari (m/s²)." },
  { file: "sdk/gergo_sdk/primary.py", name: "MAX_SPEED_M_S", category: "velocità", note: "Tetto di velocità applicato al momento dell'invio sulla porta primaria (m/s)." },
  { file: "sdk/gergo_sdk/primary.py", name: "MAX_ACC_M_S2", category: "velocità", note: "Tetto di accelerazione sulla porta primaria (m/s²)." },
  { file: "bridge/validator.py", name: "MAX_COMMAND_AGE_S", category: "conferma", note: "Un comando più vecchio di così viene rifiutato: niente esecuzioni in ritardo." },
  { file: "bridge/validator.py", name: "TCP_TOLERANCE_MM", category: "conferma", note: "Scostamento massimo tra posa attesa e posa letta prima di muovere." },
  { file: "bridge/validator.py", name: "MOTION_SKILLS", category: "conferma", note: "Comandi trattati come movimento (richiedono i controlli di posa)." },
  { file: "bridge/validator.py", name: "SESSION_SKILLS", category: "conferma", note: "Comandi che cambiano solo la sessione (velocità), senza muovere." },
  { file: "bridge/main.py", name: "GUARD_GRACE_S", category: "arresto acustico", note: "Tempo concesso alla guardia acustica per dare segni di vita prima di bloccare i movimenti." },
  { file: "bridge/main.py", name: "TIMEOUT_S", category: "conferma", note: "Tempo massimo di esecuzione per ogni abilità: oltre, il comando è dichiarato fallito." },
  { file: "bridge/main.py", name: "HEARTBEAT_S", category: "altro", note: "Intervallo del battito del bridge verso la console." },
  { file: "bridge/main.py", name: "POSE_TOLERANCE_MM", category: "conferma", note: "Tolleranza di posa a fine movimento (mm)." },
  { file: "bridge/composer.py", name: "RUN_MAX_AGE_S", category: "conferma", note: "Età massima di una routine prima che venga scartata." },
  { file: "bridge/composer.py", name: "FEEDBACK_TIMEOUT_S", category: "conferma", note: "Attesa massima del riscontro dell'operatore durante una routine." },
  { file: "sdk/gergo_sdk/dashboard.py", name: "READ_ONLY", category: "whitelist", note: "Comandi di sola lettura ammessi sulla dashboard del controller (regex esatta)." },
  { file: "sdk/gergo_sdk/dashboard.py", name: "TASK", category: "whitelist", note: "Comandi di gestione task ammessi sulla dashboard: tutto il resto è rifiutato." },
  { file: "sdk/gergo_sdk/primary.py", name: "MOVEL_RE", category: "whitelist", note: "Unico script ammesso sulla porta primaria: un solo movel con numeri formattati." },
  { file: "sdk/gergo_sdk/motion.py", name: "MAX_TRANSLATION_M", category: "movimento", note: "Traslazione massima per comando nello SDK (m)." },
  { file: "sdk/gergo_sdk/motion.py", name: "MAX_ROT_CHANGE_RAD", category: "cinematica", note: "Variazione d'orientamento ammessa: l'utensile non deve ruotare." },
  { file: "sdk/gergo_sdk/motion.py", name: "START_POSE_TOL_M", category: "cinematica", note: "La posa di partenza deve coincidere con la cinematica diretta entro questa tolleranza." },
  { file: "sdk/gergo_sdk/motion.py", name: "max_jump_deg", kind: "kwarg", category: "cinematica", note: "Salto massimo di un giunto tra due punti della traiettoria (gradi)." },
  { file: "sdk/gergo_sdk/motion.py", name: "max_ratio_deg_per_mm", kind: "kwarg", category: "cinematica", note: "Rapporto massimo gradi di giunto per mm cartesiano: protegge dalle singolarità." },
  { file: "sdk/gergo_sdk/kinematics.py", name: "JOINT_LIMIT_RAD", category: "cinematica", note: "Limite di rotazione dei giunti usato dalla cinematica inversa." },
  { file: "sdk/gergo_sdk/cs.py", name: "POSE_TOL_M", category: "cinematica", note: "Errore finale ammesso perché un passo sia dichiarato riuscito (m)." },
  { file: "safety/audio_guard.py", name: "KEYWORDS", category: "arresto acustico", note: "Parole che fermano il braccio." },
  { file: "safety/audio_guard.py", name: "PRIORITY", category: "arresto acustico", note: "Priorità dei tipi di evento sonoro (1 = più alta)." },
  { file: "safety/audio_guard.py", name: "botta_rise_db", category: "arresto acustico", note: "Salita di energia che identifica un colpo (dB)." },
  { file: "safety/audio_guard.py", name: "botta_crest", category: "arresto acustico", note: "Fattore di cresta minimo (picco/RMS) per un colpo." },
  { file: "safety/audio_guard.py", name: "botta_min_over_baseline_db", category: "arresto acustico", note: "Livello minimo sopra il rumore di fondo per un colpo (dB)." },
  { file: "safety/audio_guard.py", name: "urlo_over_db", category: "arresto acustico", note: "Livello sopra il riferimento per riconoscere un urlo (dB)." },
  { file: "safety/audio_guard.py", name: "urlo_min_ms", category: "arresto acustico", note: "Durata minima di un urlo (ms)." },
  { file: "safety/audio_guard.py", name: "urlo_centroid_hz", category: "arresto acustico", note: "Centroide spettrale minimo di un urlo (Hz)." },
  { file: "safety/audio_guard.py", name: "sfreg_hf_over_db", category: "arresto acustico", note: "Energia in alta frequenza sopra il profilo di moto per uno sfregamento (dB)." },
  { file: "safety/audio_guard.py", name: "sfreg_min_ms", category: "arresto acustico", note: "Durata minima di uno sfregamento (ms)." },
  { file: "safety/audio_guard.py", name: "debounce_s", category: "arresto acustico", note: "Tempo minimo tra due arresti consecutivi (s)." },
  { file: "safety/audio_guard.py", name: "HEARTBEAT_S", category: "arresto acustico", note: "Intervallo del battito della guardia acustica (s)." },
  { file: "safety/audio_guard.py", name: "NO_AUDIO_S", category: "arresto acustico", note: "Senza audio per questo tempo la guardia va in failsafe." },
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "__pycache__" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".py")) out.push(p);
  }
  return out;
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

// Legge il lato destro, proseguendo sulle righe successive finché le parentesi non sono chiuse.
function readValue(lines, i, start) {
  let text = start;
  let depth = 0;
  const count = (s) => {
    for (const ch of s.replace(/(["'])(?:\\.|(?!\1).)*\1/g, "")) {
      if ("([{".includes(ch)) depth++;
      else if (")]}".includes(ch)) depth--;
    }
  };
  count(start);
  let j = i;
  while (depth > 0 && j + 1 < lines.length && j - i < 40) {
    j++;
    text += "\n" + lines[j];
    count(lines[j]);
  }
  text = text.trim();
  return text.length > 300 ? text.slice(0, 299) + "…" : text;
}

function extract(rule, lines) {
  const esc = rule.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = rule.kind === "kwarg"
    ? new RegExp(`\\b${esc}\\s*:\\s*[\\w\\[\\], .]+?=\\s*([^,)]+)`)
    : new RegExp(`^\\s*${esc}\\s*(?::[^=]+)?=(?!=)\\s*(.*)$`);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (!m) continue;
    let value = rule.kind === "kwarg" ? m[1].trim() : readValue(lines, i, m[1]);
    if (rule.kind === "kwarg" && value === "None") continue; // campo opzionale, non la soglia
    let comment = null;
    const c = !value.includes("\n") && value.match(/^([^"'#]*?)\s+#\s?(.*)$/);
    if (c) { value = c[1].trim(); comment = c[2].trim(); }
    return { line: i + 1, value, comment };
  }
  return null;
}

function main() {
  if (!existsSync(join(ROOT, "bridge"))) {
    console.warn(`[code-ledger] ${join(ROOT, "bridge")} non trovato: tengo il JSON esistente (${existsSync(OUT) ? "presente" : "ASSENTE"}).`);
    if (!existsSync(OUT)) {
      mkdirSync(dirname(OUT), { recursive: true });
      writeFileSync(OUT, JSON.stringify({ generated_at: null, source_commit: null, unavailable: true, files: [], params: [], missing: [] }, null, 2) + "\n");
    }
    process.exit(0);
  }

  const source_commit = process.env.VERCEL_GIT_COMMIT_SHA || git(["rev-parse", "HEAD"]);
  const gitOk = git(["rev-parse", "--is-inside-work-tree"]) === "true";
  const texts = new Map();
  const files = [];

  for (const d of DIRS) {
    const abs = join(ROOT, d);
    if (!existsSync(abs)) continue;
    for (const p of walk(abs).sort()) {
      const rel = relative(ROOT, p).split(sep).join("/");
      const buf = readFileSync(p);
      const text = buf.toString("utf8");
      texts.set(rel, text);
      let last_commit = null;
      if (gitOk) {
        const raw = git(["log", "-1", "--format=%H%x1f%cI%x1f%an%x1f%s", "--", rel]);
        if (raw) {
          const [sha, date, author, subject] = raw.split("\x1f");
          last_commit = { sha, date, author, subject };
        }
      }
      files.push({
        path: rel,
        bytes: buf.length,
        lines: text.length === 0 ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0),
        sha256: createHash("sha256").update(buf).digest("hex"),
        test: /(^|\/)tests\//.test(rel),
        safety_critical: SAFETY_CRITICAL.some((r) => r.test(rel)),
        last_commit,
      });
    }
  }

  const params = [];
  const missing = [];
  for (const rule of RULES) {
    const text = texts.get(rule.file);
    const hit = text ? extract(rule, text.split("\n")) : null;
    if (!hit) {
      missing.push({ name: rule.name, file: rule.file, reason: text ? "nome non trovato nel file" : "file non trovato" });
      continue;
    }
    params.push({ name: rule.name, value: hit.value, source_comment: hit.comment, file: rule.file, line: hit.line, category: rule.category, note: rule.note });
  }

  const ledger = { generated_at: new Date().toISOString(), source_commit: source_commit || null, unavailable: false, files, params, missing };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(ledger, null, 2) + "\n");
  console.log(`[code-ledger] ${files.length} file, ${params.length} parametri, ${missing.length} mancanti -> ${relative(WEB, OUT)}`);
  for (const m of missing) console.warn(`[code-ledger] mancante: ${m.name} in ${m.file} (${m.reason})`);
}

main();

// Libreria dei movimenti preinstallati: i task del pendant, letti dal file di BRACCIO (shared/fixtures/elite_tasks.json).
{
  const src = join(ROOT, "shared", "fixtures", "elite_tasks.json");
  const dst = join(WEB, "lib", "generated", "elite-tasks.json");
  if (existsSync(src)) {
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, readFileSync(src));
    console.log(`[code-ledger] task del pendant copiati -> ${relative(WEB, dst)}`);
  } else if (!existsSync(dst)) {
    writeFileSync(dst, JSON.stringify({ verified: false, tasks: {} }) + "\n");
  }
}
