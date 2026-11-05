"""Lettore RTSI minimale (TCP 30004) per i controller Elite serie CS: solo uscite, solo lettura.

Fonte: Elite_Robots_CS_SDK v1.5.0 — `include/Rtsi/RtsiClient.hpp:161-168` (tipi di pacchetto),
`source/Rtsi/RtsiClient.cpp:50-215` (versione, setup outputs, start, data package),
`source/Rtsi/RtsiRecipeInternal.cpp:20-50` (tipi). Header: uint16 lunghezza totale + uint8 tipo, big-endian.
Unità: `actual_TCP_pose` in m + rad (rotation vector), `actual_joint_positions` in rad
(doc/UserGuide/en/Let-Robot-Move.en.md:437-441).
"""
from __future__ import annotations

import socket
import struct
import threading
import time
from typing import Any, Optional

RTSI_PORT = 30004
V, O, S, P, U, M = 86, 79, 83, 80, 85, 77

TYPES = {
    "VECTOR6D": (">6d", 48), "VECTOR3D": (">3d", 24), "DOUBLE": (">d", 8), "UINT32": (">I", 4),
    "UINT64": (">Q", 8), "INT32": (">i", 4), "UINT8": (">B", 1), "BOOL": (">?", 1), "UINT16": (">H", 2),
    "VECTOR6INT32": (">6i", 24), "VECTOR6UINT32": (">6I", 24),
}
DEFAULT_OUTPUTS = ["timestamp", "actual_joint_positions", "actual_TCP_pose", "robot_mode", "safety_status",
                   "runtime_state", "speed_scaling"]


def pack(ptype: int, payload: bytes = b"") -> bytes:
    return struct.pack(">HB", 3 + len(payload), ptype) + payload


def decode(types: list[str], data: bytes) -> list[Any]:
    out, off = [], 0
    for t in types:
        fmt, n = TYPES[t]
        v = struct.unpack_from(fmt, data, off)
        out.append(list(v) if len(v) > 1 else v[0])
        off += n
    return out


class RtsiReader:
    def __init__(self, host: str, port: int = RTSI_PORT, outputs: Optional[list[str]] = None,
                 frequency: float = 125.0, timeout: float = 3.0):
        self.host, self.port, self.frequency, self.timeout = host, port, frequency, timeout
        self.outputs = outputs or DEFAULT_OUTPUTS
        self.types: list[str] = []
        self.recipe_id: Optional[int] = None
        self.latest: dict[str, Any] = {}
        self.latest_t = 0.0
        self._sock: Optional[socket.socket] = None
        self._thread: Optional[threading.Thread] = None
        self._running = False

    def _recv_exact(self, n: int) -> bytes:
        assert self._sock
        buf = b""
        while len(buf) < n:
            c = self._sock.recv(n - len(buf))
            if not c:
                raise ConnectionError("rtsi: connessione chiusa")
            buf += c
        return buf

    def _recv(self, want: int) -> bytes:
        """Ritorna il payload del primo pacchetto del tipo voluto (scarta i messaggi di testo)."""
        while True:
            size, ptype = struct.unpack(">HB", self._recv_exact(3))
            body = self._recv_exact(size - 3)
            if ptype == want:
                return body

    def connect(self) -> None:
        self._sock = socket.create_connection((self.host, self.port), timeout=self.timeout)
        self._sock.sendall(pack(V, struct.pack(">H", 1)))
        if not self._recv(V)[0]:
            raise ConnectionError("rtsi: versione di protocollo 1 rifiutata")
        payload = struct.pack(">d", self.frequency) + ",".join(self.outputs).encode()
        self._sock.sendall(pack(O, payload))
        body = self._recv(O)
        self.recipe_id = body[0]
        self.types = body[1:].decode().split(",")
        bad = [n for n, t in zip(self.outputs, self.types) if t not in TYPES]
        if bad:
            raise ValueError(f"rtsi: variabili non disponibili: {bad} ({self.types})")
        self._sock.sendall(pack(S))
        if not self._recv(S)[0]:
            raise ConnectionError("rtsi: start rifiutato")
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def _loop(self) -> None:
        try:
            while self._running:
                body = self._recv(U)
                if body[0] != self.recipe_id:
                    continue
                self.latest = dict(zip(self.outputs, decode(self.types, body[1:])))
                self.latest_t = time.monotonic()
        except (OSError, ConnectionError, struct.error):
            self._running = False

    def wait_fresh(self, max_age_s: float = 0.5, timeout: float = 2.0) -> dict[str, Any]:
        t0 = time.monotonic()
        while time.monotonic() - t0 < timeout:
            if self.latest and time.monotonic() - self.latest_t < max_age_s:
                return dict(self.latest)
            time.sleep(0.01)
        raise TimeoutError("rtsi: nessun dato fresco")

    def close(self) -> None:
        self._running = False
        if self._sock:
            try:
                self._sock.sendall(pack(P))
            except OSError:
                pass
            self._sock.close()
            self._sock = None
