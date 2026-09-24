export const runtime = "nodejs";
import { listCartesiaFiles, uploadCartesiaFile } from "@/lib/cartesia";

export async function GET() {
  if (!process.env.CARTESIA_API_KEY) {
    return Response.json({ error: "CARTESIA_API_KEY is not set." }, { status: 500 });
  }
  try {
    const files = await listCartesiaFiles("agent_background_sound");
    return Response.json({
      files: (files || [])
        .filter((f: any) => f.status === "ready" || !f.status)
        .map((f: any) => ({ id: f.id, filename: f.filename, sizeBytes: f.size ?? null })),
    });
  } catch (err: any) {
    return Response.json({ error: err?.message || "Failed to load background sounds" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!process.env.CARTESIA_API_KEY) {
    return Response.json({ error: "CARTESIA_API_KEY is not set." }, { status: 500 });
  }
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return Response.json({ error: "No file provided." }, { status: 400 });
    }
    const buffer = Buffer.from(await (file as File).arrayBuffer());
    const uploaded = await uploadCartesiaFile(buffer, (file as File).name || "background-sound", (file as File).type || "audio/mpeg", "agent_background_sound");
    return Response.json({ file: { id: uploaded.id, filename: uploaded.filename, sizeBytes: uploaded.size ?? null } });
  } catch (err: any) {
    return Response.json({ error: err?.message || "Upload failed" }, { status: 500 });
  }
}
