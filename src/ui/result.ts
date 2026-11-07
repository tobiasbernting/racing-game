// The result screen of a finished run (a win or the last heart lost): verdict, fun stats with a headline,
// the timeline of every node, the build and where it came from, trophies and unlocks. The numbers come from
// run/summary.ts; this file only draws them.
import { CAR_BODY_NAMES, CAR_DRIVER_EMOJI, CAR_DRIVER_NAMES } from '../shared/names.ts';
import { trinketById } from '../run/trinkets.ts';
import type { RunEnd, RunState } from '../run/state.ts';
import { PATH_EMOJI, PATH_NAMES, buildTimeline, buildView, challengesOf, fmtMs, nextUnlock, statView, trophyReasons, verdictOf, type StatCard, type TimelineItem } from '../run/summary.ts';
import { btn, el } from './dom.ts';
import { seedLabel } from './parts.ts';

const sectionHead = (icon: string, text: string, ...right: (Node | null)[]): HTMLElement => el('div', 'rs-sh', el('span', 'rs-shi', icon), el('h3', null, text), el('span', 'rg-grow'), ...right);

function statCard(c: StatCard): HTMLElement {
  const card = el('div', `rs-stat${c.score >= 1 ? ' hot' : ''}${/^(–|0([ ,]|$))/.test(c.value) ? ' zero' : ''}`, el('span', 'rs-sti', c.icon), el('b', 'rs-stv', c.value), el('span', 'rs-stl', c.label));
  card.title = c.line || c.label;
  return card;
}

function timelineItem(t: TimelineItem): HTMLElement {
  const top = el('div', 'rs-tl-top', el('span', 'rs-tl-ico', t.icon), t.kind ? el('span', `rs-kind k-${t.kind.kind}`, `${t.kind.emoji} ${t.kind.name}`) : el('span', 'rs-kind plain', t.typeName));
  const kids: (Node | string | null)[] = [top, el('b', 'rs-tl-title', t.title)];
  if (t.result) kids.push(el('span', 'rs-tl-res', t.result));
  if (t.lost > 0) kids.push(el('span', 'rs-tl-lost', '💔'.repeat(Math.min(t.lost, 3)), el('small', null, ` −${t.lost} ${t.lost === 1 ? 'hjärta' : 'hjärtan'}`)));
  if (t.rewards.length) kids.push(el('span', 'rs-tl-rew', ...t.rewards.map((r) => el('span', null, r))));
  if (t.fell) kids.push(el('span', 'rs-tl-fell', '💀 Här tog det slut'));
  return el('li', `rs-tl tone-${t.tone}${t.fell ? ' fell' : ''}`, ...kids);
}

function timelineSection(run: RunState): HTMLElement {
  const acts = buildTimeline(run);
  const box = el('section', 'rs-panel rs-timeline', sectionHead('🗺️', 'Så åkte du'));
  if (!acts.length) {
    box.append(el('p', 'rs-empty', 'Inga platser hann loggas. Rundan sparades innan tidslinjen fanns.'));
    return box;
  }
  const strip = el('ol', 'rs-strip');
  acts.forEach((a) => {
    strip.append(el('li', 'rs-actsep', el('span', null, `Akt ${a.act + 1}`), el('small', null, a.name)));
    a.items.forEach((t) => strip.append(timelineItem(t)));
  });
  box.append(el('div', 'rs-stripwrap', strip));
  return box;
}

function buildSection(run: RunState): HTMLElement {
  const b = buildView(run);
  const box = el('section', 'rs-panel rs-build', sectionHead('🧰', 'Bygget'));
  if (b.mix.length) {
    const bar = el('div', 'rs-mix', ...b.mix.map((m) => {
      const seg = el('span', `rs-seg p-${m.path}`, m.pct >= 12 ? `${m.emoji} ${m.pct} %` : '');
      seg.style.flexGrow = String(m.pct);
      seg.title = `${m.name} ${m.pct} %`;
      return seg;
    }));
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', b.mix.map((m) => `${m.pct} % ${m.name}`).join(', '));
    box.append(bar, el('p', 'rs-mixtxt', b.mix.map((m) => `${m.pct} % ${m.name}`).join(' · ')));
  } else box.append(el('p', 'rs-empty', 'Ingenting i bygget. Ren talang, inga prylar.'));
  // the vehicle's own kit: the active ability with how often it was used, and the passive
  const ab = b.ability;
  const uses = ab.uses === 0 ? 'Aldrig använd. Den är kränkt.' : `Använd ${ab.uses} ${ab.uses === 1 ? 'gång' : 'gånger'} på rundan.`;
  box.append(
    el(
      'div',
      'rs-ability',
      el('span', 'rs-ab-i', ab.emoji),
      el('div', null, el('small', 'rs-ab-k', `Fordonets förmåga · ${ab.vehicle} · ${ab.lean}`), el('b', null, ab.name), el('small', null, `${ab.text} ${uses}`), el('small', 'rs-ab-pass', `Passiv, ${ab.passive.name}: ${ab.passive.text}`)),
    ),
  );
  if (b.parts.length) {
    box.append(el('div', 'rs-parts', ...b.parts.map((p) => {
      const pips = el('span', 'rs-pips', ...Array.from({ length: 3 }, (_v, i) => el('i', i < p.level ? 'on' : null)));
      return el('div', 'rs-part', el('span', 'rs-pi', p.emoji), el('div', null, el('b', null, `${p.name} nivå ${p.level}`), el('small', null, p.from.join(' · '))), pips);
    })));
  }
  if (b.trinkets.length) {
    box.append(el('ul', 'rs-trinkets', ...b.trinkets.map((t) => {
      const def = trinketById(t.id);
      return el('li', `rs-tr r-${def?.rarity ?? 'common'}`, el('span', 'rs-tri', t.emoji), el('div', 'rs-trt', el('b', null, t.name, t.n > 1 ? el('em', null, ` ×${t.n}`) : null), el('small', null, t.from.join(' · '))), el('span', `rs-pathchip p-${t.path}`, `${PATH_EMOJI[t.path]} ${PATH_NAMES[t.path]}`));
    })));
  }
  return box;
}

function unlockSection(run: RunState, info: RunEnd): HTMLElement {
  const box = el('section', 'rs-panel rs-unlocks', sectionHead('🏆', 'Troféer och upplåst'));
  box.append(el('div', 'rs-trophy', `+${info.trophies} 🏆`, el('small', null, ` totalt ${info.total}`)));
  const why = trophyReasons(run, info.won);
  box.append(why.length ? el('ul', 'rs-why', ...why.map((w) => el('li', null, el('span', null, w.text), el('b', null, `+${w.n}`)))) : el('p', 'rs-empty', 'Inga troféer den här gången. Kör minst tre lopp nästa gång.'));
  const unl = [
    ...info.unlockedBodies.map((b) => `🚗 Ny bil: ${CAR_BODY_NAMES[b]}`),
    ...info.unlockedTrinkets.map((id) => {
      const d = trinketById(id);
      return `${d?.emoji ?? '🎁'} Ny pryl: ${d?.name ?? id}`;
    }),
  ];
  if (unl.length) box.append(el('ul', 'rs-new', ...unl.slice(0, 6).map((u) => el('li', null, u)), unl.length > 6 ? el('li', null, `…och ${unl.length - 6} till`) : null));
  // the challenges this run moved: vehicles to open
  const chal = challengesOf(run, info.progress ?? {});
  if (chal.length) {
    box.append(
      el('div', 'rs-chal-h', 'Utmaningar'),
      el('ul', 'rs-chal', ...chal.map((c) => {
        const bar = el('i');
        bar.style.width = `${Math.round((c.after / c.goal) * 100)}%`;
        return el('li', c.done ? 'done' : null, el('div', 'rs-chal-t', el('b', null, c.done ? `✅ ${CAR_BODY_NAMES[c.body]} upplåst!` : `🔓 ${CAR_BODY_NAMES[c.body]}`), el('span', null, c.title)), el('div', 'rs-prog', bar), el('small', null, c.text));
      })),
    );
  }
  const nx = nextUnlock(info.total);
  if (nx) {
    const pct = Math.max(0, Math.min(100, ((nx.have - nx.from) / Math.max(1, nx.need - nx.from)) * 100));
    const bar = el('div', 'rs-prog');
    const fill = el('i');
    fill.style.width = `${pct}%`;
    bar.append(fill);
    box.append(el('div', 'rs-next', el('span', null, `Nästa: ${nx.what}`), bar, el('small', null, `${nx.have} av ${nx.need} 🏆 · ${nx.need - nx.have} kvar`)));
  } else box.append(el('p', 'rs-empty', 'Alla prylar är upplåsta. Fordon låser du upp med utmaningar.'));
  return box;
}

export function resultView(run: RunState, info: RunEnd, o: { onAgain(): void; onTitle(): void }): HTMLElement {
  const v = verdictOf(run);
  const s = statView(run);
  const car = run.car;
  const driver = car.style.driver ?? 'human';
  const swatch = el('i', 'rs-paint');
  swatch.style.background = car.style.paint;
  const chips = [
    el('span', 'rs-chip', '🚗', ` ${CAR_BODY_NAMES[car.body]}`),
    el('span', 'rs-chip', CAR_DRIVER_EMOJI[driver], ` ${CAR_DRIVER_NAMES[driver]}`),
    el('span', 'rs-chip', swatch, ' Lack'),
    el('span', 'rs-chip', '⏲️', ` ${run.stats.totalTime > 0 ? fmtMs(run.stats.totalTime) : '–'}`, el('small', null, ' åktid')),
    el('span', 'rs-chip seed', seedLabel(run.seed)),
    run.calm ? el('span', 'rs-chip calm', '🛋️ Söndagsåkare') : null,
  ];
  const head = el(
    'header',
    `rs-head ${v.won ? 'won' : 'lost'}`,
    el('div', 'rs-verdict', el('h1', 'arc-title', v.title), el('p', 'rs-where', v.won ? '🏆 ' : '💀 ', v.where), el('p', 'rs-sub', v.sub)),
    el('div', 'rs-chips', ...chips),
  );
  const headline = el(
    'section',
    'rs-headline',
    el('span', 'rs-hl-i', s.headline?.icon ?? '🤫'),
    el('div', null, el('small', 'rs-hl-k', 'Rundans mest galna siffra'), el('b', 'rs-hl-v', s.headline ? `${s.headline.value} · ${s.headline.label}` : 'Tyst runda'), el('span', 'rs-hl-l', s.headline?.line || 'Inga rekord att skryta om. Lugn, det kommer en nästa runda.')),
  );
  const more = el('div', 'rs-grid rs-more', ...s.rest.map(statCard));
  more.hidden = true;
  const toggle = btn('rs-toggle', `Visa alla (${s.rest.length} till)`, () => {
    more.hidden = !more.hidden;
    toggle.textContent = more.hidden ? `Visa alla (${s.rest.length} till)` : 'Visa färre';
    toggle.setAttribute('aria-expanded', String(!more.hidden));
  });
  toggle.setAttribute('aria-expanded', 'false');
  const stats = el('section', 'rs-panel rs-stats', sectionHead('📊', 'Rundans siffror'), el('div', 'rs-grid', ...s.main.map(statCard)), s.rest.length ? toggle : null, s.rest.length ? more : null);
  const body = el('div', 'rs-body', head, headline, stats, timelineSection(run), el('div', 'rs-two', buildSection(run), unlockSection(run, info)));
  const foot = el('div', 'rg-foot', btn('rg-btn', 'Till menyn', o.onTitle), btn('rg-go', 'Ny runda 🏁', o.onAgain));
  return el('div', 'rg-screen rs-res', body, foot);
}
