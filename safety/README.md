# safety — arresto vocale e acustico

## Cos'è e cosa non è

`audio_guard` è uno **stop software rapido**: ascolta il microfono e, se sente una parola di stop, una botta, un
urlo o uno sfregamento durante un movimento, manda `stop` al controller del braccio (Elite serie CS, Dashboard
Shell TCP 29999).

**Non è un arresto di emergenza.** L'e-stop è il pulsante fisico cablato dello staff (ISO 13850 / 13849): stacca
i motori e chiude i freni. Questo processo si aggiunge all'e-stop e alla rilevazione di collisione del controller,
non li sostituisce mai. Nel pitch e nella documentazione si chiama "arresto vocale e acustico", non "e-stop vocale".
Riferimento: `MOTION_SAFETY.md` §3.

## Come funziona

```
microfono → frame da 20 ms → AudioGuardDetector → trigger → stopper.stop() SUBITO
                                                        └→ dopo: log, callback, event "safety_trigger" su Supabase
heartbeat ogni 250 ms → guard_status (Supabase) / callback / file      (il bridge rifiuta i movimenti se > 1 s)
```

| Trigger | Regola (relativa alla baseline) | Priorità |
|---|---|---|
| parola | Vosk offline, grammatica `stop, fermo, basta, alt, [unk]` | 1 |
| botta | energia +15 dB in < 10 ms (sotto-blocchi da 5 ms), livello > baseline + 15 dB, crest factor > 3.5 | 1 |
| urlo | RMS > baseline + 20 dB e centroide > 1200 Hz per ≥ 100 ms | 2 |
| sfregamento | solo con braccio in moto: banda ≥ 4 kHz > profilo moto + 10 dB e flatness > profilo + 0.1 per ≥ 300 ms | 3 |

Lo spettro (centroide, flatness, banda alta) è una DFT vera da 64 punti con finestra di Hann (Welch sui 5
blocchi del frame): con numpy se c'è, altrimenti in puro Python (~1 ms a frame).

- Dopo un trigger si ignora tutto per 1 s (debounce).
- **Fail-safe:** stream del microfono in errore, stdin chiuso o nessun frame per più di 500 ms → `stop()`,
  heartbeat con `alive=false`, poi heartbeat fermo. Il guard non riparte da solo: va rilanciato.
- Lo stop non passa mai da rete esterna o cloud: Supabase si scrive in un thread separato, dopo.

## Dipendenze

Solo libreria standard. Opzionali:

- `vosk` + modello `vosk-model-small-it-0.22` in `safety/models/` (o `VOSK_MODEL_PATH`): senza, la parola chiave
  è **disabilitata** e il log lo dice con un errore ben visibile.
- `sounddevice`: microfono. Senza, si usa `--stdin` con PCM int16 LE mono a 16 kHz.
- `numpy`: solo per uno spettro più veloce.
- Supabase: `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` nell'ambiente. Trigger → insert in `events`
  (`type = safety_trigger`, payload `SafetyTriggerPayload`); heartbeat → upsert in `guard_status`
  (`bridge_id`, `alive`, `last_heartbeat_at`, `last_trigger`). Senza variabili si scrive solo nel log, e con
  `--heartbeat-file PATH` (o `AUDIO_GUARD_HEARTBEAT_FILE`) l'ultimo heartbeat va in un file json.

## Taratura (al primo slot, 30 s ciascuna)

```bash
python -m safety.audio_guard calibrate --seconds 30 --label sala   # sala ferma, nessuno che parla vicino
python -m safety.audio_guard calibrate --seconds 30 --label moto   # braccio in movimento normale
# oppure da un wav già registrato:
python -m safety.audio_guard calibrate --wav registrazione.wav --label sala
```

Salva `safety/baseline/{sala,moto}.json` (e il wav registrato). `run` li carica da solo.

## Avvio

```bash
python -m safety.audio_guard run --dry-run                  # prova: stampa "STOP" invece di inviarlo
python -m safety.audio_guard run --host 192.168.1.200       # vero: stop alla Dashboard Shell (29999)
arecord -f S16_LE -r 16000 -c 1 -t raw | python -m safety.audio_guard run --stdin --dry-run
python -m safety.audio_guard run --only-keyword --host ...  # kill criterion: solo parola chiave
```

Altre opzioni: `--moving` (tratta il braccio come sempre in moto, abilita lo sfregamento), `--bridge-id`,
`--device`, `--port`. Da codice: `AudioGuard(detector, stopper, on_event=..., on_heartbeat=...)` con qualsiasi
oggetto che abbia `stop()` (protocollo `Stopper`): il client vero sarà `gergo_sdk`; `DashboardStopper` è un
fallback minimo con connessione persistente e riconnessione.

## Test e latenze misurate

```bash
python -m pytest -q safety/tests
```

Latenza = dall'inizio del suono (indice del campione, orologio simulato: il frame arriva quando è finito) alla
chiamata di `stop()`, mediana su 7 casi sintetici: botta ~13 ms, urlo ~93 ms, sfregamento ~293 ms.
Lo sfregamento richiede per specifica ≥ 300 ms di persistenza, quindi la sua latenza è per costruzione vicina a
300 ms: il kill criterion va letto su parola, botta e urlo. 60 s di rumore di sala e 10 s di parlato normale:
zero trigger.

## Kill criterion

Latenza mediana suono → stop oltre 300 ms, **oppure** più di 1 falso positivo al minuto in sala durante la prova
dal vivo → si resta con la sola parola chiave: `run --only-keyword`. I falsi positivi in sé vanno bene (fermarsi
costa poco): ogni trigger diventa un event con tipo e misure, così il pattern miner li vede.
