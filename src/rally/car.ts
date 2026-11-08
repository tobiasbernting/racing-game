// Arcade-sim car handling: a bicycle model with grip-limited tyres, weight transfer, a rear-wheel-drive
// power curve with a gearbox of its own per body (automatic, or shifted by the player), handbrake slides, countersteer help, jumps over crests,
// and gentle bounces off the fences. Surfaces: asphalt, gravel, kerbs, grass, snow, sand and ice. In free
// roam only the real walls (stone walls, bridge rails) stop the car. Plain maths, no Three.js.
import { CAR_BODY_DEFS, type CarBody, type Feel } from '../shared/rally.ts';
import { IDLE, PERFECT_PUSH, PERFECT_TIME, REDLINE, autoGear, canDownshift, gearboxOf, isPerfect, pushK, wheelFrac, wheelRpm, launchRpm, type GearBox } from './gears.ts';
import { Fence, Surf, type Proj, type Track } from './track.ts';
import { clamp, damp, lerp, smooth, wrapAngle } from './util.ts';

export interface Controls {
  /** 0..1 */
  throttle: number;
  /** 0..1, also reverses from a standstill */
  brake: number;
  /** −1..1, positive steers left */
  steer: number;
  handbrake: boolean;
  /** −1 / +1: a shift down / up asked for this step (a manual gearbox only; the buttons are edges). */
  shift?: number;
}

export interface Ground {
  height(x: number, z: number): number;
  /** Ramps and the like laid over the road: extra height at road position (s, d) (see ramps.ts). */
  lift?(s: number, d: number): number;
}

export const Ground_ = { Asphalt: 0, Gravel: 1, Kerb: 2, Grass: 3, Snow: 4, Sand: 5, Ice: 6, DeepSnow: 7, SoftSand: 8 } as const;

/** Grip and rolling resistance per ground (index = Ground_ value). Rolling resistance grows with speed off the road. */
const MU = [1.2, 0.95, 1.08, 0.74, 0.72, 0.8, 0.52, 0.62, 0.7];
const ROLL = [0.15, 0.55, 0.3, 2.6, 0.35, 1.4, 0.1, 1.2, 2.2];
const ROLL_V = [0, 0, 0, 0.05, 0, 0.012, 0, 0.025, 0.05];
const ROAD_GROUND = [Ground_.Asphalt, Ground_.Gravel, Ground_.Snow, Ground_.Sand, Ground_.Ice];

const MASS = 1200;
/** The rally car's engine power (N·m/s), the base the bodies and rivals scale. */
export const BASE_POWER = 145000;
const IZ = 2100;
const CG_F = 1.15;
const CG_R = 1.35;
const WB = CG_F + CG_R;
const CG_H = 0.45;
const G = 9.81;
const DRAG = 0.95;
export { REDLINE };

const tyre = (alpha: number, b: number): number => Math.sin(1.4 * Math.atan(b * alpha));

export class Car {
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vz = 0;
  vy = 0;
  heading = 0;
  yawRate = 0;
  steerAngle = 0;
  gear = 1;
  rpm = IDLE;
  shiftT = 0;
  /** The gearbox of this body (setBody). */
  box: GearBox = gearboxOf('hatch');
  /** Shifted by the player (shift buttons) instead of by itself. */
  manual = false;
  /** Seconds left of the rev limiter's cut, and of a perfect shift's extra push. */
  limiterT = 0;
  perfectT = 0;
  /** A perfect shift just happened (read and cleared by the game, for the tick and the flash). */
  perfect = 0;
  /** A shift down was refused, it would have over-revved the engine (read and cleared). */
  shiftDenied = 0;
  /** Engine braking when the throttle is lifted (1 = a light drag; the pedal schemes ask for more). */
  engineBrake = 1;
  /** +1 just shifted up, −1 down (read and cleared by the sound). */
  shifted = 0;
  reverse = false;
  private revHold = 0;
  air = false;
  airT = 0;
  speed = 0;
  vLong = 0;
  vLat = 0;
  /** Smoothed accelerations in the car's frame (m/s²), for body pitch and roll. */
  accLong = 0;
  accLat = 0;
  frontSlip = 0;
  rearSlip = 0;
  /** 0..1 how loudly the tyres are complaining. */
  slip = 0;
  wheelspin = 0;
  surface: number = Ground_.Asphalt;
  onKerb = false;
  wheelRot = 0;
  rearRot = 0;
  readonly proj: Proj = { i: 0, u: 0, s: 0, d: 0 };
  private ground = 0;
  private groundVy = 0;
  /** The last landing's impact speed and fence hit (read and cleared by the game). */
  landed = 0;
  wallHit = 0;
  wallKind = 0;
  /** Slope under the car (radians): pitch nose-up positive, roll left-up positive. */
  slopePitch = 0;
  slopeRoll = 0;
  /** Suspension bounce for the body (m) and its speed. */
  susp = 0;
  suspV = 0;
  // ---- tuning ----
  power = BASE_POWER;
  grip = 1;
  /** Countersteer and slide-catching help (0 none … 1 lots). */
  assist = 0.4;
  /** Traction control: share of the rear grip the engine may use. */
  traction = 0.85;
  /** Seconds left of a rocket start. */
  launch = 0;
  /** Seconds without bumping other cars (after a respawn). */
  ghost = 0;
  braking = false;
  throttleIn = 0;
  /** Engine boost on top of the power (nitro, a drift boost): 1 = none. */
  boost = 1;
  /** Brake force multiplier (the brakes part). */
  brakeMul = 1;
  /** Gravity multiplier (1 = normal, below floats). */
  gravity = 1;
  /** Collision size (the bigger bodies). */
  size = 1;
  /** How this body drives (mass, steering, top speed, leaning…), see shared/rally.ts. */
  feel: Feel = CAR_BODY_DEFS.hatch.feel;
  /** The lean of two-wheelers and the like (radians, positive tips the left side up), smoothed. */
  lean = 0;
  /** Seconds left in a comic tumble (a bike that took a big hit): the game drives the car meanwhile. */
  tumbleT = 0;
  /** Multiplier on the body's top speed (a trinket's fan). */
  topK = 1;
  /** Ram power: 1 is a plain bumper, more shoves whoever it hits harder (see combat.ts). */
  ram = 1;
  /** Free roam: no run-off fences, only the real walls; the grass rolls a little easier. */
  roam = false;
  /** What the ground off the road is at a point (grass when not set): snow, sand, ice on the lake. */
  offroadAt: ((x: number, z: number) => number) | null = null;
  private prevD = 0;
  /** Last step's rear lateral force (N), so the traction control can leave grip for cornering. */
  private fyRear = 0;

  constructor(private track: Track) {}

  /** Dresses the physics as a body (the cars all share the plain feel). */
  setBody(body: CarBody, feel: Feel = CAR_BODY_DEFS[body].feel): void {
    this.feel = feel;
    this.box = gearboxOf(body);
    this.gear = Math.min(this.gear, this.box.v.length);
  }

  /** A gear thrown in or out without asking (a trinket's thump): ignores the shift timer and the perfect window. */
  jolt(dir: number): void {
    if (this.reverse || this.air) return;
    const g = Math.max(1, Math.min(this.box.v.length, this.gear + dir));
    if (g === this.gear || (dir < 0 && !canDownshift(this.box, this.gear, Math.abs(this.vLong)))) return;
    this.gear = g;
    this.shifted = dir > 0 ? 1 : -1;
    this.shiftT = this.box.shiftTime;
  }

  /** The wheels' revs as a share of the redline in the current gear. */
  get revFrac(): number {
    return wheelFrac(this.box, this.gear, this.vLong);
  }

  /** A shift the player (or a trinket) asks for. Returns false when the box refuses. */
  shiftGear(dir: number, perfectOk = true): boolean {
    if (this.reverse || this.air || this.shiftT > 0.04) return false;
    const top = this.box.v.length;
    const va = Math.abs(this.vLong);
    if (dir > 0) {
      if (this.gear >= top) return false;
      const frac = wheelFrac(this.box, this.gear, va);
      if (perfectOk && isPerfect(frac)) {
        this.perfectT = PERFECT_TIME;
        this.perfect = 1;
      }
      this.gear++;
      this.shifted = 1;
    } else {
      if (this.gear <= 1) return false;
      if (!canDownshift(this.box, this.gear, va)) {
        this.shiftDenied = 1;
        return false;
      }
      this.gear--;
      this.shifted = -1;
    }
    this.shiftT = this.box.shiftTime;
    return true;
  }

  place(s: number, d: number, ground: Ground): void {
    const p = this.track.point(s, d);
    this.x = p.x;
    this.z = p.z;
    this.heading = this.track.heading(s);
    this.vx = this.vz = this.vy = 0;
    this.yawRate = 0;
    this.steerAngle = 0;
    this.fyRear = 0;
    this.gear = 1;
    this.reverse = false;
    this.track.project(this.x, this.z, -1, this.proj);
    this.ground = this.groundAt(this.x, this.z, ground);
    this.y = this.ground;
    this.groundVy = 0;
    this.air = false;
    this.susp = 0;
    this.suspV = 0;
  }

  /** Height of the ground at a point near the car (the road is flat across). */
  groundAt(x: number, z: number, ground: Ground, p: Proj = this.proj): number {
    const t = this.track;
    const hw = t.hw[p.i]!;
    const ad = Math.abs(p.d);
    // continuous everywhere (a step would launch the car): the road, blending into the ground over the verge
    const up = ground.lift ? ground.lift(p.s, p.d) : 0;
    if (ad <= hw + 0.3) return t.roadY(p) + up;
    const g = ground.height(x, z);
    if (ad >= hw + 2.5) return g + up;
    return lerp(t.roadY(p), g, smooth(hw + 0.3, hw + 2.5, ad)) + up;
  }

  /** One physics step (call at 120 Hz). */
  step(dt: number, c: Controls, ground: Ground, frozen = false): void {
    const t = this.track;
    const p = this.proj;
    const sinH = Math.sin(this.heading);
    const cosH = Math.cos(this.heading);
    let vLong = this.vx * sinH + this.vz * cosH;
    let vLat = this.vx * cosH - this.vz * sinH;
    const speed = Math.hypot(this.vx, this.vz);
    this.throttleIn = c.throttle;

    // ---- what we drive on ----
    const hw = t.hw[p.i]!;
    const ad = Math.abs(p.d);
    const kerbSide = p.d > 0 ? t.kerbL[p.i] : t.kerbR[p.i];
    let surf: number = ROAD_GROUND[t.surf[p.i] ?? Surf.Asphalt] ?? Ground_.Asphalt;
    this.onKerb = false;
    if (kerbSide && ad > hw - 0.55 && ad < hw + 0.9) {
      surf = Ground_.Kerb;
      this.onKerb = true;
    } else if (ad > hw + 0.45) surf = this.offroadAt ? this.offroadAt(this.x, this.z) : Ground_.Grass;
    this.surface = surf;
    const F = this.feel;
    const rough = surf >= Ground_.Grass && surf !== Ground_.Ice;
    // snow, ice and sand grip like tarmac for a body that has `loose` (the snowmobile)
    const soft = F.loose > 0 && (surf === Ground_.Snow || surf === Ground_.Sand || surf === Ground_.Ice || surf === Ground_.DeepSnow || surf === Ground_.SoftSand);
    let mu = MU[surf]! * this.grip * (rough ? Math.sqrt(F.rough) : 1);
    if (soft) mu = lerp(mu, MU[Ground_.Asphalt]! * this.grip * 0.92, F.loose);
    const onGrass = surf === Ground_.Grass;
    let rollDecel = ((ROLL[surf]! + Math.abs(vLong) * ROLL_V[surf]!) * (this.roam && rough ? 0.55 : 1)) / (rough ? F.rough : 1) * (rough ? F.roll : 1);
    if (soft) rollDecel = lerp(rollDecel, ROLL[Ground_.Asphalt]! * 2, F.loose);
    if (onGrass && F.grass > 1) rollDecel /= F.grass * F.grass;

    // ---- steering: fewer degrees at speed, plus a hand catching slides ----
    const maxSteer = (0.62 * F.steer) / (1 + Math.abs(vLong) / 11);
    let target = clamp(c.steer, -1, 1) * maxSteer;
    const beta = Math.abs(vLong) > 3 ? Math.atan2(vLat, Math.abs(vLong)) * Math.sign(vLong) : 0;
    // the countersteer help backs off while the driver holds the wheel over, so the small slides of loose
    // ground don't steer the bend away from them; it comes back in full once the car really starts to spin
    const holdWheel = Math.abs(c.steer) * (1 - smooth(0.2, 0.4, Math.abs(beta)));
    const csHelp = c.handbrake ? 0.5 : 1.3 * (1 - 0.75 * holdWheel);
    target += clamp(beta * this.assist * csHelp, -0.32, 0.32);
    const rate = (3.2 + this.assist * 2) * F.steer;
    this.steerAngle += clamp(target - this.steerAngle, -rate * dt, rate * dt);
    const delta = this.steerAngle;

    // ---- gears, revs and the reverse gear ----
    if (!this.reverse) {
      if (c.brake > 0.2 && vLong < 0.8 && c.throttle < 0.1) {
        this.revHold += dt;
        if (this.revHold > 0.35) this.reverse = true;
      } else this.revHold = 0;
    } else if (c.throttle > 0.1 || (c.brake < 0.1 && vLong > 0.5)) {
      this.reverse = false;
      this.revHold = 0;
    }
    this.shiftT = Math.max(0, this.shiftT - dt);
    this.launch = Math.max(0, this.launch - dt);
    this.ghost = Math.max(0, this.ghost - dt);
    this.limiterT = Math.max(0, this.limiterT - dt);
    this.perfectT = Math.max(0, this.perfectT - dt);
    const va = Math.abs(vLong);
    const bx = this.box;
    const top = bx.v.length;
    if (this.reverse) {
      this.gear = -1;
      this.rpm = damp(this.rpm, 1100 + (va / 9) * 4200 + c.brake * 900, 10, dt);
    } else {
      if (this.gear < 1) this.gear = 1;
      if (this.gear > top) this.gear = top;
      if (!this.air && !frozen) {
        if (this.manual) {
          // the player's shift buttons (the revs decide whether it was a good one); a lone press is one shift
          if (c.shift) this.shiftGear(c.shift > 0 ? 1 : -1);
        } else {
          const g = autoGear(bx, this.gear, va);
          if (g > this.gear && this.shiftT <= 0) {
            this.gear = g;
            this.shiftT = bx.shiftTime;
            this.shifted = 1;
          } else if (g < this.gear) {
            this.gear = g;
            this.shifted = -1;
          }
        }
      }
      const wheel = wheelRpm(bx, this.gear, va);
      let want = Math.max(wheel, IDLE);
      // the slipping clutch lets the engine rev up from a standstill, the more the lower the gear
      want = Math.max(want, IDLE + c.throttle * launchRpm(this.gear));
      if (this.air || frozen) want = IDLE + c.throttle * (REDLINE + 200 - IDLE);
      want += this.wheelspin * 1800;
      // the rev limiter: in any gear but the last one, the engine cuts out and bounces on it
      if (!this.air && !frozen && this.gear < top && wheel >= REDLINE && c.throttle > 0.3 && this.limiterT <= 0) this.limiterT = 0.1;
      if (this.limiterT > 0) want = REDLINE * (this.limiterT > 0.05 ? 1.03 : 0.9);
      this.rpm = damp(this.rpm, Math.min(want, REDLINE + 250), frozen || this.air ? 7 : this.limiterT > 0 ? 40 : 16, dt);
    }

    if (frozen) {
      this.vx = this.vz = 0;
      this.yawRate = 0;
      this.speed = 0;
      this.vLong = this.vLat = 0;
      return;
    }

    // ---- loads with weight transfer ----
    const nf0 = (MASS * G * CG_R) / WB;
    const nr0 = (MASS * G * CG_F) / WB;
    const dn = (MASS * clamp(this.accLong, -12, 12) * CG_H) / WB;
    const nf = Math.max(0.3 * nf0, nf0 - dn);
    const nr = Math.max(0.3 * nr0, nr0 + dn);
    const frontMax = mu * nf * 0.97;
    const rearMax = mu * nr * 1.05;

    let fx = 0;
    let fy = 0;
    let torque = 0;
    this.braking = false;
    if (!this.air) {
      // longitudinal requests
      let drive = 0;
      let brake = 0;
      if (this.reverse) {
        drive = -c.brake * 3800 * (vLong > -9 ? 1 : 0.15);
        brake = c.throttle * 9000;
      } else {
        drive = c.throttle * Math.min(7600 * this.boost * F.punch, (this.power * this.boost) / Math.max(4, va));
        // a heavy body gets going slowly; a top speed (moped, tractor) fades the push out just under it
        if (F.mass > 1) drive *= Math.pow(F.mass, -0.3);
        if (F.top > 0) {
          const top = F.top * (onGrass ? F.grass : 1);
          drive *= clamp((top * this.topK * this.boost - va) / (top * 0.12), 0, 1);
        }
        if (this.shiftT > 0) drive *= 0.3;
        // the engine: it bogs when the revs are low (a gear too high), is cut by the limiter and kicks after a perfect shift
        drive *= this.limiterT > 0 ? 0.08 : pushK(bx, this.gear, va, c.throttle);
        if (this.perfectT > 0) drive *= 1 + PERFECT_PUSH * (this.perfectT / PERFECT_TIME);
        if (this.launch > 0) drive *= 1.4;
        brake = c.brake * 13500 * this.brakeMul;
        // engine braking when lifting
        if (c.throttle < 0.05 && va > 1) brake += 650 * this.engineBrake * (this.manual ? 0.5 + wheelFrac(bx, this.gear, va) : 1);
      }
      this.braking = c.brake > 0.1 && !this.reverse && vLong > 1;
      const dirSign = vLong >= 0 ? 1 : -1;
      // stop cleanly instead of jittering about zero
      const stopCap = (MASS * va) / dt;
      brake = Math.min(brake, stopCap);
      let fxF = -dirSign * brake * 0.62;
      let fxR = drive - dirSign * brake * 0.38;
      if (c.handbrake && va > 0.5) fxR -= dirSign * Math.min(0.8 * rearMax, stopCap * 0.5);
      // traction control (and wheelspin when it is overwhelmed); it only hands the engine the grip the
      // cornering leaves over, or on loose ground the throttle would take all the rear grip and the car slide wide
      const latUse = Math.min(Math.abs(this.fyRear), rearMax * 0.9);
      const tcCap = Math.sqrt(rearMax * rearMax - latUse * latUse) * this.traction;
      this.wheelspin = drive > tcCap ? clamp((drive - tcCap) / (rearMax * 0.4), 0, 1) : 0;
      if (Math.abs(fxR) > tcCap && !c.handbrake) fxR = Math.sign(fxR) * tcCap;
      // ABS: while the wheel is turned, the front brakes leave the tyres grip to steer with
      const steerUse = 0.8 * Math.abs(c.steer);
      const frontBrake = frontMax * 0.95 * Math.sqrt(1 - steerUse * steerUse);
      fxF = clamp(fxF, -frontBrake, frontBrake);
      // and the rear ones don't lock the back end into a spin
      if (!c.handbrake && brake > 0 && Math.sign(fxR) === -dirSign) {
        const rearBrake = rearMax * (1 - 0.7 * Math.abs(c.steer));
        fxR = clamp(fxR, -rearBrake, rearBrake);
      }
      fxR = clamp(fxR, -rearMax, rearMax);

      // lateral: slip angles (front in the wheel's own frame, so reversing works too)
      const vfx = vLong;
      const vfy = vLat + CG_F * this.yawRate;
      const cd = Math.cos(delta);
      const sd = Math.sin(delta);
      const vwl = vfx * cd + vfy * sd;
      const vwt = -vfx * sd + vfy * cd;
      const af = Math.atan2(vwt, Math.max(Math.abs(vwl), 3.5));
      const ar = Math.atan2(vLat - CG_R * this.yawRate, Math.max(va, 3.5));
      const capF = Math.sqrt(Math.max(0, frontMax * frontMax - fxF * fxF));
      let capR = Math.sqrt(Math.max(0, rearMax * rearMax - fxR * fxR));
      capR = Math.max(capR, rearMax * 0.25);
      if (c.handbrake && va > 2) capR *= 0.5;
      // the limousine: once the tail has stepped out, the grip stays gone and it slides on
      if (F.slide > 0) capR *= 1 - 0.5 * F.slide * smooth(0.12, 0.45, this.rearSlip);
      const fyF = -capF * tyre(af, 11);
      const fyR = -capR * tyre(ar, 14);
      this.fyRear = fyR;
      this.frontSlip = clamp((Math.abs(af) - 0.13) / 0.22, 0, 1);
      this.rearSlip = clamp((Math.abs(ar) - 0.1) / 0.2, 0, 1);

      // front wheel force into the car's frame
      const ffx = fxF * cd - fyF * sd;
      const ffy = fxF * sd + fyF * cd;
      fx = ffx + fxR;
      fy = ffy + fyR;
      torque = CG_F * ffy - CG_R * fyR;
      // rolling resistance and drag
      fx -= dirSign * Math.min(rollDecel * MASS, stopCap * 0.5);
      // slopes: gravity along the car
      fx -= MASS * G * Math.sin(this.slopePitch);
      fy -= MASS * G * Math.sin(this.slopeRoll) * 0.6;
    }
    fx -= DRAG * F.drag * vLong * Math.abs(vLong);
    fy -= DRAG * 2 * vLat * Math.abs(vLat);

    const axl = fx / MASS;
    const ayl = fy / MASS;
    this.vx += (axl * sinH + ayl * cosH) * dt;
    this.vz += (axl * cosH - ayl * sinH) * dt;
    if (!this.air) this.yawRate += (torque / (IZ * F.yaw)) * dt;
    else this.yawRate *= Math.exp(-dt * 0.8);
    this.accLong = damp(this.accLong, axl, 6, dt);
    this.accLat = damp(this.accLat, ayl, 6, dt);
    // two-wheelers lean into the bend: as far as the sideways pull says, and a bit more for the look
    const leanTo = F.lean > 0 && !this.air ? -clamp(Math.atan(this.accLat / G) * 1.25, -0.7, 0.7) * F.lean : 0;
    this.lean = damp(this.lean, leanTo, 9, dt);

    // ---- low speed: roll like a toy car instead of sliding ----
    vLong = this.vx * sinH + this.vz * cosH;
    vLat = this.vx * cosH - this.vz * sinH;
    if (!this.air) {
      const kin = smooth(1.2, 6, Math.abs(vLong));
      const yawKin = (vLong * Math.tan(delta)) / WB;
      this.yawRate = lerp(yawKin, this.yawRate, kin);
      vLat *= Math.exp(-dt * 10 * (1 - kin));
      // a hand on the wheel: catch a slide unless the handbrake is pulled
      if (!c.handbrake && Math.abs(vLong) > 4) {
        const b = Math.atan2(vLat, Math.abs(vLong));
        const want = yawKin;
        const k = this.assist * 7 * smooth(0.06, 0.35, Math.abs(b)) * (1 - 0.85 * F.slide);
        this.yawRate += (want - this.yawRate) * (1 - Math.exp(-dt * k));
      }
      this.vx = vLong * sinH + vLat * cosH;
      this.vz = vLong * cosH - vLat * sinH;
    }

    this.heading = wrapAngle(this.heading + this.yawRate * dt);
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // ---- where are we now; walls ----
    t.project(this.x, this.z, p.i, p);
    this.walls();

    // ---- up and down: stick to the ground unless it falls away faster than gravity ----
    const gNew = this.groundAt(this.x, this.z, ground);
    // the ground's own rise and fall under the wheels, smoothed so that seams in the ground are no ramps
    this.groundVy = damp(this.groundVy, clamp((gNew - this.ground) / dt, -15, 15), 30, dt);
    const gVel = this.groundVy;
    this.ground = gNew;
    this.vy -= G * this.gravity * dt;
    this.y += this.vy * dt;
    if (this.y <= gNew) {
      if (this.air && this.airT > 0.15) this.landed = Math.max(this.landed, Math.max(0, gVel - this.vy));
      this.y = gNew;
      this.vy = Math.max(this.vy, Math.min(gVel, 10));
      this.air = false;
      this.airT = 0;
    } else if (this.y > gNew + 0.12) {
      this.air = true;
      this.airT += dt;
    }
    this.speed = Math.hypot(this.vx, this.vz);
    this.vLong = vLong;
    this.vLat = vLat;
    this.wheelRot += (vLong / 0.34) * dt;
    if (!(c.handbrake && !this.air)) this.rearRot += (vLong / 0.34) * dt + this.wheelspin * 30 * dt;
    const slide = Math.max(this.frontSlip * 0.7, this.rearSlip, c.handbrake && va > 4 ? 0.8 : 0, this.wheelspin * 0.9);
    this.slip = this.air ? 0 : slide * smooth(2.5, 7, this.speed + this.wheelspin * 8);
  }

  /** Keep inside the fences: push back, bounce gently, turn along the fence. */
  private walls(): void {
    const t = this.track;
    const p = this.proj;
    const th = Math.atan2(t.tx[p.i]!, t.tz[p.i]!);
    const rel = wrapAngle(this.heading - th);
    const reach = (this.feel.halfW + this.feel.halfL * Math.abs(Math.sin(rel))) * this.size;
    if (this.roam) {
      this.roamWalls(th, reach);
      return;
    }
    const wl = t.at(t.wallL, p.s) - reach;
    const wr = t.at(t.wallR, p.s) - reach;
    let over = 0;
    if (p.d > wl) over = p.d - wl;
    else if (p.d < -wr) over = p.d + wr;
    if (over === 0) return;
    this.bounce(over, th, over > 0 ? t.fenceL[p.i]! : t.fenceR[p.i]!);
  }

  /** Free roam: stone walls and bridge rails are thin walls the car bumps into from either side. */
  private roamWalls(th: number, reach: number): void {
    const t = this.track;
    const p = this.proj;
    const side = p.d > 0 ? 1 : -1;
    const kind = side > 0 ? t.fenceL[p.i]! : t.fenceR[p.i]!;
    const prev = this.prevD;
    this.prevD = p.d;
    if (kind !== Fence.Stone && kind !== Fence.Rail) return;
    // the bridge deck is the road: only its rails count, and only near the deck
    const w = side > 0 ? t.at(t.wallL, p.s) : t.at(t.wallR, p.s);
    const ad = Math.abs(p.d);
    if (ad < w - reach || ad > w + reach) return;
    const inside = Math.sign(prev) !== side || Math.abs(prev) < w;
    const target = inside ? w - reach : w + reach;
    const over = (ad - target) * side;
    if (inside ? ad <= target : ad >= target) return;
    this.bounce(over, th, kind);
  }

  /** Push the car `over` metres back towards the centre line (negative: away from it) and bounce. */
  private bounce(over: number, th: number, kind: number): void {
    const t = this.track;
    const p = this.proj;
    const lx = t.tz[p.i]!;
    const lz = -t.tx[p.i]!;
    this.x -= lx * over;
    this.z -= lz * over;
    p.d -= over;
    const sg = Math.sign(over);
    const vn = (this.vx * lx + this.vz * lz) * sg;
    if (vn > 0) {
      this.vx -= lx * sg * vn * 1.3;
      this.vz -= lz * sg * vn * 1.3;
      const keep = Math.max(0.6, 1 - (0.1 * vn) / Math.max(this.speed, 1));
      this.vx *= keep;
      this.vz *= keep;
      let dh = wrapAngle(th - this.heading);
      if (Math.abs(dh) > Math.PI / 2) dh = wrapAngle(dh + Math.PI);
      this.yawRate = this.yawRate * 0.35 + dh * Math.min(3, vn * 0.4);
      if (vn > this.wallHit) {
        this.wallHit = vn;
        this.wallKind = kind;
      }
    }
  }

  /** Once per frame: slopes under the car and the suspension bounce. */
  settle(dt: number, ground: Ground): void {
    const sinH = Math.sin(this.heading);
    const cosH = Math.cos(this.heading);
    const q: Proj = { i: 0, u: 0, s: 0, d: 0 };
    const h = (fwd: number, left: number): number => {
      const x = this.x + sinH * fwd + cosH * left;
      const z = this.z + cosH * fwd - sinH * left;
      this.track.project(x, z, this.proj.i, q);
      return this.groundAt(x, z, ground, q);
    };
    const hf = h(1.3, 0);
    const hb = h(-1.3, 0);
    const hl = h(0, 0.85);
    const hr = h(0, -0.85);
    const pitch = Math.atan2(hf - hb, 2.6);
    const roll = Math.atan2(hl - hr, 1.7);
    if (!this.air) {
      this.slopePitch = damp(this.slopePitch, pitch, 14, dt);
      this.slopeRoll = damp(this.slopeRoll, roll, 14, dt);
    }
    // spring
    if (this.landed > 0) this.suspV -= Math.min(4, this.landed * 0.5);
    if (this.onKerb && this.speed > 4) this.suspV += (Math.random() - 0.5) * 0.9;
    if (this.surface === Ground_.Gravel && this.speed > 4) this.suspV += (Math.random() - 0.5) * 0.25;
    if (this.surface === Ground_.Grass && this.speed > 3) this.suspV += (Math.random() - 0.5) * 0.5;
    this.suspV += (-this.susp * 160 - this.suspV * 11) * dt;
    this.susp = clamp(this.susp + this.suspV * dt, -0.22, 0.18);
  }
}

/** What the hardest contact of a bump between two cars looked like, for the damage and the sparks. */
export interface HitInfo {
  /** The impulse (mass times speed change) of the hardest contact. */
  j: number;
  /** How fast each car was driving into the other (m/s). */
  closeA: number;
  closeB: number;
  /** Where they met. */
  x: number;
  z: number;
  y: number;
}

const hitInfo: HitInfo = { j: 0, closeA: 0, closeB: 0, x: 0, z: 0, y: 0 };

/**
 * Bump cars apart: two circles per car, impulses weighted by mass (a tractor shoves, a moped bounces off), a
 * little spin from off-centre hits, and a push of its own from a car with ram power. Cars that are ghosts or
 * tumbling pass through, but are eased apart so nobody ends up inside another car when it wears off.
 */
export function collideCars(cars: Car[], onHit: (a: number, b: number, j: number, info: HitInfo) => void): void {
  for (let i = 0; i < cars.length; i++)
    for (let k = i + 1; k < cars.length; k++) {
      const a = cars[i]!;
      const b = cars[k]!;
      const soft = a.ghost > 0 || b.ghost > 0 || a.tumbleT > 0.35 || b.tumbleT > 0.35;
      const dx0 = b.x - a.x;
      const dz0 = b.z - a.z;
      const reach = 25 * Math.max(a.size, b.size) ** 2;
      if (dx0 * dx0 + dz0 * dz0 > reach || Math.abs(a.y - b.y) > 2.5) continue;
      const fa = a.feel;
      const fb = b.feel;
      const ma = fa.mass;
      const mb = fb.mass;
      const rr = (fa.bumpR * a.size + fb.bumpR * b.size) * 1.0;
      let hit = 0;
      hitInfo.j = 0;
      for (const oa0 of [-fa.bumpAt, fa.bumpAt])
        for (const ob0 of [-fb.bumpAt, fb.bumpAt]) {
          const oa = oa0 * a.size;
          const ob = ob0 * b.size;
          const ax = a.x + Math.sin(a.heading) * oa;
          const az = a.z + Math.cos(a.heading) * oa;
          const bx = b.x + Math.sin(b.heading) * ob;
          const bz = b.z + Math.cos(b.heading) * ob;
          let nx = bx - ax;
          let nz = bz - az;
          const dist = Math.hypot(nx, nz);
          if (dist >= rr || dist < 1e-4) continue;
          nx /= dist;
          nz /= dist;
          const depth = rr - dist;
          if (soft) {
            // a ghost drifts out of whoever it overlaps: a slow nudge, no impulse
            const nudge = depth * 0.06;
            if (a.ghost > 0) {
              a.x -= nx * nudge;
              a.z -= nz * nudge;
            }
            if (b.ghost > 0) {
              b.x += nx * nudge;
              b.z += nz * nudge;
            }
            continue;
          }
          // the heavy one barely gives way
          const wa = mb / (ma + mb);
          const wb = ma / (ma + mb);
          a.x -= nx * depth * wa;
          a.z -= nz * depth * wa;
          b.x += nx * depth * wb;
          b.z += nz * depth * wb;
          // contact point velocities (with spin)
          const cx = (ax + bx) / 2;
          const cz = (az + bz) / 2;
          const rax = cx - a.x;
          const raz = cz - a.z;
          const rbx = cx - b.x;
          const rbz = cz - b.z;
          const vax = a.vx + a.yawRate * raz;
          const vaz = a.vz - a.yawRate * rax;
          const vbx = b.vx + b.yawRate * rbz;
          const vbz = b.vz - b.yawRate * rbx;
          const vrel = (vbx - vax) * nx + (vbz - vaz) * nz;
          if (vrel >= 0) continue;
          // an impulse between two masses; a little livelier than before so light cars bounce off heavy ones
          const j = (-(1 + 0.32) * vrel) / (1 / ma + 1 / mb);
          a.vx -= (j * nx) / ma;
          a.vz -= (j * nz) / ma;
          b.vx += (j * nx) / mb;
          b.vz += (j * nz) / mb;
          const closeA = Math.max(0, vax * nx + vaz * nz);
          const closeB = Math.max(0, -(vbx * nx + vbz * nz));
          // ram power: the rammer's own extra shove into whoever it hits
          if (a.ram > 1 && closeA > 1) {
            const push = (0.3 * (a.ram - 1) * closeA * 2 * ma) / (ma + mb);
            b.vx += nx * push;
            b.vz += nz * push;
          }
          if (b.ram > 1 && closeB > 1) {
            const push = (0.3 * (b.ram - 1) * closeB * 2 * mb) / (ma + mb);
            a.vx -= nx * push;
            a.vz -= nz * push;
          }
          const spin = 0.22 * (MASS / IZ);
          // torque = J · perp(r), perp(x, z) = (z, −x)
          a.yawRate += ((-j * nx * raz + j * nz * rax) * spin) / (ma * fa.yaw);
          b.yawRate += ((j * nx * rbz - j * nz * rbx) * spin) / (mb * fb.yaw);
          // what the lighter one feels, as a speed change
          const h = j / Math.min(ma, mb);
          if (h > hit) {
            hit = h;
            hitInfo.j = j;
            hitInfo.closeA = closeA;
            hitInfo.closeB = closeB;
            hitInfo.x = cx;
            hitInfo.z = cz;
            hitInfo.y = (a.y + b.y) / 2;
          }
        }
      if (hit > 0.3) onHit(i, k, hit, hitInfo);
    }
}
