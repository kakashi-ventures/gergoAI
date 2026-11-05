"""Porta Primary (TCP 30001) dei controller Elite serie CS: lettura di MDH e TCP, invio dello script `movel`.

Fonte: Elite_Robots_CS_SDK v1.5.0
- framing: `include/Primary/PrimaryPort.hpp:28-32` (header 5 byte: uint32 lunghezza + uint8 tipo; 16 = stato,
  20 = eccezione), `source/Primary/PrimaryPort.cpp:426-444` (sotto-pacchetti uint32 lunghezza + uint8 tipo);
- KinematicsInfo, sotto-tipo 6: `include/Primary/RobotConfPackage.hpp:42-43` e `source/Primary/RobotConfPackage.cpp:51-64`
  (a, d, alpha in m e rad, a partire dall'offset 237);
- Cartesian data, sotto-tipo 4: `doc/UserGuide/en/How-to-Parser-30001.en.md` (posa TCP 6 double, poi offset TCP
  6 double);
- invio script: `source/Primary/PrimaryPort.cpp:67-80` (testo + "\\n"), formato `def nome():` + righe con tab + `end`
  (`source/Elite/EliteDriver.cpp:208-215`).

L'unico script che questo modulo accetta di inviare è un singolo `movel` costruito da `movel_script` e ricontrollato
con una regex: niente altro passa (accensione, freni, payload, TCP, collisione restano sul pendant).
"""
from __future__ import annotations

import math
import re
import socket
import struct
import threading
import time
from dataclasses import dataclass
from typing import Callable, Optional

PRIMARY_PORT = 30001
STATE_MSG, EXCEPTION_MSG = 16, 20
SUB_ROBOT_MODE, SUB_CARTESIAN, SUB_CONFIG = 0, 4, 6
DH_PARAM_OFFSET = 4 + 1 + 8 * 2 * 6 + 8 * 2 * 6 + 8 * 5  # = 237

MAX_SPEED_M_S = 0.1     # MOTION_SAFETY.md §2.7: massimo 100 mm/s in demo
MAX_ACC_M_S2 = 0.5
_NUM = r"-?\d+\.\d{6}"
MOVEL_RE = re.compile(
    rf"^def gergo_sposta\(\):\n\tmovel\(\[{_NUM}, {_NUM}, {_NUM}, {_NUM}, {_NUM}, {_NUM}\], "
    rf"a={_NUM}, v={_NUM}\)\nend$")


@dataclass
class Cartesian:
    pose: list[float]        # m + rad, base
    tcp_offset: list[float]  # m + rad, flangia → TCP


@dataclass
class Mdh:
    a: list[float]
    d: list[float]
    alpha: list[float]


def movel_script(target_base_m: list[float], speed_m_s: float, acc_m_s2: float = 0.3) -> str:
    """Script CS con un solo movel. Rifiuta velocità e accelerazioni oltre i limiti della demo."""
    if len(target_base_m) != 6 or not all(math.isfinite(v) for v in target_base_m):
        raise ValueError("posa non valida")
    if not (0 < speed_m_s <= MAX_SPEED_M_S):
        raise ValueError(f"velocità fuori limite: {speed_m_s} m/s (max {MAX_SPEED_M_S})")
    if not (0 < acc_m_s2 <= MAX_ACC_M_S2):
        raise ValueError(f"accelerazione fuori limite: {acc_m_s2} m/s² (max {MAX_ACC_M_S2})")
    p = ", ".join(f"{v:.6f}" for v in target_base_m)
    s = f"def gergo_sposta():\n\tmovel([{p}], a={acc_m_s2:.6f}, v={speed_m_s:.6f})\nend"
    assert MOVEL_RE.match(s), s
    return s


def parse_state(body: bytes) -> dict:
    """Decodifica i sotto-pacchetti che ci servono da un messaggio di stato (tipo 16)."""
    out: dict = {}
    off = 0
    while off + 5 <= len(body):
        sub_len, sub_type = struct.unpack_from(">IB", body, off)
        if sub_len <= 5 or off + sub_len > len(body):
            break
        sub = body[off:off + sub_len]
        if sub_type == SUB_CARTESIAN and sub_len >= 5 + 96:
            v = struct.unpack_from(">12d", sub, 5)
            out["cartesian"] = Cartesian(list(v[:6]), list(v[6:]))
        elif sub_type == SUB_CONFIG and sub_len >= DH_PARAM_OFFSET + 144:
            v = struct.unpack_from(">18d", sub, DH_PARAM_OFFSET)
            out["mdh"] = Mdh(list(v[:6]), list(v[6:12]), list(v[12:]))
        elif sub_type == SUB_ROBOT_MODE and sub_len >= 53:
            # cpp PrimaryStatePackage.cpp: len, type, timestamp u64, 2 riservati, power_on, estop, protective,
            # task_running, task_paused, robot_mode
            flags = struct.unpack_from(">7B", sub, 5 + 8)
            out["robot_mode"] = {
                "power_on": bool(flags[2]), "emergency_stopped": bool(flags[3]),
                "protective_stopped": bool(flags[4]), "task_running": bool(flags[5]),
                "task_paused": bool(flags[6]), "robot_mode": sub[5 + 8 + 7],
            }
        off += sub_len
    return out


class PrimaryClient:
    def __init__(self, host: str, port: int = PRIMARY_PORT, mode: str = "dry-run", timeout: float = 3.0,
                 log: Optional[Callable[[str], None]] = None):
        self.host, self.port, self.mode, self.timeout = host, port, mode, timeout
        self.state: dict = {}
        self.state_t = 0.0
        self.exceptions: list[bytes] = []
        self._sock: Optional[socket.socket] = None
        self._lock = threading.Lock()
        self._running = False
        self._log = log or (lambda s: None)

    def connect(self) -> None:
        self._sock = socket.create_connection((self.host, self.port), timeout=self.timeout)
        self._running = True
        threading.Thread(target=self._loop, daemon=True).start()

    def _recv_exact(self, n: int) -> bytes:
        assert self._sock
        buf = b""
        while len(buf) < n:
            c = self._sock.recv(n - len(buf))
            if not c:
                raise ConnectionError("primary: connessione chiusa")
            buf += c
        return buf

    def _loop(self) -> None:
        try:
            while self._running:
                n, t = struct.unpack(">IB", self._recv_exact(5))
                body = self._recv_exact(n - 5)
                if t == STATE_MSG:
                    parsed = parse_state(body)
                    if parsed:
                        self.state.update(parsed)
                        self.state_t = time.monotonic()
                elif t == EXCEPTION_MSG:
                    self.exceptions.append(body)
                    self._log(f"primary: eccezione dal controller ({len(body)} byte)")
        except (OSError, ConnectionError, struct.error):
            self._running = False

    def wait_for(self, key: str, timeout: float = 3.0):
        t0 = time.monotonic()
        while time.monotonic() - t0 < timeout:
            if key in self.state:
                return self.state[key]
            time.sleep(0.02)
        raise TimeoutError(f"primary: {key} non ricevuto")

    def send_movel(self, script: str) -> None:
        if not MOVEL_RE.match(script):
            raise PermissionError("primary: si invia solo uno script movel costruito da movel_script")
        if self.mode != "armed":
            self._log(f"[{self.mode}] script non inviato:\n{script}")
            return
        with self._lock:
            assert self._sock, "primary non connessa"
            self._log("> script\n" + script)
            self._sock.sendall((script + "\n").encode())

    def close(self) -> None:
        self._running = False
        if self._sock:
            self._sock.close()
            self._sock = None
