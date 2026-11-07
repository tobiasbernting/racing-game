// Galna Rallyt: a little 3D racing game round the farm (and six other courses). Laps against farm
// animals in rally cars: countdown lights, live positions, a minimap, confetti at the end.
//
// A race is opened with RallyOptions (options.ts): the course, the rules (laps, computer cars, difficulty,
// time of day, rain, damage, nitro, pickups) and the player's car. It reports the outcome through
// options.onDone (placing, time, kronor) before ctx.end. Without options it plays the default race.
import * as THREE from 'three';
import { CAR_BODIES, CAR_BODY_DEFS, NITRO_SECONDS, RACE_DNF_PRIZE, cleanRules, newCar, raceMedal, racePrize, type CarBody, type GarageCar } from '../shared/rally.ts';
import { Loop } from '../arcade/kit.ts';
import { CAR_BODY_NAMES } from '../shared/names.ts';
import { rivalById, rivalCast } from '../shared/rivals.ts';
import { LASTLAP_BOOST, catchUpBoost, easeOff, type RivalSpec } from '../shared/field.ts';
import { KIND_AGGRO, pointsTable, type RaceKind } from '../shared/kinds.ts';
import { BIG_HIT, RESPAWN_HP, TakedownLedger, WRECK_SECONDS, impactDamage, maxHpOf, ramPowerOf } from './combat.ts';
import type { GameContext, GameInstance } from '../arcade/types.ts';
import { Driver, steerTo, type Aim } from './ai.ts';
import { RallyAudio } from './audio.ts';
import { BASE_POWER, Car, collideCars, Ground_, type Controls, type HitInfo } from './car.ts';
import { courseFor } from './variant.ts';
import { canRain, variationFor } from '../shared/variation.ts';
import { Coins } from './coins.ts';
import { Confetti, Particles, Skids } from './fx.ts';
import { settings } from '../settings.ts';
import { blobTex } from './geo.ts';
import { Hud, type Racer } from './hud.ts';
import { lakeDist } from './layout.ts';
import { carModel, type CarModel, type Driver as Face } from './models.ts';
import { MAX_CHARGES, MAX_NITRO_SECONDS, capGrip, capPower, emptyStats, noMods, type FinishAdjust, type FinishInfo, type RaceApi, type TickState } from './mods.ts';
import { Obstacles } from './obstacles.ts';
import { rallyOptions } from './options.ts';
import { buildPickups, pickupAt, placePickups, type Pickup, type PickupMeshes } from './pickups.ts';
import { buildThemeScenery, Weather } from './props.ts';
import { buildRoad, type Road } from './road.ts';
import { buildScenery, type Scenery } from './scenery.ts';
import { buildSky, rainy, type Sky } from './sky.ts';
import { Terrain, buildFields, buildWater, type Water } from './terrain.ts';
import { Fence, Track } from './track.ts';
import { aiCar, arcadeCar, damageGrip, damagePower, rivalBody, rivalFeel, seededUnit, smokeColor, tuneFor, type Tune } from './tuning.ts';
import { clamp, damp, fmtTime, lerp, ordinal, smooth, wrapAngle } from './util.ts';

const CAMS = ['Bakom bilen', 'På huven', 'Långt bakom'];
/** Seconds a bike lies on its side after a big crash (the rider somersaults for the first one). */
const TUMBLE_LEN = 1.5;

interface Entrant {
  /** Player id, or `ai:<n>` for a computer car. */
  id: string;
  /** What it drives (the player's can change with a trinket). */
  body: CarBody;
  /** Seconds left in a comic tumble (bikes that took a big hit), and which way the rider flies. */
  tumbleT: number;
  tumbleDir: number;
  /** 0..1 after a smaller knock: the rider wobbles. */
  wobble: number;
  name: string;
  /** What this rival shouts when it passes the player. */
  taunt: string;
  color: string;
  car: Car;
  model: CarModel;
  ai: Driver | null;
  ctl: Controls;
  /** Distance raced along the centre line (continuous, negative on the grid). */
  u: number;
  lastS: number;
  rate: number;
  lapsDone: number;
  finished: boolean;
  finishTime: number;
  basePower: number;
  stuckT: number;
  offT: number;
  emit: number;
  tune: Tune;
  /** 0..100 */
  damage: number;
  /** Seconds left in a mud puddle's grip, and of a boost pad's shove (no re-trigger while on it). */
  mudT: number;
  padT: number;
  /** Seconds left flat as a pancake, or boosted / hopping as a boss rival. */
  squashT: number;
  squash: number;
  rivalBoostT: number;
  rivalNext: number;
  hopNext: number;
  /** The rival's kit (null for the player and for the old plain grid). */
  spec: RivalSpec | null;
  /** Blodbad: health, how long it is wrecked for, and the score. */
  hp: number;
  maxHp: number;
  wreckT: number;
  takedowns: number;
  wrecks: number;
  /** Seconds the grip is gone after an oil slick, and the next nitro and oil drop of a rival with those modifiers. */
  slickT: number;
  oilNext: number;
  nitroNext: number;
  /** Who this rival is going for, and when it decides again. */
  aimT: number;
  /** Seconds since the last hit on this car (for the boss that heals). */
  calmT: number;
}

/** Anyone on the track, for the standings, the minimap and the name tags. */
interface Runner {
  id: string;
  name: string;
  color: string;
  car: Car;
  u: number;
  finished: boolean;
  finishTime: number;
  me: boolean;
}

/** The skill of each grid slot; the names and faces come from the cast (shared/rivals.ts). */
const ROSTER: { name: string; face: Face; skill: number; power: number; bias: number; wobble: number }[] = [
  { name: '', face: 'cow', skill: 0.93, power: 1.0, bias: 0.3, wobble: 0.4 },
  { name: '', face: 'horse', skill: 0.91, power: 0.98, bias: -0.6, wobble: 0.8 },
  { name: '', face: 'pig', skill: 0.88, power: 0.96, bias: 0.9, wobble: 1.0 },
  { name: '', face: 'rooster', skill: 0.86, power: 0.94, bias: -1.0, wobble: 1.2 },
  { name: '', face: 'sheep', skill: 0.83, power: 0.91, bias: 0.2, wobble: 0.9 },
];
const PALETTE = ['#2f6fe0', '#f4c20d', '#2fa84f', '#8a4fd8', '#ff8a1f', '#e8412c', '#18b7c9', '#f06ba8', '#f2f2f2'];
/** Difficulty: the computer cars' courage and how hard the rubber band pulls. */
const DIFF = { easy: { skill: 0.88, power: 0.96, band: 1.35 }, normal: { skill: 1, power: 1, band: 1 }, hard: { skill: 1.06, power: 1.03, band: 0.6 } } as const;

/** What one coin on the road is worth (before trinkets). */
const COIN_KR = 1.2;

/** Opponent colours as far from the player's as possible. */
function pickColors(player: string, n: number): string[] {
  const pc = new THREE.Color(player);
  const ph = pc.getHSL({ h: 0, s: 0, l: 0 });
  const scored = PALETTE.map((c) => {
    const h = new THREE.Color(c).getHSL({ h: 0, s: 0, l: 0 });
    let dh = Math.abs(h.h - ph.h);
    dh = Math.min(dh, 1 - dh);
    const d = dh * 2 + Math.abs(h.l - ph.l) * 0.6 + Math.abs(h.s - ph.s) * 0.3;
    return { c, d };
  });
  return scored
    .filter((s) => s.d > 0.12)
    .sort((a, b) => b.d - a.d)
    .slice(0, n)
    .map((s) => s.c);
}

/** The body a rival of this temper drives: rammers like heavy things, racers quick light ones. */
function archetypeBody(seed: number, k: number, spec: RivalSpec): CarBody {
  const table: Record<string, [CarBody, number][]> = {
    rammer: [['pickup', 2], ['tractor', 1.4], ['hatch', 1], ['monster', spec.role === 'rival' ? 0.3 : 0.9], ['sofa', 0.5]],
    racer: [['coupe', 2], ['buggy', 1.5], ['moto', 1.2], ['atv', 1], ['hatch', 1]],
    mixed: [['hatch', 2], ['buggy', 1], ['pickup', 1], ['coupe', 1], ['atv', 1], ['moped', 0.5], ['sofa', 0.5]],
  };
  const list = table[spec.archetype]!;
  let x = seededUnit(seed, k + 40) * list.reduce((a, [, w]) => a + w, 0);
  for (const [b, w] of list) {
    x -= w;
    if (x < 0) return b;
  }
  return 'hatch';
}

const nextFrame = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Test hooks, only in a dev build: ?rallydebug, ?rallyauto, ?rallyturbo, ?rallyskip, ?rallyat, ?rallycam, ?rallygo, ?rallylaps. */
const Q = new URLSearchParams(import.meta.env.DEV && typeof location !== 'undefined' ? location.search : '');
const DEBUG = Q.has('rallydebug');
const AUTO = Q.has('rallyauto') ? Number(Q.get('rallyauto')) || 0.9 : 0;
const TURBO = Math.max(1, Math.min(30, Number(Q.get('rallyturbo')) || 1));
const TONE = Q.get('rallytone');
const SKIP = Math.max(1, Number(Q.get('rallyskip')) || 1);
const AT = Q.has('rallyat') ? Number(Q.get('rallyat')) : NaN;
const CAM0 = Number(Q.get('rallycam')) || 0;
const GO = Q.has('rallygo');
const LAPS_Q = Math.max(1, Math.min(9, Number(Q.get('rallylaps')) || 3));

const rally = (ctx: GameContext): GameInstance => {
  const high = ctx.quality === 'high';
  let destroyed = false;
  let paused = false;
  let loop: Loop | null = null;

  // ---- what we are playing ----
  const opts = rallyOptions(ctx.options);
  const rules = opts ? cleanRules(opts.rules) : null;
  const kind: RaceKind = rules?.kind ?? 'rally';
  const field = opts?.field ?? null;
  /** Blodbad: health bars, wrecks and takedowns. */
  const carnage = !!opts && kind === 'carnage';
  // the same course never plays the same twice: the seed mirrors it, turns it round, thins or crowds the props
  const vary = opts && rules ? variationFor(rules.course, opts.seed ?? 20261030) : null;
  const course = courseFor(rules?.course ?? 'farm', vary, field?.narrow ?? 1);
  const LAPS = rules ? rules.laps : LAPS_Q;
  const rain = rules?.weather === 'rain' && canRain(course.id);
  const timeOfDay = rules?.time ?? 'day';
  const night = course.theme.alwaysNight || timeOfDay === 'night';
  const rainGrip = rain ? 0.85 : 1;
  const diff = DIFF[rules?.difficulty ?? 'normal'];
  // contact damage on the plating: none in Blodbad (that has health), light in Rally, full in Blandat
  const damageK = rules?.damage && !carnage ? (kind === 'rally' ? 0.6 : 1) : 0;
  const myCar: GarageCar = opts?.car ?? arcadeCar(ctx.player.color);
  const nAi = rules ? rules.ai : ROSTER.length;
  // the run's trinkets (mods.ts): static numbers now, hooks while the race runs
  const mods = opts?.mods ?? noMods();
  const mt = mods.tune;
  const twist = opts?.twist ?? null;
  /** The handling a body gets from the player's parts and trinkets (the body can change mid-race with a trinket). */
  const tuneForBody = (body: CarBody): Tune => {
    const t = tuneFor({ ...myCar, body }, !!rules?.sameCars, !!rules?.nitro);
    t.power = capPower(t.power * mt.power);
    t.grip = capGrip(t.grip * mt.grip);
    t.size *= mt.size;
    t.dmgMul *= mt.tough;
    if (rules?.nitro) t.charges = Math.min(MAX_CHARGES, Math.round(t.charges + mt.charges));
    return t;
  };
  const myTune = tuneForBody(myCar.body);
  /** How a body drives: levelled in a fair race, steadier with a sidecar. */
  const feelOf = (body: CarBody, mine: boolean, spec: RivalSpec | null = null) => {
    if (!mine) {
      const f = rivalFeel(body);
      return spec ? { ...f, mass: f.mass * spec.mass, slip: f.slip * spec.slip } : f;
    }
    const f = (rules?.sameCars ? CAR_BODY_DEFS.hatch : CAR_BODY_DEFS[body]).feel;
    if (mt.sidecar && body === 'moto') return { ...f, two: false, lean: 0.2, mass: f.mass * 1.7, steer: 0.95, yaw: 1.05, halfW: 0.95, bumpR: 0.8, bumpAt: 0.85 };
    return f;
  };
  // however many charges, a race never has more than MAX_NITRO_SECONDS of nitro in all
  const nitroLen = Math.min(NITRO_SECONDS * mt.nitroSeconds, MAX_NITRO_SECONDS / Math.max(1, myTune.charges));
  const nitroPush = 1 + 0.45 * mt.nitroPower;

  const track = new Track(course, rainGrip);
  const hud = new Hud(ctx.root, track, ctx.dpr, ctx.touch);
  // on touch screens the third round button is the camera when there is no nitro (info.ts): no second 🎥 then
  hud.camBtn.classList.toggle('show', ctx.touch && myTune.charges > 0);
  hud.setTrinkets(mods.items);
  hud.disco(mt.disco);
  const audio = new RallyAudio(ctx.audio, ctx.out);
  const skyPreset = rain ? rainy(course.theme.sky[timeOfDay]) : course.theme.sky[timeOfDay];

  // ---- renderer ----
  const renderer = new THREE.WebGLRenderer({ antialias: high && ctx.dpr < 1.6, powerPreference: 'high-performance' });
  renderer.setPixelRatio(ctx.dpr);
  renderer.toneMapping = TONE === 'aces' ? THREE.ACESFilmicToneMapping : TONE === 'agx' ? THREE.AgXToneMapping : THREE.NeutralToneMapping;
  renderer.toneMappingExposure = skyPreset.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = high;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
  ctx.root.prepend(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 5200);
  let W = 1;
  let H = 1;
  const fit = (): void => {
    const r = ctx.root.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(fit);
  ro.observe(ctx.root);
  fit();

  // ---- the world, built over a few frames behind a loading card ----
  let sky: Sky;
  let terrain: Terrain;
  let road: Road;
  let water: Water;
  let scenery: Scenery;
  let particles: Particles;
  /** The green gas clouds: never faded out in front of the chase camera, so the cloud behind your own car shows. */
  let gasFx: Particles;
  let skids: Skids;
  let confetti: Confetti;
  let weather: Weather | null = null;
  let coins: Coins | null = null;
  const obstacles = new Obstacles();
  let pickups: Pickup[] = [];
  let pickupMeshes: PickupMeshes | null = null;
  let shadowTex: THREE.Texture;
  const timeU = { value: 0 };
  const entrants: Entrant[] = [];
  /** Every car on the track this frame (refilled each frame). */
  const carsBuf: Car[] = [];
  const disposers: (() => void)[] = [];
  const ground = { height: (x: number, z: number): number => terrain.height(x, z) };
  let meE: Entrant | null = null;
  const headlights: THREE.SpotLight[] = [];

  /** What lies off the road on this course. */
  const offroad = (): ((x: number, z: number) => number) | null => {
    if (course.theme.scenery === 'ice') return (x, z) => (lakeDist(x, z, course.layout) < 1.0 ? Ground_.Ice : Ground_.DeepSnow);
    if (course.theme.scenery === 'beach' || course.theme.scenery === 'desert') return () => Ground_.SoftSand;
    // dust on the moon and ash round the volcano: loose, but not deep
    if (course.theme.scenery === 'moon' || course.theme.scenery === 'volcano') return () => Ground_.Sand;
    return null;
  };

  const modelFor = (car: GarageCar, driver?: Face, sidecar = false): CarModel => {
    const m = carModel({ body: car.body, style: car.style, driver, shadowTex, envMap: sky.env, quality: ctx.quality, sidecar });
    m.setDamage(car.damage ?? 0);
    m.setNight(night);
    scene.add(m.root, m.shadow);
    return m;
  };

  const build = async (): Promise<void> => {
    sky = buildSky(renderer, ctx.quality, skyPreset);
    scene.add(sky.mesh, sky.sun, sky.sun.target, sky.hemi);
    scene.fog = sky.fog;
    scene.background = sky.fog.color.clone();
    disposers.push(() => sky.dispose());
    hud.progress(0.15);
    await nextFrame();
    if (destroyed) return;
    terrain = new Terrain(track, ctx.quality, course);
    scene.add(terrain.mesh);
    disposers.push(() => terrain.dispose());
    hud.progress(0.4);
    await nextFrame();
    if (destroyed) return;
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    road = buildRoad(track, terrain, ctx.quality, aniso, course, { wet: rain || course.theme.lit, envMap: sky.env, grid: Math.max(6, 1 + nAi) });
    scene.add(road.group);
    disposers.push(() => road.dispose());
    for (const m of buildFields(terrain, ctx.quality)) {
      scene.add(m);
      disposers.push(() => {
        m.geometry.dispose();
        const mt = m.material as THREE.MeshLambertMaterial;
        mt.map?.dispose();
        mt.dispose();
      });
    }
    water = buildWater(sky.env, course.layout);
    for (const m of water.meshes) scene.add(m);
    disposers.push(() => water.dispose());
    hud.progress(0.6);
    await nextFrame();
    if (destroyed) return;
    scenery = course.id === 'farm' ? buildScenery(track, terrain, ctx.quality, timeU) : buildThemeScenery(track, terrain, course, ctx.quality, timeU, course.theme.lit || night, vary);
    scene.add(scenery.group);
    disposers.push(() => scenery.dispose());
    if (rain || course.theme.snow) {
      const w = (weather = new Weather(rain ? 'rain' : 'snow', ctx.quality));
      scene.add(w.object);
      disposers.push(() => w.dispose());
    }
    if (opts?.coins) {
      coins = new Coins(track, opts.seed ?? 20261030);
      scene.add(coins.mesh);
      disposers.push(() => coins?.dispose());
    }
    scene.add(obstacles.group);
    disposers.push(() => obstacles.dispose());
    if (twist?.hay) obstacles.placeHay(track, twist.hay, opts?.seed ?? 20261030);
    else if (field && field.hazards.hay) obstacles.placeHay(track, field.hazards.hay, opts?.seed ?? 20261030);
    if (field) obstacles.placeHazards(track, field.hazards, opts?.seed ?? 20261030);
    if (rules?.pickups) {
      pickups = placePickups(track, opts?.seed ?? 20261030);
      const pm = (pickupMeshes = buildPickups(track, pickups));
      scene.add(pm.group);
      disposers.push(() => pm.dispose());
    }
    hud.progress(0.85);
    await nextFrame();
    if (destroyed) return;
    // cars
    shadowTex = blobTex(64, 0.3);
    disposers.push(() => shadowTex.dispose());
    buildCars();
    particles = new Particles(high ? 1600 : 600);
    gasFx = new Particles(high ? 360 : 180, [3.5, 15]);
    skids = new Skids(high ? 3000 : 1200);
    confetti = new Confetti(high ? 420 : 200);
    scene.add(particles.points, gasFx.points, skids.mesh, confetti.mesh);
    disposers.push(
      () => particles.dispose(),
      () => gasFx.dispose(),
      () => skids.dispose(),
      () => confetti.dispose(),
    );
    if (night) addHeadlights();
    hud.progress(1);
    // warm up the shaders so the first frames do not stutter
    placeCamera(0);
    syncModels(0);
    renderer.compile(scene, camera);
    await nextFrame();
    if (destroyed) return;
    hud.ready();
    hud.setNitro(nitroLeft, myTune.charges, false);
    hud.setDamage(damageK > 0 ? meE!.damage : null);
    if (DEBUG) {
      // where the triangles go
      const tally: Record<string, number> = {};
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh && !(o as THREE.Points).isPoints) return;
        const g = m.geometry;
        if (!g) return;
        const tri = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
        const inst = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1;
        const key = `${o.parent === scene ? 'scene' : o.parent?.type}:${(o as THREE.InstancedMesh).isInstancedMesh ? 'inst' : 'mesh'}:${Math.round(tri)}`;
        tally[key] = (tally[key] ?? 0) + tri * inst;
      });
      const w = window as unknown as Record<string, unknown>;
      w.__rallyTris = Object.entries(tally)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
        .map(([k, v]) => `${k}=${Math.round(v)}`);
    }
    // test hooks (dev build only): crash the player's bike, honk, swap the vehicle
    if (DEBUG)
      (window as unknown as { __rallyDebug: unknown }).__rallyDebug = {
        tumble: () => knock(player(), 99, 1),
        honk: () => honk(player()),
        swap: (b: CarBody) => swapPlayerBody(b),
        /** Wreck the n-th rival at once, crediting the player with the takedown. */
        takedown: (n = 0) => {
          const v = entrants.filter((e) => e !== meE)[n];
          if (!v) return;
          ledger.hit(v.id, meE!.id, 20, timeU.value);
          damageHp(v, 9999, meE);
        },
        /** Take health off the n-th rival (or the player when n is -1). */
        hurt: (n: number, hp: number) => damageHp(n < 0 ? meE! : entrants.filter((e) => e !== meE)[n]!, hp, null),
      };
    loop = new Loop((dt) => {
      for (let k = 0; k < TURBO && !ended; k++) update(dt);
    }, render);
    if (paused) loop.pause();
    audio.music(0.6);
  };

  /** The grid: the computer cars, and me at the back. */
  function buildCars(): void {
    const colors = pickColors(ctx.player.color, ROSTER.length);
    const cast = rivalCast(opts?.seed ?? 20261030, ROSTER.length);
    const meId = 'me';
    const total = 1 + nAi;
    const mySlot = Math.min(4, nAi);
    let ai = 0;
    for (let slot = 0; slot < total; slot++) {
      const s = -11 - slot * 9;
      const d = slot % 2 ? -3.4 : 3.4;
      const isMe = slot === mySlot;
      const k = isMe ? -1 : ai++;
      const boss = !isMe && k === 0 ? twist?.boss : undefined;
      // with a field plan the kit (skill, upgrades, modifiers, temper) comes from it; without one the old roster
      const spec = isMe || !field ? null : field.rivals[k] ?? null;
      const rv = isMe ? null : spec && !spec.boss ? rivalById(spec.id) ?? cast[k]! : cast[k]!;
      const r0 = isMe ? null : { ...ROSTER[k]!, name: rv!.name, face: rv!.face as Face };
      // a boss takes the first rival's place with its own name, face, body and colour
      const r = r0 && boss ? { ...r0, name: boss.name, face: boss.face, skill: boss.skill, power: boss.power, bias: 0 } : r0;
      const color = isMe ? (opts ? myCar.style.paint : ctx.player.color) : boss ? boss.color : colors[k] ?? PALETTE[k]!;
      const body: CarBody = isMe ? myCar.body : boss ? boss.body : opts ? (spec ? archetypeBody(opts.seed ?? 20261030, k, spec) : rivalBody(opts.seed ?? 20261030, k)) : 'hatch';
      const gcar = isMe ? myCar : opts ? aiCar(k, color, r!.face, body) : arcadeCar(color);
      if (boss) gcar.style.number = 1;
      if (!isMe && !opts) gcar.style.number = k + 2;
      const model = modelFor(isMe || opts ? gcar : { ...gcar, body: 'hatch' }, isMe ? undefined : r!.face, isMe && mt.sidecar && body === 'moto');
      disposers.push(() => model.dispose());
      const car = new Car(track);
      car.setBody(body, feelOf(body, isMe, spec));
      car.place(s, d, ground);
      car.offroadAt = offroad();
      const kid = ctx.touch;
      let driver: Driver | null = null;
      let power = 1;
      const tune = isMe ? myTune : tuneFor(newCar(0, 'hatch', ''), false, false);
      if (r && spec) {
        // a rival with a kit: the skill and the upgrades of this point in the run (touch screens get a slightly kinder field)
        const kidK = kid ? (field!.calm ? 0.93 : 0.97) : 1;
        const sharp = field!.sharp;
        driver = new Driver({ skill: spec.skill * kidK, bias: r.bias * (1 - 0.5 * sharp), lineUse: spec.lineUse, wobble: r.wobble * (1 - 0.6 * sharp), phase: k * 1.7, late: spec.late });
        driver.p.aggro = spec.aggro;
        power = spec.power * (kid ? (field!.calm ? 0.92 : 0.97) : 1) * (twist?.rivalPower ?? 1) * lerp(1, CAR_BODY_DEFS[body].power, 0.5);
        car.assist = 0.75;
        car.size = 1 + (CAR_BODY_DEFS[body].size - 1) * 0.6;
        car.brakeMul = spec.brakes;
        car.ram = spec.ram;
        Object.assign(tune, { power: spec.power, grip: spec.grip, brakeMul: spec.brakes, dmgMul: spec.dmgTaken / CAR_BODY_DEFS[body].tough });
      } else if (r) {
        const skill = r.skill * (kid ? 0.93 : 1) * diff.skill * (twist?.rivalSkill ?? 1);
        driver = new Driver({ skill, bias: r.bias, lineUse: 0.85 + r.skill * 0.15, wobble: r.wobble, phase: k * 1.7 });
        power = r.power * (kid ? 0.92 : 1) * diff.power * (twist?.rivalPower ?? 1) * lerp(1, CAR_BODY_DEFS[body].power, 0.5);
        car.assist = 0.75;
        car.size = 1 + (CAR_BODY_DEFS[body].size - 1) * 0.6;
      } else {
        car.assist = (kid ? 0.75 : 0.45) + tune.assist;
        car.traction = kid ? 0.75 : 0.85;
        power = tune.power;
        car.grip = tune.grip;
        car.brakeMul = tune.brakeMul;
        car.size = tune.size;
        car.topK = mt.top;
        car.ram = ramPowerOf(mt.shove);
        model.root.scale.setScalar(mt.size);
      }
      car.power = BASE_POWER * power;
      // the moon is low gravity for everyone (and the trinkets float you further)
      car.gravity = (course.theme.gravity ?? 1) * (isMe ? mt.gravity : 1);
      const e: Entrant = {
        id: isMe ? meId : `ai:${k}`,
        body,
        tumbleT: 0,
        tumbleDir: 1,
        wobble: 0,
        name: isMe ? ctx.player.name || 'Du' : r!.name,
        taunt: boss ? '' : rv?.taunt ?? '',
        color,
        car,
        model,
        ai: driver,
        ctl: { throttle: 0, brake: 0, steer: 0, handbrake: false },
        u: s,
        lastS: car.proj.s,
        rate: 0,
        lapsDone: 0,
        finished: false,
        finishTime: 0,
        basePower: car.power,
        stuckT: 0,
        offT: 0,
        emit: 0,
        tune,
        damage: isMe ? clamp(myCar.damage ?? 0, 0, 100) : 0,
        mudT: 0,
        padT: 0,
        squashT: 0,
        squash: 0,
        rivalBoostT: 0,
        rivalNext: 4 + Math.random() * (twist?.rivalNitro ?? 0),
        hopNext: 3 + Math.random() * (twist?.rivalHop ?? 0),
        spec,
        hp: 0,
        maxHp: 0,
        wreckT: 0,
        takedowns: 0,
        wrecks: 0,
        slickT: 0,
        oilNext: 6 + Math.random() * 8,
        nitroNext: 5 + Math.random() * 6,
        aimT: Math.random() * 0.5,
        calmT: 9,
      };
      e.maxHp = maxHpOf(car.feel.mass, spec?.hp ?? 1) * (isMe ? 1 + 0.08 * (myCar.parts.armour ?? 0) : 1);
      e.hp = e.maxHp;
      if (isMe) meE = e;
      entrants.push(e);
    }
  }

  function addHeadlights(): void {
    const me = player();
    const spots = high ? me.model.headlights : [me.model.headlights.reduce((a, b) => a.clone().add(b), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, me.model.headlights.length))];
    for (const p of spots) {
      const l = new THREE.SpotLight('#fff1d0', high ? 160 : 260, 90, 0.55, 0.5, 1.2);
      l.position.copy(p);
      l.target.position.set(p.x * 0.6, -1.2, p.z + 22);
      me.model.root.add(l, l.target);
      headlights.push(l);
    }
  }

  const player = (): Entrant => meE!;

  // ---- race state ----
  type Phase = 'intro' | 'count' | 'race' | 'finish' | 'over';
  let phase: Phase = GO ? 'count' : 'intro';
  let phaseT = GO ? 2.99 : 0;
  let raceT = 0;
  let lastLight = -1;
  let camMode = CAM0;
  let camPress = false;
  let steerIn = 0;
  let thrIn = 0;
  let wrongT = 0;
  let wrongShown = false;
  let bestLap = Infinity;
  let lapStart = 0;
  let allDoneT = -1;
  let shake = 0;
  let cheerCd = 0;
  let thrPrev = false;
  let boosted = false;
  let place = 1;
  const wasAhead = new Map<string, boolean>();
  const ledger = new TakedownLedger();
  const pairCd = new Map<number, number>();
  const dbg = { contacts: 0, aims: 0, wrecks: 0, rivalTake: 0 };
  const tauntIds = new Map<string, number>();
  let tauntAt = -99;
  let ended = false;
  let finishPlace = 0;
  let finishTime = 0;
  let slowNote = 0;
  // nitro, drift boost and style points (the player only)
  let nitroLeft = myTune.charges;
  let nitroT = 0;
  // what the trinkets did, for the funny stats and the result
  const stats = emptyStats();
  let bonusKr = 0;
  let coinKr = 0;
  const lapTimes: number[] = [];
  let finishAdj: Required<FinishAdjust> = { kronor: 0, time: 0 };
  /** Extra boost from a trinket (seconds left, strength). */
  let extraBoostT = 0;
  let extraBoostK = 1;
  let hbPrev = false;
  let mudSaid = -9;
  let beatT = 0;
  const sayIds = new Map<string, number>();
  const drift = { on: false, t: 0, grace: 0, pts: 0, tier: 0 };
  let driftBoostT = 0;
  let stylePts = 0;
  /** The drift boost and style points only count when the race has options (rules and a car). */
  const tricksOn = !!opts;
  hud.camBtn.addEventListener('click', () => (camPress = true));

  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  let camYaw = 0;
  let camFov = 62;
  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();
  const colDust = new THREE.Color('#c9b48a');
  const colSnow = new THREE.Color('#f2f6fb');
  const colSand = new THREE.Color('#e2cc94');
  const colSmoke = new THREE.Color('#d9d6d0');
  // the dust a car kicks up has the colour of the ground it is on
  {
    const dust = ({ volcano: '#6a5a54', moon: '#8c8e96', desert: '#e8c47c', candy: '#f6d0e0', kitchen: '#fff2e0' } as Record<string, string | undefined>)[course.theme.scenery];
    if (dust) {
      colDust.set(dust);
      colSand.set(dust);
    }
  }
  const colMySmoke = new THREE.Color();
  const colGrass = new THREE.Color('#6f9a3f');
  const colGas = new THREE.Color('#7ee81c');
  const hotdogs = ['#c8402a', '#e9a23b', '#f4d27a', '#8a2f1c'].map((c) => new THREE.Color(c));
  const colDirt = new THREE.Color('#8a7350');
  const colMud = new THREE.Color('#5c4226');
  const colSkid = new THREE.Color('#16161a');
  const colRut = new THREE.Color('#5d4a32');
  const colSnowRut = new THREE.Color('#9aaac0');
  const colSandRut = new THREE.Color('#b39660');
  const colHay = new THREE.Color('#e8c862');
  const colSpark = new THREE.Color('#ffffff');
  const colHot = new THREE.Color('#ffd25a');
  const colFlame = new THREE.Color('#ffb040');
  const colWater = new THREE.Color('#cfe8f5');
  const colDark = new THREE.Color('#3a3634');
  const TIER_COL = [colSpark, new THREE.Color('#4fb3ff'), new THREE.Color('#ff9a2a'), new THREE.Color('#c070ff')];

  /** One Runner per car, kept and refreshed (runners() is called several times a frame). */
  const runnerOf = new WeakMap<Car, Runner>();
  const runnerList: Runner[] = [];
  const rankList: Runner[] = [];
  function runnerSlot(car: Car, id: string, name: string, color: string): Runner {
    let r = runnerOf.get(car);
    if (!r) runnerOf.set(car, (r = { id, name, color, car, u: 0, finished: false, finishTime: 0, me: false }));
    runnerList.push(r);
    return r;
  }

  /**
   * Everyone on the track: my car, the computer cars I drive, and the others' cars (not the ones gone
   * quiet, unless they already finished). The same list each call: copy it to keep it.
   */
  function runners(): Runner[] {
    runnerList.length = 0;
    for (const e of entrants) {
      const r = runnerSlot(e.car, e.id, e.name, e.color);
      r.u = e.u;
      r.finished = e.finished;
      r.finishTime = e.finishTime;
      r.me = e === meE;
    }
    return runnerList;
  }

  /** The standings (its own list, kept until the next call). */
  function ranking(): Runner[] {
    rankList.length = 0;
    rankList.push(...runners());
    return rankList.sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.u - a.u;
    });
  }

  function score(pl: number, total: number): number {
    const pts = [11000, 8000, 6200, 5000, 4000, 3200];
    const base = pts[pl - 1] ?? 3000;
    const ideal = track.idealLap * LAPS;
    const fast = ideal * 1.04 + 3;
    const slow = ideal * 1.6;
    const t = clamp((slow - total) / (slow - fast), 0, 1);
    return Math.round(base + 10000 * t * t);
  }

  /** Style points add a little on top (only with options, where drifts count). */
  const styleBonus = (): number => (opts ? Math.min(2500, Math.round(stylePts * 0.25)) : 0);

  // ---- controls ----
  function playerControls(dt: number, e: Entrant): void {
    const inp = ctx.input;
    const trig = inp.triggers();
    let thr = Math.max(inp.down('up') ? 1 : 0, trig.right);
    let brk = Math.max(inp.down('down') ? 1 : 0, trig.left);
    const dig = (inp.down('left') ? 1 : 0) - (inp.down('right') ? 1 : 0);
    if (dig !== 0) steerIn = clamp(steerIn + Math.sign(dig - steerIn) * Math.min(Math.abs(dig - steerIn), (Math.sign(dig) !== Math.sign(steerIn) ? 9 : 5) * dt), -1, 1);
    else {
      const ax = -inp.stick(0).x;
      if (Math.abs(ax) > 0.04) steerIn = ax;
      else steerIn = damp(steerIn, 0, 10, dt);
    }
    const car = e.car;
    const p = car.proj;
    const hw = track.at(track.hw, p.s);
    // kids on touch screens: the car drives itself, slowing for bends; they steer
    if (ctx.touch && brk < 0.1 && phase === 'race') {
      const v = Math.max(0, car.vLong);
      const target = track.at(track.vmax, p.s + 4 + v * 0.3) * 0.95;
      if (v > target + 2.5) {
        thr = 0;
        brk = clamp((v - target - 2.5) / 7, 0, 0.55);
      } else thr = Math.max(thr, v > target ? 0.4 : 1);
    }
    thrIn = thr > thrIn ? Math.min(thr, thrIn + dt * 6) : thr;
    // a gentle hand keeping the car on the road (strong for the little ones)
    const w = ctx.touch ? 0.55 : 0.14;
    const v = Math.max(0, car.vLong);
    const off = clamp(p.d, -(hw - 2.6), hw - 2.6);
    const assist = w > 0 ? steerTo(car, track, 6 + v * 0.45, off) : 0;
    let steer = steerIn + w * assist * (1 - 0.65 * Math.abs(steerIn));
    if (Math.abs(p.d) > hw - 1.2 && Math.sign(p.d) * Math.sin(car.heading - track.heading(p.s)) > 0) steer += (ctx.touch ? 0.3 : 0.1) * -Math.sign(p.d);
    e.ctl.throttle = thrIn;
    e.ctl.brake = brk;
    e.ctl.steer = clamp(steer, -1, 1);
    e.ctl.handbrake = inp.down('a');
  }

  // ---- respawn ----
  function respawn(e: Entrant): void {
    const c = e.car;
    const s = c.proj.s - 4;
    let d = 0;
    for (const cand of [0, 3.6, -3.6, 0]) {
      d = cand;
      const p = track.point(s, cand);
      if (!runners().some((o) => o.car !== c && Math.hypot(o.car.x - p.x, o.car.z - p.z) < 5)) break;
    }
    poof(c.x, c.y, c.z);
    c.place(s, d, ground);
    c.ghost = 2.2;
    e.lastS = c.proj.s;
    e.stuckT = 0;
    e.offT = 0;
    poof(c.x, c.y, c.z);
    if (e === player()) {
      audio.poof();
      hud.toast('Tillbaka på vägen. Skärp dig.');
      drift.on = false;
    }
  }

  function poof(x: number, y: number, z: number): void {
    for (let k = 0; k < (high ? 26 : 12); k++) {
      const a = (k / 26) * Math.PI * 2;
      particles.emit({ x, y: y + 0.8, z, vx: Math.cos(a) * 5, vy: 1 + Math.random() * 2, vz: Math.sin(a) * 5, life: 0.8, size0: 1.2, size1: 2.8, color: colSpark, alpha: 0.8, drag: 3 });
    }
  }

  // ---- per-frame effects for one car ----
  function carEffects(c: Car, idx: number, isPlayer: boolean, dt: number, wp: [number, number][]): void {
    if (c.air) {
      for (let w = 0; w < 4; w++) skids.lift(idx * 4 + w);
      return;
    }
    const sinH = Math.sin(c.heading);
    const cosH = Math.cos(c.heading);
    const rate = high ? 1 : 0.45;
    const sp = c.speed;
    const surf = c.surface;
    const dusty = surf === Ground_.Gravel || surf === Ground_.Snow || surf === Ground_.Sand || surf === Ground_.DeepSnow || surf === Ground_.SoftSand;
    const dustCol = surf === Ground_.Snow || surf === Ground_.DeepSnow ? colSnow : surf === Ground_.Sand || surf === Ground_.SoftSand ? colSand : colDust;
    const rutCol = surf === Ground_.Snow || surf === Ground_.DeepSnow ? colSnowRut : surf === Ground_.Sand || surf === Ground_.SoftSand ? colSandRut : colRut;
    const smoke = isPlayer && opts ? smokeColor(myCar.style.smoke, timeU.value, colMySmoke) : colSmoke;
    for (let w = 0; w < wp.length; w++) {
      const [wx, wz] = wp[w]!;
      const x = c.x + sinH * wz + cosH * wx;
      const z = c.z + cosH * wz - sinH * wx;
      const rear = wz < 0;
      const slip = rear ? Math.max(c.slip, c.wheelspin) : c.frontSlip * smooth(3, 8, sp);
      const id = idx * 4 + w;
      const onRoad = surf === Ground_.Asphalt || surf === Ground_.Kerb || surf === Ground_.Ice;
      if (slip > 0.38 && onRoad) skids.mark(id, x, c.y + 0.03, z, sinH, cosH, 0.26, surf === Ground_.Ice ? colSnowRut : colSkid, clamp(slip * 0.55, 0.15, 0.5));
      else if (dusty && rear && sp > 3 && (isPlayer || slip > 0.3)) skids.mark(id, x, c.y + 0.03, z, sinH, cosH, 0.32, rutCol, 0.22);
      else skids.lift(id);
      if (!rear) continue;
      // dust on gravel, spray on snow and sand
      if (dusty && sp > 4 && Math.random() < rate * (0.12 + sp / 90) * (surf === Ground_.Gravel ? 1 : 0.6) * (isPlayer ? 0.8 : 1)) {
        // a light, short puff just behind the wheel; it spreads a little and is gone in about a second
        const back = isPlayer ? 0.5 : 0;
        particles.emit({
          x: x - sinH * back + (Math.random() - 0.5) * 0.5,
          y: c.y + 0.25,
          z: z - cosH * back + (Math.random() - 0.5) * 0.5,
          vx: -sinH * sp * 0.1 + (Math.random() - 0.5) * 1.6,
          vy: 0.5 + Math.random() * 0.8,
          vz: -cosH * sp * 0.1 + (Math.random() - 0.5) * 1.6,
          life: 0.6 + Math.random() * 0.7,
          size0: 0.5,
          size1: (surf === Ground_.Gravel ? 2.0 : 1.5) + sp * 0.015,
          color: dustCol,
          alpha: surf === Ground_.Gravel ? 0.2 : 0.14,
          drag: 1.8,
          gravity: -0.1,
        });
      }
      // smoke when sliding on tarmac
      if (onRoad && slip > 0.35 && Math.random() < rate * slip * 0.9) {
        particles.emit({ x, y: c.y + 0.25, z, vx: (Math.random() - 0.5) * 1.5, vy: 0.6 + Math.random(), vz: (Math.random() - 0.5) * 1.5, life: 1.2 + Math.random(), size0: 0.7, size1: 3.2, color: smoke, alpha: 0.42 * slip, drag: 1.8, gravity: -0.3 });
      }
      // grass and earth flying off the tyres
      if (surf === Ground_.Grass && sp > 5 && Math.random() < rate * 0.6) {
        particles.emit({ x, y: c.y + 0.2, z, vx: -sinH * sp * 0.25 + (Math.random() - 0.5) * 2.5, vy: 2 + Math.random() * 2.5, vz: -cosH * sp * 0.25 + (Math.random() - 0.5) * 2.5, life: 0.7, size0: 0.25, size1: 0.18, color: Math.random() < 0.6 ? colGrass : colDirt, alpha: 0.95, drag: 0.6, gravity: 9 });
        if (Math.random() < 0.3) particles.emit({ x, y: c.y + 0.3, z, vy: 0.6, life: 1.2, size0: 0.8, size1: 2.6, color: colDirt, alpha: 0.3, drag: 2 });
      }
    }
  }

  /** Damage from a knock of strength `j` (m/s), scaled by the rules and the car's toughness. */
  function hurt(e: Entrant, j: number, k = 1): void {
    if (damageK <= 0 || j <= 0) return;
    const before = e.damage;
    e.damage = clamp(e.damage + Math.min(15, j * k) * e.tune.dmgMul * damageK, 0, 100);
    if (Math.floor(e.damage / 4) !== Math.floor(before / 4)) e.model.setDamage(e.damage);
  }

  function sparks(x: number, y: number, z: number, n: number): void {
    for (let k = 0; k < n; k++) particles.emit({ x, y: y + 0.5, z, vx: (Math.random() - 0.5) * 9, vy: 1 + Math.random() * 4, vz: (Math.random() - 0.5) * 9, life: 0.35 + Math.random() * 0.25, size0: 0.22, size1: 0.08, color: colHot, alpha: 1, drag: 1, gravity: 9 });
  }

  // ---- the player's tricks: nitro, the drift boost, style points ----
  function tricks(dt: number, me: Entrant, racing: boolean): void {
    const inp = ctx.input;
    const c = me.car;
    // nitro on C (L, gamepad X/Y, the 🔥 button); the C key itself is the camera
    const nitroKey = inp.pressed('c') && !inp.keyPressed('KeyC');
    if (myTune.charges > 0 && nitroKey && racing && phase === 'race' && !me.finished && nitroT <= 0) {
      if (nitroLeft > 0) {
        nitroLeft--;
        nitroT = nitroLen;
        mods.bus.boost('nitro');
        stats.boosts++;
        audio.boost();
        hud.toast('🔥 Nitro!');
      } else hud.toast('Nitron är slut');
    }
    nitroT = Math.max(0, nitroT - dt);
    driftBoostT = Math.max(0, driftBoostT - dt);
    // the drift: a handbrake flick starts it, keep it sliding to charge the mini-turbo
    const beta = c.vLong > 3 ? Math.atan2(Math.abs(c.vLat), c.vLong) : 0;
    const sliding = !c.air && c.speed > 7 && beta > 0.2;
    if (!drift.on && tricksOn && me.ctl.handbrake && c.speed > 8 && racing && !me.finished) {
      drift.on = true;
      drift.t = drift.pts = drift.grace = 0;
      drift.tier = 0;
    }
    if (drift.on) {
      if (sliding || me.ctl.handbrake) {
        drift.grace = 0;
        if (sliding) {
          drift.t += dt * mt.driftRate;
          stats.driftSeconds += dt;
          drift.pts += beta * c.speed * dt * 6;
        }
      } else drift.grace += dt;
      const tier = drift.t >= 2.4 ? 3 : drift.t >= 1.6 ? 2 : drift.t >= 0.8 ? 1 : 0;
      if (tier > drift.tier) {
        drift.tier = tier;
        audio.chime();
      }
      // sparks off the rear wheels in the tier's colour
      if (tier > 0 && !c.air && Math.random() < (high ? 0.9 : 0.5)) {
        const sinH = Math.sin(c.heading);
        const cosH = Math.cos(c.heading);
        for (const wx of [-0.8, 0.8]) {
          const x = c.x - sinH * 1.35 + cosH * wx;
          const z = c.z - cosH * 1.35 - sinH * wx;
          particles.emit({ x, y: c.y + 0.15, z, vx: -sinH * 3 + (Math.random() - 0.5) * 3, vy: 1.5 + Math.random() * 2, vz: -cosH * 3 + (Math.random() - 0.5) * 3, life: 0.3, size0: 0.25, size1: 0.1, color: TIER_COL[tier]!, alpha: 1, drag: 1, gravity: 8 });
        }
      }
      const over = drift.grace > 0.35 || c.speed < 5 || c.wallHit > 2.5 || me.finished;
      if (over) {
        if (drift.tier > 0 && !c.wallHit) {
          driftBoostT = [0, 0.55, 0.9, 1.3][drift.tier]!;
          audio.boost();
          hud.popup(['', 'Turbo!', 'Superturbo!', 'Megaturbo!'][drift.tier]!, 'blue');
          stats.boosts++;
          mods.bus.boost('drift');
        }
        if (drift.t > 0.4) mods.bus.drift(drift.t, drift.tier);
        const pts = Math.round(drift.pts / 10) * 10;
        if (pts >= 30 && !c.wallHit) {
          stylePts += pts;
          setTimeout(() => hud.popup(`+${pts}`), drift.tier > 0 ? 350 : 0);
        }
        drift.on = false;
        drift.tier = 0;
      }
    }
    hud.setDrift(drift.on ? clamp(drift.t / 2.4, 0.04, 1) : 0, drift.tier);
    hud.setNitro(nitroLeft, myTune.charges, nitroT > 0);
    hud.setStyle(opts ? stylePts : 0);
    // flames and speed lines while the nitro burns
    const burn = nitroT > 0 ? 1 : driftBoostT > 0 ? 0.5 : 0;
    me.model.setNitro(burn);
    hud.speedLines(nitroT > 0 ? 0.8 : driftBoostT > 0 ? 0.35 : 0);
    if (burn > 0 && Math.random() < (high ? 1 : 0.6)) {
      const sinH = Math.sin(c.heading);
      const cosH = Math.cos(c.heading);
      const fc = myCar.style.smoke === 'white' ? colFlame : smokeColor(myCar.style.smoke, timeU.value, colMySmoke);
      particles.emit({ x: c.x - sinH * 2.25 - cosH * 0.45, y: c.y + 0.32, z: c.z - cosH * 2.25 + sinH * 0.45, vx: -sinH * 4 + c.vx * 0.8, vy: 0.3, vz: -cosH * 4 + c.vz * 0.8, life: 0.2, size0: 0.8 * burn + 0.2, size1: 0.2, color: fc, alpha: 1, drag: 4 });
    }
  }

  /** Per frame for a car I drive: damage, mud, the boost pads and the boosts into the handling. */
  function handling(e: Entrant, dt: number, isMe: boolean): void {
    const c = e.car;
    e.mudT = Math.max(0, e.mudT - dt);
    e.slickT = Math.max(0, e.slickT - dt);
    e.padT = Math.max(0, e.padT - dt);
    if (pickups.length && !c.air) {
      const pk = pickupAt(pickups, track, c.proj.s, c.proj.d);
      if (pk?.kind === 'boost' && e.padT <= 0) {
        c.launch = Math.max(c.launch, 1.5);
        e.padT = 1.6;
        if (isMe) {
          audio.boost();
          hud.toast('⚡ Fart!');
        }
        if (isMe) {
          stats.boosts++;
          mods.bus.pickup('boost');
          mods.bus.boost('pad');
        }
      } else if (pk?.kind === 'mud' && isMe && mt.mudproof) {
        // rubber boots: the puddle does nothing, but the trinket gets to say so
        if (timeU.value - mudSaid > 3) {
          mudSaid = timeU.value;
          mods.bus.pickup('mud');
        }
      } else if (pk?.kind === 'mud') {
        if (e.mudT <= 0 && isMe) {
          audio.hay(6);
          mods.bus.pickup('mud');
        }
        e.mudT = 0.9;
        c.vx *= Math.exp(-dt * 1.4);
        c.vz *= Math.exp(-dt * 1.4);
        if (Math.random() < 0.5) particles.emit({ x: c.x + (Math.random() - 0.5) * 2, y: c.y + 0.3, z: c.z + (Math.random() - 0.5) * 2, vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 4, life: 0.7, size0: 0.35, size1: 0.25, color: colMud, alpha: 1, drag: 0.8, gravity: 9 });
      }
    }
    const d = e.damage;
    const loose = c.surface >= Ground_.Grass && c.surface !== Ground_.Ice;
    c.grip = e.tune.grip * rainGrip * damageGrip(d) * (e.mudT > 0 ? 0.8 : 1) * (e.slickT > 0 ? 0.55 : 1) * (twist?.grip ?? 1) * (isMe && loose ? mt.offroad : 1);
    e.rivalBoostT = Math.max(0, e.rivalBoostT - dt);
    e.squashT = Math.max(0, e.squashT - dt);
    e.squash = damp(e.squash, e.squashT > 0 ? 1 : 0, 14, dt);
    if (!isMe) c.boost = e.rivalBoostT > 0 ? 1.35 : 1;
    if (isMe) {
      c.power = e.basePower * damagePower(d) * (loose ? mt.offroad : 1) * (e.squashT > 0 ? 0.4 : 1);
      c.boost = Math.max(nitroT > 0 ? nitroPush : 1, driftBoostT > 0 ? 1.3 : 1, extraBoostT > 0 ? extraBoostK : 1);
    }
  }

  // ---- trinkets: what a hook can do to the race ----
  const tmpCol = new THREE.Color();
  const tickState: TickState = { speed: 0, steer: 0, handbrake: false, handbrakePressed: false, straight: false, air: false, drifting: false, boosting: false, lap: 1, place: 1, racing: false, time: 0 };

  function sparkleAt(x: number, y: number, z: number, n: number, spread: number): void {
    for (let k = 0; k < (high ? n : Math.ceil(n / 2)); k++) {
      tmpCol.setHSL(Math.random(), 0.9, 0.65);
      particles.emit({ x: x + (Math.random() - 0.5) * spread * 2, y: y + 0.3 + Math.random() * 1.2, z: z + (Math.random() - 0.5) * spread * 2, vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 2, vz: (Math.random() - 0.5) * 3, life: 0.7 + Math.random() * 0.4, size0: 0.35, size1: 0.05, color: tmpCol, alpha: 1, drag: 1.2, gravity: 3 });
    }
  }

  /** Per frame, before the physics: the straight jump, the wiggle, the hooks, the disco and the glitter. */
  function modTick(dt: number, me: Entrant, racing: boolean): void {
    const c = me.car;
    const raw = me.ctl.handbrake;
    const pressed = raw && !hbPrev;
    hbPrev = raw;
    const beta = c.vLong > 3 ? Math.atan2(Math.abs(c.vLat), c.vLong) : 0;
    const straight = Math.abs(me.ctl.steer) < 0.3 && beta < 0.15 && !drift.on;
    // the spring jump takes the handbrake while the car goes straight (steer and it slides as usual)
    if (mt.jump > 0 && straight && phase === 'race') me.ctl.handbrake = false;
    if (mt.wiggle > 0 && nitroT > 0) me.ctl.steer = clamp(me.ctl.steer + mt.wiggle * Math.sin(timeU.value * 9), -1, 1);
    extraBoostT = Math.max(0, extraBoostT - dt);
    if (mods.bus.size) {
      const ts = tickState;
      ts.speed = c.speed;
      ts.steer = me.ctl.steer;
      ts.handbrake = raw;
      ts.handbrakePressed = pressed;
      ts.straight = straight;
      ts.air = c.air;
      ts.drifting = drift.on && drift.t > 0.15;
      ts.boosting = nitroT > 0 || driftBoostT > 0 || extraBoostT > 0;
      ts.lap = Math.min(LAPS, me.lapsDone + 1);
      ts.place = place;
      ts.racing = phase === 'race' && !me.finished;
      ts.time = raceT;
      mods.bus.tick(dt, ts);
    }
    if (racing && phase === 'race') {
      if (mt.disco) {
        beatT += dt;
        if (beatT >= 0.25) {
          beatT -= 0.25;
          audio.beat(Math.round(raceT * 4) % 2 === 1);
        }
      }
      if (mt.glitter && !c.air && Math.random() < (high ? 0.8 : 0.4)) sparkleAt(c.x - Math.sin(c.heading) * 2, c.y, c.z - Math.cos(c.heading) * 2, 2, 0.6);
    }
  }

  /** The boss rivals' tricks: a short nitro every now and then, a hop across the road. */
  function rivalTricks(e: Entrant, dt: number): void {
    const sp = e.spec;
    if (sp && sp.nitroEvery > 0) {
      // nitro on the straights: not in the bends, where it would only throw them off
      e.nitroNext -= dt;
      const c = e.car;
      if (e.nitroNext <= 0 && !c.air && Math.abs(e.ctl.steer) < 0.2 && track.at(track.vmax, c.proj.s + 35) >= track.at(track.vmax, c.proj.s) * 0.95) {
        e.rivalBoostT = 1.3 + sp.nitro;
        e.nitroNext = sp.nitroEvery * (0.8 + Math.random() * 0.5);
      }
    }
    if (sp && sp.oilEvery > 0 && !e.car.air && racingNow()) {
      e.oilNext -= dt;
      if (e.oilNext <= 0) {
        const c = e.car;
        obstacles.add('oil', c.x - Math.sin(c.heading) * 3.4, c.y, c.z - Math.cos(c.heading) * 3.4, c);
        e.oilNext = sp.oilEvery * (0.8 + Math.random() * 0.5);
      }
    }
    if (twist?.rivalNitro) {
      e.rivalNext -= dt;
      if (e.rivalNext <= 0) {
        e.rivalBoostT = 1.6;
        e.rivalNext = twist.rivalNitro * (0.8 + Math.random() * 0.5);
      }
    }
    if (twist?.rivalHop) {
      e.hopNext -= dt;
      if (e.hopNext <= 0 && !e.car.air) {
        e.car.vy += 6.5;
        e.car.y += 0.05;
        e.hopNext = twist.rivalHop * (0.7 + Math.random() * 0.6);
      }
    }
  }

  /** A hit of strength `j` (m/s): a bike falls over from `big` up (the rider somersaults, then it is back on its wheels), a smaller knock wobbles it. */
  function knock(e: Entrant, j: number, big: number): void {
    if (e.tumbleT > 0 || e.finished || !racingNow()) return;
    if (j >= big) {
      tumbles++;
      e.tumbleT = TUMBLE_LEN;
      e.tumbleDir = Math.random() < 0.5 ? -1 : 1;
      if (e === meE) {
        audio.slip();
        setTimeout(() => !destroyed && audio.boing(), 380);
        hud.toast(['Pang! Du ramlade!', 'Aj! Upp med dig!', 'Salto! 10 poäng!', 'Det där syntes från månen!'][Math.floor(Math.random() * 4)]!);
        shake = Math.max(shake, 0.4);
      }
      sparkleAt(e.car.x, e.car.y + 0.5, e.car.z, 8, 0.8);
    } else if (j >= 2.5) e.wobble = 1;
  }

  let tumbles = 0;
  const racingNow = (): boolean => phase === 'race' || phase === 'finish';

  /** Per car each frame: wobble fades; while a bike lies on its side it steers nothing, slows to a stop and then pops up again with a ghost. */
  function tumbleStep(e: Entrant, dt: number, isMe: boolean): void {
    e.wobble = Math.max(0, e.wobble - dt * 1.6);
    if (e.tumbleT <= 0) return;
    const c = e.car;
    e.tumbleT = Math.max(0, e.tumbleT - dt);
    e.ctl.throttle = 0;
    e.ctl.brake = 0.15;
    e.ctl.steer = 0;
    e.ctl.handbrake = false;
    const k = Math.exp(-dt * 2.2);
    c.vx *= k;
    c.vz *= k;
    c.yawRate *= Math.exp(-dt * 6);
    if (e.tumbleT === 0) {
      poof(c.x, c.y, c.z);
      c.ghost = Math.max(c.ghost, 2.2);
      e.stuckT = 0;
      if (isMe) audio.poof();
    }
  }

  // ---- the horn: H, and by itself when a car is just ahead (the moped's bell, or a trinket that likes tooting) ----
  let hornCd = 0;
  function honk(me: Entrant): void {
    hornCd = 1.1;
    const c = me.car;
    const sinH = Math.sin(c.heading);
    const cosH = Math.cos(c.heading);
    let near = 0;
    for (const e of entrants) {
      if (e === me) continue;
      const dx = e.car.x - c.x;
      const dz = e.car.z - c.z;
      if (dx * sinH + dz * cosH > -2 && Math.hypot(dx, dz) < 14) near++;
    }
    audio.horn(me.body);
    sparkleAt(c.x + sinH * 1.2, c.y + 1.2, c.z + cosH * 1.2, 3, 0.4);
    mods.bus.honk(near);
  }

  function hornStep(dt: number, me: Entrant, racing: boolean): void {
    hornCd = Math.max(0, hornCd - dt);
    if (!racing || phase !== 'race' || me.finished) return;
    if (ctx.input.keyPressed('KeyH') && hornCd <= 0) return honk(me);
    // by itself: right behind another car, going fast enough to mean it
    if ((me.body === 'moped' || mods.bus.honking) && hornCd <= 0 && me.car.speed > 6 && me.tumbleT <= 0) {
      const c = me.car;
      const sinH = Math.sin(c.heading);
      const cosH = Math.cos(c.heading);
      for (const e of entrants) {
        if (e === me) continue;
        const dx = e.car.x - c.x;
        const dz = e.car.z - c.z;
        const fwd = dx * sinH + dz * cosH;
        const lat = dx * cosH - dz * sinH;
        if (fwd > 1.5 && fwd < 6.5 && Math.abs(lat) < 2.4) {
          hornCd = 4;
          honk(me);
          hornCd = 4;
          return;
        }
      }
    }
  }

  /** The trinket that swaps the vehicle: a poof and another body, with the handling and the model to match. */
  function swapPlayerBody(next: CarBody): void {
    const e = player();
    if (e.body === next) return;
    const old = e.model;
    scene.remove(old.root, old.shadow);
    old.dispose();
    for (const l of headlights) l.dispose();
    headlights.length = 0;
    e.body = next;
    const t = tuneForBody(next);
    Object.assign(myTune, { ...t, charges: myTune.charges });
    const c = e.car;
    c.setBody(next, feelOf(next, true));
    c.size = myTune.size;
    c.brakeMul = myTune.brakeMul;
    c.grip = myTune.grip;
    e.basePower = BASE_POWER * myTune.power;
    const m = modelFor({ ...myCar, body: next }, undefined, mt.sidecar && next === 'moto');
    m.root.scale.setScalar(mt.size);
    disposers.push(() => m.dispose());
    e.model = m;
    e.tumbleT = 0;
    if (night) addHeadlights();
    poof(c.x, c.y, c.z);
    audio.poof();
    hud.toast(`🎠 ${CAR_BODY_NAMES[next]}!`);
  }

  /** Banana peels and hay bales spin whoever drives over them. */
  function obstaclesStep(dt: number, racing: boolean): void {
    obstacles.update(dt);
    if (!racing) return;
    const me = player();
    for (const e of entrants) {
      const o = obstacles.touch(e.car);
      if (!o) continue;
      const c = e.car;
      if (o.kind === 'pothole') {
        // a pothole: a jolt up, a lost bit of speed, a little damage
        c.vy = Math.max(c.vy, 0) + 2.8 * Math.max(0.4, c.feel.landing);
        c.y += 0.05;
        c.vx *= 0.9;
        c.vz *= 0.9;
        if (e === me) {
          audio.thud(7);
          shake = Math.max(shake, 0.3);
          mods.bus.hit('land', 5);
        }
        if (damageK > 0) hurt(e, 4);
        else damageHp(e, 3, null);
        for (let k = 0; k < (high ? 8 : 4); k++) particles.emit({ x: c.x, y: c.y + 0.3, z: c.z, vx: (Math.random() - 0.5) * 5, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 5, life: 0.7, size0: 0.3, size1: 0.2, color: colDirt, alpha: 1, drag: 1, gravity: 9 });
        continue;
      }
      // a tractor hardly notices a banana peel, a hay bale or an oil slick; oil spins harder and takes the grip for a moment
      const sl = c.feel.slip;
      const oil = o.kind === 'oil';
      c.yawRate += (Math.random() < 0.5 ? -1 : 1) * (oil ? 10 : 7) * sl;
      c.vx *= 1 - (oil ? 0.3 : 0.45) * sl;
      c.vz *= 1 - (oil ? 0.3 : 0.45) * sl;
      if (oil && sl > 0.3) e.slickT = 1.4;
      if (c.feel.two) e.wobble = 1;
      if (oil) {
        if (Math.hypot(c.x - me.car.x, c.z - me.car.z) < 40) audio.slip();
        sparkleAt(c.x, c.y, c.z, 5, 0.8);
        if (e !== me) stats.bananaHits++;
      } else if (o.kind === 'banana') {
        if (e !== me) stats.bananaHits++;
        if (Math.hypot(c.x - me.car.x, c.z - me.car.z) < 40) audio.slip();
        sparkleAt(c.x, c.y, c.z, 6, 0.8);
      } else {
        if (e === me) {
          audio.hay(9);
          shake = Math.max(shake, 0.35);
        }
        for (let k = 0; k < (high ? 12 : 6); k++) particles.emit({ x: c.x, y: c.y + 0.7, z: c.z, vx: (Math.random() - 0.5) * 8, vy: 2 + Math.random() * 4, vz: (Math.random() - 0.5) * 8, life: 0.9, size0: 0.35, size1: 0.25, color: colHay, alpha: 1, drag: 1.2, gravity: 6 });
      }
    }
  }

  const api: RaceApi = {
    say(id, text) {
      // the icon always pulses; its small label under the icon is rate-limited per trinket
      const now = timeU.value;
      const quiet = now - (sayIds.get(id) ?? -9) < 4;
      hud.trinketSay(id, quiet || !text ? null : text);
      if (!quiet && text) sayIds.set(id, now);
    },
    fart(size = 1) {
      audio.fart(size);
      stats.quacks++;
    },
    burp() {
      audio.burp();
      stats.quacks++;
    },
    gas(strength, push = true) {
      const me = player();
      const c = me.car;
      const sinH = Math.sin(c.heading);
      const cosH = Math.cos(c.heading);
      // a low green cloud hanging behind and beside the car: near the ground, never in front of the chase camera,
      // and see-through the closer it is to the lens (gasFx fades what is within a few metres of the camera)
      const n = Math.round(((high ? 14 : 8) + strength * 2) * (push ? 1 : 0.5));
      for (let k = 0; k < n; k++) {
        const fwd = -(0.8 + Math.random() * 3.2);
        const side = (Math.random() < 0.5 ? -1 : 1) * (2.2 + Math.random() * 2);
        gasFx.emit({
          x: c.x + sinH * fwd + cosH * side,
          y: c.y + 0.15 + Math.random() * 0.7,
          z: c.z + cosH * fwd - sinH * side,
          vx: cosH * side * 0.25 + (Math.random() - 0.5) * 1,
          vy: 0.1 + Math.random() * 0.5,
          vz: -sinH * side * 0.25 + (Math.random() - 0.5) * 1,
          life: 1.4 + Math.random() * 0.9,
          size0: 0.8,
          size1: 2.2 + strength * 0.25,
          color: colGas,
          alpha: push ? 0.34 : 0.2,
          drag: 1.8,
          gravity: -0.1,
        });
      }
      if (!push) return;
      // whoever drives into the cloud swerves
      for (const e of entrants) {
        if (e === me) continue;
        const dx = e.car.x - c.x;
        const dz = e.car.z - c.z;
        const fwd = dx * sinH + dz * cosH;
        const lat = dx * cosH - dz * sinH;
        if (fwd > 1 || fwd < -26 || Math.abs(lat) > 8) continue;
        const sg = Math.abs(lat) < 0.3 ? (Math.random() < 0.5 ? 1 : -1) : Math.sign(lat);
        e.car.yawRate += sg * (1.8 + 0.5 * strength);
        e.car.vx += cosH * sg * (3 + strength);
        e.car.vz -= sinH * sg * (3 + strength);
        e.car.vx *= 0.93;
        e.car.vz *= 0.93;
      }
    },
    boing: () => audio.boing(),
    party() {
      const c = player().car;
      audio.party();
      confetti.burst(c.x, c.y + 2, c.z, high ? 60 : 30, 7);
    },
    bounce(vy) {
      const c = player().car;
      c.vy = Math.max(c.vy, 0) + vy;
      c.y += 0.05;
      stats.bounces++;
      shake = Math.max(shake, 0.15);
    },
    kick(dv) {
      const c = player().car;
      const th = track.heading(c.proj.s);
      c.vx += Math.sin(th) * dv;
      c.vz += Math.cos(th) * dv;
    },
    boost(sec, strength = 1.3) {
      extraBoostT = Math.max(extraBoostT, sec);
      extraBoostK = strength;
      audio.boost();
    },
    ghost(sec) {
      player().car.ghost = Math.max(player().car.ghost, sec);
    },
    banana() {
      const c = player().car;
      obstacles.add('banana', c.x - Math.sin(c.heading) * 3.2, c.y, c.z - Math.cos(c.heading) * 3.2, c);
      stats.bananas++;
    },
    cannon(strength) {
      const me = player();
      const c = me.car;
      const sinH = Math.sin(c.heading);
      const cosH = Math.cos(c.heading);
      audio.party();
      confetti.burst(c.x + sinH * 2, c.y + 1.2, c.z + cosH * 2, high ? 110 : 55, 9, hotdogs);
      for (const e of entrants) {
        if (e === me) continue;
        const dx = e.car.x - c.x;
        const dz = e.car.z - c.z;
        const fwd = dx * sinH + dz * cosH;
        const lat = dx * cosH - dz * sinH;
        if (fwd < -3 || fwd > 28 || Math.abs(lat) > 10) continue;
        const sg = lat === 0 ? 1 : Math.sign(lat);
        const k = 6 + 3.5 * strength;
        e.car.vx += cosH * sg * k;
        e.car.vz -= sinH * sg * k;
        e.car.yawRate += sg * 1.6;
      }
    },
    squashLeader(sec) {
      const me = player();
      let lead: Entrant | null = null;
      for (const e of entrants) if (e !== me && !e.finished && (!lead || e.u > lead.u)) lead = e;
      if (!lead) return;
      lead.squashT = Math.max(lead.squashT, sec);
      stats.squashed++;
      poof(lead.car.x, lead.car.y, lead.car.z);
      audio.boing();
      for (let k = 0; k < 8; k++) particles.emit({ x: lead.car.x, y: lead.car.y + 1, z: lead.car.z, vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 2, vz: (Math.random() - 0.5) * 3, life: 1.8, size0: 1.2, size1: 4, color: colGas, alpha: 0.55, drag: 1.5, gravity: -0.2 });
      hud.toast(`🧦 ${lead.name} svimmade av sockluften!`);
    },
    slowBehind(radius, k, dt) {
      const me = player();
      const c = me.car;
      const sinH = Math.sin(c.heading);
      const cosH = Math.cos(c.heading);
      for (const e of entrants) {
        if (e === me) continue;
        const dx = e.car.x - c.x;
        const dz = e.car.z - c.z;
        const fwd = dx * sinH + dz * cosH;
        const lat = dx * cosH - dz * sinH;
        if (fwd > 0 || fwd < -radius || Math.abs(lat) > 7) continue;
        const f = Math.exp(-k * dt * 0.6);
        e.car.vx *= f;
        e.car.vz *= f;
        if (Math.random() < 0.15) particles.emit({ x: e.car.x, y: e.car.y + 1.2, z: e.car.z, vy: 1.2, life: 0.9, size0: 0.8, size1: 2.4, color: colGas, alpha: 0.5, drag: 1.5, gravity: -0.3 });
      }
    },
    shove(radius, strength) {
      const me = player();
      const c = me.car;
      for (const e of entrants) {
        if (e === me) continue;
        const dx = e.car.x - c.x;
        const dz = e.car.z - c.z;
        const d = Math.hypot(dx, dz);
        if (d > radius || d < 0.1) continue;
        e.car.vx += (dx / d) * strength;
        e.car.vz += (dz / d) * strength;
        e.car.vy += strength * 0.25;
        e.car.yawRate += (Math.random() - 0.5) * 3;
      }
    },
    swapVehicle() {
      const e = player();
      const pool = CAR_BODIES.filter((b) => b !== e.body);
      swapPlayerBody(pool[Math.floor(Math.random() * pool.length)]!);
    },
    kronor(n) {
      bonusKr += n;
      hud.popup(`+${n} kr`, 'coin');
    },
    sparkle(n) {
      const c = player().car;
      sparkleAt(c.x, c.y, c.z, n, 1.2);
    },
    stat(k, n = 1) {
      stats[k] += n;
    },
  };
  mods.bus.bind(api);

  // ---- Blodbad: hits, health, wrecks, takedowns ----
  const colFire = new THREE.Color('#ff7a1a');
  const colDebris = new THREE.Color();

  /** Sparks and bits of the two cars' paint where they met. */
  function impactFx(info: HitInfo, ea: Entrant, eb: Entrant, hit: number): void {
    const n = Math.min(high ? 18 : 8, Math.round(hit * 1.6));
    sparks(info.x, info.y, info.z, n);
    for (let k = 0; k < Math.ceil(n / 2); k++) {
      colDebris.set(k % 2 ? ea.color : eb.color);
      particles.emit({ x: info.x, y: info.y + 0.6, z: info.z, vx: (Math.random() - 0.5) * 8, vy: 1.5 + Math.random() * 4, vz: (Math.random() - 0.5) * 8, life: 0.8, size0: 0.3, size1: 0.22, color: colDebris, alpha: 1, drag: 0.9, gravity: 10 });
    }
    if (hit > 5) particles.emit({ x: info.x, y: info.y + 0.5, z: info.z, vy: 0.8, life: 0.7, size0: 0.8, size1: 2.4, color: colSmoke, alpha: 0.35, drag: 2 });
  }

  /** The hit between two cars: sound, sparks, shake, and the damage (health in Blodbad, plating otherwise). */
  function carHit(i: number, k: number, hit: number, info: HitInfo): void {
    const me = player();
    const ea = entrants[i]!;
    const eb = entrants[k]!;
    const now = timeU.value;
    const key = i * 16 + k;
    const fresh = now - (pairCd.get(key) ?? -9) >= 0.22;
    if (fresh) dbg.contacts++;
    const mine = ea === me || eb === me;
    if (mine) {
      const other = ea === me ? eb : ea;
      audio.crunch(hit, other.car.feel.mass);
      shake = Math.max(shake, Math.min(0.55, hit * 0.055 * (0.8 + 0.2 * Math.sqrt(other.car.feel.mass))));
      mods.bus.hit('car', hit);
    } else if (hit > 4 && Math.hypot(ea.car.x - me.car.x, ea.car.z - me.car.z) < 30 && fresh) audio.crunch(hit * 0.5, ea.car.feel.mass);
    if (hit > 2 && fresh) impactFx(info, ea, eb, hit);
    if (carnage) {
      if (!fresh || !racingNow()) return;
      const tot = info.closeA + info.closeB + 0.001;
      let any = false;
      for (const [x, o, closeO] of [[ea, eb, info.closeB], [eb, ea, info.closeA]] as const) {
        if (x.finished || x.wreckT > 0) continue;
        const dmg = impactDamage({ dv: info.j / x.car.feel.mass, blame: closeO / tot, ram: o.car.ram, dmgTaken: x.tune.dmgMul });
        if (dmg > 0) {
          damageHp(x, dmg, o);
          any = true;
        }
      }
      if (any) pairCd.set(key, now);
    } else if (hit > 2) {
      hurt(ea, (hit - 2) * 1.2);
      hurt(eb, (hit - 2) * 1.2);
    }
  }

  /** Health lost: from another car (who may get a takedown if this wrecks it) or from the road (null). */
  function damageHp(x: Entrant, dmg: number, from: Entrant | null): void {
    if (!carnage || x.wreckT > 0 || x.finished || dmg <= 0 || !racingNow()) return;
    x.hp = Math.max(0, x.hp - dmg);
    x.calmT = 0;
    if (from) ledger.hit(x.id, from.id, dmg, timeU.value);
    x.model.setDamage(100 * (1 - x.hp / x.maxHp) * 0.9);
    if (x.hp <= 0) wreck(x);
  }

  function explode(c: Car): void {
    sparks(c.x, c.y, c.z, high ? 26 : 12);
    for (let k = 0; k < (high ? 16 : 8); k++) {
      particles.emit({ x: c.x + (Math.random() - 0.5) * 1.6, y: c.y + 0.6, z: c.z + (Math.random() - 0.5) * 1.6, vx: (Math.random() - 0.5) * 7, vy: 2 + Math.random() * 4, vz: (Math.random() - 0.5) * 7, life: 0.5 + Math.random() * 0.4, size0: 1.2, size1: 3.4, color: k % 3 ? colFire : colHot, alpha: 0.85, drag: 2, gravity: -1 });
      particles.emit({ x: c.x, y: c.y + 0.8, z: c.z, vx: (Math.random() - 0.5) * 3, vy: 1.5 + Math.random() * 2, vz: (Math.random() - 0.5) * 3, life: 1.1 + Math.random() * 0.8, size0: 1.0, size1: 2.8, color: colDark, alpha: 0.32, drag: 1.4, gravity: -0.5 });
    }
  }

  /** Health gone: out for a few seconds in a flip and a cloud of smoke, and whoever hit it last (within two seconds) gets the takedown. */
  function wreck(x: Entrant): void {
    if (x.wreckT > 0) return;
    const me = player();
    const c = x.car;
    x.wreckT = WRECK_SECONDS;
    x.wrecks++;
    x.tumbleT = 0;
    c.vy = Math.max(c.vy, 0) + 7;
    c.y += 0.1;
    c.yawRate += (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 3);
    c.vx *= 0.7;
    c.vz *= 0.7;
    c.ghost = WRECK_SECONDS + 0.4;
    x.model.setDamage(100);
    explode(c);
    const by = ledger.credit(x.id, timeU.value);
    const attacker = by ? entrants.find((e) => e.id === by) ?? null : null;
    dbg.wrecks++;
    if (attacker) attacker.takedowns++;
    if (attacker && attacker !== me) dbg.rivalTake++;
    const near = Math.hypot(c.x - me.car.x, c.z - me.car.z) < 70;
    if (near || x === me || attacker === me) audio.boom();
    if (x === me) {
      shake = Math.max(shake, 0.6);
      drift.on = false;
      hud.toast(attacker ? `💀 ${attacker.name} vrakade dig` : '💀 Du blev vrak. Snyggt.', 'dead');
    } else if (attacker === me) {
      shake = Math.max(shake, 0.3);
      hud.toast(`💥 TAKEDOWN! ${x.name} är skrot · +3 p`, 'td');
    } else if (attacker && near) hud.toast(`${attacker.name} vrakade ${x.name}`, 'dead');
    else if (near && x !== me) hud.toast(`${x.name} körde sönder sig själv`, 'dead');
  }

  /** Per car each frame in Blodbad: a wrecked car lies smoking, then comes back on the road behind with most of its health. */
  function wreckStep(e: Entrant, dt: number): void {
    if (!carnage) return;
    if (e.wreckT <= 0) {
      e.calmT += dt;
      // a boss with the right to heal does so when nobody has hit it for a while
      if (e.spec?.rules.includes('regen') && e.calmT > 3 && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + 6 * dt);
      return;
    }
    const c = e.car;
    e.wreckT = Math.max(0, e.wreckT - dt);
    e.ctl.throttle = 0;
    e.ctl.brake = 0.25;
    e.ctl.steer = 0;
    e.ctl.handbrake = false;
    if (!c.air) {
      const k = Math.exp(-dt * 1.8);
      c.vx *= k;
      c.vz *= k;
    }
    if (Math.random() < (high ? 0.7 : 0.35)) particles.emit({ x: c.x + (Math.random() - 0.5), y: c.y + 0.8, z: c.z + (Math.random() - 0.5), vy: 1.5, vx: (Math.random() - 0.5) * 1.5, vz: (Math.random() - 0.5) * 1.5, life: 1.2, size0: 0.8, size1: 2.4, color: colDark, alpha: 0.3, drag: 1.5, gravity: -0.4 });
    if (Math.random() < 0.18) particles.emit({ x: c.x + (Math.random() - 0.5), y: c.y + 0.9, z: c.z + (Math.random() - 0.5), vy: 1.2, life: 0.35, size0: 0.7, size1: 1.4, color: colFire, alpha: 0.8, drag: 2 });
    if (e.wreckT === 0) {
      e.hp = e.maxHp * RESPAWN_HP;
      e.model.setDamage(35);
      respawn(e);
    }
  }

  /** A rival with a temper picks who to go for: the player, the leader, or the weakest car close by; or blocks one that is behind. */
  function aimStep(e: Entrant, dt: number): void {
    const d = e.ai!;
    e.aimT -= dt;
    if (e.aimT > 0) return;
    e.aimT = 0.45 + Math.random() * 0.3;
    d.aim = null;
    const aggro = d.p.aggro ?? 0;
    if (aggro < 0.04 || e.tumbleT > 0 || Math.random() > aggro) return;
    const me = player();
    let leader: Entrant | null = null;
    for (const o of entrants) if (!o.finished && (!leader || o.u > leader.u)) leader = o;
    let best: Entrant | null = null;
    let bestScore = Infinity;
    for (const o of entrants) {
      if (o === e || o.finished || o.wreckT > 0 || o.car.ghost > 0) continue;
      const dist = Math.hypot(o.car.x - e.car.x, o.car.z - e.car.z);
      if (dist > (carnage ? 42 : 32)) continue;
      let sc = dist;
      if (o === me) sc *= 0.75;
      if (o === leader) sc *= 0.85;
      if (carnage) sc *= 0.55 + 0.45 * (o.hp / o.maxHp);
      if (sc < bestScore) {
        bestScore = sc;
        best = o;
      }
    }
    if (!best) return;
    const ds = track.wrapDist(best.car.proj.s - e.car.proj.s);
    if (ds > -3) {
      d.aim = { car: best.car, mode: 'ram' } as Aim;
      dbg.aims++;
    }
    else if (ds > -16 && (best === me || best === leader) && Math.random() < 0.6) d.aim = { car: best.car, mode: 'block' } as Aim;
  }

  /** Blodbad points as the race stands now (as if it ended): position points and 3 per takedown. */
  function carnageTable(order: Runner[]): ReturnType<typeof pointsTable> {
    return pointsTable(order.map((r, i) => ({ id: r.id, place: i + 1, takedowns: entrants.find((e) => e.id === r.id)?.takedowns ?? 0 })));
  }

  // ---- the game loop ----
  function update(dt: number): void {
    const inp = ctx.input;
    phaseT += dt;
    timeU.value += dt;
    const me = player();
    // phase transitions
    if (phase === 'intro') {
      if (phaseT < dt * 1.5) {
        hud.msg('Gör dig redo!', 1700, 'small');
        hud.subtitle(ctx.touch ? 'Bilen gasar själv. Du styr med ◀ ▶' : 'Gasa när lampan blir grön!');
      }
      if (phaseT > 2.6) {
        phase = 'count';
        phaseT = 0;
      }
    } else if (phase === 'count') {
      const n = Math.min(3, Math.floor(phaseT) + 1);
      if (phaseT < 3 && n !== lastLight) {
        lastLight = n;
        road.setLights(n, false);
        hud.lights(n, false, true);
        hud.msg(String(4 - n), 800);
        audio.beep(false);
      }
      if (phaseT >= 3) {
        const late = phaseT - 3;
        phase = 'race';
        phaseT = late;
        raceT = late;
        lapStart = 0;
        road.setLights(4, true);
        hud.lights(4, true, true);
        hud.msg('KÖR!', 900, 'go');
        hud.subtitle('');
        hud.hideRace(false);
        audio.beep(true);
        if (me.body === 'moped') setTimeout(() => !destroyed && audio.horn('moped'), 250);
        audio.cheer(0.7);
        audio.music(0.32);
        thrPrev = me.ctl.throttle > 0.5;
        if (mt.launch > 0) {
          me.car.launch = Math.max(me.car.launch, mt.launch);
          stats.boosts++;
          mods.bus.boost('start');
        }
        if (Number.isFinite(AT)) {
          // test hook: start the player somewhere else on the lap, rolling
          me.car.place(AT, 0, ground);
          const h = me.car.heading;
          me.car.vx = Math.sin(h) * 18;
          me.car.vz = Math.cos(h) * 18;
          me.lastS = me.car.proj.s;
          me.u = AT;
          camPos.set(me.car.x - Math.sin(h) * 7, me.car.y + 2.5, me.car.z - Math.cos(h) * 7);
          camYaw = h;
        }
      }
    } else if (phase === 'race') {
      raceT += dt;
      if (phaseT > 1.4 && phaseT - dt <= 1.4) {
        hud.lights(0, false, false);
        road.setLights(0, false);
      }
      // a rocket start for pressing the gas just as it turns green
      if (!boosted && phaseT < 0.45) {
        const on = me.ctl.throttle > 0.5;
        if (on && !thrPrev) {
          boosted = true;
          me.car.launch = 1.6;
          hud.toast('🚀 Raketstart!');
          audio.boost();
        }
        thrPrev = on;
      }
    } else if (phase === 'finish') {
      raceT += dt;
      if (phaseT > 5.6 && !ended) endRace();
    }
    const racing = phase === 'race' || phase === 'finish' || phase === 'over';

    // everyone to steer round and bump into (my entrants first: collideCars' indexes rely on it)
    carsBuf.length = 0;
    for (const x of entrants) carsBuf.push(x.car);

    // ---- controls ----
    const cars = carsBuf;
    let packU = 0;
    let packN = 0;
    for (const x of entrants) if (!x.finished && x.wreckT <= 0) {
      packU += x.u;
      packN++;
    }
    for (const e of entrants) {
      if (e === me && !me.finished && phase !== 'over' && !AUTO) playerControls(dt, e);
      else if (e.ai || e === me) {
        const drv = e.ai ?? (me.ai = new Driver({ skill: AUTO && !me.finished ? AUTO : 0.62, bias: 0, lineUse: 0.6, wobble: 0, phase: 0 }));
        // rubber band: ease off when far ahead of the player, push a little when far behind
        let mul = 1;
        if (e !== me && !me.finished && field) {
          // the catch-up of this point in the run: only for those behind the player, never for those in front
          const gap = e.u - me.u;
          const c = field.catchUp;
          const boost = catchUpBoost(-gap, c);
          const ease = easeOff(gap, c);
          const lastLap = e.spec?.rules.includes('lastlap') && e.lapsDone >= LAPS - 1 ? LASTLAP_BOOST : 0;
          const sk = e.ai?.p.skill ?? 1;
          mul = Math.min(1 + boost, 1.08 / Math.max(0.6, sk)) * (1 - ease) * (1 + lastLap);
          // in Blandat and Blodbad the pack stays bunched up (it is a brawl, not a procession): stragglers hurry, the ones far ahead of everybody ease off
          if (kind !== 'rally' && packN > 1) {
            const k = carnage ? 1 : 0.5;
            const gp = e.u - packU / packN;
            if (gp > 25) mul *= 1 - Math.min(0.08, (gp - 25) / 700) * k;
            else if (gp < -25) mul = Math.min(mul * (1 + Math.min(0.1, (-gp - 25) / 500) * k), 1.12 / Math.max(0.6, sk));
          }
          e.car.power = e.basePower * (1 + boost * 0.9 + lastLap) * (1 - ease * 0.4) * damagePower(e.damage) * (e.squashT > 0 ? 0.4 : 1) * (e.hp < e.maxHp * 0.25 && carnage ? 0.85 : 1);
          if (e.ai) {
            e.ai.surge = e.rivalBoostT > 0 ? 0.1 : 0;
            if (carnage) e.ai.p.aggro = e.spec!.aggro * (e.spec!.rules.includes('regen') && e.hp < e.maxHp * 0.5 ? 1.3 : 1);
            if (racing && !e.finished && e.wreckT <= 0) aimStep(e, dt);
            else e.ai.aim = null;
          }
        } else if (e !== me && !me.finished) {
          const k = diff.band;
          const gap = e.u - me.u;
          if (gap > 20) mul = 1 - Math.min(ctx.touch ? 0.2 : 0.13, (gap - 20) / (ctx.touch ? 500 : 800)) * k;
          else if (gap < -30) mul = 1 + Math.min(0.06, (-gap - 30) / 1200) * k;
          e.car.power = e.basePower * (gap < -30 ? 1 + Math.min(0.08, (-gap - 30) / 1000) * k : gap > 60 ? 1 - 0.07 * k : 1) * damagePower(e.damage) * (e.squashT > 0 ? 0.4 : 1);
        }
        if (e.finished) mul = Math.min(mul, 0.72);
        drv.drive(e.car, track, cars, mul, timeU.value + entrants.indexOf(e), dt, e.ctl);
        if (e !== me && racing && !e.finished) rivalTricks(e, dt);
        if (!racing) {
          e.ctl.throttle = Math.random() < 0.04 ? 0.8 : e.ctl.throttle * 0.9;
          e.ctl.brake = 0;
        }
      }
    }
    // a damaged car pulls to one side and wobbles a little
    if (me.damage > 70 && !me.finished) me.ctl.steer = clamp(me.ctl.steer + ((me.damage - 70) / 30) * (0.05 + 0.04 * Math.sin(timeU.value * 5)), -1, 1);
    for (const e of entrants) tumbleStep(e, dt, e === me);
    for (const e of entrants) wreckStep(e, dt);
    modTick(dt, me, racing);
    hornStep(dt, me, racing);
    for (const e of entrants) handling(e, dt, e === me);
    tricks(dt, me, racing);
    obstaclesStep(dt, racing);

    // ---- physics (two steps a frame) ----
    const nLocal = entrants.length;
    for (let k = 0; k < 2; k++) {
      for (const e of entrants) e.car.step(dt / 2, e.ctl, ground, !racing);
      if (racing)
        collideCars(cars, (a, b, j, info) => {
          carHit(a, b, j, info);
          // a bike that is hit hard falls over; a lighter knock only makes the rider wobble
          for (const x of [entrants[a], entrants[b]]) if (x && x.car.feel.two && x.wreckT <= 0) knock(x, j, 7);
        });
    }
    for (const e of entrants) e.car.settle(dt, ground);
    // ---- race bookkeeping ----
    for (const e of entrants) {
      const c = e.car;
      const ds = track.wrapDist(c.proj.s - e.lastS);
      e.lastS = c.proj.s;
      if (racing) e.u += ds;
      e.rate = damp(e.rate, ds / dt, 2, dt);
      const done = Math.floor(e.u / track.length);
      if (racing && done > e.lapsDone && e.u > 0) {
        e.lapsDone = done;
        if (e === me && !me.finished) onPlayerLap();
        if (e.lapsDone >= LAPS && !e.finished) {
          e.finished = true;
          e.finishTime = raceT;
          if (e === me) onPlayerFinish();
        }
      }
      // stuck or lost: back onto the road
      if (phase === 'race' && !e.finished && e.wreckT <= 0) {
        const hw = track.at(track.hw, c.proj.s);
        const trying = e.ctl.throttle > 0.3 || e.ctl.brake > 0.3;
        if (c.speed < 1.6 && trying) e.stuckT += dt;
        else e.stuckT = Math.max(0, e.stuckT - dt * 2);
        if (Math.abs(c.proj.d) > hw + 1.5 && e.rate < (e.ai ? 5 : 7)) e.offT += dt;
        else e.offT = Math.max(0, e.offT - dt);
        if (e.stuckT > (e.ai ? 2.2 : 2.8) || e.offT > (e.ai ? 4 : 6)) respawn(e);
      }
    }
    if (phase === 'race' && !me.finished && (inp.keyPressed('KeyR') || inp.pressed('b'))) respawn(me);

    // positions
    const order = ranking();
    place = order.findIndex((r) => r.me) + 1;
    if (phase === 'race' && !me.finished && raceT > 4) {
      // a rival that has just got past the player shouts something (not too often)
      for (const e of entrants) {
        if (e === me || !e.taunt) continue;
        const ahead = e.u > me.u + 2;
        const was = wasAhead.get(e.id);
        if (was === undefined || (ahead === was)) {
          if (was === undefined) wasAhead.set(e.id, ahead);
          continue;
        }
        if (!ahead && e.u > me.u - 2) continue;
        wasAhead.set(e.id, ahead);
        if (ahead && raceT - tauntAt > 14 && raceT - (tauntIds.get(e.id) ?? -99) > 45) {
          tauntAt = raceT;
          tauntIds.set(e.id, raceT);
          hud.taunt(`${e.name}: ”${e.taunt}”`);
        }
      }
    }
    if (phase === 'race' && entrants.every((e) => e === me || e.finished) && !me.finished && entrants.length > 1) {
      if (allDoneT < 0) allDoneT = 0;
      allDoneT += dt;
      const left = Math.ceil(30 - allDoneT);
      if (left !== slowNote) {
        slowNote = left;
        hud.subtitle(`Alla andra är i mål – ${left} s kvar. Klantskalle!`);
      }
      if (allDoneT > 30) {
        hud.subtitle('');
        phase = 'finish';
        phaseT = 0;
        finishPlace = 0;
        hud.msg('Du hann inte. Pinsamt.', 2500, 'small gold');
        audio.fanfare(false);
      }
    }
    if (raceT > 600 && phase === 'race') {
      phase = 'finish';
      phaseT = 0;
      finishPlace = 0;
    }

    // wrong way
    if (phase === 'race' && !me.finished) {
      const th = track.heading(me.car.proj.s);
      const facing = Math.cos(me.car.heading - th);
      const along = me.car.vx * Math.sin(th) + me.car.vz * Math.cos(th);
      if ((facing < -0.3 && me.car.speed > 3) || along < -7) wrongT += dt;
      else wrongT = Math.max(0, wrongT - dt * 3);
      const show = wrongT > 1.1;
      if (show && !wrongShown) audio.wrongWay();
      wrongShown = show;
      hud.wrongWay(show);
    } else hud.wrongWay(false);

    // ---- events: fences, landings, crowd ----
    for (const e of entrants) {
      const c = e.car;
      const isMe = e === me;
      if (c.wallHit > 1.5) {
        const hay = c.wallKind === Fence.Bales;
        if (c.feel.two && !hay) knock(e, c.wallHit, 8.5);
        if (isMe) {
          if (hay) audio.hay(c.wallHit);
          else audio.thud(c.wallHit);
          shake = Math.max(shake, Math.min(0.6, c.wallHit * 0.05));
          mods.bus.hit('wall', c.wallHit);
        }
        const n = Math.min(14, Math.round(c.wallHit * 1.5));
        for (let k = 0; k < (high ? n : n / 2); k++)
          particles.emit({ x: c.x, y: c.y + 0.7, z: c.z, vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 6, life: 0.9, size0: hay ? 0.35 : 0.9, size1: hay ? 0.25 : 2.2, color: hay ? colHay : colDirt, alpha: hay ? 1 : 0.4, drag: 1.2, gravity: hay ? 6 : 0 });
        if (damageK > 0 && c.wallHit > 4) {
          hurt(e, (c.wallHit - 4) * (hay ? 0.5 : 1.4));
          if (!hay) sparks(c.x, c.y, c.z, high ? 10 : 5);
        } else if (carnage && c.wallHit > 5) {
          damageHp(e, (c.wallHit - 5) * (hay ? 0.6 : 1.5) * Math.max(0.3, e.tune.dmgMul), null);
          if (!hay) sparks(c.x, c.y, c.z, high ? 10 : 5);
        }
      }
      c.wallHit = 0;
      if (c.landed > 1.5) {
        if (isMe) {
          audio.thud(c.landed * 1.3);
          shake = Math.max(shake, Math.min(0.5, c.landed * 0.07));
          mods.bus.hit('land', c.landed);
        }
        for (let k = 0; k < (high ? 16 : 7); k++) {
          const a = Math.random() * Math.PI * 2;
          particles.emit({ x: c.x + Math.cos(a) * 1.4, y: c.y + 0.2, z: c.z + Math.sin(a) * 1.8, vx: Math.cos(a) * 3, vy: 0.6, vz: Math.sin(a) * 3, life: 1.2, size0: 1.0, size1: 3.4, color: c.surface === Ground_.Gravel ? colDust : colSmoke, alpha: 0.4, drag: 2 });
        }
        if (c.landed > 5) {
          hurt(e, (c.landed - 5) * 1.5 * (1 - e.tune.assist) * c.feel.landing);
          if (carnage) damageHp(e, (c.landed - 6) * 1.2 * c.feel.landing * e.tune.dmgMul, null);
        }
      }
      c.landed = 0;
      // a battered car smokes from the bonnet
      if (e.damage > 60 && Math.random() < (high ? 0.35 : 0.15) * ((e.damage - 60) / 40 + 0.3)) {
        const sinH = Math.sin(c.heading);
        const cosH = Math.cos(c.heading);
        particles.emit({ x: c.x + sinH * 1.6, y: c.y + 1.1, z: c.z + cosH * 1.6, vx: c.vx * 0.3, vy: 1.2, vz: c.vz * 0.3, life: 1.6, size0: 0.6, size1: 2.6, color: colDark, alpha: 0.45, drag: 1.5, gravity: -0.4 });
      }
      // backfire on a quick upshift at high revs
      if (c.shifted > 0 && isMe && c.throttleIn > 0.8) {
        if (Math.random() < 0.45) {
          audio.pop();
          const sinH = Math.sin(c.heading);
          const cosH = Math.cos(c.heading);
          particles.emit({ x: c.x - sinH * 2.2 - cosH * 0.5, y: c.y + 0.32, z: c.z - cosH * 2.2 + sinH * 0.5, vx: -sinH * 3, vy: 0.3, vz: -cosH * 3, life: 0.18, size0: 0.6, size1: 0.2, color: colFlame, alpha: 1, drag: 4 });
        }
      }
    }
    // splashes along the sea and the lake shore
    if (course.layout.lake && course.layout.lakeKind !== 'ice' && me.car.speed > 5 && !me.car.air) {
      const dm = (lakeDist(me.car.x, me.car.z, course.layout) - 1) * Math.min(course.layout.lake.rx, course.layout.lake.rz);
      if (dm < 6 && Math.random() < (high ? 0.8 : 0.4)) {
        const c = me.car;
        particles.emit({ x: c.x + (Math.random() - 0.5) * 2, y: c.y + 0.2, z: c.z + (Math.random() - 0.5) * 2, vx: (Math.random() - 0.5) * 5, vy: 3 + Math.random() * 3, vz: (Math.random() - 0.5) * 5, life: 0.8, size0: 0.5, size1: 1.6, color: colWater, alpha: 0.7, drag: 1, gravity: 6 });
      }
    }
    cheerCd = Math.max(0, cheerCd - dt);
    if (racing && cheerCd <= 0 && me.car.speed > 10) {
      for (const cp of scenery.crowds)
        if (Math.hypot(me.car.x - cp.x, me.car.z - cp.z) < 34) {
          audio.cheer(0.8);
          cheerCd = 9;
        }
    }

    // ---- sound ----
    const mc = me.car;
    audio.setEngine(me.body);
    audio.playerEngine(mc.rpm, mc.throttleIn, mc.shifted);
    for (const e of entrants) e.car.shifted = 0;
    const onRoad = mc.surface === Ground_.Asphalt || mc.surface === Ground_.Kerb || mc.surface === Ground_.Ice;
    const loose = mc.surface === Ground_.Gravel || mc.surface === Ground_.Snow || mc.surface === Ground_.Sand || mc.surface === Ground_.DeepSnow || mc.surface === Ground_.SoftSand;
    const sp = mc.speed;
    audio.surface(
      onRoad && !mc.air ? clamp((mc.slip - 0.25) * 1.6, 0, 1) : 0,
      loose && !mc.air ? clamp(sp / 25, 0, 1) : 0,
      mc.surface === Ground_.Grass && !mc.air ? clamp(sp / 20, 0, 1) : 0,
      mc.onKerb && sp > 3 && !mc.air ? clamp(sp / 20, 0.3, 1) : 0,
      sp,
    );
    const near = runners()
      .filter((r) => !r.me)
      .map((r) => ({ r, d: Math.hypot(r.car.x - mc.x, r.car.z - mc.z) }))
      .sort((a, b) => a.d - b.d);
    for (let k = 0; k < 2; k++) {
      const n = near[k];
      if (n) audio.otherEngine(k, n.r.car.rpm, Math.pow(clamp(1 - n.d / 70, 0, 1), 2), entrants.find((e) => e.car === n.r.car)?.body);
    }

    // ---- effects ----
    entrants.forEach((e, i) => carEffects(e.car, i, e === me, dt, e.model.wheelPos));
    particles.update(dt);
    gasFx.update(dt);
    skids.flush();
    confetti.update(dt, timeU.value);
    road.update(timeU.value);
    water.update(timeU.value);
    pickupMeshes?.update(timeU.value);
    if (coins) {
      const got = coins.update(dt, timeU.value, mc.x, mc.y, mc.z, mt.magnet, racing && !me.finished, (x, y, z) => sparkleAt(x, y, z, 4, 0.3));
      if (got > 0) {
        coinKr += got * COIN_KR * mt.coinValue;
        stats.coins += got;
        audio.coin();
        for (let i = 0; i < got; i++) mods.bus.pickup('coin');
      }
      hud.setCoins(Math.round(coinKr), true);
    }
    scenery.update(timeU.value, tmpV.set(mc.x, mc.y, mc.z), phase === 'finish' || phase === 'over' ? 1 : phase === 'count' || (phase === 'race' && phaseT < 3) ? 0.8 : 0);
    if (phase === 'finish' && phaseT < 3.2) {
      const k = Math.floor(phaseT / 0.8);
      if (k !== Math.floor((phaseT - dt) / 0.8)) {
        const g = track.point(0, 0);
        confetti.burst(g.x, g.y + 9, g.z, high ? 90 : 45, 7);
        confetti.burst(mc.x, mc.y + 2, mc.z, high ? 50 : 25, 6);
      }
    }

    // ---- HUD ----
    if (racing) {
      const shownLap = Math.min(LAPS, me.lapsDone + 1);
      if (carnage) {
        // Blodbad is decided on points: the big number is the rank by points, the board shows everyone's points
        const table = carnageTable(order);
        const mine = table.find((r) => r.id === me.id)!;
        hud.setPosition(mine.rank, order.length, me.finished ? LAPS + 1 : shownLap, LAPS);
        hud.setScore(mine.points, me.takedowns);
        hud.setHealth(me.hp / me.maxHp, me.hp, me.wreckT);
        if (hudBoard) {
          const byRank = [...order].sort((a, b) => table.find((r) => r.id === a.id)!.rank - table.find((r) => r.id === b.id)!.rank);
          hud.setBoard(byRank.map((r) => ({ ...toRacer(r), pts: table.find((t) => t.id === r.id)!.points, out: (entrants.find((e) => e.id === r.id)?.wreckT ?? 0) > 0 })));
        }
      } else {
        hud.setPosition(me.finished ? finishPlace || place : place, order.length, me.finished ? LAPS + 1 : shownLap, LAPS);
        if (hudBoard) hud.setBoard(order.map((r) => toRacer(r)));
      }
      hud.setTimes(me.finished ? finishTime : raceT, me.finished ? 0 : raceT - lapStart, bestLap);
    }
    if (damageK > 0) hud.setDamage(me.damage);

    // camera input: C (the key), Start, the 🎥 button; the C button is the camera too when there is no nitro
    if (inp.keyPressed('KeyC') || inp.pressed('start') || camPress || (inp.pressed('c') && myTune.charges === 0)) {
      camMode = (camMode + 1) % 3;
      hud.toast(`🎥 ${CAMS[camMode]}`);
    }
    camPress = false;
    shake = Math.max(0, shake - dt * 1.4);
    syncModels(timeU.value);
    placeCamera(dt);
    inp.frame();
  }

  const hudBoard = true;
  const toRacer = (r: Runner): Racer => ({ name: r.name, color: r.color, me: r.me, done: r.finished, x: r.car.x, z: r.car.z });

  function onPlayerLap(): void {
    const me = player();
    const lt = raceT - lapStart;
    lapStart = raceT;
    lapTimes.push(Math.round(lt * 1000));
    coins?.reset();
    mods.bus.lap(me.lapsDone);
    const best = lt < bestLap;
    bestLap = Math.min(bestLap, lt);
    if (me.lapsDone >= LAPS) return;
    if (me.lapsDone === LAPS - 1) {
      hud.msg('SISTA VARVET!', 1800, 'small gold');
      audio.lap(true);
    } else {
      hud.msg(`Varv ${me.lapsDone + 1}`, 1300, 'small');
      audio.lap(false);
    }
    hud.toast(`${best && me.lapsDone > 1 ? '⭐ Bästa varvet! ' : 'Varvtid '}${fmtTime(lt)}`);
  }

  function onPlayerFinish(): void {
    const me = player();
    finishTime = me.finishTime;
    const order = ranking();
    finishPlace = order.findIndex((r) => r.me) + 1;
    phase = 'finish';
    phaseT = 0;
    drift.on = false;
    if (rules) {
      const info: FinishInfo = { place: finishPlace, n: order.length, finished: true, time: Math.round(finishTime * 1000), laps: lapTimes.slice(), kronor: racePrize(rules, finishPlace, order.length), coins: Math.round(coinKr) };
      finishAdj = mods.bus.finish(info);
    }
    hud.msg('MÅL!', 1800, 'gold');
    hud.subtitle(carnage ? `Du körde i mål som ${ordinal(finishPlace)}. Nu räknas poängen…` : finishPlace === 1 ? `🏆 Du kom först! ${fmtTime(finishTime)}` : `Du kom ${ordinal(finishPlace)}. ${fmtTime(finishTime)}`);
    hud.wrongWay(false);
    audio.fanfare(finishPlace === 1);
    audio.cheer(1);
    audio.music(0.75);
    const ms = Math.round(finishTime * 1000) - finishAdj.time;
    if (rules) {
      const medal = raceMedal(course.id, LAPS, ms);
      const record = !opts?.best || ms < opts.best;
      const parts = [medal === 'gold' ? '🥇 Guld!' : medal === 'silver' ? '🥈 Silver!' : medal === 'bronze' ? '🥉 Brons!' : '', record ? '⭐ Nytt rekord!' : ''].filter(Boolean);
      if (parts.length) setTimeout(() => !destroyed && hud.toast(parts.join(' ')), 1900);
    }
  }

  /** The end of the race: the result goes to options.onDone, the score to the shell. */
  function endRace(): void {
    ended = true;
    phase = 'over';
    const me = player();
    const total = runners().length;
    const finished = finishPlace > 0;
    // Blodbad: the result is the rank by points (position points and takedowns), not the order across the line
    const row = carnage ? carnageTable(ranking()).find((r) => r.id === me.id)! : null;
    const placed = finished ? (row ? row.rank : finishPlace) : total;
    let sc = finished ? score(finishPlace, finishTime) : 1200 + Math.round(1800 * clamp(me.u / (LAPS * track.length), 0, 1));
    let detail = finished ? (row ? `${ordinal(row.rank)} på poäng · ${row.points} p` : `${ordinal(finishPlace)} plats · ${fmtTime(finishTime)}`) : `Nästan i mål! · ${Math.min(LAPS, me.lapsDone)} av ${LAPS} varv`;
    if (rules) {
      const ms = finished ? Math.round(finishTime * 1000) - finishAdj.time : 0;
      const medal = ms ? raceMedal(course.id, LAPS, ms) : null;
      const medalTxt = medal === 'gold' ? ' · 🥇' : medal === 'silver' ? ' · 🥈' : medal === 'bronze' ? ' · 🥉' : '';
      // not finishing pays the small taking-part prize
      const kronor = finished ? racePrize(rules, placed, total) : RACE_DNF_PRIZE;
      const coinTotal = Math.round(coinKr);
      const bonus = bonusKr + finishAdj.kronor;
      detail += ` · +${kronor + coinTotal + bonus} kr${medalTxt}`;
      sc += styleBonus();
      // a battered car after Blodbad comes out of it a little scratched, not wrecked
      const damage = carnage ? Math.round((1 - me.hp / me.maxHp) * 35) : Math.round(me.damage);
      opts?.onDone?.({ place: placed, n: total, finished, time: ms, laps: Math.min(LAPS, me.lapsDone), kronor, coins: coinTotal, medal, damage, bonus, timeBonus: finishAdj.time, stats, kind, points: row?.points, takedowns: me.takedowns, wrecked: me.wrecks, roadPlace: finished ? finishPlace : undefined });
    }
    finishEnd(sc, detail);
  }

  function finishEnd(sc: number, detail: string): void {
    if (DEBUG) (window as unknown as { __rallyEnd: unknown }).__rallyEnd = { score: sc, detail };
    // the result card goes over the last frame: leave the picture, not the HUD
    hud.root.style.display = 'none';
    ctx.end(sc, detail);
  }

  // ---- drawing ----
  const up = new THREE.Vector3(0, 1, 0);
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');

  function syncModel(c: Car, m: CarModel, time: number, blink = true, wk = 1, e: Entrant | null = null): void {
    const F = c.feel;
    // a bike that crashed: it falls over, the rider somersaults off, then both are back on the wheels
    const age = e && e.tumbleT > 0 ? TUMBLE_LEN - e.tumbleT : -1;
    let roll = c.lean;
    if (age >= 0) roll += e!.tumbleDir * 1.45 * smooth(0, 0.22, age) * (1 - smooth(1.0, 1.35, age));
    else if (e && e.wobble > 0) roll += Math.sin(time * 34) * 0.16 * e.wobble;
    // a wrecked car flips onto its roof and lies there smoking
    let flip = 0;
    if (e && e.wreckT > 0) {
      flip = smooth(0, 0.6, WRECK_SECONDS - e.wreckT);
      roll += Math.PI * flip;
    }
    m.root.position.set(c.x, c.y + 1.4 * flip, c.z);
    euler.set(-c.slopePitch, c.heading, c.slopeRoll + roll, 'YXZ');
    m.root.quaternion.setFromEuler(euler);
    m.body.position.y = c.susp + (wk - 1) * m.wheelR;
    m.body.rotation.x = clamp(-c.accLong * 0.009, -0.09, 0.07);
    m.body.rotation.z = F.lean > 0.4 ? 0 : clamp(c.accLat * 0.007, -0.08, 0.08);
    const wp = m.wheelPos;
    for (let w = 0; w < m.wheels.length; w++) {
      const wg = m.wheels[w]!;
      const front = wp[w]![1] > 0;
      if (front) wg.rotation.y = c.steerAngle;
      const spin = wg.children[0];
      // the wheel angle from the distance rolled, so a big tractor wheel turns slowly
      if (spin) spin.rotation.x = ((front ? c.wheelRot : c.rearRot) * 0.34) / (m.wheelRadii[w] ?? 0.34);
      wg.scale.setScalar(wk);
      wg.position.y = m.wheelR * wk + Math.max(-0.08, Math.min(0.06, c.susp * 0.3));
    }
    // the rider: leans into the bend, sways with the speed, wobbles after a knock, flies off in a crash
    const rd = m.rider;
    if (rd) {
      const at = m.riderAt;
      let dy = c.susp * 0.6;
      let dz = 0;
      let rx = clamp(c.accLong * -0.012, -0.22, 0.18);
      let rz = c.lean * (F.lean < 0.5 ? 2.4 : 0.4);
      if (age >= 0) {
        const t = Math.min(age, 1.0);
        dy += Math.max(0, 4.6 * t - 4.6 * t * t) * 1.2;
        dz = 1.6 * t * (age < 1 ? 1 : 0);
        rx += age < 1 ? age * Math.PI * 4 : 0;
        rz += age < 1 ? Math.sin(age * 9) * 0.5 : 0;
      } else if (e && e.wobble > 0) rz += Math.sin(time * 30) * 0.5 * e.wobble;
      rd.position.set(at.x, at.y + dy, at.z + dz);
      rd.rotation.set(rx, 0, rz);
    }
    m.brakeMat.color.set(c.braking ? '#ff3a24' : '#701812');
    m.root.visible = !blink || c.ghost <= 0 || (!!e && e.wreckT > 0) || Math.floor(time * 12) % 2 === 0;
    // blob shadow on the ground, fading as the car flies
    const gy = c.groundAt(c.x, c.z, ground);
    const h = Math.max(0, c.y - gy);
    m.shadow.position.set(c.x, gy + 0.06, c.z);
    m.shadow.rotation.y = c.heading;
    (m.shadow.material as THREE.MeshBasicMaterial).opacity = (high ? 0.38 : 0.55) * clamp(1 - h / 4, 0.15, 1);
    const sc = 1 + h * 0.15;
    m.shadow.scale.set(sc, 1, sc);
  }

  function syncModels(time: number): void {
    for (const e of entrants) {
      const isMe = e === meE;
      syncModel(e.car, e.model, time, true, isMe ? mt.wheels : 1, e);
      // bigger cars (trinkets) and cars squashed flat as pancakes
      const base = isMe ? mt.size : 1;
      const q = e.squash;
      e.model.root.scale.set(base * (1 + 0.35 * q), base * (1 - 0.82 * q), base * (1 + 0.35 * q));
      e.model.shadow.scale.multiplyScalar(base);
    }
  }

  function placeCamera(dt: number): void {
    const me = player();
    const c = me.car;
    const sinH = Math.sin(c.heading);
    const cosH = Math.cos(c.heading);
    let fov = 62;
    if (phase === 'intro' || dt === 0) {
      // a sweep from in front of the grid round to behind the player
      const f = smooth(0, 2.6, phaseT);
      const ang = c.heading + Math.PI * (0.85 - 0.85 * f);
      const dist = lerp(22, 7, f);
      const hgt = lerp(8, 2.6, f);
      camPos.set(c.x + Math.sin(ang) * dist, c.y + hgt, c.z + Math.cos(ang) * dist);
      camLook.set(c.x + sinH * lerp(-6, 2.5, f), c.y + 1.1, c.z + cosH * lerp(-6, 2.5, f));
      camYaw = c.heading;
      fov = 58;
    } else if (phase === 'finish' || phase === 'over') {
      const ang = c.heading + 2.2 + phaseT * 0.35;
      tmpV.set(c.x + Math.sin(ang) * 8.5, c.y + 2.8, c.z + Math.cos(ang) * 8.5);
      camPos.lerp(tmpV, 1 - Math.exp(-dt * 3));
      camLook.lerp(tmpV2.set(c.x, c.y + 1.0, c.z), 1 - Math.exp(-dt * 6));
      fov = 55;
    } else if (camMode === 1) {
      me.model.root.updateMatrixWorld();
      me.model.body.localToWorld(camPos.copy(me.model.eye));
      me.model.body.localToWorld(camLook.set(me.model.eye.x, me.model.eye.y - 0.22, me.model.eye.z + 25));
      fov = 74 + smooth(5, 45, c.speed) * 10;
    } else {
      const far = camMode === 2;
      const sz = me.tune.size;
      const velYaw = c.speed > 4 ? Math.atan2(c.vx, c.vz) : c.heading;
      let target = c.heading;
      if (c.speed > 4 && c.vLong > 0) target = c.heading + wrapAngle(velYaw - c.heading) * 0.4;
      camYaw += wrapAngle(target - camYaw) * (1 - Math.exp(-dt * (far ? 3.5 : 5)));
      const dist = ((far ? 13 : 6.6) + c.speed * (far ? 0.05 : 0.035)) * sz;
      const hgt = (far ? 5.4 : 2.45) * sz;
      tmpV.set(c.x - Math.sin(camYaw) * dist, c.y + hgt, c.z - Math.cos(camYaw) * dist);
      const gy = terrain.visual(tmpV.x, tmpV.z) + 1.2;
      if (tmpV.y < gy) tmpV.y = gy;
      camPos.lerp(tmpV, 1 - Math.exp(-dt * 9));
      if (camPos.y < gy) camPos.y = gy;
      tmpV2.set(c.x + Math.sin(camYaw) * 2.5, c.y + (far ? 1.2 : 1.15) * sz, c.z + Math.cos(camYaw) * 2.5);
      camLook.lerp(tmpV2, 1 - Math.exp(-dt * 14));
      fov = (far ? 56 : 60) + smooth(6, 48, c.speed) * (far ? 8 : 16);
    }
    if (nitroT > 0 && phase === 'race') fov += 7;
    camFov = dt === 0 ? fov : damp(camFov, fov, 3, dt);
    camera.position.copy(camPos);
    if (shake > 0 && settings.shake) {
      const t = timeU.value;
      camera.position.x += Math.sin(t * 61) * shake * 0.25;
      camera.position.y += Math.sin(t * 47 + 1) * shake * 0.2;
      camera.position.z += Math.cos(t * 53) * shake * 0.25;
    }
    camera.up.copy(up);
    camera.lookAt(camLook);
    camera.near = camMode === 1 && phase !== 'finish' && phase !== 'over' ? 0.1 : 0.3;
    if (camera.fov !== camFov || dt === 0) {
      camera.fov = camFov;
      camera.updateProjectionMatrix();
    }
  }

  let frames = 0;
  // a slow machine renders fewer pixels rather than stutter
  let resScale = 1;
  let lastFrame = 0;
  let frameMs = 16;
  let slowT = 0;
  let fastT = 0;
  const adaptive = !DEBUG || Q.has('rallyadapt');
  function adapt(): void {
    const now = performance.now();
    const d = lastFrame ? now - lastFrame : 16;
    lastFrame = now;
    if (!adaptive || d > 250) return;
    frameMs = frameMs * 0.9 + d * 0.1;
    if (frameMs > 23) slowT += d / 1000;
    else slowT = Math.max(0, slowT - d / 2000);
    if (frameMs < 15) fastT += d / 1000;
    else fastT = 0;
    let next = resScale;
    if (slowT > 1.5 && resScale > 0.55) next = Math.max(0.55, resScale * 0.85);
    else if (fastT > 6 && resScale < 1) next = Math.min(1, resScale / 0.85);
    if (next !== resScale) {
      resScale = next;
      slowT = 0;
      fastT = 0;
      renderer.setPixelRatio(Math.max(0.6, ctx.dpr * resScale));
      renderer.setSize(W, H, false);
    }
  }
  /** Small health bars over the rivals' heads (Blodbad): projected to the screen each frame. */
  const barList: { id: string; x: number; y: number; hp: number; out: boolean; color: string }[] = [];
  function projectBars(): void {
    camera.updateMatrixWorld();
    barList.length = 0;
    const me = player();
    for (const e of entrants) {
      if (e === me) continue;
      const d = Math.hypot(e.car.x - camera.position.x, e.car.z - camera.position.z);
      if (d > 75) continue;
      tmpV.set(e.car.x, e.car.y + 2.5 * e.car.size, e.car.z).project(camera);
      if (tmpV.z > 1 || Math.abs(tmpV.x) > 1.1 || Math.abs(tmpV.y) > 1.1) continue;
      barList.push({ id: e.id, x: (tmpV.x * 0.5 + 0.5) * W, y: (-tmpV.y * 0.5 + 0.5) * H, hp: e.hp / e.maxHp, out: e.wreckT > 0, color: e.color });
    }
    hud.bars(barList);
  }
  function render(): void {
    frames++;
    if (SKIP > 1 && frames % SKIP !== 1) return;
    adapt();
    sky.update(timeU.value, camera, tmpV.set(player().car.x, player().car.y, player().car.z));
    particles.setScale(H * ctx.dpr, camera.fov);
    gasFx.setScale(H * ctx.dpr, camera.fov);
    gasFx.setViewer(0);
    {
      const pc = player().car;
      particles.setViewer(camMode === 1 || phase === 'intro' ? 0 : Math.hypot(camera.position.x - pc.x, camera.position.y - pc.y, camera.position.z - pc.z));
    }
    weather?.update(timeU.value, camera.position);
    // the minimap and speedometer
    if (phase !== 'intro') {
      const c = player().car;
      hud.drawSpeedo(Math.abs(c.vLong) * 3.6, c.rpm, c.reverse ? -1 : c.gear, 7000);
      hud.drawMap(runners().map(toRacer), timeU.value);
    }
    renderer.render(scene, camera);
    if (carnage && phase !== 'intro') projectBars();
    if (DEBUG) {
      const me = player();
      (window as unknown as { __rally: unknown }).__rally = {
        phase,
        course: course.id,
        raceT,
        place,
        laps: me.lapsDone,
        u: me.u,
        x: me.car.x,
        z: me.car.z,
        speed: me.car.speed,
        ended,
        finishPlace,
        finishTime,
        bestLap,
        idealLap: track.idealLap,
        length: track.length,
        damage: me.damage,
        hp: me.hp,
        dbg,
        takedowns: me.takedowns,
        wrecks: me.wrecks,
        rivalHp: entrants.filter((e) => e !== me).map((e) => Math.round(e.hp)),
        style: stylePts,
        nitro: nitroLeft,
        tumbles,
        mods: { stats: { ...stats }, bonusKr, coinKr, extraBoostT, bananas: obstacles.count, squashed: entrants.filter((e) => e.squashT > 0).length },
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        others: entrants.map((e) => ({ name: e.name, laps: e.lapsDone, u: Math.round(e.u), done: e.finished, t: e.finishTime })),
      };
    }
  }

  void build().catch((err) => {
    console.error(err);
  });

  return {
    pause() {
      paused = true;
      loop?.pause();
      audio.pause();
    },
    resume() {
      paused = false;
      lastFrame = 0;
      loop?.resume();
      audio.resume();
    },
    destroy() {
      destroyed = true;
      loop?.stop();
      ro.disconnect();
      audio.destroy();
      hud.destroy();
      for (const d of disposers) {
        try {
          d();
        } catch (err) {
          console.error(err);
        }
      }
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
        for (const mt of mats) {
          for (const v of Object.values(mt)) if (v instanceof THREE.Texture) v.dispose();
          mt.dispose();
        }
      });
      for (const l of headlights) l.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
};

export default rally;
