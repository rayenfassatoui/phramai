"use client";

import { cn } from "@/lib/utils";
import { IconShieldCheck, IconShieldQuestion } from "@tabler/icons-react";

interface ConfidenceScoreProps {
  score: number;
  className?: string;
}

export function ConfidenceScore({ score, className }: ConfidenceScoreProps) {
  const percentage = Math.round(score * 100);
  const level = percentage >= 70 ? "high" : percentage >= 40 ? "medium" : "low";

  const colorMap = {
    high: "text-emerald-600 dark:text-emerald-400",
    medium: "text-amber-600 dark:text-amber-400",
    low: "text-red-500 dark:text-red-400",
  };

  const bgMap = {
    high: "bg-emerald-500/10",
    medium: "bg-amber-500/10",
    low: "bg-red-500/10",
  };

  const labelMap = {
    high: "High confidence",
    medium: "Moderate confidence",
    low: "Low confidence",
  };

  const Icon = percentage >= 40 ? IconShieldCheck : IconShieldQuestion;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        bgMap[level],
        colorMap[level],
        className,
      )}
      title={`Confidence: ${percentage}%`}
      role="status"
      aria-label={`${labelMap[level]}: ${percentage}%`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{percentage}%</span>
    </div>
  );
}
