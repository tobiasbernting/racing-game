import { describe, expect, it } from 'vitest';
import { ACTS, ACT_COURSES, ROWS, allNodes, findNode, generateAct, reachableFromStart } from './map.ts';

const seeds = Array.from({ length: 150 }, (_, i) => i * 7919 + 1);

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
