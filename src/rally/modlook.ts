// What the upgrades look like on the car. The run hands the model a `look`: the highest tier taken of every upgrade line
// ("ram.spikes": 2). This file turns that into bolt-on geometry for any of the twenty bodies, from the numbers every body
// already gives the shared builder (its width, nose and tail, sill and belt, roof and wheels), so a new body gets its
// mods for free. Everything goes into the trim geometry as plain boxes, cones and rods in vertex colours.
import * as THREE from 'three';
import { mat } from './geo.ts';
import type { BodySpec, Parts } from './models.ts';

const DARK = '#1c1d22';
const STEEL = '#6e7480';
const STEEL2 = '#454b57';
const CHROME = '#c9ccd2';
const GOLD = '#ffc928';
const GOLD2 = '#c98a00';

type Look = Record<string, number>;

/** Tiers of every line a look has (0 when none). */
export const hasLook = (look: Look | undefined): boolean => !!look && Object.values(look).some((v) => v > 0);

export function addUpgradeLook(P: Parts, s: BodySpec, look: Look | undefined): void {
  if (!look || !hasLook(look)) return;
  const { tg, hi } = P;
  const L = (id: string): number => look[id] ?? 0;
  const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number, color: string): void => {
    const d = new THREE.Vector3().subVectors(b, a);
    const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()), new THREE.Vector3(1, 1, 1));
    tg.add(new THREE.CylinderGeometry(r, r, d.length(), 5, 1, true), color, m);
  };
  /** A cone pointing along a direction. */
  const spike = (x: number, y: number, z: number, dx: number, dy: number, dz: number, len: number, r: number, color = '#d9dce2'): void => {
    const m = new THREE.Matrix4().compose(V(x, y, z).addScaledVector(V(dx, dy, dz).normalize(), len / 2), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), V(dx, dy, dz).normalize()), new THREE.Vector3(1, 1, 1));
    tg.add(new THREE.ConeGeometry(r, len, 5), color, m);
  };

  const rider = !!s.rider;
  const hw = s.halfW;
  const fw = s.wheels[0]!;
  const rw = s.wheels[s.wheels.length - 1]!;
  const zFront = fw.z - fw.r - 0.05;
  const zRear = rw.z + rw.r + 0.05;
  const zMid = (zFront + zRear) / 2;
  const span = Math.max(0.4, zFront - zRear);
  // where things that sit on top go: the roof, or for a bike, a tractor or a sofa the rear rack behind the rider
  const topY = rider ? s.belt + 0.12 : s.roof.y;
  const topZ = rider ? s.tail + 0.5 : (s.roof.z0 + s.roof.z1) / 2;
  const topW = rider ? hw * 0.7 : s.roof.w / 2;
  const deckY = s.deck.y;
  const tailZ = s.tail;
  const noseZ = s.nose;
  const fl = rider ? 0.04 : 0.1;

  // ---------------- 🛡️ Ram ----------------
  const plates = L('ram.plates');
  if (plates > 0 && !rider) {
    // armour on the flanks, taller with every tier, riveted; the third tier also gets a roof plate and window bars
    const h = plates === 1 ? 0.3 : plates === 2 ? Math.max(0.4, s.belt - s.sill - 0.05) : Math.max(0.5, s.belt - s.sill + 0.12);
    for (const sx of [-1, 1]) {
      tg.box(0.07, h, span * 0.92, STEEL, sx * (hw + 0.045), s.sill + 0.08 + h / 2, zMid);
      tg.box(0.09, 0.05, span * 0.92, STEEL2, sx * (hw + 0.05), s.sill + 0.08 + h, zMid);
      if (hi) for (let i = 0; i < 4; i++) tg.box(0.09, 0.06, 0.06, DARK, sx * (hw + 0.07), s.sill + 0.08 + h * 0.5, zRear + (span * (i + 0.5)) / 4);
    }
    if (plates >= 3) {
      tg.box(s.roof.w * 0.96, 0.07, Math.abs(s.roof.z0 - s.roof.z1) * 0.8, STEEL, 0, s.roof.y + 0.06, (s.roof.z0 + s.roof.z1) / 2);
      tg.box(s.roof.w * 0.9, 0.05, 0.1, STEEL2, 0, s.roof.y + 0.1, (s.roof.z0 + s.roof.z1) / 2);
    }
  } else if (plates > 0) {
    for (const sx of [-1, 1]) tg.box(0.05, 0.18 + 0.06 * plates, span * 0.7, STEEL, sx * (hw + 0.06), s.sill + 0.2, zMid);
  }
  const ballast = L('ram.ballast');
  if (ballast > 0) {
    // sandbags and a block on the rear deck
    const n = 2 + ballast;
    for (let i = 0; i < n; i++) tg.box(0.34, 0.2, 0.26, i % 2 ? '#a89572' : '#bba67f', (i - (n - 1) / 2) * 0.38 * Math.min(1, (hw * 2) / (n * 0.38)), deckY + 0.14 + (i === 1 && n > 3 ? 0.18 : 0), tailZ + 0.34);
  }
  const spikes = L('ram.spikes');
  const hammer = L('ram.hammer');
  if (spikes > 0 || hammer > 0) {
    // a bull bar across the nose
    const y0 = s.bumper.y - 0.04;
    const z = noseZ + 0.1;
    const w = Math.max(0.35, s.bumper.w * 0.45);
    for (const sx of [-1, 1]) rod(V(sx * w, y0, z - 0.1), V(sx * w, y0 + 0.46, z), 0.04, DARK);
    rod(V(-w, y0 + 0.46, z), V(w, y0 + 0.46, z), 0.045, STEEL2);
    rod(V(-w, y0 + 0.14, z - 0.04), V(w, y0 + 0.14, z - 0.04), 0.045, STEEL2);
  }
  if (spikes > 0) {
    const y0 = s.bumper.y + 0.1;
    const n = spikes === 1 ? 4 : 6;
    for (let i = 0; i < n; i++) spike(((i - (n - 1) / 2) * s.bumper.w * 0.8) / Math.max(1, n - 1), y0 + (i % 2 ? 0.2 : 0.02), noseZ + 0.1, 0, 0.05, 1, 0.34, 0.06);
    if (spikes >= 2) {
      // spikes out of the flanks and the wheel hubs, and a row along the roof edge
      for (const sx of [-1, 1]) {
        for (const w of s.wheels) if (Math.sign(w.x) === sx || s.wheels.length <= 2) spike(sx * (Math.abs(w.x) + w.w / 2), w.r, w.z, sx, 0.05, 0, 0.3, 0.06, '#bfc3ca');
        if (!rider) for (let i = 0; i < 3; i++) spike(sx * (hw + 0.1), s.belt - 0.05, zRear + (span * (i + 0.5)) / 3, sx, 0.2, 0, 0.26, 0.05);
      }
      if (!rider) for (let i = 0; i < 4; i++) spike((i - 1.5) * topW * 0.45, topY + 0.04, topZ - 0.3, 0, 1, 0, 0.26, 0.05);
    }
  }
  if (hammer >= 2) {
    // a big wedge ram plate in front of the bumper
    const w = s.bumper.w * 0.5;
    tg.add(new THREE.BoxGeometry(w * 2, 0.5, 0.12), STEEL, mat(0, s.bumper.y + 0.22, noseZ + 0.24, -0.35, 0, 0));
    tg.box(w * 2.05, 0.06, 0.16, STEEL2, 0, s.bumper.y + 0.46, noseZ + 0.16);
  } else if (hammer === 1) tg.box(s.bumper.w * 0.9, 0.12, 0.1, STEEL, 0, s.bumper.y + 0.05, noseZ + 0.14);
  const shock = L('ram.shock');
  if (shock > 0) {
    // two orange shock springs by the nose
    for (const sx of [-1, 1]) tg.cyl(0.07 + 0.02 * shock, 0.07 + 0.02 * shock, 0.3, 8, '#ff7a1a', sx * (hw * 0.62), s.bumper.y + 0.14, noseZ - 0.08, Math.PI / 2);
  }
  if (L('ram.boost') > 0) {
    // a red booster tank on the back
    tg.cyl(0.13, 0.13, 0.62, 8, '#d1322c', 0, deckY + 0.2, tailZ + 0.22, Math.PI / 2, 0, Math.PI / 2);
    tg.cyl(0.14, 0.14, 0.05, 8, DARK, hw * 0.35, deckY + 0.2, tailZ + 0.22, Math.PI / 2, 0, Math.PI / 2);
  }
  if (L('ram.cap') > 0) {
    // horns on the bonnet
    for (const sx of [-1, 1]) {
      const b = V(sx * hw * 0.5, s.belt + (rider ? 0.35 : 0), (rider ? noseZ - 0.6 : s.screen.z0 + 0.15));
      rod(b, V(sx * hw * 0.85, b.y + 0.28, b.z + 0.1), 0.05, '#efe6c8');
      rod(V(sx * hw * 0.85, b.y + 0.28, b.z + 0.1), V(sx * hw * 0.8, b.y + 0.55, b.z + 0.34), 0.035, '#efe6c8');
    }
  }

  // ---------------- 🏎️ Race ----------------
  const engine = L('race.engine');
  if (engine > 0) {
    // fat twin pipes out of the back; the third tier adds a hot glow in them
    for (const sx of [-1, 1]) {
      tg.cyl(0.075 + 0.015 * engine, 0.075 + 0.015 * engine, 0.3, 8, CHROME, sx * hw * 0.42, s.bumper.y - 0.02, tailZ - 0.02, Math.PI / 2);
      tg.cyl(0.05, 0.05, 0.32, 8, engine >= 3 ? '#ff8a2a' : '#1a1a1a', sx * hw * 0.42, s.bumper.y - 0.02, tailZ - 0.02, Math.PI / 2);
    }
  }
  const grip = L('race.grip');
  if (grip > 0) {
    // wide arches: flared fenders over every wheel, wider with each tier
    for (const w of s.wheels) {
      const sx = w.x >= 0 ? 1 : -1;
      const out = Math.abs(w.x) + w.w / 2 + fl * grip * 0.6;
      tg.box(0.1 + 0.03 * grip, 0.07, w.r * 2.7, DARK, sx * out, w.r * 1.95, w.z);
      if (grip >= 2) tg.box(0.12, w.r * 0.9, 0.06, STEEL2, sx * out, w.r * 1.45, w.z + w.r * 1.3);
      if (grip >= 2) tg.box(0.12, w.r * 0.9, 0.06, STEEL2, sx * out, w.r * 1.45, w.z - w.r * 1.3);
      if (grip >= 3) tg.box(0.13, 0.05, w.r * 2.5, '#e8412c', sx * (out + 0.01), w.r * 2.1, w.z);
    }
  }
  const aero = L('race.aero');
  if (aero > 0) {
    // a front splitter; the second tier adds a tall wing on posts
    tg.box(s.bumper.w * 0.96, 0.04, 0.34, DARK, 0, s.sill + 0.02, noseZ + 0.12);
    for (const sx of [-1, 1]) tg.box(0.04, 0.12, 0.3, STEEL2, sx * s.bumper.w * 0.48, s.sill + 0.08, noseZ + 0.1);
    if (aero >= 2) {
      const y = deckY + 0.55;
      tg.box(s.deck.w + 0.1, 0.06, 0.44, '#e8e8ea', 0, y, tailZ + 0.3, -0.12);
      for (const sx of [-1, 1]) {
        tg.box(0.05, 0.55, 0.14, DARK, sx * s.deck.w * 0.3, deckY + 0.27, tailZ + 0.3);
        tg.box(0.04, 0.3, 0.5, '#e8412c', sx * (s.deck.w / 2 + 0.07), y + 0.04, tailZ + 0.3);
      }
    }
  }
  const nitro = L('race.nitro');
  if (nitro > 0) {
    // blue nitro bottles lying across the back, one per tier
    for (let i = 0; i < nitro; i++) {
      const x = (i - (nitro - 1) / 2) * 0.3;
      tg.cyl(0.1, 0.1, 0.46, 8, '#2a7bd9', x, deckY + 0.12 + 0.1 * (i % 2), tailZ + 0.6 + 0.05 * i, Math.PI / 2, 0, 0);
      tg.cyl(0.05, 0.05, 0.05, 6, '#f2f2f2', x, deckY + 0.12 + 0.1 * (i % 2), tailZ + 0.86 + 0.05 * i, Math.PI / 2, 0, 0);
    }
  }
  if (L('race.cap') > 0) {
    // a shark fin down the middle of the back
    tg.add(new THREE.BoxGeometry(0.05, 0.4, 0.8), '#e8412c', mat(0, deckY + 0.42, tailZ + 0.6, 0.45));
  }

  const brakes = L('race.brakes');
  if (brakes > 0) {
    // big red calipers on shining discs at every wheel; the second tier has yellow ones and a drilled disc
    for (const w of s.wheels) {
      const sx = w.x >= 0 ? 1 : -1;
      const x = sx * (Math.abs(w.x) + w.w / 2 + 0.02);
      tg.cyl(w.r * 0.62, w.r * 0.62, 0.025, 12, CHROME, x, w.r, w.z, 0, 0, Math.PI / 2);
      tg.box(0.07, w.r * 0.5, w.r * 0.55, brakes >= 2 ? '#ffd23f' : '#e8302c', x + sx * 0.02, w.r * 1.15, w.z + w.r * 0.1);
      if (brakes >= 2) tg.box(0.07, w.r * 0.5, w.r * 0.55, '#ffd23f', x + sx * 0.02, w.r * 0.85, w.z - w.r * 0.1);
    }
  }
  const long = L('race.long');
  if (long > 0) {
    // a long blue nitro line along each side of the car with a silver nozzle at the back (a second line with the second tier)
    const lines = long >= 2 ? [0.08, 0.2] : [0.08];
    for (const sx of [-1, 1])
      for (const y of lines) {
        tg.cyl(0.04, 0.04, span * 0.85, 7, '#3da0ff', sx * (hw + 0.07), s.sill + y, zMid, Math.PI / 2);
        tg.cyl(0.055, 0.045, 0.1, 7, CHROME, sx * (hw + 0.07), s.sill + y, zRear + (span - span * 0.85) / 2 - 0.02, Math.PI / 2);
      }
  }
  const drift = L('race.drift');
  if (drift > 0) {
    // purple canard fins on the front corners, and (second tier) a ducktail lip with a pair of spark plates under the back
    for (const sx of [-1, 1]) {
      tg.add(new THREE.BoxGeometry(0.2 + 0.05 * drift, 0.035, 0.22), '#8a4fd8', mat(sx * (s.bumper.w / 2 - 0.02), s.bumper.y + 0.28, noseZ + 0.04, 0, sx * 0.35, 0));
      if (drift >= 2) tg.box(0.18, 0.025, 0.16, '#ff9a2a', sx * hw * 0.5, s.bumper.y - 0.04, tailZ - 0.1);
    }
    if (drift >= 2) tg.add(new THREE.BoxGeometry(s.deck.w * 0.85, 0.05, 0.2), '#8a4fd8', mat(0, deckY + 0.08, tailZ + 0.02, 0.3));
  }

  // ---------------- 🦨 Fuffens ----------------
  const oil = L('fuffens.oil');
  if (oil > 0) {
    // an oil drum on the back deck (two with the second tier), a yellow band round it
    for (let i = 0; i < oil; i++) {
      const x = (i ? -1 : 1) * hw * 0.42;
      tg.cyl(0.17, 0.17, 0.4, 8, '#2e3138', x, deckY + 0.24, tailZ + 0.46);
      tg.cyl(0.175, 0.175, 0.07, 8, '#ffd23f', x, deckY + 0.24, tailZ + 0.46);
    }
  }
  const smoke = L('fuffens.smoke');
  if (smoke > 0) {
    // a grey smoke canister with a green band and a nozzle, lying along the side of the back
    const x = -hw * 0.55;
    tg.cyl(0.11 + 0.02 * smoke, 0.11 + 0.02 * smoke, 0.5, 8, '#8a909c', x, deckY + 0.55, tailZ + 0.42, Math.PI / 2);
    tg.cyl(0.115 + 0.02 * smoke, 0.115 + 0.02 * smoke, 0.08, 8, '#38b24a', x, deckY + 0.55, tailZ + 0.42, Math.PI / 2);
    tg.cyl(0.04, 0.06, 0.16, 6, DARK, x, deckY + 0.55, tailZ + 0.12, Math.PI / 2);
    tg.box(0.05, 0.16, 0.06, STEEL2, x, deckY + 0.4, tailZ + 0.42);
  }
  if (L('fuffens.mine') > 0) {
    // a stack of dark discs with red dots hanging off the rear bumper
    for (let i = 0; i < L('fuffens.mine') + 1; i++) {
      tg.cyl(0.19, 0.2, 0.05, 10, '#3a3d46', hw * 0.15, s.bumper.y + 0.2 + i * 0.07, tailZ - 0.1);
      tg.cyl(0.04, 0.04, 0.06, 6, '#ff2a1a', hw * 0.15, s.bumper.y + 0.22 + i * 0.07, tailZ - 0.1);
    }
  }
  if (L('fuffens.fake') > 0) {
    // a shiny coin hung on a string from the mirror: it is a trap
    tg.add(new THREE.CylinderGeometry(0.14, 0.14, 0.035, 12), GOLD, mat(hw + 0.08, s.belt + 0.1, zFront - 0.25, 0, 0, Math.PI / 2));
    rod(V(hw + 0.05, s.belt + 0.4, zFront - 0.25), V(hw + 0.08, s.belt + 0.18, zFront - 0.25), 0.012, DARK);
  }
  if (L('fuffens.hay') > 0) {
    // a bale on the roof; on a bike it is strapped to the very back of the rack, small
    const hz = rider ? topZ + 0.32 : topZ - 0.1;
    const k = rider ? 0.7 : 1;
    tg.box(0.5 * k, 0.3 * k, 0.34 * k, '#e0b84a', topW * 0.55 * (rider ? 0 : 1), topY + 0.2 * k, hz);
    tg.box(0.51 * k, 0.04 * k, 0.35 * k, '#b08a2e', topW * 0.55 * (rider ? 0 : 1), topY + 0.2 * k, hz);
  }
  if (L('fuffens.cap') > 0) {
    // a tiny magician's hat on the roof, or on the rider's helmet
    const hy = rider && s.rider ? s.rider.at[1] + 0.72 : topY;
    const hz = rider && s.rider ? s.rider.at[2] - 0.02 : topZ + 0.2;
    tg.cyl(0.2, 0.2, 0.03, 10, '#14141a', 0, hy + 0.03, hz);
    tg.cyl(0.13, 0.14, 0.26, 10, '#14141a', 0, hy + 0.17, hz);
    tg.cyl(0.142, 0.142, 0.05, 10, '#7a2bd9', 0, hy + 0.1, hz);
  }

  // ---------------- 🤸 Stunt ----------------
  if (L('stunt.air') > 0) {
    // a fold-out ramp on the tail
    tg.add(new THREE.BoxGeometry(Math.min(1.1, hw * 1.5), 0.05, 0.7), '#e8a21c', mat(0, deckY + 0.05, tailZ - 0.14, 0.5));
    for (const sx of [-1, 1]) tg.add(new THREE.BoxGeometry(0.05, 0.16, 0.66), DARK, mat(sx * Math.min(0.55, hw * 0.75), deckY + 0.1, tailZ - 0.12, 0.5));
  }
  const flip = L('stunt.flip');
  if (flip > 0) {
    // a roll cage over the roof: a hoop or two
    // (on a bike: a tall hoop behind the rider, like a sissy bar, wide enough to clear the seat)
    const w = rider ? Math.max(topW * 1.1, 0.26) : topW * 0.92;
    const hh = rider ? 0.62 : 0.36;
    const z0 = rider ? topZ - 0.05 : topZ;
    const hoops = flip >= 2 ? [z0 + (rider ? 0.28 : 0.35), z0 - (rider ? 0.1 : 0.35)] : [z0];
    for (const z of hoops) {
      rod(V(-w, topY, z), V(-w * 0.8, topY + hh, z), 0.04, '#e8e8ea');
      rod(V(w, topY, z), V(w * 0.8, topY + hh, z), 0.04, '#e8e8ea');
      rod(V(-w * 0.8, topY + hh, z), V(w * 0.8, topY + hh, z), 0.04, '#e8e8ea');
    }
    if (hoops.length > 1) rod(V(-w * 0.8, topY + hh, hoops[0]!), V(-w * 0.8, topY + hh, hoops[1]!), 0.035, '#e8e8ea');
  }
  const near = L('stunt.near');
  if (near > 0) {
    // stunt flags on posts at the back corners
    for (const sx of [-1, 1]) {
      const x = sx * hw * 0.8;
      rod(V(x, deckY, tailZ + 0.2), V(x, deckY + 0.9, tailZ + 0.2), 0.015, DARK);
      tg.box(0.02, 0.2, 0.3, sx > 0 ? '#e8412c' : '#2f9be8', x, deckY + 0.78, tailZ + 0.04);
      if (near >= 2) tg.box(0.021, 0.1, 0.15, '#f4f4f0', x, deckY + 0.84, tailZ + 0.0);
    }
  }
  if (L('stunt.wheel') > 0) {
    // stunt bars out of the flanks
    for (const sx of [-1, 1]) {
      rod(V(sx * hw, s.sill + 0.2, zRear + 0.2), V(sx * (hw + 0.3), s.sill + 0.12, zRear + 0.1), 0.035, '#e8e8ea');
      rod(V(sx * (hw + 0.3), s.sill + 0.12, zRear + 0.1), V(sx * (hw + 0.3), s.sill + 0.12, zFront - 0.1), 0.035, '#e8e8ea');
      rod(V(sx * (hw + 0.3), s.sill + 0.12, zFront - 0.1), V(sx * hw, s.sill + 0.2, zFront - 0.2), 0.035, '#e8e8ea');
    }
  }
  const susp = L('stunt.susp');
  if (susp > 0) {
    // yellow coil springs over every wheel, taller with the second tier
    for (const w of s.wheels) {
      const sx = w.x >= 0 ? 1 : -1;
      const x = sx * (Math.abs(w.x) + w.w / 2 + 0.05);
      const h = w.r * (susp >= 2 ? 1.5 : 1.15);
      tg.cyl(0.04, 0.04, h, 6, DARK, x, w.r * 1.45, w.z - w.r * 0.1);
      for (let k = 0; k < 4; k++) tg.cyl(0.075, 0.075, 0.03, 7, susp >= 2 ? GOLD : '#ffd23f', x, w.r * 1.45 - h * 0.38 + (h * 0.76 * k) / 3, w.z - w.r * 0.1);
    }
  }
  if (L('stunt.cap') > 0) {
    // a gold star on the bonnet
    const y = s.belt + 0.06 + (rider ? 0.4 : 0);
    const z = rider ? noseZ - 0.7 : s.screen.z0 + 0.4;
    for (const a of [0, Math.PI / 5, (2 * Math.PI) / 5, (3 * Math.PI) / 5, (4 * Math.PI) / 5]) tg.add(new THREE.BoxGeometry(0.34, 0.03, 0.08), GOLD, mat(0, y, z, 0, a, 0));
  }

  // ---------------- 🤑 Girig ----------------
  const gold = L('girig.gold');
  if (gold > 0) {
    // gold trim along the belt line and gold bumper corners; the second tier also gets gold hubcaps
    for (const sx of [-1, 1]) tg.box(0.04, 0.05, span * 0.95, GOLD, sx * (hw + 0.03), s.belt - 0.02, zMid);
    for (const sx of [-1, 1]) tg.box(0.14, 0.12, 0.12, GOLD, sx * (s.bumper.w / 2 - 0.05), s.bumper.y + 0.02, noseZ + 0.06);
    if (gold >= 2) for (const w of s.wheels) tg.cyl(w.r * 0.34, w.r * 0.34, 0.04, 8, GOLD, (w.x >= 0 ? 1 : -1) * (Math.abs(w.x) + w.w / 2 + 0.02), w.r, w.z, 0, 0, Math.PI / 2);
  }
  const interest = L('girig.interest');
  if (interest > 0 || L('girig.ins') > 0) {
    // a money bag lashed to the roof
    const x = rider ? 0 : -topW * 0.3;
    const z = rider ? topZ - 0.32 : topZ - 0.15;
    tg.ball(0.22, '#b8956a', x, topY + 0.22, z, 1, 1.08, 1, 0);
    tg.cyl(0.07, 0.11, 0.1, 8, '#b8956a', x, topY + 0.46, z);
    tg.cyl(0.1, 0.1, 0.03, 8, '#8a6a3c', x, topY + 0.42, z);
    tg.add(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 10), GOLD, mat(x, topY + 0.26, z + 0.215, Math.PI / 2));
    if (interest >= 3) tg.ball(0.14, '#b8956a', x + 0.26, topY + 0.14, z + 0.04, 1, 0.9, 1);
  }
  const bounty = L('girig.bounty');
  if (bounty > 0) {
    // a little gold pennant on a post by the nose: the bounty hunter's flag
    const x = -hw * 0.75;
    const z = rider ? noseZ - 0.9 : zFront - 0.35;
    rod(V(x, s.belt, z), V(x, s.belt + 0.55, z), 0.015, DARK);
    tg.box(0.02, 0.16, 0.26 + 0.08 * bounty, GOLD, x, s.belt + 0.46, z - 0.14);
    tg.ball(0.045, GOLD2, x, s.belt + 0.58, z, 1, 1, 1, 0);
  }
  const disc = L('girig.disc');
  if (disc > 0) {
    // a RABATT card hung from the mirror: white with a red band (a second one with the second tier)
    for (let i = 0; i < Math.min(2, disc); i++) {
      const x = -(hw + 0.08 + i * 0.06);
      const y = s.belt + 0.1 - i * 0.04;
      const z = rider ? noseZ - 0.9 : zFront - 0.25;
      rod(V(x, y + 0.34, z), V(x, y + 0.2, z), 0.01, DARK);
      tg.box(0.02, 0.16, 0.22, '#f4f4f0', x, y + 0.1, z);
      tg.box(0.025, 0.05, 0.22, '#e8302c', x, y + 0.1, z);
    }
  }
  if (L('girig.cap') > 0) {
    // a gold ornament on the nose
    tg.ball(0.1, GOLD, 0, s.belt + 0.08 + (rider ? 0.5 : 0), rider ? noseZ - 0.8 : s.screen.z0 + 0.4, 1, 1, 1.4, 1);
    tg.ball(0.05, GOLD2, 0, s.belt + 0.18 + (rider ? 0.5 : 0), rider ? noseZ - 0.8 : s.screen.z0 + 0.5, 1, 1, 1, 0);
  }
}
