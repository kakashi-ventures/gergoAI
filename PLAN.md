# PLAN.md — piano per Claude Code · Gergo: si allena il braccio a voce, nella sua postazione

Grok Hackathon at the Museum, Pavia · **Track 04 — Voice Control** · caso pratico: **etichettatura di un pack**
Scritto alle 11:55 del 05/11/2026 · **T-04:05** · consegna e demo entro le **16:00**

> Come usarlo: ogni fase ha un **prompt da incollare in Claude Code**, un **check di accettazione** e un
> orario di taglio. Le fasi marcate `‖` girano in parallelo in sessioni separate, ognuna sulla propria cartella.

**Da consegnare alle 16:00:** l'MVP (URL Vercel + repo pubblico con README, dati, risultato contro baseline e
limiti), il **video di 3 minuti** (sezione 10) e il **pitch deck** (sezione 11).

---

## 0. Cosa costruiamo

**Il prodotto:** l'operatore allena il braccio a voce, in italiano, direttamente nella sua postazione. Una
memoria tiene il linguaggio della postazione, le routine insegnate e tutto ciò che succede nei cicli; da lì
il sistema nota anomalie e pattern e propone ottimizzazioni che l'operatore approva a voce, e che si misurano
al ciclo successivo.

**Il caso pratico:** etichettare un pack. L'operatore insegna a voce il ciclo *solleva → sposta → applica*, gli
dà un nome, lo fa ripetere, segnala i problemi ("è storta") e a fine turno chiede il resoconto.

**Decisioni (correggibili in 2 minuti):**
1. **Track 04.** Copriamo il nucleo della traccia (3–5 skill, conferma, stop, rendiconto) e i suoi due stretch:
   sequenze di skill e nuova skill registrata a voce. La seconda è proprio il nostro "allenamento".
2. **Le primitive di movimento sono insegnate sul pendant** con lo staff, una per luogo. A voce si allena tutto
   il resto: nomi, routine, varianti, ordine dei passi. Nessuna coordinata esce dal software.
3. **"Applicare" significa premere con lo spintore** in stazione. L'etichetta la posa l'operatore quando il
   sistema glielo chiede: senza pinza il braccio non preleva dal foglio. Da confermare con lo staff al primo slot.
4. **Ottimizzazione ricorsiva con un umano nel loop.** Si osserva, si propone, l'operatore approva, si misura,
   si tiene o si torna indietro. Ogni routine è versionata e niente si modifica da solo.
5. **Grok è il nucleo.** Grok Voice gestisce il dialogo e le function call; Grok trasforma le istruzioni
   in routine strutturate e racconta pattern e report. Il codice valida, conta e decide se un comando si esegue.
6. **Hosting:** la console e l'orchestratore (API) su Vercel, Supabase per memoria, registro e canale realtime,
   più un bridge Python locale sul laptop collegato alla rete del braccio. Vercel non raggiunge il braccio:
   è il bridge che va a prendere i comandi.

---

## 1. Architettura

```
 Operatore (voce)
     │
     ▼
 Client voce ── Grok Voice Agent (wss://api.x.ai/v1/realtime, VAD server, function calling)
  · nel browser della console Vercel, se docs.x.ai prevede token effimeri per il browser
  · altrimenti un agente Python locale accanto al bridge (decisione in P0)
     │ ogni function call va a ▼
 Vercel · Next.js
  ├─ /console            postazione, routine, timeline dei cicli, osservazioni, proposte, report
  └─ /api/tools/*        orchestratore: validatore · memoria · routine · pattern miner · report
          │
 Supabase (Postgres + Realtime)
  places · skills · bindings · routines · routine_runs · commands · events · observations · proposals · bridge_status
          │ (subscribe / poll)
          ▼
 Bridge locale (Python) ── --mode sim   simulatore della postazione, durate reali misurate al 1° slot
                        └─ --mode elite avvia i task pre-insegnati (load/start), STOP da tastiera
```

**Postazione di etichettatura (ontologia):** luoghi `INGRESSO`, `STAZIONE`, `USCITA`, `SCARTI`, `HOME` · oggetti:
vassoi asolati `T1…T3` con pack · etichette `FRONTALE`, `RETRO` (le posa l'operatore).

**Primitive (task sul pendant, uno per luogo):** `solleva(luogo)`, `deposita(luogo)`, `porta(luogo)`,
`applica()` (pressione in STAZIONE), `home`, `stop`. Il validatore conosce precondizioni ed effetti: non si solleva
con la forchetta occupata, non si applica fuori da STAZIONE, e così via.

---

## 2. Layout della repo

Nome proposto: `kakashi-ventures/grok-pavia-gergo` (pubblica, come richiede la consegna).

```
/web            Next.js App Router + TypeScript + Tailwind (Vercel, root directory = web)
  /app/console  /app/api/tools/*  /lib/{contracts,validator,memory,routines,miner,report}.ts
/voice          client voce locale (solo se il browser non è possibile)
/bridge         Python 3.11: main.py, adapters/sim.py, adapters/elite.py, contracts.py
/eval           check set del linguaggio, test con principianti, metriche
/shared         contracts.md, schemas/*.json, fixtures/*.json (validati sia da zod sia da pydantic)
/supabase       migrations/*.sql
CLAUDE.md  HACK.md  PLAN.md  README.md  .env.example  .gitignore
```

---

## 3. Contratti (si congelano in P0; li cambia solo il responsabile di S1)

```jsonc
// Binding — lessico della postazione
{ "expression": "il carrello", "means": { "place": "USCITA" }, "alpha": 1, "beta": 1,
  "regime": "WORKING|CANONICAL", "uses": 0, "last_used": "…" }

// Routine — memoria procedurale, versionata
{ "name": "frontale", "version": 2, "parent_version": 1,
  "steps": [ { "skill": "solleva", "place": "INGRESSO" }, { "skill": "porta", "place": "STAZIONE" },
             { "skill": "attendi_operatore", "prompt": "metti l'etichetta frontale" },
             { "skill": "applica" }, { "skill": "deposita", "place": "USCITA" } ],
  "taught_by_voice": true, "source_utterance": "…", "status": "active|retired" }

// Command — l'unica cosa che il bridge esegue
{ "id": "…", "skill": "solleva|deposita|porta|applica|home|stop", "params": { "place": "STAZIONE" },
  "routine_run_id": "…", "step": 2,
  "status": "queued|confirmed|running|done|failed|cancelled", "confirmed_at": "…" }

// Event — il registro di tutto
{ "id": "…", "ts": "…", "type": "utterance|interpretation|confirmation|correction|step_start|step_end|
  feedback|stop|anomaly|proposal|approval", "routine_run_id": "…", "step": 2,
  "payload": { "duration_ms": 0, "ok": true, "text": "è storta" } }

// Observation — ciò che la memoria nota
{ "id": "…", "kind": "anomaly|pattern", "rule": "slow_step|repeated_failure|repeated_correction|
  repeated_sequence|redundant_step", "evidence": ["event_id", "…"], "summary": "…" }

// Proposal — ottimizzazione da approvare a voce
{ "id": "…", "observation_id": "…", "change": { "routine": "frontale", "from_version": 1, "to_version": 2,
  "diff": "rimuovi home tra i cicli" }, "status": "pending|approved|rejected|reverted",
  "metric": "cycle_time_ms", "before": 0, "after": null }
```

## 4. Memoria e ottimizzazione ricorsiva (le regole, in codice)

**Lessico** (politica di alto livello su primitive fisse, appresa dal reward umano):
- "sì" alla conferma → `alpha += 1` sui binding usati; "no, intendevo…" → `beta += 1` sul binding sbagliato e
  nuovo binding `WORKING`.
- Promozione a `CANONICAL` con `alpha / (alpha + beta) ≥ 0,8` e almeno 3 usi: niente domanda di chiarimento,
  resta la conferma del movimento. Una correzione su un binding `CANONICAL` lo riporta a `WORKING`.

**Routine:**
- "Ti insegno…", "chiamalo…" → Grok produce i `steps` → il validatore li controlla rispetto all'ontologia → il
  sistema li **rilegge a voce** → "sì" salva la versione 1.
- "Fai la frontale tre volte" → `routine_run` con conferma unica all'inizio e stop sempre attivo.

**Pattern miner** (deterministico, gira dopo ogni ciclo; Grok racconta soltanto il risultato):
- `slow_step`: durata del passo oltre mediana + 3 MAD delle ultime esecuzioni.
- `repeated_failure`: lo stesso passo fallisce 2 volte su 5.
- `repeated_correction`: la stessa correzione o lo stesso feedback ("storta") sullo stesso passo, 2 volte.
- `repeated_sequence`: la stessa sequenza dettata passo per passo 3 volte → propone di farne una routine.
- `redundant_step`: un `home` o un'attesa tra due passi che non lo richiedono → propone di toglierlo.

**Loop:** osservazione → proposta detta a voce ("Ho notato che… Vuoi che…?") → approvazione → nuova versione →
si misura su `cycle_time_ms` e sulle correzioni per ciclo → se peggiora, il sistema propone di tornare indietro.

**Sicurezza:** Grok non emette coordinate · ogni comando passa dal validatore · un solo comando alla volta con
timeout · qualsiasi parlato durante un movimento (inizio parlato del VAD) manda STOP · l'e-stop fisico resta
allo staff: la voce non è una funzione di sicurezza.

---

## 5. CLAUDE.md (P0 lo scrive nella root)

```markdown
# Regole per Claude Code — grok-pavia-gergo
Contesto: hackathon, consegna alle 16:00 del 05/11/2026. Una cosa funzionante end to end batte cinque a metà.
Prodotto: allenare un braccio a voce nella sua postazione, con memoria di lessico, routine, anomalie e pattern.
- Stack: Next.js App Router + TS su Vercel (/web), Supabase (DB, Realtime), bridge Python (/bridge).
- I contratti in /shared sono la verità: non cambiarli senza aggiornare zod, pydantic e fixtures nello stesso commit.
- Grok Voice per il dialogo e le function call; ogni function call passa da /api/tools e dal validatore.
- Il modello interpreta, il codice decide: validazione, conteggi, regole del pattern miner e numeri del report
  sono deterministici. Grok racconta numeri che riceve, non li calcola.
- Sicurezza del braccio: il bridge esegue solo primitive della whitelist con confirmed_at, una alla volta, con
  timeout. Niente movimenti liberi, niente coordinate. In mode elite chiedi conferma all'umano prima del primo
  comando reale.
- Ogni ottimizzazione è una nuova versione di routine approvata da una persona; mai modifiche automatiche.
- Segreti: XAI_API_KEY e SUPABASE_SERVICE_ROLE_KEY mai nel client né nel repo; .env* in .gitignore.
- Dopo ogni milestone: test verdi, commit, push. Il lavoro che resta sul disco non esiste.
- Prima di dire "fatto", esegui il check di accettazione della fase e riportane l'output.
```

---

## 6. Fasi, con i prompt

### P0 · 12:00–12:20 · Setup e prova della voce (una sessione)

**Prompt:**
> Leggi PLAN.md e HACK.md. Crea la repo pubblica `kakashi-ventures/grok-pavia-gergo` con `gh`, il layout della
> sezione 2 e il CLAUDE.md della sezione 5. Scrivi i contratti della sezione 3 in /shared (schemas, fixtures,
> contracts.md), gli schemi zod in /web/lib/contracts.ts e i modelli pydantic in /bridge/contracts.py, con un test
> per lato che valida le fixtures. Crea l'app Next.js in /web e collegala a un progetto Vercel con root directory
> `web`. Scrivi .env.example. Poi verifica su docs.x.ai: modello Grok Voice corrente, supporto all'italiano,
> function calling, eventi di inizio parlato e interruzione, e se esistono token effimeri per collegarsi dal browser.
> Scrivi i risultati in /shared/xai-notes.md. Infine scrivi /eval/probe_voice.py: apre una sessione realtime con
> 3 tool finti (propone_azione, definisci_routine, resoconto), mi fa dire 10 frasi in italiano dal microfono e
> stampa per ognuna la trascrizione, la function call con i suoi argomenti e la latenza tra fine parlato e
> function call.

**Check:** URL di anteprima Vercel · test dei contratti verdi su entrambi i lati · probe_voice su 10 frasi.

**Kill criterion (scritto prima):** meno di 8 frasi su 10 con la function call giusta, o latenza mediana oltre
2,5 s → si passa a push-to-talk con trascrizione e risposta separate; la voce realtime resta solo per il report.

**Decisione di fine P0:** client voce nel browser (se ci sono token effimeri) o locale in /voice.

### P1 · 12:20–13:00 · Walking skeleton ‖ tre sessioni

**S1 — console e orchestratore** (/web, /supabase)
> Implementa le migration Supabase per places, skills, bindings, routines, routine_runs, commands, events,
> observations, proposals, bridge_status, con il seed della postazione di etichettatura (sezione 1). Implementa
> /api/tools/propone_azione: risolve espressioni con i bindings, valida precondizioni ed effetti sullo stato della
> postazione, crea il command `queued` e restituisce la frase di conferma da dire. Implementa
> /api/tools/conferma e /api/tools/stop. Crea /console: schema della postazione con la posizione del vassoio,
> timeline degli eventi in realtime, comando in attesa di conferma, pulsante STOP sempre visibile. Deploy su Vercel.

**S2 — bridge** (/bridge)
> Scrivi il bridge Python: `python main.py --mode sim`. Ascolta i command con status=confirmed (Supabase realtime,
> polling ogni 500 ms come fallback), ne esegue uno alla volta con timeout, scrive step_start e step_end con
> duration_ms e un heartbeat ogni 2 s in bridge_status. SimArm: durate realistiche con rumore, e un flag
> `--inject` che rende lento o fa fallire un passo scelto (servirà a provare il pattern miner). Il tasto `s` manda
> STOP e cancella i comandi in coda. adapters/elite.py solo come interfaccia con dry-run: niente connessione reale
> finché non te lo dico.

**S3 — voce ed eval** (/voice o /web/app/console/voice, /eval)
> Collega il client voce scelto in P0 a /api/tools: ogni function call di Grok chiama la route corrispondente e
> la risposta torna a Grok come risultato del tool. Istruzioni di sistema: italiano, frasi brevi, conferma sempre
> prima di un movimento, mai coordinate. Poi scrivi eval/checkset.jsonl: 30 comandi della postazione con risposta
> attesa — 10 standard ("solleva il vassoio dall'ingresso"), 10 gergo e deissi ("tira su il primo", "portalo al
> carrello"), 5 riferimenti a routine ed episodi ("rifai la frontale", "come prima"), 5 sequenze. Split 10/20.

**Check P1:** dico "solleva il vassoio dall'ingresso" → conferma parlata → "sì" → il bridge in sim esegue →
l'evento compare su /console in meno di 2 secondi, sull'URL Vercel.

**Taglio alle 13:00:** se il realtime non va, il bridge usa solo il polling. Se Vercel non va, si fa la demo da
`next dev` e la consegna su Vercel resta separata.

### P2 · 13:00–13:45 · Allenamento a voce e lessico (S1 + S3)

> Implementa /api/tools/definisci_routine: Grok passa la descrizione e una proposta di steps; il validatore li
> controlla sull'ontologia (luoghi esistenti, precondizioni in sequenza, `applica` solo in STAZIONE); la route
> restituisce la rilettura da dire. Su "sì" salva la versione 1. Implementa esegui_routine (con numero di
> ripetizioni e conferma unica), definisci_alias e i passi `attendi_operatore` (il sistema chiede di posare
> l'etichetta e aspetta "fatto"). Implementa gli aggiornamenti Beta e i regimi dei bindings (sezione 4). Test unitari
> su fixtures: una correzione cambia l'interpretazione successiva, tre conferme promuovono a CANONICAL.

**Check:** a voce si insegna la routine "frontale" (solleva, porta, attendi etichetta, applica, deposita in
uscita), la si esegue due volte in sim, e "portalo al carrello" funziona dopo una sola correzione.

### P3 · primo slot braccio (~13:00–13:30) · S2 con lo staff

> Siamo al braccio con lo staff. Aiutami a collegare adapters/elite.py: cerca la documentazione ufficiale Elite Robots
> CS per la modalità remota e per caricare e avviare un task dal Dashboard (il driver ROS2 ufficiale espone
> load/start/stop; porte e comandi esatti vanno verificati con lo staff). Implementa solo trigger di task già insegnati,
> uno per primitiva e luogo. Prima di ogni invio reale mostrami il comando e aspetta il mio ok.

**Lavoro umano nello slot:** insegnare sul pendant i task delle primitive (circa 8) · decidere cosa fa `applica` ·
cronometrare ogni task: le durate vere vanno nel SimArm.

**Check:** una primitiva parte dal laptop e il bridge registra `step_end` con `ok: true`.

### P4 · 13:45–14:30 · Pattern miner, proposte e report (S1)

> Implementa /lib/miner.ts con le cinque regole della sezione 4, eseguito dopo ogni routine_run; scrive
> observations con le evidenze. Per ogni observation che lo consente crea una proposal con il diff della routine e la
> metrica di confronto. /api/tools/approva_proposta crea la nuova versione e registra `before`; dopo il ciclo
> successivo calcola `after`. /api/tools/resoconto: numeri del turno in SQL (cicli per routine e versione, tempo medio
> di ciclo, correzioni, stop, anomalie, proposte approvate e il loro effetto, binding promossi); Grok li riceve e li
> racconta in tre frasi. Su /console mostra i numeri accanto al testo.

**Check:** con `--inject slow:applica` e un "home" inutile nella routine, dopo 3 cicli il sistema dice cosa ha
notato e propone di togliere il home; dopo l'approvazione la versione 2 ha un tempo di ciclo più basso, e il
resoconto ripete esattamente i numeri della query.

### P5 · 14:00–14:30 · Misura contro baseline ‖ S3

> Scrivi eval/run.py: sul check set (20 comandi di test) misura A) regole a parole chiave, B) Grok senza memoria,
> C) Grok con la memoria dopo i 10 comandi di addestramento: accuratezza skill + parametri, turni di chiarimento,
> esecuzioni senza conferma (deve essere 0). Misura anche, in sim, quanti enunciati servono per 5 cicli di
> etichettatura con e senza routine. Scrivi le tabelle in README.md e i risultati grezzi in eval/results/*.json.

**Test con persone vere (10 minuti):** 3 persone che non hanno mai usato il braccio (altri team, mentor) insegnano
a voce la routine frontale in sim. Si misura il tempo fino al primo ciclo corretto.

**Kill criterion:** C non migliora B di almeno 15 punti sui comandi di test, o meno di 2 principianti su 3 hanno
un ciclo corretto entro 5 minuti → il pitch dice "esegue a voce routine insegnate", non "impara".

### P6 · secondo slot braccio (~14:30–15:00) · registrazione

Flusso completo dal vivo: insegnamento della routine, due cicli, un "è storta", la proposta approvata, il
resoconto. Video intero, salvato in due posti.

**Shot list per il video (sezione 10)**, da girare col telefono orizzontale, 1080p, audio dal microfono dell'operatore:
1. Piano largo della postazione: braccio, vassoi, operatore con headset (5 s).
2. L'operatore insegna la routine "frontale" a voce, in un'unica ripresa (30–40 s).
3. Primo ciclo completo: solleva, sposta, l'operatore posa l'etichetta, applica, deposita (20 s).
4. "È storta": la reazione del sistema (10 s).
5. Registrazione dello schermo della console: proposta, approvazione, tempo di ciclo v1 contro v2 (20 s).
6. "Fammi il resoconto del turno": audio pulito (15 s).
7. Dettaglio dello STOP: parola o tasto, il braccio si ferma (5 s).

### P7 · 15:00–15:15 · Freeze

> Feature freeze. Aggiorna README.md: cos'è, come si esegue da zero (console, bridge sim, voce, eval), i dati
> usati, le tabelle di P5, i limiti noti presi da HACK.md. Controlla che nel repo non ci siano segreti (git log
> compreso), deploy di produzione su Vercel, push finale.

**Lavoro umano:** ruotare le chiavi se sono mai finite in un commit · controllare il saldo xAI.

### P8 · 15:15–15:55 · Pitch, montaggio del video, consegna

- 15:00–15:35 montaggio finale del video (sezione 10): si inseriscono le riprese di P6 e i numeri di P4 e P5.
- 15:15–15:45 due prove cronometrate del pitch col deck (sezione 11), Q&A pronte.
- **Entro le 15:45** export MP4 del video e PDF del deck, caricati sul portale insieme all'URL Vercel e al repo.
  Quindici minuti di margine per l'upload sulla rete della sala.

Nessun lavoro sul codice dopo il freeze.

---

## 7. Sessioni parallele

| Sessione | Cartelle | Fasi | Profilo |
|---|---|---|---|
| S1 console e orchestratore | /web, /supabase, /shared | P0, P1, P2, P4, P7 | full-stack |
| S2 bridge | /bridge | P1, P3, P6 | chi sta al braccio |
| S3 voce ed eval | /voice, /eval | P1, P2, P5 | chi scrive il pitch |
| S4 racconto (chat Claude, non Claude Code) | — | sezioni 10 e 11 | chi presenta |

Regole: ogni sessione tocca solo le sue cartelle · `git pull --rebase` prima di ogni push · /shared lo cambia solo S1.
S4 riceve da S3 i numeri di P4 e P5 appena ci sono, e da S2 le riprese di P6.

## 8. Lavoro umano in parallelo, adesso

1. **Slot braccio:** prenotarne due (circa 13:00 e 14:30) e chiedere allo staff come si avvia un task da remoto.
2. **Materiale:** 3 vassoi asolati con un pack ciascuno, etichette adesive, segni sul tavolo per i luoghi.
3. **Principianti:** trovare 3 persone per il test di P5.
4. **Microfono:** un headset o un microfono direzionale. In sala ci sarà rumore, e il VAD reagisce a tutto.

## 9. Demo (≤ 3 minuti) e il caso nuovo della giuria

1. **0:00–0:20** Chi lavora in linea non programma il cobot: oggi lo allena il tecnico, con il teach pendant.
2. **0:20–1:10** **Allenamento a voce:** "Ti insegno l'etichettatura frontale…" → il sistema rilegge la routine →
   "sì" → primo ciclo. "È storta" → registrata.
3. **1:10–1:40** **Il caso nuovo della giuria:** un giurato chiede una variante ("fai il retro e mettilo negli
   scarti") o dà un nome nuovo a un luogo. Prima chiede, dopo una correzione capisce.
4. **1:40–2:20** **Ottimizzazione:** "Ho notato che tra un ciclo e l'altro torno sempre a casa: vuoi che lo tolga?"
   → "sì" → versione 2, tempo di ciclo prima e dopo a schermo.
5. **2:20–3:00** **Resoconto del turno** a voce, le tabelle A/B/C e il test con i principianti, i limiti, cosa
   testeremmo la settimana prossima e il numero che ci fermerebbe.

---

## 10. Video di 3 minuti (S4)

**Cosa deve dire:** la soluzione, perché è innovativa, quanto può valere sul mercato, come riduce i tempi di
allenamento delle postazioni. **Formato:** 3:00, 16:9, 1080p, narrazione in italiano con sottotitoli, MP4.

**Produzione:**
- Le parti animate (problema, come funziona, loop di ottimizzazione, mercato, risultati) le prepara S4 in questa
  chat come film animato esportabile in MP4, con gli spazi per le riprese reali.
- Le riprese reali sono quelle della shot list di P6. Se il film animato non accetta le clip, il montaggio
  finale si fa in un editor qualsiasi (CapCut, iMovie, DaVinci): 15 minuti.
- Narrazione con una voce Grok (coerente con la traccia) o con la voce di chi presenta.
- **Ripiego:** registrazione dello schermo del deck più le riprese della demo, con la voce dal vivo.

**Sceneggiatura (tempi fissi):**

| Tempo | Cosa si vede | Cosa si dice | Numeri (con marker) |
|---|---|---|---|
| 0:00–0:15 | Linea ferma, operatore che aspetta | Ogni volta che il prodotto cambia, il cobot si ferma e aspetta il tecnico. | — |
| 0:15–0:40 | Teach pendant, calendario dell'integratore | Riprogrammare una cella di packaging costa giorni; chi lavora in linea non può farlo; nessuno registra perché i cicli peggiorano. | 1,5 giorni per riposizionare una cella di packaging [dichiarato dal vendor: OnRobot] |
| 0:40–1:30 | **Ripresa reale:** routine insegnata a voce, primo ciclo, "è storta" | Con Gergo l'operatore allena il braccio a voce, nella sua postazione: lo spiega, lo nomina, lo corregge. | tempo al primo ciclo corretto di un principiante [P5, misurato] |
| 1:30–2:00 | Console: osservazione → proposta → "sì" → v1 contro v2 | La memoria della postazione nota cosa rallenta o si ripete e propone una versione migliore; la approva l'operatore, il sistema la misura. | tempo di ciclo v1 contro v2 [P4, misurato in sim] |
| 2:00–2:20 | Le tre memorie, il validatore, lo stop | Perché è nuovo: non insegniamo movimenti al modello, gli insegniamo la postazione. Ogni miglioramento è versionato, approvato e reversibile. | — |
| 2:20–2:45 | Mappa e conteggio delle postazioni | Quanto vale: il valore cresce con ogni cambio ciclo evitato e con ogni postazione. | sezione 12 |
| 2:45–3:00 | Tabella A/B/C, prossimo passo | Cosa abbiamo misurato oggi e cosa testiamo la settimana prossima in una fabbrica vera. | P5 |

**Regole:** ogni numero a schermo porta il suo marker · la parola "ipotesi" accompagna ogni stima · le anomalie
iniettate in simulazione si dichiarano · nessuna ripresa simulata spacciata per reale.

**Orari:** sceneggiatura chiusa 13:15 · parti animate v1 14:15 · numeri inseriti 14:40 · riprese entro 15:00 ·
montaggio 15:35 · export e upload entro 15:45.

## 11. Pitch deck (S4)

Stessa storia del video, 11 slide, 16:9, preparato da S4 in questa chat (scaricabile in PDF e PPTX). Se tra i
design system disponibili c'è quello KVA, si usa quello.

1. **Titolo** e UVP in una riga.
2. **Problema:** il cobot si ferma a ogni cambio prodotto; i tempi di riprogrammazione convenzionali (sezione 12).
3. **Insight:** il modello non conosce la postazione; è quello che va allenato.
4. **Soluzione:** si allena a voce, nella postazione; le tre memorie (lessico, routine, registro).
5. **Demo:** fotogrammi delle riprese di P6 e un QR al video.
6. **Come funziona:** architettura e sicurezza (primitive pre-insegnate, validatore, conferma, stop, e-stop fisico).
7. **Ottimizzazione ricorsiva:** osserva → propone → approva → misura → tiene o torna indietro, con v1 contro v2.
8. **Risultati di oggi:** tabella A/B/C e test con i principianti.
9. **Perché è innovativo e cosa non si copia:** copy test detto onestamente.
10. **Mercato e modello di business:** conteggio bottom-up e prezzo per postazione come ipotesi (sezione 12).
11. **Prossimo passo:** il pilota di una settimana, la soglia che ci fermerebbe, il team KVA.

**Orari:** v1 con i segnaposto 13:30 · numeri di P4 e P5 14:40 · versione finale 15:15, prima delle prove ·
PDF entro 15:45.

## 12. Numeri per video e deck

**Verificati:**
- Nel mondo, 603.000 robot industriali installati nel 2025, con uno stock operativo di 5,079 milioni; i cobot
  sono 66.000, circa l'11% delle installazioni [verificato: IFR, President's Report 2026].
- In Italia, 7.824 installazioni nel 2025, secondo mercato europeo; alimentare e bevande 1.086,
  pallettizzazione 817 [verificato: Universal Robots su dati IFR World Robotics 2026].

**Benchmark dei vendor (non indipendenti, da citare come tali):**
- Una cella di packaging: prima installazione in 2,5 giorni con programmazione convenzionale; riposizionamento in
  1,5 giorni convenzionale contro 1,5 ore con lo strumento del vendor [dichiarato dal vendor: OnRobot, test propri].
- Programmazione vocale di cobot UR: fino al 43% di tempo in meno [dichiarato dal vendor: Konica Minolta CoboVox, 2023].
- Il braccio vale il 40–50% del costo di una cella installata [non verificato: anteprima di un blog di settore].

**Misurati da noi oggi:** tempo al primo ciclo corretto per un principiante a voce (P5) · tempo di ciclo v1
contro v2 (P4, in simulazione) · check set A/B/C (P5).

**Il calcolo del valore (bottom-up, con le ipotesi dichiarate):**
```
valore per postazione all'anno =
    cambi ciclo all'anno × (ore convenzionali − ore con Gergo) × costo orario del tecnico
  + ore di fermo linea evitate × valore orario della linea
```
- Ipotesi da dichiarare a schermo: cambi ciclo per postazione al mese, costo orario del tecnico, prezzo per postazione.
- Flusso di nuove postazioni: 66.000 cobot all'anno nel mondo [verificato]; in Italia circa 860 all'anno
  (stima: la quota mondiale dell'11% applicata alle 7.824 installazioni italiane, non un dato italiano).
- Unità di ricavo, non quote di mercato: ogni 100 postazioni a un prezzo ipotetico di 100 € al mese fanno 120.000 €
  di ricavo ricorrente all'anno. Il prezzo va testato nel pilota.
