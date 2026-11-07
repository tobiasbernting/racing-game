// Spending and picking: the shop's stock and prices, repairs, the workshop, and the three trinkets offered
// after an elite or a boss. Every random choice comes from the run seed and the node, never from the clock.
import { CAR_PARTS, PART_MAX_LEVEL, type CarPart } from '../shared/rally.ts';
import { Rng } from './rng.ts';
import { addKronor, addTrinket, healHeart, noteGot, type RunState, type Screen, type ShopItem } from './state.ts';
import { RARITIES, TRINKET_PRICE, perksOf, stackCap, trinketById, type Rarity } from './trinkets.ts';
import { KIND_PATH, type RaceKind } from '../shared/kinds.ts';
import { unlockedTrinkets } from './meta.ts';

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

/** Up to `n` different trinkets from the unlocked pool, by rarity odds. */
export function drawTrinkets(run: RunState, rg: Rng, n: number, source: keyof typeof ODDS, lean?: 'ram' | 'race' | null): string[] {
  // a trinket already at its highest stack adds nothing, so it is not offered again
  const pool = unlockedTrinkets(run.pool).filter((t) => (run.trinkets.find((o) => o.id === t.id)?.n ?? 0) < stackCap(t));
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

/** The reward for a race: three trinkets (a part upgrade may take one slot after a win), or two plain ones as a consolation. */
export function rewardChoices(run: RunState, nodeId: string, source: 'race' | 'elite' | 'boss' | 'event' | 'consolation', kind?: RaceKind): string[] {
  const rg = Rng.for(run.seed, nodeId, 'reward', source);
  const lean = kind ? KIND_PATH[kind] : null;
  if (source === 'consolation') return drawTrinkets(run, rg, 2, 'consolation', lean);
  const out = drawTrinkets(run, rg, 3 + perksOf(run.trinkets).choices, source, lean);
  // one of the options can be a part upgrade (Rally leans on the speed parts, Blodbad on armour)
  if (source !== 'event' && kind && out.length >= 3) {
    const open = CAR_PARTS.filter((p) => canUpgrade(run, p));
    if (open.length && rg.chance(0.55)) {
      const want = kind === 'carnage' ? ['armour', 'engine'] : kind === 'rally' ? ['tyres', 'engine', 'turbo', 'brakes'] : ['engine', 'tyres', 'armour'];
      const pref = open.filter((p) => want.includes(p));
      out[out.length - 1] = `part:${rg.pick(pref.length ? pref : open)}`;
    }
  }
  return out;
}

/** An offered id that is a part upgrade, or null. */
export const partOfChoice = (id: string): CarPart | null => (id.startsWith('part:') && (CAR_PARTS as readonly string[]).includes(id.slice(5)) ? (id.slice(5) as CarPart) : null);

// ---- the shop ----

const round5 = (n: number): number => Math.max(5, Math.round(n / 5) * 5);

/** Price of a trinket after the act's markup and the discount from trinkets. */
export function trinketPrice(run: RunState, id: string): number {
  const def = trinketById(id);
  if (!def) return 999;
  return round5(TRINKET_PRICE[def.rarity] * (1 + run.act * 0.15) * (1 - perksOf(run.trinkets).shopDiscount));
}

/** A heart costs about one decent race's pay; on the very last heart the kiosk takes a quarter off. */
export const healPrice = (run: RunState): number => round5(100 * (1 + run.act * 0.15) * (1 - perksOf(run.trinkets).shopDiscount) * (run.hearts <= 1 ? 0.75 : 1));
export const repairPrice = (run: RunState): number => (run.car.damage <= 0 ? 0 : Math.max(5, round5(run.car.damage * 0.7 * (1 - perksOf(run.trinkets).shopDiscount))));
export const rerollPrice = (screen: ShopScreen): number => 20 + 15 * screen.rerolls;

export function makeStock(run: RunState, nodeId: string, reroll: number): ShopItem[] {
  const rg = Rng.for(run.seed, nodeId, 'stock', reroll);
  const n = rg.weighted([3, 4, 5], (k) => (k === 4 ? 4 : 3));
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
  if (!sh || sh.healed || run.hearts >= run.maxHearts) return 'nothing';
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

// ---- the workshop: one free thing, and paint any time ----

export const canUpgrade = (run: RunState, part: CarPart): boolean => (run.car.parts[part] ?? 0) < PART_MAX_LEVEL;
export const upgradeable = (run: RunState): CarPart[] => CAR_PARTS.filter((p) => canUpgrade(run, p));

export function workshopUpgrade(run: RunState, part: CarPart): boolean {
  const w = run.screen;
  if (w?.kind !== 'workshop' || w.used || !canUpgrade(run, part)) return false;
  run.car.parts[part] = (run.car.parts[part] ?? 0) + 1;
  noteGot(run, 'part', part, 'Skruvhörnan', w.nodeId);
  w.used = true;
  w.note = `${part}`;
  return true;
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
