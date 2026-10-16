#!/usr/bin/env bash
# One-command setup of RANA's in-house voice stack on a fresh GPU server (Ubuntu 22.04/24.04 with NVIDIA driver + CUDA,
# e.g. E2E Networks L40S 48 GB). Installs and starts four services, each behind the OpenAI API shape:
#   rana-llm         :8000  SGLang serving the brain (default Sarvam-30B in FP8; LLM_CHOICE=qwen3-8b for the smaller one)
#   rana-stt         :8001  speech-to-text (Telugu Whisper)
#   rana-tts         :8002  voice (Indic Parler-TTS)
#   rana-playground  :8080  the test console (bound to 127.0.0.1: open it through an SSH tunnel)
#
# Usage (as root):
#   export HF_TOKEN=hf_...            # Hugging Face token; accept Indic Parler-TTS's terms on its model page first
#   export RANA_VOICE_SECRET=...      # same value as in Vercel (32+ characters)
#   export PLAYGROUND_PASSWORD=...    # password for the test console
#   (optional) PLAYGROUND_EMPLOYEES='[...]'   defaults to deploy/employees.json (Fashion House, Sunrise, T Homes, Sri Mahadev)
#   bash deploy/gpu-setup.sh
#
# STATUS: written but NOT YET RUN on a GPU. The first run is part of the in-house test.
set -euo pipefail

: "${HF_TOKEN:?Set HF_TOKEN (Hugging Face token)}"
: "${RANA_VOICE_SECRET:?Set RANA_VOICE_SECRET (same as Vercel)}"
: "${PLAYGROUND_PASSWORD:?Set PLAYGROUND_PASSWORD}"
LLM_CHOICE="${LLM_CHOICE:-sarvam-30b}"
APP=/opt/rana-voice
SRC="$(cd "$(dirname "$0")/.." && pwd)"
PLAYGROUND_EMPLOYEES="${PLAYGROUND_EMPLOYEES:-$(tr -d '\n' < "$SRC/deploy/employees.json")}"

case "$LLM_CHOICE" in
  sarvam-30b) LLM_MODEL=sarvamai/sarvam-30b; LLM_FLAGS="--quantization fp8 --mem-fraction-static 0.70 --trust-remote-code" ;;
  qwen3-8b)   LLM_MODEL=Qwen/Qwen3-8B;       LLM_FLAGS="--mem-fraction-static 0.45" ;;
  *) echo "LLM_CHOICE must be sarvam-30b or qwen3-8b"; exit 1 ;;
esac

echo "== GPU check"
nvidia-smi --query-gpu=name,memory.total --format=csv || { echo "No NVIDIA GPU visible. Stop."; exit 1; }

echo "== System packages"
apt-get update -qq && apt-get install -y -qq rsync curl ffmpeg python3-venv python3-dev git build-essential >/dev/null

echo "== Code"
mkdir -p "$APP" && rsync -a --delete --exclude spool --exclude __pycache__ "$SRC/" "$APP/"

echo "== Python environments (separate, so SGLang's pinned versions don't clash with the voice servers)"
python3 -m venv "$APP/.venv-voice"
"$APP/.venv-voice/bin/pip" install -q --upgrade pip
"$APP/.venv-voice/bin/pip" install -q -r "$APP/requirements.txt" torch transformers sentencepiece "git+https://github.com/huggingface/parler-tts.git"
python3 -m venv "$APP/.venv-llm"
"$APP/.venv-llm/bin/pip" install -q --upgrade pip
"$APP/.venv-llm/bin/pip" install -q "sglang[all]"

echo "== Models (first run downloads ~40-130 GB; reruns are instant)"
export HF_HUB_ENABLE_HF_TRANSFER=0
"$APP/.venv-voice/bin/huggingface-cli" login --token "$HF_TOKEN" >/dev/null
"$APP/.venv-voice/bin/huggingface-cli" download ukta-app/whisper-telugu-ct2 >/dev/null
"$APP/.venv-voice/bin/huggingface-cli" download ai4bharat/indic-parler-tts >/dev/null
"$APP/.venv-voice/bin/huggingface-cli" download "$LLM_MODEL" >/dev/null

echo "== Settings"
umask 077
cat > /etc/rana-voice.env <<EOF
HF_TOKEN=$HF_TOKEN
RANA_DASHBOARD_URL=${RANA_DASHBOARD_URL:-https://ranaai.in}
RANA_VOICE_SECRET=$RANA_VOICE_SECRET
PLAYGROUND_PASSWORD=$PLAYGROUND_PASSWORD
PLAYGROUND_EMPLOYEES='${PLAYGROUND_EMPLOYEES:-[]}'
STT_ENGINE=faster-whisper
STT_ENGINE_MODEL=ukta-app/whisper-telugu-ct2
STT_DEVICE=cuda
TTS_ENGINE=indic-parler
LLM_MODEL=$LLM_MODEL
STT_URL=http://127.0.0.1:8001/v1
TTS_URL=http://127.0.0.1:8002/v1
LLM_URL=http://127.0.0.1:8000/v1
EOF

unit() { # name, port-description, command
  cat > "/etc/systemd/system/$1.service" <<EOF
[Unit]
Description=RANA $2
After=network-online.target
[Service]
EnvironmentFile=/etc/rana-voice.env
WorkingDirectory=$APP
ExecStart=$3
Restart=on-failure
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF
}
unit rana-llm "brain ($LLM_MODEL)" "$APP/.venv-llm/bin/python -m sglang.launch_server --model-path $LLM_MODEL --host 127.0.0.1 --port 8000 $LLM_FLAGS"
unit rana-stt "speech-to-text" "$APP/.venv-voice/bin/uvicorn servers.stt_server:app --host 127.0.0.1 --port 8001"
unit rana-tts "voice" "$APP/.venv-voice/bin/uvicorn servers.tts_server:app --host 127.0.0.1 --port 8002"
unit rana-playground "test console" "$APP/.venv-voice/bin/uvicorn servers.playground:app --host 127.0.0.1 --port 8080"
systemctl daemon-reload
systemctl enable --now rana-llm rana-stt rana-tts rana-playground

echo "== Waiting for the brain to load (can take several minutes)"
for i in $(seq 1 120); do curl -sf http://127.0.0.1:8000/v1/models >/dev/null && break; sleep 10; done
curl -sf http://127.0.0.1:8000/v1/models >/dev/null && echo "brain: up" || echo "brain: NOT up - see: journalctl -u rana-llm -n 100"
curl -sf http://127.0.0.1:8001/health && echo
curl -sf http://127.0.0.1:8002/health && echo

# Optional: a secure https link to the test console, so no SSH tunnel is needed (the browser only allows the
# microphone on https). Caddy gets a free certificate for <ip>.sslip.io; the console's own password still applies.
if [ "${PUBLIC_HTTPS:-0}" = "1" ]; then
  echo "== Secure link for the test console"
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https gnupg >/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
  HOST="$(curl -s https://api.ipify.org | tr . -).sslip.io"
  printf '%s {\n  reverse_proxy 127.0.0.1:8080\n}\n' "$HOST" > /etc/caddy/Caddyfile
  systemctl restart caddy
  echo "Test console: https://$HOST   (user: rana, password: PLAYGROUND_PASSWORD)"
  echo "Only ports 80 and 443 need to be open; the model servers stay private on 127.0.0.1."
fi

cat <<'EOF'

Done. If PUBLIC_HTTPS=1, open the https link printed above. Otherwise, from your own computer:
  ssh -L 8080:127.0.0.1:8080 root@<server-ip>
  then open http://localhost:8080  (user: rana, password: PLAYGROUND_PASSWORD)

Automatic scenario test (on the server):
  cd /opt/rana-voice && set -a && . /etc/rana-voice.env && set +a
  PLAYGROUND_URL=http://127.0.0.1:8080 .venv-voice/bin/python scripts/run_scenarios.py <script_id> --voice

Switch off the GPU server when not testing: it is billed by the hour.
EOF
