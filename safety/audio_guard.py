"""audio_guard — arresto vocale e acustico di Gergo (MOTION_SAFETY.md §3).

È uno STOP SOFTWARE RAPIDO, in più rispetto all'e-stop fisico e alla rilevazione di collisione del controller,
mai al loro posto. Non è un e-stop e non va chiamato così.

Pipeline: frame da 20 ms → AudioGuardDetector (parola / botta / urlo / sfregamento) → Stopper.stop() SUBITO,
nel thread che ha ricevuto l'audio → solo dopo, in un thread separato, callback ed event su Supabase.
Heartbeat ogni 250 ms (guard_status). Fail-safe: stream in errore o nessun frame per > 500 ms → stop e alive=false.

Dipendenze: solo stdlib. Opzionali: `numpy` (spettro più veloce), `vosk` (parola chiave), `sounddevice` (microfono).

Scelte dei descrittori (documentate come chiesto):
  * botta: energia su sotto-blocchi da 5 ms; salita > 15 dB rispetto al minimo dei 2 sotto-blocchi precedenti
    (finestra < 10 ms), livello > baseline + 15 dB, crest factor (picco/RMS) > 3.5 misurato sui 10 ms formati dal
    sotto-blocco della salita e dal successivo (+5 ms di attesa: separa un impulso dall'attacco di un tono).
  * centroide, flatness, energia in banda alta: spettro di Welch con DFT da 64 punti e finestra di Hann
    (bin da 250 Hz a 16 kHz), mediato sui 5 blocchi del frame. NON è un proxy da zero-crossing: è una DFT vera,
    con numpy se c'è, altrimenti con tabelle cos/sin precalcolate in puro Python (~3 ms a frame). Si calcola
    solo quando serve (RMS sopra soglia per l'urlo, oppure braccio in movimento per lo sfregamento).
  * urlo: RMS del frame > riferimento + 20 dB e centroide > 1200 Hz per >= 100 ms consecutivi.
    Riferimento = baseline "moto" se il braccio si muove e c'è, altrimenti baseline "sala".
  * sfregamento (solo moving=True): energia in banda alta (>= 4 kHz) > profilo moto + 10 dB e flatness >
    profilo moto + 0.1 per >= 300 ms consecutivi. Priorità 3, si taglia per primo.
"""
from __future__ import annotations

import argparse
import array
import json
import logging
import math
import os
import queue
import socket
import struct
import sys
import threading
import time
import urllib.request
import wave
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Optional, Protocol, Sequence

try:  # opzionale: accelera solo lo spettro
    import numpy as _np  # type: ignore
except Exception:  # pragma: no cover
    _np = None

log = logging.getLogger("safety.audio_guard")

BASELINE_DIR = Path(__file__).resolve().parent / "baseline"
KEYWORDS = ("stop", "fermo", "basta", "alt")
# Words of the voice commands, in the grammar but NOT triggers. With only the stop words in the grammar Vosk forced
# every utterance onto the nearest one: measured 05/11 on Italian TTS, "sposta su di dieci centimetri" → stop+basta,
# "sì conferma" → stop+fermo, so every voice command stopped the arm. Real "stop"/"fermo"/"basta" still trigger.
DISTRACTORS = ("sposta", "spostati", "su", "giù", "destra", "sinistra", "avanti", "indietro", "di", "a", "e",
               "centimetri", "centimetro", "millimetri", "uno", "due", "tre", "quattro", "cinque", "sei", "sette",
               "otto", "nove", "dieci", "sì", "no", "conferma", "confermo", "annulla", "più", "piano", "veloce",
               "braccio", "salva", "angolo", "esegui", "routine", "poco", "un", "po", "tanto", "vai", "ok", "fatto",
               "prova", "test", "porta", "solleva", "deposita", "applica", "home", "stazione", "ingresso", "uscita")
PRIORITY = {"parola": 1, "botta": 1, "urlo": 2, "sfregamento": 3}
EPS = 1e-12


# ====================================================================== stopper

class Stopper(Protocol):
    def stop(self) -> None: ...


class DashboardStopper:
    """Fallback minimale verso la Dashboard Shell dei controller Elite CS (TCP 29999, righe terminate da "\\n").

    Connessione persistente: si apre in `connect()` (chiamato all'avvio di AudioGuard) così lo stop non paga
    l'handshake; se la connessione è caduta, `stop()` riconnette e riprova una volta. Il client vero sarà
    gergo_sdk: qui serve solo `stop()`.
    """

    def __init__(self, host: str, port: int = 29999, timeout: float = 0.5):
        self.host, self.port, self.timeout = host, port, timeout
        self._sock: Optional[socket.socket] = None
        self._rfile = None
        self._lock = threading.Lock()
        self.last_reply: Optional[str] = None

    def connect(self) -> None:
        with self._lock:
            self._connect_locked()

    def _connect_locked(self) -> None:
        self._close_locked()
        s = socket.create_connection((self.host, self.port), timeout=self.timeout)
        s.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        s.settimeout(self.timeout)
        self._sock, self._rfile = s, s.makefile("rb")
        welcome = self._rfile.readline()
        log.info("dashboard %s:%s: %s", self.host, self.port, welcome.decode(errors="replace").strip())

    def _close_locked(self) -> None:
        for c in (self._rfile, self._sock):
            try:
                if c is not None:
                    c.close()
            except OSError:
                pass
        self._sock = self._rfile = None

    def close(self) -> None:
        with self._lock:
            self._close_locked()

    def stop(self) -> None:
        with self._lock:
            last_err: Optional[Exception] = None
            for _ in range(2):
                try:
                    if self._sock is None:
                        self._connect_locked()
                    self._sock.sendall(b"stop\n")
                    self.last_reply = self._rfile.readline().decode(errors="replace").strip()
                    if not self.last_reply:
                        raise ConnectionError("dashboard: risposta vuota (connessione chiusa)")
                    return
                except (OSError, ConnectionError) as e:
                    last_err = e
                    self._close_locked()
            raise ConnectionError(f"dashboard stop fallito: {last_err}")


class PrintStopper:
    """--dry-run: stampa invece di inviare."""

    def __init__(self) -> None:
        self.calls = 0

    def stop(self) -> None:
        self.calls += 1
        print(f"[dry-run] STOP #{self.calls} @ {time.strftime('%H:%M:%S')}", file=sys.stderr, flush=True)


# ====================================================================== dati

@dataclass
class Trigger:
    type: str                      # parola | botta | urlo | sfregamento
    priority: int
    features: dict[str, Any]
    t_sound: float                 # tempo di stream (s) della fine del frame che ha fatto scattare il trigger
    t_onset: float                 # stima dell'inizio dell'evento sonoro (s, stesso orologio)

    @property
    def window_ms(self) -> float:
        return (self.t_sound - self.t_onset) * 1000.0


@dataclass
class Baseline:
    rms_db: float = -50.0          # dBFS (RMS media del periodo)
    centroid_hz: float = 800.0
    flatness: float = 0.3
    hf_db: float = -70.0           # energia >= 4 kHz, stessa scala di _spectrum_features
    sample_rate: int = 16000
    label: str = "default"
    seconds: float = 0.0

    def save(self, path: Optional[Path] = None) -> Path:
        path = path or BASELINE_DIR / f"{self.label}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(asdict(self), indent=2))
        return path

    @classmethod
    def load(cls, path: Path) -> "Baseline":
        return cls(**json.loads(Path(path).read_text()))


@dataclass
class Params:
    sub_block_ms: float = 5.0
    botta_rise_db: float = 15.0
    botta_crest: float = 3.5
    botta_min_over_baseline_db: float = 15.0
    urlo_over_db: float = 20.0
    urlo_min_ms: float = 100.0
    urlo_centroid_hz: float = 1200.0
    sfreg_hf_over_db: float = 10.0
    sfreg_flatness_over: float = 0.1
    sfreg_min_ms: float = 300.0
    hf_cut_hz: float = 4000.0
    debounce_s: float = 1.0


# ====================================================================== DSP

_DFT_N = 64
_HANN = [0.5 - 0.5 * math.cos(2 * math.pi * n / (_DFT_N - 1)) for n in range(_DFT_N)]
_HANN_POW = sum(w * w for w in _HANN)
_COS = [[math.cos(2 * math.pi * k * n / _DFT_N) for n in range(_DFT_N)] for k in range(_DFT_N // 2 + 1)]
_SIN = [[math.sin(2 * math.pi * k * n / _DFT_N) for n in range(_DFT_N)] for k in range(_DFT_N // 2 + 1)]


def _db(power: float) -> float:
    return 10.0 * math.log10(power + EPS)


def _rms_db(x: Sequence[float]) -> float:
    return _db(sum(v * v for v in x) / max(len(x), 1))


def _power_spectrum(x: Sequence[float], use_numpy: bool = True) -> list[float]:
    """Welch: media dei |DFT|^2 a 64 punti con Hann su blocchi non sovrapposti. Bin 0..32."""
    nblk = len(x) // _DFT_N
    if nblk == 0:
        x = list(x) + [0.0] * (_DFT_N - len(x))
        nblk = 1
    if use_numpy and _np is not None:
        a = _np.asarray(x[: nblk * _DFT_N], dtype=float).reshape(nblk, _DFT_N) * _np.asarray(_HANN)
        p = (_np.abs(_np.fft.rfft(a, axis=1)) ** 2).mean(axis=0) / _HANN_POW
        return p.tolist()
    acc = [0.0] * (_DFT_N // 2 + 1)
    for b in range(nblk):
        seg = [x[b * _DFT_N + n] * _HANN[n] for n in range(_DFT_N)]
        for k in range(_DFT_N // 2 + 1):
            ck, sk = _COS[k], _SIN[k]
            re = sum(s * c for s, c in zip(seg, ck))
            im = sum(s * c for s, c in zip(seg, sk))
            acc[k] += re * re + im * im
    return [v / (nblk * _HANN_POW) for v in acc]


def _spectrum_features(x: Sequence[float], sample_rate: int, hf_cut_hz: float = 4000.0,
                       use_numpy: bool = True) -> dict[str, float]:
    p = _power_spectrum(x, use_numpy)
    df = sample_rate / _DFT_N
    bins = range(1, _DFT_N // 2)                       # niente DC e Nyquist
    tot = sum(p[k] for k in bins) + EPS
    centroid = sum(k * df * p[k] for k in bins) / tot
    geo = math.exp(sum(math.log(p[k] + EPS) for k in bins) / len(bins))
    flatness = geo / (tot / len(bins))
    k_hf = int(math.ceil(hf_cut_hz / df))
    hf = sum(p[k] for k in range(k_hf, _DFT_N // 2 + 1))
    return {"centroid_hz": centroid, "flatness": flatness, "hf_db": _db(hf / _DFT_N)}


# ====================================================================== parola chiave

class KeywordSpotter:
    """Wrapper su Vosk (modello italiano piccolo, offline), grammatica ristretta alle parole di stop.

    Se `vosk` o il modello mancano, lo spotting è DISABILITATO e lo si dice forte nel log.
    `recognizer` permette di iniettare un oggetto compatibile con KaldiRecognizer (test).
    """

    def __init__(self, sample_rate: int = 16000, model_path: Optional[str] = None, recognizer: Any = None,
                 keywords: Iterable[str] = KEYWORDS):
        self.keywords = tuple(keywords)
        self.sample_rate = sample_rate
        self.enabled = False
        self.rec = recognizer
        if self.rec is None:
            model_path = model_path or os.environ.get("VOSK_MODEL_PATH") or str(
                Path(__file__).resolve().parent / "models" / "vosk-model-small-it-0.22")
            try:
                import vosk  # type: ignore
                vosk.SetLogLevel(-1)
                model = vosk.Model(model_path)
                vocab = [w for w in DISTRACTORS if w not in self.keywords]  # Vosk ignores out-of-vocabulary words
                grammar = json.dumps(list(self.keywords) + vocab + ["[unk]"])
                self.rec = vosk.KaldiRecognizer(model, sample_rate, grammar)
            except Exception as e:  # ImportError, modello mancante, ...
                log.error("!!! PAROLA CHIAVE DISABILITATA: vosk/modello non disponibile (%s). "
                          "Restano solo i trigger acustici. Installa `pip install vosk` e scarica "
                          "vosk-model-small-it-0.22 in safety/models/ o imposta VOSK_MODEL_PATH. !!!", e)
                self.rec = None
        self.enabled = self.rec is not None
        # Falsi positivi (05/11: 12 trigger in 2 minuti a braccio fermo): con la grammatica ristretta Vosk proietta
        # qualsiasi parlato sulla parola di stop più vicina, e i risultati parziali non hanno confidenza.
        # Finale: conta solo una parola con conf >= min_conf. Parziale: la stessa parola deve restare per
        # partial_frames frame consecutivi (6 × 20 ms = 120 ms in più di latenza, lo stop resta sotto i 200 ms).
        self.min_conf = float(os.environ.get("AUDIO_GUARD_KEYWORD_CONF", "0.8"))
        self.partial_frames = int(os.environ.get("AUDIO_GUARD_PARTIAL_FRAMES", "6"))
        self._partial_word: Optional[str] = None
        self._partial_count = 0
        if self.enabled and recognizer is None:
            try:
                self.rec.SetWords(True)
            except Exception:
                pass

    def _hit(self, w: str) -> str:
        self._partial_word, self._partial_count = None, 0
        try:
            self.rec.Reset()
        except Exception:
            pass
        return w

    def process(self, frame: Sequence[float]) -> Optional[str]:
        if not self.enabled:
            return None
        pcm = array.array("h", (max(-32768, min(32767, int(v * 32767))) for v in frame)).tobytes()
        if self.rec.AcceptWaveform(pcm):
            res = json.loads(self.rec.Result())
            self._partial_word, self._partial_count = None, 0
            words = res.get("result")
            if words is None:  # recognizer senza SetWords (test): nessuna confidenza, si fida del testo
                words = [{"word": w, "conf": 1.0} for w in res.get("text", "").split()]
            for w in words:
                if w.get("word") in self.keywords and float(w.get("conf", 0.0)) >= self.min_conf:
                    return self._hit(w["word"])
            return None
        words = json.loads(self.rec.PartialResult()).get("partial", "").split()
        kw = next((w for w in reversed(words) if w in self.keywords), None)
        if kw is None:
            self._partial_word, self._partial_count = None, 0
            return None
        if kw == self._partial_word:
            self._partial_count += 1
        else:
            self._partial_word, self._partial_count = kw, 1
        if self._partial_count >= self.partial_frames:
            return self._hit(kw)
        return None


# ====================================================================== detector puro

class AudioGuardDetector:
    """Detector puro, senza I/O: un frame in, al più un Trigger out. Orologio = campioni processati / sample_rate."""

    def __init__(self, sample_rate: int = 16000, frame_ms: float = 20, baseline: Optional[Baseline] = None,
                 params: Optional[Params] = None, moving_profile: Optional[Baseline] = None,
                 keyword_spotter: Optional[KeywordSpotter] = None, only_keyword: bool = False,
                 use_numpy: bool = True):
        self.sr = sample_rate
        self.frame_len = int(round(sample_rate * frame_ms / 1000))
        self.frame_ms = frame_ms
        self.baseline = baseline or Baseline(sample_rate=sample_rate)
        self.moving_profile = moving_profile
        self.p = params or Params()
        self.kws = keyword_spotter
        self.only_keyword = only_keyword
        self.use_numpy = use_numpy
        self.moving = False
        self.sub_len = max(1, int(round(sample_rate * self.p.sub_block_ms / 1000)))
        self._t = 0.0                      # tempo di stream all'inizio del prossimo frame
        self._sub_hist: list[float] = []   # dB degli ultimi sotto-blocchi
        self._pending: Optional[tuple] = None  # salita in attesa del sotto-blocco successivo
        self._urlo_ms = 0.0
        self._urlo_t0 = 0.0
        self._sfreg_ms = 0.0
        self._sfreg_t0 = 0.0
        self._quiet_until = -1.0

    @property
    def now(self) -> float:
        return self._t

    def set_moving(self, moving: bool) -> None:
        if moving != self.moving:
            self._sfreg_ms = 0.0
        self.moving = moving

    def _ref(self) -> Baseline:
        return self.moving_profile if (self.moving and self.moving_profile) else self.baseline

    def process(self, frame: Sequence[float]) -> Optional[Trigger]:
        t0 = self._t
        n = len(frame)
        self._t = t0 + n / self.sr
        t_end = self._t
        found: list[Trigger] = []

        if self.kws is not None:
            w = self.kws.process(frame)
            if w:
                found.append(Trigger("parola", 1, {"word": w}, t_end, t0))

        if not self.only_keyword:
            b = self._botta(frame, t0)
            if b:
                found.append(b)
            found.extend(self._sustained(frame, t0, t_end))

        if t0 < self._quiet_until or not found:
            return None
        trig = min(found, key=lambda tr: tr.priority)
        trig.features["moving"] = self.moving
        self._quiet_until = t_end + self.p.debounce_s
        self._urlo_ms = self._sfreg_ms = 0.0
        return trig

    # -- botta: sotto-blocchi da 5 ms. Il crest factor si misura sui 10 ms "sotto-blocco della salita + il
    #    successivo" (un sotto-blocco di attesa, +5 ms): così l'inizio di un tono che cade a fine sotto-blocco
    #    non sembra un impulso.
    def _botta(self, frame: Sequence[float], t0: float) -> Optional[Trigger]:
        hit = None
        L = self.sub_len
        for i in range(0, len(frame) - L + 1, L):
            sb = frame[i:i + L]
            e = sum(v * v for v in sb) / L
            e_db = _db(e)
            peak = max(abs(v) for v in sb)
            pend, self._pending = self._pending, None
            if pend is not None and hit is None:
                t_on, rise, p0, e0, lvl = pend
                crest = max(p0, peak) / math.sqrt((e0 + e) / 2 + EPS)
                if crest > self.p.botta_crest:
                    hit = Trigger("botta", 1, {"rise_db": round(rise, 1), "crest": round(crest, 2),
                                               "level_db": round(lvl, 1)},
                                  t0 + len(frame) / self.sr, t_on)
            prev = self._sub_hist[-2:]
            self._sub_hist = (self._sub_hist + [e_db])[-4:]
            if pend is not None or len(prev) < 2:
                continue
            rise = e_db - min(prev)
            if rise > self.p.botta_rise_db and e_db >= self.baseline.rms_db + self.p.botta_min_over_baseline_db:
                self._pending = (t0 + i / self.sr, rise, peak, e, e_db)
        return hit

    # -- urlo e sfregamento: condizioni sostenute, frame per frame
    def _sustained(self, frame: Sequence[float], t0: float, t_end: float) -> list[Trigger]:
        out: list[Trigger] = []
        ref = self._ref()
        lvl = _rms_db(frame)
        loud = lvl > ref.rms_db + self.p.urlo_over_db
        feats = None
        if loud or self.moving:
            feats = _spectrum_features(frame, self.sr, self.p.hf_cut_hz, self.use_numpy)

        if loud and feats["centroid_hz"] > self.p.urlo_centroid_hz:
            if self._urlo_ms == 0.0:
                self._urlo_t0 = t0
            self._urlo_ms += self.frame_ms
            if self._urlo_ms >= self.p.urlo_min_ms:
                out.append(Trigger("urlo", 2, {"level_db": round(lvl, 1), "over_db": round(lvl - ref.rms_db, 1),
                                               "centroid_hz": round(feats["centroid_hz"]),
                                               "duration_ms": self._urlo_ms}, t_end, self._urlo_t0))
        else:
            self._urlo_ms = 0.0

        if self.moving and feats is not None:
            mp = self.moving_profile or self.baseline
            if (feats["hf_db"] > mp.hf_db + self.p.sfreg_hf_over_db
                    and feats["flatness"] > mp.flatness + self.p.sfreg_flatness_over):
                if self._sfreg_ms == 0.0:
                    self._sfreg_t0 = t0
                self._sfreg_ms += self.frame_ms
                if self._sfreg_ms >= self.p.sfreg_min_ms:
                    out.append(Trigger("sfregamento", 3, {"hf_db": round(feats["hf_db"], 1),
                                                          "hf_over_db": round(feats["hf_db"] - mp.hf_db, 1),
                                                          "flatness": round(feats["flatness"], 3),
                                                          "duration_ms": self._sfreg_ms}, t_end, self._sfreg_t0))
            else:
                self._sfreg_ms = 0.0
        return out


# ====================================================================== calibrazione

def read_wav(path: str | Path) -> tuple[list[float], int]:
    with wave.open(str(path), "rb") as w:
        sr, ch, sw, n = w.getframerate(), w.getnchannels(), w.getsampwidth(), w.getnframes()
        raw = w.readframes(n)
    if sw != 2:
        raise ValueError("solo wav PCM 16 bit")
    s = array.array("h")
    s.frombytes(raw)
    if sys.byteorder == "big":
        s.byteswap()
    x = [s[i] / 32768.0 for i in range(0, len(s), ch)]   # canale 0
    return x, sr


def write_wav(path: str | Path, x: Sequence[float], sr: int) -> None:
    pcm = array.array("h", (max(-32768, min(32767, int(v * 32767))) for v in x))
    if sys.byteorder == "big":
        pcm.byteswap()
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def calibrate_samples(x: Sequence[float], sr: int, label: str = "sala", frame_ms: float = 20,
                      hf_cut_hz: float = 4000.0) -> Baseline:
    L = int(sr * frame_ms / 1000)
    frames = [x[i:i + L] for i in range(0, len(x) - L + 1, L)]
    if not frames:
        raise ValueError("audio troppo corto per la taratura")
    energy = sum(sum(v * v for v in f) for f in frames) / (len(frames) * L)
    feats = [_spectrum_features(f, sr, hf_cut_hz) for f in frames]
    med = lambda vals: sorted(vals)[len(vals) // 2]  # noqa: E731
    return Baseline(rms_db=round(_db(energy), 2),
                    centroid_hz=round(med([f["centroid_hz"] for f in feats]), 1),
                    flatness=round(med([f["flatness"] for f in feats]), 4),
                    hf_db=round(_db(sum(10 ** (f["hf_db"] / 10) for f in feats) / len(feats)), 2),
                    sample_rate=sr, label=label, seconds=round(len(x) / sr, 2))


def calibrate(wav_path: str | Path, label: Optional[str] = None, save: bool = True) -> Baseline:
    x, sr = read_wav(wav_path)
    b = calibrate_samples(x, sr, label or Path(wav_path).stem)
    if save:
        b.save()
    return b


def load_baselines(directory: Path = BASELINE_DIR) -> tuple[Optional[Baseline], Optional[Baseline]]:
    def _l(name: str) -> Optional[Baseline]:
        p = directory / f"{name}.json"
        return Baseline.load(p) if p.exists() else None
    return _l("sala"), _l("moto")


# ====================================================================== Supabase (opzionale, mai sul percorso dello stop)

class SupabaseSink:
    """REST PostgREST via urllib. Attivo solo con SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nell'ambiente.

    - trigger → INSERT in `events` {type: "safety_trigger", payload: SafetyTriggerPayload}
    - heartbeat → UPSERT in `guard_status` {bridge_id, alive, last_heartbeat_at, last_trigger}
      (supabase/migrations/1002_bridge_runtime.sql; il bridge rifiuta i movimenti se è vecchio di > 1 s).
    """

    def __init__(self, url: str, key: str, bridge_id: str, timeout: float = 2.0):
        self.base = url.rstrip("/") + "/rest/v1"
        self.key, self.bridge_id, self.timeout = key, bridge_id, timeout

    @classmethod
    def from_env(cls, bridge_id: str) -> Optional["SupabaseSink"]:
        url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        return cls(url, key, bridge_id) if url and key else None

    def _post(self, path: str, body: Any, prefer: str) -> None:
        req = urllib.request.Request(self.base + path, data=json.dumps(body).encode(), method="POST", headers={
            "apikey": self.key, "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json", "Prefer": prefer})
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            r.read()

    def insert_event(self, payload: dict) -> None:
        self._post("/events", {"type": "safety_trigger", "payload": payload}, "return=minimal")

    def upsert_heartbeat(self, alive: bool, last_trigger: Optional[dict]) -> None:
        row = {"bridge_id": self.bridge_id, "alive": alive,
               "last_heartbeat_at": datetime.now(timezone.utc).isoformat()}
        if last_trigger is not None:
            row["last_trigger"] = last_trigger
        self._post("/guard_status?on_conflict=bridge_id", row, "resolution=merge-duplicates,return=minimal")


# ====================================================================== runtime

class AudioGuard:
    """Runtime: riceve frame con `feed()`, ferma subito, poi registra. Heartbeat e watchdog in un thread.

    Callback (tutte opzionali, chiamate FUORI dal percorso dello stop):
      on_event(payload: dict)      payload = SafetyTriggerPayload {trigger, latency_ms, features}
      on_heartbeat(hb: dict)       {"alive": bool, "ts": epoch_s, "last_trigger": dict|None}
    `heartbeat_file`: se dato, ogni heartbeat sovrascrive lì un json (utile senza Supabase).
    """

    HEARTBEAT_S = 0.25
    NO_AUDIO_S = 0.5

    def __init__(self, detector: AudioGuardDetector, stopper: Stopper,
                 on_event: Optional[Callable[[dict], None]] = None,
                 on_heartbeat: Optional[Callable[[dict], None]] = None,
                 sink: Optional[SupabaseSink] = None, heartbeat_file: Optional[str] = None,
                 clock: Callable[[], float] = time.perf_counter):
        self.det, self.stopper = detector, stopper
        self.on_event, self.on_heartbeat, self.sink = on_event, on_heartbeat, sink
        self.heartbeat_file = heartbeat_file
        self.clock = clock
        self.alive = False
        self.failsafe_reason: Optional[str] = None
        self.last_trigger: Optional[dict] = None
        self._last_frame = 0.0
        self._log_q: "queue.Queue[tuple[str, Any]]" = queue.Queue(maxsize=256)
        self._stop_evt = threading.Event()
        self._threads: list[threading.Thread] = []
        self._lock = threading.Lock()

    # -- ciclo di vita
    def start(self) -> None:
        connect = getattr(self.stopper, "connect", None)
        if callable(connect):
            try:
                connect()
            except OSError as e:
                log.error("stopper: connessione iniziale fallita (%s); si riproverà allo stop", e)
        self._last_frame = self.clock()
        self.alive = True
        self._hb_pending: Optional[dict] = None
        targets = [self._heartbeat_loop, self._log_loop] + ([self._sink_hb_loop] if self.sink else [])
        for target in targets:
            t = threading.Thread(target=target, daemon=True, name=f"audio_guard.{target.__name__}")
            t.start()
            self._threads.append(t)

    def close(self) -> None:
        self._stop_evt.set()
        for t in self._threads:
            t.join(timeout=1.0)

    # -- percorso caldo
    def feed(self, frame: Sequence[float], arrival: Optional[float] = None) -> Optional[Trigger]:
        arrival = self.clock() if arrival is None else arrival
        self._last_frame = arrival
        if not self.alive:
            return None
        trig = self.det.process(frame)
        if trig is None:
            return None
        self._do_stop()                                   # PRIMA di tutto il resto
        t_stop = self.clock()
        latency_ms = (t_stop - arrival) * 1000.0 + trig.window_ms
        payload = {"trigger": trig.type, "latency_ms": round(max(latency_ms, 0.0), 2),
                   "features": dict(trig.features, priority=trig.priority,
                                    window_ms=round(trig.window_ms, 1),
                                    t_sound=round(trig.t_sound, 3))}
        self.last_trigger = payload
        self._enqueue("event", payload)
        return trig

    def _do_stop(self) -> None:
        try:
            self.stopper.stop()
        except Exception as e:  # lo stop non deve mai far cadere il guard
            log.error("STOP FALLITO: %s", e)

    def failsafe(self, reason: str) -> None:
        """Microfono in errore/scollegato o niente audio: stop, alive=false, heartbeat fermo."""
        with self._lock:
            if not self.alive:
                return
            self.alive = False
            self.failsafe_reason = reason
        log.error("FAIL-SAFE: %s → stop", reason)
        self._do_stop()
        payload = {"trigger": "heartbeat", "latency_ms": 0.0, "features": {"failsafe": reason}}
        self.last_trigger = payload
        self._enqueue("event", payload)
        self._enqueue("heartbeat", self._hb_dict())       # ultimo battito: alive=false

    # -- thread di servizio
    def _hb_dict(self) -> dict:
        return {"alive": self.alive, "ts": time.time(), "last_trigger": self.last_trigger}

    def _heartbeat_loop(self) -> None:
        while not self._stop_evt.wait(self.HEARTBEAT_S / 5):
            if not self.alive:
                continue
            if self.clock() - self._last_frame > self.NO_AUDIO_S:
                self.failsafe(f"nessun frame audio da > {int(self.NO_AUDIO_S * 1000)} ms")
                continue
            now = time.monotonic()
            if now - getattr(self, "_last_hb", 0.0) >= self.HEARTBEAT_S:
                self._last_hb = now
                self._enqueue("heartbeat", self._hb_dict())

    def _enqueue(self, kind: str, item: Any) -> None:
        try:
            self._log_q.put_nowait((kind, item))
        except queue.Full:
            log.warning("coda di log piena: scarto %s", kind)

    def _log_loop(self) -> None:
        while not self._stop_evt.is_set() or not self._log_q.empty():
            try:
                kind, item = self._log_q.get(timeout=0.1)
            except queue.Empty:
                continue
            try:
                if kind == "event":
                    log.warning("safety_trigger %s", json.dumps(item))
                    if self.on_event:
                        self.on_event(item)
                    if self.sink:
                        self.sink.insert_event(item)
                else:
                    if self.on_heartbeat:
                        self.on_heartbeat(item)
                    if self.heartbeat_file:
                        tmp = self.heartbeat_file + ".tmp"
                        Path(tmp).write_text(json.dumps(item))
                        os.replace(tmp, self.heartbeat_file)
                    if self.sink:
                        # A Supabase upsert takes ~700 ms on the venue network: done here it blocked the file
                        # heartbeat and filled the queue. The sink thread sends only the latest heartbeat.
                        self._hb_pending = item
            except Exception as e:  # rete giù ecc.: si logga, lo stop è già avvenuto
                log.warning("log %s fallito: %s", kind, e)

    def _sink_hb_loop(self) -> None:
        while True:
            item, self._hb_pending = self._hb_pending, None
            if item is None:
                if self._stop_evt.is_set():
                    return
                self._stop_evt.wait(0.05)
                continue
            try:
                self.sink.upsert_heartbeat(item["alive"], item["last_trigger"])
            except Exception as e:
                log.warning("heartbeat su Supabase fallito: %s", e)

    # -- sorgenti audio
    def run_sounddevice(self, device: Any = None) -> None:
        import sounddevice as sd  # type: ignore
        q: "queue.Queue[list[float]]" = queue.Queue(maxsize=50)
        err: list[str] = []

        def cb(indata, frames, t, status):  # noqa: ANN001
            if status:
                log.warning("sounddevice: %s", status)
            try:
                q.put_nowait(indata[:, 0].tolist())
            except queue.Full:
                err.append("coda audio piena")

        try:
            with sd.InputStream(samplerate=self.det.sr, channels=1, dtype="float32",
                                blocksize=self.det.frame_len, device=device, callback=cb):
                # The watchdog starts only once the stream is open: Core Audio can take > NO_AUDIO_S to open,
                # and starting before it made the guard fail-safe on every launch.
                self.start()
                while self.alive:
                    try:
                        self.feed(q.get(timeout=self.NO_AUDIO_S))
                    except queue.Empty:
                        self.failsafe("nessun frame audio dal microfono")
        except Exception as e:
            self.failsafe(f"stream microfono in errore: {e}")
        finally:
            self.close()

    def run_stdin(self, stream: Any = None) -> None:
        """PCM grezzo int16 little-endian mono a det.sr su stdin (es. `arecord -f S16_LE -r 16000 -c 1 -t raw`)."""
        stream = stream or sys.stdin.buffer
        nbytes = self.det.frame_len * 2
        fmt = "<%dh" % self.det.frame_len
        self.start()
        try:
            while self.alive:
                data = stream.read(nbytes)
                if not data or len(data) < nbytes:
                    self.failsafe("stdin chiuso (EOF)")
                    break
                self.feed([v / 32768.0 for v in struct.unpack(fmt, data)])
        except Exception as e:
            self.failsafe(f"stdin in errore: {e}")
        finally:
            self.close()


# ====================================================================== CLI

def _record(seconds: float, sr: int) -> list[float]:
    try:
        import sounddevice as sd  # type: ignore
        log.info("registro %.0f s dal microfono...", seconds)
        rec = sd.rec(int(seconds * sr), samplerate=sr, channels=1, dtype="float32")
        sd.wait()
        return rec[:, 0].tolist()
    except ImportError:
        log.warning("sounddevice assente: leggo %.0f s di PCM int16 LE mono da stdin", seconds)
        raw = sys.stdin.buffer.read(int(seconds * sr) * 2)
        s = array.array("h")
        s.frombytes(raw[: len(raw) // 2 * 2])
        if sys.byteorder == "big":
            s.byteswap()
        return [v / 32768.0 for v in s]


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m safety.audio_guard",
                                 description="Arresto vocale e acustico (stop software rapido, NON e-stop).")
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("calibrate", help="registra la baseline (sala ferma o braccio in moto)")
    c.add_argument("--seconds", type=float, default=30)
    c.add_argument("--label", choices=["sala", "moto"], required=True)
    c.add_argument("--wav", help="tara da un wav esistente invece di registrare")
    c.add_argument("--sample-rate", type=int, default=16000)
    r = sub.add_parser("run", help="avvia il guard")
    r.add_argument("--host", default=os.environ.get("ELITE_HOST", "192.168.1.200"))
    r.add_argument("--port", type=int, default=29999)
    r.add_argument("--dry-run", action="store_true", help="stampa lo stop invece di inviarlo")
    r.add_argument("--only-keyword", action="store_true", help="kill criterion: solo parola chiave")
    r.add_argument("--stdin", action="store_true", help="PCM int16 LE mono da stdin invece del microfono")
    r.add_argument("--moving", action="store_true", help="considera il braccio sempre in moto (sfregamento)")
    r.add_argument("--bridge-id", default=os.environ.get("GERGO_BRIDGE_ID", "gergo-1"))
    r.add_argument("--heartbeat-file", default=os.environ.get("AUDIO_GUARD_HEARTBEAT_FILE"))
    r.add_argument("--sample-rate", type=int, default=16000)
    r.add_argument("--device", default=None)
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    if a.cmd == "calibrate":
        BASELINE_DIR.mkdir(parents=True, exist_ok=True)
        if a.wav:
            x, sr = read_wav(a.wav)
        else:
            sr = a.sample_rate
            x = _record(a.seconds, sr)
            write_wav(BASELINE_DIR / f"{a.label}.wav", x, sr)
        b = calibrate_samples(x, sr, a.label)
        print(f"baseline salvata in {b.save()}: {json.dumps(asdict(b))}")
        return 0

    sala, moto = load_baselines()
    if sala is None:
        log.warning("baseline/sala.json assente: uso valori di default (taratura consigliata)")
    kws = KeywordSpotter(a.sample_rate)
    if a.only_keyword and not kws.enabled:
        log.error("--only-keyword senza vosk: il guard NON rileva nulla (resta solo il fail-safe)")
    det = AudioGuardDetector(a.sample_rate, 20, sala, moving_profile=moto, keyword_spotter=kws,
                             only_keyword=a.only_keyword)
    det.set_moving(a.moving)
    stopper: Stopper = PrintStopper() if a.dry_run else DashboardStopper(a.host, a.port)
    guard = AudioGuard(det, stopper, sink=SupabaseSink.from_env(a.bridge_id), heartbeat_file=a.heartbeat_file)
    try:
        if a.stdin:
            guard.run_stdin()
        else:
            try:
                import sounddevice  # noqa: F401
            except ImportError:
                log.error("sounddevice assente: usa --stdin (es. arecord ... | python -m safety.audio_guard run --stdin)")
                return 2
            guard.run_sounddevice(a.device)
    except KeyboardInterrupt:
        guard.close()
    return 0 if guard.failsafe_reason is None else 1


if __name__ == "__main__":
    sys.exit(main())
