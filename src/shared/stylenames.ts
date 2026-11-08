// Swedish names (with a picture each) for everything the styling garage offers.
import type { CarDecal, CarExtra, CarFinish, CarHorn, CarLivery, CarSmoke, CarSpoiler, CarWheels, DecalSlot, HelmetDesign } from './rally.ts';

export type GarageTab = 'paint' | 'pattern' | 'decals' | 'wheels' | 'spoiler' | 'extras' | 'horn' | 'smoke' | 'plate' | 'helmet';
export const GARAGE_TABS: readonly GarageTab[] = ['paint', 'pattern', 'decals', 'wheels', 'spoiler', 'extras', 'horn', 'smoke', 'plate', 'helmet'];
export const TAB_NAMES: Record<GarageTab, string> = {
  paint: '🎨 Lack',
  pattern: '🏁 Mönster',
  decals: '⭐ Dekaler',
  wheels: '🛞 Fälgar',
  spoiler: '🪽 Spoiler',
  extras: '✨ Extras',
  horn: '📯 Tuta',
  smoke: '💨 Rök',
  plate: '🔢 Skylt',
  helmet: '⛑️ Hjälm',
};

export const FINISH_NAMES: Record<CarFinish, string> = { gloss: '✨ Blank', matte: '🧱 Matt', metallic: '💎 Metallic' };

export const LIVERY_NAMES: Record<CarLivery, string> = {
  none: '🚫 Inget',
  stripe: '➖ Rand',
  stripes2: '🟰 Dubbelrand',
  flames: '🔥 Lågor',
  checker: '🏁 Rutigt',
  dots: '⚪ Prickar',
  zigzag: '〰️ Sicksack',
  stars: '⭐ Stjärnor',
  hearts: '💖 Hjärtan',
  camo: '🌿 Kamouflage',
  lightning: '⚡ Blixtar',
  rainbow: '🌈 Regnbåge',
  hazard: '🚧 Varning',
  rust: '🟤 Rost',
  splat: '🎨 Färgstänk',
};

export const SLOT_NAMES: Record<DecalSlot, string> = { hood: 'Motorhuv', roof: 'Tak', doors: 'Dörrar', back: 'Bak' };

export const DECAL_NAMES: Record<CarDecal, string> = {
  number: 'Racingnummer',
  grusolja: 'Grusolja',
  kaosbensin: 'Kaosbensin',
  dackdunder: 'Däckdunder',
  skrotfix: 'Skrotfix',
  mackens: 'Mackens',
  surstark: 'Surstark',
  star: 'Stjärna',
  heart: 'Hjärta',
  flame: 'Låga',
  lightning: 'Blixt',
  flower: 'Blomma',
  rainbow: 'Regnbåge',
  paw: 'Tass',
  cow: 'Ko',
  hen: 'Höna',
  pig: 'Gris',
  sheep: 'Får',
  crown: 'Krona',
  smiley: 'Smiley',
  flag: 'Flagga',
  strawberry: 'Jordgubbe',
};
/** The made-up sponsors get a section of their own. */
export const SPONSOR_DECALS: readonly CarDecal[] = ['grusolja', 'kaosbensin', 'dackdunder', 'skrotfix', 'mackens', 'surstark'];

export const WHEEL_NAMES: Record<CarWheels, string> = { steel: '⚙️ Stål', sport: '🌟 Sport', offroad: '🪨 Terräng', star: '⭐ Stjärna', gold: '🥇 Guld' };
export const SPOILER_NAMES: Record<CarSpoiler, string> = { none: '🚫 Ingen', small: '▁ Liten', big: '▃ Stor', wing: '🪽 Vinge' };

export const EXTRA_NAMES: Record<CarExtra, string> = {
  roofrack: '🧳 Takräcke',
  lightbar: '💡 Ljusramp',
  flag: '🚩 Flagga',
  bullbar: '🦬 Frontbåge',
  exhaust2: '💨 Dubbla rör',
  antenna: '📡 Antenn',
  sideskirts: '📏 Sidokjolar',
  snorkel: '🤿 Snorkel',
  antlers: '🦌 Älghorn',
  ears: '🐰 Öron',
  horsetail: '🐴 Hästsvans',
  cone: '🚧 Trafikkon',
  duck: '🦆 Badanka',
  korv: '🌭 Korv',
};

export const HORN_NAMES: Record<CarHorn, string> = { beep: '🚗 Fordonets egen', tune: '🎵 Melodi', cow: '🐮 Mu', duck: '🦆 Kvack', train: '🚂 Tåg', honk: '🪿 Gåstuta' };
export const SMOKE_NAMES: Record<CarSmoke, string> = { white: '☁️ Vit', rainbow: '🌈 Regnbåge', hearts: '💕 Hjärtan', hay: '🌾 Hö', pink: '🩷 Rosa', blue: '💙 Blå', gold: '💛 Guld' };
/** The colour dot beside each smoke. */
export const SMOKE_COLORS: Record<CarSmoke, string> = { white: '#d9d6d0', rainbow: 'linear-gradient(90deg,#e8412c,#f4d20d,#3fbf4f,#2f8fe0,#8a4fd8)', hearts: '#ff8ac0', hay: '#e8c862', pink: '#ff9ad5', blue: '#7ab8ff', gold: '#ffd23f' };

export const HELMET_TITLE = 'Hjälm';
export type { HelmetDesign };
