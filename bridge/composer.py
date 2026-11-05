"""Composer: esegue i routine_run confermati dal web (esegui_routine dopo la conferma vocale unica).

Per ogni ripetizione espande la routine nei suoi steps e accoda un command alla volta (mai più di uno in
"running"); ogni command passa comunque dal validatore del bridge. `attendi_operatore` scrive un event
"feedback" con `awaiting: true` e il prompt, poi aspetta un event "feedback" dello stesso run con `done: true`
(o testo "fatto"), scritto dal web. A fine ciclo scrive `cycle_time_ms` (event step_end con `cycle: true`).
Uno STOP interrompe il run.

Il command creato dal composer ha `confirmed_at` = ora di accodamento: la conferma umana è quella del run
(`routine_runs.confirmed_at`), e un run confermato da più di 30 s non parte.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Optional

from bridge.main import Bridge, _parse_ts
from bridge.store import Store, now_iso

RUN_MAX_AGE_S = 30.0
FEEDBACK_TIMEOUT_S = 120.0
POLL_S = 0.3


class Composer:
    def __init__(self, store: Store, bridge: Bridge, feedback_timeout_s: float = FEEDBACK_TIMEOUT_S,
                 poll_s: float = POLL_S):
        self.store, self.bridge = store, bridge
        self.feedback_timeout_s, self.poll_s = feedback_timeout_s, poll_s

    def poll_once(self) -> int:
        runs = self.store.pending_runs()
        if runs:
            self.run(runs[0])
        return len(runs)

    def _event(self, type_, run, step=None, **payload):
        ev = {"type": type_, "routine_run_id": run["id"], "payload": payload}
        if step is not None:
            ev["step"] = step
        return self.store.insert_event(ev)

    def run(self, run: dict) -> str:
        rid = run["id"]
        confirmed = _parse_ts(run.get("confirmed_at"))
        if confirmed is None or (datetime.now(timezone.utc) - confirmed).total_seconds() > RUN_MAX_AGE_S:
            self.store.update_run(rid, {"status": "failed"})
            self._event("anomaly", run, kind="validator_reject", code="stale_run",
                        reason="la routine non è stata confermata negli ultimi 30 secondi")
            return "failed"
        routine = self.store.routine(run["routine_name"], run.get("routine_version"))
        if routine is None or routine.get("status") == "deprecated":
            self.store.update_run(rid, {"status": "failed"})
            self._event("anomaly", run, kind="validator_reject", code="routine_missing",
                        reason=f"la routine {run['routine_name']} non esiste o è deprecata")
            return "failed"

        stops_at_start = self.bridge.stop_count
        reps = max(1, int(run.get("repetitions") or 1))
        self.store.update_run(rid, {"status": "running", "started_at": now_iso(),
                                    "routine_version": routine["version"]})
        for rep in range(1, reps + 1):
            t0 = time.monotonic()
            for i, step in enumerate(routine["steps"], start=1):
                self.store.update_run(rid, {"current_step": i, "current_repetition": rep})
                if self.bridge.stop_count != stops_at_start:
                    return self._end(run, "cancelled", "fermato")
                ok = self._step(run, step, i)
                if self.bridge.stop_count != stops_at_start:
                    return self._end(run, "cancelled", "fermato")
                if not ok:
                    return self._end(run, "failed", f"passo {i} ({step['skill']}) non riuscito")
            cycle_ms = int((time.monotonic() - t0) * 1000)
            self._event("step_end", run, cycle=True, ok=True, repetition=rep, cycle_time_ms=cycle_ms,
                        routine=routine["name"], version=routine["version"], duration_ms=cycle_ms)
            self.store.update_run(rid, {"cycle_time_ms": cycle_ms})
        return self._end(run, "done")

    def _end(self, run, status, reason: Optional[str] = None) -> str:
        self.store.update_run(run["id"], {"status": status, "finished_at": now_iso()})
        if reason and status == "failed":
            self._event("anomaly", run, kind="routine_failed", reason=reason)
        return status

    def _step(self, run: dict, step: dict, i: int) -> bool:
        if step["skill"] == "attendi_operatore":
            return self._wait_operator(run, step, i)
        params = dict(step.get("params") or {})
        if step.get("place"):
            params["place"] = step["place"]
        cmd = self.store.insert_command({
            "skill": step["skill"], "params": params, "routine_run_id": run["id"], "step": i,
            "status": "confirmed", "confirmed_at": now_iso(),
        })
        self.bridge.execute(cmd)
        final = self.store.command(cmd["id"]) or {}
        return final.get("status") == "done"

    def _wait_operator(self, run: dict, step: dict, i: int) -> bool:
        ev = self._event("feedback", run, step=i, awaiting=True, prompt=step.get("prompt") or "dimmi fatto")
        since = ev.get("ts") or now_iso()
        stops = self.bridge.stop_count
        deadline = time.monotonic() + self.feedback_timeout_s
        while time.monotonic() < deadline:
            if self.bridge.stop_count != stops:
                return False
            for e in self.store.events_after(since, run["id"], "feedback"):
                p = e.get("payload") or {}
                if p.get("done") or str(p.get("text", "")).strip().lower() == "fatto":
                    return True
            time.sleep(self.poll_s)
        self._event("anomaly", run, step=i, kind="operator_timeout",
                    reason=f"nessun \"fatto\" entro {int(self.feedback_timeout_s)} secondi")
        return False
