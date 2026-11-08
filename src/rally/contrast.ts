// WCAG 2.2 contrast maths (SC 1.4.3 / 1.4.6 for text, SC 1.4.11 for graphics), as pure functions. The night
// check (docs/accessibility.md) samples the road, its edge line and the verge from screenshots and uses these.

/** sRGB channel 0..255 (or 0..1 with `max` 1) to linear light. */
export function srgbToLinear(c: number, max = 255): number {
  const v = Math.min(1, Math.max(0, c / max));
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of an sRGB colour (0 black .. 1 white). */
export function relativeLuminance(r: number, g: number, b: number, max = 255): number {
  return 0.2126 * srgbToLinear(r, max) + 0.7152 * srgbToLinear(g, max) + 0.0722 * srgbToLinear(b, max);
}

/** The contrast ratio of two relative luminances, 1..21, whichever is lighter. */
export function contrastRatio(l1: number, l2: number): number {
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/** Contrast of two sRGB colours given as [r, g, b]. */
export function colorContrast(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  return contrastRatio(relativeLuminance(...a), relativeLuminance(...b));
}

/** SC 1.4.11: graphical objects needed to understand the road need 3:1 against what is next to them. */
export const NON_TEXT_MIN = 3;
/** SC 1.4.3: normal text. */
export const TEXT_MIN = 4.5;
/** SC 1.4.3: large text (18 pt, or 14 pt bold). */
export const LARGE_TEXT_MIN = 3;

export const meetsNonText = (ratio: number): boolean => ratio >= NON_TEXT_MIN;

/** Parses #rgb / #rrggbb to [r, g, b] 0..255, or null. */
export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = [...h].map((x) => x + x).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * The text colour (white or near black) that reads best on a background, with its ratio. Used by the HUD
 * check: a label that fails 4.5:1 on its backing gets the other colour or a darker backing.
 */
export function bestTextOn(bg: readonly [number, number, number]): { color: '#ffffff' | '#101018'; ratio: number } {
  const l = relativeLuminance(...bg);
  const w = contrastRatio(1, l);
  const d = contrastRatio(relativeLuminance(16, 16, 24), l);
  return w >= d ? { color: '#ffffff', ratio: w } : { color: '#101018', ratio: d };
}
