export const runtime = "nodejs";
export const maxDuration = 90;
import { studioGuard } from "@/lib/studioAuth";
import { listKnowledge, addKnowledge, deleteKnowledge, fetchPageText, thinHint } from "@/lib/knowledge";

const view = (k: any) => ({ id: k.id, kind: k.kind, title: k.title, source: k.source, chars: k.chars, summary: k.summary, preview: (k.content || "").slice(0, 6000), hint: thinHint(k), created_at: k.created_at });

/** GET ?scriptId — what this employee knows. */
export async function GET(req: Request) {
  const scriptId = new URL(req.url).searchParams.get("scriptId");
  const g = await studioGuard(req, scriptId);
  if (g instanceof Response) return g;
  if (!g.script) return Response.json({ error: "scriptId required" }, { status: 400 });
  return Response.json({ items: (await listKnowledge(g.script.id)).map(view) });
}

/** POST { scriptId, kind: "file"|"text"|"url", title?, content?, url? } */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const g = await studioGuard(req, b.scriptId);
  if (g instanceof Response) return g;
  if (!g.script) return Response.json({ error: "Save the employee first." }, { status: 400 });
  const existing = await listKnowledge(g.script.id);
  if (existing.length >= 25) return Response.json({ error: "Up to 25 documents per employee." }, { status: 400 });
  try {
    let title = String(b.title || "").trim().slice(0, 120);
    let content = String(b.content || "");
    let source: string | null = null;
    if (b.kind === "url") {
      const page = await fetchPageText(String(b.url || ""));
      title = title || page.title; content = page.text; source = String(b.url);
    } else if (!["file", "text"].includes(b.kind)) {
      return Response.json({ error: "Unknown kind" }, { status: 400 });
    }
    content = content.replace(/\u0000/g, "").trim();
    if (content.length < 20) return Response.json({ error: "There's no readable text in that." }, { status: 400 });
    const row = await addKnowledge({ client_id: g.session.clientId, script_id: g.script.id, kind: b.kind, title: title || "Notes", source, content, created_by: g.session.email });
    return Response.json({ ok: true, item: view(row) }, { status: 201 });
  } catch (e: any) {
    return Response.json({ error: e?.message || "Couldn't add that." }, { status: 400 });
  }
}

/** DELETE ?scriptId&id */
export async function DELETE(req: Request) {
  const sp = new URL(req.url).searchParams;
  const g = await studioGuard(req, sp.get("scriptId"));
  if (g instanceof Response) return g;
  if (!g.script || !sp.get("id")) return Response.json({ error: "Missing id" }, { status: 400 });
  await deleteKnowledge(g.script.id, sp.get("id")!);
  return Response.json({ ok: true });
}
