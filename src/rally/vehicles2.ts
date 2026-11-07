// Phase 10: ten more vehicles in the same recipe as vehicles.ts and models.ts: a painted body in the paint atlas
// (sponsors, number, dirt and dents come for free), trim, glass and lamps in vertex colours, wheels the game spins,
// and a driver in a helmet either behind the glass (head) or on top (rider). The outlines are added by the builder.
import * as THREE from 'three';
import { Geo, mat } from './geo.ts';
import {
  CHROME,
  DARK,
  GLASS_CAR,
  beam,
  bodyClassify,
  profileGeo,
  rod,
  roofClassify,
  type BodySpec,
  type Classify,
  type Parts,
  type WheelSpec,
} from './models.ts';

const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** A boxy body: sides to the doors, the top to the roof, the ends to front and back. */
const boxCls: Classify = (nx, ny, nz) => (nx > 0.7 ? 'doorP' : nx < -0.7 ? 'doorN' : ny < -0.5 ? 'dark' : ny > 0.5 ? 'roof' : nz > 0 ? 'front' : 'back');
/** The same, but the top is a bonnet. */
const hoodCls: Classify = (nx, ny, nz) => (nx > 0.7 ? 'doorP' : nx < -0.7 ? 'doorN' : ny < -0.5 ? 'dark' : ny > 0.5 ? 'hood' : nz > 0 ? 'front' : 'back');

const RUST = '#8a4a2c';
const WAFFLE = '#d9a35a';

/** A stripe of alternating colours along x (an awning, a hazard board): n panels across `w`. */
function stripes(g: Geo, w: number, h: number, d: number, n: number, c1: string, c2: string, x0: number, y: number, z: number, rx = 0): void {
  const pw = w / n;
  for (let i = 0; i < n; i++) g.box(pw * 0.98, h, d, i % 2 ? c2 : c1, x0 + pw * (i + 0.5), y, z, rx);
}

/** Round lights on the nose and tail lights, the same on most of them. */
function lights(P: Parts, y: number, zf: number, zb: number, x: number): void {
  for (const sx of [-1, 1]) {
    P.lamp.cyl(0.12, 0.12, 0.06, 10, '#fff4cc', sx * x, y, zf, Math.PI / 2);
    P.brake.box(0.26, 0.14, 0.04, '#ffffff', sx * (x + 0.05), y + 0.04, zb);
  }
}

// ---------------------------------------------------------------------------
// EPA-traktor: an old car made into a slow tractor, with the warning triangle and a beacon
// ---------------------------------------------------------------------------

export function epa(P: Parts): BodySpec {
  const { pg, tg, glass, lamp, brake } = P;
  const wheels: WheelSpec[] = [
    { x: 0.82, z: 1.25, r: 0.36, w: 0.2 },
    { x: -0.82, z: 1.25, r: 0.36, w: 0.2 },
    { x: 0.82, z: -1.3, r: 0.36, w: 0.2 },
    { x: -0.82, z: -1.3, r: 0.36, w: 0.2 },
  ];
  // the old boxy body: a tall nose, a square cabin, a flat tail
  pg.add(
    profileGeo([
      [2.0, 0.34, 0.9],
      [2.04, 0.78, 0.88],
      [1.9, 1.0, 0.86],
      [0.95, 1.06, 0.88],
      [-1.7, 1.06, 0.9],
      [-2.05, 1.02, 0.88],
      [-2.08, 0.4, 0.9],
      [-1.8, 0.28, 0.88],
      [1.8, 0.28, 0.88],
    ]),
    undefined,
    bodyClassify(0.95, -1.7),
  );
  glass.prism([
    [0.95, 1.02, 0.84],
    [0.5, 1.62, 0.74],
    [-1.35, 1.62, 0.74],
    [-1.7, 1.02, 0.84],
  ], GLASS_CAR);
  // roof, pillars and a plate where the back window was
  pg.box(1.5, 0.08, 1.9, 0, 1.67, -0.42, roofClassify);
  for (const sx of [-1, 1]) {
    pg.box(0.07, 0.6, 0.1, sx * 0.78, 1.34, -0.5);
    pg.add(beamGeo2(V(sx * 0.82, 1.02, 0.95), V(sx * 0.74, 1.64, 0.5), 0.08));
    pg.add(beamGeo2(V(sx * 0.86, 1.02, -1.7), V(sx * 0.76, 1.64, -1.4), 0.1));
  }
  pg.box(1.5, 0.6, 0.06, 0, 1.3, -1.52, boxCls);
  // round fenders over the wheels, like an old car
  for (const w of wheels) {
    const sx = Math.sign(w.x);
    pg.box(0.24, 0.14, 0.95, sx * 0.94, 0.78, w.z, boxCls);
  }
  // one fender that does not match: rust
  tg.box(0.26, 0.2, 0.8, RUST, 0.94, 0.66, 1.25);
  // chrome bumpers and a grille
  tg.box(1.9, 0.12, 0.14, CHROME, 0, 0.46, 2.1);
  tg.box(1.9, 0.12, 0.14, CHROME, 0, 0.46, -2.14);
  tg.box(0.8, 0.34, 0.06, '#26262b', 0, 0.78, 2.07);
  for (let i = 0; i < 4; i++) tg.box(0.74, 0.03, 0.07, CHROME, 0, 0.66 + i * 0.09, 2.08);
  // the tow bar, a hay bale on the roof rack, and a long exhaust
  tg.box(0.12, 0.12, 0.5, '#26262b', 0, 0.42, -2.35);
  tg.box(0.22, 0.2, 0.14, '#3a3c42', 0, 0.42, -2.62);
  rod(tg, V(-0.7, 1.74, 0.3), V(-0.7, 1.74, -1.2), 0.025, '#26262b');
  rod(tg, V(0.7, 1.74, 0.3), V(0.7, 1.74, -1.2), 0.025, '#26262b');
  tg.cyl(0.32, 0.32, 0.9, 10, '#d9b24a', 0, 1.98, -0.5, 0, 0, Math.PI / 2);
  rod(tg, V(0.4, 0.34, -1.9), V(0.4, 0.34, -2.35), 0.05, '#4a4d55');
  // the amber beacon on the roof
  tg.cyl(0.14, 0.16, 0.08, 8, '#26262b', 0, 2.2, 0.3);
  lamp.cyl(0.12, 0.12, 0.2, 8, '#ffb02e', 0, 2.33, 0.3);
  // the slow-vehicle triangle: a red frame, an orange middle, on the tail
  tg.add(new THREE.CylinderGeometry(0.46, 0.46, 0.04, 3), '#d6352b', mat(0, 1.3, -1.57, Math.PI / 2, 0, Math.PI / 2));
  tg.add(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 3), '#ffb02e', mat(0, 1.29, -1.595, Math.PI / 2, 0, Math.PI / 2));
  // the "30" disc under it
  tg.cyl(0.2, 0.2, 0.04, 12, '#d6352b', 0.5, 0.86, -1.57, Math.PI / 2);
  tg.cyl(0.15, 0.15, 0.05, 12, '#ffffff', 0.5, 0.86, -1.595, Math.PI / 2);
  tg.box(0.05, 0.14, 0.05, '#15171c', 0.46, 0.86, -1.625).box(0.05, 0.14, 0.05, '#15171c', 0.55, 0.86, -1.625);
  for (const sx of [-1, 1]) {
    lamp.cyl(0.14, 0.14, 0.07, 10, '#fff2a8', sx * 0.6, 0.78, 2.08, Math.PI / 2);
    brake.box(0.26, 0.14, 0.04, '#ffffff', sx * 0.7, 0.9, -2.09);
  }
  return {
    wheels,
    halfW: 0.9,
    nose: 2.1,
    tail: -2.14,
    sill: 0.28,
    belt: 1.04,
    roof: { y: 1.7, z0: 0.4, z1: -1.4, w: 1.5 },
    lip: { y: 1.7, z: -1.4, w: 1.5 },
    deck: { y: 1.06, z: -1.9, w: 1.5 },
    head: [0.36, 1.26, -0.2],
    lamps: [[0.6, 0.78, 2.1]],
    tails: { p: [0.7, 0.9, -2.1], w: 0.26, h: 0.14 },
    pipe: [0.4, 0.34, -2.38],
    plate: [0, 0.62, -2.09],
    bumper: { y: 0.46, z: -2.15, w: 1.9, h: 0.12 },
    screen: { z0: 0.95, y0: 1.04, z1: 0.5, y1: 1.62, hw: 0.74 },
    spots: {
      hood: { region: 'hood', p: [0, 1.06, 1.45], size: 0.6 },
      roof: { region: 'roof', p: [0, 1.67, -0.42], size: 0.6 },
      doors: { region: 'doorP', p: [0.9, 0.7, -0.2], size: 0.5 },
      back: { region: 'back', p: [0, 0.8, -2.06], size: 0.26 },
    },
    numberSpot: { region: 'doorP', p: [0.9, 0.72, -0.5], size: 0.5 },
    eye: [0, 1.5, 0.7],
    snorkel: { x: -0.94, y: 0.75, z: 1.25, top: 1.5, zTop: 0.3 },
  };
}

/** A small beam geometry (models.ts keeps its own private copy). */
function beamGeo2(a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.BufferGeometry {
  const g = new Geo();
  beam(g, a, b, t, '#ffffff');
  return g.build();
}

// ---------------------------------------------------------------------------
// Glassbil: a van with a serving hatch, an awning and a giant cone on the roof
// ---------------------------------------------------------------------------

export function icecream(P: Parts): BodySpec {
  const { pg, tg, glass, lamp, brake } = P;
  const wheels: WheelSpec[] = [
    { x: 0.9, z: 1.45, r: 0.4, w: 0.26 },
    { x: -0.9, z: 1.45, r: 0.4, w: 0.26 },
    { x: 0.9, z: -1.35, r: 0.4, w: 0.26 },
    { x: -0.9, z: -1.35, r: 0.4, w: 0.26 },
  ];
  // the van: a short bonnet and a low cab below the windows, then a tall box behind it
  pg.add(
    profileGeo([
      [2.15, 0.38, 1.0],
      [2.2, 0.76, 0.98],
      [2.0, 1.04, 0.96],
      [1.4, 1.1, 0.98],
      [1.15, 1.2, 0.98],
      [0.1, 1.2, 0.98],
      [0.1, 2.8, 1.02],
      [-2.2, 2.8, 1.02],
      [-2.28, 2.7, 1.0],
      [-2.28, 0.52, 1.0],
      [-2.0, 0.34, 0.98],
      [1.9, 0.34, 0.98],
    ]),
    undefined,
    boxCls,
  );
  // the cab's glasshouse: a roof on two pillars, the glass a long box you see the driver through
  pg.box(1.84, 0.08, 1.0, 0, 2.1, 0.62, roofClassify);
  for (const sx of [-1, 1]) pg.add(beamGeo2(V(sx * 0.9, 1.2, 1.15), V(sx * 0.88, 2.08, 0.9), 0.09));
  // the roof of the box and a pink band round it
  pg.box(2.02, 0.06, 2.3, 0, 2.83, -1.05, roofClassify);
  tg.box(2.06, 0.2, 2.5, '#f4f1ea', 0, 2.55, -1.05);
  tg.box(2.08, 0.1, 2.52, '#f06ba8', 0, 2.38, -1.05);
  // the windscreen and the side window of the cab
  glass.prism([
    [1.15, 1.2, 0.9],
    [0.9, 2.06, 0.88],
    [0.12, 2.06, 0.88],
    [0.12, 1.2, 0.9],
  ], GLASS_CAR);
  // the serving hatch on the right: a dark hole, a counter, a striped awning
  tg.box(0.06, 0.8, 1.5, '#1d1a22', 1.02, 1.7, -1.1);
  tg.box(0.3, 0.07, 1.6, '#c9ccd2', 1.12, 1.28, -1.1);
  tg.box(0.04, 0.3, 1.0, '#f4f1ea', 1.03, 1.9, -1.1);
  for (let i = 0; i < 6; i++) tg.box(0.5, 0.06, 0.32, i % 2 ? '#f4f1ea' : '#f06ba8', 1.28, 2.2, -2.0 + i * 0.32 + 0.16, 0, 0, -0.35);
  // a small menu board and a bell
  tg.box(0.04, 0.5, 0.4, '#26262b', 1.04, 1.2, -2.05);
  // the giant cone on the roof: a waffle cone pointing down, two scoops and a cherry
  tg.cyl(0.4, 0.04, 0.95, 8, WAFFLE, 0, 3.5, -1.1);
  tg.ball(0.42, '#f06ba8', 0, 4.08, -1.1, 1, 0.9, 1, 1);
  tg.ball(0.36, '#fff3c4', 0, 4.5, -1.1, 1, 0.9, 1, 1);
  tg.ball(0.09, '#d6352b', 0, 4.9, -1.1);
  rod(tg, V(-0.3, 2.86, -1.6), V(-0.2, 3.05, -1.3), 0.03, '#26262b');
  rod(tg, V(0.3, 2.86, -0.6), V(0.2, 3.05, -0.9), 0.03, '#26262b');
  // loudspeaker horns for the tune
  for (const sx of [-1, 1]) {
    tg.cyl(0.18, 0.06, 0.34, 8, '#c9ccd2', sx * 0.7, 2.98, 0.0, Math.PI / 2);
  }
  // grille and bumpers
  tg.box(0.9, 0.4, 0.06, '#26262b', 0, 0.8, 2.2);
  tg.box(2.0, 0.18, 0.16, '#c9ccd2', 0, 0.45, 2.2);
  tg.box(2.0, 0.18, 0.16, DARK, 0, 0.45, -2.3);
  lights(P, 0.7, 2.22, -2.29, 0.7);
  return {
    wheels,
    halfW: 1.0,
    nose: 2.25,
    tail: -2.3,
    sill: 0.34,
    belt: 1.15,
    roof: { y: 2.85, z0: 0.1, z1: -2.2, w: 2.0 },
    lip: { y: 2.85, z: -2.2, w: 2.0 },
    deck: { y: 1.2, z: -2.2, w: 2.0 },
    head: [0.4, 1.7, 0.55],
    lamps: [[0.7, 0.7, 2.24]],
    tails: { p: [0.75, 0.84, -2.29], w: 0.26, h: 0.14 },
    pipe: [-0.5, 0.36, -2.34],
    plate: [0, 0.6, -2.29],
    bumper: { y: 0.45, z: -2.3, w: 2.0, h: 0.18 },
    screen: { z0: 1.15, y0: 1.2, z1: 0.9, y1: 2.05, hw: 0.88 },
    spots: {
      hood: { region: 'hood', p: [0, 1.1, 1.7], size: 0.6 },
      roof: { region: 'roof', p: [0, 2.83, -1.2], size: 0.8 },
      doors: { region: 'doorP', p: [1.0, 1.9, -0.7], size: 0.7 },
      back: { region: 'back', p: [0, 1.5, -2.29], size: 0.6 },
    },
    numberSpot: { region: 'doorP', p: [1.0, 0.8, -1.4], size: 0.6 },
    eye: [0, 1.9, 0.9],
    snorkel: { x: -1.0, y: 0.8, z: 1.45, top: 1.8, zTop: 0.2 },
  };
}

// ---------------------------------------------------------------------------
// Sopbil: a garbage truck with a bin lift and a bin in its arms
// ---------------------------------------------------------------------------

export function garbage(P: Parts): BodySpec {
  const { pg, tg, glass, lamp, brake } = P;
  const wheels: WheelSpec[] = [
    { x: 1.0, z: 2.0, r: 0.46, w: 0.3 },
    { x: -1.0, z: 2.0, r: 0.46, w: 0.3 },
    { x: 1.0, z: -0.9, r: 0.46, w: 0.3 },
    { x: -1.0, z: -0.9, r: 0.46, w: 0.3 },
    { x: 1.0, z: -2.1, r: 0.46, w: 0.3 },
    { x: -1.0, z: -2.1, r: 0.46, w: 0.3 },
  ];
  // the cab: a tall square block under the windows, a flat windscreen above it
  pg.add(
    profileGeo([
      [2.7, 0.62, 1.08],
      [2.74, 1.5, 1.06],
      [2.5, 1.6, 1.04],
      [1.3, 1.6, 1.06],
      [1.3, 0.9, 1.08],
      [1.4, 0.62, 1.08],
    ]),
    undefined,
    hoodCls,
  );
  pg.box(2.0, 0.1, 1.2, 0, 2.55, 1.9, hoodCls);
  for (const sx of [-1, 1]) pg.add(beamGeo2(V(sx * 1.0, 1.6, 2.5), V(sx * 0.98, 2.52, 2.42), 0.1));
  // the compactor body: a long rounded box behind the cab
  pg.add(
    profileGeo([
      [1.2, 0.95, 1.12],
      [1.2, 2.45, 1.1],
      [0.8, 2.85, 1.0],
      [-2.2, 2.85, 1.0],
      [-3.1, 2.55, 1.04],
      [-3.4, 1.7, 1.08],
      [-3.4, 0.95, 1.1],
    ]),
    undefined,
    boxCls,
  );
  // a hazard-striped tail and the hopper mouth
  tg.box(2.2, 0.8, 0.16, '#26262b', 0, 1.35, -3.46);
  stripes(tg, 2.2, 0.22, 0.2, 8, '#f4c20d', '#15171c', -1.1, 0.95, -3.5, 0);
  // the bin lift: two arms and a frame, holding a green wheelie bin
  rod(tg, V(-0.95, 2.4, -3.4), V(-0.95, 0.9, -3.65), 0.07, '#4a4d55');
  rod(tg, V(0.95, 2.4, -3.4), V(0.95, 0.9, -3.65), 0.07, '#4a4d55');
  tg.box(2.0, 0.1, 0.12, '#4a4d55', 0, 1.0, -3.7);
  tg.box(0.7, 0.9, 0.55, '#2f8a3c', 0, 1.5, -3.95);
  tg.box(0.76, 0.1, 0.62, '#1f6a2c', 0, 2.0, -3.95);
  tg.cyl(0.07, 0.07, 0.04, 8, '#15171c', 0.3, 1.1, -4.24, Math.PI / 2);
  // glass: the windscreen and the side window
  glass.prism([
    [2.52, 1.6, 1.0],
    [2.44, 2.5, 0.98],
    [1.28, 2.5, 0.98],
    [1.28, 1.6, 1.0],
  ], GLASS_CAR);
  // bumper, grille and steps
  tg.box(2.15, 0.28, 0.2, '#c9ccd2', 0, 0.66, 2.76);
  tg.box(1.0, 0.5, 0.06, '#26262b', 0, 1.2, 2.76);
  for (const sx of [-1, 1]) tg.box(0.3, 0.06, 0.4, '#8a8d95', sx * 1.12, 0.84, 2.0);
  // the beacon and a bar of work lights on the cab roof
  tg.cyl(0.14, 0.16, 0.1, 8, '#26262b', 0.7, 2.68, 1.9);
  lamp.cyl(0.12, 0.12, 0.2, 8, '#ffb02e', 0.7, 2.82, 1.9);
  lamp.box(0.9, 0.1, 0.1, '#fff4cc', -0.2, 2.68, 2.4);
  // side mirrors on arms, an exhaust stack behind the cab
  for (const sx of [-1, 1]) {
    rod(tg, V(sx * 1.1, 2.0, 2.5), V(sx * 1.5, 2.15, 2.6), 0.03, '#26262b');
    tg.box(0.1, 0.5, 0.28, '#26262b', sx * 1.55, 2.15, 2.6);
  }
  tg.cyl(0.1, 0.1, 1.9, 8, '#4a4d55', 1.15, 2.0, 1.25);
  // splash guards behind the wheels
  for (const z of [-0.2, -2.8]) for (const sx of [-1, 1]) tg.box(0.06, 0.4, 0.5, '#15171c', sx * 1.0, 0.45, z);
  lamp.cyl(0.14, 0.14, 0.06, 10, '#fff4cc', 0.8, 0.9, 2.78, Math.PI / 2);
  lamp.cyl(0.14, 0.14, 0.06, 10, '#fff4cc', -0.8, 0.9, 2.78, Math.PI / 2);
  brake.box(0.3, 0.16, 0.05, '#ffffff', 0.9, 1.25, -3.5);
  brake.box(0.3, 0.16, 0.05, '#ffffff', -0.9, 1.25, -3.5);
  return {
    wheels,
    halfW: 1.1,
    nose: 2.8,
    tail: -3.6,
    sill: 0.62,
    belt: 1.5,
    roof: { y: 2.9, z0: 0.8, z1: -2.2, w: 2.0 },
    lip: { y: 2.9, z: -2.2, w: 2.0 },
    deck: { y: 1.7, z: -3.4, w: 2.0 },
    head: [0.45, 2.0, 2.0],
    lamps: [[0.8, 0.9, 2.8]],
    tails: { p: [0.9, 1.25, -3.52], w: 0.3, h: 0.16 },
    pipe: [1.15, 0.9, -3.45],
    plate: [0, 0.75, -3.5],
    bumper: { y: 0.66, z: -3.5, w: 2.2, h: 0.25 },
    screen: { z0: 2.52, y0: 1.62, z1: 2.44, y1: 2.45, hw: 0.97 },
    spots: {
      hood: { region: 'hood', p: [0, 2.55, 2.0], size: 0.7 },
      roof: { region: 'roof', p: [0, 2.85, -0.8], size: 0.9 },
      doors: { region: 'doorP', p: [1.1, 1.9, -1.0], size: 0.9 },
      back: { region: 'back', p: [0, 2.2, -3.4], size: 0.7 },
    },
    numberSpot: { region: 'doorP', p: [1.1, 1.5, 0.2], size: 0.8 },
    eye: [0, 2.3, 2.1],
    snorkel: { x: -1.1, y: 0.9, z: 2.0, top: 2.2, zTop: 1.5 },
  };
}

// ---------------------------------------------------------------------------
// Snöskoter: skis in front, a track behind, a windscreen and a hunched rider
// ---------------------------------------------------------------------------

export function snowmobile(P: Parts): BodySpec {
  const { pg, tg, glass, lamp, brake } = P;
  // the two halves of the track, as drive rollers (they spin)
  const wheels: WheelSpec[] = [
    { x: 0.3, z: -0.95, r: 0.3, w: 0.3 },
    { x: -0.3, z: -0.95, r: 0.3, w: 0.3 },
  ];
  // the hood: a long nose sloping down to the front
  pg.add(
    profileGeo([
      [1.5, 0.55, 0.3],
      [1.52, 0.78, 0.3],
      [1.0, 1.0, 0.44],
      [0.3, 1.1, 0.46],
      [-0.1, 1.08, 0.46],
      [-0.2, 0.5, 0.44],
      [1.2, 0.46, 0.36],
    ], 0.3),
    undefined,
    bodyClassify(0.3, -9),
  );
  // the rear cowl over the track, with a luggage rack
  pg.add(
    profileGeo([
      [-0.1, 0.7, 0.42],
      [-0.1, 1.06, 0.42],
      [-0.9, 1.1, 0.4],
      [-1.5, 0.96, 0.36],
      [-1.55, 0.7, 0.34],
    ], 0.3),
    undefined,
    boxCls,
  );
  pg.box(0.5, 0.05, 0.7, 0, 1.12, -0.7, roofClassify);
  // the track: a dark belt with cleats, and the rollers inside it
  tg.box(0.62, 0.22, 1.9, '#1b1b1d', 0, 0.3, -0.55);
  tg.box(0.66, 0.1, 1.0, '#1b1b1d', 0, 0.2, -1.0);
  for (let i = 0; i < 9; i++) tg.box(0.7, 0.04, 0.06, '#3a3c42', 0, 0.17, 0.3 - i * 0.22);
  tg.box(0.5, 0.16, 1.7, '#4a4d55', 0, 0.55, -0.55);
  // the skis: long, thin, with turned-up tips, on struts
  for (const sx of [-1, 1]) {
    tg.box(0.2, 0.06, 1.5, '#15171c', sx * 0.62, 0.12, 1.2);
    tg.box(0.2, 0.06, 0.36, '#15171c', sx * 0.62, 0.22, 2.04, -0.5);
    tg.box(0.1, 0.05, 1.3, CHROME, sx * 0.62, 0.17, 1.2);
    rod(tg, V(sx * 0.5, 0.78, 0.9), V(sx * 0.62, 0.15, 1.15), 0.04, '#26262b');
    rod(tg, V(sx * 0.4, 0.62, 0.5), V(sx * 0.62, 0.15, 0.85), 0.035, '#26262b');
  }
  // seat, handlebars, windscreen
  tg.box(0.34, 0.12, 1.1, '#1a1a1e', 0, 1.16, -0.52);
  tg.box(0.3, 0.06, 0.25, '#d6352b', 0, 1.24, -0.2);
  rod(tg, V(0, 1.1, 0.3), V(0, 1.42, 0.38), 0.045, '#26262b');
  rod(tg, V(-0.4, 1.46, 0.4), V(0.4, 1.46, 0.4), 0.03, '#26262b');
  for (const sx of [-1, 1]) tg.box(0.12, 0.06, 0.06, '#15171c', sx * 0.42, 1.46, 0.4);
  glass.box(0.5, 0.42, 0.03, GLASS_CAR, 0, 1.46, 0.62, -0.5);
  // a headlight and a taillight, a little red stripe along the side
  lamp.box(0.34, 0.12, 0.05, '#fff4cc', 0, 0.78, 1.52);
  tg.box(0.34, 0.1, 0.03, '#26262b', 0, 0.9, 1.5);
  brake.box(0.3, 0.08, 0.04, '#ffffff', 0, 0.92, -1.56);
  tg.box(0.5, 0.05, 0.4, '#26262b', 0, 0.62, -1.6);
  tg.cyl(0.05, 0.05, 0.3, 8, '#8a8d95', 0.2, 0.62, -1.55, Math.PI / 2);
  return {
    wheels,
    halfW: 0.7,
    nose: 2.3,
    tail: -1.6,
    sill: 0.2,
    belt: 1.1,
    roof: { y: 1.13, z0: -0.35, z1: -1.05, w: 0.5 },
    lip: { y: 1.12, z: -1.2, w: 0.4 },
    deck: { y: 1.0, z: -1.5, w: 0.4 },
    head: [0, 1.8, -0.4],
    lamps: [[0.001, 0.78, 1.54]],
    tails: { p: [0.001, 0.92, -1.58], w: 0.3, h: 0.08 },
    pipe: [0.2, 0.62, -1.7],
    plate: [0, 0.74, -1.62],
    bumper: { y: 0.78, z: -1.56, w: 0.5, h: 0.1 },
    screen: { z0: 0.65, y0: 1.3, z1: 0.55, y1: 1.65, hw: 0.24 },
    spots: {
      hood: { region: 'hood', p: [0, 1.0, 0.9], size: 0.3 },
      roof: { region: 'roof', p: [0, 1.12, -0.7], size: 0.34 },
      doors: { region: 'doorP', p: [0.46, 0.85, -0.4], size: 0.4 },
      back: { region: 'back', p: [0, 0.9, -1.55], size: 0.14 },
    },
    numberSpot: { region: 'doorP', p: [0.44, 0.8, 0.6], size: 0.34 },
    eye: [0, 1.95, 0.3],
    snorkel: { x: -0.4, y: 0.8, z: 0.5, top: 1.4, zTop: 0.3 },
    rider: {
      at: [0, 1.12, -0.5],
      helmet: true,
      pose: { hands: [0.42, 0.24, 0.9], knee: [0.3, 0.02, 0.5], foot: [0.34, -0.55, 0.3], tilt: 0.5, torso: 0.52 },
    },
  };
}

// ---------------------------------------------------------------------------
// Gokart: a tube frame, slick tyres, a number plate on the nose and a big helmet
// ---------------------------------------------------------------------------

export function kart(P: Parts): BodySpec {
  const { pg, tg, lamp, brake } = P;
  const wheels: WheelSpec[] = [
    { x: 0.62, z: 0.85, r: 0.21, w: 0.17 },
    { x: -0.62, z: 0.85, r: 0.21, w: 0.17 },
    { x: 0.66, z: -0.6, r: 0.25, w: 0.3 },
    { x: -0.66, z: -0.6, r: 0.25, w: 0.3 },
  ];
  // the floor pan, the nose with its round number plate, and the side pods
  pg.add(
    profileGeo([
      [1.3, 0.2, 0.34],
      [1.34, 0.36, 0.32],
      [0.9, 0.5, 0.4],
      [0.1, 0.46, 0.42],
      [-1.05, 0.42, 0.4],
      [-1.1, 0.2, 0.4],
    ], 0.3),
    undefined,
    boxCls,
  );
  pg.box(0.9, 0.04, 0.5, 0, 0.5, 1.0, hoodCls, -0.18);
  for (const sx of [-1, 1]) {
    pg.add(
      profileGeo([
        [0.55, 0.22, 0.2],
        [0.5, 0.52, 0.18],
        [-0.3, 0.52, 0.18],
        [-0.4, 0.22, 0.2],
      ], 0.3),
      mat(sx * 0.6, 0, 0),
      boxCls,
    );
  }
  // the engine behind the seat and the chain guard
  tg.box(0.34, 0.34, 0.36, '#4a4d55', 0.22, 0.56, -0.8);
  tg.box(0.18, 0.2, 0.3, '#d6352b', 0.22, 0.82, -0.8);
  tg.box(0.12, 0.3, 0.5, '#26262b', -0.18, 0.5, -0.8);
  // bucket seat
  tg.box(0.5, 0.1, 0.5, '#1a1a1e', 0, 0.42, -0.28);
  tg.box(0.5, 0.5, 0.1, '#1a1a1e', 0, 0.66, -0.55, -0.2);
  // front and rear bumper tubes
  rod(tg, V(-0.55, 0.3, 1.4), V(0.55, 0.3, 1.4), 0.04, CHROME);
  rod(tg, V(-0.55, 0.3, 1.4), V(-0.62, 0.3, 0.85), 0.04, CHROME);
  rod(tg, V(0.55, 0.3, 1.4), V(0.62, 0.3, 0.85), 0.04, CHROME);
  rod(tg, V(-0.7, 0.34, -1.2), V(0.7, 0.34, -1.2), 0.045, CHROME);
  rod(tg, V(-0.7, 0.34, -1.2), V(-0.68, 0.3, -0.6), 0.04, CHROME);
  rod(tg, V(0.7, 0.34, -1.2), V(0.68, 0.3, -0.6), 0.04, CHROME);
  // axles
  rod(tg, V(-0.62, 0.21, 0.85), V(0.62, 0.21, 0.85), 0.03, '#26262b');
  rod(tg, V(-0.66, 0.25, -0.6), V(0.66, 0.25, -0.6), 0.04, '#26262b');
  // the steering wheel on a short column
  rod(tg, V(0, 0.46, 0.76), V(0, 0.8, 0.5), 0.03, '#26262b');
  tg.add(new THREE.TorusGeometry(0.15, 0.025, 4, 10), '#26262b', mat(0, 0.84, 0.46, -0.9));
  // a headlight-less nose: a pair of reflectors, tail light bar
  lamp.box(0.12, 0.05, 0.03, '#ffb02e', 0.25, 0.4, 1.34);
  lamp.box(0.12, 0.05, 0.03, '#ffb02e', -0.25, 0.4, 1.34);
  brake.box(0.3, 0.06, 0.03, '#ffffff', 0.0, 0.5, -1.16);
  tg.cyl(0.04, 0.04, 0.3, 8, '#8a8d95', -0.22, 0.4, -1.1, Math.PI / 2);
  return {
    wheels,
    halfW: 0.5,
    nose: 1.42,
    tail: -1.25,
    sill: 0.2,
    belt: 0.5,
    roof: { y: 0.52, z0: 0.5, z1: -0.4, w: 0.4 },
    lip: { y: 0.9, z: -0.7, w: 0.4 },
    deck: { y: 0.82, z: -1.0, w: 0.5 },
    head: [0, 1.0, -0.3],
    lamps: [[0.25, 0.4, 1.36]],
    tails: { p: [0.001, 0.5, -1.18], w: 0.3, h: 0.06 },
    pipe: [-0.22, 0.4, -1.28],
    plate: [0, 0.42, -1.2],
    bumper: { y: 0.34, z: -1.2, w: 1.4, h: 0.08 },
    screen: { z0: 0.5, y0: 0.9, z1: 0.46, y1: 1.1, hw: 0.14 },
    spots: {
      hood: { region: 'hood', p: [0, 0.5, 1.0], size: 0.3 },
      roof: { region: 'roof', p: [0, 0.5, 0.5], size: 0.2 },
      doors: { region: 'doorP', p: [0.76, 0.36, 0.1], size: 0.28 },
      back: { region: 'back', p: [0, 0.3, -1.1], size: 0.12 },
    },
    numberSpot: { region: 'hood', p: [0, 0.5, 1.02], size: 0.34 },
    eye: [0, 0.95, 0.3],
    snorkel: { x: -0.5, y: 0.4, z: 0.85, top: 0.9, zTop: 0.5 },
    open: true,
    rider: {
      at: [0, 0.42, -0.3],
      helmet: true,
      pose: { hands: [0.17, 0.42, 0.58], knee: [0.15, 0.2, 0.55], foot: [0.13, -0.02, 1.02], tilt: 0.15, torso: 0.42, sh: 0.22 },
    },
  };
}

// ---------------------------------------------------------------------------
// Golfbil: a roof on four posts, a bench, a windscreen and a golf bag on the back
// ---------------------------------------------------------------------------

export function golf(P: Parts): BodySpec {
  const { pg, tg, glass, lamp, brake } = P;
  const wheels: WheelSpec[] = [
    { x: 0.66, z: 1.05, r: 0.27, w: 0.16 },
    { x: -0.66, z: 1.05, r: 0.27, w: 0.16 },
    { x: 0.66, z: -0.95, r: 0.27, w: 0.16 },
    { x: -0.66, z: -0.95, r: 0.27, w: 0.16 },
  ];
  // the body: a cowl at the front, the floor and a rear deck for the bag
  pg.add(
    profileGeo([
      [1.62, 0.32, 0.62],
      [1.66, 0.62, 0.6],
      [1.4, 0.82, 0.58],
      [0.95, 0.9, 0.62],
      [0.8, 0.5, 0.64],
      [-0.4, 0.5, 0.64],
      [-0.5, 0.62, 0.66],
      [-1.5, 0.62, 0.66],
      [-1.56, 0.34, 0.64],
      [1.5, 0.28, 0.6],
    ], 0.3),
    undefined,
    hoodCls,
  );
  for (const w of wheels) pg.box(0.2, 0.1, 0.76, Math.sign(w.x) * 0.66, 0.6, w.z, boxCls);
  // bench seat with a back
  tg.box(0.96, 0.12, 0.46, '#efe6cf', 0, 0.74, -0.15);
  tg.box(0.96, 0.5, 0.1, '#efe6cf', 0, 1.02, -0.46, -0.1);
  // the roof on four posts
  pg.box(1.4, 0.07, 1.9, 0, 2.0, -0.15, roofClassify);
  for (const sx of [-1, 1]) {
    rod(tg, V(sx * 0.64, 0.9, 0.78), V(sx * 0.64, 2.0, 0.78), 0.035, '#f1ede4');
    rod(tg, V(sx * 0.64, 0.62, -1.05), V(sx * 0.64, 2.0, -1.05), 0.035, '#f1ede4');
  }
  glass.box(1.22, 0.78, 0.03, GLASS_CAR, 0, 1.45, 0.82, -0.12);
  // the steering wheel on a slanted column
  rod(tg, V(0.2, 0.9, 0.9), V(0.2, 1.18, 0.55), 0.03, '#26262b');
  tg.add(new THREE.TorusGeometry(0.16, 0.025, 4, 10), '#26262b', mat(0.2, 1.2, 0.5, -0.9));
  // the golf bag on the back: a dark green tube, a strap, a fistful of clubs
  tg.cyl(0.2, 0.17, 0.95, 8, '#1f5a34', 0, 1.1, -1.2, -0.12);
  tg.box(0.42, 0.06, 0.1, '#d6352b', 0, 1.1, -1.12, -0.12);
  for (let i = 0; i < 4; i++) {
    const a = (i - 1.5) * 0.12;
    rod(tg, V(a, 1.5, -1.25), V(a * 1.6, 1.85, -1.28), 0.018, '#8a8d95');
    tg.ball(0.06, i % 2 ? '#c9ccd2' : '#26262b', a * 1.6, 1.88, -1.28);
  }
  // headlights, a tail light, a little cart sign
  for (const sx of [-1, 1]) {
    lamp.cyl(0.1, 0.1, 0.05, 8, '#fff4cc', sx * 0.4, 0.62, 1.68, Math.PI / 2);
    brake.box(0.2, 0.1, 0.04, '#ffffff', sx * 0.55, 0.66, -1.58);
  }
  tg.box(1.1, 0.12, 0.1, '#c9ccd2', 0, 0.42, 1.7);
  tg.box(1.1, 0.12, 0.1, '#c9ccd2', 0, 0.42, -1.6);
  tg.box(0.3, 0.2, 0.04, '#f4c20d', 0, 0.62, -1.6);
  tg.cyl(0.04, 0.04, 0.2, 6, '#4a4d55', -0.36, 0.34, -1.6, Math.PI / 2);
  return {
    wheels,
    halfW: 0.66,
    nose: 1.72,
    tail: -1.62,
    sill: 0.28,
    belt: 0.9,
    roof: { y: 2.05, z0: 0.8, z1: -1.05, w: 1.4 },
    lip: { y: 2.05, z: -1.05, w: 1.4 },
    deck: { y: 0.62, z: -1.5, w: 1.2 },
    head: [0.22, 1.5, 0.05],
    lamps: [[0.4, 0.62, 1.7]],
    tails: { p: [0.55, 0.66, -1.58], w: 0.2, h: 0.1 },
    pipe: [-0.36, 0.34, -1.64],
    plate: [0, 0.5, -1.6],
    bumper: { y: 0.42, z: -1.6, w: 1.1, h: 0.12 },
    screen: { z0: 0.9, y0: 1.06, z1: 0.76, y1: 1.84, hw: 0.6 },
    spots: {
      hood: { region: 'hood', p: [0, 0.82, 1.35], size: 0.4 },
      roof: { region: 'roof', p: [0, 2.0, -0.15], size: 0.5 },
      doors: { region: 'doorP', p: [0.66, 0.55, 0.1], size: 0.4 },
      back: { region: 'back', p: [0, 0.48, -1.56], size: 0.22 },
    },
    numberSpot: { region: 'doorP', p: [0.66, 0.55, 0.1], size: 0.4 },
    eye: [0.2, 1.5, 0.3],
    snorkel: { x: -0.7, y: 0.6, z: 1.05, top: 1.4, zTop: 0.6 },
    open: true,
    rider: {
      at: [0.22, 0.8, -0.1],
      helmet: true,
      pose: { hands: [0.2, 0.46, 0.72], knee: [0.18, 0.1, 0.5], foot: [0.18, -0.24, 0.8], tilt: 0.05, torso: 0.52, sh: 0.24 },
    },
  };
}

// ---------------------------------------------------------------------------
// Åkgräsklippare: a bonnet, a big seat, a steering wheel and a wide deck in front
// ---------------------------------------------------------------------------

export function mower(P: Parts): BodySpec {
  const { pg, tg, lamp, brake } = P;
  const wheels: WheelSpec[] = [
    { x: 0.52, z: 1.0, r: 0.22, w: 0.14 },
    { x: -0.52, z: 1.0, r: 0.22, w: 0.14 },
    { x: 0.66, z: -0.5, r: 0.4, w: 0.28 },
    { x: -0.66, z: -0.5, r: 0.4, w: 0.28 },
  ];
  // the engine hood, sloping down to the nose
  pg.add(
    profileGeo([
      [1.25, 0.46, 0.34],
      [1.28, 0.8, 0.32],
      [0.9, 1.0, 0.4],
      [0.3, 1.04, 0.42],
      [0.1, 0.86, 0.44],
      [0.1, 0.4, 0.44],
    ], 0.3),
    undefined,
    hoodCls,
  );
  // the body behind: a tub under the seat, and fenders over the big rear wheels
  pg.add(
    profileGeo([
      [0.15, 0.4, 0.5],
      [0.1, 0.8, 0.5],
      [-0.2, 0.86, 0.5],
      [-1.0, 0.8, 0.46],
      [-1.1, 0.5, 0.44],
      [-0.6, 0.38, 0.5],
    ], 0.3),
    undefined,
    boxCls,
  );
  for (const sx of [-1, 1]) pg.box(0.38, 0.06, 0.95, sx * 0.66, 0.84, -0.5, roofClassify);
  for (const sx of [-1, 1]) pg.box(0.06, 0.3, 0.9, sx * 0.84, 0.7, -0.5, boxCls);
  // the cutting deck, wide and low in front, with a chute on the right and a bumper
  pg.add(
    profileGeo([
      [2.05, 0.15, 0.82],
      [2.08, 0.4, 0.8],
      [1.4, 0.46, 0.84],
      [1.2, 0.3, 0.84],
      [1.3, 0.14, 0.8],
    ], 0.3),
    undefined,
    boxCls,
  );
  tg.box(1.7, 0.04, 0.5, '#26262b', 0, 0.13, 1.7);
  tg.box(0.3, 0.3, 0.3, '#4a4d55', 0.9, 0.38, 1.7, 0, 0, -0.5);
  tg.box(1.7, 0.1, 0.1, '#15171c', 0, 0.28, 2.12);
  // the seat on a post, with a back
  tg.box(0.46, 0.1, 0.46, '#1a1a1e', 0, 0.96, -0.4);
  tg.box(0.46, 0.46, 0.1, '#1a1a1e', 0, 1.2, -0.66, -0.12);
  // steering wheel on a tall column
  rod(tg, V(0, 0.98, 0.38), V(0, 1.4, 0.18), 0.035, '#26262b');
  tg.add(new THREE.TorusGeometry(0.22, 0.03, 4, 12), '#26262b', mat(0, 1.44, 0.14, -0.75));
  // a grass catcher bag on the back, an exhaust, a headlight pair, a tail light
  tg.box(0.7, 0.5, 0.55, '#3a3c42', 0, 0.8, -1.35);
  for (let i = 0; i < 4; i++) tg.box(0.66, 0.025, 0.5, '#2a2c33', 0, 0.62 + i * 0.1, -1.36);
  tg.cyl(0.05, 0.05, 0.4, 8, '#555555', -0.3, 0.66, -1.12, Math.PI / 2);
  for (const sx of [-1, 1]) {
    lamp.cyl(0.08, 0.08, 0.04, 8, '#fff4cc', sx * 0.22, 0.7, 1.3, Math.PI / 2);
    brake.box(0.18, 0.08, 0.03, '#ffffff', sx * 0.3, 0.95, -1.64);
  }
  tg.box(0.3, 0.04, 0.12, '#ffffff', 0, 0.58, -1.64);
  return {
    wheels,
    halfW: 0.84,
    nose: 2.15,
    tail: -1.7,
    sill: 0.15,
    belt: 0.9,
    roof: { y: 1.0, z0: 0.3, z1: -0.9, w: 0.7 },
    lip: { y: 1.0, z: -1.0, w: 0.6 },
    deck: { y: 0.86, z: -1.1, w: 0.6 },
    head: [0, 1.9, -0.3],
    lamps: [[0.22, 0.7, 1.32]],
    tails: { p: [0.3, 0.95, -1.62], w: 0.18, h: 0.08 },
    pipe: [-0.3, 0.66, -1.34],
    plate: [0, 0.5, -1.65],
    bumper: { y: 0.28, z: -1.68, w: 0.7, h: 0.12 },
    screen: { z0: 0.3, y0: 1.2, z1: 0.2, y1: 1.4, hw: 0.2 },
    spots: {
      hood: { region: 'hood', p: [0, 1.0, 0.7], size: 0.34 },
      roof: { region: 'roof', p: [0, 0.84, -0.5], size: 0.3 },
      doors: { region: 'doorP', p: [0.5, 0.65, -0.4], size: 0.4 },
      back: { region: 'back', p: [0, 0.6, -1.0], size: 0.2 },
    },
    numberSpot: { region: 'doorP', p: [0.5, 0.65, -0.4], size: 0.36 },
    eye: [0, 1.9, 0.3],
    snorkel: { x: -0.5, y: 0.7, z: 0.9, top: 1.2, zTop: 0.5 },
    open: true,
    rider: {
      at: [0, 1.02, -0.4],
      helmet: true,
      pose: { hands: [0.26, 0.5, 0.58], knee: [0.2, 0.12, 0.5], foot: [0.2, -0.38, 0.82], tilt: 0.1, torso: 0.54 },
    },
  };
}

// ---------------------------------------------------------------------------
// Husbil: a camper with a sloped nose, curtains, a roof vent, a ladder, a bike and a rolled-up awning
// ---------------------------------------------------------------------------

export function camper(P: Parts): BodySpec {
  const { pg, tg, glass, lamp, brake } = P;
  const wheels: WheelSpec[] = [
    { x: 1.05, z: 2.0, r: 0.46, w: 0.3 },
    { x: -1.05, z: 2.0, r: 0.46, w: 0.3 },
    { x: 1.05, z: -1.75, r: 0.46, w: 0.32 },
    { x: -1.05, z: -1.75, r: 0.46, w: 0.32 },
  ];
  pg.add(
    profileGeo([
      [2.9, 0.6, 1.08],
      [2.96, 1.3, 1.06],
      [2.6, 1.75, 1.04],
      [1.62, 1.78, 1.04],
      [1.58, 3.05, 1.08],
      [-2.9, 3.05, 1.1],
      [-3.0, 2.9, 1.08],
      [-3.0, 0.7, 1.08],
      [-2.7, 0.52, 1.06],
      [2.7, 0.52, 1.06],
    ]),
    undefined,
    boxCls,
  );
  pg.box(2.1, 0.07, 4.5, 0, 3.08, -0.7, roofClassify);
  for (const sx of [-1, 1]) pg.add(beamGeo2(V(sx * 1.02, 1.78, 2.6), V(sx * 0.98, 2.7, 1.8), 0.1));
  // a stripe along the side, in the second colour: a camper has to have one
  tg.box(0.04, 0.22, 4.9, '#f4f1ea', 1.095, 1.5, -0.4);
  tg.box(0.04, 0.12, 4.9, '#d6352b', 1.095, 1.2, -0.4);
  // windscreen and cab side window
  glass.prism([
    [2.58, 1.78, 0.99],
    [1.78, 2.72, 0.97],
    [1.64, 2.72, 0.97],
    [1.64, 1.78, 0.99],
  ], GLASS_CAR);
  // the living area windows with curtains, and the door
  for (const sx of [-1, 1]) {
    glass.box(0.04, 0.7, 1.1, GLASS_CAR, sx * 1.105, 2.3, 0.3);
    tg.box(0.045, 0.7, 0.35, '#e8a13c', sx * 1.108, 2.3, 0.0);
    glass.box(0.04, 0.7, 0.9, GLASS_CAR, sx * 1.105, 2.3, -1.4);
    tg.box(0.045, 0.7, 0.3, '#e8a13c', sx * 1.108, 2.3, -1.65);
  }
  tg.box(0.05, 1.6, 0.8, '#e8e2d0', 1.1, 1.7, -2.4);
  // the rolled-up awning along the right top edge
  tg.cyl(0.1, 0.1, 3.4, 8, '#f06ba8', 1.18, 2.98, -0.7, Math.PI / 2);
  // the roof: a vent, a satellite dish, a ladder at the back and a bike on a rack
  tg.box(0.6, 0.16, 0.6, '#f4f1ea', -0.4, 3.18, 0.4);
  tg.add(new THREE.CylinderGeometry(0.3, 0.05, 0.2, 10), '#c9ccd2', mat(0.5, 3.35, -1.4, 0.9));
  rod(tg, V(0.5, 3.1, -1.4), V(0.5, 3.3, -1.4), 0.03, '#26262b');
  rod(tg, V(-0.4, 3.0, -3.08), V(-0.4, 0.8, -3.08), 0.03, '#8a8d95');
  rod(tg, V(0.4, 3.0, -3.08), V(0.4, 0.8, -3.08), 0.03, '#8a8d95');
  for (let i = 0; i < 7; i++) rod(tg, V(-0.4, 0.95 + i * 0.3, -3.08), V(0.4, 0.95 + i * 0.3, -3.08), 0.02, '#8a8d95');
  // a bike on the back
  tg.add(new THREE.TorusGeometry(0.28, 0.03, 5, 10), '#15171c', mat(0.8, 1.2, -3.2, 0, Math.PI / 2, 0));
  tg.add(new THREE.TorusGeometry(0.28, 0.03, 5, 10), '#15171c', mat(0.8, 1.2, -3.85, 0, Math.PI / 2, 0));
  rod(tg, V(0.8, 1.2, -3.2), V(0.8, 1.55, -3.55), 0.03, '#d6352b');
  rod(tg, V(0.8, 1.55, -3.55), V(0.8, 1.2, -3.85), 0.03, '#d6352b');
  rod(tg, V(0.8, 1.55, -3.55), V(0.8, 1.7, -3.5), 0.03, '#26262b');
  tg.box(1.8, 0.1, 0.1, '#4a4d55', 0.1, 0.9, -3.15);
  tg.box(0.1, 0.1, 0.8, '#4a4d55', 0.8, 0.9, -3.5);
  // bumpers, a grille and the mirrors on arms
  tg.box(2.2, 0.25, 0.2, '#c9ccd2', 0, 0.66, 2.96);
  tg.box(2.2, 0.25, 0.2, DARK, 0, 0.66, -3.0);
  tg.box(0.9, 0.34, 0.06, '#26262b', 0, 1.0, 2.96);
  for (const sx of [-1, 1]) {
    rod(tg, V(sx * 1.1, 2.1, 2.4), V(sx * 1.45, 2.2, 2.5), 0.03, '#26262b');
    tg.box(0.1, 0.45, 0.26, '#26262b', sx * 1.5, 2.2, 2.5);
    lamp.cyl(0.14, 0.14, 0.06, 10, '#fff4cc', sx * 0.7, 0.98, 2.98, Math.PI / 2);
    brake.box(0.24, 0.5, 0.04, '#ffffff', sx * 0.95, 1.4, -3.02);
  }
  return {
    wheels,
    halfW: 1.1,
    nose: 3.0,
    tail: -3.05,
    sill: 0.52,
    belt: 1.8,
    roof: { y: 3.1, z0: 1.5, z1: -2.9, w: 2.1 },
    lip: { y: 3.1, z: -2.9, w: 2.1 },
    deck: { y: 1.5, z: -3.0, w: 2.1 },
    head: [0.45, 2.15, 2.0],
    lamps: [[0.7, 0.98, 3.0]],
    tails: { p: [0.95, 1.4, -3.03], w: 0.24, h: 0.5 },
    pipe: [-0.5, 0.58, -3.1],
    plate: [0, 0.66, -3.01],
    bumper: { y: 0.66, z: -3.02, w: 2.2, h: 0.25 },
    screen: { z0: 2.58, y0: 1.78, z1: 1.78, y1: 2.7, hw: 0.97 },
    spots: {
      hood: { region: 'hood', p: [0, 1.3, 2.9], size: 0.5 },
      roof: { region: 'roof', p: [0, 3.08, -1.2], size: 1.0 },
      doors: { region: 'doorP', p: [1.1, 1.95, 0.9], size: 0.9 },
      back: { region: 'back', p: [0, 2.0, -3.0], size: 0.8 },
    },
    numberSpot: { region: 'doorP', p: [1.1, 1.6, -0.6], size: 0.8 },
    eye: [0, 2.3, 2.2],
    snorkel: { x: -1.1, y: 0.9, z: 2.0, top: 2.4, zTop: 1.5 },
  };
}

// ---------------------------------------------------------------------------
// Limousin: very long, very low, with chrome, little flags and six wheels
// ---------------------------------------------------------------------------

export function limo(P: Parts): BodySpec {
  const { pg, tg, glass, lamp, brake } = P;
  const wheels: WheelSpec[] = [
    { x: 0.84, z: 2.4, r: 0.36, w: 0.26 },
    { x: -0.84, z: 2.4, r: 0.36, w: 0.26 },
    { x: 0.84, z: -0.4, r: 0.36, w: 0.26 },
    { x: -0.84, z: -0.4, r: 0.36, w: 0.26 },
    { x: 0.84, z: -2.5, r: 0.36, w: 0.26 },
    { x: -0.84, z: -2.5, r: 0.36, w: 0.26 },
  ];
  pg.add(
    profileGeo([
      [3.7, 0.32, 0.9],
      [3.76, 0.64, 0.88],
      [3.5, 0.84, 0.86],
      [2.2, 0.96, 0.88],
      [1.9, 1.0, 0.88],
      [-3.4, 1.0, 0.9],
      [-3.7, 0.94, 0.88],
      [-3.76, 0.36, 0.9],
      [-3.4, 0.26, 0.88],
      [3.4, 0.26, 0.88],
    ]),
    undefined,
    bodyClassify(1.9, -3.4),
  );
  // a long tinted greenhouse
  glass.prism([
    [1.95, 0.98, 0.84],
    [1.25, 1.42, 0.74],
    [-3.0, 1.42, 0.74],
    [-3.35, 0.98, 0.84],
  ], '#15202e');
  pg.box(1.5, 0.07, 4.2, 0, 1.46, -0.85, roofClassify);
  for (const sx of [-1, 1]) {
    pg.add(beamGeo2(V(sx * 0.82, 1.0, 1.95), V(sx * 0.74, 1.44, 1.3), 0.08));
    pg.add(beamGeo2(V(sx * 0.84, 1.0, -3.35), V(sx * 0.76, 1.44, -3.0), 0.1));
    pg.box(0.06, 0.4, 0.14, sx * 0.78, 1.2, -0.3);
    pg.box(0.06, 0.4, 0.14, sx * 0.78, 1.2, -1.7);
    // a chrome strip along the side and fender flags
    tg.box(0.03, 0.04, 6.8, CHROME, sx * 0.9, 0.78, 0.0);
    rod(tg, V(sx * 0.7, 0.98, 3.2), V(sx * 0.7, 1.3, 3.2), 0.015, CHROME);
    tg.box(0.02, 0.1, 0.16, sx > 0 ? '#2f6fe0' : '#f4c20d', sx * 0.7, 1.26, 3.12);
  }
  // front: chrome grille, hood ornament, big bumpers
  tg.box(1.0, 0.36, 0.06, CHROME, 0, 0.7, 3.76);
  for (let i = 0; i < 5; i++) tg.box(0.02, 0.34, 0.07, '#26262b', -0.4 + i * 0.2, 0.7, 3.77);
  tg.box(2.0, 0.14, 0.16, CHROME, 0, 0.42, 3.76);
  tg.box(2.0, 0.14, 0.16, CHROME, 0, 0.42, -3.8);
  tg.cone(0.08, 0.3, 4, CHROME, 0, 1.12, 3.1, 0);
  // an antenna on the back, a sunroof, a red light bar on the dash
  rod(tg, V(0.6, 1.0, -3.4), V(0.7, 1.9, -3.7), 0.012, '#26262b');
  glass.box(0.7, 0.02, 1.2, '#0d1218', 0, 1.5, -1.0);
  for (const sx of [-1, 1]) {
    lamp.cyl(0.12, 0.12, 0.06, 10, '#fff2a8', sx * 0.64, 0.7, 3.76, Math.PI / 2);
    brake.box(0.4, 0.14, 0.04, '#ffffff', sx * 0.62, 0.78, -3.77);
  }
  return {
    wheels,
    halfW: 0.9,
    nose: 3.8,
    tail: -3.82,
    sill: 0.26,
    belt: 1.0,
    roof: { y: 1.5, z0: 1.2, z1: -3.0, w: 1.5 },
    lip: { y: 1.5, z: -3.0, w: 1.5 },
    deck: { y: 1.0, z: -3.5, w: 1.6 },
    head: [0.36, 1.1, 1.0],
    lamps: [[0.64, 0.7, 3.78]],
    tails: { p: [0.62, 0.78, -3.77], w: 0.4, h: 0.14 },
    pipe: [-0.5, 0.3, -3.84],
    plate: [0, 0.56, -3.77],
    bumper: { y: 0.42, z: -3.8, w: 2.0, h: 0.14 },
    screen: { z0: 1.95, y0: 0.98, z1: 1.25, y1: 1.42, hw: 0.74 },
    spots: {
      hood: { region: 'hood', p: [0, 0.96, 2.8], size: 0.6 },
      roof: { region: 'roof', p: [0, 1.46, -0.85], size: 0.7 },
      doors: { region: 'doorP', p: [0.9, 0.6, -0.4], size: 0.6 },
      back: { region: 'back', p: [0, 0.8, -3.76], size: 0.3 },
    },
    numberSpot: { region: 'doorP', p: [0.9, 0.62, -1.6], size: 0.5 },
    eye: [0, 1.4, 1.5],
    snorkel: { x: -0.94, y: 0.75, z: 2.4, top: 1.4, zTop: 1.4 },
  };
}

// ---------------------------------------------------------------------------
// Raketvagnen: a shopping cart with a rocket underneath and a helmeted rider in the basket
// ---------------------------------------------------------------------------

export function cart(P: Parts): BodySpec {
  const { pg, tg, lamp, brake } = P;
  const wheels: WheelSpec[] = [
    { x: 0.5, z: 0.72, r: 0.17, w: 0.1 },
    { x: -0.5, z: 0.72, r: 0.17, w: 0.1 },
    { x: 0.5, z: -0.74, r: 0.17, w: 0.1 },
    { x: -0.5, z: -0.74, r: 0.17, w: 0.1 },
  ];
  const W = '#c9ccd2';
  // the basket: a wire frame, wider at the top
  const rim = (y: number, hw: number, z0: number, z1: number): void => {
    rod(tg, V(-hw, y, z1), V(hw, y, z1), 0.022, W);
    rod(tg, V(-hw, y, z0), V(hw, y, z0), 0.022, W);
    rod(tg, V(-hw, y, z0), V(-hw, y, z1), 0.022, W);
    rod(tg, V(hw, y, z0), V(hw, y, z1), 0.022, W);
  };
  const rows: [number, number, number, number][] = [
    [0.52, 0.4, -0.65, 0.65],
    [0.7, 0.45, -0.7, 0.72],
    [0.88, 0.5, -0.75, 0.8],
    [1.06, 0.55, -0.8, 0.88],
  ];
  for (const [y, hw, z0, z1] of rows) rim(y, hw, z0, z1);
  for (let i = 0; i <= 4; i++) {
    const k = i / 4;
    const z = -0.7 + k * 1.4;
    for (const sx of [-1, 1]) rod(tg, V(sx * 0.4, 0.52, z * 0.9), V(sx * 0.55, 1.06, z), 0.016, W);
  }
  for (let i = 0; i <= 3; i++) {
    const x = -0.36 + i * 0.24;
    rod(tg, V(x, 0.52, -0.65), V(x * 1.35, 1.06, -0.8), 0.016, W);
    rod(tg, V(x, 0.52, 0.65), V(x * 1.35, 1.06, 0.88), 0.016, W);
  }
  for (let i = 0; i < 4; i++) rod(tg, V(-0.4, 0.52, -0.5 + i * 0.35), V(0.4, 0.52, -0.5 + i * 0.35), 0.016, W);
  // the tray below, the legs to the casters, the handle at the back
  rim(0.26, 0.45, -0.7, 0.7);
  for (const w of wheels) {
    const sx = Math.sign(w.x);
    rod(tg, V(sx * 0.45, 0.26, w.z), V(sx * 0.5, 0.17, w.z), 0.03, W);
    rod(tg, V(sx * 0.4, 0.52, w.z * 0.9), V(sx * 0.45, 0.26, w.z), 0.025, W);
  }
  rod(tg, V(-0.5, 1.06, -0.8), V(-0.5, 1.28, -1.05), 0.03, W);
  rod(tg, V(0.5, 1.06, -0.8), V(0.5, 1.28, -1.05), 0.03, W);
  rod(tg, V(-0.5, 1.28, -1.05), V(0.5, 1.28, -1.05), 0.035, '#d6352b');
  // the child seat flap, a price tag, a red coin slot on the handle
  tg.box(0.6, 0.03, 0.3, '#d6352b', 0, 1.08, 0.7, -0.4);
  tg.box(0.12, 0.2, 0.01, '#fff3c4', 0.45, 1.0, 0.88);
  // the rocket under the basket: a painted body, a red nose, fins and a nozzle
  pg.add(new THREE.CylinderGeometry(0.2, 0.22, 2.1, 10), mat(0, 0.36, -0.55, Math.PI / 2, 0, 0), boxCls);
  pg.add(new THREE.CylinderGeometry(0.04, 0.2, 0.55, 10), mat(0, 0.36, 0.78, Math.PI / 2, 0, 0), hoodCls);
  tg.cyl(0.14, 0.2, 0.2, 10, '#26262b', 0, 0.36, -1.7, Math.PI / 2);
  tg.cyl(0.22, 0.22, 0.06, 10, '#d6352b', 0, 0.36, 0.1, Math.PI / 2);
  tg.cyl(0.22, 0.22, 0.06, 10, '#f4f1ea', 0, 0.36, -0.9, Math.PI / 2);
  for (const sx of [-1, 1]) tg.box(0.04, 0.3, 0.5, '#d6352b', sx * 0.26, 0.36, -1.35, 0, 0, sx * 0.25);
  tg.box(0.6, 0.04, 0.5, '#d6352b', 0, 0.36, -1.35);
  tg.box(0.06, 0.34, 0.5, '#d6352b', 0, 0.58, -1.35);
  // straps holding it on
  tg.box(0.52, 0.04, 0.06, '#f4c20d', 0, 0.36, -0.2).box(0.04, 0.5, 0.06, '#f4c20d', 0.2, 0.36, -0.2);
  lamp.box(0.2, 0.08, 0.03, '#ffb02e', 0, 0.62, 0.9);
  brake.box(0.3, 0.06, 0.03, '#ffffff', 0, 0.66, -0.82);
  return {
    wheels,
    halfW: 0.55,
    nose: 1.1,
    tail: -1.8,
    sill: 0.2,
    belt: 1.0,
    roof: { y: 1.3, z0: 0.2, z1: -0.9, w: 0.5 },
    lip: { y: 1.1, z: -1.0, w: 0.4 },
    deck: { y: 0.7, z: -1.6, w: 0.4 },
    head: [0, 1.8, 0.0],
    lamps: [[0.001, 0.62, 0.92]],
    tails: { p: [0.001, 0.66, -0.84], w: 0.3, h: 0.06 },
    pipe: [0, 0.36, -1.82],
    plate: [0, 0.48, -1.0],
    bumper: { y: 0.3, z: -0.8, w: 0.9, h: 0.08 },
    screen: { z0: 0.6, y0: 1.1, z1: 0.55, y1: 1.4, hw: 0.2 },
    spots: {
      hood: { region: 'hood', p: [0, 0.36, 0.85], size: 0.14 },
      roof: { region: 'roof', p: [0, 0.58, -0.55], size: 0.2 },
      doors: { region: 'doorP', p: [0.22, 0.36, -0.55], size: 0.28 },
      back: { region: 'back', p: [0, 0.3, -1.65], size: 0.12 },
    },
    numberSpot: { region: 'doorP', p: [0.22, 0.36, -0.55], size: 0.3 },
    eye: [0, 1.55, 0.3],
    snorkel: { x: -0.5, y: 0.5, z: 0.7, top: 1.0, zTop: 0.4 },
    open: true,
    rider: {
      at: [0, 0.62, 0.02],
      helmet: true,
      pose: { hands: [0.38, 0.5, 0.62], knee: [0.24, 0.42, 0.52], foot: [0.22, 0.1, 0.62], tilt: 0.3, torso: 0.5, sh: 0.24 },
    },
  };
}

export const NEW_BODIES = { epa, icecream, garbage, snowmobile, kart, golf, mower, camper, limo, cart };
