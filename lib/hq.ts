// RANA HQ: the founder's console over every client workspace. Access = a signed-in person whose email is in
// RANA_HQ_EMAILS (comma-separated, set in Vercel). Nobody can grant HQ from inside the app.
import type { Session } from "./auth";

export function hqEmails(): string[] {
  return String(process.env.RANA_HQ_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}
export function isHqEmail(email: string | null | undefined): boolean {
  return !!email && hqEmails().includes(String(email).toLowerCase());
}
/** HQ session = an HQ email that is NOT currently inside a client's workspace. */
export function requireHq(s: Session | null): Response | null {
  if (!s) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!isHqEmail(s.email)) return Response.json({ error: "RANA HQ only." }, { status: 403 });
  if (s.hqFrom) return Response.json({ error: "You're inside a client's workspace. Go back to HQ first." }, { status: 409 });
  return null;
}
