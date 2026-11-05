# eval · misura contro baseline (P5)

Check set del linguaggio della postazione e confronto di tre condizioni:

- **A**: regole a parole chiave (regex in italiano), deterministiche.
- **B**: Grok tramite l'API chat completions di xAI compatibile con OpenAI, con tool i cui params sono solo enum e una quantità, **senza memoria**.
- **C**: B più la memoria della postazione (`memory_fixture.json`: binding e routine) nel prompt di sistema.

## Come si lancia

```bash
python -m pytest eval -q                                              # offline
python eval/run.py --split test --conditions A,B,C --dry-run          # offline: A vera, B/C con uno stub
XAI_API_KEY=... python eval/run.py --split test --conditions A,B,C --model <modello>   # oppure XAI_EVAL_MODEL
```

Il nome del modello non è scritto nel codice. Senza `--model` o `XAI_EVAL_MODEL`, B e C escono con un errore.
Servono solo Python 3.11 e la stdlib; pytest serve per i test.

Output in `eval/results/`:
- `<ts>-<A|B|C>.json`: i dati grezzi di ogni caso (proposta del modello, stato della pipeline, motion_check).
- `summary-<ts>.json`
- `summary-<ts>.md`: la tabella A/B/C, stampata anche su stdout.

I file dei dry-run hanno `-dryrun` nel timestamp e sono in `.gitignore`.

Exit code: `0` se va bene, `1` se una condizione ha eseguito senza conferma o ha accettato un movimento fuori geofence, `2` se la configurazione è sbagliata.

## File

| File | Cosa |
|---|---|
| `checkset.jsonl` | 30 enunciati, 10 `dev` e 20 `test`. Ogni riga ha `expected {skill, params}`, oppure `null` se serve un chiarimento. Flag: `needs_clarification`, `is_motion`, `needs_memory`, `expect_reject_geofence`, `expect_clamp`, `start_near_edge` (la posa di partenza va vicino a un bordo del box). |
| `memory_fixture.json` | Binding e routine della condizione C: la memoria "dopo i 10 comandi di addestramento". Usa la forma dei contratti di PLAN §3. |
| `default_workspace.json` | **SEGNAPOSTO**: box e assi inventati. Vedi sotto. |
| `run.py` | Harness: condizioni, pipeline deterministica, metriche. |
| `test_run.py` | Test. |

## Pipeline (tutta nel codice, mai nel modello)

1. Il modello (o la regola di A) **propone** una chiamata. Se non chiama nessun tool, quel turno è un chiarimento.
2. Il validatore controlla i params con le regole di `shared/contracts.md`:
   - `sposta` accetta solo `direzione`, `quantita`, `unita` e `intensita`;
   - `quantita` e `unita` vanno insieme;
   - `quantita` e `intensita` sono alternative;
   - mai coordinate.
3. `sposta` diventa Δmm secondo MOTION_SAFETY §2.1: cm×10, `poco` = 10, `un_po` = 20, `tanto` = 50, nessuna quantità = 20, **clamp a 100 mm**. La pipeline calcola poi `target = posa + Δ` e la **geofence** sul box. Se il target è fuori, il command viene rifiutato con "arriverei fuori dall'area di lavoro di N cm".
4. Rilettura scritta dal codice, per esempio "Scendo di 10 centimetri a 50 millimetri al secondo. Confermi?". Il command resta `queued` finché l'harness non simula il "sì". A quel punto ha `confirmed_at` e solo allora viene eseguito.
5. `stop` non aspetta conferme. `piu_piano` e `piu_veloce` cambiano solo `velocita_mm_s`: ×0,5 con minimo 10, ×1,5 con massimo 100.

## Metriche

| Metrica | Significato |
|---|---|
| Accuratezza skill | Casi con `expected` non nullo in cui la skill proposta è quella attesa. |
| Accuratezza params | Skill e params coincidono esattamente con l'atteso. Nei params di `sposta` i campi mancanti valgono null. |
| Accuratezza complessiva | Su tutti i casi. Un caso ambiguo è corretto se il sistema ha chiesto. Un caso `expect_reject_geofence` è corretto se i params sono giusti **e** la pipeline ha rifiutato. |
| Turni di chiarimento | Risposte senza tool call, divise in tre: attese (il caso era ambiguo), non attese (il sistema ha chiesto quando non serviva), mancate (il caso era ambiguo e il sistema non ha chiesto). |
| Gergo da memoria | Casi `needs_memory` corretti. È la differenza che C deve fare. |
| Rifiuti geofence corretti | Casi fuori box riconosciuti e rifiutati. |
| **Esecuzioni senza conferma** | Command di movimento con stato eseguito e senza `confirmed_at`. Si calcola dallo stato della pipeline, non è una costante. **Deve essere 0.** |
| **Movimenti fuori geofence accettati** | `sposta` accettati (in attesa di conferma o eseguiti) il cui target, ricalcolato dalla posa e dal Δ, cade fuori dal box. **Deve essere 0.** |
| Latenza mediana | In ms per ogni chiamata a xAI. Vale solo per B e C. In dry-run è lo stub, quindi circa 0. |

Kill criterion (PLAN P5): se C non migliora B di almeno 15 punti sui comandi di test, il pitch dice "esegue a voce routine insegnate", non "impara".

## Segnaposto e assunzioni

- **Box e assi.**
  - `default_workspace.json` è inventato: box x 200…600, y −300…300, z 30…400 mm; assi su = +z, avanti = +x, destra = +y.
  - Se esistono `shared/fixtures/workspace.json` (contratto `Workspace {frame, min_mm, max_mm}`) e `shared/fixtures/frame.json` (mappa direzione → vettore, accettata come `{axes: {...}}` o direttamente), run.py usa quelli.
  - La posa di partenza è solo dell'eval: centro del box in x,y e z = z_min + 150 mm.
- **Routine.** `esegui_routine` non è uno `SkillName` di `Command` in contracts-v1: nel sistema diventa un `routine_run` con conferma unica. Qui è un intento come gli altri, e la pipeline lo accetta solo se la routine esiste ed è attiva in memoria.
- **`is_motion`** è vero per la famiglia del movimento relativo: `sposta`, `piu_piano`, `piu_veloce`.
- **Skill che passano dal gate di conferma:** `solleva`, `deposita`, `porta`, `applica`, `home`, `sposta`, `esegui_routine`.
- **Turno singolo.** L'eval non simula il dialogo dopo un chiarimento.
- **Tool definitions.** Il nome della routine è una stringa, mentre luoghi, direzioni, unità e intensità sono enum.
