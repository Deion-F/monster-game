/**
 * Game constants
 */
const CARD_TYPES = {
    MONSTER_NORMAL: 'normal',
    MONSTER_BIG: 'big',
    TRAP: 'trap',
    JOKER: 'joker'
};

const CARD_SUITS = {
    HEARTS: 'hearts',
    DIAMONDS: 'diamonds',
    CLUBS: 'clubs',
    SPADES: 'spades',
    JOKER: 'joker'
};

const CARD_VALUES = {
    ACE: 'A',
    TWO: '2',
    THREE: '3',
    FOUR: '4',
    FIVE: '5',
    SIX: '6',
    SEVEN: '7',
    EIGHT: '8',
    NINE: '9',
    TEN: '10',
    JACK: 'J',
    QUEEN: 'Q',
    KING: 'K',
    JOKER: 'JOKER'
};

// Illustrated card faces, keyed by "suit-value". The artwork includes its own corner rank and suit.
const CARD_ART = {
    [`${CARD_SUITS.SPADES}-${CARD_VALUES.ACE}`]: 'assets/cards/ace-of-spades.webp',
    // TODO: Placeholder art for testing. These Aces reuse the Ace of Spades image, which shows a spade
    // in its corners. Replace each with its own suit's artwork (ace-of-hearts.webp, etc.).
    [`${CARD_SUITS.HEARTS}-${CARD_VALUES.ACE}`]: 'assets/cards/ace-of-spades.webp',
    [`${CARD_SUITS.DIAMONDS}-${CARD_VALUES.ACE}`]: 'assets/cards/ace-of-spades.webp',
    [`${CARD_SUITS.CLUBS}-${CARD_VALUES.ACE}`]: 'assets/cards/ace-of-spades.webp'
};

const TRAP_TYPES = {
    ACE: 'End Battle Phase',
    JACK: 'Redirect Attack',
    QUEEN: 'Cancel Trap',
    KING: 'Halve Attack'
};

const PHASES = {
    DRAW: 'Draw',
    SETUP: 'Setup',
    BATTLE: 'Battle',
    END: 'End'
};

// Bot tuning (see tools/simulate.js for how these were chosen)
const BOT_SETTINGS = {
    MISTAKE_RATE: 0.05,   // chance of a blunder: taking the second-best option at a decision
    JUDGEMENT_NOISE: 6,   // random wobble (in health points) on how the bot values each option,
                          // so it misjudges close calls but rarely makes a clearly bad move
    LOW_HP: 15,           // below this, health counts extra (danger and finishing blows)
    JOKER_MARGIN: 5,      // how much better a reset must look before the bot plays the Joker
    PLAN_SHORTLIST: 24    // Setup plans looked ahead in full each turn
};

const PLAYER_TYPES = {
    HUMAN: 'human',
    BOT: 'bot'
};

const GAME_SETTINGS = {
    STARTING_HEALTH: 40,
    STARTING_HAND_SIZE: 5,
    MAX_HAND_SIZE: 10,
    MAX_MONSTER_SPACES: 3,
    MAX_TRAP_SPACES: 3,
    JOKER_COUNT: 2, // Jokers shuffled into the deck at the start of a match
    RESHUFFLE_DAMAGE: 10 // Each player takes this much damage whenever the empty deck is rebuilt from the discard pile
};

const CARD_STATES = {
    IN_DECK: 'in_deck',
    IN_HAND: 'in_hand',
    ON_FIELD: 'on_field',
    IN_DISCARD: 'in_discard',
    REMOVED: 'removed'
};

const SPACE_TYPES = {
    MONSTER: 'monster',
    TRAP: 'trap'
};

const ANIMATION_DURATION = 500; // milliseconds