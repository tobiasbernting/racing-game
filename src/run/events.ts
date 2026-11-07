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
  /** Only in these acts (0-based); anywhere when left out. Events about a place belong to the acts that visit it. */
  acts?: readonly number[];
}

export const EVENTS: EventDef[] = [
  {
    id: 'ko',
    emoji: '🐄',
    title: 'Kon som äger vägen',
    text: 'En ko står mitt på vägen och tuggar. Hon stirrar på dig som om du är skyldig henne pengar.',
    choices: [
      { label: 'Tuta! (−10 kr)', outcomes: [{ text: 'TUUUT! Kon blir så förolämpad att hon tar 10 kr i skadestånd. Hon har advokat.', fx: [{ k: 'kr', n: -10 }] }] },
      {
        label: 'Kör runt kon',
        outcomes: [
          { text: 'Du svischar runt kon och hittar något blankt i diket. Kon låtsas inte se.', fx: [{ k: 'trinket' }] },
          { text: 'DUNS! Du kör rakt in i en höstack. Kon skrattar. Ett hjärta mindre.', fx: [{ k: 'heart', n: -1 }] },
        ],
      },
    ],
  },
  {
    id: 'korv',
    emoji: '🌭',
    title: 'Korvkiosken på natten',
    text: 'En korvkiosk lyser vid vägen. Korven är grå. Försäljaren blinkar bara åt dig. Magen kurrar ändå.',
    choices: [
      { label: 'Köp en korv (30 kr)', needKr: 30, outcomes: [{ text: 'Bästa korven någonsin. Eller värsta. Din mage bestämmer sig för bäst. Ett hjärta tillbaka.', fx: [{ k: 'kr', n: -30 }, { k: 'heart', n: 1 }] }] },
      { label: 'Åk förbi', outcomes: [{ text: 'Du biter ihop och kör förbi. På marken ligger 15 kr. Och en tand. Du tar kronorna.', fx: [{ k: 'kr', n: 15 }] }] },
    ],
  },
  {
    id: 'troll',
    emoji: '🧌',
    title: 'Trollet med vägtull',
    text: '”Vägtull!” morrar ett troll under bron. ”Jag har skulder. Och en skräckfilm att se.”',
    choices: [
      { label: 'Betala tull (40 kr)', needKr: 40, outcomes: [{ text: 'Trollet räknar slantarna två gånger och ger dig en present. Den luktar sumpmark.', fx: [{ k: 'kr', n: -40 }, { k: 'trinket' }] }] },
      {
        label: 'Sjung för trollet',
        outcomes: [
          { w: 55, text: 'Trollet gråter hysteriskt och ger dig något ovanligt. Typ en gammal kärlekshistoria.', fx: [{ k: 'trinket', rarity: 'rare' }] },
          { w: 45, text: 'Trollet håller för öronen och kräver 20 kr i smärtersättning.', fx: [{ k: 'kr', n: -20 }] },
        ],
      },
    ],
  },
  {
    id: 'ufo',
    emoji: '🛸',
    title: 'Ett UFO parkerar snett',
    text: 'Ett tefat landar mitt på vägen. En grön figur kikar ut: ”Blip? Är det här Linköping?”',
    choices: [
      {
        label: 'Vinka glatt',
        outcomes: [
          { text: 'Rymdvarelsen betalar 100 kr i rymdpengar. Banken tar dem nog inte, men du tar dem.', fx: [{ k: 'kr', n: 100 }] },
          { text: 'Zzzap! En laserstråle tunar bilen. Utan att fråga. Den var ändå dålig.', fx: [{ k: 'part' }] },
        ],
      },
      { label: 'Gömma dig i en tunna', outcomes: [{ text: 'Tefatet tvekar, fnyser och flyger iväg. Det glömde en slant på marken.', fx: [{ k: 'kr', n: 15 }] }] },
    ],
  },
  {
    id: 'pepparkaka',
    emoji: '🍪',
    title: 'Pepparkaksbilen',
    text: 'En bil gjord av pepparkakor står parkerad. Den doftar jul. Det är november. Det här är fel.',
    choices: [
      { label: 'Ta en liten bit', outcomes: [{ text: 'Mums! Sockerchock, hjärtat startar om. Ett hjärta tillbaka (eller 40 kr om du redan var full av energi).', fx: [{ k: 'heart', n: 1 }] }] },
      {
        label: 'Ta HELA bilen!',
        outcomes: [
          { text: 'Inuti ligger en rosett av äkta guld. Någon har bakat in en skatt. Galning.', fx: [{ k: 'trinket', rarity: 'rare' }] },
          { text: 'Aj, tandvärk! Sockret fräter på lacken och bilen blir skadad.', fx: [{ k: 'damage', n: 25 }] },
        ],
      },
    ],
  },
  {
    id: 'karta',
    emoji: '🗺️',
    title: 'Skattkartan i flaskan',
    text: 'En flaska i diket innehåller en skattkarta. Ett X markerar en plats alldeles intill vägen. Det luktar mystik. Och fiskpinnar.',
    choices: [
      {
        label: 'Gräv efter skatten',
        outcomes: [
          { w: 60, text: 'Kistan är full! 120 kr! Du grävde som en hund och luktar som en.', fx: [{ k: 'kr', n: 120 }] },
          { w: 40, text: 'Bara ett par gamla tofflor. Mammas gamla tofflor. Varför grävde hon ner dem?', fx: [{ k: 'trinket', id: 'gummistovlar' }] },
        ],
      },
      { label: 'Använd som servett', outcomes: [{ text: 'Kartan var visst värd en slant för samlare. 25 kr. Servetten får du inte tillbaka.', fx: [{ k: 'kr', n: 25 }] }] },
    ],
  },
  {
    id: 'foto',
    emoji: '📸',
    title: 'Pappsen med kameran',
    text: 'En fotograf hoppar ut: ”STANNA! Jag gör en tidning om Sveriges mest vanvettiga förare!” Han har dålig andedräkt.',
    choices: [
      { label: 'Posera!', outcomes: [{ text: 'Du blir omslagsbild, med näsan i vädret. 35 kr i arvode. Pinsamt men lönsamt.', fx: [{ k: 'kr', n: 35 }] }] },
      {
        label: 'Kör förbi i full fart',
        outcomes: [
          { w: 40, text: 'Fotografen blir så imponerad att han tunar din bil gratis. Han vill bara vara kompis.', fx: [{ k: 'part' }] },
          { w: 60, text: 'Bilden blev helt suddig. Skönt. Din frisyr var inte redo.', fx: [] },
        ],
      },
    ],
  },
  {
    id: 'regnbage',
    emoji: '🌈',
    title: 'Regnbågen tappar glitter',
    text: 'En regnbåge landar i en vattenpöl och välter ut en hel säck glitter. Något guldigt glimmar i botten.',
    choices: [
      {
        label: 'Hoppa i pölen',
        outcomes: [
          { w: 35, text: 'SPLASH! Du kommer upp som ny och ett hjärta tillbaka. Och glittrig i hela ansiktet.', fx: [{ k: 'heart', n: 1 }] },
          { w: 65, text: 'SPLASH! 60 kr på botten. Någon tappade sin plånbok. Pinsamt för dem.', fx: [{ k: 'kr', n: 60 }] },
        ],
      },
      {
        label: 'Jaga guldpotten',
        outcomes: [
          { w: 25, text: 'Guldpotten fanns på riktigt! En leprechaun bara gråter i buskarna. Och du får en pryl också.', fx: [{ k: 'kr', n: 80 }, { k: 'trinket' }] },
          { w: 75, text: 'Det var bara glitter. Och en tom Pringles-burk. Du tappar 15 kr på jakten.', fx: [{ k: 'kr', n: -15 }] },
        ],
      },
    ],
  },
  {
    id: 'spoke',
    emoji: '👻',
    title: 'Spöket i garaget',
    text: 'I ett övergivet garage sitter ett spöke och gråter. ”Ingen vill hänga med mig. Jag är död, men inte på det sättet…”',
    choices: [
      { label: 'Fixa bilen tillsammans', outcomes: [{ text: 'Spöket har skruvat sedan 1962. Bilen blir hel och bättre. Han skickar kramar.', fx: [{ k: 'repair' }, { k: 'part' }] }] },
      { label: 'Säg “BUU!” tillbaka', outcomes: [{ text: 'Spöket skrattar så mycket att lakanet trillar av. Under ligger ett Spöklakan! Använt, men helt okej.', fx: [{ k: 'trinket', id: 'spokbil' }] }] },
    ],
  },
  {
    id: 'snogubbe',
    emoji: '⛄',
    title: 'Snögubben med skylt',
    text: 'En snögubbe står mitt i sommaren med en skylt: ”Kramar eller kronor? Jag smälter snart. Bestäm dig.”',
    choices: [
      { label: 'Ge en kram', outcomes: [{ text: 'Brrr, iskallt! Men snögubben ger dig 40 kr och en pryl ur sin morot. Fråga inte var.', fx: [{ k: 'kr', n: 40 }, { k: 'trinket', rarity: 'common' }] }] },
      { label: 'Ta kronorna', outcomes: [{ text: 'Snögubben smälter lite av besvikelse. Du får 50 kr. Du är en monsterperson.', fx: [{ k: 'kr', n: 50 }] }] },
    ],
  },
];

// ---- phase 3: events for the wild and the crazy acts ----
EVENTS.push(
  {
    id: 'kamel',
    emoji: '🐪',
    title: 'Kamelen med solglasögon',
    text: 'En kamel med solglasögon blockerar vägen. ”Pratar du kamelspråk?” frågar den. Du gör det inte. Du har ändå ett val.',
    acts: [1],
    choices: [
      {
        label: 'Svara på kamelspråk',
        outcomes: [
          { w: 55, text: 'Kamelen skrattar så att solglasögonen trillar av och ger dig något blankt i tack. Ingen vet varför.', fx: [{ k: 'trinket' }] },
          { w: 45, text: 'Du sa visst något oartigt om hans mamma. Kamelen spottar. Du tappar 15 kr på flykt.', fx: [{ k: 'kr', n: -15 }] },
        ],
      },
      { label: 'Erbjud kamelen din lunch (−10 kr)', needKr: 10, outcomes: [{ text: 'Kamelen blir rörd och ger dig 45 kr i dricks. Han hade en plånbok i pucklarna hela tiden.', fx: [{ k: 'kr', n: 35 }] }] },
    ],
  },
  {
    id: 'vulkanrap',
    emoji: '🌋',
    title: 'Vulkanen rapar',
    text: 'Marken skakar. Vulkanen rapar upp en glödande sten med ett paket fastbundet. ”Ursäkta! Frukostburriton.”',
    acts: [1],
    choices: [
      {
        label: 'Fånga stenen',
        outcomes: [
          { w: 60, text: 'Stenen är bara varm, som en nygammal pizza. I paketet ligger en riktig pryl.', fx: [{ k: 'trinket' }] },
          { w: 40, text: 'AJ, VARM! Bilen blir sotig och skadad. Vulkanen skäms.', fx: [{ k: 'damage', n: 20 }] },
        ],
      },
      { label: 'Backa undan', outcomes: [{ text: 'Stenen studsar förbi och lämnar ett mynt som har smält fast i vägen: 25 kr. Du bände loss det med nyckeln.', fx: [{ k: 'kr', n: 25 }] }] },
    ],
  },
  {
    id: 'maneman',
    emoji: '🌙',
    title: 'Gubben i månen kräver ost',
    text: 'Gubben i månen sträcker ut huvudet: ”Har du ost? Jag är så hungrig. Månen är bara en ostbit, men den är EJ ätbar. Typ.”',
    acts: [2],
    choices: [
      { label: 'Skicka en hälsning', outcomes: [{ text: 'Gubben blir så rörd att han tårögt ger dig ett hjärta (eller 40 kr om du redan var hel).', fx: [{ k: 'heart', n: 1 }] }] },
      {
        label: 'Be om ost som tack',
        outcomes: [
          { w: 40, text: 'Han kastar ner en ostbit med något blankt gömt inuti! Den doftar ändå som en fot.', fx: [{ k: 'trinket', rarity: 'rare' }] },
          { w: 60, text: 'Han skrattar och kastar ner en ostbit värd 55 kr på ostmarknaden. Dyrt, ändå stinkigt.', fx: [{ k: 'kr', n: 55 }] },
        ],
      },
    ],
  },
  {
    id: 'chokladflod',
    emoji: '🍫',
    title: 'Chokladfloden',
    text: 'Vid vägen porlar en flod av varm choklad. Skylten säger: ”Doppa gärna. Eller smaka. Men inte båda. Jag menar det.”',
    acts: [2],
    choices: [
      { label: 'Smaka en klunk', outcomes: [{ text: 'Mmmmm! Sockerrus. Hjärtat piggnar till och du får ett hjärta tillbaka (eller 40 kr om du redan var full av energi).', fx: [{ k: 'heart', n: 1 }] }] },
      {
        label: 'Doppa hela bilen',
        outcomes: [
          { w: 50, text: 'Bilen blir så glad av chokladen att motorn spinner som en katt. Du får en uppgradering!', fx: [{ k: 'part' }] },
          { w: 50, text: 'Kladdigt! Choklad i hjulhusen och i själen. Bilen blir skadad.', fx: [{ k: 'damage', n: 25 }] },
        ],
      },
    ],
  },
  {
    id: 'soffan',
    emoji: '🛋️',
    title: 'Soffan på vägen',
    text: 'En stor, mjuk soffa står mitt i vägen med en kudde och en kopp kaffe. Ingen är hemma. Någon har glömt fjärrkontrollen.',
    choices: [
      { label: 'Slå dig ner en stund', outcomes: [{ text: 'Ahh. Kaffet är perfekt. Du sover tre minuter. Ett hjärta tillbaka (eller 40 kr om du redan var hel).', fx: [{ k: 'heart', n: 1 }] }] },
      {
        label: 'Putta bort soffan',
        outcomes: [
          { w: 55, text: 'Under soffan: gamla mynt, en halv pizza och spelkort värda 40 kr. Du tar pengarna.', fx: [{ k: 'kr', n: 40 }] },
          { w: 45, text: 'Soffan var tyngre än den såg ut. Du skjuter i en timme och bilen blir skadad.', fx: [{ k: 'damage', n: 15 }] },
        ],
      },
    ],
  },
  {
    id: 'frukost',
    emoji: '🥣',
    title: 'Gigantiska flingor',
    text: 'En flinga stor som ett traktordäck ligger mitt på vägen. En lapp: ”Ät mig! (Eller åk förbi. Jag dömer inte.)”',
    acts: [2],
    choices: [
      { label: 'Ta en tugga', outcomes: [{ text: 'KNASP! I mitten gömde sig en liten present. Och en mjölkpöl.', fx: [{ k: 'trinket' }] }] },
      { label: 'Åk förbi', outcomes: [{ text: 'Du åker förbi i full fart. Flingan studsar i vinden och lämnar 20 kr efter sig.', fx: [{ k: 'kr', n: 20 }] }] },
    ],
  },
);

export const eventById = (id: string): EventDef | undefined => EVENTS.find((e) => e.id === id);
/** An event for this node: the ones that belong to the act, picked from the run seed. */
export const pickEventId = (run: RunState, nodeId: string): string => {
  const pool = EVENTS.filter((e) => !e.acts || e.acts.includes(run.act));
  return Rng.for(run.seed, nodeId, 'event').pick(pool.length ? pool : EVENTS).id;
};

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
            lines.push('+40 kr (du var redan i toppform)');
          }
        } else lines.push(loseHeart(run, true) ? '−1 ❤️' : 'Tur! Du slapp förlora ett hjärta.');
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
          lines.push('+50 kr (bilen kan inte bli bättre)');
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
