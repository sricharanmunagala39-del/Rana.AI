// @ts-nocheck
"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";

function ComingSoonInner() {
  const params = useSearchParams();
  const feature = params.get("feature") || "This";

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="coming-soon" />
      <div className="flex-1 flex items-center justify-center p-10">
        <div className="max-w-[420px] text-center border border-line rounded-2xl bg-white p-10">
          <div className="w-12 h-12 rounded-full bg-signal-tint text-signal flex items-center justify-center mx-auto mb-4">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div className="text-[16px] font-semibold">{feature} is coming soon</div>
          <div className="text-[13px] text-ink-soft mt-2 leading-relaxed">
            We're building this part of RANA now. It will appear here as soon as it's ready — everything else keeps working in the meantime.
          </div>
          <a href="/" className="inline-block mt-5 text-[12.5px] font-semibold text-signal">← Back to Dashboard</a>
        </div>
      </div>
    </div>
  );
}

export default function ComingSoonPage() {
  return (
    <Suspense fallback={null}>
      <ComingSoonInner />
    </Suspense>
  );
}
