"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import StatusPill, { PillTone } from "@/components/StatusPill";

type Filter = "all" | "hot" | "warm" | "missed";

type Call = {
  name: string;
  phone: string;
  centre: string;
  exam: string;
  duration: string;
  status: string;
  tone: PillTone;
  time: string;
  tag: "hot" | "warm" | "missed" | "other";
};

const allCalls: Call[] = [
  { name: "Dr. Nikhil Reddy", phone: "+91 90xxxxx214", centre: "Hyderabad INDRA", exam: "NEET PG · 1st attempt", duration: "3m 02s", status: "Session booked", tone: "signal", time: "9:14am", tag: "warm" },
  { name: "Dr. Sowmya Kalluri", phone: "+91 63xxxxx881", centre: "Hyderabad ASC", exam: "NEET PG · 2nd attempt", duration: "4m 21s", status: "Hot", tone: "hot", time: "9:47am", tag: "hot" },
  { name: "Unknown caller", phone: "+91 88xxxxx045", centre: "Vizag ASC", exam: "Fee query", duration: "0m 41s", status: "Warm", tone: "warm", time: "10:02am", tag: "warm" },
  { name: "Dr. Abhiram Rao", phone: "+91 70xxxxx320", centre: "Vijayawada INDRA", exam: "NEET PG · budget concern", duration: "0m 12s", status: "No answer path", tone: "miss", time: "10:19am", tag: "missed" },
  { name: "Dr. Meghana Iyer", phone: "+91 99xxxxx762", centre: "Vijayawada INDRA", exam: "Trial class request", duration: "2m 37s", status: "Trial activated", tone: "signal", time: "10:41am", tag: "warm" },
  { name: "Dr. Karthik Naidu", phone: "+91 81xxxxx509", centre: "Hyderabad INDRA", exam: "NEET PG · 1st attempt", duration: "5m 18s", status: "Hot", tone: "hot", time: "11:05am", tag: "hot" },
];

const filters: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "hot", label: "Hot" },
  { key: "warm", label: "Warm" },
  { key: "missed", label: "Missed" },
];

export default function InboundPage() {
  const [filter, setFilter] = useState<Filter>("all");

  const calls = filter === "all" ? allCalls : allCalls.filter((c) => c.tag === filter);
  const counts: Record<Filter, number> = {
    all: allCalls.length,
    hot: allCalls.filter((c) => c.tag === "hot").length,
    warm: allCalls.filter((c) => c.tag === "warm").length,
    missed: allCalls.filter((c) => c.tag === "missed").length,
  };

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="inbound" />

      <main className="flex-1 box-border p-11 flex flex-col gap-5.5">
        <div>
          <h1 className="font-display text-[26px] font-semibold m-0">Inbound</h1>
          <div className="text-[13px] text-ink-soft mt-1">
            Calls answered by your AI agent on +91 80642 60065
          </div>
        </div>

        <div className="flex gap-1 bg-raised border border-line rounded-[9px] p-1 w-fit">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`text-[13.5px] font-semibold px-3.5 py-2 rounded-md ${
                filter === f.key ? "bg-ink text-white" : "text-ink-soft"
              }`}
            >
              {f.label} <span className="opacity-60">{counts[f.key]}</span>
            </button>
          ))}
        </div>

        <div className="bg-raised border border-line rounded-[10px] flex-1 overflow-hidden flex flex-col">
          <div className="flex px-5 py-3 border-b border-line text-[11.5px] font-semibold text-ink-soft">
            <div className="w-[190px]">Caller</div>
            <div className="w-[130px]">Centre</div>
            <div className="w-[170px]">Exam / stage</div>
            <div className="w-20">Duration</div>
            <div className="flex-1">Outcome</div>
            <div className="w-[70px] text-right">Time</div>
          </div>
          <div className="overflow-y-auto flex-1">
            {calls.map((c) => (
              <div key={c.phone + c.time} className="flex items-center px-5 py-3.5 border-b border-line last:border-b-0">
                <div className="w-[190px]">
                  <div className="text-[13.5px] font-semibold">{c.name}</div>
                  <div className="text-xs text-ink-soft">{c.phone}</div>
                </div>
                <div className="w-[130px] text-[13px] text-ink-soft">{c.centre}</div>
                <div className="w-[170px] text-[13px] text-ink-soft">{c.exam}</div>
                <div className="w-20 text-[13px] text-ink-soft">{c.duration}</div>
                <div className="flex-1">
                  <StatusPill label={c.status} tone={c.tone} />
                </div>
                <div className="w-[70px] text-right text-xs text-ink-soft">{c.time}</div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
