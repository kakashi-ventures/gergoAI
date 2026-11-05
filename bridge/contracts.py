"""Contratti di Gergo (contracts-v1). Fonte di verità per pydantic; gli schemi JSON in /shared/schemas
sono generati da questo file con `python -m shared.tools.gen_schemas` e un test verifica che coincidano.

Regola: Grok non emette mai coordinate. I params dei comandi sono enum e numeri piccoli; i Δ in mm e i target
li calcola il codice (MOTION_SAFETY.md §2).
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Annotated, Any, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, model_validator

CONTRACTS_VERSION = "contracts-v1"


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---------------------------------------------------------------- enum di base

class PlaceName(str, Enum):
    INGRESSO = "INGRESSO"
    STAZIONE = "STAZIONE"
    USCITA = "USCITA"
    SCARTI = "SCARTI"
    HOME = "HOME"


class SkillName(str, Enum):
    solleva = "solleva"
    deposita = "deposita"
    porta = "porta"
    applica = "applica"
    home = "home"
    stop = "stop"
    sposta = "sposta"
    piu_piano = "piu_piano"
    piu_veloce = "piu_veloce"


class Direzione(str, Enum):
    su = "su"
    giu = "giu"
    avanti = "avanti"
    indietro = "indietro"
    destra = "destra"
    sinistra = "sinistra"


class Unita(str, Enum):
    mm = "mm"
    cm = "cm"


class Intensita(str, Enum):
    poco = "poco"
    un_po = "un_po"
    tanto = "tanto"


class SkillStatus(str, Enum):
    draft = "draft"
    confirmed = "confirmed"
    deprecated = "deprecated"


# ---------------------------------------------------------------- params dei comandi

class PlaceParams(Strict):
    place: PlaceName


class EmptyParams(Strict):
    pass


class SpostaParams(Strict):
    """Intento di spostamento relativo. MAI coordinate: solo enum e una quantità."""
    direzione: Direzione
    quantita: Optional[float] = Field(default=None, gt=0, le=1000)
    unita: Optional[Unita] = None
    intensita: Optional[Intensita] = None

    @model_validator(mode="after")
    def _coerenza(self) -> "SpostaParams":
        if self.quantita is not None and self.unita is None:
            raise ValueError("quantita senza unita")
        if self.unita is not None and self.quantita is None:
            raise ValueError("unita senza quantita")
        if self.quantita is not None and self.intensita is not None:
            raise ValueError("quantita e intensita sono alternative")
        return self


SKILLS_WITH_PLACE = {SkillName.solleva, SkillName.deposita, SkillName.porta}
SKILLS_NO_PARAMS = {SkillName.applica, SkillName.home, SkillName.stop,
                    SkillName.piu_piano, SkillName.piu_veloce}


def validate_params(skill: SkillName, params: dict) -> BaseModel:
    if skill in SKILLS_WITH_PLACE:
        return PlaceParams.model_validate(params)
    if skill == SkillName.sposta:
        return SpostaParams.model_validate(params)
    return EmptyParams.model_validate(params)


# ---------------------------------------------------------------- ontologia

class Place(Strict):
    name: PlaceName
    label: Optional[str] = None


class Skill(Strict):
    name: SkillName
    kind: Literal["primitive", "composite", "motion", "session"]
    params_schema: dict[str, Any] = Field(default_factory=dict)
    preconditions: list[str] = Field(default_factory=list)
    effects: list[str] = Field(default_factory=list)
    jbi: Optional[str] = Field(default=None, description="nome del file JBI sul controller EC")
    status: SkillStatus = SkillStatus.draft
    confirmed_by: Optional[str] = None
    confirmed_at: Optional[datetime] = None
    sim_ok: bool = False
    real_ok: bool = False

    @model_validator(mode="after")
    def _conferma(self) -> "Skill":
        if self.status == SkillStatus.confirmed:
            if not self.sim_ok:
                raise ValueError("una skill confirmed richiede sim_ok = true")
            if not self.confirmed_by or not self.confirmed_at:
                raise ValueError("una skill confirmed richiede confirmed_by e confirmed_at")
        return self


class Tool(Strict):
    nome: str = Field(min_length=1)
    tcp_atteso_mm: list[float] = Field(min_length=3, max_length=3,
                                      description="offset x, y, z del TCP dalla flangia in mm")


class Workspace(Strict):
    frame: int = Field(ge=0, le=7, description="coordinate_num del frame utente (EC 0–7)")
    min_mm: list[float] = Field(min_length=3, max_length=3)
    max_mm: list[float] = Field(min_length=3, max_length=3)

    @model_validator(mode="after")
    def _box(self) -> "Workspace":
        if any(lo >= hi for lo, hi in zip(self.min_mm, self.max_mm)):
            raise ValueError("min_mm deve essere < max_mm su ogni asse")
        return self


class OntologyVersion(Strict):
    version: int = Field(ge=1)
    places: list[Place]
    skills: list[Skill]
    tools: list[Tool] = Field(default_factory=list)
    workspace: Optional[Workspace] = None
    status: Literal["draft", "confirmed"] = "draft"
    confirmed_by: Optional[str] = None
    confirmed_at: Optional[datetime] = None


class Binding(Strict):
    expression: str = Field(min_length=1)
    means: dict[str, Any]
    alpha: float = Field(default=1, ge=0)
    beta: float = Field(default=1, ge=0)
    regime: Literal["WORKING", "CANONICAL"] = "WORKING"
    uses: int = Field(default=0, ge=0)
    last_used: Optional[datetime] = None


class RoutineStep(Strict):
    skill: Union[SkillName, Literal["attendi_operatore"]]
    place: Optional[PlaceName] = None
    prompt: Optional[str] = None
    params: Optional[dict[str, Any]] = None


class Routine(Strict):
    name: str = Field(min_length=1)
    version: int = Field(ge=1)
    parent_version: Optional[int] = None
    edited_from_version: Optional[int] = None
    steps: list[RoutineStep] = Field(min_length=1)
    taught_by_voice: bool = False
    source_utterance: Optional[str] = None
    status: Literal["draft", "active", "deprecated"] = "draft"


# ---------------------------------------------------------------- comando e sessione

class Command(Strict):
    id: str
    skill: SkillName
    params: dict[str, Any] = Field(default_factory=dict)
    routine_run_id: Optional[str] = None
    step: Optional[int] = None
    status: Literal["queued", "confirmed", "running", "done", "failed", "cancelled"] = "queued"
    created_at: Optional[datetime] = None
    confirmed_at: Optional[datetime] = None
    readback: Optional[str] = Field(default=None, description="frase di rilettura scritta dal codice")

    @model_validator(mode="after")
    def _params(self) -> "Command":
        validate_params(self.skill, self.params)
        if self.status in ("confirmed", "running", "done") and self.confirmed_at is None:
            raise ValueError("un command confermato richiede confirmed_at")
        return self


VELOCITA_DEFAULT_MM_S = 50.0
VELOCITA_MIN_MM_S = 10.0
VELOCITA_MAX_MM_S = 100.0


class SessionState(Strict):
    velocita_mm_s: float = Field(default=VELOCITA_DEFAULT_MM_S, ge=VELOCITA_MIN_MM_S, le=VELOCITA_MAX_MM_S)
    tool: Optional[str] = None


# ---------------------------------------------------------------- eventi

EventType = Literal[
    "utterance", "interpretation", "confirmation", "correction", "step_start", "step_end",
    "feedback", "stop", "anomaly", "proposal", "approval", "safety_trigger", "motion_check",
    "speed_change",
]


class SafetyTriggerPayload(Strict):
    trigger: Literal["parola", "botta", "urlo", "sfregamento", "heartbeat"]
    latency_ms: float = Field(ge=0)
    features: dict[str, Any] = Field(default_factory=dict)


class MotionCheckPayload(Strict):
    command_id: str
    delta_mm: list[float] = Field(min_length=3, max_length=3)
    pose_mm: Optional[list[float]] = Field(default=None, min_length=3, max_length=3)
    target_mm: Optional[list[float]] = Field(default=None, min_length=3, max_length=3)
    geofence_ok: bool
    fuori_di_mm: Optional[float] = None
    kinematics_ok: Optional[bool] = None
    kinematics_reason: Optional[str] = None
    velocita_mm_s: float
    ok: bool
    reason: Optional[str] = None


class SpeedChangePayload(Strict):
    da_mm_s: float
    a_mm_s: float


class Event(Strict):
    id: Optional[str] = None
    ts: Optional[datetime] = None
    type: EventType
    routine_run_id: Optional[str] = None
    command_id: Optional[str] = None
    step: Optional[int] = None
    payload: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _payload(self) -> "Event":
        if self.type == "safety_trigger":
            SafetyTriggerPayload.model_validate(self.payload)
        elif self.type == "motion_check":
            MotionCheckPayload.model_validate(self.payload)
        elif self.type == "speed_change":
            SpeedChangePayload.model_validate(self.payload)
        return self


class Observation(Strict):
    id: Optional[str] = None
    kind: Literal["anomaly", "pattern"]
    rule: Literal["slow_step", "repeated_failure", "repeated_correction", "repeated_sequence",
                  "redundant_step", "safety_pattern"]
    evidence: list[str] = Field(min_length=1)
    summary: str


class ProposalChange(Strict):
    routine: str
    from_version: int
    to_version: int
    diff: str


class Proposal(Strict):
    id: Optional[str] = None
    observation_id: str
    change: ProposalChange
    status: Literal["pending", "approved", "rejected", "reverted"] = "pending"
    metric: str = "cycle_time_ms"
    before: Optional[float] = None
    after: Optional[float] = None


class BridgeStatus(Strict):
    bridge_id: str
    mode: Literal["sim", "elite"]
    ontology_version: Optional[int] = None
    adapter: str
    last_command_id: Optional[str] = None
    velocita_mm_s: float = VELOCITA_DEFAULT_MM_S
    guard_alive: bool = False
    ts: Optional[datetime] = None


MODELS: dict[str, type[BaseModel]] = {
    "Place": Place, "Skill": Skill, "OntologyVersion": OntologyVersion, "Binding": Binding,
    "Routine": Routine, "Command": Command, "Event": Event, "Observation": Observation,
    "Proposal": Proposal, "SpostaParams": SpostaParams, "SessionState": SessionState,
    "Tool": Tool, "Workspace": Workspace, "SafetyTriggerPayload": SafetyTriggerPayload,
    "MotionCheckPayload": MotionCheckPayload, "BridgeStatus": BridgeStatus,
}
