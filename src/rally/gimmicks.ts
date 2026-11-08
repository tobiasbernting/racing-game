// The boss tricks on the road, built from the same small parts as the other hazards: the steward's penalty zones, Göran's
// golf balls, Tina's false signs, Freddie's giant footballs, Mats's ice and Berit's bowling balls and pins. This file owns the
// flying and rolling things (small meshes moving in road coordinates: s along the road, d across it, h above it) and when each
// trick fires; the effect on a car is handed back to the race (`GimmickHost.hit`) so it uses the race's own spin, damage and sound.
import * as THREE from 'three';
import type { GimmickId } from '../shared/gimmicks.ts';
import type { Car } from './car.ts';
import type { Obstacles } from './obstacles.ts';
import type { Track } from './track.ts';
import { rng } from './util.ts';

/** A ball in play: golf (bounces along), football (hops across), bowling (rolls toward you). */
type BallKind = 'golf' | 'football' | 'bowling';

interface Ball {
  kind: BallKind;
  mesh: THREE.Object3D;
  /** Road coordinates: along, across (left is positive), height of the ball's centre above the road. */
  s: number;
  d: number;
  h: number;
  ds: number;
  dd: number;
  vh: number;
  r: number;
  age: number;
  life: number;
  /** Football: seconds it still waits at the roadside before the kick. */
  wind: number;
  /** Where the football started from (-1 or 1 side of the road) and the road's half width there. */
  side: number;
  hw: number;
}

/** What the tricks need from the race. */
export interface GimmickHost {
  track: Track;
  obstacles: Obstacles;
  /** The cars that can be hit (not wrecked, not gone): the player flagged. */
  cars(): { car: Car; me: boolean; id: string }[];
  /** The boss's car, if there is one. */
  boss(): Car | null;
  /** Is the race on (not the countdown, not the finish)? */
  racing(): boolean;
  /** A ball hit a car: `side` is -1/1 across the road, `push` the shove in m/s, `spin` the yaw kick. */
  hit(id: string, kind: BallKind, side: number, push: number, spin: number): void;
  toast(text: string): void;
  /** The steward's whistle, a ball struck, a pin going down. */
  sound(kind: 'whistle' | 'tock' | 'thud' | 'pins'): void;
  /** The minimap turns round for this many seconds (Tina's map). */
  flipMap(sec: number): void;
}

const GRAVITY = 26;
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/** A football's pattern: dark pentagons on white (the faces of an icosphere that look at an icosahedron's corner). */
function footballGeometry(r: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const t = (1 + Math.sqrt(5)) / 2;
  const corners = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize());
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const white = new THREE.Color('#fbfaf5');
  const dark = new THREE.Color('#15171c');
  for (let i = 0; i + 2 < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    const centre = a.add(b).add(c).normalize();
    const patch = corners.some((v) => v.dot(centre) > 0.9);
    for (let k = 0; k < 3; k++) (patch ? dark : white).toArray(colors, (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

export class Gimmicks {
  readonly group = new THREE.Group();
  private balls: Ball[] = [];
  private t = 0;
  private readonly next: Record<GimmickId, number> = { penalty: 3.5, golf: 4, signs: 4, football: 5, ice: 0, bowling: 5 };
  private readonly r: () => number;
  private signCount = 0;
  private said = new Set<string>();
  /** Time penalty in ms the player has picked up (the race adds it to the finish time). */
  penaltyMs = 0;
  private readonly golfGeo = new THREE.IcosahedronGeometry(0.7, 1);
  private readonly golfMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, flatShading: true, emissive: '#ffffff', emissiveIntensity: 0.55 });
  private readonly footGeo = footballGeometry(1.15);
  private readonly footMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, flatShading: true, emissive: '#444444', emissiveIntensity: 0.35 });
  private readonly bowlGeo = new THREE.SphereGeometry(0.85, 14, 10);
  private readonly bowlMat = new THREE.MeshStandardMaterial({ color: '#2a1470', roughness: 0.18, metalness: 0.3, emissive: '#8a4dff', emissiveIntensity: 0.85 });
  private readonly holeGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.06, 8);
  private readonly holeMat = new THREE.MeshBasicMaterial({ color: '#0b0b10' });

  constructor(
    private readonly host: GimmickHost,
    readonly ids: readonly GimmickId[],
    seed: number,
  ) {
    this.r = rng(seed ^ 0x6a33);
    // the steward's permanent zones: two a lap, so there is always something to steer round
    if (ids.includes('penalty')) this.placeZones(2);
  }

  has(id: GimmickId): boolean {
    return this.ids.includes(id);
  }

  get count(): number {
    return this.balls.length;
  }

  /** The balls in play with where they are on the road (for the debug hook). */
  get where(): { kind: BallKind; s: number; d: number; h: number }[] {
    return this.balls.map((b) => ({ kind: b.kind, s: b.s, d: b.d, h: b.h }));
  }

  /** What is in play (for the test hook): balls by kind. */
  get state(): { balls: Record<BallKind, number>; signs: number } {
    const balls: Record<BallKind, number> = { golf: 0, football: 0, bowling: 0 };
    for (const b of this.balls) balls[b.kind]++;
    return { balls, signs: this.signCount };
  }

  private placeZones(perLap: number): void {
    const tr = this.host.track;
    const L = tr.length;
    for (let k = 0; k < perLap; k++) {
      const s = 140 + ((L - 300) * (k + 0.2 + this.r() * 0.6)) / perLap;
      const hw = tr.at(tr.hw, s);
      const p = tr.point(s, (this.r() - 0.5) * (hw - 4) * 1.2);
      this.host.obstacles.add('zone', p.x, p.y, p.z, null, 0, true);
    }
  }

  private say(key: string, text: string): void {
    if (this.said.has(key)) return;
    this.said.add(key);
    this.host.toast(text);
  }

  private makeBall(kind: BallKind): THREE.Object3D {
    let m: THREE.Object3D;
    if (kind === 'golf') m = new THREE.Mesh(this.golfGeo, this.golfMat);
    else if (kind === 'football') m = new THREE.Mesh(this.footGeo, this.footMat);
    else {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(this.bowlGeo, this.bowlMat));
      for (const [x, y, z] of [[0.24, 0.68, 0.27], [-0.07, 0.74, 0.3], [0.13, 0.79, 0.05]] as const) {
        const hole = new THREE.Mesh(this.holeGeo, this.holeMat);
        hole.position.set(x, y, z);
        hole.lookAt(0, 0, 0);
        hole.rotateX(Math.PI / 2);
        g.add(hole);
      }
      m = g;
    }
    this.group.add(m);
    return m;
  }

  private add(b: Omit<Ball, 'mesh' | 'age'>): Ball {
    const ball: Ball = { ...b, mesh: this.makeBall(b.kind), age: 0 };
    this.balls.push(ball);
    this.place(ball);
    return ball;
  }

  private drop(b: Ball): void {
    this.group.remove(b.mesh);
    this.balls = this.balls.filter((x) => x !== b);
  }

  private place(b: Ball): void {
    const p = this.host.track.point(b.s, b.d);
    b.mesh.position.set(p.x, p.y + b.h, p.z);
    if (b.kind === 'football') {
      // a ball about to be kicked squashes and wiggles
      const w = b.wind > 0 ? 1 - 0.14 * Math.abs(Math.sin(b.age * 18)) : 1;
      b.mesh.scale.set(1 + (1 - w) * 0.6, w, 1 + (1 - w) * 0.6);
    }
  }

  update(dt: number): void {
    this.t += dt;
    const racing = this.host.racing();
    const cars = this.host.cars();
    const me = cars.find((c) => c.me)?.car;
    const boss = this.host.boss();
    if (racing) this.fire(dt, me ?? null, boss);
    this.move(dt, cars);
  }

  // ---- when each trick fires ----

  private fire(dt: number, me: Car | null, boss: Car | null): void {
    for (const id of this.ids) {
      this.next[id] -= dt;
      if (this.next[id] > 0) continue;
      const jitter = 0.8 + this.r() * 0.45;
      switch (id) {
        case 'penalty':
          this.next[id] = 7.5 * jitter;
          if (me) this.drawZone(me);
          break;
        case 'golf':
          this.next[id] = 3.4 * jitter;
          if (boss) this.golfShot(boss, me);
          break;
        case 'signs':
          this.next[id] = 5.6 * jitter;
          if (me) this.putSign(me);
          break;
        case 'football':
          this.next[id] = 4.2 * jitter;
          if (me) this.footballShot(me);
          break;
        case 'bowling':
          this.next[id] = 3.8 * jitter;
          if (me) this.bowl(me);
          break;
        case 'ice':
          // a strip behind the boss, one slab every few metres of its way
          this.next[id] = 0.34;
          if (boss && !boss.air && Math.hypot(boss.vx, boss.vz) > 4) {
            const sinH = Math.sin(boss.heading);
            const cosH = Math.cos(boss.heading);
            this.host.obstacles.add('ice', boss.x - sinH * 3.8, boss.y, boss.z - cosH * 3.8, boss, boss.heading);
          }
          break;
      }
    }
  }

  /** The steward draws a red zone on the road ahead of you and blows the whistle. */
  private drawZone(me: Car): void {
    const tr = this.host.track;
    const s = me.proj.s + 70 + this.r() * 40;
    const hw = tr.at(tr.hw, s);
    const p = tr.point(s, (this.r() - 0.5) * (hw - 4) * 1.4);
    this.host.obstacles.add('zone', p.x, p.y, p.z, null, 0);
    this.host.sound('whistle');
    this.say('penalty', '🚩 Torsten: ”Straffzon! Rött fält betyder stopp.”');
  }

  /** Göran tees off: a ball flies out ahead of his cart and bounces down the road. */
  private golfShot(boss: Car, me: Car | null): void {
    const tr = this.host.track;
    const s = boss.proj.s + 5;
    const hw = tr.at(tr.hw, s);
    // aim for the player's side of the road when the player is ahead of him
    const aim = me ? clamp(me.proj.d - boss.proj.d, -hw * 0.5, hw * 0.5) : 0;
    const speed = Math.max(8, Math.hypot(boss.vx, boss.vz));
    this.add({ kind: 'golf', s, d: boss.proj.d, h: 1.4, ds: speed + 16 + this.r() * 10, dd: aim * 0.55 + (this.r() - 0.5) * 7, vh: 9 + this.r() * 3, r: 0.7, life: 10, wind: 0, side: 1, hw });
    this.host.sound('tock');
    this.say('golf', '⛳ Göran: ”Fore! Huvudet ner!”');
  }

  /** Tina puts up a sign with an arrow, mostly at the roadside and now and then in the road; every third time the minimap turns round. */
  private putSign(me: Car): void {
    const tr = this.host.track;
    const s = me.proj.s + 75 + this.r() * 45;
    const hw = tr.at(tr.hw, s);
    const inRoad = this.r() < 0.4;
    const d = inRoad ? (this.r() - 0.5) * (hw - 3) * 1.3 : (this.r() < 0.5 ? -1 : 1) * (hw + 0.9);
    const p = tr.point(s, d);
    this.host.obstacles.add('sign', p.x, p.y, p.z, null, tr.heading(s) + Math.PI);
    this.signCount++;
    this.say('signs', '🗺️ Tina: ”Vänster fyra, hopp, lita på mig!”');
    if (this.signCount % 3 === 0) {
      this.host.flipMap(4.5);
      this.host.toast('🗺️ Tina: ”Oj, kartan hängde upp och ner!”');
    }
  }

  /** Freddie puts a giant ball at the roadside ahead of you; a second later it is kicked across. */
  private footballShot(me: Car): void {
    const tr = this.host.track;
    const s = me.proj.s + 65 + this.r() * 30;
    const hw = tr.at(tr.hw, s);
    const side = this.r() < 0.5 ? -1 : 1;
    this.add({ kind: 'football', s, d: side * (hw + 2.4), h: 1.15, ds: 0, dd: 0, vh: 0, r: 1.15, life: 8, wind: 1.1, side, hw });
    this.say('football', '⚽ Freddie: ”Straff! Jag siktar mot dig.”');
  }

  /** Berit rolls a ball down the road toward you, and every third time sets up pins. */
  private bowl(me: Car): void {
    const tr = this.host.track;
    const s = me.proj.s + 150;
    const hw = tr.at(tr.hw, s);
    this.add({ kind: 'bowling', s, d: (this.r() - 0.5) * (hw - 2.4) * 1.5, h: 0.85, ds: -(24 + this.r() * 7), dd: (this.r() - 0.5) * 1.4, vh: 0, r: 0.85, life: 11, wind: 0, side: 1, hw });
    this.say('bowling', '🎳 Berit: ”Strike! Rulla, lilla klot!”');
    // pins: six in a triangle across a lane, further ahead
    this.pinCount = (this.pinCount ?? 0) + 1;
    if (this.pinCount % 3 === 0) {
      const ps = me.proj.s + 95 + this.r() * 25;
      const phw = tr.at(tr.hw, ps);
      const cd = (this.r() - 0.5) * (phw - 5) * 1.2;
      this.placePins(ps, cd);
    }
  }

  private pinCount = 0;

  private placePins(s: number, d: number): void {
    const tr = this.host.track;
    let k = 0;
    for (let row = 0; row < 3; row++)
      for (let i = 0; i <= row; i++) {
        const ps = s + row * 1.3;
        const pd = d + (i - row / 2) * 1.35;
        const p = tr.point(ps, pd);
        this.host.obstacles.add('pin', p.x, p.y, p.z, null, k++ * 1.7);
      }
  }

  // ---- movement ----

  private move(dt: number, cars: { car: Car; me: boolean; id: string }[]): void {
    const tr = this.host.track;
    const me = cars.find((c) => c.me)?.car;
    for (const b of this.balls.slice()) {
      b.age += dt;
      if (b.age > b.life) {
        this.drop(b);
        continue;
      }
      if (b.kind === 'golf') {
        b.s += b.ds * dt;
        b.d += b.dd * dt;
        b.vh -= GRAVITY * dt;
        b.h += b.vh * dt;
        const hw = tr.at(tr.hw, b.s);
        if (Math.abs(b.d) > hw - 0.6) {
          b.d = clamp(b.d, -(hw - 0.6), hw - 0.6);
          b.dd = -b.dd * 0.7;
        }
        if (b.h < b.r) {
          b.h = b.r;
          b.vh = Math.abs(b.vh) * 0.74;
          if (b.vh < 2.2) b.vh = 0;
          b.ds *= 0.97;
        }
        b.mesh.rotation.x += dt * 14;
      } else if (b.kind === 'football') {
        if (b.wind > 0) {
          b.wind -= dt;
          if (b.wind <= 0) {
            b.dd = -b.side * (15 + this.r() * 3);
            b.vh = 5.2;
            this.host.sound('tock');
          }
        } else {
          b.d += b.dd * dt;
          b.vh -= GRAVITY * dt;
          b.h += b.vh * dt;
          if (b.h < b.r) {
            b.h = b.r;
            b.vh = Math.abs(b.vh) * 0.62;
            if (b.vh < 1.5) b.vh = 0;
          }
          b.mesh.rotation.z += -b.side * dt * 8;
          if (-b.side * b.d > b.hw + 3) {
            this.drop(b);
            continue;
          }
        }
      } else {
        // bowling: rolls along the road toward whoever is coming, following the ground
        b.s += b.ds * dt;
        b.d += b.dd * dt;
        const hw = tr.at(tr.hw, b.s);
        if (Math.abs(b.d) > hw - 1) b.dd = -b.dd;
        b.mesh.rotation.x -= dt * 13;
        if (me && tr.wrapDist(b.s - me.proj.s) < -70) {
          this.drop(b);
          continue;
        }
      }
      this.place(b);
      // a hit: close enough along and across the road, and low enough that the car was under it
      if (b.kind === 'football' && b.wind > 0) continue;
      for (const c of cars) {
        const ds = tr.wrapDist(b.s - c.car.proj.s);
        const dd = b.d - c.car.proj.d;
        const reach = b.r + 1.35;
        if (Math.abs(ds) > reach + 0.8 || Math.abs(dd) > reach || b.h - b.r > 2.1 + c.car.y - tr.point(c.car.proj.s, c.car.proj.d).y) continue;
        if (c.car.air && c.car.y - tr.point(c.car.proj.s, c.car.proj.d).y > 1.6) continue;
        const side = Math.abs(dd) < 0.35 ? (this.r() < 0.5 ? 1 : -1) : -Math.sign(dd);
        const push = b.kind === 'football' ? 9 : b.kind === 'bowling' ? 10 : 6;
        const spin = b.kind === 'football' ? 5.5 : b.kind === 'bowling' ? 6 : 4.2;
        this.host.hit(c.id, b.kind, b.kind === 'football' ? -b.side : side, push, spin);
        this.drop(b);
        break;
      }
    }
  }

  dispose(): void {
    this.golfGeo.dispose();
    this.golfMat.dispose();
    this.footGeo.dispose();
    this.footMat.dispose();
    this.bowlGeo.dispose();
    this.bowlMat.dispose();
    this.holeGeo.dispose();
    this.holeMat.dispose();
    this.balls = [];
  }
}
