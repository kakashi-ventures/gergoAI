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


def test_guard_heartbeat_file(tmp_path, adapter):
    import json
    a = adapter[0]
    f = tmp_path / "hb.json"
    a.heartbeat_file = str(f)
    f.write_text(json.dumps({"alive": True}))
    assert a.guard_alive()
    f.write_text(json.dumps({"alive": False}))
    assert not a.guard_alive()


def test_make_adapter_elite_uses_cs_adapter(monkeypatch):
    """--mode elite deve dare EliteCsAdapter, mai un dry-run silenzioso."""
    from bridge.main import make_adapter
    monkeypatch.setenv("ELITE_HOST", "127.0.0.1")
    monkeypatch.setenv("ELITE_MODE", "dry-run")
    a = make_adapter("elite", [], dry_run=False, sim_guard=False)
    assert isinstance(a, EliteCsAdapter) and a.cs.mode == "dry-run"
    assert type(make_adapter("elite", [], dry_run=True, sim_guard=False)).__name__ == "DryRunElite"


def _close_primary(m):
    """Come in sala il 05/11: pendant in LOCAL con il controllo remoto abilitato → 30001 rifiuta."""
    s = m.servers[1]
    s.shutdown()
    s.server_close()


def test_read_only_starts_without_primary_and_refuses_motion():
    m = MockController()
    try:
        _close_primary(m)
        c = CsController(m.host, "read-only", m.dashboard_port, m.primary_port, m.rtsi_port, log=lambda s: None)
        a = EliteCsAdapter(controller=c)
        a.connect()
        st = a.status()
        assert st.connected and not st.robot_ready and "Primary" in st.message and st.tcp_mm is None
        p = a.read_pose()  # la posa arriva da RTSI
        lc = a.check_line(p, p.translated((0, 0, -10)))
        assert not lc.ok and "cinematica non disponibile" in lc.reason
        assert not m.state.scripts
    finally:
        m.close()


def test_armed_requires_primary():
    m = MockController()
    try:
        _close_primary(m)
        c = CsController(m.host, "armed", m.dashboard_port, m.primary_port, m.rtsi_port, confirm=lambda s: True,
                         log=lambda s: None)
        with pytest.raises(OSError):
            EliteCsAdapter(controller=c).connect()
    finally:
        m.close()
