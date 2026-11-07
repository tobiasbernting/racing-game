// Phase 3: the new vehicles, courses, variation, trinkets, events and bosses.
import { describe, expect, it } from 'vitest';
import { Car, collideCars } from '../rally/car.ts';
import { COURSES } from '../rally/courses.ts';
import { neutralTune, type RaceApi } from '../rally/mods.ts';
import { rivalBody, rivalFeel } from '../rally/tuning.ts';
import { Track } from '../rally/track.ts';
import { courseFor, mirrorCtrl, reverseCtrl } from '../rally/variant.ts';
import { CAR_BODIES, CAR_BODY_DEFS, CRAZY_COURSES, RALLY_COURSES, WILD_COURSES, carStars, newCar, type CarBody, type RallyCourse } from '../shared/rally.ts';
import { CAR_BODY_NAMES, CAR_BODY_TEXT, RALLY_COURSE_NAMES } from '../shared/names.ts';
import { DRY_COURSES, canRain, skyFor, variationFor } from '../shared/variation.ts';
import { EVENTS, pickEventId } from './events.ts';
import { ACTS, ACT_COURSES, BOSS_COURSE, allNodes, generateAct } from './map.ts';
import { STARTERS, cleanMeta, defaultMeta, unlockedBodies } from './meta.ts';
import { BOSS_DEFS, planRace } from './plan.ts';
import { newRun } from './state.ts';
import { TRINKETS, buildMods, trinketById } from './trinkets.ts';

const seeds = Array.from({ length: 120 }, (_, i) => i * 7919 + 13);

describe('the new vehicles', () => {
  it('are five more bodies, each named, described and priced', () => {
    for (const b of ['atv', 'moto', 'moped', 'tractor', 'sofa'] as const) {
      expect(CAR_BODIES).toContain(b);
      expect(CAR_BODY_NAMES[b].length).toBeGreaterThan(3);
      expect(CAR_BODY_TEXT[b].length).toBeGreaterThan(10);
      expect(CAR_BODY_DEFS[b].price).toBeGreaterThan(0);
    }
    expect(CAR_BODY_NAMES.atv).toBe('Fyrhjuling');
    expect(CAR_BODY_NAMES.sofa).toBe('Soffbil');
  });

  it('feel different: bikes are light with two wheels, the moped is slow, the tractor heavy and slow', () => {
    const f = (b: CarBody) => CAR_BODY_DEFS[b].feel;
    expect(f('moto').two && f('moped').two).toBe(true);
    expect(f('hatch').two || f('atv').two || f('tractor').two || f('sofa').two).toBe(false);
    expect(f('moto').mass).toBeLessThan(f('hatch').mass);
    expect(f('tractor').mass).toBeGreaterThan(3 * f('hatch').mass);
    expect(f('moped').top).toBeGreaterThan(0);
    expect(f('moped').top).toBeLessThan(30);
    expect(f('tractor').top).toBeLessThan(25);
    expect(f('moto').top).toBe(0);
    expect(f('moto').lean).toBeGreaterThan(f('moped').lean);
    expect(f('tractor').slip).toBeLessThan(0.5);
    expect(f('atv').rough).toBeGreaterThan(1.2);
    expect(f('atv').landing).toBeLessThan(1);
    expect(CAR_BODY_DEFS.moto.power).toBeGreaterThan(CAR_BODY_DEFS.hatch.power);
    for (const b of CAR_BODIES) {
      const s = carStars(newCar(1, b, ''));
      for (const v of Object.values(s)) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(5);
      }
    }
  });

  it('five starters; the rest open by challenges; a stored locked body falls back to the rally car', () => {
    expect(unlockedBodies(defaultMeta())).toEqual(['hatch', 'buggy', 'pickup', 'moped', 'tractor']);
    expect(STARTERS).toHaveLength(5);
    expect(cleanMeta({ ...defaultMeta(), body: 'sofa' }).body).toBe('hatch');
    expect(cleanMeta({ ...defaultMeta(), bodies: [...STARTERS, 'sofa'], body: 'sofa' }).body).toBe('sofa');
  });

  it('the computer cars sometimes drive them, the same way every time for the same seed', () => {
    const bodies = new Set<CarBody>();
    let odd = 0;
    let total = 0;
    for (const seed of seeds)
      for (let k = 0; k < 5; k++) {
        const b = rivalBody(seed, k);
        expect(rivalBody(seed, k)).toBe(b);
        bodies.add(b);
        total++;
        if (['atv', 'moto', 'moped', 'tractor', 'sofa'].includes(b)) odd++;
      }
    for (const b of ['atv', 'moto', 'moped', 'tractor', 'sofa'] as const) expect(bodies.has(b)).toBe(true);
    expect(odd / total).toBeGreaterThan(0.25);
    expect(odd / total).toBeLessThan(0.55);
    // a rival moped or tractor is not left crawling: its top speed is raised
    expect(rivalFeel('moped').top).toBeGreaterThan(CAR_BODY_DEFS.moped.feel.top);
    expect(rivalFeel('hatch').top).toBe(0);
  });
});

describe('the handling in car.ts', () => {
  const track = new Track(COURSES.farm);
  const ground = { height: () => 0 };
  /** Full throttle on the straight for `secs` seconds (the road is wide, so just keep it going), returns the top speed. */
  const topSpeed = (body: CarBody, secs = 45): number => {
    const c = new Car(track);
    c.setBody(body);
    c.power *= CAR_BODY_DEFS[body].power;
    c.place(0, 0, ground);
    let top = 0;
    for (let i = 0; i < secs * 120; i++) {
      c.step(1 / 120, { throttle: 1, brake: 0, steer: 0, handbrake: false }, ground);
      // stay on the (curved) road: put the car back on the centre line, going along it
      track.project(c.x, c.z, c.proj.i, c.proj);
      if (i % 20 === 0 && Math.abs(c.proj.d) > 3) {
        const v = c.speed;
        c.place(c.proj.s, 0, ground);
        c.vx = Math.sin(c.heading) * v;
        c.vz = Math.cos(c.heading) * v;
      }
      top = Math.max(top, c.speed);
    }
    return top;
  };

  it('the moped and the tractor have a top speed, the motorbike is faster than the car', () => {
    const hatch = topSpeed('hatch');
    expect(topSpeed('moped')).toBeLessThan(CAR_BODY_DEFS.moped.feel.top * 1.06);
    expect(topSpeed('tractor')).toBeLessThan(CAR_BODY_DEFS.tractor.feel.top * 1.06);
    expect(topSpeed('moped')).toBeGreaterThan(15);
    expect(topSpeed('moto')).toBeGreaterThan(hatch);
    expect(topSpeed('tractor')).toBeLessThan(hatch * 0.6);
  });

  it('a car leans into a bend only when its body does', () => {
    const run = (body: CarBody): number => {
      const c = new Car(track);
      c.setBody(body);
      c.place(0, 0, ground);
      const th = c.heading;
      c.vx = Math.sin(th) * 25;
      c.vz = Math.cos(th) * 25;
      for (let i = 0; i < 240; i++) c.step(1 / 120, { throttle: 0.5, brake: 0, steer: 1, handbrake: false }, ground);
      return c.lean;
    };
    expect(Math.abs(run('hatch'))).toBe(0);
    expect(Math.abs(run('moto'))).toBeGreaterThan(0.03);
    expect(Math.abs(run('moto'))).toBeGreaterThan(Math.abs(run('moped')));
    // a left turn leans left: the left side down (a negative roll)
    expect(run('moto')).toBeLessThan(0);
  });

  it('a heavy tractor shoves a hatchback aside and hardly moves itself', () => {
    const a = new Car(track);
    const b = new Car(track);
    a.setBody('tractor');
    b.setBody('hatch');
    a.place(5, 0, ground);
    b.place(5, 0, ground);
    // the tractor drives straight into the hatchback's side
    b.x = a.x + 0;
    b.z = a.z + 2.4;
    a.heading = 0;
    b.heading = Math.PI / 2;
    a.vx = 0;
    a.vz = 8;
    b.vx = 0;
    b.vz = 0;
    a.size = 1.1;
    let hit = 0;
    collideCars([a, b], (_i, _k, j) => (hit = Math.max(hit, j)));
    expect(hit).toBeGreaterThan(0);
    expect(Math.abs(b.vz)).toBeGreaterThan(Math.abs(a.vz - 8) * 2);
    expect(a.vz).toBeGreaterThan(4);
  });
});

describe('the new courses', () => {
  const dir = (id: RallyCourse): string => RALLY_COURSE_NAMES[id];
  it('are five more, with names, a theme and an own circuit', () => {
    for (const c of ['desert', 'volcano', 'candy', 'moon', 'kitchen'] as const) {
      expect(RALLY_COURSES).toContain(c);
      expect(dir(c).length).toBeGreaterThan(2);
      expect(COURSES[c].theme.scenery).toBe(c);
    }
    expect(WILD_COURSES).toEqual(['desert', 'volcano']);
    expect(CRAZY_COURSES).toEqual(['candy', 'moon', 'kitchen']);
    expect(COURSES.moon.theme.gravity).toBeLessThan(0.6);
    expect(COURSES.moon.theme.sky.day.earth).toBeTruthy();
    expect(COURSES.kitchen.theme.ground.check).toBeTruthy();
  });

  it('every course, mirrored and reversed or not, builds a sane closed track', () => {
    for (const id of RALLY_COURSES)
      for (const [mirror, reverse] of [[false, false], [true, false], [false, true], [true, true]] as const) {
        const def = courseFor(id, { ...variationFor(id, 1), mirror, reverse, density: 1, tint: [1, 1, 1] });
        const t = new Track(def);
        expect(t.length, `${id} ${mirror} ${reverse}`).toBeGreaterThan(900);
        expect(t.length).toBeLessThan(2400);
        expect(t.idealLap).toBeGreaterThan(30);
        expect(t.idealLap).toBeLessThan(90);
        // the road does not run into itself: legs far apart along the lap keep their distance
        let best = Infinity;
        for (let i = 0; i < t.n; i += 3)
          for (let j = i + 1; j < t.n; j += 3) {
            let g = Math.abs(i - j);
            g = Math.min(g, t.n - g) * t.ds;
            if (g < 150) continue;
            best = Math.min(best, Math.hypot(t.px[i]! - t.px[j]!, t.pz[i]! - t.pz[j]!));
          }
        expect(best, `${id} ${mirror} ${reverse} legs`).toBeGreaterThan(40);
      }
  });

  it('mirroring twice gives the course back, and reversing keeps the start line', () => {
    for (const id of RALLY_COURSES) {
      const c = COURSES[id].ctrl;
      expect(mirrorCtrl(mirrorCtrl(c))).toEqual(c.map((p) => ({ ...p, runL: p.runL, runR: p.runR, fenceL: p.fenceL, fenceR: p.fenceR })));
      const r = reverseCtrl(c);
      expect(r).toHaveLength(c.length);
      expect([r[0]!.x, r[0]!.z]).toEqual([c[0]!.x, c[0]!.z]);
      expect([r[1]!.x, r[1]!.z]).toEqual([c[c.length - 1]!.x, c[c.length - 1]!.z]);
      // the same road the other way: the track is as long as before
      expect(new Track({ ...COURSES[id], ctrl: r }).length).toBeCloseTo(new Track(COURSES[id]).length, -1);
    }
  });
});

describe('variation per seed', () => {
  it('is deterministic for a course and a seed, and different between seeds and courses', () => {
    for (const id of RALLY_COURSES) expect(variationFor(id, 4242)).toEqual(variationFor(id, 4242));
    const a = variationFor('forest', 1);
    const mirrors = new Set(seeds.map((s) => variationFor('forest', s).mirror));
    const reverses = new Set(seeds.map((s) => variationFor('forest', s).reverse));
    expect(mirrors.size).toBe(2);
    expect(reverses.size).toBe(2);
    expect(variationFor('forest', 2)).not.toEqual(a);
    expect(variationFor('ice', 1)).not.toEqual(a);
  });

  it('keeps the farm as it is, and keeps the numbers in their ranges', () => {
    for (const s of seeds) {
      const f = variationFor('farm', s);
      expect(f.mirror || f.reverse).toBe(false);
      for (const id of RALLY_COURSES) {
        const v = variationFor(id, s);
        expect(v.density).toBeGreaterThanOrEqual(0.7);
        expect(v.density).toBeLessThanOrEqual(1.35);
        for (const t of v.tint) {
          expect(t).toBeGreaterThan(0.85);
          expect(t).toBeLessThan(1.15);
        }
      }
    }
    const v = variationFor('farm', 5);
    expect(courseFor('farm', v).ctrl).toEqual(COURSES.farm.ctrl);
  });

  it('weather and time of day follow the seed, never rain on dry courses, and the first act is a plain day', () => {
    const rainy = new Set<string>();
    for (const s of seeds)
      for (const id of RALLY_COURSES) {
        const sky = skyFor(id, variationFor(id, s), 1);
        if (sky.weather === 'rain') rainy.add(id);
        expect(skyFor(id, variationFor(id, s), 0)).toEqual({ time: 'day', weather: 'clear' });
      }
    for (const id of DRY_COURSES) expect(rainy.has(id)).toBe(false);
    expect(canRain('moon')).toBe(false);
    expect(canRain('forest')).toBe(true);
    expect(rainy.size).toBeGreaterThan(3);
    const times = new Set(seeds.map((s) => skyFor('forest', variationFor('forest', s), 2).time));
    expect(times.size).toBe(3);
  });

  it('every node of a run gets its own sky from its seed', () => {
    const run = newRun({ seed: 99, body: 'hatch', paint: '#e8412c', driver: 'human', calm: false, trophies: 0 });
    const skies = new Set<string>();
    for (let act = 1; act < ACTS; act++)
      for (const n of allNodes(generateAct(run.seed, act))) {
        if (!n.course || n.type !== 'race') continue;
        const p = planRace(n, false);
        skies.add(`${p.rules.time}/${p.rules.weather}`);
        expect(planRace(n, false).rules).toEqual(p.rules);
        if (DRY_COURSES.includes(n.course)) expect(p.rules.weather).toBe('clear');
      }
    expect(skies.size).toBeGreaterThan(2);
  });
});

describe('the acts and their courses', () => {
  const coursesOf = (act: number): Set<string> => {
    const out = new Set<string>();
    for (const seed of seeds) for (const n of allNodes(generateAct(seed, act))) if (n.type !== 'boss' && n.course) out.add(planRace(n, false).course);
    return out;
  };

  it('act 1 stays in the countryside, act 2 goes wild and act 3 gets crazy, among the old ones', () => {
    expect([...coursesOf(0)].sort()).toEqual(['farm', 'forest', 'meadow']);
    const wild = coursesOf(1);
    for (const c of WILD_COURSES) expect(wild.has(c)).toBe(true);
    for (const c of CRAZY_COURSES) expect(wild.has(c)).toBe(false);
    expect(['beach', 'ice', 'mountain'].some((c) => wild.has(c))).toBe(true);
    const crazy = coursesOf(2);
    for (const c of CRAZY_COURSES) expect(crazy.has(c)).toBe(true);
    for (const c of WILD_COURSES) expect(crazy.has(c)).toBe(false);
    expect(crazy.has('city')).toBe(true);
    for (let act = 0; act < ACTS; act++) for (const c of coursesOf(act)) expect(ACT_COURSES[act]).toContain(c);
  });

  it('the wild and crazy courses come up more often than the old ones in their acts', () => {
    const count = (act: number, ids: readonly string[]): number => {
      let n = 0;
      let all = 0;
      for (const seed of seeds)
        for (const node of allNodes(generateAct(seed, act))) {
          if (node.type === 'boss' || !node.course) continue;
          all++;
          if (ids.includes(node.course)) n++;
        }
      return n / all;
    };
    expect(count(1, WILD_COURSES)).toBeGreaterThan(0.45);
    expect(count(2, CRAZY_COURSES)).toBeGreaterThan(0.6);
  });
});

describe('the bosses', () => {
  it('each act has one, with a trick you can see: hay and a tractor, jumps, ice, low gravity', () => {
    const bengt = BOSS_DEFS.bengt;
    expect(bengt.twist.boss?.body).toBe('tractor');
    expect(bengt.twist.hay).toBeGreaterThan(0);
    expect(BOSS_DEFS.ingrid.twist.rivalHop).toBeGreaterThan(0);
    expect(BOSS_DEFS.isdrottningen.twist.grip).toBeLessThan(1);
    const kanin = BOSS_DEFS.kanin;
    expect(kanin.name).toBe('Kapten Kanin');
    expect(kanin.course).toBe('moon');
    expect(kanin.twist.boss?.face).toBe('rabbit');
    expect(kanin.twist.rivalHop).toBeGreaterThan(0);
    expect(COURSES[kanin.course].theme.gravity).toBeLessThan(1);
    for (const id of Object.keys(BOSS_DEFS) as (keyof typeof BOSS_DEFS)[]) expect(BOSS_DEFS[id].course).toBe(BOSS_COURSE[id]);
  });

  it('act 1 meets Bengt, act 2 Ingrid or the Ice Queen, act 3 Captain Rabbit', () => {
    const seen = new Set<string>();
    for (const seed of seeds) {
      const names = [0, 1, 2].map((act) => allNodes(generateAct(seed, act)).find((n) => n.type === 'boss')!.boss);
      expect(names[0]).toBe('bengt');
      expect(['ingrid', 'isdrottningen']).toContain(names[1]);
      expect(names[2]).toBe('kanin');
      seen.add(names[1]!);
    }
    expect(seen.size).toBe(2);
  });
});

describe('the new trinkets', () => {
  const NEW = ['sidvagn', 'turboflakt', 'ringklocka', 'karusell', 'kastrull', 'manstovlar', 'godispasen', 'myntturbo', 'guldpokal', 'dubbdack', 'krockkudde', 'angvissla', 'lavalampan', 'rymdhjalmen', 'planbok', 'kuponghafte', 'hjartekudde'];

  it('brings the list to 45 or more, every one with a line that fits the card', () => {
    expect(TRINKETS.length).toBeGreaterThanOrEqual(45);
    for (const id of NEW) {
      const t = trinketById(id)!;
      expect(t, id).toBeTruthy();
      expect(t.text.length).toBeLessThan(90);
      expect(t.tune || t.hooks || t.perk).toBeTruthy();
    }
  });

  it('the sidecar only helps a motorbike, the fan only a tractor', () => {
    expect(buildMods([{ id: 'sidvagn', n: 1 }], 'moto').tune.sidecar).toBe(true);
    expect(buildMods([{ id: 'sidvagn', n: 1 }], 'hatch').tune.sidecar).toBe(false);
    expect(buildMods([{ id: 'sidvagn', n: 2 }], 'moto').tune.grip).toBeGreaterThan(buildMods([{ id: 'sidvagn', n: 1 }], 'moto').tune.grip);
    const fan = (n: number, b: CarBody) => buildMods([{ id: 'turboflakt', n }], b).tune;
    expect(fan(1, 'tractor').top).toBeGreaterThan(1.2);
    expect(fan(2, 'tractor').top).toBeGreaterThan(fan(1, 'tractor').top);
    expect(fan(1, 'tractor').power).toBeGreaterThan(1);
    expect(fan(1, 'moped').top).toBe(1);
  });

  it('stacking strengthens the numeric ones', () => {
    const t = (id: string, n: number) => buildMods([{ id, n }]).tune;
    expect(t('kastrull', 1).tough).toBeLessThan(1);
    expect(t('kastrull', 2).tough).toBeLessThan(t('kastrull', 1).tough);
    expect(t('manstovlar', 2).gravity).toBeLessThan(t('manstovlar', 1).gravity);
    expect(t('rymdhjalmen', 1).magnet).toBeGreaterThan(0);
    expect(t('dubbdack', 2).grip).toBeGreaterThan(t('dubbdack', 1).grip);
    expect(t('dubbdack', 2).offroad).toBeGreaterThan(t('dubbdack', 1).offroad);
    expect(neutralTune().tough).toBe(1);
  });

  /** An api that records the calls. */
  function rec(): { api: RaceApi; calls: string[] } {
    const calls: string[] = [];
    const log = (name: string) => (...a: unknown[]) => void calls.push(`${name}:${a.join(',')}`);
    const api = new Proxy({} as RaceApi, { get: (_t, k) => log(String(k)) });
    return { api, calls };
  }

  it('the golden bell pays double on a moped and shoves cars that are near; the steam whistle shoves harder with two', () => {
    const run = (body: CarBody, n = 1): string[] => {
      const { api, calls } = rec();
      const m = buildMods([{ id: 'ringklocka', n }], body);
      m.bus.bind(api);
      m.bus.honk(2);
      return calls;
    };
    const kr = (calls: string[]): number => Number(calls.find((c) => c.startsWith('kronor'))!.split(':')[1]);
    expect(kr(run('moped'))).toBe(2 * kr(run('hatch')));
    expect(run('moped').some((c) => c.startsWith('shove'))).toBe(true);
    const shove = (n: number): number => {
      const { api, calls } = rec();
      const m = buildMods([{ id: 'angvissla', n }], 'hatch');
      m.bus.bind(api);
      m.bus.honk(1);
      return Number(calls.find((c) => c.startsWith('shove'))!.split(':')[1]!.split(',')[1]);
    };
    expect(shove(2)).toBeGreaterThan(shove(1));
    expect(buildMods([{ id: 'angvissla', n: 1 }]).bus.honking).toBe(true);
    expect(buildMods([{ id: 'kastrull', n: 1 }]).bus.honking).toBe(false);
  });

  it('the vehicle carousel swaps every lap (and on nitro with two), the sidecar pays passengers on other vehicles', () => {
    const calls = (id: string, n: number, body: CarBody, fire: (m: ReturnType<typeof buildMods>) => void): string[] => {
      const { api, calls: c } = rec();
      const m = buildMods([{ id, n }], body);
      m.bus.bind(api);
      fire(m);
      return c;
    };
    expect(calls('karusell', 1, 'hatch', (m) => m.bus.lap(1)).some((c) => c.startsWith('swapVehicle'))).toBe(true);
    expect(calls('karusell', 1, 'hatch', (m) => m.bus.boost('nitro')).some((c) => c.startsWith('swapVehicle'))).toBe(false);
    expect(calls('karusell', 2, 'hatch', (m) => m.bus.boost('nitro')).some((c) => c.startsWith('swapVehicle'))).toBe(true);
    expect(trinketById('karusell')!.rarity).toBe('legendary');
    const hatch = calls('sidvagn', 1, 'hatch', (m) => m.bus.lap(1)).find((c) => c.startsWith('kronor'))!;
    const bike = calls('sidvagn', 1, 'moto', (m) => m.bus.lap(1)).find((c) => c.startsWith('kronor'))!;
    expect(Number(hatch.split(':')[1])).toBeGreaterThan(Number(bike.split(':')[1]));
  });

  it('the trophy pays for first and second place only, and more for first', () => {
    const fin = (place: number): number => {
      const { api } = rec();
      const m = buildMods([{ id: 'guldpokal', n: 1 }]);
      m.bus.bind(api);
      return m.bus.finish({ place, n: 5, finished: true, time: 90000, laps: [30000, 30000, 30000], kronor: 100, coins: 10 }).kronor;
    };
    expect(fin(1)).toBeGreaterThan(fin(2));
    expect(fin(2)).toBeGreaterThan(0);
    expect(fin(3)).toBe(0);
  });
});

describe('the new events', () => {
  it('has at least 14, the new ones for their acts, and picks the same one for the same node', () => {
    expect(EVENTS.length).toBeGreaterThanOrEqual(14);
    const kamel = EVENTS.find((e) => e.id === 'kamel')!;
    const maneman = EVENTS.find((e) => e.id === 'maneman')!;
    expect(kamel.acts).toEqual([1]);
    expect(maneman.acts).toEqual([2]);
    const run = newRun({ seed: 7, body: 'hatch', paint: '#e8412c', driver: 'human', calm: false, trophies: 0 });
    const seen = new Map<number, Set<string>>();
    for (let act = 0; act < ACTS; act++) {
      const r = { ...run, act };
      const s = new Set<string>();
      for (let i = 0; i < 80; i++) {
        const id = pickEventId(r, `a${act}n${i}`);
        expect(pickEventId(r, `a${act}n${i}`)).toBe(id);
        s.add(id);
      }
      seen.set(act, s);
    }
    expect(seen.get(0)!.has('kamel')).toBe(false);
    expect(seen.get(1)!.has('kamel')).toBe(true);
    expect(seen.get(1)!.has('maneman')).toBe(false);
    expect(seen.get(2)!.has('maneman')).toBe(true);
    expect(seen.get(2)!.has('soffan')).toBe(true);
  });
});
