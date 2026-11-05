# CANTIERI.md — 4 orchestratori in parallelo su `main`

Fonti dei compiti: **MOTION_SAFETY.md** (vince sugli altri in caso di contrasto), **DEPLOY.md** (prompt 1–4),
**PLAN.md**, **HACK.md**. Questo file decide chi possiede cosa e come ci si coordina. Ogni cantiere aggiorna
**solo la propria riga** della tabella di stato.

Revisione 2 (dopo la spiegazione del tecnico): si aggiungono il movimento a voce in centimetri con geofence e
controllo di cinematica, l'arresto vocale e acustico locale e il controllo della serie del braccio (CS o EC).
`/eval` passa a FONDAMENTA.

## I quattro cantieri

| Cantiere | Lavoro | Possiede (scrive solo qui) | Consegna |
|---|---|---|---|
| **FONDAMENTA** | DEPLOY prompt 3 + misura contro baseline (P5 di PLAN.md) | `/supabase/config*`, `.env.example`, `bridge/.env.example`, `web/app/api/health`, `vercel.json`, `/eval` | DB online con RLS e realtime, env su Vercel, `/api/health` verde, tabelle A/B/C |
| **BRIDGE** | DEPLOY prompt 1 + contratti e regole del movimento relativo e della sicurezza | `/shared` (tranne le eccezioni sotto), `/bridge` (tranne `bridge/adapters/elite.py`), `/supabase/migrations/1*_*.sql`, `/reports` | contratti congelati, validatore con geofence, bridge in sim, composer, `deploy_report` |
| **CONSOLE** | DEPLOY prompt 2 + tool vocale `sposta` e pannello sicurezza | `/web` (tranne `web/app/api/health`), `/voice`, `/shared/xai-notes.md`, `/supabase/migrations/2*_*.sql` | console su Vercel, voce, `/api/tools/*` compreso `sposta`, registro |
| **BRACCIO** | DEPLOY prompt 4 + MOTION_SAFETY.md §1, §2 e §3 | `/sdk`, `/safety`, `bridge/adapters/elite.py`, `/shared/fixtures/{elite_*,frame,workspace}.json` | serie verificata, `gergo_sdk` con il modulo `motion`, `audio_guard` misurato, un movimento reale |

File comuni (`README.md`, `CLAUDE.md`, `CANTIERI.md`, `MOTION_SAFETY.md`): solo commit piccoli e dedicati.

## Dipendenze e ordine

```
FONDAMENTA ──(DB + env, ~12:50)──────────────────────────────┐
BRIDGE ──(contracts-v1 entro 13:00, include "sposta")──┬─────┼─► CONSOLE (zod, route, tool vocale)
                                                       └─────┼─► BRACCIO (protocol, motion, adapter)
BRACCIO ──(serie CS/EC entro 13:15, al 1° slot)──────────────┼─► BRIDGE e CONSOLE: quale transport
                                                             └─► tutti: test su DB vero
```

- Fino a `contracts-v1`, CONSOLE e BRACCIO lavorano su ciò che non dipende dai contratti: layout della console e
  client voce per CONSOLE; client JSON-RPC, mock, `motion` e `audio_guard` per BRACCIO.
- Le migration le scrivono BRIDGE (`1xxx_`) e CONSOLE (`2xxx_`); **le applica solo FONDAMENTA**, che poi confronta
  `list_migrations` con i file.
- I contratti li cambia solo BRIDGE. Chi ha bisogno di un campo lo chiede in "Richieste".

## Regole di sicurezza (valgono per tutti)

- Grok non emette mai coordinate: emette intenti a enum, e i numeri li calcola il codice.
- Nessun comando reale al robot senza averlo mostrato a una persona e aver ricevuto il suo ok, la prima volta in
  ogni sessione.
- Accensione, servo, freni, reset di allarmi e collisioni, payload e TCP si fanno **dal pendant**, mai dal
  software.
- Lo stop software non è l'e-stop: l'e-stop è fisico ed è dello staff. Nel pitch e nel README si chiama "arresto
  vocale e acustico", mai "e-stop vocale".

## Regole git (tutti lavorano su `main`)

1. Commit piccoli, solo nelle proprie cartelle. `git pull --rebase origin main` prima di ogni push.
2. Se il rebase va in conflitto su un file che non possiedi: `git rebase --abort`, scrivi in "Richieste", aspetta.
3. Niente force push su `main`, mai. Niente segreti nei commit (`.env*` è in `.gitignore`).
4. Dopo ogni milestone: test verdi, poi commit e push, poi aggiorna la tua riga di stato.

## Stato (ognuno aggiorna la sua riga: ora · fatto · prossimo · bloccato da)

| Cantiere | Ora | Fatto | Prossimo | Bloccato da |
|---|---|---|---|---|
| FONDAMENTA | 13:22 | DB = repo (9/9), advisors security 0; Vercel `gergoai` builda Next (commit 907a568); `/api/health` in prod: Supabase ok, tabelle ok, nessun segreto NEXT_PUBLIC_; `CLAUDE.md`; README in bozza; `bridge/.env.example` completo | eval B/C reali; README finale; 15:00 freeze | `CONSOLE_PASSPHRASE` assente su Vercel (umano); `XAI_EVAL_MODEL` assente; region funzioni iad1 (meglio fra1) |
| BRIDGE | 12:54 | `contracts-v1` (`1448eac`), migration `1001`/`1002`, `RobotAdapter`, validator con geofence, `main.py` + SimArm con `sposta`, composer, `deploy_report` (sezione sicurezza); 84 test verdi | check di accettazione sul DB vero dopo le migration (serve `bridge/.env`) | tag `contracts-v1`: push dei tag dal cloud 403, va pushato a mano · tabelle `routines`/`routine_runs` di CONSOLE |
| CONSOLE | 14:40 | Nuova UX: «Parla al braccio» (sfera voce, rilettura scritta dal codice, Sì/No), **sistema di allerta** (regole in `lib/alerts.ts`, schermo intero per i critici, presa visione nel registro), **Movimenti** (approva nuovi e modificati con confronto per passo; modifica = sempre nuova versione in bozza), registro filtrabile ed esportabile, tempo di ciclo per versione, **modalità demo** (`/console?demo`), **`/console/codice`** (44 parametri di sicurezza letti dai `.py` con file:riga, impronte sha256, storia GitHub con patch), **landing** `/` dal pitch di Control8 con link al deck; 90 test verdi | probe voce dal vivo e prova end to end sull'URL Vercel | `CONSOLE_PASSPHRASE` e `XAI_API_KEY` su Vercel (umano); `GITHUB_TOKEN` consigliato per la storia del codice |
| BRACCIO | 13:39 | **CS63** (sbraccio 624 mm), IP **192.168.1.200**; orientamento della nostra FK = pendant (verificato); `gergo_sdk` + `EliteCsAdapter` + `audio_guard`; probe con `fk_check`; 155 test verdi | probe read-only dal laptop su 192.168.1.x, TCP, task salvati con nome, posa di partenza piegata | laptop sulla rete del braccio, pendant in remote, nomi dei task |

## Richieste tra cantieri

Formato: `- [ora] DA → A: cosa serve, perché` · chi la risolve la marca `✔ ora + commit`.

- [13:45] BRACCIO → BRIDGE, CONSOLE: i task CS sono 10, nomi in `shared/fixtures/elite_tasks.json` e guida per il pendant in `sdk/TASKS.md` (home, porta/solleva/deposita × INGRESSO/STAZIONE/USCITA/SCARTI, applica_STAZIONE). BRIDGE: se volete il campo `jbi` di `skills` valorizzato, usate quei nomi; l'adapter li risolve comunque da `elite_tasks.json` con chiave `skill:LUOGO`.

- [12:46] BRIDGE → CONSOLE, BRACCIO: **contracts-v1 pronto** su `main` al commit `1448eac`. Leggete `shared/contracts.md`; schemi in `shared/schemas/*.json`, fixtures in `shared/fixtures/{valid,invalid}/*.json` (formato `{model, data, why}`: zod deve dare lo stesso esito di pydantic). Le regole cross-field (params per skill, `sposta` senza coordinate) sono nella tabella di `contracts.md`.
- [13:00] BRACCIO → BRIDGE: audio_guard scrive i fail-safe come `trigger: "heartbeat"` con `features.failsafe`: confermate o aggiungete `failsafe` al contratto. Heartbeat su `guard_status` (~4 upsert/s) o file `--heartbeat-file`; serve un modo per dire ad audio_guard che il braccio si muove (per lo sfregamento).
- [13:10] BRACCIO → BRIDGE: `bridge/adapters/elite.py` espone `EliteCsAdapter(host, mode)` (env `ELITE_HOST`, `ELITE_MODE`=dry-run|read-only|armed, `GERGO_GUARD_HEARTBEAT` = file che audio_guard tocca ogni 250 ms). Usatelo in `--mode elite` al posto di `DryRunElite`; serve `pip install -e sdk`. In `bridge/.env.example` aggiungete `ELITE_DASHBOARD_PORT=29999` al posto di `ELITE_PORT=8055`.
- [12:48] BRACCIO → BRIDGE, CONSOLE: **il braccio è serie CS**. Transport: Dashboard TCP 29999 per i task (`task -p`/`play`/`stop`), script su Primary 30001 per `movel`. Il campo `jbi` di `Skill` resta valido come nome del task sul controller (`.task` CS) — BRIDGE valuti se rinominarlo in `task`. Il movimento relativo dipende dalle unità di `movel` (decisione entro le 13:45).
- [12:46] BRIDGE → umano: il tag `contracts-v1` non si può pushare da qui (403). Da un laptop: `git fetch origin && git tag contracts-v1 1448eac && git push origin contracts-v1`.
- [12:49] BRIDGE → BRACCIO: **`RobotAdapter` pubblicato** in `bridge/adapters/base.py` (connect, status, read_pose, read_tcp_mm, check_line, move_linear, run_task, stop, guard_alive; `Pose` in mm+rad nel frame utente, `LineCheck`, `TaskResult`). `bridge/motion.py` legge la mappa direzione→asse da `shared/fixtures/frame.json` nel formato `{"directions": {"su": ["z", 1], …}}` (default nel codice finché il file non c'è).
- [12:47] FONDAMENTA → tutti: DB online. URL `https://gppcwepbwrrcsojrwplp.supabase.co`. Le chiavi NON sono nel repo:
  la publishable/anon va in `NEXT_PUBLIC_SUPABASE_ANON_KEY`, la service role si copia dalla dashboard Supabase.
  Prefissi migration: `0xxx_`/`9xxx_` FONDAMENTA, `1xxx_` BRIDGE, `2xxx_` CONSOLE. Dopo ogni lotto applico
  `public.fondamenta_harden()`: RLS su tutto, anon solo SELECT su events, commands, bridge_status, skills, routines,
  observations, proposals, ontology_versions, tools, workspace, guard_status e view `v_*` (security_invoker);
  realtime su events, commands, bridge_status, proposals, guard_status. Usate questi nomi di tabella.
- [12:47] FONDAMENTA → BRIDGE, BRACCIO: dove scrive audio_guard il suo heartbeat? Propongo una tabella ✔ 12:55 (BRIDGE 1002: `guard_status`, `bridge_status.last_heartbeat_at`)
  `guard_status {bridge_id pk, alive bool, last_heartbeat_at timestamptz, last_trigger jsonb}` nella migration 1xxx_
  di BRIDGE; `bridge_status` deve avere `last_heartbeat_at timestamptz`. /api/health legge questi due campi.
- [12:48] BRIDGE → FONDAMENTA: **migration pronte**: `1001_bridge_ontology.sql` (ontology_versions, places, skills con `sposta`/`piu_piano`/`piu_veloce`, tools, workspace, seed tutto draft) e `1002_bridge_runtime.sql` (commands, events, bridge_status con `last_heartbeat_at` e `velocita_mm_s`, guard_status come proposto). Parse SQL verificato con pglast, non ancora su un DB vero. Aggiungi `places` alla lista di sola lettura di `fondamenta_harden()`. ✔ risponde anche alla tua [12:47] su guard_status.
- [12:48] BRIDGE → CONSOLE: `commands`, `events`, `bridge_status`, `guard_status` li crea BRIDGE in `1002_` (colonne = campi di contracts-v1). A te in `2xxx_`: routines, routine_runs, bindings, observations, proposals e le view `v_*`. Per la rilettura di `sposta` la velocità corrente è `bridge_status.velocita_mm_s`; `bridge/motion.py::readback` è la versione di riferimento della frase (stessi test in TS). `piu_piano`/`piu_veloce` sono command come gli altri: li esegue il bridge e scrive un event `speed_change`.
- [12:53] BRIDGE → BRACCIO, CONSOLE: risposta sulla serie CS: **`jbi` non si rinomina** (sarebbe un contracts-v2 mentre CONSOLE scrive zod). Su CS contiene il nome del task sul controller (`.task`), su EC il nome del JBI. ✔ 12:53
- [12:53] BRIDGE → CONSOLE: il composer (`bridge/composer.py`) legge queste colonne, mettetele nella vostra `2xxx_`: `routines {id, name, version, parent_version, edited_from_version, steps jsonb, taught_by_voice, source_utterance, status draft|active|deprecated}`; `routine_runs {id uuid, routine_name, routine_version int null (null = l'active), repetitions int default 1, status confirmed|running|done|failed|cancelled, confirmed_at, started_at, finished_at, current_step, current_repetition, cycle_time_ms}`. Il web crea il run già `confirmed` con `confirmed_at` dopo il "sì" (il bridge lo scarta se ha più di 30 s). `attendi_operatore`: il bridge scrive `feedback {awaiting: true, prompt}`; il web risponde con un event `feedback` dello stesso `routine_run_id` e payload `{done: true}` o `{text: "fatto"}`. Fine ciclo: event `step_end` con `{cycle: true, cycle_time_ms, routine, version}`.

- [12:55] FONDAMENTA → BRIDGE: ✔ `1001_bridge_ontology` e `1002_bridge_runtime` applicate. `list_migrations` = file del repo
  (0001, 1001, 1002, 9001, 9002). RLS su 9 tabelle; anon SELECT ok su skills, INSERT su commands/events e UPDATE su skills
  rifiutate (HTTP 401, 42501). Realtime: events, commands, bridge_status, guard_status. Advisors security: 0. `places` ora
  leggibile da anon (9002). Bridge e audio_guard scrivono con la service role.
- [12:55] FONDAMENTA → CONSOLE: le view `v_*` vengono messe a `security_invoker` e rese leggibili ad anon da
  `fondamenta_harden()`; tabelle che la console deve leggere da anon e che non sono in lista (es. `routine_runs`,
  `bindings`): chiedetele qui. Quando le 2xxx_ sono su main scrivete "migration pronte".

- [13:25] CONSOLE → FONDAMENTA: **migration pronte**: `2001_console.sql` (routines, routine_runs, bindings, observations, proposals; view `v_cycle_stats`, `v_shift_summary`, `v_ontology_status`, tutte `security_invoker`). Provata due volte su Postgres 16 locale con `fondamenta_harden()`: anon legge `v_ontology_status` ma **non** `v_cycle_stats` né `v_shift_summary` (`permission denied for table routine_runs`). Aggiungi `routine_runs` e `bindings` alla lista di sola lettura di `fondamenta_harden()`.
- [13:25] CONSOLE → FONDAMENTA / umano: su Vercel servono `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `XAI_API_KEY`, `XAI_VOICE_MODEL=grok-voice-3.0`, `CONSOLE_PASSPHRASE` (senza, in produzione `/console` risponde 503: fail-closed), `BRIDGE_ID`. Root directory `web`.
- [13:00] FONDAMENTA → CONSOLE: ✔ `2001_console` applicata + `9003` (anon legge anche `routine_runs` e `bindings`, che le view
  con security_invoker usano). `list_migrations` = repo (7/7). Anon: `v_cycle_stats`, `v_shift_summary`, `v_ontology_status`
  rispondono 200; INSERT su proposals/routines rifiutata (401). Realtime: bridge_status, commands, events, guard_status,
  proposals. Advisors security: 0.

- [13:50] CONSOLE → FONDAMENTA: **migration pronte**: `2002_console_runs_align.sql` (routine_runs come chiede il composer: `routine_version` null, stato `confirmed`, `finished_at`, `current_step`, `current_repetition`; `v_cycle_stats` e `v_shift_summary` contano i cicli dagli event `step_end {cycle: true}`). Provata due volte su Postgres 16 dopo 0001…9003 nell'ordine del DB. Stesse colonne nelle view.
- [13:50] CONSOLE → BRIDGE: ✔ alla tua [12:53] con la `2002_` (appena FONDAMENTA la applica). `ended_at` diventa `finished_at`.
- [13:03] FONDAMENTA → CONSOLE, BRIDGE: ✔ `2002_console_runs_align` applicata + `9004`. DB = repo (9/9); `v_cycle_stats` e
  `v_shift_summary` 200 per anon; INSERT anon su routine_runs rifiutata (401); advisors security 0.

- [14:05] CONSOLE → FONDAMENTA / umano: **il progetto Vercel `gergoai` (team KVA) risponde 404 su tutto**, compresi `/console` e `/api/health`: `framework: null` e Root Directory non impostata, quindi costruisce la root della repo. Da impostare: Root Directory = `web`, Framework = Next.js, Node 22.x (ora è 26.x), poi redeploy. `gergoai.vercel.app` è pubblico (SSO solo sugli URL di deployment): `/console` è comunque dietro `CONSOLE_PASSPHRASE`.
- [13:22] FONDAMENTA → tutti: **Vercel serve /web** su `https://gergoai.vercel.app` (Next, commit 907a568). `/api/health`:
  `supabase.ok=true` (465 ms), `bridge_status` e `guard_status` presenti ma vuote (bridge e audio_guard non girano),
  env presenti tranne `CONSOLE_PASSPHRASE` e `XAI_EVAL_MODEL` → oggi risponde 503 "down" finché manca la passphrase.
  CONSOLE: la console e `/api/tools` restano 503 fino ad allora (fail-closed, corretto).
- [13:22] FONDAMENTA → BRACCIO: audio_guard ha `--bridge-id` di default `gergo-1`; il bridge usa `pavia-postazione-1`.
  In `bridge/.env.example` c'è ora `GERGO_BRIDGE_ID=pavia-postazione-1`: o lo leggete da lì o cambiate il default,
  altrimenti `guard_status` ha una riga che bridge e /api/health non guardano.
- [13:30] FONDAMENTA → BRACCIO (da Federico): SDK Python ufficiale CS, https://github.com/Elite-Robots/Elite_Robots_CS_SDK_Python
  (v1.0.0 del 21/07/2026, binding pybind11 dell'SDK C++ 1.4.7; controller ≥ 2.13.4 o ≥ 2.14.2). Letto da FONDAMENTA:
  - **Unità confermate:** `examples/example_trajectory.py:171-176` legge `rtsi.getActualTCPPose()` e fa `target_pose[2] -= 0.2`
    per scendere di 20 cm → pose in **metri** + rad, come avete già in `ELITE_NOTES.md` `[verificato: SDK Python]`.
  - **Cinematica ufficiale:** `examples/example_kinematics.py` legge gli MDH dalla Primary, i giunti e il TCP da RTSI e fa
    FK/IK con il plugin KDL (`KinematicsBase.forward/inverse`). Utile come **controprova** della vostra FK MDH allo slot
    (Round 2, BRACCIO punto 2): se la vostra e la loro non coincidono con la posa RTSI, fa fede la loro.
  - Dashboard: `stopProgram`, `pauseProgram`, `playProgram`, `unlockProtectiveStop` (quest'ultimo resta FUORI whitelist).
  - Non c'è un wheel su PyPI: si compila con CMake (`doc/BuildGuide`, target `python_wheel`). **Consiglio: non migrare ora**
    il transport stdlib che avete; usatelo solo come riferimento o controprova sul laptop, se compila in < 10 min.

---

## Round 2 (13:20) — verifica dell'integrazione e cosa manca

Verifica fatta da fuori sui file di `main` al commit `52fc4ef`: Python bridge 89, sdk 48, safety 18, eval 23 test
verdi; web 77 test verdi e `next build` ok; nessun segreto nella storia git. Ma la demo end to end non gira ancora:

| # | Buco | Effetto | Chi |
|---|---|---|---|
| 1 | Vercel: Root Directory non è `web`, mancano le env, Node 26 | l'URL risponde 404; voce e console non si provano online | **umano** (MCP in sola lettura) |
| 2 | La repo è **privata** | la consegna richiede una repo pubblica | **umano**, entro le 15:30 |
| 3 | `bridge.main --mode elite` usa ancora `DryRunElite`, non `EliteCsAdapter` (richiesta delle 13:10 aperta) | al braccio non parte niente | BRIDGE |
| 4 | Nessun `requirements.txt` (manca per esempio `jsonschema`) | sul laptop del bridge i test non partono | BRIDGE |
| 5 | Nessuno dice ad audio_guard che il braccio si muove (`set_moving`; richiesta delle 13:00 aperta) | lo sfregamento non scatta mai | BRIDGE + BRACCIO |
| 6 | `eval/results/` è vuota: B e C richiedono la chiave xAI e il nome del modello | niente "risultato contro baseline" | FONDAMENTA |
| 7 | Mancano `README.md` e `CLAUDE.md` | requisito di consegna | FONDAMENTA |
| 8 | Al braccio non c'è ancora stato niente: IP, remote, unità di `movel`, cinematica MDH mai confrontata col controller | il movimento relativo su CS non è provato | BRACCIO, allo slot |
| 9 | Tag `contracts-v1` non pushato (403 dal cloud) | solo tracciabilità | umano, 1 comando |

### Round 2 — compiti

**BRIDGE**
1. In `--mode elite` usa `EliteCsAdapter(host, mode)` da `bridge/adapters/elite.py`, con env `ELITE_HOST`,
   `ELITE_MODE` e `GERGO_GUARD_HEARTBEAT`. Test con il mock CS di `gergo_sdk.mock`.
2. Nella root un `requirements.txt` per bridge, safety ed eval (pydantic, jsonschema, numpy, il client Supabase che
   usate, vosk, sounddevice) e `pip install -e sdk`. Il comando di setup va in `bridge/README` o in Richieste per il
   README.
3. Il segnale "in movimento" ad audio_guard: il bridge tocca un file `GERGO_MOVING` (o scrive su
   `guard_status.moving`) a ogni step_start e step_end; audio_guard lo legge. Concorda il dettaglio con BRACCIO in
   Richieste. Chiudi anche la richiesta sul `failsafe` nel contratto.
4. `bridge/.env.example`: `ELITE_SERIES=CS`, `ELITE_DASHBOARD_PORT=29999`.
5. Check: con `bridge/.env` sul DB vero, un command creato da `/api/tools` (CONSOLE) viene eseguito in sim e
   l'event compare in console in meno di 2 s. Riporta l'output.

**CONSOLE**
1. Appena Vercel serve `/web`: `/console/probe` con 10 frasi dal vivo (kill criterion di P0) e risultati in
   Richieste e in `/shared/xai-notes.md`.
2. Prova end to end sull'URL Vercel con il bridge in sim (`--mode sim`, DB vero): insegna "frontale", due cicli, un
   "è storta", una proposta approvata, il resoconto. Annota cosa si rompe e correggi.
3. Modalità demo: una vista pulita della console da registrare per il video (font grandi, pannello sicurezza e
   tempo di ciclo v1 contro v2 ben visibili).

**FONDAMENTA**
1. Appena l'umano sistema Vercel: `/api/health` verde sull'URL di produzione, risultato in Richieste.
2. Eval: chiedimi `XAI_API_KEY` (solo in env, mai su file) e il modello; lancia `--split test --conditions
   A,B,C`, committa `eval/results/*` e passa la tabella in Richieste. Senza chiave entro le 14:15: si pubblica
   la condizione A più il dry-run, dichiarato come tale.
3. `README.md` (cos'è; come si esegue da zero: console, bridge in sim, audio_guard, eval; dati; tabella A/B/C;
   limiti presi da HACK.md e MOTION_SAFETY.md) e `CLAUDE.md` (PLAN.md §5). README in bozza entro le 14:30, finale
   al freeze delle 15:00.
4. 15:00: deploy di produzione, segreti nella storia git, saldo xAI.

**BRACCIO** — slot al braccio, in quest'ordine, con l'ok di Federico a ogni movimento:
1. `python -m gergo_sdk.probe` read-only: versione, robotMode, safety, TCP, MDH.
2. **Verifica della cinematica:** la FK dei giunti letti con gli MDH del controller deve coincidere con la posa TCP
   letta da RTSI entro 1 mm e 0,01 rad. Se non coincide, il controllo di linea su CS non vale e il movimento
   relativo si taglia.
3. Unità di `movel`: un "su di 1 cm" a 10 mm/s. Lo spostamento misurato fissa metri o millimetri; poi "avanti di
   1 cm" per `frame.json`. Decisione entro le 13:45.
4. **Stop durante uno script:** un `movel` lento di 5 cm a 10 mm/s, poi si dice "stop". Verifica che `stop` della
   Dashboard fermi anche uno script inviato sulla 30001, e misura la latenza dal suono allo stop. Se lo script non si
   ferma, il movimento relativo si taglia.
5. Taratura di audio_guard (30 s di sala, 30 s di braccio in moto), nomi dei task in `elite_tasks.json`,
   `time_tasks` per le durate del SimArm.
6. Al secondo slot (~14:30): flusso completo per il video (shot list di PLAN.md P6).

### Ordine di taglio aggiornato
Se alle 13:45 i punti 2–4 di BRACCIO non sono verdi: il movimento relativo resta solo in sim (dichiarato), e al
braccio vero la demo usa i task insegnati via Dashboard più l'arresto vocale e acustico.

## Prompt di kick-off

Ogni orchestratore riceve l'intestazione comune più il suo blocco.

### Intestazione comune

```text
Sei l'orchestratore del cantiere <NOME> di Gergo (hackathon Grok, Pavia, consegna alle 16:00 del 05/11/2026).
Repo: kakashi-ventures/gergoAI, branch main. Prima di tutto: git pull --rebase origin main, poi leggi CANTIERI.md,
MOTION_SAFETY.md, DEPLOY.md, PLAN.md e HACK.md. CANTIERI.md è vincolante: scrivi solo nelle cartelle del tuo
cantiere, coordina gli altri via "Richieste", aggiorna solo la tua riga di stato a ogni milestone, e rispetta le
regole di sicurezza. MOTION_SAFETY.md vince su DEPLOY.md in caso di contrasto.
Puoi usare subagenti per lavori indipendenti dentro le tue cartelle; tu resti responsabile di commit, push e
check. Una cosa funzionante end to end batte cinque a metà: se un pezzo sfora l'orario, taglialo seguendo l'ordine
di taglio di MOTION_SAFETY.md §5 e segnalalo. Prima di dire "fatto" esegui il check di accettazione e riportane
l'output.
```

### 1 · FONDAMENTA

```text
Compito: DEPLOY.md prompt 3 (Vercel env e Supabase), poi /eval. Sei il cantiere che sblocca gli altri.
1) Subito: progetto Supabase (chiedimi conferma prima di crearlo), poi env Vercel con i nomi del prompt 3 più
   ELITE_HOST, ELITE_PORT e ELITE_SERIES in bridge/.env.example. Scrivi "DB online" nella tua riga di stato.
2) Progetto Vercel con root directory web, appena CONSOLE pusha /web.
3) Ogni 20 minuti, o quando qualcuno scrive "migration pronte": pull, applica le migration nuove in ordine,
   list_migrations contro i file, prova di RLS (INSERT anon rifiutata), tabelle nella publication realtime,
   get_advisors. Rispondi in Richieste con l'esito.
4) /api/health: presenza delle env (non i valori), ping a Supabase, età dell'ultimo heartbeat di bridge_status
   e di audio_guard.
5) /eval (P5 di PLAN.md): checkset.jsonl con 30 comandi, split 10/20, inclusi 6 comandi di movimento relativo
   ("scendi di 10 centimetri", "un po' più a destra", "più piano"). eval/run.py: A parole chiave, B Grok senza
   memoria, C Grok con memoria; accuratezza su skill e parametri, turni di chiarimento, esecuzioni senza conferma
   (devono essere 0), movimenti fuori geofence accettati (devono essere 0). Risultati in eval/results/*.json,
   tabelle in Richieste per il README.
6) Alle 15:00: deploy di produzione, controllo dei segreti in tutta la storia git, saldo xAI (chiedimelo).
```

### 2 · BRIDGE

```text
Compito: DEPLOY.md prompt 1, più i contratti e le regole di MOTION_SAFETY.md §2 e §3. Gli altri dipendono dai
tuoi contratti.
1) Entro le 13:00: /shared con i contratti del prompt 1 più:
   - skill "sposta": params {direzione: su|giu|avanti|indietro|destra|sinistra, quantita: number|null,
     unita: mm|cm|null, intensita: poco|un_po|tanto|null}. Mai coordinate nei params;
   - stato di sessione velocita_mm_s, comandi "piu_piano" e "piu_veloce";
   - Tool {nome, tcp_atteso_mm}, Workspace {frame, min_mm[3], max_mm[3]};
   - event type in più: "safety_trigger" con payload {trigger: parola|botta|urlo|sfregamento|heartbeat,
     latency_ms, features}, e "motion_check" con l'esito della geofence e del controllo di cinematica.
   Pydantic, fixtures valide e non valide, test. Commit, push, tag contracts-v1, avviso in Richieste.
2) Migration 1xxx_ (ontology_versions, skills con "sposta", tools, workspace, seed), poi "migration pronte".
3) validator.py: per "sposta" converte l'intento in Δ mm (tabella di MOTION_SAFETY.md §2.1, clamp a 100 mm) e
   verifica la geofence rispetto al workspace e alla posa corrente che riceve dall'adapter. Il controllo di
   cinematica lo fa gergo_sdk.motion (di BRACCIO): definisci l'interfaccia in RobotAdapter (read_pose,
   check_line, move_linear, stop, run_task, status, guard_alive) e pubblicala presto.
4) main.py: rifiuta qualsiasi movimento se guard_alive() è falso da più di 1 s; SimArm simula anche le pose e
   "sposta", così la demo gira in sim. Poi composer.py e deploy_report.py (con la sezione sicurezza: trigger per
   tipo, latenze mediane, movimenti rifiutati dalla geofence).
Ogni modifica ai contratti dopo contracts-v1: schema, pydantic e fixtures nello stesso commit, nuovo tag, avviso.
```

### 3 · CONSOLE

```text
Compito: DEPLOY.md prompt 2, più il tool vocale "sposta" e il pannello sicurezza.
1) Subito: /web (Next.js App Router, TS, Tailwind), /console con dati finti, push (FONDAMENTA collega Vercel).
   Prova della voce di P0: verifica su docs.x.ai il modello Grok Voice, l'italiano, il function calling, gli
   eventi di inizio parlato e i token effimeri; scrivi tutto in /shared/xai-notes.md e decidi tra browser e
   /voice. Kill criterion: meno di 8 frasi su 10 con la function call giusta, o latenza mediana oltre 2,5 s →
   push-to-talk.
2) Con contracts-v1: zod, validator.ts con gli stessi casi di test del Python, migration 2xxx_ e view.
3) Tool Grok "sposta" con parametri SOLO a enum e numero (schema di contracts-v1). Le istruzioni di sistema
   dicono: non inventare quantità; se manca, chiedi o usa "un po'"; rileggi sempre direzione, centimetri e
   velocità e aspetta il "sì". /api/tools/sposta crea il command; la rilettura la scrive il codice, non Grok
   (es. "Scendo di 10 centimetri a 50 millimetri al secondo. Confermi?"). In più "più piano" e "più veloce".
4) Console: pannello sicurezza sempre visibile (audio_guard vivo o morto, ultimo trigger con tipo e latenza,
   heartbeat del bridge), velocità corrente, box di lavoro con la posizione del TCP vista dall'alto, pulsante
   "salva angolo" per insegnare il workspace. Il resto come nel prompt 2.
5) Non dire mai "e-stop vocale" nell'interfaccia: "arresto vocale e acustico".
```

### 4 · BRACCIO

```text
Compito: DEPLOY.md prompt 4, più MOTION_SAFETY.md §1 (serie), §2 (matematica) e §3 (audio_guard).
1) Subito, senza robot: in /sdk il client JSON-RPC EC (whitelist allargata in sola lettura e movimento:
   get_tcp_pose, inverseKinematic, moveByLine, più i metodi del prompt 4) e il mock, che ora risponde anche a
   get_tcp_pose, inverseKinematic e moveByLine con una cinematica finta ma coerente. Restano fuori dalla whitelist
   accensione, servo, freni, reset, payload, TCP e collisione.
2) gergo_sdk.motion, funzioni pure: intento → Δ mm → target nel frame utente → geofence → controllo di cinematica
   su 5 punti (soglie 15° per salto e 1°/mm, come parametri) → velocità. Test con casi limite: fuori box, sotto
   z_min, IK senza soluzione, salto di giunto, rapporto da singolarità, clamp a 100 mm.
3) /safety/audio_guard.py: processo locale con connessione propria al controller (o al mock). Trigger in
   ordine di priorità: parola chiave (Vosk italiano offline, lista chiusa), botta, urlo, sfregamento. Heartbeat
   ogni 250 ms su Supabase; fail-safe se il microfono si scollega. Test con wav iniettati che misurano la latenza
   dal suono allo stop inviato. Kill criterion: mediana oltre 300 ms o più di 1 falso positivo al minuto in sala →
   resta solo la parola chiave.
4) Al primo slot (~13:00), entro 2 minuti: chiedimi il modello sull'etichetta (CS o EC) e scrivilo in
   ELITE_NOTES.md e in Richieste. Se è CS, segui MOTION_SAFETY.md §1: transport Dashboard per i task, e chiedi al
   tecnico il manuale dello script CS (unità di movel, lettura della posa); senza risposte entro le 13:45 il
   movimento relativo su CS si taglia. Poi: probe read-only, TCP e frame utente letti dal controller e confrontati
   con l'ontologia, taratura di audio_guard (30 s di sala, 30 s di braccio in moto), un "su di 1 cm" e un
   "avanti di 1 cm" per verificare frame.json, e solo dopo il mio ok un movimento reale di 10 cm a 20 mm/s.
5) bridge/adapters/elite.py implementa RobotAdapter con il transport giusto.
Mai un comando reale al robot senza mostrarmelo e aspettare il mio ok. L'e-stop è fisico ed è dello staff.
```
