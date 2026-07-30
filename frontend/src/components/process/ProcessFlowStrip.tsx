"use client";

import { ChevronRight, TriangleAlert } from "lucide-react";
import type { LineSnapshot } from "@/domain/stamping/types";
import { STATION_KIND_LABEL } from "@/domain/stamping/catalog";
import { bandForOee } from "@/domain/stamping/oee";
import { BAND_COLOR, STATUS_STYLE, STATUS_TEXT } from "@/lib/theme";
import { cn, fmtInt, fmtPct } from "@/lib/format";
import { StatusDot } from "@/components/ui/StatusPill";

/**
 * The press line as a left-to-right process chain.
 *
 * Mirrors the physical order of operations so the strip reads the way the steel
 * actually travels — coil in at the left, racked panels out at the right. The
 * bottleneck is called out explicitly because it is the only station whose
 * improvement moves line throughput.
 */
export function ProcessFlowStrip({
  line,
  selectedStationId,
  onSelect,
}: {
  line: LineSnapshot;
  selectedStationId: string | null;
  onSelect: (stationId: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <ol className="flex min-w-max items-stretch gap-0 p-3">
        {line.stations.map((station, i) => {
          const style = STATUS_STYLE[station.status];
          const selected = station.stationId === selectedStationId;
          const isBottleneck = station.stationId === line.bottleneckStationId;
          const oeeBand = bandForOee(station.oee.oee);

          return (
            <li key={station.stationId} className="flex items-stretch">
              <button
                type="button"
                onClick={() => onSelect(station.stationId)}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "relative flex w-[136px] flex-col rounded-md border px-2.5 py-2 text-left transition",
                  selected
                    ? "border-[var(--series-1)] bg-[var(--series-1)]/10"
                    : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)]",
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-semibold tracking-[0.08em] text-[var(--text-muted)]">
                    {station.def.opCode}
                  </span>
                  <StatusDot status={station.status} />
                </div>

                <span className="mt-1 text-[11px] font-medium leading-tight text-[var(--text-primary)]">
                  {STATION_KIND_LABEL[station.def.kind]}
                </span>

                <span className="mt-1.5 text-[10px] font-medium" style={{ color: style.text }}>
                  {style.label}
                </span>

                <dl className="mt-2 space-y-0.5 text-[10px]">
                  <div className="flex justify-between">
                    <dt className="text-[var(--text-muted)]">Count</dt>
                    <dd className="tabular text-[var(--text-secondary)]">
                      {fmtInt(station.count)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-[var(--text-muted)]">OEE</dt>
                    <dd className="tabular font-medium" style={{ color: BAND_COLOR[oeeBand] }}>
                      {fmtPct(station.oee.oee, 0)}
                    </dd>
                  </div>
                </dl>

                {isBottleneck ? (
                  <span
                    className="mt-1.5 inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.06em]"
                    style={{ color: STATUS_TEXT.warning }}
                  >
                    <TriangleAlert size={9} />
                    Bottleneck
                  </span>
                ) : null}
              </button>

              {i < line.stations.length - 1 ? (
                <span className="flex items-center px-1 text-[var(--text-muted)]" aria-hidden>
                  <ChevronRight size={13} />
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
