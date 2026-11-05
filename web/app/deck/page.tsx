import type { Metadata } from "next";
import Link from "next/link";
import { SLIDES, Slide } from "@/components/deck/slides";
import { DECK_URL } from "@/components/landing/links";

export const metadata: Metadata = {
  title: "Gergo · pitch deck",
  description: "Il pitch deck di Gergo: allena il braccio con la tua voce, nella sua postazione.",
};

// Tutte le slide in colonna. In stampa ogni slide è una pagina 16:9: da qui si esporta il PDF del deck.
export default function DeckPage() {
  return (
    <div className="min-h-screen bg-[#e9ecef] text-[#0f1419]">
      <style>{`
        @page { size: 1440px 810px; margin: 0; }
        @media print {
          html, body { background: #fff !important; }
          .deck-toolbar { display: none !important; }
          .deck-list { padding: 0 !important; gap: 0 !important; max-width: none !important; }
          .deck-list > .deck-slide { width: 1440px; break-after: page; box-shadow: none !important; border-radius: 0 !important; }
          .deck-list > .deck-slide:last-child { break-after: auto; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <header className="deck-toolbar sticky top-0 z-10 border-b border-[#d7dbe0] bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link href="/" className="font-semibold">← Gergo</Link>
          <p className="hidden font-mono text-xs text-[#6b7280] sm:block">Pitch deck · {SLIDES.length} slide</p>
          <a href={DECK_URL} download="Gergo-pitch-deck.pdf" className="ml-auto rounded-lg bg-[#1d3fd6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1733b0]">Scarica PDF</a>
        </div>
      </header>
      <main className="deck-list mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        {SLIDES.map((s, i) => (
          <section key={s.id} id={s.id} aria-label={`Slide ${i + 1}: ${s.title}`} className="deck-slide overflow-hidden rounded-xl shadow-[0_20px_50px_-30px_rgba(15,20,25,0.5)]">
            <Slide index={i} />
          </section>
        ))}
      </main>
    </div>
  );
}
