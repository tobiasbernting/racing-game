# Galna Rallyt

Ett 3D-rallyspel i webbläsaren (three.js): kom först i mål mot en gäng galna förare på tolv banor. Spelet är gjort för en vuxen och en tioåring som spelar tillsammans: absurt, oförutsägbart och bonkers: ingen runda blir den andra lik, det beror på vilka talismaner du råkar få (korvkanoner, flygande kor, plats­byten mitt i farten, en och annan prutt). Det är
en egen fristående version av rallyt från Lilla Gården och ska bli en roguelite (se [PLAN.md](PLAN.md)).
Fas 1 var porten (ett lopp på dator, surfplatta och mobil), fas 2 gjorde det till en roguelite: en runda är tre
akter med varsin förgrenad karta och en boss, och på vägen samlar man galna talismaner. Fas 3 lade till
fem nya fordon, fem nya banor, banor som ser olika ut varje gång, fler talismaner, händelser och en ny boss. Fas 16 (längst ner) gjorde alla förare till människor i hjälm, rivalerna till vänliga ordvitsar på rally- och idrottsstjärnor, och bossarna till en pool per akt med egna trick på vägen.

Styrning: piltangenter/WASD, mellanslag = handbroms, L = nitro, **F = fordonets förmåga** (handkontroll Y), C = kamera, R = tillbaka på vägen,
Escape = paus, E / Q = växla upp / ned (om du slagit på Manuell växling). Handkontroll (RB / LB växlar) och pekknappar på skärmen
fungerar också. Pekkontrollerna finns i tre sorter, se "Kontroller och växlar" nedan.

## Så fungerar en runda

- **Titel**: Ny runda, Fortsätt runda (rundan sparas i localStorage efter varje plats), Snabbrace (ett enda lopp som förr),
  Skrytlådan (medaljer med framsteg, sedda talismaner, och bästa rundan per svårighet). Svårigheten väljs på bilsidan, inte här; titeln visar bara vad som valdes sist.
- **Karta**: tre akter (Bondlandet, Vildmarken, Galna stan), fem rader med 2–4 platser och sedan en boss. Varje väg dit innehåller minst tre lopp (fas 17, se längst ner). Platserna är
  🏁 lopp, ⏱️ utmaning (vinn eller skäms, topp 2 i spöregn, mörkerrallyt, slå klockan), 💀 dödslopp, 🛒 Mackens kiosk, 🔧 Skruvhörnan,
  ❓ helt random och 👑 boss (en av tre i varje akt, fröet väljer: tävlingsledaren, golfaren och kartläsaren i akt 1, fotbollsspelaren, målvakten och bowlaren i akt 2, en världsmästare eller Kapten Kanin på månen i akt 3, se fas 16).
  Tjugoen rivaler, vänliga ordvitsar på rally- och idrottsstjärnor, med eget skryt och eget hån när de kör om dig (`src/shared/rivals.ts`).
- **Hjärtan och kronor**: kommer man sist (nedersta tredjedelen) eller bryter förlorar man ett hjärta; vid 0 är rundan slut.
  Loppen ger kronor (pris + mynt på banan + talismanbonus, skalat per akt) som går till kiosken (talismaner, laga bilen, läka
  hjärta, nya varor) och verkstaden Skruvhörnan (en gratis uppgradering på nivå I eller II, resten för kronor, eller måla om).
- **Talismaner** (`src/run/trinkets.ts`, 72 st): vanlig/ovanlig/legendarisk, samma talisman två gånger gör den starkare. Varje talisman är
  data: `tune` ändrar siffror när loppet startar, `hooks` reagerar på tick/boost/sladd/stöt/varv/pickup/mål, `perk` ändrar
  rundan (rabatt, hjärtan, fler val). Loppet får dem som `RallyOptions.mods` (`src/rally/mods.ts`); bossarnas trick går via
  `RallyOptions.twist`. Lägg till en talisman genom att lägga till en rad i listan.
- **Allt är öppet från början**: alla 20 fordon och alla talismaner finns i varje runda redan första gången du startar. Variationen kommer av vad du
  får under rundan. **Troféer** 🏆 efter varje runda (2 per besegrad boss, 3 för seger, gånger svårighetens multiplikator) är bara poäng, de låser inget.
  Det som förr var utmaningar är **Medaljer**, se "Medaljer och frökoder" nedan.
- Rundan är deterministisk från ett frö: kartor, kioskens varor och händelsernas utfall räknas ut från fröet och behöver
  aldrig sparas.

## Fordon, banor och variation (fas 3)

- **Fordon** (`CAR_BODY_DEFS` i `src/shared/rally.ts`, modeller i `src/rally/vehicles.ts`): varje kropp har en `feel` som
  `car.ts` läser (massa, styrning, tröghet, toppfart, grepp på grus och gräs, lutning, två hjul).
  🛞 **Fyrhjuling**: lätt och yr, älskar grus och hopp. 🏍️ **Motorcykel**: väldigt snabb, lutar sig i kurvorna, har mindre grepp
  och ramlar på ett komiskt sätt vid en stor smäll (föraren gör en volt, sen är man på hjulen igen). 🛵 **Moppe**: liten och
  vig, med korg och en hög ring-ring-klocka (H tutar, och den ringer själv bakom andra bilar). 🚜 **Traktor**: tung och
  oåterkallelig: puttar undan andra bilar och bryr sig knappt om bananskal och höbalar. 🛋️ **Soffbil**: en soffa på hjul med kuddar,
  lampa och kaffekopp. Förarna sitter ovanpå. Varje fordon har egen motorklang (`audio.ts`) och egen tuta, och
  datorförarna kör dem ibland också.
- **Banor** (`src/rally/courses-wild.ts`, scenerin i `src/rally/wild.ts`): 🏜️ Öknen (dyner, kaktusar, kamel, oas), 🌋 Vulkanen
  (svart sten, lavasjö, rykande krater), 🍭 Godislandet (klubbor, chokladflod, pepparkakshus), 🌙 Månen (kratrar, stjärnhimmel
  med jorden, låg tyngdkraft för alla) och 🥣 Köket (ett jättebord med rutig duk, flingor, muggar och sylt). Akt 2 drar mest
  öknen och vulkanen, akt 3 godis, månen och köket, blandat med de gamla (`ACT_COURSES` i `src/run/map.ts`).
- **Variation** (`src/shared/variation.ts`, `src/rally/variant.ts`): från platsens frö (snabbracet får ett eget) kan banan
  speglas och/eller köras åt andra hållet, rekvisitan tätare eller glesare, marken och träden få en nyans, och dag/natt och
  regn väljs (aldrig regn på månen, i köket eller i öknen). Pads, mynt och höbalar placeras också från fröet.
- **Bossar**: fas 3 hade Bengt, Ingrid och Frost-Frida. De är borta sedan fas 16; nu väljer fröet en boss ur en pool per akt (se "Alla är människor i hjälm (fas 16)") och **Kapten Kanin** kör fortfarande soffa på månen i jättehopp.
- **Talismaner för fordonen**: Sidvagn (motorcykel), Turbofläkt (traktor), Ringklocka i guld (moppe), Ångvisslan, Fordonskarusellen
  (byter fordon varje varv) med flera. `buildMods(owned, body)` låter en talisman veta vilket fordon man kör.

## Enheter och finish (fas 4)

- **Dammet** på grus och sand är lätt och kortlivat, och tonas ut mellan kameran och spelarens egen bil (`Particles.setViewer`).
- **Pek och enheter**: kontrollerna ligger utanför minikartan och pausknappen (alla knappar ≥ 44 px), respekterar safe-area, flera
  fingrar fungerar samtidigt (styr + handbroms), tryck på menyer startar aldrig racing. Första tryck: ljudet vaknar och mobil/surfplatta
  går till helskärm där webbläsaren tillåter det (på iPhone: tips om att lägga till på hemskärmen). Ingen dubbeltrycks-zoom, inga
  långtrycksmenyer, ingen textmarkering. `public/manifest.webmanifest` + ikoner (`public/icon.svg`, PNG) och apple-meta gör att
  spelet kan läggas på hemskärmen och köra i helskärm.
- **Prestanda**: `quality: 'low'` (pek/små skärmar) har inga skuggor, färre partiklar, tunnare rekvisita och lägre pixelratio, och
  loppet sänker upplösningen själv om bildfrekvensen sjunker (`adapt()` i `src/rally/index.ts`).
- **Inställningar** (`src/settings.ts`, från titeln och pausmenyn): ljudvolym, musik, skakningar, visa FPS, helskärm.
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
  akt 1 och mest Blodbad i akt 3. Dödslopp lutar åt Blodbad, "slå klockan" är alltid Rally, och bossarna kör efter humör (sedan fas 16: Göran, Freddie, Berit och Kapten Kanin Blodbad,
  Torsten och Mats Blandat, Tina och världsmästarna Rally).
- **Blodbad**: alla bilar har hälsa (din syns som en stapel nere till höger, rivalernas som små staplar över huvudet). Smällar tar hälsa
  efter hastighet, vikt och rammarkraft (`src/rally/combat.ts`): traktorn och monstertruck puttar, moppen studsar. Vid 0 är bilen
  **vrak**: den vältar, ryker och ligger ute i ca 3 sekunder och är sedan tillbaka på vägen med det mesta av hälsan (ingen blir utslagen
  för gott). Den som gjorde den sista stora smällen inom 2 sekunder får en **takedown** (en liten rad i sidan, inte mitt på skärmen).
  **Poängen** (ändrade i fas 17, se längst ner): skada du gör, vrakade bilar och en mindre del för placeringen. Mest poäng vinner loppet. Hjärtat, priset och belöningen följer placeringen **på poäng**. Resultatkortet räknar upp hur poängen blev till.
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
- **Tak mot skenande staplar** (`capTune` i `src/rally/mods.ts`, `maxStack` på talismanerna): kraft, grepp, nitrolängd och antal, sladdturbo,
  knuff, tålighet, mynt, kronor och bilens totala kraft och grepp har mjuka tak (linjärt till ett knä, sedan mot ett max). Nitro
  räcker högst 12 sekunder per lopp. Talismaner som skenar (Pruttboost, Chilikorven, Dino-Dieseln …) slutar ge mer efter 2-3 exemplar.
- **Riktiga boostar**: en boost lyfter bilens fartgräns och ger en knuff framåt som varken däck, växellåda eller `feel.top` stoppar (`boostEff`,
  `boostSpeedK` och `BOOST_*` i `src/rally/car.ts`). Nitron är starkast (cirka +25-35 % topphastighet i 2,2 s), sladdturbon växer med nivån
  (+15 / +22 / +30 %), farthoppen och förmågornas boostar ger fart i proportion till sin styrka, och rivalerna följer samma regler. När en boost
  tar slut klingar farten av mjukt, den bromsar aldrig. Känslan: kameran vidgas och backar, fartstrimmor i kanterna (svagare på låg kvalitet),
  större flamma, ett svisch med stigande ton, en kort vibration där webbläsaren kan och glödande farträknare. Testet `src/rally/boost.test.ts`
  kör nitron i den riktiga fysiken på en raksträcka.
- **Byte efter varje lopp** (fas 17, se längst ner): efter VARJE lopp i varje akt får du välja 1 av 3 kort, en slumpad (seedad) blandning av talismaner och uppgraderingar, och placeringen avgör kvaliteten. Ingen flikväljare och inget tröstpris för tvåan längre.
- **Humor**: kaos, inte toalett. Högst tre talismaner handlar om prutt och bajs (Pruttboost är sällsynt, Bajsraketen legendarisk); bara de pruttar och lämnar det gröna molnet. Resten har egna effekter (konfetti, gnistor, glitter, studsar). Nya slumpade talismaner: Platsbytar-Pelle, Kon från ovan, Slumpväxeln och Tombolan. Inga svordomar: `src/language.test.ts` skannar alla texter.
- **Talismanernas vägar** (`path` på alla 52): `ram`, `race`, `fuffens`, `stunt`, `girig`, `kaos`. Fas 9 bygger på dem.
- **Balanssimuleringen** (`src/run/balance.test.ts`, `src/run/racesim.ts`, `src/shared/pace.ts`) räknar med varvtider i stället för tärningar:
  spelarens varv från bil, delar, talismaner och skicklighet, varje rivals varv från dess skalade kit, och loppet körs sida vid sida
  med catch-up, hinder, kontakt och (i Blodbad) takedowns. Varvtidsmodellen är anpassad mot den riktiga fysiken (`src/rally/pace.test.ts`).

## Resultatskärmen (fas 6b)

Efter en seger, efter sista hjärtat och efter en omladdning på sista kortet visas `resultView` (`src/ui/result.ts`, siffrorna räknas ut i
`src/run/summary.ts` och är testade i `summary.test.ts`):

- **Huvud**: stor dom (seger, eller vilken akt och plats du föll på), fordon, ditt namn med hjälmen, lack, frö, total åktid och en bricka för svårigheten (🛋️ Söndagsåkare, 🔥 Hård, 💀 Ett liv).
- **Rundans mest galna siffra** med en rolig rad, sedan 6-10 sifferkort och "Visa alla" för resten. Loppen sparar nu bland annat toppfart,
  längsta sladd, tid i luften och hopp, nitrosekunder, oljefläckar, omkörningar, utlagda fällor, bästa varv och hur ofta varje talisman utlöstes
  (`RaceStats` och `RallyResult`, summeras i `src/run/stats.ts`; toppfart och längsta sladd är maxvärden). Rundan räknar också pallplatser,
  kronor spenderade och åktid. Gamla sparningar laddas med nollor.
- **Tidslinje**: varje besökt plats i ordning (`RunState.log`) med typ, sort (Rally/Blandat/Blodbad), bana, placering eller poäng, belöning och
  förlorade hjärtan, med aktavskiljare. En horisontell remsa på dator och surfplatta, en lista på mobil.
- **Bygget**: varje talisman med antal och varifrån den kom ("Vann Golf-Göran", "Köpt i kiosken", "Händelse: …", `RunState.got`), uppgraderingsträden med taget nod för nod och kombona,
  byggets mix per väg som en stapel ("55 % Ram · 30 % Fuffens · 15 % Race") och fordonets förmåga (`abilityOf`: aktiv förmåga med hur många gånger du använde den, och passiven).
- **Troféer och upplåst**: varför troféerna blev så många, nya bilar och talismaner, nästa medalj att jaga och de **medaljer** rundan flyttade ("Takedowns i en runda: 6/10", eller "🏅 MEDALJ! Krossmästaren").
- **Svårighet**: på pekskärmar får rivalerna inte längre någon extra lättnad i normalt läge, bara i Söndagsåkare. Se "Fyra svårigheter" nedan.

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
| Moppe | 4 | 47 / 86 / 133 / 191 | 0,13 s |
| Traktor | 6 | 32 / 58 / 86 / 119 / 155 / 194 | 0,26 s |
| EPA-traktor | 5 | 32 / 58 / 86 / 130 / 194 | 0,22 s |
| Glassbil | 4 | 43 / 79 / 122 / 173 | 0,25 s |
| Sopbil | 6 | 29 / 54 / 83 / 115 / 151 / 194 | 0,26 s |
| Snöskoter | 3 | 65 / 122 / 202 | 0,06 s |
| Gokart | 4 | 54 / 97 / 144 / 194 | 0,05 s |
| Golfbil | 4 | 40 / 72 / 119 / 191 | 0,10 s |
| Åkgräsklippare | 5 | 36 / 65 / 104 / 148 / 187 | 0,16 s |
| Husbil | 5 | 40 / 76 / 115 / 155 / 194 | 0,28 s |
| Limousin | 5 | 58 / 104 / 151 / 202 / 259 | 0,18 s |
| Raketvagnen | 1 | 209 | 0,10 s |

Sedan fas 18 når alla fordon ungefär samma toppfart (se "Alla tjugo fordon är jämna" nedan), så de långsamma har fått växlar upp till 190 km/h och mer; en skicklig manuell förare är fortfarande lite snabbare än automaten (ca 1-4 % på en start) och en slarvig klart långsammare.

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
GameContext), `src/run/` (rena regler för rundan: karta, talismaner, ekonomi, händelser, sparning, meta), `src/ui/` (skärmarna)
och `src/app.ts` (skalet: paus, pekkontroller, flödet mellan skärmar och lopp). Ett lopp startas med `RallyOptions`
(`src/rally/options.ts`) och rapporterar `RallyResult` via `onDone`.

Dev-bygget har också `window.__rallyDebug` (`ramps()`, `at(s, d, fart)`, `board()` för derbyt, `tumble()`, `honk()`, `swap(kropp)`, `takedown(n)`, `hurt(n, hp)`, `ability()`, `park()`, `freeze()` / `thaw()`, `ahead(n, avstånd, fart)` / `behind(...)` och `hazard(sort, avstånd, sida)`) under ett lopp. För tester finns `window.__app` med `fakeFinish()` (avslutar loppet direkt med ett påhittat resultat), `debugRun()`,
`debugEnter(typ, sort?)`, `debugDerby(arena?, boss?)` (gör ett dödslopp eller bossen till ett rivningsderby och går in i det) och `debugMeta()`. I dev-bygget finns dessutom `?rallydebug&rallyauto&rallyturbo=30&rallygo` som låter
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
**starttalisman** som följer med fordonet in i rundan (`newRun` lägger den i väskan). Loppet gör det som id:na säger (`useAbility`, `abilityStep` och passiverna i
`src/rally/index.ts`); passiverna som är körkänsla ligger i `feel` i `src/shared/rally.ts` (sandbuggyns `roll`, sportbilens luftmotstånd, monstrets och pickupens massa).

| Fordon | Lutning | Passiv | Aktiv (F) | Nedkylning | Starttalisman |
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
| 🛋️ Soffbil | Blandat | Kaosarvet: en slumpad talisman varje akt | 🛋️ Soffkudde-kaos: slumpar rusning, hopp, höbalar, pannkaka, platsbyte, korvkanon, slem eller spöke | 11 s | Slumpväxeln |

Datorförarna använder sina fordons förmågor lite grann (racers en fartstöt, rammare en stöt mot någon nära framför, bara i Blandat och Blodbad), högst var 15:e–40:e sekund.
Förmågorna är av i Snabbracets rättvisa läge (`rules.sameCars`). Balansen: de som ändrar farten finns i `src/shared/abilities.ts` (`PASSIVE_LAP`, `PASSIVE_RAM`, `save` per förmåga)
och går in i `playerStats` i `racesim.ts`; rivalernas mod blev lite skarpare med ökande akt (`rivalSkill`) för att kompensera starttalisman och förmåga.

**Medaljer** (`src/run/medals.ts`, `meta.ts`; förr utmaningar som låste upp fordon): femton medaljer, en per fordon som inte är en av de fem första, och ingen låser något. Alla fordon är öppna, medaljerna är att skryta med:

| Medalj | Mål |
|---|---|
| Rundvinnaren | Vinn en runda |
| Söndagsvinnaren | Vinn en runda på Söndagsåkare |
| Krossmästaren | Gör 10 takedowns i en runda |
| Moppen mot bossen | Slå akt 1-bossen med moppen |
| Helt orörd | Vinn akt 2 utan att tappa ett hjärta |
| … | (och tio till, se `MEDALS`) |

En medalj är data (`MEDALS`): namn, bild, ett mål och en `measure(run)` som säger vad en runda kommit fram till. `mode: 'best'` är mest i en runda och kollas efter varje steg
(`checkMedals` i `commit`, med en liten "MEDALJ!"-remsa i hörnet, aldrig mitt i bilden), `mode: 'total'` summeras över rundor och räknas en gång när rundan tar slut (`RunEnd` skyddar mot dubbelräkning).
Skrytlådan visar alla medaljer med framstegsstapel och en "MEDALJ!"-lapp på de intjänade, resultatskärmen de som flyttade sig och nästa medalj att jaga. Framstegen ligger i `Meta.progress`, med samma id:n som utmaningarna hade.
**Migrering**: `Meta.bodies` finns inte längre. En sparning från före medaljerna har en lista över öppna fordon (eller, i de allra äldsta, bara troféer: `LEGACY_BODY_UNLOCK`), och varje fordon som var öppet blir en intjänad medalj en enda gång, framsteg som redan fanns behålls. Sparningen skrivs sedan i medaljformat (`Meta.medals: 1`) och lyfts aldrig igen, så troféer ensamma delar aldrig ut medaljer. Fält i sparfilerna som `chal0`, `opened` och `unlockedBodies` heter som förut.

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
- **Förare**: alla är människor i hjälm med visir (`helmet`, `driverHead` i `models.ts`) och overall med rand och selar (`overallsColor`). Fram till fas 16 fanns djurförare (grisen, tuppen, kon …); de är borta och alla har
  nu en egen hjälmfärg och ett eget mönster, se fas 16. Mopedens och buggyns förare syns tydligast.
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

Nu finns det **20 fordon**: fem som förr var de enda öppna och femton som förr låstes upp av utmaningar (nu är alla öppna och utmaningarna är medaljer). De tio nya är gjorda i samma stil som de andra (konturer, sponsorlappar, smuts och skador, en förare i hjälm; modellerna ligger i `src/rally/vehicles2.ts`),
och varje fordon har egen körkänsla (`CAR_BODY_DEFS` i `src/shared/rally.ts`), egen växellåda (`gears.ts`), eget motorljud (`audio.ts`), en lutning, en passiv, en aktiv förmåga med nedkylning (`src/shared/abilities.ts`, gör sitt i `src/rally/index.ts`),
en starttalisman och en utmaning. Tre nya körkänslor finns i `Feel`: `loose` (snö, is och sand greppar som asfalt: snöskotern), `grass` (högre fart och nästan ingen broms på gräs: gräsklipparen) och `slide` (när bakdelen väl släpper fortsätter sladden: limousinen).

| Fordon | Lutning | Passiv | Aktiv (F) | Nedkylning | Växellåda | Starttalisman | Medalj |
|---|---|---|---|---|---|---|---|
| ⚠️ EPA-traktor | Blandat | Spärr 30: spärren sitter högt på asfalt och släpper på gräset, och inget bromsar (gräs, lera, olja, höbalar) | ⚠️ Gasa på EPA: spärren av i 4 sekunder, lång fartstöt | 6 s | 5, seg men lång | Pensionärsrabatten | Slå en akt 1-boss |
| 🍦 Glassbil | Blandat | Glassmelodin: bilar inom 15 m saktar ner och en melodi spelas | 🍦 Glasskanon: tre glaskulor landar framför dig och gör vägen hal | 13 s | 4, lat | Lördagsgodiset | Samla 150 mynt i en runda |
| 🗑️ Sopbil | Ram | Plockar upp: fällor du kör på plockas upp, varje bit ger lite pansar (max 6) | 🗑️ Tömning: en hög skräp bakom dig, större ju mer du plockat | 12 s | 6, tung | Pantmotorn | Samla ihop 12 talismaner i en runda |
| ❄️ Snöskoter | Race | Allt grepp: full grepp på is, snö och sand | ❄️ Pudersvans: snömoln som gör bilarna bakom blinda och långsamma | 11 s | 3, snabb | Bastu på taket | Slå en akt 2-boss |
| 🏁 Gokart | Race | Sugen i rygg: slipströmmen fylls dubbelt så fort, fullt ger en gratis fartstöt | 🏁 Gokartsladd: en perfekt sladd direkt, ger nitro | 10 s | 4, blixtsnabb | Frityroljan | Sladda i 40 sekunder i en runda |
| ⛳ Golfbil | Blandat | Tyst som en mus: rivalerna går inte på dig och blockerar dig inte | ⛳ Hole in one: en golfboll slår ledaren i sidan | 10 s | 4, eldrift | Pappas pokal | Kom till akt 2 på Söndagsåkare |
| 🌿 Åkgräsklippare | Blandat | Gräsälskare: snabbare på gräs än på vägen | 🌿 Gräsklippning: ett gräsregn som klipper bort allt farligt framför dig | 8 s | 5, små | Kon från ovan | Använd förmågan 20 gånger i en runda |
| ⛺ Husbil | Ram | Hemma på hjul: plåten lagas medan du kör, i Blodbad kommer hälsan tillbaka | ⛺ Utfällt tält: ett markistält bakom dig som snurrar följarna | 14 s | 5, klonkig | Begagnat hjärta | Kör klart 5 rundor |
| 🕶️ Limousin | Race | Rutschkana: lång sladd, och sladdturbon fylls 35 % fortare | 🕶️ VIP-fil: rakt genom bilar i drygt 3 sekunder | 13 s | 5, mjuk | Källarfest-discot | Spendera 900 kronor i en runda |
| 🛒 Raketvagnen | Race | Skranglig: vagnen vinglar slumpmässigt | 🛒 Raketen: gigantisk fart i knappt 4 sekunder, styrbar nog | 7 s | 1 + raket | Chilikorven | Vinn en runda med moppen eller traktorn |

Tre av dem är lätta för en tioåring: golfbilen (nå akt 2 på Söndagsåkare), husbilen (spela fem rundor) och gräsklipparen (tryck på knappen). Raketvagnen är den svåraste.
Medaljerna räknar sådant som rundan redan sparar (`RunStats`), så rundsparningen är oförändrad.

- **Rivaler**: datorförarna kör ibland de nya fordonen efter humör (`archetypeBodies` i `src/shared/field.ts`): rammare i sopbil och husbil, racers i gokart, limousin och snöskoter, de blandade i glassbil, golfbil, gräsklippare och raketvagn.
  De använder sina förmågor som förut (en fartstöt eller en stöt mot någon nära framför).
- **Bilvalet** har ett filter (Alla, Ram, Race, Blandat) över ett rutnät med alla tjugo fordon som rullar i höjdled i stället för att svämma över. Alla knappar är minst 44 px på telefon, surfplatta och dator, och sidan scrollar aldrig.
  Skrytlådan och resultatskärmen listar fordonen på samma sätt som förut.
- **Balans** (`src/shared/pace.ts`, `src/run/racesim.ts`, `src/rally/bodypace.test.ts`): varje nytt fordon har en uppmätt varvfaktor mot rallybilen (`BODY_LAP`, medelvärde över fyra banor med den riktiga fysiken och datorföraren;
  EPA-traktorn och raketvagnen mäts med sin fartstöt använd). Sedan fas 18 gäller det alla tjugo fordon och ingen är längre ett skämtval, se nästa avsnitt.

## Alla tjugo fordon är jämna (fas 18)

Efter en spelomgång med EPA-traktorn ("helt omöjlig, de andra körde ifrån") och med traktorn ("racen handlar om att vinna") är regeln nu att **varje fordon är ett riktigt val**. Sedan fas 15 är alla fordon öppna från början och variationen i en runda ska komma från belöningarna, så ingen får vara ett skämtval med stora varvtidsunderskott.

- **Toppfart**: på en rak väg (`topSpeed` i `src/rally/bodylap.ts`, 15 sekunder för fullt och 40 sekunder för det som går att nå) ligger alla fordon inom 15 % av det snabbaste, både på kort och lång raksträcka. De långsamma har fått högre tak (`feel.top`), mer kraft och växellådor som går upp till 190 km/h eller mer (`gears.ts`, tabellen ovan). De snabbaste (sportbil, motorcykel, limousin, snöskoter) är neddragna till samma nivå. De tunga behåller sin personlighet genom massa, seghet, ramstyrka, skjuts (vridmoment) och förmågor, inte genom att vara långsamma.
- **Varvtid**: `BODY_LAP` i `src/shared/pace.ts` finns nu för alla tjugo och är uppmätt mot den riktiga fysiken på sex banor (gård, öken, is, stad, äng, berg) med datorföraren; ingen ligger mer än 5 % från rallybilen (bodypace.test.ts kontrollerar det, och att modellen är inom 2 % av fysiken). EPA-traktorn och raketvagnen mäts med sin fartstöt använd, men bara på raksträckor (en förare som tänder raketen i en kurva krockar). Att en rival i vilket fordon som helst är lika snabb kontrolleras också (±6 %).
- **Vinstandelen**: `balance.test.ts` låter en bra spelare (Blandat, Normal, 250 rundor) spela med vart och ett av de tjugo fordonen: ingen får under 70 % eller över 140 % av medianen. Förut fanns åtta fordon med 0-2 % (EPA-traktor, golfbil, gräsklippare, raketvagn, moppe, limousin, sopbil, traktor).
- `bot.ts` kan spela en runda med valfritt fordon (`playRun(…, body)`), och simuleringen räknar gripet och kraften mot kroppens egna tak (mjuka tak, `capGrip`/`capPower`).

| Fordon | Toppfart km/h före → efter | `BODY_LAP` före → efter | Vinst per runda före → efter | Vad ändrades |
|---|---|---|---|---|
| 🚗 Rallybil | 162 → 162 | 1,000 → 1,000 | 0,29 → 0,29 | oförändrad (måttstocken) |
| 🏖️ Sandbuggy | 160 → 159 | 0,959 → 0,979 | 0,43 → 0,42 | lite mindre grepp (1,1 → 1,0), annars samma |
| 🛻 Pickup | 158 → 159 | 1,019 → 0,995 | 0,19 → 0,29 | mer grepp (0,95 → 1,02) |
| 🏎️ Sportbil | 179 → 165 | 0,976 → 1,003 | 0,47 → 0,31 | tas ner: mindre kraft (1,2 → 1,0), mindre grepp, luftmotstånd 0,78 → 0,92 |
| 🦖 Monstertruck | 151 → 151 | 1,032 → 0,999 | 0,22 → 0,43 | mer grepp (0,9 → 0,98) |
| 🛞 Fyrhjuling | 162 → 161 | 0,963 → 0,976 | 0,27 → 0,36 | lite mindre grepp |
| 🏍️ Motorcykel | 185 → 165 | 1,061 → 0,999 | 0,06 → 0,27 | tas ner: kraft 1,35 → 1,05, luftmotstånd 0,72 → 1,0, mer grepp (0,84 → 0,97) |
| 🛵 Moppe | 85 → 160 | 1,157 → 0,985 | 0,00 → 0,30 | tak 24 → 49 m/s, kraft 0,62 → 0,95, tåligare (0,75 → 1,0), Väj! var 6:e sekund och sparar tid |
| 🚜 Traktor | 74 → 146 | 1,295 → 1,037 | 0,04 → 0,38 | kraft 0,7 → 1,2 och skjuts 0,85 → 1,4 (vridmoment), tak 21 → 50 m/s, ny växellåda; kvar: massa 3,6, seghet 2,2, ram 1,8, Rammbock var 11:e sekund |
| 🛋️ Soffbil | 159 → 161 | 1,032 → 0,992 | 0,12 → 0,31 | mer grepp (0,92 → 1,03) |
| ⚠️ EPA-traktor | 39 → 155 | 1,163 → 0,987 | 0,00 → 0,35 | spärren från 11 till 49 m/s på asfalt men 12 % högre på gräs, kraft 0,7 → 1,0, skjuts 0,9 → 1,3, grepp 0,92 → 0,97, snabbare att styra; Gasa på EPA 2,4 → 4 s, nedkylning 8 → 6 s och går att kombinera med full fart på hela raksträckan |
| 🍦 Glassbil | 141 → 154 | 1,050 → 0,993 | 0,06 → 0,31 | kraft 0,9 → 1,05, grepp 0,92 → 1,05, mindre luftmotstånd |
| 🗑️ Sopbil | 88 → 147 | 1,165 → 1,030 | 0,02 → 0,36 | kraft 0,95 → 1,2, skjuts 0,9 → 1,35, tak 25 → 50 m/s; kvar: massa 3,0, seghet 1,8, ram 1,5, plockar upp |
| ❄️ Snöskoter | 172 → 166 | 0,999 → 0,985 | 0,28 → 0,39 | lite mer luftmotstånd |
| 🏁 Gokart | 125 → 151 | 0,965 → 0,989 | 0,24 → 0,29 | tak 36 → 50 m/s, kraft 0,95 → 0,75 (mer grepp, 1,3), tåligare (0,55 → 1,2) |
| ⛳ Golfbil | 78 → 159 | 1,231 → 0,972 | 0,00 → 0,39 | tak 22 → 49 m/s, kraft 0,6 → 0,95, skjuts 0,8 → 1,1, lite kvickare styrning; Hole in one var 10:e sekund |
| 🌿 Åkgräsklippare | 71 → 160 | 1,322 → 0,976 | 0,00 → 0,38 | tak 20 → 48 m/s, kraft 0,65 → 1,15; på gräs fortfarande snabbast (gräsfaktor 1,45 → 1,4 av ett högre tak) och klipper genvägar över ängen |
| ⛺ Husbil | 99 → 146 | 1,144 → 1,042 | 0,06 → 0,44 | kraft 0,85 → 1,2, skjuts 0,85 → 1,3, tak 29 → 50 m/s, mer grepp |
| 🕶️ Limousin | 172 → 164 | 1,120 → 1,000 | 0,01 → 0,44 | tas ner på raksträckan (luftmotstånd 0,72 → 0,97) men styr och greppar bättre i kurvor (styrning 0,68 → 1,0, tröghet 1,75 → 1,2, grepp 0,88 → 1,08) |
| 🛒 Raketvagnen | 64 → 161 | 1,324 → 0,992 | 0,00 → 0,31 | tak 18 → 52 m/s, grepp 0,8 → 0,97, tåligare (0,45 → 1,1); raketen oftare (var 7:e sekund), längre (3,8 s) och lättare att styra (55 → 75 %), vinglandet halverat |

## Bilen som växer (fas 11)

Som i Tape to Tape blir det svårare genom rundan (rivalerna växer lite brantare än förut) medan din bil blir bättre, eller åtminstone annorlunda:
vilka noder, talismaner och förmågor du har bestämmer hur rundan känns. Allt ligger i `src/run/upgrades.ts` och är testat i `src/run/upgrades.test.ts`.

**Fem träd, tre eller fler rader i varje, 2-3 nivåer per rad och en topp.** En rad är data: `tune` ändrar siffror när loppet startar, `hooks` reagerar på vad som händer (som en talisman), `perk` ändrar rundan. En nod är en nivå av en rad ("ram.plates2"); nivå 2 kräver nivå 1, toppen kräver 4 noder i trädet.

| Träd | Rader (nivåer) och vad de gör |
|---|---|
| 🛡️ **Ram** | Pansarplåt (3): tål mer, mer hälsa i Blodbad. Ballast (2): tyngre, knuffar mer. Spikar (2): hårdare knuff. Slägga (2): 35 % mer skada på andra bilar. Stötvåg (2): en stötvåg efter en stor smäll. Rambooster (2): stötfångaren slår hårdare under nitron. **Skrotkungen**: vrak ger stötvåg och lagning. |
| 🏎️ **Race** | Motor (3): +10 % effekt. Grepp (3): +6 %. Bromsar (2). Nitro (3): +1 laddning per nivå. Nitrolängd (2). Sladd (2): sladdturbon laddar fortare, en spark efter varje sladd. Aero (2): topphastighet. **Formelbilen**: en spark på varje boost. |
| 🦨 **Fuffens** | Oljeläcka (2): olja bakom dig på boost. Minor (2): en mina under hård bromsning eller på handbromsen. Falska mynt (2): guldmynt som poppar och snurrar bilen. Rökgranat (2): nitron lämnar en blindande rökridå. Höbalskastaren (2): hö landar framför närmaste bil. **Fuffens-mästaren**: knepen 45 % oftare, en fälla gratis varje varv. |
| 🤸 **Stunt** | Stötdämpare (3): mjukare landningar. Flygtid (2): långa hopp ger nitro och kronor. Volter (2): bilen tar en volt i luften. Två hjul (2): långa sladdar och wheelies fyller nitron. Nära ögat (2): omkörningar på en hårsmån ger nitro och kronor. **Stuntstjärnan**: 40 % mer från alla stunts. |
| 🤑 **Girig** | Ränta (3): 5/10/15 % av kronorna efter varje plats (högst 60). Dusör på ledaren (2). Vrakförsäkring (2): kronor vid hård smäll och vrak. Rabattkort (2): 10 % per nivå i kiosken och Skruvhörnan. Guldkant (2): dyrare mynt, bilen får guldkant. **Kapitalisten**: 15 % mer kronor och ett extra kort. |
| 🎲 **Kaos** | Inget träd: en smak på de legendariska talismanerna (och en halva av Lotterivinsten). |

**Fordonets egna uppgraderingar**: varje fordon har två, tagna i ordning (`car.<fordon>1` och `2`), som stretchar eller förgrenar dess aktiva förmåga: kortare nedkylning (`abilCd`), längre varaktighet (`abilDur`, stretchar alla timers som förmågan just startade) eller en extra
effekt efter användning (`plus`: olja, höbalar, stötvåg, boost, rök, kronor, nitro, lockbil, lagning, mina). Traktorns Rammbock blir 50 % längre och släpper sedan också höbalar, moppens Väj! blir längre och lämnar en lockbil som bilarna bakom saktar in för, golfbilens Hole in one laddar fortare och slår en stötvåg där bollen landar.
De visas bara för den som kör det fordonet.

**Hur man får dem.** Efter varje lopp visar belöningsskärmen tre kort, en blandning av 🛠️ uppgraderingar och 🎁 talismaner (fas 17, inga flikar); du tar ETT. Korten ger bättre eller sämre kvalitet efter placeringen. Korten dras ur de öppna noderna (`drawUpgrades`
i `economy.ts`) och lutas av sorten (`KIND_TREE_BIAS`): Blodbad ger Ram (×2,6) och Fuffens (×1,9), Rally ger Race (×2,6) och Stunt (×1,9), Blandat är öppet. Fordonets lutning (Ram/Race) ger en liten extra knuff, ett träd man redan går i kommer upp oftare (så ett bygge får en form), tre kort
från minst två träd, bossar bjuder oftare på toppar och högre nivåer. Ett kort som väcker en kombo har en stjärna. I **Skruvhörnan** ligger sedan fas 17 bara 2-3 slumpade noder på hyllan: en nivå I eller II är gratis, resten kostar kronor (`upgradePrice`, se tabellen i Fas 17: pengarna). Händelser som "tunar bilen" ger en slumpad nod.

**Kombos** (10 st, `COMBOS`): två saker du äger väcker en kombo, och den visas som en liten "KOMBO!"-lapp i hörnet (aldrig mitt på skärmen) och som en guldkantad ikon först i loppets talisman-remsa.
Spikmattan (Spikar + Oljeläcka: smällar lämnar olja), Luftburen (Flygtid + Nitro: landningar fyller nitro), Lotterivinsten (Ränta + valfri Kaos-talisman: lott efter varje varv), Eldkastaren (Pruttboost + Chilikorven: en kort eldstråle bakåt, sällsynt),
Pansarraketen (Stötvåg + Nitro), Sladdmolnet (Rökgranat + Sladd), Dödsföraktet (Nära ögat + Vrakförsäkring), Prisjakten (Dusör + Slägga: kronor och nitro för varje vrak), Minfältet (Minor + Flygtid) och Stålspargrisen (Pansarplåt + Ränta). Fliken Kombos i Bygget visar alla tio med receptet.

**Bilen syns.** `src/rally/modlook.ts` bygger bult-on-delar för varje rad och nivå ovanpå trimgeometrin, från de mått varje kropp redan ger bygget (bredd, nos, akter, tröskel, bälte, tak, hjul), så alla tjugo fordon får dem och en ny kropp får dem gratis
(fordon där föraren sitter ovanpå, som cyklarna, traktorn och soffan, får sakerna på bagagehyllan bakom föraren i stället för på taket). Ram: sidoplåtar, spikar, stötfångarstång och ramplatta, hästhorn, sandsäckar, boostertank. Race: dubbla avgasrör, breda skärmar, frontsplitter och jättevinge, nitroflaskor, hajfena.
Fuffens: oljefat, rökgranat, minor på stötfångaren, ett falskt mynt i en tråd, hö på taket, trollkarlshatt. Stunt: ramp, rullbur, flaggor, stuntstänger, guldstjärna. Girig: guldlist, en pengasäck, en guldflagga, en guldprydnad. `bodySpecOf` i `models.ts` ger testerna alla kroppars mått:
`upgrades.test.ts` ritar varje rad på alla tjugo kroppar och kollar att allt sitter nära bilen.

**Bygget** (☰ Paus → 🧰 Bygget, och 🧰 i kartans övre list): bilen på skivspelare med sina mods, byggets mix per väg, och träden som flikar med tagna, öppna och låsta noder (tryck för att läsa; kombofliken visar alla recept). Skruvhörnan har sedan fas 17 en egen hylla med kort.

**Ge upp rundan** (☰ Paus → 🏳️ Ge upp rundan, med bekräftelse: "Nej" är förvald, Escape betyder nej): rundan räknas som en runda men ger inga troféer, medaljer av typen "bäst i en runda" behåller det som redan klarats, de som räknas över rundor ("Vinn en runda", "Kör klart 5 rundor") räknar den inte. Sedan väljer du fordon på nytt med samma fordon, hjälm och lack förvalda. "Ge upp och visa resultatet" visar resultatsidan ("Gav upp i Akt X"). Logiken ligger i src/run/giveup.ts.
Telefon på sidan: bilen till vänster, träden till höger, panelen scrollar inuti; surfplatta stående: bilen överst. Alla knappar är minst 44 px och sidan scrollar aldrig. Resultatskärmen visar träden nod för nod (med varifrån varje kom), fordonets uppgraderingar och de aktiva kombona.

**Sparningar.** `RunState.up` är listan av noder. Äldre sparningar har sex delnivåer (`car.parts`) i stället: vid inläsning blir varje nivå den nod den blev (`PART_LINE`: motor → Motor, däck → Grepp, bromsar → Bromsar, turbo → Nitro, pansar → Pansarplåt, fjädring → Stötdämpare; `partsToNodes`),
delarna nollas, gamla "del"-poster i byggloggen blir noder och ett gammalt belöningskort `part:armour` blir nästa nod i den raden. Testat i `upgrades.test.ts` och `save.test.ts`. Pausmenyns bygge och talismanremsan i loppet läser samma data.

**Balans.** Mjuka tak gäller som förut (`capTune`: byggets egna kraft och grepp tas nu med uppgraderingar och talismaner tillsammans, kroppens total tas av `capPower`/`capGrip`; nitroladdningar 5 och 12 sekunder i högsta fall). Rivalernas kurva växer lite brantare
(`partLevel` upp till 4,9, catch-up i akt 3 16 %) för att hänga med. Mätt i `balance.test.ts` med bottar som köper noder (ett kort av sex, den fria noden i verkstaden): en bra spelare vinner ungefär 58 / 28 / 47 % av normala rundor med Race / Ram / Blandat som strategi
(Ram vinner mest via Blodbad: 0,54 mot 0,35 för en renodlad racer, medan racern tar Rally 0,88 mot 0,69), en stark spelare 77 / 72 / 90 %, Söndagsåkare är kvar över 90 % för en genomsnittlig spelare, och ingen färdig uppsättning (Ram, Race, Stunt, Fuffens, Girig) varvar fältet i akt 3,
inte ens "alla noder + alla talismaner" (bästa spelare vinner under 99 % av loppen).

## Rivningsderby, stuntramper och balans (fas 12)

**💥 Rivningsderby** (`src/shared/derby.ts`, `src/rally/arena.ts`, `arenabuild.ts`, `derbyai.ts`) är en ny sorts plats på kartan: ungefär ett dödslopp per akt (seedat) och ibland sista bossen, Kapten Kanin
(40 % av rundorna, och då med månens tyngdkraft). Kartan visar en 🏟️ med en liten DERBY-lapp och en rad i teckenförklaringen; kortet före loppet förklarar regeln på en rad.

- **Arenan**: en sluten ring av väldigt bred väg (så fysiken, datorförarna och minikartan funkar som vanligt) runt en fast ö i mitten med en skrothög, en strålkastarmast och en randig kant. Två former: den runda *Skrotskålen* (en stor öppen yta) och den långa *Däckovalen* (ett varv runt en lång ö).
  Däckvägg på båda staketen, tre läktare med en publik som hoppar när du är nära, sponsorskyltar, strålkastartorn med ljuspölar (och strålar på natten) och ramper på golvet. Seedet sätter åkriktning, ramperna, färgerna och om det är natt eller skymning.
- **Reglerna**: inga varv och ingen mållinje. Alla bilar har hälsa (×1,8 mot Blodbad och smällarna gör 38 % mindre, så ett derby tar en minut eller två) och en **vrakad bil är ute för gott**: den ligger kvar och ryker i fyra sekunder och forslas sedan bort. **Placeringen är rangen på poäng** (fas 17: skada du gör + vrak + hur länge du höll; vem som rullar när tiden är slut avgör inte, och hälsan inte heller). Åker du ut avslutas derbyt två sekunder senare (resten fortsätter i bakgrunden).
  Hjärtat följer samma regel som annars: nedre halvan på poäng kostar ❤️ (bossen: vinner du inte, −❤️❤️). Ett vinst-, dödslopps- eller bossbyte delas ut som vanligt och lutar åt Ram (Blodbad).
- **Datorförarna** (`DerbyBrain`): rammarna jagar (siktar framför bilen de är ute efter, runt ön om den är i vägen), och sedan fas 17 jagar alla: racerna och de blandade också, och de kommer in mot en flank eller bakifrån, inte nos mot nos. Bara en riktigt sönderkörd förare väjer. De första sex sekunderna cirklar alla och spanar, undviker staketen och ön, backar ut ur hörn, tar en annan bil än den de är fastlåsta i, och en förare som fastnar gång på gång sätts tillbaka på en ledig plats. Fordonens förmågor och dina uppgraderingar funkar som i ett Blodbad.
- **HUD**: en panel överst med bilar kvar, klockan (röd sista kvarten) och dina takedowns, tavlan med hälsa i procent och 💥 för utslagna, minikartan som en ring med ön som ett hål, hälsostaplar över rivalerna. Resultatkortet säger hur det gick, visar hela tabellen (utslagen efter 1:12, rullade kvar med 84 % hälsa) och tidslinjen har ett derbykort.
- **Test** (`derby.test.ts` ×2): utslagsordning, klockan, placering och poäng, hjärtan, kartan, planen, belöningarna, en körd derbysimulering med riktig fysik (ingen lämnar golvet, ingen fastnar).

**🤸 Stuntramper och genväg** (`src/rally/ramps.ts`, `rampmesh.ts`, `Ground.lift` i `car.ts`): varje bana får tre kickers (en kil som stiger mot kanten och faller bort, 1,25 m hög) och ett genvägshopp (en stor kil, 2,7 m, med en båge och en lysande GENVÄG-skylt över vägen, "BRA HOPP!" på baksidan).
Placeringen är seedad och kontrollerad mot banan: på rak, plan, vanlig väg (inte i kurva, på bro eller i tunnel eller på is), inom vägens bredd, på den sida som ligger längst från racinglinjen (rivalerna kör där och struntar i dem), minst 70 m från start och från varandra, och en smalare väg får en smalare ramp.
En ramp är en upphöjning av marken i vägens egna koordinater (s längs, d tvärs), så fysiken och meshen läser samma siffror; flaggstänger gör dem synliga på långt håll. Hoppar du över genvägen med minst 21 m/s och landar 14-105 m efter kanten får du **45 m av banan skänkta** (en gång per varv) och Stunt-uppgraderingarna
betalar som för ett jättehopp (Flygtid, Luftburen, Stuntstjärnan). Alla tolv banor i alla spegel- och bakvända varianter har sina ramper (`ramps.test.ts`). I derbyt ligger ramperna (kickers och pukklar) utspridda på golvet åt alla håll.

**⚖️ Balans** (`src/run/bot.ts`, `racesim.ts`, `balance.test.ts`): Ram låg på 28 % mot Race 58 % i normala rundor. Nu vinner en bra spelare ungefär **43 % med Race, 47 % med Ram och 50 % med Blandat** (före: 58 / 28 / 47; 300 rundor, ± 3 pp). Det som flyttade: **skrotpant** (var fjärde vrakad bil under en runda ger ett förlorat ❤️ tillbaka, aldrig över fulla hjärtan och aldrig på sista andetaget; kortet efter loppet visar räknaren),
tung stötfångare lönar sig i Blandat och Blodbad (modellen: sekunder per varv för ram och vikt, inte i Rally), bossarna fick Blodbad-humör (sedan fas 16: tre av nio bossar är Rally, två Blandat, fyra Blodbad), en egen derbymodell i simuleringen (utslagsordning med överlevnad, undvikande och slag; en bra Ram-spelare vinner ett derby ungefär en gång av fyra, en renodlad racer var sjätte) och de långsamma skämtfordonens förmågor får kortare nedkylning (golfbilen 12 s, gräsklipparen 8, limousinen 10, husbilen 11, moppen 8, traktorn 13, sopbilen 10).
Det som hålls: ingen varvas i akt 3, Söndagsåkare går att vinna nästan alltid, ingen fordonsvinnare dominerar.

**Småfixar**: tidslinjens kioskkort och verkstadskort upprepar inte längre sitt namn, "UPPLÅST!"-lappen sitter nere till vänster på resultatskärmen i stället för över chipsen, kortet för platsen där rundan tog slut har läsbar text, och de fem moddar som inte syntes på bilen får en bult-on: Bromsar (röda och gula bromsok på blanka skivor), Nitrolängd (långa blå nitrorör längs sidorna),
Sladd (lila fenor och en ankstjärt), Stötdämpare (gula spiralfjädrar över hjulen) och Rabattkort (ett RABATT-kort i backspegeln). Tak-talismaner på cyklarna sitter på bagagehyllan bakom föraren eller på hjälmen (hatten), rullburet är en hög bygel bakom sadeln.

## Fyra svårigheter

Svårigheten väljs överst på bilsidan (Ny runda), med fyra knappar och en rad som förklarar den valda. Valet sparas som standard till nästa gång
(`Meta.diff`). Reglerna ligger som data i `src/run/difficulty.ts` (`DIFFS`) och används av `state.ts` (hjärtan), `flow.ts` (läkning, Skrotpant), `economy.ts`
(kiosken, vilka talismaner som erbjuds) och `giveup.ts` (troféerna). Rivalerna är desamma som i Normal för alla utom Söndagsåkare (`RunState.calm` är `diff === 'calm'`).

| | 🛋️ Söndagsåkare | 🏁 Normal | 🔥 Hård | 💀 Ett liv |
|---|---|---|---|---|
| Hjärtan | 5 | 3 | 2 | 1 |
| Förlust | bara bryta eller sist: −❤️ | nedre halvan −❤️, bryta −❤️❤️, förlorad boss −❤️❤️ | som Normal, utom att tvåa mot en boss bara är −❤️ | som Normal, och sista hjärtat är det enda: nedre halvan (på poäng i Blodbad, utslagsordning i derby), bryta eller förlorad boss = rundan slut |
| Rivaler | snällare | normala | normala | normala |
| Hjärta i kiosken | ja | ja | ja, 50 % dyrare | finns inte |
| Boss | läker 2 hjärtan | vinst läker 1 | läker inget | läker inget |
| Skrotpant | var 4:e vrak | var 4:e vrak | var 6:e vrak | ingen |
| Hjärttalismaner och händelser | ja | ja | ja | talismanen ger 60 kr och erbjuds inte; läkande händelser ger 40 kr |
| Troféer | ×1 | ×1 | ×1,5 | ×2 |

Brickan (emoji och namn) syns i statusraden på kartan och alla loppkort, i loppkortets hjärtregel ("💀 Ett liv: hamnar du på nedre halvan eller bryter är rundan slut."),
och på resultatskärmen och i troféraderna ("💀 Ett liv: 2× troféer"). Normal visar ingen bricka. Skrytlådan visar längsta akt och antal segrar för varje svårighet (`Meta.best`).

**Sparningar**: en gammal sparning har bara `calm`: `true` blir Söndagsåkare, allt annat Normal, och en pågående runda behåller sitt läge och sina hjärtan (`parseRun`). `calm` finns kvar i rundan som en genväg till rivalerna.
Medaljerna som säger "på Söndagsåkare" räknar som förut. Ingen ny medalj för Ett liv: bästa akten per svårighet sparas i stället.

**Balans** (`balance.test.ts`, 200 simulerade rundor per ruta, vinstandel för Race / Ram / Blandat): Söndagsåkare ≈ alltid vinnbart (genomsnittlig spelare 100 %); Normal oförändrad (bra spelare 42 / 48 / 53 %, stark 72 / 83 / 82 %);
Hård bra spelare 14 / 24 / 23 %, stark 38 / 55 / 53 %; Ett liv bra spelare 1 / 2 / 4 %, stark 9 / 16 / 19 %.

## Talismaner, medaljer och frökoder (fas 14)

**Namnet**: *prylar* heter *talismaner* i hela spelet (singular talisman, "Ny talisman!", "Dina talismaner", "Starttalisman", kioskens och belöningarnas texter). Det är bara visningstext: id:n och sparnycklar är oförändrade, och fordonets aktiva heter fortfarande förmåga. Raritetsnamnen Skräp, Grym och Legendarisk fick stå kvar.

**Allt öppet**: ingen talisman har längre ett `unlock`-värde, kioskens och belöningarnas pool är alla 72, alla 20 fordon går att välja direkt och låsikonerna är borta från bilvalet. Det som sparas mellan rundor är troféer (poäng, med svårighetens multiplikator), medaljer, sedda talismaner och bästa rundan per svårighet. Ingenting av det får påverka en genererad runda (se frökoder).

**Frökoder** (`src/run/seedcode.ts`): fröet visas som ett ord och fyra siffror, `KOSSA-4821`, och är hela fröet: `seed = ordets nummer × 10000 + siffrorna + 1`. 100 svenska lant-, rally- och rackartyg-ord, en miljon rundor. Samma kod och samma svårighet ger exakt samma runda för alla (karta, banor, varianter, kioskens varor, belöningar, händelser). På bilvalet finns en liten länk **🌱 Frö** i fotraden: den fäller ut fältet "Eget frö" (hopfällt som standard), där man kan skriva koden med stora eller små bokstäver och med bindestreck, mellanslag eller utan. Fel input stoppar starten med en vänlig rad ("Koden ska se ut som KOSSA-4821…", "Jag känner inte igen ordet …"). Kartans hjälprad, pausmenyn och resultatskärmen visar koden, och på kartan och resultatet finns en **📋**-knapp som kopierar den (`navigator.clipboard`, med en dold textruta som reserv). En gammal runda med ett fröet utan kod visar det gamla korta base-36-fröet.
Det enda av metan som en ny runda får med sig är medaljframstegen vid starten (`chal0`, för att kunna visa vad rundan flyttade). `seedcode.test.ts` håller fast att två helt olika metan ger identiska rundor: ny runda, kiosk, belöningar, uppgraderingserbjudanden och en hel spelad runda med boten.

**Tjugo nya talismaner** (mest kaos och synergier med fordonens förmågor, uppgraderingsträden och kombona; tre vägar till nya krokar: `ModHooks.ability`, `TickState.carnage/derby` och fyra nya `RaceApi`-anrop `rerollAbility`, `abilityCooldown`, `copyLeaderAbility`, `repeatAbility`):

| Talisman | Sort | Vad den gör |
|---|---|---|
| 🎰 Förmågerouletten | legendarisk, kaos | förmågan slumpas om vid varje varv |
| 💉 Adrenalinsprutan | sällsynt, ram | varje takedown kortar förmågans nedkylning (3 s) |
| 📠 Kopiatorn | sällsynt, kaos | när du använder din förmåga använder du ledarens senaste också |
| 🎟️ Nitrolotten | sällsynt, kaos | kortare nitro, men varje tändning drar en slumpad effekt |
| 🌧️ Regnmakaren | sällsynt, fuffens | regn i varje lopp, du får grepp och stövlar |
| ☀️ Solstrålen | vanlig, girig | aldrig regn, alltid dag, +8 % kronor |
| 🌙 Nattskiftet | sällsynt, kaos | alla lopp i natten, mynt värda +25 % |
| ⛈️ Åskmolnet | legendarisk, fuffens | regn, och blixten slår ner i ledaren efter varje varv |
| 🧰 Verktygslådan | legendarisk, kaos | en slumpad uppgradering vid varje akts början |
| 🪙 Dubbelt eller inget | sällsynt, girig | myntkast i mål: dubbla loppets kronor eller inga |
| 🧲 Vrakplockaren | vanlig, ram | varje vrak ger 12 kr och lite nitro |
| 💣 Hämndsprängaren | sällsynt, ram | när du vrakas smäller en stötvåg |
| 🛝 Rampgalningen | sällsynt, stunt | en lång flygning och landning ger kronor och en rusning |
| 🥤 Kraftdrycken | vanlig, race | varje förmåga fyller en bit nitro |
| 🔁 Efterklangen | legendarisk, race | förmågan används en gång till strax efter |
| ☕ Termosen | vanlig, race | förmågan laddar 12 % fortare per exemplar |
| 🔔 Arenaklockan | sällsynt, ram | lagar dig en bit var åttonde sekund i Blodbad och derby |
| 🎲 Slumpgeneratorn | legendarisk, kaos | var 22:a sekund händer något slumpat |
| 🎡 Lyckohjulet | sällsynt, kaos | var tionde mynt snurrar ett hjul med en belöning |
| ⛽ Reservdunken | vanlig, race | förmågan får en extra rusning |

Vädertalismanerna (Regnmakaren, Solstrålen, Nattskiftet, Åskmolnet) ändrar himlen i varje lopp av rundan via `TrinketDef.sky` och `withSky` (regn slår sol på vädret, sol håller dagen; Kapten Kanins dag på månen rörs aldrig). Verktygslådan skruvar på noden i `finishNode` (`toolboxGift`, valet kommer från rundans frö). Alla har `maxStack` (de som är engångsgrejer har 1), kasten går genom `capTune` (Termosen mot `abilCd`-golvet 0,5, Rampgalningen mot stuntgränsen 2,2) och `chaosEffect` delar slumpeffekterna med de andra kaostalismanerna.
Två nya kombon (12 i allt): ☔ **Skyfallet** (Regnmakaren + Åskmolnet: efter varje varv en stötvåg som sköljer undan bilarna runt dig) och 🌀 **Förmågekaoset** (Förmågerouletten + Kopiatorn: en chans på tre att förmågan ekar tillbaka med en rusning).
Balanssimulationen (`racesim.ts`, `pace.ts`) räknar Termosen via `abilCd`, Kraftdrycken, Efterklangen och Rampgalningen som fartkrokar (`HOOK_SAVE`) och Arenaklockan som mer hälsa. Eftersom hela potten nu är öppen vinner en bra spelare något oftare på Hård (testgränsen flyttades från 32 till 35 %). Datorförarna har en `lastAbil` som Kopiatorn kan kopiera.

**Pop-ups mitt på skärmen** (`Hud.pop`): när en talisman utlöses, förmågan används, en passiv slår till eller du får en boost, takedown eller kombo visas en stor emoji och ett kort ord ("KRAFT!", "NITRO!", "TAKEDOWN!") i övre mitten, ovanför bilen och aldrig över vägen framför den: ingen bakgrundsruta, bara kontur och skugga, skalas in och tonas ut på under en sekund. Högst tre åt gången, nyaste närmast horisonten, och varje källa visar sig högst var 2,5:e sekund. Ikonen i remsan uppe till höger pulserar som förut. Inställningar → **Pop-ups: Mitten / Hörnet / Av** (förval Mitten; Hörnet är en liten rad under positionsrutan).

**Bilvalet på mobil**: stående telefon (smal och inte kort) får ett kompakt bilval utan sidscroll: svårighetsraderna överst (Söndagsåkare får plats), bilarna som en sidledes svepbar rad med lean-filtret ovanför, fordonets kort, hjälm och färg som svepbara rader och längst ner en fotrad med ← Tillbaka, 🌱 Frö och KÖR! som alltid syns. Liggande telefon, surfplatta och dator behåller sina layouter; alla knappar är minst 44 px. Kartans övre list fick plats för alla tre knappar på smala skärmar.

## Alla är människor i hjälm (fas 16)

Ägarens önskemål efter en lekrunda: inga djur bakom ratten, rivalerna är kända rally- och idrottsnamn som vänliga ordvitsar, bossarna hämtas från rally och andra sporter, och du kör som dig själv.

**Inga djur.** `CarDriver` är bara `human` (`CAR_DRIVERS` har en post; gamla sparningar med ko, gris eller kanin läses som människa). `Rival.face` finns inte längre. Alla förare har hjälm med visir och overall, och varje hjälm har ett eget
**mönster** (`HELMET_DESIGNS`: Rand, Dubbelrand, Rutor, Stjärna, Lågor, Prickar, Blixt, Vingar) och en egen **färg**: `CarStyle.helmet` och `CarStyle.helmetColor` (tom = bilens lack). 3D-hjälmen byggs i `helmet()` i `src/rally/models.ts`, bilderna på korten ritas som SVG i `src/ui/helmet.ts` (`helmetSvg`: kupol, visir med glimt, mönstret och två bokstäver, med axlar i overall som porträtt). Kapten Kanin är en människa i kostym med långa öron på hjälmen (`helmet: 'ears'`, bara för bossar).

**Rivalerna** (`src/shared/rivals.ts`, 21 st, vänliga ordvitsar, aldrig elaka mot den riktiga personen). Varje rival har namn, stil (rammare / racer / blandad), smeknamn, skryt, hån, livré (huvudfärg och dekor), hjälmmönster och initialer. Rally-loppen drar mest racers, Blodbad mest rammare (vikten delas på antalet av varje stil, så att tio racers inte trycker undan sex rammare), och en rival som också är boss (Stig Blomgrus) hoppar över sitt eget lopp.
Bilens lack är rivalens huvudfärg, eller dekorfärgen om den liknar din (`liveryPaint` i `index.ts`); hjälmen har alltid sina egna färger.

| Grupp | Namn | Stil | Smeknamn | Hjälm | Färger |
|---|---|---|---|---|---|
| Svensk rally | Stig Blomgrus | Racer | Den gamle mästaren | Rand | blå / vit |
| Svensk rally | Björn Waldegrus | Blandad | Safarilegenden | Dubbelrand | sand / svart |
| Svensk rally | Per Ekgrus | Rammare | Knuffar hellre än han bromsar | Rutor | grön / gul |
| Svensk rally | Kenneth Grusiksson | Racer | Gasen i botten sedan 1988 | Lågor | röd / vit |
| Svensk rally | Mattias Eksprång | Rammare | Hoppar först, tittar sen | Stjärna | orange / svart |
| Svensk rally | Pontus Tidsmand | Racer | Klockan är hans bästa vän | Blixt | turkos / blå |
| Svensk rally | Oliver Solgrus | Racer | Den unga stjärnan | Vingar | gul / blå |
| Svensk rally | Johan Kristofferstorque | Rammare | Rallycrossens kung | Prickar | lila / gul |
| Svensk rally | Harry Kallstart | Blandad | Motorn vaknar sist av alla | Dubbelrand | grå / röd |
| Världen | Leo Messimotor | Racer | Dribblar mellan bilarna | Rand | ljusblå / vit |
| Världen | Rovolvodo | Rammare | Volvo i hjärtat, mål i blicken | Stjärna | röd / grön |
| Världen | Zlatan Grusimović | Rammare | Banan behöver honom, inte tvärtom | Lågor | gul / blå |
| Världen | Sébastien Ogrus | Racer | Alla vägar leder till pokalen | Rutor | blå / röd |
| Världen | Kalle Rovanplåt | Racer | Sladdar som på is, varje gång | Vingar | vit / turkos |
| Världen | Petter Solbergsgrus | Blandad | Ler mest när det smäller | Prickar | rosa / vit |
| Världen | Usain Boltdragare | Racer | Går på blixtens ström | Blixt | gul / grön |
| Världen | Serena Williamsväxel | Racer | Slår i nästa växel, och bollen | Dubbelrand | limegrön / lila |
| Världen | Björn Borgtorque | Blandad | Ishjärta, pannband och fullt drag | Rand | blå / vit |
| Världen | Ingemar Stenmotor | Blandad | Sicksack som i slalombacken | Rutor | röd / blå |
| Världen | Tiger Woodsvagn | Rammare | Slår långt, parkerar kort | Lågor | brandgul / svart |
| Världen | Mika Häkkikinen | Racer | Den flygande finländaren | Vingar | silver / röd |

Fördelningen är 10 racers, 5 blandade och 6 rammare. Ägarens förslag "Sébastien Leopard" blev **Sébastien Ogrus** (Ogier) för att inte krocka med bossen Sébastien Loebsedel. `rivals.test.ts` kollar att alla fält finns, att ingen heter något djur och att allt är snällt och rent.

**Bossarna** (`src/run/plan.ts`, `src/run/map.ts`): en pool per akt, fröet väljer en (`bossFor`, `BOSS_POOL`). Sura Bengt, Ingrid Ingenväjning och Frost-Frida är borta för gott; Kapten Kanin är kvar som den galna jokern (🚀, månen, derby ibland). Varje boss har ett samlarkort med hjälmporträtt, en inledningsreplik, ett fordon och en egen livré, och ett trick byggt av hindersystemen (`src/rally/gimmicks.ts`, `Obstacles`, små modeller för bollar, käglor, skyltar och straffzoner).

| Akt | Boss | Fordon | Sort | Bana | Trick |
|---|---|---|---|---|---|
| 1 | 🏁 Tävlingsledaren Torsten | tävlingsbil med ljusramp (pickup, `lightbar`) | Blandat | Gården | 🚩 Straffzoner: visselpipan går och ett rött fält med koner och flagga ritas på vägen, 7-8 s mellan fälten framför dig plus två fasta per varv. Kör du genom bromsas du till 38 % av farten och får **2 sekunder** på måltiden (`penaltyMs`) |
| 1 | ⛳ Golf-Göran | golfbil | Blodbad | Ängen | ⛳ Golfbollar: han slår ut bollar framför sig som studsar längs vägen (tyngdlag, 74 % studs) och knuffar åt sidan och snurrar den bil de träffar |
| 1 | 🗺️ Tina Kartörner | rallybil med antenn | Rally | Skogen | 🪧 Falska skyltar: pilskyltar sätts upp framför dig, de flesta vid kanten och var tredje på vägen (en tung skylt som snurrar). Var tredje skylt vänder hon din minikarta upp och ner i 4,5 s. "Vänster fyra, hopp, lita på mig!" |
| 2 | ⚽ Fotbolls-Freddie | sandbuggy i gräsgrönt | Blodbad | Stranden | ⚽ Jättebollar: en jättefotboll läggs vid vägkanten framför dig och guppar en stund (en sekund att se den), sedan sparkas den tvärs över vägen och slår undan den som är i vägen |
| 2 | 🏒 Målvakten Mats | ismaskin (traktor med blått skal) | Blandat | Isbanan | 🧊 Isremsa: efter ismaskinen ligger en hal remsa (11 s) som tar greppet och svänger bilen. Hans egen is tar inte honom |
| 2 | 🎳 Bowling-Berit | limousin i bowlinglila | Blodbad | Fjället | 🎳 Bowlingklot rullar nerför vägen mot dig (24-31 m/s, 150 m framför dig) och var tredje gång ställs sex käglor i en triangel på vägen |
| 3 | 🏆 Världsmästaren Sébastien Loebsedel | rallybil, perfekt trimmad | Rally | Staden | perfekt linje (`lineUse` 1, bromsar sent), nitro på varje raksträcka (`nitroEvery` 6), plus ett **lånat trick**: ett av de andra bossarnas, valt av noden (`borrowedGimmick`) |
| 3 | 🏆 Världsmästaren Stig Blomgrus | klassisk rallybil | Rally | Fjället | som Loebsedel; Stig Blomgrus står inte också på startgriden |
| 3 | 🚀 Kapten Kanin | soffa, öron på hjälmen | Blodbad | Månen | låg tyngdkraft och jättehopp, ibland ett derby (som förut) |

Tricken är data (`RaceTwist.gimmicks`, `GimmickId` i `src/shared/gimmicks.ts`) och körs av `Gimmicks` i loppet: bollarna rör sig i vägens koordinater (s längs, d tvärs, h över vägen), träffarna går tillbaka till loppets egen snurr, skada och ljud (`gimmickHit`), och straffzoner, is, skyltar och käglor är nya sorter i `Obstacles`. I testbygget (`?rallydebug`) visar `window.__rally.gimmicks` vad som ligger på vägen och `window.__app.debugBoss('berit')` hoppar till en viss boss. Bossarnas styrka är trimmad så att balanstesterna håller (Hård-gränsen för en stark spelare gick från 65 till 70 %).
**Medaljerna** som nämnde bossar byttes: *Tävlingsstoppet* (Slå en akt 1-boss), *Moppen mot bossen* (samma, med moppen) och *Bollbesegraren* (Slå en akt 2-boss) ersätter Bengtbesegraren, Moppen mot Bengt och Fridas frostskräck. `MEDAL_RENAMES` flyttar gamla framsteg (`bengt` blir `boss1`, `bengtMoped` blir `boss1Moped`, `frida` blir `boss2`) när metan läses, och en gammal rundas logg läser Bengt som Torsten, Ingrid som Freddie och Frost-Frida som Mats (`BOSS_RENAMES`).

**Du kör som dig själv.** Förarvalet är borta. Första gången (och i ⚙️ Inställningar → "Du heter") frågar spelet **"Vad heter du?"** (`nameView`): ett textfält på högst 16 tecken, trimmat och rensat från konstiga tecken, filtrerat med samma ordregler som resten av spelet (`src/shared/words.ts`; även siffror för bokstäver och mellanslag räknas, så "k u k" och "p1ss" stoppas med en vänlig rad). Om spelet kan göra ett hyfsat **rallynamn** av namnet föreslår det ett (`src/shared/rallyname.ts`: ett ord på samma bokstav före namnet med streck, eller efter det, alltid samma lista i samma ordning för ett namn): man väljer förslaget eller behåller sitt eget namn, och **🎲 Nytt förslag** går vidare i listan. Finns inget vettigt (för kort, för långt, konstigt) står det "Inget rallynamn passade. Du kör som …".
Exempel: Tobias → *Turbo-Tobbe*, Lukas → *Lack-Lukas* (och *Lukas Lättfot* i listan), Greta → *Grus-Greta*, Sam → *Sladd-Sam*, Maja → *Motor-Maja*, Hugo → *Hjul-Hugo*, Olle → *Olje-Olle*.
Namnet (eller rallynamnet) visas i tabellen under loppet, i HUD:en och namnskyltarna, på loppets resultattabell, på kortet före loppet (ett grönt "Du"-kort först i leden), på resultatskärmen och på titeln. Det sparas per enhet i `Meta` (`name`, `alias`, `helmet`, `helmetColor`) och är bara visning: ett frö ger samma runda för alla.

**Hjälmen** ersätter förarvalet på bilvalet: en rad med åtta hjälmmönster (varje knapp visar mönstret i den färg som är vald) och färgraden har två knappar först, **🚗 Bil** och **⛑️ Hjälm**, som väljer om de tolv färgerna målar bilen eller hjälmen (🚗-pricken = hjälmen i bilens färg). Raden tar inte mer plats än förarraden gjorde, så den stående telefonen får fortfarande plats utan scroll. Alla knappar är minst 44 px.

**Migrering.** Gamla sparningar läses utan fel (`cleanMeta`, `cleanCar`): ett gammalt `driver` (ko, kanin …) blir en människa med standardhjälmen (Rand, bilens lack), en meta utan namn frågar efter ett vid nästa start, medaljframstegen flyttas enligt `MEDAL_RENAMES`, och en pågående runda behåller allt men får standardhjälm. `save.test.ts` och `medals.test.ts` testar det.

**Test.** `rallyname.test.ts` (oföränderligt per namn, rent språk i alla förslag, fallback, skräpindata), `rivals.test.ts` (inga djur, ~20 rivaler med alla fält, stilmix), `phase3.test.ts` (bosspoolerna och fröets val, kort och fordon, världsmästarna och det lånade tricket), `gimmicks.test.ts` (varje trick på riktig bana med riktiga hinder), `medals.test.ts` och `save.test.ts` (migreringarna), och `language.test.ts` läser nu ordlistan från `src/shared/words.ts`.

## Fas 17: aggression lönar sig (Blodbad och Rivningsderby)

Ägaren spelade en hel runda och tyckte att Blodbad och derby inte gick ihop: den som rammade tog skada medan bilar som bara körde runt vann.
Reglerna är gjorda om så att den som slåss vinner och den som kryssar runt förlorar (`src/rally/combat.ts`, `src/shared/kinds.ts`, `src/shared/derby.ts`).

- **Skadan är asymmetrisk** (`exposure`, `impactDamage`): bilen som träffar med nosen i högre inbromsad fart tar en femtedel (20 %), en frontalkrock delas lika (60 % var), bilen som träffas på sidan tar hela smällen ×1,5 och på bakändan ×1,3.
  Var på bilen det träffar mäts mellan bilarnas mittpunkter (`HitInfo.faceA/faceB`), så en sidosmäll blir en sidosmäll vilken stötfångarring som än rörde vid. Smällens storlek kapas först (högst 40 hälsopoäng) och zonen räknas efter, så en sidosmäll tar sina ×1,5 även i den största krocken. Massa och rammarkraft skalar som förr (lätta bilar ändrar fart mer, tunga och pansrade tar mindre, rammarkraft ×1–2,5), och en ramm-bil är härdad i fronten (upp till −30 %).
  **Rammaren tar aldrig mer än 40 %** av vad bilen den träffar tar i samma smäll, vad massa och pansar än säger (`capRammer`, bara när man kör in med nosen, inte i en frontalkrock). Däckväggen och staketen tar litet (40 % mindre än förut, och en kollision med väggen går alltid under en bilsmäll). Ett rammat bakifrån-sidled-bygge vrakar en bil på 4–5 smällar medan rammaren klarar 15+ (`combat.test.ts`).
- **Poäng** (`carnagePoints`, `damagePoints`): 0,5 p per procent av en bils hela hälsa som en träff tar bort (en hel bil på träffar = 50 p), **20 p per vrak** och en mindre del för placeringen: 20 / 14 / 10 / 6 / 4 / 2. I Blodbad är placeringen ordningen över mållinjen, i derbyt hur länge man höll (sista bilen, sedan de som vrakades sist). Rangen på poäng avgör vem som vann. I derbyt avgör **poängen** när tiden går ut, inte kvarvarande hälsa (`DerbyBoard.deal`, `standings`). En bil som aldrig slåss kan bara få placeringspoängen och vinner aldrig.
- **FEGIS! (bara i Rivningsderbyt, aldrig i Blodbad)** (`fegisTick`, `fegisDrain`, `FEGIS_AFTER` 10 s, `FEGIS_DRAIN`): en bil som inte gjort någon skada på tio sekunder får en röd blinkande **FEGIS!**-skylt över sig, publiken bua:r (`audio.boo`) och bilen tappar hälsa långsamt (2,2 % av full hälsa i sekunden, ungefär 45 s till vrak) tills den träffar någon. Alla har sex sekunders respit i början så ingen märks innan bilarna mötts. Klockan går alltid efter uppvärmningen. Blodbad är ett lopp: där finns ingen FEGIS-klocka, ingen buning och ingen 🐔, och den som inte slåss får bara färre poäng (men datorförarna slåss ändå när det passar och kör fortfarande racet). Spelaren får en stor banderoll och en toast, datorbilar med FEGIS jagar utan paus och en ledare utan någon framför sig bromsar in och låter klungan komma ikapp.
- **Datorförarna slåss alltid**: i Blodbad har alla minst aggressionen 0,5 (`FIGHT_MIN`), derbyförarna jagar 60–100 % av tiden och siktar på flanken eller bakändan.
- **Syns på skärmen**: "+12" (poäng) stiger över bilen du träffar, ett litet rött "−6" över dig när du blir träffad, poängtavlan visar poäng per bil (🐔 vid FEGIS i derbyt; på en mobil i liggande en liten tavla med de tre bästa och du), och under platsen ligger dina vrak 💥, din skada 🔨 och dina poäng. Resultatkortet räknar upp: "= 42 för skada + 2 vrak × 20 = 40 + 14 för 2:a plats".
- **Simuleringen** (`racesim.ts`) modellerar träffar och skada (en dålig förare träffar färre), en tyst förare i derbyt får FEGIS-straff, och derbyt rangordnar på poäng. Boten (`bot.ts`) kör Race med aggressionen 0,6, Ram 1 och Blandat 0,5. Se balanstesterna.
- Dev-krokar: `__rallyDebug.strike(n, 'rear'|'side'|'front', fart)` och `still(n)`.

## Fas 17: pengarna (ekonomin)

Ägaren tog hela uppgraderingsträdet. Nu kostar noderna mer, stiger i pris för varje nod man har, och Skruvhörnan säljer bara det som står på hyllan.

| | Förut | Nu |
|---|---|---|
| Loppspris per placering (1:a, 2:a, 3:a ...) | 200 / 140 / 100 / 70 / 50 / 40 / 35 / 30 kr | 160 / 112 / 80 / 56 / 40 / 32 / 28 / 24 kr |
| Aktskalning av kronor (akt 1 / 2 / 3) | 1 / 1,3 / 1,7 | 1 / 1,2 / 1,45 |
| Myntets värde | 1,2 kr | 0,9 kr |
| Uppgraderingsnod, nivå I / II / III / topp / fordon | 90 / 150 / 240 / 420 / 130 kr | 130 / 220 / 340 / 580 / 190 kr |
| Prisökning per nod man redan har | ingen | +7 % per nod (`NODE_RISE`; 14 noder = dubbelt) |
| Skruvhörnan säljer | hela trädet | 2 eller 3 slumpade noder (seedade), en av dem gratis (nivå I eller II) |
| Kioskens varor | 3-5 talismaner | 3 eller 4 talismaner |
| Talismanpris (Skräp / Grym / Legendarisk) | 70 / 130 / 230 | 80 / 150 / 260 |
| Hjärta i kiosken | 100 kr | 85 kr (loppen betalar mindre) |

Hyllan (`workshopStock`) dras med samma frö som annars (rundans frö + platsen), från noderna som är öppna i bygget, från minst två träd, med minst en som är billig nog att vara gratis. Den ligger i `Screen.workshop.stock`; en sparad runda från före hyllan får samma hylla beräknad vid laddning.
Skruvhörnan visar korten (🛠️ Uppgradering, med trädets färg och ikon) i stället för hela trädet; att titta på hela trädet görs på Bygget. Målet är att en bra runda slutar med ungefär en tredjedel till hälften av ett träd plus några sidonoder
(botten tar i snitt 12 noder varav 6-8 i största trädet) och aldrig ett fullt träd (`balance.test.ts`, "the economy").

## Fas 17: kartan, alltid minst tre lopp före bossen

Förut kunde en akt bli "köp saker, ett lopp, boss". Nu håller varje väg från aktens start till bossen (`pathsOf`, `pathProblems` i `src/run/map.ts`):
- minst **3 lopp** av typen lopp, utmaning, dödslopp (en derby är ett dödslopp eller bossen), och högst **2 andra platser** (kiosk, Skruvhörnan, händelse);
- **aldrig en kiosk eller Skruvhörnan direkt efter en kiosk eller Skruvhörnan** på en väg;
- första raden är bara lopp och utmaningar, som förut.
Kartan görs som förut (samma rader, samma vägar, samma frö) och typerna rättas efteråt (`repairPaths`): platsen som sitter på flest trasiga vägar blir ett lopp först, och av lika många den typ som aktens har flest av. Sedan ser `wants`-steget till att varje akt
fortfarande har en kiosk, en Skruvhörna, ett dödslopp och en händelse någonstans (en plats byter typ och en annan blir lopp för att ge plats). Med eget seedat slumptal (`Rng.for(seed, 'mapfix', act)`), så resten av kartan är orörd.
Per akt blir det i snitt 7,5 lopp, 2,4 utmaningar, 1,4 dödslopp, 1,6 kiosker, 1,5 Skruvhörnor och 1,9 händelser; en väg har i snitt 1,5 platser som inte är lopp. Testet (`map.test.ts`) går igenom 1500 frön × 3 akter.
Pågående rundor: kartan räknas om från fröet, så platsernas typer kan ha ändrats i en runda som sparades före ändringen (rader, vägar och id:n är desamma).

## Fas 17: byte efter varje lopp, tre kort

Efter **varje** lopp (inte bara vinster) visar belöningsskärmen exakt **tre kort** (`rewardOffer` i `src/run/economy.ts`): en seedad blandning av 🎁 **Talisman** och uppgraderingar. En eller två av tre är talismaner, resten noder, så det är alltid en blandning om båda finns att dra. Spelaren tar ett. Perks som "ett kort till" (Kapitalisten) lägger fortfarande till ett kort ovanpå de tre.
Talismankorten har en lila "🎁 Talisman"-flik och sin raritetsfärg; uppgraderingskorten har en flik med trädets ikon och namn ("🛡️ Uppgradering"), trädets färg på kanten och "Nivå I av III" i foten. På mobil i stående är det tre kort under varandra, i liggande tre bredvid varandra.
Fliken Uppgraderingar/Talismaner och tröstpriset för tvåan är borta.

**Placeringen sätter kvaliteten** (`rewardGrade`; placeringen är rangen på poäng i Blodbad och derby, ett uppfyllt utmaningsmål räknas som vinst):

| Placering | Grad | Talismanernas odds (Skräp / Grym / Legendarisk) | Uppgraderingsnoder |
|---|---|---|---|
| Nedre halvan eller bruten | plain | 100 / 0 / 0 (bara Skräp) | bara nivå I, inga toppar |
| Övre halvan, men inte etta | normal | 70 / 27 / 3 | alla nivåer lika sannolika |
| Vinst | win | 45 / 42 / 13 | högre nivåer något oftare (+12 % per nivå, topp ×1,4) |
| Vinst i dödslopp | elite | 32 / 47 / 21 | +25 % per nivå, topp ×1,8 |
| Vinst mot en boss | boss | 12 / 52 / 36 | +25 % per nivå, topp ×2,2 |

Sortens lutning är kvar: efter Blodbad kommer fler Ram- och Fuffens-kort, efter Rally fler Race- och Stunt-kort (både bland talismaner och noder). Kortet efter loppet säger vad placeringen gav ("🏆 Vinst! Välj ditt byte: tre kort med bättre odds ...", "🧰 Nedre halvan eller bruten: du får välja ett byte, men bara bland Skräp och första stegen") och knappen heter **Välj ditt byte 🎁**.
`Screen.reward` har nu `grade` i stället för `source`; en gammal sparad belöning läses om (tröstpriset blir plain, boss och dödslopp behåller sin grad) och `RaceSummary.rewardKind` 'second' blir 'plain'.

**Balans** (`balance.test.ts`, `racesim.ts`, `field.ts`): kartan har fler lopp per runda och byten kommer efter varje, så rivalernas delnivå (`partLevel`) går från 4,7 till 4,0 i slutet: de följer det en bra spelare numera köper. Boten (`bot.ts`) spenderar i Skruvhörnan (gratisvalet först, sedan det kassan räcker till) och kör Race med aggressionen 0,75, Blandat 0,55, Ram 1. Simuleringen låter en dålig förare träffa färre av de träffar den går efter och en bra förare bli vrakad mer sällan.

## Garaget: styla din bil (fas 19)

"Min son älskar att styla bilen, precis som i Lilla Gården." Nu går det även här: **🎨 Garaget** finns på titelskärmen och som **🎨 Styla** på bilvalet (och 🎨 Styla bilen i Snabbrace). Den öppnar på fordonet som är valt.

- **Förhandsvisning**: en stor levande 3D-bil på en skivspelare (`src/rally/preview.ts`). Dra för att snurra, släpp så fortsätter den. **Tryck på en del av bilen** och garaget hoppar dit: motorhuv, tak, dörrar eller bak öppnar Dekaler på rätt plats, hjulen Fälgar, spoilern Spoiler, skylten Skylt, föraren Hjälm, plåten Lack (`classifyHit` i `src/rally/pick.ts`; bilen vrids så delen vänds mot dig). 🌙 Natt visar underglöd och lyktor.
- **Flikar** (`src/ui/garage.ts`, namnen i `src/shared/stylenames.ts`):
  🎨 **Lack** (24 färger plus en egen färgväljare, yta blank / matt / metallic) · 🏁 **Mönster** (15 mönster, 3 nya: 🚧 Varning, 🟤 Rost, 🎨 Färgstänk, och en andra färg) · ⭐ **Dekaler** (en dekal per plats: motorhuv, tak, dörrar, bak; 6 sponsorer som Grusolja och Surstark, 15 klistermärken, racingnummer 1 till 99; små bilder ritas av bilens egen målare) · 🛞 **Fälgar** (5 sorter och fälgfärg) · 🪽 **Spoiler** (4) · ✨ **Extras** (14, flera på en gång; 3 nya: 🚧 trafikkon, 🦆 badanka, 🌭 korv; plus underglöd) · 📯 **Tuta** (6; tryck för att lyssna, och loppet tutar med den) · 💨 **Rök** (7, från däcken och nitroflamman) · 🔢 **Skylt** (upp till `PLATE_MAX` = 8 tecken, rensas av språkreglerna: ett fult ord ger en vänlig varning och sparas aldrig) · ⛑️ **Hjälm** (8 mönster, egen färg eller som bilen, "samma hjälm på alla fordon"). Hjälm och färg går fortfarande att snabbväljas på bilvalet.
- **🎲 Slumpa** ger en slumpad kombination som ser ut som någon menade den (andra färgen alltid lätt att skilja från första, bara det som passar fordonet, aldrig ett medaljpris du inte tjänat), **↩ Ångra** tar tillbaka senaste ändringen (tjugo steg per fordon), **↺ Återställ** (tryck två gånger) går tillbaka till fordonets startlook. Allt sparas direkt.
- **Per fordon**: alla 20 fordon har en egen sparad look (`src/run/styles.ts`, nyckeln `galna-rallyt:styles:v1`, versionerad `{ v: 1, styles: { moto: …, tractor: … } }`, varje fält kontrollerat av `cleanStyle` i `src/shared/styles.ts`, så skräp aldrig kraschar). Varje fordon börjar med en egen färg ur paletten (rallybilen är kvar röd). **Flytten**: första gången, när inga looks är sparade, blir den gamla rundans färg (meta) fordonets färg, snabbracets färg (prefs) sitt fordons färg, och den gamla hjälmen (en för alla) hamnar på alla fordon; sen sparas boken och de gamla fälten läses aldrig mer. En runda tar fordonets hela look (`newRun({ style })`), och den ligger kvar i den sparade rundan (`cleanCar` kontrollerar alla fält, äldre sparningar får standardvärden). Omlackning gratis i Skruvhörnan sparas på fordonet.
- **Passar alla 20 kroppar** (`fitOf`, `fitStyle` i `src/shared/styles.ts`): det som inte sitter på en kropp göms i garaget och släpps ur looken. Motorcykel och moppe får bara liten spoiler, ingen sidokjol eller snorkel (inga hjulhus); snöskoter och gokart tar upp till stor spoiler; åkgräsklippare, raketvagn, soffa, gokart och skoter inga kjolar eller snorkel; fyrhjuling och traktor har egna terrängdäck så där väljer man bara fälgfärg. Alla fästpunkter (tak, bak, nos, huvud) finns i varje kropps mått (`BodySpec`), och modellen rapporterar dem (`CarModel.slots`) så garaget vet var delarna sitter. Testet `garagemodels.test.ts` bygger alla 20 kroppar med varje enskilt val (och alla extras på en gång, hög och låg kvalitet) utan webbläsare (en låtsasduk tar emot ritandet).
- **Allt är gratis** (öppet från början). Fyra rent kosmetiska priser är kopplade till medaljer (`src/run/stylelocks.ts`) och visas med "🏅 Medalj: …" tills de är intjänade: 🔥 Lågor-mönstret (Krossmästaren), 🥇 guldfälgar (Rundvinnaren), 👑 kronan som dekal (Bollbesegraren) och 💛 guldrök (Myntsamlaren). De ändrar aldrig hur ett fordon kör.
- **I loppet och efteråt**: loppet, bilvalets förhandsvisning, Bygget och rundans slutskärm (nu med bilen på en skivspelare bredvid medaljerna) använder fordonets look; rivalerna behåller sina egna. Tutan du valt ersätter fordonets egen (🚗 Fordonets egen är förvalet; `RallyAudio.horn(body, kind)`).
- **Skärmar**: förhandsvisning och val sida vid sida när skärmen är bredare än hög, staplade annars; alla knappar ≥ 44 px; ingen sidscroll (bara alternativlistan scrollar); flikarna radbryts på stora skärmar och sidscrollar på små.
- **Tester**: `src/shared/styles.test.ts` (rensning, skylt, passform, Slumpa, medaljlås), `src/run/styles.test.ts` (spara och läsa per fordon, flytten, skräp i lagringen, en runda behåller looken), `src/rally/pick.test.ts` (vad ett tryck betyder) och `src/rally/garagemodels.test.ts` (alla val på alla kroppar).
