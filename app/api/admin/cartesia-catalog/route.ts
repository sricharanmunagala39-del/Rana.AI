export const runtime = "nodejs";
import { listCartesiaModels, listCartesiaVoices } from "@/lib/cartesia";

export async function GET() {
  if (!process.env.CARTESIA_API_KEY) {
    return Response.json({ error: "CARTESIA_API_KEY is not set." }, { status: 500 });
  }
  try {
    const [voices, models] = await Promise.all([listCartesiaVoices(), listCartesiaModels()]);
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
      })),
      models: (models || []).map((m: any) => ({
        id: m.id,
        name: m.name ?? m.id,
        provider: m.provider ?? null,
      })),
    });
  } catch (err: any) {
    return Response.json({ error: err?.message || "Failed to load Cartesia catalog" }, { status: 500 });
  }
}
