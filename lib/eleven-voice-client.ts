"use client";
import { hideVendors } from "./voice/brand";
import { LevelMeter, type VoiceLevels } from "./voice/meter";
import type { SarvamCallEvent } from "./sarvam-voice-client";

/**
 * Browser client for an R3 (natural voice) session — same events and methods as SarvamVoiceCall, so screens can use either.
 *   1. RANA's server returns a signed wss:// URL + `init` (conversation_initiation_client_data with prompt/greeting/voice)
 *   2. on open → send init; stream mic as { user_audio_chunk: base64 PCM16 mono 16 kHz }
 *   3. play "audio" events (PCM at the rate in conversation_initiation_metadata), drop queued audio on "interruption"
 *   4. "ping" → { type: "pong", event_id }; transcripts come as user_transcript / agent_response
 */

const IN_RATE = 16000;

function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const n = Math.floor(input.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = i * ratio, j = Math.floor(p), f = p - j; out[i] = input[j] * (1 - f) + (input[j + 1] ?? input[j]) * f; }
  return out;
}
function toPcm16Base64(f: Float32Array): string {
  const pcm = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) { const s = Math.max(-1, Math.min(1, f[i])); pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
  const bytes = new Uint8Array(pcm.buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(bin);
}
function fromPcm16Base64(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const pcm = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 0x8000;
  return out;
}

export class ElevenVoiceCall {
  private ws: WebSocket | null = null;
  private micStream: MediaStream | null = null;
  private micCtx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private playCtx: AudioContext | null = null;
  private playing: AudioBufferSourceNode[] = [];
  private nextPlay = 0;
  private outRate = 16000;
  private muted = false;
  private live = false;
  private ended = false;
  private dropUntil = -1;
  private maxTimer: any = null;
  private onPageHide = () => this.stop();
  private onEvent: (e: SarvamCallEvent) => void;
  private outMeter = new LevelMeter();
  private inMeter = new LevelMeter();
  private outNode: AudioNode | null = null;

  constructor(onEvent: (e: SarvamCallEvent) => void) { this.onEvent = onEvent; }

  levels(): VoiceLevels { return { agent: this.outMeter.level(), user: this.muted ? 0 : this.inMeter.level() }; }

  async startWith(session: any, opts: { limitMessage?: string | null } = {}) {
    const max = Number(session.maxSeconds) || 600;
    const limitMessage = opts.limitMessage === undefined ? `Calls end automatically after ${Math.round(max / 60)} minutes.` : opts.limitMessage;
    this.maxTimer = setTimeout(() => { this.stop(); if (limitMessage) this.onEvent({ type: "error", message: limitMessage }); }, max * 1000);
    try { window.addEventListener("pagehide", this.onPageHide); } catch {}

    this.micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    this.playCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.nextPlay = this.playCtx.currentTime;
    try { this.outNode = this.outMeter.tap(this.playCtx, this.playCtx.destination); } catch { this.outNode = null; }

    const ws = new WebSocket(session.url);
    this.ws = ws;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { if (!this.live) { reject(new Error("The voice engine didn't answer in time. Try again.")); this.stop(); } }, 20000);
      const goLive = () => {
        if (this.live) return;
        this.live = true; clearTimeout(timeout);
        this.beginMic();
        this.onEvent({ type: "live" });
        resolve();
      };
      ws.onopen = () => { ws.send(JSON.stringify(session.init)); };
      ws.onmessage = (m) => {
        let d: any; try { d = JSON.parse(m.data); } catch { return; }
        switch (d.type) {
          case "conversation_initiation_metadata": {
            const f = String(d.conversation_initiation_metadata_event?.agent_output_audio_format || "pcm_16000");
            const r = Number(f.split("_")[1]); if (f.startsWith("pcm_") && r) this.outRate = r;
            goLive(); break;
          }
          case "ping":
            this.send({ type: "pong", event_id: d.ping_event?.event_id }); break;
          case "audio": {
            goLive();
            const id = Number(d.audio_event?.event_id ?? 0);
            if (id <= this.dropUntil) break;
            if (d.audio_event?.audio_base_64) this.play(d.audio_event.audio_base_64);
            break;
          }
          case "interruption":
            this.dropUntil = Math.max(this.dropUntil, Number(d.interruption_event?.event_id ?? -1));
            this.clearPlayback(); break;
          case "agent_response": {
            const t = String(d.agent_response_event?.agent_response || "").trim();
            if (t) this.onEvent({ type: "transcript", role: "agent", text: t });
            break;
          }
          case "user_transcript": {
            const t = String(d.user_transcription_event?.user_transcript || "").trim();
            if (t) this.onEvent({ type: "transcript", role: "user", text: t });
            break;
          }
          default:
            if (d.type === "error" || d.error) this.onEvent({ type: "error", message: String(hideVendors(d.error?.message || d.message) || "The voice engine reported an error") });
        }
      };
      ws.onerror = () => { if (!this.live) { clearTimeout(timeout); reject(new Error("Couldn't connect to the voice engine.")); } };
      ws.onclose = () => { clearTimeout(timeout); this.finish(); };
    });
  }

  private send(msg: any) { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg)); }

  private beginMic() {
    if (!this.micStream) return;
    this.micCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.source = this.micCtx.createMediaStreamSource(this.micStream);
    try { this.inMeter.listen(this.micCtx, this.source); } catch {}
    this.processor = this.micCtx.createScriptProcessor(2048, 1, 1);
    this.processor.onaudioprocess = (e) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const input = e.inputBuffer.getChannelData(0);
      const frame = this.muted ? new Float32Array(input.length) : input;
      this.send({ user_audio_chunk: toPcm16Base64(resample(frame, this.micCtx!.sampleRate, IN_RATE)) });
    };
    this.source.connect(this.processor);
    this.processor.connect(this.micCtx.destination);
  }

  private play(b64: string) {
    if (!this.playCtx) return;
    const data = fromPcm16Base64(b64);
    if (!data.length) return;
    const buf = this.playCtx.createBuffer(1, data.length, this.outRate);
    buf.getChannelData(0).set(data);
    const src = this.playCtx.createBufferSource();
    src.buffer = buf;
    src.connect(this.outNode || this.playCtx.destination);
    const at = Math.max(this.playCtx.currentTime, this.nextPlay);
    src.start(at);
    this.nextPlay = at + buf.duration;
    this.playing.push(src);
    src.onended = () => { this.playing = this.playing.filter((s) => s !== src); };
  }

  private clearPlayback() {
    for (const s of this.playing) { try { s.stop(); } catch {} }
    this.playing = [];
    this.nextPlay = this.playCtx ? this.playCtx.currentTime : 0;
  }

  private finish() {
    if (this.ended) return;
    this.ended = true;
    this.cleanup();
    this.onEvent({ type: "ended" });
  }

  mute() { this.muted = true; }
  unmute() { this.muted = false; }
  stop() { this.finish(); }

  private cleanup() {
    clearTimeout(this.maxTimer);
    try { window.removeEventListener("pagehide", this.onPageHide); } catch {}
    try { this.processor?.disconnect(); } catch {}
    try { this.source?.disconnect(); } catch {}
    try { this.micCtx?.close(); } catch {}
    try { this.clearPlayback(); this.playCtx?.close(); } catch {}
    try { this.micStream?.getTracks().forEach((t) => t.stop()); } catch {}
    try { this.ws?.close(); } catch {}
    this.ws = null; this.micCtx = null; this.playCtx = null; this.micStream = null; this.outNode = null;
    this.outMeter.reset(); this.inMeter.reset();
  }
}
