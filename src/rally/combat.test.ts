import { describe, expect, it } from 'vitest';
import { BIG_HIT, HIT_MIN_DV, TAKEDOWN_WINDOW, TakedownLedger, hitsToWreck, impactDamage, maxHpOf, ramPowerOf } from './combat.ts';

const hit = { dv: 8, blame: 1, ram: 1, dmgTaken: 1 };

describe('how much a hit hurts', () => {
  it('nothing for a nudge, more for a faster hit', () => {
    expect(impactDamage({ ...hit, dv: HIT_MIN_DV - 0.5 })).toBe(0);
    expect(impactDamage({ ...hit, dv: 6 })).toBeGreaterThan(0);
    expect(impactDamage({ ...hit, dv: 12 })).toBeGreaterThan(impactDamage({ ...hit, dv: 6 }));
  });
  it('depends on the ram power of the attacker, the armour of the victim and who drove into whom', () => {
    expect(impactDamage({ ...hit, ram: 2 })).toBeCloseTo(impactDamage(hit) * 2);
    expect(impactDamage({ ...hit, dmgTaken: 0.5 })).toBeCloseTo(impactDamage(hit) * 0.5);
    expect(impactDamage({ ...hit, blame: 0 })).toBeLessThan(impactDamage({ ...hit, blame: 1 }) * 0.4);
  });
  it('lets the heavy shove the light: a tractor wrecks a car in a few hits and a car barely scratches a tractor', () => {
    const car = { massVic: 1, dmgTaken: 1, hp: maxHpOf(1) };
    const tractor = { massVic: 3.6, dmgTaken: 1 / 2.2, hp: maxHpOf(3.6) };
    const tractorHitsCar = hitsToWreck({ ...car, massAtt: 3.6, closing: 15, ram: 1 });
    const carHitsCar = hitsToWreck({ ...car, massAtt: 1, closing: 15, ram: 1 });
    const carHitsTractor = hitsToWreck({ ...tractor, massAtt: 1, closing: 15, ram: 1 });
    console.log('hits to wreck at 15 m/s: tractor on car', tractorHitsCar, 'car on car', carHitsCar, 'car on tractor', carHitsTractor);
    expect(tractorHitsCar).toBeLessThan(carHitsCar);
    expect(carHitsCar).toBeGreaterThanOrEqual(4);
    expect(carHitsCar).toBeLessThanOrEqual(9);
    expect(tractorHitsCar).toBeLessThanOrEqual(5);
    expect(carHitsTractor).toBeGreaterThan(carHitsCar * 3);
  });
  it('a ram-heavy player wrecks a car in about half the hits', () => {
    const base = { massAtt: 1, massVic: 1, closing: 14, dmgTaken: 1, hp: 100 };
    expect(hitsToWreck({ ...base, ram: ramPowerOf(3) })).toBeLessThanOrEqual(Math.ceil(hitsToWreck({ ...base, ram: 1 }) * 0.6));
  });
  it('health grows with the weight of the body, and the ram power stops at 2.5', () => {
    expect(maxHpOf(0.35)).toBeLessThan(maxHpOf(1));
    expect(maxHpOf(3.6)).toBeGreaterThan(maxHpOf(1));
    expect(maxHpOf(1, 1.5)).toBe(150);
    expect(ramPowerOf(0)).toBe(1);
    expect(ramPowerOf(100)).toBe(2.5);
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
