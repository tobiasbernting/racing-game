// Things lying on the road that spin whoever drives over them: slime puddles (dropped by a trinket, never
// hurting their owner) and hay bales (the farmer boss's trick). Plain meshes, a handful at a time.
import * as THREE from 'three';
import type { Car } from './car.ts';
import type { Track } from './track.ts';
import { rng } from './util.ts';

export interface Obstacle {
  kind: 'banana' | 'hay' | 'oil' | 'pothole';
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
      this.add('hay', p.x, p.y, p.z, null, track.heading(s) + (r() - 0.5) * 1.2);
    }
  }

  add(kind: Obstacle['kind'], x: number, y: number, z: number, owner: Car | null, yaw = Math.random() * 6.28, forever = false): void {
    const geo = kind === 'banana' ? this.bananaGeo : kind === 'oil' ? this.oilGeo : kind === 'pothole' ? this.holeGeo : this.hayGeo;
    const mat = kind === 'banana' ? this.bananaMat : kind === 'oil' ? this.oilMat : kind === 'pothole' ? this.holeMat : this.hayMat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + (kind === 'banana' ? 0.2 : kind === 'hay' ? 0.85 : 0.07), z);
    mesh.rotation.y = yaw;
    mesh.castShadow = false;
    this.group.add(mesh);
    this.list.push({ kind, x, y, z, owner, age: 0, mesh, life: forever ? 0 : kind === 'oil' ? OIL_LIFE : kind === 'banana' ? BANANA_LIFE : 0 });
    if (kind === 'banana') {
      const bananas = this.list.filter((o) => o.kind === 'banana');
      if (bananas.length > MAX_BANANAS) this.remove(bananas[0]!);
    } else if (kind === 'oil' && !forever) {
      const oils = this.list.filter((o) => o.kind === 'oil' && o.life > 0);
      if (oils.length > MAX_OIL) this.remove(oils[0]!);
    }
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
      if ((o.kind === 'banana' || o.kind === 'oil') && o.age < 0.4 && o.owner) continue;
      const dx = car.x - o.x;
      const dz = car.z - o.z;
      const r = o.kind === 'oil' ? HIT_R * 1.35 : o.kind === 'pothole' ? HIT_R * 0.6 : HIT_R;
      if (dx * dx + dz * dz < r * r * car.size) {
        this.lastHit.set(car, this.clock);
        if (o.kind === 'banana') this.remove(o);
        return o;
      }
    }
    return null;
  }

  update(dt: number): void {
    this.clock += dt;
    for (const o of this.list.slice()) {
      o.age += dt;
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
    this.list = [];
  }
}
