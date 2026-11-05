import type { LiveData } from "@/lib/live";

// Tempo di ciclo per versione (da v_cycle_stats): il numero che dice se l'ottimizzazione ha funzionato.
export function CycleCompare({ cycles, big = false }: { cycles: LiveData["cycles"]; big?: boolean }) {
  const rows = cycles.filter((c) => c.cycles > 0 && c.avg_cycle_time_ms != null);
  const max = Math.max(1, ...rows.map((r) => r.avg_cycle_time_ms ?? 0));
  const byName = new Map<string, typeof rows>();
  for (const r of rows) byName.set(r.routine_name, [...(byName.get(r.routine_name) ?? []), r]);
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/50">Tempo di ciclo per versione</h2>
      {rows.length === 0 && <p className="text-sm text-white/40">Ancora nessun ciclo completo.</p>}
      {[...byName.entries()].map(([name, vs]) => {
        const first = vs[0].avg_cycle_time_ms!, last = vs[vs.length - 1].avg_cycle_time_ms!;
        const delta = vs.length > 1 ? Math.round(((last - first) / first) * 100) : null;
        return (
          <div key={name} className="mb-3 space-y-1.5">
            <p className={`font-semibold ${big ? "text-xl" : "text-sm"}`}>«{name}»
              {delta != null && <span className={`ml-2 ${delta < 0 ? "text-emerald-300" : "text-red-300"}`}>{delta > 0 ? "+" : ""}{delta}%</span>}</p>
            {vs.map((v) => (
              <div key={v.routine_version} className="flex items-center gap-2">
                <span className={`w-8 font-mono text-white/60 ${big ? "text-base" : "text-xs"}`}>v{v.routine_version}</span>
                <div className="h-5 flex-1 rounded bg-white/5">
                  <div className={`h-5 rounded ${v === vs[vs.length - 1] && vs.length > 1 ? "bg-emerald-400/70" : "bg-sky-400/50"}`} style={{ width: `${((v.avg_cycle_time_ms ?? 0) / max) * 100}%` }} />
                </div>
                <span className={`w-24 text-right font-mono ${big ? "text-lg" : "text-xs"}`}>{((v.avg_cycle_time_ms ?? 0) / 1000).toFixed(1)} s</span>
                <span className="w-14 text-right text-[11px] text-white/40">{v.cycles} cicli</span>
              </div>
            ))}
          </div>
        );
      })}
      <p className="text-[10px] text-white/30">Fonte: v_cycle_stats, eventi di fine ciclo. In simulazione finché non gira sul braccio.</p>
    </section>
  );
}
