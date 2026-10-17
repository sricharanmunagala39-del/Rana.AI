"""Unit tests: dashboard signing / delivery, call records, model servers. No GPU, no network."""
import asyncio
import io
import json
import wave

import httpx
import numpy as np
import pytest
from fastapi.testclient import TestClient

from rana_voice.call_record import ENGINE_RULES, CallRecord, compose_instructions
from rana_voice.dashboard import Dashboard, DashboardError, sign
from rana_voice.settings import stt_language
from servers.audio import decode, to_wav
from servers.stt_server import create_app as stt_app
from servers.tts_server import ToneEngine, create_app as tts_app

SECRET = "x" * 40


# ---- signing must match lib/voice/rana.ts byte for byte ----
def test_signature_matches_dashboard_vector():
    # Same inputs computed with Node's crypto (tests/voice-rana.test.ts uses the same scheme).
    assert sign(SECRET, "1792000000000", json.dumps({"hello": "world"}, separators=(",", ":"))) == \
        "7766c7b8aaeb558a042847346eddb1ae023d81aa7d68e0bc72a9369b9985a56b"


def test_dashboard_refuses_weak_secret():
    with pytest.raises(ValueError):
        Dashboard("https://x", "short")


def _dash(handler, tmp_path):
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return Dashboard("https://dash.test", SECRET, spool_dir=tmp_path / "spool", client=client)


def test_post_call_signs_request(tmp_path):
    seen = {}

    def handler(req: httpx.Request):
        seen["sig"] = req.headers["x-rana-signature"]
        seen["ok"] = sign(SECRET, req.headers["x-rana-timestamp"], req.content.decode()) == seen["sig"]
        return httpx.Response(200, json={"ok": True, "id": "c1"})

    out = asyncio.run(_dash(handler, tmp_path).post_call({"call_id": "RM_1"}))
    assert out == {"ok": True, "id": "c1"} and seen["ok"]


def test_post_call_spools_when_dashboard_is_down_and_flush_resends(tmp_path, monkeypatch):
    import rana_voice.dashboard as d
    monkeypatch.setattr(d, "_sleep", lambda s: asyncio.sleep(0))
    state = {"up": False, "got": []}

    def handler(req):
        if not state["up"]:
            return httpx.Response(503, json={"error": "down"})
        state["got"].append(json.loads(req.content))
        return httpx.Response(200, json={"ok": True})

    dash = _dash(handler, tmp_path)
    assert asyncio.run(dash.post_call({"call_id": "RM_2", "x": 1})) is None
    files = list((tmp_path / "spool").glob("*.json"))
    assert len(files) == 1                       # not lost
    state["up"] = True
    assert asyncio.run(dash.flush_spool()) == 1
    assert state["got"] == [{"call_id": "RM_2", "x": 1}]
    assert not list((tmp_path / "spool").glob("*.json"))


def test_post_call_does_not_retry_a_rejected_payload(tmp_path):
    calls = []

    def handler(req):
        calls.append(1)
        return httpx.Response(400, json={"error": "client_id must be a UUID."})

    with pytest.raises(DashboardError) as e:
        asyncio.run(_dash(handler, tmp_path).post_call({"call_id": "RM_3"}))
    assert e.value.status == 400 and len(calls) == 1
    assert not (tmp_path / "spool").exists()


# ---- call record ----
def test_call_record_payload():
    r = CallRecord(call_id="RM_9", direction="inbound", client_id="c", script_id="s", caller_phone="+919848012345", started_at=1000.0)
    r.add_turn("agent", "నమస్తే", at=1001)
    r.add_turn("user", "  ", at=1002)            # ignored
    r.add_turn("user", "fee entha?", at=1003)
    r.add_reply_latency(900); r.add_reply_latency(1300)
    r.finish("caller_hangup", at=1063)
    p = r.payload()
    assert p["answered"] is True
    assert p["transcript"] == [{"role": "agent", "text": "నమస్తే"}, {"role": "user", "text": "fee entha?"}]
    assert p["started_at"].startswith("1970-01-01T00:16:43")   # billed from the first caller words (t=1003)
    assert p["metrics"] == {"avg_reply_ms": 1100, "p90_reply_ms": 1300, "replies": 2}


def test_unanswered_call_and_missing_client():
    r = CallRecord(call_id="RM_10", direction="outbound", client_id="c")
    r.finish("no_answer")
    assert r.payload()["answered"] is False and r.payload()["end_reason"] == "no_answer"
    with pytest.raises(ValueError):
        CallRecord(call_id="x", direction="inbound").payload()


def test_engine_rules_always_appended():
    s = compose_instructions("You are Priya from Sunrise Coaching.")
    assert s.startswith("You are Priya") and s.endswith(ENGINE_RULES)
    assert "AI assistant" in ENGINE_RULES and "Never claim to be human" in ENGINE_RULES
    assert compose_instructions("") == ENGINE_RULES


def test_stt_language():
    assert stt_language("te-IN") == "te" and stt_language("hi-IN") == "hi" and stt_language(None) == "te" and stt_language("xx") == "te"


# ---- model servers (fake engines) ----
class FakeSTT:
    name = "fake"

    def __init__(self):
        self.seen = None

    def transcribe(self, audio16k, language):
        self.seen = (len(audio16k), language)
        return "హలో సర్"


def _wav(seconds=1.0, sr=8000):
    t = np.arange(int(seconds * sr)) / sr
    return to_wav((0.1 * np.sin(2 * np.pi * 300 * t)).astype(np.float32), sr)


def test_stt_server_openai_shape_and_resampling():
    eng = FakeSTT()
    c = TestClient(stt_app(eng))
    r = c.post("/v1/audio/transcriptions", files={"file": ("a.wav", _wav(1.0, 8000), "audio/wav")}, data={"model": "x", "language": "te-IN"})
    assert r.status_code == 200 and r.json()["text"] == "హలో సర్"
    assert eng.seen == (16000, "te")                       # 8 kHz phone audio → 16 kHz for the model
    assert c.post("/v1/audio/transcriptions", files={"file": ("a.wav", b"", "audio/wav")}).status_code == 400
    assert c.post("/v1/audio/transcriptions", files={"file": ("a.wav", b"not audio", "audio/wav")}).status_code == 400


def test_tts_server_returns_24k_wav():
    c = TestClient(tts_app(ToneEngine()))
    r = c.post("/v1/audio/speech", json={"input": "నమస్తే, ఎలా సహాయం చేయగలను?", "voice": "Lalitha"})
    assert r.status_code == 200 and r.headers["content-type"] == "audio/wav"
    with wave.open(io.BytesIO(r.content)) as w:
        assert (w.getframerate(), w.getnchannels(), w.getsampwidth()) == (24000, 1, 2)
    assert c.post("/v1/audio/speech", json={"input": "x" * 601}).status_code == 413
    assert c.post("/v1/audio/speech", json={"input": ""}).status_code == 422


def test_decode_round_trip():
    a = decode(_wav(0.5, 8000), 16000)
    assert len(a) == 8000 and a.dtype == np.float32
