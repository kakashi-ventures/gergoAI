# HACK.md — GERGO (nome di lavoro)

Grok Hackathon at the Museum · Ctrl+Alt Museum, Pavia · **Track 04 Voice Control** · caso pratico: etichettatura
Ultimo aggiornamento: 05/11/2026 11:58 · **T-04:00** alla consegna e alla demo (16:00)
Piano di build per Claude Code: **PLAN.md**

> Marker: `[verificato: fonte]` · `[dichiarato]` (lo dice il team) · `[non verificato]`.
> Solo i fatti verificati vanno sulle slide come fatti.

---

## 0. Verdetto (8hack, assi 8gate)

```
8HACK · Gergo — si allena il braccio a voce nella sua postazione, con memoria e ottimizzazione · T-04:00
Potenziale 48/100 [lavoro 3 · vuoto 2 · automazione 3 · barriera 2 · diritto a vincere 2]
Prontezza  65/100 [primitive 3 · prima evidenza 4 · rischio 3 · capacità 3]
Flag: median_idea (la Track 04 la fanno tutti), wrapper (voce → function call è nativo in Grok Voice)
Verdetto: NARROW — si costruisce sulla parte che il modello non sa: la postazione, le sue routine, la sua storia
Assunzione più rischiosa: chi non ha mai usato il braccio riesce ad allenarlo a voce su un ciclo reale,
  e la memoria della postazione riduce errori e domande in modo misurabile
Test più economico oggi: 3 principianti insegnano la routine "frontale" in sim (10 minuti) + check set a 3 modalità
Kill criterion (ex-ante): < 2 principianti su 3 con un ciclo corretto entro 5 minuti, oppure memoria vs
  zero-shot < +15 punti → il pitch dice "esegue a voce routine insegnate", non "impara"
Prossima azione (≤ 20 min): P0 in Claude Code (repo, contratti, probe della voce in italiano)
```

Totali: media semplice degli assi normalizzata a 100, non i pesi del 8gate di Control8. È una proposta:
il gate vero lo fa una persona.

**Perché NARROW.** "Controllo un braccio a voce scegliendo tra 3–5 skill con conferma" è il testo della traccia, e
Grok Voice fa già voce → function call. Quello che un modello non può sapere è **come lavora questa postazione**:
i suoi nomi, le routine che l'operatore le ha insegnato, cosa è andato storto nei cicli. Lì sta il prodotto.

---

## 1. La traccia e il caso

Track 04 [verificato: pagina tracce]: un assistente vocale che capisce la richiesta, sceglie tra 3–5 skill
predefinite del braccio, chiede conferma, esegue e riferisce cosa ha fatto; conferme prima dei movimenti e stop
sempre disponibile. Stretch: sequenze di skill, registrare una nuova skill a voce, altre lingue.

Il caso pratico è l'etichettatura di un pack: solleva → sposta → applica. È anche il contesto reale della Track C
(piccoli lotti di cosmetica, etichette applicate a mano, posizioni che cambiano per prodotto) [verificato: pagina
tracce], quindi ha senso industriale. Qui però non giudichiamo la conformità: mostriamo come si allena il braccio.

Vincoli di tutte le tracce [verificato: pagina tracce]: Grok essenziale · demo entro le 16:00 su un caso nuovo
scelto dalla giuria · repo con README, dati, un risultato contro baseline, limiti noti · braccio in slot da 30
minuti con lo staff · niente pinza: forchetta, spintore, punta, solo vassoi asolati · solo dati pubblici,
sintetici o forniti dalle aziende.

## Q1. Che problema risolviamo

Quando in una PMI cambia il prodotto, il ciclo del cobot lo riprogramma il tecnico o l'integratore con il teach
pendant; chi lavora in linea aspetta e non può correggerlo; cosa è andato storto nei cicli non lo registra
nessuno, quindi nessuno lo migliora. [dichiarato — da verificare con i mentor delle aziende in sala]

## Q2. Su quale parte ci concentriamo

Flusso: 1) cambio prodotto · **2) si definisce il ciclo** · 3) si mette a punto · **4) si esegue e si corregge** ·
**5) si rendiconta e si migliora**.

Ci concentriamo su 2, 4 e 5: ciclo insegnato a voce, correzioni a voce, memoria che nota anomalie e pattern e
propone versioni migliori. **Ignoriamo:** l'insegnamento delle traiettorie (resta sul pendant), la visione,
la conformità delle etichette, multi-robot.

## Q3. La UVP che testiamo

> Per chi lavora in linea e deve cambiare il ciclo del cobot senza aspettare il tecnico, Gergo permette di
> allenare il braccio a voce, in italiano, nella sua postazione, e di migliorarlo turno dopo turno — a differenza
> del teach pendant e dei comandi vocali generici — perché ricorda il linguaggio della postazione, le routine che
> le sono state insegnate e tutto ciò che è successo nei cicli, e da lì propone ottimizzazioni che l'operatore
> approva e che si misurano.

- **Ipotesi:** un principiante allena a voce una routine corretta in pochi minuti, e la memoria riduce errori e
  domande sui comandi della postazione.
- **Test oggi:** 3 principianti in sim + check set a 3 modalità (PLAN.md P5).
- **Kill criterion:** vedi il verdetto. Scritto prima del test.
- **Test di domanda oggi:** 3 conversazioni da 5 minuti con persone delle aziende in sala — "L'ultima volta che
  avete cambiato cosa fa un cobot, chi l'ha fatto e quanto ci ha messo?".

## Q4. USP

1. cambio ciclo → routine insegnata a voce, riletta e confermata → niente tecnico per le varianti · proof:
   principianti in sim · vs teach pendant · angolo: outcome
2. gergo della postazione → lessico con conferme e correzioni → meno domande · proof: Δ sul check set · vs
   comandi vocali generici · angolo: proof
3. cicli che peggiorano in silenzio → registro + pattern miner → proposta detta a voce e misurata prima/dopo ·
   proof: tempo di ciclo v1 contro v2 · angolo: outcome
4. sicurezza → primitive pre-insegnate, validatore deterministico, conferma, stop sempre → zero movimenti non
   confermati · proof: 0 esecuzioni non confermate nel check set · vs un LLM che emette coordinate · angolo: obiezione
5. rendiconto → resoconto del turno a voce con numeri dal registro (il format di Sentinella) · angolo: outcome

Fuori dal pitch: "AI-powered", "facile da usare", "sicuro" senza prova; "impara da solo" (non è vero: ogni
modifica la approva una persona).

## Q5. Single point of failure

**Demo (oggi)**

| Componente | Come fallisce | Prob. | Impatto | Mitigazione | Entro |
|---|---|---|---|---|---|
| Grok Voice in italiano | trascrizione, function call sbagliate, latenza | M | A | probe di P0 con kill criterion; push-to-talk come ripiego | 12:20 |
| Rumore della sala | il VAD scatta di continuo | A | M | headset; soglia VAD alta; push-to-talk | 12:20 |
| Slot braccio | saltato o in ritardo | M | A | bridge in sim con durate reali; video di backup al 2° slot | 14:45 |
| Avvio dei task Elite | modalità remota o comandi non noti | M | A | chiedere allo staff al 1° slot; dry-run prima di ogni invio | 13:30 |
| "Applicare" col solo spintore | il gesto non fissa l'etichetta | M | M | concordarlo con lo staff; dichiararlo nei limiti | 13:30 |
| Pattern miner con pochi cicli | non nota niente | M | A | `--inject` in sim per la demo, dichiarato come tale | 14:30 |
| Crediti xAI | saldo esaurito in silenzio | B | A | controllare il saldo prima delle prove | 15:00 |
| Una persona sa il deploy | assente | B | A | README eseguibile da zero, push a ogni milestone | ogni ora |

**Venture (oltre oggi)**

| Componente | Come fallisce | Mitigazione |
|---|---|---|
| Assunzione più rischiosa | allenare a voce non è più veloce del tecnico | test con principianti; poi un pilota cronometrato |
| Funzione nativa | i vendor di cobot aggiungono assistenti in linguaggio naturale | il valore sta nella memoria della postazione |
| Vendor | Grok Voice, robot Elite | astrazione del client voce e del bridge |
| Sicurezza macchine | la voce non può essere una funzione di sicurezza | la voce seleziona primitive, non comanda movimenti |
| Dati | la memoria vale dopo settimane d'uso | pilota con una postazione reale |

## Q6. Cosa costruiamo prima

Vedi **PLAN.md**: P0 setup e probe della voce · P1 walking skeleton (console, bridge sim, voce) · P2 allenamento a
voce e lessico · P3 primo slot braccio · P4 pattern miner, proposte e resoconto · P5 baseline e principianti ·
P6 video · P7 freeze · P8 pitch.

**Cut list:** traiettorie insegnate a voce, visione, controllo di conformità, ROS2, Isaac o Cosmos, multi-lingua,
login, chiamata in uscita alla Sentinella.

## Q7. Target audience

- **Segmento:** PMI manifatturiere italiane (food, packaging, cosmetica) con cobot già installati e cambi
  prodotto frequenti.
- **Persona:** operatore di linea o capoturno · job: far fare al cobot il ciclo giusto per il lotto · trigger:
  cambio prodotto · obiezione: "e se capisce male?" · pain: aspettare il tecnico, errori ripetuti che nessuno
  registra · gain: autonomia, cicli che migliorano.
- **Buyer ≠ user:** compra il responsabile di produzione; l'integratore è il canale.
- **Dimensione bottom-up:** Italia 7.824 robot industriali installati nel 2025, secondo mercato europeo;
  alimentare e bevande 1.086; pallettizzazione 817 [verificato: Universal Robots su dati IFR World Robotics
  2026]. Quota cobot in Italia [non verificato].
- **Dove trovarne 10 la prossima settimana:** le aziende delle tracce in sala, il distributore italiano Elite
  Robots, gli integratori.

## Q8. Tecnologie e moat

| Tecnologia | Commodity / differenziante | Oggi | Target difficile da copiare | Misura | Orizzonte |
|---|---|---|---|---|---|
| Voce realtime (Grok Voice) | commodity | function calling | — | latenza, function call corrette | oggi |
| Controllo braccio | commodity | task pre-insegnati | — | — | oggi |
| Routine insegnate a voce | differenziante debole | steps validati | libreria di routine per postazione | tempo al primo ciclo corretto | 3 mesi |
| Lessico della postazione | differenziante | Beta per binding, regimi | mesi di binding confermati per sito | Δ sul check set | 3 mesi |
| Registro + pattern miner + proposte | **differenziante** | 5 regole deterministiche | storico di ottimizzazioni misurate per postazione | tempo di ciclo, correzioni per ciclo | 3 mesi |

**Copy test:** la demo si copia in un weekend. Non si copiano la memoria accumulata di una postazione reale né lo
storico delle sue ottimizzazioni misurate. Oggi questo è un piano, non un fatto.

---

## Da dove vengono i pezzi (esperienza KVA)

- **Cleanake:** separazione tra core, skill e mondo simulato; il confronto tra modalità senza e con memoria diventa
  la baseline obbligatoria.
- **Ada e ctrl8:** voce realtime con delega a un orchestratore, "sì" parlato prima di ogni azione, dizionario dei
  nomi detti male.
- **OIDA:** ontologia della postazione, regimi WORKING e CANONICAL, registro degli episodi da cui nascono
  osservazioni.
- **Sentinella:** il resoconto vocale di fine turno.

## Limiti noti (da tenere aggiornati)

- Le primitive di movimento sono pre-insegnate sul pendant: a voce si allenano nomi, routine e varianti, non le traiettorie.
- "Applicare" è una pressione con lo spintore; l'etichetta la posa l'operatore.
- In demo le anomalie del pattern miner sono iniettate in simulazione, oltre al feedback vocale reale.
- Check set e memoria sono provati su una sola postazione e per poche ore.
- La latenza dello stop vocale dipende dalla rete: lo stop di sicurezza resta fisico.

## Log delle decisioni e degli override

- 11:40 — Track 04; "HRL" ridefinito come politica di alto livello appresa su primitive fisse; Isaac e Cosmos fuori.
- 11:45 — proposto il passaggio alla Track C sul caso etichettatura.
- 11:55 — **override del team:** resta la Track 04. L'etichettatura è solo il caso pratico; il prodotto è
  l'allenamento a voce più la memoria di anomalie e pattern per l'ottimizzazione ricorsiva.
- 12:00 — consegna allargata: oltre all'MVP, un video di 3 minuti e un pitch deck (PLAN.md sezioni 10–12),
  preparati in parallelo da S4; upload entro le 15:45.
