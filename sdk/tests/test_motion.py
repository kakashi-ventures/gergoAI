import math

import pytest

from gergo_sdk.kinematics import CS66_NOMINAL_MDH as M, fk
from gergo_sdk.motion import build_movel_script, check_line, mm_s_to_m_s, target_from_delta

Q_HOME = (0.2, -1.2, 1.6, -1.9, -1.4, 0.3)


def _moved(pose, d):
    return tuple(pose[i] + (d[i] if i < 3 else 0.0) for i in range(6))


def test_down_10cm_passes():
    start = fk(M, Q_HOME)
    r = check_line(M, start, _moved(start, (0, 0, -0.1)), Q_HOME)
    assert r.ok, r.reason
    assert len(r.q_path) == 6
    assert r.max_joint_jump_deg < 15 and r.max_ratio_deg_per_mm < 1.0
    assert abs(fk(M, r.q_path[-1])[2] - (start[2] - 0.1)) < 1e-4


def test_down_10cm_with_tcp_passes():
    tcp = (0.0, 0.0, 0.12, 0.0, 0.0, 0.0)
    start = fk(M, Q_HOME, tcp)
    assert check_line(M, start, _moved(start, (0, 0, -0.1)), Q_HOME, tcp).ok


def test_wrist_singularity_fails():
    q = (0.2, -1.2, 1.6, -1.9, 0.02, 0.3)  # q5 ~ 1°: assi 4 e 6 quasi allineati
    start = fk(M, q)
    r = check_line(M, start, _moved(start, (0, 0.1, 0)), q)
    assert not r.ok
    assert ("salterebbe" in r.reason) or ("singolarità" in r.reason)


def test_ratio_threshold_is_parameter():
    q = (0.2, -1.2, 1.6, -1.9, 0.05, 0.3)
    start = fk(M, q)
    target = _moved(start, (0.1, 0, 0))
    assert check_line(M, start, target, q).ok
    r = check_line(M, start, target, q, max_ratio_deg_per_mm=0.2)
    assert not r.ok and "singolarità" in r.reason


def test_unreachable_fails_no_ik():
    start = fk(M, Q_HOME)
    r = check_line(M, start, _moved(start, (2.0, 0, 0)), Q_HOME)
    assert not r.ok
    assert r.reason.startswith("nessuna soluzione di cinematica inversa al punto")


def test_start_pose_mismatch_fails():
    start = fk(M, Q_HOME)
    wrong = _moved(start, (0.01, 0, 0))
    r = check_line(M, wrong, _moved(wrong, (0, 0, -0.05)), Q_HOME)
    assert not r.ok and "posa iniziale" in r.reason


def test_target_from_delta_keeps_orientation():
    assert target_from_delta((100, 200, 300, 0.1, 0.2, 0.3), (0, 0, -100)) == (100, 200, 200, 0.1, 0.2, 0.3)
    assert mm_s_to_m_s(50) == pytest.approx(0.05)


def test_build_movel_script_format():
    start = (0.4, -0.1, 0.3, 0.0, math.pi, 0.0)
    target = (0.4, -0.1, 0.2, 0.0, math.pi, 0.0)
    s = build_movel_script(target, 0.05, start_pose_base_m=start)
    assert s == ("def gergo_sposta():\n\tmovel([0.400000, -0.100000, 0.200000, 0.000000, 3.141593, 0.000000], "
                 "a=0.500000, v=0.050000)\nend\n")


def test_build_movel_script_refuses():
    start = (0.4, -0.1, 0.3, 0.0, math.pi, 0.0)
    with pytest.raises(ValueError):
        build_movel_script((0.4, -0.1, 0.199, 0.0, math.pi, 0.0), 0.05, start_pose_base_m=start)  # 101 mm
    with pytest.raises(ValueError):
        build_movel_script((0.4, -0.1, 0.25, 0.0, math.pi, 0.0), 0.11, start_pose_base_m=start)   # 0.11 m/s
    with pytest.raises(ValueError):
        build_movel_script((0.4, -0.1, 0.25, 0.0, math.pi, 0.2), 0.05, start_pose_base_m=start)   # rotazione
    with pytest.raises(ValueError):
        build_movel_script((0.4, -0.1, float("nan"), 0.0, math.pi, 0.0), 0.05, start_pose_base_m=start)
