// The five courses of the wild and the crazy: the desert (dunes, cacti and a camel), the volcano (black rock, a
// lava lake and a smoking cone), candy land (lollipop trees and a chocolate river), the moon (craters, a black
// starry sky with the Earth in it and low gravity) and the kitchen (a giant table with huge cereal and cups).
// The same recipe as courses.ts: a closed circuit, the land round it and a theme.
import { DAY, DUSK, NIGHT, grow, layout, P, sky, type CourseDef } from './courses-base.ts';
import type { Layout } from './layout.ts';
import { FenceX, type Ctrl } from './track.ts';
import { fbm, smooth } from './util.ts';

/**
 * A closed circuit drawn as a blobby loop round the middle: `n` points on a squarish ellipse (`a`, `b`, `p` the
 * squareness) with the radius pushed in and out by `wob(angle)`. A loop never crosses itself, and the notches in
 * `wob` become hairpins. Driven from the bottom (the start/finish straight).
 */
export function ring(n: number, a: number, b: number, p: number, wob: (t: number) => number): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const t = -Math.PI / 2 + (k / n) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const w = 1 + wob(t);
    out.push([a * Math.sign(c) * Math.abs(c) ** (2 / p) * w, b * Math.sign(s) * Math.abs(s) ** (2 / p) * w]);
  }
  return out;
}

const gauss = (t: number, at: number, w: number): number => {
  let d = Math.abs(t - at);
  d = Math.min(d, Math.PI * 2 - d);
  return Math.exp(-((d / w) ** 2));
};

/** Ring points with a height and extras per index. */
function circuit(pts: [number, number][], y: (k: number, t: number) => number, extra: (k: number, t: number) => Partial<Ctrl>, hw: number): Ctrl[] {
  const n = pts.length;
  return pts.map(([x, z], k) => {
    const t = -Math.PI / 2 + (k / n) * Math.PI * 2;
    return P(x, z, y(k, t), { hw, ...extra(k, t) });
  });
}

// ---------------------------------------------------------------------------
// Öknen: long gravel through the dunes, a jump over a crest, a hairpin round a mesa, esses by the oasis
// ---------------------------------------------------------------------------

const KD = 1.3;
const DESERT_RING = ring(26, 205, 135, 2.5, (t) => 0.1 * Math.sin(2 * t + 0.8) + 0.07 * Math.sin(3 * t + 2.1) + 0.05 * Math.sin(6 * t + 0.5) - 0.45 * gauss(t, 2.35, 0.24));
const DESERT_CTRL: Ctrl[] = circuit(
  DESERT_RING,
  (_k, t) => 3.4 + 2.2 * Math.sin(2 * t + 1) + 1.2 * Math.sin(4 * t),
  (k) => {
    const o: Partial<Ctrl> = {};
    if (k <= 2) Object.assign(o, { surface: 'asphalt', runL: 6, runR: 6, hw: 8.5 });
    if (k === 8) Object.assign(o, { bump: 2.3, bw: 22, runL: 8, runR: 8 });
    if (k === 15) Object.assign(o, { bump: -1.3, bw: 24 });
    if (k === 21) Object.assign(o, { bump: 1.6, bw: 20 });
    return o;
  },
  8,
);

const desertLand =
  (hills: [number, number, number, number][]): Layout['natural'] =>
  (x, z, cx, cz, ex, ez) => {
    // long dune ridges: 1 − |2·noise − 1| makes crests, stretched along one way
    const ridge = 1 - Math.abs(2 * (0.5 + fbm(x / 210 + 0.3, z / 120 - 1.1, 3)));
    let h = 3.5 + 5.2 * ridge + 1.4 * fbm(x / 48, z / 48, 2);
    for (const [hx, hz, hh, r] of hills) {
      // a flat-topped mesa with steep sides
      const d = Math.hypot(x - hx, z - hz) / r;
      h += hh * (1 - smooth(0.7, 1.05, d));
    }
    const r = Math.hypot((x - cx) / (ex + 150), (z - cz) / (ez + 150));
    h += smooth(1.0, 3.4, r) * 26 * (fbm(x / 520 + 9, z / 520 - 4, 3) + 0.7);
    h += smooth(2.6, 7, r) * 60 * (fbm(x / 1100 - 3, z / 1100 + 6, 3) + 0.6);
    return h;
  };

const DESERT_COURSE: CourseDef = {
  id: 'desert',
  name: 'Öknen',
  ctrl: grow(DESERT_CTRL, KD),
  surface: 'gravel',
  fence: FenceX.Rope,
  hw: 8,
  run: 10,
  theme: {
    sky: {
      day: sky(DAY, { elev: 62, zenith: '#2f86e6', horizon: '#fbe6bd', haze: '#fff0c8', sunCol: '#fff4d0', cloud: '#fffaf0', cover: 0.72, sunI: 3.3, hemiSky: '#d8ecff', hemiGround: '#d9b070', hemiI: 1.3, fog: 0.00042 }),
      sunset: sky(DUSK, { elev: 6, zenith: '#5a4aa0', horizon: '#ffb070', haze: '#ff7a40', cloud: '#f0a090', hemiSky: '#a8a0e0', hemiGround: '#b07a50', fog: 0.0007 }),
      night: sky(NIGHT, { zenith: '#080e28', horizon: '#2c3558', hemiGround: '#3a3040', fog: 0.0008 }),
    },
    ground: {
      grassA: '#e3b46a',
      grassB: '#efc57c',
      grassDark: '#c98f4e',
      dry: '#f2d28e',
      floor: '#bf8648',
      sand: '#f2d896',
      mud: '#9a6a3a',
      verge: '#d9a860',
      mowA: '#e6bb70',
      mowB: '#dca862',
      farTint: '#d9a56a',
    },
    scenery: 'desert',
    snow: false,
    lit: false,
    alwaysNight: false,
    verge: '#d4a45a',
    vergeGrass: '#e2b672',
  },
  layout: layout({
    lake: { cx: -10 * KD, cz: 14 * KD, rx: 36, rz: 24, rot: 0.3 },
    forests: [
      { x: 90 * KD, z: 10 * KD, rx: 150, rz: 80, birch: 0.55 },
      { x: -30 * KD, z: -40 * KD, rx: 120, rz: 60, birch: 0.4 },
      { x: 0, z: 220 * KD, rx: 330, rz: 90, birch: 0.5 },
      { x: 320 * KD, z: -30 * KD, rx: 110, rz: 220, birch: 0.5 },
      { x: -330 * KD, z: 20 * KD, rx: 110, rz: 210, birch: 0.6 },
    ],
    farForest: 0.35,
    farBirch: 0.4,
    shoreTrees: false,
    natural: desertLand([
      [-120 * KD, -100 * KD, 16, 55],
      [140 * KD, -190 * KD, 22, 70],
      [-260 * KD, 100 * KD, 12, 60],
    ]),
  }),
};

// ---------------------------------------------------------------------------
// Vulkanen: black rock and a lava lake, a smoking cone in the middle, twisty gravel with a few jumps
// ---------------------------------------------------------------------------

const KV = 1.2;
const VOLCANO_RING = ring(24, 190, 150, 2.2, (t) => 0.12 * Math.sin(3 * t + 0.4) + 0.08 * Math.sin(2 * t + 2.2) + 0.04 * Math.sin(7 * t) - 0.4 * gauss(t, 0.7, 0.22) - 0.34 * gauss(t, 3.9, 0.24));
const VOLCANO_CTRL: Ctrl[] = circuit(
  VOLCANO_RING,
  (_k, t) => 3.6 + 1.8 * Math.sin(2 * t + 2) + 1.0 * Math.sin(5 * t),
  (k) => {
    const o: Partial<Ctrl> = { fenceL: FenceX.Rocks, fenceR: FenceX.Rocks };
    if (k <= 2) Object.assign(o, { surface: 'asphalt', runL: 6, runR: 6, hw: 8.5 });
    if (k === 7) Object.assign(o, { bump: 2.1, bw: 20 });
    if (k === 13) Object.assign(o, { bump: -1.2, bw: 22 });
    if (k === 19) Object.assign(o, { bump: 1.8, bw: 22 });
    return o;
  },
  7.5,
);
/** The volcano's cone, inside the loop (in metres): where the lava river starts. */
export const VOLCANO_AT: [number, number] = [-100 * KV, -30 * KV];

const volcanoLand: Layout['natural'] = (x, z, cx, cz, ex, ez) => {
  let h = 4 + 3 * fbm(x / 170 + 1.3, z / 170 - 2.1, 4) + 1.2 * fbm(x / 40, z / 40, 2);
  const d = Math.hypot(x - VOLCANO_AT[0], z - VOLCANO_AT[1]);
  h += 44 * Math.exp(-((d / 82) ** 2)) - 14 * Math.exp(-((d / 18) ** 2));
  const r = Math.hypot((x - cx) / (ex + 150), (z - cz) / (ez + 150));
  h += smooth(1.0, 3.4, r) * 40 * (fbm(x / 520 + 9, z / 520 - 4, 3) + 0.7);
  h += smooth(2.6, 7, r) * 90 * (fbm(x / 1100 - 3, z / 1100 + 6, 3) + 0.6);
  return h;
};

const VOLCANO_COURSE: CourseDef = {
  id: 'volcano',
  name: 'Vulkanen',
  ctrl: grow(VOLCANO_CTRL, KV),
  surface: 'gravel',
  fence: FenceX.Rocks,
  hw: 7.5,
  run: 9,
  theme: {
    sky: {
      day: sky(DUSK, { elev: 14, zenith: '#3a2230', horizon: '#e85a2a', haze: '#ff7a30', sunCol: '#ffb060', cloud: '#6a3a38', cover: 0.38, sunLight: '#ffb878', sunI: 2.0, hemiSky: '#a86a60', hemiGround: '#401e18', hemiI: 1.15, fog: 0.0011, night: 0.1, exposure: 1.05 }),
      sunset: sky(NIGHT, { zenith: '#1a0c14', horizon: '#7a2a1c', haze: '#c8481c', sunCol: '#ff8040', sunLight: '#ff9060', sunI: 1.2, hemiSky: '#7a4a50', hemiGround: '#2a1210', hemiI: 0.95, cover: 0.4, fog: 0.0014, night: 0.35 }),
      night: sky(NIGHT, { zenith: '#06040a', horizon: '#3a1410', haze: '#7a2a14', sunI: 0.4, hemiSky: '#503038', hemiGround: '#1c0c0a', hemiI: 0.8, fog: 0.0014 }),
    },
    ground: {
      grassA: '#463c38',
      grassB: '#54463f',
      grassDark: '#2e2724',
      dry: '#66534a',
      floor: '#342b28',
      sand: '#5e514a',
      mud: '#2a1a14',
      verge: '#4e3e36',
      mowA: '#54463f',
      mowB: '#4a3d37',
      farTint: '#4a2a22',
    },
    scenery: 'volcano',
    snow: false,
    lit: false,
    alwaysNight: false,
    verge: '#3a2c26',
    vergeGrass: '#2c2420',
    roadTint: '#9a8a86',
  },
  layout: layout({
    lake: { cx: 60 * KV, cz: 25 * KV, rx: 52, rz: 36, rot: 0.5 },
    waterColor: '#ff5a14',
    waterGlow: '#ff4a08',
    vent: VOLCANO_AT,
    forests: [
      { x: 0, z: 240 * KV, rx: 340, rz: 90, birch: 0.5 },
      { x: 300 * KV, z: 20 * KV, rx: 100, rz: 220, birch: 0.4 },
      { x: -310 * KV, z: 40 * KV, rx: 100, rz: 220, birch: 0.4 },
      { x: 0, z: -230 * KV, rx: 340, rz: 90, birch: 0.5 },
    ],
    farForest: 0.4,
    farBirch: 0.4,
    shoreTrees: false,
    natural: volcanoLand,
  }),
};

// ---------------------------------------------------------------------------
// Godislandet: pink ground, lollipop trees, a chocolate river and gumdrop hills
// ---------------------------------------------------------------------------

const KG = 1.3;
const CANDY_RING = ring(26, 195, 140, 2.6, (t) => 0.1 * Math.sin(2 * t + 1.6) + 0.09 * Math.sin(4 * t + 0.4) + 0.05 * Math.sin(6 * t + 2) - 0.38 * gauss(t, 5.0, 0.24));
const CANDY_CTRL: Ctrl[] = circuit(
  CANDY_RING,
  (_k, t) => 3 + 1.6 * Math.sin(3 * t + 0.5) + 0.8 * Math.sin(5 * t),
  (k) => {
    const o: Partial<Ctrl> = { fenceL: FenceX.Candy, fenceR: FenceX.Candy };
    if (k <= 2) Object.assign(o, { surface: 'asphalt', runL: 6, runR: 6, hw: 9 });
    if (k === 6) Object.assign(o, { bump: 2.0, bw: 22, runL: 8, runR: 8 });
    if (k === 12) Object.assign(o, { bump: 1.5, bw: 18 });
    if (k === 19) Object.assign(o, { bump: -1.2, bw: 22 });
    return o;
  },
  8.5,
);

const candyLand: Layout['natural'] = (x, z, cx, cz, ex, ez) => {
  // gumdrop hills: round domes in a loose grid
  const gx = Math.abs(Math.sin(x / 66 + 0.4 * Math.sin(z / 90))) ** 0.7;
  const gz = Math.abs(Math.sin(z / 58 + 0.5 * Math.sin(x / 110))) ** 0.7;
  let h = 2.6 + 4.2 * gx * gz + 1.2 * fbm(x / 60, z / 60, 2);
  const r = Math.hypot((x - cx) / (ex + 150), (z - cz) / (ez + 150));
  h += smooth(1.0, 3.4, r) * 22 * (fbm(x / 420 + 9, z / 420 - 4, 3) + 0.7);
  h += smooth(2.6, 7, r) * 50 * (fbm(x / 1000 - 3, z / 1000 + 6, 3) + 0.6);
  return h;
};

const CANDY_COURSE: CourseDef = {
  id: 'candy',
  name: 'Godislandet',
  ctrl: grow(CANDY_CTRL, KG),
  surface: 'asphalt',
  fence: FenceX.Candy,
  hw: 8.5,
  run: 9,
  theme: {
    sky: {
      day: sky(DAY, { elev: 50, zenith: '#7fb6ff', horizon: '#ffe9f4', haze: '#fff0f8', cloud: '#ffd6ec', cover: 0.45, sunI: 2.8, hemiSky: '#ffe3f4', hemiGround: '#e8a0c8', hemiI: 1.4, fog: 0.0005 }),
      sunset: sky(DUSK, { zenith: '#8a5ac8', horizon: '#ffb0d0', haze: '#ff90b8', cloud: '#ffc0e0', sunCol: '#ffd0a0', hemiSky: '#d0a0f0', hemiGround: '#a06a98', night: 0, fog: 0.0008 }),
      night: sky(NIGHT, { zenith: '#241450', horizon: '#6a3a8a', haze: '#8a4a9a', cloud: '#5a3a7a', hemiSky: '#8a6ac8', hemiGround: '#4a2a5a', hemiI: 0.95, fog: 0.001 }),
    },
    ground: {
      grassA: '#ff9ccb',
      grassB: '#ffb3d9',
      grassDark: '#ec78b8',
      dry: '#ffd1e8',
      floor: '#bfeccd',
      sand: '#fff0c0',
      mud: '#6a3d26',
      verge: '#f0cf9c',
      mowA: '#ffb8dc',
      mowB: '#ace8cc',
      farTint: '#d9a0e0',
    },
    scenery: 'candy',
    snow: false,
    lit: false,
    alwaysNight: false,
    verge: '#f0cf9c',
    vergeGrass: '#ffb0d6',
    roadTint: '#a87a62',
  },
  layout: layout({
    lake: { cx: 0, cz: 6 * KG, rx: 62, rz: 38, rot: -0.3 },
    waterColor: '#5a3320',
    stream: [
      [-150 * KG, 18 * KG],
      [-118 * KG, 10 * KG],
      [-88 * KG, 6 * KG],
      [-50 * KG, 6 * KG],
    ],
    forests: [
      { x: 0, z: 240 * KG, rx: 340, rz: 90, birch: 0.5 },
      { x: 0, z: -230 * KG, rx: 340, rz: 90, birch: 0.5 },
      { x: 320 * KG, z: 0, rx: 100, rz: 230, birch: 0.6 },
      { x: -320 * KG, z: 0, rx: 100, rz: 230, birch: 0.4 },
      { x: 60 * KG, z: 30 * KG, rx: 90, rz: 50, birch: 0.3 },
    ],
    farForest: 0.5,
    farBirch: 0.5,
    shoreTrees: true,
    natural: candyLand,
  }),
};

// ---------------------------------------------------------------------------
// Månen: grey craters, big flat jumps in the low gravity, and the Earth over the horizon
// ---------------------------------------------------------------------------

const KM2 = 1.35;
const MOON_RING = ring(24, 205, 145, 2.4, (t) => 0.09 * Math.sin(2 * t + 0.2) + 0.08 * Math.sin(3 * t + 1.3) + 0.04 * Math.sin(6 * t + 1) - 0.4 * gauss(t, 1.2, 0.24));
const MOON_CTRL: Ctrl[] = circuit(
  MOON_RING,
  (_k, t) => 3 + 1.6 * Math.sin(2 * t) + 1.4 * Math.sin(5 * t + 1),
  (k) => {
    const o: Partial<Ctrl> = { fenceL: FenceX.Rocks, fenceR: FenceX.Rocks };
    if (k <= 2) Object.assign(o, { surface: 'asphalt', runL: 6, runR: 6, hw: 9 });
    if (k === 5) Object.assign(o, { bump: 3.2, bw: 26, runL: 10, runR: 10 });
    if (k === 11) Object.assign(o, { bump: -2.0, bw: 28 });
    if (k === 17) Object.assign(o, { bump: 3.0, bw: 26 });
    return o;
  },
  8.5,
);

/** Craters (before growing): centre, radius and depth. The loop stays clear of them. */
const CRATERS: [number, number, number, number][] = [
  [-20, -10, 62, 9],
  [120, 35, 34, 5],
  [-130, 40, 38, 6],
  [40, 70, 22, 3.5],
  [-60, -80, 24, 4],
  [260, -90, 90, 14],
  [-280, -60, 80, 12],
  [10, 280, 110, 16],
  [-190, 250, 70, 10],
  [230, 230, 70, 10],
];

const moonLand: Layout['natural'] = (x, z, cx, cz, ex, ez) => {
  let h = 5 + 1.6 * fbm(x / 220 + 1.3, z / 220 - 2.1, 4) + 0.5 * fbm(x / 36, z / 36, 2);
  for (const [qx, qz, qr, qd] of CRATERS) {
    const d = Math.hypot(x - qx * KM2, z - qz * KM2) / (qr * KM2);
    // a bowl inside, a raised rim, a soft skirt outside
    h -= qd * (1 - smooth(0.0, 0.92, d)) * (1 - 0.25 * d);
    h += qd * 0.28 * Math.exp(-(((d - 1.0) / 0.12) ** 2));
  }
  const r = Math.hypot((x - cx) / (ex + 150), (z - cz) / (ez + 150));
  h += smooth(1.0, 3.4, r) * 30 * (fbm(x / 520 + 9, z / 520 - 4, 3) + 0.7);
  h += smooth(2.6, 7, r) * 80 * (fbm(x / 1100 - 3, z / 1100 + 6, 3) + 0.6);
  return h;
};

const EARTH = { az: Math.atan2(0.75, 0.66), elev: 24, size: 0.12 };
const MOON_SPACE = { cloud: '#000000', cover: 3, night: 0 };

const MOON_COURSE: CourseDef = {
  id: 'moon',
  name: 'Månen',
  ctrl: grow(MOON_CTRL, KM2),
  surface: 'asphalt',
  fence: FenceX.Rocks,
  hw: 8.5,
  run: 10,
  theme: {
    sky: {
      day: sky(NIGHT, { ...MOON_SPACE, elev: 28, az: Math.atan2(-0.55, 0.8), zenith: '#000003', horizon: '#06070d', haze: '#06070d', sunCol: '#fffbe8', sunLight: '#ffffff', sunI: 3.5, hemiSky: '#1c2440', hemiGround: '#40404a', hemiI: 0.55, fog: 0.00005, exposure: 1.05, earth: EARTH }),
      sunset: sky(NIGHT, { ...MOON_SPACE, elev: 6, az: Math.atan2(-0.55, 0.8), zenith: '#000003', horizon: '#0a0710', haze: '#100a14', sunCol: '#ffd8a0', sunLight: '#ffc890', sunI: 2.6, hemiSky: '#241c38', hemiGround: '#38343c', hemiI: 0.5, fog: 0.00005, earth: EARTH }),
      night: sky(NIGHT, { ...MOON_SPACE, elev: 12, az: Math.atan2(0.2, -0.9), zenith: '#000002', horizon: '#04050a', haze: '#04050a', sunCol: '#b8c8ff', sunLight: '#9ab4ff', sunI: 0.55, hemiSky: '#20305a', hemiGround: '#20222c', hemiI: 0.65, fog: 0.00005, earth: { ...EARTH, size: 0.14 } }),
    },
    ground: {
      grassA: '#8a8c94',
      grassB: '#9a9ca4',
      grassDark: '#6a6c74',
      dry: '#aaaab2',
      floor: '#5c5e66',
      sand: '#9a9aa2',
      mud: '#50525a',
      verge: '#7a7c84',
      mowA: '#8e9098',
      mowB: '#84868e',
      farTint: '#50525c',
    },
    scenery: 'moon',
    snow: false,
    lit: false,
    alwaysNight: false,
    verge: '#74767e',
    vergeGrass: '#80828a',
    roadTint: '#b4b8c8',
    gravity: 0.4,
  },
  layout: layout({
    forests: [
      { x: 260 * KM2, z: 0, rx: 100, rz: 200, birch: 0.4 },
      { x: -260 * KM2, z: 0, rx: 100, rz: 200, birch: 0.4 },
      { x: 0, z: 200 * KM2, rx: 300, rz: 70, birch: 0.5 },
      { x: 0, z: -200 * KM2, rx: 300, rz: 70, birch: 0.5 },
    ],
    farForest: 0.3,
    farBirch: 0.5,
    natural: moonLand,
  }),
};

// ---------------------------------------------------------------------------
// Köket: a giant table under a gingham cloth, among huge cereal, cups and jam jars
// ---------------------------------------------------------------------------

const KK = 1.25;
const KITCHEN_RING = ring(22, 190, 130, 3.1, (t) => 0.08 * Math.sin(2 * t + 0.9) + 0.06 * Math.sin(3 * t + 2.4) + 0.05 * Math.sin(7 * t + 1.2) - 0.36 * gauss(t, 4.1, 0.24));
const KITCHEN_CTRL: Ctrl[] = circuit(
  KITCHEN_RING,
  (_k, t) => 2.4 + 0.8 * Math.sin(2 * t + 1),
  (k) => {
    const o: Partial<Ctrl> = { fenceL: FenceX.Cubes, fenceR: FenceX.Cubes };
    // the whole road is a wooden board, with planks
    Object.assign(o, { deck: true });
    if (k <= 2) Object.assign(o, { runL: 6, runR: 6, hw: 9 });
    if (k === 7) Object.assign(o, { bump: 1.8, bw: 20 });
    if (k === 15) Object.assign(o, { bump: 1.4, bw: 18 });
    return o;
  },
  8.5,
);

const kitchenLand: Layout['natural'] = (x, z, cx, cz, ex, ez) => {
  // a table top: nearly flat, a few folds in the cloth
  let h = 2.2 + 0.5 * fbm(x / 120 + 1.3, z / 120 - 2.1, 3) + 0.15 * fbm(x / 22, z / 22, 2);
  const r = Math.hypot((x - cx) / (ex + 150), (z - cz) / (ez + 150));
  h += smooth(2.4, 6, r) * 6 * (fbm(x / 600 + 9, z / 600 - 4, 3) + 0.6);
  return h;
};

const KITCHEN_COURSE: CourseDef = {
  id: 'kitchen',
  name: 'Köket',
  ctrl: grow(KITCHEN_CTRL, KK),
  surface: 'asphalt',
  fence: FenceX.Cubes,
  hw: 8.5,
  run: 8,
  theme: {
    sky: {
      day: sky(DAY, { elev: 56, az: Math.atan2(-0.5, 0.7), zenith: '#fff0d4', horizon: '#ecd4aa', haze: '#fff2d2', sunCol: '#fff4d8', cloud: '#fffaf0', cover: 3, sunLight: '#fff0d0', sunI: 2.8, hemiSky: '#fff6e4', hemiGround: '#d8b888', hemiI: 1.5, fog: 0.0011 }),
      sunset: sky(DUSK, { elev: 14, zenith: '#e8b878', horizon: '#d89a58', haze: '#f0a860', cloud: '#f0b080', cover: 3, sunCol: '#ffc880', sunLight: '#ffb870', sunI: 2.2, hemiSky: '#f0d0a0', hemiGround: '#a87848', hemiI: 1.3, night: 0, fog: 0.0013 }),
      night: sky(NIGHT, { zenith: '#1c2038', horizon: '#3a3a50', haze: '#4a4660', cloud: '#2a2c44', cover: 3, sunI: 0.6, hemiSky: '#6a74a8', hemiGround: '#3a3238', hemiI: 0.95, night: 0.15, fog: 0.0014 }),
    },
    ground: {
      grassA: '#dba56a',
      grassB: '#cf9a60',
      grassDark: '#a8703c',
      dry: '#ebbd80',
      floor: '#8c5c30',
      sand: '#f4e4c4',
      mud: '#6a4020',
      verge: '#ecdcba',
      mowA: '#ebc890',
      mowB: '#e0bc82',
      farTint: '#c8b090',
      check: { a: '#e8503c', b: '#fff2e0', size: 22 },
    },
    scenery: 'kitchen',
    snow: false,
    lit: false,
    alwaysNight: false,
    verge: '#f0e2c4',
    vergeGrass: '#f6ecd4',
    roadTint: '#fff0d8',
  },
  layout: layout({
    forests: [
      { x: 0, z: 230 * KK, rx: 330, rz: 100, birch: 0.5 },
      { x: 0, z: -220 * KK, rx: 330, rz: 100, birch: 0.5 },
      { x: 300 * KK, z: 0, rx: 100, rz: 240, birch: 0.5 },
      { x: -300 * KK, z: 0, rx: 100, rz: 240, birch: 0.5 },
      { x: 50 * KK, z: 10 * KK, rx: 80, rz: 40, birch: 0.5 },
    ],
    farForest: 0.0,
    natural: kitchenLand,
  }),
};

export const WILD_COURSE_DEFS: Record<'desert' | 'volcano' | 'candy' | 'moon' | 'kitchen', CourseDef> = {
  desert: DESERT_COURSE,
  volcano: VOLCANO_COURSE,
  candy: CANDY_COURSE,
  moon: MOON_COURSE,
  kitchen: KITCHEN_COURSE,
};
