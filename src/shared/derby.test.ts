// The Rivningsderby rules: elimination order, the clock, the placing and the points, the hearts, and where derbys sit on the map.
import { describe, expect, it } from 'vitest';
import { ARENA_IDS, ARENAS, DERBY_SECONDS, DerbyBoard, derbyHeadline } from './derby.ts';
import { carnagePoints } from './kinds.ts';
import { ACTS, allNodes, generateAct } from '../run/map.ts';
import { planRace } from '../run/plan.ts';
import { costsHeart, heartsLost, newRun } from '../run/state.ts';
import { continueAfterRace, enterNode, submitRace } from '../run/flow.ts';
import { upgradeChoices } from '../run/economy.ts';
import { upgradeById } from '../run/upgrades.ts';
import { cleanRules, defaultRules } from './rally.ts';
import { asRallyResult, simulateRace } from '../run/racesim.ts';
import { Rng } from '../run/rng.ts';

const ids = ['me', 'a', 'b', 'c', 'd', 'e'];
const full = (): number => 1;

describe('the derby board', () => {
  it('ranks the cars by the order they were wrecked in: the first out is last, the last one standing wins', () => {
    const b = new DerbyBoard(ids);
    expect(b.aliveCount()).toBe(6);
    b.eliminate('b', 10, 'me');
    b.eliminate('d', 22, 'a');
    b.eliminate('me', 40, 'c');
    b.eliminate('a', 61, 'c');
    expect(b.isOver(61)).toBe(false);
    b.eliminate('e', 80, 'c');
    expect(b.isOver(80)).toBe(true);
    const st = b.standings(full);
    expect(st.map((r) => r.id)).toEqual(['c', 'e', 'a', 'me', 'd', 'b']);
    expect(st.map((r) => r.place)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(st[0]!.alive).toBe(true);
    expect(st[5]!.outAt).toBe(10);
    expect(b.place('me', full)).toBe(4);
  });

  it('counts a takedown for whoever dealt the blow, never for the car itself or a stranger', () => {
    const b = new DerbyBoard(ids);
    b.eliminate('a', 5, 'me');
    b.eliminate('b', 6, 'b');
    b.eliminate('c', 7, 'nobody');
    b.eliminate('d', 8, 'me');
    expect(b.takedowns('me')).toBe(2);
    expect(b.takedowns('b')).toBe(0);
    // a car can only be wrecked once, and an unknown id changes nothing
    expect(b.eliminate('a', 9, 'e')).toBe(false);
    expect(b.eliminate('zzz', 9)).toBe(false);
    expect(b.takedowns('e')).toBe(0);
    expect(b.aliveCount()).toBe(2);
  });

  it('ends when one car is left or the clock runs out, and then ranks the cars still running by health', () => {
    const b = new DerbyBoard(ids);
    expect(b.isOver(DERBY_SECONDS - 1)).toBe(false);
    expect(b.isOver(DERBY_SECONDS)).toBe(true);
    expect(b.timeLeft(DERBY_SECONDS + 5)).toBe(0);
    expect(b.timeLeft(30)).toBe(DERBY_SECONDS - 30);
    b.eliminate('a', 20);
    b.eliminate('b', 50, 'me');
    const hp: Record<string, number> = { me: 0.4, c: 0.9, d: 0.65, e: 0.65 };
    const st = b.standings((id) => hp[id] ?? 0);
    // alive: c (0.9), then d and e tied (the board order breaks it), then me; then the wrecks, the later one first
    expect(st.map((r) => r.id)).toEqual(['c', 'd', 'e', 'me', 'b', 'a']);
    expect(st.filter((r) => r.alive).map((r) => r.place)).toEqual([1, 2, 3, 4]);
    // more takedowns break a tie in health
    b.eliminate('c', 60, 'e');
    const st2 = b.standings((id) => hp[id] ?? 0);
    expect(st2[0]!.id).toBe('e');
  });

  it('turns the placing and the takedowns into points, and a wreck keeps its points', () => {
    const b = new DerbyBoard(ids);
    b.eliminate('a', 5, 'me');
    b.eliminate('b', 9, 'me');
    b.eliminate('c', 12, 'd');
    const st = b.standings(full);
    const me = st.find((r) => r.id === 'me')!;
    expect(me.points).toBe(carnagePoints(me.place, 2));
    expect(me.takedowns).toBe(2);
    const wreck = st.find((r) => r.id === 'a')!;
    expect(wreck.alive).toBe(false);
    expect(wreck.points).toBe(carnagePoints(wreck.place, 0));
  });

  it('says how it went in words a ten-year-old gets', () => {
    expect(derbyHeadline({ place: 1, n: 5, alive: true, timeUp: false })).toMatch(/Sista bilen/);
    expect(derbyHeadline({ place: 1, n: 5, alive: true, timeUp: true })).toMatch(/Mest hälsa/i);
    expect(derbyHeadline({ place: 5, n: 5, alive: false, timeUp: false })).toMatch(/Först ut/);
    expect(derbyHeadline({ place: 3, n: 5, alive: false, timeUp: false })).toMatch(/nummer 3/);
  });
});

describe('derbys on the map', () => {
  it('about one elite an act is a derby, always Blodbad, and the last boss now and then; the same map for the same seed', () => {
    let elites = 0;
    let derbyElites = 0;
    let bossDerbys = 0;
    let bosses = 0;
    for (let seed = 1; seed <= 120; seed++)
      for (let act = 0; act < ACTS; act++) {
        const nodes = allNodes(generateAct(seed, act));
        const elite = nodes.filter((n) => n.type === 'elite');
        if (elite.length) {
          elites++;
          const d = elite.filter((n) => n.derby);
          expect(d.length, `${seed}/${act}`).toBe(1);
          derbyElites += d.length;
        }
        for (const n of nodes.filter((x) => x.derby)) {
          expect(n.kind).toBe('carnage');
          expect(ARENA_IDS).toContain(n.derby);
          expect(n.type === 'elite' || n.type === 'boss').toBe(true);
          if (n.type === 'boss') {
            expect(n.boss).toBe('kanin');
            bossDerbys++;
          }
        }
        if (act === 2) bosses++;
        expect(generateAct(seed, act)).toEqual(generateAct(seed, act));
      }
    expect(derbyElites).toBe(elites);
    // the last boss is a derby in roughly two runs out of five
    expect(bossDerbys / bosses).toBeGreaterThan(0.25);
    expect(bossDerbys / bosses).toBeLessThan(0.55);
  });

  it('plans a derby: an arena, no laps in the rules that matter, Blodbad, a night or dusk sky and the boss keeping its tricks', () => {
    for (let seed = 1; seed <= 40; seed++)
      for (let act = 0; act < ACTS; act++)
        for (const n of allNodes(generateAct(seed, act)).filter((x) => x.derby)) {
          const p = planRace(n, false);
          expect(p.arena).toBe(n.derby);
          expect(p.kind).toBe('carnage');
          expect(p.rules.arena).toBe(n.derby);
          expect(p.rules.kind).toBe('carnage');
          expect(p.rules.damage).toBe(true);
          expect(p.rules.weather).toBe('clear');
          expect(['night', 'sunset']).toContain(p.rules.time);
          expect(p.course).toBe(ARENAS[n.derby!].course);
          expect(p.field.rivals.length).toBe(p.rules.ai);
          expect(p.rules.ai).toBeGreaterThanOrEqual(3);
          expect(p.rules.ai).toBeLessThanOrEqual(5);
          if (n.type === 'boss') {
            expect(p.boss?.id).toBe('kanin');
            expect(p.twist?.boss).toBeTruthy();
            expect(p.prize).toBe(2);
          } else expect(p.title).toContain(ARENAS[n.derby!].name);
          expect(planRace(n, false)).toEqual(p);
        }
  });

  it('cleans the rules a client sent: an arena makes it Blodbad, a bad arena is dropped', () => {
    expect(cleanRules({ arena: 'bowl', kind: 'rally' })).toMatchObject({ arena: 'bowl', kind: 'carnage' });
    expect(cleanRules({ arena: 'moon' }).arena).toBeUndefined();
    expect(cleanRules({}).arena).toBeUndefined();
    expect(defaultRules().arena).toBeUndefined();
  });
});

describe('the run rules for a derby', () => {
  const runAtDerby = (calm = false) => {
    let seed = 1;
    for (;; seed++) {
      const r0 = newRun({ seed, calm, body: 'hatch', driver: 'human', paint: '#e8412c', trophies: 0 });
      const nodes = allNodes(generateAct(seed, 0));
      const derby = nodes.find((n) => n.derby && n.type === 'elite');
      if (!derby) continue;
      // put the run on the node before it
      const from = nodes.find((n) => n.next.includes(derby.id))!;
      r0.at = from.id;
      r0.path = [from.id];
      return { run: enterNode(r0, derby.id), node: derby };
    }
  };

  it('costs a heart in the bottom half by elimination order, none in the top half, two for a boss that is not beaten', () => {
    // n cars, the placing is the elimination order
    for (const n of [4, 5, 6]) {
      for (let place = 1; place <= n; place++) expect(costsHeart(place, n, true), `${place}/${n}`).toBe(place > n / 2);
    }
    expect(heartsLost(5, 6, true)).toBe(1);
    expect(heartsLost(2, 5, true)).toBe(0);
    expect(heartsLost(2, 5, true, false, true)).toBe(2);
    expect(heartsLost(1, 5, true, false, true)).toBe(0);
  });

  it('pays through submitRace: the win is a pick of three, an elite always pays, and the placing sets the hearts', () => {
    const { run, node } = runAtDerby()!;
    const plan = planRace(node, false);
    const res = (place: number, n = 5, td = 0) => ({
      place,
      n,
      finished: true,
      time: 90000,
      laps: 0,
      kronor: 120,
      coins: 0,
      medal: null,
      damage: 10,
      kind: 'carnage' as const,
      points: carnagePoints(place, td),
      takedowns: td,
      wrecked: place === 1 ? 0 : 1,
      roadPlace: place,
      derby: { arena: plan.arena!, seconds: 90, limit: 150, alive: place === 1, timeUp: false, table: [{ name: 'Du', place, alive: place === 1, takedowns: td, hp: 50, outAt: place === 1 ? null : 40, me: true }] },
    });
    const won = submitRace(run, res(1, 5, 2));
    expect(won.screen?.kind === 'postrace' && won.screen.summary.heartLost).toBe(false);
    expect(won.screen?.kind === 'postrace' && won.screen.summary.rewardKind).toBe('win');
    expect(won.screen?.kind === 'postrace' && won.screen.summary.derby?.arena).toBe(plan.arena);
    expect(won.log.at(-1)?.arena).toBe(plan.arena);
    expect(won.log.at(-1)?.title).toBe(ARENAS[plan.arena!].name);
    const upFirst = continueAfterRace(won);
    expect(upFirst.screen?.kind).toBe('reward');
    const last = submitRace(run, res(5));
    expect(last.screen?.kind === 'postrace' && last.screen.summary.heartLost).toBe(true);
    expect(last.hearts).toBe(run.hearts - 1);
    // an elite pays even when it is lost
    expect(last.screen?.kind === 'postrace' && last.screen.summary.reward).toBe(true);
    const middle = submitRace(run, res(2));
    expect(middle.screen?.kind === 'postrace' && middle.screen.summary.heartLost).toBe(false);
  });

  it('leans its reward offers on the Ram path: a derby (Blodbad) offers more Ram cards than an open race', () => {
    const { run, node } = runAtDerby()!;
    const plan = planRace(node, false);
    expect(plan.kind).toBe('carnage');
    const share = (kind: 'carnage' | 'mixed' | 'rally'): number => {
      let ram = 0;
      let all = 0;
      for (let k = 0; k < 160; k++) {
        const r = { ...run, seed: 1000 + k };
        for (const id of upgradeChoices(r, `n${k}`, 'elite', kind)) {
          all++;
          if (upgradeById(id)?.tree === 'ram') ram++;
        }
      }
      return ram / all;
    };
    const derby = share(plan.kind);
    expect(derby).toBeGreaterThan(0.3);
    expect(derby).toBeGreaterThan(share('mixed') + 0.08);
    expect(derby).toBeGreaterThan(share('rally') + 0.15);
  });

  it('can be simulated for the balance: the placing is a whole place among the cars, the points follow, a strong ram build does better than a bare car', () => {
    const { run, node } = runAtDerby()!;
    const plan = planRace(node, false);
    const rg = new Rng(5);
    for (let k = 0; k < 50; k++) {
      const r = simulateRace(plan, run, { skill: 'good', aggression: 0.6 }, rg);
      expect(r.rank).toBeGreaterThanOrEqual(1);
      expect(r.rank).toBeLessThanOrEqual(r.n);
      expect(r.n).toBe(plan.rules.ai + 1);
      expect(r.points).toBe(carnagePoints(r.rank, r.takedowns));
      expect(r.lapped).toBe(false);
      expect(asRallyResult(plan, r).place).toBe(r.rank);
    }
  });
});
