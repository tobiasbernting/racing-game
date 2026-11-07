// Progress that outlives a run: trophies 🏆 earned by runs unlock vehicle bodies and put more trinkets in the
// pool; the collection remembers which trinkets have been seen.
import { CAR_BODIES, CAR_PAINTS, isCarBody, type CarBody, type CarDriver, CAR_DRIVERS } from '../shared/rally.ts';
import { TRINKETS, isTrinket, type TrinketDef } from './trinkets.ts';
import { ACTS } from './map.ts';

/** Trophies needed per body (the rally car and the buggy are there from the start). */
export const BODY_UNLOCK: Record<CarBody, number> = { hatch: 0, buggy: 0, pickup: 3, moped: 4, atv: 6, coupe: 8, tractor: 11, moto: 13, monster: 15, sofa: 20 };

export const unlockedBodies = (trophies: number): CarBody[] => CAR_BODIES.filter((b) => BODY_UNLOCK[b] <= trophies);
export const unlockedTrinkets = (trophies: number): TrinketDef[] => TRINKETS.filter((t) => t.unlock <= trophies);

export interface Meta {
  v: 1;
  trophies: number;
  runs: number;
  wins: number;
  /** Furthest act reached (1..3). */
  bestAct: number;
  /** Trinket ids that have turned up in a shop, a reward or a bag. */
  seen: string[];
  calm: boolean;
  body: CarBody;
  paint: string;
  driver: CarDriver;
}

export const defaultMeta = (): Meta => ({ v: 1, trophies: 0, runs: 0, wins: 0, bestAct: 0, seen: [], calm: false, body: 'hatch', paint: CAR_PAINTS[0], driver: 'human' });

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
  const body = isCarBody(o.body) && BODY_UNLOCK[o.body] <= trophies ? o.body : d.body;
  return {
    v: 1,
    trophies,
    runs: int(o.runs, 99999),
    wins: int(o.wins, 99999),
    bestAct: Math.min(ACTS, int(o.bestAct, ACTS)),
    seen: Array.isArray(o.seen) ? [...new Set(o.seen.filter(isTrinket))] : [],
    calm: o.calm === true,
    body,
    paint: typeof o.paint === 'string' && (CAR_PAINTS as readonly string[]).includes(o.paint) ? o.paint : d.paint,
    driver: typeof o.driver === 'string' && (CAR_DRIVERS as readonly string[]).includes(o.driver) ? (o.driver as CarDriver) : d.driver,
  };
}
