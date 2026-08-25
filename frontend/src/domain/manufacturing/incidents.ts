/**
 * Production incidents — the events that make the numbers move.
 *
 * A plant that runs within ±2% every day is a plant nobody needs a portal for.
 * These are the breakdowns, quality escapes, supply shortages and ramp-ups that
 * give the data a shape worth reading.
 *
 * **They are declared once and applied at the source.** Every incident is a
 * multiplier on a (factory, process, date-range) triple, applied inside the
 * press-shop simulator and the chain solver — the two places all portal numbers
 * are derived from. Nothing downstream knows incidents exist: the overview
 * trend, the factory page, the process pages, the roadblocks, the insights and
 * the assistant all move because the underlying production moved. That is what
 * makes the story consistent everywhere instead of being re-told, and slightly
 * differently, in six components.
 *
 * Dates are production dates (ISO), inclusive of both ends.
 */

export type IncidentKind = "breakdown" | "quality" | "supply" | "ramp";

export interface Incident {
  id: string;
  plantId: string;
  processId: string;
  from: string;
  to: string;
  kind: IncidentKind;
  title: string;
  /** What happened, in the words an operations review would use. */
  narrative: string;
  /** What was done, or is being done, about it. */
  action: string;
  /**
   * Multipliers applied while the incident is live. Omitted fields are
   * unaffected. 1.0 is "no change"; a ramp uses values below 1 that recover.
   */
  effect: {
    /** Scales effectiveness. */
    oee?: number;
    /** Scales first-time-through yield loss — 0.5 doubles the reject rate. */
    ftt?: number;
    /** Scales sustainable capacity. */
    capacity?: number;
  };
  /** True where the effect eases linearly across the window (a ramp). */
  recovering?: boolean;
}

export const INCIDENTS: Incident[] = [
  {
    id: "chakan-paint-contamination",
    plantId: "chakan",
    processId: "paint-shop",
    from: "2026-07-24",
    to: "2026-07-27",
    kind: "quality",
    title: "Paint booth contamination",
    narrative:
      "Filter failure in the topcoat booth put airborne particulate onto wet clearcoat. Four days of heavy rework before the booth was stripped and re-filtered.",
    action:
      "Booth filters replaced and the change interval halved. Re-inspect the units built in the window before they ship.",
    effect: { ftt: 0.42, oee: 0.9 },
  },
  {
    id: "kandivali-draw-press-failure",
    plantId: "kandivali",
    processId: "press-shop",
    from: "2026-07-28",
    to: "2026-07-30",
    kind: "breakdown",
    title: "Draw press main drive failure",
    narrative:
      "The OP10 draw press lost its main drive coupling. The line has been running single-shift on the standby press at roughly half rate since.",
    action:
      "Coupling on order; fit and recommission. Until then, pull Bolero Neo blanks from Zaheerabad to protect the build programme.",
    effect: { oee: 0.55, capacity: 0.55 },
  },
  {
    id: "nashik-bodyshop-robot",
    plantId: "nashik",
    processId: "body-shop",
    from: "2026-07-12",
    to: "2026-07-14",
    kind: "breakdown",
    title: "Framing robot cell fault",
    narrative:
      "Geo-station robot 4 dropped its calibration twice in three days, stopping the framing cell and forcing a manual re-teach each time.",
    action: "Encoder replaced and the cell re-mastered. Watch for repeat drift over the next fortnight.",
    effect: { oee: 0.68, ftt: 0.75 },
  },
  {
    id: "zaheerabad-powertrain-supply",
    plantId: "zaheerabad",
    processId: "powertrain",
    from: "2026-07-06",
    to: "2026-07-10",
    kind: "supply",
    title: "Transfer case shortage",
    narrative:
      "A tier-1 transfer-case shortage held the dressing line to partial builds for five days, starving the marriage station downstream.",
    action: "Supplier on controlled allocation. Dual-source the transfer case before the next programme.",
    effect: { capacity: 0.5 },
  },
  {
    id: "haridwar-ramp",
    plantId: "haridwar",
    processId: "press-shop",
    from: "2026-06-02",
    to: "2026-06-24",
    kind: "ramp",
    title: "PL-6 servo transfer line ramp-up",
    narrative:
      "The new servo transfer press line came online in June and spent three weeks climbing to rate while dies were tuned and operators trained.",
    action: "Ramp complete. The line now runs at programme; treat its tuning log as the template for the next installation.",
    effect: { oee: 0.62, capacity: 0.55 },
    recovering: true,
  },
];

const DAY = 86_400_000;

function ts(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

/** Incidents live at this factory and process on this production day. */
export function incidentsOn(
  plantId: string,
  processId: string,
  dayKey: string,
): Incident[] {
  const t = ts(dayKey);
  return INCIDENTS.filter(
    (i) => i.plantId === plantId && i.processId === processId && t >= ts(i.from) && t <= ts(i.to),
  );
}

/**
 * The multipliers in force for a factory, process and day.
 *
 * A ramp eases: on its first day the effect is at full strength, and by its
 * last day it has recovered to no effect, which is what a line climbing to rate
 * actually looks like. Everything else applies flat for its duration.
 */
export function effectOn(
  plantId: string,
  processId: string,
  dayKey: string,
): { oee: number; ftt: number; capacity: number; incidents: Incident[] } {
  const incidents = incidentsOn(plantId, processId, dayKey);
  let oee = 1;
  let ftt = 1;
  let capacity = 1;

  for (const i of incidents) {
    let strength = 1;
    if (i.recovering) {
      const span = Math.max(1, (ts(i.to) - ts(i.from)) / DAY);
      const elapsed = (ts(dayKey) - ts(i.from)) / DAY;
      // 1 on the first day, easing to 0 by the last.
      strength = Math.max(0, 1 - elapsed / span);
    }

    const blend = (m: number | undefined) => (m === undefined ? 1 : 1 - (1 - m) * strength);

    oee *= blend(i.effect.oee);
    ftt *= blend(i.effect.ftt);
    capacity *= blend(i.effect.capacity);
  }

  return { oee, ftt, capacity, incidents };
}

/** Every incident overlapping a window, newest first. */
export function incidentsInWindow(dayKeys: string[], plantIds: string[]): Incident[] {
  if (dayKeys.length === 0) return [];
  const from = ts(dayKeys[0]);
  const to = ts(dayKeys[dayKeys.length - 1]);

  return INCIDENTS.filter(
    (i) => plantIds.includes(i.plantId) && ts(i.to) >= from && ts(i.from) <= to,
  ).sort((a, b) => ts(b.from) - ts(a.from));
}

/** Days an incident covers inside a window, for marking a chart. */
export function incidentSpan(incident: Incident, dayKeys: string[]): string[] {
  return dayKeys.filter((d) => ts(d) >= ts(incident.from) && ts(d) <= ts(incident.to));
}
