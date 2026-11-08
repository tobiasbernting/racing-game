// Things lying on the road that spin whoever drives over them: slime puddles (dropped by a trinket, never
// hurting their owner) and hay bales (the farmer boss's trick). Plain meshes, a handful at a time.
import * as THREE from 'three';
import type { Car } from './car.ts';
import type { Track } from './track.ts';
import { rng } from './util.ts';

export interface Obstacle {
  kind: 'banana' | 'hay' | 'oil' | 'pothole' | 'glass' | 'tent' | 'mine' | 'coin';
  x: number;
  y: number;
  z: number;
  owner: Car | null;
  age: number;
  mesh: THREE.Object3D;
  /** Seconds it lasts (0 = for the whole race). */
  life: number;
}

const MAX_BANANAS = 14;
const BANANA_LIFE = 45;
const HIT_R = 1.7;
const MAX_OIL = 10;
const OIL_LIFE = 28;

export class Obstacles {
  readonly group = new THREE.Group();
  private list: Obstacle[] = [];
  private readonly bananaGeo: THREE.BufferGeometry;
  private readonly bananaMat = new THREE.MeshStandardMaterial({ color: '#7ed321', roughness: 0.25, emissive: '#2f6a00', emissiveIntensity: 0.45 });
  private readonly hayGeo: THREE.BufferGeometry;
  private readonly hayMat = new THREE.MeshLambertMaterial({ color: '#e0b84a' });
  private readonly oilGeo: THREE.BufferGeometry;
  private readonly oilMat = new THREE.MeshStandardMaterial({ color: '#0d0b14', roughness: 0.08, metalness: 0.4, emissive: '#2a1060', emissiveIntensity: 0.35 });
  private readonly holeGeo: THREE.BufferGeometry;
  private readonly holeMat = new THREE.MeshLambertMaterial({ color: '#17140f' });
  private readonly glassGeo: THREE.BufferGeometry;
  private readonly glassMats = ['#ff8fc8', '#8fe3ff', '#fff0b8'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, emissive: c, emissiveIntensity: 0.35 }));
  private readonly tentGeo: THREE.BufferGeometry;
  private readonly tentMats = [new THREE.MeshLambertMaterial({ color: '#e8412c' }), new THREE.MeshLambertMaterial({ color: '#f4f1ea' })];
  private readonly mineGeo: THREE.BufferGeometry;
  private readonly mineMat = new THREE.MeshStandardMaterial({ color: '#3a3d46', roughness: 0.5, metalness: 0.5, emissive: '#ff2a1a', emissiveIntensity: 0.5 });
  private readonly coinGeo: THREE.BufferGeometry;
  private readonly coinMat = new THREE.MeshStandardMaterial({ color: '#ffc928', emissive: '#c98a00', emissiveIntensity: 0.55, metalness: 0.6, roughness: 0.3 });
  private readonly lastHit = new WeakMap<Car, number>();
  private clock = 0;

  constructor() {
    // a puddle of slime: a squashed lumpy blob
    this.bananaGeo = new THREE.SphereGeometry(0.95, 10, 7);
    this.bananaGeo.scale(1.3, 0.22, 1);
    this.hayGeo = new THREE.CylinderGeometry(0.85, 0.85, 1.5, 12);
    this.hayGeo.rotateZ(Math.PI / 2);
    // an oil slick: a wide, flat, shiny disc; a pothole: a dark dent
    this.oilGeo = new THREE.CylinderGeometry(1.9, 2.1, 0.05, 20);
    this.oilGeo.scale(1.25, 1, 0.95);
    this.holeGeo = new THREE.CylinderGeometry(0.95, 0.95, 0.06, 14);
    // a melted scoop of ice cream: a wide, flat, lumpy puddle
    this.glassGeo = new THREE.IcosahedronGeometry(1.0, 1);
    this.glassGeo.scale(1.5, 0.22, 1.35);
    // an awning: a striped canopy, tilted, on two poles (one geometry, the stripes are merged in add())
    this.tentGeo = new THREE.BoxGeometry(0.62, 0.1, 2.2);
    // a mine: a flat dark disc with a red light on top; a coin that is not what it seems: the real coin's shape and colour
    this.mineGeo = new THREE.CylinderGeometry(0.62, 0.7, 0.16, 12);
    this.coinGeo = new THREE.CylinderGeometry(0.75, 0.75, 0.16, 14);
    this.coinGeo.rotateX(Math.PI / 2);
  }

  /** Takes one obstacle off the road (the garbage truck picks it up). */
  take(o: Obstacle): void {
    this.remove(o);
  }

  /** Clears everything lying in a corridor in front of a point (the lawn mower's blades): how many pieces went. */
  clearAhead(x: number, z: number, heading: number, reach: number, halfWidth: number): { n: number; at: { x: number; y: number; z: number }[] } {
    const sinH = Math.sin(heading);
    const cosH = Math.cos(heading);
    const at: { x: number; y: number; z: number }[] = [];
    for (const o of this.list.slice()) {
      const dx = o.x - x;
      const dz = o.z - z;
      const fwd = dx * sinH + dz * cosH;
      const lat = dx * cosH - dz * sinH;
      if (fwd < -1 || fwd > reach || Math.abs(lat) > halfWidth) continue;
      at.push({ x: o.x, y: o.y, z: o.z });
      this.remove(o);
    }
    return { n: at.length, at };
  }

  /** Oil slicks and potholes on the road for the whole race, a few per lap, from a seed. */
  placeHazards(track: Track, perLap: { oil: number; pothole: number }, seed: number): void {
    const r = rng(seed ^ 0x0a11);
    const L = track.length;
    for (const [kind, n] of [['oil', perLap.oil], ['pothole', perLap.pothole]] as const)
      for (let k = 0; k < n; k++) {
        const s = 110 + ((L - 230) * (k + 0.15 + r() * 0.7)) / Math.max(1, n);
        const hw = track.at(track.hw, s);
        const p = track.point(s, (r() - 0.5) * (hw - 2.6) * 1.6);
        this.add(kind, p.x, p.y, p.z, null, track.heading(s) + (r() - 0.5) * 1.4, true);
      }
  }

  get count(): number {
    return this.list.length;
  }

  /** Hay bales on the road, a few per lap, from a seed. */
  placeHay(track: Track, perLap: number, seed: number): void {
    const r = rng(seed ^ 0x4a7);
    const L = track.length;
    for (let k = 0; k < perLap; k++) {
      const s = 90 + ((L - 190) * (k + 0.2 + r() * 0.6)) / perLap;
      const hw = track.at(track.hw, s);
      const p = track.point(s, (r() - 0.5) * (hw - 3) * 1.5);
      this.add('hay', p.x, p.y, p.z, null, track.heading(s) + (r() - 0.5) * 1.2, true);
    }
  }

  add(kind: Obstacle['kind'], x: number, y: number, z: number, owner: Car | null, yaw = Math.random() * 6.28, forever = false): void {
    let mesh: THREE.Object3D;
    if (kind === 'tent') {
      // seven red and white panels fanned out like a canopy, held up by two poles
      const g = new THREE.Group();
      for (let i = 0; i < 7; i++) {
        const p = new THREE.Mesh(this.tentGeo, this.tentMats[i % 2]!);
        p.position.set(-1.9 + i * 0.62, 1.55 - Math.abs(i - 3) * 0.04, 0);
        p.rotation.x = -0.28;
        g.add(p);
      }
      for (const sx of [-1, 1]) {
        const pole = new THREE.Mesh(this.tentPole(), this.tentMats[1]!);
        pole.position.set(sx * 1.9, 0.8, 0.85);
        g.add(pole);
      }
      g.position.set(x, y, z);
      mesh = g;
    } else {
      const geo = kind === 'banana' ? this.bananaGeo : kind === 'oil' ? this.oilGeo : kind === 'pothole' ? this.holeGeo : kind === 'glass' ? this.glassGeo : kind === 'mine' ? this.mineGeo : kind === 'coin' ? this.coinGeo : this.hayGeo;
      const mat = kind === 'banana' ? this.bananaMat : kind === 'oil' ? this.oilMat : kind === 'pothole' ? this.holeMat : kind === 'glass' ? this.glassMats[Math.floor(Math.random() * this.glassMats.length)]! : kind === 'mine' ? this.mineMat : kind === 'coin' ? this.coinMat : this.hayMat;
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y + (kind === 'banana' ? 0.2 : kind === 'hay' ? 0.85 : kind === 'glass' ? 0.12 : kind === 'mine' ? 0.1 : kind === 'coin' ? 1.0 : 0.07), z);
      m.castShadow = false;
      mesh = m;
    }
    mesh.rotation.y = yaw;
    this.group.add(mesh);
    this.list.push({ kind, x, y, z, owner, age: 0, mesh, life: forever ? 0 : kind === 'oil' ? OIL_LIFE : kind === 'banana' ? BANANA_LIFE : kind === 'hay' ? 22 : kind === 'glass' ? 20 : kind === 'tent' ? 13 : kind === 'mine' ? 40 : kind === 'coin' ? 32 : 0 });
    if (kind === 'banana') {
      const bananas = this.list.filter((o) => o.kind === 'banana');
      if (bananas.length > MAX_BANANAS) this.remove(bananas[0]!);
    } else if (kind === 'mine' || kind === 'coin') {
      const same = this.list.filter((q) => q.kind === kind);
      if (same.length > (kind === 'mine' ? 6 : 5)) this.remove(same[0]!);
    } else if (kind === 'oil' && !forever) {
      const oils = this.list.filter((o) => o.kind === 'oil' && o.life > 0);
      if (oils.length > MAX_OIL) this.remove(oils[0]!);
    }
  }

  private poleGeo: THREE.BufferGeometry | null = null;
  private tentPole(): THREE.BufferGeometry {
    return (this.poleGeo ??= new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6));
  }

  private remove(o: Obstacle): void {
    this.group.remove(o.mesh);
    this.list = this.list.filter((x) => x !== o);
  }

  /** Does this car run over something? Bananas are used up; hay stays. Not the owner's own bananas. */
  touch(car: Car): Obstacle | null {
    if (car.air) return null;
    const last = this.lastHit.get(car) ?? -9;
    if (this.clock - last < 1.2) return null;
    for (const o of this.list) {
      if (o.owner === car) continue;
      if ((o.kind === 'banana' || o.kind === 'oil' || o.kind === 'glass' || o.kind === 'tent' || o.kind === 'mine' || o.kind === 'coin') && o.age < 0.4 && o.owner) continue;
      const dx = car.x - o.x;
      const dz = car.z - o.z;
      const r = o.kind === 'oil' ? HIT_R * 1.35 : o.kind === 'pothole' ? HIT_R * 0.6 : o.kind === 'glass' ? HIT_R * 1.2 : o.kind === 'tent' ? HIT_R * 1.7 : o.kind === 'mine' || o.kind === 'coin' ? HIT_R * 1.1 : HIT_R;
      if (dx * dx + dz * dz < r * r * car.size) {
        this.lastHit.set(car, this.clock);
        if (o.kind === 'banana' || o.kind === 'mine' || o.kind === 'coin') this.remove(o);
        return o;
      }
    }
    return null;
  }

  update(dt: number): void {
    this.clock += dt;
    for (const o of this.list.slice()) {
      o.age += dt;
      if (o.kind === 'coin') o.mesh.rotation.y += dt * 3.2;
      else if (o.kind === 'mine') o.mesh.scale.setScalar(1 + 0.05 * Math.sin(o.age * 8));
      if (o.life > 0 && o.age > o.life) this.remove(o);
    }
  }

  dispose(): void {
    this.bananaGeo.dispose();
    this.bananaMat.dispose();
    this.hayGeo.dispose();
    this.hayMat.dispose();
    this.oilGeo.dispose();
    this.oilMat.dispose();
    this.holeGeo.dispose();
    this.holeMat.dispose();
    this.glassGeo.dispose();
    for (const m of this.glassMats) m.dispose();
    this.tentGeo.dispose();
    this.mineGeo.dispose();
    this.mineMat.dispose();
    this.coinGeo.dispose();
    this.coinMat.dispose();
    this.poleGeo?.dispose();
    for (const m of this.tentMats) m.dispose();
    this.list = [];
  }
}
