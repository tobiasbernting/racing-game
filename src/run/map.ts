// The branching map of one act, Slay-the-Spire style: rows of nodes left to right, each node leading to one or
// two nodes in the next row, ending in a boss. Built from the run seed and the act number, so it is the same
// every time it is asked for and never has to be saved.
import { RALLY_COURSES, type RallyCourse } from '../shared/rally.ts';
import { KIND_MIX, RACE_KINDS, type RaceKind } from '../shared/kinds.ts';
import { ARENA_IDS, DERBY_BOSS_CHANCE, DERBY_EMOJI, type ArenaId } from '../shared/derby.ts';
import { Rng, hashSeed } from './rng.ts';

export const NODE_TYPES = ['race', 'challenge', 'elite', 'shop', 'workshop', 'event', 'boss'] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const NODE_EMOJI: Record<NodeType, string> = { race: '🏁', challenge: '⏱️', elite: '💀', shop: '🛒', workshop: '🔧', event: '❓', boss: '👑' };
export const NODE_NAMES: Record<NodeType, string> = { race: 'Lopp', challenge: 'Utmaning', elite: 'Dödslopp', shop: 'Mackens kiosk', workshop: 'Skruvhörnan', event: 'Helt random', boss: 'Bossen' };

export const ACTS = 3;
/** Rows before the boss row. */
export const ROWS = 5;

export const CHALLENGES = ['win', 'toptwo', 'night', 'time'] as const;
export type ChallengeKind = (typeof CHALLENGES)[number];
export const BOSSES = ['bengt', 'ingrid', 'isdrottningen', 'kanin'] as const;
export type BossId = (typeof BOSSES)[number];

/**
 * The courses each act picks from, one pick per entry (a course twice comes up twice as often): act 1 is the
 * countryside, act 2 the wild (the desert and the volcano) among the old mountains and beaches, act 3 the crazy
 * (candy land, the moon, the kitchen) with the city and the ice for company.
 */
export const ACT_COURSES: readonly (readonly RallyCourse[])[] = [
  ['farm', 'meadow', 'forest'],
  ['desert', 'desert', 'volcano', 'volcano', 'beach', 'ice', 'mountain'],
  ['candy', 'candy', 'moon', 'moon', 'kitchen', 'kitchen', 'city', 'mountain'],
];

/** Every course any act can pick (for tests and the collection). */
export const ALL_ACT_COURSES: readonly RallyCourse[] = [...new Set(ACT_COURSES.flat())];
void RALLY_COURSES;

export interface MapNode {
  id: string;
  act: number;
  row: number;
  col: number;
  /** How many nodes the row has. */
  of: number;
  type: NodeType;
  /** Ids of the nodes in the next row this one leads to. */
  next: string[];
  /** This node's own seed (stock, rewards, event outcomes). */
  seed: number;
  /** Races, challenges, elites and bosses: where. */
  course?: RallyCourse;
  challenge?: ChallengeKind;
  boss?: BossId;
  /** Races, challenges, elites and bosses: Rally, Blandat or Blodbad. */
  kind?: RaceKind;
  /** A Rivningsderby (an arena, last car running wins): some elites and the odd last boss. Its kind is always Blodbad. */
  derby?: ArenaId;
}

/** The icon of a node on the map: the stadium for a derby, otherwise the node type's own. */
export const nodeEmoji = (n: Pick<MapNode, 'type' | 'derby'>): string => (n.derby ? DERBY_EMOJI : NODE_EMOJI[n.type]);

export interface ActMap {
  act: number;
  /** rows[ROWS] is the boss row. */
  rows: MapNode[][];
}

export const nodeId = (act: number, row: number, col: number): string => `a${act}r${row}c${col}`;

/** Weights of the node types by row (rows 0..ROWS-1). */
const WEIGHTS: Record<number, Partial<Record<NodeType, number>>> = {
  0: { race: 80, challenge: 20 },
  1: { race: 45, event: 25, challenge: 20, shop: 10 },
  2: { race: 30, event: 20, challenge: 15, elite: 15, shop: 10, workshop: 10 },
  3: { race: 22, event: 15, challenge: 10, elite: 22, shop: 10, workshop: 21 },
  4: { shop: 35, workshop: 35, event: 15, race: 15 },
};
/** Types that may not follow themselves along a path. */
const NO_REPEAT: ReadonlySet<NodeType> = new Set(['elite', 'shop', 'workshop', 'event']);

/** The kind of race each boss's temper asks for: Bengt on his tractor is Blodbad, Frida is clean racing. */
export const BOSS_KIND: Record<BossId, RaceKind> = { bengt: 'carnage', ingrid: 'carnage', isdrottningen: 'rally', kanin: 'carnage' };

export const BOSS_COURSE: Record<BossId, RallyCourse> = { bengt: 'farm', ingrid: 'mountain', isdrottningen: 'ice', kanin: 'moon' };

/** The boss of an act: Bengt on the farm, then Ingrid or the Ice Queen (the seed picks), and Captain Rabbit on the moon. */
export function bossFor(seed: number, act: number): BossId {
  if (act <= 0) return 'bengt';
  if (act === 1) return Rng.for(seed, 'boss', act).chance(0.5) ? 'ingrid' : 'isdrottningen';
  return 'kanin';
}

export function generateAct(seed: number, act: number): ActMap {
  const rg = Rng.for(seed, 'map', act);
  const rows: MapNode[][] = [];
  const mk = (row: number, col: number, of: number): MapNode => ({ id: nodeId(act, row, col), act, row, col, of, type: 'race', next: [], seed: hashSeed(seed, nodeId(act, row, col)) });

  // 2-4 nodes a row, a row never more than one wider or narrower than the one before (so no node has 3 roads)
  let prev = 0;
  for (let r = 0; r < ROWS; r++) {
    const n = r === 0 ? rg.int(3, 4) : rg.weighted([2, 3, 4].filter((k) => Math.abs(k - prev) <= 1), (k) => (k === 3 ? 5 : k === 4 ? 3 : 2));
    rows.push(Array.from({ length: n }, (_, c) => mk(r, c, n)));
    prev = n;
  }
  rows.push([mk(ROWS, 0, 1)]);

  // links: each node to the nearest node of the next row (and sometimes its neighbour); nobody is left without a way in
  for (let r = 0; r < ROWS; r++) {
    const a = rows[r]!;
    const b = rows[r + 1]!;
    const link = (i: number, j: number): void => {
      const id = b[j]!.id;
      if (!a[i]!.next.includes(id)) a[i]!.next.push(id);
    };
    // a staircase from the first node of each row to the last: nothing crosses, nobody is left out
    let i = 0;
    let j = 0;
    link(0, 0);
    while (i < a.length - 1 || j < b.length - 1) {
      const ni = i < a.length - 1 ? (i + 1) / (a.length - 1) : Infinity;
      const nj = j < b.length - 1 ? (j + 1) / (b.length - 1) : Infinity;
      if (ni <= nj) i++;
      if (nj <= ni) j++;
      link(i, j);
    }
    // and now and then a second road
    if (r < ROWS - 1)
      for (let k = 0; k < a.length; k++) {
        if (a[k]!.next.length >= 2 || !rg.chance(0.35)) continue;
        const first = b.findIndex((n) => n.id === a[k]!.next[0]);
        const alt = first + (rg.chance(0.5) ? 1 : -1);
        if (alt >= 0 && alt < b.length) link(k, alt);
      }
  }

  // types, row by row, so a node can avoid repeating its parents' special type
  const parentsOf = (node: MapNode): MapNode[] => (node.row === 0 ? [] : rows[node.row - 1]!.filter((p) => p.next.includes(node.id)));
  for (let r = 0; r < ROWS; r++) {
    for (const node of rows[r]!) {
      let type: NodeType = 'race';
      for (let tries = 0; tries < 8; tries++) {
        const w = WEIGHTS[r]!;
        type = rg.weighted(Object.keys(w) as NodeType[], (t) => w[t] ?? 0);
        if (!NO_REPEAT.has(type) || !parentsOf(node).some((p) => p.type === type)) break;
        type = 'race';
      }
      node.type = type;
    }
  }
  rows[ROWS]![0]!.type = 'boss';

  // every act has something of everything: a kiosk, a workshop, an elite and an event on the way
  const wants: [NodeType, number[]][] = [['elite', [2, 3]], ['workshop', [3, 4, 2]], ['shop', [4, 3, 2]], ['event', [1, 2, 3]]];
  for (const [type, atRows] of wants) {
    if (rows.some((row) => row.some((n) => n.type === type))) continue;
    for (const r of rg.shuffle(atRows)) {
      const spare = rg.shuffle(rows[r]!.filter((n) => n.type === 'race' || n.type === 'challenge'));
      const node = spare[0];
      if (node) {
        node.type = type;
        break;
      }
    }
  }

  // where each race is run, and what the challenges ask
  const courses = ACT_COURSES[Math.min(act, ACT_COURSES.length - 1)]!;
  let bag: RallyCourse[] = [];
  let last: RallyCourse | null = null;
  const nextCourse = (): RallyCourse => {
    if (bag.length === 0) bag = rg.shuffle([...courses]);
    let c = bag.shift()!;
    if (c === last && bag.length) {
      const swap = bag.shift()!;
      bag.push(c);
      c = swap;
    }
    last = c;
    return c;
  };
  for (const row of rows) {
    for (const node of row) {
      if (node.type === 'race' || node.type === 'elite' || node.type === 'challenge') node.course = nextCourse();
      if (node.type === 'challenge') node.challenge = rg.weighted(CHALLENGES, (k) => (k === 'time' ? 1.2 : 1));
      if (node.type === 'boss') {
        node.boss = bossFor(seed, act);
        node.course = BOSS_COURSE[node.boss];
      }
    }
  }
  assignKinds(seed, act, rows);
  assignDerbys(seed, act, rows);
  return { act, rows };
}

/**
 * Gives every race, challenge, elite and boss a kind from its own seeded generator (so the rest of the map is
 * untouched). The mix leans on Rally early and on Blodbad late; elites like Blodbad; a time trial is always clean;
 * and every act offers at least one of each kind among its ordinary races when it has room for it.
 */
function assignKinds(seed: number, act: number, rows: MapNode[][]): void {
  const rg = Rng.for(seed, 'kinds', act);
  const mix = KIND_MIX[Math.min(act, KIND_MIX.length - 1)]!;
  const racey = rows.flat().filter((n) => n.type === 'race' || n.type === 'challenge' || n.type === 'elite');
  for (const n of racey) {
    if (n.type === 'challenge' && n.challenge === 'time') {
      n.kind = 'rally';
      continue;
    }
    const w = n.type === 'elite' ? [mix[0] * 0.5, mix[1] * 0.8, mix[2] * 1.8] : mix;
    n.kind = rg.weighted(RACE_KINDS, (k) => w[RACE_KINDS.indexOf(k)]!);
  }
  const free = (): MapNode[] => racey.filter((n) => n.type === 'race');
  for (const k of RACE_KINDS) {
    if (racey.some((n) => n.kind === k)) continue;
    // take a node from the kind there is most of
    const counts = RACE_KINDS.map((x) => racey.filter((n) => n.kind === x && n.type === 'race').length);
    const most = RACE_KINDS[counts.indexOf(Math.max(...counts))]!;
    const cand = free().filter((n) => n.kind === most);
    if (cand.length > 1) rg.pick(cand).kind = k;
  }
  const boss = rows[ROWS]![0]!;
  if (boss.boss) boss.kind = BOSS_KIND[boss.boss];
}

/**
 * Some elites and bosses are a Rivningsderby: an enclosed arena where the last car running wins. About one elite an act
 * (the seed picks which; with no elite on the map there is none), and the last boss now and then. Own seeded generator,
 * so the rest of the map is untouched; a derby is always Blodbad (health, wrecks, takedowns).
 */
function assignDerbys(seed: number, act: number, rows: MapNode[][]): void {
  const rg = Rng.for(seed, 'derby', act);
  const elites = rows.flat().filter((n) => n.type === 'elite');
  const arenas = rg.shuffle([...ARENA_IDS]);
  const mark = (n: MapNode, id: ArenaId): void => {
    n.derby = id;
    n.kind = 'carnage';
  };
  if (elites.length) mark(rg.pick(elites), arenas[act % arenas.length]!);
  const boss = rows[ROWS]![0]!;
  if (boss.boss === 'kanin' && rg.chance(DERBY_BOSS_CHANCE)) mark(boss, arenas[(act + 1) % arenas.length]!);
}

/** Every node of an act, flat. */
export const allNodes = (m: ActMap): MapNode[] => m.rows.flat();

export function findNode(m: ActMap, id: string): MapNode | undefined {
  for (const row of m.rows) for (const n of row) if (n.id === id) return n;
  return undefined;
}

/** Ids reachable from the row-0 nodes (all of them, for a sound map). */
export function reachableFromStart(m: ActMap): Set<string> {
  const seen = new Set<string>();
  const stack = m.rows[0]!.map((n) => n.id);
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const n = findNode(m, id);
    if (n) stack.push(...n.next);
  }
  return seen;
}

const cache = new Map<string, ActMap>();
/** generateAct, remembered (the map is asked for on every screen). */
export function actMap(seed: number, act: number): ActMap {
  const key = `${seed}:${act}`;
  let m = cache.get(key);
  if (!m) {
    m = generateAct(seed, act);
    cache.set(key, m);
    if (cache.size > 12) cache.delete(cache.keys().next().value!);
  }
  return m;
}
