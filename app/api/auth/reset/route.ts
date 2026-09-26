export const runtime = "nodejs";
import { checkReset, completeReset } from "@/lib/passwordReset";

/** GET ?token= — is this reset link still valid? (shows a masked email on the page) */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  return Response.json(await checkReset(token));
}

/** POST { token, password } — set the new password. Signs the person out everywhere else. */
export async function POST(req: Request) {
  const { token, password } = await req.json().catch(() => ({}));
  try {
    const r = await completeReset(String(token || ""), String(password || ""), req);
    if (!r.ok) return Response.json({ error: r.error, expired: !!r.expired }, { status: 400 });
    return Response.json({ ok: true, email: r.email });
  } catch (e: any) {
    console.error("[reset]", e?.message);
    return Response.json({ error: "Couldn't change the password just now. Please try again." }, { status: 500 });
  }
}
