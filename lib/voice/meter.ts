"use client";
/**
 * Loudness meters for browser voice calls: how loud the AI employee is right now (playback) and how loud
 * the person is (microphone), each 0…1. The HUD orb reads these every frame to pulse with the real voices.
 */
export class LevelMeter {
  private node: AnalyserNode | null = null;
  private buf: Uint8Array | null = null;
  private smooth = 0;

  /** Insert an analyser in front of `dest` (playback) — connect sources to the returned node instead of `dest`. */
  tap(ctx: AudioContext, dest?: AudioNode): AudioNode {
    const a = ctx.createAnalyser();
    a.fftSize = 512; a.smoothingTimeConstant = 0.3;
    if (dest) a.connect(dest);
    this.node = a; this.buf = new Uint8Array(a.fftSize);
    return a;
  }

  /** Listen to a source without changing what it is connected to (microphone). */
  listen(ctx: AudioContext, src: AudioNode) {
    const a = ctx.createAnalyser();
    a.fftSize = 512; a.smoothingTimeConstant = 0.3;
    src.connect(a);
    this.node = a; this.buf = new Uint8Array(a.fftSize);
  }

  /** Current level 0…1 (RMS, lightly smoothed, speech-scaled). */
  level(): number {
    if (!this.node || !this.buf) return 0;
    try { this.node.getByteTimeDomainData(this.buf as any); } catch { return 0; }
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) { const v = (this.buf[i] - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / this.buf.length);
    const v = Math.min(1, rms * 4.5);
    this.smooth = v > this.smooth ? v : this.smooth * 0.85 + v * 0.15;
    return this.smooth;
  }

  reset() { this.node = null; this.buf = null; this.smooth = 0; }
}

export type VoiceLevels = { agent: number; user: number };
