"""Collects what happened on one call and turns it into the payload the dashboard stores. Pure: no I/O."""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

# Rules RANA adds on top of every client's compiled script, whatever the script says.
ENGINE_RULES = """
# Phone rules (always apply)
- You are an AI assistant. If anyone asks whether you are a person or a bot, say plainly that you are an AI assistant for this business. Never claim to be human.
- This is a phone call: reply in one or two short sentences, then let the caller speak.
- Reply in the language and mix the caller is using (Telugu, Hindi, English or a mix such as Tenglish). Do not switch scripts or languages on your own.
- Say numbers, prices, dates and times as words, the way people say them on the phone.
- Never invent prices, availability, discounts, dates or guarantees. If the script doesn't say it, say a team member will confirm it.
- Never say something was sent, booked or confirmed. Say the team will send it or confirm it.
""".strip()


def compose_instructions(compiled_script: str) -> str:
    """The dashboard's compiled script for this employee, followed by RANA's engine rules."""
    body = (compiled_script or "").strip()
    return f"{body}\n\n{ENGINE_RULES}" if body else ENGINE_RULES


def _iso(t: float) -> str:
    return datetime.fromtimestamp(t, tz=timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass
class CallRecord:
    call_id: str
    direction: str                       # "inbound" | "outbound"
    client_id: str | None = None
    script_id: str | None = None
    caller_phone: str | None = None      # the customer's number
    agent_phone: str | None = None       # RANA's number on this call
    caller_name: str | None = None
    source: str | None = None
    campaign_id: str | None = None
    started_at: float = field(default_factory=time.time)
    answered_at: float | None = None
    ended_at: float | None = None
    end_reason: str | None = None
    turns: list[dict] = field(default_factory=list)
    reply_ms: list[float] = field(default_factory=list)
    models: dict[str, str] = field(default_factory=dict)

    def mark_answered(self, at: float | None = None) -> None:
        if self.answered_at is None:
            self.answered_at = at or time.time()

    def add_turn(self, role: str, text: str, at: float | None = None) -> None:
        text = (text or "").strip()
        if role not in ("agent", "user") or not text:
            return
        self.turns.append({"role": role, "text": text, "at": at or time.time()})
        if role == "user":
            self.mark_answered(at)

    def add_reply_latency(self, ms: float) -> None:
        if ms >= 0:
            self.reply_ms.append(ms)

    def finish(self, reason: str, at: float | None = None) -> None:
        if self.ended_at is None:
            self.ended_at = at or time.time()
            self.end_reason = reason

    def payload(self) -> dict:
        """Matches RanaCallPayload in lib/voice/rana.ts."""
        if not self.client_id:
            raise ValueError("A call can only be reported once it is tied to a client.")
        ended = self.ended_at or time.time()
        answered = self.answered_at is not None or any(t["role"] == "user" for t in self.turns)
        metrics = {}
        if self.reply_ms:
            s = sorted(self.reply_ms)
            metrics = {"avg_reply_ms": round(sum(s) / len(s)), "p90_reply_ms": round(s[min(len(s) - 1, int(0.9 * len(s)))]), "replies": len(s)}
        return {
            "call_id": self.call_id,
            "client_id": self.client_id,
            "script_id": self.script_id,
            "direction": self.direction,
            "source": self.source,
            "campaign_id": self.campaign_id,
            "caller_phone": self.caller_phone,
            "agent_phone": self.agent_phone,
            "caller_name": self.caller_name,
            # duration counts from when the call was answered, like a phone bill
            "started_at": _iso(self.answered_at or self.started_at),
            "ended_at": _iso(ended),
            "answered": answered,
            "end_reason": self.end_reason or ("caller_hangup" if answered else "no_answer"),
            "transcript": [{"role": t["role"], "text": t["text"]} for t in self.turns],
            "metrics": metrics,
            "models": self.models,
        }
