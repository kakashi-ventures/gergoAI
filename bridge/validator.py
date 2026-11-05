"""Validatore deterministico del bridge. Rivalida OGNI command prima di eseguirlo (doppio controllo con la route
web). Ogni rifiuto diventa un event "anomaly" con il motivo (lo scrive main.py).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import ValidationError

from bridge import motion
from bridge.adapters.base import Pose
from bridge.contracts import Command, SpostaParams, Workspace

MAX_COMMAND_AGE_S = 30.0
TCP_TOLERANCE_MM = 2.0
MOTION_SKILLS = {"sposta"}
SESSION_SKILLS = {"piu_piano", "piu_veloce"}


@dataclass
class StationState:
    fork_loaded: bool = False
    at: str = "HOME"

    def apply(self, skill: str, params: dict) -> None:
        place = params.get("place")
        if skill == "solleva":
            self.fork_loaded, self.at = True, place
        elif skill == "deposita":
            self.fork_loaded, self.at = False, place
        elif skill == "porta":
            self.at = place
        elif skill == "home":
            self.at = "HOME"


@dataclass
class Context:
    mode: str                                   # "sim" | "elite"
    skills: dict[str, dict]                     # nome → {status, confirmed_at, ...}
    places: set[str]
    ontology_status: str = "draft"
    station: StationState = field(default_factory=StationState)
    now: Optional[datetime] = None
    speed_mm_s: float = 50.0
    # per "sposta"
    workspace: Optional[Workspace] = None
    pose: Optional[Pose] = None
    tool_expected_tcp_mm: Optional[tuple[float, float, float]] = None
    tool_actual_tcp_mm: Optional[tuple[float, float, float]] = None
    guard_alive: bool = False
    frame: Optional[dict] = None


@dataclass
class Decision:
    ok: bool
    reason: Optional[str] = None
    code: Optional[str] = None
    motion_check: Optional[dict[str, Any]] = None
    target: Optional[Pose] = None
    readback: Optional[str] = None


def _reject(code: str, reason: str, **kw) -> Decision:
    return Decision(ok=False, code=code, reason=reason, **kw)


def validate(cmd_raw: dict | Command, ctx: Context) -> Decision:
    try:
        cmd = cmd_raw if isinstance(cmd_raw, Command) else Command.model_validate(cmd_raw)
    except ValidationError as e:
        return _reject("contract", f"comando non valido: {e.errors()[0]['msg']}")

    skill = cmd.skill.value
    now = ctx.now or datetime.now(timezone.utc)

    # conferma e freschezza
    if cmd.confirmed_at is None:
        return _reject("not_confirmed", "il comando non è stato confermato")
    age = (now - cmd.confirmed_at).total_seconds()
    if age > MAX_COMMAND_AGE_S:
        return _reject("stale", f"il comando è vecchio di {int(age)} secondi (massimo {int(MAX_COMMAND_AGE_S)})")

    if skill == "stop":
        return Decision(ok=True)  # lo stop passa sempre

    # stato della skill e dell'ontologia
    s = ctx.skills.get(skill)
    if s is None:
        return _reject("unknown_skill", f"la skill {skill} non è nell'ontologia")
    status = s.get("status")
    if status == "deprecated":
        return _reject("deprecated", f"la skill {skill} è deprecata")
    if ctx.mode == "elite":
        if status != "confirmed":
            return _reject("not_confirmed_skill", f"in modalità elite la skill {skill} deve essere confermata")
        if ctx.ontology_status != "confirmed":
            return _reject("ontology_draft", "in modalità elite l'ontologia attiva deve essere confermata")
    elif status not in ("draft", "confirmed"):
        return _reject("bad_status", f"stato della skill {skill} non valido: {status}")

    if skill in SESSION_SKILLS:
        return Decision(ok=True)

    if skill in MOTION_SKILLS:
        return _validate_sposta(cmd, ctx)

    # precondizioni delle primitive
    place = cmd.params.get("place")
    if place is not None and place not in ctx.places:
        return _reject("unknown_place", f"il luogo {place} non esiste")
    st = ctx.station
    if skill == "solleva" and st.fork_loaded:
        return _reject("precondition", "la forchetta è già occupata")
    if skill == "deposita" and not st.fork_loaded:
        return _reject("precondition", "la forchetta è vuota, non c'è niente da depositare")
    if skill == "applica":
        if st.at != "STAZIONE":
            return _reject("precondition", "applica si fa solo in STAZIONE")
        if not st.fork_loaded:
            return _reject("precondition", "applica richiede un vassoio in STAZIONE")
    return Decision(ok=True)


def _validate_sposta(cmd: Command, ctx: Context) -> Decision:
    p = SpostaParams.model_validate(cmd.params)
    d, mm, clamped = motion.delta_mm(p, ctx.frame)
    check: dict[str, Any] = {"command_id": cmd.id, "delta_mm": list(d), "geofence_ok": False,
                             "velocita_mm_s": ctx.speed_mm_s, "ok": False}

    def no(code, reason):
        check["reason"] = reason
        return _reject(code, reason, motion_check=check)

    if not ctx.guard_alive:
        return no("guard_dead", "l'arresto acustico non è attivo: nessun movimento")
    if ctx.workspace is None:
        return no("no_workspace", "manca l'area di lavoro: insegnala con \"salva angolo\"")
    if ctx.pose is None:
        return no("no_pose", "non riesco a leggere la posizione del braccio")
    if ctx.tool_expected_tcp_mm is not None:
        if ctx.tool_actual_tcp_mm is None:
            return no("tcp_unknown", "non riesco a leggere il TCP del controller")
        err = max(abs(a - b) for a, b in zip(ctx.tool_expected_tcp_mm, ctx.tool_actual_tcp_mm))
        if err > TCP_TOLERANCE_MM:
            return no("tcp_mismatch", "il TCP del controller non coincide con il tool montato")

    target = ctx.pose.translated(d)
    check["pose_mm"] = list(ctx.pose.xyz)
    check["target_mm"] = list(target.xyz)
    g = motion.geofence(target.xyz, ctx.workspace)
    check["geofence_ok"] = g.ok
    if not g.ok:
        check["fuori_di_mm"] = g.fuori_di_mm
        return no("geofence", motion.fuori_text(g.fuori_di_mm))
    check["ok"] = True  # la cinematica la aggiunge main.py dopo adapter.check_line
    return Decision(ok=True, motion_check=check, target=target, readback=motion.readback(p, ctx.speed_mm_s))
