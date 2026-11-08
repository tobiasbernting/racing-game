# Galna Rallyt: plan

The 3D rally game from `lilla-garden` (`packages/arcade/src/games/rally`) becomes its own game here: a
roguelite in the spirit of Tape to Tape. The run structure, trinkets that change the rules, and silly
chaos are the point. It is for an adult and his 10-year-old son playing together, so it stays in Swedish, stays
forgiving, and gets *more* fun, not harder to get into. Tone: absurd, cheeky, random and bonkers (kebab magnets, flying cows, position swaps), like Tape to Tape; every run different
depending on the trinkets you get. A fart or two is fine, toilet humour is not the point; no swearing; never babyish. The rally stays in Lilla Gården too, untouched.

## Tech

- Vite + TypeScript (strict) + three.js, pnpm. No framework, plain DOM for menus.
- `server.mjs`: a dependency-free Node static server for `dist/`, port 8080, `GET /health` → 200.
- Progress (medals, best runs, a run in progress) in `localStorage`, versioned, wrapped in try/catch.
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
- 💀 **Elite race**: tougher rivals with their own trinkets, better reward (a talisman pick).
- 🛒 **Shop** (Mackens kiosk): buy trinkets, repairs, a reroll.
- 🔧 **Workshop**: upgrade a part, or swap the vehicle.
- ❓ **Event**: a silly choice ("En ko blockerar vägen…"), with a risky or safe outcome.
- 👑 **Boss**: a named rival with a gimmick on the road, one picked per act from a pool (phase 16: a rally steward who draws
  penalty zones, a golfer whose balls bounce, a co-driver with false signs; a footballer, an ice-machine goalkeeper and a bowler;
  a world champion or the joker Kapten Kanin on the moon). The first three (Sura Bengt, Ingrid, Frost-Frida) were replaced.

**Lives, not instant death**: the run has ❤️ hearts (start 3). Finishing in the bottom places or a DNF
costs a heart; 0 hearts ends the run. Forgiving but with stakes.

**Talismans** (formerly trinkets; the heart of it, aim for 40+), each one a small, loud rule change, with stacking and
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
a **soffa på hjul**. Stats: speed, grip, handling, weight, toughness. Drivers are people in helmets (phase 16 removed the animals); you drive as yourself.

**Courses**: the existing farm/forest/ice/beach/city/meadow/mountain themes, plus new ones that act
themes pick from (e.g. act 1 countryside, act 2 wild: desert/volcano/swamp, act 3 crazy: candy land,
the moon (low gravity), a kitchen with giant cereal). Procedural variation per node from a seed so
the same theme never plays exactly the same.

**Between runs (meta)**: 🏆 trophies from runs are a score and medals are achievements (since phase 14 nothing is locked: every vehicle and talisman is open from the start); helmet and
paint/liveries. A run summary screen shows the trinket build and the funniest stat ("Studsade 47 gånger").

**Polish**: big juicy feedback (screen shake, confetti, quack sounds), a seed shown for a run, pause,
volume, and the difficulty choice on the pick screen (Söndagsåkare, Normal, Hård, Ett liv; save key `calm` still reads as Söndagsåkare).

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
   twelve named rivals (twenty-one friendly rally and sports puns since phase 16) with trash talk and overtake taunts, meaner bosses, sharper events, a dark neon arcade look,
   fart and burp sounds with a green gas cloud, trinket triggers shown by a pulsing icon instead of a centred pop-up.
   Ids and save keys are unchanged.

### Next: two directions, and a car that grows (agreed with the owner after the first full playtest)

Playtest: a normal run was won comfortably, and the final race lapped the field. The player's car ends the
run strong, which is right; the rivals and courses must keep up. Design direction:

- **Ram vs Race.** Race nodes come in three kinds, shown on the map: 🏁 **Rally** (clean, technical racing),
  ⚖️ **Blandat** (racing with shoving) and 💥 **Blodbad** (mayhem: health bars, takedowns, wrecked cars out for
  a few seconds; the winner is decided by **points** for finishing position plus takedowns, so a rammer can
  win from 3rd). The path you choose biases the rewards, which is how you steer your build.
- **Rivals** are rammers, racers or in between, and they scale through the run: upgrades, trinkets of their
  own, sharper driving, catch-up when far behind. Act 3 must be a fight even with a strong build.
- **Upgrade paths**: two main trees, 🛡️ Ram (armour, mass, spikes, ram damage, shockwave) and 🏎️ Race
  (engine, grip, drift, nitro, aero), plus side paths that fit either: 🦨 **Fuffens** (dirty tricks: oil,
  mines, fart clouds, exploding fake coins), 🤸 **Stunt** (airtime, flips, two wheels and near misses fill
  nitro; ramps and shortcuts on courses) and 🤑 **Girig** (interest, bounty on the leader, wreck insurance,
  discounts). 🎲 **Kaos** is a flavour of legendary trinkets. Everything is tagged with its path; the summary
  shows the build mix; some cross-path combos give bonuses.
- **Vehicles**: 20 in total, 5 starters (rallybil, sandbuggy, pickup, moppe, traktor) and 15 unlocked by a
  mix of wins and challenges. Each has stats, a passive, an active ability on its own button, a starting
  trinket, and leans toward ram or race.
- **Manual shifting** as an option (default automatic, per device): gear display, rev bar, shift light,
  limiter, a small boost for a perfect shift; each vehicle has its own gearbox.
- **Heat levels** after a win: undecided (not built in phase 12 either; the owner has not decided).

6. **Two directions + difficulty**: Rally/Blandat/Blodbad nodes and courses, health and takedowns, ramming
   physics, Blodbad points, rival archetypes, rival scaling (upgrades, trinkets, driving, catch-up), harder
   courses later in a run, a cap on runaway trinket stacks, a race-time based balance simulation.
   Built: kinds on the map, Blodbad (health, wrecks, takedowns, points), ramming physics, archetypes and the scaling curve, harder
   courses (oil, potholes, a narrower road, three laps in act 3), soft caps, win rewards (pick 1 of 3, 2nd place a pick of 2),
   a stricter hearts rule in normal mode, a race-time balance simulation, and a lower, see-through gas cloud. Tone: chaos, not toilets.

6b. **Run result screen**: shown on a win and a loss: fun stats with a headline stat, a timeline of every node and
    placing, every reward and upgrade with where it came from, the build mix, abilities, unlocks earned.
    Built (see README). Touch devices no longer get easier rivals in normal mode, only in Söndagsåkare.
7. **Mobile controls** (touch devices only; desktop unchanged; see docs/mobile-controls-research.md): schemes
   Lätt (auto-throttle, default), Pedaler (gas + brake buttons) and Proffs (pedals + manual shifting); manual
   shifting also on keyboard/gamepad; a layout with room for the ability button and nitro, tablet insets,
   left-handed mirror, button size/opacity, maybe drag-to-move; haptics where the browser allows; no tilt steering
   (owner decision).
   Built (see README): the three schemes, a gearbox per vehicle (manual or automatic, limiter, bog, perfect shift, shift light),
   Q/E and LB/RB on desktop, a tested layout (tablet insets, safe areas, mirror, size/opacity, drag-to-move with reset),
   haptics, and a reserved ability slot.
8. **Vehicles with abilities**: passives, active ability button, starting trinkets, ram/race lean, 5 starters
   (rallybil, sandbuggy, pickup, moppe, traktor), 15 to unlock by a mix of wins and challenges.
   Built (see README): a kit per vehicle (lean, passive, active with cooldown and a charge ring on its button, starting trinket), F / gamepad Y /
   the touch button in every scheme, computer drivers using their actives, a data-driven challenge system (`src/run/unlocks.ts`, since phase 14 the medals in `src/run/medals.ts`) with progress in
   the meta save, an "UPPLÅST!" ribbon, old saves keep every vehicle, the pick screen and result screen show it all. 5 starters and 5 challenges now;
   phase 10 adds ten more entries.
9. **Art direction**: grittier, Tape to Tape-inspired: stronger contrast and colour grade, light outlines,
   dirt/scratches/damage on cars, drivers with helmets and race gear, courses with attitude (scrapyards, tyre
   walls, rowdy crowds, made-up sponsor boards), sparks and explosions, sticker/poster menus, rival collector cards.
   Built (see README, "Grövre look"): a post pass with a grade per course, vignette, grain and bloom on high, outline shells, sponsor decals and
   rival liveries, dirt that builds up and visible damage states, helmets and goggles, a trackside layer for every course (`attitude.ts`),
   sparks, debris and a fireball on wrecks, sticker/poster menus with collector cards, a new icon. The shared helpers are in `src/rally/look.ts`.
10. **Ten new vehicles**, in the new style: e.g. EPA-traktor, glassbil, sopbil, snöskoter, gokart, golfbil,
    åkgräsklippare, husbil, limousin, kundvagn med raketmotor.
    Built (see README, "Tio fordon till"): twenty vehicles in all (5 starters, 15 by challenge), ten new models in `src/rally/vehicles2.ts`, each with its own feel,
    gearbox, engine sound, lean, passive, active, starting trinket and challenge; rivals drive them by temper; a lean filter and a grid on the car pick; measured lap factors
    (`BODY_LAP`) in the balance simulation and a test over all twenty bodies.
11. **The car grows**: pick 1 of 3 upgrades, the Ram/Race trees and the Fuffens/Stunt/Girig side paths, visible
    mods on the car, cross-path combos, stunt ramps on courses; every run should feel different.
    Built (see README, "Bilen som växer"): five trees of upgrade lines with tiers and a capstone (`src/run/upgrades.ts`), two ability
    upgrades per vehicle, ten named combos shown as a small KOMBO! ribbon and a gold-rimmed icon, a win offers a pick of six (three trinkets or three
    upgrade cards, leaning on the race kind), Skruvhörnan sells nodes, the old part levels migrate into nodes (tested), dirty tricks on the road
    (oil, mines, fake coins, smoke), stunts (air, flips, near misses) that fill the nitro, bolt-on looks for all twenty bodies (`src/rally/modlook.ts`),
    the Bygget screen and the trees on the result screen, and a steeper rival curve to keep up. Stunt ramps on courses were left for phase 12.
12. **Derby arena + balance**: last-car-standing arena for elites and bosses, stunt ramps and shortcuts, playtest-driven balance.
    Built (see README, "Rivningsderby, stuntramper och balans"): the 🏟️ derby (a round bowl and a long oval with tyre walls, stands, floodlights and ramps; no laps,
    wrecks out for good, placing by elimination order, the most health when the 2:30 clock runs out), drivers that hunt or dodge, the map badge, pre-race line
    and result table; three kickers and a shortcut jump on every course (seeded, tested on every mirror and reverse variant); a balance pass that brought Ram up to Race
    (skrotpant: every fourth wreck gives a heart back, shoving in Blandat and Blodbad, a Blodbad Ingrid) with the numbers in `balance.test.ts`; looks for the five mods
    that showed nothing. Heat levels are still undecided and not built.

13. **Four difficulties**: chosen on the pick screen and remembered: 🛋️ Söndagsåkare (5 hearts, gentle rivals), 🏁 Normal (3), 🔥 Hård (2 hearts, hearts cost
    50 % more, boss wins heal nothing, Skrotpant every 6th wreck, 1,5× trophies) and 💀 Ett liv (1 heart, no heart purchases or heals, any heart lost ends the run,
    2× trophies). Badge on the map HUD, race cards and result; best act per difficulty in Skrytlådan. Built (see README, "Fyra svårigheter").

14. **Talismans, medals, seed codes**: "prylar" became **Talismaner** (display text only; ids and save keys unchanged); everything is unlocked from the first launch
    (all 20 vehicles, all talismans in every pool) and the challenge system became **Medaljer** (achievements in Skrytlådan with progress and a MEDALJ! ribbon; old progress
    and old vehicle unlocks migrate into medals); trophies stay as a score. **Seed codes** like `KOSSA-4821` (word + four digits), a collapsed "🌱 Frö" field on the car pick,
    the code with a copy button on the map and result, and a test that two different metas give identical runs for one code. **20 new talismans** (72 in all: ability tricks,
    weather, coin flips, derby and ramps) and two new combos. **Pop-ups** in the upper middle of the screen for talismans, abilities, passives and boosts (setting Mitten/Hörnet/Av).
    A compact car pick for a phone held upright. Built (see README, "Talismaner, medaljer och frökoder"). 

16. **Everyone is a person in a helmet** (owner decisions after a playtest with his ten-year-old):
    - **No animals.** `CarDriver` is only `human`; every driver, player and rival, wears a helmet and race overalls with a helmet design of their own in their livery colours
      (eight patterns, `CarStyle.helmet` / `helmetColor`; Kapten Kanin is a person in a costume helmet with long ears). Old animal drivers in saves read as a person with the default helmet.
    - **Rivals are friendly puns** on famous rally drivers and sports stars (21: nine Swedish rally greats, twelve from the world, all three driving styles, each with nickname, trash talk, taunt, livery, helmet and initials).
      The pre-race collector cards get a drawn SVG helmet portrait with the rival's colours and initials, and a green "Du" card first.
    - **New bosses**, a pool per act, one picked by the seed: 🏁 Tävlingsledaren Torsten (penalty zones, a time penalty), ⛳ Golf-Göran (bouncing golf balls), 🗺️ Tina Kartörner (false signs, a flipped minimap),
      ⚽ Fotbolls-Freddie (giant footballs across the road), 🏒 Målvakten Mats (an ice strip behind his ice machine), 🎳 Bowling-Berit (bowling balls down the road, pins), and in act 3 🏆 Världsmästaren
      (Sébastien Loebsedel or Stig Blomgrus: perfect line, nitro on every straight, plus a gimmick borrowed from another boss) or 🚀 Kapten Kanin on the moon. Sura Bengt, Ingrid Ingenväjning and Frost-Frida are gone;
      the medals that named them became "beat an act 1 boss" and "beat an act 2 boss" with the old progress migrated.
    - **You drive as yourself**: the driver picker is gone; "Vad heter du?" on the first launch and in Inställningar (max 16 characters, filtered by the language rules), a deterministic rally name suggestion
      (Turbo-Tobbe, Grus-Greta, Sladd-Sam, Lukas Lättfot) with a 🎲 button, the name in the standings, HUD, result, collector card and title, and a helmet pattern and colour next to the paint. Per device in the meta.
    Built (see README, "Alla är människor i hjälm"). Heat levels are still undecided.

**House rules for all text**: Swedish; no swearing or vulgar words (enforced by src/language.test.ts); toilet
humour only as an occasional random item, never the focus: the humour is unpredictable chaos.

Homelab (in parallel with phase 1): a `racing-game` role like Glantan's (private GHCR image,
`ghcr-login`, Watchtower, Traefik `rally.moderskepp.lan`, LAN only, Uptime Kuma labels), its playbook,
`first-setup.yml`, the Homepage tile and an ADR.

## Phase 17: playtest fixes

Four things from a full run by the owner and his son (adult and ten-year-old):
1. **Fighting must pay (Blodbad and Rivningsderby).** Asymmetric damage (the rammer's nose takes 20 %, a head-on 60 % each, a flank x1.5, a tail x1.3), points for damage dealt (0.5 per percent of a car's health) and wrecks (20) with a smaller part for the position (20/14/10/6/4/2), the derby decided on points, FEGIS in the derby only (ten quiet seconds, a red mark, boos, slow health drain; later removed from Blodbad, which is a race), computer cars that always fight, "+N" numbers and a points board.
2. **Money.** Lower prizes and coins, dearer nodes that rise 7 % per node in the build, the workshop sells a seeded shelf of two or three nodes, the kiosk three or four talismans. A good run ends with a third to half of one tree, never a full one.
3. **Map.** Every path holds at least three races (race, challenge, elite, derby), at most two other nodes and never a kiosk/workshop right after a kiosk/workshop.
4. **Rewards.** After every race a pick of three mixed cards (talismans and nodes), quality by placing: plain for the bottom half, normal, win, elite, boss. No tabs, no consolation prize.
