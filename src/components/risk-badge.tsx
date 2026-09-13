import type { RiskLevel } from "@prisma/client";

const STYLES: Record<RiskLevel, string> = {
  LOW: "text-risk-low bg-risk-low-bg",
  MEDIUM: "text-risk-medium bg-risk-medium-bg",
  HIGH: "text-risk-high bg-risk-high-bg",
  CRITICAL: "text-risk-critical bg-risk-critical-bg",
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span className={`inline-block px-2 py-0.5 font-mono text-xs ${STYLES[level]}`}>
      {level.toLowerCase()}
    </span>
  );
}
