import { beforeEach, describe, expect, it } from 'vitest';
import { PATTERNS, buzz, canVibrate, resetBuzz } from './haptics.ts';

describe('haptics', () => {
  beforeEach(resetBuzz);

  it('does nothing where the browser cannot vibrate (iOS) or when switched off', () => {
    expect(canVibrate({})).toBe(false);
    expect(buzz('shift', true, {}, 1000)).toBe(false);
    const calls: unknown[] = [];
    const nav = { vibrate: (p: number | number[]) => (calls.push(p), true) };
    expect(buzz('shift', false, nav, 1000)).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('buzzes with the pattern of the kind, but not several times within a few frames', () => {
    const calls: unknown[] = [];
    const nav = { vibrate: (p: number | number[]) => (calls.push(p), true) };
    expect(buzz('perfect', true, nav, 1000)).toBe(true);
    expect(buzz('shift', true, nav, 1030)).toBe(false);
    expect(buzz('hit', true, nav, 1200)).toBe(true);
    expect(calls).toEqual([PATTERNS.perfect, PATTERNS.hit]);
  });

  it('survives a browser that throws', () => {
    const nav = { vibrate: () => { throw new Error('nope'); } };
    expect(buzz('hit', true, nav, 5000)).toBe(false);
  });
});
