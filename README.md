# Galna Rallyt

Ett 3D-rallyspel i webbläsaren (three.js): kom först i mål mot en gäng galna förare på tolv banor. Spelet är gjort för en vuxen och en tioåring som spelar tillsammans: absurt, oförutsägbart och bonkers: ingen runda blir den andra lik, det beror på vilka prylar du råkar få (korvkanoner, flygande kor, plats­byten mitt i farten, en och annan prutt). Det är
en egen fristående version av rallyt från Lilla Gården och ska bli en roguelite (se [PLAN.md](PLAN.md)).
Fas 1 var porten (ett lopp på dator, surfplatta och mobil), fas 2 gjorde det till en roguelite: en runda är tre
akter med varsin förgrenad karta och en boss, och på vägen samlar man galna prylar. Fas 3 (den här) lägger till
fem nya fordon, fem nya banor, banor som ser olika ut varje gång, fler prylar, händelser och en ny boss.

Styrning: piltangenter/WASD, mellanslag = handbroms, L = nitro, **F = fordonets förmåga** (handkontroll Y), C = kamera, R = tillbaka på vägen,
Escape = paus, E / Q = växla upp / ned (om du slagit på Manuell växling). Handkontroll (RB / LB växlar) och pekknappar på skärmen
fungerar också. Pekkontrollerna finns i tre sorter, se "Kontroller och växlar" nedan.

## Så fungerar en runda

- **Titel**: Ny runda, Fortsätt runda (rundan sparas i localStorage efter varje plats), Snabbrace (ett enda lopp som förr),
  Skrytlådan (upplåsta bilar och sedda prylar) och Söndagsåkare (5 hjärtan i stället för 3 och snällare rivaler).
- **Karta**: tre akter (Bondlandet, Vildmarken, Galna stan), fem rader med 2–4 platser och sedan en boss. Platserna är
  🏁 lopp, ⏱️ utmaning (vinn eller skäms, topp 2 i spöregn, mörkerrallyt, slå klockan), 💀 dödslopp, 🛒 Mackens kiosk, 🔧 Skruvhörnan,
  ❓ helt random och 👑 boss (Sura Bengt med höbalar, Ingrid Ingenväjning som hoppar, Frost-Frida med isig väg, Kapten Kanin på månen).
  Tolv rivaler med eget skryt och eget hån när de kör om dig (`src/shared/rivals.ts`).
- **Hjärtan och kronor**: kommer man sist (nedersta tredjedelen) eller bryter förlorar man ett hjärta; vid 0 är rundan slut.
  Loppen ger kronor (pris + mynt på banan + prylbonus, skalat per akt) som går till kiosken (prylar, laga bilen, läka
  hjärta, nya varor) och verkstaden Skruvhörnan (en gratis uppgradering på nivå I eller II, resten för kronor, eller måla om).
- **Prylar** (`src/run/trinkets.ts`, 52 st): vanlig/ovanlig/legendarisk, samma pryl två gånger gör den starkare. Varje pryl är
  data: `tune` ändrar siffror när loppet startar, `hooks` reagerar på tick/boost/sladd/stöt/varv/pickup/mål, `perk` ändrar
  rundan (rabatt, hjärtan, fler val). Loppet får dem som `RallyOptions.mods` (`src/rally/mods.ts`); bossarnas trick går via
  `RallyOptions.twist`. Lägg till en pryl genom att lägga till en rad i listan.
- **Troféer** 🏆 efter varje runda (2 per besegrad boss, 3 för seger) lägger fler prylar i potten. Fordon låses upp med
  utmaningar, se "Fordon med förmågor" nedan.
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
- **Inställningar** (`src/settings.ts`, från titeln och pausmenyn): ljudvolym, musik, skakningar, söndagsåkare (lugnt läge, sparnyckeln heter fortfarande `calm`), visa FPS, helskärm.
- **Fest**: konfetti vid vinst, "NY PRYL!" med fanfar, kronorna räknas upp på resultatkortet, räknarpip, kameraskak (kan stängas av).
- **Slutskärm**: se resultatskärmen i fas 6b nedan. Rundans frö (`Frö: …`) visas smått på kartan och på resultatskärmen.
- **Sparning**: en avslutad runda ligger kvar sparad (med `end`) tills summeringen lämnas, så en omladdning på det sista
  resultatkortet visar slutskärmen igen och räknar troféerna bara en gång.
- **Balans** (`src/run/balance.test.ts`): simulerade rundor med spelare av olika skicklighet. Söndagsåkare: bara bryta eller sist
  kostar ett hjärta, bossar läker två hjärtan. Ett hjärta i kiosken kostar ungefär ett lopps lön och är en fjärdedel billigare på
  sista hjärtat.

## Tre sorters lopp, rivaler som växer och Blodbad (fas 6)

- **Loppets sort** (`src/shared/kinds.ts`, satt per plats i `src/run/map.ts` från rundans frö): varje lopp, utmaning, dödslopp och
  boss är antingen 🏁 **Rally** (ren racing, lätt plåtskada, rivalerna håller sig på sin sida), ⚖️ **Blandat** (racing med knuffar:
  några rivaler går på dig men ingen åker ut) eller 💥 **Blodbad** (hälsa, vrak och poäng). Sorten syns som en liten bricka på kartan,
  i teckenförklaringen och på kortet före loppet med en rad om vad den betyder. Ungefär 35 / 40 / 25 % över en runda: mest Rally i
  akt 1 och mest Blodbad i akt 3. Dödslopp lutar åt Blodbad, "slå klockan" är alltid Rally, och bossarna kör efter humör (Sura Bengt
  och Kapten Kanin Blodbad, Ingrid Blandat, Frost-Frida Rally).
- **Blodbad**: alla bilar har hälsa (din syns som en stapel nere till höger, rivalernas som små staplar över huvudet). Smällar tar hälsa
  efter hastighet, vikt och rammarkraft (`src/rally/combat.ts`): traktorn och monstertruck puttar, moppen studsar. Vid 0 är bilen
  **vrak**: den vältar, ryker och ligger ute i ca 3 sekunder och är sedan tillbaka på vägen med det mesta av hälsan (ingen blir utslagen
  för gott). Den som gjorde den sista stora smällen inom 2 sekunder får en **takedown** (en liten rad i sidan, inte mitt på skärmen).
  **Poängen**: placering ger 10 / 7 / 5 / 3 / 2 / 1 och varje takedown 3 p. Mest poäng vinner loppet, så en rammare kan vinna från
  tredje plats. Hjärtat, priset och belöningen följer placeringen **på poäng**. Resultatkortet räknar upp hur poängen blev till.
- **Rivaler** (`src/shared/rivals.ts`, `src/shared/field.ts`, `src/rally/ai.ts`): tolv rivaler, fyra av varje sort. 🔨 **Rammare** (Doris,
  Måns, Roffe, Mormor): sidosmäller, blockerar och jagar vrak. ⚡ **Racer** (Tord, Kenta, Fru Fartkvick, Egon): ren linje, sena
  bromspunkter, nitro på raksträckor. 🔀 **Blandad** (Gunnar, Lasse, Sixten, Kjell): rent tills du kommer för nära. Sorten på loppet
  väljer vilka som kommer: Rally mest racers, Blodbad mest rammare.
- **Rivalerna växer** (kurvan står i `field.test.ts`): uppgraderingar efter hur långt in i rundan man är (akt och rad), en full uppsättning
  från akt 3 rad 2, egna modifierare (ordinarie rivaler 1-2 från akt 2, dödslopp 3, bossar fler och extra regler: "Sista varvet +8 %" och
  "läker sig själv" i Blodbad) som små ikoner på kortet före loppet, skarpare körning (racinglinje, bromspunkter, nitro) och en
  försiktig catch-up för den som ligger långt bakom dig (aldrig för den som ligger före, och aldrig förbi dig). Söndagsåkare skalar
  mycket mindre och får svagare catch-up.
- **Svårare banor**: akt 3 körs över tre varv, fler hinder (höbalar, oljeflaskor som snurrar dig, potthål), något smalare väg och
  tajtare mål i klockutmaningar. Rivaler med Oljeläckan släpper egna fläckar.
- **Tak mot skenande staplar** (`capTune` i `src/rally/mods.ts`, `maxStack` på prylarna): kraft, grepp, nitrolängd och antal, sladdturbo,
  knuff, tålighet, mynt, kronor och bilens totala kraft och grepp har mjuka tak (linjärt till ett knä, sedan mot ett max). Nitro
  räcker högst 12 sekunder per lopp. Prylar som skenar (Pruttboost, Chilikorven, Dino-Dieseln …) slutar ge mer efter 2-3 exemplar.
- **Byte efter varje vinst**: vinner du (i Blodbad: mest poäng) väljer du 1 av 6: tre prylar eller tre uppgraderingskort (se "Bilen som växer" nedan), lutat mot sorten
  (efter Blodbad fler rammar-prylar, efter Rally fler fart-prylar). Tvåan får ett tröstpris: 1 av 2 skräp-prylar. Dödslopp och bossar ger
  fortfarande alltid ett val, med bättre odds.
- **Humor**: kaos, inte toalett. Högst tre prylar handlar om prutt och bajs (Pruttboost är sällsynt, Bajsraketen legendarisk); bara de pruttar och lämnar det gröna molnet. Resten har egna effekter (konfetti, gnistor, glitter, studsar). Nya slumpprylar: Platsbytar-Pelle, Kon från ovan, Slumpväxeln och Tombolan. Inga svordomar: `src/language.test.ts` skannar alla texter.
- **Prylarnas vägar** (`path` på alla 52): `ram`, `race`, `fuffens`, `stunt`, `girig`, `kaos`. Fas 9 bygger på dem.
- **Balanssimuleringen** (`src/run/balance.test.ts`, `src/run/racesim.ts`, `src/shared/pace.ts`) räknar med varvtider i stället för tärningar:
  spelarens varv från bil, delar, prylar och skicklighet, varje rivals varv från dess skalade kit, och loppet körs sida vid sida
  med catch-up, hinder, kontakt och (i Blodbad) takedowns. Varvtidsmodellen är anpassad mot den riktiga fysiken (`src/rally/pace.test.ts`).

## Resultatskärmen (fas 6b)

Efter en seger, efter sista hjärtat och efter en omladdning på sista kortet visas `resultView` (`src/ui/result.ts`, siffrorna räknas ut i
`src/run/summary.ts` och är testade i `summary.test.ts`):

- **Huvud**: stor dom (seger, eller vilken akt och plats du föll på), fordon, förare, lack, frö, total åktid och Söndagsåkare-bricka.
- **Rundans mest galna siffra** med en rolig rad, sedan 6-10 sifferkort och "Visa alla" för resten. Loppen sparar nu bland annat toppfart,
  längsta sladd, tid i luften och hopp, nitrosekunder, oljefläckar, omkörningar, utlagda fällor, bästa varv och hur ofta varje pryl utlöstes
  (`RaceStats` och `RallyResult`, summeras i `src/run/stats.ts`; toppfart och längsta sladd är maxvärden). Rundan räknar också pallplatser,
  kronor spenderade och åktid. Gamla sparningar laddas med nollor.
- **Tidslinje**: varje besökt plats i ordning (`RunState.log`) med typ, sort (Rally/Blandat/Blodbad), bana, placering eller poäng, belöning och
  förlorade hjärtan, med aktavskiljare. En horisontell remsa på dator och surfplatta, en lista på mobil.
- **Bygget**: varje pryl med antal och varifrån den kom ("Vann Sura Bengt", "Köpt i kiosken", "Händelse: …", `RunState.got`), uppgraderingsträden med taget nod för nod och kombona,
  byggets mix per väg som en stapel ("55 % Ram · 30 % Fuffens · 15 % Race") och fordonets förmåga (`abilityOf`: aktiv förmåga med hur många gånger du använde den, och passiven).
- **Troféer och upplåst**: varför troféerna blev så många, nya bilar och prylar, hur långt det är till nästa pryl-upplåsning och de **utmaningar** rundan flyttade ("Takedowns i en runda: 6/10", eller "✅ Monstertruck upplåst!").
- **Svårighet**: på pekskärmar får rivalerna inte längre någon extra lättnad i normalt läge, bara i Söndagsåkare.

## Kontroller och växlar (fas 7)

**Pek** (bara mobil och surfplatta; datorns tangentbord och handkontroll är som förr). Inställningar → Kontroller, sparas per enhet
(`Prefs.controls` i `src/prefs.ts`, rena regler och layouträkning i `src/controls.ts`):

- **Lätt** (standard): bilen gasar själv och bromsar lite i kurvorna. ◀ ▶ till vänster; broms/back, handbroms och nitro (eller kamera) till höger.
- **Pedaler**: en stor **GAS** under högertummen (håll för att köra, kort uppgasning), **BROMS** bredvid (backar också), lätt motorbroms när
  du släpper gasen. ◀ ▶ och handbromsen till vänster, nitro och förmågeknappen i en båge ovanför gasen, kameran flyttas till toppen bredvid paus.
- **Proffs**: Pedaler plus manuell växling med **−** och **+** vid högertummens innerkant (ca 56 px). Man kan också dra upp eller ned på GAS med tummen kvar.
- Alla: flera fingers samtidigt (styr + gas + handbroms), varje knapp fångar sin egen pekare (en tumme som glider av tappar inget, och ett glid från ◀ till ▶ byter riktning),
  menytryck läcker aldrig in i racet. **Knappstorlek** S/M/L, **synlighet**, **vänsterhänt** (hela layouten speglas, ◀ ligger kvar till vänster om ▶),
  **Flytta knappar** (dra knapparna, Återställ; sparas per skärmtyp mobil/surfplatta och per sort). Surfplattor får klustren ca 10 % in från kanten och en övre gräns för knappstorleken;
  safe-area respekteras och knapparna hålls borta från minikartan och hastighetsmätaren (`controls.test.ts` testar layouten på fem skärmar, alla storlekar, höger- och vänsterhänt).
- **Förmågeknappen** (fas 8) har fordonets egen symbol (✨ bytt mot 💥, 🚀 …) i alla tre sorterna, även Lätt. En ring runt den fylls medan förmågan laddar och knappen lyser gult när den är redo. Hjälptexten i Snabbrace följer vald sort.
- **Vibration** (`src/haptics.ts`): en kort knack vid manuellt skifte, ett mönster vid perfekt skifte och vid stora smällar, där webbläsaren har `navigator.vibrate`
  (Android). iPhone och iPad kan inte, där sköter ljud och ljus jobbet. Går att stänga av.

**Växellåda** (`src/rally/gears.ts`, `car.ts`): varje fordon har egen låda (antal växlar och fart vid varvtaksgränsen i varje växel), automatkoppling,
varvstoppet som studsar om man inte skiftar upp (utom i högsta växeln), **segt** motor om man skiftar för tidigt (eller startar i för hög växel) och ett
**perfekt skifte** (varven 90-98,5 % av max): en liten spark på 1 sekund, en blå blinkning i skiftljuset och ett klick. Automat och rivaler kör samma modell och skiftar själva,
så motorljudet och mätaren visar växlar i båda lägena. Slumpväxeln kan slänga in eller ur en växel i manuell. Läget väljs under Inställningar → Växling
(Proffs är alltid manuellt på pek). Mätaren visar växel, varvbåge, skiftljus (grönt, gult, rött) och MAN; "SEGT" och "MAX!" när motorn är seg eller i varvstoppet.

| Fordon | Växlar | Fart (km/h) vid max varv, växel för växel | Skifttid |
|---|---|---|---|
| Bilar (rallybil, buggy, pickup, soffbil) | 5 | 54 / 97 / 137 / 180 / 230 | 0,15-0,20 s |
| Sportbil | 5 | 58 / 101 / 144 / 191 / 245 | 0,14 s |
| Monstertruck | 5 | 50 / 90 / 130 / 173 / 223 | 0,20 s |
| Fyrhjuling | 5 | 47 / 83 / 119 / 158 / 209 | 0,15 s |
| Motorcykel | 6 | 58 / 94 / 130 / 169 / 212 / 270 | 0,08 s |
| Moppe | 3 | 32 / 59 / 101 | 0,13 s |
| Traktor | 6 | 16 / 29 / 41 / 54 / 67 / 86 | 0,28 s |
| EPA-traktor | 5 | 11 / 20 / 31 / 45 / 72 | 0,30 s |
| Glassbil | 4 | 43 / 79 / 122 / 173 | 0,25 s |
| Sopbil | 6 | 18 / 32 / 49 / 65 / 83 / 108 | 0,30 s |
| Snöskoter | 3 | 65 / 122 / 202 | 0,06 s |
| Gokart | 4 | 50 / 90 / 130 / 173 | 0,05 s |
| Golfbil | 3 | 29 / 49 / 86 | 0,10 s |
| Åkgräsklippare | 4 | 22 / 40 / 61 / 97 | 0,20 s |
| Husbil | 5 | 29 / 50 / 72 / 94 / 119 | 0,32 s |
| Limousin | 5 | 58 / 104 / 151 / 202 / 259 | 0,18 s |
| Raketvagnen | 1 | 162 | 0,10 s |

Farten och varvtiden är i stort sett som förut (kontrollerat mot den gamla lådan: varvtider inom 0,3 %), så `pace.ts` behövde inte ändras. I `gears.test.ts` är en skicklig
manuell förare lite snabbare än automaten (ca 1-4 % på en start) och en slarvig klart långsammare.

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

Dev-bygget har också `window.__rallyDebug` (`tumble()`, `honk()`, `swap(kropp)`, `takedown(n)`, `hurt(n, hp)`, `ability()`, `park()`, `freeze()` / `thaw()`, `ahead(n, avstånd, fart)` / `behind(...)` och `hazard(sort, avstånd, sida)`) under ett lopp. För tester finns `window.__app` med `fakeFinish()` (avslutar loppet direkt med ett påhittat resultat), `debugRun()`,
`debugEnter(typ, sort?)` och `debugMeta()`. I dev-bygget finns dessutom `?rallydebug&rallyauto&rallyturbo=30&rallygo` som låter
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

## Fordon med förmågor (fas 8)

Varje fordon är en egen figur, som i Tape to Tape (`src/shared/abilities.ts`, testat i `abilities.test.ts` och `passives.test.ts`): en **lutning**
(🛡️ Ram, 🏎️ Race eller ⚖️ Blandat), en **passiv** som alltid är på, en **aktiv förmåga** på egen knapp med nedkylning och laddningsring, och en
**startpryl** som följer med fordonet in i rundan (`newRun` lägger den i väskan). Loppet gör det som id:na säger (`useAbility`, `abilityStep` och passiverna i
`src/rally/index.ts`); passiverna som är körkänsla ligger i `feel` i `src/shared/rally.ts` (sandbuggyns `roll`, sportbilens luftmotstånd, monstrets och pickupens massa).

| Fordon | Lutning | Passiv | Aktiv (F) | Nedkylning | Startpryl |
|---|---|---|---|---|---|
| 🚗 Rallybil | Blandat | Perfekt sladd: en lång sladd fyller på nitron | ⚡ Kickstart: kort rusning och extra grepp | 12 s | Soptunneturbon |
| 🏜️ Sandbuggy | Race | Sandkungen: sand, gräs och grus bromsar inte | 🦘 Hopp: ett jättehopp | 9 s | Mammas tofflor |
| 🛻 Pickup | Ram | Löst flak: smäller du tappar du hö bakom dig | 🛻 Flaket: olja och höbalar bakom dig | 14 s | Dödskalle-dekalen |
| 🏎️ Sportbil | Race | Vindtunnel: högre topphastighet | 🧲 Slipström-snärt: precis bakom en bil slungas du förbi | 10 s | Kaffeslurparen |
| 🦖 Monstertruck | Ram | Småbilsätaren: kör över små bilar, de blir plattor | 💥 Krossa: stötvåg som slungar bort alla nära | 15 s | Grannens traktordäck |
| 🛞 Fyrhjuling | Blandat | Mjuklandning: boost när du landar ett hopp | 🔄 Bakhjulssväng: 90 graders sväng på stället | 8 s | Katapultsätet |
| 🏍️ Motorcykel | Race | Wheelie på boost: framhjulet lyfter, lite mer fart | 🚀 Wheelie-raket: lång raketboost, svårstyrd | 16 s | Snusmotorn |
| 🛵 Moppe | Race | Smal som en planka: halka och höbalar stör knappt, mindre träffyta | 💨 Väj!: en sekund oberörbar | 9 s | Terrorklockan |
| 🚜 Traktor | Ram | Knuffar allt: tung och ramm 1,8 | 🚜 Rammbock: rusa fram, slunga bort bilar (skrot i Blodbad) | 17 s | Stulna älghorn |
| 🛋️ Soffbil | Blandat | Kaosarvet: en slumpad pryl varje akt | 🛋️ Soffkudde-kaos: slumpar rusning, hopp, höbalar, pannkaka, platsbyte, korvkanon, slem eller spöke | 11 s | Slumpväxeln |

Datorförarna använder sina fordons förmågor lite grann (racers en fartstöt, rammare en stöt mot någon nära framför, bara i Blandat och Blodbad), högst var 15:e–40:e sekund.
Förmågorna är av i Snabbracets rättvisa läge (`rules.sameCars`). Balansen: de som ändrar farten finns i `src/shared/abilities.ts` (`PASSIVE_LAP`, `PASSIVE_RAM`, `save` per förmåga)
och går in i `playerStats` i `racesim.ts`; rivalernas mod blev lite skarpare med ökande akt (`rivalSkill`) för att kompensera startpryl och förmåga.

**Start och upplåsning** (`src/run/unlocks.ts`, `meta.ts`): fem fordon är öppna från början (rallybil, sandbuggy, pickup, moppe, traktor); de andra fem låses upp av utmaningar, en per fordon:

| Fordon | Utmaning |
|---|---|
| Sportbil | Vinn en runda |
| Fyrhjuling | Vinn en runda på Söndagsåkare |
| Monstertruck | Gör 10 takedowns i en runda |
| Motorcykel | Slå Sura Bengt med moppen |
| Soffbil | Vinn akt 2 utan att tappa ett hjärta |

En utmaning är data (`CHALLENGES`): vilket fordon den öppnar, ett mål, och en `measure(run)` som säger vad en runda kommit fram till. `mode: 'best'` är mest i en runda och kollas efter varje steg
(`checkChallenges` i `commit`, med en liten "UPPLÅST!"-remsa i hörnet, aldrig mitt i bilden), `mode: 'total'` summeras över rundor och räknas en gång när rundan tar slut (`RunEnd` skyddar mot dubbelräkning).
Framstegen sparas i `Meta.progress`, de öppna fordonen i `Meta.bodies`. Nya fordon (fas 10, se nedan) är fler rader i `CHALLENGES` och `KITS`; testerna kräver en utmaning för varje fordon som inte är en starter.
**Migrering**: en gammal sparning utan `bodies` får starters plus allt troféerna en gång öppnat (`LEGACY_BODY_UNLOCK`), så ingen förlorar något. Troféer låser fortfarande upp prylar i potten.
Bilvalet visar lutning, stjärnor, passiv, aktiv (namn, rad, nedkylning) och startpryl, och för låsta fordon villkoret med en framstegsstapel ("Takedowns i en runda: 6/10").

## Grövre look (fas 9)

Spelet ska se ut som ett punkigt, lite smutsigt arkadspel med attityd, inte som ett barnprogram (inspirerat av hur Tape to Tape känns, men allt är egenritat).
Den gemensamma stilen bor i `src/rally/look.ts` så att fas 10:s tio nya fordon får den på köpet.

- **Ljus och färg** (`look.ts`): loppet ritas till ett halvflyt-mål och går genom ett efterpass med färgton per bana (`GRADES`: ljusare pastellbanor som godis, köket och månen
  avmättas och mörknar, öknen och vulkanen blir varma, isen och månen kalla), S-kurva för djupare skuggor, vinjett och lite korn. På `high` finns också en mjuk bloom på
  nitroflammor, eldar, lampor och explosioner (värden över 1 i HDR). Utan halvflyt-stöd, eller om `adapt()` sänkt upplösningen för långt på `low`, ritas bilden rakt på
  skärmen med en vinjett i CSS (`.rg-vignette`). `low` har alltså ett enda extra pass och inga konturer, ingen bloom och inget korn-extra.
- **Konturer**: `outlineMesh` lägger ett omvänt skal (några pixlar brett oavsett avstånd, tunnare långt bort, dimmigt som resten) på bilar, förare, hjul och på spårkantens
  rekvisita. Bara på `high`. Nya modeller anropar `outlineMesh(mesh, hi)`.
- **Bilar**: sponsorlappar med påhittade märken (Grusolja, Kaosbensin, Däck & Dunder, Skrotfix, Mackens kiosk, Surstark) är standard i stället för hjärtan och stjärnor
  (de gamla klistermärkena finns kvar, `CAR_DECALS`), rivalerna får egna lackeringar och sponsorer (`rivalLook` i `tuning.ts`), och startnumret är en sliten rondell.
  Smuts byggs upp under loppet (`Entrant.dirt` → `CarModel.setWear(dirt, damage)`, snabbare utanför asfalten och i regn), repor och sotfläckar kommer med skadan. I Blandat och
  Blodbad syns skadan som bucklor, spricka i vindrutan, en stötfångare som först lossnar och sedan hänger (från 50, 70, 90 av 100), rök från huven och eld när det är nära slutet
  (`wearOf` i `index.ts`: hälsan i Blodbad, plåten annars). Nitroflammorna är längre och glöder.
- **Förare**: alla har hjälm med visir eller skyddsglasögon (`helmet`, `driverHead` i `models.ts`) och overall med rand och selar (`overallsColor`): grisen har hjälm, tuppen aviatorglasögon,
  kon visir och horn ut genom hjälmen. Mopedens och buggyns förare syns tydligast.
- **Banorna** (`src/rally/attitude.ts`, ett lager över varje bana, alla former i få ritanrop): däckväggar på ytterkanten av de skarpaste kurvorna, höbalar (lådor på månen och i godislandet)
  med sponsorbanderoller vid start och mål, reklamskyltar för påhittade märken, skrotupplag med vrak, oljefat där några brinner (flammor i en egen shader, rök och på `high` ett
  flimrande ljus), ljustorn vid start och i kurvor, flaggor, handskrivna skyltar och bloss med röd rök bland publiken. Varje bana får sin palett (`PALS`): godis blir slitet godis,
  månen får lastlådor, köket sotiga burkar. Tätheten följer `low`/`high` och bansättets variation.
- **Effekter** (`fx.ts`, `index.ts`): gnistor som studsar och glöder, spillror (`Debris`, riktiga bitar som flyger och landar), en eldboll med rökpelare och flygande skrot när en bil blir
  vrak (ingen gore, bara plåt), tunnare däckrök. Damm och rök tonas fortfarande ut mellan kameran och din egen bil.
- **Menyerna** (`src/poster.css`, lagt ovanpå `style.css`): betongvägg med sprayfärg, stencilrubriker, pappersbitar med tejp, ink-kantade knappar, kartans platser som stickers och rivalerna som
  samlarkort i en lek man drar i sidled (porträtt, körsätt, tre stjärnbetyg, en replik). Bara färger, kanter och typsnitt ändras där, aldrig storlekar, så alla layouter för mobil, surfplatta och
  dator är desamma som förut. Handritade pilar finns på titeln och kartan.
- **Test**: `?rallydebug` (bara i dev) har nya krokar: `warp()`, `cam(x, y, z, tx, ty, tz)`, `smoker(k)`, `hide('attitude' | 'fx' | 'scenery')`, och `window.__forceCourse` väljer bana.

## Tio fordon till (fas 10)

Nu finns det **20 fordon**: fem som alla har från början och femton som låses upp av utmaningar. De tio nya är gjorda i samma stil som de andra (konturer, sponsorlappar, smuts och skador, en förare i hjälm; modellerna ligger i `src/rally/vehicles2.ts`),
och varje fordon har egen körkänsla (`CAR_BODY_DEFS` i `src/shared/rally.ts`), egen växellåda (`gears.ts`), eget motorljud (`audio.ts`), en lutning, en passiv, en aktiv förmåga med nedkylning (`src/shared/abilities.ts`, gör sitt i `src/rally/index.ts`),
en startpryl och en utmaning. Tre nya körkänslor finns i `Feel`: `loose` (snö, is och sand greppar som asfalt: snöskotern), `grass` (högre fart och nästan ingen broms på gräs: gräsklipparen) och `slide` (när bakdelen väl släpper fortsätter sladden: limousinen).

| Fordon | Lutning | Passiv | Aktiv (F) | Nedkylning | Växellåda | Startpryl | Låses upp av |
|---|---|---|---|---|---|---|---|
| ⚠️ EPA-traktor | Blandat | Spärr 30: topp ca 40 km/h, men inget bromsar (gräs, lera, olja, höbalar) | ⚠️ Gasa på EPA: spärren av, kraftig fartstöt | 8 s | 5, långsam | Pensionärsrabatten | Slå Sura Bengt |
| 🍦 Glassbil | Blandat | Glassmelodin: bilar inom 15 m saktar ner och en melodi spelas | 🍦 Glasskanon: tre glaskulor landar framför dig och gör vägen hal | 13 s | 4, lat | Lördagsgodiset | Samla 150 mynt i en runda |
| 🗑️ Sopbil | Ram | Plockar upp: fällor du kör på plockas upp, varje bit ger lite pansar (max 6) | 🗑️ Tömning: en hög skräp bakom dig, större ju mer du plockat | 12 s | 6, tung | Pantmotorn | Samla ihop 12 prylar i en runda |
| ❄️ Snöskoter | Race | Allt grepp: full grepp på is, snö och sand | ❄️ Pudersvans: snömoln som gör bilarna bakom blinda och långsamma | 11 s | 3, snabb | Bastu på taket | Slå Frost-Frida |
| 🏁 Gokart | Race | Sugen i rygg: slipströmmen fylls dubbelt så fort, fullt ger en gratis fartstöt | 🏁 Gokartsladd: en perfekt sladd direkt, ger nitro | 10 s | 4, blixtsnabb | Frityroljan | Sladda i 40 sekunder i en runda |
| ⛳ Golfbil | Blandat | Tyst som en mus: rivalerna går inte på dig och blockerar dig inte | ⛳ Hole in one: en golfboll slår ledaren i sidan | 15 s | 3, eldrift | Pappas pokal | Kom till akt 2 på Söndagsåkare |
| 🌿 Åkgräsklippare | Blandat | Gräsälskare: snabbare på gräs än på vägen | 🌿 Gräsklippning: ett gräsregn som klipper bort allt farligt framför dig | 9 s | 4, små | Kon från ovan | Använd förmågan 20 gånger i en runda |
| ⛺ Husbil | Ram | Hemma på hjul: plåten lagas medan du kör, i Blodbad kommer hälsan tillbaka | ⛺ Utfällt tält: ett markistält bakom dig som snurrar följarna | 14 s | 5, klonkig | Begagnat hjärta | Kör klart 5 rundor |
| 🕶️ Limousin | Race | Rutschkana: lång sladd, och sladdturbon fylls 35 % fortare | 🕶️ VIP-fil: rakt genom bilar i drygt 3 sekunder | 13 s | 5, mjuk | Källarfest-discot | Spendera 900 kronor i en runda |
| 🛒 Raketvagnen | Race | Skranglig: vagnen vinglar slumpmässigt | 🛒 Raketen: gigantisk fart i knappt 3 sekunder, svår att styra | 15 s | 1 + raket | Chilikorven | Vinn en runda med moppen eller traktorn |

Tre av dem är lätta för en tioåring: golfbilen (nå akt 2 på Söndagsåkare), husbilen (spela fem rundor) och gräsklipparen (tryck på knappen). Raketvagnen är den svåraste.
Utmaningarna räknar sådant som rundan redan sparar (`RunStats`), så sparfilen är oförändrad: gamla sparningar behåller sina fordon och de nya är låsta tills deras utmaning är klar.

- **Rivaler**: datorförarna kör ibland de nya fordonen efter humör (`archetypeBodies` i `src/shared/field.ts`): rammare i sopbil och husbil, racers i gokart, limousin och snöskoter, de blandade i glassbil, golfbil, gräsklippare och raketvagn.
  De använder sina förmågor som förut (en fartstöt eller en stöt mot någon nära framför).
- **Bilvalet** har ett filter (Alla, Ram, Race, Blandat) över ett rutnät med alla tjugo fordon som rullar i höjdled i stället för att svämma över. Alla knappar är minst 44 px på telefon, surfplatta och dator, och sidan scrollar aldrig.
  Skrytlådan och resultatskärmen listar fordonen på samma sätt som förut.
- **Balans** (`src/shared/pace.ts`, `src/run/racesim.ts`, `src/rally/bodypace.test.ts`): varje nytt fordon har en uppmätt varvfaktor mot rallybilen (`BODY_LAP`, medelvärde över fyra banor med den riktiga fysiken och datorföraren;
  EPA-traktorn och raketvagnen mäts med sin fartstöt använd). Simuleringen räknar med den (uppgraderingar av grepp och kraft ovanpå) och `balance.test.ts` kör alla tjugo fordonen genom akt 3: inget nytt fordon vinner oftare än det bästa av de gamla,
  raketvagnen är aldrig bäst, och inget är sämre än moppen. De långsamma (EPA-traktor, golfbil, gräsklippare, raketvagn) är långsamma med flit, som moppen och traktorn: de är till för att skratta åt, och de är roligast i Söndagsåkare.

## Bilen som växer (fas 11)

Som i Tape to Tape blir det svårare genom rundan (rivalerna växer lite brantare än förut) medan din bil blir bättre, eller åtminstone annorlunda:
vilka noder, prylar och förmågor du har bestämmer hur rundan känns. Allt ligger i `src/run/upgrades.ts` och är testat i `src/run/upgrades.test.ts`.

**Fem träd, tre eller fler rader i varje, 2-3 nivåer per rad och en topp.** En rad är data: `tune` ändrar siffror när loppet startar, `hooks` reagerar på vad som händer (som en pryl), `perk` ändrar rundan. En nod är en nivå av en rad ("ram.plates2"); nivå 2 kräver nivå 1, toppen kräver 4 noder i trädet.

| Träd | Rader (nivåer) och vad de gör |
|---|---|
| 🛡️ **Ram** | Pansarplåt (3): tål mer, mer hälsa i Blodbad. Ballast (2): tyngre, knuffar mer. Spikar (2): hårdare knuff. Slägga (2): 35 % mer skada på andra bilar. Stötvåg (2): en stötvåg efter en stor smäll. Rambooster (2): stötfångaren slår hårdare under nitron. **Skrotkungen**: vrak ger stötvåg och lagning. |
| 🏎️ **Race** | Motor (3): +10 % effekt. Grepp (3): +6 %. Bromsar (2). Nitro (3): +1 laddning per nivå. Nitrolängd (2). Sladd (2): sladdturbon laddar fortare, en spark efter varje sladd. Aero (2): topphastighet. **Formelbilen**: en spark på varje boost. |
| 🦨 **Fuffens** | Oljeläcka (2): olja bakom dig på boost. Minor (2): en mina under hård bromsning eller på handbromsen. Falska mynt (2): guldmynt som poppar och snurrar bilen. Rökgranat (2): nitron lämnar en blindande rökridå. Höbalskastaren (2): hö landar framför närmaste bil. **Fuffens-mästaren**: knepen 45 % oftare, en fälla gratis varje varv. |
| 🤸 **Stunt** | Stötdämpare (3): mjukare landningar. Flygtid (2): långa hopp ger nitro och kronor. Volter (2): bilen tar en volt i luften. Två hjul (2): långa sladdar och wheelies fyller nitron. Nära ögat (2): omkörningar på en hårsmån ger nitro och kronor. **Stuntstjärnan**: 40 % mer från alla stunts. |
| 🤑 **Girig** | Ränta (3): 5/10/15 % av kronorna efter varje plats (högst 60). Dusör på ledaren (2). Vrakförsäkring (2): kronor vid hård smäll och vrak. Rabattkort (2): 10 % per nivå i kiosken och Skruvhörnan. Guldkant (2): dyrare mynt, bilen får guldkant. **Kapitalisten**: 15 % mer kronor och ett extra kort. |
| 🎲 **Kaos** | Inget träd: en smak på de legendariska prylarna (och en halva av Lotterivinsten). |

**Fordonets egna uppgraderingar**: varje fordon har två, tagna i ordning (`car.<fordon>1` och `2`), som stretchar eller förgrenar dess aktiva förmåga: kortare nedkylning (`abilCd`), längre varaktighet (`abilDur`, stretchar alla timers som förmågan just startade) eller en extra
effekt efter användning (`plus`: olja, höbalar, stötvåg, boost, rök, kronor, nitro, lockbil, lagning, mina). Traktorns Rammbock blir 50 % längre och släpper sedan också höbalar, moppens Väj! blir längre och lämnar en lockbil som bilarna bakom saktar in för, golfbilens Hole in one laddar fortare och slår en stötvåg där bollen landar.
De visas bara för den som kör det fordonet.

**Hur man får dem.** Efter en vinst (och efter dödslopp och bossar) visar belöningsskärmen två flikar: 🛠️ Uppgraderingar (tre kort) och 🎁 Prylar (tre kort); du tar EN av sex. Tvåan får fortfarande bara ett tröstpris med två skräp-prylar. Korten dras ur de öppna noderna (`drawUpgrades`
i `economy.ts`) och lutas av sorten (`KIND_TREE_BIAS`): Blodbad ger Ram (×2,6) och Fuffens (×1,9), Rally ger Race (×2,6) och Stunt (×1,9), Blandat är öppet. Fordonets lutning (Ram/Race) ger en liten extra knuff, ett träd man redan går i kommer upp oftare (så ett bygge får en form), tre kort
från minst två träd, bossar bjuder oftare på toppar och högre nivåer. Ett kort som väcker en kombo har en stjärna. I **Skruvhörnan** är första uppgraderingen på nivå I eller II gratis; alla noder går att köpa för kronor (`upgradePrice`: 90, 150, 240, topp 420, fordon 130, plus aktens påslag och rabatter), med en flik per träd. Händelser som "tunar bilen" ger en slumpad nod.

**Kombos** (10 st, `COMBOS`): två saker du äger väcker en kombo, och den visas som en liten "KOMBO!"-lapp i hörnet (aldrig mitt på skärmen) och som en guldkantad ikon först i loppets pryl-remsa.
Spikmattan (Spikar + Oljeläcka: smällar lämnar olja), Luftburen (Flygtid + Nitro: landningar fyller nitro), Lotterivinsten (Ränta + valfri Kaos-pryl: lott efter varje varv), Eldkastaren (Pruttboost + Chilikorven: en kort eldstråle bakåt, sällsynt),
Pansarraketen (Stötvåg + Nitro), Sladdmolnet (Rökgranat + Sladd), Dödsföraktet (Nära ögat + Vrakförsäkring), Prisjakten (Dusör + Slägga: kronor och nitro för varje vrak), Minfältet (Minor + Flygtid) och Stålspargrisen (Pansarplåt + Ränta). Fliken Kombos i Bygget visar alla tio med receptet.

**Bilen syns.** `src/rally/modlook.ts` bygger bult-on-delar för varje rad och nivå ovanpå trimgeometrin, från de mått varje kropp redan ger bygget (bredd, nos, akter, tröskel, bälte, tak, hjul), så alla tjugo fordon får dem och en ny kropp får dem gratis
(fordon där föraren sitter ovanpå, som cyklarna, traktorn och soffan, får sakerna på bagagehyllan bakom föraren i stället för på taket). Ram: sidoplåtar, spikar, stötfångarstång och ramplatta, hästhorn, sandsäckar, boostertank. Race: dubbla avgasrör, breda skärmar, frontsplitter och jättevinge, nitroflaskor, hajfena.
Fuffens: oljefat, rökgranat, minor på stötfångaren, ett falskt mynt i en tråd, hö på taket, trollkarlshatt. Stunt: ramp, rullbur, flaggor, stuntstänger, guldstjärna. Girig: guldlist, en pengasäck, en guldflagga, en guldprydnad. `bodySpecOf` i `models.ts` ger testerna alla kroppars mått:
`upgrades.test.ts` ritar varje rad på alla tjugo kroppar och kollar att allt sitter nära bilen.

**Bygget** (☰ Paus → 🧰 Bygget, och 🧰 i kartans övre list): bilen på skivspelare med sina mods, byggets mix per väg, och träden som flikar med tagna, öppna och låsta noder (tryck för att läsa; kombofliken visar alla recept). Samma panel är Skruvhörnans butik.
Telefon på sidan: bilen till vänster, träden till höger, panelen scrollar inuti; surfplatta stående: bilen överst. Alla knappar är minst 44 px och sidan scrollar aldrig. Resultatskärmen visar träden nod för nod (med varifrån varje kom), fordonets uppgraderingar och de aktiva kombona.

**Sparningar.** `RunState.up` är listan av noder. Äldre sparningar har sex delnivåer (`car.parts`) i stället: vid inläsning blir varje nivå den nod den blev (`PART_LINE`: motor → Motor, däck → Grepp, bromsar → Bromsar, turbo → Nitro, pansar → Pansarplåt, fjädring → Stötdämpare; `partsToNodes`),
delarna nollas, gamla "del"-poster i byggloggen blir noder och ett gammalt belöningskort `part:armour` blir nästa nod i den raden. Testat i `upgrades.test.ts` och `save.test.ts`. Pausmenyns bygge och prylremsan i loppet läser samma data.

**Balans.** Mjuka tak gäller som förut (`capTune`: byggets egna kraft och grepp tas nu med uppgraderingar och prylar tillsammans, kroppens total tas av `capPower`/`capGrip`; nitroladdningar 5 och 12 sekunder i högsta fall). Rivalernas kurva växer lite brantare
(`partLevel` upp till 4,9, catch-up i akt 3 16 %) för att hänga med. Mätt i `balance.test.ts` med bottar som köper noder (ett kort av sex, den fria noden i verkstaden): en bra spelare vinner ungefär 58 / 28 / 47 % av normala rundor med Race / Ram / Blandat som strategi
(Ram vinner mest via Blodbad: 0,54 mot 0,35 för en renodlad racer, medan racern tar Rally 0,88 mot 0,69), en stark spelare 77 / 72 / 90 %, Söndagsåkare är kvar över 90 % för en genomsnittlig spelare, och ingen färdig uppsättning (Ram, Race, Stunt, Fuffens, Girig) varvar fältet i akt 3,
inte ens "alla noder + alla prylar" (bästa spelare vinner under 99 % av loppen).
