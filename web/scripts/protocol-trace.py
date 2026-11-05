#!/usr/bin/env python3
"""Traccia del protocollo: dalla tool call vocale ai byte che arrivano al controller CS.

Ogni esempio passa dal codice VERO, nello stesso ordine del bridge (bridge/main.py):
  contratto Command → bridge.validator.validate → EliteCsAdapter (check_line, move_linear / run_task)
  → gergo_sdk (Dashboard 29999, Primary 30001, RTSI 30004) → gergo_sdk.mock, che registra cosa arriva sul socket.
Niente è scritto a mano tranne la tool call di partenza (è l'unico pezzo che decide il modello) e la frase.

Uso (dalla root del repo):  .venv/bin/python web/scripts/protocol-trace.py
Scrive web/lib/generated/protocol-trace.json (committato: Vercel non ha l'ambiente Python).
"""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "sdk"))

from bridge import motion as bmotion  # noqa: E402
from bridge.adapters.elite import EliteCsAdapter  # noqa: E402
from bridge.contracts import VELOCITA_DEFAULT_MM_S, SpostaParams, Workspace  # noqa: E402
from bridge.validator import Context, StationState, validate  # noqa: E402
from gergo_sdk.cs import CsController  # noqa: E402
from gergo_sdk.mock import MockController  # noqa: E402

OUT = ROOT / "web" / "lib" / "generated" / "protocol-trace.json"
NOW = datetime.now(timezone.utc)
PLACES = {"INGRESSO", "STAZIONE", "USCITA", "SCARTI", "HOME"}
START_BASE_M = [0.40, -0.05, 0.30]  # posa di partenza degli esempi, frame base (m)
SKILLS = ["solleva", "deposita", "porta", "applica", "home", "stop", "sposta", "piu_piano", "piu_veloce"]

# (frase dell'operatore, tool call che Grok emette, stato della forchetta prima del comando)
EXAMPLES = [
    ("scendi di 2 centimetri", "sposta", {"direzione": "giu", "quantita": 2, "unita": "cm", "intensita": None}, False),
    ("un po' più a destra", "sposta", {"direzione": "destra", "quantita": None, "unita": None, "intensita": "un_po"}, False),
    ("sali di 30 centimetri", "sposta", {"direzione": "su", "quantita": 30, "unita": "cm", "intensita": None}, False),
    ("prendi il vassoio all'ingresso", "propone_azione", {"skill": "solleva", "params": {"place": "INGRESSO"}}, False),
    ("portalo agli scarti", "propone_azione", {"skill": "porta", "params": {"place": "SCARTI"}}, True),
    ("torna a casa", "propone_azione", {"skill": "home", "params": {}}, False),
    ("più piano", "piu_piano", {}, False),
    ("fermo!", "stop", {}, False),
]


def git(*args: str) -> str | None:
    try:
        return subprocess.check_output(["git", *args], cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return None


def to_command(tool: str, args: dict) -> tuple[str, dict]:
    """Stessa traduzione di web/lib/server/tools.ts: tool call → riga commands (skill + params)."""
    if tool == "propone_azione":
        return args["skill"], args.get("params") or {}
    if tool == "sposta":
        return "sposta", {k: args.get(k) for k in ("direzione", "quantita", "unita", "intensita")}
    return tool, {}


def run_example(phrase: str, tool: str, args: dict, fork_loaded: bool) -> dict:
    m = MockController(task_duration_s=0.3)
    log: list[str] = []
    try:
        # La HOME del mock (x = -495 mm) è fuori dal workspace di default: si parte da una posa al centro del box,
        # raggiunta con la IK del mock (giunti e posa coerenti, come sul braccio vero).
        with m.state.lock:
            target = START_BASE_M + list(m.state.pose[3:])
            m.state.q = m.state._ik(target, m.state.q)
            m.state.pose = m.state._fk(m.state.q)
        c = CsController(m.host, "armed", m.dashboard_port, m.primary_port, m.rtsi_port, confirm=lambda s: True,
                         log=log.append)
        a = EliteCsAdapter(controller=c)
        a.connect()
        pose = a.read_pose()
        ws_raw = json.loads((ROOT / "shared" / "fixtures" / "workspace.json").read_text())
        ws = Workspace(frame=ws_raw["frame"], min_mm=ws_raw["min_mm"], max_mm=ws_raw["max_mm"])
        st = StationState()
        st.fork_loaded = fork_loaded
        ctx = Context(mode="sim", skills={n: {"status": "confirmed"} for n in SKILLS}, places=PLACES, now=NOW,
                      workspace=ws, pose=pose, guard_alive=True, station=st)
        skill, params = to_command(tool, args)
        cmd = {"id": "esempio", "skill": skill, "params": params, "status": "confirmed",
               "confirmed_at": (NOW - timedelta(seconds=1)).isoformat()}
        d = validate(cmd, ctx)

        readback = d.readback or (bmotion.readback(SpostaParams(**params)) if skill == "sposta" else None)
        n_dash, n_script = len(m.state.commands), len(m.state.scripts)
        result: dict = {"validator": {"ok": d.ok, "code": getattr(d, "code", None), "reason": getattr(d, "reason", None)}}
        if d.ok and skill == "sposta":
            mc = dict(d.motion_check or {})
            lc = a.check_line(pose, d.target)
            rnd = lambda v: [round(x, 2) for x in v] if isinstance(v, (list, tuple)) else v  # noqa: E731
            result["motion_check"] = {k: rnd(mc.get(k)) for k in ("delta_mm", "pose_mm", "target_mm", "geofence_ok",
                                                                  "fuori_di_mm", "velocita_mm_s")}
            result["kinematics"] = {"ok": lc.ok, "reason": lc.reason}
            if lc.ok:
                r = a.move_linear(d.target, VELOCITA_DEFAULT_MM_S, timeout_s=5)
                result["esito"] = {"ok": r.ok, "error": r.error, "duration_ms": r.duration_ms,
                                   "error_mm": round(r.details.get("error_mm", 0), 3) if r.details else None}
        elif d.ok and skill == "stop":
            a.stop()
            result["esito"] = {"ok": True, "error": None}
        elif d.ok and skill in ("piu_piano", "piu_veloce"):
            result["esito"] = {"ok": True, "error": None, "note": "cambia solo la velocità della sessione nel DB"}
        elif d.ok:
            r = a.run_task(skill, params, 5)
            result["esito"] = {"ok": r.ok, "error": r.error, "duration_ms": r.duration_ms,
                               "task": (r.details or {}).get("task")}
        # Cosa è arrivato sul socket del controller (finto) per QUESTO comando, escluse le letture di stato.
        reads = {"robotMode", "safety -s", "task -s", "remoteControl -s", "status", "version", "echo"}
        dash = [x for x in m.state.commands[n_dash:] if x not in reads]
        return {
            "frase": phrase,
            "tool_call": {"name": tool, "arguments": args},
            "command": {"skill": skill, "params": params},
            "readback": readback,
            "pose_iniziale_mm": [round(v, 2) for v in pose.xyz],
            **result,
            "wire": {
                "dashboard_29999": dash,
                "dashboard_letture": sorted({x for x in m.state.commands[n_dash:] if x in reads}),
                "primary_30001": m.state.scripts[n_script:],
            },
        }
    finally:
        m.close()


def main() -> None:
    examples = [run_example(*e) for e in EXAMPLES]
    tasks = json.loads((ROOT / "shared" / "fixtures" / "elite_tasks.json").read_text())
    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source_commit": git("rev-parse", "--short", "HEAD"),
        "dirty": bool(git("status", "--porcelain", "--", "bridge", "sdk", "shared")),
        "elite_tasks": tasks,
        "examples": examples,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
    for e in examples:
        w = e["wire"]
        print(f"{e['frase']:<34} ok={e['validator']['ok']!s:<5} dash={w['dashboard_29999']} script={len(w['primary_30001'])}"
              f"  {e.get('esito', {}).get('error') or e['validator'].get('reason') or ''}")
    print(f"→ {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
