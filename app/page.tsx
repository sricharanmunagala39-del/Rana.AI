import Sidebar from "@/components/Sidebar";
import StatusPill, { PillTone } from "@/components/StatusPill";

const stats = [
  { label: "Calls today", value: "47", delta: "+12 vs yesterday", deltaColor: "text-signal" },
  { label: "Connected", value: "29", delta: "62% connect rate", deltaColor: "text-ink-soft" },
  { label: "Hot leads", value: "6", delta: "+2 this hour", deltaColor: "text-hot" },
  { label: "Avg call length", value: "2m 14s", delta: "steady", deltaColor: "text-ink-soft" },
];

const activity: {
  name: string;
  phone: string;
  detail: string;
  duration: string;
  status: string;
  tone: PillTone;
  direction: "in" | "out";
  time: string;
}[] = [
  { name: "Dr. Nikhil Reddy", phone: "+91 90xxxxx214", detail: "NEET PG · 1st attempt", duration: "3m 02s", status: "Session booked", tone: "signal", direction: "in", time: "2m ago" },
  { name: "Dr. Sowmya K.", phone: "+91 63xxxxx881", detail: "Outbound · Sept reactivation", duration: "1m 48s", status: "Hot", tone: "hot", direction: "out", time: "9m ago" },
  { name: "Unknown caller", phone: "+91 88xxxxx045", detail: "Vizag ASC · fee query", duration: "0m 41s", status: "Warm", tone: "warm", direction: "in", time: "14m ago" },
  { name: "Dr. Abhiram Rao", phone: "+91 70xxxxx320", detail: "Outbound · Sept reactivation", duration: "0m 12s", status: "No answer", tone: "miss", direction: "out", time: "18m ago" },
  { name: "Dr. Meghana Iyer", phone: "+91 99xxxxx762", detail: "Vijayawada INDRA · trial class", duration: "2m 37s", status: "Trial activated", tone: "signal", direction: "in", time: "26m ago" },
  { name: "Dr. Karthik Naidu", phone: "+91 81xxxxx509", detail: "Outbound · Sept reactivation", duration: "4m 05s", status: "Hot", tone: "hot", direction: "out", time: "41m ago" },
];

function DirectionIcon({ direction }: { direction: "in" | "out" }) {
  const path = direction === "in" ? "M17 7L7 17 M16 17H7V8" : "M7 17L17 7 M8 7h9v9";
  const classes = direction === "in" ? "bg-signal-tint text-signal" : "bg-warm-tint text-warm";
  return (
    <div className={`w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0 ${classes}`}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </div>
  );
}

export default function OverviewPage() {
  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="overview" />

      <main className="flex-1 box-border p-11 flex flex-col gap-7">
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="font-display text-[26px] font-semibold m-0">Overview</h1>
            <div className="text-[13px] text-ink-soft mt-1">Thursday, 17 September</div>
          </div>
          <div className="text-[13px] text-ink-soft border border-line rounded-lg px-3.5 py-1.5 bg-raised">
            Today
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-raised border border-line rounded-[10px] px-5 py-4.5 flex flex-col gap-1.5">
              <span className="text-[12.5px] text-ink-soft font-medium">{s.label}</span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-[30px] font-bold">{s.value}</span>
                <span className={`text-[12.5px] font-semibold ${s.deltaColor}`}>{s.delta}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-raised border border-line rounded-[10px] flex-1 flex flex-col overflow-hidden">
          <div className="px-5 py-4 border-b border-line flex items-center justify-between">
            <span className="text-[14.5px] font-semibold">Recent activity</span>
            <span className="text-[12.5px] text-ink-soft">Inbound + outbound, live</span>
          </div>
          <div className="overflow-y-auto flex-1">
            {activity.map((a) => (
              <div key={a.phone + a.time} className="flex items-center gap-4 px-5 py-3.5 border-b border-line last:border-b-0">
                <DirectionIcon direction={a.direction} />
                <div className="w-[170px] shrink-0">
                  <div className="text-[13.5px] font-semibold">{a.name}</div>
                  <div className="text-xs text-ink-soft">{a.phone}</div>
                </div>
                <div className="w-[190px] shrink-0 text-[13px] text-ink-soft">{a.detail}</div>
                <div className="w-[70px] shrink-0 text-[13px] text-ink-soft">{a.duration}</div>
                <div className="flex-1" />
                <StatusPill label={a.status} tone={a.tone} />
                <span className="w-14 text-right shrink-0 text-xs text-ink-soft">{a.time}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
