import type { Metadata } from "next";
import Link from "next/link";
import { CONSOLE_URL, DECK_URL, LEDGER_URL, REPO_URL } from "@/components/landing/links";
import { Story } from "@/components/landing/Story";

export const metadata: Metadata = {
  title: "Gergo · parla al braccio, impara la tua postazione",
  description: "Chi lavora in linea allena il cobot a voce, in italiano. Gergo ricorda la postazione e propone come lavorare meglio. Grok Hackathon at the Museum, Pavia.",
};

// Fonti: pitch deck del progetto gergoai (Control8), studio economico e modello finanziario (wiki Control8),
// PLAN.md §12, MOTION_SAFETY.md. Ogni numero porta la sua fonte; ciò che non è ancora misurato lo dice.

const btn = "inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d3fd6]";
const primary = `${btn} bg-[#1d3fd6] text-white hover:bg-[#1733b0]`;
const secondary = `${btn} border border-[#d7dbe0] bg-white text-[#0f1419] hover:border-[#9aa3ad]`;

function Source({ kind, text }: { kind: "verificato" | "vendor" | "ipotesi" | "stima"; text?: string }) {
  const c = { verificato: "bg-emerald-50 text-emerald-700", vendor: "bg-amber-50 text-amber-700", ipotesi: "bg-violet-50 text-violet-700", stima: "bg-sky-50 text-sky-700" }[kind];
  const l = { verificato: "verificato", vendor: "dichiarato dal vendor", ipotesi: "ipotesi", stima: "stima" }[kind];
  return <span className={`inline-block rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${c}`}>{l}{text ? ` · ${text}` : ""}</span>;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-xs uppercase tracking-[0.22em] text-[#1d3fd6]">{children}</p>;
}

/* Piccole illustrazioni per le schede "per chi" */
function IconOperator() {
  return (
    <svg viewBox="0 0 64 64" className="h-12 w-12" aria-hidden>
      <circle cx="32" cy="22" r="11" fill="#f1c7a5" />
      <path d="M21 21q0-15 11-15t11 15" fill="none" stroke="#111827" strokeWidth="3" />
      <rect x="18" y="18" width="5" height="9" rx="2" fill="#111827" /><rect x="41" y="18" width="5" height="9" rx="2" fill="#111827" />
      <path d="M20 27q4 9 11 8" fill="none" stroke="#111827" strokeWidth="2" /><circle cx="31" cy="35" r="2" fill="#ff7a1a" />
      <path d="M14 60q0-20 18-20t18 20z" fill="#0f766e" />
    </svg>
  );
}
function IconTech() {
  return (
    <svg viewBox="0 0 64 64" className="h-12 w-12" aria-hidden>
      <circle cx="32" cy="20" r="11" fill="#f1c7a5" /><path d="M21 18q1-12 11-12t11 12z" fill="#facc15" />
      <path d="M14 60q0-20 18-20t18 20z" fill="#1d3fd6" />
      <rect x="22" y="42" width="20" height="14" rx="2" fill="#1f2937" /><rect x="25" y="45" width="14" height="7" fill="#60a5fa" />
    </svg>
  );
}
function IconPlant() {
  return (
    <svg viewBox="0 0 64 64" className="h-12 w-12" aria-hidden>
      <path d="M6 58V30l14 8V30l14 8V30l14 8V14h10v44z" fill="#cbd5e1" />
      <rect x="12" y="44" width="8" height="8" fill="#fff" /><rect x="28" y="44" width="8" height="8" fill="#fff" /><rect x="44" y="44" width="8" height="8" fill="#ff7a1a" />
      <path d="M50 10h6M53 6v4" stroke="#94a3b8" strokeWidth="2" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-clip bg-white text-[#0f1419] [font-feature-settings:'ss01']">
      <a href="#contenuto" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-[#1d3fd6] focus:px-3 focus:py-2 focus:text-white">Vai al contenuto</a>

      <header className="sticky top-0 z-40 border-b border-[#eceef1] bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden><rect x="3" y="16" width="10" height="5" rx="1.5" fill="#374151" /><path d="M8 16l3-8 7-2" fill="none" stroke="#ff7a1a" strokeWidth="3" strokeLinecap="round" /><circle cx="19" cy="6" r="2.5" fill="#1d3fd6" /></svg>
            Gergo
          </Link>
          <nav aria-label="Principale" className="hidden gap-6 text-sm text-[#374151] md:flex">
            <a href="#come-funziona" className="hover:text-[#0f1419]">Come funziona</a>
            <a href="#per-chi" className="hover:text-[#0f1419]">Per chi</a>
            <a href="#video" className="hover:text-[#0f1419]">Video</a>
            <a href="#fiducia" className="hover:text-[#0f1419]">Sicurezza</a>
            <a href="#security-stack" className="hover:text-[#0f1419]">Security stack</a>
            <a href="#numeri" className="hover:text-[#0f1419]">Numeri</a>
            <a href="#pilota" className="hover:text-[#0f1419]">Pilota</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <a href={DECK_URL} download className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-[#374151] hover:bg-[#f3f4f6] sm:inline-flex">Pitch deck <span className="ml-1 font-mono text-[10px] text-[#6b7280]">PDF</span></a>
            <Link href={CONSOLE_URL} prefetch={false} className="rounded-lg bg-[#1d3fd6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1733b0]">Prova la demo →</Link>
          </div>
        </div>
      </header>

      <main id="contenuto">
        <div id="come-funziona"><Story /></div>

        {/* Il problema, in una riga */}
        <section className="border-y border-[#eceef1] bg-[#0f1419] text-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-[#ff9a4d]">Il problema</p>
              <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Ogni volta che il prodotto cambia, il cobot aspetta il tecnico.</h2>
            </div>
            <div className="space-y-5 text-lg text-white/75">
              <p>Riprogrammare una cella di packaging richiede giorni di integratore. Chi lavora in linea conosce la postazione meglio di chiunque, ma non può cambiarla. E nessuno registra perché i cicli rallentano.</p>
              <p className="text-white">Gergo mette la voce di chi lavora al centro: il tecnico installa, l&apos;operatore allena, la postazione ricorda.</p>
            </div>
          </div>
        </section>

        {/* Per chi */}
        <section id="per-chi" className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
          <Eyebrow>Per chi</Eyebrow>
          <h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Ognuno fa il suo mestiere. Meglio.</h2>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              { icon: <IconOperator />, who: "Operatore", h: "Cambi il ciclo con la voce", t: "Insegni una variante in un minuto, la correggi quando serve, chiedi il resoconto del turno. Ogni movimento te lo rilegge prima di farlo." },
              { icon: <IconTech />, who: "Tecnico e integratore", h: "Installi una volta, assisti di più", t: "Insegni i gesti di base sul pendant e lasci alla postazione le varianti. Meno chiamate per piccole modifiche, più cobot seguiti da ogni tecnico." },
              { icon: <IconPlant />, who: "Responsabile di produzione", h: "Vedi cosa migliora davvero", t: "Ogni routine è versionata, approvata da una persona e misurata: tempo di ciclo prima e dopo, correzioni, stop. Niente cambia da solo." },
            ].map((c) => (
              <article key={c.who} className="rounded-2xl border border-[#e3e6ea] bg-[#f8f9fa] p-7">
                {c.icon}
                <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.18em] text-[#6b7280]">{c.who}</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight">{c.h}</h3>
                <p className="mt-3 leading-relaxed text-[#4b5563]">{c.t}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Il video, al centro della pagina */}
        <section id="video" className="border-y border-[#eceef1] bg-[#f6f7f9]">
          <div className="mx-auto max-w-5xl px-4 py-24 text-center sm:px-6">
            <div className="flex justify-center"><Eyebrow>Il video · 3 minuti</Eyebrow></div>
            <h2 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Gergo in tre minuti.</h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-[#4b5563]">Il problema, quanto costa, come funziona e come cambia il lavoro di chi installa e assiste i cobot.</p>
            <video
              className="mx-auto mt-10 aspect-video w-full rounded-2xl border border-[#e5e7eb] bg-[#0f1419] shadow-[0_30px_80px_-40px_rgba(15,20,25,0.45)]"
              src="/gergoai-video.mp4"
              poster="/gergoai-video-poster.jpg"
              controls
              playsInline
              preload="metadata"
            >
              Il tuo browser non riproduce il video: <a href="/gergoai-video.mp4">scaricalo qui</a>.
            </video>
          </div>
        </section>

        {/* Fiducia e controllo */}
        <section id="fiducia" className="bg-[#f6f7f9]">
          <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
            <Eyebrow>Fiducia e controllo</Eyebrow>
            <h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Il modello capisce. Il codice decide.</h2>
            <p className="mt-5 max-w-2xl text-lg text-[#4b5563]">Grok capisce cosa vuoi dire. Cosa il braccio può fare lo decidono regole scritte, verificabili, uguali ogni volta.</p>
            <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {[
                { k: "01", h: "Nessuna coordinata dal modello", t: "Grok passa solo intenzioni: direzione, quantità, «un po'». I millimetri, l'area di lavoro e la cinematica li controlla il codice." },
                { k: "02", h: "Prima la rilettura, poi il sì", t: "Ogni movimento viene riletto con numeri e velocità. Senza un sì esplicito non parte niente." },
                { k: "03", h: "Ogni modifica è una versione", t: "Nuova routine o ottimizzazione: nasce in bozza, la approva una persona, resta nel registro ed è reversibile." },
                { k: "04", h: "Il codice si legge, non si racconta", t: "Il registro del codice mostra i limiti di sicurezza letti dai sorgenti, con file, riga e commit, e ogni modifica agli script." },
              ].map((c) => (
                <article key={c.k} className="rounded-2xl border border-[#e3e6ea] bg-white p-6">
                  <p className="font-mono text-sm text-[#1d3fd6]">{c.k}</p>
                  <h3 className="mt-3 text-lg font-semibold">{c.h}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-[#4b5563]">{c.t}</p>
                </article>
              ))}
            </div>
            <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-red-200 bg-red-50 p-6 sm:flex-row sm:items-center">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-red-700">Chiaro fin da subito</p>
              <p className="text-[15px] text-red-900">L&apos;arresto vocale e acustico è uno stop in più. Non sostituisce l&apos;e-stop fisico, la rilevazione di collisione del controller né la valutazione del rischio della cella. Accensione, freni e allarmi si gestiscono dal pendant.</p>
              <Link href={LEDGER_URL} prefetch={false} className="shrink-0 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100">Registro del codice →</Link>
            </div>
          </div>
        </section>


        {/* Security stack */}
        <section id="security-stack" className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
          <Eyebrow>Security stack del sistema di sicurezza</Eyebrow>
          <h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Ogni modifica attraversa sei controlli. Basta un no per fermarla.</h2>
          <p className="mt-5 max-w-2xl text-lg text-[#4b5563]">Quando l&apos;operatore corregge un movimento a voce, Gergo non riscrive il codice da solo: propone una modifica allo script Python, e la modifica deve superare persone, regole e un agente di revisione prima di arrivare al braccio.</p>
          <ol className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              { n: "1", who: "Persona", h: "Prova e «è giusto»", t: "L'operatore prova il movimento sul braccio, lo corregge a voce e conferma che ora si muove come deve. Ogni passo eseguito resta nel registro." },
              { n: "2", who: "Codice", h: "Solo dati, dentro i limiti", t: "Un controllo deterministico verifica che lo script sia solo dati: niente import, chiamate o coordinate; ogni passo entro 10 cm, lo spostamento totale plausibile." },
              { n: "3", who: "Agente AI", h: "Revisione di sicurezza", t: "Un agente rilegge lo script con una checklist: senso fisico della sequenza, provenienza, istruzioni nascoste nei testi. Se ha dubbi, lo manda a una persona." },
              { n: "4", who: "Persona", h: "Revisione della Pull Request", t: "La modifica arriva come Pull Request con l'esito di ogni gate. La unisce solo chi è responsabile del bridge." },
              { n: "5", who: "CI", h: "Lo stesso controllo, di nuovo", t: "Su GitHub lo script viene letto senza mai eseguirlo: se non è un letterale nei limiti, la PR resta rossa." },
              { n: "6", who: "Bridge", h: "Rivalida prima di muovere", t: "In esecuzione il bridge rifà geofence, cinematica e conferma. L'arresto vocale e acustico e l'e-stop fisico restano sempre attivi." },
            ].map((g) => (
              <li key={g.n} className="relative rounded-2xl border border-[#e3e6ea] bg-white p-6">
                <span className="absolute right-5 top-5 font-mono text-3xl font-semibold text-[#e3e6ea]">{g.n}</span>
                <p className={`font-mono text-[11px] uppercase tracking-[0.18em] ${g.who === "Persona" ? "text-[#0f766e]" : g.who === "Agente AI" ? "text-[#a21caf]" : "text-[#1d3fd6]"}`}>{g.who}</p>
                <h3 className="mt-2 text-xl font-semibold">{g.h}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-[#4b5563]">{g.t}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 grid gap-5 rounded-2xl bg-[#0f1419] p-8 text-white md:grid-cols-[1fr_1.3fr]">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-[#ff9a4d]">Dal registro a un dataset</p>
              <h3 className="mt-3 text-2xl font-semibold leading-snug">Ogni modifica diventa un caso di verifica.</h3>
            </div>
            <p className="text-white/75">Frase dell&apos;operatore, prova sul braccio, script generato, esito di ogni gate e decisione finale: tutto finisce in un dataset esportabile. È la base di un workflow di verifica di sicurezza e qualità degli script, oggi per i comandi vocali e domani per gli input da visione e videocamera.</p>
          </div>
        </section>

        {/* Numeri */}
        <section id="numeri" className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
          <Eyebrow>Perché adesso</Eyebrow>
          <h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">I cobot crescono. I tecnici no.</h2>
          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-[#e3e6ea] bg-[#e3e6ea] sm:grid-cols-2 lg:grid-cols-4">
            {[
              { n: "66.000", t: "cobot installati nel mondo nel 2025", s: <Source kind="verificato" text="IFR 2026" /> },
              { n: "7.824", t: "robot industriali installati in Italia nel 2025", s: <Source kind="verificato" text="UR su dati IFR" /> },
              { n: "1,5 giorni", t: "per riposizionare una cella di packaging in modo convenzionale", s: <Source kind="vendor" text="OnRobot" /> },
              { n: "−43%", t: "di tempo programmando a voce cobot UR", s: <Source kind="vendor" text="CoboVox 2023" /> },
            ].map((x) => (
              <div key={x.n} className="bg-white p-7">
                <p className="text-4xl font-semibold tracking-tight">{x.n}</p>
                <p className="mt-2 text-[15px] text-[#4b5563]">{x.t}</p>
                <p className="mt-3">{x.s}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            <div className="rounded-2xl border border-[#e3e6ea] p-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#6b7280]">Oggi, in sala</p>
              <p className="mt-2 text-lg font-semibold">Misuriamo dal vivo</p>
              <p className="mt-2 text-[15px] text-[#4b5563]">Principianti al primo ciclo corretto, memoria contro zero-shot, tempo di ciclo v1 contro v2. I numeri arrivano nel deck e nel report, con la query che li produce.</p>
            </div>
            <div className="rounded-2xl border border-[#e3e6ea] p-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#6b7280]">Scenario base <Source kind="ipotesi" /></p>
              <p className="mt-2 text-lg font-semibold">Da 33 a 82 cobot per tecnico</p>
              <p className="mt-2 text-[15px] text-[#4b5563]">Se l&apos;operatore risolve a voce le piccole modifiche, ogni tecnico segue più del doppio dei cobot.</p>
            </div>
            <div className="rounded-2xl border border-[#e3e6ea] p-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#6b7280]">Modello <Source kind="ipotesi" /></p>
              <p className="mt-2 text-lg font-semibold">60 € al mese per cobot attivo</p>
              <p className="mt-2 text-[15px] text-[#4b5563]">Circa un terzo del valore delle ore di tecnico risparmiate. Si vende agli integratori, che lo portano nelle loro installazioni.</p>
            </div>
          </div>
        </section>

        {/* Pilota */}
        <section id="pilota" className="bg-[#f6f7f9]">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-24 sm:px-6 lg:grid-cols-2">
            <div>
              <Eyebrow>Il prossimo passo</Eyebrow>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Una settimana con un integratore.</h2>
              <p className="mt-5 text-lg text-[#4b5563]">Prima sui ticket veri: quante richieste di assistenza degli ultimi tre mesi poteva risolvere l&apos;operatore a voce. Poi su due cobot in fabbrica, cronometro alla mano.</p>
            </div>
            <div className="rounded-2xl border border-[#e3e6ea] bg-white p-7">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#6b7280]">La soglia che ci ferma, scritta prima</p>
              <p className="mt-3 text-2xl font-semibold leading-snug">Se meno del 25% delle richieste è risolvibile dall&apos;operatore a voce, lo scenario base cade.</p>
              <p className="mt-3 text-[15px] text-[#4b5563]">Lo diciamo prima di misurare, così il numero decide al posto nostro.</p>
            </div>
          </div>
        </section>

        {/* Chiusura */}
        <section className="mx-auto max-w-7xl px-4 py-24 text-center sm:px-6">
          <h2 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">Prova a parlargli.</h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-[#4b5563]">La console della postazione: voce, approvazioni, registro e allerta, collegata al braccio in simulazione o al vero.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href={CONSOLE_URL} prefetch={false} className={primary}>Prova la demo →</Link>
            <a href={DECK_URL} download className={secondary}>Scarica il pitch deck <span className="font-mono text-xs text-[#6b7280]">PDF</span></a>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#eceef1]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-10 text-sm text-[#6b7280] sm:flex-row sm:items-center sm:px-6">
          <p>Gergo · KVA, Kakashi Venture Accelerator · Grok Hackathon at the Museum, Pavia, 5 novembre 2026</p>
          <nav aria-label="Link utili" className="flex flex-wrap gap-5 sm:ml-auto">
            <a href={DECK_URL} download className="hover:text-[#0f1419]">Pitch deck (PDF)</a>
            <Link href={CONSOLE_URL} prefetch={false} className="hover:text-[#0f1419]">Demo</Link>
            <Link href={LEDGER_URL} prefetch={false} className="hover:text-[#0f1419]">Registro del codice</Link>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="hover:text-[#0f1419]">GitHub</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
