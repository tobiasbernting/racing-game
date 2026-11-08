// A few cosmetic items are prizes: each is tied to a medal and opens when the medal is earned. Everything else in the
// garage is free from the start. A lock is only ever about looks, never about how a vehicle drives.
import { earned, medalById, type Medal } from './medals.ts';

export type LockKey = `livery:${string}` | `wheels:${string}` | `decal:${string}` | `smoke:${string}`;

const LOCKS: Readonly<Record<string, string>> = {
  'livery:flames': 'takedowns',
  'wheels:gold': 'win',
  'decal:crown': 'boss2',
  'smoke:gold': 'coins',
};

/** The medal that still has to be earned for this item, or null when it is free (or already earned). */
export function lockedBy(progress: Readonly<Record<string, number>>, key: LockKey): Medal | null {
  const id = LOCKS[key];
  const m = id ? medalById(id) : undefined;
  return m && !earned(progress, m) ? m : null;
}

export const lockKeys = (): string[] => Object.keys(LOCKS);
