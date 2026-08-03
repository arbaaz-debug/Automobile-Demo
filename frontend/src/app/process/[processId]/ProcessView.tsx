"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CircleCheck,
  Gauge,
  Layers,
  ListOrdered,
  TriangleAlert,
} from "lucide-react";
import { PLANT_BY_ID } from "@/domain/stamping/catalog";
import { bandForFtt, bandForOee } from "@/domain/stamping/oee";
import {
  PROCESSES,
  PROCESS_BY_ID,
  STREAM_LABEL,
  processSequence,
} from "@/domain/manufacturing/processes";
import { processByFactory } from "@/domain/manufacturing/processMetrics";
import { useFilterState, useOverview } from "@/hooks/useOverview";
import { AppShell } from "@/components/layout/AppShell";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { Card, CardBody, CardHeader, SectionLabel } from "@/components/ui/Card";
import { Meter, StatTile } from "@/components/ui/StatTile";
import { ProcessFlowMap } from "@/components/process/ProcessFlowMap";
import { OverviewTrendChart } from "@/components/overview/OverviewTrendChart";
import { QualityTrendChart } from "@/components/overview/QualityTrendChart";
import { fmtInt, fmtPct } from "@/lib/format";
import { BAND_COLOR, BAND_LABEL, SERIES, STATUS, STATUS_TEXT } from "@/lib/theme";
import { processCrumbs, routes } from "@/lib/routes";

/**
 * Overview for one process in the manufacturing chain.
 *
 * Scoped pan-India by default and filterable to a single factory by the same
 * header control as every other page, so "press shop across India" and "press
 * shop at Nashik" are the same page under a different filter rather than two
 * pages that can drift apart.
 *
 * Only the press shop carries station-level instrumentation today. Rather than
 * fake depth for the other seven, each of those reports what the chain model
 * genuinely knows — throughput, yield, effectiveness and where it sits relative
 * to its feed — and says plainly that it is modelled at process level.
 */
export function ProcessView({ processId }: { processId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const push = useCallback(
    (next: URLSearchParams) => {
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const filters = useFilterState(searchParams, push);
  const { data, loading, updatedAt, refresh } = useOverview(filters);

  const search = searchParams?.toString() ?? "";
  const def = PROCESS_BY_ID.get(processId)!;

  const sequence = processSequence();
  const index = sequence.findIndex((p) => p.id === processId);

  // What this process actually feeds, read off the graph. Not `sequence[i + 1]`:
  // the topological order interleaves the two parallel streams, so the next
  // entry after the press shop is the frame line, which it does not feed.
  const downstream = PROCESSES.filter((p) => p.inputs.includes(processId));

  const metrics = data?.chain.chain.find((c) => c.processId === processId);
  const isBottleneck = data?.chain.bottleneck.processId === processId;

  const factoryRows = useMemo(() => {
    if (!data) return [];
    const shifts = filters.shiftId === "all" ? (["A", "B", "C"] as const) : [filters.shiftId];
    return processByFactory(processId, data.dayKeys, [...shifts], data.plantIds).sort(
      (a, b) => b.produced - a.produced,
    );
  }, [data, processId, filters.shiftId]);

  const scopeName =
    filters.plantId === "all"
      ? "All factories · India"
      : (PLANT_BY_ID.get(filters.plantId)?.name ?? filters.plantId);

  return (
    <AppShell
      controls={{
        dateIso: filters.dateIso,
        shiftId: filters.shiftId,
        rangeId: filters.rangeId,
        plantId: filters.plantId,
        setDateIso: filters.setDateIso,
        setShiftId: filters.setShiftId,
        setRangeId: filters.setRangeId,
        setPlantId: filters.setPlantId,
      }}
      source={{ kind: "simulator", liveStations: 0, totalStations: 0, error: null }}
      updatedAt={updatedAt}
      onRefresh={refresh}
      loading={loading}
      crumbs={processCrumbs(processId, search)}
      search={search}
    >
      {!data || !metrics ? (
        <PageSkeleton />
      ) : (
        <>
          <header className="mb-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              {STREAM_LABEL[def.stream]} · step {index + 1} of {sequence.length}
            </p>
            <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-[var(--text-primary)]">
              {def.name}
            </h1>
            <p className="mt-1 max-w-4xl text-[12px] leading-relaxed text-[var(--text-secondary)]">
              {def.description}
            </p>
            <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
              {scopeName} · {data.windowLabel}
            </p>
          </header>

          {isBottleneck ? (
            <div
              className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-3"
              style={{
                borderColor: `${STATUS.warning}66`,
                backgroundColor: `${STATUS.warning}14`,
              }}
              role="status"
            >
              <span
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold"
                style={{ color: STATUS_TEXT.warning }}
              >
                <AlertTriangle size={14} aria-hidden />
                Bottleneck process
              </span>
              <span className="text-[12px] text-[var(--text-secondary)]">
                Running at {fmtPct(metrics.utilisation, 1)} of sustainable capacity — this
                process sets the build rate for the entire chain.
              </span>
            </div>
          ) : null}

          {/* --- headline metrics ------------------------------------------ */}

          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatTile
              label="Throughput"
              value={fmtInt(metrics.produced)}
              unit="sets/day"
              accent={SERIES[0]}
              icon={<Layers size={14} />}
              context={`${fmtInt(metrics.good)} good per day`}
            />
            <StatTile
              label="Rejections"
              value={fmtInt(metrics.rejected)}
              unit="sets/day"
              accent={STATUS.critical}
              valueColor={STATUS_TEXT.critical}
              icon={<TriangleAlert size={14} />}
              context={`${fmtPct(1 - metrics.ftt, 2)} reject rate`}
            />
            <StatTile
              label="First time through"
              value={fmtPct(metrics.ftt, 1)}
              accent={SERIES[3]}
              valueColor={BAND_COLOR[bandForFtt(metrics.ftt)]}
              icon={<CircleCheck size={14} />}
              context={BAND_LABEL[bandForFtt(metrics.ftt)]}
            />
            <StatTile
              label="Process OEE"
              value={fmtPct(metrics.oee, 1)}
              accent={SERIES[5]}
              valueColor={BAND_COLOR[bandForOee(metrics.oee)]}
              icon={<Gauge size={14} />}
              context={BAND_LABEL[bandForOee(metrics.oee)]}
            />
            <StatTile
              label="Capacity utilisation"
              value={fmtPct(metrics.utilisation, 0)}
              accent={isBottleneck ? STATUS.warning : SERIES[2]}
              valueColor={isBottleneck ? STATUS_TEXT.warning : undefined}
              icon={<Gauge size={14} />}
              context={`${fmtInt(metrics.capacity)} sets/day sustainable`}
            />
          </div>

          {/* --- operations + position in chain ---------------------------- */}

          <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
            <Card>
              <CardHeader
                title="Operations in sequence"
                subtitle={`${def.steps.length} steps · ${def.cycleTimeSec}s nominal cycle`}
                icon={<ListOrdered size={14} />}
              />
              <CardBody>
                <ol className="space-y-2">
                  {def.steps.map((step, i) => (
                    <li key={step} className="flex items-start gap-2.5">
                      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[var(--surface-3)] text-[10px] font-semibold tabular text-[var(--text-secondary)]">
                        {i + 1}
                      </span>
                      <span className="text-[12px] text-[var(--text-secondary)]">{step}</span>
                    </li>
                  ))}
                </ol>

                {def.instrumented ? (
                  <Link
                    href={routes.plant(
                      filters.plantId === "all" ? "nashik" : filters.plantId,
                      search,
                    )}
                    className="mt-4 inline-flex items-center gap-1.5 rounded border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
                  >
                    Open station-level detail
                    <ArrowRight size={12} aria-hidden />
                  </Link>
                ) : (
                  <p className="mt-4 rounded border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2 text-[11px] text-[var(--text-muted)]">
                    Modelled at process level. Station-level telemetry is commissioned for the
                    press shop only — this process reports throughput and yield, not machine
                    signals.
                  </p>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Position in the manufacturing chain"
                subtitle={
                  downstream.length > 0
                    ? `Feeds ${downstream.map((p) => p.name).join(" and ")}`
                    : "Final process — vehicles leave the plant from here"
                }
              />
              <CardBody>
                <ProcessFlowMap
                  chain={data.chain.chain}
                  bottleneckId={data.chain.bottleneck.processId}
                  search={search}
                />
              </CardBody>
            </Card>
          </div>

          {/* --- trends ----------------------------------------------------- */}

          <SectionLabel>Trend across the selected window</SectionLabel>

          <div className="mb-6 grid grid-cols-1 gap-3 xl:grid-cols-2">
            <OverviewTrendChart points={data.points} bucket={data.bucket} />
            <QualityTrendChart points={data.points} bucket={data.bucket} />
          </div>

          {/* --- per factory ------------------------------------------------ */}

          <SectionLabel>{def.name} by factory</SectionLabel>

          <Card className="mb-6">
            <CardHeader
              title="Factory breakdown"
              subtitle={`${def.name} throughput, yield and capacity use at each plant`}
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-[12px]">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                    <th scope="col" className="py-2 pl-4 pr-3 text-left font-medium">
                      Factory
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Sets / day
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Rejected
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      FTT
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      OEE
                    </th>
                    <th scope="col" className="px-3 py-2 pr-4 text-left font-medium">
                      Capacity used
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {factoryRows.map((row) => (
                    <tr
                      key={row.plantId}
                      className="border-b border-[var(--border)]/60 transition last:border-0 hover:bg-[var(--surface-3)]/40"
                    >
                      <th scope="row" className="py-2.5 pl-4 pr-3 text-left font-normal">
                        <Link
                          href={routes.plant(row.plantId, search)}
                          className="block font-medium text-[var(--text-primary)] underline-offset-2 hover:underline"
                        >
                          {row.plantName}
                        </Link>
                        <span className="block text-[10px] text-[var(--text-muted)]">
                          {row.city}
                        </span>
                      </th>
                      <td className="tabular px-3 py-2.5 text-right font-semibold text-[var(--text-primary)]">
                        {fmtInt(row.avgPerDay)}
                      </td>
                      <td
                        className="tabular px-3 py-2.5 text-right font-medium"
                        style={{ color: STATUS_TEXT.critical }}
                      >
                        {fmtInt(row.rejected)}
                      </td>
                      <td className="tabular px-3 py-2.5 text-right text-[var(--text-secondary)]">
                        {fmtPct(row.ftt, 1)}
                      </td>
                      <td
                        className="tabular px-3 py-2.5 text-right font-semibold"
                        style={{ color: BAND_COLOR[bandForOee(row.oee)] }}
                      >
                        {fmtPct(row.oee, 1)}
                      </td>
                      <td className="px-3 py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <Meter
                            value={Math.min(1, row.utilisation)}
                            color={row.utilisation > 0.92 ? STATUS.warning : SERIES[0]}
                            label={`${row.city} capacity used`}
                          />
                          <span className="tabular w-10 shrink-0 text-right text-[10px] text-[var(--text-muted)]">
                            {fmtPct(row.utilisation, 0)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </AppShell>
  );
}
