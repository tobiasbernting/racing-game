# Galna Rallyt: plan

The 3D rally game from `lilla-garden` (`packages/arcade/src/games/rally`) becomes its own game here: a
roguelite in the spirit of Tape to Tape. The run structure, trinkets that change the rules, and silly
chaos are the point. It is for an adult and his 10-year-old son playing together, so it stays in Swedish, stays
forgiving, and gets *more* fun, not harder to get into. Tone: absurd, cheeky, gross-out funny (fart boosts, kebab
magnets, sock gas), like Tape to Tape; never babyish. The rally stays in Lilla Gården too, untouched.

## Tech

- Vite + TypeScript (strict) + three.js, pnpm. No framework, plain DOM for menus.
- `server.mjs`: a dependency-free Node static server for `dist/`, port 8080, `GET /health` → 200.
- Progress (unlocks, best runs, a run in progress) in `localStorage`, versioned, wrapped in try/catch.
- Dockerfile (multi-stage, node:24-alpine, runs as `node`, HEALTHCHECK on /health).
- `.github/workflows/docker.yml`: on push to main builds and pushes `ghcr.io/tobiasbernting/racing-game`
  (`:latest` and `:<sha>`), PRs only build. The package stays private (GitHub package setting).
- `pnpm test` (vitest) for the pure logic: map generation, trinket effects, economy, save migration.
- Works on phone, tablet and computer: touch controls (left/right, brake, handbrake, boost), keyboard,
  gamepad; menus usable with thumbs; `quality: 'low'` on small/touch devices; landscape hint on phones
  held upright; no page scroll or zoom; safe-area insets.

## Game

**A run** (≈15–25 min): a branching map of 3 *acts*, each ~6 node rows ending in a boss race. Pick a
path, as in Tape to Tape / Slay the Spire. Node types:
- 🏁 **Race**: 3 laps vs AI. Placing earns 💰 kronor; finishing last-but-not-DNF still moves on.
- ⏱️ **Time trial / challenge**: beat a target time, drift-points, smash N haybales, collect coins.
- 💀 **Elite race**: tougher rivals with their own trinkets, better reward (a trinket pick).
- 🛒 **Shop** (Mackens kiosk): buy trinkets, repairs, a reroll.
- 🔧 **Workshop**: upgrade a part, or swap the vehicle.
- ❓ **Event**: a silly choice ("En ko blockerar vägen…"), with a risky or safe outcome.
- 👑 **Boss**: a named rival with a gimmick (Bonden Bengt drives a tractor and drops hay; Älgen Ingrid
  jumps across the road; Isdrottningen makes the road icy).

**Lives, not instant death**: the run has ❤️ hearts (start 3). Finishing in the bottom places or a DNF
costs a heart; 0 hearts ends the run. Forgiving but with stakes.

**Trinkets** (the heart of it, aim for 40+), each one a small, loud rule change, with stacking and
synergies, rarity common/rare/legendary, emoji icon + a short Swedish line. Examples:
- Gummianka på huven: every bump makes you bounce higher (and quack).
- Raketkorv: boost is twice as long, but the car goes in a wiggly line.
- Magnet-ko: kronor fly to you from across the track.
- Studsmatta-däck: hitting a wall bounces you *forward*.
- Spökbil: drive through other cars for 3 s after a boost.
- Bananskal-släp: drop banana peels behind you that make AI spin.
- Jättehjul: wheels double in size, more grip off-road.
- Tvättbjörns-turbo: drifting fills boost 3× faster.
- Kanon-avgasrör: boost shoots a confetti cannon that pushes cars aside.
- Pannkaksvägen: the leader's car gets flat for 2 s at random.
- Discokula: lights, music change, +10 % kronor.
- Hoppfjädrar: press handbrake while straight to jump.
- Tidsvrida (legendary): the first lap's time is halved.
Effects are implemented as hooks on a small effect bus (onTick, onBoost, onDrift, onHit, onLap,
onFinish, onPickup, raceStart modifiers…), so trinkets stay data + a few functions.

**Vehicles** (unlock between runs, each plays differently): the old hatch/buggy/pickup/coupe/monster
cars, plus **fyrhjuling** (ATV: twitchy, jumps well), **motorcykel** (lean, fast, falls off on big hits),
**moped** (slow, very nimble, has a basket, the funny one), **traktor** (slow, unstoppable), and maybe
a **soffa på hjul**. Stats: speed, grip, handling, weight, toughness. Drivers stay the farm animals.

**Courses**: the existing farm/forest/ice/beach/city/meadow/mountain themes, plus new ones that act
themes pick from (e.g. act 1 countryside, act 2 wild: desert/volcano/swamp, act 3 crazy: candy land,
the moon (low gravity), a kitchen with giant cereal). Procedural variation per node from a seed so
the same theme never plays exactly the same.

**Between runs (meta)**: 🏆 trophies from runs unlock vehicles, trinkets into the pool, drivers,
paint/liveries. A run summary screen shows the trinket build and the funniest stat ("Studsade 47 gånger").

**Polish**: big juicy feedback (screen shake, confetti, quack sounds), a seed shown for a run, pause,
volume, and a "Söndagsåkare" mode (easy mode, save key `calm`) toggle that gives 5 hearts and slower AI.

## Phases (each its own PR, merged when it builds, tests pass and the game runs)

1. **Port**: stand the rally up here as a standalone Vite app: copy the rally game, the bits of the
   arcade (`kit`, `input`, `sfx`, touch controls from `shell`) and the shared rally types it needs;
   drop online/remote and Rallyvärlden coupling; single race playable on desktop and touch. Server,
   Dockerfile, CI, tests scaffold, README.
2. **Roguelite core**: run state, seeded map, node screens, hearts, kronor, shop, events, bosses,
   trinket system + first ~25 trinkets, save/resume, meta unlocks.
3. **Vehicles and courses**: ATV, motorcycle, moped, tractor (models, physics tunes), new course
   themes, procedural variation, more trinkets (to 40+), bosses with gimmicks.
4. **Devices and polish**: phone/tablet layouts checked in Playwright at phone, tablet and desktop
   sizes, performance on low quality, juice, balancing, run summary.

5. **Rebrand**: the voice for an adult and a 10-year-old (Tape to Tape style): new names and lines for all trinkets,
   twelve named rivals with trash talk and overtake taunts, meaner bosses, sharper events, a dark neon arcade look,
   fart and burp sounds with a green gas cloud, trinket triggers shown by a pulsing icon instead of a centred pop-up.
   Ids and save keys are unchanged.

Homelab (in parallel with phase 1): a `racing-game` role like Glantan's (private GHCR image,
`ghcr-login`, Watchtower, Traefik `rally.moderskepp.lan`, LAN only, Uptime Kuma labels), its playbook,
`first-setup.yml`, the Homepage tile and an ADR.
