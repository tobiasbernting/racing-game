// Coins on the road for the roguelite: lines and arcs of gold coins placed from a seed, spinning, picked up
// by driving through them. The magnet trinket pulls them in. They come back every lap.
import * as THREE from 'three';
import type { Track } from './track.ts';
import { rng } from './util.ts';

export interface CoinSpot {
  s: number;
  d: number;
  x: number;
  y: number;
  z: number;
}

/** Coins per lap are placed in short lines; this is the number of lines. */
const LINES = 7;
const PER_LINE = 4;
const REACH = 2.7;

export function placeCoins(track: Track, seed: number): CoinSpot[] {
  const r = rng(seed ^ 0xc01);
  const out: CoinSpot[] = [];
  const L = track.length;
  for (let k = 0; k < LINES; k++) {
    const s0 = 70 + ((L - 150) * (k + 0.15 + r() * 0.5)) / LINES;
    const hw = track.at(track.hw, s0);
    const d0 = (r() - 0.5) * (hw - 3) * 1.3;
    const wave = r() < 0.5 ? 0 : 1.6 + r();
    for (let j = 0; j < PER_LINE; j++) {
      const s = s0 + j * 4.2;
      const d = d0 + Math.sin(j * 0.9) * wave;
      const p = track.point(s, d);
      out.push({ s, d, x: p.x, y: p.y, z: p.z });
    }
  }
  return out;
}

export class Coins {
  readonly mesh: THREE.InstancedMesh;
  private readonly spots: CoinSpot[];
  /** Current positions (the magnet moves them) and whether they are still there. */
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly pz: Float32Array;
  private readonly alive: Uint8Array;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly pos = new THREE.Vector3();
  private readonly scl = new THREE.Vector3(1, 1, 1);
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly hide = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(track: Track, seed: number) {
    this.spots = placeCoins(track, seed);
    const n = this.spots.length;
    const geo = new THREE.CylinderGeometry(0.75, 0.75, 0.16, 14);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: '#ffc928', emissive: '#c98a00', emissiveIntensity: 0.55, metalness: 0.6, roughness: 0.3 });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.pz = new Float32Array(n);
    this.alive = new Uint8Array(n);
    this.reset();
  }

  get count(): number {
    return this.spots.length;
  }

  /** A new lap: every coin is back. */
  reset(): void {
    this.spots.forEach((c, i) => {
      this.px[i] = c.x;
      this.py[i] = c.y + 1.0;
      this.pz[i] = c.z;
      this.alive[i] = 1;
    });
  }

  /**
   * Spin the coins, pull in those within `magnet` metres, and return how many the car at (x, y, z) picked up.
   * `onPick` is called with each coin's position (for a sparkle).
   */
  update(dt: number, time: number, x: number, y: number, z: number, magnet: number, collect: boolean, onPick?: (x: number, y: number, z: number) => void): number {
    let got = 0;
    const m2 = magnet * magnet;
    for (let i = 0; i < this.spots.length; i++) {
      if (!this.alive[i]) continue;
      let dx = x - this.px[i]!;
      let dz = z - this.pz[i]!;
      let d2 = dx * dx + dz * dz;
      if (collect && magnet > 0 && d2 < m2 && d2 > 1) {
        // closer coins fly faster
        const d = Math.sqrt(d2);
        const v = (14 + 40 * (1 - d / magnet)) * dt;
        this.px[i] = this.px[i]! + (dx / d) * v;
        this.pz[i] = this.pz[i]! + (dz / d) * v;
        this.py[i] = this.py[i]! + (y + 1 - this.py[i]!) * Math.min(1, dt * 6);
        dx = x - this.px[i]!;
        dz = z - this.pz[i]!;
        d2 = dx * dx + dz * dz;
      }
      if (collect && d2 < REACH * REACH && Math.abs(y + 0.8 - this.py[i]!) < 3.2) {
        this.alive[i] = 0;
        got++;
        onPick?.(this.px[i]!, this.py[i]!, this.pz[i]!);
        this.mesh.setMatrixAt(i, this.hide);
        continue;
      }
      this.q.setFromAxisAngle(this.up, time * 3 + i * 0.7);
      this.pos.set(this.px[i]!, this.py[i]! + Math.sin(time * 4 + i) * 0.12, this.pz[i]!);
      this.m.compose(this.pos, this.q, this.scl);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    return got;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
