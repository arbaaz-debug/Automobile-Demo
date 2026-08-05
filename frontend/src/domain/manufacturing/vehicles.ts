/**
 * Vehicle SKUs — the cars each factory builds.
 *
 * A SKU here is a finished vehicle model, not a stamped panel. Every SKU runs
 * the *same* eight-process chain (they are all cars), so the process catalog is
 * shared; what differs per SKU is volume, takt and yield.
 *
 * Volume is expressed as a **mix share of the factory's own output** rather than
 * an absolute rate. That keeps the whole portal reconciling off one number: the
 * press-shop model drives how many vehicle sets a factory can build, and the mix
 * decides how those split across the models on its lines. Add a SKU to a plant
 * and the others give up share — the factory does not magically build more.
 */

import { PLANTS } from "@/domain/stamping/catalog";

export interface VehicleSku {
  id: string;
  name: string;
  shortName: string;
  /** Body style, shown under the tab label. */
  body: string;
  platform: string;
  /** Nominal line takt for this model, seconds per vehicle. */
  taktSec: number;
  /**
   * Relative build difficulty, 1.0 = baseline.
   * Harder models take longer and yield slightly worse.
   */
  complexity: number;
}

export const VEHICLE_SKUS: VehicleSku[] = [
  {
    id: "thar",
    name: "Thar",
    shortName: "Thar",
    body: "3-door SUV",
    platform: "Body-on-frame",
    taktSec: 61,
    complexity: 1.0,
  },
  {
    id: "thar-roxx",
    name: "Thar ROXX",
    shortName: "ROXX",
    body: "5-door SUV",
    platform: "Body-on-frame",
    taktSec: 68,
    complexity: 1.12,
  },
  {
    id: "scorpio-n",
    name: "Scorpio-N",
    shortName: "Scorpio-N",
    body: "7-seat SUV",
    platform: "Body-on-frame",
    taktSec: 72,
    complexity: 1.18,
  },
  {
    id: "xuv700",
    name: "XUV700",
    shortName: "XUV700",
    body: "7-seat SUV",
    platform: "Monocoque",
    taktSec: 66,
    complexity: 1.09,
  },
  {
    id: "bolero-neo",
    name: "Bolero Neo",
    shortName: "Bolero Neo",
    body: "7-seat SUV",
    platform: "Body-on-frame",
    taktSec: 54,
    complexity: 0.88,
  },
];

export const VEHICLE_SKU_BY_ID = new Map(VEHICLE_SKUS.map((s) => [s.id, s]));

export interface SkuMix {
  skuId: string;
  /** Share of the factory's vehicle output, 0..1. Shares per plant sum to 1. */
  share: number;
}

/**
 * Which models each factory builds, and in what proportion.
 *
 * Shares are asserted to sum to 1 per plant at module load — a mix that does not
 * add up would silently under- or over-report a factory's total.
 */
export const PLANT_SKU_MIX: Record<string, SkuMix[]> = {
  nashik: [
    { skuId: "thar", share: 0.46 },
    { skuId: "thar-roxx", share: 0.34 },
    { skuId: "xuv700", share: 0.2 },
  ],
  chakan: [
    { skuId: "scorpio-n", share: 0.4 },
    { skuId: "xuv700", share: 0.34 },
    { skuId: "thar", share: 0.26 },
  ],
  kandivali: [
    { skuId: "bolero-neo", share: 0.62 },
    { skuId: "thar", share: 0.38 },
  ],
  haridwar: [
    { skuId: "thar-roxx", share: 0.55 },
    { skuId: "bolero-neo", share: 0.45 },
  ],
  zaheerabad: [
    { skuId: "scorpio-n", share: 0.52 },
    { skuId: "bolero-neo", share: 0.48 },
  ],
};

for (const [plantId, mix] of Object.entries(PLANT_SKU_MIX)) {
  const total = mix.reduce((a, m) => a + m.share, 0);
  if (Math.abs(total - 1) > 1e-6) {
    throw new Error(
      `SKU mix for ${plantId} sums to ${total.toFixed(4)}, expected 1. ` +
        `A mix that does not add up mis-states the factory total.`,
    );
  }
  for (const m of mix) {
    if (!VEHICLE_SKU_BY_ID.has(m.skuId)) {
      throw new Error(`Unknown vehicle SKU "${m.skuId}" in the mix for ${plantId}`);
    }
  }
}

/** The models built at a factory, richest mix first. */
export function skusForPlant(plantId: string): (VehicleSku & { share: number })[] {
  const mix = PLANT_SKU_MIX[plantId] ?? [];
  return mix
    .map((m) => ({ ...VEHICLE_SKU_BY_ID.get(m.skuId)!, share: m.share }))
    .sort((a, b) => b.share - a.share);
}

/** The factories that build a model. */
export function plantsForSku(skuId: string): string[] {
  return PLANTS.filter((p) => (PLANT_SKU_MIX[p.id] ?? []).some((m) => m.skuId === skuId)).map(
    (p) => p.id,
  );
}

/** A factory's share of one model, 0 when it does not build it. */
export function shareOf(plantId: string, skuId: string): number {
  return (PLANT_SKU_MIX[plantId] ?? []).find((m) => m.skuId === skuId)?.share ?? 0;
}

/** The default SKU tab for a factory — its highest-volume model. */
export function defaultSkuForPlant(plantId: string): string {
  return skusForPlant(plantId)[0]?.id ?? VEHICLE_SKUS[0].id;
}
