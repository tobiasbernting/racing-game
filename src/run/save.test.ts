import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { STARTERS, cleanMeta, defaultMeta, trophiesFor } from './meta.ts';
import { META_KEY, RUN_KEY, clearRun, loadMeta, loadRun, parseRun, saveMeta, saveRun } from './save.ts';
import { continueAfterRace, enterNode, submitRace } from './flow.ts';
import { newRun, reachable, type RunState } from './state.ts';
import { TRINKETS } from './trinkets.ts';
import { emptyStats } from '../rally/mods.ts';

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
  let run = newRun({ seed: 2024, calm: false, body: 'buggy', paint: '#2f6fe0', helmet: 'bolt', helmetColor: '#f4c20d' });
  run.trinkets = [{ id: 'gummianka', n: 2 }, { id: 'jattehjul', n: 1 }];
  run.kronor = 123;
  run.up = ['race.engine1', 'race.engine2'];
  run.car.damage = 30;
  run = enterNode(run, reachable(run)[0]!.id);
  run = submitRace(run, { place: 2, n: 4, finished: true, time: 91000, laps: 2, kronor: 100, coins: 10, medal: 'bronze', damage: 12, bonus: 5, stats: { ...emptyStats(), bounces: 4, driftSeconds: 3.5, bananas: 1, bananaHits: 1, boosts: 2, coins: 7, quacks: 4, topSpeed: 140, longestDrift: 2.5 }, bestLap: 30000, triggers: { gummianka: 5 } });
  return continueAfterRace(run);
};

describe('saving a run', () => {
  it('survives a round trip through localStorage', () => {
    const run = sample();
    saveRun(run);
    const back = loadRun();
    expect(back).toEqual(run);
    expect(back?.car.style.helmet).toBe('bolt');
    expect(back?.car.style.helmetColor).toBe('#f4c20d');
    expect(back?.up).toEqual(['race.engine1', 'race.engine2']);
  });

  it('keeps a shop or a reward in progress', () => {
    let run = newRun({ seed: 5, calm: false, body: 'hatch', paint: '#e8412c' });
    run.screen = { kind: 'reward', nodeId: 'a0r0c0', choices: ['gummianka', 'bananskal'], ups: ['race.grip1', 'ram.spikes1'], grade: 'boss' };
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
    // the old part levels live on as nodes (see the migration tests): engine 99 is clamped to level 3
    expect(run!.car.parts.engine).toBe(0);
    expect(run!.up).toEqual(['race.engine1', 'race.engine2', 'race.engine3']);
    expect(run!.car.damage).toBe(100);
    expect(run!.car.style.driver).toBe('human');
    // junk in the helmet falls back to the default one
    expect(run!.car.style.helmet).toBe('stripe');
    expect(run!.car.style.helmetColor).toBe('');
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
  it('starts with no medals and nothing locked: trophies only keep score', () => {
    expect(defaultMeta().progress).toEqual({});
    expect('bodies' in defaultMeta()).toBe(false);
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
    const m = { ...defaultMeta(), trophies: 9, runs: 3, bestAct: 2, seen: ['gummianka', 'xx'], diff: 'calm' as const, body: 'coupe' as const, name: 'Tobias', alias: 'Turbo-Tobbe', helmet: 'flame' as const, helmetColor: '#2f6fe0' };
    saveMeta(m);
    const back = loadMeta();
    expect(back.trophies).toBe(9);
    expect(back.seen).toEqual(['gummianka']);
    expect(back.diff).toBe('calm');
    expect(back.body).toBe('coupe');
    expect([back.name, back.alias, back.helmet, back.helmetColor]).toEqual(['Tobias', 'Turbo-Tobbe', 'flame', '#2f6fe0']);
    store.setItem(META_KEY, 'trasig');
    expect(loadMeta()).toEqual(defaultMeta());
    expect(cleanMeta(null)).toEqual(defaultMeta());
    expect(cleanMeta({ trophies: 'många', body: 'raket' })).toEqual(defaultMeta());
    // nothing is locked: any real vehicle is kept
    expect(cleanMeta({ trophies: 1, body: 'monster' }).body).toBe('monster');
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
    const r = newRun({ seed: 9, calm: false, body: 'hatch', paint: '#e8412c' });
    r.status = 'dead';
    r.hearts = 0;
    r.end = { won: false, trophies: 1, total: 1, unlockedBodies: [], unlockedTrinkets: [], progress: {} };
    const back = parseRun(JSON.parse(JSON.stringify(r)));
    expect(back?.status).toBe('dead');
    expect(back?.end).toEqual(r.end);
    expect(parseRun({ ...JSON.parse(JSON.stringify(r)), end: undefined })?.end).toBeUndefined();
  });
});

describe('a save from before phase 6', () => {
  it('still loads: a race card without kinds or points, stats without takedowns, a reward without a source we know', () => {
    const run = newRun({ seed: 11, calm: false, body: 'hatch', paint: '#e8412c' });
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
    const run = newRun({ seed: 12, calm: false, body: 'hatch', paint: '#e8412c' });
    const id = reachable(run)[0]!.id;
    run.screen = { kind: 'postrace', nodeId: id, summary: { place: 1, n: 4, finished: true, time: 90000, heartLost: false, hearts: 0, prize: 100, coins: 5, bonus: 0, total: 110, medal: null, reward: true, rewardKind: 'win', kind: 'carnage', points: 14, takedowns: 3, wrecked: 1, roadPlace: 3 } };
    expect(parseRun(JSON.parse(JSON.stringify(run)))?.screen).toEqual(run.screen);
    // an old part card becomes the next tier of the line the part turned into
    const legacy = (screen: Record<string, unknown>): unknown => parseRun({ ...JSON.parse(JSON.stringify(run)), screen: { kind: 'reward', nodeId: id, ...screen } })?.screen;
    expect(legacy({ choices: ['gummianka', 'part:armour', 'bananskal'], source: 'race' })).toEqual({ kind: 'reward', nodeId: id, choices: ['gummianka', 'bananskal'], ups: ['ram.plates1'], grade: 'win' });
    // a saved second-place consolation turns into a plain pick, a boss or elite pick stays what it was, a new reward keeps its grade
    expect(legacy({ choices: ['gummianka', 'bananskal'], ups: [], source: 'consolation' })).toEqual({ kind: 'reward', nodeId: id, choices: ['gummianka', 'bananskal'], ups: [], grade: 'plain' });
    expect(legacy({ choices: ['bananskal'], ups: [], source: 'boss' })).toMatchObject({ grade: 'boss' });
    expect(legacy({ choices: ['bananskal'], ups: [], source: 'elite' })).toMatchObject({ grade: 'elite' });
    run.screen = { kind: 'reward', nodeId: id, choices: ['gummianka', 'bananskal'], ups: ['ram.plates1'], grade: 'normal' };
    expect(parseRun(JSON.parse(JSON.stringify(run)))?.screen).toEqual(run.screen);
    expect(legacy({ choices: ['part:finnsinte', 'bananskal'], source: 'race' })).toEqual({ kind: 'reward', nodeId: id, choices: ['bananskal'], ups: [], grade: 'win' });
    // a postrace card saved with the old second-place kind reads as plain
    expect(parseRun({ ...JSON.parse(JSON.stringify(run)), screen: { kind: 'postrace', nodeId: id, summary: { place: 2, n: 4, finished: true, time: 1, heartLost: false, prize: 1, coins: 0, bonus: 0, total: 1, medal: null, reward: true, rewardKind: 'second' } } })?.screen).toMatchObject({ summary: { rewardKind: 'plain' } });
  });
});

describe('saves from before the players drove as themselves', () => {
  it('an old animal driver in a run reads as a person with the default helmet', () => {
    for (const animal of ['cow', 'rabbit', 'horse', 'cat']) {
      const run = parseRun({ v: 1, seed: 5, act: 0, hearts: 3, car: { body: 'hatch', style: { paint: '#2f6fe0', driver: animal } } });
      expect(run?.car.style.driver).toBe('human');
      expect(run?.car.style.helmet).toBe('stripe');
      expect(run?.car.style.helmetColor).toBe('');
      expect(run?.car.style.paint).toBe('#2f6fe0');
    }
  });

  it('an old meta with a driver gets no name yet (the game asks), the default helmet and keeps the rest', () => {
    const m = cleanMeta({ v: 1, trophies: 7, runs: 3, wins: 1, bestAct: 2, seen: [], medals: 1, progress: { takedowns: 4 }, body: 'coupe', paint: '#2f6fe0', driver: 'pig' });
    expect(m.name).toBe('');
    expect(m.alias).toBe('');
    expect(m.helmet).toBe('stripe');
    expect(m.helmetColor).toBe('');
    expect('driver' in m).toBe(false);
    expect([m.trophies, m.runs, m.body, m.paint, m.progress.takedowns]).toEqual([7, 3, 'coupe', '#2f6fe0', 4]);
  });

  it('a name and a rally name are kept; rude or junk names are dropped; the helmet is checked', () => {
    const m = cleanMeta({ name: '  Tobias  ', alias: 'Turbo-Tobbe', helmet: 'wing', helmetColor: '#2fa84f' });
    expect([m.name, m.alias, m.helmet, m.helmetColor]).toEqual(['Tobias', 'Turbo-Tobbe', 'wing', '#2fa84f']);
    const bad = cleanMeta({ name: 'Du kuk', alias: 42, helmet: 'ears', helmetColor: '#123456' });
    expect([bad.name, bad.alias, bad.helmet, bad.helmetColor]).toEqual(['', '', 'stripe', '']);
    expect(cleanMeta({ name: 'x'.repeat(40) }).name.length).toBeLessThanOrEqual(16);
  });
});
