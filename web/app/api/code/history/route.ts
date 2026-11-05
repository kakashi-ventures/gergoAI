// Storico delle modifiche agli script Python del braccio, letto dall'API pubblica di GitHub.
// Dati pubblici e in sola lettura (repo pubblico): la route non è dietro il middleware.
export const runtime = "nodejs";

const REPO = "kakashi-ventures/gergoAI";
const BRANCH = "main";
const DIRS = ["bridge", "sdk", "safety"] as const;
const DETAIL_LIMIT = 15;
const PATCH_MAX = 6000;

// File critici per la sicurezza (stessa lista di scripts/code-ledger.mjs).
const SAFETY_CRITICAL = [
  /^bridge\/(validator|motion|contracts|main)\.py$/,
  /^bridge\/adapters\//,
  /^sdk\/gergo_sdk\/(motion|kinematics|primary|dashboard|cs|rtsi)\.py$/,
  /^safety\/audio_guard\.py$/,
];

type HistoryFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string | null;
  truncated: boolean;
  safety_critical: boolean;
};

type HistoryCommit = {
  sha: string;
  short: string;
  date: string;
  author: string;
  message: string;
  url: string;
  files: HistoryFile[] | null;
  touches_safety: boolean;
};

type GhCommit = {
  sha: string;
  html_url: string;
  commit: { message: string; author?: { name?: string; date?: string }; committer?: { date?: string } };
  author?: { login?: string } | null;
  files?: { filename: string; status: string; additions: number; deletions: number; patch?: string }[];
};

class RateLimited extends Error {}

function isSafety(path: string) {
  return SAFETY_CRITICAL.some((r) => r.test(path));
}

function inScope(path: string) {
  return DIRS.some((d) => path.startsWith(d + "/"));
}

async function gh<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "gergo-code-ledger",
  };
  const url = `https://api.github.com${path}`;
  let res: Response;
  if (process.env.GITHUB_TOKEN) {
    res = await fetch(url, { headers: { ...headers, Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }, next: { revalidate: 300 } });
    // Token non valido: il repo è pubblico, riprova senza.
    if (res.status === 401) res = await fetch(url, { headers, next: { revalidate: 300 } });
  } else {
    res = await fetch(url, { headers, next: { revalidate: 300 } });
  }
  if (res.status === 429 || (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0")) {
    throw new RateLimited(`GitHub: limite di richieste raggiunto (${res.status})`);
  }
  if (!res.ok) throw new Error(`GitHub ${res.status} su ${path}`);
  return (await res.json()) as T;
}

export async function GET() {
  const base = { repo: REPO, branch: BRANCH, deployed_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null };
  try {
    const lists = await Promise.all(
      DIRS.map((d) => gh<GhCommit[]>(`/repos/${REPO}/commits?sha=${BRANCH}&path=${d}&per_page=30`)),
    );
    const bySha = new Map<string, GhCommit>();
    for (const c of lists.flat()) bySha.set(c.sha, c);
    const dateOf = (c: GhCommit) => c.commit.committer?.date ?? c.commit.author?.date ?? "";
    const sorted = [...bySha.values()].sort((a, b) => dateOf(b).localeCompare(dateOf(a)));

    let detailError: string | null = null;
    const details = new Map<string, GhCommit>();
    await Promise.all(
      sorted.slice(0, DETAIL_LIMIT).map(async (c) => {
        try {
          details.set(c.sha, await gh<GhCommit>(`/repos/${REPO}/commits/${c.sha}`));
        } catch (e) {
          detailError = e instanceof Error ? e.message : String(e);
        }
      }),
    );

    const commits: HistoryCommit[] = sorted.map((c) => {
      const d = details.get(c.sha);
      const files: HistoryFile[] | null = d?.files
        ? d.files
            .filter((f) => inScope(f.filename))
            .map((f) => ({
              filename: f.filename,
              status: f.status,
              additions: f.additions,
              deletions: f.deletions,
              patch: f.patch ? f.patch.slice(0, PATCH_MAX) : null,
              truncated: (f.patch?.length ?? 0) > PATCH_MAX,
              safety_critical: isSafety(f.filename),
            }))
        : null;
      return {
        sha: c.sha,
        short: c.sha.slice(0, 7),
        date: dateOf(c),
        author: c.commit.author?.name ?? c.author?.login ?? "?",
        message: c.commit.message,
        url: c.html_url,
        files,
        touches_safety: files ? files.some((f) => f.safety_critical) : false,
      };
    });

    return Response.json({ ok: true, ...base, detail_error: detailError, commits });
  } catch (e) {
    const rate_limited = e instanceof RateLimited;
    return Response.json(
      { ok: false, ...base, error: e instanceof Error ? e.message : String(e), rate_limited, commits: [] },
      { status: rate_limited ? 200 : 502 },
    );
  }
}
