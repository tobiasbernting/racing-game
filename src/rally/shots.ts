// Things a vehicle throws: ice-cream scoops from the glassbil's cannon and the golf ball of "Hole in one".
// A shot flies in an arc from where it was fired to a spot (or to a car that moves on the way) and then calls back.
import * as THREE from 'three';

export type ShotKind = 'scoop' | 'ball';

interface Shot {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  /** A moving target: the end point follows it. */
  follow: (() => THREE.Vector3 | null) | null;
  t: number;
  flight: number;
  height: number;
  land(): void;
}

const SCOOPS = ['#ff8fc8', '#fff0b8', '#8fe3ff', '#b6f08a'];

export class Shots {
  readonly group = new THREE.Group();
  private list: Shot[] = [];
  private readonly scoopGeo = new THREE.IcosahedronGeometry(0.42, 1);
  private readonly ballGeo = new THREE.IcosahedronGeometry(0.3, 1);
  private readonly mats = SCOOPS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, flatShading: true, emissive: c, emissiveIntensity: 0.25 }));
  private readonly ballMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, flatShading: true, emissive: '#ffffff', emissiveIntensity: 0.5 });

  get count(): number {
    return this.list.length;
  }

  fire(kind: ShotKind, from: THREE.Vector3, to: THREE.Vector3, flight: number, o: { colour?: number; height?: number; follow?: () => THREE.Vector3 | null; land(): void }): void {
    const mesh = new THREE.Mesh(kind === 'ball' ? this.ballGeo : this.scoopGeo, kind === 'ball' ? this.ballMat : this.mats[(o.colour ?? 0) % this.mats.length]!);
    mesh.position.copy(from);
    this.group.add(mesh);
    this.list.push({ mesh, from: from.clone(), to: to.clone(), follow: o.follow ?? null, t: 0, flight, height: o.height ?? 3.5, land: o.land });
  }

  update(dt: number): void {
    for (const s of this.list.slice()) {
      s.t += dt;
      const k = Math.min(1, s.t / s.flight);
      if (s.follow) {
        const p = s.follow();
        if (p) s.to.copy(p);
      }
      s.mesh.position.lerpVectors(s.from, s.to, k);
      s.mesh.position.y += 4 * s.height * k * (1 - k);
      s.mesh.rotation.x += dt * 9;
      s.mesh.rotation.z += dt * 6;
      if (k >= 1) {
        this.group.remove(s.mesh);
        this.list = this.list.filter((x) => x !== s);
        s.land();
      }
    }
  }

  dispose(): void {
    this.scoopGeo.dispose();
    this.ballGeo.dispose();
    for (const m of this.mats) m.dispose();
    this.ballMat.dispose();
    this.list = [];
  }
}
