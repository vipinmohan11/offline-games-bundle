# Dice Arcade

Eight kid-friendly dice games in one offline web app. Pick a game from the home screen, level up, earn rewards, and try the timed mode.

Works in any modern mobile or tablet browser (phones and 10–11" tablets, portrait or landscape). No accounts, no ads, no network use while playing.

## Games

| Game | Idea |
|---|---|
| Dice Drop | Stack falling dice pieces and clear full rows |
| Dice Fit | Place dice shapes on an 8×8 board and complete lines |
| Dice Garden | Merge three matching dice to grow flowers |
| Dice Match | Swap dice to match three or more and chain combos |
| Dice Shot | Aim and pop dice (same number, or two that add to 7) |
| Dice Rush | Tap fast by the rule, keep your hearts |
| Dice Tower | Time your taps to stack a tall tower |
| Dice Duel | Flip-dice strategy against the computer, best of 3 |

## Progression and rewards

- 40 levels per game, each harder than the last (star goals rise every level).
- 1–3 stars per level, coins for new stars, a chest every 5th level.
- XP and ranks, 64 stickers to collect, 8 dice skins in the shop.
- Daily gift with a 7-day streak.
- Timed mode per game with bronze/silver/gold medals.
- Progress is saved on the device (local storage).

## Play

- Open the GitHub Pages site for this repository, or open `index.html` directly from a file.
- On Android, use the browser menu → "Add to Home screen" / "Install app" to play offline.

## Develop

```
node build.mjs          # bundles src/ into index.html
node tests/sim.mjs      # headless bot simulations
node tests/audit.mjs    # checks levels, scoring and rewards are consistent
node tests/e2e.cjs      # browser test (needs Playwright)
```

Everything is plain HTML, CSS and JavaScript with no dependencies.
