"use client";
import type { LiveData } from "@/lib/live";

// Pendant virtuale: gli stessi intenti della voce (sposta, più piano, più veloce, stop) come pulsanti.
// Ogni pulsante crea un comando che va riletto e confermato, esattamente come a voce. Non è il pendant del
// controller: accensione, freni, allarmi, TCP e payload restano sul pendant vero.

// Dati del braccio in sala: sdk/ELITE_NOTES.md [verificato: foto etichetta e pendant].
export const MACHINE = { modello: "Elite CS63", seriale: "07262116710005", ip: "192.168.1.200", sbraccio_mm: 624, payload_kg: 3 };

type Act = (name: string, body?: Record<string, unknown>, domanda?: string) => Promise<void>;
const DIRS: { d: string; l: string; k: string }[] = [
  { d: "su", l: "Su", k: "↑ Z+" }, { d: "giu", l: "Giù", k: "↓ Z−" },
  { d: "avanti", l: "Avanti", k: "X+" }, { d: "indietro", l: "Indietro", k: "X−" },
  { d: "sinistra", l: "Sinistra", k: "Y+" }, { d: "destra", l: "Destra", k: "Y−" },
];

export function MachineBar({ live }: { live: LiveData }) {
  const s = live.safety;
  const elite = s.mode === "elite";
  const bridgeOk = s.bridge_heartbeat_ms_ago < 5000;
  return (
    <section className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-white/40">Stai parlando con</p>
        <p className="text-lg font-bold">{elite ? `${MACHINE.modello} · braccio reale` : `${MACHINE.modello} · simulatore della postazione`}</p>
      </div>
      <Item k="connessione" v={bridgeOk ? (elite ? `controller ${MACHINE.ip} via bridge` : "bridge in simulazione (SimArm)") : "bridge non collegato"} ok={bridgeOk} />
      <Item k="bridge" v="pavia-postazione-1" />
      <Item k="seriale" v={MACHINE.seriale} />
      <Item k="arresto acustico" v={s.guard_alive && s.guard_heartbeat_ms_ago < 5000 ? (s.mode === "sim" ? "attivo (simulato)" : "attivo") : "non attivo"} ok={s.guard_alive && s.guard_heartbeat_ms_ago < 5000} />
      <Item k="ontologia" v={`v${s.ontology_version}`} />
      <span className={`ml-auto rounded-full px-3 py-1 text-xs font-bold ${elite ? "bg-red-500/20 text-red-200" : "bg-sky-500/20 text-sky-200"}`}>{elite ? "MODALITÀ REALE" : "MODALITÀ SIMULAZIONE"}</span>
    </section>
  );
}

function Item({ k, v, ok }: { k: string; v: string; ok?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-white/40">{k}</p>
      <p className={`font-mono text-sm ${ok === undefined ? "text-white/85" : ok ? "text-emerald-300" : "text-red-300"}`}>{v}</p>
    </div>
  );
}

export function Pendant({ live, act, step, setStep }: { live: LiveData; act: Act; step: number; setStep: (n: number) => void }) {
  const s = live.safety;
  const tcp = live.tcp;
  return (
    <section className="rounded-xl border border-white/10 bg-gradient-to-b from-[#1a1f27] to-[#11151b] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white/50">Pendant virtuale</h2>
        <span className="font-mono text-[11px] text-white/40">frame utente · TCP</span>
      </div>
      <div className="grid grid-cols-3 gap-2 font-mono text-sm">
        {(["x", "y", "z"] as const).map((a, i) => (
          <div key={a} className="rounded bg-black/40 px-2 py-1.5"><span className="text-white/40">{a.toUpperCase()} </span>{tcp ? tcp[i].toFixed(1) : "—"}<span className="text-white/30"> mm</span></div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs">
        <span className="text-white/50">passo</span>
        {[10, 20, 50, 100].map((mm) => (
          <button key={mm} onClick={() => setStep(mm)} className={`rounded px-2 py-1 font-mono ${step === mm ? "bg-sky-500 text-black" : "bg-white/10"}`}>{mm / 10} cm</button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {DIRS.map((x) => (
          <button key={x.d} onClick={() => act("sposta", { direzione: x.d, quantita: step / 10, unita: "cm" })}
            className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-left hover:border-sky-400/50 hover:bg-sky-400/10">
            <span className="font-semibold">{x.l}</span><span className="font-mono text-[11px] text-white/40">{x.k}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button onClick={() => act("piu_piano")} className="flex-1 rounded-lg bg-white/10 py-2 text-sm">− più piano</button>
        <span className="w-20 text-center font-mono text-sm text-sky-300">{s.velocita_mm_s} mm/s</span>
        <button onClick={() => act("piu_veloce")} className="flex-1 rounded-lg bg-white/10 py-2 text-sm">+ più veloce</button>
      </div>
      <p className="mt-3 text-[11px] leading-snug text-white/40">
        Gli stessi comandi della voce: ogni pulsante prepara un comando, che va riletto e confermato con Sì. Massimo 10 cm per comando, dentro l&apos;area di lavoro. Accensione, freni e allarmi restano sul pendant vero.
      </p>
    </section>
  );
}
