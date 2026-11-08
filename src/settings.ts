// The player's settings (sound, music, screen shake, FPS counter), kept in localStorage. Versioned; every access
// is wrapped because storage can be missing or full. Lugnt läge lives in the meta progress (it is about the run).
export interface Settings {
  /** Master volume 0..1. */
  volume: number;
  music: boolean;
  shake: boolean;
  fps: boolean;
  /** Where the short pop-ups for talismans, abilities and boosts show: in the middle (above the car), in the corner, or not at all. */
  popups: 'mid' | 'corner' | 'off';
}

export const SETTINGS_KEY = 'galna-rallyt:settings:v1';

export const defaultSettings = (): Settings => ({ volume: 0.8, music: true, shake: true, fps: false, popups: 'mid' });

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
