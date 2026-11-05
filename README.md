# Gergo — si allena il braccio a voce, nella sua postazione

Grok Hackathon at the Museum · Pavia · **Track 04 Voice Control** · caso pratico: etichettatura di un pack ·
consegna alle 16:00 del 05/11/2026. **Bozza** del cantiere FONDAMENTA (finale al freeze delle 15:00).

> Marker come nel resto della repo: `[verificato: fonte]` · `[dichiarato]` · `[non verificato]`.
> Piano e decisioni: `PLAN.md`, `HACK.md`. Sicurezza del movimento: `MOTION_SAFETY.md` (vince sugli altri).

## 1. Cos'è

Gergo serve ad allenare a voce, in italiano, un braccio Elite nella sua postazione di etichettatura. L'operatore
insegna a voce il ciclo (*solleva → sposta → applica*), gli dà un nome, lo fa ripetere, segnala i problemi ("è
storta") e a fine turno chiede il resoconto. Una memoria tiene il **lessico** della postazione, le **routine**
versionate e tutto ciò che succede nei cicli; un pattern miner deterministico nota anomalie e pattern e propone
versioni migliori, che una persona approva e che si misurano al ciclo dopo.
**Il modello interpreta, il codice decide:** Grok sceglie tra intenti a enum, il codice valida, calcola e
decide se un comando si esegue.

## 2. Architettura

```
 Operatore (voce, headset)
   │
   ▼
 Browser · /console ── Grok Voice (wss://api.x.ai/v1/realtime, token effimero da /api/voice/token)
   │  ogni function call (solo enum e una quantità) ▼
 Vercel · Next.js (web/)
   ├─ /console, /console/report, /console/probe
   └─ /api/tools/[name]  validatore · memoria · routine · pattern miner · resoconto · rilettura scritta dal codice
   │  scrive righe versionate (comandi confermati, routine, stati draft → confirmed → deprecated)
   ▼
 Supabase (Postgres + RLS + Realtime) · progetto gergo-pavia
   │  il bridge legge (realtime / polling), rivalida in locale, scrive events e heartbeat
   ▼
 Bridge Python (bridge/, laptop sulla rete del braccio)
   ├─ --mode sim    SimArm: pose, durate, "sposta"
   └─ --mode elite  adapter Elite serie CS (Dashboard 29999 per i task, Primary 30001 per movel)

 audio_guard (safety/, locale) ── microfono ── trigger ──► stop() DIRETTO al controller (Dashboard 29999)
                                               └─► dopo: event safety_trigger + heartbeat su Supabase
```

**Perché Vercel non modifica codice Python** (DEPLOY.md, "correzione di architettura"): se il server web potesse
riscrivere il codice che muove il braccio, un bug o una prompt injection nella catena voce → Grok → API
diventerebbe codice eseguito accanto al robot. Quindi Vercel scrive solo **dati versionati** (ontologia, routine
con versioni, stati di approvazione, comandi confermati); il bridge li **rivalida in locale** con lo stesso
validatore e rifiuta tutto ciò che non è in whitelist o che si riferisce a un'ontologia non confermata.
"Approvare / modificare / deprecare" significa cambiare lo stato di una riga, mai un file `.py`.

Contratti: `bridge/contracts.py` (pydantic v2) è la fonte di verità; `shared/schemas/*.json` sono generati;
`web/lib/contracts.ts` (zod) dà lo stesso esito sulle fixture di `shared/fixtures/{valid,invalid}`
(`shared/contracts.md`).

## 3. Sicurezza

- **Grok non emette coordinate.** Il tool `sposta` ha solo `direzione` (su, giu, avanti, indietro, destra,
  sinistra), `quantita` + `unita` (mm, cm) oppure `intensita` (poco, un_po, tanto). Il codice calcola il Δ in mm
  (cm×10, poco 10, un_po 20, tanto 50, default 20) con **clamp a 100 mm per comando**.
- **Conferma prima di ogni movimento.** La rilettura la scrive il codice ("Scendo di 10 centimetri a 50
  millimetri al secondo. Confermi?"); il command resta in coda finché non c'è il "sì" (`confirmed_at`). Il bridge
  scarta i comandi confermati più vecchi di 30 s.
- **Geofence + controllo di cinematica.** Target = posa + Δ solo in traslazione, dentro il box di lavoro
  (`shared/fixtures/workspace.json`); la linea è controllata su 5 punti (nessuna soluzione, salto di giunto
  > 15°, rapporto > 1°/mm → rifiuto). Velocità di sessione 10–100 mm/s, default 50. Solo MoveL, niente rotazioni.
- **Arresto vocale e acustico.** `safety/audio_guard.py` è uno **stop software rapido**, locale e indipendente
  da Grok, Vercel e Supabase: parola ("stop", "fermo", "basta", "alt", Vosk offline), botta, urlo, sfregamento.
  Heartbeat ogni 250 ms: se manca da più di 1 s il bridge rifiuta i movimenti (fail-safe). **Non è un arresto
  di emergenza:** l'e-stop è il pulsante fisico cablato ed è dello staff; questo stop si aggiunge, non lo
  sostituisce.
- **Accensione, servo, freni, reset di allarmi e collisioni, payload e TCP si fanno solo dal pendant**, a cura
  del tecnico. Il software legge e annuncia lo stato, non lo aziona: quei comandi sono fuori whitelist.
- Nessun comando reale al robot senza averlo mostrato a una persona e aver ricevuto il suo ok.

## 4. Come si esegue da zero

### Prerequisiti
- Python ≥ 3.11 (eval: solo stdlib; bridge: `pydantic` v2; test: `pytest`). Non c'è ancora un
  `requirements.txt` (CANTIERI.md Round 2, buco 4): installare a mano `pydantic pytest` e `pip install -e sdk`.
- Opzionali per audio_guard: `vosk` + modello `vosk-model-small-it-0.22` in `safety/models/` (o `VOSK_MODEL_PATH`),
  `sounddevice` per il microfono, `numpy`. Senza Vosk la parola chiave è **disabilitata** (lo dice il log).
- Node 22.x per `web/` (Next.js 15, vitest).

### Variabili d'ambiente (solo nomi, mai valori nel repo)
- `.env.example` → `web/.env.local` e Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `XAI_API_KEY`, `XAI_VOICE_MODEL` (`grok-voice-3.0`, da `shared/xai-notes.md`),
  `XAI_EVAL_MODEL`, `CONSOLE_PASSPHRASE`, `BRIDGE_ID`.
- `bridge/.env.example` → `bridge/.env` sul laptop del bridge: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `BRIDGE_ID`, `ELITE_SERIES`, `ELITE_HOST`, `ELITE_PORT`, `ELITE_MODE` (dry-run | read-only | armed).
- Lette dal codice ma non ancora negli example: `GERGO_GUARD_HEARTBEAT` (adapter Elite), `VOSK_MODEL_PATH`,
  `AUDIO_GUARD_HEARTBEAT_FILE`, `GERGO_BRIDGE_ID` (audio_guard), `VERCEL_DEPLOY_URL`, `XAI_MODEL` (deploy_report).

### Database (Supabase)
Progetto `gergo-pavia`, ref `gppcwepbwrrcsojrwplp`, URL `https://gppcwepbwrrcsojrwplp.supabase.co`
(`supabase/config.toml`). Le chiavi si copiano dalla dashboard Supabase. Per un DB nuovo si applicano i file di
`supabase/migrations/` in ordine di prefisso — `0xxx` (FONDAMENTA: `fondamenta_harden()`), `1xxx` (BRIDGE:
ontologia e seed, runtime), `2xxx` (CONSOLE: routine, run, binding, osservazioni, proposte, view `v_*`), `9xxx`
(hardening: RLS su tutto, anon solo in lettura, realtime). `fondamenta_harden()` è idempotente. Sul progetto
attuale sono applicate tutte e 9 e coincidono con il repo `[verificato: CANTIERI.md, FONDAMENTA 13:03]`.

### Console web
```bash
cd web
npm ci
npm run dev        # http://localhost:3000/console — senza NEXT_PUBLIC_SUPABASE_* mostra dati finti, marcati come tali
npm test           # vitest: contratti zod sulle fixture, validator, routine, miner, tool vocali
npm run build
```
In dev senza `CONSOLE_PASSPHRASE` la console è aperta; in produzione risponde 503 (fail-closed).
Pagine: `/console`, `/console/report`, `/console/probe` (misura della voce, kill criterion di P0).
API: `/api/tools/[name]` (propone_azione, sposta, piu_piano, piu_veloce, conferma, annulla, stop, conferma_skill,
depreca_skill, definisci_routine, salva_routine, esegui_routine, fatto, segnala, resoconto, mina,
approva_proposta, salva_angolo), `/api/voice/token`, `/api/login`, `/api/health`.

### Bridge in simulazione
```bash
python -m bridge.main --mode sim --memory --once          # offline, store in memoria, un giro di polling
python -m bridge.main --mode sim                          # sul DB vero (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
python -m bridge.main --mode sim --inject slow:applica    # anomalia iniettata per il pattern miner (dichiarata)
python -m bridge.gen_schemas --check                      # gli schemi in shared/schemas sono aggiornati?
PYTHONPATH=sdk python -m pytest -q bridge/tests           # (oppure pip install -e sdk)
```
Tasto `s` + Invio = STOP software dal bridge. `--mode elite` **oggi usa ancora il dry-run** (`DryRunElite`): il
collegamento a `EliteCsAdapter` è aperto (CANTIERI.md Round 2, buco 3).

### Arresto vocale e acustico (audio_guard)
```bash
python -m safety.audio_guard calibrate --seconds 30 --label sala   # taratura: sala ferma
python -m safety.audio_guard calibrate --seconds 30 --label moto   # taratura: braccio in moto
python -m safety.audio_guard run --dry-run --bridge-id pavia-postazione-1   # stampa "STOP" invece di inviarlo
python -m safety.audio_guard run --host $ELITE_HOST --bridge-id pavia-postazione-1
python -m safety.audio_guard run --only-keyword --host $ELITE_HOST          # kill criterion: solo parola chiave
python -m pytest -q safety/tests
```
Il default di `--bridge-id` è `gergo-1`: va passato uguale a `BRIDGE_ID`. Il segnale "braccio in moto" dal
bridge ad audio_guard non c'è ancora (buco 5): lo sfregamento scatta solo con `--moving`. Dettagli:
`safety/README.md`.

### SDK Elite serie CS e probe
```bash
pip install -e sdk
python -m gergo_sdk.mock                          # controller CS finto su 127.0.0.1 (29999, 30001, 30004)
python -m gergo_sdk.probe --host 127.0.0.1        # sola lettura: versione, robotMode, safety, TCP, MDH
python -m pytest -q sdk/tests
```
Al braccio vero: `python -m gergo_sdk.probe --host $ELITE_HOST`, sempre in sola lettura, prima di tutto il
resto (checklist in `sdk/ELITE_NOTES.md`).

### Eval contro baseline
```bash
python eval/run.py --split test --conditions A,B,C --dry-run                    # offline: A vera, B/C stub
XAI_API_KEY=... python eval/run.py --split test --conditions A,B,C --model <modello>   # o XAI_EVAL_MODEL
python -m pytest -q eval
```
Exit code 1 se una condizione esegue senza conferma o accetta un movimento fuori geofence. Dettagli:
`eval/README.md`.

### Report di deploy
```bash
python -m bridge.deploy_report --since 2026-11-05T12:00 --vercel-url https://gergoai.vercel.app
python -m bridge.deploy_report --since 2026-11-05T09:00 --memory-fixture bridge/tests/fixtures/deploy_report_db.json
```
Scrive `reports/deploy-<ts>.{md,json}` (numeri solo da git, Vercel e Supabase, sezione sicurezza inclusa);
`--narrate` aggiunge 3 frasi di Grok in un box "testo generato".

## 5. Dati usati

Solo dati sintetici o prodotti in sala; nessun dato personale.
- `eval/checkset.jsonl`: 30 enunciati in italiano (10 `dev`, 20 `test`), con atteso `{skill, params}` o `null`
  se serve un chiarimento; flag per movimento, memoria, geofence, clamp.
- `eval/memory_fixture.json`: binding e routine della condizione C. `eval/default_workspace.json`: box
  **segnaposto** inventato, usato solo se mancano `shared/fixtures/{workspace,frame}.json`.
- `shared/fixtures/valid|invalid/*.json`: fixture dei contratti (pydantic e zod devono dare lo stesso esito).
  `shared/fixtures/{workspace,frame,elite_tasks}.json`: box di lavoro, mappa direzione→asse, nomi dei task CS
  (da verificare al braccio).
- `supabase/migrations/1001_bridge_ontology.sql`: seed della postazione (luoghi INGRESSO, STAZIONE, USCITA,
  SCARTI, HOME; skill primitive più `sposta`, `piu_piano`, `piu_veloce`; tool `flangia`; workspace), tutto in
  `draft`.
- `safety/baseline/`: baseline audio di sala e di braccio in moto, **ancora vuota** (si registra allo slot).
  Le latenze di audio_guard nei test vengono da wav sintetici.
- `bridge/tests/fixtures/deploy_report_db.json`: DB finto per il report di deploy.

## 6. Risultati contro baseline

Condizioni (`eval/README.md`): **A** regole a parole chiave · **B** Grok senza memoria · **C** Grok con la memoria
della postazione. Split `test`, 20 casi.

<!-- EVAL_TABLE -->
| Metrica | A (misurata) | B | C |
|---|---|---|---|
| Accuratezza complessiva | 80% | non misurata | non misurata |
| Accuratezza skill / params | 78% / 78% | non misurata | non misurata |
| Turni di chiarimento (attesi / non attesi / mancati) | 6 (2 / 4 / 0) | non misurata | non misurata |
| Gergo da memoria corretto | 0/4 | non misurata | non misurata |
| Rifiuti geofence corretti | 2/2 | non misurata | non misurata |
| Esecuzioni senza conferma (deve essere 0) | 0 | non misurata | non misurata |
| Movimenti fuori geofence accettati (deve essere 0) | 0 | non misurata | non misurata |
| Latenza mediana (ms) | — | non misurata | non misurata |

Fonte: `eval/results/summary-20261105-131813.json` (`python eval/run.py --split test --conditions A`), workspace
`shared/fixtures/workspace.json`. **B e C non sono state misurate oggi**: la chiave xAI non era disponibile
all'ambiente dell'eval entro le 14:15. La pipeline B/C gira solo in dry-run (stub senza tool call, file
`*-dryrun*` non committati), quindi non pubblichiamo numeri per Grok. Per misurarle:
`XAI_API_KEY=… python eval/run.py --split test --conditions A,B,C --model <modello testo xAI>`.
A sbaglia per costruzione il gergo della postazione (0/4): è il caso che la memoria (C) deve risolvere.
<!-- /EVAL_TABLE -->

**In arrivo: condizione A misurata, B/C con Grok.** Finché `eval/results/` non contiene una run senza `-dryrun`,
qui non c'è nessun numero. Kill criterion (PLAN P5): se C non migliora B di almeno 15 punti, il pitch dice
"esegue a voce routine insegnate", non "impara".

Stato del deploy: `GET /api/health` (presenza delle env senza valori, ping a Supabase, età dell'heartbeat del
bridge e di audio_guard; 503 solo se mancano env o Supabase non risponde) e il report di
`python -m bridge.deploy_report`, allegato alla consegna.

## 7. Limiti noti

- Le primitive di movimento sono task pre-insegnati sul pendant: a voce si allenano nomi, routine e varianti, non
  le traiettorie.
- Gli spostamenti a voce sono solo traslazioni in linea retta (MoveL), al massimo 10 cm per comando, dentro il box
  di lavoro e dopo il controllo di cinematica. Niente rotazioni, jog continuo o comandi di giunto a voce.
- L'arresto vocale e acustico è uno stop software rapido, non un arresto di emergenza: l'e-stop resta fisico,
  cablato e dello staff. La latenza dello stop dalla console (`/api/tools/stop`) dipende dalla rete.
- "Applicare" è una pressione con lo spintore; l'etichetta la posa l'operatore.
- In demo le anomalie del pattern miner sono iniettate in simulazione (`--inject`), oltre al feedback vocale reale.
- Check set e memoria sono provati su una sola postazione e per poche ore.
- **Braccio: serie CS** `[dichiarato: Federico, etichetta]`; il manuale nella repo (`EC_SDK_SocketManual_Ver3.19.2.pdf`)
  è della serie EC e non si applica. Su CS: unità di `movel` (metri secondo l'SDK CS, da confermare con 1 cm),
  IP, versione del controller, nomi dei task e cinematica MDH contro il controller sono `[non verificato]`.
- `bridge.main --mode elite` usa ancora il dry-run; nessun `requirements.txt`; audio_guard non sa quando il braccio
  si muove (CANTIERI.md Round 2).
- Voce: kill criterion di P0 (8 frasi su 10, latenza mediana ≤ 2,5 s) **non ancora misurato** su `/console/probe`.
- Latenze di audio_guard misurate solo su wav sintetici (botta ~13 ms, urlo ~93 ms, sfregamento ~293 ms); in sala
  `[non verificato]`.

**Ordine di taglio** (MOTION_SAFETY.md §5): 1. sfregamento → 2. urlo → 3. "salva qui come luogo" → 4. movimento
relativo su CS (in quel caso resta solo in sim, e al braccio vero si usano i task via Dashboard più l'arresto
vocale e acustico). Non si tagliano mai: parola chiave, botta, heartbeat fail-safe e geofence.

## 8. Struttura della repo e cantieri

| Cartella / file | Cosa | Cantiere |
|---|---|---|
| `web/` | Next.js: console, voce nel browser, `/api/tools/*`, validator e pattern miner in TS, `/api/health` | CONSOLE (`/api/health`: FONDAMENTA) |
| `bridge/` | contratti pydantic, validator con geofence, `main` (sim/elite), composer delle routine, `deploy_report`, adapter | BRIDGE (`adapters/elite.py`: BRACCIO) |
| `sdk/` | `gergo_sdk`: Dashboard, Primary, RTSI, cinematica MDH, `motion`, mock CS, probe; `ELITE_NOTES.md` | BRACCIO |
| `safety/` | `audio_guard`: arresto vocale e acustico locale, taratura, test di latenza | BRACCIO |
| `shared/` | `contracts.md`, schemi JSON generati, fixture, `xai-notes.md` (verifiche su Grok Voice) | BRIDGE (`xai-notes.md`: CONSOLE) |
| `supabase/` | `config.toml` e migration `0xxx`/`9xxx` FONDAMENTA, `1xxx` BRIDGE, `2xxx` CONSOLE | FONDAMENTA applica |
| `eval/` | check set, memoria della condizione C, harness A/B/C, risultati | FONDAMENTA |
| `PLAN.md`, `HACK.md`, `DEPLOY.md`, `MOTION_SAFETY.md`, `CANTIERI.md`, `CLAUDE.md` | piano, verdetto e limiti, prompt di deploy, sicurezza del movimento, coordinamento dei 4 cantieri, regole per Claude Code | comuni |
