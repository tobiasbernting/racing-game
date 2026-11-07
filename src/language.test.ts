// The game is for an adult and a ten-year-old: cheeky and gross (prutt, bajs, surströmming), never swearing or crude words.
// This scans every string literal in src/ (not identifiers or comments) plus the web manifest and index.html.
import { describe, expect, it } from 'vitest';

// every source file as text (vite resolves this at test time; no Node typings needed)
const sources = import.meta.glob('./**/*.{ts,css}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const manifest = import.meta.glob('../public/manifest.webmanifest', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const page = import.meta.glob('../index.html', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Word-boundary-aware: "fan" the word, not "fanfar" or "fans". */
const BANNED: RegExp[] = [/\bkuk/i, /\bskit/i, /\bfan\b/i, /\bjävl/i, /\bjavl/i, /\bhelvet/i, /\bsatan\b/i, /\bfitt/i, /\bröv\b/i, /\bknull/i, /\bhora\b/i, /\bpiss/i, /\bidiot/i];

/** The string literals of a source file: '...', "...", `...` (template text), with escapes left as they are. */
function literals(src: string): string[] {
  const out: string[] = [];
  const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
  let m: RegExpExecArray | null;
  // strip comments first so an apostrophe in a comment does not open a literal
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  while ((m = re.exec(clean))) out.push(m[1] ?? m[2] ?? m[3] ?? '');
  return out;
}

describe('the words in the game', () => {
  it('has no swearing or crude words in any player-facing string', () => {
    const hits: string[] = [];
    const files = Object.entries(sources).filter(([f]) => !/\.test\.ts$/.test(f));
    expect(files.length).toBeGreaterThan(40);
    for (const [file, text] of files) for (const lit of literals(text)) for (const re of BANNED) if (re.test(lit)) hits.push(`${file}: ${lit.slice(0, 80)}`);
    expect(hits).toEqual([]);
  });

  it('has none in the manifest or the page either', () => {
    const all = { ...manifest, ...page };
    expect(Object.keys(all)).toHaveLength(2);
    for (const [f, text] of Object.entries(all)) for (const re of BANNED) expect(re.test(text), `${f} ${re}`).toBe(false);
  });

  it('the scanner itself catches what it should and leaves "fanfar" alone', () => {
    expect(BANNED.some((re) => re.test('Du kukade dem'))).toBe(true);
    expect(BANNED.some((re) => re.test('Skit i det'))).toBe(true);
    expect(BANNED.some((re) => re.test('fan'))).toBe(true);
    expect(BANNED.some((re) => re.test('Fanfar och konfetti'))).toBe(false);
    expect(BANNED.some((re) => re.test('Strunt i det'))).toBe(false);
  });
});
