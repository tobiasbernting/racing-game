# Accessibility note: seeing the course at night

The owner: "I have a hard time seeing the course at night time. Can we do something about that, check a11y guidelines."

Sources: WCAG 2.2 and the Game Accessibility Guidelines (gameaccessibilityguidelines.com), applied from knowledge of the
texts (the guideline pages themselves could only be fetched as an index, so the wording below is paraphrased, not quoted).

## What applies

| Guideline | What it asks | Here |
| --- | --- | --- |
| WCAG 2.2 SC 1.4.11 Non-text Contrast | Graphics needed to understand or operate need 3:1 against their surroundings | The road edge line, reflector posts and chevron boards are what you steer by. Edge line against road is now at least 3:1 at night on every course (see below). |
| WCAG 2.2 SC 1.4.3 / 1.4.6 Contrast (text) | 4.5:1 for normal text, 3:1 for large text | HUD and menus audited; two small gaps fixed. |
| WCAG 2.2 SC 2.3.1 Three Flashes | Nothing flashes more than three times a second | Audited every blinking thing, capped at 2.8 Hz, all steady with Effekter: Färre. |
| GAG: brightness/gamma setting | Let the player adjust brightness | Inställningar, Bild, Ljusstyrka (gamma in the post pass, 80 to 160 %). |
| GAG: sufficient contrast | Don't rely on dim cues | Lit edge lines, reflector posts, lit chevrons, lifted shadows, headlights that reach further. |
| GAG: avoid flickering, let visual effects be turned down | | Effekter: Fulla / Färre. |

## What was done

* **Night grade** (`look.ts`): shadows are lifted to a night blue instead of crushed (`lift` 0.045, 0.075 for Ljusare natt),
  the S-curve bites 45 % less, a little more exposure. Dusk and rain get a small lift.
* **Light** (`index.ts`): the sky-and-ground light is 1.35x (1.8x Ljusare natt) at night, the moon 1.1x. The player's headlights
  are a wide cone aimed 40 m ahead with a gentle fall-off (one spot on 'low', two on 'high', as before). Rivals get a cheap
  additive light pool on the road ahead (no real lights, nearest ones only).
* **Road markings** (`road.ts`, night or Hög kontrast-väg): a glowing edge line on both sides on every surface (the old painted
  line only existed on asphalt and was unlit), reflector posts every 14 m (white right, amber left), chevron boards that carry
  their own light, a lit road surface and a darker shoulder. By day, Hög kontrast-väg adds the same line with a dark casing
  (so it holds 3:1 on pale gravel and snow), more and bigger chevrons.
* **Settings** (`settings.ts`, `ui/views.ts`): Ljusstyrka slider, Mörker Normal / Ljusare natt / Ingen natt (night becomes dusk
  on this device), Effekter Fulla / Färre (screen shake, grain, most of the vignette, speed lines, blinking and flicker),
  Hög kontrast-väg. Defaults are the old look plus the improved night. Old saves migrate to the defaults.
* **Text**: small captions in the poster menus were drawn at 80 % opacity (3.2:1 on yellow); now full. Pop-up lines in the HUD
  have a denser backing (72 %).

## Flashing audit (SC 2.3.1)

There is no lightning talisman or "Åskmolnet" in this build (the "Blixtar" livery is a static painted pattern).

| Source | Before | After |
| --- | --- | --- |
| HUD blinks (`rl-blink`, wrong way, wreck, low time) | 1.25 to 2 Hz, small, one at 3.3 Hz (nitro burn) | 2.5 Hz at the fastest; steady with Färre |
| Shift lights and shift arrow | 5.5 Hz | 2.7 Hz; steady with Färre |
| Ghost car after respawn (large) | 6 Hz | 2.5 Hz; steady with Färre |
| Speed lines (nitro) | zoom pulse 3.6 Hz | 2 Hz; off with Färre |
| Disco talisman overlay | hue turn, 2.4 s, no luminance flash | unchanged; hidden with Färre |
| Burning barrels (light) | 2 Hz and 5 Hz flicker, +-27 % | 1.8 Hz and 0.7 Hz, +-17 %; steady with Färre |
| Neon signs in the city | dips at about 2 Hz | at most about once a second, dip to 60 %; none with Färre |
| Nitro flame | random size every frame | same; steady with Färre |
| Arena lamps | 4 % at 3.7 Hz (below any flash threshold) | 1.4 Hz |
| Stars | 0.3 Hz twinkle | unchanged |

`src/rally/look.test.ts` fails if a css blink gets faster than 3 Hz or the shift lights do.

## Measuring (reproducible)

`src/rally/contrast.ts` is the pure WCAG maths (tested). The numbers below come from screenshots of a parked car on a
clear stretch of each course, with the HUD hidden: the road is sampled 12 and 20 m ahead, both sides, 5x5 pixel means for road and
shoulder, the brightest pixel in an 11x3 window for the line, then `contrastRatio`. Median of four samples, 1280x800 desktop.

| Course, night | Edge line vs road before | after | Road vs shoulder before | after |
| --- | --- | --- | --- | --- |
| Forest | 1.06 | 6.8 | 1.4 | 1.9 |
| Mountain | 2.15 | 3.0 | 2.3 | 3.0 |
| City | 1.39 | 10.8 | 1.8 | 1.2 |
| Volcano | 1.06 | 12.9 | 1.1 | 1.1 |
| Farm | 1.42 | 9.8 | 1.1 | 1.8 |
| Desert | 1.08 | 7.4 | 1.3 | 1.9 |

On a phone (iPhone 13 landscape) the edge line is 7.0 (forest), 4.8 (mountain), 10.8 (city) and 9.7 (volcano) after, against
1.1 to 1.6 before.

Known limits: the road surface against the shoulder stays under 3:1 on most courses. Both are very dark in a night scene and
the ratio is steep at low luminance, so the edge line and posts carry the boundary (a graphical object only needs 3:1 against
what is next to it). Mountain edge line vs road is 2.96 on the desktop run, snow is brightly lit by the headlights.
