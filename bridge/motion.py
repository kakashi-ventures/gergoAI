"""Da intento a Δ mm e geofence (MOTION_SAFETY.md §2.1, §2.5). Funzioni pure.

Il controllo di cinematica non è qui: lo fa l'adapter (`check_line`, via gergo_sdk.motion).
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from bridge.contracts import (VELOCITA_DEFAULT_MM_S, VELOCITA_MAX_MM_S, VELOCITA_MIN_MM_S, SpostaParams,
                              Workspace)

CLAMP_MM = 100.0
INTENSITA_MM = {"poco": 10.0, "un_po": 20.0, "tanto": 50.0}
DEFAULT_MM = 20.0

# Mappa direzione → (asse, segno) nel frame utente. Default; la verità è /shared/fixtures/frame.json
# (di BRACCIO), verificata al primo slot con "su di 1 cm" e "avanti di 1 cm".
DEFAULT_FRAME = {
    "su": ["z", 1], "giu": ["z", -1],
    "avanti": ["x", 1], "indietro": ["x", -1],
    "destra": ["y", -1], "sinistra": ["y", 1],
}
AXES = {"x": 0, "y": 1, "z": 2}
FRAME_PATH = Path(__file__).resolve().parent.parent / "shared" / "fixtures" / "frame.json"


def load_frame(path: Path = FRAME_PATH) -> dict:
    if path.exists():
        data = json.loads(path.read_text())
        return data.get("directions", data)
    return DEFAULT_FRAME


def amount_mm(p: SpostaParams) -> tuple[float, bool]:
    """Ritorna (mm, clamped)."""
    if p.quantita is not None:
        mm = p.quantita * (10.0 if p.unita.value == "cm" else 1.0)
    elif p.intensita is not None:
        mm = INTENSITA_MM[p.intensita.value]
    else:
        mm = DEFAULT_MM
    if mm > CLAMP_MM:
        return CLAMP_MM, True
    return mm, False


def delta_mm(p: SpostaParams, frame: Optional[dict] = None) -> tuple[tuple[float, float, float], float, bool]:
    frame = frame or load_frame()
    mm, clamped = amount_mm(p)
    axis, sign = frame[p.direzione.value]
    d = [0.0, 0.0, 0.0]
    d[AXES[axis]] = sign * mm
    return (d[0], d[1], d[2]), mm, clamped


@dataclass
class GeofenceResult:
    ok: bool
    fuori_di_mm: float = 0.0


def geofence(target: tuple[float, float, float], ws: Workspace) -> GeofenceResult:
    out = 0.0
    for v, lo, hi in zip(target, ws.min_mm, ws.max_mm):
        if v < lo:
            out = max(out, lo - v)
        elif v > hi:
            out = max(out, v - hi)
    return GeofenceResult(ok=out == 0.0, fuori_di_mm=round(out, 1))


def next_speed(current: float, skill: str) -> float:
    if skill == "piu_piano":
        return max(VELOCITA_MIN_MM_S, round(current * 0.5, 1))
    if skill == "piu_veloce":
        return min(VELOCITA_MAX_MM_S, round(current * 1.5, 1))
    return current


VERBI = {"su": "Salgo", "giu": "Scendo", "avanti": "Vado avanti", "indietro": "Torno indietro",
         "destra": "Vado a destra", "sinistra": "Vado a sinistra"}


def fmt_num(v: float) -> str:
    return str(int(v)) if float(v).is_integer() else str(v).replace(".", ",")


def readback(p: SpostaParams, speed_mm_s: float = VELOCITA_DEFAULT_MM_S) -> str:
    """La rilettura la scrive il codice, non Grok."""
    mm, clamped = amount_mm(p)
    qty = f"{fmt_num(mm / 10)} centimetri" if mm >= 10 and (mm % 10 == 0) else f"{fmt_num(mm)} millimetri"
    verbo = VERBI[p.direzione.value]
    extra = " (massimo 10 centimetri per comando)" if clamped else ""
    return f"{verbo} di {qty}{extra} a {fmt_num(speed_mm_s)} millimetri al secondo. Confermi?"


def fuori_text(fuori_di_mm: float) -> str:
    cm = fuori_di_mm / 10
    return f"arriverei fuori dall'area di lavoro di {fmt_num(round(cm, 1))} cm"
