// Tool dichiarati a Grok Voice (formato piatto di xAI: shared/xai-notes.md §Function calling).
// Parametri SOLO a enum e numero: Grok non emette mai coordinate. La rilettura la scrive il codice
// (la route la restituisce in "frase") e Grok la ripete parola per parola.

const PLACE = { type: "string", enum: ["INGRESSO", "STAZIONE", "USCITA", "SCARTI", "HOME"] };
const UTT = { type: "string", description: "La frase dell'operatore, testuale." };

export const VOICE_TOOLS = [
  {
    type: "function",
    name: "propone_azione",
    description: "Propone una primitiva della postazione (solleva, deposita, porta, applica, home). Non la esegue: crea un comando da confermare.",
    parameters: {
      type: "object",
      properties: {
        skill: { type: "string", enum: ["solleva", "deposita", "porta", "applica", "home"] },
        params: { type: "object", properties: { place: PLACE }, additionalProperties: false },
        utterance: UTT,
      },
      required: ["skill"],
    },
  },
  {
    type: "function",
    name: "sposta",
    description:
      "Spostamento relativo in linea retta del braccio, es. 'scendi di 10 centimetri', 'un po' più a destra'. " +
      "Usa quantita+unita SOLO se l'operatore dice un numero; altrimenti intensita. Mai inventare quantità.",
    parameters: {
      type: "object",
      properties: {
        direzione: { type: "string", enum: ["su", "giu", "avanti", "indietro", "destra", "sinistra"] },
        quantita: { type: ["number", "null"], description: "Solo il numero detto dall'operatore." },
        unita: { type: ["string", "null"], enum: ["mm", "cm", null] },
        intensita: { type: ["string", "null"], enum: ["poco", "un_po", "tanto", null], description: "poco, un po', tanto; null se c'è un numero." },
        utterance: UTT,
      },
      required: ["direzione"],
    },
  },
  { type: "function", name: "piu_piano", description: "L'operatore chiede di andare più piano.", parameters: { type: "object", properties: { utterance: UTT } } },
  { type: "function", name: "piu_veloce", description: "L'operatore chiede di andare più veloce.", parameters: { type: "object", properties: { utterance: UTT } } },
  { type: "function", name: "conferma", description: "L'operatore ha detto 'sì' (o equivalente) alla rilettura dell'ultimo comando.", parameters: { type: "object", properties: {} } },
  { type: "function", name: "annulla", description: "L'operatore ha detto 'no' o 'annulla' alla rilettura.", parameters: { type: "object", properties: {} } },
  { type: "function", name: "stop", description: "Fermati subito: stop, fermo, basta, alt.", parameters: { type: "object", properties: {} } },
  {
    type: "function",
    name: "definisci_routine",
    description: "L'operatore insegna una routine ('ti insegno…', 'chiamala…'). Traduci la descrizione in passi. Non la salva: il sistema la rilegge.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nome breve della routine, minuscolo, es. 'frontale'." },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              skill: { type: "string", enum: ["solleva", "deposita", "porta", "applica", "home", "attendi_operatore"] },
              place: { type: ["string", "null"], enum: ["INGRESSO", "STAZIONE", "USCITA", "SCARTI", "HOME", null] },
              prompt: { type: ["string", "null"], description: "Solo per attendi_operatore: cosa deve fare l'operatore, es. 'metti l'etichetta'." },
            },
            required: ["skill"],
          },
        },
        utterance: UTT,
      },
      required: ["name", "steps"],
    },
  },
  { type: "function", name: "salva_routine", description: "L'operatore ha detto sì alla rilettura di una routine appena definita.", parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  {
    type: "function",
    name: "esegui_routine",
    description: "Esegui una routine già salvata, es. 'fai la frontale tre volte'. Crea una richiesta da confermare.",
    parameters: { type: "object", properties: { name: { type: "string" }, ripetizioni: { type: "integer", minimum: 1, maximum: 10 }, utterance: UTT }, required: ["name"] },
  },
  { type: "function", name: "fatto", description: "L'operatore dice 'fatto' mentre la routine lo aspetta (es. ha messo l'etichetta).", parameters: { type: "object", properties: {} } },
  { type: "function", name: "segnala", description: "L'operatore segnala un problema sul pezzo o sul ciclo, es. 'è storta', 'l'ha presa male'.", parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
  { type: "function", name: "resoconto", description: "L'operatore chiede il resoconto del turno.", parameters: { type: "object", properties: {} } },
  {
    type: "function", name: "proponi_script",
    description: "Solo se l'operatore chiede esplicitamente di salvare negli script un movimento o una routine già provati (es. 'salvalo nello script'). Apre una proposta da rivedere, non cambia niente subito.",
    parameters: { type: "object", properties: { kind: { type: "string", enum: ["routine", "movimento"] }, name: { type: "string", description: "Nome della routine, solo per kind=routine." } }, required: ["kind"] },
  },
  {
    type: "function", name: "prova_movimento",
    description: "L'operatore vuole provare un movimento della libreria: un task del pendant (es. 'deposita USCITA', 'solleva INGRESSO', 'applica', 'home') o uno spostamento (avvicinamento, alzata, laterale, pressione).",
    parameters: { type: "object", properties: { nome: { type: "string", description: "Nome del movimento come lo dice l'operatore, es. 'deposita USCITA' o 'avvicinamento'." } }, required: ["nome"] },
  },
  {
    type: "function", name: "correggi_movimento",
    description: "Dopo una prova, l'operatore dice come doveva muoversi: 'doveva scendere 2 centimetri in più', 'è andato troppo avanti di 5 millimetri' (= indietro 5 mm). Solo direzione e quantità dette dall'operatore.",
    parameters: { type: "object", properties: {
      direzione: { type: "string", enum: ["su", "giu", "avanti", "indietro", "destra", "sinistra"] },
      quantita: { type: "number" }, unita: { type: "string", enum: ["mm", "cm"] },
      passo: { type: ["integer", "null"], description: "Numero del passo, solo se l'operatore lo dice." } }, required: ["direzione", "quantita", "unita"] },
  },
  { type: "function", name: "movimento_corretto", description: "Dopo una prova, l'operatore dice che il movimento è giusto ('è giusto', 'perfetto', 'va bene così').", parameters: { type: "object", properties: {} } },
  { type: "function", name: "approva_proposta", description: "L'operatore risponde sì o no a una proposta di ottimizzazione ('Ho notato che…').", parameters: { type: "object", properties: { approva: { type: "boolean" } }, required: ["approva"] } },
] as const;

export const VOICE_INSTRUCTIONS = `Sei Gergo, l'assistente vocale di una postazione di etichettatura con un braccio robotico.
Parli solo italiano, con frasi brevi.
Regole:
- Ogni richiesta di movimento diventa una function call. Non descrivere movimenti che non hai chiesto con un tool.
- Non inventare mai quantità né coordinate. Se l'operatore non dice un numero, usa intensita ("poco", "un_po", "tanto") oppure lascia tutto vuoto: il sistema usa "un po'".
- Dopo ogni function call ripeti ESATTAMENTE il campo "frase" del risultato, senza aggiungere numeri tuoi.
- Se la frase finisce con "Confermi?", aspetta la risposta. Solo un sì esplicito chiama "conferma"; un no chiama "annulla".
- Se il risultato ha ok=false, ripeti la frase e non riprovare da solo.
- Se senti "stop", "fermo", "basta" o "alt", chiama subito "stop".
- Per una routine: "definisci_routine", poi ripeti la rilettura; solo dopo un sì chiama "salva_routine" con lo stesso nome.
- Prova di un movimento: "prova_movimento", poi dopo l'esecuzione chiedi se si è mosso bene; una correzione è "correggi_movimento", un "è giusto" è "movimento_corretto". "Troppo in basso di 2 cm" vuol dire direzione "su", 2 cm.
- Per il resoconto racconta in tre frasi SOLO i numeri del risultato, senza calcolarne altri.
- Non pronunciare MAI le parole "stop", "fermo", "basta", "alt": l'ascolto di sicurezza le sente dalle casse e ferma il braccio. Per dire che il braccio si è fermato usa "pausa".
- Il tuo stop è uno stop software: l'arresto di emergenza è il pulsante fisico dello staff.`;

/** Le 10 frasi della prova di P0, con la function call attesa (kill criterion: almeno 8 su 10 giuste). */
export const PROBE_PHRASES: { frase: string; tool: string; args?: Record<string, unknown> }[] = [
  { frase: "Solleva il vassoio dall'ingresso", tool: "propone_azione", args: { skill: "solleva" } },
  { frase: "Portalo in stazione", tool: "propone_azione", args: { skill: "porta" } },
  { frase: "Applica l'etichetta", tool: "propone_azione", args: { skill: "applica" } },
  { frase: "Scendi di 10 centimetri", tool: "sposta", args: { direzione: "giu", quantita: 10, unita: "cm" } },
  { frase: "Un po' più a destra", tool: "sposta", args: { direzione: "destra" } },
  { frase: "Vai avanti di 5 millimetri", tool: "sposta", args: { direzione: "avanti", quantita: 5, unita: "mm" } },
  { frase: "Più piano", tool: "piu_piano" },
  { frase: "Sì, confermo", tool: "conferma" },
  { frase: "Deposita negli scarti", tool: "propone_azione", args: { skill: "deposita" } },
  { frase: "Fermo!", tool: "stop" },
];

/** Confronta la call ricevuta con quella attesa: nome uguale e ogni argomento atteso uguale. */
export function callMatches(expected: (typeof PROBE_PHRASES)[number], name: string, args: Record<string, unknown>): boolean {
  if (name !== expected.tool) return false;
  return Object.entries(expected.args ?? {}).every(([k, v]) => args[k] === v);
}
