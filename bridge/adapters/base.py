"""Interfaccia RobotAdapter: l'unico modo in cui il bridge parla al braccio (sim o Elite).

BRACCIO implementa `bridge/adapters/elite.py` con questa interfaccia; il controllo di cinematica lungo la linea
(`check_line`) lo fa `gergo_sdk.motion`. Unità: mm per le traslazioni, rad per le rotazioni, mm/s per la velocità.
Tutte le pose sono nel frame utente del workspace (MOTION_SAFETY.md §2.2).
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass(frozen=True)
class Pose:
    """Posa del TCP: x, y, z in mm; rx, ry, rz in rad."""
    x: float
    y: float
    z: float
    rx: float = 0.0
    ry: float = 0.0
    rz: float = 0.0

    @property
    def xyz(self) -> tuple[float, float, float]:
        return (self.x, self.y, self.z)

    def translated(self, d: tuple[float, float, float]) -> "Pose":
        # solo traslazione: l'orientamento resta identico (MOTION_SAFETY.md §2.4)
        return Pose(self.x + d[0], self.y + d[1], self.z + d[2], self.rx, self.ry, self.rz)


@dataclass
class LineCheck:
    """Esito del controllo di cinematica su N punti della MoveL (MOTION_SAFETY.md §2.6)."""
    ok: bool
    reason: Optional[str] = None
    samples: int = 5
    max_joint_jump_deg: Optional[float] = None
    max_ratio_deg_per_mm: Optional[float] = None


@dataclass
class TaskResult:
    ok: bool
    duration_ms: int
    error: Optional[str] = None
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class AdapterStatus:
    connected: bool
    mode: str                       # "sim" | "dry-run" | "read-only" | "armed"
    robot_ready: bool               # remote, fermo, servo e motori ok, niente allarmi
    message: str = ""               # frase leggibile in italiano se non è pronto
    tcp_mm: Optional[tuple[float, float, float]] = None
    details: dict[str, Any] = field(default_factory=dict)


class RobotAdapter(ABC):
    name: str = "base"

    @abstractmethod
    def connect(self) -> None: ...

    @abstractmethod
    def status(self) -> AdapterStatus: ...

    @abstractmethod
    def read_pose(self) -> Pose:
        """Posa corrente del TCP nel frame utente (EC: get_tcp_pose)."""

    @abstractmethod
    def read_tcp_mm(self) -> tuple[float, float, float]:
        """Offset del TCP configurato sul controller, da confrontare con Tool.tcp_atteso_mm."""

    @abstractmethod
    def check_line(self, start: Pose, target: Pose) -> LineCheck:
        """IK su 5 punti equidistanti; rifiuta per IK senza soluzione, salto > 15°, rapporto > 1°/mm."""

    @abstractmethod
    def move_linear(self, target: Pose, speed_mm_s: float, timeout_s: float) -> TaskResult:
        """MoveL fino al target (EC: moveByLine speed_type 0). Bloccante fino a fine o timeout."""

    @abstractmethod
    def run_task(self, skill: str, params: dict[str, Any], timeout_s: float) -> TaskResult:
        """Esegue una primitiva insegnata sul pendant (EC: runJbi)."""

    @abstractmethod
    def stop(self) -> None:
        """Ferma subito il programma. Non è una funzione di sicurezza: l'e-stop è fisico."""

    @abstractmethod
    def guard_alive(self) -> bool:
        """True se l'heartbeat di audio_guard è più recente di 1 s."""
