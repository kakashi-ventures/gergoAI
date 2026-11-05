"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Barra "Indietro" comune alle pagine secondarie: torna alla pagina precedente, o a `fallback` se si è entrati da un link.
export function BackBar({ fallback = "/console", label = "Postazione" }: { fallback?: string; label?: string }) {
  const router = useRouter();
  return (
    <div className="sticky top-0 z-40 flex items-center gap-3 border-b border-white/10 bg-[#0b0d10]/95 px-4 py-2.5 backdrop-blur">
      <button
        onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm hover:bg-white/5"
      >
        <span aria-hidden>←</span> Indietro
      </button>
      <Link href={fallback} className="text-sm text-white/60 hover:text-white">{label}</Link>
      <Link href="/" className="ml-auto text-sm text-white/40 hover:text-white">Gergo</Link>
    </div>
  );
}
