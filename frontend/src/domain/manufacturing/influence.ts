/**
 * What affects what, in the process chain.
 *
 * The chain is a directed graph, so "which processes affect this one" is a
 * graph question, not a judgement call: everything reachable by walking
 * `inputs` backwards feeds it, and everything reachable forwards depends on it.
 * Splitting those into *direct* and *indirect* matters operationally — a direct
 * feed starves you this shift, an indirect one starves you tomorrow.
 *
 * The press shop reaches the marriage station only through body and paint, so
 * it is an indirect influence there. Saying so is the difference between "fix
 * the marriage station" and "fix the press shop, the marriage station is fine".
 */

import { PROCESSES, PROCESS_BY_ID, type ProcessDef } from "./processes";
import type { ProcessDayMetrics } from "./processMetrics";

export interface Influence {
  def: ProcessDef;
  /** 1 = feeds it directly, 2+ = reaches it through that many hops. */
  distance: number;
  direction: "upstream" | "downstream";
}

/** Processes feeding `processId`, nearest first. */
export function upstreamOf(processId: string): Influence[] {
  return walk(processId, "upstream");
}

/** Processes fed by `processId`, nearest first. */
export function downstreamOf(processId: string): Influence[] {
  return walk(processId, "downstream");
}

function walk(processId: string, direction: "upstream" | "downstream"): Influence[] {
  const seen = new Map<string, number>();
  let frontier = [processId];
  let distance = 0;

  while (frontier.length > 0) {
    distance += 1;
    const next: string[] = [];

    for (const id of frontier) {
      const neighbours =
        direction === "upstream"
          ? (PROCESS_BY_ID.get(id)?.inputs ?? [])
          : PROCESSES.filter((p) => p.inputs.includes(id)).map((p) => p.id);

      for (const n of neighbours) {
        // Keep the shortest path: a process reachable both directly and via a
        // longer route is a direct influence, not an indirect one.
        if (n === processId || seen.has(n)) continue;
        seen.set(n, distance);
        next.push(n);
      }
    }

    frontier = next;
  }

  return [...seen.entries()]
    .map(([id, d]) => ({ def: PROCESS_BY_ID.get(id)!, distance: d, direction }))
    .sort((a, b) => a.distance - b.distance || a.def.name.localeCompare(b.def.name));
}

export interface InfluenceReading extends Influence {
  metrics?: ProcessDayMetrics;
  /**
   * True when this process is currently limiting the one under review — it is
   * upstream, and it is not delivering everything the chain could absorb.
   */
  isConstraining: boolean;
  /** One line explaining why it matters to the process under review. */
  note: string;
}

/**
 * Reads the influence set against a solved chain.
 *
 * An upstream process is only *constraining* if it is actually short: a plant
 * whose paint shop runs at 70% of capacity is not being held back by paint, and
 * saying otherwise would send someone to fix the wrong thing.
 */
export function readInfluence(
  processId: string,
  chain: ProcessDayMetrics[],
  bottleneckId: string,
): { upstream: InfluenceReading[]; downstream: InfluenceReading[] } {
  const byId = new Map(chain.map((c) => [c.processId, c]));
  const self = byId.get(processId);

  const read = (inf: Influence): InfluenceReading => {
    const metrics = byId.get(inf.def.id);
    const hop = inf.distance === 1 ? "Feeds it directly" : `${inf.distance} steps upstream`;

    if (inf.direction === "upstream") {
      // It constrains when it is the chain's bottleneck, or when what it hands
      // on is less than what the process under review could have run.
      const starving =
        !!metrics && !!self && metrics.good < self.capacity * 0.995;
      const isConstraining = inf.def.id === bottleneckId || starving;

      return {
        ...inf,
        metrics,
        isConstraining,
        note: isConstraining
          ? `${hop} · delivering ${round(metrics?.good ?? 0)}/day, which caps this process`
          : `${hop} · delivering enough to keep this process fed`,
      };
    }

    const starved = !!metrics && metrics.starvedBy > 1;
    return {
      ...inf,
      metrics,
      isConstraining: false,
      note: starved
        ? `${inf.distance === 1 ? "Fed directly by it" : `${inf.distance} steps downstream`} · idle ${round(metrics!.starvedBy)}/day waiting on supply`
        : `${inf.distance === 1 ? "Fed directly by it" : `${inf.distance} steps downstream`} · keeping up with what it receives`,
    };
  };

  return {
    upstream: upstreamOf(processId).map(read),
    downstream: downstreamOf(processId).map(read),
  };
}

function round(v: number): string {
  return Math.round(v).toLocaleString("en-IN");
}
