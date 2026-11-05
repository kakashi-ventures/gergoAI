import { KVA_URL } from "./links";

// Paternità del progetto: compare in landing, nel deck, nel dossier di mercato e nel README.
export const CREDITS = {
  authors: "Federico Bottino e Alberto Trivero",
  tools: "Grok, Claude, GPT e Inkling",
  method: "metodologia KVA",
};

export function Credits({ tone = "light" }: { tone?: "light" | "dark" }) {
  const dark = tone === "dark";
  return (
    <div className={`grid gap-6 rounded-2xl border p-7 sm:grid-cols-3 ${dark ? "border-white/10 bg-white/5 text-white" : "border-[#e3e6ea] bg-white text-[#0f1419]"}`}>
      <div>
        <p className={`font-mono text-[11px] uppercase tracking-[0.18em] ${dark ? "text-white/50" : "text-[#6b7280]"}`}>Un&apos;idea di</p>
        <p className="mt-2 text-lg font-semibold">{CREDITS.authors}</p>
      </div>
      <div>
        <p className={`font-mono text-[11px] uppercase tracking-[0.18em] ${dark ? "text-white/50" : "text-[#6b7280]"}`}>Sviluppato con</p>
        <p className="mt-2 text-lg font-semibold">{CREDITS.tools}</p>
      </div>
      <div>
        <p className={`font-mono text-[11px] uppercase tracking-[0.18em] ${dark ? "text-white/50" : "text-[#6b7280]"}`}>Venture sviluppata con</p>
        <p className="mt-2 text-lg font-semibold">
          <a href={KVA_URL} target="_blank" rel="noopener noreferrer" className={`underline decoration-2 underline-offset-4 ${dark ? "decoration-[#ff9a4d] hover:text-[#ff9a4d]" : "decoration-[#1d3fd6] hover:text-[#1d3fd6]"}`}>
            metodologia KVA
          </a>
        </p>
        <p className={`mt-1 text-sm ${dark ? "text-white/60" : "text-[#6b7280]"}`}>Kakashi Venture Accelerator</p>
      </div>
    </div>
  );
}

/** Riga compatta per footer e ultima slide. */
export function CreditsLine({ className = "" }: { className?: string }) {
  return (
    <p className={className}>
      Un&apos;idea di {CREDITS.authors} · Sviluppato con {CREDITS.tools} · Venture sviluppata con{" "}
      <a href={KVA_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[#1d3fd6]">metodologia KVA</a>{" "}
      (Kakashi Venture Accelerator)
    </p>
  );
}
