// Saving: the run in progress (after every node) and the meta progress, in localStorage. Versioned; every
// access is wrapped because storage can be missing, full or blocked; anything unreadable becomes "no save"
// (run) or fresh progress (meta) instead of an error.
import { CAR_DRIVERS, CAR_PARTS, PART_MAX_LEVEL, defaultStyle, isCarBody, newCar, type CarDriver, type GarageCar } from '../shared/rally.ts';
import { CAR_BODY_NAMES } from '../shared/names.ts';
import { ACTS, findNode, actMap } from './map.ts';
import { cleanMeta, defaultMeta, type Meta } from './meta.ts';
import { emptyRunStats, validPaint, type RunEnd, type RunState, type Screen } from './state.ts';
import { MAX_STACK, isTrinket, perksOf, type Owned } from './trinkets.ts';
import { isRaceKind } from '../shared/kinds.ts';
import { partOfChoice } from './economy.ts';
import { eventById } from './events.ts';

export const RUN_KEY = 'galna-rallyt:run:v1';
export const META_KEY = 'galna-rallyt:meta:v1';
const PREFS_KEY = 'galna-rallyt:prefs:v1';

const num = (v: unknown, lo: number, hi: number, def: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : def);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function cleanCar(raw: unknown): GarageCar {
  const o = isObj(raw) ? raw : {};
  const body = isCarBody(o.body) ? o.body : 'hatch';
  const st = isObj(o.style) ? o.style : {};
  const paint = typeof st.paint === 'string' && validPaint(st.paint) ? st.paint : defaultStyle().paint;
  const car = newCar(1, body, CAR_BODY_NAMES[body], paint);
  // style fields keep their stored value when it has the right type
  const base = defaultStyle(paint) as unknown as Record<string, unknown>;
  const style = car.style as unknown as Record<string, unknown>;
  for (const k of Object.keys(base)) {
    const v = st[k];
    if (v !== undefined && typeof v === typeof base[k] && (typeof v !== 'object' || (Array.isArray(v) === Array.isArray(base[k]) && v !== null))) style[k] = v;
  }
  car.style.driver = typeof st.driver === 'string' && (CAR_DRIVERS as readonly string[]).includes(st.driver) ? (st.driver as CarDriver) : 'human';
  const parts = isObj(o.parts) ? o.parts : {};
  for (const p of CAR_PARTS) car.parts[p] = num(parts[p], 0, PART_MAX_LEVEL, 0);
  car.damage = num(o.damage, 0, 100, 0);
  return car;
}

function cleanScreen(raw: unknown, act: number, seed: number): Screen | null {
  if (!isObj(raw) || typeof raw.nodeId !== 'string') return null;
  const m = actMap(seed, act);
  if (!findNode(m, raw.nodeId)) return null;
  const nodeId = raw.nodeId;
  const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => isTrinket(x) || (typeof x === 'string' && partOfChoice(x) !== null)) : []);
  switch (raw.kind) {
    case 'prerace':
      return { kind: 'prerace', nodeId };
    case 'postrace': {
      const s = raw.summary;
      if (!isObj(s)) return null;
      return {
        kind: 'postrace',
        nodeId,
        summary: {
          place: num(s.place, 1, 9, 1),
          n: num(s.n, 1, 9, 4),
          finished: s.finished === true,
          time: num(s.time, 0, 99999999, 0),
          heartLost: s.heartLost === true,
          prize: num(s.prize, 0, 99999, 0),
          coins: num(s.coins, 0, 99999, 0),
          bonus: num(s.bonus, 0, 99999, 0),
          total: num(s.total, 0, 99999, 0),
          goal: isObj(s.goal) && typeof s.goal.text === 'string' ? { text: s.goal.text.slice(0, 80), met: s.goal.met === true } : undefined,
          medal: s.medal === 'gold' || s.medal === 'silver' || s.medal === 'bronze' ? s.medal : null,
          reward: s.reward === true,
          rewardKind: s.rewardKind === 'win' || s.rewardKind === 'second' || s.rewardKind === 'elite' || s.rewardKind === 'boss' ? s.rewardKind : s.reward === true ? 'win' : undefined,
          kind: isRaceKind(s.kind) ? s.kind : undefined,
          roadPlace: typeof s.roadPlace === 'number' ? num(s.roadPlace, 1, 9, 1) : undefined,
          points: typeof s.points === 'number' ? num(s.points, 0, 999, 0) : undefined,
          takedowns: typeof s.takedowns === 'number' ? num(s.takedowns, 0, 99, 0) : undefined,
          wrecked: typeof s.wrecked === 'number' ? num(s.wrecked, 0, 99, 0) : undefined,
        },
      };
    }
    case 'reward': {
      const choices = ids(raw.choices);
      if (!choices.length) return null;
      const source = raw.source === 'race' || raw.source === 'elite' || raw.source === 'boss' || raw.source === 'event' || raw.source === 'consolation' ? raw.source : 'race';
      return { kind: 'reward', nodeId, choices, source };
    }
    case 'shop': {
      const stock = Array.isArray(raw.stock) ? raw.stock.filter((x): x is Record<string, unknown> => isObj(x) && isTrinket(x.id)).map((x) => ({ id: x.id as string, sold: x.sold === true })) : [];
      if (!stock.length) return null;
      return { kind: 'shop', nodeId, stock, rerolls: num(raw.rerolls, 0, 99, 0), healed: raw.healed === true, repaired: raw.repaired === true };
    }
    case 'workshop':
      return { kind: 'workshop', nodeId, used: raw.used === true, note: typeof raw.note === 'string' ? raw.note.slice(0, 20) : '' };
    case 'event': {
      if (typeof raw.eventId !== 'string' || !eventById(raw.eventId)) return null;
      const o = raw.outcome;
      const outcome = isObj(o) && typeof o.text === 'string' && Array.isArray(o.lines) ? { text: o.text.slice(0, 300), lines: o.lines.filter((l): l is string => typeof l === 'string').slice(0, 8) } : null;
      return { kind: 'event', nodeId, eventId: raw.eventId, outcome };
    }
    default:
      return null;
  }
}

function cleanEndScreen(raw: unknown, act: number, seed: number): Screen | null {
  const s = cleanScreen(raw, act, seed);
  return s?.kind === 'postrace' ? s : null;
}

function cleanEnd(raw: unknown): RunEnd | undefined {
  if (!isObj(raw)) return undefined;
  const bodies = Array.isArray(raw.unlockedBodies) ? raw.unlockedBodies.filter(isCarBody) : [];
  return {
    won: raw.won === true,
    trophies: num(raw.trophies, 0, 999, 0),
    total: num(raw.total, 0, 9999, 0),
    unlockedBodies: bodies,
    unlockedTrinkets: Array.isArray(raw.unlockedTrinkets) ? raw.unlockedTrinkets.filter(isTrinket) : [],
  };
}

/** A stored run (or junk) becomes a valid RunState, or null when there is nothing worth continuing. */
export function parseRun(raw: unknown): RunState | null {
  if (!isObj(raw)) return null;
  // no version: an old or hand-made save; newer than we know: leave it alone
  if (raw.v !== undefined && raw.v !== 1) return null;
  if (typeof raw.seed !== 'number' || !Number.isFinite(raw.seed)) return null;
  const seed = Math.floor(raw.seed) >>> 0;
  const calm = raw.calm === true;
  const act = num(raw.act, 0, ACTS - 1, 0);
  const trinkets: Owned[] = [];
  if (Array.isArray(raw.trinkets)) {
    for (const t of raw.trinkets) {
      if (isObj(t) && isTrinket(t.id) && !trinkets.some((x) => x.id === t.id)) trinkets.push({ id: t.id, n: num(t.n, 1, MAX_STACK, 1) });
    }
  }
  const maxHearts = (calm ? 5 : 3) + perksOf(trinkets).maxHearts;
  const status = raw.status === 'won' || raw.status === 'dead' ? raw.status : 'running';
  const hearts = num(raw.hearts, status === 'dead' ? 0 : 1, maxHearts, maxHearts);
  const m = actMap(seed, act);
  const at = typeof raw.at === 'string' && findNode(m, raw.at) ? raw.at : null;
  const rs = isObj(raw.stats) ? raw.stats : {};
  const stats = emptyRunStats();
  for (const k of Object.keys(stats) as (keyof typeof stats)[]) stats[k] = typeof rs[k] === 'number' && Number.isFinite(rs[k]) ? Math.max(0, rs[k] as number) : 0;
  return {
    v: 1,
    seed,
    calm,
    pool: num(raw.pool, 0, 9999, 0),
    act,
    at,
    path: Array.isArray(raw.path) ? raw.path.filter((x): x is string => typeof x === 'string' && !!findNode(m, x)).slice(0, 12) : [],
    hearts,
    maxHearts,
    kronor: num(raw.kronor, 0, 9_999_999, 0),
    trinkets,
    car: cleanCar(raw.car),
    // a finished run keeps the card that told how the last race went, so a reload still shows it
    screen: status === 'running' ? cleanScreen(raw.screen, act, seed) : cleanEndScreen(raw.screen, act, seed),
    stats,
    status,
    nodesDone: num(raw.nodesDone, 0, 999, 0),
    end: status === 'running' ? undefined : cleanEnd(raw.end),
  };
}

// ---- localStorage, never throwing ----

function read(key: string): unknown {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private mode or full: the run goes on, it just cannot be continued after a reload
  }
}

export const loadRun = (): RunState | null => parseRun(read(RUN_KEY));
export const saveRun = (r: RunState): void => write(RUN_KEY, r);
export function clearRun(): void {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    // nothing to clear
  }
}

export function loadMeta(): Meta {
  const raw = read(META_KEY);
  if (raw) return cleanMeta(raw);
  // first time with progress: carry over the car the quick race remembered
  const m = defaultMeta();
  const prefs = read(PREFS_KEY);
  if (isObj(prefs)) return cleanMeta({ ...m, body: prefs.body, paint: prefs.paint });
  return m;
}
export const saveMeta = (m: Meta): void => write(META_KEY, m);
