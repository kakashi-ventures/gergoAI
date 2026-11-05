"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SLIDES, Slide } from "./slides";
import { DECK_HTML_URL, DECK_URL } from "../landing/links";

// Viewer del pitch deck nella landing: una slide alla volta, frecce, tastiera, swipe, indice e download.
export function DeckViewer() {
  const [i, setI] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const touch = useRef<number | null>(null);
  const n = SLIDES.length;
  const go = useCallback((k: number) => setI((x) => Math.min(n - 1, Math.max(0, x + k))), [n]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); go(1); }
      if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(-1); }
      if (e.key === "Home") setI(0);
      if (e.key === "End") setI(n - 1);
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [go, n]);

  const btn = "inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d7dbe0] bg-white text-lg text-[#0f1419] hover:border-[#9aa3ad] disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d3fd6]";

  return (
    <div>
      <div
        ref={box}
        tabIndex={0}
        role="region"
        aria-roledescription="presentazione"
        aria-label={`Pitch deck, slide ${i + 1} di ${n}: ${SLIDES[i].title}`}
        className="overflow-hidden rounded-2xl border border-[#e5e7eb] shadow-[0_30px_80px_-40px_rgba(15,20,25,0.45)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1d3fd6]"
        onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touch.current === null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          touch.current = null;
        }}
      >
        <Slide index={i} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" className={btn} onClick={() => go(-1)} disabled={i === 0} aria-label="Slide precedente">←</button>
        <button type="button" className={btn} onClick={() => go(1)} disabled={i === n - 1} aria-label="Slide successiva">→</button>
        <p className="font-mono text-sm text-[#4b5563]" aria-live="polite">{String(i + 1).padStart(2, "0")} / {n} · {SLIDES[i].title}</p>
        <div className="ml-auto flex flex-wrap gap-2">
          <Link href={DECK_HTML_URL} prefetch={false} className="inline-flex items-center rounded-lg border border-[#d7dbe0] bg-white px-4 py-2.5 text-sm font-semibold text-[#0f1419] hover:border-[#9aa3ad]">Apri a tutta pagina ↗</Link>
          <a href={DECK_URL} download="Gergo-pitch-deck.pdf" className="inline-flex items-center gap-2 rounded-lg bg-[#1d3fd6] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1733b0]">
            <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden><path d="M10 3v10m0 0l-4-4m4 4l4-4M4 16h12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Scarica il deck <span className="font-mono text-[11px] opacity-80">PDF</span>
          </a>
        </div>
      </div>

      <nav aria-label="Indice delle slide" className="mt-4 flex flex-wrap gap-1.5">
        {SLIDES.map((s, k) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setI(k)}
            aria-label={`Vai alla slide ${k + 1}: ${s.title}`}
            aria-current={k === i ? "true" : undefined}
            className={`h-2 rounded-full transition-all ${k === i ? "w-8 bg-[#1d3fd6]" : "w-2 bg-[#cbd2da] hover:bg-[#9aa3ad]"}`}
          />
        ))}
      </nav>
    </div>
  );
}
