"use client";

import { useRouter } from "next/navigation";
import type { AnalyticsDays, BannerTypeFilter } from "@/app/lib/analytics/md-banner";

type AnalyticsDayPickerProps = {
  value: string;
  max: string;
  days: AnalyticsDays;
  type: BannerTypeFilter;
};

export function AnalyticsDayPicker({
  value,
  max,
  days,
  type,
}: AnalyticsDayPickerProps) {
  const router = useRouter();

  return (
    <input
      type="date"
      value={value}
      max={max}
      aria-label="Giorno KPI"
      onChange={(e) => {
        const next = e.target.value;
        if (!next) return;
        router.push(`/analytics?days=${days}&type=${type}&date=${next}`);
      }}
      className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 tabular-nums dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
    />
  );
}
