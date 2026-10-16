"""Cut each recording into short speech clips and write a first-draft Telugu transcript per clip.

Drafts come from vasista22/whisper-telugu-small (IIT Madras, Apache-2.0), CTranslate2 int8 build
ukta-app/whisper-telugu-ct2. They are NOT ground truth: a native speaker corrects them before
they are used to score any model.

Output: clips/recNN_SSS.wav (16 kHz mono) and segments.jsonl (one line per clip).
"""
import json, os, sys, time, wave
import numpy as np
from faster_whisper import WhisperModel
from faster_whisper.vad import VadOptions, get_speech_timestamps

SR = 16000
MAX_CLIP_S = 15.0
MIN_CLIP_S = 1.0

def load(path):
    w = wave.open(path)
    return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768

def save(path, a):
    w = wave.open(path, "wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(a, -1, 1) * 32767).astype(np.int16).tobytes()); w.close()

def clips(audio):
    """VAD speech regions, merged up to MAX_CLIP_S, so a clip is roughly one turn or a few short turns."""
    ts = get_speech_timestamps(audio, VadOptions(min_silence_duration_ms=500, speech_pad_ms=200))
    out, cur = [], None
    for t in ts:
        s, e = t["start"], t["end"]
        if cur and (e - cur[0]) / SR <= MAX_CLIP_S and (s - cur[1]) / SR < 1.0:
            cur[1] = e
        else:
            if cur: out.append(cur)
            cur = [s, e]
    if cur: out.append(cur)
    # split anything still too long into equal pieces
    final = []
    for s, e in out:
        n = int(np.ceil((e - s) / SR / MAX_CLIP_S))
        step = (e - s) // max(n, 1)
        for k in range(n):
            a, b = s + k * step, (e if k == n - 1 else s + (k + 1) * step)
            if (b - a) / SR >= MIN_CLIP_S: final.append((a, b))
    return final

def main(recs):
    os.makedirs("clips", exist_ok=True)
    model = WhisperModel("ukta-app/whisper-telugu-ct2", device="cpu", compute_type="int8", cpu_threads=2)
    done = set()
    if os.path.exists("segments.jsonl"):
        done = {json.loads(l)["id"] for l in open("segments.jsonl")}
    with open("segments.jsonl", "a") as out:
        for rec in recs:
            audio = load(f"audio/{rec}.wav")
            t0 = time.time()
            limit = float(os.environ.get('MAX_S', '1e9'))
            for a, b in clips(audio):
                if a / SR >= limit: break
                cid = f"{rec}_{a // SR:04d}"
                if cid in done: continue
                seg = audio[a:b]
                save(f"clips/{cid}.wav", seg)
                parts, _ = model.transcribe(seg, language="te", beam_size=2, condition_on_previous_text=False,
                                            vad_filter=False, without_timestamps=True)
                text = " ".join(p.text.strip() for p in parts).strip()
                out.write(json.dumps({"id": cid, "rec": rec, "start": round(a / SR, 2), "end": round(b / SR, 2),
                                      "draft": text, "model": "vasista22/whisper-telugu-small (ct2 int8)"}, ensure_ascii=False) + "\n")
                out.flush()
            print(f"{rec} done in {time.time() - t0:.0f}s", flush=True)

if __name__ == "__main__":
    main(sys.argv[1:])
