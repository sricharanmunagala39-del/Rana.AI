export const runtime = "nodejs";
import { listCartesiaAccents, listCartesiaFiles, listCartesiaModels, listCartesiaVoices } from "@/lib/cartesia";
import { getSession } from "@/lib/session";
import { unauthorized } from "@/lib/auth";
import { listCustomVoices, foreignVoiceIds } from "@/lib/voiceClone";

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  if (!process.env.CARTESIA_API_KEY) {
    return Response.json({ error: "CARTESIA_API_KEY is not set." }, { status: 500 });
  }
  try {
    const [allVoices, models, accents, backgroundSounds, mine] = await Promise.all([
      listCartesiaVoices(),
      listCartesiaModels(),
      listCartesiaAccents().catch(() => []),
      listCartesiaFiles("agent_background_sound").catch(() => []),
      listCustomVoices(session.clientId).catch(() => []),
    ]);
    // Cloned voices live in the shared Cartesia account: hide every other client's, flag this client's own.
    const foreign = await foreignVoiceIds(session.clientId, (allVoices || []).map((v: any) => v.id)).catch(() => new Set<string>());
    const own = new Map(mine.map((m) => [m.cartesia_voice_id, m]));
    const voices = [
      ...mine.filter((m) => !(allVoices || []).some((v: any) => v.id === m.cartesia_voice_id)).map((m) => ({ id: m.cartesia_voice_id, name: m.name, language: m.language })),
      ...(allVoices || []).filter((v: any) => !foreign.has(v.id)),
    ];

    return Response.json({
      voices: voices.map((v: any) => ({
        id: v.id,
        name: own.get(v.id)?.name ?? v.name ?? v.id,
        tagline: own.has(v.id) ? "Your cloned voice" : v.tagline ?? null,
        description: own.get(v.id)?.description ?? v.description ?? null,
        language: own.get(v.id)?.language ?? v.language ?? null,
        gender: own.get(v.id)?.gender ?? v.gender ?? null,
        custom: own.has(v.id),
        customId: own.get(v.id)?.id ?? null,
        country: v.country ?? null,
        previewUrl: v.preview_file_url ?? null,
        accents: (v.accents || []).map((a: any) => ({ accent: a.accent, locale: a.locale, isNative: !!a.is_native })),
      })),
      models: (models || []).map((m: any) => ({
        id: m.id,
        name: m.display_name ?? m.name ?? m.id,
        provider: m.provider ?? null,
        description: m.description ?? null,
        avgLatencyMs: m.average_latency_ms ?? null,
        pricing: m.pricing
          ? {
              currency: m.pricing.currency,
              inputPerM: m.pricing.input_per_million_tokens,
              outputPerM: m.pricing.output_per_million_tokens,
              cacheReadPerM: m.pricing.cache_read_per_million_tokens,
              cacheWritePerM: m.pricing.cache_write_per_million_tokens,
            }
          : null,
      })),
      accents: (accents || []).map((a: any) => ({
        id: a.id,
        name: a.name,
        language: a.language,
        locale: a.locale,
        isLocaleDefault: !!a.is_locale_default,
      })),
      backgroundSounds: (backgroundSounds || [])
        .filter((f: any) => f.status === "ready" || !f.status)
        .map((f: any) => ({ id: f.id, filename: f.filename, sizeBytes: f.size ?? null })),
    });
  } catch (err: any) {
    return Response.json({ error: err?.message || "Failed to load Cartesia catalog" }, { status: 500 });
  }
}
