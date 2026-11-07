import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BODY_UNLOCK, cleanMeta, defaultMeta, trophiesFor, unlockedBodies, unlockedTrinkets } from './meta.ts';
import { META_KEY, RUN_KEY, clearRun, loadMeta, loadRun, parseRun, saveMeta, saveRun } from './save.ts';
import { continueAfterRace, enterNode, submitRace } from './flow.ts';
import { newRun, reachable, type RunState } from './state.ts';
import { TRINKETS } from './trinkets.ts';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
  removeItem(k: string): void {
    this.data.delete(k);
  }
}

let store: MemoryStorage;
beforeEach(() => {
  store = new MemoryStorage();
  (globalThis as unknown as { localStorage: unknown }).localStorage = store;
});
afterEach(() => {
  delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
});

const sample = (): RunState => {
  let run = newRun({ seed: 2024, calm: false, body: 'buggy', driver: 'pig', paint: '#2f6fe0', trophies: 5 });
  run.trinkets = [{ id: 'gummianka', n: 2 }, { id: 'jattehjul', n: 1 }];
  run.kronor = 123;
  run.car.parts.engine = 2;
  run.car.damage = 30;
  run = enterNode(run, reachable(run)[0]!.id);
  run = submitRace(run, { place: 2, n: 4, finished: true, time: 91000, laps: 2, kronor: 100, coins: 10, medal: 'bronze', damage: 12, bonus: 5, stats: { bounces: 4, driftSeconds: 3.5, bananas: 1, bananaHits: 1, boosts: 2, coins: 7, squashed: 0, quacks: 4, jumps: 0 } });
  return continueAfterRace(run);
};

describe('saving a run', () => {
  it('survives a round trip through localStorage', () => {
    const run = sample();
    saveRun(run);
    const back = loadRun();
    expect(back).toEqual(run);
    expect(back?.car.style.driver).toBe('pig');
    expect(back?.car.parts.engine).toBe(2);
  });

  it('keeps a shop or a reward in progress', () => {
    let run = newRun({ seed: 5, calm: false, body: 'hatch', driver: 'human', paint: '#e8412c', trophies: 3 });
    run.screen = { kind: 'reward', nodeId: 'a0r0c0', choices: ['gummianka', 'bananskal'], source: 'boss' };
    expect(parseRun(JSON.parse(JSON.stringify(run)))?.screen).toEqual(run.screen);
    run = { ...run, screen: { kind: 'shop', nodeId: 'a0r0c0', stock: [{ id: 'gummianka', sold: true }, { id: 'jattehjul', sold: false }], rerolls: 2, healed: true, repaired: false } };
    expect(parseRun(JSON.parse(JSON.stringify(run)))?.screen).toEqual(run.screen);
  });

  it('has nothing to continue when storage is empty, corrupt, or from the future', () => {
    expect(loadRun()).toBeNull();
    store.setItem(RUN_KEY, '{not json');
    expect(loadRun()).toBeNull();
    store.setItem(RUN_KEY, '"hej"');
    expect(loadRun()).toBeNull();
    store.setItem(RUN_KEY, JSON.stringify({ v: 2, seed: 1 }));
    expect(loadRun()).toBeNull();
    store.setItem(RUN_KEY, JSON.stringify({ v: 1 }));
    expect(loadRun()).toBeNull();
  });

  it('cleans up garbage inside an otherwise valid save', () => {
    const run = parseRun({
      v: 1,
      seed: 77,
      act: 9,
      hearts: 99,
      kronor: -5,
      trinkets: [{ id: 'finns-inte', n: 3 }, { id: 'gummianka', n: 40 }, { id: 'gummianka', n: 1 }, 'x'],
      car: { body: 'tank', parts: { engine: 99, tyres: -2 }, style: { paint: 'rosa', driver: 'drake' }, damage: 500 },
      screen: { kind: 'shop', nodeId: 'nope', stock: [] },
      at: 'a0r9c9',
      stats: { races: 'många', wins: 2 },
    });
    expect(run).not.toBeNull();
    expect(run!.act).toBe(2);
    expect(run!.hearts).toBe(3);
    expect(run!.kronor).toBe(0);
    expect(run!.trinkets).toEqual([{ id: 'gummianka', n: 5 }]);
    expect(run!.car.body).toBe('hatch');
    expect(run!.car.parts.engine).toBe(3);
    expect(run!.car.parts.tyres).toBe(0);
    expect(run!.car.damage).toBe(100);
    expect(run!.car.style.driver).toBe('human');
    expect(run!.screen).toBeNull();
    expect(run!.at).toBeNull();
    expect(run!.stats.races).toBe(0);
    expect(run!.stats.wins).toBe(2);
  });

  it('lifts a save without a version and clears on request', () => {
    const run = parseRun({ seed: 3, hearts: 2 });
    expect(run?.hearts).toBe(2);
    saveRun(sample());
    clearRun();
    expect(loadRun()).toBeNull();
  });

  it('never throws when storage is blocked', () => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('full');
      },
      removeItem() {
        throw new Error('blocked');
      },
    };
    expect(() => saveRun(sample())).not.toThrow();
    expect(loadRun()).toBeNull();
    expect(() => clearRun()).not.toThrow();
    expect(loadMeta()).toEqual(defaultMeta());
    expect(() => saveMeta(defaultMeta())).not.toThrow();
  });
});

describe('meta progress', () => {
  it('starts with the rally car and the buggy', () => {
    expect(unlockedBodies(0)).toEqual(['hatch', 'buggy']);
    expect(unlockedBodies(BODY_UNLOCK.pickup)).toContain('pickup');
    expect(unlockedBodies(100)).toHaveLength(10);
  });

  it('trophies put more trinkets in the pool', () => {
    expect(unlockedTrinkets(0).length).toBeLessThan(unlockedTrinkets(5).length);
    expect(unlockedTrinkets(100)).toHaveLength(TRINKETS.length);
  });

  it('trophies: more for further acts and for winning', () => {
    const none = trophiesFor({ bossesBeaten: 0, won: false, races: 1 });
    const one = trophiesFor({ bossesBeaten: 1, won: false, races: 5 });
    const win = trophiesFor({ bossesBeaten: 3, won: true, races: 15 });
    expect(none).toBe(0);
    expect(one).toBeGreaterThan(none);
    expect(win).toBeGreaterThan(one);
  });

  it('round trips and falls back to fresh progress on junk', () => {
    const m = { ...defaultMeta(), trophies: 9, runs: 3, bestAct: 2, seen: ['gummianka', 'xx'], calm: true, body: 'coupe' as const, driver: 'cat' as const };
    saveMeta(m);
    const back = loadMeta();
    expect(back.trophies).toBe(9);
    expect(back.seen).toEqual(['gummianka']);
    expect(back.calm).toBe(true);
    expect(back.body).toBe('coupe');
    expect(back.driver).toBe('cat');
    store.setItem(META_KEY, 'trasig');
    expect(loadMeta()).toEqual(defaultMeta());
    expect(cleanMeta(null)).toEqual(defaultMeta());
    expect(cleanMeta({ trophies: 'många', body: 'monster' })).toEqual(defaultMeta());
    // a locked body is not kept
    expect(cleanMeta({ trophies: 1, body: 'monster' }).body).toBe('hatch');
  });

  it('carries over the car the quick race remembered', () => {
    store.setItem('galna-rallyt:prefs:v1', JSON.stringify({ course: 'farm', body: 'buggy', paint: '#2f6fe0' }));
    const m = loadMeta();
    expect(m.body).toBe('buggy');
    expect(m.paint).toBe('#2f6fe0');
  });
});

describe('a finished run stays saved until its summary is left', () => {
  it('keeps the last race card and how the run was counted, so a reload counts nothing twice', async () => {
    const { newRun } = await import('./state.ts');
    const { parseRun } = await import('./save.ts');
    const r = newRun({ seed: 9, calm: false, body: 'hatch', driver: 'human', paint: '#e8412c', trophies: 0 });
    r.status = 'dead';
    r.hearts = 0;
    r.end = { won: false, trophies: 1, total: 1, unlockedBodies: [], unlockedTrinkets: [] };
    const back = parseRun(JSON.parse(JSON.stringify(r)));
    expect(back?.status).toBe('dead');
    expect(back?.end).toEqual(r.end);
    expect(parseRun({ ...JSON.parse(JSON.stringify(r)), end: undefined })?.end).toBeUndefined();
  });
});

describe('a save from before phase 6', () => {
  it('still loads: a race card without kinds or points, stats without takedowns, a reward without a source we know', () => {
    const run = newRun({ seed: 11, calm: false, body: 'hatch', driver: 'human', paint: '#e8412c', trophies: 3 });
    const first = reachable(run)[0]!;
    const old = JSON.parse(JSON.stringify({ ...run, screen: { kind: 'postrace', nodeId: first.id, summary: { place: 1, n: 4, finished: true, time: 90000, heartLost: false, prize: 100, coins: 5, bonus: 0, total: 110, medal: null, reward: true } } }));
    delete old.stats.takedowns;
    delete old.stats.wrecks;
    const back = parseRun(old)!;
    expect(back.stats.takedowns).toBe(0);
    expect(back.stats.wrecks).toBe(0);
    expect(back.screen?.kind).toBe('postrace');
    if (back.screen?.kind === 'postrace') {
      expect(back.screen.summary.rewardKind).toBe('win');
      expect(back.screen.summary.kind).toBeUndefined();
    }
  });

  it('round trips the new card fields and a reward that offers a part upgrade or a consolation', () => {
    const run = newRun({ seed: 12, calm: false, body: 'hatch', driver: 'human', paint: '#e8412c', trophies: 3 });
    const id = reachable(run)[0]!.id;
    run.screen = { kind: 'postrace', nodeId: id, summary: { place: 1, n: 4, finished: true, time: 90000, heartLost: false, prize: 100, coins: 5, bonus: 0, total: 110, medal: null, reward: true, rewardKind: 'win', kind: 'carnage', points: 14, takedowns: 3, wrecked: 1, roadPlace: 3 } };
    expect(parseRun(JSON.parse(JSON.stringify(run)))?.screen).toEqual(run.screen);
    run.screen = { kind: 'reward', nodeId: id, choices: ['gummianka', 'part:armour', 'bananskal'], source: 'race' };
    expect(parseRun(JSON.parse(JSON.stringify(run)))?.screen).toEqual(run.screen);
    run.screen = { kind: 'reward', nodeId: id, choices: ['gummianka', 'bananskal'], source: 'consolation' };
    expect(parseRun(JSON.parse(JSON.stringify(run)))?.screen).toEqual(run.screen);
    run.screen = { kind: 'reward', nodeId: id, choices: ['part:finnsinte', 'bananskal'], source: 'race' };
    expect(parseRun(JSON.parse(JSON.stringify(run)))?.screen).toEqual({ kind: 'reward', nodeId: id, choices: ['bananskal'], source: 'race' });
  });
});
