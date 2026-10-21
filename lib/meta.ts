// Meta (Instagram + Facebook Messenger) Graph API: the few calls the HQ inbox needs, plus webhook signature checks.
// Uses one Page access token from a Page that has the RANA AI Instagram account linked (Facebook Login flow).
//
// Vercel env:
//   META_APP_SECRET         App secret (App settings → Basic). Verifies every webhook call.
//   META_VERIFY_TOKEN       Any long random string; typed into the webhook setup in the Meta app.
//   META_PAGE_ACCESS_TOKEN  Long-lived Page token with pages_messaging, instagram_manage_messages,
//                           instagram_manage_comments, pages_manage_engagement, pages_read_engagement.
//   META_PAGE_ID            The RANA AI Facebook Page id.
//   META_IG_USER_ID         The Instagram professional account id linked to that Page (optional; found by "Check connection").
//   META_APP_ID             Recommended: the Meta app id. Needed to tell our own sends from replies a person types in the
//                           Instagram / Facebook / Business Suite inbox (those pause the bot in that chat).
//   META_GRAPH_VERSION      Optional, default v21.0.
import crypto from "crypto";

export const graphVersion = () => process.env.META_GRAPH_VERSION || "v21.0";
const G = () => `https://graph.facebook.com/${graphVersion()}`;
const token = () => process.env.META_PAGE_ACCESS_TOKEN || "";
export const pageId = () => process.env.META_PAGE_ID || "";
export const igUserId = () => process.env.META_IG_USER_ID || "";

/** Which settings are present (names only; never the values). */
export function metaConfig() {
  return {
    appSecret: !!process.env.META_APP_SECRET, verifyToken: !!process.env.META_VERIFY_TOKEN,
    pageToken: !!token(), pageId: !!pageId(), igUserId: !!igUserId(), appId: !!process.env.META_APP_ID, version: graphVersion(),
  };
}
export const canSend = () => !!token();

/** X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(raw body, app secret). Constant-time compare. */
export function verifySignature(raw: string, header: string | null, secret = process.env.META_APP_SECRET || ""): boolean {
  if (!secret || !header || !header.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  const got = header.slice(7).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(got)) return false;
  return crypto.timingSafeEqual(Buffer.from(got, "utf8"), Buffer.from(expected, "utf8"));
}

async function graph<T = any>(path: string, init: RequestInit & { query?: Record<string, string> } = {}): Promise<T> {
  if (!token()) throw new Error("META_PAGE_ACCESS_TOKEN is not set in Vercel.");
  const q = new URLSearchParams({ ...(init.query || {}), access_token: token() });
  const res = await fetch(`${G()}/${path}?${q}`, { ...init, cache: "no-store", signal: AbortSignal.timeout(10000), headers: { "Content-Type": "application/json", ...(init.headers || {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j?.error) {
    const e = j?.error || {};
    // 10 / 2018278 / 2534022 / "outside of allowed window" are Meta's 24-hour-window refusals.
    throw new Error(`Meta ${res.status}${e.code ? ` (${e.code}${e.error_subcode ? `/${e.error_subcode}` : ""})` : ""}: ${e.message || "request failed"}`);
  }
  return j as T;
}

/** Send a DM (Instagram or Messenger) inside the 24-hour window. Returns Meta's message id. */
export async function sendDm(recipientId: string, text: string): Promise<string | null> {
  const j = await graph<any>(`${pageId() || "me"}/messages`, { method: "POST", body: JSON.stringify({ recipient: { id: recipientId }, messaging_type: "RESPONSE", message: { text: text.slice(0, 1000) } }) });
  return j?.message_id || null;
}

/** Private reply to a comment: one DM per comment, within 7 days of the comment. */
export async function sendPrivateReply(commentId: string, text: string): Promise<string | null> {
  const j = await graph<any>(`${pageId() || "me"}/messages`, { method: "POST", body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text: text.slice(0, 1000) } }) });
  return j?.message_id || null;
}

/** Public reply under a comment (Instagram: /replies, Facebook: /comments). */
export async function replyToComment(platform: "instagram" | "facebook", commentId: string, text: string): Promise<void> {
  await graph(`${commentId}/${platform === "instagram" ? "replies" : "comments"}`, { method: "POST", query: { message: text.slice(0, 300) } });
}

/** Name / username of someone who messaged us (best effort; Meta may withhold it). */
export async function profileOf(platform: "instagram" | "messenger", userId: string): Promise<{ name?: string; username?: string }> {
  try {
    if (platform === "instagram") { const j = await graph<any>(userId, { query: { fields: "name,username" } }); return { name: j.name, username: j.username }; }
    const j = await graph<any>(userId, { query: { fields: "first_name,last_name" } }); return { name: [j.first_name, j.last_name].filter(Boolean).join(" ") || undefined };
  } catch { return {}; }
}

/** "Check connection": who the token belongs to, and the linked Instagram account. */
export async function checkConnection(): Promise<{ page?: { id: string; name: string }; instagram?: { id: string; username?: string } | null; error?: string }> {
  try {
    const p = await graph<any>(pageId() || "me", { query: { fields: "id,name,instagram_business_account{id,username}" } });
    return { page: { id: p.id, name: p.name }, instagram: p.instagram_business_account || null };
  } catch (e: any) { return { error: e.message }; }
}
