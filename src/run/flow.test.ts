import { describe, expect, it } from 'vitest';
import type { RallyResult } from '../rally/options.ts';
import { buyHeart, buyRepair, buyTrinket, healPrice, makeStock, reroll, rerollPrice, trinketPrice, upgradePrice, workshopBuy, workshopFree, workshopRepair } from './economy.ts';
import { EVENTS, resolveChoice } from './events.ts';
import { backToMap, chooseEvent, continueAfterRace, enterNode, finishNode, pickReward, submitRace } from './flow.ts';
import { ACTS, type MapNode } from './map.ts';
import { goalMet, planRace, targetTimeMs } from './plan.ts';
import { Rng } from './rng.ts';
import { CALM_HEARTS, START_HEARTS, costsHeart, heartsLost, mapOf, newRun, ownedN, reachable, type RunState } from './state.ts';

/** A run with nothing in the bag (the starting trinket of the vehicle is taken out, so the tests count only what they add). */
const fresh = (o: Partial<{ seed: number; calm: boolean }> = {}): RunState => {
  const r = newRun({ seed: o.seed ?? 42, calm: o.calm ?? false, body: 'hatch', paint: '#e8412c' });
  r.trinkets = [];
  r.got = [];
  return r;
};

const result = (o: Partial<RallyResult> = {}): RallyResult => ({ place: 1, n: 4, finished: true, time: 90000, laps: 2, kronor: 100, coins: 0, medal: null, damage: 0, ...o });

/** Walk to the first node of a type reachable now, or the first reachable node. */
function goTo(run: RunState, type?: string): RunState {
  const node = reachable(run).find((n) => !type || n.type === type) ?? reachable(run)[0]!;
  return enterNode(run, node.id);
}

describe('hearts', () => {
  it('start at 3, or 5 in calm mode', () => {
    expect(fresh().hearts).toBe(START_HEARTS);
    expect(fresh({ calm: true }).hearts).toBe(CALM_HEARTS);
  });

  it('a DNF or the bottom third of the field costs a heart', () => {
    expect(costsHeart(1, 4, true)).toBe(false);
    expect(costsHeart(2, 4, true)).toBe(false);
    expect(costsHeart(3, 4, true)).toBe(true);
    expect(costsHeart(4, 4, true)).toBe(true);
    expect(costsHeart(3, 6, true)).toBe(false);
    expect(costsHeart(4, 6, true)).toBe(true);
    expect(costsHeart(5, 6, true)).toBe(true);
    expect(costsHeart(6, 6, true)).toBe(true);
    expect(costsHeart(2, 4, false)).toBe(true);
    expect(heartsLost(2, 4, false)).toBe(2);
    expect(heartsLost(2, 6, true, false, true)).toBe(2);
    expect(heartsLost(1, 6, true, false, true)).toBe(0);
    expect(heartsLost(3, 6, true, false, false)).toBe(0);
    expect(heartsLost(3, 6, true, true, true)).toBe(0);
    expect(heartsLost(6, 6, true, true)).toBe(1);
    expect(heartsLost(2, 4, false, true)).toBe(1);
    expect(costsHeart(1, 1, true)).toBe(false);
  });

  it('losing the last heart ends the run', () => {
    let run = fresh();
    // a DNF costs two hearts in normal mode
    for (let i = 0; i < START_HEARTS; i++) {
      run = goTo(run);
      const before = run.hearts;
      run = submitRace(run, result({ place: 4, finished: false }));
      expect(run.hearts).toBe(Math.max(0, before - 2));
      if (run.status === 'dead') break;
      run = finishNode(continueAfterRace(run));
    }
    expect(run.status).toBe('dead');
    expect(run.hearts).toBe(0);
    // a dead run goes nowhere
    expect(reachable(run)).toEqual([]);
  });

  it('a good race keeps all hearts', () => {
    const run = submitRace(goTo(fresh()), result());
    expect(run.hearts).toBe(START_HEARTS);
    expect(run.stats.wins).toBe(1);
    expect(run.stats.bestPlace).toBe(1);
  });
});

describe('kronor', () => {
  it('a race pays its prize, coins and trinket bonus, scaled for the act', () => {
    const run = submitRace(goTo(fresh(), 'race'), result({ kronor: 100, coins: 20, bonus: 10 }));
    expect(run.kronor).toBe(130);
    expect(run.stats.kronorEarned).toBe(130);
    const act2 = { ...fresh(), act: 1 };
    const later = submitRace(goTo(act2, 'race'), result({ kronor: 100 }));
    expect(later.kronor).toBe(130);
  });

  it('calm mode pays a quarter more, and the Golden Egg half again', () => {
    expect(submitRace(goTo(fresh({ calm: true }), 'race'), result({ kronor: 100 })).kronor).toBe(125);
    const egg = fresh();
    egg.trinkets.push({ id: 'guldagget', n: 1 });
    expect(submitRace(goTo(egg, 'race'), result({ kronor: 100 })).kronor).toBe(150);
  });

  it('elites and bosses pay more than plain races', () => {
    const base = submitRace(goTo(fresh(), 'race'), result({ kronor: 100 })).kronor;
    const elite = fresh();
    const m = mapOf(elite);
    const e = m.rows.flat().find((n) => n.type === 'elite')!;
    // jump the run to just before the elite for the test
    const prev = m.rows.flat().find((n) => n.next.includes(e.id))!;
    elite.at = prev.id;
    const r = submitRace(enterNode(elite, e.id), result({ kronor: 100 }));
    expect(r.kronor).toBeGreaterThan(base);
  });

  it('a met challenge pays extra and gives a trinket pick, a missed one does not', () => {
    let ch: MapNode | null = null;
    let run = fresh();
    for (let seed = 1; seed < 200 && !ch; seed++) {
      run = fresh({ seed });
      ch = mapOf(run).rows.flat().find((n) => n.type === 'challenge' && n.challenge !== 'time') ?? null;
    }
    expect(ch).toBeTruthy();
    run.screen = { kind: 'prerace', nodeId: ch!.id };
    const plan = planRace(ch!, false);
    expect(plan.goal).toBeTruthy();
    const won = submitRace(run, result({ place: 1, kronor: 100 }));
    const wonCard = won.screen?.kind === 'postrace' ? won.screen.summary : null;
    expect(wonCard?.goal?.met).toBe(true);
    expect(wonCard?.reward).toBe(true);
    const lost = submitRace(run, result({ place: 4, kronor: 100 }));
    const lostCard = lost.screen?.kind === 'postrace' ? lost.screen.summary : null;
    expect(lostCard?.goal?.met).toBe(false);
    expect(lostCard?.reward).toBe(false);
    expect(won.kronor).toBeGreaterThan(lost.kronor);
  });
});

describe('challenge goals', () => {
  it('judge place and time', () => {
    expect(goalMet({ kind: 'place', place: 2, text: '' }, { finished: true, place: 2, time: 1 })).toBe(true);
    expect(goalMet({ kind: 'place', place: 2, text: '' }, { finished: true, place: 3, time: 1 })).toBe(false);
    expect(goalMet({ kind: 'place', place: 2, text: '' }, { finished: false, place: 1, time: 0 })).toBe(false);
    expect(goalMet({ kind: 'time', ms: 100000, text: '' }, { finished: true, place: 4, time: 99000 })).toBe(true);
    expect(goalMet({ kind: 'time', ms: 100000, text: '' }, { finished: true, place: 1, time: 101000 })).toBe(false);
    expect(targetTimeMs('farm', 2)).toBeGreaterThan(targetTimeMs('meadow', 2));
  });

  it('every node of every act makes a sane race plan, harder in later acts', () => {
    for (let act = 0; act < ACTS; act++)
      for (const n of mapOf({ ...fresh(), act }).rows.flat()) {
        if (!['race', 'challenge', 'elite', 'boss'].includes(n.type)) continue;
        const p = planRace(n, false);
        expect(p.rules.ai).toBeGreaterThanOrEqual(2);
        expect(p.rules.ai).toBeLessThanOrEqual(5);
        expect(p.rules.laps).toBeGreaterThanOrEqual(2);
        if (n.type === 'boss') expect(p.boss && p.twist?.boss?.name).toBe(p.boss?.name);
        const calm = planRace(n, true);
        expect(calm.rules.ai).toBeLessThanOrEqual(p.rules.ai);
      }
    const bosses = [0, 1, 2].map((act) => planRace(mapOf({ ...fresh(), act }).rows[5]![0]!, false).boss?.name);
    expect(['Tävlingsledaren Torsten', 'Golf-Göran', 'Tina Kartörner']).toContain(bosses[0]);
    expect(['Fotbolls-Freddie', 'Målvakten Mats', 'Bowling-Berit']).toContain(bosses[1]);
    expect(['Sébastien Loebsedel', 'Stig Blomgrus', 'Kapten Kanin']).toContain(bosses[2]);
  });
});

describe('a whole run', () => {
  it('can be played from the first node to the third boss', () => {
    let run = fresh({ seed: 7 });
    let guard = 0;
    while (run.status === 'running' && guard++ < 200) {
      const node = reachable(run)[0]!;
      run = enterNode(run, node.id);
      const scr = run.screen!;
      if (scr.kind === 'prerace') {
        run = continueAfterRace(submitRace(run, result()));
        if (run.screen?.kind === 'reward') run = pickReward(run, 0);
        else run = finishNode(run);
      } else if (scr.kind === 'event') run = finishNode(chooseEvent(run, 0));
      else run = finishNode(run);
    }
    expect(run.status).toBe('won');
    expect(run.stats.bossesBeaten).toBe(ACTS);
    expect(run.nodesDone).toBeGreaterThanOrEqual(ACTS * 6);
    expect(run.hearts).toBeGreaterThan(0);
  });

  it('is deterministic: the same choices give the same run', () => {
    const play = (): RunState => {
      let run = fresh({ seed: 99 });
      for (let i = 0; i < 12 && run.status === 'running'; i++) {
        run = enterNode(run, reachable(run)[0]!.id);
        const k = run.screen!.kind;
        if (k === 'prerace') run = continueAfterRace(submitRace(run, result({ place: 2 })));
        if (run.screen?.kind === 'reward') run = pickReward(run, 1);
        else if (run.screen?.kind === 'event') run = finishNode(chooseEvent(run, 1));
        else if (run.screen) run = finishNode(run);
      }
      return run;
    };
    expect(play()).toEqual(play());
  });

  it('cannot enter a node that is not reachable, or two at once', () => {
    const run = fresh();
    const far = mapOf(run).rows[3]![0]!.id;
    expect(enterNode(run, far)).toBe(run);
    const inside = goTo(run);
    expect(enterNode(inside, reachable(run)[1]!.id)).toBe(inside);
    expect(backToMap(inside).screen).toBeNull();
  });
});

describe('trinkets from rewards', () => {
  it('picking adds it, picking it again stacks it, skipping gives a few kronor', () => {
    const run = fresh();
    run.screen = { kind: 'reward', nodeId: mapOf(run).rows[0]![0]!.id, choices: ['gummianka', 'jattehjul', 'bananskal'], source: 'elite' };
    const a = pickReward(run, 0);
    expect(ownedN(a, 'gummianka')).toBe(1);
    const again = { ...a, screen: run.screen, at: null };
    expect(ownedN(pickReward(again, 0), 'gummianka')).toBe(2);
    const skip = pickReward(run, -1);
    expect(skip.kronor).toBe(30);
    expect(skip.trinkets).toHaveLength(0);
  });

  it('the gingerbread heart adds a heart to the maximum and the purse', () => {
    const run = fresh();
    run.screen = { kind: 'reward', nodeId: mapOf(run).rows[0]![0]!.id, choices: ['pepparkaka'], source: 'boss' };
    const r = pickReward(run, 0);
    expect(r.maxHearts).toBe(START_HEARTS + 1);
    expect(r.hearts).toBe(START_HEARTS + 1);
  });
});

describe('the shop', () => {
  const inShop = (kr: number): RunState => {
    const run = fresh();
    run.kronor = kr;
    const m = mapOf(run);
    const shop = m.rows.flat().find((n) => n.type === 'shop')!;
    run.at = m.rows.flat().find((n) => n.next.includes(shop.id))?.id ?? null;
    if (run.at === null) run.screen = { kind: 'shop', nodeId: shop.id, stock: makeStock(run, shop.id, 0), rerolls: 0, healed: false, repaired: false };
    else {
      const e = enterNode(run, shop.id);
      return e;
    }
    return run;
  };

  it('stocks 3-5 different trinkets, the same every time for a node', () => {
    const run = fresh();
    const s = makeStock(run, 'x', 0);
    expect(s.length).toBeGreaterThanOrEqual(3);
    expect(s.length).toBeLessThanOrEqual(5);
    expect(new Set(s.map((i) => i.id)).size).toBe(s.length);
    expect(makeStock(run, 'x', 0)).toEqual(s);
    expect(makeStock(run, 'x', 1)).not.toEqual(s);
  });

  it('stocks from the whole pool: what trophies used to gate turns up from the first launch', () => {
    const run = fresh();
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) for (const it of makeStock(run, `n${i}`, 0)) seen.add(it.id);
    for (const id of ['discokula', 'tidsvrida', 'dino']) expect(seen.has(id), id).toBe(true);
  });

  it('buying takes kronor, adds the trinket and cannot be done twice', () => {
    const run = inShop(1000);
    if (run.screen?.kind !== 'shop') throw new Error('no shop');
    const id = run.screen.stock[0]!.id;
    const price = trinketPrice(run, id);
    expect(buyTrinket(run, 0)).toBe('ok');
    expect(run.kronor).toBe(1000 - price);
    expect(ownedN(run, id)).toBe(1);
    expect(buyTrinket(run, 0)).toBe('sold');
    expect(buyTrinket(run, 9)).toBe('nothing');
  });

  it('cannot buy without enough kronor', () => {
    const run = inShop(0);
    expect(buyTrinket(run, 0)).toBe('poor');
    expect(run.trinkets).toHaveLength(0);
  });

  it('the discount coupon lowers prices', () => {
    const run = fresh();
    const full = trinketPrice(run, 'gummianka');
    run.trinkets.push({ id: 'rabattkupong', n: 2 });
    expect(trinketPrice(run, 'gummianka')).toBeLessThan(full);
    expect(healPrice(run)).toBeLessThan(healPrice(fresh()));
  });

  it('heals one heart once, repairs the car, and rerolls for more each time', () => {
    const run = inShop(1000);
    run.hearts = 1;
    run.car.damage = 60;
    expect(buyHeart(run)).toBe('ok');
    expect(run.hearts).toBe(2);
    expect(buyHeart(run)).toBe('nothing');
    expect(buyRepair(run)).toBe('ok');
    expect(run.car.damage).toBe(0);
    const shopOf = (r: RunState): Extract<NonNullable<RunState['screen']>, { kind: 'shop' }> => {
      if (r.screen?.kind !== 'shop') throw new Error('no shop');
      return r.screen;
    };
    const before = rerollPrice(shopOf(run));
    expect(reroll(run)).toBe('ok');
    expect(rerollPrice(shopOf(run))).toBeGreaterThan(before);
  });
});

describe('the workshop', () => {
  it('one cheap upgrade (tier I or II) is free, once; the rest cost kronor and need their earlier tiers', () => {
    const run = fresh();
    run.kronor = 0;
    run.screen = { kind: 'workshop', nodeId: 'x', used: false, note: '' };
    expect(workshopFree(run, 'race.engine1')).toBe(true);
    expect(workshopFree(run, 'race.cap1')).toBe(false);
    expect(workshopBuy(run, 'race.engine2')).toBe('nothing');
    expect(workshopBuy(run, 'race.engine1')).toBe('ok');
    expect(run.up).toEqual(['race.engine1']);
    expect(run.kronor).toBe(0);
    // the free pick is gone: the next one costs, and a poor player cannot
    expect(workshopRepair(run)).toBe(false);
    expect(workshopBuy(run, 'race.engine2')).toBe('poor');
    run.kronor = 500;
    const price = upgradePrice(run, 'race.engine2');
    expect(price).toBeGreaterThan(0);
    expect(workshopBuy(run, 'race.engine2')).toBe('ok');
    expect(run.kronor).toBe(500 - price);
    expect(run.up).toEqual(['race.engine1', 'race.engine2']);
    // a node already taken, or the other vehicle's, cannot be bought
    expect(workshopBuy(run, 'race.engine2')).toBe('nothing');
    expect(workshopBuy(run, 'car.tractor1')).toBe('nothing');
  });
});

describe('events', () => {
  it('there are at least eight, each with two choices and a Swedish title', () => {
    expect(EVENTS.length).toBeGreaterThanOrEqual(8);
    for (const e of EVENTS) {
      expect(e.choices).toHaveLength(2);
      expect(e.title.length).toBeGreaterThan(3);
      for (const c of e.choices) expect(c.outcomes.length).toBeGreaterThan(0);
    }
    expect(new Set(EVENTS.map((e) => e.id)).size).toBe(EVENTS.length);
  });

  it('the cow: honking costs 10 kr, driving around gives a trinket or costs a heart', () => {
    const ko = EVENTS.find((e) => e.id === 'ko')!;
    const run = fresh();
    run.kronor = 50;
    resolveChoice(run, ko, 0, 'n');
    expect(run.kronor).toBe(40);
    let sawTrinket = false;
    let sawHeart = false;
    for (let i = 0; i < 60; i++) {
      const r = fresh();
      resolveChoice(r, ko, 1, `n${i}`);
      if (r.trinkets.length) sawTrinket = true;
      if (r.hearts < START_HEARTS) sawHeart = true;
    }
    expect(sawTrinket && sawHeart).toBe(true);
  });

  it('an event never kills the run and never leaves the purse negative', () => {
    for (const ev of EVENTS)
      for (let c = 0; c < 2; c++)
        for (let i = 0; i < 30; i++) {
          const r = fresh();
          r.hearts = 1;
          r.kronor = 100;
          resolveChoice(r, ev, c, `n${i}`);
          expect(r.hearts).toBeGreaterThanOrEqual(1);
          expect(r.kronor).toBeGreaterThanOrEqual(0);
          expect(r.status).toBe('running');
        }
  });

  it('choices that cost kronor are refused when you are broke', () => {
    const korv = EVENTS.find((e) => e.id === 'korv')!;
    const r = fresh();
    r.kronor = 5;
    expect(resolveChoice(r, korv, 0, 'n')).toBeNull();
  });
});

describe('rng', () => {
  it('same labels, same numbers', () => {
    expect(Rng.for(1, 'a', 2).float()).toBe(Rng.for(1, 'a', 2).float());
    expect(Rng.for(1, 'a', 2).float()).not.toBe(Rng.for(1, 'a', 3).float());
  });
});
