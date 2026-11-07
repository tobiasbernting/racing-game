import { describe, expect, it } from 'vitest';
import { cleanPrefs, defaultPrefs } from './prefs.ts';
import { BUTTON_IDS, SCHEMES, SIZES, cleanControls, clampRect, defaultControls, deviceClass, hasPedals, hudZones, isManual, keyHowTo, layoutRects, mirrorRect, overlaps, posFromRect, touchHowTo, unitSize, visibleButtons, type Rect, type Safe } from './controls.ts';

const SCREENS: [string, number, number, Safe][] = [
  ['small phone', 667, 375, { t: 0, r: 0, b: 0, l: 0 }],
  ['iPhone 13', 844, 390, { t: 0, r: 47, b: 21, l: 47 }],
  ['big phone', 932, 430, { t: 0, r: 47, b: 21, l: 47 }],
  ['iPad', 1080, 810, { t: 0, r: 0, b: 20, l: 0 }],
  ['iPad upright', 810, 1080, { t: 24, r: 0, b: 20, l: 0 }],
];

describe('control prefs', () => {
  it('older saves without controls get the defaults, junk is cleaned', () => {
    expect(cleanPrefs({ course: 'farm', body: 'hatch', paint: '#e8412c' }).controls).toEqual(defaultControls());
    expect(cleanPrefs(null).controls).toEqual(defaultControls());
    expect(defaultPrefs().controls.scheme).toBe('easy');
    const c = cleanControls({ scheme: 'bananas', manual: 'yes', size: 'xl', opacity: 9, lefty: 1, haptics: false, pos: { 'phone:pedals': { gas: { x: 2, y: -1 }, nope: { x: 0.5, y: 0.5 }, hand: { x: NaN, y: 1 } }, 'moon:easy': {} } });
    expect(c.scheme).toBe('easy');
    expect(c.manual).toBe(false);
    expect(c.size).toBe('m');
    expect(c.opacity).toBe(1);
    expect(c.lefty).toBe(false);
    expect(c.haptics).toBe(false);
    expect(c.pos).toEqual({ 'phone:pedals': { gas: { x: 1, y: 0 } } });
  });

  it('good values survive a round trip', () => {
    const c = { ...defaultControls(), scheme: 'pro' as const, manual: true, size: 'l' as const, opacity: 0.6, lefty: true, pos: { 'tablet:pro': { shiftUp: { x: 0.4, y: 0.8 } } } };
    expect(cleanControls(JSON.parse(JSON.stringify(c)))).toEqual(c);
  });

  it('manual shifting: Proffs on a touch screen always, Lätt never, elsewhere the setting', () => {
    const c = defaultControls();
    expect(isManual(c, false)).toBe(false);
    expect(isManual({ ...c, manual: true }, false)).toBe(true);
    expect(isManual({ ...c, scheme: 'pro' }, true)).toBe(true);
    expect(isManual({ ...c, scheme: 'pedals' }, true)).toBe(false);
    expect(isManual({ ...c, scheme: 'pedals', manual: true }, true)).toBe(true);
    expect(isManual({ ...c, scheme: 'easy', manual: true }, true)).toBe(false);
    expect(hasPedals(c, true)).toBe(false);
    expect(hasPedals({ ...c, scheme: 'pedals' }, true)).toBe(true);
    expect(hasPedals({ ...c, scheme: 'pro' }, false)).toBe(false);
  });
});

describe('the layout', () => {
  it('tells phones from tablets', () => {
    expect(deviceClass(844, 390)).toBe('phone');
    expect(deviceClass(1080, 810)).toBe('tablet');
    expect(deviceClass(810, 1080)).toBe('tablet');
  });

  it('keeps a slot for the ability in every scheme, hidden until a vehicle has one', () => {
    for (const s of SCHEMES) {
      expect(visibleButtons(s, { nitro: true, ability: false, manual: true })).not.toContain('ability');
      expect(visibleButtons(s, { nitro: true, ability: true, manual: true })).toContain('ability');
      const rects = layoutRects({ w: 844, h: 390, scheme: s, size: 'm', lefty: false, show: visibleButtons(s, { nitro: true, ability: true, manual: true }) });
      expect(rects.some((r) => r.id === 'ability'), s).toBe(true);
    }
  });

  it('shows the shift buttons only when shifting by hand, and the pedals only in the pedal schemes', () => {
    expect(visibleButtons('easy', { nitro: false, ability: false, manual: true })).not.toContain('shiftUp');
    expect(visibleButtons('easy', { nitro: false, ability: false, manual: false })).not.toContain('gas');
    expect(visibleButtons('pedals', { nitro: false, ability: false, manual: false })).toEqual(expect.arrayContaining(['gas', 'brake']));
    expect(visibleButtons('pedals', { nitro: false, ability: false, manual: false })).not.toContain('shiftUp');
    expect(visibleButtons('pro', { nitro: false, ability: false, manual: true })).toEqual(expect.arrayContaining(['shiftUp', 'shiftDn']));
    // Lätt: the nitro slot is the camera when there is no nitro
    expect(visibleButtons('easy', { nitro: false, ability: false, manual: false })).toContain('nitro');
    expect(visibleButtons('pedals', { nitro: false, ability: false, manual: false })).not.toContain('nitro');
  });

  for (const [name, w, h, safe] of SCREENS) {
    for (const scheme of SCHEMES) {
      for (const size of SIZES) {
        for (const lefty of [false, true]) {
          it(`${name}, ${scheme}, ${size}${lefty ? ', left-handed' : ''}: no overlaps, all on screen, clear of the minimap and speedometer, big enough`, () => {
            const show = visibleButtons(scheme, { nitro: true, ability: true, manual: true });
            const rects = layoutRects({ w, h, safe, scheme, size, lefty, show });
            expect(rects).toHaveLength(show.length);
            const zones = hudZones(w, h, safe);
            for (const r of rects) {
              expect(r.x, `${r.id} left`).toBeGreaterThanOrEqual(safe.l);
              expect(r.x + r.w, `${r.id} right`).toBeLessThanOrEqual(w - safe.r);
              expect(r.y, `${r.id} top`).toBeGreaterThanOrEqual(h * 0.36 - 0.5);
              expect(r.y + r.h, `${r.id} bottom`).toBeLessThanOrEqual(h - safe.b);
              expect(Math.min(r.w, r.h), `${r.id} size`).toBeGreaterThanOrEqual(44);
              expect(overlaps(r, zones.minimap), `${r.id} on the minimap`).toBe(false);
              expect(overlaps(r, zones.speedo), `${r.id} on the speedometer`).toBe(false);
            }
            for (let i = 0; i < rects.length; i++) for (let k = i + 1; k < rects.length; k++) expect(overlaps(rects[i]!, rects[k]!), `${rects[i]!.id} / ${rects[k]!.id}`).toBe(false);
            for (const r of rects) if (r.id === 'shiftUp' || r.id === 'shiftDn') expect(r.w).toBeGreaterThanOrEqual(scheme === 'easy' ? 0 : 52);
          });
        }
      }
    }
  }

  it('GAS is the biggest button under the right thumb, steering on the left (right-handed)', () => {
    const rects = layoutRects({ w: 844, h: 390, scheme: 'pedals', size: 'm', lefty: false, show: visibleButtons('pedals', { nitro: true, ability: false, manual: false }) });
    const by = Object.fromEntries(rects.map((r) => [r.id, r]));
    expect(by.gas!.w).toBeGreaterThan(by.brake!.w);
    expect(by.gas!.w).toBeGreaterThan(by.nitro!.w);
    expect(by.gas!.x).toBeGreaterThan(844 / 2);
    expect(by.left!.x).toBeLessThan(844 / 2);
    expect(by.right!.x).toBeLessThan(844 / 2);
    // the nitro sits above the gas, the brake beside it (to the left)
    expect(by.nitro!.y + by.nitro!.h).toBeLessThanOrEqual(by.gas!.y);
    expect(by.brake!.x + by.brake!.w).toBeLessThanOrEqual(by.gas!.x);
  });

  it('left-handed mirrors every button and mirroring twice is the identity', () => {
    const show = visibleButtons('pro', { nitro: true, ability: true, manual: true });
    for (const [, w, h, safe] of SCREENS) {
      const a = layoutRects({ w, h, safe, scheme: 'pro', size: 'm', lefty: false, show });
      const b = layoutRects({ w, h, safe, scheme: 'pro', size: 'm', lefty: true, show });
      for (const r of a) {
        const m = b.find((x) => x.id === r.id)!;
        expect(m.y).toBeCloseTo(r.y);
        // the steer pair keeps ◀ on the left of ▶, so those two swap places in the mirror
        const from = r.id === 'left' ? a.find((x) => x.id === 'right')! : r.id === 'right' ? a.find((x) => x.id === 'left')! : r;
        expect(m.x).toBeCloseTo(w + safe.l - safe.r - from.x - from.w);
        expect(mirrorRect(mirrorRect(r, w, safe), w, safe).x).toBeCloseTo(r.x);
      }
    }
  });

  it('left-handed keeps ◀ left of ▶, and the pair is not swapped when the player placed it', () => {
    const show = visibleButtons('pedals', { nitro: false, ability: false, manual: false });
    const by = (rs: Rect[], id: string) => rs.find((r) => r.id === id)!;
    const lefty = layoutRects({ w: 844, h: 390, scheme: 'pedals', size: 'm', lefty: true, show });
    expect(by(lefty, 'left').x).toBeLessThan(by(lefty, 'right').x);
    expect(by(lefty, 'left').x).toBeGreaterThan(844 / 2);
    const own = layoutRects({ w: 844, h: 390, scheme: 'pedals', size: 'm', lefty: false, pos: { left: { x: 0.8, y: 0.8 } }, show });
    const mir = layoutRects({ w: 844, h: 390, scheme: 'pedals', size: 'm', lefty: true, pos: { left: { x: 0.8, y: 0.8 } }, show });
    expect(by(mir, 'left').x).toBeCloseTo(844 - by(own, 'left').x - by(own, 'left').w);
  });

  it('tablets inset the clusters about a tenth from the edges and cap the button size', () => {
    const show = visibleButtons('pedals', { nitro: true, ability: true, manual: true });
    const rects = layoutRects({ w: 1080, h: 810, scheme: 'pedals', size: 'l', lefty: false, show });
    const left = Math.min(...rects.map((r) => r.x));
    const right = Math.max(...rects.map((r) => r.x + r.w));
    expect(left).toBeGreaterThan(1080 * 0.07);
    expect(1080 - right).toBeGreaterThan(1080 * 0.07);
    expect(unitSize(1080, 810, 'tablet', 'l')).toBeLessThanOrEqual(96);
    expect(unitSize(844, 390, 'phone', 'l')).toBeLessThanOrEqual(92);
    // bigger size, bigger buttons
    expect(unitSize(844, 390, 'phone', 'l')).toBeGreaterThan(unitSize(844, 390, 'phone', 's'));
  });

  it('respects the safe area insets', () => {
    const show = visibleButtons('pedals', { nitro: true, ability: true, manual: true });
    const safe = { t: 0, r: 60, b: 30, l: 60 };
    const rects = layoutRects({ w: 844, h: 390, safe, scheme: 'pedals', size: 'm', lefty: false, show });
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(60);
      expect(r.x + r.w).toBeLessThanOrEqual(844 - 60);
      expect(r.y + r.h).toBeLessThanOrEqual(390 - 30);
    }
  });

  it('dragged positions are kept, clamped on screen, and survive mirroring', () => {
    const show = visibleButtons('pedals', { nitro: true, ability: false, manual: false });
    const safe = { t: 0, r: 0, b: 0, l: 0 };
    const r0 = layoutRects({ w: 844, h: 390, scheme: 'pedals', size: 'm', lefty: false, show }).find((r) => r.id === 'nitro')!;
    const dragged: Rect = { ...r0, x: 500, y: 250 };
    const p = posFromRect(dragged, 844, 390, false, safe);
    const moved = layoutRects({ w: 844, h: 390, scheme: 'pedals', size: 'm', lefty: false, pos: { nitro: p }, show }).find((r) => r.id === 'nitro')!;
    expect(moved.x).toBeCloseTo(500);
    expect(moved.y).toBeCloseTo(250);
    // left-handed: dragging in the mirrored view stores the right-handed place, which mirrors back to where it was dropped
    const shown = layoutRects({ w: 844, h: 390, scheme: 'pedals', size: 'm', lefty: true, pos: { nitro: posFromRect(mirrorRect(dragged, 844), 844, 390, true) }, show }).find((r) => r.id === 'nitro')!;
    expect(shown.x).toBeCloseTo(mirrorRect(dragged, 844).x);
    // off screen, or up in the HUD: pulled back
    const off = layoutRects({ w: 844, h: 390, scheme: 'pedals', size: 'm', lefty: false, pos: { nitro: { x: 1, y: 0 } }, show }).find((r) => r.id === 'nitro')!;
    expect(off.x + off.w).toBeLessThanOrEqual(844);
    expect(off.y).toBeGreaterThanOrEqual(390 * 0.36 - 0.5);
    expect(clampRect({ id: 'gas', x: -50, y: 900, w: 100, h: 100 }, 800, 400).y).toBeLessThanOrEqual(300);
  });

  it('a narrow screen shrinks the buttons so both thumbs still fit', () => {
    const show = visibleButtons('pro', { nitro: true, ability: true, manual: true });
    const rects = layoutRects({ w: 568, h: 320, scheme: 'pro', size: 'l', lefty: false, show });
    for (let i = 0; i < rects.length; i++) for (let k = i + 1; k < rects.length; k++) expect(overlaps(rects[i]!, rects[k]!), `${rects[i]!.id} / ${rects[k]!.id}`).toBe(false);
  });

  it('knows every button id', () => {
    expect(BUTTON_IDS).toContain('ability');
  });
});

describe('the how-to texts', () => {
  it('match the chosen scheme', () => {
    const c = defaultControls();
    expect(touchHowTo(c).join(' ')).toContain('Bilen gasar själv');
    expect(touchHowTo({ ...c, scheme: 'pedals' }).join(' ')).toContain('GAS');
    expect(touchHowTo({ ...c, scheme: 'pedals' }).join(' ')).not.toContain('Växla själv');
    expect(touchHowTo({ ...c, scheme: 'pro' }).join(' ')).toContain('Växla själv');
    expect(keyHowTo(true).join(' ')).toContain('Q');
    expect(keyHowTo(false).join(' ')).toContain('Manuell växling');
  });
});
