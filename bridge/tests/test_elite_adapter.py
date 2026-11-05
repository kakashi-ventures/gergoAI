"""EliteCsAdapter contro il mock CS (BRACCIO): posa nel frame utente, controllo di cinematica, movel di 10 cm."""
import pytest

from bridge.adapters.elite import EliteCsAdapter
from gergo_sdk.cs import CsController
from gergo_sdk.mock import MockController


@pytest.fixture
def adapter():
    m = MockController()
    c = CsController(m.host, "armed", m.dashboard_port, m.primary_port, m.rtsi_port, confirm=lambda s: True,
                     log=lambda s: None)
    a = EliteCsAdapter(controller=c)
    a.connect()
    yield a, m
    m.close()


def test_status_ready(adapter):
    a, _ = adapter
    s = a.status()
    assert s.robot_ready and s.tcp_mm == (0.0, 0.0, 0.0)


def test_sposta_giu_10cm(adapter):
    a, m = adapter
    p = a.read_pose()
    t = p.translated((0, 0, -100))
    lc = a.check_line(p, t)
    assert lc.ok, lc.reason
    r = a.move_linear(t, 100, timeout_s=5)
    assert r.ok, r.error
    assert r.details["ok_lt_1mm"]
    assert abs(a.read_pose().z - t.z) < 1.0


def test_unknown_task_refused(adapter):
    a, m = adapter
    r = a.run_task("porta", {"place": "SCARTI"}, 5)
    assert not r.ok and "Nessun task" in r.error and "play" not in m.state.commands


def test_guard_dead_without_heartbeat(adapter):
    assert adapter[0].guard_alive() is False
