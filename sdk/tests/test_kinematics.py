import math
import random

import pytest

from gergo_sdk.kinematics import (CS66_NOMINAL_MDH as M, base_to_user, fk, fk_T, ik_near, matrix_to_rotvec,
                                  rotation_distance, rotvec_to_matrix, user_to_base)

Q_HOME = (0.2, -1.2, 1.6, -1.9, -1.4, 0.3)


def _pos_err(a, b):
    return math.sqrt(sum((a[i] - b[i]) ** 2 for i in range(3)))


def _random_q(rng):
    # configurazioni lontane dalle singolarità: polso (q5) e gomito (q3) non vicini a 0/±pi
    return (rng.uniform(-math.pi, math.pi), rng.uniform(-2.0, -0.5), rng.uniform(0.6, 2.2),
            rng.uniform(-2.5, -0.5), math.copysign(rng.uniform(0.6, 2.4), rng.choice([-1, 1])),
            rng.uniform(-math.pi, math.pi))


def test_rotvec_roundtrip():
    rng = random.Random(1)
    for _ in range(50):
        rv = tuple(rng.uniform(-1.7, 1.7) for _ in range(3))
        assert rotation_distance(matrix_to_rotvec(rotvec_to_matrix(rv)), rv) < 1e-9
    # angolo ~ pi
    rv = (0.0, math.pi - 1e-9, 0.0)
    assert rotation_distance(matrix_to_rotvec(rotvec_to_matrix(rv)), rv) < 1e-6


def test_fk_zero_matches_mdh_chain():
    # q = 0: catena UR-like distesa; z = d1 + ... controlla solo che sia finita e coerente con la convenzione
    T = fk_T(M, (0, 0, 0, 0, 0, 0))
    assert all(math.isfinite(v) for row in T for v in row)
    # dopo il primo giunto ruotare q1 ruota tutto attorno a z base
    p0 = fk(M, (0, 0, 0, 0, 0, 0))
    p1 = fk(M, (math.pi / 2, 0, 0, 0, 0, 0))
    assert p1[0] == pytest.approx(-p0[1], abs=1e-9)
    assert p1[1] == pytest.approx(p0[0], abs=1e-9)
    assert p1[2] == pytest.approx(p0[2], abs=1e-9)


@pytest.mark.parametrize("seed", range(8))
def test_fk_ik_roundtrip(seed):
    rng = random.Random(seed)
    q = _random_q(rng)
    pose = fk(M, q)
    q_ref = tuple(v + rng.uniform(-0.15, 0.15) for v in q)
    sol = ik_near(M, pose, q_ref)
    assert sol is not None
    back = fk(M, sol)
    assert _pos_err(back, pose) < 1e-4
    assert rotation_distance(back[3:], pose[3:]) < 1e-4


def test_fk_ik_roundtrip_with_tcp():
    tcp = (0.0, 0.02, 0.15, 0.0, 0.0, 0.3)
    pose = fk(M, Q_HOME, tcp)
    sol = ik_near(M, pose, tuple(v + 0.1 for v in Q_HOME), tcp)
    assert sol is not None
    assert _pos_err(fk(M, sol, tcp), pose) < 1e-4


def test_ik_nearest_to_reference():
    pose = fk(M, Q_HOME)
    sol = ik_near(M, pose, tuple(v + 0.05 for v in Q_HOME))
    assert sol is not None
    assert max(abs(sol[i] - Q_HOME[i]) for i in range(6)) < 1e-3
    # stessa posa, seme nell'altra configurazione del gomito: soluzione diversa ma valida
    flipped = (Q_HOME[0], Q_HOME[1] + 1.6, -Q_HOME[2], Q_HOME[3], Q_HOME[4], Q_HOME[5])
    sol2 = ik_near(M, pose, flipped)
    if sol2 is not None:
        assert _pos_err(fk(M, sol2), pose) < 1e-4
        assert sol2[2] * Q_HOME[2] < 0  # rimane sul ramo del seme


def test_ik_unreachable_returns_none():
    pose = list(fk(M, Q_HOME))
    pose[0] += 2.0
    assert ik_near(M, pose, Q_HOME) is None


def test_user_base_roundtrip():
    frame = (0.4, -0.2, 0.05, 0.0, 0.0, math.pi / 2)
    pose_u = (0.1, 0.0, 0.2, 0.1, -0.2, 0.3)
    pb = user_to_base(frame, pose_u)
    # x utente = y base (rotazione di 90° attorno a z)
    assert pb[0] == pytest.approx(0.4, abs=1e-9)
    assert pb[1] == pytest.approx(-0.1, abs=1e-9)
    assert pb[2] == pytest.approx(0.25, abs=1e-9)
    back = base_to_user(frame, pb)
    assert _pos_err(back, pose_u) < 1e-12
    assert rotation_distance(back[3:], pose_u[3:]) < 1e-9
