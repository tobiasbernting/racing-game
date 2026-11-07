// The trinkets: small, loud rule changes the player collects during a run. A trinket is data (name, icon,
// rarity, one Swedish line) plus up to three things the race understands (see rally/mods.ts):
//   tune   changes numbers when the race starts,
//   hooks  reacts to boosts, drifts, bumps, laps, pickups and the finish,
//   perk   changes the run itself (shop prices, hearts, reward choices, kronor).
// Owning the same trinket twice stacks it: every effect reads `n`. To add a trinket, add one entry here.
import { neutralTune, ModBus, type HookCtx, type ModEntry, type ModHooks, type ModItem, type ModTune, type RaceMods } from '../rally/mods.ts';

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

export interface TrinketDef {
  id: string;
  name: string;
  emoji: string;
  rarity: Rarity;
  /** One short Swedish line. */
  text: string;
  /** Trophies needed before it can show up in shops and rewards. */
  unlock: number;
  tune?(t: ModTune, n: number): void;
  hooks?: ModHooks;
  perk?: Perk;
}

/** Highest stack count that still adds something. */
export const MAX_STACK = 5;

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

export const TRINKETS: TrinketDef[] = [
  {
    id: 'gummianka',
    name: 'Gummianka på huven',
    emoji: '🦆',
    rarity: 'common',
    text: 'Varje stöt får dig att studsa högre. Kvack!',
    unlock: 0,
    hooks: {
      tick(c, dt) {
        c.st.cd = Math.max(0, (c.st.cd ?? 0) - dt);
      },
      hit(c, kind, speed) {
        if (kind === 'land' ? speed < 6 : speed < 1.5) return;
        if ((c.st.cd ?? 0) > 0) return;
        c.st.cd = 0.5;
        c.api.bounce(Math.min(10, 3.5 + speed * 0.3) * (0.75 + 0.3 * c.n) * (kind === 'land' ? 0.7 : 1));
        c.api.quack();
        c.api.say('gummianka', 'Kvack!');
      },
    },
  },
  {
    id: 'jattehjul',
    name: 'Jättehjul',
    emoji: '🛞',
    rarity: 'common',
    text: 'Hjulen blir dubbelt så stora och bilen klarar gräs bättre.',
    unlock: 0,
    tune(t, n) {
      t.wheels *= Math.min(3, 1 + n);
      t.offroad *= 1 + 0.12 * n;
      t.size *= 1 + 0.04 * n;
    },
  },
  {
    id: 'magnetko',
    name: 'Magnet-ko',
    emoji: '🐮',
    rarity: 'common',
    text: 'Mynt flyger till dig från andra sidan banan.',
    unlock: 0,
    tune(t, n) {
      t.magnet = Math.max(t.magnet, stackLin(16, 8, n));
    },
    hooks: {
      pickup(c, kind) {
        if (kind !== 'coin') return;
        c.st.n = (c.st.n ?? 0) + 1;
        if (c.st.n % 8 === 0) c.api.say('magnetko', 'Muuu! Mynt!');
      },
    },
  },
  {
    id: 'studsmatta',
    name: 'Studsmatta-däck',
    emoji: '🤸',
    rarity: 'common',
    text: 'Smäller du i ett staket studsar du framåt!',
    unlock: 0,
    hooks: {
      hit(c, kind, speed) {
        if (kind !== 'wall' || speed < 1.5) return;
        c.api.kick(stackLin(6, 3, c.n));
        c.api.bounce(2.5);
        c.api.boing();
        c.api.say('studsmatta', 'Boing! Framåt!');
      },
    },
  },
  {
    id: 'bananskal',
    name: 'Bananskal-släp',
    emoji: '🍌',
    rarity: 'common',
    text: 'Du tappar bananskal bakom dig. De andra snurrar!',
    unlock: 0,
    hooks: {
      tick(c, dt, s) {
        if (!s.racing || s.speed < 8) return;
        if (every(c, 't', dt, 6 / stackLin(1, 0.7, c.n))) {
          c.api.banana();
          c.api.say('bananskal', 'Bananskal!');
        }
      },
    },
  },
  {
    id: 'tvattbjorn',
    name: 'Tvättbjörns-turbo',
    emoji: '🦝',
    rarity: 'common',
    text: 'Sladdar du fylls turbon tre gånger snabbare.',
    unlock: 1,
    tune(t, n) {
      t.driftRate *= 1 + 2 * n;
    },
    hooks: {
      drift(c, _seconds, tier) {
        if (tier > 0) c.api.say('tvattbjorn', 'Tvätt-turbo!');
      },
    },
  },
  {
    id: 'hoppfjadrar',
    name: 'Hoppfjädrar',
    emoji: '🦘',
    rarity: 'common',
    text: 'Tryck handbromsen när du kör rakt fram: HOPP!',
    unlock: 0,
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
        c.api.say('hoppfjadrar', 'Hopp!');
      },
    },
  },
  {
    id: 'piratguld',
    name: 'Piratguld',
    emoji: '🪙',
    rarity: 'common',
    text: 'Varje mynt på banan är värt mer.',
    unlock: 0,
    tune(t, n) {
      t.coinValue *= 1 + 0.75 * n;
    },
  },
  {
    id: 'sparbossan',
    name: 'Sparbössan',
    emoji: '🐷',
    rarity: 'common',
    text: 'Du får kronor för varje varv du kör.',
    unlock: 0,
    hooks: {
      lap(c) {
        c.api.kronor(stackLin(10, 6, c.n));
        c.api.say('sparbossan', 'Pling! Sparat!');
      },
    },
  },
  {
    id: 'kanelbullar',
    name: 'Kanelbullemotor',
    emoji: '🥮',
    rarity: 'common',
    text: 'Motorn går på kanelbullar: mer kraft.',
    unlock: 0,
    tune(t, n) {
      t.power *= 1 + 0.08 * n;
    },
  },
  {
    id: 'gummistovlar',
    name: 'Gummistövlar',
    emoji: '🥾',
    rarity: 'common',
    text: 'Lera och gräs? Ingen fara!',
    unlock: 0,
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
    name: 'Måndamm i tanken',
    emoji: '🌚',
    rarity: 'rare',
    text: 'Månens tyngdkraft: du svävar länge!',
    unlock: 2,
    tune(t, n) {
      t.gravity *= Math.max(0.28, Math.pow(0.7, n));
    },
  },
  {
    id: 'surstromming',
    name: 'Surströmming',
    emoji: '🐟',
    rarity: 'common',
    text: 'Bilarna bakom dig blir yra av lukten och saktar in.',
    unlock: 1,
    hooks: {
      tick(c, dt, s) {
        if (!s.racing) return;
        c.api.slowBehind(stackLin(14, 3, c.n), stackLin(0.45, 0.25, c.n), dt);
        if (every(c, 'say', dt, 9)) c.api.say('surstromming', 'Pyyh! Vilken lukt!');
      },
    },
  },
  {
    id: 'kaffekoppen',
    name: 'Kaffekoppen',
    emoji: '☕',
    rarity: 'common',
    text: 'Efter varje varv drar du på med extra fart.',
    unlock: 0,
    hooks: {
      lap(c) {
        c.api.boost(stackLin(1.4, 0.7, c.n), 1.35);
        c.api.say('kaffekoppen', 'Koffein-boost!');
      },
    },
  },
  {
    id: 'sladdgradde',
    name: 'Sladdgrädde',
    emoji: '🍦',
    rarity: 'common',
    text: 'Sladdar du, så glider du snabbare.',
    unlock: 2,
    hooks: {
      tick(c, dt, s) {
        if (!s.drifting || s.air) return;
        c.api.kick(4 * c.n * dt);
        if (every(c, 'say', dt, 6)) c.api.say('sladdgradde', 'Slick-slack!');
      },
    },
  },
  {
    id: 'raketryggsack',
    name: 'Raketryggsäck',
    emoji: '🚀',
    rarity: 'common',
    text: 'Du får en lång raketstart när det blir grönt.',
    unlock: 1,
    tune(t, n) {
      t.launch += 2.2 * n;
    },
    hooks: {
      boost(c, kind) {
        if (kind === 'start') c.api.say('raketryggsack', 'Raketstart!');
      },
    },
  },
  {
    id: 'kolsyrad',
    name: 'Kolsyrad nitro',
    emoji: '🍾',
    rarity: 'common',
    text: 'En extra nitro i varje lopp. Fsss!',
    unlock: 1,
    tune(t, n) {
      t.charges += n;
    },
    hooks: {
      boost(c, kind) {
        if (kind === 'nitro') c.api.say('kolsyrad', 'Fsssss!');
      },
    },
  },
  {
    id: 'glitter',
    name: 'Glitterdräkt',
    emoji: '✨',
    rarity: 'common',
    text: 'Glitter bakom bilen, och kronor för varje omkörning.',
    unlock: 2,
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
    name: 'Älghorn',
    emoji: '🦌',
    rarity: 'rare',
    text: 'Bilar du krockar med flyger iväg.',
    unlock: 3,
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
    name: 'Raketkorv',
    emoji: '🌭',
    rarity: 'rare',
    text: 'Nitron räcker dubbelt så länge, men du åker i sicksack.',
    unlock: 2,
    tune(t, n) {
      t.nitroSeconds *= 1 + n;
      t.nitroPower *= 1 + 0.1 * n;
      t.wiggle = Math.min(0.3, 0.1 + 0.04 * n);
    },
    hooks: {
      boost(c, kind) {
        if (kind === 'nitro') c.api.say('raketkorv', 'Korv-nitro! Hoppla!');
      },
    },
  },
  {
    id: 'spokbil',
    name: 'Spökbil',
    emoji: '👻',
    rarity: 'rare',
    text: 'Efter varje boost kör du rakt igenom andra bilar.',
    unlock: 3,
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
    name: 'Kanon-avgasrör',
    emoji: '🎉',
    rarity: 'rare',
    text: 'Boosten skjuter konfetti som puffar bort bilarna framför.',
    unlock: 3,
    hooks: {
      boost(c, kind) {
        if (kind === 'start') return;
        c.api.cannon(c.n);
        c.api.say('kanon', 'PANG! Konfetti!');
      },
    },
  },
  {
    id: 'pannkakor',
    name: 'Pannkaksvägen',
    emoji: '🥞',
    rarity: 'rare',
    text: 'Då och då blir ledarens bil platt som en pannkaka.',
    unlock: 4,
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
    name: 'Discokula',
    emoji: '🪩',
    rarity: 'rare',
    text: 'Disco på banan! Och 10 % mer kronor i mål.',
    unlock: 5,
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
    name: 'Tidsvrida',
    emoji: '⏳',
    rarity: 'legendary',
    text: 'Första varvets tid räknas bara hälften.',
    unlock: 8,
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
    name: 'Dinosauriebilen',
    emoji: '🦖',
    rarity: 'legendary',
    text: 'Bilen blir jättestor och skuffar undan alla.',
    unlock: 6,
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
    name: 'Trollkarlshatten',
    emoji: '🎩',
    rarity: 'legendary',
    text: 'Efter varje varv händer något magiskt. Man vet aldrig vad!',
    unlock: 6,
    hooks: {
      lap(c) {
        const k = Math.floor(Math.random() * 4);
        for (let i = 0; i < c.n; i++) {
          if (k === 0) c.api.boost(2, 1.4);
          else if (k === 1) c.api.ghost(4);
          else if (k === 2) c.api.kronor(25);
          else c.api.squashLeader(2.5);
        }
        c.api.party();
        c.api.say('trollkarl', ['Abrakadabra: fart!', 'Hokus pokus: spöke!', 'Simsalabim: kronor!', 'Pang: pannkaka!'][k]);
      },
    },
  },
  {
    id: 'rabattkupong',
    name: 'Rabattkupong',
    emoji: '🎟️',
    rarity: 'common',
    text: 'Allt i Mackens kiosk blir 15 % billigare.',
    unlock: 0,
    perk: { shopDiscount: 0.15 },
  },
  {
    id: 'pepparkaka',
    name: 'Pepparkakshjärta',
    emoji: '🍪',
    rarity: 'rare',
    text: 'Ett extra hjärta att ha, och du blir hel igen.',
    unlock: 4,
    perk: { maxHearts: 1 },
  },
  {
    id: 'kristallkula',
    name: 'Kristallkulan',
    emoji: '🔮',
    rarity: 'rare',
    text: 'Du ser ett extra alternativ när du får välja.',
    unlock: 4,
    perk: { choices: 1 },
  },
  {
    id: 'guldagget',
    name: 'Guldägget',
    emoji: '🥚',
    rarity: 'legendary',
    text: 'Alla lopp ger 50 % mer kronor.',
    unlock: 9,
    perk: { kronor: 0.5 },
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
    const n = Math.min(MAX_STACK, o.n);
    out.shopDiscount += (p.shopDiscount ?? 0) * n;
    out.maxHearts += (p.maxHearts ?? 0) * n;
    out.choices += (p.choices ?? 0) * n;
    out.kronor += (p.kronor ?? 0) * n;
  }
  out.shopDiscount = Math.min(0.6, out.shopDiscount);
  return out;
}

/** Turns what the player owns into what the race needs. Unknown ids are skipped. */
export function buildMods(owned: readonly Owned[]): RaceMods {
  const tune = neutralTune();
  const items: ModItem[] = [];
  const entries: ModEntry[] = [];
  for (const o of owned) {
    const def = trinketById(o.id);
    if (!def || o.n < 1) continue;
    const n = Math.min(MAX_STACK, Math.floor(o.n));
    def.tune?.(tune, n);
    items.push({ id: def.id, name: def.name, emoji: def.emoji, n });
    if (def.hooks) entries.push({ id: def.id, hooks: def.hooks, ctx: { api: null as never, n, st: {} } });
  }
  return { items, tune, bus: new ModBus(entries) };
}

/** What a trinket costs in the shop (before discounts). */
export const TRINKET_PRICE: Record<Rarity, number> = { common: 70, rare: 130, legendary: 230 };

export const RARITY_NAMES: Record<Rarity, string> = { common: 'Vanlig', rare: 'Ovanlig', legendary: 'Legendarisk' };
