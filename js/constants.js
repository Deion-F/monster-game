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

const PLAYER_TYPES = {
    HUMAN: 'human',
    BOT: 'bot'
};

const GAME_SETTINGS = {
    STARTING_HEALTH: 40,
    STARTING_HAND_SIZE: 5,
    MAX_HAND_SIZE: 10,
    MAX_MONSTER_SPACES: 3,
    MAX_TRAP_SPACES: 3
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