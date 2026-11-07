# Galna Rallyt

Ett 3D-rallyspel i webbläsaren (three.js): kom först i mål mot gårdens djur på sju banor. Det är
en egen fristående version av rallyt från Lilla Gården och ska bli en roguelite (se [PLAN.md](PLAN.md)).
Fas 1 var porten (ett lopp på dator, surfplatta och mobil); fas 2 (den här) gör det till en roguelite: en runda är tre
akter med varsin förgrenad karta och en boss, och på vägen samlar man galna prylar.

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
- **Prylar** (`src/run/trinkets.ts`, 31 st): vanlig/ovanlig/legendarisk, samma pryl två gånger gör den starkare. Varje pryl är
  data: `tune` ändrar siffror när loppet startar, `hooks` reagerar på tick/boost/sladd/stöt/varv/pickup/mål, `perk` ändrar
  rundan (rabatt, hjärtan, fler val). Loppet får dem som `RallyOptions.mods` (`src/rally/mods.ts`); bossarnas trick går via
  `RallyOptions.twist`. Lägg till en pryl genom att lägga till en rad i listan.
- **Troféer** 🏆 efter varje runda (2 per besegrad boss, 3 för seger) låser upp bilar (pickup 3, sportbil 8, monstertruck
  15) och lägger fler prylar i potten.
- Rundan är deterministisk från ett frö: kartor, kioskens varor och händelsernas utfall räknas ut från fröet och behöver
  aldrig sparas.

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

För tester finns `window.__app` med `fakeFinish()` (avslutar loppet direkt med ett påhittat resultat), `debugRun()`,
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
