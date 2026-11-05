#!/usr/bin/env python3
"""Gergo · eval P5: check set del linguaggio, condizioni A/B/C.

    python eval/run.py --split test --conditions A,B,C [--model $XAI_EVAL_MODEL] [--dry-run]

A  regole a parole chiave (regex in italiano) → skill + params
B  Grok (xAI, chat completions OpenAI-compatibili) con tool a enum, senza memoria
C  come B, più eval/memory_fixture.json nel prompt di sistema

Il modello propone soltanto. Tutto il resto lo fa il codice: validazione dei params (contracts-v1),
conversione dell'intento "sposta" in Δmm (MOTION_SAFETY.md §2.1), clamp, geofence, rilettura e gate di
conferma. Solo stdlib (urllib).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import statistics
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

EVAL_DIR = Path(__file__).resolve().parent
REPO = EVAL_DIR.parent
SHARED = REPO / "shared"

XAI_URL = "https://api.x.ai/v1/chat/completions"

# ── Ontologia (contracts-v1, shared/schemas). Se /shared c'è, i test controllano che coincidano. ──────────
PLACES = ["INGRESSO", "STAZIONE", "USCITA", "SCARTI", "HOME"]
DIREZIONI = ["su", "giu", "avanti", "indietro", "destra", "sinistra"]
UNITA = ["mm", "cm"]
INTENSITA = ["poco", "un_po", "tanto"]
PLACE_SKILLS = ["solleva", "deposita", "porta"]
NOPARAM_SKILLS = ["applica", "home", "stop", "piu_piano", "piu_veloce"]
COMMAND_SKILLS = PLACE_SKILLS + NOPARAM_SKILLS + ["sposta"]  # = SkillName di Command.json
# esegui_routine non è uno SkillName di Command: nel sistema diventa un routine_run (PLAN §4) con
# conferma unica all'inizio. Nell'eval è un intento proposto come gli altri.
EVAL_SKILLS = COMMAND_SKILLS + ["esegui_routine"]
# Skill che muovono il braccio → passano dal gate di conferma. stop no (arresto, mai trattenuto);
# piu_piano / piu_veloce cambiano uno stato di sessione, non muovono.
MOTION_SKILLS = {"solleva", "deposita", "porta", "applica", "home", "sposta", "esegui_routine"}

# MOTION_SAFETY.md §2.1
INTENSITA_MM = {"poco": 10.0, "un_po": 20.0, "tanto": 50.0}
DEFAULT_MM = 20.0
CLAMP_MM = 100.0
SPEED_DEFAULT, SPEED_MIN, SPEED_MAX = 50.0, 10.0, 100.0


# ── Caricamento ─────────────────────────────────────────────────────────────────────────────────────
def load_checkset(path: Path = EVAL_DIR / "checkset.jsonl", split: str | None = None) -> list[dict]:
    rows = [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]
    return [r for r in rows if split in (None, "all") or r["split"] == split]


def load_memory(path: Path = EVAL_DIR / "memory_fixture.json") -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def load_workspace() -> dict:
    """Box da shared/fixtures/workspace.json (BRACCIO) se esiste, altrimenti il segnaposto in eval/.
    Assi direzione→vettore da shared/fixtures/frame.json se esiste, altrimenti dal segnaposto."""
    default = json.loads((EVAL_DIR / "default_workspace.json").read_text(encoding="utf-8"))
    ws_path = SHARED / "fixtures" / "workspace.json"
    ws, source = default, "eval/default_workspace.json (SEGNAPOSTO)"
    if ws_path.exists():
        raw = json.loads(ws_path.read_text(encoding="utf-8"))
        ws, source = raw.get("data", raw), str(ws_path.relative_to(REPO))
    axes, axes_source = default["axes"], "eval/default_workspace.json (SEGNAPOSTO)"
    fr_path = SHARED / "fixtures" / "frame.json"
    if fr_path.exists():
        raw = json.loads(fr_path.read_text(encoding="utf-8"))
        raw = raw.get("data", raw)
        cand = raw.get("axes", raw)
        if all(isinstance(cand.get(d), list) and len(cand[d]) == 3 for d in DIREZIONI):
            axes, axes_source = cand, str(fr_path.relative_to(REPO))
    return {"frame": ws.get("frame", 0), "min_mm": [float(v) for v in ws["min_mm"]],
            "max_mm": [float(v) for v in ws["max_mm"]], "axes": axes,
            "source": source, "axes_source": axes_source}


# ── Validazione params (regole di shared/contracts.md, replicate qui) ───────────────────────────────
def validate_intent(skill: str, params: dict) -> str | None:
    """None se valido, altrimenti il motivo."""
    if skill not in EVAL_SKILLS:
        return f"skill ignota: {skill}"
    if not isinstance(params, dict):
        return "params non è un oggetto"
    if skill in PLACE_SKILLS:
        if set(params) != {"place"} or params["place"] not in PLACES:
            return "serve {place} con un luogo dell'ontologia"
        return None
    if skill in NOPARAM_SKILLS:
        return None if not params else f"{skill} non accetta params"
    if skill == "esegui_routine":
        return None if set(params) == {"name"} and isinstance(params["name"], str) and params["name"] else \
            "serve {name}"
    # sposta
    extra = set(params) - {"direzione", "quantita", "unita", "intensita"}
    if extra:
        return f"campi non ammessi (mai coordinate): {sorted(extra)}"
    if params.get("direzione") not in DIREZIONI:
        return "direzione mancante o ignota"
    q, u, i = params.get("quantita"), params.get("unita"), params.get("intensita")
    if q is not None and (isinstance(q, bool) or not isinstance(q, (int, float)) or not 0 < q <= 1000):
        return "quantita deve essere un numero in (0, 1000]"
    if u is not None and u not in UNITA:
        return "unita ignota"
    if i is not None and i not in INTENSITA:
        return "intensita ignota"
    if (q is None) != (u is None):
        return "quantita e unita: entrambe o nessuna"
    if q is not None and i is not None:
        return "quantita e intensita sono alternative"
    return None


def normalize_params(skill: str, params: dict | None) -> dict:
    params = dict(params or {})
    if skill == "sposta":
        out = {k: params.get(k) for k in ("direzione", "quantita", "unita", "intensita")}
        if isinstance(out["quantita"], (int, float)) and not isinstance(out["quantita"], bool):
            out["quantita"] = float(out["quantita"])
        out.update({k: v for k, v in params.items() if k not in out})  # tiene i campi extra: li boccia validate
        return out
    return params


# ── Movimento relativo (MOTION_SAFETY.md §2) ─────────────────────────────────────────────────────────
def intent_to_mm(params: dict) -> tuple[float, bool]:
    """Ritorna (modulo in mm dopo il clamp, clamped?)."""
    q, u, i = params.get("quantita"), params.get("unita"), params.get("intensita")
    if q is not None:
        mm = float(q) * (10.0 if u == "cm" else 1.0)
    elif i is not None:
        mm = INTENSITA_MM[i]
    else:
        mm = DEFAULT_MM
    return (min(mm, CLAMP_MM), mm > CLAMP_MM)


def delta_vector(params: dict, axes: dict) -> tuple[list[float], float, bool]:
    mm, clamped = intent_to_mm(params)
    return [mm * a for a in axes[params["direzione"]]], mm, clamped


def outside_by_mm(target: list[float], ws: dict) -> float:
    """Di quanto il target esce dal box (0 se dentro), massimo sugli assi."""
    out = 0.0
    for t, lo, hi in zip(target, ws["min_mm"], ws["max_mm"]):
        out = max(out, lo - t, t - hi)
    return out


def start_pose(ws: dict, case: dict | None = None) -> list[float]:
    lo, hi = ws["min_mm"], ws["max_mm"]
    pose = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2] + 150.0]
    edge = (case or {}).get("start_near_edge")
    if edge:
        axis = ws["axes"][edge["direzione"]]
        k = next(j for j, a in enumerate(axis) if a)
        bound = hi[k] if axis[k] > 0 else lo[k]
        pose[k] = bound - axis[k] * edge["margin_mm"]
    return pose


def mm_to_words(mm: float) -> str:
    if mm >= 10 and mm % 10 == 0:
        n = int(mm // 10)
        return f"{n} centimetr{'o' if n == 1 else 'i'}"
    return f"{mm:g} millimetri"


VERBI = {"su": "Salgo", "giu": "Scendo", "avanti": "Vado avanti", "indietro": "Vado indietro",
         "destra": "Vado a destra", "sinistra": "Vado a sinistra"}


def readback(skill: str, params: dict, mm: float | None, speed: float) -> str:
    """La rilettura la scrive il codice, mai il modello (CANTIERI · CONSOLE punto 3)."""
    if skill == "sposta":
        return f"{VERBI[params['direzione']]} di {mm_to_words(mm)} a {speed:g} millimetri al secondo. Confermi?"
    if skill in PLACE_SKILLS:
        return f"{skill.capitalize()} in {params['place']}. Confermi?"
    if skill == "esegui_routine":
        return f"Eseguo la routine {params['name']}. Confermi?"
    return f"{skill.capitalize()}. Confermi?"


# ── Pipeline deterministica: proposta del modello → validatore → conferma → esecuzione (simulata) ────
def run_pipeline(proposal: dict | None, case: dict, ws: dict, memory: dict | None,
                 operator_confirms: bool = True) -> dict:
    """proposal = {"skill", "params"} oppure None (il modello ha chiesto o non ha capito).

    Lo stato è quello che conterebbe il bridge: un Command nasce "queued"; passa a "confirmed" con
    confirmed_at solo dopo il "sì" dell'operatore; solo un Command confermato viene eseguito ("done").
    operator_confirms simula il "sì" alla rilettura.
    """
    state: dict = {"status": "clarification", "command": None, "readback": None, "motion_check": None,
                   "velocita_mm_s": SPEED_DEFAULT, "executed": False, "events": []}
    if proposal is None:
        return state
    skill, params = proposal["skill"], normalize_params(proposal["skill"], proposal.get("params"))
    err = validate_intent(skill, params)
    if err is None and skill == "esegui_routine":
        known = {r["name"] for r in (memory or {}).get("routines", []) if r.get("status", "active") == "active"}
        if params["name"] not in known:
            err = f"routine sconosciuta: {params['name']}"
    if err:
        state.update(status="rejected_invalid", reason=err)
        return state

    cmd = {"id": f"eval-{case['id']}", "skill": skill, "params": params, "status": "queued", "confirmed_at": None}
    state["command"] = cmd

    if skill == "stop":  # l'arresto non aspetta conferme: non è un movimento
        cmd["status"] = "done"
        state.update(status="stopped", executed=True)
        state["events"].append({"type": "stop"})
        return state
    if skill in ("piu_piano", "piu_veloce"):
        v = state["velocita_mm_s"]
        v = max(SPEED_MIN, v * 0.5) if skill == "piu_piano" else min(SPEED_MAX, v * 1.5)
        state["velocita_mm_s"] = v
        cmd["status"] = "done"
        state.update(status="speed_changed", executed=True)
        state["events"].append({"type": "speed_change", "payload": {"velocita_mm_s": v}})
        return state

    mm = None
    if skill == "sposta":
        delta, mm, clamped = delta_vector(params, ws["axes"])
        pose = start_pose(ws, case)
        target = [p + d for p, d in zip(pose, delta)]
        fuori = outside_by_mm(target, ws)
        mc = {"command_id": cmd["id"], "delta_mm": delta, "pose_mm": pose, "target_mm": target,
              "clamped": clamped, "geofence_ok": fuori <= 0, "fuori_di_mm": round(fuori, 1) if fuori > 0 else None,
              "velocita_mm_s": state["velocita_mm_s"], "ok": fuori <= 0}
        if fuori > 0:
            mc["reason"] = f"arriverei fuori dall'area di lavoro di {fuori / 10:g} cm"
        state["motion_check"] = mc
        state["events"].append({"type": "motion_check", "payload": mc})
        if fuori > 0:
            cmd["status"] = "cancelled"
            state.update(status="rejected_geofence", readback=mc["reason"])
            return state

    cmd["readback"] = readback(skill, params, mm, state["velocita_mm_s"])
    state.update(status="awaiting_confirmation", readback=cmd["readback"])
    if operator_confirms:
        state["events"].append({"type": "confirmation", "payload": {"text": "sì"}})
        cmd["status"] = "confirmed"
        cmd["confirmed_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
    if cmd["status"] == "confirmed":  # il bridge esegue solo command confermati
        cmd["status"] = "done"
        state.update(status="executed", executed=True)
    return state


def executed_without_confirmation(state: dict) -> bool:
    cmd = state.get("command")
    return bool(state.get("executed") and cmd and cmd["skill"] in MOTION_SKILLS and not cmd.get("confirmed_at"))


def geofence_violation_accepted(state: dict, ws: dict) -> bool:
    """Ricalcola il target dai dati del command, senza fidarsi di geofence_ok."""
    cmd = state.get("command")
    if not cmd or cmd["skill"] != "sposta" or state["status"] not in ("awaiting_confirmation", "executed"):
        return False
    mc = state["motion_check"] or {}
    target = mc.get("target_mm")
    if target is None:
        return True  # un movimento accettato senza controllo è una violazione
    return outside_by_mm(target, ws) > 0


# ── Condizione A: regole a parole chiave ─────────────────────────────────────────────────────────────
PLACE_RX = [
    (r"\bingress[oi]\b", "INGRESSO"), (r"\bstazion[ei]\b", "STAZIONE"), (r"\buscit[ae]\b", "USCITA"),
    (r"\bscart[io]\b", "SCARTI"), (r"\bhome\b|\bcasa\b|\briposo\b", "HOME"),
]
DIR_RX = [
    (r"\bscendi\b|\bgi[uù]\b|\babbassa", "giu"), (r"\bsali\b|\bsu\b|\balza\b", "su"),
    (r"\bavanti\b", "avanti"), (r"\bindietro\b", "indietro"),
    (r"\bdestra\b", "destra"), (r"\bsinistra\b", "sinistra"),
]


def _norm(text: str) -> str:
    t = text.lower().replace("’", "'")
    return re.sub(r"\s+", " ", t).strip()


def rules_parse(text: str) -> dict | None:
    t = _norm(text)
    if re.search(r"\b(stop|fermo|fermati|ferma|alt|basta)\b", t):
        return {"skill": "stop", "params": {}}
    if re.search(r"pi[uù] piano|rallenta|pi[uù] lento", t):
        return {"skill": "piu_piano", "params": {}}
    if re.search(r"pi[uù] veloce|accelera|pi[uù] rapido", t):
        return {"skill": "piu_veloce", "params": {}}
    m = re.search(r"\b(?:routine|esegui)\s+(?:la\s+|il\s+)?(?:routine\s+)?(\w+)", t)
    if m:
        return {"skill": "esegui_routine", "params": {"name": m.group(1)}}
    if re.search(r"\b(home|torna a casa|torna in home|a casa)\b", t):
        return {"skill": "home", "params": {}}

    direzione = next((d for rx, d in DIR_RX if re.search(rx, t)), None)
    if direzione or re.search(r"\bspost", t):
        if not direzione:
            return None
        params = {"direzione": direzione, "quantita": None, "unita": None, "intensita": None}
        q = re.search(r"(\d+(?:[.,]\d+)?)\s*(cm|centimetr[oi]|mm|millimetr[oi])\b", t)
        if q:
            params["quantita"] = float(q.group(1).replace(",", "."))
            params["unita"] = "cm" if q.group(2).startswith("c") else "mm"
        elif re.search(r"\bun po'|\bun poco\b", t):
            params["intensita"] = "un_po"
        elif re.search(r"\bpochino\b|\bpoco\b|\bleggermente\b", t):
            params["intensita"] = "poco"
        elif re.search(r"\bmolto\b|\btanto\b", t):
            params["intensita"] = "tanto"
        return {"skill": "sposta", "params": params}

    place = next((p for rx, p in PLACE_RX if re.search(rx, t)), None)
    for rx, skill in [(r"\b(solleva|prendi|raccogli)", "solleva"), (r"\b(deposita|posa|appoggia|mett)", "deposita"),
                      (r"\bport", "porta")]:
        if re.search(rx, t):
            return {"skill": skill, "params": {"place": place}} if place else None
    if re.search(r"\b(applica|premi|pressa)", t):
        return {"skill": "applica", "params": {}}
    return None


# ── Condizioni B e C: Grok ───────────────────────────────────────────────────────────────────────────
def tool_definitions() -> list[dict]:
    def fn(name, desc, props=None, required=None):
        return {"type": "function", "function": {
            "name": name, "description": desc,
            "parameters": {"type": "object", "properties": props or {}, "required": required or [],
                           "additionalProperties": False}}}
    place = {"place": {"type": "string", "enum": PLACES, "description": "luogo della postazione"}}
    return [
        fn("solleva", "Solleva il vassoio dal luogo indicato.", place, ["place"]),
        fn("deposita", "Deposita il vassoio nel luogo indicato.", place, ["place"]),
        fn("porta", "Porta il vassoio al luogo indicato.", place, ["place"]),
        fn("applica", "Pressione di applicazione dell'etichetta in STAZIONE."),
        fn("home", "Torna alla posizione HOME."),
        fn("stop", "Ferma subito il braccio."),
        fn("piu_piano", "Riduce la velocità dei movimenti relativi."),
        fn("piu_veloce", "Aumenta la velocità dei movimenti relativi."),
        fn("sposta", "Spostamento relativo breve del braccio. Mai coordinate: solo direzione e quantità detta "
                     "dall'operatore, oppure un'intensità.", {
            "direzione": {"type": "string", "enum": DIREZIONI},
            "quantita": {"type": ["number", "null"], "description": "solo se l'operatore dice un numero"},
            "unita": {"type": ["string", "null"], "enum": UNITA + [None]},
            "intensita": {"type": ["string", "null"], "enum": INTENSITA + [None],
                          "description": "'un po'' = un_po, 'pochino' = poco, 'molto' = tanto"},
        }, ["direzione", "quantita", "unita", "intensita"]),
        fn("esegui_routine", "Esegue una routine insegnata a voce, per nome.",
           {"name": {"type": "string", "description": "nome della routine così come è stata insegnata"}}, ["name"]),
    ]


SYSTEM_PROMPT = """Sei Gergo, l'assistente vocale di una postazione di etichettatura con un braccio robotico.
L'operatore parla in italiano. Luoghi: INGRESSO, STAZIONE, USCITA, SCARTI, HOME.
Per ogni comando chiama UNA sola funzione tra quelle disponibili. Le tue chiamate sono proposte: il sistema le
rilegge all'operatore e aspetta il suo "sì" prima di qualsiasi movimento. Non dire mai che il braccio si è mosso.
Regole:
- Non inventare mai quantità: metti quantita e unita solo se l'operatore dice un numero; altrimenti usa
  intensita ("un po'" = un_po, "un pochino" = poco, "molto" = tanto) oppure lascia tutto null.
- Non emettere mai coordinate, pose o angoli.
- Se il comando è ambiguo (manca il luogo, manca la direzione, non sai a cosa si riferisce), NON chiamare
  funzioni: fai una sola domanda breve di chiarimento.
- Dopo la chiamata il sistema rilegge il comando e aspetta "sì": tu non eseguire nulla da solo.
"""


def system_prompt(memory: dict | None) -> str:
    if not memory:
        return SYSTEM_PROMPT
    lines = [SYSTEM_PROMPT, "Memoria della postazione (lessico e routine insegnati dall'operatore):"]
    for b in memory.get("bindings", []):
        lines.append(f'- "{b["expression"]}" significa {json.dumps(b["means"], ensure_ascii=False)}')
    for r in memory.get("routines", []):
        if r.get("status", "active") != "active":
            continue
        steps = ", ".join(s["skill"] + (f"({s['place']})" if "place" in s else "") for s in r["steps"])
        lines.append(f'- routine "{r["name"]}" v{r.get("version", 1)}: {steps}')
    return "\n".join(lines)


def call_grok(utterance: str, model: str, memory: dict | None, api_key: str, timeout: float = 30.0) -> dict:
    body = {"model": model, "temperature": 0, "tool_choice": "auto", "tools": tool_definitions(),
            "messages": [{"role": "system", "content": system_prompt(memory)},
                         {"role": "user", "content": utterance}]}
    req = urllib.request.Request(XAI_URL, data=json.dumps(body).encode(), method="POST",
                                 headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def stub_grok(utterance: str, model: str, memory: dict | None, api_key: str | None = None) -> dict:
    """--dry-run: risposta senza tool call (il modello "chiede"). Rende la pipeline testabile offline."""
    return {"choices": [{"message": {"role": "assistant", "content": "[stub] Puoi ripetere?", "tool_calls": []}}]}


def parse_completion(resp: dict) -> tuple[dict | None, str | None, int]:
    msg = resp["choices"][0]["message"]
    calls = msg.get("tool_calls") or []
    if not calls:
        return None, msg.get("content"), 0
    f = calls[0]["function"]
    try:
        args = json.loads(f.get("arguments") or "{}")
    except json.JSONDecodeError:
        args = {"_unparsable": f.get("arguments")}
    return {"skill": f["name"], "params": args}, msg.get("content"), len(calls)


# ── Valutazione ──────────────────────────────────────────────────────────────────────────────────────
def score_case(case: dict, proposal: dict | None, state: dict, ws: dict) -> dict:
    exp = case["expected"]
    asked = proposal is None
    skill_ok = params_ok = False
    if exp and proposal:
        skill_ok = proposal["skill"] == exp["skill"]
        params_ok = skill_ok and normalize_params(proposal["skill"], proposal.get("params")) == \
            normalize_params(exp["skill"], exp["params"])
    if case["needs_clarification"]:
        correct = asked
    elif case.get("expect_reject_geofence"):
        correct = params_ok and state["status"] == "rejected_geofence"
    else:
        correct = params_ok
    return {"skill_ok": skill_ok, "params_ok": params_ok, "asked": asked, "correct": correct,
            "exec_without_confirmation": executed_without_confirmation(state),
            "geofence_violation_accepted": geofence_violation_accepted(state, ws)}


def run_condition(cond: str, cases: list[dict], ws: dict, memory: dict, *, model: str | None,
                  dry_run: bool, api_key: str | None) -> dict:
    per_case, latencies = [], []
    for case in cases:
        rec: dict = {"id": case["id"], "utterance": case["utterance"], "expected": case["expected"]}
        if cond == "A":
            proposal, text, n_calls, latency = rules_parse(case["utterance"]), None, None, None
        else:
            fn = stub_grok if dry_run else call_grok
            t0 = time.perf_counter()
            try:
                resp = fn(case["utterance"], model, memory if cond == "C" else None, api_key)
                proposal, text, n_calls = parse_completion(resp)
                rec["error"] = None
            except (urllib.error.URLError, TimeoutError, KeyError, ValueError) as e:
                proposal, text, n_calls = None, None, 0
                rec["error"] = f"{type(e).__name__}: {e}"
            latency = (time.perf_counter() - t0) * 1000
            latencies.append(latency)
        # La pipeline conosce sempre le routine salvate (stato del sistema); la condizione cambia solo
        # cosa sa il modello.
        state = run_pipeline(proposal, case, ws, memory)
        rec.update(proposal=proposal, model_text=text, n_tool_calls=n_calls, latency_ms=latency,
                   pipeline=state, **score_case(case, proposal, state, ws))
        per_case.append(rec)
    return {"condition": cond, "per_case": per_case, "metrics": metrics(cases, per_case, latencies)}


def metrics(cases: list[dict], recs: list[dict], latencies: list[float]) -> dict:
    by_id = {c["id"]: c for c in cases}
    with_exp = [r for r in recs if by_id[r["id"]]["expected"]]
    clar = [r for r in recs if r["asked"]]
    n = len(with_exp) or 1
    return {
        "n_cases": len(recs),
        "skill_accuracy": sum(r["skill_ok"] for r in with_exp) / n,
        "param_accuracy": sum(r["params_ok"] for r in with_exp) / n,
        "overall_accuracy": sum(r["correct"] for r in recs) / (len(recs) or 1),
        "clarification_turns": len(clar),
        "clarification_expected": sum(by_id[r["id"]]["needs_clarification"] for r in clar),
        "clarification_unexpected": sum(not by_id[r["id"]]["needs_clarification"] for r in clar),
        "clarification_missed": sum(1 for r in recs if by_id[r["id"]]["needs_clarification"] and not r["asked"]),
        "memory_cases_correct": sum(r["correct"] for r in recs if by_id[r["id"]].get("needs_memory")),
        "memory_cases": sum(1 for r in recs if by_id[r["id"]].get("needs_memory")),
        "geofence_rejects_correct": sum(r["correct"] for r in recs if by_id[r["id"]].get("expect_reject_geofence")),
        "geofence_cases": sum(1 for r in recs if by_id[r["id"]].get("expect_reject_geofence")),
        "executions_without_confirmation": sum(r["exec_without_confirmation"] for r in recs),
        "geofence_violations_accepted": sum(r["geofence_violation_accepted"] for r in recs),
        "latency_median_ms": statistics.median(latencies) if latencies else None,
        "api_errors": sum(1 for r in recs if r.get("error")),
    }


def markdown_table(summary: dict) -> str:
    conds = summary["conditions"]
    rows = [
        ("Accuratezza skill", "skill_accuracy", "pct"), ("Accuratezza params", "param_accuracy", "pct"),
        ("Accuratezza complessiva", "overall_accuracy", "pct"),
        ("Turni di chiarimento (attesi / non attesi / mancati)", None, "clar"),
        ("Gergo da memoria corretto", None, "mem"), ("Rifiuti geofence corretti", None, "geo"),
        ("Esecuzioni senza conferma (deve essere 0)", "executions_without_confirmation", "int"),
        ("Movimenti fuori geofence accettati (deve essere 0)", "geofence_violations_accepted", "int"),
        ("Latenza mediana (ms)", "latency_median_ms", "ms"),
    ]
    head = "| Metrica | " + " | ".join(conds) + " |\n|---|" + "---|" * len(conds) + "\n"
    out = []
    for label, key, kind in rows:
        cells = []
        for c in conds:
            m = summary["metrics"][c]
            if kind == "pct":
                cells.append(f"{m[key] * 100:.0f}%")
            elif kind == "int":
                cells.append(str(m[key]))
            elif kind == "ms":
                cells.append("—" if m[key] is None else f"{m[key]:.0f}")
            elif kind == "clar":
                cells.append(f"{m['clarification_turns']} ({m['clarification_expected']} / "
                             f"{m['clarification_unexpected']} / {m['clarification_missed']})")
            elif kind == "mem":
                cells.append(f"{m['memory_cases_correct']}/{m['memory_cases']}")
            elif kind == "geo":
                cells.append(f"{m['geofence_rejects_correct']}/{m['geofence_cases']}")
        out.append(f"| {label} | " + " | ".join(cells) + " |")
    note = (f"\nSplit `{summary['split']}` · {summary['n_cases']} casi · modello "
            f"`{summary['model'] or '—'}` · workspace: {summary['workspace_source']}"
            + (" · **DRY-RUN: B/C sono uno stub senza tool call**" if summary["dry_run"] else "") + "\n")
    return head + "\n".join(out) + "\n" + note


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--split", default="test", choices=["dev", "test", "all"])
    ap.add_argument("--conditions", default="A,B,C")
    ap.add_argument("--model", default=os.environ.get("XAI_EVAL_MODEL"))
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--out-dir", default=str(EVAL_DIR / "results"))
    args = ap.parse_args(argv)

    conds = [c.strip().upper() for c in args.conditions.split(",") if c.strip()]
    if bad := [c for c in conds if c not in ("A", "B", "C")]:
        ap.error(f"condizioni ignote: {bad}")
    uses_grok = any(c in ("B", "C") for c in conds)
    api_key = os.environ.get("XAI_API_KEY")
    if uses_grok and not args.dry_run:
        if not args.model:
            print("ERRORE: nessun modello. Passa --model oppure imposta XAI_EVAL_MODEL "
                  "(il nome del modello Grok non è scritto nel codice di proposito).", file=sys.stderr)
            return 2
        if not api_key:
            print("ERRORE: XAI_API_KEY non impostata.", file=sys.stderr)
            return 2

    cases = load_checkset(split=args.split)
    ws, memory = load_workspace(), load_memory()
    ts = dt.datetime.now().strftime("%Y%m%d-%H%M%S") + ("-dryrun" if args.dry_run else "")
    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)

    model_label = (args.model or "stub") if args.dry_run else args.model
    summary = {"timestamp": ts, "split": args.split, "n_cases": len(cases), "dry_run": args.dry_run,
               "model": model_label if uses_grok else None, "conditions": conds, "metrics": {},
               "workspace_source": ws["source"], "axes_source": ws["axes_source"]}
    for c in conds:
        res = run_condition(c, cases, ws, memory, model=args.model, dry_run=args.dry_run, api_key=api_key)
        res.update(timestamp=ts, split=args.split, dry_run=args.dry_run, model=summary["model"] if c != "A" else None)
        (out / f"{ts}-{c}.json").write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
        summary["metrics"][c] = res["metrics"]
    md = markdown_table(summary)
    (out / f"summary-{ts}.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / f"summary-{ts}.md").write_text(md, encoding="utf-8")
    print(md)
    hard_fail = any(summary["metrics"][c]["executions_without_confirmation"] or
                    summary["metrics"][c]["geofence_violations_accepted"] for c in conds)
    return 1 if hard_fail else 0


if __name__ == "__main__":
    sys.exit(main())
