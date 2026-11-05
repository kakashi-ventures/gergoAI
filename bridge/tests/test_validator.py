from datetime import datetime, timedelta, timezone

import pytest

from bridge import motion
from bridge.adapters.base import Pose
from bridge.contracts import Event, MotionCheckPayload, SpostaParams, Workspace
from bridge.validator import Context, StationState, validate

NOW = datetime(2026, 11, 5, 12, 0, tzinfo=timezone.utc)
PLACES = {"INGRESSO", "STAZIONE", "USCITA", "SCARTI", "HOME"}
WS = Workspace(frame=1, min_mm=[-200, -300, 30], max_mm=[300, 300, 400])


def skills(status="draft"):
    names = ["solleva", "deposita", "porta", "applica", "home", "stop", "sposta", "piu_piano", "piu_veloce"]
    return {n: {"status": status} for n in names}


def ctx(**kw):
    base = dict(mode="sim", skills=skills(), places=PLACES, now=NOW, workspace=WS,
                pose=Pose(100, 0, 250), guard_alive=True)
    base.update(kw)
    return Context(**base)


def cmd(skill, params=None, age_s=1, **kw):
    return {"id": "c", "skill": skill, "params": params or {}, "status": "confirmed",
            "confirmed_at": (NOW - timedelta(seconds=age_s)).isoformat(), **kw}


# --- intento → mm
@pytest.mark.parametrize("params,mm", [
    ({"direzione": "giu", "quantita": 10, "unita": "cm"}, 100),
    ({"direzione": "giu", "quantita": 15, "unita": "mm"}, 15),
    ({"direzione": "su", "intensita": "poco"}, 10),
    ({"direzione": "su", "intensita": "un_po"}, 20),
    ({"direzione": "su", "intensita": "tanto"}, 50),
    ({"direzione": "su"}, 20),
    ({"direzione": "su", "quantita": 30, "unita": "cm"}, 100),  # clamp
])
def test_amount(params, mm):
    assert motion.amount_mm(SpostaParams(**params))[0] == mm


def test_delta_axes():
    assert motion.delta_mm(SpostaParams(direzione="giu", quantita=1, unita="cm"))[0] == (0, 0, -10)
    assert motion.delta_mm(SpostaParams(direzione="avanti", quantita=1, unita="cm"))[0] == (10, 0, 0)


def test_readback():
    assert motion.readback(SpostaParams(direzione="giu", quantita=10, unita="cm"), 50) == \
        "Scendo di 10 centimetri a 50 millimetri al secondo. Confermi?"


def test_speed():
    assert motion.next_speed(50, "piu_piano") == 25
    assert motion.next_speed(15, "piu_piano") == 10
    assert motion.next_speed(50, "piu_veloce") == 75
    assert motion.next_speed(80, "piu_veloce") == 100


# --- sposta
def test_sposta_ok_and_event_contract():
    d = validate(cmd("sposta", {"direzione": "giu", "quantita": 10, "unita": "cm"}), ctx())
    assert d.ok and d.target.xyz == (100, 0, 150)
    Event(type="motion_check", command_id="c", payload=d.motion_check)
    MotionCheckPayload.model_validate(d.motion_check)


def test_sposta_geofence_z_min():
    d = validate(cmd("sposta", {"direzione": "giu", "quantita": 10, "unita": "cm"}), ctx(pose=Pose(100, 0, 80)))
    assert not d.ok and d.code == "geofence"
    assert d.reason == "arriverei fuori dall'area di lavoro di 5 cm"
    assert d.motion_check["geofence_ok"] is False
    MotionCheckPayload.model_validate(d.motion_check)


def test_sposta_outside_box_side():
    d = validate(cmd("sposta", {"direzione": "avanti", "quantita": 10, "unita": "cm"}), ctx(pose=Pose(290, 0, 200)))
    assert not d.ok and d.motion_check["fuori_di_mm"] == 90


def test_sposta_guard_dead():
    d = validate(cmd("sposta", {"direzione": "su"}), ctx(guard_alive=False))
    assert not d.ok and d.code == "guard_dead"


def test_sposta_tcp_mismatch():
    d = validate(cmd("sposta", {"direzione": "su"}),
                 ctx(tool_expected_tcp_mm=(0, 0, 200), tool_actual_tcp_mm=(0, 0, 0)))
    assert not d.ok and d.code == "tcp_mismatch"


def test_sposta_no_workspace():
    assert validate(cmd("sposta", {"direzione": "su"}), ctx(workspace=None)).code == "no_workspace"


def test_sposta_coordinates_rejected():
    d = validate(cmd("sposta", {"direzione": "su", "z": 10}), ctx())
    assert not d.ok and d.code == "contract"


# --- regole generali
def test_deprecated_rejected():
    s = skills(); s["solleva"]["status"] = "deprecated"
    d = validate(cmd("solleva", {"place": "INGRESSO"}), ctx(skills=s))
    assert not d.ok and d.code == "deprecated"


def test_stale_rejected():
    assert validate(cmd("home", age_s=31), ctx()).code == "stale"


def test_not_confirmed_rejected():
    c = cmd("home"); c["status"] = "queued"; c["confirmed_at"] = None
    assert validate(c, ctx()).code == "not_confirmed"


def test_elite_requires_confirmed():
    assert validate(cmd("home"), ctx(mode="elite")).code == "not_confirmed_skill"
    assert validate(cmd("home"), ctx(mode="elite", skills=skills("confirmed"))).code == "ontology_draft"
    assert validate(cmd("home"), ctx(mode="elite", skills=skills("confirmed"), ontology_status="confirmed")).ok


def test_preconditions():
    assert validate(cmd("deposita", {"place": "USCITA"}), ctx()).code == "precondition"
    assert validate(cmd("applica"), ctx(station=StationState(True, "INGRESSO"))).code == "precondition"
    assert validate(cmd("applica"), ctx(station=StationState(True, "STAZIONE"))).ok
    assert validate(cmd("solleva", {"place": "INGRESSO"}), ctx(station=StationState(True, "HOME"))).code == "precondition"


def test_stop_always_passes():
    assert validate(cmd("stop"), ctx(skills={})).ok
