/**
 * Deck class for managing the card deck and discard pile
 */
class Deck {
    /**
     * Create a deck
     */
    constructor() {
        this.cards = [];
        this.discardPile = [];
        this.initializeDeck();
        this.shuffle();
    }

    /**
     * Initialize a standard deck with 52 cards plus 2 jokers
     */
    initializeDeck() {
        const suits = [
            CARD_SUITS.HEARTS, 
            CARD_SUITS.DIAMONDS, 
            CARD_SUITS.CLUBS, 
            CARD_SUITS.SPADES
        ];
        
        const values = [
            CARD_VALUES.ACE, 
            CARD_VALUES.TWO, 
            CARD_VALUES.THREE, 
            CARD_VALUES.FOUR, 
            CARD_VALUES.FIVE, 
            CARD_VALUES.SIX, 
            CARD_VALUES.SEVEN, 
            CARD_VALUES.EIGHT, 
            CARD_VALUES.NINE, 
            CARD_VALUES.TEN, 
            CARD_VALUES.JACK, 
            CARD_VALUES.QUEEN, 
            CARD_VALUES.KING
        ];
        
        // Create standard 52 cards
        for (const suit of suits) {
            for (const value of values) {
                const card = new Card(suit, value);
                this.cards.push(card);
            }
        }
        
        // Add 2 jokers
        this.cards.push(new Card(CARD_SUITS.JOKER, CARD_VALUES.JOKER));
        this.cards.push(new Card(CARD_SUITS.JOKER, CARD_VALUES.JOKER));
    }

    /**
     * Shuffle the deck
     */
    shuffle() {
        this.cards = shuffleArray(this.cards);
    }

    /**
     * Draw a card from the deck
     * @returns {Card} - Drawn card
     */
    drawCard() {
        if (this.cards.length === 0) {
            this.returnDiscardsToDeck();
        }
        
        if (this.cards.length === 0) {
            return null; // No cards left even after reshuffling
        }
        
        const card = this.cards.pop();
        card.state = CARD_STATES.IN_HAND;
        return card;
    }

    /**
     * Draw multiple cards
     * @param {number} count - Number of cards to draw
     * @returns {Array} - Array of drawn cards
     */
    drawCards(count) {
        const cards = [];
        for (let i = 0; i < count; i++) {
            const card = this.drawCard();
            if (card) {
                cards.push(card);
            } else {
                break; // No more cards
            }
        }
        return cards;
    }

    /**
     * Add a card to the discard pile
     * @param {Card} card - Card to discard
     */
    discard(card) {
        card.state = CARD_STATES.IN_DISCARD;
        this.discardPile.push(card);
        // Log discard to UI if available
        try {
            if (window && window.game && window.game.ui && typeof window.game.ui.addLogMessage === 'function') {
                const label = (card && card.value) ? `${card.value}${card.suit ? ' of ' + card.suit : ''}` : 'Unknown card';
                window.game.ui.addLogMessage(`${label} was sent to the discard pile`);
            }
        } catch (e) {
            // ignore logging errors
        }
    }

    /**
     * Add multiple cards to discard pile
     * @param {Array} cards - Cards to discard
     */
    discardMultiple(cards) {
        for (const card of cards) {
            this.discard(card);
        }
    }

    /**
     * Return all discards to the deck and shuffle
     */
    returnDiscardsToDeck() {
        // Add all discards back to deck
        this.cards = this.cards.concat(this.discardPile);
        this.discardPile = [];
        
        // Update card states
        for (const card of this.cards) {
            card.state = CARD_STATES.IN_DECK;
        }
        
        // Shuffle the deck
        this.shuffle();
    }

    /**
     * Reset the deck for joker effect
     */
    resetForJoker() {
        // Return all discards to deck and shuffle
        this.returnDiscardsToDeck();
    }

    /**
     * Remove a card from the game
     * @param {Card} card - Card to remove
     */
    removeFromGame(card) {
        // Find card and remove from deck or discard
        card.state = CARD_STATES.REMOVED;
        
        // Remove from deck if there
        const deckIndex = this.cards.findIndex(c => c.id === card.id);
        if (deckIndex !== -1) {
            this.cards.splice(deckIndex, 1);
            return;
        }
        
        // Remove from discard if there
        const discardIndex = this.discardPile.findIndex(c => c.id === card.id);
        if (discardIndex !== -1) {
            this.discardPile.splice(discardIndex, 1);
        }
    }

    /**
     * Get the count of cards remaining in the deck
     * @returns {number} - Cards in deck
     */
    getDeckCount() {
        return this.cards.length;
    }

    /**
     * Get the count of cards in the discard pile
     * @returns {number} - Cards in discard
     */
    getDiscardCount() {
        return this.discardPile.length;
    }
}