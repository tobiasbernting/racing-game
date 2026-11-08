import { describe, expect, it } from 'vitest';
import { NAME_MAX, cleanPlayerName, displayName, nameOk, nameProblem, rallyNames, suggestRallyName, tidyName } from './rallyname.ts';
import { isClean } from './words.ts';

const FIRST = ['Tobias', 'Lukas', 'Greta', 'Sam', 'Alva', 'Elin', 'Oskar', 'Ebba', 'Noah', 'Maja', 'Liam', 'Wilma', 'Hugo', 'Ella', 'Axel', 'Olivia', 'Nils', 'Saga', 'Viggo', 'Agnes', 'Leo', 'Ines', 'Theo', 'Freja', 'Arvid', 'Ida', 'Melker', 'Stella', 'Ludvig', 'Tilda', 'Filip', 'Klara', 'Gustav', 'Signe', 'Vincent', 'Julia', 'Kalle', 'Lisa', 'Pelle', 'Zoe', 'Ylva', 'Åsa', 'Östen', 'Ärlans', 'Maximilian', 'Christopher', 'Alexandra', 'Bo', 'Al', 'Mattias', 'Johan', 'Fredrik', 'Kristoffer', 'Daniel', 'Henrik', 'Jonas', 'Stefan', 'Peter', 'Lars', 'Karl', 'Magnus', 'Andreas', 'Sebastian', 'Niklas', 'Patrik', 'Robert', 'Thomas', 'Joakim', 'Ola', 'Per', 'Erik', 'Anna', 'Eva', 'Karin', 'Sara', 'Emma', 'Hanna', 'Ulrika', 'Malin', 'Cecilia', 'Ingrid', 'Britt', 'Dennis', 'Ivar', 'Jörgen', 'Quincy', 'Xavier', 'Ursula', 'Yngve', 'Imran', 'Mohammed', 'Aisha', 'Dragan'];

describe('the name field', () => {
  it('tidies what is typed: trimmed, one space, no odd characters, at most 16 long', () => {
    expect(tidyName('  Tobias   Nilsson ')).toBe('Tobias Nilsson');
    expect(tidyName('Greta 🚀🔥')).toBe('Greta');
    expect(tidyName('<b>Sam</b>')).toBe('bSamb');
    expect(tidyName('x'.repeat(50)).length).toBe(NAME_MAX);
    expect(Array.from(tidyName('Åsa Örn-Ärlig med ett jättelångt efternamn')).length).toBeLessThanOrEqual(NAME_MAX);
    expect(tidyName('   ')).toBe('');
    expect(tidyName("Per O'Neil.")).toBe("Per O'Neil.");
  });

  it('accepts ordinary names and refuses rude ones, also with digits or spaces tucked in', () => {
    for (const n of ['Tobias', 'Åsa', 'Anna-Karin', 'Lukas L', 'Fanny', 'Scunthorpe', 'Hora Thora']) expect(nameOk(n), n).toBe(n !== 'Hora Thora');
    for (const n of ['kuk', 'Du kuk', 'skit', 'Fan', 'jävla', 'k u k', 'ku k', 'k.u.k', 'Hitler', 'p1ss', 'idiot', 'N4zi', 'f1tta']) expect(nameOk(n), n).toBe(false);
    expect(nameOk('')).toBe(false);
    expect(nameOk('   ')).toBe(false);
    expect(nameProblem('')).toMatch(/Skriv/);
    expect(nameProblem('kuk')).toMatch(/Prova ett annat/);
    expect(nameProblem('Tobias')).toBe('');
  });

  it('keeps a stored name only when it is clean', () => {
    expect(cleanPlayerName('  Tobias ')).toBe('Tobias');
    expect(cleanPlayerName('kuk')).toBe('');
    expect(cleanPlayerName(12)).toBe('');
    expect(cleanPlayerName(null)).toBe('');
    expect(displayName({ name: 'Tobias', alias: 'Turbo-Tobbe' })).toBe('Turbo-Tobbe');
    expect(displayName({ name: 'Tobias', alias: '' })).toBe('Tobias');
    expect(displayName({ name: '', alias: '' })).toBe('Du');
  });
});

describe('the rally name generator', () => {
  it('makes the examples the owner asked for', () => {
    expect(rallyNames('Tobias')).toContain('Turbo-Tobbe');
    expect(rallyNames('Lukas')).toContain('Lukas Lättfot');
    expect(rallyNames('Greta')).toContain('Grus-Greta');
    expect(rallyNames('Sam')).toContain('Sladd-Sam');
  });

  it('is deterministic: the same name gives the same suggestions in the same order', () => {
    for (const n of FIRST) {
      expect(rallyNames(n)).toEqual(rallyNames(n));
      for (let k = 0; k < 6; k++) expect(suggestRallyName(n, k)).toBe(suggestRallyName(n, k));
      expect(suggestRallyName(n, 0)).toBe(suggestRallyName(`  ${n}  `, 0));
    }
  });

  it('every suggestion is safe: clean, short enough, not the plain name, and "Nytt förslag" goes through the list and round again', () => {
    let made = 0;
    for (const n of FIRST) {
      const list = rallyNames(n);
      for (const c of list) {
        expect(isClean(c), `${n} -> ${c}`).toBe(true);
        expect(Array.from(c).length, c).toBeLessThanOrEqual(NAME_MAX);
        expect(c.toLowerCase()).not.toBe(n.toLowerCase());
        expect(nameOk(c), c).toBe(true);
      }
      expect(new Set(list).size).toBe(list.length);
      if (list.length) {
        made++;
        const seen = new Set(Array.from({ length: list.length }, (_, k) => suggestRallyName(n, k)));
        expect(seen.size).toBe(list.length);
        expect(suggestRallyName(n, list.length)).toBe(suggestRallyName(n, 0));
      }
    }
    // a decent name for nearly every ordinary first name
    expect(made).toBeGreaterThan(FIRST.length * 0.9);
  });

  it('prefers the same first letter, and the first suggestion is one of the neat ones', () => {
    for (const n of ['Tobias', 'Greta', 'Sam', 'Lukas', 'Nils', 'Rasmus', 'Filip', 'Maja', 'Viggo', 'Klara', 'Petra']) {
      const first = suggestRallyName(n, 0)!;
      expect(first, n).toBeTruthy();
      const word = first.includes('-') ? first.split('-')[0]! : first.split(' ')[1]!;
      expect(word.charAt(0).toLowerCase(), `${n} -> ${first}`).toBe(first.includes('-') ? n.charAt(0).toLowerCase() : n.charAt(0).toLowerCase());
    }
  });

  it('falls back to no suggestion when the name is too odd, too long or too short to make a decent one', () => {
    expect(suggestRallyName('', 0)).toBeNull();
    expect(suggestRallyName('X', 0)).toBeNull();
    expect(suggestRallyName('12345', 0)).toBeNull();
    expect(suggestRallyName('Konstantinopelius', 0)).toBeNull();
    expect(suggestRallyName('kuk', 0)).toBeNull();
    expect(rallyNames('Tobias 🚀')).toContain('Turbo-Tobbe');
    expect(rallyNames('???')).toEqual([]);
  });

  it('survives any junk without throwing and never returns a rude or too long name', () => {
    const junk = ['', ' ', 'a', 'ab', '--', 'a-b-c', 'Ö', 'Å', 'ÅÄÖ', '😀', 'x'.repeat(40), 'Zzzzzzzzz', 'Qwertyuiopås', "O'Brien", 'Anna Svensson', 'anna-lisa', 'MARIA', 'jävel', 'fitta'];
    for (const j of junk) {
      for (let k = 0; k < 5; k++) {
        const c = suggestRallyName(j, k);
        if (c) {
          expect(isClean(c)).toBe(true);
          expect(Array.from(c).length).toBeLessThanOrEqual(NAME_MAX);
        }
      }
    }
  });
});
