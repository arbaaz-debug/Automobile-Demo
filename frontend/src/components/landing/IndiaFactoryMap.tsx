"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import type { FactoryRow } from "@/services/data/overview";
import { PLANT_BY_ID } from "@/domain/stamping/catalog";
import { bandForOee } from "@/domain/stamping/oee";
import { INDIA_RINGS } from "@/domain/geo/indiaOutline";
import { PROJECTED_HEIGHT, PROJECTED_WIDTH, project } from "@/domain/geo/project";
import { fmtInt, fmtPct } from "@/lib/format";
import { BAND_COLOR, COLORS } from "@/lib/theme";
import { routes } from "@/lib/routes";

/** Padding around the outline, in projected units. */
const PAD = 0.6;

/**
 * Every factory, placed on India.
 *
 * Marker size carries output and colour carries effectiveness, but neither is
 * load-bearing on its own: hovering or focusing a marker gives the figures, and
 * the legend names each health band in words. A plant is never identified by a
 * coloured dot alone.
 *
 * The outline is inline SVG rather than map tiles, so it renders identically
 * offline and in the dark theme without fighting a raster basemap.
 */
export function IndiaFactoryMap({
  factories,
  search,
  className,
}: {
  factories: FactoryRow[];
  search?: string | null;
  className?: string;
}) {
  const id = useId();
  const [active, setActive] = useState<string | null>(null);

  // Label placement works in rendered pixels, so it has to know how wide the
  // map actually is. A hardcoded reference width silently mis-places labels the
  // moment the layout changes — which it did.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const maxProduced = Math.max(1, ...factories.map((f) => f.produced));

  const sites = factories
    .map((f) => {
      const plant = PLANT_BY_ID.get(f.plantId);
      if (!plant) return null;
      const p = project(plant.lng, plant.lat);
      const band = bandForOee(f.oee);
      return {
        row: f,
        plant,
        ...p,
        band,
        colour: BAND_COLOR[band],
        // Area, not radius, tracks output — a radius-linear bubble exaggerates
        // the largest site by the square of its lead.
        r: 5 + 9 * Math.sqrt(f.produced / maxProduced),
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    // Smallest last so a small site is never hidden under a large one.
    .sort((a, b) => b.r - a.r);

  const placed = placeLabels(sites, width);

  return (
    <div className={className} ref={wrapRef}>
      <svg
        viewBox={`${-PAD} ${-PAD} ${PROJECTED_WIDTH + PAD * 2} ${PROJECTED_HEIGHT + PAD * 2}`}
        className="h-full w-full"
        role="img"
        aria-labelledby={`${id}-title`}
      >
        <title id={`${id}-title`}>
          {`Map of India showing ${sites.length} factories: ${sites
            .map((s) => `${s.row.name}, ${fmtInt(s.row.produced)} vehicles`)
            .join("; ")}`}
        </title>

        {INDIA_RINGS.map((ring, i) => (
          <path
            key={i}
            d={
              ring
                .map(([lng, lat], j) => {
                  const { x, y } = project(lng, lat);
                  return `${j === 0 ? "M" : "L"}${x.toFixed(3)},${y.toFixed(3)}`;
                })
                .join("") + "Z"
            }
            fill="var(--surface-2)"
            stroke="var(--axis, #3d6199)"
            strokeWidth={0.06}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {sites.map((s) => {
          const isActive = active === s.row.plantId;
          return (
            <g key={s.row.plantId}>
              {/* Halo so a marker stays visible against the landmass fill. */}
              <circle
                cx={s.x}
                cy={s.y}
                r={s.r * 0.075}
                fill={s.colour}
                opacity={isActive ? 0.35 : 0.18}
              />
              <circle
                cx={s.x}
                cy={s.y}
                r={s.r * 0.042}
                fill={s.colour}
                stroke={COLORS.surface1}
                strokeWidth={0.05}
              />
            </g>
          );
        })}
      </svg>

      {/* Labels and hit targets live in HTML above the SVG: they stay upright,
          pick up the type scale, and are focusable in reading order. */}
      <div className="pointer-events-none absolute inset-0">
        {sites.map((s) => {
          const left = ((s.x + PAD) / (PROJECTED_WIDTH + PAD * 2)) * 100;
          const top = ((s.y + PAD) / (PROJECTED_HEIGHT + PAD * 2)) * 100;
          const isActive = active === s.row.plantId;
          const offset = placed.get(s.row.plantId) ?? { dx: 0, dy: 14 };

          return (
            <Link
              key={s.row.plantId}
              href={routes.plant(s.row.plantId, search)}
              onMouseEnter={() => setActive(s.row.plantId)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(s.row.plantId)}
              onBlur={() => setActive(null)}
              className="pointer-events-auto absolute -translate-x-1/2 rounded px-1 py-0.5 text-center focus-visible:outline-2"
              style={{
                left: `${left}%`,
                top: `${top}%`,
                marginLeft: `${offset.dx}px`,
                marginTop: `${offset.dy}px`,
                zIndex: isActive ? 20 : 10,
              }}
            >
              <span
                className="block whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-semibold transition"
                style={{
                  borderColor: isActive ? s.colour : "var(--border)",
                  backgroundColor: isActive ? "var(--surface-raised)" : "var(--surface-1)",
                  color: "var(--text-primary)",
                }}
              >
                {s.row.name}
              </span>
              {isActive ? (
                <span className="mt-1 block whitespace-nowrap rounded border border-[var(--border-strong)] bg-[var(--surface-raised)] px-2 py-1 text-left shadow-xl">
                  <span className="tabular block text-[11px] font-semibold text-[var(--text-primary)]">
                    {fmtInt(s.row.produced)} vehicles
                  </span>
                  <span className="block text-[10px] text-[var(--text-muted)]">
                    {fmtInt(s.row.avgPerDay)}/day · {fmtPct(s.row.oee, 1)} OEE
                  </span>
                  <span className="block text-[10px] text-[var(--text-muted)]">
                    Blocked at {s.row.bottleneckProcessName}
                  </span>
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Nudges labels apart where sites sit close together.
 *
 * Mumbai, Nashik and Pune are within about 150 km of each other, so at this
 * scale their three labels land on top of one another and none of them can be
 * read. Each label tries a short list of offsets and takes the first that does
 * not overlap one already placed — enough to separate a cluster of three
 * without the machinery of a real label-placement solver.
 */
function placeLabels(
  sites: { row: { plantId: string; name: string }; x: number; y: number; r: number }[],
  renderedWidth: number,
): Map<string, { dx: number; dy: number }> {
  // Rendered size of a label chip plus a gutter. The chip is ~20px tall with
  // its padding and border; sizing the box exactly to it lets two labels
  // "clear" by a pixel and still read as touching, so the box carries 4px of
  // breathing room.
  const H = 24;
  const width = (name: string) => name.length * 6.8 + 22;

  // Projected units to px, from the map's measured width.
  const SCALE = renderedWidth / (PROJECTED_WIDTH + PAD * 2);

  // Below the marker first, then above, then out to the sides — a cluster of
  // three within 30px cannot be separated vertically alone at this scale.
  const candidates = [
    { dx: 0, dy: 14 },
    { dx: 0, dy: -26 },
    { dx: 0, dy: 34 },
    { dx: 0, dy: -46 },
    { dx: -62, dy: -6 },
    { dx: 62, dy: -6 },
    { dx: -70, dy: 22 },
    { dx: 70, dy: 22 },
    { dx: 0, dy: 54 },
    { dx: 0, dy: -66 },
  ];

  const out = new Map<string, { dx: number; dy: number }>();
  const boxes: { x1: number; y1: number; x2: number; y2: number }[] = [];

  // Largest first, so the biggest site keeps the natural position.
  for (const s of [...sites].sort((a, b) => b.r - a.r)) {
    // The drawing is inset by PAD, so marker positions are offset to match.
    const px = (s.x + PAD) * SCALE;
    const py = (s.y + PAD) * SCALE;
    const w = width(s.row.name);

    const chosen =
      candidates.find((c) => {
        const box = {
          x1: px + c.dx - w / 2,
          y1: py + c.dy,
          x2: px + c.dx + w / 2,
          y2: py + c.dy + H,
        };
        return !boxes.some(
          (b) => box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1,
        );
      }) ?? candidates[candidates.length - 1];

    boxes.push({
      x1: px + chosen.dx - w / 2,
      y1: py + chosen.dy,
      x2: px + chosen.dx + w / 2,
      y2: py + chosen.dy + H,
    });
    out.set(s.row.plantId, chosen);
  }

  return out;
}

/** Names each health band in words, so the marker colours are never the only cue. */
export function MapLegend() {
  const bands: { label: string; color: string }[] = [
    { label: "On target", color: BAND_COLOR.good },
    { label: "Below target", color: BAND_COLOR.fair },
    { label: "Critical", color: BAND_COLOR.poor },
  ];

  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {bands.map((b) => (
        <li key={b.label} className="flex items-center gap-1.5 text-[10px]">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: b.color }}
          />
          <span className="text-[var(--text-muted)]">{b.label}</span>
        </li>
      ))}
      <li className="text-[10px] text-[var(--text-muted)]">· marker size = vehicles built</li>
    </ul>
  );
}

