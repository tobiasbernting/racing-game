// The look of the ramps (ramps.ts): a wedge of planks painted in hazard stripes with a lip in a bright colour, sitting
// on the road exactly where the physics lifts the car, a tall flag so it can be seen from far off, and for the shortcut
// jump a big arch with a pulsing sign. One merged mesh for the solid parts, one for the glowing bits.
import * as THREE from 'three';
import { Geo, canvasTex } from './geo.ts';
import { lipOf, rampHeight, type RampSpec } from './ramps.ts';
import type { Track } from './track.ts';

export interface RampMeshes {
  group: THREE.Group;
  /** Pulse the signs. */
  update(time: number): void;
  dispose(): void;
}

const ORANGE = new THREE.Color('#ff8a1f');
const CREAM = new THREE.Color('#f2e6c8');
const DARK = new THREE.Color('#26262c');
const LIP = new THREE.Color('#ffd23f');
const SHORT = new THREE.Color('#2fd9a4');

/** A sign texture: big letters on a plate. */
function signTex(text: string, bg: string, fg: string): THREE.CanvasTexture {
  return canvasTex(512, 160, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    for (let k = -20; k < w + 20; k += 36) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k + 18, 0);
      g.lineTo(k + 4, 14);
      g.lineTo(k - 14, 14);
      g.fill();
      g.beginPath();
      g.moveTo(k, h);
      g.lineTo(k + 18, h);
      g.lineTo(k + 4, h - 14);
      g.lineTo(k - 14, h - 14);
      g.fill();
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `900 92px Impact, 'Arial Black', system-ui, sans-serif`;
    g.fillText(text, w / 2, h / 2 + 4, w - 40);
  });
}

/** The wedge or hump as a mesh of coloured quads, sampled in road coordinates so it follows the road under it. */
function rampGeometry(track: Track, r: RampSpec, yLift = 0.02): THREE.BufferGeometry {
  const nu = Math.max(6, Math.round(r.len / 0.8));
  const nv = Math.max(4, Math.round(r.width / 0.7));
  const c = Math.cos(r.ang);
  const s = Math.sin(r.ang);
  const pos: number[] = [];
  const col: number[] = [];
  const tmp = { x: 0, y: 0, z: 0 };
  const at = (iu: number, iv: number, down = false): [number, number, number] => {
    const u = -r.len / 2 + (r.len * iu) / nu;
    // sample a touch wider than the ramp: the soft sides are part of the shape
    const v = -(r.width / 2 + 0.7) + ((r.width + 1.4) * iv) / nv;
    const ds = u * c - v * s;
    const dd = u * s + v * c;
    track.point(r.s + ds, r.d + dd, tmp);
    const h = rampHeight(r, ds, dd);
    return [tmp.x, down ? tmp.y + yLift : tmp.y + h + yLift + (h > 0.01 ? 0.01 : 0), tmp.z];
  };
  const push = (a: number[], b: number[], cc: number[], d: number[], color: THREE.Color): void => {
    for (const p of [a, b, cc, a, cc, d]) {
      pos.push(p[0]!, p[1]!, p[2]!);
      col.push(color.r, color.g, color.b);
    }
  };
  const tint = new THREE.Color();
  for (let iu = 0; iu < nu; iu++)
    for (let iv = 0; iv < nv; iv++) {
      const stripe = Math.floor(iu / 2) % 2 === 0;
      const edge = iv === 0 || iv === nv - 1;
      tint.copy(edge ? DARK : stripe ? ORANGE : CREAM);
      // the last planks at the lip are the bright ones
      if (r.kind !== 'hump' && iu >= nu - 1 && !edge) tint.copy(r.kind === 'shortcut' ? SHORT : LIP);
      // lighten the upward face a hair with height so the wedge reads in flat light
      push(at(iu, iv), at(iu + 1, iv), at(iu + 1, iv + 1), at(iu, iv + 1), tint);
    }
  // the sides and the back: boards down to the road (so it is a solid thing, not a sheet)
  const wall = (iu0: number, iv0: number, iu1: number, iv1: number): void => {
    const a = at(iu0, iv0);
    const b = at(iu1, iv1);
    const a0 = at(iu0, iv0, true);
    const b0 = at(iu1, iv1, true);
    push(a0, b0, b, a, DARK);
  };
  for (let iu = 0; iu < nu; iu++) {
    wall(iu, 0, iu + 1, 0);
    wall(iu + 1, nv, iu, nv);
  }
  for (let iv = 0; iv < nv; iv++) {
    wall(nu, iv, nu, iv + 1);
    wall(0, iv + 1, 0, iv);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** Builds the meshes for a set of ramps on a track. */
export function buildRampMeshes(track: Track, ramps: readonly RampSpec[], quality: 'high' | 'low'): RampMeshes {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => (disposables.push(x), x);
  const solid = new Geo();
  const glow = new Geo();
  const pulse: { mat: THREE.MeshBasicMaterial; phase: number }[] = [];
  const tmp = { x: 0, y: 0, z: 0 };
  const parts: THREE.BufferGeometry[] = [];
  for (const r of ramps) {
    parts.push(rampGeometry(track, r));
    // flagpoles with pennants either side, so it can be seen from far off
    const edge = r.width / 2 + 1.1;
    for (const side of [-1, 1]) {
      const p = track.point(r.s - side * edge * Math.sin(r.ang), r.d + side * edge * Math.cos(r.ang), tmp);
      const h = r.kind === 'shortcut' ? 9 : 5;
      solid.cyl(0.07, 0.1, h, 6, '#d8d4c8', p.x, p.y + h / 2, p.z);
      glow.box(0.1, 0.55, 1.0, r.kind === 'shortcut' ? '#2fd9a4' : '#ffd23f', p.x, p.y + h - 0.35, p.z, 0, track.heading(r.s) + Math.PI / 2, 0);
    }
    if (r.kind === 'shortcut') {
      // a big arch over the road at the take-off, with a pulsing sign: GENVÄG
      const lip = lipOf(r);
      const left = track.point(lip.s - 2.5, lip.d + r.width / 2 + 1.6, tmp);
      const lx = left.x;
      const ly = left.y;
      const lz = left.z;
      const right = track.point(lip.s - 2.5, lip.d - r.width / 2 - 1.6, tmp);
      const hd = track.heading(lip.s);
      const topY = (ly + right.y) / 2 + 8.5;
      for (const q of [{ x: lx, y: ly, z: lz }, { x: right.x, y: right.y, z: right.z }]) solid.cyl(0.28, 0.34, 8.6, 7, '#3a3d44', q.x, q.y + 4.3, q.z);
      const mx = (lx + right.x) / 2;
      const mz = (lz + right.z) / 2;
      const span = Math.hypot(lx - right.x, lz - right.z);
      solid.box(span + 0.6, 0.45, 0.45, '#3a3d44', mx, topY, mz, 0, hd, 0);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(span * 0.78, span * 0.78 * (160 / 512)), keep(new THREE.MeshBasicMaterial({ map: keep(signTex('GENVÄG ➜', '#12342d', '#2fd9a4')), side: THREE.DoubleSide, color: new THREE.Color(1.5, 1.5, 1.5) })));
      sign.position.set(mx, topY - 1.25, mz);
      sign.rotation.y = hd + Math.PI;
      sign.frustumCulled = false;
      group.add(sign);
    }
  }
  const solidGeo = keep(solid.build());
  const merged = new THREE.Mesh(solidGeo, keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  merged.frustumCulled = false;
  group.add(merged);
  if (parts.length) {
    // the wedges themselves, merged into one
    let count = 0;
    for (const g of parts) count += g.getAttribute('position').count;
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    let o = 0;
    for (const g of parts) {
      pos.set(g.getAttribute('position').array as Float32Array, o * 3);
      nor.set(g.getAttribute('normal').array as Float32Array, o * 3);
      col.set(g.getAttribute('color').array as Float32Array, o * 3);
      o += g.getAttribute('position').count;
      g.dispose();
    }
    const rg = keep(new THREE.BufferGeometry());
    rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    rg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(rg, keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide })));
    mesh.frustumCulled = false;
    mesh.castShadow = quality === 'high';
    mesh.receiveShadow = quality === 'high';
    group.add(mesh);
  }
  if (!glow.empty) {
    const gg = keep(glow.build());
    const gm = keep(new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.8, 1.8, 1.8) }));
    pulse.push({ mat: gm, phase: 0 });
    const mesh = new THREE.Mesh(gg, gm);
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return {
    group,
    update(time) {
      for (const p of pulse) p.mat.color.setScalar(1.4 + 0.7 * Math.sin(time * 4 + p.phase));
    },
    dispose() {
      for (const d of disposables) d.dispose();
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.geometry) m.geometry.dispose();
      });
    },
  };
}
