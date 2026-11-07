import { describe, expect, it } from 'vitest';
import { PLACE_POINTS, RACE_KINDS, TAKEDOWN_POINTS, carnagePoints, placePoints, pointsTable } from './kinds.ts';

describe('Blodbad points', () => {
  it('give 10/7/5/3/2/1 for the finishing order and 3 for each takedown', () => {
    expect([...PLACE_POINTS]).toEqual([10, 7, 5, 3, 2, 1]);
    expect(TAKEDOWN_POINTS).toBe(3);
    expect(placePoints(1)).toBe(10);
    expect(placePoints(6)).toBe(1);
    expect(placePoints(9)).toBe(1);
    expect(carnagePoints(3, 4)).toBe(5 + 12);
    expect(carnagePoints(1, 0)).toBe(10);
  });

  it('rank by points, so a rammer in third can win; ties go to the better position on the road', () => {
    const t = pointsTable([
      { id: 'a', place: 1, takedowns: 0 },
      { id: 'b', place: 2, takedowns: 1 },
      { id: 'me', place: 3, takedowns: 3 },
      { id: 'd', place: 4, takedowns: 0 },
    ]);
    const rank = (id: string): number => t.find((r) => r.id === id)!.rank;
    expect(t.find((r) => r.id === 'me')!.points).toBe(14);
    expect(rank('me')).toBe(1);
    // a and b both have 10: the one in front on the road ranks higher
    expect(rank('a')).toBe(2);
    expect(rank('b')).toBe(3);
    // a ram-heavy player two places down but with two more takedowns outscores the winner
    const two = pointsTable([{ id: 'x', place: 1, takedowns: 0 }, { id: 'y', place: 3, takedowns: 2 }]);
    expect(two.find((r) => r.id === 'y')!.points).toBe(11);
    expect(two.find((r) => r.id === 'y')!.rank).toBe(1);
    expect(two.find((r) => r.id === 'x')!.rank).toBe(2);
  });

  it('has three kinds', () => {
    expect(RACE_KINDS).toEqual(['rally', 'mixed', 'carnage']);
  });
});
