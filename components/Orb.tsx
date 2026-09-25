"use client";
import { useEffect, useRef } from "react";

/**
 * The RANA "core": a rotating sphere of points with faint links, drawn on a 2D canvas (no 3D library).
 * Follows the pointer; press and hold (when interactive) to burst it outward. Respects reduced motion.
 */
export default function Orb({ size = 420, interactive = false, className = "" }: { size?: number; interactive?: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0;
    const fit = () => { const r = cv.getBoundingClientRect(); W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    fit();
    const N = W < 360 ? 220 : 380;
    const pts: { x: number; y: number; z: number; f: number }[] = [];
    for (let i = 0; i < N; i++) {
      const phi = Math.acos(-1 + (2 * i) / N), th = Math.sqrt(N * Math.PI) * phi, r = 1 + (Math.random() - 0.5) * 0.08;
      pts.push({ x: r * Math.cos(th) * Math.sin(phi), y: r * Math.sin(th) * Math.sin(phi), z: r * Math.cos(phi), f: 1.6 + Math.random() * 1.6 });
    }
    const links: [number, number][] = [];
    for (let i = 0; i < N; i += 2) for (let j = i + 1; j < Math.min(i + 16, N); j++) {
      const a = pts[i], b = pts[j]; if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 0.32) links.push([i, j]);
    }
    let ry = 0, rx = 0.35, mx = 0, my = 0, tmx = 0, tmy = 0, burst = 0, target = 0, scale = reduce ? 1 : 0.05, raf = 0;
    const onMove = (e: PointerEvent) => { tmx = e.clientX / window.innerWidth - 0.5; tmy = e.clientY / window.innerHeight - 0.5; };
    window.addEventListener("pointermove", onMove);
    const down = () => { target = 1; }, up = () => { target = 0; };
    if (interactive) { cv.addEventListener("pointerdown", down); window.addEventListener("pointerup", up); cv.addEventListener("pointerleave", up); }
    const ro = new ResizeObserver(fit); ro.observe(cv);
    const proj = new Array(N);
    const frame = () => {
      if (!reduce) { ry += 0.0022 + mx * 0.003; rx += my * 0.0012; }
      mx += (tmx - mx) * 0.05; my += (tmy - my) * 0.05;
      burst += (target - burst) * 0.08; scale += (1 - scale) * 0.035;
      const R = Math.min(W, H) * 0.36 * scale, cx = W / 2, cy = H / 2;
      const cy_ = Math.cos(ry), sy = Math.sin(ry), cx_ = Math.cos(rx), sx = Math.sin(rx);
      ctx.clearRect(0, 0, W, H);
      const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.6);
      halo.addColorStop(0, "rgba(45,225,194,0.10)"); halo.addColorStop(0.55, "rgba(146,132,255,0.05)"); halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < N; i++) {
        const p = pts[i], k = 1 + (p.f - 1) * burst;
        let x = p.x * k, y = p.y * k, z = p.z * k;
        const x1 = x * cy_ - z * sy, z1 = x * sy + z * cy_;
        const y1 = y * cx_ - z1 * sx, z2 = y * sx + z1 * cx_;
        const persp = 2.6 / (2.6 + z2);
        proj[i] = { x: cx + x1 * R * persp, y: cy + y1 * R * persp, z: z2, s: persp };
      }
      ctx.lineWidth = 0.6;
      for (const [a, b] of links) {
        const A = proj[a], B = proj[b], d = (A.z + B.z) / 2;
        ctx.strokeStyle = `rgba(45,225,194,${0.05 + (1 - d) * 0.07 * (1 - burst)})`;
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
      }
      for (let i = 0; i < N; i++) {
        const q = proj[i], depth = (1 - q.z) / 2; // 0 back … 1 front
        const t = i / N;
        ctx.fillStyle = t > 0.82 ? `rgba(146,132,255,${0.35 + depth * 0.6})` : `rgba(45,225,194,${0.3 + depth * 0.65})`;
        ctx.beginPath(); ctx.arc(q.x, q.y, 0.6 + depth * 1.5 * q.s, 0, Math.PI * 2); ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerdown", down); window.removeEventListener("pointerup", up); cv.removeEventListener("pointerleave", up);
    };
  }, [interactive]);
  return <canvas ref={ref} className={className} style={{ width: size, maxWidth: "100%", aspectRatio: "1 / 1", cursor: interactive ? "grab" : undefined, touchAction: interactive ? "none" : undefined }} aria-hidden />;
}
