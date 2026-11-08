// The player's settings (sound, music, screen shake, FPS counter, and the Bild group: brightness, night, effects, road contrast), kept in localStorage. Versioned; every access
// is wrapped because storage can be missing or full. Lugnt läge lives in the meta progress (it is about the run).
export interface Settings {
  /** Master volume 0..1. */
  volume: number;
  music: boolean;
  shake: boolean;
  fps: boolean;
  /** Where the short pop-ups for talismans, abilities and boosts show: in the middle (above the car), in the corner, or not at all. */
  popups: 'mid' | 'corner' | 'off';
  /** Ikappkörningshjälp: slipström, comeback and a gentler field when you are far behind (rally/catchup.ts). On by default; the difficulty sets how much, Ett liv none of the comeback. */
  catchup: boolean;
  /** Ljusstyrka: a gamma applied in the post pass (1 = as designed, up to 1.6 brighter, down to 0.8). */
  brightness: number;
  /** Mörker: how dark the night races are. 'bright' lifts the shadows and the moon further; 'none' swaps night for dusk on this device. */
  dark: 'normal' | 'bright' | 'none';
  /** Effekter: 'less' turns down screen shake, grain, vignette, speed lines and every flash (Game Accessibility Guidelines: let the visual effects be turned down). */
  effects: 'full' | 'less';
  /** Hög kontrast-väg: stronger edge lines, reflector posts and chevrons, day and night. */
  hiRoad: boolean;
}

export const BRIGHTNESS_MIN = 0.8;
export const BRIGHTNESS_MAX = 1.6;

export const SETTINGS_KEY = 'galna-rallyt:settings:v1';

export const defaultSettings = (): Settings => ({ volume: 0.8, music: true, shake: true, fps: false, popups: 'mid', catchup: true, brightness: 1, dark: 'normal', effects: 'full', hiRoad: false });

/** Anything stored (or junk) becomes valid settings. */
export function cleanSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Record<string, unknown>;
  const vol = typeof o.volume === 'number' && Number.isFinite(o.volume) ? Math.max(0, Math.min(1, o.volume)) : d.volume;
  return {
    volume: Math.round(vol * 20) / 20,
    music: typeof o.music === 'boolean' ? o.music : d.music,
    shake: typeof o.shake === 'boolean' ? o.shake : d.shake,
    fps: typeof o.fps === 'boolean' ? o.fps : d.fps,
    popups: o.popups === 'mid' || o.popups === 'corner' || o.popups === 'off' ? o.popups : d.popups,
    catchup: typeof o.catchup === 'boolean' ? o.catchup : d.catchup,
    brightness: typeof o.brightness === 'number' && Number.isFinite(o.brightness) ? Math.round(Math.max(BRIGHTNESS_MIN, Math.min(BRIGHTNESS_MAX, o.brightness)) * 20) / 20 : d.brightness,
    dark: o.dark === 'normal' || o.dark === 'bright' || o.dark === 'none' ? o.dark : d.dark,
    effects: o.effects === 'full' || o.effects === 'less' ? o.effects : d.effects,
    hiRoad: typeof o.hiRoad === 'boolean' ? o.hiRoad : d.hiRoad,
  };
}

function load(): Settings {
  try {
    const s = localStorage.getItem(SETTINGS_KEY);
    return s ? cleanSettings(JSON.parse(s)) : defaultSettings();
  } catch {
    return defaultSettings();
  }
}

/** The live settings: the race reads them while it runs, the settings panel changes them and calls `saveSettings`. */
export const settings: Settings = load();

export function saveSettings(): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // private mode or full: the choices last for this visit
  }
}
