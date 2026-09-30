"use client";
import { useEffect, useRef, type ReactNode } from "react";
import type { VoiceLevels } from "@/lib/voice/meter";

/**
 * RANA's "core" — the futuristic voice orb used across the product (website talk, hero, live monitor,
 * employee tests, HQ command centre, reels). A sphere of points on a 2D canvas that breathes when idle,
 * ripples with the AI's real voice (teal) and the person's voice (violet), spins while thinking and flashes
 * amber for alerts. HUD rings are plain CSS. No 3D library; pauses off-screen; respects reduced motion.
 *
 *   mode="auto" + levels={() => call.levels()}  → follows who is talking right now
 *   pulse={n}                                   → each change sends a ripple (e.g. a new call just finished)
 */
export type CoreMode = "idle" | "listening" | "speaking" | "thinking" | "alert" | "auto";
type Props = {
  size?: number | string; mode?: CoreMode; levels?: () => VoiceLevels | number;
  hud?: boolean; pulse?: number; onMode?: (m: Exclude<CoreMode, "auto">) => void;
  onClick?: () => void; children?: ReactNode; className?: string; label?: string; dense?: boolean;
};

const COLORS: Record<string, [number, number, number]> = {
  speaking: [45, 225, 194], idle: [45, 225, 194], thinking: [120, 200, 230], listening: [146, 132, 255], alert: [245, 179, 86],
};

export default function RanaCore({ size = 420, mode = "idle", levels, hud = true, pulse = 0, onMode, onClick, children, className = "", label, dense = true }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(mode); modeRef.current = mode;
  const levelsRef = useRef(levels); levelsRef.current = levels;
  const onModeRef = useRef(onMode); onModeRef.current = onMode;
  const pulseRef = useRef({ n: pulse, rip: [] as number[] });

  useEffect(() => { if (pulse !== pulseRef.current.n) { pulseRef.current.n = pulse; pulseRef.current.rip.push(0); } }, [pulse]);

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0;
    const fit = () => { const r = cv.getBoundingClientRect(); W = r.width; H = r.height; cv.width = Math.max(1, W * dpr); cv.height = Math.max(1, H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    fit();
    const N = !dense || W < 300 ? 240 : 400;
    const pts: { x: number; y: number; z: number; ph: number }[] = [];
    for (let i = 0; i < N; i++) {
      const phi = Math.acos(-1 + (2 * i) / N), th = Math.sqrt(N * Math.PI) * phi, r = 1 + (Math.random() - 0.5) * 0.06;
      pts.push({ x: r * Math.cos(th) * Math.sin(phi), y: r * Math.sin(th) * Math.sin(phi), z: r * Math.cos(phi), ph: Math.random() * 6.28 });
    }
    const links: [number, number][] = [];
    for (let i = 0; i < N; i += 2) for (let j = i + 1; j < Math.min(i + 16, N); j++) {
      const a = pts[i], b = pts[j]; if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 0.3) links.push([i, j]);
    }
    const proj = new Array(N);
    let t = 0, amp = 0, ry = 0, rx = 0.35, spin = 0, raf = 0, visible = true, shown = "";
    let col = [...COLORS.idle] as number[];
    let lastSwitch = 0, pending = "";
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(frame); }, { threshold: 0 });
    io.observe(cv);
    const ro = new ResizeObserver(fit); ro.observe(cv);

    function current(): { m: string; target: number } {
      const m = modeRef.current;
      const lv = levelsRef.current?.();
      const L = typeof lv === "number" ? { agent: lv, user: 0 } : lv || { agent: 0, user: 0 };
      if (m === "auto") {
        if (L.agent > 0.06) return { m: "speaking", target: 0.25 + L.agent * 0.9 };
        if (L.user > 0.07) return { m: "listening", target: 0.18 + L.user * 0.8 };
        return { m: "listening", target: 0.1 };
      }
      if (m === "speaking") return { m, target: L.agent > 0 ? 0.25 + L.agent * 0.9 : 0.35 + 0.4 * Math.abs(Math.sin(t * 9) * Math.sin(t * 3.3 + 1)) };
      if (m === "listening") return { m, target: L.user > 0 ? 0.15 + L.user * 0.8 : 0.12 + 0.12 * Math.abs(Math.sin(t * 5)) };
      if (m === "thinking") return { m, target: 0.14 };
      if (m === "alert") return { m, target: 0.3 + 0.2 * Math.abs(Math.sin(t * 4)) };
      return { m: "idle", target: 0.05 + 0.04 * Math.sin(t * 1.4) };
    }

    function frame() {
      raf = 0;
      if (!visible) return;
      t += reduce ? 0.004 : 0.016;
      const { m, target } = current();
      // Report mode changes (steadied, so the label doesn't flicker between words).
      if (m !== shown) {
        if (m !== pending) { pending = m; lastSwitch = t; }
        else if (t - lastSwitch > 0.18 || shown === "") { shown = m; onModeRef.current?.(m as any); }
      }
      amp += (Math.min(0.9, target) - amp) * 0.2;
      const c = COLORS[shown || m] || COLORS.idle;
      for (let k = 0; k < 3; k++) col[k] += (c[k] - col[k]) * 0.08;
      const rgb = `${col[0] | 0},${col[1] | 0},${col[2] | 0}`;
      spin += ((shown === "thinking" ? 0.05 : 0) - spin) * 0.05;
      ry += (reduce ? 0.0008 : 0.0026) + spin; rx = 0.35 + Math.sin(t * 0.3) * 0.18;

      ctx!.clearRect(0, 0, W, H);
      const R = Math.min(W, H) * 0.28 * (1 + amp * 0.1), cx = W / 2, cy = H / 2;
      const halo = ctx!.createRadialGradient(cx, cy, 0, cx, cy, R * 1.75);
      halo.addColorStop(0, `rgba(${rgb},${0.16 + amp * 0.34})`); halo.addColorStop(0.5, `rgba(${rgb},${0.05 + amp * 0.08})`); halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx!.fillStyle = halo; ctx!.beginPath(); ctx!.arc(cx, cy, R * 1.75, 0, 6.2832); ctx!.fill();

      const cY = Math.cos(ry), sY = Math.sin(ry), cX = Math.cos(rx), sX = Math.sin(rx);
      for (let i = 0; i < N; i++) {
        const p = pts[i], k = 1 + amp * 0.2 * Math.sin(p.ph + t * 7 + i * 0.05);
        const x = p.x * k, y = p.y * k, z = p.z * k;
        const x1 = x * cY - z * sY, z1 = x * sY + z * cY;
        const y1 = y * cX - z1 * sX, z2 = y * sX + z1 * cX;
        const persp = 2.6 / (2.6 + z2);
        proj[i] = { x: cx + x1 * R * persp, y: cy + y1 * R * persp, z: z2, s: persp };
      }
      ctx!.lineWidth = 0.6;
      ctx!.strokeStyle = `rgba(${rgb},${0.07 + amp * 0.06})`;
      ctx!.beginPath();
      for (const [a, b] of links) { const A = proj[a], B = proj[b]; if (A.z + B.z > 0.6) continue; ctx!.moveTo(A.x, A.y); ctx!.lineTo(B.x, B.y); }
      ctx!.stroke();
      for (let i = 0; i < N; i++) {
        const q = proj[i], depth = (1 - q.z) / 2;
        ctx!.fillStyle = `rgba(${rgb},${0.22 + depth * 0.75})`;
        const s = 0.7 + depth * 1.6 * q.s;
        ctx!.fillRect(q.x - s / 2, q.y - s / 2, s, s);
      }
      // Voice ring: a waveform circle that follows the loudness.
      ctx!.beginPath();
      for (let a = 0; a <= 6.2832 + 0.01; a += 0.035) {
        const w = 1 + amp * 0.07 * Math.sin(a * 6 + t * 10) + amp * 0.04 * Math.sin(a * 13 - t * 7);
        const rr = R * 1.28 * w, px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
        if (a === 0) ctx!.moveTo(px, py); else ctx!.lineTo(px, py);
      }
      ctx!.strokeStyle = `rgba(${rgb},${0.28 + amp * 0.55})`; ctx!.lineWidth = 1.4;
      ctx!.shadowColor = `rgb(${rgb})`; ctx!.shadowBlur = 12; ctx!.stroke(); ctx!.shadowBlur = 0;
      // Ripples (pulse prop).
      const rip = pulseRef.current.rip;
      for (let i = rip.length - 1; i >= 0; i--) {
        rip[i] += 0.012; const k = rip[i];
        if (k >= 1) { rip.splice(i, 1); continue; }
        ctx!.beginPath(); ctx!.arc(cx, cy, R * (1.2 + k * 0.5), 0, 6.2832);
        ctx!.strokeStyle = `rgba(${rgb},${(1 - k) * 0.55})`; ctx!.lineWidth = 2; ctx!.stroke();
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); raf = -1 as any; io.disconnect(); ro.disconnect(); visible = false; };
  }, [dense]);

  const style = typeof size === "number" ? { width: size, maxWidth: "100%" } : { width: size };
  // Always a <div> (a button role when clickable): switching the element type would remount the canvas.
  return (
    <div role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      aria-label={label} className={`rana-core relative aspect-square select-none ${onClick ? "cursor-pointer group" : ""} ${className}`} style={style} data-mode={mode}>
      {hud && (
        <>
          <span className="hud-sweep" aria-hidden />
          <span className="hud-ticks" aria-hidden />
          <span className="hud-ring hud-r1" aria-hidden />
          <span className="hud-ring hud-r2" aria-hidden />
          <span className="hud-ring hud-r3" aria-hidden />
        </>
      )}
      <canvas ref={ref} className="absolute inset-0 w-full h-full" aria-hidden />
      {children && <span className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</span>}
    </div>
  );
}

/** Short labels for what the core is doing. */
export const CORE_LABEL: Record<string, string> = { idle: "STANDBY", listening: "LISTENING", speaking: "SPEAKING", thinking: "THINKING", alert: "ALERT" };
