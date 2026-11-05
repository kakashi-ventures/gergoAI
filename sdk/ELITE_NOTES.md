# ELITE_NOTES.md — cosa sappiamo del braccio in sala

Marker: `[verificato: fonte]` · `[dichiarato: chi]` · `[non verificato]`.

| Voce | Valore | Fonte e ora |
|---|---|---|
| Serie | **CS** (CS63/CS66/CS612/CS620; numero esatto da leggere sull'etichetta) | `[dichiarato: Federico, etichetta]` 05/11 12:48 |
| Software fornito dallo staff | cartella Drive Elite "010 Simulator" (CS_SIMULATOR v2.16.1), "011 Application Software" (CS_UPDATE 2.11 → 2.16.1), "012 System Software" | `[verificato: Drive]` 12:47 |
| Versione del controller | da leggere: Dashboard `version` | `[non verificato]` |
| IP del controller | — | `[non verificato]` |
| Transport task | Dashboard Shell TCP 29999 (`task -p`, `play`, `stop`, `task -s`) | MOTION_SAFETY.md §1 |
| Transport movimento relativo | script su Primary 30001 (`movel`) | `[non verificato: unità di movel]` |
| Nomi dei task | — | `[non verificato]` |

## Conseguenze (MOTION_SAFETY.md §1)

- Il manuale nella repo (`EC_SDK_SocketManual_Ver3.19.2.pdf`) è della serie EC e **non si applica**.
- Da chiedere al tecnico entro le 13:45: manuale dello script CS, unità di `movel` (m o mm), come si legge la posa
  TCP nel frame utente, se c'è un frame utente allineato al tavolo. Senza risposte il movimento relativo su CS si
  taglia e restano i task insegnati via Dashboard.
