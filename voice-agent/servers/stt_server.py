"""Speech-to-text server with the OpenAI transcription API shape (POST /v1/audio/transcriptions).

The engine is chosen by STT_ENGINE:
  faster-whisper  any CTranslate2 Whisper model, e.g. STT_ENGINE_MODEL=ukta-app/whisper-telugu-ct2 (default, CPU or GPU)
  (next) indic-transcribe / indic-conformer  once the Telugu test set picks a winner
Run:  uvicorn servers.stt_server:app --host 0.0.0.0 --port 8001
"""
from __future__ import annotations

import os
import time
from typing import Protocol

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from .audio import decode

MAX_BYTES = 10 * 1024 * 1024
MAX_SECONDS = 60


class Engine(Protocol):
    name: str
    def transcribe(self, audio16k: np.ndarray, language: str) -> str: ...


class FasterWhisperEngine:
    def __init__(self, model: str, device: str = "auto", compute_type: str = "int8"):
        from faster_whisper import WhisperModel
        self.name = model
        self.model = WhisperModel(model, device=device, compute_type=compute_type)

    def transcribe(self, audio16k: np.ndarray, language: str) -> str:
        segs, _ = self.model.transcribe(audio16k, language=language or "te", beam_size=2,
                                        condition_on_previous_text=False, without_timestamps=True, vad_filter=False)
        return " ".join(s.text.strip() for s in segs).replace("�", "").strip()


def load_engine() -> Engine:
    kind = os.environ.get("STT_ENGINE", "faster-whisper")
    if kind == "faster-whisper":
        return FasterWhisperEngine(os.environ.get("STT_ENGINE_MODEL", "ukta-app/whisper-telugu-ct2"),
                                   device=os.environ.get("STT_DEVICE", "auto"))
    raise RuntimeError(f"Unknown STT_ENGINE {kind!r}")


def create_app(engine: Engine | None = None) -> FastAPI:
    app = FastAPI(title="RANA STT")
    state: dict = {"engine": engine}

    def get_engine() -> Engine:
        if state["engine"] is None:
            state["engine"] = load_engine()
        return state["engine"]

    @app.get("/health")
    def health():
        return {"ok": True, "engine": getattr(state["engine"], "name", None)}

    @app.get("/v1/models")
    def models():
        return {"object": "list", "data": [{"id": get_engine().name, "object": "model"}]}

    @app.post("/v1/audio/transcriptions")
    async def transcriptions(file: UploadFile = File(...), model: str = Form("default"), language: str = Form("te"),
                             response_format: str = Form("json"), prompt: str | None = Form(None)):
        data = await file.read()
        if not data:
            raise HTTPException(400, "Empty audio file.")
        if len(data) > MAX_BYTES:
            raise HTTPException(413, "Audio file too large.")
        try:
            audio = decode(data, 16000)
        except ValueError as e:
            raise HTTPException(400, str(e))
        if len(audio) > MAX_SECONDS * 16000:
            raise HTTPException(413, f"Audio longer than {MAX_SECONDS} s.")
        t0 = time.perf_counter()
        text = get_engine().transcribe(audio, (language or "te").split("-")[0])
        ms = round((time.perf_counter() - t0) * 1000)
        if response_format == "text":
            from fastapi.responses import PlainTextResponse
            return PlainTextResponse(text, headers={"x-rana-stt-ms": str(ms)})
        return {"text": text, "x_rana": {"engine": get_engine().name, "ms": ms, "audio_s": round(len(audio) / 16000, 2)}}

    return app


app = create_app()
