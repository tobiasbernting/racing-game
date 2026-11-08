import { describe, expect, it } from 'vitest';
import { GRADES, gradeFor } from './look.ts';

describe('the grade at night', () => {
  it('lifts the shadows instead of crushing them, and Ljusare natt lifts further', () => {
    for (const id of Object.keys(GRADES)) {
      const day = gradeFor(id, false, false);
      const night = gradeFor(id, true, false);
      const bright = gradeFor(id, true, false, { dark: 'bright' });
      expect(day.lift).toBe(0);
      expect(night.lift).toBeGreaterThan(0.03);
      expect(bright.lift).toBeGreaterThan(night.lift);
      // a softer S-curve (the old night grade did not touch it)
      expect(night.punch).toBeLessThan(day.punch);
      expect(bright.punch).toBeLessThan(night.punch);
      expect(bright.exp).toBeGreaterThan(night.exp);
    }
  });

  it('dusk and rain get a small lift, day gets none', () => {
    expect(gradeFor('forest', false, false, { dusk: true }).lift).toBeGreaterThan(0);
    expect(gradeFor('forest', false, true).lift).toBeGreaterThan(0);
    expect(gradeFor('forest', false, false).lift).toBe(0);
  });

  it('Effekter: Färre drops the grain and most of the vignette', () => {
    const full = gradeFor('city', true, false);
    const less = gradeFor('city', true, false, { less: true });
    expect(less.grain).toBe(0);
    expect(less.vignette).toBeLessThan(full.vignette * 0.5);
  });
});

describe('nothing blinks more than three times a second (WCAG 2.3.1)', () => {
  const hud = (import.meta.glob('./hud.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['./hud.ts']!;
  it('every css blink cycle is at least a third of a second', () => {
    const cycles = [...hud.matchAll(/animation:\s*rl-(?:blink|streak)\s+([\d.]+)s/g)].map((m) => Number(m[1]));
    expect(cycles.length).toBeGreaterThan(5);
    for (const c of cycles) expect(c).toBeGreaterThanOrEqual(0.34);
  });
  it('the shift lights blink no faster than 2.7 Hz', () => {
    const ms = [...hud.matchAll(/Math\.floor\(now \/ (\d+)\) % 2/g)].map((m) => Number(m[1]));
    expect(ms.length).toBeGreaterThan(0);
    for (const m of ms) expect(1000 / (2 * m)).toBeLessThanOrEqual(3);
  });
  it('Effekter: Färre keeps the blinking steady', () => {
    expect(hud).toContain('--blink: 1');
    expect(hud).toMatch(/opacity: var\(--blink, 0\.55\)/);
  });
});
