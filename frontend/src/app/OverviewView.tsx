"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import {
  Car,
  Gauge,
  Lightbulb,
  Route,
  ShieldCheck,
  SignpostBig,
  TriangleAlert,
} from "lucide-react";
import { PLANT_BY_ID, PLANTS } from "@/domain/stamping/catalog";
import { bandForFtt, bandForOee } from "@/domain/stamping/oee";
import { useFilterState, useOverview } from "@/hooks/useOverview";
import { AppShell } from "@/components/layout/AppShell";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { Card, CardBody, CardHeader, SectionLabel } from "@/components/ui/Card";
import { SplitStatTile } from "@/components/overview/SplitStatTile";
import { FactorySeriesChart } from "@/components/overview/FactorySeriesChart";
import { RoadblockPanel } from "@/components/overview/RoadblockPanel";
import { InsightsPanel } from "@/components/overview/InsightsPanel";
import { FactoryTable } from "@/components/overview/FactoryComparison";
import { ProcessFlowStripMap } from "@/components/process/ProcessFlowStripMap";
import { fmtInt, fmtPct } from "@/lib/format";
import { BAND_COLOR, BAND_LABEL, SERIES, STATUS, STATUS_TEXT } from "@/lib/theme";
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
      crumbs={overviewCrumbs()}
      search={search}
      insightScope={{ kind: "overview" }}
      insightData={data}
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

          {/* --- headline metrics, each opening into its factory split ------ */}

          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SplitStatTile
              label="Vehicles produced"
              value={fmtInt(data.totals.produced)}
              unit="vehicles"
              accent={SERIES[0]}
              icon={<Car size={14} />}
              split={data.splits.produced}
              formatSplit={(r) => fmtInt(r.value)}
              search={search}
              context={`${fmtInt(data.totals.good)} passed first time · ${fmtInt(
                data.totals.panels,
              )} panels stamped`}
            />
            <SplitStatTile
              label="Avg production / day"
              value={fmtInt(data.totals.avgPerDay)}
              unit="vehicles"
              accent={SERIES[2]}
              icon={<Gauge size={14} />}
              split={data.splits.avgPerDay}
              formatSplit={(r) => fmtInt(r.value)}
              search={search}
              context={`Across ${data.totals.days} production ${
                data.totals.days === 1 ? "day" : "days"
              }`}
            />
            <SplitStatTile
              label="Total rejections"
              value={fmtInt(data.totals.rejected)}
              unit="vehicles"
              accent={STATUS.critical}
              valueColor={STATUS_TEXT.critical}
              icon={<TriangleAlert size={14} />}
              split={data.splits.rejected}
              formatSplit={(r) => fmtInt(r.value)}
              search={search}
              context={`${fmtPct(data.totals.rejectRate, 2)} of build, rejected at any process`}
            />
            <SplitStatTile
              label="First time through"
              value={fmtPct(data.totals.rty, 1)}
              accent={SERIES[3]}
              valueColor={BAND_COLOR[bandForFtt(data.totals.rty)]}
              icon={<ShieldCheck size={14} />}
              split={data.splits.rty}
              formatSplit={(r) => fmtPct(r.value, 1)}
              search={search}
              context={`Rolled yield across all 8 processes · ${
                BAND_LABEL[bandForFtt(data.totals.rty)]
              }`}
            />
            <SplitStatTile
              label="Group OEE"
              value={fmtPct(data.totals.oee, 1)}
              accent={SERIES[5]}
              valueColor={BAND_COLOR[bandForOee(data.totals.oee)]}
              icon={<Gauge size={14} />}
              split={data.splits.oee}
              formatSplit={(r) => fmtPct(r.value, 1)}
              search={search}
              context={BAND_LABEL[bandForOee(data.totals.oee)]}
            />
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

          {/* --- trends ------------------------------------------------------ */}

          <SectionLabel>Trends — click a legend to show or hide a factory</SectionLabel>

          <div className="mb-6 grid grid-cols-1 gap-3 xl:grid-cols-2">
            <FactorySeriesChart
              title="Vehicles produced"
              subtitle={`Per ${data.bucket}, by factory`}
              metric="produced"
              metricDef={{ label: "Vehicles", format: (v) => fmtInt(v), isRate: false }}
              all={data.points}
              seriesByFactory={data.seriesByFactory}
              bucket={data.bucket}
            />
            <FactorySeriesChart
              title="Rejections"
              subtitle={`Vehicles rejected at any process, per ${data.bucket}`}
              metric="rejected"
              metricDef={{ label: "Rejected", format: (v) => fmtInt(v), isRate: false }}
              all={data.points}
              seriesByFactory={data.seriesByFactory}
              bucket={data.bucket}
            />
            <FactorySeriesChart
              title="First time through"
              subtitle={`Rolled yield across the chain, per ${data.bucket}`}
              metric="rty"
              metricDef={{ label: "FTT", format: (v) => fmtPct(v, 1), isRate: true }}
              all={data.points}
              seriesByFactory={data.seriesByFactory}
              bucket={data.bucket}
            />
            <FactorySeriesChart
              title="OEE"
              subtitle={`Effectiveness across the chain, per ${data.bucket}`}
              metric="oee"
              metricDef={{ label: "OEE", format: (v) => fmtPct(v, 1), isRate: true }}
              all={data.points}
              seriesByFactory={data.seriesByFactory}
              bucket={data.bucket}
            />
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

          <SectionLabel>Car manufacturing process — click a process for detail</SectionLabel>

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
              />
            </CardBody>
          </Card>
        </>
      )}
    </AppShell>
  );
}
