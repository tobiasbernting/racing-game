# Galna Rallyt

Ett 3D-rallyspel i webbläsaren (three.js): kom först i mål mot gårdens djur på sju banor. Det är
en egen fristående version av rallyt från Lilla Gården och ska bli en roguelite (se [PLAN.md](PLAN.md)).
Fas 1 var porten (ett lopp på dator, surfplatta och mobil), fas 2 gjorde det till en roguelite: en runda är tre
akter med varsin förgrenad karta och en boss, och på vägen samlar man galna prylar. Fas 3 (den här) lägger till
fem nya fordon, fem nya banor, banor som ser olika ut varje gång, fler prylar, händelser och en ny boss.

Styrning: piltangenter/WASD, mellanslag = handbroms, L = nitro, C = kamera, R = tillbaka på vägen,
Escape = paus. Handkontroll och pekknappar på skärmen fungerar också.

## Så fungerar en runda

- **Titel**: Ny runda, Fortsätt runda (rundan sparas i localStorage efter varje plats), Snabbrace (ett enda lopp som förr),
  Samling (upplåsta bilar och sedda prylar) och Lugnt läge (5 hjärtan i stället för 3 och snällare rivaler).
- **Karta**: tre akter (Landsbygden, Vildmarken, Galna stan), fem rader med 2–4 platser och sedan en boss. Platserna är
  🏁 lopp, ⏱️ utmaning (vinn på 2 varv, topp 2 i regn, nattrace, slå tiden), 💀 elitlopp, 🛒 Mackens kiosk, 🔧 verkstad,
  ❓ händelse och 👑 boss (Bonden Bengt med höbalar, Älgen Ingrid som hoppar, Isdrottningen med isig väg).
- **Hjärtan och kronor**: kommer man sist (nedersta tredjedelen) eller bryter förlorar man ett hjärta; vid 0 är rundan slut.
  Loppen ger kronor (pris + mynt på banan + prylbonus, skalat per akt) som går till kiosken (prylar, laga bilen, läka
  hjärta, nya varor) och verkstaden (en gratis uppgradering av en del, eller måla om).
- **Prylar** (`src/run/trinkets.ts`, 48 st): vanlig/ovanlig/legendarisk, samma pryl två gånger gör den starkare. Varje pryl är
  data: `tune` ändrar siffror när loppet startar, `hooks` reagerar på tick/boost/sladd/stöt/varv/pickup/mål, `perk` ändrar
  rundan (rabatt, hjärtan, fler val). Loppet får dem som `RallyOptions.mods` (`src/rally/mods.ts`); bossarnas trick går via
  `RallyOptions.twist`. Lägg till en pryl genom att lägga till en rad i listan.
- **Troféer** 🏆 efter varje runda (2 per besegrad boss, 3 för seger) låser upp fordon (pickup 3, moppe 4, fyrhjuling 6,
  sportbil 8, traktor 11, motorcykel 13, monstertruck 15, soffbil 20) och lägger fler prylar i potten.
- Rundan är deterministisk från ett frö: kartor, kioskens varor och händelsernas utfall räknas ut från fröet och behöver
  aldrig sparas.

## Fordon, banor och variation (fas 3)

- **Fordon** (`CAR_BODY_DEFS` i `src/shared/rally.ts`, modeller i `src/rally/vehicles.ts`): varje kropp har en `feel` som
  `car.ts` läser (massa, styrning, tröghet, toppfart, grepp på grus och gräs, lutning, två hjul).
  🛞 **Fyrhjuling**: lätt och yr, älskar grus och hopp. 🏍️ **Motorcykel**: väldigt snabb, lutar sig i kurvorna, har mindre grepp
  och ramlar på ett komiskt sätt vid en stor smäll (föraren gör en volt, sen är man på hjulen igen). 🛵 **Moppe**: långsam men
  vig, med korg och en hög ring-ring-klocka (H tutar, och den ringer själv bakom andra bilar). 🚜 **Traktor**: seg, tung och
  oåterkallelig: puttar undan andra bilar och bryr sig knappt om bananskal och höbalar. 🛋️ **Soffbil**: en soffa på hjul med kuddar,
  lampa och kaffekopp. Förarna (djuren också) sitter ovanpå. Varje fordon har egen motorklang (`audio.ts`) och egen tuta, och
  datorförarna kör dem ibland också.
- **Banor** (`src/rally/courses-wild.ts`, scenerin i `src/rally/wild.ts`): 🏜️ Öknen (dyner, kaktusar, kamel, oas), 🌋 Vulkanen
  (svart sten, lavasjö, rykande krater), 🍭 Godislandet (klubbor, chokladflod, pepparkakshus), 🌙 Månen (kratrar, stjärnhimmel
  med jorden, låg tyngdkraft för alla) och 🥣 Köket (ett jättebord med rutig duk, flingor, muggar och sylt). Akt 2 drar mest
  öknen och vulkanen, akt 3 godis, månen och köket, blandat med de gamla (`ACT_COURSES` i `src/run/map.ts`).
- **Variation** (`src/shared/variation.ts`, `src/rally/variant.ts`): från platsens frö (snabbracet får ett eget) kan banan
  speglas och/eller köras åt andra hållet, rekvisitan tätare eller glesare, marken och träden få en nyans, och dag/natt och
  regn väljs (aldrig regn på månen, i köket eller i öknen). Pads, mynt och höbalar placeras också från fröet.
- **Bossar**: Bonden Bengt kör traktor och släpper höbalar, Älgen Ingrid kör fyrhjuling och hoppar, Isdrottningen gör vägen
  isig (akt 2 har Ingrid eller Isdrottningen, fröet väljer) och **Kapten Kanin** kör soffa på månen i jättehopp (akt 3).
- **Prylar för fordonen**: Sidvagn (motorcykel), Turbofläkt (traktor), Ringklocka i guld (moppe), Ångvisslan, Fordonskarusellen
  (byter fordon varje varv) med flera. `buildMods(owned, body)` låter en pryl veta vilket fordon man kör.

## Enheter och finish (fas 4)

- **Dammet** på grus och sand är lätt och kortlivat, och tonas ut mellan kameran och spelarens egen bil (`Particles.setViewer`).
- **Pek och enheter**: kontrollerna ligger utanför minikartan och pausknappen (alla knappar ≥ 44 px), respekterar safe-area, flera
  fingrar fungerar samtidigt (styr + handbroms), tryck på menyer startar aldrig racing. Första tryck: ljudet vaknar och mobil/surfplatta
  går till helskärm där webbläsaren tillåter det (på iPhone: tips om att lägga till på hemskärmen). Ingen dubbeltrycks-zoom, inga
  långtrycksmenyer, ingen textmarkering. `public/manifest.webmanifest` + ikoner (`public/icon.svg`, PNG) och apple-meta gör att
  spelet kan läggas på hemskärmen och köra i helskärm.
- **Prestanda**: `quality: 'low'` (pek/små skärmar) har inga skuggor, färre partiklar, tunnare rekvisita och lägre pixelratio, och
  loppet sänker upplösningen själv om bildfrekvensen sjunker (`adapt()` i `src/rally/index.ts`).
- **Inställningar** (`src/settings.ts`, från titeln och pausmenyn): ljudvolym, musik, skakningar, lugnt läge, visa FPS, helskärm.
- **Fest**: konfetti vid vinst, "NY PRYL!" med fanfar, kronorna räknas upp på resultatkortet, räknarpip, kameraskak (kan stängas av).
- **Slutskärm**: fordon och förare, prylarna, rundans roligaste siffra, troféer och vad som låstes upp. Rundans frö (`Frö: …`)
  visas smått på kartan och i summeringen.
- **Sparning**: en avslutad runda ligger kvar sparad (med `end`) tills summeringen lämnas, så en omladdning på det sista
  resultatkortet visar slutskärmen igen och räknar troféerna bara en gång.
- **Balans** (`src/run/balance.test.ts`): simulerade rundor med spelare av olika skicklighet. Lugnt läge: bara bryta eller sist
  kostar ett hjärta, bossar läker två hjärtan. Ett hjärta i kiosken kostar ungefär ett lopps lön och är en fjärdedel billigare på
  sista hjärtat.

## Utveckling

```sh
pnpm install
pnpm dev          # Vite på http://localhost:5173 (nås även från mobilen på nätet)
pnpm typecheck
pnpm test         # vitest
pnpm build        # bygger dist/
node server.mjs   # serverar dist/ på PORT (standard 8080), GET /health -> ok
```

Kod: `src/rally/` (spelet), `src/shared/` (bilar, banor, regler, priser), `src/arcade/` (loop, input, ljud,
GameContext), `src/run/` (rena regler för rundan: karta, prylar, ekonomi, händelser, sparning, meta), `src/ui/` (skärmarna)
och `src/app.ts` (skalet: paus, pekkontroller, flödet mellan skärmar och lopp). Ett lopp startas med `RallyOptions`
(`src/rally/options.ts`) och rapporterar `RallyResult` via `onDone`.

Dev-bygget har också `window.__rallyDebug` (`tumble()`, `honk()`, `swap(kropp)`) under ett lopp. För tester finns `window.__app` med `fakeFinish()` (avslutar loppet direkt med ett påhittat resultat), `debugRun()`,
`debugEnter(typ)` och `debugMeta()`. I dev-bygget finns dessutom `?rallydebug&rallyauto&rallyturbo=30&rallygo` som låter
datorn köra bilen i hög hastighet.

## Deploy

GitHub Actions (`.github/workflows/docker.yml`) bygger en Docker-image: på push till `main` pushas
`ghcr.io/tobiasbernting/racing-game:latest` och `:<sha>`, på pull requests byggs den bara. Paketet är
privat (inställning på GitHub). Containern kör som `node`, lyssnar på 8080 och har en HEALTHCHECK mot
`/health`. På hemmaservern körs den som `rally.moderskepp.lan` (Traefik, endast LAN).

```sh
docker build -t racing-game .
docker run --rm -p 8080:8080 racing-game
```
