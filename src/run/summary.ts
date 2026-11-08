// What the result screen shows, worked out from a finished run: the verdict, the fun stats and the headline,
// the timeline, the build (with where every piece came from) and the unlock progress. Pure: the view only draws it.
import { CAR_BODY_NAMES } from '../shared/names.ts';
import { KIND_EMOJI, KIND_NAMES, type RaceKind } from '../shared/kinds.ts';
import { fmtTime, ordinal } from '../rally/util.ts';
import { ACTS, NODE_EMOJI, NODE_NAMES } from './map.ts';
import { DERBY_EMOJI, DERBY_NAME } from '../shared/derby.ts';
import { kitOf, LEAN_EMOJI, LEAN_NAMES } from '../shared/abilities.ts';
import { challengeReport, type ChallengeLine } from './unlocks.ts';
import type { NodeLog, RunState, RunStats } from './state.ts';
import { TRINKETS, trinketById, type TrinketPath } from './trinkets.ts';
import { TREES, TREE_INFO, activeCombos, itemInfo, nodePath, reqName, treeLines, upgradeById, type TreeId } from './upgrades.ts';

export const ACT_NAMES = ['Bondlandet', 'Vildmarken', 'Galna stan'] as const;

const sv = (n: number, digits = 0): string => n.toLocaleString('sv-SE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const times = (n: number): string => `${n} ${n === 1 ? 'gång' : 'gånger'}`;
/** ms as 1:02,4 */
export const fmtMs = (ms: number): string => fmtTime(ms / 1000);

// ---- the verdict ----

export interface Verdict {
  won: boolean;
  title: string;
  sub: string;
  /** Where it ended: the act and the node. */
  where: string;
}

export function verdictOf(run: RunState): Verdict {
  const last = run.log[run.log.length - 1];
  const act = `Akt ${Math.min(ACTS, run.act + 1)} · ${ACT_NAMES[Math.min(run.act, ACTS - 1)]}`;
  if (run.status === 'won') return { won: true, title: 'DU KROSSADE ALLA!', sub: 'Alla tre bossarna ligger i diket. Du är kung.', where: `Alla ${ACTS} akter avklarade` };
  const at = last ? `${last.title}${last.kind ? ` (${KIND_NAMES[last.kind]})` : ''}` : 'startlinjen';
  return { won: false, title: 'RUNDAN ÄR SLUT', sub: 'Sista hjärtat lämnade bilen. Inte illa. Inte bra.', where: `Föll i ${act}, på ${at}` };
}

// ---- fun stats ----

export interface StatCard {
  id: string;
  icon: string;
  label: string;
  /** The number as shown ("182 km/h"). */
  value: string;
  /** How remarkable: the raw amount over what counts as a lot. 1 = a lot. */
  score: number;
  /** A funny Swedish line, used when this is the headline. */
  line: string;
}

interface Def {
  id: string;
  icon: string;
  label: string;
  n: number;
  /** What counts as "a lot" for this stat. */
  ref: number;
  fmt?: (n: number) => string;
  line: (n: number, v: string) => string;
}

const topTrinket = (st: RunStats): { id: string; n: number } | null => {
  let best: { id: string; n: number } | null = null;
  for (const [id, n] of Object.entries(st.triggers)) if (itemInfo(id) && (!best || n > best.n)) best = { id, n };
  return best;
};

function defs(run: RunState): Def[] {
  const s = run.stats;
  const tt = topTrinket(s);
  const tdef = tt ? itemInfo(tt.id) ?? undefined : undefined;
  const list: Def[] = [
    { id: 'wins', icon: '🏁', label: 'Vunna lopp', n: s.wins, ref: 9, fmt: () => `${s.wins} av ${s.races}`, line: (n) => (n >= 8 ? 'Pokalhyllan har gett upp och ber om hjälp.' : 'Några pokaler blev det. Mormor är stolt.') },
    { id: 'podiums', icon: '🥉', label: 'Pallplatser', n: s.podiums, ref: 9, line: (n) => `${times(n)} på pallen. Champagnen var ljummen men glädjen äkta.` },
    { id: 'takedowns', icon: '💥', label: 'Vrakade bilar', n: s.takedowns, ref: 7, line: (n) => `${n} bilar blev reservdelar. Bilverkstäderna skickar blommor.` },
    { id: 'wrecks', icon: '🔧', label: 'Gånger vrakad', n: s.wrecks, ref: 6, line: (n) => `Du blev vrakad ${times(n)}. Du är mest ett reservdelslager med motor.` },
    { id: 'overtakes', icon: '🏎️', label: 'Omkörningar', n: s.overtakes, ref: 45, line: (n) => `${n} omkörningar. Folk började titta i backspegeln i stället för framåt.` },
    { id: 'bestLap', icon: '⏱️', label: 'Bästa varvet', n: 0, ref: 1, fmt: () => (s.bestLap ? fmtMs(s.bestLap) : '–'), line: () => '' },
    { id: 'topSpeed', icon: '🚀', label: 'Toppfart', n: s.topSpeed, ref: 230, fmt: (n) => (n ? `${Math.round(n)} km/h` : '–'), line: (n) => `${Math.round(n)} km/h. Hönsen i Bondlandet hann knappt blinka.` },
    { id: 'drift', icon: '🌀', label: 'Längsta sladden', n: s.longestDrift, ref: 7, fmt: (n) => (n ? `${sv(n, 1)} s` : '–'), line: (n) => `En enda sladd på ${sv(n, 1)} sekunder. Däcken har skickat ett hotbrev.` },
    { id: 'air', icon: '🦘', label: 'Tid i luften', n: s.airSeconds, ref: 25, fmt: (n) => `${sv(n, 1)} s`, line: (n) => `${sv(n)} sekunder i luften. Flygbolaget ringde och undrade vad du har för biljett.` },
    { id: 'jumps', icon: '🤸', label: 'Hopp', n: s.airJumps, ref: 30, line: (n) => `${times(n)} lämnade du marken. Marken tog det personligt.` },
    { id: 'nitro', icon: '🔥', label: 'Nitro', n: s.nitroSeconds, ref: 30, fmt: (n) => `${sv(n, 1)} s`, line: (n) => `${sv(n)} sekunder nitro. Bilen luktar nybakad pizza.` },
    { id: 'coins', icon: '🪙', label: 'Mynt', n: s.coins, ref: 70, line: (n) => `${n} mynt plockade du upp. Fickorna klirrar när du går.` },
    { id: 'earned', icon: '💰', label: 'Kronor tjänade', n: s.kronorEarned, ref: 1800, fmt: (n) => `${sv(n)} kr`, line: (n) => `${sv(n)} kr tjänade du. Skatteverket har börjat ringa.` },
    { id: 'spent', icon: '🛒', label: 'Kronor spenderade', n: s.kronorSpent, ref: 1200, fmt: (n) => `${sv(n)} kr`, line: (n) => `${sv(n)} kr gick till prylar. Mackens ägare köpte en segelbåt.` },
    { id: 'hearts', icon: '💔', label: 'Hjärtan förlorade', n: s.heartsLost, ref: 7, line: (n) => `${n} hjärtan förlorade. Din cardiolog vill prata.` },
    { id: 'oil', icon: '🛢️', label: 'Oljefläckar', n: s.oilHits, ref: 5, line: (n) => `${times(n)} i oljan. Du och oljan är officiellt bästisar.` },
    { id: 'hazards', icon: '🍌', label: 'Fällor utlagda', n: s.hazards + 0, ref: 12, line: (n) => `${n} fällor lade du ut åt andra. Du är trevlig på ett ovanligt sätt.` },
    { id: 'bounces', icon: '🎈', label: 'Studsar', n: s.bounces, ref: 45, line: (n) => `Studsade ${times(n)}. Någon sa "sluta", men du hörde inte.` },
    { id: 'squashed', icon: '🧦', label: 'Bilar sockade', n: s.squashed, ref: 6, line: (n) => `${n} bilar blev platta som sockor.` },
    { id: 'boosts', icon: '⚡', label: 'Boostar', n: s.boosts, ref: 40, line: (n) => `${times(n)} boostade du. Fartvinden la om din frisyr.` },
    { id: 'driftTime', icon: '↪️', label: 'Sladdtid', n: s.driftSeconds, ref: 70, fmt: (n) => `${sv(n)} s`, line: (n) => `${sv(n)} sekunder i sladd. Du körde mest på sidan.` },
    { id: 'quacks', icon: '📣', label: 'Oväsen', n: s.quacks, ref: 30, line: (n) => `${times(n)} ställde du till oväsen. Grannarna bor långt bort av en anledning.` },
    { id: 'bosses', icon: '👑', label: 'Bossar slagna', n: s.bossesBeaten, ref: 3, fmt: (n) => `${n} av ${ACTS}`, line: (n) => (n >= ACTS ? 'Alla bossar slagna. De bildar en stödgrupp.' : `${n} av ${ACTS} bossar slagna. De andra vågar inte titta på dig.`) },
  ];
  if (tt && tdef) list.push({ id: 'trinket', icon: tdef.emoji, label: `Mest utlöst: ${tdef.name}`, n: tt.n, ref: 55, fmt: (n) => `${n} gånger`, line: (n) => `${tdef.name} utlöstes ${times(n)}. Den jobbar hårdare än du.` });
  else list.push({ id: 'trinket', icon: '🎁', label: 'Mest utlöst pryl', n: 0, ref: 55, fmt: () => '–', line: () => '' });
  list.push({ id: 'time', icon: '⏲️', label: 'Total åktid', n: 0, ref: 1, fmt: () => fmtMs(s.totalTime), line: () => '' });
  return list;
}

/** Every stat of the run, in a fixed order. */
export function allStats(run: RunState): StatCard[] {
  return defs(run).map((d) => {
    const value = d.fmt ? d.fmt(d.n) : sv(Math.round(d.n));
    return { id: d.id, icon: d.icon, label: d.label, value, score: d.n > 0 ? d.n / d.ref : 0, line: d.n > 0 ? d.line(d.n, value) : '' };
  });
}

export interface StatView {
  headline: StatCard | null;
  /** 6-10 cards shown at once. */
  main: StatCard[];
  /** The rest, behind "Visa alla". */
  rest: StatCard[];
}

/** Always shown: how the races went. */
const ALWAYS = ['wins', 'earned', 'bestLap', 'topSpeed'];

/** The most remarkable stat becomes the headline; the next ones fill the cards; the rest wait behind a button. */
export function statView(run: RunState, mainCount = 9): StatView {
  const all = allStats(run);
  const ranked = all.filter((c) => c.score > 0).sort((a, b) => b.score - a.score);
  // a headline should be funny, not "you won a race"
  const headline = ranked.find((c) => !['wins', 'podiums', 'earned', 'bosses'].includes(c.id)) ?? ranked[0] ?? null;
  const main: StatCard[] = [];
  const take = (c: StatCard | undefined): void => {
    if (c && c !== headline && !main.includes(c) && main.length < mainCount) main.push(c);
  };
  for (const id of ALWAYS) take(all.find((c) => c.id === id));
  for (const c of ranked) take(c);
  for (const c of all) if (main.length < Math.min(6, mainCount)) take(c);
  const order = (c: StatCard): number => all.indexOf(c);
  main.sort((a, b) => order(a) - order(b));
  const rest = all.filter((c) => c !== headline && !main.includes(c));
  return { headline, main, rest };
}

// ---- timeline ----

export interface TimelineItem {
  nodeId: string;
  icon: string;
  /** Rally, Blandat or Blodbad for races. */
  kind?: { kind: RaceKind; emoji: string; name: string };
  typeName: string;
  title: string;
  /** "2:a av 4", "7 p · 2:a", "Slog bossen" */
  result: string;
  /** good (won), ok, bad (cost hearts), other (no race) */
  tone: 'good' | 'ok' | 'bad' | 'none';
  lost: number;
  /** Things picked up here: "🦆 Gummianka". */
  rewards: string[];
  /** The run ended here. */
  fell: boolean;
}

export interface TimelineAct {
  act: number;
  name: string;
  items: TimelineItem[];
}

function resultOf(l: NodeLog): { text: string; tone: TimelineItem['tone'] } {
  if (l.place === undefined) return { text: '', tone: 'none' };
  if (!l.finished) return { text: 'Bröt loppet', tone: 'bad' };
  if (l.arena) {
    // a Rivningsderby: the placing is the order of elimination
    const out = l.outAt !== undefined ? `utslagen efter ${fmtMs(l.outAt * 1000)}` : 'rullade till slutet';
    const td = l.takedowns ? ` · ${l.takedowns} vrak` : '';
    const nr = l.n && l.n > 1 ? `${ordinal(l.place)} av ${l.n}` : ordinal(l.place);
    return { text: `${l.type === 'boss' && l.place === 1 ? 'Slog bossen' : nr} · ${out}${td}`, tone: l.lost > 0 ? 'bad' : l.place === 1 ? 'good' : 'ok' };
  }
  const place = l.n && l.n > 1 ? `${ordinal(l.place)} av ${l.n}` : ordinal(l.place);
  const pts = l.kind === 'carnage' && l.points !== undefined ? `${l.points} p · ` : '';
  const goal = l.goalMet === undefined ? '' : l.goalMet ? ' · klarade målet' : ' · missade målet';
  const text = l.type === 'boss' && l.place === 1 ? 'Slog bossen' : `${pts}${place}${goal}`;
  return { text, tone: l.lost > 0 ? 'bad' : l.place === 1 ? 'good' : 'ok' };
}

const GOT_NAME = (what: 'trinket' | 'part' | 'up', id: string): string => {
  if (what === 'up') {
    const u = upgradeById(id);
    return `${u?.emoji ?? '🔧'} ${u?.name ?? id}`;
  }
  const d = trinketById(id);
  return `${d?.emoji ?? '🎁'} ${d?.name ?? id}`;
};

/** Every node walked, act by act, with what was picked up there. */
export function buildTimeline(run: RunState): TimelineAct[] {
  const acts: TimelineAct[] = [];
  const lastId = run.status === 'dead' ? run.log[run.log.length - 1]?.nodeId : undefined;
  for (const l of run.log) {
    let a = acts.find((x) => x.act === l.act);
    if (!a) {
      a = { act: l.act, name: ACT_NAMES[Math.min(l.act, ACTS - 1)]!, items: [] };
      acts.push(a);
    }
    const r = resultOf(l);
    const rewards = run.got.filter((g) => g.node === l.nodeId).map((g) => GOT_NAME(g.what, g.id));
    a.items.push({
      nodeId: l.nodeId,
      icon: l.arena ? DERBY_EMOJI : NODE_EMOJI[l.type],
      kind: l.arena && l.place !== undefined ? { kind: 'carnage', emoji: DERBY_EMOJI, name: 'Derby' } : l.kind && l.place !== undefined ? { kind: l.kind, emoji: KIND_EMOJI[l.kind], name: KIND_NAMES[l.kind] } : undefined,
      typeName: l.arena ? DERBY_NAME : NODE_NAMES[l.type],
      title: l.title,
      result: r.text,
      tone: r.tone === 'none' && l.lost > 0 ? 'bad' : r.tone,
      lost: l.lost,
      rewards,
      fell: l.nodeId === lastId,
    });
  }
  return acts;
}

// ---- the build ----

export const PATH_NAMES: Record<TrinketPath, string> = { ram: 'Ram', race: 'Race', fuffens: 'Fuffens', stunt: 'Stunt', girig: 'Girig', kaos: 'Kaos' };
export const PATH_EMOJI: Record<TrinketPath, string> = { ram: '🛡️', race: '🏎️', fuffens: '🦨', stunt: '🤸', girig: '🤑', kaos: '🎲' };

export interface MixPart {
  path: TrinketPath;
  name: string;
  emoji: string;
  pct: number;
}

/** The build by path as whole percentages that add up to 100 (largest remainder), biggest first. Trinkets count by stack, upgrade nodes one each. */
export function buildMix(run: RunState): MixPart[] {
  const w = new Map<TrinketPath, number>();
  for (const o of run.trinkets) {
    const d = trinketById(o.id);
    if (d) w.set(d.path, (w.get(d.path) ?? 0) + o.n);
  }
  for (const id of run.up) {
    const path = nodePath(id);
    if (path) w.set(path, (w.get(path) ?? 0) + 1);
  }
  const total = [...w.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) return [];
  const rows = [...w.entries()].map(([path, n]) => ({ path, exact: (n / total) * 100, n }));
  const floors = rows.map((r) => Math.floor(r.exact));
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const byRem = rows.map((r, i) => ({ i, rem: r.exact - floors[i]! })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const x of byRem) {
    if (left <= 0) break;
    floors[x.i]!++;
    left--;
  }
  return rows
    .map((r, i) => ({ path: r.path, name: PATH_NAMES[r.path], emoji: PATH_EMOJI[r.path], pct: floors[i]!, n: r.n }))
    .sort((a, b) => b.pct - a.pct || b.n - a.n || a.path.localeCompare(b.path))
    .map(({ n: _n, ...rest }) => rest);
}

export interface BuildTrinket {
  id: string;
  emoji: string;
  name: string;
  n: number;
  path: TrinketPath;
  /** Where each copy came from: "Vann Sura Bengt" or "Köpt i kiosken ×2". */
  from: string[];
}

/** One node of the car's upgrade trees on the result screen. */
export interface BuildNode {
  id: string;
  emoji: string;
  name: string;
  tier: number;
  cap: boolean;
  from: string[];
}

/** The nodes taken in one tree, and how many the tree has in all. */
export interface BuildTree {
  tree: TreeId | 'car';
  name: string;
  emoji: string;
  nodes: BuildNode[];
  total: number;
}

export interface BuildCombo {
  id: string;
  name: string;
  emoji: string;
  text: string;
  /** Names of the two halves. */
  needs: string[];
}

const sources = (list: { from: string }[]): string[] => {
  const m = new Map<string, number>();
  for (const g of list) m.set(g.from, (m.get(g.from) ?? 0) + 1);
  return [...m.entries()].map(([f, n]) => (n > 1 ? `${f} ×${n}` : f));
};

/** The vehicle's own kit for the result screen: the active ability with how often it was used, and the passive. */
export interface AbilityInfo {
  emoji: string;
  name: string;
  text: string;
  /** Times the active was used over the whole run. */
  uses: number;
  passive: { name: string; text: string };
  lean: string;
  vehicle: string;
  /** The vehicle's own ability upgrades taken (0 to 2). */
  ups: { name: string; text: string }[];
}
export function abilityOf(run: RunState): AbilityInfo {
  const k = kitOf(run.car.body);
  return { emoji: k.active.emoji, name: k.active.name, text: k.active.text, uses: Math.round(run.stats.abilityUses), passive: { name: k.passive.name, text: k.passive.text }, lean: `${LEAN_EMOJI[k.lean]} ${LEAN_NAMES[k.lean]}`, vehicle: CAR_BODY_NAMES[run.car.body], ups: run.up.map((id) => upgradeById(id)).filter((u): u is NonNullable<typeof u> => !!u && u.tree === 'car').map((u) => ({ name: u.name, text: u.text })) };
}

/** The challenges this run moved or completed, for the result screen. */
export function challengesOf(run: RunState, progressNow: Record<string, number>): ChallengeLine[] {
  return challengeReport(run.chal0, progressNow, run.end?.unlockedBodies ?? run.opened);
}

export interface BuildView {
  trinkets: BuildTrinket[];
  trees: BuildTree[];
  combos: BuildCombo[];
  mix: MixPart[];
  ability: AbilityInfo;
}

/** The nodes taken so far, tree by tree (only trees with something in them), with where each came from. */
export function buildTrees(run: RunState): BuildTree[] {
  const out: BuildTree[] = [];
  for (const tree of [...TREES, 'car' as const]) {
    const nodes: BuildNode[] = [];
    for (const id of run.up) {
      const u = upgradeById(id);
      if (!u || u.tree !== tree) continue;
      const from = sources(run.got.filter((g) => g.what === 'up' && g.id === id));
      nodes.push({ id, emoji: u.emoji, name: u.name, tier: u.tier, cap: u.cap, from: from.length ? from : ['Hittad på vägen'] });
    }
    if (!nodes.length) continue;
    const info = tree === 'car' ? { name: 'Fordonet', emoji: kitOf(run.car.body).active.emoji } : TREE_INFO[tree];
    out.push({ tree, name: info.name, emoji: info.emoji, nodes, total: treeLines(tree, run.car.body).reduce((a, l) => a + l.tiers.length, 0) });
  }
  return out;
}

export function buildCombos(run: RunState): BuildCombo[] {
  return activeCombos({ owned: run.trinkets, ups: run.up }).map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, text: c.text, needs: [reqName(c.a), reqName(c.b)] }));
}

export function buildView(run: RunState): BuildView {
  const trinkets: BuildTrinket[] = [];
  for (const o of run.trinkets) {
    const d = trinketById(o.id);
    if (!d) continue;
    const from = sources(run.got.filter((g) => g.what === 'trinket' && g.id === o.id));
    trinkets.push({ id: o.id, emoji: d.emoji, name: d.name, n: o.n, path: d.path, from: from.length ? from : ['Hittad på vägen'] });
  }
  trinkets.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'sv'));
  return { trinkets, trees: buildTrees(run), combos: buildCombos(run), mix: buildMix(run), ability: abilityOf(run) };
}

// ---- trophies and unlocks ----

export interface TrophyReason {
  text: string;
  n: number;
}

/** Why a run paid the trophies it did (the same rule as `trophiesFor`). */
export function trophyReasons(run: RunState, won: boolean): TrophyReason[] {
  const out: TrophyReason[] = [];
  if (run.stats.bossesBeaten) out.push({ text: `${run.stats.bossesBeaten === 1 ? 'En boss' : `${run.stats.bossesBeaten} bossar`} slagna`, n: run.stats.bossesBeaten * 2 });
  if (won) out.push({ text: 'Vann hela rundan', n: 3 });
  if (run.stats.races >= 3) out.push({ text: 'Körde minst tre lopp', n: 1 });
  return out;
}

export interface NextUnlock {
  what: string;
  need: number;
  have: number;
  /** The trophy count of the step before, for the bar. */
  from: number;
}

/** The next batch of new trinkets above `total` trophies (vehicles open through challenges now), or null when everything is open. */
export function nextUnlock(total: number): NextUnlock | null {
  const steps = new Map<number, string[]>();
  const add = (t: number, what: string): void => {
    if (t > 0) steps.set(t, [...(steps.get(t) ?? []), what]);
  };
  const byT = new Map<number, number>();
  for (const t of TRINKETS) if (t.unlock > 0) byT.set(t.unlock, (byT.get(t.unlock) ?? 0) + 1);
  for (const [t, n] of byT) add(t, `🎁 ${n} ${n === 1 ? 'ny pryl' : 'nya prylar'}`);
  const keys = [...steps.keys()].sort((a, b) => a - b);
  const need = keys.find((k) => k > total);
  if (need === undefined) return null;
  const from = [...keys, 0].filter((k) => k <= total).sort((a, b) => b - a)[0] ?? 0;
  return { what: steps.get(need)!.join(' + '), need, have: total, from };
}
