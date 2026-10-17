"""Test console for the in-house agent, before any phone line exists.

One web page: hold to speak (or type) → our STT → our LLM with a real AI employee's script → our TTS → you hear it.
Every turn shows what was heard, what was answered and how long each step took. It uses the same model servers and
the same rules as phone calls, so what you hear here is what a caller would hear (minus phone-line audio quality).

Run on the GPU server (next to the model servers):
    PLAYGROUND_PASSWORD=... uvicorn servers.playground:app --host 127.0.0.1 --port 8080
Open it through an SSH tunnel so the browser allows the microphone:
    ssh -L 8080:127.0.0.1:8080 user@gpu-server   →   http://localhost:8080
"""
from __future__ import annotations

import base64
import json
import os
import secrets
import time
from pathlib import Path
from typing import Any

import httpx
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import HTMLResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from rana_voice.call_record import compose_instructions
from rana_voice.dashboard import Dashboard, DashboardError
from rana_voice.settings import stt_language

from .audio import decode, to_wav

STT_URL = os.environ.get("STT_URL", "http://127.0.0.1:8001/v1")
LLM_URL = os.environ.get("LLM_URL", "http://127.0.0.1:8000/v1")
TTS_URL = os.environ.get("TTS_URL", "http://127.0.0.1:8002/v1")
LLM_MODEL = os.environ.get("LLM_MODEL", "sarvamai/sarvam-30b")
TTS_MODEL = os.environ.get("TTS_MODEL", "indic-parler-tts")
DEFAULT_VOICE = os.environ.get("TTS_DEFAULT_VOICE", "Lalitha")
MAX_HISTORY = 20

security = HTTPBasic(auto_error=False)  # we answer 401 ourselves, after the Colab rule below


def check_password(creds: HTTPBasicCredentials | None = Depends(security)) -> None:
    want = os.environ.get("PLAYGROUND_PASSWORD", "")
    # Google Colab only: its port link already requires the notebook owner's Google sign-in. Both conditions must hold,
    # so this can never switch the password off on a real server.
    if not want and os.environ.get("PLAYGROUND_ALLOW_NO_PASSWORD") == "1" and os.environ.get("COLAB_RELEASE_TAG"):
        return
    if not want:
        raise HTTPException(503, "Set PLAYGROUND_PASSWORD before using the test console.")
    if creds is None or not secrets.compare_digest(creds.password.encode(), want.encode()):
        raise HTTPException(401, "Wrong password.", headers={"WWW-Authenticate": "Basic"})


def employees() -> list[dict]:
    """PLAYGROUND_EMPLOYEES='[{"id":"<script uuid>","name":"Fashion House – Inbound"}]'"""
    try:
        listed = json.loads(os.environ.get("PLAYGROUND_EMPLOYEES", "[]"))
    except ValueError:
        listed = []
    offline = os.environ.get("PLAYGROUND_SCRIPTS_FILE")
    if not listed and offline and Path(offline).exists():
        listed = [{"id": e["id"], "name": f"{e.get('client_name', '')}: {e.get('employee', '')}".strip(": ")}
                  for e in json.loads(Path(offline).read_text(encoding="utf-8"))]
    return listed


def strip_thinking(text: str) -> str:
    """Some open models write their reasoning in <think>…</think> before the answer. Callers must never hear it."""
    import re
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S)
    text = re.sub(r"^.*?</think>", "", text, flags=re.S)  # an unopened closing tag
    return text.strip()


class Brain:
    """The three model servers plus the dashboard, as plain HTTP. Tests swap the transport."""

    def __init__(self, client: httpx.AsyncClient | None = None, dashboard: Dashboard | None = None):
        self.http = client or httpx.AsyncClient(timeout=60)
        self.dash = dashboard
        self._cfg: dict[str, dict] = {}

    async def config(self, script_id: str) -> dict:
        if script_id not in self._cfg:
            offline = os.environ.get("PLAYGROUND_SCRIPTS_FILE")
            if offline:  # test without the dashboard: compiled scripts exported to a JSON file
                found = {e["id"]: e for e in json.loads(Path(offline).read_text(encoding="utf-8"))}
                if script_id not in found:
                    raise HTTPException(404, "That AI employee isn't in the scripts file.")
                self._cfg[script_id] = found[script_id]
                return self._cfg[script_id]
            if not self.dash:
                raise HTTPException(503, "Dashboard not configured (RANA_DASHBOARD_URL / RANA_VOICE_SECRET).")
            try:
                self._cfg[script_id] = await self.dash.fetch_config(direction="inbound", script_id=script_id)
            except DashboardError as e:
                raise HTTPException(e.status, f"Dashboard: {e.message}")
        return self._cfg[script_id]

    async def hear(self, audio16k_wav: bytes, language: str) -> tuple[str, float]:
        t0 = time.perf_counter()
        r = await self.http.post(f"{STT_URL}/audio/transcriptions", files={"file": ("turn.wav", audio16k_wav, "audio/wav")},
                                 data={"model": "default", "language": language})
        r.raise_for_status()
        return r.json().get("text", "").strip(), (time.perf_counter() - t0) * 1000

    async def think(self, instructions: str, history: list[dict], said: str) -> tuple[str, float]:
        suffix = os.environ.get("LLM_SYSTEM_SUFFIX", "")  # e.g. "/no_think" turns off Qwen3's slow thinking mode
        msgs = [{"role": "system", "content": f"{instructions}\n{suffix}".strip()}] + history[-MAX_HISTORY:] + [{"role": "user", "content": said}]
        t0 = time.perf_counter()
        r = await self.http.post(f"{LLM_URL}/chat/completions", headers={"authorization": "Bearer local"},
                                 json={"model": LLM_MODEL, "messages": msgs, "temperature": 0.3, "max_tokens": 160})
        r.raise_for_status()
        text = r.json()["choices"][0]["message"].get("content") or ""
        return strip_thinking(text), (time.perf_counter() - t0) * 1000

    async def speak(self, text: str, voice: str, speed: float) -> tuple[bytes, float]:
        t0 = time.perf_counter()
        r = await self.http.post(f"{TTS_URL}/audio/speech", json={"model": TTS_MODEL, "input": text[:600], "voice": voice,
                                                                 "speed": speed, "response_format": "wav"})
        r.raise_for_status()
        return r.content, (time.perf_counter() - t0) * 1000


def create_app(brain: Brain | None = None) -> FastAPI:
    app = FastAPI(title="RANA test console")
    state: dict[str, Any] = {"brain": brain}

    def get_brain() -> Brain:
        if state["brain"] is None:
            secret = os.environ.get("RANA_VOICE_SECRET", "")
            dash = Dashboard(os.environ.get("RANA_DASHBOARD_URL", "https://ranaai.in"), secret) if len(secret) >= 32 else None
            state["brain"] = Brain(dashboard=dash)
        return state["brain"]

    @app.get("/", response_class=HTMLResponse, dependencies=[Depends(check_password)])
    def page():
        return (Path(__file__).parent / "playground.html").read_text(encoding="utf-8")

    @app.get("/api/employees", dependencies=[Depends(check_password)])
    def list_employees():
        return employees()

    @app.post("/api/turn", dependencies=[Depends(check_password)])
    async def turn(script_id: str = Form(...), history: str = Form("[]"), text: str | None = Form(None),
                   audio: UploadFile | None = File(None), speak: bool = Form(True)):
        b = get_brain()
        cfg = await b.config(script_id)
        lang = stt_language(cfg.get("language"))
        timings: dict[str, float] = {}
        if audio is not None:
            raw = await audio.read()
            try:
                pcm = decode(raw, 16000)
            except ValueError as e:
                raise HTTPException(400, f"Could not read the recording: {e}")
            if len(pcm) < 16000 * 0.3:
                raise HTTPException(400, "Recording too short. Hold the button while you speak.")
            said, timings["stt_ms"] = await b.hear(to_wav(pcm, 16000), lang)
        else:
            said = (text or "").strip()
        if not said:
            return {"heard": "", "reply": "", "note": "Nothing was heard. Try again a little closer to the microphone."}
        try:
            hist = [m for m in json.loads(history) if m.get("role") in ("user", "assistant")][-MAX_HISTORY:]
        except ValueError:
            hist = []
        reply, timings["llm_ms"] = await b.think(compose_instructions(cfg.get("instructions", "")), hist, said)
        out: dict[str, Any] = {"heard": said, "reply": reply, "timings": timings}
        if speak and reply:
            wav, timings["tts_ms"] = await b.speak(reply, cfg.get("voice") or DEFAULT_VOICE, float(cfg.get("speech_rate") or 1))
            out["audio_b64"] = base64.b64encode(wav).decode()
        timings["total_ms"] = sum(v for k, v in timings.items() if k != "total_ms")
        out["timings"] = {k: round(v) for k, v in timings.items()}
        return out

    @app.get("/api/greeting", dependencies=[Depends(check_password)])
    async def greeting(script_id: str):
        b = get_brain()
        cfg = await b.config(script_id)
        g = (cfg.get("greeting") or "").strip()
        if not g:
            return {"greeting": ""}
        wav, ms = await b.speak(g, cfg.get("voice") or DEFAULT_VOICE, float(cfg.get("speech_rate") or 1))
        return {"greeting": g, "audio_b64": base64.b64encode(wav).decode(), "tts_ms": round(ms), "employee": cfg.get("employee")}

    return app


app = create_app()
