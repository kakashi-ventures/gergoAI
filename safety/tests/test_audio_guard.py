"""Test di audio_guard su segnali sintetici. Latenza = dal campione di inizio evento (orologio simulato:
il frame k arriva quando è finito, cioè a (k+1)*20 ms) alla chiamata di stop() misurata con perf_counter."""
import json
import math
import random
import statistics
import time

import pytest

from safety.audio_guard import (AudioGuard, AudioGuardDetector, Baseline, KeywordSpotter, Params,
                                calibrate, calibrate_samples, write_wav, _spectrum_features)

SR = 16000
FL = 320  # 20 ms


# ---------------------------------------------------------------- segnali

def sala(n, rng, level=0.002):
    """Rumore di sala: rumore bianco filtrato passa-basso (one-pole), ~ -55 dBFS."""
    y, out = 0.0, []
    for _ in range(n):
        y = 0.9 * y + 0.1 * rng.gauss(0, 1)
        out.append(y)
    rms = math.sqrt(sum(v * v for v in out) / n)
    return [v * level / rms for v in out]


def hum(n, start=0, level=0.01):
    """Motore del braccio: 150 Hz con armoniche, ~ -40 dBFS."""
    return [level * (math.sin(2 * math.pi * 150 * (i + start) / SR)
                     + 0.5 * math.sin(2 * math.pi * 300 * (i + start) / SR)
                     + 0.25 * math.sin(2 * math.pi * 450 * (i + start) / SR)) for i in range(n)]


def add(x, y, at=0):
    for i, v in enumerate(y):
        if at + i < len(x):
            x[at + i] += v
    return x


def botta(rng, tau_ms=1.5, peak=0.5):
    n = int(0.05 * SR)
    return [peak * rng.gauss(0, 1) / 3 * math.exp(-i / (tau_ms / 1000 * SR)) for i in range(n)]


def urlo(ms=200, f=1500.0, amp=0.2):
    return [amp * math.sin(2 * math.pi * f * i / SR) for i in range(int(ms / 1000 * SR))]


def sibilo(rng, ms=400, amp=0.012):
    return [amp * rng.gauss(0, 1) for i in range(int(ms / 1000 * SR))]


def parlato(n, rng, level=0.008):
    """Parlato a livello normale (~ +12 dB sulla sala): rumore passa-basso modulato a 4 Hz (sillabe)."""
    base = sala(n, rng, level)
    return [v * (0.2 + 0.8 * math.sin(math.pi * 4 * i / SR) ** 2) for i, v in enumerate(base)]


def frames(x):
    return [x[i:i + FL] for i in range(0, len(x) - FL + 1, FL)]


# ---------------------------------------------------------------- fixture

class FakeStopper:
    def __init__(self):
        self.calls = []

    def stop(self):
        self.calls.append(time.perf_counter())


@pytest.fixture(scope="module")
def baselines():
    rng = random.Random(1)
    s = sala(SR * 5, rng)
    m = add(sala(SR * 5, rng), hum(SR * 5))
    return calibrate_samples(s, SR, "sala"), calibrate_samples(m, SR, "moto")


def run_detector(x, det, onset_sample):
    """Alimenta frame per frame; ritorna (trigger, latenza_ms) del primo trigger."""
    for k, fr in enumerate(frames(x)):
        t_in = time.perf_counter()
        trig = det.process(fr)
        if trig is not None:
            stopper = FakeStopper()
            stopper.stop()  # il runtime chiama stop() subito dopo process()
            frame_end = (k + 1) * FL / SR
            lat = (frame_end - onset_sample / SR) * 1000 + (stopper.calls[0] - t_in) * 1000
            return trig, lat
    return None, None


def run_case(kind, seed, baselines, offset):
    rng = random.Random(seed)
    sb, mb = baselines
    n = SR * 2
    onset = SR // 2 + offset
    det = AudioGuardDetector(SR, 20, sb, moving_profile=mb)
    if kind == "botta":
        x = add(sala(n, rng), botta(rng), onset)
    elif kind == "urlo":
        x = add(sala(n, rng), urlo(), onset)
    elif kind == "sfregamento":
        det.set_moving(True)
        x = add(add(sala(n, rng), hum(n)), sibilo(rng), onset)
    return run_detector(x, det, onset)


# ---------------------------------------------------------------- latenza per tipo

LAT = {}


@pytest.mark.parametrize("kind", ["botta", "urlo", "sfregamento"])
def test_trigger_and_latency(kind, baselines):
    lats = []
    for seed in range(7):
        trig, lat = run_case(kind, seed, baselines, offset=seed * 37)
        assert trig is not None, f"{kind} non rilevato (seed {seed})"
        assert trig.type == kind
        assert trig.priority == {"botta": 1, "urlo": 2, "sfregamento": 3}[kind]
        assert trig.features
        lats.append(lat)
        if kind == "sfregamento":
            assert trig.window_ms >= 300
    med = statistics.median(lats)
    LAT[kind] = med
    print(f"\n{kind}: latenza mediana suono→stop = {med:.1f} ms (min {min(lats):.1f}, max {max(lats):.1f})")
    if kind == "sfregamento":
        # La spec impone > 300 ms di persistenza: la latenza dall'inizio del suono è per costruzione ~300+ ms.
        # Si verifica che il ritardo OLTRE la finestra obbligatoria sia < 300 ms (e lo si segnala nel README).
        assert med - 300 < 300
        assert med < 400
    else:
        assert med < 300


def test_pure_python_spectrum_matches_numpy():
    rng = random.Random(3)
    x = [rng.gauss(0, 0.1) for _ in range(FL)]
    a = _spectrum_features(x, SR, use_numpy=False)
    b = _spectrum_features(x, SR, use_numpy=True)
    for k in a:
        assert a[k] == pytest.approx(b[k], rel=1e-6, abs=1e-6)
    tone = urlo(20)
    assert _spectrum_features(tone, SR, use_numpy=False)["centroid_hz"] == pytest.approx(1500, abs=200)


def test_urlo_pure_python_path(baselines):
    rng = random.Random(9)
    x = add(sala(SR, rng), urlo(), SR // 2)
    det = AudioGuardDetector(SR, 20, baselines[0], use_numpy=False)
    trig, lat = run_detector(x, det, SR // 2)
    assert trig.type == "urlo" and lat < 300


# ---------------------------------------------------------------- falsi positivi

def test_no_false_positive_60s_baseline(baselines):
    rng = random.Random(42)
    det = AudioGuardDetector(SR, 20, baselines[0])
    x = sala(SR * 60, rng)
    assert [t for t in map(det.process, frames(x)) if t] == []


def test_no_trigger_on_normal_talking(baselines):
    rng = random.Random(7)
    det = AudioGuardDetector(SR, 20, baselines[0])
    x = add(sala(SR * 10, rng), parlato(SR * 10, rng))
    assert [t for t in map(det.process, frames(x)) if t] == []


def test_no_sfregamento_when_moving_normally(baselines):
    rng = random.Random(8)
    det = AudioGuardDetector(SR, 20, baselines[0], moving_profile=baselines[1])
    det.set_moving(True)
    n = SR * 10
    x = add(sala(n, rng), hum(n))
    assert [t for t in map(det.process, frames(x)) if t] == []


def test_sfregamento_only_when_moving(baselines):
    rng = random.Random(5)
    n = SR * 2
    x = add(add(sala(n, rng), hum(n)), sibilo(rng), SR // 2)
    det = AudioGuardDetector(SR, 20, baselines[0], moving_profile=baselines[1])
    assert [t for t in map(det.process, frames(x)) if t] == []


def test_debounce_1s(baselines):
    rng = random.Random(11)
    x = sala(SR * 3, rng)
    for at in (int(0.5 * SR), int(1.0 * SR), int(2.2 * SR)):   # 2a botta dopo 0.5 s: ignorata
        add(x, botta(rng), at)
    det = AudioGuardDetector(SR, 20, baselines[0])
    trigs = [t for t in map(det.process, frames(x)) if t]
    assert [t.type for t in trigs] == ["botta", "botta"]
    assert trigs[1].t_onset >= 2.2


# ---------------------------------------------------------------- parola e only-keyword

class FakeRecognizer:
    """Compatibile con vosk.KaldiRecognizer: dice "fermo" quando l'energia del frame supera una soglia."""

    def __init__(self):
        self._partial = ""

    def AcceptWaveform(self, data):
        import array
        a = array.array("h")
        a.frombytes(data)
        self._partial = "fermo" if max(abs(v) for v in a) > 3000 else ""
        return False

    def PartialResult(self):
        return json.dumps({"partial": self._partial})

    def Result(self):
        return json.dumps({"text": ""})

    def Reset(self):
        self._partial = ""


def test_keyword_spotter_disabled_without_vosk(caplog):
    import importlib.util
    if importlib.util.find_spec("vosk") is not None:
        pytest.skip("vosk installato")
    with caplog.at_level("ERROR"):
        k = KeywordSpotter(SR)
    assert not k.enabled
    assert "PAROLA CHIAVE DISABILITATA" in caplog.text
    assert k.process([0.0] * FL) is None


def test_parola_trigger_latency(baselines):
    rng = random.Random(2)
    x = add(sala(SR, rng), urlo(ms=300, f=300, amp=0.2), SR // 2)  # "parola": voce grave, niente urlo
    det = AudioGuardDetector(SR, 20, baselines[0], keyword_spotter=KeywordSpotter(SR, recognizer=FakeRecognizer()))
    trig, lat = run_detector(x, det, SR // 2)
    assert trig.type == "parola" and trig.priority == 1 and trig.features["word"] == "fermo"
    assert lat < 300


def test_only_keyword_ignores_botta_and_urlo(baselines):
    rng = random.Random(4)
    x = add(add(sala(SR * 4, rng), botta(rng), SR // 2), urlo(), int(2.5 * SR))
    det = AudioGuardDetector(SR, 20, baselines[0], only_keyword=True)
    assert [t for t in map(det.process, frames(x)) if t] == []
    # ma la parola chiave funziona ancora
    det = AudioGuardDetector(SR, 20, baselines[0], only_keyword=True,
                             keyword_spotter=KeywordSpotter(SR, recognizer=FakeRecognizer()))
    trigs = [t for t in map(det.process, frames(x)) if t]
    assert trigs and all(t.type == "parola" for t in trigs)


# ---------------------------------------------------------------- runtime: stop prima del log, fail-safe

def test_runtime_stops_then_logs(baselines):
    from bridge.contracts import SafetyTriggerPayload
    rng = random.Random(6)
    x = add(sala(SR, rng), botta(rng), SR // 2)
    stopper, events, order = FakeStopper(), [], []
    orig = stopper.stop
    stopper.stop = lambda: (order.append("stop"), orig())
    g = AudioGuard(AudioGuardDetector(SR, 20, baselines[0]), stopper,
                   on_event=lambda p: (order.append("event"), events.append(p)))
    g.start()
    try:
        for fr in frames(x):
            g.feed(fr)
        deadline = time.time() + 2
        while not events and time.time() < deadline:
            time.sleep(0.01)
    finally:
        g.close()
    assert order[:2] == ["stop", "event"]
    SafetyTriggerPayload.model_validate(events[0])
    assert events[0]["trigger"] == "botta" and events[0]["latency_ms"] < 300


def test_failsafe_no_frames(tmp_path, baselines):
    stopper, hbs = FakeStopper(), []
    hb_file = tmp_path / "hb.json"
    g = AudioGuard(AudioGuardDetector(SR, 20, baselines[0]), stopper, on_heartbeat=hbs.append,
                   heartbeat_file=str(hb_file))
    g.start()
    try:
        for _ in range(10):                      # 200 ms di audio regolare
            g.feed([0.0] * FL)
            time.sleep(0.02)
        assert stopper.calls == [] and g.alive
        time.sleep(0.9)                          # poi più nulla per > 500 ms
        assert len(stopper.calls) == 1
        assert not g.alive and "nessun frame" in g.failsafe_reason
        n = len(hbs)
        time.sleep(0.6)
        assert len(hbs) == n                     # heartbeat fermo
    finally:
        g.close()
    assert any(h["alive"] for h in hbs) and hbs[-1]["alive"] is False
    assert json.loads(hb_file.read_text())["alive"] is False
    assert g.feed([0.0] * FL) is None            # dopo il fail-safe non riparte da solo


def test_heartbeat_period(baselines):
    hbs = []
    g = AudioGuard(AudioGuardDetector(SR, 20, baselines[0]), FakeStopper(), on_heartbeat=hbs.append)
    g.start()
    try:
        t_end = time.time() + 1.1
        while time.time() < t_end:
            g.feed([0.0] * FL)
            time.sleep(0.02)
    finally:
        g.close()
    assert 3 <= len(hbs) <= 6 and all(h["alive"] for h in hbs)


def test_calibrate_wav_roundtrip(tmp_path, monkeypatch):
    import safety.audio_guard as ag
    monkeypatch.setattr(ag, "BASELINE_DIR", tmp_path)
    rng = random.Random(1)
    wav = tmp_path / "sala.wav"
    write_wav(wav, sala(SR * 2, rng), SR)
    b = calibrate(wav, "sala")
    assert (tmp_path / "sala.json").exists()
    assert Baseline.load(tmp_path / "sala.json") == b
    assert -60 < b.rms_db < -50 and b.centroid_hz < 2000


def test_dashboard_stopper_against_fake_server():
    import socket
    import threading
    from safety.audio_guard import DashboardStopper
    srv = socket.socket()
    srv.bind(("127.0.0.1", 0))
    srv.listen(2)
    got = []

    def serve():
        for _ in range(2):
            c, _ = srv.accept()
            c.sendall(b"Connected: Elite Robot Dashboard Server\n")
            f = c.makefile("rb")
            line = f.readline()
            got.append(line)
            c.sendall(b"Stopped\n")
            c.close()   # chiude: lo stop successivo deve riconnettersi

    threading.Thread(target=serve, daemon=True).start()
    s = DashboardStopper("127.0.0.1", srv.getsockname()[1])
    s.connect()
    s.stop()
    assert s.last_reply == "Stopped"
    s.stop()           # connessione caduta → riconnessione e retry
    assert got == [b"stop\n", b"stop\n"] and s.last_reply == "Stopped"
    srv.close()
