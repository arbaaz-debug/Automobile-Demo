"use client";

import type { ReactNode } from "react";
import {
  Activity,
  Droplets,
  Gauge,
  Hammer,
  Thermometer,
  TriangleAlert,
  Wind,
  Zap,
} from "lucide-react";
import type { StationSnapshot } from "@/domain/stamping/types";
import { SKU_BY_ID, STATION_KIND_LABEL } from "@/domain/stamping/catalog";
import { bandForFtt, bandForHealth, bandForOee } from "@/domain/stamping/oee";
import { BAND_COLOR, STATUS, STATUS_TEXT } from "@/lib/theme";
import { cn, fmtDec, fmtEnergy, fmtInt, fmtMinutes, fmtPct, fmtRelative } from "@/lib/format";
import { Meter } from "@/components/ui/StatTile";
import { StatusPill } from "@/components/ui/StatusPill";
import { RejectionMiniPareto } from "@/components/charts/RejectionPareto";

/**
 * Everything known about one press-shop operation.
 *
 * Grouped the way an engineer troubleshoots: what is it doing right now, how
 * much has it made, is the tool and the machine healthy, what is it costing in
 * energy, and what is coming off it as scrap.
 */
export function StationDetailPanel({
  station,
  now,
}: {
  station: StationSnapshot;
  now: number;
}) {
  const { def, health, energy, quality, oee } = station;
  const sku = station.currentSkuId ? SKU_BY_ID.get(station.currentSkuId) : null;
  const dieUsage = health.dieStrokes / health.dieLifeStrokes;
  const healthBand = bandForHealth(health.healthIndex);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.1em] text-[var(--text-muted)]">
              {def.opCode} · {STATION_KIND_LABEL[def.kind]}
            </p>
            <h3 className="mt-0.5 truncate text-[14px] font-semibold tracking-tight">
              {def.name}
            </h3>
          </div>
          <StatusPill status={station.status} />
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">
          {def.description}
        </p>

        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[var(--text-muted)]">
          {def.capacityT ? <span>Rated {fmtInt(def.capacityT)} T</span> : null}
          <span>Installed {fmtInt(def.ratedKw)} kW</span>
          <span>
            State held {fmtMinutes(station.stateAgeSec / 60)}
          </span>
          {sku ? <span>Running {sku.shortName}</span> : null}
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {/* Current status */}
        <Group title="Current status" icon={<Activity size={12} />}>
          <div className="grid grid-cols-3 gap-3">
            <Figure
              label="Stroke rate"
              value={station.status === "running" ? fmtDec(station.spm) : "—"}
              unit="SPM"
            />
            <Figure label="Panels" value={fmtInt(station.count)} unit="in window" />
            <Figure
              label="Good"
              value={fmtInt(station.goodCount)}
              unit={fmtPct(quality.ftt)}
              color={BAND_COLOR[bandForFtt(quality.ftt)]}
            />
          </div>
        </Group>

        {/* OEE */}
        <Group title="Effectiveness" icon={<Gauge size={12} />}>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[11px] text-[var(--text-secondary)]">OEE</span>
            <span
              className="tabular text-[16px] font-semibold"
              style={{ color: BAND_COLOR[bandForOee(oee.oee)] }}
            >
              {fmtPct(oee.oee)}
            </span>
          </div>
          <div className="space-y-2">
            <MeterRow label="Availability" value={oee.availability} />
            <MeterRow label="Performance" value={oee.performance} />
            <MeterRow label="Quality" value={oee.quality} />
          </div>
          <dl className="mt-2.5 grid grid-cols-3 gap-2 text-[10px]">
            <Mini label="Run" value={fmtMinutes(oee.runTimeMin)} />
            <Mini label="Downtime" value={fmtMinutes(oee.downtimeMin)} />
            <Mini label="Die change" value={fmtMinutes(oee.changeoverMin)} />
          </dl>
        </Group>

        {/* Equipment health */}
        <Group title="Equipment health" icon={<Hammer size={12} />}>
          <div className="mb-2.5 flex items-baseline justify-between">
            <span className="text-[11px] text-[var(--text-secondary)]">Composite index</span>
            <span
              className="tabular text-[16px] font-semibold"
              style={{ color: BAND_COLOR[healthBand] }}
            >
              {fmtDec(health.healthIndex)}
              <span className="ml-1 text-[11px] font-normal text-[var(--text-muted)]">/100</span>
            </span>
          </div>
          <Meter
            value={health.healthIndex}
            max={100}
            color={BAND_COLOR[healthBand]}
            label="Health index"
            height={5}
          />

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
            {health.peakTonnage !== undefined ? (
              <Reading
                icon={<Gauge size={11} />}
                label="Peak tonnage"
                value={`${fmtInt(health.peakTonnage)} T`}
                sub={
                  health.tonnageDeviationPct !== undefined
                    ? `${health.tonnageDeviationPct >= 0 ? "+" : ""}${fmtDec(
                        health.tonnageDeviationPct,
                      )}% vs signature`
                    : undefined
                }
                alert={
                  health.tonnageDeviationPct !== undefined &&
                  Math.abs(health.tonnageDeviationPct) > 8
                }
              />
            ) : null}
            {health.tonnageImbalancePct !== undefined ? (
              <Reading
                icon={<Gauge size={11} />}
                label="L/R imbalance"
                value={`${fmtDec(health.tonnageImbalancePct)}%`}
                sub="Limit 5%"
                alert={health.tonnageImbalancePct > 5}
              />
            ) : null}
            <Reading
              icon={<Activity size={11} />}
              label="Vibration"
              value={`${fmtDec(health.vibrationMmS)} mm/s`}
              sub="ISO 10816 zone C ≥ 7.1"
              alert={health.vibrationMmS > 7.1}
            />
            <Reading
              icon={<Thermometer size={11} />}
              label="Oil temperature"
              value={`${fmtInt(health.oilTempC)} °C`}
              sub="Alarm ≥ 68 °C"
              alert={health.oilTempC > 68}
            />
            {health.hydraulicBar !== undefined ? (
              <Reading
                icon={<Droplets size={11} />}
                label="Hydraulic pressure"
                value={`${fmtInt(health.hydraulicBar)} bar`}
              />
            ) : null}
            <Reading
              icon={<Zap size={11} />}
              label="Motor current"
              value={`${fmtInt(health.motorCurrentA)} A`}
            />
          </div>

          <div className="mt-3">
            <div className="mb-1 flex items-baseline justify-between text-[10px]">
              <span className="text-[var(--text-muted)]">
                Die life · {fmtInt(health.dieStrokes)} / {fmtInt(health.dieLifeStrokes)} strokes
              </span>
              <span
                className="tabular font-medium"
                style={{ color: dieUsage > 0.85 ? STATUS_TEXT.warning : "var(--text-secondary)" }}
              >
                {fmtPct(dieUsage, 0)}
              </span>
            </div>
            <Meter
              value={dieUsage}
              color={dieUsage > 0.85 ? STATUS.warning : "var(--series-1)"}
              label="Die life consumed"
              height={4}
            />
            <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">
              Next planned maintenance in {fmtInt(health.nextMaintenanceHrs)} h
            </p>
          </div>

          {health.alarms.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {health.alarms.map((alarm) => (
                <li
                  key={alarm.id}
                  className="flex gap-2 rounded border px-2 py-1.5 text-[10px] leading-relaxed"
                  style={{
                    borderColor:
                      alarm.severity === "critical"
                        ? `${STATUS.critical}55`
                        : `${STATUS.warning}55`,
                    backgroundColor:
                      alarm.severity === "critical"
                        ? `${STATUS.critical}12`
                        : `${STATUS.warning}12`,
                  }}
                >
                  <TriangleAlert
                    size={11}
                    className="mt-0.5 shrink-0"
                    style={{
                      color:
                        alarm.severity === "critical"
                          ? STATUS_TEXT.critical
                          : STATUS_TEXT.warning,
                    }}
                  />
                  <span className="text-[var(--text-secondary)]">
                    {alarm.message}
                    <span className="ml-1 text-[var(--text-muted)]">
                      · {fmtRelative(alarm.raisedAt, now)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[10px] text-[var(--text-muted)]">
              No active condition alarms.
            </p>
          )}
        </Group>

        {/* Energy */}
        <Group title="Energy" icon={<Zap size={12} />}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <Reading label="Consumed" value={fmtEnergy(energy.kwh)} />
            <Reading label="Average load" value={`${fmtInt(energy.kw)} kW`} />
            <Reading label="Peak demand" value={`${fmtInt(energy.peakKw)} kW`} />
            <Reading label="Power factor" value={fmtDec(energy.powerFactor, 2)} />
            <Reading
              label="Specific energy"
              value={`${fmtDec(energy.kwhPerPanel, 2)} kWh/panel`}
            />
            <Reading
              icon={<Wind size={11} />}
              label="Compressed air"
              value={`${fmtInt(energy.airNm3)} Nm³`}
            />
          </div>
        </Group>

        {/* Quality */}
        <Group title="Quality output" icon={<TriangleAlert size={12} />}>
          <div className="mb-2.5 grid grid-cols-3 gap-3">
            <Figure label="Rejected" value={fmtInt(quality.rejected)} color={STATUS_TEXT.critical} />
            <Figure label="Reworked" value={fmtInt(quality.reworked)} />
            <Figure label="DPMO" value={fmtInt(quality.dpmo)} />
          </div>
          <p className="mb-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
            Defects generated at this operation
          </p>
          <RejectionMiniPareto byDefect={quality.byDefect} limit={6} />
        </Group>
      </div>
    </div>
  );
}

function Group({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {icon}
        {title}
      </h4>
      {children}
    </section>
  );
}

function Figure({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string;
  unit?: string;
  color?: string;
}) {
  return (
    <div>
      <p className="text-[10px] text-[var(--text-muted)]">{label}</p>
      <p className="tabular mt-0.5 text-[15px] font-semibold leading-none" style={{ color }}>
        {value}
      </p>
      {unit ? <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{unit}</p> : null}
    </div>
  );
}

function MeterRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between text-[10px]">
        <span className="text-[var(--text-muted)]">{label}</span>
        <span className="tabular text-[var(--text-secondary)]">{fmtPct(value)}</span>
      </div>
      <Meter value={value} color="var(--text-secondary)" label={label} height={3} />
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-[var(--surface-2)] px-2 py-1.5">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="tabular mt-0.5 text-[11px] text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function Reading({
  icon,
  label,
  value,
  sub,
  alert,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  sub?: string;
  alert?: boolean;
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
        {icon}
        {label}
      </p>
      <p
        className={cn("tabular mt-0.5 text-[12px] font-medium")}
        style={{ color: alert ? STATUS_TEXT.warning : "var(--text-primary)" }}
      >
        {value}
      </p>
      {sub ? <p className="text-[9px] text-[var(--text-muted)]">{sub}</p> : null}
    </div>
  );
}
