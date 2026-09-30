// "Where your leads go": lead-alert channels (built in) and CRMs / apps (through the webhook, Zapier or Make).
// Official brand logo files go in /public/integrations/<key>.svg — list the key in LOGO_FILES once a file is added;
// until then each brand shows as a labelled chip in its brand colour.
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
const LOGO_FILES: string[] = [];

function Chip({ it }: { it: Item }) {
  const logo = LOGO_FILES.includes(it.key);
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.03] px-3.5 py-2 text-[13.5px] font-medium" data-testid={"integration-" + it.key}>
      {logo
        ? <img src={"/integrations/" + it.key + ".svg"} alt="" width={18} height={18} className="w-[18px] h-[18px] object-contain" />
        : <span className="w-2.5 h-2.5 rounded-full" style={{ background: it.color, boxShadow: "0 0 10px " + it.color }} aria-hidden />}
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
