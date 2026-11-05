# ELITE_NOTES.md — cosa sappiamo del braccio in sala

Marker: `[verificato: fonte]` · `[dichiarato: chi]` · `[non verificato]`.

| Voce | Valore | Fonte e ora |
|---|---|---|
| Serie e modello | **CS63** · S/N 07262116710005 · prodotto 21/07/2026 · 15 kg · IP65 · payload 3 kg · **sbraccio 624 mm** · 48 VDC | `[verificato: foto etichetta]` 05/11 |
| Software fornito dallo staff | cartella Drive Elite "010 Simulator" (CS_SIMULATOR v2.16.1), "011 Application Software" (CS_UPDATE 2.11 → 2.16.1), "012 System Software" | `[verificato: Drive]` 12:47 |
| Versione del controller | da leggere: Dashboard `version` (il pendant ha l'orologio a 1970-01-01: i timestamp del controller non sono affidabili) | `[non verificato]` |
| IP del controller | **192.168.1.200** (barra di stato del pendant, "FB1"); il laptop deve stare su 192.168.1.x | `[verificato: foto pendant]` |
| Transport task | Dashboard Shell TCP 29999 (`task -p`, `play`, `stop`, `task -s`) | MOTION_SAFETY.md §1 |
| Transport movimento relativo | script su Primary 30001 (`movel`) | `[non verificato: unità di movel]` |
| Nomi dei task | — | `[non verificato]` |

## Conseguenze (MOTION_SAFETY.md §1)

- Il manuale nella repo (`EC_SDK_SocketManual_Ver3.19.2.pdf`) è della serie EC e **non si applica**.
- Da chiedere al tecnico entro le 13:45: manuale dello script CS, unità di `movel` (m o mm), come si legge la posa
  TCP nel frame utente, se c'è un frame utente allineato al tavolo. Senza risposte il movimento relativo su CS si
  taglia e restano i task insegnati via Dashboard.

## Cosa è verificato nell'SDK CS (Elite_Robots_CS_SDK v1.5.0, clonato il 05/11)

- Dashboard 29999: comandi e risposte in `source/Dashboard/DashboardClient.cpp` (task -p, play, stop, task -s,
  robotMode, safety -s, remoteControl -s) `[verificato: SDK CS]`.
- Pose in **metri + rotation vector (rad)**: `doc/API/en/RTSI.en.md:464`, `doc/UserGuide/en/Let-Robot-Move.en.md:441`
  `[verificato: SDK CS]`. Quindi `movel` prende metri e `v` in m/s (lo script dell'SDK passa le stesse pose a movel,
  `source/resources/external_control.script:211-215`). Da confermare con un movimento di 1 cm al primo slot.
- Script su 30001: `def nome():` + righe con tab + `end` (`source/Elite/EliteDriver.cpp:208-215`) `[verificato: SDK CS]`;
  che il controller lo esegua senza una chiamata esplicita `[non verificato]`.
- MDH dal controller: sotto-pacchetto 6 della Primary, offset 237 (`include/Primary/RobotConfPackage.hpp:42`).
- Simulatore CS v2.16.1 (Drive): richiede l'ambiente "Elite Tool" in /opt/elite_tool, non disponibile qui. Si può
  provare sul laptop del bridge se lo staff ha l'Elite Tool.

## Checklist del primo slot (in quest'ordine, niente movimento senza l'ok di Federico)

1. Etichetta esatta (CS6x) e versione: `python -m gergo_sdk.probe --host $ELITE_HOST` (sola lettura).
2. Pendant in remote, braccio RUNNING, safety NORMAL: si fa dal pendant, a cura del tecnico.
3. TCP letto (`tcp_offset_mm`) contro `tool.tcp_atteso_mm` dell'ontologia; MDH letti dal controller.
4. Nomi dei task `.task` per le primitive → `shared/fixtures/elite_tasks.json`.
5. Taratura di audio_guard: 30 s di sala, 30 s di braccio in moto.
6. Con l'ok: "su di 1 cm" e "avanti di 1 cm" a 20 mm/s → aggiornare `shared/fixtures/frame.json` (`verified: true`).
7. Workspace con "salva angolo" su due angoli → `shared/fixtures/workspace.json`.
8. Con l'ok: un movimento reale di 10 cm a 20 mm/s.

## Dal pendant (foto, 05/11)

- Stato **Normal**, collision detection **ON 50%**, slider di velocità **100%**, Stepping OFF, frame di jog "Robot".
  Per la demo chiedere al tecnico di abbassare lo slider (es. 30%) dal pendant: noi non lo tocchiamo (`speed -v` è
  fuori whitelist).
- Il pendant mostra l'orientamento in **RPY in gradi**; RTSI e `movel` usano il **rotation vector in rad**.
- Posa di riferimento letta sul pendant: TCP (frame Robot) X 185,304 · Y −155,149 · Z 735,890 mm · RPY −106,393 /
  −1,606 / −92,795°; giunti −2,723 / −90,864 / −14,513 / −91,010 / 89,478 / −1,521°.
- **Verifica della cinematica:** con quei giunti, la nostra FK (convenzione MDH dell'SDK) dà l'orientamento
  rotvec [−1,4089, 1,4486, −1,1143], **identico** all'RPY del pendant convertito (Rz·Ry·Rx). Convenzione degli
  angoli, zeri dei giunti e rotation vector sono quindi giusti `[verificato: foto pendant]`. La posizione no, perché
  i valori nominali sono di un CS66: le lunghezze vere del CS63 si leggono dal controller e il probe stampa
  `fk_check` (errore FK contro posa letta: deve stare sotto 1 mm).
- **Attenzione:** in quella posa il gomito è a −14,5°, braccio quasi disteso e in verticale (foto). Vicino a
  quella configurazione il controllo di cinematica rifiuterà gli spostamenti verso l'alto o verso l'esterno (rapporto
  °/mm). Per la demo serve una posa di partenza piegata, al centro del box, portata dal tecnico in jog e salvata come
  task `home.task`.
- Sul pendant c'è un task non salvato con MoveL → "Direction Robot X+" con "Until expression", Wait, Waypoint_1 e
  Waypoint_2: è il modo nativo per i movimenti relativi. I task delle primitive vanno salvati con un nome
  (`.task`) per poterli caricare via Dashboard.
