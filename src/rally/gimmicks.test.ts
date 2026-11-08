// The boss tricks headless: the real track, the real obstacle list, cars placed on the road and a host that writes down what happened.
import { describe, expect, it } from 'vitest';
import { GIMMICK_IDS, type GimmickId } from '../shared/gimmicks.ts';
import { Car } from './car.ts';
import { COURSES } from './courses.ts';
import { Gimmicks, type GimmickHost } from './gimmicks.ts';
import { Obstacles } from './obstacles.ts';
import { Track } from './track.ts';

const ground = { height: () => 0 };

function setup(ids: GimmickId[], opts: { racing?: boolean } = {}) {
  const track = new Track(COURSES.farm);
  const obstacles = new Obstacles();
  const me = new Car(track);
  me.place(300, 0, ground);
  const boss = new Car(track);
  boss.place(320, 0, ground);
  boss.vx = Math.sin(boss.heading) * 20;
  boss.vz = Math.cos(boss.heading) * 20;
  const log = { hits: [] as { id: string; kind: string }[], toasts: [] as string[], sounds: [] as string[], flips: 0 };
  const state = { racing: opts.racing ?? true };
  const host: GimmickHost = {
    track,
    obstacles,
    cars: () => [
      { car: me, me: true, id: 'me' },
      { car: boss, me: false, id: 'boss' },
    ],
    boss: () => boss,
    racing: () => state.racing,
    hit: (id, kind) => log.hits.push({ id, kind }),
    toast: (t) => log.toasts.push(t),
    sound: (k) => log.sounds.push(k),
    flipMap: () => log.flips++,
  };
  const g = new Gimmicks(host, ids, 1234);
  const run = (secs: number, dt = 1 / 60): void => {
    for (let t = 0; t < secs; t += dt) {
      for (const c of [me, boss]) track.project(c.x, c.z, c.proj.i, c.proj);
      g.update(dt);
      obstacles.update(dt);
    }
  };
  return { track, obstacles, me, boss, g, log, run, state };
}

describe('the boss gimmicks', () => {
  it('there is one for every trick, named and described', () => {
    expect(GIMMICK_IDS).toEqual(['penalty', 'golf', 'signs', 'football', 'ice', 'bowling']);
  });

  it('nothing happens before the race starts', () => {
    const s = setup(['golf', 'football', 'bowling', 'signs', 'ice'], { racing: false });
    const before = s.obstacles.count;
    s.run(12);
    expect(s.g.count).toBe(0);
    expect(s.obstacles.count).toBe(before);
    expect(s.log.toasts).toEqual([]);
  });

  it('the steward lays zones on the road from the start, draws more ahead of you and blows his whistle', () => {
    const s = setup(['penalty']);
    expect(s.obstacles.countOf('zone')).toBe(2);
    s.run(9);
    expect(s.obstacles.countOf('zone')).toBeGreaterThan(2);
    expect(s.log.sounds).toContain('whistle');
    expect(s.log.toasts.some((t) => t.includes('Torsten'))).toBe(true);
    // a car in the zone is caught by the obstacle list (the race turns that into the penalty)
    const z = new Car(s.track);
    z.place(0, 0, ground);
    const spot = s.track.point(500, 0);
    s.obstacles.add('zone', spot.x, spot.y, spot.z, null, 0, true);
    z.x = spot.x;
    z.z = spot.z;
    z.y = spot.y;
    expect(s.obstacles.touch(z)?.kind).toBe('zone');
  });

  it('Göran tees off: bouncing golf balls that stay on or above the road and knock a car they hit', () => {
    const s = setup(['golf']);
    s.run(4.5);
    expect(s.g.state.balls.golf).toBeGreaterThan(0);
    expect(s.log.sounds).toContain('tock');
    expect(s.log.toasts.some((t) => t.includes('Göran'))).toBe(true);
    // put a ball on top of a car: it hits
    const s2 = setup(['golf']);
    s2.run(4.2);
    const ball = (s2.g as unknown as { balls: { s: number; d: number; h: number; ds: number; dd: number; r: number }[] }).balls[0]!;
    expect(ball).toBeTruthy();
    expect(ball.h).toBeGreaterThanOrEqual(ball.r - 1e-6);
    s2.me.place(ball.s, ball.d, ground);
    s2.track.project(s2.me.x, s2.me.z, -1, s2.me.proj);
    ball.h = ball.r + 0.2;
    ball.ds = 0;
    ball.dd = 0;
    s2.run(0.1);
    expect(s2.log.hits.some((h) => h.id === 'me' && h.kind === 'golf')).toBe(true);
  });

  it('Freddie leaves a ball at the roadside, kicks it across a moment later, and it hits what is in the way', () => {
    const s = setup(['football']);
    s.run(6);
    expect(s.g.state.balls.football).toBeGreaterThan(0);
    const balls = (s.g as unknown as { balls: { kind: string; wind: number; dd: number; d: number; s: number; h: number; side: number; hw: number }[] }).balls.filter((b) => b.kind === 'football');
    const b = balls[0]!;
    // waiting: on the verge, off the road; after the wait it moves across
    const s2 = setup(['football']);
    s2.run(5.1);
    const waiting = (s2.g as unknown as { balls: typeof balls }).balls.find((x) => x.kind === 'football' && x.wind > 0);
    if (waiting) expect(Math.abs(waiting.d)).toBeGreaterThan(waiting.hw);
    s2.run(1.4);
    const rolling = (s2.g as unknown as { balls: typeof balls }).balls.find((x) => x.kind === 'football' && x.wind <= 0);
    if (rolling) expect(Math.abs(rolling.dd)).toBeGreaterThan(10);
    // a car in its path is hit
    s.me.place(b.s, 0, ground);
    s.track.project(s.me.x, s.me.z, -1, s.me.proj);
    b.wind = 0;
    b.dd = -b.side * 16;
    b.d = 0.8 * b.side;
    b.h = 1.2;
    s.run(0.2);
    expect(s.log.hits.some((h) => h.id === 'me' && h.kind === 'football')).toBe(true);
  });

  it('Berit rolls a ball down the road toward you, and every third time sets up pins', () => {
    const s = setup(['bowling']);
    s.run(5.4);
    expect(s.g.state.balls.bowling).toBeGreaterThan(0);
    const b = (s.g as unknown as { balls: { kind: string; s: number; ds: number }[] }).balls.find((x) => x.kind === 'bowling')!;
    expect(b.ds).toBeLessThan(0);
    // ahead of the player when it starts, rolling back toward them
    expect(s.track.wrapDist(b.s - s.me.proj.s)).toBeGreaterThan(20);
    s.run(14);
    expect(s.obstacles.countOf('pin')).toBeGreaterThanOrEqual(6);
    expect(s.log.toasts.some((t) => t.includes('Berit'))).toBe(true);
  });

  it('Tina puts up signs, some in the road, and turns the minimap round now and then', () => {
    const s = setup(['signs']);
    s.run(22);
    expect(s.obstacles.countOf('sign')).toBeGreaterThanOrEqual(3);
    expect(s.log.flips).toBeGreaterThanOrEqual(1);
    expect(s.log.toasts.some((t) => t.includes('Vänster fyra, hopp, lita på mig'))).toBe(true);
  });

  it('Mats leaves a strip of ice behind him, and the strip melts away', () => {
    const s = setup(['ice']);
    // the boss keeps rolling
    for (let t = 0; t < 4; t += 1 / 60) {
      s.boss.vx = Math.sin(s.boss.heading) * 20;
      s.boss.vz = Math.cos(s.boss.heading) * 20;
      s.boss.x += s.boss.vx / 60;
      s.boss.z += s.boss.vz / 60;
      s.run(1 / 60, 1 / 60);
    }
    expect(s.obstacles.countOf('ice')).toBeGreaterThan(8);
    // his own ice does not catch him
    expect(s.obstacles.touch(s.boss)).toBeNull();
    s.boss.vx = s.boss.vz = 0;
    s.run(14);
    expect(s.obstacles.countOf('ice')).toBe(0);
  });

  it('a champion can borrow any one gimmick and the same seed lays the same zones', () => {
    const a = setup(['penalty']);
    const b = setup(['penalty']);
    expect(a.obstacles.count).toBe(b.obstacles.count);
    for (const id of GIMMICK_IDS) expect(() => setup([id]).run(5)).not.toThrow();
  });
});
