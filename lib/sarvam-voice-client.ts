"use client";

/**
 * Browser client for a Sarvam voice-agent session (the protocol used by Sarvam's own `sarvam-conv-ai-sdk`).
 *
 *   1. RANA's server returns a single-use signed wss:// URL and the start message (/api/sarvam/session)
 *   2. on open → send client.action.interaction_start { agent_variables, initial_bot_message, initial_language_name }
 *   3. stream mic audio as client.media.audio_chunk { audio_base64 (16-bit PCM mono, 16 kHz), format:"audio/wav", sample_rate }
 *   4. play server.media.audio_chunk (same PCM format at 16 kHz)
 *   5. server.event.user_interrupt → drop queued playback; server.system.ping → client.system.pong
 *   6. server.event.transcription {role, content} / server.media.text {text} → live transcript
 */

export type SarvamCallEvent =
  | { type: "live" }
  | { type: "transcript"; role: "agent" | "user"; text: string }
  | { type: "language"; language: string }
  | { type: "ended" }
  | { type: "error"; message: string };

const RATE = 16000;

function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const n = Math.floor(input.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * ratio, j = Math.floor(p), f = p - j;
    out[i] = input[j] * (1 - f) + (input[j + 1] ?? input[j]) * f;
  }
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

const now = () => Date.now() / 1000;

export class SarvamVoiceCall {
  private ws: WebSocket | null = null;
  private micStream: MediaStream | null = null;
  private micCtx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private playCtx: AudioContext | null = null;
  private playing: AudioBufferSourceNode[] = [];
  private nextPlay = 0;
  private muted = false;
  private live = false;
  private sawAgentText = false;
  private ended = false;
  private greeting = "";
  private practiceId: string | null = null;
  private maxTimer: any = null;
  private onPageHide = () => this.stop();
  private onEvent: (e: SarvamCallEvent) => void;

  constructor(onEvent: (e: SarvamCallEvent) => void) { this.onEvent = onEvent; }

  /** scriptId: the RANA employee to talk to. */
  async start(scriptId: string) {
    const res = await fetch("/api/sarvam/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scriptId }) });
    const session = await res.json();
    if (!res.ok) throw new Error(session.error || "Couldn't start the call");
    this.greeting = String(session.start?.initial_bot_message || "").trim();
    this.practiceId = session.practiceId || null;
    // Practice calls are billed per minute by the voice provider: end them automatically at the limit,
    // and when the tab is closed, so a forgotten tab never keeps a call running.
    const max = Number(session.maxSeconds) || 600;
    this.maxTimer = setTimeout(() => { this.stop(); this.onEvent({ type: "error", message: `Practice calls end automatically after ${Math.round(max / 60)} minutes. Start a new one to keep going.` } as any); }, max * 1000);
    try { window.addEventListener("pagehide", this.onPageHide); } catch {}

    this.micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    this.playCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.nextPlay = this.playCtx.currentTime;

    const ws = new WebSocket(session.url);
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { if (!this.live) { reject(new Error("Sarvam didn't answer in time. Try again.")); this.stop(); } }, 20000);
      const goLive = () => {
        if (this.live) return;
        this.live = true; clearTimeout(timeout);
        this.beginMic();
        this.onEvent({ type: "live" });
        resolve();
      };

      ws.onopen = () => {
        ws.send(JSON.stringify({ ...session.start, timestamp: now() }));
      };
      ws.onmessage = (m) => {
        let d: any; try { d = JSON.parse(m.data); } catch { return; }
        switch (d.type) {
          case "server.system.ping":
            this.send({ type: "client.system.pong", origin: "client", timestamp: now() }); break;
          case "server.action.interaction_connected":
            goLive();
            // Sarvam speaks the greeting without sending its text; show it so the transcript starts at the top.
            if (this.greeting) this.onEvent({ type: "transcript", role: "agent", text: this.greeting });
            break;
          case "server.media.audio_chunk":
            goLive();
            if (d.audio_base64) this.play(d.audio_base64);
            break;
          case "server.event.user_interrupt":
            this.clearPlayback(); break;
          case "server.media.text":
            goLive();
            if (d.text) { this.sawAgentText = true; this.onEvent({ type: "transcript", role: "agent", text: String(d.text) }); }
            break;
          case "server.event.transcription": {
            const text = String(d.content ?? d.text ?? "").trim();
            if (!text) break;
            const role = d.role === "user" ? "user" : "agent";
            if (role === "agent" && this.sawAgentText) break; // agent lines already came as server.media.text
            if (role === "agent" && this.greeting && text === this.greeting) break; // greeting already shown
            this.onEvent({ type: "transcript", role, text });
            break;
          }
          case "server.event.language_change":
            if (d.language_name || d.language) this.onEvent({ type: "language", language: String(d.language_name || d.language) });
            break;
          case "server.action.interaction_end":
            this.finish(); break;
          default:
            if (d.type === "server.event.error" || d.error) this.onEvent({ type: "error", message: String(d.error?.message || d.message || "Sarvam reported an error") });
        }
      };
      ws.onerror = () => { if (!this.live) { clearTimeout(timeout); reject(new Error("Couldn't connect to Sarvam.")); } };
      ws.onclose = () => { clearTimeout(timeout); this.finish(); };
    });
  }

  private send(msg: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private beginMic() {
    if (!this.micStream) return;
    this.micCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.source = this.micCtx.createMediaStreamSource(this.micStream);
    this.processor = this.micCtx.createScriptProcessor(2048, 1, 1);
    this.processor.onaudioprocess = (e) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const input = e.inputBuffer.getChannelData(0);
      // Muted: keep sending silence so Sarvam's voice detection stays steady (as the official SDK does).
      const frame = this.muted ? new Float32Array(input.length) : input;
      const pcm = resample(frame, this.micCtx!.sampleRate, RATE);
      this.send({ type: "client.media.audio_chunk", origin: "client", timestamp: now(), audio_base64: toPcm16Base64(pcm), format: "audio/wav", sample_rate: RATE });
    };
    this.source.connect(this.processor);
    this.processor.connect(this.micCtx.destination);
  }

  private play(b64: string) {
    if (!this.playCtx) return;
    const data = fromPcm16Base64(b64);
    if (!data.length) return;
    const buf = this.playCtx.createBuffer(1, data.length, RATE);
    buf.getChannelData(0).set(data);
    const src = this.playCtx.createBufferSource();
    src.buffer = buf;
    src.connect(this.playCtx.destination);
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

  stop() {
    this.send({ type: "client.action.interaction_end", origin: "client", timestamp: now() });
    this.finish();
  }

  private reportEnd() {
    if (!this.practiceId) return;
    const body = JSON.stringify({ practiceId: this.practiceId });
    this.practiceId = null;
    try {
      if (navigator.sendBeacon && navigator.sendBeacon("/api/sarvam/session/end", new Blob([body], { type: "application/json" }))) return;
    } catch {}
    fetch("/api/sarvam/session/end", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  }

  private cleanup() {
    clearTimeout(this.maxTimer);
    try { window.removeEventListener("pagehide", this.onPageHide); } catch {}
    this.reportEnd();
    try { this.processor?.disconnect(); } catch {}
    try { this.source?.disconnect(); } catch {}
    try { this.micCtx?.close(); } catch {}
    try { this.clearPlayback(); this.playCtx?.close(); } catch {}
    try { this.micStream?.getTracks().forEach((t) => t.stop()); } catch {}
    try { this.ws?.close(); } catch {}
    this.ws = null; this.micCtx = null; this.playCtx = null; this.micStream = null;
  }
}
