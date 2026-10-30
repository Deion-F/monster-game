# Monster Card Battle Game

A strategic web-based card battle game using a standard 52-card deck plus Jokers.

## About the Game

Monster Card Battle is a 2-player strategic card game where each player tries to defeat their opponent by reducing their health to zero. The game uses regular playing cards in unique ways:

- **Normal Monsters (2-7)**: Played directly to the field
- **Big Monsters (8-10)**: Require sacrifices to summon
- **Traps (A, J, Q, K)**: Special effects that respond to attacks
- **Joker**: Resets the entire game board

## Game Features

- Responsive design for both desktop and mobile play
- The board fills the screen: each player's hand fans out from a corner, with large health crests in the opposite corners, themed with the Flat UI Dutch palette
- Deck, discard and Jokers-played piles shown as card stacks; click the deck or discard pile to see its cards grouped by suit
- Hover a hand card to zoom it; pause over a board card to see it larger
- Animated attacks, trap reveals, redirects, cancels and damage, with a banner naming each action
- Battle log in a drawer (log button), with this turn first and earlier turns collapsed
- Turn-based gameplay with clear phase indicators
- A bot that plans a few turns ahead: for each way to use its Setup phase it plays out its attacks, your likely reply and its next turn, weighs the risk from your face-down traps by counting unseen cards, and now and then misjudges a close call
- Comprehensive tutorial system
- Strategic mechanics including fusions, traps, and sacrifices

## How to Play

1. Open `index.html` in a web browser
2. Enter your name
3. Follow the on-screen tutorial or jump right into gameplay
4. Take turns drawing cards, summoning monsters, setting traps, and attacking your opponent
5. Reduce your opponent's health to zero to win!

## Controls

- Click on cards in hand to select them for play
- Click on open monster/trap zones to play selected cards
- In the Battle phase, click one of your monsters, hover an opponent's monster to see the damage, and click it to attack. With no monsters in the way, click the opponent's side to attack directly. Esc cancels
- Use the End phase button or press Space to advance through turn phases
- The menu button holds Rules (or press H), New game and Concede
- Choices such as sacrifices, fusions, upkeep, discards and trap responses are made on the board: click the glowing cards, then confirm in the panel in your corner (Esc backs out where allowed)

## Game Rules

### Setup

- Each player starts with 40 health
- Players share a single deck of 54 cards (standard deck + 2 Jokers)
- Initial hand is 5 cards; the first draw brings it to 6

### Card Types

- **Normal Monsters (2-7)**: Played directly with strength equal to card value
- **Big Monsters (8-10)**: Sacrifice monsters (hand or field) totaling ≥ the monster's value; fusions count at full strength and overpaying is allowed
- **Traps (A, J, Q, K)**: Set face-down; armed at the end of the turn they were set. One trap of each type per player per turn
  - **Ace**: End opponent's Battle Phase immediately
  - **Jack**: Redirect an attack to any other monster, including the attacker's own
  - **Queen**: Cancel an opponent's trap as it activates, including their Queen (except Joker)
  - **King**: Halve attacking monster's strength (round up)
- **Joker**: Setup Phase only. Resets the board and both hands, skips your Battle Phase, and is removed from the match

### Turn Structure

1. **Draw Phase**: Draw 1 card (or 5 if hand is empty); discard down to 10
2. **Setup Phase**: Play monsters, set traps, create fusions, play Joker
3. **Battle Phase**: Attack with your monsters (the first player can't attack on turn 1)
4. **End Phase**: Pay fusion upkeep; traps set this turn become armed

### Combat

- The weaker monster is destroyed and its controller takes the difference in strength as damage (this can be the attacker)
- Equal strength: both destroyed, no damage
- Direct attacks deal the attacker's full strength
- Traps chain: the player an attack is aimed at answers first, then the players take turns answering each trap until both pass. Any trap goes unless it makes no sense: a King only against an attack aimed at you (Kings stack, halving again), an Ace for the attacker only once their attack has been turned on them, and a Queen cancels the trap just played (including a Queen). One trap of each type per player per turn. No time limit

### Special Mechanics

- **Fusions**: Fuse two monsters of different values, at least one on your field; strength is the sum. A fusion can't be fused again
- **Fusion upkeep**: One monster card per fusion each End Phase; an unpaid fusion breaks apart, leaving its stronger card on the field and discarding the weaker one
- **Deck reshuffle**: When the deck runs out, the discard pile becomes the new deck
- **Draws**: If both players reach 0 health together, the game is a draw

Rules under evaluation are tracked in [BALANCE_NOTES.md](BALANCE_NOTES.md).

## Development

This game is built using:

- HTML5 for structure
- CSS3 for styling and animations
- Vanilla JavaScript for game logic

The code is organized into modular components:

- `index.html`: Main game interface
- `css/styles.css`: Game styling
- `js/constants.js`: Game constants and enums
- `js/utils.js`: Utility functions
- `js/card.js`: Card class implementation
- `js/deck.js`: Deck and discard pile management
- `js/player.js`: Player state and actions
- `js/board.js`: Game board and attack resolution
- `js/ui.js`: User interface management
- `js/fx.js`: Visual effects (banners, attack arrows, card animations)
- `assets/cards/`: Illustrated card faces, mapped to cards by `CARD_ART` in `js/constants.js`. **To do:** the Aces of Hearts, Diamonds and Clubs temporarily reuse the Ace of Spades art for testing and need their own images
- `js/bot.js`: AI opponent logic (tuning in `BOT_SETTINGS`, `js/constants.js`)
- `tools/simulate.js`: plays the bot against simulated opponents in Node to measure its win rate (`node tools/simulate.js 500 --opponent=casual|expert`)
- `js/game.js`: Main game controller
- `js/tutorial.js`: Tutorial system
- `js/main.js`: Game initialization and event handlers