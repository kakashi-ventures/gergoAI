"""Controller Elite serie CS: task insegnati (Dashboard 29999) e movimento lineare (script `movel` su 30001).

Modalità (DEPLOY.md prompt 4, punto 3):
- `dry-run`  (default): non apre socket, stampa cosa invierebbe;
- `read-only`: legge stato e posa, non invia né task né script (solo `stop` è ammesso);
- `armed`: invia. Prima del PRIMO comando di movimento della sessione mostra la sequenza esatta e aspetta "y".

`stop()` usa una connessione Dashboard propria, aperta al volo, così funziona anche se quella principale è occupata.
Non c'è mai power on, brake release, unlock protective stop o reset: un allarme lo risolve una persona dal pendant.
"""
from __future__ import annotations

import math
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from gergo_sdk.dashboard import DASHBOARD_PORT, DashboardClient
from gergo_sdk.motion import build_movel_script
from gergo_sdk.primary import PRIMARY_PORT, PrimaryClient
from gergo_sdk.rtsi import RTSI_PORT, RtsiReader

POSE_TOL_M = 0.001  # step_end ok se l'errore finale è sotto 1 mm (MOTION_SAFETY.md §2.8)


@dataclass
class Result:
    ok: bool
    duration_ms: int
    error: Optional[str] = None
    details: dict[str, Any] = field(default_factory=dict)


def _ask_tty(text: str) -> bool:
    print(text)
    return input("Invio al robot vero. Confermi? [y/N] ").strip().lower() == "y"


class CsController:
    def __init__(self, host: str, mode: str = "dry-run", dashboard_port: int = DASHBOARD_PORT,
                 primary_port: int = PRIMARY_PORT, rtsi_port: int = RTSI_PORT,
                 confirm: Callable[[str], bool] = _ask_tty, log: Optional[Callable[[str], None]] = None):
        if mode not in ("dry-run", "read-only", "armed"):
            raise ValueError(mode)
        self.host, self.mode = host, mode
        self.ports = (dashboard_port, primary_port, rtsi_port)
        self.log = log or print
        self.confirm = confirm
        self.confirmed_once = False
        self.dash = DashboardClient(host, dashboard_port, mode, log=self.log)
        self.primary = PrimaryClient(host, primary_port, mode, log=self.log)
        self.rtsi = RtsiReader(host, rtsi_port)
        self.connected = False

    # --- connessione -------------------------------------------------------------------------------------------
    def connect(self) -> None:
        if self.mode == "dry-run":
            self.connected = True
            return
        self.dash.connect()
        self.primary.connect()
        self.rtsi.connect()
        self.connected = True

    def close(self) -> None:
        for c in (self.dash, self.primary, self.rtsi):
            try:
                c.close()
            except Exception:
                pass

    # --- letture -----------------------------------------------------------------------------------------------
    def status(self) -> dict[str, Any]:
        if self.mode == "dry-run":
            return {"dry_run": True}
        return {"robot_mode": self.dash.robot_mode(), "safety": self.dash.safety_mode(),
                "remote": self.dash.remote(), "task": self.dash.task_status()}

    def preflight(self) -> Optional[str]:
        """None se pronto; altrimenti il motivo, in italiano, da dire all'operatore (MOTION_SAFETY.md §4)."""
        if self.mode == "dry-run":
            return None
        s = self.status()
        if s["robot_mode"] != "RUNNING":
            return (f"Il braccio è in {s['robot_mode']}: accendilo dal pendant e rilascia i freni, poi dimmi pronto.")
        if s["safety"] != "NORMAL":
            return f"Il controller segnala {s['safety']}: va risolto dal pendant."
        if s["remote"] != "REMOTE":
            return "Il pendant non è in controllo remoto: va messo in remote dal pendant."
        if s["task"] == "running":
            return "C'è già un task in esecuzione."
        return None

    def joints(self) -> list[float]:
        return list(self.rtsi.wait_fresh()["actual_joint_positions"])

    def pose_base_m(self) -> list[float]:
        return list(self.rtsi.wait_fresh()["actual_TCP_pose"])

    def tcp_offset_m(self) -> list[float]:
        return list(self.primary.wait_for("cartesian").tcp_offset)

    def mdh(self):
        return self.primary.wait_for("mdh")

    # --- conferma del primo comando ------------------------------------------------------------------------------
    def _gate(self, what: str) -> Optional[str]:
        if self.mode != "armed":
            return None
        if not self.confirmed_once:
            if not self.confirm(what):
                return "Comando non confermato dall'umano."
            self.confirmed_once = True
        return None

    # --- task insegnati ------------------------------------------------------------------------------------------
    def run_task(self, task_path: str, timeout_s: float = 30.0) -> Result:
        t0 = time.monotonic()
        ms = lambda: int((time.monotonic() - t0) * 1000)  # noqa: E731
        seq = f"Dashboard {self.host}:{self.ports[0]}\n  > task -p {task_path}\n  > play\n  (poi task -s ogni 100 ms)"
        if self.mode != "armed":
            self.log(f"[{self.mode}] {seq}")
            return Result(self.mode == "dry-run", ms(), None if self.mode == "dry-run" else "read-only: niente task")
        why = self.preflight() or self._gate(seq)
        if why:
            return Result(False, ms(), why)
        r = self.dash.load_task(task_path)
        if not r.startswith("Loaded task"):
            return Result(False, ms(), f"Task {task_path} non caricato: {r}")
        r = self.dash.play()
        seen_running = False
        while time.monotonic() - t0 < timeout_s:
            st, safety = self.dash.task_status(), self.dash.safety_mode()
            if safety != "NORMAL":
                self.stop()
                return Result(False, ms(), f"Fermato: il controller segnala {safety}.", {"safety": safety})
            if st == "running":
                seen_running = True
            elif st == "stopped" and seen_running:
                return Result(True, ms())
            elif st == "stopped" and ms() > 2000:
                return Result(False, ms(), f"Il task non è partito ({r}).")
            time.sleep(0.1)
        self.stop()
        return Result(False, ms(), f"Timeout dopo {timeout_s:.0f} s: fermato.")

    # --- movimento lineare --------------------------------------------------------------------------------------
    def move_linear(self, target_base_m: list[float], speed_m_s: float, timeout_s: float = 10.0) -> Result:
        """Un `movel` verso il target nel frame base (m + rad). I controlli di geofence e cinematica si fanno PRIMA,
        nell'adapter; qui si rifanno solo i limiti di velocità (movel_script) e lo stato del controller."""
        t0 = time.monotonic()
        ms = lambda: int((time.monotonic() - t0) * 1000)  # noqa: E731
        if self.mode == "armed":
            why = self.preflight()
            if why:
                return Result(False, ms(), why)
        start = self.pose_base_m() if self.mode != "dry-run" else list(target_base_m)
        script = build_movel_script(target_base_m, speed_m_s, 0.3, start_pose_base_m=start).rstrip("\n")
        seq = f"Primary {self.host}:{self.ports[1]} script:\n{script}"
        if self.mode != "armed":
            self.log(f"[{self.mode}] {seq}")
            return Result(self.mode == "dry-run", ms(), None if self.mode == "dry-run" else "read-only: niente movel",
                          {"script": script})
        why = self._gate(seq)
        if why:
            return Result(False, ms(), why, {"script": script})
        self.primary.send_movel(script)
        stable_since = None
        while time.monotonic() - t0 < timeout_s:
            time.sleep(0.05)
            safety = self.dash.safety_mode()
            if safety != "NORMAL":
                self.stop()
                return Result(False, ms(), f"Fermato: il controller segnala {safety}.", {"script": script})
            p = self.pose_base_m()
            err = math.dist(p[:3], target_base_m[:3])
            if err < POSE_TOL_M:
                stable_since = stable_since or time.monotonic()
                if time.monotonic() - stable_since > 0.2:
                    moved = math.dist(p[:3], start[:3]) * 1000
                    return Result(True, ms(), None, {"script": script, "final_pose": p, "error_mm": err * 1000,
                                                     "moved_mm": moved})
            else:
                stable_since = None
        self.stop()
        p = self.pose_base_m()
        return Result(False, ms(), "Timeout del movimento: fermato.",
                      {"script": script, "final_pose": p, "error_mm": math.dist(p[:3], target_base_m[:3]) * 1000})

    # --- stop ----------------------------------------------------------------------------------------------------
    def stop(self) -> bool:
        """Ferma subito il programma con una connessione Dashboard dedicata. NON è una funzione di sicurezza."""
        if self.mode == "dry-run":
            self.log("[dry-run] > stop")
            return True
        d = DashboardClient(self.host, self.ports[0], "read-only", connect_timeout=1.0, reply_timeout=1.0,
                            log=self.log)
        try:
            d.connect()
            d.stop()
            return True
        except Exception as e:  # pragma: no cover - rete
            self.log(f"stop fallito: {e}")
            return False
        finally:
            d.close()
