export const runtime = "nodejs";
import { listCartesiaAccents, listCartesiaFiles, listCartesiaModels, listCartesiaVoices } from "@/lib/cartesia";

export async function GET() {
  if (!process.env.CARTESIA_API_KEY) {
    return Response.json({ error: "CARTESIA_API_KEY is not set." }, { status: 500 });
  }
  try {
    const [voices, models, accents, backgroundSounds] = await Promise.all([
      listCartesiaVoices(),
      listCartesiaModels(),
      listCartesiaAccents().catch(() => []),
      listCartesiaFiles("agent_background_sound").catch(() => []),
    ]);

    return Response.json({
      voices: (voices || []).map((v: any) => ({
        id: v.id,
        name: v.name ?? v.id,
        tagline: v.tagline ?? null,
        description: v.description ?? null,
        language: v.language ?? null,
        gender: v.gender ?? null,
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
