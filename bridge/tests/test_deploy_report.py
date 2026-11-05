import json
from pathlib import Path

from bridge import deploy_report as dr

FIX = Path(__file__).parent / "fixtures" / "deploy_report_db.json"
SINCE = "2026-11-05T12:00:00+00:00"


def val(rep, sec, key):
    return rep["sezioni"][sec][key]["valore"]


def report(tmp_path):
    return dr.build(dr.FixtureSource(FIX), SINCE, vercel_url="https://gergo.vercel.app", eval_dir=tmp_path / "none")


def test_safety_numbers_exact(tmp_path):
    rep = report(tmp_path)
    assert val(rep, "sicurezza", "comandi eseguiti senza conferma (deve essere 0)") == 0
    assert val(rep, "sicurezza", "movimenti rifiutati dalla geofence") == 2
    assert val(rep, "sicurezza", "rifiuti del validatore") == 4
    assert val(rep, "sicurezza", "rifiuti per codice") == {"deprecated": 1, "geofence": 2, "kinematics": 1}
    assert val(rep, "sicurezza", "stop") == 1
    assert val(rep, "sicurezza", "arresto vocale e acustico: trigger per tipo") == {
        "botta": {"conteggio": 1, "latenza_mediana_ms": 40}, "parola": {"conteggio": 2, "latenza_mediana_ms": 150}}
    assert val(rep, "sicurezza", "motion_check ok") == 1
    assert val(rep, "sicurezza", "motion_check rifiutati") == 2


def test_other_sections(tmp_path):
    rep = report(tmp_path)
    assert val(rep, "comandi", "per stato") == {"done": 2, "failed": 3, "queued": 1}
    assert val(rep, "cicli", "step_end") == 2
    assert val(rep, "cicli", "durata mediana per skill (ms)") == {"deposita": 3000, "solleva": 4000}
    assert val(rep, "cicli", "durata mediana per routine e versione (ms)") == {"etichetta v2": 3500}
    assert val(rep, "ontologia", "versione attiva") == 2
    assert [s["skill"] for s in val(rep, "ontologia", "skill confirmed")] == ["deposita", "solleva"]
    assert val(rep, "ontologia", "skill deprecated")[0]["motivo"] == "spintore smontato"
    assert val(rep, "ontologia", "skill real_ok") == ["solleva"]
    assert val(rep, "memoria", "proposals: per stato") == {"approved": 1, "rejected": 1}
    assert val(rep, "build", "URL produzione") == "https://gergo.vercel.app"
    # ogni numero porta una query dell'appendice
    for items in rep["sezioni"].values():
        for v in items.values():
            if isinstance(v, dict):
                assert v["query"] in rep["query"]


def test_unconfirmed_execution_is_counted(tmp_path):
    data = json.loads(FIX.read_text())
    data["events"].append({"type": "step_start", "ts": "2026-11-05T12:35:10+00:00", "command_id": "c6", "payload": {}})
    f = tmp_path / "db.json"
    f.write_text(json.dumps(data))
    rep = dr.build(dr.FixtureSource(f), SINCE, git=False)
    assert val(rep, "sicurezza", "comandi eseguiti senza conferma (deve essere 0)") == 1


def test_missing_tables_do_not_crash(tmp_path):
    f = tmp_path / "db.json"
    f.write_text(json.dumps({"events": []}))
    rep = dr.build(dr.FixtureSource(f), SINCE, git=False, eval_dir=tmp_path)
    assert "commands" in rep["non_disponibili"] and "bindings" in rep["non_disponibili"]
    assert "non_disponibile" in rep["sezioni"]["comandi"] and "non_disponibile" in rep["sezioni"]["ontologia"]
    assert val(rep, "memoria", "bindings") == "non disponibile"
    assert "Non disponibile" in dr.render_md(rep)


def test_cli_writes_md_and_json(tmp_path, monkeypatch):
    monkeypatch.delenv("XAI_API_KEY", raising=False)
    (tmp_path / "eval").mkdir()
    assert dr.main(["--since", "2026-11-05T13:00", "--out", str(tmp_path / "reports"), "--memory-fixture", str(FIX),
                    "--vercel-url", "https://gergo.vercel.app", "--narrate"]) == 0
    md = list((tmp_path / "reports").glob("deploy-*.md"))
    js = list((tmp_path / "reports").glob("deploy-*.json"))
    assert len(md) == 1 and len(js) == 1 and md[0].stem == js[0].stem
    rep = json.loads(js[0].read_text())
    assert rep["since"] == "2026-11-05T13:00:00+01:00"  # ora di Roma = 12:00 UTC
    assert val(rep, "sicurezza", "movimenti rifiutati dalla geofence") == 2
    text = md[0].read_text()
    assert "## Limiti noti" in text and "L'arresto vocale e acustico è uno stop software rapido" in text
    assert "testo generato" in text and "Appendice: query" in text
    assert "e-stop vocale" not in text.lower()
    assert rep["limiti_noti"] == dr.known_limits()
