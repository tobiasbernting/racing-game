import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, type Difficulty } from '../run/difficulty.ts';
import { actMap, allNodes } from '../run/map.ts';
import { planRace } from '../run/plan.ts';
import { cleanSettings, defaultSettings } from '../settings.ts';
import {
  FAR,
  HELP_K,
  RAGE,
  RESPAWN,
  RIVAL_EASE_MAX,
  SLIP,
  SLIP_K,
  autoRespawnAfter,
  comebackBonus,
  comebackLevel,
  farBehind,
  helpK,
  placeFactor,
  rageBonus,
  rageSeconds,
  rageStrength,
  respawnSpeed,
  rivalEase,
  showBackButton,
  simSpeedBonus,
  slipBonus,
  slipDepth,
  slipK,
} from './catchup.ts';

describe('the field eases off for a player far behind', () => {
  it('does nothing when the player is close or in front, and grows with the gap', () => {
    for (const d of DIFFICULTIES) {
      const k = helpK(d);
      expect(rivalEase(0, k)).toBe(0);
      expect(rivalEase(-300, k)).toBe(0);
      expect(rivalEase(FAR.start, k)).toBe(0);
      let last = 0;
      for (const gap of [100, 150, 200, 300, 400, 800]) {
        const e = rivalEase(gap, k);
        expect(e).toBeGreaterThanOrEqual(last);
        last = e;
      }
    }
  });

  it('is strongest in Söndagsåkare, moderate in Normal, light in Hård and none in Ett liv, and never visible as braking', () => {
    const at = (d: Difficulty): number => rivalEase(600, helpK(d));
    expect(at('calm')).toBeGreaterThan(at('normal'));
    expect(at('normal')).toBeGreaterThan(at('hard'));
    expect(at('hard')).toBeGreaterThan(0);
    expect(at('one')).toBe(0);
    // at most seven percent of a rival's speed, even at full help and any gap
    expect(at('calm')).toBeLessThanOrEqual(RIVAL_EASE_MAX + 1e-9);
    expect(rivalEase(5000, 1)).toBeLessThanOrEqual(RIVAL_EASE_MAX + 1e-9);
    // and it changes smoothly with the gap: no step bigger than 0.4 percent per 10 m
    for (let gap = 0; gap < 600; gap += 10) expect(Math.abs(rivalEase(gap + 10, 1) - rivalEase(gap, 1))).toBeLessThan(0.004);
  });

  it('does nothing when the help is switched off', () => {
    expect(helpK('calm', false)).toBe(0);
    expect(rivalEase(500, helpK('calm', false))).toBe(0);
    expect(slipK('calm', false)).toBe(0);
  });
});

describe('the comeback bonus', () => {
  it('is off while the player leads or is close to the leader, whatever the place', () => {
    expect(comebackLevel(-50, 1, 4)).toBe(0);
    expect(comebackLevel(0, 4, 4)).toBe(0);
    expect(comebackLevel(FAR.start - 1, 4, 4)).toBe(0);
    expect(comebackBonus(0, 1)).toEqual({ top: 0, power: 0, recharge: 0, nitro: 0 });
  });

  it('grows with the gap and with a low place, and is full for last place far behind', () => {
    expect(comebackLevel(FAR.full, 4, 4)).toBeCloseTo(1, 6);
    expect(comebackLevel(FAR.full, 2, 4)).toBeCloseTo(0.4, 6);
    expect(comebackLevel(250, 4, 4)).toBeGreaterThan(comebackLevel(150, 4, 4));
    expect(comebackLevel(300, 4, 4)).toBeGreaterThan(comebackLevel(300, 3, 4));
    expect(comebackLevel(300, 3, 4)).toBeGreaterThan(comebackLevel(300, 1, 4));
    expect(placeFactor(1, 4)).toBe(0);
    expect(placeFactor(4, 4)).toBe(1);
    expect(placeFactor(6, 6)).toBe(1);
  });

  it('is small, and scaled by the difficulty', () => {
    const calm = comebackBonus(1, helpK('calm'));
    const normal = comebackBonus(1, helpK('normal'));
    const hard = comebackBonus(1, helpK('hard'));
    const one = comebackBonus(1, helpK('one'));
    expect(calm.top).toBeGreaterThan(normal.top);
    expect(normal.top).toBeGreaterThan(hard.top);
    expect(hard.top).toBeGreaterThan(0);
    expect(one).toEqual({ top: 0, power: 0, recharge: 0, nitro: 0 });
    // never more than ten percent top speed
    expect(calm.top).toBeLessThanOrEqual(0.1001);
    expect(calm.recharge).toBeGreaterThan(normal.recharge);
  });

  it('counts for nothing in the race model when the player leads, and more the further behind the player is', () => {
    const lead = simSpeedBonus({ level: comebackLevel(-20, 1, 4), k: 0.6 });
    expect(lead).toBe(0);
    const near = simSpeedBonus({ level: comebackLevel(150, 4, 4), k: 0.6 });
    const far = simSpeedBonus({ level: comebackLevel(450, 4, 4), k: 0.6 });
    expect(far).toBeGreaterThan(near);
    expect(far).toBeLessThan(0.08);
  });
});

describe('Ilska (rage)', () => {
  it('lasts a couple of seconds after a respawn or a wreck, less after a hit, and fades out at the end', () => {
    expect(rageSeconds('respawn')).toBeGreaterThanOrEqual(2);
    expect(rageSeconds('wreck')).toBeLessThanOrEqual(3);
    expect(rageSeconds('hit')).toBeLessThan(rageSeconds('respawn'));
    const total = rageSeconds('respawn');
    expect(rageStrength(total, total)).toBe(1);
    expect(rageStrength(total / 2, total)).toBe(1);
    expect(rageStrength(RAGE.fade / 2, total)).toBeCloseTo(0.5, 6);
    expect(rageStrength(0, total)).toBe(0);
    expect(rageStrength(-1, total)).toBe(0);
  });

  it('is scaled by the difficulty and none in Ett liv', () => {
    const at = (d: Difficulty) => rageBonus(1, helpK(d));
    expect(at('calm').power).toBeGreaterThan(at('normal').power);
    expect(at('normal').power).toBeGreaterThan(at('hard').power);
    expect(at('one')).toEqual({ top: 0, power: 0 });
    expect(at('calm').top).toBeLessThanOrEqual(0.0801);
  });

  it('cannot be started again straight away', () => {
    expect(RAGE.cooldown).toBeGreaterThan(RAGE.hitSeconds);
  });
});

describe('Slipström', () => {
  it('needs speed, a car just ahead and the right lane, and is deeper the closer you are', () => {
    expect(slipDepth(8, 0, 30)).toBeGreaterThan(0);
    expect(slipDepth(8, 0, 5)).toBe(0);
    expect(slipDepth(0.5, 0, 30)).toBe(0);
    expect(slipDepth(-6, 0, 30)).toBe(0);
    expect(slipDepth(SLIP.reach + 1, 0, 30)).toBe(0);
    expect(slipDepth(8, SLIP.lane + 0.5, 30)).toBe(0);
    expect(slipDepth(4, 0, 30)).toBeGreaterThan(slipDepth(12, 0, 30));
    expect(slipDepth(8, 0, 30)).toBeGreaterThan(slipDepth(8, 2, 30));
  });

  it('gives a clear but modest speed bonus and fills the nitro, less in the harder difficulties', () => {
    const b = slipBonus(1, SLIP_K.normal);
    expect(b.top).toBeGreaterThan(0.04);
    expect(b.top).toBeLessThan(0.08);
    expect(b.nitro).toBeGreaterThan(0.05);
    expect(slipBonus(1, SLIP_K.calm).top).toBeGreaterThan(slipBonus(1, SLIP_K.hard).top);
    // Ett liv keeps half of the draft, the setting can turn it all off
    expect(slipBonus(1, SLIP_K.one).top).toBeGreaterThan(0);
    expect(slipBonus(1, slipK('one', false)).top).toBe(0);
  });
});

describe('the respawn', () => {
  it('keeps part of the speed and never leaves the car standing still', () => {
    expect(respawnSpeed(40)).toBeGreaterThan(20);
    expect(respawnSpeed(40)).toBeLessThanOrEqual(RESPAWN.max);
    expect(respawnSpeed(25)).toBeCloseTo(25 * RESPAWN.keep, 6);
    expect(respawnSpeed(0)).toBe(RESPAWN.min);
    expect(respawnSpeed(-3)).toBe(RESPAWN.min);
    expect(respawnSpeed(3)).toBe(RESPAWN.min);
    expect(respawnSpeed(200)).toBe(RESPAWN.max);
  });

  it('puts the car back sooner with the help on, and shows the touch button once off the road or stuck', () => {
    expect(autoRespawnAfter(true).off).toBeLessThan(autoRespawnAfter(false).off);
    expect(autoRespawnAfter(true).stuck).toBeLessThan(autoRespawnAfter(false).stuck);
    expect(autoRespawnAfter(true).off).toBeLessThanOrEqual(3);
    // the button shows before the automatic respawn
    expect(RESPAWN.buttonAfter).toBeLessThan(autoRespawnAfter(true).off);
    expect(showBackButton(0, 0)).toBe(false);
    expect(showBackButton(0.5, 0.2)).toBe(false);
    expect(showBackButton(1, 0)).toBe(true);
    expect(showBackButton(0, 1)).toBe(true);
  });
});

describe('the setting and the difficulties', () => {
  it('is on by default and read back from storage, junk becomes the default', () => {
    expect(defaultSettings().catchup).toBe(true);
    expect(cleanSettings({}).catchup).toBe(true);
    expect(cleanSettings({ catchup: false }).catchup).toBe(false);
    expect(cleanSettings({ catchup: 'nej' }).catchup).toBe(true);
  });

  it('the difficulties are ordered: calm > normal > hard > one', () => {
    expect(HELP_K.calm).toBe(1);
    expect(HELP_K.calm).toBeGreaterThan(HELP_K.normal);
    expect(HELP_K.normal).toBeGreaterThan(HELP_K.hard);
    expect(HELP_K.hard).toBeGreaterThan(HELP_K.one);
    expect(HELP_K.one).toBe(0);
    expect(farBehind(0)).toBe(0);
    expect(farBehind(FAR.full + 100)).toBe(1);
  });
});

describe('the difficulty reaches the race', () => {
  const node = allNodes(actMap(5, 1)).find((n) => n.type === 'race')!;

  it('planRace carries the run difficulty into the field plan (a boolean still means Söndagsåkare or Normal)', () => {
    for (const d of DIFFICULTIES) expect(planRace(node, d).field.diff).toBe(d);
    expect(planRace(node, true).field.diff).toBe('calm');
    expect(planRace(node, false).field.diff).toBe('normal');
    expect(planRace(node, 'calm').field.calm).toBe(true);
    expect(planRace(node, 'one').field.calm).toBe(false);
  });
});
