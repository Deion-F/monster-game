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
- Material Design UI for a clean, modern experience
- Turn-based gameplay with clear phase indicators
- Intelligent bot opponent with adjustable difficulty
- Comprehensive tutorial system
- Strategic mechanics including fusions, traps, and sacrifices

## How to Play

1. Open `index.html` in a web browser
2. Enter your name and select difficulty level
3. Follow the on-screen tutorial or jump right into gameplay
4. Take turns drawing cards, summoning monsters, setting traps, and attacking your opponent
5. Reduce your opponent's health to zero to win!

## Controls

- Click on cards in hand to select them for play
- Click on open monster/trap zones to play selected cards
- Click on your monsters to initiate attacks
- Click on opponent's monsters to target attacks
- Use the "End Phase" button to advance through turn phases
- Press the "Help" button to view the tutorial at any time

## Game Rules

### Setup

- Each player starts with 40 health
- Players share a single deck of 54 cards (standard deck + 2 Jokers)
- Initial hand is 6 cards

### Card Types

- **Normal Monsters (2-7)**: Played directly with strength equal to card value
- **Big Monsters (8-10)**: Require sacrifices totaling ≥ monster value
- **Traps (A, J, Q, K)**:
  - **Ace**: End opponent's Battle Phase immediately
  - **Jack**: Redirect an attack to any other monster
  - **Queen**: Cancel any trap (except Joker)
  - **King**: Halve attacking monster's strength (round up)
- **Joker**: Reset the entire board and hands

### Turn Structure

1. **Draw Phase**: Draw 1 card (or 5 if hand is empty)
2. **Setup Phase**: Play monsters, set traps, create fusions
3. **Battle Phase**: Attack with your monsters
4. **End Phase**: Pay fusion upkeep, traps become active

### Special Mechanics

- **Fusions**: Combine two monsters; strength equals sum of both
- **Trap Activation**: Respond to attacks with set trap cards
- **Joker Effect**: Reset the entire board state

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
- `js/bot.js`: AI opponent logic
- `js/game.js`: Main game controller
- `js/tutorial.js`: Tutorial system
- `js/main.js`: Game initialization and event handlers