// Things lying on the road that spin whoever drives over them: banana peels (dropped by a trinket, never
// hurting their owner) and hay bales (the farmer boss's trick). Plain meshes, a handful at a time.
import * as THREE from 'three';
import type { Car } from './car.ts';
import type { Track } from './track.ts';
import { rng } from './util.ts';

export interface Obstacle {
  kind: 'banana' | 'hay';
  x: number;
  y: number;
  z: number;
  owner: Car | null;
  age: number;
  mesh: THREE.Object3D;
}

const MAX_BANANAS = 14;
const BANANA_LIFE = 45;
const HIT_R = 1.7;

export class Obstacles {
  readonly group = new THREE.Group();
  private list: Obstacle[] = [];
  private readonly bananaGeo: THREE.BufferGeometry;
  private readonly bananaMat = new THREE.MeshStandardMaterial({ color: '#ffe135', roughness: 0.5, emissive: '#6b5500', emissiveIntensity: 0.3 });
  private readonly hayGeo: THREE.BufferGeometry;
  private readonly hayMat = new THREE.MeshLambertMaterial({ color: '#e0b84a' });
  private readonly lastHit = new WeakMap<Car, number>();
  private clock = 0;

  constructor() {
    // a banana: a curved sausage lying flat
    this.bananaGeo = new THREE.TorusGeometry(0.55, 0.17, 6, 12, Math.PI * 1.1);
    this.bananaGeo.rotateX(-Math.PI / 2);
    this.hayGeo = new THREE.CylinderGeometry(0.85, 0.85, 1.5, 12);
    this.hayGeo.rotateZ(Math.PI / 2);
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

  add(kind: 'banana' | 'hay', x: number, y: number, z: number, owner: Car | null, yaw = Math.random() * 6.28): void {
    const mesh = new THREE.Mesh(kind === 'banana' ? this.bananaGeo : this.hayGeo, kind === 'banana' ? this.bananaMat : this.hayMat);
    mesh.position.set(x, y + (kind === 'banana' ? 0.2 : 0.85), z);
    mesh.rotation.y = yaw;
    mesh.castShadow = false;
    this.group.add(mesh);
    this.list.push({ kind, x, y, z, owner, age: 0, mesh });
    if (kind === 'banana') {
      const bananas = this.list.filter((o) => o.kind === 'banana');
      if (bananas.length > MAX_BANANAS) this.remove(bananas[0]!);
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
      if (o.kind === 'banana' && o.age < 0.4 && o.owner) continue;
      const dx = car.x - o.x;
      const dz = car.z - o.z;
      if (dx * dx + dz * dz < HIT_R * HIT_R * car.size) {
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
      if (o.kind === 'banana' && o.age > BANANA_LIFE) this.remove(o);
    }
  }

  dispose(): void {
    this.bananaGeo.dispose();
    this.bananaMat.dispose();
    this.hayGeo.dispose();
    this.hayMat.dispose();
    this.list = [];
  }
}
