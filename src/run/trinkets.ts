// The talismans (ids and save keys still say `trinket`): small, loud rule changes the player collects during a run. A trinket is data (name, icon,
// rarity, one Swedish line) plus up to three things the race understands (see rally/mods.ts):
//   tune   changes numbers when the race starts,
//   hooks  reacts to boosts, drifts, bumps, laps, pickups and the finish,
//   perk   changes the run itself (shop prices, hearts, reward choices, kronor).
// Owning the same trinket twice stacks it: every effect reads `n`. To add a trinket, add one entry here.
import type { CarBody, RaceRules, RallyTime, RallyWeather } from '../shared/rally.ts';
import { capTune, softCap, neutralTune, ModBus, type HookCtx, type ModEntry, type ModHooks, type ModItem, type ModTune, type RaceMods } from '../rally/mods.ts';

export const RARITIES = ['common', 'rare', 'legendary'] as const;
export type Rarity = (typeof RARITIES)[number];

/** Effects on the run, per stack. */
export interface Perk {
  /** Share off shop prices (0.15 = 15 %). */
  shopDiscount?: number;
  /** Extra hearts when picked up. */
  maxHearts?: number;
  /** Extra trinkets to choose from after a race. */
  choices?: number;
  /** Extra share of the kronor earned in races. */
  kronor?: number;
}

/** The build a trinket belongs to: Ram and Race are the two main trees, the rest are side paths (Kaos is a flavour of legendary). */
export const TRINKET_PATHS = ['ram', 'race', 'fuffens', 'stunt', 'girig', 'kaos'] as const;
export type TrinketPath = (typeof TRINKET_PATHS)[number];

export interface TrinketDef {
  id: string;
  name: string;
  emoji: string;
  rarity: Rarity;
  /** Which build it belongs to (rewards lean on it after a Rally or a Blodbad race). */
  path: TrinketPath;
  /** Highest stack that still adds something, when lower than MAX_STACK (runaway trinkets stop early). */
  maxStack?: number;
  /** One short Swedish line. */
  text: string;
  /** Changes numbers when the race starts; `body` is the vehicle the player drives (some trinkets only help one kind). */
  tune?(t: ModTune, n: number, body: CarBody): void;
  hooks?: ModHooks;
  perk?: Perk;
  /** Changes the sky of every race of the run: rain or clear, night or day (see `skyOf`). */
  sky?: { weather?: RallyWeather; time?: RallyTime };
}

/** Highest stack count that still adds something. */
export const MAX_STACK = 5;
/** The stack that counts for a trinket: its own cap, or the general one. */
export const stackCap = (def: TrinketDef | undefined): number => Math.min(MAX_STACK, def?.maxStack ?? MAX_STACK);

/** `base` for one, `step` more for each extra. */
export const stackLin = (base: number, step: number, n: number): number => base + step * (Math.max(1, n) - 1);
/** 0..1, closing in on 1: 1 − (1 − k)^n. */
export const stackDim = (k: number, n: number): number => 1 - Math.pow(1 - k, Math.max(0, n));

/** Vertical speed (m/s) of the spring jump. */
export const jumpPower = (n: number): number => stackLin(6.5, 1.5, n);
/** Seconds of ghost after a boost. */
export const ghostSeconds = (n: number): number => stackLin(3, 1.5, n);

const every = (c: HookCtx, key: string, dt: number, interval: number): boolean => {
  c.st[key] = (c.st[key] ?? 0) + dt;
  if ((c.st[key] ?? 0) < interval) return false;
  c.st[key] = 0;
  return true;
};

/** A random effect for the chaos talismans: each one is a small thing the race can already do. Returns the pop-up line. */
const CHAOS = ['boost', 'ghost', 'cannon', 'pancake', 'swap', 'slime', 'nitro', 'coins', 'flame', 'hop'] as const;
export type ChaosFx = (typeof CHAOS)[number];
export function chaosEffect(c: HookCtx, id: string, fx: ChaosFx = CHAOS[Math.floor(Math.random() * CHAOS.length)]!): string {
  const a = c.api;
  let text = '';
  switch (fx) {
    case 'boost':
      a.boost(1.6, 1.35);
      text = 'RUSNING!';
      break;
    case 'ghost':
      a.ghost(2.4);
      text = 'SPÖKE!';
      break;
    case 'cannon':
      a.cannon(1.4);
      text = 'KANON!';
      break;
    case 'pancake':
      a.squashLeader(2.2);
      text = 'PANNKAKA!';
      break;
    case 'swap':
      if (a.swapAhead()) text = 'PLATSBYTE!';
      else {
        a.boost(1.2, 1.3);
        text = 'RUSNING!';
      }
      break;
    case 'slime':
      a.banana();
      a.banana();
      text = 'SLEM!';
      break;
    case 'nitro':
      a.nitro(0.5);
      text = 'NITRO!';
      break;
    case 'coins':
      a.kronor(40);
      text = '+40 KR';
      break;
    case 'flame':
      a.flame();
      text = 'ELD!';
      break;
    case 'hop':
      a.bounce(8);
      text = 'HOPP!';
      break;
  }
  a.sparkle(6);
  a.say(id, text);
  return text;
}

/** What the sky of a race becomes with the talismans owned: rain beats clear, night beats day unless the sun is out. */
export function skyOf(owned: readonly Owned[]): { weather?: RallyWeather; time?: RallyTime } {
  const sk = owned.filter((o) => o.n > 0).map((o) => trinketById(o.id)?.sky).filter((x): x is NonNullable<typeof x> => !!x);
  const weather: RallyWeather | undefined = sk.some((x) => x.weather === 'rain') ? 'rain' : sk.some((x) => x.weather === 'clear') ? 'clear' : undefined;
  const time: RallyTime | undefined = sk.some((x) => x.time === 'day') ? 'day' : sk.some((x) => x.time === 'night') ? 'night' : undefined;
  return { weather, time };
}

/** The rules of a race with the sky the talismans pick (Regnmakaren, Solstrålen, Nattskiftet), except for the rabbit boss, whose day is part of the joke. */
export function withSky(rules: RaceRules, owned: readonly Owned[], boss?: string): RaceRules {
  const sky = skyOf(owned);
  if (boss === 'kanin' || (!sky.weather && !sky.time)) return rules;
  return { ...rules, ...(sky.weather ? { weather: sky.weather } : {}), ...(sky.time ? { time: sky.time } : {}) };
}

export const TRINKETS: TrinketDef[] = [
  {
    id: 'gummianka',
    name: 'Studsbollen',
    emoji: '🏀',
    rarity: 'common',
    path: 'stunt',
    text: 'Varje stöt gör KABOING och du studsar högre. Ingen har sagt att det var bilen.',
    hooks: {
      tick(c, dt) {
        c.st.cd = Math.max(0, (c.st.cd ?? 0) - dt);
      },
      hit(c, kind, speed) {
        if (kind === 'land' ? speed < 6 : speed < 1.5) return;
        if ((c.st.cd ?? 0) > 0) return;
        c.st.cd = 0.5;
        c.api.bounce(Math.min(10, 3.5 + speed * 0.3) * (0.75 + 0.3 * c.n) * (kind === 'land' ? 0.7 : 1));
        c.api.boing();
        c.api.sparkle(4);
        c.api.say('gummianka', 'KABOING!');
      },
    },
  },
  {
    id: 'jattehjul',
    name: 'Grannens traktordäck',
    emoji: '🛞',
    rarity: 'common',
    path: 'ram',
    maxStack: 3,
    text: 'Hjulen blir dubbelt så stora. Grannen undrar vart de tog vägen.',
    tune(t, n) {
      t.wheels *= Math.min(3, 1 + n);
      t.offroad *= 1 + 0.12 * n;
      t.size *= 1 + 0.04 * n;
    },
  },
  {
    id: 'magnetko',
    name: 'Kebabmagneten',
    emoji: '🥙',
    rarity: 'common',
    path: 'girig',
    text: 'Mynt flyger till dig från andra sidan banan. Det luktar vitlök.',
    tune(t, n) {
      t.magnet = Math.max(t.magnet, stackLin(16, 8, n));
    },
    hooks: {
      pickup(c, kind) {
        if (kind !== 'coin') return;
        c.st.n = (c.st.n ?? 0) + 1;
        if (c.st.n % 8 === 0) c.api.say('magnetko', 'Mums, mynt!');
      },
    },
  },
  {
    id: 'studsmatta',
    name: 'Grannens trampolin',
    emoji: '🤸',
    rarity: 'common',
    path: 'stunt',
    text: 'Smäller du i ett staket studsar du framåt. Grannen är inte glad.',
    hooks: {
      hit(c, kind, speed) {
        if (kind !== 'wall' || speed < 1.5) return;
        c.api.kick(stackLin(6, 3, c.n));
        c.api.bounce(2.5);
        c.api.boing();
        c.api.say('studsmatta', 'Grannen skriker!');
      },
    },
  },
  {
    id: 'bananskal',
    name: 'Halkfläcken',
    emoji: '🧴',
    rarity: 'common',
    path: 'fuffens',
    text: 'Du lämnar en halkig sörja bakom dig. De andra snurrar. Hoppsan!',
    hooks: {
      tick(c, dt, s) {
        if (!s.racing || s.speed < 8) return;
        if (every(c, 't', dt, 6 / stackLin(1, 0.7, c.n))) {
          c.api.banana();
          c.api.say('bananskal', 'Hoppsan!');
        }
      },
    },
  },
  {
    id: 'tvattbjorn',
    name: 'Soptunneturbon',
    emoji: '🦝',
    rarity: 'common',
    path: 'race',
    maxStack: 3,
    text: 'Sladdar du fylls turbon tre gånger snabbare. Drivs av skräp.',
    tune(t, n) {
      t.driftRate *= 1 + 2 * n;
    },
    hooks: {
      drift(c, _seconds, tier) {
        if (tier > 0) c.api.say('tvattbjorn', 'Sopturbo!');
      },
    },
  },
  {
    id: 'hoppfjadrar',
    name: 'Katapultsätet',
    emoji: '💺',
    rarity: 'common',
    path: 'stunt',
    text: 'Tryck handbromsen när du kör rakt fram: HOPP! Sätet skjuter iväg dig.',
    tune(t, n) {
      t.jump = Math.max(t.jump, jumpPower(n));
    },
    hooks: {
      tick(c, dt, s) {
        c.st.cd = Math.max(0, (c.st.cd ?? 0) - dt);
        if (!s.handbrakePressed || !s.straight || s.air || !s.racing || (c.st.cd ?? 0) > 0) return;
        c.st.cd = 0.9;
        c.api.bounce(jumpPower(c.n));
        c.api.stat('jumps');
        c.api.boing();
        c.api.say('hoppfjadrar', 'Katapult!');
      },
    },
  },
  {
    id: 'piratguld',
    name: 'Farfars guldtänder',
    emoji: '🦷',
    rarity: 'common',
    path: 'girig',
    maxStack: 3,
    text: 'Varje mynt på banan är värt mer. Farfar behövde dem inte längre.',
    tune(t, n) {
      t.coinValue *= 1 + 0.75 * n;
    },
  },
  {
    id: 'sparbossan',
    name: 'Svartjobbet',
    emoji: '💼',
    rarity: 'common',
    path: 'girig',
    text: 'Du får kronor för varje varv. Skatteverket får inte veta.',
    hooks: {
      lap(c) {
        c.api.kronor(stackLin(10, 6, c.n));
        c.api.say('sparbossan', 'Svart pling!');
      },
    },
  },
  {
    id: 'kanelbullar',
    name: 'Snusmotorn',
    emoji: '🫙',
    rarity: 'common',
    path: 'race',
    maxStack: 4,
    text: 'Motorn går på snus: mer kraft. Läkaren avråder.',
    tune(t, n) {
      t.power *= 1 + 0.08 * n;
    },
  },
  {
    id: 'gummistovlar',
    name: 'Mammas tofflor',
    emoji: '🥿',
    rarity: 'common',
    path: 'race',
    text: 'Lera och gräs? Pyttsan. Mammas gamla tofflor klarar allt.',
    tune(t, n) {
      t.mudproof = true;
      t.offroad *= 1 + 0.2 * n;
    },
    hooks: {
      pickup(c, kind) {
        if (kind === 'mud') c.api.say('gummistovlar', 'Lera? Pyttsan!');
      },
    },
  },
  {
    id: 'mandamm',
    name: 'Månskensbrännvinet',
    emoji: '🌚',
    rarity: 'rare',
    path: 'stunt',
    maxStack: 3,
    text: 'Månens tyngdkraft: du svävar länge! Lite yr i huvudet också.',
    tune(t, n) {
      t.gravity *= Math.max(0.28, Math.pow(0.7, n));
    },
  },
  {
    id: 'surstromming',
    name: 'Glitterdimman',
    emoji: '🌫️',
    rarity: 'common',
    path: 'fuffens',
    text: 'En tjock glitterdimma bakom dig: bilarna där bak saktar in och fattar ingenting.',
    hooks: {
      tick(c, dt, s) {
        if (!s.racing) return;
        c.api.slowBehind(stackLin(14, 3, c.n), stackLin(0.45, 0.25, c.n), dt);
        if (every(c, 'gas', dt, 1.6)) c.api.sparkle(5);
        if (every(c, 'say', dt, 9)) c.api.say('surstromming', 'Dimma!');
      },
    },
  },
  {
    id: 'kaffekoppen',
    name: 'Kaffeslurparen',
    emoji: '☕',
    rarity: 'common',
    path: 'race',
    text: 'Efter varje varv slurpar du kaffe och drar på med extra fart. Hjärtat orkar.',
    hooks: {
      lap(c) {
        c.api.boost(stackLin(1.4, 0.7, c.n), 1.35);
        c.api.sparkle(8);
        c.api.say('kaffekoppen', 'Slurp! Zoom!');
      },
    },
  },
  {
    id: 'sladdgradde',
    name: 'Frityroljan',
    emoji: '🍟',
    rarity: 'common',
    path: 'race',
    maxStack: 3,
    text: 'Sladdar du, så glider du snabbare. Doftar pommes.',
    hooks: {
      tick(c, dt, s) {
        if (!s.drifting || s.air) return;
        c.api.kick(Math.min(6.5, 2.2 * c.n) * dt);
        if (every(c, 'say', dt, 6)) c.api.say('sladdgradde', 'Frittyyr!');
      },
    },
  },
  {
    id: 'raketryggsack',
    name: 'Burritobomben',
    emoji: '🌯',
    rarity: 'common',
    path: 'race',
    maxStack: 3,
    text: 'Lång raketstart när det blir grönt. Burritot går inte att ta tillbaka.',
    tune(t, n) {
      t.launch += 2.2 * n;
    },
    hooks: {
      boost(c, kind) {
        if (kind === 'start') c.api.say('raketryggsack', 'Burrito-start!');
      },
    },
  },
  {
    id: 'kolsyrad',
    name: 'Pruttboost',
    emoji: '💨',
    rarity: 'rare',
    path: 'fuffens',
    maxStack: 3,
    text: 'En extra nitro i varje lopp. Lämnar ett grönt moln som får bakomvarande att svaja.',
    tune(t, n) {
      t.charges += n;
    },
    hooks: {
      boost(c, kind) {
        if (kind !== 'nitro') return;
        c.api.fart(1.3);
        c.api.gas(c.n);
        c.api.say('kolsyrad', 'PRUTTBOOST!');
      },
    },
  },
  {
    id: 'glitter',
    name: 'Elvis-overallen',
    emoji: '✨',
    rarity: 'common',
    path: 'kaos',
    text: 'Glitter bakom bilen, och kronor för varje omkörning. Kungen hade varit stolt.',
    tune(t) {
      t.glitter = true;
    },
    hooks: {
      tick(c, _dt, s) {
        if (!s.racing) return;
        const last = c.st.place ?? s.place;
        c.st.place = s.place;
        if (s.place < last) {
          const kr = 4 * c.n;
          c.api.kronor(kr);
          c.api.sparkle(24);
          c.api.say('glitter', `Omkörning! +${kr} kr`);
        }
      },
    },
  },
  {
    id: 'alghorn',
    name: 'Stulna älghorn',
    emoji: '🦌',
    rarity: 'rare',
    path: 'ram',
    maxStack: 3,
    text: 'Bilar du krockar med flyger iväg. Älgen vill ha tillbaka dem.',
    tune(t, n) {
      t.shove += n;
    },
    hooks: {
      hit(c, kind, speed) {
        if (kind !== 'car' || speed < 0.6) return;
        c.api.shove(8, stackLin(7, 3, c.n));
        c.api.say('alghorn', 'Älgkrock!');
        c.api.party();
      },
    },
  },
  {
    id: 'raketkorv',
    name: 'Chilikorven',
    emoji: '🌶️',
    rarity: 'rare',
    path: 'race',
    maxStack: 3,
    text: 'Nitron räcker dubbelt så länge, men magen krånglar: du åker i sicksack.',
    tune(t, n) {
      t.nitroSeconds *= 1 + n;
      t.nitroPower *= 1 + 0.1 * n;
      t.wiggle = Math.min(0.3, 0.1 + 0.04 * n);
    },
    hooks: {
      boost(c, kind) {
        if (kind === 'nitro') c.api.say('raketkorv', 'Chilikorv! Magen!');
      },
    },
  },
  {
    id: 'spokbil',
    name: 'Spöklakanet',
    emoji: '👻',
    rarity: 'rare',
    path: 'fuffens',
    text: 'Efter varje boost kör du rakt igenom andra bilar. Under lakanet luktar det mögel.',
    hooks: {
      boost(c, kind) {
        if (kind === 'start') return;
        c.api.ghost(ghostSeconds(c.n));
        c.api.say('spokbil', 'Huuu! Spöktid!');
      },
    },
  },
  {
    id: 'kanon',
    name: 'Korvkanonen',
    emoji: '🌭',
    rarity: 'rare',
    path: 'ram',
    text: 'Boosten skjuter varmkorv som puttar bort bilarna framför. Med senap.',
    hooks: {
      boost(c, kind) {
        if (kind === 'start') return;
        c.api.cannon(c.n);
        c.api.say('kanon', 'KORVSALVA!');
      },
    },
  },
  {
    id: 'pannkakor',
    name: 'Pannkakssmällen',
    emoji: '🥞',
    rarity: 'rare',
    path: 'fuffens',
    text: 'Då och då landar en jättepannkaka på ledarens bil. Den blir platt. Sirap ingår.',
    hooks: {
      tick(c, dt, s) {
        if (!s.racing) return;
        c.st.t = (c.st.t ?? 0) + dt;
        c.st.next ??= 7;
        if ((c.st.t ?? 0) < (c.st.next ?? 7)) return;
        c.st.t = 0;
        c.st.next = (10 + Math.random() * 6) / stackLin(1, 0.5, c.n);
        c.api.squashLeader(stackLin(2, 0.5, c.n));
      },
    },
  },
  {
    id: 'discokula',
    name: 'Källarfest-discot',
    emoji: '🪩',
    rarity: 'rare',
    path: 'kaos',
    text: 'Disco på banan! Och 10 % mer kronor i mål. Pinsamt, men lönsamt.',
    tune(t) {
      t.disco = true;
    },
    hooks: {
      finish(c, r) {
        const kr = Math.round((r.kronor + r.coins) * 0.1 * c.n);
        if (kr > 0) c.api.say('discokula', `Disco-bonus +${kr} kr`);
        return { kronor: kr };
      },
    },
  },
  {
    id: 'tidsvrida',
    name: 'Loppis-tidsmaskinen',
    emoji: '⏳',
    rarity: 'legendary',
    path: 'race',
    text: 'Första varvets tid räknas bara hälften. Garantin gick ut 1987.',
    hooks: {
      finish(c, r) {
        const first = r.laps[0];
        if (!r.finished || first === undefined) return;
        const cut = Math.round(first * stackDim(0.5, c.n));
        c.api.say('tidsvrida', 'Tiden vreds tillbaka!');
        return { time: cut };
      },
    },
  },
  {
    id: 'dino',
    name: 'Dino-Dieseln',
    emoji: '🦖',
    rarity: 'legendary',
    path: 'ram',
    maxStack: 2,
    text: 'Bilen blir jättestor och puttar undan alla. RAWR. Och diesel.',
    tune(t, n) {
      t.size *= Math.min(2.2, 1 + 0.45 * n);
      t.shove += 0.5 * n;
      t.wheels *= 1.2;
    },
    hooks: {
      hit(c, kind, speed) {
        if (kind === 'car' && speed > 0.6) c.api.say('dino', 'RAAAWR!');
      },
    },
  },
  {
    id: 'trollkarl',
    name: 'Bajsraketen',
    emoji: '💩',
    rarity: 'legendary',
    path: 'kaos',
    text: 'Efter varje varv: PRRRT och ett grönt moln, plus något slumpat. Alla luktar.',
    hooks: {
      lap(c) {
        const k = Math.floor(Math.random() * 4);
        for (let i = 0; i < c.n; i++) {
          if (k === 0) c.api.boost(2, 1.4);
          else if (k === 1) c.api.ghost(4);
          else if (k === 2) c.api.kronor(25);
          else c.api.squashLeader(2.5);
        }
        c.api.fart(2);
        c.api.gas(1 + c.n);
        c.api.say('trollkarl', ['BAJSRAKET! Fart!', 'Osynlig! (men molnet syns)', 'Hittade kronor i raketen', 'Pannkaka: ledaren platt'][k]);
      },
    },
  },
  {
    id: 'bytesplats',
    name: 'Platsbytar-Pelle',
    emoji: '🔀',
    rarity: 'rare',
    path: 'kaos',
    text: 'Då och då byter du plats med bilen framför dig. Mitt i farten. Ingen frågar dig först.',
    hooks: {
      tick(c, dt, s) {
        if (!s.racing) return;
        c.st.t = (c.st.t ?? 0) + dt;
        c.st.next ??= 10 + Math.random() * 6;
        if ((c.st.t ?? 0) < (c.st.next ?? 12)) return;
        // no one close ahead: try again in a moment
        if (!c.api.swapAhead()) {
          c.st.t = (c.st.next ?? 12) - 1.5;
          return;
        }
        c.st.t = 0;
        c.st.next = (14 + Math.random() * 10) / stackLin(1, 0.5, c.n);
        c.api.say('bytesplats', 'BYTE!');
      },
    },
  },
  {
    id: 'konmagnet',
    name: 'Kon från ovan',
    emoji: '🐄',
    rarity: 'common',
    path: 'kaos',
    text: 'Då och då landar en ko (eller en höbal, det är samma sak) på vägen framför en rival.',
    hooks: {
      tick(c, dt, s) {
        if (!s.racing) return;
        c.st.t = (c.st.t ?? 0) + dt;
        c.st.next ??= 8 + Math.random() * 6;
        if ((c.st.t ?? 0) < (c.st.next ?? 10)) return;
        c.st.t = 0;
        c.st.next = (12 + Math.random() * 10) / stackLin(1, 0.5, c.n);
        if (c.api.dropAhead(Math.random() < 0.5 ? 'hay' : 'oil')) c.api.say('konmagnet', 'MUUU!');
      },
    },
  },
  {
    id: 'slumpvaxel',
    name: 'Slumpväxeln',
    emoji: '🎰',
    rarity: 'common',
    path: 'kaos',
    text: 'Växellådan smäller till då och då: oftast ett rejält kast framåt, ibland ett litet bakåt.',
    hooks: {
      tick(c, dt, s) {
        if (!s.racing || s.air) return;
        c.st.t = (c.st.t ?? 0) + dt;
        c.st.next ??= 6 + Math.random() * 6;
        if ((c.st.t ?? 0) < (c.st.next ?? 8)) return;
        c.st.t = 0;
        c.st.next = (9 + Math.random() * 7) / stackLin(1, 0.4, c.n);
        const good = Math.random() < 0.72;
        c.api.kick(good ? stackLin(9, 2, c.n) : -4);
        c.api.bounce(good ? 2 : 4);
        c.api.sparkle(6);
        c.api.say('slumpvaxel', good ? 'KLONK! Framåt!' : 'KLONK… bakåt.');
      },
    },
  },
  {
    id: 'tombola',
    name: 'Tombolan',
    emoji: '🎪',
    rarity: 'rare',
    path: 'kaos',
    text: 'Varje varv en lott: kronor, konfetti, spökläge eller ett jättekast. Ingen vet vilken.',
    hooks: {
      lap(c) {
        const k = Math.floor(Math.random() * 4);
        for (let i = 0; i < c.n; i++) {
          if (k === 0) c.api.kronor(35);
          else if (k === 1) {
            c.api.party();
            c.api.boost(1.6, 1.35);
          } else if (k === 2) c.api.ghost(4);
          else c.api.bounce(9);
        }
        c.api.say('tombola', ['Vinst! Kronor!', 'KONFETTI!', 'Spöklott!', 'Studslott!'][k]);
      },
    },
  },
  {
    id: 'rabattkupong',
    name: 'Fuskkupongen',
    emoji: '🎟️',
    rarity: 'common',
    path: 'girig',
    text: 'Allt i Mackens kiosk blir 15 % billigare. Fråga inte hur du fick den.',
    perk: { shopDiscount: 0.15 },
  },
  {
    id: 'pepparkaka',
    name: 'Begagnat hjärta',
    emoji: '❤️',
    rarity: 'rare',
    path: 'girig',
    text: 'Ett extra hjärta att ha, och du blir hel igen. Lite begagnat.',
    perk: { maxHearts: 1 },
  },
  {
    id: 'kristallkula',
    name: 'Spåkärringens kula',
    emoji: '🔮',
    rarity: 'rare',
    path: 'kaos',
    text: 'Du ser ett extra alternativ när du får välja. Hon tar 99 kr i minuten.',
    perk: { choices: 1 },
  },
  {
    id: 'guldagget',
    name: 'Lottovinsten',
    emoji: '🎰',
    rarity: 'legendary',
    path: 'girig',
    maxStack: 2,
    text: 'Alla lopp ger 50 % mer kronor. Du berättar inte för någon.',
    perk: { kronor: 0.5 },
  },
  // ---- phase 3: things for the new vehicles and courses ----
  {
    id: 'sidvagn',
    name: 'Svärmors sidvagn',
    emoji: '🛺',
    rarity: 'rare',
    path: 'race',
    maxStack: 3,
    text: 'Mc:n slutar ramla. Andra får en passagerare som gnäller men betalar.',
    tune(t, n, body) {
      if (body !== 'moto') return;
      t.sidecar = true;
      t.grip *= 1 + 0.07 * n;
    },
    hooks: {
      lap(c) {
        if (c.body === 'moto') c.api.say('sidvagn', 'Svärmor gnäller…');
        else {
          c.api.kronor(stackLin(8, 4, c.n));
          c.api.say('sidvagn', 'Passageraren gnäller och betalar!');
        }
        if (c.body === 'moto') c.api.kronor(stackLin(5, 3, c.n));
      },
    },
  },
  {
    id: 'turboflakt',
    name: 'Torktumlaren',
    emoji: '🌀',
    rarity: 'rare',
    path: 'ram',
    text: 'Traktorn får en jättefläkt: högre fart. Alla blåser undan bilarna framför.',
    tune(t, n, body) {
      if (body !== 'tractor') return;
      t.top *= 1 + 0.3 * n;
      t.power *= 1 + 0.12 * n;
    },
    hooks: {
      tick(c, dt, s) {
        if (!s.racing || s.speed < 8) return;
        if (every(c, 't', dt, 0.45)) {
          c.api.shove(stackLin(7, 2, c.n), (c.body === 'tractor' ? 2.4 : 1.4) * (0.8 + 0.3 * c.n));
          c.api.say('turboflakt', 'Fffwooosh! Bort med er!');
        }
      },
    },
  },
  {
    id: 'ringklocka',
    name: 'Terrorklockan',
    emoji: '🔔',
    rarity: 'rare',
    path: 'fuffens',
    text: 'Tutan ger kronor och puttar undan bilarna framför. Irriterande.',
    hooks: {
      honk(c, near) {
        const k = c.body === 'moped' ? 2 : 1;
        c.api.kronor(Math.round(stackLin(3, 2, c.n) * k));
        if (near > 0) c.api.shove(14, (c.body === 'moped' ? 5 : 3) * (0.8 + 0.3 * c.n));
        c.api.say('ringklocka', 'RING RING!');
        c.api.sparkle(10);
      },
    },
  },
  {
    id: 'karusell',
    name: 'Skrothandlarens lotteri',
    emoji: '🎠',
    rarity: 'legendary',
    path: 'kaos',
    text: 'Du byter fordon varje varv. Vad blir det nu? Ingen vet. Ingen har försäkring.',
    hooks: {
      lap(c) {
        c.api.swapVehicle();
        c.api.party();
        c.api.say('karusell', 'Hoppla! Nytt fordon!');
      },
      boost(c, kind) {
        if (kind === 'nitro' && c.n >= 2) c.api.swapVehicle();
      },
    },
  },
  {
    id: 'kastrull',
    name: 'Dödskalle-dekalen',
    emoji: '💀',
    rarity: 'common',
    path: 'ram',
    maxStack: 3,
    text: 'Alla skador blir mindre. Alla tror att du är farlig.',
    tune(t, n) {
      t.tough *= Math.pow(0.75, n);
    },
    hooks: {
      hit(c, kind, speed) {
        if (kind === 'land' || speed < 4) return;
        c.api.say('kastrull', 'Rock on!');
      },
    },
  },
  {
    id: 'manstovlar',
    name: 'Månkalsongerna',
    emoji: '🩲',
    rarity: 'common',
    path: 'stunt',
    text: 'Lite mindre tyngdkraft: längre hopp och mjukare landningar. Kalsongerna lyfter.',
    tune(t, n) {
      t.gravity *= Math.max(0.45, Math.pow(0.82, n));
    },
  },
  {
    id: 'godispasen',
    name: 'Lördagsgodiset',
    emoji: '🍬',
    rarity: 'common',
    path: 'girig',
    text: 'Då och då hittar du lösgodis att sälja. Dåligt för tänderna, bra för plånboken.',
    hooks: {
      tick(c, dt, s) {
        if (!s.racing) return;
        if (every(c, 't', dt, 14 / stackLin(1, 0.6, c.n))) {
          c.api.kronor(stackLin(6, 3, c.n));
          c.api.sparkle(14);
          c.api.say('godispasen', 'Godis! Slurp!');
        }
      },
    },
  },
  {
    id: 'myntturbo',
    name: 'Pantmotorn',
    emoji: '♻️',
    rarity: 'rare',
    path: 'girig',
    text: 'Var sjätte mynt du tar ger en kort fartboost. Burkar är bensin.',
    hooks: {
      pickup(c, kind) {
        if (kind !== 'coin') return;
        c.st.n = (c.st.n ?? 0) + 1;
        if (c.st.n % Math.max(2, 7 - c.n) === 0) {
          c.api.boost(stackLin(1.1, 0.5, c.n), 1.3);
          c.api.say('myntturbo', 'Pant-turbo!');
        }
      },
    },
  },
  {
    id: 'guldpokal',
    name: 'Pappas pokal',
    emoji: '🏆',
    rarity: 'common',
    path: 'girig',
    text: 'Kommer du etta eller tvåa i mål får du en bonus. Pappa är stolt, typ.',
    hooks: {
      finish(c, r) {
        if (!r.finished || r.place > 2) return;
        const kr = (r.place === 1 ? 45 : 22) * c.n;
        c.api.say('guldpokal', `Pokalbonus +${kr} kr`);
        return { kronor: kr };
      },
    },
  },
  {
    id: 'dubbdack',
    name: 'Bastu på taket',
    emoji: '🧖',
    rarity: 'common',
    path: 'race',
    text: 'Mer grepp, mest på halt och löst underlag. Isen smälter av värmen.',
    tune(t, n) {
      t.grip *= 1 + 0.05 * n;
      t.offroad *= 1 + 0.1 * n;
    },
  },
  {
    id: 'krockkudde',
    name: 'Uppblåsbara flamingon',
    emoji: '🦩',
    rarity: 'rare',
    path: 'ram',
    text: 'Efter en rejäl smäll blir du genomskinlig en stund och slipper fler. Pfff!',
    hooks: {
      tick(c, dt) {
        c.st.cd = Math.max(0, (c.st.cd ?? 0) - dt);
      },
      hit(c, kind, speed) {
        if (kind === 'land' || speed < 3 || (c.st.cd ?? 0) > 0) return;
        c.st.cd = 2;
        c.api.ghost(stackLin(1.6, 0.8, c.n));
        c.api.say('krockkudde', 'Pfff! Flamingo!');
      },
    },
  },
  {
    id: 'angvissla',
    name: 'Dundertutan',
    emoji: '🚂',
    rarity: 'rare',
    path: 'fuffens',
    text: 'Tuta (H) så flyger bilarna framför iväg! Den tutar själv när någon är nära.',
    hooks: {
      honk(c, near) {
        c.api.shove(13, stackLin(6, 3, c.n));
        c.api.sparkle(12);
        c.api.say('angvissla', near > 0 ? 'TUUUT! Flytta på er!' : 'Tut-tuuut!');
      },
    },
  },
  {
    id: 'lavalampan',
    name: 'Lavalampan från källaren',
    emoji: '🌋',
    rarity: 'common',
    path: 'kaos',
    text: 'Varje turbosladd ger lite kronor. Det bubblar. Doftar damm.',
    hooks: {
      drift(c, _seconds, tier) {
        if (tier < 1) return;
        const kr = stackLin(4, 2, c.n) * tier;
        c.api.kronor(kr);
        c.api.say('lavalampan', 'Blopp! Lava!');
      },
    },
  },
  {
    id: 'rymdhjalmen',
    name: 'Akvariehjälmen',
    emoji: '👨‍🚀',
    rarity: 'rare',
    path: 'stunt',
    text: 'Du svävar lite och mynt dras till dig. Litet steg, stor plånbok.',
    tune(t, n) {
      t.gravity *= Math.max(0.5, Math.pow(0.88, n));
      t.magnet = Math.max(t.magnet, stackLin(9, 4, n));
    },
  },
  {
    id: 'planbok',
    name: 'Raggarplånboken',
    emoji: '👛',
    rarity: 'rare',
    path: 'girig',
    maxStack: 3,
    text: 'Alla lopp ger 25 % mer kronor. Kedjan sitter fast i byxorna.',
    perk: { kronor: 0.25 },
  },
  {
    id: 'kuponghafte',
    name: 'Pensionärsrabatten',
    emoji: '🎫',
    rarity: 'rare',
    path: 'girig',
    text: 'Allt i Mackens kiosk blir 25 % billigare. Du ser så gammal ut.',
    perk: { shopDiscount: 0.25 },
  },
  {
    id: 'hjartekudde',
    name: 'Hjärtstartaren',
    emoji: '⚡',
    rarity: 'rare',
    path: 'girig',
    text: 'Ett extra hjärta. Ibland startar den om dig.',
    perk: { maxHearts: 1 },
  },
  // ---- the chaos wave: ability tricks, weather, coin flips and a few for the derby and the ramps ----
  {
    id: 'roulett',
    name: 'Förmågerouletten',
    emoji: '🎰',
    rarity: 'legendary',
    path: 'kaos',
    maxStack: 1,
    text: 'Din förmåga slumpas om vid varje varv. Ingen frågar dig först.',
    hooks: {
      lap(c) {
        c.api.rerollAbility();
        c.api.say('roulett', 'NY FÖRMÅGA!');
      },
    },
  },
  {
    id: 'adrenalin',
    name: 'Adrenalinsprutan',
    emoji: '💉',
    rarity: 'rare',
    path: 'ram',
    maxStack: 3,
    text: 'Varje takedown kortar din förmågas nedkylning med 3 s. Läkaren tittar bort.',
    hooks: {
      takedown(c) {
        c.api.abilityCooldown(stackLin(3, 1.5, c.n));
        c.api.say('adrenalin', 'Laddat!');
      },
    },
  },
  {
    id: 'kopiatorn',
    name: 'Kopiatorn',
    emoji: '📠',
    rarity: 'rare',
    path: 'kaos',
    maxStack: 1,
    text: 'Använder du din förmåga använder du ledarens också. Det är en hyllning.',
    hooks: {
      ability(c) {
        if (c.api.copyLeaderAbility()) c.api.say('kopiatorn', 'KOPIERAT!');
      },
    },
  },
  {
    id: 'nitrolotten',
    name: 'Nitrolotten',
    emoji: '🎟️',
    rarity: 'rare',
    path: 'kaos',
    maxStack: 2,
    text: 'Kortare nitro, men varje tändning drar en lott: pannkaka, spöke eller platsbyte.',
    tune(t, n) {
      t.nitroSeconds *= Math.pow(0.78, n);
    },
    hooks: {
      boost(c, kind) {
        if (kind === 'nitro') chaosEffect(c, 'nitrolotten');
      },
    },
  },
  {
    id: 'regnmakaren',
    name: 'Regnmakaren',
    emoji: '🌧️',
    rarity: 'rare',
    path: 'fuffens',
    maxStack: 1,
    text: 'Det regnar i varje lopp. Du har stövlar och mer grepp, de andra har hopp.',
    sky: { weather: 'rain' },
    tune(t) {
      t.grip *= 1.1;
      t.offroad *= 1.15;
      t.mudproof = true;
    },
  },
  {
    id: 'solstralen',
    name: 'Solstrålen',
    emoji: '☀️',
    rarity: 'common',
    path: 'girig',
    maxStack: 1,
    text: 'Aldrig regn, alltid dag, och 8 % extra kronor. Solen vill bli omnämnd.',
    sky: { weather: 'clear', time: 'day' },
    perk: { kronor: 0.08 },
  },
  {
    id: 'nattskift',
    name: 'Nattskiftet',
    emoji: '🌙',
    rarity: 'rare',
    path: 'kaos',
    maxStack: 1,
    text: 'Alla lopp körs i natten. Nattmynt är värda 25 % mer. Ugglorna är avundsjuka.',
    sky: { time: 'night' },
    tune(t) {
      t.coinValue *= 1.25;
    },
  },
  {
    id: 'askmoln',
    name: 'Åskmolnet',
    emoji: '⛈️',
    rarity: 'legendary',
    path: 'fuffens',
    maxStack: 1,
    text: 'Regn i varje lopp, och efter varje varv slår blixten ner i ledaren.',
    sky: { weather: 'rain' },
    hooks: {
      lap(c) {
        c.api.squashLeader(2.5);
        c.api.say('askmoln', 'BLIXTEN!');
      },
    },
  },
  {
    id: 'verktygslada',
    name: 'Verktygslådan',
    emoji: '🧰',
    rarity: 'legendary',
    path: 'kaos',
    maxStack: 2,
    text: 'Varje ny akt börjar med en slumpad uppgradering på bilen. Ingen minns vem.',
    // acts when a new act begins (run/flow.ts `toolboxGift`), not in the race
    perk: {},
  },
  {
    id: 'dubbeltelleringet',
    name: 'Dubbelt eller inget',
    emoji: '🪙',
    rarity: 'rare',
    path: 'girig',
    maxStack: 3,
    text: 'I mål singlas en slant: dubbla loppets kronor eller inga alls.',
    hooks: {
      finish(c, r) {
        const pot = r.kronor + r.coins;
        if (pot <= 0) return;
        const win = Math.random() < 0.5 + 0.05 * (c.n - 1);
        c.api.say('dubbeltelleringet', win ? `KRONA! +${pot} kr` : 'KLAVE! Inget alls');
        return { kronor: win ? pot : -pot };
      },
    },
  },
  {
    id: 'vrakplockare',
    name: 'Vrakplockaren',
    emoji: '🧲',
    rarity: 'common',
    path: 'ram',
    maxStack: 3,
    text: 'Varje vrak du lämnar efter dig ger 12 kr och lite nitro. Skrothandlaren betalar bra.',
    hooks: {
      takedown(c) {
        c.api.kronor(Math.round(stackLin(12, 6, c.n)));
        c.api.nitro(0.25);
        c.api.say('vrakplockare', 'Skrotpris!');
      },
    },
  },
  {
    id: 'hamndsprangare',
    name: 'Hämndsprängaren',
    emoji: '💣',
    rarity: 'rare',
    path: 'ram',
    maxStack: 2,
    text: 'Blir du vrakad smäller du i en stötvåg som kastar undan alla. Sista ordet är ditt.',
    hooks: {
      wreck(c) {
        c.api.shock(stackLin(14, 3, c.n), 20, 22);
        c.api.say('hamndsprangare', 'BOOM!');
      },
    },
  },
  {
    id: 'rampgalning',
    name: 'Rampgalningen',
    emoji: '🛝',
    rarity: 'rare',
    path: 'stunt',
    maxStack: 3,
    text: 'Efter en lång flygning och landning får du kronor och en liten rusning.',
    tune(t, n) {
      t.stunt *= 1 + 0.1 * n;
    },
    hooks: {
      tick: (c, dt) => {
        c.st.cd = Math.max(0, (c.st.cd ?? 0) - dt);
      },
      trick(c, kind, v) {
        if (kind !== 'air' || v < 0.9 || (c.st.cd ?? 0) > 0) return;
        c.st.cd = 1.5;
        c.api.kronor(10 + 6 * c.n);
        c.api.boost(0.7, 1.2);
        c.api.say('rampgalning', 'Perfekt landning!');
      },
    },
  },
  {
    id: 'kraftdryck',
    name: 'Kraftdrycken',
    emoji: '🥤',
    rarity: 'common',
    path: 'race',
    maxStack: 3,
    text: 'Varje förmåga du använder fyller en bit nitro. Mest socker och självförtroende.',
    hooks: {
      ability(c) {
        c.api.nitro(stackLin(0.3, 0.15, c.n));
        c.api.say('kraftdryck', 'KRAFT!');
      },
    },
  },
  {
    id: 'efterklang',
    name: 'Efterklangen',
    emoji: '🔁',
    rarity: 'legendary',
    path: 'race',
    maxStack: 1,
    text: 'Din förmåga ekar: den används en gång till strax efter. Grannarna klagar.',
    hooks: {
      ability(c) {
        c.st.echo = 1.4;
      },
      tick(c, dt) {
        if ((c.st.echo ?? 0) <= 0) return;
        c.st.echo = (c.st.echo ?? 0) - dt;
        if ((c.st.echo ?? 0) <= 0) {
          c.api.repeatAbility();
          c.api.say('efterklang', 'ETT TILL!');
        }
      },
    },
  },
  {
    id: 'termos',
    name: 'Termosen',
    emoji: '☕',
    rarity: 'common',
    path: 'race',
    maxStack: 3,
    text: 'Din förmåga laddar 12 % fortare. Kaffet är kallt men viljan är het.',
    tune(t, n) {
      t.abilCd *= Math.pow(0.88, n);
    },
  },
  {
    id: 'arenaklocka',
    name: 'Arenaklockan',
    emoji: '🔔',
    rarity: 'rare',
    path: 'ram',
    maxStack: 3,
    text: 'I Blodbad och Rivningsderby lagar du dig en bit var åttonde sekund. Ding!',
    hooks: {
      tick(c, dt, s) {
        if (!s.carnage || !s.racing || !every(c, 'bell', dt, 8)) return;
        c.api.heal(0.025 * c.n);
        c.api.say('arenaklocka', 'DING!');
      },
    },
  },
  {
    id: 'slumpgenerator',
    name: 'Slumpgeneratorn',
    emoji: '🎲',
    rarity: 'legendary',
    path: 'kaos',
    maxStack: 3,
    text: 'Var 22:a sekund händer något slumpat: rusning, pannkaka, platsbyte eller spöke.',
    hooks: {
      tick(c, dt, s) {
        if (!s.racing || !every(c, 'dice', dt, 22 / (1 + 0.35 * (c.n - 1)))) return;
        chaosEffect(c, 'slumpgenerator');
      },
    },
  },
  {
    id: 'lyckohjul',
    name: 'Lyckohjulet',
    emoji: '🎡',
    rarity: 'rare',
    path: 'kaos',
    maxStack: 2,
    text: 'Var tionde mynt snurrar hjulet och en slumpad belöning dimper ner.',
    hooks: {
      pickup(c, kind) {
        if (kind !== 'coin') return;
        c.st.coins = (c.st.coins ?? 0) + 1;
        if (c.st.coins < 10 - 2 * (c.n - 1)) return;
        c.st.coins = 0;
        chaosEffect(c, 'lyckohjul', (['boost', 'nitro', 'coins', 'ghost', 'hop'] as const)[Math.floor(Math.random() * 5)]);
      },
    },
  },
  {
    id: 'reservdunk',
    name: 'Reservdunken',
    emoji: '⛽',
    rarity: 'common',
    path: 'race',
    maxStack: 1,
    text: 'Din förmåga får en extra rusning på köpet. Doften av bensin sitter kvar i håret.',
    tune(t) {
      if (!t.plus.includes('boost')) t.plus.push('boost');
    },
  },
];

const BY_ID = new Map(TRINKETS.map((t) => [t.id, t] as const));
export const trinketById = (id: string): TrinketDef | undefined => BY_ID.get(id);
export const isTrinket = (id: unknown): id is string => typeof id === 'string' && BY_ID.has(id);

/** A trinket the player holds, with how many. */
export interface Owned {
  id: string;
  n: number;
}

/** Sums the perks of everything owned. */
export function perksOf(owned: readonly Owned[]): Required<Perk> {
  const out = { shopDiscount: 0, maxHearts: 0, choices: 0, kronor: 0 };
  for (const o of owned) {
    const p = trinketById(o.id)?.perk;
    if (!p) continue;
    const n = Math.min(stackCap(trinketById(o.id)), o.n);
    out.shopDiscount += (p.shopDiscount ?? 0) * n;
    out.maxHearts += (p.maxHearts ?? 0) * n;
    out.choices += (p.choices ?? 0) * n;
    out.kronor += (p.kronor ?? 0) * n;
  }
  out.shopDiscount = Math.min(0.6, out.shopDiscount);
  // the kronor perks stop at double pay, with less and less from each one above +60 %
  out.kronor = softCap(out.kronor, 0.6, 1.0);
  return out;
}

/** The raw pieces of what the player owns: uncapped numbers, the HUD items and the hooks. The run builds on these (upgrades and combos add their own). */
export function collectParts(owned: readonly Owned[], body: CarBody = 'hatch'): { tune: ModTune; items: ModItem[]; entries: ModEntry[] } {
  const tune = neutralTune();
  const items: ModItem[] = [];
  const entries: ModEntry[] = [];
  for (const o of owned) {
    const def = trinketById(o.id);
    if (!def || o.n < 1) continue;
    const n = Math.min(stackCap(def), Math.floor(o.n));
    def.tune?.(tune, n, body);
    items.push({ id: def.id, name: def.name, emoji: def.emoji, n });
    if (def.hooks) entries.push({ id: def.id, hooks: def.hooks, ctx: { api: null as never, tune, body, n, st: {} } });
  }
  return { tune, items, entries };
}

/** Turns what the player owns into what the race needs. Unknown ids are skipped. */
export function buildMods(owned: readonly Owned[], body: CarBody = 'hatch'): RaceMods {
  const { tune, items, entries } = collectParts(owned, body);
  return { items, tune: capTune(tune), bus: new ModBus(entries) };
}

/** What a trinket costs in the shop (before discounts). */
export const TRINKET_PRICE: Record<Rarity, number> = { common: 80, rare: 150, legendary: 260 };

export const RARITY_NAMES: Record<Rarity, string> = { common: 'Skräp', rare: 'Grym', legendary: 'Legendarisk' };
