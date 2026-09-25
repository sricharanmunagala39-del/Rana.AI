export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { unauthorized, forbidUnless } from "@/lib/auth";
import { getNumber, setDefault, release } from "@/lib/numbers";
import { audit } from "@/lib/audit";

/** PATCH { action: "default" | "release" | "cancel" } — use this number for calls, stop renting it, or drop a request. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const denied = forbidUnless(session, "admin"); if (denied) return denied;
  const row = await getNumber(params.id);
  if (!row || row.client_id !== session.clientId) return Response.json({ error: "Number not found" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  if (b.action === "default") {
    if (row.status !== "active") return Response.json({ error: "Only a live number can be used for calls." }, { status: 400 });
    await setDefault(row);
    await audit(session, "number_default", { req, targetType: "phone_number", targetId: row.id, detail: { number: row.number } }).catch(() => {});
    return Response.json({ ok: true });
  }
  if (b.action === "release" || b.action === "cancel") {
    if (["released", "expired"].includes(row.status)) return Response.json({ ok: true });
    await release(row);
    await audit(session, b.action === "cancel" ? "number_request_cancelled" : "number_released", { req, targetType: "phone_number", targetId: row.id, detail: { number: row.number } }).catch(() => {});
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Unknown action" }, { status: 400 });
}
