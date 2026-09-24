export const runtime = "nodejs";
import { GET as detail } from "../route";

/** CSV of every number in the campaign with its outcome — for the sales team or the client. */
export async function GET(req: Request, ctx: { params: { id: string } }) {
  const res = await detail(req, ctx);
  if (!res.ok) return res;
  const data = await res.json();
  const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ["Name", "Phone", "Dial status", "Lifted", "Talk time (s)", "Lead", "Why", "Follow-up", "Summary", "Called at"];
  const lines = [head.join(",")];
  for (const r of data.rows) {
    lines.push([r.name, r.phone, r.dialStatus, r.call ? (r.call.lifted ? "Yes" : "No") : "", r.call?.talkSeconds ?? "", r.call?.lead ?? "", r.call?.reason ?? "", r.call?.followUp ? "Yes" : "", r.call?.summary ?? "", r.call?.at ?? ""].map(esc).join(","));
  }
  const file = `${String(data.campaign.name).replace(/[^\w-]+/g, "_")}.csv`;
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}"` } });
}
