"use client";

/**
 * Cursor-reactive dot-matrix field.
 *
 * NOT a static repeating background grid (explicitly excluded by the
 * design brief) - points displace and change intensity as the pointer
 * moves near them, and ease smoothly back to rest when it leaves.
 * Rendered on a single <canvas> (never one DOM node per point) so it
 * stays cheap even at a few hundred points.
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

type DotMatrixFieldProps = {
  className?: string;
  /** CSS color for the dots - defaults to the accent token. */
  color?: string;
  /** Spacing between resting points, in CSS px. */
  spacing?: number;
  /** Radius (px) within which the pointer influences points. */
  influenceRadius?: number;
  /** Max displacement (px) a point can be pushed. */
  maxDisplacement?: number;
};

export function DotMatrixField({
  className,
  color = "#2f6f6b",
  spacing = 26,
  influenceRadius = 140,
  maxDisplacement = 10,
}: DotMatrixFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

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
      opacity: number;
      targetOpacity: number;
      radius: number;
      targetRadius: number;
    };
    let points: Point[] = [];
    const baseOpacity = 0.28;
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
          points.push({
            baseX,
            baseY,
            x: baseX,
            y: baseY,
            opacity: baseOpacity,
            targetOpacity: baseOpacity,
            radius: baseRadius,
            targetRadius: baseRadius,
          });
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

    function drawStatic() {
      ctx!.clearRect(0, 0, width, height);
      ctx!.fillStyle = color;
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
    const ease = 0.12;

    function frame() {
      ctx!.clearRect(0, 0, width, height);
      ctx!.fillStyle = color;

      for (const p of points) {
        let targetX = p.baseX;
        let targetY = p.baseY;
        p.targetOpacity = baseOpacity;
        p.targetRadius = baseRadius;

        if (pointer) {
          const dx = p.baseX - pointer.x;
          const dy = p.baseY - pointer.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < influenceRadius && dist > 0.01) {
            const falloff = 1 - dist / influenceRadius;
            const push = falloff * maxDisplacement;
            targetX = p.baseX + (dx / dist) * push;
            targetY = p.baseY + (dy / dist) * push;
            p.targetOpacity = baseOpacity + falloff * 0.5;
            p.targetRadius = baseRadius + falloff * 1.3;
          }
        }

        p.x += (targetX - p.x) * ease;
        p.y += (targetY - p.y) * ease;
        p.opacity += (p.targetOpacity - p.opacity) * ease;
        p.radius += (p.targetRadius - p.radius) * ease;

        ctx!.globalAlpha = p.opacity;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx!.fill();
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
  }, [color, spacing, influenceRadius, maxDisplacement]);

  return (
    <div className={`relative overflow-hidden ${className ?? ""}`} aria-hidden="true">
      <canvas ref={canvasRef} className="absolute inset-0 block" />
    </div>
  );
}
