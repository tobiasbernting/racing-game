import { describe, expect, it } from 'vitest';
import { RIVALS, rivalCast } from './rivals.ts';

describe('the rival cast', () => {
  it('has a dozen distinct rivals with a name, a nickname, trash talk and a taunt', () => {
    expect(RIVALS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(RIVALS.map((r) => r.id)).size).toBe(RIVALS.length);
    for (const r of RIVALS) {
      expect(r.name.length).toBeLessThanOrEqual(17);
      expect(r.nick.length).toBeGreaterThan(5);
      expect(r.talk.length).toBeGreaterThan(15);
      expect(r.taunt.length).toBeGreaterThan(8);
    }
  });
  it('picks the same distinct grid for the same seed, with different faces where it can', () => {
    const a = rivalCast(1234, 5);
    expect(rivalCast(1234, 5).map((r) => r.id)).toEqual(a.map((r) => r.id));
    expect(new Set(a.map((r) => r.id)).size).toBe(5);
    expect(new Set(a.map((r) => r.face)).size).toBe(5);
    expect(rivalCast(99, 5).map((r) => r.id)).not.toEqual(a.map((r) => r.id));
  });
});
