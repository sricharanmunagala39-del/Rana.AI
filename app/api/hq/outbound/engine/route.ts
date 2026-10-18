export const runtime = "nodejs";
export const maxDuration = 60;
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { audit } from "@/lib/audit";
import { engine, isId, isWaNumber, type EngineAction } from "@/lib/leadflow";

const CHANNELS = ["email", "whatsapp"];
const MODES = ["agent", "human", "closed"];

/** Validate what the browser sent into exactly one engine action (never forward the raw body). */
function parse(b: any): EngineAction | string {
  switch (b?.action) {
    case "wa_reply": {
      const text = String(b.text || "").trim();
      if (!isWaNumber(String(b.number || ""))) return "Unknown WhatsApp number.";
      if (!text) return "Type a message.";
      return { action: "wa_reply", number: b.number, text: text.slice(0, 4000) };
    }
    case "wa_mode":
      if (!isWaNumber(String(b.number || "")) || !MODES.includes(b.mode)) return "Unknown conversation or mode.";
      return { action: "wa_mode", number: b.number, mode: b.mode };
    case "approve_reply": {
      const body = String(b.body || "").trim();
      if (!isId(b.reply_id)) return "Unknown reply.";
      if (!body) return "The reply is empty.";
      return { action: "approve_reply", reply_id: Number(b.reply_id), body: body.slice(0, 10_000) };
    }
    case "dismiss_reply":
      return isId(b.reply_id) ? { action: "dismiss_reply", reply_id: Number(b.reply_id) } : "Unknown reply.";
    case "test_email": return { action: "test_email" };
    case "test_whatsapp": {
      const to = String(b.to || "").replace(/[\s-]/g, "");
      return isWaNumber(to) ? { action: "test_whatsapp", to } : "Enter the WhatsApp number to test with, with country code.";
    }
    case "go_live":
      if (!CHANNELS.includes(b.channel)) return "Pick email or WhatsApp.";
      if (b.confirm !== "GO LIVE") return "Type GO LIVE to confirm.";
      return { action: "go_live", channel: b.channel, confirm: "GO LIVE" };
    case "dry_run":
      return CHANNELS.includes(b.channel) ? { action: "dry_run", channel: b.channel } : "Pick email or WhatsApp.";
    case "tick": return { action: "tick" };
    case "sheet_sync": return { action: "sheet_sync" };
    default: return "Unknown action.";
  }
}

/** POST { action, … } → run one LeadFlow engine action. Going live is founders only; everything else Founders + Operations. */
export async function POST(req: Request) {
  const session = await getSession(req);
  const b = await req.json().catch(() => ({} as any));
  const denied = requireHq(session, b?.action === "go_live" ? "team" : "clients"); if (denied) return denied;
  const action = parse(b);
  if (typeof action === "string") return Response.json({ error: action }, { status: 400 });
  const r = await engine(action);
  if (action.action === "go_live" || action.action === "dry_run")
    await audit(session!, "leadflow_mode_changed", { req, targetType: "leadflow", targetId: action.channel, detail: { action: action.action, ok: r.ok } }).catch(() => {});
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  return Response.json({ ok: true, result: r.data });
}
