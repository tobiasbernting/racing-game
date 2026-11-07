// What stands round the wild and the crazy courses: cacti and a camel in the desert, black rock and a smoking
// cone round the volcano, lollipop trees and gingerbread houses in candy land, moon rocks, flags and a rover on the
// moon, and giant cereal, cups and jam jars in the kitchen. Same style as props.ts: low-poly vertex-coloured
// geometry, merged or instanced. Everything is drawn big, because the cars are small.
import * as THREE from 'three';
import type { ScenerySet } from './courses-base.ts';
import { Geo, blobTex, mat } from './geo.ts';
import type { Layout } from './layout.ts';
import type { Terrain } from './terrain.ts';
import type { Track } from './track.ts';
import { rng } from './util.ts';

export interface WildCtx {
  track: Track;
  terrain: Terrain;
  L: Layout;
  r: () => number;
  high: boolean;
  group: THREE.Group;
  stat: Geo;
  /** Props per metre of road, 1 = the usual (the seed turns it up and down). */
  density: number;
  keep<T extends { dispose(): void }>(x: T): T;
  statAt(geo: THREE.BufferGeometry, x: number, z: number, rot: number, foot: number, sink?: number): void;
  roadside(s: number, sgn: number, off: number): { x: number; z: number; rot: number };
  blocked(x: number, z: number, clear: number): boolean;
  /** Called every frame (time in s, the player's position). */
  anim: ((time: number, focus: THREE.Vector3) => void)[];
}

const TAU = Math.PI * 2;

/** A torus lying flat (a cereal ring), r the ring radius and t the tube radius. */
const ring = (g: Geo, R: number, t: number, color: string, x: number, y: number, z: number, rx = Math.PI / 2, ry = 0, rz = 0): void => {
  g.add(new THREE.TorusGeometry(R, t, 6, 12), color, mat(x, y, z, rx, ry, rz));
};

// ---------------------------------------------------------------------------
// The desert
// ---------------------------------------------------------------------------

function saguaro(arms = 2, h = 6.5, color = '#4f8f3e'): THREE.BufferGeometry {
  const g = new Geo();
  g.cyl(0.42, 0.5, h, 8, color, 0, h / 2, 0);
  g.ball(0.45, color, 0, h, 0, 1, 1.1, 1);
  for (let k = 0; k < arms; k++) {
    const sx = k % 2 ? 1 : -1;
    const y = h * (0.42 + 0.16 * k);
    g.cyl(0.3, 0.3, 1.5, 8, color, sx * 0.75, y, 0, 0, 0, Math.PI / 2);
    g.ball(0.3, color, sx * 1.5, y, 0);
    const up = 1.4 + k * 0.5;
    g.cyl(0.28, 0.3, up, 8, color, sx * 1.5, y + up / 2, 0);
    g.ball(0.29, color, sx * 1.5, y + up, 0, 1, 1.1, 1);
  }
  g.ball(0.14, '#ff7aa8', 0.1, h + 0.45, 0.1);
  return g.build();
}

function barrelCactus(): THREE.BufferGeometry {
  const g = new Geo();
  for (const [x, z, r] of [
    [0, 0, 0.8],
    [1.0, 0.3, 0.55],
    [-0.7, 0.7, 0.45],
  ] as const) {
    g.ball(r, '#5d9a48', x, r * 0.8, z, 1, 0.9, 1, 1);
    g.ball(r * 0.22, '#ffd23f', x, r * 1.55, z);
  }
  return g.build();
}

function deadTree(): THREE.BufferGeometry {
  const g = new Geo();
  g.cyl(0.18, 0.3, 3.4, 5, '#7a6a58', 0, 1.7, 0);
  for (const [a, y, len] of [
    [0.9, 2.3, 1.7],
    [-1.0, 2.7, 1.4],
    [0.4, 3.1, 1.1],
  ] as const) {
    g.cyl(0.07, 0.12, len, 4, '#7a6a58', Math.sin(a) * len * 0.45, y + Math.cos(a) * len * 0.35, 0, 0, 0, -a);
  }
  return g.build();
}

function dryBush(): THREE.BufferGeometry {
  const g = new Geo();
  g.ball(0.8, '#b09a5a', 0, 0.4, 0, 1.3, 0.6, 1.1);
  g.ball(0.5, '#9a8648', 0.6, 0.3, 0.3, 1, 0.6, 1);
  return g.build();
}

function mesa(color: string, h: number, w: number): THREE.BufferGeometry {
  const g = new Geo();
  const strata = ['#c98a52', '#b8703c', '#d9a36a', '#a85f34', color];
  let y = 0;
  let rr = w;
  for (let k = 0; k < 5; k++) {
    const hh = h / 5;
    g.cyl(rr * 0.92, rr, hh, 6, strata[k]!, 0, y + hh / 2, 0, 0, 0.3 * k);
    y += hh;
    rr *= k === 3 ? 0.96 : 0.9;
  }
  g.cyl(rr * 0.97, rr * 0.97, 0.3, 6, '#e0b27a', 0, y + 0.15, 0);
  return g.build();
}

function pyramid(): THREE.BufferGeometry {
  const g = new Geo();
  g.cone(34, 30, 4, '#e2bd78', 0, 15, 0, Math.PI / 4);
  return g.build();
}

function camel(): THREE.BufferGeometry {
  const g = new Geo();
  const fur = '#c99a5a';
  const dark = '#a87a42';
  g.ball(1.0, fur, 0, 2.3, 0, 1.0, 0.75, 1.7);
  g.ball(0.55, dark, 0, 3.15, 0.45, 0.9, 1.1, 0.9);
  g.ball(0.55, dark, 0, 3.1, -0.65, 0.9, 1.1, 0.9);
  for (const [x, z] of [
    [0.5, 1.1],
    [-0.5, 1.1],
    [0.5, -1.1],
    [-0.5, -1.1],
  ] as const) {
    g.cyl(0.17, 0.12, 2.0, 5, fur, x, 1.0, z);
    g.box(0.3, 0.14, 0.4, '#5a4632', x, 0.07, z + 0.06);
  }
  // the long neck and the head
  g.cyl(0.26, 0.38, 2.2, 6, fur, 0, 3.2, 1.9, 0.5);
  g.box(0.5, 0.5, 0.95, fur, 0, 4.25, 2.5);
  g.box(0.3, 0.22, 0.3, '#e8c8a0', 0, 4.1, 3.05);
  g.cone(0.1, 0.3, 4, fur, 0.18, 4.65, 2.3);
  g.cone(0.1, 0.3, 4, fur, -0.18, 4.65, 2.3);
  g.box(0.12, 0.12, 0.05, '#1a1a1a', 0.22, 4.35, 2.98);
  g.box(0.12, 0.12, 0.05, '#1a1a1a', -0.22, 4.35, 2.98);
  g.cyl(0.07, 0.04, 1.2, 4, dark, 0, 2.0, -1.9, 0.3);
  // a bright saddle blanket
  g.box(1.8, 0.1, 1.3, '#e8412c', 0, 2.95, -0.1);
  g.box(1.82, 0.12, 0.25, '#f4c20d', 0, 2.96, -0.1);
  return g.build();
}

function palmTree(seed: number): THREE.BufferGeometry {
  const g = new Geo();
  const r = rng(seed);
  const lean = 0.15 + r() * 0.15;
  let x = 0;
  let y = 0;
  for (let k = 0; k < 6; k++) {
    const h = 1.2;
    const a = lean * (k / 6) * 1.6;
    g.cyl(0.2 - k * 0.012, 0.26 - k * 0.012, h, 6, k % 2 ? '#8a6a44' : '#9a7a50', x + Math.sin(a) * h * 0.5, y + h * 0.5, 0, 0, 0, -a);
    x += Math.sin(a) * h;
    y += Math.cos(a) * h * 0.98;
  }
  for (let k = 0; k < 7; k++) {
    const ang = (k / 7) * TAU + r() * 0.3;
    const len = 3.2 + r() * 0.8;
    g.add(new THREE.BoxGeometry(len, 0.06, 0.7), k % 2 ? '#3f8a3a' : '#4f9a40', mat(x + Math.cos(ang) * len * 0.45, y - 0.3, Math.sin(ang) * len * 0.45, 0, -ang, -0.42));
  }
  g.ball(0.35, '#6a4a2a', x, y - 0.1, 0);
  return g.build();
}

// ---------------------------------------------------------------------------
// The volcano
// ---------------------------------------------------------------------------

function charredTree(): THREE.BufferGeometry {
  const g = new Geo();
  g.cyl(0.18, 0.34, 4.2, 5, '#1e1a18', 0, 2.1, 0);
  for (const [a, y, len, b] of [
    [0.8, 2.6, 1.9, 0],
    [-0.9, 3.2, 1.5, 1.2],
    [0.5, 3.8, 1.1, 2.4],
    [-0.4, 1.8, 1.2, 3.6],
  ] as const) {
    g.add(new THREE.CylinderGeometry(0.06, 0.12, len, 4), '#2a2422', mat(Math.sin(a) * Math.cos(b) * len * 0.45, y + Math.cos(a) * len * 0.4, Math.sin(a) * Math.sin(b) * len * 0.45, Math.sin(b) * a, 0, -Math.cos(b) * a));
  }
  g.ball(0.1, '#ff6a1a', 0.1, 2.8, 0.3);
  g.ball(0.08, '#ff8a2a', -0.2, 3.9, 0.1);
  return g.build();
}

function basaltSpire(tall = 1): THREE.BufferGeometry {
  const g = new Geo();
  for (const [x, z, r, h, c] of [
    [0, 0, 0.9, 5.5, '#2c2826'],
    [1.1, 0.4, 0.7, 3.6, '#38322f'],
    [-0.9, 0.6, 0.75, 4.4, '#322c2a'],
    [0.3, -1.0, 0.6, 2.6, '#3c3532'],
    [-0.3, 1.2, 0.5, 2.0, '#2c2826'],
  ] as const) {
    g.cyl(r * 0.85, r, h * tall, 6, c, x, (h * tall) / 2, z);
  }
  g.ball(0.18, '#ff5a14', 0.2, 0.3, 0.9);
  return g.build();
}

function lavaRock(): THREE.BufferGeometry {
  const g = new Geo();
  g.ball(1.7, '#302a28', 0, 1.0, 0, 1.2, 0.8, 1.0);
  g.ball(1.1, '#3a3430', 1.5, 0.6, 0.5, 1, 0.8, 1);
  // glowing cracks
  g.box(0.12, 0.9, 1.4, '#ff6a1a', 0.2, 1.4, 0.3, 0.3, 0.4, 0);
  g.box(0.1, 0.5, 0.9, '#ff9a2a', 1.3, 1.0, 0.9, 0.2, -0.5, 0);
  return g.build();
}

function emberBush(): THREE.BufferGeometry {
  const g = new Geo();
  g.ball(0.7, '#2c2624', 0, 0.35, 0, 1.2, 0.6, 1);
  g.ball(0.12, '#ff7a1a', 0.3, 0.55, 0.2);
  g.ball(0.1, '#ffa02a', -0.3, 0.5, -0.1);
  return g.build();
}

// ---------------------------------------------------------------------------
// Candy land
// ---------------------------------------------------------------------------

function lollipop(a: string, b: string, c: string, tall = 1): THREE.BufferGeometry {
  const g = new Geo();
  g.cyl(0.12, 0.14, 4.6 * tall, 6, '#fffaf0', 0, 2.3 * tall, 0);
  const y = 5.6 * tall;
  // a thick disc seen from the side, drawn as stacked rings so it reads as a swirl
  let k = 0;
  for (const [rad, col] of [
    [1.7, a],
    [1.4, b],
    [1.1, a],
    [0.8, c],
    [0.5, a],
  ] as const) {
    g.cyl(rad, rad, 0.42 + k * 0.03, 14, col, 0, y, 0, Math.PI / 2);
    k++;
  }
  g.cyl(0.18, 0.18, 0.62, 6, b, 0, y, 0, Math.PI / 2);
  return g.build();
}

function gumdropTree(): THREE.BufferGeometry {
  const g = new Geo();
  g.cyl(0.25, 0.35, 1.8, 6, '#f6e6d0', 0, 0.9, 0);
  for (const [x, y, z, r, c] of [
    [0, 3.2, 0, 1.9, '#6fd88a'],
    [1.1, 2.3, 0.5, 1.2, '#ff9a3a'],
    [-1.0, 2.5, -0.4, 1.3, '#b070f0'],
    [0.2, 4.6, 0.1, 1.1, '#ffd23f'],
  ] as const) {
    g.ball(r, c, x, y, z, 1, 1.2, 1, 1);
  }
  return g.build();
}

function gumdropBush(): THREE.BufferGeometry {
  const g = new Geo();
  for (const [x, z, r, c] of [
    [0, 0, 0.7, '#ff7aa8'],
    [0.9, 0.3, 0.55, '#6fd8ff'],
    [-0.7, 0.5, 0.5, '#ffd23f'],
  ] as const) {
    g.ball(r, c, x, r * 0.8, z, 1, 1.1, 1, 1);
  }
  return g.build();
}

function candyCane(h = 5): THREE.BufferGeometry {
  const g = new Geo();
  const n = Math.round(h / 0.5);
  for (let k = 0; k < n; k++) g.cyl(0.22, 0.22, 0.5, 8, k % 2 ? '#ffffff' : '#e8412c', 0, 0.25 + k * 0.5, 0);
  // the hook: half a turn of short pieces
  const R = 0.9;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI;
    const x = R - Math.cos(a) * R;
    const y = h + Math.sin(a) * R;
    g.cyl(0.22, 0.22, 0.5, 8, k % 2 ? '#e8412c' : '#ffffff', x, y, 0, 0, 0, -a);
  }
  return g.build();
}

function cupcake(color: string, frost: string): THREE.BufferGeometry {
  const g = new Geo();
  g.cyl(3.4, 2.4, 3.2, 12, color, 0, 1.6, 0);
  g.cyl(3.6, 3.6, 0.5, 12, frost, 0, 3.4, 0);
  g.cyl(2.7, 3.4, 1.2, 12, frost, 0, 4.2, 0);
  g.cyl(1.7, 2.6, 1.1, 12, frost, 0, 5.3, 0);
  g.cone(1.1, 1.4, 10, frost, 0, 6.5, 0);
  g.ball(0.65, '#e8201c', 0, 7.5, 0);
  for (let k = 0; k < 9; k++) {
    const a = k * 2.4;
    g.box(0.12, 0.12, 0.45, ['#ffd23f', '#3fa8ff', '#ffffff', '#6fd88a'][k % 4]!, Math.cos(a) * (1.4 + (k % 3) * 0.7), 4.8 + (k % 3) * 0.5, Math.sin(a) * (1.4 + (k % 3) * 0.7), 0, a, 0.3);
  }
  return g.build();
}

function iceCreamTower(): THREE.BufferGeometry {
  const g = new Geo();
  g.add(new THREE.ConeGeometry(2.6, 7, 8), '#e8b868', mat(0, 3.5, 0, Math.PI, 0, 0));
  for (let k = 0; k < 6; k++) g.box(0.1, 7, 0.1, '#c8984a', Math.cos(k * 1.05) * 1.1, 3.5, Math.sin(k * 1.05) * 1.1, 0, -k * 1.05, 0.2);
  g.ball(2.9, '#ff9fc8', 0, 8.2, 0, 1, 0.9, 1, 1);
  g.ball(2.3, '#bff0d8', 0, 10.6, 0, 1, 0.9, 1, 1);
  g.ball(0.6, '#e8201c', 0, 12.4, 0);
  g.cyl(0.08, 0.08, 1.4, 4, '#5a3a2a', 0.4, 13.2, 0, 0, 0, -0.3);
  return g.build();
}

function gingerbreadHouse(): THREE.BufferGeometry {
  const g = new Geo();
  g.box(8, 4.6, 6.5, '#b8742c', 0, 2.3, 0);
  g.prism(
    [
      [-3.6, 4.6, 4.4],
      [3.6, 4.6, 4.4],
      [0, 7.4, 4.4],
    ],
    '#fff5f8',
  );
  for (let k = 0; k < 8; k++) g.box(0.9, 0.7, 7.4, k % 2 ? '#ff7aa8' : '#fff0f4', -3.5 + k * 1.0, 5.3 + 0, 0, 0, 0, 0);
  g.box(1.5, 2.6, 0.2, '#6a3a1c', 0, 1.3, 3.3);
  for (const sx of [-2.4, 2.4]) {
    g.box(1.3, 1.3, 0.2, '#ffe9a0', sx, 2.8, 3.3);
    g.box(1.5, 0.15, 0.25, '#ffffff', sx, 3.55, 3.3);
  }
  for (let k = 0; k < 6; k++) g.ball(0.28, ['#e8201c', '#3fa8ff', '#6fd88a', '#ffd23f'][k % 4]!, -3.2 + k * 1.28, 4.7, 3.3);
  g.cyl(0.6, 0.6, 1.6, 6, '#e8201c', 2.6, 7.6, -1.5);
  return g.build();
}

function chocFountain(): THREE.BufferGeometry {
  const g = new Geo();
  g.cyl(6, 6.4, 1.2, 14, '#e8d4b0', 0, 0.6, 0);
  g.cyl(5.4, 5.4, 0.4, 14, '#5a3320', 0, 1.3, 0);
  for (const [r, y, h] of [
    [3.6, 2.2, 1.0],
    [2.4, 4.2, 0.9],
    [1.4, 6.0, 0.8],
  ] as const) {
    g.cyl(r, r + 0.4, h, 12, '#f2e6d0', 0, y, 0);
    g.cyl(r - 0.2, r - 0.2, 0.2, 12, '#5a3320', 0, y + h / 2, 0);
  }
  g.cyl(0.3, 0.3, 6, 6, '#e8d4b0', 0, 3.5, 0);
  g.cyl(0.5, 0.12, 2.2, 8, '#5a3320', 0, 7.5, 0);
  return g.build();
}

// ---------------------------------------------------------------------------
// The moon
// ---------------------------------------------------------------------------

function moonRock(big: number): THREE.BufferGeometry {
  const g = new Geo();
  g.ball(1.5 * big, '#7e808a', 0, 0.8 * big, 0, 1.2, 0.75, 1.0, 1);
  g.ball(0.9 * big, '#6c6e78', 1.4 * big, 0.45 * big, 0.5, 1, 0.7, 1, 1);
  return g.build();
}

function moonSlab(): THREE.BufferGeometry {
  const g = new Geo();
  g.box(1.6, 5.2, 1.1, '#74767f', 0, 2.5, 0, 0.1, 0.4, 0.14);
  g.box(1.1, 2.6, 0.9, '#8a8c96', 1.3, 1.2, 0.4, 0, 0.9, -0.2);
  return g.build();
}

function pebbles(): THREE.BufferGeometry {
  const g = new Geo();
  for (const [x, z, r] of [
    [0, 0, 0.45],
    [0.8, 0.3, 0.3],
    [-0.5, 0.6, 0.28],
    [0.3, -0.7, 0.35],
  ] as const) g.ball(r, '#8e909a', x, r * 0.6, z, 1, 0.65, 1);
  return g.build();
}

function moonFlag(): THREE.BufferGeometry {
  const g = new Geo();
  g.cyl(0.07, 0.07, 6, 5, '#e8e8ee', 0, 3, 0);
  g.ball(0.16, '#e8e8ee', 0, 6.1, 0);
  // a Swedish flag held out by a rod, stiff in the vacuum
  g.box(3.2, 0.05, 0.05, '#e8e8ee', 1.6, 5.9, 0);
  g.box(3.0, 1.9, 0.06, '#006aa7', 1.55, 4.9, 0);
  g.box(0.5, 1.9, 0.07, '#fecc00', 0.9, 4.9, 0);
  g.box(3.0, 0.4, 0.07, '#fecc00', 1.55, 4.9, 0);
  return g.build();
}

function rover(): THREE.BufferGeometry {
  const g = new Geo();
  g.box(3.2, 0.9, 4.2, '#d8d8de', 0, 1.5, 0);
  g.box(2.6, 0.5, 3.2, '#e8c24a', 0, 2.1, -0.2);
  g.box(2.2, 0.9, 1.2, '#3a4a6a', 0, 2.4, 1.0);
  for (const sx of [-1, 1])
    for (const sz of [-1.5, 0, 1.5]) {
      g.cyl(0.62, 0.62, 0.5, 10, '#2a2a30', sx * 1.9, 0.62, sz, 0, 0, Math.PI / 2);
      g.cyl(0.3, 0.3, 0.56, 8, '#c8c8d0', sx * 1.9, 0.62, sz, 0, 0, Math.PI / 2);
      g.box(0.15, 0.14, 0.5, '#555a66', sx * 1.4, 1.0, sz);
    }
  g.cyl(0.05, 0.05, 2.2, 5, '#c8c8d0', -0.8, 3.4, -1.2);
  g.add(new THREE.ConeGeometry(0.9, 0.5, 10, 1, true), '#f0f0f4', mat(-0.8, 4.6, -1.2, Math.PI * 0.85, 0, 0.3));
  g.box(0.3, 0.3, 0.3, '#ff5a3a', 0.9, 3.0, 1.4);
  return g.build();
}

function moonDome(): THREE.BufferGeometry {
  const g = new Geo();
  g.add(new THREE.SphereGeometry(6, 14, 7, 0, TAU, 0, Math.PI / 2), '#e8eaf0', mat(0, 0, 0));
  g.cyl(6.2, 6.4, 0.8, 14, '#9a9ca8', 0, 0.4, 0);
  for (let k = 0; k < 6; k++) g.box(1.4, 1.1, 0.2, '#9ad8ff', Math.cos(k * 1.05) * 5.3, 2.4, Math.sin(k * 1.05) * 5.3, 0, -k * 1.05 + Math.PI / 2, 0);
  g.cyl(0.1, 0.1, 5, 5, '#c8c8d0', 0, 8.4, 0);
  g.ball(0.4, '#ff3a3a', 0, 11, 0);
  return g.build();
}

function lander(): THREE.BufferGeometry {
  const g = new Geo();
  g.cyl(2.6, 3.2, 2.6, 8, '#e8c24a', 0, 4.2, 0);
  g.cyl(2.0, 2.6, 1.6, 8, '#d8d8de', 0, 6.3, 0);
  g.ball(1.1, '#3a4a6a', 0, 7.6, 0.6, 1.3, 0.7, 1);
  for (let k = 0; k < 4; k++) {
    const a = k * (Math.PI / 2) + Math.PI / 4;
    g.add(new THREE.CylinderGeometry(0.1, 0.1, 5, 4), '#c8c8d0', mat(Math.cos(a) * 3.2, 2.0, Math.sin(a) * 3.2, Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6));
    g.cyl(0.9, 0.9, 0.2, 8, '#d8d8de', Math.cos(a) * 4.2, 0.1, Math.sin(a) * 4.2);
  }
  return g.build();
}

function cheeseWedge(): THREE.BufferGeometry {
  const g = new Geo();
  g.prism(
    [
      [-3.5, 0, 3],
      [3.5, 0, 3],
      [3.5, 2.6, 3],
      [-3.5, 4.4, 3],
    ],
    '#f2c43a',
  );
  g.cyl(0.7, 0.7, 0.16, 8, '#d49a1c', 2.6, 1.4, 3.05, Math.PI / 2);
  g.cyl(0.8, 0.8, 0.16, 8, '#d49a1c', 1.2, 2.2, 3.05, Math.PI / 2);
  g.cyl(0.5, 0.5, 0.16, 8, '#d49a1c', -1.4, 1.2, 3.05, Math.PI / 2);
  g.cyl(0.6, 0.6, 0.16, 8, '#d49a1c', -0.2, 3.1, 3.05, Math.PI / 2);
  return g.build();
}

// ---------------------------------------------------------------------------
// The kitchen
// ---------------------------------------------------------------------------

function cerealStack(): THREE.BufferGeometry {
  const g = new Geo();
  ring(g, 1.5, 0.62, '#e8a838', 0, 0.62, 0);
  ring(g, 1.3, 0.55, '#ff9a3a', 0.25, 1.7, 0.1, Math.PI / 2, 0.4, 0);
  ring(g, 1.1, 0.5, '#ff7aa8', -0.1, 2.7, 0, Math.PI / 2, 1.1, 0);
  return g.build();
}

function cerealStanding(): THREE.BufferGeometry {
  const g = new Geo();
  ring(g, 2.3, 0.85, '#ff7aa8', 0, 2.4, 0, 0.1, 0.5, 0);
  ring(g, 1.8, 0.7, '#ffd23f', 1.8, 0.8, 1.6, Math.PI / 2, 0, 0);
  return g.build();
}

function strawberry(): THREE.BufferGeometry {
  const g = new Geo();
  g.cone(1.7, 3.2, 8, '#e8302c', 0, 1.6, 0);
  g.add(new THREE.ConeGeometry(1.7, 3.2, 8), '#e8302c', mat(0, 1.9, 0, Math.PI, 0, 0));
  g.ball(1.6, '#e8302c', 0, 2.4, 0, 1, 0.9, 1, 1);
  for (let k = 0; k < 6; k++) g.cone(0.4, 1.0, 4, '#4fa83a', Math.cos(k * 1.05) * 0.8, 4.1, Math.sin(k * 1.05) * 0.8, 0.4 * k);
  for (let k = 0; k < 9; k++) g.box(0.12, 0.2, 0.12, '#ffe9a0', Math.cos(k * 0.7) * 1.4, 1.6 + (k % 3) * 0.7, Math.sin(k * 0.7) * 1.4);
  return g.build();
}

function smallCereal(): THREE.BufferGeometry {
  const g = new Geo();
  for (const [x, z, c] of [
    [0, 0, '#e8a838'],
    [1.2, 0.5, '#ff9a3a'],
    [-0.8, 0.9, '#ffd23f'],
    [0.4, -1.1, '#ff7aa8'],
  ] as const) ring(g, 0.55, 0.24, c, x, 0.24, z, Math.PI / 2, 0, (x + z) * 0.1);
  return g.build();
}

function giantMug(color: string): THREE.BufferGeometry {
  const g = new Geo();
  g.cyl(3.6, 3.2, 6, 14, color, 0, 3, 0);
  g.cyl(3.3, 3.3, 0.3, 14, '#5a3320', 0, 5.9, 0);
  ring(g, 1.7, 0.45, color, 4.3, 3.2, 0, 0, 0, 0);
  for (let k = 0; k < 10; k++) g.ball(0.35, '#ffffff', Math.cos(k * 0.63) * 3.5, 2.2 + (k % 3) * 1.1, Math.sin(k * 0.63) * 3.5, 1, 1, 0.3);
  return g.build();
}

function milkCarton(): THREE.BufferGeometry {
  const g = new Geo();
  g.box(5, 8.6, 5, '#f6f6f2', 0, 4.3, 0);
  g.box(5.04, 3.2, 5.04, '#3f82e0', 0, 2.2, 0);
  g.prism(
    [
      [-2.5, 8.6, 2.5],
      [2.5, 8.6, 2.5],
      [0, 11.2, 2.5],
    ],
    '#e8eef6',
    mat(0, 0, 0, 0, Math.PI / 2, 0),
  );
  g.box(3.6, 1.6, 0.1, '#ffffff', 0, 5.6, 2.55);
  for (const [x, y] of [
    [-0.8, 5.8],
    [0.7, 5.5],
  ] as const) g.ball(0.45, '#2a2a2e', x, y, 2.6, 1, 0.8, 0.2);
  return g.build();
}

function cerealBox(): THREE.BufferGeometry {
  const g = new Geo();
  g.box(6.4, 9, 2.4, '#ff9a2a', 0, 4.5, 0);
  g.box(6.5, 2.0, 2.5, '#e8412c', 0, 8.2, 0);
  g.box(5.2, 3.8, 0.1, '#ffe9a0', 0, 4.8, 1.25);
  ring(g, 1.1, 0.4, '#e8a838', 0, 4.9, 1.34, 0, 0, 0);
  ring(g, 0.6, 0.22, '#ff7aa8', 1.5, 3.4, 1.34, 0, 0, 0);
  g.box(5.2, 0.5, 0.1, '#fffaf0', 0, 1.4, 1.25);
  return g.build();
}

function jamJar(): THREE.BufferGeometry {
  const g = new Geo();
  g.cyl(2.8, 2.8, 4.4, 14, '#c8203a', 0, 2.2, 0);
  g.cyl(2.5, 2.5, 3.2, 14, '#e8f0f4', 0, 2.2, 0);
  g.cyl(2.85, 2.85, 0.8, 14, '#f4c20d', 0, 4.8, 0);
  g.cyl(2.7, 2.7, 0.2, 14, '#ffffff', 0, 4.1, 0);
  g.box(2.6, 1.6, 0.1, '#fff4e0', 0, 2.2, 2.8);
  g.ball(0.5, '#c8203a', 0, 2.2, 2.9, 1, 1, 0.2);
  return g.build();
}

function bigSpoon(): THREE.BufferGeometry {
  const g = new Geo();
  g.add(new THREE.SphereGeometry(2.3, 12, 6, 0, TAU, 0, Math.PI / 2), '#d8dce4', mat(0, 0.4, 3.2, Math.PI, 0, 0, 1, 0.45, 1.5));
  g.box(0.6, 0.3, 6.5, '#c8ccd4', 0, 0.35, -2.8, 0.05);
  g.box(1.2, 0.3, 1.4, '#d8dce4', 0, 0.5, -6.1, 0.05);
  return g.build();
}

function toaster(): THREE.BufferGeometry {
  const g = new Geo();
  g.box(6.4, 4.6, 4.2, '#c8ccd4', 0, 2.3, 0);
  g.box(6.0, 0.4, 3.8, '#9a9ea8', 0, 4.8, 0);
  for (const sx of [-1.4, 1.4]) {
    g.box(1.5, 1.2, 0.5, '#e8b868', sx, 5.2, 0);
    g.box(0.8, 0.5, 0.2, '#2a2a30', sx, 4.85, 0);
  }
  g.box(0.8, 0.3, 0.3, '#e8412c', 3.4, 3, 0.8);
  g.box(0.5, 0.9, 0.3, '#2a2a30', 3.4, 3, -0.8);
  return g.build();
}

function cabinet(color: string): THREE.BufferGeometry {
  const g = new Geo();
  g.box(26, 34, 14, color, 0, 17, 0);
  g.box(10.4, 27.4, 0.5, '#f6ecd8', -6.2, 17, 7.2);
  g.box(10.4, 27.4, 0.5, '#f6ecd8', 6.2, 17, 7.2);
  g.ball(0.6, '#c8a050', -1.2, 17, 7.7);
  g.ball(0.6, '#c8a050', 1.2, 17, 7.7);
  return g.build();
}

function kitchenPot(): THREE.BufferGeometry {
  const g = new Geo();
  g.cyl(10, 9, 16, 12, '#d8dce4', 0, 8, 0);
  g.cyl(10.4, 10.4, 1.2, 12, '#b8bcc4', 0, 16.4, 0);
  g.ball(1.6, '#2a2a30', 0, 18, 0);
  g.box(7, 1.2, 1.2, '#2a2a30', 11, 12, 0);
  return g.build();
}

// ---------------------------------------------------------------------------
// The tree kinds (near 4, mid 3, far 2) the scenery builder instances, per set
// ---------------------------------------------------------------------------

/** Nine geometries for a wild set: four near props, three simpler mid ones and two far ones. */
export function wildTreeKinds(set: ScenerySet): THREE.BufferGeometry[] | null {
  switch (set) {
    case 'desert':
      return [saguaro(2), barrelCactus(), deadTree(), dryBush(), saguaro(1, 5), barrelCactus(), deadTree(), mesa('#c07a44', 22, 11), new Geo().ball(14, '#e8c27a', 0, 3, 0, 1.4, 0.45, 1).build()];
    case 'volcano':
      return [charredTree(), basaltSpire(), lavaRock(), emberBush(), charredTree(), basaltSpire(0.8), lavaRock(), new Geo().cone(12, 26, 6, '#2a2220', 0, 13, 0).cone(4, 5, 6, '#c8481c', 0, 24, 0).build(), new Geo().cone(14, 18, 6, '#352b28', 0, 9, 0).build()];
    case 'candy':
      return [lollipop('#ff5aa0', '#ffffff', '#ff9ccb'), lollipop('#3fa8ff', '#ffe27a', '#6fe0b8', 1.15), gumdropTree(), gumdropBush(), lollipop('#ff5aa0', '#ffffff', '#ff9ccb'), lollipop('#3fa8ff', '#ffe27a', '#6fe0b8'), gumdropTree(), new Geo().cone(10, 22, 7, '#ffb0d8', 0, 11, 0).cone(10.2, 3, 7, '#ffffff', 0, 21, 0).build(), new Geo().ball(11, '#a8f0d0', 0, 4, 0, 1.2, 0.9, 1.1).build()];
    case 'moon':
      return [moonRock(1.4), moonRock(1), moonSlab(), pebbles(), moonRock(1.4), moonRock(1), moonSlab(), new Geo().ball(16, '#5e606a', 0, 1, 0, 1.6, 0.6, 1.2).build(), new Geo().cone(22, 22, 7, '#54565f', 0, 11, 0).build()];
    case 'kitchen':
      return [cerealStack(), cerealStanding(), strawberry(), smallCereal(), cerealStack(), cerealStanding(), strawberry(), cabinet('#f2e6cc'), kitchenPot()];
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// The landmarks round each course
// ---------------------------------------------------------------------------

/** Scatters copies of a prop along the road: `count` of them at distances `off` outside the fence (a [min, max] pair). */
function along(c: WildCtx, make: () => THREE.BufferGeometry, count: number, off: [number, number], foot: number, scale: [number, number] = [1, 1], faceRoad = true): void {
  const geo = c.keep(make());
  const n = Math.round(count * c.density);
  for (let k = 0; k < n; k++) {
    const s = ((k + 0.2 + c.r() * 0.6) / n) * c.track.length;
    const sgn = c.r() < 0.5 ? 1 : -1;
    const p = c.roadside(s, sgn, off[0] + c.r() * (off[1] - off[0]));
    if (c.blocked(p.x, p.z, c.track.at(c.track.hw, s) + foot + 3)) continue;
    const sc = scale[0] + c.r() * (scale[1] - scale[0]);
    const y = c.terrain.visual(p.x, p.z);
    c.stat.addColored(geo.clone(), mat(p.x, y - 0.1, p.z, 0, faceRoad ? p.rot + (c.r() - 0.5) * 0.8 : c.r() * TAU, 0, sc, sc, sc));
  }
}

/** Standing things (for the volcano's glow and smoke, the chocolate fountain). */
export function landmarks(set: ScenerySet, c: WildCtx): void {
  const { track, terrain, L } = c;
  const cx = (track.minX + track.maxX) / 2;
  const cz = (track.minZ + track.maxZ) / 2;
  if (set === 'desert') {
    along(c, camel, 5, [6, 22], 4, [1.1, 1.5]);
    along(c, () => mesa('#c07a44', 14, 7), 10, [18, 60], 8, [0.8, 1.5], false);
    // an oasis: palms round the pond
    if (L.lake) {
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * TAU + c.r() * 0.5;
        const rr = 1.12 + c.r() * 0.35;
        const x = L.lake.cx + Math.cos(a) * L.lake.rx * rr;
        const z = L.lake.cz + Math.sin(a) * L.lake.rz * rr;
        if (terrain.roadDist(x, z) < 28) continue;
        c.statAt(palmTree(31 + k), x, z, c.r() * TAU, 1, 0.2);
      }
    }
    // pyramids on the horizon
    for (let k = 0; k < 3; k++) {
      const a = 0.9 + k * 0.28 + c.r() * 0.1;
      const x = cx + Math.cos(a) * (880 + k * 60);
      const z = cz + Math.sin(a) * (760 + k * 40);
      c.stat.addColored(pyramid(), mat(x, terrain.visual(x, z) - 1, z, 0, c.r() * 3, 0, 1 + k * 0.35, 1 + k * 0.35, 1 + k * 0.35));
    }
  } else if (set === 'volcano') {
    along(c, () => basaltSpire(1.4), 8, [10, 40], 6, [1, 1.8], false);
    along(c, lavaRock, 12, [8, 30], 5, [0.8, 1.5], false);
    // the cone's crater: a glowing lava pond, a soft glow and a column of smoke
    const [vx, vz] = L.vent ?? [0, 0];
    const top = terrain.visual(vx, vz);
    const disc = c.keep(new THREE.CircleGeometry(15, 20));
    disc.rotateX(-Math.PI / 2);
    const lavaMat = c.keep(new THREE.MeshBasicMaterial({ color: '#ff6a1c' }));
    const pond = new THREE.Mesh(disc, lavaMat);
    pond.position.set(vx, top + 0.5, vz);
    c.group.add(pond);
    const glowTex = c.keep(blobTex(64, 0.1));
    const glowMat = c.keep(new THREE.SpriteMaterial({ map: glowTex, color: '#ff7a2a', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7 }));
    const glow = new THREE.Sprite(glowMat);
    glow.position.set(vx, top + 10, vz);
    glow.scale.setScalar(90);
    c.group.add(glow);
    const N = c.high ? 40 : 22;
    const sg = c.keep(new THREE.BufferGeometry());
    sg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    const sm = c.keep(new THREE.PointsMaterial({ map: c.keep(blobTex(64, 0.2)), color: '#5a4a46', size: 26, transparent: true, opacity: 0.55, depthWrite: false }));
    const smoke = new THREE.Points(sg, sm);
    smoke.frustumCulled = false;
    c.group.add(smoke);
    c.anim.push((time) => {
      glowMat.opacity = 0.6 + 0.12 * Math.sin(time * 2.2);
      lavaMat.color.setHSL(0.045 + 0.01 * Math.sin(time * 1.7), 1, 0.52 + 0.05 * Math.sin(time * 3.1));
      const a = sg.getAttribute('position') as THREE.BufferAttribute;
      for (let k = 0; k < N; k++) {
        const t = (time * 0.05 + k / N) % 1;
        a.setXYZ(k, vx + Math.sin(k * 2.3 + time * 0.2) * (4 + t * 40) + t * 30, top + 6 + t * 150, vz + Math.cos(k * 1.7) * (4 + t * 40));
      }
      a.needsUpdate = true;
    });
  } else if (set === 'candy') {
    along(c, () => candyCane(5), 16, [3.5, 9], 1, [0.9, 1.5]);
    along(c, () => cupcake('#e8a0c8', '#ffd1e8'), 5, [14, 40], 5, [1.0, 1.7]);
    along(c, () => cupcake('#c8a070', '#8a5a3a'), 4, [14, 40], 5, [1.0, 1.6]);
    along(c, iceCreamTower, 5, [14, 44], 4, [0.9, 1.5]);
    along(c, gingerbreadHouse, 4, [18, 46], 6, [1.0, 1.4]);
    // the chocolate fountain where the river starts
    const st = L.stream?.[0];
    if (st) c.statAt(chocFountain(), st[0] - 14, st[1], 0, 6, 0.2);
  } else if (set === 'moon') {
    along(c, moonFlag, 5, [3, 8], 1, [1, 1.2]);
    along(c, rover, 2, [10, 30], 3, [1, 1.3]);
    along(c, moonDome, 3, [26, 60], 7, [1, 1.5], false);
    along(c, lander, 1, [18, 40], 5, [1, 1.2]);
    along(c, cheeseWedge, 2, [14, 36], 4, [1, 1.6]);
    along(c, () => moonRock(1.2), 22, [6, 80], 3, [0.8, 2.2], false);
  } else if (set === 'kitchen') {
    along(c, () => giantMug('#f2f2ee'), 5, [14, 44], 5, [1, 1.6]);
    along(c, () => giantMug('#ff7aa8'), 2, [14, 44], 5, [1, 1.4]);
    along(c, milkCarton, 3, [14, 40], 4, [1, 1.5]);
    along(c, cerealBox, 3, [14, 40], 4, [1, 1.5]);
    along(c, jamJar, 3, [12, 36], 4, [1, 1.4]);
    along(c, bigSpoon, 4, [8, 24], 5, [1, 1.5]);
    along(c, toaster, 2, [16, 40], 5, [1, 1.4]);
  }
}
