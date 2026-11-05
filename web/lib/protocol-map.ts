// Mappa tra l'SDK Python ufficiale Elite CS e il nostro gergo_sdk.
// Fonte ufficiale: github.com/Elite-Robots/Elite_Robots_CS_SDK_Python @ 451631a (21/07/2026), doc/API/API/en/*.md.
// Le firme sono copiate dalla doc (file:riga). L'SDK ufficiale è un binding pybind11 dell'SDK C++ e va compilato
// (doc/BuildGuide: cmake, boost, libssh): per questo gergo_sdk riscrive in Python puro SOLO i messaggi che usiamo.

export const OFFICIAL_REPO = "https://github.com/Elite-Robots/Elite_Robots_CS_SDK_Python";
export const OFFICIAL_COMMIT = "451631a";

export type Stato = "usato" | "riscritto" | "escluso" | "parziale" | "non usato";

export interface Riga {
  ufficiale: string;      // firma nella doc ufficiale
  fonte: string;          // file:riga nella doc ufficiale
  porta: string;
  stato: Stato;
  nostro: string | null;  // dove sta da noi
  perche: string;
}

export const SDK_MAP: Riga[] = [
  // --- Dashboard 29999: testo a righe --------------------------------------------------------------------------
  { ufficiale: "loadTask(path: str) -> bool", fonte: "Dashboard.en.md:355", porta: "29999", stato: "usato", nostro: "sdk/gergo_sdk/dashboard.py · load_task → `task -p <file>.task`", perche: "Le primitive (solleva, deposita, home…) sono task insegnati sul pendant. Solo in armed, solo nomi da shared/fixtures/elite_tasks.json." },
  { ufficiale: "playProgram() -> bool", fonte: "Dashboard.en.md:303", porta: "29999", stato: "usato", nostro: "dashboard.py · play → `play`", perche: "Avvia il task caricato." },
  { ufficiale: "getTaskStatus() -> TaskStatus", fonte: "Dashboard.en.md:367", porta: "29999", stato: "usato", nostro: "dashboard.py · task_status → `task -s`", perche: "Letto ogni 100 ms finché il task finisce (gergo_sdk/cs.py run_task)." },
  { ufficiale: "stopProgram() -> bool", fonte: "Dashboard.en.md:323", porta: "29999", stato: "usato", nostro: "cs.py · stop → `stop` su una connessione dedicata", perche: "Sempre ammesso, anche in read-only. Non è una funzione di sicurezza: l'arresto di sicurezza resta il pulsante fisico." },
  { ufficiale: "pauseProgram() -> bool", fonte: "Dashboard.en.md:313", porta: "29999", stato: "parziale", nostro: "dashboard.py · whitelist TASK", perche: "In whitelist, nessuna frase lo usa ancora." },
  { ufficiale: "robotMode() · safetyMode() · version() · robotType()", fonte: "Dashboard.en.md:199, 209, 261, 124", porta: "29999", stato: "usato", nostro: "dashboard.py · READ_ONLY", perche: "Preflight prima di ogni comando: RUNNING, safety NORMAL, pendant in REMOTE." },
  { ufficiale: "powerOn() · powerOff() · brakeRelease()", fonte: "Dashboard.en.md:160, 170, 37", porta: "29999", stato: "escluso", nostro: null, perche: "Accensione e freni si fanno dal pendant, con il tecnico davanti al braccio (MOTION_SAFETY.md)." },
  { ufficiale: "unlockProtectiveStop() · safetySystemRestart() · closeSafetyDialog()", fonte: "Dashboard.en.md:239, 219, 47", porta: "29999", stato: "escluso", nostro: null, perche: "Dopo uno stop protettivo deve guardare un umano: la voce non può sbloccarlo." },
  { ufficiale: "setSpeedScaling(scaling: int) -> bool", fonte: "Dashboard.en.md:333", porta: "29999", stato: "escluso", nostro: null, perche: "\"Più piano\" cambia la velocità di sessione nel nostro DB (10–100 mm/s) e la passa nel movel: lo slider del controller resta del pendant." },
  { ufficiale: "loadConfiguration() · reboot() · shutdown() · popup()", fonte: "Dashboard.en.md:271, 115, 180, 91", porta: "29999", stato: "escluso", nostro: null, perche: "Fuori dalla whitelist: il client li rifiuta prima di aprire il socket (DashboardRefused)." },
  { ufficiale: "sendAndReceive(cmd: str) -> str", fonte: "Dashboard.en.md:397", porta: "29999", stato: "escluso", nostro: "dashboard.py · send() controlla la regex", perche: "Un canale libero annullerebbe la whitelist: ogni riga passa da allowed()." },
  // --- Primary 30001: stato binario + script ------------------------------------------------------------------
  { ufficiale: "sendScript(script: str) -> bool", fonte: "PrimaryPort.en.md:54", porta: "30001", stato: "usato", nostro: "sdk/gergo_sdk/primary.py · send_movel (MOVEL_RE)", perche: "Unico script ammesso: `def gergo_sposta():` + un solo movel con 8 numeri formattati. Qualsiasi altro testo è rifiutato prima dell'invio." },
  { ufficiale: "getPackage(KinematicsInfo, timeout_ms)", fonte: "PrimaryPort.en.md:148", porta: "30001", stato: "riscritto", nostro: "primary.py · parse_state, sotto-tipo 6, offset 237", perche: "I parametri MDH veri del braccio servono al controllo di cinematica prima del movimento." },
  { ufficiale: "CartesianInfo (sotto-tipo 4, '>iBdddddddddddd')", fonte: "examples/example_primary_client.py", porta: "30001", stato: "riscritto", nostro: "primary.py · parse_state, sotto-tipo 4", perche: "Posa TCP e offset TCP: confrontiamo l'utensile montato con quello atteso dall'ontologia." },
  { ufficiale: "registerRobotExceptionCallback(cb)", fonte: "PrimaryPort.en.md:173 · RobotException.en.md:184", porta: "30001", stato: "parziale", nostro: "primary.py · i messaggi tipo 20 sono salvati in `exceptions`", perche: "Non li decodifichiamo (codice, sotto-codice, messaggio) e move_linear non li legge: se il controller rifiuta un movel, oggi l'operatore sente \"timeout\" dopo 10 s e non il motivo vero." },
  { ufficiale: "powerOn() · brakeRelease() · unlockProtectiveStop() · setSpeedScaling()", fonte: "PrimaryPort.en.md:66, 86, 116, 136", porta: "30001", stato: "escluso", nostro: null, perche: "Esistono anche sulla 30001 (come script): la regex del movel li blocca comunque." },
  // --- RTSI 30004 -----------------------------------------------------------------------------------------------
  { ufficiale: "RTSI · getActualJointPositions() / actual_TCP_pose", fonte: "RTSI.en.md:476", porta: "30004", stato: "riscritto", nostro: "sdk/gergo_sdk/rtsi.py", perche: "Giunti e posa TCP (m + rotation vector) in tempo reale: posa di partenza del movimento e verifica a fine passo." },
  // --- Il resto -------------------------------------------------------------------------------------------------
  { ufficiale: "EliteDriver (external control: servoj, speedl, traiettorie)", fonte: "EliteDriver.en.md · examples/connect_robot_test.py", porta: "PC ← robot (es. 50002)", stato: "non usato", nostro: null, perche: "Il controller dovrebbe connettersi al nostro PC ed eseguire uno script di controllo esterno: più potere e più rischio di quanto serva per traslazioni di pochi cm." },
  { ufficiale: "Kinematics (plugin KDL: forward / inverse)", fonte: "Kinematics.en.md · examples/example_kinematics.py", porta: "—", stato: "non usato", nostro: "sdk/gergo_sdk/kinematics.py (FK/IK MDH nostre)", perche: "Al primo slot serve da controprova: se la nostra FK e la loro non coincidono con la posa RTSI, vale la loro." },
];

// Cosa la voce può cambiare e cosa no. Ogni riga dice dove vive l'informazione.
export const VOCE_CAMBIA: { cosa: string; dove: string }[] = [
  { cosa: "Crea un comando da confermare (\"scendi di 2 cm\", \"prendi il vassoio all'ingresso\")", dove: "riga in `commands`, status queued → confirmed solo dopo il \"sì\"" },
  { cosa: "Cambia la velocità della sessione (\"più piano\", \"più veloce\")", dove: "comando da confermare; il bridge la applica e la pubblica in `bridge_status.velocita_mm_s` (10–100 mm/s)" },
  { cosa: "Insegna o modifica una routine", dove: "nuova versione `draft` in `routines` (sostituisce solo la bozza precedente): la versione attiva non si tocca finché non la approvi" },
  { cosa: "Conferma o depreca una skill, approva una proposta", dove: "stato della riga in `skills` / `proposals`, con chi e quando" },
  { cosa: "Ferma il braccio (\"fermo\", \"stop\")", dove: "comando stop, già confermato: Dashboard `stop` subito" },
];

export const VOCE_NON_CAMBIA: { cosa: string; perche: string }[] = [
  { cosa: "I file Python (bridge/, sdk/, safety/)", perche: "Cambiano solo con un commit su git: chi, quando e cosa, in /console/codice. Un errore o una prompt injection nella catena voce → Grok → API non diventa codice eseguito accanto al braccio (DEPLOY.md)." },
  { cosa: "Lo script inviato al controller", perche: "Lo costruisce build_movel_script con numeri calcolati dal codice: Grok passa solo direzione e quantità a enum, mai coordinate." },
  { cosa: "I limiti (100 mm per comando, 0,1 m/s, geofence, orientamento fisso)", perche: "Sono costanti nel sorgente e il bridge li ricontrolla anche se la console sbaglia." },
  { cosa: "Accensione, freni, sblocco degli stop, TCP, payload", perche: "Dal pendant, con un umano davanti al braccio." },
];
