# Mobile racing touch controls: research for Galna Rallyt

Scope: phones/tablets only; desktop unchanged. Evidence quality is mixed: web search returned many low-quality blogs. Items marked **(unverified)** could not be confirmed from a reliable page. Items marked **(inference)** are my reasoning, not a sourced finding. Per-game button sizes/pixel placements were NOT found in any source; sizes below are recommendations, not measurements.

## 1. What the games do

| Game | Findings | Source |
|---|---|---|
| Asphalt 9 / Legends Unite | Three schemes: **TouchDrive** (default; game steers, you pick lane/route by swiping, time nitro, drift), **Tilt to Steer**, **Tap to Steer** (hold left/right side of screen). Tap to Steer called "easily the most accurate" with full accel/brake control, but needs one thumb held on screen to accelerate and "up to four fingers"; tilt "can be a very disappointing experience", sensitivity adjustable; drift and boost buttons stay reachable in tilt mode. Manual gearing exists only as tips on a blog (shift near redline) **(unverified for touch UI)**. Exact button layout not found. | [PocketGamer: control tips](https://www.pocketgamer.com/articles/078239/asphalt-9-legends-cheats-and-tips-how-to-take-full-control-of-your-car/), [PocketGamer: stripped-back controls](https://www.pocketgamer.com/articles/076788/r/), [Wikipedia-mirror overview](https://en.wikipedia.com/wiki/Asphalt_9) |
| Real Racing 3 | Reported ~7 configurations mixing tilt / on-screen wheel / buttons with auto or manual accel+brake; tunable steering sensitivity, assist toggles (ABS, TC, stability). Manual transmission mentioned by one source **(unverified)**; no touch shift UI found. Sources mostly low quality. | [Codemasters-style help for F1 Mobile (same genre pattern)](https://codemasters.helpshift.com/hc/en/3-f1-mobile-racing/faq/64-what-driving-controls-are-available), search results (low quality) |
| F1 Mobile Racing | Seven configs: tilt steer (auto or touch-side accel, touch brake), on-screen L/R buttons with auto accel and brake by touching screen middle, virtual wheel with auto or manual accel. Not every combination allowed. Settings via cog top-right. | [F1 Mobile help](https://codemasters.helpshift.com/hc/en/3-f1-mobile-racing/faq/64-what-driving-controls-are-available) |
| GRID Autosport (Feral, iOS) | "Arrow Touch": car auto-accelerates, hold anywhere to brake, steer with arrows; auto-accel can be enabled for Tilt/Wheel Touch only on easier difficulties. "Wheel Touch": wheel left, accelerate lower-right, brake upper-right, mirrored option for left-handers. Transmission-option FAQ text could not be retrieved **(unverified)**. | Search snippets via [Feral iOS control methods](https://support.feralinteractive.com/en/mac-linux-games/gridautosport/faqs/ios_control_methods) (redirects; FAQ answers not readable) |
| CarX Rally | Store listing: directional arrows, floating steering wheel, gyro steering **(unverified; listing text only)**. Manual gearbox is a setting in sibling CarX Drift Racing Online (Settings > Controls > Gearbox Type) -- that is a PC/console-oriented guide. | [racinggames.gg CarX settings](https://racinggames.gg/misc/carx-drift-racing-online-settings-tips-and-tricks/) |
| Rush Rally 3 | Marketed as fully customisable controls for touch and tilt; players split: some say touch layout is poorly laid out, others praise touch/tilt; MFi controller support. | [PocketGamer community thread](https://www.pocketgamer.com/rush-rally-3/app-army-assembles-rush-rally-3-gets-our-communitys-motor-running), [App Store](https://apps.apple.com/us/app/rush-rally-3/id1437096541) |
| Horizon Chase | Default: steer, gas, brake buttons with nitro near gas; **releasing accelerator auto-brakes**; 7+ alternative layouts, some accelerometer; "Auto Acceleration" mode: steer by touching far screen edges, tap elsewhere to brake (2015 forum post, may be outdated). | [TouchArcade thread](https://toucharcade.com/community/threads/horizon-chase-by-aquiris-game-studio.268949/page-3) |
| Mario Kart Tour | Auto-accelerate, no brake/reverse; swipe or hold to steer/drift, release for boost; "Smart Steering"/auto-item/gyro toggles. Gyro criticised (low sensitivity, awkward with touch drift). Beginner = plain steering, expert = drift swiping. | [PocketGamer custom controls](https://www.pocketgamer.com/mario-kart-tour/mario-kart-tour-cheats-tips-custom-control-settings-for-victory/), [Destructoid beta](https://www.destructoid.com/first-place-isnt-enough-in-mario-kart-tour/) |
| Need for Speed No Limits | Tilt or touch left/right; reviewer found motion unreliable, on-screen touch fine. | [Gamezebo](https://www.gamezebo.com/reviews/need-for-speed-no-limits-review-push-it-to-the-limit/) |
| Hill Climb Racing | Gas + brake pedals (one thumb each side) -- weak sourcing on layout **(unverified)**. | [desirabilitylab](https://desirabilitylab.com/2019/05/01/hill-climb-racing) |
| Dirt Rally / Colin McRae mobile, Rush Rally Origins | No usable sources found **(unverified)**. | -- |

### Cross-game patterns
- Almost everyone ships **multiple schemes** and lets players switch; auto-accelerate is the beginner/default, pedals are the "skilled" option.
- **Tilt is the most divisive**: repeatedly described as imprecise/unreliable (Asphalt, NFS, Mario Kart gyro), yet some fans prefer it and Rush Rally reviewers say it can feel good on bumpy rallies.
- Hold-anywhere / screen-half zones are common (F1 Mobile, GRID, Horizon Chase auto mode) because they need no precise aim.
- Releasing gas = auto-brake/engine-brake (Horizon Chase) is a friendly pedal design.
- Mirrored layout for left-handers exists in GRID. Opacity/size/drag customisation is claimed for Rush Rally 3 but no detail found.
- Multi-finger holds (Asphalt Tap-to-Steer) are criticised as a steep learning curve.
- Haptics, phone-vs-tablet specifics: no reliable game-specific sources found **(unverified)**.

## 2. Recommendations for Galna Rallyt

### (a) Schemes offered on touch devices
1. **Easy (default for the 10-year-old):** auto-throttle, left ◀ ▶, right brake/reverse + handbrake + nitro/ability. This is today's scheme; it matches Mario Kart/Asphalt TouchDrive/GRID Arrow Touch.
2. **Pedals (adult default):** manual throttle (see b), auto gears. Matches F1 Mobile/Horizon Chase/Wheel Touch.
3. **Pro:** pedals + manual shifting (see c).
4. **Optional toggle: Tilt steering** replacing the ◀ ▶ pair (see e); hidden behind "Experimental".
5. Option: mirrored layout (left-hander) and "steering zone" variant (whole left half of screen = steer by horizontal drag/hold) **(inference)**.
Assists independent of scheme: steering assist, auto-brake when releasing gas in Pedals mode.

### (b) Manual throttle
- Use a **big gas pedal button on the right thumb** (hold = throttle; optionally analogue by vertical position inside the pedal -- bottom=half, top=full, or just binary with ramp-up). Binary hold with smooth throttle ramp (~0.15 s) is simplest and robust. **(inference)**
- Brake/reverse is a **separate smaller pedal** above or beside gas. Don't use "press brake to accelerate". Releasing gas applies light engine braking (Horizon Chase precedent).
- Avoid 4-finger holds (Asphalt complaint): steer thumb + gas thumb only; brake, handbrake, nitro, ability should be taps on the same thumb that is already free, so keep gas thumb able to roll to them.
- Don't build an analogue slider as the primary: sliders need fine thumb travel and cause fatigue.

### (c) Manual shifting
- Two **shift buttons "+" / "-"** (or ▲▼) stacked on the **left edge of the right cluster or above the steer buttons' inner edge**, ~56-64 px (CSS) each, plus swipe up/down on the gas pedal as a secondary gesture **(inference)**.
- **Auto-clutch** (always); no clutch UI. Shift light: tach arc or LED strip at top-centre that goes green > amber > red flashing near redline; also a haptic/audio tick. Allow a "short-shift forgiveness" window and a hint arrow "shift now".
- Default off; show only in Pro. Auto gearbox still available as a fallback; if the player misses shifts at limiter, auto-upshift after 1 s in Easy/Pedals.
- Sources: no touch-specific manual-shift UX was found for the surveyed games (Asphalt shifting exists only as tips); this is design inference.

### (d) Ability + nitro without crowding
- Right cluster as arc around the right thumb's resting point: gas (largest, bottom-right), brake (left of gas), nitro (above gas, ~64 px), ability (above/left of nitro, ~64 px). Handbrake on the **left thumb's inner side** (above/next to ▶) or as a swipe-up on steer area, because holding steer + handbrake = drift is a two-thumb-free combo.
- Camera 🎥 moves to the top bar (small, 44 px, low emphasis), not in the thumb zones.
- Minimum touch target ~44-48 px per Apple/Google guidelines; use 56-72 px for frequent buttons **(general guidance; not from a racing source)**. Add ≥12 px gaps.

### (e) Tilt steering in a browser
- Works through `DeviceOrientationEvent` (`gamma`/`beta` depending on landscape orientation). On **iOS Safari (13+) you must call `DeviceOrientationEvent.requestPermission()` from a user gesture (click/touchend, reported as not touchstart) over HTTPS**; the user answer is cached by Safari. Calling on page load rejects. Sources: [Apple dev forum](https://developer.apple.com/forums/thread/128376), [yal.cc](https://yal.cc/js-device-motion/), [dev.to](https://dev.to/li/how-to-requestpermission-for-devicemotion-and-deviceorientation-events-in-ios-13-46g2). Android Chrome needs no prompt.
- Landscape orientation changes which axis you read; handle `screen.orientation.angle`; offer **calibrate (zero) button**, dead zone, sensitivity slider. Apps' record: tilt reviewed as imprecise and sometimes disappointing. Verdict: worth building as an **optional, off-by-default** mode only after buttons ship; low effort (~50 lines) but high QA cost. Not recommended for the child default.

### (f) Layout customisation worth building
Priority order: (1) **Button size** slider (S/M/L), (2) **Opacity** slider, (3) **Left-handed mirror** toggle, (4) **Drag-to-move** edit mode with Reset (store positions as % of viewport in localStorage). Rush Rally 3 and Horizon Chase set precedent. Keep one safe "Reset to default" button. Skip per-button rebinding.

### (g) Haptics in the browser
- `navigator.vibrate` works on Android Chrome/Firefox (needs a prior user gesture), but **is not supported on iOS Safari** (nor other iOS browsers, all WebKit). Confirmed by [caniuse Vibration API](https://caniuse.com/vibration) (Safari iOS: unsupported); the separate [caniuse mdn-api_navigator_vibrate](https://caniuse.com/mdn-api_navigator_vibrate) page showed a conflicting "supported" entry, likely a data error. See also [bugnet.io](https://bugnet.io/blog/fix-web-game-vibrate-api-not-available-ios-safari).
- iOS workaround: since iOS 18 Safari, programmatically clicking a label of a hidden `<input type="checkbox" switch>` triggers a system haptic ([ios-haptics npm](https://npmjs.com/package/ios-haptics), [azukiazusa](https://azukiazusa.dev/en/blog/ios-safari-web-haptics), [Ionic issue](https://github.com/ionic-team/ionic-framework/issues/29942)). Non-standard, fixed intensity, may break; must be inside a user gesture **(partially verified; not tested by me)**. Use as bonus only; always pair with visual/audio feedback (shift flash, tach, engine sound change). Provide a "Vibration" toggle.

### (h) Phone vs tablet
No reliable sources on this; recommendations are **inference**:
- Phones: thumbs reach ~bottom 40% of the screen at the corners; hands hold the device at the edges; keep clusters within ~20% width from each edge; compact HUD.
- Tablets: held with two hands lower-edge or on a stand/lap; corners are farther from thumbs, so **inset clusters ~8-12% from edges** and allow reasonable drag customisation; buttons may be cm-sized but cap physical size (~15-20 mm) so they stay thumb-coverable; tilt is awkward on a large tablet (heavier, often on stand) -> hide tilt or warn. Use `max(…, vmin)`-based sizing, and larger safe areas for notches (`env(safe-area-inset-*)`).
- Multi-touch: ensure `touch-action: none`, pointer events with capture per button so thumbs sliding between buttons don't drop input.

## 3. ASCII layouts (landscape)

### Layout A: Easy (phone, default for child)
```
+------------------------------------------------------------+
| [cam]                     SPEED / HUD              [pause] |
|                                                            |
|                                                            |
|                                                            |
|  [handbrk]                                      [ABILITY]  |
|  [ ◀ ][ ▶ ]                                 [NITRO] [BRAKE]|
+------------------------------------------------------------+
   left thumb: steer              right thumb: nitro/brake/ability
   (throttle automatic)
```

### Layout B: Pedals (phone, adult)
```
+------------------------------------------------------------+
| [cam]            tach / shift light            [pause]     |
|                                                            |
|                                         [ABILITY] [NITRO] |
|  [handbrk]                                                 |
|  [ ◀ ]  [ ▶ ]                           [BRAKE] [  GAS   ] |
|                                                [  (big)  ] |
+------------------------------------------------------------+
```

### Layout C: Pro with shifting (tablet, inset from edges)
```
+------------------------------------------------------------------+
| [cam]               tach arc + gear + shift light       [pause]  |
|                                                                  |
|                                                                  |
|                                                   [ABILITY]      |
|                                      [HBRK]       [NITRO]        |
|      [ ◀ ]   [ ▶ ]      [ - ] [ + ]    [BRAKE]  [   GAS   ]     |
|                          shift                               |
+------------------------------------------------------------------+
   (clusters inset ~10% from edges; shift pair near right thumb's
    reachable inner edge)
```
Left-handed mode mirrors A-C horizontally (precedent: GRID Wheel Touch mirrored layout).

## 4. Caveats
- Button size/placement and haptics data for the named games were not found; recommendations are design inference plus the sourced patterns above.
- Many search results were SEO blogs; weight the PocketGamer, TouchArcade, Destructoid, Codemasters/Feral help pages higher.
- Not verified by testing: iOS `switch` haptic trick, tilt axis handling on all devices.
