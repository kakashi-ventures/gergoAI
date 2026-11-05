"""Bridge locale: legge i command confermati, li rivalida, li esegue uno alla volta e scrive il registro.

    python -m bridge.main --mode sim|elite [--inject slow:applica|fail:solleva] [--dry-run] [--memory]

Regole: un solo command in esecuzione · timeout per skill · ogni rifiuto diventa un event "anomaly" · nessun
movimento se audio_guard non dà segni di vita da più di 1 s · tasto `s` = STOP (cancella la coda, adapter.stop()).
Lo stop software non è l'e-stop: l'e-stop è fisico ed è dello staff.
"""
from __future__ import annotations

import argparse
import os
import sys
import threading
import time
from datetime import datetime, timezone
from typing import Optional

from bridge import motion
from bridge.adapters.base import RobotAdapter
from bridge.contracts import VELOCITA_DEFAULT_MM_S, Workspace
from bridge.store import MemoryStore, Store, SupabaseStore
from bridge.validator import Context, StationState, validate

TIMEOUT_S = {"solleva": 20, "deposita": 20, "porta": 20, "applica": 15, "home": 20, "sposta": 15}
GUARD_GRACE_S = 1.0
HEARTBEAT_S = 2.0
POLL_S = 0.5
POSE_TOLERANCE_MM = 1.0


def _parse_ts(v) -> Optional[datetime]:
    if not v:
        return None
    if isinstance(v, datetime):
        return v
    return datetime.fromisoformat(str(v).replace("Z", "+00:00"))


class Bridge:
    def __init__(self, store: Store, adapter: RobotAdapter, mode: str, bridge_id: str = "pavia-postazione-1"):
        self.store, self.adapter, self.mode, self.bridge_id = store, adapter, mode, bridge_id
        self.station = StationState()
        self.speed = VELOCITA_DEFAULT_MM_S
        self.last_command_id: Optional[str] = None
        self.last_guard_alive = 0.0
        self._ont: Optional[dict] = None
        self._ont_at = 0.0
        self.lock = threading.Lock()
        self.stop_count = 0  # il composer interrompe la routine se cambia

    # ------------------------------------------------------------------ helpers
    def ontology(self, max_age_s: float = 5.0) -> dict:
        if self._ont is None or time.monotonic() - self._ont_at > max_age_s:
            self._ont = self.store.ontology()
            self._ont_at = time.monotonic()
        return self._ont

    def guard_ok(self) -> bool:
        alive = False
        try:
            alive = bool(self.adapter.guard_alive())
        except Exception:
            alive = False
        if not alive:
            try:
                g = self.store.guard_status(self.bridge_id)
                if g and g.get("alive"):
                    ts = _parse_ts(g.get("last_heartbeat_at"))
                    alive = ts is not None and (datetime.now(timezone.utc) - ts).total_seconds() <= GUARD_GRACE_S
            except Exception:
                alive = False
        if alive:
            self.last_guard_alive = time.monotonic()
        return time.monotonic() - self.last_guard_alive <= GUARD_GRACE_S

    def event(self, type_: str, cmd: Optional[dict] = None, **payload) -> None:
        ev = {"type": type_, "payload": payload}
        if cmd:
            ev["command_id"] = cmd["id"]
            if cmd.get("routine_run_id"):
                ev["routine_run_id"] = cmd["routine_run_id"]
            if cmd.get("step") is not None:
                ev["step"] = cmd["step"]
        self.store.insert_event(ev)

    def heartbeat(self) -> None:
        ont = self._ont or {}
        pose = None
        try:
            pose = list(self.adapter.read_pose().xyz)
        except Exception:
            pass
        self.store.upsert_bridge_status({
            "bridge_id": self.bridge_id, "mode": self.mode, "ontology_version": ont.get("version"),
            "adapter": self.adapter.name, "last_command_id": self.last_command_id,
            "velocita_mm_s": self.speed, "guard_alive": self.guard_ok(),
            "station": {"fork_loaded": self.station.fork_loaded, "at": self.station.at}, "pose_mm": pose,
        })

    def emergency_stop_software(self, source: str = "tasto") -> None:
        """Stop software: ferma il programma e cancella la coda. Non è l'e-stop."""
        self.stop_count += 1
        self.adapter.stop()
        n = self.store.cancel_pending()
        self.event("stop", source=source, cancelled=n)

    # ------------------------------------------------------------------ esecuzione
    def context(self, skill: str) -> Context:
        ont = self.ontology()
        ws = ont.get("workspace")
        workspace = None
        if ws and (self.mode == "sim" or ws.get("source") == "taught"):
            workspace = Workspace(frame=ws["frame"], min_mm=ws["min_mm"], max_mm=ws["max_mm"])
        ctx = Context(
            mode=self.mode, skills={s["name"]: s for s in ont["skills"]}, places=set(ont["places"]),
            ontology_status=ont.get("status", "draft"), station=self.station, speed_mm_s=self.speed,
            workspace=workspace, guard_alive=self.guard_ok(),
        )
        if skill == "sposta":
            try:
                ctx.pose = self.adapter.read_pose()
            except Exception:
                ctx.pose = None
            tool = ont.get("tool")
            if tool:
                ctx.tool_expected_tcp_mm = tuple(tool["tcp_atteso_mm"])
                try:
                    ctx.tool_actual_tcp_mm = tuple(self.adapter.read_tcp_mm())
                except Exception:
                    ctx.tool_actual_tcp_mm = None
        return ctx

    def execute(self, cmd: dict) -> bool:
        with self.lock:
            return self._execute(cmd)

    def _execute(self, cmd: dict) -> bool:
        skill = cmd["skill"]
        self.last_command_id = cmd["id"]
        if skill == "stop":
            self.emergency_stop_software(source="command")
            self.store.update_command(cmd["id"], {"status": "done"})
            return True

        ctx = self.context(skill)
        d = validate(cmd, ctx)
        if d.motion_check is not None and not d.ok:
            self.event("motion_check", cmd, **d.motion_check)
        if not d.ok:
            self.store.update_command(cmd["id"], {"status": "failed"})
            self.event("anomaly", cmd, kind="validator_reject", code=d.code, reason=d.reason, skill=skill)
            return False

        if skill in ("piu_piano", "piu_veloce"):
            old, self.speed = self.speed, motion.next_speed(self.speed, skill)
            self.event("speed_change", cmd, da_mm_s=old, a_mm_s=self.speed)
            self.store.update_command(cmd["id"], {"status": "done"})
            return True

        self.store.update_command(cmd["id"], {"status": "running", "started_at": datetime.now(timezone.utc).isoformat()})
        if skill == "sposta":
            return self._sposta(cmd, ctx, d)

        self.event("step_start", cmd, skill=skill, params=cmd.get("params", {}))
        r = self.adapter.run_task(skill, cmd.get("params", {}), TIMEOUT_S.get(skill, 20))
        self._finish(cmd, r.ok, r.duration_ms, r.error, skill, **r.details)
        if r.ok:
            self.station.apply(skill, cmd.get("params", {}))
            if self.mode == "elite" and self.adapter.status().mode == "armed":
                self.store.set_skill_real_ok(self.ontology()["version"], skill)
        return r.ok

    def _sposta(self, cmd: dict, ctx: Context, d) -> bool:
        check = dict(d.motion_check)
        lc = self.adapter.check_line(ctx.pose, d.target)
        check["kinematics_ok"] = lc.ok
        if not lc.ok:
            check["kinematics_reason"] = lc.reason
            check["ok"] = False
            check["reason"] = lc.reason
        self.event("motion_check", cmd, **check)
        if not lc.ok:
            self.store.update_command(cmd["id"], {"status": "failed"})
            self.event("anomaly", cmd, kind="kinematics_reject", code="kinematics", reason=lc.reason, skill="sposta")
            return False
        if not self.guard_ok():  # ricontrollo subito prima di muovere
            self.store.update_command(cmd["id"], {"status": "failed"})
            self.event("anomaly", cmd, kind="validator_reject", code="guard_dead",
                       reason="l'arresto acustico non è attivo: nessun movimento", skill="sposta")
            return False
        self.event("step_start", cmd, skill="sposta", params=cmd.get("params", {}), target_mm=list(d.target.xyz),
                   velocita_mm_s=self.speed)
        r = self.adapter.move_linear(d.target, self.speed, TIMEOUT_S["sposta"])
        err_mm = None
        ok = r.ok
        if r.ok:
            real = self.adapter.read_pose()
            err_mm = max(abs(a - b) for a, b in zip(real.xyz, d.target.xyz))
            ok = err_mm < POSE_TOLERANCE_MM
            moved = [round(a - b, 2) for a, b in zip(real.xyz, ctx.pose.xyz)]
            self._finish(cmd, ok, r.duration_ms, None if ok else f"errore di posa {err_mm:.1f} mm", "sposta",
                         spostamento_reale_mm=moved, errore_mm=round(err_mm, 2))
        else:
            self._finish(cmd, False, r.duration_ms, r.error, "sposta")
        return ok

    def _finish(self, cmd, ok, duration_ms, error, skill, **extra):
        self.event("step_end", cmd, skill=skill, ok=ok, duration_ms=duration_ms, error=error, **extra)
        self.store.update_command(cmd["id"], {"status": "done" if ok else "failed",
                                              "finished_at": datetime.now(timezone.utc).isoformat()})
        if not ok:
            st = self.adapter.status()
            self.event("anomaly", cmd, kind="step_failed", skill=skill, reason=error, adapter=st.details)

    def poll_once(self) -> int:
        cmds = self.store.confirmed_commands()
        if cmds:
            self.execute(cmds[0])  # uno alla volta
        return len(cmds)


# ---------------------------------------------------------------------- CLI

def _stop_key_thread(bridge: Bridge) -> None:
    def run():
        try:
            import termios
            import tty
            fd = sys.stdin.fileno()
            old = termios.tcgetattr(fd)
            tty.setcbreak(fd)
            try:
                while True:
                    if sys.stdin.read(1).lower() == "s":
                        print("\nSTOP")
                        bridge.emergency_stop_software(source="tasto")
            finally:
                termios.tcsetattr(fd, termios.TCSADRAIN, old)
        except Exception:
            for line in sys.stdin:
                if line.strip().lower() == "s":
                    bridge.emergency_stop_software(source="tasto")
    if sys.stdin and sys.stdin.isatty():
        threading.Thread(target=run, daemon=True).start()


def make_adapter(mode: str, inject, dry_run: bool, sim_guard: bool) -> RobotAdapter:
    if mode == "sim":
        from bridge.adapters.sim import SimArm
        return SimArm(inject=inject, guard=sim_guard)
    if dry_run:
        from bridge.adapters.dryrun import DryRunElite
        return DryRunElite(guard=sim_guard)
    return elite_adapter_from_env()


def elite_adapter_from_env(env=None) -> RobotAdapter:
    """--mode elite senza --dry-run: SEMPRE l'adapter CS di BRACCIO, mai un ripiego silenzioso sul dry-run.

    Se gergo_sdk non è installato o la serie non è CS, il bridge si ferma con un errore leggibile.
    ELITE_MODE (dry-run | read-only | armed) decide se il controller riceve comandi: il default resta dry-run.
    """
    env = os.environ if env is None else env
    series = (env.get("ELITE_SERIES") or "CS").strip().upper()
    if series != "CS":
        raise SystemExit(f"ELITE_SERIES={series}: in sala il braccio è CS (sdk/ELITE_NOTES.md); "
                         "l'adapter EC non è implementato")
    try:
        from bridge.adapters.elite import EliteCsAdapter  # di BRACCIO
    except ImportError as e:
        raise SystemExit(f"adapter Elite non importabile ({e}): esegui `pip install -e sdk`") from e
    ports = {k: int(env[v]) for k, v in (("dashboard_port", "ELITE_DASHBOARD_PORT"),
                                         ("primary_port", "ELITE_PRIMARY_PORT"),
                                         ("rtsi_port", "ELITE_RTSI_PORT")) if env.get(v)}
    adapter = EliteCsAdapter(host=env.get("ELITE_HOST") or None, mode=env.get("ELITE_MODE") or "dry-run",
                             guard_heartbeat_file=env.get("GERGO_GUARD_HEARTBEAT") or None, **ports)
    print(f"adapter elite-cs · host {adapter.cs.host} · ELITE_MODE {adapter.cs.mode}")
    return adapter


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="python -m bridge.main")
    ap.add_argument("--mode", choices=["sim", "elite"], default="sim")
    ap.add_argument("--inject", action="append", default=[], help="slow:<skill> | fail:<skill>")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--memory", action="store_true", help="store in memoria, senza Supabase")
    ap.add_argument("--no-sim-guard", action="store_true", help="in sim, considera audio_guard assente")
    ap.add_argument("--once", action="store_true", help="un solo giro di polling (per i check)")
    args = ap.parse_args(argv)

    store: Store = MemoryStore() if args.memory else SupabaseStore()
    # in elite la guardia la dà solo il processo audio_guard (via adapter o guard_status)
    sim_guard = args.mode == "sim" and not args.no_sim_guard
    adapter = make_adapter(args.mode, args.inject, args.dry_run, sim_guard)
    adapter.connect()
    bridge = Bridge(store, adapter, args.mode, os.environ.get("BRIDGE_ID", "pavia-postazione-1"))
    bridge.ontology()
    print(f"bridge {bridge.bridge_id} · mode {args.mode} · adapter {adapter.name} · "
          f"ontologia v{bridge._ont['version']} ({bridge._ont['status']}) · tasto s = STOP")

    stop_hb = threading.Event()

    def hb():
        while not stop_hb.is_set():
            try:
                bridge.heartbeat()
            except Exception as e:
                print("heartbeat:", e)
            stop_hb.wait(HEARTBEAT_S)
    threading.Thread(target=hb, daemon=True).start()
    _stop_key_thread(bridge)

    from bridge.composer import Composer
    composer = Composer(store, bridge)

    try:
        while True:
            try:
                n = composer.poll_once() + bridge.poll_once()
            except Exception as e:
                print("poll:", e)
                n = 0
            if args.once:
                break
            if not n:
                time.sleep(POLL_S)
    except KeyboardInterrupt:
        bridge.adapter.stop()
    finally:
        stop_hb.set()
        try:
            bridge.heartbeat()
        except Exception:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
