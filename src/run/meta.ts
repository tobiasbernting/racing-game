// Progress that outlives a run: trophies 🏆 (a score, nothing is locked behind them), medals (run/medals.ts, shown in
// Skrytlådan) and which talismans have been seen. Every vehicle and every talisman is open from the first launch, and
// nothing in here may ever change what a seeded run generates (a test holds it to that).
import { CAR_BODIES, CAR_PAINTS, isCarBody, isHelmetDesign, type CarBody, type HelmetDesign } from '../shared/rally.ts';
import { cleanPlayerName } from '../shared/rallyname.ts';
import { isTrinket } from './trinkets.ts';
import { ACTS } from './map.ts';
import { MEDALS, MEDAL_RENAMES } from './medals.ts';
import { DIFFICULTIES, asDifficulty, isDifficulty, type Difficulty } from './difficulty.ts';

/** The five vehicles that used to be the only open ones (they have no medal). */
export const STARTERS: readonly CarBody[] = ['hatch', 'buggy', 'pickup', 'moped', 'tractor'];

/**
 * The oldest rule, kept only for old saves: vehicles used to unlock by trophies. A save from before the challenges is
 * lifted with it once, so nobody loses the medals those vehicles stand for.
 */
export const LEGACY_BODY_UNLOCK: Record<string, number> = { hatch: 0, buggy: 0, pickup: 3, moped: 4, atv: 6, coupe: 8, tractor: 11, moto: 13, monster: 15, sofa: 20 };

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
  /** Talisman ids that have turned up in a shop, a reward or a bag. */
  seen: string[];
  /** The difficulty chosen last: the default on the pick screen (an old save's `calm: true` reads as Söndagsåkare). */
  diff: Difficulty;
  /** The furthest act (1..3) and the runs won, for each difficulty (Skrytlådan). */
  best: Record<Difficulty, DiffBest>;
  /** 1 once the save is in the medal format: saves without it still carry the old list of open vehicles (or none), which becomes medals once. */
  medals: 1;
  /** Progress on each medal (run/medals.ts), by medal id; a medal is earned when it reaches its goal. */
  progress: Record<string, number>;
  body: CarBody;
  paint: string;
  /** What the player is called ('' until they have been asked), and the rally name they picked ('' = they keep their own name). */
  name: string;
  alias: string;
  /** The helmet: its pattern and colour ('' = the car's own paint). Older saves had a driver here; it reads as the default helmet. */
  helmet: HelmetDesign;
  helmetColor: string;
}

export const defaultMeta = (): Meta => ({ v: 1, trophies: 0, runs: 0, wins: 0, bestAct: 0, seen: [], diff: 'normal', best: emptyBest(), medals: 1, progress: {}, body: 'hatch', paint: CAR_PAINTS[0], name: '', alias: '', helmet: 'stripe', helmetColor: '' });

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
  const body = isCarBody(o.body) ? o.body : d.body;
  const rawProgress = o.progress && typeof o.progress === 'object' && !Array.isArray(o.progress) ? { ...(o.progress as Record<string, unknown>) } : {};
  const progress: Record<string, number> = {};
  // the old list of open vehicles (or, in the oldest saves, what the trophies had opened) is medals earned: nothing is lost
  // (only a save from before the medals has a list or none; a save in the medal format never lifts anything)
  const had = o.medals === 1 ? [] : Array.isArray(o.bodies) ? o.bodies.filter(isCarBody) : legacyBodies(trophies);
  // medals that were renamed: the old id's progress counts under the new one (the larger of the two)
  for (const [from, to] of Object.entries(MEDAL_RENAMES)) {
    const a = rawProgress[from];
    const b = rawProgress[to];
    if (typeof a === 'number' && Number.isFinite(a) && a > (typeof b === 'number' && Number.isFinite(b) ? b : 0)) rawProgress[to] = a;
  }
  for (const c of MEDALS) {
    const v = rawProgress[c.id];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) progress[c.id] = Math.min(c.goal, Math.floor(v));
    if (had.includes(c.body)) progress[c.id] = c.goal;
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
    medals: 1,
    progress,
    body,
    paint: typeof o.paint === 'string' && (CAR_PAINTS as readonly string[]).includes(o.paint) ? o.paint : d.paint,
    name: cleanPlayerName(o.name),
    alias: cleanPlayerName(o.alias),
    helmet: isHelmetDesign(o.helmet) ? o.helmet : d.helmet,
    helmetColor: typeof o.helmetColor === 'string' && (CAR_PAINTS as readonly string[]).includes(o.helmetColor) ? o.helmetColor : '',
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
