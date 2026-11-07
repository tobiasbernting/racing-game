import { describe, expect, it } from 'vitest';
import { ModBus, neutralTune, noMods, type RaceApi } from '../rally/mods.ts';
import { MAX_STACK, RARITIES, TRINKETS, buildMods, ghostSeconds, jumpPower, perksOf, stackDim, stackLin, trinketById } from './trinkets.ts';

describe('the trinket list', () => {
  it('has at least 25 trinkets with unique ids, Swedish names, an icon, a rarity and one line of text', () => {
    expect(TRINKETS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(TRINKETS.map((t) => t.id)).size).toBe(TRINKETS.length);
    for (const t of TRINKETS) {
      expect(t.name.length).toBeGreaterThan(2);
      expect(t.emoji.length).toBeGreaterThan(0);
      expect(RARITIES).toContain(t.rarity);
      expect(t.text.length).toBeGreaterThan(8);
      expect(t.text.length).toBeLessThan(90);
      expect(t.tune || t.hooks || t.perk, t.id).toBeTruthy();
    }
    for (const r of RARITIES) expect(TRINKETS.some((t) => t.rarity === r)).toBe(true);
  });

  it('starts with enough trinkets for the first run without any trophies', () => {
    expect(TRINKETS.filter((t) => t.unlock === 0).length).toBeGreaterThanOrEqual(10);
  });
});

describe('stacking', () => {
  it('stack helpers grow with the count', () => {
    expect(stackLin(10, 5, 1)).toBe(10);
    expect(stackLin(10, 5, 3)).toBe(20);
    expect(stackDim(0.5, 1)).toBeCloseTo(0.5);
    expect(stackDim(0.5, 2)).toBeCloseTo(0.75);
    expect(jumpPower(3)).toBeGreaterThan(jumpPower(1));
    expect(ghostSeconds(2)).toBeGreaterThan(ghostSeconds(1));
  });

  it('a second copy strengthens the tune of every tuning trinket', () => {
    const checks: [string, (t: ReturnType<typeof neutralTune>) => number, 1 | -1][] = [
      ['jattehjul', (t) => t.wheels, 1],
      ['magnetko', (t) => t.magnet, 1],
      ['tvattbjorn', (t) => t.driftRate, 1],
      ['hoppfjadrar', (t) => t.jump, 1],
      ['piratguld', (t) => t.coinValue, 1],
      ['kanelbullar', (t) => t.power, 1],
      ['mandamm', (t) => t.gravity, -1],
      ['raketkorv', (t) => t.nitroSeconds, 1],
      ['kolsyrad', (t) => t.charges, 1],
      ['dino', (t) => t.size, 1],
      ['raketryggsack', (t) => t.launch, 1],
      ['alghorn', (t) => t.shove, 1],
    ];
    for (const [id, get, dir] of checks) {
      const one = get(buildMods([{ id, n: 1 }]).tune);
      const two = get(buildMods([{ id, n: 2 }]).tune);
      expect(one, id).not.toBe(get(neutralTune()));
      expect((two - one) * dir, id).toBeGreaterThan(0);
    }
  });

  it('caps the stack and skips unknown ids', () => {
    const m = buildMods([{ id: 'kanelbullar', n: 99 }, { id: 'finns-inte', n: 2 }, { id: 'jattehjul', n: 0 }]);
    expect(m.items).toHaveLength(1);
    expect(m.items[0]!.n).toBe(MAX_STACK);
  });

  it('buildMods with nothing is the plain race', () => {
    const m = buildMods([]);
    expect(m.tune).toEqual(noMods().tune);
    expect(m.bus.size).toBe(0);
  });

  it('perks add up and the discount is capped', () => {
    expect(perksOf([{ id: 'rabattkupong', n: 2 }]).shopDiscount).toBeCloseTo(0.3);
    expect(perksOf([{ id: 'rabattkupong', n: 5 }]).shopDiscount).toBe(0.6);
    expect(perksOf([{ id: 'pepparkaka', n: 2 }]).maxHearts).toBe(2);
    expect(perksOf([{ id: 'kristallkula', n: 1 }]).choices).toBe(1);
    expect(perksOf([{ id: 'guldagget', n: 1 }]).kronor).toBeCloseTo(0.5);
  });
});

/** An api that records what hooks asked for. */
function recorder(): { api: RaceApi; calls: string[] } {
  const calls: string[] = [];
  const log = (name: string) => (...a: unknown[]) => void calls.push(`${name}:${a.join(',')}`);
  const api: RaceApi = {
    say: log('say'),
    quack: log('quack'),
    boing: log('boing'),
    party: log('party'),
    bounce: log('bounce'),
    kick: log('kick'),
    boost: log('boost'),
    ghost: log('ghost'),
    banana: log('banana'),
    cannon: log('cannon'),
    squashLeader: log('squash'),
    swapVehicle: log('swap'),
    slowBehind: log('slow'),
    shove: log('shove'),
    kronor: log('kronor'),
    sparkle: log('sparkle'),
    stat: log('stat'),
  };
  return { api, calls };
}

describe('the effect bus', () => {
  it('the rubber duck bounces and quacks on a bump, harder with two', () => {
    const run = (n: number): string[] => {
      const { api, calls } = recorder();
      const m = buildMods([{ id: 'gummianka', n }]);
      m.bus.bind(api);
      m.bus.hit('wall', 6);
      return calls;
    };
    const one = run(1);
    expect(one.some((c) => c.startsWith('quack'))).toBe(true);
    const b1 = Number(one.find((c) => c.startsWith('bounce'))!.split(':')[1]);
    const b2 = Number(run(2).find((c) => c.startsWith('bounce'))!.split(':')[1]);
    expect(b2).toBeGreaterThan(b1);
  });

  it('a tiny bump does not quack', () => {
    const { api, calls } = recorder();
    const m = buildMods([{ id: 'gummianka', n: 1 }]);
    m.bus.bind(api);
    m.bus.hit('wall', 0.5);
    expect(calls).toEqual([]);
  });

  it('bananas drop on a timer, faster with more', () => {
    const count = (n: number): number => {
      const { api, calls } = recorder();
      const m = buildMods([{ id: 'bananskal', n }]);
      m.bus.bind(api);
      const s = { speed: 30, steer: 0, handbrake: false, handbrakePressed: false, straight: true, air: false, drifting: false, boosting: false, lap: 1, place: 1, racing: true, time: 0 };
      for (let i = 0; i < 600; i++) m.bus.tick(0.1, s);
      return calls.filter((c) => c.startsWith('banana')).length;
    };
    expect(count(1)).toBeGreaterThanOrEqual(8);
    expect(count(3)).toBeGreaterThan(count(1));
  });

  it('the time twister halves lap one, and the disco adds ten percent kronor', () => {
    const { api } = recorder();
    const m = buildMods([{ id: 'tidsvrida', n: 1 }, { id: 'discokula', n: 1 }]);
    m.bus.bind(api);
    const out = m.bus.finish({ place: 1, n: 4, finished: true, time: 120000, laps: [70000, 50000], kronor: 100, coins: 20 });
    expect(out.time).toBe(35000);
    expect(out.kronor).toBe(12);
    const two = buildMods([{ id: 'tidsvrida', n: 2 }]);
    two.bus.bind(api);
    expect(two.bus.finish({ place: 1, n: 4, finished: true, time: 120000, laps: [70000, 50000], kronor: 0, coins: 0 }).time).toBe(52500);
    expect(two.bus.finish({ place: 4, n: 4, finished: false, time: 0, laps: [], kronor: 0, coins: 0 }).time).toBe(0);
  });

  it('an empty bus does nothing', () => {
    const bus = new ModBus([]);
    expect(bus.finish({ place: 1, n: 1, finished: true, time: 1, laps: [1], kronor: 0, coins: 0 })).toEqual({ kronor: 0, time: 0 });
  });

  it('every trinket id resolves', () => {
    for (const t of TRINKETS) expect(trinketById(t.id)).toBe(t);
  });
});
