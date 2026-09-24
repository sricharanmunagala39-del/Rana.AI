// Turns several recordings of one person into a single clean clip for voice cloning. Runs in the
// browser (after the browser decodes each file) so no raw recordings are uploaded: silences and
// pauses are cut, a fair share of speech is taken from every recording, and the result is
// levelled and encoded as a small 16-bit mono WAV of up to 60 seconds.

export const TARGET_RATE = 24000;
export const MAX_SECONDS = 60;
export const MIN_SECONDS = 8;

export type Channel = "mix" | "left" | "right";
export type DecodedLike = { numberOfChannels: number; sampleRate: number; length: number; getChannelData(i: number): Float32Array };
export type Source = { name: string; samples: Float32Array; rate: number };
export type Quality = {
  speechSeconds: number; usedSeconds: number; files: number; filesUsed: number;
  noiseFloorDb: number; speechLevelDb: number; clippedPct: number;
  grade: "great" | "good" | "weak"; notes: string[];
};

export function toMono(buf: DecodedLike, channel: Channel = "mix"): Float32Array {
  if (buf.numberOfChannels < 2 || channel === "left") return new Float32Array(buf.getChannelData(0));
  if (channel === "right") return new Float32Array(buf.getChannelData(1));
  const a = buf.getChannelData(0), b = buf.getChannelData(1);
  const out = new Float32Array(buf.length);
  for (let i = 0; i < out.length; i++) out[i] = (a[i] + b[i]) / 2;
  return out;
}

/** Linear-interpolation resample; plenty for speech going to a cloning model. */
export function resample(x: Float32Array, from: number, to: number = TARGET_RATE): Float32Array {
  if (from === to) return x;
  const ratio = from / to;
  const n = Math.floor(x.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * ratio, j = Math.floor(p), f = p - j;
    out[i] = x[j] * (1 - f) + (x[j + 1] ?? x[j]) * f;
  }
  return out;
}

const db = (v: number) => 20 * Math.log10(Math.max(v, 1e-9));

function frameRms(x: Float32Array, frame: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + frame <= x.length; i += frame) {
    let s = 0;
    for (let k = i; k < i + frame; k++) s += x[k] * x[k];
    out.push(Math.sqrt(s / frame));
  }
  return out;
}

function percentile(v: number[], p: number): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
}

/** Speech regions as [start, end) sample ranges: frames well above the recording's own noise floor. */
export function speechSegments(x: Float32Array, rate: number): { segments: [number, number][]; noiseDb: number; speechDb: number } {
  const frame = Math.round(rate * 0.02);
  const rms = frameRms(x, frame);
  if (!rms.length) return { segments: [], noiseDb: -90, speechDb: -90 };
  const noise = percentile(rms, 0.1);
  const loud = percentile(rms, 0.95);
  const threshDb = Math.max(db(noise) + 10, db(loud) - 30, -55);
  const voiced = rms.map((r) => db(r) >= threshDb);
  const gapFrames = Math.round(0.3 / 0.02), minFrames = Math.round(0.25 / 0.02), pad = Math.round(0.1 / 0.02);
  const segs: [number, number][] = [];
  let i = 0;
  while (i < voiced.length) {
    if (!voiced[i]) { i++; continue; }
    let j = i, lastVoiced = i;
    while (j < voiced.length && (voiced[j] || j - lastVoiced <= gapFrames)) { if (voiced[j]) lastVoiced = j; j++; }
    if (lastVoiced - i + 1 >= minFrames) segs.push([Math.max(0, i - pad) * frame, Math.min(voiced.length, lastVoiced + 1 + pad) * frame]);
    i = j;
  }
  const speechFrames = rms.filter((_, k) => voiced[k]);
  return { segments: segs, noiseDb: db(noise), speechDb: db(Math.sqrt(speechFrames.reduce((a, r) => a + r * r, 0) / Math.max(1, speechFrames.length))) };
}

/**
 * Joins speech from every source, giving each recording a fair share of the time budget (a
 * recording with little speech hands its unused share to the others), with short natural pauses.
 */
export function buildClip(sources: Source[], maxSeconds = MAX_SECONDS): { samples: Float32Array; rate: number; quality: Quality } {
  const rate = TARGET_RATE;
  const prepared = sources.map((s) => {
    const x = resample(s.samples, s.rate, rate);
    const { segments, noiseDb, speechDb } = speechSegments(x, rate);
    let clipped = 0;
    for (let k = 0; k < x.length; k++) if (Math.abs(x[k]) >= 0.99) clipped++;
    const speech = segments.reduce((a, [s0, e]) => a + (e - s0), 0);
    return { x, segments, noiseDb, speechDb, speech, clipped };
  });
  const budget = Math.round(maxSeconds * rate);
  const totalSpeech = prepared.reduce((a, p) => a + p.speech, 0);

  // Fair-share allocation with redistribution.
  const alloc = prepared.map(() => 0);
  let remaining = Math.min(budget, totalSpeech);
  let open = prepared.map((p, i) => i).filter((i) => prepared[i].speech > 0);
  while (remaining > 0 && open.length) {
    const share = Math.floor(remaining / open.length) || remaining;
    const next: number[] = [];
    for (const i of open) {
      const room = prepared[i].speech - alloc[i];
      const take = Math.min(room, share, remaining);
      alloc[i] += take; remaining -= take;
      if (prepared[i].speech - alloc[i] > 0) next.push(i);
      if (remaining <= 0) break;
    }
    if (next.length === open.length && share === 0) break;
    open = next;
  }

  const pause = new Float32Array(Math.round(rate * 0.2));
  const fade = Math.round(rate * 0.01);
  const parts: Float32Array[] = [];
  prepared.forEach((p, i) => {
    let left = alloc[i];
    for (const [s0, e] of p.segments) {
      if (left <= 0) break;
      const end = Math.min(e, s0 + left);
      const seg = p.x.slice(s0, end);
      for (let k = 0; k < Math.min(fade, seg.length); k++) { const g = k / fade; seg[k] *= g; seg[seg.length - 1 - k] *= g; }
      parts.push(seg, pause);
      left -= end - s0;
    }
  });
  const len = parts.reduce((a, p) => a + p.length, 0);
  const out = new Float32Array(len);
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }

  // Level to a consistent peak so quiet phone recordings and loud ones sound alike.
  let peak = 0; for (let k = 0; k < out.length; k++) peak = Math.max(peak, Math.abs(out[k]));
  if (peak > 0) { const g = Math.min(0.9 / peak, 8); for (let k = 0; k < out.length; k++) out[k] *= g; }

  const totalSamples = prepared.reduce((a, p) => a + p.x.length, 0) || 1;
  const noiseFloorDb = percentile(prepared.filter((p) => p.speech > 0).map((p) => p.noiseDb), 0.5);
  const speechLevelDb = percentile(prepared.filter((p) => p.speech > 0).map((p) => p.speechDb), 0.5);
  const clippedPct = (prepared.reduce((a, p) => a + p.clipped, 0) / totalSamples) * 100;
  const usedSeconds = alloc.reduce((a, b) => a + b, 0) / rate;
  const snr = speechLevelDb - noiseFloorDb;
  const notes: string[] = [];
  if (usedSeconds < MIN_SECONDS) notes.push(`Only ${usedSeconds.toFixed(0)}s of clear speech found — add more recordings (30–60s sounds best).`);
  else if (usedSeconds < 30) notes.push(`${usedSeconds.toFixed(0)}s of speech. It will work; 30–60s captures the accent and tone better.`);
  if (snr < 15) notes.push("Lots of background noise. Record in a quiet room without fans, music or echo.");
  else if (snr < 25) notes.push("Some background noise. A quieter room will make the voice cleaner.");
  if (clippedPct > 0.1) notes.push("Parts of the recording are distorted (too loud). Hold the phone a little further away.");
  if (speechLevelDb < -40) notes.push("The voice is very quiet in the recording.");
  const grade: Quality["grade"] = usedSeconds < MIN_SECONDS || snr < 15 ? "weak" : usedSeconds >= 30 && snr >= 25 && clippedPct <= 0.1 ? "great" : "good";
  return {
    samples: out, rate,
    quality: {
      speechSeconds: totalSpeech / rate, usedSeconds, files: sources.length, filesUsed: alloc.filter((a) => a > 0).length,
      noiseFloorDb: Math.round(noiseFloorDb), speechLevelDb: Math.round(speechLevelDb), clippedPct: Math.round(clippedPct * 100) / 100, grade, notes,
    },
  };
}

export function encodeWav(x: Float32Array, rate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + x.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + x.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) { const s = Math.max(-1, Math.min(1, x[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return buf;
}
