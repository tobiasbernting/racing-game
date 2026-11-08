import { describe, expect, it } from 'vitest';
import { KIND_TEXT, DAMAGE_PER_PERCENT, FEGIS_AFTER, FEGIS_DRAIN, PLACE_POINTS, RACE_KINDS, TAKEDOWN_POINTS, carnagePoints, damagePoints, placePoints, pointsTable } from './kinds.ts';

describe('Blodbad points', () => {
  it('are made of damage dealt and takedowns first, and 20/14/10/6/4/2 for the position as a smaller part', () => {
    expect([...PLACE_POINTS]).toEqual([20, 14, 10, 6, 4, 2]);
    expect(TAKEDOWN_POINTS).toBe(20);
    expect(placePoints(1)).toBe(20);
    expect(placePoints(6)).toBe(2);
    expect(placePoints(9)).toBe(2);
    expect(carnagePoints(3, 4)).toBe(10 + 80);
    expect(carnagePoints(1, 0)).toBe(20);
    expect(carnagePoints(2, 1, 33.4)).toBe(14 + 20 + 33);
  });

  it('pay 0.5 p for each percent of a car\'s health that a hit takes off: a car wrecked by hits alone is 50 p', () => {
    expect(DAMAGE_PER_PERCENT).toBe(0.5);
    expect(damagePoints(80, 80)).toBeCloseTo(50);
    expect(damagePoints(20, 80)).toBeCloseTo(12.5);
    expect(damagePoints(20, 144)).toBeCloseTo(6.9, 1);
    expect(damagePoints(-5, 80)).toBe(0);
  });

  it('rank by points, so a fighter in last place on the road beats a driver who never fights', () => {
    const t = pointsTable([
      { id: 'a', place: 1, takedowns: 0, damage: 0 },
      { id: 'b', place: 2, takedowns: 1, damage: 10 },
      { id: 'me', place: 6, takedowns: 3, damage: 60 },
      { id: 'd', place: 4, takedowns: 0, damage: 5 },
    ]);
    const rank = (id: string): number => t.find((r) => r.id === id)!.rank;
    expect(t.find((r) => r.id === 'me')!.points).toBe(2 + 60 + 60);
    expect(rank('me')).toBe(1);
    expect(rank('b')).toBe(2);
    // the winner across the line who dealt nothing is last on points
    expect(rank('a')).toBe(3);
    expect(t.find((r) => r.id === 'a')!.points).toBe(20);
  });

  it('ties go to the better position on the road', () => {
    const t = pointsTable([{ id: 'x', place: 3, takedowns: 0, damage: 24 }, { id: 'y', place: 1, takedowns: 0, damage: 14 }]);
    expect(t.find((r) => r.id === 'x')!.points).toBe(34);
    expect(t.find((r) => r.id === 'y')!.points).toBe(34);
    expect(t.find((r) => r.id === 'y')!.rank).toBe(1);
  });

  it('marks a car FEGIS after ten quiet seconds, in the derby only', () => {
    expect(KIND_TEXT.carnage).not.toMatch(/FEGIS/);
    expect(FEGIS_AFTER).toBe(10);
    expect(FEGIS_DRAIN.derby).toBeGreaterThan(0);
  });

  it('has three kinds', () => {
    expect(RACE_KINDS).toEqual(['rally', 'mixed', 'carnage']);
  });
});
