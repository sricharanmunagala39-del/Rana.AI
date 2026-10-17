"""Builds deploy/rana_colab_test.ipynb: a free Google Colab run of the in-house test console.

Colab's free GPU (T4, 16 GB) can't hold Sarvam-30B, so the brain here is Qwen3-8B (via Ollama). Hearing and the Telugu
voice are the same models as on the real server. Replies are slower than on an L40S. Use test questions only: Colab
runs on Google's servers outside India.
    python deploy/make_colab.py
"""
import json
from pathlib import Path

BRANCH = "feat/in-house-voice-agent"
REPO = "https://github.com/sricharanmunagala39-del/rana.ai"


def md(text):
    return {"cell_type": "markdown", "metadata": {}, "source": text.strip("\n").splitlines(keepends=True)}


def code(text):
    return {"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": text.strip("\n").splitlines(keepends=True)}


cells = [
    md("""
# RANA in-house agent: free test on Google Colab

Talk to RANA's own AI employee in your browser: **your speech → our Telugu speech-to-text → our AI brain → our Telugu voice**.

**Before you start**
1. **Runtime → Change runtime type → T4 GPU → Save.**
2. Click the **🔑 key icon** in the left bar (Secrets) → **Add new secret**: name `HF_TOKEN`, value = your Hugging Face token. Turn on *Notebook access*.
   (Accept the terms on the `ai4bharat/indic-parler-tts` model page first, or the Telugu voice won't download.)
3. **Runtime → Run all.** First run takes about 10–15 minutes (downloads). When the last cell prints a link, open it.

**Limits of this free test:** smaller brain (Qwen3-8B instead of Sarvam-30B), slower GPU than the real server, and it runs on Google's servers outside India, so **use test questions only, no real customer data**. Colab switches off after a few hours or when idle.
"""),
    md("## 1. Check the GPU"),
    code("""
!nvidia-smi --query-gpu=name,memory.total --format=csv || echo "NO GPU: Runtime > Change runtime type > T4 GPU, then Run all again"
"""),
    md("## 2. Hugging Face token (for the Telugu voice)"),
    code("""
import os
from google.colab import userdata
try:
    os.environ["HF_TOKEN"] = userdata.get("HF_TOKEN")
    print("HF_TOKEN found")
except Exception as e:
    raise SystemExit("Add HF_TOKEN in the 🔑 Secrets panel on the left (and allow notebook access), then run this cell again.")
"""),
    md("## 3. Get RANA's code and install"),
    code(f"""
%cd /content
!rm -rf rana && git clone -q --depth 1 -b {BRANCH} {REPO} rana
%cd /content/rana/voice-agent
!pip -q install fastapi "uvicorn[standard]" python-multipart httpx faster-whisper sentencepiece
!pip -q install "git+https://github.com/huggingface/parler-tts.git"
print("installed")
"""),
    md("""
## 4. Upload the AI employees file
Upload **`test-employees.json`** (the file Claude sent you in the chat). It holds the compiled scripts of the AI employees to test.
"""),
    code("""
from google.colab import files
import json, shutil
up = files.upload()
name = next(iter(up))
shutil.move(name, "/content/test-employees.json")
emps = json.load(open("/content/test-employees.json"))
print("Loaded:", ", ".join(f"{e.get('client_name')}: {e.get('employee')}" for e in emps))
"""),
    md("## 5. Start the AI brain (Qwen3-8B via Ollama, about 5 GB download)"),
    code("""
!curl -fsSL https://ollama.com/install.sh | sh > /dev/null
import subprocess, time, urllib.request
subprocess.Popen("nohup ollama serve > /content/ollama.log 2>&1 &", shell=True)
time.sleep(5)
!ollama pull qwen3:8b
print(urllib.request.urlopen("http://127.0.0.1:11434/v1/models").read()[:200])
"""),
    md("## 6. Start hearing, voice and the test console"),
    code("""
import os, subprocess, time, urllib.request
env = dict(os.environ,
    STT_ENGINE="faster-whisper", STT_ENGINE_MODEL="ukta-app/whisper-telugu-ct2", STT_DEVICE="cuda",
    TTS_ENGINE="indic-parler",
    LLM_URL="http://127.0.0.1:11434/v1", LLM_MODEL="qwen3:8b", LLM_SYSTEM_SUFFIX="/no_think",
    STT_URL="http://127.0.0.1:8001/v1", TTS_URL="http://127.0.0.1:8002/v1",
    PLAYGROUND_SCRIPTS_FILE="/content/test-employees.json", PLAYGROUND_ALLOW_NO_PASSWORD="1")
def start(name, mod, port):
    log = open(f"/content/{name}.log", "w")
    subprocess.Popen(["python", "-m", "uvicorn", mod, "--host", "127.0.0.1", "--port", str(port)], env=env, stdout=log, stderr=log)
start("stt", "servers.stt_server:app", 8001)
start("tts", "servers.tts_server:app", 8002)
start("console", "servers.playground:app", 8080)

def ready(url, secs):
    for _ in range(secs // 5):
        try:
            urllib.request.urlopen(url, timeout=5); return True
        except Exception:
            time.sleep(5)
    return False
for name, url in [("hearing", "http://127.0.0.1:8001/health"), ("voice", "http://127.0.0.1:8002/health"), ("console", "http://127.0.0.1:8080/api/employees")]:
    print(name, "ready" if ready(url, 120) else f"NOT ready: see /content/{name if name != 'hearing' else 'stt'}.log")
"""),
    md("## 7. Warm up the models (first reply loads them; takes a few minutes once)"),
    code("""
import json, time, urllib.request, urllib.parse
emp = json.load(open("/content/test-employees.json"))[0]["id"]
data = urllib.parse.urlencode({"script_id": emp, "text": "హలో", "history": "[]", "speak": "true"}).encode()
t = time.time()
try:
    out = json.loads(urllib.request.urlopen("http://127.0.0.1:8080/api/turn", data=data, timeout=900).read())
    print(f"Warm-up done in {time.time()-t:.0f} s. Agent said: {out.get('reply')}")
    print("Timings:", out.get("timings"))
except Exception as e:
    print("Warm-up failed:", e); print(open("/content/tts.log").read()[-3000:]); print(open("/content/console.log").read()[-2000:])
"""),
    md("## 8. Open the test console"),
    code("""
from google.colab.output import eval_js
url = eval_js("google.colab.kernel.proxyPort(8080)")
print("Open this link in a new tab (it only works for your Google account):")
print(url)
print("Hold the orange button to talk, or type. Allow the microphone when the browser asks.")
"""),
    md("## 9. Automatic 22-question test (optional)"),
    code("""
import json, os, subprocess
emp = json.load(open("/content/test-employees.json"))[0]["id"]
subprocess.run(["python", "scripts/run_scenarios.py", emp],
               env=dict(os.environ, PLAYGROUND_URL="http://127.0.0.1:8080", PLAYGROUND_PASSWORD="",
                        PLAYGROUND_SCRIPTS_FILE="/content/test-employees.json"))
print(open(f"report-{emp[:8]}.md").read())
"""),
    md("""
## If something fails
- Logs: `/content/stt.log`, `/content/tts.log`, `/content/console.log`, `/content/ollama.log` (folder icon on the left).
- Copy the last lines of the failing log into the chat with Claude.
"""),
]

nb = {"cells": cells, "metadata": {"accelerator": "GPU", "colab": {"provenance": [], "gpuType": "T4"},
                                    "kernelspec": {"name": "python3", "display_name": "Python 3"}},
      "nbformat": 4, "nbformat_minor": 0}
out = Path(__file__).with_name("rana_colab_test.ipynb")
out.write_text(json.dumps(nb, ensure_ascii=False, indent=1), encoding="utf-8")
print("wrote", out)
