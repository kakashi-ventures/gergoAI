"""Adapter Elite serie CS: RobotAdapter sopra gergo_sdk (Dashboard 29999, Primary 30001, RTSI 30004).

Pose dell'interfaccia: frame utente (shared/fixtures/frame.json), mm + rad. Verso il controller: frame base, m + rad.
Il controllo di cinematica usa i parametri MDH letti dal controller (KinematicsInfo) e i giunti attuali (RTSI).
Mai un comando reale senza conferma: in armed il primo comando della sessione chiede "y" (gergo_sdk.cs).
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Optional

from bridge.adapters.base import AdapterStatus, LineCheck, Pose, RobotAdapter, TaskResult
from gergo_sdk import kinematics as kin
from gergo_sdk import motion
from gergo_sdk.cs import CsController

FIXTURES = Path(__file__).resolve().parents[2] / "shared" / "fixtures"


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


class EliteCsAdapter(RobotAdapter):
    name = "elite-cs"

    def __init__(self, host: Optional[str] = None, mode: Optional[str] = None, controller: Optional[CsController] = None,
                 guard_heartbeat_file: Optional[str] = None, **ports: int):
        self.cs = controller or CsController(host or os.environ.get("ELITE_HOST", "127.0.0.1"),
                                             mode or os.environ.get("ELITE_MODE", "dry-run"), **ports)
        fr = _load("frame.json")["user_frame_in_base"]
        o = fr["origin_mm"]
        self.frame_base_m = [o[0] / 1000, o[1] / 1000, o[2] / 1000, *fr["rotvec_rad"]]
        self.tasks = _load("elite_tasks.json")["tasks"]
        self.heartbeat_file = guard_heartbeat_file or os.environ.get("GERGO_GUARD_HEARTBEAT")

    # --- conversioni ------------------------------------------------------------------------------------------
    def _to_base_m(self, p: Pose) -> list[float]:
        return list(kin.user_to_base(self.frame_base_m, motion.pose_mm_to_m([p.x, p.y, p.z, p.rx, p.ry, p.rz])))

    def _to_user(self, base_m: list[float]) -> Pose:
        u = kin.base_to_user(self.frame_base_m, base_m)
        return Pose(u[0] * 1000, u[1] * 1000, u[2] * 1000, u[3], u[4], u[5])

    # --- RobotAdapter -----------------------------------------------------------------------------------------
    def connect(self) -> None:
        self.cs.connect()

    def status(self) -> AdapterStatus:
        if self.cs.mode == "dry-run":
            return AdapterStatus(connected=False, mode="dry-run", robot_ready=True, message="dry-run: nessun socket")
        try:
            why = self.cs.preflight() or self.cs.primary_error
            try:
                tcp = self.read_tcp_mm()
            except Exception:
                tcp = None  # Primary assente (read-only): lo stato resta leggibile, i movimenti no
            return AdapterStatus(connected=True, mode=self.cs.mode, robot_ready=why is None, message=why or "",
                                 tcp_mm=tcp, details=self.cs.status())
        except Exception as e:
            return AdapterStatus(connected=False, mode=self.cs.mode, robot_ready=False,
                                 message=f"Controller non raggiungibile: {e}")

    def read_pose(self) -> Pose:
        return self._to_user(self.cs.pose_base_m())

    def read_tcp_mm(self) -> tuple[float, float, float]:
        t = self.cs.tcp_offset_m()
        return (t[0] * 1000, t[1] * 1000, t[2] * 1000)

    def check_line(self, start: Pose, target: Pose) -> LineCheck:
        if self.cs.mode == "dry-run":
            return LineCheck(ok=True, reason="dry-run: cinematica non controllata")
        try:
            mdh = self.cs.mdh()
        except Exception as e:
            return LineCheck(ok=False, reason=f"cinematica non disponibile: {e}")
        m = kin.MDH(alpha=tuple(mdh.alpha), a=tuple(mdh.a), d=tuple(mdh.d))
        r = motion.check_line(m, self._to_base_m(start), self._to_base_m(target), self.cs.joints(),
                              tcp=self.cs.tcp_offset_m())
        return LineCheck(ok=r.ok, reason=r.reason, samples=r.samples, max_joint_jump_deg=r.max_joint_jump_deg,
                         max_ratio_deg_per_mm=r.max_ratio_deg_per_mm)

    def move_linear(self, target: Pose, speed_mm_s: float, timeout_s: float) -> TaskResult:
        r = self.cs.move_linear(self._to_base_m(target), motion.mm_s_to_m_s(speed_mm_s), timeout_s)
        d: dict[str, Any] = dict(r.details)
        if "final_pose" in d:
            fp = self._to_user(d["final_pose"])
            d["final_pose_mm"] = [fp.x, fp.y, fp.z]
            d["ok_lt_1mm"] = d.get("error_mm", 99) < 1.0
        return TaskResult(ok=r.ok, duration_ms=r.duration_ms, error=r.error, details=d)

    def run_task(self, skill: str, params: dict[str, Any], timeout_s: float) -> TaskResult:
        key = f"{skill}:{params['place']}" if params.get("place") else skill
        task = self.tasks.get(key)
        if not task:
            return TaskResult(ok=False, duration_ms=0, error=f"Nessun task sul controller per {key}.")
        r = self.cs.run_task(task, timeout_s)
        return TaskResult(ok=r.ok, duration_ms=r.duration_ms, error=r.error, details={"task": task, **r.details})

    def stop(self) -> None:
        self.cs.stop()

    def guard_alive(self) -> bool:
        if not self.heartbeat_file:
            return False
        try:
            if time.time() - os.path.getmtime(self.heartbeat_file) >= 1.0:
                return False
            return bool(json.loads(Path(self.heartbeat_file).read_text()).get("alive"))
        except (OSError, ValueError):
            return False
