// The car that grows: the upgrade trees. Two main trees, 🛡️ Ram and 🏎️ Race, and three side paths that fit either,
// 🦨 Fuffens, 🤸 Stunt and 🤑 Girig, plus two upgrades of the vehicle's own ability. Every tree is a handful of *lines* with
// two or three tiers each (a tier is a node you take one at a time) and a capstone. A line is data (name, texts) plus up to
// three things the race understands, exactly like a trinket: `tune` changes numbers when the race starts, `hooks` react
// to what happens, `perk` changes the run (interest, discounts, an extra card). Owning the right pair of nodes (or a
// node and a trinket) switches on a named combo. Everything here is pure: no DOM, no clock, no dice.
import type { CarBody } from '../shared/rally.ts';
import { CAR_BODIES } from '../shared/rally.ts';
import { kitOf } from '../shared/abilities.ts';
import { capTune, ModBus, type HookCtx, type ModEntry, type ModHooks, type ModItem, type ModTune, type RaceMods } from '../rally/mods.ts';
import { collectParts, perksOf, trinketById, type Owned, type Perk, type TrinketPath } from './trinkets.ts';

export const TREES = ['ram', 'race', 'fuffens', 'stunt', 'girig'] as const;
export type TreeId = (typeof TREES)[number];
/** The trees plus the vehicle's own two ability upgrades. */
export type TreeKey = TreeId | 'car';

export interface TreeInfo {
  id: TreeId;
  name: string;
  emoji: string;
  /** Main trees are the two directions; the rest are side paths. */
  main: boolean;
  text: string;
}

export const TREE_INFO: Record<TreeId, TreeInfo> = {
  ram: { id: 'ram', name: 'Ram', emoji: '🛡️', main: true, text: 'Pansar, tyngd, spikar och smällar som får bilar att flyga.' },
  race: { id: 'race', name: 'Race', emoji: '🏎️', main: true, text: 'Motor, grepp, sladd, nitro och fart.' },
  fuffens: { id: 'fuffens', name: 'Fuffens', emoji: '🦨', main: false, text: 'Fula knep: olja, minor, falska mynt och rök.' },
  stunt: { id: 'stunt', name: 'Stunt', emoji: '🤸', main: false, text: 'Luft, volter och nära ögat fyller nitron och plånboken.' },
  girig: { id: 'girig', name: 'Girig', emoji: '🤑', main: false, text: 'Ränta, dusör, försäkring och rabatter.' },
};

export const isTree = (s: unknown): s is TreeId => typeof s === 'string' && (TREES as readonly string[]).includes(s);

/** Extra things the run itself gets from upgrades. */
export interface UpPerk extends Perk {
  /** Share of the kronor in the purse that comes back after every node (capped, see INTEREST_MAX). */
  interest?: number;
}

export const INTEREST_MAX = 60;
/** A capstone opens when the tree has this many nodes taken. */
export const CAPSTONE_NEEDS = 4;

interface LineTier {
  name: string;
  text: string;
}

export interface LineDef {
  /** "ram.plates" */
  id: string;
  tree: TreeKey;
  name: string;
  emoji: string;
  /** How often it turns up in an offer, next to the others (1 = normal). */
  weight: number;
  tiers: LineTier[];
  /** The capstone of its tree: opens once the tree has CAPSTONE_NEEDS nodes. */
  cap?: boolean;
  /** Only for this vehicle (its ability upgrades). */
  body?: CarBody;
  tune?(t: ModTune, tier: number, body: CarBody): void;
  hooks?: ModHooks;
  perk?(tier: number): UpPerk;
}

/** One node: a tier of a line. Its id is the line id and the tier, "ram.plates2". */
export interface UpgradeDef {
  id: string;
  line: string;
  tree: TreeKey;
  tier: number;
  name: string;
  emoji: string;
  text: string;
  cap: boolean;
  body?: CarBody;
}

const cool = (c: HookCtx, key: string, dt: number): void => {
  c.st[key] = Math.max(0, (c.st[key] ?? 0) - dt);
};
const ready = (c: HookCtx, key: string, then: number): boolean => {
  if ((c.st[key] ?? 0) > 0) return false;
  c.st[key] = then;
  return true;
};

// ---------------------------------------------------------------------------
// The lines
// ---------------------------------------------------------------------------

const RAM: LineDef[] = [
  {
    id: 'ram.plates',
    tree: 'ram',
    name: 'Pansarplåt',
    emoji: '🛡️',
    weight: 1.2,
    tiers: [
      { name: 'Pansarplåt', text: 'Grannens bastudörr på sidorna. Du tål 14 % mer och har 10 % mer hälsa i Blodbad.' },
      { name: 'Dubbelpansar', text: 'Två bastudörrar. Ännu 14 % tåligare. Taket är numera mest en ursäkt.' },
      { name: 'Bunkerdörren', text: 'Plåt som ett bankvalv. Ännu 14 % tåligare, och du ser ut som ett skafferi på hjul.' },
    ],
    tune(t, n) {
      t.tough *= Math.pow(0.86, n);
      t.hp *= Math.pow(1.1, n);
    },
  },
  {
    id: 'ram.ballast',
    tree: 'ram',
    name: 'Ballast',
    emoji: '🧱',
    weight: 0.9,
    tiers: [
      { name: 'Cementsäckar', text: 'Tio cementsäckar i baksätet. 20 % tyngre: du knuffar mer och blir knuffad mindre.' },
      { name: 'Hela murbruket', text: 'Hela bygget på flaket. Ännu 20 % tyngre. Accelerationen skickar sina hälsningar.' },
    ],
    tune(t, n) {
      t.mass *= Math.pow(1.2, n);
      t.power *= Math.pow(0.99, n);
    },
  },
  {
    id: 'ram.spikes',
    tree: 'ram',
    name: 'Spikar',
    emoji: '📌',
    weight: 1.1,
    tiers: [
      { name: 'Spikklubba', text: 'Spikar fram på stötfångaren. Dina smällar får mer kläm.' },
      { name: 'Spikgaller', text: 'Spikar på alla hörn och på hjulen. Dina smällar får ännu mer kläm. Tvättstugan klagar.' },
    ],
    tune(t, n) {
      t.shove += n === 1 ? 0.5 : 1.1;
    },
  },
  {
    id: 'ram.hammer',
    tree: 'ram',
    name: 'Slägga',
    emoji: '🔨',
    weight: 1,
    tiers: [
      { name: 'Slägga', text: 'Smällarna gör 35 % mer skada på andra bilar (Blodbad) och puttar lite hårdare.' },
      { name: 'Rivningsklot', text: 'Smällarna gör ännu 35 % mer skada. Bilar som ser dig börjar plötsligt ha bråttom.' },
    ],
    tune(t, n) {
      t.spike *= Math.pow(1.35, n);
      t.shove += 0.15 * n;
    },
  },
  {
    id: 'ram.shock',
    tree: 'ram',
    name: 'Stötvåg',
    emoji: '💥',
    weight: 1,
    tiers: [
      { name: 'Stötvåg', text: 'Efter en riktigt stor smäll skickas en stötvåg ut som kastar undan bilar runt dig.' },
      { name: 'Jordskalv', text: 'Stötvågen kommer vid mindre smällar också, når längre och gör mer skada.' },
    ],
    hooks: {
      tick: (c, dt) => cool(c, 'cd', dt),
      hit(c, kind, speed) {
        if (kind !== 'car' || speed < (c.n >= 2 ? 4.5 : 7) || !ready(c, 'cd', 4.5)) return;
        c.api.shock(c.n >= 2 ? 13 : 9, c.n >= 2 ? 8 : 6, c.n >= 2 ? 16 : 9);
        c.api.say('ram.shock', 'STÖTVÅG!');
      },
    },
  },
  {
    id: 'ram.boost',
    tree: 'ram',
    name: 'Rambooster',
    emoji: '🚀',
    weight: 1,
    tiers: [
      { name: 'Rambooster', text: 'Under nitron slår stötfångaren 50 % hårdare. Allt som är i vägen är i vägen.' },
      { name: 'Slagborrsnitro', text: 'Under nitron slår stötfångaren dubbelt så hårt, en sekund extra.' },
    ],
    hooks: {
      boost(c, kind) {
        if (kind !== 'nitro') return;
        c.api.ramUp(c.n >= 2 ? 4.5 : 3.5, c.n >= 2 ? 2 : 1.5);
        c.api.say('ram.boost', 'RAMBOOST!');
      },
    },
  },
  {
    id: 'ram.cap',
    tree: 'ram',
    name: 'Skrotkungen',
    emoji: '👑',
    weight: 1.3,
    cap: true,
    tiers: [{ name: 'Skrotkungen', text: 'Vrakar du en bil kommer en stötvåg och du lagar dig en fjärdedel. Pansar och spikar på köpet.' }],
    tune(t) {
      t.shove += 0.4;
      t.tough *= 0.92;
    },
    hooks: {
      takedown(c) {
        c.api.shock(14, 8, 12);
        c.api.heal(0.25);
        c.api.say('ram.cap', 'Skrotkungen!');
      },
    },
  },
];

const RACE: LineDef[] = [
  {
    id: 'race.engine',
    tree: 'race',
    name: 'Motor',
    emoji: '🔧',
    weight: 1.1,
    tiers: [
      { name: 'Motorinjektorer', text: '10 % mer effekt. Luktar bensin på ett bra sätt.' },
      { name: 'Trimmad motor', text: 'Ännu 10 % mer effekt. Grannarna vet när du kommer hem.' },
      { name: 'Motorn från flygplatsen', text: 'Ännu 10 % mer effekt. Någon har glömt en propeller kvar.' },
    ],
    tune(t, n) {
      t.power *= Math.pow(1.1, n);
    },
  },
  {
    id: 'race.grip',
    tree: 'race',
    name: 'Grepp',
    emoji: '🛞',
    weight: 1.1,
    tiers: [
      { name: 'Bättre däck', text: '6 % mer grepp. Vägen är fortfarande hal, men du tror inte på det.' },
      { name: 'Racingdäck', text: 'Ännu 6 % mer grepp. De tjuter lite extra i kurvorna.' },
      { name: 'Klisterdäck', text: 'Ännu 6 % mer grepp. Du lämnar en liten bit av vägen kvar på hjulen.' },
    ],
    tune(t, n) {
      t.grip *= Math.pow(1.06, n);
    },
  },
  {
    id: 'race.brakes',
    tree: 'race',
    name: 'Bromsar',
    emoji: '🛑',
    weight: 0.55,
    tiers: [
      { name: 'Bromsklossar', text: '12 % bättre bromsar. Man kan sluta tänka på dem så länge.' },
      { name: 'Tvåkolvsbromsar', text: 'Ännu 12 % bättre bromsar. Du stannar nästan innan du har bromsat.' },
    ],
    tune(t, n) {
      t.brakes *= Math.pow(1.12, n);
    },
  },
  {
    id: 'race.nitro',
    tree: 'race',
    name: 'Nitro',
    emoji: '🔥',
    weight: 1.2,
    tiers: [
      { name: 'Nitroflaskan', text: 'En extra nitro i varje lopp. Tryck och håll i dig.' },
      { name: 'Dubbla flaskor', text: 'Ännu en nitro i varje lopp. Bagageutrymmet är numera en gasolcistern.' },
      { name: 'Nitroförrådet', text: 'Ännu en nitro i varje lopp. Brandmännen har bett om en kopia på ritningen.' },
    ],
    tune(t, n) {
      t.charges += n;
    },
  },
  {
    id: 'race.long',
    tree: 'race',
    name: 'Nitrolängd',
    emoji: '⏱️',
    weight: 0.9,
    tiers: [
      { name: 'Stor ventil', text: 'Nitron varar 20 % längre och sparkar lite hårdare.' },
      { name: 'Jättestor ventil', text: 'Nitron varar ännu 20 % längre. Det luktar bränt, men fint.' },
    ],
    tune(t, n) {
      t.nitroSeconds *= Math.pow(1.2, n);
      t.nitroPower *= Math.pow(1.08, n);
    },
  },
  {
    id: 'race.drift',
    tree: 'race',
    name: 'Sladd',
    emoji: '🌀',
    weight: 1,
    tiers: [
      { name: 'Sladdstyrning', text: 'Sladdar laddar mini-turbon 30 % fortare.' },
      { name: 'Sladdkungen', text: 'Ännu 30 % fortare, och varje sladd slutar med en extra liten spark.' },
    ],
    tune(t, n) {
      t.driftRate *= Math.pow(1.3, n);
    },
    hooks: {
      drift(c, _s, tier) {
        if (c.n < 2 || tier < 1) return;
        c.api.boost(0.45, 1.2);
        c.api.say('race.drift', 'Sladdspark!');
      },
    },
  },
  {
    id: 'race.aero',
    tree: 'race',
    name: 'Aero',
    emoji: '🪽',
    weight: 0.9,
    tiers: [
      { name: 'Frontsplitter', text: '8 % högre topphastighet och en gnutta effekt. Man ser genast att du menar allvar.' },
      { name: 'Jättevinge', text: 'Ännu 8 % högre topphastighet. Vingen är större än bilen. Bra för fotona.' },
    ],
    tune(t, n) {
      t.top *= Math.pow(1.08, n);
      t.power *= Math.pow(1.02, n);
      t.grip *= Math.pow(1.01, n);
    },
  },
  {
    id: 'race.cap',
    tree: 'race',
    name: 'Formelbilen',
    emoji: '🏁',
    weight: 1.3,
    cap: true,
    tiers: [{ name: 'Formelbilen', text: 'Allt klickar: mer effekt, starkare nitro, och varje boost får en extra spark.' }],
    tune(t) {
      t.power *= 1.03;
      t.nitroPower *= 1.06;
    },
    hooks: {
      boost(c, kind) {
        if (kind === 'start' || !ready(c, 'cd', 1.2)) return;
        c.api.kick(1.6);
        c.api.say('race.cap', 'Formel 1!');
      },
      tick: (c, dt) => cool(c, 'cd', dt),
    },
  },
];

const FUFFENS: LineDef[] = [
  {
    id: 'fuffens.oil',
    tree: 'fuffens',
    name: 'Oljeläcka',
    emoji: '🛢️',
    weight: 1.1,
    tiers: [
      { name: 'Oljeläcka', text: 'Varje gång du boostar rinner en oljefläck ut bakom dig. Det var ju inte meningen. Eller?' },
      { name: 'Oljecisternen', text: 'Du släpper också olja med jämna mellanrum. Följarna får bromsa med känsla.' },
    ],
    hooks: {
      tick(c, dt, s) {
        cool(c, 'cd', dt);
        if (c.n < 2 || !s.racing || s.speed < 12) return;
        c.st.t = (c.st.t ?? 0) + dt;
        if (c.st.t >= 17 * c.tune.trickCd) {
          c.st.t = 0;
          c.api.oil();
          c.api.say('fuffens.oil', 'Plask!');
        }
      },
      boost(c, kind) {
        if (kind === 'start' || !ready(c, 'cd', 7 * c.tune.trickCd)) return;
        c.api.oil();
        c.api.say('fuffens.oil', 'Oj, olja!');
      },
    },
  },
  {
    id: 'fuffens.mine',
    tree: 'fuffens',
    name: 'Minor',
    emoji: '💣',
    weight: 1.1,
    tiers: [
      { name: 'Minor av plast', text: 'Bromsa hårt eller dra handbromsen så ligger en mina kvar. Den som kör på den far iväg.' },
      { name: 'Minfältet', text: 'Minorna kommer oftare och smäller hårdare. Plasten har bytts mot något med ett varningsmärke.' },
    ],
    hooks: {
      tick(c, dt, s) {
        cool(c, 'cd', dt);
        const trig = s.handbrakePressed || (s.braking && !c.st.was);
        c.st.was = s.braking ? 1 : 0;
        if (!trig || !s.racing || s.speed < 10 || !ready(c, 'cd', (c.n >= 2 ? 5 : 9) * c.tune.trickCd)) return;
        c.api.mine();
        c.api.say('fuffens.mine', 'Mina!');
      },
    },
  },
  {
    id: 'fuffens.fake',
    tree: 'fuffens',
    name: 'Falska mynt',
    emoji: '🪙',
    weight: 1,
    tiers: [
      { name: 'Falskt mynt', text: 'Då och då ligger ett guldmynt på vägen bakom dig. Rörs det, så poppar det och bilen snurrar.' },
      { name: 'Myntfabriken', text: 'Falska mynt oftare, och de poppar högre. Någon tar säkert hela vägen från start.' },
    ],
    hooks: {
      tick(c, dt, s) {
        if (!s.racing) return;
        c.st.t = (c.st.t ?? 0) + dt;
        if (c.st.t >= (c.n >= 2 ? 11 : 18) * c.tune.trickCd && s.speed > 8) {
          c.st.t = 0;
          c.api.fakeCoin();
          c.api.say('fuffens.fake', 'Ett mynt!');
        }
      },
    },
  },
  {
    id: 'fuffens.smoke',
    tree: 'fuffens',
    name: 'Rökgranat',
    emoji: '🌫️',
    weight: 1,
    tiers: [
      { name: 'Rökgranat', text: 'Nitron släpper en blindande rökridå bakom dig. Bilarna där bak ser noll.' },
      { name: 'Rökmaskinen', text: 'Ridån är större och varar längre. Det är som en diskotek för den som kör bakom.' },
    ],
    hooks: {
      tick: (c, dt) => cool(c, 'cd', dt),
      boost(c, kind) {
        if (kind !== 'nitro' || !ready(c, 'cd', 5)) return;
        c.api.smoke((c.n >= 2 ? 3.6 : 2.4) / Math.sqrt(c.tune.trickCd));
        c.api.say('fuffens.smoke', 'Rökridå!');
      },
    },
  },
  {
    id: 'fuffens.hay',
    tree: 'fuffens',
    name: 'Höbalskastaren',
    emoji: '🌾',
    weight: 0.9,
    tiers: [
      { name: 'Höbalskastaren', text: 'Då och då landar en höbal framför närmaste bil före dig. Från ingenstans.' },
      { name: 'Höbalskanonen', text: 'Oftare. Bönderna har slutat undra vart höet tar vägen.' },
    ],
    hooks: {
      tick(c, dt, s) {
        if (!s.racing) return;
        c.st.t = (c.st.t ?? 0) + dt;
        if (c.st.t >= (c.n >= 2 ? 11 : 19) * c.tune.trickCd) {
          if (c.api.dropAhead('hay')) {
            c.st.t = 0;
            c.api.say('fuffens.hay', 'Hö!');
          } else c.st.t = Math.max(0, c.st.t - 3);
        }
      },
    },
  },
  {
    id: 'fuffens.cap',
    tree: 'fuffens',
    name: 'Fuffens-mästaren',
    emoji: '🎭',
    weight: 1.3,
    cap: true,
    tiers: [{ name: 'Fuffens-mästaren', text: 'Alla knep går 45 % oftare och varar längre, och varje varv lägger du ut en fälla gratis.' }],
    tune(t) {
      t.trickCd *= 0.55;
    },
    hooks: {
      lap(c) {
        c.api.mine();
        c.api.oil();
        c.api.say('fuffens.cap', 'Överraskning!');
      },
    },
  },
];

const STUNT: LineDef[] = [
  {
    id: 'stunt.susp',
    tree: 'stunt',
    name: 'Stötdämpare',
    emoji: '🪛',
    weight: 0.8,
    tiers: [
      { name: 'Stötdämpare', text: 'Mjukare landningar och lugnare bil. Rumpan hänger med.' },
      { name: 'Gungfjädring', text: 'Ännu mjukare landningar. Gungar som en gammal gunga.' },
      { name: 'Svävarfjädring', text: 'Ännu mjukare. Du landar som en katt som har tränat.' },
    ],
    tune(t, n) {
      t.assist += 0.08 * n;
    },
  },
  {
    id: 'stunt.air',
    tree: 'stunt',
    name: 'Flygtid',
    emoji: '🦅',
    weight: 1.2,
    tiers: [
      { name: 'Flygtid', text: 'Ett långt hopp fyller nitron och ger kronor när du landar. Ju längre i luften, desto mer.' },
      { name: 'Flygbiljetten', text: 'Ännu mer av båda. Besättningen hälsar välkommen ombord.' },
    ],
    tune(t) {
      t.fill = true;
    },
    hooks: {
      trick(c, kind, v) {
        if (kind !== 'air') return;
        c.api.nitro(Math.min(0.55, 0.18 * v * c.n) * c.tune.stunt);
        c.api.kronor(Math.round(4 * v * c.n * c.tune.stunt));
        c.api.say('stunt.air', 'Lyft!');
      },
    },
  },
  {
    id: 'stunt.flip',
    tree: 'stunt',
    name: 'Volter',
    emoji: '🔄',
    weight: 1,
    tiers: [
      { name: 'Volter', text: 'Bilen tar en volt i luften. Landa den och få nitro och kronor.' },
      { name: 'Dubbelvolt', text: 'Längre i luften = fler volter, och varje volt är värd mer.' },
    ],
    tune(t, n) {
      t.flip = Math.max(t.flip, n);
      t.fill = true;
    },
    hooks: {
      trick(c, kind, v) {
        if (kind !== 'flip') return;
        c.api.nitro(0.22 * v * c.n * c.tune.stunt);
        c.api.kronor(Math.round(8 * v * c.n * c.tune.stunt));
        c.api.say('stunt.flip', v > 1 ? 'DUBBELVOLT!' : 'VOLT!');
      },
    },
  },
  {
    id: 'stunt.wheel',
    tree: 'stunt',
    name: 'Två hjul',
    emoji: '🤹',
    weight: 1,
    tiers: [
      { name: 'Två hjul', text: 'Långa, vilda sladdar och wheelies fyller nitron lite i taget. Fråga inte hur.' },
      { name: 'Cirkusföraren', text: 'Fyller nitron dubbelt så fort.' },
    ],
    tune(t) {
      t.fill = true;
    },
    hooks: {
      tick(c, dt, s) {
        const on = s.racing && (s.wheelie || (s.drifting && s.speed > 14));
        if (!on) {
          c.st.t = Math.max(0, (c.st.t ?? 0) - dt * 2);
          return;
        }
        c.st.t = (c.st.t ?? 0) + dt;
        if (c.st.t >= 1.8 / c.n) {
          c.st.t = 0;
          c.api.nitro(0.1 * c.n * c.tune.stunt);
          c.api.kronor(2 * c.n);
          c.api.say('stunt.wheel', 'Två hjul!');
        }
      },
    },
  },
  {
    id: 'stunt.near',
    tree: 'stunt',
    name: 'Nära ögat',
    emoji: '😬',
    weight: 1,
    tiers: [
      { name: 'Nära ögat', text: 'Susar du förbi en bil på en hårsmån får du lite nitro och några kronor.' },
      { name: 'Dödsföraktet', text: 'Nära ögat ger mer av båda. Mormor tittar bort.' },
    ],
    tune(t) {
      t.fill = true;
    },
    hooks: {
      trick(c, kind, v) {
        if (kind !== 'near') return;
        c.api.nitro(0.08 * c.n * (0.6 + v) * c.tune.stunt);
        c.api.kronor(Math.round(3 * c.n * c.tune.stunt));
        c.api.say('stunt.near', 'Nära ögat!');
      },
    },
  },
  {
    id: 'stunt.cap',
    tree: 'stunt',
    name: 'Stuntstjärnan',
    emoji: '🌟',
    weight: 1.3,
    cap: true,
    tiers: [{ name: 'Stuntstjärnan', text: 'Alla stunts ger 40 % mer, och varje stunt ger en liten fartspark. Publiken är vild.' }],
    tune(t) {
      t.stunt *= 1.4;
    },
    hooks: {
      trick(c) {
        c.api.boost(0.4, 1.15);
        c.api.say('stunt.cap', 'Publiken jublar!');
      },
    },
  },
];

const GIRIG: LineDef[] = [
  {
    id: 'girig.interest',
    tree: 'girig',
    name: 'Ränta',
    emoji: '🏦',
    weight: 1.1,
    tiers: [
      { name: 'Sparkonto', text: '5 % ränta på kronorna efter varje plats (högst 60 kr). Pengar som sover ger pengar.' },
      { name: 'Fonden', text: 'Ännu 5 % ränta, tillsammans 10 %. Rådgivaren ser lite för nöjd ut.' },
      { name: 'Ränta på ränta', text: 'Ännu 5 % ränta, tillsammans 15 %. Matematikern gråter av lycka.' },
    ],
    perk: (n) => ({ interest: 0.05 * n }),
  },
  {
    id: 'girig.bounty',
    tree: 'girig',
    name: 'Dusör på ledaren',
    emoji: '🎯',
    weight: 1,
    tiers: [
      { name: 'Efterlyst', text: 'Kör du om den som leder får du en dusör. Och lite kronor för varje vrak.' },
      { name: 'Prisjägaren', text: 'Dusören blir dubbelt så stor.' },
    ],
    hooks: {
      overtake(c, leader) {
        if (!leader) return;
        c.api.kronor(14 * c.n);
        c.api.say('girig.bounty', 'Dusör!');
      },
      takedown(c) {
        c.api.kronor(10 * c.n);
      },
    },
  },
  {
    id: 'girig.ins',
    tree: 'girig',
    name: 'Vrakförsäkring',
    emoji: '📄',
    weight: 1,
    tiers: [
      { name: 'Vrakförsäkring', text: 'Blir du vrakad (eller smäller det riktigt hårt) betalar försäkringen ut kronor.' },
      { name: 'Allriskförsäkring', text: 'Dubbel utbetalning. Försäkringsbolaget har slutat svara i telefon.' },
    ],
    hooks: {
      tick: (c, dt) => cool(c, 'cd', dt),
      hit(c, kind, speed) {
        if (kind === 'land' || speed < 8 || !ready(c, 'cd', 5)) return;
        c.api.kronor(6 * c.n);
        c.api.say('girig.ins', 'Försäkringen!');
      },
      wreck(c) {
        c.api.kronor(45 * c.n);
        c.api.say('girig.ins', 'Utbetalning!');
      },
    },
  },
  {
    id: 'girig.disc',
    tree: 'girig',
    name: 'Rabattkort',
    emoji: '🏷️',
    weight: 0.9,
    tiers: [
      { name: 'Stamkund', text: '10 % rabatt på kiosken och skruvhörnan. Du är känd på macken.' },
      { name: 'Kundklubben', text: 'Ännu 10 % rabatt. De ringer dig innan de öppnar.' },
    ],
    perk: (n) => ({ shopDiscount: 0.1 * n }),
  },
  {
    id: 'girig.gold',
    tree: 'girig',
    name: 'Guldkant',
    emoji: '💰',
    weight: 1,
    tiers: [
      { name: 'Guldkant', text: 'Mynten på banan är värda 30 % mer, och bilen får guldkant. Det syns.' },
      { name: 'Guldbilen', text: 'Mynten är värda ännu mer och dras till dig. Din bil är nu i praktiken en spargris.' },
    ],
    tune(t, n) {
      t.coinValue *= Math.pow(1.3, n);
      t.magnet = Math.max(t.magnet, 7 * n);
    },
  },
  {
    id: 'girig.cap',
    tree: 'girig',
    name: 'Kapitalisten',
    emoji: '🎩',
    weight: 1.3,
    cap: true,
    tiers: [{ name: 'Kapitalisten', text: '15 % mer kronor från alla lopp och ett extra kort att välja bland efter varje vinst.' }],
    perk: () => ({ kronor: 0.15, choices: 1 }),
  },
];

// ---- the vehicles' own ability upgrades: two each, taken in order ----

interface AbilUp {
  name: string;
  text: string;
  cd?: number;
  dur?: number;
  plus?: string;
}

/** What a plus-extra does, in words (the race does it). */
export const PLUS_TEXT: Record<string, string> = {
  oil: 'lämnar en oljefläck bakom dig',
  hay: 'släpper höbalar bakom dig',
  shock: 'skickar en stötvåg runt dig',
  boost: 'ger dig en liten extra boost',
  smoke: 'släpper en blindande rök bakom dig',
  coins: 'ger dig kronor',
  nitro: 'fyller på nitron lite',
  decoy: 'lämnar en lockbil som bilarna bakom saktar in för',
  heal: 'lagar bilen lite',
  mine: 'lämnar en mina bakom dig',
};

const ABIL: Record<CarBody, [AbilUp, AbilUp]> = {
  hatch: [
    { name: 'Förlängd kickstart', text: 'Kickstarten räcker 50 % längre.', dur: 1.5 },
    { name: 'Kickstart-nitro', text: 'Kickstarten fyller också på lite nitro.', plus: 'nitro', cd: 0.9 },
  ],
  buggy: [
    { name: 'Högre hopp', text: 'Hoppet går 35 % högre.', dur: 1.35 },
    { name: 'Dammoln', text: 'Hoppet lämnar ett dammoln som blindar bilarna bakom.', plus: 'smoke', cd: 0.9 },
  ],
  pickup: [
    { name: 'Större flak', text: 'Flaket laddar 25 % fortare.', cd: 0.75 },
    { name: 'Minflaket', text: 'Flaket lämnar också en mina i högen.', plus: 'mine' },
  ],
  coupe: [
    { name: 'Hårdare snärt', text: 'Snärten laddar 25 % fortare.', cd: 0.75 },
    { name: 'Snärt-nitro', text: 'Varje snärt fyller på lite nitro.', plus: 'nitro' },
  ],
  monster: [
    { name: 'Tyngre dunder', text: 'Dundret laddar 25 % fortare.', cd: 0.75 },
    { name: 'Dunder-rusning', text: 'Efter dundret ger du gas av bara farten: en liten boost.', plus: 'boost' },
  ],
  atv: [
    { name: 'Snabbare väsning', text: 'Bakhjulssvängen laddar 30 % fortare.', cd: 0.7 },
    { name: 'Svängrusning', text: 'Svängen ger en liten boost ut ur kurvan.', plus: 'boost' },
  ],
  moto: [
    { name: 'Längre raket', text: 'Wheelie-raketen brinner 40 % längre.', dur: 1.4 },
    { name: 'Rökig raket', text: 'Raketen lämnar rök som blindar bilarna bakom.', plus: 'smoke' },
  ],
  moped: [
    { name: 'Långt väj', text: 'Väj! varar 50 % längre.', dur: 1.5 },
    { name: 'Lockbilen', text: 'Väj! lämnar en lockbil kvar. Bilarna bakom saktar in och undrar.', plus: 'decoy' },
  ],
  tractor: [
    { name: 'Längre rammbock', text: 'Rammbocken varar 50 % längre.', dur: 1.5 },
    { name: 'Höhögen', text: 'Rammbocken släpper också höbalar bakom traktorn.', plus: 'hay' },
  ],
  sofa: [
    { name: 'Snabbare kudde', text: 'Kuddkaoset laddar 30 % fortare.', cd: 0.7 },
    { name: 'Mynt i soffan', text: 'Varje kudde hittar några kronor i mellanrummen.', plus: 'coins' },
  ],
  epa: [
    { name: 'Längre gasning', text: 'Spärren är av 40 % längre.', dur: 1.4 },
    { name: 'Svart rök', text: 'Gasningen lämnar svart rök som blindar bilarna bakom.', plus: 'smoke' },
  ],
  icecream: [
    { name: 'Dubbel strut', text: 'Glasskanonen laddar 25 % fortare.', cd: 0.75 },
    { name: 'Smält glass', text: 'Kanonen lämnar också en hal fläck bakom dig.', plus: 'oil' },
  ],
  garbage: [
    { name: 'Snabb tömning', text: 'Tömningen laddar 25 % fortare.', cd: 0.75 },
    { name: 'Fynd i soporna', text: 'Tömningen hittar kronor bland skräpet.', plus: 'coins' },
  ],
  snowmobile: [
    { name: 'Mer puder', text: 'Pudersvansen laddar 25 % fortare.', cd: 0.75 },
    { name: 'Pudersfart', text: 'Du får en liten boost genom snöstormen.', plus: 'boost' },
  ],
  kart: [
    { name: 'Snabb sladd', text: 'Gokartsladden laddar 30 % fortare.', cd: 0.7 },
    { name: 'Dubbel nitro', text: 'Sladden fyller på ännu lite mer nitro.', plus: 'nitro' },
  ],
  golf: [
    { name: 'Hårdare slag', text: 'Hole in one laddar 30 % fortare.', cd: 0.7 },
    { name: 'Bollen smäller', text: 'Där bollen landar skickas en liten stötvåg ut.', plus: 'shock' },
  ],
  mower: [
    { name: 'Bredare klippning', text: 'Klippningen varar 40 % längre.', dur: 1.4 },
    { name: 'Gräsfynd', text: 'Du hittar kronor i det klippta gräset.', plus: 'coins' },
  ],
  camper: [
    { name: 'Större tält', text: 'Tältet laddar 25 % fortare.', cd: 0.75 },
    { name: 'Hemmafix', text: 'Medan tältet fälls ut lagar du bilen lite.', plus: 'heal' },
  ],
  limo: [
    { name: 'Lång VIP-fil', text: 'VIP-filen varar 40 % längre.', dur: 1.4 },
    { name: 'Dricks', text: 'Bilarna du åker igenom ger dig dricks: kronor.', plus: 'coins' },
  ],
  cart: [
    { name: 'Större raket', text: 'Raketen brinner 30 % längre.', dur: 1.3 },
    { name: 'Rökraket', text: 'Raketen lämnar rök som blindar bilarna bakom.', plus: 'smoke' },
  ],
};

const CAR_LINES: LineDef[] = CAR_BODIES.map((body) => {
  const [a, b] = ABIL[body];
  const k = kitOf(body);
  return {
    id: `car.${body}`,
    tree: 'car' as const,
    body,
    name: k.active.name,
    emoji: k.active.emoji,
    weight: 1.1,
    tiers: [a, b].map((x) => ({ name: x.name, text: x.text })),
    tune(t: ModTune, tier: number) {
      for (let i = 0; i < tier; i++) {
        const u = [a, b][i]!;
        if (u.cd) t.abilCd *= u.cd;
        if (u.dur) t.abilDur *= u.dur;
        if (u.plus && !t.plus.includes(u.plus)) t.plus.push(u.plus);
      }
    },
  };
});

export const LINES: LineDef[] = [...RAM, ...RACE, ...FUFFENS, ...STUNT, ...GIRIG, ...CAR_LINES];
const LINE_BY_ID = new Map(LINES.map((l) => [l.id, l] as const));
export const lineById = (id: string): LineDef | undefined => LINE_BY_ID.get(id);

export const nodeId = (line: string, tier: number): string => `${line}${tier}`;

function makeNodes(): UpgradeDef[] {
  const out: UpgradeDef[] = [];
  for (const l of LINES) {
    l.tiers.forEach((t, i) => out.push({ id: nodeId(l.id, i + 1), line: l.id, tree: l.tree, tier: i + 1, name: t.name, emoji: l.emoji, text: t.text, cap: !!l.cap, body: l.body }));
  }
  return out;
}

export const UPGRADES: UpgradeDef[] = makeNodes();
const NODE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u] as const));
export const upgradeById = (id: string): UpgradeDef | undefined => NODE_BY_ID.get(id);
export const isUpgrade = (id: unknown): id is string => typeof id === 'string' && NODE_BY_ID.has(id);

/** The nodes of one tree, line by line. */
export const treeLines = (tree: TreeKey, body?: CarBody): LineDef[] => LINES.filter((l) => l.tree === tree && (tree !== 'car' || l.body === body));

// ---------------------------------------------------------------------------
// What a build owns
// ---------------------------------------------------------------------------

/** The highest tier taken of a line (0 = none). */
export function tierOf(ups: readonly string[], line: string): number {
  let t = 0;
  for (const id of ups) {
    const n = NODE_BY_ID.get(id);
    if (n && n.line === line && n.tier > t) t = n.tier;
  }
  return t;
}

export const hasUp = (ups: readonly string[], id: string): boolean => ups.includes(id);

/** How many nodes of a tree are taken. */
export const treeCount = (ups: readonly string[], tree: TreeKey): number => ups.reduce((a, id) => a + (NODE_BY_ID.get(id)?.tree === tree ? 1 : 0), 0);

/** Is this node open to take: not taken, the previous tier taken, and (a capstone) enough of its tree taken, and (an ability upgrade) the right vehicle. */
export function canTake(ups: readonly string[], id: string, body: CarBody): boolean {
  const n = NODE_BY_ID.get(id);
  if (!n || ups.includes(id)) return false;
  if (n.body && n.body !== body) return false;
  if (n.tier > 1 && !ups.includes(nodeId(n.line, n.tier - 1))) return false;
  if (n.cap && treeCount(ups, n.tree) < CAPSTONE_NEEDS) return false;
  return true;
}

/** Every node open to take now, in tree order. */
export const available = (ups: readonly string[], body: CarBody): UpgradeDef[] => UPGRADES.filter((u) => canTake(ups, u.id, body));

/** Why a node is not open yet, in words (for the tree view). */
export function lockedWhy(ups: readonly string[], id: string, body: CarBody): string {
  const n = NODE_BY_ID.get(id);
  if (!n) return '';
  if (n.body && n.body !== body) return 'Passar inte din bil';
  if (n.tier > 1 && !ups.includes(nodeId(n.line, n.tier - 1))) return `Kräver ${NODE_BY_ID.get(nodeId(n.line, n.tier - 1))?.name ?? 'förra nivån'}`;
  if (n.cap && treeCount(ups, n.tree) < CAPSTONE_NEEDS) return `${treeCount(ups, n.tree)}/${CAPSTONE_NEEDS} noder i trädet`;
  return '';
}

/** Adds a node (and any earlier tier of its line it is missing, so a hand-made save stays consistent). */
export function takeNode(ups: string[], id: string): void {
  const n = NODE_BY_ID.get(id);
  if (!n) return;
  for (let t = 1; t <= n.tier; t++) {
    const nid = nodeId(n.line, t);
    if (!ups.includes(nid)) ups.push(nid);
  }
}

/** A node's price in the workshop, before the act's markup and discounts. */
export const NODE_PRICE = { 1: 90, 2: 150, 3: 240, cap: 420, car: 130 } as const;
export function basePrice(id: string): number {
  const n = NODE_BY_ID.get(id);
  if (!n) return 999;
  if (n.cap) return NODE_PRICE.cap;
  if (n.tree === 'car') return NODE_PRICE.car;
  return NODE_PRICE[Math.min(3, n.tier) as 1 | 2 | 3];
}

// ---- perks of the run ----

/** All perks of a run: the trinkets' and the upgrades'. */
export function runPerks(owned: readonly Owned[], ups: readonly string[]): Required<UpPerk> {
  const base = perksOf(owned);
  const out = { ...base, interest: 0 };
  const seen = new Set<string>();
  for (const id of ups) {
    const n = NODE_BY_ID.get(id);
    if (!n || seen.has(n.line)) continue;
    seen.add(n.line);
    const l = LINE_BY_ID.get(n.line)!;
    const tier = tierOf(ups, n.line);
    const p = l.perk?.(tier);
    if (!p) continue;
    out.shopDiscount += p.shopDiscount ?? 0;
    out.maxHearts += p.maxHearts ?? 0;
    out.choices += p.choices ?? 0;
    out.kronor += p.kronor ?? 0;
    out.interest += p.interest ?? 0;
  }
  out.shopDiscount = Math.min(0.6, out.shopDiscount);
  out.kronor = out.kronor > 0.6 ? 0.6 + (1 - 0.6) * (1 - Math.exp(-(out.kronor - 0.6) / (1 - 0.6))) : out.kronor;
  return out;
}

/** The kronor of interest after a node. */
export const interestOn = (kronor: number, rate: number): number => (rate > 0 ? Math.min(INTEREST_MAX, Math.floor(kronor * rate)) : 0);

// ---------------------------------------------------------------------------
// Combos
// ---------------------------------------------------------------------------

export interface Ownership {
  owned: readonly Owned[];
  ups: readonly string[];
}

/** One half of a combo: a node of an upgrade line (any tier), a trinket, or any trinket of a path. */
export type Req = { up: string } | { trinket: string } | { path: TrinketPath };

export interface ComboDef {
  id: string;
  name: string;
  emoji: string;
  /** The two halves. */
  a: Req;
  b: Req;
  /** What it does, in a line. */
  text: string;
  hooks?: ModHooks;
  tune?(t: ModTune): void;
}

const reqHas = (r: Req, o: Ownership): boolean => {
  if ('up' in r) return tierOf(o.ups, r.up) > 0;
  if ('trinket' in r) return o.owned.some((t) => t.id === r.trinket && t.n > 0);
  return o.owned.some((t) => trinketById(t.id)?.path === r.path && t.n > 0);
};

export function reqName(r: Req): string {
  if ('up' in r) {
    const l = LINE_BY_ID.get(r.up);
    return l ? `${l.emoji} ${l.name}` : r.up;
  }
  if ('trinket' in r) {
    const t = trinketById(r.trinket);
    return t ? `${t.emoji} ${t.name}` : r.trinket;
  }
  return `🎲 en ${r.path === 'kaos' ? 'Kaos' : r.path}-pryl`;
}

export const COMBOS: ComboDef[] = [
  {
    id: 'combo.spikmattan',
    name: 'Spikmattan',
    emoji: '🪤',
    a: { up: 'ram.spikes' },
    b: { up: 'fuffens.oil' },
    text: 'Spikarna slår hål på oljetanken: varje riktig smäll lämnar en oljefläck.',
    hooks: {
      tick: (c, dt) => cool(c, 'cd', dt),
      hit(c, kind, speed) {
        if (kind !== 'car' || speed < 4 || !ready(c, 'cd', 5)) return;
        c.api.oil();
        c.api.say('combo.spikmattan', 'Spikmattan!');
      },
    },
  },
  {
    id: 'combo.luftburen',
    name: 'Luftburen',
    emoji: '🎈',
    a: { up: 'stunt.air' },
    b: { up: 'race.nitro' },
    text: 'Varje landning efter ett långt hopp fyller på en tredjedels nitro.',
    hooks: {
      trick(c, kind) {
        if (kind !== 'air') return;
        c.api.nitro(0.34);
        c.api.say('combo.luftburen', 'Luftburen!');
      },
    },
  },
  {
    id: 'combo.lotterivinsten',
    name: 'Lotterivinsten',
    emoji: '🎟️',
    a: { up: 'girig.interest' },
    b: { path: 'kaos' },
    text: 'Efter varje varv dras en lott: oftast en slant, ibland en jackpott.',
    hooks: {
      lap(c) {
        const win = Math.random() < 0.15 ? 150 : 25 + Math.round(Math.random() * 40);
        c.api.kronor(win);
        c.api.say('combo.lotterivinsten', win >= 150 ? 'JACKPOTT!' : 'Lotto!');
      },
    },
  },
  {
    id: 'combo.eldkastaren',
    name: 'Eldkastaren',
    emoji: '🔥',
    a: { trinket: 'kolsyrad' },
    b: { trinket: 'raketkorv' },
    text: 'Nitron blåser en kort eldstråle bakåt som bränner av farten på bilarna bakom. Sällsynt och ganska varmt.',
    hooks: {
      tick: (c, dt) => cool(c, 'cd', dt),
      boost(c, kind) {
        if (kind !== 'nitro' || !ready(c, 'cd', 9)) return;
        c.api.flame();
        c.api.say('combo.eldkastaren', 'ELDKASTARE!');
      },
    },
  },
  {
    id: 'combo.pansarraketen',
    name: 'Pansarraketen',
    emoji: '🪖',
    a: { up: 'ram.shock' },
    b: { up: 'race.nitro' },
    text: 'När nitron tänds skickas en liten stötvåg ut från bilen.',
    hooks: {
      tick: (c, dt) => cool(c, 'cd', dt),
      boost(c, kind) {
        if (kind !== 'nitro' || !ready(c, 'cd', 3)) return;
        c.api.shock(10, 7, 8);
        c.api.say('combo.pansarraketen', 'BOOM!');
      },
    },
  },
  {
    id: 'combo.sladdmolnet',
    name: 'Sladdmolnet',
    emoji: '☁️',
    a: { up: 'fuffens.smoke' },
    b: { up: 'race.drift' },
    text: 'Varje lång sladd lämnar en rökridå efter sig.',
    hooks: {
      tick: (c, dt) => cool(c, 'cd', dt),
      drift(c, _s, tier) {
        if (tier < 1 || !ready(c, 'cd', 6)) return;
        c.api.smoke(1.8);
        c.api.say('combo.sladdmolnet', 'Sladdmoln!');
      },
    },
  },
  {
    id: 'combo.dodsforakt',
    name: 'Dödsföraktet',
    emoji: '☠️',
    a: { up: 'stunt.near' },
    b: { up: 'girig.ins' },
    text: 'Försäkringsbolaget älskar risker: varje nära ögat ger 8 kr extra.',
    hooks: {
      trick(c, kind) {
        if (kind !== 'near') return;
        c.api.kronor(8);
        c.api.say('combo.dodsforakt', 'Livsfarligt!');
      },
    },
  },
  {
    id: 'combo.prisjakten',
    name: 'Prisjakten',
    emoji: '🏴‍☠️',
    a: { up: 'girig.bounty' },
    b: { up: 'ram.hammer' },
    text: 'Vrakar du en bil får du 40 kr och en halv nitro. Ett vrak är ett vrak.',
    hooks: {
      takedown(c) {
        c.api.kronor(40);
        c.api.nitro(0.5);
        c.api.say('combo.prisjakten', 'Prisjakten!');
      },
    },
  },
  {
    id: 'combo.minfaltet',
    name: 'Minfältet',
    emoji: '🎆',
    a: { up: 'fuffens.mine' },
    b: { up: 'stunt.air' },
    text: 'Landar du efter ett långt hopp lämnar du en mina där du landade.',
    hooks: {
      trick(c, kind) {
        if (kind !== 'air') return;
        c.api.mine();
        c.api.say('combo.minfaltet', 'Minfältet!');
      },
    },
  },
  {
    id: 'combo.stalsparbossan',
    name: 'Stålspargrisen',
    emoji: '🐷',
    a: { up: 'ram.plates' },
    b: { up: 'girig.interest' },
    text: 'Varje stor smäll plåten tål ger 7 kr. Plåten har blivit en spargris.',
    hooks: {
      tick: (c, dt) => cool(c, 'cd', dt),
      hit(c, kind, speed) {
        if (kind === 'land' || speed < 5 || !ready(c, 'cd', 3)) return;
        c.api.kronor(7);
        c.api.say('combo.stalsparbossan', 'Pling!');
      },
    },
  },
];

const COMBO_BY_ID = new Map(COMBOS.map((c) => [c.id, c] as const));
export const comboById = (id: string): ComboDef | undefined => COMBO_BY_ID.get(id);
export const isCombo = (id: unknown): id is string => typeof id === 'string' && COMBO_BY_ID.has(id);

/** The combos switched on by what the build owns. */
export const activeCombos = (o: Ownership): ComboDef[] => COMBOS.filter((c) => reqHas(c.a, o) && reqHas(c.b, o));

/** Combos with one half in hand: a hint of what to look for. */
export function almostCombos(o: Ownership): { combo: ComboDef; missing: Req }[] {
  const out: { combo: ComboDef; missing: Req }[] = [];
  for (const c of COMBOS) {
    const a = reqHas(c.a, o);
    const b = reqHas(c.b, o);
    if (a !== b) out.push({ combo: c, missing: a ? c.b : c.a });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Into a race
// ---------------------------------------------------------------------------

/** Names and emoji for the race HUD and the tests: any id of a trinket, an upgrade line or a combo. */
export function itemInfo(id: string): { name: string; emoji: string } | null {
  const t = trinketById(id);
  if (t) return { name: t.name, emoji: t.emoji };
  const l = LINE_BY_ID.get(id);
  if (l) return { name: l.name, emoji: l.emoji };
  const c = COMBO_BY_ID.get(id);
  if (c) return { name: c.name, emoji: c.emoji };
  return null;
}
export const isItemId = (id: unknown): id is string => typeof id === 'string' && (!!trinketById(id) || LINE_BY_ID.has(id) || COMBO_BY_ID.has(id));

/**
 * Turns what a run owns into what the race needs: the trinkets, then the upgrade lines (their numbers and hooks) and the
 * combos they switch on. Every number goes through the same soft caps.
 */
export function buildRunMods(owned: readonly Owned[], ups: readonly string[], body: CarBody): RaceMods {
  const { tune, items, entries } = collectParts(owned, body);
  const upItems: ModItem[] = [];
  const upEntries: ModEntry[] = [];
  const seen = new Set<string>();
  for (const id of ups) {
    const n = NODE_BY_ID.get(id);
    if (!n || seen.has(n.line)) continue;
    seen.add(n.line);
    const l = LINE_BY_ID.get(n.line)!;
    if (l.body && l.body !== body) continue;
    const tier = tierOf(ups, n.line);
    l.tune?.(tune, tier, body);
    if (l.hooks) {
      upItems.push({ id: l.id, name: l.name, emoji: l.emoji, n: tier });
      upEntries.push({ id: l.id, hooks: l.hooks, ctx: { api: null as never, tune, body, n: tier, st: {} } });
    }
  }
  const combos = activeCombos({ owned, ups });
  const comboItems: ModItem[] = [];
  for (const c of combos) {
    c.tune?.(tune);
    comboItems.push({ id: c.id, name: c.name, emoji: c.emoji, n: 1 });
    if (c.hooks) upEntries.push({ id: c.id, hooks: c.hooks, ctx: { api: null as never, tune, body, n: 1, st: {} } });
  }
  // the combos first on the HUD strip, then the upgrades that do something, then the trinkets
  return { items: [...comboItems, ...upItems, ...items], tune: capTune(tune), bus: new ModBus([...upEntries, ...entries]) };
}

/** How the car looks: the highest tier taken of every line, by line id (the model reads these). */
export function lookOf(ups: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ups) {
    const n = NODE_BY_ID.get(id);
    if (n && n.tree !== 'car' && n.tier > (out[n.line] ?? 0)) out[n.line] = n.tier;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The old part levels
// ---------------------------------------------------------------------------

/** Which line each of the six old tuning parts became (a part level is that many tiers). */
export const PART_LINE: Record<string, string> = {
  engine: 'race.engine',
  tyres: 'race.grip',
  brakes: 'race.brakes',
  turbo: 'race.nitro',
  armour: 'ram.plates',
  suspension: 'stunt.susp',
};

/** The nodes an old save's part levels come to. */
export function partsToNodes(parts: Partial<Record<string, number>>): string[] {
  const out: string[] = [];
  for (const [part, line] of Object.entries(PART_LINE)) {
    const lv = Math.max(0, Math.floor(parts[part] ?? 0));
    const max = LINE_BY_ID.get(line)!.tiers.length;
    for (let t = 1; t <= Math.min(lv, max); t++) out.push(nodeId(line, t));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Which tree a node counts for in the build mix
// ---------------------------------------------------------------------------

/** The path a node adds to in the build mix (an ability upgrade counts for the lean of its vehicle, mixed vehicles for nothing). */
export function nodePath(id: string): TrinketPath | null {
  const n = NODE_BY_ID.get(id);
  if (!n) return null;
  if (n.tree !== 'car') return n.tree;
  const lean = kitOf(n.body!).lean;
  return lean === 'ram' ? 'ram' : lean === 'race' ? 'race' : null;
}
