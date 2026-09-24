export const runtime = "nodejs";
export const maxDuration = 60;
import crypto from "crypto";
import { sarvamConfig, sarvamMissing, signedSessionUrl } from "@/lib/sarvamAgent";

/**
 * POST /api/sarvam/diagnose?key=… — end-to-end check of the RANA Runtime agent from the server:
 * opens a real Sarvam session with test instructions, speaks a question into it (Sarvam TTS),
 * and returns everything the agent said. Proves that per-employee instructions reach Sarvam.
 * key = HMAC-SHA256(SESSION_SECRET, "sarvam-diagnose") hex. Places no phone call and stores nothing.
 */
export async function POST(req: Request) {
  const secret = process.env.SESSION_SECRET || "";
  const want = crypto.createHmac("sha256", secret).update("sarvam-diagnose").digest("hex");
  const got = new URL(req.url).searchParams.get("key") || "";
  if (!secret || got.length !== want.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want))) return Response.json({ error: "Forbidden" }, { status: 403 });
  const cfg = sarvamConfig();
  if (!cfg) return Response.json({ error: "missing " + sarvamMissing().join(", ") }, { status: 500 });
  const b = await req.json().catch(() => ({} as any));
  const instructions = String(b.instructions || "You are Ravi, a counsellor at Zebra Institute. Whenever anyone asks who you are, reply exactly: I am Ravi from Zebra Institute, code purple forty two. Keep every reply under 20 words.");
  const greeting = String(b.greeting || "Hello, this is a RANA test call.");
  const question = String(b.question || "Hello. What is your name, and which institute are you calling from?");
  const language = String(b.language || "English");
  const log: any[] = [];
  const said: string[] = [];
  const heard: string[] = [];
  let audioChunks = 0;
  const t0 = Date.now();
  const at = () => Math.round((Date.now() - t0) / 100) / 10;

  // The question as 16 kHz 16-bit PCM.
  let questionPcm: Buffer = Buffer.alloc(0);
  try {
    const key = process.env.SARVAM_CHAT_API_KEY || process.env.SARVAM_API_KEY || "";
    const r = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST", headers: { "api-subscription-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ text: question, target_language_code: b.tts_language || "en-IN", speaker: "aditya", model: "bulbul:v3", output_audio_codec: "wav", speech_sample_rate: 16000 }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`TTS ${r.status} ${(await r.text()).slice(0, 200)}`);
    const wav = Buffer.from((await r.json()).audios[0], "base64");
    const idx = wav.indexOf("data");
    questionPcm = idx >= 0 ? wav.subarray(idx + 8) : wav.subarray(44);
  } catch (e: any) {
    return Response.json({ error: "tts: " + e?.message }, { status: 502 });
  }

  let signed;
  try { signed = await signedSessionUrl(cfg, `rana-diagnose-${Date.now()}`); }
  catch (e: any) { return Response.json({ error: "session: " + e?.message }, { status: 502 }); }
  const url = signed.url;
  // A second signed URL, fetched over plain HTTPS, shows why a handshake would be refused (status + body).
  let preflight: any = null;
  try {
    const probe = await signedSessionUrl(cfg, `rana-diagnose-probe-${Date.now()}`);
    const r = await fetch(probe.url.replace(/^wss:/, "https:").replace(/^ws:/, "http:"), { signal: AbortSignal.timeout(8000) });
    preflight = { status: r.status, body: (await r.text()).slice(0, 300) };
  } catch (e: any) { preflight = { error: String(e?.message || e) }; }
  const params = Array.from(new URL(url).searchParams.keys());

  const result = await new Promise<any>((resolve) => {
    const WS: any = (globalThis as any).WebSocket;
    if (!WS) return resolve({ error: "no WebSocket in this runtime" });
    const ws = new WS(url);
    let timer: any;
    const CHUNK = 3200; // 100 ms
    const silence: Buffer = Buffer.alloc(CHUNK);
    let sentQuestionAt = -1;
    let pos = 0;
    let lastAgentAudio = 0;
    const finish = (why: string) => {
      clearInterval(timer);
      try { ws.send(JSON.stringify({ type: "client.action.interaction_end", origin: "client", timestamp: Date.now() / 1000 })); } catch {}
      try { ws.close(); } catch {}
      resolve({ ended: why });
    };
    const hardStop = setTimeout(() => finish("time limit"), 45000);
    ws.onopen = () => {
      log.push({ t: at(), ev: "open" });
      ws.send(JSON.stringify({
        type: "client.action.interaction_start", origin: "client", timestamp: Date.now() / 1000,
        agent_variables: { rana_instructions: instructions }, initial_bot_message: greeting, initial_language_name: language,
      }));
      let tick = 0;
      timer = setInterval(() => {
        tick++;
        let frame: Buffer = silence as Buffer;
        // After the greeting has finished playing (≥1.5 s with no agent audio, at least 3 s in), speak the question once.
        const quiet = Date.now() - lastAgentAudio > 1500;
        if (sentQuestionAt < 0 && tick > 30 && quiet) { sentQuestionAt = at(); log.push({ t: at(), ev: "question start" }); }
        if (sentQuestionAt >= 0 && pos < questionPcm.length) { frame = questionPcm.subarray(pos, pos + CHUNK); pos += CHUNK; if (frame.length < CHUNK) frame = Buffer.concat([frame, Buffer.alloc(CHUNK - frame.length)]); }
        try { ws.send(JSON.stringify({ type: "client.media.audio_chunk", origin: "client", timestamp: Date.now() / 1000, audio_base64: frame.toString("base64"), format: "audio/wav", sample_rate: 16000 })); } catch {}
        // Stop once the agent has answered the question and gone quiet.
        if (sentQuestionAt >= 0 && pos >= questionPcm.length && said.length >= 2 && quiet && at() - sentQuestionAt > 6) finish("answered");
        if (tick > 400) finish("ticks");
      }, 100);
    };
    ws.onmessage = (m: any) => {
      let d: any; try { d = JSON.parse(typeof m.data === "string" ? m.data : Buffer.from(m.data).toString()); } catch { return; }
      if (d.type === "server.media.audio_chunk") { audioChunks++; lastAgentAudio = Date.now(); return; }
      if (d.type === "server.system.ping") { try { ws.send(JSON.stringify({ type: "client.system.pong", origin: "client", timestamp: Date.now() / 1000 })); } catch {} return; }
      if (d.type === "server.media.text" && d.text) said.push(String(d.text));
      if (d.type === "server.event.transcription") (d.role === "user" ? heard : said).push(String(d.content ?? d.text ?? ""));
      const { audio_base64, ...rest } = d;
      log.push({ t: at(), ...rest });
      if (d.type === "server.action.interaction_end") { clearTimeout(hardStop); finish("server ended"); }
    };
    ws.onerror = (e: any) => { log.push({ t: at(), ev: "error", msg: String(e?.message || e?.error?.message || e?.type || e) }); };
    ws.onclose = (e: any) => { log.push({ t: at(), ev: "close", code: e?.code, reason: e?.reason }); clearTimeout(hardStop); clearInterval(timer); resolve({ ended: "closed" }); };
  });

  const answer = said.slice(1).join(" ");
  const out = {
    ...result, referenceId: signed.referenceId, seconds: at(), audioChunks, preflight, params, host: new URL(url).host, path: new URL(url).pathname,
    agentSaid: said, callerHeard: heard,
    followsInstructions: /zebra|ravi|purple|42/i.test(answer),
    log: log.slice(0, 80),
  };
  // Kept so the result can be read even when the caller gave up waiting.
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/rana_diagnostics`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: process.env.SUPABASE_SERVICE_KEY || "", Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY || ""}` },
    body: JSON.stringify({ kind: "sarvam_session", result: out }),
  }).catch(() => {});
  return Response.json(out);
}
