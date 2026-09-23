"use client";

/**
 * Minimal browser client for Cartesia's Agents WebSocket API.
 * Docs: https://docs.cartesia.ai/api-reference/agents/websocket
 *
 * There is no official Cartesia SDK for this endpoint (cartesia-js only covers
 * plain TTS/STT) — so mic capture, resampling, packetizing and playback
 * scheduling below are hand-rolled against the raw protocol:
 *
 *   1. connect to wss://api.cartesia.ai/agents/stream/{agent_id}
 *      ?access_token=...&cartesia_version=2026-08-14
 *   2. send { event: "start", config: { input_format: "pcm_44100" } } first
 *   3. wait for { event: "ack" }
 *   4. stream mic audio as { event: "media_input", stream_id, media: { payload } }
 *      — 16-bit signed PCM, mono, 44100Hz, base64-encoded
 *   5. receive { event: "media_output", media: { payload } } in the same format
 *      and play it back
 *   6. { event: "clear" } = the agent was interrupted — drop whatever's queued
 *
 * The exact shape of live-transcript events wasn't in the docs snippets we
 * could confirm, so transcript handling below checks a few plausible field
 * names defensively. If nothing shows up in the transcript panel during a
 * real call, that's the first thing to tighten — the audio itself doesn't
 * depend on it.
 */

export type CartesiaCallEvent =
  | { type: "live" }
  | { type: "transcript"; role: "agent" | "user"; text: string }
  | { type: "ended" }
  | { type: "error"; message: string };

const SAMPLE_RATE = 44100;

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function resampleFloat32(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const newLength = Math.round(input.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const i0 = Math.floor(srcIndex);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = srcIndex - i0;
    result[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return result;
}

function base64ToInt16(b64: string): Int16Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

function int16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export class CartesiaVoiceCall {
  private ws: WebSocket | null = null;
  private micCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private playCtx: AudioContext | null = null;
  private nextPlayTime = 0;
  private streamId = `web_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  private muted = false;
  private onEvent: (e: CartesiaCallEvent) => void;

  constructor(onEvent: (e: CartesiaCallEvent) => void) {
    this.onEvent = onEvent;
  }

  async start(agentId: string) {
    const tokenRes = await fetch("/api/cartesia-access-token", { method: "POST" });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenData.error || "Could not get a Cartesia session token");

    this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    this.playCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.nextPlayTime = this.playCtx.currentTime;

    const wsUrl = `wss://api.cartesia.ai/agents/stream/${agentId}?access_token=${encodeURIComponent(
      tokenData.token
    )}&cartesia_version=2026-08-14`;
    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    return new Promise<void>((resolve, reject) => {
      let acked = false;
      const timeout = setTimeout(() => {
        if (!acked) {
          reject(new Error("Cartesia didn't respond in time"));
          this.stop();
        }
      }, 15000);

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            event: "start",
            stream_id: this.streamId,
            config: { input_format: "pcm_44100", output_audio_delivery: "as_available" },
          })
        );
      };

      ws.onmessage = (msg) => {
        let data: any;
        try {
          data = JSON.parse(msg.data);
        } catch {
          return;
        }

        if (data.event === "ack") {
          acked = true;
          clearTimeout(timeout);
          this.beginMicCapture();
          this.onEvent({ type: "live" });
          resolve();
        } else if (data.event === "media_output" && data.media?.payload) {
          this.playChunk(data.media.payload);
        } else if (data.event === "clear") {
          this.nextPlayTime = this.playCtx ? this.playCtx.currentTime : 0;
        } else if (
          data.event === "transcript" ||
          data.event === "user_transcript" ||
          data.event === "assistant_transcript" ||
          data.event === "turn"
        ) {
          const role: "agent" | "user" =
            data.role === "user" || data.event === "user_transcript" ? "user" : "agent";
          const text = data.text ?? data.content ?? data.transcript ?? "";
          if (text) this.onEvent({ type: "transcript", role, text });
        } else if (data.event === "error") {
          this.onEvent({ type: "error", message: data.message || "Cartesia reported an error" });
        }
      };

      ws.onerror = () => {
        if (!acked) {
          clearTimeout(timeout);
          reject(new Error("Could not connect to Cartesia"));
        }
      };

      ws.onclose = () => {
        this.onEvent({ type: "ended" });
      };
    });
  }

  private beginMicCapture() {
    if (!this.micStream) return;
    this.micCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.source = this.micCtx.createMediaStreamSource(this.micStream);
    // ScriptProcessorNode is deprecated but still broadly supported and is the
    // simplest way to get raw PCM frames without shipping a separate worklet file.
    this.processor = this.micCtx.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      if (this.muted || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const input = e.inputBuffer.getChannelData(0);
      const resampled = resampleFloat32(input, this.micCtx!.sampleRate, SAMPLE_RATE);
      const pcm16 = floatTo16BitPCM(resampled);
      this.ws.send(
        JSON.stringify({
          event: "media_input",
          stream_id: this.streamId,
          media: { payload: int16ToBase64(pcm16) },
        })
      );
    };

    this.source.connect(this.processor);
    // We never write to the output buffer, so this doesn't echo the mic to speakers —
    // connecting to destination is just what keeps some browsers from garbage-collecting the node.
    this.processor.connect(this.micCtx.destination);
  }

  private playChunk(b64: string) {
    if (!this.playCtx) return;
    const pcm16 = base64ToInt16(b64);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 0x8000;

    const buffer = this.playCtx.createBuffer(1, float32.length, SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);

    const src = this.playCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.playCtx.destination);

    const now = this.playCtx.currentTime;
    const startAt = Math.max(now, this.nextPlayTime);
    src.start(startAt);
    this.nextPlayTime = startAt + buffer.duration;
  }

  mute() {
    this.muted = true;
  }
  unmute() {
    this.muted = false;
  }

  stop() {
    try {
      this.processor?.disconnect();
    } catch {}
    try {
      this.source?.disconnect();
    } catch {}
    try {
      this.micCtx?.close();
    } catch {}
    try {
      this.playCtx?.close();
    } catch {}
    try {
      this.micStream?.getTracks().forEach((t) => t.stop());
    } catch {}
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
    this.micCtx = null;
    this.playCtx = null;
    this.micStream = null;
  }
}
