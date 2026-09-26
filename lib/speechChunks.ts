// Split a long recording into pieces short enough for speech-to-text (Sarvam's REST limit is 30 s),
// cutting in the quietest moment near each boundary so words aren't chopped in half.
import { encodeWav, resample, toMono, type DecodedLike } from "./audioPrep";

export const STT_RATE = 16000;
export const MAX_CHUNK_S = 25;
export const MAX_TOTAL_S = 15 * 60;

export function cutPoints(x: Float32Array, rate: number, maxS = MAX_CHUNK_S): [number, number][] {
  const out: [number, number][] = [];
  const max = Math.floor(maxS * rate);
  const win = Math.floor(0.08 * rate);
  let start = 0;
  while (start < x.length) {
    if (x.length - start <= max) { out.push([start, x.length]); break; }
    // Look back up to 8 s from the hard limit for the quietest 80 ms window.
    const hard = start + max;
    const from = Math.max(start + Math.floor(max * 0.6), hard - Math.floor(8 * rate));
    let best = hard, bestE = Infinity;
    for (let i = from; i + win <= hard; i += Math.floor(win / 2)) {
      let e = 0; for (let k = i; k < i + win; k++) e += x[k] * x[k];
      if (e < bestE) { bestE = e; best = i + Math.floor(win / 2); }
    }
    out.push([start, best]);
    start = best;
  }
  return out.filter(([a, b]) => b - a > rate * 0.4);
}

/** Decoded audio → list of 16 kHz mono WAV chunks. */
export function wavChunks(buf: DecodedLike): ArrayBuffer[] {
  const mono = resample(toMono(buf), buf.sampleRate, STT_RATE);
  const capped = mono.length > MAX_TOTAL_S * STT_RATE ? mono.subarray(0, MAX_TOTAL_S * STT_RATE) : mono;
  return cutPoints(capped, STT_RATE).map(([a, b]) => encodeWav(capped.subarray(a, b), STT_RATE));
}
