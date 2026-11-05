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
BANNER_QUIET_S = 0.3     # silenzio che chiude il benvenuto alla connessione
MULTILINE_QUIET_S = 0.2  # silenzio che chiude una risposta su più righe (solo `version`)
BANNER_LAST = re.compile(r"^Type `usage")  # ultima riga del benvenuto sul CS63 in sala (05/11)

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
        # Il server manda un benvenuto su più righe (4 sul CS63 in sala, 05/11): si consumano tutte, finché il socket
        # resta in silenzio per BANNER_QUIET_S. Se ne restasse una, ogni risposta sarebbe quella del comando prima.
        for line in self._read_until_quiet(BANNER_QUIET_S, stop_at=BANNER_LAST):
            self._log("< " + line)

    def close(self) -> None:
        if self._sock:
            try:
                self._sock.close()
            finally:
                self._sock = None

    def _read_until_quiet(self, quiet_s: float, stop_at: Optional[re.Pattern] = None) -> list[str]:
        """Righe che arrivano finché il socket resta muto per quiet_s secondi, o fino alla riga che fa match con
        stop_at (così lo `stop` su una connessione nuova non aspetta il silenzio)."""
        assert self._sock
        lines: list[str] = []
        self._sock.settimeout(quiet_s)
        try:
            while True:
                lines.append(self._readline())
                if stop_at and stop_at.match(lines[-1]):
                    break
        except (socket.timeout, OSError):
            pass
        finally:
            self._sock.settimeout(self.reply_timeout)
        return lines

    def _drain(self) -> None:
        """Butta le righe già arrivate e non lette (resti di una risposta su più righe), senza aspettare."""
        assert self._sock
        self._sock.setblocking(False)
        try:
            while True:
                chunk = self._sock.recv(4096)
                if not chunk:
                    break
                self._buf += chunk
        except (BlockingIOError, OSError):
            pass
        finally:
            self._sock.settimeout(self.reply_timeout)
        if self._buf:
            self._log("< (scartato) " + self._buf.decode("utf-8", "replace").strip())
            self._buf = b""

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
    def send(self, cmd: str, multiline: bool = False) -> str:
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
                    self._drain()
                    self._log("> " + cmd)
                    self._sock.sendall((cmd + "\n").encode())
                    reply = self._readline()
                    if multiline:  # es. `version`: 4 righe sul CS63
                        reply = " | ".join([reply, *self._read_until_quiet(MULTILINE_QUIET_S)])
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
        return self.send("version", multiline=True).strip()

    # --- task --------------------------------------------------------------------------------------------------
    def load_task(self, path: str) -> str:
        return self.send(f"task -p {path}")

    def play(self) -> str:
        return self.send("play")

    def stop(self) -> str:
        return self.send("stop")
