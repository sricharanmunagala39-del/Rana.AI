export const runtime = "nodejs";
import { parseSession, unauthorized } from "@/lib/auth";
import { getClientById } from "@/lib/supabase";
import { listCartesiaPhoneNumbers, provisionCartesiaPhoneNumber } from "@/lib/cartesia";
import { getSession } from "@/lib/session";
import { forbidUnless } from "@/lib/auth";
import { filterOwned, claimResource } from "@/lib/ownership";
import { audit } from "@/lib/audit";


export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  if (!process.env.CARTESIA_API_KEY) {
    return Response.json({ error: "CARTESIA_API_KEY is not set." }, { status: 500 });
  }
  try {
    // Only this client's numbers — the Cartesia account is shared by every client.
    const numbers = await filterOwned(session.clientId, "phone_number", (await listCartesiaPhoneNumbers()) || [], (n: any) => n.number ?? null);
    return Response.json({
      numbers: numbers.map((n: any) => ({
        id: n.id,
        number: n.number,
        label: n.label ?? null,
        agentId: n.agent?.id ?? null,
        agentName: n.agent?.name ?? null,
        provider: n.provider?.type ?? "cartesia",
        createdAt: n.created_at ?? null,
      })),
    });
  } catch (err: any) {
    return Response.json({ error: err?.message || "Failed to load phone numbers" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const denied = forbidUnless(session, "admin"); if (denied) return denied;
  if (!process.env.CARTESIA_API_KEY) {
    return Response.json({ error: "CARTESIA_API_KEY is not set." }, { status: 500 });
  }
  let body: { label?: string; assignToAgent?: boolean };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid body." }, { status: 400 }); }

  const label = (body.label || "").trim();
  if (!label) return Response.json({ error: "A label is required." }, { status: 400 });

  try {
    let agentId: string | undefined;
    if (body.assignToAgent) {
      const client = await getClientById(session.clientId);
      agentId = client?.cartesia_agent_id ?? undefined;
    }
    const created = await provisionCartesiaPhoneNumber(label, agentId);
    await claimResource(session.clientId, "phone_number", created.id, created.number ?? label);
    await audit(session, "number_provisioned", { req, targetType: "phone_number", targetId: created.id, detail: { number: created.number, label } });
    return Response.json({
      ok: true,
      number: {
        id: created.id,
        number: created.number,
        label: created.label ?? label,
        agentId: created.agent?.id ?? null,
      },
    });
  } catch (err: any) {
    return Response.json({ error: err?.message || "Failed to provision a phone number" }, { status: 500 });
  }
}
