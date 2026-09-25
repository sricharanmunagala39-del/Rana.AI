export type PillTone = "signal" | "hot" | "warm" | "miss" | "neutral";

const toneClasses: Record<PillTone, string> = {
  signal: "bg-signal-tint text-signal",
  hot: "bg-hot-tint text-hot",
  warm: "bg-warm-tint text-warm",
  miss: "bg-miss-tint text-miss",
  neutral: "bg-line/60 text-ink-soft",
};

export default function StatusPill({ label, tone }: { label: string; tone: PillTone }) {
  return (
    <span
      className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
}
