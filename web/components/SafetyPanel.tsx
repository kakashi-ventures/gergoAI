import type { SafetyState } from "@/lib/mock";
import { Dot, Panel } from "./Panel";

// Pannello sicurezza sempre visibile. Nomenclatura: "arresto vocale e acustico", mai "e-stop vocale".
export function SafetyPanel({ s }: { s: SafetyState }) {
  const guardOk = s.guard_alive && s.guard_heartbeat_ms_ago < 1000;
  const bridgeOk = s.bridge_heartbeat_ms_ago < 5000;
  return (
    <Panel title="Sicurezza · arresto vocale e acustico">
      <ul className="space-y-2 text-sm">
        <li className="flex items-center gap-2">
          <Dot ok={guardOk} /> audio_guard {guardOk ? "vivo" : "MORTO — movimenti bloccati"}
          <span className="ml-auto font-mono text-xs text-white/50">{s.guard_heartbeat_ms_ago} ms fa</span>
        </li>
        <li className="flex items-center gap-2">
          <Dot ok={bridgeOk} /> bridge
          <span className="ml-auto font-mono text-xs text-white/50">{(s.bridge_heartbeat_ms_ago / 1000).toFixed(1)} s fa</span>
        </li>
        <li className="flex items-center gap-2 text-white/80">
          ultimo trigger:
          {s.last_trigger ? (
            <span className="ml-auto font-mono text-xs">
              {s.last_trigger.trigger} · {s.last_trigger.latency_ms} ms · {new Date(s.last_trigger.ts).toLocaleTimeString("it-IT")}
            </span>
          ) : (
            <span className="ml-auto text-xs text-white/40">nessuno</span>
          )}
        </li>
      </ul>
      <p className="mt-3 text-[11px] leading-snug text-white/40">
        Stop software rapido, in più rispetto all&apos;e-stop fisico (dello staff) e alla rilevazione di collisione del controller.
      </p>
    </Panel>
  );
}
