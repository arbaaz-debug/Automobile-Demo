"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { ArrowRight, Car, SignpostBig } from "lucide-react";
import { PLANTS } from "@/domain/stamping/catalog";
import { useFilterState, useOverview } from "@/hooks/useOverview";
import { AppShell } from "@/components/layout/AppShell";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { FactoryMap, MapLegend } from "@/components/landing/FactoryMap";
import { RoadblockPanel } from "@/components/overview/RoadblockPanel";
import { Card, CardHeader } from "@/components/ui/Card";
import { fmtInt, fmtPct } from "@/lib/format";
import { STATUS_TEXT } from "@/lib/theme";
import { routes } from "@/lib/routes";
import type { OverviewData } from "@/services/data/overview";

/**
 * The portal's landing page: where the factories are, and how the group is
 * doing.
 *
 * Deliberately thin. It answers "where are we and is anything wrong" and hands
 * off — the analysis lives one click away on the overview. Every number here is
 * a value and its movement, nothing more, because a landing page that tries to
 * explain is a landing page nobody reads.
 */
export function LandingView() {
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
      crumbs={[{ label: "Home" }]}
      search={search}
      insightScope={{ kind: "overview" }}
      insightFilters={filters}
    >
      {!data ? (
        <PageSkeleton />
      ) : (
        <>
          {/* --- title, and the way through to the detail ------------------- */}

          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[20px] font-semibold tracking-tight text-[var(--text-primary)]">
                Mahindra manufacturing · India
              </h1>
              <p className="mt-1 text-[12px] text-[var(--text-muted)]">
                {PLANTS.length} factories · {data.windowLabel}
              </p>
            </div>

            <Link
              href={routes.overview(search)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--series-1)] bg-[var(--series-1)] px-3 py-2 text-[12px] font-semibold text-white transition hover:brightness-110"
            >
              View details
              <ArrowRight size={14} aria-hidden />
            </Link>
          </div>

          {/* --- metrics: production on the left, the rest on the same line --
              One row so the group's output and the four measures that qualify
              it are read together, rather than the eye travelling down a column
              to find out whether the headline is good news. */}

          <div className="mb-3 flex flex-wrap items-stretch justify-between gap-3">
            <HeadlineMetric
              label="Total vehicles produced"
              value={fmtInt(data.totals.produced)}
              unit="vehicles"
              change={groupChange(data, "produced")}
            />

            <div className="grid min-w-0 flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricCard
                label="Avg production / day"
                value={fmtInt(data.totals.avgPerDay)}
                change={groupChange(data, "avgPerDay")}
              />
              <MetricCard
                label="Total rejections"
                value={fmtInt(data.totals.rejected)}
                change={groupChange(data, "rejected")}
                inverse
              />
              <MetricCard
                label="First time through"
                value={fmtPct(data.totals.rty, 1)}
                change={groupChange(data, "rty")}
              />
              <MetricCard
                label="Group OEE"
                value={fmtPct(data.totals.oee, 1)}
                change={groupChange(data, "oee")}
              />
            </div>
          </div>

          {/* --- map, with what needs attention beside it -------------------- */}

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
            <section
              aria-labelledby="map-panel-title"
              className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--surface-1)]"
            >
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2.5">
                <h2
                  id="map-panel-title"
                  className="text-[13px] font-semibold tracking-tight text-[var(--text-primary)]"
                >
                  Factory locations
                </h2>
                <MapLegend />
              </header>
              <div className="relative min-h-[520px] flex-1 overflow-hidden rounded-b-lg">
                <FactoryMap
                  factories={data.factories}
                  search={search}
                  className="absolute inset-0"
                />
              </div>
            </section>

            <Card className="flex flex-col overflow-hidden">
              <CardHeader
                title="Needs attention"
                subtitle="Where each factory is blocked, worst first"
                icon={<SignpostBig size={14} />}
              />
              <div className="min-h-0 flex-1 overflow-y-auto">
                <RoadblockPanel factories={data.factories} search={search} layout="stack" />
              </div>
            </Card>
          </div>

        </>
      )}
    </AppShell>
  );
}

/** The headline number, set apart from the four supporting metrics. */
function HeadlineMetric({
  label,
  value,
  unit,
  change,
}: {
  label: string;
  value: string;
  unit: string;
  change: number | null;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-5 py-3.5">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-muted)]">
        <Car size={13} aria-hidden />
        {label}
      </p>
      <p className="mt-2 flex items-baseline gap-2">
        <span className="text-[34px] font-semibold leading-none tracking-tight text-[var(--text-primary)]">
          {value}
        </span>
        <span className="text-[13px] text-[var(--text-muted)]">{unit}</span>
        <Change change={change} />
      </p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  change,
  inverse,
}: {
  label: string;
  value: string;
  change: number | null;
  inverse?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-2 flex items-baseline gap-2">
        <span className="text-[24px] font-semibold leading-none tracking-tight text-[var(--text-primary)]">
          {value}
        </span>
        <Change change={change} inverse={inverse} />
      </p>
    </div>
  );
}

/**
 * Movement against the previous window.
 *
 * Up is green and down is red, except where a rise is the bad outcome — more
 * rejections is not good news, so that card inverts the colour while keeping
 * the arrow pointing the way the number actually moved.
 */
function Change({ change, inverse }: { change: number | null; inverse?: boolean }) {
  if (change === null) {
    return <span className="text-[11px] text-[var(--text-muted)]">no prior window</span>;
  }
  const up = change >= 0;
  const good = inverse ? !up : up;

  return (
    <span
      className="inline-flex items-center gap-1 text-[12px] font-semibold"
      style={{ color: good ? STATUS_TEXT.good : STATUS_TEXT.critical }}
    >
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      {Math.abs(change * 100).toFixed(1)}%
      <span className="sr-only">{up ? "up" : "down"} versus the previous window</span>
    </span>
  );
}

type MetricId = "produced" | "avgPerDay" | "rejected" | "rty" | "oee";

/**
 * The group's movement, rebuilt from the per-factory previous values.
 *
 * Counts are summed; rates are re-weighted by production, because a mean of
 * five percentages would let the smallest plant move the group figure as much
 * as the largest.
 */
function groupChange(data: OverviewData, metric: MetricId): number | null {
  const rows = data.factories;
  if (rows.length === 0) return null;

  const current: Record<MetricId, number> = {
    produced: data.totals.produced,
    avgPerDay: data.totals.avgPerDay,
    rejected: data.totals.rejected,
    rty: data.totals.rty,
    oee: data.totals.oee,
  };

  const isRate = metric === "rty" || metric === "oee";

  if (isRate) {
    const weight = rows.reduce((a, f) => a + f.deltas.produced.previous, 0);
    if (weight <= 0) return null;
    const previous =
      rows.reduce((a, f) => a + f.deltas[metric].previous * f.deltas.produced.previous, 0) /
      weight;
    return previous > 0 ? (current[metric] - previous) / previous : null;
  }

  const previous = rows.reduce((a, f) => a + f.deltas[metric].previous, 0);
  return previous > 0 ? (current[metric] - previous) / previous : null;
}
