import { describe, expect, it } from 'vitest';
import { cleanSettings, defaultSettings } from './settings.ts';

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
});
