# Gergo — Parla al braccio. Impara la tua postazione.

**Chi lavora in linea allena il cobot a voce, in italiano, senza scrivere una riga di codice e senza aspettare il
tecnico.** Gergo ricorda come lavori, ti propone come lavorare meglio, e ogni modifica passa da un security stack
di persone, regole e un agente di revisione prima di arrivare al braccio.

[Sito](https://gergoai.vercel.app) · [Demo: console della postazione](https://gergoai.vercel.app/console) ·
[Pitch deck (PDF)](https://gergoai.vercel.app/gergo-pitch-deck.pdf) ·
[Registro del codice](https://gergoai.vercel.app/console/codice) · [Stato](https://gergoai.vercel.app/api/health)

Grok Hackathon at the Museum · Pavia, 5 novembre 2026 · **Track 04 Voice Control** · caso pratico: etichettatura
di un pack su un **Elite CS63** · KVA, Kakashi Venture Accelerator.

> Marker come nel resto della repo: `[verificato: fonte]` · `[dichiarato]` · `[non verificato]` · `[ipotesi]`.
> Piano e decisioni: `PLAN.md`, `HACK.md`. Sicurezza del movimento: `MOTION_SAFETY.md` (vince sugli altri).

## 1. Il problema

Ogni volta che il prodotto cambia, il cobot aspetta il tecnico. Riprogrammare una cella di packaging richiede
giorni di integratore; chi lavora in linea conosce la postazione meglio di chiunque, ma non può cambiarla; e
nessuno registra perché i cicli rallentano.

## 2. Come funziona, in sei frasi

1. **Si installa una volta, poi lo alleni tu.** Il tecnico insegna sul pendant i gesti di base, uno per luogo
   (solleva, porta, applica, deposita). Da lì cambi di ciclo, nomi e varianti li fa chi sta alla postazione.
2. **Spiegaglielo come a un collega.** «Ti insegno la frontale…»: Gergo trasforma la spiegazione in una routine,
   te la rilegge passo per passo e la salva solo quando dici sì. Il gergo della postazione lo impara strada
   facendo («il carrello» diventa l'uscita).
3. **Si muove solo dopo il tuo sì.** «Scendi di 10 centimetri»: i millimetri li calcola il codice, non il
   modello; controlla area di lavoro e cinematica, rilegge la frase e aspetta la conferma. Massimo 10 cm per
   comando.
4. **Provi, correggi a voce, migliora.** Scegli un movimento dalla libreria, il braccio lo esegue, tu dici
   «doveva scendere 2 centimetri in più»: nasce la versione 2, la riprovi, dici «è giusto».
5. **Nota cosa rallenta e ti propone di meglio.** Ogni ciclo finisce nel registro; quando qualcosa si ripete o
   rallenta Gergo lo dice («tra un ciclo e l'altro torno sempre a casa, lo tolgo?»). Approvi tu, si misura la
   differenza.
6. **Dici «fermo», si ferma.** Un ascolto locale, senza cloud, ferma il braccio. È uno stop in più: l'e-stop
   fisico resta al suo posto, in mano allo staff.

## 3. Per chi

| | Cosa fa con Gergo | Cosa ci guadagna |
|---|---|---|
| **Operatore** | cambia il ciclo con la voce, corregge un movimento parlando, chiede il resoconto del turno | non aspetta il tecnico per una variante; ogni movimento gli viene riletto prima di farlo |
| **Tecnico e integratore** | installa i gesti di base sul pendant; riceve le modifiche già provate e già controllate | **approva invece di programmare**: niente Python da scrivere o da leggere riga per riga; più cobot seguiti |
| **Responsabile e compliance** | legge registro, versioni e report | ogni modifica ha frase, prova sul braccio, esito dei gate e chi l'ha approvata |

## 4. Il modello capisce, il codice decide

- **Nessuna coordinata dal modello.** Grok passa solo intenzioni: direzione, quantità, «un po'». Millimetri,
  area di lavoro e cinematica li controlla il codice.
- **Prima la rilettura, poi il sì.** Ogni movimento viene riletto con numeri e velocità; senza un sì esplicito non
  parte niente.
- **Ogni modifica è una versione.** Nuova routine o ottimizzazione: nasce in bozza, la approva una persona, resta
  nel registro ed è reversibile.
- **Il codice si legge, non si racconta.** `/console/codice` mostra i limiti di sicurezza letti dai sorgenti con
  file, riga e commit, le impronte sha256 dei file e la storia delle modifiche agli script.

## 5. Security stack del sistema di sicurezza

Quando l'operatore corregge un movimento a voce, Gergo non riscrive il codice da solo: **propone** una modifica
allo script Python, che deve superare sei controlli. Basta un no per fermarla.

| # | Chi | Gate | Dove |
|---|---|---|---|
| 1 | Persona | prova sul braccio e «è giusto»; ogni passo eseguito resta nel registro | console, `Libreria dei movimenti` |
| 2 | Codice | lo script è **solo dati** (docstring + un letterale `MOVIMENTO`/`ROUTINE`): niente import, chiamate, `def`, coordinate; ogni passo ≤ 100 mm, spostamento netto ≤ 300 mm per asse; evidenze presenti | `web/lib/scriptGate.ts` |
| 3 | Agente AI | Grok rilegge lo script con una checklist: senso fisico della sequenza, provenienza, istruzioni nascoste nei testi. Il gate del codice vince sempre | `web/lib/server/review.ts` |
| 4 | Persona | revisione della Pull Request, che porta la tabella con l'esito di ogni gate | GitHub |
| 5 | CI | lo stesso controllo in Python con `ast.literal_eval`, **senza mai eseguire il file** | `gate/check_taught.py`, `.github/workflows/taught-gate.yml` |
| 6 | Bridge | in esecuzione rifà geofence, cinematica e conferma; arresto vocale e acustico ed e-stop fisico sempre attivi | `bridge/validator.py` |

Prima di aprire la PR il server verifica sul registro che ogni passo sia stato davvero eseguito con esito
positivo e con gli stessi parametri: il browser non può inventare una prova. Le proposte bocciate restano nel
registro e non arrivano mai su GitHub.

**Dal registro a un dataset.** Ogni proposta (frase e evidenze, script generato, esito di ogni gate, stato finale)
si esporta in JSONL da `/api/tools/dataset`. È la base di un workflow di verifica di sicurezza e qualità degli
script, in stile CATALYST: oggi per i comandi vocali, domani per gli input da visione e videocamera.

## 6. Davvero codeless

Il codice c'è, ma nessuno deve scriverlo, e nessuno deve fidarsi alla cieca:

```
Voce            «doveva scendere 2 cm in più»
  → Prova       il braccio riprova la versione 2, l'operatore dice «è giusto»
  → Script      Gergo genera il file Python: solo dati, con la provenienza
  → Gate        codice, agente AI e CI lo verificano; basta un no per fermarlo
  → Approvato   il tecnico vede l'esito dei controlli e approva con un clic
```

Senza codeless, una piccola modifica significa un tecnico che riscrive uno script sotto pressione, con il cobot
fermo. Con Gergo la modifica nasce da una prova reale, passa controlli identici ogni volta e arriva al braccio solo
dopo un sì umano: meno codice scritto a mano, meno errori nascosti.

## 7. La console della postazione

`/console`, dietro una passphrase di postazione (`CONSOLE_PASSPHRASE`):

- **Stai parlando con**: modello, seriale e IP del braccio (`sdk/ELITE_NOTES.md`), connessione, bridge,
  modalità SIMULAZIONE o REALE, stato dell'arresto acustico.
- **Parla al braccio**: voce Grok nel browser a **walkie-talkie**. Si tiene premuto (pulsante o tasto `V`) e si
  parla; al rilascio il microfono si chiude e il turno va a Grok. Fuori dalla pressione la traccia audio è
  disattivata: la sala non viene mai inviata. La barra spaziatrice è lo STOP.
- **Pendant virtuale**: gli stessi intenti della voce come pulsanti (Su, Giù, Avanti, Indietro, Sinistra,
  Destra con passo 1, 2, 5 o 10 cm; più piano e più veloce), posa del TCP e ultimi movimenti dal registro.
- **Libreria dei movimenti**: i 10 task preinstallati sul pendant (letti da `shared/fixtures/elite_tasks.json`) e
  gli spostamenti relativi; ognuno si prova e si corregge a voce, e la versione giusta diventa una proposta di
  script.
- **Registro per operazione**: detto → capito → sì → parte → fine in una scheda, con origine (voce, pendant,
  prova, registro), esito e durata; **Ripeti** e **Inverti** riportano il movimento al pendant.
- **Sistema di allerta**: regole deterministiche (`web/lib/alerts.ts`); a tutto schermo solo i critici (bridge
  muto, arresto acustico a braccio in moto, emergenza o collisione dal controller); la presa visione resta nel
  registro e non riarma niente sul controller.
- **Movimenti**: approvazione di nuove routine, modifiche e proposte con confronto passo per passo; una modifica
  è sempre una nuova versione in bozza.
- **Tempo di ciclo per versione**, resoconto del turno dalle view SQL, report, modalità demo (`/console?demo`).

### Come fare il test vocale

1. Sul laptop della postazione: `python -m bridge.main --mode sim` (la connessione in console diventa verde).
2. Apri `/console` in Chrome, con un headset; inserisci la passphrase; tocca la sfera per accendere la voce.
3. Tieni premuto e di' «scendi di 10 centimetri» → rilettura → tieni premuto «sì». Poi «più piano».
4. Libreria: «prova l'avvicinamento alla stazione» → «sì» → «no, doveva scendere 2 centimetri in più» → «sì» →
   «è giusto» → «sì»: parte la proposta di script.
5. Kill criterion della voce: `/console/probe`, 10 frasi a walkie-talkie; il verdetto si calcola da solo.
6. Al braccio vero: solo con il tecnico, `audio_guard` acceso con lo stesso `BRIDGE_ID`, e l'ok di una persona sul
   primo comando.

## 8. Architettura

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
"Approvare / modificare / deprecare" significa cambiare lo stato di una riga, mai un file `.py` eseguito. L'unica eccezione, sotto controllo, sono le proposte di script vocali: file di soli dati che arrivano su `main` solo via Pull Request, dopo i gate del §5.

Contratti: `bridge/contracts.py` (pydantic v2) è la fonte di verità; `shared/schemas/*.json` sono generati;
`web/lib/contracts.ts` (zod) dà lo stesso esito sulle fixture di `shared/fixtures/{valid,invalid}`
(`shared/contracts.md`).

Le modifiche agli script nate dalla voce seguono una strada a parte: la console apre una **Pull Request** con un
file di soli dati in `bridge/taught/`, dopo i gate 1–3; la CI applica il gate 5; una persona unisce. Vercel non
scrive mai su `main` e non modifica codice che il bridge esegue.

## 9. Sicurezza del movimento

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

## 10. Come si esegue da zero

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
  `BRIDGE_ID`, `ELITE_SERIES`, `ELITE_HOST`, `ELITE_MODE` (dry-run | read-only | armed), porte CS.
- In `bridge/.env.example` anche: `ELITE_DASHBOARD_PORT=29999` (serie CS), `GERGO_BRIDGE_ID` (audio_guard, uguale a
  `BRIDGE_ID`), `AUDIO_GUARD_HEARTBEAT_FILE` / `GERGO_GUARD_HEARTBEAT`, `VOSK_MODEL_PATH`, `VERCEL_DEPLOY_URL`, `XAI_MODEL`.
- Produzione: https://gergoai.vercel.app · stato: https://gergoai.vercel.app/api/health (presenza delle env, ping a
  Supabase, età degli heartbeat di bridge e audio_guard; `degraded` finché non girano).

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
Pagine: `/` (presentazione), `/console` (postazione), `/console?demo` (vista per il video), `/console/report`, `/console/codice` (registro del codice), `/console/protocollo` (come parla col braccio), `/console/probe` (misura della voce, kill criterion di P0), `/login`.
API: `/api/tools/[name]` (propone_azione, sposta, piu_piano, piu_veloce, conferma, annulla, stop, conferma_skill,
depreca_skill, definisci_routine, salva_routine, esegui_routine, fatto, segnala, resoconto, mina,
approva_proposta, salva_angolo, modifica_routine, presa_visione, passo_base, passo_test, proponi_script), `/api/tools/dataset` (JSONL delle proposte di script), `/api/code/history` (storia GitHub degli script), `/api/voice/token`, `/api/login`, `/api/health`.
Variabili in più per le proposte di script: `GITHUB_TOKEN` (fine-grained, sola repo, Contents e Pull requests in scrittura) e `XAI_REVIEW_MODEL` (modello Grok testuale del gate AI). Senza, la proposta si scarica e il gate AI risulta "non eseguito".

### Bridge in simulazione
```bash
python -m bridge.main --mode sim --memory --once          # offline, store in memoria, un giro di polling
python -m bridge.main --mode sim                          # sul DB vero (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
python -m bridge.main --mode sim --inject slow:applica    # anomalia iniettata per il pattern miner (dichiarata)
python -m bridge.gen_schemas --check                      # gli schemi in shared/schemas sono aggiornati?
PYTHONPATH=sdk python -m pytest -q bridge/tests           # (oppure pip install -e sdk)
```
Tasto `s` + Invio = STOP software dal bridge. `--mode elite` usa `EliteCsAdapter` (serie CS) con `ELITE_HOST`,
`ELITE_MODE` (default `dry-run`: nessun socket; `read-only`; `armed` chiede "y" al primo comando) e le porte
`ELITE_DASHBOARD_PORT`/`ELITE_PRIMARY_PORT`/`ELITE_RTSI_PORT`. Se l'adapter non si importa il bridge si ferma con
un errore: non ripiega più in silenzio sul dry-run. `--dry-run` esplicito usa `DryRunElite`.
Prova contro il mock CS, senza robot:
```bash
PYTHONPATH=sdk python -m gergo_sdk.mock --dashboard 39999 --primary 39001 --rtsi 39004 &
PYTHONPATH=sdk:. ELITE_HOST=127.0.0.1 ELITE_MODE=read-only ELITE_DASHBOARD_PORT=39999 ELITE_PRIMARY_PORT=39001 \
  ELITE_RTSI_PORT=39004 python -m bridge.main --mode elite --memory --once
```

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

## 11. Dati usati

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

## 12. Risultati contro baseline

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

## 13. Numeri del pitch

- 66.000 cobot installati nel mondo nel 2025 `[verificato: IFR, President's Report 2026]`.
- 7.824 robot industriali installati in Italia nel 2025 `[verificato: Universal Robots su dati IFR]`.
- 1,5 giorni per riposizionare una cella di packaging in modo convenzionale `[dichiarato dal vendor: OnRobot]`.
- Fino al 43% di tempo in meno programmando a voce cobot UR `[dichiarato dal vendor: Konica Minolta CoboVox, 2023]`.
- Da 33 a 82 cobot per tecnico nello scenario base; 60 € al mese per cobot attivo `[ipotesi: modello KVA]`.
- Soglia che ci ferma, scritta prima del pilota: se meno del 25% delle richieste di assistenza storiche è
  risolvibile dall'operatore a voce, lo scenario base cade.

## 14. Limiti noti

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
- Nessun `requirements.txt`; audio_guard non sa quando il braccio
  si muove (CANTIERI.md Round 2).
- Voce: kill criterion di P0 (8 frasi su 10, latenza mediana ≤ 2,5 s) **non ancora misurato** su `/console/probe`. La voce della console è a walkie-talkie (si tiene premuto per parlare).
- audio_guard in sala ha dato falsi positivi a raffica sulla parola chiave (43 "parola" in 10 minuti a braccio fermo): scatta su ipotesi parziali di Vosk. Correzione proposta a BRACCIO in `CANTIERI.md`; la console li mostra come avvisi, non come emergenze.
- Le proposte di script vocali diventano file di soli dati in `bridge/taught/`: il bridge non li carica ancora a runtime (oggi le routine eseguite sono le righe versionate su Supabase).
- Latenze di audio_guard misurate solo su wav sintetici (botta ~13 ms, urlo ~93 ms, sfregamento ~293 ms); in sala
  `[non verificato]`.

**Ordine di taglio** (MOTION_SAFETY.md §5): 1. sfregamento → 2. urlo → 3. "salva qui come luogo" → 4. movimento
relativo su CS (in quel caso resta solo in sim, e al braccio vero si usano i task via Dashboard più l'arresto
vocale e acustico). Non si tagliano mai: parola chiave, botta, heartbeat fail-safe e geofence.

## 15. Struttura della repo e cantieri

| Cartella / file | Cosa | Cantiere |
|---|---|---|
| `web/` | Next.js: console, voce nel browser, `/api/tools/*`, validator e pattern miner in TS, `/api/health` | CONSOLE (`/api/health`: FONDAMENTA) |
| `bridge/` | contratti pydantic, validator con geofence, `main` (sim/elite), composer delle routine, `deploy_report`, adapter | BRIDGE (`adapters/elite.py`: BRACCIO) |
| `sdk/` | `gergo_sdk`: Dashboard, Primary, RTSI, cinematica MDH, `motion`, mock CS, probe; `ELITE_NOTES.md` | BRACCIO |
| `safety/` | `audio_guard`: arresto vocale e acustico locale, taratura, test di latenza | BRACCIO |
| `shared/` | `contracts.md`, schemi JSON generati, fixture, `xai-notes.md` (verifiche su Grok Voice) | BRIDGE (`xai-notes.md`: CONSOLE) |
| `supabase/` | `config.toml` e migration `0xxx`/`9xxx` FONDAMENTA, `1xxx` BRIDGE, `2xxx` CONSOLE | FONDAMENTA applica |
| `eval/` | check set, memoria della condizione C, harness A/B/C, risultati | FONDAMENTA |
| `bridge/taught/` | script di soli dati nati da movimenti provati e corretti a voce, arrivati via Pull Request | proposti dalla console, uniti da BRIDGE |
| `gate/`, `.github/workflows/taught-gate.yml` | gate CI: legge gli script vocali con `ast`, senza eseguirli, e boccia tutto ciò che non è un letterale nei limiti | CONSOLE |
| `PLAN.md`, `HACK.md`, `DEPLOY.md`, `MOTION_SAFETY.md`, `CANTIERI.md`, `CLAUDE.md` | piano, verdetto e limiti, prompt di deploy, sicurezza del movimento, coordinamento dei 4 cantieri, regole per Claude Code | comuni |
