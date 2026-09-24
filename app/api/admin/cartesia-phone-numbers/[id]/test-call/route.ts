export const runtime = "nodejs";
import { parseSession, unauthorized } from "@/lib/auth";
import { getClientById } from "@/lib/supabase";
import { placeCartesiaOutboundCalls, toE164India } from "@/lib/cartesia";
import { getSession } from "@/lib/session";
import { forbidUnless } from "@/lib/auth";
import { ownsResource } from "@/lib/ownership";
import { audit } from "@/lib/audit";


/** Rings one number from this phone number using the logged-in client's published Cartesia agent. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const denied = forbidUnless(session, "manager"); if (denied) return denied;
  if (!(await ownsResource(session.clientId, "phone_number", params.id))) return Response.json({ error: "Phone number not found" }, { status: 404 });
  if (!process.env.CARTESIA_API_KEY) {
    return Response.json({ error: "CARTESIA_API_KEY is not set." }, { status: 500 });
  }
  let body: { to?: string; name?: string };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid body." }, { status: 400 }); }

  const to = toE164India(body.to || "");
  if (!to) return Response.json({ error: "Enter a valid number to call." }, { status: 400 });

  const client = await getClientById(session.clientId);
  const agentId = client?.cartesia_agent_id;
  if (!agentId) return Response.json({ error: "No published Cartesia agent yet — publish one from the Agent page first." }, { status: 400 });

  try {
    const result = await placeCartesiaOutboundCalls({
      agentId,
      fromNumberId: params.id,
      calls: [{ toNumber: to, variables: body.name ? { name: String(body.name).slice(0, 80) } : undefined }],
      ringingTimeoutSeconds: 45,
    });
    await audit(session, "number_test_call", { req, targetType: "phone_number", targetId: params.id, detail: { to } });
    return Response.json({ ok: true, to, result });
  } catch (err: any) {
    return Response.json({ error: err?.message || "Failed to place the call" }, { status: 502 });
  }
}
