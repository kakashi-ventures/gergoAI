"use client";
// Come parla col braccio: la catena voce → Grok → comando → bridge → gergo_sdk → byte sul controller CS.
// Gli esempi NON sono scritti a mano: li produce web/scripts/protocol-trace.py facendo girare il codice Python vero
// (validator, EliteCsAdapter, gergo_sdk) contro il mock del controller, che registra cosa arriva sui socket.
import Link from "next/link";
import { useState } from "react";
import traceJson from "@/lib/generated/protocol-trace.json";
import { OFFICIAL_COMMIT, OFFICIAL_REPO, SDK_MAP, VOCE_CAMBIA, VOCE_NON_CAMBIA, type Stato } from "@/lib/protocol-map";

const REPO_URL = "https://github.com/kakashi-ventures/gergoAI/blob/main";

type Example = {
  frase: string;
  tool_call: { name: string; arguments: Record<string, unknown> };
  command: { skill: string; params: Record<string, unknown> };
  readback: string | null;
  pose_iniziale_mm: number[];
  validator: { ok: boolean; code: string | null; reason: string | null };
  motion_check?: { delta_mm: number[]; target_mm: number[]; geofence_ok: boolean; velocita_mm_s: number };
  kinematics?: { ok: boolean; reason: string | null };
  esito?: { ok: boolean; error: string | null; duration_ms?: number; error_mm?: number | null; task?: string | null; note?: string };
  wire: { dashboard_29999: string[]; dashboard_letture: string[]; primary_30001: string[] };
};
type Trace = { generated_at: string; source_commit: string | null; dirty: boolean; elite_tasks: { verified: boolean; tasks: Record<string, string> }; examples: Example[] };
const trace = traceJson as unknown as Trace;

const title = "text-xs font-semibold uppercase tracking-wider text-white/50";
const card = "rounded-xl border border-white/10 bg-white/[0.03] p-4";
const code = "font-mono text-xs";

const CHAIN: { n: string; titolo: string; testo: string; file: string }[] = [
  { n: "1", titolo: "Voce → tool call", testo: "Grok Voice (grok-voice-3.0) ascolta e chiama un tool. I parametri sono solo enum e un numero: direzione, quantità, luogo. Mai coordinate.", file: "web/lib/voice/tools.ts" },
  { n: "2", titolo: "Tool call → comando", testo: "La route valida (zod + validatore), scrive una riga in commands con status queued e una rilettura scritta dal codice, che Grok ripete parola per parola.", file: "web/lib/server/tools.ts" },
  { n: "3", titolo: "\"Sì\" → confermato", testo: "Solo il tool conferma mette confirmed_at. Senza conferma il bridge non lo esegue; dopo 30 s il comando scade.", file: "bridge/validator.py" },
  { n: "4", titolo: "Bridge → doppio controllo", testo: "Il bridge rivalida tutto in locale: skill e ontologia confermate, geofence, utensile, guardia acustica viva. Per sposta anche la cinematica sulla linea retta.", file: "bridge/main.py" },
  { n: "5", titolo: "Adapter → gergo_sdk", testo: "Le primitive diventano task sulla Dashboard (29999). Gli spostamenti diventano un solo movel sulla Primary (30001), costruito dal codice e controllato con una regex.", file: "bridge/adapters/elite.py" },
  { n: "6", titolo: "Controller → registro", testo: "Posa e giunti tornano da RTSI (30004), stato e safety dalla Dashboard. Il bridge scrive step_end con esito e durata nel registro.", file: "sdk/gergo_sdk/cs.py" },
];

const STATO_STYLE: Record<Stato, string> = {
  usato: "bg-emerald-500/15 text-emerald-300",
  riscritto: "bg-sky-500/15 text-sky-300",
  parziale: "bg-amber-500/15 text-amber-300",
  escluso: "bg-rose-500/15 text-rose-300",
  "non usato": "bg-white/10 text-white/60",
};

function Json({ v }: { v: unknown }) {
  return <pre className={`${code} whitespace-pre-wrap break-all text-white/80`}>{JSON.stringify(v, null, 2)}</pre>;
}

function Wire({ e }: { e: Example }) {
  const { dashboard_29999: dash, primary_30001: prim, dashboard_letture: reads } = e.wire;
  if (!dash.length && !prim.length) {
    return <p className="text-sm text-white/60">Nessun byte inviato al controller per questo comando.</p>;
  }
  return (
    <div className="space-y-3">
      {dash.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-white/50">Dashboard · TCP 29999 · testo, una riga per comando</p>
          <pre className={`${code} rounded bg-black/40 p-3 text-emerald-200`}>{dash.map((l) => `> ${l}`).join("\n")}</pre>
        </div>
      )}
      {prim.map((s, i) => (
        <div key={i}>
          <p className="mb-1 text-xs text-white/50">Primary · TCP 30001 · script CS (metri, radianti, m/s)</p>
          <pre className={`${code} rounded bg-black/40 p-3 text-emerald-200`}>{s.replace(/\t/g, "    ")}</pre>
        </div>
      ))}
      {reads.length > 0 && (
        <p className="text-xs text-white/50">
          Letture di controllo nel frattempo: {reads.map((r) => <code key={r} className="mr-2 text-white/70">{r}</code>)}
        </p>
      )}
    </div>
  );
}

function Esito({ e }: { e: Example }) {
  if (!e.validator.ok) return <span className="text-rose-300">Rifiutato dal validatore: {e.validator.reason}</span>;
  if (e.kinematics && !e.kinematics.ok) return <span className="text-rose-300">Rifiutato dalla cinematica: {e.kinematics.reason}</span>;
  if (!e.esito) return null;
  if (!e.esito.ok) return <span className="text-amber-300">Non eseguito: {e.esito.error}</span>;
  const bits = [
    e.esito.task && `task ${e.esito.task}`,
    e.esito.duration_ms != null && `${e.esito.duration_ms} ms`,
    e.esito.error_mm != null && `errore finale ${e.esito.error_mm} mm`,
    e.esito.note,
  ].filter(Boolean);
  return <span className="text-emerald-300">Eseguito sul mock{bits.length ? ` · ${bits.join(" · ")}` : ""}</span>;
}

export function Protocollo() {
  const [sel, setSel] = useState(0);
  const e = trace.examples[sel];

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Come parla col braccio · dalla voce allo script CS</h1>
          <p className="mt-1 max-w-3xl text-sm text-white/60">
            Ogni frase passa dagli stessi sei passaggi. Il modello sceglie solo il tool e i suoi parametri a enum: il
            testo che arriva al controller lo scrive il codice, ed è sempre lo stesso per lo stesso comando.
          </p>
        </div>
        <nav className="flex gap-3 text-sm">
          <Link href="/console" className="text-sky-300 underline">console</Link>
          <Link href="/console/codice" className="text-sky-300 underline">registro del codice</Link>
        </nav>
      </header>

      <section className="space-y-3">
        <h2 className={title}>La catena</h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CHAIN.map((c) => (
            <li key={c.n} className={card}>
              <p className="text-sm font-semibold"><span className="mr-2 text-white/40">{c.n}</span>{c.titolo}</p>
              <p className="mt-1 text-sm text-white/70">{c.testo}</p>
              <a href={`${REPO_URL}/${c.file}`} target="_blank" rel="noreferrer" className={`${code} mt-2 inline-block text-sky-300/80 underline`}>{c.file}</a>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className={title}>Prova un comando · eseguito dal codice vero contro il mock CS</h2>
        <div className="flex flex-wrap gap-2">
          {trace.examples.map((x, i) => (
            <button key={x.frase} onClick={() => setSel(i)}
              className={`rounded-full border px-3 py-1 text-sm ${i === sel ? "border-sky-400 bg-sky-400/15 text-sky-100" : "border-white/15 text-white/70 hover:border-white/30"}`}>
              “{x.frase}”
            </button>
          ))}
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className={`${card} space-y-3`}>
            <div>
              <p className="mb-1 text-xs text-white/50">1 · Tool call di Grok (l&apos;unico pezzo deciso dal modello)</p>
              <Json v={{ name: e.tool_call.name, arguments: e.tool_call.arguments }} />
            </div>
            <div>
              <p className="mb-1 text-xs text-white/50">2 · Riga in commands</p>
              <Json v={e.command} />
            </div>
            {e.readback && (
              <div>
                <p className="mb-1 text-xs text-white/50">Rilettura scritta dal codice, ripetuta da Grok</p>
                <p className="text-sm italic text-white/90">“{e.readback}”</p>
              </div>
            )}
            {e.motion_check && (
              <div>
                <p className="mb-1 text-xs text-white/50">4 · Controllo del bridge (mm, frame utente)</p>
                <table className={`${code} text-white/80`}>
                  <tbody>
                    <tr><td className="pr-3 text-white/50">partenza</td><td>[{e.pose_iniziale_mm.join(", ")}]</td></tr>
                    <tr><td className="pr-3 text-white/50">delta</td><td>[{e.motion_check.delta_mm.join(", ")}]</td></tr>
                    <tr><td className="pr-3 text-white/50">arrivo</td><td>[{e.motion_check.target_mm.join(", ")}]</td></tr>
                    <tr><td className="pr-3 text-white/50">geofence</td><td>{e.motion_check.geofence_ok ? "dentro" : "fuori"}</td></tr>
                    <tr><td className="pr-3 text-white/50">cinematica</td><td>{e.kinematics?.ok ? "ok" : e.kinematics?.reason ?? "—"}</td></tr>
                    <tr><td className="pr-3 text-white/50">velocità</td><td>{e.motion_check.velocita_mm_s} mm/s</td></tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className={`${card} space-y-3`}>
            <p className="text-xs text-white/50">5 · Byte arrivati al controller (registrati dal mock)</p>
            <Wire e={e} />
            <p className="text-sm"><Esito e={e} /></p>
          </div>
        </div>
        <p className="text-xs text-white/40">
          Generato il {trace.generated_at.replace("T", " ").slice(0, 16)} UTC dal commit {trace.source_commit ?? "?"}
          {trace.dirty ? " (con modifiche locali)" : ""} con <code>web/scripts/protocol-trace.py</code>. Posa di partenza
          al centro dell&apos;area di lavoro; il mock usa la cinematica nominale di un CS66, non del CS63 in sala.
          Frame, area di lavoro e nomi dei task sono ancora i valori di default
          {trace.elite_tasks.verified ? "" : " non verificati"}: si tarano al primo slot sul braccio.
        </p>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className={card}>
          <h2 className={`${title} mb-3`}>Cosa cambia a voce</h2>
          <ul className="space-y-2 text-sm">
            {VOCE_CAMBIA.map((x) => (
              <li key={x.cosa}><p className="text-white/90">{x.cosa}</p><p className="text-xs text-white/50">{x.dove}</p></li>
            ))}
          </ul>
        </div>
        <div className={card}>
          <h2 className={`${title} mb-3`}>Cosa la voce non cambia mai</h2>
          <ul className="space-y-2 text-sm">
            {VOCE_NON_CAMBIA.map((x) => (
              <li key={x.cosa}><p className="text-white/90">{x.cosa}</p><p className="text-xs text-white/50">{x.perche}</p></li>
            ))}
          </ul>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className={title}>SDK ufficiale Elite CS ↔ gergo_sdk · {SDK_MAP.length} funzioni</h2>
        <p className="max-w-3xl text-sm text-white/60">
          L&apos;SDK Python ufficiale (<a href={OFFICIAL_REPO} target="_blank" rel="noreferrer" className="text-sky-300 underline">Elite_Robots_CS_SDK_Python</a> @ {OFFICIAL_COMMIT})
          è un binding dell&apos;SDK C++ e va compilato. gergo_sdk riscrive in Python puro solo i messaggi che servono, e
          tutto ciò che non è in whitelist non parte nemmeno dal nostro PC.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-white/50">
              <tr><th className="py-2 pr-3">Funzione ufficiale</th><th className="pr-3">Porta</th><th className="pr-3">Da noi</th><th>Perché</th></tr>
            </thead>
            <tbody>
              {SDK_MAP.map((r) => (
                <tr key={r.ufficiale} className="border-t border-white/5 align-top">
                  <td className="py-2 pr-3"><code className={`${code} text-white/90`}>{r.ufficiale}</code><p className="text-xs text-white/40">{r.fonte}</p></td>
                  <td className={`${code} pr-3 text-white/70`}>{r.porta}</td>
                  <td className="pr-3">
                    <span className={`rounded px-2 py-0.5 text-xs ${STATO_STYLE[r.stato]}`}>{r.stato}</span>
                    {r.nostro && <p className={`${code} mt-1 text-white/60`}>{r.nostro}</p>}
                  </td>
                  <td className="py-2 text-white/70">{r.perche}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
