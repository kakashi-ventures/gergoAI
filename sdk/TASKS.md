# I 10 task da insegnare sul pendant (CS63)

Il ciclo della demo è *solleva → sposta → applica*: un vassoio entra in INGRESSO, va in STAZIONE, lo spintore
preme (l'etichetta la posa l'operatore), poi il vassoio va in USCITA o negli SCARTI. Ogni task è una primitiva
che il bridge avvia via Dashboard (`task -p <nome>` e poi `play`). Grok non li modifica mai: li sceglie e basta.

## Nomi (esatti: il software li cerca così, in `shared/fixtures/elite_tasks.json`)

| # | File | Skill a voce | Cosa fa | Parte da → finisce in |
|---|---|---|---|---|
| 1 | `home.task` | home | va alla posa di riposo | ovunque → HOME |
| 2 | `porta_INGRESSO.task` | porta INGRESSO | va sopra l'ingresso, forchetta vuota | HOME/qualsiasi → sopra INGRESSO |
| 3 | `solleva_INGRESSO.task` | solleva dall'INGRESSO | entra sotto il vassoio, solleva, risale | sopra INGRESSO → sopra INGRESSO (carico) |
| 4 | `porta_STAZIONE.task` | porta in STAZIONE | trasferisce sopra la stazione | qualsiasi → sopra STAZIONE |
| 5 | `deposita_STAZIONE.task` | deposita in STAZIONE | scende, appoggia, sfila, risale | sopra STAZIONE → sopra STAZIONE (vuoto) |
| 6 | `applica_STAZIONE.task` | applica | preme con lo spintore sul punto dell'etichetta, risale | sopra STAZIONE → sopra STAZIONE |
| 7 | `solleva_STAZIONE.task` | solleva dalla STAZIONE | riprende il vassoio dalla stazione | sopra STAZIONE → sopra STAZIONE (carico) |
| 8 | `porta_USCITA.task` | porta in USCITA | trasferisce sopra l'uscita | qualsiasi → sopra USCITA |
| 9 | `deposita_USCITA.task` | deposita in USCITA | appoggia il vassoio buono | sopra USCITA → sopra USCITA (vuoto) |
| 10 | `deposita_SCARTI.task` | deposita negli SCARTI | va sopra gli scarti e appoggia | qualsiasi → sopra SCARTI (vuoto) |

## Regole per chi li insegna (valgono per tutti e 10)

1. **Ogni task è autonomo**: la prima istruzione è un MoveJ al proprio punto di partenza ("sopra X", 100–150 mm sopra
   il piano), così i task si possono concatenare in qualsiasi ordine senza collisioni. L'ultima riporta "sopra X".
2. **MoveJ** solo tra i punti "sopra"; **MoveL** per scendere e risalire (avvicinamento verticale, prevedibile).
3. Velocità basse: MoveJ ≤ 30%, MoveL ≤ 100 mm/s; in discesa verso il pezzo ≤ 50 mm/s.
4. **HOME** = posa piegata al centro del box (gomito tra −60° e −120°, polso non allineato): da lì il movimento a
   voce in centimetri ha margine in tutte le direzioni. Non la posa verticale della foto (gomito −14,5°).
5. Niente Loop, niente Thread, niente Script, niente I/O, niente cambi di TCP o payload dentro i task.
6. Salvarli nella cartella principale dei task, con quel nome esatto (maiuscole comprese), poi **Save**.
7. Applica: la pressione la fa lo spintore con una MoveL di pochi mm verso il basso e risalita; se non c'è uno
   spintore montato, il task simula il gesto e lo dichiariamo nei limiti.

## Verifica (sola lettura, dal laptop)

Il probe non carica i task (caricare è già un comando di task, fuori dalla sola lettura).
Si verificano al primo `run_task` in armed, con il tuo ok, oppure guardando i nomi sul pendant (Open).

## Durate

Dopo il primo giro reale, il bridge misura `duration_ms` per ogni task: il SimArm usa quelle durate per la demo in
simulazione.
