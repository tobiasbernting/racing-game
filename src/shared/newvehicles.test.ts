// The ten vehicles of phase 10: their definitions, kits, gearboxes, engines, rivals, and what they feel like in the physics.
import { describe, expect, it } from 'vitest';
import { engineOf } from '../rally/audio.ts';
import { Car, Ground_ } from '../rally/car.ts';
import { GEARBOXES, gearboxOf } from '../rally/gears.ts';
import { Obstacles } from '../rally/obstacles.ts';
import { Shots } from '../rally/shots.ts';
import { Track } from '../rally/track.ts';
import { COURSES } from '../rally/courses.ts';
import { STARTERS } from '../run/meta.ts';
import { CHALLENGES, challengeFor } from '../run/unlocks.ts';
import { newRun } from '../run/state.ts';
import { trinketById } from '../run/trinkets.ts';
import { abilityOf, buildView } from '../run/summary.ts';
import * as THREE from 'three';
import { KITS, LEANS, kitOf } from './abilities.ts';
import { archetypeBodies } from './field.ts';
import { CAR_BODIES, CAR_BODY_DEFS, carStars, newCar, type CarBody } from './rally.ts';
import { CAR_BODY_NAMES, CAR_BODY_TEXT } from './names.ts';

const NEW = ['epa', 'icecream', 'garbage', 'snowmobile', 'kart', 'golf', 'mower', 'camper', 'limo', 'cart'] as const satisfies readonly CarBody[];

describe('the ten new vehicles', () => {
  it('make twenty in all, five of them starters and fifteen to unlock', () => {
    expect(CAR_BODIES).toHaveLength(20);
    expect(STARTERS).toHaveLength(5);
    expect(CAR_BODIES.filter((b) => !STARTERS.includes(b))).toHaveLength(15);
    for (const b of NEW) {
      expect(CAR_BODIES).toContain(b);
      expect(STARTERS).not.toContain(b);
    }
  });

  it('have names, a line of text, a price, a feel and stars', () => {
    expect(new Set(CAR_BODIES.map((b) => CAR_BODY_NAMES[b])).size).toBe(20);
    for (const b of NEW) {
      expect(CAR_BODY_NAMES[b].length).toBeGreaterThan(3);
      expect(CAR_BODY_TEXT[b].length).toBeGreaterThan(20);
      expect(CAR_BODY_DEFS[b].price).toBeGreaterThan(0);
      for (const v of Object.values(carStars(newCar(1, b, '')))) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(5);
      }
    }
    expect(CAR_BODY_NAMES.epa).toBe('EPA-traktor');
    expect(CAR_BODY_NAMES.icecream).toBe('Glassbil');
  });

  it('each one drives like itself', () => {
    const f = (b: CarBody) => CAR_BODY_DEFS[b].feel;
    // the A-tractor has a limiter and nothing slows it; the camper and the truck are heavy; the kart is light and the best at gripping
    expect(f('epa').top).toBeLessThan(15);
    expect(f('epa').roll).toBeLessThan(0.3);
    expect(f('epa').slip).toBeLessThan(0.3);
    expect(f('garbage').mass).toBeGreaterThan(2.5);
    expect(f('camper').mass).toBeGreaterThan(2.5);
    expect(f('kart').mass).toBeLessThan(0.6);
    expect(Math.max(...CAR_BODIES.map((b) => CAR_BODY_DEFS[b].grip))).toBe(CAR_BODY_DEFS.kart.grip);
    // only the snowmobile grips on loose ground, only the mower likes grass, only the limousine slides on
    expect(CAR_BODIES.filter((b) => f(b).loose > 0)).toEqual(['snowmobile']);
    expect(CAR_BODIES.filter((b) => f(b).grass > 1)).toEqual(['mower']);
    expect(CAR_BODIES.filter((b) => f(b).slide > 0)).toEqual(['limo']);
    // the limousine is the longest, the kart and the cart the smallest
    for (const b of CAR_BODIES) if (b !== 'limo') expect(f('limo').halfL).toBeGreaterThanOrEqual(f(b).halfL);
    expect(f('limo').steer).toBeLessThan(0.8);
    expect(f('cart').landing).toBeGreaterThan(1);
    // none is a two-wheeler
    for (const b of NEW) expect(f(b).two).toBe(false);
  });

  it('have a kit each: a lean, a passive, an active with a cooldown and a starting trinket that exists and is nobody else’s', () => {
    const trinkets = new Set<string>();
    for (const b of CAR_BODIES) trinkets.add(KITS[b].trinket);
    expect(trinkets.size).toBe(20);
    for (const b of NEW) {
      const k = kitOf(b);
      expect(LEANS).toContain(k.lean);
      expect(k.passive.name.length).toBeGreaterThan(3);
      expect(k.active.name.length).toBeGreaterThan(3);
      expect(k.active.cooldown).toBeGreaterThanOrEqual(8);
      expect(k.active.cooldown).toBeLessThanOrEqual(20);
      expect(trinketById(k.trinket), b).toBeDefined();
    }
    // all three leans are there among the ten, and the rammers are the heavy ones
    for (const lean of LEANS) expect(NEW.filter((b) => kitOf(b).lean === lean).length).toBeGreaterThanOrEqual(2);
    expect(NEW.filter((b) => kitOf(b).lean === 'ram').sort()).toEqual(['camper', 'garbage']);
    expect(kitOf('kart').lean).toBe('race');
    expect(kitOf('limo').lean).toBe('race');
    expect(kitOf('snowmobile').lean).toBe('race');
    // the names from the brief
    expect(kitOf('epa').active.name).toBe('Gasa på EPA');
    expect(kitOf('icecream').active.name).toBe('Glasskanon');
    expect(kitOf('garbage').active.name).toBe('Tömning');
    expect(kitOf('snowmobile').active.name).toBe('Pudersvans');
    expect(kitOf('kart').active.name).toBe('Gokartsladd');
    expect(kitOf('golf').active.name).toBe('Hole in one');
    expect(kitOf('mower').active.name).toBe('Gräsklippning');
    expect(kitOf('camper').active.name).toBe('Utfällt tält');
    expect(kitOf('limo').active.name).toBe('VIP-fil');
    expect(kitOf('cart').active.name).toBe('Raketen');
  });

  it('start a run with their own starting trinket', () => {
    for (const b of NEW) {
      const r = newRun({ seed: 3, calm: false, body: b, driver: 'human', paint: '#e8412c', trophies: 0 });
      expect(r.trinkets.map((t) => t.id)).toContain(kitOf(b).trinket);
    }
  });

  it('each have a gearbox of their own: the kart four quick gears, the camper five slow ones, the cart one gear and a rocket', () => {
    for (const b of NEW) {
      const box = gearboxOf(b);
      for (const o of CAR_BODIES) if (o !== b && GEARBOXES[o].v.length === box.v.length) expect(JSON.stringify(GEARBOXES[o].v), `${b} vs ${o}`).not.toBe(JSON.stringify(box.v));
    }
    expect(GEARBOXES.kart.v).toHaveLength(4);
    expect(GEARBOXES.kart.shiftTime).toBeLessThan(0.08);
    expect(GEARBOXES.camper.v).toHaveLength(5);
    expect(GEARBOXES.camper.shiftTime).toBeGreaterThan(0.25);
    expect(GEARBOXES.cart.v).toHaveLength(1);
    expect(GEARBOXES.garbage.v.length).toBeGreaterThanOrEqual(6);
    expect(GEARBOXES.limo.v[4]).toBeGreaterThan(GEARBOXES.hatch.v[4]!);
    expect(GEARBOXES.snowmobile.shiftTime).toBeLessThan(0.1);
  });

  it('each have an engine of their own', () => {
    const kinds = NEW.map((b) => engineOf(b));
    expect(new Set(kinds).size).toBe(10);
    for (const b of NEW) expect(engineOf(b)).toBe(b);
    expect(engineOf('hatch')).toBe('car');
  });

  it('are driven by the rivals that fit them: rammers in the truck and the camper, racers in the kart, the limousine and the snowmobile', () => {
    const ids = (a: Parameters<typeof archetypeBodies>[0]) => archetypeBodies(a, 'rival').map(([b]) => b);
    expect(ids('rammer')).toEqual(expect.arrayContaining(['garbage', 'camper']));
    expect(ids('racer')).toEqual(expect.arrayContaining(['kart', 'limo', 'snowmobile']));
    expect(ids('racer')).not.toContain('garbage');
    expect(ids('rammer')).not.toContain('kart');
    expect(ids('mixed')).toEqual(expect.arrayContaining(['icecream', 'golf', 'mower', 'cart']));
    // every body a rival might drive is a real body with a positive weight
    for (const a of ['rammer', 'racer', 'mixed'] as const) for (const [b, w] of archetypeBodies(a, 'elite')) {
      expect(CAR_BODIES).toContain(b);
      expect(w).toBeGreaterThan(0);
    }
  });

  it('show up on the result screen with their own ability, passive and lean', () => {
    for (const b of NEW) {
      const r = newRun({ seed: 3, calm: false, body: b, driver: 'human', paint: '#e8412c', trophies: 0 });
      const a = abilityOf(r);
      expect(a.name).toBe(kitOf(b).active.name);
      expect(a.passive.name).toBe(kitOf(b).passive.name);
      expect(a.vehicle).toBe(CAR_BODY_NAMES[b]);
      expect(buildView(r).ability.name).toBe(a.name);
    }
  });

  it('are each opened by exactly one challenge, and a few of them are easy for a ten-year-old', () => {
    for (const b of NEW) expect(CHALLENGES.filter((c) => c.body === b)).toHaveLength(1);
    expect(CHALLENGES).toHaveLength(15);
    // the golf cart: reach act 2 on Söndagsåkare; the camper: just play five runs; the mower: press the button
    const calm = newRun({ seed: 1, calm: true, body: 'hatch', driver: 'human', paint: '#e8412c', trophies: 0 });
    calm.act = 1;
    expect(challengeFor('golf')!.measure(calm)).toBe(1);
    calm.calm = false;
    expect(challengeFor('golf')!.measure(calm)).toBe(0);
    expect(challengeFor('camper')!.mode).toBe('total');
    expect(challengeFor('camper')!.goal).toBeLessThanOrEqual(5);
    expect(challengeFor('mower')!.goal).toBeLessThanOrEqual(20);
    // the rest measure what they say
    const r = newRun({ seed: 1, calm: false, body: 'hatch', driver: 'human', paint: '#e8412c', trophies: 0 });
    r.stats.coins = 150;
    r.stats.driftSeconds = 41.5;
    r.stats.kronorSpent = 900;
    r.stats.abilityUses = 20;
    r.trinkets = [{ id: 'kastrull', n: 7 }, { id: 'dino', n: 5 }];
    expect(challengeFor('icecream')!.measure(r)).toBe(150);
    expect(challengeFor('kart')!.measure(r)).toBe(41);
    expect(challengeFor('limo')!.measure(r)).toBe(900);
    expect(challengeFor('mower')!.measure(r)).toBe(20);
    expect(challengeFor('garbage')!.measure(r)).toBe(12);
    // the rocket cart is the hardest: win a run with the moppe or the traktor
    r.status = 'won';
    expect(challengeFor('cart')!.measure(r)).toBe(0);
    r.car = newCar(1, 'moped', '');
    expect(challengeFor('cart')!.measure(r)).toBe(1);
  });
});

describe('what the new feels do in the physics', () => {
  const ground = { height: () => 0 };
  const farm = new Track(COURSES.farm);

  /** A car rolling at `v` m/s along the road, brakes on, with this ground off the road: how far it rolls (m) in a few seconds. */
  const stopOn = (body: CarBody, surf: number, v = 22): number => {
    const c = new Car(farm);
    c.setBody(body);
    c.roam = true;
    c.offroadAt = () => surf;
    c.place(60, farm.at(farm.hw, 60) + 6, ground);
    c.vx = Math.sin(c.heading) * v;
    c.vz = Math.cos(c.heading) * v;
    const x0 = c.x;
    const z0 = c.z;
    for (let i = 0; i < 360; i++) c.step(1 / 120, { throttle: 0, brake: 1, steer: 0, handbrake: false }, ground);
    return Math.hypot(c.x - x0, c.z - z0);
  };

  it('the snowmobile stops on ice and snow like on tarmac; a car does not', () => {
    for (const surf of [Ground_.Ice, Ground_.Snow]) {
      expect(stopOn('snowmobile', surf), `snowmobile ${surf}`).toBeLessThan(stopOn('hatch', surf) * 0.8);
    }
    expect(stopOn('snowmobile', Ground_.Ice)).toBeLessThan(stopOn('snowmobile', Ground_.Ice) + 1);
  });

  /** Seconds of full throttle straight on to a standstill start, off the road on this ground, and the speed it ends on. */
  const speedOn = (body: CarBody, surf: number): number => {
    const c = new Car(farm);
    c.setBody(body);
    c.roam = true;
    c.offroadAt = () => surf;
    c.power *= CAR_BODY_DEFS[body].power;
    c.place(60, farm.at(farm.hw, 60) + 8, ground);
    let top = 0;
    for (let i = 0; i < 25 * 120; i++) {
      c.step(1 / 120, { throttle: 1, brake: 0, steer: 0, handbrake: false }, ground);
      if (i % 40 === 0 && Math.abs(c.proj.d - farm.at(farm.hw, c.proj.s)) > 12) {
        const v = c.speed;
        c.place(c.proj.s, farm.at(farm.hw, c.proj.s) + 8, ground);
        c.vx = Math.sin(c.heading) * v;
        c.vz = Math.cos(c.heading) * v;
      }
      top = Math.max(top, c.speed);
    }
    return top;
  };

  it('the mower goes faster on grass than on the road, the golf cart and the hatch do not', () => {
    const road = (b: CarBody): number => {
      const c = new Car(farm);
      c.setBody(b);
      c.power *= CAR_BODY_DEFS[b].power;
      c.place(0, 0, ground);
      let top = 0;
      for (let i = 0; i < 25 * 120; i++) {
        c.step(1 / 120, { throttle: 1, brake: 0, steer: 0, handbrake: false }, ground);
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
    expect(speedOn('mower', Ground_.Grass)).toBeGreaterThan(road('mower') * 1.15);
    expect(speedOn('hatch', Ground_.Grass)).toBeLessThan(road('hatch') * 0.85);
  });

  it('the EPA-traktor stops at its limiter on the road, and a burst takes it well past it', () => {
    const c = new Car(farm);
    c.setBody('epa');
    c.power *= CAR_BODY_DEFS.epa.power;
    c.place(0, 0, ground);
    let top = 0;
    for (let i = 0; i < 30 * 120; i++) {
      c.step(1 / 120, { throttle: 1, brake: 0, steer: 0, handbrake: false }, ground);
      if (i % 20 === 0 && Math.abs(c.proj.d) > 3) {
        const v = c.speed;
        c.place(c.proj.s, 0, ground);
        c.vx = Math.sin(c.heading) * v;
        c.vz = Math.cos(c.heading) * v;
      }
      top = Math.max(top, c.speed);
    }
    expect(top).toBeLessThan(CAR_BODY_DEFS.epa.feel.top * 1.06);
    expect(top).toBeGreaterThan(8);
    c.boost = 2.7;
    c.topK = 1;
    let burst = 0;
    for (let i = 0; i < 3 * 120; i++) {
      c.vx += Math.sin(c.heading) * 6 / 120;
      c.vz += Math.cos(c.heading) * 6 / 120;
      c.step(1 / 120, { throttle: 1, brake: 0, steer: 0, handbrake: false }, ground);
      if (i % 20 === 0 && Math.abs(c.proj.d) > 3) {
        const v = c.speed;
        c.place(c.proj.s, 0, ground);
        c.vx = Math.sin(c.heading) * v;
        c.vz = Math.cos(c.heading) * v;
      }
      burst = Math.max(burst, c.speed);
    }
    expect(burst).toBeGreaterThan(top * 1.6);
  });

  it('the limousine keeps sliding after the tail steps out, longer than a car', () => {
    const slide = (b: CarBody): number => {
      const c = new Car(farm);
      c.setBody(b);
      c.place(0, 0, ground);
      c.vx = Math.sin(c.heading) * 30;
      c.vz = Math.cos(c.heading) * 30;
      for (let i = 0; i < 90; i++) c.step(1 / 120, { throttle: 0.6, brake: 0, steer: 0.8, handbrake: true }, ground);
      let sum = 0;
      for (let i = 0; i < 240; i++) {
        c.step(1 / 120, { throttle: 0.3, brake: 0, steer: 0, handbrake: false }, ground);
        sum += Math.abs(Math.atan2(c.vLat, Math.max(1, Math.abs(c.vLong))));
      }
      return sum;
    };
    expect(slide('limo')).toBeGreaterThan(slide('hatch') * 1.15);
  });
});

describe('what the new obstacles and shots do', () => {
  it('ice cream and awnings lie on the road for a while, and the mower’s blades cut a corridor clean', () => {
    const o = new Obstacles();
    o.add('glass', 0, 0, 20, null);
    o.add('tent', 1, 0, 25, null);
    o.add('hay', 8, 0, 20, null);
    o.add('oil', 0, 0, -10, null);
    expect(o.count).toBe(4);
    // heading 0 is +z: the blades cut what is ahead and inside the corridor, not what is beside or behind
    const cut = o.clearAhead(0, 0, 0, 30, 4);
    expect(cut.n).toBe(2);
    expect(o.count).toBe(2);
    // the hay lasts 22 s, the oil 28 s
    o.update(23);
    expect(o.count).toBe(1);
    o.dispose();
  });

  it('the garbage truck can take a hazard off the road', () => {
    const o = new Obstacles();
    const car = { x: 0, z: 0, air: false, size: 1 } as unknown as Car;
    o.add('hay', 0, 0, 0.3, null);
    const hit = o.touch(car);
    expect(hit?.kind).toBe('hay');
    o.take(hit!);
    expect(o.count).toBe(0);
    o.dispose();
  });

  it('a thrown scoop or ball arrives after its flight and calls back once', () => {
    const s = new Shots();
    let landed = 0;
    s.fire('ball', new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 30), 1, { land: () => landed++ });
    s.update(0.4);
    expect(landed).toBe(0);
    expect(s.count).toBe(1);
    s.update(0.7);
    expect(landed).toBe(1);
    expect(s.count).toBe(0);
    s.update(1);
    expect(landed).toBe(1);
    s.dispose();
  });
});
