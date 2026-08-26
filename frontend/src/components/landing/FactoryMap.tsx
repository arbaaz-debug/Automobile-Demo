"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { Minus, Plus, Maximize2 } from "lucide-react";
import type { FactoryRow } from "@/services/data/overview";
import { PLANT_BY_ID } from "@/domain/stamping/catalog";
import { bandForOee } from "@/domain/stamping/oee";
import { INDIA_RINGS } from "@/domain/geo/indiaOutline";
import { WORLD_RINGS } from "@/domain/geo/worldOutline";
import {
  MAX_SPAN,
  MIN_SPAN,
  fitAspect,
  initialView,
  project,
  type ViewBox,
} from "@/domain/geo/project";
import { fmtInt, fmtPct } from "@/lib/format";
import { BAND_COLOR, COLORS } from "@/lib/theme";
import { routes } from "@/lib/routes";

/** Marker sizes in screen pixels, so they hold their size through a zoom. */
const MARKER_MIN = 6;
const MARKER_RANGE = 10;

function pathFor(rings: [number, number][][]): string {
  return rings
    .map(
      (ring) =>
        ring
          .map(([lng, lat], i) => {
            const { x, y } = project(lng, lat);
            return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
          })
          .join("") + "Z",
    )
    .join("");
}

const WORLD_PATH = pathFor(WORLD_RINGS);
const INDIA_PATH = pathFor(INDIA_RINGS);

/**
 * Every factory, on a map that pans and zooms.
 *
 * The view opens on India because that is where the plants are, but it is not
 * confined to it — scroll to zoom, drag to pan, and the world is drawn behind
 * so zooming out shows context rather than a country floating in a void.
 *
 * Marker size carries output and colour carries effectiveness, but neither is
 * load-bearing alone: hover or focus gives the figures, and the legend names
 * each band in words.
 */
export function FactoryMap({
  factories,
  search,
  className,
}: {
  factories: FactoryRow[];
  search?: string | null;
  className?: string;
}) {
  const id = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<ViewBox | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; view: ViewBox } | null>(null);
  // Mirrored in state purely so the cursor can react — a ref cannot be read
  // during render.
  const [dragging, setDragging] = useState(false);

  // The viewBox has to match the container's shape or the drawing letterboxes
  // and the HTML labels drift off their markers.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: width, h: height });
      setView((prev) =>
        prev ? fitAspect(prev, width / height) : initialView(width / height),
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const reset = useCallback(() => {
    if (size.w > 0) setView(initialView(size.w / size.h));
  }, [size]);

  /** Zooms by a factor, holding the given container point still. */
  const zoomAt = useCallback(
    (factor: number, px: number, py: number) => {
      setView((prev) => {
        if (!prev || size.w === 0) return prev;
        const span = Math.min(MAX_SPAN, Math.max(MIN_SPAN, prev.w * factor));
        const scale = span / prev.w;
        const h = prev.h * scale;
        // Keep the point under the cursor fixed: the fraction of the box it
        // sits at must not change.
        return {
          x: prev.x + (px / size.w) * (prev.w - span),
          y: prev.y + (py / size.h) * (prev.h - h),
          w: span,
          h,
        };
      });
    },
    [size],
  );

  // Wheel zoom is registered non-passively so the page does not scroll with it.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(e.deltaY > 0 ? 1.18 : 1 / 1.18, e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const maxProduced = Math.max(1, ...factories.map((f) => f.produced));

  const sites = factories
    .map((f) => {
      const plant = PLANT_BY_ID.get(f.plantId);
      if (!plant) return null;
      const band = bandForOee(f.oee);
      return {
        row: f,
        ...project(plant.lng, plant.lat),
        colour: BAND_COLOR[band],
        // Area, not radius, tracks output — a radius-linear bubble exaggerates
        // the largest site by the square of its lead.
        rPx: MARKER_MIN + MARKER_RANGE * Math.sqrt(f.produced / maxProduced),
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort((a, b) => b.rPx - a.rPx);

  // Projected units per pixel — markers are sized in px and drawn in units.
  const unitsPerPx = view && size.w > 0 ? view.w / size.w : 1;
  const placed = placeLabels(sites, view, size);

  return (
    <div
      ref={wrapRef}
      className={className}
      onPointerDown={(e) => {
        if (!view) return;
        (e.target as Element).setPointerCapture?.(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, view };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || size.w === 0) return;
        setView({
          ...d.view,
          x: d.view.x - ((e.clientX - d.x) / size.w) * d.view.w,
          y: d.view.y - ((e.clientY - d.y) / size.h) * d.view.h,
        });
      }}
      onPointerUp={() => {
        drag.current = null;
        setDragging(false);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDragging(false);
      }}
      style={{ cursor: dragging ? "grabbing" : "grab", touchAction: "none" }}
    >
      {view ? (
        <svg
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          className="h-full w-full select-none"
          role="img"
          aria-labelledby={`${id}-title`}
        >
          <title id={`${id}-title`}>
            {`Map showing ${sites.length} factories: ${sites
              .map((s) => `${s.row.name}, ${fmtInt(s.row.produced)} vehicles`)
              .join("; ")}`}
          </title>

          {/* The rest of the world, recessive. */}
          <path
            d={WORLD_PATH}
            fill="var(--surface-2)"
            stroke={COLORS.grid}
            strokeWidth={0.5 * unitsPerPx}
            opacity={0.55}
          />
          {/* India, the subject. */}
          <path
            d={INDIA_PATH}
            fill="var(--surface-3)"
            stroke={COLORS.axis}
            strokeWidth={0.8 * unitsPerPx}
            strokeLinejoin="round"
          />

          {sites.map((s) => (
            <g key={s.row.plantId}>
              <circle
                cx={s.x}
                cy={s.y}
                r={s.rPx * 1.85 * unitsPerPx}
                fill={s.colour}
                opacity={active === s.row.plantId ? 0.35 : 0.18}
              />
              <circle
                cx={s.x}
                cy={s.y}
                r={s.rPx * unitsPerPx}
                fill={s.colour}
                stroke={COLORS.surface1}
                strokeWidth={1.2 * unitsPerPx}
              />
            </g>
          ))}
        </svg>
      ) : null}

      {/* Labels live in HTML above the SVG: upright at any zoom, on the type
          scale, and focusable in reading order. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {view
          ? sites.map((s) => {
              const left = ((s.x - view.x) / view.w) * 100;
              const top = ((s.y - view.y) / view.h) * 100;
              if (left < -5 || left > 105 || top < -5 || top > 105) return null;

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
                  onDragStart={(e) => e.preventDefault()}
                  className="pointer-events-auto absolute -translate-x-1/2 rounded text-center"
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
                      backgroundColor: isActive
                        ? "var(--surface-raised)"
                        : "var(--surface-1)",
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
            })
          : null}
      </div>

      <div className="absolute right-3 top-3 flex flex-col gap-1">
        <MapButton label="Zoom in" onClick={() => zoomAt(1 / 1.4, size.w / 2, size.h / 2)}>
          <Plus size={13} />
        </MapButton>
        <MapButton label="Zoom out" onClick={() => zoomAt(1.4, size.w / 2, size.h / 2)}>
          <Minus size={13} />
        </MapButton>
        <MapButton label="Reset view" onClick={reset}>
          <Maximize2 size={12} />
        </MapButton>
      </div>
    </div>
  );
}

function MapButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      title={label}
      className="grid size-7 place-items-center rounded border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}

/**
 * Nudges labels apart where sites sit close together.
 *
 * Mumbai, Nashik and Pune are within about 150 km, so at the opening zoom their
 * labels land on top of one another. Each tries a short list of offsets and
 * takes the first that does not collide with one already placed. Recomputed on
 * every view change, because what overlaps at one zoom does not at another.
 */
function placeLabels(
  sites: { row: { plantId: string; name: string }; x: number; y: number; rPx: number }[],
  view: ViewBox | null,
  size: { w: number; h: number },
): Map<string, { dx: number; dy: number }> {
  const out = new Map<string, { dx: number; dy: number }>();
  if (!view || size.w === 0) return out;

  // Chip height plus a gutter: sizing the box exactly to the ~20px chip lets
  // two labels clear by a pixel and still read as touching.
  const H = 24;
  const width = (name: string) => name.length * 6.8 + 22;

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

  const boxes: { x1: number; y1: number; x2: number; y2: number }[] = [];

  // Largest first, so the biggest site keeps the natural position.
  for (const s of [...sites].sort((a, b) => b.rPx - a.rPx)) {
    const px = ((s.x - view.x) / view.w) * size.w;
    const py = ((s.y - view.y) / view.h) * size.h;
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

/** Names each health band in words, so marker colour is never the only cue. */
export function MapLegend() {
  const bands = [
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
      <li className="text-[10px] text-[var(--text-muted)]">· size = vehicles built</li>
    </ul>
  );
}
