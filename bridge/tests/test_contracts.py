import json
from pathlib import Path

import jsonschema
import pytest
from pydantic import ValidationError

from bridge import gen_schemas
from bridge.contracts import MODELS

ROOT = Path(__file__).resolve().parents[2] / "shared"
VALID = sorted((ROOT / "fixtures" / "valid").glob("*.json"))
INVALID = sorted((ROOT / "fixtures" / "invalid").glob("*.json"))


def load(p):
    return json.loads(p.read_text())


@pytest.mark.parametrize("path", VALID, ids=lambda p: p.stem)
def test_valid_fixture(path):
    f = load(path)
    MODELS[f["model"]].model_validate(f["data"])
    # anche lo schema JSON (quello che legge zod) deve accettarla
    schema = load(ROOT / "schemas" / f"{f['model']}.json")
    jsonschema.validate(f["data"], schema)


@pytest.mark.parametrize("path", INVALID, ids=lambda p: p.stem)
def test_invalid_fixture(path):
    f = load(path)
    with pytest.raises(ValidationError):
        MODELS[f["model"]].model_validate(f["data"])


def test_schemas_up_to_date():
    assert gen_schemas.main(check=True) == 0, "rigenera con python -m bridge.gen_schemas"


def test_fixture_counts():
    assert len(VALID) >= 15 and len(INVALID) >= 10
