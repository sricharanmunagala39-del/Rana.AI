export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq, hqCan } from "@/lib/hq";
import { sb } from "@/lib/db";
import { getSettings, saveSettings, getCampaigns, isId, EDITABLE_SETTINGS, type EditableSetting } from "@/lib/leadflow";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_OK = (v: string) => !v || /^https?:\/\/\S+$/i.test(v);

/** GET → LeadFlow settings and campaigns. */
export async function GET(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  const [settings, campaigns] = await Promise.all([getSettings(), getCampaigns().catch(() => [])]);
  return Response.json({ settings, campaigns, editable: EDITABLE_SETTINGS, canEdit: hqCan(session, "clients"), canGoLive: hqCan(session, "team") });
}

/**
 * PUT { settings: {key: value}, campaign: {id?, sender_name, sender_email, reply_to, booking_link} } → plain edits.
 * Sending mode (dry run / live) is not editable here — that goes through the engine's go_live / dry_run.
 */
export async function PUT(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "clients"); if (denied) return denied;
  const b = await req.json().catch(() => ({} as any));
  const s: Partial<Record<EditableSetting, string>> = {};
  for (const k of EDITABLE_SETTINGS) if (b.settings && k in b.settings) s[k] = String(b.settings[k] ?? "").trim().slice(0, 500);
  for (const k of ["daily_cap", "wa_cap"] as const) if (s[k] !== undefined && s[k] !== "" && !/^\d{1,5}$/.test(s[k]!)) return Response.json({ error: "Daily caps must be whole numbers." }, { status: 400 });
  for (const k of ["ramp", "wa_agent"] as const) if (s[k] !== undefined && !["on", "off"].includes(s[k]!)) return Response.json({ error: `${k} must be on or off.` }, { status: 400 });
  if (s.owner_email && !EMAIL.test(s.owner_email)) return Response.json({ error: "Owner email doesn't look right." }, { status: 400 });
  for (const k of ["wa_payment_link", "cal_url", "sheet_url"] as const) if (s[k] !== undefined && !URL_OK(s[k]!)) return Response.json({ error: `${k.replace(/_/g, " ")} must be a link starting with https://` }, { status: 400 });
  if (s.send_start !== undefined && s.send_start && !/^\d{4}-\d{2}-\d{2}/.test(s.send_start)) return Response.json({ error: "Send start must be a date (YYYY-MM-DD)." }, { status: 400 });

  const c = b.campaign;
  let campaign = null;
  if (c) {
    const patch: Record<string, string | null> = {};
    for (const k of ["sender_name", "sender_email", "reply_to", "booking_link"]) if (k in c) patch[k] = String(c[k] ?? "").trim().slice(0, 300) || null;
    if (patch.sender_email && !EMAIL.test(patch.sender_email)) return Response.json({ error: "Sender email doesn't look right." }, { status: 400 });
    if (patch.reply_to && !EMAIL.test(patch.reply_to)) return Response.json({ error: "Reply-to doesn't look right." }, { status: 400 });
    if (patch.booking_link && !URL_OK(patch.booking_link)) return Response.json({ error: "Booking link must start with https://" }, { status: 400 });
    if (c.id != null && !isId(c.id)) return Response.json({ error: "Unknown campaign." }, { status: 400 });
    if (Object.keys(patch).length) {
      // No campaign yet → create one, paused, so the engine never starts sending because of a settings save.
      campaign = c.id != null
        ? (await sb<any[]>(`/leadflow_campaigns?id=eq.${c.id}`, { method: "PATCH", body: JSON.stringify(patch) }))?.[0]
        : (await sb<any[]>(`/leadflow_campaigns`, { method: "POST", body: JSON.stringify({ name: "LeadFlow outbound", status: "paused", ...patch }) }))?.[0];
    }
  }
  await saveSettings(s);
  return Response.json({ ok: true, campaign });
}
