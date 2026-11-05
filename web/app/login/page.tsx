export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; err?: string }> }) {
  const { next = "/console", err } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center">
      <form method="post" action="/api/login" className="w-72 space-y-3 rounded-lg border border-white/10 p-6">
        <h1 className="text-lg font-bold">Gergo · postazione</h1>
        <input type="hidden" name="next" value={next} />
        <input name="passphrase" type="password" autoFocus placeholder="passphrase" className="w-full rounded bg-white/10 px-3 py-2" />
        {err && <p className="text-sm text-red-400">Passphrase sbagliata.</p>}
        <button className="w-full rounded bg-sky-600 py-2 font-semibold">Entra</button>
      </form>
    </main>
  );
}
