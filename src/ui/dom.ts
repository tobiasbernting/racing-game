// Tiny DOM helpers for the menus (no framework).
export type Kid = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string | null, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const k of kids) if (k !== null && k !== undefined && k !== false) e.append(k);
  return e;
}

/** A button that runs `onClick` (never submits, never scrolls the page into view when focused). */
export function btn(cls: string, label: Kid | Kid[], onClick?: () => void): HTMLButtonElement {
  const b = el('button', cls);
  b.type = 'button';
  for (const k of Array.isArray(label) ? label : [label]) if (k !== null && k !== undefined && k !== false) b.append(k);
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

export const span = (cls: string | null, text: string): HTMLSpanElement => el('span', cls, text);

/** Swedish plural: "1 hjärta", "2 hjärtan". */
export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** Moves focus between the enabled buttons of a card with the arrow keys (Enter presses the focused one). */
export function arrowNav(root: HTMLElement, e: KeyboardEvent): boolean {
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
  if (!keys.includes(e.code)) return false;
  const list = [...root.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]')].filter((b) => b.offsetParent !== null);
  if (!list.length) return false;
  const cur = list.indexOf(document.activeElement as HTMLElement);
  if (cur < 0) {
    list[0]!.focus({ preventScroll: true });
    return true;
  }
  // nearest button in the pressed direction by position, else step through the list
  const r0 = list[cur]!.getBoundingClientRect();
  const cx = r0.left + r0.width / 2;
  const cy = r0.top + r0.height / 2;
  const dx = e.code === 'ArrowLeft' ? -1 : e.code === 'ArrowRight' ? 1 : 0;
  const dy = e.code === 'ArrowUp' ? -1 : e.code === 'ArrowDown' ? 1 : 0;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  list.forEach((b, i) => {
    if (i === cur) return;
    const r = b.getBoundingClientRect();
    const vx = r.left + r.width / 2 - cx;
    const vy = r.top + r.height / 2 - cy;
    const along = vx * dx + vy * dy;
    if (along <= 4) return;
    const across = Math.abs(dx ? vy : vx);
    const score = along + across * 2.2;
    if (score < bestScore) {
      bestScore = score;
      best = b;
    }
  });
  const target: HTMLElement = best ?? list[(cur + (dx + dy > 0 ? 1 : -1) + list.length) % list.length]!;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return true;
}
