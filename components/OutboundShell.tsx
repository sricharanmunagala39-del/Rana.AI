"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";

/** RANA HQ → Outbound (LeadFlow): shared layout, tabs, pills and the engine call used by every Outbound page. */
export const field = "mt-1 w-full border border-line rounded-lg px-3 py-2 text-[13px] font-normal bg-paper";
export const btn = "border border-line rounded-lg px-3 py-2 text-[13px] font-semibold bg-raised hover:border-signal/60 disabled:opacity-50";
export const primary = "bg-signal text-on-accent rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50";
export const danger = "bg-miss text-white rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50";

const TABS = [
  { href: "/hq/outbound", label: "Overview" },
  { href: "/hq/outbound/sequence", label: "Sequence" },
  { href: "/hq/outbound/scheduled", label: "Scheduled" },
  { href: "/hq/outbound/stats", label: "Email stats" },
  { href: "/hq/outbound/whatsapp", label: "WhatsApp" },
  { href: "/hq/outbound/replies", label: "Replies" },
  { href: "/hq/outbound/settings", label: "Settings" },
];

export default function OutboundShell({ title, sub, actions, children }: { title: string; sub?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="flex min-h-screen bg-paper">
      <div className="hidden md:block"><Sidebar active="hq-outbound" /></div>
      <div className="flex-1 p-4 md:p-8 min-w-0">
        <div className="w-full max-w-[1400px] flex flex-col gap-5">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-signal"><Link href="/hq">RANA HQ</Link> · <Link href="/hq/outbound">Outbound</Link></div>
              <div className="text-[22px] font-display font-semibold">{title}</div>
              {sub && <div className="text-[13px] text-ink-soft mt-0.5">{sub}</div>}
            </div>
            {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
          </div>
          <div className="flex gap-1 overflow-x-auto border-b border-line -mt-1" data-testid="outbound-tabs">
            {TABS.map((t) => {
              const on = t.href === "/hq/outbound" ? path === t.href : path?.startsWith(t.href);
              return <Link key={t.href} href={t.href} className={`px-3 py-2 text-[13px] font-semibold whitespace-nowrap border-b-2 -mb-px ${on ? "border-signal text-signal" : "border-transparent text-ink-soft hover:text-ink"}`}>{t.label}</Link>;
            })}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function Pill({ tone = "", children, title }: { tone?: string; children: React.ReactNode; title?: string }) {
  return <span title={title} className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 whitespace-nowrap ${tone || "bg-sunken text-ink-soft"}`}>{children}</span>;
}

const STATUS_TONE: Record<string, [string, string]> = {
  active: ["bg-signal-tint text-signal", "In sequence"], replied: ["bg-violet-tint text-violet", "Replied"], demo_booked: ["bg-signal text-on-accent", "Demo booked"],
  disqualified: ["bg-sunken text-ink-soft", "Disqualified"], unsubscribed: ["bg-sunken text-ink-soft", "Unsubscribed"], bounced: ["bg-miss-tint text-miss", "Bounced"],
  stopped: ["bg-sunken text-ink-soft", "Stopped"], error: ["bg-miss-tint text-miss", "Error"],
};
export function EnrollmentPill({ status }: { status: string }) {
  const [tone, label] = STATUS_TONE[status] || ["", status];
  return <Pill tone={tone}>{label}</Pill>;
}

const MODE_TONE: Record<string, [string, string]> = { agent: ["bg-violet-tint text-violet", "Priya (AI)"], human: ["bg-hot-tint text-hot", "You"], closed: ["bg-sunken text-ink-soft", "Closed"] };
export function ModePill({ mode, agent = "Priya" }: { mode: string; agent?: string }) {
  const [tone, label] = MODE_TONE[mode] || ["", mode];
  return <Pill tone={tone}>{mode === "agent" ? `${agent} (AI)` : label}</Pill>;
}

const STAGE_TONE: Record<string, [string, string]> = {
  new: ["bg-sunken text-ink-soft", "New"], demo_booked: ["bg-signal-tint text-signal", "Demo booked"], buying: ["bg-signal text-on-accent", "Buying"],
  not_interested: ["bg-sunken text-ink-soft", "Not interested"], opted_out: ["bg-miss-tint text-miss", "Opted out"],
};
export function StagePill({ stage }: { stage: string }) {
  const [tone, label] = STAGE_TONE[stage] || ["", stage];
  return <Pill tone={tone}>{label}</Pill>;
}

export function ModeBadge({ channel, live }: { channel: string; live: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${live ? "border-signal/50 bg-signal-tint text-signal" : "border-hot/40 bg-hot-tint text-hot"}`} data-testid={`mode-${channel.toLowerCase()}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${live ? "bg-signal live-dot" : "bg-hot"}`} />{channel} · {live ? "LIVE" : "DRY RUN"}
    </span>
  );
}

export function Modal({ title, onClose, children, testid }: { title: string; onClose: () => void; children: React.ReactNode; testid?: string }) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="w-full max-w-[520px] bg-raised rounded-2xl border border-line p-6 flex flex-col gap-3 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid={testid}>
        <div className="flex items-start justify-between gap-3"><div className="text-[18px] font-display font-semibold">{title}</div><button onClick={onClose} className="text-ink-soft text-xl leading-none">×</button></div>
        {children}
      </div>
    </div>
  );
}

export function Notice({ err, msg, onClear }: { err?: string; msg?: string; onClear: () => void }) {
  if (!err && !msg) return null;
  return <div className={`text-[13px] ${err ? "text-miss" : "text-signal"}`} data-testid={err ? "outbound-error" : "outbound-msg"}>{err || msg} <button onClick={onClear} className="ml-2 opacity-70">×</button></div>;
}

/** Run one LeadFlow engine action through /api/hq/outbound/engine. Throws the engine's own error message. */
export async function runEngine(body: Record<string, unknown>): Promise<any> {
  const r = await fetch("/api/hq/outbound/engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Engine call failed (${r.status})`);
  return j.result;
}

export async function getJson(url: string): Promise<any> {
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Couldn't load (${r.status})`);
  return j;
}

export const when = (d: string | null | undefined) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");
export const dayOnly = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");
export const ago = (d: string | null | undefined) => {
  if (!d) return "never";
  const s = (Date.now() - Date.parse(d)) / 1000;
  return s < 3600 ? `${Math.max(1, Math.round(s / 60))}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
};
/** A Postgres date (YYYY-MM-DD, already an India-time day) as "Wed, 21 Oct" / "October 2026". */
const pgDate = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00+05:30`);
export const istDay = (d: string | null | undefined, year = false) => (d ? pgDate(d).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}) }) : "");
export const istMonth = (d: string | null | undefined) => (d ? pgDate(d).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", month: "long", year: "numeric" }) : "");
