// @ts-nocheck
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";

type NavKey = "overview" | "scripts" | "outbound" | "inbound" | "agent";
type Client = { id: string; name: string; industry: string; sarvam_app_id: string | null } | null;

const items = [
  { key: "overview", label: "Overview", href: "/", icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
  { key: "scripts", label: "Scripts", href: "/scripts", icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> },
  { key: "agent", label: "Test Agent", href: "/agent", icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4"/></svg> },
  { key: "outbound", label: "Outbound", href: "/outbound", icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7"/><path d="M8 7h9v9"/></svg> },
  { key: "inbound", label: "Inbound", href: "/inbound", icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 7L7 17"/><path d="M16 17H7V8"/></svg> },
];

export default function Sidebar({ active, client }: { active: string; client?: Client }) {
  const router = useRouter();
  async function handleLogout() {
    await fetch("/api/auth/me", { method: "POST" });
    router.push("/login");
  }
  return (
    <div className="w-[220px] shrink-0 bg-raised border-r border-line box-border p-5 flex flex-col gap-8 h-screen sticky top-0">
      <div className="flex items-center gap-2.5 px-1">
        <div className="w-[30px] h-[30px] rounded-[7px] bg-signal flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.95.36 1.87.68 2.75a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.33-1.34a2 2 0 0 1 2.11-.45c.88.32 1.8.55 2.75.68A2 2 0 0 1 22 16.92z"/></svg>
        </div>
        <span className="font-display text-[17px] font-semibold tracking-tight">RANA AI</span>
      </div>
      <nav className="flex flex-col gap-0.5">
        {items.map((item) => (
          <Link key={item.key} href={item.href} className={`flex items-center gap-[11px] px-3 py-[9px] rounded-lg text-sm ${item.key === active ? "bg-signal-tint text-signal font-semibold" : "text-ink-soft font-medium hover:bg-paper"}`}>
            {item.icon}{item.label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto p-3 rounded-[10px] border border-line flex flex-col gap-1">
        <span className="text-[11px] text-ink-soft">Logged in as</span>
        <span className="text-sm font-semibold truncate">{client?.name ?? "RANA AI"}</span>
        {client?.industry && <span className="text-[11px] text-ink-soft capitalize">{client.industry}</span>}
        <button onClick={handleLogout} className="text-[11px] text-ink-soft hover:text-signal mt-1 text-left">Sign out</button>
      </div>
    </div>
  );
}
