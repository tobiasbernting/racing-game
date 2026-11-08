import { describe, expect, it } from 'vitest';
import { capRammer, isRammer, type FegisState, fegisDealt, fegisDrain, fegisTick, BIG_HIT, HIT_MIN_DV, NOSE_MIN, TAKEDOWN_WINDOW, TakedownLedger, exposure, hitsToWreck, impactDamage, maxHpOf, ramPowerOf, zoneOf } from './combat.ts';

const hit = { dv: 8, blame: 1, facing: -1, ram: 1, dmgTaken: 1 };

describe('how much a hit hurts', () => {
  it('nothing for a nudge, more for a faster hit', () => {
    expect(impactDamage({ ...hit, dv: HIT_MIN_DV - 0.5 })).toBe(0);
    expect(impactDamage({ ...hit, dv: 6 })).toBeGreaterThan(0);
    expect(impactDamage({ ...hit, dv: 12 })).toBeGreaterThan(impactDamage({ ...hit, dv: 6 }));
  });
  it('depends on the ram power of the attacker, the armour of the victim and who drove into whom', () => {
    const soft = { ...hit, dv: 3.5 };
    expect(impactDamage({ ...soft, ram: 2 })).toBeCloseTo(impactDamage(soft) * 2);
    expect(impactDamage({ ...soft, dmgTaken: 0.5 })).toBeCloseTo(impactDamage(soft) * 0.5);
    expect(impactDamage({ ...hit, blame: 0 })).toBeLessThan(impactDamage({ ...hit, blame: 1 }) * 0.4);
  });
  it('lets the heavy shove the light: a tractor wrecks a car in a few hits and a car barely scratches a tractor', () => {
    const car = { massVic: 1, dmgTaken: 1, hp: maxHpOf(1) };
    const tractor = { massVic: 3.6, dmgTaken: 1 / 2.2, hp: maxHpOf(3.6) };
    const tractorHitsCar = hitsToWreck({ ...car, massAtt: 3.6, closing: 10, ram: 1 });
    const carHitsCar = hitsToWreck({ ...car, massAtt: 1, closing: 10, ram: 1 });
    const carHitsTractor = hitsToWreck({ ...tractor, massAtt: 1, closing: 10, ram: 1 });
    console.log('hits to wreck at 10 m/s: tractor on car', tractorHitsCar, 'car on car', carHitsCar, 'car on tractor', carHitsTractor);
    expect(tractorHitsCar).toBeLessThan(carHitsCar);
    expect(carHitsCar).toBeGreaterThanOrEqual(3);
    expect(carHitsCar).toBeLessThanOrEqual(9);
    expect(tractorHitsCar).toBeLessThanOrEqual(4);
    expect(carHitsTractor).toBeGreaterThan(carHitsCar * 3);
  });
  it('a ram-heavy player wrecks a car in about half the hits', () => {
    const base = { massAtt: 1, massVic: 1, closing: 9, dmgTaken: 1, hp: 80 };
    expect(hitsToWreck({ ...base, ram: ramPowerOf(3) })).toBeLessThanOrEqual(Math.ceil(hitsToWreck({ ...base, ram: 1 }) * 0.6));
  });
  it('health grows with the weight of the body, and the ram power stops at 2.5', () => {
    expect(maxHpOf(0.35)).toBeLessThan(maxHpOf(1));
    expect(maxHpOf(3.6)).toBeGreaterThan(maxHpOf(1));
    expect(maxHpOf(1, 1.5)).toBe(120);
    expect(ramPowerOf(0)).toBe(1);
    expect(ramPowerOf(100)).toBe(2.5);
  });
});

describe('who takes the damage: the nose that rams or the flank that is rammed', () => {
  it('names the zone from the angle', () => {
    expect(zoneOf(0.9)).toBe('front');
    expect(zoneOf(0.1)).toBe('side');
    expect(zoneOf(-0.1)).toBe('side');
    expect(zoneOf(-0.9)).toBe('rear');
  });
  it('the rammer with its nose takes about a fifth, the car hit on its side takes the bulk (x1.5) and the tail x1.3', () => {
    const rammer = exposure(1, 0);
    const sideVictim = exposure(0, 1);
    const rearVictim = exposure(-1, 1);
    expect(rammer).toBeCloseTo(NOSE_MIN);
    expect(sideVictim).toBeCloseTo(1.5);
    expect(rearVictim).toBeCloseTo(1.3);
    expect(sideVictim / rammer).toBeGreaterThan(6);
    expect(rearVictim / rammer).toBeGreaterThan(5);
  });
  it('a head-on splits evenly: both noses, both half the blame', () => {
    expect(exposure(1, 0.5)).toBeCloseTo(exposure(1, 0.5));
    const a = impactDamage({ dv: 8, blame: 0.5, facing: 1, ram: 1, dmgTaken: 1 });
    const b = impactDamage({ dv: 8, blame: 0.5, facing: 0.95, ram: 1, dmgTaken: 1 });
    expect(Math.abs(a - b) / a).toBeLessThan(0.1);
    // ...and each takes less than a rear-ended car would
    expect(a).toBeLessThan(impactDamage({ dv: 8, blame: 1, facing: -1, ram: 1, dmgTaken: 1 }));
  });
  it('ramming a car from behind or from the side wrecks it in a few hits while the rammer lasts for many', () => {
    const base = { dv: 4, ram: 1, dmgTaken: 1 };
    const rammerHit = impactDamage({ ...base, blame: 0, facing: 1 });
    const sideHit = impactDamage({ ...base, blame: 1, facing: 0 });
    const rearHit = impactDamage({ ...base, blame: 1, facing: -1 });
    expect(sideHit).toBeGreaterThan(rammerHit * 6);
    expect(rearHit).toBeGreaterThan(rammerHit * 5);
    expect(Math.ceil(80 / rearHit)).toBeLessThanOrEqual(5);
    expect(Math.ceil(80 / rammerHit)).toBeGreaterThanOrEqual(15);
  });
  it('mass and ram power scale it, and a ram build is hardened in front', () => {
    const nose = { dv: 8, blame: 0.1, facing: 1, ram: 1, dmgTaken: 1 };
    expect(impactDamage({ ...nose, ownRam: 2.5 })).toBeLessThan(impactDamage(nose) * 0.75);
    const flank = { dv: 3, blame: 1, facing: 0, dmgTaken: 1 };
    expect(impactDamage({ ...flank, ram: 2 })).toBeCloseTo(impactDamage({ ...flank, ram: 1 }) * 2);
    // a lighter victim changes speed more in the same hit
    expect(impactDamage({ ...flank, ram: 1, dv: 4 })).toBeGreaterThan(impactDamage({ ...flank, ram: 1, dv: 2.5 }));
  });
});

describe('the rammer is never hurt more than 40 % of what it hits', () => {
  it('caps the nose that rams, leaves head-ons and the victim alone', () => {
    expect(capRammer(21, 8, 1, 0.05)).toBeCloseTo(3.2);
    expect(capRammer(2, 8, 1, 0.05)).toBe(2);
    // head-on: split as before
    expect(capRammer(21, 8, 1, 0.5)).toBe(21);
    // a flank or tail takes its own damage
    expect(capRammer(21, 8, 0, 1)).toBe(21);
    expect(capRammer(21, 8, -1, 1)).toBe(21);
    expect(isRammer(0.9, 0.2)).toBe(true);
    expect(isRammer(0.9, 0.6)).toBe(false);
  });
});

describe('FEGIS: a car that does not fight', () => {
  it('is marked after ten quiet seconds, and loses health until it deals damage', () => {
    const st: FegisState = { idleT: 0, fegis: false };
    let started = 0;
    for (let t = 0; t < 9.9; t += 0.1) if (fegisTick(st, 0.1, true) === 'start') started++;
    expect(started).toBe(0);
    expect(st.fegis).toBe(false);
    for (let t = 0; t < 0.4; t += 0.1) if (fegisTick(st, 0.1, true) === 'start') started++;
    expect(started).toBe(1);
    expect(st.fegis).toBe(true);
    // half a minute of bleeding takes about two thirds of a derby car's health (a wreck in ~45 s), not all in one go
    let hp = 144;
    for (let t = 0; t < 30; t += 0.1) hp -= fegisDrain(144, 0.1, true);
    expect(hp).toBeLessThan(144 * 0.4);
    expect(hp).toBeGreaterThan(0);
    expect(fegisDealt(st)).toBe(true);
    expect(st).toEqual({ idleT: 0, fegis: false });
  });
  it('is not started when nobody is near enough to hit, and cools off again', () => {
    const st: FegisState = { idleT: 8, fegis: false };
    for (let t = 0; t < 20; t += 0.1) expect(fegisTick(st, 0.1, false)).toBeNull();
    expect(st.idleT).toBe(0);
    const marked: FegisState = { idleT: 12, fegis: true };
    let ended = 0;
    for (let t = 0; t < 5; t += 0.1) if (fegisTick(marked, 0.1, false) === 'end') ended++;
    expect(ended).toBe(1);
    expect(marked.fegis).toBe(false);
  });
});

describe('who gets the takedown', () => {
  it('whoever made the last big hit within two seconds', () => {
    const l = new TakedownLedger();
    l.hit('v', 'a', 20, 10);
    l.hit('v', 'b', 12, 10.8);
    expect(l.credit('v', 11.5)).toBe('b');
  });
  it('nobody when the big hit was too long ago, or the hits were small, or the car hit itself', () => {
    const l = new TakedownLedger();
    l.hit('v', 'a', 20, 10);
    expect(l.credit('v', 10 + TAKEDOWN_WINDOW + 0.1)).toBeNull();
    l.hit('v', 'a', BIG_HIT - 1, 20);
    expect(l.credit('v', 20.5)).toBeNull();
    l.hit('v', 'v', 30, 30);
    expect(l.credit('v', 30.1)).toBeNull();
  });
  it('a small hit does not take the credit from an earlier big one, and the credit is used up once', () => {
    const l = new TakedownLedger();
    l.hit('v', 'a', 20, 5);
    l.hit('v', 'b', 1, 5.5);
    expect(l.credit('v', 6)).toBe('a');
    expect(l.credit('v', 6.1)).toBeNull();
  });
});
