export const runtime = "nodejs";
import { parseSession, unauthorized } from "@/lib/auth";
import { getClientById } from "@/lib/supabase";
import { createTwilioProvider, importTwilioPhoneNumber, toE164India, type TwilioRegion } from "@/lib/cartesia";

const REGIONS: TwilioRegion[] = ["us1", "ie1", "au1"];

/**
 * One call does both steps:
 *  1. (optional) register the Twilio account with Cartesia as a provider — only when apiKeySid/apiKeySecret are sent.
 *     If the provider already exists Cartesia rejects the duplicate; we treat that as fine and carry on.
 *  2. import the number (must already be bought in that Twilio account) by account_sid + region.
 * The Twilio secret is forwarded to Cartesia and never stored by us.
 */
export async function POST(req: Request) {
  const session = parseSession(req);
  if (!session) return unauthorized();
  if (!process.env.CARTESIA_API_KEY) {
    return Response.json({ error: "CARTESIA_API_KEY is not set." }, { status: 500 });
  }
  let body: {
    accountSid?: string; apiKeySid?: string; apiKeySecret?: string; region?: string;
    number?: string; label?: string; assignToAgent?: boolean;
  };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid body." }, { status: 400 }); }

  const accountSid = (body.accountSid || "").trim();
  const apiKeySid = (body.apiKeySid || "").trim();
  const apiKeySecret = (body.apiKeySecret || "").trim();
  const region = (REGIONS.includes(body.region as TwilioRegion) ? body.region : "us1") as TwilioRegion;
  const label = (body.label || "").trim();
  const number = toE164India(body.number || "");

  if (!/^AC[0-9a-fA-F]{32}$/.test(accountSid)) return Response.json({ error: "Account SID should start with AC and be 34 characters." }, { status: 400 });
  if (!number) return Response.json({ error: "That phone number doesn't look right. Use the full number, e.g. +91 40 1234 5678." }, { status: 400 });
  if (!label) return Response.json({ error: "A label is required." }, { status: 400 });
  if ((apiKeySid && !apiKeySecret) || (!apiKeySid && apiKeySecret)) {
    return Response.json({ error: "Send both the API Key SID and its Secret, or neither (if this Twilio account is already connected)." }, { status: 400 });
  }
  if (apiKeySid && !/^SK[0-9a-fA-F]{32}$/.test(apiKeySid)) {
    return Response.json({ error: "API Key SID should start with SK. Create a Standard API key in Twilio (not the auth token)." }, { status: 400 });
  }

  let providerNote: string | null = null;
  if (apiKeySid) {
    try {
      await createTwilioProvider({ accountSid, apiKeySid, apiKeySecret, region });
      providerNote = "Twilio account connected.";
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (/409|already exists|duplicate/i.test(msg)) {
        providerNote = "Twilio account was already connected — kept the existing connection.";
      } else {
        return Response.json({ error: `Couldn't connect the Twilio account: ${msg}` }, { status: 502 });
      }
    }
  }

  try {
    let agentId: string | undefined;
    if (body.assignToAgent) {
      const client = await getClientById(session.clientId);
      agentId = client?.cartesia_agent_id ?? undefined;
    }
    const created = await importTwilioPhoneNumber({ label, number, accountSid, region, agentId });
    return Response.json({
      ok: true,
      providerNote,
      number: { id: created.id, number: created.number ?? number, label: created.label ?? label, agentId: created.agent?.id ?? null },
    });
  } catch (err: any) {
    const msg = String(err?.message || "");
    const hint = /provider|not found|404/i.test(msg)
      ? " — if this Twilio account isn't connected yet, fill in the API Key SID and Secret too."
      : "";
    return Response.json({ error: `Couldn't import the number: ${msg}${hint}`, providerNote }, { status: 502 });
  }
}
