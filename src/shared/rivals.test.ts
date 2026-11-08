import { describe, expect, it } from 'vitest';
import { ARCHETYPES, RIVALS, rivalCast } from './rivals.ts';
import { HELMET_DESIGNS } from './rally.ts';
import { isClean } from './words.ts';

describe('the rival cast', () => {
  it('has about twenty distinct rivals, each with every field filled in', () => {
    expect(RIVALS.length).toBeGreaterThanOrEqual(18);
    expect(RIVALS.length).toBeLessThanOrEqual(24);
    expect(new Set(RIVALS.map((r) => r.id)).size).toBe(RIVALS.length);
    expect(new Set(RIVALS.map((r) => r.name)).size).toBe(RIVALS.length);
    for (const r of RIVALS) {
      expect(r.name.length).toBeGreaterThan(4);
      expect(r.name.length).toBeLessThanOrEqual(24);
      expect(r.nick.length).toBeGreaterThan(5);
      expect(r.talk.length).toBeGreaterThan(15);
      expect(r.taunt.length).toBeGreaterThan(8);
      expect((ARCHETYPES as readonly string[]).includes(r.type)).toBe(true);
      expect((HELMET_DESIGNS as readonly string[]).includes(r.helmet)).toBe(true);
      expect(r.colors).toHaveLength(2);
      for (const c of r.colors) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
      expect(r.colors[0]).not.toBe(r.colors[1]);
      expect(r.initials).toMatch(/^\p{Lu}{2}$/u);
      expect(['se', 'int']).toContain(r.group);
    }
  });

  it('has no animals: no face field, nobody called after a creature, every line free of animal drivers', () => {
    for (const r of RIVALS) {
      expect('face' in r).toBe(false);
      expect(JSON.stringify(r)).not.toMatch(/Kon|Hästen|Grisen|Tupp|Fåret|Hunden|Katten|Kaninen|rooster|sheep|rabbit/);
    }
  });

  it('mixes a Swedish rally group with an international group, and all three driving styles', () => {
    const se = RIVALS.filter((r) => r.group === 'se');
    const int = RIVALS.filter((r) => r.group === 'int');
    expect(se.length).toBeGreaterThanOrEqual(8);
    expect(int.length).toBeGreaterThanOrEqual(8);
    for (const t of ARCHETYPES) expect(RIVALS.filter((r) => r.type === t).length, t).toBeGreaterThanOrEqual(4);
    // racers are the biggest group, and a rally grid of them is not all rammers
    expect(RIVALS.filter((r) => r.type === 'racer').length).toBeGreaterThanOrEqual(RIVALS.filter((r) => r.type === 'rammer').length);
    for (const n of ['Stig Blomgrus', 'Björn Waldegrus', 'Per Ekgrus', 'Kenneth Grusiksson', 'Mattias Eksprång', 'Pontus Tidsmand', 'Oliver Solgrus', 'Johan Kristofferstorque', 'Harry Kallstart', 'Leo Messimotor', 'Rovolvodo', 'Zlatan Grusimović', 'Kalle Rovanplåt', 'Petter Solbergsgrus', 'Usain Boltdragare', 'Serena Williamsväxel', 'Björn Borgtorque', 'Ingemar Stenmotor', 'Tiger Woodsvagn', 'Mika Häkkikinen']) expect(RIVALS.some((r) => r.name === n), n).toBe(true);
  });

  it('every line is clean and friendly (no swearing, nothing mean)', () => {
    for (const r of RIVALS) for (const t of [r.name, r.nick, r.talk, r.taunt]) {
      expect(isClean(t), t).toBe(true);
      expect(t).not.toMatch(/\b(dum|ful|äcklig|hatar|usel|värdelös|förlorare)\b/i);
    }
  });

  it('picks the same distinct grid for the same seed, with different helmets where it can', () => {
    const a = rivalCast(1234, 5);
    expect(rivalCast(1234, 5).map((r) => r.id)).toEqual(a.map((r) => r.id));
    expect(new Set(a.map((r) => r.id)).size).toBe(5);
    expect(new Set(a.map((r) => r.helmet)).size).toBe(5);
    expect(rivalCast(99, 5).map((r) => r.id)).not.toEqual(a.map((r) => r.id));
  });

  it('can leave one out (a boss that is also a rival does not race itself)', () => {
    for (let seed = 1; seed < 60; seed++) expect(rivalCast(seed, 5, undefined, ['stig']).some((r) => r.id === 'stig')).toBe(false);
  });
});
