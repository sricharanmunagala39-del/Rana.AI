"""Text-to-speech server with the OpenAI speech API shape (POST /v1/audio/speech). Always answers WAV, 24 kHz mono,
which is what the LiveKit OpenAI plugin expects.

The engine is chosen by TTS_ENGINE:
  indic-parler  ai4bharat/indic-parler-tts (Apache-2.0), Telugu voices Prakash / Lalitha / Kiran. Needs a GPU.
  tone          a test tone, for wiring tests without a model.
Run:  uvicorn servers.tts_server:app --host 0.0.0.0 --port 8002
"""
from __future__ import annotations

import os
import time
from typing import Protocol

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from .audio import resample, to_wav

OUT_SR = 24000
MAX_CHARS = 600  # one spoken reply; longer text means the LLM ignored the "short replies" rule


class SpeechRequest(BaseModel):
    input: str = Field(..., min_length=1)
    model: str = "default"
    voice: str = "Lalitha"
    response_format: str = "wav"
    speed: float = 1.0
    instructions: str | None = None


class Engine(Protocol):
    name: str
    def speak(self, text: str, voice: str, speed: float) -> tuple[np.ndarray, int]: ...


class ToneEngine:
    """Deterministic stand-in: 0.1 s of 440 Hz per 10 characters. For tests and wiring checks only."""
    name = "tone"

    def speak(self, text: str, voice: str, speed: float) -> tuple[np.ndarray, int]:
        secs = max(0.2, 0.1 * len(text) / 10 / max(speed, 0.5))
        t = np.arange(int(secs * 16000)) / 16000
        return (0.2 * np.sin(2 * np.pi * 440 * t)).astype(np.float32), 16000


class IndicParlerEngine:
    """Indic Parler-TTS. Voice and pace are steered by a plain-language description. Load and latency NOT YET MEASURED."""

    def __init__(self, model_id: str = "ai4bharat/indic-parler-tts"):
        import torch
        from parler_tts import ParlerTTSForConditionalGeneration
        from transformers import AutoTokenizer
        self.name = model_id
        self.torch = torch
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = ParlerTTSForConditionalGeneration.from_pretrained(model_id).to(self.device)
        self.tok = AutoTokenizer.from_pretrained(model_id)
        self.desc_tok = AutoTokenizer.from_pretrained(self.model.config.text_encoder._name_or_path)
        self.sr = self.model.config.sampling_rate

    @staticmethod
    def describe(voice: str, speed: float) -> str:
        pace = "slightly fast" if speed > 1.1 else "slightly slow" if speed < 0.9 else "moderate"
        return (f"{voice} speaks in a warm, friendly and clear voice at a {pace} pace, like a helpful phone assistant. "
                "The recording is very clear, with no background noise.")

    def speak(self, text: str, voice: str, speed: float) -> tuple[np.ndarray, int]:
        d = self.desc_tok(self.describe(voice, speed), return_tensors="pt").to(self.device)
        p = self.tok(text, return_tensors="pt").to(self.device)
        with self.torch.inference_mode():
            out = self.model.generate(input_ids=d.input_ids, attention_mask=d.attention_mask,
                                      prompt_input_ids=p.input_ids, prompt_attention_mask=p.attention_mask)
        return out.cpu().numpy().squeeze().astype(np.float32), self.sr


def load_engine() -> Engine:
    kind = os.environ.get("TTS_ENGINE", "indic-parler")
    if kind == "indic-parler":
        return IndicParlerEngine(os.environ.get("TTS_ENGINE_MODEL", "ai4bharat/indic-parler-tts"))
    if kind == "tone":
        return ToneEngine()
    raise RuntimeError(f"Unknown TTS_ENGINE {kind!r}")


def create_app(engine: Engine | None = None) -> FastAPI:
    app = FastAPI(title="RANA TTS")
    state: dict = {"engine": engine}

    def get_engine() -> Engine:
        if state["engine"] is None:
            state["engine"] = load_engine()
        return state["engine"]

    @app.get("/health")
    def health():
        return {"ok": True, "engine": getattr(state["engine"], "name", None)}

    @app.post("/v1/audio/speech")
    def speech(req: SpeechRequest):
        text = req.input.strip()
        if not text:
            raise HTTPException(400, "Nothing to say.")
        if len(text) > MAX_CHARS:
            raise HTTPException(413, f"Text longer than {MAX_CHARS} characters.")
        t0 = time.perf_counter()
        audio, sr = get_engine().speak(text, req.voice, req.speed)
        wav = to_wav(resample(audio, sr, OUT_SR), OUT_SR)
        return Response(wav, media_type="audio/wav", headers={"x-rana-tts-ms": str(round((time.perf_counter() - t0) * 1000))})

    return app


app = create_app()
