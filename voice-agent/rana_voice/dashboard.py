"""Signed calls from the voice agent to the RANA dashboard (lib/voice/rana.ts is the other side).

Two calls only:
  fetch_config(...)  POST /api/voice/agent-config   who answers this call, with the compiled script
  post_call(...)     POST /api/webhooks/rana-voice   the finished call (stored + after-call steps)

A finished call is never dropped: if the dashboard can't be reached after retries, the payload is written
to the spool folder and `flush_spool()` resends it later (run it on start-up and from a timer).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
import uuid
from pathlib import Path
from typing import Any

import httpx


class DashboardError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(f"{status}: {message}")
        self.status = status
        self.message = message


def sign(secret: str, timestamp: str, raw_body: str) -> str:
    return hmac.new(secret.encode(), f"{timestamp}.{raw_body}".encode(), hashlib.sha256).hexdigest()


class Dashboard:
    def __init__(self, base_url: str, secret: str, spool_dir: str | Path = "spool", timeout_s: float = 8.0,
                 client: httpx.AsyncClient | None = None):
        if not secret or len(secret) < 32:
            raise ValueError("RANA_VOICE_SECRET must be at least 32 characters (same value as on the dashboard).")
        self.base = base_url.rstrip("/")
        self.secret = secret
        self.spool = Path(spool_dir)
        self._client = client or httpx.AsyncClient(timeout=timeout_s)

    async def _post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        raw = json.dumps(body, ensure_ascii=False, separators=(",", ":"))
        ts = str(int(time.time() * 1000))
        r = await self._client.post(
            f"{self.base}{path}",
            content=raw.encode(),
            headers={"content-type": "application/json", "x-rana-timestamp": ts, "x-rana-signature": sign(self.secret, ts, raw)},
        )
        data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        if r.status_code >= 400:
            raise DashboardError(r.status_code, str(data.get("error") or r.text[:200]))
        return data

    async def fetch_config(self, *, direction: str, to: str | None = None, remote: str | None = None,
                           script_id: str | None = None, caller: dict | None = None) -> dict[str, Any]:
        body = {"direction": direction, "to": to, "remote": remote, "script_id": script_id, "caller": caller}
        return await self._post("/api/voice/agent-config", {k: v for k, v in body.items() if v is not None})

    async def post_call(self, payload: dict[str, Any], attempts: int = 3) -> dict[str, Any] | None:
        """Deliver a finished call. Returns the dashboard's answer, or None if it was spooled for later."""
        delay = 1.0
        for i in range(attempts):
            try:
                return await self._post("/api/webhooks/rana-voice", payload)
            except DashboardError as e:
                if 400 <= e.status < 500 and e.status not in (408, 429):
                    raise  # a bad payload won't get better by retrying; surface it
            except (httpx.HTTPError, ValueError):
                pass
            if i < attempts - 1:
                await _sleep(delay)
                delay *= 3
        self._write_spool(payload)
        return None

    def _write_spool(self, payload: dict[str, Any]) -> Path:
        self.spool.mkdir(parents=True, exist_ok=True)
        path = self.spool / f"{int(time.time())}-{payload.get('call_id', uuid.uuid4().hex)}.json"
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False))
        os.replace(tmp, path)  # atomic: a crash never leaves half a file
        return path

    async def flush_spool(self) -> int:
        """Resend spooled calls. Returns how many were delivered."""
        if not self.spool.exists():
            return 0
        sent = 0
        for path in sorted(self.spool.glob("*.json")):
            try:
                await self._post("/api/webhooks/rana-voice", json.loads(path.read_text()))
            except DashboardError as e:
                if 400 <= e.status < 500 and e.status not in (408, 429):
                    path.rename(path.with_suffix(".rejected"))  # keep it for a human, stop retrying
                continue
            except (httpx.HTTPError, ValueError):
                break  # dashboard still down; try again next time
            path.unlink()
            sent += 1
        return sent


async def _sleep(s: float) -> None:
    import asyncio
    await asyncio.sleep(s)
