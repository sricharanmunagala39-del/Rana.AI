# RANA voice agent (in-house calling)

RANA's own phone agent. Every part runs on RANA's servers in India. The phone line itself is rented from a licensed carrier, as Indian law requires.

```
customer phone ─ SIP trunk (Exotel / Plivo) ─ LiveKit SIP ─ LiveKit server ─ rana_voice.agent
                                                                        ├─ STT server   (servers/stt_server.py)
                                                                        ├─ LLM server   (vLLM / SGLang)
                                                                        └─ TTS server   (servers/tts_server.py)
rana_voice.agent ─ signed HTTPS ─ RANA dashboard: /api/voice/agent-config, /api/webhooks/rana-voice
```

All three model servers speak the OpenAI API shape, so swapping a model is a settings change, not a code change. No OpenAI service is used.

| Part | Default | Licence |
|---|---|---|
| Speech-to-text | `ukta-app/whisper-telugu-ct2`: IIT Madras whisper-telugu-small, CTranslate2 build. Replaced by whichever model wins the Telugu test set (`voice-eval/`) | Apache-2.0 |
| LLM | `sarvamai/sarvam-30b`, served by SGLang or vLLM. Open weights; no Sarvam account involved | Apache-2.0 |
| Voice | `ai4bharat/indic-parler-tts`, Telugu voices Prakash, Lalitha and Kiran | Apache-2.0 |
| Turn-taking | Silero VAD via LiveKit Agents | MIT |
| Agent framework | LiveKit Agents 1.7.1, LiveKit server, LiveKit SIP | Apache-2.0 |

## What the dashboard does

**`POST /api/voice/agent-config`** decides who answers the call.
- **Inbound:** the dialled number picks the client, and the call goes to that client's active AI employee.
- **Outbound:** the dispatch names the employee.
- **Script:** compiled by the same `sessionPayload()` the Sarvam engine uses, so a script behaves identically on both engines.
- **Outbound blocks:** refused for do-not-call numbers and outside legal calling hours.

**`POST /api/webhooks/rana-voice`** handles the finished call.
- It is stored like any Sarvam call, then gets the AI read, opt-out → DNC, the handoff alert, the client's lead alerts and the Promise Engine.
- A retried delivery updates the same row.

Both are signed with HMAC-SHA256 using `RANA_VOICE_SECRET` (at least 32 characters, set on both sides), with 5-minute replay protection.

**If the dashboard is down,** the agent never drops a call. It retries, then writes the call to `spool/`, and the next call resends it.

## Rules the agent always follows

On top of every client script (`rana_voice/call_record.py`), the agent:
- says it is an AI assistant when asked;
- keeps replies short;
- follows the caller's language mix;
- says numbers as words;
- never invents prices;
- never claims something was sent or booked;
- hard-stops calls at 10 minutes.

## Run it (GPU server in India, e.g. E2E L40S)

```bash
pip install -r requirements.txt

# 1. Model servers
STT_ENGINE_MODEL=ukta-app/whisper-telugu-ct2 uvicorn servers.stt_server:app --port 8001
TTS_ENGINE=indic-parler uvicorn servers.tts_server:app --port 8002     # needs torch + parler-tts on a GPU
python -m sglang.launch_server --model sarvamai/sarvam-30b --port 8000  # or vLLM; see Sarvam's model card

# 2. LiveKit server + LiveKit SIP (self-hosted, see livekit.io docs), with the carrier's SIP trunk pointed at it

# 3. The agent
export LIVEKIT_URL=... LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=...
export RANA_DASHBOARD_URL=https://ranaai.in RANA_VOICE_SECRET=...   # same secret as in Vercel
python -m rana_voice.agent start
```

## Tests

```bash
pytest -q tests/test_unit.py                                     # no GPU, no network
RUN_INTEGRATION=1 TEST_CLIP=clip.wav pytest -q -s tests/test_integration.py
```

The integration test puts LiveKit's own plugins in front of our servers over real HTTP. The speech-to-text half uses the real Telugu model.

## Not yet verified

- **Real phone call:** none yet. That needs the SIP trunk, the LiveKit server and a GPU. The SIP attribute names in `agent.py` (`sip.phoneNumber`, `sip.trunkPhoneNumber`) need checking on the first real call.
- **Indic Parler-TTS:** loading and latency are not measured. It needs a GPU; only the test-tone voice has been run.
- **Telugu replies from the LLM:** Sarvam-30B's Telugu reply quality is not tested.
- **Reply time:** end-to-end reply time is not measured. The target is under 1.3 s, to be measured on the GPU.
