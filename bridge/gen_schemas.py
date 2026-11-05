"""Genera /shared/schemas/*.json dai modelli pydantic. `python -m bridge.gen_schemas [--check]`."""
import json
import sys
from pathlib import Path

from bridge.contracts import MODELS

OUT = Path(__file__).resolve().parent.parent / "shared" / "schemas"


def render(name, model) -> str:
    schema = model.model_json_schema()
    schema = {"$schema": "https://json-schema.org/draft/2020-12/schema", "$id": f"gergo/{name}.json", **schema}
    return json.dumps(schema, indent=2, ensure_ascii=False, sort_keys=True) + "\n"


def main(check: bool = False) -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    stale = []
    for name, model in MODELS.items():
        path = OUT / f"{name}.json"
        text = render(name, model)
        if check:
            if not path.exists() or path.read_text() != text:
                stale.append(name)
        else:
            path.write_text(text)
    if stale:
        print("schemi non aggiornati:", ", ".join(stale))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main("--check" in sys.argv))
