/**
 * Card class representing a playing card
 */
class Card {
    /**
     * Create a card
     * @param {string} suit - Card suit
     * @param {string} value - Card value
     */
    constructor(suit, value) {
        this.id = generateId();
        this.suit = suit;
        this.value = value;
        this.state = CARD_STATES.IN_DECK;
        this.faceUp = false;
        this.isFusion = false;
        this.fusionCards = [];
        this.fusionStrength = 0;
        this.disabled = false;
        this.active = false; // For traps
        this.attackedThisTurn = false;
        this.justPlaced = false;
        this.kingWeakened = false; // Temporary flag set by King trap until end of battle
    }

    /**
     * Create a fusion card
     * @param {Card} card1 - First card in fusion
     * @param {Card} card2 - Second card in fusion
     * @returns {Card} - Fusion card
     */
    static createFusion(card1, card2) {
        // Use higher value card's suit and value for the fusion card
        const value1 = getCardNumericValue(card1.value);
        const value2 = getCardNumericValue(card2.value);
        
        const higherValueCard = value1 > value2 ? card1 : card2;
        const lowerValueCard = value1 > value2 ? card2 : card1;
        
        const fusion = new Card(higherValueCard.suit, higherValueCard.value);
        fusion.isFusion = true;
        fusion.fusionCards = [higherValueCard, lowerValueCard];
        fusion.fusionStrength = value1 + value2;
        fusion.faceUp = true;
        fusion.state = CARD_STATES.ON_FIELD;
        
        return fusion;
    }

    /**
     * Get the card HTML element
     * @param {boolean} inHand - Whether card is in hand
     * @returns {HTMLElement} - Card element
     */
    getElement(inHand = false) {
        const cardElement = document.createElement('div');
        cardElement.classList.add('card');
        cardElement.dataset.cardId = this.id;
        
        // Add card type class
        if (this.isFusion) {
            cardElement.classList.add('fusion');
        } else {
            const cardType = getCardType(this.value);
            cardElement.classList.add(cardType);
        }
        
        // Set face up/down
        if (!this.faceUp) {
            cardElement.classList.add('face-down');
            return cardElement;
        }
        
        // Add card value
        const valueElement = document.createElement('div');
        valueElement.classList.add('card-value');
        valueElement.classList.add(this.getSuitColor());
        valueElement.textContent = this.value;
        cardElement.appendChild(valueElement);
        
        // Add card type label
        const typeElement = document.createElement('div');
        typeElement.classList.add('card-type');
        
        if (this.isFusion) {
            typeElement.textContent = 'Fusion';
        } else {
            const cardType = getCardType(this.value);
            if (cardType === CARD_TYPES.MONSTER_NORMAL) {
                typeElement.textContent = 'Monster';
            } else if (cardType === CARD_TYPES.MONSTER_BIG) {
                typeElement.textContent = 'Big Monster';
            } else if (cardType === CARD_TYPES.TRAP) {
                typeElement.textContent = getTrapName(this.value);
            } else {
                typeElement.textContent = 'Joker';
            }
        }
        cardElement.appendChild(typeElement);
        
        // Add card content (suit symbol)
        const contentElement = document.createElement('div');
        contentElement.classList.add('card-content');
        contentElement.classList.add(this.getSuitColor());
        contentElement.textContent = this.getSuitSymbol();
        cardElement.appendChild(contentElement);
        
        // Compute and render strength (fusion or monster). If King weakened, apply halved value
        if (isMonsterCard(this) && !inHand) {
            const baseStrength = this.isFusion ? this.fusionStrength : getCardNumericValue(this.value);
            const displayStrength = this.kingWeakened ? applyKingEffect(baseStrength) : baseStrength;

            const strengthElement = document.createElement('div');
            strengthElement.classList.add(this.isFusion ? 'fusion-value' : 'monster-strength');
            strengthElement.textContent = this.isFusion ? `STR: ${displayStrength}` : displayStrength;
            cardElement.appendChild(strengthElement);

            if (this.kingWeakened) {
                // add visual marker
                cardElement.classList.add('weakened');
            }
        }
        
        // Add disabled class if needed
        if (this.disabled) {
            cardElement.classList.add('disabled');
        }

        // Trap specific visuals: only show when rendered on-field (not in hand)
        const cardType = getCardType(this.value);
        if (!inHand && cardType === CARD_TYPES.TRAP) {
            if (this.active) {
                cardElement.classList.add('trap-active');
            } else {
                cardElement.classList.add('trap-disabled');
            }

            // Add a small status badge
            const statusBadge = document.createElement('div');
            statusBadge.classList.add('trap-status-badge');
            statusBadge.textContent = this.active ? 'Active' : 'Disabled';
            cardElement.appendChild(statusBadge);
        }
        
        return cardElement;
    }

    /**
     * Get suit color
     * @returns {string} - CSS class for suit color
     */
    getSuitColor() {
        if (this.suit === CARD_SUITS.HEARTS || this.suit === CARD_SUITS.DIAMONDS) {
            return 'red';
        }
        return 'black';
    }

    /**
     * Get suit symbol
     * @returns {string} - Symbol for the suit
     */
    getSuitSymbol() {
        switch(this.suit) {
            case CARD_SUITS.HEARTS:
                return '♥';
            case CARD_SUITS.DIAMONDS:
                return '♦';
            case CARD_SUITS.CLUBS:
                return '♣';
            case CARD_SUITS.SPADES:
                return '♠';
            case CARD_SUITS.JOKER:
                return '★';
            default:
                return '';
        }
    }

    /**
     * Flip card face up
     */
    flipFaceUp() {
        this.faceUp = true;
    }

    /**
     * Flip card face down
     */
    flipFaceDown() {
        this.faceUp = false;
    }

    /**
     * Check if card can attack
     * @returns {boolean} - Whether card can attack
     */
    canAttack() {
        if (this.attackedThisTurn) return false;
        if (!isMonsterCard(this)) return false;
        return true;
    }

    /**
     * Reset card for a new turn
     */
    resetForNewTurn() {
        this.attackedThisTurn = false;
        
        // Active traps remain active
        if (this.state === CARD_STATES.ON_FIELD && getCardType(this.value) === CARD_TYPES.TRAP) {
            this.active = true;
        }
        
        this.justPlaced = false;
    }

    /**
     * Clone the card
     * @returns {Card} - Cloned card
     */
    clone() {
        const clone = new Card(this.suit, this.value);
        clone.id = this.id;
        clone.state = this.state;
        clone.faceUp = this.faceUp;
        clone.isFusion = this.isFusion;
        clone.fusionCards = this.fusionCards.map(card => card.clone());
        clone.fusionStrength = this.fusionStrength;
        clone.disabled = this.disabled;
        clone.active = this.active;
        clone.attackedThisTurn = this.attackedThisTurn;
        clone.justPlaced = this.justPlaced;
        return clone;
    }
}