export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { sendEmail, emailHtml, emailConfigured } from "@/lib/notify";

/** POST → sends a test email to the signed-in HQ person, so anyone can check email is working after a key change. */
export async function POST(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  if (!emailConfigured()) return Response.json({ ok: false, error: "RESEND_API_KEY isn't set in Vercel." }, { status: 400 });
  const to = session!.email;
  const r = await sendEmail({
    to, kind: "hq_test", subject: "RANA email test — it works",
    html: emailHtml({ title: "Email is working", lines: [`This test was sent from ranaai.in at ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}.`, "Welcome emails, approvals, call-transfer alerts and HQ alerts will now reach people."] }),
  });
  return Response.json({ ok: r.ok, to, error: r.ok ? null : r.error }, { status: r.ok ? 200 : 502 });
}
