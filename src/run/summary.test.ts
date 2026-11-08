import { describe, expect, it } from 'vitest';
import type { RallyResult } from '../rally/options.ts';
import { emptyStats } from '../rally/mods.ts';
import { buyTrinket } from './economy.ts';
import { continueAfterRace, enterNode, finishNode, pickReward, submitRace } from './flow.ts';
import { parseRun } from './save.ts';
import { addRaceStats } from './stats.ts';
import { emptyRunStats, newRun, reachable, type RunState } from './state.ts';
import { TRINKETS, trinketById } from './trinkets.ts';
import { abilityOf, allStats, buildMix, buildTimeline, buildView, statView, trophyReasons, verdictOf } from './summary.ts';
import { trophiesFor } from './meta.ts';

const fresh = (): RunState => {
  const r = newRun({ seed: 7, calm: false, body: 'hatch', driver: 'cow', paint: '#e8412c' });
  r.trinkets = [];
  r.got = [];
  return r;
};
const result = (o: Partial<RallyResult> = {}): RallyResult => ({ place: 1, n: 4, finished: true, time: 90000, laps: 2, kronor: 100, coins: 0, medal: null, damage: 0, ...o });
const raceNode = (run: RunState): RunState => enterNode(run, (reachable(run).find((n) => n.type === 'race' || n.type === 'challenge') ?? reachable(run)[0]!).id);

describe('adding a race to the run stats', () => {
  it('sums counters, keeps the best of top speed, drift and lap, and counts triggers', () => {
    const st = emptyRunStats();
    addRaceStats(st, result({ stats: { ...emptyStats(), airSeconds: 3, topSpeed: 150, longestDrift: 2, overtakes: 4 }, bestLap: 31000, triggers: { gummianka: 5 }, takedowns: 2, wrecked: 1 }));
    addRaceStats(st, result({ place: 3, stats: { ...emptyStats(), airSeconds: 2, topSpeed: 120, longestDrift: 4, overtakes: 1 }, bestLap: 33000, triggers: { gummianka: 2, jattehjul: 1 } }));
    expect(st.airSeconds).toBe(5);
    expect(st.topSpeed).toBe(150);
    expect(st.longestDrift).toBe(4);
    expect(st.overtakes).toBe(5);
    expect(st.bestLap).toBe(31000);
    expect(st.triggers).toEqual({ gummianka: 7, jattehjul: 1 });
    expect(st.takedowns).toBe(2);
    expect(st.wrecks).toBe(1);
    expect(st.podiums).toBe(2);
    expect(st.totalTime).toBe(180000);
  });

  it('ignores junk numbers', () => {
    const st = emptyRunStats();
    addRaceStats(st, result({ stats: { ...emptyStats(), topSpeed: NaN, airSeconds: -4 }, bestLap: Infinity }));
    expect(st.topSpeed).toBe(0);
    expect(st.airSeconds).toBe(0);
    expect(st.bestLap).toBe(0);
  });
});

describe('the run log and where things came from', () => {
  it('logs a race, a shop buy and the reward with its source', () => {
    let run = raceNode(fresh());
    run = submitRace(run, result({ place: 1, stats: { ...emptyStats(), jumps: 2 } }));
    expect(run.log).toHaveLength(1);
    expect(run.log[0]).toMatchObject({ place: 1, n: 4, lost: 0 });
    run = continueAfterRace(run);
    expect(run.screen?.kind).toBe('reward');
    run = pickReward(run, 0);
    expect(run.got).toHaveLength(1);
    expect(run.got[0]!.from).toMatch(/^Vann på /);
    const view = buildView(run);
    expect(view.trinkets.length + view.trees.length).toBe(1);
    const tl = buildTimeline(run);
    expect(tl).toHaveLength(1);
    expect(tl[0]!.items[0]!.rewards).toHaveLength(1);
  });

  it('logs shops without a race, and a purchase says it was bought in the kiosk', () => {
    let run = fresh();
    const shop = reachable(run).find((n) => n.type === 'shop');
    if (!shop) return;
    run = enterNode(run, shop.id);
    run.kronor = 999;
    expect(buyTrinket(run, 0)).toBe('ok');
    run = finishNode(run);
    expect(run.log[0]!.type).toBe('shop');
    expect(run.got[0]!.from).toBe('Köpt i kiosken');
    expect(run.stats.kronorSpent).toBeGreaterThan(0);
  });

  it('a lost heart is in the log and the verdict says where it ended', () => {
    let run = raceNode(fresh());
    run.hearts = 1;
    run = submitRace(run, result({ place: 4, n: 4 }));
    expect(run.status).toBe('dead');
    expect(run.log[0]!.lost).toBeGreaterThan(0);
    const v = verdictOf(run);
    expect(v.won).toBe(false);
    expect(v.where).toContain('Akt 1');
    expect(buildTimeline(run)[0]!.items[0]!.fell).toBe(true);
  });
});

describe('fun stats and the headline', () => {
  it('picks the most remarkable stat relative to what counts as a lot, with a line', () => {
    const run = fresh();
    run.stats.wins = 3;
    run.stats.races = 6;
    run.stats.kronorEarned = 900;
    run.stats.airSeconds = 50;
    run.stats.topSpeed = 100;
    const v = statView(run);
    expect(v.headline?.id).toBe('air');
    expect(v.headline?.line.length).toBeGreaterThan(5);
  });

  it('shows 6 to 10 cards and puts the rest behind the button, without repeating the headline', () => {
    const run = fresh();
    run.stats = { ...run.stats, wins: 2, races: 5, bounces: 10, oilHits: 2, topSpeed: 160, kronorEarned: 400, coins: 20, overtakes: 12 };
    const v = statView(run);
    expect(v.main.length).toBeGreaterThanOrEqual(6);
    expect(v.main.length).toBeLessThanOrEqual(10);
    const ids = [...v.main, ...v.rest, ...(v.headline ? [v.headline] : [])].map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(allStats(run).length);
  });

  it('copes with an empty run and names the most triggered trinket', () => {
    const run = fresh();
    expect(statView(run).headline).toBeNull();
    expect(statView(run).main.length).toBeGreaterThanOrEqual(6);
    run.stats.triggers = { [TRINKETS[0]!.id]: 40 };
    const c = allStats(run).find((x) => x.id === 'trinket')!;
    expect(c.label).toContain(TRINKETS[0]!.name);
    expect(c.value).toBe('40 gånger');
  });
});

describe('the build mix', () => {
  it('adds up to 100 and sorts by share', () => {
    const run = fresh();
    const byPath = (p: string): string => TRINKETS.find((t) => t.path === p)!.id;
    run.trinkets = [{ id: byPath('ram'), n: 3 }, { id: byPath('fuffens'), n: 2 }, { id: byPath('race'), n: 1 }];
    const mix = buildMix(run);
    expect(mix.reduce((a, m) => a + m.pct, 0)).toBe(100);
    expect(mix.map((m) => m.path)).toEqual(['ram', 'fuffens', 'race']);
    expect(mix[0]!.pct).toBe(50);
  });

  it('counts upgrade nodes by their tree and is empty with nothing', () => {
    const run = fresh();
    expect(buildMix(run)).toEqual([]);
    run.up = ['ram.plates1', 'ram.plates2'];
    expect(buildMix(run)).toEqual([{ path: 'ram', name: 'Ram', emoji: '🛡️', pct: 100 }]);
    run.trinkets = [{ id: TRINKETS.find((t) => t.path === 'race')!.id, n: 1 }, { id: TRINKETS.find((t) => t.path === 'stunt')!.id, n: 1 }];
    const m = buildMix(run);
    expect(m.reduce((a, x) => a + x.pct, 0)).toBe(100);
    expect(trinketById(run.trinkets[0]!.id)).toBeTruthy();
  });

  it('fills the ability slot from the vehicle: the active, the passive and how often it was used', () => {
    const r = fresh();
    r.stats.abilityUses = 7;
    const a = buildView(r).ability;
    expect(a.name).toBe('Kickstart');
    expect(a.uses).toBe(7);
    expect(a.passive.name).toBe('Perfekt sladd');
    expect(abilityOf({ ...r, car: { ...r.car, body: 'tractor' } }).name).toBe('Rammbock');
  });
});

describe('trophies and unlock progress', () => {
  it('reasons add up to the trophies', () => {
    const run = fresh();
    run.stats.bossesBeaten = 2;
    run.stats.races = 9;
    for (const won of [true, false]) {
      expect(trophyReasons(run, won).reduce((a, r) => a + r.n, 0)).toBe(trophiesFor({ bossesBeaten: 2, won, races: 9 }));
    }
  });

});

describe('old saves', () => {
  it('load with empty logs and zeroed new stats', () => {
    const run = fresh();
    const raw = JSON.parse(JSON.stringify(run)) as Record<string, unknown>;
    delete raw.log;
    delete raw.got;
    delete raw.nodeLost;
    raw.stats = { bounces: 4, races: 2, wins: 1 };
    const back = parseRun(raw)!;
    expect(back.log).toEqual([]);
    expect(back.got).toEqual([]);
    expect(back.stats.bounces).toBe(4);
    expect(back.stats.topSpeed).toBe(0);
    expect(back.stats.triggers).toEqual({});
    expect(buildView(back).trinkets).toEqual([]);
  });

  it('keeps the log and triggers through a round trip', () => {
    let run = raceNode(fresh());
    run = submitRace(run, result({ triggers: { [TRINKETS[0]!.id]: 3 }, bestLap: 30500 }));
    const back = parseRun(JSON.parse(JSON.stringify(run)))!;
    expect(back.log).toEqual(run.log);
    expect(back.stats.triggers).toEqual(run.stats.triggers);
    expect(back.stats.bestLap).toBe(30500);
  });
});
