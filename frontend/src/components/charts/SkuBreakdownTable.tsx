"use client";

import { Fragment, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { SkuMetrics } from "@/domain/stamping/types";
import { PANEL_FAMILY_LABEL, SKU_BY_ID } from "@/domain/stamping/catalog";
import { bandForFtt, bandForOee } from "@/domain/stamping/oee";
import { BAND_COLOR, SERIES, STATUS } from "@/lib/theme";
import { cn, fmtDec, fmtInt, fmtPct } from "@/lib/format";
import { Meter } from "@/components/ui/StatTile";
import { RejectionMiniPareto } from "./RejectionPareto";

/**
 * SKU-level production table.
 *
 * A table, not a chart: seven measures across six panels is a lookup task, and
 * a reader wants to compare a specific SKU's attainment against its plan rather
 * than perceive an overall shape. Inline meters give the at-a-glance ranking
 * that a bar chart would, without giving up the exact numbers.
 */
export function SkuBreakdownTable({
  skus,
  className,
}: {
  skus: SkuMetrics[];
  className?: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (skus.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-[12px] text-[var(--text-muted)]">
        No SKUs scheduled in this window
      </p>
    );
  }

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[760px] text-[12px]">
        <caption className="sr-only">
          Production, quality, OEE and energy by Thar panel SKU
        </caption>
        <thead>
          <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            <th scope="col" className="py-2 pl-4 pr-3 text-left font-medium">
              Panel SKU
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Planned
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Produced
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Attainment
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
            <th scope="col" className="px-3 py-2 text-right font-medium">
              kWh / panel
            </th>
            <th scope="col" className="w-8 py-2 pr-4" />
          </tr>
        </thead>
        <tbody>
          {skus.map((m) => {
            const sku = SKU_BY_ID.get(m.skuId);
            const isOpen = expanded === m.skuId;
            const fttBand = bandForFtt(m.ftt);
            const oeeBand = bandForOee(m.oee);

            return (
              <Fragment key={m.skuId}>
                <tr
                  className={cn(
                    "cursor-pointer border-b border-[var(--border)]/60 transition hover:bg-[var(--surface-2)]",
                    isOpen && "bg-[var(--surface-2)]",
                  )}
                  onClick={() => setExpanded(isOpen ? null : m.skuId)}
                >
                  <th scope="row" className="py-2.5 pl-4 pr-3 text-left font-normal">
                    <div className="flex items-center gap-2.5">
                      <span
                        aria-hidden
                        className="size-2 shrink-0 rounded-[2px]"
                        style={{ backgroundColor: familyColor(sku?.family) }}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-[var(--text-primary)]">
                          {sku?.name ?? m.skuId}
                        </p>
                        <p className="truncate text-[10px] text-[var(--text-muted)]">
                          {m.skuId} · {sku?.material} · {sku?.thicknessMm} mm
                        </p>
                      </div>
                    </div>
                  </th>
                  <td className="tabular px-3 py-2.5 text-right text-[var(--text-secondary)]">
                    {fmtInt(m.planned)}
                  </td>
                  <td className="tabular px-3 py-2.5 text-right font-medium text-[var(--text-primary)]">
                    {fmtInt(m.produced)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Meter
                        value={Math.min(1, m.attainment)}
                        color={m.attainment >= 0.98 ? STATUS.good : STATUS.warning}
                        label={`Attainment for ${m.skuId}`}
                        height={5}
                      />
                      <span className="tabular w-11 shrink-0 text-right text-[11px] text-[var(--text-secondary)]">
                        {fmtPct(m.attainment, 0)}
                      </span>
                    </div>
                  </td>
                  <td className="tabular px-3 py-2.5 text-right text-[var(--text-secondary)]">
                    {fmtInt(m.rejected)}
                  </td>
                  <td
                    className="tabular px-3 py-2.5 text-right font-medium"
                    style={{ color: BAND_COLOR[fttBand] }}
                  >
                    {fmtPct(m.ftt)}
                  </td>
                  <td
                    className="tabular px-3 py-2.5 text-right font-medium"
                    style={{ color: BAND_COLOR[oeeBand] }}
                  >
                    {fmtPct(m.oee)}
                  </td>
                  <td className="tabular px-3 py-2.5 text-right text-[var(--text-secondary)]">
                    {fmtDec(m.kwhPerPanel, 2)}
                  </td>
                  <td className="py-2.5 pr-4 text-right">
                    <ChevronRight
                      size={14}
                      className={cn(
                        "inline text-[var(--text-muted)] transition-transform",
                        isOpen && "rotate-90",
                      )}
                    />
                  </td>
                </tr>

                {isOpen ? (
                  <tr className="border-b border-[var(--border)]">
                    <td colSpan={9} className="bg-[var(--surface-2)] px-4 py-3">
                      <div className="grid gap-5 md:grid-cols-3">
                        <div>
                          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                            Panel specification
                          </p>
                          <dl className="space-y-1 text-[11px]">
                            <Spec label="Family" value={PANEL_FAMILY_LABEL[sku?.family ?? ""]} />
                            <Spec label="Material" value={sku?.material ?? "—"} />
                            <Spec
                              label="Thickness"
                              value={sku ? `${sku.thicknessMm} mm` : "—"}
                            />
                            <Spec
                              label="Blank / panel weight"
                              value={sku ? `${sku.blankWeightKg} / ${sku.panelWeightKg} kg` : "—"}
                            />
                            <Spec
                              label="Draw tonnage"
                              value={sku ? `${fmtInt(sku.drawTonnage)} T` : "—"}
                            />
                            <Spec label="Die set" value={sku?.dieId ?? "—"} />
                          </dl>
                        </div>

                        <div>
                          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                            Cycle & yield
                          </p>
                          <dl className="space-y-1 text-[11px]">
                            <Spec
                              label="Nominal stroke rate"
                              value={sku ? `${sku.nominalSpm} SPM` : "—"}
                            />
                            <Spec
                              label="Ideal cycle"
                              value={sku ? `${sku.idealCycleSec.toFixed(2)} s` : "—"}
                            />
                            <Spec
                              label="Material yield"
                              value={
                                sku
                                  ? fmtPct(sku.panelWeightKg / sku.blankWeightKg, 1)
                                  : "—"
                              }
                            />
                            <Spec
                              label="Engineering scrap"
                              value={
                                sku
                                  ? `${fmtDec(
                                      (sku.blankWeightKg - sku.panelWeightKg) * m.good / 1000,
                                      1,
                                    )} T`
                                  : "—"
                              }
                            />
                            <Spec label="Energy in window" value={`${fmtInt(m.kwh)} kWh`} />
                          </dl>
                        </div>

                        <div>
                          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                            Top rejection reasons
                          </p>
                          <RejectionMiniPareto byDefect={m.byDefect} limit={5} />
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="tabular text-right text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function familyColor(family?: string): string {
  switch (family) {
    case "bonnet":
      return SERIES[0];
    case "door":
      return SERIES[1];
    case "side_body":
      return SERIES[2];
    default:
      return SERIES[5];
  }
}
