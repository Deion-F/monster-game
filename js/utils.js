/**
 * Utility functions
 */

/**
 * Delay function for animations and sequencing
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise} - Promise that resolves after delay
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get the numerical value of a card
 * @param {string} value - Card value
 * @returns {number} - Numerical value
 */
function getCardNumericValue(value) {
    switch (value) {
        case CARD_VALUES.ACE:
            return 1;
        case CARD_VALUES.TWO:
            return 2;
        case CARD_VALUES.THREE:
            return 3;
        case CARD_VALUES.FOUR:
            return 4;
        case CARD_VALUES.FIVE:
            return 5;
        case CARD_VALUES.SIX:
            return 6;
        case CARD_VALUES.SEVEN:
            return 7;
        case CARD_VALUES.EIGHT:
            return 8;
        case CARD_VALUES.NINE:
            return 9;
        case CARD_VALUES.TEN:
            return 10;
        case CARD_VALUES.JACK:
            return 11;
        case CARD_VALUES.QUEEN:
            return 12;
        case CARD_VALUES.KING:
            return 13;
        case CARD_VALUES.JOKER:
            return 0; // Special case
        default:
            return 0;
    }
}

/**
 * Get card type based on value
 * @param {string} value - Card value
 * @returns {string} - Card type
 */
function getCardType(value) {
    const numValue = getCardNumericValue(value);
    
    if (value === CARD_VALUES.JOKER) return CARD_TYPES.JOKER;
    if (value === CARD_VALUES.ACE || 
        value === CARD_VALUES.JACK || 
        value === CARD_VALUES.QUEEN || 
        value === CARD_VALUES.KING) return CARD_TYPES.TRAP;
    if (numValue >= 8 && numValue <= 10) return CARD_TYPES.MONSTER_BIG;
    return CARD_TYPES.MONSTER_NORMAL;
}

/**
 * Calculate the required sacrifice value for a big monster
 * @param {Card} card - The big monster card
 * @returns {number} - Required sacrifice value
 */
function getRequiredSacrificeValue(card) {
    return getCardNumericValue(card.value);
}

/**
 * Get total value of cards for sacrifice
 * @param {Array} cards - Array of card objects
 * @returns {number} - Total value
 */
function getTotalCardValue(cards) {
    return cards.reduce((sum, card) => {
        if (!card) return sum;
        if (card.isFusion) return sum + (card.fusionStrength || 0);
        // Some selections may pass a plain value string instead of a card object
        if (typeof card.value === 'undefined' && typeof card === 'string') {
            return sum + getCardNumericValue(card);
        }
        return sum + getCardNumericValue(card.value);
    }, 0);
}

/**
 * Check if a card can be played by the current player right now
 * @param {Card} card - Card to check
 * @param {Game} game - Current game state
 * @returns {boolean} - Whether card can be played
 */
function canPlayCard(card, game) {
    const player = game.currentPlayer;

    if (game.gameOver || game.currentPhase !== PHASES.SETUP) return false;
    if (!player.hand.some(c => c.id === card.id)) return false;

    switch (getCardType(card.value)) {
        case CARD_TYPES.JOKER:
            return true;
        case CARD_TYPES.TRAP:
            return player.hasAvailableTrapSpace();
        case CARD_TYPES.MONSTER_NORMAL:
            return player.hasAvailableMonsterSpace();
        case CARD_TYPES.MONSTER_BIG: {
            // With no free space, at least one field monster must be sacrificed to make room
            const fieldValue = getFieldSacrificeValue(player);
            if (!player.hasAvailableMonsterSpace() && fieldValue === 0) return false;
            return getTotalPotentialSacrificeValue(player, card) >= getRequiredSacrificeValue(card);
        }
        default:
            return false;
    }
}

/**
 * Get total strength of the monsters on a player's field (fusions count at fusion strength)
 * @param {Player} player - Player object
 * @returns {number} - Total field monster value
 */
function getFieldSacrificeValue(player) {
    return player.monsterSpaces.reduce((sum, space) =>
        space.card ? sum + calculateMonsterStrength(space.card) : sum, 0);
}

/**
 * Get total potential sacrifice value from player's hand and field.
 * Only monsters can be sacrificed.
 * @param {Player} player - Player object
 * @param {Card} [excludeCard] - Card being summoned, which can't pay for itself
 * @returns {number} - Total potential sacrifice value
 */
function getTotalPotentialSacrificeValue(player, excludeCard = null) {
    const handValue = player.hand.reduce((sum, card) => {
        if (excludeCard && card.id === excludeCard.id) return sum;
        return isMonsterCard(card) ? sum + getCardNumericValue(card.value) : sum;
    }, 0);

    return handValue + getFieldSacrificeValue(player);
}

/**
 * Short human-readable label for a card, e.g. "7♣" or "Fusion (9)"
 * @param {Card} card - Card to describe
 * @returns {string} - Label
 */
function describeCard(card) {
    if (!card) return 'Unknown';
    if (card.isFusion) return `Fusion (${card.fusionStrength})`;
    if (card.value === CARD_VALUES.JOKER) return 'Joker';
    return `${card.value}${card.getSuitSymbol ? card.getSuitSymbol() : ''}`;
}

/**
 * Calculate monster strength including fusion
 * @param {Card} card - Monster card
 * @returns {number} - Monster strength
 */
function calculateMonsterStrength(card) {
    if (card.isFusion) {
        return card.fusionStrength;
    }
    return getCardNumericValue(card.value);
}

/**
 * Apply King trap effect (halve attack strength, round up)
 * @param {number} strength - Original strength
 * @returns {number} - Halved strength, rounded up
 */
function applyKingEffect(strength) {
    return Math.ceil(strength / 2);
}

/**
 * Shuffle an array (Fisher-Yates algorithm)
 * @param {Array} array - Array to shuffle
 * @returns {Array} - Shuffled array
 */
function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

/**
 * Generate a unique ID
 * @returns {string} - Unique ID
 */
function generateId() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
}

/**
 * Artwork for a card face, if it has any
 * @param {Card} card
 * @returns {string|null} - image path
 */
function getCardArt(card) {
    if (!card || card.isFusion) return null;
    return CARD_ART[`${card.suit}-${card.value}`] || null;
}

/**
 * Check if a card is a monster
 * @param {Card} card - Card to check
 * @returns {boolean} - Whether card is a monster
 */
function isMonsterCard(card) {
    const cardType = getCardType(card.value);
    return cardType === CARD_TYPES.MONSTER_NORMAL || 
           cardType === CARD_TYPES.MONSTER_BIG || 
           card.isFusion;
}

/**
 * Get trap name from card value
 * @param {string} value - Card value
 * @returns {string} - Trap name
 */
function getTrapName(value) {
    switch (value) {
        case CARD_VALUES.ACE:
            return TRAP_TYPES.ACE;
        case CARD_VALUES.JACK:
            return TRAP_TYPES.JACK;
        case CARD_VALUES.QUEEN:
            return TRAP_TYPES.QUEEN;
        case CARD_VALUES.KING:
            return TRAP_TYPES.KING;
        default:
            return '';
    }
}