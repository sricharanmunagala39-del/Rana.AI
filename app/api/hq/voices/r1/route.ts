export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { sb } from "@/lib/db";
import { setSetting } from "@/lib/platformSettings";
import { SARVAM_VOICES, VOICE_AGENTS_KEY, voiceAgents, voiceFor, parseAgentRef } from "@/lib/sarvamAgent";
import { R1_CATALOG, findR1Voice, r1PreviewSpeaker } from "@/lib/sarvamVoiceCatalog";

/** GET → every R1 voice with its connected agent and how many employees picked it (so HQ knows which to connect first). */
export async function GET(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  const agents = await voiceAgents();
  const wanted: Record<string, number> = {};
  const rows = (await sb<any[]>(`/scripts?select=voice_name&engine=eq.sarvam&voice_name=not.is.null&limit=5000`).catch(() => [])) || [];
  for (const r of rows) { const id = voiceFor(r.voice_name).catalogId; if (id) wanted[id] = (wanted[id] || 0) + 1; }
  const builtin = new Map(SARVAM_VOICES.map((v) => [v.catalogId, v]));
  return Response.json({
    voices: R1_CATALOG.map((v) => {
      const b = builtin.get(v.id);
      return { ...v, sample: !!r1PreviewSpeaker(v), builtin: !!b, agent: agents[v.id] || (b ? `${b.appId || "RANA Runtime (main)"}${b.appId ? `@${b.appVersion}` : ""}` : ""), live: !!b || !!parseAgentRef(agents[v.id]), wanted: wanted[v.id] || 0 };
    }),
  });
}

/** PATCH { id, agent } → connect (or with agent "" disconnect) the engine agent that speaks this voice, e.g. "RANA-Runtim-1a2b3c4d-5e6f@1". */
export async function PATCH(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "clients"); if (denied) return denied;
  const b = await req.json().catch(() => ({} as any));
  const v = findR1Voice(String(b.id || ""));
  if (!v) return Response.json({ error: "Unknown voice." }, { status: 400 });
@@ENDEDIT
@@EDIT app/talk/page.tsx
          setHasInbound(inb); setHasOutbound(outb); setTestDir(inb && !outb ? "inbound" : "outbound");@@WITH
          // An employee with an inbound script is tested as an incoming call by default (that is what the business number gets).
          setHasInbound(inb); setHasOutbound(outb); setTestDir(inb ? "inbound" : "outbound");
  const raw = String(b.agent || "").trim().replace(/^sarvam:/, "");
  const ref = raw ? parseAgentRef(raw) : null;
  if (raw && !ref) return Response.json({ error: "That doesn't look like an agent ID. Copy it from the agent's address: …/update-agent/RANA-Runtim-xxxxxxxx-xxxx" }, { status: 400 });
  const next = { ...(await voiceAgents()) };
  if (ref) next[v.id] = `${ref.appId}@${ref.appVersion}`; else delete next[v.id];
  await setSetting(VOICE_AGENTS_KEY, next, session!.email);
  return Response.json({ ok: true, id: v.id, agent: next[v.id] || "", live: !!ref });
}
