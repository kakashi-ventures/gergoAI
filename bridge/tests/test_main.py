import time
from datetime import datetime, timedelta, timezone

from bridge.adapters.sim import SimArm
from bridge.contracts import Event
from bridge.main import Bridge
from bridge.store import MemoryStore


def setup(**sim):
    store = MemoryStore()
    arm = SimArm(time_scale=0.001, seed=1, **sim)
    return store, arm, Bridge(store, arm, "sim")


def types(store):
    return [e["type"] for e in store.events]


def test_primitive_runs_and_writes_step_end():
    store, arm, b = setup()
    c = store.add_command(skill="solleva", params={"place": "INGRESSO"})
    b.poll_once()
    assert store.commands[0]["status"] == "done"
    end = [e for e in store.events if e["type"] == "step_end"][0]
    assert end["payload"]["ok"] and end["payload"]["duration_ms"] > 0 and end["command_id"] == c["id"]
    assert b.station.fork_loaded and b.station.at == "INGRESSO"
    for e in store.events:
        Event.model_validate({k: v for k, v in e.items() if k != "id"} | {"id": e["id"]})


def test_deprecated_skill_rejected_with_anomaly():
    store, arm, b = setup()
    for s in store._ontology["skills"]:
        if s["name"] == "home":
            s["status"] = "deprecated"
    store.add_command(skill="home")
    b.poll_once()
    assert store.commands[0]["status"] == "failed"
    an = [e for e in store.events if e["type"] == "anomaly"][0]
    assert an["payload"]["code"] == "deprecated"


def test_sposta_moves_and_checks():
    store, arm, b = setup()
    store.add_command(skill="sposta", params={"direzione": "giu", "quantita": 10, "unita": "cm"})
    b.poll_once()
    assert store.commands[0]["status"] == "done", store.events
    assert arm.pose.z == 200  # HOME z 300 → 200
    mc = [e for e in store.events if e["type"] == "motion_check"][0]["payload"]
    assert mc["ok"] and mc["geofence_ok"] and mc["kinematics_ok"]
    end = [e for e in store.events if e["type"] == "step_end"][0]["payload"]
    assert end["spostamento_reale_mm"] == [0, 0, -100]


def test_sposta_geofence_reject():
    store, arm, b = setup()
    for _ in range(3):
        store.add_command(skill="sposta", params={"direzione": "giu", "quantita": 10, "unita": "cm"})
        b.poll_once()
    # 300 → 200 → 100 → (0 < z_min 30) rifiutato
    assert [c["status"] for c in store.commands] == ["done", "done", "failed"]
    assert arm.pose.z == 100
    last = [e for e in store.events if e["type"] == "anomaly"][-1]["payload"]
    assert last["code"] == "geofence" and "fuori dall'area di lavoro di 3 cm" in last["reason"]


def test_sposta_kinematics_reject():
    store, arm, b = setup(singular_x_above=160)
    store.add_command(skill="sposta", params={"direzione": "avanti", "quantita": 5, "unita": "cm"})
    b.poll_once()
    assert store.commands[0]["status"] == "failed"
    assert [e for e in store.events if e["type"] == "anomaly"][0]["payload"]["code"] == "kinematics"


def test_guard_dead_blocks_motion_but_not_stop():
    store, arm, b = setup(guard=False)
    b.last_guard_alive = time.monotonic() - 2
    store.add_command(skill="sposta", params={"direzione": "su"})
    b.poll_once()
    assert store.commands[0]["status"] == "failed"
    assert [e for e in store.events if e["type"] == "anomaly"][0]["payload"]["code"] == "guard_dead"


def test_guard_status_table_keeps_motion_alive():
    store, arm, b = setup(guard=False)
    store.guard["pavia-postazione-1"] = {"alive": True, "last_heartbeat_at": datetime.now(timezone.utc).isoformat()}
    store.add_command(skill="sposta", params={"direzione": "su"})
    b.poll_once()
    assert store.commands[0]["status"] == "done"


def test_speed_session():
    store, arm, b = setup()
    store.add_command(skill="piu_piano")
    b.poll_once()
    assert b.speed == 25
    ev = [e for e in store.events if e["type"] == "speed_change"][0]["payload"]
    assert ev == {"da_mm_s": 50, "a_mm_s": 25}


def test_stale_command_rejected():
    store, arm, b = setup()
    store.add_command(skill="home", confirmed_at=(datetime.now(timezone.utc) - timedelta(seconds=40)).isoformat())
    b.poll_once()
    assert store.commands[0]["status"] == "failed"


def test_stop_cancels_queue():
    store, arm, b = setup()
    store.add_command(skill="stop")
    store.add_command(skill="home")
    store.add_command(skill="porta", params={"place": "USCITA"}, status="queued")
    b.poll_once()
    assert [c["status"] for c in store.commands] == ["done", "cancelled", "cancelled"]
    assert "stop" in types(store)


def test_inject_fail():
    store, arm, b = setup(inject=["fail:solleva"])
    store.add_command(skill="solleva", params={"place": "INGRESSO"})
    b.poll_once()
    assert store.commands[0]["status"] == "failed"
    assert "anomaly" in types(store)


# --- make_adapter in mode elite: mai un ripiego silenzioso sul dry-run (richiesta FONDAMENTA 14:22) ------------

def test_elite_mode_uses_cs_adapter_not_dryrun(monkeypatch):
    from bridge.adapters.dryrun import DryRunElite
    from bridge.adapters.elite import EliteCsAdapter
    from bridge.main import make_adapter
    monkeypatch.setenv("ELITE_HOST", "10.0.0.9")
    monkeypatch.setenv("ELITE_MODE", "dry-run")
    monkeypatch.setenv("ELITE_SERIES", "CS")
    monkeypatch.setenv("ELITE_DASHBOARD_PORT", "29999")
    a = make_adapter("elite", [], dry_run=False, sim_guard=False)
    assert isinstance(a, EliteCsAdapter) and not isinstance(a, DryRunElite)
    assert a.cs.host == "10.0.0.9" and a.cs.mode == "dry-run" and a.cs.ports[0] == 29999


def test_elite_mode_explicit_dry_run_flag_keeps_dryrun_adapter():
    from bridge.adapters.dryrun import DryRunElite
    from bridge.main import make_adapter
    assert isinstance(make_adapter("elite", [], dry_run=True, sim_guard=False), DryRunElite)


def test_elite_mode_rejects_non_cs_series():
    import pytest
    from bridge.main import elite_adapter_from_env
    with pytest.raises(SystemExit):
        elite_adapter_from_env({"ELITE_SERIES": "EC"})


# --- sim_ok: un passo riuscito in sim rende la skill confermabile (prima nessuno lo scriveva) -----------------

def _flags(store, name):
    return [s for s in store.ontology()["skills"] if s["name"] == name][0]


def test_sim_success_sets_sim_ok_for_task_sposta_and_session():
    store, arm, b = setup()
    for name in ("solleva", "sposta", "piu_piano"):
        assert not _flags(store, name).get("sim_ok")
    store.add_command(skill="solleva", params={"place": "INGRESSO"}); b.poll_once()
    store.add_command(skill="sposta", params={"direzione": "giu", "quantita": 2, "unita": "cm"}); b.poll_once()
    store.add_command(skill="piu_piano"); b.poll_once()
    for name in ("solleva", "sposta", "piu_piano"):
        assert _flags(store, name)["sim_ok"] is True, name
        assert not _flags(store, name).get("real_ok"), name


def test_sim_failure_does_not_set_sim_ok():
    store, arm, b = setup(inject=["fail:solleva"])
    store.add_command(skill="solleva", params={"place": "INGRESSO"}); b.poll_once()
    assert store.commands[0]["status"] == "failed"
    assert not _flags(store, "solleva").get("sim_ok")
