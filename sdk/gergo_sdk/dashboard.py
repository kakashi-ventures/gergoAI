"""Client della Dashboard Shell dei controller Elite serie CS (TCP 29999, testo a righe).

Fonte: Elite_Robots_CS_SDK v1.5.0, `source/Dashboard/DashboardClient.cpp` (comandi e risposte attese, righe
indicate accanto a ogni comando). Il server risponde a ogni riga con una riga terminata da "\\r\\n".

Whitelist: solo letture e i comandi di task (`task -p`, `play`, `pause`, `stop`). Accensione, freni, sblocco
dello stop protettivo, safety, velocità, configurazione e remote control si fanno dal pendant, mai da qui
(CANTIERI.md, regole di sicurezza).
"""
from __future__ import annotations

import re
import socket
import threading
from typing import Callable, Optional

DASHBOARD_PORT = 29999

# Comandi ammessi: regex completa sulla riga inviata (senza "\n").
READ_ONLY = {
    "echo": r"echo",                      # cpp:96  -> "Hello ELITE ROBOTS."
    "robotMode": r"robotMode",            # cpp:211 -> "robotMode: RUNNING"
    "safety": r"safety -s",               # cpp:242 -> "Safety status: NORMAL"
    "status": r"status",                  # cpp:204/284 -> "Target Speed Fraction: ..." / "RunningStatus: ..."
    "task": r"task",                      # cpp:366 -> "Relative path:..."
    "taskStatus": r"task -s",             # cpp:384 -> "Task is running|paused|stopped"
    "version": r"version",                # cpp:305
    "remote": r"remoteControl -s",        # cpp:192 -> REMOTE|LOCAL|NONE
    "remoteStatus": r"remoteControl -status",  # cpp:180 -> true|false
    "robotType": r"robot -t",             # cpp:147
}
TASK = {
    "loadTask": r"task -p [A-Za-z0-9_./-]+\.task",  # cpp:378 -> "Loaded task: ..."
    "play": r"play",                      # cpp:334
    "pause": r"pause",                    # cpp:342
    "stop": r"stop",                      # cpp:358
}
_READ_RE = [re.compile(rf"^{p}$") for p in READ_ONLY.values()]
_TASK_RE = [re.compile(rf"^{p}$") for p in TASK.values()]


class DashboardRefused(Exception):
    """Comando fuori whitelist: non viene mai inviato."""


def allowed(cmd: str, mode: str) -> bool:
    """mode: dry-run | read-only | armed. `stop` è sempre ammesso (anche in read-only)."""
    if cmd == "stop":
        return True
    if any(r.match(cmd) for r in _READ_RE):
        return True
    if mode == "armed" and any(r.match(cmd) for r in _TASK_RE):
        return True
    return False


class DashboardClient:
    def __init__(self, host: str, port: int = DASHBOARD_PORT, mode: str = "dry-run",
                 connect_timeout: float = 3.0, reply_timeout: float = 2.0,
                 log: Optional[Callable[[str], None]] = None):
        self.host, self.port, self.mode = host, port, mode
        self.connect_timeout, self.reply_timeout = connect_timeout, reply_timeout
        self._sock: Optional[socket.socket] = None
        self._buf = b""
        self._lock = threading.Lock()
        self._log = log or (lambda s: None)

    # --- connessione -------------------------------------------------------------------------------------------
    def connect(self) -> None:
        if self.mode == "dry-run":
            return
        s = socket.create_connection((self.host, self.port), timeout=self.connect_timeout)
        s.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        s.settimeout(self.reply_timeout)
        self._sock, self._buf = s, b""
        # Il server manda una riga di benvenuto alla connessione: la si consuma se arriva.
        try:
            s.settimeout(0.3)
            self._log("< " + self._readline())
        except (socket.timeout, OSError):
            pass
        finally:
            s.settimeout(self.reply_timeout)

    def close(self) -> None:
        if self._sock:
            try:
                self._sock.close()
            finally:
                self._sock = None

    def _readline(self) -> str:
        assert self._sock
        while b"\n" not in self._buf:
            chunk = self._sock.recv(4096)
            if not chunk:
                raise ConnectionError("dashboard: connessione chiusa")
            self._buf += chunk
        line, self._buf = self._buf.split(b"\n", 1)
        return line.decode("utf-8", "replace").rstrip("\r")

    # --- comandi -----------------------------------------------------------------------------------------------
    def send(self, cmd: str) -> str:
        """Invia una riga e ritorna la risposta (senza \\r\\n). Rifiuta prima del socket se fuori whitelist."""
        cmd = cmd.strip()
        if not allowed(cmd, "armed" if self.mode == "armed" else "read-only"):
            raise DashboardRefused(f"comando dashboard non ammesso: {cmd!r}")
        if self.mode == "read-only" and not allowed(cmd, "read-only"):
            raise DashboardRefused(f"in read-only: {cmd!r}")
        if self.mode == "dry-run":
            self._log(f"[dry-run] > {cmd}")
            return ""
        with self._lock:
            for attempt in (1, 2):
                try:
                    if self._sock is None:
                        self.connect()
                    assert self._sock
                    self._log("> " + cmd)
                    self._sock.sendall((cmd + "\n").encode())
                    reply = self._readline()
                    self._log("< " + reply)
                    return reply
                except (OSError, ConnectionError):
                    self.close()
                    if attempt == 2:
                        raise
        raise AssertionError("unreachable")

    # --- letture tipizzate -------------------------------------------------------------------------------------
    @staticmethod
    def _after_colon(reply: str) -> str:
        return reply.split(": ", 1)[1].strip() if ": " in reply else reply.strip()

    def robot_mode(self) -> str:
        """POWER_OFF · IDLE · RUNNING · ... (cpp:211-236)."""
        return self._after_colon(self.send("robotMode"))

    def safety_mode(self) -> str:
        """NORMAL · REDUCED · PROTECTIVE_STOP · ... (cpp:242-272)."""
        return self._after_colon(self.send("safety -s"))

    def task_status(self) -> str:
        """running · paused · stopped (cpp:384-392)."""
        r = self.send("task -s").lower()
        for k in ("running", "paused", "stopped"):
            if k in r:
                return k
        return r or "unknown"

    def remote(self) -> str:
        return self.send("remoteControl -s").strip()

    def version(self) -> str:
        return self.send("version").strip()

    # --- task --------------------------------------------------------------------------------------------------
    def load_task(self, path: str) -> str:
        return self.send(f"task -p {path}")

    def play(self) -> str:
        return self.send("play")

    def stop(self) -> str:
        return self.send("stop")
