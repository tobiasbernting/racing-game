// Galna Rallyt: a little 3D racing game round the farm (and six other courses). Laps against farm
// people in helmets in rally cars: countdown lights, live positions, a minimap, confetti at the end.
//
// A race is opened with RallyOptions (options.ts): the course, the rules (laps, computer cars, difficulty,
// time of day, rain, damage, nitro, pickups) and the player's car. It reports the outcome through
// options.onDone (placing, time, kronor) before ctx.end. Without options it plays the default race.
import * as THREE from 'three';
import { CAR_BODIES, CAR_BODY_DEFS, NITRO_SECONDS, RACE_DNF_PRIZE, cleanRules, newCar, raceMedal, racePrize, type CarBody, type GarageCar } from '../shared/rally.ts';
import { Loop } from '../arcade/kit.ts';
import { CAR_BODY_NAMES } from '../shared/names.ts';
import { AWNING, CHAOS_TEXT, DODGE, DRAFT, EPA_BURST, HOLE_IN_ONE, HOP, ICE_CANNON, JINGLE, KART_SLIDE, KICKSTART, MOW, PASSIVE_RAM, POUND, POWDER, RAMMER, REPAIR, ROCKET, SCAVENGE, SLINGSHOT, SOFTLAND, VIP, WHEELIE_ROCKET, WOBBLE, chaosPick, chargeOf, draftTarget, kitOf, pivotDir, type ActiveDef, type VehicleKit } from '../shared/abilities.ts';
import { rivalById, rivalCast } from '../shared/rivals.ts';
import { LASTLAP_BOOST, archetypeBodies, catchUpBoost, easeOff, type RivalSpec } from '../shared/field.ts';
import { FEGIS_REACH, KIND_AGGRO, carnagePoints, damagePoints, pointsTable, type RaceKind } from '../shared/kinds.ts';
import { DERBY_DAMAGE, DERBY_HP, DERBY_SECONDS, DERBY_WARMUP, DerbyBoard, derbyHeadline } from '../shared/derby.ts';
import { BIG_HIT, RESPAWN_HP, capRammer, TakedownLedger, WRECK_SECONDS, fegisDealt, fegisDrain, fegisTick, impactDamage, maxHpOf, ramPowerOf, zoneOf } from './combat.ts';
import type { GameContext, GameInstance } from '../arcade/types.ts';
import { Driver, steerTo, type Aim } from './ai.ts';
import { arenaCourse, arenaStart } from './arena.ts';
import { buildArenaWorld, type ArenaWorld } from './arenabuild.ts';
import { DerbyBrain, freeSpot, type DerbyFoe } from './derbyai.ts';
import { SHORTCUT_MIN_SPEED, SHORTCUT_SKIP, liftFor, lipOf, placeRamps, shortcutLanded, type RampSpec } from './ramps.ts';
import { buildRampMeshes, type RampMeshes } from './rampmesh.ts';
import { RallyAudio } from './audio.ts';
import { BASE_POWER, Car, collideCars, Ground_, type Controls, type HitInfo } from './car.ts';
import { courseFor } from './variant.ts';
import { canRain, variationFor } from '../shared/variation.ts';
import { Coins } from './coins.ts';
import { Confetti, Debris, Particles, Skids } from './fx.ts';
import { buildAttitude, type Attitude } from './attitude.ts';
import { Post, canPost, gradeFor, setOutlineScreen } from './look.ts';
import { settings } from '../settings.ts';
import { buzz } from '../haptics.ts';
import { shiftLight } from './gears.ts';
import { blobTex } from './geo.ts';
import { Hud, type Racer } from './hud.ts';
import { lakeDist } from './layout.ts';
import { carModel, type CarModel } from './models.ts';
import { MAX_CHARGES, MAX_NITRO_SECONDS, capGrip, capPower, emptyStats, noMods, type FinishAdjust, type FinishInfo, type RaceApi, type TickState } from './mods.ts';
import { Obstacles } from './obstacles.ts';
import { Shots } from './shots.ts';
import { Gimmicks } from './gimmicks.ts';
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
  /** Damage dealt, in points, and the seconds since the last hit it made (FEGIS: nothing dealt for too long). */
  dealt: number;
  idleT: number;
  fegis: boolean;
  /** Seconds the grip is gone after an oil slick, and the next nitro and oil drop of a rival with those modifiers. */
  slickT: number;
  oilNext: number;
  nitroNext: number;
  /** Who this rival is going for, and when it decides again. */
  aimT: number;
  /** Seconds since the last hit on this car (for the boss that heals). */
  calmT: number;
  /** 0..1: mud and grime on the paint, building up during the race. */
  dirt: number;
  /** Seconds until a computer car uses its vehicle's ability, and how far its front wheel is lifted (a bike on boost). */
  abilNext: number;
  /** The active a computer car used last (a talisman can copy it). */
  lastAbil: ActiveDef | null;
  wheelie: number;
  /** Blodbad: a computer car that must fight and has nobody ahead eases off to be caught. */
  eager: boolean;
  /** Seconds left blinded by a snow cloud: slower and wandering. */
  blindT: number;
  /** Derby: the computer driver's brain, seconds since it was wrecked for good, and whether the hulk has been cleared away. */
  brain: DerbyBrain | null;
  wreckAge: number;
  gone: boolean;
}

/** Anyone on the track, for the standings, the minimap and the name tags. */
interface Runner {
  /** Derby: wrecked and cleared away (no dot on the minimap). */
  gone?: boolean;
  id: string;
  name: string;
  color: string;
  car: Car;
  u: number;
  finished: boolean;
  finishTime: number;
  me: boolean;
}

/** The skill of each grid slot; the names and helmets come from the cast (shared/rivals.ts). */
const ROSTER: { name: string; skill: number; power: number; bias: number; wobble: number }[] = [
  { name: '', skill: 0.93, power: 1.0, bias: 0.3, wobble: 0.4 },
  { name: '', skill: 0.91, power: 0.98, bias: -0.6, wobble: 0.8 },
  { name: '', skill: 0.88, power: 0.96, bias: 0.9, wobble: 1.0 },
  { name: '', skill: 0.86, power: 0.94, bias: -1.0, wobble: 1.2 },
  { name: '', skill: 0.83, power: 0.91, bias: 0.2, wobble: 0.9 },
];
const PALETTE = ['#2f6fe0', '#f4c20d', '#2fa84f', '#8a4fd8', '#ff8a1f', '#e8412c', '#18b7c9', '#f06ba8', '#f2f2f2'];
/** Difficulty: the computer cars' courage and how hard the rubber band pulls. */
const DIFF = { easy: { skill: 0.88, power: 0.96, band: 1.35 }, normal: { skill: 1, power: 1, band: 1 }, hard: { skill: 1.06, power: 1.03, band: 0.6 } } as const;

/** What one coin on the road is worth (before trinkets). */
const COIN_KR = 0.9;
/** The least appetite for a fight any computer car has in Blodbad (the racers too go for the hits that are offered). */
const FIGHT_MIN = 0.5;

/** How different two colours look (hue first, then lightness and saturation); under about 0.12 they read as the same car. */
function colorGap(a: string, b: string): number {
  const x = new THREE.Color(a).getHSL({ h: 0, s: 0, l: 0 });
  const y = new THREE.Color(b).getHSL({ h: 0, s: 0, l: 0 });
  let dh = Math.abs(x.h - y.h);
  dh = Math.min(dh, 1 - dh);
  return dh * 2 + Math.abs(x.l - y.l) * 0.6 + Math.abs(x.s - y.s) * 0.3;
}

/** A rival's car paint: its own livery colour, or its trim colour when the first is too like the player's car. */
function liveryPaint(rv: { colors: [string, string] }, player: string, fallback: string): { paint: string; trim: string } {
  const [a, b] = rv.colors;
  if (colorGap(a, player) > 0.12) return { paint: a, trim: b };
  if (colorGap(b, player) > 0.12) return { paint: b, trim: a };
  return { paint: fallback, trim: a };
}

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
  const list = archetypeBodies(spec.archetype, spec.role);
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
  /** Rivningsderby: an enclosed arena, no laps, wrecks are out for good and the last car running wins. */
  const arenaC = opts && rules?.arena ? arenaCourse(rules.arena, opts.seed ?? 20261030, opts.twist?.boss?.body === 'sofa' ? 0.55 : 1) : null;
  const derby = !!arenaC && carnage;
  // the same course never plays the same twice: the seed mirrors it, turns it round, thins or crowds the props
  const vary = opts && rules && !arenaC ? variationFor(rules.course, opts.seed ?? 20261030) : null;
  const course = arenaC ? arenaC.def : courseFor(rules?.course ?? 'farm', vary, field?.narrow ?? 1);
  const LAPS = derby ? 999 : rules ? rules.laps : LAPS_Q;
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
  // the vehicle's own kit (abilities.ts): off in the fair quick race where every body is levelled
  const abilityOn = !!opts && !rules?.sameCars;
  const baseKit = abilityOn ? kitOf(myCar.body) : null;
  /** The kit the player drives with now: the active can be swapped for another vehicle's by a talisman (the passive stays). */
  let kit: VehicleKit | null = baseKit;
  /** The hatchback's passive gives a nitro slot of its own (a perfect drift fills it). */
  const nitroSlots = (): number => myTune.charges + (kit?.passive.id === 'nitroTopUp' || kit?.active.id === 'kartSlide' ? 1 : 0) + (mt.fill && myTune.charges < 1 ? 1 : 0);
  /** The handling a body gets from the player's parts and trinkets (the body can change mid-race with a trinket). */
  const tuneForBody = (body: CarBody): Tune => {
    const t = tuneFor({ ...myCar, body }, !!rules?.sameCars, !!rules?.nitro);
    t.power = capPower(t.power * mt.power);
    t.grip = capGrip(t.grip * mt.grip);
    t.size *= mt.size * (kit?.passive.id === 'slim' ? 0.85 : 1);
    t.dmgMul *= mt.tough;
    t.brakeMul *= mt.brakes;
    t.assist += mt.assist;
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
    const f0 = (rules?.sameCars ? CAR_BODY_DEFS.hatch : CAR_BODY_DEFS[body]).feel;
    const f = mt.mass === 1 ? f0 : { ...f0, mass: f0.mass * mt.mass };
    if (mt.sidecar && body === 'moto') return { ...f, two: false, lean: 0.2, mass: f.mass * 1.7, steer: 0.95, yaw: 1.05, halfW: 0.95, bumpR: 0.8, bumpAt: 0.85 };
    return f;
  };
  // however many charges, a race never has more than MAX_NITRO_SECONDS of nitro in all
  const nitroLen = Math.min(NITRO_SECONDS * mt.nitroSeconds, MAX_NITRO_SECONDS / Math.max(1, myTune.charges));
  const nitroPush = 1 + 0.45 * mt.nitroPower;

  const track = arenaC ? arenaC.track : new Track(course, rainGrip);
  // stunt ramps on the road (a few kickers and one shortcut jump), or the ramps on the arena's floor
  const ramps: RampSpec[] = arenaC ? arenaC.ramps : opts ? placeRamps(track, opts.seed ?? 20261030, course.ctrl.flatMap((c, k) => (c.bump && c.bump > 0 ? [track.ctrlS[k]!] : []))) : [];
  const shortcut = ramps.find((r) => r.kind === 'shortcut') ?? null;
  const hud = new Hud(ctx.root, track, ctx.dpr, ctx.touch);
  if (derby) hud.setArena(arenaC!.shape.hw);
  // on touch screens the third round button is the camera when there is no nitro (info.ts): no second 🎥 then
  // otherwise the camera button lives in the top bar, beside pause, in every scheme (easy to find, never under the thumbs)
  let lastPedals: boolean | null = null;
  const placeCamBtn = (pedals: boolean): void => {
    if (pedals === lastPedals) return;
    lastPedals = pedals;
    const show = ctx.touch && (nitroSlots() > 0 || pedals);
    hud.camBtn.classList.toggle('show', show);
    hud.setCamTop(show);
  };
  placeCamBtn(!!ctx.controls?.pedals);
  hud.setTrinkets(mods.items);
  // the combos that are on, as a small line under the position box a moment after the start
  const comboNames = mods.items.filter((i) => i.id.startsWith('combo.')).map((i) => `${i.emoji} ${i.name}`);
  if (comboNames.length) setTimeout(() => !destroyed && hud.toast(`⭐ Kombo: ${comboNames.slice(0, 3).join(', ')}`), 1500);
  hud.disco(mt.disco);
  const audio = new RallyAudio(ctx.audio, ctx.out);
  const skyPreset = rain ? rainy(course.theme.sky[timeOfDay]) : course.theme.sky[timeOfDay];

  // ---- renderer ----
  const renderer = new THREE.WebGLRenderer({ antialias: high && ctx.dpr < 1.6, powerPreference: 'high-performance' });
  renderer.setPixelRatio(ctx.dpr);
  renderer.toneMapping = TONE === 'aces' ? THREE.ACESFilmicToneMapping : TONE === 'agx' ? THREE.AgXToneMapping : THREE.NeutralToneMapping;
  const grade = gradeFor(course.id, night, rain);
  renderer.toneMappingExposure = skyPreset.exposure * grade.exp;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // the post pass renders more than once a frame: the stats add them up (reset in render())
  renderer.info.autoReset = false;
  renderer.shadowMap.enabled = high;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  // the colour grade, vignette and (on 'high') bloom: one extra pass; without half-float targets a CSS vignette stands in
  const post = canPost(renderer) ? new Post(renderer, high, grade, high && ctx.dpr < 1.6) : null;
  let postOn = !!post;
  let vignette: HTMLElement | null = null;
  if (!post || !high) {
    vignette = document.createElement('div');
    vignette.className = 'rg-vignette';
    vignette.style.display = post ? 'none' : 'block';
    ctx.root.prepend(vignette);
  }
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
  ctx.root.prepend(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 5200);
  let W = 1;
  let H = 1;
  /** The drawing buffer changed size: the grade's targets and the outlines' pixel width follow. */
  const bufSize = new THREE.Vector2();
  const syncPost = (): void => {
    const v = renderer.getDrawingBufferSize(bufSize);
    setOutlineScreen(v.x, v.y);
    post?.resize();
  };
  const fit = (): void => {
    const r = ctx.root.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
    syncPost();
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(fit);
  ro.observe(ctx.root);
  fit();

  // ---- the world, built over a few frames behind a loading card ----
  let sky: Sky;
  let terrain: { height(x: number, z: number): number; visual(x: number, z: number): number; dispose(): void };
  let road: Pick<Road, 'setLights' | 'update'>;
  let water: Pick<Water, 'update'>;
  let scenery: Pick<Scenery, 'crowds' | 'update'> & { group?: THREE.Group };
  let attitude: Pick<Attitude, 'smokers' | 'update'> & { group: { visible: boolean } };
  let arenaWorld: ArenaWorld | null = null;
  let rampMeshes: RampMeshes | null = null;
  let particles: Particles;
  /** The green gas clouds: never faded out in front of the chase camera, so the cloud behind your own car shows. */
  let gasFx: Particles;
  let skids: Skids;
  let confetti: Confetti;
  /** Fire and sparks (additive, so they glow and bloom), and the flying bits of a wreck. */
  let glow: Particles;
  let debris: Debris;
  let weather: Weather | null = null;
  let coins: Coins | null = null;
  const obstacles = new Obstacles();
  const shots = new Shots();
  /** The boss's own tricks on the road (the steward's zones, golf balls, signs, footballs, ice, bowling), when the boss has any. */
  let gimmicks: Gimmicks | null = null;
  /** Ms of time penalty the player picked up in the steward's zones (added to the finish time). */
  let penaltyMs = 0;
  let pickups: Pickup[] = [];
  let pickupMeshes: PickupMeshes | null = null;
  let shadowTex: THREE.Texture;
  const timeU = { value: 0 };
  const entrants: Entrant[] = [];
  /** Every car on the track this frame (refilled each frame). */
  const carsBuf: Car[] = [];
  const disposers: (() => void)[] = [];
  const ground = { height: (x: number, z: number): number => terrain.height(x, z), lift: liftFor(ramps, track) };
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

  const modelFor = (car: GarageCar, sidecar = false, look?: Record<string, number>): CarModel => {
    const m = carModel({ body: car.body, style: car.style, shadowTex, envMap: sky.env, quality: ctx.quality, sidecar, look });
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
    if (arenaC) {
      // the arena: a floor, an island, tyre walls, stands, floodlights and ramps (arenabuild.ts); the rest of the world stands aside
      const aw = (arenaWorld = buildArenaWorld(arenaC, track, ctx.quality, night));
      scene.add(aw.group);
      disposers.push(() => aw.dispose());
      terrain = { height: () => 0, visual: () => 0.03, dispose: () => undefined };
      road = { setLights: () => undefined, update: () => undefined };
      water = { update: () => undefined };
      scenery = { crowds: aw.crowds, update: (t, f, cheer) => aw.update(t, cheer, f) };
      attitude = { group: aw.group, smokers: [], update: () => undefined };
      hud.progress(0.6);
      await nextFrame();
      if (destroyed) return;
    } else {
      const terr = new Terrain(track, ctx.quality, course);
      terrain = terr;
      scene.add(terr.mesh);
      disposers.push(() => terr.dispose());
      hud.progress(0.4);
      await nextFrame();
      if (destroyed) return;
      const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const rd = buildRoad(track, terr, ctx.quality, aniso, course, { wet: rain || course.theme.lit, envMap: sky.env, grid: Math.max(6, 1 + nAi) });
      road = rd;
      scene.add(rd.group);
      disposers.push(() => rd.dispose());
      for (const m of buildFields(terr, ctx.quality)) {
        scene.add(m);
        disposers.push(() => {
          m.geometry.dispose();
          const mt = m.material as THREE.MeshLambertMaterial;
          mt.map?.dispose();
          mt.dispose();
        });
      }
      const wt = buildWater(sky.env, course.layout);
      water = wt;
      for (const m of wt.meshes) scene.add(m);
      disposers.push(() => wt.dispose());
      hud.progress(0.6);
      await nextFrame();
      if (destroyed) return;
      const sc = course.id === 'farm' ? buildScenery(track, terr, ctx.quality, timeU) : buildThemeScenery(track, terr, course, ctx.quality, timeU, course.theme.lit || night, vary);
      scenery = sc;
      scene.add(sc.group);
      disposers.push(() => sc.dispose());
      const at = buildAttitude(track, terr, course, ctx.quality, timeU, course.theme.lit || night, vary, sc.crowds);
      attitude = at;
      scene.add(at.group);
      disposers.push(() => at.dispose());
      // the stunt ramps: kickers beside the racing line and the shortcut jump
      if (ramps.length) {
        const rm = (rampMeshes = buildRampMeshes(track, ramps, ctx.quality));
        scene.add(rm.group);
        disposers.push(() => rm.dispose());
      }
    }
    if (rain || course.theme.snow) {
      const w = (weather = new Weather(rain ? 'rain' : 'snow', ctx.quality));
      scene.add(w.object);
      disposers.push(() => w.dispose());
    }
    if (opts?.coins && !derby) {
      coins = new Coins(track, opts.seed ?? 20261030);
      scene.add(coins.mesh);
      disposers.push(() => coins?.dispose());
    }
    scene.add(obstacles.group, shots.group);
    disposers.push(() => obstacles.dispose(), () => shots.dispose());
    if (twist?.gimmicks?.length && !derby) {
      const g = new Gimmicks(
        {
          track,
          obstacles,
          cars: () => entrants.filter((e) => e.wreckT <= 0 && !e.gone).map((e) => ({ car: e.car, me: e === meE, id: e.id })),
          boss: () => entrants.find((e) => e.spec?.boss && e.wreckT <= 0)?.car ?? null,
          racing: () => phase === 'race',
          hit: (id, kind, side, push, spin) => {
            const e = entrants.find((x) => x.id === id);
            if (e) gimmickHit(e, kind, side, push, spin);
          },
          toast: (text) => hud.toast(text),
          sound: (kind) => {
            if (kind === 'whistle') audio.whistle();
            else if (kind === 'tock') audio.tock();
            else audio.thud(8);
          },
          flipMap: (sec) => hud.flipMap(sec),
        },
        twist.gimmicks,
        opts?.seed ?? 20261030,
      );
      gimmicks = g;
      scene.add(g.group);
      disposers.push(() => g.dispose());
    }
    if (!derby) {
      if (twist?.hay) obstacles.placeHay(track, twist.hay, opts?.seed ?? 20261030);
      else if (field && field.hazards.hay) obstacles.placeHay(track, field.hazards.hay, opts?.seed ?? 20261030);
      if (field) obstacles.placeHazards(track, field.hazards, opts?.seed ?? 20261030);
      if (rules?.pickups) {
        pickups = placePickups(track, opts?.seed ?? 20261030);
        const pm = (pickupMeshes = buildPickups(track, pickups));
        scene.add(pm.group);
        disposers.push(() => pm.dispose());
      }
    }
    hud.progress(0.85);
    await nextFrame();
    if (destroyed) return;
    // cars
    shadowTex = blobTex(64, 0.3);
    disposers.push(() => shadowTex.dispose());
    buildCars();
    particles = new Particles(high ? 1600 : 600);
    gasFx = new Particles(high ? 360 : 180, [2.5, 9]);
    skids = new Skids(high ? 3000 : 1200);
    confetti = new Confetti(high ? 420 : 200);
    glow = new Particles(high ? 500 : 220, [2.5, 9], true);
    debris = new Debris(high ? 44 : 18);
    scene.add(particles.points, gasFx.points, skids.mesh, confetti.mesh, glow.points, debris.mesh);
    disposers.push(
      () => glow.dispose(),
      () => debris.dispose(),
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
    hud.setNitro(Math.floor(nitroLeft), nitroSlots(), false);
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
      {
        let tris = 0;
        let meshes = 0;
        scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh && !(o as THREE.Points).isPoints) return;
          if (!m.geometry) return;
          const g = m.geometry;
          const t = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
          tris += t * ((o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1);
          meshes++;
        });
        w.__rallyStatic = { tris: Math.round(tris), meshes };
      }
      w.__rallyTris = Object.entries(tally)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
        .map(([k, v]) => `${k}=${Math.round(v)}`);
    }
    // test hooks (dev build only): crash the player's bike, honk, swap the vehicle
    if (DEBUG) {
      const warp = (at?: number): number => {
        const me = meE!;
        let s = at ?? 0;
        if (at === undefined) {
          let k = 0;
          for (let i = 0; i < track.n; i++) if (Math.abs(track.curv[i]!) > Math.abs(track.curv[k]!)) k = i;
          s = k * track.ds - 45;
        }
        me.car.place(s, 0, ground);
        const h = me.car.heading;
        me.car.vx = Math.sin(h) * 20;
        me.car.vz = Math.cos(h) * 20;
        me.lastS = me.car.proj.s;
        me.u = s;
        camPos.set(me.car.x - Math.sin(h) * 7, me.car.y + 2.5, me.car.z - Math.cos(h) * 7);
        camYaw = h;
        return s;
      };
      (window as unknown as { __rallyDebug: unknown }).__rallyDebug = {
        /** The race api and the hook bus: a test fires a trick, a mine or a shockwave by hand. */
        api,
        bus: mods.bus,
        look: () => ({ ramUpT, flameT, decoyT, airT, flipA, nearOn }),
        tumble: () => knock(player(), 99, 1),
        honk: () => honk(player()),
        swap: (b: CarBody) => swapPlayerBody(b),
        gas: (n = 2) => api.gas(n),
        /** Stop the loop on the frame just drawn (for a screenshot of a passing effect), and start it again. */
        freeze: () => loop?.pause(),
        thaw: () => loop?.resume(),
        /** Bring the player to a halt where it stands (for a close look at the model). */
        park: () => {
          const c = meE!.car;
          c.vx = c.vz = c.yawRate = 0;
        },
        /** Put the player on the road `gap` m behind the n-th rival, in its lane, rolling at `speed` m/s. */
        behind: (n = 0, gap = 9, speed = 20) => {
          const v = entrants.filter((e) => e !== meE)[n];
          if (!v || !meE) return;
          meE.car.place(v.car.proj.s - gap, v.car.proj.d, ground);
          const h = meE.car.heading;
          meE.car.vx = Math.sin(h) * speed;
          meE.car.vz = Math.cos(h) * speed;
          meE.lastS = meE.car.proj.s;
          meE.u = v.u - gap;
        },
        /** Put the player `gap` m in front of the n-th rival (in its lane), rolling at `speed` m/s, so it has a car behind it. */
        ahead: (n = 0, gap = 12, speed = 20) => {
          const v = entrants.filter((e) => e !== meE)[n];
          if (!v || !meE) return;
          meE.car.place(v.car.proj.s + gap, v.car.proj.d, ground);
          const h = meE.car.heading;
          meE.car.vx = Math.sin(h) * speed;
          meE.car.vz = Math.cos(h) * speed;
          meE.lastS = meE.car.proj.s;
          meE.u = v.u + gap;
        },
        /** Put the player `dist` m from the n-th rival, at its tail ('rear'), its flank ('side') or nose to nose ('front'), driving at it at `speed` m/s. */
        strike: (n = 0, zone: 'rear' | 'side' | 'front' = 'rear', speed = 22, dist = 11) => {
          const v = entrants.filter((e) => e !== meE)[n];
          if (!v || !meE) return;
          const vh = v.car.heading;
          const fx = Math.sin(vh);
          const fz = Math.cos(vh);
          const [dx, dz, h] = zone === 'rear' ? [-fx, -fz, vh] : zone === 'side' ? [fz, -fx, vh - Math.PI / 2] : [fx, fz, vh + Math.PI];
          const pr = track.project(v.car.x + dx * dist, v.car.z + dz * dist, v.car.proj.i, { i: 0, u: 0, s: 0, d: 0 });
          meE.car.place(pr.s, pr.d, ground);
          meE.car.heading = h;
          meE.car.vx = Math.sin(h) * speed;
          meE.car.vz = Math.cos(h) * speed;
          meE.car.yawRate = 0;
          meE.lastS = meE.car.proj.s;
          camPos.set(meE.car.x - Math.sin(h) * 7, meE.car.y + 2.5, meE.car.z - Math.cos(h) * 7);
          camYaw = h;
        },
        /** Make the n-th rival stand still (its controls are cut) or let it drive again. */
        still: (n = 0, on = true) => {
          const v = entrants.filter((e) => e !== meE)[n];
          if (v) dbgStill.set(v.id, on);
        },
        /** Lay a hazard on the road `dist` m in front of the player. */
        hazard: (kind: 'hay' | 'oil' | 'pothole' | 'banana' | 'glass' | 'tent', dist = 22, lat = 0) => {
          const c = meE!.car;
          const p = track.point(c.proj.s + dist, c.proj.d + lat);
          obstacles.add(kind, p.x, p.y, p.z, null, track.heading(c.proj.s + dist));
        },
        /** Use the vehicle's ability now (ignores the cooldown). */
        ability: () => {
          abilCd = 0;
          if (useAbility(meE!)) {
            stats.abilityUses++;
            mods.bus.ability();
            abilCd = kit?.active.cooldown ?? 0;
          }
        },
        drift: (tier = 3) => topUpNitro(tier),
        warp,
        /** Hide a part of the world to see what it costs: 'attitude', 'fx', 'scenery'. */
        hide: (what: string) => {
          if (what === 'attitude') attitude.group.visible = false;
          if (what === 'scenery' && scenery.group) scenery.group.visible = false;
          if (what === 'fx') glow.points.visible = debris.mesh.visible = false;
        },
        /** A fixed camera (x, y, z looking at x, y, z); no arguments puts the chase camera back. */
        cam: (...v: number[]) => (dbgCam = v.length === 6 ? v : null),
        /** Where the k-th burning barrel or flare is. */
        smokerAt: (k = 0) => attitude.smokers[k] ?? null,
        /** Warp to just before the k-th burning barrel or flare. */
        smoker: (k = 0, back = 20) => {
          const sm = attitude.smokers[k];
          if (!sm) return -1;
          const pr = track.project(sm.x, sm.z, -1, { i: 0, u: 0, s: 0, d: 0 });
          return warp(pr.s - back);
        },
        abilityState: () => ({ cd: abilCd, kick: kickT, dodge: dodgeT, charge: chargeT, rocket: rocketT, nitro: nitroLeft, uses: stats.abilityUses, junk, burst: burstT }),
        /** The ramps of this course (road coordinates), and the player put at (s, d) on the road, rolling at `speed` along it. */
        ramps: () => ramps,
        scene,
        at: (s: number, d = 0, speed = 0) => {
          const me = meE!;
          me.car.place(s, d, ground);
          const h = me.car.heading;
          me.car.vx = Math.sin(h) * speed;
          me.car.vz = Math.cos(h) * speed;
          me.lastS = me.car.proj.s;
          camPos.set(me.car.x - Math.sin(h) * 7, me.car.y + 2.5, me.car.z - Math.cos(h) * 7);
          camYaw = h;
        },
        /** The derby board: who is out, how long is left. */
        board: () => ({ alive: board.alive(), left: board.timeLeft(raceT), over: derbyOver, standings: board.standings(hpFrac) }),
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
    }
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
      const st = derby ? arenaStart(track, arenaC!.shape, arenaC!.cx, arenaC!.cz, slot, total, 0.03) : null;
      const s = st ? st.s : -11 - slot * 9;
      const d = st ? st.d : slot % 2 ? -3.4 : 3.4;
      const isMe = slot === mySlot;
      const k = isMe ? -1 : ai++;
      const boss = !isMe && k === 0 ? twist?.boss : undefined;
      // with a field plan the kit (skill, upgrades, modifiers, temper) comes from it; without one the old roster
      const spec = isMe || !field ? null : field.rivals[k] ?? null;
      const rv = isMe ? null : spec && !spec.boss ? rivalById(spec.id) ?? cast[k]! : cast[k]!;
      const r0 = isMe ? null : { ...ROSTER[k]!, name: rv!.name };
      // a boss takes the first rival's place with its own name, helmet, body and colour
      const r = r0 && boss ? { ...r0, name: boss.name, skill: boss.skill, power: boss.power, bias: 0 } : r0;
      const livery = !isMe && !boss && rv && opts ? liveryPaint(rv, myCar.style.paint, colors[k] ?? PALETTE[k]!) : null;
      const color = isMe ? (opts ? myCar.style.paint : ctx.player.color) : boss ? boss.color : livery ? livery.paint : colors[k] ?? PALETTE[k]!;
      const body: CarBody = isMe ? myCar.body : boss ? boss.body : opts ? (spec ? archetypeBody(opts.seed ?? 20261030, k, spec) : rivalBody(opts.seed ?? 20261030, k)) : 'hatch';
      const helm = boss ? { design: boss.helmet, color: boss.color, trim: boss.trim } : rv ? { design: rv.helmet, color: rv.colors[0], trim: livery ? livery.trim : rv.colors[1] } : undefined;
      const gcar = isMe ? myCar : opts ? aiCar(k, color, body, helm) : arcadeCar(color);
      if (boss?.extras) gcar.style.extras = [...boss.extras];
      if (boss) gcar.style.number = 1;
      if (!isMe && !opts) gcar.style.number = k + 2;
      const model = modelFor(isMe || opts ? gcar : { ...gcar, body: 'hatch' }, isMe && mt.sidecar && body === 'moto', isMe ? opts?.look : undefined);
      disposers.push(() => model.dispose());
      const car = new Car(track);
      car.setBody(body, feelOf(body, isMe, spec));
      car.place(s, d, ground);
      if (st) car.heading = st.heading;
      car.offroadAt = offroad();
      // touch screens get a kinder field in Söndagsåkare only; normal mode is the same on every device
      const kid = ctx.touch && !!field?.calm;
      let driver: Driver | null = null;
      let power = 1;
      const tune = isMe ? myTune : tuneFor(newCar(0, 'hatch', ''), false, false);
      if (r && spec) {
        // a rival with a kit: the skill and the upgrades of this point in the run (Söndagsåkare on touch screens gets a slightly kinder field)
        const kidK = kid ? 0.93 : 1;
        const sharp = field!.sharp;
        driver = new Driver({ skill: spec.skill * kidK, bias: r.bias * (1 - 0.5 * sharp), lineUse: spec.lineUse, wobble: r.wobble * (1 - 0.6 * sharp), phase: k * 1.7, late: spec.late });
        driver.p.aggro = spec.aggro;
        power = spec.power * (kid ? 0.92 : 1) * (twist?.rivalPower ?? 1) * lerp(1, CAR_BODY_DEFS[body].power, 0.5);
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
        dealt: 0,
        // a few seconds of grace at the start so nobody is marked before the cars have met
        idleT: -6,
        fegis: false,
        slickT: 0,
        oilNext: 6 + Math.random() * 8,
        nitroNext: 5 + Math.random() * 6,
        aimT: Math.random() * 0.5,
        calmT: 9,
        dirt: 0,
        abilNext: 9 + Math.random() * 10,
        lastAbil: null,
        wheelie: 0,
        eager: false,
        blindT: 0,
        brain: derby && !isMe && spec ? new DerbyBrain({ aggro: spec.aggro, skill: clamp(spec.skill * (kid ? 0.93 : 1), 0.7, 1.06), phase: k * 1.7 }) : null,
        wreckAge: 0,
        gone: false,
      };
      e.maxHp = maxHpOf(car.feel.mass, spec?.hp ?? 1) * (isMe ? mt.hp * (1 + 0.08 * (myCar.parts.armour ?? 0)) : 1);
      if (derby) e.maxHp = Math.round(e.maxHp * DERBY_HP);
      e.hp = e.maxHp;
      if (isMe) meE = e;
      entrants.push(e);
    }
    board = new DerbyBoard(entrants.map((e) => e.id), DERBY_SECONDS);
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
  const dbgStill = new Map<string, boolean>();
  const dbg = { contacts: 0, aims: 0, wrecks: 0, rivalTake: 0, dealt: 0, flankHits: 0, fegisStarts: 0 };
  const tauntIds = new Map<string, number>();
  let tauntAt = -99;
  let ended = false;
  /** Derby: the board of who is still running, the clock after the player is wrecked, whether it is over, and the outcome to report. */
  let board = new DerbyBoard([], DERBY_SECONDS);
  let derbyOver = false;
  let playerOutT = 0;
  let derbyTimeUp = false;
  let derbyTable: { name: string; place: number; alive: boolean; takedowns: number; dealt: number; points: number; survival: number; hp: number; outAt: number | null; me: boolean }[] = [];
  /** The shortcut jump: the take-off in flight, and whether the player has taken it. */
  let scTake = false;
  let scDone = false;
  let finishPlace = 0;
  let finishTime = 0;
  let slowNote = 0;
  // nitro, drift boost and style points (the player only)
  let nitroLeft = myTune.charges;
  let nitroBank = 0;
  // the upgrades (run/upgrades.ts): the bumper's boost, the flip clock, the decoy, the fire behind, the near-miss clock per car
  let ramUpT = 0;
  let ramUpK = 1;
  let airT = 0;
  let flipA = 0;
  let flipShow = 0;
  let decoyT = 0;
  let flameT = 0;
  const decoyAt = { x: 0, z: 0 };
  const nearAt = new Map<string, number>();
  const nearOn = mods.items.some((i) => i.id === 'stunt.near');
  // the vehicle's active ability (abilities.ts): seconds until it is ready, and what is running
  let abilCd = 0;
  let kickT = 0;
  let dodgeT = 0;
  let chargeT = 0;
  let rocketT = 0;
  /** phase 10: the EPA burst running, the garbage truck's load, the kart's slipstream, the next jingle, the VIP lane, the blades, the cart's wobble clock */
  let burstT = 0;
  let junk = 0;
  let draftT = 0;
  let jingleT = 4;
  let vipT = 0;
  let mowT = 0;
  let drafting = false;
  let rocketKick = 0;
  /** Where a snow cloud hangs: centre, heading and seconds left (rivals driving into it are blinded). */
  const clouds: { x: number; z: number; h: number; t: number }[] = [];
  let loadCd = 0;
  let landCd = 0;
  let abilKey = '';
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
  let lastDenied = -9;
  let mudSaid = -9;
  let beatT = 0;
  const sayIds = new Map<string, number>();
  const triggers: Record<string, number> = {};
  const trigAt = new Map<string, number>();
  const passed = new Map<string, boolean>();
  let wasAirborne = false;
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
  const colFlareSmoke = new THREE.Color('#ff4a52');
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
      r.gone = e.gone;
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
    const cs = ctx.controls;
    const pedals = !!cs?.pedals;
    placeCamBtn(pedals);
    const car0 = e.car;
    car0.manual = !!cs?.manual;
    car0.engineBrake = pedals ? 2.4 : 1;
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
    if (ctx.touch && !pedals && brk < 0.1 && phase === 'race') {
      const v = Math.max(0, car.vLong);
      const target = track.at(track.vmax, p.s + 4 + v * 0.3) * 0.95;
      if (v > target + 2.5) {
        thr = 0;
        brk = clamp((v - target - 2.5) / 7, 0, 0.55);
      } else thr = Math.max(thr, v > target ? 0.4 : 1);
    }
    thrIn = thr > thrIn ? Math.min(thr, thrIn + dt * 6) : thr;
    // a gentle hand keeping the car on the road (strong for the little ones)
    // (not in a derby: the floor is a free-for-all and the road-keeping hand would only steer you round the ring)
    const w = derby ? 0 : ctx.touch ? 0.55 : 0.14;
    const v = Math.max(0, car.vLong);
    const off = clamp(p.d, -(hw - 2.6), hw - 2.6);
    const assist = w > 0 ? steerTo(car, track, 6 + v * 0.45, off) : 0;
    let steer = steerIn + w * assist * (1 - 0.65 * Math.abs(steerIn));
    if (Math.abs(p.d) > hw - 1.2 && Math.sign(p.d) * Math.sin(car.heading - track.heading(p.s)) > 0) steer += (ctx.touch ? 0.3 : 0.1) * -Math.sign(p.d);
    e.ctl.throttle = thrIn;
    e.ctl.brake = brk;
    e.ctl.steer = clamp(steer, -1, 1);
    e.ctl.handbrake = inp.down('a');
    // the shift buttons (Q / E, LB / RB, − and +): one press, one shift
    e.ctl.shift = car0.manual ? (inp.pressed('su') ? 1 : 0) - (inp.pressed('sd') ? 1 : 0) : 0;
  }

  // ---- respawn ----
  function respawn(e: Entrant): void {
    const c = e.car;
    let s = c.proj.s - 4;
    let d = 0;
    if (derby) {
      // a free spot of the floor, not the scrum it got stuck in
      const spot = freeSpot(track, entrants.filter((o) => o !== e && o.wreckT <= 0).map((o) => o.car));
      s = spot.s;
      d = spot.d;
    } else
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
        particles.emit({ x, y: c.y + 0.25, z, vx: (Math.random() - 0.5) * 1.5, vy: 0.6 + Math.random(), vz: (Math.random() - 0.5) * 1.5, life: 0.8 + Math.random() * 0.6, size0: 0.6, size1: 2.5, color: smoke, alpha: 0.34 * slip, drag: 2.2, gravity: -0.3 });
      }
      // grass and earth flying off the tyres
      if (surf === Ground_.Grass && sp > 5 && Math.random() < rate * 0.6) {
        particles.emit({ x, y: c.y + 0.2, z, vx: -sinH * sp * 0.25 + (Math.random() - 0.5) * 2.5, vy: 2 + Math.random() * 2.5, vz: -cosH * sp * 0.25 + (Math.random() - 0.5) * 2.5, life: 0.7, size0: 0.25, size1: 0.18, color: Math.random() < 0.6 ? colGrass : colDirt, alpha: 0.95, drag: 0.6, gravity: 9 });
        if (Math.random() < 0.3) particles.emit({ x, y: c.y + 0.3, z, vy: 0.6, life: 1.2, size0: 0.8, size1: 2.6, color: colDirt, alpha: 0.3, drag: 2 });
      }
    }
  }

  /** Damage from a knock of strength `j` (m/s), scaled by the rules and the car's toughness. */
  /** How battered a car looks and acts, 0..100: plating in the races with damage, health in Blodbad. */
  function wearOf(e: Entrant): number {
    return carnage ? Math.round(100 * (1 - e.hp / e.maxHp) * 0.9) : e.damage;
  }

  function hurt(e: Entrant, j: number, k = 1): void {
    if (damageK <= 0 || j <= 0 || (e === meE && dodgeT > 0)) return;
    const before = e.damage;
    e.damage = clamp(e.damage + Math.min(15, j * k) * e.tune.dmgMul * damageK, 0, 100);
    if (Math.floor(e.damage / 4) !== Math.floor(before / 4)) e.model.setDamage(e.damage);
  }

  const colSparkHot = new THREE.Color(3.2, 2.1, 0.7);
  const colSparkWhite = new THREE.Color(3, 2.8, 2.2);
  /** Hot sparks: bright, quick, thrown low and bouncing off the road (additive, so they glow). */
  function sparks(x: number, y: number, z: number, n: number): void {
    for (let k = 0; k < n; k++) glow.emit({ x, y: y + 0.45, z, vx: (Math.random() - 0.5) * 11, vy: 1.5 + Math.random() * 5, vz: (Math.random() - 0.5) * 11, life: 0.3 + Math.random() * 0.35, size0: 0.2, size1: 0.05, color: k % 3 ? colSparkHot : colSparkWhite, alpha: 1, drag: 0.8, gravity: 12 });
  }

  // ---- the player's tricks: nitro, the drift boost, style points ----
  function tricks(dt: number, me: Entrant, racing: boolean): void {
    const inp = ctx.input;
    const c = me.car;
    // nitro on C (L, gamepad X/Y, the 🔥 button); the C key itself is the camera
    const nitroKey = inp.pressed('c') && !inp.keyPressed('KeyC');
    if (nitroSlots() > 0 && nitroKey && racing && phase === 'race' && !me.finished && nitroT <= 0) {
      if (nitroLeft >= 1) {
        nitroLeft--;
        nitroT = nitroLen;
        mods.bus.boost('nitro');
        stats.boosts++;
        audio.boost();
        hud.toast('🔥 Nitro!');
        hud.pop('boost:nitro', '🔥', 'Nitro!', 'boost');
      } else hud.toast('Nitron är slut');
    }
    if (racing && !me.finished && phase === 'race') {
      if (nitroT > 0) stats.nitroSeconds += Math.min(dt, nitroT);
      if (c.air) {
        stats.airSeconds += dt;
        if (!wasAirborne) stats.airJumps++;
      }
      stats.topSpeed = Math.max(stats.topSpeed, Math.abs(c.vLong) * 3.6);
    }
    wasAirborne = c.air;
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
          drift.t += dt * mt.driftRate * (kit?.passive.id === 'longSlide' ? 1.35 : 1);
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
          hud.pop('boost:drift', '🌀', ['', 'Turbo!', 'Superturbo!', 'Megaturbo!'][drift.tier]!, 'boost');
          stats.boosts++;
          mods.bus.boost('drift');
          topUpNitro(drift.tier);
        }
        if (drift.t > 0.4) mods.bus.drift(drift.t, drift.tier);
        stats.longestDrift = Math.max(stats.longestDrift, drift.t);
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
    hud.setNitro(Math.floor(nitroLeft), nitroSlots(), nitroT > 0);
    hud.setStyle(opts ? stylePts : 0);
    // flames and speed lines while the nitro burns
    const burn = nitroT > 0 || rocketT > 0 && kit?.active.id === 'rocket' || burstT > 0 ? 1 : driftBoostT > 0 ? 0.5 : 0;
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
    e.blindT = Math.max(0, e.blindT - dt);
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
          hud.pop('boost:pad', '⚡', 'Boost!', 'boost');
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
    c.grip = e.tune.grip * rainGrip * damageGrip(d) * (e.mudT > 0 ? 0.8 : 1) * (e.slickT > 0 ? 0.55 : 1) * (twist?.grip ?? 1) * (isMe && loose ? mt.offroad : 1) * (isMe && kickT > 0 ? KICKSTART.grip : 1);
    e.rivalBoostT = Math.max(0, e.rivalBoostT - dt);
    e.squashT = Math.max(0, e.squashT - dt);
    e.squash = damp(e.squash, e.squashT > 0 ? 1 : 0, 14, dt);
    if (!isMe) c.boost = e.rivalBoostT > 0 ? 1.35 : 1;
    if (isMe) {
      c.power = e.basePower * damagePower(d) * (loose ? mt.offroad : 1) * (e.squashT > 0 ? 0.4 : 1);
      let b = Math.max(nitroT > 0 ? nitroPush : 1, driftBoostT > 0 ? 1.3 : 1, extraBoostT > 0 ? extraBoostK : 1, chargeT > 0 ? RAMMER.strength : 1);
      // the motorbike pops a wheelie on boost and goes a little faster for it
      if (kit?.passive.id === 'wheelieBoost' && b > 1.05) b *= 1.06;
      c.boost = b;
      c.ram = ramNow();
    }
    // a bike lifts its front wheel while it boosts (the player's and the computer's alike)
    if (e.body === 'moto') {
      const up = isMe ? c.boost > 1.05 && !c.air : e.rivalBoostT > 0 && !c.air;
      e.wheelie = damp(e.wheelie, up ? (isMe && rocketT > 0 ? 0.5 : 0.34) : 0, 7, dt);
    }
  }

  // ---- trinkets: what a hook can do to the race ----
  const tmpCol = new THREE.Color();
  const tickState: TickState = { speed: 0, steer: 0, handbrake: false, handbrakePressed: false, straight: false, air: false, drifting: false, boosting: false, lap: 1, place: 1, racing: false, time: 0, braking: false, wheelie: false, carnage: false, derby: false };

  function sparkleAt(x: number, y: number, z: number, n: number, spread: number): void {
    for (let k = 0; k < (high ? n : Math.ceil(n / 2)); k++) {
      tmpCol.setHSL(Math.random(), 0.9, 0.65);
      particles.emit({ x: x + (Math.random() - 0.5) * spread * 2, y: y + 0.3 + Math.random() * 1.2, z: z + (Math.random() - 0.5) * spread * 2, vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 2, vz: (Math.random() - 0.5) * 3, life: 0.7 + Math.random() * 0.4, size0: 0.35, size1: 0.05, color: tmpCol, alpha: 1, drag: 1.2, gravity: 3 });
    }
  }

  /** The hatchback's passive: a long, clean drift (tier 3) fills a nitro charge, a shorter good one (tier 2) half of one. */
  function topUpNitro(tier: number): void {
    if (kit?.passive.id !== 'nitroTopUp' || tier < 2) return;
    nitroBank += tier >= 3 ? 1 : 0.5;
    if (nitroBank >= 1 && nitroLeft < nitroSlots()) {
      nitroBank -= 1;
      nitroLeft = Math.min(nitroSlots(), Math.floor(nitroLeft) + 1);
      hud.toast('🔥 Perfekt sladd! Nitron fylldes på');
      hud.pop('passive', '🔥', kit.passive.name, 'abil');
      audio.chime();
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
    ramUpT = Math.max(0, ramUpT - dt);
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
      ts.braking = me.ctl.brake > 0.6 && c.speed > 12;
      ts.wheelie = me.wheelie > 0.2;
      ts.carnage = carnage;
      ts.derby = derby;
      mods.bus.tick(dt, ts);
    }
    stuntStep(dt, me, racing);
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


  // ---- the car that grows (run/upgrades.ts): stunts, fire behind, the decoy, the shockwave ----
  /** Airtime, flips, near misses, the fire behind and the decoy. */
  function stuntStep(dt: number, me: Entrant, racing: boolean): void {
    const c = me.car;
    const live = racing && phase === 'race' && !me.finished;
    if (c.air && live) {
      airT += dt;
      if (mt.flip > 0 && airT > 0.3) flipA += dt * (5.4 + mt.flip * 1.3);
      flipShow = flipA;
    } else {
      if (airT > 0 && live) {
        if (airT >= 0.7) mods.bus.trick('air', airT);
        const flips = Math.floor(flipA / (Math.PI * 2) + 0.3);
        if (flips >= 1) {
          mods.bus.trick('flip', flips);
          sparkleAt(c.x, c.y, c.z, 10, 1.2);
        }
        // down on the wheels again: whatever angle is left eases out
        if (flipA > 0) {
          let r = flipA % (Math.PI * 2);
          if (r > Math.PI) r -= Math.PI * 2;
          flipShow = r;
        }
      }
      airT = 0;
      flipA = 0;
      flipShow = damp(flipShow, 0, 16, dt);
      if (Math.abs(flipShow) < 0.01) flipShow = 0;
    }
    if (nearOn && live && c.speed > 18) {
      const sinH = Math.sin(c.heading);
      const cosH = Math.cos(c.heading);
      for (const o of entrants) {
        if (o === me || o.finished || o.wreckT > 0 || o.car.ghost > 0) continue;
        const dx = o.car.x - c.x;
        const dz = o.car.z - c.z;
        const fwd = dx * sinH + dz * cosH;
        if (Math.abs(fwd) > 2.2) continue;
        const lat = Math.abs(dx * cosH - dz * sinH);
        const hw = c.feel.halfW + o.car.feel.halfW;
        if (lat < hw * 1.03 || lat > hw + 1.1) continue;
        if (Math.hypot(c.vx - o.car.vx, c.vz - o.car.vz) < 8 || raceT - (nearAt.get(o.id) ?? -9) < 2.5) continue;
        nearAt.set(o.id, raceT);
        mods.bus.trick('near', 1 - (lat - hw) / 1.1);
      }
    }
    if (flameT > 0) {
      flameT -= dt;
      const sinH = Math.sin(c.heading);
      const cosH = Math.cos(c.heading);
      for (let k = 0; k < (high ? 5 : 3); k++) {
        const back = 1.8 + Math.random() * 1.2;
        glow.emit({ x: c.x - sinH * back + cosH * (Math.random() - 0.5) * 0.8, y: c.y + 0.5 + Math.random() * 0.4, z: c.z - cosH * back - sinH * (Math.random() - 0.5) * 0.8, vx: -sinH * (11 + Math.random() * 5) + (Math.random() - 0.5) * 2, vy: 0.3 + Math.random(), vz: -cosH * (11 + Math.random() * 5) + (Math.random() - 0.5) * 2, life: 0.4 + Math.random() * 0.25, size0: 0.7, size1: 2.4, color: colFireball, alpha: 0.85, drag: 1.4, gravity: -0.5 });
      }
      for (const o of around()) {
        if (o.fwd > 0 || o.fwd < -17 || Math.abs(o.lat) > 3.8) continue;
        const f = Math.exp(-dt * 2.4);
        o.e.car.vx *= f;
        o.e.car.vz *= f;
        if (carnage) {
          o.e.calmT = 0;
          if (Math.random() < dt * 2) ledger.hit(o.e.id, me.id, 8, timeU.value);
          damageHp(o.e, 13 * dt, me);
        }
      }
    }
    if (decoyT > 0) {
      decoyT -= dt;
      api.slowBehind(34, 1.3, dt);
      if (Math.random() < 0.6) sparkleAt(decoyAt.x, c.y, decoyAt.z, 1, 0.8);
    }
  }

  /** A pulse of force from the car: cars within `radius` m are thrown out, and in Blodbad lose some health. */
  function shockwave(radius: number, push: number, dmg: number): void {
    const me = player();
    const c = me.car;
    let hit = 0;
    for (const o of around()) {
      if (o.d > radius || o.d < 0.1) continue;
      const f = 1 - 0.55 * (o.d / radius);
      o.e.car.vx += ((o.e.car.x - c.x) / o.d) * push * f;
      o.e.car.vz += ((o.e.car.z - c.z) / o.d) * push * f;
      o.e.car.vy += 3.2 * f;
      o.e.car.yawRate += (Math.random() - 0.5) * 5;
      o.e.squashT = Math.max(o.e.squashT, 0.5 * f);
      if (carnage && dmg > 0) {
        ledger.hit(o.e.id, me.id, dmg, timeU.value);
        damageHp(o.e, dmg * f, me);
      }
      hit++;
    }
    shake = Math.max(shake, hit ? 0.4 : 0.2);
    ring(c, 28, 11, colHot);
    sparks(c.x, c.y, c.z, high ? 12 : 6);
    if (hit) audio.boom();
  }

  /** A blinding cloud hanging behind the car for `sec` seconds (the snowmobile's powder, as a dirty trick). */
  function blindCloud(sec: number): void {
    const c = player().car;
    const sinH = Math.sin(c.heading);
    const cosH = Math.cos(c.heading);
    clouds.push({ x: c.x - sinH * (POWDER.reach * 0.5), z: c.z - cosH * (POWDER.reach * 0.5), h: c.heading, t: sec });
    while (clouds.length > 3) clouds.shift();
    for (let k = 0; k < (high ? 30 : 14); k++) {
      const back = 2 + Math.random() * POWDER.reach * 0.5;
      const side = (Math.random() - 0.5) * POWDER.width;
      particles.emit({ x: c.x - sinH * back + cosH * side, y: c.y + 0.6 + Math.random() * 1.4, z: c.z - cosH * back - sinH * side, vx: (Math.random() - 0.5) * 1.5, vy: 0.2 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 1.5, life: 1.8 + Math.random() * 1.2, size0: 1.6, size1: 5.5, color: colSmoke, alpha: 0.6, drag: 1.2, gravity: -0.05 });
    }
    audio.poof();
  }

  /** The extras a vehicle's second ability upgrade adds to its active. */
  function abilityPlus(id: string, me: Entrant): void {
    const c = me.car;
    const sinH = Math.sin(c.heading);
    const cosH = Math.cos(c.heading);
    switch (id) {
      case 'oil':
        api.oil();
        break;
      case 'hay':
        for (const sx of [-1, 1]) obstacles.add('hay', c.x - sinH * 6.2 + cosH * sx * 1.4, c.y, c.z - cosH * 6.2 - sinH * sx * 1.4, c);
        stats.hazards += 2;
        audio.hay(8);
        break;
      case 'shock':
        shockwave(11, 7, 10);
        break;
      case 'boost':
        api.boost(0.9, 1.25);
        break;
      case 'smoke':
        blindCloud(2.8);
        break;
      case 'coins':
        api.kronor(14);
        break;
      case 'nitro':
        api.nitro(0.35);
        break;
      case 'decoy':
        decoyT = 2.4;
        decoyAt.x = c.x;
        decoyAt.z = c.z;
        poof(c.x, c.y, c.z);
        hud.toast('🎭 Lockbilen står kvar och lurar alla');
        break;
      case 'heal':
        api.heal(0.2);
        break;
      case 'mine':
        api.mine();
        break;
    }
  }

  /** The active, stretched by the upgrades: a longer run for the timers that were just set, and the extra effects. */
  function useAbilityBoosted(me: Entrant): boolean {
    const c = me.car;
    const b = { kick: kickT, dodge: dodgeT, charge: chargeT, rocket: rocketT, burst: burstT, vip: vipT, mow: mowT, extra: extraBoostT, ghost: c.ghost, vy: c.vy };
    if (!useAbility(me)) return false;
    const k = mt.abilDur - 1;
    if (k > 0.001) {
      kickT += (kickT - b.kick) * k;
      dodgeT += (dodgeT - b.dodge) * k;
      chargeT += (chargeT - b.charge) * k;
      rocketT += (rocketT - b.rocket) * k;
      burstT += (burstT - b.burst) * k;
      vipT += (vipT - b.vip) * k;
      mowT += (mowT - b.mow) * k;
      extraBoostT += (extraBoostT - b.extra) * k;
      c.ghost += (c.ghost - b.ghost) * k;
      if (kit?.active.id === 'hop') c.vy += (c.vy - b.vy) * k;
    }
    for (const id of mt.plus) abilityPlus(id, me);
    return true;
  }

  // ---- the vehicle's ability: passives and the active on its own button ----
  /** The ram power of the player's bumper: the trinkets', the vehicle's own, and the tractor's charge. */
  const ramNow = (): number => Math.min(RAMMER.maxRam, Math.max(ramPowerOf(mt.shove), kit ? PASSIVE_RAM[myCar.body] ?? 1 : 1) * (chargeT > 0 ? RAMMER.ram : 1) * (ramUpT > 0 ? ramUpK : 1));

  /** Cars around the player: ahead (fwd > 0) and beside (lat), in the player's frame. */
  function around(): { e: Entrant; fwd: number; lat: number; d: number }[] {
    const me = player();
    const c = me.car;
    const sinH = Math.sin(c.heading);
    const cosH = Math.cos(c.heading);
    const out: { e: Entrant; fwd: number; lat: number; d: number }[] = [];
    for (const e of entrants) {
      if (e === me || e.finished || e.wreckT > 0) continue;
      const dx = e.car.x - c.x;
      const dz = e.car.z - c.z;
      out.push({ e, fwd: dx * sinH + dz * cosH, lat: dx * cosH - dz * sinH, d: Math.hypot(dx, dz) });
    }
    return out;
  }

  /** A ring of puffs flying out along the ground from the car (a shockwave, a landing, a dodge). */
  function ring(c: Car, n: number, speed: number, col: THREE.Color): void {
    for (let k = 0; k < (high ? n : n / 2); k++) {
      const a = (k / n) * Math.PI * 2;
      particles.emit({ x: c.x, y: c.y + 0.35, z: c.z, vx: Math.cos(a) * speed, vy: 0.3 + Math.random() * 0.6, vz: Math.sin(a) * speed, life: 0.9, size0: 1.3, size1: 3.6, color: col, alpha: 0.8, drag: 1.5 });
    }
  }

  const tmpGolf = new THREE.Vector3();
  const colPink = new THREE.Color('#ff8fc8');
  const colWhite = new THREE.Color('#fff7e0');
  const colGrassBright = new THREE.Color('#79d84a');
  /** The garbage truck's load: each piece is a little armour on top of what the truck has. */
  const baseDmg = myTune.dmgMul;
  function setJunk(n: number): void {
    junk = clamp(n, 0, SCAVENGE.max);
    myTune.dmgMul = baseDmg * (1 - SCAVENGE.armour * junk);
  }

  /** Uses the active. Returns false when it fizzled (the slingshot with nobody to pull on), so no use is counted. */
  function useAbility(me: Entrant): boolean {
    if (!kit) return false;
    const c = me.car;
    const th = track.heading(c.proj.s);
    const sinH = Math.sin(c.heading);
    const cosH = Math.cos(c.heading);
    switch (kit.active.id) {
      case 'kickstart':
        api.boost(KICKSTART.boost, KICKSTART.strength);
        kickT = KICKSTART.gripSeconds;
        sparks(c.x - sinH * 2, c.y, c.z - cosH * 2, high ? 14 : 7);
        hud.toast('⚡ Kickstart!');
        break;
      case 'hop':
        c.vy = Math.max(c.vy, 0) + HOP.vy;
        c.y += 0.06;
        api.kick(HOP.kick);
        stats.jumps++;
        stats.bounces++;
        shake = Math.max(shake, 0.2);
        ring(c, 14, 4, colDust);
        audio.boing();
        hud.toast('🦘 Hopp!');
        break;
      case 'tailgate': {
        obstacles.add('oil', c.x - sinH * 3.6, c.y, c.z - cosH * 3.6, c);
        obstacles.add('hay', c.x - sinH * 6.8 + cosH * 1.3, c.y, c.z - cosH * 6.8 - sinH * 1.3, c);
        obstacles.add('hay', c.x - sinH * 7.4 - cosH * 1.5, c.y, c.z - cosH * 7.4 + sinH * 1.5, c);
        stats.hazards += 3;
        audio.hay(8);
        ring(c, 10, 3, colHay);
        hud.toast('🛻 Flaket tippas! Olja och hö');
        break;
      }
      case 'slingshot': {
        const target = draftTarget(around());
        if (!target) {
          abilCd = SLINGSHOT.miss;
          hud.toast('🧲 Ingen att dra i. Ligg precis bakom en bil');
          return false;
        }
        api.kick(SLINGSHOT.kick);
        api.boost(SLINGSHOT.boost, SLINGSHOT.strength);
        c.launch = Math.max(c.launch, 0.7);
        shake = Math.max(shake, 0.25);
        hud.toast('🧲 Slipström! Snärt!');
        break;
      }
      case 'groundPound': {
        c.vy = Math.max(c.vy, 0) + 3.5;
        c.y += 0.05;
        let hit = 0;
        for (const o of around()) {
          if (o.d > POUND.radius || o.d < 0.1) continue;
          const f = 1 - 0.55 * (o.d / POUND.radius);
          const nx = (o.e.car.x - c.x) / o.d;
          const nz = (o.e.car.z - c.z) / o.d;
          o.e.car.vx += nx * POUND.push * f;
          o.e.car.vz += nz * POUND.push * f;
          o.e.car.vy += 4.5 * f;
          o.e.car.yawRate += (Math.random() - 0.5) * 6;
          o.e.squashT = Math.max(o.e.squashT, POUND.squash * f);
          if (carnage) {
            ledger.hit(o.e.id, me.id, POUND.damage, timeU.value);
            damageHp(o.e, POUND.damage * f, me);
          }
          hit++;
        }
        stats.squashed += hit;
        shake = Math.max(shake, 0.7);
        ring(c, 40, 15, colHot);
        ring(c, 24, 8, colSmoke);
        sparks(c.x, c.y, c.z, high ? 20 : 10);
        audio.boom();
        hud.toast(hit ? `💥 KROSSA! ${hit} ${hit === 1 ? 'bil' : 'bilar'} flög` : '💥 KROSSA! Ingen i närheten');
        break;
      }
      case 'pivot': {
        const dir = pivotDir(me.ctl.steer, wrapAngle(th - c.heading));
        const ang = dir * (Math.PI / 2);
        const cs = Math.cos(ang);
        const sn = Math.sin(ang);
        const vx = c.vx * cs + c.vz * sn;
        const vz = -c.vx * sn + c.vz * cs;
        c.heading = wrapAngle(c.heading + ang);
        c.vx = vx * 0.9;
        c.vz = vz * 0.9;
        c.yawRate = 0;
        c.steerAngle = 0;
        shake = Math.max(shake, 0.25);
        ring(c, 12, 5, colDust);
        audio.slip();
        hud.toast(dir > 0 ? '🔄 Bakhjulssväng vänster!' : '🔄 Bakhjulssväng höger!');
        break;
      }
      case 'wheelieRocket':
        api.boost(WHEELIE_ROCKET.boost, WHEELIE_ROCKET.strength);
        rocketT = WHEELIE_ROCKET.boost;
        c.launch = Math.max(c.launch, 0.8);
        shake = Math.max(shake, 0.3);
        hud.toast('🚀 Wheelie-raket!');
        break;
      case 'dodge': {
        dodgeT = DODGE.seconds;
        c.ghost = Math.max(c.ghost, DODGE.seconds);
        const dir = me.ctl.steer >= 0 ? 1 : -1;
        c.vx += cosH * dir * 3.5;
        c.vz -= sinH * dir * 3.5;
        me.mudT = 0;
        me.slickT = 0;
        ring(c, 14, 4, colSmoke);
        audio.poof();
        hud.toast('💨 Väj! Oberörbar!');
        break;
      }
      case 'rammer':
        chargeT = RAMMER.seconds;
        c.launch = Math.max(c.launch, 0.6);
        shake = Math.max(shake, 0.3);
        audio.boom();
        hud.toast('🚜 RAMMBOCK!');
        break;
      case 'epaBurst':
        api.boost(EPA_BURST.boost, EPA_BURST.strength);
        burstT = EPA_BURST.boost;
        c.launch = Math.max(c.launch, 0.7);
        shake = Math.max(shake, 0.3);
        sparks(c.x - sinH * 2.4, c.y, c.z - cosH * 2.4, high ? 16 : 8);
        ring(c, 14, 6, colSmoke);
        hud.toast('⚠️ Gasa på EPA! Spärren är av');
        break;
      case 'iceCannon': {
        const p = c.proj;
        const hw = track.at(track.hw, p.s);
        const from = new THREE.Vector3(c.x + sinH * 0.5, c.y + 3.4, c.z + cosH * 0.5);
        for (let i = 0; i < ICE_CANNON.range.length; i++) {
          const s = p.s + ICE_CANNON.range[i]!;
          const d = clamp(p.d + (i - 1) * ICE_CANNON.spread + (Math.random() - 0.5) * 1.2, -hw + 1.6, hw - 1.6);
          const to = track.point(s, d);
          const at = new THREE.Vector3(to.x, to.y + 0.1, to.z);
          shots.fire('scoop', from, at, 0.5 + i * 0.14, {
            colour: i,
            height: 4.5,
            land: () => {
              obstacles.add('glass', at.x, at.y, at.z, c);
              stats.hazards++;
              for (let k = 0; k < (high ? 10 : 5); k++) particles.emit({ x: at.x, y: at.y + 0.3, z: at.z, vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 6, life: 0.7, size0: 0.4, size1: 0.2, color: i % 2 ? colPink : colWhite, alpha: 1, drag: 1, gravity: 9 });
            },
          });
        }
        audio.boing();
        hud.toast('🍦 Glasskanon! Hal väg framför dig');
        break;
      }
      case 'dump': {
        const n = Math.max(3, junk + 2);
        for (let k = 0; k < n; k++) {
          const back = 4.8 + k * 0.9;
          const side = (k % 2 ? 1 : -1) * (0.6 + Math.random() * 1.6);
          obstacles.add(k % 3 === 2 ? 'banana' : 'hay', c.x - sinH * back + cosH * side, c.y, c.z - cosH * back - sinH * side, c);
        }
        if (junk >= 3) obstacles.add('oil', c.x - sinH * 5.2, c.y, c.z - cosH * 5.2, c);
        stats.hazards += n;
        for (let k = 0; k < (high ? 14 : 7); k++) {
          colDebris.set(['#e8412c', '#2f8a3c', '#e8c862', '#8a8d95', '#f4f1ea'][k % 5]!);
          debris.emit(c.x - sinH * 3, c.y + 1.4, c.z - cosH * 3, -sinH * (3 + Math.random() * 5) + (Math.random() - 0.5) * 4, 2 + Math.random() * 3, -cosH * (3 + Math.random() * 5) + (Math.random() - 0.5) * 4, 0.3, 0.2, 0.3, colDebris, 4);
        }
        audio.hay(10);
        shake = Math.max(shake, 0.25);
        hud.toast(`🗑️ Tömning! ${n} bitar skräp bakom dig`);
        setJunk(0);
        break;
      }
      case 'powder': {
        clouds.push({ x: c.x - sinH * (POWDER.reach * 0.5), z: c.z - cosH * (POWDER.reach * 0.5), h: c.heading, t: POWDER.blind + 1 });
        while (clouds.length > 3) clouds.shift();
        // a white burst thrown out to the sides (the dust fade keeps it off the lens) and a long cloud left on the road behind
        for (let k = 0; k < (high ? 46 : 22); k++) {
          const side = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 5);
          const back = 1 + Math.random() * 3;
          particles.emit({ x: c.x - sinH * back + cosH * side * 0.4, y: c.y + 0.6 + Math.random() * 1.2, z: c.z - cosH * back - sinH * side * 0.4, vx: cosH * side * 1.1 - sinH * 2, vy: 0.5 + Math.random() * 1.6, vz: -sinH * side * 1.1 - cosH * 2, life: 1.8 + Math.random() * 1.2, size0: 1.2, size1: 5.5, color: colSnow, alpha: 0.85, drag: 1.4, gravity: -0.1 });
        }
        for (let k = 0; k < (high ? 40 : 20); k++) {
          const back = 4 + Math.random() * POWDER.reach * 0.8;
          const side = (Math.random() - 0.5) * POWDER.width;
          particles.emit({ x: c.x - sinH * back + cosH * side, y: c.y + 0.5 + Math.random() * 1.8, z: c.z - cosH * back - sinH * side, vx: (Math.random() - 0.5) * 1.5, vy: 0.2 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 1.5, life: 2.6 + Math.random() * 1.4, size0: 2, size1: 6.5, color: colSnow, alpha: 0.7, drag: 1.2, gravity: -0.05 });
        }
        let n = 0;
        for (const o of around()) if (o.fwd < 0 && o.fwd > -POWDER.reach && Math.abs(o.lat) < POWDER.width) n++;
        audio.poof();
        hud.toast(n ? `❄️ Pudersvans! ${n} ${n === 1 ? 'bil ser' : 'bilar ser'} ingenting` : '❄️ Pudersvans!');
        break;
      }
      case 'kartSlide': {
        const dir = pivotDir(me.ctl.steer, wrapAngle(th - c.heading));
        c.yawRate += dir * KART_SLIDE.yaw;
        c.vx += cosH * dir * KART_SLIDE.side;
        c.vz -= sinH * dir * KART_SLIDE.side;
        // a perfect drift at once: the charge of the biggest tier, paid out when the slide ends
        drift.on = true;
        drift.t = 2.45;
        drift.tier = 3;
        drift.pts = 200;
        drift.grace = 0;
        if (nitroLeft < nitroSlots()) nitroLeft = Math.min(nitroSlots(), Math.floor(nitroLeft) + 1);
        shake = Math.max(shake, 0.3);
        ring(c, 12, 5, colSmoke);
        audio.slip();
        audio.chime();
        hud.toast(dir > 0 ? '🏁 Gokartsladd vänster! Nitro +1' : '🏁 Gokartsladd höger! Nitro +1');
        break;
      }
      case 'holeInOne': {
        let lead: Entrant | null = null;
        for (const e of entrants) if (e !== me && !e.finished && e.wreckT <= 0 && e.u > me.u && e.u - me.u < HOLE_IN_ONE.reach && (!lead || e.u > lead.u)) lead = e;
        if (!lead) {
          abilCd = SLINGSHOT.miss;
          hud.toast('⛳ Ingen framför dig att slå på. Du leder!');
          return false;
        }
        const target = lead;
        const from = new THREE.Vector3(c.x + sinH * 0.8, c.y + 1.7, c.z + cosH * 0.8);
        audio.tock();
        shots.fire('ball', from, new THREE.Vector3(target.car.x, target.car.y + 0.8, target.car.z), HOLE_IN_ONE.flight + Math.min(0.8, (target.u - me.u) / 120), {
          height: 7,
          follow: () => tmpGolf.set(target.car.x + target.car.vx * 0.15, target.car.y + 0.8, target.car.z + target.car.vz * 0.15),
          land: () => {
            const tc = target.car;
            const lat = (tc.x - c.x) * Math.cos(c.heading) - (tc.z - c.z) * Math.sin(c.heading);
            const sg = Math.abs(lat) < 0.3 ? (Math.random() < 0.5 ? 1 : -1) : Math.sign(lat);
            const hc = Math.cos(tc.heading);
            const hs = Math.sin(tc.heading);
            tc.vx += hc * sg * HOLE_IN_ONE.push;
            tc.vz -= hs * sg * HOLE_IN_ONE.push;
            tc.yawRate += sg * 3.2;
            tc.vy += 3;
            target.squashT = Math.max(target.squashT, HOLE_IN_ONE.squash);
            stats.squashed++;
            audio.boing();
            sparkleAt(tc.x, tc.y + 0.5, tc.z, 14, 1.2);
            hud.toast(`⛳ HOLE IN ONE! ${target.name} fick bollen i sidan`);
          },
        });
        hud.toast(`⛳ Fore! Siktar på ${target.name}`);
        break;
      }
      case 'mow': {
        const r = obstacles.clearAhead(c.x, c.z, c.heading, MOW.reach, MOW.width);
        mowT = 2.0;
        api.boost(MOW.boost, MOW.strength);
        for (const q of r.at) for (let k = 0; k < 6; k++) particles.emit({ x: q.x, y: q.y + 0.5, z: q.z, vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 6, life: 0.8, size0: 0.35, size1: 0.2, color: colGrassBright, alpha: 1, drag: 1, gravity: 8 });
        audio.hay(7);
        shake = Math.max(shake, 0.25);
        hud.toast(r.n ? `🌿 Gräsklippning! ${r.n} ${r.n === 1 ? 'fälla' : 'fällor'} klippta` : '🌿 Gräsklippning!');
        break;
      }
      case 'awning': {
        for (const sx of [-1, 1]) obstacles.add('tent', c.x - sinH * 6 + cosH * sx * 2.5, c.y, c.z - cosH * 6 - sinH * sx * 2.5, c, c.heading);
        stats.hazards += 2;
        audio.hay(10);
        ring(c, 14, 4, colHay);
        shake = Math.max(shake, 0.2);
        hud.toast('⛺ Tältet fälls ut! Ingen kommer förbi');
        break;
      }
      case 'vip':
        c.ghost = Math.max(c.ghost, VIP.seconds);
        vipT = VIP.seconds;
        api.boost(VIP.boost, VIP.strength);
        sparkleAt(c.x, c.y, c.z, 18, 1.5);
        audio.chime();
        hud.toast('🕶️ VIP-fil! Rakt genom alla');
        break;
      case 'rocket':
        api.boost(ROCKET.boost, ROCKET.strength);
        rocketT = ROCKET.boost;
        c.launch = Math.max(c.launch, 0.9);
        shake = Math.max(shake, 0.55);
        audio.rocket(ROCKET.boost);
        sparks(c.x - sinH * 1.8, c.y, c.z - cosH * 1.8, high ? 24 : 12);
        ring(c, 16, 6, colHot);
        hud.toast('🛒 Raketen! Håll i dig');
        break;
      case 'cushionChaos': {
        const fx = chaosPick(Math.random());
        const fallback = (): void => api.boost(1.5, 1.4);
        switch (fx) {
          case 'boost':
            fallback();
            break;
          case 'hop':
            api.bounce(HOP.vy * 0.85);
            stats.jumps++;
            break;
          case 'hay':
            if (!api.dropAhead('hay')) fallback();
            break;
          case 'pancake':
            api.squashLeader(2.6);
            break;
          case 'swap':
            if (!api.swapAhead()) fallback();
            break;
          case 'cannon':
            api.cannon(1.6);
            break;
          case 'slime':
            api.banana();
            api.banana();
            break;
          case 'ghost':
            api.ghost(2.6);
            break;
        }
        api.sparkle(14);
        hud.toast(`🛋️ ${CHAOS_TEXT[fx]}`);
        break;
      }
    }
    return true;
  }

  /** Each frame: the ability button, the cooldown, the running timers, the charge on the button and the HUD. */
  function abilityStep(dt: number, me: Entrant, racing: boolean): void {
    if (!kit) return;
    const inp = ctx.input;
    abilCd = Math.max(0, abilCd - dt);
    kickT = Math.max(0, kickT - dt);
    dodgeT = Math.max(0, dodgeT - dt);
    chargeT = Math.max(0, chargeT - dt);
    rocketT = Math.max(0, rocketT - dt);
    burstT = Math.max(0, burstT - dt);
    vipT = Math.max(0, vipT - dt);
    mowT = Math.max(0, mowT - dt);
    loadCd = Math.max(0, loadCd - dt);
    landCd = Math.max(0, landCd - dt);
    const live = racing && phase === 'race' && !me.finished && me.wreckT <= 0 && me.tumbleT <= 0;
    if (inp.pressed('x') && live) {
      if (abilCd > 0) {
        if (abilCd > 0.3) hud.toast(`${kit.active.emoji} ${kit.active.name} laddar… ${Math.ceil(abilCd)} s`);
      } else if (useAbilityBoosted(me)) {
        abilCd = kit.active.cooldown * mt.abilCd;
        stats.abilityUses++;
        mods.bus.ability();
        hud.pop('ability', kit.active.emoji, kit.active.name, 'abil');
      }
    }
    // the bike rocket is hard to steer (the cart's even more, and it shakes about); the tractor's charge keeps its line
    if (rocketT > 0) me.ctl.steer = clamp(me.ctl.steer * (kit.active.id === 'rocket' ? ROCKET.steer : WHEELIE_ROCKET.steer), -1, 1);
    phase10(dt, me, racing);
    // a vehicle with a stomp or a charge gets a dust trail while it lasts
    if (chargeT > 0 && Math.random() < (high ? 0.7 : 0.35)) sparks(me.car.x - Math.sin(me.car.heading) * 2.6, me.car.y, me.car.z - Math.cos(me.car.heading) * 2.6, 2);
    const k = chargeOf(abilCd, kit.active.cooldown * mt.abilCd);
    const key = `${Math.round(k * 40)}/${abilCd <= 0}`;
    if (key !== abilKey) {
      abilKey = key;
      hud.setAbility(kit.active.emoji, kit.active.name, k, abilCd <= 0);
      ctx.abilityHud?.(k, abilCd <= 0);
    }
  }

  /** The passives and running effects of the ten newest vehicles (the race calls this every frame). */
  function phase10(dt: number, me: Entrant, racing: boolean): void {
    if (!kit) return;
    const c = me.car;
    const sinH = Math.sin(c.heading);
    const cosH = Math.cos(c.heading);
    for (const cl of clouds) cl.t -= dt;
    while (clouds.length && clouds[0]!.t <= 0) clouds.shift();
    const driving = racing && phase === 'race' && !me.finished && me.wreckT <= 0;
    // the burst and the rocket push along the nose, whatever the tyres say (that is what makes them feel like more than a boost)
    if ((burstT > 0 || (rocketT > 0 && kit.active.id === 'rocket')) && !c.air && racing) {
      const rocket = burstT <= 0;
      const a = rocket ? ROCKET.thrust : EPA_BURST.thrust;
      const cap = rocket ? ROCKET.cap : EPA_BURST.cap;
      if (c.vLong < cap) {
        c.vx += sinH * a * dt;
        c.vz += cosH * a * dt;
      }
    }
    // EPA: a black puff of smoke out of the pipe while the burst lasts
    if (burstT > 0 && Math.random() < (high ? 0.9 : 0.5)) particles.emit({ x: c.x - sinH * 2.4 + cosH * 0.4, y: c.y + 0.5, z: c.z - cosH * 2.4 - sinH * 0.4, vx: -sinH * 3, vy: 1 + Math.random(), vz: -cosH * 3, life: 0.9, size0: 0.5, size1: 2.2, color: colDark, alpha: 0.7, drag: 1.2, gravity: -0.4 });
    // the cart's rocket: a trail of fire and smoke, and kicks to the side
    if (rocketT > 0 && kit.active.id === 'rocket') {
      if (Math.random() < (high ? 1 : 0.7)) particles.emit({ x: c.x - sinH * 1.9, y: c.y + 0.4, z: c.z - cosH * 1.9, vx: -sinH * 5 + (Math.random() - 0.5) * 2, vy: 0.5 + Math.random(), vz: -cosH * 5 + (Math.random() - 0.5) * 2, life: 0.8, size0: 0.8, size1: 2.8, color: Math.random() < 0.5 ? colFlame : colSmoke, alpha: 0.8, drag: 1.1, gravity: -0.2 });
      rocketKick -= dt;
      if (rocketKick <= 0 && !c.air) {
        rocketKick = 0.28 + Math.random() * 0.3;
        c.yawRate += (Math.random() - 0.5) * 2 * ROCKET.kick * 1.6;
      }
    }
    // VIP: gold glitter while you ghost through the traffic
    if (vipT > 0 && Math.random() < 0.7) sparkleAt(c.x, c.y, c.z, 2, 1.4);
    // the blades: grass flies from the deck and everything in the way is cut down
    if (mowT > 0) {
      obstacles.clearAhead(c.x, c.z, c.heading, 14, MOW.width);
      for (let k = 0; k < (high ? 7 : 4); k++) {
        const side = (Math.random() - 0.5) * 3;
        particles.emit({ x: c.x + sinH * 2.4 + cosH * side, y: c.y + 0.3 + Math.random() * 0.5, z: c.z + cosH * 2.4 - sinH * side, vx: sinH * (10 + Math.random() * 10) + cosH * side * 2, vy: 1 + Math.random() * 3, vz: cosH * (10 + Math.random() * 10) - sinH * side * 2, life: 0.7, size0: 0.28, size1: 0.18, color: Math.random() < 0.7 ? colGrassBright : colGrass, alpha: 1, drag: 0.8, gravity: 9 });
      }
    }
    if (!driving) return;
    switch (kit.passive.id) {
      case 'jingle': {
        jingleT -= dt;
        if (jingleT <= 0) {
          jingleT = JINGLE.every;
          audio.jingle();
        }
        const f = Math.exp(-JINGLE.slow * dt);
        for (const o of around()) {
          if (o.d > JINGLE.radius) continue;
          o.e.car.vx *= f;
          o.e.car.vz *= f;
          if (Math.random() < 0.06) particles.emit({ x: o.e.car.x, y: o.e.car.y + 2.2, z: o.e.car.z, vy: 1.2, life: 1.0, size0: 0.5, size1: 0.9, color: Math.random() < 0.5 ? colPink : colWhite, alpha: 0.9, drag: 1, gravity: -0.5 });
        }
        break;
      }
      case 'draft': {
        const target = draftTarget(around(), DRAFT.reach, DRAFT.lane);
        drafting = !!target && c.speed > 12;
        if (drafting) {
          draftT += dt;
          if (Math.random() < 0.6) for (const sx of [-1, 1]) particles.emit({ x: c.x + cosH * sx * 1.1 + sinH * 1.5, y: c.y + 0.5, z: c.z - sinH * sx * 1.1 + cosH * 1.5, vx: -sinH * 6, vy: 0.1, vz: -cosH * 6, life: 0.35, size0: 0.3, size1: 0.12, color: colWhite, alpha: 0.7, drag: 0.4, gravity: 0 });
          if (draftT >= DRAFT.fill) {
            draftT = 0;
            api.boost(DRAFT.boost, DRAFT.strength);
            shake = Math.max(shake, 0.15);
            hud.toast('💨 Slipström! Gratis fartstöt');
          }
        } else draftT = Math.max(0, draftT - dt * 0.6);
        break;
      }
      case 'repair':
        if (c.speed > REPAIR.minSpeed) {
          const before = carnage ? me.hp : me.damage;
          if (carnage) {
            if (me.hp > 0 && me.hp < me.maxHp) me.hp = Math.min(me.maxHp, me.hp + REPAIR.hp * dt);
          } else me.damage = Math.max(0, me.damage - REPAIR.plating * dt);
          if ((carnage ? me.hp : me.damage) !== before && Math.random() < 0.05) particles.emit({ x: c.x + (Math.random() - 0.5) * 1.5, y: c.y + 3.2, z: c.z + (Math.random() - 0.5) * 1.5, vy: 1.6, life: 0.9, size0: 0.5, size1: 0.2, color: colGrassBright, alpha: 0.9, drag: 1, gravity: -0.5 });
        }
        break;
      case 'wobble':
        if (c.speed > 3) me.ctl.steer = clamp(me.ctl.steer + WOBBLE.amp * (Math.sin(timeU.value * 2.7) + 0.7 * Math.sin(timeU.value * 6.1 + 1.3)) * (rocketT > 0 ? 1.6 : 1), -1, 1);
        break;
    }
  }

  /** A computer car uses its vehicle's ability now and then: racers a burst of speed, rammers a charge at whoever is close ahead. */
  function rivalAbility(e: Entrant, dt: number): void {
    if (!abilityOn || e.wreckT > 0 || e.car.air) return;
    e.abilNext -= dt;
    if (e.abilNext > 0) return;
    const a = kitOf(e.body).active;
    const c = e.car;
    if (a.ai === 'ram') {
      // only where there is shoving to do, and only with somebody close ahead
      const sinH = Math.sin(c.heading);
      const cosH = Math.cos(c.heading);
      const target = entrants.some((o) => {
        if (o === e || o.finished || o.wreckT > 0) return false;
        const dx = o.car.x - c.x;
        const dz = o.car.z - c.z;
        const fwd = dx * sinH + dz * cosH;
        return fwd > 2 && fwd < 22 && Math.abs(dx * cosH - dz * sinH) < 5;
      });
      if (!target || kind === 'rally') {
        e.abilNext = 3;
        return;
      }
    } else if (Math.abs(e.ctl.steer) > 0.25) {
      e.abilNext = 1.2;
      return;
    }
    e.rivalBoostT = Math.max(e.rivalBoostT, 0.9);
    e.lastAbil = a;
    e.abilNext = a.cooldown * (1.8 + Math.random() * 0.8);
  }

  /** The boss rivals' tricks: a short nitro every now and then, a hop across the road. */
  function rivalTricks(e: Entrant, dt: number): void {
    rivalAbility(e, dt);
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
        buzz('crash', !!ctx.controls?.haptics);
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
    audio.horn(me.body, opts ? myCar.style.horn : 'beep');
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
    const m = modelFor({ ...myCar, body: next }, mt.sidecar && next === 'moto', opts?.look);
    m.root.scale.setScalar(mt.size);
    disposers.push(() => m.dispose());
    e.model = m;
    e.tumbleT = 0;
    if (night) addHeadlights();
    poof(c.x, c.y, c.z);
    audio.poof();
    hud.toast(`🎠 ${CAR_BODY_NAMES[next]}!`);
  }

  /** A golf ball, football or bowling ball hits a car: shoved sideways across the road, spun, a little damage. */
  function gimmickHit(e: Entrant, kind: 'golf' | 'football' | 'bowling', side: number, push: number, spin: number): void {
    const c = e.car;
    if (e === meE && dodgeT > 0) return;
    // "left" is the road's, so a car that has swung round is still pushed across the road, not along it
    const h = track.heading(c.proj.s);
    c.vx += Math.cos(h) * side * push;
    c.vz -= Math.sin(h) * side * push;
    c.yawRate += side * spin;
    c.vy += 2.6;
    if (kind !== 'golf') {
      c.vx *= 0.82;
      c.vz *= 0.82;
    }
    e.squashT = Math.max(e.squashT, kind === 'golf' ? 0 : 0.5);
    if (damageK > 0) hurt(e, kind === 'golf' ? 3 : 6);
    else damageHp(e, kind === 'golf' ? 4 : 8, null);
    sparkleAt(c.x, c.y + 0.5, c.z, 12, 1.1);
    if (Math.hypot(c.x - meE!.car.x, c.z - meE!.car.z) < 50) {
      if (kind === 'bowling') audio.thud(9);
      else audio.boing();
    }
    if (e === meE) {
      shake = Math.max(shake, 0.4);
      hud.toast(kind === 'golf' ? '⛳ Pling! Träffad av en golfboll' : kind === 'football' ? '⚽ MÅÅÅL! Du blev träffad av en jättebollen' : '🎳 STRIKE! Du blev kägla');
    }
  }

  /** Banana peels and hay bales spin whoever drives over them. */
  function obstaclesStep(dt: number, racing: boolean): void {
    obstacles.update(dt);
    shots.update(dt);
    gimmicks?.update(dt);
    if (!racing) return;
    const me = player();
    for (const e of entrants) {
      const o = obstacles.touch(e.car);
      if (!o) continue;
      // the moped's Väj!: nothing on the road touches it for a second
      if (e === me && dodgeT > 0) continue;
      const c = e.car;
      // the garbage truck picks the thing up instead of driving into it, and keeps a little of it as armour
      if (e === me && kit?.passive.id === 'scavenger') {
        obstacles.take(o);
        const first = junk === 0;
        setJunk(junk + 1);
        audio.thud(4);
        for (let k = 0; k < (high ? 6 : 3); k++) particles.emit({ x: c.x, y: c.y + 0.8, z: c.z, vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 4, life: 0.6, size0: 0.3, size1: 0.2, color: colDirt, alpha: 1, drag: 1, gravity: 9 });
        if (first || junk === SCAVENGE.max) hud.pop('passive', '🗑️', kit.passive.name, 'abil');
        if (first || junk === SCAVENGE.max) hud.toast(junk === SCAVENGE.max ? '🗑️ Lasset är fullt. Dags att tömma?' : '🗑️ Plockade upp skräp: lite pansar');
        continue;
      }
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
      if (o.kind === 'mine') {
        // a mine: a bang, the car thrown up and round, and in Blodbad some health
        c.vy = Math.max(c.vy, 0) + 5.5;
        c.y += 0.08;
        c.yawRate += (Math.random() < 0.5 ? -1 : 1) * 10;
        c.vx *= 0.55;
        c.vz *= 0.55;
        e.squashT = Math.max(e.squashT, 0.5);
        if (carnage) {
          ledger.hit(e.id, me.id, 14, timeU.value);
          damageHp(e, 14, me);
        } else hurt(e, 6);
        sparks(c.x, c.y, c.z, high ? 18 : 8);
        ring(c, 24, 9, colHot);
        if (Math.hypot(c.x - me.car.x, c.z - me.car.z) < 60) {
          audio.boom();
          shake = Math.max(shake, e === me ? 0.4 : 0.25);
        }
        if (e !== me) {
          stats.squashed++;
          stats.bananaHits++;
        }
        continue;
      }
      if (o.kind === 'zone') {
        // the steward's penalty zone: stopped short, and two seconds on the finish time
        c.vx *= 0.38;
        c.vz *= 0.38;
        e.squashT = Math.max(e.squashT, 0.25);
        if (e === me) {
          penaltyMs += 2000;
          audio.whistle();
          shake = Math.max(shake, 0.3);
          hud.toast('🚩 STRAFF! +2 sekunder i målet');
        } else if (Math.hypot(c.x - me.car.x, c.z - me.car.z) < 50) audio.whistle();
        sparkleAt(c.x, c.y + 0.4, c.z, 8, 0.8);
        continue;
      }
      if (o.kind === 'ice') {
        // the goalkeeper's ice: the grip goes for a moment and the car swings a little
        c.yawRate += (Math.random() < 0.5 ? -1 : 1) * 4.5 * c.feel.slip;
        c.vx *= 0.95;
        c.vz *= 0.95;
        if (c.feel.slip > 0.3) e.slickT = Math.max(e.slickT, 1.1);
        if (Math.hypot(c.x - me.car.x, c.z - me.car.z) < 40) audio.slip();
        if (e === me) hud.toast('🧊 Hal is!');
        sparkleAt(c.x, c.y, c.z, 5, 0.8);
        continue;
      }
      if (o.kind === 'sign') {
        // a false sign standing in the road: a thump, a spin, a lost bit of speed
        c.yawRate += (Math.random() < 0.5 ? -1 : 1) * 5 * c.feel.slip;
        c.vx *= 0.8;
        c.vz *= 0.8;
        if (e === me) {
          audio.thud(7);
          shake = Math.max(shake, 0.3);
          hud.toast('🪧 Fel skylt! Tina menade väl.');
        }
        confetti.burst(c.x, c.y + 1.4, c.z, high ? 14 : 6, 4);
        continue;
      }
      if (o.kind === 'pin') {
        // a bowling pin goes flying
        c.yawRate += (Math.random() < 0.5 ? -1 : 1) * 3 * c.feel.slip;
        c.vx *= 0.9;
        c.vz *= 0.9;
        c.vy += 1.6;
        if (Math.hypot(c.x - me.car.x, c.z - me.car.z) < 50) audio.thud(6);
        if (e === me) shake = Math.max(shake, 0.2);
        for (let k = 0; k < (high ? 8 : 4); k++) particles.emit({ x: c.x, y: c.y + 0.8, z: c.z, vx: (Math.random() - 0.5) * 7, vy: 3 + Math.random() * 3, vz: (Math.random() - 0.5) * 7, life: 0.8, size0: 0.35, size1: 0.2, color: colWhite, alpha: 1, drag: 1, gravity: 9 });
        continue;
      }
      if (o.kind === 'coin') {
        // a coin that is not a coin: it pops in a puff of confetti and the car that went for it spins
        c.yawRate += (Math.random() < 0.5 ? -1 : 1) * 8 * c.feel.slip;
        c.vx *= 0.7;
        c.vz *= 0.7;
        e.squashT = Math.max(e.squashT, 0.4);
        confetti.burst(c.x, c.y + 1.6, c.z, high ? 40 : 20, 6);
        if (Math.hypot(c.x - me.car.x, c.z - me.car.z) < 60) audio.boing();
        if (e !== me) stats.bananaHits++;
        continue;
      }
      // a tractor hardly notices a banana peel, a hay bale or an oil slick; oil spins harder and takes the grip for a moment
      const sl = c.feel.slip;
      const oil = o.kind === 'oil' || o.kind === 'glass';
      c.yawRate += (Math.random() < 0.5 ? -1 : 1) * (oil ? 10 : 7) * sl;
      c.vx *= 1 - (oil ? 0.3 : 0.45) * sl;
      c.vz *= 1 - (oil ? 0.3 : 0.45) * sl;
      if (oil && sl > 0.3) e.slickT = 1.4;
      if (c.feel.two) e.wobble = 1;
      if (oil) {
        if (e === me) stats.oilHits++;
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
      if (phase === 'race' && now - (trigAt.get(id) ?? -9) > 0.8) {
        triggers[id] = (triggers[id] ?? 0) + 1;
        trigAt.set(id, now);
      }
      // the icon in the row pulses; the pop-up above the car shows the effect (the hud rate-limits it per talisman)
      hud.trinketSay(id, null);
      if (phase === 'race') hud.popFor(id, text);
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
      const n = Math.round(((high ? 22 : 12) + strength * 3) * (push ? 1 : 0.5));
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
          size1: 3.4 + strength * 0.3,
          color: colGas,
          alpha: push ? 0.8 : 0.35,
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
    boing() {
      audio.boing();
      stats.quacks++;
    },
    party() {
      const c = player().car;
      audio.party();
      stats.quacks++;
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
      // in a manual box the thump sometimes throws a gear in (or out) as well
      if (c.manual && (dv >= 4 || dv <= -3.5) && Math.random() < 0.35) c.jolt(dv > 0 ? 1 : -1);
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
      stats.hazards++;
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
      sparkleAt(lead.car.x, lead.car.y, lead.car.z, 10, 1.2);
      hud.toast(`🥞 En jättepannkaka landade på ${lead.name}!`);
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
        if (Math.random() < 0.15) particles.emit({ x: e.car.x, y: e.car.y + 1.2, z: e.car.z, vy: 1.2, life: 0.9, size0: 0.8, size1: 2.4, color: colSpark, alpha: 0.5, drag: 1.5, gravity: -0.3 });
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
    swapAhead() {
      const me = player();
      let best: Entrant | null = null;
      for (const e of entrants) {
        if (e === me || e.finished || e.wreckT > 0) continue;
        const gap = e.u - me.u;
        if (gap > 2 && gap < 45 && (!best || gap < best.u - me.u)) best = e;
      }
      if (!best) return false;
      const a = me.car;
      const b = best.car;
      const [sa, da, sb, db] = [a.proj.s, a.proj.d, b.proj.s, b.proj.d];
      const av = [a.vx, a.vz, a.yawRate];
      const bv = [b.vx, b.vz, b.yawRate];
      poof(a.x, a.y, a.z);
      poof(b.x, b.y, b.z);
      a.place(sb, db, ground);
      b.place(sa, da, ground);
      [a.vx, a.vz, a.yawRate] = bv as [number, number, number];
      [b.vx, b.vz, b.yawRate] = av as [number, number, number];
      const du = best.u - me.u;
      me.u += du;
      best.u -= du;
      me.lastS = a.proj.s;
      best.lastS = b.proj.s;
      a.ghost = 1.4;
      b.ghost = 1.4;
      audio.poof();
      hud.toast(`🔀 Du bytte plats med ${best.name}`);
      return true;
    },
    dropAhead(kind) {
      const me = player();
      let best: Entrant | null = null;
      for (const e of entrants) {
        if (e === me || e.finished) continue;
        const gap = e.u - me.u;
        if (gap > 5 && gap < 90 && (!best || gap < best.u - me.u)) best = e;
      }
      if (!best) return false;
      const p = track.point(best.car.proj.s + 14, best.car.proj.d);
      obstacles.add(kind, p.x, p.y, p.z, me.car, track.heading(best.car.proj.s + 14));
      stats.hazards++;
      return true;
    },
    oil() {
      const c = player().car;
      obstacles.add('oil', c.x - Math.sin(c.heading) * 3.8, c.y, c.z - Math.cos(c.heading) * 3.8, c);
      stats.hazards++;
    },
    mine() {
      const c = player().car;
      obstacles.add('mine', c.x - Math.sin(c.heading) * 4.2, c.y, c.z - Math.cos(c.heading) * 4.2, c);
      stats.hazards++;
      audio.thud(3);
    },
    fakeCoin() {
      const c = player().car;
      obstacles.add('coin', c.x - Math.sin(c.heading) * 5 + (Math.random() - 0.5) * 3, c.y, c.z - Math.cos(c.heading) * 5, c);
      stats.hazards++;
    },
    smoke(sec) {
      blindCloud(sec);
    },
    shock(radius, push, dmg) {
      shockwave(radius, push, dmg);
    },
    ramUp(sec, k) {
      ramUpT = Math.max(ramUpT, sec);
      ramUpK = Math.max(1, k);
    },
    nitro(frac) {
      if (nitroSlots() <= 0) return;
      nitroBank += frac;
      let got = false;
      while (nitroBank >= 1 && nitroLeft < nitroSlots()) {
        nitroBank -= 1;
        nitroLeft = Math.min(nitroSlots(), Math.floor(nitroLeft) + 1);
        got = true;
      }
      if (nitroLeft >= nitroSlots()) nitroBank = 0;
      else nitroBank = Math.min(nitroBank, 0.99);
      if (got) {
        hud.popup('🔥 Nitro +1', 'abil');
        audio.chime();
      }
    },
    flame() {
      flameT = 0.8;
      audio.boom();
      shake = Math.max(shake, 0.2);
    },
    heal(frac) {
      const me = player();
      me.damage = Math.max(0, me.damage - frac * 100);
      me.model.setWear(me.dirt, wearOf(me));
      if (carnage) {
        me.hp = Math.min(me.maxHp, me.hp + frac * me.maxHp);
        me.model.setDamage(100 * (1 - me.hp / me.maxHp) * 0.9);
      } else me.model.setDamage(me.damage);
      sparkleAt(me.car.x, me.car.y, me.car.z, 8, 1);
    },
    rerollAbility() {
      if (!baseKit || !kit) return;
      const others = CAR_BODIES.filter((b) => kitOf(b).active.id !== kit!.active.id);
      const next = kitOf(others[Math.floor(Math.random() * others.length)]!);
      kit = { ...baseKit, active: next.active };
      abilCd = Math.min(abilCd, next.active.cooldown * mt.abilCd * 0.4);
      abilKey = '';
      poof(player().car.x, player().car.y, player().car.z);
      audio.chime();
      hud.toast(`🎰 Ny förmåga: ${next.active.emoji} ${next.active.name}`);
    },
    abilityCooldown(sec) {
      if (!kit) return;
      abilCd = Math.max(0, abilCd - sec);
    },
    copyLeaderAbility() {
      if (!kit) return false;
      const me = player();
      let lead: Entrant | null = null;
      for (const e of entrants) if (e !== me && !e.finished && e.wreckT <= 0 && (!lead || e.u > lead.u)) lead = e;
      if (!lead) return false;
      const a = lead.lastAbil ?? kitOf(lead.body).active;
      const saved = kit;
      kit = { ...saved, active: a };
      try {
        if (!useAbility(me)) return false;
      } finally {
        kit = saved;
      }
      hud.toast(`📠 Kopierade ${lead.name}s ${a.emoji} ${a.name}`);
      return true;
    },
    repeatAbility() {
      if (kit) useAbilityBoosted(player());
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
    // chunks of paint and plastic that really fly
    if (hit > 3.5) {
      const bits = Math.min(high ? 5 : 2, Math.round(hit / 3));
      for (let k = 0; k < bits; k++) {
        colDebris.set(k % 3 === 2 ? '#26262c' : k % 2 ? ea.color : eb.color);
        const sz = 0.1 + Math.random() * 0.16;
        debris.emit(info.x, info.y + 0.5, info.z, (Math.random() - 0.5) * 9, 2 + Math.random() * 4, (Math.random() - 0.5) * 9, sz * 1.6, sz * 0.5, sz, colDebris, 4);
      }
    }
  }


  /** What the player's vehicle does to a car it bumps: the monster squashes small ones, the tractor in a charge flings them, the pickup drops its load. */
  function vehicleContact(o: Entrant, hit: number): void {
    if (!kit || !racingNow()) return;
    const me = player();
    const c = me.car;
    const sinH = Math.sin(c.heading);
    const cosH = Math.cos(c.heading);
    if (kit.passive.id === 'squashSmall' && o.car.feel.mass <= 1.25 && o.squashT <= 0 && c.speed > 5 && hit > 1.5) {
      o.squashT = 1.7;
      o.car.ghost = Math.max(o.car.ghost, 1.5);
      stats.squashed++;
      poof(o.car.x, o.car.y, o.car.z);
      audio.boing();
      hud.toast(`🧦 ${o.name} blev platt som en socka`);
      hud.pop('passive', '🧦', kit.passive.name, 'abil');
    }
    if (kit.passive.id === 'loadDrop' && hit > 3 && loadCd <= 0) {
      loadCd = 3.5;
      obstacles.add('hay', c.x - sinH * 3.4 + cosH * (Math.random() - 0.5) * 2, c.y, c.z - cosH * 3.4 - sinH * (Math.random() - 0.5) * 2, c);
      stats.hazards++;
      hud.toast('🛻 Lasset ramlade. Hö på vägen!');
      hud.pop('passive', '🛻', kit.passive.name, 'abil');
    }
    if (chargeT > 0) {
      const dx = o.car.x - c.x;
      const dz = o.car.z - c.z;
      const d = Math.max(0.1, Math.hypot(dx, dz));
      o.car.vx += (dx / d) * 10;
      o.car.vz += (dz / d) * 10;
      o.car.vy += 6.5;
      o.car.yawRate += (Math.random() < 0.5 ? -1 : 1) * 6;
      o.squashT = Math.max(o.squashT, 0.5);
      shake = Math.max(shake, 0.5);
      if (carnage) {
        ledger.hit(o.id, me.id, RAMMER.damage, timeU.value);
        damageHp(o, RAMMER.damage, me);
      }
    }
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
      if (fresh) vehicleContact(other, hit);
      if (hit > 3) buzz(hit > 8 ? 'crash' : 'hit', !!ctx.controls?.haptics);
    } else if (hit > 4 && Math.hypot(ea.car.x - me.car.x, ea.car.z - me.car.z) < 30 && fresh) audio.crunch(hit * 0.5, ea.car.feel.mass);
    if (hit > 2 && fresh) impactFx(info, ea, eb, hit);
    if (carnage) {
      if (!fresh || !racingNow() || derbyOver) return;
      const tot = info.closeA + info.closeB + 0.001;
      let any = false;
      // where it was hit and who drove into whom decide the share: the rammer's nose takes little, the flank and the tail the bulk
      const sides = [[ea, eb, info.closeB, info.faceA], [eb, ea, info.closeA, info.faceB]] as const;
      const raw = sides.map(([x, o, closeO, face]) =>
        x.finished || x.wreckT > 0 ? 0 : impactDamage({ dv: info.j / x.car.feel.mass, blame: closeO / tot, facing: face, ram: o.car.ram * (o === me ? mt.spike : 1), ownRam: x.car.ram, dmgTaken: x.tune.dmgMul }) * (derby ? DERBY_DAMAGE : 1),
      );
      sides.forEach(([x, o, closeO, face], n) => {
        // whatever the mass or armour, the nose that rams never takes more than 40 % of what the car it hits takes
        const dmg = capRammer(raw[n]!, raw[1 - n]!, face, closeO / tot);
        if (dmg > 0) {
          damageHp(x, dmg, o, zoneOf(face));
          any = true;
        }
      });
      if (any) pairCd.set(key, now);
    } else if (hit > 2) {
      hurt(ea, (hit - 2) * 1.2);
      hurt(eb, (hit - 2) * 1.2);
    }
  }

  /** Floating "+12" numbers over the cars the player hits (summed per car for a moment so a stream of small hits reads as one number). */
  const floatAcc = new Map<string, { pts: number; t: number }>();
  function floatNumber(x: Entrant, pts: number, mine: boolean): void {
    const f = floatAcc.get(x.id) ?? { pts: 0, t: -9 };
    f.pts += pts;
    floatAcc.set(x.id, f);
    const now = timeU.value;
    if (f.pts < 1.5 || now - f.t < 0.2) return;
    camera.updateMatrixWorld();
    tmpV.set(x.car.x, x.car.y + 2.2 * x.car.size, x.car.z).project(camera);
    if (tmpV.z > 1) return;
    const text = mine ? `+${Math.round(f.pts)}` : `−${Math.round(f.pts)}`;
    hud.floater(text, (tmpV.x * 0.5 + 0.5) * W, (-tmpV.y * 0.5 + 0.5) * H, mine ? (f.pts >= 20 ? 'big' : '') : 'taken');
    f.pts = 0;
    f.t = now;
  }

  /** Health lost: from another car (who may get a takedown if this wrecks it and is paid points for the damage) or from the road (null). */
  function damageHp(x: Entrant, dmg: number, from: Entrant | null, zone: 'front' | 'side' | 'rear' | null = null): void {
    if (!carnage || x.wreckT > 0 || x.finished || dmg <= 0 || !racingNow() || derbyOver || (x === meE && dodgeT > 0)) return;
    const real = Math.min(dmg, x.hp);
    x.hp = Math.max(0, x.hp - dmg);
    x.calmT = 0;
    if (from) {
      ledger.hit(x.id, from.id, dmg, timeU.value);
      if (from !== x && real > 0) {
        // the damage you deal is what the points are made of; whoever deals some is no longer FEGIS
        const pts = damagePoints(real, x.maxHp);
        from.dealt += pts;
        if (derby) board.deal(from.id, pts);
        if (pts > 0.05) {
          if (fegisDealt(from)) endFegis(from);
        }
        if (from === meE) {
          dbg.dealt += pts;
          floatNumber(x, pts, true);
          if (zone === 'side' || zone === 'rear') dbg.flankHits++;
        } else if (x === meE) floatNumber(x, real, false);
      }
    }
    x.model.setDamage(100 * (1 - x.hp / x.maxHp) * 0.9);
    if (x.hp <= 0) wreck(x);
  }

  /** FEGIS: nothing dealt for too long. The mark shows over the car, the crowd boos and the health drains until it hits somebody. */
  function startFegis(e: Entrant): void {
    dbg.fegisStarts++;
    if (e === meE) {
      hud.pop('fegis', '🐔', 'FEGIS!', 'hit');
      audio.boo(1);
    } else if (Math.hypot(e.car.x - player().car.x, e.car.z - player().car.z) < 70) {
      hud.toast(`🐔 ${e.name} är FEGIS och tappar hälsa`, 'dead');
      audio.boo(0.6);
    }
  }
  function endFegis(e: Entrant): void {
    if (e === meE) hud.toast('Bra! Du slåss igen', 'td');
  }

  /** Per car each frame: nobody nearby to hit pauses the clock in a lap race; in the derby the clock always runs. */
  function fegisStep(e: Entrant, dt: number): void {
    if (e.wreckT > 0 || e.finished || !racingNow() || derbyOver || phase !== 'race' || (derby && raceT < DERBY_WARMUP)) return;
    let near = derby;
    if (!near)
      for (const o of entrants) {
        if (o === e || o.wreckT > 0 || o.finished) continue;
        if (Math.hypot(o.car.x - e.car.x, o.car.z - e.car.z) < FEGIS_REACH) {
          near = true;
          break;
        }
      }
    const ev = fegisTick(e, dt, near);
    if (ev === 'start') startFegis(e);
    else if (ev === 'end') endFegis(e);
    if (e.fegis) {
      // slow bleeding: no takedown credit for anybody, the car is simply giving out
      e.hp = Math.max(0, e.hp - fegisDrain(e.maxHp, dt));
      e.model.setDamage(100 * (1 - e.hp / e.maxHp) * 0.9);
      if (e.hp <= 0) wreck(e);
    }
  }

  const colFireball = new THREE.Color(1.9, 0.55, 0.06);
  const colFireCore = new THREE.Color(2.4, 1.5, 0.5);
  const colMetal = new THREE.Color('#2a2a30');
  /** A wreck going up: a fireball, a black column of smoke, a shower of sparks and bits of the car flying (no gore, just scrap). */
  function explode(c: Car, paint?: string): void {
    sparks(c.x, c.y, c.z, high ? 40 : 18);
    // the fireball: big additive puffs, a white-hot core, rising
    for (let k = 0; k < (high ? 9 : 6); k++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.2;
      glow.emit({ x: c.x + Math.cos(a) * r, y: c.y + 0.7 + Math.random() * 0.8, z: c.z + Math.sin(a) * r, vx: Math.cos(a) * (1 + Math.random() * 4), vy: 1.5 + Math.random() * 3.5, vz: Math.sin(a) * (1 + Math.random() * 4), life: 0.35 + Math.random() * 0.45, size0: 1.8, size1: 4.5 + Math.random() * 2.5, color: colFireball, alpha: 0.8, drag: 2.4, gravity: -1.5 });
    }
    glow.emit({ x: c.x, y: c.y + 1.0, z: c.z, vy: 1, life: 0.25, size0: 2.2, size1: 5, color: colFireCore, alpha: 0.9, drag: 3 });
    // the smoke column
    for (let k = 0; k < (high ? 12 : 6); k++) {
      particles.emit({ x: c.x + (Math.random() - 0.5) * 1.5, y: c.y + 1.2, z: c.z + (Math.random() - 0.5) * 1.5, vx: (Math.random() - 0.5) * 3, vy: 3 + Math.random() * 4, vz: (Math.random() - 0.5) * 3, life: 1.8 + Math.random() * 1.4, size0: 1.6, size1: 6, color: colDark, alpha: 0.5, drag: 1.1, gravity: -0.6 });
    }
    // scrap: panels in the car's colour, dark metal and a tyre or two
    colDebris.set(paint ?? '#c0392b');
    for (let k = 0; k < (high ? 14 : 6); k++) {
      const big = k % 5 === 4;
      const sz = big ? 0.5 : 0.18 + Math.random() * 0.3;
      if (big) colDebris.copy(colMetal);
      else colDebris.set(k % 3 === 2 ? '#26262c' : (paint ?? '#c0392b'));
      debris.emit(c.x, c.y + 0.9, c.z, (Math.random() - 0.5) * 16, 5 + Math.random() * 8, (Math.random() - 0.5) * 16, big ? sz : sz * 1.8, big ? sz : sz * 0.4, big ? sz * 0.5 : sz, colDebris, 6);
    }
  }

  /** Health gone: out for a few seconds in a flip and a cloud of smoke, and whoever hit it last (within two seconds) gets the takedown. */
  function wreck(x: Entrant): void {
    if (x.wreckT > 0) return;
    const me = player();
    const c = x.car;
    x.wreckT = derby ? Infinity : WRECK_SECONDS;
    x.fegis = false;
    x.wreckAge = 0;
    x.wrecks++;
    x.tumbleT = 0;
    c.vy = Math.max(c.vy, 0) + 7;
    c.y += 0.1;
    c.yawRate += (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 3);
    c.vx *= 0.7;
    c.vz *= 0.7;
    c.ghost = derby ? 1e9 : WRECK_SECONDS + 0.4;
    x.model.setDamage(100);
    explode(c, x.color);
    const by = ledger.credit(x.id, timeU.value);
    const attacker = by ? entrants.find((e) => e.id === by) ?? null : null;
    dbg.wrecks++;
    if (attacker) attacker.takedowns++;
    if (attacker === me) {
      mods.bus.takedown();
      hud.pop('takedown', '💥', 'Takedown!', 'hit');
    }
    if (x === me) mods.bus.wreck();
    if (attacker && attacker !== me) dbg.rivalTake++;
    if (derby) {
      board.eliminate(x.id, raceT, attacker?.id ?? null);
      audio.cheer(0.9);
      const left = board.aliveCount();
      if (left > 1 && x !== me && attacker !== me) setTimeout(() => !destroyed && !derbyOver && hud.toast(`${left} bilar kvar`), 900);
    }
    const near = Math.hypot(c.x - me.car.x, c.z - me.car.z) < 70;
    if (near || x === me || attacker === me) audio.boom();
    if (x === me) {
      shake = Math.max(shake, 0.6);
      drift.on = false;
      hud.toast(derby ? (attacker ? `💀 ${attacker.name} slog ut dig. Du är ute ur derbyt` : '💀 Du blev vrak och är ute ur derbyt') : attacker ? `💀 ${attacker.name} vrakade dig` : '💀 Du blev vrak. Snyggt.', 'dead');
    } else if (attacker === me) {
      shake = Math.max(shake, 0.3);
      hud.toast(derby ? `💥 TAKEDOWN! ${x.name} är ute · ${board.aliveCount()} kvar` : `💥 TAKEDOWN! ${x.name} är skrot · +3 p`, 'td');
    } else if (attacker && near) hud.toast(`${attacker.name} vrakade ${x.name}`, 'dead');
    else if (near && x !== me) hud.toast(`${x.name} körde sönder sig själv`, 'dead');
  }

  /** Per car each frame in Blodbad: a wrecked car lies smoking, then comes back on the road behind with most of its health. */
  function wreckStep(e: Entrant, dt: number): void {
    if (!carnage) return;
    if (e.wreckT <= 0) {
      e.calmT += dt;
      // FEGIS is for the derby only: Blodbad is a race, a quiet driver there simply scores less
      if (derby) fegisStep(e, dt);
      // a boss with the right to heal does so when nobody has hit it for a while
      if (e.spec?.rules.includes('regen') && e.calmT > 3 && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + 6 * dt);
      return;
    }
    const c = e.car;
    e.wreckT = Math.max(0, e.wreckT - dt);
    e.wreckAge += dt;
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
    // a derby wreck is out for good: a few seconds of smoke, then the tow truck takes it away
    if (derby && e.wreckAge > 4.2 && !e.gone) {
      e.gone = true;
      explode(c, e.color);
      poof(c.x, c.y, c.z);
      c.y = -100;
      c.vx = c.vz = c.vy = 0;
      e.model.root.visible = false;
      e.model.shadow.visible = false;
    }
    if (e.wreckT === 0) {
      e.idleT = 0;
      e.fegis = false;
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
    e.eager = false;
    if (aggro < 0.04 || e.tumbleT > 0 || Math.random() > aggro) return;
    const me = player();
    let leader: Entrant | null = null;
    for (const o of entrants) if (!o.finished && (!leader || o.u > leader.u)) leader = o;
    let best: Entrant | null = null;
    let bestScore = Infinity;
    for (const o of entrants) {
      if (o === e || o.finished || o.wreckT > 0 || o.car.ghost > 0) continue;
      // the golf cart is silent: nobody goes for it
      if (o === me && kit?.passive.id === 'silent') continue;
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

  /** Blodbad points as the race stands now (as if it ended): damage dealt, takedowns and a smaller part for the position on the road. */
  function carnageTable(order: Runner[]): ReturnType<typeof pointsTable> {
    return pointsTable(order.map((r, i) => ({ id: r.id, place: i + 1, takedowns: entrants.find((e) => e.id === r.id)?.takedowns ?? 0, damage: entrants.find((e) => e.id === r.id)?.dealt ?? 0 })));
  }

  // ---- Rivningsderby: who is running, the computer drivers, the end ----
  /** Health as a share of the full, by car id (the derby ranks the cars still running by it). */
  const hpFrac = (id: string): number => {
    const e = entrants.find((x) => x.id === id);
    return e ? e.hp / e.maxHp : 0;
  };
  const foesBuf: DerbyFoe[] = [];
  /** Controls for one car in a derby: the player's own, a computer driver's brain, or nothing for a wreck. */
  function derbyControls(e: Entrant, dt: number, racing: boolean): void {
    const me = player();
    if (derbyOver || e.wreckT > 0) {
      e.ctl.throttle = 0;
      e.ctl.brake = derbyOver ? 0.5 : 0.25;
      e.ctl.steer = 0;
      e.ctl.handbrake = false;
      return;
    }
    if (e === me && !AUTO) {
      if (!me.finished && phase !== 'over') playerControls(dt, e);
      return;
    }
    if (!racing) {
      // the grid: engines revving
      e.ctl.throttle = Math.random() < 0.04 ? 0.8 : e.ctl.throttle * 0.9;
      e.ctl.brake = 0;
      return;
    }
    const brain = e.brain ?? (e.brain = new DerbyBrain({ aggro: 0.9, skill: AUTO || 0.9, phase: 0 }));
    foesBuf.length = 0;
    for (const o of entrants) foesBuf.push({ car: o.car, alive: o.wreckT <= 0 && !o.gone, hp: o.hp / o.maxHp, player: o === me });
    // a blinded driver wanders, a squashed one barely moves
    brain.desperate = e.fegis;
    brain.hurt = e.hp < e.maxHp * 0.3 && !e.fegis;
    brain.think(e.car, foesBuf, dt, raceT < DERBY_WARMUP);
    brain.drive(e.car, track, foesBuf, timeU.value, dt, e.ctl);
    if (DEBUG && dbgStill.get(e.id)) {
      e.ctl.throttle = 0;
      e.ctl.brake = 1;
      e.ctl.steer = 0;
    }
    // pinned against a fence again and again: the tow truck puts it back on the floor
    if (brain.gaveUp) {
      brain.gaveUp = false;
      if (e !== me || AUTO) respawn(e);
    }
    if (e !== me) {
      e.car.power = e.basePower * damagePower(e.damage) * (e.squashT > 0 ? 0.4 : 1) * (e.hp < e.maxHp * 0.25 ? 0.9 : 1);
      if (e.ai) e.ai.aim = null;
      if (e.blindT > 0) e.ctl.steer = clamp(e.ctl.steer + Math.sin(timeU.value * 7 + entrants.indexOf(e)) * 0.32, -1, 1);
      rivalTricks(e, dt);
    }
  }

  /** The derby is over: place everyone, tell the player how it went, and let the finish card run. */
  function finishDerby(): void {
    if (derbyOver) return;
    derbyOver = true;
    const me = player();
    derbyTimeUp = board.aliveCount() > 1 && raceT >= board.limit;
    const stand = board.standings(hpFrac);
    const mine = stand.find((r) => r.id === me.id)!;
    derbyTable = stand.map((r) => {
      const e = entrants.find((x) => x.id === r.id)!;
      return { name: e.name, place: r.place, alive: r.alive, takedowns: r.takedowns, dealt: r.dealt, points: r.points, survival: r.survival, hp: Math.round(r.hp * 100), outAt: r.outAt, me: e === me };
    });
    finishPlace = mine.place;
    finishTime = raceT;
    me.finished = true;
    me.finishTime = raceT;
    phase = 'finish';
    phaseT = 0;
    drift.on = false;
    if (rules) {
      const info: FinishInfo = { place: finishPlace, n: entrants.length, finished: true, time: Math.round(finishTime * 1000), laps: [], kronor: racePrize(rules, finishPlace, entrants.length), coins: Math.round(coinKr) };
      finishAdj = mods.bus.finish(info);
    }
    const won = finishPlace === 1;
    hud.msg(won ? 'MEST POÄNG!' : derbyTimeUp ? 'TIDEN UTE!' : 'DERBYT SLUT', 1900, won ? 'gold' : 'small');
    hud.subtitle(derbyHeadline({ place: mine.place, n: entrants.length, alive: mine.alive, timeUp: derbyTimeUp }));
    hud.wrongWay(false);
    audio.fanfare(won);
    audio.cheer(1);
    audio.music(0.75);
    // the survivors stop and wave; the confetti goes off over the winner
    for (const e of entrants) if (e.wreckT <= 0) e.car.ghost = Math.max(e.car.ghost, 1);
  }

  /** The shortcut jump: take off at its lip fast enough, land in its window, and you are credited the stretch of road you flew over. */
  function shortcutStep(me: Entrant): void {
    if (!shortcut || scDone || phase !== 'race' || me.finished) return;
    const c = me.car;
    const lip = lipOf(shortcut);
    const gap = track.wrapDist(c.proj.s - lip.s);
    if (c.air && !scTake) {
      if (gap > -3 && gap < 9 && Math.abs(c.proj.d - shortcut.d) < shortcut.width / 2 + 1.2 && c.speed >= SHORTCUT_MIN_SPEED) scTake = true;
    } else if (scTake && !c.air) {
      scTake = false;
      if (shortcutLanded(shortcut, c.proj.s, track)) {
        scDone = true;
        me.u += SHORTCUT_SKIP;
        stats.shortcuts++;
        hud.msg('GENVÄG!', 1300, 'small gold');
        hud.toast(`🚀 Du hoppade över ${SHORTCUT_SKIP} m av banan`);
        audio.chime();
        audio.cheer(0.9);
        sparkleAt(c.x, c.y, c.z, 14, 1.5);
        confetti.burst(c.x, c.y + 2, c.z, high ? 40 : 20, 6);
        // the stunt upgrades pay out as for a very long jump
        mods.bus.trick('air', 2);
      } else hud.toast('Nästan! Hoppa fortare och längre');
    }
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
        hud.subtitle(ctx.touch && !ctx.controls?.pedals ? 'Bilen gasar själv. Du styr med ◀ ▶' : ctx.controls?.manual ? 'Håll gasen. Växla upp när lampan blir röd!' : 'Gasa när lampan blir grön!');
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
      if (derby) {
        derbyControls(e, dt, racing);
        continue;
      }
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
          if (e.eager) mul *= 0.82;
          e.car.power = e.basePower * (1 + boost * 0.9 + lastLap) * (1 - ease * 0.4) * damagePower(e.damage) * (e.squashT > 0 ? 0.4 : 1) * (e.hp < e.maxHp * 0.25 && carnage ? 0.85 : 1);
          if (e.ai) {
            e.ai.surge = e.rivalBoostT > 0 ? 0.1 : 0;
            // every car in Blodbad fights: the racers too go for the opportunity, and (derby) a FEGIS car goes for anybody
            if (carnage) e.ai.p.aggro = e.fegis ? 1 : Math.max(FIGHT_MIN, e.spec!.aggro * (e.spec!.rules.includes('regen') && e.hp < e.maxHp * 0.5 ? 1.3 : 1));
            if (racing && !e.finished && e.wreckT <= 0) aimStep(e, dt);
            else e.ai.aim = null;
          }
        } else if (e !== me && !me.finished) {
          const k = diff.band;
          const gap = e.u - me.u;
          if (gap > 20) mul = 1 - Math.min(0.13, (gap - 20) / 800) * k;
          else if (gap < -30) mul = 1 + Math.min(0.06, (-gap - 30) / 1200) * k;
          e.car.power = e.basePower * (gap < -30 ? 1 + Math.min(0.08, (-gap - 30) / 1000) * k : gap > 60 ? 1 - 0.07 * k : 1) * damagePower(e.damage) * (e.squashT > 0 ? 0.4 : 1);
        }
        if (e.finished) mul = Math.min(mul, 0.72);
        // a snow cloud blinds whoever drives into it: slower and wandering for a moment
        if (e !== me && clouds.length) {
          for (const cl of clouds) {
            const dx = e.car.x - cl.x;
            const dz = e.car.z - cl.z;
            const fwd = dx * Math.sin(cl.h) + dz * Math.cos(cl.h);
            const lat = dx * Math.cos(cl.h) - dz * Math.sin(cl.h);
            if (Math.abs(fwd) < POWDER.reach * 0.6 && Math.abs(lat) < POWDER.width) {
              if (e.blindT <= 0) stats.squashed++;
              e.blindT = POWDER.blind;
            }
          }
        }
        if (e.blindT > 0) mul *= 0.72;
        drv.drive(e.car, track, cars, mul, timeU.value + entrants.indexOf(e), dt, e.ctl);
        if (e.blindT > 0 && e !== me) {
          e.ctl.steer = clamp(e.ctl.steer + Math.sin(timeU.value * 7 + entrants.indexOf(e)) * 0.32, -1, 1);
          if (Math.random() < 0.05) particles.emit({ x: e.car.x, y: e.car.y + 1.6, z: e.car.z, vy: 0.8, life: 0.8, size0: 0.9, size1: 1.8, color: colSnow, alpha: 0.7, drag: 1, gravity: -0.2 });
        }
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
    abilityStep(dt, me, racing);
    hornStep(dt, me, racing);
    for (const e of entrants) handling(e, dt, e === me);
    tricks(dt, me, racing);
    obstaclesStep(dt, racing);

    // ---- physics (two steps a frame) ----
    const nLocal = entrants.length;
    for (let k = 0; k < 2; k++) {
      for (const e of entrants) {
        if (e.gone) continue;
        e.car.step(dt / 2, e.ctl, ground, !racing);
        e.ctl.shift = 0;
      }
      if (racing)
        collideCars(cars, (a, b, j, info) => {
          carHit(a, b, j, info);
          // a bike that is hit hard falls over; a lighter knock only makes the rider wobble
          for (const x of [entrants[a], entrants[b]]) if (x && x.car.feel.two && x.wreckT <= 0) knock(x, j, 7);
        });
    }
    for (const e of entrants) if (!e.gone) e.car.settle(dt, ground);
    // ---- race bookkeeping ----
    for (const e of entrants) {
      const c = e.car;
      const ds = track.wrapDist(c.proj.s - e.lastS);
      e.lastS = c.proj.s;
      if (racing) e.u += ds;
      e.rate = damp(e.rate, ds / dt, 2, dt);
      const done = Math.floor(e.u / track.length);
      if (!derby && racing && done > e.lapsDone && e.u > 0) {
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
    if (derby) {
      // the end of the derby: one car left, the clock out, or the player wrecked a moment ago
      place = board.place(me.id, hpFrac);
      if (phase === 'race' && !derbyOver) {
        if (me.wreckT > 0) playerOutT += dt;
        if (board.isOver(raceT) || playerOutT > 2.6) finishDerby();
      }
    }
    if (!derby && phase === 'race' && !me.finished && raceT > 4) {
      // cars the player passes (and holds the place against for a few metres)
      for (const e of entrants) {
        if (e === me || e.finished) continue;
        const was = passed.get(e.id);
        if (was === undefined) passed.set(e.id, e.u < me.u - 3);
        else if (!was && e.u < me.u - 4) {
          passed.set(e.id, true);
          stats.overtakes++;
          if (mods.bus.size) {
            let top = -Infinity;
            for (const o of entrants) if (o !== me && o.u > top) top = o.u;
            mods.bus.overtake(e.u >= top - 0.5);
          }
        } else if (was && e.u > me.u + 4) passed.set(e.id, false);
      }
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
    if (!derby && phase === 'race' && !me.finished) {
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
      // grime builds up over the race, faster off the tarmac and when it is wet
      if (phase === 'race' && c.speed > 3) {
        const rough = c.surface !== Ground_.Asphalt ? 3.5 : 1;
        e.dirt = Math.min(1, e.dirt + dt * 0.0045 * rough * (rain ? 1.8 : 1));
        e.model.setWear(e.dirt, wearOf(e));
      }
      if (c.wallHit > 1.5) {
        const hay = c.wallKind === Fence.Bales;
        if (c.feel.two && !hay) knock(e, c.wallHit, 8.5);
        if (isMe) {
          if (hay) audio.hay(c.wallHit);
          else audio.thud(c.wallHit);
          shake = Math.max(shake, Math.min(0.6, c.wallHit * 0.05));
          if (isMe && c.wallHit > 4) buzz('hit', !!ctx.controls?.haptics);
          mods.bus.hit('wall', c.wallHit);
        }
        const n = Math.min(14, Math.round(c.wallHit * 1.5));
        for (let k = 0; k < (high ? n : n / 2); k++)
          particles.emit({ x: c.x, y: c.y + 0.7, z: c.z, vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 6, life: 0.9, size0: hay ? 0.35 : 0.9, size1: hay ? 0.25 : 2.2, color: hay ? colHay : colDirt, alpha: hay ? 1 : 0.4, drag: 1.2, gravity: hay ? 6 : 0 });
        if (damageK > 0 && c.wallHit > 4) {
          hurt(e, (c.wallHit - 4) * (hay ? 0.5 : 1.4));
          if (!hay) sparks(c.x, c.y, c.z, high ? 10 : 5);
        } else if (carnage && c.wallHit > 5) {
          // (the tyre wall of an arena is soft: it hurts a lot less than a stone wall)
          damageHp(e, (c.wallHit - 5) * (hay ? 0.4 : 0.9) * Math.max(0.3, e.tune.dmgMul) * (derby ? DERBY_DAMAGE * 0.7 : 1), null);
          if (!hay) sparks(c.x, c.y, c.z, high ? 10 : 5);
        }
      }
      c.wallHit = 0;
      if (c.landed > 1.5) {
        if (isMe) {
          audio.thud(c.landed * 1.3);
          shake = Math.max(shake, Math.min(0.5, c.landed * 0.07));
          mods.bus.hit('land', c.landed);
          if (kit?.passive.id === 'softLanding' && c.landed >= SOFTLAND.min && landCd <= 0 && phase === 'race') {
            landCd = 1.5;
            api.boost(SOFTLAND.boost, SOFTLAND.strength);
            hud.toast('🏁 Mjuklandning! Boost');
            hud.pop('passive', '🏁', kit.passive.name, 'abil');
          }
        }
        for (let k = 0; k < (high ? 16 : 7); k++) {
          const a = Math.random() * Math.PI * 2;
          particles.emit({ x: c.x + Math.cos(a) * 1.4, y: c.y + 0.2, z: c.z + Math.sin(a) * 1.8, vx: Math.cos(a) * 3, vy: 0.6, vz: Math.sin(a) * 3, life: 1.2, size0: 1.0, size1: 3.4, color: c.surface === Ground_.Gravel ? colDust : colSmoke, alpha: 0.4, drag: 2 });
        }
        if (c.landed > 5) {
          hurt(e, (c.landed - 5) * 1.5 * (1 - e.tune.assist) * c.feel.landing);
          if (carnage) damageHp(e, (c.landed - 6) * 1.2 * c.feel.landing * e.tune.dmgMul * (derby ? DERBY_DAMAGE : 1), null);
        }
      }
      c.landed = 0;
      // a battered car smokes from the bonnet, and a nearly dead one burns a little
      const worn = wearOf(e);
      if (worn > 50 && e.wreckT <= 0) {
        const sinH = Math.sin(c.heading);
        const cosH = Math.cos(c.heading);
        const k = (worn - 50) / 50;
        if (Math.random() < (high ? 0.4 : 0.2) * (k + 0.35)) {
          particles.emit({ x: c.x + sinH * 1.6, y: c.y + 1.1, z: c.z + cosH * 1.6, vx: c.vx * 0.3, vy: 1.4, vz: c.vz * 0.3, life: 1.5, size0: 0.5, size1: 2.3, color: k > 0.5 ? colDark : colSmoke, alpha: 0.18 + 0.3 * k, drag: 1.5, gravity: -0.4 });
        }
        if (worn > 80 && Math.random() < 0.3) glow.emit({ x: c.x + sinH * 1.5 + (Math.random() - 0.5) * 0.5, y: c.y + 0.95, z: c.z + cosH * 1.5 + (Math.random() - 0.5) * 0.5, vx: c.vx * 0.4, vy: 1.6, vz: c.vz * 0.4, life: 0.3, size0: 0.45, size1: 0.12, color: colFireball, alpha: 0.7, drag: 2 });
        if (worn > 65 && Math.random() < 0.08) sparks(c.x - sinH * 0.6, c.y + 0.1, c.z - cosH * 0.6, 3);
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
    const haptic = !!ctx.controls?.haptics;
    if (mc.perfect) {
      mc.perfect = 0;
      audio.shiftTick();
      hud.shiftFlash();
      buzz('perfect', haptic);
    } else if (mc.shifted && mc.manual) buzz('shift', haptic);
    if (mc.shiftDenied) {
      mc.shiftDenied = 0;
      if (raceT - lastDenied > 2.5) {
        lastDenied = raceT;
        hud.toast('Växeln vägrar: för hög fart för den!');
      }
    }
    audio.playerEngine(mc.rpm, mc.throttleIn, mc.shifted, mc.limiterT > 0, mc.gear / mc.box.v.length);
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
    glow.update(dt);
    debris.update(dt, ground.height);
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
    rampMeshes?.update(timeU.value);
    scenery.update(timeU.value, tmpV.set(mc.x, mc.y, mc.z), phase === 'finish' || phase === 'over' ? 1 : phase === 'count' || (phase === 'race' && phaseT < 3) ? 0.8 : 0);
    {
      attitude.update(timeU.value, tmpV.set(mc.x, mc.y, mc.z));
      // burning barrels and flares smoke (only near the player; never in front of the chase camera)
      for (const sm of attitude.smokers) {
        if ((sm.x - mc.x) ** 2 + (sm.z - mc.z) ** 2 > 75 * 75) continue;
        if (Math.random() > (sm.kind === 0 ? 0.16 : 0.1) * (high ? 1 : 0.6) * dt * 60) continue;
        if (sm.kind === 0) particles.emit({ x: sm.x, y: sm.y, z: sm.z, vx: 0.4 + Math.random() * 0.6, vy: 2.2 + Math.random(), vz: (Math.random() - 0.5) * 0.5, life: 2.6, size0: 0.7, size1: 4.5, color: colDark, alpha: 0.4, drag: 0.5, gravity: -0.3 });
        else particles.emit({ x: sm.x, y: sm.y, z: sm.z, vx: 0.3 + Math.random() * 0.4, vy: 1.4, vz: (Math.random() - 0.5) * 0.4, life: 2.4, size0: 0.4, size1: 3, color: colFlareSmoke, alpha: 0.32, drag: 0.6, gravity: -0.2 });
      }
    }
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
      if (derby) {
        const stand = board.standings(hpFrac);
        const mineD = stand.find((r) => r.id === me.id)!;
        hud.setPosition(mineD.place, entrants.length, 0, 0);
        hud.setScore(mineD.points, me.takedowns, me.dealt);
        hud.setFegis(me.fegis && me.wreckT <= 0);
        hud.setHealth(me.hp / me.maxHp, me.hp, 0);
        hud.setDerby({ alive: board.aliveCount(), total: entrants.length, left: board.timeLeft(raceT), takedowns: me.takedowns });
        if (hudBoard)
          hud.setBoard(
            stand.map((r) => {
              const e = entrants.find((x) => x.id === r.id)!;
              return { name: e.name, color: e.color, me: e === me, done: false, x: e.car.x, z: e.car.z, out: !r.alive, tag: `${e.fegis && r.alive ? '🐔 ' : ''}${r.points} p` };
            }),
          );
      } else if (carnage) {
        // Blodbad is decided on points: the big number is the rank by points, the board shows everyone's points
        const table = carnageTable(order);
        const mine = table.find((r) => r.id === me.id)!;
        hud.setPosition(mine.rank, order.length, me.finished ? LAPS + 1 : shownLap, LAPS);
        hud.setScore(mine.points, me.takedowns, me.dealt);
        hud.setFegis(me.fegis && me.wreckT <= 0);
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
    shortcutStep(me);

    // camera input: C (the key), Start, the 🎥 button; the C button is the camera too when there is no nitro
    if (inp.keyPressed('KeyC') || inp.pressed('start') || camPress || (inp.pressed('c') && nitroSlots() === 0)) {
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
    scDone = false;
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
    const ms = Math.round(finishTime * 1000) - finishAdj.time + penaltyMs;
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
    // (a derby is decided by the placing alone: the order the cars were wrecked in, with the survivors ranked by health)
    const row = carnage && !derby ? carnageTable(ranking()).find((r) => r.id === me.id)! : null;
    const placed = finished ? (row ? row.rank : finishPlace) : total;
    let sc = derby ? 2500 + (total - placed) * 1500 + me.takedowns * 700 + Math.round(me.dealt * 12) + (placed === 1 ? 2500 : 0) : finished ? score(finishPlace, finishTime) : 1200 + Math.round(1800 * clamp(me.u / (LAPS * track.length), 0, 1));
    let detail = derby ? `${ordinal(placed)} i derbyt · ${derbyTable.find((r) => r.me)?.points ?? 0} p · ${me.takedowns} vrak` : finished ? (row ? `${ordinal(row.rank)} på poäng · ${row.points} p` : `${ordinal(finishPlace)} plats · ${fmtTime(finishTime)}`) : `Nästan i mål! · ${Math.min(LAPS, me.lapsDone)} av ${LAPS} varv`;
    if (rules) {
      const ms = finished ? Math.round(finishTime * 1000) - finishAdj.time + penaltyMs : 0;
      const medal = ms && !derby ? raceMedal(course.id, LAPS, ms) : null;
      const medalTxt = medal === 'gold' ? ' · 🥇' : medal === 'silver' ? ' · 🥈' : medal === 'bronze' ? ' · 🥉' : '';
      // not finishing pays the small taking-part prize
      const kronor = finished ? racePrize(rules, placed, total) : RACE_DNF_PRIZE;
      const coinTotal = Math.round(coinKr);
      const bonus = bonusKr + finishAdj.kronor;
      detail += ` · +${kronor + coinTotal + bonus} kr${medalTxt}`;
      sc += styleBonus();
      // a battered car after Blodbad comes out of it a little scratched, not wrecked
      const damage = carnage ? Math.round((1 - me.hp / me.maxHp) * 35) : Math.round(me.damage);
      const mine = derby ? derbyTable.find((r) => r.me) : undefined;
      opts?.onDone?.({
        place: placed,
        n: total,
        finished,
        time: ms,
        laps: derby ? 0 : Math.min(LAPS, me.lapsDone),
        kronor,
        coins: coinTotal,
        medal,
        damage,
        bonus,
        timeBonus: finishAdj.time,
        stats: { ...stats },
        bestLap: Number.isFinite(bestLap) ? Math.round(bestLap * 1000) : 0,
        triggers: { ...triggers },
        kind,
        points: derby ? mine?.points : row?.points,
        dealt: carnage ? Math.round(me.dealt) : undefined,
        survival: derby ? mine?.survival : undefined,
        takedowns: me.takedowns,
        wrecked: me.wrecks,
        roadPlace: finished ? finishPlace : undefined,
        derby: derby ? { arena: arenaC!.id, seconds: Math.round(finishTime), limit: board.limit, alive: !!mine?.alive, timeUp: derbyTimeUp, table: derbyTable } : undefined,
      });
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
    if (e && e.gone) return;
    if (e && e.wreckT > 0) {
      flip = smooth(0, 0.6, derby ? e.wreckAge : WRECK_SECONDS - e.wreckT);
      roll += Math.PI * flip;
    }
    m.root.position.set(c.x, c.y + 1.4 * flip + (e && e === meE && flipShow !== 0 ? 0.9 * Math.abs(Math.sin(flipShow * 0.5)) : 0), c.z);
    const spin = e && e === meE ? flipShow : 0;
    euler.set(-c.slopePitch - (e?.wheelie ?? 0) - spin, c.heading, c.slopeRoll + roll, 'YXZ');
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

  let dbgCam: number[] | null = null;
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
    if (DEBUG && dbgCam) {
      // test hook: a fixed camera for screenshots of the scenery
      camera.position.set(dbgCam[0]!, dbgCam[1]!, dbgCam[2]!);
      camera.lookAt(dbgCam[3]!, dbgCam[4]!, dbgCam[5]!);
    }
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
      syncPost();
      // the bloom is the first thing a struggling machine gives up
      post?.setBloom(resScale > 0.8);
      // and on 'low' the whole pass: below this the plain CSS vignette stands in and the picture is drawn straight to the screen
      if (post && !high) {
        postOn = resScale > 0.62;
        if (vignette) vignette.style.display = postOn ? 'none' : 'block';
      }
    }
  }
  /** Small health bars over the rivals' heads (Blodbad): projected to the screen each frame. */
  const barList: { id: string; x: number; y: number; hp: number; out: boolean; color: string; fegis: boolean }[] = [];
  function projectBars(): void {
    camera.updateMatrixWorld();
    barList.length = 0;
    const me = player();
    for (const e of entrants) {
      if (e === me || e.gone || (derby && e.wreckT > 0)) continue;
      const d = Math.hypot(e.car.x - camera.position.x, e.car.z - camera.position.z);
      if (d > 75) continue;
      tmpV.set(e.car.x, e.car.y + 2.5 * e.car.size, e.car.z).project(camera);
      if (tmpV.z > 1 || Math.abs(tmpV.x) > 1.1 || Math.abs(tmpV.y) > 1.1) continue;
      barList.push({ id: e.id, x: (tmpV.x * 0.5 + 0.5) * W, y: (-tmpV.y * 0.5 + 0.5) * H, hp: e.hp / e.maxHp, out: e.wreckT > 0, color: e.color, fegis: e.fegis });
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
    glow.setScale(H * ctx.dpr, camera.fov);
    {
      const pc = player().car;
      const dView = camMode === 1 || phase === 'intro' ? 0 : Math.hypot(camera.position.x - pc.x, camera.position.y - pc.y, camera.position.z - pc.z);
      particles.setViewer(dView);
      glow.setViewer(dView);
    }
    weather?.update(timeU.value, camera.position);
    // the minimap and speedometer
    if (phase !== 'intro') {
      const c = player().car;
      hud.drawSpeedo(Math.abs(c.vLong) * 3.6, c.rpm, c.reverse ? -1 : c.gear, 7000, {
        manual: c.manual,
        light: c.reverse || !racingNow() ? 0 : shiftLight(c.revFrac, c.gear, c.box),
        gears: c.box.v.length,
        limiter: c.limiterT > 0,
        bog: c.manual && c.throttleIn > 0.6 && c.gear > 1 && c.revFrac < 0.3,
      });
      hud.drawMap(runners().filter((r) => !r.gone).map(toRacer), timeU.value);
    }
    renderer.info.reset();
    if (post && postOn) post.render(scene, camera, timeU.value);
    else renderer.render(scene, camera);
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
        y: me.car.y,
        z: me.car.z,
        speed: me.car.speed,
        gear: me.car.reverse ? -1 : me.car.gear,
        rpm: me.car.rpm,
        manual: me.car.manual,
        limiter: me.car.limiterT > 0,
        thr: me.car.throttleIn,
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
        dealt: Math.round(me.dealt),
        fegis: entrants.map((e) => e.fegis),
        idle: entrants.map((e) => Math.round(e.idleT * 10) / 10),
        points: entrants.map((e) => (derby ? board.standings(hpFrac).find((r) => r.id === e.id)?.points : pointsTable(ranking().map((r, i) => ({ id: r.id, place: i + 1, takedowns: entrants.find((x) => x.id === r.id)?.takedowns ?? 0, damage: entrants.find((x) => x.id === r.id)?.dealt ?? 0 }))).find((r) => r.id === e.id)?.points)),
        wrecks: me.wrecks,
        rivalHp: entrants.filter((e) => e !== me).map((e) => Math.round(e.hp)),
        derby: derby ? { alive: board.aliveCount(), over: derbyOver, left: board.timeLeft(raceT), out: entrants.filter((e) => e.wreckT > 0).length, gone: entrants.filter((e) => e.gone).length } : null,
        shortcut: { done: scDone, taking: scTake, spec: shortcut },
        style: stylePts,
        nitro: nitroLeft,
        ability: { cd: abilCd, kick: kickT, dodge: dodgeT, charge: chargeT, rocket: rocketT, burst: burstT, junk, draft: draftT, drafting, vip: vipT, mow: mowT, clouds: clouds.length, blind: entrants.filter((e) => e.blindT > 0).length, shots: shots.count, obstacles: obstacles.count, hp: me.hp, maxHp: me.maxHp, wheelie: me.wheelie, ram: me.car.ram, boost: me.car.boost, ghost: me.car.ghost, vy: me.car.vy, air: me.car.air, heading: me.car.heading, uses: stats.abilityUses, squashed: entrants.filter((e) => e !== me && e.squashT > 0).length },
        tumbles,
        gimmicks: gimmicks ? { ids: gimmicks.ids, ...gimmicks.state, penaltyMs, obstacles: obstacles.count, zone: obstacles.countOf('zone'), ice: obstacles.countOf('ice'), pin: obstacles.countOf('pin'), sign: obstacles.countOf('sign'), flipped: hud.map.classList.contains('flipped'), ballsAt: gimmicks.where, objS: (['zone', 'ice', 'sign', 'pin'] as const).flatMap((k) => obstacles.positions(k).map((q) => ({ kind: k, s: track.project(q.x, q.z, -1, { i: 0, u: 0, s: 0, d: 0 }).s }))) } : null,
        mods: { stats: { ...stats }, bonusKr, coinKr, extraBoostT, bananas: obstacles.count, squashed: entrants.filter((e) => e.squashT > 0).length },
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        others: entrants.map((e) => ({ name: e.name, laps: e.lapsDone, u: Math.round(e.u), done: e.finished, t: e.finishTime })),
        cars: derby ? entrants.map((e) => ({ x: Math.round(e.car.x), z: Math.round(e.car.z), v: Math.round(e.car.speed), hp: Math.round(e.hp), out: e.wreckT > 0, tgt: e.brain?.target ? entrants.findIndex((o) => o.car === e.brain!.target!.car) : -1, rev: e.car.reverse })) : null,
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
      post?.dispose();
      vignette?.remove();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
};

export default rally;
