/**
 * Deterministic pseudo-random number generation.
 *
 * The simulator must produce identical output on the server and the client,
 * otherwise React hydration mismatches. Everything is therefore seeded from
 * stable strings (plant id, station id, shift, hour bucket) rather than
 * Math.random() or Date.now().
 */

/** FNV-1a — turns any string into a 32-bit seed. */
export function hashSeed(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  const str = parts.join("|");
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 — small, fast, well-distributed 32-bit PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private next: () => number;

  constructor(...seedParts: (string | number)[]) {
    this.next = mulberry32(hashSeed(...seedParts));
  }

  /** Uniform in [0, 1). */
  float(): number {
    return this.next();
  }

  /** Uniform in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Approximately normal via the mean of 3 uniforms (Bates distribution). */
  normal(mean: number, stdDev: number): number {
    const u = (this.next() + this.next() + this.next()) / 3;
    // Bates(3) has sd = 1/(2*sqrt(3)*sqrt(3)) ≈ 0.1667 -> scale to unit sd.
    return mean + (u - 0.5) * 6 * 0.577 * stdDev;
  }

  /** Normal, clamped to [min, max]. */
  clampedNormal(mean: number, stdDev: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, this.normal(mean, stdDev)));
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** Weighted pick. `weights` need not sum to 1. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
}

/**
 * Splits `total` into `n` positive integer parts using the supplied weights,
 * guaranteeing the parts sum exactly to `total` (largest-remainder method).
 * Used so that per-defect / per-shift breakdowns always reconcile to the header
 * number instead of drifting by a unit or two.
 */
export function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);

  const exact = weights.map((w) => (w / sum) * total);
  const floors = exact.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);

  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);

  const out = [...floors];
  let k = 0;
  while (remainder > 0 && order.length > 0) {
    out[order[k % order.length].i] += 1;
    remainder -= 1;
    k += 1;
  }
  return out;
}
