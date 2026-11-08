// Spending and picking: the shop's stock and prices, repairs, the workshop, and the three trinkets offered
// after an elite or a boss. Every random choice comes from the run seed and the node, never from the clock.
import { CAR_PARTS, type CarPart } from '../shared/rally.ts';
import { kitOf, type Lean } from '../shared/abilities.ts';
import { Rng } from './rng.ts';
import { addKronor, addTrinket, addUp, healHeart, type RunState, type Screen, type ShopItem } from './state.ts';
import { RARITIES, TRINKETS, TRINKET_PRICE, stackCap, trinketById, type Rarity } from './trinkets.ts';
import { NODE_RISE, available, basePrice, canTake, lineById, runPerks, treeCount, upgradeById, type TreeId, type UpgradeDef } from './upgrades.ts';
import { KIND_PATH, type RaceKind } from '../shared/kinds.ts';
import { DIFFS } from './difficulty.ts';

type ShopScreen = Extract<Screen, { kind: 'shop' }>;

/** How likely each rarity is, by where the trinket comes from (act 0..2 shifts a little towards rare). */
const ODDS: Record<'shop' | 'race' | 'elite' | 'boss' | 'event' | 'consolation', Record<Rarity, number>> = {
  consolation: { common: 100, rare: 0, legendary: 0 },
  shop: { common: 62, rare: 31, legendary: 7 },
  race: { common: 70, rare: 27, legendary: 3 },
  elite: { common: 40, rare: 45, legendary: 15 },
  boss: { common: 15, rare: 55, legendary: 30 },
  event: { common: 55, rare: 35, legendary: 10 },
};

/** Up to `n` different talismans from the whole pool (everything is open from the start), by rarity odds. Nothing but the seed and the run decides it. */
export function drawTrinkets(run: RunState, rg: Rng, n: number, source: keyof typeof ODDS, lean?: 'ram' | 'race' | null): string[] {
  // a trinket already at its highest stack adds nothing, so it is not offered again
  const noHearts = !DIFFS[run.diff].heartPerks;
  const pool = TRINKETS.filter((t) => (run.trinkets.find((o) => o.id === t.id)?.n ?? 0) < stackCap(t) && !(noHearts && t.perk?.maxHearts));
  const out: string[] = [];
  const odds = ODDS[source];
  const actBoost = 1 + run.act * 0.25;
  for (let i = 0; i < n && out.length < pool.length; i++) {
    const rarity = rg.weighted(RARITIES, (r) => odds[r] * (r === 'common' ? 1 : actBoost));
    let cands = pool.filter((t) => t.rarity === rarity && !out.includes(t.id));
    if (cands.length === 0) cands = pool.filter((t) => !out.includes(t.id));
    if (cands.length === 0) break;
    // after Blodbad the ram things come up more, after Rally the speed things
    out.push(lean ? rg.weighted(cands, (t) => (t.path === lean ? 2.4 : 1)).id : rg.pick(cands).id);
  }
  return out;
}

/** The trinkets offered after a race: three (more with perks), or two plain ones as a consolation. The upgrade cards come with `upgradeChoices`. */
export function rewardChoices(run: RunState, nodeId: string, source: 'race' | 'elite' | 'boss' | 'event' | 'consolation', kind?: RaceKind): string[] {
  const rg = Rng.for(run.seed, nodeId, 'reward', source);
  const lean = kind ? KIND_PATH[kind] : null;
  if (source === 'consolation') return drawTrinkets(run, rg, 2, 'consolation', lean);
  return drawTrinkets(run, rg, 3 + runPerks(run.trinkets, run.up).choices, source, lean);
}

/** An offered id from the old part upgrades (only old saves have them). */
export const partOfChoice = (id: string): CarPart | null => (id.startsWith('part:') && (CAR_PARTS as readonly string[]).includes(id.slice(5)) ? (id.slice(5) as CarPart) : null);

// ---- the upgrade cards ----

/** How much each tree is wanted after a kind of race: Blodbad leans on Ram and Fuffens, Rally on Race and Stunt, Blandat is open. */
export const KIND_TREE_BIAS: Record<RaceKind, Record<TreeId, number>> = {
  carnage: { ram: 2.6, fuffens: 1.9, girig: 1, stunt: 0.7, race: 0.65 },
  rally: { race: 2.6, stunt: 1.9, girig: 1, ram: 0.65, fuffens: 0.7 },
  mixed: { ram: 1, race: 1, fuffens: 1, stunt: 1, girig: 1 },
};
const LEAN_TREE_BIAS: Record<Lean, Partial<Record<TreeId, number>>> = {
  ram: { ram: 1.3, fuffens: 1.1 },
  race: { race: 1.3, stunt: 1.1 },
  mixed: {},
};

/** The weight of an open node in an offer (exported for the tests). */
export function nodeWeight(run: RunState, u: UpgradeDef, source: keyof typeof ODDS, kind?: RaceKind): number {
  const line = lineById(u.line)!;
  let tree = 1.4;
  let deepen = 1;
  if (u.tree !== 'car') {
    tree = (kind ? KIND_TREE_BIAS[kind][u.tree] : 1) * (LEAN_TREE_BIAS[kitOf(run.car.body).lean][u.tree] ?? 1);
    // a tree you already walk comes up more often, so a build grows a shape
    deepen = 1 + 0.3 * Math.min(treeCount(run.up, u.tree), 5);
  }
  const tierK = source === 'boss' ? (u.cap ? 2.2 : 1 + 0.25 * (u.tier - 1)) : source === 'elite' ? 1 + 0.15 * (u.tier - 1) : 1;
  return line.weight * tree * deepen * tierK;
}

/** Up to `n` different open upgrades, by weight, from at least two trees when there are any to choose from. */
export function drawUpgrades(run: RunState, rg: Rng, n: number, source: keyof typeof ODDS, kind?: RaceKind): string[] {
  const w = (u: UpgradeDef): number => nodeWeight(run, u, source, kind);
  let pool = available(run.up, run.car.body);
  const out: UpgradeDef[] = [];
  while (out.length < n && pool.length) {
    const pick = rg.weighted(pool, w);
    out.push(pick);
    pool = pool.filter((p) => p !== pick);
  }
  if (out.length >= 3 && out.every((o) => o.tree === out[0]!.tree)) {
    const other = pool.filter((p) => p.tree !== out[0]!.tree);
    if (other.length) out[out.length - 1] = rg.weighted(other, w);
  }
  return out.map((o) => o.id);
}

/** The upgrade cards after a win, an elite or a boss: three (more with perks), none for the consolation prize. */
export function upgradeChoices(run: RunState, nodeId: string, source: 'race' | 'elite' | 'boss' | 'event' | 'consolation', kind?: RaceKind): string[] {
  if (source === 'consolation') return [];
  const rg = Rng.for(run.seed, nodeId, 'ups', source);
  return drawUpgrades(run, rg, 3 + runPerks(run.trinkets, run.up).choices, source, kind);
}

/** What a node costs in the workshop now: the base price, the act's markup, 7 % for every node already in the build, and the discounts. */
export function upgradePrice(run: RunState, id: string): number {
  return round5(basePrice(id) * (1 + run.act * 0.15) * (1 + NODE_RISE * run.up.length) * (1 - runPerks(run.trinkets, run.up).shopDiscount));
}

// ---- the shop ----

const round5 = (n: number): number => Math.max(5, Math.round(n / 5) * 5);

/** Price of a trinket after the act's markup and the discount from trinkets. */
export function trinketPrice(run: RunState, id: string): number {
  const def = trinketById(id);
  if (!def) return 999;
  return round5(TRINKET_PRICE[def.rarity] * (1 + run.act * 0.15) * (1 - runPerks(run.trinkets, run.up).shopDiscount));
}

/** A heart costs about one decent race's pay; on the very last heart the kiosk takes a quarter off. */
export const healPrice = (run: RunState): number => round5(85 * DIFFS[run.diff].healMul * (1 + run.act * 0.15) * (1 - runPerks(run.trinkets, run.up).shopDiscount) * (run.hearts <= 1 ? 0.75 : 1));
export const repairPrice = (run: RunState): number => (run.car.damage <= 0 ? 0 : Math.max(5, round5(run.car.damage * 0.7 * (1 - runPerks(run.trinkets, run.up).shopDiscount))));
export const rerollPrice = (screen: ShopScreen): number => 20 + 15 * screen.rerolls;

export function makeStock(run: RunState, nodeId: string, reroll: number): ShopItem[] {
  const rg = Rng.for(run.seed, nodeId, 'stock', reroll);
  // the kiosk stays small: three or four talismans
  const n = rg.weighted([3, 4], (k) => (k === 3 ? 3 : 2));
  return drawTrinkets(run, rg, n, 'shop').map((id) => ({ id, sold: false }));
}

const shopOf = (run: RunState): ShopScreen | null => (run.screen?.kind === 'shop' ? run.screen : null);

export type BuyResult = 'ok' | 'poor' | 'nothing' | 'sold';

export function buyTrinket(run: RunState, index: number): BuyResult {
  const sh = shopOf(run);
  const item = sh?.stock[index];
  if (!sh || !item) return 'nothing';
  if (item.sold) return 'sold';
  const price = trinketPrice(run, item.id);
  if (run.kronor < price) return 'poor';
  addKronor(run, -price);
  item.sold = true;
  addTrinket(run, item.id, { from: 'Köpt i kiosken', node: sh.nodeId });
  return 'ok';
}

export function buyHeart(run: RunState): BuyResult {
  const sh = shopOf(run);
  if (!sh || sh.healed || !DIFFS[run.diff].shopHearts || run.hearts >= run.maxHearts) return 'nothing';
  const price = healPrice(run);
  if (run.kronor < price) return 'poor';
  addKronor(run, -price);
  healHeart(run);
  sh.healed = true;
  return 'ok';
}

export function buyRepair(run: RunState): BuyResult {
  const sh = shopOf(run);
  if (!sh || sh.repaired || run.car.damage <= 0) return 'nothing';
  const price = repairPrice(run);
  if (run.kronor < price) return 'poor';
  addKronor(run, -price);
  run.car.damage = 0;
  sh.repaired = true;
  return 'ok';
}

export function reroll(run: RunState): BuyResult {
  const sh = shopOf(run);
  if (!sh) return 'nothing';
  const price = rerollPrice(sh);
  if (run.kronor < price) return 'poor';
  addKronor(run, -price);
  sh.rerolls++;
  sh.stock = makeStock(run, sh.nodeId, sh.rerolls);
  return 'ok';
}

// ---- the workshop: two or three nodes for sale, one of them free, and paint any time ----

/** How many nodes Skruvhörnan has on the shelf: two or three, a seeded roll. */
export const WORKSHOP_STOCK = [2, 3] as const;

/**
 * The two or three nodes the workshop sells at this visit, drawn from the nodes open to the build (seeded by the run and the
 * node, so a reload shows the same shelf), from at least two trees, and at least one of them cheap enough to be the free pick.
 */
export function workshopStock(run: RunState, nodeId: string): string[] {
  const rg = Rng.for(run.seed, nodeId, 'workshop');
  const n = rg.weighted([...WORKSHOP_STOCK], (k) => (k === 3 ? 3 : 2));
  const ids = drawUpgrades(run, rg, n, 'shop');
  const cheap = (id: string): boolean => {
    const u = upgradeById(id);
    return !!u && u.tier <= 2 && !u.cap;
  };
  if (ids.length && !ids.some(cheap)) {
    const pool = available(run.up, run.car.body).filter((u) => cheap(u.id) && !ids.includes(u.id));
    if (pool.length) ids[ids.length - 1] = rg.weighted(pool, (u) => nodeWeight(run, u, 'shop')).id;
  }
  return ids;
}

/** The free pick of a workshop visit is a shelf node of tier 1 or 2 (not a capstone), once per visit. */
export function workshopFree(run: RunState, id: string): boolean {
  const u = upgradeById(id);
  return run.screen?.kind === 'workshop' && !run.screen.used && run.screen.stock.includes(id) && !!u && u.tier <= 2 && !u.cap;
}

/** Takes a node from the shelf: the free pick once per visit, otherwise for its price. */
export function workshopBuy(run: RunState, id: string): BuyResult {
  const w = run.screen;
  if (w?.kind !== 'workshop' || !w.stock.includes(id) || !canTake(run.up, id, run.car.body)) return 'nothing';
  const free = workshopFree(run, id);
  const price = free ? 0 : upgradePrice(run, id);
  if (run.kronor < price) return 'poor';
  if (price > 0) addKronor(run, -price);
  addUp(run, id, { from: free ? 'Skruvhörnan (gratis)' : 'Köpt i Skruvhörnan', node: w.nodeId });
  if (free) {
    w.used = true;
    w.note = id;
  }
  return 'ok';
}

export function workshopRepair(run: RunState): boolean {
  const w = run.screen;
  if (w?.kind !== 'workshop' || w.used) return false;
  run.car.damage = 0;
  w.used = true;
  w.note = 'repair';
  return true;
}

export function workshopPaint(run: RunState, paint: string): void {
  if (run.screen?.kind !== 'workshop') return;
  run.car.style.paint = paint;
}
