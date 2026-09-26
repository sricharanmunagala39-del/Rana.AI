// @ts-nocheck
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Client = {
  id: string; name: string; industry: string; sarvam_app_id: string | null;
  hq?: boolean; actingAsHq?: boolean; pending?: boolean; hqSession?: { readOnly: boolean; expiresAt: number | null; reason: string | null } | null;
  plan?: { key: string; name: string; status: string; trialDaysLeft: number | null; minutesUsed: number; minutesIncluded: number } | null;
} | null;

const ICONS = {
  grid: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  people: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  mic: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4"/></svg>,
  bolt: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  megaphone: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11v3a1 1 0 0 0 1 1h2l4 5V5L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 8a4 4 0 0 1 0 8"/><path d="M18 5a8 8 0 0 1 0 14"/></svg>,
  down: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 7L7 17"/><path d="M16 17H7V8"/></svg>,
  table: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>,
  chat: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  book: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  phone: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.95.36 1.87.68 2.75a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.33-1.34a2 2 0 0 1 2.11-.45c.88.32 1.8.55 2.75.68A2 2 0 0 1 22 16.92z"/></svg>,
  bars: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>,
  card: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  gear: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  doc: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  plusCircle: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
};

const GROUPS: { label: string; items: { key: string; label: string; href: string; icon: keyof typeof ICONS }[] }[] = [
  {
    label: "Overview",
    items: [
      { key: "overview", label: "Dashboard", href: "/", icon: "grid" },
      { key: "employees", label: "My Employees", href: "/employees", icon: "people" },
      { key: "create-agent", label: "Create Your Own Agent", href: "/agents/new", icon: "plusCircle" },
      { key: "talk", label: "Talk to an employee", href: "/talk", icon: "mic" },
    ],
  },
  {
    label: "Calling",
    items: [
      { key: "instant-leads", label: "Instant Leads", href: "/coming-soon?feature=Instant+Leads", icon: "bolt" },
      { key: "outbound", label: "Bulk Campaigns", href: "/outbound", icon: "megaphone" },
      { key: "inbound", label: "Inbound Calls", href: "/inbound", icon: "down" },
    ],
  },
  {
    label: "Results & Setup",
    items: [
      { key: "leads-results", label: "Leads & Reports", href: "/reports", icon: "table" },
      { key: "alerts", label: "Lead alerts", href: "/integrations", icon: "bolt" },
      { key: "conversations", label: "All Conversations", href: "/coming-soon?feature=All+Conversations", icon: "chat" },
      { key: "phone-numbers", label: "Phone Numbers", href: "/phone-numbers", icon: "phone" },
      { key: "performance", label: "Performance", href: "/coming-soon?feature=Performance", icon: "bars" },
      { key: "billing", label: "Plan & usage", href: "/billing", icon: "card" },
      { key: "settings", label: "Settings", href: "/settings", icon: "gear" },
    ],
  },
];

export default function Sidebar({ active, client: clientProp }: { active: string; client?: Client }) {
  const router = useRouter();
  const [client, setClient] = useState<Client>(clientProp ?? null);
  useEffect(() => {
    if (clientProp) { setClient(clientProp); return; }
    fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then((c) => c && setClient(c)).catch(() => {});
  }, [clientProp]);
  async function backToHq() {
    const r = await fetch("/api/hq/return", { method: "POST" });
    if (r.ok) window.location.href = "/hq";
  }
  const p = client?.plan;
  const low = p && (p.status === "suspended" || (p.trialDaysLeft !== null && p.trialDaysLeft <= 3) || p.minutesUsed >= p.minutesIncluded * 0.8);
  async function handleLogout() {
    await fetch("/api/auth/me", { method: "POST" });
    router.push("/login");
  }
  return (
    <div className="w-[236px] shrink-0 glass border-r border-line box-border px-4 py-5 flex flex-col gap-6 h-screen sticky top-0 overflow-y-auto z-30">
      <Link href="/" className="flex items-center gap-2.5 px-1.5 group">
        <Logo />
        <span className="font-display text-[17px] font-semibold tracking-tight">RANA<span className="text-gradient"> AI</span></span>
      </Link>

      {client?.actingAsHq && (
        <div className="rounded-xl bg-hot-tint border border-hot/30 px-3 py-2.5 text-[11.5px] leading-snug" data-testid="hq-acting">
          <div className="font-semibold text-hot flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-hot" />RANA HQ inside this workspace</div>
          <div className="text-ink-soft mt-0.5">{client.hqSession?.readOnly ? "Read-only visit — nothing can be changed." : "Changes you make are logged in their activity."}{client.hqSession?.expiresAt ? ` Ends ${new Date(client.hqSession.expiresAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}.` : ""}</div>
          <button onClick={backToHq} className="mt-1.5 font-semibold text-signal">← Back to HQ</button>
        </div>
      )}
      {client?.hq && (
        <div className="flex flex-col gap-0.5">
          <div className="px-3 pb-1 text-[10px] font-mono uppercase tracking-[0.14em] text-ink-soft/60">// Command</div>
          <Link href="/hq" className={`relative flex items-center gap-2.5 px-3 py-[9px] rounded-lg text-[13.5px] font-semibold ${active === "hq" ? "bg-signal-tint text-signal shadow-glow" : "text-ink hover:bg-raised"}`} data-testid="hq-link">
            <span className="w-2 h-2 rounded-full bg-signal live-dot" /> RANA HQ · all clients
          </Link>
          <Link href="/hq/money" className="flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] font-medium text-ink-soft hover:bg-raised hover:text-ink" data-testid="hq-money-nav">
            <span className="w-2 text-center text-[11px]">₹</span> Money &amp; Sarvam credits
          </Link>
          <Link href="/hq/numbers" className="flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] font-medium text-ink-soft hover:bg-raised hover:text-ink" data-testid="hq-numbers-nav">
            <span className="w-2 text-center text-[11px]">☎</span> Phone numbers
          </Link>
          <Link href="/hq/team" className="flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] font-medium text-ink-soft hover:bg-raised hover:text-ink" data-testid="hq-team-nav">
            <span className="w-2 text-center text-[11px]">◆</span> Team &amp; security
          </Link>
          <Link href="/hq/sign-ins" className="flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] font-medium text-ink-soft hover:bg-raised hover:text-ink" data-testid="hq-signins-nav">
            <span className="w-2 text-center text-[11px]">↪</span> Sign-ins
          </Link>
          <Link href="/hq/demos" className="flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] font-medium text-ink-soft hover:bg-raised hover:text-ink" data-testid="hq-demos-nav">
            <span className="w-2 text-center text-[11px]">★</span> Demo requests
          </Link>
        </div>
      )}
      {client?.pending && (
        <div className="rounded-xl bg-hot-tint border border-hot/30 px-3 py-2.5 text-[11.5px] leading-snug" data-testid="pending-banner">
          <div className="font-semibold text-hot">Waiting for approval</div>
          <div className="text-ink-soft">Build your AI employee now — calling switches on when RANA starts your trial.</div>
        </div>
      )}

      <nav className="flex flex-col gap-5">
        {GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <div className="px-3 pb-1 text-[10px] font-mono uppercase tracking-[0.14em] text-ink-soft/60">// {group.label}</div>
            {group.items.map((item) => {
              const on = item.key === active;
              return (
                <Link key={item.key} href={item.href}
                  className={`relative flex items-center gap-[11px] px-3 py-[8px] rounded-lg text-[13.5px] ${on ? "bg-signal-tint text-signal font-semibold" : "text-ink-soft font-medium hover:bg-raised hover:text-ink"}`}>
                  {on && <span className="absolute -left-4 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-signal shadow-glow" />}
                  <span className={on ? "text-signal" : "opacity-80"}>{ICONS[item.icon]}</span>{item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-2">
        <ThemeToggle />
        <div className="p-3 rounded-xl border border-line bg-raised flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-tint text-violet font-display font-bold flex items-center justify-center text-[13px] shrink-0">{(client?.name ?? "R").charAt(0).toUpperCase()}</div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold truncate">{client?.name ?? "RANA AI"}</div>
              {client?.industry && <div className="text-[11px] text-ink-soft capitalize truncate">{client.industry}</div>}
            </div>
          </div>
          {p && (
            <Link href="/billing" data-testid="plan-chip" className={`mt-1.5 rounded-lg px-2.5 py-2 text-[11px] leading-snug border ${low ? "border-miss/30 bg-miss-tint text-miss" : "border-line bg-sunken text-ink-soft"}`}>
              <div className="flex justify-between"><span className="font-semibold text-ink">{p.status === "suspended" ? "Paused" : p.name}</span>
              <span>{p.trialDaysLeft !== null && p.status !== "suspended" ? ` · ${p.trialDaysLeft} day${p.trialDaysLeft === 1 ? "" : "s"} left` : ""}</span></div>
              <div className="h-1 rounded-full bg-line mt-1.5 overflow-hidden"><div className={`h-full rounded-full ${low ? "bg-miss" : "bg-gradient-to-r from-signal to-violet"}`} style={{ width: `${Math.min(100, (p.minutesUsed / Math.max(1, p.minutesIncluded)) * 100)}%` }} /></div>
              <div className="mt-1 font-mono">{Math.round(p.minutesUsed)} / {p.minutesIncluded.toLocaleString("en-IN")} min used</div>
            </Link>
          )}
          <button onClick={handleLogout} className="text-[11.5px] text-ink-soft hover:text-signal mt-1 text-left">Sign out</button>
        </div>
      </div>
    </div>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="relative inline-flex items-center justify-center shrink-0 rounded-[9px] brand-mark" style={{ width: size, height: size }}>
      <span className="absolute inset-[2px] rounded-[7px] bg-paper flex items-center justify-center">
        <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="6.5" stroke="rgb(var(--c-signal))" strokeWidth="2.4" />
          <circle cx="12" cy="12" r="2.2" fill="rgb(var(--c-violet))" />
        </svg>
      </span>
    </span>
  );
}

export function ThemeToggle() {
  const [light, setLight] = useState(false);
  useEffect(() => { setLight(document.documentElement.getAttribute("data-theme") === "light"); }, []);
  function flip() {
    const next = !light; setLight(next);
    if (next) document.documentElement.setAttribute("data-theme", "light"); else document.documentElement.removeAttribute("data-theme");
    try { localStorage.setItem("rana_theme", next ? "light" : "dark"); } catch {}
  }
  return (
    <button onClick={flip} data-testid="theme-toggle" className="flex items-center justify-between rounded-xl border border-line bg-raised px-3 py-2 text-[12px] text-ink-soft hover:text-ink">
      <span className="flex items-center gap-2">{light ? "☀︎ Day" : "☾ Night"} mode</span>
      <span className={`w-8 h-[18px] rounded-full p-[2px] flex ${light ? "bg-line justify-start" : "bg-signal/30 justify-end"}`}><span className={`w-[14px] h-[14px] rounded-full ${light ? "bg-ink-soft" : "bg-signal"}`} /></span>
    </button>
  );
}
