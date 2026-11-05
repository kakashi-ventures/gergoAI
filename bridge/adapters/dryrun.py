"""Adapter elite finto: stampa cosa invierebbe e non apre nessun socket. Si usa in --mode elite finché
BRACCIO non consegna bridge/adapters/elite.py, e con --dry-run."""
from __future__ import annotations

import json

from bridge.adapters.base import AdapterStatus, LineCheck, Pose, TaskResult
from bridge.adapters.sim import SimArm


class DryRunElite(SimArm):
    name = "elite-dry-run"

    def __init__(self, **kw):
        super().__init__(time_scale=0.0, **kw)

    def status(self) -> AdapterStatus:
        return AdapterStatus(connected=False, mode="dry-run", robot_ready=True, message="dry-run: nessun socket")

    def move_linear(self, target: Pose, speed_mm_s: float, timeout_s: float) -> TaskResult:
        print("[dry-run] " + json.dumps({"method": "moveByLine", "params": {
            "targetPose": [target.x, target.y, target.z, target.rx, target.ry, target.rz],
            "speed_type": 0, "speed": speed_mm_s}}))
        return super().move_linear(target, speed_mm_s, timeout_s)

    def run_task(self, skill, params, timeout_s) -> TaskResult:
        print("[dry-run] " + json.dumps({"method": "runJbi", "params": {"filename": f"{skill}_{params.get('place', '')}".rstrip("_")}}))
        return super().run_task(skill, params, timeout_s)

    def check_line(self, start, target) -> LineCheck:
        print("[dry-run] inverseKinematic × 5 lungo la linea")
        return super().check_line(start, target)

    def stop(self) -> None:
        print('[dry-run] {"method": "stop"}')
        super().stop()
