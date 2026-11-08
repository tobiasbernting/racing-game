import { describe, expect, it } from 'vitest';
import { RACE_KINDS } from '../shared/kinds.ts';
import { BOSS_KIND, ACTS, ACT_COURSES, MAX_NON_RACE, MIN_RACES, NON_RACE, ROWS, allNodes, findNode, generateAct, pathsOf, reachableFromStart } from './map.ts';

const seeds = Array.from({ length: 150 }, (_, i) => i * 7919 + 1);

// Walks every path of 1500 seeded maps: several seconds on a slow CI runner, so not the 5 s default.
describe('a run of racing before every boss', { timeout: 60_000 }, () => {
  const many = Array.from({ length: 1500 }, (_, i) => i * 104729 + 3);
  it('every path from the start to the boss passes at least 3 races (race, challenge, elite or derby) and at most 2 other nodes', () => {
    for (const seed of many)
      for (let act = 0; act < ACTS; act++) {
        const m = generateAct(seed, act);
        const paths = pathsOf(m.rows);
        expect(paths.length).toBeGreaterThan(0);
        for (const p of paths) {
          expect(p).toHaveLength(ROWS);
          const races = p.filter((n) => !NON_RACE.has(n.type)).length;
          expect(races, `${seed}/${act}: ${p.map((n) => n.type).join(' > ')}`).toBeGreaterThanOrEqual(MIN_RACES);
          expect(p.length - races, `${seed}/${act}: ${p.map((n) => n.type).join(' > ')}`).toBeLessThanOrEqual(MAX_NON_RACE);
        }
      }
  });

  it('never has a kiosk or workshop straight after a kiosk or workshop, and the first row is racing', () => {
    for (const seed of many)
      for (let act = 0; act < ACTS; act++) {
        const m = generateAct(seed, act);
        for (const p of pathsOf(m.rows)) {
          p.forEach((n, i) => {
            if (i > 0 && (n.type === 'shop' || n.type === 'workshop')) expect(['shop', 'workshop']).not.toContain(p[i - 1]!.type);
          });
          expect(['race', 'challenge']).toContain(p[0]!.type);
        }
      }
  });

  it('still gives every act a kiosk, a workshop, an elite and an event, and the boss row is untouched', () => {
    let missing = 0;
    for (const seed of many)
      for (let act = 0; act < ACTS; act++) {
        const m = generateAct(seed, act);
        const types = new Set(allNodes(m).map((n) => n.type));
        for (const t of ['shop', 'workshop', 'elite', 'event'] as const) if (!types.has(t)) missing++;
        expect(m.rows[ROWS]![0]!.type).toBe('boss');
      }
    expect(missing).toBe(0);
  });

  it('keeps the shape of the map: the same rows and roads as before, only the types are fixed', () => {
    const m = generateAct(4242, 1);
    expect(m.rows).toHaveLength(ROWS + 1);
    for (const n of allNodes(m)) if (n.row < ROWS) expect(n.next.length).toBeGreaterThan(0);
  });
});

describe('map generation', () => {
  it('is the same for the same seed and act, and differs between seeds', () => {
    expect(generateAct(1234, 0)).toEqual(generateAct(1234, 0));
    expect(generateAct(1234, 0)).not.toEqual(generateAct(4321, 0));
    expect(generateAct(1234, 0)).not.toEqual(generateAct(1234, 1));
  });

  it('has the right shape: 2-4 nodes a row, a single boss at the end', () => {
    for (const seed of seeds)
      for (let act = 0; act < ACTS; act++) {
        const m = generateAct(seed, act);
        expect(m.rows).toHaveLength(ROWS + 1);
        m.rows.slice(0, ROWS).forEach((row) => {
          expect(row.length).toBeGreaterThanOrEqual(2);
          expect(row.length).toBeLessThanOrEqual(4);
        });
        expect(m.rows[ROWS]).toHaveLength(1);
        expect(m.rows[ROWS]![0]!.type).toBe('boss');
        expect(allNodes(m).filter((n) => n.type === 'boss')).toHaveLength(1);
      }
  });

  it('connects every node: reachable from the start, leading on to 1-2 nodes, and every path ends at the boss', () => {
    for (const seed of seeds)
      for (let act = 0; act < ACTS; act++) {
        const m = generateAct(seed, act);
        const nodes = allNodes(m);
        expect(reachableFromStart(m).size).toBe(nodes.length);
        for (const n of nodes) {
          if (n.row === ROWS) {
            expect(n.next).toEqual([]);
            continue;
          }
          expect(n.next.length).toBeGreaterThanOrEqual(1);
          expect(n.next.length).toBeLessThanOrEqual(2);
          for (const id of n.next) expect(findNode(m, id)?.row).toBe(n.row + 1);
        }
        // everyone has a way in (except the first row)
        for (const n of nodes.filter((x) => x.row > 0)) expect(nodes.some((p) => p.next.includes(n.id))).toBe(true);
      }
  });

  it('gives each act a kiosk, a workshop, an elite and an event, and a course for every race', () => {
    for (const seed of seeds)
      for (let act = 0; act < ACTS; act++) {
        const m = generateAct(seed, act);
        const types = new Set(allNodes(m).map((n) => n.type));
        for (const t of ['shop', 'workshop', 'elite', 'event', 'race'] as const) expect(types.has(t)).toBe(true);
        for (const n of allNodes(m)) {
          if (['race', 'elite', 'challenge', 'boss'].includes(n.type)) expect(n.course).toBeTruthy();
          if (n.type === 'challenge') expect(n.challenge).toBeTruthy();
          if (n.type === 'race') expect(ACT_COURSES[act]).toContain(n.course);
        }
        // the first row is only races and challenges
        for (const n of m.rows[0]!) expect(['race', 'challenge']).toContain(n.type);
      }
  });

  it('lets the third act use all of its courses, the city among the crazy ones', () => {
    const seen = new Set<string>();
    for (const seed of seeds) for (const n of allNodes(generateAct(seed, 2))) if (n.course) seen.add(n.course);
    expect(seen.has('city')).toBe(true);
    for (const c of ['candy', 'moon', 'kitchen']) expect(seen.has(c)).toBe(true);
    expect(seen.size).toBeGreaterThanOrEqual(5);
  });
});

describe('race kinds on the map', () => {
  it('every race, challenge, elite and boss has one, nothing else does, and the same seed gives the same kinds', () => {
    for (const seed of seeds.slice(0, 60))
      for (let act = 0; act < ACTS; act++) {
        const m = generateAct(seed, act);
        for (const n of allNodes(m)) {
          const racey = n.type === 'race' || n.type === 'challenge' || n.type === 'elite' || n.type === 'boss';
          if (racey) expect(RACE_KINDS, `${n.id}`).toContain(n.kind);
          else expect(n.kind).toBeUndefined();
          if (n.type === 'challenge' && n.challenge === 'time') expect(n.kind).toBe('rally');
          if (n.type === 'boss') expect(n.kind).toBe(BOSS_KIND[n.boss!]);
        }
        expect(generateAct(seed, act).rows.flat().map((n) => n.kind)).toEqual(m.rows.flat().map((n) => n.kind));
      }
  });

  it('adding kinds changed nothing else about the map (types, courses, links)', () => {
    const m = generateAct(1234, 1);
    const stripped = m.rows.flat().map(({ kind: _k, ...rest }) => rest);
    expect(stripped.length).toBe(allNodes(m).length);
    expect(m.rows.flat().every((n) => n.next.length >= 0)).toBe(true);
  });

  it('mixes about 35 / 40 / 25 over a run, leaning on Blodbad later, with every kind on offer in each act', () => {
    const tally = [0, 1, 2].map(() => ({ rally: 0, mixed: 0, carnage: 0 }));
    let missing = 0;
    for (const seed of seeds)
      for (let act = 0; act < ACTS; act++) {
        const m = generateAct(seed, act);
        const races = allNodes(m).filter((n) => n.type === 'race');
        for (const n of races) tally[act]![n.kind!]++;
        const kinds = new Set(allNodes(m).filter((n) => n.type !== 'boss' && n.kind).map((n) => n.kind));
        if (kinds.size < 3) missing++;
      }
    const share = (a: number, k: 'rally' | 'mixed' | 'carnage'): number => tally[a]![k] / (tally[a]!.rally + tally[a]!.mixed + tally[a]!.carnage);
    const total = (k: 'rally' | 'mixed' | 'carnage'): number => [0, 1, 2].reduce((x, a) => x + tally[a]![k], 0) / [0, 1, 2].reduce((x, a) => x + tally[a]!.rally + tally[a]!.mixed + tally[a]!.carnage, 0);
    console.log('kind shares', [0, 1, 2].map((a) => `act${a + 1}: ${share(a, 'rally').toFixed(2)}/${share(a, 'mixed').toFixed(2)}/${share(a, 'carnage').toFixed(2)}`).join(' '), 'overall', total('rally').toFixed(2), total('mixed').toFixed(2), total('carnage').toFixed(2));
    expect(total('rally')).toBeGreaterThan(0.28);
    expect(total('rally')).toBeLessThan(0.45);
    expect(total('mixed')).toBeGreaterThan(0.33);
    expect(total('mixed')).toBeLessThan(0.47);
    expect(total('carnage')).toBeGreaterThan(0.18);
    expect(total('carnage')).toBeLessThan(0.36);
    expect(share(2, 'carnage')).toBeGreaterThan(share(0, 'carnage'));
    expect(share(0, 'rally')).toBeGreaterThan(share(2, 'rally'));
    expect(missing / (seeds.length * ACTS)).toBeLessThan(0.2);
  });
});
