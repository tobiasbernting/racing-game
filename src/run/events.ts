// The ❓ events: a silly situation and two choices. Each choice has one or more outcomes (picked by weight from
// the run seed), each a short Swedish line plus effects on the run. A choice can need some kronor to be allowed.
import { CAR_PARTS, type CarPart } from '../shared/rally.ts';
import { CAR_PART_NAMES } from '../shared/names.ts';
import { Rng } from './rng.ts';
import { drawTrinkets, canUpgrade } from './economy.ts';
import { addKronor, addTrinket, healHeart, loseHeart, type RunState } from './state.ts';
import { trinketById, type Rarity } from './trinkets.ts';

export type Fx =
  | { k: 'kr'; n: number }
  | { k: 'heart'; n: number }
  /** A random trinket (of this rarity if given) or one in particular. */
  | { k: 'trinket'; rarity?: Rarity; id?: string }
  | { k: 'damage'; n: number }
  | { k: 'part' }
  | { k: 'repair' };

export interface Outcome {
  /** Odds against the other outcomes of the choice. */
  w?: number;
  text: string;
  fx: Fx[];
}

export interface EventChoice {
  label: string;
  /** Must have this many kronor to pick it. */
  needKr?: number;
  outcomes: Outcome[];
}

export interface EventDef {
  id: string;
  emoji: string;
  title: string;
  text: string;
  choices: [EventChoice, EventChoice];
}

export const EVENTS: EventDef[] = [
  {
    id: 'ko',
    emoji: '🐄',
    title: 'En ko står på vägen',
    text: 'Mitt på vägen står en ko och tuggar. Hon tänker inte flytta på sig.',
    choices: [
      { label: 'Tuta! (−10 kr)', outcomes: [{ text: 'TUUUT! Kon blir så rädd att hon tappar 10 kr ur fickan. Eller var det dina?', fx: [{ k: 'kr', n: -10 }] }] },
      {
        label: 'Kör runt kon',
        outcomes: [
          { text: 'Du svischar runt kon och hittar något blankt i diket!', fx: [{ k: 'trinket' }] },
          { text: 'Duns! Du kör rakt in i en höstack. Aj, ett hjärta mindre.', fx: [{ k: 'heart', n: -1 }] },
        ],
      },
    ],
  },
  {
    id: 'korv',
    emoji: '🌭',
    title: 'Korvkiosken',
    text: 'En korvkiosk ligger vid vägen. Det luktar underbart. Magen kurrar.',
    choices: [
      { label: 'Köp en korv (30 kr)', needKr: 30, outcomes: [{ text: 'Mums! Bästa korven någonsin. Du får ett hjärta tillbaka.', fx: [{ k: 'kr', n: -30 }, { k: 'heart', n: 1 }] }] },
      { label: 'Åk förbi', outcomes: [{ text: 'Du biter ihop och kör förbi. Men på marken ligger 15 kr!', fx: [{ k: 'kr', n: 15 }] }] },
    ],
  },
  {
    id: 'troll',
    emoji: '🧌',
    title: 'Trollet under bron',
    text: '“Här får ingen köra förbi utan att betala vägtull!” säger ett troll under bron.',
    choices: [
      { label: 'Betala tull (40 kr)', needKr: 40, outcomes: [{ text: 'Trollet blir nöjt och ger dig en present.', fx: [{ k: 'kr', n: -40 }, { k: 'trinket' }] }] },
      {
        label: 'Sjung för trollet',
        outcomes: [
          { w: 55, text: 'Trollet gråter av glädje och ger dig något ovanligt!', fx: [{ k: 'trinket', rarity: 'rare' }] },
          { w: 45, text: 'Trollet håller för öronen och kräver 20 kr i skadestånd.', fx: [{ k: 'kr', n: -20 }] },
        ],
      },
    ],
  },
  {
    id: 'ufo',
    emoji: '🛸',
    title: 'Ett flygande tefat',
    text: 'Ett tefat landar på vägen. En grön figur sticker ut huvudet och säger “Blip?”',
    choices: [
      {
        label: 'Vinka glatt',
        outcomes: [
          { text: 'Rymdvarelsen ger dig 100 kr i rymdpengar!', fx: [{ k: 'kr', n: 100 }] },
          { text: 'Zzzap! Rymdvarelsen trimmar din bil med en laserstråle.', fx: [{ k: 'part' }] },
        ],
      },
      { label: 'Gömma dig i en tunna', outcomes: [{ text: 'Tefatet flyger iväg. Det glömde en slant på marken.', fx: [{ k: 'kr', n: 15 }] }] },
    ],
  },
  {
    id: 'pepparkaka',
    emoji: '🍪',
    title: 'Pepparkaksbilen',
    text: 'En bil gjord av pepparkakor står parkerad. Den doftar ljuvligt.',
    choices: [
      { label: 'Ta en liten bit', outcomes: [{ text: 'Mums! Du blir pigg och får ett hjärta tillbaka (eller 40 kr om du redan var full av energi).', fx: [{ k: 'heart', n: 1 }] }] },
      {
        label: 'Ta HELA bilen!',
        outcomes: [
          { text: 'Du hittar en rosett i pepparkakan. Det är en riktig skatt!', fx: [{ k: 'trinket', rarity: 'rare' }] },
          { text: 'Aj, tandvärk! Bilen blir lite skadad av allt sockret.', fx: [{ k: 'damage', n: 25 }] },
        ],
      },
    ],
  },
  {
    id: 'karta',
    emoji: '🗺️',
    title: 'Skattkartan',
    text: 'En flaska ligger i diket med en skattkarta i. Ett X markerar en plats alldeles intill vägen.',
    choices: [
      {
        label: 'Gräv efter skatten',
        outcomes: [
          { w: 60, text: 'Kistan är full! Du får 120 kr.', fx: [{ k: 'kr', n: 120 }] },
          { w: 40, text: 'Bara ett par gamla gummistövlar. Men de är bekväma!', fx: [{ k: 'trinket', id: 'gummistovlar' }] },
        ],
      },
      { label: 'Använd som servett', outcomes: [{ text: 'Kartan var visst värd lite pengar för en samlare: 25 kr.', fx: [{ k: 'kr', n: 25 }] }] },
    ],
  },
  {
    id: 'foto',
    emoji: '📸',
    title: 'Fotografen',
    text: 'En fotograf hoppar fram: “Stanna! Jag ska göra en tidning om världens galnaste förare!”',
    choices: [
      { label: 'Posera!', outcomes: [{ text: 'Du blir omslagsbild och får 35 kr i arvode.', fx: [{ k: 'kr', n: 35 }] }] },
      {
        label: 'Kör förbi i full fart',
        outcomes: [
          { w: 40, text: 'Fotografen blir så imponerad att han skruvar på din bil gratis.', fx: [{ k: 'part' }] },
          { w: 60, text: 'Bilden blev helt suddig. Tur att ingen såg dig.', fx: [] },
        ],
      },
    ],
  },
  {
    id: 'regnbage',
    emoji: '🌈',
    title: 'Regnbågen',
    text: 'En regnbåge landar mitt i en vattenpöl. Något glimmar i botten.',
    choices: [
      {
        label: 'Hoppa i pölen',
        outcomes: [
          { w: 35, text: 'Splash! Du blir helt ny och får ett hjärta tillbaka.', fx: [{ k: 'heart', n: 1 }] },
          { w: 65, text: 'Splash! Du hittar 60 kr på botten.', fx: [{ k: 'kr', n: 60 }] },
        ],
      },
      {
        label: 'Jaga guldpotten',
        outcomes: [
          { w: 25, text: 'Guldpotten fanns på riktigt! Och en kuriosa ovanpå.', fx: [{ k: 'kr', n: 80 }, { k: 'trinket' }] },
          { w: 75, text: 'Det var bara glitter. Du tappade 15 kr på jakten.', fx: [{ k: 'kr', n: -15 }] },
        ],
      },
    ],
  },
  {
    id: 'spoke',
    emoji: '👻',
    title: 'Spöket i garaget',
    text: 'I ett övergivet garage sitter ett spöke och gråter. “Ingen vill leka med mig…”',
    choices: [
      { label: 'Fixa bilen tillsammans', outcomes: [{ text: 'Spöket är ett riktigt fumlig-geni! Bilen blir hel och bättre.', fx: [{ k: 'repair' }, { k: 'part' }] }] },
      { label: 'Säg “BUU!” tillbaka', outcomes: [{ text: 'Spöket skrattar så mycket att hans lakan trillar av. Under ligger en spökbil!', fx: [{ k: 'trinket', id: 'spokbil' }] }] },
    ],
  },
  {
    id: 'snogubbe',
    emoji: '⛄',
    title: 'Snögubben med skylt',
    text: 'En snögubbe står mitt i sommaren med en skylt: “Gratis kramar eller kronor?”',
    choices: [
      { label: 'Ge en kram', outcomes: [{ text: 'Brrr, kallt! Men snögubben ger dig 40 kr och en kall nitro.', fx: [{ k: 'kr', n: 40 }, { k: 'trinket', rarity: 'common' }] }] },
      { label: 'Ta kronorna', outcomes: [{ text: 'Snögubben smälter lite av besvikelse. Du får 50 kr.', fx: [{ k: 'kr', n: 50 }] }] },
    ],
  },
];

export const eventById = (id: string): EventDef | undefined => EVENTS.find((e) => e.id === id);
export const pickEventId = (run: RunState, nodeId: string): string => Rng.for(run.seed, nodeId, 'event').pick(EVENTS).id;

export const choiceAllowed = (run: RunState, c: EventChoice): boolean => run.kronor >= (c.needKr ?? 0);

/** Plays a choice: applies the outcome to the run and returns the line and what changed. */
export function resolveChoice(run: RunState, ev: EventDef, choiceIdx: number, nodeId: string): { text: string; lines: string[] } | null {
  const choice = ev.choices[choiceIdx];
  if (!choice || !choiceAllowed(run, choice)) return null;
  const rg = Rng.for(run.seed, nodeId, 'event', 'choice', choiceIdx);
  const outcome = rg.weighted(choice.outcomes, (o) => o.w ?? 1);
  const lines: string[] = [];
  for (const fx of outcome.fx) {
    switch (fx.k) {
      case 'kr':
        addKronor(run, fx.n);
        lines.push(`${fx.n > 0 ? '+' : '−'}${Math.abs(fx.n)} kr`);
        break;
      case 'heart':
        if (fx.n > 0) {
          if (healHeart(run, fx.n)) lines.push('+1 ❤️');
          else {
            addKronor(run, 40);
            lines.push('+40 kr (hjärtana var redan fulla)');
          }
        } else lines.push(loseHeart(run, true) ? '−1 ❤️' : 'Du hade tur och slapp förlora ett hjärta!');
        break;
      case 'trinket': {
        const id = fx.id ?? drawTrinkets(run, rg, 12, 'event').find((t) => !fx.rarity || trinketById(t)?.rarity === fx.rarity) ?? drawTrinkets(run, rg, 1, 'event')[0];
        if (id) {
          addTrinket(run, id);
          const d = trinketById(id);
          lines.push(`${d?.emoji ?? '🎁'} ${d?.name ?? id}`);
        }
        break;
      }
      case 'damage':
        run.car.damage = Math.min(100, run.car.damage + fx.n);
        lines.push('Bilen blev skadad 🔧');
        break;
      case 'part': {
        const open = CAR_PARTS.filter((p: CarPart) => canUpgrade(run, p));
        const part = open.length ? rg.pick(open) : null;
        if (part) {
          run.car.parts[part] = (run.car.parts[part] ?? 0) + 1;
          lines.push(`${CAR_PART_NAMES[part]} +1 ⬆️`);
        } else {
          addKronor(run, 50);
          lines.push('+50 kr (bilen är redan toppen)');
        }
        break;
      }
      case 'repair':
        run.car.damage = 0;
        lines.push('Bilen är som ny ✨');
        break;
    }
  }
  return { text: outcome.text, lines };
}
