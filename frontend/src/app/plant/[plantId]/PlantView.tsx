"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  BatteryCharging,
  Boxes,
  CircleCheck,
  Gauge,
  Layers,
  MapPin,
  Move3d,
  TriangleAlert,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { useNow, useSnapshot } from "@/hooks/useSnapshot";
import { useFilterState } from "@/hooks/useOverview";
import { plantCrumbs, routes } from "@/lib/routes";
import { AppShell, type WindowControls } from "@/components/layout/AppShell";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { Card, CardHeader, SectionLabel } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { OeeGauge } from "@/components/ui/OeeGauge";
import { StatusPill } from "@/components/ui/StatusPill";
import { ProcessFlowStrip } from "@/components/process/ProcessFlowStrip";
import { StationDetailPanel } from "@/components/process/StationDetailPanel";
import { ProductionTrendChart } from "@/components/charts/ProductionTrendChart";
import { RejectionPareto } from "@/components/charts/RejectionPareto";
import { ShiftComparisonChart } from "@/components/charts/ShiftComparisonChart";
import { EnergyChart } from "@/components/charts/EnergyChart";
import { SkuBreakdownTable } from "@/components/charts/SkuBreakdownTable";
import { DowntimeCard } from "@/components/plant/DowntimeCard";
import { SKU_BY_ID } from "@/domain/stamping/catalog";
import { bandForFtt, bandForOee } from "@/domain/stamping/oee";
import { energyCostInr, shiftsInWindow, toDayKey } from "@/domain/stamping/simulator";

import { BAND_COLOR, SERIES, STATUS, STATUS_TEXT } from "@/lib/theme";
import { cn, fmtDec, fmtEnergy, fmtInr, fmtInt, fmtPct } from "@/lib/format";

// The scene mounts a WebGL canvas, so it is client-only and code-split away
// from the initial page payload.
const PressLineScene = dynamic(
  () => import("@/components/three/PressLineScene").then((m) => m.PressLineScene),
  {
    ssr: false,
    loading: () => (
      <div className="skeleton h-full w-full rounded-b-lg" aria-label="Loading 3D press line" />
    ),
  },
);

export function PlantView({ plantId }: { plantId: string }) {
  const { ready } = useAuth();
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

  // Shares the portal's filter state, so the date and shift you were looking at
  // on the overview follow you into a factory instead of resetting.
  const filters = useFilterState(searchParams, push);
  const { dateIso, shiftId } = filters;

  const [lineId, setLineId] = useState<string | null>(null);
  const [stationId, setStationId] = useState<string | null>(null);

  const { snapshot, source, loading, updatedAt, refresh } = useSnapshot(dateIso, shiftId);
  const now = useNow();

  const plant = snapshot?.plants.find((p) => p.plantId === plantId) ?? null;

  // Default to the first press line, and keep the selection valid as data moves.
  const activeLine = useMemo(() => {
    if (!plant) return null;
    return plant.lines.find((l) => l.lineId === lineId) ?? plant.lines[1] ?? plant.lines[0];
  }, [plant, lineId]);

  // Derived, not stored: `stationId` holds only an explicit user choice, and the
  // default falls back to the draw press — the operation that governs the line.
  // Deriving avoids an effect that would fight the user's selection as data
  // refreshes underneath it.
  const selectedStation = useMemo(() => {
    if (!activeLine) return null;
    const chosen = activeLine.stations.find((s) => s.stationId === stationId);
    if (chosen) return chosen;
    return (
      activeLine.stations.find(
        (s) => s.def.kind === "draw" || s.def.kind === "blanking",
      ) ??
      activeLine.stations[0] ??
      null
    );
  }, [activeLine, stationId]);

  const controls: WindowControls = {
    dateIso,
    shiftId,
    rangeId: filters.rangeId,
    plantId: filters.plantId,
    setDateIso: filters.setDateIso,
    setShiftId: filters.setShiftId,
    setRangeId: filters.setRangeId,
    setPlantId: filters.setPlantId,
  };

  const search = searchParams?.toString() ?? "";

  if (!ready) return <PageSkeleton />;

  return (
    <AppShell
      controls={controls}
      source={source}
      updatedAt={updatedAt}
      onRefresh={refresh}
      loading={loading}
      crumbs={plantCrumbs(plantId, search)}
      search={search}
      /* This page is one factory by definition — a factory picker here would
         contradict the route rather than filter it. */
      showFactoryFilter={false}
    >
      {!snapshot || !plant || !activeLine ? (
        <PageSkeleton inline />
      ) : (
        <>
          {/* Plant header */}
          <div className="mb-4">
            <Link
              href={routes.overview(search)}
              className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
            >
              <ArrowLeft size={12} />
              Pan-India overview
            </Link>
            <div className="mt-1.5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-[19px] font-semibold tracking-tight">{plant.def.name}</h1>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--text-muted)]">
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={11} />
                    {plant.def.city}, {plant.def.state}
                  </span>
                  <span>{snapshot.window.label}</span>
                  <span>
                    Press shop {fmtInt(plant.def.pressShopAreaM2)} m² ·{" "}
                    {fmtInt(plant.def.contractDemandKva)} kVA contract demand
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Plant KPIs */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatTile
              label="Panels produced"
              value={fmtInt(plant.quality.produced)}
              unit="panels"
              accent={SERIES[0]}
              icon={<Layers size={14} />}
              spark={plant.trend.map((t) => t.produced)}
              context={`${fmtInt(plant.quality.good)} good · press lines only`}
            />
            <StatTile
              label="First time through"
              value={fmtPct(plant.quality.ftt)}
              accent={BAND_COLOR[bandForFtt(plant.quality.ftt)]}
              valueColor={BAND_COLOR[bandForFtt(plant.quality.ftt)]}
              icon={<CircleCheck size={14} />}
              context={`${fmtInt(plant.quality.dpmo)} DPMO`}
            />
            <StatTile
              label="Rejections"
              value={fmtInt(plant.quality.rejected)}
              unit="panels"
              accent={STATUS.critical}
              valueColor={STATUS_TEXT.critical}
              icon={<TriangleAlert size={14} />}
              spark={plant.trend.map((t) => t.rejected)}
              context={`${fmtInt(plant.quality.reworked)} reworked`}
            />
            <StatTile
              label="Plant OEE"
              value={fmtPct(plant.oee.oee)}
              accent={BAND_COLOR[bandForOee(plant.oee.oee)]}
              valueColor={BAND_COLOR[bandForOee(plant.oee.oee)]}
              icon={<Gauge size={14} />}
              context={`${fmtInt(plant.oee.downtimeMin)} min downtime`}
            />
            <StatTile
              label="Energy"
              value={fmtEnergy(plant.energy.kwh)}
              accent={SERIES[3]}
              icon={<BatteryCharging size={14} />}
              spark={plant.trend.map((t) => t.kwh)}
              context={`${fmtDec(plant.energy.kwhPerPanel, 2)} kWh/panel · ${fmtInr(
                energyCostInr(plant.energy.kwh),
              )}`}
            />
          </div>

          {/* Line selector */}
          <div className="mt-6">
            <SectionLabel>Press lines</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {plant.lines.map((line) => {
                const active = line.lineId === activeLine.lineId;
                const sku = line.currentSkuId ? SKU_BY_ID.get(line.currentSkuId) : null;
                return (
                  <button
                    key={line.lineId}
                    type="button"
                    onClick={() => {
                      setLineId(line.lineId);
                      setStationId(null);
                    }}
                    aria-pressed={active}
                    className={cn(
                      "min-w-[192px] rounded-lg border px-3 py-2.5 text-left transition",
                      active
                        ? "border-[var(--series-1)] bg-[var(--series-1)]/10"
                        : "border-[var(--border)] bg-[var(--surface-1)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-semibold">{line.def.name}</span>
                      <StatusPill status={line.status} size="sm" showLabel={false} />
                    </div>
                    <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                      {fmtInt(line.def.headlineTonnage)} T ·{" "}
                      {line.def.type === "transfer"
                        ? "Servo transfer"
                        : line.def.type === "blanking"
                          ? "Blanking"
                          : "Tandem"}{" "}
                      · {line.stations.length} ops
                    </p>
                    <div className="mt-2 flex items-baseline gap-3 text-[11px]">
                      <span className="tabular font-medium">
                        {fmtInt(line.quality.produced)}
                        <span className="ml-1 font-normal text-[var(--text-muted)]">
                          {line.def.type === "blanking" ? "blanks" : "panels"}
                        </span>
                      </span>
                      <span
                        className="tabular"
                        style={{ color: BAND_COLOR[bandForOee(line.oee.oee)] }}
                      >
                        {fmtPct(line.oee.oee, 0)} OEE
                      </span>
                      <span className="tabular text-[var(--text-muted)]">
                        {fmtInt(line.panelsPerHour)}/h
                      </span>
                    </div>
                    {sku ? (
                      <p className="mt-1 truncate text-[10px] text-[var(--text-muted)]">
                        {sku.name}
                      </p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3D process visualisation + station detail */}
          <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_384px]">
            <Card className="flex flex-col overflow-hidden">
              <CardHeader
                title={`${activeLine.def.name} — live process view`}
                subtitle="Ram speed follows measured SPM · beacon colour is live status · click a machine to inspect it"
                icon={<Move3d size={14} />}
                action={<SceneLegend />}
              />
              <div className="h-[430px] w-full">
                <PressLineScene
                  key={activeLine.lineId}
                  line={activeLine}
                  selectedStationId={selectedStation?.stationId ?? null}
                  onSelectStation={setStationId}
                  className="h-full w-full"
                />
              </div>
              <div className="border-t border-[var(--border)]">
                <ProcessFlowStrip
                  line={activeLine}
                  selectedStationId={selectedStation?.stationId ?? null}
                  onSelect={setStationId}
                />
              </div>
            </Card>

            <Card className="max-h-[720px] overflow-hidden">
              {selectedStation ? (
                <StationDetailPanel station={selectedStation} now={now} />
              ) : null}
            </Card>
          </div>

          {/* Line summary */}
          <div className="mt-6">
            <SectionLabel>{activeLine.def.name} — line performance</SectionLabel>
            <div className="grid gap-3 xl:grid-cols-[300px_1fr_1fr]">
              <Card className="flex flex-col">
                <CardHeader title="Line OEE" subtitle={snapshot.window.label} />
                <div className="flex flex-1 flex-col justify-center px-5 py-4">
                  <OeeGauge oee={activeLine.oee} />
                </div>
              </Card>
              <ProductionTrendChart trend={plant.trend} height={286} />
              <RejectionPareto
                byDefect={activeLine.quality.byDefect}
                height={286}
                subtitle={`${activeLine.def.name} · click a reason for the corrective action`}
              />
            </div>
          </div>

          {/* Downtime, shifts, energy */}
          <div className="mt-3 grid gap-3 xl:grid-cols-3">
            <DowntimeCard
              lineId={activeLine.lineId}
              lineName={activeLine.def.name}
              dayKey={toDayKey(snapshot.window.from)}
              shifts={shiftsInWindow(snapshot.window)}
              totalDowntimeMin={activeLine.oee.downtimeMin}
            />
            <ShiftComparisonChart shifts={plant.shiftBreakdown} height={214} />
            <EnergyChart trend={plant.trend} height={214} title="Plant energy consumption" />
          </div>

          {/* Station matrix */}
          <div className="mt-6">
            <SectionLabel>All operations across every line</SectionLabel>
            <Card>
              <CardHeader
                title="Process station matrix"
                subtitle="Status, throughput, OEE, health and energy for every stamping operation · blanking lines report blanks, press lines report finished panels"
                icon={<Boxes size={14} />}
              />
              <StationMatrix
                lines={plant.lines}
                onSelect={(lId, sId) => {
                  setLineId(lId);
                  setStationId(sId);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            </Card>
          </div>

          {/* SKU level */}
          <div className="mt-6">
            <SectionLabel>SKU level — Thar panels at {plant.def.city}</SectionLabel>
            <Card>
              <CardHeader
                title="Panel SKU performance"
                subtitle="Schedule attainment, quality, OEE and specific energy"
              />
              <SkuBreakdownTable skus={plant.skuBreakdown} />
            </Card>
          </div>
        </>
      )}
    </AppShell>
  );
}

function SceneLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {(
        [
          ["Running", STATUS.good],
          ["Idle", STATUS.warning],
          ["Die change", STATUS.serious],
          ["Breakdown", STATUS.critical],
        ] as const
      ).map(([label, color]) => (
        <li key={label} className="flex items-center gap-1 text-[10px]">
          <span
            aria-hidden
            className="size-1.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="text-[var(--text-muted)]">{label}</span>
        </li>
      ))}
    </ul>
  );
}

function StationMatrix({
  lines,
  onSelect,
}: {
  lines: import("@/domain/stamping/types").LineSnapshot[];
  onSelect: (lineId: string, stationId: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-[12px]">
        <caption className="sr-only">
          Every stamping operation with its status, output, OEE, health and energy
        </caption>
        <thead>
          <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            <th scope="col" className="py-2 pl-4 text-left font-medium">
              Line / operation
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Status
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              SPM
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Count
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Rejected
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              OEE
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Health
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Die life
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">
              Energy
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <Fragment key={line.lineId}>
              <tr className="bg-[var(--surface-2)]">
                <th
                  scope="rowgroup"
                  colSpan={9}
                  className="py-1.5 pl-4 text-left text-[11px] font-semibold text-[var(--text-secondary)]"
                >
                  {line.def.name}
                  <span className="ml-2 font-normal text-[var(--text-muted)]">
                    {fmtInt(line.def.headlineTonnage)} T · {fmtInt(line.panelsPerHour)} panels/h ·
                    bottleneck {line.bottleneckStationId.split("-").pop()}
                  </span>
                </th>
              </tr>
              {line.stations.map((s) => {
                const dieUsage = s.health.dieStrokes / s.health.dieLifeStrokes;
                return (
                  <tr
                    key={s.stationId}
                    onClick={() => onSelect(line.lineId, s.stationId)}
                    className="cursor-pointer border-b border-[var(--border)]/50 transition hover:bg-[var(--surface-2)]"
                  >
                    <th scope="row" className="py-2 pl-4 text-left font-normal">
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {s.def.opCode}
                      </span>
                      <span className="ml-2 text-[var(--text-primary)]">{s.def.name}</span>
                    </th>
                    <td className="px-3 py-2">
                      <StatusPill status={s.status} size="sm" />
                    </td>
                    <td className="tabular px-3 py-2 text-right text-[var(--text-secondary)]">
                      {s.status === "running" ? fmtDec(s.spm) : "—"}
                    </td>
                    <td className="tabular px-3 py-2 text-right">{fmtInt(s.count)}</td>
                    <td className="tabular px-3 py-2 text-right"
                      style={{ color: STATUS_TEXT.critical }}>
                      {fmtInt(s.quality.rejected)}
                    </td>
                    <td
                      className="tabular px-3 py-2 text-right font-medium"
                      style={{ color: BAND_COLOR[bandForOee(s.oee.oee)] }}
                    >
                      {fmtPct(s.oee.oee, 0)}
                    </td>
                    <td className="tabular px-3 py-2 text-right text-[var(--text-secondary)]">
                      {fmtInt(s.health.healthIndex)}
                    </td>
                    <td
                      className="tabular px-3 py-2 text-right"
                      style={{
                        color: dieUsage > 0.85 ? STATUS_TEXT.warning : "var(--text-secondary)",
                      }}
                    >
                      {fmtPct(dieUsage, 0)}
                    </td>
                    <td className="tabular py-2 pr-4 text-right text-[var(--text-secondary)]">
                      {fmtEnergy(s.energy.kwh)}
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
