"""Finto controller Elite serie CS: Dashboard 29999, Primary 30001, RTSI 30004 (porte configurabili).

Riproduce i formati dell'SDK CS (vedi dashboard.py, primary.py, rtsi.py) con una cinematica finta ma coerente:
la posa del TCP si sposta in linea retta alla velocità del `movel`, i giunti seguono con `kinematics.ik_near` se
disponibile. Scenari iniettabili: `not_remote`, `protective_stop_mid_move`, `estop_mid_move`, `power_off`,
`task_never_ends`, `missing_task`. Nessun test tocca il robot vero.

`python -m gergo_sdk.mock --dashboard 29999 --primary 30001 --rtsi 30004`
"""
from __future__ import annotations

import argparse
import math
import re
import socket
import socketserver
import struct
import threading
import time
from typing import Optional

from gergo_sdk import primary as prim
from gergo_sdk import rtsi as rt

try:
    from gergo_sdk import kinematics as kin
except Exception:  # pragma: no cover
    kin = None

HOME_Q = [0.0, -1.5708, 1.5708, -1.5708, -1.5708, 0.0]
_N = kin.CS66_NOMINAL_MDH if kin else None
DEFAULT_MDH = (list(_N.a), list(_N.d), list(_N.alpha)) if _N else ([0.0] * 6, [0.0] * 6, [0.0] * 6)  # a, d, alpha
ROBOT_MODE_CODE = {"POWER_OFF": 3, "IDLE": 5, "RUNNING": 7}


class MockState:
    def __init__(self, scenarios: Optional[set[str]] = None, task_duration_s: float = 2.0):
        self.scenarios = scenarios or set()
        self.lock = threading.Lock()
        self.robot_mode = "POWER_OFF" if "power_off" in self.scenarios else "RUNNING"
        self.safety = "NORMAL"
        self.remote = "LOCAL" if "not_remote" in self.scenarios else "REMOTE"
        self.task_path = ""
        self.task_state = "stopped"
        self.task_started = 0.0
        self.task_duration_s = task_duration_s
        self.tasks = {"solleva_INGRESSO.task", "deposita_USCITA.task", "home.task"}
        if "missing_task" in self.scenarios:
            self.tasks = set()
        self.mdh = DEFAULT_MDH
        self.tcp_offset = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
        self.q = list(HOME_Q)
        self.pose = self._fk(self.q) or [0.4, -0.1, 0.4, math.pi, 0.0, 0.0]
        self.motion: Optional[dict] = None
        self.commands: list[str] = []
        self.scripts: list[str] = []

    def _fk(self, q):
        if kin is None:
            return None
        try:
            m = kin.MDH(alpha=tuple(self.mdh[2]), a=tuple(self.mdh[0]), d=tuple(self.mdh[1]))
            f = kin.fk(m, q)
            return list(f[:3]) + list(kin.rotvec_to_rpy(f[3:6]))  # come il CS63: orientamento in RPY
        except Exception:
            return None

    def _ik(self, pose, q_ref):
        if kin is None:
            return q_ref
        try:
            m = kin.MDH(alpha=tuple(self.mdh[2]), a=tuple(self.mdh[0]), d=tuple(self.mdh[1]))
            return list(kin.ik_near(m, kin.controller_pose_to_rotvec(pose), q_ref) or q_ref)
        except Exception:
            return q_ref

    # --- avanzamento del tempo ---------------------------------------------------------------------------------
    def tick(self) -> None:
        with self.lock:
            now = time.monotonic()
            if self.task_state == "running" and "task_never_ends" not in self.scenarios:
                if now - self.task_started >= self.task_duration_s:
                    self.task_state = "stopped"
            m = self.motion
            if m:
                frac = min(1.0, (now - m["t0"]) * m["v"] / max(m["dist"], 1e-9))
                if "protective_stop_mid_move" in self.scenarios and frac >= 0.5:
                    self.safety, self.motion = "PROTECTIVE_STOP", None
                    return
                if "estop_mid_move" in self.scenarios and frac >= 0.5:
                    self.safety, self.robot_mode, self.motion = "ROBOT_EMERGENCY_STOP", "POWER_OFF", None
                    return
                p = [m["start"][i] + (m["target"][i] - m["start"][i]) * frac for i in range(3)] + m["target"][3:]
                self.pose = p
                # IK costosa: al massimo ogni 100 ms e alla fine del movimento
                if frac >= 1.0 or now - m.get("ik_t", 0.0) > 0.1:
                    self.q, m["ik_t"] = self._ik(p, self.q), now
                if frac >= 1.0:
                    self.motion = None
                    self.task_state = "stopped"

    def start_movel(self, target, v) -> None:
        with self.lock:
            dist = math.dist(self.pose[:3], target[:3])
            self.motion = {"start": list(self.pose), "target": list(target), "v": v, "dist": dist,
                           "t0": time.monotonic()}
            self.task_state = "running"

    def halt(self) -> None:
        with self.lock:
            self.motion = None
            self.task_state = "stopped"


# --- Dashboard ---------------------------------------------------------------------------------------------------
# Benvenuto su 4 righe, byte per byte come quello letto dal CS63 in sala (05/11): un client che ne consuma una sola
# legge le righe d'aiuto come risposte ai comandi successivi.
BANNER = (b"EliRobot dashboard shell, version 2.15.0.0.\r\n"
          b"These shell commands are defined internally.  Type `help` to see this list.\r\n"
          b"Type `help name` to find out more about the function `name`.\r\n"
          b"Type `usage name` to displays the usage for given command or all commands if none is specified.\r\n")


def dashboard_reply(st: MockState, cmd: str) -> str:
    st.commands.append(cmd)
    st.tick()
    if cmd == "echo":
        return "Hello ELITE ROBOTS."
    if cmd == "robotMode":
        return f"robotMode: {st.robot_mode}"
    if cmd == "safety -s":
        return f"Safety status: {st.safety}"
    if cmd == "remoteControl -s":
        return st.remote
    if cmd == "remoteControl -status":
        return "true" if st.remote == "REMOTE" else "false"
    if cmd == "version":  # risposta su 4 righe, come il CS63 in sala (05/11, controller 2.15.0.477)
        return "Project: RT ROBOT\r\nVersion: 2.15.0.477\r\nBuildDate: 2026-01-16 06:45:14\r\nCommitHashInfo: 00cb5e6"
    if cmd == "robot -t":
        return "CS66"
    if cmd == "task":
        return f"Relative path:{st.task_path}"
    if cmd == "task -s":
        return f"Task is {st.task_state}"
    if cmd == "status":
        return f"RunningStatus: {st.task_state.upper()}"
    m = re.match(r"^task -p (\S+)$", cmd)
    if m:
        if m.group(1) not in st.tasks:
            return f"Failed to load task: {m.group(1)}"
        st.task_path = m.group(1)
        return f"Loaded task: {st.task_path}"
    if cmd == "play":
        if st.remote != "REMOTE" or not st.task_path or st.safety != "NORMAL":
            return "Failed to execute: play"
        with st.lock:
            st.task_state, st.task_started = "running", time.monotonic()
        return "Starting task"
    if cmd == "pause":
        st.task_state = "paused"
        return "Pausing task"
    if cmd == "stop":
        st.halt()
        return "Stopped"
    return f"Unknown command: {cmd}"


class _DashHandler(socketserver.StreamRequestHandler):
    def handle(self):
        st: MockState = self.server.state  # type: ignore[attr-defined]
        self.wfile.write(BANNER)
        for raw in self.rfile:
            cmd = raw.decode().strip()
            if not cmd:
                continue
            self.wfile.write((dashboard_reply(st, cmd) + "\r\n").encode())


# --- Primary -------------------------------------------------------------------------------------------------------
def state_message(st: MockState) -> bytes:
    rm = struct.pack(">IBQBBBBBBBB", 0, 0, int(time.time() * 1000), 0, 0,
                     int(st.robot_mode != "POWER_OFF"), int("EMERGENCY" in st.safety),
                     int(st.safety == "PROTECTIVE_STOP"), int(st.task_state == "running"),
                     int(st.task_state == "paused"), ROBOT_MODE_CODE.get(st.robot_mode, 0))
    rm += b"\x00" * (53 - len(rm))
    rm = struct.pack(">I", len(rm)) + rm[4:]
    cart = struct.pack(">IB12d", 5 + 96, prim.SUB_CARTESIAN, *st.pose, *st.tcp_offset)
    cfg_body = b"\x00" * (prim.DH_PARAM_OFFSET - 5) + struct.pack(">18d", *st.mdh[0], *st.mdh[1], *st.mdh[2])
    cfg = struct.pack(">IB", 5 + len(cfg_body), prim.SUB_CONFIG) + cfg_body
    body = rm + cart + cfg
    return struct.pack(">IB", 5 + len(body), prim.STATE_MSG) + body


class _PrimaryHandler(socketserver.BaseRequestHandler):
    def handle(self):
        st: MockState = self.server.state  # type: ignore[attr-defined]
        sock = self.request
        sock.settimeout(0.05)
        buf = b""
        try:
            while True:
                st.tick()
                sock.sendall(state_message(st))
                try:
                    c = sock.recv(65536)
                    if not c:
                        return
                    buf += c
                except socket.timeout:
                    pass
                while b"\nend\n" in buf:
                    script, buf = buf.split(b"\nend\n", 1)
                    script = script.decode() + "\nend"
                    st.scripts.append(script)
                    m = re.search(r"movel\(\[([^\]]+)\], a=([\d.]+), v=([\d.]+)\)", script)
                    if m and st.safety == "NORMAL" and st.robot_mode == "RUNNING":
                        st.start_movel([float(x) for x in m.group(1).split(",")], float(m.group(3)))
                time.sleep(0.05)
        except OSError:
            return


# --- RTSI ----------------------------------------------------------------------------------------------------------
RTSI_TYPES = {"timestamp": "DOUBLE", "actual_joint_positions": "VECTOR6D", "actual_TCP_pose": "VECTOR6D",
              "robot_mode": "INT32", "safety_status": "INT32", "runtime_state": "UINT32", "speed_scaling": "DOUBLE"}


class _RtsiHandler(socketserver.BaseRequestHandler):
    def _recv(self, n):
        b = b""
        while len(b) < n:
            c = self.request.recv(n - len(b))
            if not c:
                raise ConnectionError
            b += c
        return b

    def handle(self):
        st: MockState = self.server.state  # type: ignore[attr-defined]
        names: list[str] = []
        try:
            while True:
                size, t = struct.unpack(">HB", self._recv(3))
                body = self._recv(size - 3)
                if t == rt.V:
                    self.request.sendall(rt.pack(rt.V, b"\x01"))
                elif t == rt.O:
                    names = body[8:].decode().split(",")
                    types = [RTSI_TYPES.get(n, "NOT_FOUND") for n in names]
                    self.request.sendall(rt.pack(rt.O, b"\x01" + ",".join(types).encode()))
                elif t == rt.S:
                    self.request.sendall(rt.pack(rt.S, b"\x01"))
                    break
            while True:
                st.tick()
                vals = {"timestamp": time.monotonic(), "actual_joint_positions": st.q, "actual_TCP_pose": st.pose,
                        "robot_mode": ROBOT_MODE_CODE.get(st.robot_mode, 0), "safety_status": 1,
                        "runtime_state": 2 if st.task_state == "running" else 1, "speed_scaling": 1.0}
                payload = b"\x01"
                for n in names:
                    fmt = rt.TYPES[RTSI_TYPES[n]][0]
                    v = vals[n]
                    payload += struct.pack(fmt, *(list(v) if isinstance(v, (list, tuple)) else [v]))
                self.request.sendall(rt.pack(rt.U, payload))
                time.sleep(0.02)
        except (OSError, ConnectionError):
            return


class _Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


class MockController:
    """Avvia i tre server su porte libere (0 = scelta dal sistema)."""

    def __init__(self, scenarios: Optional[set[str]] = None, host: str = "127.0.0.1",
                 ports: tuple[int, int, int] = (0, 0, 0), task_duration_s: float = 0.5):
        self.state = MockState(scenarios, task_duration_s)
        self.servers = []
        for handler, port in zip((_DashHandler, _PrimaryHandler, _RtsiHandler), ports):
            s = _Server((host, port), handler)
            s.state = self.state  # type: ignore[attr-defined]
            threading.Thread(target=s.serve_forever, daemon=True).start()
            self.servers.append(s)
        self.host = host
        self.dashboard_port, self.primary_port, self.rtsi_port = (s.server_address[1] for s in self.servers)

    def close(self) -> None:
        for s in self.servers:
            s.shutdown()
            s.server_close()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dashboard", type=int, default=29999)
    ap.add_argument("--primary", type=int, default=30001)
    ap.add_argument("--rtsi", type=int, default=30004)
    ap.add_argument("--scenario", action="append", default=[])
    a = ap.parse_args()
    m = MockController(set(a.scenario), ports=(a.dashboard, a.primary, a.rtsi), task_duration_s=2.0)
    print(f"mock CS su 127.0.0.1: dashboard {m.dashboard_port}, primary {m.primary_port}, rtsi {m.rtsi_port}")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        m.close()


if __name__ == "__main__":
    main()
