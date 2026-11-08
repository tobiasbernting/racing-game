import { describe, expect, it } from 'vitest';
import { BRIGHTNESS_MAX, BRIGHTNESS_MIN, cleanSettings, defaultSettings } from './settings.ts';

describe('settings', () => {
  it('pop-ups default to the middle of the screen, and only known places are kept', () => {
    expect(defaultSettings().popups).toBe('mid');
    expect(cleanSettings({}).popups).toBe('mid');
    expect(cleanSettings(null).popups).toBe('mid');
    for (const p of ['mid', 'corner', 'off']) expect(cleanSettings({ popups: p }).popups).toBe(p);
    expect(cleanSettings({ popups: 'everywhere' }).popups).toBe('mid');
    // an old save without the setting keeps its other choices
    expect(cleanSettings({ volume: 0.25, music: false })).toMatchObject({ volume: 0.25, music: false, popups: 'mid' });
  });

  it('an old save without the picture settings gets the defaults and keeps what it had', () => {
    const old = cleanSettings({ volume: 0.5, music: false, shake: false, fps: true, popups: 'corner', catchup: false });
    expect(old).toMatchObject({ volume: 0.5, music: false, shake: false, fps: true, popups: 'corner', catchup: false });
    expect(old).toMatchObject({ brightness: 1, dark: 'normal', effects: 'full', hiRoad: false });
    expect(defaultSettings()).toMatchObject({ brightness: 1, dark: 'normal', effects: 'full', hiRoad: false });
  });

  it('keeps valid picture settings, clamps the brightness and drops junk', () => {
    expect(cleanSettings({ brightness: 1.3, dark: 'bright', effects: 'less', hiRoad: true })).toMatchObject({ brightness: 1.3, dark: 'bright', effects: 'less', hiRoad: true });
    expect(cleanSettings({ brightness: 9 }).brightness).toBe(BRIGHTNESS_MAX);
    expect(cleanSettings({ brightness: -2 }).brightness).toBe(BRIGHTNESS_MIN);
    expect(cleanSettings({ brightness: 'bright', dark: 'pitch', effects: 1, hiRoad: 'yes' })).toMatchObject({ brightness: 1, dark: 'normal', effects: 'full', hiRoad: false });
    expect(cleanSettings({ brightness: NaN }).brightness).toBe(1);
    for (const d of ['normal', 'bright', 'none']) expect(cleanSettings({ dark: d }).dark).toBe(d);
  });

  it('survives a round trip through JSON', () => {
    const s = cleanSettings({ brightness: 1.15, dark: 'none', effects: 'less', hiRoad: true });
    expect(cleanSettings(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});
