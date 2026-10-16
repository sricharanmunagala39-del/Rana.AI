#!/usr/bin/env python3
"""RANA AI finishing pass — turns WanGP/Deepy's raw film into a Reels-ready RANA AI ad.

  python finish.py --video raw.mp4 --out final.mp4 \
      [--srt dialogue.srt] [--music music.wav] [--brand brand.json]

What it does (all with ffmpeg + libass, fully automatic):
  1. Crops/scales to 1080x1920 (9:16), 30 fps, light colour polish.
  2. Burns in subtitles (Telugu/Hindi/English) with a readable RANA style.
  3. Adds a small "RANA AI" brand mark in the corner.
  4. Appends a branded end card (tagline + call to action + website).
  5. Mixes optional music under the dialogue (music ducks when people speak),
     normalises loudness to -14 LUFS (Instagram/Reels target), exports H.264/AAC MP4.
"""
import argparse, json, os, shutil, subprocess, sys, tempfile

W, H, FPS = 1080, 1920, 30
BRAND = {
    "name": "RANA", "accent": "AI",
    "tagline": "More Calls. Smarter Follow-ups. Better Visibility.",
    "cta": "మీ business కోసం Rana AI ఎలా పనిచేస్తుందో చూడాలనుకుంటున్నారా?\\NDM చేయండి — RANA",
    "site": "ranaai.in",
    "end_seconds": 3.5,
    # ranaai.in colours (BGR order for ASS): navy #090C13, teal #2DE1C2, violet #9284FF
    "navy": "090C13", "teal": "2DE1C2", "violet": "9284FF",
    "font": "Noto Sans Telugu",  # has Latin + Telugu; add Noto Sans Devanagari for Hindi
    "disclaimer": "",
}

def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode:
        sys.exit(f"ffmpeg failed:\n{' '.join(cmd)}\n{p.stderr[-2000:]}")
    return p

def probe(path, key):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", key, "-of", "default=nw=1:nk=1", path], capture_output=True, text=True).stdout.split()
    return out[0] if out else ""

def has_audio(path):
    return bool(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", path], capture_output=True, text=True).stdout.strip())

def ass_color(hex6, alpha="00"):
    r, g, b = hex6[0:2], hex6[2:4], hex6[4:6]
    return f"&H{alpha}{b}{g}{r}".upper()

def ts(t):
    h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"

def srt_to_events(srt):
    ev, block = [], []
    for line in open(srt, encoding="utf-8").read().replace("\r", "").split("\n") + [""]:
        if line.strip():
            block.append(line); continue
        if len(block) >= 3 and "-->" in block[1]:
            a, b = [x.strip().replace(",", ".") for x in block[1].split("-->")]
            def sec(x):
                hh, mm, ss = x.split(":"); return int(hh) * 3600 + int(mm) * 60 + float(ss)
            ev.append((sec(a), sec(b), "\\N".join(block[2:])))
        block = []
    return ev

def build_ass(path, b, main_dur, subs):
    teal, navy, violet, white = ass_color(b["teal"]), ass_color(b["navy"]), ass_color(b["violet"]), "&H00FFFFFF"
    end0, end1 = main_dur, main_dur + b["end_seconds"]
    lines = [
        "[Script Info]", "ScriptType: v4.00+", f"PlayResX: {W}", f"PlayResY: {H}", "WrapStyle: 0", "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Sub,{b['font']},54,{white},{white},&H00000000,&H96000000,1,0,0,0,100,100,0,0,3,4,0,2,80,80,300,1",
        f"Style: Mark,{b['font']},40,{white},{white},&H00000000,&H64000000,1,0,0,0,100,100,1,0,1,2,0,7,56,56,70,1",
        f"Style: EndBig,{b['font']},150,{white},{white},&H00000000,&H00000000,1,0,0,0,100,100,2,0,1,0,0,5,60,60,0,1",
        f"Style: EndMid,{b['font']},50,{white},{white},&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,5,90,90,0,1",
        f"Style: EndSmall,{b['font']},44,{teal},{teal},&H00000000,&H00000000,1,0,0,0,100,100,1,0,1,0,0,5,90,90,0,1",
        "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    # brand mark on the main film
    lines.append(f"Dialogue: 1,{ts(0)},{ts(main_dur)},Mark,,0,0,0,,{{\\alpha&H30&}}{b['name']} {{\\c{teal}}}{b['accent']}")
    for a, e, t in subs:
        if a < main_dur:
            lines.append(f"Dialogue: 0,{ts(a)},{ts(min(e, main_dur))},Sub,,0,0,0,,{t}")
    if b.get("disclaimer"):
        lines.append(f"Dialogue: 0,{ts(0)},{ts(main_dur)},Mark,,0,0,0,,{{\\an1\\fs28\\alpha&H40&\\pos(56,{H-70})}}{b['disclaimer']}")
    # end card text (background is a navy colour source with a teal/violet bar, see render)
    fade = "{\\fad(250,0)}"
    lines += [
        f"Dialogue: 2,{ts(end0)},{ts(end1)},EndBig,,0,0,0,,{fade}{{\\pos({W//2},{int(H*0.36)})}}{b['name']} {{\\c{teal}}}{b['accent']}",
        f"Dialogue: 2,{ts(end0+0.3)},{ts(end1)},EndSmall,,0,0,0,,{{\\fad(300,0)\\pos({W//2},{int(H*0.47)})}}{b['tagline']}",
        f"Dialogue: 2,{ts(end0+0.7)},{ts(end1)},EndMid,,0,0,0,,{{\\fad(300,0)\\pos({W//2},{int(H*0.62)})}}{b['cta']}",
        f"Dialogue: 2,{ts(end0+0.7)},{ts(end1)},EndSmall,,0,0,0,,{{\\fad(300,0)\\pos({W//2},{int(H*0.80)})\\c&H00FFFFFF&\\alpha&H40&}}{b['site']}",
    ]
    open(path, "w", encoding="utf-8").write("\n".join(lines) + "\n")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--srt"); ap.add_argument("--music"); ap.add_argument("--brand")
    ap.add_argument("--music-db", type=float, default=-18.0, help="music level under dialogue")
    a = ap.parse_args()
    b = dict(BRAND)
    if a.brand: b.update(json.load(open(a.brand, encoding="utf-8")))
    if not shutil.which("ffmpeg"): sys.exit("ffmpeg not found")
    dur = float(probe(a.video, "format=duration") or 0)
    if dur <= 0: sys.exit("could not read video duration")
    total = dur + b["end_seconds"]
    tmp = tempfile.mkdtemp(prefix="rana_finish_")
    ass = os.path.join(tmp, "overlay.ass")
    build_ass(ass, b, dur, srt_to_events(a.srt) if a.srt else [])
    navy, teal, violet = "0x" + b["navy"], "0x" + b["teal"], "0x" + b["violet"]
    src_audio = has_audio(a.video)

    inputs = ["-i", a.video,
              "-f", "lavfi", "-t", str(b["end_seconds"]), "-i", f"color=c={navy}:s={W}x{H}:r={FPS}"]
    v = (f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS},setsar=1,"
         f"eq=contrast=1.04:saturation=1.05,format=yuv420p[main];"
         f"[1:v]drawbox=x=0:y={int(H*0.53)}:w={int(W*0.62)}:h=8:color={teal}:t=fill,"
         f"drawbox=x={int(W*0.62)}:y={int(H*0.53)}:w={W-int(W*0.62)}:h=8:color={violet}:t=fill,format=yuv420p[endc];"
         f"[main][endc]concat=n=2:v=1:a=0[cat];[cat]ass='{ass}'[vout]")
    # audio: film audio (or silence) + end-card silence, optional ducked music bed
    n = 2
    aparts = []
    if src_audio:
        aparts.append(f"[0:a]aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur={total}[dia]")
    else:
        inputs += ["-f", "lavfi", "-t", str(total), "-i", "anullsrc=r=48000:cl=stereo"]; aparts.append(f"[{n}:a]anull[dia]"); n += 1
    if a.music:
        inputs += ["-stream_loop", "-1", "-i", a.music]
        mi = n; n += 1
        aparts.append(f"[{mi}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:{total},volume={a.music_db}dB,afade=t=out:st={max(0,total-1.5)}:d=1.5[mus]")
        aparts.append("[dia]asplit=2[dia1][key]")
        aparts.append("[mus][key]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[duck]")
        aparts.append("[dia1][duck]amix=inputs=2:duration=first:normalize=0[mix]")
    else:
        aparts.append("[dia]anull[mix]")
    aparts.append(f"[mix]atrim=0:{total},loudnorm=I=-14:TP=-1.5:LRA=11[aout]")
    fc = v + ";" + ";".join(aparts)
    run(["ffmpeg", "-y", "-hide_banner", *inputs, "-filter_complex", fc, "-map", "[vout]", "-map", "[aout]",
         "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-profile:v", "high", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", "-t", f"{total:.3f}", a.out])
    print(json.dumps({"out": a.out, "width": int(probe(a.out, "stream=width")), "height": int(probe(a.out, "stream=height")),
                      "duration": round(float(probe(a.out, "format=duration")), 2), "audio": has_audio(a.out)}))

if __name__ == "__main__":
    main()
