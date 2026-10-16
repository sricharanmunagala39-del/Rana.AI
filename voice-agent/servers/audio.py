"""Small audio helpers shared by the model servers: decode, resample, encode WAV. numpy only (ffmpeg for non-WAV)."""
from __future__ import annotations

import io
import subprocess
import wave

import numpy as np


def decode(data: bytes, target_sr: int = 16000) -> np.ndarray:
    """Any audio bytes → mono float32 at target_sr. WAV is read directly; anything else goes through ffmpeg."""
    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        with wave.open(io.BytesIO(data)) as w:
            sr, ch, width = w.getframerate(), w.getnchannels(), w.getsampwidth()
            raw = w.readframes(w.getnframes())
        if width != 2:
            raise ValueError("Only 16-bit PCM WAV is supported.")
        a = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768
        if ch > 1:
            a = a.reshape(-1, ch).mean(axis=1)
        return resample(a, sr, target_sr)
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", "pipe:0", "-ac", "1", "-ar", str(target_sr), "-f", "s16le", "pipe:1"],
                       input=data, capture_output=True, check=False, timeout=30)
    if p.returncode != 0:
        raise ValueError(f"Could not decode audio: {p.stderr.decode(errors='ignore')[:200]}")
    return np.frombuffer(p.stdout, dtype=np.int16).astype(np.float32) / 32768


def resample(a: np.ndarray, sr: int, target_sr: int) -> np.ndarray:
    if sr == target_sr or len(a) == 0:
        return a.astype(np.float32)
    n = int(round(len(a) * target_sr / sr))
    x_old = np.linspace(0, 1, num=len(a), endpoint=False)
    x_new = np.linspace(0, 1, num=n, endpoint=False)
    return np.interp(x_new, x_old, a).astype(np.float32)


def to_wav(a: np.ndarray, sr: int) -> bytes:
    pcm = (np.clip(a, -1, 1) * 32767).astype(np.int16).tobytes()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm)
    return buf.getvalue()
