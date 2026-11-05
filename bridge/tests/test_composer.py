import threading
import time

from bridge.adapters.sim import SimArm
from bridge.composer import Composer
from bridge.main import Bridge
from bridge.store import MemoryStore, now_iso

FRONTALE = {"name": "frontale", "version": 1, "status": "active", "steps": [
    {"skill": "solleva", "place": "INGRESSO"}, {"skill": "porta", "place": "STAZIONE"},
    {"skill": "attendi_operatore", "prompt": "metti l'etichetta frontale"},
    {"skill": "applica"}, {"skill": "deposita", "place": "USCITA"}]}


def setup(routine=FRONTALE, **sim):
    store = MemoryStore()
    store.routines.append(routine)
    arm = SimArm(time_scale=0.001, seed=1, **sim)
    b = Bridge(store, arm, "sim")
    return store, b, Composer(store, b, feedback_timeout_s=2, poll_s=0.01)


def operator_says_fatto(store, run_id, n=1):
    def go():
        done = 0
        seen = set()
        while done < n:
            for e in list(store.events):
                if e["type"] == "feedback" and e["payload"].get("awaiting") and e["id"] not in seen:
                    seen.add(e["id"])
                    time.sleep(0.02)
                    store.insert_event({"type": "feedback", "routine_run_id": run_id, "payload": {"text": "fatto"}})
                    done += 1
            time.sleep(0.005)
    threading.Thread(target=go, daemon=True).start()


def test_routine_two_cycles():
    store, b, comp = setup()
    store.routine_runs.append({"id": "r1", "routine_name": "frontale", "repetitions": 2,
                               "status": "confirmed", "confirmed_at": now_iso()})
    operator_says_fatto(store, "r1", n=2)
    assert comp.poll_once() == 1
    run = store.routine_runs[0]
    assert run["status"] == "done", store.events
    assert [c["skill"] for c in store.commands] == ["solleva", "porta", "applica", "deposita"] * 2
    assert all(c["status"] == "done" for c in store.commands)
    cycles = [e for e in store.events if e["type"] == "step_end" and e["payload"].get("cycle")]
    assert len(cycles) == 2 and all(c["payload"]["cycle_time_ms"] >= 0 for c in cycles)
    assert run["cycle_time_ms"] >= 0


def test_operator_timeout_fails_run():
    store, b, comp = setup()
    store.routine_runs.append({"id": "r2", "routine_name": "frontale", "status": "confirmed", "confirmed_at": now_iso()})
    comp.feedback_timeout_s = 0.05
    comp.poll_once()
    assert store.routine_runs[0]["status"] == "failed"
    assert any(e["payload"].get("kind") == "operator_timeout" for e in store.events)


def test_failed_step_stops_run():
    store, b, comp = setup(inject=["fail:solleva"])
    store.routine_runs.append({"id": "r3", "routine_name": "frontale", "status": "confirmed", "confirmed_at": now_iso()})
    comp.poll_once()
    assert store.routine_runs[0]["status"] == "failed"
    assert len(store.commands) == 1


def test_stale_run_rejected():
    store, b, comp = setup()
    store.routine_runs.append({"id": "r4", "routine_name": "frontale", "status": "confirmed",
                               "confirmed_at": "2026-11-05T10:00:00+00:00"})
    comp.poll_once()
    assert store.routine_runs[0]["status"] == "failed" and not store.commands


def test_stop_cancels_run():
    store, b, comp = setup()
    store.routine_runs.append({"id": "r5", "routine_name": "frontale", "status": "confirmed", "confirmed_at": now_iso()})

    def stopper():
        while not any(e["type"] == "feedback" for e in store.events):
            time.sleep(0.005)
        b.emergency_stop_software()
    threading.Thread(target=stopper, daemon=True).start()
    comp.poll_once()
    assert store.routine_runs[0]["status"] == "cancelled"
    assert [c["skill"] for c in store.commands] == ["solleva", "porta"]
