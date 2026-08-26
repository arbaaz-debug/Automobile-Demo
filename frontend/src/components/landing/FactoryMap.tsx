"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapContainer, TileLayer, CircleMarker, Tooltip, ZoomControl, useMap } from "react-leaflet";
import { latLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";
import { ArrowRight } from "lucide-react";
import { PLANT_BY_ID } from "@/domain/stamping/catalog";
import { bandForOee } from "@/domain/stamping/oee";
import type { FactoryRow } from "@/services/data/overview";
import { BAND_COLOR, STATUS, STATUS_TEXT } from "@/lib/theme";
import { fmtInt, fmtPct, cn } from "@/lib/format";
import { routes } from "@/lib/routes";

/**
 * The factory map.
 *
 * Leaflet with CARTO Positron tiles rather than the embedded SVG outline this
 * replaced: a real slippy map pans and zooms to any level and puts each plant
 * on a recognisable piece of ground — the Kandivali and Chakan sites are 120 km
 * apart and only read as different places once you can zoom into Mumbai and
 * Pune. The trade is that tiles come from the network, so the map degrades to
 * grey panels offline where the SVG did not.
 *
 * Positron is a deliberately quiet basemap. Everything the portal draws on top
 * — the markers and their labels — carries saturation, so the plants read as
 * the foreground and the geography stays reference.
 *
 * Hovering a marker fills the detail card pinned to the right of the map. That
 * keeps the reading position fixed: a popup anchored to the marker would move
 * the numbers around the screen as you compare plants, and would cover the very
 * neighbours you are comparing against.
 */

const TILE_URL = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

/** Fallback view, used only if no plant has coordinates. */
const INITIAL_CENTER: [number, number] = [22.4, 78.5];
const INITIAL_ZOOM = 5;

/**
 * Which side of its marker each plant's label sits on.
 *
 * Nashik, Kandivali and Chakan are inside 150 km of each other, so at a zoom
 * that holds all of India their labels land on top of one another. Leaflet has
 * no label-collision solver, and the plant list is fixed and known, so the
 * three are simply pushed apart in different directions. Anything unlisted
 * defaults to sitting above its marker.
 */
const LABEL_SIDE: Record<string, "top" | "bottom" | "left" | "right"> = {
  nashik: "top",
  kandivali: "left",
  chakan: "bottom",
  zaheerabad: "right",
  haridwar: "top",
};

interface Site {
  row: FactoryRow;
  lat: number;
  lng: number;
  radius: number;
  color: string;
}

export function FactoryMap({
  factories,
  search,
  className,
}: {
  factories: FactoryRow[];
  search?: string | null;
  className?: string;
}) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sites = useMemo<Site[]>(() => {
    // Area, not radius, carries volume — a plant building twice as much should
    // look twice as big, and radius alone would make it look four times bigger.
    const max = Math.max(1, ...factories.map((f) => f.produced));
    return factories.flatMap((f) => {
      const plant = PLANT_BY_ID.get(f.plantId);
      if (!plant) return [];
      return [
        {
          row: f,
          lat: plant.lat,
          lng: plant.lng,
          radius: 8 + 14 * Math.sqrt(f.produced / max),
          color: BAND_COLOR[bandForOee(f.oee)],
        },
      ];
    });
  }, [factories]);

  // Falls back to the factory needing attention most, so the card is never
  // empty on arrival and the first thing read is the worst plant.
  const fallback = useMemo(
    () => [...factories].sort((a, b) => a.worstOee - b.worstOee)[0],
    [factories],
  );
  const active = sites.find((s) => s.row.plantId === activeId)?.row ?? fallback;

  return (
    <div className={cn("relative", className)}>
      <MapContainer
        center={INITIAL_CENTER}
        zoom={INITIAL_ZOOM}
        minZoom={2}
        maxZoom={18}
        scrollWheelZoom
        zoomControl={false}
        className="size-full"
        style={{ background: "#e8ecef" }}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} subdomains="abcd" maxZoom={20} />
        {/* Left, so it never sits under the detail card. */}
        <ZoomControl position="topleft" />
        <FitToFactories sites={sites} />

        {sites.map((s) => {
          const on = s.row.plantId === active?.plantId;
          return (
            <CircleMarker
              key={s.row.plantId}
              center={[s.lat, s.lng]}
              radius={s.radius}
              pathOptions={{
                color: s.color,
                fillColor: s.color,
                fillOpacity: on ? 0.55 : 0.32,
                weight: on ? 3 : 2,
              }}
              eventHandlers={{
                mouseover: () => setActiveId(s.row.plantId),
                // Not cleared on mouseout: the card holds the last plant you
                // looked at, so you can read it without keeping the pointer
                // perfectly still on a 10-pixel dot.
                click: () => router.push(routes.factory(s.row.plantId, search)),
                keypress: (e) => {
                  if ((e.originalEvent as KeyboardEvent).key === "Enter") {
                    router.push(routes.factory(s.row.plantId, search));
                  }
                },
              }}
            >
              <Tooltip
                direction={LABEL_SIDE[s.row.plantId] ?? "top"}
                offset={labelOffset(LABEL_SIDE[s.row.plantId] ?? "top", s.radius)}
                permanent
                className="factory-label"
              >
                <span className="font-semibold">{s.row.name}</span>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Keyboard route to the same card. Leaflet's vector markers are not
          focusable, so rather than leave the detail unreachable without a
          pointer, the same factories are a real focusable list — visible only
          when tabbed into. */}
      <ul className="absolute left-2 top-2 z-[1000] flex gap-1">
        {sites.map((s) => (
          <li key={s.row.plantId}>
            <button
              type="button"
              onFocus={() => setActiveId(s.row.plantId)}
              onClick={() => router.push(routes.factory(s.row.plantId, search))}
              className="sr-only focus:not-sr-only focus:rounded focus:bg-[var(--surface-1)] focus:px-2 focus:py-1 focus:text-[11px] focus:text-[var(--text-primary)] focus:outline focus:outline-2 focus:outline-[var(--series-1)]"
            >
              {s.row.name} detail
            </button>
          </li>
        ))}
      </ul>

      {active ? <FactoryDetailCard row={active} search={search} /> : null}

      {/* Leaflet's own CSS assumes a light host page and its tooltips carry a
          white chip we do not want. Scoped to this component. */}
      <style>{`
        .leaflet-container { font: inherit; }
        .leaflet-container .factory-label {
          background: rgba(255,255,255,0.92);
          border: 1px solid rgba(15,42,74,0.18);
          border-radius: 5px;
          box-shadow: none;
          color: #14314f;
          font-size: 11px;
          padding: 1px 6px;
          white-space: nowrap;
        }
        .leaflet-container .factory-label::before { display: none; }
        .leaflet-control-zoom a {
          background: #ffffff;
          color: #14314f;
          border-color: rgba(15,42,74,0.18);
        }
        .leaflet-control-attribution {
          background: rgba(255,255,255,0.82);
          font-size: 9px;
        }
        .leaflet-control-attribution a { color: #2b5f9e; }
      `}</style>
    </div>
  );
}

/** Clears the marker itself, whatever side the label sits on. */
function labelOffset(
  side: "top" | "bottom" | "left" | "right",
  radius: number,
): [number, number] {
  const gap = radius + 3;
  if (side === "top") return [0, -gap];
  if (side === "bottom") return [0, gap];
  return [side === "left" ? -gap : gap, 0];
}

/**
 * Sizes the map to its container, and frames every plant.
 *
 * Both halves are needed. Leaflet measures its container once, at construction,
 * and this map is loaded client-only into a flex cell — so on first paint it
 * has measured a box that has not been laid out yet, requests a handful of
 * tiles and draws markers at the origin. `invalidateSize` re-measures, and a
 * ResizeObserver repeats it whenever the card changes width.
 *
 * The frame is computed from the plants themselves rather than hardcoded to a
 * centre and zoom, so adding a sixth factory brings it into view instead of
 * leaving it off the edge of a view tuned for five.
 */
function FitToFactories({ sites }: { sites: Site[] }) {
  const map = useMap();
  const key = sites.map((s) => `${s.lat},${s.lng}`).join("|");

  useEffect(() => {
    const container = map.getContainer();

    const fit = () => {
      map.invalidateSize({ animate: false });
      if (sites.length === 0) return;
      const bounds = latLngBounds(sites.map((s) => [s.lat, s.lng] as [number, number]));
      // Padded so a marker on the edge is not half off-screen, and capped so
      // two plants 20 km apart do not open at street level.
      map.fitBounds(bounds, { padding: [70, 70], maxZoom: 6, animate: false });
    };

    fit();
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    ro.observe(container);
    return () => ro.disconnect();
    // `key` stands in for the site coordinates; `sites` is rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);

  return null;
}

/**
 * The metrics for whichever factory the pointer is on.
 *
 * Dark against the light basemap: this is portal chrome sitting over a
 * reference layer, and the contrast is what keeps it legible at every zoom
 * level and over every kind of terrain the tiles might show.
 */
function FactoryDetailCard({ row, search }: { row: FactoryRow; search?: string | null }) {
  const band = bandForOee(row.oee);
  const status =
    band === "poor" || row.worstOee < 0.62
      ? { label: "Critical", color: STATUS_TEXT.critical, dot: STATUS.critical }
      : band === "fair"
        ? { label: "Below target", color: BAND_COLOR.fair, dot: BAND_COLOR.fair }
        : { label: "On target", color: BAND_COLOR.good, dot: BAND_COLOR.good };

  return (
    <aside
      aria-live="polite"
      aria-label={`Metrics for ${row.name}`}
      className="pointer-events-auto absolute right-3 top-3 z-[1000] w-[248px] rounded-lg border border-[var(--border)] bg-[var(--surface-1)]/97 p-3 shadow-[0_8px_28px_rgba(8,24,45,0.34)] backdrop-blur"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[14px] font-semibold text-[var(--text-primary)]">
            {row.name}
          </h3>
          <p className="truncate text-[10px] text-[var(--text-muted)]">
            {row.state} · {row.plantName}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em]"
          style={{ backgroundColor: `${status.dot}26`, color: status.color }}
        >
          {status.label}
        </span>
      </div>

      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="tabular text-[24px] font-semibold leading-none text-[var(--text-primary)]">
          {fmtInt(row.produced)}
        </span>
        <span className="text-[10px] text-[var(--text-muted)]">vehicles</span>
        <Change value={row.deltas.produced.change} />
      </p>

      <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-[var(--border)] pt-2.5">
        <Stat label="Avg / day" value={fmtInt(row.avgPerDay)} change={row.deltas.avgPerDay.change} />
        <Stat
          label="Rejections"
          value={fmtInt(row.rejected)}
          change={row.deltas.rejected.change}
          inverse
          note={`${fmtPct(row.rejectRate, 1)} rate`}
        />
        <Stat label="First time through" value={fmtPct(row.rty, 1)} change={row.deltas.rty.change} />
        <Stat label="OEE" value={fmtPct(row.oee, 1)} change={row.deltas.oee.change} />
      </dl>

      <div className="mt-2.5 border-t border-[var(--border)] pt-2">
        <p className="text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
          Weakest process
        </p>
        <p className="mt-0.5 flex items-baseline gap-1.5">
          <span className="truncate text-[12px] font-medium text-[var(--text-primary)]">
            {row.worstProcessName}
          </span>
          <span
            className="tabular shrink-0 text-[12px] font-semibold"
            style={{ color: BAND_COLOR[bandForOee(row.worstOee)] }}
          >
            {fmtPct(row.worstOee, 1)}
          </span>
        </p>
        {row.worstProcessCause ? (
          <p className="mt-0.5 text-[9px] leading-snug text-[var(--text-muted)]">
            {row.worstProcessCause}
          </p>
        ) : null}
      </div>

      <Link
        href={routes.factory(row.plantId, search)}
        className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--series-1)] underline-offset-2 hover:underline"
      >
        Open {row.name}
        <ArrowRight size={12} aria-hidden />
      </Link>
    </aside>
  );
}

function Stat({
  label,
  value,
  change,
  inverse = false,
  note,
}: {
  label: string;
  value: string;
  change: number | null;
  inverse?: boolean;
  /** A second reading of the figure, e.g. a count's rate. */
  note?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[9px] uppercase leading-tight tracking-[0.08em] text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="mt-0.5 flex items-baseline gap-1">
        <span className="tabular text-[13px] font-semibold text-[var(--text-primary)]">{value}</span>
        <Change value={change} inverse={inverse} small />
      </dd>
      {note ? <dd className="tabular text-[9px] text-[var(--text-muted)]">{note}</dd> : null}
    </div>
  );
}

/** Up is not always good: more rejections is a worse result, so it inverts. */
function Change({
  value,
  inverse = false,
  small = false,
}: {
  value: number | null;
  inverse?: boolean;
  small?: boolean;
}) {
  // `change` is fractional, and null where there is no comparable prior window.
  const pct = value == null ? null : value * 100;
  if (pct == null || !Number.isFinite(pct) || Math.abs(pct) < 0.05) {
    return (
      <span className={cn("text-[var(--text-muted)]", small ? "text-[9px]" : "text-[10px]")}>—</span>
    );
  }
  const up = pct > 0;
  const good = inverse ? !up : up;
  return (
    <span
      className={cn("tabular font-semibold", small ? "text-[9px]" : "text-[10px]")}
      style={{ color: good ? STATUS_TEXT.good : STATUS_TEXT.critical }}
    >
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}
