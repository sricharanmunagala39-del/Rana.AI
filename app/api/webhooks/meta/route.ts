export const runtime = "nodejs";
export const maxDuration = 60;
import { verifySignature } from "@/lib/meta";
import { parseWebhook, handleMessage, handleComment, inboxSettings, loadRules } from "@/lib/metaInbox";
import { sb } from "@/lib/db";

/** GET → Meta's one-time webhook verification (hub.challenge), checked against META_VERIFY_TOKEN. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const want = process.env.META_VERIFY_TOKEN || "";
  if (want && u.searchParams.get("hub.mode") === "subscribe" && u.searchParams.get("hub.verify_token") === want) {
    return new Response(u.searchParams.get("hub.challenge") || "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

/** POST → Instagram / Messenger messages and comments. Signed by Meta with the app secret; unsigned calls are refused. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!process.env.META_APP_SECRET) return Response.json({ error: "META_APP_SECRET is not set" }, { status: 503 });
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) return Response.json({ error: "Bad signature" }, { status: 401 });
  let body: any; try { body = JSON.parse(raw); } catch { return Response.json({ error: "Bad JSON" }, { status: 400 }); }
  const { messages, comments } = parseWebhook(body);
  const results: any[] = [];
  if (messages.length || comments.length) {
    const [settings, rules] = await Promise.all([inboxSettings(), loadRules()]);
    for (const m of messages) results.push(await handleMessage(m, settings, rules).catch((e) => ({ error: String(e?.message || e).slice(0, 200) })));
    for (const c of comments) results.push(await handleComment(c, settings, rules).catch((e) => ({ error: String(e?.message || e).slice(0, 200) })));
    const failed = results.filter((r) => r?.error);
    if (failed.length) await sb(`/cron_runs`, { method: "POST", prefer: "return=minimal", body: JSON.stringify({ job: "meta_webhook", ok: false, detail: { failed } }) }).catch(() => {});
  }
  // Always 200 for a correctly signed call, so Meta doesn't retry (and double-reply) on our own errors.
  return Response.json({ ok: true, handled: results.length });
}
