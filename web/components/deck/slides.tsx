import type { ReactNode } from "react";
import { CREDITS } from "../landing/Credits";
import { KVA_URL } from "../landing/links";

// Pitch deck di Gergo in HTML: stesso contenuto del PDF in /public, con i numeri dell'eval A/B/C misurati oggi
// (eval/results/summary-20261105-133144 e -133522, split test, 20 casi, modello grok-4.7).
// Ogni slide è 16:9 e scala con la larghezza del contenitore (unità cqw): la stessa slide va bene nel viewer
// della landing, a schermo intero e in stampa.

const blue = "#1d3fd6";
const orange = "#ff7a1a";

export function SlideFrame({ n, total, children, dark = false }: { n: number; total: number; children: ReactNode; dark?: boolean }) {
  return (
    <div className="deck-slide relative w-full [container-type:inline-size]">
      <div
        className={`relative aspect-video w-full overflow-hidden ${dark ? "bg-[#0f1419] text-white" : "bg-white text-[#0f1419]"}`}
        style={{ fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}
      >
        <div className="absolute inset-0 flex flex-col px-[5.5cqw] pb-[4.5cqw] pt-[4.5cqw]">{children}</div>
        <div className={`absolute bottom-[1.8cqw] left-[5.5cqw] right-[5.5cqw] flex justify-between font-mono text-[0.9cqw] ${dark ? "text-white/45" : "text-[#6b7280]"}`}>
          <span>Gergo · KVA · Grok Hackathon at the Museum, Pavia</span>
          <span>{String(n).padStart(2, "0")} / {total}</span>
        </div>
      </div>
    </div>
  );
}

function Kicker({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return <p className={`font-mono text-[1.1cqw] uppercase tracking-[0.22em] ${dark ? "text-[#ff9a4d]" : "text-[#1d3fd6]"}`}>{children}</p>;
}
function Title({ children }: { children: ReactNode }) {
  return <h2 className="mt-[1.2cqw] max-w-[80cqw] text-[3.6cqw] font-semibold leading-[1.1] tracking-tight">{children}</h2>;
}
function Tag({ children, kind = "v" }: { children: ReactNode; kind?: "v" | "vendor" | "i" | "m" }) {
  const c = { v: "bg-emerald-50 text-emerald-700", vendor: "bg-amber-50 text-amber-700", i: "bg-violet-50 text-violet-700", m: "bg-sky-50 text-sky-700" }[kind];
  return <span className={`inline-block rounded px-[0.5cqw] py-[0.15cqw] font-mono text-[0.8cqw] uppercase tracking-wider ${c}`}>{children}</span>;
}
function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[1cqw] border border-[#e3e6ea] bg-[#f8f9fa] p-[1.6cqw] ${className}`}>{children}</div>;
}
function Table({ head, rows, highlight }: { head: string[]; rows: ReactNode[][]; highlight?: number }) {
  return (
    <table className="w-full border-collapse text-left text-[1.15cqw]">
      <thead>
        <tr>{head.map((h) => <th key={h} className="border-b-2 border-[#0f1419] pb-[0.6cqw] pr-[1cqw] font-mono text-[0.85cqw] font-normal uppercase tracking-wider text-[#6b7280]">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={i === highlight ? "bg-[#eef2ff] font-semibold" : ""}>
            {r.map((c, j) => <td key={j} className="border-b border-[#e3e6ea] py-[0.7cqw] pr-[1cqw] align-top">{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function Note({ children }: { children: ReactNode }) {
  return <p className="mt-auto pt-[1cqw] text-[1cqw] leading-snug text-[#6b7280]">{children}</p>;
}

type SlideDef = { id: string; title: string; dark?: boolean; body: ReactNode };

export const SLIDES: SlideDef[] = [
  {
    id: "titolo",
    title: "Gergo",
    dark: true,
    body: (
      <>
        <p className="font-mono text-[1.1cqw] uppercase tracking-[0.3em] text-[#ff9a4d]">Grok Hackathon at the Museum · Pavia · Track 04 Voice Control</p>
        <div className="my-auto">
          <h1 className="text-[9cqw] font-semibold leading-none tracking-tight">Gergo</h1>
          <p className="mt-[2cqw] max-w-[60cqw] text-[3cqw] leading-tight text-white/85">Allena il braccio con la tua voce, nella sua postazione.</p>
        </div>
        <p className="text-[1.3cqw] text-white/60">Un&apos;idea di {CREDITS.authors} · KVA, Kakashi Venture Accelerator · 5 novembre 2026</p>
      </>
    ),
  },
  {
    id: "problema",
    title: "Il problema",
    body: (
      <>
        <Kicker>01 · Il problema</Kicker>
        <Title>Ogni cambio prodotto ferma il cobot e chiama un tecnico.</Title>
        <div className="mt-auto grid grid-cols-3 gap-[2cqw]">
          {[
            { n: "66.000", t: "cobot installati nel mondo nel 2025", s: <Tag>IFR 2026</Tag> },
            { n: "1,5 giorni", t: "per riposizionare una cella di packaging su un nuovo compito", s: <Tag kind="vendor">OnRobot, vendor</Tag> },
            { n: "48 ore", t: "di tecnico per cobot all'anno, oggi", s: <Tag kind="i">modello Gergo, ipotesi</Tag> },
          ].map((x) => (
            <Card key={x.n}>
              <p className="text-[4.6cqw] font-semibold leading-none tracking-tight">{x.n}</p>
              <p className="mt-[1cqw] text-[1.4cqw] leading-snug text-[#4b5563]">{x.t}</p>
              <p className="mt-[1cqw]">{x.s}</p>
            </Card>
          ))}
        </div>
      </>
    ),
  },
  {
    id: "intuizione",
    title: "L'intuizione",
    dark: true,
    body: (
      <>
        <Kicker dark>02 · L&apos;intuizione</Kicker>
        <div className="my-auto">
          <p className="max-w-[75cqw] text-[5.2cqw] font-semibold leading-[1.08] tracking-tight">Il modello non conosce la postazione. <span className="text-[#ff9a4d]">È quella che va allenata.</span></p>
          <p className="mt-[2.5cqw] max-w-[62cqw] text-[1.8cqw] leading-snug text-white/70">I movimenti li insegna il tecnico, una volta. I nomi, le routine e la storia della postazione li allena chi ci lavora, a voce.</p>
        </div>
      </>
    ),
  },
  {
    id: "soluzione",
    title: "La soluzione",
    body: (
      <>
        <Kicker>03 · La soluzione</Kicker>
        <Title>Gergo si allena a voce, nella postazione, con tre memorie.</Title>
        <div className="mt-[3cqw] grid grid-cols-3 gap-[2cqw]">
          {[
            { h: "Lessico", t: "Ricorda come parla la postazione: «il carrello», «la tre». Dopo tre conferme smette di chiedere; una correzione lo fa tornare a chiedere." },
            { h: "Routine", t: "L'operatore le insegna a voce; Gergo le rilegge, chiede conferma e le salva come versioni. Ogni modifica è approvata e reversibile." },
            { h: "Registro", t: "Ogni passo con durata, esito e feedback. Da qui nascono le anomalie, le proposte e il report di fine sessione." },
          ].map((c, i) => (
            <Card key={c.h}>
              <p className="font-mono text-[1cqw] text-[#1d3fd6]">0{i + 1}</p>
              <p className="mt-[0.6cqw] text-[2.2cqw] font-semibold">{c.h}</p>
              <p className="mt-[0.8cqw] text-[1.35cqw] leading-snug text-[#4b5563]">{c.t}</p>
            </Card>
          ))}
        </div>
        <Note>Grok Voice gestisce il dialogo in italiano; un validatore deterministico decide se un comando si esegue.</Note>
      </>
    ),
  },
  {
    id: "caso",
    title: "Il caso pratico",
    body: (
      <>
        <Kicker>04 · Il caso pratico</Kicker>
        <Title>Etichettare un pack: l&apos;operatore insegna il ciclo a voce.</Title>
        <div className="mt-[3cqw] grid grid-cols-5 gap-[1cqw]">
          {["Solleva dall'ingresso", "Porta in stazione", "Attende l'etichetta", "Applica premendo", "Deposita in uscita"].map((s, i) => (
            <div key={s} className="rounded-[1cqw] border border-[#e3e6ea] bg-white p-[1.2cqw]">
              <p className="font-mono text-[2cqw] font-semibold" style={{ color: i === 3 ? orange : blue }}>{i + 1}</p>
              <p className="mt-[0.6cqw] text-[1.4cqw] font-semibold leading-tight">{s}</p>
            </div>
          ))}
        </div>
        <blockquote className="mt-[2.5cqw] border-l-[0.4cqw] border-[#ff7a1a] pl-[1.6cqw] text-[1.6cqw] italic leading-snug text-[#374151]">
          «Ti insegno l&apos;etichettatura frontale: prendi il vassoio dall&apos;ingresso, portalo in stazione, aspetta l&apos;etichetta, premi, mettilo in uscita. Chiamala frontale.»
        </blockquote>
        <Note>Gergo rilegge la routine, chiede conferma, la salva come versione 1 e la esegue. «È storta» finisce nel registro.</Note>
      </>
    ),
  },
  {
    id: "come-funziona",
    title: "Come funziona",
    body: (
      <>
        <Kicker>05 · Come funziona</Kicker>
        <Title>Il tecnico fissa i limiti, il cliente lavora dentro.</Title>
        <div className="mt-[2.5cqw]">
          <Table
            head={["Livello", "Chi", "Cosa fa", "Ore di tecnico (ipotesi)"]}
            rows={[
              ["1 · Il cliente, a voce", "operatore", "rinomina, compone e riordina routine, regola velocità e spostamenti entro i limiti, chiede il report", "0,25 di revisione"],
              ["2 · Il tecnico, da remoto", "supporto", "capisce dal registro perché un ciclo rallenta, approva le proposte di ottimizzazione", "1"],
              ["3 · Il tecnico, in fabbrica", "installatore", "nuove traiettorie e primitive, utensili, sicurezza e layout della cella", "6, trasferta inclusa"],
            ]}
          />
        </div>
        <Note>Fuori dai limiti il validatore rifiuta. Rilettura e conferma prima di ogni movimento, massimo 10 cm per comando, arresto vocale e acustico sempre attivo, e-stop fisico allo staff.</Note>
      </>
    ),
  },
  {
    id: "ottimizzazione",
    title: "Ottimizzazione ricorsiva",
    body: (
      <>
        <Kicker>06 · Ottimizzazione ricorsiva</Kicker>
        <Title>La postazione migliora a ogni turno, con una persona nel loop.</Title>
        <div className="mt-[3cqw] flex items-stretch gap-[0.8cqw]">
          {["Osserva", "Propone a voce", "L'operatore approva", "Misura prima e dopo", "Tiene o torna indietro"].map((s, i) => (
            <div key={s} className="flex flex-1 items-center gap-[0.8cqw]">
              <div className={`flex-1 rounded-[1cqw] p-[1.2cqw] text-[1.4cqw] font-semibold ${i === 2 ? "bg-[#0f766e] text-white" : "bg-[#eef2ff] text-[#1e3a8a]"}`}>{s}</div>
              {i < 4 && <span className="text-[1.8cqw] text-[#9aa3ad]">→</span>}
            </div>
          ))}
        </div>
        <div className="mt-[2.5cqw] grid grid-cols-2 gap-[2cqw]">
          <Card>
            <p className="text-[1.6cqw] font-semibold">Cosa nota il registro</p>
            <p className="mt-[0.6cqw] text-[1.3cqw] leading-snug text-[#4b5563]">Cinque regole deterministiche: passo lento, fallimento ripetuto, correzione ripetuta, sequenza dettata più volte, passo superfluo.</p>
          </Card>
          <Card>
            <p className="text-[1.6cqw] font-semibold">Tempo di ciclo, v1 contro v2</p>
            <p className="mt-[0.6cqw] text-[1.3cqw] leading-snug text-[#4b5563]">Lo calcola la console da ogni ciclo, con la query che lo produce. In questa versione del deck non è ancora pubblicato: <Tag kind="m">da misurare</Tag></p>
          </Card>
        </div>
      </>
    ),
  },
  {
    id: "risultati",
    title: "Risultati di oggi",
    body: (
      <>
        <Kicker>07 · Risultati di oggi</Kicker>
        <Title>Misurati contro una baseline, su 20 comandi mai visti.</Title>
        <div className="mt-[2cqw] grid grid-cols-[1.7fr_1fr] gap-[2cqw]">
          <Table
            head={["Modalità", "Accuratezza", "Gergo da memoria", "Chiarimenti", "Senza conferma"]}
            highlight={2}
            rows={[
              ["A · regole a parole chiave", "80%", "0/4", "6", "0"],
              ["B · Grok senza memoria", "90% · 90%", "2/4 · 2/4", "3 · 4", "0"],
              ["C · Grok con la memoria", "85% · 100%", "4/4 · 4/4", "3 · 2", "0"],
            ]}
          />
          <div className="flex flex-col gap-[1.2cqw]">
            <Card>
              <p className="text-[1.3cqw] leading-snug"><b>La memoria risolve il gergo:</b> 4 casi su 4 con la memoria, 2 su 4 senza, 0 con le parole chiave.</p>
            </Card>
            <Card className="border-amber-200 bg-amber-50">
              <p className="text-[1.25cqw] leading-snug text-amber-900"><b>Soglia scritta prima:</b> +15 punti di C su B. Abbiamo misurato −5 e +10 in due run: <b>non è superata</b>. Quindi diciamo «esegue a voce routine insegnate», non «impara».</p>
            </Card>
          </div>
        </div>
        <Note>Split test, 20 casi, due run con grok-4.7, latenza mediana circa 2,1 s (eval/results). 0 esecuzioni senza conferma e 0 movimenti fuori area accettati in tutte le condizioni. Principianti al primo ciclo: non ancora misurato.</Note>
      </>
    ),
  },
  {
    id: "tecnici",
    title: "L'economia dei tecnici",
    body: (
      <>
        <Kicker>08 · L&apos;economia dei tecnici</Kicker>
        <Title>Un tecnico passa da 33 a 82 cobot assistiti.</Title>
        <div className="mt-[2.5cqw] grid grid-cols-[1fr_2.4fr] gap-[3cqw]">
          <div>
            <p className="text-[7cqw] font-semibold leading-none tracking-tight text-[#1d3fd6]">2,45×</p>
            <p className="mt-[1cqw] text-[1.4cqw] text-[#4b5563]">cobot per tecnico nello scenario base del modello</p>
            <p className="mt-[1cqw]"><Tag kind="i">ipotesi</Tag></p>
          </div>
          <Table
            head={["Scenario", "Cobot per tecnico", "Visite in sito per cobot all'anno", "Valore per cobot all'anno"]}
            highlight={2}
            rows={[["Oggi", "33", "8,0", "—"], ["Prudente", "52", "4,8", "1.204 €"], ["Base", "82", "2,8", "1.988 €"], ["Spinto", "129", "1,6", "2.492 €"]]}
          />
        </div>
        <Note>Ipotesi: 8 interventi per cobot all&apos;anno, 6 ore in sito, 1 da remoto, 70 € l&apos;ora; nel base il cliente risolve il 40% delle richieste e il 25% si chiude da remoto. Da verificare nel pilota.</Note>
      </>
    ),
  },
  {
    id: "mercato",
    title: "Mercato e modello di business",
    body: (
      <>
        <Kicker>09 · Mercato e modello di business</Kicker>
        <Title>Si vende per cobot, attraverso chi li installa e li assiste.</Title>
        <div className="mt-[2.5cqw] grid grid-cols-[1fr_1.5fr] gap-[3cqw]">
          <div className="space-y-[1.2cqw] text-[1.35cqw]">
            <p><b>Integratori e distributori</b><br /><span className="text-[#4b5563]">più cobot per tecnico, meno trasferte · primo segmento</span></p>
            <p><b>Fabbriche con cobot installati</b><br /><span className="text-[#4b5563]">autonomia sulle modifiche, report di fine sessione</span></p>
            <p><b>Produttori di cobot</b><br /><span className="text-[#4b5563]">il livello vocale e la memoria nel loro software · più avanti</span></p>
          </div>
          <Table
            head={["Base di calcolo", "Cobot", "Ricavo all'anno"]}
            rows={[["Primo obiettivo: 3 integratori", "300", "216.000 €"], ["Coorte italiana di un anno (tetto)", "circa 860", "circa 616.000 €"], ["Coorte mondiale di un anno (tetto)", "66.000", "47,5 M€"]]}
          />
        </div>
        <Note>Prezzo ipotetico: 60 € al mese per cobot, il 36% delle ore di tecnico risparmiate nello scenario base. I 66.000 cobot sono IFR 2025; i circa 860 italiani sono una stima (11% delle 7.824 installazioni italiane).</Note>
      </>
    ),
  },
  {
    id: "ricavi",
    title: "Modello di ricavo",
    body: (
      <>
        <Kicker>10 · Modello di ricavo</Kicker>
        <Title>Quattro linee di ricavo, tutte legate ai cobot assistiti.</Title>
        <div className="mt-[2.5cqw]">
          <Table
            head={["Linea", "Chi paga", "Prezzo (ipotesi)", "Ricorrente"]}
            rows={[
              ["Seat per tecnico di supporto", "integratore o service", "120 € al mese per tecnico", "sì"],
              ["Attivazione di una postazione", "integratore o fabbrica", "500 € una tantum per cobot", "no"],
              ["Flotta per cobot attivo", "chi assiste o la fabbrica", "60 € al mese per cobot", "sì"],
              ["White label con un produttore", "produttore di cobot", "150 € per robot venduto + 20 € al mese per robot attivo", "in parte"],
            ]}
          />
        </div>
        <Note>Prezzi da testare nel pilota. Il seat paga la console remota, gli inviluppi e i report di flotta.</Note>
      </>
    ),
  },
  {
    id: "piano",
    title: "Piano 2027–2029",
    body: (
      <>
        <Kicker>11 · Piano 2027–2029</Kicker>
        <Title>Da 0,28 a 5,24 milioni di € di ricavi in tre anni, se il pilota regge.</Title>
        <div className="mt-[2.5cqw]">
          <Table
            head={["Voce", "2027", "2028", "2029"]}
            highlight={3}
            rows={[
              ["Integratori clienti", "3", "10", "25"],
              ["Cobot attivi a fine anno", "300", "1.500", "5.000"],
              ["Robot venduti dal partner in white label", "0", "500", "3.000"],
              ["Ricavi", "0,28 M€", "1,47 M€", "5,24 M€"],
              ["Quota ricorrente dei ricavi", "47%", "54%", "58%"],
              ["EBITDA", "−0,25 M€", "pareggio", "2,28 M€"],
            ]}
          />
        </div>
        <Note>Tutto ipotesi: team di 6, 14 e 24 persone a 70.000 € l&apos;una; vendite e marketing 0,1, 0,4 e 0,9 M€; voce e modelli 6 € al mese per cobot, prezzi Grok Voice non verificati.</Note>
      </>
    ),
  },
  {
    id: "panorama",
    title: "Il panorama",
    body: (
      <>
        <Kicker>12 · Il panorama</Kicker>
        <Title>La voce sui cobot esiste già: il nostro spazio è la postazione.</Title>
        <div className="mt-[2cqw]">
          <Table
            head={["Chi", "Cosa fa", "Rispetto a Gergo"]}
            rows={[
              ["CoboVox · Konica Minolta", "Programmazione vocale per cobot UR, dal 2023", "Memoria della postazione non dichiarata"],
              ["Acteris · Trener Robotics", "Compiti descritti in linguaggio naturale, skill pre-addestrate su ABB, UR e FANUC", "Parte dalle CNC; 32 M$ di Series A (feb. 2026)"],
              ["Wandelbots", "Programmazione no-code dimostrando il percorso", "Insegna percorsi, non dialoga"],
              ["Industrial Copilot · Siemens", "Codice PLC e guasti spiegati in linguaggio naturale", "Automazione di linea, non la postazione cobot"],
              ["Formant", "Gestione e teleoperazione di flotte, prezzo per dispositivo", "Gestisce la flotta, non la allena"],
            ]}
          />
        </div>
        <Note>Fonti lette il 5/11/2026: Universal Robots marketplace, Automate (A3), Robotics 24/7, The Robot Report, siemens.com, formant.io. Il dossier completo è su /approfondimento.</Note>
      </>
    ),
  },
  {
    id: "nuovo",
    title: "Perché è nuovo",
    body: (
      <>
        <Kicker>13 · Perché è nuovo</Kicker>
        <Title>Non insegniamo movimenti al modello: gli insegniamo la postazione.</Title>
        <div className="mt-[2.5cqw] space-y-[1.4cqw]">
          {[
            { h: "Il valore è nella memoria, non nella voce", t: "La voce sui cobot esiste già: CoboVox lavora su Universal Robots dal 2023. Noi teniamo ciò che resta: linguaggio, routine e storia di ogni postazione." },
            { h: "Un miglioramento continuo che resta sicuro", t: "Ogni modifica è una nuova versione, approvata da una persona, misurata e reversibile. Il modello non produce mai coordinate." },
            { h: "Quello che non si copia in un weekend", t: "La demo si copia. Lo storico di una postazione reale e le sue ottimizzazioni misurate no: oggi è un piano, non ancora un fatto." },
          ].map((x, i) => (
            <div key={x.h} className="grid grid-cols-[4cqw_1fr] items-start gap-[1cqw]">
              <p className="text-[3cqw] font-semibold leading-none text-[#1d3fd6]">{i + 1}</p>
              <div>
                <p className="text-[1.8cqw] font-semibold">{x.h}</p>
                <p className="mt-[0.4cqw] text-[1.35cqw] leading-snug text-[#4b5563]">{x.t}</p>
              </div>
            </div>
          ))}
        </div>
      </>
    ),
  },
  {
    id: "prossimo-passo",
    title: "Il prossimo passo",
    dark: true,
    body: (
      <>
        <Kicker dark>14 · Il prossimo passo</Kicker>
        <p className="mt-[1.2cqw] max-w-[80cqw] text-[3.6cqw] font-semibold leading-[1.1] tracking-tight">In tre settimane sappiamo se il modello regge.</p>
        <div className="mt-[2.5cqw] grid grid-cols-2 gap-[2cqw]">
          <div className="rounded-[1cqw] border border-white/10 bg-white/5 p-[1.6cqw]">
            <p className="text-[1.6cqw] font-semibold">Settimana 1 · sui ticket</p>
            <p className="mt-[0.6cqw] text-[1.3cqw] leading-snug text-white/70">Con un integratore: le richieste degli ultimi 3 mesi divise nei tre livelli, con ore e trasferte. Non serve installare niente.</p>
          </div>
          <div className="rounded-[1cqw] border border-white/10 bg-white/5 p-[1.6cqw]">
            <p className="text-[1.6cqw] font-semibold">Settimane 2–3 · in fabbrica</p>
            <p className="mt-[0.6cqw] text-[1.3cqw] leading-snug text-white/70">Gergo su 2 cobot di un cliente: quote reali, tempo per modifica, correzioni, principianti al primo ciclo.</p>
          </div>
        </div>
        <p className="mt-[2cqw] rounded-[1cqw] border border-[#ff9a4d]/40 p-[1.4cqw] text-[1.4cqw] leading-snug"><b className="text-[#ff9a4d]">La soglia che ci ferma.</b> Se meno del 25% delle richieste storiche è risolvibile dal cliente, lo scenario base cade e Gergo si concentra su diagnosi da remoto e report.</p>
        <div className="mt-auto text-[1.25cqw] leading-relaxed text-white/70">
          <p>Un&apos;idea di <b className="text-white">{CREDITS.authors}</b> · Sviluppato con {CREDITS.tools}</p>
          <p>Venture sviluppata con <a href={KVA_URL} className="underline decoration-[#ff9a4d] underline-offset-4">metodologia KVA</a>, Kakashi Venture Accelerator · gergoai.vercel.app · github.com/kakashi-ventures/gergoAI</p>
        </div>
      </>
    ),
  },
];

export function Slide({ index }: { index: number }) {
  const s = SLIDES[index];
  return <SlideFrame n={index + 1} total={SLIDES.length} dark={s.dark}>{s.body}</SlideFrame>;
}

