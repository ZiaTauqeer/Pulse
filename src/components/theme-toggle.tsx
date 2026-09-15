"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

/**
 * A restrained two-option segmented control, not a pill switch or an
 * icon-only button - per the design brief's "obvious but restrained,
 * avoid excessive pill styling / giant icons / decorative toggles".
 *
 * The mounted-guard below is the standard, required next-themes pattern:
 * the server has no way to know the visitor's stored theme preference, so
 * rendering theme-dependent UI before the client has hydrated and read
 * localStorage would cause a hydration mismatch. A same-sized, inert
 * placeholder avoids any layout shift while that resolves (typically a
 * single frame).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className={`h-[26px] w-[104px] border border-ink-700 ${className ?? ""}`} aria-hidden="true" />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <div role="group" aria-label="Theme" className={`inline-flex border border-ink-700 text-xs ${className ?? ""}`}>
      <button
        type="button"
        aria-pressed={!isDark}
        onClick={() => setTheme("light")}
        className={`px-2.5 py-1 transition-colors ${
          !isDark ? "bg-ink-100 text-ink-900" : "text-ink-300 hover:text-ink-100"
        }`}
      >
        Light
      </button>
      <button
        type="button"
        aria-pressed={isDark}
        onClick={() => setTheme("dark")}
        className={`px-2.5 py-1 transition-colors ${
          isDark ? "bg-accent-500 text-ink-950" : "text-ink-300 hover:text-ink-100"
        }`}
      >
        Dark
      </button>
    </div>
  );
}