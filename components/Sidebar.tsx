import Link from "next/link";

type NavKey = "overview" | "outbound" | "inbound";

const items: { key: NavKey; label: string; href: string; icon: React.ReactNode }[] = [
  {
    key: "overview",
    label: "Overview",
    href: "/",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    key: "outbound",
    label: "Outbound",
    href: "/outbound",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 17L17 7" />
        <path d="M8 7h9v9" />
      </svg>
    ),
  },
  {
    key: "inbound",
    label: "Inbound",
    href: "/inbound",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 7L7 17" />
        <path d="M16 17H7V8" />
      </svg>
    ),
  },
];

export default function Sidebar({ active }: { active: NavKey }) {
  return (
    <div className="w-[232px] shrink-0 bg-raised border-r border-line box-border p-5 flex flex-col gap-8 h-screen sticky top-0">
      <div className="flex items-center gap-2.5 px-1">
        <div className="w-[30px] h-[30px] rounded-[7px] bg-ink flex items-center justify-center">
          <span className="font-display text-white text-[15px] font-bold">R</span>
        </div>
        <span className="font-display text-[17px] font-semibold tracking-tight">RANA AI</span>
      </div>

      <nav className="flex flex-col gap-0.5">
        {items.map((item) => {
          const isActive = item.key === active;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`flex items-center gap-[11px] px-3 py-[9px] rounded-lg text-sm ${
                isActive
                  ? "bg-signal-tint text-signal font-semibold"
                  : "text-ink-soft font-medium hover:bg-paper"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto p-3 rounded-[10px] border border-line flex flex-col gap-0.5">
        <span className="text-[11px] text-ink-soft">Workspace</span>
        <span className="text-sm font-semibold">DBMCI · Hyderabad</span>
      </div>
    </div>
  );
}
