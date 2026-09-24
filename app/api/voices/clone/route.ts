export const runtime = "nodejs";
export const maxDuration = 60;
import { getSession } from "@/lib/session";
import { unauthorized, forbidUnless } from "@/lib/auth";
import { cloneOnCartesia, saveCustomVoice, CLONE_LANGUAGES, MAX_CLIP_BYTES } from "@/lib/voiceClone";
import { audit } from "@/lib/audit";

/**
 * POST multipart: clip (audio, ≤4 MB — the browser already trimmed and joined the recordings),
 * name, language, gender?, description?, sourceFiles, clipSeconds, quality (JSON),
 * consentSpeakerName, consentConfirmed ("yes").
 */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const denied = forbidUnless(session, "admin"); if (denied) return denied;
  if (!process.env.CARTESIA_API_KEY) return Response.json({ error: "CARTESIA_API_KEY is not set." }, { status: 500 });

  let form: FormData;
  try { form = await req.formData(); } catch { return Response.json({ error: "Upload didn't arrive — try again." }, { status: 400 }); }
  const clip = form.get("clip");
  const name = String(form.get("name") || "").trim().slice(0, 60);
  const language = String(form.get("language") || "").trim();
  const gender = String(form.get("gender") || "").trim() || null;
  const description = String(form.get("description") || "").trim().slice(0, 500) || null;
  const speaker = String(form.get("consentSpeakerName") || "").trim().slice(0, 120);
  const consent = String(form.get("consentConfirmed") || "") === "yes";
  const sourceFiles = Math.max(1, Math.min(50, Number(form.get("sourceFiles")) || 1));
  const clipSeconds = Math.max(0, Math.min(600, Number(form.get("clipSeconds")) || 0));
  let quality: any = {};
  try { quality = JSON.parse(String(form.get("quality") || "{}")); } catch { /* optional */ }

  if (!(clip instanceof Blob) || clip.size === 0) return Response.json({ error: "Add at least one recording." }, { status: 400 });
  if (clip.size > MAX_CLIP_BYTES) return Response.json({ error: "The combined clip is too large. Keep it to about a minute." }, { status: 413 });
  if (clipSeconds && clipSeconds < 8) return Response.json({ error: "We need at least 8 seconds of clear speech — 30 to 60 seconds sounds best." }, { status: 400 });
  if (!name) return Response.json({ error: "Give the voice a name." }, { status: 400 });
  if (!CLONE_LANGUAGES[language]) return Response.json({ error: "Pick the language the person speaks in the recordings." }, { status: 400 });
  if (!speaker) return Response.json({ error: "Enter the name of the person whose voice this is." }, { status: 400 });
  if (!consent) return Response.json({ error: "Confirm you have this person's permission to clone their voice." }, { status: 400 });

  try {
    const created = await cloneOnCartesia({ clip, filename: "voice.wav", name, language, description });
    if (!created?.id) throw new Error("Cartesia didn't return a voice id");
    const row = await saveCustomVoice({
      client_id: session.clientId, cartesia_voice_id: created.id, name, language, gender, description,
      source_files: sourceFiles, clip_seconds: clipSeconds || null, quality,
      consent_speaker_name: speaker, consent_confirmed_by: session.email, created_by: session.email,
    } as any);
    await audit(session, "voice_cloned", { req, targetType: "voice", targetId: created.id, detail: { name, language, speaker, sourceFiles, clipSeconds } });
    return Response.json({
      ok: true,
      voice: { id: created.id, name, tagline: "Your cloned voice", description, language, gender, country: null, previewUrl: null, accents: [], custom: true, customId: row.id },
    }, { status: 201 });
  } catch (e: any) {
    console.error("[voice clone]", e?.message);
    return Response.json({ error: `Cartesia couldn't clone this voice: ${e?.message || e}` }, { status: 502 });
  }
}
