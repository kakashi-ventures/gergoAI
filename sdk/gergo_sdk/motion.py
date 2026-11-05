"""Controllo di cinematica lungo la MoveL e generazione dello script `movel` (MOTION_SAFETY.md §2.4, §2.6).

Intento -> Δ e geofence stanno in bridge/motion.py: qui solo la parte cinematica, pura e testabile senza robot.
Pose in base: metri + vettore di rotazione (rad). Pose utente per `target_from_delta`: mm + rad.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional, Sequence

from .kinematics import MDH, fk, ik_near, rotation_distance

MAX_SPEED_M_S = 0.1          # clamp velocità in demo
MAX_TRANSLATION_M = 0.1      # clamp 100 mm per comando
MAX_ACC_M_S2 = 1.0
MAX_ROT_CHANGE_RAD = 1e-3    # l'orientamento deve restare identico
START_POSE_TOL_M = 1e-3      # la posa iniziale deve coincidere con FK(q_start) entro 1 mm


@dataclass
class LineCheckResult:
    ok: bool
    reason: Optional[str] = None
    samples: int = 5
    max_joint_jump_deg: Optional[float] = None
    max_ratio_deg_per_mm: Optional[float] = None
    q_path: list = field(default_factory=list)


def _dist(a: Sequence[float], b: Sequence[float]) -> float:
    return math.sqrt(sum((a[i] - b[i]) ** 2 for i in range(3)))


def check_line(mdh: MDH, start_pose_base_m: Sequence[float], target_pose_base_m: Sequence[float],
               q_start_rad: Sequence[float], tcp: Optional[Sequence[float]] = None, samples: int = 5,
               max_jump_deg: float = 15.0, max_ratio_deg_per_mm: float = 1.0) -> LineCheckResult:
    """IK su `samples` punti equidistanti della linea (escluso l'inizio, incluso il target), ognuno con la
    soluzione precedente come riferimento. Rifiuta per IK senza soluzione, salto di giunto o rapporto °/mm."""
    if samples < 1:
        raise ValueError("samples deve essere >= 1")
    res = LineCheckResult(ok=False, samples=samples, q_path=[tuple(q_start_rad)])

    p_fk = fk(mdh, q_start_rad, tcp)
    if _dist(p_fk, start_pose_base_m) > START_POSE_TOL_M:
        res.reason = "la posa iniziale non corrisponde ai giunti attuali (differenza oltre 1 mm)"
        return res

    rot = tuple(start_pose_base_m[3:6])  # orientamento identico: si interpola solo la traslazione
    if rotation_distance(rot, target_pose_base_m[3:6]) > MAX_ROT_CHANGE_RAD:
        res.reason = "il target cambia l'orientamento: sono ammesse solo traslazioni"
        return res

    # Pre-controllo del target, con seme q_start: un target irraggiungibile è "nessuna soluzione", non un salto
    # dei campioni intermedi. Per spostamenti <= 100 mm il seme è vicino; un falso rifiuto è dalla parte sicura.
    if ik_near(mdh, tuple(target_pose_base_m[:3]) + rot, q_start_rad, tcp) is None:
        res.reason = f"nessuna soluzione di cinematica inversa al punto {samples} (target)"
        res.max_joint_jump_deg = 0.0
        res.max_ratio_deg_per_mm = 0.0
        return res

    max_jump = 0.0
    max_ratio = 0.0
    q_prev = tuple(q_start_rad)
    p_prev = tuple(start_pose_base_m[:3])
    for k in range(1, samples + 1):
        t = k / samples
        p = tuple(start_pose_base_m[i] + t * (target_pose_base_m[i] - start_pose_base_m[i]) for i in range(3))
        q = ik_near(mdh, p + rot, q_prev, tcp)
        if q is None:
            res.reason = f"nessuna soluzione di cinematica inversa al punto {k}"
            break
        jump = max(abs(math.degrees(q[i] - q_prev[i])) for i in range(6))
        seg_mm = _dist(p, p_prev) * 1000.0
        ratio = jump / seg_mm if seg_mm > 1e-9 else 0.0
        max_jump, max_ratio = max(max_jump, jump), max(max_ratio, ratio)
        res.q_path.append(q)
        if jump > max_jump_deg:
            res.reason = f"un giunto salterebbe di {jump:.1f}° al punto {k} (massimo {max_jump_deg:g}°)"
            break
        if ratio > max_ratio_deg_per_mm:
            res.reason = (f"vicino a una singolarità al punto {k}: {ratio:.2f}°/mm "
                          f"(massimo {max_ratio_deg_per_mm:g}°/mm)")
            break
        q_prev, p_prev = q, p
    else:
        res.ok = True
    res.max_joint_jump_deg = max_jump
    res.max_ratio_deg_per_mm = max_ratio
    return res


def target_from_delta(pose_user_mm: Sequence[float], delta_mm: Sequence[float]) -> tuple:
    """Target = posa + Δ, solo traslazione (mm); l'orientamento (rad) resta identico."""
    p = tuple(pose_user_mm)
    if len(p) != 6 or len(delta_mm) != 3:
        raise ValueError("servono una posa a 6 valori e un Δ a 3 valori")
    return (p[0] + delta_mm[0], p[1] + delta_mm[1], p[2] + delta_mm[2], p[3], p[4], p[5])


def mm_s_to_m_s(v_mm_s: float) -> float:
    return v_mm_s / 1000.0


def pose_mm_to_m(pose_mm: Sequence[float]) -> tuple:
    return (pose_mm[0] / 1000.0, pose_mm[1] / 1000.0, pose_mm[2] / 1000.0, pose_mm[3], pose_mm[4], pose_mm[5])


def build_movel_script(target_pose_base_m: Sequence[float], speed_m_s: float, acc_m_s2: float = 0.5, *,
                       start_pose_base_m: Sequence[float]) -> str:
    """Script CS per la porta primaria 30001 (formato di cssdk source/Elite/EliteDriver.cpp:208-215).

    Rifiuta (ValueError) velocità > 0,1 m/s, traslazione > 0,1 m rispetto a start, cambio di orientamento,
    valori non finiti.
    """
    vals = list(target_pose_base_m) + list(start_pose_base_m) + [speed_m_s, acc_m_s2]
    if len(target_pose_base_m) != 6 or len(start_pose_base_m) != 6 or not all(math.isfinite(v) for v in vals):
        raise ValueError("posa o parametri non validi")
    if not 0 < speed_m_s <= MAX_SPEED_M_S:
        raise ValueError(f"velocità {speed_m_s} m/s fuori dal limite (0, {MAX_SPEED_M_S}]")
    if not 0 < acc_m_s2 <= MAX_ACC_M_S2:
        raise ValueError(f"accelerazione {acc_m_s2} m/s² fuori dal limite (0, {MAX_ACC_M_S2}]")
    d = _dist(target_pose_base_m, start_pose_base_m)
    if d > MAX_TRANSLATION_M + 1e-9:
        raise ValueError(f"spostamento di {d * 1000:.0f} mm oltre il limite di {MAX_TRANSLATION_M * 1000:.0f} mm")
    if rotation_distance(target_pose_base_m[3:6], start_pose_base_m[3:6]) > MAX_ROT_CHANGE_RAD:
        raise ValueError("il target cambia l'orientamento: sono ammesse solo traslazioni")
    pose = ", ".join(f"{v:.6f}" for v in target_pose_base_m)
    return f"def gergo_sposta():\n\tmovel([{pose}], a={acc_m_s2:.6f}, v={speed_m_s:.6f})\nend\n"
