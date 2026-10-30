# UI overhaul

A summary of the interface work done on Monster Card Battle in one design-and-build session. Game rules are unchanged except where noted under [Game code changes](#game-code-changes).

Design mockups live on the design canvas "Monster Card Battle UI" (artboards 1–11). The game now follows the **Desktop v2** row (artboards 8–11).

---

## 1. Theme

**Accents** come from the Flat UI "Dutch" palette (flatuicolors.com/palette/nl):

| Role | Color |
|---|---|
| You | Sunflower `#FFC312` (hover: Radiant Yellow `#F79F1F`) |
| Bot | Forgotten Purple `#9980FA`, the complement of yellow |
| Danger / attack targets | Bara Red `#ED4C67` |
| Good outcome | Energos `#C4E538` |
| Trap reactions | Blue Martina `#12CBC4` |
| Jack redirects | Puffins Bill `#EE5A24` |
| Fusion badge | Hollyhock `#833471` |
| Big-monster badge | Turkish Aqua `#006266` |
| King-weakened badge | Very Berry `#B53471` |
| Red suits | Red Pigment `#EA2027` |

**Surfaces** started as navy shades of "20000 Leagues Under the Sea". They are now **Material Design purples** (materialui.co/colors):

- Borders use **Purple 900** `#4A148C` exactly. Card backs and the deck stack use Purple 900 and **Purple 800** `#6A1B9A` stripes.
- Purple 900 is the darkest Material swatch, but it is lighter than the game's backgrounds. So the backgrounds, text tints and secondary line color are **shades of Purple 900** (same hue, darker).
- Each of those shades was matched to the luminance of the navy it replaced, so every text and border contrast ratio is unchanged (all within ±0.1). For example, muted text on the panel background stays 8.08:1 and yellow on that background stays 9.8:1.
- All colors are CSS custom properties at the top of `css/styles.css`. No hard-coded navy remains.

**Type:** Chakra Petch for display text and numbers, Inter for body text. They replaced Roboto and Material Icons.

---

## 2. Layout (current: Desktop v2)

The whole game is one screen tall on desktop. The board sits in the middle, and each player owns two corners. The bot's corners mirror yours, as if sitting across a table.

```
┌──────────────────────────────────────────────────────────┐
│ Bot health ring          [bot traps]        Bot's hand  │
│                          [bot monsters]     (face-down) │
│ Deck stack  ── Turn N · Draw Setup Battle End ──  Discard  Jokers │
│                          [your monsters]                │
│ Your hand (fan)          [your traps]       Hint        │
│                                             Your ring   │
│                                    Log  Menu  [End …]   │
└──────────────────────────────────────────────────────────┘
```

- **Card sizing:** one variable, `--c`, sets the field-card height from the window height and width (96–210px). Every other size derives from it: traps, the hand, piles, health crests. At 1440×900 field cards are 210px tall, up from 128px in the first version.
- **Hand:** your hand fans out from the bottom-left corner. Hovering or focusing a card straightens it, lifts it, and zooms it 1.65×. The overlap tightens as the hand grows, so 10 cards fit. Hand cards are updated in place, not rebuilt, and a zoomed card keeps an invisible strip over the spot it lifted out of. Together these stop the zoom flickering (shrinking and growing) on click or when the pointer is near a card's lower edge.
- **Bot's hand:** a face-down fan hanging from the top-right corner, with a card count.
- **Health crests:** a ring gauge with a large number for each player. The active player's ring glows. At 25% health or less it turns red, pulses, and shows a "Low health" tag.
- **Piles:**
  - **Deck:** card backs stacked thicker or thinner with the count.
  - **Discard:** the last three cards face up.
  - **Jokers:** a Jokers-played pile (played Jokers face up, unused slots as outlines, "1 / 2").
- **Pile viewers:** clicking the deck or discard opens its cards as faces grouped by suit, high to low, with the latest discard outlined.
- **Board-card zoom:** pausing about 450ms over any face-up board card shows a large copy beside it.

Extra information appears only when needed:

- **Hint line:** above your health, says what to do next.
- **Battle log:** a drawer from the left edge, opened with the log button. This turn comes first, the previous turn is open, older turns are collapsed with action counts, and a dot on the button marks unread entries. Esc closes it.
- **Menu:** one button holds Rules (also the H key), New game (back to the welcome screen) and Concede (confirms, then counts as a loss).
- **Fusion upkeep:** "UPKEEP 1" badges on fusion cards, a sub-label on the End button ("Upkeep: 1 card"), and a note under your name.

**Narrower windows:** below 1280px wide, the corners tighten: the controls get smaller, the Space hint is hidden, and the piles shrink. Below 900px the page stacks vertically and scrolls. The phone layout works but is unpolished.

**Checked sizes:** 1024×640, 1024×768, 1280×720, 1366×657, 1440×900, 1536×730 and 1920×960. At each, nothing goes off screen, nothing overlaps the board, and the page doesn't scroll, even with a full 10-card hand. At 390px wide nothing overflows sideways.

### Earlier layouts (superseded)

1. **Three columns:** stats and log on the left, the board in the center, an attack preview panel, attacker list and End button on the right. A top bar held the title, turn and actions.
2. **One screen:** the top bar was removed, its contents moved into the columns, and card sizes followed the window height. The log showed only the current turn, with an "Earlier turns" toggle.
3. **Desktop v2:** the current layout, built after the mockups on canvas artboards 8–11.

---

## 3. Attacking

1. Click one of your glowing monsters. It rises with a gold outline, and valid targets get a dashed red outline.
2. Hover (or tab to) a bot monster. A **damage preview** appears just outside the board on that side, with a dashed arrow from your monster to the target. It shows the matchup, the damage ("Bot −3" or "You −2"), and what is destroyed. It has a green border for a good trade and red for a bad one. Trap outcomes are deliberately left out.
3. **One click** on the target attacks. Esc, or clicking your monster again, cancels.

If the bot has no monsters, the preview appears straight away, the bot's whole side is outlined, and clicking anywhere on it attacks directly.

---

## 4. Action effects (`js/fx.js`)

Every action gets motion plus a short banner over the middle of the board, so you can tell what happened at a glance:

- **Attacks:** an arrow in the attacker's color, the attacker lunges, and the target shakes. A banner names the attack, then a second one gives the result.
- **Traps:** the trap flips face up in its slot with a teal glow, and a banner names it.
  - **Jack:** the arrow turns orange and re-aims, with a dashed arrow from the old target to the new one.
  - **King:** "÷2 → N" floats over the attacker.
  - **Queen:** the banner shows "Q × K: … cancels …".
  - **Ace:** the banner says the Battle phase is over, and the Battle step glows red.
- **Damage:** the number rises from the health crest, which shakes and drains.
- **Cards:** destroyed monsters shatter in red, sacrificed or discarded cards fade, played cards drop in, fusions glow, and drawn cards slide into the hand.
- **Other banners:** "Your turn" / "Bot's turn"; the bot's summons, traps and fusions (not yours, since you made them); Joker plays; deck reshuffles; fusions lost to unpaid upkeep.
- **Readable banners:** every banner stays up at least ¾ second (`Fx.BANNER_MIN_VISIBLE`) before the next one replaces it; banners that arrive sooner wait their turn. The bot waits for the current banner to be readable before its next action, so the banners keep pace with the board.
- **Reduced motion:** with the system's reduced-motion setting on, movement becomes simple fades.

Effects work from the cards' on-screen positions, so they adapt to the layout. Arrows are cleared when the window resizes.

---

## 5. Card art

- **The image:** the Ace of Spades illustration had its light gray background removed, with an anti-aliased rounded cut and 1px of edge fringe trimmed. It is saved as `assets/cards/ace-of-spades.webp` (299×420, 46KB).
- **Mapping:** `CARD_ART` in `js/constants.js` maps `"suit-value"` to an image, and `getCardArt()` in `js/utils.js` looks it up.
- **Where it shows:** illustrated faces appear in the hand, on the field, in trap slots and dialogs, in banners, in the discard stack and in the pile viewers. The game's own rank and suit are hidden on them, because the art carries its own. Labels sit on dark tags, and unarmed traps dim the art.
- **TODO:** the Aces of Hearts, Diamonds and Clubs temporarily reuse the Ace of Spades image for testing, so they show spades in their corners. Each needs its own art. This is flagged in `CARD_ART` and in the README.

---

## 6. Battle log fixes

Both bugs predate this session.

- **"Bot sets a trap" appeared twice.** `js/bot.js` logged its own actions right after calling game functions that already log them. That happened for traps, summons, big monsters, fusions and attacks, and the bot logged even when the game call failed. The bot's copies were removed, and the game's log line is now the only one.
- **The log looked out of order.**
  - The deck logged "X was sent to the discard pile" mid-action, ahead of the action that caused it. That message was removed: the discard pile is now visible on the board, and the action lines name the cards involved ("summons 10♦ (big monster), sacrificing 5♣ + 5♦"; "pays fusion upkeep with 2♠").
  - Attacks were only logged after they had fully resolved, so "X attacks Y" landed after the trap and Jack-redirect lines it caused. Attacks are now logged when they start ("Bot's 10♦ attacks Player's 5♥"), followed by trap responses, then results ("Player's 5♥ was destroyed", "Player takes 5 damage").

---

## 7. Choices on the board (no popups)

Game decisions no longer open a popup over the board. The cards you can choose glow where they are, in your hand or on the field (both sides, where the rules allow). A **prompt panel** takes the place of the hint and turn controls in your corner. It explains the choice, keeps a running total, and holds the buttons.

| Choice | How it works |
|---|---|
| Summon a big monster | Pick sacrifices on your field or in your hand (red rings, "SACRIFICE" tags). The panel shows "6 / 9". **Summon** turns on once the total is enough, and once a field monster is included if your field is full. |
| Fusion | Click your field monster. Lower monsters in your hand glow; pick one and the panel shows "6♥ + 3♠ = STR 9", then **Fuse**. Clicking another field monster switches the fusion to it. A big monster from hand moves on to its sacrifices, and **Cancel** there returns to the fusion with the same card chosen. |
| Fusion upkeep | Pick monster cards on the field or in hand ("PAY" tags; fusions themselves can't pay). Then **Pay upkeep**, **Pay 1, break 1**, or **Break fusions**. An unpaid fusion breaks apart and its stronger card stays on the field. |
| Hand limit | Pick the cards to discard in your hand; **Discard 2** turns on at the right count. |
| Trap response | During the bot's attack, the arrow and target stay visible and your traps that can answer glow teal in their slots. Click one, or **Let it through**. |
| Jack redirect | Every legal target glows orange, on either side of the board; click one. **Back** returns to the trap choice. |
| Queen cancel | Your Queen glows; click it, or **Don't cancel**. |
| Joker | Asks on the board instead of in a browser `confirm()`. |

- **Space and Esc:** Space can't end the phase while a choice is open. Esc backs out of choices you're allowed to leave (sacrifice, fusion, Jack target, Joker), but not required ones (upkeep, discard, trap response).
- **Short windows:** your health ring shrinks while a prompt is open so the panel fits beside the board.
- **What's still a dialog:** the welcome screen, rules, the deck and discard viewers, and the game-over screen. The seven popups for these choices were removed.

## 8. Accessibility

- Hand cards are focusable buttons with descriptive labels, played with Enter or Space. Space no longer ends the phase while one has focus.
- Board spaces you can act on become focusable and announce their contents. Focusing a target shows the damage preview.
- The log, menu and pile viewers use real buttons and dialogs with labels. Esc closes the menu and log, and drops the current selection.
- Focus rings are teal and visible on every control.
- Text contrast meets 4.5:1 throughout, rechecked after the purple retheme.

---

## 9. Bot rebuild

- **Why:** the old bot sent every monster into battle and chose targets with personality and emotion bonuses, so it often attacked stronger monsters and lost them. In simulation, 28% of its attacks went into a stronger monster and it won 26.5% of games.
- **How it plans:** each turn it searches the ways to use its Setup phase (summons, big monsters with the cheapest sacrifices, fusions, traps, the Joker). It plays each one forward: its own attacks, your likely reply (with its traps defending), and its next attack. It keeps the best.
- **Attacks and traps:** these are weighed the same way, and "don't attack" is always an option.
- **Trap risk:** it estimates the risk from your face-down traps by counting the A/J/Q/K cards it hasn't seen. It uses only what a person could know.
- **Mistakes:** a small chance of a blunder (5%) plus some judgement noise, so it misjudges close calls. A mistake is never an attack into a stronger monster.
- **One bot:** the Easy/Medium/Hard choice was removed.
- **Results:** `tools/simulate.js` plays full games headless with the real game code, against a casual player (rules of thumb) and an expert (the bot's own engine on your side).

| Opponent | Old bot | New bot |
|---|---|---|
| Casual player | 26.5% wins, 28% of attacks into stronger monsters | 77.8% wins, under 1% |
| Expert (perfect engine) | not measured | 36.4% wins |
| Average of the two | | **57.1%** |

These are the numbers after the fusion upkeep change (an unpaid fusion keeps its stronger card). That change made fusions cheaper and the bot stronger, so its judgement noise was raised from 4 to 6 to stay in the same band.

## Game code changes

- `GAME_SETTINGS.JOKER_COUNT` (2) replaces the two hard-coded Jokers in `js/deck.js`. `game.jokersPlayed` counts Jokers played in the match.
- Unpaid fusion upkeep now breaks a fusion apart (`Board.breakUnpaidFusions`): the stronger card stays on the field and the weaker one is discarded. Previously the whole fusion was destroyed.
- `game.processAttack` logs each attack at its start. Upkeep and big-monster summons name the cards spent.
- The game now announces actions to the UI (`announcePlay`, `showTrapActivated`, `showTrapCancelled`, `showRedirect`, `showKingHalved`, `showBattleEnded`, `showAttackResult`) and marks cards for exit animations (`fxHint`).

## Files

| File | Change |
|---|---|
| `index.html` | Rebuilt markup for the corner layout, crests, piles, log drawer, menu and popups |
| `css/styles.css` | Rewritten: theme tokens, layout grid, fan, crests, piles, drawer, popups, effects |
| `css/dialog.css` | Re-themed welcome and tutorial dialogs; difficulty as a segmented control |
| `js/ui.js` | Rendering for every element above, attack flow, hover preview, zoom, log grouping, keyboard handling |
| `js/fx.js` | New: banners, arrows, lunges, ghosts, floating text, entrances |
| `js/card.js` | Card art support; fusion badge shows the number; unarmed traps say "Next turn" |
| `js/game.js` | Effect hooks, attack and summon logging, Joker count |
| `js/bot.js` | Rewritten: lookahead planning, trap-risk estimates, human-like mistakes |
| `js/deck.js` | Joker count constant; mid-action discard logging removed |
| `js/constants.js`, `js/utils.js` | `CARD_ART`, `getCardArt()`, `JOKER_COUNT` |
| `js/main.js` | Space key ignores focused card and space buttons |
| `assets/cards/ace-of-spades.webp` | New card art |
| `tools/simulate.js`, `tools/sim/` | Headless simulator, casual-player stand-in, frozen baseline bot for A/B tests |
| `README.md` | Features, controls and module list updated |

## Open items

- Real artwork for the Aces of Hearts, Diamonds and Clubs (see §5).
- The design canvas mockups still use the earlier navy surfaces. Only the game has the Material purple theme.
- The phone layout (below 900px) works but has not had a design pass.
- Palette hex values were taken from the published Flat UI and Material Design specs. Neither site's page could be read directly, because both render their colors with JavaScript.
