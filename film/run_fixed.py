#!/usr/bin/env python3
"""RANA AI — FIXED recipe film run for Kaggle (no AI agent deciding models).

Same small open models every time, so it is predictable on a free T4:
  character  : Z-Image Turbo (one reference portrait of the cast)
  keyframes  : Flux 3 Klein, using the reference portrait -> same face every shot
  shots      : Wan2.2 TI2V 5B FastWan (3 steps), image-to-video, 480x832, 5 s each
  voice-over : OmniVoice (Telugu / Hindi / English), one line per shot
  music      : ACE-Step 1.5 Turbo (instrumental)
  edit       : ffmpeg joins shots + VO, then finish.py adds subtitles, RANA mark,
               end card, ducked music, -14 LUFS, 1080x1920.
Reads /kaggle/working/film.json (written by the notebook) and writes
/kaggle/working/RANA_final.mp4 (+ .srt, every clip and keyframe for review).
"""
import glob, json, os, shutil, subprocess, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from run_film import WORK, WANGP, RAW, say, sh, install, duration   # reuse installer + helpers

OUT = f'{WORK}/fixed'
SHOT_SECONDS = 5
FPS = 24


def gen(session, settings, label):
    t0 = time.time()
    say(f'[{label}] generating with {settings["model_type"]} ...')
    job = session.submit_task(settings)
    res = job.result()
    if not res.success:
        msgs = '; '.join(getattr(e, 'message', str(e)) for e in (res.errors or []))
        raise RuntimeError(f'{label} failed: {msgs}')
    files = [f for f in res.generated_files if os.path.exists(f)]
    if not files:
        raise RuntimeError(f'{label}: no file produced')
    say(f'[{label}] done in {(time.time() - t0) / 60:.1f} min -> {files[-1]}')
    return files[-1]


def keep(path, name):
    dst = os.path.join(OUT, name + os.path.splitext(path)[1])
    shutil.copy(path, dst)
    return dst


def srt_time(t):
    h, m = int(t // 3600), int(t % 3600 // 60)
    s = t - h * 3600 - m * 60
    return f'{h:02d}:{m:02d}:{s:06.3f}'.replace('.', ',')


def main():
    spec = json.load(open(f'{WORK}/film.json', encoding='utf-8'))
    shots = spec['shots']
    cast = spec['cast']
    look = spec.get('look', 'photorealistic, natural light, shallow depth of field, 35mm, cinematic, no text')
    voice = spec.get('voice', 'male, indian accent')
    os.makedirs(OUT, exist_ok=True)

    install()
    attn = 'sage' if subprocess.run([sys.executable, '-c', 'import sageattention'], capture_output=True).returncode == 0 else 'sdpa'
    os.chdir(WANGP)
    sys.path.insert(0, WANGP)
    from shared.api import init
    session = init(root=WANGP, output_dir=f'{OUT}/raw', cli_args=['--attention', attn, '--profile', '5'])
    t_start = time.time()

    # 1) reference portrait of the cast
    ref = keep(gen(session, {'model_type': 'z_image', 'image_mode': 1, 'resolution': '720x1280', 'num_inference_steps': 8,
                             'prompt': f'Portrait photo, front view, plain office background. {cast}. {look}', 'seed': 42},
                   'cast'), 'cast_reference')

    # 2) per shot: keyframe (same face) -> 5 s video -> voice line
    clips, vos = [], []
    for i, s in enumerate(shots, 1):
        try:
            kf = keep(gen(session, {'model_type': 'flux3_klein', 'image_mode': 1, 'resolution': '720x1280',
                                    'num_inference_steps': 12, 'guidance_scale': 1, 'video_prompt_type': 'I',
                                    'image_refs': [ref], 'remove_background_images_ref': 0,
                                    'prompt': f'{s["visual"]}. The man is the person in the reference image: {cast}. {look}'},
                          f'shot {i} keyframe'), f'shot{i}_keyframe')
            clip = keep(gen(session, {'model_type': 'ti2v_2_2_fastwan', 'image_prompt_type': 'S', 'image_start': [kf],
                                      'resolution': '480x832', 'video_length': SHOT_SECONDS * FPS + 1,
                                      'num_inference_steps': 3, 'guidance_scale': 1, 'flow_shift': 3,
                                      'prompt': f'{s["visual"]}. {s.get("motion", "slow cinematic camera move")}. {look}'},
                            f'shot {i} video'), f'shot{i}')
            clips.append(clip)
        except Exception as e:
            say(f'shot {i} skipped: {e}')
            continue
        if s.get('vo'):
            try:
                vos.append((len(clips) - 1, s['vo'], keep(gen(session, {'model_type': 'omnivoice', 'prompt': s['vo'],
                    'alt_prompt': voice, 'model_mode': 'auto', 'num_inference_steps': 32, 'guidance_scale': 2.0},
                    f'shot {i} voice'), f'shot{i}_vo')))
            except Exception as e:
                say(f'shot {i} voice skipped: {e}')
        say(f'progress: {len(clips)}/{len(shots)} shots, {(time.time() - t_start) / 3600:.1f} h elapsed')

    if not clips:
        sys.exit('No shots were produced - see run.log')

    # 3) music bed
    total = len(clips) * SHOT_SECONDS
    music = None
    try:
        music = keep(gen(session, {'model_type': 'ace_step_v1_5_turbo_lm_1_7b', 'prompt': '[Instrumental]',
                                   'alt_prompt': spec.get('music', 'soft modern corporate background music, warm piano, light beat, instrumental, no vocals'),
                                   'duration_seconds': total + 5, 'num_inference_steps': 8, 'model_mode': 2,
                                   'audio_scale': 0.5, 'shift': 1.0, 'guidance_scale': 1.0, 'scheduler_type': 'euler'},
                         'music'), 'music')
    except Exception as e:
        say(f'music skipped: {e}')

    # 4) join shots (video only), place each VO line at its shot start, write the .srt
    lst = f'{OUT}/clips.txt'
    open(lst, 'w').write(''.join(f"file '{c}'\n" for c in clips))
    sh(f'ffmpeg -y -loglevel error -f concat -safe 0 -i {lst} -an -vf "fps={FPS},scale=480:832,setsar=1" '
       f'-c:v libx264 -crf 18 -pix_fmt yuv420p {OUT}/joined.mp4')
    srt = []
    if vos:
        inputs, parts = [], []
        for n, (idx, text, wav) in enumerate(vos):
            start = idx * SHOT_SECONDS + 0.3
            end = min(start + max(duration(wav), 1.5), (idx + 1) * SHOT_SECONDS)
            inputs += ['-i', wav]
            parts.append(f'[{n + 1}:a]aresample=48000,adelay=delays={int(start * 1000)}:all=1[v{n}]')
            srt.append(f'{len(srt) + 1}\n{srt_time(start)} --> {srt_time(end)}\n{text}\n')
        mix = ''.join(f'[v{n}]' for n in range(len(vos)))
        fc = ';'.join(parts) + f';{mix}amix=inputs={len(vos)}:normalize=0,apad=whole_dur={total}[a]'
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', f'{OUT}/joined.mp4', *inputs, '-filter_complex', fc,
                        '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-t', str(total), f'{OUT}/film_raw.mp4'], check=True)
    else:
        shutil.copy(f'{OUT}/joined.mp4', f'{OUT}/film_raw.mp4')
    open(f'{WORK}/RANA_final.srt', 'w', encoding='utf-8').write('\n'.join(srt))

    # 5) RANA finishing pass
    cmd = [sys.executable, f'{WORK}/rana/finish.py', '--video', f'{OUT}/film_raw.mp4', '--out', f'{WORK}/RANA_final.mp4']
    if srt:
        cmd += ['--srt', f'{WORK}/RANA_final.srt']
    if music:
        cmd += ['--music', music]
    if spec.get('brand'):
        json.dump(spec['brand'], open(f'{OUT}/brand.json', 'w', encoding='utf-8'), ensure_ascii=False)
        cmd += ['--brand', f'{OUT}/brand.json']
    r = subprocess.run(cmd, capture_output=True, text=True)
    print(r.stdout[-1500:], r.stderr[-1500:], flush=True)
    shutil.rmtree(f'{OUT}/raw', ignore_errors=True)   # keep the Output tab small
    say(f'DONE in {(time.time() - t_start) / 3600:.1f} h -> Output tab: RANA_final.mp4 ({len(clips)}/{len(shots)} shots)')


if __name__ == '__main__':
    main()
