"use client";

import { useMemo, useState } from "react";
import {
  BatteryCharging,
  CircleCheck,
  Gauge,
  Layers,
  TriangleAlert,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { useSnapshot } from "@/hooks/useSnapshot";
import { AppShell, type WindowControls } from "@/components/layout/AppShell";
import { PlantCard } from "@/components/plant/PlantCard";
import { StatTile } from "@/components/ui/StatTile";
import { OeeGauge } from "@/components/ui/OeeGauge";
import { Card, CardHeader, SectionLabel } from "@/components/ui/Card";
import { ProductionTrendChart } from "@/components/charts/ProductionTrendChart";
import { RejectionPareto } from "@/components/charts/RejectionPareto";
import { ShiftComparisonChart } from "@/components/charts/ShiftComparisonChart";
import { EnergyChart } from "@/components/charts/EnergyChart";
import { SkuBreakdownTable } from "@/components/charts/SkuBreakdownTable";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import {
  bandForFtt,
  bandForOee,
  rollupShiftMetrics,
  rollupSkuMetrics,
} from "@/domain/stamping/oee";
import { energyCostInr } from "@/domain/stamping/simulator";
import { GRID_EMISSION_FACTOR } from "@/domain/stamping/catalog";
import type { ShiftId, ShiftMetrics, TrendPoint } from "@/domain/stamping/types";
import { BAND_COLOR, SERIES, STATUS, STATUS_TEXT } from "@/lib/theme";
import { fmtDec, fmtEnergy, fmtInr, fmtInt, fmtPct, todayIso } from "@/lib/format";

export default function OverviewPage() {
  const { ready } = useAuth();
  const [dateIso, setDateIso] = useState(todayIso);
  const [shiftId, setShiftId] = useState<ShiftId | "all">("all");

  const { snapshot, source, loading, updatedAt, refresh } = useSnapshot(dateIso, shiftId);
  const controls: WindowControls = { dateIso, shiftId, setDateIso, setShiftId };

  // Aggregate the per-plant breakdowns into a group view.
  const group = useMemo(() => {
    if (!snapshot) return null;
    return {
      skus: rollupSkuMetrics(snapshot.plants.map((p) => p.skuBreakdown)).sort(
        (a, b) => b.produced - a.produced,
      ),
      shifts: rollupShiftMetrics(snapshot.plants.map((p) => p.shiftBreakdown)),
      trend: mergeTrends(snapshot.plants.map((p) => p.trend)),
    };
  }, [snapshot]);

  // Hold the shell until the session resolves, so a live IOsense hand-off
  // is in place before the first snapshot request goes out.
  if (!ready) return <PageSkeleton />;

  return (
    <AppShell
      controls={controls}
      source={source}
      updatedAt={updatedAt}
      onRefresh={refresh}
      loading={loading}
    >
      {!snapshot || !group ? (
        <PageSkeleton inline />
      ) : (
        <>
          <div className="mb-4">
            <h1 className="text-[19px] font-semibold tracking-tight">
              Steel stamping · group overview
            </h1>
            <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
              {snapshot.window.label} · Mahindra Thar bonnet, door and side body panels ·{" "}
              {snapshot.plants.length} plants · counts are finished panels off the press
              lines (blanks excluded)
            </p>
          </div>

          {/* Headline measures */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatTile
              label="Panels produced"
              value={fmtInt(snapshot.totals.produced)}
              unit="panels"
              accent={SERIES[0]}
              icon={<Layers size={14} />}
              spark={group.trend.map((t) => t.produced)}
              context={`${fmtInt(snapshot.totals.good)} good · ${fmtInt(
                snapshot.totals.produced / Math.max(1, group.trend.length),
              )}/h`}
            />
            <StatTile
              label="First time through"
              value={fmtPct(snapshot.totals.quality.ftt)}
              accent={BAND_COLOR[bandForFtt(snapshot.totals.quality.ftt)]}
              valueColor={BAND_COLOR[bandForFtt(snapshot.totals.quality.ftt)]}
              icon={<CircleCheck size={14} />}
              context={`${fmtInt(snapshot.totals.quality.dpmo)} DPMO`}
            />
            <StatTile
              label="Total rejections"
              value={fmtInt(snapshot.totals.rejected)}
              unit="panels"
              accent={STATUS.critical}
              valueColor={STATUS_TEXT.critical}
              icon={<TriangleAlert size={14} />}
              spark={group.trend.map((t) => t.rejected)}
              context={`${fmtInt(snapshot.totals.quality.reworked)} recovered by rework`}
            />
            <StatTile
              label="Group OEE"
              value={fmtPct(snapshot.totals.oee.oee)}
              accent={BAND_COLOR[bandForOee(snapshot.totals.oee.oee)]}
              valueColor={BAND_COLOR[bandForOee(snapshot.totals.oee.oee)]}
              icon={<Gauge size={14} />}
              context={`A ${fmtPct(snapshot.totals.oee.availability, 0)} · P ${fmtPct(
                snapshot.totals.oee.performance,
                0,
              )} · Q ${fmtPct(snapshot.totals.oee.quality, 0)}`}
            />
            <StatTile
              label="Energy consumed"
              value={fmtEnergy(snapshot.totals.energy.kwh)}
              accent={SERIES[3]}
              icon={<BatteryCharging size={14} />}
              spark={group.trend.map((t) => t.kwh)}
              context={`${fmtDec(snapshot.totals.energy.kwhPerPanel, 2)} kWh/panel · ${fmtInr(
                energyCostInr(snapshot.totals.energy.kwh),
              )}`}
            />
          </div>

          {/* Plants */}
          <div className="mt-6">
            <SectionLabel>Plants — click through for line and process detail</SectionLabel>
            <div className="grid gap-3 lg:grid-cols-2">
              {snapshot.plants.map((plant) => (
                <PlantCard key={plant.plantId} plant={plant} />
              ))}
            </div>
          </div>

          {/* Production, quality and OEE */}
          <div className="mt-6">
            <SectionLabel>Production &amp; quality</SectionLabel>
            <div className="grid gap-3 xl:grid-cols-[1fr_1fr_320px]">
              <ProductionTrendChart trend={group.trend} height={252} />
              <RejectionPareto
                byDefect={snapshot.totals.quality.byDefect}
                height={252}
                subtitle="Group-wide · click a reason for the corrective action"
              />
              <Card className="flex flex-col">
                <CardHeader title="Group OEE" subtitle={snapshot.window.label} />
                <div className="flex flex-1 flex-col justify-center px-5 py-4">
                  <OeeGauge oee={snapshot.totals.oee} />
                </div>
              </Card>
            </div>
          </div>

          {/* Shift level */}
          <div className="mt-6">
            <SectionLabel>Shift level</SectionLabel>
            <div className="grid gap-3 xl:grid-cols-2">
              <ShiftComparisonChart shifts={group.shifts} height={252} />
              <Card>
                <CardHeader
                  title="Shift performance"
                  subtitle="Output, rejections, downtime and energy by shift"
                />
                <ShiftTable shifts={group.shifts} />
              </Card>
            </div>
          </div>

          {/* SKU level */}
          <div className="mt-6">
            <SectionLabel>SKU level — Thar panels</SectionLabel>
            <Card>
              <CardHeader
                title="Panel SKU performance"
                subtitle="Schedule attainment, quality, OEE and specific energy · click a row for panel and die detail"
              />
              <SkuBreakdownTable skus={group.skus} />
            </Card>
          </div>

          {/* Energy */}
          <div className="mt-6">
            <SectionLabel>Energy</SectionLabel>
            <div className="grid gap-3 xl:grid-cols-[2fr_1fr]">
              <EnergyChart trend={group.trend} height={214} title="Group energy consumption" />
              <div className="grid grid-cols-2 gap-3">
                <StatTile
                  label="Specific energy"
                  value={fmtDec(snapshot.totals.energy.kwhPerPanel, 2)}
                  unit="kWh/panel"
                  context="Per good panel"
                />
                <StatTile
                  label="Peak demand"
                  value={fmtInt(snapshot.totals.energy.peakKw)}
                  unit="kW"
                  context="Coincident, 0.85 diversity"
                />
                <StatTile
                  label="Energy cost"
                  value={fmtInr(energyCostInr(snapshot.totals.energy.kwh))}
                  context="₹8.40/kWh industrial tariff"
                />
                <StatTile
                  label="Carbon"
                  value={fmtDec(snapshot.totals.energy.co2eKg / 1000, 1)}
                  unit="t CO₂e"
                  context={`Grid factor ${GRID_EMISSION_FACTOR} kg/kWh`}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}

function ShiftTable({ shifts }: { shifts: ShiftMetrics[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-[12px]">
        <caption className="sr-only">Production and energy by shift</caption>
        <thead>
          <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            <th scope="col" className="py-2 pl-4 text-left font-medium">
              Shift
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Produced
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Good
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Rejected
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              OEE
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Downtime
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">
              Energy
            </th>
          </tr>
        </thead>
        <tbody>
          {shifts.map((s) => (
            <tr key={s.shiftId} className="border-b border-[var(--border)]/60 last:border-0">
              <th scope="row" className="py-2.5 pl-4 text-left font-medium">
                Shift {s.shiftId}
              </th>
              <td className="tabular px-3 py-2.5 text-right">{fmtInt(s.produced)}</td>
              <td className="tabular px-3 py-2.5 text-right text-[var(--text-secondary)]">
                {fmtInt(s.good)}
              </td>
              <td className="tabular px-3 py-2.5 text-right"
                style={{ color: STATUS_TEXT.critical }}>
                {fmtInt(s.rejected)}
              </td>
              <td
                className="tabular px-3 py-2.5 text-right font-medium"
                style={{ color: BAND_COLOR[bandForOee(s.oee)] }}
              >
                {fmtPct(s.oee)}
              </td>
              <td className="tabular px-3 py-2.5 text-right text-[var(--text-secondary)]">
                {fmtInt(s.downtimeMin)} min
              </td>
              <td className="tabular py-2.5 pr-4 text-right text-[var(--text-secondary)]">
                {fmtEnergy(s.kwh)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Sums plant trends hour by hour into one group series. */
function mergeTrends(trends: TrendPoint[][]): TrendPoint[] {
  if (trends.length === 0) return [];
  const byTime = new Map<number, TrendPoint>();
  const counts = new Map<number, number>();

  for (const trend of trends) {
    for (const p of trend) {
      const existing = byTime.get(p.t);
      if (!existing) {
        byTime.set(p.t, { ...p });
        counts.set(p.t, 1);
      } else {
        existing.produced += p.produced;
        existing.good += p.good;
        existing.rejected += p.rejected;
        existing.kwh += p.kwh;
        existing.kw += p.kw;
        // OEE is a ratio, so accumulate then divide by the plant count below.
        existing.oee += p.oee;
        counts.set(p.t, (counts.get(p.t) ?? 1) + 1);
      }
    }
  }

  return [...byTime.values()]
    .map((p) => ({ ...p, oee: p.oee / (counts.get(p.t) ?? 1) }))
    .sort((a, b) => a.t - b.t);
}
