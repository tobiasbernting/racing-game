import { describe, expect, it } from 'vitest';
import { bestTextOn, colorContrast, contrastRatio, meetsNonText, parseHex, relativeLuminance } from './contrast.ts';

describe('WCAG contrast maths', () => {
  it('black on white is 21:1 and a colour on itself 1:1', () => {
    expect(colorContrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(colorContrast([120, 90, 30], [120, 90, 30])).toBeCloseTo(1, 5);
  });
  it('matches the reference luminances', () => {
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 5);
    expect(relativeLuminance(0, 0, 0)).toBe(0);
    expect(relativeLuminance(255, 0, 0)).toBeCloseTo(0.2126, 4);
    // #777 on white is the textbook 4.48:1 (just under AA text)
    expect(colorContrast([0x77, 0x77, 0x77], [255, 255, 255])).toBeCloseTo(4.48, 2);
  });
  it('is symmetric and the 3:1 line for graphics sits where it should', () => {
    expect(contrastRatio(0.05, 0.4)).toBeCloseTo(contrastRatio(0.4, 0.05), 10);
    expect(meetsNonText(contrastRatio(0.25, 0.05))).toBe(false);
    expect(meetsNonText(contrastRatio(0.1, 0.05) * 2)).toBe(true);
    expect(meetsNonText(3)).toBe(true);
  });
  it('parses hex and picks a readable text colour', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(parseHex('0a141e')).toEqual([10, 20, 30]);
    expect(parseHex('nope')).toBeNull();
    expect(bestTextOn([10, 10, 30]).color).toBe('#ffffff');
    expect(bestTextOn([250, 240, 200]).color).toBe('#101018');
    expect(bestTextOn([120, 120, 120]).ratio).toBeGreaterThan(4);
  });
});
