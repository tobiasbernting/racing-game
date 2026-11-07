// Trackside attitude for every course: tyre walls in the corners, hay bales with sponsor banners at the start,
// billboards for made-up brands, scrapyard piles, oil barrels (some burning, with a flickering glow), floodlights,
// and a rowdier crowd with flags, signs and smoking flares. One merged mesh for the solid things, one for the
// banners, one for flames and one for cloth, so a whole course costs a handful of draw calls; the sets (candy,
// the moon, the kitchen…) get their own palette so they keep their crazy themes but look worn and used.
import * as THREE from 'three';
import type { CourseDef } from './courses.ts';
import { Geo, canvasTex, mat } from './geo.ts';
import { lakeDist, streamDist } from './layout.ts';
import { outlineMesh } from './look.ts';
import type { Terrain } from './terrain.ts';
import type { Track } from './track.ts';
import type { Variation } from '../shared/variation.ts';
import { rng } from './util.ts';

export interface Smoker {
  x: number;
  y: number;
  z: number;
  /** 0 = a burning barrel (black smoke), 1 = a flare (red smoke). */
  kind: 0 | 1;
}

export interface Attitude {
  group: THREE.Group;
  smokers: Smoker[];
  /** Flicker the lights near the player. */
  update(time: number, focus: THREE.Vector3): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// The sponsor atlas: banners and billboards (512 x 192 each, 2 x 4) and little signs (256 x 128, 4 x 2)
// ---------------------------------------------------------------------------

interface Brand {
  name: string;
  slogan: string;
  bg: string;
  fg: string;
  accent: string;
}

const BRANDS: Brand[] = [
  { name: 'GRUSOLJA', slogan: 'Smörj grusvägen', bg: '#ffcf1f', fg: '#15171c', accent: '#15171c' },
  { name: 'KAOSBENSIN', slogan: 'Tanka och strunta i det', bg: '#d8321f', fg: '#f6f1e6', accent: '#ffd23f' },
  { name: 'DÄCK & DUNDER', slogan: 'Rullar tills det smäller', bg: '#15171c', fg: '#f6f1e6', accent: '#ff7a1a' },
  { name: 'SKROTFIX', slogan: 'Vi fixar det som går sönder', bg: '#ff7a1a', fg: '#15171c', accent: '#15171c' },
  { name: 'MACKENS KIOSK', slogan: 'Korv, kaffe och karosser', bg: '#18a89a', fg: '#f6f1e6', accent: '#15171c' },
  { name: 'SURSTARK', slogan: 'Energi som luktar', bg: '#6ccf3a', fg: '#15171c', accent: '#15171c' },
  { name: 'FLÄKTFABRIKEN', slogan: 'Blås bort konkurrenterna', bg: '#2a6fe0', fg: '#f6f1e6', accent: '#ffd23f' },
  { name: 'KORVTURBO', slogan: 'Fullgas på senap', bg: '#f4eadb', fg: '#c1281c', accent: '#c1281c' },
];
const SIGNS = ['GAS!', 'KAOS!', 'FULLGAS', 'KÖR!', 'HEJA!', 'VROOM', 'MER ELD', 'TUTA!'];
/** Which brands a set shows (indices), so the moon does not advertise oil for farm tractors. */
const SET_BRANDS: Record<string, number[]> = {
  candy: [4, 5, 7, 1, 2, 0, 3, 6],
  moon: [6, 0, 2, 5, 3, 1, 4, 7],
  kitchen: [7, 4, 5, 1, 6, 0, 2, 3],
};
const CELL_W = 512;
const CELL_H = 192;
const SIGN_W = 256;
const SIGN_H = 128;

function drawAtlas(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.clearRect(0, 0, w, h);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  BRANDS.forEach((b, i) => {
    const x = (i % 2) * CELL_W;
    const y = Math.floor(i / 2) * CELL_H;
    g.save();
    g.translate(x, y);
    g.fillStyle = b.bg;
    g.fillRect(0, 0, CELL_W, CELL_H);
    // hazard stripes along the edges, a worn look from scuffs
    g.fillStyle = b.accent;
    for (let k = 0; k < CELL_W; k += 28) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k + 14, 0);
      g.lineTo(k + 2, 12);
      g.lineTo(k - 12, 12);
      g.fill();
      g.beginPath();
      g.moveTo(k, CELL_H);
      g.lineTo(k + 14, CELL_H);
      g.lineTo(k + 2, CELL_H - 12);
      g.lineTo(k - 12, CELL_H - 12);
      g.fill();
    }
    g.fillStyle = b.fg;
    const size = b.name.length > 11 ? 66 : b.name.length > 8 ? 82 : 98;
    g.font = `900 ${size}px Impact, 'Arial Black', system-ui, sans-serif`;
    g.fillText(b.name, CELL_W / 2, CELL_H * 0.46, CELL_W - 40);
    g.font = `700 26px system-ui, Arial, sans-serif`;
    g.fillText(b.slogan.toUpperCase(), CELL_W / 2, CELL_H * 0.82, CELL_W - 40);
    // scuffs, tape and grime
    g.globalAlpha = 0.16;
    g.fillStyle = '#000000';
    const r = rng(i * 31 + 7);
    for (let k = 0; k < 26; k++) g.fillRect(r() * CELL_W, r() * CELL_H, 8 + r() * 60, 2 + r() * 6);
    g.globalAlpha = 0.5;
    g.fillStyle = '#e8e1c8';
    g.fillRect(CELL_W - 70, CELL_H - 22, 60, 16);
    g.restore();
  });
  const y0 = CELL_H * 4;
  SIGNS.forEach((t, i) => {
    const x = (i % 4) * SIGN_W;
    const y = y0 + Math.floor(i / 4) * SIGN_H;
    g.save();
    g.translate(x, y);
    g.fillStyle = i % 2 ? '#f6f1e6' : '#ffd23f';
    g.fillRect(4, 4, SIGN_W - 8, SIGN_H - 8);
    g.strokeStyle = '#15171c';
    g.lineWidth = 8;
    g.strokeRect(8, 8, SIGN_W - 16, SIGN_H - 16);
    g.fillStyle = i % 3 === 0 ? '#c1281c' : '#15171c';
    g.font = `900 ${t.length > 5 ? 46 : 62}px Impact, 'Arial Black', system-ui, sans-serif`;
    g.fillText(t, SIGN_W / 2, SIGN_H / 2 + 3, SIGN_W - 36);
    g.restore();
  });
}

// ---------------------------------------------------------------------------
// Palettes: the same props, dressed for the set
// ---------------------------------------------------------------------------

interface Pal {
  tyre: string;
  band: string[];
  hay: string;
  barrels: string[];
  scrap: string[];
  /** Burning barrels per course (before quality). */
  fires: number;
  scraps: number;
  /** Tyre walls, hay bales and crates: what the set calls them. */
  crates: boolean;
  pole: string;
  /** Extra darkening of everything (worn, dirty). */
  grime: number;
}

const BASE: Pal = {
  tyre: '#1a1a1e',
  band: ['#e8e4d8', '#d8321f', '#ffcf1f'],
  hay: '#d4aa44',
  barrels: ['#b4301f', '#2a5fb0', '#d9a21f', '#3a3d44'],
  scrap: ['#8a4a2a', '#6a3a22', '#4a5a6a', '#7a6a4a', '#5a2a22'],
  fires: 5,
  scraps: 3,
  crates: false,
  pole: '#6a6e76',
  grime: 0.9,
};
const PALS: Record<string, Partial<Pal>> = {
  desert: { hay: '#c9a05a', scrap: ['#9a5a30', '#7a4a2a', '#6a6a60', '#a07a4a'], fires: 4 },
  volcano: { tyre: '#121214', hay: '#4a4440', scrap: ['#3a2a26', '#4a3028', '#2a2a30', '#5a3a2a'], fires: 8, grime: 0.8 },
  candy: { tyre: '#2a1e30', band: ['#f06ba8', '#fff4fa', '#7de0d4'], hay: '#e8a0c4', barrels: ['#e0508c', '#46c0b4', '#f4c84a', '#8a62d0'], scrap: ['#d9709c', '#7ac8c0', '#e8b84a', '#9a7ad0'], fires: 3, crates: true, pole: '#d8d0d8', grime: 0.8 },
  moon: { tyre: '#2a2c34', band: ['#e8ecf4', '#ff7a1a', '#e8ecf4'], hay: '#8a8e9a', barrels: ['#e8ecf4', '#ff7a1a', '#7a7e8a', '#e8ecf4'], scrap: ['#8a8e9a', '#aab0bc', '#6a6e7a', '#ff7a1a'], fires: 2, crates: true, pole: '#9a9eaa', grime: 0.85 },
  kitchen: { tyre: '#2a2018', band: ['#e8d8b0', '#c1281c', '#e8d8b0'], hay: '#c8a860', barrels: ['#c8c0b0', '#c1281c', '#5a7a4a', '#e8d8b0'], scrap: ['#8a8a92', '#6a6a72', '#a07a4a', '#4a3a30'], fires: 5, crates: false, pole: '#8a8a92', grime: 0.78 },
  city: { hay: '#bba060', scraps: 4, fires: 5 },
  ice: { hay: '#cbb270', fires: 4, scraps: 2 },
  beach: { hay: '#e0c06a', fires: 3, scraps: 2 },
};

const _c = new THREE.Color();
const grim = (hex: string, k: number): string => '#' + _c.set(hex).multiplyScalar(k).getHexString();

// ---------------------------------------------------------------------------
// The shaders for flames and flags
// ---------------------------------------------------------------------------

const FLAME_VERT = /* glsl */ `
attribute float phase;
attribute vec3 tint;
uniform float uTime;
varying vec2 vUv;
varying vec3 vTint;
varying float vPh;
void main() {
  vUv = uv;
  vTint = tint;
  vPh = phase;
  vec3 p = position;
  float t = uTime * 11.0 + phase * 6.2831;
  float k = uv.y;
  // flicker: the tip dances and the whole flame breathes in height
  p.y = (position.y - 0.0) * (0.82 + 0.28 * sin(t) * sin(t * 0.37 + 1.3));
  p.x += (sin(t * 1.3) * 0.06 + sin(t * 2.9) * 0.03) * k * 2.0;
  p.z += (cos(t * 1.1) * 0.06) * k * 2.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FLAME_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vTint;
varying float vPh;
uniform float uTime;
void main() {
  float x = abs(vUv.x - 0.5) * 2.0;
  float shape = 1.0 - smoothstep(0.0, 1.0, x / max(0.05, 1.0 - vUv.y * 0.92));
  float flick = 0.8 + 0.2 * sin(uTime * 17.0 + vPh * 9.0 + vUv.y * 5.0);
  float a = shape * (1.0 - vUv.y) * flick;
  // white-yellow in the core, tint at the edges and the tip
  vec3 hot = mix(vTint, vec3(1.0, 0.7, 0.3), smoothstep(0.4, 0.0, vUv.y + x * 0.5));
  gl_FragColor = vec4(hot * 1.35, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------------------

/**
 * Builds the layer. `crowds` are the spots where the scenery put its spectators (the rowdier fans stand there too).
 */
export function buildAttitude(
  track: Track,
  terrain: Terrain,
  course: CourseDef,
  quality: 'high' | 'low',
  timeU: { value: number },
  night: boolean,
  vary: Variation | null,
  crowds: THREE.Vector3[],
): Attitude {
  const high = quality === 'high';
  const set = course.theme.scenery as string;
  const pal: Pal = { ...BASE, ...(PALS[set] ?? {}) };
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => (disposables.push(x), x);
  const r = rng(20270101 + set.length * 131 + (vary ? (vary.seed & 0xffff) * 7 : 0));
  const dens = (vary?.density ?? 1) * (high ? 1 : 0.62);
  const L = course.layout;
  const smokers: Smoker[] = [];
  const g = new Geo();
  const lamps = new Geo();
  const cloth = { pos: [] as number[], nor: [] as number[], col: [] as number[], uv: [] as number[] };
  const flame = { pos: [] as number[], uv: [] as number[], ph: [] as number[], tint: [] as number[] };
  const ban = { pos: [] as number[], uv: [] as number[], nor: [] as number[] };
  const fires: THREE.Vector3[] = [];
  const brandOrder = SET_BRANDS[set] ?? [0, 1, 2, 3, 4, 5, 6, 7];

  const outer = (s: number, sgn: number, off: number): { x: number; z: number; y: number; rot: number } => {
    const wall = track.at(sgn > 0 ? track.wallL : track.wallR, s);
    const p = track.point(s, sgn * (wall + off));
    const c = track.point(s, 0);
    return { x: p.x, z: p.z, y: terrain.visual(p.x, p.z), rot: Math.atan2(c.x - p.x, c.z - p.z) };
  };
  const clear = (x: number, z: number, need: number): boolean => terrain.roadDist(x, z) > need && lakeDist(x, z, L) > 1.08 && streamDist(x, z, L).d > 7;
  const used: [number, number, number][] = [];
  const free = (x: number, z: number, rad: number): boolean => {
    for (const [ux, uz, ur] of used) if ((x - ux) ** 2 + (z - uz) ** 2 < (rad + ur) ** 2) return false;
    return true;
  };

  // ---- pieces ----
  const tyreStack = (x: number, y: number, z: number, n: number, bandCol: string | null): void => {
    for (let k = 0; k < n; k++) {
      const col = bandCol && k === 1 ? bandCol : grim(pal.tyre, 0.9 + r() * 0.35);
      g.cyl(0.43, 0.43, 0.29, 9, col, x + (r() - 0.5) * 0.06, y + 0.145 + k * 0.29, z + (r() - 0.5) * 0.06, 0, r() * 3, 0);
    }
    g.cyl(0.2, 0.2, 0.03, 8, '#0a0a0c', x, y + n * 0.29 + 0.005, z);
  };
  const barrel = (x: number, y: number, z: number, col: string, lie = false): void => {
    const c = grim(col, pal.grime * (0.85 + r() * 0.3));
    const rx = lie ? Math.PI / 2 : 0;
    const ry = r() * 6;
    const yy = y + (lie ? 0.3 : 0.45);
    g.cyl(0.3, 0.3, 0.9, 8, c, x, yy, z, rx, ry, 0);
    for (const dy of [-0.26, 0.26]) g.cyl(0.315, 0.315, 0.05, 8, grim(col, 0.6), x, yy + (lie ? 0 : dy), z + (lie ? dy : 0), rx, ry, 0);
    if (!lie) g.cyl(0.27, 0.27, 0.03, 8, '#26262a', x, y + 0.91, z);
  };
  const hay = (x: number, y: number, z: number, rot: number): void => {
    const c = grim(pal.hay, 0.85 + r() * 0.25);
    g.box(1.25, 0.78, 0.85, c, x, y + 0.39, z, 0, rot, 0);
    for (const dx of [-0.32, 0.32]) g.box(0.05, 0.8, 0.87, '#3a3228', x + Math.cos(rot) * dx, y + 0.39, z - Math.sin(rot) * dx, 0, rot, 0);
  };
  const crate = (x: number, y: number, z: number, rot: number, col: string): void => {
    g.box(1.1, 0.9, 1.1, grim(col, pal.grime), x, y + 0.45, z, 0, rot, 0);
    g.box(1.14, 0.12, 1.14, '#2a2a2e', x, y + 0.85, z, 0, rot, 0);
    g.box(1.14, 0.12, 1.14, '#2a2a2e', x, y + 0.08, z, 0, rot, 0);
  };
  const scrapCar = (x: number, y: number, z: number, rot: number, tilt: number, col: string): void => {
    const m = (px: number, py: number, pz: number): THREE.Matrix4 => mat(x, y, z, 0, rot, tilt).multiply(mat(px, py, pz));
    const add = (w: number, h: number, d: number, c: string, px: number, py: number, pz: number): void => {
      g.add(new THREE.BoxGeometry(w, h, d), grim(c, 1.2 * pal.grime * (0.8 + r() * 0.3)), m(px, py, pz));
    };
    add(1.8, 0.7, 4.2, col, 0, 0.7, 0);
    add(1.6, 0.6, 2.0, grim(col, 0.9), 0, 1.3, -0.2);
    add(1.5, 0.45, 1.7, '#16181d', 0, 1.35, -0.2);
    add(0.7, 0.12, 0.9, '#5a3a22', 0.4, 0.85, 1.4);
    if (r() < 0.6) g.add(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 8), '#17171a', m(-0.95, 0.38, 1.3).multiply(mat(0, 0, 0, 0, 0, Math.PI / 2)));
    if (r() < 0.5) g.add(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 8), '#17171a', m(0.95, 0.38, -1.4).multiply(mat(0, 0, 0, 0, 0, Math.PI / 2)));
  };
  /** Two crossed flame quads on `at`, `w` wide and `h` tall. */
  const addFlame = (at: THREE.Vector3, w: number, h: number, tint: THREE.Color, ph: number): void => {
    for (const a of [0, Math.PI / 2]) {
      const c = Math.cos(a);
      const s = Math.sin(a);
      const P = [
        [-w / 2, 0],
        [w / 2, 0],
        [w / 2, h],
        [-w / 2, h],
      ] as const;
      const uvs = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ] as const;
      for (const k of [0, 1, 2, 0, 2, 3]) {
        flame.pos.push(at.x + P[k]![0] * c, at.y + P[k]![1], at.z + P[k]![0] * s);
        flame.uv.push(uvs[k]![0], uvs[k]![1]);
        flame.ph.push(ph);
        flame.tint.push(tint.r, tint.g, tint.b);
      }
    }
  };
  const orange = new THREE.Color('#ff6a14');
  const redFlare = new THREE.Color('#ff2a3a');
  const fire = (x: number, y: number, z: number): void => {
    const at = new THREE.Vector3(x, y + 0.9, z);
    addFlame(at, 1.0, 1.5, orange, r());
    addFlame(at.clone().add(new THREE.Vector3(0.05, 0, 0.03)), 0.65, 1.05, orange, r());
    fires.push(at.clone());
    smokers.push({ x, y: y + 1.6, z, kind: 0 });
  };
  const banner = (x: number, y: number, z: number, rot: number, w: number, h: number, cell: number, sign = false): void => {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const idx = sign ? cell : brandOrder[cell % 8]!;
    const u0 = sign ? (idx % 4) * (SIGN_W / 1024) : (idx % 2) * (CELL_W / 1024);
    const u1 = u0 + (sign ? SIGN_W : CELL_W) / 1024;
    // canvas y runs down; the atlas texture is flipY by default, so v counts from the bottom
    const top = sign ? CELL_H * 4 + Math.floor(idx / 4) * SIGN_H : Math.floor(idx / 2) * CELL_H;
    const hgt = sign ? SIGN_H : CELL_H;
    const v1 = 1 - top / 1024;
    const v0 = 1 - (top + hgt) / 1024;
    const P = [
      [-w / 2, 0, u0, v0],
      [w / 2, 0, u1, v0],
      [w / 2, h, u1, v1],
      [-w / 2, h, u0, v1],
    ] as const;
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const p = P[k]!;
      ban.pos.push(x + p[0] * c, y + p[1], z - p[0] * s);
      ban.uv.push(p[2], p[3]);
      ban.nor.push(Math.sin(rot), 0, Math.cos(rot));
    }
  };
  const flag = (x: number, y: number, z: number, rot: number, col: string, h = 3.4): void => {
    g.cyl(0.03, 0.04, h, 5, '#d8d4c8', x, y + h / 2, z);
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const w = 1.4;
    const fh = 0.9;
    const cc = new THREE.Color(col);
    const SEG = 4;
    for (let i = 0; i < SEG; i++) {
      const a0 = i / SEG;
      const a1 = (i + 1) / SEG;
      const X = (u: number): number => x + u * w * c;
      const Z = (u: number): number => z - u * w * s;
      const quad = [
        [a0, h - fh],
        [a1, h - fh],
        [a1, h],
        [a0, h],
      ] as const;
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const q = quad[k]!;
        cloth.pos.push(X(q[0]), y + q[1], Z(q[0]));
        cloth.uv.push(q[0], 0);
        cloth.nor.push(s, 0, c);
        const stripe = i % 2 ? 1 : 0.82;
        cloth.col.push(cc.r * stripe, cc.g * stripe, cc.b * stripe);
      }
    }
  };
  const flare = (x: number, y: number, z: number): void => {
    g.cyl(0.025, 0.025, 0.45, 5, '#b01e22', x, y + 0.22, z);
    const at = new THREE.Vector3(x, y + 0.45, z);
    addFlame(at, 0.28, 0.55, redFlare, r());
    smokers.push({ x, y: y + 0.9, z, kind: 1 });
    lamps.sphere(0.06, '#ffffff', x, y + 0.5, z, 1, 1, 1, 4, 3);
  };

  // ---- 1. tyre walls on the outside of the sharpest corners ----
  const peaks: number[] = [];
  for (let i = 0; i < track.n; i++) {
    const k = Math.abs(track.curv[i]!);
    let top = k > 0.012;
    for (let d = -45; d <= 45 && top; d++) if (d !== 0 && Math.abs(track.curv[(i + d + track.n) % track.n]!) > k) top = false;
    if (top) peaks.push(i);
  }
  peaks.sort((a, b) => Math.abs(track.curv[b]!) - Math.abs(track.curv[a]!));
  const wallCount = Math.max(2, Math.round((high ? 5 : 3) * Math.min(1.4, dens)));
  let walls = 0;
  for (const i of peaks) {
    if (walls >= wallCount) break;
    const s0 = i * track.ds;
    if (track.tunnel[i]) continue;
    const outside = track.curv[i]! > 0 ? -1 : 1;
    const stacks = high ? 9 : 6;
    let placed = 0;
    for (let k = 0; k < stacks; k++) {
      const s = s0 + (k - stacks / 2) * 2.6;
      if (track.tunnel[track.index(s)]) continue;
      for (const row of [-0.15, 0.7]) {
        if (row > 0 && !high) continue;
        const p = outer(s, outside, row);
        if (!free(p.x, p.z, 0.4)) continue;
        used.push([p.x, p.z, 0.45]);
        const n = row > 0 ? 2 : 3;
        tyreStack(p.x, p.y - 0.05, p.z, n, k % 3 === 1 ? pal.band[k % pal.band.length]! : null);
        placed++;
      }
    }
    if (placed) {
      walls++;
      // a billboard stuck on the wall's far end, a barrel or two at the other
      const e = outer(s0 + stacks * 1.4 + 2, outside, 1.2);
      barrel(e.x, e.y, e.z, pal.barrels[walls % pal.barrels.length]!);
    }
  }

  // ---- 2. hay bales (crates on the moon and in candy land) with sponsor banners at the start and finish ----
  const startS = 0;
  const lineLen = high ? 22 : 14;
  for (const sgn of [1, -1]) {
    for (let s = -lineLen; s <= lineLen; s += 2.6) {
      if (Math.abs(s) < 5) continue;
      const p = outer(startS + s, sgn, 1.0);
      if (track.tunnel[track.index(s)] || !free(p.x, p.z, 0.8)) continue;
      used.push([p.x, p.z, 0.9]);
      if (pal.crates) crate(p.x, p.y - 0.1, p.z, p.rot, pal.barrels[Math.abs(Math.round(s)) % pal.barrels.length]!);
      else hay(p.x, p.y - 0.1, p.z, p.rot + Math.PI / 2);
    }
    // a banner board on two stakes every 10 m behind the bales
    for (let s = -lineLen + 3; s <= lineLen - 3; s += 7.8) {
      if (Math.abs(s) < 6) continue;
      const p = outer(startS + s, sgn, 2.4);
      if (!free(p.x, p.z, 1.4) || !clear(p.x, p.z, 1)) continue;
      used.push([p.x, p.z, 1.6]);
      for (const dx of [-1.1, 1.1]) g.cyl(0.05, 0.05, 1.5, 5, '#7a6850', p.x + Math.cos(p.rot) * dx, p.y + 0.75, p.z - Math.sin(p.rot) * dx);
      banner(p.x, p.y + 0.55, p.z, p.rot, 2.8, 1.05, Math.round(Math.abs(s) / 3 + (sgn > 0 ? 0 : 3)));
    }
  }

  // ---- 3. billboards for silly brands ----
  const boards = Math.max(2, Math.round((high ? 6 : 4) * Math.min(1.4, dens)));
  for (let k = 0, tries = 0; k < boards && tries < 40; tries++) {
    const s = ((k + 0.3 + r() * 0.4) / boards) * track.length;
    const sgn = r() < 0.5 ? 1 : -1;
    const p = outer(s, sgn, 8 + r() * 7);
    if (track.tunnel[track.index(s)] || !clear(p.x, p.z, 11) || !free(p.x, p.z, 3)) continue;
    used.push([p.x, p.z, 4]);
    const w = 8;
    const h = w * (CELL_H / CELL_W);
    const py = terrain.visual(p.x, p.z);
    const up = 4.4;
    for (const dx of [-w * 0.32, w * 0.32]) g.cyl(0.14, 0.18, up + 0.4, 6, pal.pole, p.x + Math.cos(p.rot) * dx, py + (up + 0.4) / 2 - 0.2, p.z - Math.sin(p.rot) * dx);
    g.box(w + 0.3, 0.14, 0.2, '#26262a', p.x, py + up + h + 0.07, p.z, 0, p.rot, 0);
    g.box(w + 0.3, 0.14, 0.2, '#26262a', p.x, py + up - 0.07, p.z, 0, p.rot, 0);
    banner(p.x, py + up, p.z, p.rot, w, h, k * 3 + (set.length % 3));
    if (night || set === 'city') {
      // a light bar over the board
      lamps.box(w * 0.6, 0.1, 0.1, '#ffffff', p.x, py + up + h + 0.35, p.z, 0, p.rot, 0);
    }
    k++;
  }

  // ---- 4. scrapyard piles, with barrels (some burning) and a flag ----
  const piles = Math.max(1, Math.round(pal.scraps * dens));
  let fireLeft = Math.round(pal.fires * (high ? 1 : 0.6) * Math.min(1.3, dens + 0.2));
  for (let k = 0, tries = 0; k < piles && tries < 60; tries++) {
    const s = ((k + 0.5 + (r() - 0.5) * 0.5) / piles) * track.length;
    const sgn = r() < 0.5 ? 1 : -1;
    const p = outer(s, sgn, 14 + r() * 16);
    if (track.tunnel[track.index(s)] || !clear(p.x, p.z, 16) || !free(p.x, p.z, 9)) continue;
    used.push([p.x, p.z, 9]);
    k++;
    const base = terrain.visual(p.x, p.z) - 0.15;
    const n = high ? 5 : 3;
    for (let j = 0; j < n; j++) {
      const a = r() * 6.28;
      const rr = j === 0 ? 0 : 2.5 + r() * 2.5;
      const x = p.x + Math.cos(a) * rr;
      const z = p.z + Math.sin(a) * rr;
      const stack = j < 2 ? 1 + Math.floor(r() * 2) : 0;
      if (pal.crates) for (let q = 0; q <= stack; q++) crate(x + (r() - 0.5) * 0.3, base + q * 0.9, z, r() * 6, pal.scrap[(j + q) % pal.scrap.length]!);
      else {
        scrapCar(x, base, z, r() * 6.28, (r() - 0.5) * 0.12, pal.scrap[(j + k) % pal.scrap.length]!);
        if (stack) scrapCar(x + 0.2, base + 1.55, z, r() * 6.28, (r() - 0.5) * 0.3, pal.scrap[(j + k + 2) % pal.scrap.length]!);
      }
    }
    for (let j = 0; j < 3; j++) tyreStack(p.x + (r() - 0.5) * 9, base, p.z + (r() - 0.5) * 9, 1 + Math.floor(r() * 3), null);
    // barrels at the gate, one or two burning
    for (let j = 0; j < 4; j++) {
      const bx = p.x + Math.cos(p.rot + 1.2) * 4 + j * 0.7 - 1;
      const bz = p.z + Math.sin(p.rot + 1.2) * 4 + (j % 2) * 0.7;
      const by = terrain.visual(bx, bz) - 0.05;
      barrel(bx, by, bz, pal.barrels[(j + k) % pal.barrels.length]!);
      if (j < 2 && fireLeft > 0) {
        fire(bx, by + 0.45, bz);
        fireLeft--;
      }
    }
    flag(p.x + Math.cos(p.rot) * 3, base, p.z - Math.sin(p.rot) * 3, p.rot, '#c1281c', 6.5);
  }
  // loose barrels beside the road
  for (let k = 0, tries = 0; k < Math.round(5 * dens) && tries < 40; tries++) {
    const s = r() * track.length;
    const sgn = r() < 0.5 ? 1 : -1;
    const p = outer(s, sgn, 2.2 + r() * 2.5);
    if (track.tunnel[track.index(s)] || !free(p.x, p.z, 1.5)) continue;
    used.push([p.x, p.z, 1.5]);
    k++;
    const n = 2 + Math.floor(r() * 3);
    for (let j = 0; j < n; j++) {
      const bx = p.x + (j % 2) * 0.7 + (r() - 0.5) * 0.2;
      const bz = p.z + Math.floor(j / 2) * 0.7;
      const by = terrain.visual(bx, bz) - 0.05;
      barrel(bx, by, bz, pal.barrels[(j + k) % pal.barrels.length]!, j === n - 1 && r() < 0.4);
      if (j === 0 && fireLeft > 0 && r() < 0.6) {
        fire(bx, by + 0.45, bz);
        fireLeft--;
      }
    }
  }

  // ---- 5. floodlight towers at the start and at two corners (the lamps glow, and bloom) ----
  const tower = (p: { x: number; z: number; y: number; rot: number }): void => {
    const H = 13;
    g.cyl(0.16, 0.26, H, 6, pal.pole, p.x, p.y + H / 2 - 0.2, p.z);
    g.box(0.9, 0.3, 0.9, '#3a3d44', p.x, p.y + 0.1, p.z);
    g.box(4.2, 0.25, 0.3, '#26262a', p.x, p.y + H, p.z, 0, p.rot, 0);
    for (const dx of [-1.5, -0.5, 0.5, 1.5]) {
      const x = p.x + Math.cos(p.rot) * dx;
      const z = p.z - Math.sin(p.rot) * dx;
      g.box(0.9, 0.55, 0.4, '#1c1d22', x, p.y + H + 0.4, z, 0, p.rot, 0);
      lamps.box(0.78, 0.42, 0.05, '#ffffff', x + Math.sin(p.rot) * 0.22, p.y + H + 0.4, z + Math.cos(p.rot) * 0.22, 0, p.rot, 0);
    }
  };
  for (const sgn of [1, -1]) {
    const p = outer(-9, sgn, 4.5);
    if (clear(p.x, p.z, 4)) tower(p);
  }
  if (high || night) {
    for (const i of peaks.slice(0, 2)) {
      const p = outer(i * track.ds + 18, track.curv[i]! > 0 ? -1 : 1, 7);
      if (clear(p.x, p.z, 5) && free(p.x, p.z, 3)) {
        used.push([p.x, p.z, 3]);
        tower(p);
      }
    }
  }

  // ---- 6. the crowd gets rowdier: flags, signs and smoking flares ----
  const flagCols = ['#e8412c', '#ffcf1f', '#2a6fe0', '#f4f1ea', '#18a89a', '#f06ba8'];
  let spots = 0;
  for (const c of crowds) {
    if (spots >= (high ? 14 : 8)) break;
    spots++;
    for (let j = 0; j < 3; j++) {
      const a = r() * 6.28;
      const rr = 1.5 + r() * 4;
      const x = c.x + Math.cos(a) * rr;
      const z = c.z + Math.sin(a) * rr;
      const y = terrain.visual(x, z);
      if (terrain.roadDist(x, z) < 6) continue;
      if (j === 0) flag(x, y, z, r() * 6.28, flagCols[(spots + j) % flagCols.length]!);
      else if (j === 1) {
        const rot = Math.atan2(c.x - x, c.z - z) + Math.PI;
        g.cyl(0.03, 0.03, 1.6, 4, '#7a6850', x, y + 0.8, z);
        banner(x, y + 1.35, z, rot, 1.1, 0.55, Math.floor(r() * SIGNS.length), true);
      } else if (spots % 2 === 0) flare(x, y + 1.7, z);
    }
  }

  // ---- build the meshes ----
  const solid = g.build();
  keep(solid);
  const solidMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const solidMesh = new THREE.Mesh(solid, solidMat);
  solidMesh.castShadow = high;
  solidMesh.receiveShadow = high;
  solidMesh.frustumCulled = false;
  group.add(solidMesh);
  const hull = outlineMesh(solidMesh, high, '#0b0a10', 1.5);
  if (hull) keep(hull.geo);

  if (!lamps.empty) {
    const lg = keep(lamps.build());
    const lm = keep(new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(night ? 3.4 : 1.7, night ? 3.1 : 1.6, night ? 2.4 : 1.35) }));
    const mesh = new THREE.Mesh(lg, lm);
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  if (ban.pos.length) {
    const bg = keep(new THREE.BufferGeometry());
    bg.setAttribute('position', new THREE.Float32BufferAttribute(ban.pos, 3));
    bg.setAttribute('normal', new THREE.Float32BufferAttribute(ban.nor, 3));
    bg.setAttribute('uv', new THREE.Float32BufferAttribute(ban.uv, 2));
    const tex = keep(canvasTex(1024, 1024, drawAtlas));
    const bm = keep(new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: night ? 0.55 : 0.08 }));
    const mesh = new THREE.Mesh(bg, bm);
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  if (cloth.pos.length) {
    const cg = keep(new THREE.BufferGeometry());
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cloth.pos, 3));
    cg.setAttribute('normal', new THREE.Float32BufferAttribute(cloth.nor, 3));
    cg.setAttribute('color', new THREE.Float32BufferAttribute(cloth.col, 3));
    cg.setAttribute('uv', new THREE.Float32BufferAttribute(cloth.uv, 2));
    const cm = keep(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    cm.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = timeU;
      sh.vertexShader =
        'uniform float uTime;\n' +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          `vec3 transformed = position;
           float wv = uv.x;
           transformed.y += sin(uTime * 6.0 + position.x * 1.7 + position.z * 1.3 + wv * 5.0) * 0.13 * wv;
           transformed.x += sin(uTime * 5.0 + position.z + wv * 4.0) * 0.07 * wv;
           transformed.z += cos(uTime * 4.5 + position.x + wv * 4.0) * 0.07 * wv;`,
        );
    };
    const mesh = new THREE.Mesh(cg, cm);
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  if (flame.pos.length) {
    const fg = keep(new THREE.BufferGeometry());
    fg.setAttribute('position', new THREE.Float32BufferAttribute(flame.pos, 3));
    fg.setAttribute('uv', new THREE.Float32BufferAttribute(flame.uv, 2));
    fg.setAttribute('phase', new THREE.Float32BufferAttribute(flame.ph, 1));
    fg.setAttribute('tint', new THREE.Float32BufferAttribute(flame.tint, 3));
    const fm = keep(new THREE.ShaderMaterial({ uniforms: { uTime: timeU }, vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    const mesh = new THREE.Mesh(fg, fm);
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    group.add(mesh);
  }

  // glow from the nearest burning barrels (high only: a point light per fire is a lot for a phone)
  const lights: THREE.PointLight[] = [];
  if (high && fires.length) {
    for (let k = 0; k < 2; k++) {
      const pl = new THREE.PointLight('#ff8a3a', 0, 18, 1.4);
      pl.position.set(0, -100, 0);
      lights.push(pl);
      group.add(pl);
    }
  }

  const near = fires.map(() => 0);
  return {
    group,
    smokers,
    update(time, focus) {
      if (!lights.length) return;
      // the two fires nearest the player light the road
      let a = -1;
      let b = -1;
      for (let i = 0; i < fires.length; i++) {
        const d = (fires[i]!.x - focus.x) ** 2 + (fires[i]!.z - focus.z) ** 2;
        near[i] = d;
        if (a < 0 || d < near[a]!) {
          b = a;
          a = i;
        } else if (b < 0 || d < near[b]!) b = i;
      }
      [a, b].forEach((idx, k) => {
        const pl = lights[k]!;
        if (idx < 0 || near[idx]! > 45 * 45) {
          pl.intensity = 0;
          return;
        }
        pl.position.copy(fires[idx]!).add(new THREE.Vector3(0, 0.6, 0));
        pl.intensity = (6 + Math.sin(time * 13 + idx) * 1.6 + Math.sin(time * 31 + idx * 2) * 1.0) * (1 - near[idx]! / (45 * 45));
      });
    },
    dispose() {
      for (const d of disposables) d.dispose();
      for (const l of lights) l.dispose();
    },
  };
}
