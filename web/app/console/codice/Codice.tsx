"use client";
// Registro del codice: impronte e parametri di sicurezza letti dai file Python (lib/generated/code-ledger.json,
// prodotto da scripts/code-ledger.mjs) + storico delle modifiche da GitHub (/api/code/history).
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ledgerJson from "@/lib/generated/code-ledger.json";

const REPO_URL = "https://github.com/kakashi-ventures/gergoAI";

type LastCommit = { sha: string; date: string; author: string; subject: string } | null;
type LedgerFile = { path: string; bytes: number; lines: number; sha256: string; test: boolean; safety_critical: boolean; last_commit: LastCommit };
type Param = { name: string; value: string; source_comment?: string | null; file: string; line: number; category: string; note: string };
type Ledger = { generated_at: string | null; source_commit: string | null; unavailable?: boolean; files: LedgerFile[]; params: Param[]; missing: { name: string; file: string; reason: string }[] };

type HFile = { filename: string; status: string; additions: number; deletions: number; patch: string | null; truncated: boolean; safety_critical: boolean };
type HCommit = { sha: string; short: string; date: string; author: string; message: string; url: string; files: HFile[] | null; touches_safety: boolean };
type History = { ok: boolean; repo?: string; branch?: string; deployed_sha: string | null; commits: HCommit[]; error?: string; rate_limited?: boolean; detail_error?: string | null };

const ledger = ledgerJson as unknown as Ledger;
const CATEGORIES = ["movimento", "velocità", "conferma", "whitelist", "cinematica", "arresto acustico", "altro"];

const panel = "rounded-lg border border-white/10 bg-white/[0.03] p-4";
const title = "text-xs font-semibold uppercase tracking-wider text-white/50";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
}

function Toggle({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-white/70">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="accent-sky-400" />
      {label}
    </label>
  );
}

function Patch({ text }: { text: string }) {
  return (
    <pre className="max-h-80 overflow-auto rounded bg-black/40 p-2 font-mono text-[11px] leading-snug">
      {text.split("\n").map((l, i) => (
        <div
          key={i}
          className={
            l.startsWith("+") ? "text-emerald-300 bg-emerald-500/10" : l.startsWith("-") ? "text-red-300 bg-red-500/10" : l.startsWith("@@") ? "text-sky-300/80" : "text-white/60"
          }
        >
          {l || " "}
        </div>
      ))}
    </pre>
  );
}

function CommitCard({ c }: { c: HCommit }) {
  const [open, setOpen] = useState(false);
  const first = c.message.split("\n")[0];
  return (
    <li className="rounded-md border border-white/10 bg-black/20 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <a href={c.url} target="_blank" rel="noreferrer" className="font-mono text-sky-300 hover:underline">{c.short}</a>
        <span className="text-white/50">{fmtDate(c.date)}</span>
        <span className="text-white/50">· {c.author}</span>
        {c.touches_safety && (
          <span className="rounded border border-amber-400/40 bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-300">tocca la sicurezza</span>
        )}
      </div>
      <p className="mt-1 text-sm text-white/90">{first}</p>
      {c.files === null ? (
        <p className="mt-1 text-xs text-white/40">dettaglio file non caricato (solo i 15 commit più recenti)</p>
      ) : (
        <>
          <button onClick={() => setOpen(!open)} className="mt-2 text-xs text-sky-300 hover:underline">
            {open ? "nascondi" : "mostra"} {c.files.length} file modificati
          </button>
          {open && (
            <div className="mt-2 space-y-3">
              {c.files.map((f) => (
                <div key={f.filename}>
                  <div className="mb-1 flex flex-wrap items-center gap-2 font-mono text-xs">
                    <a href={`${REPO_URL}/blob/${c.sha}/${f.filename}`} target="_blank" rel="noreferrer" className={f.safety_critical ? "text-amber-300 hover:underline" : "text-white/80 hover:underline"}>
                      {f.filename}
                    </a>
                    <span className="text-white/40">{f.status}</span>
                    <span className="text-emerald-400">+{f.additions}</span>
                    <span className="text-red-400">−{f.deletions}</span>
                    {f.truncated && <span className="text-white/40">(diff troncato)</span>}
                  </div>
                  {f.patch ? <Patch text={f.patch} /> : <p className="text-xs text-white/40">nessun diff testuale</p>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </li>
  );
}

export function Codice() {
  const [history, setHistory] = useState<History | null>(null);
  const [bridgeSha, setBridgeSha] = useState<string | null | "n/d">(null);
  const [filesSafety, setFilesSafety] = useState(false);
  const [commitsSafety, setCommitsSafety] = useState(false);

  useEffect(() => {
    fetch("/api/code/history")
      .then((r) => r.json() as Promise<History>)
      .then(setHistory)
      .catch((e) => setHistory({ ok: false, deployed_sha: null, commits: [], error: String(e) }));
  }, []);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return setBridgeSha("n/d");
    const sb = createClient(url, key, { auth: { persistSession: false } });
    sb.from("bridge_status")
      .select("code_sha")
      .limit(1)
      .then(({ data, error }) => {
        const v = !error && data?.[0] ? (data[0] as { code_sha?: string | null }).code_sha : null;
        setBridgeSha(v || "n/d");
      });
  }, []);

  const deployed = history?.deployed_sha ?? ledger.source_commit;
  const ref = ledger.source_commit ?? deployed ?? "main";

  const grouped = useMemo(() => {
    const g = new Map<string, Param[]>();
    for (const c of CATEGORIES) g.set(c, []);
    for (const p of ledger.params) (g.get(p.category) ?? g.get("altro")!).push(p);
    return [...g.entries()].filter(([, v]) => v.length);
  }, []);

  const files = ledger.files.filter((f) => !filesSafety || f.safety_critical);
  const commits = (history?.commits ?? []).filter((c) => !commitsSafety || c.touches_safety);

  // Ripiego: senza storico GitHub, mostra l'ultimo commit per file dal JSON.
  const fallback = useMemo(() => {
    const m = new Map<string, { c: NonNullable<LastCommit>; files: string[] }>();
    for (const f of ledger.files) {
      if (!f.last_commit) continue;
      const e = m.get(f.last_commit.sha) ?? { c: f.last_commit, files: [] };
      e.files.push(f.path);
      m.set(f.last_commit.sha, e);
    }
    return [...m.values()].sort((a, b) => b.c.date.localeCompare(a.c.date));
  }, []);

  function download() {
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), repo: "kakashi-ventures/gergoAI", bridge_code_sha: bridgeSha === "n/d" ? null : bridgeSha, ledger, history }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `registro-codice-${(ref ?? "x").slice(0, 7)}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <main className="min-h-screen bg-[#0b0d10] px-4 py-6 text-white">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Registro del codice · script Python del braccio</h1>
            <p className="text-sm text-white/60">Tutto ciò che è qui è letto dal codice: file, riga e commit. Niente è scritto a mano.</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={download} className="rounded border border-sky-400/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-500/20">
              scarica registro (JSON)
            </button>
            <Link href="/console" className="text-xs text-white/60 hover:text-white">← console</Link>
          </div>
        </header>

        <section className={panel}>
          <h2 className={title}>Versione in uso</h2>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-6">
            <dt className="text-white/50">Commit pubblicato</dt>
            <dd className="font-mono">
              {deployed ? <a href={`${REPO_URL}/commit/${deployed}`} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">{deployed}</a> : "—"}
            </dd>
            {ledger.source_commit && history?.deployed_sha && ledger.source_commit !== history.deployed_sha && (
              <>
                <dt className="text-white/50">Registro generato da</dt>
                <dd className="font-mono text-amber-300">{ledger.source_commit}</dd>
              </>
            )}
            <dt className="text-white/50">Registro generato il</dt>
            <dd>{fmtDate(ledger.generated_at)}{ledger.unavailable && <span className="ml-2 text-amber-300">(sorgenti non disponibili al build)</span>}</dd>
            <dt className="text-white/50">Codice sul bridge</dt>
            <dd>
              {bridgeSha === null ? (
                <span className="text-white/40">…</span>
              ) : bridgeSha === "n/d" ? (
                <span className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-white/60">il bridge non dichiara ancora la versione che esegue</span>
              ) : (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{bridgeSha}</span>
                  {deployed && (bridgeSha === deployed || deployed.startsWith(bridgeSha) || bridgeSha.startsWith(deployed)) ? (
                    <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">coincide</span>
                  ) : (
                    <span className="rounded bg-red-500/20 px-2 py-0.5 text-xs font-semibold text-red-300">DIVERSA</span>
                  )}
                </span>
              )}
            </dd>
          </dl>
        </section>

        <section className={panel}>
          <h2 className={title}>Parametri di sicurezza letti dal codice · {ledger.params.length}</h2>
          {ledger.missing.length > 0 && (
            <p className="mt-2 text-xs text-red-300">Non trovati nel codice: {ledger.missing.map((m) => `${m.name} (${m.file})`).join(", ")}</p>
          )}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-white/40">
                <tr><th className="py-1 pr-3 font-normal">Nome</th><th className="py-1 pr-3 font-normal">Valore</th><th className="py-1 pr-3 font-normal">File:riga</th><th className="py-1 font-normal">Nota</th></tr>
              </thead>
              {grouped.map(([cat, ps]) => (
                <tbody key={cat}>
                  <tr><td colSpan={4} className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-sky-300/80">{cat}</td></tr>
                  {ps.map((p) => (
                    <tr key={p.file + p.name} className="border-t border-white/5 align-top">
                      <td className="py-1.5 pr-3 font-mono text-xs text-white/90">{p.name}</td>
                      <td className="py-1.5 pr-3">
                        <pre className="max-h-32 max-w-md overflow-auto whitespace-pre-wrap font-mono text-xs text-emerald-200">{p.value}</pre>
                        {p.source_comment && <div className="font-mono text-[11px] text-white/40"># {p.source_comment}</div>}
                      </td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        <a href={`${REPO_URL}/blob/${ref}/${p.file}#L${p.line}`} target="_blank" rel="noreferrer" className="font-mono text-xs text-sky-300 hover:underline">{p.file}:{p.line}</a>
                      </td>
                      <td className="py-1.5 text-xs text-white/70">{p.note}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </section>

        <section className={panel}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={title}>Impronte dei file · {files.length}</h2>
            <Toggle on={filesSafety} set={setFilesSafety} label="solo sicurezza" />
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-white/40">
                <tr><th className="py-1 pr-3 font-normal">File</th><th className="py-1 pr-3 font-normal">sha256</th><th className="py-1 pr-3 font-normal">Righe</th><th className="py-1 font-normal">Ultimo commit</th></tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.path} className={`border-t border-white/5 ${f.test ? "opacity-45" : ""}`}>
                    <td className="py-1.5 pr-3 font-mono text-xs">
                      <a href={`${REPO_URL}/blob/${ref}/${f.path}`} target="_blank" rel="noreferrer" className={f.safety_critical ? "text-amber-300 hover:underline" : "text-white/80 hover:underline"}>{f.path}</a>
                      {f.test && <span className="ml-2 text-[10px] text-white/50">test</span>}
                    </td>
                    <td className="py-1.5 pr-3 font-mono text-xs text-white/70" title={f.sha256}>{f.sha256.slice(0, 12)}</td>
                    <td className="py-1.5 pr-3 text-xs text-white/70">{f.lines}</td>
                    <td className="py-1.5 text-xs text-white/60">
                      {f.last_commit ? (
                        <>
                          <a href={`${REPO_URL}/commit/${f.last_commit.sha}`} target="_blank" rel="noreferrer" className="font-mono text-sky-300 hover:underline">{f.last_commit.sha.slice(0, 7)}</a>{" "}
                          {f.last_commit.subject.slice(0, 80)} · {fmtDate(f.last_commit.date)} · {f.last_commit.author}
                        </>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={panel}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={title}>Modifiche{history?.ok ? ` · ${commits.length}` : ""}</h2>
            <Toggle on={commitsSafety} set={setCommitsSafety} label="solo modifiche alla sicurezza" />
          </div>
          {!history ? (
            <p className="mt-3 text-sm text-white/40">Carico lo storico da GitHub…</p>
          ) : history.ok ? (
            <>
              {history.detail_error && <p className="mt-2 text-xs text-amber-300">Alcuni dettagli non caricati: {history.detail_error}</p>}
              <ul className="mt-3 space-y-2">{commits.map((c) => <CommitCard key={c.sha} c={c} />)}</ul>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm text-amber-300">
                {history.rate_limited ? "GitHub ha limitato le richieste: riprova tra qualche minuto." : `Storico GitHub non disponibile: ${history.error}`} Sotto, l&apos;ultimo commit per file registrato al build.
              </p>
              <ul className="mt-3 space-y-2">
                {fallback
                  .filter((e) => !commitsSafety || e.files.some((p) => ledger.files.find((f) => f.path === p)?.safety_critical))
                  .map((e) => (
                    <li key={e.c.sha} className="rounded-md border border-white/10 bg-black/20 p-3 text-xs">
                      <a href={`${REPO_URL}/commit/${e.c.sha}`} target="_blank" rel="noreferrer" className="font-mono text-sky-300 hover:underline">{e.c.sha.slice(0, 7)}</a>
                      <span className="ml-2 text-white/50">{fmtDate(e.c.date)} · {e.c.author}</span>
                      <p className="mt-1 text-sm text-white/90">{e.c.subject}</p>
                      <p className="mt-1 font-mono text-white/50">{e.files.join(", ")}</p>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
