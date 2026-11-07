// The five vehicles beyond the cars: the fyrhjuling (ATV), the motorcykel, the moppe (with a basket and a
// bell), the traktor and the soffbil (a sofa on wheels). Same recipe as the cars in models.ts: a painted body
// in the paint atlas, trim, glass and lamps in vertex colours, wheels the game spins. The driver does not sit
// inside but on top, as a separate rider group the game can lean into bends and fling off after a big crash.
import * as THREE from 'three';
import type { CarDriver, CarStyle } from '../shared/rally.ts';
import { Geo, mat } from './geo.ts';
import {
  CHROME,
  DARK,
  GLASS_CAR,
  beam,
  bodyClassify,
  driverHead,
  profileGeo,
  rod,
  roofClassify,
  type BodySpec,
  type Classify,
  type Parts,
  type RiderPose,
  type V3,
  type WheelSpec,
} from './models.ts';

const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const SKIN = '#e8c39e';
const JEANS = '#3b4a6b';
const BOOT = '#2a2a2e';

/** A side-facing panel sorter for small painted parts: sides to the doors, the top to the bonnet, ends to front and back. */
const panel = (topZ: number): Classify => bodyClassify(topZ, -9);

/** The rider: torso, head, arms to the grips and legs to the pegs, in the hip's frame (the hip is the origin). */
export function riderGeo(who: CarDriver, style: CarStyle, pose: RiderPose, helmet: boolean): THREE.BufferGeometry {
  const g = new Geo();
  const shirt = who === 'human' ? style.paint2 : '#4a6fa5';
  const sh = pose.sh ?? 0.25;
  const tl = pose.torso ?? 0.5;
  const X = V(1, 0, 0);
  const rot = (x: number, y: number, z: number): THREE.Vector3 => V(x, y, z).applyAxisAngle(X, pose.tilt);
  // torso and neck
  const tc = rot(0, tl / 2, 0);
  g.box(0.46, tl, 0.28, shirt, tc.x, tc.y, tc.z, pose.tilt);
  const neck = rot(0, tl + 0.04, 0.02);
  g.box(0.1, 0.1, 0.1, SKIN, neck.x, neck.y, neck.z);
  // the head
  const hc = rot(0, tl + 0.24, 0.05);
  if (helmet && who === 'human') {
    g.sphere(0.24, style.paint, hc.x, hc.y + 0.01, hc.z, 1, 0.95, 1.08, 10, 8);
    g.box(0.32, 0.1, 0.1, '#1d2433', hc.x, hc.y, hc.z + 0.18, pose.tilt * 0.5);
    g.box(0.07, 0.03, 0.34, style.paint2, hc.x, hc.y + 0.235, hc.z, pose.tilt * 0.5);
  } else {
    g.addColored(driverHead(who, style.paint), mat(hc.x, hc.y, hc.z, pose.tilt * 0.5));
  }
  // arms to the grips
  const [hx, hy, hz] = pose.hands;
  for (const sx of [-1, 1]) {
    const s = rot(sx * sh, tl * 0.9, 0);
    const hand = V(sx * hx, hy, hz);
    const mid = s.clone().add(hand).multiplyScalar(0.5);
    const elbow = V(mid.x + sx * 0.1, mid.y - 0.12, mid.z - 0.06);
    beam(g, s, elbow, 0.12, shirt);
    beam(g, elbow, hand, 0.1, shirt);
    g.ball(0.075, '#26262b', hand.x, hand.y, hand.z);
  }
  // legs
  const [kx, ky, kz] = pose.knee;
  const [fx, fy, fz] = pose.foot;
  for (const sx of [-1, 1]) {
    const hip = V(sx * 0.14, 0.02, 0);
    const knee = V(sx * kx, ky, kz);
    const foot = V(sx * fx, fy, fz);
    beam(g, hip, knee, 0.16, JEANS);
    beam(g, knee, foot, 0.13, JEANS);
    g.box(0.15, 0.12, 0.3, BOOT, foot.x, foot.y - 0.03, foot.z + 0.07);
  }
  return g.build();
}

// ---------------------------------------------------------------------------
// Motorcykel
// ---------------------------------------------------------------------------

export function moto(P: Parts): BodySpec {
  const { pg, tg, glass, lamp, brake, style } = P;
  const wheels: WheelSpec[] = [
    { x: 0, z: 0.8, r: 0.38, w: 0.17 },
    { x: 0, z: -0.74, r: 0.38, w: 0.22 },
  ];
  // the tank and the tail cowl in the paint
  pg.add(
    profileGeo([
      [0.62, 0.92, 0.12],
      [0.56, 1.12, 0.16],
      [0.2, 1.22, 0.2],
      [-0.2, 1.18, 0.2],
      [-0.42, 1.06, 0.16],
      [-0.4, 0.88, 0.14],
      [0.1, 0.8, 0.14],
    ], 0.3),
    undefined,
    panel(-0.45),
  );
  pg.add(
    profileGeo([
      [-0.3, 1.0, 0.15],
      [-0.5, 1.08, 0.15],
      [-0.92, 1.12, 0.12],
      [-1.0, 1.0, 0.1],
      [-0.9, 0.9, 0.12],
      [-0.3, 0.86, 0.15],
    ], 0.3),
    undefined,
    bodyClassify(9, 9),
  );
  pg.box(0.3, 0.05, 0.5, 0, 1.1, -0.62, roofClassify);
  // front fender
  pg.box(0.2, 0.05, 0.62, 0, 0.74, 0.86, panel(9), -0.12);
  pg.box(0.14, 0.18, 0.05, 0, 0.64, 1.16, panel(9));
  // seat
  tg.box(0.3, 0.1, 0.55, '#26262b', 0, 1.0, -0.36);
  // engine and frame
  tg.box(0.3, 0.34, 0.5, '#4a4d55', 0, 0.54, 0.05);
  tg.box(0.26, 0.2, 0.3, '#5a5d66', 0, 0.78, 0.12);
  for (const sx of [-1, 1]) {
    tg.cyl(0.07, 0.07, 0.04, 8, CHROME, sx * 0.18, 0.55, 0.05, 0, 0, Math.PI / 2);
    rod(tg, V(sx * 0.1, 0.45, 0.06), V(sx * 0.1, 0.4, -0.74), 0.03, '#26262b');
    // the fork and its hubs
    rod(tg, V(sx * 0.09, 1.3, 0.66), V(sx * 0.09, 0.4, 0.8), 0.04, CHROME);
    // the handlebar ends with grips
    tg.box(0.12, 0.05, 0.05, '#26262b', sx * 0.36, 1.32, 0.6);
  }
  rod(tg, V(-0.37, 1.32, 0.6), V(0.37, 1.32, 0.6), 0.025, '#26262b');
  // headlight bucket and a tiny windscreen
  tg.cyl(0.14, 0.14, 0.2, 10, '#c9ccd2', 0, 1.15, 0.86, Math.PI / 2);
  lamp.cyl(0.115, 0.115, 0.04, 10, '#fff4cc', 0, 1.15, 0.97, Math.PI / 2);
  glass.box(0.3, 0.26, 0.03, GLASS_CAR, 0, 1.38, 0.74, -0.45);
  // the exhaust along the right side with a chrome tip
  tg.box(0.09, 0.09, 0.9, CHROME, 0.2, 0.4, -0.5, 0.04);
  tg.cyl(0.07, 0.06, 0.2, 8, '#8a8d95', 0.2, 0.42, -1.0, Math.PI / 2);
  // tail light and a small plate holder
  brake.box(0.18, 0.07, 0.04, '#ffffff', 0, 0.98, -1.02);
  tg.box(0.26, 0.04, 0.18, DARK, 0, 0.85, -1.0);
  // the sidecar (a trinket): a tub on an arm with its own wheel
  if (P.sidecar) {
    const sx = 1.12;
    pg.add(
      profileGeo([
        [0.95, 0.5, 0.36],
        [0.9, 0.78, 0.38],
        [0.2, 0.9, 0.4],
        [-0.55, 0.88, 0.4],
        [-0.72, 0.62, 0.34],
        [-0.6, 0.44, 0.32],
        [0.6, 0.38, 0.3],
      ], 0.3),
      mat(sx, 0, 0),
      panel(9),
    );
    tg.box(0.5, 0.06, 0.8, '#3a2a22', sx, 0.93, -0.1);
    tg.cyl(0.3, 0.3, 0.16, 10, '#1b1b1d', sx, 0.34, -0.15, 0, 0, Math.PI / 2);
    tg.cyl(0.14, 0.14, 0.18, 8, CHROME, sx, 0.34, -0.15, 0, 0, Math.PI / 2);
    rod(tg, V(0.12, 0.55, 0.3), V(sx - 0.2, 0.6, 0.4), 0.04, '#26262b');
    rod(tg, V(0.12, 0.5, -0.5), V(sx - 0.2, 0.55, -0.45), 0.04, '#26262b');
    // a small dog riding along
    tg.addColored(driverHead('dog', style.paint), mat(sx, 1.18, 0.0));
    tg.box(0.3, 0.2, 0.26, '#c8925a', sx, 1.0, -0.05);
  }
  void style;
  return {
    wheels,
    halfW: P.sidecar ? 0.5 : 0.2,
    nose: 1.2,
    tail: -1.1,
    sill: 0.4,
    belt: 1.0,
    roof: { y: 1.12, z0: -0.35, z1: -0.9, w: 0.3 },
    lip: { y: 1.12, z: -0.9, w: 0.3 },
    deck: { y: 1.0, z: -0.95, w: 0.3 },
    head: [0, 1.7, -0.3],
    lamps: [[0.001, 1.15, 0.99]],
    tails: { p: [0.001, 0.98, -1.03], w: 0.18, h: 0.07 },
    pipe: [0.2, 0.42, -1.1],
    plate: [0, 0.84, -1.1],
    bumper: { y: 0.8, z: -1.04, w: 0.2, h: 0.06 },
    screen: { z0: 0.78, y0: 1.26, z1: 0.7, y1: 1.5, hw: 0.14 },
    spots: {
      hood: { region: 'hood', p: [0, 1.2, 0.2], size: 0.22 },
      roof: { region: 'roof', p: [0, 1.1, -0.62], size: 0.2 },
      doors: { region: 'doorP', p: [0.17, 1.05, 0.1], size: 0.22 },
      back: { region: 'back', p: [0, 0.98, -0.99], size: 0.1 },
    },
    numberSpot: { region: 'doorP', p: [0.17, 1.0, 0.1], size: 0.22 },
    eye: [0, 1.85, 0.4],
    snorkel: { x: -0.2, y: 0.5, z: 0.4, top: 1.3, zTop: 0.3 },
    rider: {
      at: [0, 1.06, -0.34],
      helmet: true,
      pose: { hands: [0.36, 0.3, 0.9], knee: [0.26, 0.04, 0.52], foot: [0.3, -0.5, 0.3], tilt: 0.75, torso: 0.52 },
    },
  };
}

// ---------------------------------------------------------------------------
// Moppe: a scooter with a leg shield, a basket on the front and a golden bell
// ---------------------------------------------------------------------------

export function moped(P: Parts): BodySpec {
  const { pg, tg, glass, lamp, brake } = P;
  const wheels: WheelSpec[] = [
    { x: 0, z: 0.86, r: 0.31, w: 0.15 },
    { x: 0, z: -0.62, r: 0.31, w: 0.19 },
  ];
  // leg shield, floorboard and the rear cowl in the paint
  pg.add(
    profileGeo([
      [0.62, 0.38, 0.17],
      [0.66, 0.78, 0.17],
      [0.56, 1.12, 0.15],
      [0.46, 1.1, 0.14],
      [0.42, 0.74, 0.15],
      [0.36, 0.38, 0.16],
    ], 0.3),
    undefined,
    panel(9),
  );
  pg.add(
    profileGeo([
      [0.45, 0.28, 0.2],
      [0.45, 0.4, 0.2],
      [-0.12, 0.4, 0.2],
      [-0.12, 0.28, 0.2],
    ], 0.4),
    undefined,
    bodyClassify(-9, 9),
  );
  pg.add(
    profileGeo([
      [-0.1, 0.32, 0.2],
      [-0.1, 0.78, 0.2],
      [-0.5, 0.92, 0.19],
      [-1.0, 0.82, 0.16],
      [-1.06, 0.56, 0.15],
      [-0.7, 0.3, 0.17],
    ], 0.3),
    undefined,
    bodyClassify(9, -9),
  );
  pg.box(0.3, 0.05, 0.5, 0, 0.94, -0.4, roofClassify);
  // seat
  tg.box(0.34, 0.1, 0.62, '#5a3a24', 0, 0.97, -0.42);
  // front fender
  pg.box(0.2, 0.05, 0.5, 0, 0.62, 0.9, panel(9), -0.1);
  for (const sx of [-1, 1]) {
    // fork and handlebar
    rod(tg, V(sx * 0.1, 1.22, 0.64), V(sx * 0.1, 0.34, 0.86), 0.035, CHROME);
    tg.box(0.12, 0.05, 0.05, '#26262b', sx * 0.34, 1.24, 0.6);
    // mirrors on stalks
    rod(tg, V(sx * 0.32, 1.26, 0.6), V(sx * 0.36, 1.46, 0.56), 0.012, '#26262b');
    tg.cyl(0.07, 0.07, 0.02, 8, CHROME, sx * 0.36, 1.48, 0.55, Math.PI / 2 - 0.3);
    // footboard edges
    tg.box(0.04, 0.05, 0.6, '#26262b', sx * 0.2, 0.28, 0.17);
  }
  rod(tg, V(-0.35, 1.24, 0.6), V(0.35, 1.24, 0.6), 0.025, '#26262b');
  // headlight on the handlebar
  tg.cyl(0.12, 0.12, 0.16, 10, CHROME, 0, 1.3, 0.7, Math.PI / 2);
  lamp.cyl(0.095, 0.095, 0.04, 10, '#fff4cc', 0, 1.3, 0.79, Math.PI / 2);
  // the golden bell on the left grip: ring-ring
  tg.cyl(0.07, 0.09, 0.07, 8, '#ffd23f', 0.28, 1.32, 0.5);
  tg.cyl(0.015, 0.015, 0.05, 4, '#c9a022', 0.28, 1.38, 0.5);
  // the basket on the front: wicker with a baguette, a cabbage and a daisy
  const bz = 1.0;
  const by = 0.98;
  tg.box(0.44, 0.05, 0.34, '#a8793e', 0, by - 0.1, bz);
  for (const sz of [-1, 1]) tg.box(0.44, 0.24, 0.04, '#c08d4e', 0, by, bz + sz * 0.17);
  for (const sx of [-1, 1]) tg.box(0.04, 0.24, 0.34, '#c08d4e', sx * 0.22, by, bz);
  tg.box(0.46, 0.04, 0.36, '#8a5f2c', 0, by + 0.12, bz);
  rod(tg, V(0, 0.9, 0.7), V(0, 0.9, bz - 0.12), 0.03, '#26262b');
  tg.ball(0.14, '#7bbf3a', -0.07, by + 0.12, bz + 0.03, 1, 0.9, 1);
  tg.ball(0.08, '#9ad24a', -0.07, by + 0.2, bz + 0.03);
  beam(tg, V(0.09, by + 0.02, bz - 0.04), V(0.2, by + 0.52, bz + 0.1), 0.07, '#e6b25a');
  rod(tg, V(0.0, by + 0.1, bz + 0.1), V(0.04, by + 0.42, bz + 0.12), 0.012, '#4f8a3a');
  tg.ball(0.07, '#ffffff', 0.04, by + 0.45, bz + 0.12);
  tg.ball(0.035, '#ffd23f', 0.04, by + 0.45, bz + 0.19);
  // exhaust and tail light
  tg.cyl(0.05, 0.045, 0.34, 8, '#8a8d95', 0.2, 0.42, -0.98, Math.PI / 2 + 0.05);
  brake.box(0.2, 0.08, 0.04, '#ffffff', 0, 0.76, -1.07);
  tg.box(0.24, 0.04, 0.2, DARK, 0, 0.64, -1.06);
  // a little windscreen on the shield
  glass.box(0.34, 0.28, 0.03, GLASS_CAR, 0, 1.4, 0.55, -0.35);
  return {
    wheels,
    halfW: 0.24,
    nose: 1.3,
    tail: -1.1,
    sill: 0.28,
    belt: 0.9,
    roof: { y: 0.94, z0: -0.15, z1: -0.65, w: 0.3 },
    lip: { y: 0.94, z: -0.65, w: 0.3 },
    deck: { y: 0.82, z: -0.95, w: 0.3 },
    head: [0, 1.7, -0.3],
    lamps: [[0.001, 1.3, 0.8]],
    tails: { p: [0.001, 0.76, -1.08], w: 0.2, h: 0.08 },
    pipe: [0.2, 0.42, -1.14],
    plate: [0, 0.64, -1.17],
    bumper: { y: 0.6, z: -1.08, w: 0.24, h: 0.06 },
    screen: { z0: 0.58, y0: 1.28, z1: 0.52, y1: 1.52, hw: 0.14 },
    spots: {
      hood: { region: 'hood', p: [0, 1.0, 0.0], size: 0.0 },
      roof: { region: 'roof', p: [0, 0.94, -0.4], size: 0.2 },
      doors: { region: 'doorP', p: [0.18, 0.62, -0.5], size: 0.26 },
      back: { region: 'back', p: [0, 0.6, -1.0], size: 0.1 },
    },
    numberSpot: { region: 'doorP', p: [0.2, 0.6, -0.55], size: 0.26 },
    eye: [0, 1.85, 0.25],
    snorkel: { x: -0.2, y: 0.5, z: 0.4, top: 1.3, zTop: 0.3 },
    rider: {
      at: [0, 1.0, -0.4],
      helmet: true,
      pose: { hands: [0.34, 0.24, 0.96], knee: [0.22, 0.02, 0.5], foot: [0.2, -0.64, 0.5], tilt: 0.12, torso: 0.52 },
    },
  };
}

// ---------------------------------------------------------------------------
// Fyrhjuling
// ---------------------------------------------------------------------------

export function atv(P: Parts): BodySpec {
  const { pg, tg, glass, lamp, brake } = P;
  const R = 0.42;
  const wheels: WheelSpec[] = [
    { x: 0.66, z: 0.86, r: R, w: 0.36 },
    { x: -0.66, z: 0.86, r: R, w: 0.36 },
    { x: 0.68, z: -0.82, r: R + 0.02, w: 0.4 },
    { x: -0.68, z: -0.82, r: R + 0.02, w: 0.4 },
  ];
  // the central body: nose, tank cover, seat base and tail in the paint
  pg.add(
    profileGeo([
      [0.95, 0.5, 0.26],
      [0.98, 0.74, 0.26],
      [0.55, 0.92, 0.3],
      [0.1, 1.02, 0.26],
      [-0.2, 1.0, 0.22],
      [-0.75, 0.98, 0.26],
      [-1.02, 0.86, 0.26],
      [-1.0, 0.6, 0.26],
      [-0.5, 0.5, 0.26],
    ], 0.3),
    undefined,
    bodyClassify(0.0, -0.4),
  );
  // mudguards over every wheel
  for (const w of wheels) {
    const sx = Math.sign(w.x);
    pg.box(0.4, 0.045, 0.62, w.x, w.r * 2 + 0.02, w.z, panel(9));
    pg.box(0.045, 0.16, 0.6, w.x + sx * 0.19, w.r * 2 - 0.06, w.z, panel(9));
  }
  pg.box(0.4, 0.05, 0.5, 0, 1.03, -0.62, roofClassify);
  // seat
  tg.box(0.4, 0.12, 0.8, '#26262b', 0, 1.05, -0.52);
  tg.box(0.34, 0.1, 0.3, '#2e2f36', 0, 1.0, 0.0);
  // racks front and back
  tg.box(0.7, 0.04, 0.4, '#3a3c42', 0, 0.86, 1.02);
  tg.box(0.7, 0.04, 0.44, '#3a3c42', 0, 0.96, -1.1);
  for (const sx of [-1, 1]) {
    rod(tg, V(sx * 0.33, 0.7, 0.9), V(sx * 0.33, 0.86, 1.2), 0.025, '#3a3c42');
    rod(tg, V(sx * 0.33, 0.86, -0.9), V(sx * 0.33, 0.96, -1.3), 0.025, '#3a3c42');
    // swing arms and shocks
    rod(tg, V(sx * 0.2, 0.46, 0.8), V(sx * 0.62, 0.44, 0.86), 0.04, '#26262b');
    rod(tg, V(sx * 0.2, 0.46, -0.7), V(sx * 0.64, 0.44, -0.82), 0.04, '#26262b');
    rod(tg, V(sx * 0.4, 0.86, 0.6), V(sx * 0.62, 0.5, 0.86), 0.03, '#d6352b');
    rod(tg, V(sx * 0.36, 0.9, -0.7), V(sx * 0.62, 0.5, -0.82), 0.03, '#d6352b');
    // handlebar grips
    tg.box(0.12, 0.05, 0.05, '#26262b', sx * 0.4, 1.3, 0.46);
    lamp.cyl(0.08, 0.08, 0.04, 8, '#fff4cc', sx * 0.2, 0.8, 1.0, Math.PI / 2 - 0.2);
    tg.cyl(0.1, 0.1, 0.1, 8, '#c9ccd2', sx * 0.2, 0.8, 0.94, Math.PI / 2 - 0.2);
  }
  rod(tg, V(-0.42, 1.3, 0.46), V(0.42, 1.3, 0.46), 0.03, '#26262b');
  rod(tg, V(0, 0.95, 0.5), V(0, 1.3, 0.46), 0.04, '#26262b');
  // a pipe at the back
  tg.cyl(0.05, 0.05, 0.4, 8, '#8a8d95', -0.22, 0.62, -1.08, Math.PI / 2);
  brake.box(0.4, 0.06, 0.04, '#ffffff', 0, 0.88, -1.04);
  glass.box(0.34, 0.22, 0.03, GLASS_CAR, 0, 1.46, 0.5, -0.3);
  // a number plate board on the nose
  tg.box(0.34, 0.2, 0.03, '#f4f4f0', 0, 1.0, 1.05, -0.3);
  return {
    wheels,
    halfW: 0.3,
    nose: 1.25,
    tail: -1.3,
    sill: 0.46,
    belt: 0.98,
    roof: { y: 1.05, z0: -0.2, z1: -0.9, w: 0.4 },
    lip: { y: 1.05, z: -0.9, w: 0.4 },
    deck: { y: 1.0, z: -1.0, w: 0.5 },
    head: [0, 1.6, -0.3],
    lamps: [[0.2, 0.8, 1.02]],
    tails: { p: [0.2, 0.88, -1.05], w: 0.2, h: 0.06 },
    pipe: [-0.22, 0.62, -1.2],
    plate: [0, 0.8, -1.12],
    bumper: { y: 0.74, z: -1.1, w: 0.4, h: 0.08 },
    screen: { z0: 0.56, y0: 1.36, z1: 0.46, y1: 1.56, hw: 0.14 },
    spots: {
      hood: { region: 'hood', p: [0, 0.96, 0.5], size: 0.3 },
      roof: { region: 'roof', p: [0, 1.03, -0.62], size: 0.3 },
      doors: { region: 'doorP', p: [0.28, 0.76, -0.1], size: 0.34 },
      back: { region: 'back', p: [0, 0.74, -1.01], size: 0.14 },
    },
    numberSpot: { region: 'doorP', p: [0.28, 0.76, -0.1], size: 0.34 },
    eye: [0, 1.9, 0.2],
    snorkel: { x: -0.3, y: 0.7, z: 0.5, top: 1.4, zTop: 0.4 },
    rider: {
      at: [0, 1.1, -0.38],
      helmet: true,
      pose: { hands: [0.4, 0.2, 0.84], knee: [0.28, 0.0, 0.55], foot: [0.3, -0.52, 0.4], tilt: 0.34, torso: 0.52 },
    },
  };
}

// ---------------------------------------------------------------------------
// Traktor
// ---------------------------------------------------------------------------

export function tractor(P: Parts): BodySpec {
  const { pg, tg, glass, lamp, brake, style } = P;
  const wheels: WheelSpec[] = [
    { x: 0.82, z: 1.25, r: 0.45, w: 0.3 },
    { x: -0.82, z: 1.25, r: 0.45, w: 0.3 },
    { x: 1.0, z: -0.6, r: 0.82, w: 0.5 },
    { x: -1.0, z: -0.6, r: 0.82, w: 0.5 },
  ];
  // bonnet: tall in the middle, sloping down at the front
  pg.add(
    profileGeo([
      [1.9, 0.62, 0.38],
      [1.92, 1.08, 0.38],
      [1.6, 1.32, 0.4],
      [0.5, 1.36, 0.42],
      [0.35, 0.98, 0.44],
      [0.35, 0.62, 0.44],
    ], 0.4),
    undefined,
    bodyClassify(0.2, -9),
  );
  // the rear: transmission housing between the big wheels
  pg.add(
    profileGeo([
      [0.35, 0.66, 0.58],
      [0.35, 1.2, 0.58],
      [-1.35, 1.2, 0.5],
      [-1.45, 0.9, 0.46],
      [-1.4, 0.66, 0.46],
    ], 0.5),
    undefined,
    bodyClassify(9, -9),
  );
  // mudguards over the big wheels
  for (const sx of [-1, 1]) {
    pg.box(0.6, 0.08, 1.7, sx * 1.0, 1.72, -0.6, panel(9));
    pg.box(0.08, 0.34, 1.5, sx * 1.28, 1.58, -0.6, panel(9));
    pg.box(0.08, 0.34, 1.5, sx * 0.72, 1.58, -0.6, panel(9));
    pg.box(0.4, 0.08, 0.4, sx * 0.82, 0.9, 1.25, panel(9));
  }
  // cab frame with a roof
  const post = 0.06;
  const px = 0.55;
  const front = 0.15;
  const back = -1.1;
  for (const sx of [-1, 1])
    for (const [z, h] of [[front, 2.45], [back, 2.4]] as const) rod(tg, V(sx * px, 1.2, z), V(sx * px, h, z), post, '#26262b');
  pg.box(1.3, 0.1, 1.5, 0, 2.5, (front + back) / 2, roofClassify);
  // seat and steering wheel
  tg.box(0.5, 0.12, 0.5, '#26262b', 0, 1.34, -0.55);
  tg.box(0.5, 0.5, 0.1, '#26262b', 0, 1.62, -0.82, -0.12);
  tg.add(new THREE.TorusGeometry(0.22, 0.03, 4, 12), '#26262b', mat(0, 1.78, 0.0, -0.9));
  rod(tg, V(0, 1.3, 0.34), V(0, 1.72, 0.04), 0.035, '#26262b');
  // front weights and a hitch
  tg.box(0.9, 0.3, 0.14, '#3a3c42', 0, 0.72, 2.0);
  for (let i = 0; i < 3; i++) tg.box(0.24, 0.26, 0.12, i === 1 ? '#d6352b' : '#6a6d75', (i - 1) * 0.28, 0.72, 2.1);
  tg.box(0.5, 0.1, 0.4, '#3a3c42', 0, 0.72, -1.55);
  rod(tg, V(0, 0.8, -1.4), V(0, 0.78, -1.9), 0.05, '#26262b');
  // grille and the headlights up on the bonnet
  tg.box(0.7, 0.5, 0.05, '#26262b', 0, 0.98, 1.94);
  for (let i = 0; i < 5; i++) tg.box(0.6, 0.03, 0.06, CHROME, 0, 0.8 + i * 0.1, 1.95);
  for (const sx of [-1, 1]) {
    lamp.cyl(0.11, 0.11, 0.05, 10, '#fff4cc', sx * 0.3, 1.25, 1.95, Math.PI / 2);
    lamp.box(0.2, 0.12, 0.04, '#fff4cc', sx * 0.55, 2.36, front + 0.02);
  }
  // the exhaust stack with a flap
  tg.cyl(0.07, 0.07, 0.9, 8, '#26262b', 0.26, 1.85, 0.95);
  tg.cyl(0.1, 0.07, 0.1, 8, '#8a8d95', 0.26, 2.33, 0.95);
  // front axle
  rod(tg, V(-0.8, 0.7, 1.25), V(0.8, 0.7, 1.25), 0.07, '#26262b');
  brake.box(0.2, 0.1, 0.04, '#ffffff', 0.7, 1.5, -1.42);
  glass.box(1.0, 0.7, 0.03, GLASS_CAR, 0, 1.9, -1.1, 0);
  tg.box(0.3, 0.04, 0.2, DARK, 0, 1.0, -1.46);
  void style;
  return {
    wheels,
    halfW: 0.62,
    nose: 2.05,
    tail: -1.6,
    sill: 0.6,
    belt: 1.3,
    roof: { y: 2.55, z0: front, z1: back, w: 1.3 },
    lip: { y: 2.55, z: back, w: 1.3 },
    deck: { y: 1.2, z: -1.35, w: 1.0 },
    head: [0, 2.0, -0.55],
    lamps: [[0.3, 1.25, 1.97]],
    tails: { p: [0.7, 1.5, -1.43], w: 0.2, h: 0.1 },
    pipe: [0.26, 2.4, 0.95],
    plate: [0, 1.0, -1.5],
    bumper: { y: 0.9, z: -1.5, w: 0.5, h: 0.1 },
    screen: { z0: 0.15, y0: 1.5, z1: 0.15, y1: 2.4, hw: 0.5 },
    spots: {
      hood: { region: 'hood', p: [0, 1.34, 1.2], size: 0.6 },
      roof: { region: 'roof', p: [0, 2.55, -0.45], size: 0.8 },
      doors: { region: 'doorP', p: [0.58, 1.0, -0.4], size: 0.7 },
      back: { region: 'back', p: [0, 1.0, -1.44], size: 0.3 },
    },
    numberSpot: { region: 'doorP', p: [0.44, 1.0, 1.0], size: 0.5 },
    eye: [0, 2.2, -0.1],
    snorkel: { x: -0.4, y: 1.0, z: 1.3, top: 2.4, zTop: 0.2 },
    open: true,
    rider: {
      at: [0, 1.45, -0.5],
      pose: { hands: [0.26, 0.5, 0.18], knee: [0.22, 0.08, 0.56], foot: [0.22, -0.4, 0.78], tilt: 0.04, torso: 0.6 },
    },
  };
}

// ---------------------------------------------------------------------------
// Soffbil
// ---------------------------------------------------------------------------

export function sofa(P: Parts): BodySpec {
  const { pg, tg, lamp, brake, style } = P;
  const wheels: WheelSpec[] = [
    { x: 0.82, z: 0.95, r: 0.3, w: 0.2 },
    { x: -0.82, z: 0.95, r: 0.3, w: 0.2 },
    { x: 0.82, z: -0.95, r: 0.3, w: 0.2 },
    { x: -0.82, z: -0.95, r: 0.3, w: 0.2 },
  ];
  const cream = new THREE.Color(style.paint2).lerp(new THREE.Color('#f2d9a0'), 0.45);
  const cushion = `#${cream.getHexString()}`;
  const seam = `#${cream.clone().multiplyScalar(0.8).getHexString()}`;
  const warm = ['#f4c20d', '#2fa8a0', '#8a4fd8'];
  // the base under the seat, in the sofa's colour
  pg.add(
    profileGeo([
      [1.3, 0.34, 0.9],
      [1.34, 0.66, 0.9],
      [-1.3, 0.66, 0.9],
      [-1.3, 0.34, 0.9],
    ], 0.5),
    undefined,
    bodyClassify(0.4, -0.4),
  );
  // a thick back with a rolled top, and rolled arms
  pg.box(1.8, 0.8, 0.46, 0, 1.06, -1.08, bodyClassify(9, -9));
  pg.add(new THREE.CylinderGeometry(0.23, 0.23, 1.8, 8), mat(0, 1.48, -1.08, 0, 0, Math.PI / 2), roofClassify);
  for (const sx of [-1, 1]) {
    pg.box(0.34, 0.42, 1.9, sx * 0.84, 0.87, 0.0, bodyClassify(0.9, -0.9));
    pg.add(new THREE.CylinderGeometry(0.19, 0.19, 1.9, 8), mat(sx * 0.84, 1.1, 0, Math.PI / 2, 0, 0), roofClassify);
  }
  // seat cushions (two) and back cushions (two) in the second colour, with throw pillows
  for (const sx of [-1, 1]) {
    tg.box(0.6, 0.22, 1.3, cushion, sx * 0.31, 0.8, 0.24);
    tg.box(0.6, 0.02, 1.3, seam, sx * 0.31, 0.91, 0.24);
    tg.box(0.6, 0.62, 0.22, cushion, sx * 0.31, 1.18, -0.66, -0.14);
  }
  tg.box(0.34, 0.34, 0.12, warm[0]!, 0.5, 1.2, -0.5, -0.2, 0.3, 0.2);
  tg.box(0.3, 0.3, 0.12, warm[1]!, -0.5, 1.15, -0.5, -0.2, -0.4, -0.1);
  // buttons on the back and a rolled blanket on the left arm
  for (let i = -2; i <= 2; i++) tg.ball(0.04, '#3a2a22', i * 0.32, 1.2, -1.32);
  tg.box(0.3, 0.1, 0.5, '#d6352b', -0.84, 1.34, 0.45).box(0.31, 0.02, 0.5, '#ffffff', -0.84, 1.37, 0.45);
  // little feet and a fringe along the front
  for (let i = -3; i <= 3; i++) tg.box(0.1, 0.1, 0.04, '#f4c20d', i * 0.22, 0.4, 1.34);
  // a floor lamp at the back left corner: pole, base and a glowing shade
  tg.cyl(0.18, 0.2, 0.05, 8, '#26262b', -0.86, 1.4, -1.35);
  tg.cyl(0.025, 0.025, 0.95, 6, '#26262b', -0.86, 1.9, -1.35);
  tg.add(new THREE.CylinderGeometry(0.2, 0.34, 0.34, 8, 1, true), '#ffe9a8', mat(-0.86, 2.5, -1.35));
  lamp.cyl(0.13, 0.13, 0.06, 8, '#fff4cc', -0.86, 2.42, -1.35);
  // a coffee mug on the right armrest
  tg.cyl(0.07, 0.06, 0.12, 8, '#ffffff', 0.84, 1.36, 0.7);
  tg.cyl(0.058, 0.058, 0.02, 8, '#5a3a24', 0.84, 1.42, 0.7);
  // the driver's steering wheel on a pole in front of the seat, like the helm of a ship
  rod(tg, V(0, 0.7, 1.12), V(0, 1.42, 0.98), 0.04, '#8c5a3c');
  tg.add(new THREE.TorusGeometry(0.26, 0.035, 4, 12), '#8c5a3c', mat(0, 1.55, 0.92, -0.35));
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    tg.box(0.05, 0.05, 0.14, '#8c5a3c', Math.cos(a) * 0.3, 1.55 + Math.sin(a) * 0.3 * 0.94, 0.92 - Math.sin(a) * 0.3 * 0.34, 0, 0, a);
  }
  // a front headlight pair low on the base and tail lights
  for (const sx of [-1, 1]) {
    lamp.cyl(0.1, 0.1, 0.05, 8, '#fff4cc', sx * 0.55, 0.5, 1.37, Math.PI / 2);
    brake.box(0.24, 0.1, 0.04, '#ffffff', sx * 0.6, 0.55, -1.34);
  }
  tg.cyl(0.05, 0.05, 0.3, 8, '#555555', 0.5, 0.36, -1.45, Math.PI / 2);
  return {
    wheels,
    halfW: 0.96,
    nose: 1.42,
    tail: -1.4,
    sill: 0.34,
    belt: 0.66,
    roof: { y: 1.7, z0: -0.9, z1: -1.3, w: 1.7 },
    lip: { y: 1.64, z: -1.15, w: 1.6 },
    deck: { y: 0.66, z: -1.0, w: 1.6 },
    head: [0, 1.5, 0.1],
    lamps: [[0.55, 0.5, 1.4]],
    tails: { p: [0.6, 0.55, -1.36], w: 0.24, h: 0.1 },
    pipe: [0.5, 0.36, -1.5],
    plate: [0, 0.5, -1.38],
    bumper: { y: 0.4, z: -1.36, w: 1.7, h: 0.1 },
    screen: { z0: 1.0, y0: 1.2, z1: 0.9, y1: 1.6, hw: 0.3 },
    spots: {
      hood: { region: 'hood', p: [0, 0.66, 1.0], size: 0.5 },
      roof: { region: 'roof', p: [0, 1.7, -1.08], size: 0.5 },
      doors: { region: 'doorP', p: [0.9, 0.5, 0.0], size: 0.5 },
      back: { region: 'back', p: [0, 0.5, -1.3], size: 0.3 },
    },
    numberSpot: { region: 'doorP', p: [0.9, 0.5, 0.0], size: 0.46 },
    eye: [0, 1.95, 0.3],
    snorkel: { x: -0.95, y: 0.7, z: 0.9, top: 1.6, zTop: -0.8 },
    open: true,
    rider: {
      at: [0, 1.0, 0.0],
      pose: { hands: [0.28, 0.5, 0.92], knee: [0.22, 0.14, 0.56], foot: [0.22, -0.42, 0.78], tilt: 0.0, torso: 0.54 },
    },
  };
}

export const EXTRA_BODIES = { atv, moto, moped, tractor, sofa };
