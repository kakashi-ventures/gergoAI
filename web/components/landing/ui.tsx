import type { ReactNode } from "react";

export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0d10]";

export function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="border-t border-white/10 py-14 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">{eyebrow}</p>
        <h2 id={`${id}-title`} className="mt-3 text-2xl font-semibold leading-tight text-[#e6e8eb] sm:text-3xl">
          {title}
        </h2>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

export type Marker = "verificato" | "vendor" | "ipotesi" | "stima" | "misura";

const markerStyle: Record<Marker, { label: string; cls: string }> = {
  verificato: { label: "verificato", cls: "border-emerald-400/40 text-emerald-300" },
  vendor: { label: "dichiarato dal vendor", cls: "border-amber-400/40 text-amber-300" },
  ipotesi: { label: "ipotesi", cls: "border-fuchsia-400/40 text-fuchsia-300" },
  stima: { label: "stima", cls: "border-fuchsia-400/40 text-fuchsia-300" },
  misura: { label: "in misura oggi", cls: "border-sky-400/40 text-sky-300" },
};

export function Tag({ kind, source }: { kind: Marker; source?: string }) {
  const m = markerStyle[kind];
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none ${m.cls}`}
    >
      [{m.label}
      {source ? `: ${source}` : ""}]
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-white/10 bg-white/[0.03] p-5 ${className}`}>{children}</div>;
}
