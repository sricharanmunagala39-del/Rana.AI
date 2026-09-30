// "Where your leads go": lead-alert channels (built in) and CRMs / apps (through the webhook, Zapier or Make).
// Brand logos live in /public/integrations/<key>.svg: Slack from Slack's own media kit (slack.com/media-kit);
// WhatsApp, HubSpot, Zoho, Google Sheets, Zapier and Make from the Simple Icons set (each traced from the brand's
// official assets, in the brand colour). Salesforce restricts logo use to partners, so it stays a name chip.
type Item = { key: string; name: string; color: string };

export const ALERT_CHANNELS: Item[] = [
  { key: "whatsapp", name: "WhatsApp", color: "#25D366" },
  { key: "slack", name: "Slack", color: "#E01E5A" },
  { key: "email", name: "Email", color: "#8E96A7" },
  { key: "webhook", name: "Webhook", color: "#2DE1C2" },
];
export const CRM_APPS: Item[] = [
  { key: "hubspot", name: "HubSpot", color: "#FF7A59" },
  { key: "salesforce", name: "Salesforce", color: "#00A1E0" },
  { key: "zoho", name: "Zoho CRM", color: "#E42527" },
  { key: "sheets", name: "Google Sheets", color: "#0F9D58" },
  { key: "zapier", name: "Zapier", color: "#FF4F00" },
  { key: "make", name: "Make", color: "#9B5CFF" },
];
/** Keys that have an official logo file in /public/integrations. */
const LOGO_FILES: string[] = ["whatsapp", "slack", "hubspot", "zoho", "sheets", "zapier", "make"];

function Chip({ it }: { it: Item }) {
  const logo = LOGO_FILES.includes(it.key);
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.03] pl-1.5 pr-3.5 py-1.5 text-[13.5px] font-medium" data-testid={"integration-" + it.key}>
      {logo
        ? <span className="w-6 h-6 rounded-md bg-white grid place-items-center shrink-0" aria-hidden><img src={"/integrations/" + it.key + ".svg"} alt="" width={16} height={16} className="w-4 h-4 object-contain" /></span>
        : it.key === "email"
          ? <span className="w-6 h-6 rounded-md bg-white/10 grid place-items-center shrink-0 text-ink" aria-hidden><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg></span>
          : it.key === "webhook"
            ? <span className="w-6 h-6 rounded-md bg-white/10 grid place-items-center shrink-0 text-signal" aria-hidden><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg></span>
            : <span className="w-6 h-6 rounded-md grid place-items-center shrink-0" style={{ background: it.color }} aria-hidden><span className="text-[11px] font-bold text-white">{it.name[0]}</span></span>}
      {it.name}
    </span>
  );
}

export default function Integrations({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "" : "card p-6 sm:p-8"} data-testid="integrations">
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-signal">Lead alerts · built in</div>
          <p className="text-ink-soft text-[14px] mt-2">The moment a call ends, hot leads land where your team already works — with the summary, score and recording.</p>
          <div className="flex flex-wrap gap-2 mt-4">{ALERT_CHANNELS.map((it) => <Chip key={it.key} it={it} />)}</div>
        </div>
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-signal">Your CRM & apps · via webhook</div>
          <p className="text-ink-soft text-[14px] mt-2">Send every lead to your CRM or sheet through RANA&apos;s webhook, or connect in minutes with Zapier or Make.</p>
          <div className="flex flex-wrap gap-2 mt-4">{CRM_APPS.map((it) => <Chip key={it.key} it={it} />)}</div>
        </div>
      </div>
    </div>
  );
}
