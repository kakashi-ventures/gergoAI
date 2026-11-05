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
