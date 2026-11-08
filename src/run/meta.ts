// Progress that outlives a run: trophies 🏆 earned by runs put more trinkets in the pool, vehicles are unlocked by
// challenges (run/unlocks.ts) and the collection remembers which trinkets have been seen.
import { CAR_BODIES, CAR_PAINTS, isCarBody, type CarBody, type CarDriver, CAR_DRIVERS } from '../shared/rally.ts';
import { TRINKETS, isTrinket, type TrinketDef } from './trinkets.ts';
import { ACTS } from './map.ts';
import { CHALLENGES } from './unlocks.ts';
import { DIFFICULTIES, asDifficulty, isDifficulty, type Difficulty } from './difficulty.ts';

/** The vehicles everybody starts with. */
export const STARTERS: readonly CarBody[] = ['hatch', 'buggy', 'pickup', 'moped', 'tractor'];

/**
 * The old rule, kept only for old saves: vehicles used to unlock by trophies. A save from before the challenges is
 * lifted with it once, so nobody loses a vehicle they already had.
 */
export const LEGACY_BODY_UNLOCK: Record<string, number> = { hatch: 0, buggy: 0, pickup: 3, moped: 4, atv: 6, coupe: 8, tractor: 11, moto: 13, monster: 15, sofa: 20 };

export const unlockedBodies = (meta: Pick<Meta, 'bodies'>): CarBody[] => CAR_BODIES.filter((b) => meta.bodies.includes(b));
export const isUnlocked = (meta: Pick<Meta, 'bodies'>, b: CarBody): boolean => meta.bodies.includes(b);
export const unlockedTrinkets = (trophies: number): TrinketDef[] => TRINKETS.filter((t) => t.unlock <= trophies);

/** Starters, plus (for a save that has none of its own yet) everything the trophies once opened. */
export const legacyBodies = (trophies: number): CarBody[] => CAR_BODIES.filter((b) => STARTERS.includes(b) || (LEGACY_BODY_UNLOCK[b] ?? Infinity) <= trophies);

export interface DiffBest {
  act: number;
  wins: number;
}

export const emptyBest = (): Record<Difficulty, DiffBest> => ({ calm: { act: 0, wins: 0 }, normal: { act: 0, wins: 0 }, hard: { act: 0, wins: 0 }, one: { act: 0, wins: 0 } });

export interface Meta {
  v: 1;
  trophies: number;
  runs: number;
  wins: number;
  /** Furthest act reached (1..3). */
  bestAct: number;
  /** Trinket ids that have turned up in a shop, a reward or a bag. */
  seen: string[];
  /** The difficulty chosen last: the default on the pick screen (an old save's `calm: true` reads as Söndagsåkare). */
  diff: Difficulty;
  /** The furthest act (1..3) and the runs won, for each difficulty (Skrytlådan). */
  best: Record<Difficulty, DiffBest>;
  /** The vehicles that are open. */
  bodies: CarBody[];
  /** Progress on each challenge (run/unlocks.ts), by challenge id. */
  progress: Record<string, number>;
  body: CarBody;
  paint: string;
  driver: CarDriver;
}

export const defaultMeta = (): Meta => ({ v: 1, trophies: 0, runs: 0, wins: 0, bestAct: 0, seen: [], diff: 'normal', best: emptyBest(), bodies: [...STARTERS], progress: {}, body: 'hatch', paint: CAR_PAINTS[0], driver: 'human' });

/** Trophies a finished run is worth: 2 for each boss beaten, 3 more for winning, 1 for a run with a few races. */
export function trophiesFor(r: { bossesBeaten: number; won: boolean; races: number }): number {
  return r.bossesBeaten * 2 + (r.won ? 3 : 0) + (r.races >= 3 ? 1 : 0);
}

/** Anything stored (or junk) becomes valid meta. Older shapes are lifted to the current one. */
export function cleanMeta(raw: unknown): Meta {
  const d = defaultMeta();
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Record<string, unknown>;
  const int = (v: unknown, hi: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(hi, Math.floor(v))) : 0);
  const trophies = int(o.trophies, 9999);
  // a save from before the challenges has no list: it keeps everything the trophies had opened
  const stored = Array.isArray(o.bodies) ? o.bodies.filter(isCarBody) : null;
  const bodies = CAR_BODIES.filter((b) => STARTERS.includes(b) || (stored ? stored.includes(b) : legacyBodies(trophies).includes(b)));
  const body = isCarBody(o.body) && bodies.includes(o.body) ? o.body : d.body;
  const rawProgress = o.progress && typeof o.progress === 'object' && !Array.isArray(o.progress) ? (o.progress as Record<string, unknown>) : {};
  const progress: Record<string, number> = {};
  for (const c of CHALLENGES) {
    const v = rawProgress[c.id];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) progress[c.id] = Math.min(c.goal, Math.floor(v));
  }
  return {
    v: 1,
    trophies,
    runs: int(o.runs, 99999),
    wins: int(o.wins, 99999),
    bestAct: Math.min(ACTS, int(o.bestAct, ACTS)),
    seen: Array.isArray(o.seen) ? [...new Set(o.seen.filter(isTrinket))] : [],
    diff: isDifficulty(o.diff) ? o.diff : asDifficulty(o.calm === true),
    best: cleanBest(o.best),
    bodies,
    progress,
    body,
    paint: typeof o.paint === 'string' && (CAR_PAINTS as readonly string[]).includes(o.paint) ? o.paint : d.paint,
    driver: typeof o.driver === 'string' && (CAR_DRIVERS as readonly string[]).includes(o.driver) ? (o.driver as CarDriver) : d.driver,
  };
}

function cleanBest(raw: unknown): Record<Difficulty, DiffBest> {
  const out = emptyBest();
  if (!raw || typeof raw !== 'object') return out;
  const o = raw as Record<string, unknown>;
  for (const d of DIFFICULTIES) {
    const b = o[d];
    if (!b || typeof b !== 'object') continue;
    const x = b as Record<string, unknown>;
    const n = (v: unknown, hi: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(hi, Math.floor(v))) : 0);
    out[d] = { act: n(x.act, ACTS), wins: n(x.wins, 99999) };
  }
  return out;
}
