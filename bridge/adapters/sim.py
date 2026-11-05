"""SimArm: simula la postazione, le durate dei task, le pose del TCP e i movimenti lineari ("sposta").

Le durate vengono da /shared/fixtures/elite_durations.json (misurate al primo slot da BRACCIO), con rumore;
`inject` rende lento o fa fallire un passo per provare il pattern miner. La cinematica è finta: rifiuta solo una
zona di singolarità configurabile, per provare il percorso di rifiuto.
"""
from __future__ import annotations

import json
import random
import time
from pathlib import Path
from typing import Any, Optional

from bridge.adapters.base import AdapterStatus, LineCheck, Pose, RobotAdapter, TaskResult

DURATIONS_PATH = Path(__file__).resolve().parents[2] / "shared" / "fixtures" / "elite_durations.json"
DEFAULT_S = {"solleva": 3.0, "deposita": 3.0, "porta": 2.5, "applica": 2.0, "home": 2.0}
PLACE_POSES = {"HOME": Pose(150, 0, 300), "INGRESSO": Pose(250, -200, 150), "STAZIONE": Pose(250, 0, 150),
               "USCITA": Pose(250, 200, 150), "SCARTI": Pose(100, 250, 150)}


def load_durations() -> dict[str, float]:
    d = dict(DEFAULT_S)
    if DURATIONS_PATH.exists():
        raw = json.loads(DURATIONS_PATH.read_text())
        for k, v in raw.items():
            if isinstance(v, (int, float)):
                d[k] = float(v)
            elif isinstance(v, dict) and "median_s" in v:
                d[k] = float(v["median_s"])
    return d


class SimArm(RobotAdapter):
    name = "sim"

    def __init__(self, inject: Optional[list[str]] = None, time_scale: float = 1.0, guard: bool = True,
                 singular_x_above: float = 10_000, seed: Optional[int] = None):
        self.durations = load_durations()
        self.inject = {}
        for item in inject or []:
            kind, _, skill = item.partition(":")
            self.inject[skill] = kind
        self.time_scale = time_scale
        self._guard = guard
        self.singular_x_above = singular_x_above
        self.pose = PLACE_POSES["HOME"]
        self.tcp_mm = (0.0, 0.0, 0.0)
        self._stopped = False
        self.rng = random.Random(seed)

    # --- interfaccia
    def connect(self) -> None:
        pass

    def status(self) -> AdapterStatus:
        return AdapterStatus(connected=True, mode="sim", robot_ready=True, tcp_mm=self.tcp_mm)

    def read_pose(self) -> Pose:
        return self.pose

    def read_tcp_mm(self):
        return self.tcp_mm

    def check_line(self, start: Pose, target: Pose) -> LineCheck:
        for i in range(1, 6):
            x = start.x + (target.x - start.x) * i / 5
            if x > self.singular_x_above:
                return LineCheck(ok=False, reason="vicino a una singolarità: i giunti dovrebbero correre",
                                 max_ratio_deg_per_mm=2.0)
        return LineCheck(ok=True, max_joint_jump_deg=1.0, max_ratio_deg_per_mm=0.2)

    def move_linear(self, target: Pose, speed_mm_s: float, timeout_s: float) -> TaskResult:
        dist = sum((a - b) ** 2 for a, b in zip(target.xyz, self.pose.xyz)) ** 0.5
        dur = dist / max(speed_mm_s, 1e-6)
        if dur > timeout_s:
            return TaskResult(ok=False, duration_ms=int(timeout_s * 1000), error="timeout")
        ok = self._sleep(dur)
        if not ok:
            return TaskResult(ok=False, duration_ms=int(dur * 1000), error="fermato")
        self.pose = target
        return TaskResult(ok=True, duration_ms=int(dur * 1000), details={"pose_mm": list(target.xyz)})

    def run_task(self, skill: str, params: dict[str, Any], timeout_s: float) -> TaskResult:
        base = self.durations.get(skill, 2.0)
        dur = base * self.rng.uniform(0.9, 1.1)
        kind = self.inject.get(skill)
        if kind == "slow":
            dur *= 2.5
        if dur > timeout_s:
            self._sleep(timeout_s)
            return TaskResult(ok=False, duration_ms=int(timeout_s * 1000), error="timeout")
        if not self._sleep(dur):
            return TaskResult(ok=False, duration_ms=int(dur * 1000), error="fermato")
        if kind == "fail":
            return TaskResult(ok=False, duration_ms=int(dur * 1000), error=f"{skill} fallita (iniettato)")
        place = params.get("place")
        if skill == "home":
            self.pose = PLACE_POSES["HOME"]
        elif place in PLACE_POSES:
            self.pose = PLACE_POSES[place]
        return TaskResult(ok=True, duration_ms=int(dur * 1000), details={"injected": kind} if kind else {})

    def stop(self) -> None:
        self._stopped = True

    def guard_alive(self) -> bool:
        return self._guard

    # --- interni
    def _sleep(self, seconds: float) -> bool:
        self._stopped = False
        end = time.monotonic() + seconds * self.time_scale
        while time.monotonic() < end:
            if self._stopped:
                return False
            time.sleep(min(0.02, max(0.0, end - time.monotonic())))
        return not self._stopped
