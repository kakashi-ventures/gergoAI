import type { Metadata } from "next";
import Link from "next/link";
import { Credits } from "@/components/landing/Credits";
import { DECK_HTML_URL, DECK_URL, REPO_URL } from "@/components/landing/links";

export const metadata: Metadata = {
  title: "Gergo · approfondimento di mercato",
  description: "Il mercato dei cobot, quanto crescerà, perché Gergo è nuovo, il landscape dei concorrenti e come ci posizioniamo.",
};

// Dossier di mercato. Ogni numero porta la fonte e il tipo: verificato (fonte primaria), analisti (stime di società
// di ricerca, definizioni diverse), vendor (dichiarato da chi vende), ipotesi (modello Gergo), stima (calcolo nostro).
// Fonti lette il 5/11/2026.

type Kind = "verificato" | "analisti" | "vendor" | "ipotesi" | "stima" | "secondaria";
function Src({ kind, children }: { kind: Kind; children?: React.ReactNode }) {
  const c: Record<Kind, string> = {
    verificato: "bg-emerald-50 text-emerald-700",
    analisti: "bg-sky-50 text-sky-700",
    vendor: "bg-amber-50 text-amber-700",
    ipotesi: "bg-violet-50 text-violet-700",
    stima: "bg-indigo-50 text-indigo-700",
    secondaria: "bg-stone-100 text-stone-600",
  };
  return <span className={`inline-block rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${c[kind]}`}>{kind}{children ? <> · {children}</> : null}</span>;
}
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-xs uppercase tracking-[0.22em] text-[#1d3fd6]">{children}</p>;
}
function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">{children}</h2>;
}
function A({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="underline decoration-[#9aa3ad] underline-offset-2 hover:text-[#1d3fd6] hover:decoration-[#1d3fd6]">{children}</a>;
}

const SECTIONS = [
  ["oggi", "Il mercato oggi"],
  ["crescita", "Quanto crescerà"],
  ["innovazione", "Perché è nuovo"],
  ["landscape", "Landscape"],
  ["posizionamento", "Posizionamento"],
  ["rischi", "Rischi"],
  ["fonti", "Fonti"],
] as const;

// Mappa di posizionamento: x = chi lo usa (0 tecnico/ingegnere → 100 operatore di linea),
// y = cosa impara il sistema (0 movimenti e codice → 100 la postazione: lessico, routine, storia). Nostra lettura.
const MAP = [
  { n: "Siemens Industrial Copilot", x: 14, y: 22, c: "#6b7280" },
  { n: "Acteris · Trener", x: 34, y: 40, c: "#6b7280" },
  { n: "Wandelbots", x: 52, y: 14, c: "#6b7280" },
  { n: "CoboVox", x: 72, y: 28, c: "#6b7280" },
  { n: "Formant", x: 22, y: 62, c: "#6b7280" },
  { n: "Software dei produttori", x: 30, y: 10, c: "#6b7280" },
  { n: "Gergo", x: 82, y: 84, c: "#1d3fd6" },
];

export default function Approfondimento() {
  return (
    <div className="min-h-screen bg-white text-[#0f1419]">
      <header className="sticky top-0 z-40 border-b border-[#eceef1] bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="font-bold tracking-tight">← Gergo</Link>
          <p className="hidden font-mono text-xs uppercase tracking-[0.18em] text-[#6b7280] sm:block">Approfondimento di mercato</p>
          <div className="ml-auto flex gap-2">
            <Link href={DECK_HTML_URL} prefetch={false} className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-[#374151] hover:bg-[#f3f4f6] sm:inline-flex">Pitch deck</Link>
            <a href={DECK_URL} download="Gergo-pitch-deck.pdf" className="rounded-lg bg-[#1d3fd6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1733b0]">Scarica il deck</a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        {/* Apertura */}
        <section className="py-16">
          <Eyebrow>Dossier · 5 novembre 2026</Eyebrow>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">Il mercato dei cobot cresce più dei tecnici che li programmano.</h1>
          <p className="mt-6 max-w-3xl text-lg leading-relaxed text-[#4b5563]">Ogni anno entrano in fabbrica decine di migliaia di cobot nuovi, e ognuno porta con sé ore di tecnico per ogni cambio prodotto. La voce sui robot esiste già. Quello che manca è un sistema che impari <em>la postazione</em> e la migliori con una persona nel loop. Questo dossier raccoglie i numeri, il landscape e dove si colloca Gergo.</p>
          <p className="mt-4 max-w-3xl text-sm text-[#6b7280]">Legenda: <Src kind="verificato" /> fonte primaria · <Src kind="analisti" /> stima di società di ricerca · <Src kind="secondaria" /> ripresa da terzi · <Src kind="vendor" /> dichiarato da chi vende · <Src kind="ipotesi" /> modello Gergo · <Src kind="stima" /> nostro calcolo.</p>
          <nav aria-label="Sezioni" className="mt-8 flex flex-wrap gap-2">
            {SECTIONS.map(([id, t]) => <a key={id} href={`#${id}`} className="rounded-full border border-[#e3e6ea] px-3 py-1.5 text-sm text-[#374151] hover:border-[#9aa3ad]">{t}</a>)}
          </nav>
        </section>

        {/* 1. Oggi */}
        <section id="oggi" className="scroll-mt-20 border-t border-[#eceef1] py-16">
          <Eyebrow>01 · Il mercato oggi</Eyebrow>
          <H2>Più di 600.000 robot industriali installati in un anno. Uno su nove è un cobot.</H2>
          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-[#e3e6ea] bg-[#e3e6ea] sm:grid-cols-2 lg:grid-cols-4">
            {[
              { n: "603.000", t: "robot industriali installati nel mondo nel 2025, +11%; stock operativo 5,08 milioni", s: <Src kind="verificato">IFR 2026</Src> },
              { n: "66.000", t: "cobot installati nel 2025, l'11% delle installazioni", s: <Src kind="verificato">IFR 2026</Src> },
              { n: "7.824", t: "robot installati in Italia nel 2025: secondo mercato europeo", s: <Src kind="verificato">UR su dati IFR</Src> },
              { n: "1.086", t: "installazioni italiane in alimentare e bevande; 817 in pallettizzazione", s: <Src kind="verificato">UR su dati IFR</Src> },
            ].map((x) => (
              <div key={x.n} className="bg-white p-6">
                <p className="text-4xl font-semibold tracking-tight">{x.n}</p>
                <p className="mt-2 text-[15px] leading-snug text-[#4b5563]">{x.t}</p>
                <p className="mt-3">{x.s}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 max-w-3xl text-[15px] leading-relaxed text-[#4b5563]">Il segmento che ci interessa sono le PMI manifatturiere (food, packaging, cosmetica) con cobot già installati e cambi prodotto frequenti. Lì ogni piccola modifica passa da un integratore, e il costo non è il robot: è il tempo del tecnico e il fermo della linea. Un dato vendor dà l&apos;ordine di grandezza: <strong>1,5 giorni</strong> per riposizionare una cella di packaging con la programmazione convenzionale <Src kind="vendor">OnRobot</Src>.</p>
        </section>

        {/* 2. Crescita */}
        <section id="crescita" className="scroll-mt-20 border-t border-[#eceef1] py-16">
          <Eyebrow>02 · Quanto crescerà</Eyebrow>
          <H2>Tra il 19% e il 32% l&apos;anno, a seconda di chi misura. In ogni caso, più veloce dei tecnici.</H2>
          <p className="mt-5 max-w-3xl text-[15px] leading-relaxed text-[#4b5563]">Le stime sul valore del mercato dei cobot divergono molto, perché le società di ricerca usano perimetri diversi (solo il braccio, oppure braccio con software e servizi) e anni base diversi. Per questo le mostriamo come intervallo e non scegliamo il numero più alto.</p>
          <div className="mt-8 overflow-x-auto rounded-2xl border border-[#e3e6ea]">
            <table className="w-full min-w-[640px] text-left text-[15px]">
              <thead className="bg-[#f6f7f9] font-mono text-[11px] uppercase tracking-wider text-[#6b7280]">
                <tr><th className="px-5 py-3">Fonte</th><th className="px-5 py-3">Valore di partenza</th><th className="px-5 py-3">Valore al 2030</th><th className="px-5 py-3">Crescita annua</th><th className="px-5 py-3">Tipo</th></tr>
              </thead>
              <tbody className="divide-y divide-[#eceef1]">
                <tr><td className="px-5 py-3 font-semibold">MarketsandMarkets</td><td className="px-5 py-3">1,42 mld $ (2025)</td><td className="px-5 py-3">3,38 mld $</td><td className="px-5 py-3">18,9%</td><td className="px-5 py-3"><Src kind="analisti" /></td></tr>
                <tr><td className="px-5 py-3 font-semibold">Grand View Research</td><td className="px-5 py-3">2,14 mld $ (2024)</td><td className="px-5 py-3">11,64 mld $</td><td className="px-5 py-3">31,6%</td><td className="px-5 py-3"><Src kind="secondaria">da verificare sull&apos;originale</Src></td></tr>
                <tr><td className="px-5 py-3 font-semibold">IFR (unità, tutti i robot)</td><td className="px-5 py-3">603.000 installazioni (2025)</td><td className="px-5 py-3">oltre 700.000 nel 2028 (proiezione del 2025, già superata nel ritmo)</td><td className="px-5 py-3">—</td><td className="px-5 py-3"><Src kind="secondaria">World Robotics 2025</Src></td></tr>
              </tbody>
            </table>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            <div className="rounded-2xl border border-[#e3e6ea] p-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#6b7280]">Il flusso che conta per noi</p>
              <p className="mt-2 text-3xl font-semibold">66.000 cobot l&apos;anno</p>
              <p className="mt-2 text-[15px] text-[#4b5563]">Ogni cobot nuovo è una postazione da allenare. In Italia circa <strong>860</strong> l&apos;anno: l&apos;11% di quota cobot mondiale applicato alle 7.824 installazioni italiane. <Src kind="stima" /></p>
            </div>
            <div className="rounded-2xl border border-[#e3e6ea] p-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#6b7280]">Il valore per postazione</p>
              <p className="mt-2 text-3xl font-semibold">1.988 € l&apos;anno</p>
              <p className="mt-2 text-[15px] text-[#4b5563]">Ore di tecnico e trasferte risparmiate per cobot nello scenario base, con il cliente che risolve a voce il 40% delle richieste. <Src kind="ipotesi" /></p>
            </div>
            <div className="rounded-2xl border border-[#e3e6ea] p-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#6b7280]">Il tetto di una coorte</p>
              <p className="mt-2 text-3xl font-semibold">47,5 M€ l&apos;anno</p>
              <p className="mt-2 text-[15px] text-[#4b5563]">Se tutti i cobot di un anno mondiale pagassero 60 € al mese. È un tetto, non una previsione: il primo obiettivo sono 300 cobot con 3 integratori. <Src kind="ipotesi" /></p>
            </div>
          </div>
          <p className="mt-6 max-w-3xl text-[15px] leading-relaxed text-[#4b5563]">Il capitale segue: nella prima metà del 2026 le startup di robotica hanno raccolto 18,8 miliardi di dollari <Src kind="secondaria">Crunchbase</Src>, e nel software per programmare i robot in linguaggio naturale è entrato il primo round importante, i 32 milioni di Trener Robotics <Src kind="verificato">Automate, feb. 2026</Src>.</p>
        </section>

        {/* 3. Innovazione */}
        <section id="innovazione" className="scroll-mt-20 border-t border-[#eceef1] py-16">
          <Eyebrow>03 · Perché la soluzione è nuova</Eyebrow>
          <H2>Non insegniamo movimenti al modello. Gli insegniamo la postazione.</H2>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {[
              { h: "La memoria della postazione", t: "Gergo ricorda il lessico («il carrello», «la tre»), le routine insegnate a voce e la storia di ogni ciclo. Nei test di oggi la memoria risolve il gergo in 4 casi su 4, contro 2 su 4 senza memoria e 0 con le parole chiave." },
              { h: "Ottimizzazione ricorsiva con una persona nel loop", t: "Il registro nota passi lenti, correzioni ripetute e passi superflui; Gergo propone una versione migliore, l'operatore la approva, il sistema misura prima e dopo e torna indietro se peggiora. Niente cambia da solo." },
              { h: "Il modello capisce, il codice decide", t: "Grok passa solo intenzioni a enum (direzione, quantità). Millimetri, area di lavoro, cinematica e conferma li gestisce codice deterministico: 0 esecuzioni senza conferma e 0 movimenti fuori area in tutte le prove di oggi." },
              { h: "Codeless, ma verificabile", t: "Le modifiche diventano script di soli dati, controllati da regole, da un agente di revisione e dalla CI, e approvati da una persona. Ogni modifica è un caso di verifica in un dataset: la base di un workflow di qualità degli script." },
              { h: "Uno stop in più, locale", t: "Un ascolto offline riconosce «stop», «fermo», una botta o un urlo e ferma il braccio senza passare dal cloud. È un livello in più: l'e-stop fisico e la rilevazione di collisione restano al loro posto." },
              { h: "Indipendente dal produttore", t: "Il bridge parla con il controller tramite un'interfaccia unica: oggi Elite CS (Dashboard, RTSI, Primary), il trasporto per la serie EC è documentato. Lo stesso livello può stare sopra altri cobot." },
            ].map((c, i) => (
              <article key={c.h} className="rounded-2xl border border-[#e3e6ea] bg-[#f8f9fa] p-7">
                <p className="font-mono text-sm text-[#1d3fd6]">{String(i + 1).padStart(2, "0")}</p>
                <h3 className="mt-2 text-xl font-semibold">{c.h}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-[#4b5563]">{c.t}</p>
              </article>
            ))}
          </div>
        </section>

        {/* 4. Landscape */}
        <section id="landscape" className="scroll-mt-20 border-t border-[#eceef1] py-16">
          <Eyebrow>04 · Landscape dei concorrenti</Eyebrow>
          <H2>La voce sui cobot esiste già. Il nostro spazio è la postazione.</H2>
          <div className="mt-10 overflow-x-auto rounded-2xl border border-[#e3e6ea]">
            <table className="w-full min-w-[820px] text-left text-[15px]">
              <thead className="bg-[#f6f7f9] font-mono text-[11px] uppercase tracking-wider text-[#6b7280]">
                <tr><th className="px-5 py-3">Categoria</th><th className="px-5 py-3">Chi</th><th className="px-5 py-3">Cosa fa</th><th className="px-5 py-3">Segnali</th><th className="px-5 py-3">Rispetto a Gergo</th></tr>
              </thead>
              <tbody className="divide-y divide-[#eceef1] align-top">
                <tr>
                  <td className="px-5 py-4 text-[#6b7280]">Voce sui cobot</td>
                  <td className="px-5 py-4 font-semibold">CoboVox · Konica Minolta</td>
                  <td className="px-5 py-4">Programmazione e controllo vocale per cobot Universal Robots, venduto sul marketplace UR dal 2023.</td>
                  <td className="px-5 py-4">fino a −43% del tempo di programmazione <Src kind="vendor" /></td>
                  <td className="px-5 py-4">Comandi vocali; memoria della postazione e ottimizzazione non dichiarate; i waypoint si posizionano ancora a mano.</td>
                </tr>
                <tr>
                  <td className="px-5 py-4 text-[#6b7280]">Linguaggio naturale e skill</td>
                  <td className="px-5 py-4 font-semibold">Acteris · Trener Robotics</td>
                  <td className="px-5 py-4">I compiti si descrivono in linguaggio naturale e diventano automazione, con skill pre-addestrate; ABB, UR e FANUC.</td>
                  <td className="px-5 py-4">Series A da 32 M$, febbraio 2026 <Src kind="verificato">Automate</Src></td>
                  <td className="px-5 py-4">Il concorrente più vicino. Parte dall&apos;asservimento delle CNC e dalle skill del vendor; noi dal lessico e dalla storia della postazione.</td>
                </tr>
                <tr>
                  <td className="px-5 py-4 text-[#6b7280]">No-code per dimostrazione</td>
                  <td className="px-5 py-4 font-semibold">Wandelbots</td>
                  <td className="px-5 py-4">Si insegna il percorso mostrandolo (TracePen) e il sistema genera il programma.</td>
                  <td className="px-5 py-4">Series B da 30 M$; «fino a 70 volte più veloce» <Src kind="vendor" /></td>
                  <td className="px-5 py-4">Insegna traiettorie, non dialoga e non ricorda la postazione. Complementare: le primitive possono nascere così.</td>
                </tr>
                <tr>
                  <td className="px-5 py-4 text-[#6b7280]">Copilot di automazione</td>
                  <td className="px-5 py-4 font-semibold">Industrial Copilot · Siemens</td>
                  <td className="px-5 py-4">Genera codice PLC e spiega i guasti in linguaggio naturale, su Azure OpenAI, anche on-premise.</td>
                  <td className="px-5 py-4">Prodotto di un grande vendor <Src kind="verificato">siemens.com</Src></td>
                  <td className="px-5 py-4">Lavora per l&apos;ingegnere di automazione sulla linea; l&apos;estensione ai cobot non è verificata da fonte primaria.</td>
                </tr>
                <tr>
                  <td className="px-5 py-4 text-[#6b7280]">Gestione di flotte</td>
                  <td className="px-5 py-4 font-semibold">Formant</td>
                  <td className="px-5 py-4">Monitoraggio e teleoperazione di flotte di robot, prezzo per dispositivo.</td>
                  <td className="px-5 py-4">Modello per dispositivo <Src kind="verificato">formant.io</Src></td>
                  <td className="px-5 py-4">Gestisce la flotta, non la allena. Stesso modello di prezzo per cobot: conferma che il cliente lo capisce.</td>
                </tr>
                <tr>
                  <td className="px-5 py-4 text-[#6b7280]">Software dei produttori</td>
                  <td className="px-5 py-4 font-semibold">Pendant e app dei vendor di cobot</td>
                  <td className="px-5 py-4">Programmazione a blocchi, wizard e marketplace di app sul pendant.</td>
                  <td className="px-5 py-4">Ogni produttore ha il suo <Src kind="stima" /></td>
                  <td className="px-5 py-4">Il rischio più serio: un assistente in linguaggio naturale nativo. La nostra difesa è la memoria accumulata di ogni postazione, multi-vendor.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 5. Posizionamento */}
        <section id="posizionamento" className="scroll-mt-20 border-t border-[#eceef1] py-16">
          <Eyebrow>05 · Come ci posizioniamo</Eyebrow>
          <H2>Per chi lavora in linea, su ciò che nessun modello sa già: come lavora quella postazione.</H2>
          <div className="mt-10 grid gap-10 lg:grid-cols-[1.1fr_1fr]">
            <figure className="min-w-0">
              <div className="relative aspect-square w-full max-w-[560px] overflow-hidden rounded-2xl border border-[#e3e6ea] bg-[#f8f9fa]">
                <div className="absolute inset-x-0 top-1/2 h-px bg-[#d7dbe0]" />
                <div className="absolute inset-y-0 left-1/2 w-px bg-[#d7dbe0]" />
                <span className="absolute left-3 top-3 font-mono text-[10px] uppercase tracking-wider text-[#6b7280]">impara la postazione ↑</span>
                <span className="absolute bottom-3 left-3 font-mono text-[10px] uppercase tracking-wider text-[#6b7280]">impara movimenti e codice ↓</span>
                <span className="absolute bottom-3 right-3 font-mono text-[10px] uppercase tracking-wider text-[#6b7280]">→ operatore di linea</span>
                <span className="absolute right-3 top-3 rounded bg-[#1d3fd6]/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#1d3fd6]">spazio libero</span>
                {MAP.map((p) => (
                  <div key={p.n} className="absolute -translate-x-1/2 translate-y-1/2" style={{ left: `${p.x}%`, bottom: `${p.y}%` }}>
                    <span className="block h-3.5 w-3.5 rounded-full border-2 border-white shadow" style={{ background: p.c, transform: p.n === "Gergo" ? "scale(1.6)" : undefined }} />
                    <span className={`absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-xs ${p.x > 60 ? "right-5" : "left-4"} ${p.n === "Gergo" ? "font-bold text-[#1d3fd6]" : "text-[#374151]"}`}>{p.n}</span>
                  </div>
                ))}
              </div>
              <figcaption className="mt-3 max-w-[560px] text-sm text-[#6b7280]">Asse orizzontale: chi usa il sistema, dal tecnico o ingegnere all&apos;operatore. Asse verticale: cosa impara, dai movimenti e dal codice alla postazione (lessico, routine, storia). Le posizioni sono la nostra lettura dei materiali pubblici, non una misura.</figcaption>
            </figure>
            <div className="min-w-0">
              <div className="overflow-x-auto rounded-2xl border border-[#e3e6ea]">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead className="bg-[#f6f7f9] font-mono text-[10px] uppercase tracking-wider text-[#6b7280]">
                    <tr><th className="px-4 py-3">Capacità</th><th className="px-3 py-3 text-[#1d3fd6]">Gergo</th><th className="px-3 py-3">CoboVox</th><th className="px-3 py-3">Acteris</th><th className="px-3 py-3">Wandelbots</th></tr>
                  </thead>
                  <tbody className="divide-y divide-[#eceef1]">
                    {[
                      ["Comandi in linguaggio naturale", "sì", "sì", "sì", "no"],
                      ["Italiano", "sì", "n.d.", "n.d.", "—"],
                      ["Memoria del lessico della postazione", "sì", "n.d.", "n.d.", "no"],
                      ["Routine insegnate a voce, versionate", "sì", "parziale", "n.d.", "no"],
                      ["Proposte di ottimizzazione approvate e misurate", "sì", "n.d.", "n.d.", "n.d."],
                      ["Il modello non emette coordinate", "sì", "n.d.", "n.d.", "—"],
                      ["Più marche di cobot", "in arrivo", "solo UR", "sì", "sì"],
                    ].map((r) => (
                      <tr key={r[0]}>
                        <td className="px-4 py-2.5">{r[0]}</td>
                        {r.slice(1).map((v, i) => <td key={i} className={`px-3 py-2.5 ${i === 0 ? "font-semibold text-[#1d3fd6]" : "text-[#4b5563]"}`}>{v}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-sm text-[#6b7280]">«n.d.» significa non dichiarato nei materiali pubblici che abbiamo letto, non «assente».</p>
              <div className="mt-8 space-y-4 text-[15px] leading-relaxed text-[#4b5563]">
                <p><strong className="text-[#0f1419]">Chi compra:</strong> l&apos;integratore che assiste i cobot (più cobot per tecnico, meno trasferte), poi la fabbrica, poi il produttore di cobot in white label.</p>
                <p><strong className="text-[#0f1419]">Come si vende:</strong> per cobot attivo, 60 € al mese più un seat per tecnico. <Src kind="ipotesi" /></p>
                <p><strong className="text-[#0f1419]">Cosa non si copia:</strong> la demo si copia in un weekend. Lo storico di una postazione reale e delle sue ottimizzazioni misurate no. Oggi è un piano: diventa un fatto solo con un pilota.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 6. Rischi */}
        <section id="rischi" className="scroll-mt-20 border-t border-[#eceef1] py-16">
          <Eyebrow>06 · Rischi, detti prima</Eyebrow>
          <H2>Quello che potrebbe smentirci.</H2>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {[
              { h: "Funzione nativa dei produttori", t: "Un produttore di cobot integra un assistente in linguaggio naturale nel pendant. Risposta: multi-vendor e memoria della postazione, che il produttore non ha interesse a rendere portabile." },
              { h: "La memoria vale solo con il tempo", t: "Oggi l'abbiamo provata su una postazione e per poche ore. La memoria batte la baseline sul gergo (4/4 contro 2/4), ma la soglia di +15 punti complessivi scritta prima non è superata (−5 e +10 in due run): per ora diciamo «esegue routine insegnate», non «impara»." },
              { h: "La voce non è una funzione di sicurezza", t: "Lo stop vocale e acustico è uno strato in più. Le funzioni di sicurezza restano e-stop, rilevazione di collisione e valutazione del rischio della cella." },
              { h: "Il modello economico è da provare", t: "Il valore per cobot dipende da quante richieste l'operatore risolve da solo. La soglia è scritta: sotto il 25% delle richieste storiche lo scenario base cade." },
            ].map((r) => (
              <article key={r.h} className="rounded-2xl border border-[#e3e6ea] p-6">
                <h3 className="text-lg font-semibold">{r.h}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-[#4b5563]">{r.t}</p>
              </article>
            ))}
          </div>
        </section>

        {/* 7. Fonti */}
        <section id="fonti" className="scroll-mt-20 border-t border-[#eceef1] py-16">
          <Eyebrow>07 · Fonti</Eyebrow>
          <H2>Da dove vengono i numeri.</H2>
          <ul className="mt-8 grid gap-2 text-[15px] text-[#4b5563] md:grid-cols-2">
            <li><A href="https://ifr.org/ifr-press-releases/news/presidents-report-by-jane-heffner-3-2026">IFR, President&apos;s Report 2026</A>: installazioni 2025, stock, cobot</li>
            <li>Universal Robots su dati IFR World Robotics 2026: Italia, food & beverage, pallettizzazione</li>
            <li><A href="https://www.marketsandmarkets.com/market-reports/collaborative-robot-market-194541294.html">MarketsandMarkets, Collaborative Robot Market</A></li>
            <li>Grand View Research, ripreso da terzi: da verificare sul report originale</li>
            <li><A href="https://news.crunchbase.com/robotics/startup-venture-funding-surges-2026-data/">Crunchbase News, funding robotica 2026</A></li>
            <li><A href="https://www.automate.org/news/32m-series-a-and-the-rebrand-to-trener-robotics">Automate (A3): Trener Robotics, Series A</A></li>
            <li><A href="https://www.universal-robots.com/plus/products/konica-minolta/cobovox">Universal Robots marketplace: CoboVox</A> · <A href="https://robotics247.com/article/konica_minoltas_innovation_team_develops_voice_enabled_robotic_programming_platform">Robotics 24/7</A></li>
            <li><A href="https://control.com/news/wandelbots-raises-30m-series-b-funding-to-develop-tracepen-for-no-code-robot-programming/">Control.com: Wandelbots, Series B e TracePen</A></li>
            <li><A href="https://www.siemens.com/en-us/company/insights/digital-transformation-industrial-copilot">Siemens: Industrial Copilot</A></li>
            <li>OnRobot (benchmark vendor), Konica Minolta CoboVox 2023 (benchmark vendor)</li>
            <li>Modello economico Gergo: PLAN.md §12 e pitch deck, tutte ipotesi da verificare nel pilota</li>
            <li>Risultati A/B/C: <A href={`${REPO_URL}/tree/main/eval/results`}>eval/results nella repo</A></li>
          </ul>
        </section>

        <Credits />
      </main>
    </div>
  );
}
