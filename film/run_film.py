#!/usr/bin/env python3
"""RANA AI — background film run for Kaggle "Save Version -> Save & Run All".

No browser, no login, no idle timeout: installs WanGP, configures Deepy Prime
(Qwen3.8 VL 9B GGUF Q4, T4-safe PyTorch decoder), sends ONE brief to the local
Deepy server, waits until the film is done (max ~10.5 h), then brands it with
finish.py.  Results land in /kaggle/working (Kaggle "Output" tab):
  RANA_final.mp4, RANA_final.srt (if Deepy made one), deepy_chat.json, run.log
The brief is read from /kaggle/working/brief.txt (written by the notebook cell).
"""
import glob, json, os, re, shutil, subprocess, sys, time, urllib.request, uuid

WORK = '/kaggle/working'
WANGP = '/tmp/Wan2GP'
WANGP_COMMIT = os.environ.get('WANGP_COMMIT', '5b5ce9f')   # verified 16 Oct 2026
RAW = 'https://raw.githubusercontent.com/sricharanmunagala39-del/Rana.AI/work-film/film'
OUT = f'{WORK}/outputs'
PORT = 7860
MAX_HOURS = float(os.environ.get('RANA_MAX_HOURS', '10.5'))   # Kaggle GPU sessions stop at 12 h
LOG = f'{WORK}/wangp.log'


def say(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


def sh(cmd, check=True):
    say('$', cmd)
    r = subprocess.run(cmd, shell=True)
    if check and r.returncode:
        sys.exit(f'FAILED ({r.returncode}): {cmd}')
    return r.returncode


def api(path, body=None, timeout=30):
    req = urllib.request.Request(f'http://127.0.0.1:{PORT}{path}',
                                 data=None if body is None else json.dumps(body).encode(),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read() or b'null')


def install():
    smi = subprocess.run(['nvidia-smi'], capture_output=True, text=True).stdout
    m = re.search(r'Driver Version: (\d+\.\d+)', smi)
    if not m:
        sys.exit('No GPU. In Kaggle: Settings > Accelerator > GPU T4 x2, then Save Version again.')
    drv = float(m.group(1))
    say('GPU driver', drv)
    torch = ('torch==2.10.0 torchvision==0.25.0 torchaudio==2.10.0 --index-url https://download.pytorch.org/whl/cu130' if drv >= 580 else
             'torch==2.7.1 torchvision==0.22.1 torchaudio==2.7.1 --index-url https://download.pytorch.org/whl/cu128' if drv >= 570 else
             'torch==2.7.1 torchvision==0.22.1 torchaudio==2.7.1 --index-url https://download.pytorch.org/whl/cu126')
    if not os.path.isdir(WANGP):
        sh(f'git clone -q https://github.com/deepbeepmeep/Wan2GP.git {WANGP} && cd {WANGP} && git checkout -q {WANGP_COMMIT}')
    sh(f'pip -q install {torch}')
    sh(f'cd {WANGP} && pip -q install -r requirements.txt')
    sh('pip -q install "triton==3.2.0" "sageattention==1.0.6"', check=False)
    sh('apt-get -qq install -y fonts-noto-core fonts-noto-ui-core >/dev/null 2>&1', check=False)
    os.makedirs(f'{WORK}/rana', exist_ok=True)
    sh(f'wget -q -O {WORK}/rana/finish.py {RAW}/finish.py')


def start_server():
    attn = 'sage' if subprocess.run([sys.executable, '-c', 'import sageattention'], capture_output=True).returncode == 0 else 'sdpa'
    os.makedirs(OUT, exist_ok=True)
    log = open(LOG, 'a')
    proc = subprocess.Popen([sys.executable, 'wgp.py', '--deepy-server', '--server-port', str(PORT), '--profile', '4',
                             '--attention', attn, '--output-dir', OUT], cwd=WANGP, stdout=log, stderr=subprocess.STDOUT)
    for _ in range(180):                       # up to 15 min for first start
        time.sleep(5)
        if proc.poll() is not None:
            sys.exit('Studio stopped while starting. Last log lines:\n' + open(LOG).read()[-3000:])
        try:
            api('/deepy_api/state', timeout=10)
            say('Deepy server is up')
            return proc
        except Exception:
            pass
    sys.exit('Studio did not start in 15 min. Last log lines:\n' + open(LOG).read()[-3000:])


def configure():
    cfg_path = f'{WANGP}/wgp_config.json'
    if not os.path.exists(cfg_path):          # first boot writes WanGP's full default config
        say('First boot to create the default config...')
        proc = start_server()
        proc.terminate(); proc.wait(60)
    c = json.load(open(cfg_path))
    llm = c.get('llm_engines') if isinstance(c.get('llm_engines'), dict) else {}
    llm['deepy'] = 'qwen38_9b'                # Qwen3.8 VL Uncensored 9B (needed for Deepy Prime, fits a T4)
    c.update({
        'llm_engines': llm,
        'enhancer_enabled': 6,
        'prompt_enhancer_quantization': 'gguf',   # GGUF Q4 (~5.8 GB)
        'deepy_enabled': 1,
        'deepy_type': 'prime',
        'deepy_compaction_type': 'summarize',
        'deepy_context_tokens': max(int(c.get('deepy_context_tokens') or 0), 32000),
        'lm_decoder_engine': 'legacy',            # T4 (sm_75) cannot run the bf16 Triton/vllm decoder
        'save_path': OUT, 'image_save_path': OUT, 'audio_save_path': OUT,
    })
    json.dump(c, open(cfg_path, 'w'), indent=2)
    say('Deepy Prime + Qwen3.8 VL 9B (GGUF Q4) + PyTorch decoder configured')


def chat_tail(snap, n=600):
    try:
        return json.dumps(snap.get('chat'), ensure_ascii=False)[-n:]
    except Exception:
        return ''


def run_brief(brief):
    sub = 'rana-' + uuid.uuid4().hex[:8]
    api('/deepy_api/messages', {'text': brief, 'submission_id': sub}, timeout=60)
    say('Brief sent to Deepy Prime. Rendering — this takes hours on a T4.')
    t0, seen_busy, idle_checks, last = time.time(), False, 0, None
    while time.time() - t0 < MAX_HOURS * 3600:
        time.sleep(60)
        try:
            s = api('/deepy_api/state', timeout=60)
        except Exception as e:
            say('state check failed:', e); continue
        busy = bool(s.get('busy'))
        seen_busy |= busy
        vids = [g for g in s.get('gallery', []) if g.get('kind') == 'video']
        tail = chat_tail(s, 300)
        if tail != last or int(time.time() - t0) % 900 < 60:
            say(f'busy={busy} videos={len(vids)} progress={json.dumps(s.get("progress"), ensure_ascii=False)[:200]}')
            say('  chat:', tail.replace('\\n', ' ')[-300:])
            last = tail
        idle_checks = idle_checks + 1 if (seen_busy and not busy and not s.get('progress')) else 0
        if idle_checks >= 3:                     # idle for 3 minutes after working = Deepy finished its turn
            json.dump(s.get('chat'), open(f'{WORK}/deepy_chat.json', 'w'), ensure_ascii=False, indent=1)
            say('Deepy finished.')
            return True
    say(f'Stopped waiting after {MAX_HOURS} h (Kaggle limit is 12 h).')
    return False


def duration(p):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p],
                         capture_output=True, text=True).stdout.strip()
    try:
        return float(out)
    except ValueError:
        return 0.0


def finish():
    vids = [v for v in glob.glob(f'{OUT}/**/*.mp4', recursive=True) + glob.glob(f'{WANGP}/outputs/**/*.mp4', recursive=True)]
    if not vids:
        say('No video was produced. See deepy_chat.json and wangp.log in the Output tab.'); return
    longest = max(vids, key=lambda v: (duration(v), os.path.getmtime(v)))
    say('Film from Deepy:', longest, f'{duration(longest):.1f}s', f'({len(vids)} clips in total)')
    cmd = [sys.executable, f'{WORK}/rana/finish.py', '--video', longest, '--out', f'{WORK}/RANA_final.mp4']
    srts = sorted(glob.glob(f'{OUT}/**/*.srt', recursive=True), key=os.path.getmtime)
    if srts:
        cmd += ['--srt', srts[-1]]; shutil.copy(srts[-1], f'{WORK}/RANA_final.srt')
    r = subprocess.run(cmd, capture_output=True, text=True)
    print(r.stdout[-1500:], r.stderr[-1500:])
    if os.path.exists(f'{WORK}/RANA_final.mp4'):
        say('DONE -> Output tab: RANA_final.mp4')


def main():
    brief_path = f'{WORK}/brief.txt'
    if not os.path.exists(brief_path):
        sh(f'wget -q -O {brief_path} {RAW}/brief.txt')
    brief = ' '.join(open(brief_path, encoding='utf-8').read().split())   # one message, no blank lines
    install()
    configure()
    proc = start_server()
    try:
        run_brief(brief)
    finally:
        finish()
        proc.terminate()
        try: proc.wait(60)
        except Exception: proc.kill()


if __name__ == '__main__':
    main()
