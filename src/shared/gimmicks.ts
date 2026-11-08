// The tricks a boss plays on the road, as data: what each is called and what it does. The race builds the meshes and
// the hits (rally/gimmicks.ts); the boss cards and the pre-race box read the words from here.

export const GIMMICK_IDS = ['penalty', 'golf', 'signs', 'football', 'ice', 'bowling'] as const;
export type GimmickId = (typeof GIMMICK_IDS)[number];

export interface GimmickDef {
  id: GimmickId;
  emoji: string;
  name: string;
  /** One line for the pre-race card. */
  text: string;
  /** Seconds between the boss's tries, and the shape of the trick (see rally/gimmicks.ts). */
  every: number;
}

export const GIMMICKS: Record<GimmickId, GimmickDef> = {
  penalty: { id: 'penalty', emoji: '🚩', name: 'Straffzoner', text: 'Visselpipan går och ett rött fält ritas på vägen. Kör genom det och du bromsas och får 2 sekunders straff.', every: 7 },
  golf: { id: 'golf', emoji: '⛳', name: 'Golfbollar', text: 'Bollar slås ut på banan och studsar. Blir du träffad snurrar du.', every: 3.6 },
  signs: { id: 'signs', emoji: '🪧', name: 'Falska skyltar', text: 'Skyltar med pilar sätts upp åt fel håll, och ibland snurrar minikartan runt. Lita inte blint på någon.', every: 6 },
  football: { id: 'football', emoji: '⚽', name: 'Jättebollar', text: 'Enorma fotbollar skjuts tvärs över vägen. Titta efter den som ligger och väntar vid kanten.', every: 4.4 },
  ice: { id: 'ice', emoji: '🧊', name: 'Isremsa', text: 'Bossen lämnar en hal isremsa efter sig. Kör bredvid den.', every: 0.6 },
  bowling: { id: 'bowling', emoji: '🎳', name: 'Bowlingklot', text: 'Tunga klot rullar nerför backen mot dig, och käglor står på vägen.', every: 3.8 },
};

/** The tricks a world champion may borrow from the other bosses (all of them), picked from the node's seed. */
export const BORROWED: readonly GimmickId[] = GIMMICK_IDS;
