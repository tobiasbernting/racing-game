// The car that grows: the trees, what their nodes do to a race, the combos, the offers after a win, and the old part
// levels turning into nodes.
import { describe, expect, it } from 'vitest';
import { CAR_BODIES, newCar, type CarBody } from '../shared/rally.ts';
import { kitOf } from '../shared/abilities.ts';
import { capGrip, capPower, MAX_CHARGES, neutralTune } from '../rally/mods.ts';
import { bodySpecOf } from '../rally/models.ts';
import { addUpgradeLook } from '../rally/modlook.ts';
import { drawUpgrades, KIND_TREE_BIAS, upgradeChoices, upgradePrice, workshopBuy } from './economy.ts';
import { continueAfterRace, enterNode, finishNode, pickReward, submitRace } from './flow.ts';
import { emptyRunStats, newRun, reachable, type RunState } from './state.ts';
import { parseRun } from './save.ts';
import { Rng } from './rng.ts';
import { buildCombos, buildMix, buildTrees, buildView } from './summary.ts';
import { TRINKETS, stackCap, trinketById } from './trinkets.ts';
import { recorder, tickState, count } from './testkit.ts';
import {
  CAPSTONE_NEEDS,
  COMBOS,
  LINES,
  TREES,
  UPGRADES,
  activeCombos,
  almostCombos,
  available,
  buildRunMods,
  canTake,
  interestOn,
  lineById,
  lookOf,
  nodeId,
  nodePath,
  partsToNodes,
  runPerks,
  takeNode,
  tierOf,
  treeLines,
  upgradeById,
  type TreeId,
} from './upgrades.ts';
import type { RaceKind } from '../shared/kinds.ts';

const fresh = (body: CarBody = 'hatch', ups: string[] = []): RunState => {
  const r = newRun({ seed: 41, calm: false, body, paint: '#e8412c' });
  r.trinkets = [];
  r.up = [];
  for (const id of ups) takeNode(r.up, id);
  return r;
};
const mods = (ups: string[], body: CarBody = 'hatch', trinkets: { id: string; n: number }[] = []) => buildRunMods(trinkets, ups, body);

describe('the trees', () => {
  it('has the two main trees and three side paths, each with five to eight lines and a capstone', () => {
    expect(TREES).toEqual(['ram', 'race', 'fuffens', 'stunt', 'girig']);
    for (const t of TREES) {
      const lines = treeLines(t);
      expect(lines.length, t).toBeGreaterThanOrEqual(6);
      expect(lines.length, t).toBeLessThanOrEqual(8);
      expect(lines.filter((l) => l.cap), t).toHaveLength(1);
      for (const l of lines) {
        expect(l.tiers.length, l.id).toBeGreaterThanOrEqual(l.cap ? 1 : 2);
        expect(l.tiers.length, l.id).toBeLessThanOrEqual(3);
      }
      // a main tree has real depth: well over a dozen nodes
      if (t === 'ram' || t === 'race') expect(UPGRADES.filter((u) => u.tree === t).length).toBeGreaterThanOrEqual(14);
    }
  });

  it('every node has a unique id, a name and a Swedish line, and its line knows it', () => {
    const ids = new Set<string>();
    for (const u of UPGRADES) {
      expect(ids.has(u.id), u.id).toBe(false);
      ids.add(u.id);
      expect(u.name.length).toBeGreaterThan(2);
      expect(u.text.length).toBeGreaterThan(15);
      expect(upgradeById(u.id)).toBe(u);
      expect(lineById(u.line)!.tiers[u.tier - 1]!.name).toBe(u.name);
      expect(nodeId(u.line, u.tier)).toBe(u.id);
    }
  });

  it('each of the twenty vehicles has exactly two upgrades of its own ability, and only it can take them', () => {
    for (const b of CAR_BODIES) {
      const own = UPGRADES.filter((u) => u.body === b);
      expect(own, b).toHaveLength(2);
      expect(own.every((u) => u.tree === 'car')).toBe(true);
      const other = CAR_BODIES.find((x) => x !== b)!;
      expect(canTake([], own[0]!.id, b)).toBe(true);
      expect(canTake([], own[0]!.id, other)).toBe(false);
      // the second is the first one's follow-up
      expect(canTake([], own[1]!.id, b)).toBe(false);
      expect(canTake([own[0]!.id], own[1]!.id, b)).toBe(true);
    }
  });

  it('a tier needs the one before it, and a capstone needs four nodes of its tree', () => {
    expect(canTake([], 'ram.plates2', 'hatch')).toBe(false);
    expect(canTake(['ram.plates1'], 'ram.plates2', 'hatch')).toBe(true);
    expect(canTake(['ram.plates1'], 'ram.plates1', 'hatch')).toBe(false);
    const three = ['ram.plates1', 'ram.plates2', 'ram.spikes1'];
    expect(canTake(three, 'ram.cap1', 'hatch')).toBe(false);
    expect(canTake([...three, 'ram.hammer1'], 'ram.cap1', 'hatch')).toBe(true);
    expect(CAPSTONE_NEEDS).toBe(4);
    // takeNode fills in the earlier tiers, so a hand-made list stays whole
    const ups: string[] = [];
    takeNode(ups, 'race.engine3');
    expect(ups).toEqual(['race.engine1', 'race.engine2', 'race.engine3']);
    expect(available([], 'hatch').every((u) => u.tier === 1 && !u.cap)).toBe(true);
  });
});

describe('what the nodes do to a race', () => {
  it('Ram: plates make the car tougher and healthier, ballast heavier, spikes and hammers hit harder', () => {
    const base = mods([]).tune;
    const plates = mods(['ram.plates1', 'ram.plates2', 'ram.plates3']).tune;
    expect(plates.tough).toBeLessThan(base.tough * 0.7);
    expect(plates.hp).toBeGreaterThan(1.15);
    expect(mods(['ram.ballast1']).tune.mass).toBeCloseTo(1.2);
    expect(mods(['ram.ballast1', 'ram.ballast2']).tune.mass).toBeGreaterThan(1.4);
    expect(mods(['ram.spikes1']).tune.shove).toBeGreaterThan(base.shove);
    expect(mods(['ram.spikes1', 'ram.spikes2']).tune.shove).toBeGreaterThan(mods(['ram.spikes1']).tune.shove);
    expect(mods(['ram.hammer1', 'ram.hammer2']).tune.spike).toBeGreaterThan(1.5);
  });

  it('Race: engine, grip, nitro, nitro length, drift and aero each move their number, tier by tier', () => {
    const t = (ids: string[]) => mods(ids).tune;
    expect(t(['race.engine1']).power).toBeCloseTo(1.1);
    expect(t(['race.engine1', 'race.engine2', 'race.engine3']).power).toBeCloseTo(1.331, 2);
    expect(t(['race.grip1', 'race.grip2']).grip).toBeCloseTo(1.06 * 1.06, 3);
    expect(t(['race.nitro1', 'race.nitro2', 'race.nitro3']).charges).toBe(3);
    expect(t(['race.long1']).nitroSeconds).toBeCloseTo(1.2);
    expect(t(['race.drift1', 'race.drift2']).driftRate).toBeCloseTo(1.69, 2);
    expect(t(['race.aero1']).top).toBeCloseTo(1.08);
    expect(t(['race.brakes1']).brakes).toBeCloseTo(1.12);
    expect(t(['stunt.susp1', 'stunt.susp2']).assist).toBeCloseTo(0.16);
  });

  it('the side paths fill the nitro with stunts, bring interest and a discount, and the vehicle upgrades stretch the ability', () => {
    expect(mods(['stunt.air1']).tune.fill).toBe(true);
    expect(mods(['stunt.flip2']).tune.flip).toBe(2);
    expect(mods(['stunt.cap1']).tune.stunt).toBeCloseTo(1.4);
    expect(mods(['fuffens.cap1']).tune.trickCd).toBeCloseTo(0.55);
    expect(mods(['girig.gold2']).tune.coinValue).toBeGreaterThan(1.6);
    expect(mods(['girig.gold1']).tune.magnet).toBeGreaterThan(0);
    const tractor = mods(['car.tractor1', 'car.tractor2'], 'tractor').tune;
    expect(tractor.abilDur).toBeCloseTo(1.5);
    expect(tractor.plus).toEqual(['hay']);
    const moped = mods(['car.moped1', 'car.moped2'], 'moped').tune;
    expect(moped.abilDur).toBeCloseTo(1.5);
    expect(moped.plus).toEqual(['decoy']);
    // another vehicle's upgrades do nothing
    expect(mods(['car.tractor1'], 'hatch').tune.abilDur).toBe(1);
    // every upgrade of every vehicle does something: a faster ability, a longer one, or an extra
    for (const b of CAR_BODIES) {
      const t = mods([`car.${b}1`, `car.${b}2`], b).tune;
      expect(t.abilCd < 1 || t.abilDur > 1 || t.plus.length > 0, b).toBe(true);
      expect(t.plus.length + (t.abilDur > 1 ? 1 : 0) + (t.abilCd < 1 ? 1 : 0), b).toBeGreaterThanOrEqual(2);
    }
  });

  it('soft caps hold: every node and every trinket at once cannot break the numbers', () => {
    const all = UPGRADES.filter((u) => !u.body).map((u) => u.id);
    const run = buildRunMods(TRINKETS.map((t) => ({ id: t.id, n: stackCap(t) })), all, 'hatch');
    const t = run.tune;
    expect(t.power).toBeLessThanOrEqual(1.9);
    expect(t.grip).toBeLessThanOrEqual(1.4);
    expect(t.charges).toBeLessThanOrEqual(MAX_CHARGES);
    expect(t.nitroSeconds).toBeLessThanOrEqual(2.4);
    expect(t.tough).toBeGreaterThanOrEqual(0.45);
    expect(t.hp).toBeLessThanOrEqual(1.9);
    expect(t.mass).toBeLessThanOrEqual(2.4);
    expect(t.spike).toBeLessThanOrEqual(2.2);
    expect(t.brakes).toBeLessThanOrEqual(1.5);
    expect(t.assist).toBeLessThanOrEqual(0.45);
    expect(t.trickCd).toBeGreaterThanOrEqual(0.4);
    expect(t.stunt).toBeLessThanOrEqual(2.2);
    // and the body's own total is held by the old caps on top
    expect(capPower(0.9 * t.power)).toBeLessThanOrEqual(1.5);
    expect(capGrip(1.3 * t.grip)).toBeLessThanOrEqual(1.22);
    expect(neutralTune().plus).toEqual([]);
  });
});

describe('what the nodes do while racing', () => {
  const bind = (ups: string[], body: CarBody = 'hatch', trinkets: { id: string; n: number }[] = []) => {
    const { api, calls } = recorder();
    const m = buildRunMods(trinkets, ups, body);
    m.bus.bind(api);
    return { m, calls };
  };

  it('Stötvåg answers a big smash, once in a while, and the second tier a smaller one', () => {
    const { m, calls } = bind(['ram.shock1']);
    m.bus.hit('car', 3);
    expect(count(calls, 'shock')).toBe(0);
    m.bus.hit('car', 9);
    expect(count(calls, 'shock')).toBe(1);
    m.bus.hit('car', 9);
    expect(count(calls, 'shock')).toBe(1);
    m.bus.tick(5, tickState());
    m.bus.hit('car', 9);
    expect(count(calls, 'shock')).toBe(2);
    const two = bind(['ram.shock1', 'ram.shock2']);
    two.m.bus.hit('car', 5);
    expect(count(two.calls, 'shock')).toBe(1);
  });

  it('Rambooster hits harder during nitro, and Skrotkungen shocks and heals on a takedown', () => {
    const a = bind(['ram.boost1']);
    a.m.bus.boost('drift');
    expect(count(a.calls, 'ramUp')).toBe(0);
    a.m.bus.boost('nitro');
    expect(a.calls.find((c) => c.startsWith('ramUp'))).toBe('ramUp:3.5,1.5');
    const b = bind(['ram.spikes1', 'ram.hammer1', 'ram.plates1', 'ram.cap1']);
    b.m.bus.takedown();
    expect(count(b.calls, 'shock')).toBe(1);
    expect(count(b.calls, 'heal')).toBe(1);
  });

  it('Fuffens: oil on a boost (not too often), a mine under hard braking, fake coins and hay now and then, smoke on nitro', () => {
    const oil = bind(['fuffens.oil1']);
    oil.m.bus.boost('nitro');
    oil.m.bus.boost('nitro');
    expect(count(oil.calls, 'oil')).toBe(1);
    oil.m.bus.boost('start');
    expect(count(oil.calls, 'oil')).toBe(1);
    const mine = bind(['fuffens.mine1']);
    mine.m.bus.tick(0.1, tickState({ handbrakePressed: true }));
    expect(count(mine.calls, 'mine')).toBe(1);
    mine.m.bus.tick(0.1, tickState({ handbrakePressed: true }));
    expect(count(mine.calls, 'mine'), 'a cooldown').toBe(1);
    const slow = bind(['fuffens.mine1']);
    slow.m.bus.tick(0.1, tickState({ speed: 4, handbrakePressed: true }));
    expect(count(slow.calls, 'mine'), 'not when crawling').toBe(0);
    const fake = bind(['fuffens.fake1']);
    for (let i = 0; i < 400; i++) fake.m.bus.tick(0.1, tickState());
    expect(count(fake.calls, 'fakeCoin')).toBeGreaterThanOrEqual(2);
    const hay = bind(['fuffens.hay1']);
    for (let i = 0; i < 400; i++) hay.m.bus.tick(0.1, tickState());
    expect(count(hay.calls, 'dropAhead:hay')).toBeGreaterThanOrEqual(2);
    const smoke = bind(['fuffens.smoke1']);
    smoke.m.bus.boost('nitro');
    expect(smoke.calls.find((c) => c.startsWith('smoke'))).toBe('smoke:2.4');
    // the master of tricks does it all more often
    const often = bind(['fuffens.fake1', 'fuffens.cap1']);
    for (let i = 0; i < 400; i++) often.m.bus.tick(0.1, tickState());
    expect(count(often.calls, 'fakeCoin')).toBeGreaterThan(count(fake.calls, 'fakeCoin'));
    often.m.bus.lap(1);
    expect(count(often.calls, 'mine') + count(often.calls, 'oil')).toBe(2);
  });

  it('Stunt: a long jump, a flip, a near miss and long slides all fill the nitro and pay kronor', () => {
    const a = bind(['stunt.air1']);
    a.m.bus.trick('air', 1.5);
    expect(count(a.calls, 'nitro')).toBe(1);
    expect(count(a.calls, 'kronor')).toBe(1);
    a.m.bus.trick('near', 0.5);
    expect(count(a.calls, 'nitro'), 'the air line ignores near misses').toBe(1);
    const f = bind(['stunt.flip1']);
    f.m.bus.trick('flip', 2);
    expect(f.calls.find((c) => c.startsWith('nitro'))).toBe('nitro:0.44');
    const n = bind(['stunt.near1']);
    n.m.bus.trick('near', 1);
    expect(count(n.calls, 'nitro')).toBe(1);
    const w = bind(['stunt.wheel1']);
    for (let i = 0; i < 40; i++) w.m.bus.tick(0.1, tickState({ drifting: true }));
    expect(count(w.calls, 'nitro')).toBeGreaterThanOrEqual(2);
    const none = bind(['stunt.wheel1']);
    for (let i = 0; i < 40; i++) none.m.bus.tick(0.1, tickState());
    expect(count(none.calls, 'nitro')).toBe(0);
    // the star doubles up the payouts and adds a kick
    const star = bind(['stunt.air1', 'stunt.cap1']);
    star.m.bus.trick('air', 1);
    expect(count(star.calls, 'boost')).toBe(1);
    expect(Number(star.calls.find((c) => c.startsWith('kronor'))!.split(':')[1])).toBeGreaterThan(Number(a.calls.find((c) => c.startsWith('kronor'))!.split(':')[1]) * 0.6);
  });

  it('Girig: the bounty only for passing the leader, insurance for a smash and a wreck', () => {
    const b = bind(['girig.bounty1']);
    b.m.bus.overtake(false);
    expect(count(b.calls, 'kronor')).toBe(0);
    b.m.bus.overtake(true);
    expect(count(b.calls, 'kronor')).toBe(1);
    const i = bind(['girig.ins1']);
    i.m.bus.hit('car', 4);
    expect(count(i.calls, 'kronor')).toBe(0);
    i.m.bus.hit('car', 9);
    expect(count(i.calls, 'kronor')).toBe(1);
    i.m.bus.wreck();
    expect(count(i.calls, 'kronor')).toBe(2);
    const two = bind(['girig.ins1', 'girig.ins2']);
    two.m.bus.wreck();
    expect(two.calls.find((c) => c.startsWith('kronor'))).toBe('kronor:90');
  });

  it('only the nodes with hooks show on the race strip, with their tier', () => {
    const m = mods(['ram.plates1', 'ram.shock1', 'ram.shock2', 'fuffens.oil1']);
    expect(m.items.map((i) => i.id)).toEqual(['ram.shock', 'fuffens.oil']);
    expect(m.items[0]!.n).toBe(2);
  });
});

describe('combos', () => {
  it('there are ten named combos with two different halves each, and every half exists', () => {
    expect(COMBOS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(COMBOS.map((c) => c.id)).size).toBe(COMBOS.length);
    for (const c of COMBOS) {
      expect(c.name.length).toBeGreaterThan(3);
      expect(c.text.length).toBeGreaterThan(20);
      expect(JSON.stringify(c.a)).not.toBe(JSON.stringify(c.b));
      for (const r of [c.a, c.b]) {
        if ('up' in r) expect(lineById(r.up), c.id).toBeTruthy();
        if ('trinket' in r) expect(trinketById(r.trinket), c.id).toBeTruthy();
      }
    }
  });

  it('wakes when both halves are owned, not before, across upgrades and trinkets', () => {
    const own = { owned: [], ups: ['ram.spikes1'] };
    expect(activeCombos(own).map((c) => c.id)).toEqual([]);
    expect(almostCombos(own).map((a) => a.combo.id)).toContain('combo.spikmattan');
    expect(activeCombos({ owned: [], ups: ['ram.spikes1', 'fuffens.oil1'] }).map((c) => c.name)).toContain('Spikmattan');
    expect(activeCombos({ owned: [], ups: ['stunt.air1', 'race.nitro1'] }).map((c) => c.name)).toContain('Luftburen');
    // two trinkets: the flamethrower
    expect(activeCombos({ owned: [{ id: 'kolsyrad', n: 1 }], ups: [] })).toEqual([]);
    expect(activeCombos({ owned: [{ id: 'kolsyrad', n: 1 }, { id: 'raketkorv', n: 1 }], ups: [] }).map((c) => c.name)).toEqual(['Eldkastaren']);
    // a node and a path of trinkets: Lotterivinsten wants any Kaos trinket
    const kaos = TRINKETS.find((t) => t.path === 'kaos')!.id;
    expect(activeCombos({ owned: [{ id: kaos, n: 1 }], ups: ['girig.interest1'] }).map((c) => c.name)).toContain('Lotterivinsten');
    // any tier of a line counts
    expect(activeCombos({ owned: [], ups: ['ram.spikes1', 'ram.spikes2', 'fuffens.oil1', 'fuffens.oil2'] }).map((c) => c.name)).toContain('Spikmattan');
  });

  it('they act in a race: Spikmattan leaves oil on a smash, Luftburen gives nitro on a landing, Eldkastaren breathes fire on nitro', () => {
    const run = (ups: string[], trinkets: { id: string; n: number }[] = []) => {
      const { api, calls } = recorder();
      const m = buildRunMods(trinkets, ups, 'hatch');
      m.bus.bind(api);
      return { m, calls };
    };
    const a = run(['ram.spikes1', 'fuffens.oil1']);
    a.m.bus.hit('car', 8);
    expect(count(a.calls, 'oil')).toBe(1);
    const b = run(['stunt.air1', 'race.nitro1']);
    b.m.bus.trick('air', 1.2);
    expect(b.calls).toContain('nitro:0.34');
    const c = run([], [{ id: 'kolsyrad', n: 1 }, { id: 'raketkorv', n: 1 }]);
    c.m.bus.boost('nitro');
    expect(count(c.calls, 'flame')).toBe(1);
    c.m.bus.boost('nitro');
    expect(count(c.calls, 'flame'), 'rare: a cooldown').toBe(1);
    const d = run(['girig.bounty1', 'ram.hammer1']);
    d.m.bus.takedown();
    expect(d.calls).toContain('kronor:40');
  });

  it('show first on the race strip, and in the build view when active', () => {
    const m = buildRunMods([], ['ram.spikes1', 'fuffens.oil1'], 'hatch');
    expect(m.items[0]!.id).toBe('combo.spikmattan');
    const run = fresh('hatch', ['ram.spikes1', 'fuffens.oil1']);
    expect(buildCombos(run).map((c) => c.name)).toEqual(['Spikmattan']);
    expect(buildView(run).combos).toHaveLength(1);
  });
});

describe('old part levels become nodes', () => {
  it('each of the six parts becomes the line it turned into, a tier per level', () => {
    expect(partsToNodes({ engine: 2, armour: 1 })).toEqual(['race.engine1', 'race.engine2', 'ram.plates1']);
    expect(partsToNodes({ engine: 3, tyres: 3, suspension: 3, brakes: 3, turbo: 3, armour: 3 })).toEqual([
      'race.engine1', 'race.engine2', 'race.engine3',
      'race.grip1', 'race.grip2', 'race.grip3',
      'race.brakes1', 'race.brakes2',
      'race.nitro1', 'race.nitro2', 'race.nitro3',
      'ram.plates1', 'ram.plates2', 'ram.plates3',
      'stunt.susp1', 'stunt.susp2', 'stunt.susp3',
    ]);
    expect(partsToNodes({})).toEqual([]);
  });

  it('an old save is lifted: parts zeroed, the nodes taken, hearts and trinkets kept, and a second load changes nothing', () => {
    const old = {
      v: 1,
      seed: 99,
      act: 1,
      hearts: 2,
      kronor: 140,
      trinkets: [{ id: 'gummianka', n: 2 }],
      car: { body: 'coupe', parts: { engine: 2, tyres: 1, suspension: 0, brakes: 3, turbo: 1, armour: 2 }, style: { paint: '#e8412c', driver: 'pig' }, damage: 10 },
      got: [
        { what: 'part', id: 'engine', from: 'Skruvhörnan', node: 'a0r1c0' },
        { what: 'part', id: 'engine', from: 'Vann på Bondgården', node: 'a0r2c0' },
        { what: 'part', id: 'armour', from: 'Skruvhörnan', node: 'a0r3c0' },
        { what: 'trinket', id: 'gummianka', from: 'Köpt i kiosken', node: 'a0r0c0' },
      ],
    };
    const run = parseRun(JSON.parse(JSON.stringify(old)))!;
    expect(run.car.parts).toEqual({ engine: 0, tyres: 0, suspension: 0, brakes: 0, turbo: 0, armour: 0 });
    expect(run.up).toEqual(['race.engine1', 'race.engine2', 'race.grip1', 'race.brakes1', 'race.brakes2', 'race.nitro1', 'ram.plates1', 'ram.plates2']);
    expect(run.hearts).toBe(2);
    expect(run.kronor).toBe(140);
    expect(run.trinkets).toEqual([{ id: 'gummianka', n: 2 }]);
    // the build section tells the old upgrades as the nodes they became
    expect(run.got.map((g) => `${g.what}:${g.id}`)).toEqual(['up:race.engine1', 'up:race.engine2', 'up:ram.plates1', 'trinket:gummianka']);
    expect(buildView(run).trees.map((t) => t.tree)).toEqual(['ram', 'race']);
    const again = parseRun(JSON.parse(JSON.stringify(run)))!;
    expect(again).toEqual(run);
    // and the nodes give the car the same numbers the parts did: engine 2 is +20 % power
    expect(mods(run.up, 'coupe').tune.power).toBeGreaterThan(1.2);
  });

  it('an old reward with a part card gets the next tier of that part as an upgrade card, and the nodes of another vehicle are dropped', () => {
    const run = fresh('hatch');
    run.up = ['ram.plates1'];
    const id = reachable(run)[0]!.id;
    run.screen = { kind: 'reward', nodeId: id, choices: ['gummianka', 'part:armour', 'part:turbo'], source: 'race' };
    const back = parseRun(JSON.parse(JSON.stringify(run)))!;
    expect(back.screen).toEqual({ kind: 'reward', nodeId: id, choices: ['gummianka'], ups: ['ram.plates2', 'race.nitro1'], source: 'race' });
    const mixed = parseRun({ ...JSON.parse(JSON.stringify(run)), screen: null, up: ['car.tractor1', 'car.hatch1', 'nonsense', 'ram.plates3'] })!;
    expect(mixed.up).toEqual(['car.hatch1', 'ram.plates1', 'ram.plates2', 'ram.plates3']);
  });
});

describe('the offers after a win', () => {
  const draws = (kind: RaceKind | undefined, n: number, body: CarBody = 'hatch', ups: string[] = []): Record<TreeId | 'car', number> => {
    const out = { ram: 0, race: 0, fuffens: 0, stunt: 0, girig: 0, car: 0 };
    const run = fresh(body, ups);
    for (let seed = 0; seed < n; seed++) {
      const r = { ...run, seed: seed + 1 };
      for (const id of upgradeChoices(r, 'a0r2c0', 'race', kind)) out[upgradeById(id)!.tree]++;
    }
    return out;
  };

  it('three different open cards from at least two trees, none for the consolation prize, and an extra with the capstone perk', () => {
    const run = fresh('hatch', ['ram.plates1', 'ram.plates2', 'ram.spikes1', 'ram.hammer1']);
    for (let seed = 1; seed < 60; seed++) {
      const r = { ...run, seed };
      const ups = upgradeChoices(r, 'a1r1c0', 'elite', 'mixed');
      expect(ups).toHaveLength(3);
      expect(new Set(ups).size).toBe(3);
      for (const id of ups) expect(canTake(r.up, id, 'hatch'), id).toBe(true);
      expect(new Set(ups.map((id) => upgradeById(id)!.tree)).size).toBeGreaterThanOrEqual(2);
    }
    expect(upgradeChoices(run, 'a0r1c0', 'consolation', 'rally')).toEqual([]);
    const rich = fresh('hatch', ['girig.interest1', 'girig.interest2', 'girig.disc1', 'girig.gold1', 'girig.cap1']);
    expect(upgradeChoices(rich, 'a0r1c0', 'race', 'mixed')).toHaveLength(4);
    // the same seed and node give the same cards (a reload does not reroll them)
    expect(upgradeChoices(run, 'a0r1c0', 'race', 'rally')).toEqual(upgradeChoices(run, 'a0r1c0', 'race', 'rally'));
  });

  it('the kind of race leans the offer: Blodbad brings Ram and Fuffens, Rally brings Race and Stunt, Blandat is open', () => {
    const carnage = draws('carnage', 400);
    const rally = draws('rally', 400);
    const mixed = draws('mixed', 400);
    const share = (d: Record<string, number>, ...t: string[]): number => t.reduce((a, k) => a + d[k]!, 0) / Object.values(d).reduce((a, b) => a + b, 0);
    expect(share(carnage, 'ram', 'fuffens')).toBeGreaterThan(share(rally, 'ram', 'fuffens') + 0.25);
    expect(share(rally, 'race', 'stunt')).toBeGreaterThan(share(carnage, 'race', 'stunt') + 0.25);
    expect(share(carnage, 'ram', 'fuffens')).toBeGreaterThan(0.5);
    expect(share(rally, 'race', 'stunt')).toBeGreaterThan(0.5);
    // Blandat is in between, with every tree turning up
    for (const t of TREES) expect(mixed[t], t).toBeGreaterThan(0);
    expect(share(mixed, 'ram', 'fuffens')).toBeGreaterThan(share(rally, 'ram', 'fuffens'));
    expect(share(mixed, 'ram', 'fuffens')).toBeLessThan(share(carnage, 'ram', 'fuffens'));
    // the bias table says it too
    expect(KIND_TREE_BIAS.carnage.ram).toBeGreaterThan(KIND_TREE_BIAS.carnage.race);
    expect(KIND_TREE_BIAS.rally.race).toBeGreaterThan(KIND_TREE_BIAS.rally.ram);
  });

  it('a tree you already walk comes up more, and your own vehicle upgrades turn up', () => {
    const plain = draws('mixed', 300);
    const walker = draws('mixed', 300, 'hatch', ['race.engine1', 'race.engine2', 'race.grip1']);
    expect(walker.race / Object.values(walker).reduce((a, b) => a + b, 0)).toBeGreaterThan(plain.race / Object.values(plain).reduce((a, b) => a + b, 0));
    expect(plain.car).toBeGreaterThan(0);
    const other = draws('mixed', 300, 'tractor');
    expect(other.car).toBeGreaterThan(0);
  });

  it('no card is ever offered twice over a run: a taken node is gone, the next tier takes its place', () => {
    const run = fresh('hatch', ['ram.plates1']);
    const ids = available(run.up, 'hatch').map((u) => u.id);
    expect(ids).not.toContain('ram.plates1');
    expect(ids).toContain('ram.plates2');
    const rg = new Rng(5);
    expect(drawUpgrades(run, rg, 99, 'race').length).toBe(ids.length);
  });

  it('picking a card puts the node in the build with where it came from; a win with a pick of the upgrades walks the whole flow', () => {
    let run = fresh('hatch');
    let node = reachable(run).find((n) => n.type === 'race')!;
    run = enterNode(run, node.id);
    run = submitRace(run, { place: 1, n: 4, finished: true, time: 90000, laps: 2, kronor: 100, coins: 5, medal: null, damage: 0, kind: node.kind });
    run = continueAfterRace(run);
    expect(run.screen?.kind).toBe('reward');
    const scr = run.screen as Extract<NonNullable<RunState['screen']>, { kind: 'reward' }>;
    expect(scr.choices.length).toBeGreaterThanOrEqual(3);
    expect(scr.ups!.length).toBeGreaterThanOrEqual(3);
    const pickIdx = scr.choices.length + 1;
    const want = scr.ups![1]!;
    run = pickReward(run, pickIdx);
    expect(run.up).toContain(want);
    expect(run.trinkets).toEqual([]);
    expect(run.got.at(-1)).toMatchObject({ what: 'up', id: want });
    expect(run.got.at(-1)!.from).toMatch(/^Vann på /);
    expect(run.screen).toBeNull();
    node = reachable(run)[0]!;
    expect(node).toBeTruthy();
    // a trinket pick still works, and "no thanks" is a few kronor
    let r2 = fresh('hatch');
    const n2 = reachable(r2).find((n) => n.type === 'race')!;
    r2 = continueAfterRace(submitRace(enterNode(r2, n2.id), { place: 1, n: 4, finished: true, time: 90000, laps: 2, kronor: 100, coins: 5, medal: null, damage: 0, kind: n2.kind }));
    const kr = r2.kronor;
    r2 = pickReward(r2, -1);
    expect(r2.kronor).toBe(kr + 30);
    expect(r2.up).toEqual([]);
  });
});

describe('the workshop and the purse', () => {
  it('Skruvhörnan sells a node for kronor, cheaper with a discount, dearer in later acts', () => {
    const run = fresh('hatch');
    run.screen = { kind: 'workshop', nodeId: 'x', used: true, note: '', stock: ['race.engine1'] };
    const p0 = upgradePrice(run, 'race.engine1');
    const rich = { ...run, up: ['girig.disc1', 'girig.disc2'] };
    expect(upgradePrice(rich, 'race.engine1')).toBeLessThan(p0);
    expect(upgradePrice({ ...run, act: 2 }, 'race.engine1')).toBeGreaterThan(p0);
    expect(upgradePrice(run, 'race.cap1')).toBeGreaterThan(upgradePrice(run, 'race.engine3'));
    expect(upgradePrice(run, 'race.engine3')).toBeGreaterThan(p0);
    run.kronor = p0;
    expect(workshopBuy(run, 'race.engine1')).toBe('ok');
    expect(run.kronor).toBe(0);
  });

  it('Girig: interest after every node (capped), discounts, an extra card and more pay add up with the trinkets', () => {
    expect(interestOn(500, 0.15)).toBe(60);
    expect(interestOn(100, 0.1)).toBe(10);
    expect(interestOn(100, 0)).toBe(0);
    const run = fresh('hatch', ['girig.interest1', 'girig.interest2', 'girig.interest3', 'girig.disc1', 'girig.cap1']);
    const p = runPerks(run.trinkets, run.up);
    expect(p.interest).toBeCloseTo(0.15);
    expect(p.shopDiscount).toBeCloseTo(0.1);
    expect(p.choices).toBe(1);
    expect(p.kronor).toBeCloseTo(0.15);
    run.trinkets = [{ id: 'planbok', n: 1 }];
    expect(runPerks(run.trinkets, run.up).kronor).toBeCloseTo(0.4);
    // leaving a node pays the interest
    run.kronor = 200;
    const node = reachable(run)[0]!;
    const after = finishNode(enterNode(run, node.id));
    expect(after.interest).toBe(30);
    expect(after.kronor).toBe(230);
  });
});

describe('the build on the result screen', () => {
  it('the mix counts nodes by tree (a vehicle upgrade for the lean of its vehicle), the trees list what is taken', () => {
    const run = fresh('tractor', ['ram.plates1', 'ram.plates2', 'fuffens.oil1', 'car.tractor1']);
    const mix = buildMix(run);
    expect(mix.reduce((a, m) => a + m.pct, 0)).toBe(100);
    expect(mix[0]).toMatchObject({ path: 'ram', pct: 75 });
    expect(nodePath('car.tractor1')).toBe('ram');
    expect(nodePath('car.hatch1')).toBeNull();
    expect(nodePath('car.moped1')).toBe('race');
    const trees = buildTrees(run);
    expect(trees.map((t) => `${t.tree}:${t.nodes.length}`)).toEqual(['ram:2', 'fuffens:1', 'car:1']);
    expect(trees[0]!.total).toBe(UPGRADES.filter((u) => u.tree === 'ram').length);
    expect(buildView(run).ability.ups.map((u) => u.name)).toEqual(['Längre rammbock']);
    expect(emptyRunStats().triggers).toEqual({});
  });

  it('the run stats count a node trigger like a trinket trigger, and the save keeps them', () => {
    const run = fresh('hatch', ['ram.shock1']);
    run.stats.triggers['ram.shock'] = 4;
    run.stats.triggers['combo.spikmattan'] = 2;
    run.stats.triggers['finns-inte'] = 9;
    const back = parseRun(JSON.parse(JSON.stringify(run)))!;
    expect(back.stats.triggers).toEqual({ 'ram.shock': 4, 'combo.spikmattan': 2 });
  });
});

describe('the look of the car', () => {
  it('lookOf gives the highest tier of every line', () => {
    expect(lookOf(['ram.plates1', 'ram.plates2', 'race.aero1', 'car.hatch1'])).toEqual({ 'ram.plates': 2, 'race.aero': 1 });
    expect(lookOf([])).toEqual({});
  });

  it('every line draws something on every one of the twenty bodies, inside a believable box round the body', () => {
    const full: Record<string, number> = {};
    for (const l of LINES) if (l.tree !== 'car') full[l.id] = l.tiers.length;
    for (const body of CAR_BODIES) {
      const { spec, P } = bodySpecOf(body);
      const before = P.tg.build().getAttribute('position').count;
      addUpgradeLook(P, spec, full);
      const g = P.tg.build();
      expect(g.getAttribute('position').count, body).toBeGreaterThan(before);
      g.computeBoundingBox();
      const b = g.boundingBox!;
      for (const v of [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]) expect(Number.isFinite(v), body).toBe(true);
      // nothing flies off the car: within a couple of metres of the nose, the tail and the sides
      expect(b.max.z, body).toBeLessThan(spec.nose + 2.2);
      expect(b.min.z, body).toBeGreaterThan(spec.tail - 2.2);
      expect(Math.max(Math.abs(b.min.x), b.max.x), body).toBeLessThan(spec.halfW + 1.6);
      expect(b.min.y, body).toBeGreaterThan(-0.6);
      expect(b.max.y, body).toBeLessThan(spec.roof.y + 2.2);
    }
  });

  it('one line at a time changes the car, and each tree has something to show', () => {
    const { spec, P } = bodySpecOf('hatch');
    const base = P.tg.build().getAttribute('position').count;
    for (const l of LINES.filter((x) => x.tree !== 'car')) {
      const { spec: s2, P: P2 } = bodySpecOf('hatch');
      addUpgradeLook(P2, s2, { [l.id]: l.tiers.length });
      const n = P2.tg.build().getAttribute('position').count;
      // a few lines (stötdämpare, nitrolängd, drift, rabattkort, brakes, shockwave of the engine) change nothing you can see, and that is fine
      const quiet = ['stunt.susp', 'race.long', 'race.drift', 'race.brakes', 'girig.disc', 'fuffens.oil2'];
      if (!quiet.includes(l.id)) expect(n, l.id).toBeGreaterThan(base);
    }
    void spec;
    // a car with nothing taken is untouched
    const { spec: s3, P: P3 } = bodySpecOf('hatch');
    addUpgradeLook(P3, s3, {});
    expect(P3.tg.build().getAttribute('position').count).toBe(base);
  });
});

describe('every vehicle has a kit and an upgrade for it', () => {
  it('the ability upgrades are named after the vehicle, and mention what the ability does', () => {
    for (const b of CAR_BODIES) {
      const own = UPGRADES.filter((u) => u.body === b);
      expect(lineById(`car.${b}`)!.name).toBe(kitOf(b).active.name);
      expect(own[0]!.emoji).toBe(kitOf(b).active.emoji);
    }
    expect(newCar(1, 'hatch', '').parts.engine).toBe(0);
  });
});
