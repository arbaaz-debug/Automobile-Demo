/**
 * The vehicle manufacturing process chain, as a graph.
 *
 * Two streams run in parallel and converge:
 *
 *   Body stream     Press shop -> Body shop -> Paint shop  --\
 *                                                             >-- Body-chassis
 *   Chassis stream  Frame & chassis line -> Powertrain dressing -/   marriage
 *                                                                       |
 *                                            Trim & final assembly <----/
 *                                                       |
 *                                            Testing & dispatch
 *
 * This is *configuration*, not data. Rates and metrics come from
 * `processMetrics`, which sizes every process off the same Thar build rate the
 * press-shop simulator uses, so the chain reconciles end to end.
 *
 * `capacityFactor` is how much headroom each process has over the factory's
 * build programme, and it is what makes the constraint fall out of the model
 * rather than being asserted: the press shop is deliberately the tightest in
 * the chain, so whichever process runs closest to its own ceiling is computed,
 * never hardcoded.
 */

export type ProcessStream = "body" | "chassis" | "joint";

export interface ProcessDef {
  id: string;
  name: string;
  /** One-line description, as printed on the process map. */
  summary: string;
  stream: ProcessStream;
  /** Position within its stream, used to lay the map out. */
  order: number;
  /** Process ids feeding this one. */
  inputs: string[];
  /** Longer description for the process page. */
  description: string;
  /** Key operations, listed in sequence on the process page. */
  steps: string[];
  /**
   * Sustainable capacity, as a multiple of the factory's daily build
   * programme.
   *
   * Expressed as headroom rather than an absolute rate so it scales with
   * whatever volume a factory is running: a plant building 90 sets a day and
   * one building 250 both need their press shop sized against their own
   * programme, not against a group-wide constant. The press shop carries the
   * least headroom, which is what makes it the constraint.
   */
  capacityFactor: number;
  /** Nominal cycle time per vehicle-set, in seconds. */
  cycleTimeSec: number;
  /** Typical first-time-through rate for the process, 0..1. */
  nominalFtt: number;
  /** Typical OEE for the process, 0..1. */
  nominalOee: number;
  /**
   * True where this portal carries real station-level instrumentation. Only
   * the press shop is wired to the device map today; the rest are modelled at
   * process level, and the UI says so rather than implying live telemetry.
   */
  instrumented: boolean;
}

export const PROCESSES: ProcessDef[] = [
  {
    id: "press-shop",
    name: "Press shop",
    summary: "Stamps steel panels",
    stream: "body",
    order: 0,
    inputs: [],
    description:
      "Cold-rolled coil is levelled, blanked and drawn into body panels on tandem and servo-transfer press lines. The draw operation carries the highest tonnage in the plant and generates most of the shop's forming defects.",
    steps: [
      "Decoil, level and blank",
      "Wash and lubricate blanks",
      "Draw (OP10)",
      "Trim and pierce (OP20)",
      "Flange and restrike (OP30)",
      "Cam pierce and final form (OP40)",
      "Inspection and racking",
    ],
    // The constraint: large draw dies are slow to change and the presses are
    // the least elastic asset in the plant.
    capacityFactor: 1.04,
    cycleTimeSec: 6.4,
    nominalFtt: 0.978,
    nominalOee: 0.655,
    instrumented: true,
  },
  {
    id: "body-shop",
    name: "Body shop",
    summary: "Welds body-in-white",
    stream: "body",
    order: 1,
    inputs: ["press-shop"],
    description:
      "Stamped panels are framed and joined into the body-in-white. Robotic spot welding, stud welding and structural adhesive build the underbody, side frames and roof, followed by hemming of the closures.",
    steps: [
      "Underbody framing",
      "Side frame build",
      "Main body framing (geo station)",
      "Roof and closure hemming",
      "Metal finish and dimensional audit",
    ],
    capacityFactor: 1.24,
    cycleTimeSec: 52,
    nominalFtt: 0.962,
    nominalOee: 0.72,
    instrumented: false,
  },
  {
    id: "paint-shop",
    name: "Paint shop",
    summary: "ED coat, paint, seal",
    stream: "body",
    order: 2,
    inputs: ["body-shop"],
    description:
      "The body is pre-treated, electro-deposition primed, sealed and topcoated. The paint shop is the most energy-intensive process in the plant and the largest single source of rework.",
    steps: [
      "Pre-treatment and phosphating",
      "Electro-deposition (ED) coat",
      "Sealer and underbody PVC",
      "Primer, basecoat and clearcoat",
      "Oven cure and paint inspection",
    ],
    capacityFactor: 1.18,
    cycleTimeSec: 58,
    nominalFtt: 0.931,
    nominalOee: 0.688,
    instrumented: false,
  },
  {
    id: "frame-chassis",
    name: "Frame & chassis line",
    summary: "Ladder frame build",
    stream: "chassis",
    order: 0,
    inputs: [],
    description:
      "The Thar's body-on-frame architecture starts here. Ladder frame rails and cross members are riveted and welded, then the frame is corrosion-coated and loaded with suspension brackets.",
    steps: [
      "Rail forming and cross-member fit",
      "Frame riveting and welding",
      "Corrosion coating",
      "Suspension bracket loading",
    ],
    capacityFactor: 1.33,
    cycleTimeSec: 47,
    nominalFtt: 0.974,
    nominalOee: 0.741,
    instrumented: false,
  },
  {
    id: "powertrain",
    name: "Powertrain dressing",
    summary: "Engine, gearbox, axles",
    stream: "chassis",
    order: 1,
    inputs: ["frame-chassis"],
    description:
      "Engine, transmission, transfer case, propeller shafts and both axles are dressed onto the frame, along with the fuel tank, exhaust and brake lines.",
    steps: [
      "Engine and gearbox dressing",
      "Transfer case and prop shafts",
      "Front and rear axle mounting",
      "Fuel, exhaust and brake lines",
      "Wheel and tyre fitment",
    ],
    capacityFactor: 1.29,
    cycleTimeSec: 51,
    nominalFtt: 0.968,
    nominalOee: 0.727,
    instrumented: false,
  },
  {
    id: "marriage",
    name: "Body-chassis marriage",
    summary: "Body drop onto frame",
    stream: "joint",
    order: 0,
    inputs: ["paint-shop", "powertrain"],
    description:
      "The painted body is lowered onto the dressed frame and torqued down at the body mounts. This is the synchronisation point of the whole plant — both streams must arrive in the same build sequence.",
    steps: [
      "Sequence match and body lift",
      "Body drop and alignment",
      "Body mount torque and audit",
    ],
    capacityFactor: 1.21,
    cycleTimeSec: 55,
    nominalFtt: 0.985,
    nominalOee: 0.756,
    instrumented: false,
  },
  {
    id: "trim-final",
    name: "Trim & final assembly",
    summary: "Interiors, wiring, wheels",
    stream: "joint",
    order: 1,
    inputs: ["marriage"],
    description:
      "Wiring harness, cockpit module, glass, seats, trim and soft top are installed, then the vehicle is filled with fluids and started for the first time.",
    steps: [
      "Wiring harness and cockpit",
      "Glass and closures",
      "Seats, trim and soft top",
      "Fluid fill and first start",
    ],
    capacityFactor: 1.17,
    cycleTimeSec: 61,
    nominalFtt: 0.947,
    nominalOee: 0.712,
    instrumented: false,
  },
  {
    id: "testing-dispatch",
    name: "Testing & dispatch",
    summary: "End-of-line checks, PDI",
    stream: "joint",
    order: 2,
    inputs: ["trim-final"],
    description:
      "End-of-line testing covers wheel alignment, headlamp aim, brake and roller test, water leak test and a short track run, followed by pre-delivery inspection and dispatch to the yard.",
    steps: [
      "Wheel alignment and headlamp aim",
      "Roller and brake test",
      "Water leak test",
      "Track run and rectification",
      "Pre-delivery inspection and dispatch",
    ],
    capacityFactor: 1.26,
    cycleTimeSec: 49,
    nominalFtt: 0.958,
    nominalOee: 0.734,
    instrumented: false,
  },
];

export const PROCESS_BY_ID = new Map(PROCESSES.map((p) => [p.id, p]));

export const PROCESS_IDS = PROCESSES.map((p) => p.id);

export const STREAM_LABEL: Record<ProcessStream, string> = {
  body: "Body stream",
  chassis: "Chassis stream",
  joint: "Joined line",
};

/**
 * The process order a vehicle physically flows through.
 *
 * A topological sort of the graph rather than a hand-written list, so the
 * sequence cannot drift out of step with `inputs` when a process is added.
 */
let sequenceCache: ProcessDef[] | null = null;

export function processSequence(): ProcessDef[] {
  // Memoised: the chain solver calls this once per plant per day, and a 90-day
  // pan-India window would otherwise re-sort the graph hundreds of times.
  if (sequenceCache) return sequenceCache;

  const done = new Set<string>();
  const out: ProcessDef[] = [];
  const remaining = [...PROCESSES];

  while (remaining.length > 0) {
    const ready = remaining.filter((p) => p.inputs.every((i) => done.has(i)));
    if (ready.length === 0) {
      // A cycle would mean the catalog is malformed; fail loudly rather than
      // silently dropping processes off the end of the chain.
      throw new Error(
        `Process graph has a cycle or a missing input among: ${remaining.map((p) => p.id).join(", ")}`,
      );
    }
    // Stream then order keeps parallel branches in a stable, readable sequence.
    ready.sort((a, b) => a.stream.localeCompare(b.stream) || a.order - b.order);
    for (const p of ready) {
      out.push(p);
      done.add(p.id);
      remaining.splice(remaining.indexOf(p), 1);
    }
  }

  sequenceCache = out;
  return out;
}

/**
 * The structurally tightest process — the least headroom over programme.
 *
 * Computed, so it moves if the catalog changes. Note this is the *design*
 * constraint; the constraint actually observed in a window comes from the chain
 * solver, which also accounts for how each process ran on the day.
 */
export function tightestProcess(): ProcessDef {
  return PROCESSES.reduce((worst, p) =>
    p.capacityFactor < worst.capacityFactor ? p : worst,
  );
}

/** Processes laid out by stream, in flow order — drives the process map. */
export function processesByStream(stream: ProcessStream): ProcessDef[] {
  return PROCESSES.filter((p) => p.stream === stream).sort((a, b) => a.order - b.order);
}
