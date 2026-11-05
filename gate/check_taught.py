"""Gate CI per gli script proposti dalla voce (bridge/taught/*.py): solo dati, valori nei limiti.

Non esegue mai i file: li legge con `ast` e accetta solo una docstring e UNA assegnazione a MOVIMENTO o ROUTINE con
un letterale (dict, liste, stringhe, numeri, True/False/None). Stessi controlli di web/lib/scriptGate.ts.
Uso: python -I gate/check_taught.py [file ...]   (senza argomenti: tutti i file in bridge/taught/)
"""
from __future__ import annotations

import ast
import sys
from pathlib import Path

DIREZIONI = {"su", "giu", "avanti", "indietro", "destra", "sinistra"}
SKILLS = {"solleva", "porta", "deposita", "applica", "home", "attendi_operatore"}
PLACES = {"INGRESSO", "STAZIONE", "USCITA", "SCARTI", "HOME"}
AXIS = {"su": (2, 1), "giu": (2, -1), "avanti": (0, 1), "indietro": (0, -1), "sinistra": (1, 1), "destra": (1, -1)}
MAX_STEP_MM = 100
MAX_TOTAL_AXIS_MM = 300


def check(path: Path) -> list[str]:
    errs: list[str] = []
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    except SyntaxError as e:
        return [f"sintassi: {e}"]
    body = list(tree.body)
    if not (body and isinstance(body[0], ast.Expr) and isinstance(getattr(body[0], "value", None), ast.Constant)
            and "Evidenze nel registro" in str(body[0].value.value)):
        errs.append("manca la docstring con la provenienza e le evidenze")
    else:
        body = body[1:]
    if len(body) != 1 or not isinstance(body[0], ast.Assign) or len(body[0].targets) != 1 \
            or not isinstance(body[0].targets[0], ast.Name) or body[0].targets[0].id not in ("MOVIMENTO", "ROUTINE"):
        return errs + ["deve esserci una sola assegnazione a MOVIMENTO o ROUTINE, nient'altro"]
    name = body[0].targets[0].id
    try:
        data = ast.literal_eval(body[0].value)  # solo letterali: nessuna chiamata, nessun nome
    except Exception as e:  # noqa: BLE001
        return errs + [f"il valore non è un letterale: {e}"]
    steps = data.get("steps", []) if isinstance(data, dict) else []
    if name == "MOVIMENTO":
        tot = [0.0, 0.0, 0.0]
        for k, s in enumerate(steps, 1):
            if set(s) - {"direzione", "quantita", "unita"}:
                errs.append(f"passo {k}: campi non ammessi {sorted(set(s) - {'direzione', 'quantita', 'unita'})} (niente coordinate)")
            if s.get("direzione") not in DIREZIONI:
                errs.append(f"passo {k}: direzione {s.get('direzione')!r}")
            mm = float(s.get("quantita", 0)) * {"cm": 10, "mm": 1}.get(s.get("unita"), float("nan"))
            if not (0 < mm <= MAX_STEP_MM):
                errs.append(f"passo {k}: {s.get('quantita')} {s.get('unita')} fuori da (0, {MAX_STEP_MM}] mm")
            elif s.get("direzione") in AXIS:
                a, sign = AXIS[s["direzione"]]
                tot[a] += sign * mm
        if any(abs(v) > MAX_TOTAL_AXIS_MM for v in tot):
            errs.append(f"spostamento netto {tot} oltre {MAX_TOTAL_AXIS_MM} mm per asse")
        base = data.get("base")
        if base and (base.get("skill") not in SKILLS or (base.get("place") is not None and base.get("place") not in PLACES)):
            errs.append(f"task di base non valido: {base}")
    else:
        if not steps:
            errs.append("routine senza passi")
        for k, s in enumerate(steps, 1):
            if s.get("skill") not in SKILLS:
                errs.append(f"passo {k}: skill {s.get('skill')!r}")
            if s.get("place") is not None and s.get("place") not in PLACES:
                errs.append(f"passo {k}: luogo {s.get('place')!r}")
    return errs


def main(argv: list[str]) -> int:
    root = Path(__file__).resolve().parent.parent
    files = [Path(a) for a in argv] or sorted((root / "bridge" / "taught").glob("*.py"))
    bad = 0
    for f in files:
        if f.name == "__init__.py":
            continue
        errs = check(f)
        print(f"{'OK ' if not errs else 'KO '} {f}")
        for e in errs:
            print(f"    - {e}")
        bad += bool(errs)
    print(f"{len(files)} file, {bad} bocciati")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
