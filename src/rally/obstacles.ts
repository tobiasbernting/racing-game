// Things lying on the road that spin whoever drives over them: slime puddles (dropped by a trinket, never
// hurting their owner), hay bales, and the boss tricks: the steward's penalty zones, the goalkeeper's ice, the co-driver's false
// signs and the bowler's pins. Plain meshes, a handful at a time.
import * as THREE from 'three';
import type { Car } from './car.ts';
import type { Track } from './track.ts';
import { rng } from './util.ts';

export interface Obstacle {
  kind: 'banana' | 'hay' | 'oil' | 'pothole' | 'glass' | 'tent' | 'mine' | 'coin' | 'zone' | 'ice' | 'sign' | 'pin';
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
  private readonly zoneGeos: THREE.BufferGeometry[];
  private readonly zoneMats = [new THREE.MeshStandardMaterial({ color: '#e0201c', roughness: 0.6, emissive: '#a00c08', emissiveIntensity: 0.55 }), new THREE.MeshStandardMaterial({ color: '#fff4e0', roughness: 0.6, emissive: '#fff4e0', emissiveIntensity: 0.3 })];
  private readonly iceGeo: THREE.BufferGeometry;
  private readonly iceMat = new THREE.MeshStandardMaterial({ color: '#bfeeff', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.82, emissive: '#6fc8ff', emissiveIntensity: 0.45 });
  private readonly signGeos: { post: THREE.BufferGeometry; board: THREE.BufferGeometry; arrowShaft: THREE.BufferGeometry; arrowHead: THREE.BufferGeometry };
  private readonly signMats = { post: new THREE.MeshLambertMaterial({ color: '#8a8d95' }), board: new THREE.MeshStandardMaterial({ color: '#1f6fe0', roughness: 0.4, emissive: '#0a3a90', emissiveIntensity: 0.4 }), arrow: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.5 }) };
  private readonly pinGeo: THREE.BufferGeometry;
  private readonly pinMats = [new THREE.MeshStandardMaterial({ color: '#fbfaf5', roughness: 0.3, emissive: '#fbfaf5', emissiveIntensity: 0.25 }), new THREE.MeshStandardMaterial({ color: '#e0201c', roughness: 0.4, emissive: '#a00c08', emissiveIntensity: 0.3 })];
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
    // a penalty zone: a red disc, a white ring and a red heart of the target, so it reads as "no" from far away
    this.zoneGeos = [new THREE.CylinderGeometry(3.3, 3.3, 0.06, 28), new THREE.CylinderGeometry(2.6, 2.6, 0.08, 28), new THREE.CylinderGeometry(1.9, 1.9, 0.1, 28)];
    // an ice strip: a flat, glassy slab
    this.iceGeo = new THREE.BoxGeometry(3.6, 0.07, 3.4);
    // a false road sign: a pole and a round blue board with a white arrow
    const arrowHead = new THREE.ConeGeometry(0.42, 0.6, 3);
    arrowHead.rotateZ(-Math.PI / 2);
    arrowHead.translate(0.52, 0, 0.0);
    const board = new THREE.CylinderGeometry(0.95, 0.95, 0.12, 20);
    board.rotateX(Math.PI / 2);
    this.signGeos = { post: new THREE.BoxGeometry(0.12, 2.2, 0.12), board, arrowShaft: new THREE.BoxGeometry(0.9, 0.24, 0.05), arrowHead };
    // a bowling pin: a lathe of the pin's outline
    this.pinGeo = new THREE.LatheGeometry(
      [[0.0, 0], [0.26, 0], [0.34, 0.18], [0.36, 0.42], [0.26, 0.78], [0.14, 0.98], [0.15, 1.12], [0.24, 1.28], [0.24, 1.44], [0.12, 1.56], [0, 1.58]].map(([x, y]) => new THREE.Vector2(x!, y!)),
      10,
    );
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

  /** Where the things of one kind lie (for the debug hook). */
  positions(kind: Obstacle['kind']): { x: number; z: number }[] {
    return this.list.filter((o) => o.kind === kind).map((o) => ({ x: o.x, z: o.z }));
  }

  /** How many of one kind lie on the road (for tests and the debug hook). */
  countOf(kind: Obstacle['kind']): number {
    return this.list.filter((o) => o.kind === kind).length;
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
    if (kind === 'zone') {
      const g = new THREE.Group();
      this.zoneGeos.forEach((geo, i) => {
        const m = new THREE.Mesh(geo, this.zoneMats[i % 2]!);
        m.position.y = 0.07 + i * 0.012;
        g.add(m);
      });
      // a white bar across it, like a "no entry" sign
      const bar = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.14, 0.55), this.zoneMats[1]!);
      bar.position.y = 0.2;
      g.add(bar);
      g.position.set(x, y, z);
      mesh = g;
    } else if (kind === 'sign') {
      const g = new THREE.Group();
      const post = new THREE.Mesh(this.signGeos.post, this.signMats.post);
      post.position.y = 1.1;
      const board = new THREE.Mesh(this.signGeos.board, this.signMats.board);
      board.position.y = 2.35;
      const arrow = new THREE.Group();
      arrow.add(new THREE.Mesh(this.signGeos.arrowShaft, this.signMats.arrow), new THREE.Mesh(this.signGeos.arrowHead, this.signMats.arrow));
      arrow.position.set(0, 2.35, 0.09);
      // the arrow points left or right as seen from the road (yaw already faces the board to the cars)
      arrow.scale.x = Math.random() < 0.5 ? -1 : 1;
      g.add(post, board, arrow);
      g.position.set(x, y, z);
      mesh = g;
    } else if (kind === 'pin') {
      const g = new THREE.Group();
      const body = new THREE.Mesh(this.pinGeo, this.pinMats[0]!);
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.27, 0.1, 10), this.pinMats[1]!);
      stripe.position.y = 1.05;
      body.scale.setScalar(1.05);
      g.add(body, stripe);
      g.position.set(x, y + 0.02, z);
      mesh = g;
    } else if (kind === 'tent') {
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
      const geo = kind === 'ice' ? this.iceGeo : kind === 'banana' ? this.bananaGeo : kind === 'oil' ? this.oilGeo : kind === 'pothole' ? this.holeGeo : kind === 'glass' ? this.glassGeo : kind === 'mine' ? this.mineGeo : kind === 'coin' ? this.coinGeo : this.hayGeo;
      const mat = kind === 'ice' ? this.iceMat : kind === 'banana' ? this.bananaMat : kind === 'oil' ? this.oilMat : kind === 'pothole' ? this.holeMat : kind === 'glass' ? this.glassMats[Math.floor(Math.random() * this.glassMats.length)]! : kind === 'mine' ? this.mineMat : kind === 'coin' ? this.coinMat : this.hayMat;
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y + (kind === 'ice' ? 0.06 : kind === 'banana' ? 0.2 : kind === 'hay' ? 0.85 : kind === 'glass' ? 0.12 : kind === 'mine' ? 0.1 : kind === 'coin' ? 1.0 : 0.07), z);
      m.castShadow = false;
      mesh = m;
    }
    mesh.rotation.y = yaw;
    this.group.add(mesh);
    this.list.push({ kind, x, y, z, owner, age: 0, mesh, life: forever ? 0 : kind === 'zone' ? 18 : kind === 'ice' ? 11 : kind === 'sign' ? 20 : kind === 'pin' ? 40 : kind === 'oil' ? OIL_LIFE : kind === 'banana' ? BANANA_LIFE : kind === 'hay' ? 22 : kind === 'glass' ? 20 : kind === 'tent' ? 13 : kind === 'mine' ? 40 : kind === 'coin' ? 32 : 0 });
    if (kind === 'banana') {
      const bananas = this.list.filter((o) => o.kind === 'banana');
      if (bananas.length > MAX_BANANAS) this.remove(bananas[0]!);
    } else if (kind === 'mine' || kind === 'coin') {
      const same = this.list.filter((q) => q.kind === kind);
      if (same.length > (kind === 'mine' ? 6 : 5)) this.remove(same[0]!);
    } else if (kind === 'ice' || kind === 'pin' || kind === 'zone' || kind === 'sign') {
      const cap = kind === 'ice' ? 44 : kind === 'pin' ? 36 : kind === 'zone' ? 7 : 8;
      const same = this.list.filter((q) => q.kind === kind && q.life > 0);
      if (same.length > cap) this.remove(same[0]!);
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
      const r = o.kind === 'zone' ? HIT_R * 1.85 : o.kind === 'ice' ? HIT_R * 1.45 : o.kind === 'sign' ? HIT_R * 0.85 : o.kind === 'pin' ? HIT_R * 0.7 : o.kind === 'oil' ? HIT_R * 1.35 : o.kind === 'pothole' ? HIT_R * 0.6 : o.kind === 'glass' ? HIT_R * 1.2 : o.kind === 'tent' ? HIT_R * 1.7 : o.kind === 'mine' || o.kind === 'coin' ? HIT_R * 1.1 : HIT_R;
      if (dx * dx + dz * dz < r * r * car.size) {
        this.lastHit.set(car, this.clock);
        if (o.kind === 'banana' || o.kind === 'mine' || o.kind === 'coin' || o.kind === 'pin') this.remove(o);
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
    for (const g of this.zoneGeos) g.dispose();
    for (const m of this.zoneMats) m.dispose();
    this.iceGeo.dispose();
    this.iceMat.dispose();
    for (const g of Object.values(this.signGeos)) g.dispose();
    for (const m of Object.values(this.signMats)) m.dispose();
    this.pinGeo.dispose();
    for (const m of this.pinMats) m.dispose();
    for (const m of this.tentMats) m.dispose();
    this.list = [];
  }
}
