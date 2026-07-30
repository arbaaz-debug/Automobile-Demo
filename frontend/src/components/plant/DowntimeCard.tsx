"use client";

import { downtimeReasons } from "@/domain/stamping/simulator";
import type { ShiftId } from "@/domain/stamping/types";
import { SEQUENTIAL } from "@/lib/theme";
import { fmtInt, fmtMinutes } from "@/lib/format";
import { ChartFrame, ChartTable } from "@/components/charts/ChartFrame";

/**
 * Downtime by cause for the selected line and window.
 *
 * Ranked bars on a single minutes axis. The ramp is sequential — one hue,
 * light to dark, encoding magnitude — because the causes have no identity worth
 * preserving across charts, only a size.
 */
export function DowntimeCard({
  lineId,
  lineName,
  dayKey,
  shifts,
  totalDowntimeMin,
  height = 214,
}: {
  lineId: string;
  lineName: string;
  dayKey: string;
  shifts: ShiftId[];
  totalDowntimeMin: number;
  height?: number;
}) {
  const reasons = downtimeReasons(lineId, dayKey, shifts, totalDowntimeMin);
  const max = reasons.length > 0 ? reasons[0].minutes : 1;
  const total = reasons.reduce((a, r) => a + r.minutes, 0);

  return (
    <ChartFrame
      title="Downtime by cause"
      subtitle={`${lineName} · ${fmtMinutes(total)} lost across ${fmtInt(
        reasons.reduce((a, r) => a + r.events, 0),
      )} events`}
      height={height}
      table={
        <ChartTable
          head={["Cause", "Minutes", "Events", "Mean stop"]}
          rows={reasons.map((r) => [
            r.reason,
            fmtInt(r.minutes),
            fmtInt(r.events),
            `${fmtInt(r.minutes / Math.max(1, r.events))} min`,
          ])}
        />
      }
    >
      <ul className="h-full space-y-2 overflow-y-auto px-3 pt-1">
        {reasons.map((r, i) => (
          <li key={r.reason}>
            <div className="flex items-baseline justify-between gap-3 text-[11px]">
              <span className="truncate text-[var(--text-secondary)]">{r.reason}</span>
              <span className="tabular shrink-0 text-[var(--text-primary)]">
                {fmtInt(r.minutes)} min
                <span className="ml-1.5 text-[var(--text-muted)]">×{r.events}</span>
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(r.minutes / max) * 100}%`,
                  backgroundColor: SEQUENTIAL[Math.min(SEQUENTIAL.length - 1, i + 1)],
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </ChartFrame>
  );
}
