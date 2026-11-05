import type { Metadata } from "next";
import Link from "next/link";
import { CONSOLE_URL, DECK_URL, LEDGER_URL, REPO_URL } from "@/components/landing/links";
import { LoopDiagram, PipelineDiagram } from "@/components/landing/diagrams";
import { Card, Section, Tag, focusRing } from "@/components/landing/ui";

export const metadata: Metadata = {
  title: "Gergo · allena il braccio con la voce",
  description:
    "Chi lavora in linea allena il cobot a voce, in italiano, nella sua postazione. Grok Hackathon at the Museum, Pavia, Track 04 Voice Control.",
};

// Fonti dei contenuti: pitch deck «GergoAI — pitch deck» (artifact Slides collegato al progetto gergoai su
// Control8), studio economico e modello finanziario (wiki Control8), HACK.md, PLAN.md §0 e §9–12,
// MOTION_SAFETY.md §3. Nessun numero inventato: quelli non ancora misurati compaiono come «in misura oggi».

const btnPrimary = `inline-flex items-center justify-center rounded-lg bg-sky-400 px-5 py-3 text-sm font-semibold text-[#0b0d10] hover:bg-sky-300 ${focusRing}`;
const btnSecondary = `inline-flex items-center justify-center rounded-lg border border-white/20 px-5 py-3 text-sm font-semibold text-[#e6e8eb] hover:border-white/40 hover:bg-white/5 ${focusRing}`;
const link = `underline decoration-white/30 underline-offset-4 hover:decoration-sky-400 rounded ${focusRing}`;

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#0b0d10] text-[#e6e8eb]">
      <a
        href="#contenuto"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded focus:bg-sky-400 focus:px-3 focus:py-2 focus:text-[#0b0d10]"
      >
        Vai al contenuto
      </a>

      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <span className="text-sm font-semibold tracking-wide">Gergo</span>
        <nav aria-label="Principale" className="flex gap-4 text-sm text-[#9aa1a9]">
          <a href={DECK_URL} target="_blank" rel="noopener noreferrer" className={`hover:text-[#e6e8eb] ${focusRing} rounded`}>
            Deck
          </a>
          <Link href={CONSOLE_URL} className={`hover:text-[#e6e8eb] ${focusRing} rounded`}>
            Console
          </Link>
        </nav>
      </header>

      <main id="contenuto">
        {/* HERO */}
        <section aria-labelledby="hero-title" className="mx-auto max-w-5xl px-4 pb-16 pt-10 sm:px-6 sm:pb-24 sm:pt-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">
            Grok Hackathon at the Museum · Pavia · Track 04 Voice Control
          </p>
          <h1 id="hero-title" className="mt-4 text-5xl font-semibold tracking-tight sm:text-7xl">
            Gergo
          </h1>
          <p className="mt-5 max-w-2xl text-xl leading-snug text-[#c9cdd2] sm:text-2xl">
            Allena il braccio con la tua voce, nella sua postazione.
          </p>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#9aa1a9]">
            Il robot lo installa il tecnico, una volta. Il resto lo allena chi ci lavora, in italiano. Gergo ricorda il
            linguaggio della postazione, le routine insegnate e la storia dei cicli, e propone miglioramenti che
            l&apos;operatore approva.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href={DECK_URL} target="_blank" rel="noopener noreferrer" className={btnPrimary}>
              Guarda il pitch deck
            </a>
            <Link href={CONSOLE_URL} className={btnSecondary}>
              Apri la console
            </Link>
          </div>
        </section>

        {/* PROBLEMA */}
        <Section id="problema" eyebrow="Il problema" title="Ogni cambio prodotto ferma il cobot e chiama un tecnico">
          <p className="max-w-3xl leading-relaxed text-[#c9cdd2]">
            In una PMI il ciclo del cobot lo riprogramma il tecnico con il teach pendant. Chi lavora in linea aspetta e
            non può correggerlo. Cosa va storto nei cicli non lo registra nessuno, quindi nessuno lo migliora.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-4xl font-semibold text-sky-300">66.000</p>
              <p className="mt-2 text-sm text-[#c9cdd2]">cobot installati nel mondo nel 2025, circa l&apos;11% dei robot industriali</p>
              <p className="mt-3"><Tag kind="verificato" source="IFR, President's Report 2026" /></p>
            </Card>
            <Card>
              <p className="text-4xl font-semibold text-sky-300">1,5 giorni</p>
              <p className="mt-2 text-sm text-[#c9cdd2]">per riposizionare una cella di packaging con la programmazione convenzionale</p>
              <p className="mt-3"><Tag kind="vendor" source="OnRobot, test propri" /></p>
            </Card>
            <Card>
              <p className="text-4xl font-semibold text-sky-300">48 ore</p>
              <p className="mt-2 text-sm text-[#c9cdd2]">di tecnico per cobot all&apos;anno, oggi, nel modello Gergo</p>
              <p className="mt-3"><Tag kind="ipotesi" /></p>
            </Card>
          </div>
          <p className="mt-6 max-w-3xl text-sm leading-relaxed text-[#9aa1a9]">
            <span className="font-semibold text-[#e6e8eb]">L&apos;intuizione.</span> Il modello non conosce la
            postazione: è quella che va allenata. Un modello generico sa l&apos;italiano, ma non sa che qui «la tre» è
            lo slot tre, né che ieri l&apos;etichetta usciva storta.
          </p>
        </Section>

        {/* COME FUNZIONA */}
        <Section id="come-funziona" eyebrow="Come funziona" title="Si allena a voce, dentro i limiti fissati dal tecnico">
          <ol className="grid gap-4 sm:grid-cols-2">
            {[
              {
                t: "Il tecnico fissa i limiti, una volta",
                d: "Sul pendant insegna le primitive di movimento e i luoghi. Definisce l'inviluppo: luoghi ammessi, velocità massima, offset, passi con conferma obbligatoria.",
              },
              {
                t: "L'operatore insegna la routine a voce",
                d: "«Ti insegno l'etichettatura frontale: prendi il vassoio dall'ingresso, portalo in stazione, aspetta l'etichetta, premi, mettilo in uscita.»",
              },
              {
                t: "Gergo rilegge e chiede «sì»",
                d: "Il validatore controlla ogni passo. Gergo rilegge la routine, aspetta la conferma, la salva come versione 1 e la esegue.",
              },
              {
                t: "Ogni ciclo finisce nel registro",
                d: "Durata, esito e feedback di ogni passo. «È storta» viene registrato. A fine turno l'operatore chiede il resoconto a voce.",
              },
            ].map((s, i) => (
              <li key={s.t}>
                <Card className="h-full">
                  <p className="text-xs font-semibold text-sky-400">Passo {i + 1}</p>
                  <h3 className="mt-1 font-semibold">{s.t}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#9aa1a9]">{s.d}</p>
                </Card>
              </li>
            ))}
          </ol>
          <div className="mt-10">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#9aa1a9]">La catena di un comando</h3>
            <PipelineDiagram />
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              { t: "Lessico", d: "Come parla la postazione: «il carrello», «la tre». Dopo tre conferme smette di chiedere; una correzione lo fa tornare a chiedere." },
              { t: "Routine", d: "Insegnate a voce, rilette, confermate, salvate come versioni. Ogni modifica è approvata e reversibile." },
              { t: "Registro", d: "Ogni passo con durata, esito e feedback. Da qui nascono anomalie, proposte e il resoconto del turno." },
            ].map((m) => (
              <Card key={m.t}>
                <h3 className="font-semibold text-fuchsia-300">{m.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#9aa1a9]">{m.d}</p>
              </Card>
            ))}
          </div>
          <p className="mt-4 text-sm text-[#9aa1a9]">
            Caso pratico di oggi: etichettare un pack. Senza pinza il braccio solleva il vassoio, lo porta in stazione e
            preme con lo spintore; l&apos;etichetta la posa l&apos;operatore.
          </p>
        </Section>

        {/* LOOP */}
        <Section id="loop" eyebrow="Allena, osserva, migliora" title="La postazione migliora a ogni turno, con una persona nel loop">
          <div className="grid items-center gap-10 md:grid-cols-2">
            <LoopDiagram />
            <div className="space-y-4 text-[#c9cdd2]">
              <p className="leading-relaxed">
                Niente si modifica da solo. Un pattern miner deterministico legge il registro con cinque regole: passo
                lento, fallimento ripetuto, correzione ripetuta, sequenza dettata più volte, passo superfluo.
              </p>
              <p className="leading-relaxed">
                Gergo propone a voce: «Ho notato che tra un ciclo e l&apos;altro torno sempre a casa: vuoi che lo tolga?».
                Con il «sì» nasce la versione 2. Il ciclo successivo si misura; se peggiora, si torna indietro.
              </p>
              <Card>
                <p className="text-sm text-[#9aa1a9]">Tempo di ciclo, v1 contro v2</p>
                <p className="mt-1 text-2xl font-semibold text-emerald-300">in misura oggi</p>
                <p className="mt-2 text-xs text-[#9aa1a9]">
                  In simulazione, con un&apos;anomalia iniettata e dichiarata come tale. <Tag kind="misura" />
                </p>
              </Card>
            </div>
          </div>
        </Section>

        {/* SICUREZZA */}
        <Section id="sicurezza" eyebrow="Sicurezza" title="Cosa è, e cosa non è">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-emerald-400/30">
              <h3 className="font-semibold text-emerald-300">Cosa fa Gergo</h3>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[#c9cdd2]">
                <li>Grok emette intenti da un elenco chiuso, mai coordinate. Il codice calcola, valida e decide.</li>
                <li>Prima di ogni movimento: rilettura e «sì» detto dall&apos;operatore.</li>
                <li>
                  «Più in basso di 10 cm»: solo traslazioni in linea retta, al massimo 10 cm per comando, dentro un box
                  di lavoro (geofence) e dopo un controllo di cinematica.
                </li>
                <li>
                  Arresto vocale e acustico locale (audio_guard): parola, botta, urlo, sfregamento. Non passa da Grok né
                  dal cloud. Se il microfono o il processo cadono, il braccio si ferma.
                </li>
                <li>Ogni modifica è una nuova versione: approvata da una persona, misurata, reversibile.</li>
                <li>
                  Ogni cambio del codice è nel{" "}
                  <Link href={LEDGER_URL} className={link}>
                    registro del codice
                  </Link>
                  .
                </li>
              </ul>
            </Card>
            <Card className="border-red-500/40">
              <h3 className="font-semibold text-red-400">Cosa non è</h3>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[#c9cdd2]">
                <li>
                  L&apos;arresto vocale e acustico è uno stop software rapido, in più rispetto all&apos;e-stop. Non è un
                  arresto di emergenza.
                </li>
                <li>L&apos;e-stop resta fisico e cablato, nelle mani dello staff.</li>
                <li>Le traiettorie non si insegnano a voce: restano sul pendant, al tecnico.</li>
                <li>Niente rotazioni né jog continuo a voce.</li>
                <li>Non «impara da solo»: ogni modifica la approva una persona.</li>
              </ul>
            </Card>
          </div>
        </Section>

        {/* RISULTATI */}
        <Section id="risultati" eyebrow="Risultati" title="Misurati oggi contro una baseline">
          <p className="max-w-3xl text-[#c9cdd2]">
            Check set di 30 comandi della postazione: 10 per l&apos;addestramento, 20 di test mai visti. Tre modalità a
            confronto.
          </p>
          <div className="mt-6 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[520px] text-left text-sm">
              <caption className="sr-only">Check set a tre modalità: risultati in misura oggi</caption>
              <thead className="bg-white/[0.04] text-[#9aa1a9]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Modalità</th>
                  <th scope="col" className="px-4 py-3 font-medium">Accuratezza</th>
                  <th scope="col" className="px-4 py-3 font-medium">Turni di chiarimento</th>
                  <th scope="col" className="px-4 py-3 font-medium">Esecuzioni non confermate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {["A · regole a parole chiave", "B · Grok senza memoria", "C · Grok con la memoria della postazione"].map((m) => (
                  <tr key={m}>
                    <th scope="row" className="px-4 py-3 font-medium">{m}</th>
                    <td className="px-4 py-3 text-sky-300">in misura oggi</td>
                    <td className="px-4 py-3 text-sky-300">in misura oggi</td>
                    <td className="px-4 py-3 text-sky-300">in misura oggi</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Card>
              <p className="text-sm text-[#9aa1a9]">Principianti, a voce, in simulazione</p>
              <p className="mt-1 text-2xl font-semibold text-sky-300">in misura oggi</p>
              <p className="mt-2 text-xs text-[#9aa1a9]">
                Tempo al primo ciclo corretto della routine frontale, su 3 persone mai state al braccio.
              </p>
            </Card>
            <Card>
              <p className="text-sm text-[#9aa1a9]">Soglia scritta prima del test</p>
              <p className="mt-2 text-sm leading-relaxed text-[#c9cdd2]">
                Meno di 2 principianti su 3 con un ciclo corretto entro 5 minuti, oppure memoria contro zero-shot sotto
                +15 punti: diciamo «esegue a voce routine insegnate», non «impara».
              </p>
            </Card>
          </div>
          <h3 className="mt-10 text-sm font-semibold uppercase tracking-wider text-[#9aa1a9]">Benchmark esterni</h3>
          <ul className="mt-3 space-y-2 text-sm text-[#c9cdd2]">
            <li>
              Riposizionare una cella di packaging: 1,5 giorni convenzionale contro 1,5 ore con lo strumento del vendor.{" "}
              <Tag kind="vendor" source="OnRobot, test propri" />
            </li>
            <li>
              Programmazione vocale di cobot UR: fino al 43% di tempo in meno.{" "}
              <Tag kind="vendor" source="Konica Minolta CoboVox, 2023" />
            </li>
          </ul>
        </Section>

        {/* MERCATO */}
        <Section id="mercato" eyebrow="Mercato e modello di business" title="Si vende per cobot, attraverso chi li installa e li assiste">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <p className="text-3xl font-semibold text-sky-300">7.824</p>
              <p className="mt-2 text-sm text-[#c9cdd2]">robot industriali installati in Italia nel 2025, secondo mercato europeo</p>
              <p className="mt-3"><Tag kind="verificato" source="Universal Robots su dati IFR" /></p>
            </Card>
            <Card>
              <p className="text-3xl font-semibold text-sky-300">circa 860</p>
              <p className="mt-2 text-sm text-[#c9cdd2]">cobot nuovi all&apos;anno in Italia: la quota mondiale dell&apos;11% applicata alle installazioni italiane</p>
              <p className="mt-3"><Tag kind="stima" /></p>
            </Card>
            <Card>
              <p className="text-3xl font-semibold text-sky-300">33 → 82</p>
              <p className="mt-2 text-sm text-[#c9cdd2]">cobot assistiti per tecnico, nello scenario base del modello</p>
              <p className="mt-3"><Tag kind="ipotesi" /></p>
            </Card>
          </div>

          <h3 className="mt-10 text-sm font-semibold uppercase tracking-wider text-[#9aa1a9]">Il calcolo, dal basso</h3>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-4 text-xs leading-relaxed text-[#c9cdd2] sm:text-sm">
{`valore per postazione all'anno =
    cambi ciclo all'anno × (ore convenzionali − ore con Gergo) × costo orario del tecnico
  + ore di fermo linea evitate × valore orario della linea`}
          </pre>
          <p className="mt-2 text-xs text-[#9aa1a9]">
            Ipotesi dichiarate: cambi ciclo per postazione, costo orario del tecnico, prezzo per postazione. Tutto da
            testare nel pilota. <Tag kind="ipotesi" />
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Card>
              <h3 className="font-semibold">Chi compra</h3>
              <ul className="mt-2 space-y-1 text-sm text-[#c9cdd2]">
                <li>Integratori e distributori di cobot: più cobot per tecnico, meno trasferte. Primo segmento.</li>
                <li>Fabbriche con cobot installati: autonomia sulle modifiche, resoconto del turno.</li>
                <li>Produttori di cobot, in white label. Più avanti.</li>
              </ul>
            </Card>
            <Card>
              <h3 className="font-semibold">Unità di ricavo <Tag kind="ipotesi" /></h3>
              <p className="mt-2 text-sm leading-relaxed text-[#c9cdd2]">
                60 € al mese per cobot attivo: il 36% del valore delle ore di tecnico risparmiate nello scenario base
                (1.988 € l&apos;anno per cobot). Primo obiettivo, 3 integratori e 300 cobot: 216.000 € l&apos;anno.
              </p>
            </Card>
          </div>
          <p className="mt-4 text-xs text-[#9aa1a9]">
            Rischio di canale: l&apos;integratore oggi fattura le visite che Gergo elimina. L&apos;alternativa da testare è
            un prezzo per integratore a fasce di cobot.
          </p>
        </Section>

        {/* PROSSIMO PASSO */}
        <Section id="prossimo" eyebrow="Il prossimo passo" title="Un pilota di una settimana, con un numero che ci ferma">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <h3 className="font-semibold">Settimana 1 · sui ticket</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#c9cdd2]">
                Con un integratore: le richieste di assistenza degli ultimi 3 mesi divise in tre livelli (cliente a
                voce, tecnico da remoto, tecnico in fabbrica). Non serve installare niente.
              </p>
            </Card>
            <Card>
              <h3 className="font-semibold">Poi · in fabbrica</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#c9cdd2]">
                Gergo su 2 cobot di un cliente: tempo per modifica, correzioni, principianti al primo ciclo.
              </p>
            </Card>
          </div>
          <div className="mt-4 rounded-xl border-2 border-red-500/50 bg-red-500/5 p-5">
            <h3 className="font-semibold text-red-400">La soglia che ci ferma</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#e6e8eb]">
              Se meno del 25% delle richieste storiche è risolvibile dal cliente a voce, lo scenario base cade e Gergo si
              concentra su diagnosi da remoto e resoconti.
            </p>
          </div>
        </Section>

        {/* TEAM */}
        <Section id="team" eyebrow="Team" title="KVA — Kakashi Venture Accelerator">
          <p className="max-w-3xl leading-relaxed text-[#c9cdd2]">
            Costruito in un giorno al Grok Hackathon at the Museum di Pavia, il 5 novembre 2026, riusando pezzi già
            provati in KVA: la memoria a regimi di OIDA, la voce con conferma di ctrl8, il confronto con e senza memoria
            di Cleanake, il resoconto vocale di Sentinella.
          </p>
        </Section>
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 text-sm text-[#9aa1a9] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>Gergo · KVA · Pavia, 5 novembre 2026</p>
          <nav aria-label="Link utili">
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              <li>
                <a href={DECK_URL} target="_blank" rel="noopener noreferrer" className={link}>Pitch deck</a>
              </li>
              <li>
                <Link href={CONSOLE_URL} className={link}>Console</Link>
              </li>
              <li>
                <Link href={LEDGER_URL} className={link}>Registro del codice</Link>
              </li>
              <li>
                <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={link}>Repo GitHub</a>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}
