export const runtime = "nodejs";

type ChatMessage = { role: string; content: string };

async function sarvamSTT(audioBlob: Blob, apiKey: string) {
  const fd = new FormData();
  fd.append("file", audioBlob, "audio.webm");
  fd.append("model", "saaras:v3");
  fd.append("mode", "transcribe");
  const res = await fetch("https://api.sarvam.ai/speech-to-text", {
    method: "POST",
    headers: { "api-subscription-key": apiKey },
    body: fd,
  });
  if (!res.ok) throw new Error(`Sarvam STT failed (${res.status}): ${await res.text()}`);
  return res.json() as Promise<{ transcript: string; language_code: string | null }>;
}

async function sarvamChat(messages: ChatMessage[], apiKey: string) {
  const res = await fetch("https://api.sarvam.ai/v1/chat/completions", {
    method: "POST",
    headers: { "api-subscription-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "sarvam-105b", messages, temperature: 0.7, max_tokens: 150 }),
  });
  if (!res.ok) throw new Error(`Sarvam Chat failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content as string;
}

async function sarvamTTS(text: string, languageCode: string, speaker: string, pace: number, apiKey: string) {
  const res = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: { "api-subscription-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      language_code: languageCode,
      model: "bulbul:v3",
      speaker,
      pace,
    }),
  });
  if (!res.ok) throw new Error(`Sarvam TTS failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.audios?.[0] as string;
}

export async function POST(req: Request) {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "SARVAM_API_KEY is not set on the server yet. Add it in Vercel → Project Settings → Environment Variables." },
      { status: 500 }
    );
  }

  try {
    const form = await req.formData();
    const mode = String(form.get("mode") || "turn");
    const instructions = String(form.get("instructions") || "");
    const speaker = String(form.get("speaker") || "shubh");
    const pace = parseFloat(String(form.get("pace") || "1"));
    const language = String(form.get("language") || "en-IN");

    if (mode === "greeting") {
      const text = String(form.get("text") || "");
      const audioBase64 = await sarvamTTS(text, language, speaker, pace, apiKey);
      return Response.json({ audioBase64, lang: language });
    }

    const audioFile = form.get("audio") as Blob | null;
    if (!audioFile) {
      return Response.json({ error: "No audio was received." }, { status: 400 });
    }
    const history = JSON.parse(String(form.get("history") || "[]")) as ChatMessage[];

    const stt = await sarvamSTT(audioFile, apiKey);
    const transcript = (stt.transcript || "").trim();
    const detectedLanguage = stt.language_code || language;

    if (!transcript) {
      return Response.json({ transcript: "", detectedLanguage, replyText: "", audioBase64: null, silent: true });
    }

    const systemPrompt = `${instructions}\n\nRespond only in the language with BCP-47 code ${detectedLanguage}. Keep replies to 1-2 short, natural spoken sentences, like a real phone call — not a written paragraph.`;

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: transcript },
    ];

    const replyText = await sarvamChat(messages, apiKey);
    const audioBase64 = await sarvamTTS(replyText, detectedLanguage, speaker, pace, apiKey);

    return Response.json({ transcript, detectedLanguage, replyText, audioBase64 });
  } catch (err: any) {
    return Response.json({ error: err?.message || "Something went wrong talking to Sarvam." }, { status: 500 });
  }
}
