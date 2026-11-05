# MOTION_SAFETY.md — movimento a voce in centimetri e arresto vocale/acustico

Scritto dopo la spiegazione del tecnico in sala (05/11/2026). Integra DEPLOY.md: dove c'è contrasto vale questo
file. Marker: `[verificato: fonte]` · `[dichiarato: tecnico]` · `[non verificato]`.

---

## 0. Cosa ci ha detto il tecnico `[dichiarato: tecnico]`

- Il braccio ha 6 giunti. Il controller gestisce i motori; noi gli parliamo tramite il pendant, il software o l'SDK.
- **Accensione:** la logica è accesa e i motori no → *power on* → boot e controlli → *idle* (motori alimentati) →
  *rilascio dei freni* (piccolo scatto). L'emergenza chiude i freni e stacca i motori.
- **Jog** per giunti (gradi o radianti) oppure in cartesiano: *TCP translation* x, y, z e *TCP orientation*
  rx, ry, rz. C'è un tasto freedrive per guidarlo a mano: blu = libero, verde = motori in presa.
- **TCP** (tool center point): il punto di riferimento della punta del tool. Oggi è tutto a zero, cioè la flangia.
  Con un tool lungo 20 cm si imposta z = 200 mm, e da quel momento tutte le coordinate si riferiscono alla punta.
  Payload e TCP si configurano.
- **Task** a blocchi: waypoint, loop, MoveJ (per giunti: la via più corta per ogni giunto, traiettoria curva
  nello spazio) e MoveL (linea retta: alcuni giunti possono dover correre per mantenere la linea). I blocchi
  diventano uno script.
- Il problema da risolvere: **tradurre "più in basso di 10 cm", "più piano" in movimento**, quando il robot
  ragiona in gradi dei giunti.

## 1. Quale serie è il braccio: si decide nei primi 2 minuti dello slot

La procedura del tecnico (*power on → idle → brake release*, task a blocchi, freedrive) coincide con la **serie CS**:
nell'SDK ufficiale CS `powerOn()` aspetta `robotMode: IDLE` e `brakeRelease()` aspetta `RUNNING`
`[verificato: Elite_Robots_CS_SDK, source/Dashboard/DashboardClient.cpp]`. Il PDF nella repo è invece il manuale
della **serie EC**, che usa i file JBI.

**Azione:** leggere il modello sull'etichetta del braccio o del controller (CS63/CS66/CS612/CS620 oppure
EC63/EC66/EC612) e scriverlo in `/sdk/ELITE_NOTES.md`. Il codice ha due transport dietro la stessa interfaccia:

| | Serie EC | Serie CS |
|---|---|---|
| Fonte | `EC_SDK_SocketManual_Ver3.19.2.pdf` (repo) `[verificato]` | Elite_Robots_CS_SDK v1.5.0 `[verificato]` + manuale script CS `[da procurare]` |
| Task insegnati | `runJbi` / `getJbiState` / `stop` su JSON-RPC :8055 | Dashboard :29999 `task -p`, `play`, `task -s`, `stop` |
| Leggere la posa TCP | `get_tcp_pose` → mm + rad (p. 8) | stato su Primary :30001 o RTSI :30004 (C++), oppure script `[non verificato]` |
| Cinematica inversa | `inverseKinematic {targetPose, referencePos}` → gradi (p. 88) | `get_inverse_kin` nello script `[verificato: external_control.script]` |
| Movimento lineare | `moveByLine {target_pose mm+rad, speed_type 0, speed 1–3000}` (p. 67) | `movel(...)` in uno script inviato sulla :30001 `[verificato: nome; unità da verificare]` |
| Movimento in un frame utente | `moveByLineCoord` (p. 83) | `[non verificato]` |

**Decisione:** se è EC, il movimento a voce ha tutto verificato e si fa. Se è CS, al primo slot si chiedono al
tecnico il manuale dello script CS, le unità di `movel` (m o mm) e come si legge la posa; se non arrivano entro le
13:45, il movimento relativo si **taglia** e restano i task insegnati via Dashboard.

## 2. La matematica: da "10 cm più in basso" ai giunti

**Non normalizziamo i gradi in centimetri.** Il rapporto tra giunti e spostamento cambia con la configurazione del
braccio (è non lineare e vicino alle singolarità esplode), quindi non esiste una costante gradi→cm. Lavoriamo nello
spazio cartesiano del TCP, dove "10 cm" è letteralmente 100 mm; la conversione in angoli la fa la cinematica
inversa del controller, e noi controlliamo solo il risultato.

Pipeline (in `gergo_sdk.motion`, funzioni pure, testate senza robot):

1. **Intento, non coordinate.** Grok produce `sposta {direzione: su|giu|avanti|indietro|destra|sinistra,
   quantita: numero|null, unita: mm|cm|null, intensita: poco|un_po|tanto|null}`. Il codice lo converte:
   `cm×10`, `poco = 10 mm`, `un_po = 20 mm`, `tanto = 50 mm`, senza quantità = 20 mm. **Clamp a 100 mm per
   comando.** Grok non emette mai numeri di posa.
2. **Frame dell'operatore.** "Avanti" e "destra" dipendono da dove sta la persona. Si usa un frame utente allineato
   al tavolo, definito sul pendant dal tecnico (EC: `coordinate_num` 0–7). La mappa direzione→asse è una tabella
   in `/shared/fixtures/frame.json`, verificata con un "su di 1 cm" e un "avanti di 1 cm" al primo slot.
3. **Posa attuale:** `get_tcp_pose` nel frame utente, con il TCP configurato (mm + rad).
4. **Target = posa + Δ** solo in traslazione: l'orientamento resta identico, niente aritmetica delle rotazioni.
5. **Geofence:** il target deve stare nel box di lavoro `/shared/fixtures/workspace.json` (min/max x, y, z nel
   frame utente; `z_min` = piano del tavolo + 30 mm). Il box si insegna portando il TCP in jog su due angoli
   opposti e dicendo "salva angolo". Fuori dal box: rifiuto, con la frase "arriverei fuori dall'area di lavoro di
   N cm".
6. **Controllo di cinematica lungo la linea.** La MoveL passa per tutti i punti intermedi, quindi si chiama
   `inverseKinematic` su 5 punti equidistanti, ciascuno con il risultato precedente come `referencePos`, e si rifiuta
   se: un punto non ha soluzione · un giunto salta più di 15° tra due campioni consecutivi · il rapporto
   `max|Δq| / |Δx|` supera 1°/mm (indicatore di singolarità: per spostarsi di poco i giunti dovrebbero correre).
   Le soglie sono parametri, tarati al primo slot.
7. **Velocità** in mm/s. Default 50; "più piano" ×0,5 (minimo 10); "più veloce" ×1,5 (massimo 100 in demo).
   È uno stato di sessione, scritto in un event.
8. **Rilettura e conferma:** "Scendo di 10 centimetri a 50 millimetri al secondo. Confermi?" → "sì" → EC
   `moveByLine {target_pose, speed_type: 0, speed}`. Alla fine si rilegge la posa: con un errore sotto 1 mm
   `step_end ok: true`, e si registra lo spostamento reale.

**MoveJ o MoveL.** I passi delle routine tra luoghi restano task insegnati (MoveJ, veloci). Gli spostamenti a voce
sono sempre MoveL: una linea retta è prevedibile per chi sta accanto al braccio, e il controllo del punto 6 copre il
rischio che i giunti debbano correre.

**TCP e payload** li imposta il tecnico sul pendant per il tool montato (forchetta, spintore, punta). L'ontologia
registra `tool {nome, tcp_atteso_mm}`; il bridge legge il TCP dal controller (EC: dati del tool, p. 22) e **rifiuta i
movimenti relativi se non coincide**. Un TCP a zero con un tool montato sposterebbe la punta in un posto diverso da
quello detto.

**Stretch (solo se il resto funziona):** "salva qui come STAZIONE" registra la posa corrente come luogo. I luoghi
diventano insegnabili a voce più jog, invece che solo sul pendant.

**Esclusi:** rotazioni a voce, jog continuo ("vai finché dico stop"), servo e streaming, comandi di giunto a voce.

## 3. Arresto vocale e acustico

**Cosa è e cosa non è.** L'arresto di emergenza è il pulsante fisico cablato: stacca i motori e chiude i freni
(ISO 13850, livelli di sicurezza ISO 13849). Un microfono e un laptop non possono esserlo, e nel pitch non si
chiama "e-stop vocale". È uno **stop software rapido**, in più rispetto all'e-stop e alla rilevazione di collisione
del controller, mai al loro posto.

**Architettura:** un processo locale e indipendente, `/safety/audio_guard.py`, con una sua connessione diretta al
controller. Non passa da Grok, Vercel o Supabase: rete e cloud aggiungono latenza.

```
microfono (headset) ─┐
                     ├─► audio_guard (frame da 20 ms) ─► trigger ─► stop() diretto al controller (< 200 ms)
microfono a contatto ┘          │                                  └► event "stop" su Supabase (dopo, non prima)
sul tavolo (opz.)               └─► heartbeat ogni 250 ms ─► il bridge rifiuta i movimenti se manca da > 1 s
```

| Trigger | Come si riconosce (soglie relative alla baseline della sala) | Priorità |
|---|---|---|
| **Parola** "stop", "fermo", "basta", "alt" | riconoscimento di parole chiave locale, offline (Vosk, modello italiano piccolo), solo sulla lista; in più l'inizio parlato del VAD di Grok durante un movimento (già nel piano) | 1 |
| **Botta** | transitorio: energia che sale di oltre 15 dB in meno di 10 ms, con un crest factor alto; molto più affidabile con un microfono a contatto (piezo) sul tavolo, che ignora il rumore della sala | 1 |
| **Urlo / spavento** | RMS oltre baseline + 20 dB per più di 100 ms, con il centroide spettrale alto (voce acuta) | 2 |
| **Sfregamento** | solo durante un movimento: energia in banda alta e spectral flatness sopra il profilo del braccio in moto normale (registrato al primo slot) per più di 300 ms | 3 (si taglia per primo) |

- **Taratura:** 30 s di sala ferma e 30 s di braccio in movimento, salvati in `/safety/baseline/`.
- **Fail-safe:** microfono scollegato, processo morto o heartbeat assente → stop e nessun nuovo movimento.
- **I falsi positivi vanno bene** (fermarsi costa poco). Ogni trigger diventa un event con tipo e misure, così il
  pattern miner può notare per esempio "3 stop per botta durante applica".
- **Si misura:** latenza dal suono allo stop inviato, su file wav iniettati nei test e dal vivo al braccio.
  Kill criterion: latenza mediana oltre 300 ms, oppure più di 1 falso positivo al minuto in sala → resta solo la
  parola chiave.
- **Con il tecnico, se è d'accordo:** collegare un relè comandato dal laptop a un ingresso di *safeguard stop*
  configurabile del controller. Lo stop diventerebbe hardware, ma resterebbe comunque non certificato. Si fa solo se
  lo propone o lo approva lui.
- **Lato controller (sul pendant, dal tecnico):** sensibilità della rilevazione di collisione, velocità ridotta per
  la demo, payload e TCP corretti. Sulla serie EC l'impostazione via API della collisione è deprecata
  (p. 25), quindi si fa dal pendant.

## 4. Accensione

Primo avvio e riavvio dopo un'emergenza si fanno **dal pendant, a cura del tecnico o dell'operatore**. Il software
legge e annuncia, senza azionare niente:
- EC: `get_robot_power_status` (0 spento, 1 in accensione, 2 acceso), `getServoStatus`, `getMotorStatus`,
  `getRobotState`.
- CS: `robotMode` (`POWER_OFF` → `IDLE` → `RUNNING`), `safetyMode`.

Esempio: "I motori non sono alimentati: accendili dal pendant e rilascia i freni, poi dimmi pronto". I comandi di
accensione, servo e freni restano fuori dalla whitelist.

## 5. Ordine di taglio (se il tempo stringe)

1. Sfregamento → 2. urlo → 3. "salva qui come luogo" → 4. movimento relativo su CS. Non si tagliano mai: parola
chiave, botta, heartbeat fail-safe e geofence.
