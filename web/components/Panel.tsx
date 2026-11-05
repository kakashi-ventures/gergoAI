export function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-white/10 bg-white/[0.03] p-4 ${className}`}>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/50">{title}</h2>
      {children}
    </section>
  );
}

export function Dot({ ok }: { ok: boolean }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-400" : "bg-red-500 animate-pulse"}`} />;
}
