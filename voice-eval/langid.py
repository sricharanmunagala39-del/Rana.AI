import wave, numpy as np
from faster_whisper import WhisperModel

m = WhisperModel("small", device="cpu", compute_type="int8", cpu_threads=2)

def load(f):
    w = wave.open(f)
    return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768

for i in range(1, 12):
    a = load(f"audio/rec{i:02d}.wav")
    out = []
    for start in (30, 150, 270):
        seg = a[start * 16000:(start + 30) * 16000]
        if len(seg) < 16000 * 5:
            continue
        lang, p, allp = m.detect_language(seg)
        top = sorted(allp, key=lambda x: -x[1])[:3]
        out.append(" ".join(f"{l}:{q:.2f}" for l, q in top))
    print(f"rec{i:02d}", " | ".join(out), flush=True)
