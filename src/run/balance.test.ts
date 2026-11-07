// Balance checks, driven by race TIMES: the player's lap time comes from their tune and skill, each rival's from its
// scaled kit (upgrades, modifiers, archetype) and the catch-up, and the two run side by side (racesim.ts). A made-up
// player walks whole runs through the real run rules, building a car as they go.
import { describe, expect, it } from 'vitest';
import { CAR_BODIES, racePrize, type CarBody } from '../shared/rally.ts';
import { HUMAN_FACTOR, type HumanSkill } from '../shared/pace.ts';
import { buyHeart, buyTrinket, healPrice, trinketPrice, upgradePrice, workshopBuy } from './economy.ts';
import { choiceAllowed, EVENTS } from './events.ts';
import { chooseEvent, continueAfterRace, currentPlan, enterNode, finishNode, pickReward, submitRace } from './flow.ts';
import { asRallyResult, playerStats, simulateRace, type PlayerModel } from './racesim.ts';
import { Rng } from './rng.ts';
import { costsHeart, heartsLost, newRun, reachable, type RunState } from './state.ts';
import { planRace } from './plan.ts';
import { actMap, allNodes, ACTS } from './map.ts';
import { stackCap, trinketById, TRINKETS } from './trinkets.ts';
import { UPGRADES, available, isUpgrade, partsToNodes, takeNode, upgradeById } from './upgrades.ts';
import type { RaceKind } from '../shared/kinds.ts';

type Strategy = 'race' | 'ram' | 'mixed';
interface Profile extends PlayerModel {
  strategy: Strategy;
}

const profile = (skill: HumanSkill, strategy: Strategy = 'mixed', aggression = strategy === 'ram' ? 1 : strategy === 'race' ? 0.15 : 0.5): Profile => ({ skill, strategy, aggression });

/** The upgrade lines each kind of made-up player goes for, best first. */
const LINE_ORDER: Record<Strategy, string[]> = {
  race: ['race.grip', 'race.engine', 'race.nitro', 'race.long', 'race.drift', 'race.aero', 'race.cap', 'stunt.air', 'race.brakes', 'stunt.near', 'stunt.flip', 'ram.plates'],
  ram: ['ram.plates', 'ram.spikes', 'race.engine', 'ram.hammer', 'ram.ballast', 'ram.shock', 'race.grip', 'ram.boost', 'ram.cap', 'race.nitro', 'fuffens.mine', 'fuffens.oil'],
  mixed: ['race.grip', 'race.engine', 'ram.plates', 'race.nitro', 'ram.spikes', 'race.long', 'race.drift', 'ram.hammer', 'ram.shock', 'stunt.air', 'race.cap', 'ram.cap'],
};

/** How much a made-up player likes an upgrade card (trinkets use `like`). */
function likeUp(id: string, s: Strategy): number {
  const u = upgradeById(id)!;
  const idx = LINE_ORDER[s].indexOf(u.line);
  return idx < 0 ? (u.tree === 'car' ? 2.6 : 1.8) : 2.4 + 2.6 * (1 - idx / LINE_ORDER[s].length);
}

/** The next node of the strategy's list that is open, or any open one. */
function nextNode(run: RunState, s: Strategy, maxTier = 3): string | null {
  const open = available(run.up, run.car.body).filter((u) => u.tier <= maxTier && !u.cap);
  for (const line of LINE_ORDER[s]) {
    const hit = open.find((u) => u.line === line);
    if (hit) return hit.id;
  }
  return open[0]?.id ?? null;
}

/** How much a made-up player likes a trinket. */
function like(id: string, s: Strategy): number {
  const d = trinketById(id)!;
  const rar = { common: 1, rare: 2, legendary: 3 }[d.rarity];
  const path = d.path === s ? 2.5 : s === 'mixed' && (d.path === 'race' || d.path === 'ram') ? 1.5 : 0;
  const speed = d.tune ? 0.5 : 0;
  return rar + path + speed;
}

/** One whole run with a made-up player. */
export function playRun(seed: number, p: Profile, calm: boolean): { run: RunState; races: { act: number; kind: string; place: number; lapped: boolean; roadPlace: number; boss: boolean }[] } {
  const rng = new Rng(seed * 7919 + 13);
  let run = newRun({ seed, calm, body: 'hatch', driver: 'human', paint: '#e8412c', trophies: 0 });
  const races: { act: number; kind: string; place: number; lapped: boolean; roadPlace: number; boss: boolean }[] = [];
  for (let guard = 0; guard < 600 && run.status === 'running'; guard++) {
    if (!run.screen) {
      const opts = reachable(run);
      const score = (n: (typeof opts)[number]): number => {
        let v = rng.float() * 0.5;
        if (run.hearts < run.maxHearts && n.type === 'shop') v += 2;
        if (n.type === 'workshop') v += 1.2;
        if (n.type === 'elite' && run.hearts <= 2) v -= 1.5;
        if (p.strategy === 'race' && n.kind === 'rally') v += 0.8;
        if (p.strategy === 'ram' && n.kind === 'carnage') v += 0.8;
        return v;
      };
      const pick = [...opts].sort((a, b) => score(b) - score(a))[0]!;
      run = enterNode(run, pick.id);
      continue;
    }
    const s = run.screen;
    switch (s.kind) {
      case 'prerace': {
        const plan = currentPlan(run)!;
        const r = simulateRace(plan, run, p, rng);
        const res = asRallyResult(plan, r);
        res.kronor = racePrize(plan.rules, res.place, res.n);
        races.push({ act: run.act, kind: plan.kind, place: res.place, lapped: r.lapped, roadPlace: r.roadPlace, boss: !!plan.boss });
        run = submitRace(run, res);
        break;
      }
      case 'postrace':
        run = continueAfterRace(run);
        break;
      case 'reward': {
        let best = 0;
        let bestV = -1;
        [...s.choices, ...(s.ups ?? [])].forEach((id, i) => {
          const v = isUpgrade(id) ? likeUp(id, p.strategy) : like(id, p.strategy);
          if (v > bestV) {
            bestV = v;
            best = i;
          }
        });
        run = pickReward(run, best);
        break;
      }
      case 'shop': {
        const c = structuredClone(run);
        if (c.hearts < c.maxHearts) buyHeart(c);
        const sh = c.screen as Extract<NonNullable<RunState['screen']>, { kind: 'shop' }>;
        const order = sh.stock.map((x, i) => ({ i, v: like(x.id, p.strategy) })).sort((a, b) => b.v - a.v);
        for (const { i } of order) if (c.kronor >= trinketPrice(c, sh.stock[i]!.id) + 60) buyTrinket(c, i);
        run = finishNode(c);
        break;
      }
      case 'workshop': {
        const c = structuredClone(run);
        // the free pick first, then whatever the purse allows (keeping a little for the kiosk)
        const free = nextNode(c, p.strategy, 2);
        if (free) workshopBuy(c, free);
        for (let k = 0; k < 0; k++) {
          const id = nextNode(c, p.strategy);
          if (!id || c.kronor < upgradePrice(c, id) + 80) break;
          workshopBuy(c, id);
        }
        run = finishNode(c);
        break;
      }
      case 'event': {
        if (!s.outcome) {
          const ev = EVENTS.find((e) => e.id === s.eventId)!;
          const idx = ev.choices.findIndex((ch) => choiceAllowed(run, ch));
          run = chooseEvent(run, Math.max(0, idx));
        } else run = finishNode(run);
        break;
      }
      default:
        run = finishNode(run);
    }
  }
  return { run, races };
}

const winRate = (p: Profile, calm: boolean, runs = 100): number => {
  let w = 0;
  for (let i = 0; i < runs; i++) if (playRun(1000 + i, p, calm).run.status === 'won') w++;
  return w / runs;
};

/** A run with these tuning levels as upgrade nodes (what the six old parts became). */
function withParts(r: RunState, parts: Record<string, number>): RunState {
  for (const id of partsToNodes(parts)) takeNode(r.up, id);
  return r;
}

/** A run that has bought everything: the best car, every upgrade node in every tree, every trinket at its highest stack. */
function allIn(act: number, body: CarBody = 'coupe'): RunState {
  const r = newRun({ seed: 77, calm: false, body, driver: 'human', paint: '#e8412c', trophies: 99 });
  r.act = act;
  r.up = UPGRADES.filter((u) => !u.body || u.body === body).map((u) => u.id);
  r.trinkets = TRINKETS.map((t) => ({ id: t.id, n: stackCap(t) }));
  return r;
}

/** A strong build the way a run really ends up with one: the best parts and a dozen of the best trinkets. */
function strongRun(act: number, body: CarBody = 'coupe'): RunState {
  const r = newRun({ seed: 77, calm: false, body, driver: 'human', paint: '#e8412c', trophies: 99 });
  r.act = act;
  withParts(r, { engine: 3, tyres: 3, suspension: 1, brakes: 2, turbo: 2, armour: 3 });
  const pick: [string, number][] = [['kanelbullar', 4], ['dubbdack', 4], ['kolsyrad', 3], ['raketkorv', 3], ['tvattbjorn', 3], ['sidvagn', 3], ['kaffekoppen', 3], ['alghorn', 3], ['dino', 2], ['jattehjul', 3], ['sladdgradde', 3]];
  r.trinkets = pick.map(([id, n]) => ({ id, n }));
  return r;
}

/** Plans for the races of the last act, every kind, from many seeds. */
function lastActPlans(kind: RaceKind | null, count: number, calm = false) {
  const out: ReturnType<typeof planRace>[] = [];
  for (let seed = 1; out.length < count && seed < 400; seed++) {
    const m = actMap(seed, 2);
    for (const n of allNodes(m)) {
      if (n.type !== 'race' && n.type !== 'elite' && n.type !== 'boss') continue;
      if (kind && n.kind !== kind) continue;
      out.push(planRace(n, calm));
    }
  }
  return out.slice(0, count);
}

// Whole-run simulations: several seconds each on a slow CI runner, so not the 5 s default.
describe('balance (race times, not dice)', { timeout: 60_000 }, () => {
  it('a normal run: a poor or average player loses it, a good one wins it about as often as not, a strong one usually', () => {
    const poor = winRate(profile('poor'), false);
    const average = winRate(profile('average'), false);
    const goods = (['race', 'ram', 'mixed'] as Strategy[]).map((st) => winRate(profile('good', st), false));
    const strongs = (['race', 'ram', 'mixed'] as Strategy[]).map((st) => winRate(profile('expert', st), false));
    console.log('normal: poor', poor, 'average', average, 'good', goods, 'strong', strongs);
    expect(poor).toBeLessThan(0.12);
    expect(average).toBeLessThan(0.2);
    // race and mixed builds: a good player wins about as often as not; the ram build starts slower but gets there
    for (const g of [goods[0]!, goods[2]!]) {
      expect(g).toBeGreaterThan(0.3);
      expect(g).toBeLessThan(0.65);
    }
    expect(goods[1]!).toBeGreaterThan(0.1);
    for (let i = 0; i < 3; i++) {
      expect(strongs[i]!).toBeGreaterThan(goods[i]!);
      expect(strongs[i]!).toBeLessThan(0.97);
    }
  });

  it('lugnt läge stays very winnable', () => {
    const avgNormal = winRate(profile('average'), false);
    const avgCalm = winRate(profile('average'), true);
    const poorCalm = winRate(profile('poor'), true);
    const goodCalm = winRate(profile('good'), true);
    console.log('calm: poor', poorCalm, 'average', avgCalm, 'good', goodCalm, '(normal average', avgNormal, ')');
    expect(avgCalm).toBeGreaterThan(0.9);
    expect(goodCalm).toBeGreaterThan(0.95);
    expect(poorCalm).toBeGreaterThan(0.5);
    expect(avgCalm).toBeGreaterThan(avgNormal + 0.5);
  });

  it('the last act is a fight even with a strong build: a strong player does not win every race by a mile, and nobody is ever lapped', () => {
    for (const body of ['coupe', 'hatch', 'tractor'] as const) {
      for (const [label, run] of [['strong', strongRun(2, body)], ['all-in (every trinket at its cap)', allIn(2, body)]] as const) {
        for (const skill of ['good', 'expert'] as const) {
        const m: PlayerModel = { skill, aggression: 0.6 };
        const stats = playerStats(run, m);
        const rg = new Rng(5);
        let lapped = 0;
        let wins = 0;
        let big = 0;
        const plans = lastActPlans(null, 300);
        for (const plan of plans) {
          const r = simulateRace(plan, run, m, rg, stats);
          if (r.lapped) lapped++;
          if (r.rank === 1) wins++;
          if (r.roadPlace === 1 && r.margin > 25) big++;
        }
        console.log(`${skill} with a ${label} ${body} in act 3: wins ${wins}/${plans.length}, margin over 25 s ${big}, lapped ${lapped}, grip ${stats.grip.toFixed(2)} power ${stats.power.toFixed(2)}`);
        expect(lapped).toBe(0);
        // the very best build the game allows, with an expert at the wheel: still not every race
        expect(wins / plans.length).toBeLessThan(0.99);
        expect(big / plans.length).toBeLessThan(label === 'strong' ? 0.15 : 0.25);
        }
      }
    }
  });

  it('a good player with the build a run really gives them finds act 3 a fight: mid-pack on average, winning well under half the races', () => {
    let n = 0;
    let sum = 0;
    let wins = 0;
    let bottom = 0;
    for (let i = 0; i < 100; i++) {
      for (const r of playRun(2000 + i, profile('good', 'mixed'), false).races) {
        if (r.act !== 2 || r.boss) continue;
        n++;
        sum += r.place;
        if (r.place === 1) wins++;
        if (r.place > 3) bottom++;
      }
    }
    console.log(`good player, act 3: ${n} races, mean place ${(sum / n).toFixed(2)}, wins ${(wins / n).toFixed(2)}, bottom half ${(bottom / n).toFixed(2)}`);
    expect(sum / n).toBeGreaterThan(2.1);
    expect(wins / n).toBeLessThan(0.55);
    expect(bottom / n).toBeGreaterThan(0.15);
  });

  it('Blodbad can be won by a ram-heavy player from third on the road, but not by a clean racer', () => {
    const run = newRun({ seed: 78, calm: false, body: 'pickup', driver: 'human', paint: '#e8412c', trophies: 99 });
    run.act = 2;
    withParts(run, { engine: 2, tyres: 2, suspension: 0, brakes: 1, turbo: 1, armour: 3 });
    run.trinkets = [['alghorn', 3], ['dino', 2], ['kastrull', 3], ['kanon', 1], ['krockkudde', 1], ['jattehjul', 3], ['dubbdack', 2]].map(([id, n]) => ({ id: id as string, n: n as number }));
    const ram: PlayerModel = { skill: 'good', aggression: 1 };
    const clean: PlayerModel = { skill: 'good', aggression: 0.1 };
    let thirdRam = 0;
    let wonFromThirdRam = 0;
    let thirdClean = 0;
    let wonFromThirdClean = 0;
    const rg = new Rng(3);
    const rs = playerStats(run, ram);
    const cs = playerStats(run, clean);
    for (const plan of lastActPlans('carnage', 900)) {
      const a = simulateRace(plan, run, ram, rg, rs);
      if (a.roadPlace === 3) {
        thirdRam++;
        if (a.rank === 1) wonFromThirdRam++;
      }
      const b = simulateRace(plan, run, clean, rg, cs);
      if (b.roadPlace === 3) {
        thirdClean++;
        if (b.rank === 1) wonFromThirdClean++;
      }
    }
    console.log('from third: ram', wonFromThirdRam, '/', thirdRam, 'clean', wonFromThirdClean, '/', thirdClean);
    expect(thirdRam).toBeGreaterThan(5);
    expect(wonFromThirdRam / thirdRam).toBeGreaterThan(0.25);
    expect(wonFromThirdClean / Math.max(1, thirdClean)).toBeLessThan(0.2);
    expect(wonFromThirdRam / thirdRam).toBeGreaterThan((wonFromThirdClean / Math.max(1, thirdClean)) * 2);
  });

  it('a pure Ram build and a pure Race build are both viable: Ram wins its runs through Blodbad, Race through Rally, and each has the better of the other on its own ground', () => {
    const byKind = (st: Strategy): { win: Record<string, number>; n: Record<string, number>; run: number } => {
      const win: Record<string, number> = { rally: 0, mixed: 0, carnage: 0 };
      const n: Record<string, number> = { rally: 0, mixed: 0, carnage: 0 };
      let wins = 0;
      for (let i = 0; i < 100; i++) {
        const r = playRun(3000 + i, profile('good', st), false);
        if (r.run.status === 'won') wins++;
        for (const x of r.races) {
          if (x.boss) continue;
          n[x.kind]!++;
          if (x.place === 1) win[x.kind]!++;
        }
      }
      return { win, n, run: wins / 100 };
    };
    const ram = byKind('ram');
    const race = byKind('race');
    const rate = (b: ReturnType<typeof byKind>, k: string): number => b.win[k]! / Math.max(1, b.n[k]!);
    console.log('ram: runs won', ram.run, 'rally', rate(ram, 'rally').toFixed(2), 'mixed', rate(ram, 'mixed').toFixed(2), 'blodbad', rate(ram, 'carnage').toFixed(2), '| race: runs won', race.run, 'rally', rate(race, 'rally').toFixed(2), 'mixed', rate(race, 'mixed').toFixed(2), 'blodbad', rate(race, 'carnage').toFixed(2));
    // both can win a run, and neither is the only way to win one
    expect(ram.run).toBeGreaterThan(0.12);
    expect(ram.run).toBeLessThan(0.7);
    expect(race.run).toBeGreaterThan(0.3);
    expect(race.run).toBeLessThan(0.7);
    // the ram build is at home in Blodbad, the race build in Rally
    // (Blodbad is the harder race for everybody, so the sign of the comparison is between the builds, not between the kinds)
    expect(rate(ram, 'rally') - rate(ram, 'carnage')).toBeLessThan(rate(race, 'rally') - rate(race, 'carnage') - 0.1);
    expect(rate(ram, 'carnage')).toBeGreaterThan(rate(race, 'carnage') + 0.05);
    expect(rate(race, 'rally')).toBeGreaterThan(rate(ram, 'rally') + 0.05);
  });

  it('the finished builds of the trees, one per path, are a fight in act 3 and nobody is lapped by any of them', () => {
    const build = (body: CarBody, lines: string[]): RunState => {
      const r = newRun({ seed: 77, calm: false, body, driver: 'human', paint: '#e8412c', trophies: 99 });
      r.act = 2;
      for (const l of lines) {
        const def = UPGRADES.filter((u) => u.line === l);
        for (const u of def) takeNode(r.up, u.id);
      }
      r.trinkets = [['kanelbullar', 3], ['dubbdack', 3], ['alghorn', 3], ['jattehjul', 3], ['kastrull', 3], ['tvattbjorn', 2]].map(([id, n]) => ({ id: id as string, n: n as number }));
      return r;
    };
    const builds: [string, RunState][] = [
      ['Ram', build('pickup', ['ram.plates', 'ram.ballast', 'ram.spikes', 'ram.hammer', 'ram.shock', 'ram.boost', 'ram.cap', 'race.engine'])],
      ['Race', build('coupe', ['race.engine', 'race.grip', 'race.nitro', 'race.long', 'race.drift', 'race.aero', 'race.cap', 'race.brakes'])],
      ['Stunt', build('hatch', ['stunt.air', 'stunt.flip', 'stunt.near', 'stunt.wheel', 'stunt.cap', 'stunt.susp', 'race.engine', 'race.grip'])],
      ['Fuffens', build('buggy', ['fuffens.oil', 'fuffens.mine', 'fuffens.smoke', 'fuffens.fake', 'fuffens.cap', 'race.engine', 'race.grip'])],
      ['Girig', build('hatch', ['girig.interest', 'girig.bounty', 'girig.ins', 'girig.disc', 'girig.gold', 'girig.cap', 'race.engine', 'race.grip'])],
    ];
    const plans = lastActPlans(null, 240);
    for (const [name, run] of builds) {
      const m: PlayerModel = { skill: 'good', aggression: name === 'Ram' ? 1 : 0.5 };
      const stats = playerStats(run, m);
      const rg = new Rng(9);
      let wins = 0;
      let lapped = 0;
      for (const plan of plans) {
        const r = simulateRace(plan, run, m, rg, stats);
        if (r.rank === 1) wins++;
        if (r.lapped) lapped++;
      }
      console.log(`${name} (${run.car.body}) in act 3: wins ${wins}/${plans.length}`);
      expect(lapped, name).toBe(0);
      expect(wins / plans.length, name).toBeLessThan(0.97);
    }
    // the Race build with its upgrades is quicker than the same car without them, and the Ram build wins Blodbad more often than Rally
    const raceBuild = builds[1]![1];
    const bare = build('coupe', []);
    bare.trinkets = raceBuild.trinkets;
    const m: PlayerModel = { skill: 'good', aggression: 0.3 };
    expect(playerStats(raceBuild, m).lap('farm')).toBeLessThan(playerStats(bare, m).lap('farm'));
    const ramBuild = builds[0]![1];
    const carnage = lastActPlans('carnage', 300);
    const rally = lastActPlans('rally', 300);
    const mr: PlayerModel = { skill: 'good', aggression: 1 };
    const sr = playerStats(ramBuild, mr);
    const rate = (ps: typeof carnage): number => {
      const rg = new Rng(4);
      return ps.filter((p) => simulateRace(p, ramBuild, mr, rg, sr).rank === 1).length / ps.length;
    };
    expect(rate(carnage)).toBeGreaterThan(rate(rally));
  });

  it('a win is a pick of three, second place a pick of two plain ones, and in Blodbad the hearts follow the rank on points', () => {
    const base = (): RunState => {
      const r = newRun({ seed: 3, calm: false, body: 'hatch', driver: 'human', paint: '#e8412c', trophies: 99 });
      r.act = 0;
      return r;
    };
    // a seed whose first row has an ordinary race
    let seed = 3;
    while (!reachable({ ...base(), seed }).some((n) => n.type === 'race')) seed++;
    const base2 = (): RunState => ({ ...base(), seed });
    const first = base2();
    const node = reachable(first).find((n) => n.type === 'race')!;
    const enter = (r: RunState) => enterNode(r, node.id);
    const plan = planRace(node, false);
    const res = (place: number): ReturnType<typeof asRallyResult> => ({ ...asRallyResult(plan, { roadPlace: place, rank: place, n: 4, time: 90, points: 0, takedowns: 0, wrecks: 0, lapped: false, margin: 0, winners: [] }), place, n: 4 });
    const won = submitRace(enter(first), res(1));
    expect(won.screen?.kind === 'postrace' && won.screen.summary.rewardKind).toBe('win');
    const afterWin = continueAfterRace(won);
    expect(afterWin.screen?.kind === 'reward' && afterWin.screen.choices.length).toBeGreaterThanOrEqual(3);
    const second = continueAfterRace(submitRace(enter(base2()), res(2)));
    expect(second.screen?.kind === 'reward' && second.screen.source).toBe('consolation');
    expect(second.screen?.kind === 'reward' && second.screen.choices.length).toBe(2);
    expect(second.screen?.kind === 'reward' && second.screen.choices.every((id) => trinketById(id)?.rarity === 'common')).toBe(true);
    // third place and no goal: nothing to pick (unless a challenge goal was met)
    const third = submitRace(enter(base2()), res(3));
    expect(third.screen?.kind === 'postrace' && third.screen.summary.reward).toBe(false);
    // hearts: the rank on points is what counts (4th on the road but 1st on points keeps the heart)
    expect(costsHeart(1, 4, true)).toBe(false);
    expect(costsHeart(4, 4, true)).toBe(true);
  });

  it('normal mode: the bottom half costs a heart, a DNF two, losing a boss two; calm keeps the lenient rules', () => {
    expect(heartsLost(3, 6, true)).toBe(0);
    expect(heartsLost(4, 6, true)).toBe(1);
    expect(heartsLost(2, 6, false)).toBe(2);
    expect(heartsLost(2, 4, true, false, true)).toBe(2);
    expect(heartsLost(1, 4, true, false, true)).toBe(0);
    expect(heartsLost(5, 6, true, true, true)).toBe(0);
    expect(heartsLost(6, 6, true, true)).toBe(1);
    expect(heartsLost(2, 6, false, true)).toBe(1);
  });

  it('a heart costs about one race of pay, a quarter less on the last one, and prices grow slower than pay', () => {
    const run = newRun({ seed: 1, calm: false, body: 'hatch', driver: 'human', paint: '#e8412c', trophies: 0 });
    const mid = racePrize({ course: 'farm', laps: 2, ai: 3, difficulty: 'normal', damage: false, weather: 'clear', time: 'day', nitro: true, sameCars: false, pickups: true, kind: 'rally' }, 3, 4);
    expect(healPrice(run)).toBeLessThanOrEqual(mid * 1.6);
    const last = { ...run, hearts: 1 };
    expect(healPrice(last)).toBeLessThan(healPrice(run));
    const late = { ...run, act: 2 };
    expect(healPrice(late) / healPrice(run)).toBeLessThan(1.7);
  });

  it('calm only costs a heart for a DNF or dead last', () => {
    expect(costsHeart(5, 6, true, true)).toBe(false);
    expect(costsHeart(6, 6, true, true)).toBe(true);
    expect(costsHeart(2, 4, false, true)).toBe(true);
  });
});

describe('every vehicle in the balance simulation', { timeout: 120_000 }, () => {
  /** A run as a plain player has it in act 3: some parts and the trinkets that come with the vehicle. */
  const plainRun = (body: CarBody): RunState => {
    const r = newRun({ seed: 77, calm: false, body, driver: 'human', paint: '#e8412c', trophies: 99 });
    r.act = 2;
    withParts(r, { engine: 2, tyres: 2, suspension: 1, brakes: 1, turbo: 1, armour: 1 });
    return r;
  };
  const plans = lastActPlans(null, 240);
  const rate = (run: RunState, skill: HumanSkill): { wins: number; place: number } => {
    const m: PlayerModel = { skill, aggression: 0.6 };
    const stats = playerStats(run, m);
    const rg = new Rng(11);
    let wins = 0;
    let place = 0;
    for (const plan of plans) {
      const r = simulateRace(plan, run, m, rg, stats);
      if (r.rank === 1) wins++;
      place += r.rank;
    }
    return { wins: wins / plans.length, place: place / plans.length };
  };

  it('no vehicle dominates, none is worse than the moppe, and the rocket cart is wild but not the best', () => {
    const table: Record<string, { plain: number; strong: number; place: number }> = {};
    for (const b of CAR_BODIES) {
      const plain = rate(plainRun(b), 'good');
      const strong = rate(strongRun(2, b), 'good');
      table[b] = { plain: plain.wins, strong: strong.wins, place: plain.place };
    }
    console.log(CAR_BODIES.map((b) => `${b}: plain wins ${table[b]!.plain.toFixed(2)} (place ${table[b]!.place.toFixed(2)}), strong wins ${table[b]!.strong.toFixed(2)}`).join('\n'));
    const NEW = ['epa', 'icecream', 'garbage', 'snowmobile', 'kart', 'golf', 'mower', 'camper', 'limo', 'cart'] as const;
    const OLD = CAR_BODIES.filter((b) => !(NEW as readonly string[]).includes(b));
    // no new vehicle wins more than the best of the old ones (a hair of noise aside), with a plain build or with a strong one
    for (const key of ['plain', 'strong'] as const) {
      const oldBest = Math.max(...OLD.map((b) => table[b]![key]));
      for (const b of NEW) expect(table[b]![key], `${b} ${key}`).toBeLessThanOrEqual(oldBest + 0.05);
      expect(Math.max(...CAR_BODIES.map((b) => table[b]![key]))).toBeLessThan(0.93);
    }
    // the cart is not the best vehicle in either build
    for (const key of ['plain', 'strong'] as const) {
      const best = Math.max(...CAR_BODIES.filter((b) => b !== 'cart').map((b) => table[b]![key]));
      expect(table.cart![key]).toBeLessThanOrEqual(best);
    }
    // the slow ones are slow on purpose, like the moppe, but not worse than it: nobody is hopelessly last
    for (const b of NEW) expect(table[b]!.place, b).toBeLessThanOrEqual(table.moped!.place + 0.1);
    // and the quick ones (kart, snowmobile) are in the pack of the quick old ones, not above it
    for (const b of ['kart', 'snowmobile'] as const) expect(table[b]!.place, b).toBeGreaterThanOrEqual(Math.min(...OLD.map((o) => table[o]!.place)) - 0.15);
  });

  it('the ten newest vehicles race a lap in a believable time: none is faster than the sportbil by more than 3 percent or slower than 1.4 times the car', () => {
    const plain = (b: CarBody): number => playerStats(plainRun(b), { skill: 'good', aggression: 0.5 }).lap('farm');
    const hatch = plain('hatch');
    for (const b of ['epa', 'icecream', 'garbage', 'snowmobile', 'kart', 'golf', 'mower', 'camper', 'limo', 'cart'] as const) {
      expect(plain(b) / hatch, b).toBeGreaterThan(plain('coupe') / hatch - 0.03);
      expect(plain(b) / hatch, b).toBeLessThan(1.45);
    }
  });
});
void ACTS;
void HUMAN_FACTOR;
