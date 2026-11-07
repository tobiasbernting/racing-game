// The game is for an adult and a ten-year-old: cheeky and gross (prutt, bajs, surströmming), never swearing or crude words.
// This scans every string literal in src/ (not identifiers or comments) plus the web manifest and index.html.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Word-boundary-aware: "fan" the word, not "fanfar" or "fans". */
const BANNED: RegExp[] = [/\bkuk/i, /\bskit/i, /\bfan\b/i, /\bjävl/i, /\bjavl/i, /\bhelvet/i, /\bsatan\b/i, /\bfitt/i, /\bröv\b/i, /\bknull/i, /\bhora\b/i, /\bpiss/i, /\bidiot/i];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|css)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(p);
  }
  return out;
}

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
    for (const file of walk('src')) for (const lit of literals(readFileSync(file, 'utf8'))) for (const re of BANNED) if (re.test(lit)) hits.push(`${file}: ${lit.slice(0, 80)}`);
    expect(hits).toEqual([]);
  });

  it('has none in the manifest or the page either', () => {
    for (const f of ['public/manifest.webmanifest', 'index.html']) {
      const text = readFileSync(f, 'utf8');
      for (const re of BANNED) expect(re.test(text), `${f} ${re}`).toBe(false);
    }
  });

  it('the scanner itself catches what it should and leaves "fanfar" alone', () => {
    expect(BANNED.some((re) => re.test('Du kukade dem'))).toBe(true);
    expect(BANNED.some((re) => re.test('Skit i det'))).toBe(true);
    expect(BANNED.some((re) => re.test('fan'))).toBe(true);
    expect(BANNED.some((re) => re.test('Fanfar och konfetti'))).toBe(false);
    expect(BANNED.some((re) => re.test('Strunt i det'))).toBe(false);
  });
});
