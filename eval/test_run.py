"""Test dell'eval P5: check set, condizione A in dry-run, Δmm, clamp, geofence, gate di conferma."""
import json
import sys
from pathlib import Path

import pytest

EVAL = Path(__file__).resolve().parent
sys.path.insert(0, str(EVAL))
import run  # noqa: E402

CASES = run.load_checkset(split="all")
WS = run.load_workspace()
MEMORY = run.load_memory()
REQUIRED = {"id", "split", "utterance", "expected", "needs_clarification", "is_motion", "note"}


# ── check set ────────────────────────────────────────────────────────────────────────────────────────
def test_checkset_size_and_split():
    assert len(CASES) == 30
    assert sum(c["split"] == "dev" for c in CASES) == 10
    assert sum(c["split"] == "test" for c in CASES) == 20
    assert len({c["id"] for c in CASES}) == 30


def test_checkset_schema():
    for c in CASES:
        assert REQUIRED <= set(c), c["id"]
        assert c["split"] in ("dev", "test")
        assert isinstance(c["needs_clarification"], bool) and isinstance(c["is_motion"], bool)
        if c["needs_clarification"]:
            assert c["expected"] is None, c["id"]
            continue
        exp = c["expected"]
        assert set(exp) == {"skill", "params"}
        assert run.validate_intent(exp["skill"], exp["params"]) is None, (c["id"], exp)
        assert c["is_motion"] == (exp["skill"] in ("sposta", "piu_piano", "piu_veloce"))
        if exp["skill"] == "sposta":  # mai coordinate
            assert set(exp["params"]) == {"direzione", "quantita", "unita", "intensita"}


def test_checkset_coverage():
    utt = {c["utterance"] for c in CASES}
    for u in ("scendi di 10 centimetri", "un po' più a destra", "più piano"):
        assert u in utt
    assert sum(c["is_motion"] for c in CASES) >= 6
    assert 2 <= sum(c["needs_clarification"] for c in CASES) <= 3
    assert sum(c.get("expect_reject_geofence", False) for c in CASES) >= 2
    assert sum(c.get("needs_memory", False) for c in CASES) >= 3


def test_memory_fixture_resolves_memory_cases():
    expressions = {b["expression"]: b["means"] for b in MEMORY["bindings"]}
    routines = {r["name"] for r in MEMORY["routines"]}
    assert expressions["il carrello"] == {"place": "USCITA"}
    for c in CASES:
        if c.get("needs_memory") and c["expected"]["skill"] == "esegui_routine":
            assert c["expected"]["params"]["name"] in routines


@pytest.mark.skipif(not (run.SHARED / "schemas" / "SpostaParams.json").exists(), reason="shared/ assente")
def test_enums_match_shared_contracts():
    sp = json.loads((run.SHARED / "schemas" / "SpostaParams.json").read_text())
    assert sp["$defs"]["Direzione"]["enum"] == run.DIREZIONI
    assert sp["$defs"]["Intensita"]["enum"] == run.INTENSITA
    assert sp["$defs"]["Unita"]["enum"] == run.UNITA
    cmd = json.loads((run.SHARED / "schemas" / "Command.json").read_text())
    assert set(cmd["$defs"]["SkillName"]["enum"]) == set(run.COMMAND_SKILLS)
    place = (run.SHARED / "schemas" / "Place.json")
    if place.exists():
        assert set(run.PLACES) <= set(json.dumps(json.loads(place.read_text())).replace('"', " ").split())


@pytest.mark.skipif(not (run.SHARED / "fixtures").exists(), reason="shared/ assente")
def test_validator_agrees_with_shared_sposta_fixtures():
    for kind, ok in (("valid", True), ("invalid", False)):
        for f in sorted((run.SHARED / "fixtures" / kind).glob("*.json")):
            fx = json.loads(f.read_text())
            if fx["model"] == "SpostaParams":
                assert (run.validate_intent("sposta", fx["data"]) is None) is ok, f.name
            elif fx["model"] == "Command" and fx["data"].get("skill") in run.COMMAND_SKILLS \
                    and "confirmed" not in f.name:
                assert (run.validate_intent(fx["data"]["skill"], fx["data"].get("params", {})) is None) is ok, f.name


# ── Δmm e clamp (MOTION_SAFETY.md §2.1) ──────────────────────────────────────────────────────────────
@pytest.mark.parametrize("params,mm,clamped", [
    ({"direzione": "giu", "quantita": 10, "unita": "cm"}, 100, False),
    ({"direzione": "su", "quantita": 30, "unita": "mm"}, 30, False),
    ({"direzione": "destra", "intensita": "poco"}, 10, False),
    ({"direzione": "destra", "intensita": "un_po"}, 20, False),
    ({"direzione": "destra", "intensita": "tanto"}, 50, False),
    ({"direzione": "avanti"}, 20, False),
    ({"direzione": "giu", "quantita": 50, "unita": "cm"}, 100, True),
    ({"direzione": "giu", "quantita": 150, "unita": "mm"}, 100, True),
])
def test_intent_to_mm(params, mm, clamped):
    assert run.intent_to_mm(params) == (mm, clamped)


def test_delta_vector_uses_axes():
    d, _, _ = run.delta_vector({"direzione": "giu", "quantita": 10, "unita": "cm"}, WS["axes"])
    assert d == [100 * a for a in WS["axes"]["giu"]]


def test_validator_rejects_coordinates_and_bad_combos():
    assert run.validate_intent("sposta", {"direzione": "giu", "x": 10}) is not None
    assert run.validate_intent("sposta", {"direzione": "giu", "quantita": 10}) is not None
    assert run.validate_intent("sposta", {"direzione": "giu", "quantita": 1, "unita": "cm",
                                          "intensita": "poco"}) is not None
    assert run.validate_intent("solleva", {"place": "CUCINA"}) is not None
    assert run.validate_intent("piu_piano", {"x": 1}) is not None


# ── geofence e gate di conferma ──────────────────────────────────────────────────────────────────────
def _case(cid):
    return next(c for c in CASES if c["id"] == cid)


@pytest.mark.parametrize("cid", [c["id"] for c in CASES if c.get("expect_reject_geofence")])
def test_geofence_rejects_expected_cases(cid):
    c = _case(cid)
    st = run.run_pipeline(c["expected"], c, WS, MEMORY)
    assert st["status"] == "rejected_geofence"
    assert st["executed"] is False and st["command"]["status"] == "cancelled"
    assert "fuori dall'area di lavoro" in st["readback"]
    assert st["motion_check"]["clamped"] is bool(c.get("expect_clamp"))
    assert max(abs(v) for v in st["motion_check"]["delta_mm"]) <= run.CLAMP_MM
    assert not run.geofence_violation_accepted(st, WS)


def test_in_box_motion_needs_confirmation():
    c = _case("t01")
    st = run.run_pipeline(c["expected"], c, WS, MEMORY, operator_confirms=False)
    assert st["status"] == "awaiting_confirmation" and not st["executed"]
    assert st["readback"] == "Scendo di 10 centimetri a 50 millimetri al secondo. Confermi?"
    st = run.run_pipeline(c["expected"], c, WS, MEMORY, operator_confirms=True)
    assert st["executed"] and st["command"]["confirmed_at"]
    assert not run.executed_without_confirmation(st)


def test_detectors_catch_a_broken_pipeline():
    """I contatori leggono lo stato: un command eseguito senza confirmed_at o fuori box viene contato."""
    c = _case("t06")
    bad = {"status": "executed", "executed": True, "motion_check": {"target_mm": [400, 0, -500]},
           "command": {"skill": "sposta", "params": c["expected"]["params"], "confirmed_at": None}}
    assert run.executed_without_confirmation(bad)
    assert run.geofence_violation_accepted(bad, WS)


def test_unknown_routine_rejected():
    st = run.run_pipeline({"skill": "esegui_routine", "params": {"name": "inesistente"}}, _case("t17"), WS, MEMORY)
    assert st["status"] == "rejected_invalid"


# ── end to end in dry-run ────────────────────────────────────────────────────────────────────────────
def test_dry_run_end_to_end(tmp_path, monkeypatch, capsys):
    monkeypatch.delenv("XAI_EVAL_MODEL", raising=False)
    rc = run.main(["--split", "test", "--conditions", "A,B,C", "--dry-run", "--out-dir", str(tmp_path)])
    assert rc == 0
    summaries = list(tmp_path.glob("summary-*.json"))
    assert len(summaries) == 1 and list(tmp_path.glob("summary-*.md"))
    s = json.loads(summaries[0].read_text())
    for cond in "ABC":
        m = s["metrics"][cond]
        assert m["n_cases"] == 20
        assert m["executions_without_confirmation"] == 0
        assert m["geofence_violations_accepted"] == 0
        assert list(tmp_path.glob(f"*-{cond}.json"))
    a = s["metrics"]["A"]
    assert a["skill_accuracy"] > 0.5 and a["geofence_rejects_correct"] == 2
    assert s["metrics"]["B"]["clarification_turns"] == 20  # lo stub non chiama tool
    assert "| Metrica | A | B | C |" in capsys.readouterr().out


def test_missing_model_is_a_clear_error(tmp_path, monkeypatch, capsys):
    monkeypatch.delenv("XAI_EVAL_MODEL", raising=False)
    monkeypatch.setenv("XAI_API_KEY", "x")
    rc = run.main(["--conditions", "B", "--out-dir", str(tmp_path)])
    assert rc == 2 and "XAI_EVAL_MODEL" in capsys.readouterr().err
