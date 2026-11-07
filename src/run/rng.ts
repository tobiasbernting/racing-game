// Seeded randomness for the run. Nothing here keeps state between calls: every decision (the map of an act,
// a shop's stock, what an event does) makes its own generator from the run seed plus a few labels, so a run
// restored from a save decides exactly as it would have.
import { rng } from '../rally/util.ts';

/** A 32-bit hash of a seed and any labels (strings or numbers). */
export function hashSeed(seed: number, ...parts: (string | number)[]): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  }
  return (h ^ (h >>> 13)) >>> 0;
}

export class Rng {
  private next: () => number;

  constructor(seed: number) {
    this.next = rng(seed);
  }

  /** Makes a generator for one decision: same seed and labels, same numbers. */
  static for(seed: number, ...parts: (string | number)[]): Rng {
    return new Rng(hashSeed(seed, ...parts));
  }

  /** 0 (included) .. 1 (excluded). */
  float(): number {
    return this.next();
  }

  /** Whole number lo..hi, both included. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(list: readonly T[]): T {
    if (list.length === 0) throw new Error('pick from an empty list');
    return list[Math.min(list.length - 1, Math.floor(this.next() * list.length))]!;
  }

  /** A new array in random order. */
  shuffle<T>(list: readonly T[]): T[] {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }

  /** One item by weight. */
  weighted<T>(list: readonly T[], weight: (t: T) => number): T {
    let total = 0;
    for (const t of list) total += Math.max(0, weight(t));
    if (total <= 0) return this.pick(list);
    let r = this.next() * total;
    for (const t of list) {
      r -= Math.max(0, weight(t));
      if (r < 0) return t;
    }
    return list[list.length - 1]!;
  }
}

/** A fresh seed for a new run. */
export const newSeed = (): number => (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
