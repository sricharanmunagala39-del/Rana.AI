"""Automatic test of an AI employee on the in-house stack: asks every question in tests/scenarios.json through the test
console (same STT/LLM/TTS servers as phone calls) and checks each reply against RANA's rules.

    PLAYGROUND_URL=http://127.0.0.1:8080 PLAYGROUND_PASSWORD=... \
    RANA_DASHBOARD_URL=https://ranaai.in RANA_VOICE_SECRET=... \
    python scripts/run_scenarios.py <script_id> [--voice]      →  writes report-<script_id>.md

Checks per reply (heuristics; a person should still listen to a sample):
  short       at most N sentences (default 3)
  language    Telugu question → Telugu script reply; English question → mostly English
  must        regexes that must appear (e.g. says it is an AI when asked)
  must_not    regexes that must not appear (e.g. "I have sent it", "I am a human")
  no_new_nums the reply contains no number that isn't in the employee's own script (no invented prices)
  speed       thinking time (and voice time with --voice) under 1.5 s
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from rana_voice.dashboard import Dashboard  # noqa: E402

TE = re.compile(r"[ఀ-౿]")
LATIN = re.compile(r"[A-Za-z]")
NUM_WORDS = {"ఒకటి", "రెండు", "మూడు", "నాలుగు", "ఐదు", "ఆరు", "ఏడు", "ఎనిమిది", "తొమ్మిది", "పది", "వంద", "వందలు", "వెయ్యి", "వేలు", "వేల",
             "లక్ష", "ఫిఫ్టీ", "హండ్రెడ్", "థౌజండ్", "తౌసండ్", "hundred", "thousand", "lakh"}


def sentences(text: str) -> int:
    return len([s for s in re.split(r"[.!?।\n]+", text) if s.strip()])


def numbers(text: str) -> set[str]:
    toks = re.findall(r"\d[\d,.]*|[\wఀ-౿]+", text.lower())
    return {t.replace(",", "") for t in toks if re.fullmatch(r"\d[\d,.]*", t)} | {t for t in toks if t in NUM_WORDS}


def check(sc: dict, reply: str, script_text: str, timings: dict, with_voice: bool) -> list[tuple[str, bool, str]]:
    out = []
    limit = sc.get("max_sentences", 3)
    n = sentences(reply)
    out.append(("short", n <= limit, f"{n} sentences (max {limit})"))
    lang = sc.get("lang", "any")
    if lang != "any":
        te, la = len(TE.findall(reply)), len(LATIN.findall(reply))
        ok = te > la * 0.5 if lang == "te" else la > te
        out.append(("language", ok, f"Telugu letters {te}, English letters {la}, expected {lang}"))
    for rx in sc.get("must", []):
        out.append(("must", bool(re.search(rx, reply, re.I)), f"should match /{rx}/"))
    for rx in sc.get("must_not", []):
        m = re.search(rx, reply, re.I)
        out.append(("must_not", not m, f"must not say '{m.group(0)}'" if m else f"avoids /{rx}/"))
    if sc.get("no_new_numbers"):
        new = numbers(reply) - numbers(script_text) - numbers(" ".join(sc["say"]))
        out.append(("no_new_nums", not new, "no invented numbers" if not new else f"numbers not in script: {sorted(new)}"))
    think = timings.get("llm_ms", 0)
    out.append(("speed", think <= 1500, f"thinking {think / 1000:.2f} s"))
    if with_voice and "tts_ms" in timings:
        out.append(("voice_speed", timings["tts_ms"] <= 1500, f"voice {timings['tts_ms'] / 1000:.2f} s"))
    return out


async def main(script_id: str, with_voice: bool) -> int:
    base = os.environ.get("PLAYGROUND_URL", "http://127.0.0.1:8080")
    auth = ("rana", os.environ["PLAYGROUND_PASSWORD"])
    dash = Dashboard(os.environ.get("RANA_DASHBOARD_URL", "https://ranaai.in"), os.environ["RANA_VOICE_SECRET"])
    cfg = await dash.fetch_config(direction="inbound", script_id=script_id)
    script_text = f"{cfg.get('instructions', '')} {cfg.get('greeting', '')}"
    scenarios = json.loads((Path(__file__).resolve().parents[1] / "tests" / "scenarios.json").read_text(encoding="utf-8"))

    rows, passed = [], 0
    async with httpx.AsyncClient(timeout=120, auth=auth) as http:
        for sc in scenarios:
            history: list[dict] = []
            reply, timings = "", {}
            for said in sc["say"]:
                r = await http.post(f"{base}/api/turn", data={"script_id": script_id, "history": json.dumps(history),
                                                              "text": said, "speak": str(with_voice).lower()})
                r.raise_for_status()
                out = r.json()
                reply, timings = out.get("reply", ""), out.get("timings", {})
                history += [{"role": "user", "content": said}, {"role": "assistant", "content": reply}]
            results = check(sc, reply, script_text, timings, with_voice)
            ok = all(r[1] for r in results)
            passed += ok
            rows.append((sc, reply, results, ok))
            print(f"{'PASS' if ok else 'FAIL'}  {sc['id']}: {reply[:90]}")

    lines = [f"# Scenario test: {cfg.get('employee')} ({cfg.get('client_name')})", "",
             f"{passed} of {len(rows)} scenarios passed · {time.strftime('%Y-%m-%d %H:%M')}", ""]
    for sc, reply, results, ok in rows:
        lines += [f"## {'✅' if ok else '❌'} {sc['id']}", "", "**Caller:** " + " → ".join(sc["say"]), "", f"**Agent:** {reply}", ""]
        lines += [f"- {'✓' if r[1] else '✗'} {r[0]}: {r[2]}" for r in results] + [""]
    Path(f"report-{script_id[:8]}.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"\n{passed}/{len(rows)} passed → report-{script_id[:8]}.md")
    return 0 if passed == len(rows) else 1


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(2)
    sys.exit(asyncio.run(main(sys.argv[1], "--voice" in sys.argv)))
