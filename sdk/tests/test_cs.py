"""Transport CS contro il mock: whitelist, preflight, task, movel, stop, scenari. Nessun test tocca il robot."""
import math
import time

import pytest

from gergo_sdk.cs import CsController
from gergo_sdk.dashboard import DashboardClient, DashboardRefused, allowed
from gergo_sdk.mock import MockController
from gergo_sdk.primary import PrimaryClient
from gergo_sdk.probe import probe


@pytest.fixture
def mock(request):
    m = MockController(getattr(request, "param", set()))
    yield m
    m.close()


def ctl(m, mode="armed", confirm=lambda s: True):
    c = CsController(m.host, mode, m.dashboard_port, m.primary_port, m.rtsi_port, confirm=confirm, log=lambda s: None)
    c.connect()
    return c


@pytest.mark.parametrize("cmd", ["robotControl -on", "brakeRelease", "unlockProtectiveStop", "safety -r",
                                 "speed -v 100", "remoteControl -on", "power on", "task -p ../../etc/passwd",
                                 "configuration -p x", "shutdown", "reboot"])
def test_dashboard_whitelist_rejects_before_socket(cmd):
    assert not allowed(cmd, "armed")
    d = DashboardClient("203.0.113.1", 1, "armed")  # indirizzo non raggiungibile: non deve servire
    with pytest.raises(DashboardRefused):
        d.send(cmd)


def test_read_only_cannot_play_but_can_stop(mock):
    d = DashboardClient(mock.host, mock.dashboard_port, "read-only")
    d.connect()
    with pytest.raises(DashboardRefused):
        d.send("play")
    assert d.stop() == "Stopped"
    assert d.robot_mode() == "RUNNING"


def test_primary_refuses_arbitrary_script(mock):
    p = PrimaryClient(mock.host, mock.primary_port, "armed")
    p.connect()
    with pytest.raises(PermissionError):
        p.send_movel("def x():\n\tpower on\nend")
    p.close()


def test_probe_reads_everything(mock):
    out = probe(mock.host, mock.dashboard_port, mock.primary_port, mock.rtsi_port)
    assert out["robot_mode"] == "robotMode: RUNNING"
    assert out["safety"] == "Safety status: NORMAL" and out["remote"] == "REMOTE"
    assert "Version: 2.15.0.477" in out["version"] and out["task_status"].startswith("Task is")
    assert len(out["joints_deg"]) == 6 and len(out["mdh"]["a"]) == 6
    assert out["tcp_offset_mm"] == [0.0, 0.0, 0.0]
    assert not mock.state.scripts and "play" not in mock.state.commands


def test_run_task_ok(mock):
    r = ctl(mock).run_task("home.task", timeout_s=5)
    assert r.ok, r.error


@pytest.mark.parametrize("mock", [{"not_remote"}], indirect=True)
def test_preflight_not_remote(mock):
    r = ctl(mock).run_task("home.task", timeout_s=5)
    assert not r.ok and "remote" in r.error
    assert "play" not in mock.state.commands


@pytest.mark.parametrize("mock", [{"power_off"}], indirect=True)
def test_preflight_power_off_says_pendant(mock):
    r = ctl(mock).move_linear([0.4, 0.0, 0.4, math.pi, 0, 0], 0.05)
    assert not r.ok and "pendant" in r.error and not mock.state.scripts


@pytest.mark.parametrize("mock", [{"missing_task"}], indirect=True)
def test_missing_task(mock):
    r = ctl(mock).run_task("home.task", timeout_s=5)
    assert not r.ok and "non caricato" in r.error


@pytest.mark.parametrize("mock", [{"task_never_ends"}], indirect=True)
def test_task_timeout_stops(mock):
    r = ctl(mock).run_task("home.task", timeout_s=1)
    assert not r.ok and "Timeout" in r.error and "stop" in mock.state.commands


def test_first_command_needs_confirmation(mock):
    r = ctl(mock, confirm=lambda s: False).run_task("home.task", timeout_s=5)
    assert not r.ok and "non confermato" in r.error and "play" not in mock.state.commands


def _down_10cm(c):
    p = c.pose_base_m()
    t = list(p)
    t[2] -= 0.1
    return p, t


def test_movel_10cm_down(mock):
    c = ctl(mock)
    p, t = _down_10cm(c)
    r = c.move_linear(t, 0.1, timeout_s=5)
    assert r.ok, r.error
    assert r.details["error_mm"] < 1.0 and abs(r.details["moved_mm"] - 100) < 1.5
    assert mock.state.scripts[0].startswith("def gergo_sposta():\n\tmovel([")


def test_movel_over_100mm_refused(mock):
    c = ctl(mock)
    p, t = _down_10cm(c)
    t[2] -= 0.01
    with pytest.raises(ValueError):
        c.move_linear(t, 0.05)
    assert not mock.state.scripts


@pytest.mark.parametrize("mock", [{"protective_stop_mid_move"}], indirect=True)
def test_movel_protective_stop_mid_move(mock):
    c = ctl(mock)
    p, t = _down_10cm(c)
    r = c.move_linear(t, 0.1, timeout_s=5)
    assert not r.ok and "PROTECTIVE_STOP" in r.error and "stop" in mock.state.commands


def test_stop_during_move(mock):
    c = ctl(mock)
    p, t = _down_10cm(c)
    import threading
    th = threading.Thread(target=lambda: c.move_linear(t, 0.02, timeout_s=3))
    th.start()
    time.sleep(0.5)
    t0 = time.perf_counter()
    assert c.stop()
    dt = (time.perf_counter() - t0) * 1000
    th.join()
    assert mock.state.motion is None and dt < 200


def test_dry_run_opens_no_socket():
    c = CsController("203.0.113.1", "dry-run", log=lambda s: None)
    c.connect()
    assert c.run_task("home.task").ok
    assert c.move_linear([0.4, 0, 0.3, math.pi, 0, 0], 0.05).ok


def test_dashboard_replies_stay_aligned_after_banner_and_version(mock):
    """Il CS63 in sala manda un benvenuto di 4 righe e risponde a `version` con 4 righe (05/11): ogni risposta
    deve restare agganciata al suo comando, o il preflight leggerebbe safety e robotMode sbagliati."""
    d = DashboardClient(mock.host, mock.dashboard_port, "read-only")
    d.connect()
    assert d.robot_mode() == "RUNNING"
    assert "2.15.0.477" in d.version()
    assert d.safety_mode() == "NORMAL"
    assert d.remote() == "REMOTE"
    assert d.task_status() == "stopped"
    d.close()
