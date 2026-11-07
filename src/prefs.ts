// The player's picks (course, car body, paint), kept in localStorage. Versioned; every access is wrapped
// because storage can be missing or full (private windows, blocked site data).
import { cleanControls, defaultControls, type ControlPrefs } from './controls.ts';
import { CAR_PAINTS, isCarBody, isRallyCourse, type CarBody, type RallyCourse } from './shared/rally.ts';

export interface Prefs {
  course: RallyCourse;
  body: CarBody;
  paint: string;
  /** Touch scheme, shifting, button size and place, haptics (older saves have none: they get the defaults). */
  controls: ControlPrefs;
}

const KEY = 'galna-rallyt:prefs:v1';

export const defaultPrefs = (): Prefs => ({ course: 'farm', body: 'hatch', paint: CAR_PAINTS[0], controls: defaultControls() });

/** Anything stored (or junk) becomes valid prefs. */
export function cleanPrefs(raw: unknown): Prefs {
  const d = defaultPrefs();
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Record<string, unknown>;
  return {
    course: isRallyCourse(o.course) ? o.course : d.course,
    body: isCarBody(o.body) ? o.body : d.body,
    paint: typeof o.paint === 'string' && (CAR_PAINTS as readonly string[]).includes(o.paint) ? o.paint : d.paint,
    controls: cleanControls(o.controls),
  };
}

export function loadPrefs(): Prefs {
  try {
    const s = localStorage.getItem(KEY);
    return s ? cleanPrefs(JSON.parse(s)) : defaultPrefs();
  } catch {
    return defaultPrefs();
  }
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // private mode or full: the picks last for this visit
  }
}
