"use client";

/**
 * Cursor-reactive dot-matrix field.
 *
 * NOT a static repeating background grid - points displace and change
 * intensity as the pointer moves near them, with a lightly damped
 * spring (not a plain linear ease) driving position, so the field has
 * real inertia and settles rather than snapping. Rendered on a single
 * <canvas> (never one DOM node per point) so it stays cheap at a few
 * hundred points.
 *
 * THEME: palette is read from the CSS custom properties in
 * app/globals.css (via next-themes' resolvedTheme, re-read whenever the
 * theme changes, not every frame) - never hardcoded here, so a future
 * palette change only touches globals.css.
 *
 *   - Light mode keeps the original single-tone treatment (the accent
 *     teal, opacity/size modulation only) - deliberately NOT redesigned,
 *     per the brief's "preserve the existing light-mode character".
 *   - Dark mode gets the full cyber-yellow treatment: four intensity
 *     stops (dim resting dots -> base -> bright near-cursor ->
 *     near-white peak highlight), interpolated smoothly, with a small,
 *     localized glow on only the highest-intensity points - never a
 *     single large glowing orb.
 *
 * Behavior by input type:
 *   - fine pointer (mouse/trackpad): full displacement + intensity reaction
 *   - coarse pointer (touch): interaction disabled - renders the resting
 *     field only, no per-frame animation loop, to save battery
 *   - prefers-reduced-motion: same as touch - resting field, no animation
 *
 * Usage: <DotMatrixField className="h-[420px] w-full" /> inside a
 * relatively-positioned parent; this component absolutely fills it.
 */
import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

type DotMatrixFieldProps = {
  className?: string;
  /** Spacing between resting points, in CSS px. */
  spacing?: number;
  /** Radius (px) within which the pointer influences points. */
  influenceRadius?: number;
  /** Max displacement (px) a point can be pushed. */
  maxDisplacement?: number;
};

type RGB = [number, number, number];

function parseColor(input: string): RGB {
  const s = input.trim();
  if (s.startsWith("#")) {
    const hex = s.slice(1);
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    const num = parseInt(full, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }
  const m = s.match(/(\d+(?:\.\d+)?)/g);
  if (m && m.length >= 3) return [Number(m[0]), Number(m[1]), Number(m[2])];
  return [255, 255, 255];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRGB(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function rgbString(c: RGB): string {
  return `rgb(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0})`;
}

export function DotMatrixField({
  className,
  spacing = 26,
  influenceRadius = 140,
  maxDisplacement = 10,
}: DotMatrixFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const isDark = resolvedTheme === "dark";
    const rootStyle = getComputedStyle(document.documentElement);
    const readVar = (name: string, fallback: string) => {
      const v = rootStyle.getPropertyValue(name).trim();
      return v || fallback;
    };

    // Palette resolved once per theme (not per frame) from the same
    // tokens every other component reads - see app/globals.css.
    const dim = parseColor(readVar("--cyber-yellow-dim", "#47410a"));
    const base = parseColor(readVar(isDark ? "--cyber-yellow" : "--accent-500", "#c6bd0d"));
    const bright = parseColor(readVar("--cyber-yellow-bright", "#e9db1c"));
    const peak = parseColor(readVar("--cyber-yellow-peak", "#f7f0a6"));
    const glowRgb = readVar("--cyber-yellow-glow-rgb", "226, 214, 20");

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const interactive = !prefersReducedMotion && !isCoarsePointer;

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    type Point = {
      baseX: number;
      baseY: number;
      x: number;
      y: number;
      vx: number;
      vy: number;
      intensity: number;
      targetIntensity: number;
    };
    let points: Point[] = [];
    const baseOpacity = isDark ? 0.22 : 0.28;
    const baseRadius = 1.1;

    function buildGrid() {
      points = [];
      const cols = Math.ceil(width / spacing) + 1;
      const rows = Math.ceil(height / spacing) + 1;
      const offsetX = (width - (cols - 1) * spacing) / 2;
      const offsetY = (height - (rows - 1) * spacing) / 2;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const baseX = offsetX + c * spacing;
          const baseY = offsetY + r * spacing;
          points.push({ baseX, baseY, x: baseX, y: baseY, vx: 0, vy: 0, intensity: 0, targetIntensity: 0 });
        }
      }
    }

    function resize() {
      if (!canvas) return;
      const rect = canvas.parentElement?.getBoundingClientRect();
      width = rect?.width ?? canvas.clientWidth;
      height = rect?.height ?? canvas.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildGrid();
    }

    const resizeObserver = new ResizeObserver(() => resize());
    if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);
    resize();

    let pointer: { x: number; y: number } | null = null;

    function handlePointerMove(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    function handlePointerLeave() {
      pointer = null;
    }

    if (interactive) {
      canvas.addEventListener("pointermove", handlePointerMove);
      canvas.addEventListener("pointerleave", handlePointerLeave);
    }

    function colorForIntensity(t: number): RGB {
      if (t < 0.4) return lerpRGB(dim, base, t / 0.4);
      if (t < 0.75) return lerpRGB(base, bright, (t - 0.4) / 0.35);
      return lerpRGB(bright, peak, (t - 0.75) / 0.25);
    }

    function drawStatic() {
      ctx!.clearRect(0, 0, width, height);
      ctx!.fillStyle = rgbString(isDark ? dim : base);
      for (const p of points) {
        ctx!.globalAlpha = baseOpacity;
        ctx!.beginPath();
        ctx!.arc(p.baseX, p.baseY, baseRadius, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;
    }

    if (!interactive) {
      // One resting frame, no animation loop - saves battery on touch
      // devices and respects prefers-reduced-motion.
      drawStatic();
      return () => resizeObserver.disconnect();
    }

    let rafId: number;

    // Position: a lightly-damped spring (semi-implicit Euler), giving
    // real inertia - a brief, subtle overshoot-and-settle rather than a
    // linear snap. Intensity (brightness/color) uses a plain exponential
    // ease instead of a spring: brightness "overshooting" would read as
    // a flicker/glitch, not as physical motion.
    const positionStiffness = 0.15;
    const positionDamping = 0.62;
    const intensityEase = 0.16;

    function frame() {
      ctx!.clearRect(0, 0, width, height);

      for (const p of points) {
        let targetX = p.baseX;
        let targetY = p.baseY;
        p.targetIntensity = 0;

        if (pointer) {
          const dx = p.baseX - pointer.x;
          const dy = p.baseY - pointer.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < influenceRadius && dist > 0.01) {
            const falloff = 1 - dist / influenceRadius;
            const push = falloff * maxDisplacement;
            targetX = p.baseX + (dx / dist) * push;
            targetY = p.baseY + (dy / dist) * push;
            p.targetIntensity = falloff;
          }
        }

        const ax = (targetX - p.x) * positionStiffness;
        const ay = (targetY - p.y) * positionStiffness;
        p.vx = (p.vx + ax) * positionDamping;
        p.vy = (p.vy + ay) * positionDamping;
        p.x += p.vx;
        p.y += p.vy;

        p.intensity += (p.targetIntensity - p.intensity) * intensityEase;

        const opacity = baseOpacity + p.intensity * (isDark ? 0.7 : 0.5);
        const radius = baseRadius + p.intensity * (isDark ? 1.6 : 1.3);

        if (isDark) {
          const color = colorForIntensity(p.intensity);
          ctx!.fillStyle = rgbString(color);
          if (p.intensity > 0.6) {
            // Glow only on the highest-intensity points, and only a small
            // blur radius - a handful of localized halos near the
            // cursor, never one large glowing orb across the field.
            ctx!.shadowColor = `rgba(${glowRgb}, ${(p.intensity - 0.6) * 0.9})`;
            ctx!.shadowBlur = 6 + p.intensity * 6;
          } else {
            ctx!.shadowBlur = 0;
          }
        } else {
          ctx!.fillStyle = rgbString(base);
        }

        ctx!.globalAlpha = Math.min(1, opacity);
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.shadowBlur = 0;
      }
      ctx!.globalAlpha = 1;

      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [resolvedTheme, spacing, influenceRadius, maxDisplacement]);

  return (
    <div className={`relative overflow-hidden ${className ?? ""}`} aria-hidden="true">
      <canvas ref={canvasRef} className="absolute inset-0 block" />
    </div>
  );
}