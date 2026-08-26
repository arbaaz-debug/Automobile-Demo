"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useId, useState } from "react";
import { ChevronDown, Lightbulb, Route, SignpostBig } from "lucide-react";
import { PLANT_BY_ID, PLANTS } from "@/domain/stamping/catalog";
import { useFilterState, useOverview } from "@/hooks/useOverview";
import { AppShell } from "@/components/layout/AppShell";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { Card, CardBody, CardHeader, SectionLabel } from "@/components/ui/Card";
import { MetricSplitSection, type MetricDef } from "@/components/overview/MetricSplitSection";
import { RoadblockPanel } from "@/components/overview/RoadblockPanel";
import { InsightsPanel } from "@/components/overview/InsightsPanel";
import { FactoryTable } from "@/components/overview/FactoryComparison";
import { ProcessFlowStripMap } from "@/components/process/ProcessFlowStripMap";
import { cn, fmtInt, fmtPct } from "@/lib/format";
import { STATUS_TEXT } from "@/lib/theme";
import { overviewCrumbs } from "@/lib/routes";

/**
 * Pan-India overview — the portal's landing page.
 *
 * Everything answers the same question over the same window: how is the vehicle
 * programme running across every factory in India. The factory and time filters
 * in the header scope every tile, trend, table and the process map together — a
 * page where each card carried its own window would let two numbers on one
 * screen disagree.
 *
 * The unit throughout is **vehicles**. Panels appear once, as a footnote on the
 * production tile, because that is the press shop's unit and this page is not
 * the press shop.
 *
 * Reading order is deliberate: the headline numbers, then where the group is
 * blocked, then what to do about it, then the trends, then the factory table,
 * and the process chain last — it is the reference diagram, not the daily
 * question.
 */
/**
 * The five headline metrics, and how each is best split across factories.
 *
 * Production is a comparison against each plant's own target — a bar against a
 * benchmark. The other four are movements over time — a line per factory. The
 * form follows the question rather than being uniform for its own sake.
 */
const METRICS: MetricDef[] = [
  {
    id: "produced",
    label: "Vehicles produced",
    form: "bar",
    format: (v) => fmtInt(v),
    isRate: false,
    read: (f) => f.produced,
    delta: (f) => f.deltas.produced,
    subtitle: "Vehicles built per factory against its scheduled programme",
  },
  {
    id: "avgPerDay",
    label: "Avg production / day",
    form: "line",
    metric: "produced",
    format: (v) => fmtInt(v),
    isRate: false,
    read: (f) => f.avgPerDay,
    delta: (f) => f.deltas.avgPerDay,
    subtitle: "Vehicles per factory",
  },
  {
    id: "rejected",
    label: "Total rejections",
    form: "line",
    metric: "rejected",
    format: (v) => fmtInt(v),
    isRate: false,
    read: (f) => f.rejected,
    delta: (f) => f.deltas.rejected,
    inverse: true,
    subtitle: "Vehicles rejected at any process",
    // The count alone does not say whether it is a lot. The rate is rejections
    // against vehicles built, across the whole chain — not any one process.
    context: (d) => `${fmtPct(d.totals.rejectRate, 1)} rejection rate`,
  },
  {
    id: "rty",
    label: "First time through",
    form: "line",
    metric: "rty",
    format: (v) => fmtPct(v, 1),
    isRate: true,
    read: (f) => f.rty,
    delta: (f) => f.deltas.rty,
    subtitle: "Rolled yield across the chain",
  },
  {
    id: "oee",
    label: "Group OEE",
    form: "line",
    metric: "oee",
    format: (v) => fmtPct(v, 1),
    isRate: true,
    read: (f) => f.oee,
    delta: (f) => f.deltas.oee,
    subtitle: "Effectiveness across the chain",
  },
];

export function OverviewView() {
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

  // Which metric accordions are open. All open by default: the split across
  // factories is the point of the page, not an optional detail, so it should
  // not need five clicks to see. Each still closes individually.
  const [openMetricIds, setOpenMetricIds] = useState<Set<string>>(
    () => new Set(METRICS.map((m) => m.id)),
  );

  const search = searchParams?.toString() ?? "";
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
      crumbs={overviewCrumbs(search)}
      search={search}
      insightScope={{ kind: "overview" }}
      insightFilters={filters}
    >
      {!data ? (
        <PageSkeleton />
      ) : (
        <>
          <header className="mb-5">
            <h1 className="text-[20px] font-semibold tracking-tight text-[var(--text-primary)]">
              Pan-India manufacturing overview
            </h1>
            <p className="mt-1 text-[12px] text-[var(--text-muted)]">
              {scopeName} · {data.windowLabel} · {data.plantIds.length} of {PLANTS.length}{" "}
              factories · vehicles off the end of the line
            </p>
          </header>

          {/* --- headline metrics, each its own accordion --------------------
              Every card carries its own graph and summary in place, at the
              card's width, open on arrival and closable one by one.
              `items-start` keeps a closed card at its natural height rather
              than stretching it to match an open neighbour. */}

          <div className="mb-6 grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {METRICS.map((m) => (
              <MetricAccordion
                key={m.id}
                metric={m}
                data={data}
                open={openMetricIds.has(m.id)}
                onToggle={() =>
                  setOpenMetricIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(m.id)) next.delete(m.id);
                    else next.add(m.id);
                    return next;
                  })
                }
              />
            ))}
          </div>

          {/* --- roadblocks + recommendations -------------------------------
              Side by side: the left card says where output is being lost, the
              right says what to do about it. They are read together, so they
              sit together. Stacked below xl, where two half-width tables would
              each need horizontal scrolling. */}

          <SectionLabel>Where output is being lost — and what to do about it</SectionLabel>

          {/* Default `stretch` alignment, so the pair reads as one row rather
              than two cards of unrelated heights. */}
          <div className="mb-6 grid grid-cols-1 gap-3 xl:grid-cols-2">
            <Card>
              <CardHeader
                title="Roadblocks by factory"
                subtitle="The constraint caps what a plant can build; the weakest process is where it loses what it can"
                icon={<SignpostBig size={14} />}
              />
              <RoadblockPanel factories={data.factories} search={search} />
            </Card>

            <Card>
              <CardHeader
                title="Factory → process insights"
                subtitle="Generated from threshold crossings in the same chain the page reports"
                icon={<Lightbulb size={14} />}
              />
              <InsightsPanel
                insights={data.insights}
                factories={data.factories}
                search={search}
                initialCount={6}
              />
            </Card>
          </div>

          {/* --- factory table ----------------------------------------------- */}

          <SectionLabel>Factory performance</SectionLabel>

          <Card className="mb-6">
            <CardHeader
              title="All factories"
              subtitle="Click a factory to open its models and processes"
            />
            <FactoryTable factories={data.factories} search={search} />
          </Card>

          {/* --- process chain, last ------------------------------------------ */}

          <SectionLabel>Car manufacturing process — click a process to open it at the factory running it worst</SectionLabel>

          <Card className="mb-6">
            <CardHeader
              title="Vehicle manufacturing flow"
              subtitle={`${scopeName} · both streams converge at body-chassis marriage · ${data.chain.bottleneckDef.name} is the constraint`}
              icon={<Route size={14} />}
            />
            <CardBody>
              <ProcessFlowStripMap
                chain={data.chain.chain}
                bottleneckId={data.chain.bottleneck.processId}
                search={search}
                factories={data.factories}
              />
            </CardBody>
          </Card>
        </>
      )}
    </AppShell>
  );
}

/**
 * A headline number that opens its own graph in place.
 *
 * The graph is constrained to the card rather than breaking out to full width,
 * so the number and the split it belongs to stay together. Pressed state is
 * carried by the chevron and `aria-expanded`, not colour alone.
 */
function MetricAccordion({
  metric,
  data,
  open,
  onToggle,
}: {
  metric: MetricDef;
  data: NonNullable<ReturnType<typeof useOverview>["data"]>;
  open: boolean;
  onToggle: () => void;
}) {
  const id = useId();
  const value = TOTAL_FOR[metric.id](data);
  const groupDelta = groupChange(metric, data);
  const up = (groupDelta ?? 0) >= 0;
  const good = metric.inverse ? !up : up;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-lg border bg-[var(--surface-1)] transition",
        open ? "border-[var(--series-1)]" : "border-[var(--border)]",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        className="flex flex-col items-stretch p-4 text-left transition hover:bg-[var(--surface-raised)]"
      >
        <span className="flex items-start justify-between gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-muted)]">
            {metric.label}
          </span>
          <ChevronDown
            size={14}
            aria-hidden
            className={cn(
              "shrink-0 text-[var(--text-muted)] transition-transform",
              open && "rotate-180",
            )}
          />
        </span>

        <span className="mt-3 text-[26px] font-semibold leading-none tracking-tight text-[var(--text-primary)]">
          {metric.format(value)}
        </span>

        {metric.context ? (
          <span className="mt-1.5 text-[11px] text-[var(--text-secondary)]">
            {metric.context(data)}
          </span>
        ) : null}

        <span className="mt-2 flex items-center gap-2 text-[11px]">
          {groupDelta === null ? (
            <span className="text-[var(--text-muted)]">no prior window</span>
          ) : (
            <>
              <span
                className="font-semibold"
                style={{ color: good ? STATUS_TEXT.good : STATUS_TEXT.critical }}
              >
                <span aria-hidden>{up ? "\u25B2" : "\u25BC"}</span>{" "}
                {Math.abs(groupDelta * 100).toFixed(1)}%
              </span>
              <span className="text-[var(--text-muted)]">vs previous</span>
            </>
          )}
        </span>
      </button>

      {open ? (
        <div id={`${id}-panel`} className="min-w-0 border-t border-[var(--border)]">
          <MetricSplitSection data={data} metric={metric} compact />
        </div>
      ) : null}
    </div>
  );
}

/** Group value for each metric, so the tile and the split cannot disagree. */
const TOTAL_FOR: Record<
  string,
  (d: NonNullable<ReturnType<typeof useOverview>["data"]>) => number
> = {
  produced: (d) => d.totals.produced,
  avgPerDay: (d) => d.totals.avgPerDay,
  rejected: (d) => d.totals.rejected,
  rty: (d) => d.totals.rty,
  oee: (d) => d.totals.oee,
};

/**
 * The group's change, rebuilt from the per-factory previous values.
 *
 * Summing counts and re-weighting rates rather than averaging the factory
 * percentages — a mean of five percentages would let the smallest plant move
 * the group figure as much as the largest.
 */
function groupChange(
  metric: MetricDef,
  data: NonNullable<ReturnType<typeof useOverview>["data"]>,
): number | null {
  const rows = data.factories;
  if (rows.length === 0) return null;

  const current = TOTAL_FOR[metric.id](data);

  if (metric.isRate) {
    const prevWeight = rows.reduce((a, f) => a + f.deltas.produced.previous, 0);
    if (prevWeight <= 0) return null;
    const previous =
      rows.reduce((a, f) => a + metric.delta(f).previous * f.deltas.produced.previous, 0) /
      prevWeight;
    return previous > 0 ? (current - previous) / previous : null;
  }

  // Each factory's stored `previous` is already in the metric's own unit —
  // avgPerDay is per-day on both sides — so summing is the whole job. Dividing
  // by the window length again here is what produced a +600% reading.
  const previous = rows.reduce((a, f) => a + metric.delta(f).previous, 0);
  return previous > 0 ? (current - previous) / previous : null;
}
