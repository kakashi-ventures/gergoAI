import Link from "next/link";

// Ingresso alla demo: la console comanda il braccio (anche in sim scrive comandi veri), per questo è protetta.
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; err?: string }> }) {
  const { next = "/console", err } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0d10] px-4">
      <div className="w-full max-w-sm space-y-5">
        <Link href="/" className="text-sm text-[#9aa1a9] hover:text-white">← Torna alla presentazione</Link>
        <form method="post" action="/api/login" className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">Demo</p>
            <h1 className="mt-1 text-2xl font-semibold">Console della postazione</h1>
            <p className="mt-2 text-sm text-[#9aa1a9]">
              Da qui si parla al braccio, si approvano i movimenti e si legge il registro. Serve la passphrase della postazione.
            </p>
          </div>
          <input type="hidden" name="next" value={next} />
          <label className="block text-sm">
            <span className="text-[#9aa1a9]">Passphrase</span>
            <input name="passphrase" type="password" autoFocus required autoComplete="current-password"
              className="mt-1 w-full rounded-lg bg-white/10 px-3 py-2.5 outline-none focus:ring-2 focus:ring-sky-400" />
          </label>
          {err && <p className="text-sm text-red-400">Passphrase sbagliata.</p>}
          <button className="w-full rounded-lg bg-sky-400 py-2.5 font-semibold text-[#0b0d10] hover:bg-sky-300">Entra nella demo</button>
        </form>
      </div>
    </main>
  );
}
