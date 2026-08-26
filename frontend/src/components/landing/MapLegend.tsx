import { BAND_COLOR } from "@/lib/theme";

/** Sits in the map card's header, next to the title. */
export function MapLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--text-muted)]">
      {(
        [
          ["good", "On target"],
          ["fair", "Below target"],
          ["poor", "Critical"],
        ] as const
      ).map(([band, label]) => (
        <li key={band} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ backgroundColor: BAND_COLOR[band] }}
          />
          {label}
        </li>
      ))}
      <li className="text-[var(--text-muted)]">· size = vehicles built</li>
    </ul>
  );
}
