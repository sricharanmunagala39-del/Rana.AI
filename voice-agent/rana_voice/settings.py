"""Configuration from environment variables. Every model sits behind an OpenAI-compatible URL, so swapping a
model is a settings change: point STT_URL / LLM_URL / TTS_URL at a different server."""
from __future__ import annotations

import os
from dataclasses import dataclass


def _env(name: str, default: str | None = None, required: bool = False) -> str:
    v = os.environ.get(name, default)
    if required and not v:
        raise RuntimeError(f"Missing environment variable {name}")
    return v or ""


@dataclass(frozen=True)
class Settings:
    dashboard_url: str
    voice_secret: str
    stt_url: str
    stt_model: str
    llm_url: str
    llm_model: str
    llm_api_key: str
    tts_url: str
    tts_model: str
    tts_default_voice: str
    max_call_seconds: int
    spool_dir: str
    agent_name: str

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            dashboard_url=_env("RANA_DASHBOARD_URL", "https://ranaai.in"),
            voice_secret=_env("RANA_VOICE_SECRET", required=True),
            stt_url=_env("STT_URL", "http://127.0.0.1:8001/v1"),
            stt_model=_env("STT_MODEL", "telugu-default"),
            llm_url=_env("LLM_URL", "http://127.0.0.1:8000/v1"),          # vLLM or SGLang, OpenAI-compatible
            llm_model=_env("LLM_MODEL", "sarvamai/sarvam-30b"),
            llm_api_key=_env("LLM_API_KEY", "local"),                       # self-hosted servers ignore it
            tts_url=_env("TTS_URL", "http://127.0.0.1:8002/v1"),
            tts_model=_env("TTS_MODEL", "indic-parler-tts"),
            tts_default_voice=_env("TTS_DEFAULT_VOICE", "Lalitha"),
            max_call_seconds=int(_env("MAX_CALL_SECONDS", "600")),
            spool_dir=_env("SPOOL_DIR", "spool"),
            agent_name=_env("AGENT_NAME", "rana-voice"),
        )


def stt_language(code: str | None) -> str:
    """'te-IN' → 'te'. Unknown or empty → Telugu, RANA's first market."""
    base = (code or "").split("-")[0].lower()
    return base if base in {"te", "hi", "en", "ta", "kn", "ml", "mr", "bn", "gu", "pa", "or"} else "te"
