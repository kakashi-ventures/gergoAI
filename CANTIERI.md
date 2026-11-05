# CANTIERI.md — 4 orchestratori in parallelo su `main`

Fonte dei compiti: **DEPLOY.md** (prompt 1–4), **PLAN.md**, **HACK.md**. Questo file decide chi possiede cosa
e come ci si coordina. Ogni cantiere aggiorna **solo la propria riga** della tabella di stato.

## I quattro cantieri

| Cantiere | Prompt in DEPLOY.md | Possiede (scrive solo qui) | Consegna |
|---|---|---|---|
| **FONDAMENTA** | 3 · Vercel env e Supabase | `/supabase/config*`, `.env.example`, `bridge/.env.example`, `web/app/api/health`, `vercel.json` | DB online con RLS e realtime, env su Vercel, `/api/health` verde |
| **BRIDGE** | 1 · base Python, contratti, composer, report | `/shared`, `/bridge` (tranne `bridge/adapters/elite.py`), `/supabase/migrations/1*_*.sql`, `/reports` | contratti congelati, bridge in sim, composer, `deploy_report` |
| **CONSOLE** | 2 · web app voice control | `/web` (tranne `web/app/api/health`), `/supabase/migrations/2*_*.sql`, `/shared/xai-notes.md`, `/voice` | console su Vercel, route `/api/tools/*`, voce, registro |
| **BRACCIO** | 4 · SDK verso il controller EC, poi P5 di PLAN.md | `/sdk`, `bridge/adapters/elite.py`, `/shared/fixtures/elite_*.json`, `/eval` | `gergo_sdk` testato sul mock, probe e un JBI sul robot vero; dopo lo slot, check set e baseline A/B/C |

File comuni (`README.md`, `CLAUDE.md`, `CANTIERI.md`): si toccano solo con commit piccoli e dedicati.

## Dipendenze e ordine

```
FONDAMENTA ──(DB + env, ~12:35)──────────────────────────┐
BRIDGE ──(contratti /shared, tag contracts-v1, ~12:30)──┬─┼─► CONSOLE (route e zod sui contratti)
                                                        └─┼─► BRACCIO (protocol sui contratti)
                                                          └─► tutti: test su DB vero
```

- Fino a `contracts-v1`, CONSOLE e BRACCIO lavorano su ciò che non dipende dai contratti: layout della
  console e client voce per CONSOLE; client JSON-RPC, whitelist e mock per BRACCIO.
- Le migration le scrivono BRIDGE (`1xxx_`) e CONSOLE (`2xxx_`); **le applica solo FONDAMENTA**, che poi confronta
  `list_migrations` con i file. La migrazione è nel repo, il database no.
- I contratti li cambia solo BRIDGE. Chi ha bisogno di un campo lo chiede in "Richieste" qui sotto.

## Regole git (tutti lavorano su `main`)

1. Commit piccoli, solo nelle proprie cartelle. `git pull --rebase origin main` prima di ogni push.
2. Se il rebase va in conflitto su un file che non possiedi: **non risolverlo**. Annulla con `git rebase --abort`,
   scrivi in "Richieste", aspetta.
3. Niente force push su `main`, mai. Niente segreti nei commit (`.env*` è in `.gitignore`).
4. Dopo ogni milestone: test verdi, poi commit e push, poi aggiorna la tua riga di stato. Il lavoro che resta sul
   disco non esiste.

## Stato (ognuno aggiorna la sua riga: ora · fatto · prossimo · bloccato da)

| Cantiere | Ora | Fatto | Prossimo | Bloccato da |
|---|---|---|---|---|
| FONDAMENTA | — | — | progetto Supabase, migration, env | — |
| BRIDGE | — | — | contratti `/shared` → tag `contracts-v1` | — |
| CONSOLE | — | — | layout console + client voce | contratti |
| BRACCIO | — | — | client JSON-RPC 8055 + mock | — |

## Richieste tra cantieri

Formato: `- [ora] DA → A: cosa serve, perché` · chi la risolve la marca `✔ ora + commit`.

---

## Prompt di kick-off

Ogni orchestratore riceve il suo. Tutti iniziano con la stessa intestazione.

### Intestazione comune (va in testa a ciascuno)

```text
Sei l'orchestratore del cantiere <NOME> di Gergo (hackathon Grok, Pavia, consegna alle 16:00 del 05/11/2026).
Repo: kakashi-ventures/gergoAI, branch main. Prima di tutto: git pull --rebase origin main, poi leggi
CANTIERI.md, DEPLOY.md, PLAN.md e HACK.md. CANTIERI.md è vincolante: scrivi solo nelle cartelle del tuo cantiere,
coordina gli altri via "Richieste", aggiorna solo la tua riga di stato a ogni milestone.
Puoi usare subagenti per lavori indipendenti dentro le tue cartelle; tu resti responsabile di commit, push e
check. Una cosa funzionante end to end batte cinque a metà: se un pezzo sfora l'orario, taglia e segnalalo.
Prima di dire "fatto" esegui il check di accettazione del tuo prompt e riportane l'output.
```

### 1 · FONDAMENTA

```text
<intestazione comune con NOME = FONDAMENTA>

Il tuo compito è il prompt 3 di DEPLOY.md (Vercel env e Supabase). Sei il cantiere che sblocca gli altri.
Ordine:
1) Entro 15 minuti: progetto Supabase (chiedimi conferma prima di crearlo), URL e chiave publishable in
   .env.example (solo i nomi) e nelle env Vercel. Scrivi nella tua riga di stato "DB online".
2) Progetto Vercel con root directory web. Se /web non esiste ancora, aspetta il primo push di CONSOLE e
   intanto prepara le env.
3) Ogni 20 minuti, o quando BRIDGE o CONSOLE scrivono "migration pronte" in Richieste: git pull, applica le
   migration nuove in ordine, list_migrations contro i file, prova di RLS (INSERT anon rifiutata), tabelle nella
   publication realtime, get_advisors. Rispondi in Richieste con l'esito.
4) /api/health in web/app/api/health (è tuo): presenza delle env, non i valori, e ping a Supabase.
5) Alle 15:00: deploy di produzione, controllo dei segreti in tutta la storia git, saldo xAI (chiedimelo).
Non scrivi codice di prodotto: sei il custode dell'ambiente.
```

### 2 · BRIDGE

```text
<intestazione comune con NOME = BRIDGE>

Il tuo compito è il prompt 1 di DEPLOY.md (base Python, contratti, validatore, bridge, composer,
deploy_report). Gli altri due cantieri di codice dipendono dai tuoi contratti.
Ordine:
1) Entro le 12:30: /shared (schemas, fixtures valide e non valide, contracts.md) e /bridge/contracts.py con i
   test. Commit, push, git tag contracts-v1 && git push origin contracts-v1. Scrivi in Richieste
   "contracts-v1 pronto" per CONSOLE e BRACCIO.
2) Migration /supabase/migrations/1xxx_*.sql (ontology_versions, skills, seed della postazione), poi scrivi
   "migration pronte" per FONDAMENTA.
3) validator.py, main.py in sim con SimArm e --inject, composer.py. L'interfaccia RobotAdapter la definisci tu:
   pubblicala presto, perché BRACCIO la implementa in bridge/adapters/elite.py (file suo, non tuo).
4) deploy_report.py con test su un DB di fixture.
Ogni modifica ai contratti dopo contracts-v1: aggiorna schema, pydantic e fixtures nello stesso commit, nuovo tag
contracts-vN, avviso in Richieste.
```

### 3 · CONSOLE

```text
<intestazione comune con NOME = CONSOLE>

Il tuo compito è il prompt 2 di DEPLOY.md (web app voice control su Next.js e Vercel).
Ordine:
1) Subito, senza aspettare: crea /web (Next.js App Router, TS, Tailwind), il layout di /console con dati finti
   (header con STOP sempre visibile, lista comandi, routine, comando in attesa, registro, proposte, resoconto) e
   push, così FONDAMENTA collega Vercel. Leggi /shared/xai-notes.md se esiste. Se non esiste, verifica tu su
   docs.x.ai il modello Grok Voice, l'italiano, il function calling, gli eventi di inizio parlato e i token
   effimeri, e scrivili in /shared/xai-notes.md (unico file di /shared che è tuo). Decidi: voce nel browser o
   client locale in /voice. Kill criterion di P0: meno di 8 frasi su 10 con la function call giusta, o latenza
   mediana oltre 2,5 s → push-to-talk.
2) Appena c'è contracts-v1: lib/contracts.ts (zod sugli stessi JSON di /shared, test sulle fixtures) e
   lib/validator.ts con gli stessi casi di test del validatore Python.
3) Migration /supabase/migrations/2xxx_*.sql e view v_cycle_stats, v_shift_summary, v_ontology_status, poi
   "migration pronte" per FONDAMENTA.
4) Route /api/tools/* e client voce, poi la console sui dati veri in realtime.
Non toccare web/app/api/health: è di FONDAMENTA.
```

### 4 · BRACCIO

```text
<intestazione comune con NOME = BRACCIO>

Il tuo compito è il prompt 4 di DEPLOY.md (gergo_sdk verso il controller Elite EC). La fonte è
EC_SDK_SocketManual_Ver3.19.2.pdf nella root: cita le pagine.
Ordine:
1) Subito, senza aspettare nessuno: /sdk con EcClient (JSON-RPC 8055, whitelist dei metodi), il mock con i
   suoi scenari e i test. Push.
2) Appena c'è contracts-v1: gergo_sdk.protocol allineato ai contratti di /shared. Le fixture elite_*.json in
   /shared/fixtures sono tue.
3) Appena BRIDGE pubblica RobotAdapter: bridge/adapters/elite.py.
4) Al primo slot braccio (~13:00) mi chiedi IP, serie e nomi dei JBI; poi probe read-only, e un solo JBI in armed
   dopo il mio ok esplicito. Poi time_tasks, sempre con conferma per ogni JBI.
5) Dopo lo slot: P5 di PLAN.md in /eval (checkset.jsonl 30 comandi, split 10/20, eval/run.py con A parole
   chiave, B Grok senza memoria, C Grok con memoria; risultati in eval/results/*.json). Le tabelle per il README le
   passi in Richieste.
Mai un comando reale al robot senza mostrarmelo e aspettare il mio ok. L'e-stop è fisico ed è dello staff.
```
