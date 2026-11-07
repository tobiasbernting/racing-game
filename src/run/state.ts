// The state of a run in progress, as plain JSON (it is saved after every node), and the small rules on it:
// hearts, kronor, trinkets and the funny stats. Functions here never touch the DOM or the clock.
import type { RaceStats } from '../rally/mods.ts';
import { CAR_PAINTS, newCar, type CarDriver, type CarBody, type GarageCar } from '../shared/rally.ts';
import { CAR_BODY_NAMES } from '../shared/names.ts';
import { ACTS, actMap, findNode, type ActMap, type BossId, type MapNode, type NodeType } from './map.ts';
import { kitOf } from '../shared/abilities.ts';
import { MAX_STACK, perksOf, stackCap, trinketById, type Owned } from './trinkets.ts';
import type { RaceKind } from '../shared/kinds.ts';

export const START_HEARTS = 3;
export const CALM_HEARTS = 5;

export interface RunStats extends RaceStats {
  races: number;
  wins: number;
  heartsLost: number;
  kronorEarned: number;
  bossesBeaten: number;
  /** Best placing so far (1 = first), 0 before the first race. */
  bestPlace: number;
  /** Wrecked cars you took down, and times you were wrecked yourself. */
  takedowns: number;
  wrecks: number;
  /** Top-three finishes, ms spent racing (finished races), kronor spent, and the fastest lap of the run (ms, 0 = none yet). */
  podiums: number;
  totalTime: number;
  kronorSpent: number;
  bestLap: number;
  /** How often each trinket pulsed its icon in a race, by trinket id. */
  triggers: Record<string, number>;
}

export const emptyRunStats = (): RunStats => ({
  bounces: 0,
  driftSeconds: 0,
  bananas: 0,
  bananaHits: 0,
  boosts: 0,
  coins: 0,
  squashed: 0,
  quacks: 0,
  jumps: 0,
  races: 0,
  wins: 0,
  heartsLost: 0,
  kronorEarned: 0,
  bossesBeaten: 0,
  bestPlace: 0,
  takedowns: 0,
  wrecks: 0,
  airSeconds: 0,
  airJumps: 0,
  topSpeed: 0,
  longestDrift: 0,
  nitroSeconds: 0,
  oilHits: 0,
  overtakes: 0,
  hazards: 0,
  abilityUses: 0,
  podiums: 0,
  totalTime: 0,
  kronorSpent: 0,
  bestLap: 0,
  triggers: {},
});

/** One node of the road walked, in order, for the timeline of the result screen. */
export interface NodeLog {
  nodeId: string;
  act: number;
  row: number;
  type: NodeType;
  kind?: RaceKind;
  /** The course or the boss name, the shop, the event. */
  title: string;
  course?: string;
  place?: number;
  n?: number;
  finished?: boolean;
  /** Blodbad: points. */
  points?: number;
  /** ms */
  time?: number;
  /** Hearts it cost. */
  lost: number;
  goalMet?: boolean;
  takedowns?: number;
  /** Which boss it was (bosses only). */
  boss?: BossId;
}

/** A trinket or a part upgrade that came into the build, and where from. */
export interface Acquired {
  what: 'trinket' | 'part';
  id: string;
  from: string;
  node: string;
}

/** What a race came to, shown on the card after it. */
export interface RaceSummary {
  place: number;
  n: number;
  finished: boolean;
  /** ms */
  time: number;
  heartLost: boolean;
  /** How many hearts it cost (0, 1 or 2). */
  hearts?: number;
  prize: number;
  coins: number;
  bonus: number;
  /** Kronor added to the purse in the end (scaled for the act and the mode). */
  total: number;
  goal?: { text: string; met: boolean };
  medal: 'gold' | 'silver' | 'bronze' | null;
  /** Is a trinket to pick next? */
  reward: boolean;
  /** What the reward is: a pick of three for a win, two plain ones for second place, or the elite and boss pick. */
  rewardKind?: 'win' | 'second' | 'elite' | 'boss';
  /** Rally, Blandat or Blodbad; in Blodbad also the points, takedowns and wrecks of the player. */
  kind?: RaceKind;
  points?: number;
  /** Where the player crossed the line on the road (Blodbad is scored on points, not on this). */
  roadPlace?: number;
  takedowns?: number;
  wrecked?: number;
}

export interface ShopItem {
  id: string;
  sold: boolean;
}

export type Screen =
  | { kind: 'prerace'; nodeId: string }
  | { kind: 'postrace'; nodeId: string; summary: RaceSummary }
  | { kind: 'reward'; nodeId: string; choices: string[]; source: 'race' | 'elite' | 'boss' | 'event' | 'consolation' }
  | { kind: 'shop'; nodeId: string; stock: ShopItem[]; rerolls: number; healed: boolean; repaired: boolean }
  | { kind: 'workshop'; nodeId: string; used: boolean; note: string }
  | { kind: 'event'; nodeId: string; eventId: string; outcome: { text: string; lines: string[] } | null };

export type RunStatus = 'running' | 'won' | 'dead';

/** How a finished run paid out. Set once, when the trophies go to the meta progress, so a reload never counts twice. */
export interface RunEnd {
  won: boolean;
  trophies: number;
  total: number;
  unlockedBodies: CarBody[];
  unlockedTrinkets: string[];
  /** The challenge progress when the run ended (the result screen compares it with `RunState.chal0`). */
  progress?: Record<string, number>;
}

export interface RunState {
  v: 1;
  seed: number;
  calm: boolean;
  /** The meta trophies when the run began: which trinkets are in the pool. */
  pool: number;
  act: number;
  /** The last node finished in this act (null at the start of an act). */
  at: string | null;
  /** The nodes finished in this act, in order (the walked road on the map). */
  path: string[];
  hearts: number;
  maxHearts: number;
  kronor: number;
  trinkets: Owned[];
  car: GarageCar;
  screen: Screen | null;
  stats: RunStats;
  status: RunStatus;
  nodesDone: number;
  /** Every node finished, in order, and every trinket and part that came into the build (older saves have none). */
  log: NodeLog[];
  got: Acquired[];
  /** Hearts lost in the node being played (for the log of shops and events). */
  nodeLost: number;
  /** Challenge progress when the run began, and the vehicles it opened on the way (run/unlocks.ts). */
  chal0: Record<string, number>;
  opened: CarBody[];
  /** Present once a finished run has been counted. */
  end?: RunEnd;
}

export interface NewRunOpts {
  seed: number;
  calm: boolean;
  body: CarBody;
  driver: CarDriver;
  paint: string;
  trophies: number;
  /** Challenge progress now, to tell afterwards what the run moved. */
  progress?: Record<string, number>;
}

export function newRun(o: NewRunOpts): RunState {
  const car = newCar(1, o.body, CAR_BODY_NAMES[o.body], o.paint);
  car.style.driver = o.driver;
  const hearts = o.calm ? CALM_HEARTS : START_HEARTS;
  const run: RunState = { v: 1, seed: o.seed, calm: o.calm, pool: o.trophies, act: 0, at: null, path: [], hearts, maxHearts: hearts, kronor: 0, trinkets: [], car, screen: null, stats: emptyRunStats(), status: 'running', nodesDone: 0, log: [], got: [], nodeLost: 0, chal0: { ...(o.progress ?? {}) }, opened: [] };
  // every vehicle starts with a trinket that fits it
  addTrinket(run, kitOf(o.body).trinket, { from: `Startpryl: ${CAR_BODY_NAMES[o.body]}`, node: '' });
  return run;
}

export const copyRun = (r: RunState): RunState => structuredClone(r);

export const mapOf = (r: RunState): ActMap => actMap(r.seed, Math.min(r.act, ACTS - 1));
export const nodeOf = (r: RunState, id: string): MapNode | undefined => findNode(mapOf(r), id);

/** The nodes the player may go to next. */
export function reachable(r: RunState): MapNode[] {
  if (r.status !== 'running') return [];
  const m = mapOf(r);
  if (r.at === null) return m.rows[0]!;
  const from = findNode(m, r.at);
  return from ? from.next.map((id) => findNode(m, id)!).filter(Boolean) : [];
}

export const trinketCount = (r: RunState): number => r.trinkets.reduce((a, t) => a + t.n, 0);
export const ownedN = (r: RunState, id: string): number => r.trinkets.find((t) => t.id === id)?.n ?? 0;

/** Adds one trinket (same id: stacks, up to MAX_STACK). Perks that act at once (hearts) apply here. */
export function addTrinket(r: RunState, id: string, src?: { from: string; node: string }): void {
  if (src) noteGot(r, 'trinket', id, src.from, src.node);
  const have = r.trinkets.find((t) => t.id === id);
  if (have) have.n = Math.min(MAX_STACK, stackCap(trinketById(id)), have.n + 1);
  else r.trinkets.push({ id, n: 1 });
  const before = r.maxHearts;
  r.maxHearts = (r.calm ? 5 : 3) + perksOf(r.trinkets).maxHearts;
  if (r.maxHearts > before) r.hearts += r.maxHearts - before;
}

/** Remembers where a trinket or part came from (the build section of the result screen). */
export function noteGot(r: RunState, what: Acquired['what'], id: string, from: string, node: string): void {
  if (r.got.length < 300) r.got.push({ what, id, from, node });
}

export function addKronor(r: RunState, n: number): void {
  r.kronor = Math.max(0, r.kronor + Math.round(n));
  if (n > 0) r.stats.kronorEarned += Math.round(n);
  else if (n < 0) r.stats.kronorSpent += Math.round(-n);
}

/** Loses a heart; the last one ends the run unless `spare` says it must stay. */
export function loseHeart(r: RunState, spare = false): boolean {
  if (spare && r.hearts <= 1) return false;
  if (r.hearts <= 0) return false;
  r.hearts -= 1;
  r.stats.heartsLost++;
  r.nodeLost++;
  if (r.hearts <= 0) r.status = 'dead';
  return true;
}

export function healHeart(r: RunState, n = 1): boolean {
  if (r.hearts >= r.maxHearts) return false;
  r.hearts = Math.min(r.maxHearts, r.hearts + n);
  return true;
}

/** Kronor are scaled up in later acts and in calm mode. */
export const KRONOR_SCALE = [1, 1.3, 1.7] as const;
export const actScale = (act: number): number => KRONOR_SCALE[Math.min(act, KRONOR_SCALE.length - 1)]!;

/**
 * Hearts a race costs. Normal: the bottom half costs one, not finishing two, and losing a boss race (anything but
 * first, or most points in Blodbad) two. In lugnt läge only a DNF or dead last costs one, bosses included.
 */
export function heartsLost(place: number, n: number, finished: boolean, calm = false, boss = false): number {
  if (calm) return !finished || (n > 1 && place >= n) ? 1 : 0;
  if (!finished) return 2;
  if (n <= 1) return 0;
  if (boss && place > 1) return 2;
  return place > n / 2 ? 1 : 0;
}

export const costsHeart = (place: number, n: number, finished: boolean, calm = false, boss = false): boolean => heartsLost(place, n, finished, calm, boss) > 0;

export const validPaint = (p: string): boolean => (CAR_PAINTS as readonly string[]).includes(p);
