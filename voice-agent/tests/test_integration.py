"""Integration: LiveKit's own OpenAI plugins talking to our STT / TTS servers over real HTTP.

STT uses the real Telugu model (downloads ukta-app/whisper-telugu-ct2 on first run). Point TEST_CLIP at a 16-bit WAV
of Telugu speech to also check what it hears; without it the STT test uses a synthetic tone.
    RUN_INTEGRATION=1 TEST_CLIP=/path/clip.wav pytest -q -s tests/test_integration.py
"""
import asyncio
import os
import socket
import threading
import time
import wave

import numpy as np
import pytest
import uvicorn

pytestmark = pytest.mark.skipif(not os.environ.get("RUN_INTEGRATION"), reason="set RUN_INTEGRATION=1")


def _serve(app):
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    srv = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    threading.Thread(target=srv.run, daemon=True).start()
    for _ in range(100):
        if srv.started:
            break
        time.sleep(0.05)
    return f"http://127.0.0.1:{port}/v1", srv


def _frames(path):
    from livekit import rtc
    with wave.open(path) as w:
        sr, data = w.getframerate(), w.readframes(w.getnframes())
    return [rtc.AudioFrame(data=data, sample_rate=sr, num_channels=1, samples_per_channel=len(data) // 2)]


def test_livekit_stt_plugin_against_our_server():
    from livekit.plugins import openai
    from servers.stt_server import FasterWhisperEngine, create_app
    engine = FasterWhisperEngine(os.environ.get("STT_ENGINE_MODEL", "ukta-app/whisper-telugu-ct2"), device="cpu")
    url, srv = _serve(create_app(engine))
    clip = os.environ.get("TEST_CLIP")
    if not clip:
        from servers.audio import to_wav
        clip = "/tmp/rana_tone.wav"
        open(clip, "wb").write(to_wav((0.1 * np.sin(2 * np.pi * 300 * np.arange(16000) / 16000)).astype(np.float32), 16000))

    async def run():
        stt = openai.STT(base_url=url, api_key="local", model="telugu-default", language="te")
        t0 = time.perf_counter()
        ev = await stt.recognize(_frames(clip))
        return ev, (time.perf_counter() - t0) * 1000

    ev, ms = asyncio.run(run())
    text = ev.alternatives[0].text
    print(f"\nSTT via LiveKit plugin ({ms:.0f} ms on CPU): {text}")
    assert isinstance(text, str)
    if os.environ.get("TEST_CLIP"):
        assert any("ఀ" <= ch <= "౿" for ch in text), "expected Telugu script back"
    srv.should_exit = True


def test_livekit_tts_plugin_against_our_server():
    from livekit.plugins import openai
    from servers.tts_server import ToneEngine, create_app
    url, srv = _serve(create_app(ToneEngine()))

    async def run():
        tts = openai.TTS(base_url=url, api_key="local", model="indic-parler-tts", voice="Lalitha", response_format="wav")
        frames = [f async for f in tts.synthesize("నమస్తే, ఎలా సహాయం చేయగలను?")]
        return frames

    frames = asyncio.run(run())
    total = sum(f.frame.samples_per_channel for f in frames)
    print(f"\nTTS via LiveKit plugin: {len(frames)} frames, {total / 24000:.2f} s at {frames[0].frame.sample_rate} Hz")
    assert frames and frames[0].frame.sample_rate == 24000 and total > 24000 * 0.2
    srv.should_exit = True


def test_agent_module_imports():
    os.environ.setdefault("RANA_VOICE_SECRET", "x" * 40)
    import rana_voice.agent as a
    assert a.server is not None and a.S.agent_name == "rana-voice"
