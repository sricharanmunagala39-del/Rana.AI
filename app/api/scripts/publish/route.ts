// @ts-nocheck
export const runtime = "nodejs";
import { getScriptById, getClientById, setActiveScript } from "@/lib/supabase";
import { parseSession } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { forbidUnless } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { claimResource } from "@/lib/ownership";
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const denied = forbidUnless(session, "admin"); if (denied) return denied;
  try {
    const { scriptId } = await req.json();
    if (!scriptId) return Response.json({ error: "scriptId required" }, { status: 400 });
    const script = await getScriptById(scriptId);
    if (!script || script.client_id !== session.clientId) return Response.json({ error: "Script not found" }, { status: 404 });
    const client = await getClientById(session.clientId);
    if (!client) return Response.json({ error: "Client not found" }, { status: 404 });
    // Retired: this used to overwrite the client's own Sarvam agent. Publishing now happens per employee
    // (/api/scripts/[id]/publish), which never touches agents the client built themselves.
    return Response.json({ error: "Publish from My Employees → Edit → Review & publish." }, { status: 410 });
    const sarvamApiKey = process.env.SARVAM_API_KEY;
    const appId = client.sarvam_app_id;
    if (!sarvamApiKey || !appId) {
      await setActiveScript(session.clientId, scriptId);
      return Response.json({ ok: true, warning: "Script marked active in RANA but Sarvam agent not configured." });
    }
    const factsText = script.facts.length > 0 ? "\n\nKey Facts:\n" + script.facts.map((f: string) => `- ${f}`).join("\n") : "";
    const sarvamRes = await fetch(`https://indus.sarvam.ai/samvaad/build/update-agent/${appId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-subscription-key": sarvamApiKey },
      body: JSON.stringify({ greeting: script.greeting, system_prompt: script.instructions + factsText, voice: script.speaker, language: script.starting_language }),
    });
    await setActiveScript(session.clientId, scriptId);
    if (!sarvamRes.ok) {
      return Response.json({ ok: true, warning: `Script marked active. Sarvam returned ${sarvamRes.status}.` });
    }
    return Response.json({ ok: true, message: "Script published and live on your voice agent." });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
