// /api/health — cantiere FONDAMENTA (CANTIERI.md). Nessuna dipendenza oltre a Next: parla con PostgREST via fetch.
// Riporta: presenza delle env (MAI i valori), ping a Supabase, età dell'ultimo heartbeat del bridge
// (bridge_status.ts) e di audio_guard (guard_status.last_heartbeat_at se la tabella esiste, altrimenti
// bridge_status.guard_alive). HTTP 503 solo se mancano env obbligatorie o Supabase non risponde:
// un bridge spento in quel momento è "degraded", non un guasto del deploy.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "XAI_API_KEY",
  "CONSOLE_PASSPHRASE",
  "BRIDGE_ID",
] as const;
const OPTIONAL_ENV = ["XAI_VOICE_MODEL", "XAI_EVAL_MODEL"] as const;
const SECRET_ENV = ["SUPABASE_SERVICE_ROLE_KEY", "XAI_API_KEY", "CONSOLE_PASSPHRASE"];

const BRIDGE_STALE_MS = 5_000; // console: heartbeat < 5 s = verde (DEPLOY.md prompt 2)
const GUARD_STALE_MS = 1_000; // MOTION_SAFETY.md §3: il bridge rifiuta i movimenti se manca da > 1 s

type Probe<T> = { ok: true; data: T; ms: number } | { ok: false; error: string; status?: number; ms: number };

async function rest<T>(path: string): Promise<Probe<T>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const t0 = Date.now();
  if (!url || !key) return { ok: false, error: "env Supabase mancanti", ms: 0 };
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    const ms = Date.now() - t0;
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, status: res.status, error: body.slice(0, 200), ms };
    }
    return { ok: true, data: (await res.json()) as T, ms };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 };
  }
}

function ageMs(ts: unknown): number | null {
  if (typeof ts !== "string") return null;
  const t = Date.parse(ts);
  return Number.isNaN(t) ? null : Date.now() - t;
}

const isMissingTable = (p: Probe<unknown>) =>
  !p.ok && (p.status === 404 || /PGRST205|does not exist|Could not find the table/i.test(p.error));

export async function GET() {
  const env: Record<string, boolean> = {};
  for (const k of [...REQUIRED_ENV, ...OPTIONAL_ENV]) env[k] = Boolean(process.env[k]);
  const missing = REQUIRED_ENV.filter((k) => !env[k]);
  const leakedPublic = Object.keys(process.env).filter(
    (k) => k.startsWith("NEXT_PUBLIC_") && SECRET_ENV.some((s) => k.includes(s)),
  );

  // Ping: la root di PostgREST risponde anche a DB vuoto.
  const ping = await rest<unknown>("");

  const bridgeId = process.env.BRIDGE_ID ?? "";
  const bridgeQ = bridgeId
    ? `bridge_status?bridge_id=eq.${encodeURIComponent(bridgeId)}&select=*&limit=1`
    : "bridge_status?select=*&order=last_heartbeat_at.desc.nullslast&limit=1";
  const bridge = await rest<Record<string, unknown>[]>(bridgeQ);
  const guard = await rest<Record<string, unknown>[]>(
    "guard_status?select=*&order=last_heartbeat_at.desc.nullslast&limit=1",
  );

  const bRow = bridge.ok ? bridge.data[0] : undefined;
  const bAge = ageMs(bRow?.ts ?? bRow?.last_heartbeat_at ?? bRow?.updated_at);
  const gRow = guard.ok ? guard.data[0] : undefined;
  const gAge = ageMs(gRow?.last_heartbeat_at ?? gRow?.ts);

  const bridgeState = {
    table: bridge.ok ? "ok" : isMissingTable(bridge) ? "missing" : "error",
    found: Boolean(bRow),
    mode: (bRow?.mode as string | undefined) ?? null,
    heartbeat_age_ms: bAge,
    alive: bAge !== null && bAge < BRIDGE_STALE_MS,
  };
  const guardState = guard.ok
    ? { source: "guard_status", heartbeat_age_ms: gAge, alive: gAge !== null && gAge < GUARD_STALE_MS }
    : {
        source: isMissingTable(guard) ? "bridge_status.guard_alive" : "error",
        heartbeat_age_ms: null,
        alive: bridgeState.alive && bRow?.guard_alive === true,
      };

  const critical = missing.length > 0 || !ping.ok || leakedPublic.length > 0;
  const status = critical ? "down" : bridgeState.alive && guardState.alive ? "ok" : "degraded";

  return Response.json(
    {
      status,
      ts: new Date().toISOString(),
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      env: { present: env, missing, secret_with_public_prefix: leakedPublic },
      supabase: ping.ok ? { ok: true, latency_ms: ping.ms } : { ok: false, error: ping.error, latency_ms: ping.ms },
      bridge: bridgeState,
      audio_guard: guardState,
    },
    { status: critical ? 503 : 200, headers: { "cache-control": "no-store" } },
  );
}
