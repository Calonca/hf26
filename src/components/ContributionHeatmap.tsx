"use client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ActivityHeatmap } from "@/components/arc/activity-heatmap/activity-heatmap";
import { Select } from "@/components/arc/select/select";
import type { Calendar } from "@/server/github";
import { getContributionCalendar } from "@/server/actions/pages";

const LAST = "last";

/** Contribution calendar with a year switch. The last year comes from the server; other years load on demand. */
export function ContributionHeatmap({ login, initial, years }: { login: string; initial: Calendar; years: number[] }) {
  const [range, setRange] = useState(LAST);
  const q = useQuery({
    queryKey: ["calendar", login.toLowerCase(), range],
    queryFn: () => getContributionCalendar(login, range === LAST ? null : Number(range)),
    initialData: range === LAST ? initial : undefined,
    // Keep the current grid while the next year loads, so the heatmap recolors instead of blinking out.
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  });
  const calendar = q.data ?? initial;

  return (
    <ActivityHeatmap
      days={calendar.days}
      label={`Contributions by @${login} in ${calendar.period}`}
      period={calendar.period}
      unit={calendar.unit}
      actions={
        <div className="heatmap-year" aria-busy={q.isFetching}>
          <Select
            label="Year"
            value={range}
            onValueChange={setRange}
            options={[{ value: LAST, label: "Last year" }, ...years.map((y) => ({ value: String(y), label: String(y) }))]}
          />
        </div>
      }
    />
  );
}
