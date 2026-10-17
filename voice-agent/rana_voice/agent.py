"""RANA's in-house phone agent (LiveKit Agents). One job per call.

Call path:  phone line (SIP trunk) → LiveKit SIP → this agent → our own STT / LLM / TTS servers.
Inbound:  LiveKit SIP dispatches the call here; the dialled number picks the client and AI employee.
Outbound: the dashboard creates a dispatch with metadata {"script_id", "remote", "caller", "campaign_id"?}
          and LiveKit SIP dials `remote`; agent-config refuses DNC numbers and calls outside legal hours.

Run:  python -m rana_voice.agent start     (needs LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET + settings.py vars)
"""
from __future__ import annotations

import asyncio
import json
import logging
import time

from livekit import agents
from livekit.agents import Agent, AgentServer, AgentSession, JobContext, JobProcess
from livekit.plugins import openai, silero

from .call_record import CallRecord, compose_instructions
from .dashboard import Dashboard, DashboardError
from .settings import Settings, stt_language

log = logging.getLogger("rana-voice")
S = Settings.from_env()
server = AgentServer()


def prewarm(proc: JobProcess) -> None:
    proc.userdata["vad"] = silero.VAD.load()  # loaded once per worker process, not per call


server.setup_fnc = prewarm


@server.rtc_session(agent_name=S.agent_name)
async def entrypoint(ctx: JobContext) -> None:
    dash = Dashboard(S.dashboard_url, S.voice_secret, spool_dir=S.spool_dir)
    asyncio.create_task(dash.flush_spool())  # resend any calls that couldn't be reported earlier

    meta = json.loads(ctx.job.metadata or "{}")
    await ctx.connect()
    caller = await ctx.wait_for_participant()
    attrs = caller.attributes or {}
    outbound = bool(meta.get("remote"))
    # LiveKit SIP participant attributes. Verify the exact names on the first real test call.
    remote = meta.get("remote") or attrs.get("sip.phoneNumber")
    our_number = attrs.get("sip.trunkPhoneNumber")

    rec = CallRecord(call_id=ctx.room.name, direction="outbound" if outbound else "inbound",
                     caller_phone=remote, agent_phone=our_number, campaign_id=meta.get("campaign_id"),
                     source="campaign" if meta.get("campaign_id") else None)

    try:
        cfg = await dash.fetch_config(direction=rec.direction, to=our_number, remote=remote,
                                      script_id=meta.get("script_id"), caller=meta.get("caller"))
    except (DashboardError, Exception) as e:  # no config → we can't know who we are; end politely and safely
        log.error("agent-config failed for %s: %s", ctx.room.name, e)
        ctx.shutdown(reason="no agent config")
        return

    rec.client_id, rec.script_id = cfg["client_id"], cfg["script_id"]
    rec.caller_name = (meta.get("caller") or {}).get("name")
    rec.models = {"stt": S.stt_model, "llm": S.llm_model, "tts": S.tts_model}

    session = AgentSession(
        vad=ctx.proc.userdata["vad"],
        stt=openai.STT(base_url=S.stt_url, api_key="local", model=S.stt_model, language=stt_language(cfg.get("language"))),
        llm=openai.LLM(base_url=S.llm_url, api_key=S.llm_api_key, model=S.llm_model, temperature=0.3, max_completion_tokens=160),
        tts=openai.TTS(base_url=S.tts_url, api_key="local", model=S.tts_model,
                       voice=cfg.get("voice") or S.tts_default_voice, speed=float(cfg.get("speech_rate") or 1), response_format="wav"),
    )

    # Transcript and reply-time measurements for the dashboard.
    @session.on("conversation_item_added")
    def _item(ev) -> None:
        item = ev.item
        role = getattr(item, "role", None)
        text = getattr(item, "text_content", None)
        if role in ("assistant", "user") and text:
            rec.add_turn("agent" if role == "assistant" else "user", text)

    marks: dict[str, float] = {}

    @session.on("user_state_changed")
    def _user(ev) -> None:
        if ev.old_state == "speaking" and ev.new_state == "listening":
            marks["user_done"] = time.time()

    @session.on("agent_state_changed")
    def _agent(ev) -> None:
        if ev.new_state == "speaking" and "user_done" in marks:
            rec.add_reply_latency((time.time() - marks.pop("user_done")) * 1000)

    async def report() -> None:
        rec.finish("caller_hangup")
        try:
            await dash.post_call(rec.payload())
        except Exception as e:  # a rejected payload is logged; network failures were already spooled
            log.error("could not report call %s: %s", rec.call_id, e)

    ctx.add_shutdown_callback(report)

    await session.start(agent=Agent(instructions=compose_instructions(cfg.get("instructions", ""))), room=ctx.room, record=False)
    rec.mark_answered()
    greeting = (cfg.get("greeting") or "").strip()
    if greeting:
        await session.say(greeting)
    else:
        session.generate_reply(instructions="Greet the caller briefly and ask how you can help.")

    # Hard stop so a stuck call can never run up GPU or phone minutes.
    async def _cap() -> None:
        await asyncio.sleep(S.max_call_seconds)
        rec.finish("max_duration")
        ctx.shutdown(reason="max call duration reached")

    asyncio.create_task(_cap())


if __name__ == "__main__":
    agents.cli.run_app(server)
