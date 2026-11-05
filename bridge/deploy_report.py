"""Report di deploy della sessione di produzione (DEPLOY.md prompt 1 punto 6).

    python -m bridge.deploy_report --since "2026-11-05T12:00" --out reports/ [--vercel-url URL]
                                   [--memory-fixture path.json] [--narrate] [--tz Europe/Rome]

Ogni numero viene SOLO da git, Vercel (URL passato o env) e dalle righe di Supabase (o di una fixture JSON), e porta
la query che lo ha prodotto (appendice). Le tabelle di CONSOLE possono non esistere ancora: la sezione diventa
"non disponibile", il report non si ferma. `--narrate` chiede a Grok 3 frasi sui numeri già calcolati, in un box
marcato "testo generato": Grok non calcola nulla.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from statistics import median
from typing import Any, Optional
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
# colonna temporale per il filtro --since; None = tabella di stato, letta per intero
TIME_COL = {"commands": "created_at", "events": "ts", "routines": "created_at", "routine_runs": "created_at",
            "proposals": "created_at", "bindings": "created_at", "observations": "created_at",
            "ontology_versions": None, "skills": None, "bridge_status": None, "guard_status": None}


class SourceError(Exception):
    pass


class ReportSource:
    name = "?"

    def rows(self, table: str, since: Optional[str]) -> list[dict]:
        raise NotImplementedError


def _parse_ts(s: Any) -> Optional[datetime]:
    if not s:
        return None
    d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


class FixtureSource(ReportSource):
    """File JSON {tabella: [righe]}; una tabella assente si comporta come una tabella che non esiste."""

    def __init__(self, path: str | Path):
        self.name = f"fixture {path}"
        self.data = json.loads(Path(path).read_text())

    def rows(self, table, since):
        if table not in self.data:
            raise SourceError(f"tabella {table} assente nella fixture")
        col, lim = TIME_COL.get(table, "created_at"), _parse_ts(since)
        out = self.data[table]
        if col and lim:
            out = [r for r in out if (_parse_ts(r.get(col)) or lim) >= lim]
        return out


class SupabaseSource(ReportSource):
    """PostgREST via urllib, come bridge/store.py SupabaseStore._req; pagina da 1000 righe."""

    def __init__(self, url: Optional[str] = None, key: Optional[str] = None, timeout: float = 10.0):
        self.url = (url or os.environ["SUPABASE_URL"]).rstrip("/") + "/rest/v1"
        self.key = key or os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        self.timeout, self.name = timeout, "supabase"

    def _req(self, path: str) -> Any:
        headers = {"apikey": self.key, "Authorization": f"Bearer {self.key}", "Content-Type": "application/json"}
        req = urllib.request.Request(self.url + path, method="GET", headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                raw = r.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            raise SourceError(f"supabase GET {path}: {e.code} {e.read()[:200]!r}") from None
        except (urllib.error.URLError, OSError) as e:
            raise SourceError(f"supabase GET {path}: {e}") from None

    def rows(self, table, since):
        col, out, off = TIME_COL.get(table, "created_at"), [], 0
        flt = f"&{col}=gte.{urllib.parse.quote(since)}" if col and since else ""
        while True:
            page = self._req(f"/{table}?select=*{flt}&limit=1000&offset={off}") or []
            out += page
            if len(page) < 1000:
                return out
            off += 1000


class Report:
    def __init__(self):
        self.sections: dict[str, dict] = {}
        self.queries: dict[str, str] = {}

    def num(self, section: str, key: str, value: Any, query: str) -> None:
        qid = next((k for k, q in self.queries.items() if q == query), None)
        if qid is None:
            qid = f"Q{len(self.queries) + 1}"
            self.queries[qid] = query
        self.sections.setdefault(section, {})[key] = {"valore": value, "query": qid}

    def unavailable(self, section: str, why: str) -> None:
        self.sections[section] = {"non_disponibile": why}


def _git(*args: str) -> Optional[str]:
    try:
        return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
    except Exception:
        return None


def _med(xs: list) -> Optional[float]:
    xs = [x for x in xs if isinstance(x, (int, float))]
    return median(xs) if xs else None


def _count_by(rows: list[dict], key) -> dict:
    out: dict = {}
    for r in rows:
        k = key(r)
        out[k] = out.get(k, 0) + 1
    return dict(sorted(out.items(), key=lambda kv: str(kv[0])))


def known_limits(path: Path = ROOT / "HACK.md") -> str:
    text, out, inside = path.read_text(), [], False
    for line in text.splitlines():
        if line.startswith("## "):
            if inside:
                break
            inside = line.startswith("## Limiti noti")
            continue
        if inside:
            out.append(line)
    return "\n".join(out).strip()


def build(src: ReportSource, since: str, vercel_url: Optional[str] = None, eval_dir: Path = ROOT / "eval" / "results",
          git: bool = True) -> dict:
    r, missing, cache = Report(), {}, {}

    def get(table: str) -> Optional[list[dict]]:
        if table not in cache:
            try:
                cache[table] = src.rows(table, since)
            except Exception as e:  # una tabella mancante non ferma il report
                cache[table], missing[table] = None, str(e)[:200]
        return cache[table]

    # build
    if git:
        r.num("build", "commit", _git("rev-parse", "HEAD"), "git rev-parse HEAD")
        r.num("build", "branch", _git("rev-parse", "--abbrev-ref", "HEAD"), "git rev-parse --abbrev-ref HEAD")
        r.num("build", "tag", _git("describe", "--tags", "--always"), "git describe --tags --always")
        n = _git("rev-list", "--count", f"--since={since}", "HEAD")
        r.num("build", "commit della sessione", int(n) if n and n.isdigit() else None,
              f"git rev-list --count --since={since} HEAD")
    url = vercel_url or os.environ.get("VERCEL_DEPLOY_URL")
    r.num("build", "URL produzione", url, "--vercel-url oppure env VERCEL_DEPLOY_URL")

    # ontologia
    ov, sk = get("ontology_versions"), get("skills")
    if ov is None or sk is None:
        r.unavailable("ontologia", "tabelle ontology_versions/skills non disponibili")
    else:
        last = max(ov, key=lambda v: v.get("version", 0)) if ov else {}
        v = last.get("version")
        r.num("ontologia", "versione attiva", v, "ontology_versions order by version desc limit 1")
        r.num("ontologia", "stato", last.get("status"), "ontology_versions.status della versione attiva")
        r.num("ontologia", "confermata da / il", [last.get("confirmed_by"), last.get("confirmed_at")],
              "ontology_versions.confirmed_by, confirmed_at della versione attiva")
        cur = [s for s in sk if s.get("ontology_version") == v]
        for st in ("confirmed", "deprecated"):
            rows = sorted((s for s in cur if s.get("status") == st), key=lambda s: s.get("name", ""))
            det = [{"skill": s.get("name"), "chi": s.get("confirmed_by"), "quando": s.get("confirmed_at" if st ==
                    "confirmed" else "updated_at"), **({"motivo": s.get("deprecated_reason")} if st == "deprecated"
                    else {})} for s in rows]
            r.num("ontologia", f"skill {st}", det, f"skills where ontology_version=attiva and status='{st}'")
        for flag in ("sim_ok", "real_ok"):
            r.num("ontologia", f"skill {flag}", sorted(s.get("name") for s in cur if s.get(flag)),
                  f"skills where ontology_version=attiva and {flag}")

    # comandi e sicurezza
    cmds, evs = get("commands"), get("events")
    if cmds is None:
        r.unavailable("comandi", "tabella commands non disponibile")
    else:
        r.num("comandi", "totale", len(cmds), "commands where created_at >= since")
        r.num("comandi", "per stato", _count_by(cmds, lambda c: c.get("status")),
              "commands where created_at >= since group by status")
    if evs is None:
        r.unavailable("sicurezza", "tabella events non disponibile")
        r.unavailable("cicli", "tabella events non disponibile")
    else:
        by_type = lambda t: [e for e in evs if e.get("type") == t]  # noqa: E731
        pl = lambda e: e.get("payload") or {}  # noqa: E731
        anomalies = by_type("anomaly")
        if cmds is not None:
            cmap = {c.get("id"): c for c in cmds}
            starts = by_type("step_start")
            r.num("sicurezza", "comandi eseguiti senza conferma (deve essere 0)",
                  sum(1 for e in starts if e.get("command_id") in cmap and not cmap[e["command_id"]].get("confirmed_at")),
                  "events where type='step_start' join commands on command_id where confirmed_at is null")
            r.num("sicurezza", "step_start con command fuori finestra o assente",
                  sum(1 for e in starts if e.get("command_id") not in cmap),
                  "events where type='step_start' and command_id not in commands where created_at >= since")
        rej = [e for e in anomalies if pl(e).get("kind") in ("validator_reject", "kinematics_reject")]
        r.num("sicurezza", "rifiuti del validatore", len(rej),
              "events where type='anomaly' and payload.kind in ('validator_reject','kinematics_reject')")
        r.num("sicurezza", "rifiuti per codice", _count_by(rej, lambda e: pl(e).get("code")),
              "events where type='anomaly' and payload.kind in ('validator_reject','kinematics_reject') group by payload.code")
        r.num("sicurezza", "movimenti rifiutati dalla geofence", sum(1 for e in anomalies if pl(e).get("code") == "geofence"),
              "events where type='anomaly' and payload.code='geofence'")
        r.num("sicurezza", "stop", len(by_type("stop")), "events where type='stop'")
        trig = by_type("safety_trigger")
        tri = {t: {"conteggio": n, "latenza_mediana_ms": _med([pl(e).get("latency_ms") for e in trig
                                                              if pl(e).get("trigger") == t])}
               for t, n in _count_by(trig, lambda e: pl(e).get("trigger")).items()}
        r.num("sicurezza", "arresto vocale e acustico: trigger per tipo", tri,
              "events where type='safety_trigger' group by payload.trigger: count, median(payload.latency_ms)")
        mc = by_type("motion_check")
        r.num("sicurezza", "motion_check ok", sum(1 for e in mc if pl(e).get("ok")),
              "events where type='motion_check' and payload.ok")
        r.num("sicurezza", "motion_check rifiutati", sum(1 for e in mc if not pl(e).get("ok")),
              "events where type='motion_check' and not payload.ok")

        ends = by_type("step_end")
        r.num("cicli", "step_end", len(ends), "events where type='step_end'")
        r.num("cicli", "step_end ok", sum(1 for e in ends if pl(e).get("ok")), "events where type='step_end' and payload.ok")
        r.num("cicli", "durata mediana per skill (ms)",
              {s: _med([pl(e).get("duration_ms") for e in ends if pl(e).get("skill") == s])
               for s in _count_by(ends, lambda e: pl(e).get("skill"))},
              "events where type='step_end' group by payload.skill: median(payload.duration_ms)")
        runs = get("routine_runs")
        if runs is not None:
            rmap = {x.get("id"): x for x in runs}
            key = lambda e: "{} v{}".format(rmap[e["routine_run_id"]].get("routine_id"),  # noqa: E731
                                            rmap[e["routine_run_id"]].get("routine_version",
                                                                          rmap[e["routine_run_id"]].get("version")))
            linked = [e for e in ends if e.get("routine_run_id") in rmap]
            r.num("cicli", "durata mediana per routine e versione (ms)",
                  {k: _med([pl(e).get("duration_ms") for e in linked if key(e) == k]) for k in _count_by(linked, key)},
                  "events where type='step_end' join routine_runs on routine_run_id group by routine_id, version: "
                  "median(payload.duration_ms)")

    # routine e memoria (tabelle di CONSOLE)
    for sec, tables in (("routine", ("routines", "routine_runs")), ("memoria", ("proposals", "bindings", "observations"))):
        for t in tables:
            rows = get(t)
            if rows is None:
                r.num(sec, t, "non disponibile", f"{t} where created_at >= since (errore: vedi non_disponibili)")
                continue
            r.num(sec, f"{t}: totale", len(rows), f"{t} where created_at >= since")
            if any("status" in x for x in rows):
                r.num(sec, f"{t}: per stato", _count_by(rows, lambda x: x.get("status")),
                      f"{t} where created_at >= since group by status")
            if t == "bindings" and any("regime" in x for x in rows):
                r.num(sec, "bindings CANONICAL", sum(1 for x in rows if x.get("regime") == "CANONICAL"),
                      "bindings where created_at >= since and regime='CANONICAL'")

    # eval
    files = sorted(eval_dir.glob("*.json")) if eval_dir.is_dir() else []
    if not files:
        r.unavailable("eval", f"nessun file in {eval_dir.relative_to(ROOT) if eval_dir.is_relative_to(ROOT) else eval_dir}")
    for f in files:
        try:
            r.num("eval", f.stem, json.loads(f.read_text()), f"contenuto di eval/results/{f.name}")
        except Exception as e:
            r.num("eval", f.stem, f"illeggibile: {e}", f"contenuto di eval/results/{f.name}")

    return {"generato_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "since": since,
            "fonte": src.name, "sezioni": r.sections, "non_disponibili": missing, "query": r.queries,
            "limiti_noti": known_limits()}


def narrate(numbers: dict) -> str:
    key = os.environ.get("XAI_API_KEY")
    if not key:
        return "XAI_API_KEY assente: sintesi non generata."
    body = {"model": os.environ.get("XAI_MODEL", "grok-4"), "messages": [
        {"role": "system", "content": "Scrivi in italiano esattamente 3 frasi di sintesi di questo report di deploy. "
         "Usa solo i numeri forniti, non calcolarne di nuovi. Lo stop software si chiama 'arresto vocale e acustico'."},
        {"role": "user", "content": json.dumps(numbers["sezioni"], ensure_ascii=False)}]}
    req = urllib.request.Request("https://api.x.ai/v1/chat/completions", data=json.dumps(body).encode(), method="POST",
                                 headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read())["choices"][0]["message"]["content"].strip()
    except Exception as e:
        return f"sintesi non generata: {e}"


def _fmt(v: Any) -> str:
    if isinstance(v, (dict, list)):
        return "`" + json.dumps(v, ensure_ascii=False) + "`"
    return "—" if v is None else str(v)


def render_md(rep: dict) -> str:
    out = [f"# Report di deploy — {rep['generato_at']}", "",
           f"Finestra: dal `{rep['since']}` · fonte dati: {rep['fonte']}. Ogni numero rimanda alla sua query "
           "(appendice).", ""]
    for sec, items in rep["sezioni"].items():
        out += [f"## {sec.capitalize()}", ""]
        if "non_disponibile" in items:
            out += [f"_Non disponibile: {items['non_disponibile']}._", ""]
            continue
        out += ["| Voce | Valore | Query |", "|---|---|---|"]
        out += [f"| {k} | {_fmt(v['valore'])} | {v['query']} |" for k, v in items.items()] + [""]
    if rep["non_disponibili"]:
        out += ["## Tabelle non disponibili", ""] + [f"- `{t}`: {e}" for t, e in rep["non_disponibili"].items()] + [""]
    if "narrazione" in rep:
        out += ["## Sintesi", "", "> **testo generato** (Grok, sui numeri sopra; non calcola nulla)", ">",
                *[f"> {line}" for line in rep["narrazione"].splitlines()], ""]
    out += ["## Limiti noti", "", rep["limiti_noti"], "", "## Appendice: query", ""]
    out += [f"- **{q}**: `{text}`" for q, text in rep["query"].items()]
    return "\n".join(out) + "\n"


def normalize_since(since: str, tz: str) -> str:
    d = datetime.fromisoformat(since)
    if d.tzinfo is None:
        d = d.replace(tzinfo=ZoneInfo(tz))
    return d.isoformat()


def write(rep: dict, out_dir: str | Path) -> tuple[Path, Path]:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    stamp = rep["generato_at"].replace(":", "").replace("-", "").replace("+0000", "Z")
    md, js = out / f"deploy-{stamp}.md", out / f"deploy-{stamp}.json"
    md.write_text(render_md(rep))
    js.write_text(json.dumps(rep, ensure_ascii=False, indent=2) + "\n")
    return md, js


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Report di deploy: numeri solo da git, Vercel e Supabase.")
    ap.add_argument("--since", required=True, help="inizio sessione, ISO; senza fuso vale --tz")
    ap.add_argument("--out", default="reports/")
    ap.add_argument("--vercel-url")
    ap.add_argument("--memory-fixture", help="JSON {tabella: [righe]} al posto di Supabase")
    ap.add_argument("--narrate", action="store_true", help="3 frasi di Grok in un box 'testo generato'")
    ap.add_argument("--tz", default="Europe/Rome")
    a = ap.parse_args(argv)
    since = normalize_since(a.since, a.tz)
    if not a.memory_fixture and not (os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_ROLE_KEY")):
        ap.error("servono SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY, oppure --memory-fixture")
    src = FixtureSource(a.memory_fixture) if a.memory_fixture else SupabaseSource()
    rep = build(src, since, a.vercel_url)
    if a.narrate:
        rep["narrazione"] = narrate(rep)
    md, js = write(rep, a.out)
    print(f"report: {md}\n        {js}")
    if rep["non_disponibili"]:
        print("non disponibili: " + ", ".join(rep["non_disponibili"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
