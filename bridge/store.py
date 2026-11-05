"""Accesso ai dati del bridge. SupabaseStore usa PostgREST via HTTP (solo standard library), MemoryStore serve ai
test e alla sim senza DB. Il realtime non c'è: il bridge fa polling ogni 500 ms (taglio previsto da PLAN.md P1).
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Optional


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Store:
    def confirmed_commands(self) -> list[dict]: ...
    def update_command(self, cid: str, fields: dict) -> None: ...
    def cancel_pending(self) -> int: ...
    def insert_event(self, ev: dict) -> dict: ...
    def upsert_bridge_status(self, row: dict) -> None: ...
    def guard_status(self, bridge_id: str) -> Optional[dict]: ...
    def ontology(self) -> dict: ...
    def set_skill_real_ok(self, ontology_version: int, name: str) -> None: ...


class MemoryStore(Store):
    def __init__(self, ontology: Optional[dict] = None):
        self.commands: list[dict] = []
        self.events: list[dict] = []
        self.bridge_status: dict[str, dict] = {}
        self.guard: dict[str, dict] = {}
        self._ontology = ontology or default_ontology()

    def add_command(self, **c) -> dict:
        c.setdefault("id", str(uuid.uuid4()))
        c.setdefault("params", {})
        c.setdefault("status", "confirmed")
        c.setdefault("created_at", now_iso())
        if c["status"] == "confirmed":
            c.setdefault("confirmed_at", now_iso())
        self.commands.append(c)
        return c

    def confirmed_commands(self):
        return [deepcopy(c) for c in self.commands if c["status"] == "confirmed"]

    def update_command(self, cid, fields):
        for c in self.commands:
            if c["id"] == cid:
                c.update(fields)

    def cancel_pending(self):
        n = 0
        for c in self.commands:
            if c["status"] in ("queued", "confirmed"):
                c["status"] = "cancelled"
                n += 1
        return n

    def insert_event(self, ev):
        ev = {"id": str(uuid.uuid4()), "ts": now_iso(), **ev}
        self.events.append(ev)
        return ev

    def upsert_bridge_status(self, row):
        self.bridge_status[row["bridge_id"]] = {**row, "last_heartbeat_at": now_iso()}

    def guard_status(self, bridge_id):
        return self.guard.get(bridge_id)

    def ontology(self):
        return deepcopy(self._ontology)

    def set_skill_real_ok(self, ontology_version, name):
        for s in self._ontology["skills"]:
            if s["name"] == name:
                s["real_ok"] = True


def default_ontology() -> dict:
    names = {"solleva": "primitive", "deposita": "primitive", "porta": "primitive", "applica": "primitive",
             "home": "primitive", "stop": "primitive", "sposta": "motion", "piu_piano": "session",
             "piu_veloce": "session"}
    return {
        "version": 1, "status": "draft",
        "places": ["INGRESSO", "STAZIONE", "USCITA", "SCARTI", "HOME"],
        "skills": [{"name": n, "kind": k, "status": "draft", "jbi": None, "sim_ok": False, "real_ok": False}
                   for n, k in names.items()],
        "workspace": {"frame": 1, "min_mm": [-200, -300, 30], "max_mm": [300, 300, 400], "source": "sim"},
        "tool": {"nome": "flangia", "tcp_atteso_mm": [0, 0, 0]},
    }


class SupabaseStore(Store):
    def __init__(self, url: Optional[str] = None, key: Optional[str] = None, timeout: float = 5.0):
        self.url = (url or os.environ["SUPABASE_URL"]).rstrip("/") + "/rest/v1"
        self.key = key or os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        self.timeout = timeout

    def _req(self, method: str, path: str, body: Any = None, prefer: Optional[str] = None) -> Any:
        headers = {"apikey": self.key, "Authorization": f"Bearer {self.key}", "Content-Type": "application/json"}
        if prefer:
            headers["Prefer"] = prefer
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.url + path, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                raw = r.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"supabase {method} {path}: {e.code} {e.read()[:300]!r}") from None

    def confirmed_commands(self):
        return self._req("GET", "/commands?status=eq.confirmed&order=confirmed_at.asc&limit=20") or []

    def update_command(self, cid, fields):
        self._req("PATCH", f"/commands?id=eq.{cid}", fields, prefer="return=minimal")

    def cancel_pending(self):
        rows = self._req("PATCH", "/commands?status=in.(queued,confirmed)", {"status": "cancelled"},
                         prefer="return=representation") or []
        return len(rows)

    def insert_event(self, ev):
        rows = self._req("POST", "/events", ev, prefer="return=representation")
        return rows[0] if rows else ev

    def upsert_bridge_status(self, row):
        self._req("POST", "/bridge_status?on_conflict=bridge_id", {**row, "last_heartbeat_at": now_iso()},
                  prefer="resolution=merge-duplicates,return=minimal")

    def guard_status(self, bridge_id):
        rows = self._req("GET", f"/guard_status?bridge_id=eq.{urllib.parse.quote(bridge_id)}") or []
        return rows[0] if rows else None

    def ontology(self):
        ov = self._req("GET", "/ontology_versions?order=version.desc&limit=1") or []
        if not ov:
            raise RuntimeError("nessuna ontologia: applica le migration 1xxx_")
        v = ov[0]["version"]
        skills = self._req("GET", f"/skills?ontology_version=eq.{v}") or []
        places = [p["name"] for p in (self._req("GET", f"/places?ontology_version=eq.{v}") or [])]
        ws = self._req("GET", "/workspace?attivo=is.true&limit=1") or []
        tool = self._req("GET", "/tools?attivo=is.true&limit=1") or []
        return {"version": v, "status": ov[0]["status"], "places": places, "skills": skills,
                "workspace": ws[0] if ws else None, "tool": tool[0] if tool else None}

    def set_skill_real_ok(self, ontology_version, name):
        self._req("PATCH", f"/skills?ontology_version=eq.{ontology_version}&name=eq.{name}",
                  {"real_ok": True}, prefer="return=minimal")
