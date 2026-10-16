# RANA AI — open-source one-prompt film studio

One brief in → finished 9:16 RANA AI ad out, using only open-source software and a free cloud GPU.

```
ONE BRIEF ──► Deepy Prime (WanGP film agent, local Qwen3.8-VL 9B)
               ├─ script, shot list, timings
               ├─ character sheets → same faces in every shot
               ├─ shots: Wan 2.2 / LTX-2 image-to-video (open models)
               ├─ voice: OmniVoice (Telugu · Hindi · English, 600+ languages)
               ├─ music + sound effects
               └─ checks (black frames, silent gaps, typos) → joins film + .srt
           ──► finish.py (ffmpeg + libass): 1080×1920, Telugu subtitles,
               RANA AI mark, branded end card, ducked music, −14 LUFS ──► RANA_final.mp4
```

Runs in **Kaggle Notebooks** (free NVIDIA T4 GPU) — nothing installed on your computer.

**Recommended: background mode** — `rana_film_background.ipynb`. Edit the brief in cell 1 → *Save Version → Save & Run All (Commit)*. No browser or login needed and Kaggle's 40-min idle timeout can't stop it (runs up to ~10.5 h). Download `RANA_final.mp4` from the version's **Output** tab. `run_film.py` does the work: installs WanGP, sets Deepy Prime + Qwen3.8 VL 9B (GGUF Q4) + the T4-safe PyTorch decoder, sends the brief to the local Deepy server, waits, then runs `finish.py`.

Interactive mode — `rana_film_kaggle.ipynb` → *Run All* → run `tunnel.py` for the link → paste the brief at `/deepy/`. Needs a click in the notebook every ~30 min or Kaggle stops the session.

## Why WanGP (verified 16 Oct 2026)

| Repo | Role | Licence | Notes |
|---|---|---|---|
| [deepbeepmeep/Wan2GP](https://github.com/deepbeepmeep/Wan2GP) @ `5b5ce9f` | Studio + **Deepy Prime** film agent ("give it a one-minute brief… it plans the shots, keeps the cast consistent… puts music or narration under the whole film") | WanGP Community License 2.0 — free inside a company; you may sell outputs (credit WanGP when you sell an output directly); you may not resell WanGP itself | Low VRAM (models from ~6 GB), headless + CLI + web + MCP server modes; supports RTX 20xx (= Kaggle T4) |
| [Wan-Video/Wan2.2](https://github.com/Wan-Video/Wan2.2) | Video model (TI2V-5B, I2V/T2V-A14B, S2V lip-sync) | Apache-2.0 (weights apache-2.0) | Realistic people, 720p |
| [Lightricks/LTX-2](https://github.com/Lightricks/LTX-2) | Video + synced audio | LTX Community License — free under US$10 M annual revenue | Alternative model in WanGP |
| [k2-fsa/OmniVoice](https://github.com/k2-fsa/OmniVoice) | Speech | Apache-2.0 | Telugu (`te`) and Hindi (`hi`) in its language list |
| [MeiGen-AI/InfiniteTalk](https://github.com/MeiGen-AI/InfiniteTalk) | Talking-head lip sync | Apache-2.0 | Integrated in WanGP |
| FFmpeg + libass | Final edit/export (`finish.py`) | LGPL/GPL | Telugu shaping via HarfBuzz; tested |

Checked and **not chosen**: HKUDS/ViMax (MIT, good agent, but only works through paid video APIs), harry0703/MoneyPrinterTurbo (MIT, uses stock footage), showlab/MovieAgent (no licence file), Remotion (company licence needed above 3 employees), audiocraft MusicGen weights (non-commercial), fish-speech (restricted licence).

## Honest limits

- **GPU is required.** This repo's container has no GPU; generation runs on Kaggle (≈30 GPU h/week free, 12 h max per session, phone-verified account, internet on). Untested on Kaggle by us yet — first run may need small fixes.
- **Speed/quality on T4:** expect several minutes per 5-second shot; a 35 s ad ≈ 2–4 h. Quality is good but below paid top models (Veo/Kling); faces can drift on long shots — keep shots 3–5 s.
- **T4 lessons (16 Oct 2026):** the 27B Deepy model is too slow on a T4 (0 tokens after 13 min); Gradio `--share` links don't appear on Kaggle (use `tunnel.py`); the Triton/vllm decoder crashes on T4 (`.bf16 requires sm_80`) — use the PyTorch decoder. Qwen3.8 9B is hidden in the WanGP menu at this commit ("until it works reliably"); `run_film.py` enables it via `wgp_config.json`. The 9B path is not yet proven end-to-end.
- **Real product footage** (call recording, dashboard screenshots) must come from you — the ad must not fake product screens or calls.
- **Music:** use what Deepy generates or a track you own the rights to; do not use copyrighted songs.
- **Claims:** "100 call attempts in ~5 min" is only true on the Scale plan (20 concurrent calls) and means attempts, not conversations.

## Files

- `rana_film_kaggle.ipynb` — the one-click cloud runner.
- `BRIEF_TEMPLATE.md` — the master prompt for every future ad.
- `finish.py` — RANA branding/subtitle/end-card/export pass (`python finish.py --video raw.mp4 --srt lines.srt --out final.mp4`).
- `brand.example.json` — change tagline, CTA, colours.
