"""Cinematica diretta e inversa numerica per i cobot Elite CS, da parametri Modified DH (solo libreria standard).

Convenzione (replicata da cssdk plugin/kinematics/KdlKinematicsPlugin/source/KdlKinematicsPlugin.cpp:29-35):
per ogni giunto i = 0..5 la catena KDL aggiunge un segmento fisso RotX(alpha[i]) * Trans(a[i], 0, d[i]) e poi
un giunto RotZ(q[i]). Cioè T_i = RotX(alpha[i]) · TransX(a[i]) · TransZ(d[i]) · RotZ(q[i]) (Craig, con
alpha[i]/a[i] che nella notazione di Craig sono alpha_{i-1}/a_{i-1}). Nessuna trasformazione dopo l'ultimo
giunto: la flangia è il frame 6; il TCP è un offset opzionale.

I parametri arrivano dal controller sulla porta 30001 (pacchetto KinematicsInfo, ordine a, d, alpha:
cssdk source/Primary/RobotConfPackage.cpp:58-70). Unità: alpha rad, a e d metri.

Pose: [x, y, z, rx, ry, rz] in metri + vettore di rotazione (asse·angolo, stile UR) in radianti, come
`actual_TCP_pose` RTSI (cssdk doc/API/en/RTSI.en.md:464). Attenzione: il plugin KDL dell'SDK usa invece RPY
(KdlKinematicsPlugin.cpp:62, doc/API/en/KinematicsBase.en.md:178); noi usiamo il vettore di rotazione perché è
quello che leggiamo dal controller e che `movel` accetta.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional, Sequence

Mat = list  # 4x4 o 3x3, liste di righe
Vec6 = tuple

JOINT_LIMIT_RAD = 2.0 * math.pi  # ±360°


@dataclass(frozen=True)
class MDH:
    alpha: tuple  # rad, 6 valori
    a: tuple      # m, 6 valori
    d: tuple      # m, 6 valori

    def __post_init__(self) -> None:
        for name in ("alpha", "a", "d"):
            v = getattr(self, name)
            if len(v) != 6:
                raise ValueError(f"MDH.{name} deve avere 6 valori")


# [non verificato] Valori nominali approssimati di un CS66 (sbraccio ~914 mm), forma UR-like. Servono solo per i
# test e la simulazione: a runtime si usano i parametri letti dal controller (KinematicsInfo, porta 30001).
CS66_NOMINAL_MDH = MDH(
    alpha=(0.0, math.pi / 2, 0.0, 0.0, math.pi / 2, -math.pi / 2),
    a=(0.0, 0.0, -0.427, -0.393, 0.0, 0.0),
    d=(0.1625, 0.0, 0.0, 0.1405, 0.1025, 0.094),
)


# ---------------------------------------------------------------- algebra 4x4 / 3x3

def identity4() -> Mat:
    return [[1.0 if i == j else 0.0 for j in range(4)] for i in range(4)]


def matmul(A: Mat, B: Mat) -> Mat:
    n, m, p = len(A), len(B), len(B[0])
    return [[sum(A[i][k] * B[k][j] for k in range(m)) for j in range(p)] for i in range(n)]


def transpose(A: Mat) -> Mat:
    return [list(r) for r in zip(*A)]


def rot_x(t: float) -> Mat:
    c, s = math.cos(t), math.sin(t)
    return [[1.0, 0.0, 0.0, 0.0], [0.0, c, -s, 0.0], [0.0, s, c, 0.0], [0.0, 0.0, 0.0, 1.0]]


def rot_z(t: float) -> Mat:
    c, s = math.cos(t), math.sin(t)
    return [[c, -s, 0.0, 0.0], [s, c, 0.0, 0.0], [0.0, 0.0, 1.0, 0.0], [0.0, 0.0, 0.0, 1.0]]


def trans(x: float, y: float, z: float) -> Mat:
    T = identity4()
    T[0][3], T[1][3], T[2][3] = x, y, z
    return T


def rot_part(T: Mat) -> Mat:
    return [row[:3] for row in T[:3]]


def pos_part(T: Mat) -> tuple:
    return (T[0][3], T[1][3], T[2][3])


def make_T(R: Mat, p: Sequence[float]) -> Mat:
    return [[R[0][0], R[0][1], R[0][2], p[0]],
            [R[1][0], R[1][1], R[1][2], p[1]],
            [R[2][0], R[2][1], R[2][2], p[2]],
            [0.0, 0.0, 0.0, 1.0]]


def inv_T(T: Mat) -> Mat:
    Rt = transpose(rot_part(T))
    p = pos_part(T)
    return make_T(Rt, [-sum(Rt[i][k] * p[k] for k in range(3)) for i in range(3)])


def _cross(u, v):
    return (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])


# ---------------------------------------------------------------- RPY del controller CS

def rpy_to_matrix(rpy: Sequence[float]) -> Mat:
    """R = Rz(yaw)·Ry(pitch)·Rx(roll). Misurato il 05/11 sul CS63: `actual_TCP_pose` RTSI riporta l'orientamento
    in RPY, non come vettore di rotazione (la nostra FK convertita in RPY coincide al 4° decimale)."""
    r, p, y = rpy
    cr, sr, cp, sp, cy, sy = math.cos(r), math.sin(r), math.cos(p), math.sin(p), math.cos(y), math.sin(y)
    return [[cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr],
            [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr],
            [-sp, cp * sr, cp * cr]]


def rpy_to_rotvec(rpy: Sequence[float]) -> tuple:
    return matrix_to_rotvec(rpy_to_matrix(rpy))


def rotvec_to_rpy(rv: Sequence[float]) -> tuple:
    R = rotvec_to_matrix(rv)
    pitch = math.asin(max(-1.0, min(1.0, -R[2][0])))
    return (math.atan2(R[2][1], R[2][2]), pitch, math.atan2(R[1][0], R[0][0]))


def controller_pose_to_rotvec(pose: Sequence[float]) -> tuple:
    """Posa del controller (xyz + RPY) → posa della nostra cinematica (xyz + vettore di rotazione)."""
    return tuple(pose[:3]) + rpy_to_rotvec(pose[3:6])


# ---------------------------------------------------------------- vettore di rotazione

def rotvec_to_matrix(rv: Sequence[float]) -> Mat:
    rx, ry, rz = rv
    th = math.sqrt(rx * rx + ry * ry + rz * rz)
    if th < 1e-12:
        return [[1.0, -rz, ry], [rz, 1.0, -rx], [-ry, rx, 1.0]]
    kx, ky, kz = rx / th, ry / th, rz / th
    c, s, v = math.cos(th), math.sin(th), 1.0 - math.cos(th)
    return [[kx * kx * v + c, kx * ky * v - kz * s, kx * kz * v + ky * s],
            [ky * kx * v + kz * s, ky * ky * v + c, ky * kz * v - kx * s],
            [kz * kx * v - ky * s, kz * ky * v + kx * s, kz * kz * v + c]]


def matrix_to_rotvec(R: Mat) -> tuple:
    tr = R[0][0] + R[1][1] + R[2][2]
    cos_t = max(-1.0, min(1.0, (tr - 1.0) / 2.0))
    th = math.acos(cos_t)
    w = (R[2][1] - R[1][2], R[0][2] - R[2][0], R[1][0] - R[0][1])
    if th < 1e-9:
        return (w[0] / 2.0, w[1] / 2.0, w[2] / 2.0)
    if math.pi - th > 1e-6:
        k = th / (2.0 * math.sin(th))
        return (w[0] * k, w[1] * k, w[2] * k)
    # angolo ~ pi: asse dalla diagonale di (R + I) / 2
    xx, yy, zz = (R[0][0] + 1) / 2, (R[1][1] + 1) / 2, (R[2][2] + 1) / 2
    if xx >= yy and xx >= zz:
        x = math.sqrt(max(xx, 0.0)); y = (R[0][1] + R[1][0]) / (4 * x); z = (R[0][2] + R[2][0]) / (4 * x)
    elif yy >= zz:
        y = math.sqrt(max(yy, 0.0)); x = (R[0][1] + R[1][0]) / (4 * y); z = (R[1][2] + R[2][1]) / (4 * y)
    else:
        z = math.sqrt(max(zz, 0.0)); x = (R[0][2] + R[2][0]) / (4 * z); y = (R[1][2] + R[2][1]) / (4 * z)
    n = math.sqrt(x * x + y * y + z * z)
    return (x / n * th, y / n * th, z / n * th)


def pose_to_T(pose: Sequence[float]) -> Mat:
    return make_T(rotvec_to_matrix(pose[3:6]), pose[0:3])


def T_to_pose(T: Mat) -> tuple:
    return tuple(pos_part(T)) + matrix_to_rotvec(rot_part(T))


# ---------------------------------------------------------------- FK

def _joint_frames(mdh: MDH, q: Sequence[float]) -> list:
    """Frame (in base) di ciascun giunto, già ruotati di q[i]; frames[i] ha l'asse z = asse del giunto i."""
    if len(q) != 6:
        raise ValueError("servono 6 angoli di giunto")
    T = identity4()
    frames = []
    for i in range(6):
        T = matmul(T, matmul(rot_x(mdh.alpha[i]), trans(mdh.a[i], 0.0, mdh.d[i])))
        T = matmul(T, rot_z(q[i]))
        frames.append(T)
    return frames


def fk_T(mdh: MDH, q: Sequence[float], tcp: Optional[Sequence[float]] = None) -> Mat:
    T = _joint_frames(mdh, q)[-1]
    return matmul(T, pose_to_T(tcp)) if tcp is not None else T


def fk(mdh: MDH, q_rad: Sequence[float], tcp: Optional[Sequence[float]] = None) -> tuple:
    """Posa del TCP in base: (x, y, z, rx, ry, rz), metri + vettore di rotazione. tcp = offset dalla flangia."""
    return T_to_pose(fk_T(mdh, q_rad, tcp))


def _jacobian(mdh: MDH, q: Sequence[float], tcp) -> tuple:
    frames = _joint_frames(mdh, q)
    Te = matmul(frames[-1], pose_to_T(tcp)) if tcp is not None else frames[-1]
    pe = pos_part(Te)
    J = [[0.0] * 6 for _ in range(6)]
    for i, F in enumerate(frames):
        z = (F[0][2], F[1][2], F[2][2])
        p = pos_part(F)
        v = _cross(z, (pe[0] - p[0], pe[1] - p[1], pe[2] - p[2]))
        for r in range(3):
            J[r][i] = v[r]
            J[r + 3][i] = z[r]
    return J, Te


def _solve(A: Mat, b: list) -> Optional[list]:
    """Eliminazione di Gauss con pivot parziale."""
    n = len(b)
    M = [list(A[i]) + [b[i]] for i in range(n)]
    for c in range(n):
        piv = max(range(c, n), key=lambda r: abs(M[r][c]))
        if abs(M[piv][c]) < 1e-15:
            return None
        M[c], M[piv] = M[piv], M[c]
        for r in range(c + 1, n):
            f = M[r][c] / M[c][c]
            if f:
                for k in range(c, n + 1):
                    M[r][k] -= f * M[c][k]
    x = [0.0] * n
    for r in range(n - 1, -1, -1):
        x[r] = (M[r][n] - sum(M[r][k] * x[k] for k in range(r + 1, n))) / M[r][r]
    return x


def _pose_error(T_target: Mat, T_cur: Mat) -> list:
    p_t, p_c = pos_part(T_target), pos_part(T_cur)
    R_err = matmul(rot_part(T_target), transpose(rot_part(T_cur)))
    w = matrix_to_rotvec(R_err)  # errore di orientamento in base
    return [p_t[0] - p_c[0], p_t[1] - p_c[1], p_t[2] - p_c[2], w[0], w[1], w[2]]


def ik_near(mdh: MDH, target_pose: Sequence[float], q_ref: Sequence[float],
            tcp: Optional[Sequence[float]] = None, max_iter: int = 300,
            tol_pos_m: float = 1e-4, tol_rot_rad: float = 1e-4) -> Optional[tuple]:
    """IK numerica (Levenberg–Marquardt / minimi quadrati smorzati) partendo da q_ref.

    Ritorna i 6 giunti in rad, o None se non converge entro tolleranza (0,1 mm, 1e-4 rad) o esce da ±360°.
    Essendo locale, la soluzione trovata è quella "vicina" a q_ref (stesso ramo di configurazione).
    """
    T_target = pose_to_T(target_pose)
    q = [float(v) for v in q_ref]
    lam = 1e-2
    J, Tc = _jacobian(mdh, q, tcp)
    e = _pose_error(T_target, Tc)
    cost = sum(v * v for v in e)
    for _ in range(max_iter):
        if math.sqrt(sum(v * v for v in e[:3])) < tol_pos_m and math.sqrt(sum(v * v for v in e[3:])) < tol_rot_rad:
            break
        # (J J^T + lam^2 I) y = e ; dq = J^T y
        JJt = [[sum(J[i][k] * J[j][k] for k in range(6)) + (lam * lam if i == j else 0.0) for j in range(6)]
               for i in range(6)]
        y = _solve(JJt, e)
        if y is None:
            lam *= 10.0
            continue
        dq = [sum(J[k][i] * y[k] for k in range(6)) for i in range(6)]
        # passo limitato: niente salti enormi in un'iterazione
        m = max(abs(v) for v in dq)
        if m > 0.3:
            dq = [v * 0.3 / m for v in dq]
        q_new = [q[i] + dq[i] for i in range(6)]
        J_new, Tc_new = _jacobian(mdh, q_new, tcp)
        e_new = _pose_error(T_target, Tc_new)
        cost_new = sum(v * v for v in e_new)
        if cost_new < cost:
            q, J, e, cost = q_new, J_new, e_new, cost_new
            lam = max(lam / 3.0, 1e-6)
        else:
            lam = min(lam * 4.0, 1e3)
    else:
        return None
    if not (math.sqrt(sum(v * v for v in e[:3])) < tol_pos_m and math.sqrt(sum(v * v for v in e[3:])) < tol_rot_rad):
        return None
    for i in range(6):
        if abs(q[i]) > JOINT_LIMIT_RAD:
            q[i] -= math.copysign(2.0 * math.pi, q[i])
        if abs(q[i]) > JOINT_LIMIT_RAD:
            return None
    return tuple(q)


# ---------------------------------------------------------------- frame utente

def user_to_base(frame_pose: Sequence[float], pose_user: Sequence[float]) -> tuple:
    """Posa nel frame utente -> base. frame_pose = origine + vettore di rotazione del frame utente in base (m, rad)."""
    return T_to_pose(matmul(pose_to_T(frame_pose), pose_to_T(pose_user)))


def base_to_user(frame_pose: Sequence[float], pose_base: Sequence[float]) -> tuple:
    """Posa in base -> frame utente (inverso di user_to_base)."""
    return T_to_pose(matmul(inv_T(pose_to_T(frame_pose)), pose_to_T(pose_base)))


def rotation_distance(rv1: Sequence[float], rv2: Sequence[float]) -> float:
    """Angolo (rad) tra due orientamenti espressi come vettori di rotazione."""
    R = matmul(rotvec_to_matrix(rv1), transpose(rotvec_to_matrix(rv2)))
    return math.sqrt(sum(v * v for v in matrix_to_rotvec(R)))
