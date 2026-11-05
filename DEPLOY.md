# DEPLOY.md — piano di deploy e 4 prompt per Claude Code · Gergo

Hackathon Pavia · Track 04 · scritto alle ~12:05 del 05/11/2026 · consegna 16:00
Repo: `kakashi-ventures/gergoAI` (pubblica per la consegna).

> Marker come in HACK.md: `[verificato]` · `[dichiarato]` · `[non verificato]`. I dettagli dei protocolli Elite
> del controller EC sono `[verificato: EC_SDK_SocketManual_Ver3.19.2.pdf]`, che è nella repo. IP, versione del
> controller e nomi dei JBI restano `[non verificato]` finché non li conferma lo staff.

---

## Una correzione di architettura, prima dei prompt

**Vercel non modifica gli script Python.** Se il server web potesse riscrivere il codice che muove il braccio,
qualunque bug o prompt injection nella catena voce → Grok → API diventerebbe codice eseguito accanto al robot.
Al suo posto:

- Vercel scrive **dati versionati** su Supabase: ontologia (luoghi, skill, precondizioni), routine con versioni,
  stati di approvazione (`draft → confirmed → deprecated`), comandi confermati.
- Il bridge Python **legge** quei dati, li **rivalida in locale** con lo stesso validatore (doppio controllo) e
  rifiuta tutto ciò che non è in whitelist o che si riferisce a un'ontologia non confermata.
- "Approvare / modificare / deprecare un movimento" = cambiare lo stato o creare una nuova versione di una riga,
  mai un file `.py`. Le primitive fisiche restano i task insegnati sul pendant.

Il risultato funzionale è lo stesso che chiedevi; il rischio no.

## Ordine di esecuzione

```
12:05  Prompt 3  env Vercel + Supabase            (una sessione, 15 min — sblocca tutto il resto)
12:20  Prompt 1  base Python + bridge + composer  ‖  Prompt 2  web app voice control
13:00  Prompt 4  SDK verso il controller Elite EC  (subito contro il mock; al 1° slot si collega al robot)
15:00  Freeze → `python -m bridge.deploy_report`  → report allegato alla consegna
```

Regola comune: ogni sessione tocca solo le sue cartelle, `git pull --rebase` prima di ogni push, `/shared` lo
cambia solo la sessione del prompt 1.

---

## Prompt 1 — Base Python, bridge, ontologia confermabile, report di deploy

Cartelle: `/bridge`, `/shared`, `/supabase/migrations` (solo le tabelle dell'ontologia).

```text
Leggi PLAN.md, HACK.md e DEPLOY.md (sezione "correzione di architettura"). Lavori su /bridge, /shared e
/supabase/migrations. Python 3.11, pydantic v2, supabase-py, pytest. Niente codice generato o modificato a
runtime: tutto ciò che cambia dal web sono righe versionate su Supabase.

1) Contratti in /shared (sono la verità): schemas/*.json per Place, Skill, OntologyVersion, Binding, Routine,
   Command, Event, Observation, Proposal (sezione 3 di PLAN.md) più:
   - Skill: { name, kind: "primitive"|"composite", params_schema, preconditions[], effects[],
     jbi: "solleva_INGRESSO" | null  (nome del file JBI sul controller EC), status: "draft"|"confirmed"|"deprecated",
     confirmed_by, confirmed_at, sim_ok: bool, real_ok: bool }
   - OntologyVersion: { version, places[], skills[], status: "draft"|"confirmed", confirmed_by, confirmed_at }
   - Routine: aggiungi status "draft"|"active"|"deprecated" e "edited_from_version".
   fixtures/*.json validi e non validi; /bridge/contracts.py con i modelli pydantic; test che validano le fixtures.

2) Migration Supabase per ontology_versions e skills con quegli stati, seed della postazione di etichettatura
   (luoghi INGRESSO, STAZIONE, USCITA, SCARTI, HOME; primitive solleva, deposita, porta, applica, home, stop),
   tutte in status "draft". Regola: una skill passa a "confirmed" solo se sim_ok = true e un umano conferma;
   real_ok si imposta solo dal bridge dopo un step_end ok in mode elite.

3) /bridge/validator.py: stesso validatore della route web (precondizioni ed effetti sullo stato della
   postazione: forchetta libera/occupata, applica solo in STAZIONE, luoghi esistenti). Il bridge rivalida OGNI
   command prima di eseguirlo e rifiuta se: la skill non è "confirmed" (in mode elite) o non è almeno "draft"
   (in mode sim), l'ontologia attiva non è "confirmed" (in mode elite), manca confirmed_at, il comando è più
   vecchio di 30 s. Ogni rifiuto scrive un event di tipo "anomaly" con il motivo.

4) /bridge/main.py: `python -m bridge.main --mode sim|elite [--inject slow:applica|fail:solleva] [--dry-run]`.
   Sottoscrive i command con status=confirmed (Supabase realtime, fallback polling 500 ms), uno alla volta con
   timeout per skill, scrive step_start / step_end con duration_ms, heartbeat ogni 2 s in bridge_status
   (mode, ontology_version, adapter, last_command_id). Tasto `s` = STOP: cancella la coda, chiama adapter.stop().
   L'adapter è un'interfaccia (RobotAdapter: connect, run_primitive, stop, status) — sim qui, elite arriva dal
   prompt 4: per ora un adapter elite finto che fa solo dry-run e stampa il comando.

5) /bridge/composer.py: riceve il trigger esegui_routine (un routine_run creato dal web dopo la conferma
   vocale), espande la routine attiva nei suoi steps, gestisce attendi_operatore (event "feedback" in attesa
   di "fatto"), accoda i command uno per volta, e a fine ciclo scrive cycle_time_ms. Mai più di un command
   in "running".

6) /bridge/deploy_report.py: `python -m bridge.deploy_report --since "2026-11-05T12:00" --out reports/`
   Compone il report finale della sessione di deploy in produzione, SOLO da fonti verificabili:
   - git: commit corrente, branch, tag, numero di commit della sessione;
   - Vercel: URL di produzione e id del deployment (da env VERCEL_DEPLOY_URL o argomento);
   - Supabase: ontologia attiva (versione, skill confermate/deprecate, chi e quando), routine e versioni,
     cicli per routine e versione, tempo medio di ciclo v1 vs v2, stop, anomalie, rifiuti del validatore,
     proposte approvate/rifiutate/revertite con before/after, binding promossi a CANONICAL;
   - eval/results/*.json se esistono (tabelle A/B/C).
   Output: reports/deploy-<timestamp>.md e .json con gli stessi numeri. Ogni numero porta la query che lo ha
   prodotto (in appendice). Opzionale `--narrate`: passa i numeri a Grok (XAI_API_KEY) per 3 frasi di sintesi,
   messe in un box separato e marcate "testo generato"; Grok non calcola nulla.
   Sezione "Limiti noti" copiata da HACK.md. Test: con un DB di fixture il report contiene esattamente i numeri
   attesi.

Check di accettazione (riporta l'output): pytest verde; `python -m bridge.main --mode sim` esegue un command
confermato inserito a mano e scrive step_end; un command con skill "deprecated" viene rifiutato con un event
anomaly; `python -m bridge.deploy_report --since ...` produce md+json. Poi commit e push.
```

---

## Prompt 2 — Web app voice control

Cartelle: `/web`, `/supabase/migrations` (tabelle della console). Next.js App Router + TS + Tailwind su Vercel.

```text
Leggi PLAN.md, HACK.md, DEPLOY.md e i contratti in /shared (non li modifichi: se serve un campo, lo chiedi alla
sessione del bridge). Lavori su /web e sulle migration delle tabelle commands, events, routines, routine_runs,
bindings, observations, proposals, bridge_status (se non esistono già).

1) /web/lib/contracts.ts: schemi zod generati a mano dagli stessi JSON di /shared, con test che valida le
   fixtures. /web/lib/validator.ts: stesso validatore del bridge (stessi test, stesse fixtures).

2) Route /api/tools/* (runtime Node, service role solo lato server): propone_azione, conferma, stop,
   definisci_routine, esegui_routine, definisci_alias, approva_proposta, resoconto, e per l'ontologia:
   conferma_skill, depreca_skill, modifica_routine (crea nuova versione, mai sovrascrive). Ogni route valida
   input con zod, passa dal validatore, scrive un event, restituisce la frase da dire. Nessuna route esegue
   movimenti: crea righe che il bridge legge.

3) Client voce: segui la decisione di P0 in /shared/xai-notes.md. Se ci sono token effimeri, /api/voice/token
   li emette (XAI_API_KEY solo server) e il browser apre la sessione realtime; altrimenti la console mostra solo
   lo stato e la voce gira dal client locale. Istruzioni di sistema: italiano, frasi brevi, conferma prima di ogni
   movimento, mai coordinate. Inizio parlato durante un movimento → chiama stop.

4) /console, una pagina a colonne, aggiornata in realtime (Supabase Realtime, fallback polling 1 s):
   - Header fisso: stato bridge (heartbeat < 5 s = verde), mode sim/elite, versione ontologia, pulsante STOP
     grande sempre visibile (anche da tastiera: barra spaziatrice).
   - Lista comandi: le skill della postazione con stato draft/confirmed/deprecated, precondizioni, JBI Elite
     associato, sim_ok/real_ok. Azioni: Conferma (solo se sim_ok), Modifica (apre gli steps/parametri, salva come
     nuova versione), Depreca (con motivo). Ogni azione chiede una seconda conferma e scrive un event.
   - Routine: versioni con diff tra versioni, stato, chi le ha insegnate (source_utterance).
   - Comando in attesa: cosa farà il braccio, in italiano, con Conferma/Annulla.
   - Registro del cobot: timeline degli events filtrabile per tipo, routine, versione; ogni riga mostra
     duration_ms, ok, testo. È la fonte unica del resoconto e del report di deploy: niente numeri calcolati nel
     client, solo letti da view SQL (crea le view v_cycle_stats, v_shift_summary, v_ontology_status).
   - Osservazioni e proposte: "Ho notato che…", before/after, Approva/Rifiuta.
   - Resoconto: numeri dalla view accanto alle 3 frasi di Grok.
   - /console/report: anteprima del report di deploy (stessi numeri di bridge/deploy_report.py, letti dalle
     stesse view), con pulsante "scarica JSON".

5) Auth minima: una passphrase di postazione (env CONSOLE_PASSPHRASE) in un cookie httpOnly, controllata in
   middleware sulle route /api/tools e /console. Niente login utenti.

Check di accettazione (riporta l'output): build Next verde, test zod+validator verdi; sull'URL di preview Vercel
confermo una skill, ne depreco un'altra, creo un command dalla console e lo vedo comparire nel registro entro
2 s quando il bridge in sim lo esegue. Poi commit e push.
```

---

## Prompt 3 — Vercel env e Supabase

Si può far fare a Claude Code con gli MCP di Vercel e Supabase già collegati; i passi che richiedono un umano
sono marcati 👤.

```text
Leggi DEPLOY.md. Configura Supabase e Vercel per kakashi-ventures/gergoAI. Usa gli MCP Supabase e Vercel
se disponibili, altrimenti la CLI. Non stampare mai il valore di una chiave segreta: verificane solo la presenza.

Supabase
1) Crea il progetto "gergo-pavia" (regione EU, Frankfurt), o usa quello esistente se c'è già: prima elenca i
   progetti e chiedimi conferma prima di crearne uno (ha un costo).
2) Applica le migration in /supabase/migrations nell'ordine del repo. Il DB non è il repo: dopo averle applicate,
   list_migrations e confronta con i file. Se mancano, fermati e dimmelo.
3) RLS attiva su tutte le tabelle. Policy: il ruolo anon può solo SELECT su events, commands, bridge_status,
   skills, routines, observations, proposals e sulle view v_* (serve al realtime della console); nessuna
   INSERT/UPDATE/DELETE per anon. Tutte le scritture passano dalle route server con la service role, o dal bridge.
   Verifica che policy e permessi dell'app coincidano: prova una INSERT con la chiave anon e mostrami che fallisce.
4) Realtime: aggiungi events, commands, bridge_status, proposals alla publication supabase_realtime.
5) Esegui get_advisors (security e performance) e riportami i risultati.

Vercel
6) Crea o collega il progetto "gergo" al repo, Root Directory = web, framework Next.js, Node 20.
7) Env (Production e Preview; Development solo in .env.local, mai committato):
   - NEXT_PUBLIC_SUPABASE_URL           pubblica
   - NEXT_PUBLIC_SUPABASE_ANON_KEY      pubblica (publishable/anon)
   - SUPABASE_SERVICE_ROLE_KEY          segreta, solo server
   - XAI_API_KEY                        segreta, solo server
   - XAI_VOICE_MODEL                    il nome del modello da /shared/xai-notes.md (non inventarlo)
   - CONSOLE_PASSPHRASE                 segreta
   - BRIDGE_ID                          "pavia-postazione-1"
   Controlla che nessuna variabile segreta abbia il prefisso NEXT_PUBLIC_.
8) .env.example nella root con tutti i nomi e nessun valore; .gitignore con .env* tranne .env.example;
   /bridge/.env.example con SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BRIDGE_ID, ELITE_HOST,
   ELITE_PORT=8055, ELITE_MODE=dry-run.
9) Deploy di preview, poi apri /api/health (creala se manca: risponde con presenza delle env, non i valori, e
   ping a Supabase). Riporta l'URL e l'output.

Check: advisors senza errori critici, INSERT anon rifiutata, /api/health verde sull'URL di preview.
```

**👤 Lavoro umano (5 minuti):**
1. Incollare `XAI_API_KEY` e `SUPABASE_SERVICE_ROLE_KEY` nella dashboard Vercel se l'MCP non può leggerle.
2. Controllare il saldo xAI ora e alle 15:00 (la fatturazione del fornitore si spegne in silenzio).
3. Sul laptop del bridge: `cp bridge/.env.example bridge/.env` e compilare a mano.
4. Se una chiave finisce in un commit: ruotarla subito, non a fine giornata.

---

## Prompt 4 — SDK tra composer e il software che controlla il cobot Elite (serie EC)

Cartelle: `/sdk` (pacchetto Python `gergo_sdk`) e `/bridge/adapters/elite.py`. Si scrive **subito contro il mock**;
al primo slot braccio si collega al robot, con lo staff accanto.

### Cosa dice il manuale

Fonte primaria: `EC_SDK_SocketManual_Ver3.19.2.pdf` nella repo ("ELITE ROBOTS EC Series · SDK-Socket Script
Manual", Ver3.19.2, 15/01/2025). Si applica al software del controller Ver3.19.2; il JSON-RPC funziona dalla 2.13.0
in su. Pagine citate tra parentesi.

- `[verificato: manuale EC]` **Porte** (p. 1): **8055** è l'interfaccia di controllo (JSON-RPC 2.0); **8056** è il
  monitor, binario a pacchetti da 1024 byte, connessione lunga che va letta entro 8 ms o si riempie il buffer. La 8056
  non ci serve: lo stato si legge in polling sulla 8055.
- `[verificato: manuale EC]` **Formato** (p. 2–3): si invia `{"jsonrpc":"2.0","method":"<nome>","params":{…}|[],"id":n}`
  terminato da `\n`, e anche la risposta termina con `\n`. Risposta `{"jsonrpc":"2.0","result":"<stringa JSON>","id":n}`:
  `result` è a sua volta una stringa da decodificare con `json.loads`. Errori: `-32601` metodo non trovato
  (nome sbagliato o versione che non lo supporta), `-32693` parametri o condizioni non soddisfatti. L'esempio
  ufficiale fa `recv(1024)`: noi leggiamo fino al `\n`.
- `[verificato: manuale EC]` **I task sono file JBI** creati sul pendant: è il nostro "una primitiva = un task insegnato".

| Uso | Metodo | Ritorno | Note |
|---|---|---|---|
| modalità | `getRobotMode` | 0 teach · 1 play · **2 remote** | p. 8 |
| stato | `getRobotState` | 0 stop · 1 pausa · 2 e-stop · 3 running · 4 allarme · 5 collisione | lo stato e-stop dura poco e diventa subito "allarme" (p. 7) |
| e-stop | `get_estop_status` | 1 / 0 | p. 41 |
| collisione | `getCollisionState` | 1 / 0 | p. 19 |
| servo | `getServoStatus` · `getMotorStatus` | bool · bool (encoder sincronizzati) | p. 5–7 |
| potenza | `get_robot_power_status` | 0 spento · 1 in accensione · 2 acceso | dalla V3.12.2 |
| versione | `getSoftVersion` | stringa | p. 113 |
| esiste il task | `checkJbiExist {filename}` | 0 / 1 | p. 78 |
| **esegui il task** | `runJbi {filename}` | bool | **solo in remote**; il robot deve essere fermo, altrimenti prima `stop` e attesa (p. 78) |
| stato del task | `getJbiState` | `jbiName`, `runState` 0 stop · 1 pausa · 2 e-stop · 3 running · 4 errore | p. 79 |
| **ferma** | `stop` | bool | solo in remote (p. 76) |
| pausa / riprendi | `pause` · `run` | bool | solo in remote (p. 77) |
| velocità | `getSpeed` · `setSpeed {value}` [0.05, 100] | | `setSpeed` solo in remote |

- **Esclusi apposta** (li fa una persona dal pendant, oppure sono movimenti liberi): `moveByJoint`, `moveByLine`,
  `moveByArc`, `moveByRotate`, `addPathPoint`, `moveByPath`, `jog`, `moveBySpeedj`/`moveBySpeedl`, il
  transparent transmission (servo), `set_servo_status`, `set_robot_power_status`, `clearAlarm`,
  `resetCollisionState`, `syncMotorStatus`, `setSysVar*` e la scrittura di variabili, payload, TCP, sistemi di
  coordinate, parametri di sicurezza, `setSpeed`.
- `[non verificato]` Da chiedere allo staff: versione del controller (`getSoftVersion` la legge anche il probe),
  IP del robot e se la rete del laptop lo raggiunge, chi mette il pendant in **remote** (si fa dal pendant, non da
  software), i nomi dei JBI da creare per le primitive, e se c'è un'unica velocità di sicurezza già impostata.
- Ripiego se il braccio in sala fosse della **serie CS**: la CS non usa questo protocollo ma la Dashboard Shell
  testuale su TCP 29999 (`task -p`, `play`, `stop`, `task -s`) dell'SDK ufficiale C++
  [Elite_Robots_CS_SDK](https://github.com/Elite-Robots/Elite_Robots_CS_SDK) v1.5.0, CS Controller ≥ 2.15.0
  `[verificato: SDK CS]`. Stessa interfaccia RobotAdapter, un transport diverso.

### Il prompt

```text
Leggi DEPLOY.md (sezione "Cosa dice il manuale" del prompt 4) ed EC_SDK_SocketManual_Ver3.19.2.pdf nella root
(pdftotext -layout): è la fonte, cita le pagine nei docstring. Leggi /bridge (interfaccia RobotAdapter, composer,
validator). Scrivi /sdk come pacchetto Python installabile (`pip install -e sdk`), chiamato gergo_sdk: solo
standard library più pydantic. È l'unico punto di contatto tra il composer, che riceve i trigger del voice control
via Supabase, e il controller del cobot Elite EC.

0) Prima del codice chiedimi: serie (EC, confermata dall'etichetta o dal pendant), IP, nomi dei JBI delle
   primitive. Scrivi le risposte in /sdk/ELITE_NOTES.md con fonte e ora. Se la serie è CS, fermati: vale il
   ripiego in DEPLOY.md.

1) gergo_sdk.jsonrpc.EcClient: socket TCP sulla 8055. call(method, params=None) invia
   {"jsonrpc":"2.0","method":…,"params":params or [],"id":n} + "\n" con id crescente, legge fino al "\n", verifica
   che l'id coincida, decodifica result con json.loads e su "error" solleva EcError(code, message): -32601
   MethodNotFound, -32693 ConditionNotMet. Timeout di connessione 3 s, di risposta 2 s, un solo comando in volo
   (lock), reconnect con backoff. Ogni riga inviata e ricevuta finisce in /bridge/logs/elite-<data>.log.
   Whitelist dei metodi in un frozenset: getRobotMode, getRobotState, get_estop_status, getCollisionState,
   getServoStatus, getMotorStatus, get_robot_power_status, getSoftVersion, getSpeed, checkJbiExist, runJbi,
   getJbiState, stop, pause, run. call() rifiuta qualsiasi altro nome prima di aprire il socket, e c'è un test
   che lo prova con moveByJoint, setSpeed e set_servo_status.

2) gergo_sdk.protocol: PrimitiveRequest {command_id, skill, params, jbi, timeout_s} e PrimitiveResult
   {command_id, ok, duration_ms, error, robot_mode, robot_state, jbi_state}. jbi deve stare nella mappa
   skill+luogo → nome JBI in /shared/fixtures/elite_jbi.json, che compiliamo con lo staff; nessun altro
   nome è accettato.

3) gergo_sdk.elite.EliteController.run_primitive(req):
   preflight: getRobotMode == 2 (remote) · getRobotState == 0 (stop) · get_estop_status == 0 ·
   getCollisionState == 0 · getServoStatus == true · getMotorStatus == true · checkJbiExist(jbi) == 1.
   Se un controllo fallisce: nessun runJbi, PrimitiveResult ok=false col motivo leggibile in italiano.
   Poi runJbi(jbi) → polling ogni 100 ms di getJbiState e getRobotState: fine = runState 0 con jbiName == jbi
   dopo aver visto almeno un 3; errore = runState 2 o 4, oppure robotState 2, 4 o 5; timeout = timeout_s.
   Su errore o timeout: stop, poi ok=false. stop() chiama "stop" subito, senza preflight né conferme, anche
   durante un runJbi, con una connessione propria se quella principale è occupata. Non chiama mai clearAlarm né
   resetCollisionState: un allarme lo risolve una persona dal pendant.
   Modalità: "dry-run" (default: stampa le righe JSON e non apre il socket), "read-only" (solo i metodi get* e
   checkJbiExist) e "armed". In armed, prima del PRIMO runJbi della sessione mostra la sequenza esatta e aspetta
   "y" da tastiera.

4) gergo_sdk.mock: finto server JSON-RPC sulla 8055 (porta configurabile) che risponde con i formati del manuale:
   result come stringa JSON, errori -32601/-32693, runJbi che passa runState 0 → 3 → 0 dopo la durata letta da
   /shared/fixtures/elite_durations.json (default 2 s). Scenari iniettabili: robotMode 1 (non remote), collisione a
   metà task, e-stop a metà task, JBI inesistente, task che non finisce. Tutti i test girano contro il mock; nessun
   test tocca il robot.

5) /bridge/adapters/elite.py implementa RobotAdapter con EliteController. Dopo ogni step_end ok in armed il bridge
   imposta real_ok = true sulla skill (che resta da confermare a mano in console). Ogni ok=false scrive un event
   "anomaly" con robot_mode, robot_state e jbi_state.

6) Tool per lo slot:
   - `python -m gergo_sdk.probe --host $ELITE_HOST`: solo read-only. Stampa getSoftVersion, getRobotMode,
     getRobotState, get_estop_status, getServoStatus, getMotorStatus, get_robot_power_status, getSpeed e
     checkJbiExist per ogni JBI della mappa.
   - `python -m gergo_sdk.time_tasks --host $ELITE_HOST`: in armed, con conferma per ogni JBI, lo esegue 3 volte e
     scrive le mediane in /shared/fixtures/elite_durations.json, che il SimArm usa da quel momento.

Prima di ogni invio reale al robot mostrami il comando e aspetta il mio ok. Lo stop di sicurezza è l'e-stop
fisico dello staff, non questo software: il metodo "stop" ferma il programma e non è una funzione di sicurezza.

Check (riporta l'output): pytest verde contro il mock, compresi gli scenari iniettati e il rifiuto dei metodi fuori
whitelist; probe read-only sul robot vero; un JBI avviato dal laptop in armed con step_end ok: true nel registro;
elite_durations.json scritto. Commit e push.
```

---

## Cosa entra nel report di deploy (fine sessione di produzione)

Generato da `python -m bridge.deploy_report`, numeri solo da git, Vercel e Supabase:

| Sezione | Fonte |
|---|---|
| Build: commit, branch, URL produzione | git, Vercel |
| Ontologia: versione attiva, skill confermate / deprecate, chi e quando, sim_ok / real_ok | `skills`, `ontology_versions` |
| Routine: versioni, diff, chi le ha insegnate | `routines` |
| Cicli: per routine e versione, tempo medio, v1 vs v2 | `v_cycle_stats` |
| Sicurezza: comandi eseguiti senza conferma (deve essere 0), rifiuti del validatore, stop | `events`, `commands` |
| Memoria: binding promossi, correzioni, proposte con before/after | `bindings`, `proposals` |
| Eval: tabelle A/B/C | `eval/results/*.json` |
| Limiti noti | HACK.md |
