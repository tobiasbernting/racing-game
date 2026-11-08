import { describe, expect, it } from 'vitest';
import { MAX_CHARGES, MAX_NITRO_SECONDS, ModBus, capGrip, capPower, neutralTune, noMods, softCap, type RaceApi } from '../rally/mods.ts';
import { MAX_STACK, RARITIES, TRINKET_PATHS, TRINKETS, stackCap, buildMods, ghostSeconds, jumpPower, perksOf, stackDim, stackLin, trinketById } from './trinkets.ts';

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

  it('has no unlock gate: every talisman is in the pool from the first launch', () => {
    for (const t of TRINKETS) expect('unlock' in t, t.id).toBe(false);
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
    const m = buildMods([{ id: 'surstromming', n: 99 }, { id: 'finns-inte', n: 2 }, { id: 'jattehjul', n: 0 }]);
    expect(m.items).toHaveLength(1);
    expect(m.items[0]!.n).toBe(MAX_STACK);
    // the runaway ones stop earlier
    expect(buildMods([{ id: 'kolsyrad', n: 5 }]).items[0]!.n).toBe(stackCap(trinketById('kolsyrad')));
    expect(stackCap(trinketById('kolsyrad'))).toBeLessThan(MAX_STACK);
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
    fart: log('fart'),
    burp: log('burp'),
    gas: log('gas'),
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
    swapAhead: () => (calls.push('swapAhead'), true),
    dropAhead: (k: string) => (calls.push(`dropAhead:${k}`), true),
    slowBehind: log('slow'),
    shove: log('shove'),
    kronor: log('kronor'),
    sparkle: log('sparkle'),
    stat: log('stat'),
    oil: log('oil'),
    mine: log('mine'),
    fakeCoin: log('fakeCoin'),
    smoke: log('smoke'),
    shock: log('shock'),
    ramUp: log('ramUp'),
    nitro: log('nitro'),
    flame: log('flame'),
    heal: log('heal'),
    rerollAbility: log('rerollAbility'),
    abilityCooldown: log('abilityCooldown'),
    copyLeaderAbility: () => (calls.push('copyLeaderAbility'), true),
    repeatAbility: log('repeatAbility'),
  };
  return { api, calls };
}

describe('the effect bus', () => {
  it('the bouncy ball bounces with a boing on a bump, harder with two', () => {
    const run = (n: number): string[] => {
      const { api, calls } = recorder();
      const m = buildMods([{ id: 'gummianka', n }]);
      m.bus.bind(api);
      m.bus.hit('wall', 6);
      return calls;
    };
    const one = run(1);
    expect(one.some((c) => c.startsWith('boing'))).toBe(true);
    expect(one.some((c) => c.startsWith('fart'))).toBe(false);
    const b1 = Number(one.find((c) => c.startsWith('bounce'))!.split(':')[1]);
    const b2 = Number(run(2).find((c) => c.startsWith('bounce'))!.split(':')[1]);
    expect(b2).toBeGreaterThan(b1);
  });

  it('a tiny bump does not fart', () => {
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
      const s = { speed: 30, steer: 0, handbrake: false, handbrakePressed: false, straight: true, air: false, drifting: false, boosting: false, lap: 1, place: 1, racing: true, time: 0, braking: false, wheelie: false, carnage: false, derby: false };
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

  it('the fart boost farts and leaves a gas cloud on a nitro, but not on a start', () => {
    const { api, calls } = recorder();
    const m = buildMods([{ id: 'kolsyrad', n: 1 }, { id: 'trollkarl', n: 1 }]);
    m.bus.bind(api);
    m.bus.boost('start');
    expect(calls.filter((c) => c.startsWith('gas'))).toEqual([]);
    m.bus.boost('nitro');
    expect(calls.some((c) => c.startsWith('fart'))).toBe(true);
    expect(calls.some((c) => c.startsWith('gas'))).toBe(true);
    m.bus.lap(1);
    expect(calls.filter((c) => c.startsWith('fart')).length).toBe(2);
  });

  it('every trinket id resolves', () => {
    for (const t of TRINKETS) expect(trinketById(t.id)).toBe(t);
  });
});

describe('paths', () => {
  it('every trinket belongs to one of the six paths, and each path has some', () => {
    expect(TRINKETS.length).toBeGreaterThanOrEqual(48);
    for (const t of TRINKETS) expect(TRINKET_PATHS, t.id).toContain(t.path);
    for (const p of TRINKET_PATHS) expect(TRINKETS.filter((t) => t.path === p).length, p).toBeGreaterThanOrEqual(4);
  });
});

describe('caps on runaway stacks', () => {
  it('soft caps: linear up to the knee, never past the max, still growing a little', () => {
    expect(softCap(1.1, 1.25, 1.5)).toBe(1.1);
    expect(softCap(2, 1.25, 1.5)).toBeLessThan(1.5);
    expect(softCap(2, 1.25, 1.5)).toBeGreaterThan(softCap(1.5, 1.25, 1.5));
    expect(softCap(99, 1.25, 1.5)).toBeLessThanOrEqual(1.5);
  });
  it('a pile of the same trinket cannot break the game: power, grip, nitro, drift, shove and toughness all stop', () => {
    const all = buildMods(TRINKETS.map((t) => ({ id: t.id, n: 5 }))).tune;
    // the build's own numbers (upgrades and trinkets together) stop at the soft caps; the body's total is capped again by capPower and capGrip
    expect(all.power).toBeLessThanOrEqual(1.9);
    expect(all.grip).toBeLessThanOrEqual(1.4);
    expect(all.nitroSeconds).toBeLessThanOrEqual(2.4);
    expect(all.charges).toBeLessThanOrEqual(5);
    expect(all.driftRate).toBeLessThanOrEqual(5);
    expect(all.shove).toBeLessThanOrEqual(3);
    expect(all.tough).toBeGreaterThanOrEqual(0.45);
    expect(all.coinValue).toBeLessThanOrEqual(3);
    expect(all.launch).toBeLessThanOrEqual(5);
    expect(all.size).toBeLessThanOrEqual(1.7);
    expect(capGrip(3)).toBeLessThanOrEqual(1.22);
    expect(capPower(9)).toBeLessThanOrEqual(1.5);
    expect(MAX_CHARGES * 2.4).toBeLessThanOrEqual(MAX_NITRO_SECONDS + 0.1);
  });
  it('kronor perks stop at double pay', () => {
    expect(perksOf([{ id: 'guldagget', n: 2 }, { id: 'planbok', n: 3 }]).kronor).toBeLessThanOrEqual(1);
    expect(perksOf([{ id: 'guldagget', n: 1 }]).kronor).toBeCloseTo(0.5);
  });
});

describe('the humour is chaos, not toilets', () => {
  it('at most three trinkets are about prutt and bajs, and only those fart or leave the green cloud', () => {
    const toilet = TRINKETS.filter((t) => /prutt|bajs|kräk|spy|toa\b/i.test(`${t.name} ${t.text}`));
    expect(toilet.length).toBeLessThanOrEqual(3);
    expect(trinketById('kolsyrad')!.rarity).not.toBe('common');
    expect(trinketById('trollkarl')!.rarity).toBe('legendary');
    // the others never ask for the fart or the green cloud
    for (const t of TRINKETS.filter((x) => x.id !== 'kolsyrad' && x.id !== 'trollkarl')) {
      const { api, calls } = recorder();
      const m = buildMods([{ id: t.id, n: 2 }]);
      m.bus.bind(api);
      m.bus.hit('car', 8);
      m.bus.hit('wall', 8);
      m.bus.hit('land', 9);
      m.bus.boost('nitro');
      m.bus.lap(1);
      m.bus.drift(2, 2);
      m.bus.tick(5, { speed: 30, steer: 0, handbrake: false, handbrakePressed: false, straight: true, air: false, drifting: true, boosting: false, lap: 1, place: 2, racing: true, time: 20, braking: false, wheelie: false, carnage: false, derby: false });
      expect(calls.filter((c) => c.startsWith('fart') || c.startsWith('gas') || c.startsWith('burp')), t.id).toEqual([]);
    }
  });

  it('has a handful of trinkets with random outcomes in the Kaos flavour', () => {
    expect(TRINKETS.filter((t) => t.path === 'kaos').length).toBeGreaterThanOrEqual(7);
    for (const id of ['bytesplats', 'konmagnet', 'slumpvaxel', 'tombola']) expect(trinketById(id)?.path).toBe('kaos');
  });
});
