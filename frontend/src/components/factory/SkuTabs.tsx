"use client";

import type { VehicleSku } from "@/domain/manufacturing/vehicles";
import { cn, fmtPct } from "@/lib/format";

/**
 * Model tabs for a factory.
 *
 * A real tablist: arrow keys move between tabs and the selected tab carries
 * `aria-selected`, so this behaves the way a keyboard user expects rather than
 * being a row of buttons that happen to look like tabs.
 */
export function SkuTabs({
  skus,
  activeSkuId,
  onSelect,
}: {
  skus: (VehicleSku & { share: number })[];
  activeSkuId: string;
  onSelect: (skuId: string) => void;
}) {
  const move = (delta: number) => {
    const i = skus.findIndex((s) => s.id === activeSkuId);
    const next = skus[(i + delta + skus.length) % skus.length];
    if (next) onSelect(next.id);
  };

  return (
    <div
      role="tablist"
      aria-label="Vehicle models built at this factory"
      className="flex flex-wrap items-stretch gap-1 border-b border-[var(--border)] px-2 pt-2"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          move(1);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      {skus.map((sku) => {
        const active = sku.id === activeSkuId;
        return (
          <button
            key={sku.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(sku.id)}
            className={cn(
              "min-w-[128px] rounded-t-md border-b-2 px-3 py-2 text-left transition",
              active
                ? "border-[var(--series-1)] bg-[var(--surface-3)]/50"
                : "border-transparent hover:bg-[var(--surface-3)]/30",
            )}
          >
            <span
              className={cn(
                "block text-[13px] font-semibold",
                active ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]",
              )}
            >
              {sku.name}
            </span>
            <span className="mt-0.5 block text-[10px] text-[var(--text-muted)]">
              {sku.body} · {fmtPct(sku.share, 0)} of mix
            </span>
          </button>
        );
      })}
    </div>
  );
}
