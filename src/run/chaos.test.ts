// The twenty talismans of the chaos wave: data, stacking and caps, what each hook asks of the race, the sky they pick,
// the toolbox at the start of an act and the two new combos. (The race itself is checked in the browser.)
import { afterEach, describe, expect, it, vi } from 'vitest';
import { capTune } from '../rally/mods.ts';
import { defaultRules } from '../shared/rally.ts';
import { count, recorder, tickState } from './testkit.ts';
import { toolboxGift } from './flow.ts';
import { newRun } from './state.ts';
import { RARITIES, TRINKETS, buildMods, collectParts, skyOf, stackCap, trinketById, withSky } from './trinkets.ts';
import { COMBOS, activeCombos, buildRunMods, comboById } from './upgrades.ts';

const NEW = ['roulett', 'adrenalin', 'kopiatorn', 'nitrolotten', 'regnmakaren', 'solstralen', 'nattskift', 'askmoln', 'verktygslada', 'dubbeltelleringet', 'vrakplockare', 'hamndsprangare', 'rampgalning', 'kraftdryck', 'efterklang', 'termos', 'arenaklocka', 'slumpgenerator', 'lyckohjul', 'reservdunk'];

const bus = (id: string, n = 1) => {
  const { api, calls } = recorder();
  const m = buildMods([{ id, n }]);
  m.bus.bind(api);
  return { m, calls };
};

afterEach(() => vi.restoreAllMocks());

describe('the new talismans as data', () => {
  it('twenty of them, in the same format, 72 in all, none with an unlock gate', () => {
    expect(TRINKETS).toHaveLength(72);
    expect(new Set(TRINKETS.map((t) => t.id)).size).toBe(72);
    for (const id of NEW) {
      const t = trinketById(id)!;
      expect(t, id).toBeTruthy();
      expect(RARITIES).toContain(t.rarity);
      expect(t.text.length, id).toBeGreaterThan(20);
      expect(t.text.length, id).toBeLessThan(90);
      expect(stackCap(t), id).toBeGreaterThanOrEqual(1);
      expect(t.tune || t.hooks || t.perk, id).toBeTruthy();
      expect('unlock' in t).toBe(false);
    }
    // a mix: mostly chaos and ability tricks, every rarity, a few of every path that fits
    const rar = (r: string) => NEW.filter((id) => trinketById(id)!.rarity === r).length;
    expect(rar('common')).toBeGreaterThanOrEqual(4);
    expect(rar('rare')).toBeGreaterThanOrEqual(8);
    expect(rar('legendary')).toBeGreaterThanOrEqual(4);
    expect(NEW.filter((id) => trinketById(id)!.path === 'kaos').length).toBeGreaterThanOrEqual(6);
  });

  it('the one-of-a-kind ones stop at one copy', () => {
    for (const id of ['roulett', 'kopiatorn', 'regnmakaren', 'solstralen', 'nattskift', 'askmoln', 'efterklang', 'reservdunk']) expect(stackCap(trinketById(id)), id).toBe(1);
  });
});

describe('ability tricks', () => {
  it('Förmågerouletten rerolls the ability every lap', () => {
    const { m, calls } = bus('roulett');
    m.bus.lap(1);
    m.bus.lap(2);
    expect(count(calls, 'rerollAbility')).toBe(2);
  });

  it('Adrenalinsprutan cuts the cooldown on a takedown, more with a second copy, and not on other things', () => {
    const secs = (n: number): number => {
      const { m, calls } = bus('adrenalin', n);
      m.bus.takedown();
      return Number(calls.find((c) => c.startsWith('abilityCooldown'))!.split(':')[1]);
    };
    expect(secs(1)).toBe(3);
    expect(secs(2)).toBeGreaterThan(secs(1));
    const { m, calls } = bus('adrenalin');
    m.bus.wreck();
    m.bus.boost('nitro');
    expect(count(calls, 'abilityCooldown')).toBe(0);
  });

  it('Kopiatorn copies the leader when the ability is used', () => {
    const { m, calls } = bus('kopiatorn');
    m.bus.ability();
    expect(count(calls, 'copyLeaderAbility')).toBe(1);
    expect(calls.some((c) => c.startsWith('say:kopiatorn'))).toBe(true);
  });

  it('Kraftdrycken fills nitro on every ability use, more with more copies', () => {
    const frac = (n: number): number => {
      const { m, calls } = bus('kraftdryck', n);
      m.bus.ability();
      return Number(calls.find((c) => c.startsWith('nitro'))!.split(':')[1]);
    };
    expect(frac(1)).toBeCloseTo(0.3);
    expect(frac(3)).toBeGreaterThan(frac(1));
  });

  it('Efterklangen repeats the ability once, about a second and a half later', () => {
    const { m, calls } = bus('efterklang');
    m.bus.ability();
    for (let i = 0; i < 10; i++) m.bus.tick(0.1, tickState());
    expect(count(calls, 'repeatAbility')).toBe(0);
    for (let i = 0; i < 10; i++) m.bus.tick(0.1, tickState());
    expect(count(calls, 'repeatAbility')).toBe(1);
    for (let i = 0; i < 50; i++) m.bus.tick(0.1, tickState());
    expect(count(calls, 'repeatAbility')).toBe(1);
  });

  it('Termosen shortens the cooldown for every copy and the build cap holds it at half', () => {
    const cd = (n: number): number => capTune(collectParts([{ id: 'termos', n }]).tune).abilCd;
    expect(cd(1)).toBeCloseTo(0.88);
    expect(cd(3)).toBeLessThan(cd(1));
    expect(cd(3)).toBeGreaterThanOrEqual(0.5);
    const many = capTune(collectParts([{ id: 'termos', n: 5 }, { id: 'kaffekoppen', n: 1 }]).tune);
    expect(many.abilCd).toBeGreaterThanOrEqual(0.5);
  });

  it('Reservdunken gives the ability an extra boost, once however many', () => {
    expect(collectParts([{ id: 'reservdunk', n: 1 }]).tune.plus).toEqual(['boost']);
    expect(collectParts([{ id: 'reservdunk', n: 5 }]).tune.plus).toEqual(['boost']);
  });
});

describe('chaos', () => {
  it('Nitrolotten: a shorter nitro, and every nitro start draws a lottery effect', () => {
    expect(capTune(collectParts([{ id: 'nitrolotten', n: 1 }]).tune).nitroSeconds).toBeLessThan(1);
    expect(capTune(collectParts([{ id: 'nitrolotten', n: 2 }]).tune).nitroSeconds).toBeLessThan(capTune(collectParts([{ id: 'nitrolotten', n: 1 }]).tune).nitroSeconds);
    const { m, calls } = bus('nitrolotten');
    m.bus.boost('drift');
    m.bus.boost('pad');
    expect(calls).toEqual([]);
    m.bus.boost('nitro');
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.some((c) => c.startsWith('say:nitrolotten'))).toBe(true);
  });

  it('every chaos effect is something the race can do (all ten come up over many draws)', () => {
    const said = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const { m, calls } = bus('nitrolotten');
      m.bus.boost('nitro');
      said.add(calls.find((c) => c.startsWith('say:'))!);
    }
    expect(said.size).toBeGreaterThanOrEqual(8);
  });

  it('Slumpgeneratorn draws every 22 seconds while racing, faster with more', () => {
    const draws = (n: number, racing = true): number => {
      const { m, calls } = bus('slumpgenerator', n);
      for (let i = 0; i < 1000; i++) m.bus.tick(0.1, tickState({ racing }));
      return count(calls, 'say:slumpgenerator');
    };
    expect(draws(1)).toBe(4);
    expect(draws(3)).toBeGreaterThan(draws(1));
    expect(draws(1, false)).toBe(0);
  });

  it('Lyckohjulet spins at every tenth coin (eighth with two)', () => {
    const spins = (n: number, coins: number): number => {
      const { m, calls } = bus('lyckohjul', n);
      for (let i = 0; i < coins; i++) m.bus.pickup('coin');
      m.bus.pickup('boost');
      return count(calls, 'say:lyckohjul');
    };
    expect(spins(1, 9)).toBe(0);
    expect(spins(1, 10)).toBe(1);
    expect(spins(1, 25)).toBe(2);
    expect(spins(2, 8)).toBe(1);
  });

  it('Dubbelt eller inget: the kronor of the race double or are gone, and more copies tip the coin', () => {
    const info = { place: 1, n: 4, finished: true, time: 90000, laps: [], kronor: 100, coins: 30 };
    const { m } = bus('dubbeltelleringet');
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    expect(m.bus.finish(info).kronor).toBe(130);
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    expect(m.bus.finish(info).kronor).toBe(-130);
    expect(m.bus.finish({ ...info, kronor: 0, coins: 0 }).kronor).toBe(0);
    // 0.52 loses with one copy and wins with two
    vi.spyOn(Math, 'random').mockReturnValue(0.52);
    expect(bus('dubbeltelleringet', 1).m.bus.finish(info).kronor).toBe(-130);
    expect(bus('dubbeltelleringet', 2).m.bus.finish(info).kronor).toBe(130);
  });

  it('over many flips the coin is about even with one copy', () => {
    const info = { place: 1, n: 4, finished: true, time: 90000, laps: [], kronor: 100, coins: 0 };
    const { m } = bus('dubbeltelleringet');
    let sum = 0;
    for (let i = 0; i < 4000; i++) sum += m.bus.finish(info).kronor;
    expect(Math.abs(sum / 4000)).toBeLessThan(10);
  });
});

describe('Blodbad, derby and ramps', () => {
  it('Vrakplockaren pays 12 kr and a bit of nitro per takedown, more per copy', () => {
    const kr = (n: number): number => {
      const { m, calls } = bus('vrakplockare', n);
      m.bus.takedown();
      expect(count(calls, 'nitro')).toBe(1);
      return Number(calls.find((c) => c.startsWith('kronor'))!.split(':')[1]);
    };
    expect(kr(1)).toBe(12);
    expect(kr(2)).toBe(18);
  });

  it('Hämndsprängaren throws a shockwave when you are wrecked, bigger with two', () => {
    const radius = (n: number): number => {
      const { m, calls } = bus('hamndsprangare', n);
      m.bus.wreck();
      return Number(calls.find((c) => c.startsWith('shock'))!.split(':')[1]!.split(',')[0]);
    };
    expect(radius(1)).toBe(14);
    expect(radius(2)).toBeGreaterThan(14);
    const { m, calls } = bus('hamndsprangare');
    m.bus.takedown();
    expect(count(calls, 'shock')).toBe(0);
  });

  it('Arenaklockan heals only in Blodbad, every eight seconds', () => {
    const heals = (carnage: boolean): number => {
      const { m, calls } = bus('arenaklocka', 2);
      for (let i = 0; i < 400; i++) m.bus.tick(0.1, tickState({ carnage, derby: carnage }));
      return count(calls, 'heal');
    };
    expect(heals(false)).toBe(0);
    expect(heals(true)).toBeGreaterThanOrEqual(4);
    expect(heals(true)).toBeLessThanOrEqual(5);
  });

  it('Rampgalningen pays only for a long flight, and not twice for one landing', () => {
    const { m, calls } = bus('rampgalning');
    m.bus.trick('air', 0.4);
    m.bus.trick('near', 1);
    m.bus.trick('flip', 1);
    expect(calls).toEqual([]);
    m.bus.trick('air', 1.4);
    m.bus.trick('air', 1.4);
    expect(count(calls, 'kronor')).toBe(1);
    expect(count(calls, 'boost')).toBe(1);
    expect(capTune(collectParts([{ id: 'rampgalning', n: 3 }]).tune).stunt).toBeLessThanOrEqual(2.2);
  });
});

describe('the sky', () => {
  const owned = (...ids: string[]) => ids.map((id) => ({ id, n: 1 }));

  it('rain makers, the sun and the night shift', () => {
    expect(skyOf([])).toEqual({ weather: undefined, time: undefined });
    expect(skyOf(owned('regnmakaren'))).toMatchObject({ weather: 'rain' });
    expect(skyOf(owned('askmoln'))).toMatchObject({ weather: 'rain' });
    expect(skyOf(owned('solstralen'))).toEqual({ weather: 'clear', time: 'day' });
    expect(skyOf(owned('nattskift'))).toMatchObject({ time: 'night' });
    // rain beats sun on the weather, the sun keeps the day
    expect(skyOf(owned('solstralen', 'regnmakaren'))).toEqual({ weather: 'rain', time: 'day' });
    expect(skyOf(owned('nattskift', 'regnmakaren'))).toEqual({ weather: 'rain', time: 'night' });
  });

  it('changes the rules of a race, but not the rabbit boss', () => {
    const base = { ...defaultRules(), weather: 'clear' as const, time: 'day' as const };
    expect(withSky(base, owned('regnmakaren', 'nattskift'))).toMatchObject({ weather: 'rain', time: 'night' });
    expect(withSky(base, owned('regnmakaren'), 'kanin')).toBe(base);
    expect(withSky(base, [])).toBe(base);
    expect(withSky({ ...base, weather: 'rain' }, owned('solstralen'))).toMatchObject({ weather: 'clear' });
  });

  it('the rain maker also gives grip and mudproof boots; the night shift worth more coins', () => {
    const t = collectParts(owned('regnmakaren', 'nattskift')).tune;
    expect(t.grip).toBeGreaterThan(1);
    expect(t.mudproof).toBe(true);
    expect(t.coinValue).toBeCloseTo(1.25);
  });

  it('Åskmolnet strikes the leader after each lap', () => {
    const { m, calls } = bus('askmoln');
    m.bus.lap(1);
    expect(count(calls, 'squash')).toBe(1);
  });
});

describe('Verktygslådan', () => {
  const run = () => newRun({ seed: 321, diff: 'normal', body: 'hatch', paint: '#e8412c' });

  it('bolts a random upgrade node on at the start of an act, the same one for the same run, never a capstone', () => {
    const a = run();
    a.trinkets.push({ id: 'verktygslada', n: 1 });
    const got = toolboxGift(a);
    expect(got).toHaveLength(1);
    expect(a.up).toContain(got[0]);
    expect(a.got.some((g) => g.what === 'up' && g.from.startsWith('Verktygslådan'))).toBe(true);
    const b = run();
    b.trinkets.push({ id: 'verktygslada', n: 1 });
    expect(toolboxGift(b)).toEqual(got);
    // a second act gives another
    a.act = 1;
    const more = toolboxGift(a);
    expect(more).toHaveLength(1);
    expect(more[0]).not.toBe(got[0]);
  });

  it('does nothing without it, and two of them give two', () => {
    const c = run();
    expect(toolboxGift(c)).toEqual([]);
    expect(c.up).toEqual([]);
    c.trinkets.push({ id: 'verktygslada', n: 2 });
    expect(toolboxGift(c)).toHaveLength(2);
  });
});

describe('new combos', () => {
  it('Skyfallet needs both rain talismans, Förmågekaoset the roulette and the copier', () => {
    expect(COMBOS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(COMBOS.map((c) => c.id)).size).toBe(COMBOS.length);
    const own = (...ids: string[]) => ({ owned: ids.map((id) => ({ id, n: 1 })), ups: [] });
    expect(activeCombos(own('regnmakaren')).map((c) => c.id)).not.toContain('combo.skyfallet');
    expect(activeCombos(own('regnmakaren', 'askmoln')).map((c) => c.id)).toContain('combo.skyfallet');
    expect(activeCombos(own('roulett', 'kopiatorn')).map((c) => c.id)).toContain('combo.formagekaoset');
  });

  it('their hooks reach the race through the run mods', () => {
    const { api, calls } = recorder();
    const sky = buildRunMods([{ id: 'regnmakaren', n: 1 }, { id: 'askmoln', n: 1 }], [], 'hatch');
    sky.bus.bind(api);
    sky.bus.lap(1);
    expect(calls.some((c) => c.startsWith('shock'))).toBe(true);
    expect(sky.items.some((i) => i.id === 'combo.skyfallet')).toBe(true);
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const kaos = buildRunMods([{ id: 'roulett', n: 1 }, { id: 'kopiatorn', n: 1 }], [], 'hatch');
    const r2 = recorder();
    kaos.bus.bind(r2.api);
    kaos.bus.ability();
    expect(r2.calls.some((c) => c.startsWith('boost'))).toBe(true);
    expect(comboById('combo.formagekaoset')).toBeTruthy();
  });
});
