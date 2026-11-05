"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CONSOLE_URL, DECK_URL } from "./links";
import { Scene } from "./Scene";

// Racconto a capitoli: il testo scorre a sinistra, la postazione resta ferma a destra e cambia con il capitolo.
const STEPS = [
  {
    eyebrow: "Gergo",
    title: <>Parla al braccio.<br />Impara la tua postazione.</>,
    text: "Chi lavora in linea allena il cobot a voce, in italiano, senza scrivere una riga di codice e senza aspettare il tecnico. Gergo ricorda come lavori e ti propone come lavorare meglio.",
    cta: true,
  },
  {
    eyebrow: "Il tecnico, una volta",
    title: <>Si installa una volta.<br />Poi lo alleni tu.</>,
    text: "Il tecnico insegna sul pendant i gesti di base, uno per luogo: solleva, porta, applica, deposita. Da quel momento i cambi di ciclo, i nomi e le varianti li fa chi sta alla postazione.",
  },
  {
    eyebrow: "Insegnalo a voce",
    title: <>Spiegaglielo<br />come a un collega.</>,
    text: "«Ti insegno la frontale…». Gergo trasforma la spiegazione in una routine, te la rilegge passo per passo e la salva solo quando dici sì. Il gergo della postazione lo impara strada facendo: «il carrello» diventa l'uscita.",
  },
  {
    eyebrow: "Sicuro per costruzione",
    title: <>Si muove solo<br />dopo il tuo sì.</>,
    text: "«Scendi di 10 centimetri.» I millimetri li calcola il codice, non il modello: controlla l'area di lavoro e la cinematica, rilegge la frase e aspetta la conferma. Massimo 10 centimetri per comando.",
  },
  {
    eyebrow: "La memoria della postazione",
    title: <>Nota cosa rallenta.<br />Ti propone di meglio.</>,
    text: "Ogni ciclo finisce nel registro. Quando qualcosa si ripete o rallenta, Gergo lo dice: «tra un ciclo e l'altro torno sempre a casa, lo tolgo?». Approvi tu, nasce la versione 2, si misura la differenza.",
  },
  {
    eyebrow: "Sempre sotto controllo",
    title: <>Dici «fermo».<br />Si ferma.</>,
    text: "Un ascolto locale, senza cloud, riconosce «stop», «fermo», una botta sul banco o un urlo e ferma il braccio. È uno stop in più: l'e-stop fisico resta al suo posto, in mano allo staff.",
  },
];

export function Story() {
  const [ch, setCh] = useState(0);
  const [paused, setPaused] = useState(false);
  const refs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setCh(Number((e.target as HTMLElement).dataset.ch));
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="relative mx-auto grid max-w-7xl lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
      {/* Scena fissa: in alto su mobile, a destra su desktop */}
      <div className="sticky top-16 z-0 -mb-[44vh] h-[44vh] lg:order-2 lg:mb-0 lg:h-[calc(100vh-5rem)]">
        <div className="relative h-full overflow-hidden rounded-none bg-[#eceef1] lg:mt-2 lg:rounded-3xl lg:border lg:border-[#e3e6ea]">
          <Scene ch={ch} paused={paused} />
          <div className="absolute bottom-3 left-3 flex gap-1.5" aria-hidden>
            {STEPS.map((_, i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === ch ? "w-6 bg-[#1d3fd6]" : "w-1.5 bg-[#c5cad1]"}`} />)}
          </div>
          <button onClick={() => setPaused((x) => !x)}
            className="absolute bottom-3 right-3 rounded-md border border-[#d7dbe0] bg-white/90 px-2.5 py-1 font-mono text-[11px] text-[#374151] hover:bg-white">
            {paused ? "▶ Riprendi animazione" : "❚❚ Pausa animazione"}
          </button>
        </div>
      </div>

      <div className="relative z-10 lg:order-1">
        {STEPS.map((s, i) => (
          <section key={i} data-ch={i} ref={(el) => { refs.current[i] = el; }}
            className="flex min-h-[100svh] flex-col justify-end px-4 pb-10 sm:px-6 lg:min-h-screen lg:justify-center lg:px-8 lg:py-14">
            <div className="rounded-2xl bg-white/95 p-5 shadow-[0_-12px_40px_-12px_rgba(15,20,25,0.15)] backdrop-blur lg:bg-transparent lg:p-0 lg:shadow-none">
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-[#1d3fd6]">{s.eyebrow}</p>
            {i === 0 ? (
              <h1 className="mt-3 text-4xl lg:mt-4 lg:text-5xl font-semibold leading-[1.02] tracking-tight text-[#0f1419] sm:text-6xl">{s.title}</h1>
            ) : (
              <h2 className="mt-3 text-3xl font-semibold leading-[1.05] tracking-tight text-[#0f1419] sm:text-5xl lg:mt-4">{s.title}</h2>
            )}
            <p className="mt-4 max-w-lg text-base leading-relaxed text-[#4b5563] sm:text-lg lg:mt-5">{s.text}</p>
            {s.cta && (
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href={CONSOLE_URL} prefetch={false} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1d3fd6] px-6 py-3.5 font-semibold text-white shadow-sm hover:bg-[#1733b0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d3fd6]">
                  Prova la demo <span aria-hidden>→</span>
                </Link>
                <a href={DECK_URL} download className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#d7dbe0] bg-white px-6 py-3.5 font-semibold text-[#0f1419] hover:border-[#9aa3ad] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d3fd6]">
                  Scarica il pitch deck <span className="font-mono text-xs text-[#6b7280]">PDF</span>
                </a>
              </div>
            )}
            {i === 0 && <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-[#6b7280]">Grok Hackathon at the Museum · Pavia · Track 04 Voice Control</p>}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
